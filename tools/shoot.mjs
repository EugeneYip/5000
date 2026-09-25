#!/usr/bin/env node
/**
 * Screenshot harness.
 *
 * Boots the app in headless Chromium with a real GPU-backed WebGL2 context,
 * waits for the scene to report itself ready, drives the camera to a named
 * pose via the debug API the app exposes on `window.__AUDI`, and writes PNGs.
 *
 * This is what the review agents look at. It has to be honest: same renderer,
 * same materials, same post chain as the shipped page.
 *
 *   node tools/shoot.mjs                          # every standard view
 *   node tools/shoot.mjs --views=front3q,side     # a subset
 *   node tools/shoot.mjs --out=renders/round3     # where to write
 *   node tools/shoot.mjs --w=2560 --h=1440        # resolution
 *   node tools/shoot.mjs --env=dusk --nolabel     # environment preset
 *
 * Exit code is non-zero if the page threw, so a loop can detect breakage.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Grab a port the OS says is free. Several work streams run this at once. */
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

// --- args -------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const WIDTH = Number(args.w ?? 1920);
const HEIGHT = Number(args.h ?? 1080);
const OUT = resolve(ROOT, String(args.out ?? 'renders/latest'));
const ENV = String(args.env ?? '');
const PORT = Number(args.port ?? (await freePort()));

/**
 * Standard review views. Orthographic-ish long-lens poses are deliberate:
 * a 24 mm wide angle flatters bad proportions, an 85 mm exposes them.
 */
const VIEWS = {
  front3q:   { desc: 'front three-quarter, the money shot' },
  rear3q:    { desc: 'rear three-quarter' },
  side:      { desc: 'dead-on side profile, 200 mm lens — proportion check' },
  front:     { desc: 'dead-on front, 200 mm — symmetry and face' },
  rear:      { desc: 'dead-on rear, 200 mm' },
  top:       { desc: 'plan view' },
  wheel:     { desc: 'front wheel + arch close-up' },
  headlight: { desc: 'headlamp and grille close-up' },
  taillight: { desc: 'taillamp close-up' },
  interior:  { desc: 'cabin from the driver door' },
  dash:      { desc: 'instrument panel' },
  roofrail:  { desc: 'roof rail and D-pillar — the Avant signature' },
  badge:     { desc: 'rear badging close-up' },
  platecam:  { desc: 'licence plate, legibility check' },
  photomatch:{ desc: 'matches the original 1988 photograph pose exactly' },
};

const wanted = args.views
  ? String(args.views).split(',').map((s) => s.trim()).filter(Boolean)
  : Object.keys(VIEWS);

// --- serve ------------------------------------------------------------------
function startServer() {
  return new Promise((res, rej) => {
    const dist = resolve(ROOT, 'dist');
    const useDist = existsSync(dist) && args.dist;
    const cmd = useDist
      ? ['npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1']]
      : ['npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1']];

    const p = spawn(cmd[0], cmd[1], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };

    p.stdout.on('data', (d) => {
      const s = d.toString();
      if (/localhost:|127\.0\.0\.1:/.test(s)) setTimeout(() => done(res, p), 700);
    });
    p.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
    p.on('exit', (c) => done(rej, new Error(`vite exited ${c}`)));
    setTimeout(() => done(res, p), 9000);
  });
}

// --- main -------------------------------------------------------------------
const server = await startServer();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--disable-frame-rate-limit',
    '--force-color-profile=srgb',
    '--disable-lcd-text',
    '--hide-scrollbars',
  ],
});

const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
});

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
  if (process.env.VERBOSE) console.log(`  [page:${m.type()}] ${m.text()}`);
});

console.log(`→ loading http://127.0.0.1:${PORT}/ at ${WIDTH}×${HEIGHT}`);
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60_000 });

// Wait for the app to announce it has finished building the car and warming
// shaders. The app sets window.__AUDI.ready = true when the first frame with
// everything present has been presented.
try {
  await page.waitForFunction(() => globalThis.__AUDI?.ready === true, null, { timeout: 120_000 });
} catch {
  errors.push('TIMEOUT: window.__AUDI.ready never became true');
}

if (ENV) {
  await page.evaluate((e) => globalThis.__AUDI?.setEnvironment?.(e), ENV);
  await page.waitForTimeout(900);
}
if (args.nolabel) await page.evaluate(() => globalThis.__AUDI?.setUiVisible?.(false));

const results = [];
for (const name of wanted) {
  if (!VIEWS[name]) { console.warn(`  ? unknown view "${name}", skipping`); continue; }

  const ok = await page.evaluate((n) => globalThis.__AUDI?.setView?.(n) ?? false, name);
  if (!ok) { console.warn(`  ! view "${name}" not implemented by the app yet`); }

  // Let TAA/accumulation settle — a noisy frame is not a fair review.
  await page.evaluate(() => globalThis.__AUDI?.settle?.(24));
  await page.waitForTimeout(650);

  const file = resolve(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  results.push({ name, file, desc: VIEWS[name].desc });
  console.log(`  ✓ ${name.padEnd(11)} ${VIEWS[name].desc}`);
}

// Perf probe — AAA means it also has to run.
const perf = await page.evaluate(async () => {
  const a = globalThis.__AUDI;
  if (!a?.measureFps) return null;
  return a.measureFps(120);
});
if (perf) console.log(`\n  fps: ${perf.fps?.toFixed?.(1)} (frame ${perf.ms?.toFixed?.(2)} ms)  draws:${perf.drawCalls} tris:${perf.triangles}`);

await browser.close();
server.kill('SIGTERM');

if (errors.length) {
  console.error(`\n✗ ${errors.length} page error(s):`);
  for (const e of [...new Set(errors)].slice(0, 25)) console.error(`   ${e}`);
  console.error(`\nScreenshots written to ${OUT} but the page is not clean.`);
  process.exit(1);
}
console.log(`\n✓ ${results.length} view(s) → ${OUT}`);

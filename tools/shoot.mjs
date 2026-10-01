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
 *   node tools/shoot.mjs --mask                   # also write <view>_{mask,paint}.png
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
 * Where the served app lives. `vite` in dev serves at the root; a `--dist`
 * preview has to be served at the base the bundle was built with.
 *
 * `--dist` is the right way to measure while other streams are editing: a
 * preview serves a snapshot and does not hot-reload when someone else saves,
 * so the scene cannot change under a run. It does not help against a tree
 * that is broken, since `tsc` passes and the build succeeds either way.
 */
const BASE = args.dist ? '/5000/' : '/';

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

// Views that also get a silhouette companion frame. `photomatch` always does:
// it is the frame every colour and tone gate is read from.
const MASK = new Set(
  args.mask === true ? wantedAll() : args.mask ? String(args.mask).split(',') : ['photomatch'],
);
function wantedAll() {
  return args.views ? String(args.views).split(',').map((s) => s.trim()) : Object.keys(VIEWS);
}

const wanted = args.views
  ? String(args.views).split(',').map((s) => s.trim()).filter(Boolean)
  : Object.keys(VIEWS);

// --- serve ------------------------------------------------------------------
function startServer() {
  return new Promise((res, rej) => {
    const dist = resolve(ROOT, 'dist');
    const useDist = existsSync(dist) && args.dist;
    // `--dist` could not work at all before this. `vite.config.ts` bakes
    // `base: '/5000/'` on the BUILD branch (the project deploys to a GitHub
    // Pages subpath) but `vite preview` reads base from the SERVE branch, `/`,
    // so every asset in the built bundle 404'd and `__AUDI.ready` never
    // arrived — a 120-second silent timeout with no explanation. Serve the
    // built bundle at the base it was built for, and visit that path.
    const cmd = useDist
      ? ['npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--base', BASE]]
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


/**
 * Call into `window.__AUDI`, and **fail loudly if it is not there**.
 *
 * Every call here used to be optional-chained — `__AUDI?.setView?.(n)` — so
 * when the debug surface was missing the harness silently no-opped and shot
 * whatever happened to be on screen. That is not hypothetical: the dev server
 * issues a full reload of its own shortly after first load, which destroys
 * `__AUDI` and returns the rig to `front3q` with the HUD up. A silhouette
 * frame taken in that window is a `front3q` frame with no silhouette in it,
 * and every per-car figure read from it would be wrong without anything in
 * the output saying so.
 *
 * So: wait for `ready` again on each call, and throw if the method is absent.
 * A harness that measures must not be able to quietly measure nothing.
 */
/**
 * Wait for the app to report itself ready — but **fail the instant the page
 * throws**, and say what it threw.
 *
 * This used to be a bare 120-second `waitForFunction`, so a page that died on
 * load produced two minutes of silence and then `TimeoutError`, with the
 * actual cause sitting in the console log the whole time. It cost three runs
 * and a hand-written probe to find a one-line answer that was available in two
 * seconds. A harness that watches a page has no business discarding the page's
 * own account of why it failed.
 */
async function waitReady(page, errors, timeout = 120_000) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => {
      if (globalThis.__AUDI?.ready !== true) return false;
      // **The loading overlay must also be gone, not merely `ready`.**
      //
      // `#boot` is hidden by adding `.done`, which is a 0.7 s opacity and
      // visibility transition on a 0.15 s delay — so there is a ~0.85 s
      // window where `__AUDI.ready` is true and the splash screen is still
      // composited over the canvas. Any source edit during a run sends vite
      // into a reload and drops the harness straight into that window: a
      // stream got `rc=0` and "✓ 4 view(s)" with two of them **captured as
      // the splash screen**, 99.9 % of pixels different by more than two
      // levels. `withReload` cannot catch it, because `__AUDI` is recreated
      // and `setView`/`settle` both succeed against a live scene that simply
      // is not the thing being photographed.
      //
      // This is the same species as the bug `drive()` was added for — a
      // harness reporting success for a frame that contains nothing it was
      // asked to measure — so it belongs in the readiness condition rather
      // than in a check someone has to remember to call.
      const boot = document.getElementById('boot');
      if (boot && getComputedStyle(boot).visibility !== 'hidden') return false;
      return true;
    }).catch(() => false);
    if (ok) return;
    if (errors.length) {
      throw new Error(
        'the page threw before it was ready — this is the cause, not a timeout:\n   '
        + [...new Set(errors)].slice(0, 4).join('\n   '),
      );
    }
    if (Date.now() - t0 > timeout) {
      throw new Error(
        'TIMEOUT: the page never became ready — either __AUDI.ready stayed false '
        + 'or the #boot overlay never finished hiding — and the page reported no error',
      );
    }
    await page.waitForTimeout(250);
  }
}

class ReloadError extends Error {}

async function drive(page, name, fn, arg) {
  await page.waitForFunction(() => globalThis.__AUDI?.ready === true, null, { timeout: 30_000 })
    .catch(() => { throw new ReloadError(`__AUDI vanished before ${name}`); });
  const r = await page.evaluate(fn, arg).catch((e) => {
    // A reload mid-call tears down the execution context rather than returning.
    if (/__AUDI|Execution context was destroyed|Target closed|detached/i.test(String(e))) {
      throw new ReloadError(`__AUDI vanished during ${name}`);
    }
    throw e;
  });
  if (r === '__MISSING__') throw new Error(`__AUDI.${name} is not a function`);
  return r;
}

/**
 * Re-do a whole view if the dev server reloaded part-way through it.
 *
 * Throwing on a vanished `__AUDI` was the right fix for silently shooting the
 * wrong thing, but it is not enough on its own. **With several work streams
 * editing the same tree, every file any of them saves triggers an HMR reload**,
 * so a shoot that takes thirty seconds across sixteen views will lose one —
 * and losing one is fatal, because the throw abandons the whole run. Three
 * streams in a row reported not being able to get a single clean before/after
 * pair, and one came back with a `photomatch_mask.png` containing 0 % car.
 *
 * A reload is not a failure of the thing being measured, so retry it. What
 * must NOT happen is quietly keeping a frame shot across the reload, which is
 * why the retry restarts from `setView` and re-takes every frame of the view,
 * masks included, rather than resuming mid-way.
 *
 * If you need to measure through heavy concurrency, prefer `--dist` with a
 * fresh `npm run build`: `vite preview` serves a snapshot and does not reload
 * when someone else saves, so the scene cannot change under the run at all.
 */
async function withReload(page, label, fn, attempts = 4) {  // eslint-disable-line no-use-before-define
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ReloadError) || i >= attempts) throw e;
      console.warn(`  ↻ ${label}: ${e.message} — dev server reloaded, retry ${i}/${attempts - 1}`);
      await waitReady(page, errors);
      await page.waitForTimeout(1500);
    }
  }
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

console.log(`→ loading http://127.0.0.1:${PORT}${BASE} at ${WIDTH}×${HEIGHT}`);
await page.goto(`http://127.0.0.1:${PORT}${BASE}`, { waitUntil: 'load', timeout: 60_000 });

// Wait for the app to announce it has finished building the car and warming
// shaders. The app sets window.__AUDI.ready = true when the first frame with
// everything present has been presented.
try {
  await waitReady(page, errors);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  await browser.close();
  server.kill('SIGTERM');
  process.exit(1);
}

if (ENV) {
  await drive(page, 'setEnvironment', (e) => globalThis.__AUDI.setEnvironment ? (globalThis.__AUDI.setEnvironment(e), true) : '__MISSING__', ENV);
  await page.waitForTimeout(900);
}
if (args.nolabel) await drive(page, 'setUiVisible', () => globalThis.__AUDI.setUiVisible ? (globalThis.__AUDI.setUiVisible(false), true) : '__MISSING__');

const results = [];
for (const name of wanted) {
  if (!VIEWS[name]) { console.warn(`  ? unknown view "${name}", skipping`); continue; }

  const file = resolve(OUT, `${name}.png`);
  await withReload(page, name, async () => {
    const ok = await drive(page, 'setView', (n) => globalThis.__AUDI.setView ? globalThis.__AUDI.setView(n) : '__MISSING__', name);
    if (!ok) { console.warn(`  ! view "${name}" not implemented by the app yet`); }

    // Let TAA/accumulation settle — a noisy frame is not a fair review.
    await drive(page, 'settle', () => globalThis.__AUDI.settle ? (globalThis.__AUDI.settle(24), true) : '__MISSING__');
    await page.waitForTimeout(650);

    await page.screenshot({ path: file, type: 'png', timeout: 120_000 });

    // Silhouette companion. `sheet.py` reads the car mask straight off it, which
    // is the only way its per-car readings mean what they say — see
    // `setMaskMode` in main.ts.
    if (MASK.has(name)) {
      for (const [mode, suffix] of [['car', 'mask'], ['paint', 'paint']]) {
        await drive(page, 'setMaskMode', (m) => globalThis.__AUDI.setMaskMode ? (globalThis.__AUDI.setMaskMode(m), true) : '__MISSING__', mode);
        await drive(page, 'settle', () => globalThis.__AUDI.settle ? (globalThis.__AUDI.settle(8), true) : '__MISSING__');
        await page.waitForTimeout(350);
        await page.screenshot({ path: resolve(OUT, `${name}_${suffix}.png`), type: 'png', timeout: 120_000 });
      }
      await drive(page, 'setMaskMode', () => globalThis.__AUDI.setMaskMode ? (globalThis.__AUDI.setMaskMode('off'), true) : '__MISSING__');
      await drive(page, 'settle', () => globalThis.__AUDI.settle ? (globalThis.__AUDI.settle(24), true) : '__MISSING__');
      await page.waitForTimeout(450);
    }
  });
  results.push({ name, file, desc: VIEWS[name].desc });
  console.log(`  ✓ ${name.padEnd(11)} ${VIEWS[name].desc}`);
}

/**
 * Perf probe — AAA means it also has to run.
 *
 * **Measured from a fixed pose, and the pose is named in the output.**
 *
 * This used to run from whatever view happened to be shot last, and the draw
 * count depends entirely on that: frustum culling at a close-up drops most of
 * the scene. Same commit, same code, differing only in the last view —
 *
 *     last = photomatch    draws 567   tris 2,030,328
 *     last = wheel         draws 270   tris 1,416,667
 *
 * — which is a 2× swing in the headline performance figure with nothing
 * changed. I read exactly that pair as "draw calls halved, a third of the
 * triangles gone" and committed it as a verified isolation (`bfd6f10`). It was
 * an artefact of comparing a three-view run ending on `wheel` against a
 * one-view run ending on `photomatch`.
 *
 * So the probe now drives to `photomatch` first — the pose every other gate is
 * read from — and prints `@photomatch` beside the numbers, because a
 * performance figure without its pose attached is not a figure.
 */
const PERF_POSE = 'photomatch';
let perf = null;
try {
  await withReload(page, `perf@${PERF_POSE}`, async () => {
    await drive(page, 'setView', (n) => globalThis.__AUDI.setView ? globalThis.__AUDI.setView(n) : '__MISSING__', PERF_POSE);
    await drive(page, 'settle', () => globalThis.__AUDI.settle ? (globalThis.__AUDI.settle(24), true) : '__MISSING__');
    await page.waitForTimeout(400);
    perf = await page.evaluate(async () => {
      const a = globalThis.__AUDI;
      if (!a?.measureFps) return null;
      return a.measureFps(120);
    });
  });
} catch (e) {
  console.warn(`  ! perf probe skipped: ${e.message}`);
}
if (perf) {
  console.log(`\n  fps: ${perf.fps?.toFixed?.(1)} (frame ${perf.ms?.toFixed?.(2)} ms)`
    + `  draws:${perf.drawCalls} tris:${perf.triangles}  @${PERF_POSE}`);
  console.log(`  (renderer.info, inflated by the pass count — use __AUDI.census() for real geometry)`);
}

await browser.close();
server.kill('SIGTERM');

if (errors.length) {
  console.error(`\n✗ ${errors.length} page error(s):`);
  for (const e of [...new Set(errors)].slice(0, 25)) console.error(`   ${e}`);
  console.error(`\nScreenshots written to ${OUT} but the page is not clean.`);
  process.exit(1);
}
console.log(`\n✓ ${results.length} view(s) → ${OUT}`);

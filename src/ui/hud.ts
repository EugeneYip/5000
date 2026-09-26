/**
 * The readout and the control panel.
 *
 * The brief for this surface is restraint. It sits in front of a car that took
 * a great deal of effort to look like a photograph, and the fastest way to
 * undo that is to put a racing game on top of it. So: one small instrument
 * cluster bottom-left, one 34 px button top-right, and nothing else until the
 * visitor asks for it. Everything else — cameras, paint, environment, every
 * panel on the car — lives behind that button, laid out the way a
 * configurator lays things out rather than the way a telemetry overlay does.
 *
 * Hairlines, tabular numerals, no fill that is not doing work, and the only
 * saturated colour anywhere is the red of the tachometer's warning band and
 * the tell-tales, which is exactly where a real car puts its colour too.
 *
 * `setVisible(false)` has to clear **every** pixel the UI stream draws,
 * including the touch driving controls that `input.ts` mounted before this
 * module existed — the screenshot harness calls it and a single stray element
 * contaminates a review render. That is what `ui/visibility` is for, and why
 * this goes through it rather than just hiding its own root.
 */

import * as THREE from 'three';
import { ENGINE, PAINT } from '@/spec';
import type { VehicleState, ViewName } from '@/types';
import { ensureStyles } from './styles';
import { onUiVisibility, setUiVisible } from './visibility';
import { activeInput, latestControls } from './input';
import { activeAudio } from '@/audio/EngineAudio';

export interface Hud {
  update(state: VehicleState, stats: { fps: number; drawCalls: number; triangles: number }): void;
  setVisible(v: boolean): void;
}

const HINT_KEY = 'audi5000.hintSeen';

const MS_TO_MPH = 2.2369363;

/** Tachometer sweep: 0 at 7 o'clock, full scale at 5 o'clock. */
const DIAL_START = -135;
const DIAL_SWEEP = 270;
const DIAL_MAX = 7000;

const VIEWS: Array<[ViewName, string]> = [
  ['front3q', 'Front ¾'],
  ['side', 'Side'],
  ['rear3q', 'Rear ¾'],
  ['front', 'Front'],
  ['top', 'Plan'],
  ['rear', 'Rear'],
  ['interior', 'Interior'],
  ['dash', 'Dash'],
  ['wheel', 'Wheel'],
  ['chase', 'Chase'],
  ['hood', 'Bonnet'],
  ['orbit', 'Orbit'],
];

const ENVIRONMENTS: Array<[string, string]> = [
  ['goldenhour', 'Golden hour'],
  ['noon', 'Noon'],
  ['overcast', 'Overcast'],
  ['studio', 'Studio'],
  ['dusk', 'Dusk'],
];

/**
 * A period C3 colour chart. Only the first is measured — it is `PAINT`, derived
 * from the reference photograph in `docs/REFERENCE-PHOTO.md`. The rest are
 * plausible values for catalogue names offered on this car, not sampled ones.
 */
const PAINTS: Array<{ name: string; hex: number; swatch: string }> = [
  { name: 'Graphite Metallic', hex: PAINT.baseColor, swatch: '#7e838b' },
  { name: 'Zermatt Silver', hex: 0x9aa0a6, swatch: '#b2b7bc' },
  { name: 'Alpine White', hex: 0xe6e7e3, swatch: '#eceded' },
  { name: 'Cashmere Beige', hex: 0xc3b394, swatch: '#cfc0a4' },
  { name: 'Tornado Red', hex: 0x9e1a24, swatch: '#b12630' },
  { name: 'Lago Blue', hex: 0x2c4463, swatch: '#365172' },
  { name: 'Malachite Green', hex: 0x2f4a3e, swatch: '#3a5749' },
  { name: 'Panther Black', hex: 0x121316, swatch: '#1b1d21' },
];

interface Group { label: string; cols: 3 | 4; items: Array<[string, string]>; }

const ARTICULATIONS: Group[] = [
  { label: 'Openings', cols: 3, items: [['hood', 'Bonnet'], ['tailgate', 'Tailgate'], ['cargoCover', 'Cargo blind']] },
  { label: 'Doors', cols: 4, items: [['doorFL', 'FL'], ['doorFR', 'FR'], ['doorRL', 'RL'], ['doorRR', 'RR']] },
  { label: 'Windows', cols: 4, items: [['windowFL', 'FL'], ['windowFR', 'FR'], ['windowRL', 'RL'], ['windowRR', 'RR']] },
  { label: 'Cabin', cols: 3, items: [['wipers', 'Wipers'], ['rearSeat60', 'Seat 60'], ['rearSeat40', 'Seat 40']] },
];

// --- small builders ----------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, html?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x0, y0] = polar(50, 50, r, fromDeg);
  const [x1, y1] = polar(50, 50, r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function rpmAngle(rpm: number): number {
  return DIAL_START + DIAL_SWEEP * THREE.MathUtils.clamp(rpm / DIAL_MAX, 0, 1);
}

/** The dial face: ticks, numerals and the red band. Static, so built once. */
function tachSvg(): string {
  const parts: string[] = [];
  parts.push(`<circle class="face" cx="50" cy="50" r="42" />`);
  for (let rpm = 0; rpm <= DIAL_MAX; rpm += 500) {
    const major = rpm % 1000 === 0;
    const a = rpmAngle(rpm);
    const [x0, y0] = polar(50, 50, major ? 30 : 34, a);
    const [x1, y1] = polar(50, 50, 38, a);
    parts.push(
      `<line class="tick${major ? ' major' : ''}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" />`,
    );
  }
  for (const rpm of [0, 2000, 4000, 6000]) {
    const [x, y] = polar(50, 50, 22, rpmAngle(rpm));
    parts.push(`<text x="${x.toFixed(1)}" y="${(y + 2.6).toFixed(1)}" text-anchor="middle">${rpm / 1000}</text>`);
  }
  // The band starts at the cluster's own red line, not at the limiter.
  parts.push(`<path class="band" d="${arcPath(40.5, rpmAngle(ENGINE.redlineRpm), rpmAngle(DIAL_MAX))}" />`);
  parts.push(`<path class="sweep" d="" />`);
  parts.push(`<line class="needle" x1="50" y1="50" x2="50" y2="16" />`);
  parts.push(`<circle class="hub" cx="50" cy="50" r="2.6" />`);
  return `<svg class="audi-tach" viewBox="0 0 100 100" aria-hidden="true">${parts.join('')}</svg>`;
}

/** Tell-tale glyphs, drawn rather than typed — no icon font ships. */
const TELLS: Record<string, string> = {
  beam: '<svg viewBox="0 0 24 24"><path d="M3 6h6a6 6 0 0 1 0 12H3a9 9 0 0 0 0-12z"/><path d="M13 7.5h7v1.2h-7zM13 11.4h8v1.2h-8zM13 15.3h7v1.2h-7z"/></svg>',
  high: '<svg viewBox="0 0 24 24"><path d="M3 6h6a6 6 0 0 1 0 12H3a9 9 0 0 0 0-12z"/><path d="M13 8h8v1.2h-8zM13 11.4h8v1.2h-8zM13 14.8h8v1.2h-8z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M14 4 4 12l10 8v-5h6V9h-6z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M10 4l10 8-10 8v-5H4V9h6z"/></svg>',
  // The circled exclamation every car uses for the parking brake.
  hand: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.2a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6z"/><path d="M10.9 6.6h2.2l-0.35 7.2h-1.5zM12 15.6a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7z"/></svg>',
  fog: '<svg viewBox="0 0 24 24"><path d="M3 6h6a6 6 0 0 1 0 12H3a9 9 0 0 0 0-12z"/><path d="M12.5 8.4l7 3.4-.5 1.1-7-3.4zM12.5 12.1l7 3.4-.5 1.1-7-3.4z"/></svg>',
};

// -----------------------------------------------------------------------------

export function createHud(container: HTMLElement): Hud {
  ensureStyles();

  const root = el('div', 'audi-ui');
  root.setAttribute('aria-label', 'Vehicle readout and controls');

  // --- cluster ---------------------------------------------------------------
  const cluster = el('div', 'audi-cluster');
  cluster.innerHTML = `
    ${tachSvg()}
    <div class="audi-readout">
      <div class="audi-speed"><b>0</b><span>MPH</span></div>
      <div class="audi-sub">
        <span class="k">RPM</span><span class="v" data-f="rpm">0</span>
        <span class="k">GEAR</span><span class="v audi-gear" data-f="gear">N</span>
      </div>
      <div class="audi-tells"></div>
    </div>`;
  const needle = cluster.querySelector<SVGLineElement>('.needle')!;
  const sweep = cluster.querySelector<SVGPathElement>('.sweep')!;
  const speedEl = cluster.querySelector<HTMLElement>('.audi-speed b')!;
  const rpmEl = cluster.querySelector<HTMLElement>('[data-f="rpm"]')!;
  const gearEl = cluster.querySelector<HTMLElement>('[data-f="gear"]')!;

  const tellRow = cluster.querySelector<HTMLElement>('.audi-tells')!;
  const tells: Record<string, HTMLElement> = {};
  for (const [key, cls, title] of [
    ['left', 'ind', 'Left indicator'], ['beam', 'beam', 'Headlamps'], ['high', 'beam', 'Main beam'],
    ['fog', 'fog', 'Fog lamps'], ['hand', 'hand', 'Handbrake'], ['right', 'ind', 'Right indicator'],
  ] as const) {
    const t = el('div', `audi-tell ${cls}`, TELLS[key]);
    t.title = title;
    tellRow.appendChild(t);
    tells[key] = t;
  }
  root.appendChild(cluster);

  // --- panel trigger ---------------------------------------------------------
  const trigger = el('button', 'audi-trigger pe', '<i></i><i></i><i></i>');
  trigger.setAttribute('aria-label', 'Open controls');
  trigger.setAttribute('aria-expanded', 'false');
  root.appendChild(trigger);

  // --- panel -----------------------------------------------------------------
  const panel = el('div', 'audi-panel pe');
  panel.hidden = true;
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Controls');
  panel.innerHTML = `
    <header><span class="t">Audi 5000 S Wagon</span><button class="audi-close" aria-label="Close controls">×</button></header>
    <div class="audi-scroll"></div>`;
  const scroll = panel.querySelector<HTMLElement>('.audi-scroll')!;

  const section = (label: string): HTMLElement => {
    const s = el('div', 'audi-sect');
    s.appendChild(el('span', 'audi-label', label));
    scroll.appendChild(s);
    return s;
  };

  const chip = (text: string, title?: string): HTMLButtonElement => {
    const b = el('button', 'audi-chip', text);
    b.type = 'button';
    if (title) b.title = title;
    return b;
  };

  // Camera ---------------------------------------------------------------------
  const camSect = section('Camera');
  const camGrid = el('div', 'audi-grid');
  const camChips = new Map<ViewName, HTMLButtonElement>();
  let currentView: ViewName = 'front3q';
  for (const [name, label] of VIEWS) {
    const b = chip(label);
    b.addEventListener('click', () => {
      globalThis.__AUDI?.setView?.(name);
      currentView = name;
      for (const [k, c] of camChips) c.setAttribute('aria-pressed', String(k === name));
    });
    camChips.set(name, b);
    camGrid.appendChild(b);
  }
  camChips.get('front3q')?.setAttribute('aria-pressed', 'true');
  camSect.appendChild(camGrid);

  // Paint ----------------------------------------------------------------------
  const paintSect = section('Paint');
  const swatchRow = el('div', 'audi-swatches');
  const paintName = el('div', 'audi-swatch-name', PAINTS[0].name);
  const swatches: HTMLButtonElement[] = [];
  for (const p of PAINTS) {
    const b = el('button', 'audi-swatch');
    b.type = 'button';
    b.style.background = p.swatch;
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    b.addEventListener('click', () => {
      globalThis.__AUDI?.setPaint?.(p.hex);
      paintName.textContent = p.name;
      for (const s of swatches) s.setAttribute('aria-pressed', String(s === b));
    });
    // Hovering a colour chart should tell you what you are looking at.
    b.addEventListener('pointerenter', () => { paintName.textContent = p.name; });
    swatches.push(b);
    swatchRow.appendChild(b);
  }
  swatches[0].setAttribute('aria-pressed', 'true');
  swatchRow.addEventListener('pointerleave', () => {
    const on = swatches.findIndex((s) => s.getAttribute('aria-pressed') === 'true');
    paintName.textContent = PAINTS[Math.max(0, on)].name;
  });
  paintSect.append(swatchRow, paintName);

  // Environment ----------------------------------------------------------------
  const envSect = section('Light');
  const envGrid = el('div', 'audi-grid');
  const envChips: HTMLButtonElement[] = [];
  for (const [name, label] of ENVIRONMENTS) {
    const b = chip(label);
    b.addEventListener('click', () => {
      globalThis.__AUDI?.setEnvironment?.(name);
      for (const c of envChips) c.setAttribute('aria-pressed', String(c === b));
    });
    envChips.push(b);
    envGrid.appendChild(b);
  }
  envChips[0].setAttribute('aria-pressed', 'true');
  envSect.appendChild(envGrid);

  // Articulation ---------------------------------------------------------------
  const artSect = section('Panels');
  const artState = new Map<string, boolean>();
  for (const group of ARTICULATIONS) {
    const sub = el('span', 'audi-label', group.label);
    sub.classList.add('sub');
    const grid = el('div', `audi-grid${group.cols === 4 ? ' four' : ''}`);
    for (const [name, label] of group.items) {
      const b = chip(label, name);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        const next = !artState.get(name);
        artState.set(name, next);
        globalThis.__AUDI?.setArticulation?.(name, next ? 1 : 0);
        b.setAttribute('aria-pressed', String(next));
      });
      grid.appendChild(b);
    }
    artSect.append(sub, grid);
  }

  // Audio ----------------------------------------------------------------------
  const audioSect = section('Sound');
  const muteRow = el('div', 'audi-row', '<span>Engine audio</span>');
  const muteSwitch = el('button', 'audi-switch');
  muteSwitch.type = 'button';
  muteSwitch.setAttribute('aria-label', 'Engine audio');
  const volRow = el('div', 'audi-row', '<span>Volume</span>');
  const vol = el('input', 'audi-slider');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.setAttribute('aria-label', 'Volume');

  const syncAudio = (): void => {
    const a = activeAudio();
    const on = a ? !a.muted : true;
    muteSwitch.setAttribute('aria-pressed', String(on));
    vol.value = String(Math.round((a?.volume ?? 0.85) * 100));
  };
  muteSwitch.addEventListener('click', () => {
    const a = activeAudio();
    if (!a) return;
    a.setMuted(!a.muted);
    syncAudio();
  });
  vol.addEventListener('input', () => {
    activeAudio()?.setVolume(Number(vol.value) / 100);
  });
  muteRow.appendChild(muteSwitch);
  volRow.appendChild(vol);
  audioSect.append(muteRow, volRow);

  // Debug ----------------------------------------------------------------------
  const dbgSect = section('Display');
  const dbgRow = el('div', 'audi-row', '<span>Statistics</span>');
  const dbgSwitch = el('button', 'audi-switch');
  dbgSwitch.type = 'button';
  dbgSwitch.setAttribute('aria-pressed', 'false');
  dbgSwitch.setAttribute('aria-label', 'Show statistics');
  dbgRow.appendChild(dbgSwitch);
  dbgSect.appendChild(dbgRow);

  root.appendChild(panel);

  // --- debug readout ----------------------------------------------------------
  const debug = el('div', 'audi-debug');
  debug.hidden = true;
  root.appendChild(debug);
  let showDebug = false;
  dbgSwitch.addEventListener('click', () => {
    showDebug = !showDebug;
    dbgSwitch.setAttribute('aria-pressed', String(showDebug));
    debug.hidden = !showDebug;
  });

  // --- first-run hint ---------------------------------------------------------
  let hint: HTMLElement | null = null;
  let hintSeen = false;
  try { hintSeen = localStorage.getItem(HINT_KEY) === '1'; } catch { /* private mode */ }
  if (!hintSeen) {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // `sep` is punctuation between keycaps, not a key: rendering "/" or "–" in
    // a keycap tells the reader to press a key that does not exist.
    const groups: Array<{ caps: string[]; sep?: string; what: string }> = coarse
      ? [{ caps: [], what: 'drag to orbit' }, { caps: [], what: 'pinch to zoom' }, { caps: [], what: 'pedals to drive' }]
      : [
          { caps: ['W', 'A', 'S', 'D'], what: 'drive' },
          { caps: ['Shift', 'Ctrl'], sep: '/', what: 'gears' },
          { caps: ['1', '6'], sep: '–', what: 'views' },
          { caps: [], what: 'drag to orbit' },
        ];
    hint = el('div', 'audi-hint pe');
    hint.innerHTML = groups
      .map(({ caps, sep, what }) => {
        const keys = caps
          .map((k) => `<kbd class="audi-key">${k}</kbd>`)
          .join(sep ? `<i class="sep">${sep}</i>` : '');
        return `<div class="grp">${keys}<span>${what}</span></div>`;
      })
      .join('') + '<button class="x" aria-label="Dismiss">×</button>';
    root.appendChild(hint);
    const dismiss = (): void => {
      if (!hint) return;
      hint.classList.add('gone');
      try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
      const h = hint;
      hint = null;
      window.setTimeout(() => h.remove(), 700);
    };
    hint.querySelector('.x')?.addEventListener('click', dismiss);
    // It has served its purpose the moment the visitor drives.
    const watch = window.setInterval(() => {
      if (!hint) { window.clearInterval(watch); return; }
      if (activeInput()?.driverActive) { dismiss(); window.clearInterval(watch); }
    }, 400);
  }

  // --- panel open/close -------------------------------------------------------
  let open = false;
  const setOpen = (v: boolean): void => {
    if (v === open) return;
    open = v;
    trigger.setAttribute('aria-expanded', String(v));
    trigger.setAttribute('aria-label', v ? 'Close controls' : 'Open controls');
    trigger.style.opacity = v ? '0' : '';
    trigger.style.pointerEvents = v ? 'none' : '';
    if (v) {
      syncAudio();
      panel.hidden = false;
      panel.classList.add('opening');
      // One frame at the start state, so the transition has something to run
      // from; assigning both in the same frame simply snaps.
      requestAnimationFrame(() => panel.classList.remove('opening'));
    } else {
      panel.classList.add('closing');
      window.setTimeout(() => {
        if (!open) { panel.hidden = true; panel.classList.remove('closing'); }
      }, 220);
    }
  };
  trigger.addEventListener('click', () => setOpen(true));
  panel.querySelector('.audi-close')?.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  container.appendChild(root);

  // --- visibility --------------------------------------------------------------
  const applyVisible = (v: boolean): void => {
    root.hidden = !v;
    root.setAttribute('aria-hidden', String(!v));
  };
  onUiVisibility(applyVisible);

  // --- per-frame ---------------------------------------------------------------
  let lastSpeed = -1;
  let lastRpm = -1;
  let lastGear = Number.NaN;
  // Deliberately out of range rather than NaN: every comparison against NaN is
  // false, so a NaN seed means the needle is never placed at all.
  let lastAngle = -1e6;
  let debugTick = 0;

  return {
    update(state, stats) {
      if (root.hidden) return;

      const mph = Math.round(Math.abs(state.speed) * MS_TO_MPH);
      if (mph !== lastSpeed) { speedEl.textContent = String(mph); lastSpeed = mph; }

      const rpm = Math.max(0, Math.round(state.engineRpm / 10) * 10);
      if (rpm !== lastRpm) { rpmEl.textContent = String(rpm); lastRpm = rpm; }

      if (state.gear !== lastGear) {
        gearEl.textContent = state.gear < 0 ? 'R' : state.gear === 0 ? 'N' : String(state.gear);
        lastGear = state.gear;
      }

      const a = rpmAngle(state.engineRpm);
      if (Math.abs(a - lastAngle) > 0.12) {
        needle.setAttribute('transform', `rotate(${a.toFixed(2)} 50 50)`);
        // A sweep of literally zero length still renders a round cap dot, so
        // the arc only exists once the needle has left the stop.
        sweep.setAttribute('d', a > DIAL_START + 0.5 ? arcPath(40.5, DIAL_START, a) : '');
        lastAngle = a;
      }

      // Tell-tales read the driver's switches. Until the physics stream copies
      // `input.lights` onto `state.lights` the two can disagree, so take
      // either: the lamp that is lit and the lamp the driver asked for should
      // both show here.
      const c = latestControls();
      const l = state.lights;
      const flash = (performance.now() / 1000) * 1.5 % 1 < 0.5;
      const ind = l.indicator !== 0 ? l.indicator : c.lights.indicator;
      const haz = l.hazard || c.lights.hazard;
      tells.left.classList.toggle('on', flash && (haz || ind === 1));
      tells.right.classList.toggle('on', flash && (haz || ind === -1));
      tells.beam.classList.toggle('on', l.low || c.lights.low);
      tells.high.classList.toggle('on', l.high || c.lights.high);
      tells.fog.classList.toggle('on', l.fog || c.lights.fog);
      tells.hand.classList.toggle('on', state.handbrake > 0.35);

      if (showDebug && (debugTick = (debugTick + 1) % 15) === 0) {
        debug.innerHTML =
          `<b>${stats.fps.toFixed(0).padStart(3)}</b> fps   `
          + `<b>${stats.drawCalls}</b> draws   `
          + `<b>${(stats.triangles / 1000).toFixed(0)}</b>k tris\n`
          + `${currentView}   throttle ${state.throttle.toFixed(2)}  brake ${state.brake.toFixed(2)}`;
      }
    },

    setVisible(v) {
      // Two steps, deliberately, and the order matters.
      //
      // `setUiVisible` is the stream-wide switch — it also clears the touch
      // driving controls, which `input.ts` mounted outside this root before
      // the HUD existed. But it dedupes against its own module state and, in
      // a dev server, can end up duplicated across two module instances. So
      // this root is also cleared directly: the screenshot harness must never
      // depend on a shared flag having the value we assume it has.
      setUiVisible(v);
      applyVisible(v);
      if (!v) {
        setOpen(false);
        panel.hidden = true;
        panel.classList.remove('closing', 'opening');
      }
    },
  };
}

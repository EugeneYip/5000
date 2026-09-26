/**
 * The whole UI stream's stylesheet, injected once.
 *
 * Everything derives from the five custom properties already declared in
 * `index.html` (`--ui-bg/-line/-fg/-dim/-accent`); the handful added here are
 * local shades of those, kept in one place so the HUD, the control panel and
 * the touch controls cannot drift apart visually.
 *
 * The brief for this surface is restraint: hairlines, tabular numerals, no
 * fill that is not doing work. It sits in front of a car that took a lot of
 * effort to make look real, and must not compete with it.
 */

const CSS = `
.audi-ui {
  position: fixed; inset: 0; z-index: 40;
  pointer-events: none;
  --u-pad: 18px;
  --u-radius: 3px;
  --u-warn: #c8503c;
  --u-face: rgba(8, 9, 11, 0.55);
  --u-hair: rgba(255, 255, 255, 0.07);
  font: 400 13px/1.45 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--ui-fg);
  -webkit-font-smoothing: antialiased;
}
.audi-ui[hidden] { display: none !important; }
.audi-ui * { box-sizing: border-box; }
.audi-ui button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.audi-ui .pe { pointer-events: auto; }

.audi-label {
  font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--ui-dim); white-space: nowrap;
}

/* ---------- instrument cluster ------------------------------------------ */

.audi-cluster {
  position: absolute; left: var(--u-pad); bottom: var(--u-pad);
  display: flex; align-items: flex-end; gap: 16px;
  padding: 12px 18px 11px 12px;
  background: linear-gradient(180deg, rgba(10,12,15,0.30), rgba(10,12,15,0.62));
  border: 1px solid var(--u-hair); border-radius: var(--u-radius);
  backdrop-filter: blur(16px) saturate(1.15);
  -webkit-backdrop-filter: blur(16px) saturate(1.15);
  transition: opacity 0.4s ease;
}
.audi-tach { display: block; width: 86px; height: 86px; }
.audi-tach .face { fill: none; stroke: var(--u-hair); stroke-width: 1; }
.audi-tach .tick { stroke: var(--ui-dim); stroke-width: 1; stroke-linecap: butt; }
.audi-tach .tick.major { stroke: var(--ui-fg); stroke-width: 1.3; }
.audi-tach .band { fill: none; stroke: var(--u-warn); stroke-width: 2.2; opacity: 0.85; }
.audi-tach .sweep { fill: none; stroke: var(--ui-accent); stroke-width: 2.2; opacity: 0.55; }
.audi-tach .needle { stroke: var(--u-warn); stroke-width: 1.6; stroke-linecap: round; }
.audi-tach .hub { fill: var(--ui-fg); opacity: 0.7; }
.audi-tach text { fill: var(--ui-dim); font-size: 7.4px; letter-spacing: 0.06em; }

.audi-readout { display: flex; flex-direction: column; gap: 2px; padding-bottom: 4px; }
.audi-speed { display: flex; align-items: baseline; gap: 6px; }
.audi-speed b {
  font-weight: 300; font-size: 40px; line-height: 0.92;
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.audi-speed span { font-size: 9px; letter-spacing: 0.22em; color: var(--ui-dim); }
.audi-sub { display: flex; gap: 14px; align-items: baseline; }
.audi-sub .k { font-size: 9px; letter-spacing: 0.2em; color: var(--ui-dim); }
.audi-sub .v { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ui-fg); }
.audi-gear { min-width: 1.1em; display: inline-block; }

/* Tell-tales: the dashes that light in the real cluster, nothing more. */
.audi-tells { display: flex; gap: 9px; margin-top: 6px; align-items: center; }
.audi-tell { width: 13px; height: 13px; opacity: 0.16; transition: opacity 0.12s linear; }
.audi-tell svg { display: block; width: 100%; height: 100%; }
.audi-tell path, .audi-tell circle, .audi-tell polygon { fill: currentColor; }
.audi-tell.on { opacity: 1; }
.audi-tell.beam { color: #6ea8ff; }
.audi-tell.ind { color: #46b26a; }
.audi-tell.hand { color: var(--u-warn); }
.audi-tell.fog { color: #e0b061; }

/* ---------- discreet panel trigger -------------------------------------- */

.audi-trigger {
  position: absolute; top: var(--u-pad); right: var(--u-pad);
  width: 34px; height: 34px;
  display: grid; place-content: center; gap: 4px;
  background: var(--u-face); border: 1px solid var(--u-hair); border-radius: var(--u-radius);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  transition: border-color 0.18s ease, background 0.18s ease;
}
.audi-trigger:hover { border-color: rgba(255,255,255,0.2); }
.audi-trigger i { display: block; width: 14px; height: 1px; background: var(--ui-fg); opacity: 0.8; }
.audi-trigger i:nth-child(2) { width: 10px; }

/* ---------- control panel ----------------------------------------------- */

.audi-panel {
  position: absolute; top: var(--u-pad); right: var(--u-pad);
  width: 292px; max-height: calc(100% - var(--u-pad) * 2);
  display: flex; flex-direction: column;
  background: var(--ui-bg); border: 1px solid var(--ui-line); border-radius: var(--u-radius);
  backdrop-filter: blur(22px) saturate(1.2); -webkit-backdrop-filter: blur(22px) saturate(1.2);
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  transform-origin: top right;
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
}
.audi-panel[hidden] { display: none; }
.audi-panel.closing, .audi-panel.opening { opacity: 0; transform: translateY(-6px) scale(0.985); }

.audi-panel header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 14px 12px; border-bottom: 1px solid var(--u-hair); flex: 0 0 auto;
}
.audi-panel header .t { font-size: 9px; letter-spacing: 0.26em; text-transform: uppercase; color: var(--ui-dim); }
.audi-close { width: 22px; height: 22px; display: grid; place-content: center; color: var(--ui-dim); font-size: 15px; line-height: 1; }
.audi-close:hover { color: var(--ui-fg); }

.audi-scroll { overflow-y: auto; overscroll-behavior: contain; padding: 4px 0 10px; }
.audi-scroll::-webkit-scrollbar { width: 6px; }
.audi-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }

.audi-sect { padding: 11px 14px 13px; border-bottom: 1px solid var(--u-hair); }
.audi-sect:last-child { border-bottom: 0; }
.audi-sect > .audi-label { display: block; margin-bottom: 9px; }

.audi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.audi-grid.two { grid-template-columns: repeat(2, 1fr); }
.audi-chip {
  padding: 7px 4px; text-align: center;
  font-size: 10px; letter-spacing: 0.07em;
  color: var(--ui-dim);
  border: 1px solid var(--u-hair); border-radius: 2px;
  background: rgba(255,255,255,0.016);
  transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.audi-chip:hover { color: var(--ui-fg); border-color: rgba(255,255,255,0.18); }
.audi-chip[aria-pressed="true"], .audi-chip.on {
  color: #0d0f12; background: var(--ui-accent); border-color: var(--ui-accent);
}

/* Paint swatches: the colour is the control, so nothing else competes. */
.audi-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.audi-swatch {
  position: relative; aspect-ratio: 1; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: inset 0 -3px 6px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.22);
  transition: transform 0.14s ease;
}
.audi-swatch:hover { transform: scale(1.13); }
.audi-swatch[aria-pressed="true"] { box-shadow: inset 0 -3px 6px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.22), 0 0 0 1.5px var(--ui-fg); }
.audi-swatch-name { margin-top: 9px; font-size: 10px; color: var(--ui-dim); min-height: 1.3em; }

.audi-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
.audi-row + .audi-row { border-top: 1px solid rgba(255,255,255,0.035); }
.audi-row span { font-size: 11.5px; color: var(--ui-fg); }

/* Switch: a hairline track, because a chunky iOS toggle would be shouting. */
.audi-switch {
  position: relative; flex: 0 0 auto; width: 30px; height: 16px;
  border: 1px solid var(--u-hair); border-radius: 9px; background: rgba(255,255,255,0.03);
  transition: background 0.16s ease, border-color 0.16s ease;
}
.audi-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
  border-radius: 50%; background: var(--ui-dim);
  transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1), background 0.16s ease;
}
.audi-switch[aria-pressed="true"] { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.28); }
.audi-switch[aria-pressed="true"]::after { transform: translateX(14px); background: var(--ui-fg); }

.audi-slider { -webkit-appearance: none; appearance: none; width: 108px; height: 14px; background: none; }
.audi-slider::-webkit-slider-runnable-track { height: 1px; background: rgba(255,255,255,0.22); }
.audi-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 11px; height: 11px; margin-top: -5px;
  border-radius: 50%; background: var(--ui-fg); cursor: pointer;
}
.audi-slider::-moz-range-track { height: 1px; background: rgba(255,255,255,0.22); }
.audi-slider::-moz-range-thumb { width: 11px; height: 11px; border: 0; border-radius: 50%; background: var(--ui-fg); }

/* ---------- first-run hint ---------------------------------------------- */

.audi-hint {
  position: absolute; left: 50%; bottom: var(--u-pad); transform: translateX(-50%);
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: center;
  max-width: min(760px, calc(100% - 40px));
  padding: 9px 12px 9px 14px;
  background: var(--u-face); border: 1px solid var(--u-hair); border-radius: var(--u-radius);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.audi-hint.gone { opacity: 0; transform: translateX(-50%) translateY(6px); pointer-events: none; }
.audi-hint .grp { display: flex; align-items: center; gap: 6px; }
.audi-hint .grp span { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ui-dim); }
.audi-key {
  display: inline-grid; place-content: center; min-width: 19px; height: 19px; padding: 0 5px;
  font-size: 10px; font-weight: 500; color: var(--ui-fg);
  border: 1px solid rgba(255,255,255,0.18); border-radius: 3px;
  background: rgba(255,255,255,0.05);
}
.audi-hint .x { margin-left: 2px; color: var(--ui-dim); font-size: 14px; line-height: 1; padding: 0 4px; }
.audi-hint .x:hover { color: var(--ui-fg); }

/* ---------- debug ------------------------------------------------------- */

.audi-debug {
  position: absolute; top: var(--u-pad); left: var(--u-pad);
  padding: 7px 10px; border: 1px solid var(--u-hair); border-radius: var(--u-radius);
  background: var(--u-face); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  font: 400 10.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--ui-dim); white-space: pre; letter-spacing: 0.02em;
}
.audi-debug b { color: var(--ui-fg); font-weight: 500; }
.audi-debug[hidden] { display: none; }

/* ---------- touch driving controls -------------------------------------- */

.audi-touch { position: absolute; inset: 0; pointer-events: none; }
.audi-touch[hidden] { display: none; }
.audi-pad {
  position: absolute; bottom: 16px; left: 16px;
  width: min(42vw, 210px); height: 74px;
  border: 1px solid var(--u-hair); border-radius: 37px;
  background: rgba(10,12,15,0.42);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  pointer-events: auto; touch-action: none; overflow: hidden;
}
.audi-pad .knob {
  position: absolute; top: 50%; left: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px;
  border-radius: 50%; border: 1px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.08);
  transition: background 0.14s ease;
}
.audi-pad .axis { position: absolute; top: 50%; left: 10%; width: 80%; height: 1px; background: rgba(255,255,255,0.1); }
.audi-pad .cap { position: absolute; left: 0; right: 0; bottom: 5px; text-align: center; font-size: 8px; letter-spacing: 0.2em; color: var(--ui-dim); }

.audi-pedals { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 10px; align-items: flex-end; }
.audi-pedal {
  width: 74px; height: 74px; border-radius: 50%;
  display: grid; place-content: center; gap: 2px;
  border: 1px solid var(--u-hair); background: rgba(10,12,15,0.42);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none;
  font-size: 9px; letter-spacing: 0.18em; color: var(--ui-dim);
  transition: background 0.1s linear, color 0.1s linear, border-color 0.1s linear;
}
.audi-pedal.hit { background: rgba(255,255,255,0.22); color: var(--ui-fg); border-color: rgba(255,255,255,0.4); }
.audi-pedal.small { width: 46px; height: 46px; font-size: 8px; }
.audi-aux { position: absolute; right: 16px; bottom: 100px; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }

/* ---------- small screens ------------------------------------------------ */

@media (max-width: 720px), (pointer: coarse) {
  .audi-ui { --u-pad: 12px; }
  .audi-cluster { left: 50%; bottom: auto; top: var(--u-pad); transform: translateX(-50%); gap: 12px; padding: 8px 14px 8px 8px; }
  .audi-tach { width: 60px; height: 60px; }
  .audi-speed b { font-size: 28px; }
  .audi-panel { top: auto; bottom: 0; right: 0; left: 0; width: auto; max-height: 72vh; border-radius: var(--u-radius) var(--u-radius) 0 0; transform-origin: bottom center; }
  .audi-panel.closing, .audi-panel.opening { transform: translateY(14px); }
  .audi-hint { bottom: auto; top: 78px; font-size: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .audi-ui *, .audi-ui *::after { transition: none !important; animation: none !important; }
}
`;

let injected = false;

export function ensureStyles(): void {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'audi-ui-style';
  el.textContent = CSS;
  document.head.appendChild(el);
}

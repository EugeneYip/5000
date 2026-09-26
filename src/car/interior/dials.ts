/**
 * The cluster graphic, drawn to canvas at instrument resolution.
 *
 * Laid out in millimetres, because that is how a dial face is specified and
 * it keeps every radius and cap height readable as a number you could check
 * against a photograph. One pass draws the printed face; a second draws the
 * same artwork as the backlit layer, so the lit and unlit states register
 * exactly and the lamps cannot drift off their pictograms.
 *
 * Reading left to right, as the driver sees it: coolant temperature, the
 * speedometer with its odometer and trip windows, the centre column
 * (turn-signal window, trip-computer LCD, the 13-function Auto-Check block),
 * the tachometer, and the fuel gauge. That is the pre-facelift arrangement —
 * the extra oil-temperature, oil-pressure and voltmeter dials arrive with the
 * MY1989 facelift and do not belong on this car.
 */

import { ENGINE } from '@/spec';
import { DIAL_FONT, makeCanvas, type CanvasHandle } from './printed';

/** Face size in millimetres. */
export const FACE = { w: 330, h: 118 } as const;
const PPMM = 6.4;

/** Needle sweep: zero at lower-left, full scale at lower-right. */
export const SWEEP = { start: -126, end: 126 } as const;

export const DIALS = {
  temp: { x: 30, y: 72, r: 20 },
  speedo: { x: 98, y: 52, r: 39 },
  tacho: { x: 232, y: 52, r: 39 },
  fuel: { x: 300, y: 72, r: 20 },
} as const;

/**
 * Speedometer range. US cars are in mph; the sourced photograph is of a
 * Canadian 0-260 km/h car, and the 160 mph speedometer is documented as a
 * MY1989 facelift change, so neither transfers. 140 is the common US Audi
 * 5000 figure and comfortably clears the car's own 124 mph. Flagged in the
 * stream report as the one interior number not directly sourced.
 */
export const SPEEDO_MAX = 140;
export const TACHO_MAX = 7500;

const SHORT_SWEEP = { start: -52, end: 52 };

/** Small dials have their own, much shorter, sweep. */
export function shortSweep(): { start: number; end: number } { return SHORT_SWEEP; }

const BACKLIT = '#ff7a24';

function pt(cx: number, cy: number, deg: number, r: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
}

interface Pen {
  face: CanvasRenderingContext2D;
  lit: CanvasRenderingContext2D;
}

function both(p: Pen, fn: (g: CanvasRenderingContext2D, lit: boolean) => void): void {
  fn(p.face, false);
  fn(p.lit, true);
}

function tick(p: Pen, cx: number, cy: number, deg: number, r0: number, r1: number, w: number, color: string): void {
  both(p, (g, lit) => {
    const a = pt(cx, cy, deg, r0);
    const b = pt(cx, cy, deg, r1);
    g.strokeStyle = lit ? BACKLIT : color;
    g.lineWidth = w;
    g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  });
}

function label(p: Pen, x: number, y: number, text: string, size: number, color: string, weight = '500', align: CanvasTextAlign = 'center'): void {
  both(p, (g, lit) => {
    g.fillStyle = lit ? BACKLIT : color;
    g.font = `${weight} ${size}px ${DIAL_FONT}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
  });
}

function dialWell(p: Pen, cx: number, cy: number, r: number): void {
  // Printed face only: the well is where light does NOT come through.
  const g = p.face;
  const grad = g.createRadialGradient(cx, cy - r * 0.35, r * 0.1, cx, cy, r * 1.05);
  grad.addColorStop(0, '#26272b');
  grad.addColorStop(0.72, '#1b1c1f');
  grad.addColorStop(1, '#101114');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#0a0a0c';
  g.lineWidth = 1.2;
  g.stroke();
}

// ---------------------------------------------------------------------------

function drawSpeedo(p: Pen): void {
  const { x, y, r } = DIALS.speedo;
  dialWell(p, x, y, r);
  const span = SWEEP.end - SWEEP.start;
  for (let v = 0; v <= SPEEDO_MAX; v += 5) {
    const deg = SWEEP.start + (v / SPEEDO_MAX) * span;
    const major = v % 20 === 0;
    const mid = v % 10 === 0;
    tick(p, x, y, deg, r - (major ? 6.6 : mid ? 4.6 : 3.2), r - 1.6, major ? 1.5 : mid ? 1.0 : 0.7, '#e8e6e0');
    if (major) {
      const [lx, ly] = pt(x, y, deg, r - 12.4);
      label(p, lx, ly, String(v), 7.4, '#f0eee8', '500');
    }
  }
  label(p, x, y + 15.5, 'mph', 4.6, '#b9b7b2', '400');

  // Odometer window, upper half, and the trip below centre.
  const g = p.face;
  const win = (wx: number, wy: number, w: number, h: number, digits: string, trip: boolean): void => {
    g.fillStyle = '#08090a';
    g.fillRect(wx - w / 2, wy - h / 2, w, h);
    g.strokeStyle = '#3a3c40';
    g.lineWidth = 0.7;
    g.strokeRect(wx - w / 2, wy - h / 2, w, h);
    const n = digits.length;
    const dw = w / n;
    for (let i = 0; i < n; i++) {
      const last = trip && i === n - 1;
      g.fillStyle = last ? '#7d1414' : '#1a1b1d';
      g.fillRect(wx - w / 2 + i * dw + 0.35, wy - h / 2 + 0.4, dw - 0.7, h - 0.8);
      g.fillStyle = '#ece9e2';
      g.font = `500 ${h * 0.68}px ${DIAL_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(digits[i], wx - w / 2 + (i + 0.5) * dw, wy + 0.3);
    }
  };
  win(x, y - 17, 31, 6.6, '148216', false);
  win(x - 3, y + 8.5, 20, 5.4, '3271', true);

  label(p, x + 12, y + 24.5, 'VDO', 3.4, '#8e8c88', '500');
  label(p, x - 9, y + 24.5, '443 919 033 B', 2.6, '#6e6c69', '400');
}

function drawTacho(p: Pen): void {
  const { x, y, r } = DIALS.tacho;
  dialWell(p, x, y, r);
  const span = SWEEP.end - SWEEP.start;
  const deg = (rpm: number): number => SWEEP.start + (rpm / TACHO_MAX) * span;

  // Red zone: a dense hatched band, not a solid arc.
  const g = p.face;
  g.save();
  g.beginPath();
  g.arc(x, y, r - 1.6, ((deg(ENGINE.redlineRpm) - 90) * Math.PI) / 180, ((deg(TACHO_MAX) - 90) * Math.PI) / 180);
  g.arc(x, y, r - 7.4, ((deg(TACHO_MAX) - 90) * Math.PI) / 180, ((deg(ENGINE.redlineRpm) - 90) * Math.PI) / 180, true);
  g.closePath();
  g.clip();
  g.fillStyle = '#2a1012';
  g.fill();
  g.strokeStyle = '#c8202a';
  g.lineWidth = 0.9;
  for (let i = -40; i < 40; i++) {
    g.beginPath();
    g.moveTo(x + i * 1.7, y - r);
    g.lineTo(x + i * 1.7 + r * 2, y + r);
    g.stroke();
  }
  g.restore();

  for (let rpm = 0; rpm <= TACHO_MAX; rpm += 250) {
    const major = rpm % 1000 === 0;
    const red = rpm >= ENGINE.redlineRpm;
    tick(p, x, y, deg(rpm), r - (major ? 6.6 : 3.2), r - 1.6, major ? 1.5 : 0.7, red ? '#ff5a5a' : '#e8e6e0');
    if (major && rpm >= 1000) {
      const [lx, ly] = pt(x, y, deg(rpm), r - 12.4);
      label(p, lx, ly, String(rpm / 100), 7.4, red ? '#ff6a6a' : '#f0eee8', '500');
    }
  }
  label(p, x, y + 15.5, '1/min x 100', 4.2, '#b9b7b2', '400');
  label(p, x, y + 21.5, '— 5 —', 3.2, '#8e8c88', '400');
}

function drawSmall(p: Pen, cx: number, cy: number, r: number, kind: 'temp' | 'fuel'): void {
  dialWell(p, cx, cy, r);
  const s = shortSweep();
  const span = s.end - s.start;
  const g = p.face;

  if (kind === 'fuel') {
    // Red reserve segment at the bottom of the scale.
    g.save();
    g.beginPath();
    g.arc(cx, cy, r - 1.4, ((s.start - 90) * Math.PI) / 180, ((s.start + span * 0.14 - 90) * Math.PI) / 180);
    g.arc(cx, cy, r - 4.6, ((s.start + span * 0.14 - 90) * Math.PI) / 180, ((s.start - 90) * Math.PI) / 180, true);
    g.closePath();
    g.fillStyle = '#b8222a';
    g.fill();
    g.restore();
  } else {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r - 1.4, ((s.end - span * 0.16 - 90) * Math.PI) / 180, ((s.end - 90) * Math.PI) / 180);
    g.arc(cx, cy, r - 4.6, ((s.end - 90) * Math.PI) / 180, ((s.end - span * 0.16 - 90) * Math.PI) / 180, true);
    g.closePath();
    g.fillStyle = '#b8222a';
    g.fill();
    g.restore();
  }

  const stops = kind === 'fuel' ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.25, 0.5, 0.75, 1];
  for (let i = 0; i < stops.length; i++) {
    const major = i % 2 === 0;
    tick(p, cx, cy, s.start + stops[i] * span, r - (major ? 6.2 : 3.6), r - 1.6, major ? 1.4 : 0.8, '#e8e6e0');
  }
  if (kind === 'fuel') {
    label(p, ...pt(cx, cy, s.start, r - 10.5), '0', 4.6, '#f0eee8');
    label(p, ...pt(cx, cy, 0, r - 10.5), '½', 4.6, '#f0eee8');
    label(p, ...pt(cx, cy, s.end, r - 10.5), '1', 4.6, '#f0eee8');
  } else {
    label(p, ...pt(cx, cy, s.start, r - 10.5), '50', 4.2, '#f0eee8');
    label(p, ...pt(cx, cy, 0, r - 10.5), '100', 4.2, '#f0eee8');
    label(p, ...pt(cx, cy, s.end, r - 10.5), '120', 4.2, '#f0eee8');
  }

  // Pictogram: a fuel pump, or a thermometer standing in water.
  both(p, (gc, lit) => {
    gc.save();
    gc.translate(cx, cy + r * 0.44);
    gc.strokeStyle = lit ? BACKLIT : '#d6d4cf';
    gc.fillStyle = lit ? BACKLIT : '#d6d4cf';
    gc.lineWidth = 0.8;
    if (kind === 'fuel') {
      gc.strokeRect(-3.6, -3.4, 5.0, 6.8);
      gc.beginPath();
      gc.moveTo(1.4, 1.2);
      gc.lineTo(3.2, 1.2);
      gc.lineTo(3.2, -2.2);
      gc.stroke();
      gc.fillRect(-2.6, -2.4, 3.0, 2.2);
    } else {
      gc.beginPath();
      gc.moveTo(-0.9, -3.6);
      gc.lineTo(0.9, -3.6);
      gc.lineTo(0.9, 1.4);
      gc.arc(0, 1.4, 1.6, 0, Math.PI * 2);
      gc.fill();
      gc.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) {
        gc.beginPath();
        gc.moveTo(-4.6, 3.0 + i * 0.1);
        gc.bezierCurveTo(-3.2, 2.2, -2.0, 3.8, -0.6, 3.0);
        gc.stroke();
        gc.beginPath();
        gc.moveTo(0.8, 3.0);
        gc.bezierCurveTo(2.2, 2.2, 3.4, 3.8, 4.8, 3.0);
        gc.stroke();
      }
    }
    gc.restore();
  });
}

// ---------------------------------------------------------------------------
// Centre column
// ---------------------------------------------------------------------------

/** Auto-Check tile grid, in face millimetres. Column x is 140..190. */
export const AUTOCHECK = { x0: 141, y0: 62, w: 15, h: 13, gap: 1.5 } as const;

export function tileCentre(col: number, row: number): [number, number] {
  return [
    AUTOCHECK.x0 + col * (AUTOCHECK.w + AUTOCHECK.gap) + AUTOCHECK.w / 2,
    AUTOCHECK.y0 + row * (AUTOCHECK.h + AUTOCHECK.gap) + AUTOCHECK.h / 2,
  ];
}

/** Turn-signal arrow centres. */
export const ARROWS: Array<[number, number]> = [[152, 19], [178, 19]];

function drawCentre(p: Pen): void {
  const g = p.face;

  // Turn-signal window.
  g.fillStyle = '#131417';
  g.fillRect(140, 11, 50, 16);
  g.strokeStyle = '#26272b';
  g.lineWidth = 0.6;
  g.strokeRect(140, 11, 50, 16);
  for (let i = 0; i < 2; i++) {
    const [ax, ay] = ARROWS[i];
    const dir = i === 0 ? -1 : 1;
    g.fillStyle = '#1e2023';
    g.beginPath();
    g.moveTo(ax + dir * 4.6, ay);
    g.lineTo(ax - dir * 0.6, ay - 4.0);
    g.lineTo(ax - dir * 0.6, ay - 1.5);
    g.lineTo(ax - dir * 4.6, ay - 1.5);
    g.lineTo(ax - dir * 4.6, ay + 1.5);
    g.lineTo(ax - dir * 0.6, ay + 1.5);
    g.lineTo(ax - dir * 0.6, ay + 4.0);
    g.closePath();
    g.fill();
  }

  // Trip-computer LCD: dark grey-green glass with fixed legends round it.
  g.fillStyle = '#1c2220';
  g.fillRect(140, 30, 50, 28);
  g.strokeStyle = '#2e3033';
  g.strokeRect(140, 30, 50, 28);
  g.fillStyle = '#2a332f';
  g.font = `500 8px ${DIAL_FONT}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText('8888', 186, 45);
  g.fillStyle = '#5c5f63';
  g.font = `400 3px ${DIAL_FONT}`;
  g.textAlign = 'left';
  g.fillText('bar', 141.6, 32.6);
  g.textAlign = 'center';
  g.fillText('km →', 165, 32.6);
  g.textAlign = 'right';
  g.fillText('ltr', 188.4, 32.6);
  g.textAlign = 'left';
  g.fillText('l/100km', 141.6, 55.6);
  g.textAlign = 'right';
  g.fillText('km/h', 188.4, 55.6);

  // Auto-Check: nine backlit windows. Unlit they are flat dark rectangles
  // with the pictogram barely there, which is how they actually look.
  const tiles: Array<[number, number, string, string]> = [
    [0, 0, 'text', 'PARK\nBRAKE'],
    [1, 0, 'tri', ''],
    [2, 0, 'beam', ''],
    [0, 1, 'batt', ''],
    [1, 1, 'text', 'ANTILOCK\nOFF'],
    [2, 1, 'oil', ''],
    [0, 2, 'blank', ''],
    [1, 2, 'oilp', ''],
    [2, 2, 'blank', ''],
  ];
  for (const [c, r, kind, text] of tiles) {
    const [tx, ty] = tileCentre(c, r);
    g.fillStyle = '#17181b';
    g.fillRect(tx - AUTOCHECK.w / 2, ty - AUTOCHECK.h / 2, AUTOCHECK.w, AUTOCHECK.h);
    g.strokeStyle = '#0d0e10';
    g.lineWidth = 0.5;
    g.strokeRect(tx - AUTOCHECK.w / 2, ty - AUTOCHECK.h / 2, AUTOCHECK.w, AUTOCHECK.h);
    drawPictogram(g, tx, ty, kind, text, '#2b2d31');
  }
}

/** Shared by the printed face (near-invisible) and the lit overlays. */
export function drawPictogram(g: CanvasRenderingContext2D, tx: number, ty: number, kind: string, text: string, color: string): void {
  g.save();
  g.translate(tx, ty);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = 0.7;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  switch (kind) {
    case 'text': {
      const lines = text.split('\n');
      g.font = `700 ${lines.length > 1 ? 3.1 : 3.8}px ${DIAL_FONT}`;
      for (let i = 0; i < lines.length; i++) g.fillText(lines[i], 0, (i - (lines.length - 1) / 2) * 3.8);
      break;
    }
    case 'tri':
      g.beginPath();
      g.moveTo(0, -3.6); g.lineTo(4.0, 3.2); g.lineTo(-4.0, 3.2); g.closePath();
      g.stroke();
      g.fillRect(-0.5, -1.8, 1.0, 3.0);
      g.fillRect(-0.5, 1.8, 1.0, 1.0);
      break;
    case 'beam':
      g.beginPath();
      g.moveTo(-1.0, -3.0);
      g.bezierCurveTo(3.2, -3.0, 3.2, 3.0, -1.0, 3.0);
      g.closePath();
      g.fill();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-2.2, -2.2 + i * 2.2);
        g.lineTo(-5.0, -1.0 + i * 2.2);
        g.stroke();
      }
      break;
    case 'batt':
      g.strokeRect(-4.2, -2.4, 8.4, 5.0);
      g.fillRect(-2.8, -3.4, 1.6, 1.0);
      g.fillRect(1.2, -3.4, 1.6, 1.0);
      g.fillRect(-3.0, -0.2, 2.0, 0.7);
      g.fillRect(1.0, -0.2, 2.0, 0.7);
      g.fillRect(1.65, -0.85, 0.7, 2.0);
      break;
    case 'oil':
    case 'oilp':
      g.beginPath();
      g.moveTo(-4.4, 1.6);
      g.lineTo(-4.4, -0.8);
      g.lineTo(-0.6, -0.8);
      g.lineTo(0.8, -2.2);
      g.lineTo(3.6, -2.2);
      g.lineTo(4.4, 1.6);
      g.closePath();
      g.fill();
      if (kind === 'oilp') {
        g.beginPath();
        g.moveTo(-2.0, 2.4); g.lineTo(2.6, 2.4);
        g.stroke();
      }
      break;
    default:
      break;
  }
  g.restore();
}

// ---------------------------------------------------------------------------

export interface ClusterArt {
  face: CanvasHandle;
  lit: CanvasHandle;
}

export function drawCluster(): ClusterArt {
  const face = makeCanvas(FACE.w, FACE.h, PPMM);
  const lit = makeCanvas(FACE.w, FACE.h, PPMM);

  // The plate itself: matt black, with the faint mottle of a moulded part.
  face.g.fillStyle = '#121316';
  face.g.fillRect(0, 0, FACE.w, FACE.h);
  lit.g.fillStyle = '#000000';
  lit.g.fillRect(0, 0, FACE.w, FACE.h);

  const p: Pen = { face: face.g, lit: lit.g };
  drawSpeedo(p);
  drawTacho(p);
  drawSmall(p, DIALS.temp.x, DIALS.temp.y, DIALS.temp.r, 'temp');
  drawSmall(p, DIALS.fuel.x, DIALS.fuel.y, DIALS.fuel.r, 'fuel');
  drawCentre(p);

  label(p, DIALS.fuel.x, 106, 'UNLEADED FUEL ONLY', 3.0, '#a9a7a3', '500');
  label(p, DIALS.temp.x, 106, 'ESSENCE SANS PLOMB', 2.4, '#6e6c69', '400');

  return { face, lit };
}

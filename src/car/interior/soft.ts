/**
 * Upholstery.
 *
 * A seat is the one thing in a car that is *not* a designed shape: it is a
 * designed shape that a person has been sitting in. Symmetry, a flat centre
 * panel and a crisp edge are what make a rendered seat read as CG at a
 * glance, so everything here is built the other way round — a sculpted
 * cross-section, longitudinal flutes with the channels stitched between them,
 * a welt cord round the panel edge, and then a deterministic wear field that
 * dishes the centre, rounds the front edge and drags creases out of the
 * bolsters. The driver's seat gets more of all of it than the passenger's.
 */

import * as THREE from 'three';
import { clamp, fbm, lerp, smoothstep, surface, tube, type Vec3 } from './util';

export interface Frame {
  /** Origin of the panel, at the centre of its A-surface boundary. */
  origin: THREE.Vector3;
  /** Lateral axis, unit. */
  lat: THREE.Vector3;
  /** Sweep axis: front-to-back for a cushion, bottom-to-top for a backrest. */
  run: THREE.Vector3;
  /** Out of the A-surface, unit. */
  up: THREE.Vector3;
}

export interface PanelSpec {
  frame: Frame;
  /** Length along `run`. */
  length: number;
  /** Half width at v, in metres. */
  halfWidth(v: number): number;
  /** Thickness below the A-surface at v. */
  depth(v: number): number;
  /** A-surface height above the nominal plane, metres. t is -1..1 lateral. */
  face(t: number, v: number): number;
  /** Underside height below the nominal plane. */
  back?(t: number, v: number): number;
  /** Flute channel centres, as lateral fractions. */
  flutes?: number[];
  fluteDepth?: number;
  seed: number;
  ring?: number;
  stations?: number;
}

const EDGE = 6;

/** The A-surface, with flutes and wear folded in. */
function aSurface(s: PanelSpec, t: number, v: number): number {
  let y = s.face(t, v);
  const flutes = s.flutes ?? [];
  const fd = s.fluteDepth ?? 0.008;
  for (const f of flutes) {
    const d = Math.abs(t - f);
    // A stitched channel is narrow and sharp; the cloth puffs either side of
    // it, which is what actually makes a flute visible.
    y -= fd * Math.exp(-(d * d) / 0.00085);
    y += fd * 0.34 * Math.exp(-((d - 0.085) ** 2) / 0.004);
    y += fd * 0.34 * Math.exp(-((d + 0.085) ** 2) / 0.004);
  }
  // Wear: fine anisotropic creasing, stretched along the flutes.
  const k = s.seed;
  y += fbm(t * 7.5 + k, v * 26 + k * 3, k * 11, 3) * 0.0026;
  y += fbm(t * 21 + k, v * 7 + k, 4.5, 2) * 0.0013;
  return y;
}

/**
 * One upholstered panel: a closed lofted volume with a sculpted top face, a
 * plainer underside, and a rounded-over edge between them.
 */
export function panel(s: PanelSpec): { geometry: THREE.BufferGeometry; edgeL: Vec3[]; edgeR: Vec3[] } {
  const M = s.ring ?? 26;
  const NV = s.stations ?? 34;
  const { origin, lat, run, up } = s.frame;
  const p = new THREE.Vector3();

  const total = 2 * (M + 1) + 2 * EDGE;
  const edgeL: Vec3[] = [];
  const edgeR: Vec3[] = [];

  const place = (out: THREE.Vector3, x: number, y: number, z: number): void => {
    out.copy(origin)
      .addScaledVector(lat, x)
      .addScaledVector(up, y)
      .addScaledVector(run, z);
  };

  const geom = surface(total, NV, true, (i, j, out) => {
    const v = j / NV;
    const z = v * s.length;
    const hw = s.halfWidth(v);
    const dep = s.depth(v);

    let t: number;
    let y: number;
    let x: number;

    if (i <= M) {
      // A-surface, left to right.
      t = -1 + (2 * i) / M;
      x = t * hw;
      y = aSurface(s, t, v);
    } else if (i < M + 1 + EDGE) {
      // Right edge, rolled over.
      const a = ((i - M) / (EDGE + 1)) * Math.PI * 0.5;
      const y0 = aSurface(s, 1, v);
      const y1 = -dep + (s.back ? s.back(1, v) : 0);
      y = lerp(y0, y1, 1 - Math.cos(a));
      x = hw - (1 - Math.cos(a * 0.9)) * hw * 0.055;
    } else if (i < 2 * M + 2 + EDGE) {
      // Underside, right to left.
      const k = i - (M + 1 + EDGE);
      t = 1 - (2 * k) / M;
      x = t * hw * 0.945;
      y = -dep + (s.back ? s.back(t, v) : 0);
    } else {
      const a = ((total - i) / (EDGE + 1)) * Math.PI * 0.5;
      const y0 = aSurface(s, -1, v);
      const y1 = -dep + (s.back ? s.back(-1, v) : 0);
      x = -hw + (1 - Math.cos(a * 0.9)) * hw * 0.055;
      y = lerp(y0, y1, 1 - Math.cos(a));
    }
    place(out, x, y, z);
    // The welt runs down the join between the A-surface and the side roll, so
    // it is captured from the surface itself and can never drift off it.
    if (i === M) { p.copy(out); edgeR.push([p.x, p.y, p.z]); }
    if (i === 0) { p.copy(out); edgeL.push([p.x, p.y, p.z]); }
  });

  return { geometry: geom, edgeL, edgeR };
}

/** The welt cord round a panel's edge — 4 mm of fabric-covered piping. */
export function welt(path: Vec3[], radius = 0.0042): THREE.BufferGeometry {
  return tube(path, radius, 6, false, 0.4);
}

// ---------------------------------------------------------------------------
// Shared sculpting terms
// ---------------------------------------------------------------------------

/** Side bolster: a swell that starts inboard of the edge and peaks on it. */
export function bolster(t: number, amount: number, start = 0.58): number {
  return amount * smoothstep(start, 0.97, Math.abs(t));
}

/** The dish an occupant leaves. `c` is where along the panel they sit. */
export function dish(t: number, v: number, c: number, width: number, amount: number): number {
  const av = Math.exp(-((v - c) ** 2) / width);
  return -amount * av * (1 - clamp(Math.abs(t), 0, 1) ** 2 * 0.55);
}

/** A crease line running across the panel — the fold a used cushion keeps. */
export function crease(t: number, v: number, at: number, depth: number, waver = 0.012): number {
  const d = v - at - waver * fbm(t * 4.2, at * 9, 3.7, 2);
  return -depth * Math.exp(-(d * d) / 0.00035) * (1 - Math.abs(t) * 0.35);
}

/**
 * Small curve toolbox for the body loft.
 *
 * Everything the body surface needs is a smooth interpolation through a table
 * of hand-placed control values — the digital equivalent of a naval architect's
 * spline batten. Non-uniform Catmull-Rom is used throughout because it passes
 * *through* its control points (so a hardpoint stays a hardpoint) and is C1,
 * which is what stops highlights wobbling along a flank.
 */

import * as THREE from 'three';

export type Pt2 = readonly [number, number];

/** A C1 curve through (t, v) samples. Extrapolates flat outside the range. */
export class Spline1D {
  private readonly ts: number[];
  private readonly vs: number[];

  constructor(points: ReadonlyArray<Pt2>) {
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    this.ts = sorted.map((p) => p[0]);
    this.vs = sorted.map((p) => p[1]);
    if (this.ts.length < 2) throw new Error('Spline1D needs at least two points');
  }

  get first(): number { return this.ts[0]; }
  get last(): number { return this.ts[this.ts.length - 1]; }

  at(t: number): number {
    const { ts, vs } = this;
    const n = ts.length;
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];

    let i = 0;
    // Linear scan is fine: these tables are ~30 entries and the caller is
    // building geometry, not running per-frame.
    while (i < n - 2 && t > ts[i + 1]) i++;

    const t0 = ts[i], t1 = ts[i + 1];
    const v0 = vs[i], v1 = vs[i + 1];
    const h = t1 - t0;
    const s = (t - t0) / h;

    const m0 = i === 0
      ? (v1 - v0) / h
      : (v1 - vs[i - 1]) / (t1 - ts[i - 1]);
    const m1 = i + 2 >= n
      ? (v1 - v0) / h
      : (vs[i + 2] - v0) / (ts[i + 2] - t0);

    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v0
      + (s3 - 2 * s2 + s) * h * m0
      + (-2 * s3 + 3 * s2) * v1
      + (s3 - s2) * h * m1;
  }
}

/** Convenience: build a Spline1D from a table written nose-to-tail. */
export function spline(...points: Pt2[]): Spline1D {
  return new Spline1D(points);
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Smoothstep, used for blending one longitudinal regime into another. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Superelliptic quarter-arc. `n = 2` is a circle; larger flattens the crown,
 * which is exactly what a wheel arch does — it is never a semicircle.
 */
export function superellipseY(dx: number, a: number, b: number, n: number): number {
  const r = Math.abs(dx) / a;
  if (r >= 1) return 0;
  return b * Math.pow(1 - Math.pow(r, n), 1 / n);
}

/**
 * Merge geometries that share the exact same attribute set
 * (position/normal/uv, indexed). Written locally so the body module does not
 * depend on addon import paths.
 */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const kept = list.filter((g) => (g.getAttribute('position')?.count ?? 0) > 0);
  if (kept.length === 0) return new THREE.BufferGeometry();
  if (kept.length === 1) return kept[0];

  let vTotal = 0, iTotal = 0;
  for (const g of kept) {
    vTotal += g.getAttribute('position').count;
    iTotal += g.getIndex()!.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idx = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);

  let vo = 0, io = 0;
  for (const g of kept) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const t = g.getAttribute('uv') as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(n.array as Float32Array, vo * 3);
    uv.set(t.array as Float32Array, vo * 2);
    const gi = g.getIndex()!;
    for (let k = 0; k < gi.count; k++) idx[io + k] = gi.getX(k) + vo;
    vo += p.count;
    io += gi.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const g of kept) g.dispose();
  return out;
}

/** Mirror a geometry about the X = 0 plane, fixing winding and normals. */
export function mirrorGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  p.needsUpdate = true;
  n.needsUpdate = true;
  const idx = g.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  idx.needsUpdate = true;
  return g;
}

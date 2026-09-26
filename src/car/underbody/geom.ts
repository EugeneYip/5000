/**
 * Primitive toolbox for the underbody.
 *
 * Underbody hardware is stampings, castings, tubes and springs, so that is
 * what this file makes. Everything comes out carrying exactly
 * position / normal / uv and indexed, which is what `merge` needs — one draw
 * call for the whole floorpan rather than one per rib.
 *
 * Nothing here has a sharp edge. A pressed steel rail has a 3–6 mm radius on
 * every fold and a cast alloy housing has more; modelled sharp they read as
 * cardboard, which is the single most common tell in a hand-built underbody.
 */

import * as THREE from 'three';

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export interface Sample {
  p: THREE.Vector3;
  n: THREE.Vector3;
  u: number;
  v: number;
}

const _s: Sample = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };

/** Quad grid from a parametric sampler. Winding follows the sampled normal. */
export function grid(
  na: number, nb: number,
  sample: (a: number, b: number, out: Sample) => void,
  closeA = false,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const p00 = new THREE.Vector3(); const n00 = new THREE.Vector3();
  const pA = new THREE.Vector3(); const pB = new THREE.Vector3();

  for (let i = 0; i < na; i++) {
    const a = closeA ? i / na : i / (na - 1);
    for (let j = 0; j < nb; j++) {
      const b = j / (nb - 1);
      sample(a, b, _s);
      pos.push(_s.p.x, _s.p.y, _s.p.z);
      nor.push(_s.n.x, _s.n.y, _s.n.z);
      uvs.push(_s.u, _s.v);
      if (i === 0 && j === 0) { p00.copy(_s.p); n00.copy(_s.n); }
      if (i === 1 && j === 0) pA.copy(_s.p);
      if (i === 0 && j === 1) pB.copy(_s.p);
    }
  }

  const flip = pA.sub(p00).cross(pB.sub(p00)).dot(n00) < 0;
  const idx: number[] = [];
  const at = (i: number, j: number): number => (i % na) * nb + j;
  const last = closeA ? na : na - 1;
  for (let i = 0; i < last; i++) {
    for (let j = 0; j < nb - 1; j++) {
      if (flip) {
        idx.push(at(i, j), at(i, j + 1), at(i + 1, j + 1));
        idx.push(at(i, j), at(i + 1, j + 1), at(i + 1, j));
      } else {
        idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
        idx.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
      }
    }
  }
  return assemble(pos, nor, uvs, idx);
}

function assemble(pos: number[], nor: number[], uvs: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(idx), 1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

const sgnPow = (x: number, e: number): number => Math.sign(x) * Math.pow(Math.abs(x), e);

/**
 * Rounded box, as a superellipsoid. `round` 0 → a sphere, 1 → very nearly a
 * cube; 0.86 gives the ~4 mm radius a pressed or cast part actually has at
 * these sizes.
 */
export function sqBox(w: number, h: number, d: number, round = 0.86, na = 20, nb = 12): THREE.BufferGeometry {
  const a = w / 2, b = h / 2, c = d / 2;
  const e = Math.max(0.02, 1 - round);
  const at = (u: number, v: number, out: THREE.Vector3): THREE.Vector3 => {
    const phi = (v - 0.5) * Math.PI;
    const th = u * Math.PI * 2;
    const cp = sgnPow(Math.cos(phi), e), sp = sgnPow(Math.sin(phi), e);
    return out.set(a * cp * sgnPow(Math.cos(th), e), b * sp, c * cp * sgnPow(Math.sin(th), e));
  };
  const t1 = new THREE.Vector3(); const t2 = new THREE.Vector3(); const t3 = new THREE.Vector3();
  return grid(na, nb, (u, v, out) => {
    at(u, clamp(v, 0.001, 0.999), out.p);
    at(u + 0.004, clamp(v, 0.001, 0.999), t1).sub(out.p);
    at(u, clamp(v + 0.004, 0.001, 0.999), t2).sub(out.p);
    t3.crossVectors(t1, t2);
    out.n.copy(t3.lengthSq() > 1e-16 ? t3.normalize() : new THREE.Vector3(0, 1, 0));
    out.u = u * 3; out.v = v * 2;
  }, true);
}

/** Cylinder about Y, centred at the origin. */
export function cyl(rTop: number, rBot: number, h: number, seg = 16, caps = true): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !caps);
  g.deleteAttribute('uv1');
  return g;
}

/** Tube swept along a polyline, smoothed. */
export function tube(points: THREE.Vector3[], radius: number, radial = 10, seg?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
  const n = seg ?? Math.max(8, Math.round(curve.getLength() * 26));
  const g = new THREE.TubeGeometry(curve, n, radius, radial, false);
  g.deleteAttribute('uv1');
  return g;
}

/** A coil spring: a helical tube about Y, rising from y = 0 to y = h. */
export function coil(radius: number, wire: number, h: number, turns: number, radial = 8): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = Math.max(24, Math.round(turns * 14));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const ang = k * turns * Math.PI * 2;
    // Closed and ground ends: the first and last half turn lie flat.
    const ease = Math.min(1, k * turns * 2) * Math.min(1, (1 - k) * turns * 2);
    pts.push(new THREE.Vector3(
      Math.cos(ang) * radius,
      lerp(wire, h - wire, k) - (1 - ease) * wire * 0.35,
      Math.sin(ang) * radius,
    ));
  }
  return tube(pts, wire, radial, steps);
}

export interface Place {
  pos?: [number, number, number];
  /** Euler XYZ, radians. */
  rot?: [number, number, number];
  scale?: [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();

export function place(g: THREE.BufferGeometry, p: Place): THREE.BufferGeometry {
  _e.set(p.rot?.[0] ?? 0, p.rot?.[1] ?? 0, p.rot?.[2] ?? 0);
  _q.setFromEuler(_e);
  _v.set(p.pos?.[0] ?? 0, p.pos?.[1] ?? 0, p.pos?.[2] ?? 0);
  _sc.set(p.scale?.[0] ?? 1, p.scale?.[1] ?? 1, p.scale?.[2] ?? 1);
  _m.compose(_v, _q, _sc);
  g.applyMatrix4(_m);
  return g;
}

/** Mirror about X = 0, fixing winding and normals. */
export function mirror(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  p.needsUpdate = true; n.needsUpdate = true;
  const idx = g.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    idx.setX(i, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
  idx.needsUpdate = true;
  return g;
}

/** Merge geometries carrying position / normal / uv, all indexed. */
export function merge(list: Array<THREE.BufferGeometry | null | undefined>): THREE.BufferGeometry {
  const kept: THREE.BufferGeometry[] = [];
  for (const g of list) {
    if (!g) continue;
    if ((g.getAttribute('position')?.count ?? 0) === 0) continue;
    kept.push(g.getIndex() ? g : indexify(g));
  }
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
    pos.set(g.getAttribute('position').array as Float32Array, vo * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    const t = g.getAttribute('uv');
    if (t) uv.set(t.array as Float32Array, vo * 2);
    const gi = g.getIndex()!;
    for (let k = 0; k < gi.count; k++) idx[io + k] = gi.getX(k) + vo;
    vo += g.getAttribute('position').count;
    io += gi.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function indexify(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const idx = new Uint32Array(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

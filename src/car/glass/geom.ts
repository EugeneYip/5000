/**
 * Geometry toolbox for the glazing.
 *
 * Nothing here knows about the car. Three jobs only: build a quad grid from a
 * parametric sampler, sweep a small profile along a path (every seal and
 * moulding on the car is a swept profile), and merge the results so a pane and
 * its neighbours cost one draw call rather than nine.
 */

import * as THREE from 'three';

export interface Sample {
  p: THREE.Vector3;
  n: THREE.Vector3;
  u: number;
  v: number;
}

export type Sampler = (a: number, b: number, out: Sample) => void;

const _s: Sample = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };
const _e0 = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _cr = new THREE.Vector3();

/**
 * Quad grid over the unit square. Winding is decided from the sampled normal
 * rather than from the caller's parameter order, because a pane on the left of
 * the car runs the opposite way round from the same pane on the right and
 * making every caller remember that is how you end up with invisible glass.
 */
export function grid(na: number, nb: number, sample: Sampler, flip = false): THREE.BufferGeometry {
  const pos = new Float32Array(na * nb * 3);
  const nor = new Float32Array(na * nb * 3);
  const uvs = new Float32Array(na * nb * 2);

  let k = 0;
  const first = { p: new THREE.Vector3(), n: new THREE.Vector3() };
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();

  for (let i = 0; i < na; i++) {
    const a = i / (na - 1);
    for (let j = 0; j < nb; j++) {
      const b = j / (nb - 1);
      sample(a, b, _s);
      pos[k * 3] = _s.p.x; pos[k * 3 + 1] = _s.p.y; pos[k * 3 + 2] = _s.p.z;
      nor[k * 3] = _s.n.x; nor[k * 3 + 1] = _s.n.y; nor[k * 3 + 2] = _s.n.z;
      uvs[k * 2] = _s.u; uvs[k * 2 + 1] = _s.v;
      if (i === 0 && j === 0) { first.p.copy(_s.p); first.n.copy(_s.n); }
      if (i === 1 && j === 0) pA.copy(_s.p);
      if (i === 0 && j === 1) pB.copy(_s.p);
      k++;
    }
  }

  _e0.copy(pA).sub(first.p);
  _e1.copy(pB).sub(first.p);
  _cr.crossVectors(_e0, _e1);
  const reversed = (_cr.dot(first.n) < 0) !== flip;

  const idx: number[] = [];
  const at = (i: number, j: number): number => i * nb + j;
  for (let i = 0; i < na - 1; i++) {
    for (let j = 0; j < nb - 1; j++) {
      if (reversed) {
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

/** One station of a swept path: a point, a surface normal, and where "inward" is. */
export interface PathPoint {
  p: THREE.Vector3;
  /** Outward surface normal at `p`. */
  n: THREE.Vector3;
  /** Unit vector along the surface pointing into the aperture. */
  d: THREE.Vector3;
}

/**
 * Profile of a swept section, in the (d, −n) frame of each path point:
 * `e` runs across the surface into the aperture, `m` runs into the body.
 * Metres.
 */
export type Profile = ReadonlyArray<readonly [number, number]>;

/**
 * Sweep `profile` along `path`. Normals are taken from the profile's own slope
 * so a moulding catches a highlight along its crown the way a real extrusion
 * does; a flat-normalled strip reads as a painted line instead.
 */
export function sweep(path: PathPoint[], profile: Profile, closed = false, vScale = 1): THREE.BufferGeometry {
  const n = path.length;
  const m = profile.length;
  if (n < 2 || m < 2) return new THREE.BufferGeometry();

  const pos = new Float32Array(n * m * 3);
  const nor = new Float32Array(n * m * 3);
  const uvs = new Float32Array(n * m * 2);

  // Profile-space normals, one per profile vertex, averaged across the joint.
  const pn: Array<[number, number]> = [];
  for (let j = 0; j < m; j++) {
    let ex = 0, ey = 0;
    if (j > 0) {
      const dx = profile[j][0] - profile[j - 1][0];
      const dy = profile[j][1] - profile[j - 1][1];
      const l = Math.hypot(dx, dy) || 1;
      ex += dy / l; ey += -dx / l;
    }
    if (j < m - 1) {
      const dx = profile[j + 1][0] - profile[j][0];
      const dy = profile[j + 1][1] - profile[j][1];
      const l = Math.hypot(dx, dy) || 1;
      ex += dy / l; ey += -dx / l;
    }
    const l = Math.hypot(ex, ey) || 1;
    pn.push([ex / l, ey / l]);
  }

  let run = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) run += path[i].p.distanceTo(path[i - 1].p);
    const { p, n: sn, d } = path[i];
    for (let j = 0; j < m; j++) {
      const [e, mm] = profile[j];
      const k = i * m + j;
      pos[k * 3] = p.x + d.x * e - sn.x * mm;
      pos[k * 3 + 1] = p.y + d.y * e - sn.y * mm;
      pos[k * 3 + 2] = p.z + d.z * e - sn.z * mm;
      const [ne, nm] = pn[j];
      // Profile normal (ne along d, nm along +m) mapped back into world. The
      // sign on nm is negative because m runs into the body, along −n.
      const wx = d.x * ne - sn.x * nm;
      const wy = d.y * ne - sn.y * nm;
      const wz = d.z * ne - sn.z * nm;
      const l = Math.hypot(wx, wy, wz) || 1;
      nor[k * 3] = wx / l; nor[k * 3 + 1] = wy / l; nor[k * 3 + 2] = wz / l;
      uvs[k * 2] = run * vScale;
      uvs[k * 2 + 1] = j / (m - 1);
    }
  }

  const idx: number[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j, b = i2 * m + j, c = i2 * m + j + 1, dd = i * m + j + 1;
      idx.push(a, b, c);
      idx.push(a, c, dd);
    }
  }

  const g = assemble(pos, nor, uvs, idx);
  // A swept ribbon can come out either way round depending on which side of the
  // car the path runs; fix it from the first face rather than from the caller.
  fixWinding(g);
  return g;
}

/** Flip index order if the first triangle disagrees with its vertex normal. */
export function fixWinding(g: THREE.BufferGeometry): void {
  const idx = g.getIndex();
  const p = g.getAttribute('position');
  const nA = g.getAttribute('normal');
  if (!idx || idx.count < 3) return;
  const a = idx.getX(0), b = idx.getX(1), c = idx.getX(2);
  _e0.set(p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a));
  _e1.set(p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a));
  _cr.crossVectors(_e0, _e1);
  if (_cr.dot(new THREE.Vector3(nA.getX(a), nA.getY(a), nA.getZ(a))) >= 0) return;
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i);
    idx.setX(i, idx.getX(i + 2));
    idx.setX(i + 2, t);
  }
  idx.needsUpdate = true;
}

function assemble(pos: Float32Array, nor: Float32Array, uvs: Float32Array, idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(idx), 1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/** Merge geometries carrying exactly position / normal / uv, all indexed. */
export function merge(list: Array<THREE.BufferGeometry | null>): THREE.BufferGeometry {
  const kept = list.filter((g): g is THREE.BufferGeometry => !!g && (g.getAttribute('position')?.count ?? 0) > 0);
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
    uv.set(g.getAttribute('uv').array as Float32Array, vo * 2);
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
  for (const g of kept) g.dispose();
  return out;
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

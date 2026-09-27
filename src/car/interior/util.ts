/**
 * Geometry helpers for the cabin.
 *
 * Nothing here knows what an Audi is — it is the small vocabulary the rest of
 * the stream is written in: rounded solids (a cabin has no sharp edges at
 * all), swept and lathed profiles, parametric surfaces for the seats, and a
 * deterministic noise field so that every "worn" detail is the same worn
 * detail on every reload.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Merge, then drop the attributes the cabin materials never read. They shade
 * from object-space position, so keeping per-vertex uv on 300 k triangles of
 * seat foam buys nothing and costs a third of the buffer.
 */
export function merge(geos: THREE.BufferGeometry[], keepUv = false): THREE.BufferGeometry {
  const usable = geos.filter((g) => g.getAttribute('position'));
  for (const g of usable) {
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) g.deleteAttribute(name);
    }
    if (keepUv && !g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.getIndex()) {
      const n = g.getAttribute('position').count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
  }
  const out = usable.length === 1 ? usable[0] : mergeGeometries(usable, false);
  if (!out) throw new Error('interior: geometry merge failed');
  return out;
}

export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  if (name) m.name = name;
  return m;
}

/** Translate in place and return, so a geometry can be positioned inline. */
export function at(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

/**
 * Reverse a surface's winding, and with it the side it is visible from.
 *
 * Every panel in this stream is a one-sided sheet, so which way it is wound
 * decides whether it exists at all: a sheet wound to face the sky is *gone*
 * from any camera under it, and the eye then runs through it to whatever is
 * beyond — which, for the roof, is the sky itself.
 *
 * Two authoring habits produce a sheet wound the wrong way, and both were in
 * here: a `surface()` whose two parameters happen to run (i → +x, j → −z),
 * which puts the normal at +y whether the part is a floor or a roof lining;
 * and a part built for both sides as `side * f(x)`, which mirrors the sheet
 * without reversing its winding, so the left-hand copy comes out inside-out.
 * Use `mirrored()` for the second case where the part really is a mirror
 * image, and this where the parameterisation is simply the wrong way round.
 */
export function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as Uint32Array | Uint16Array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  } else {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 2);
      p.setXYZ(i, b.x, b.y, b.z);
      p.setXYZ(i + 2, a.x, a.y, a.z);
    }
    p.needsUpdate = true;
  }
  const n = g.getAttribute('normal');
  if (n) {
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    n.needsUpdate = true;
  }
  return g;
}

/** Mirror across the centreline. Winding is flipped back so normals survive. */
export function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const idx = m.getIndex();
  if (idx) {
    const a = idx.array as Uint32Array | Uint16Array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  const n = m.getAttribute('normal');
  if (n) { for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i)); n.needsUpdate = true; }
  return m;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function roundedRect(w: number, h: number, r: number, seg = 4): THREE.Shape {
  const rr = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
  const x = w / 2 - rr;
  const y = h / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-x - rr, -y);
  s.absarc(-x, -y, rr, Math.PI, Math.PI * 1.5, false);
  s.lineTo(x, -y - rr);
  s.absarc(x, -y, rr, Math.PI * 1.5, TAU, false);
  s.lineTo(x + rr, y);
  s.absarc(x, y, rr, 0, Math.PI * 0.5, false);
  s.lineTo(-x, y + rr);
  s.absarc(-x, y, rr, Math.PI * 0.5, Math.PI, false);
  s.curves.forEach((c) => { if ((c as THREE.EllipseCurve).isEllipseCurve) (c as THREE.EllipseCurve & { arcLengthDivisions: number }).arcLengthDivisions = seg; });
  return s;
}

/**
 * A box with every one of its twelve edges radiused. Extrude-with-bevel gets
 * there in one call and keeps the tri count honest: `seg` 1 is a chamfer, 3 is
 * a radius you can see a highlight roll along.
 */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 2, cornerSeg = 3): THREE.BufferGeometry {
  const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const shape = roundedRect(w - 2 * rr, h - 2 * rr, Math.max(1e-4, rr * 1.6), cornerSeg);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - 2 * rr),
    bevelEnabled: true,
    bevelSize: rr,
    bevelThickness: rr,
    bevelSegments: seg,
    curveSegments: cornerSeg,
    steps: 1,
  });
  g.translate(0, 0, -(d - 2 * rr) / 2 - rr);
  g.computeVertexNormals();
  return g;
}

/** A flat panel with a rounded outline — dash lids, switch keycaps, badges. */
export function slab(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  return roundedBox(w, h, d, Math.min(r, d / 2), seg, 4);
}

export function cyl(rTop: number, rBot: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
}

export function tube(points: Vec3[], radius: number, radial = 8, closed = false, tension = 0.5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, Math.max(4, points.length * 4), radius, radial, closed);
}

// ---------------------------------------------------------------------------
// Parametric surfaces — how every soft part in the cabin is built
// ---------------------------------------------------------------------------

/**
 * A quad grid over (i, j). `closedU` wraps the i direction, which is what
 * turns a section sweep into a closed tube. Normals are averaged afterwards
 * because the surfaces this builds are deliberately lumpy.
 */
export function surface(
  nu: number,
  nv: number,
  closedU: boolean,
  fn: (i: number, j: number, out: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const uCount = closedU ? nu : nu + 1;
  const vCount = nv + 1;
  const pos = new Float32Array(uCount * vCount * 3);
  const uv = new Float32Array(uCount * vCount * 2);
  const v = new THREE.Vector3();
  for (let j = 0; j < vCount; j++) {
    for (let i = 0; i < uCount; i++) {
      fn(i, j, v);
      const k = (j * uCount + i) * 3;
      pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      const q = (j * uCount + i) * 2;
      uv[q] = i / (closedU ? nu : nu);
      uv[q + 1] = j / nv;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < (closedU ? nu : nu); i++) {
      const a = j * uCount + i;
      const b = j * uCount + ((i + 1) % uCount);
      const c = (j + 1) * uCount + ((i + 1) % uCount);
      const d = (j + 1) * uCount + i;
      idx.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Deterministic noise — the source of every sag, crease and scuff
// ---------------------------------------------------------------------------

function hashI(x: number, y: number, z: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Value noise, 0..1. */
export function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c00 = l(hashI(xi, yi, zi), hashI(xi + 1, yi, zi), xf);
  const c10 = l(hashI(xi, yi + 1, zi), hashI(xi + 1, yi + 1, zi), xf);
  const c01 = l(hashI(xi, yi, zi + 1), hashI(xi + 1, yi, zi + 1), xf);
  const c11 = l(hashI(xi, yi + 1, zi + 1), hashI(xi + 1, yi + 1, zi + 1), xf);
  return l(l(c00, c10, yf), l(c01, c11, yf), zf);
}

/** Signed fractal noise, roughly -1..1. */
export function fbm(x: number, y: number, z: number, octaves = 3): number {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += a * (noise(x * f, y * f, z * f) * 2 - 1);
    norm += a;
    a *= 0.52;
    f *= 2.07;
  }
  return sum / norm;
}

export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

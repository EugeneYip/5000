/**
 * Geometry helpers for the wheel stream.
 *
 * Everything here works in the single-wheel frame: the spin axis is +X, so
 * surfaces of revolution are built about X rather than the Y that
 * `THREE.LatheGeometry` assumes.
 */

import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type P2 = readonly [number, number];   // [axial, radius]

/**
 * Revolve a profile about the +X axis.
 *
 * Duplicate a profile point to get a hard crease there: the copies keep
 * separate indices, so `computeVertexNormals` will not average across them.
 * That is how the flange tips, the drop-centre shoulders and the pocket wall
 * stay crisp while the sidewall stays smooth.
 */
export function revolveX(
  profile: readonly P2[],
  segments: number,
  opts: { closeProfile?: boolean; uScale?: number; vFromArc?: boolean } = {},
): THREE.BufferGeometry {
  const src = opts.closeProfile ? orientClosed(profile) : profile;
  const pts = opts.closeProfile ? [...src, src[0]] : src;
  const n = pts.length;
  const cols = segments + 1;

  // v runs with arc length along the profile so textures do not smear.
  const v: number[] = [0];
  let total = 0;
  for (let i = 1; i < n; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    v.push(total);
  }
  const vScale = total > 1e-9 && opts.vFromArc !== false ? 1 / total : 1 / Math.max(n - 1, 1);

  const pos = new Float32Array(n * cols * 3);
  const uv = new Float32Array(n * cols * 2);
  const idx: number[] = [];

  for (let c = 0; c < cols; c++) {
    const a = (c / segments) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      const [ax, r] = pts[i];
      const o = (c * n + i) * 3;
      pos[o] = ax;
      pos[o + 1] = r * ca;
      pos[o + 2] = r * sa;
      const u = (c / segments) * (opts.uScale ?? 1);
      uv[(c * n + i) * 2] = u;
      uv[(c * n + i) * 2 + 1] = opts.vFromArc !== false ? v[i] * vScale : i / Math.max(n - 1, 1);
    }
  }
  for (let c = 0; c < segments; c++) {
    for (let i = 0; i < n - 1; i++) {
      const a = c * n + i;
      const b = (c + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A capsule (stadium) hole in polar space — the bottlecap's slot.
 * Built as the constant-width offset of a circular arc, which is what the
 * real casting is: a slot milled along a pitch circle with radiused ends.
 */
export function polarCapsule(innerR: number, outerR: number, spanRad: number, centreRad: number): THREE.Path {
  const rm = (innerR + outerR) / 2;
  const hw = (outerR - innerR) / 2;
  // Pull the straight run in by the cap radius so the ends read as true
  // semicircles rather than as a blunt arc with fillets.
  const half = Math.max(spanRad / 2 - hw / rm, 0.02);
  const a0 = centreRad - half;
  const a1 = centreRad + half;
  const seg = 9;
  const pts: Array<[number, number]> = [];

  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    pts.push([outerR * Math.cos(a), outerR * Math.sin(a)]);
  }
  // Semicircular cap at the leading end, bulging along the +tangent.
  pushCap(pts, rm, hw, a1, +1, seg);
  for (let i = 0; i <= seg; i++) {
    const a = a1 - ((a1 - a0) * i) / seg;
    pts.push([innerR * Math.cos(a), innerR * Math.sin(a)]);
  }
  pushCap(pts, rm, hw, a0, -1, seg);

  const path = new THREE.Path();
  path.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
  path.closePath();
  return path;
}

/** One semicircular end of a polar capsule. `dir` +1 leads, -1 trails. */
function pushCap(
  out: Array<[number, number]>,
  rm: number,
  hw: number,
  ang: number,
  dir: 1 | -1,
  seg: number,
): void {
  const ur: [number, number] = [Math.cos(ang), Math.sin(ang)];
  const ut: [number, number] = [-Math.sin(ang), Math.cos(ang)];
  const cx = rm * ur[0];
  const cy = rm * ur[1];
  for (let i = 1; i < seg; i++) {
    const t = (Math.PI * i) / seg;
    const ct = Math.cos(t) * dir;
    const st = Math.sin(t) * dir;
    out.push([cx + hw * (ct * ur[0] + st * ut[0]), cy + hw * (ct * ur[1] + st * ut[1])]);
  }
}

/** Circle as a Shape or Path, wound either way. */
export function circlePath(r: number, segments = 72, reverse = false): THREE.Path {
  const p = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const a = ((reverse ? -i : i) / segments) * Math.PI * 2;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

/**
 * Paint per-vertex colour. This is how the dirt story is told: brake dust in
 * the recesses, rust on the unswept iron, road film in the barrel. Vertex
 * colours need no UV unwrap and cost one attribute.
 */
export function paintVertexColors(
  geom: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void,
): THREE.BufferGeometry {
  const pos = geom.getAttribute('position');
  const nrm = geom.getAttribute('normal');
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (nrm) n.fromBufferAttribute(nrm, i);
    else n.set(0, 1, 0);
    c.setRGB(1, 1, 1);
    fn(p, n, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geom;
}

/** Deterministic value noise, so every build of the car is the same car. */
export function hash1(x: number): number {
  const s = Math.sin(x * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * smoothNoise(x * f, y * f, z * f);
    f *= 2.07;
    a *= 0.5;
  }
  return v;
}
function smoothNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (i: number, j: number, k: number): number => hash3(xi + i, yi + j, zi + k);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
};

/** Triangle count of anything in the graph, for the budget. */
export function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const g = m.geometry;
      n += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    }
  });
  return Math.round(n);
}

/**
 * Signed area of a closed profile in (axial, radius).
 *
 * A closed section revolved about +X comes out with outward normals only when
 * the traversal is clockwise in that plane. Checking it here is far more
 * reliable than getting a dozen hand-written profiles the right way round, and
 * an inside-out part is invisible under back-face culling rather than
 * obviously wrong, so it is easy to miss.
 */
export function profileArea(p: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

function orientClosed(p: readonly P2[]): readonly P2[] {
  return profileArea(p) > 0 ? [...p].reverse() : p;
}

/**
 * Revolve a closed profile through part of a turn about +X, with flat end
 * caps. This is how the caliper is built: a real caliper follows the disc's
 * curvature, and a straight box in its place reads as a prop immediately.
 */
export function arcRevolve(
  rawProfile: readonly P2[],
  angFrom: number,
  angTo: number,
  segments: number,
): THREE.BufferGeometry {
  const profile = orientClosed(rawProfile);
  const n = profile.length;
  const cols = segments + 1;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  for (let c = 0; c < cols; c++) {
    const a = angFrom + ((angTo - angFrom) * c) / segments;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      pos.push(profile[i][0], profile[i][1] * ca, profile[i][1] * sa);
      uv.push(c / segments, i / n);
    }
  }
  for (let c = 0; c < segments; c++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = c * n + i;
      const b = (c + 1) * n + i;
      const a2 = c * n + j;
      const b2 = (c + 1) * n + j;
      idx.push(a, b, a2, b, b2, a2);
    }
  }

  // Caps: ear-clip the profile polygon and stitch it onto both ends.
  const contour = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const ccw = THREE.ShapeUtils.isClockWise(contour);
  const base0 = 0;
  const base1 = segments * n;
  for (const f of faces) {
    if (ccw) {
      idx.push(base0 + f[0], base0 + f[1], base0 + f[2]);
      idx.push(base1 + f[2], base1 + f[1], base1 + f[0]);
    } else {
      idx.push(base0 + f[2], base0 + f[1], base0 + f[0]);
      idx.push(base1 + f[0], base1 + f[1], base1 + f[2]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Merge a mixed bag of geometries. `mergeGeometries` insists every input has
 * the same attributes and the same index-or-not state, and `ExtrudeGeometry`,
 * `TorusGeometry` and hand-built strips all disagree about that, so normalise
 * first rather than hand-tuning each call site.
 */
export function mergeAll(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalised = geoms.map((src) => {
    let g = src;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!g.getIndex()) g = BGU.mergeVertices(g, 1e-5);
    return g;
  });
  const merged = BGU.mergeGeometries(normalised);
  if (!merged) throw new Error('[wheels] geometry merge failed');
  return merged;
}

/** Mirror about the XY plane, keeping the winding consistent. */
export function mirrorZ(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.scale(1, 1, -1);
  const idx = g.getIndex();
  if (idx) {
    const a = idx.array as unknown as number[];
    for (let i = 0; i < idx.count; i += 3) {
      const t = a[i];
      a[i] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Flat UVs for a lathe-style part: u around the axle, v with radius. */
export function radialUv(g: THREE.BufferGeometry, rRef: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    uv[i * 2] = (Math.atan2(z, y) / (Math.PI * 2) + 0.5) * 6;
    uv[i * 2 + 1] = Math.hypot(y, z) / rRef;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

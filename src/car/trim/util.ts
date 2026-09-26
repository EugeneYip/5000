/**
 * Geometry primitives for the trim stream.
 *
 * Everything here exists because a real trim part is a *section swept along a
 * path*: a bumper is a moulded section run round the nose, a rub strip is a
 * crowned section run along the body side, a roof rail is an extrusion. So the
 * central primitive is `sweep()`, and almost every part in this directory is
 * one section plus one list of frames.
 *
 * The second rule the house style asks for — no perfectly sharp edges — is met
 * by putting three or four points into every corner of a section rather than
 * by post-processing normals: smooth shading over a well-sampled corner gives
 * a radius that catches a highlight, which is the whole point.
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Pt = readonly [number, number];

/** A station along a swept path: origin, section-right, section-up. */
export interface Frame {
  o: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smoothstep = (k: number): number => k * k * (3 - 2 * k);
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Sweeping
// ---------------------------------------------------------------------------

export interface SweepOpts {
  /** Section is a closed loop (a tube) rather than an open strip. */
  closed?: boolean;
  /** Triangulate the first / last section as a flat cap. Closed sections only. */
  capStart?: boolean;
  capEnd?: boolean;
  /** Flip winding if the frames run the other way round. */
  flip?: boolean;
  /** Metres per UV unit along the sweep. */
  uvScale?: number;
}

/**
 * Loft `section` (in frame-local right/up coordinates) through `frames`.
 *
 * Normals are computed from the resulting mesh, so a section corner sampled
 * with several points comes out as a radius and a straight run comes out flat.
 */
export function sweep(
  sectionIn: ReadonlyArray<Pt> | ((j: number, k: number) => ReadonlyArray<Pt>),
  frames: readonly Frame[],
  opts: SweepOpts = {},
): THREE.BufferGeometry {
  const nf = frames.length;
  // A section may vary along the sweep — a bumper's return gets shallower as
  // it wraps the corner, a valance tapers out before the wheel arch.
  const sections: ReadonlyArray<ReadonlyArray<Pt>> =
    typeof sectionIn === 'function'
      ? Array.from({ length: nf }, (_, j) => sectionIn(j, nf === 1 ? 0 : j / (nf - 1)))
      : Array.from({ length: nf }, () => sectionIn);
  const section = sections[0];
  const ns = section.length;
  const closed = opts.closed ?? false;
  const ring = closed ? ns : ns;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];

  // Arc length along the sweep, for a UV that does not stretch.
  const sAt: number[] = [0];
  for (let j = 1; j < nf; j++) sAt.push(sAt[j - 1] + frames[j].o.distanceTo(frames[j - 1].o));
  const total = sAt[nf - 1] || 1;

  // Arc length around the section, likewise.
  const tAt: number[] = [0];
  for (let i = 1; i < ns; i++) {
    const dx = section[i][0] - section[i - 1][0];
    const dy = section[i][1] - section[i - 1][1];
    tAt.push(tAt[i - 1] + Math.hypot(dx, dy));
  }

  const p = new THREE.Vector3();
  for (let j = 0; j < nf; j++) {
    const f = frames[j];
    const sec = sections[j];
    for (let i = 0; i < ring; i++) {
      const [sx, sy] = sec[i % ns];
      p.copy(f.o).addScaledVector(f.r, sx).addScaledVector(f.u, sy);
      pos.push(p.x, p.y, p.z);
      uv.push(sAt[j] / (opts.uvScale ?? total), tAt[i % ns] / (opts.uvScale ?? 1));
    }
  }

  const segs = closed ? ring : ring - 1;
  for (let j = 0; j < nf - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * ring + i;
      const b = j * ring + ((i + 1) % ring);
      const c = (j + 1) * ring + i;
      const d = (j + 1) * ring + ((i + 1) % ring);
      if (opts.flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);

  const caps: THREE.BufferGeometry[] = [];
  if (closed && opts.capStart) caps.push(capSection(sections[0], frames[0], !opts.flip));
  if (closed && opts.capEnd) caps.push(capSection(sections[nf - 1], frames[nf - 1], !!opts.flip));

  g.computeVertexNormals();
  if (caps.length === 0) return g;
  return mergeGeometries([g, ...caps]) ?? g;
}

/** Flat fan cap over a closed section, for the cut end of a swept part. */
function capSection(section: ReadonlyArray<Pt>, f: Frame, flip: boolean): THREE.BufferGeometry {
  let cx = 0, cy = 0;
  for (const [x, y] of section) { cx += x; cy += y; }
  cx /= section.length; cy /= section.length;

  const pos: number[] = [];
  const uv: number[] = [];
  const p = new THREE.Vector3();
  p.copy(f.o).addScaledVector(f.r, cx).addScaledVector(f.u, cy);
  pos.push(p.x, p.y, p.z); uv.push(0.5, 0.5);
  for (const [x, y] of section) {
    p.copy(f.o).addScaledVector(f.r, x).addScaledVector(f.u, y);
    pos.push(p.x, p.y, p.z); uv.push(0.5, 0.5);
  }
  const idx: number[] = [];
  for (let i = 0; i < section.length; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % section.length);
    if (flip) idx.push(0, b, a); else idx.push(0, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Frames for a path lying in the XZ plane, section-up = +Y and section-right =
 * the outward horizontal normal. This is the bumper/valance case.
 */
export function framesXZ(spine: ReadonlyArray<Pt>, y = 0): Frame[] {
  const n = spine.length;
  return spine.map((_, i) => {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    // Outward = tangent rotated +90° about +Y, so a spine walked with x
    // increasing hands back a normal pointing forwards (+Z) at the centreline.
    const r = new THREE.Vector3(-tz / len, 0, tx / len);
    return { o: new THREE.Vector3(spine[i][0], y, spine[i][1]), r, u: new THREE.Vector3(0, 1, 0) };
  });
}

/** Frames along a 3D polyline whose section-right is a supplied normal field. */
export function framesFrom(points: readonly THREE.Vector3[], normals: readonly THREE.Vector3[]): Frame[] {
  const n = points.length;
  return points.map((o, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const tangent = b.clone().sub(a).normalize();
    const r = normals[i].clone().normalize();
    // Up = tangent × right, re-orthogonalised so the section never shears.
    const u = new THREE.Vector3().crossVectors(tangent, r).normalize();
    r.crossVectors(u, tangent).normalize();
    return { o: o.clone(), r, u };
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** Quarter-arc from angle a0 to a1 about (cx, cy), radius r, `n` steps. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Closed rounded-rectangle section, centred on the origin. */
export function roundedRectSection(w: number, h: number, r: number, n = 4): Pt[] {
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  return [
    ...arc(hw, hh, r, 0, Math.PI / 2, n),
    ...arc(-hw, hh, r, Math.PI / 2, Math.PI, n),
    ...arc(-hw, -hh, r, Math.PI, 1.5 * Math.PI, n),
    ...arc(hw, -hh, r, 1.5 * Math.PI, 2 * Math.PI, n),
  ];
}

export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

// ---------------------------------------------------------------------------
// Solids
// ---------------------------------------------------------------------------

/**
 * A box with every edge radiused. Built as a bevelled extrusion so the radius
 * is real geometry rather than a normal-map trick.
 */
export function roundedBox(w: number, h: number, d: number, r: number, curve = 5): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const shape = roundedRectShape(Math.max(w - 2 * rr, 1e-4), Math.max(h - 2 * rr, 1e-4), Math.max(rr * 0.9, 1e-4));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(d - 2 * rr, 1e-4),
    bevelEnabled: true,
    bevelSize: rr,
    bevelThickness: rr,
    bevelSegments: 3,
    curveSegments: curve,
    steps: 1,
  });
  g.translate(0, 0, -(d - 2 * rr) / 2 - rr);
  return smooth(g, 55);
}

/** Surface of revolution about +Y from a (radius, y) profile. */
export function lathe(profile: ReadonlyArray<Pt>, segments = 28, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y));
  const g = new THREE.LatheGeometry(pts, segments, 0, phiLength);
  return g;
}

/**
 * Weld coincident vertices then re-shade. Extrusions come out of three flat
 * and unwelded; a moulded plastic part needs the radii smooth and the faces
 * they join still reading as faces, which is what the crease angle buys.
 */
export function smooth(g: THREE.BufferGeometry, creaseDeg = 40): THREE.BufferGeometry {
  const welded = mergeVertices(g, 1e-5);
  welded.deleteAttribute('normal');
  welded.computeVertexNormals();
  if (creaseDeg <= 0) return welded;
  // Re-split along hard creases so a flat face next to a radius stays flat.
  const out = splitCreases(welded, creaseDeg * DEG);
  return out;
}

/** Duplicate vertices whose adjoining faces disagree by more than `angle`. */
function splitCreases(g: THREE.BufferGeometry, angle: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const faceN: THREE.Vector3[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    ab.subVectors(b, a); ac.subVectors(c, a);
    faceN.push(new THREE.Vector3().crossVectors(ab, ac).normalize());
  }
  // Bucket vertices by position, average only the faces within the crease.
  const key = (i: number): string =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    const list = buckets.get(k);
    if (list) list.push(i); else buckets.set(k, [i]);
  }
  const normals = new Float32Array(n * 3);
  const cosLimit = Math.cos(angle);
  const acc = new THREE.Vector3();
  for (const list of buckets.values()) {
    for (const i of list) {
      const own = faceN[Math.floor(i / 3)];
      acc.set(0, 0, 0);
      for (const j of list) {
        const other = faceN[Math.floor(j / 3)];
        if (own.dot(other) >= cosLimit) acc.add(other);
      }
      if (acc.lengthSq() < 1e-12) acc.copy(own);
      acc.normalize();
      normals[i * 3] = acc.x; normals[i * 3 + 1] = acc.y; normals[i * 3 + 2] = acc.z;
    }
  }
  src.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return src;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Mirror a geometry across the car's centreline, fixing the winding. */
export function mirrorX(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.scale(-1, 1, 1);
  const idx = g.getIndex();
  if (idx) {
    const arr = idx.array as unknown as number[];
    for (let i = 0; i < arr.length; i += 3) { const t = arr[i]; arr[i] = arr[i + 2]; arr[i + 2] = t; }
    idx.needsUpdate = true;
  } else {
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i += 3) {
      swapVertex(pos, i, i + 2);
      if (nor) swapVertex(nor, i, i + 2);
      if (uv) swapVertex(uv, i, i + 2);
    }
  }
  const nor = g.getAttribute('normal');
  if (nor) { for (let i = 0; i < nor.count; i++) nor.setX(i, -nor.getX(i)); nor.needsUpdate = true; }
  return g;
}

function swapVertex(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, j: number): void {
  for (let k = 0; k < attr.itemSize; k++) {
    const a = attr.getComponent(i, k);
    attr.setComponent(i, k, attr.getComponent(j, k));
    attr.setComponent(j, k, a);
  }
}

/** Merge, discarding anything empty. Keeps the draw-call budget honest. */
export function merge(list: Array<THREE.BufferGeometry | null | undefined>): THREE.BufferGeometry {
  const keep = list.filter((g): g is THREE.BufferGeometry => !!g && g.getAttribute('position')?.count > 0);
  const norm = keep.map((g) => {
    if (!g.getAttribute('uv')) {
      const c = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c * 2), 2));
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g.index ? g.toNonIndexed() : g;
  });
  if (norm.length === 0) return new THREE.BufferGeometry();
  if (norm.length === 1) return norm[0];
  return mergeGeometries(norm) ?? norm[0];
}

/** Place a geometry: translate, then optionally rotate about each axis first. */
export function at(
  g: THREE.BufferGeometry,
  pos: readonly [number, number, number],
  rot?: readonly [number, number, number],
): THREE.BufferGeometry {
  if (rot) {
    if (rot[0]) g.rotateX(rot[0]);
    if (rot[1]) g.rotateY(rot[1]);
    if (rot[2]) g.rotateZ(rot[2]);
  }
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}

/** A cap-head bolt: dome, washer face, and a hint of a hex socket. */
export function bolt(headR: number, headH: number): THREE.BufferGeometry {
  const prof: Pt[] = [
    [0, headH],
    [headR * 0.30, headH * 0.985],
    [headR * 0.55, headH * 0.94],
    [headR * 0.78, headH * 0.84],
    [headR * 0.93, headH * 0.66],
    [headR, headH * 0.40],
    [headR, headH * 0.12],
    [headR * 0.97, 0.0],
    [headR * 1.35, 0.0],
    [headR * 1.42, -headH * 0.14],
    [headR * 1.35, -headH * 0.26],
    [0, -headH * 0.26],
  ];
  return lathe(prof, 20);
}

/**
 * Offset an open 2D polyline along its own normal. Used wherever a bright
 * strip has to lie *on* a moulding rather than near it: the strip profile is
 * then the bumper's own profile plus its stand-off, and the two cannot drift.
 */
export function offsetPolyline(pts: ReadonlyArray<Pt>, d: number): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [p[0] + (ty / len) * d, p[1] - (tx / len) * d] as Pt;
  });
}

/** Sample an (x, y) profile as a polyline between two heights. */
export function profileStrip(yFrom: number, yTo: number, steps: number, x: (y: number) => number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = lerp(yFrom, yTo, i / steps);
    out.push([x(y), y]);
  }
  return out;
}

/**
 * A pressed pocket in a panel: a flat rim, a rolled edge and a flat floor.
 *
 * Built as a single displaced grid rather than a swept wall plus a back plate,
 * because a pocket made of two pieces has a seam that has to be watertight and
 * correctly wound at every station, and a door handle is not worth that.
 * `shape` is a superellipse exponent: 4 gives the soft-cornered rectangle the
 * C3's recessed pull handle sits in.
 */
export function dish(w: number, h: number, depth: number, opts: { shape?: number; rim?: number; floor?: number; seg?: number } = {}): THREE.BufferGeometry {
  const p = opts.shape ?? 4;
  const rim = opts.rim ?? 0.0009;
  const floor = opts.floor ?? 0.62;
  const n = opts.seg ?? 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      const r = Math.pow(Math.pow(Math.abs(u), p) + Math.pow(Math.abs(v), p), 1 / p);
      const k = 1 - smoothstep(clamp((r - floor) / (1 - floor), 0, 1));
      pos.push((u * w) / 2, (v * h) / 2, rim - (depth + rim) * k);
      uv.push(i / n, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Mesh helper — every part in this directory is named so a render is debuggable. */
export function mesh(name: string, g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.name = name;
  return o;
}

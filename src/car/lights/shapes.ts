/**
 * Geometry primitives for lamp hardware.
 *
 * A lamp is a stack of thin shells that all follow the same body surface: the
 * lens sits on it, the bezel stands a few millimetres proud of it, the
 * reflector rim sits behind it. So every primitive here takes the body's own
 * `zAt(x, y)` and an offset *into* the car, rather than a flat plane — which is
 * what keeps the parts flush on a nose that wraps 15 mm across the lamp and a
 * tail that wraps 90 mm.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Facing = 1 | -1;
/** Body outer surface: the z of the skin at a point on the front or rear face. */
export type FaceZ = (x: number, y: number) => number;

const _p = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Grid surfaces
// ---------------------------------------------------------------------------

export interface GridOpts {
  nu: number;
  nv: number;
  point(u: number, v: number, out: THREE.Vector3): void;
  /** Reverse the winding — for a shell whose outward side faces −Z. */
  flip?: boolean;
  /** Weld the u = 0 and u = 1 columns, for a closed revolve. */
  closeU?: boolean;
}

/**
 * A quad mesh over the unit square. Normals come from the triangles rather
 * than from an analytic derivative: every surface here is either a shallow
 * shell or a paraboloid, where the difference is far below what a 3 mm part
 * shows, and computing them this way cannot disagree with the geometry.
 */
export function gridSurface(o: GridOpts): THREE.BufferGeometry {
  const nu = Math.max(1, o.nu);
  const nv = Math.max(1, o.nv);
  const cols = o.closeU ? nu : nu + 1;
  const rows = nv + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const idx: number[] = [];

  let a = 0;
  let b = 0;
  for (let j = 0; j < rows; j++) {
    const v = j / nv;
    for (let i = 0; i < cols; i++) {
      const u = i / nu;
      o.point(u, v, _p);
      pos[a++] = _p.x;
      pos[a++] = _p.y;
      pos[a++] = _p.z;
      uv[b++] = u;
      uv[b++] = v;
    }
  }

  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i1 = o.closeU ? (i + 1) % cols : i + 1;
      const p00 = j * cols + i;
      const p10 = j * cols + i1;
      const p01 = (j + 1) * cols + i;
      const p11 = (j + 1) * cols + i1;
      if (o.flip) idx.push(p00, p11, p10, p00, p01, p11);
      else idx.push(p00, p10, p11, p00, p11, p01);
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
// Outlines
// ---------------------------------------------------------------------------

/**
 * A lamp aperture, described the way a draughtsman would: a height band with
 * an inboard and an outboard edge that may each vary with height, and a corner
 * radius on each. Nothing in a lamp is a sharp corner.
 */
export interface Outline {
  yLo: number;
  yHi: number;
  xInner(y: number): number;
  xOuter(y: number): number;
  radiusInner?: number;
  radiusOuter?: number;
}

function cornerInset(y: number, yLo: number, yHi: number, r: number): number {
  if (r <= 0) return 0;
  const d = Math.min(y - yLo, yHi - y);
  if (d >= r) return 0;
  const k = r - Math.max(d, 0);
  return r - Math.sqrt(Math.max(r * r - k * k, 0));
}

export interface Span {
  y: number;
  xLo: number;
  xHi: number;
}

/** x limits at an absolute height, corner radii applied. */
export function limitsAt(o: Outline, y: number, out: Span = { y: 0, xLo: 0, xHi: 0 }): Span {
  out.y = y;
  out.xLo = o.xInner(y) + cornerInset(y, o.yLo, o.yHi, o.radiusInner ?? 0);
  out.xHi = o.xOuter(y) - cornerInset(y, o.yLo, o.yHi, o.radiusOuter ?? 0);
  if (out.xHi < out.xLo) {
    const m = (out.xHi + out.xLo) * 0.5;
    out.xLo = m;
    out.xHi = m;
  }
  return out;
}

/** Resolve the outline at parameter v ∈ [0,1], corner radii applied. */
export function spanAt(o: Outline, v: number, out: Span = { y: 0, xLo: 0, xHi: 0 }): Span {
  return limitsAt(o, o.yLo + (o.yHi - o.yLo) * v, out);
}

/** Shrink an outline by `m` metres on every side — a seal, a gap, a rebate. */
export function inset(o: Outline, m: number): Outline {
  return {
    yLo: o.yLo + m,
    yHi: o.yHi - m,
    xInner: (y) => o.xInner(y) + m,
    xOuter: (y) => o.xOuter(y) - m,
    radiusInner: Math.max((o.radiusInner ?? 0) - m, 0),
    radiusOuter: Math.max((o.radiusOuter ?? 0) - m, 0),
  };
}

/**
 * Take a vertical slice of an outline between two x values.
 *
 * The parent's corner radii are *baked into* the slice's edge functions rather
 * than dropped. Without that, a lens sliced out of a cluster with a 46 mm
 * rounded outboard corner comes back square, pokes out past the housing that
 * still has the radius, and shows bare reflector against the sky.
 */
export function sliceX(o: Outline, xLo: number, xHi: number, radius = 0): Outline {
  const s = { y: 0, xLo: 0, xHi: 0 };
  return {
    yLo: o.yLo,
    yHi: o.yHi,
    xInner: (y) => Math.max(limitsAt(o, y, s).xLo, xLo),
    xOuter: (y) => Math.min(limitsAt(o, y, s).xHi, xHi),
    radiusInner: radius,
    radiusOuter: radius,
  };
}

/** Take a horizontal band of an outline, likewise keeping the parent's corners. */
export function sliceY(o: Outline, yLo: number, yHi: number, radius = 0.004): Outline {
  const s = { y: 0, xLo: 0, xHi: 0 };
  return {
    yLo: Math.max(o.yLo, yLo),
    yHi: Math.min(o.yHi, yHi),
    xInner: (y) => limitsAt(o, y, s).xLo,
    xOuter: (y) => limitsAt(o, y, s).xHi,
    radiusInner: radius,
    radiusOuter: radius,
  };
}

// ---------------------------------------------------------------------------
// Slabs — the workhorse
// ---------------------------------------------------------------------------

export interface SlabOpts {
  outline: Outline;
  zAt: FaceZ;
  facing: Facing;
  /** Depth of the outer face below the body skin. Negative stands it proud. */
  front: number;
  /** Depth of the inner face. Must be greater than `front`. */
  back: number;
  nu?: number;
  nv?: number;
  /** Crown the outer face out of the skin by this much at its centre. */
  crown?: number;
  capFront?: boolean;
  capBack?: boolean;
  walls?: boolean;
}

/**
 * A closed slab following the body skin: outer face, inner face and the rim
 * between them. Lenses, bezels, housings and dividers are all this shape.
 */
export function slab(o: SlabOpts): THREE.BufferGeometry {
  const nu = o.nu ?? 22;
  const nv = o.nv ?? 14;
  const crown = o.crown ?? 0;
  const s = { y: 0, xLo: 0, xHi: 0 };

  const at = (u: number, v: number, depth: number, bulge: number, out: THREE.Vector3): void => {
    spanAt(o.outline, v, s);
    const x = s.xLo + (s.xHi - s.xLo) * u;
    const d = depth - bulge * 4 * u * (1 - u) * (4 * v * (1 - v));
    out.set(x, s.y, o.zAt(x, s.y) - o.facing * d);
  };

  const parts: THREE.BufferGeometry[] = [];

  if (o.capFront !== false) {
    parts.push(
      gridSurface({
        nu, nv,
        flip: o.facing < 0,
        point: (u, v, out) => at(u, v, o.front, crown, out),
      }),
    );
  }
  if (o.capBack !== false) {
    parts.push(
      gridSurface({
        nu, nv,
        flip: o.facing > 0,
        point: (u, v, out) => at(u, v, o.back, 0, out),
      }),
    );
  }

  if (o.walls !== false) {
    // The rim is one continuous strip round the outline's perimeter.
    parts.push(
      gridSurface({
        nu: nu * 2,
        nv: 2,
        closeU: true,
        flip: o.facing < 0,
        point: (u, v, out) => {
          const [pu, pv] = perimeter(u);
          at(pu, pv, o.front + (o.back - o.front) * v, crown * (1 - v), out);
        },
      }),
    );
  }

  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false)!;
}

/** A flat-ish panel on the skin — one face only. */
export function facePanel(o: Omit<SlabOpts, 'back' | 'capBack' | 'walls'>): THREE.BufferGeometry {
  return slab({ ...o, back: o.front, capBack: false, walls: false });
}

// ---------------------------------------------------------------------------
// Reflector bowls
// ---------------------------------------------------------------------------

export interface BowlOpts {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  /** z of the rim plane. Ignored when `zAt` is given. */
  zRim?: number;
  /**
   * Body surface the rim follows, with `rimDepth` below it. A flat rim plane
   * is wrong on any lamp whose aperture wraps: the C3's tail face moves 90 mm
   * forward between the plate recess and the body corner, so a constant rim
   * that is buried inboard stands 60 mm *outside* the bodywork outboard.
   */
  zAt?: FaceZ;
  rimDepth?: number;
  facing: Facing;
  /** Vertex depth behind the rim. Negative gives a dome. */
  depth: number;
  /** Superellipse exponent of the optic: 2 = ellipse, 6 = rounded rectangle. */
  corner?: number;
  /** Flat disc at the vertex, normalised, where the bulb collar lands. */
  flat?: number;
  nu?: number;
  nv?: number;
  /**
   * Clip the bowl into an aperture. A chamber at the outboard end of a
   * headlamp is a wedge, not a rectangle, because the wing rolls away above
   * it; without this the corner of the bowl floats outside the bodywork.
   */
  fit?: Outline;
}

/**
 * Parabolic bowl filling a rectangular chamber — the optic a 1980s composite
 * lamp actually uses, because the aperture is a rectangle and the reflector
 * has to fill it right into the corners.
 *
 * Meshed as a **rectangular grid**, not a radial fan. A fan over a
 * near-rectangular rim puts all its resolution in the middle and stretches
 * long thin triangles into the corners, and the shading picks that up as a
 * bow-tie right across the lamp. A grid has none of that, and it also lets the
 * bowl be clipped to an arbitrary outline a wedge at a time.
 *
 * Concave towards the lens, so it catches sky and ground and reads as depth
 * when the lamp is off — which is how it appears in almost every frame.
 */
export function bowl(o: BowlOpts): THREE.BufferGeometry {
  const n = o.corner ?? 4.2;
  const flat = o.flat ?? 0;
  const fit = o.fit;
  const s = { y: 0, xLo: 0, xHi: 0 };
  return gridSurface({
    nu: o.nu ?? 34,
    nv: o.nv ?? 24,
    flip: o.facing < 0,
    point: (u, v, out) => {
      let x = o.cx + (u * 2 - 1) * o.halfW;
      let y = o.cy + (v * 2 - 1) * o.halfH;
      if (fit) {
        y = Math.min(Math.max(y, fit.yLo), fit.yHi);
        limitsAt(fit, y, s);
        x = Math.min(Math.max(x, s.xLo), s.xHi);
      }
      const p = (x - o.cx) / o.halfW;
      const q = (y - o.cy) / o.halfH;
      // Superellipse radius: the paraboloid is a function of this, so the
      // optic stays round in the middle and squares off into the corners.
      const rho = Math.min(Math.pow(Math.pow(Math.abs(p), n) + Math.pow(Math.abs(q), n), 1 / n), 1);
      const k = flat > 0 ? Math.max((rho - flat) / (1 - flat), 0) : rho;
      const rim = o.zAt ? o.zAt(x, y) - o.facing * (o.rimDepth ?? 0) : (o.zRim ?? 0);
      out.set(x, y, rim - o.facing * o.depth * (1 - k * k));
    },
  });
}

// ---------------------------------------------------------------------------
// Frames — bezels, seals, aperture returns
// ---------------------------------------------------------------------------

export interface FrameOpts {
  outline: Outline;
  zAt: FaceZ;
  facing: Facing;
  /**
   * Cross-section, outer edge first: `[inset from the outline, depth into the
   * body]`. A negative depth stands the section proud of the skin, which is
   * what a chrome bezel does.
   */
  profile: ReadonlyArray<readonly [number, number]>;
  ns?: number;
  /** Close the strip back onto itself so it reads as solid from behind. */
  closed?: boolean;
}

/** Walk the (u, v) rectangle's perimeter once. */
function perimeter(t: number): [number, number] {
  const q = t * 4;
  if (q < 1) return [q, 0];
  if (q < 2) return [1, q - 1];
  if (q < 3) return [3 - q, 1];
  return [0, 4 - q];
}

/**
 * A ring swept round an aperture. Nothing on a car meets a panel without one:
 * the chrome bezel, the rubber seal behind it and the painted return into the
 * aperture are all this shape, differing only in cross-section.
 */
export function frame(o: FrameOpts): THREE.BufferGeometry {
  const ns = o.ns ?? 72;
  const steps = o.profile.map((p) => ({ outline: inset(o.outline, p[0]), depth: p[1] }));
  const last = steps.length - 1;
  const s = { y: 0, xLo: 0, xHi: 0 };
  return gridSurface({
    nu: ns,
    nv: last,
    closeU: true,
    flip: o.facing < 0,
    point: (u, v, out) => {
      const [pu, pv] = perimeter(u);
      const f = Math.min(Math.max(v * last, 0), last);
      const i = Math.min(Math.floor(f), last - 1);
      const k = f - i;
      const a = steps[i];
      const b = steps[i + 1];
      spanAt(a.outline, pv, s);
      const ax = s.xLo + (s.xHi - s.xLo) * pu;
      const ay = s.y;
      spanAt(b.outline, pv, s);
      const bx = s.xLo + (s.xHi - s.xLo) * pu;
      const by = s.y;
      const x = ax + (bx - ax) * k;
      const y = ay + (by - ay) * k;
      out.set(x, y, o.zAt(x, y) - o.facing * (a.depth + (b.depth - a.depth) * k));
    },
  });
}

// ---------------------------------------------------------------------------
// Bulbs
// ---------------------------------------------------------------------------

/** A helical filament, as a swept tube. */
export function filament(length: number, coilRadius: number, turns: number, wire: number): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(24, Math.round(turns * 10));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * coilRadius, Math.sin(a) * coilRadius, (t - 0.5) * length));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire, 5, false);
}

/** Axis-along-Z cylinder, so lamp internals do not need a rotation each. */
export function tubeZ(rTop: number, rBottom: number, length: number, seg = 18, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, length, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

export function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const idx = m.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i];
      a[i] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  }
  m.computeVertexNormals();
  return m;
}

/** Merge, tolerating an empty list. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return mergeGeometries(parts, false);
}

/** Geometry for one side plus its mirror, merged into a single draw call. */
export function bothSides(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return mergeGeometries([g, mirrored(g)], false)!;
}

/**
 * Panes, frit and mouldings.
 *
 * ## A pane is a slab, not a plane
 *
 * Every window is built as two skins 4–6 mm apart plus a closing edge band.
 * That is not decoration: `ctx.materials.glass()` is `side: FrontSide`, so a
 * single-sheet pane vanishes the moment you look at its back — which, for a
 * windscreen, means the moment you sit in the car. Two skins with opposed
 * winding give one front face whichever side you are on, the outer skin gets
 * the grimy exterior variant and the inner skin the clean one, and the edge
 * band gives the laminate a visible thickness at the A-pillar.
 *
 * The two skins never both draw: at any pixel, one of them is back-facing and
 * culled. So the tint does not double up, and the cost is one pane's worth.
 *
 * ## Why the frit and the demister are opaque
 *
 * three's transmission samples a snapshot of the **opaque** pass as its
 * background. Anything built as `transparent: true` is therefore invisible
 * *through* glass, which is exactly where a ceramic frit band and a heated
 * backlight's element lines live. Both are built here as real opaque geometry
 * sitting between the two skins — where the print actually is on a real
 * screen — so they are seen through the glass, tinted by it, and behave
 * correctly from both sides for free.
 */

import * as THREE from 'three';
import { grid, sweep, lerp, type Sample, type PathPoint, type Profile } from './geom';
import { glassPoint, surfaceDir, type Region } from './aperture';

const _s: Sample = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };

export interface Slab {
  outer: THREE.BufferGeometry;
  inner: THREE.BufferGeometry;
  edge: THREE.BufferGeometry;
}

export interface SlabOpts {
  region: Region;
  na: number;
  nb: number;
  thickness: number;
  /** Outer-face depth below the body skin. */
  depth: number;
}

/** Sample the outer face of a pane region. */
function faceSampler(region: Region, depth: number): (a: number, b: number, out: Sample) => void {
  return (a, b, out) => {
    const { z, t } = region(a, b);
    glassPoint(z, t, out, depth);
    out.u = a;
    out.v = b;
  };
}

export function buildSlab(o: SlabOpts): Slab {
  const face = faceSampler(o.region, o.depth);

  const outer = grid(o.na, o.nb, face);

  const inner = grid(o.na, o.nb, (a, b, out) => {
    face(a, b, out);
    out.p.addScaledVector(out.n, -o.thickness);
    out.n.negate();
  }, true);

  // Edge band: walk the pane's perimeter, joining the two skins. `d` points
  // out of the pane, so the band's normal faces away from the glass.
  const ring: PathPoint[] = [];
  const n = Math.max(o.na, o.nb);
  const perim = squareWalk(o.na * 2 + o.nb * 2);
  for (const [a, b, da, db] of perim) {
    face(a, b, _s);
    const dir = new THREE.Vector3();
    edgeDirection(o.region, o.depth, a, b, da, db, dir);
    ring.push({ p: _s.p.clone(), n: _s.n.clone(), d: dir });
  }
  const edge = sweep(ring, [[0, 0], [0.0004, 0.0002], [0.0004, o.thickness - 0.0002], [0, o.thickness]], true, 24 / Math.max(n, 1));

  return { outer, inner, edge };
}

/** Outward in-surface direction at a perimeter sample, from a finite difference. */
function edgeDirection(
  region: Region, depth: number, a: number, b: number, da: number, db: number, out: THREE.Vector3,
): THREE.Vector3 {
  const h = 0.004;
  const p0 = region(a, b);
  const p1 = region(a - da * h, b - db * h);
  return surfaceDir(p0.z, p0.t, p0.z - p1.z, p0.t - p1.t, out);
}

/**
 * Walk the perimeter of the unit square, returning `[a, b, da, db]` where
 * (da, db) is the outward direction in parameter space.
 */
function squareWalk(total: number): Array<[number, number, number, number]> {
  const per = Math.max(3, Math.round(total / 4));
  const out: Array<[number, number, number, number]> = [];
  for (let i = 0; i < per; i++) out.push([i / per, 0, 0, -1]);
  for (let i = 0; i < per; i++) out.push([1, i / per, 1, 0]);
  for (let i = 0; i < per; i++) out.push([1 - i / per, 1, 0, 1]);
  for (let i = 0; i < per; i++) out.push([0, 1 - i / per, -1, 0]);
  return out;
}

// ---------------------------------------------------------------------------
// Ceramic frit
// ---------------------------------------------------------------------------

export interface FritOpts {
  region: Region;
  /** Solid band width, as a fraction of the pane in each direction. */
  bandA: number;
  bandB: number;
  /** Depth of the print below the body skin — between the two skins. */
  depth: number;
  /** Dots around the perimeter in the first row, and how many rows. */
  dotCount: number;
  dotRows: number;
  /** Diameter of the largest dot. */
  dotSize: number;
}

export interface Frit {
  band: THREE.BufferGeometry;
  /** One matrix per dot, ready for an InstancedMesh. */
  dots: THREE.Matrix4[];
}

/**
 * A point on the rectangular ring `s` ∈ [0,1) at inset `k`: k = 0 is the pane
 * boundary, k = 1 the inner edge of the solid band, k > 1 out in the clear
 * glass where the dots live. Walking both edges with the same `s` mitres the
 * corners for free.
 */
function ringPoint(s: number, k: number, ia: number, ib: number): [number, number] {
  const da = ia * k, db = ib * k;
  const q = Math.min(0.999999, Math.max(0, s)) * 4;
  const f = q % 1;
  switch (Math.floor(q)) {
    case 0: return [lerp(da, 1 - da, f), db];
    case 1: return [1 - da, lerp(db, 1 - db, f)];
    case 2: return [lerp(1 - da, da, f), 1 - db];
    default: return [da, lerp(1 - db, db, f)];
  }
}

/**
 * The band plus the dot fade. The fade is real geometry rather than a texture
 * because it is the detail a knowledgeable eye goes to: a printed gradient
 * reads as a smudge, a shrinking field of discrete dots reads as a windscreen.
 */
export function buildFrit(o: FritOpts): Frit {
  const face = faceSampler(o.region, o.depth);
  const ia = o.bandA, ib = o.bandB;

  const band = grid(140, 4, (s, k, out) => {
    const [a, b] = ringPoint(s, k, ia, ib);
    face(a, b, out);
    out.u = s * 8;
    out.v = k;
  });

  const dots: THREE.Matrix4[] = [];
  const pa = new THREE.Vector3();
  const tanA = new THREE.Vector3();
  const tanB = new THREE.Vector3();
  const up = new THREE.Vector3();
  const scratch: Sample = { p: pa, n: new THREE.Vector3(), u: 0, v: 0 };
  const m = new THREE.Matrix4();

  const place = (s: number, k: number, size: number): void => {
    const [a, b] = ringPoint(s, k, ia, ib);
    face(a, b, _s);
    const [a2, b2] = ringPoint(s + 0.004, k, ia, ib);
    face(a2, b2, scratch);
    tanA.copy(pa).sub(_s.p);
    if (tanA.lengthSq() < 1e-12) return;
    up.copy(_s.n);
    tanA.normalize();
    tanB.crossVectors(up, tanA).normalize();
    tanA.crossVectors(tanB, up).normalize();
    m.makeBasis(tanA, tanB, up);
    m.scale(new THREE.Vector3(size, size, size));
    m.setPosition(_s.p);
    dots.push(m.clone());
  };

  for (let r = 0; r < o.dotRows; r++) {
    const f = r / Math.max(o.dotRows - 1, 1);
    // Rows march out of the band into the clear glass, shrinking as they go.
    const k = 1 + (r + 0.9) * 0.62;
    const size = o.dotSize * (1 - f * 0.68);
    const count = Math.max(6, Math.round(o.dotCount * (1 - f * 0.28)));
    for (let i = 0; i < count; i++) {
      // A perfectly regular field moirés against the pixel grid; real frit is
      // laid on a staggered pitch anyway.
      const jitter = (Math.sin(i * 12.9898 + r * 78.233) * 43758.5453) % 1;
      place((i + 0.5 + jitter * 0.3) / count, k, size);
    }
  }

  return { band, dots };
}

// ---------------------------------------------------------------------------
// Printed strips: demister elements and busbars
// ---------------------------------------------------------------------------

export interface StripOpts {
  region: Region;
  /** Constant parameter, and the axis it is constant along. */
  at: number;
  axis: 'a' | 'b';
  from: number;
  to: number;
  /** Half-width in parameter units. */
  half: number;
  depth: number;
}

export function buildStrip(o: StripOpts): THREE.BufferGeometry {
  const face = faceSampler(o.region, o.depth);
  return grid(o.axis === 'a' ? 3 : 26, o.axis === 'a' ? 26 : 3, (x, y, out) => {
    const along = o.axis === 'a' ? y : x;
    const across = o.axis === 'a' ? x : y;
    const a = o.axis === 'a' ? o.at + (across - 0.5) * 2 * o.half : lerp(o.from, o.to, along);
    const b = o.axis === 'a' ? lerp(o.from, o.to, along) : o.at + (across - 0.5) * 2 * o.half;
    face(a, b, out);
    out.u = along * 4;
    out.v = across;
  });
}

// ---------------------------------------------------------------------------
// Seals and reveals
// ---------------------------------------------------------------------------

/**
 * The C3's reveal is a slim rubber lip that bridges the body skin and the glass
 * and stands about a millimetre proud of both. Chrome-framed windows are the
 * wrong car entirely, so this stays deliberately thin: the moment it gets
 * chunky the greenhouse stops reading as flush.
 */
export const SEAL_PROFILE: Profile = [
  [-0.0040, 0.0000],
  [-0.0008, 0.0006],
  [0.0032, 0.0009],
  [0.0074, 0.0014],
  [0.0104, 0.0030],
];

/** A tighter section for the windscreen and backlight, which are barely there. */
export const BOND_PROFILE: Profile = [
  [-0.0030, 0.0000],
  [-0.0006, 0.0005],
  [0.0024, 0.0007],
  [0.0058, 0.0012],
  [0.0082, 0.0030],
];

/**
 * Sample a closed rounded-rectangle path around the unit square. Rounding the
 * corners in parameter space is what stops a swept seal pinching where its
 * sweep direction reverses.
 */
export function loopUV(s: number, r: number): [number, number] {
  const straight = 1 - 2 * r;
  const arc = (Math.PI / 2) * r;
  const total = 4 * straight + 4 * arc;
  let d = ((s % 1) + 1) % 1 * total;
  const corner = (cx: number, cy: number, a0: number, k: number): [number, number] => {
    const ang = a0 + k * (Math.PI / 2);
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  if (d < straight) return [r + d, 0];
  d -= straight;
  if (d < arc) return corner(1 - r, r, -Math.PI / 2, d / arc);
  d -= arc;
  if (d < straight) return [1, r + d];
  d -= straight;
  if (d < arc) return corner(1 - r, 1 - r, 0, d / arc);
  d -= arc;
  if (d < straight) return [1 - r - d, 1];
  d -= straight;
  if (d < arc) return corner(r, 1 - r, Math.PI / 2, d / arc);
  d -= arc;
  if (d < straight) return [0, 1 - r - d];
  d -= straight;
  return corner(r, r, Math.PI, d / arc);
}

export interface SealPathOpts {
  /** Curve in (z, t). */
  at: (k: number) => { z: number; t: number };
  n: number;
  closed?: boolean;
  /** Any direction pointing into the aperture, used once to fix the sign. */
  hint: { dz: number; dt: number };
  profile?: Profile;
}

/**
 * Sweep a seal along an aperture edge. The sweep direction is derived from the
 * path's own 3D tangent crossed with the surface normal rather than from
 * parameter space, because a unit of `t` is 3.3 m of skin at the roof and
 * 1.3 m at the beltline, and a seal built in parameter space comes out three
 * times too wide at one end.
 */
export function buildSeal(o: SealPathOpts): THREE.BufferGeometry {
  const closed = o.closed ?? false;
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  const n = o.n;
  for (let i = 0; i < n; i++) {
    const k = closed ? i / n : i / (n - 1);
    const { z, t } = o.at(k);
    const smp: Sample = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };
    glassPoint(z, t, smp, 0);
    pts.push(smp.p);
    nrm.push(smp.n);
  }

  const first = o.at(0);
  const hintDir = surfaceDir(first.z, first.t, o.hint.dz, o.hint.dt, new THREE.Vector3());

  const path: PathPoint[] = [];
  const tan = new THREE.Vector3();
  const d = new THREE.Vector3();
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const b = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    tan.copy(b).sub(a);
    if (tan.lengthSq() < 1e-14) tan.set(0, 0, 1);
    d.crossVectors(nrm[i], tan).normalize();
    if (sign === 0) sign = d.dot(hintDir) >= 0 ? 1 : -1;
    path.push({ p: pts[i], n: nrm[i], d: d.clone().multiplyScalar(sign) });
  }
  return sweep(path, o.profile ?? SEAL_PROFILE, closed, 26);
}

/**
 * An applique lying just under the body skin — a blackout, a sail panel, the
 * roof-joint moulding. `depth` may vary across `b` so the piece can roll over
 * its own edges and tuck under the glass, which is what stops it reading as a
 * decal.
 */
export function buildApplique(
  region: Region, na: number, nb: number, depth: number | ((a: number, b: number) => number),
): THREE.BufferGeometry {
  const d = typeof depth === 'function' ? depth : (): number => depth;
  return grid(na, nb, (a, b, out) => {
    const { z, t } = region(a, b);
    glassPoint(z, t, out, d(a, b));
    out.u = a * 3;
    out.v = b;
  });
}

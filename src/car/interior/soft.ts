/**
 * Upholstery.
 *
 * A seat is the one thing in a car that is *not* a designed shape: it is a
 * designed shape that a person has been sitting in. Symmetry, a flat centre
 * panel and a crisp edge are what make a rendered seat read as CG at a
 * glance, so everything here is built the other way round — a sculpted
 * cross-section, a deterministic wear field that dishes the centre, rounds
 * the front edge and drags creases out of the bolsters.
 *
 * ## The construction this models
 *
 * A C3 seat is not one upholstered surface. Measured off `bat_int_front_seats`
 * and `bat_int_rear_seats` (a 1988 US Avant cabin), every panel is
 *
 *     bolster · seam · flat insert · seam · bolster
 *
 * laterally, and the insert is crossed by **transverse** stitched seams into
 * two or three bands. The bolsters are the whole read of the seat: on the
 * backrest each one is a quarter of the panel's width and stands ~45 mm proud
 * of the insert, and the seam between them is a hard shadow line the length of
 * the seat. A `face()` term that merely swells toward the edge does not give
 * you that line, which is why the first version of this read as a slab.
 *
 * So `bolsters` and `seams` are first-class here, and `flutes` — the fine
 * longitudinal channels a velour insert carries — are masked to the insert and
 * faded out where they meet a transverse seam, because cloth flutes stop at a
 * stitch line rather than crossing it.
 *
 * And the bolster is a *different material* from the insert: smooth leather
 * against matte suede. `split` cuts the loft along the two stitch lines so the
 * two halves can be given different finishes; see `panel()`.
 *
 * ## Everything is measured in millimetres, not in v
 *
 * This is the one mistake that produced every symptom at once, and it was made
 * in three separate places.
 *
 * The noise field was evaluated in panel parameters, so a 140 mm head restraint
 * got exactly as many creases across it as a 580 mm backrest — the wrinkles
 * were four times finer on the small part and the whole cabin looked like one
 * tiled material at one scale. The seam and gutter widths were in panel
 * parameters too, so a stitch 0.017 wide was 4 mm across on a backrest and
 * 12 mm on the bench; and the narrow ones fell *below the vertex spacing*, so
 * the loft stepped straight over them.
 *
 * Widening them in metres was necessary and not sufficient. A 22 mm trough on
 * a 13 mm station pitch is only drawn if a station lands *in* it, and nothing
 * made one: a seam authored at v 0.755 on a 44-station loft falls between rows
 * 33 and 34, so the deepest point of every stitch line in the car was a place
 * with no vertex in it. Seams are snapped to a station row and the bolster
 * gutter to a ring line before anything is evaluated — see `snapSeams`.
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

/** The rolled side bolster, and the stitch line that divides it from the insert. */
export interface BolsterSpec {
  /** |t| where the seam between insert and bolster falls. */
  at: number;
  /** Crown height above the insert, metres. */
  height: number;
  /** Depth of the stitch valley at `at`. */
  seam?: number;
  /** Where the crown peaks, as a fraction of seam→edge. */
  crown?: number;
  /** Multiplier along v — a bolster dies out at both ends of its panel. */
  fade?(v: number): number;
}

/** A stitched seam running across the panel, dividing the insert into bands. */
export interface SeamSpec {
  /** Position along v. */
  at: number;
  depth: number;
  /** How hard the cloth puffs either side of the stitch. */
  puff?: number;
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
  bolsters?: BolsterSpec;
  seams?: SeamSpec[];
  /**
   * How wide the insert is at this station, as a fraction of its nominal
   * `bolsters.at`. Default 1 everywhere.
   *
   * A seat cover's centre panel is a *shaped* piece of cloth, not a stripe:
   * it is cut narrow where the shoulder roll crosses the top of a backrest
   * and where the nose roll crosses the front of a cushion, and at both of
   * those the leather carries straight over. Pinching this to near zero there
   * is what lets a single lateral split produce a leather roll across the
   * full width — the alternative is cutting the loft in two directions at
   * once, which leaves the hull in three pieces and gains nothing.
   */
  insertWidth?(v: number): number;
  /** Flute channel centres, as fractions of the insert's own half width. */
  flutes?: number[];
  fluteDepth?: number;
  seed: number;
  ring?: number;
  stations?: number;
  /**
   * Turn the cloth over the far end of the loft (`capEnd`) or the near one
   * (`capStart`).
   *
   * The section is closed round its ring but the loft's two ends are not, so
   * without this a backrest is an open tube and a camera above it looks down
   * into the seat. On a real seat both ends are where the cover is drawn under
   * and clipped to the frame, which is a roll, not a cut — so the section is
   * collapsed toward its own mid-height rather than capped with a flat disc.
   */
  capStart?: boolean;
  capEnd?: boolean;
  /**
   * Cut the loft along its two bolster stitch lines and return the insert and
   * the hull separately, so they can wear different materials. Ignored when
   * there are no `bolsters` to cut along.
   */
  split?: boolean;
}

const EDGE = 6;

/**
 * Half of a bolster, as a function of |t|.
 *
 * Rises from nothing at the stitch line to a crown about halfway out, then
 * eases back a little as the cloth turns over the side of the seat — which is
 * where `panel()` takes over and rolls the edge under.
 */
function bolsterProfile(at: number, crown: number, ta: number): number {
  const u = (ta - at) / Math.max(1e-4, 1 - at);
  if (u <= 0) return 0;
  const rise = 0.5 - 0.5 * Math.cos(Math.PI * clamp(u / crown, 0, 1));
  return rise * (1 - 0.24 * smoothstep(crown, 1, u));
}

/**
 * Gaussian widths, as `2 sigma^2` in **metres of cloth**.
 *
 * These were in panel parameters, and a panel parameter is not a length: a
 * stitch 0.017 wide in t is 4 mm across on a 250 mm backrest and 12 mm across
 * on the 1.2 m bench. Worse, the narrow ones fell *below the vertex spacing* —
 * the bolster gutter was 6 mm wide on a mesh whose stations are 10 to 23 mm
 * apart, so the loft stepped straight over every seam in the car and the
 * panels came back smooth. Nothing here may be narrower than about one and a
 * half times the coarsest station spacing any panel using it is built at.
 */
const W_GUTTER = 0.00088;   // sigma 21 mm — the trough at the foot of a bolster
const W_SEAM = 0.00097;     // sigma 22 mm — a transverse stitch line
const W_SEAM_PUFF = 0.00135;
const SEAM_PUFF_AT = 0.032; // metres either side of the stitch
const W_FLUTE = 0.00034;    // sigma 13 mm — a velour channel
const W_FLUTE_PUFF = 0.00080;
const FLUTE_PUFF_AT = 0.026;

/**
 * Stitch lines, snapped to the rows of vertices that will actually carry them.
 *
 * Widening the Gaussians was only half the previous fix. A 22 mm trough on a
 * 13 mm station pitch is sampled — but only if a station lands *in* it, and
 * nothing made one. A seam authored at v 0.755 on a 44-station loft falls
 * between rows 33 and 34, so the two vertices either side of the trough each
 * sat a third of the way up its wall and the loft cut the corner: the deepest
 * point of every seam in the car was a place with no vertex in it.
 *
 * So each seam is moved to the nearest row before anything is evaluated, and
 * the bolster's gutter to the nearest ring line. The shift is under half a
 * station — 6 mm at worst, invisible — and it is the difference between a
 * stitch line that is drawn and one that is merely specified.
 */
function snapSeams(s: PanelSpec, NV: number): SeamSpec[] {
  return (s.seams ?? []).map((sm) => ({ ...sm, at: Math.round(sm.at * NV) / NV }));
}

/**
 * The A-surface: sculpt, bolsters, seams, flutes and wear, all folded in.
 *
 * `at` is the stitch line for *this* station, already narrowed by
 * `insertWidth`, not the nominal one off the spec.
 */
function aSurface(
  s: PanelSpec, t: number, v: number, hw: number, z: number,
  at: number, seams: SeamSpec[],
): number {
  let y = s.face(t, v);
  const ta = Math.abs(t);
  const mx = ta * hw;

  if (s.bolsters) {
    const b = s.bolsters;
    const f = b.fade ? b.fade(v) : 1;
    y += b.height * f * bolsterProfile(at, b.crown ?? 0.55, ta);
    const d = mx - at * hw;
    y -= (b.seam ?? 0.0055) * f * Math.exp(-(d * d) / W_GUTTER);
  }

  // Transverse stitches. `near` is how close this station is to one of them,
  // which is also what stops the flutes running through it.
  let near = 0;
  for (const sm of seams) {
    const d = (v - sm.at) * s.length;
    const g = Math.exp(-(d * d) / W_SEAM);
    near = Math.max(near, g);
    y -= sm.depth * g;
    const p = sm.puff ?? 0.42;
    y += sm.depth * p * (
      Math.exp(-((d - SEAM_PUFF_AT) ** 2) / W_SEAM_PUFF)
      + Math.exp(-((d + SEAM_PUFF_AT) ** 2) / W_SEAM_PUFF));
  }

  const flutes = s.flutes ?? [];
  if (flutes.length) {
    const fd = s.fluteDepth ?? 0.008;
    // Die into the bolster seam, and into every transverse stitch.
    const mask = (1 - smoothstep(at - 0.18, at - 0.03, ta)) * (1 - 0.85 * near);
    if (mask > 0.002) {
      for (const f of flutes) {
        // Flute centres ride with the insert, so they stay inside it where
        // it narrows rather than running out under the bolster.
        const d = (t - f * at) * hw;
        // A stitched channel is narrow and sharp; the cloth puffs either side
        // of it, which is what actually makes a flute visible.
        y -= fd * mask * Math.exp(-(d * d) / W_FLUTE);
        y += fd * 0.34 * mask * Math.exp(-((d - FLUTE_PUFF_AT) ** 2) / W_FLUTE_PUFF);
        y += fd * 0.34 * mask * Math.exp(-((d + FLUTE_PUFF_AT) ** 2) / W_FLUTE_PUFF);
      }
    }
  }

  // Wear, in metres of cloth rather than in panel parameters — see the header.
  const k = s.seed;
  const sx = t * hw;
  y += fbm(sx * 34 + k, z * 34 + k * 3, k * 11, 3) * 0.0026;
  y += fbm(sx * 96 + k, z * 96 + k, 4.5, 2) * 0.0013;
  return y;
}

export interface Panel {
  /**
   * The insert — the flat centre field. When `split` is off this is the whole
   * closed panel instead, so a caller that does not care can ignore `hull`.
   */
  insert: THREE.BufferGeometry;
  /** Bolsters, both edge rolls and the underside. Null unless `split`. */
  hull: THREE.BufferGeometry | null;
  edgeL: Vec3[];
  edgeR: Vec3[];
  seamL: Vec3[];
  seamR: Vec3[];
}

/**
 * One upholstered panel: a closed lofted volume with a sculpted top face, a
 * plainer underside, and a rounded-over edge between them.
 *
 * ## Why it comes back in two pieces
 *
 * On the reference car the bolsters and the rolls are **smooth leather** and
 * the insert between them is **matte suede**. That is not a detail: it is the
 * single strongest thing in either photograph. The bolster reads because it is
 * a different material catching a different highlight, and only secondarily
 * because it is 45 mm proud. Modelling the whole seat in one cloth throws away
 * the primary cue and leaves the relief to do a job it cannot do alone — which
 * is exactly how a correctly-sculpted seat still came back looking like a slab.
 *
 * So `split` cuts the loft along its two bolster stitch lines and returns the
 * insert and the hull separately, for two materials. Both pieces evaluate the
 * seam ring from the same function with the same arguments, so they meet to
 * the last bit and there is no crack; and because each computes its normals
 * alone, the stitch line gets the hard crease a sewn seam actually has.
 *
 * Also returns the four paths a trim piece can be hung from: the two outer
 * edges, where the welt cord runs, and the two bolster stitch lines.
 */
export function panel(s: PanelSpec): Panel {
  const M = s.ring ?? 26;
  const NV = s.stations ?? 34;
  const { origin, lat, run, up } = s.frame;

  const total = 2 * (M + 1) + 2 * EDGE;

  // Ring indices at the two bolster stitch lines. `at` is then re-derived
  // *from the index*, so the gutter's trough is guaranteed to land on a ring
  // of vertices rather than between two of them — see `snapSeams`.
  const iSeamR = s.bolsters ? Math.round(((s.bolsters.at + 1) / 2) * M) : -1;
  const iSeamL = s.bolsters ? M - iSeamR : -1;
  const at = s.bolsters ? (2 * iSeamR) / M - 1 : 1;
  const seams = snapSeams(s, NV);

  const place = (out: THREE.Vector3, x: number, y: number, z: number): void => {
    out.copy(origin)
      .addScaledVector(lat, x)
      .addScaledVector(up, y)
      .addScaledVector(run, z);
  };

  const CAP = 0.032;

  /** One point of the closed ring, for any `i` in [0, total). */
  const ringPoint = (i: number, j: number, out: THREE.Vector3): void => {
    const v = j / NV;
    const z = v * s.length;
    const dep = s.depth(v);

    // How far through the roll-over at either end of the loft, 0..1.
    let cap = 0;
    if (s.capEnd && v > 1 - CAP) cap = smoothstep(0, 1, (v - (1 - CAP)) / CAP);
    if (s.capStart && v < CAP) cap = Math.max(cap, smoothstep(0, 1, (CAP - v) / CAP));
    const hw = s.halfWidth(v) * (1 - 0.80 * cap);

    // The stitch line for this station. Ring index iSeamR stays *on* it as it
    // moves, because the A-surface's index→t map is warped to follow: the
    // insert's columns are squeezed into [-atV, atV] and the bolster's into
    // what is left. That is what keeps the split watertight while the insert
    // changes width, and it is also how the cloth is cut in the real car.
    const atV = at * (s.insertWidth ? clamp(s.insertWidth(v), 0.02, 1) : 1);
    const warp = (k: number): number => {
      if (!s.bolsters) return k;
      const ka = Math.abs(k);
      const sign = k < 0 ? -1 : 1;
      if (ka <= at) return sign * (ka / at) * atV;
      return sign * (atV + ((ka - at) / (1 - at)) * (1 - atV));
    };

    let t: number;
    let y: number;
    let x: number;

    let yFace: number;
    let yBack: number;

    if (i <= M) {
      // A-surface, left to right.
      t = warp(-1 + (2 * i) / M);
      x = t * hw;
      yFace = aSurface(s, t, v, hw, z, atV, seams);
      yBack = -dep + (s.back ? s.back(t, v) : 0);
      y = yFace;
    } else if (i < M + 1 + EDGE) {
      // Right edge, rolled over.
      const a = ((i - M) / (EDGE + 1)) * Math.PI * 0.5;
      yFace = aSurface(s, 1, v, hw, z, atV, seams);
      yBack = -dep + (s.back ? s.back(1, v) : 0);
      y = lerp(yFace, yBack, 1 - Math.cos(a));
      x = hw - (1 - Math.cos(a * 0.9)) * hw * 0.055;
    } else if (i < 2 * M + 2 + EDGE) {
      // Underside, right to left.
      const k = i - (M + 1 + EDGE);
      t = 1 - (2 * k) / M;
      x = t * hw * 0.945;
      yFace = aSurface(s, t, v, hw, z, atV, seams);
      yBack = -dep + (s.back ? s.back(t, v) : 0);
      y = yBack;
    } else {
      const a = ((total - i) / (EDGE + 1)) * Math.PI * 0.5;
      yFace = aSurface(s, -1, v, hw, z, atV, seams);
      yBack = -dep + (s.back ? s.back(-1, v) : 0);
      x = -hw + (1 - Math.cos(a * 0.9)) * hw * 0.055;
      y = lerp(yFace, yBack, 1 - Math.cos(a));
    }
    if (cap > 0) y = lerp(y, (yFace + yBack) / 2, 0.90 * cap);
    place(out, x, y, z);
  };

  // The trim paths are walked separately rather than captured during the
  // build, because when the loft is split the seam rings are evaluated by both
  // pieces and a capture inside the callback would record each twice.
  const walk = (i: number): Vec3[] => {
    const p = new THREE.Vector3();
    const out: Vec3[] = [];
    for (let j = 0; j <= NV; j++) { ringPoint(i, j, p); out.push([p.x, p.y, p.z]); }
    return out;
  };
  const edgeL = walk(0);
  const edgeR = walk(M);
  const seamL = s.bolsters ? walk(iSeamL) : [];
  const seamR = s.bolsters ? walk(iSeamR) : [];

  if (!s.split || !s.bolsters) {
    return { insert: surface(total, NV, true, ringPoint), hull: null, edgeL, edgeR, seamL, seamR };
  }

  // The insert spans the ring between the two stitch lines; the hull is the
  // rest of the way round. The two column counts sum to `total`, so together
  // they tile the same closed loft the unsplit build produces.
  const span = iSeamR - iSeamL;
  const insert = surface(span, NV, false, (a, j, out) => ringPoint(iSeamL + a, j, out));
  const hull = surface(total - span, NV, false, (a, j, out) => ringPoint((iSeamR + a) % total, j, out));
  return { insert, hull, edgeL, edgeR, seamL, seamR };
}

/** The welt cord round a panel's edge — 4 mm of fabric-covered piping. */
export function welt(path: Vec3[], radius = 0.0042, radial = 5): THREE.BufferGeometry {
  return tube(path, radius, radial, false, 0.4);
}

/** Thin a swept edge down before it becomes piping — a cord needs few stations. */
export function thin(path: Vec3[], n = 12): Vec3[] {
  const out: Vec3[] = [];
  const last = path.length - 1;
  if (last < 1) return path.slice();
  for (let i = 0; i < n; i++) out.push(path[Math.round((i * last) / (n - 1))]);
  return out;
}

// ---------------------------------------------------------------------------
// Shared sculpting terms
// ---------------------------------------------------------------------------

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

/**
 * A full-width padded roll: the shoulder roll across the top of a backrest,
 * the nose roll at the front of a cushion. `at`..1 in v, peaking at `at + w/2`.
 */
export function roll(v: number, at: number, w: number, amount: number): number {
  const u = clamp((v - at) / w, 0, 1);
  return amount * Math.sin(Math.PI * u) ** 0.85;
}

/**
 * The lines plan.
 *
 * The whole body shell is one analytic surface `S(z, t)`:
 *
 *   z  — station, metres in the vehicle frame (nose +0.862 … tail −3.700)
 *   t  — position around the transverse section: 0 at the roof centreline,
 *        +1 at the outer edge of the floor on the RIGHT side, −1 on the left.
 *
 * At every station a half-section is drawn through nine control levels, each
 * of which is itself a spline in z. So the surface is a lofted set of
 * transverse sections exactly like a naval lines plan, and every panel in
 * `panels.ts` is just a region of the (z, t) rectangle. The two end faces are
 * NOT part of the loft — a near-vertical face cannot be a z-station — so they
 * are built as (x, y) patches in `faces.ts` and roll into the shell's last
 * section.
 *
 * Numbers come from three places, in order of authority:
 *   1. `@/spec` and `@/car/hardpoints` — never restated here.
 *   2. The 1986 Audi 100 Avant orthographic side elevation
 *      (getoutlines.com/blueprints/221), traced pixel-by-pixel and scaled on
 *      the published wheelbase. Both silhouette lines are reproduced: the roof
 *      *centreline* crown and the roof *side edge*, which on this car run
 *      50–100 mm apart and are what make the greenhouse read correctly.
 *   3. Period photography for surface character where a line drawing is mute.
 */

import * as THREE from 'three';
import { BODY, QUALITY } from '@/spec';
import { HP } from '@/car/hardpoints';
import { spline, clamp, lerp, superellipseY } from './math';

/** Front face plane: the grille/headlamp band. */
export const Z_NOSE_FACE = HP.front.grilleZ;          // +0.862
/** Last lofted station; aft of this the tailgate has rolled toward vertical. */
export const Z_TAIL_END = -3.700;

/** Section parameter of each control level. */
export const T = {
  top: 0.00,
  roofEdge: 0.12,
  dloMid: 0.26,
  belt: 0.38,
  crown: 0.50,
  wide: 0.62,
  lowerA: 0.76,
  sill: 0.87,
  floor: 1.00,
} as const;

const LEVEL_T = [T.top, T.roofEdge, T.dloMid, T.belt, T.crown, T.wide, T.lowerA, T.sill, T.floor];

// ---------------------------------------------------------------------------
// 1. Centreline top profile — bonnet, windscreen, roof, tailgate.
// ---------------------------------------------------------------------------
//
// Every value aft of the bonnet was read off the 1986 100 Avant elevation, one
// station at a time, and scaled by BODY.height / 1427 mm (the drawing's own
// roof-skin crown) so the crown still lands exactly on the spec figure. Three
// things that drawing insists on and the previous table did not do:
//
//   · The screen climbs at a steady ~60° from vertical and is *finished* by
//     z ≈ −1.20, where it flattens hard into the roof. The old table ramped up
//     at a lazy 67–74° and did not reach roof height until −1.40, which put
//     200 mm of extra glass over the cabin and is what made the car read
//     cab-forward.
//   · The bonnet/screen break sits at HP.cowlZ. Aft of it there is a short
//     near-level scuttle before the glass starts, not an immediate climb.
//   · The tail stops falling at ≈ 1.14 m and runs level over the last 150 mm:
//     the roof extension above the tailgate glass. The old table kept falling
//     to 1.09, which rounded the tail off and lost the square shoulder.
const yTop = spline(
  [Z_NOSE_FACE, 0.869],
  [0.840, 0.874],
  [HP.front.hoodFrontZ, HP.front.hoodFrontY],   // 0.782 / 0.878
  [0.600, 0.893],
  [0.400, 0.915],
  [0.150, 0.943],
  [-0.100, 0.976],
  [-0.240, 1.003],
  [-0.345, 1.034],
  [HP.cowlZ, HP.cowlY],                          // −0.370 / 1.045
  [-0.450, 1.084],
  [-0.560, 1.146],
  [-0.680, 1.208],
  [-0.800, 1.264],
  [-0.920, 1.315],
  [-1.040, 1.360],
  [-1.140, 1.386],
  [-1.210, 1.395],
  [HP.headerZ, HP.headerY],                      // −1.280 / 1.398
  [-1.420, 1.405],
  [-1.700, 1.412],
  [-1.900, BODY.height],                         // 1.415, the highest point
  [-2.300, 1.413],
  [-2.650, 1.408],
  [-2.860, 1.399],
  [-2.968, 1.386],                               // HP.roof.dPillarZ: roof turns down
  [-3.040, 1.366],
  [-3.108, 1.338],                               // HP.rear.tailgateHingeZ
  [-3.200, 1.278],
  [-3.300, 1.238],
  [-3.400, 1.200],
  [-3.500, 1.160],
  [-3.600, 1.141],
  [Z_TAIL_END, 1.138],
);

// ---------------------------------------------------------------------------
// 2. Roof side edge (t = 0.12) and the roof's transverse crown.
// ---------------------------------------------------------------------------
//
// Over the bonnet this level IS the bonnet shutline; over the screen it is the
// A-pillar's outer edge; over the cabin it is the DLO top, i.e. where the roof
// skin turns down into the body side. On a C3 that turn is a smooth radius —
// there is no proud drip rail — so the two surfaces simply share a tangent.

const xRoofEdge = spline(
  [Z_NOSE_FACE, 0.642],
  [0.820, 0.686],
  [HP.front.hoodFrontZ, 0.702],
  [0.600, 0.718],
  [0.300, 0.734],
  [0.000, 0.742],
  [-0.240, 0.744],
  [-0.345, HP.front.hoodHalfW + 0.003],          // 0.745
  [-0.430, 0.764],
  [-0.520, 0.786],
  [-0.620, 0.797],
  [-0.720, 0.798],
  [-0.850, 0.776],
  [-1.000, 0.748],
  [-1.150, 0.722],
  [HP.headerZ, 0.708],
  [-1.480, 0.700],
  [-2.000, 0.700],
  [-2.400, 0.697],
  [-2.700, 0.690],
  [-2.968, 0.674],
  [-3.108, 0.654],
  [-3.300, 0.628],
  [-3.500, 0.611],
  [Z_TAIL_END, 0.604],
);

/**
 * How far the roof-side edge sits below the centreline.
 *
 * Over the roof this is just the transverse crown, ~52 mm, which is what the
 * elevation shows between the roof rail feet and the DLO top. Across the
 * windscreen it is doing something quite different and much larger: the screen
 * is raked ~60° and strongly swept in plan, so at any given station the
 * A-pillar is far lower than the glass on the centreline. The elevation puts
 * the A-pillar's outer edge 45 mm below the centreline at the header and
 * ~150 mm below it at the pillar's base — and it is that sweep, not the
 * centreline rake, which the eye reads as the windscreen's angle. The previous
 * 21–31 mm here left the pillar line running at 70° from vertical against the
 * drawing's 57°, and pushed the DLO's front corner 380 mm too far forward.
 */
const crownDrop = spline(
  [Z_NOSE_FACE, 0.006],
  [HP.front.hoodFrontZ, 0.010],
  [0.000, 0.014],
  [-0.150, 0.018],
  [-0.260, 0.025],
  [-0.345, 0.034],
  [-0.430, 0.058],
  [-0.520, 0.092],
  [-0.620, 0.126],
  [-0.720, 0.148],
  [-0.800, 0.132],
  [-0.950, 0.092],
  [-1.100, 0.058],
  [HP.headerZ, 0.037],
  [-1.400, 0.046],
  [-1.480, 0.050],
  [-2.400, 0.052],
  [-2.968, 0.058],
  [-3.108, 0.050],
  [-3.300, 0.034],
  [-3.500, 0.022],
  [Z_TAIL_END, 0.016],
);

// ---------------------------------------------------------------------------
// 3. Beltline (t = 0.38) — dead straight and dead level for the whole DLO.
// ---------------------------------------------------------------------------

const yBelt = spline(
  [Z_NOSE_FACE, 0.800],
  [HP.front.hoodFrontZ, 0.820],
  [0.400, 0.862],
  [0.000, 0.902],
  [-0.240, 0.944],
  [-0.345, 0.968],
  [HP.glass.dloFrontZ, HP.beltY],                // −0.415 / 0.985
  [-1.600, HP.beltY],
  [-2.600, HP.beltY],
  [-2.978, HP.beltY],
  [-3.200, 0.987],
  [-3.500, 0.991],
  [Z_TAIL_END, 0.996],
);

const xBelt = spline(
  [Z_NOSE_FACE, 0.846],
  [HP.front.hoodFrontZ, 0.858],
  [0.400, 0.870],
  [0.000, 0.869],
  [-0.345, 0.862],
  [-0.520, 0.857],
  [-1.600, BODY.tumblehomeTop],                  // 0.855
  [-2.600, 0.854],
  [-2.978, 0.850],
  // The tail's taper in plan. These were 0.843 / 0.836 / 0.822, so the
  // beltline ran nearly parallel to the centreline right to the back of the
  // car and the tailgate came out a full-width slab. See `dloFullX` below for
  // the measurement all three tail changes come from.
  [-3.300, 0.838],
  [-3.500, 0.820],
  [Z_TAIL_END, 0.795],
);

/**
 * Fullness of the section between the belt and the roof edge. Over the cabin
 * the tumblehome is nearly a straight line (0.42); across the tailgate the
 * section is much fuller because the shoulder wraps hard around the corner.
 */
const dloFullY = spline(
  [Z_NOSE_FACE, 0.42],
  [-2.700, 0.42],
  [-3.000, 0.46],
  [-3.108, 0.56],
  [-3.300, 0.78],
  [-3.500, 0.88],
  [Z_TAIL_END, 0.90],
);

/**
 * The same thing laterally: where the dlo-mid level sits between the beltline
 * half-width and the roof-edge half-width. 0.42 along the whole cabin, but the
 * tail tucks in much harder than that.
 *
 * This was the constant 0.42 everywhere.
 *
 * The tail was measured off the dead-on rear photograph of the 1988 wagon
 * entirely in *ratios to the taillamp band's own half-width*, so no absolute
 * calibration of the photograph is needed and the answer does not depend on
 * knowing the camera distance — everything compared sits in the same plane.
 * Half-widths in those units, against the model as it was:
 *
 *   height              photo   model (before)   model (now)
 *   lamp centreline     1.000       1.000           1.000
 *   lamp top            0.984       0.994           0.973
 *   beltline            0.937       0.978           0.942
 *   100 mm above belt   0.864       0.897           0.864
 *
 * The old tail held nearly full width all the way up past the beltline and
 * then broke sharply, instead of rolling over just above the lamps. That is
 * why the tailgate glass had to be built 33 mm wider than `HP.glass
 * .tailgateGlassHalfW` before it looked right against the body beside it: the
 * body, not the glass, was the part that was wrong. Three changes put the
 * tumblehome back where the photograph has it — `xBelt` at the last three
 * stations, `flankCrown` (which keeps the lamp band full while the belt comes
 * in), and this. None of them touches the beltline height, the roof edge, the
 * shoulder, the maximum half-width or anything in the side elevation.
 */
const dloFullX = spline(
  [Z_NOSE_FACE, 0.42],
  [-3.108, 0.42],
  [-3.300, 0.44],
  [-3.500, 0.45],
  [Z_TAIL_END, 0.46],
);

// ---------------------------------------------------------------------------
// 4. Maximum half-width (t = 0.62) — the soft shoulder low on the flank.
// ---------------------------------------------------------------------------

const xWide = spline(
  [Z_NOSE_FACE, 0.849],
  [HP.front.hoodFrontZ, 0.866],
  [0.500, 0.884],
  [0.100, 0.891],
  [-1.600, HP.side.archLipX],                    // 0.891
  [-2.687, HP.side.archLipX],
  [-3.200, 0.884],
  [-3.500, 0.872],
  [Z_TAIL_END, 0.852],
);

const yWide = spline(
  [Z_NOSE_FACE, 0.605],
  [0.000, 0.600],
  [-2.687, 0.600],
  [Z_TAIL_END, 0.611],
);

// ---------------------------------------------------------------------------
// 5. Lower body and rocker.
// ---------------------------------------------------------------------------

const xLowerA = spline(
  [Z_NOSE_FACE, 0.772],
  [0.400, 0.800],
  [0.000, 0.812],
  [-1.600, 0.813],
  [-2.687, 0.812],
  [-3.400, 0.800],
  [Z_TAIL_END, 0.770],
);
const yLowerA = spline(
  [Z_NOSE_FACE, 0.432],
  [0.000, 0.410],
  [-1.600, 0.406],
  [-2.687, 0.410],
  [Z_TAIL_END, 0.438],
);

const xSill = spline(
  [Z_NOSE_FACE, 0.706],
  [0.300, 0.760],
  [0.000, 0.778],
  [-1.600, BODY.tumblehomeSill - 0.008],         // 0.782
  [-2.687, 0.780],
  [-3.400, 0.772],
  [Z_TAIL_END, 0.730],
);
const ySill = spline(
  [Z_NOSE_FACE, 0.348],
  [0.000, 0.322],
  [-1.600, 0.318],
  [-2.687, 0.322],
  [Z_TAIL_END, 0.356],
);

const xFloor = spline(
  [Z_NOSE_FACE, 0.622],
  [0.400, 0.672],
  [0.000, 0.700],
  [-1.600, 0.706],
  [-2.687, 0.702],
  [-3.400, 0.694],
  [Z_TAIL_END, 0.650],
);
const yFloor = spline(
  [Z_NOSE_FACE, 0.272],
  [0.400, 0.248],
  [0.000, 0.238],
  [-1.600, HP.sillY],                            // 0.235
  [-2.687, 0.238],
  [-3.400, 0.256],
  [Z_TAIL_END, 0.300],
);

// ---------------------------------------------------------------------------
// 6. Section assembly.
// ---------------------------------------------------------------------------
//
// The two intermediate levels are derived rather than tabulated, so the
// surfaces they blend can never disagree. `glassBulge` is the barrel curvature
// of the side glass; `flankCrown` is the gentle convexity across the door
// skin. Both are deliberately small — this car has no character lines, and
// overdoing either turns a taut flank into a bulge.

const glassBulge = spline(
  [Z_NOSE_FACE, 0.004],
  [-0.345, 0.006],
  [-0.600, 0.013],
  [-2.600, 0.014],
  [-3.108, 0.010],
  [Z_TAIL_END, 0.004],
);

/**
 * Across the doors this is a 6-8 mm crown on a nearly flat skin. Over the tail
 * it does a second job: it holds the section out at the taillamp band while
 * `xBelt` brings the beltline 55 mm inboard above it, which is what turns the
 * tail's shoulder into a radius sitting just above the lamps rather than a
 * chamfer starting at the beltline. Without it, narrowing the belt dragged the
 * lamp band in with it and the taillamps overhung the body.
 */
const flankCrown = spline(
  [Z_NOSE_FACE, 0.003],
  [0.000, 0.006],
  [-0.455, 0.008],
  [-2.585, 0.008],
  [-3.100, 0.009],
  [-3.300, 0.012],
  [Z_TAIL_END, 0.018],
);

const scratch: number[] = new Array(18).fill(0);
let scratchZ = Number.NaN;

/** Fill `scratch` with the nine (x, y) control points of the section at `z`. */
function levels(z: number): number[] {
  if (z === scratchZ) return scratch;
  scratchZ = z;

  const yt = yTop.at(z);
  const xr = xRoofEdge.at(z);
  const yr = yt - crownDrop.at(z);
  const xb = xBelt.at(z);
  const yb = yBelt.at(z);
  const xw = xWide.at(z);
  const yw = yWide.at(z);

  const kx = dloFullX.at(z);
  const ky = dloFullY.at(z);
  const xd = lerp(xb, xr, kx) + glassBulge.at(z);
  const yd = lerp(yb, yr, ky);

  // t = 0.50 sits where the flank is straightest, crowned very slightly out.
  const k2 = 0.5;
  const xc = lerp(xw, xb, k2) + flankCrown.at(z);
  const yc = lerp(yw, yb, k2);

  scratch[0] = 0;              scratch[1] = yt;
  scratch[2] = xr;             scratch[3] = yr;
  scratch[4] = xd;             scratch[5] = yd;
  scratch[6] = xb;             scratch[7] = yb;
  scratch[8] = xc;             scratch[9] = yc;
  scratch[10] = xw;            scratch[11] = yw;
  scratch[12] = xLowerA.at(z); scratch[13] = yLowerA.at(z);
  scratch[14] = xSill.at(z);   scratch[15] = ySill.at(z);
  scratch[16] = xFloor.at(z);  scratch[17] = yFloor.at(z);
  return scratch;
}

/**
 * Fritsch-Carlson limited tangent for one coordinate at one control level.
 *
 * The transverse section is NOT parameterised by arc length: t runs 0 → 0.12
 * from the roof centreline out to the roof edge, which at the scuttle is
 * 790 mm of skin, and then 0.12 → 0.26 for the next 50 mm. A plain
 * Catmull-Rom tangent at the roof-edge knot is therefore ~3.2 per unit t,
 * against a secant of 0.44 into the span that follows, and the curve carries
 * that momentum straight past the next control point.
 *
 * Where the cowl is nearly as wide at the shutline as it is at the beltline —
 * z −0.35 … −0.72, the scuttle and the base of the A-pillar — the overshoot
 * was larger than the gap between the two levels, so the section **folded
 * back on itself**: x ran 0.766 → 0.848 → 0.828 → 0.846 → 0.859 across
 * t 0.12 … 0.38, y was non-monotone with it, ∂S/∂t reversed, and the analytic
 * normal inverted over that whole band. `panel.ts` builds every rolled edge
 * and flange along that normal, so the cowl's rear edge and the front wing's
 * top edge extruded their 30-34 mm returns *outward through the skin* instead
 * of inward behind it. That is the bright shard on the front wing at the
 * A-pillar's base; `arcLen`/`arcRate` were also meaningless through the cusp,
 * which quietly corrupted every `dtFor` inset taken there.
 *
 * Limiting the tangents fixes it without moving a single control level, so
 * every hardpoint and the whole verified side elevation are untouched: the
 * curve still passes exactly through all nine levels, it simply no longer
 * leaves the box they bracket. At a genuine local extremum (the flank crown,
 * where `xc` sits a millimetre proud of `xWide`) the tangent goes to zero,
 * which is what a crown actually is.
 */
function limitedTangent(
  vPrev: number, vHere: number, vNext: number,
  tPrev: number, tHere: number, tNext: number,
): number {
  const dL = (vHere - vPrev) / (tHere - tPrev);
  const dR = (vNext - vHere) / (tNext - tHere);
  if (dL * dR <= 0) return 0;
  const m = (vNext - vPrev) / (tNext - tPrev);
  const lim = 3 * Math.min(Math.abs(dL), Math.abs(dR));
  return Math.abs(m) <= lim ? m : (m < 0 ? -lim : lim);
}

/**
 * Evaluate the half-section at |t|. Non-uniform Catmull-Rom through the nine
 * control levels with monotone-limited tangents (see `limitedTangent`), and a
 * phantom point mirrored across the centreline so the roof crown has a
 * horizontal tangent at t = 0 — otherwise the two halves meet in a ridge and
 * the roof highlight breaks.
 */
function sectionPoint(z: number, a: number, out: THREE.Vector2): THREE.Vector2 {
  const L = levels(z);
  const n = 9;
  const t = clamp(a, 0, 1);

  let i = 0;
  while (i < n - 2 && t > LEVEL_T[i + 1]) i++;
  const t0 = LEVEL_T[i], t1 = LEVEL_T[i + 1];
  const h = t1 - t0;
  const s = (t - t0) / h;

  const px = (k: number): number => (k < 0 ? -L[2] : k > n - 1 ? 2 * L[16] - L[14] : L[k * 2]);
  const py = (k: number): number => (k < 0 ? L[3] : k > n - 1 ? 2 * L[17] - L[15] : L[k * 2 + 1]);
  const pt = (k: number): number => (k < 0 ? -LEVEL_T[1] : k > n - 1 ? 2 * LEVEL_T[8] - LEVEL_T[7] : LEVEL_T[k]);

  const mx0 = limitedTangent(px(i - 1), px(i), px(i + 1), pt(i - 1), t0, t1);
  const my0 = limitedTangent(py(i - 1), py(i), py(i + 1), pt(i - 1), t0, t1);
  const mx1 = limitedTangent(px(i), px(i + 1), px(i + 2), t0, t1, pt(i + 2));
  const my1 = limitedTangent(py(i), py(i + 1), py(i + 2), t0, t1, pt(i + 2));

  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;

  out.x = h00 * px(i) + h10 * h * mx0 + h01 * px(i + 1) + h11 * h * mx1;
  out.y = h00 * py(i) + h10 * h * my0 + h01 * py(i + 1) + h11 * h * my1;
  return out;
}

const _v2 = new THREE.Vector2();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Outer body surface. `t` may be negative for the left side. */
export function surfacePoint(z: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  sectionPoint(z, Math.abs(t), _v2);
  out.set(t < 0 ? -_v2.x : _v2.x, _v2.y, z);
  return out;
}

const DZ = 0.0015;
const DT = 0.0015;

/** Outward unit normal, taken analytically from the surface, not the mesh. */
export function surfaceNormal(z: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  surfacePoint(z + DZ, t, _a);
  surfacePoint(z - DZ, t, _b);
  _a.sub(_b);                                     // ∂S/∂z, pointing forward

  surfacePoint(z, t + DT, _b);
  surfacePoint(z, t - DT, _c);
  _b.sub(_c);                                     // ∂S/∂t, pointing down-section

  out.crossVectors(_a, _b);                       // ∂S/∂z × ∂S/∂t faces outboard
  if (out.lengthSq() < 1e-14) { out.set(t < 0 ? -1 : 1, 0, 0); return out; }
  out.normalize();
  return out;
}

/** |∂S/∂t| — how many metres of skin one unit of t covers, at that point. */
export function arcRate(z: number, t: number): number {
  surfacePoint(z, t + DT, _b);
  surfacePoint(z, t - DT, _c);
  return _b.sub(_c).length() / (2 * DT);
}

/** Convert a distance across the skin into a step in t. */
export function dtFor(z: number, t: number, metres: number): number {
  return metres / Math.max(arcRate(z, t), 1e-3);
}

/** Arc length along the section from the roof centreline to |t|, in metres. */
export function arcLen(z: number, t: number): number {
  const a = Math.abs(t);
  const n = 24;
  let sum = 0;
  surfacePoint(z, 0, _a);
  for (let i = 1; i <= n; i++) {
    surfacePoint(z, (a * i) / n, _b);
    sum += _a.distanceTo(_b);
    _a.copy(_b);
  }
  return t < 0 ? -sum : sum;
}

/** The t at which the section reaches height `y`. y is monotone in t. */
export function tAtY(z: number, y: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 26; i++) {
    const mid = 0.5 * (lo + hi);
    if (sectionPoint(z, mid, _v2).y > y) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** The t at which the section reaches half-width `x`, searching the upper half. */
export function tAtX(z: number, x: number): number {
  let lo = 0;
  let hi: number = T.wide;
  for (let i = 0; i < 26; i++) {
    const mid = 0.5 * (lo + hi);
    if (sectionPoint(z, mid, _v2).x < x) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Half-width of the section at `z` for a given t (always positive). */
export function halfWidthAt(z: number, t: number): number {
  return sectionPoint(z, Math.abs(t), _v2).x;
}

/** Height of the section at `z`, |t|. */
export function heightAt(z: number, t: number): number {
  return sectionPoint(z, Math.abs(t), _v2).y;
}

/** Centreline height of the body at `z`. */
export function topAt(z: number): number { return yTop.at(z); }

// ---------------------------------------------------------------------------
// 7. Wheel arches.
// ---------------------------------------------------------------------------
//
// Not semicircles: they flatten markedly across the crown and die into the
// rocker line at their ends. `HP.side.archFlatten` gives the vertical/
// horizontal ratio; the superellipse exponent produces the flat top that the
// elevation clearly shows.

const ARCH_A = HP.side.archRadius;
const ARCH_B = HP.side.archRadius * HP.side.archFlatten;
const ARCH_N = 2.55;

/** Top of the arch opening at station `z`, or null if no arch there. */
export function archTopY(z: number, axleZ: number): number | null {
  const dy = superellipseY(z - axleZ, ARCH_A, ARCH_B, ARCH_N);
  if (dy <= 1e-4) return null;
  return HP.wheelRadius + dy;
}

/** Arch opening as a t bound for a side panel; +Infinity where there is none. */
export function archT(z: number, axleZ: number, dieIntoY: number): number {
  const y = archTopY(z, axleZ);
  if (y === null || y <= dieIntoY) return Number.POSITIVE_INFINITY;
  return tAtY(z, y);
}

// ---------------------------------------------------------------------------
// 8. Sampling density.
// ---------------------------------------------------------------------------

const BASE = QUALITY.bodySegments;

/** Number of stations for a z span. */
export function zSteps(z0: number, z1: number, perMetre = BASE * 0.42): number {
  return Math.max(3, Math.min(160, Math.round(Math.abs(z1 - z0) * perMetre)));
}

/** Number of rings across a t span, measured in real skin metres. */
export function tSteps(z: number, t0: number, t1: number, perMetre = BASE * 0.44): number {
  const metres = Math.abs(arcLen(z, t1) - arcLen(z, t0));
  return Math.max(3, Math.min(160, Math.round(metres * perMetre)));
}

/**
 * The backlight.
 *
 * ## Why this is not just another region of the loft
 *
 * Every other pane on the car lies on the body's (z, t) loft, so it can be
 * written as a rectangle in those two parameters and `loftPatch` does the rest.
 * The backlight cannot, because the surface it sits on is two surfaces:
 *
 *   · aft of the tailgate header the loft runs back as a shallow ramp —
 *     z −3.190 → −3.700 for 152 mm of fall, about 73° off vertical;
 *   · from there the tail rolls over onto the **rear face**, which is not a
 *     z-station at all and is built in `body/panels.ts` as an (x, y) patch —
 *     near-upright, 20° off vertical, running down past the lamps.
 *
 * The C3 Avant's backlight spans both. Building it on the ramp alone is what
 * gave the car a 231 mm slit lying 66° off vertical, so that from directly
 * behind you looked at the *top* of the glass rather than through it: on the
 * reference car the pane is the whole upper tailgate, as tall as the painted
 * panel beneath it, and you can see the load bay through it.
 *
 * So the pane is parameterised in its own frame — `a` from the header down to
 * the bottom edge, `b` across — and each sample is put back onto whichever of
 * the two body surfaces it lands on. The two agree exactly at the join: the
 * rear face's outline *is* the loft's last section, and `rearFaceZ` returns
 * `Z_TAIL_END` there, so the pane crosses the roll-over without a seam and
 * without either surface being re-derived here.
 *
 * ## What the numbers are
 *
 * | | y | z | half-width |
 * |---|---|---|---|
 * | top edge, centre | 1.284 | −3.190 | 0.622 |
 * | roll-over, centre | 1.138 | −3.700 | 0.712 |
 * | bottom edge | 1.010 | −3.759 | 0.712 |
 *
 * 274 mm of rise in 569 mm of run overall, but the *lower* 128 mm of it stands
 * at 25° — which is what the eye reads.
 *
 * Both edges are hardpoints now. The sill is `HP.glass.tailgateGlassBottomY`,
 * raised 48 mm to 1.010: below 0.985 it was a backlight sill under `HP.beltY`,
 * and it left the body only 42 mm of painted band above the lamps to carry
 * `HP.rear.badgeY`. That sill is now SETTLED — 994 mm measured against 1010
 * built. The body's `tgFaceUpper` rail runs `lampTopY` → the sill, which the
 * re-derived elevation made 0.888 → 1.010 (it was 0.920 → 1.010), so the
 * band-plus-strip stack is 122 mm against 105.5 ± 1.5 measured over five
 * columns, and the scripts sit on sheet metal.
 *
 * The width is `HP.glass.tailgateGlassHalfW` — see `HALF_W`.
 *
 * `HP.glass.tailgateGlassTopY` (1.285) is the top of the aperture the body
 * leaves, which is what is built: the tailgate's hinge line is
 * `HP.rear.tailgateHingeY` = 1.340 and the roof skin at that station is 1.338,
 * so no point on the tailgate can be higher.
 *
 * ⚠ That is an accurate description of the constraint and a wrong reading of
 * which end of it is broken. Measured on `bat_rear_straight_b.jpg`, rectified
 * for the frame's 0.98° roll and scaled on the lamp band's own 138.8 px for
 * 184 mm, the roof's trailing edge is at row 256 ± 1 and the top of the clear
 * glass at row 274 ± 2: **18 px of projected height, 24 mm**, steady across
 * x 800…1185. Our own `rear` frame puts the same two features 36 px apart on a
 * 62.2 px band — 106 mm. Parallax-corrected (camera height 0.798 from the
 * horizon at 49 % down the lamp band; the distance that lands the roof edge on
 * `HP.roofRearY` 1.412 is ~10 m) the photograph's glass top is **1.375
 * ± 0.010**, so this is 90 mm short.
 *
 * The hinge is therefore what has to move, and it moves in two axes: a top
 * edge that clears 1.375 by the header band's ~15 mm of drop puts
 * `tailgateHingeY` at **≈1.39**, and a hinge cannot stand above the roof skin,
 * so `tailgateHingeZ` comes forward from −3.108 to where our roof is still
 * that high — z ≈ −2.97…−3.00, i.e. `HP.roof.dPillarZ`, which is where a
 * wagon's tailgate cut is. Hardpoints, so reported rather than changed here.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { surfacePoint, halfWidthAt, Z_TAIL_END } from '@/car/body/surface';
import { rearFaceZ, tTailgate } from '@/car/body/panels';
import { Z, tailgateEdgeT } from './aperture';
import { clamp, lerp, type Sample } from './geom';
import type { Patch } from './pane';

/** Top of the aperture: the header band's rear edge, lapped by 4 mm. */
export const TG_TOP_Z = Z.tgGlassTop - 0.004;
/** Bottom edge, on the rear face. */
export const TG_BOTTOM_Y = HP.glass.tailgateGlassBottomY;

/**
 * Widest half-width of the aperture: `HP.glass.tailgateGlassHalfW`, 0.712.
 *
 * This was built at 0.745 by taking a fixed 85 mm painted margin off the tail's
 * own half-width at the sill, on the reasoning that either the hardpoint was
 * 33 mm narrow or the tail was too wide. It was the tail. Measured in ratios
 * between features in the same plane of the rear photograph — backlight
 * aperture against a taillamp band whose ends coincide with the body silhouette
 * — the true half-width is 0.710–0.717, and the body has since narrowed the
 * tail to match. Deriving the margin is therefore pointless as well as
 * fragile — the hardpoint *is* the margin, and it is the number the
 * photograph was measured for.
 *
 * ⚠ The RATIO survived the re-derivation; the ABSOLUTE did not. 0.843 × the
 * old `lampOuterX` 0.850 is 0.717; 0.843 × the corrected 0.750 is **0.632**.
 *
 * Measured directly rather than inherited, on `bat_rear_straight_b.jpg` at the
 * corrected 1.3256 mm/px, scanning outward from the centreline for the first
 * painted column: the aperture is **956 px at the sill row and 966 px at the
 * frit's bottom**, its widest — 1267 to 1281 mm, so a half-width of **0.634 to
 * 0.640**. Against a lamp band measured on the same frame at 1143 px
 * outer-to-outer that is a ratio of **0.845**, which is the 0.843 the
 * derivation started from, now agreeing in both the ratio and the absolute.
 * So 0.712 is **76 mm a side too wide**, and the knock-on is confirmed
 * independently of the chain.
 *
 * It is a hardpoint, so it is reported rather than changed here; and it must
 * not be applied on its own. `rearHalfWidth(1.010)` is 0.79 on the built body
 * against 0.688 measured on the photograph — and the same excess runs down the
 * whole tail: at the lamp band the built silhouette is 0.828–0.844 against
 * **0.770** measured (1162 px), so there is 83 mm a side of painted flank
 * outboard of each lamp where the photograph has ~13. Narrowing the glass
 * without narrowing the tail turns a 56 mm painted reveal into a 190 mm one
 * and the backlight reads as a letterbox.
 */
const HALF_W: number = HP.glass.tailgateGlassHalfW;

/** Blend either side of `HALF_W` over which the cap below takes effect. */
const CAP_SOFT = 0.030;

/**
 * `x`, held at or below `HALF_W`, with a tangent-continuous knee.
 *
 * A plain `Math.min` puts a 35° kink in the aperture's edge where it engages,
 * and the bond seal and the frit band both run along that edge. The quadratic
 * arrives at `HALF_W` with zero slope, which is what the backlight's rounded
 * lower corner is.
 */
function capped(x: number): number {
  if (x <= HALF_W - CAP_SOFT) return x;
  if (x >= HALF_W + CAP_SOFT) return HALF_W;
  const u = (x - HALF_W + CAP_SOFT) / (2 * CAP_SOFT);
  return HALF_W - CAP_SOFT + 2 * CAP_SOFT * (u - 0.5 * u * u);
}

const _p = new THREE.Vector3();

/**
 * Half-width of the pane at loft station `z`.
 *
 * Down the D-pillars this is the aperture the body leaves — 74 mm of arc
 * inboard of the tailgate's side shutline, so the glass laps 8 mm under the
 * 82 mm side frame. Near the tail end that inset stops meaning anything:
 * `tTailgate` has dived to the beltline by z −3.606, so 74 mm of arc taken from
 * it climbs back up over the shoulder and lands at x 0.760, wider than the sill
 * and within a millimetre of the body's own silhouette — a backlight with no
 * painted frame at all at the height where the photograph shows the most. The
 * aperture's widest point is its bottom corners, so the cap holds it there.
 *
 * The body's tailgate frame is still a constant 82 mm of arc off the same
 * shutline, so aft of z ≈ −3.40 it stops short of this edge — up to 61 mm on
 * the ramp, and 77 mm on the rear face above y 1.010, where `tgFaceUpper` ends
 * on a straight line at full width. That wedge is reported, not papered over:
 * widening the pane to cover it is what put the bulge there in the first place.
 */
function apertureHalfX(z: number): number {
  surfacePoint(z, tailgateEdgeT(z), _p);
  return capped(_p.x);
}

/** Section parameter at which the loft station `z` is `x` metres wide. */
function tAtX(z: number, x: number): number {
  const hi0 = Math.max(tTailgate(z), 0.02);
  let lo = 0, hi = hi0;
  if (halfWidthAt(z, hi) <= x) return hi;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    if (halfWidthAt(z, mid) < x) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

const X_END = apertureHalfX(Z_TAIL_END);
const X_BOTTOM = HALF_W;

/** Height of the loft's last section at half-width `x`. */
function rollOverY(x: number): number {
  surfacePoint(Z_TAIL_END, tAtX(Z_TAIL_END, Math.min(x, X_END)), _p);
  return _p.y;
}

/**
 * Split of the pane's `a` range between the ramp and the face, by arc length at
 * the centreline, so the mesh rows stay evenly spaced across the roll-over.
 */
const KNEE = (() => {
  surfacePoint(TG_TOP_Z, 0, _p);
  const ramp = Math.hypot(Z_TAIL_END - TG_TOP_Z, _p.y - rollOverY(0));
  const face = Math.hypot(rearFaceZ(0, TG_BOTTOM_Y) - Z_TAIL_END, rollOverY(0) - TG_BOTTOM_Y);
  return clamp(ramp / (ramp + face), 0.25, 0.85);
})();

/** A point on the backlight's outer face, before the flush offset. */
function skin(a: number, b: number, out: THREE.Vector3): void {
  const v = 2 * clamp(b, 0, 1) - 1;
  const s = clamp(a, 0, 1);
  if (s <= KNEE) {
    const z = lerp(TG_TOP_Z, Z_TAIL_END, KNEE <= 0 ? 1 : s / KNEE);
    const hw = apertureHalfX(z);
    const x = v * hw;
    surfacePoint(z, tAtX(z, Math.abs(x)), out);
    out.x = x;
  } else {
    const g = (s - KNEE) / (1 - KNEE);
    const x = v * lerp(X_END, X_BOTTOM, g);
    const y = lerp(rollOverY(Math.abs(v) * X_END), TG_BOTTOM_Y, g);
    out.set(x, y, rearFaceZ(x, y));
  }
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _da = new THREE.Vector3();
const _db = new THREE.Vector3();
/** Somewhere inside the load bay: only used to settle which way is out. */
const INSIDE = new THREE.Vector3(0, 1.05, -3.30);

/**
 * The backlight as a `Patch`. Normals come from the patch's own derivatives
 * rather than from either body surface, because at the roll-over the two
 * disagree by 50° and a normal taken from one of them would put a hard crease
 * across the middle of the glass.
 */
export function tailgatePatch(): Patch {
  const H = 0.0025;
  return (a, b, out: Sample, depth: number) => {
    skin(a, b, out.p);
    skin(clamp(a + H, 0, 1), b, _pa);
    skin(clamp(a - H, 0, 1), b, _pb);
    _da.copy(_pa).sub(_pb);
    skin(a, clamp(b + H, 0, 1), _pa);
    skin(a, clamp(b - H, 0, 1), _pb);
    _db.copy(_pa).sub(_pb);
    out.n.crossVectors(_da, _db);
    if (out.n.lengthSq() < 1e-16) out.n.set(0, 0, -1); else out.n.normalize();
    if (out.n.dot(_pa.copy(out.p).sub(INSIDE)) < 0) out.n.negate();
    out.p.addScaledVector(out.n, -depth);
    out.u = a;
    out.v = b;
  };
}

/** Bounds of the pane as built, for the report and for anything that lands on it. */
export function tailgateExtent(): { topY: number; bottomY: number; halfW: number } {
  surfacePoint(TG_TOP_Z, 0, _p);
  return { topY: _p.y, bottomY: TG_BOTTOM_Y, halfW: X_BOTTOM };
}

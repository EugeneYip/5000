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
 * | top edge, centre | 1.284 | −3.190 | 0.619 |
 * | roll-over, centre | 1.138 | −3.700 | 0.761 |
 * | bottom edge | 1.010 | −3.759 | 0.712 |
 *
 * 274 mm of rise in 569 mm of run overall, but the *lower* 128 mm of it stands
 * at 25° — which is what the eye reads.
 *
 * Both edges are hardpoints now. The sill is `HP.glass.tailgateGlassBottomY`,
 * raised 48 mm to 1.010: below 0.985 it was a backlight sill under `HP.beltY`,
 * and it left the body only 42 mm of painted band above the lamps to carry
 * `HP.rear.badgeY`. The body's `tgFaceUpper` rail now runs 0.920 → 1.010, so
 * the band is 90 mm and the scripts sit on sheet metal.
 *
 * The width is `HP.glass.tailgateGlassHalfW` — see `X_BOTTOM`.
 *
 * `HP.glass.tailgateGlassTopY` (1.285) is the top of the aperture the body
 * leaves, which is what is built: the tailgate's hinge line is
 * `HP.rear.tailgateHingeY` = 1.340 and the roof skin at that station is 1.338,
 * so no point on the tailgate can be higher.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { surfacePoint, halfWidthAt, Z_TAIL_END } from '@/car/body/surface';
import { rearFaceZ, rearHalfWidth, tTailgate } from '@/car/body/panels';
import { Z, tailgateEdgeT } from './aperture';
import { clamp, lerp, type Sample } from './geom';
import type { Patch } from './pane';

/** Top of the aperture: the header band's rear edge, lapped by 4 mm. */
export const TG_TOP_Z = Z.tgGlassTop - 0.004;
/** Bottom edge, on the rear face. */
export const TG_BOTTOM_Y = HP.glass.tailgateGlassBottomY;

/**
 * Painted margin between the glass and the tailgate's outer edge, on the rear
 * face. The body's own side frame above the roll-over is 82 mm, so matching it
 * keeps the reveal an even width all the way round.
 *
 * This lands the glass half-width at 0.745 rather than
 * `HP.glass.tailgateGlassHalfW` (0.712). The hardpoint is the narrower of the
 * two because the body's tail section is wider at this height than the
 * photograph's — see the report; 0.712 would leave a 118 mm painted reveal,
 * which reads as a frame the real car does not have.
 */
const FACE_MARGIN = 0.085;

const _p = new THREE.Vector3();

/** Half-width of the glass where it crosses the roll-over. */
function apertureHalfX(z: number): number {
  surfacePoint(z, tailgateEdgeT(z), _p);
  return _p.x;
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
const X_BOTTOM = Math.max(rearHalfWidth(TG_BOTTOM_Y) - FACE_MARGIN, 0.3);

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

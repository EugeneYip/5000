/**
 * Where the glass goes.
 *
 * ## Why this reads the body surface directly
 *
 * The C3's defining feature is that its glass is bonded *level with the body
 * skin* — `HP.glass.flushOffset` is 2 mm against the 12–18 mm every other 1980s
 * car recessed its windows by. A 2 mm step cannot be hit by modelling the glass
 * to its own set of numbers and hoping it lands on the panel: any disagreement
 * between the two surfaces is larger than the step itself, and the car stops
 * being a C3.
 *
 * So the glazing is generated from the *same analytic surface the body panels
 * are generated from*, displaced inward by exactly `flushOffset` along the
 * surface normal. Flushness is then structural rather than a number anyone has
 * to maintain: it cannot drift, because there is only one surface.
 *
 * `body/surface.ts` and `body/panels.ts` are imported read-only for that
 * reason, and for the aperture boundaries the body left — `tRoofOuter`,
 * `aPillarLower`, `tScreenEdge`, `tDloRear`, `tTailgate`. Those functions *are*
 * the panel edges; re-deriving them here would guarantee a gap.
 *
 * ## The t coordinate
 *
 * `t` runs around the transverse section: 0 at the roof centreline, 0.12 at the
 * roof side edge, 0.38 at the beltline. Every boundary below is stated in t,
 * with the metre offsets that turn a panel's parameter edge into the edge you
 * can actually see worked out once, here:
 *
 *      t = 0.1120   A-pillar skin, inboard edge    (windscreen aperture)
 *      t = 0.1231   roof skin, outboard edge       (DLO top)
 *      t = 0.1421   A-pillar skin, outboard edge
 *      t = 0.3846   door skin, top edge            (DLO bottom / beltline)
 *
 * Panes run a few millimetres *past* those into the shadow of the panel that
 * overlaps them, so no viewing angle can open a seam.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import {
  T, surfacePoint, surfaceNormal, dtFor, arcLen,
} from '@/car/body/surface';
import { Z, tRoofOuter, tScreenEdge, aPillarLower, tDloRear, tTailgate } from '@/car/body/panels';
import { clamp, lerp, type Sample } from './geom';

/** How far the glass outer face sits inside the body skin. The whole point. */
export const FLUSH: number = HP.glass.flushOffset;

export const SCREEN_THICK: number = HP.glass.windscreenThickness;
export const SIDE_THICK: number = HP.glass.sideThickness;

// ---------------------------------------------------------------------------
// Section landmarks
// ---------------------------------------------------------------------------

/**
 * Outer limit of the windscreen. Sits ~10 mm under the A-pillar's inboard skin
 * edge, so the pillar overlaps the glass instead of butting against it.
 */
export const SCREEN_T = 0.1150;

/**
 * The DLO's top edge, and the blackout that backs it.
 *
 * The roof-to-bodyside joint is a **pressed feature, not a painted line**: the
 * roof skin's face stops `QUALITY.edgeRadius` short of `tRoofOuter`, rolls
 * through that radius and returns a 16 mm flange, and the A-, B-, C- and
 * D-pillar panels all start again at `tRoofOuter`, tangent-continuous. So there
 * is a convex radius with a highlight on it running the whole greenhouse, and
 * the part that belongs on it is a section with depth — the trim stream's swept
 * bead, 22 mm across and 4.4 mm proud, straddling `tRoofOuter`.
 *
 * What is built here is therefore only the *blackout under* that bead: a band
 * lying a hair inside the skin that keeps the joint dark end to end, including
 * the stretch of the roll where the roof's face has curled away and the pillar
 * panel has not yet begun. A flat applique standing proud on a convex radius
 * can only z-fight it or float over it, which is what the old one did.
 */

/**
 * Upper edge of the blackout — 9 mm of skin inboard of the joint, so it runs
 * 3 mm under the roof skin's own edge and well inside the bead's upper lip.
 */
export function mouldTopT(z: number): number {
  const tro = tRoofOuter(z);
  return tro - dtFor(z, tro, 0.009);
}

/**
 * Lower edge of the blackout, and so the DLO's top line.
 *
 * Constant, and dead level along the whole flank — which is the point. It used
 * to taper 0.1300 → 0.1462, a 47 mm rise across the front door, because the
 * body's A-pillar was then 87 mm wide and its outboard edge sat 49 mm below the
 * roof skin's, so the moulding had to grow to swallow the step. The pillar has
 * since been narrowed until its outboard edge lands on `tRoofOuter` exactly;
 * the step is 0.0 mm, and a moulding that rises across a door for no reason is
 * worse than none.
 */
export function mouldBotT(_z: number): number {
  return 0.1300;
}

/** Top of the side glass: 14 mm up behind the moulding's lower lip. */
export function dloTopT(z: number): number {
  return mouldBotT(z) - 0.0042;
}

/** Bottom of the side glass: ~12 mm below the door skin's top edge. */
export function dloBotT(z: number): number {
  return T.belt + dtFor(z, T.belt, 0.012);
}

// ---------------------------------------------------------------------------
// Longitudinal landmarks for the daylight opening
// ---------------------------------------------------------------------------

/**
 * Division between the fixed front quarter light and the door drop glass.
 *
 * Has to sit aft of the *rearmost* point of the A-pillar's lower edge, which is
 * its top corner at −0.700. At −0.558 it was forward of that corner and aft of
 * the bottom one, so the quarter-light pane crossed itself — a bow tie whose
 * upper half was wound inside out.
 */
export const QUARTER_DIV_Z = -0.745;

/** Shutline-relative z limits of each pane, in the order they run back. */
export const DLO = {
  /**
   * Front corner of the DLO at the beltline, where the A-pillar dies into it.
   * Follows the body: `aPillarLower` reaches the beltline at −0.560 now that
   * its transition runs −0.700 … −0.560, so the corner is aft of the front
   * door's shutline rather than 155 mm ahead of it on the wing.
   */
  frontZ: -0.570,
  quarterDivZ: QUARTER_DIV_Z,
  bPillarFrontZ: Z.doorM + 0.040,
  bPillarRearZ: Z.doorM - 0.048,
  cPillarFrontZ: Z.doorR + 0.028,
  cPillarRearZ: Z.cPillarRear,
  /** Aft limit of the rear quarter glass at the beltline. */
  rearZ: -3.420,
} as const;

// ---------------------------------------------------------------------------
// Boundary inversions
// ---------------------------------------------------------------------------
//
// The DLO's front and rear edges are the A-pillar's lower edge and the
// D-pillar's leading edge, both of which the body states as t(z). A pane is
// far easier to sample the other way round, so both are inverted by bisection.
// Twenty-two iterations over a 220 mm span resolves to well under a micron.

/** Forward end of the A-pillar's belt transition: the pillar is slim from here aft. */
export const PILLAR_SLIM_Z = -0.700;

function invert(f: (z: number) => number, target: number, zLo: number, zHi: number): number {
  let lo = zLo, hi = zHi;
  const rising = f(zHi) > f(zLo);
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    if ((f(mid) < target) === rising) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** z of the A-pillar's lower edge at section position `t`. */
export function zAtPillarFront(t: number): number {
  if (t <= aPillarLower(PILLAR_SLIM_Z)) return PILLAR_SLIM_Z;
  if (t >= T.belt) return DLO.frontZ;
  return invert(aPillarLower, t, PILLAR_SLIM_Z, DLO.frontZ);
}

/** z of the D-pillar's leading edge at section position `t`. */
export function zAtPillarRear(t: number): number {
  if (t <= tDloRear(Z.dPillar)) return Z.dPillar;
  if (t >= T.belt) return DLO.rearZ;
  return invert(tDloRear, t, DLO.rearZ, Z.dPillar);
}

// ---------------------------------------------------------------------------
// Sampling onto the flush plane
// ---------------------------------------------------------------------------

const _n = new THREE.Vector3();

/** Outer face of the glazing at (z, t): the body skin, pushed in by `FLUSH`. */
export function glassPoint(z: number, t: number, out: Sample, depth: number = FLUSH): void {
  surfacePoint(z, t, out.p);
  surfaceNormal(z, t, out.n);
  out.p.addScaledVector(out.n, -depth);
}

/** Unit vector lying in the surface at (z, t), in the direction (dz, dt). */
export function surfaceDir(z: number, t: number, dz: number, dt: number, out: THREE.Vector3): THREE.Vector3 {
  const h = 0.004;
  const a = surfacePoint(z + dz * h, t + dt * h);
  const b = surfacePoint(z - dz * h, t - dt * h);
  out.copy(a).sub(b);
  surfaceNormal(z, t, _n);
  out.addScaledVector(_n, -out.dot(_n));
  if (out.lengthSq() < 1e-12) out.set(0, 0, 1);
  return out.normalize();
}

// ---------------------------------------------------------------------------
// Pane regions
// ---------------------------------------------------------------------------
//
// Each region is a map from the unit square onto (z, t). `a` runs fore-to-aft,
// `b` runs down the section from the roof to the beltline.

export type Region = (a: number, b: number) => { z: number; t: number };

/** A side-glass pane between two z stations, full DLO height. */
export function dloPane(zFront: number, zRear: number): Region {
  return (a, b) => {
    const z = lerp(zFront, zRear, a);
    return { z, t: lerp(dloTopT(z), dloBotT(z), b) };
  };
}

/** The front quarter light: raked front edge following the A-pillar. */
export function quarterFrontPane(): Region {
  return (a, b) => {
    const t = lerp(dloTopT(QUARTER_DIV_Z), dloBotT(QUARTER_DIV_Z), b);
    // 8 mm under the pillar's edge, so the pillar laps the glass.
    return { z: lerp(zAtPillarFront(t) + 0.008, QUARTER_DIV_Z + 0.003, a), t };
  };
}

/** The wagon's long rear quarter glass: raked rear edge under the D-pillar. */
export function quarterRearPane(): Region {
  return (a, b) => {
    const t = lerp(dloTopT(-2.9), dloBotT(-2.9), b);
    const zr = zAtPillarRear(t) - 0.010;
    return { z: lerp(DLO.cPillarRearZ + 0.006, zr, a), t };
  };
}

/** The windscreen. `a` runs cowl → header, `b` runs left → right. */
export function screenPane(): Region {
  return (a, b) => ({
    z: lerp(Z.cowlRear + 0.004, Z.header - 0.004, a),
    t: lerp(-SCREEN_T, SCREEN_T, b),
  });
}

/**
 * Inboard edge of the tailgate's side frame: the backlight's lateral limit.
 *
 * The frame is 82 mm of skin wide and the glass laps 8 mm under it, so this is
 * 74 mm of **arc** inboard of the side shutline — and it has to be integrated,
 * not stepped. `dtFor` is a local linearisation of ∂S/∂t, and across the tail's
 * D-pillar roll-over ∂S/∂t collapses: at z −3.30 it runs 1.44 at t 0.15, 0.45
 * at t 0.20 and 1.57 at t 0.30. Taking 82 mm at the shutline's own rate there
 * asked for Δt = 0.18 for a step the section covers in 0.06, and the "edge"
 * landed at x 0.247 — a 494 mm waist across the middle of a 1.5 m backlight,
 * with the same collapse driving the body's `tgSideR`. Inverting `arcLen`
 * instead is exact wherever the section is monotone, which it is here.
 */
export function tailgateEdgeT(z: number): number {
  const t0 = tTailgate(z);
  const target = arcLen(z, t0) - 0.074;
  if (target <= 0) return 0;
  let lo = 0, hi = t0;
  for (let i = 0; i < 26; i++) {
    const mid = 0.5 * (lo + hi);
    if (arcLen(z, mid) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------
// Drop direction for the door glass
// ---------------------------------------------------------------------------

/**
 * Where a door glass goes when it winds down, and how far.
 *
 * Two constraints fight here. The DLO leans inboard by about 21°, so a pane
 * dropped straight down ends up standing well proud of the door skin at the
 * top. But the flank keeps growing below the beltline — 855 mm at the belt,
 * 891 mm at its widest — so a pane that follows the DLO's own chord all the
 * way down pushes its *lower* edge 50 mm out through the door skin instead.
 *
 * The door's real run channels are near-vertical for exactly this reason, so
 * the chord's horizontal component is taken at about a seventh: enough lean
 * to clear the belt moulding, little enough that the bottom edge stays inside
 * the widest part of the flank.
 */
export function dropVector(z: number, side: 1 | -1): THREE.Vector3 {
  const top = surfacePoint(z, side * dloTopT(z));
  const bot = surfacePoint(z, side * T.belt);
  const v = bot.clone().sub(top);
  v.z = 0;
  v.x *= 0.14;
  return v.normalize();
}

/** Travel that buries the pane's top edge just under the belt moulding. */
export function dropTravel(z: number, side: 1 | -1): number {
  const top = surfacePoint(z, side * dloTopT(z));
  const bot = surfacePoint(z, side * T.belt);
  return (top.y - bot.y + 0.030) / Math.max(Math.abs(dropVector(z, side).y), 1e-3);
}

export { Z, T, tRoofOuter, tScreenEdge, aPillarLower, tDloRear, tTailgate, clamp, lerp };

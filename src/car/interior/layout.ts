/**
 * The cabin's own package drawing.
 *
 * `HP.interior` fixes the points the other streams care about — dash top, the
 * cluster, the wheel, the shifter, the load floor. Everything *between* those
 * points still has to be consistent, and consistent in one place, or the
 * seat's back rail ends up inside the B-pillar trim. So the derived cabin
 * surfaces live here and every module reads them.
 *
 * Frame is the vehicle frame: +X right, +Y up, +Z forward, origin on the
 * ground at the front axle. The car is left-hand drive, so the driver's side
 * is -X — that is what `HP.interior.hipPointDriver` says and everything here
 * follows it.
 */

import { BODY, TRIM_COLORS } from '@/spec';
import { HP } from '@/car/hardpoints';
import { T, halfWidthAt, heightAt, tAtY, topAt } from '@/car/body/surface';

const I = HP.interior;

/** Which side the driver is on, as a sign on X. */
export const DRIVER = -1;

export const CABIN = {
  /** Driver / passenger seat centreline. */
  seatX: Math.abs(I.hipPointDriver[0]),

  /** Footwell pan, and the higher floor the seats are bolted to. */
  footwellY: 0.342,
  floorY: 0.392,
  rearFloorY: 0.404,
  /** Transmission tunnel: a longitudinal five needs a big one. */
  tunnelHalfW: 0.112,
  tunnelTopY: 0.525,

  /** Inner face of the door trim, at the beltline and down at the sill. */
  innerHalfWBelt: BODY.tumblehomeTop - 0.052,
  innerHalfWSill: BODY.tumblehomeSill - 0.088,
  /**
   * Air between the roof skin and the lining below it, on the centreline and
   * out at the roof edge.
   *
   * These replace a pair of fixed heights struck off `BODY.height`. A fixed
   * height is right over the front half of the cabin and wrong over the back
   * of it: the roof falls ~77 mm between the B-pillar and the tailgate hinge,
   * so a flat lining at `BODY.height − 0.046` stands *above* the skin from
   * about z −2.9 rearward. Everything that hangs off the lining — the dome
   * lamps, the visors — reads the same two numbers through `headlinerY()`.
   */
  headlinerGap: 0.046,
  headlinerEdgeGap: 0.030,

  /** Beltline: top of the door card, bottom of the daylight opening. */
  beltY: HP.beltY,

  /** Door apertures, from the body shutlines with the frame allowed for. */
  doorFrontZ: HP.side.doorFrontZ - 0.028,
  doorMidZ: HP.side.doorMidZ,
  doorRearZ: HP.side.doorRearZ,
  /** Rear of the rear door card. */
  doorRearEndZ: HP.side.doorRearZ - 0.012,

  // -- dash -----------------------------------------------------------------
  dashTopY: I.dashTopY,
  dashFrontZ: I.dashFrontZ,
  dashRearZ: I.dashRearZ,
  /** Half-width of the dash moulding where it meets the A-pillars. */
  dashHalfW: 0.792,
  /** Bottom of the fascia, where the knee bolster tucks under. */
  dashBottomY: 0.648,
  /**
   * The fascia is raked: its face moves forward as it goes down. Slope chosen
   * so that the face passes exactly through `centreStackCenter`.
   */
  fasciaRake: 0.1727,

  // -- seats ----------------------------------------------------------------
  /** Front seat H-point, mirrored for the passenger. */
  hipY: I.hipPointDriver[1],
  hipZ: I.hipPointDriver[2],
  seatBackRakeDeg: I.seatBackRakeDeg,
  rearSeatZ: I.rearSeatZ,

  // -- cargo ----------------------------------------------------------------
  cargoFloorY: I.cargoFloorY,
  cargoFloorFrontZ: I.cargoFloorFrontZ,
  cargoFloorRearZ: I.cargoFloorRearZ,
  cargoHalfW: 0.636,
} as const;

/**
 * Inner surface of the windscreen at a given z, straight off the cowl and
 * header hardpoints. The dash top has to duck under this, and those two
 * numbers move — so nothing in this stream may assume a height near the
 * screen without asking.
 */
export function screenY(z: number): number {
  const t = (z - HP.cowlZ) / (HP.headerZ - HP.cowlZ);
  return HP.cowlY + (HP.headerY - HP.cowlY) * t;
}

/** Smooth minimum, so ducking under the screen does not put a kink in the pad. */
export function softMin(a: number, b: number, k = 0.010): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a * h + b * (1 - h) - k * h * (1 - h);
}

/** Where the fascia face sits at a given height. */
export function fasciaZ(y: number): number {
  return CABIN.dashRearZ + (CABIN.dashTopY - y) * CABIN.fasciaRake;
}

/** Inner trim half-width at a height — the body tumbles home above the belt. */
export function innerHalfW(y: number): number {
  const t = (y - HP.sillY) / (CABIN.beltY - HP.sillY);
  const k = Math.max(0, Math.min(1, t));
  return CABIN.innerHalfWSill + (CABIN.innerHalfWBelt - CABIN.innerHalfWSill) * (k * (2 - k));
}

// ---------------------------------------------------------------------------
// The roof, read off the body
// ---------------------------------------------------------------------------
//
// The cabin is closed from above by the headliner and by nothing else: the
// roof skin is a one-sided shell with a 16 mm flange, so a camera inside the
// car sees its back faces, which are culled, and then the sky. That makes the
// lining a structural part of this stream rather than a decorative one, and it
// has to follow the real roof rather than a constant height — which means
// reading the body's own surface, the same way `car/trim/bodyref.ts` does.
//
// `HP.roofRearY` (1.412 at z −3.043) cannot be used for this: the built roof
// is at 1.386 by z −2.968 and 1.338 at the tailgate hinge, so a lining hung
// off the hardpoint would stand ~50 mm proud of the skin over the load bay.
// Reported rather than worked around — see the stream report.

/** Stations the fixed roof spans: windscreen header to tailgate hinge. */
export const ROOF_FRONT_Z = HP.headerZ;
export const ROOF_REAR_Z = HP.rear.tailgateHingeZ;

/** Half-width of the body skin at station `z` and height `y`. */
export function skinHalfW(z: number, y: number): number {
  return halfWidthAt(z, tAtY(z, y));
}

/** Height at which the roof skin turns down into the body side. */
export function roofEdgeY(z: number): number {
  return heightAt(z, T.roofEdge);
}

/**
 * The lining's outboard shoulder: where the crown stops and the board turns
 * down to lap over the top of the glass.
 *
 * Kept below the roof edge by `headlinerEdgeGap` so the joint is behind the
 * glass line from outside, and inboard of the skin by `SKIN_INSET`, which is
 * the flush-glazing offset plus the glass itself plus a little clearance.
 */
const SKIN_INSET = 0.012;

export function headlinerShoulder(z: number): [number, number] {
  const y = roofEdgeY(z) - CABIN.headlinerEdgeGap;
  return [skinHalfW(z, y) - SKIN_INSET, y];
}

/**
 * Underside of the roof lining at (x, z). Beyond the shoulder it returns the
 * shoulder height, so anything hung off the lining stays under the board.
 */
export function headlinerY(x: number, z: number): number {
  const zc = Math.min(ROOF_FRONT_Z, Math.max(ROOF_REAR_Z, z));
  const crown = topAt(zc) - CABIN.headlinerGap;
  const [xs, ys] = headlinerShoulder(zc);
  const k = Math.min(1, Math.abs(x) / xs);
  return crown - (crown - ys) * k * k;
}

/**
 * Period Audi anthracite.
 *
 * `spec.ts` gives the cabin **one** plastic colour, and a build of this stream
 * was asking the library for nineteen greys against it — every module having
 * reached independently for "a bit darker than the fascia" and landed a few
 * parts in 255 away from the last one that did. Each distinct value is its own
 * material, its own program and its own draw.
 *
 * So there are four, and the three anthracites are *struck from the spec
 * colour* rather than typed out, which is what stops them drifting again: move
 * `TRIM_COLORS.interiorPlastic` and the whole cabin moves with it, in step.
 * What survives is only what a real cabin really does have — one moulded
 * colour, a darker one for the soft and lower parts, near-black switchgear,
 * and the light grey of the headliner, which is not a shade of the others at
 * all. The seat cloth and the carpet keep their own `TRIM_COLORS` entries.
 */
function strike(hex: number, k: number): number {
  const c = (s: number): number => Math.min(255, Math.round(s * k));
  return (c((hex >> 16) & 255) << 16) | (c((hex >> 8) & 255) << 8) | c(hex & 255);
}

export const TONE = {
  /**
   * The master: `TRIM_COLORS.interiorPlastic` itself, unmodified. Every
   * injection-moulded A-surface in the cabin — fascia, pillar trim, door card
   * uppers, console sides, the wheel's horn pad.
   */
  fascia: TRIM_COLORS.interiorPlastic,
  /**
   * One step down, for everything that is *not* hard moulded plastic: the
   * vacuum-formed dash pad over its foam, the lower door panels, seat backs,
   * the load-bay trim and the armrest vinyl. Softer skins take a pigment load
   * the same way but scatter more, and they read darker in the same light —
   * this is the one genuine difference in the cabin that is not a finish.
   */
  trim: strike(TRIM_COLORS.interiorPlastic, 0.76),
  /**
   * Switchgear, bezels, knobs, the cluster surround. Near-black is a real
   * period choice and not a shade of the fascia: VDO's instrument plastics and
   * the rocker caps were moulded black so the graphics read against them.
   */
  switchgear: strike(TRIM_COLORS.interiorPlastic, 0.36),
  /**
   * The one light grey in the car: the moulded headliner board, and the pale
   * markings on the fascia. A period headliner is not a lighter anthracite, it
   * is a different colour entirely, and it is what stops the cabin reading as
   * a black hole behind the glass.
   */
  light: 0x8c8e93,

  /**
   * Aliases onto the four above, kept so call sites stay readable about what
   * they are dressing. They are the same values, so they fold into the same
   * material instances — the rationalisation is in how many DISTINCT greys
   * exist, not in how many names point at them.
   */
  get dashPad() { return this.trim; },
  get lowerTrim() { return this.trim; },
  get leatherette() { return this.trim; },
  get clusterBlack() { return this.switchgear; },
  get wheelUrethane() { return this.fascia; },
  get bright() { return this.light; },
} as const;

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

import { BODY } from '@/spec';
import { HP } from '@/car/hardpoints';

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
  /** Inner face of the roof lining, centre and at the rail. */
  headlinerY: BODY.height - 0.046,
  headlinerEdgeY: BODY.height - 0.072,

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

/**
 * Period Audi anthracite. `TRIM_COLORS.interiorPlastic` is the master tone;
 * a real cabin is not one colour, so the darker lower panels and the softer
 * upper pad are struck from it here rather than in six different modules.
 */
export const TONE = {
  dashPad: 0x2c2e33,
  fascia: 0x33353a,
  lowerTrim: 0x26282c,
  bright: 0x8d9198,
  clusterBlack: 0x141518,
  wheelUrethane: 0x2a2c30,
  leatherette: 0x232529,
} as const;

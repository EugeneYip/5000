/**
 * Every dimension the wheel assembly uses, derived once from `@/spec`.
 *
 * The fitment is 6J x 14 with 185/70 HR14, the factory brochure figure for the
 * 5000 S saloon and wagon. Everything below follows from that plus the ETRTO /
 * TRA rim standards for a "J" flange contour.
 *
 * Frame for a single wheel, before it is placed on the car:
 *   +X = OUTBOARD (away from the car), the wheel spins about X
 *   +Y = up,  +Z = the wheel's own "forward"
 * Both sides are built from this one right-hand-outboard frame; the left-hand
 * corners are rotated 180 deg about Y, exactly as a real wheel is fitted.
 */

import { BRAKES, QUALITY, WHEEL, tyreRadius } from '@/spec';

const INCH = 0.0254;

/** Static tyre deflection at nominal load, i.e. free radius minus loaded radius.
 *  `wheelPositions()` fixes the hub at `tyreRadius()`, and the contact patch has
 *  to land on the ground plane, so the tyre is built this much larger than its
 *  nominal free radius and squashed back down to it. */
export const DEFLECT_STATIC = 0.012;
export const DEFLECT_MIN = 0.004;
export const DEFLECT_MAX = 0.030;

export const RIM = {
  /** Bead seat radius — the nominal 14 in. */
  beadR: (WHEEL.rimDiameterIn * INCH) / 2,
  /** 6J: the J is the flange contour, 17.3 mm tall measured off the bead seat. */
  flangeH: 0.0173,
  /** Bead seat to bead seat. */
  seatW: WHEEL.rimWidthIn * INCH,
  /** Wall thickness of the cast barrel. */
  wall: 0.0058,
  /** Drop centre: the well that lets a tyre be fitted at all. */
  wellDepth: 0.0235,
  /** Offset. ET45. Positive = the mounting face sits outboard of the rim
   *  centreline. */
  offset: WHEEL.offsetMm / 1000,

  /**
   * Bolt circle. Audi bolted its wheels on rather than using studs and nuts.
   * FOUR bolts on 108 mm — 5x112 is the quattro's pattern, not the 5000 S's,
   * and the difference is obvious on any wheel close-up.
   */
  pcd: WHEEL.boltCircleMm / 1000,
  bolts: WHEEL.boltCount,
  boltHeadR: 0.0105,
  boltPocketR: 0.0158,
  boltPocketDepth: 0.0135,
  /** Centre bore over the hub spigot. */
  boreR: 0.0285,

  /** Hub face thickness where the wheel clamps to the disc. */
  mountThickness: 0.0165,
} as const;

/** Flange tip radius — the outermost metal of the rim. */
export const FLANGE_R = RIM.beadR + RIM.flangeH;                   // 0.1951

/**
 * The face of the 9-slot "bottlecap".
 *
 * Proportions measured off a face-on photograph of a bare 443 601 025 A:
 * nine capsule slots on a 40 deg pitch, spanning 0.66..0.82 of the flange
 * radius and about 33 deg of arc each, with the centre pocket wall at 0.46.
 */
export const FACE = {
  slots: 9,
  slotInnerR: 0.660 * FLANGE_R,      // 0.1288
  slotOuterR: 0.820 * FLANGE_R,      // 0.1600
  slotSpanDeg: 32.5,
  /** Face disc runs out to the bead seat, where it meets the barrel. */
  outerR: RIM.beadR,
  /** Centre pocket: the bolts live in here and the cap covers it. */
  pocketR: 0.460 * FLANGE_R,         // 0.0898
  pocketDepth: 0.0275,
  /** Thickness of the cast spider web. */
  thickness: 0.0125,
  /** Centre cap: a shallow flat disc with the four rings. */
  capR: 0.0862,
  capRise: 0.0055,
  ringsOuterD: 0.0255,
  ringsTubeR: 0.0018,
} as const;

export const TYRE = {
  sectionW: WHEEL.width,                                    // 0.185
  /** Free radius, built oversize by the static deflection — see DEFLECT_STATIC. */
  freeR: tyreRadius() + DEFLECT_STATIC,
  /** Nominal (spec) radius, where the loaded contact patch ends up. */
  loadedR: tyreRadius(),
  /** Tread band width. A 185 section on a 6J rim lays down about 152 mm. */
  treadW: 0.152,
  treadDepth: 0.0082,
  /** Crown: the tread is not a cylinder, it is slightly barrelled. */
  crownDrop: 0.0028,
  /** Circumferential pitches in the tread pattern. */
  pitches: 32,
  /** Rings emitted per pitch: land, wall, wall, land. */
  ringsPerPitch: 4,
} as const;

export const BRAKE = {
  discR: BRAKES.discDiameterFront / 2,
  discRRear: BRAKES.discDiameterRear / 2,
  /** Vented front disc: two 6.8 mm friction faces with a 8.9 mm vane gap. */
  frontThickness: 0.0225,
  frontFaceThickness: 0.0068,
  rearThickness: 0.0100,
  vanes: 32,
  /** Friction ring inner radius, as a fraction of the disc radius. */
  frictionInnerFrac: 0.615,
  /** Hat: the top-hat section that bolts to the hub. */
  hatR: 0.0725,
  /** Mounting face to the friction ring centre plane. */
  hatDepth: 0.0415,
  /** Caliper sits at the rear of the front hub, trailing. Measured from
   *  straight up, positive towards the wheel's local +Z. */
  caliperPhiDeg: 285,
  caliperSpanDeg: 52,
  /** Everything has to live inside a 14 in rim's drop centre — this is why a
   *  period car cannot have big brakes. */
  caliperMaxR: 0.1455,
  padThickness: 0.0105,
  padBackThickness: 0.0055,
  shieldGap: 0.0075,
} as const;

/** Per-axle alignment, straight from the spec. */
export function alignment(front: boolean): { camberRad: number; toeRad: number } {
  const d2r = Math.PI / 180;
  return {
    // Spec camber is negative for "top leans in"; in the outboard-referenced
    // wheel frame that is a positive rotation about +Z.
    camberRad: -(front ? WHEEL.camberFrontDeg : WHEEL.camberRearDeg) * d2r,
    toeRad: (front ? WHEEL.toeFrontDeg : WHEEL.toeRearDeg) * d2r,
  };
}

/** Nothing on a real car is a sharp edge. */
export const EDGE = QUALITY.edgeRadius;

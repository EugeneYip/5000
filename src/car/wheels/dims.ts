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

/**
 * Contact-patch sag at the static ride, and its range over suspension travel.
 *
 * This is NOT added to the tyre's radius. An earlier build inflated the free
 * radius by the sag so the hub could stay at `tyreRadius()` and the flattened
 * bottom would come back to the ground — which put the tyre 24 mm oversize
 * (639 mm against the spec's 614.6) and, because the shader never ran, left it
 * 12 mm into the road as well. The tyre is now built at exactly `tyreRadius()`
 * and the patch is a *local* deformation: the carcass swells outboard of the
 * patch and is pulled down onto the road plane inside it, which is what a
 * loaded tyre's outline actually does. Free diameter therefore stays 614.6 mm
 * however hard the corner is loaded, and nothing can reach below the road.
 *
 * The sag is a half-chord: patch length = 2·sqrt(R² − (R − sag)²), so 8.5 mm
 * gives a 143 mm patch on this tyre — a period 185/70 at ~2.1 bar.
 */
export const DEFLECT_STATIC = 0.0085;
export const DEFLECT_MIN = 0.0020;
export const DEFLECT_MAX = 0.0235;

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
  /** Free radius — exactly the spec figure. Overall diameter 614.6 mm. */
  freeR: tyreRadius(),
  /** Section height: 70 % of a 185 section. 129.5 mm, and most of why the car
   *  reads as a 1980s car rather than a 2000s one. */
  sectionH: tyreRadius() - (WHEEL.rimDiameterIn * INCH) / 2,
  /** Maximum section half-width. A 185 on a 6J measures its nominal section. */
  halfW: WHEEL.tyreSectionMm / 2000,                        // 0.0925
  /** Tread band width. A 185 section on a 6J rim lays down about 152 mm. */
  treadW: 0.152,
  treadDepth: 0.0082,
  /** Crown: the tread is not a cylinder, it is slightly barrelled. */
  crownDrop: 0.0028,
  /** Circumferential pitches in the tread pattern. 53 mm at this radius. */
  pitches: 36,
} as const;

/**
 * Outboard sidewall section, tread edge down to behind the flange tip.
 * `[axial, radius]`, and every radius is a fraction of section height above the
 * bead seat so the whole profile follows `tyreRadius()`.
 *
 * The shape is the point of the exercise. In order, from the rim outwards:
 * the tyre emerges at the flange tip, swells immediately into the **rim
 * protector rib** (which has to stand outboard of the flange or it is not
 * protecting anything), tucks back *in* to a **concave waist** — this is the
 * part a torus gets wrong and the reason a doughnut never reads as a tyre —
 * then flares steadily out to the **widest point** at 69 % of section height
 * and turns over the shoulder into the tread.
 */
const SIDEWALL_SECTION: ReadonlyArray<readonly [number, number]> = [
  // axial   t = height above the bead seat, as a fraction of section height
  [0.0870, 0.0900],   // tucked behind the flange tip, never seen
  [0.0912, 0.1290],   // emerges at the flange tip
  [0.0958, 0.1800],   // rim protector rib crest — proud of the flange
  [0.0938, 0.2340],   // back in above the rib
  [0.0906, 0.3000],   // concave waist
  [0.0898, 0.3950],   // waist minimum
  [0.0906, 0.4960],   // legend band, lower
  [0.0917, 0.5920],   // legend band, upper
  [0.0925, 0.6900],   // widest point — half of the 185 section
  [0.0921, 0.7820],
  [0.0903, 0.8670],
  [0.0868, 0.9320],   // shoulder
  [0.0818, 0.9710],
];

/** The section in metres, as `[axial, radius]`. */
export function sidewallProfile(): Array<[number, number]> {
  const Rb = (WHEEL.rimDiameterIn * INCH) / 2;
  return SIDEWALL_SECTION.map(([a, t]) => [a, Rb + t * TYRE.sectionH] as [number, number]);
}

/** Radial band each moulded legend row sits in, as a fraction of section
 *  height. Kept here so the geometry and the texture cannot disagree. */
export const LEGEND = {
  brandT: 0.780,
  sizeT: 0.605,
  constructionT: 0.470,
  dotT: 0.355,
  /** Fine serrated ring low on the sidewall, above the protector rib. */
  serrationT: [0.200, 0.300] as [number, number],
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

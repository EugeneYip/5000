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
 * ## Static sag: the car is parked ON its tyres, not on a pair of circles.
 *
 * `wheelPositions()` puts the hub at `tyreRadius()`, the tyre's **free**
 * radius, so until this round the model's hubs sat 307.3 mm above the road and
 * the tread met it as a perfect circle. A contact patch with no flat in it is
 * the most reliable tell there is that a car was rendered rather than
 * photographed, and it also biased every ground-referenced measurement in the
 * project by the whole of the sag — see caution 1 in the long note at
 * `HP.front.bumperTopY`.
 *
 * `scratchpad/cl2_datum.py` measures hub-to-contact on the two reference
 * flanks:
 *
 *     bat3 (silver Avant, 185/70 HR14)    front 279.1   rear 291.3
 *     bat  (red CS Turbo quattro)         front 266.9   rear 279.8
 *
 * **The silver Avant is the only one of the two that can supply the
 * absolute.** `scratchpad/ref3/bat_wheel_front.jpg` reads `205 60 R15` off the
 * red car's sidewall, so its free radius is 313.5 mm and not 307.3 at all, and
 * a 46.6 mm sag on its 123 mm section height would be a tyre at walking
 * pressure. Its figures are quoted here only because the two cars agree on the
 * front-to-rear SPLIT — 12.2 mm and 12.9 mm — which is the one thing a common
 * bias in finding a hub centre cannot manufacture.
 *
 * An independent sub-pixel trace of the same two outlines
 * (`scratchpad/ty_outline.py`) reads 282.4 / 293.9 on the silver car, 3 mm
 * shallower. The `cl2_datum` figures are the ones taken: every other hardpoint
 * in this project is contact-line referenced through that script, and sharing
 * a datum is worth more than 3 mm of absolute.
 *
 * ## The front/rear split is a tuning parameter, and says so
 *
 * A radial's deflection is near enough linear in vertical load at a fixed
 * pressure, so 28.2 / 16.0 implies a **63.6 %** front weight bias.
 * `BODY.weightDistFront` says 0.60 and CLAUDE.md is explicit that it is not a
 * sourced figure; neither is this. They are two unsourced estimates that
 * disagree by 3.6 points, and the sag is deliberately **not** derived from
 * `weightDistFront`: that is a physics tuning knob, and a change to it must
 * not be able to move the car's photometric stance behind the gate's back.
 *
 * The same trace confirms the shape the deformation has to have. Radial
 * deficit against the free circle, silver front, mm from the hub:
 *
 *     z       0    ±50   ±100   ±120   ±139
 *     deficit 25.8  21.5   10.2    3.3   -4.0
 *
 * i.e. the outline is dead flat out to where the free circle re-emerges from
 * the road, at ±123 mm for this sag, and untouched beyond it. That is exactly
 * a chord, so a chord is what the shader cuts.
 */
export const SAG_FRONT = 0.028;
export const SAG_REAR = 0.016;

/** Hub height above the road at the static ride. */
export function loadedRadius(front: boolean): number {
  return tyreRadius() - (front ? SAG_FRONT : SAG_REAR);
}

/**
 * How far the sidewall swells outboard beside the patch, per metre of radial
 * deflection, at the widest point of the section.
 *
 * Not measurable on either flank frame — a dead-on side view has no axial
 * information in it — so this one is a judgement tuned by eye on `front3q`
 * against `scratchpad/ref3/bat_wheel_front.jpg`. 0.20 puts 5.6 mm on the front
 * sidewall and 3.2 on the rear, a ~6 % local growth in section width, which is
 * the right order for a loaded radial and is *less* than the 8.5 mm the
 * previous build was already drawing from a constant sag.
 */
export const BULGE_RATIO = 0.20;

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
 * The face of the "bottlecap".
 *
 * Proportions measured off a face-on photograph of a bare 443 601 025 A:
 * capsule slots on a 360/WHEEL.bottlecapSlots pitch, spanning 0.66..0.82 of the flange
 * radius and about 33 deg of arc each, with the centre pocket wall at 0.46.
 */
export const FACE = {
  /**
   * Read from spec rather than duplicated here. Spec says 12, on a 30 degree
   * pitch, from two converging measurements: slot centres off a US 5000 S
   * Wagon photograph corrected for ~50 degree foreshortening (30.3 / 29.8
   * degrees), and an independent radial scan finding 9 clean slots plus a
   * 1-slot and a 2-slot gap.
   *
   * This was hard-coded at 9, and 9 is easy to arrive at: a wheel-dealer
   * catalogue calls the part a "9 Slot", and the bright land between two slots
   * reads as a slot at small sizes — two separate reviewers counted 12 by eye
   * off a render that actually had 9.
   */
  slots: WHEEL.bottlecapSlots,
  slotInnerR: 0.660 * FLANGE_R,      // 0.1288
  slotOuterR: 0.820 * FLANGE_R,      // 0.1600
  /**
   * Derived from the pitch, not fixed: the original 32.5 deg was sized against
   * a 40 deg pitch, and left unchanged at a 30 deg pitch the slots would
   * overlap into each other. 0.8125 is the original span-to-pitch ratio.
   */
  slotSpanDeg: (360 / WHEEL.bottlecapSlots) * 0.8125,
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
  [0.0868, 0.0880],   // tucked behind the flange tip, never seen
  [0.0908, 0.1250],   // emerges at the flange tip
  [0.0938, 0.1540],   // rib flank, climbing fast
  [0.0955, 0.1830],   // rim protector rib crest — 3.0 mm proud of the section
  [0.0936, 0.2120],   // over the crest and straight back in
  [0.0903, 0.2680],
  [0.0889, 0.3500],   // waist minimum — 3.6 mm inside the widest point
  [0.0898, 0.4500],   // legend band, lower
  [0.0913, 0.5700],   // legend band, upper
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

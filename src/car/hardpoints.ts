/**
 * ============================================================================
 *  HARDPOINTS — the package drawing.
 * ============================================================================
 *
 *  Real car programmes fix the hardpoints before anyone models a surface, so
 *  that the lamp team and the body team can work at the same time and the
 *  parts still meet. Same idea here: this file is the interface between the
 *  geometry work streams.
 *
 *  RULES
 *    · These numbers are FIXED. If a value is wrong, change it here, once,
 *      and tell the other streams — never work around it locally.
 *    · Body surfaces must pass through / bound to these points.
 *    · Trim, lamps, glass and interior must attach AT these points and must
 *      not invent their own.
 *
 *  Frame: +Y up, +Z forward, origin on the ground at the front axle. Metres.
 *  Symmetric parts give the +X value only; mirror for −X.
 *
 *  **+X IS THE CAR'S LEFT.** This line used to read "+X right" and it was
 *  wrong, and it has put real parts on the wrong side of the car.
 *
 *  three is right-handed: a camera on +Z looking at the origin with +Y up
 *  sees +X on the right of the frame. The `front` pose is exactly that, and
 *  the car's nose points at it — and a car facing you has its right side on
 *  your left. So the car's right is −X.
 *
 *  What it cost. The mesh names follow the old sentence and are therefore
 *  inverted: `mirrorSailRight` is at +X, i.e. on the left. A review found the
 *  fuel filler "on the wrong flank" by trusting `doorFR`, and it is in fact
 *  correct. Worse, the steering wheel sits at −0.372 — placed as "left" under
 *  the old convention — which is the car's **right**, so the car is built
 *  right-hand drive. Measured against the photograph: its instrument binnacle
 *  is clearly right of the plate/rings centreline in a dead-on front view, and
 *  ours is left of it. Mirrored.
 *
 *  When you place an asymmetric part, do not reason from a mesh name. Check
 *  the sign against this note, or with `__AUDI.pick` on the `side` pose — that
 *  camera sits at +X, and the flank it sees has the nose at image-left, which
 *  is the car's left flank.
 *
 *  Front-end proportions come from two photographs measured independently —
 *  the owner's car scaled on its licence plate, and a 1985 US wagon with the
 *  yaw solved from its square amber lens. They agree: the headlamp is
 *  ~409 x 168 mm, an aspect of 2.4 : 1, and the grille-to-single-lamp width
 *  ratio is 1.81 : 1.
 *
 *  An earlier reading of the owner's photograph gave 1.41 : 1 and a 3.6 : 1
 *  lamp. Both were wrong: that measurement was taken on a foreshortened frame
 *  without solving for yaw, and the brightness threshold used to find the lamp
 *  kept capturing the bumper's bright top strip as part of it. The strip sits
 *  at y 771-778 while the lamp aperture is 670-759 — separable, but only once
 *  you know to look. See docs/REFERENCE-PHOTO.md and docs/CRITIQUE.md.
 * ============================================================================
 */

import { BODY, tyreRadius } from '@/spec';

const R = tyreRadius();
const NOSE = BODY.overhangFront;                       // +1.084
const TAIL = -(BODY.wheelbase + BODY.overhangRear);    // −3.816
const HW = BODY.width / 2;                             // 0.907

export const HP = {
  // -------------------------------------------------------------------------
  // Global reference planes
  // -------------------------------------------------------------------------
  noseZ: NOSE,
  tailZ: TAIL,
  halfWidth: HW,
  frontAxleZ: 0,
  rearAxleZ: -BODY.wheelbase,
  wheelRadius: R,

  /** Cowl: base of the windscreen, where it meets the bonnet. */
  cowlZ: -0.37,
  cowlY: 1.014,
  /** Windscreen header: top of the glass at the roof. */
  headerZ: -1.17,
  headerY: 1.398,
  /** Roof skin runs flat-ish from header to the D-pillar break. */
  roofRearZ: TAIL + 0.773,
  roofRearY: 1.412,
  /** Beltline — top of the door skin, bottom of the side glass. */
  beltY: 0.985,
  /** Rocker underside. */
  sillY: 0.235,

  // -------------------------------------------------------------------------
  // Front end
  // -------------------------------------------------------------------------
  front: {
    /** Grille aperture. Spans ±grilleHalfW, so 0.700 m overall. */
    grilleHalfW: 0.37,
    grilleTopY: 0.812,
    grilleBottomY: 0.660,
    grilleZ: 0.942,
    /** How far the slats sit behind the surrounding surface. */
    grilleRecess: 0.035,
    /** Seven bright slats, eight apertures — counted off 2048 px photography. */
    grilleSlats: 7,

    /** The four rings, centred in the grille. */
    ringsCenter: [0, 0.7415, 0.952] as [number, number, number],
    /** Outer diameter of one ring, and the centre-to-centre spacing. */
    ringDiameter: 0.080,
    ringSpacing: 0.0615,
    ringTubeRadius: 0.0055,

    /** Headlamp aperture, +X side. Inner edge meets the grille. */
    lampInnerX: 0.37,
    /**
     * Not the outer edge of the aperture — the aperture runs on to the body's
     * own half-width, as it does at the tail.
     *
     * Measured on the reference photograph's right front corner at 4x, the
     * order across the face is grille, headlamp glass, amber corner lens, body
     * edge, with nothing between them: the corner lens butts straight onto the
     * lamp glass and wraps around the corner. So this is the boundary between
     * the clear lens and the amber, and the 71 mm outboard of it is amber, not
     * paint. `body.ts` panels that 71 mm (`lampSideR`) because there is sheet
     * metal behind an indicator; the lens covers it.
     */
    lampOuterX: 0.779,
    lampTopY: 0.820,
    lampBottomY: 0.652,
    lampZ: 0.952,
    /** The outboard portion of the lamp is the amber indicator. */
    indicatorInnerX: 0.688,

    /** Bumper: a deep, soft, body-coloured-grey moulding. */
    bumperTopY: 0.648,
    bumperBottomY: 0.402,
    bumperZ: NOSE,
    /** Bright strip along the bumper's UPPER EDGE, not across its face. */
    rubStripY: 0.625,
    rubStripHeight: 0.046,
    /** Amber marker at the bumper's outboard end. */
    markerX: 0.822,
    markerY: 0.512,

    /** Lower valance and air dam below the bumper. */
    valanceBottomY: 0.212,

    /** Licence plate, centred, recessed into the bumper face. */
    plateCenter: [0, 0.512, NOSE + 0.004] as [number, number, number],

    /** Bonnet leading edge and its shutline to the front wings. */
    hoodFrontZ: 0.782,
    hoodFrontY: 0.843,
    hoodRearZ: -0.355,
    hoodRearY: 1.038,
    hoodHalfW: 0.742,
  },

  // -------------------------------------------------------------------------
  // Sides
  // -------------------------------------------------------------------------
  side: {
    /**
     * Arch centre is the WHEEL centre — track/2, not the body half-width.
     * The arch LIP is separately out at the body surface (`archLipX`); the
     * difference between the two is the tuck-in of the wheel under the arch.
     */
    archFrontCenter: [BODY.trackFront / 2, R, 0] as [number, number, number],
    archRearCenter: [BODY.trackRear / 2, R, -BODY.wheelbase] as [number, number, number],
    archLipX: HW - 0.016,
    archRadius: R + 0.082,
    /** Arches are not circular — they flatten at the top. */
    archFlatten: 0.88,

    /** Door shutlines, measured at the beltline. */
    doorFrontZ: -0.455,
    doorMidZ: -1.585,
    doorRearZ: -2.463,

    /** Door handle: the C3's flush pull-up type. */
    handleFrontCenter: [HW - 0.038, 0.905, -1.115] as [number, number, number],
    handleRearCenter: [HW - 0.038, 0.905, -2.145] as [number, number, number],
    handleSize: [0.118, 0.032, 0.026] as [number, number, number],

    /** Mirror base on the front door's sail panel. */
    mirrorBase: [HW - 0.05, 1.028, -0.552] as [number, number, number],
    /** Mirror shell centre, relative to the base. */
    mirrorOffset: [0.092, 0.012, 0.03] as [number, number, number],
    mirrorSize: [0.058, 0.098, 0.168] as [number, number, number],

    /** Side rubbing strip along the doors. */
    /**
     * 57 mm as built measured against ~97-99 mm in the blueprint and the
     * reference photographs — the strip was nearly half width. Grown upward
     * with its bottom edge held, which also brings its top to within 11 mm of
     * the bumper mouldings' own strip instead of 65 mm below it.
     */
    rubStripY: 0.5875,
    rubStripHeight: 0.098,
    rubStripFrontZ: 0.495,
    rubStripRearZ: TAIL + 0.398,

    /** Fuel filler flap — left side on this car. */
    fuelFlapCenter: [-HW + 0.03, 0.795, -2.885] as [number, number, number],
    fuelFlapSize: [0.152, 0.152] as [number, number],

    /** Side marker lamps. */
    markerFront: [HW - 0.01, 0.712, 0.585] as [number, number, number],
    markerRear: [HW - 0.01, 0.742, TAIL + 0.328] as [number, number, number],
  },

  // -------------------------------------------------------------------------
  // Greenhouse — the C3's flush glazing is its signature
  // -------------------------------------------------------------------------
  glass: {
    /**
     * Flush-mount offset: how far the glass outer face sits INSIDE the body
     * surface. On a C3 this is almost nothing — that near-zero step is how the
     * range reached Cd 0.30 in saloon form (0.34 for this wagon) and it is the
     * single most recognisable detail of the car.
     * A conventional 1980s car would be 0.012–0.018 here.
     */
    flushOffset: 0.002,
    /**
     * Informational only. The real constraint is the loft through cowlZ/cowlY
     * and headerZ/headerY; as built that chord is 68.8 deg from vertical,
     * flattening from 66 at the base to 74 at the header. Do not drive
     * geometry from this number.
     */
    windscreenRakeDeg: 68.8,
    windscreenThickness: 0.0058,
    sideThickness: 0.0042,

    /** Daylight-opening corners at the beltline, +X side. */
    dloFrontZ: -0.585,
    /**
     * The body's `tDloRear` and the glazing both build the DLO's trailing edge
     * to -3.420 at the beltline. This said -2.978 — a 442 mm disagreement in
     * which the hardpoint, not the geometry, was the odd one out.
     */
    dloRearZ: -3.42,
    dloBottomY: 0.998,

    /** Quarter light in the front door, ahead of the mirror. */
    quarterFrontZ: -0.445,
    /** The wagon's long rear quarter glass behind the rear door. */
    quarterRearFrontZ: -2.585,
    quarterRearRearZ: -3.42,

    /** Tailgate glass. */
    /**
     * 1.372 was unreachable: the tailgate hinge is at 1.340 and the body's
     * roof profile at that station is 1.338, so no point on the tailgate can
     * be higher. With the header band and a 4 mm lap the glass tops out here.
     */
    tailgateGlassTopY: 1.285,
    /**
     * Raised from 0.962, which sat 23 mm BELOW `beltY` — a backlight sill
     * under the beltline, where the reference has the tailgate's shoulder
     * continuing it. It also left only 42 mm of painted badge band above the
     * lamps where the photograph shows ~92, and stranded `HP.rear.badgeY`
     * above a height with no tailgate skin on it. 1.010 reconciles all three.
     */
    /**
     * OPEN, and contested — do not move it on one measurement.
     *
     * The gap this leaves to `lampTopY` is 90 mm. Two dead-on rear frames put
     * it at 126 mm and 139 mm, measured independently and disagreeing with
     * each other by 10 %, so it is somewhere between 35 and 50 mm short. The
     * black band and the painted badge strip both scale with it; the split
     * between them is ~0.30 / 0.70 and is now held as a FRACTION of this gap
     * in `spoiler.ts` and `badges.ts`, so both correct themselves when this
     * number does.
     *
     * Two readings of the same photographs have already been wrong here.
     * A review reported the band 2.9x short when it is slightly over its
     * share; I then read the spoiler-plus-glass-below-it as the band and
     * concluded there was no band at all. The band is real, narrow, and only
     * resolves at high magnification on `bat_rear_straight.jpg`.
     *
     * The backlight height is in dispute too, by much more: ours is 275 mm
     * and the same frame projects 471 mm, which no camera elevation explains.
     * The rear elevation wants re-deriving as a whole, from several
     * independent scale features, before any of these move.
     */
    tailgateGlassBottomY: 1.01,
    tailgateGlassZ: TAIL + 0.086,
    /**
     * Settled: this figure is right and the TAIL was too wide. Measured in
     * ratios between features in the same plane of the rear photograph, so no
     * calibration is involved — backlight aperture 962 px against a
     * taillamp band of 1141 px whose ends coincide with the body silhouette,
     * a ratio of 0.843, giving 0.710-0.717. The tail has been narrowed; the
     * 0.745 the glazing built to is not reachable on the corrected body.
     */
    tailgateGlassHalfW: 0.712,
  },

  // -------------------------------------------------------------------------
  // Rear — WAGON / AVANT
  // -------------------------------------------------------------------------
  rear: {
    /** Tailgate shutline: it wraps up into the roof. */
    tailgateHingeZ: TAIL + 0.708,
    tailgateHingeY: 1.34,
    tailgateBottomY: 0.652,

    /**
     * Taillamp cluster, +X side.
     *
     * Measured off a dead-on rear frame of the 1988 Avant: ~675 x 205 mm, an
     * aspect of 3.3:1. These were 590 x 294 (2.0:1), which read far too tall
     * and too narrow, and put the inboard edge 53 mm outboard of where the
     * photograph has it. The lamp's bottom stays just above the bumper, which
     * is what physically locates it.
     */
    /**
     * Re-measured off the dead-on 1988 rear. The lamp appears in the scan as
     * TWO runs per side with a hairline between them — that is the tailgate
     * shutline splitting the cluster, not two lamps. Read as one unit:
     * ~685 mm wide with a ~330 mm gap between the pair.
     *
     * A parallel measurement giving a 930 mm gap and a 390 x 275 lamp came
     * from the 1985 car, which is pre-facelift and has a different rear
     * layout — its reverse window sits hard against the plate panel. Do not
     * mix the two cars' rear measurements.
     */
    lampInnerX: 0.165,
    /**
     * A single number for a band spanning y 0.688..0.920, but the real lamp's
     * outer end follows the body edge, which tapers ~12 mm over that height.
     * Consumers should clip the lamp to the body's own half-width at each y
     * rather than treating this as a constant.
     */
    lampOuterX: 0.85,
    lampTopY: 0.92,
    lampBottomY: 0.688,
    lampZ: TAIL + 0.03,
    /** Internal division: reverse | tail/brake | indicator | fog. */
    lampSegments: 4,

    bumperTopY: 0.636,
    bumperBottomY: 0.392,
    bumperZ: TAIL,
    rubStripY: 0.613,

    /** In the TAILGATE, set into the ribbed panel between the lamps. */
    /** Centred in the tailgate aperture, which is what actually locates it. */
    plateCenter: [0, 0.796, TAIL + 0.028] as [number, number, number],

    /** Badges on the tailgate. */
    /**
     * Everything here must stay inboard of `lampInnerX` — outboard of
     * that is taillamp aperture, not sheet metal. Rings sit just right of
     * centre with the model text to their left.
     */
    /**
     * Scripts sit on the painted band ABOVE the lamps, hard outboard. The
     * span between the lamps is the ribbed panel and carries the plate, so
     * nothing can be badged there.
     *
     * The four rings ARE fitted, at the tailgate's centre. This comment used
     * to say they were a Euro 100/200 feature and not a US 5000; that came
     * from misreading the one source cited for it. `REFERENCE-VEHICLE.md`
     * §6.5, quoting `GCFS-85`, says: "For a 5000 S Wagon, expect 5000 S left
     * of centre and the rings right of centre... GCFS-85 shows exactly that
     * layout on a US 5000 S Wagon." Every rear reference in `scratchpad/ref3`
     * carries them within 9 mm of the centreline.
     */
    /** Dropped to clear the black band under the backlight. */
    badgeY: 0.95,
    badgeAudiCenter: [-0.42, 0.972, TAIL + 0.036] as [number, number, number],
    badgeModelCenter: [0.42, 0.972, TAIL + 0.036] as [number, number, number],
    badgeRingsCenter: [0, 0.9515, TAIL + 0.038] as [number, number, number],

    /** Exhaust tip, left of centre. */
    exhaustTip: [-0.412, 0.268, TAIL + 0.055] as [number, number, number],
    exhaustDiameter: 0.052,

    /**
     * Rear wash/wipe on the tailgate.
     *
     * Was [-0.315, 0.985]. y 0.985 is BELOW the glass and 130 mm under where
     * the photograph parks the arm; x is 68 mm out — the motor cover centres
     * 157 px from the body centreline on `bat_rear_straight_b.jpg`, and in a
     * rear view image-right is -X. `fitRearWiper` has always overridden this,
     * so nothing moved when it was wrong, which is why it stayed wrong.
     */
    wiperPivot: [-0.247, 1.118, TAIL + 0.076] as [number, number, number],
    wiperLength: 0.375,
  },

  // -------------------------------------------------------------------------
  // Roof — the Avant's rails
  // -------------------------------------------------------------------------
  roof: {
    /**
     * The roof-to-bodyside joint measures x ~0.700 over the rail's span. The
     * 0.774 "roof half-width" quoted in review is the roof panel's bounding
     * box, which includes the skin after it has turned down into the side.
     */
    railInnerX: 0.655,
    railTopY: 1.474,
    /**
     * The rail crown used to sit 7 mm BELOW the roof's own centre crown, so in
     * a true side elevation the rails did not break the roofline at all.
     * Note `railTopY` 1.474 over a 1373 skin implies a 79 mm stand-off against
     * the 50-55 mm twice derived from references — the three figures cannot
     * all be met, so `railTopY` is now treated as a ceiling rather than a
     * target.
     */
    railBaseY: 1.433,
    railFrontZ: -1.402,
    railRearZ: TAIL + 0.741,
    railWidth: 0.038,
    /** Rails stand on feet, not continuous contact. */
    railFeet: 3,
    /** Where the roof skin turns down into the D-pillar. */
    dPillarZ: TAIL + 0.848,
  },

  // -------------------------------------------------------------------------
  // Wipers and cowl
  // -------------------------------------------------------------------------
  wiper: {
    /** Single pantograph wiper is period-correct on many C3s; twin also used. */
    pivotDriver: [-0.472, 1.032, -0.362] as [number, number, number],
    pivotPassenger: [0.398, 1.032, -0.362] as [number, number, number],
    bladeLength: 0.512,
    parkAngleDeg: -8,
    sweepDeg: 92,
  },

  // -------------------------------------------------------------------------
  // Interior anchors
  // -------------------------------------------------------------------------
  interior: {
    /** Driver's hip point — everything in the cabin is laid out from here. */
    hipPointDriver: [-0.372, 0.612, -1.145] as [number, number, number],
    /**
     * OPEN: 0.938 is a local MINIMUM for how much of the instrument pack the
     * driver can see. With `steeringDiameter` 0.385 the rim's annulus projects
     * onto the print across the upper third of both main dials — most of the
     * speedometer scale — and its side arcs cross the temperature and fuel
     * gauges. Sweeping hub height alone, fraction of the print with line of
     * sight from (−0.372, 1.27, −1.22):
     *
     *     0.898 → 0.728   0.918 → 0.667   0.938 → 0.617   0.958 → 0.691
     *     0.968 → 0.778   0.978 → 0.802   0.988 → 0.827
     *
     * So ±40 mm recovers 11–21 points. But 0.988 puts the wheel's top rim at
     * 1.164, above the binnacle brow crest at 1.128, which is wrong for this
     * car. It is the wheel/cluster/eye triangle rather than the wheel alone,
     * and settling it needs a measurement off a real C3 interior, not more
     * arithmetic against our own geometry.
     */
    steeringCenter: [-0.372, 0.938, -0.735] as [number, number, number],
    steeringDiameter: 0.385,
    steeringTiltDeg: 24,
    /**
     * OPEN: this may be ~15 mm high, and the steering centre below may be at a
     * local worst against it. Both are measurements taken from inside the
     * model, so neither is evidence about the real car — recorded here rather
     * than acted on.
     *
     * At y 1.032 the pack's own rim top-front corner lands at (−0.5675,
     * 1.0985), which is 10 mm under the windscreen chord at that station
     * (1.1088). Any binnacle hood has to meet the top of that rim, so the brow
     * cannot also hold the 13 mm standoff the rest of the dash top keeps; it
     * is held to 4 mm over the ~25 mm where it passes the pack, minimum
     * measured clearance 7 mm. Invisible in `front3q` (dark moulding under
     * dark glass) and the straight chord understates a bowed screen, but it is
     * a compromise this number forced. 1.018 would let the brow keep 13 mm
     * everywhere.
     */
    clusterCenter: [-0.372, 1.032, -0.575] as [number, number, number],
    dashTopY: 1.055,
    dashFrontZ: -0.395,
    dashRearZ: -0.712,
    centreStackCenter: [0, 0.935, -0.688] as [number, number, number],
    shifterBase: [-0.045, 0.638, -1.005] as [number, number, number],
    seatBackRakeDeg: 14,
    rearSeatZ: -2.185,
    /** Load floor of the estate, behind the rear seat. */
    cargoFloorY: 0.632,
    cargoFloorFrontZ: -2.415,
    cargoFloorRearZ: TAIL + 0.166,
  },
} as const;

/** Mirror a +X hardpoint across the centreline. */
export function mirrorX(p: readonly [number, number, number]): [number, number, number] {
  return [-p[0], p[1], p[2]];
}

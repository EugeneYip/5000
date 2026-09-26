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
 *  Frame: +X right, +Y up, +Z forward. Origin on the ground at the front axle.
 *  All values metres. Symmetric parts give the RIGHT-hand (+X) value only;
 *  mirror for the left.
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

    /** Headlamp aperture, right-hand side. Inner edge meets the grille. */
    lampInnerX: 0.37,
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
    rubStripY: 0.556,
    rubStripHeight: 0.054,
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

    /** Daylight-opening corners at the beltline, right-hand side. */
    dloFrontZ: -0.585,
    dloRearZ: TAIL + 0.838,
    dloBottomY: 0.998,

    /** Quarter light in the front door, ahead of the mirror. */
    quarterFrontZ: -0.445,
    /** The wagon's long rear quarter glass behind the rear door. */
    quarterRearFrontZ: -2.585,
    quarterRearRearZ: TAIL + 0.838,

    /** Tailgate glass. */
    tailgateGlassTopY: 1.372,
    tailgateGlassBottomY: 0.962,
    tailgateGlassZ: TAIL + 0.086,
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
     * Taillamp cluster, right-hand side.
     *
     * Measured off a dead-on rear frame of the 1988 Avant: ~675 x 205 mm, an
     * aspect of 3.3:1. These were 590 x 294 (2.0:1), which read far too tall
     * and too narrow, and put the inboard edge 53 mm outboard of where the
     * photograph has it. The lamp's bottom stays just above the bumper, which
     * is what physically locates it.
     */
    lampInnerX: 0.185,
    lampOuterX: 0.86,
    lampTopY: 0.893,
    lampBottomY: 0.688,
    lampZ: TAIL + 0.03,
    /** Internal division: reverse | tail/brake | indicator | fog. */
    lampSegments: 4,

    bumperTopY: 0.636,
    bumperBottomY: 0.392,
    bumperZ: TAIL,
    rubStripY: 0.613,

    /** Plate recess, in the bumper below the tailgate. */
    plateCenter: [0, 0.518, TAIL + 0.002] as [number, number, number],

    /** Badges on the tailgate. */
    /**
     * Everything here must stay inboard of `lampInnerX` (0.238) — outboard of
     * that is taillamp aperture, not sheet metal. Rings sit just right of
     * centre with the model text to their left.
     */
    badgeRingsCenter: [0.062, 0.855, TAIL + 0.04] as [number, number, number],
    badgeAudiCenter: [-0.138, 0.742, TAIL + 0.036] as [number, number, number],
    badgeModelCenter: [0.118, 0.742, TAIL + 0.036] as [number, number, number],

    /** Exhaust tip, left of centre. */
    exhaustTip: [-0.412, 0.268, TAIL + 0.055] as [number, number, number],
    exhaustDiameter: 0.052,

    /** Rear wash/wipe on the tailgate. */
    wiperPivot: [-0.315, 0.985, TAIL + 0.076] as [number, number, number],
    wiperLength: 0.375,
  },

  // -------------------------------------------------------------------------
  // Roof — the Avant's rails
  // -------------------------------------------------------------------------
  roof: {
    railInnerX: 0.615,
    railTopY: 1.474,
    railBaseY: 1.408,
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
    steeringCenter: [-0.372, 0.938, -0.735] as [number, number, number],
    steeringDiameter: 0.385,
    steeringTiltDeg: 24,
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

/** Mirror a right-hand hardpoint to the left. */
export function mirrorX(p: readonly [number, number, number]): [number, number, number] {
  return [-p[0], p[1], p[2]];
}

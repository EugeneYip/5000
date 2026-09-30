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
    /**
      * Grille aperture. Spans ±grilleHalfW, so 0.792 m overall.
      *
      * Was 0.37, ~26 mm too narrow per side. The **total** lamp band was
      * already right — 4.89 plate-widths against the photograph's 4.85 — so
      * nothing was mis-scaled; the grille/headlamp *split* was wrong and the
      * lamps ate the difference.
      *
      * Two routes to it, both depth-free because the two cameras are within
      * 0.5 % of each other at ~4.3 m (derived from the plate/grille
      * magnification ratio):
      *
      *     grille half / band half    photo 0.5051  render 0.4675  -> 399.7 mm
      *     grille half / plate width  photo 1.2218  render 1.1496  -> 393.2 mm
      *
      * 0.396 is the bracket's middle. `grilleSlatCrests` then lands at ±0.392.
      *
      * ⚠ **The render side is `pick`'s geometric edge, not a threshold.** A
      * fixed-luminance threshold on identical geometry read 0.4513, 0.4646 and
      * 0.4675 across three boots, because the crossing moves when the grille's
      * own level moves. CRITIQUE-4's 0.448 is one of those readings and
      * corresponds to an edge 15 mm inboard of the truth — which is why that
      * document asked for ±0.415 and the measurement says ±0.392.
      *
      * Reported, not built: **the real aperture is a trapezoid.** Traced row
      * by row the photograph's right edge runs 1192.0 px at the top to 1176.0
      * at the bottom — monotone, no resolvable corner rounding — a 12° lean,
      * ±17 mm of taper per side. Ours leans 0.3 px. It was not built because
      * the lamp's inner edge is the same line and `body.ts`'s `noseLower` /
      * `lampSideR` butt onto it, so a taper living only in the grille would
      * open a seam at the nose pressing. It wants a hardpoint field of its own.
      */
    grilleHalfW: 0.396,
    grilleTopY: 0.812,
    grilleBottomY: 0.660,
    grilleZ: 0.942,
    /** How far the slats sit behind the surrounding surface. */
    grilleRecess: 0.035,
    /** Seven bright slats, eight apertures — counted off 2048 px photography. */
    grilleSlats: 7,

    /** The four rings, centred in the grille. */
    ringsCenter: [0, 0.7415, 0.952] as [number, number, number],
    /**
      * Outer diameter of one ring, and the centre-to-centre spacing.
      *
      * A uniform 0.93× on the group: the ring group measured 264 mm against
      * 240-246. Ring-group over plate width is 0.7564 in the photograph
      * against 0.8195 rendered, both geometric (`fourRingsFront` ±0.132
      * projecting to 101.8 px). CRITIQUE-4 said 13 % from a thresholded 0.842;
      * the geometric figure is 0.80-0.82, so it is **7-9 %**.
      */
    ringDiameter: 0.0743,
    ringSpacing: 0.0571,
    ringTubeRadius: 0.0055,

    /** Headlamp aperture, +X side. Inner edge meets the grille — so this
      * moves with `grilleHalfW` and always equals it. */
    lampInnerX: 0.396,
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
    /**
      * The outboard portion of the lamp is the amber indicator.
      *
      * **Not optional, and not independent of `lampInnerX`.** Moving the lamp's
      * inner edge out 26 mm takes the clear lens's projected width down 10 px
      * and the clear:amber ratio from 3.62 to 3.41 against the photograph's
      * 3.65. Leaving the amber alone is what *breaks* a ratio that is currently
      * correct; moving the split 5 mm is what protects it.
      */
    indicatorInnerX: 0.693,

    /**
     * ## The front furniture is high. The body is not.
     *
     * This settles a question that blocked the bright strip line for four
     * rounds, so it is written here where `bumperTopY`, `rubStripY`,
     * `markerY`, `plateCenter` and `lampBottomY` can all see it.
     *
     * Ground-referenced against the contact line, the front end reads high
     * and the rear reads right — which looked like the whole front *block*
     * sitting high above the road. It is not. The arch lip does not share the
     * error:
     *
     *     front arch lip crown   photo 671   model 652    −19   LOW
     *     front bead top               567         632    +65
     *     amber lens bottom            604         652    +48
     *     rear arch lip crown          640         652    +12
     *
     * I re-measured the arch lip myself before accepting this, because it
     * reverses the conclusion: at the hub column the body runs to **672 mm**
     * and then goes dark. (My first attempt found 466 — that was the hubcap.
     * A detector that walks up from the tyre finds the wheel, not the arch.)
     *
     * The datum-free form is the one to act on, and two cars agree on its
     * first row to 0.4 mm:
     *
     *     arch lip − bead top      104.4 / 104.0   vs model 20   bead 84 high
     *     arch lip − lens bottom    68.1 /  65.9   vs model  0   lens 67 high
     *     lens bottom − bead top    36.3 /  38.1   vs model 20   bead 17 high
     *                                                            OF THE LENS
     *
     * **So the fix is local: the lamps, the bead, the marker and the plate
     * come down on a body that is essentially right.** Not the ride height,
     * not the loft.
     *
     * Three cautions, all measured, before anyone acts on the absolutes:
     *
     * 1. **The model's hub sits at the free tyre radius.** `tyreRadius()` is
     *    307.3 and the wheel centre is placed at `y = R`, while the
     *    photographed cars' front hubs are at 279.1 and 266.9 above their
     *    contact lines. Every ground-referenced comparison therefore carries
     *    a **+28 to +40 mm bias against the model** before any body error.
     *    Hub-referenced, the front arch lip is 397/399 on the two cars and
     *    **345** on the model.
     * 2. **`HP.side.archFlatten` 0.88 is why the arch lip reads low**, and it
     *    makes the lip a poor discriminator in this model. The model clears
     *    its tyre by 37 mm at the crown; both photographed cars clear theirs
     *    by 83.5 and 86. `archRadius = R + 0.082` is therefore *exactly*
     *    right — 82 mm — and `archFlatten` takes 47 mm of it straight off
     *    the crown.
     * 3. **The bonnet shut line errs the other way.** The red car's top
     *    silhouette reads 880/835/814 mm at z +150/+330/+500 against the
     *    model's ~938/922/906: +58 to +92 ground-referenced, +18 to +52 once
     *    the tyre bias is removed. The two body datums disagree by ~60 mm,
     *    and the arch lip is the one whose height is set by an arch-shape
     *    constant rather than by the body loft — which is why the *sign* of
     *    the arch reading is leaned on here and not its size. Separately: the
     *    real bonnet drops **189 mm/m** toward the nose over z +0.15…+0.50
     *    where ours drops **91**. Half the nose droop.
     */
    bumperTopY: 0.648,
    /**
     * Bottom of the **black moulding**, not of the bumper — the same
     * correction `6714c4e` made at the tail, which the nose never got.
     *
     * At 0.402 the moulding ran 0.648 → 0.402 and, with the crown standing
     * 11 mm over `bumperTopY`, put **260 mm of black** down the whole front
     * elevation. The photographs have about half that with a body-coloured
     * apron under it, and the render showed it: one undifferentiated dark
     * slab where the reference has bead / black / apron.
     *
     * Measured on both BaT flanks, contact-line referenced, segmented on `V`
     * and chroma — never luminance here. Per column, 14 on the silver and 16
     * on the red:
     *
     *     bead top          571.0 (silver)   561.6 (red)
     *     black bottom      459.9            452.4
     *     ----------------------------------------------
     *     bead → black      111.6            108.5     = 110 mm, to 1 mm
     *
     * The two cars sit 8-9 mm apart on their tyres and *every* figure differs
     * by that same 8-9 mm, which is what makes the difference the measurement
     * and not the absolute. Anchored on the bead's **top** because it is the
     * sharpest edge in the stack and the model's is deterministic:
     * `crownProfile`'s `beadAt: 5` hands over at `topY − 0.016` = 0.632. So
     * `blackBottom = 0.632 − 0.110 = 0.522`, and `outerProfile` ends at
     * `bottomY − 0.003`.
     *
     * Anchoring on the *paint edge* gives 0.542 and on the bead's *bottom*
     * 0.519. The 24 mm between the three anchors is `beadWidth` being 15 mm
     * where both flanks measure the bead at **7.6 mm** (red, n=16, sd 1.5)
     * and 10.5 (silver, whose highlight clips at V 255 and blooms). Reported
     * against `rubStripHeight` below, not changed — 15 has its own derivation
     * from two other frames.
     */
    bumperBottomY: 0.525,
    /**
     * Where the apron stops being a face and turns under. The silver car's
     * reads as a face from 460 down to ~385, dims through 385-355 as it rolls
     * under, and is in shadow to ~315 where the car ends — no edge anywhere
     * in it, one convex panel. This is the knee, not the bottom of the
     * bodywork. (The red car's is deeper, 446 → 258-274, but that car is a CS
     * Turbo quattro with the deep spoiler, so the silver Avant is taken.)
     */
    apronBottomY: 0.385,
    bumperZ: NOSE,
    /** Bright strip along the bumper's UPPER EDGE, not across its face. */
    rubStripY: 0.625,
    /**
     * **Developed width of the bright bead ALONG the moulding's surface**, not
     * a height. 0.046 described a 46 mm band no photograph supports, and it
     * was what let `rubStrip()` author its own polyline 10.5 mm behind and
     * 1.8 mm above the crown and re-skin the moulding's whole 43 mm shelf in
     * bright metal — 22 px projected against the photograph's 6-8, with half
     * of it facing straight up at the sky. Measured on the reference the bead
     * is 11-14 mm on the owner's photograph and 17.5 on `bat3_front3q.jpg`.
     */
    rubStripHeight: 0.015,
    /** Amber marker at the bumper's outboard end. */
    markerX: 0.822,
    /**
     * 0.512 sat near the middle of the **old** 246 mm black band. With the
     * band at 0.525-0.648 it is 13 mm *under* the moulding, so a 30 mm lens
     * there straddles the moulding's bottom edge with two thirds of it on the
     * body-coloured apron. `bat3_front3q.jpg` puts it squarely inside the
     * black at both corners. 0.5865 is the new band's own mid-height.
     *
     * ⚠ One of the three front figures — with `plateCenter[1]` and
     * `lampBottomY` — that share a chain with **no ground datum in it**, so
     * it moves again if the front furniture comes down. See `bumperTopY`.
     */
    markerY: 0.5865,

    /**
     * Lower valance and air dam below the bumper.
     *
     * ⚠ **~95 mm too deep and now conspicuous.** The silver car's lowest
     * point at the nose measures **305-322 mm** over the mid columns. This was
     * invisible while the moulding was 246 mm of black — a black air dam under
     * a black band reads as one part — but with a light apron above it a dark
     * mass hanging to 212 is the most conspicuous thing left in the side view.
     * The apron did not create this; it exposed it. (`floorpan`, wearing
     * `bumperPlastic`, is in the silhouette down to 181 mm — underbody.)
     */
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
    /**
     * The REAR arch lip, split out because one constant could not serve both.
     *
     * A dead-astern frame constrains every visible station, not only the tail
     * face: a station Δ metres forward images Δ/(D+Δ) smaller. Solving the
     * camera distance out through the tyre constraint makes the bound at the
     * rear axle independent of the lamp band's assumed width u, so it does
     * not depend on the scale settled in the note on `rear.lampInnerX`:
     *
     *     x_arch <= 1.0745 − 0.1562 u    ->  0.840 at u = 1.50, 0.871 at 1.30
     *
     * `archLipX` 0.891 is outside that at any u, and no section shape rescues
     * it: holding 0.891 at y 0.600 and reaching 0.840 a hundred millimetres
     * above needs a crease this car does not have. 0.862 is the least change
     * the bound allows, taken deliberately so that being wrong costs less.
     *
     * Consequence worth stating: the 1814 mm maximum width is then **not**
     * over the rear arch. It has to lie at z >= −1.9, forward of the rear
     * axle, which is also the only place the reference frame allows it.
     */
    archLipXRear: HW - 0.045,
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
     *
     * ## Why this has not moved, after four rounds of proposals
     *
     * It has been asked to go to 0.554, to 0.560 and to 0.540. Each was
     * derived by holding the band **flat** and solving for the height that
     * best closes the step at the rear joint. All three are wrong, because
     * the premise is: **the real car's strip line is not level.**
     *
     * Both BaT flanks agree it rises. Measured twice, independently, with
     * different edge definitions — the bright cap's top edge, and the top of
     * the dark moulding band under it:
     *
     *     cap top, yaw-corrected      silver +42.5   red +32.6  mm / wheelbase
     *     moulding top, uncorrected   silver +43.8   red +38.8
     *
     * (The uncorrected pair runs high by exactly the yaw correction, which is
     * what makes them the same measurement.) It is not the ground fit tilting:
     * the **rocker cover's** top edge, scanned the same way in the same
     * frames, rises +20.0 / +11.9 with four times the scatter — consistent
     * with level. A tilted datum would tilt both lines together. One rises
     * 40 mm and the other does not.
     *
     * The earlier "the red car is level to 4 mm" reading, which is what made
     * a flat band look defensible, was an artefact: it segmented on luminance
     * at 60, and that car's red paint is RGB (160,1,0), **luma 34**. Every
     * door column was classified as black plastic and silently dropped; only
     * the rear quarter survived, and a slope fitted to one end of a car is
     * not a slope. Segment on chroma or `V = max(R,G,B)` here — see the trap
     * in `docs/WORKSTREAM.md`.
     *
     * ## So rake it — and here is why that is still blocked
     *
     * The measured line is **+8.75 mm per metre aft**, cap top 0.566 at
     * z +0.495 running to 0.602 at z −3.70. Applying it needs an anchor, and
     * neither end will take one:
     *
     *     anchored at the rear  (cap top 0.609)  ->  0.5723 at the front joint,
     *                                                a 60 mm step against the
     *                                                front bead's 0.6325
     *     anchored at the front (cap top 0.6325) ->  0.669 at the rear joint,
     *                                                a 60 mm step against the
     *                                                rear bead's 0.609
     *     anchored in the middle                 ->  ~30 mm at BOTH ends,
     *                                                worse than today's 4 and
     *                                                27.5
     *
     * The 60 mm is not the flank's. It is `HP.front`, whose **furniture** sits
     * high: the amber corner lens measures 611.9 against `lampBottomY` 0.652
     * and the front bead ~570 against a cap top of 632.5, while the rear is
     * right to 6 mm. It is *not* the body — the front arch lip is 19 mm LOW,
     * so the lamps and bead are misplaced on a body that is essentially
     * right. See the long note at `HP.front.bumperTopY`.
     *
     * **That makes the fix local, and it unblocks this number.** Once the
     * front bead comes down the 84 mm the datum-free reading asks for
     * (`arch lip − bead top` 104 measured against 20 built), the flank's
     * measured rake can anchor at the front joint and arrive at the rear's
     * already-thrice-confirmed 0.603. Until the furniture moves, leave this
     * flat at 0.5875: today's joints are 4 mm at the front and 27.5 at the
     * rear, and every proposed flat value trades that for two bad ones.
     *
     * Also measured, not acted on: `rubStripHeight` 0.098 against 84.5-86
     * (silver) and 87-92 (red) cap-top to band-bottom — a second photograph
     * pair against the blueprint's 99 and `GCFS-85`'s 97.
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
    /**
     * 1.285 -> 1.375, measured rather than inherited. Roll-rectified on
     * `bat_rear_straight_b.jpg`, the roof's trailing edge is at row 256 +- 1
     * and the top of the clear glass at 274 +- 2 — **18 px, 24 mm of
     * projected height**, steady across x 800-1185. Our `rear` frame puts the
     * same two features 36 px apart on a 62.2 px band, i.e. 106 mm.
     * Parallax-corrected against a camera height of 0.798 (from the horizon
     * falling 49 % down the lamp band) this is 1.375 +- 0.010.
     */
    tailgateGlassTopY: 1.375,
    /**
     * Raised from 0.962, which sat 23 mm BELOW `beltY` — a backlight sill
     * under the beltline, where the reference has the tailgate's shoulder
     * continuing it. It also left only 42 mm of painted badge band above the
     * lamps where the photograph shows ~92, and stranded `HP.rear.badgeY`
     * above a height with no tailgate skin on it. 1.010 reconciles all three.
     */
    /**
     * SETTLED — and it was never the problem. Measured 994 mm against 1010 as
     * built, inside one sigma. Four readings of the gap to `lampTopY` came
     * back at 90, 126, 139 and an implied 296 mm; it is **106 mm**, and it was
     * short because `lampTopY` was 32 mm too high, not because this sill was
     * low. The two errors nearly cancel here, which is why every attempt to
     * fix the gap by moving the glass went wrong.
     *
     * Where the failed readings came from, so nobody repeats them: 471 mm is
     * the roof trailing edge to the top of the paint — the whole dark aperture,
     * roof step and spoiler and glass and band together, not the backlight.
     * 126 and 139 are the 1814-at-the-lamp-band scale error. "93 mm band over
     * 83 mm strip" measured the painted strip as the band; it is 34 mm of band
     * over 72 mm of strip, and the 0.30/0.70 split now held as a fraction in
     * `spoiler.ts` and `badges.ts` measures 0.318/0.682 in both frames.
     *
     * And there is no foreshortening to argue about within the tail plane: a
     * plane at constant depth maps AFFINELY to image rows, so no camera
     * elevation can compress one part of it relative to another. Only stations
     * forward of TAIL need correcting, and only the roof materially so.
     *
     * The band's hue is the glass's at a uniform 62 % in all three channels —
     * the signature of a ceramic frit ON the glass, not a separate moulding.
     * Our convention treats this number as the bottom of visible glass with the
     * band painted below it. If anyone re-reads the band as frit, the aperture
     * runs to 960 and the band moves onto the glass: change both files or
     * neither.
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
    /**
     * 0.712 -> 0.636. The 0.843 ratio the old figure was derived from is
     * sound; what was wrong is that it was multiplied by `lampOuterX` 0.85,
     * which is now 0.75. Confirmed by direct measurement rather than left to
     * inheritance: scanning outward for the first painted column, the
     * aperture is 956 px at the sill and 966 at its widest = 1267-1281 mm,
     * half-width **0.634-0.640**, and against the lamp band's 1143 px that is
     * a ratio of 0.845 — so ratio and absolute now agree.
     *
     * **This cannot move without the body's last section moving with it.**
     * The built silhouette at the lamp band is 0.828-0.844 against 0.770
     * measured, so narrowing the glass alone turns a 56 mm painted reveal
     * into 190. See `halfWidthAt(Z_TAIL_END)` in `body/surface.ts`.
     */
    tailgateGlassHalfW: 0.636,
    /*
     * KNOCK-ON, NOT YET APPLIED. The derivation above is a ratio — backlight
     * aperture is 0.843 of the taillamp band — and it is sound, but the
     * absolute came from multiplying it by `lampOuterX` 0.85, which is now
     * 0.75. On the ratio this should be 0.843 x 0.75 = 0.632, and left at
     * 0.712 the backlight is 0.95 of the lamp band where the photograph says
     * 0.843, which is worse than either. It is 80 mm a side and changes the
     * tailgate's whole look, so it wants verifying against the photograph
     * directly rather than inheriting a chain.
     *
     * `tailgateGlassTopY` 1.285 is separately 76 mm short — the photograph
     * puts the top of the clear glass only 60 +- 15 mm below the roof's
     * trailing edge. The comment there says 1.372 was "unreachable" because
     * `tailgateHingeY` is 1.340, so it is the HINGE that is too low and the
     * constraint that needs re-deriving, not the glass that needs clipping.
     */
  },

  // -------------------------------------------------------------------------
  // Rear — WAGON / AVANT
  // -------------------------------------------------------------------------
  rear: {
    /** Tailgate shutline: it wraps up into the roof. */
    /**
     * Was TAIL + 0.708 / 1.340. That pair is an accurate reading of our own
     * roof profile and the wrong station to hang a tailgate from: it is
     * 140 mm aft of `roof.dPillarZ`, and it is what made `tailgateGlassTopY`
     * "unreachable" at anything above 1.285. A top edge clearing 1.375 by the
     * header band's ~15 mm of drop puts the hinge at ~1.39, and a hinge
     * cannot stand above the roof skin — ours is 1.390 at z −2.965. So the
     * hinge belongs at the D-pillar, where a wagon's tailgate cut actually
     * is.
     */
    tailgateHingeZ: TAIL + 0.848,
    tailgateHingeY: 1.39,
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
    /**
     * ## The scale was challenged and it stands — but not for the reasons
     * given, and `6df1ff9`'s camera distance is wrong.
     *
     * A later reading claimed the rear frame's own tyres refute k = 1.3256.
     * Settled by measuring the taillamp band's **absolute height on two FLANK
     * photographs of two different cars**, each scaled only on the published
     * 2687 mm wheelbase and neither using a rear frame: 186.8 and 184.0 mm,
     * agreeing to 1.5 %. Against 138.9 px for the same feature in
     * `bat_rear_straight_b.jpg` that is **k = 1.334 +- 0.03**. 1.3256 is 0.6 %
     * low, 1.21 is excluded at about 4 sigma, and every hardpoint below is at
     * most 6 mm out — inside the spread that produced it. **Nothing moved.**
     *
     * What does not survive is "6 +- 3 m". Take k = 1.3256 as given and ask
     * what rear track the frame's own tyre span implies:
     *
     *     D = 6 m   ->  1577 mm    impossible on an 1814 mm body
     *     D = 9 m   ->  1504 mm
     *     D = 12 m  ->  1468 mm    the brochure figure
     *
     * So the scale and the distance were mutually inconsistent with their own
     * frame. It is 9-13 m — a 135-160 mm lens. The distance was never
     * independent: the only absolute vertical in a dead-on rear view is the
     * car's own height, and a 3.8 % slip in the roof-to-contact span drags D
     * from 8.8 m to 6.0.
     *
     * Three smaller corrections in the challenge itself, all of which nearly
     * cancelled: the tyre span is 1179.3 px at its widest, not 1173 (that row
     * is 115 below it); the section is **205, not 185** — both BaT cars are
     * CS/CD Turbo quattro Avants on 205/60R15, not the 5000 S's 185/70 HR14;
     * and the lever is **0.84 m, not 1.129**, because a tyre's widest locus is
     * a circle about the axle and the point that projects widest is its
     * rearmost. And the depth ordering in that challenge was inverted: the
     * camera is behind the car, so the tail is NEARER than the axle and a
     * smaller mm/px there is the right sign.
     *
     * Two cautions about `6df1ff9`'s own chain: its "15-in rim flange" leg is
     * the photographed car's wheel and not this model's (6J x 14 on 185/70),
     * and it is +-3 % on where you put the edge, so "four features agreeing to
     * 0.4 %" flatters it. And the 1.504 rear track it reports as "the
     * published quattro figure" is not published anywhere in
     * `docs/REFERENCE-VEHICLE.md`; `BODY.trackRear` stays 1.468.
     *
     * Re-derived 2026-09-28 by photogrammetry from four independent scale
     * features agreeing to 0.4 % (wheelbase 2687, overall length 4895, 15-in
     * rim flange, and a camera resection whose by-product — rear track
     * 1.504 m — lands on the published quattro figure without being assumed).
     * Both dead-on frames measured separately and agreeing to <= 5 mm.
     *
     * The broken link in every earlier reading: **body width at the taillamp
     * band is NOT 1814 mm.** The tail tucks in to ~1600; the 1814 maximum is
     * lower and further forward, over the rear arch. Scaling the rear
     * elevation on "lamp band ends = body silhouette = 1814" inflates every
     * dimension by 13 %, which is exactly the 1.136x between this and the
     * lamp stream's independent 675 x 205 reading of the same rectangle.
     */
    lampInnerX: 0.152,
    /**
     * A single number for a band spanning y 0.688..0.920, but the real lamp's
     * outer end follows the body edge, which tapers ~12 mm over that height.
     * Consumers should clip the lamp to the body's own half-width at each y
     * rather than treating this as a constant.
     */
    lampOuterX: 0.75,
    lampTopY: 0.888,
    lampBottomY: 0.704,
    lampZ: TAIL + 0.03,
    /** Internal division: reverse | tail/brake | indicator | fog. */
    lampSegments: 4,

    /**
     * The black moulding is 111 mm, not 244. Below it the real car carries a
     * substantial body-coloured apron down to ~392; `bumpers.ts` builds
     * `bumperTopY`->`bumperBottomY` as the moulding, so the render had a black
     * band more than twice the photograph's with the apron missing. Measured
     * the largest single error in the rear elevation.
     */
    bumperTopY: 0.609,
    bumperBottomY: 0.496,
    /**
     * Where the rear apron turns under. `6714c4e` built `rearApron` to a local
     * `APRON_KNEE_Y` and reported that `HP.rear` had no hardpoint for it; this
     * is that value, promoted so one field name serves both ends of the car.
     * See `HP.front.apronBottomY`.
     */
    apronBottomY: 0.340,
    bumperZ: TAIL,
    /**
     * Third value, and this one is anchored rather than argued.
     *
     * 0.613 described the old full-height band. A stream then reported where
     * its bead *happened* to sit, 0.588, and I encoded that as where the bead
     * *belongs* — wrong. I then moved it to 0.628 to put it on the flank cap's
     * line, which was the right instinct resolved in the wrong direction:
     * with `rubStripHeight` 0.012 that puts the bead 13-25 mm **above the top
     * of the moulding it caps** (`bumperTopY` 0.609), which is impossible.
     *
     * 0.603 is measured per column against **that column's own** taillamp
     * gasket minima, which cancels the frame's ~0.5 deg roll: the cap's centre
     * sits 76 px below the lamp bottom on a 139 px band, 100.6 mm under
     * `lampBottomY`. Taking a single global lamp row instead read 35 mm low.
     *
     * The continuity is real — `bat_rear3q_left_a.jpg` shows one unbroken
     * line from the flank round the corner — but it has to be resolved at the
     * **flank**, not here. `HP.side.rubStripY` 0.5875 plus its 0.098 height
     * puts the flank cap at 0.6365, and this correction widens that step from
     * 17 mm to 28. The rear figure is now anchored feature-to-feature inside
     * one dead-on frame; the flank's is not, and wants ~0.554 at its present
     * height or a shorter band. Reported, not moved: 33 mm of flank strip is
     * a visible change and belongs with someone holding the flank reference.
     */
    rubStripY: 0.603,
    rubStripHeight: 0.012,

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
    /**
     * +-0.42 -> +-0.36. The same 13 % scale error as the lamp band: 0.42 was
     * read against "lamp band ends = body silhouette = 1814 mm", and the tail
     * tucks in to ~1600 there. 0.42 / 1.136 = 0.37. An earlier round called
     * +0.421 "right to 4 mm" against the photograph — that reading used the
     * uncorrected scale, so it agreed with itself and not with the car.
     */
    badgeAudiCenter: [-0.36, 0.92, TAIL + 0.036] as [number, number, number],
    badgeModelCenter: [0.36, 0.92, TAIL + 0.036] as [number, number, number],
    badgeRingsCenter: [0, 0.927, TAIL + 0.038] as [number, number, number],

    /**
     * Exhaust tip, on the car's LEFT — which is +X; see the frame note at the
     * top of this file. It sat at -0.412, the car's right, placed under the
     * old "+X right" sentence. Five references put the tailpipe on the left,
     * and `driveline.ts:97`'s own comment ("intake on the left of the block;
     * exhaust on the right") contradicted its own code under the corrected
     * frame — mirroring the run satisfies both. Visible on the car's left in
     * `scratchpad/ref3/bat_rear_straight_b.jpg`, checked directly.
     */
    exhaustTip: [0.412, 0.268, TAIL + 0.055] as [number, number, number],
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
    pivotDriver: [0.472, 1.032, -0.362] as [number, number, number],
    pivotPassenger: [-0.398, 1.032, -0.362] as [number, number, number],
    bladeLength: 0.512,
    parkAngleDeg: -8,
    sweepDeg: 92,
  },

  // -------------------------------------------------------------------------
  // Interior anchors
  // -------------------------------------------------------------------------
  interior: {
    /** Driver's hip point — everything in the cabin is laid out from here. */
    hipPointDriver: [0.372, 0.612, -1.145] as [number, number, number],
    /**
     * OPEN: 0.938 is a local MINIMUM for how much of the instrument pack the
     * driver can see. With `steeringDiameter` 0.385 the rim's annulus projects
     * onto the print across the upper third of both main dials — most of the
     * speedometer scale — and its side arcs cross the temperature and fuel
     * gauges. Sweeping hub height alone, fraction of the print with line of
     * sight from (+0.372, 1.27, −1.22):
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
    steeringCenter: [0.372, 0.938, -0.735] as [number, number, number],
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
    clusterCenter: [0.372, 1.032, -0.575] as [number, number, number],
    dashTopY: 1.055,
    dashFrontZ: -0.395,
    dashRearZ: -0.712,
    centreStackCenter: [0, 0.935, -0.688] as [number, number, number],
    /** Dead: `console.ts` builds the lever on the centreline and never reads this. */
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

/**
 * The flanks: rubbing strips, door handles, fuel flap, weatherstrip.
 *
 * Two of these are model-year tells and both are settled in
 * `docs/REFERENCE-VEHICLE.md`:
 *
 *  · **Recessed pull door handles.** The flush handle arrives with the
 *    January 1988 European facelift, which reaches the US only with MY1989 and
 *    the rename to Audi 100 (§6.8). A MY1988 5000 S is pre-facelift
 *    throughout, so the handle sits in a pressed pocket with the lever
 *    pivoting out of it.
 *  · **The rubbing strip carries a thin bright line along its top edge**
 *    (§6.10) — but *not* the red-and-gold pinstripe on the car that evidence
 *    came from, which is a dealer decor item and appears in no factory list.
 *
 * The strip is swept along the body's own surface rather than along a straight
 * line, because the flank has 19° of tumblehome at strip height and a strip
 * built on a plane would sink into the door at the middle and lift off it at
 * the ends. Its *section* is laid on that surface too — see `onSkin`.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { audiMaterials } from '@/materials/library';
import { QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import { Z_TAIL_END } from '@/car/body/surface';
import { sideNormal, sidePoint, sideX, skinFrame, roofOuterNormal, roofOuterPoint, type SkinFrame } from './bodyref';
import { badgeText } from './glyphs';
import {
  at, clamp, DEG, framesFrom, lathe, lerp, merge, mesh, mirrorX, offsetPolyline,
  roundedBox, smoothstep, sweep, type Frame, type Pt,
} from './util';

const S = HP.side;

// ---------------------------------------------------------------------------
// Frames along the flank
// ---------------------------------------------------------------------------

/** Frames from the tail forward, so the section's up vector comes out up. */
function flankFrames(zRear: number, zFront: number, y: number, n: number): Frame[] {
  const pts: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const z = lerp(zRear, zFront, i / n);
    pts.push(sidePoint(z, y));
    nor.push(sideNormal(z, y));
  }
  return framesFrom(pts, nor);
}

// ---------------------------------------------------------------------------
// Rubbing strip
// ---------------------------------------------------------------------------

/**
 * `docs/CRITIQUE-2.md` §7 measured the built moulding at **57 mm** against
 * **99 mm** on the calibrated blueprint (column scans at z −1.0 / −1.6 / −2.2
 * give y 538 → 637) and **≈97 mm** off `GCFS-85`'s door columns. The strip was
 * grown upward with its bottom edge held, which also brought its top to within
 * 11 mm of the bumper mouldings' own bead instead of 65 mm below it. On the
 * real car those two are one continuous line round the corner — see the note
 * on `capStrip` in `buildSides` for how far ours has got.
 *
 * Both figures are now in `hardpoints.ts` and read from there; this file used
 * to carry local copies of them and a note saying the hardpoints were wrong.
 *
 * ## The bright cap is 13 mm, and its bounding box says 32 mm
 *
 * A trap worth the paragraph, because a review round read the bbox and
 * concluded the cap was twice its height. `__AUDI.bbox('rubStripLine')` gives
 * y **0.606–0.638**, but 0.606 is not on the flank: `rubbingStrip` tapers the
 * section to 0.55 over the last 45 mm at each end so the moulding dies into
 * the arch instead of ending square, and that taper pulls the bead's *scaled*
 * bottom edge to 0.607 at the two tips. The cap is `STRIP_FACE[0..3]` offset
 * 1.4 mm, so between the arches it is exactly `STRIP_Y + HH − 0.0134` to
 * `STRIP_Y + HH`, i.e. y **0.6231–0.6365 = 13.4 mm** of a 98 mm band.
 *
 * Confirmed by column scan rather than by reading that back off the source:
 * `__AUDI.pick` over x 300–1440 at `side` gives the cap 4 px at y 0.625–0.635
 * above 25 px of moulding at 0.541–0.622, and 6–7 px at `rear3q`. The
 * sky-facing shelf that `5b4becd` found under the front bumper bead is not
 * here: `rubStrip` returns **no row above n·y 0.9 in any scanned column** at
 * either view. The cap's own topmost row does reach 0.91–0.94 in three of the
 * `rear3q` columns, one pixel each of six, which is a rolled-over bead
 * catching sky and is what the reference has too — `bat3_side_profile.jpg`
 * clips that row at L 237–254. The failure mode to watch for is a *shelf*:
 * half a part's pixels at 0.98, which is what the front bumper had.
 *
 * On `bat3_side_profile.jpg` (front/rear hub centres 1025 px apart for a
 * 2687 mm wheelbase, so 2.62 mm/px) the cap measures 4.6 px = **12 mm** of a
 * 36 px = 94 mm band, i.e. **13 %** against our 13.7 %. It is right.
 *
 * (That same trace puts the whole band at 89–94 mm where the blueprint and
 * `GCFS-85` give 97–99. One photograph against two calibrated sources is not
 * enough to move `rubStripHeight`, so it is recorded here and reported, not
 * acted on.)
 *
 * ⚠ The blueprint's **"18 mm at 601–619"** in §7 is not this part. Both
 * photographs put body paint immediately above the bright cap, with the
 * flank's own feature line creasing it ~20 mm higher: at the door shutline in
 * `bat3_side_profile.jpg` at 14× the shutline runs uninterrupted through the
 * band above the cap and is cut by the moulding's end cap only at the cap
 * itself. 601–619 is that paint, so a bead built to it would sit 18 mm below
 * the moulding's top edge with dark plastic above it, which no photograph of
 * the car shows.
 *
 * ## The line used to die 281 mm short of the rear bumper, and 40 mm above it
 *
 * The z gap is closed — see `STRIP_REAR_Z` below. The 42 mm step in y is
 * still there and is `bumpers.ts`'s hardpoint. Measured off `__AUDI.bbox`
 * before the change —
 *
 *   frontRubStrip  z  0.497 … 1.079   y 0.618–0.632
 *   rubStripLine   z −3.420 … 0.495   y 0.623–0.638
 *   rearRubStrip   z −3.814 … −3.701  y 0.582–0.594
 *
 * — the front bead wraps 582 mm and meets this cap within 2 mm of z, which is
 * why the nose reads as one part. The **rear** bead wraps only 113 mm, so
 * between z −3.420 and −3.701 the bright line simply stops; picked at `side`,
 * x 1430–1490 returns nothing but `quarterR`, so what looks in the frame like
 * the moulding carrying on is painted quarter panel in shadow.
 *
 * ## The step is 28 mm now, and this is the side that has to move
 *
 * `2e684c5` settled `HP.rear.rubStripY` at **0.603**, measured per column
 * against that column's own taillamp gasket minima so the frame's ~0.5° roll
 * cancels, with `bumperTopY` 0.609 re-confirmed by the same method. That is
 * the best-anchored figure on the car and it widened the step to 28 mm. This
 * cap spans `STRIP_Y + HH − 0.0134 … STRIP_Y + HH` = **0.6231–0.6365**; the
 * rear bead spans 0.597–0.609 and its top edge *is* `bumperTopY`. So on the
 * flank the cap's top edge is the moulding's top edge and on the bumper the
 * bead's top edge is the moulding's top edge, and the two want to be the same
 * number.
 *
 * **It is the position that is wrong, not the height.** Re-measured on
 * `bat3_side_profile.jpg` (hub centres 1025.1 px for 2687 mm, 2.6212 mm/px;
 * the moulding's structure per column is paint / notch / bright cap / black
 * band / lower cladding) the whole moulding is **89–94 mm** cap-top to
 * band-bottom, and **88–91 mm** on `bat_side_profile.jpg`, the red car, by the
 * same method. Ours is 98. Closing a 27.5 mm step by cutting the band instead
 * of moving it needs a **70.5 mm** band, below every source there is — the two
 * photographs, the calibrated blueprint's 99 and `GCFS-85`'s ~97.
 *
 * So the band moves down bodily: `HP.side.rubStripY` **0.5875 → 0.560**, which
 * puts this cap's top edge on 0.609 exactly and its centre on 0.6023 against
 * the rear bead's 0.603. Reported, not patched — this file reads the
 * hardpoint. (The 0.554 floated in `hardpoints.ts`'s own note pairs the cap's
 * *top* with the bead's *centre*; matching tops, centres or bottoms all give
 * 0.560–0.5614, because the two beads are 13.4 and 12 mm.)
 *
 * `bat_rear3q_left_a.jpg` at 3× shows why the top edges are the thing to
 * match: one unbroken bright line from the quarter round the corner onto the
 * bumper, and the black band under it getting **deeper** on the bumper, not
 * moving. `bumperTopY` 0.609 over `bumperBottomY` 0.496 is 113 mm against this
 * band's 98, so at `rubStripY` 0.560 the two share a top edge and the bumper
 * hangs 15 mm lower — which is the photograph.
 */
const STRIP_HEIGHT = S.rubStripHeight;
const STRIP_Y = S.rubStripY;

/**
 * Aft end of the flank moulding.
 *
 * `HP.side.rubStripRearZ` is TAIL + 0.398 (−3.418) and the rear bumper's own
 * bead starts at −3.701, so 283 mm of the car's most prominent bright line
 * simply did not exist — picked at `side`, what read as the moulding carrying
 * on is painted quarter panel in shadow. The front end does not have that
 * hole: `rubStripFrontZ` 0.495 lands within 2 mm of `frontRubStrip`'s 0.497,
 * which is what makes the nose read as one part. So the rear hardpoint is not
 * describing the same thing its own front counterpart describes, and the
 * value that matches it is where the rear bead begins.
 *
 * `Z_TAIL_END` is that station: `bumpers.ts` builds `rearRubStrip` from the
 * body's last lofted station aft, so deriving from it here means the two
 * cannot drift apart when either moves. `bat3_side_profile.jpg` has the
 * bright cap unbroken to within 63 mm of the rearmost point of the car, at
 * one height the whole way, which is what this now does.
 *
 * Still open and NOT worked around here: the two meet in z and step 28 mm in
 * y. `HP.rear.rubStripY` 0.603 is the anchored end of that step, so the
 * correction belongs at `HP.side.rubStripY` — see the note on `STRIP_Y`.
 */
const STRIP_REAR_Z = Z_TAIL_END;

const HH = STRIP_HEIGHT / 2;

/**
 * Outer face of the moulding: a soft crown, fullest a little above centre.
 *
 * ## The 14.2 mm crown is right, and it is not why the flank beats the bumper
 *
 * The strip is the widest thing on the car and that part is correct: the body
 * loft's own maximum is **0.8929** at z −0.92 (t = `T.wide`, y ≈ 0.591), so
 * with this crown the car measures **1814 mm over the mouldings** and 1786 mm
 * over paint — the published width, at a station forward of the rear axle,
 * which is the only place `422abf4` allows it. Trimming the crown to fix the
 * dead-astern silhouette would break a sourced dimension to chase one.
 *
 * What beats the rear bumper dead astern is the flank **aft** of the rear
 * axle, and it is the body's plan, not this section. `body/surface.ts`'s
 * `xWide` runs 0.862 at z −2.687 (`archLipXRear`), 0.861 at −2.760 — and then
 * back **out to 0.876 at −2.900** before falling to 0.848 at −3.100. That
 * knot was written when `archLipXRear` was still `archLipX` 0.891; `f99feff`
 * pulled the crown pin down and left it, so the rear arch crown is now a local
 * *minimum* with a 14 mm bulge 213 mm behind it. Scanned row by row at `rear`,
 * every silhouette hit from y 0.43 to 0.96 comes off z −2.91…−3.10, and at the
 * band's own rows it is this strip at **|x| 0.885, z −2.943**. Projected, that
 * bulge beats the bumper at both cameras — 0.0694 against 0.0669 at the
 * reference's 12 m, 0.0331 against 0.0309 at our 26 m `rear` pose. Reported to
 * the body stream; nothing here can reach it.
 */
const STRIP_FACE: Pt[] = [
  // The two extreme-height points are 1.5 mm UNDER the skin, not on it.
  // `onSkin` puts x = 0 exactly on the door, which makes the 16 mm back shelf
  // coplanar with the paint it is supposed to hide behind: one pixel of it
  // came back at `ny` 0.98 from `rear3q`, and coplanar faces shimmer under
  // motion whichever way the depth test falls. Buried, the shelf can never be
  // the frontmost hit at any grazing angle.
  [-0.0015, HH],
  [0.0058, HH - 0.0022],
  [0.0104, HH - 0.0064],
  [0.0132, HH - 0.0134],
  [0.0142, HH - 0.0250],
  [0.0132, -HH + 0.0150],
  [0.0102, -HH + 0.0068],
  [0.0054, -HH + 0.0022],
  [-0.0015, -HH],
];

function stripSection(scale: number): Pt[] {
  const face = STRIP_FACE.map(([x, y]) => [x * scale, y * scale] as Pt);
  return [...face, [-0.016, -HH * scale], [-0.016, HH * scale]];
}

const STRIP_FRAMES = 94;

/**
 * Lay a section on the door skin rather than on a plane tangent to it.
 *
 * `STRIP_FACE`'s x is **proud of the skin at that point's own height**, not an
 * offset from one tangent plane. The frames are built at `STRIP_Y`, so a
 * section used raw puts every point on the tangent plane there, and a 98 mm
 * band on a flank whose half-width changes with height then floats off it.
 * Walked station by station through the loft, the tangent construction left
 * the band's **top edge 0.1–7.1 mm** and its **bottom edge 0.3–9.1 mm** proud
 * of the skin — worst through the doors and over the rear arch, exactly where
 * the flank is fullest. A proud edge exposes the 16 mm back shelf behind it,
 * and `__AUDI.pick` at `rear3q` duly returned **two `rubStrip` pixels at
 * n·y 0.98** in the column at z −2.87, the shelf facing the sky: the
 * `5b4becd` / `6714c4e` failure in miniature. On the skin those rows are gone
 * — no `rubStrip` row above n·y 0.9 in any column scanned at `side` or
 * `rear3q`. Same lesson as `underbody/liners.ts` in `f99feff` and `panels.ts`'s
 * `wheelHouse` before it: query the surface at the feature's own height
 * instead of pinning it to one value.
 *
 * It costs 1.7 mm of silhouette and that is a gain too: the crown's maximum
 * goes **0.9089 → 0.9072**, i.e. 1817.8 mm over the mouldings to **1814.4**,
 * against the published 1814. And it holds wherever `rubStripY` goes — at
 * 0.560 the tangent construction would put those edges 0.2–8.1 mm proud all
 * over again, on a band that by then straddles the body's widest line.
 */
function onSkinAt(z: number, f: Frame, y0: number, sec: ReadonlyArray<Pt>): Pt[] {
  const d = new THREE.Vector3();
  return sec.map(([lx, ly]) => {
    d.copy(sidePoint(z, y0 + ly)).sub(f.o);
    return [d.dot(f.r) + lx, d.dot(f.u)] as Pt;
  });
}

function onSkin(z: number, f: Frame, sec: ReadonlyArray<Pt>): Pt[] {
  return onSkinAt(z, f, STRIP_Y, sec);
}

/**
 * The moulding is **four extrusions, not one** — fender, front door, rear
 * door, quarter — and it was built as a single 4.2 m sweep with no joint in
 * it anywhere.
 *
 * That is the clearest "injection-moulded in one piece" signal the flank can
 * give, and it is measurable. Picked at `side`, x 865 (the rear door cut), the
 * gap's depth against the local level per band:
 *
 *                      built      `bat3_side_profile.jpg`, same bands
 *     paint              107      143   (2 px at half depth, 5 mm)
 *     bright cap + band    0.5     42 on the cap / 11 on the band, to **L 2**
 *     paint below         21      114
 *
 * So the strip's gap did not exist at all. On the photograph the joint is the
 * strongest dark feature in the whole moulding: at 8x the two end caps are
 * rolled over, the bright cap stops and restarts with a lit nose on the aft
 * piece, and the void between them reads **L 2–6 in an 8 mm width** — darker
 * than the band it interrupts, because you are looking into the gap.
 *
 * Gap width measured on that frame at the two door cuts: **3 px at half depth
 * through the moulding = 7.9 mm**, against 2 px / 5.2 mm through the paint
 * above. The moulding's gap is the wider of the two, which is what the rolled
 * end caps do to it, so it is not `QUALITY.panelGap` and is not derived from
 * it.
 *
 * (The paint-below band, 21 against 114, is the body's shutline on `doorFR`
 * tumbling under at −21° — not this part. Reported, not touched.)
 */
const STRIP_JOINT_GAP = 0.0079;
/**
 * How far back from a joint the section starts rolling in, and how much of
 * itself is left at the end face.
 *
 * Short and shallow where the outer ends are long and deep: an outer end dies
 * into a wheel arch over 45 mm and wants to disappear, a panel joint is a
 * moulded end cap 16 mm long that keeps most of the band's height — the
 * photograph has the black band almost full depth right up to the void.
 */
const STRIP_JOINT_TAPER = 0.016;
const STRIP_JOINT_SCALE = 0.72;
const STRIP_END_TAPER = 0.045;
const STRIP_END_SCALE = 0.55;

/** Rear-to-front spans of the four extrusions, with the joint voids removed. */
function stripSpans(): Array<[number, number]> {
  const g = STRIP_JOINT_GAP / 2;
  // Aft is −z, so sorting ascending walks the cuts from the tail forwards.
  const cuts = [S.doorFrontZ, S.doorMidZ, S.doorRearZ].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  let rear = STRIP_REAR_Z;
  for (const z of cuts) {
    if (z - g <= rear) continue;
    out.push([rear, z - g]);
    rear = z + g;
  }
  out.push([rear, S.rubStripFrontZ]);
  return out;
}

function rubbingStrip(): { body: THREE.BufferGeometry; bright: THREE.BufferGeometry } {
  const spans = stripSpans();
  const total = Math.abs(S.rubStripFrontZ - STRIP_REAR_Z);
  // The whole run keeps its old station pitch, so splitting it costs the
  // moulding nothing in triangles beyond six more end caps.
  const pitch = total / STRIP_FRAMES;
  const line = offsetPolyline(STRIP_FACE.slice(0, 4), -0.0014);
  const bodies: THREE.BufferGeometry[] = [];
  const brights: THREE.BufferGeometry[] = [];

  for (let s = 0; s < spans.length; s++) {
    const [zRear, zFront] = spans[s];
    const len = Math.abs(zFront - zRear);
    const n = Math.max(6, Math.round(len / pitch));
    const frames = flankFrames(zRear, zFront, STRIP_Y, n);
    const zAt = (j: number): number => lerp(zRear, zFront, j / n);
    // t is 0 at the aft end of this piece and 1 at its forward end.
    const rearOuter = s === 0;
    const frontOuter = s === spans.length - 1;
    const taper = (t: number): number => {
      const a = lerp(rearOuter ? STRIP_END_SCALE : STRIP_JOINT_SCALE, 1,
        smoothstep(clamp((t * len) / (rearOuter ? STRIP_END_TAPER : STRIP_JOINT_TAPER), 0, 1)));
      const b = lerp(frontOuter ? STRIP_END_SCALE : STRIP_JOINT_SCALE, 1,
        smoothstep(clamp(((1 - t) * len) / (frontOuter ? STRIP_END_TAPER : STRIP_JOINT_TAPER), 0, 1)));
      return Math.min(a, b);
    };

    bodies.push(sweep(
      (j, t) => onSkin(zAt(j), frames[j], stripSection(taper(t))),
      frames,
      { closed: true, capStart: true, capEnd: true, uvScale: 0.25 },
    ));
    // The bright line along the top edge, offset off the moulding's own
    // profile so the two can never drift apart.
    brights.push(sweep(
      (j, t) => {
        const k = taper(t);
        return onSkin(zAt(j), frames[j], line.map(([x, y]) => [x * k, y * k] as Pt));
      },
      frames,
      { uvScale: 0.25 },
    ));
  }
  return { body: merge(bodies), bright: merge(brights) };
}

// ---------------------------------------------------------------------------
// Lower body cladding — the two-tone
// ---------------------------------------------------------------------------

/**
 * The rocker cover, and it was simply missing: our flank ran painted from the
 * moulding's bottom edge all the way under the sill.
 *
 * §2.2 calls it — *"below the moulding the rocker area is finished in the same
 * dark grey, giving a two-tone effect on light-coloured cars"* — and both
 * flank photographs have it, referenced to the **measured contact line** and
 * not to the hub (`b7157e3`: both photographed cars sit ~24 mm down on their
 * tyres, so a hub-referenced flank reading comes back ~25 mm high).
 *
 * ## Where its edges are
 *
 * Segmented on **chroma**, not luminance. On the red car the paint's luma is
 * ~35, *under* the 60-luma threshold that separates "black plastic" from
 * "paint" on the silver one, so a luma scan calls red paint plastic and finds
 * a cladding 200 mm deep. `V = max(R,G,B)` separates both: paint is 160-180,
 * this part is 5-20 and neutral on **both** cars, which is what proves it is
 * a separate part and not the flank falling into shade.
 *
 * Column-scanned every 20 px along the doors, corrected for each frame's own
 * yaw (measured by the scale that maps the front wheel onto the rear one:
 * 1.005 on the silver car, 1.020 on the red):
 *
 *     top edge   silver 371 +- 1.5    red 363 +- 2      rise over WB +3 / +6 mm
 *     bottom     silver 247 +- 8      red ~250 (the road edge is soft)
 *
 * So 0.367 and level, within the 8 mm the two cars disagree by, and its bottom
 * is the sill's own underside — which is why it is taken from the loft's floor
 * knot here rather than tabulated: the part wraps under the rocker and the
 * reference simply stops being able to see it.
 *
 * ## What is NOT here
 *
 * The 130 mm between the moulding's bottom edge (~510) and this part's top
 * edge (367) is **body colour**, not a light-grey panel. It reads as a
 * distinct grey on the silver car — R≈G≈B 124/126/128 against 163/170/178 for
 * the paint 200 mm higher — but that is silver paint turning away from the sky,
 * and the red car settles it: the same band measures 160/1/1 there, pure paint.
 */
const CLAD_TOP_Y = 0.367;
/**
 * Where the loft's floor knot is, so the cover dies under the sill instead of
 * ending on a visible edge part-way down it. `sideX` is flat below ~0.235
 * (`tAtY` has saturated at `T.floor`), so anything lower would stack section
 * points on one skin point.
 */
const CLAD_BOT_Y = 0.244;
const CLAD_MID_Y = (CLAD_TOP_Y + CLAD_BOT_Y) / 2;
const CLAD_HH = (CLAD_TOP_Y - CLAD_BOT_Y) / 2;

/**
 * Ends 25 mm short of the arch opening's lip at the cover's own top edge — on
 * `bat3_side_profile.jpg` at 5x the aft end stands 26 mm ahead of the rear
 * arch lip with painted quarter between the two. `archRadius` is the lip's
 * horizontal semi-axis and `archFlatten` its vertical one, the same
 * superellipse `body/surface.ts` cuts the arch with, evaluated at `CLAD_TOP_Y`
 * rather than at the crown — pinning an end to `archRadius` itself is the
 * `mudFlaps` / `liners.ts` bug in its longitudinal form.
 */
function archHalfSpanAt(y: number): number {
  const b = S.archRadius * S.archFlatten;
  const dy = Math.abs(y - HP.wheelRadius) / b;
  const n = 2.55;
  return S.archRadius * Math.pow(Math.max(0, 1 - Math.pow(Math.min(dy, 1), n)), 1 / n);
}

/**
 * Section, in the frame's own right/up coordinates, where `x` is **proud of
 * the skin at that point's own height** — `onSkinAt` puts each point on
 * `sidePoint` first. So this describes a 4 mm cover, not a 4 mm plane.
 *
 * Both extreme-height points are 2 mm UNDER the skin. A cover whose top edge
 * is level with the paint puts its 14 mm back shelf coplanar with the panel it
 * hides, which is the failure `b7157e3` found on the rubbing strip and
 * `5b4becd` on the front bead: the shelf becomes the frontmost hit at a
 * grazing angle and comes back facing the sky. Buried, it cannot.
 */
const CLAD_FACE: Pt[] = [
  [-0.0020, CLAD_HH],
  [0.0012, CLAD_HH - 0.0042],
  [0.0032, CLAD_HH - 0.0092],
  [0.0038, CLAD_HH - 0.0190],
  [0.0040, -CLAD_HH + 0.0420],
  [0.0036, -CLAD_HH + 0.0170],
  [0.0026, -CLAD_HH + 0.0072],
  [-0.0020, -CLAD_HH],
];

function lowerCladding(): THREE.BufferGeometry {
  const span = archHalfSpanAt(CLAD_TOP_Y) - 0.025;
  const zFront = -span;
  const zRear = S.archRearCenter[2] + span;
  const n = 76;
  const frames = flankFrames(zRear, zFront, CLAD_MID_Y, n);
  const zAt = (j: number): number => lerp(zRear, zFront, j / n);
  const capFrac = 0.055 / Math.abs(zFront - zRear);
  const sec: Pt[] = [...CLAD_FACE, [-0.014, -CLAD_HH], [-0.014, CLAD_HH]];

  return sweep(
    (j, t) => {
      // Dying into the arch rather than ending square: the last 55 mm draw the
      // face back to the skin, so the end cap is buried and never silhouettes.
      // Only the proud part tapers — the two buried edges and the back shelf
      // keep their depth, or the ends would surface and go coplanar with the
      // rocker exactly where the taper is meant to hide them.
      const k = lerp(0.10, 1, smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1)));
      return onSkinAt(zAt(j), frames[j], CLAD_MID_Y,
        sec.map(([x, y]) => [x > 0 ? x * k : x, y] as Pt));
    },
    frames,
    { closed: true, capStart: true, capEnd: true, uvScale: 0.25 },
  );
}

// ---------------------------------------------------------------------------
// Door handles — pre-facelift recessed pull
// ---------------------------------------------------------------------------

/**
 * ## The handle was an outline of itself, and the reason is a hard constraint
 *
 * What rendered at `side` was a 2–3 px bright rounded rectangle with the
 * door's own paint inside it — `pick` at x 690 / y 393, dead centre of the
 * handle, returned `doorFR` and material `paint`. Nothing of the handle was in
 * front of the door skin:
 *
 *  · `dish(…, { rim: 0.0010 })` puts the pocket's **boundary** 1 mm proud and
 *    its floor at `rim − (depth + rim)` = **−26 mm**, i.e. 26 mm *behind* the
 *    paint. The 1 mm boundary ring was the entire visible part; that ring is
 *    the "outline", and it blooms, which is the white halo round it.
 *  · the lever was placed at `dn = −0.0098` with a 15 mm section, so its front
 *    face sat **2.3 mm behind the skin**. It was never visible from anywhere.
 *
 * **And a recess cannot be shown here at all.** `doorFR` is a single-sided
 * lofted panel with no aperture in it, so it wins the depth test against
 * anything behind it. Measured with `pick` on the live scene — world points on
 * the door skin against the tangent plane at the handle's own station
 * (0.8690, 0.9060, −1.1310), over ±67 mm in z and ±33 mm in y — the skin
 * falls away from that plane by **0.0 to 0.86 mm** and nowhere more. That is
 * the whole depth budget for anything built behind the tangent plane. A 12 mm
 * pressing needs the door skin to carry it; it is reported, not worked around.
 *
 * ## So it is built proud, and the shading does the work
 *
 * Structure measured on `bat3_side_profile.jpg` at 2.6212 mm/px, column
 * through the front-door handle (ref x 1040, y 789→819):
 *
 *     dish, body colour, L 227–233      the pressing's upper face
 *     thin dark line                    y 799, L 144
 *     lever top face, lit               y 801–803, L 199–211, ~6 mm
 *     finger gap, hard black            y 805–810, **L 7–65**, ~10 mm
 *     dish lower half                   L 124→190, rising
 *
 * and in plan the lever bar runs ref x 980→1044 = **168 mm** with the lock pod
 * butted onto its aft end (to x 1072, so 215 mm over the assembly), while the
 * dish's own wall is 115 × 90 mm.
 *
 * Three of those four rows are proud of the paint on the real car, so three of
 * them can be built: the lit lever, the black gap under it, and the lock. The
 * dish is the one that needs depth, and it gets `HANDLE.crest`/`depth` — a
 * 4 mm swell scooped 3.6 mm back, floor 0.4 mm proud, which is the deepest
 * scoop that keeps every vertex in front of the skin. Its wall still turns
 * through ~21°, which is what puts a tone step across it.
 *
 * The pressing's **boundary is laid on the skin, not on the tangent plane** —
 * same reason `onSkin` exists for the moulding. On the plane its edge would
 * stand up to 0.86 mm proud at the corners and draw exactly the hairline
 * outline this function exists to remove.
 */
const HANDLE = {
  /** Outer boundary of the pressing, where it is flush with the door skin. */
  size: [0.148, 0.118] as [number, number],
  /** Rounded rectangle, not an ellipse. */
  shape: 2.6,
  /** Superellipse radii: crest ring, inner edge of the wall, floor. */
  rCrest: 0.80,
  rWall: 0.74,
  rFloor: 0.34,
  crest: 0.0040,
  depth: 0.0036,
  rings: 9,
  spokes: 40,
};

/** `HANDLE.crest - HANDLE.depth` — the pocket floor, still proud of the paint. */
const HANDLE_FLOOR = HANDLE.crest - HANDLE.depth;

/**
 * The pressing: a superellipse height field whose every vertex is placed on
 * `sidePoint` at its own height and then lifted along the local normal, so the
 * boundary is flush with the door however the flank is shaped there.
 *
 * `dish()` cannot do this — it ends at a hard rim and is built on one plane.
 */
function handlePressing(z0: number, y0: number): THREE.BufferGeometry {
  const [w, h] = HANDLE.size;
  const { shape: p, rCrest, rWall, rFloor, crest, depth, rings, spokes } = HANDLE;
  const liftAt = (r: number): number =>
    crest * (1 - smoothstep(clamp((r - rCrest) / (1 - rCrest), 0, 1)))
    - depth * (1 - smoothstep(clamp((r - rFloor) / (rWall - rFloor), 0, 1)));

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const pt = new THREE.Vector3();
  const push = (dz: number, dy: number, lift: number, u: number, v: number): void => {
    const y = y0 + dy;
    pt.copy(sidePoint(z0 + dz, y)).addScaledVector(sideNormal(z0 + dz, y), lift);
    pos.push(pt.x, pt.y, pt.z);
    uv.push(u, v);
  };

  push(0, 0, liftAt(0), 0.5, 0.5);                     // centre of the fan
  for (let i = 1; i <= rings; i++) {
    const r = i / rings;
    for (let j = 0; j < spokes; j++) {
      const a = (j / spokes) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // Superellipse of exponent p at radius r.
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
      const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
      push(r * ex * w / 2, r * ey * h / 2, liftAt(r), 0.5 + 0.5 * r * ex, 0.5 + 0.5 * r * ey);
    }
  }
  const at2 = (i: number, j: number): number => 1 + (i - 1) * spokes + (j % spokes);
  for (let j = 0; j < spokes; j++) idx.push(0, at2(1, j), at2(1, j + 1));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < spokes; j++) {
      const a = at2(i, j), b = at2(i, j + 1), c = at2(i + 1, j), d = at2(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Pre-facelift recessed pull handle (§6.8).
 *
 * `lever` is the bar, `gap` the shadowed finger void beneath it, `bright` the
 * lock barrel. The lock goes on the driver's door, and on an LHD car — which
 * `bat3_side_profile.jpg` is, because the flank it shows has one — that is the
 * car's **left**, i.e. **+X** (see the frame note in `hardpoints.ts`). It was
 * mirrored to −X, so the one flank the `side` pose looks at was the one
 * without it.
 */
function handle(f: SkinFrame, z0: number, y0: number, withLock: boolean): {
  pocket: THREE.BufferGeometry;
  lever: THREE.BufferGeometry;
  gap: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
} {
  const [w, h] = S.handleSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, dx: number, dy: number, dn: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(
      f.o.x + f.along.x * dx + f.up.x * dy + f.n.x * dn,
      f.o.y + f.along.y * dx + f.up.y * dy + f.n.y * dn,
      f.o.z + f.along.z * dx + f.up.z * dy + f.n.z * dn,
    );
    return g;
  };

  const pocket = handlePressing(z0, y0);
  // The bar, standing 8 mm off the paint. A tight top radius on purpose: the
  // one row the photograph has at L 199-211 is a specular highlight on that
  // radius, not a bright insert, so the radius is the feature.
  const barH = h * 0.34;
  const barY = h * 0.30;
  const lever = place(roundedBox(w - 0.014, barH, 0.0080, 0.0022), -0.002, barY, HANDLE_FLOOR + 0.0044);
  // The finger void. Modelled rather than left to the shadow map, because the
  // feature is 10 mm tall and no shadow cascade on this car resolves that; on
  // the photograph it is the darkest thing on the door at L 7.
  const gapH = 0.0095;
  const gap = place(roundedBox(w - 0.022, gapH, 0.0030, 0.0008),
    -0.002, barY - barH / 2 - gapH / 2 + 0.0010, HANDLE_FLOOR + 0.0013);

  const bright: THREE.BufferGeometry[] = [];
  if (withLock) {
    const barrel = lathe([
      [0, 0.0030], [0.0062, 0.0029], [0.0082, 0.0018], [0.0088, 0],
      [0.0104, -0.0012], [0.0104, -0.0090], [0, -0.0090],
    ], 18);
    barrel.rotateX(Math.PI / 2);
    // Butted onto the bar's aft end, which is where the photograph has it —
    // not floating 27 mm beyond it.
    bright.push(place(barrel, (w - 0.014) / 2 + 0.013, barY * 0.4, HANDLE_FLOOR + 0.0026));
  }

  return { pocket, lever, gap, bright: merge(bright) };
}

// ---------------------------------------------------------------------------
// Fuel flap
// ---------------------------------------------------------------------------

function fuelFlap(f: SkinFrame): { well: THREE.BufferGeometry; flap: THREE.BufferGeometry } {
  const [w, h] = S.fuelFlapSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(f.o.x + f.n.x * lift, f.o.y + f.n.y * lift, f.o.z + f.n.z * lift);
    return g;
  };
  const well = place(roundedBox(w + 0.006, h + 0.006, 0.040, 0.010), -0.021);
  const flap = place(roundedBox(w - QUALITY.panelGap * 2, h - QUALITY.panelGap * 2, 0.012, 0.009), 0.0005);
  return { well, flap };
}

// ---------------------------------------------------------------------------

export function buildSides(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sideTrim';

  const plastic = ctx.materials.bumperPlastic();
  const bright = ctx.materials.chrome({ roughness: 0.2 });
  const dark = ctx.materials.blackTrim();
  const paint = ctx.materials.paint();
  const seal = ctx.materials.rubber({ roughness: 0.96 });

  /**
   * The moulding's bright cap and the bumper caps' bead are **one extrusion**
   * on the real car — the line crosses both wheel arches with nothing but a
   * small step at the joint — so this keeps `bumpers.ts`'s colour, `0xd0d4d8`,
   * which four real builds there settled against the licence plate.
   *
   * It was `chrome({ roughness: 0.2 })`, which quantises to the `chrome:0.180`
   * rung and an effective roughness of 0.152 — a mirror. On a flank that is
   * the worst place for one: the cap's crown turns through 69° of sky over its
   * top 6 mm, so at `side` the line came back **(83,103,138) → (190,174,157)**
   * top to bottom, B−R **+55 to −33**, a blue-over-orange pinstripe peaking at
   * L 174 where the reference reads a neutral L 250. Do not put it back:
   * `5b4becd` measured `chrome()` at both the 0.152 and 0.30 rungs blowing the
   * bumper corners and taking the tone profile to 14.0.
   *
   * ## Why `anodised()` and not the bead's own `dirtyMetal({ metalness: 0.35 })`
   *
   * Because at metalness 0.35 two thirds of the response is Lambertian and a
   * Lambertian bead has no range. Column-scanned at `side` over the whole run
   * between the arches (y 475–479, x 300–1330), the cap on that finish read
   * **p50 145, p95 155, max 158, nothing above 176 anywhere** — a flat ribbon.
   * Both reference photographs have it clipped: `bat3_side_profile.jpg` peaks
   * **L 253–254 across the front bumper and fender together** and **237–251**
   * along the rear quarter, with the row immediately above it down at 85–92.
   * The real extrusion is dark over its shaded edge and blown over its lit
   * face, thirty millimetres apart.
   *
   * Three real builds, one view per boot — a live sweep cannot be trusted here
   * (`docs/WORKSTREAM.md`) — over that same band:
   *
   *   dirtyMetal m0.35 r0.62   p50 145  p95 155  max 158   >176  0.0 %
   *   anodised         r0.32   p50 134  p95 178  max 192   >176  5.8 %
   *   anodised         r0.42   p50 150  p95 182  max 194   >176  7.7 %
   *
   * `0.42` over `0.32`: the same median as the shipped bead (so the two still
   * read as one line at the arch) with the range on top of it, and a weaker
   * blue fringe on the sky-facing top row — B−R +26 against +41, where the
   * reference reads +13. It is also the rung `createAnodised`'s own three
   * builds preferred, for the same reason: the narrower rung's glint is longer
   * and drags a bloom skirt onto the moulding under it.
   *
   * ⚠ **`bumpers.ts` has not made this move**, so the bead and the cap are no
   * longer one registry instance. They are still one colour, and at `side` the
   * peak steps 163 → 190 across the front joint where the photograph steps by
   * about nothing — because in the photograph *both* are clipped and it is the
   * bead that cannot get there. `frontRubStrip`/`rearRubStrip` want exactly
   * this call; when they take it the two collapse back onto one instance with
   * no other change.
   */
  const capStrip = audiMaterials(ctx.materials).anodised({ color: 0xd0d4d8, roughness: 0.42 });

  // --- rubbing strip -------------------------------------------------------
  const strip = rubbingStrip();
  group.add(mesh('rubStrip', merge([strip.body, mirrorX(strip.body)]), plastic));
  group.add(mesh('rubStripLine', merge([strip.bright, mirrorX(strip.bright)]), capStrip));

  // --- lower body cladding -------------------------------------------------
  {
    const g = lowerCladding();
    group.add(mesh('lowerCladding', merge([g, mirrorX(g)]), plastic));
  }

  // Small oval "audi" on the front-fender section of the moulding, just aft of
  // the front wheel arch (§2.6).
  //
  // Baked into two meshes rather than four Object3Ds: `docs/CRITIQUE-2.md` §11
  // names `fenderBadgeGroundLeft` (24 triangles) as an example of the tiny
  // meshes putting the draw count 40 % over budget, and a badge that is
  // mirrored rather than instanced costs nothing to merge.
  {
    const z = -0.424;
    const f = skinFrame(z, STRIP_Y - 0.004);
    const onFlank = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
      const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
      m.setPosition(f.o.clone().addScaledVector(f.n, lift));
      g.applyMatrix4(m);
      return g;
    };
    const oval = new THREE.CircleGeometry(0.026, 24);
    oval.scale(1, 0.40, 1);
    onFlank(oval, 0.0146);
    const text = onFlank(badgeText('audi', 0.0092, { depth: 0.0012, tracking: 0.02, weight: '500' }), 0.0148);
    group.add(mesh('fenderBadgeGrounds', merge([oval, mirrorX(oval)]), dark));
    group.add(mesh('fenderBadges', merge([text, mirrorX(text)]), bright));
  }

  // --- mud flaps -----------------------------------------------------------
  //
  // `docs/CRITIQUE-2.md` §3 lists them as missing; `GCFS-85` shows a large one
  // hanging off the arch's trailing lip, roughly as tall as it is wide and
  // reaching down past the rocker's bottom edge. All four in one mesh — they
  // are four copies of one moulding and nothing needs them apart.
  {
    const flaps: THREE.BufferGeometry[] = [];
    const [FW, FH] = [0.200, 0.178];
    const flapCenterY = 0.218;
    // A flap bolts to the OUTSIDE of the arch's trailing lip, so its outboard
    // face has to clear the lip — but the lip is *where the flap is*, not at
    // the arch crown. `S.archLipX + 0.006` was 0.897 for both flaps, and
    // `archLipX` is the half-width at the FRONT arch's crown: at the stations
    // these hang from, the body has tucked in to **0.773** (front) and
    // **0.759** (rear) at the flap's own top edge, so the blades stood 124 and
    // 138 mm outboard of the car. That is the bug `f99feff` fixed in
    // `underbody/liners.ts` and `panels.ts`'s `wheelHouse` before it — a lip
    // pinned to one constant walking out through the skin — and after
    // `f99feff` split the rear arch off the front, `archLipX` was not even the
    // right constant for the rear flap.
    //
    // The flap's top sits at wheel-centre height, which is where the arch
    // opening's trailing edge is at its widest, so that is the height to ask
    // the surface about.
    for (const axleZ of [S.archFrontCenter[2], S.archRearCenter[2]]) {
      // Just aft of where the arch opening's trailing edge meets the body, so
      // the flap reads as bolted to that lip rather than floating behind it.
      const z = axleZ - S.archRadius - 0.012;
      const outboard = sideX(z, flapCenterY + FH / 2) + 0.006;
      const g = roundedBox(FW, FH, 0.008, 0.004, 3);
      // Leaning back at the bottom, the way a rubber flap hangs at rest.
      g.rotateX(-7 * DEG);
      g.translate(outboard - FW / 2, flapCenterY, z);
      flaps.push(g, mirrorX(g));
    }
    group.add(mesh('mudFlaps', merge(flaps), plastic));
  }

  // --- door handles --------------------------------------------------------
  const pockets: THREE.BufferGeometry[] = [];
  const levers: THREE.BufferGeometry[] = [];
  const locks: THREE.BufferGeometry[] = [];
  for (const [z, isFront] of [[S.handleFrontCenter[2], true], [S.handleRearCenter[2], false]] as const) {
    const y = S.handleFrontCenter[1];
    const h = handle(skinFrame(z, y), z, y, isFront);
    pockets.push(h.pocket, mirrorX(h.pocket));
    // The void goes in with the lever, not with the pressing: both want
    // `blackTrim` and merging them keeps the handle at two draws, not three.
    levers.push(h.lever, h.gap, mirrorX(h.lever), mirrorX(h.gap));
    // LHD car: the lock barrel is on the driver's — left-hand, +X — front door.
    if (isFront) locks.push(h.bright);
  }
  group.add(mesh('doorHandlePockets', merge(pockets), paint));
  group.add(mesh('doorHandleLevers', merge(levers), dark));
  group.add(mesh('doorLock', merge(locks), bright));

  // --- fuel flap: left-hand quarter on this car ---------------------------
  {
    const f = skinFrame(S.fuelFlapCenter[2], S.fuelFlapCenter[1]);
    const parts = fuelFlap(f);
    group.add(mesh('fuelWell', mirrorX(parts.well), dark));
    group.add(mesh('fuelFlap', mirrorX(parts.flap), paint));
  }

  // --- belt weatherstrip under the DLO ------------------------------------
  {
    const frames = flankFrames(HP.glass.dloRearZ, HP.glass.dloFrontZ, HP.beltY - 0.007, 48);
    const sec: Pt[] = [
      [0.0000, 0.0085], [0.0042, 0.0072], [0.0060, 0.0030],
      [0.0056, -0.0028], [0.0030, -0.0068], [0.0000, -0.0082],
      [-0.0090, -0.0082], [-0.0090, 0.0085],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('beltSeal', merge([g, mirrorX(g)]), seal));
  }

  // --- roof-to-bodyside moulding, in place of a drip rail (§2.2) ----------
  //
  // Swept on `roofOuterPoint`, the joint itself, so the 22 mm section straddles
  // it — 11 mm up on the roof skin, 11 mm down onto the daylight opening, which
  // is where the glazing's blackout runs underneath. Swept on `roofEdgePoint`
  // it sat wholly inboard and its outboard lip only just reached the joint.
  //
  // It runs the body's continuous DLO top line end to end: the tailgate hinge
  // aft, where the tailgate shutline leaves `tRoofOuter` and rakes down across
  // the D-pillar, and z −0.700 forward, where the A-pillar's lower edge leaves
  // it and drops to the beltline (`aPillarLower`'s smoothstep in
  // `body/panels.ts`). Short of either end the bead stops in mid-air on a line
  // the eye follows right past it.
  {
    const pts: THREE.Vector3[] = [];
    const nor: THREE.Vector3[] = [];
    const z0 = HP.rear.tailgateHingeZ;
    const z1 = -0.700;
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n);
      pts.push(roofOuterPoint(z));
      nor.push(roofOuterNormal(z));
    }
    const frames = framesFrom(pts, nor);
    const sec: Pt[] = [
      [0.0000, 0.0110], [0.0032, 0.0096], [0.0044, 0.0040],
      [0.0038, -0.0040], [0.0016, -0.0098], [0.0000, -0.0112],
      [-0.0070, -0.0112], [-0.0070, 0.0110],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('roofMoulding', merge([g, mirrorX(g)]), dark));
  }

  void at;
  return group;
}

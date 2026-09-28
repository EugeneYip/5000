/**
 * Rear lamp cluster — Avant, and split across the tailgate shutline.
 *
 * ## What the reference photographs show
 *
 * Measured off a dead-on rear frame of a US-market 5000 Avant, with a close-up
 * of the same car's left cluster to confirm the readings. Divisions were found
 * by taking the mean horizontal luminance gradient down each band and peaking
 * it, rather than by eye — three of the four are a few grey levels apart from
 * the lens texture around them and do not survive being squinted at. Scaled on
 * the cluster's own span, so the fractions below are independent of the
 * aperture's absolute size:
 *
 * ```
 *   inboard edge                                            outboard edge
 *   0.000        0.401        0.469   0.652      0.706      0.830     1.000
 *     |            |            |       |          |          |         |
 *     |   amber    ‖   amber    | clear |  amber   ‖  amber   ‖  amber  |  upper
 *     |------------‖------------+-------+----------‖----------‖---------|
 *     |    red     ‖          red                  ‖   red    ‖   red   |  lower
 *                  ↑                               ↑          ↑
 *              lens rib                    TAILGATE SHUTLINE   lens rib
 * ```
 *
 * So: **one reversing lamp per side**, a clear window inset into the amber
 * band — amber above it, below it and to either side — and it lives on the
 * *tailgate* half, which is the inboard 71 % of the band, not the outboard
 * half. The quarter-panel section carries two amber cells over red and is the
 * only part that flashes: the ambers on the tailgate are lens, not filament,
 * because a turn signal has to stay lit and stay outboard with the tailgate
 * open. The upper band is slightly the taller of the two (52.8 : 47.2).
 *
 * The shutline was fixed independently of the lens: the same gradient scan run
 * on the sheet metal *below* the lamps puts a panel gap at the same x on both
 * sides, mirrored about the plate to within 3 px. That matters because the two
 * inboard divisions are within 4 % of each other as fractions and it would
 * otherwise be easy to hang the reversing lamp off the wrong half of the car.
 *
 * The inner section is built into its own group for `lights.ts` to re-parent
 * onto the body stream's `tailgatePanel`, so it opens with the tailgate.
 *
 * The outboard corner is rounded and follows the body, which on this tail
 * means it wraps about 90 mm forward — so every face here is built on
 * `rearFaceZ` rather than on a plane.
 *
 * The red must glow with depth rather than read as a red sticker, and that is
 * almost entirely a question of what is *behind* it: a stippled aluminium bowl,
 * seen through 4 mm of dyed acrylic with prisms moulded into its back face.
 *
 * ## Two things the photographs disagree with `hardpoints.ts` about
 *
 * Both are aperture-level and therefore not fixable here — the body cuts the
 * hole to the same numbers — but they are recorded so the measurement is not
 * lost. Scaling the dead-on frame on the body's own half-width at lamp height:
 * the real cluster is about **675 x 205 mm**, an aspect of 3.3 : 1, against
 * `HP.rear`'s 590 x 294 = 2.0 : 1; and its inboard edge is at about
 * **x 0.185**, not 0.238 — the black ribbed centre panel is only ~30 mm wider
 * than the plate in it, where the hardpoints leave ~100 mm. Everything below
 * is therefore expressed as a *fraction* of whatever aperture it is given, so
 * the arrangement stays right when the aperture is corrected.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS, QUALITY } from '@/spec';
import { rearFaceZ, rearHalfWidth } from '@/car/body/panels';
import type { BuildContext } from '@/types';
import {
  bothSides, bowl, frame, inset, merge, mirrored, slab, sliceX, sliceY, spanAt,
  type Outline,
} from './shapes';
import { FILAMENT, type Glow, type GlowFactory } from './optics';

const R = HP.rear;
const FACE = rearFaceZ;
const FACING = -1 as const;

/**
 * Aperture seal and satin-black surround, per edge.
 *
 * Both were halved from the figures a previous round left. At 2.2 + 2.0 they
 * put 4.2 mm of black round every edge of every section, which the tailgate
 * shutline then doubled and added the 4 mm panel gap to: a 19 mm black bar
 * straight down the middle of the cluster, measured on the render. The
 * reference close-up puts about 2 mm of genuinely dark parting there, with the
 * two mouldings' own lit side walls either side of it.
 *
 * Halving them again, because halving once was not enough and the render says
 * so rather than the code. Scanning the mean luminance across the band and
 * taking every run more than 38 % below its own local mean puts the dark
 * dividers at **3.9 mm, 9.4 mm and 4.2 mm** on the render's `taillight` frame
 * against **1.8 mm and 2.7 mm** on the dead-on reference at 1.13 px/mm. The
 * 9.4 mm one is the tailgate shutline and is the black bar the review saw.
 */
const SEAL = 0.0006;
const SURROUND = 0.0010;
const LENS_BODY = 0.0042;
/**
 * Half-width of the moulded division between two lens cells.
 *
 * On the reference close-up the cells do not have a frame round them at all:
 * two mouldings butt, each with its own fluted side wall, and what reads as a
 * division is a dark line a couple of millimetres across between two lit
 * edges — 8 px at the 3.69 px/mm that frame's reversing window fixes. At 4 mm
 * — an 8 mm black bar standing 0.8 mm proud of the glass — the cluster read as
 * five separate lamps in a cage rather than as one moulding divided into
 * cells, which is the single loudest tell in the rear views.
 */
const RIB = 0.0007;
/**
 * The same division between the signal band and the red field, which on the
 * real part is tighter still: the amber's lower edge chamfer and then red,
 * about 2 mm all in, with no black between them.
 */
const BAND_RIB = 0.0007;
/** Gap between the reversing window and the amber around it. */
const WIN_RIB = 0.0016;
/**
 * Corner radius of a lens cell.
 *
 * It has to be well under the rib between cells, because it is spent *twice*
 * at every junction — once by each of the two cells meeting there — and
 * whatever is left over shows as bare housing. At 5 mm against a 3.2 mm rib
 * that left white triangular notches down the top edge of the cluster; at
 * 1.5 mm against 2.2 mm it was what widened a 3.2 mm rib into the 6.7 mm one
 * measured on the render. Still a radius, not an edge.
 */
const CELL_R = 0.0005;
/**
 * Radius on the moulding's own cut edge at the tailgate shutline.
 *
 * A radius rolls the glass away from the face, so whatever it is set to gets
 * spent *twice* on the visible width of the dark line and added to the gap: at
 * 2.5 mm it turned an 8.8 mm geometric gap into the 9.4 mm of measured black.
 */
const SHUT_R = 0.0010;

/**
 * Lens dye transmittances, **single pass**.
 *
 * Not the same quantity as `LIGHTS.tailColor` / `LIGHTS.indicatorColor`, which
 * are signal colours — what the lamp *emits* when its filament is lit. The dye
 * is what a beam loses crossing the body once, and an unlit lamp is seen
 * through it twice: in, off the reflector, back out. `createLens` says the
 * same thing at more length.
 *
 * Both were derived from the 2048 px tailgate close-up
 * (`scratchpad/ref3/bat3_badge_audi5000cs_tailgate.jpg`), normalised on the
 * silver panel directly above the lamps in the same frame, so the figures do
 * not move with the exposure:
 *
 * ```
 *              R/panel   G/R     B/R
 *   amber       0.893   0.329   0.0052
 *   red         0.206   0.039   0.0318
 * ```
 *
 * Square-rooted for the single crossing, that is (0.80, 0.53, 0.021) and
 * (0.44, 0.078, 0.048) in linear light. The red comes out a dusty rose rather
 * than a pillar-box red, which looks wrong written down and is right on the
 * part: a taillamp dye passes about a sixth of the red light that hits it and
 * essentially none of the rest, and squaring it gets you the near-black
 * crimson the photographs show.
 *
 * ## Re-derived, and the previous round's reason for rejecting the review was
 * ## wrong
 *
 * The round before this refused `bat_rear_straight_b.jpg` — the frame the
 * review sampled — on the grounds that it was saturation-boosted into
 * clipping. Counted rather than asserted, it has it backwards: in `_b` 8 % of
 * the amber sits at R >= 252 and 46–64 % of the red has green at or below 2,
 * while in `bat_rear_straight.jpg`, the frame it preferred instead, the same
 * patches are **35 %** clipped and **60–75 %** green-crushed. `_b` is the
 * better-exposed of the two. It made no real difference — the two frames agree
 * closely once normalised — but the review's figures were fine and were thrown
 * away for a bad reason.
 *
 * Both frames, normalised on the **clear reversing window of the same lamp**
 * rather than on a panel or the plate. That window is the same moulding in the
 * same plane under the same light, so the ratio is free of exposure, white
 * balance and the fact that this car's plate hangs tilted on a strap with a
 * card over half of it. Double-pass, i.e. what the eye sees:
 *
 * ```
 *                        R/clear   G/R      B/R
 *   amber   frame a       1.58     0.416   0.0008
 *   amber   frame a'      1.63     0.469   0.0004
 *   amber   frame b       1.43     0.456   0.0031
 *   red     frame a       0.558    0.001   0.0055
 *   red     frame a'      0.989    0.003   0.0063
 *   red     frame b       0.393    0.006   0.0134
 * ```
 *
 * So the targets are amber G/R 0.45, B/R 0.002; red G/R 0.004, B/R 0.008; and
 * red's red at about **0.31 of amber's**, which is the one figure that pins the
 * two dyes against each other rather than against the scene. Square-rooted for
 * the single crossing and converted to sRGB, that is what is below.
 *
 * One correction to the table above, found by rendering it. Normalising on
 * the clear window transfers *our* clear window's own cast into the
 * comparison, and ours is blue where the reference's is warm — B/R 1.18
 * against 0.81, because our reversing lens is looking at a bare sky and the
 * photographed one is under a tree. Against that normaliser the amber scored
 * a correct 0.454 and still came out of the render visibly lemon rather than
 * orange. Read raw instead, amber G/R is 0.381 and 0.332 on the two frames
 * and ours was 0.468 — 23 % too green. The green here is cut to suit the raw
 * figure; the normalised one is the better instrument only when both sides
 * share an illuminant, which for the reversing lamp they do not.
 *
 * The amber's measured 1.4–1.6x *the clear lens* is not reachable by a dye and
 * is not meant to be: no transmittance exceeds 1. It is the signal chamber's
 * polished bowl out-returning the reversing chamber's diffuser, and it is why
 * `createLens` no longer runs the front-surface specular down at 0.26.
 */
const DYE_AMBER = 0xf1bf3c;
const DYE_RED = 0xba3134;
/**
 * Colourless, so it loses only what the acrylic itself takes — which is about
 * 8 % over 4 mm, not the 35 % that 0xeef2fb was charging it. A "clear" dye
 * dark enough to eat a third of the light in double pass was dragging the
 * whole cluster down and, worse, was the normaliser every other figure here is
 * measured against.
 */
const DYE_CLEAR = 0xfcfcfc;

const SPAN = R.lampOuterX - R.lampInnerX;
const RISE = R.lampTopY - R.lampBottomY;

/** Absolute x of a fraction of the cluster's width, from its inboard edge. */
const atX = (f: number): number => R.lampInnerX + SPAN * f;

/** Where the tailgate shutline crosses the band. */
const SPLIT = atX(0.706);
/** Lens rib dividing the tailgate section into its two cells. */
const RIB_X = atX(0.401);
/**
 * Lens rib dividing the quarter-panel section into its two cells. The outboard
 * one is ~100 mm wide and most of that is the cluster's 46 mm corner radius
 * turning onto the flank, which is why it reads as a separate face from dead
 * astern and as the same moulding from three-quarters.
 */
const WRAP_X = atX(0.830);
/**
 * The reversing window, inset into the outboard tailgate cell's amber. It sits
 * centred in that cell — 0.469 to 0.652 of the cluster against a cell of 0.401
 * to 0.706 — so it is given as a width and centred rather than as two absolute
 * edges, which would drift off centre whenever the surround changed.
 */
const REVERSE_WIDTH = 0.183;
/** How much of the signal band's height the reversing window takes. */
const REVERSE_RISE = 0.567;
/** Division between the signal band and the red field. */
const BAND = R.lampBottomY + RISE * 0.472;

const cluster: Outline = {
  yLo: R.lampBottomY,
  yHi: R.lampTopY,
  xInner: () => R.lampInnerX,
  xOuter: (y) => Math.min(R.lampOuterX, rearHalfWidth(y) - 0.004),
  radiusInner: 0.008,
  radiusOuter: 0.046,
};

export interface TaillampSet {
  /** Quarter-panel sections, both sides. */
  outer: THREE.Group;
  /** Tailgate sections, both sides — re-parented by `lights.ts`. */
  inner: THREE.Group;
  tail: Glow[];
  reverse: Glow[];
  indicator: [Glow[], Glow[]];
  /** Where the near-field spill lights sit, left then right. */
  spill: [THREE.Vector3, THREE.Vector3];
}

export function buildTaillamps(ctx: BuildContext, glows: GlowFactory): TaillampSet {
  const black = ctx.materials.blackTrim();
  const rubber = ctx.materials.rubber({ roughness: 0.95 });
  const reflectorMat = ctx.materials.reflector();
  const redLens = ctx.materials.lens(DYE_RED, { prismatic: true });
  const amberLens = ctx.materials.lens(DYE_AMBER, { prismatic: true });
  const clearLens = ctx.materials.lens(DYE_CLEAR, { prismatic: true });

  const mats = { black, rubber, reflectorMat, redLens, amberLens, clearLens };

  // Half the gap between the two lens mouldings — which is *not* half
  // `QUALITY.panelGap`, and using that was most of the 9.4 mm black bar.
  //
  // 4 mm is the gap the body cuts between two painted steel panels, where it
  // has to swallow hinge tolerance, a seal and paint build. Two lens mouldings
  // on the same tailgate butt far closer than that: the dead-on reference
  // measures 2.7 mm of dark at the shutline through the amber band, against
  // 1.8 mm at a lens rib within one moulding. So the lens takes its own
  // figure, and `QUALITY.panelGap` stays what it is for the sheet metal.
  const gap = 0.0014;
  // The cut edge carries a radius of its own, larger than a cell corner and
  // smaller than the 6 mm that once opened a wedge either side of the gap and
  // showed bare reflector through it. On the three-quarter reference the
  // tailgate shutline through the cluster reads as a *bright* vertical line,
  // not a dark one: what you see is the two mouldings' own rounded edges
  // catching the sky, with a hair of parting between them. Square them off and
  // the only thing left at the shutline is the black behind.
  const outerShape = sliceX(cluster, SPLIT + gap, 10, SHUT_R);
  const innerShape = sliceX(cluster, 0, SPLIT - gap, SHUT_R);
  // sliceX flattens the outline's own corner radii, so put them back where the
  // section still meets the outside of the cluster.
  outerShape.radiusOuter = cluster.radiusOuter;
  innerShape.radiusInner = cluster.radiusInner;

  // Quarter panel: two amber cells over red, and the only flashing amber on
  // the car's rear. Both cells are one lamp function divided by a moulding
  // rib, so both are driven — the rib runs through the red as well, which is
  // what says "moulding" rather than "two lamps" at a glance.
  const outer = section(glows, {
    name: 'taillampOuter',
    shape: outerShape,
    ribs: [WRAP_X],
    segments: [
      { kind: 'indicator', x0: WRAP_X, x1: 10 },
      { kind: 'indicator', x0: 0, x1: WRAP_X },
    ],
    ...mats,
  });

  // Tailgate: two cells. The outboard one carries the reversing window.
  const inner = section(glows, {
    name: 'taillampInner',
    shape: innerShape,
    ribs: [RIB_X],
    segments: [
      { kind: 'amber', x0: RIB_X, x1: 10, window: true },
      { kind: 'amber', x0: 0, x1: RIB_X },
    ],
    ...mats,
  });

  const sy = (R.lampBottomY + BAND) / 2;
  const sx = atX(0.5);
  // Well clear of the lens: a point source with inverse-square falloff sitting
  // on the lamp face puts hundreds of units onto its own glass.
  const sz = FACE(sx, sy) + FACING * 0.30;

  const indicator: [Glow[], Glow[]] = [[], []];
  for (const s of [outer, inner]) {
    if (!s.indicator) continue;
    indicator[0].push(s.indicator[0]);
    indicator[1].push(s.indicator[1]);
  }

  return {
    outer: outer.group,
    inner: inner.group,
    tail: [outer.tail, inner.tail],
    reverse: inner.reverse ? [inner.reverse] : [],
    indicator,
    spill: [new THREE.Vector3(-sx, sy, sz), new THREE.Vector3(sx, sy, sz)],
  };
}

// ---------------------------------------------------------------------------

/** `indicator` flashes; `amber` is lens colour with no filament behind it. */
type SegmentKind = 'indicator' | 'amber';

interface SegmentSpec {
  kind: SegmentKind;
  /** Inboard limit; 0 means the section's own inboard edge. */
  x0: number;
  /** Outboard limit; 10 means the section's own outboard edge. */
  x1: number;
  /** Inset a clear reversing window into this segment's amber. */
  window?: boolean;
}

interface SectionSpec {
  name: string;
  shape: Outline;
  /** Signal-band segments, outboard → inboard. */
  segments: SegmentSpec[];
  /** Full-height lens ribs inside this section. */
  ribs?: number[];
  black: THREE.Material;
  rubber: THREE.Material;
  reflectorMat: THREE.Material;
  redLens: THREE.Material;
  amberLens: THREE.Material;
  clearLens: THREE.Material;
}

interface SectionResult {
  group: THREE.Group;
  tail: Glow;
  reverse: Glow | null;
  /** Left and right flashing ambers, or null if this section has none. */
  indicator: [Glow, Glow] | null;
}

function section(glows: GlowFactory, spec: SectionSpec): SectionResult {
  const group = new THREE.Group();
  group.name = spec.name;

  const lensArea = inset(spec.shape, SEAL + SURROUND);
  // Likewise across the signal band's lower edge: amber and red butt.
  const lower = sliceY(lensArea, 0, BAND, CELL_R);
  const upper = sliceY(lensArea, BAND, 10, CELL_R);

  const structure: THREE.BufferGeometry[] = [];
  const bowls: THREE.BufferGeometry[] = [];
  const redLensGeo: THREE.BufferGeometry[] = [];
  const amberLensGeo: THREE.BufferGeometry[] = [];
  const clearLensGeo: THREE.BufferGeometry[] = [];
  const redGlow: THREE.BufferGeometry[] = [];
  const amberGlow: THREE.BufferGeometry[] = [];
  const clearGlow: THREE.BufferGeometry[] = [];

  // Slim satin-black surround, and the rubber lip into the aperture.
  structure.push(
    frame({
      outline: inset(spec.shape, SEAL),
      zAt: FACE, facing: FACING,
      // Stated as fractions of the surround so the steps stay ordered when its
      // width changes; a profile with two coincident offsets builds a
      // zero-width ring and the bezel loses its lit edge.
      profile: [
        [0.0, 0.0025],
        [SURROUND * 0.55, -0.0015],
        [SURROUND, 0.003],
        [SURROUND + 0.002, 0.016],
      ],
    }),
  );
  const seal = frame({
    outline: spec.shape,
    zAt: FACE, facing: FACING,
    profile: [
      [-0.002, 0.001],
      [0.002, 0.004],
      [SEAL, 0.008],
      [SEAL + 0.001, 0.026],
    ],
  });
  // Housing: closes the aperture 68 mm into the car.
  structure.push(
    slab({
      outline: inset(spec.shape, SEAL + SURROUND),
      zAt: FACE, facing: FACING,
      front: 0.010, back: 0.068,
      capFront: false,
      nu: 18, nv: 12,
    }),
  );
  // The straight horizontal division between the signal band and the red field.
  // Set *behind* the glass rather than proud of it, so it reads as the groove
  // between two butted mouldings instead of a bar laid across them.
  structure.push(
    slab({
      outline: {
        ...lensArea,
        yLo: BAND - BAND_RIB, yHi: BAND + BAND_RIB,
        radiusInner: BAND_RIB * 0.5, radiusOuter: BAND_RIB * 0.5,
      },
      zAt: FACE, facing: FACING,
      // Behind the glass, not proud of it. The lens slabs' own front faces sit
      // at 1.0 mm; at 2.2 mm this stood 1.2 mm in front of them, so the
      // "groove" was a raised black bar with its own lit top edge and its own
      // shadow, and the 1.8 mm division measured 19.6 mm on the render.
      front: 0.0004, back: 0.040,
      capBack: false,
      nu: 22, nv: 3,
    }),
  );
  // Full-height lens ribs: on the tailgate section the band is one moulding
  // divided into cells, and the rib runs through the red field as well as the
  // signal band.
  for (const x of spec.ribs ?? []) {
    structure.push(
      slab({
        outline: {
          ...lensArea,
          xInner: () => x - RIB, xOuter: () => x + RIB,
          radiusInner: RIB * 0.5, radiusOuter: RIB * 0.5,
        },
        zAt: FACE, facing: FACING,
        front: 0.0004, back: 0.040,
        capBack: false,
        nu: 3, nv: 16,
      }),
    );
  }

  // --- red field -----------------------------------------------------------
  {
    const fit = lower;
    const b = extent(fit);
    bowls.push(
      bowl({
        cx: b.cx, cy: b.cy, halfW: b.halfW - 0.002, halfH: b.halfH - 0.002,
        zAt: FACE, rimDepth: 0.011,
        facing: FACING, depth: 0.040, corner: 4.6,
        fit: inset(fit, 0.0015), nu: 32, nv: 20,
      }),
    );
    redLensGeo.push(...lensCell(fit));
    redGlow.push(dish(fit, b));
    // Reflex reflector: the little moulded prism panel at the foot of the
    // field that lights up in another car's headlamps.
    structure.push(
      slab({
        outline: { ...sliceY(fit, fit.yLo + 0.004, fit.yLo + 0.026), radiusInner: 0.004, radiusOuter: 0.004 },
        zAt: FACE, facing: FACING,
        front: 0.0095, back: 0.013,
        nu: 22, nv: 3,
      }),
    );
  }

  // --- signal band ---------------------------------------------------------
  for (const s of spec.segments) {
    // The cells **butt**: the glass runs right up to the rib line, and what
    // divides them is the pair of radiused edges meeting there, not a gap with
    // black showing through it. Holding each cell RIB short of the line left
    // the rib's full width bare, and a 2.2 mm rib plus two 1.5 mm corner radii
    // measured 6.7 mm of black on the render against about 2 mm on the
    // photograph. The slab behind is still there, as a backstop rather than as
    // a visible member.
    const fit = sliceX(upper, s.x0, s.x1, CELL_R);
    const b = extent(fit);
    // One bowl behind the whole cell. The reversing window gets its own,
    // shallower one, which sits in front of this and hides it.
    bowls.push(
      bowl({
        cx: b.cx, cy: b.cy, halfW: b.halfW - 0.002, halfH: b.halfH - 0.002,
        zAt: FACE, rimDepth: 0.011,
        facing: FACING, depth: 0.034, corner: 4.6,
        fit: inset(fit, 0.0015), nu: 22, nv: 16,
      }),
    );

    if (!s.window) {
      amberLensGeo.push(...lensCell(fit));
      if (s.kind === 'indicator') amberGlow.push(dish(fit, b));
      continue;
    }

    // Amber is the cell minus the window: a strip either side of it and one
    // above and below. Built as four pieces rather than one lens with a hole
    // so the clear window can sit in its own rebate with its own optic.
    const win = reverseWindow(fit);
    for (const part of aroundWindow(fit, win)) {
      amberLensGeo.push(...lensCell(part));
      if (s.kind === 'indicator') amberGlow.push(dish(part, extent(part)));
    }
    structure.push(
      frame({
        outline: inset(win, -WIN_RIB),
        zAt: FACE, facing: FACING,
        // Sits a shade *behind* the lens face, so the window reads as a thin
        // dark groove in the amber rather than a raised chrome picture frame.
        // Scaled on WIN_RIB: the last step has to land just short of the
        // window's own edge, or the groove eats into the clear lens.
        profile: [
          [0.0, 0.0022],
          [WIN_RIB * 0.8, 0.0020],
          [WIN_RIB * 1.95, 0.030],
        ],
        ns: 48,
      }),
    );
    const wb = extent(win);
    bowls.push(
      bowl({
        cx: wb.cx, cy: wb.cy, halfW: wb.halfW - 0.002, halfH: wb.halfH - 0.002,
        zAt: FACE, rimDepth: 0.010,
        facing: FACING, depth: 0.026, corner: 4.6,
        fit: inset(win, 0.0015), nu: 18, nv: 14,
      }),
    );
    clearLensGeo.push(...lensCell(win));
    clearGlow.push(dish(win, wb));
  }

  // --- assembly ------------------------------------------------------------
  const add = (name: string, geo: THREE.BufferGeometry | null, mat: THREE.Material): void => {
    if (!geo) return;
    const mesh = new THREE.Mesh(bothSides(geo), mat);
    mesh.name = name;
    group.add(mesh);
  };

  add(`${spec.name}Body`, merge(structure), spec.black);
  add(`${spec.name}Seal`, seal, spec.rubber);
  add(`${spec.name}Reflector`, merge(bowls), spec.reflectorMat);
  add(`${spec.name}Red`, merge(redLensGeo), spec.redLens);
  add(`${spec.name}Amber`, merge(amberLensGeo), spec.amberLens);
  add(`${spec.name}Clear`, merge(clearLensGeo), spec.clearLens);

  // Filament white, not red: the dye is in the lens, and tinting the blaze as
  // well runs the light through it twice and kills the glow. The hot shift is
  // a *whiter* filament under stop current, which is what reads as brakes on.
  const tail = glows.make(bothSides(merge(redGlow)!), {
    color: FILAMENT,
    peak: 3.4,
    hotColor: 0xfffaf0,
  });
  tail.mesh.name = `${spec.name}TailGlow`;
  group.add(tail.mesh);

  let indicator: [Glow, Glow] | null = null;
  const amberRight = merge(amberGlow);
  if (amberRight) {
    indicator = [
      glows.make(mirrored(amberRight), { color: FILAMENT, peak: 2.6 }),
      glows.make(amberRight, { color: FILAMENT, peak: 2.6 }),
    ];
    indicator[0].mesh.name = `${spec.name}IndicatorL`;
    indicator[1].mesh.name = `${spec.name}IndicatorR`;
    group.add(indicator[0].mesh, indicator[1].mesh);
  }

  let reverse: Glow | null = null;
  const clear = merge(clearGlow);
  if (clear) {
    reverse = glows.make(bothSides(clear), { color: LIGHTS.reverseColor, peak: 2.6 });
    reverse.mesh.name = `${spec.name}ReverseGlow`;
    group.add(reverse.mesh);
  }

  return { group, tail, reverse, indicator };
}

/** The clear window, centred in the cell and inset into its amber. */
function reverseWindow(cell: Outline): Outline {
  const s = { y: 0, xLo: 0, xHi: 0 };
  spanAt(cell, 0.5, s);
  const cx = (s.xLo + s.xHi) / 2;
  const halfW = (SPAN * REVERSE_WIDTH) / 2;
  const cy = (cell.yLo + cell.yHi) / 2;
  const halfH = ((cell.yHi - cell.yLo) * REVERSE_RISE) / 2;
  return sliceY(sliceX(cell, cx - halfW, cx + halfW, CELL_R), cy - halfH, cy + halfH, CELL_R);
}

/** The four amber strips left once the window is cut out of a cell. */
function aroundWindow(cell: Outline, win: Outline): Outline[] {
  const s = { y: 0, xLo: 0, xHi: 0 };
  const mid = spanAt(win, 0.5, s);
  const xLo = mid.xLo;
  const xHi = mid.xHi;
  const middle = sliceX(cell, xLo - WIN_RIB, xHi + WIN_RIB, CELL_R);
  return [
    sliceX(cell, 0, xLo - WIN_RIB, CELL_R),
    sliceX(cell, xHi + WIN_RIB, 10, CELL_R),
    sliceY(middle, win.yHi + WIN_RIB, 10, CELL_R),
    sliceY(middle, 0, win.yLo - WIN_RIB, CELL_R),
  ];
}

/**
 * One lens cell: a smooth raised rim around a recessed fluted field.
 *
 * The rim is the biggest single thing the cluster was missing, and it is not
 * subtle on the part — every cell of every reference frame has a broad,
 * *unfluted*, distinctly brighter border, and it is what makes the band read
 * as five moulded cells instead of one continuous screen. Without it the
 * waffle runs edge to edge and butts straight into the next cell's waffle,
 * which is most of why the render still read as a halftone after the pitch and
 * the depth were right.
 *
 * Width measured on the dead-on frame at 3.38 px/mm after upscaling: 32 px
 * across the top rim of the centre amber cell and 35 px down its inboard one,
 * so 9.5 and 10.4 mm. Both come back as one ring here because the moulding is
 * one tool.
 *
 * Emitted into the same geometry list as the field, so it merges into the same
 * mesh and costs no draw call. It is the same dye and the same material, so it
 * is still fluted in principle — but it is a *ramp*, and on a ramp the facet
 * normal is swung far enough off the field's that the blaze reads as a
 * continuous lit edge rather than as a grid, which is what the reference
 * shows. Giving it its own smooth material would be more literal and would
 * cost three more draws on a scene already over its budget.
 */
const CELL_BEVEL = 0.0100;
/** Where the field's own face sits, in from FACE. Larger is deeper. */
const CELL_FACE = 0.0016;

function lensCell(o: Outline): THREE.BufferGeometry[] {
  return [
    frame({
      outline: o,
      zAt: FACE, facing: FACING,
      // Rolled back at the cut edge, crested proud a third of the way in,
      // then down to meet the field. The crest is what catches the sky.
      profile: [
        [0.0, CELL_FACE + 0.0012],
        [CELL_BEVEL * 0.34, 0.0007],
        [CELL_BEVEL, CELL_FACE],
      ],
      ns: 64,
    }),
    lensSlab(inset(o, CELL_BEVEL)),
  ];
}

function lensSlab(o: Outline): THREE.BufferGeometry {
  return slab({
    outline: o,
    zAt: FACE, facing: FACING,
    front: CELL_FACE, back: CELL_FACE + LENS_BODY,
    // A 1.4 mm crown over a 300 mm cell is a shallow convex mirror, and it
    // gathered the whole sky into one blown highlight swept across the middle
    // of the glass — a smear the reference close-up does not have anywhere.
    // The real face is flat within a cell and only follows the body between
    // them.
    crown: 0.0005,
    nu: 18, nv: 10,
  });
}

interface Extent { cx: number; cy: number; halfW: number; halfH: number }

function extent(o: Outline, samples = 24): Extent {
  const s = { y: 0, xLo: 0, xHi: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (let i = 0; i <= samples; i++) {
    spanAt(o, i / samples, s);
    if (s.xHi - s.xLo < 1e-4) continue;
    lo = Math.min(lo, s.xLo);
    hi = Math.max(hi, s.xHi);
    n++;
  }
  if (n === 0) return { cx: 0, cy: 0, halfW: 0.001, halfH: 0.001 };
  return {
    cx: (lo + hi) / 2,
    cy: (o.yLo + o.yHi) / 2,
    halfW: Math.max((hi - lo) / 2, 0.002),
    halfH: Math.max((o.yHi - o.yLo) / 2, 0.002),
  };
}

function dish(fit: Outline, b: Extent): THREE.BufferGeometry {
  return bowl({
    cx: b.cx, cy: b.cy,
    halfW: b.halfW - 0.0035, halfH: b.halfH - 0.0035,
    zAt: FACE, rimDepth: 0.015,
    facing: FACING, depth: -0.008, corner: 4.6,
    fit, nu: 18, nv: 12,
  });
}

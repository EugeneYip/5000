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

const SEAL = 0.003;
const SURROUND = 0.0035;
const LENS_BODY = 0.0042;
const RIB = 0.004;
/** Gap between the reversing window and the amber around it. */
const WIN_RIB = 0.0035;

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
  const redLens = ctx.materials.lens(LIGHTS.tailColor, { prismatic: true });
  const amberLens = ctx.materials.lens(LIGHTS.indicatorColor, { prismatic: true });
  const clearLens = ctx.materials.lens(0xeef2fb, { prismatic: true });

  const mats = { black, rubber, reflectorMat, redLens, amberLens, clearLens };

  const gap = QUALITY.panelGap / 2;
  const outerShape = sliceX(cluster, SPLIT + gap, 10, 0.006);
  const innerShape = sliceX(cluster, 0, SPLIT - gap, 0.006);
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
  const lower = sliceY(lensArea, 0, BAND - RIB);
  const upper = sliceY(lensArea, BAND + RIB, 10);

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
      profile: [
        [0.0, 0.0025],
        [0.002, -0.0015],
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
      outline: inset(spec.shape, SEAL + 0.002),
      zAt: FACE, facing: FACING,
      front: 0.010, back: 0.068,
      capFront: false,
      nu: 18, nv: 12,
    }),
  );
  // The straight horizontal division between the signal band and the red field.
  structure.push(
    slab({
      outline: { ...lensArea, yLo: BAND - RIB, yHi: BAND + RIB, radiusInner: 0.0015, radiusOuter: 0.0015 },
      zAt: FACE, facing: FACING,
      front: 0.0008, back: 0.040,
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
        outline: { ...lensArea, xInner: () => x - RIB, xOuter: () => x + RIB, radiusInner: 0.0015, radiusOuter: 0.0015 },
        zAt: FACE, facing: FACING,
        front: 0.0008, back: 0.040,
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
    redLensGeo.push(lensSlab(fit));
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
    const lo = s.x0 === 0 ? 0 : s.x0 + RIB;
    const hi = s.x1 === 10 ? 10 : s.x1 - RIB;
    const fit = sliceX(upper, lo, hi, 0.005);
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
      amberLensGeo.push(lensSlab(fit));
      if (s.kind === 'indicator') amberGlow.push(dish(fit, b));
      continue;
    }

    // Amber is the cell minus the window: a strip either side of it and one
    // above and below. Built as four pieces rather than one lens with a hole
    // so the clear window can sit in its own rebate with its own optic.
    const win = reverseWindow(fit);
    for (const part of aroundWindow(fit, win)) {
      amberLensGeo.push(lensSlab(part));
      if (s.kind === 'indicator') amberGlow.push(dish(part, extent(part)));
    }
    structure.push(
      frame({
        outline: inset(win, -WIN_RIB),
        zAt: FACE, facing: FACING,
        // Sits a shade *behind* the lens face, so the window reads as a thin
        // dark groove in the amber rather than a raised chrome picture frame.
        profile: [
          [0.0, 0.0022],
          [0.0028, 0.0020],
          [0.0034, 0.030],
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
    clearLensGeo.push(lensSlab(win));
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
  return sliceY(sliceX(cell, cx - halfW, cx + halfW, 0.004), cy - halfH, cy + halfH, 0.004);
}

/** The four amber strips left once the window is cut out of a cell. */
function aroundWindow(cell: Outline, win: Outline): Outline[] {
  const s = { y: 0, xLo: 0, xHi: 0 };
  const mid = spanAt(win, 0.5, s);
  const xLo = mid.xLo;
  const xHi = mid.xHi;
  const middle = sliceX(cell, xLo - WIN_RIB, xHi + WIN_RIB, 0.004);
  return [
    sliceX(cell, 0, xLo - WIN_RIB, 0.004),
    sliceX(cell, xHi + WIN_RIB, 10, 0.004),
    sliceY(middle, win.yHi + WIN_RIB, 10, 0.003),
    sliceY(middle, 0, win.yLo - WIN_RIB, 0.003),
  ];
}

function lensSlab(o: Outline): THREE.BufferGeometry {
  return slab({
    outline: o,
    zAt: FACE, facing: FACING,
    front: 0.0016, back: 0.0016 + LENS_BODY,
    crown: 0.0014,
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

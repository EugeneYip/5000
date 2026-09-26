/**
 * Rear lamp cluster — Avant, and split across the tailgate shutline.
 *
 * `docs/REFERENCE-VEHICLE.md` §6.4 settles the wagon's arrangement, and it is
 * not the saloon's. The band on each side is **two separate lamps** that read
 * as one:
 *
 *   **outer section, on the rear quarter panel** — two amber segments over a
 *   full-width red field;
 *   **inner section, on the tailgate** — a clear reversing lamp and an amber
 *   segment over a full-width red field.
 *
 * So the inner section travels with the tailgate when it opens, and is
 * therefore built into its own group for `lights.ts` to re-parent onto the
 * body stream's `tailgatePanel`.
 *
 * The lower red field is 55 % of the unit's height and the division between
 * the bands is a straight horizontal line running the full width. The outboard
 * corner is rounded and follows the body, which on this tail means it wraps
 * about 90 mm forward — so every face here is built on `rearFaceZ` rather than
 * on a plane.
 *
 * The red must glow with depth rather than read as a red sticker, and that is
 * almost entirely a question of what is *behind* it: a stippled aluminium bowl,
 * seen through 4 mm of dyed acrylic with prisms moulded into its back face.
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

const SEAL = 0.005;
const SURROUND = 0.008;
const LENS_BODY = 0.0042;
/** Upper (signal) band is 45 % of the unit's height; the red field is 55 %. */
const BAND = R.lampBottomY + (R.lampTopY - R.lampBottomY) * 0.55;
/** Where the tailgate shutline crosses the band. */
const SPLIT = R.lampInnerX + (R.lampOuterX - R.lampInnerX) * 0.42;
const RIB = 0.005;

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

  const gap = QUALITY.panelGap / 2;
  const outerShape = sliceX(cluster, SPLIT + gap, 10, 0.006);
  const innerShape = sliceX(cluster, 0, SPLIT - gap, 0.006);
  // sliceX flattens the outline's own corner radii, so put them back where the
  // section still meets the outside of the cluster.
  outerShape.radiusOuter = cluster.radiusOuter;
  innerShape.radiusInner = cluster.radiusInner;

  const outerMid = (SPLIT + gap + R.lampOuterX) / 2;
  const outer = section(glows, {
    name: 'taillampOuter',
    shape: outerShape,
    segments: [
      // outboard → inboard. Both ambers flash: the outboard one is the wrap
      // round the body corner, the inboard one the indicator proper.
      { kind: 'indicator', x0: outerMid, x1: 10 },
      { kind: 'indicator', x0: 0, x1: outerMid },
    ],
    black, rubber, reflectorMat, redLens, amberLens, clearLens,
  });

  // The reversing lamp is "roughly square" — the signal band is 132 mm tall.
  const clearWidth = 0.115;
  const inner = section(glows, {
    name: 'taillampInner',
    shape: innerShape,
    segments: [
      { kind: 'reverse', x0: SPLIT - clearWidth, x1: 10 },
      { kind: 'indicator', x0: 0, x1: SPLIT - clearWidth },
    ],
    black, rubber, reflectorMat, redLens, amberLens, clearLens,
  });

  const sy = (R.lampBottomY + BAND) / 2;
  const sx = (SPLIT + R.lampOuterX) / 2;
  // Well clear of the lens: a point source with inverse-square falloff sitting
  // on the lamp face puts hundreds of units onto its own glass.
  const sz = FACE(sx, sy) + FACING * 0.30;

  return {
    outer: outer.group,
    inner: inner.group,
    tail: [outer.tail, inner.tail],
    reverse: inner.reverse ? [inner.reverse] : [],
    indicator: [
      [outer.indicator[0], inner.indicator[0]],
      [outer.indicator[1], inner.indicator[1]],
    ],
    spill: [new THREE.Vector3(-sx, sy, sz), new THREE.Vector3(sx, sy, sz)],
  };
}

// ---------------------------------------------------------------------------

type SegmentKind = 'indicator' | 'reverse';

interface SegmentSpec {
  kind: SegmentKind;
  x0: number;
  x1: number;
}

interface SectionSpec {
  name: string;
  shape: Outline;
  /** Upper-band segments, outboard → inboard. */
  segments: SegmentSpec[];
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
  indicator: [Glow, Glow];
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
  const perSide: Record<SegmentKind, THREE.BufferGeometry[]> = { indicator: [], reverse: [] };
  for (let i = 0; i < spec.segments.length; i++) {
    const s = spec.segments[i];
    const lo = s.x0 === 0 ? 0 : s.x0 + RIB;
    const hi = s.x1 === 10 ? 10 : s.x1 - RIB;
    const fit = sliceX(upper, lo, hi, 0.005);
    if (i > 0) {
      structure.push(
        slab({
          outline: { ...upper, xInner: () => s.x1 - RIB, xOuter: () => s.x1 + RIB, radiusInner: 0.0015, radiusOuter: 0.0015 },
          zAt: FACE, facing: FACING,
          front: 0.0008, back: 0.038,
          capBack: false,
          nu: 3, nv: 8,
        }),
      );
    }
    const b = extent(fit);
    bowls.push(
      bowl({
        cx: b.cx, cy: b.cy, halfW: b.halfW - 0.002, halfH: b.halfH - 0.002,
        zAt: FACE, rimDepth: 0.011,
        facing: FACING, depth: 0.034, corner: 4.6,
        fit: inset(fit, 0.0015), nu: 22, nv: 16,
      }),
    );
    (s.kind === 'reverse' ? clearLensGeo : amberLensGeo).push(lensSlab(fit));
    perSide[s.kind].push(dish(fit, b));
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

  const amberRight = merge(perSide.indicator)!;
  const indicator: [Glow, Glow] = [
    glows.make(mirrored(amberRight), { color: FILAMENT, peak: 2.6 }),
    glows.make(amberRight, { color: FILAMENT, peak: 2.6 }),
  ];
  indicator[0].mesh.name = `${spec.name}IndicatorL`;
  indicator[1].mesh.name = `${spec.name}IndicatorR`;
  group.add(indicator[0].mesh, indicator[1].mesh);

  let reverse: Glow | null = null;
  if (perSide.reverse.length > 0) {
    reverse = glows.make(bothSides(merge(perSide.reverse)!), { color: LIGHTS.reverseColor, peak: 2.6 });
    reverse.mesh.name = `${spec.name}ReverseGlow`;
    group.add(reverse.mesh);
  }

  return { group, tail, reverse, indicator };
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

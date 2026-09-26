/**
 * Front composite headlamp — US specification.
 *
 * Resolved off 2048 px photography of a MY1988 North-American Avant
 * (`docs/REFERENCE-VEHICLE.md` §6.2) and built to that reading exactly:
 *
 *   **one flush housing per side**, under **one continuous chrome bezel**,
 *   containing **two rectangular reflector chambers side by side** behind a
 *   single clear horizontally-fluted lens, with an **amber section outboard**
 *   of them in the same housing, its outer edge following the wing's corner
 *   radius.
 *
 * The thing that makes or breaks it is what the lamp looks like **switched
 * off**, in daylight, which is how it appears in almost every frame. An unlit
 * lamp is not a dark rectangle: it is a deep box whose far wall is a pebbled
 * aluminium bowl, and the bowl is what you see. So the reflectors are real
 * paraboloids sunk 52 mm behind the lens, the bulbs and their shields sit in
 * front of them where you can see them through the glass, and the lens is
 * genuinely transmissive rather than a coloured plate.
 *
 * The aperture's outboard edge is not the hardpoint's nominal 850 mm: the nose
 * face has already begun to roll into the wing at that height, so the outline
 * is clamped to the body's own half-width. That clamp is what produces the
 * wrapped, chamfered top-outboard corner the real lamp has.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS } from '@/spec';
import { noseFaceZ, noseHalfWidth } from '@/car/body/panels';
import type { BuildContext } from '@/types';
import {
  bowl, bothSides, frame, filament, inset, merge, mirrored, slab, sliceX, spanAt, tubeZ,
  type Outline,
} from './shapes';
import { FILAMENT, fluteHorizontal, type Glow, type GlowFactory } from './optics';
import type { BeamGeometry } from './beam';

const F = HP.front;
const FACE = noseFaceZ;
const FACING = 1 as const;

/** Rubber seal between the lamp and the wing pressing. */
const SEAL = 0.006;
/** Bezel width across its visible face. */
const BEZEL = 0.013;
/** Acrylic body thickness. Matches the lens shader's own optical thickness. */
const LENS_BODY = 0.0042;

/** The aperture the body pressing leaves for the lamp. */
const aperture: Outline = {
  yLo: F.lampBottomY,
  yHi: F.lampTopY,
  xInner: () => F.lampInnerX,
  xOuter: (y) => Math.min(F.lampOuterX, noseHalfWidth(y) - 0.004),
  radiusInner: 0.010,
  radiusOuter: 0.028,
};

const lensOutline = inset(aperture, SEAL + BEZEL);
const AMBER_SPLIT = F.indicatorInnerX;
const DIVIDER = 0.0045;

/** Vertical division between the two clear chambers. */
const CHAMBER_SPLIT = (lensOutline.xInner(0.78) + (AMBER_SPLIT - DIVIDER)) / 2;

export interface HeadlampSet {
  group: THREE.Group;
  /** The two clear chambers, both sides — they never run independently. */
  main: Glow;
  /** Amber sections, left then right. */
  indicator: [Glow, Glow];
  emitters: BeamGeometry[];
}

export function buildHeadlamps(ctx: BuildContext, glows: GlowFactory): HeadlampSet {
  const group = new THREE.Group();
  group.name = 'headlamps';

  const chrome = ctx.materials.chrome({ roughness: 0.055 });
  const black = ctx.materials.blackTrim();
  const rubber = ctx.materials.rubber({ roughness: 0.95 });
  const reflectorMat = ctx.materials.reflector();
  const clearLens = ctx.materials.lens(0xf4f7fc, { prismatic: true });
  const amberLens = ctx.materials.lens(LIGHTS.indicatorColor, { prismatic: true });
  // A bulb envelope has to be OPAQUE. Three renders transmissive surfaces
  // against the opaque back buffer, so anything transparent inside the lens is
  // simply absent when you look through it — and the point of the whole
  // exercise is that you can see the bulb in there. A near-black emissive with
  // the library's rim lift reads as glass and costs nothing when unlit.
  const coldBulb = ctx.materials.emissive(0xe6ebf4, 0.06);
  const coldFilament = ctx.materials.emissive(0xffe6b4, 0.4);

  // --- bezel and seal ------------------------------------------------------
  // The bezel's crest stands 4 mm proud of the skin, then rolls back and sinks
  // into the aperture: one bright line round the whole lamp, which is what
  // ties it to the grille's frame across the nose.
  const bezelGeo = frame({
    outline: inset(aperture, SEAL),
    zAt: FACE, facing: FACING,
    profile: [
      [0.0, 0.004],
      [0.003, -0.0035],
      [BEZEL - 0.003, -0.0028],
      [BEZEL, 0.004],
      [BEZEL + 0.002, 0.014],
    ],
  });
  const sealGeo = frame({
    outline: aperture,
    zAt: FACE, facing: FACING,
    profile: [
      [-0.002, 0.001],
      [0.002, 0.005],
      [SEAL, 0.009],
      [SEAL + 0.001, 0.030],
    ],
  });

  // --- housing -------------------------------------------------------------
  // Closes the aperture off at `Z.lampBack`, the wall the body pressing leaves.
  const housingGeo = slab({
    outline: inset(aperture, SEAL + 0.002),
    zAt: FACE, facing: FACING,
    // 78 mm keeps the back wall just clear of `Z.lampBack`, the wall the wing
    // pressing already leaves, even where the nose face has rolled 14 mm back.
    front: 0.012,
    back: 0.078,
    capFront: false,
    nu: 20, nv: 12,
  });

  // --- chambers ------------------------------------------------------------
  const chambers = [
    { x0: lensOutline.xInner(0.78), x1: CHAMBER_SPLIT - DIVIDER, amber: false },
    { x0: CHAMBER_SPLIT + DIVIDER, x1: AMBER_SPLIT - DIVIDER, amber: false },
    { x0: AMBER_SPLIT + DIVIDER, x1: 10, amber: true },
  ];

  const bowls: THREE.BufferGeometry[] = [];
  const envelopes: THREE.BufferGeometry[] = [];
  const shields: THREE.BufferGeometry[] = [];
  const coils: THREE.BufferGeometry[] = [];
  const mainGlow: THREE.BufferGeometry[] = [];
  const amberGlow: THREE.BufferGeometry[] = [];
  const focus: THREE.Vector3[] = [];

  for (const c of chambers) {
    const fit = sliceX(lensOutline, c.x0, c.x1, 0.006);
    const box = measure(fit);
    const RIM_DEPTH = 0.0135;
    const rimZ = FACE(box.cx, box.cy) - RIM_DEPTH;
    const depth = 0.052;
    const halfW = box.halfW - 0.002;

    bowls.push(
      bowl({
        cx: box.cx, cy: box.cy,
        halfW, halfH: box.halfH - 0.002,
        zAt: FACE, rimDepth: RIM_DEPTH, facing: FACING, depth,
        corner: 4.4, flat: c.amber ? 0.16 : 0.13,
        fit: inset(fit, 0.0015),
        nu: 30, nv: 20,
      }),
    );

    // A paraboloid r² = 4fζ: with the rim half-width as r and the bowl's own
    // depth as ζ, the focus falls f = R²/4D forward of the vertex. Putting the
    // filament anywhere else is what makes a modelled lamp look like a torch.
    const f = (halfW * halfW) / (4 * depth);
    const vertexZ = rimZ - depth;
    const fz = vertexZ + f;
    focus.push(new THREE.Vector3(box.cx, box.cy, fz));

    // H4-style capsule: glass envelope, coiled filament at the focus, and the
    // little cup shield under it that makes the flat top of a dipped beam.
    const glass = tubeZ(0.0075, 0.0072, 0.038, 18, false);
    glass.translate(box.cx, box.cy, fz - 0.010);
    envelopes.push(glass);

    // The black-painted dome on the end of an H4. It exists to stop the
    // filament throwing light straight down the axis, and against a bright
    // bowl it is the one part of the bulb you can actually pick out through
    // the lens — a small dark disc dead centre of each chamber.
    const tip = tubeZ(0.0092, 0.0074, 0.006, 18, false);
    tip.translate(box.cx, box.cy, fz + 0.012);
    shields.push(tip);

    const coil = filament(0.0062, 0.0016, 4.5, 0.00045);
    coil.translate(box.cx, box.cy, fz);
    coils.push(coil);

    if (!c.amber) {
      const shield = tubeZ(0.0042, 0.0042, 0.010, 14, true);
      shield.translate(box.cx, box.cy - 0.0035, fz + 0.001);
      shields.push(shield);
    }
    const collar = tubeZ(0.0105, 0.0088, 0.012, 16, false);
    collar.translate(box.cx, box.cy, vertexZ - 0.004);
    shields.push(collar);

    // The blaze: a shallow dish filling the chamber, hidden while the lamp is
    // off so nothing masks the reflector, and bright enough when lit that the
    // bloom pass takes it.
    const dish = bowl({
      cx: box.cx, cy: box.cy,
      halfW: box.halfW - 0.0035, halfH: box.halfH - 0.0035,
      zAt: FACE, rimDepth: 0.0175, facing: FACING, depth: -0.010,
      corner: 4.4, fit, nu: 18, nv: 12,
    });
    (c.amber ? amberGlow : mainGlow).push(dish);
  }

  // --- lenses and dividers -------------------------------------------------
  const clearGeo = slab({
    outline: sliceX(lensOutline, 0, AMBER_SPLIT - DIVIDER, 0.007),
    zAt: FACE, facing: FACING,
    front: 0.0018, back: 0.0018 + LENS_BODY,
    crown: 0.0016,
    nu: 24, nv: 10,
  });
  const amberGeo = slab({
    outline: sliceX(lensOutline, AMBER_SPLIT + DIVIDER, 10, 0.007),
    zAt: FACE, facing: FACING,
    front: 0.0018, back: 0.0018 + LENS_BODY,
    crown: 0.0014,
    nu: 14, nv: 10,
  });

  const dividerGeo = merge([
    divider(CHAMBER_SPLIT, 0.010, 0.048),
    divider(AMBER_SPLIT, 0.013, 0.050),
  ])!;

  // --- assembly ------------------------------------------------------------
  const add = (name: string, geo: THREE.BufferGeometry | null, mat: THREE.Material): void => {
    if (!geo) return;
    const mesh = new THREE.Mesh(bothSides(geo), mat);
    mesh.name = name;
    group.add(mesh);
  };

  add('headlampBezel', bezelGeo, chrome);
  add('headlampSeal', sealGeo, rubber);
  add('headlampHousing', housingGeo, black);
  add('headlampReflector', merge(bowls), reflectorMat);
  add('headlampDivider', dividerGeo, chrome);
  add('headlampShield', merge(shields), black);
  add('headlampBulb', merge(envelopes), coldBulb);
  add('headlampFilament', merge(coils), coldFilament);

  const clearMesh = new THREE.Mesh(bothSides(clearGeo), clearLens);
  clearMesh.name = 'headlampLens';
  fluteHorizontal(clearMesh.geometry, clearMesh);
  group.add(clearMesh);

  const amberMesh = new THREE.Mesh(bothSides(amberGeo), amberLens);
  amberMesh.name = 'headlampAmberLens';
  fluteHorizontal(amberMesh.geometry, amberMesh);
  group.add(amberMesh);

  // --- driven surfaces -----------------------------------------------------
  // 3.4, not 10: a 1988 halogen is warm and not very bright, and an emissive
  // pushed until it clips is how a period lamp ends up looking like an LED.
  // The bloom pass carries the apparent brightness from here.
  const main = glows.make(bothSides(merge(mainGlow)!), {
    color: LIGHTS.headlampColor,
    peak: 2.0,
  });
  main.mesh.name = 'headlampGlow';
  group.add(main.mesh);

  const amberRight = merge(amberGlow)!;
  const indicator: [Glow, Glow] = [
    glows.make(mirrored(amberRight), { color: FILAMENT, peak: 2.3 }),
    glows.make(amberRight, { color: FILAMENT, peak: 2.3 }),
  ];
  indicator[0].mesh.name = 'headlampIndicatorL';
  indicator[1].mesh.name = 'headlampIndicatorR';
  group.add(indicator[0].mesh, indicator[1].mesh);

  // --- beam emitters -------------------------------------------------------
  // One emitter per side, between the two clear chambers — but placed a
  // centimetre *in front of* the lens rather than at the filament. A
  // spotlight is a point source with inverse-square falloff, so an emitter at
  // the real focus lands 14 000 units of light on its own lens 30 mm away and
  // blows the whole assembly to white. Ahead of the glass, the lamp lights the
  // road and the bumper and leaves its own optics to the emissives.
  const cx = (focus[0].x + focus[1].x) / 2;
  const cy = (focus[0].y + focus[1].y) / 2;
  const cz = FACE(cx, cy) + 0.012;
  const emitters: BeamGeometry[] = [
    { origin: new THREE.Vector3(-cx, cy, cz), dir: new THREE.Vector3(0, 0, 1) },
    { origin: new THREE.Vector3(cx, cy, cz), dir: new THREE.Vector3(0, 0, 1) },
  ];

  return { group, main, indicator, emitters };
}

// ---------------------------------------------------------------------------

function divider(x: number, width: number, depth: number): THREE.BufferGeometry {
  return slab({
    outline: {
      ...lensOutline,
      xInner: () => x - width / 2,
      xOuter: () => x + width / 2,
      radiusInner: 0.002,
      radiusOuter: 0.002,
    },
    zAt: FACE, facing: FACING,
    front: 0.0012, back: depth,
    nu: 3, nv: 12,
    capBack: false,
  });
}

interface Box { cx: number; cy: number; halfW: number; halfH: number }

/** Largest usable rectangle inside an outline, for sizing a reflector. */
function measure(o: Outline, samples = 24): Box {
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
  // The widest span, not the mean: a chamber under a wing that rolls away is a
  // wedge, and the bowl is meant to fill it and be trimmed by its own `fit`
  // clamp rather than shrink to an ellipse floating in the middle of it.
  return {
    cx: (lo + hi) / 2,
    cy: (o.yLo + o.yHi) / 2,
    halfW: Math.max((hi - lo) / 2, 0.002),
    halfH: Math.max((o.yHi - o.yLo) / 2, 0.002),
  };
}

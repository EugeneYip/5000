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
/**
 * Bezel width across its visible face.
 *
 * 13 mm ate 26 mm off a 168 mm aperture — 15 % of the glass, and the glass is
 * the brightest element on the car. In the reference frame the bright strips
 * above and below the lamp are thin and the glass fills nearly the whole hole.
 */
const BEZEL = 0.009;
/** Acrylic body thickness. Matches the lens shader's own optical thickness. */
const LENS_BODY = 0.0042;

/**
 * The aperture the body pressing leaves for the lamp.
 *
 * **It runs to the body's own silhouette, not to `HP.front.lampOuterX`.** The
 * hardpoint's 779 mm is where the *clear* lamp ends; measured on the reference
 * photograph the amber corner lens butts straight onto the headlamp glass and
 * carries on to the body edge at ~850 mm, wrapping round onto the wing face.
 * The 71 mm between the two is indicator, not paint. `src/car/body.ts` now
 * carries a `lampSideR` panel across that band — it is the sheet metal behind
 * the indicator, which is right — and this outline is what covers it. Clamped
 * to the hardpoint instead, that panel renders as a bright painted strip
 * outboard of the lamp that the real car does not have.
 */
const aperture: Outline = {
  yLo: F.lampBottomY,
  yHi: F.lampTopY,
  xInner: () => F.lampInnerX,
  xOuter: (y) => Math.max(noseHalfWidth(y) - 0.004, F.lampOuterX),
  radiusInner: 0.010,
  radiusOuter: 0.028,
};

/**
 * The glass: inset by the seal and the bezel where there IS a bezel — top,
 * bottom and inboard — and by the seal alone at the outboard end, because
 * there is no bezel there.
 *
 * Inset uniformly, the amber stopped 19 mm short of the body corner and what
 * showed in the gap was the housing's own wall. That reads as a bright
 * vertical bar closing the cluster off, which is the single thing that most
 * makes the nose look like jewellery rather than like the car.
 */
const lensOutline: Outline = {
  yLo: aperture.yLo + SEAL + BEZEL,
  yHi: aperture.yHi - SEAL - BEZEL,
  xInner: (y) => aperture.xInner(y) + SEAL + BEZEL,
  xOuter: (y) => aperture.xOuter(y) - SEAL,
  radiusInner: Math.max((aperture.radiusInner ?? 0) - SEAL - BEZEL, 0),
  radiusOuter: Math.max((aperture.radiusOuter ?? 0) - SEAL, 0),
};
const AMBER_SPLIT = F.indicatorInnerX;
/**
 * Half-width of the moulded wall between chambers.
 *
 * 4.5 mm read as a dark trench across the glass. The photograph's lamp is a
 * near-featureless sheet: the divisions are there, but as hairlines.
 */
const DIVIDER = 0.0026;

/**
 * How much bigger the reflector's own paraboloid is than the slot it is seen
 * through. Mostly vertical: the aperture is a letterbox and the optic is not.
 *
 * These are also what keeps the glass reading as ONE sheet. A paraboloid sized
 * to the slot puts its steep rim at the slot's edge and its vertex in the
 * middle, which is exactly the two-lobe, X-seamed look the reference frame
 * does not have; cropping the flat middle of a much larger optic does not.
 * `OPTIC_W` is bounded at ~1.34 by `f < depth` — beyond that the H4's envelope
 * comes out through the lens.
 */
const OPTIC_W = 1.3;
const OPTIC_H = 2.4;

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
  // **Water-clear.** The 0xf4f7fc it used to be is a 7 % tint, and the lens
  // shader charges for it twice — once in its own Beer–Lambert term and again
  // in the transmission volume's attenuation — over a path the prism valleys
  // lengthen by half as much again. That is 12-15 % off the brightest element
  // on the car, to model a tint moulded acrylic does not have. The faint green
  // people see in a headlamp lens is soda-lime *glass*, and this one is PMMA.
  const clearLens = ctx.materials.lens(0xffffff, { prismatic: true });
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
    // No bright leg at the outboard end. `perimeter` puts the outboard edge at
    // t 0.25-0.5; it fades out over the bottom-outboard corner and back in
    // over the top-outboard one, so the strip above the glass and the strip
    // below it each run out to the corner radius and stop, which is what the
    // photograph shows. The amber simply meets the body edge.
    fade: (t) => {
      const a = 1 - smoothBand(t, 0.205, 0.255);
      const b = smoothBand(t, 0.495, 0.545);
      return Math.min(a + b, 1);
    },
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
    // The optic is BIGGER than the hole you see it through, and much bigger
    // vertically: the reflector shell is a shape of revolution flanged out
    // behind the seal, and the aperture is a 130 mm letterbox cut across it.
    // Sizing the paraboloid to the slot instead made the slot's own edge the
    // rim, where the surface is steepest — so the top of the bowl mirrored the
    // road and the bottom mirrored the sky's edge, and the lamp rendered 198
    // at its top and 184 at its bottom against 230 through the middle. The
    // photograph is flat at 228-244 corner to corner. Cropping a larger, much
    // flatter paraboloid is what produces that.
    const halfW = (box.halfW - 0.0006) * OPTIC_W;
    const halfH = (box.halfH - 0.0006) * OPTIC_H;

    bowls.push(
      bowl({
        cx: box.cx, cy: box.cy,
        halfW, halfH,
        zAt: FACE, rimDepth: RIM_DEPTH, facing: FACING, depth,
        corner: 4.4, flat: c.amber ? 0.16 : 0.13,
        // The bowl is pulled out to the lens' own outline. The 1.5 mm it used
        // to stand back from it was a ring of housing showing through the
        // glass all the way round the aperture, and in the reference frame
        // there is no such ring: the optic runs to the seal.
        fit: inset(fit, 0.0004),
        nu: 30, nv: 22,
      }),
    );

    // A paraboloid r² = 4fζ: with the rim half-width as r and the bowl's own
    // depth as ζ, the focus falls f = R²/4D forward of the vertex. Putting the
    // filament anywhere else is what makes a modelled lamp look like a torch.
    //
    // `f < depth` is the condition for the filament to sit inside the bowl at
    // all, and it bounds `OPTIC_W`: at 1.45 the H4's envelope came out through
    // the lens.
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

  // Hairlines, not trenches. A 10 mm wall 48 mm deep behind a clear lens
  // reads as a dark slot right across the glass; on the reference frame the
  // chamber division is barely visible and the amber division is one bright
  // line. Both are still real walls — they just stop at the reflector rim
  // instead of running to the back of the housing, which is all a moulded
  // divider does anyway.
  const dividerGeo = merge([
    divider(CHAMBER_SPLIT, 0.0052, 0.014),
    divider(AMBER_SPLIT, 0.0072, 0.018),
  ])!;

  // --- assembly ------------------------------------------------------------
  const add = (name: string, geo: THREE.BufferGeometry | null, mat: THREE.Material): void => {
    if (!geo) return;
    const mesh = new THREE.Mesh(bothSides(geo), mat);
    mesh.name = name;
    group.add(mesh);
  };

  /**
   * **A clear lens does not cast a shadow.**
   *
   * `Car.build` runs a post-pass that turns `castShadow` on for every mesh a
   * builder produced unless it is marked `userData.noShadow`. `tidy()` in
   * `src/car/lights.ts` sets `castShadow = false` on the lamps and runs
   * *before* that pass, so the flag was put straight back — and the headlamp
   * lens, a solid 409 x 168 mm plate 13 mm in front of the reflector, was
   * writing itself into the sun's shadow map and blacking out its own bowl.
   *
   * That is why the unlit lamp read as a washed-out lens rather than a block
   * of reflected sun: the only light reaching the reflector was the IBL. In
   * the reference photograph the lamp is the brightest thing on the car at
   * 228–244 — that is direct sun, off the bowl, back out through the glass.
   *
   * `noShadow` is the documented opt-out and is the mechanism `tidy()` should
   * have used; the rest of the lamps still need the same fix in that file.
   */
  const noShadow = (o: THREE.Object3D): void => {
    o.traverse((n) => { n.userData.noShadow = true; });
  };

  add('headlampBezel', bezelGeo, chrome);
  add('headlampSeal', sealGeo, rubber);
  // **There is no black plastic inside a composite headlamp.** The housing is
  // a black moulding from outside, but every interior surface — the bowl, the
  // shelf around it, the wall between the chambers — is vacuum-aluminised in
  // one operation, because any absorbing surface in there is lost beam.
  //
  // Modelled in `blackTrim` and mirror `chrome`, they were both dark: the
  // bowl is a mirror and what a mirror shows is whatever is inside the lamp,
  // so a black shelf and a mirror-polished divider fed the bowl its own dark
  // interior and the aperture came out at 0.89 of the licence plate's value.
  // The photograph has the lamp *level with* the plate — 236 against 236 —
  // because everything the bowl can see in there is 88 % aluminium.
  add('headlampHousing', housingGeo, reflectorMat);
  add('headlampReflector', merge(bowls), reflectorMat);
  add('headlampDivider', dividerGeo, reflectorMat);
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

  noShadow(group);

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

/** 0 below `lo`, 1 above `hi`, smooth between — for `frame`'s fade. */
function smoothBand(t: number, lo: number, hi: number): number {
  const k = Math.min(Math.max((t - lo) / (hi - lo), 0), 1);
  return k * k * (3 - 2 * k);
}

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

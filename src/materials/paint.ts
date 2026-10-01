/**
 * Automotive paint — Graphite Metallic, two coats.
 *
 * ## The model
 *
 * Real metallic paint is a *stack*, and every cue that makes it read as paint
 * rather than as grey plastic comes from the stack having depth:
 *
 * ```
 *   air
 *   ────────────────────────  clearcoat surface (IOR 1.48, near mirror,
 *                              never optically flat → orange peel)
 *   clear resin, ~45 µm
 *   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  basecoat: tinted binder with aluminium flake
 *   flake ▁▂▁ ▂▁▂ ▁▂▁         lying roughly parallel to the panel
 *   ────────────────────────  primer (opaque)
 * ```
 *
 * You see **two reflections of the world at two different depths**: a sharp one
 * off the clearcoat, and a blurred, tinted, angularly *compressed* one off the
 * flake layer underneath. The compression is real — the view ray refracts on
 * the way in, so the basecoat only ever sees a ±42° cone of the world no matter
 * how grazing the view. That is implemented here literally (`audiRefractInto`)
 * and it is most of what makes the paint look wet instead of painted-on.
 *
 * ## What each piece buys
 *
 * - **Flop / travel.** The refracted angle drives a curve that darkens and
 *   de-chromatises the basecoat towards grazing. A dark grey metallic loses
 *   roughly two thirds of its reflectance between face-on and 60°; that
 *   gradient across a fender is the primary "this is metallic" cue.
 * - **Flake.** Two scales, and only the coarser one is something you can see.
 *   A flake is 10-50 µm, so no pose resolves one and a pixel averages of order
 *   a hundred; the lattice hands each fragment one draw from the flake tilt
 *   distribution and `audiFlakeGrain` weights it by the 1/n the sampling
 *   density supports, which is a fine grain and never a speck. What survives
 *   at normal viewing distance is **clumping** — the millimetre-scale
 *   orientation domains a spray gun leaves — and that is what makes a
 *   metallic's sheen travel across a panel as the camera moves.
 * - **Orange peel.** Two octaves of low-amplitude height (≈9 µm at 4.5 mm and
 *   ≈30 µm at 28 mm) perturbing *only* the clearcoat normal. The long wave is
 *   what makes a reflected horizon ripple in a full-car shot.
 */

import * as THREE from 'three';
import { PAINT } from '@/spec';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_NOISE, GLSL_FRAME, GLSL_BUMP, GLSL_FLAKE } from './shaders/common';

export interface PaintUniforms {
  uPaintPigment: THREE.IUniform<THREE.Color>;
  uPaintFace: THREE.IUniform<THREE.Color>;
  uPaintFlop: THREE.IUniform<THREE.Color>;
  uFlakeColor: THREE.IUniform<THREE.Color>;
  uFlakeParams: THREE.IUniform<THREE.Vector4>;
  uFlakeShape: THREE.IUniform<THREE.Vector4>;
  uFlopParams: THREE.IUniform<THREE.Vector4>;
  uOrangePeel: THREE.IUniform<THREE.Vector4>;
  uPaintScatter: THREE.IUniform<number>;
}

/** Linear-space colour from sRGB components. */
function srgb(r: number, g: number, b: number): THREE.Color {
  return new THREE.Color().setRGB(
    THREE.MathUtils.clamp(r, 0, 1),
    THREE.MathUtils.clamp(g, 0, 1),
    THREE.MathUtils.clamp(b, 0, 1),
    THREE.SRGBColorSpace,
  );
}

function hexToSrgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Push a colour away from (or toward) its own grey. */
function saturate3(c: [number, number, number], k: number): [number, number, number] {
  const m = (c[0] + c[1] + c[2]) / 3;
  return [m + (c[0] - m) * k, m + (c[1] - m) * k, m + (c[2] - m) * k];
}

/**
 * Flake weight in the face tint at the authored basecoat, and the strength
 * with which the binder's hue is allowed to colour the flake.
 *
 * Both are written so that `derivePaintTints(PAINT.baseColor, PAINT.flakeColor)`
 * is bit-for-bit what it was before the recolour path existed. The
 * photograph match is calibrated on that one result and nothing here may
 * move it; everything below only bites for colours the picker can ask for.
 */
const FLAKE_WEIGHT = 0.48;
const FLAKE_TINT = 0.35;

/** Strongest channel — how much light the binder lets back out at all. */
function peak(c: [number, number, number]): number {
  return Math.max(c[0], c[1], c[2]);
}

/** Rec. 709 luminance, used only as a lightness ordinate. */
function lum(c: [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Ceiling on the scatter lift. A white basecoat is titanium dioxide — a dense
 * diffuse scatterer, not a tinted glaze — and reaching ~0.72 albedo is what
 * stops "white" rendering as silver.
 */
const SCATTER_MAX = 2.4;

/**
 * Flake spacing, in metres. **This is the number the glitter defect was.**
 *
 * `PAINT.flakeDensity` is 640 and its comment reads "per m²-ish". Per m² that
 * is one flake per 40 mm × 40 mm, which is not a paint. Read as **per mm²** it
 * is 6.4 × 10⁸/m², a 39.5 µm pitch, and with `PAINT.flakeSize` 0.55 a 21.7 µm
 * particle — both inside the 10-50 µm that aluminium flake in a 1980s basecoat
 * actually is. The unit was the bug, and the spec figure was right all along.
 *
 * What the old code did instead was `sqrt(640) × 36`: a 1.1 mm cell carrying a
 * 0.4-0.9 mm "flake", 20-40× oversize, with a companion population on a 3.5 mm
 * cell carrying a 1.3-3.0 mm one. At `badge`'s ~0.45 mm/px those are the 2-4 px
 * white specks CRITIQUE-4 §11 counted: 106 of them, median 1.14 mm of claimed
 * flake, peak 131 against a panel median of 27 — 4.9× local contrast. Glitter,
 * not metallic.
 *
 * Report to the lead: `spec.ts` should say "per mm²" against `flakeDensity`,
 * and `flakeSize` should say "fraction of the flake pitch". Both are correct
 * figures with the wrong unit written beside them.
 */
const FLAKE_PITCH_M = 1 / Math.sqrt(PAINT.flakeDensity * 1e6);

/**
 * The sampling lattice, in metres per cell.
 *
 * **Not the flake.** This is only how often the shader draws from the flake
 * tilt distribution; the flake's own size enters as an amplitude, through
 * `audiFlakeGrain`. Keeping the two apart is what makes the fix possible,
 * because the two have opposite requirements:
 *
 * - a cell must be no *larger* than a pixel at the closest pose the project
 *   shoots (`badge`, ~0.45 mm/px), or the draw reads as a blob rather than as
 *   grain — which is the same failure in miniature;
 * - the lattice coordinate must stay *small* in absolute value, because
 *   `audiHash33` is `fract(p × 0.1031)`-based and starts losing its low bits
 *   past a few thousand cells. A lattice at the real 39.5 µm pitch would put
 *   the tail of a 2.5 m car at 63,000 cells, where float32 leaves the hash a
 *   couple of thousand distinct states and it bands.
 *
 * 0.38 mm satisfies both: 0.85 of a pixel at `badge`, and 6,600 cells at the
 * far end of the car.
 */
const FLAKE_SAMPLE_PITCH_M = 0.00038;

/**
 * Flake clumping domain size, in metres.
 *
 * Spray-applied basecoat mottles: the fan pattern and the solvent flash leave
 * flake-orientation domains at roughly a centimetre, which is the faint
 * cloudiness a real metallic panel has. 12 mm is 27 px at `badge` and about
 * 4 px on `photomatch`'s foreshortened bonnet, so it lands in the 3-8 px band
 * rather than the 1-3 px one this round is trying to empty.
 */
const CLUMP_PITCH_M = 0.012;

/**
 * Derive the four tints the shader needs from one sRGB base colour.
 *
 * `PAINT.baseColor` is the *basecoat* as it would be measured flat and
 * unlit — a mid-dark graphite. What the eye sees is considerably lighter,
 * because the flake layer and the clearcoat both add on top. So:
 *
 * - `pigment`  the transmissive binder tint: darker, slightly more saturated.
 * - `face`     the flake layer's specular tint seen square-on: lifted towards
 *              aluminium, the colour a photograph of a horizontal panel gives.
 * - `flop`     the same layer at grazing, after a long absorption path through
 *              the binder: much darker and more chromatic.
 * - `flake`    the individual particles' own tint.
 *
 * ## Why the flake weight is not a constant
 *
 * The flake lies *under* the binder, so light reaches it and returns through
 * two passes of whatever the binder absorbs. Mixing it in at a fixed 48 %
 * therefore only holds while the binder passes something. Ask the picker for
 * black and a constant weight hands back a 35 %-reflectance neutral — a car
 * that is barely darker than the graphite it replaced, which is exactly the
 * symptom "the swatches do nothing" describes.
 *
 * The weight is scaled by how much the binder passes at its *strongest*
 * channel, relative to the authored basecoat, and clamped at 1. A saturated
 * colour — a fire-engine red, a pure blue — passes fully in one channel and so
 * keeps the authored behaviour exactly; only genuinely dark basecoats lose
 * their flake, which is what real paint does. A small floor is kept because no
 * real metallic, however black, has no flake in it at all.
 *
 * The two weights are complementary (`1 - kFlake`), so the layer never gains
 * energy: pure white lands at 0.91, not clipped at 1.
 *
 * ## And why the binder's scattering is not a constant either
 *
 * `scatter` scales the diffuse term the shader takes off the binder. The
 * authored constants were tuned on a dark metallic, where almost all the
 * brightness is the flake's *specular* and the diffuse is a tenth of the
 * answer. Ask for white with those constants and the panel is a near-mirror
 * with an albedo of 0.31 — so it reflects a dark street and reads silver-grey.
 * Real white paint is the opposite case: a dense diffuse scatterer that hides
 * its own flake. Scaling the diffuse with lightness above the authored point
 * (and never below it) is what makes the light end of the picker work, and it
 * is identically 1 at Graphite Metallic.
 */
export function derivePaintTints(baseHex: number, flakeHex: number): {
  pigment: THREE.Color;
  face: THREE.Color;
  flop: THREE.Color;
  flake: THREE.Color;
  scatter: number;
} {
  const b = hexToSrgb(baseHex);
  const fl = hexToSrgb(flakeHex);
  const b0 = hexToSrgb(PAINT.baseColor);

  const transmit = THREE.MathUtils.clamp(peak(b) / Math.max(peak(b0), 1e-4), 0, 1);
  const kFlake = FLAKE_WEIGHT * Math.max(transmit, 0.06);
  const kBinder = 1 - kFlake;

  // Aluminium seen through a tinted binder picks up some of that tint. The
  // ratio is normalised against its own mean, so this shifts the flake's hue
  // without changing how bright the sparkle is — and is identically (1,1,1)
  // at the authored basecoat.
  const ratio: [number, number, number] = [
    b[0] / Math.max(b0[0], 1e-4),
    b[1] / Math.max(b0[1], 1e-4),
    b[2] / Math.max(b0[2], 1e-4),
  ];
  const ratioMean = (ratio[0] + ratio[1] + ratio[2]) / 3;
  const tinted: [number, number, number] = ratioMean < 1e-3
    ? [fl[0], fl[1], fl[2]] // a black binder still sparkles silver
    : [0, 1, 2].map((i) => {
      const n = THREE.MathUtils.clamp(ratio[i] / ratioMean, 0, 2);
      return fl[i] * (1 + FLAKE_TINT * (n - 1));
    }) as [number, number, number];

  const pigmentS = saturate3([b[0] * 0.78, b[1] * 0.78, b[2] * 0.78], 1.2);
  const faceS = saturate3(
    [
      (b[0] * kBinder + fl[0] * kFlake) * 1.06,
      (b[1] * kBinder + fl[1] * kFlake) * 1.06,
      (b[2] * kBinder + fl[2] * kFlake) * 1.06,
    ],
    1.05,
  );
  const flopS = saturate3([b[0] * 0.34, b[1] * 0.34, b[2] * 0.34], 1.35);

  const scatter = THREE.MathUtils.clamp(lum(b) / Math.max(lum(b0), 1e-4), 1, SCATTER_MAX);

  return {
    pigment: srgb(pigmentS[0], pigmentS[1], pigmentS[2]),
    face: srgb(faceS[0], faceS[1], faceS[2]),
    flop: srgb(flopS[0], flopS[1], flopS[2]),
    flake: srgb(tinted[0], tinted[1], tinted[2]),
    scatter,
  };
}

const PAINT_PRELUDE = /* glsl */ `
varying vec3 vAudiObjPos;
varying vec3 vAudiObjNormal;

uniform vec3 uPaintPigment;
uniform vec3 uPaintFace;
uniform vec3 uPaintFlop;
uniform vec3 uFlakeColor;
// x lattice (cells/m)  y physical flake pitch (m)  z tilt spread  w intensity
uniform vec4 uFlakeParams;
// x one flake's lobe roughness  y clump field (cells/m)  z direct glint gain
// w mean energy the layer returns, as a fraction of the population lobe
uniform vec4 uFlakeShape;
// x flop power  y basecoat roughness  z clearcoat IOR  w clearcoat F0
uniform vec4 uFlopParams;
// x scale (cells/m)  y slope  z long-wave fraction  w unused
uniform vec4 uOrangePeel;
// How much more the binder scatters than the authored graphite does. 1 there
// by construction; above 1 only for a lighter basecoat.
uniform float uPaintScatter;

${GLSL_NOISE}
${GLSL_FRAME}
${GLSL_BUMP}
${GLSL_FLAKE}

/**
 * Bend a view direction as it refracts into the clearcoat. Returns a direction
 * whose mirror about N is the compressed reflection the basecoat actually sees.
 */
vec3 audiRefractInto(vec3 V, vec3 N, float ior) {
  vec3 t = V - N * dot(N, V);
  float s = length(t);
  float s2 = s / ior;
  float c2 = sqrt(max(1.0 - s2 * s2, 0.0));
  return normalize(N * c2 + (s > 1e-5 ? t / s : vec3(0.0)) * s2);
}

/** 0 square-on, 1 at the steepest angle light can reach the basecoat at. */
float audiTravel(float NdV, float ior) {
  float sin2 = max(1.0 - NdV * NdV, 0.0);
  float cosT = sqrt(max(1.0 - sin2 / (ior * ior), 0.0));
  float cosMax = sqrt(max(1.0 - 1.0 / (ior * ior), 0.0));
  return clamp((1.0 - cosT) / max(1.0 - cosMax, 1e-4), 0.0, 1.0);
}

/** Ceiling on one flake's flash, as a multiple of the population's own mean. */
#define AUDI_FLAKE_CEIL 3.0

/**
 * Lobe one flake's *direct* glint is given, as a Blinn-Phong exponent.
 *
 * Fixed, where it used to be widened as the lattice stopped resolving. The
 * lobe belongs to the particle and a particle does not get rougher because
 * the camera moved; what moves is how many of them a pixel averages, and that
 * is 'audiFlakeGrain'. Same bargain, stated once, in the right place.
 */
#define AUDI_FLAKE_DIRECT_POW 900.0

/**
 * How far the clump field may tilt the local basecoat normal.
 *
 * The field's gradient is O(1) per cell, so this is a tangent — about 1.5° of
 * typical tilt. Small on purpose: real mottling is a few per cent of
 * brightness, and because it tilts a *reflection* it is loudest exactly where
 * the environment has contrast, which here is the canopy.
 */
#define AUDI_CLUMP_TILT 0.055

/**
 * The basecoat's local normal and one flake's, from the two scales that are
 * actually in the paint.
 *
 * **Clumping**, at millimetres, in 'nClumpView'. A spray gun does not lay its
 * flake down evenly: the spray pattern and solvent flash leave orientation
 * domains a few millimetres across, which is the faint cloudiness a real
 * metallic panel shows and — because it tilts the whole local population's
 * lobe rather than one particle's — the reason a metallic's sheen *travels*
 * across a panel as you move instead of merely getting brighter. Millimetres
 * is resolvable, so unlike the flake this survives at normal viewing
 * distance, and with the flake correctly sub-pixel it is the only
 * high-frequency metallic cue left. 'audiResolved' fades the tilt out once it
 * is not resolved, which is mean-preserving to first order because the tilt is
 * mean-zero.
 *
 * The *gradient* of a smooth field, not its value: a slope is what a domain
 * boundary does to the lay of the flake under it, and a value would give the
 * panel brightness steps instead of a wandering lobe.
 *
 * **The flake**, in the return value: one draw from the tilt distribution
 * about the clumped normal, weighted by 'audiFlakeGrain' at the call site.
 *
 * What this replaced had the second scale as a second *flake* population, at
 * 3.5 mm cells and 'PAINT.flakeSize' of a cell — a 1.3-3.0 mm aluminium
 * platelet, sixty times the size of any flake ever milled. No ceiling and no
 * lobe-widening could have saved it: the speck *was* the disc, drawn at the
 * size it was asked for.
 */
vec3 audiFlakeNormal(vec3 objPos, vec3 nObj, AudiFrame fr, out vec3 nClumpView) {
  vec3 qc = AUDI_FLAKE_SKEW * objPos * uFlakeShape.y;
  vec3 slope = audiNoised(qc).yzw;
  slope -= nObj * dot(slope, nObj);
  vec3 nClump = normalize(nObj + slope * AUDI_CLUMP_TILT * audiResolved(qc));
  nClumpView = audiObjToView(fr, nClump);

  vec3 q = AUDI_FLAKE_SKEW * objPos * uFlakeParams.x;
  return audiObjToView(fr, audiFlakeTilt(q, nClump, uFlakeParams.z));
}
`;

/** Injected right after `material` is built, so it can overwrite its fields. */
const PAINT_MATERIAL = /* glsl */ `
vec3 audiV = normalize(vViewPosition);
float audiNdV = clamp(dot(normal, audiV), 0.0, 1.0);
float audiIor = uFlopParams.z;
float audiTrav = pow(audiTravel(audiNdV, audiIor), uFlopParams.x);

// --- basecoat: tinted binder (diffuse) under aluminium flake (specular) ---
material.diffuseColor = uPaintPigment * mix(0.40, 0.14, audiTrav) * uPaintScatter;
material.specularColor = mix(uPaintFace, uPaintFlop, audiTrav);
// Clamped F90: light reaches the basecoat only through the clearcoat, so the
// grazing Fresnel rise that a bare metal would show is largely refracted away.
// Without this the panel edges go chalky white and the paint dies.
material.specularF90 = 0.5;
material.roughness = clamp(uFlopParams.y * mix(1.0, 1.35, audiTrav) + geometryRoughness, 0.045, 1.0);

#ifdef USE_CLEARCOAT
  material.clearcoatF0 = vec3(uFlopParams.w);
#endif

// --- flake ---
AudiFrame audiFr = audiMakeFrame(vAudiObjPos, -vViewPosition);
vec3 audiClumpN = normal;
vec3 audiFlakeN = audiFlakeNormal(vAudiObjPos, normalize(vAudiObjNormal), audiFr, audiClumpN);
// What one draw from the flake population is worth to this pixel — the band
// limit, and the reason the flake no longer reads as glitter.
float audiFlakeW = audiFlakeGrain(vAudiObjPos, uFlakeParams.y);
// Flake is buried in the same absorbing binder, so it flops too.
float audiFlakeFlop = mix(1.0, 0.22, audiTrav);
vec3 audiFlakeDirect = vec3(0.0);
`;

const PAINT_DIRECT_GLINT = /* glsl */ `
{
  vec3 audiH = normalize(directLight.direction + geometryViewDir);
  float audiNL = saturate(dot(geometryNormal, directLight.direction));
  float audiFH = saturate(dot(audiFlakeN, audiH));
  audiFlakeDirect += directLight.color * audiNL
                   * pow(audiFH, AUDI_FLAKE_DIRECT_POW) * uFlakeShape.z;
}
`;

const PAINT_FLAKE_APPLY = /* glsl */ `
{
  vec3 audiFlakeOne = vec3(0.0);
  vec3 audiFlakePop = vec3(0.0);
  #ifdef USE_ENVMAP
    // Flakes live under the clearcoat: their view ray is refracted too.
    vec3 audiVc = audiRefractInto(geometryViewDir, geometryNormal, audiIor);
    // A single platelet is a near-mirror along its own tilted normal and it
    // stays one at every distance. It is not widened as the camera pulls back
    // any more — a flake does not get rougher because you stepped away. What
    // changes is how many of them a pixel averages, and that is audiFlakeW.
    audiFlakeOne = getIBLRadiance(audiVc, audiFlakeN, uFlakeShape.x);
    // The energy the whole population averages to, read through the clump
    // field's normal so the millimetre-scale lay of the flake shows.
    audiFlakePop = getIBLRadiance(audiVc, audiClumpN, 0.34);
  #endif

  // **What a single flake is allowed to return, relative to the population
  // it belongs to.**
  //
  // A flake is an aluminium platelet about a micron thick and visibly
  // crumpled, lying under ~45 µm of *pigmented* binder: the light reaching it
  // has already been scattered on the way in and is scattered again on the way
  // out, so what one particle returns is a diffused version of its lobe and
  // not a clean image of a bright source. A photographed metallic panel in
  // shade shows its brightest flakes at two to three times the panel around
  // them.
  //
  // Soft rather than min, so the flake field keeps its gradient instead of
  // clipping to a plateau, and energy-preserving at the low end where
  // audiFlakeOne << k leaves it alone. It cannot change the panel's
  // brightness: the mean is audiFlakePop and is untouched.
  {
    vec3 audiCeil = audiFlakePop * AUDI_FLAKE_CEIL + 1e-5;
    audiFlakeOne = audiFlakeOne * audiCeil / (audiCeil + audiFlakeOne);
  }

  // **The layer's mean cannot depend on how far away the camera is.** Paint
  // does not darken when you walk towards it, and what this replaced made it
  // do exactly that: the mean was written as 'pop * w * (1 - resolved * 0.75)'
  // with a positive-only sparkle term faded in on top, so between 'photomatch'
  // and 'badge' the flake layer's own contribution fell by a factor of three
  // and the close-up panel went dark to make room for the specks.
  //
  // Interpolating between one flake's lobe and the population's fixes both
  // ends at once: the deviation is zero-mean by construction, so the band
  // limit can only remove variance. At audiFlakeW = 0 this is exactly
  // 'pop * w', which is what the old far-field limit was — and the bonnet at
  // 'photomatch', foreshortened to ~17 mm/px, *is* that limit, so the pose the
  // paint's colour is calibrated at cannot move.
  vec3 audiFlakeTint = uFlakeColor * uFlakeParams.w * audiFlakeFlop;
  vec3 audiLayer = mix(audiFlakePop, audiFlakeOne, audiFlakeW)
                 + audiFlakeDirect * audiFlakeW;
  reflectedLight.indirectSpecular += audiFlakeTint * uFlakeShape.w * audiLayer;
}
`;

export interface PaintMaterial {
  material: THREE.MeshPhysicalMaterial;
  uniforms: PaintUniforms;
  setColor(hex: number): void;
  /** The basecoat hex currently in the uniforms. */
  color(): number;
}

export function createPaint(): PaintMaterial {
  const tints = derivePaintTints(PAINT.baseColor, PAINT.flakeColor);

  const uniforms: PaintUniforms = {
    uPaintPigment: { value: tints.pigment },
    uPaintFace: { value: tints.face },
    uPaintFlop: { value: tints.flop },
    uFlakeColor: { value: tints.flake },
    uFlakeParams: {
      value: new THREE.Vector4(1 / FLAKE_SAMPLE_PITCH_M, FLAKE_PITCH_M, 0.42, PAINT.flakeIntensity),
    },
    // x one flake's lobe: a 4° near-mirror, which is what a platelet is.
    // y the clump field, 12 mm domains.
    // z direct glint gain.
    // w the layer's mean energy — held at the value the old far-field limit
    //   had (`0.30`), because `photomatch`'s bonnet sits in that limit and the
    //   paint's colour is calibrated there. As a sanity check rather than a
    //   derivation: the geometric flake coverage implied by `PAINT.flakeSize`
    //   read as a fraction of the pitch is π/4 × 0.55² = 24 %, the same order.
    uFlakeShape: { value: new THREE.Vector4(0.075, 1 / CLUMP_PITCH_M, 0.34, 0.30) },
    uFlopParams: { value: new THREE.Vector4(0.85, PAINT.roughness, PAINT.clearcoatIor, 0.0375) },
    uOrangePeel: { value: new THREE.Vector4(PAINT.orangePeelScale, PAINT.orangePeelStrength, 0.16, 0) },
    uPaintScatter: { value: tints.scatter },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1.0,
    roughness: PAINT.roughness,
    clearcoat: PAINT.clearcoat,
    clearcoatRoughness: PAINT.clearcoatRoughness,
    ior: PAINT.clearcoatIor,
    envMapIntensity: 1.0,
    dithering: true,
  });

  extend(material, {
    key: 'audi-paint-v1',
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    // The direct-glint and refracted-IBL patches below aim at lines that live
    // inside these two chunks, so they have to be inlined before patching.
    expandChunks: ['lights_fragment_begin', 'lights_fragment_maps'],
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${PAINT_PRELUDE}` },
      {
        // Orange peel goes on the clearcoat normal only. The basecoat stays
        // flat — that difference is what makes the two reflections separate.
        find: '#include <clearcoat_normal_fragment_begin>',
        replace: /* glsl */ `
#ifdef USE_CLEARCOAT
  vec3 clearcoatNormal = nonPerturbedNormal;
  {
    float opS = uOrangePeel.x;
    float opL = opS * uOrangePeel.z;
    float slope = uOrangePeel.y;
    // Amplitude from slope: A = slope / (2 pi f). Keeps the *angle* of the
    // ripple constant when the scale is retuned, which is the thing you see.
    float ampL = slope * 0.80 / (6.2831853 * opL);
    float ampS = slope * 0.45 / (6.2831853 * opS);
    float hS = (audiNoise(vAudiObjPos * opS) - 0.5) * ampS * audiResolved(vAudiObjPos * opS);
    float hL = (audiFbm2(vAudiObjPos * opL) - 0.5) * ampL;
    float h = hL + hS;
    clearcoatNormal = audiBump(-vViewPosition, clearcoatNormal, dFdx(h), dFdy(h), 1.0);
  }
#endif
`,
      },
      { find: '#include <lights_physical_fragment>', replace: `$&\n${PAINT_MATERIAL}` },
      {
        find: 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        replace: `$&\n${PAINT_DIRECT_GLINT}`,
        all: true,
      },
      {
        // The basecoat sees a compressed image of the world. Swapping the view
        // direction here is the whole trick: same env map, different depth.
        // three r171+ assigns this to a local; earlier versions accumulated
        // into `radiance` directly. Matching on the call itself rather than on
        // the assignment survives both.
        find: 'getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );',
        replace: 'getIBLRadiance( audiRefractInto( geometryViewDir, geometryNormal, audiIor ), geometryNormal, material.roughness );',
      },
      { find: '#include <lights_fragment_end>', replace: `$&\n${PAINT_FLAKE_APPLY}` },
    ],
  });

  // `material.color` is left at white and `metalness` at 1, so the visible
  // colour is entirely `uPaintFace`/`uPaintFlop`/`uPaintPigment`. Writing
  // `material.color` from outside would do almost nothing; a recolour has to
  // re-derive all four tints and copy them into the live uniform objects.
  // Copying in place is what keeps this a uniform swap: the material, its
  // program and every mesh referencing it are untouched, so the body's single
  // batched draw call survives the change.
  let current: number = PAINT.baseColor;
  const setColor = (hex: number): void => {
    const t = derivePaintTints(hex, PAINT.flakeColor);
    uniforms.uPaintPigment.value.copy(t.pigment);
    uniforms.uPaintFace.value.copy(t.face);
    uniforms.uPaintFlop.value.copy(t.flop);
    uniforms.uFlakeColor.value.copy(t.flake);
    uniforms.uPaintScatter.value = t.scatter;
    current = hex;
  };

  return { material, uniforms, setColor, color: () => current };
}

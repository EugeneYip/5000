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
 * - **Flake.** A 3D lattice in object space, one aluminium flake per cell, each
 *   with its own tilt. Flakes are lit by a *sharp* env lookup, so as the camera
 *   moves each one swings in and out of a highlight individually. Sub-pixel
 *   lattices fade their variance into their own mean, so distance shots stay
 *   clean instead of boiling.
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
// x density (cells/m)  y size  z spread  w intensity
uniform vec4 uFlakeParams;
// x roughness  y direct sharpness  z direct gain  w coverage (mean energy)
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

/**
 * Only a minority of cells hold a flake lying flat enough, and large enough,
 * to throw a visible flash. Without this gate every cell flashes at once and
 * the panel reads as a dusting of salt rather than as metallic paint — the
 * coverage, not the brightness, is what makes flake look wrong.
 */
float audiFlakeRarity(vec3 q, float keep) {
  return step(1.0 - keep, audiHash13(floor(q) * 1.37 + 3.1));
}

vec3 audiFlakeNormal(vec3 objPos, vec3 nObj, AudiFrame fr, out float mask, out float resolved,
                     out float flakeRes) {
  float dens = uFlakeParams.x;
  vec3 q = AUDI_FLAKE_SKEW * objPos * dens;
  AudiFlake fine = audiFlakeAt(q, nObj, uFlakeParams.y, uFlakeParams.z);

  // A second, coarser population. Real flake is graded, and the handful of
  // large particles are the ones the eye actually registers as sparkle.
  vec3 q2 = AUDI_FLAKE_SKEW * (objPos + 11.7) * dens * 0.31;
  AudiFlake coarse = audiFlakeAt(q2, nObj, uFlakeParams.y * 1.15, uFlakeParams.z * 0.7);

  float rFine = audiResolved(q);
  float rCoarse = audiResolved(q2);

  // A flake is about half its cell across, so a lattice that is comfortably
  // resolved can still be holding a flake well under a pixel — and a sub-pixel
  // mirror does not average, it flashes. Each one returns the sun disc whole on
  // one pixel and nothing on its neighbours, which is the white grit that reads
  // as dust on the sensor over a dark panel. The *lattice* resolve above is the
  // wrong test for that; this measures the flake itself.
  float sz = max(uFlakeParams.y, 0.05);
  flakeRes = max(audiResolved(q / sz), audiResolved(q2 / (sz * 1.15)));

  // Coarse flakes win where they exist; they sit nearer the clearcoat.
  float wc = coarse.mask * rCoarse * audiFlakeRarity(q2, 0.14);
  float wf = fine.mask * rFine * audiFlakeRarity(q, 0.09) * (1.0 - wc * 0.7);
  mask = clamp(wc + wf, 0.0, 1.0);
  resolved = max(rFine, rCoarse);
  vec3 n = normalize(mix(fine.normalObj, coarse.normalObj, wc / max(wc + wf, 1e-4)));
  return audiObjToView(fr, n);
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
float audiFlakeMask = 0.0;
float audiFlakeRes = 0.0;
float audiFlakeSharp = 0.0;
vec3 audiFlakeN = audiFlakeNormal(vAudiObjPos, normalize(vAudiObjNormal), audiFr,
                                  audiFlakeMask, audiFlakeRes, audiFlakeSharp);
// Flake is buried in the same absorbing binder, so it flops too.
float audiFlakeFlop = mix(1.0, 0.22, audiTrav);
vec3 audiFlakeDirect = vec3(0.0);
`;

const PAINT_DIRECT_GLINT = /* glsl */ `
{
  vec3 audiH = normalize(directLight.direction + geometryViewDir);
  float audiNL = saturate(dot(geometryNormal, directLight.direction));
  float audiFH = saturate(dot(audiFlakeN, audiH));
  // Same bargain as the env lobe above: a lobe this tight is a delta function
  // to a pixel that no longer contains a whole flake, so it widens and drops
  // in the same proportion. Energy constant, flash gone.
  float audiFP = mix(48.0, uFlakeShape.y, audiFlakeSharp);
  audiFlakeDirect += directLight.color * audiNL * pow(audiFH, audiFP) * uFlakeShape.z
                   * ((audiFP + 1.0) / (uFlakeShape.y + 1.0));
}
`;

const PAINT_FLAKE_APPLY = /* glsl */ `
{
  vec3 audiFlakeEnv = vec3(0.0);
  vec3 audiFlakeMean = vec3(0.0);
  #ifdef USE_ENVMAP
    // Flakes live under the clearcoat: their view ray is refracted too.
    vec3 audiVc = audiRefractInto(geometryViewDir, geometryNormal, audiIor);
    // Sharp while the flake is bigger than a pixel — that mirror is the sparkle
    // — and no sharper than the population's own lobe once it is not. Variance
    // goes, energy stays: the flash becomes the average of what it was flashing
    // at, so the panel neither dims nor stops looking metallic.
    audiFlakeEnv = getIBLRadiance(audiVc, audiFlakeN, mix(0.34, uFlakeShape.x, audiFlakeSharp));
    // The energy the whole flake population averages to. Fading *variance*
    // into this, rather than fading flake out, keeps the paint the same
    // brightness whether the lattice is resolved or a mile away.
    audiFlakeMean = getIBLRadiance(audiVc, geometryNormal, 0.34);
  #endif

  vec3 audiFlakeTint = uFlakeColor * uFlakeParams.w * audiFlakeFlop;
  vec3 audiSparkle = (audiFlakeEnv + audiFlakeDirect) * audiFlakeMask * audiFlakeRes;
  vec3 audiSmooth = audiFlakeMean * uFlakeShape.w * (1.0 - audiFlakeRes * 0.75);

  reflectedLight.indirectSpecular += audiFlakeTint * (audiSparkle + audiSmooth);
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
      // Density is quoted per m²; the lattice wants cells per metre, and the
      // visually-matching conversion is a straight sqrt of a flake *volume*
      // density — 640 lands at ~1.1 mm cells, about a grain of sand.
      // Cell size is chosen so a flake is just under a pixel at the distance a
      // car is normally looked at (~3 m, ~1.3 mm/px): large enough to resolve
      // as a point, small enough that the variance fade takes over beyond that.
      // `flakeSize` is read as a cell-diameter fraction; 0.76 of it is the
      // value that matches a photographed panel.
      value: new THREE.Vector4(Math.sqrt(PAINT.flakeDensity) * 36.0, PAINT.flakeSize * 0.76, 0.42, PAINT.flakeIntensity),
    },
    uFlakeShape: { value: new THREE.Vector4(0.075, 900.0, 0.34, 0.30) },
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

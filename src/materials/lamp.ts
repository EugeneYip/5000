/**
 * Lamp optics: moulded lenses and bulb surfaces.
 *
 * ## Why a period lens is hard
 *
 * A 1988 taillamp is not a red surface. It is a 3 mm slab of dyed PMMA with a
 * field of prisms moulded into its **back** face, sitting in front of a
 * stippled aluminium bowl. Everything that makes it look expensive happens
 * inside it:
 *
 *  - the prisms are *behind* the outer surface, so they slide against it with
 *    parallax as you move — the strongest depth cue the part has, and the one
 *    a normal map can never produce;
 *  - light crossing the body is absorbed by Beer–Lambert, so the same lens is
 *    a bright orange-red where the path is short and nearly black where it is
 *    long. That gradient *is* the glow;
 *  - the facets are flat and their ridges are creases, so a low sun breaks
 *    into a grid of separate hard glints rather than one smeared highlight.
 *
 * All three are modelled here. Flat red plastic is what you get when you model
 * none of them.
 *
 * ## …and why it is easy to make it worse
 *
 * Every one of those three is a *strictly periodic* signal with hard edges in
 * it, read through a *parallax offset*, on a *curved* surface. That is three
 * separate ways to produce a pattern the frame cannot hold, and the accumulation
 * pass cannot help with any of them: it jitters the projection, not the
 * lookup, so sixteen samples average sixteen copies of the same artefact.
 *
 * So the rules here are tighter than elsewhere in the library:
 *
 *  - the flute *phase* rides on fixed part axes, never on an axis re-derived
 *    from the interpolated normal — see rule 3 in `shaders/surfaces.ts`;
 *  - the rate that arms the band limit is measured with the parallax term
 *    added analytically, because `fwidth` cannot see it;
 *  - the creases (facet flip, TIR blaze, glint lobe) are surrendered early and
 *    the smooth banding late, each toward *its own mean*, so the lamp keeps
 *    its colour and its average brightness at every distance and simply stops
 *    resolving individual prisms.
 */

import * as THREE from 'three';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

export interface LensOptions {
  /** Moulded prism fluting on the inner face. */
  prismatic?: boolean;
  opacity?: number;
}

/** Acrylic. */
const LENS_IOR = 1.49;

const LENS_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
uniform vec3 uLensColor;
// x body thickness (m)  y prism pitch (m)  z prism slope  w internal env gain
uniform vec4 uLensOptics;
// x absorption strength  y bulk scatter  z facet roughness  w cross-prism ratio
uniform vec4 uLensBody;
uniform float uLensIor;

${GLSL_LIB}
${GLSL_SURFACE}
`;

const LENS_SETUP = /* glsl */ `
AudiFrame audiLensFr = audiMakeFrame(vAudiObjPos, -vViewPosition);
vec3 audiLensNObj = normalize(vAudiObjNormal);
vec3 audiLensVo = normalize(audiViewToObj(audiLensFr, normalize(vViewPosition)));

// Into the body, and on to the back face where the prisms live.
vec3 audiLensRay = refract(-audiLensVo, audiLensNObj, 1.0 / uLensIor);
float audiLensCosT = max(-dot(audiLensRay, audiLensNObj), 0.18);
float audiLensPath = uLensOptics.x / audiLensCosT;

// --- where the flutes are, and where they point ---------------------------
// Two different questions, and conflating them is what made the lens swirl.
//
// A moulded prism grid is cut into the back face on the *mould's* axes, so its
// phase is a straight linear ramp in the part's own coordinates. Measuring it
// instead along an axis re-projected onto the interpolated normal — which is
// what this did — evaluates 'dot(objPos, across)' against a position vector
// nearly four metres from the car's origin. At that lever arm a tilt of one
// twentieth of a degree in the normal slides the phase by a whole 5.5 mm
// pitch, so the flutes stop being parallel and close into contours: the
// fingerprint rings, which are not aliasing at all and which no amount of
// band-limiting or supersampling can remove.
//
// So the *phase* rides on fixed part axes, and only the *facet tilt* is
// re-projected onto the local normal, where a slow rotation over a curved lens
// is what a real moulding does anyway and costs nothing.
//
// A lamp that faces sideways (a marker in a bumper end) picks the other axes
// so the runs never go degenerate.
vec3 audiAxisA = abs(audiLensNObj.x) > 0.7 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
vec3 audiAxisB = abs(audiLensNObj.y) > 0.7 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
vec3 audiAcross = normalize(audiAxisA - audiLensNObj * dot(audiAxisA, audiLensNObj) + vec3(1e-5));
vec3 audiAlong = normalize(cross(audiLensNObj, audiAcross));

// --- how fast the flutes run on screen ------------------------------------
// Everything below — the facet flip, the TIR blaze, the glint lobe, the depth
// banding — is a strictly periodic pattern read through a parallax offset, and
// every one of them has to be band-limited *at the source*. Jittering the
// projection, as the accumulation pass does, resamples the same aliased signal
// sixteen times and averages sixteen copies of the same moiré.
float audiPitchA = uLensOptics.y;
float audiPitchB = uLensOptics.y * uLensBody.w;
// The prisms live on the back face, so the grid is read through the refracted
// ray: the flutes slide against the outer surface as the eye moves, which is
// the part's strongest depth cue. Bounded by the slab — the refracted ray can
// never exceed the 42° critical angle, so the slide tops out near 3 mm.
float audiPhaseA = (dot(vAudiObjPos, audiAxisA) + dot(audiLensRay, audiAxisA) * audiLensPath) / audiPitchA;
float audiPhaseB = (dot(vAudiObjPos, audiAxisB) + dot(audiLensRay, audiAxisB) * audiLensPath) / audiPitchB;
float audiCppA = audiPhaseRate(audiPhaseA, audiLensPath, audiLensNObj, audiPitchA);
float audiCppB = audiPhaseRate(audiPhaseB, audiLensPath, audiLensNObj, audiPitchB);

// Two limits per run. The creases go first and go early; the fundamental
// survives nearly to Nyquist, so the lens keeps its banding long after it has
// stopped trying to draw individual facet edges.
float audiCreaseA = audiCreaseRes(audiCppA);
float audiCreaseB = audiCreaseRes(audiCppB);
float audiLensSharp = max(audiCreaseA, audiCreaseB);

float audiSlopeA = uLensOptics.z;
float audiSlopeB = uLensOptics.z * 0.24;
float audiEa = 0.0;
float audiEb = 0.0;
#ifdef AUDI_PRISMATIC
  audiEa = audiPrismFacet(audiPhaseA, audiCppA, audiCreaseA) * audiSlopeA;
  audiEb = audiPrismFacet(audiPhaseB, audiCppB, audiCreaseB) * audiSlopeB;
#endif
vec3 audiFacetObj = audiPrismFacetNormal(audiLensNObj, audiAcross, audiAlong, audiEa, audiEb);
vec3 audiFacetV = normalize(audiObjToView(audiLensFr, audiFacetObj));

// Total internal reflection is the whole point of a moulded prism. Looking
// out through acrylic, anything steeper than the critical angle (42°) is
// reflected *completely* rather than at the 4 % a flat interface would give,
// so the facets that happen to exceed it blaze while their neighbours stay
// dark. That hard split between adjacent facet families is the pattern a
// period lamp actually shows, and nothing else reproduces it.
//
// It is also a *step*, and a step sampled once per pixel is the dot-matrix
// crosshatch. Once a pixel covers more than one facet it has to return the
// family's average rather than whichever member it happened to land on, and
// widening the step by the spread of cos(theta) across the facets the pixel
// can no longer separate does exactly that — in one evaluation, and per run,
// so a coarse run that is still resolved keeps its hard split while the fine
// run that is not dissolves into its mean instead of beating against the grid.
float audiRn = dot(audiLensRay, audiLensNObj);
float audiRa = dot(audiLensRay, audiAcross);
float audiRb = dot(audiLensRay, audiAlong);
float audiLensCosI = audiPrismCosI(audiRn, audiRa, audiRb, audiEa, audiEb);
float audiCritCos = sqrt(max(1.0 - 1.0 / (uLensIor * uLensIor), 0.0));
float audiTirW = 0.06
               + abs(audiRa) * audiSlopeA * (1.0 - audiCreaseA)
               + abs(audiRb) * audiSlopeB * (1.0 - audiCreaseB);
float audiTir = 1.0 - smoothstep(audiCritCos - audiTirW, audiCritCos + audiTirW, audiLensCosI);

float audiPrismH = 1.0;
#ifdef AUDI_PRISMATIC
  audiPrismH = audiPrismHeight(audiPhaseA, audiPeriodRes(audiCppA)) * 0.68
             + audiPrismHeight(audiPhaseB, audiPeriodRes(audiCppB)) * 0.32;
  // The prism is cut *into* the back of the slab, so a valley sits most of a
  // millimetre deeper than a ridge and the light crossing it is absorbed that
  // much harder. This is what banks the lens light-to-dark at prism pitch and
  // gives the part its thickness; without it the flutes are only a normal map.
  //
  // Because the height fades to its own mean rather than to a flat face, the
  // *average* extra depth survives the band limit intact: a lens whose flutes
  // have gone sub-pixel is the same colour and the same darkness as one whose
  // flutes are resolved. It simply stops banding.
  audiLensPath += (1.0 - audiPrismH) * uLensOptics.y * uLensOptics.z * 0.5;
#endif

// Beer–Lambert over the true path. sigma is set so that one body thickness of
// travel reproduces the nominal lens colour exactly.
vec3 audiLensSigma = -log(clamp(uLensColor, vec3(0.015), vec3(0.999))) / max(uLensOptics.x, 1e-5);
vec3 audiLensAbsorb = exp(-audiLensSigma * audiLensPath * uLensBody.x);

vec3 audiLensGlint = vec3(0.0);
// Scale factor handed to the transmission volume: true slab path, lengthened
// again wherever the prism is cut deepest. The colour itself comes from the
// attenuation over that distance, not from a tint on the surface.
float audiLensThickScale = audiLensPath / max(uLensOptics.x, 1e-5);
diffuseColor.rgb = vec3(mix(0.78, 1.0, audiPrismH));
`;

const LENS_GLINT = /* glsl */ `
{
  // A flat facet returns a light source as a point, not a streak: a very tight
  // lobe about the facet normal, which is why a lens twinkles in a pan.
  //
  // A lobe that tight is a delta function to a pixel, so once the pixel covers
  // more than one facet it must return the lobe *averaged over* them: broader,
  // and lower in the same proportion, so the energy is unchanged. The lens
  // stops twinkling and starts glowing at exactly the distance a real one
  // does, instead of flickering on one pixel in three.
  vec3 audiLh = normalize(directLight.direction + geometryViewDir);
  float audiLnl = saturate(dot(geometryNormal, directLight.direction));
  float audiLfh = saturate(dot(audiFacetV, audiLh));
  float audiLp = mix(26.0, 320.0, audiLensSharp);
  audiLensGlint += directLight.color * audiLnl * pow(audiLfh, audiLp)
                 * 0.55 * ((audiLp + 1.0) / 321.0) * mix(0.1, 1.0, audiTir);
}
`;

const LENS_APPLY = /* glsl */ `
{
  vec3 audiInternal = audiLensGlint;
  #ifdef USE_ENVMAP
    // What a pixel holds once the flutes go sub-pixel is a *distribution* of
    // facet normals, not one of them. Surrendering the spread to roughness —
    // the band limit's share analytically, the residual per-pixel swing
    // measured — keeps the internal reflection at the same brightness while it
    // stops resolving into a sparkling grid.
    float audiFacetRough = audiSpecularAA(
      audiFacetV, uLensBody.z + (1.0 - audiLensSharp) * 0.30, 0.25, 0.25);
    audiInternal += getIBLRadiance(geometryViewDir, audiFacetV, audiFacetRough)
                  * uLensOptics.w * mix(0.05, 1.0, audiTir);
  #endif
  // Seen through the body, so tinted by the path it crossed to get out.
  reflectedLight.indirectSpecular += audiInternal * audiLensAbsorb;
}
`;

export function createLens(color: number, opts: LensOptions = {}): THREE.MeshPhysicalMaterial {
  const prismatic = opts.prismatic === true;
  const tint = new THREE.Color().setHex(color, THREE.SRGBColorSpace);

  const uniforms = {
    uLensColor: { value: tint },
    uLensOptics: { value: new THREE.Vector4(0.0034, 0.0055, 0.62, 0.60) },
    // The cross run was pitched at 0.30 of the main one — 1.65 mm, which is
    // under two pixels even in a lamp close-up shot at 1800 px. A pattern that
    // can never be sampled at any framing the project uses is not detail, it
    // is noise with a period, and it was most of the dot-matrix crosshatch.
    // At 0.52 it lands near eight pixels in a close-up and reads as the
    // regular fine grid a real moulded lens shows, then band-limits honestly.
    uLensBody: { value: new THREE.Vector4(1.0, 0.40, 0.07, 0.52) },
    uLensIor: { value: LENS_IOR },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    // The *outer* face is smooth and polished — all the structure is inside.
    roughness: 0.035,
    ior: LENS_IOR,
    specularIntensity: 1,
    // A lens has to be see-through, or the reflector behind it is wasted and an
    // unlit lamp is a flat coloured plate. Transmission is what makes the bowl,
    // the bulb and the housing visible *through* the dye, at the strength the
    // dye allows: a clear headlamp lens shows everything, a red taillamp lens
    // shows the same assembly drowned in crimson.
    transmission: 1,
    thickness: uniforms.uLensOptics.value.x,
    attenuationColor: new THREE.Color(
      THREE.MathUtils.clamp(tint.r, 0.012, 0.995),
      THREE.MathUtils.clamp(tint.g, 0.012, 0.995),
      THREE.MathUtils.clamp(tint.b, 0.012, 0.995),
    ),
    attenuationDistance: uniforms.uLensOptics.value.x,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    envMapIntensity: 1,
    dithering: true,
  });

  extend(material, {
    key: `audi-lens-${prismatic ? 'prism' : 'smooth'}-v1`,
    uniforms,
    defines: prismatic ? { AUDI_PRISMATIC: 1 } : undefined,
    expandChunks: ['lights_fragment_begin', 'transmission_fragment'],
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${LENS_PRELUDE}` },
      { find: '#include <color_fragment>', replace: `$&\n${LENS_SETUP}` },
      {
        find: 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        replace: `$&\n${LENS_GLINT}`,
        all: true,
      },
      { find: '#include <lights_fragment_end>', replace: `$&\n${LENS_APPLY}` },
      {
        // True slab path, plus the extra depth of a prism valley. A lens is
        // banded light-to-dark at prism pitch because of this, not because of
        // any shading on its surface.
        find: 'material.thickness = thickness;',
        replace: 'material.thickness = thickness * audiLensThickScale;',
      },
      {
        find: 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
        replace: /* glsl */ `$&
// The dye is a scattering medium, not just an absorber: the body stays
// luminous in shade instead of going to a dead black. This is the difference
// between a lamp that glows and a lamp that is a red sticker.
totalDiffuse += (irradiance + iblIrradiance) * RECIPROCAL_PI * audiLensAbsorb * uLensBody.y;
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Bulb / filament surfaces
// ---------------------------------------------------------------------------

/**
 * An emitting surface — a lit filament, a bulb envelope, an illuminated
 * instrument face.
 *
 * The rim lift is the detail worth having: a glowing diffuser is brighter at
 * its silhouette than at its centre, because you are looking through more of
 * the emitting volume. Without it a lit bulb reads as a flat disc of colour.
 */
export function createEmissive(color: number, intensity: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: new THREE.Color().setHex(color, THREE.SRGBColorSpace),
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0,
    toneMapped: true,
  });

  extend(material, {
    key: 'audi-emissive-v1',
    fragment: [
      {
        find: '#include <emissivemap_fragment>',
        replace: /* glsl */ `$&
{
  float audiNdV = saturate(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance *= mix(1.0, 2.4, pow(1.0 - audiNdV, 2.5));
}
`,
      },
    ],
  });

  return material;
}

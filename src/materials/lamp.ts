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
vec3 audiLensBack = vAudiObjPos + audiLensRay * audiLensPath;

// Flutes run across the lens' long axis; a lamp that faces sideways (a marker
// in a bumper end) gets the other axis so the prisms never go degenerate.
vec3 audiLensAxis = abs(audiLensNObj.x) > 0.7 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
vec3 audiAcross = normalize(audiLensAxis - audiLensNObj * dot(audiLensAxis, audiLensNObj) + vec3(1e-5));
vec3 audiAlong = normalize(cross(audiLensNObj, audiAcross));

vec3 audiFacetObj = audiLensNObj;
#ifdef AUDI_PRISMATIC
  audiFacetObj = audiPrismNormal(audiFacetObj, audiAcross, dot(audiLensBack, audiAcross),
                                 uLensOptics.y, uLensOptics.z);
  audiFacetObj = normalize(audiPrismNormal(audiFacetObj, audiAlong, dot(audiLensBack, audiAlong),
                                           uLensOptics.y * uLensBody.w, uLensOptics.z * 0.24));
#endif
vec3 audiFacetV = normalize(audiObjToView(audiLensFr, audiFacetObj));

// Total internal reflection is the whole point of a moulded prism. Looking
// out through acrylic, anything steeper than the critical angle (42°) is
// reflected *completely* rather than at the 4 % a flat interface would give,
// so the facets that happen to exceed it blaze while their neighbours stay
// dark. That hard split between adjacent facet families is the pattern a
// period lamp actually shows, and nothing else reproduces it.
float audiLensCosI = abs(dot(audiLensRay, audiFacetObj));
float audiCritCos = sqrt(max(1.0 - 1.0 / (uLensIor * uLensIor), 0.0));
float audiTir = 1.0 - smoothstep(audiCritCos - 0.06, audiCritCos + 0.06, audiLensCosI);

float audiPrismH = 1.0;
#ifdef AUDI_PRISMATIC
  audiPrismH = audiPrismHeight(dot(audiLensBack, audiAcross), uLensOptics.y) * 0.68
             + audiPrismHeight(dot(audiLensBack, audiAlong), uLensOptics.y * uLensBody.w) * 0.32;
  // The prism is cut *into* the back of the slab, so a valley sits most of a
  // millimetre deeper than a ridge and the light crossing it is absorbed that
  // much harder. This is what banks the lens light-to-dark at prism pitch and
  // gives the part its thickness; without it the flutes are only a normal map.
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
  vec3 audiLh = normalize(directLight.direction + geometryViewDir);
  float audiLnl = saturate(dot(geometryNormal, directLight.direction));
  float audiLfh = saturate(dot(audiFacetV, audiLh));
  audiLensGlint += directLight.color * audiLnl * pow(audiLfh, 320.0) * 0.55 * mix(0.1, 1.0, audiTir);
}
`;

const LENS_APPLY = /* glsl */ `
{
  vec3 audiInternal = audiLensGlint;
  #ifdef USE_ENVMAP
    audiInternal += getIBLRadiance(geometryViewDir, audiFacetV, uLensBody.z)
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
    uLensBody: { value: new THREE.Vector4(1.0, 0.40, 0.07, 0.30) },
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

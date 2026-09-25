/**
 * Laminated automotive glazing.
 *
 * ## Why transmission rather than a transparent blend
 *
 * The one thing glass must get right is that it is *the same material* read
 * from both sides. From outside, a windscreen at 60° is almost a mirror and
 * you can barely see the dashboard; from the driver's seat the same pane is
 * clear, because you are looking through it near-normal. Both fall straight
 * out of Fresnel — but only if the transmitted light is actually attenuated by
 * `1 - F`, which an alpha blend cannot express: `src·a + dst·(1-a)` has no
 * per-channel tint on `dst`, so a blended pane can be dark *or* green, never
 * green in proportion to how far the light travelled through it.
 *
 * three's transmission path does exactly the right integral —
 * `(1 - F) · diffuseColor · e^(-σ·d) · background` — so that is what this uses.
 *
 * ## Path length
 *
 * three measures `d` as the constant `thickness`. Real path length through a
 * slab is `thickness / cos θ_t`, which at the edge of a windscreen is a third
 * longer than at the centre; that is where the green in green glass comes
 * from. The chunk is patched here to use the true path, so the tint deepens
 * towards grazing on its own rather than being painted on.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

export interface GlassOptions {
  /** Body colour of the laminate. Defaults to automotive green. */
  tint?: number;
  /** <1 turns on alpha blending as well; normally leave alone. */
  opacity?: number;
  /** The inner skin of a two-sided pane: no grime, dimmer reflections. */
  interiorSide?: boolean;
}

/**
 * Laminated soda-lime glass with a PVB interlayer, measured at the reference
 * path length below. Deliberately *not* `TRIM_COLORS.glassTint`: that value
 * was sampled off the photograph, where the glazing reads as a dark blue-grey
 * because it is dominated by what it reflects, not by what it transmits. Used
 * as an absorption colour it would produce near-black windows.
 */
const LAMINATE_GREEN = new THREE.Color(0.34, 0.66, 0.44);

/** Path over which `attenuationColor` is reached exactly. */
const REFERENCE_PATH = 0.055;

/** Windscreen laminate: 2 × 2.1 mm float + 0.76 mm PVB. */
const GLASS_THICKNESS = 0.005;

const GLASS_IOR = 1.52;

/**
 * Normalise a caller's tint to an absorption colour: hue is kept, brightness is
 * pinned, so passing a very dark "tint" tints the glass instead of blacking it.
 */
function toAbsorption(hex: number): THREE.Color {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const peak = Math.max(c.r, c.g, c.b, 1e-4);
  return c.multiplyScalar(0.62 / peak).lerp(LAMINATE_GREEN, 0.45);
}

const GLASS_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
// x grime  y waviness slope  z waviness scale (cells/m)  w 2nd-surface gain
uniform vec4 uGlassParams;
uniform vec3 uGrimeColor;

${GLSL_LIB}
${GLSL_SURFACE}

/** Path through a slab relative to its thickness, for a view at cos = NdV. */
float audiSlabPath(float NdV, float ior) {
  float c = clamp(NdV, 0.02, 1.0);
  float sin2 = 1.0 - c * c;
  float cosT = sqrt(max(1.0 - sin2 / (ior * ior), 0.0));
  return clamp(1.0 / max(cosT, 0.30), 1.0, 3.2);
}
`;

/**
 * Grime is computed early (before `normal` exists) from the *object* normal,
 * because how dirty a pane gets is mostly a question of how far it is from
 * horizontal: a raked windscreen collects everything the road throws, a
 * vertical door glass sheds it.
 */
const GLASS_GRIME = /* glsl */ `
vec3 audiGlassN = normalize(vAudiObjNormal);
float audiGrime = 0.0;
if (uGlassParams.x > 0.0) {
  float rake = smoothstep(0.0, 0.8, audiGlassN.y);
  // Rain runs down, and what it carries dries in vertical streaks.
  float streak = audiStreak(vAudiObjPos, vec3(0.0, 1.0, 0.0), 260.0, 9.0);
  float film = audiFbm2(vAudiObjPos * 34.0);
  audiGrime = uGlassParams.x * mix(0.30, 1.0, rake) * (film * 0.55 + streak * 0.45);
}
`;

export function createGlass(opts: GlassOptions = {}): THREE.MeshPhysicalMaterial {
  const interior = opts.interiorSide === true;
  const absorption = toAbsorption(opts.tint ?? TRIM_COLORS.glassTint);

  const uniforms = {
    uGlassParams: {
      value: new THREE.Vector4(
        interior ? 0.0 : 0.5,
        // Float glass is drawn over a tin bath and never comes out flat: long,
        // very shallow waves. You only notice them because a straight reflected
        // edge bends as it crosses the pane — which is exactly the tell.
        interior ? 0.0022 : 0.0045,
        7.0,
        interior ? 0.02 : 0.05,
      ),
    },
    uGrimeColor: { value: new THREE.Color(0.32, 0.30, 0.27) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Near-white: this multiplies what comes *through*, and the colour is
    // supposed to arrive from absorption over distance, not from a flat tint.
    color: 0xf7faf8,
    metalness: 0,
    roughness: 0.02,
    ior: GLASS_IOR,
    transmission: 1,
    thickness: GLASS_THICKNESS,
    attenuationColor: absorption,
    attenuationDistance: REFERENCE_PATH,
    specularIntensity: 1,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    side: THREE.FrontSide,
  });

  extend(material, {
    key: interior ? 'audi-glass-inner-v1' : 'audi-glass-v1',
    uniforms,
    expandChunks: ['transmission_fragment'],
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${GLASS_PRELUDE}` },
      { find: '#include <color_fragment>', replace: `$&\n${GLASS_GRIME}` },
      {
        // Grime blurs what you see through the pane as well as what it
        // reflects, because three drives the refraction blur off roughness.
        find: '#include <roughnessmap_fragment>',
        replace: '$&\nroughnessFactor = clamp(roughnessFactor + audiGrime * 0.22, 0.0, 1.0);',
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float w = audiFbm2(vAudiObjPos * uGlassParams.z) - 0.5;
  float amp = uGlassParams.y / (6.2831853 * uGlassParams.z);
  float h = w * amp + (audiNoise(vAudiObjPos * 190.0) - 0.5) * audiGrime * 0.00004;
  normal = audiBump(-vViewPosition, normal, dFdx(h), dFdy(h), 1.0);
}
`,
      },
      {
        find: 'material.thickness = thickness;',
        replace: 'material.thickness = thickness * audiSlabPath(dot(normal, normalize(vViewPosition)), material.ior);',
      },
      {
        // Second-surface reflection. A pane has two interfaces, and the ghost
        // off the back one is the reason a reflection in car glass is never
        // quite single. ~4 % of the primary, and displaced by the refraction.
        find: 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
        replace: /* glsl */ `$&
#ifdef USE_ENVMAP
  {
    vec3 ghostDir = refract(-geometryViewDir, geometryNormal, 1.0 / material.ior);
    totalSpecular += getIBLRadiance(-ghostDir, geometryNormal, material.roughness + 0.04)
                   * uGlassParams.w * material.attenuationColor;
  }
#endif
if (audiGrime > 0.0) {
  // Dust is a thin scattering layer on top of the glass: you see it when the
  // view skims the pane, and hardly at all looking straight through.
  float graze = pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 2.2);
  totalDiffuse += uGrimeColor * audiGrime * (0.18 + graze * 1.3)
                * (irradiance + iblIrradiance) * RECIPROCAL_PI;
}
`,
      },
    ],
  });

  return material;
}

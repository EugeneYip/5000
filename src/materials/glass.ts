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

/** Windscreen laminate: 2 × 2.1 mm float + 0.76 mm PVB. */
const GLASS_THICKNESS = 0.005;

/**
 * Internal transmittance of the laminate over one `GLASS_THICKNESS`, per
 * channel. Because `attenuationDistance` is set to the same thickness, this
 * value *is* the transmittance at normal incidence rather than a coefficient
 * that has to be exponentiated in your head, and `audiSlabPath` deepens it
 * towards grazing from there.
 *
 * Green-tinted float, which is what the C3 was glazed with: more transmissive
 * through the green than at either end, hence the 1.19 green-to-red ratio.
 * Scaled so the **net** figure — after the two surface reflections three takes
 * off as `1 - F` — is 0.757 luminous, against the ≥0.70 that FMVSS 205 and ECE
 * R43 require of a windscreen and of front side glass, and the 0.75–0.78 a
 * tinted laminate of this era measures.
 *
 * It was 0.86 net, i.e. near-water-clear, and that is a third of why the
 * glazing read as milky: a pane that passes 86 % of a bright backdrop cannot
 * be darker than its surroundings no matter what it reflects.
 *
 * Deliberately *not* `TRIM_COLORS.glassTint`: that value was sampled off the
 * photograph, where the glazing reads as a dark blue-grey because it is
 * dominated by what it reflects, not by what it transmits. Used here it would
 * produce near-black windows.
 */
const LAMINATE_TRANSMITTANCE = new THREE.Color(0.72, 0.86, 0.78);

const GLASS_IOR = 1.52;

/**
 * Reflectance of a glass **pane** relative to one air→glass interface.
 *
 * three models a single interface: `F0 = ((n-1)/(n+1))² = 0.0426`. A pane has
 * two, and the light that comes back off the inner one has been through the
 * glass twice but is otherwise the same reflection of the same sky, so for an
 * untinted slab the total is `2R/(1+R) = 0.0817` — ~1.92× the single interface.
 *
 * Putting it here rather than adding a second `getIBLRadiance` lookup is the
 * point. What used to be here added the inner surface's return as a *constant*
 * fraction of the raw environment radiance, with no Fresnel weighting at all:
 * on `side` it was worth a flat +11.3 grey levels across every pane and 18 % of
 * their local contrast, it lifted the pane's blacks more than its whites, and
 * it could not produce the displaced double image its comment claimed —
 * `getIBLRadiance` at roughness 0.06 on a 256 px PMREM face has no image left
 * in it to displace. Folded into `specularIntensity` it is Fresnel-weighted by
 * construction, reaches 1 at grazing like the real thing, stays energy-
 * consistent with the `1 - F` three applies to the transmitted term, and costs
 * one fewer cubemap fetch per glass fragment.
 */
const PANE_INTERFACES = 1.92;

/**
 * Normalise a caller's tint to a transmittance: hue is kept, luminance is
 * pinned to the laminate's, so passing a very dark "tint" tints the glass
 * instead of blacking it.
 */
function toTransmittance(hex: number): THREE.Color {
  const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  const peak = Math.max(c.r, c.g, c.b, 1e-4);
  c.multiplyScalar(0.62 / peak).lerp(LAMINATE_TRANSMITTANCE, 0.55);
  return c.multiplyScalar(luma(LAMINATE_TRANSMITTANCE) / Math.max(luma(c), 1e-4));
}

const GLASS_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
// x grime  y waviness slope  z waviness scale (cells/m)
uniform vec3 uGlassParams;
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
  const transmittance = toTransmittance(opts.tint ?? TRIM_COLORS.glassTint);

  const uniforms = {
    uGlassParams: {
      value: new THREE.Vector3(
        // The reference car is clean. This was 0.5, and because grime is also
        // wired into `roughnessFactor` below — which is what three drives the
        // refraction blur off — half of it was being spent blurring the view
        // THROUGH the pane rather than dirtying its surface.
        interior ? 0.0 : 0.22,
        // Float glass is drawn over a tin bath and never comes out flat: long,
        // very shallow waves. You only notice them because a straight reflected
        // edge bends as it crosses the pane — which is exactly the tell.
        interior ? 0.0022 : 0.0045,
        7.0,
      ),
    },
    uGrimeColor: { value: new THREE.Color(0.32, 0.30, 0.27) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    // White, so the only thing tinting the transmitted light is the absorption
    // over distance. This used to be 0xf7faf8, a second near-white multiplier
    // on the same quantity, which made the net transmittance two numbers in two
    // places instead of the one `LAMINATE_TRANSMITTANCE` now states outright.
    color: 0xffffff,
    metalness: 0,
    // Float glass is about as smooth as a made surface gets, and here the
    // number does double duty: three's `getTransmissionSample` takes its mip
    // level as `log2(samplerWidth) · roughness`, so roughness is also the blur
    // on everything seen through the pane. At 0.02 that was lod 0.20 on top of
    // a transmission buffer already running at 0.6 of frame width.
    roughness: 0.010,
    ior: GLASS_IOR,
    transmission: 1,
    thickness: GLASS_THICKNESS,
    attenuationColor: transmittance,
    // Equal to `thickness`, which is what makes `attenuationColor` the
    // normal-incidence transmittance rather than an exponent.
    attenuationDistance: GLASS_THICKNESS,
    specularIntensity: PANE_INTERFACES,
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
        // Which is why the coupling is 0.06 and not the 0.22 it was: at 0.22 a
        // clean pane's roughness more than doubled, the refraction mip went
        // 0.20 → 0.42, and the transmitted image lost the hard edges that are
        // the whole read of flush glazing.
        find: '#include <roughnessmap_fragment>',
        replace: '$&\nroughnessFactor = clamp(roughnessFactor + audiGrime * 0.06, 0.0, 1.0);',
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
        // The inner surface's return is in `specularIntensity`, not here — see
        // `PANE_INTERFACES`.
        find: 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
        replace: /* glsl */ `$&
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

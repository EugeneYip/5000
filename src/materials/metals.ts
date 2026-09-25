/**
 * Metals: brightwork, wheels, brake iron, reflector optics.
 *
 * The thing all four have in common is that a perfect mirror looks *fake*. A
 * real chrome strip is roll-formed and has a long, shallow waviness; a cast
 * wheel is sand-grained over most of its face and machined bright only on the
 * lip; a brake disc is polished by its pads in a band and rusts everywhere
 * else. Each of these materials is therefore two finishes with a boundary,
 * because that boundary is what the eye uses to decide the part is real.
 */

import * as THREE from 'three';
import { BRAKES, TRIM_COLORS, WHEEL } from '@/spec';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

const TAU = 6.2831853;

const METAL_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
${GLSL_LIB}
${GLSL_SURFACE}

/** Height of a wave of 'slope' at 'freq' cells/m. Keeps the *angle* fixed when
 *  the scale is retuned, which is the property you are actually art-directing. */
float audiSlopeAmp(float slope, float freq) {
  return slope / (${TAU.toFixed(7)} * freq);
}
`;

// ---------------------------------------------------------------------------
// Chrome / brightwork
// ---------------------------------------------------------------------------

export interface ChromeOptions {
  /** ≤0.08 polished (the rings, the reveal); above that it brushes. */
  roughness?: number;
  /** Object-space direction the brush marks run. Most C3 brightwork is fore-aft. */
  brushAxis?: THREE.Vector3;
}

export function createChrome(opts: ChromeOptions = {}): THREE.MeshPhysicalMaterial {
  const roughness = opts.roughness ?? 0.045;
  // Below the threshold it is polished plate; above it the part is a brushed
  // anodised extrusion, and the marks are what carry the roughness.
  const brush = THREE.MathUtils.clamp((roughness - 0.07) / 0.35, 0, 1);

  const uniforms = {
    // x waviness slope  y waviness cells/m  z brush slope  w brush cells/m
    uChromeParams: { value: new THREE.Vector4(0.016, 9.0, brush * 0.5, 4200.0) },
    uBrushAxis: { value: (opts.brushAxis ?? new THREE.Vector3(0, 0, 1)).clone().normalize() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.chrome,
    metalness: 1,
    // Brushing lives in the normal, so the base stays near-mirror and only
    // picks up the floor it needs to stop the highlight aliasing.
    roughness: THREE.MathUtils.lerp(roughness, 0.09, brush),
    envMapIntensity: 1,
    dithering: true,
  });

  extend(material, {
    key: `audi-chrome-${brush > 0 ? 'brushed' : 'polished'}-v1`,
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${METAL_PRELUDE}\nuniform vec4 uChromeParams;\nuniform vec3 uBrushAxis;` },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
if (uChromeParams.z > 0.0) {
  // Sub-pixel brush marks hand their energy to roughness rather than
  // disappearing, so a door strip does not turn back into a mirror at distance.
  float res = audiResolved(vAudiObjPos * uChromeParams.w);
  roughnessFactor = clamp(roughnessFactor + (1.0 - res) * uChromeParams.z * 0.55, 0.0, 1.0);
}
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  vec3 nObj = normalize(vAudiObjNormal);
  float h = (audiFbm2(vAudiObjPos * uChromeParams.y) - 0.5)
          * audiSlopeAmp(uChromeParams.x, uChromeParams.y);
  if (uChromeParams.z > 0.0) {
    vec3 dir = uBrushAxis - nObj * dot(uBrushAxis, nObj);
    float len = length(dir);
    dir = len > 0.25 ? dir / len : normalize(cross(nObj, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
    float res = audiResolved(vAudiObjPos * uChromeParams.w);
    h += (audiStreak(vAudiObjPos, dir, uChromeParams.w, 30.0) - 0.5)
       * audiSlopeAmp(uChromeParams.z, uChromeParams.w) * res;
  }
  normal = audiBump(-vViewPosition, normal, dFdx(h), dFdy(h), 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Wheel alloy
// ---------------------------------------------------------------------------

/**
 * Cast aluminium with a machined lip.
 *
 * Zones are keyed off the radius about the **local +X axis through the object
 * origin** — the axle line. A wheel built anywhere else in its own object
 * space will still look like metal, it just loses the lip/face distinction.
 */
export function createAlloy(opts: { polished?: boolean } = {}): THREE.MeshPhysicalMaterial {
  const rimRadius = (WHEEL.rimDiameterIn * 0.0254) / 2;
  // The turned band on this generation of Audi alloy is the outer lip only.
  const machinedFrom = opts.polished ? -1 : rimRadius * 0.86;

  const uniforms = {
    // x machined-from radius (m)  y turning pitch (m)  z cast grain cells/m  w grime
    uAlloyParams: { value: new THREE.Vector4(machinedFrom, 0.00035, 1100.0, opts.polished ? 0.25 : 0.7) },
    // x cast roughness  y machined roughness  z ring slope  w cast slope
    uAlloyFinish: { value: new THREE.Vector4(0.33, 0.19, 0.06, 0.22) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xc9ccd1,
    metalness: 1,
    roughness: 0.3,
    envMapIntensity: 1,
    dithering: true,
  });

  extend(material, {
    key: opts.polished ? 'audi-alloy-polished-v1' : 'audi-alloy-cast-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${METAL_PRELUDE}\nuniform vec4 uAlloyParams;\nuniform vec4 uAlloyFinish;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiWheelR;
float audiRings = audiTurned(vAudiObjPos, uAlloyParams.y, audiWheelR);
float audiMachined = smoothstep(uAlloyParams.x - 0.005, uAlloyParams.x + 0.003, audiWheelR);
float audiCast = audiGrain(vAudiObjPos, uAlloyParams.z, 3.3);
// Cast aluminium is duller and a shade darker than the machined face, and the
// brake dust that never washes out lives in the bottom of the grain.
float audiCastTone = mix(0.80, 1.0, audiCast) * mix(1.0, 0.72, (1.0 - audiCast) * uAlloyParams.w);
diffuseColor.rgb *= mix(audiCastTone, mix(0.96, 1.04, audiRings), audiMachined);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
{
  float resC = audiResolved(vAudiObjPos * uAlloyParams.z);
  float resR = audiResolved1(audiWheelR / uAlloyParams.y);
  float castR = uAlloyFinish.x + (1.0 - resC) * 0.05;
  float machR = uAlloyFinish.y + (1.0 - resR) * 0.10;
  roughnessFactor = clamp(mix(castR, machR, audiMachined), 0.02, 1.0);
}
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float resC = audiResolved(vAudiObjPos * uAlloyParams.z);
  float resR = audiResolved1(audiWheelR / uAlloyParams.y);
  float h = (audiCast - 0.5) * audiSlopeAmp(uAlloyFinish.w, uAlloyParams.z) * (1.0 - audiMachined) * resC
          + (audiRings - 0.5) * audiSlopeAmp(uAlloyFinish.z, 1.0 / uAlloyParams.y) * audiMachined * resR;
  normal = audiBump(-vViewPosition, normal, dFdx(h), dFdy(h), 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Brake disc
// ---------------------------------------------------------------------------

/**
 * Grey cast iron: a swept band polished bright by the pads, a rust-brown hat
 * inside it and a rust-brown ledge outside it. A car that has been driven this
 * week has exactly this, and a disc without it reads as a plastic prop.
 */
export function createBrakeDisc(): THREE.MeshPhysicalMaterial {
  const rRef = BRAKES.discDiameterFront / 2;

  const uniforms = {
    // x reference radius  y groove pitch  z swept inner (frac)  w swept outer (frac)
    uDiscParams: { value: new THREE.Vector4(rRef, 0.0016, 0.46, 0.945) },
    uDiscIron: { value: new THREE.Color().setHex(0x70757a, THREE.SRGBColorSpace) },
    uDiscRust: { value: new THREE.Color().setHex(0x4e3322, THREE.SRGBColorSpace) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.4,
    envMapIntensity: 0.85,
  });

  extend(material, {
    key: 'audi-brakedisc-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      {
        find: '#include <common>',
        replace: `$&\n${METAL_PRELUDE}\nuniform vec4 uDiscParams;\nuniform vec3 uDiscIron;\nuniform vec3 uDiscRust;`,
      },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiDiscR;
float audiDiscGroove = audiTurned(vAudiObjPos, uDiscParams.y, audiDiscR);
float audiRn = audiDiscR / uDiscParams.x;
float audiBlot = audiFbm2(vAudiObjPos * 110.0);
// The pad does not wear a perfect annulus — the edges wander and pit.
float audiSwept = smoothstep(uDiscParams.z - 0.04, uDiscParams.z + 0.03, audiRn + (audiBlot - 0.5) * 0.06)
                * (1.0 - smoothstep(uDiscParams.w - 0.03, uDiscParams.w + 0.02, audiRn + (audiBlot - 0.5) * 0.05));
float audiRust = (1.0 - audiSwept) * (0.45 + 0.55 * audiBlot);
vec3 audiIron = uDiscIron * mix(0.62, 1.0, audiSwept) * mix(0.94, 1.06, audiDiscGroove);
diffuseColor.rgb *= mix(audiIron, uDiscRust * mix(0.65, 1.0, audiBlot), audiRust);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
{
  float resG = audiResolved1(audiDiscR / uDiscParams.y);
  roughnessFactor = clamp(mix(0.78, 0.38 + (1.0 - resG) * 0.10, audiSwept) + audiRust * 0.16, 0.05, 1.0);
}
`,
      },
      {
        // Rust is an oxide, not a metal: it has to lose its metalness or the
        // whole disc keeps reflecting the sky like a mirror.
        find: '#include <metalnessmap_fragment>',
        replace: '$&\nmetalnessFactor = mix(metalnessFactor, 0.08, audiRust);',
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float resG = audiResolved1(audiDiscR / uDiscParams.y);
  vec3 radial = normalize(vAudiObjPos + vec3(1e-5));
  float h = (audiDiscGroove - 0.5) * audiSlopeAmp(0.10, 1.0 / uDiscParams.y) * audiSwept * resG
          + (audiStreak(vAudiObjPos, radial, 900.0, 14.0) - 0.5) * audiSlopeAmp(0.35, 900.0) * audiRust;
  normal = audiBump(-vViewPosition, normal, dFdx(h), dFdy(h), 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Lamp reflector
// ---------------------------------------------------------------------------

/**
 * Stippled aluminised bowl.
 *
 * An unlit lamp is mostly reflector, and a smooth metal bowl renders as a black
 * hole because every ray in it points back into the lamp housing. Pebbling the
 * surface fans those rays out over a wide cone, so the bowl picks up sky and
 * ground and reads as the deep optical assembly it is.
 */
export function createReflector(): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x cells/m  y dimple depth  z gap darkening  w unused
    uReflParams: { value: new THREE.Vector4(150.0, 0.52, 0.14, 0.0) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Vacuum-deposited aluminium, ~88 % broadband.
    color: 0xe8e9ec,
    metalness: 1,
    roughness: 0.10,
    envMapIntensity: 1.15,
    dithering: true,
  });

  extend(material, {
    key: 'audi-reflector-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${METAL_PRELUDE}\nuniform vec4 uReflParams;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiDimpleMask;
vec3 audiReflNObj = audiDimpleNormal(vAudiObjPos, normalize(vAudiObjNormal),
                                     uReflParams.x, uReflParams.y, audiDimpleMask);
diffuseColor.rgb *= 1.0 - uReflParams.z * (1.0 - audiDimpleMask);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
roughnessFactor = clamp(roughnessFactor + (1.0 - audiResolvedTight(vAudiObjPos * uReflParams.x)) * 0.30, 0.02, 1.0);
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  AudiFrame fr = audiMakeFrame(vAudiObjPos, -vViewPosition);
  normal = normalize(audiObjToView(fr, audiReflNObj));
}
`,
      },
    ],
  });

  return material;
}

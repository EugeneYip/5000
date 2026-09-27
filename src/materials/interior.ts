/**
 * Cabin materials: grained plastics, seat cloth, carpet.
 *
 * Interiors are lit almost entirely by bounce, so they have very little
 * specular to hide behind — a cabin is where flat materials are most obvious.
 * The three here each carry one structural idea:
 *
 *  - **plastic**: the same moulded grain as the bumpers but finer, plus the
 *    dust that lives in it. Period Audi anthracite is a low, even sheen.
 *  - **cloth**: a real plain weave, over-one-under-one, with the yarn
 *    cross-section shading each thread and a sheen lobe for the grazing bloom
 *    that every textile has and no dielectric BRDF produces on its own.
 *  - **carpet**: a direction field. Cut pile takes a set, so it shows broad
 *    bands that reverse as you move past them.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

const TAU = 6.2831853;

const CABIN_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
${GLSL_LIB}
${GLSL_SURFACE}

float audiSlopeAmp(float slope, float freq) {
  return slope / (${TAU.toFixed(7)} * freq);
}
`;

// ---------------------------------------------------------------------------
// Cabin plastic
// ---------------------------------------------------------------------------

export function createInteriorPlastic(opts: { color?: number; roughness?: number } = {}): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x grain cells/m  y grain slope  z dust cells/m  w dust amount
    uCabinGrain: { value: new THREE.Vector4(1300.0, 0.50, 30.0, 0.07) },
    uCabinDust: { value: new THREE.Color(0.34, 0.33, 0.31) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? TRIM_COLORS.interiorPlastic,
    metalness: 0,
    roughness: opts.roughness ?? 0.7,
    sheen: 0.14,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0.19, 0.19, 0.20),
    envMapIntensity: 0.55,
  });

  extend(material, {
    key: 'audi-cabin-plastic-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${CABIN_PRELUDE}\nuniform vec4 uCabinGrain;\nuniform vec3 uCabinDust;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiCabinG = audiGrain(vAudiObjPos, uCabinGrain.x, 3.3);
float audiCabinRes = audiResolved(vAudiObjPos * uCabinGrain.x);
// Dust settles on the up-facing surfaces — the top of the dash pad, the
// parcel shelf — and hardly at all on the vertical door cards.
float audiUp = smoothstep(0.25, 0.9, normalize(vAudiObjNormal).y);
float audiCabinDustAmt = uCabinGrain.w * audiUp * (0.4 + 0.6 * audiFbm2(vAudiObjPos * uCabinGrain.z));
diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.9, 1.06, mix(0.5, audiCabinG, audiCabinRes)),
                       uCabinDust, audiCabinDustAmt);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
roughnessFactor = clamp(roughnessFactor + (1.0 - mix(0.5, audiCabinG, audiCabinRes)) * 0.14
                        + audiCabinDustAmt * 0.6, 0.05, 1.0);
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float h = (audiCabinG - 0.5) * audiSlopeAmp(uCabinGrain.y, uCabinGrain.x) * audiCabinRes;
  // Creased height: bound the gradient or the creases print as white grit.
  vec2 audiCabinGrad = audiBoundGradient(h, vAudiObjPos, uCabinGrain.y);
  normal = audiBump(-vViewPosition, normal, audiCabinGrad.x, audiCabinGrad.y, 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Seat and door-card cloth
// ---------------------------------------------------------------------------

export function createFabric(opts: { color?: number } = {}): THREE.MeshPhysicalMaterial {
  const base = new THREE.Color().setHex(opts.color ?? TRIM_COLORS.interiorFabric, THREE.SRGBColorSpace);

  const uniforms = {
    // x yarns/m  y normal amplitude  z yarn tone variance  w valley occlusion
    uWeaveParams: { value: new THREE.Vector4(620.0, 0.30, 0.16, 0.40) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? TRIM_COLORS.interiorFabric,
    metalness: 0,
    roughness: 0.88,
    // The fabric lobe: broad, retro-reflective at grazing. This is the whole
    // reason cloth reads as cloth and not as rough paint.
    sheen: 0.45,
    sheenRoughness: 0.85,
    sheenColor: base.clone().lerp(new THREE.Color(1, 1, 1), 0.25),
    envMapIntensity: 0.5,
  });

  extend(material, {
    key: 'audi-fabric-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${CABIN_PRELUDE}\nuniform vec4 uWeaveParams;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiWeaveH;
float audiWeaveShade;
vec3 audiWeaveNObj = audiWeaveNormal(vAudiObjPos, normalize(vAudiObjNormal),
                                     uWeaveParams.x, uWeaveParams.y, audiWeaveH, audiWeaveShade);
float audiWeaveRes = audiResolvedTight(vAudiObjPos * uWeaveParams.x);
// Light does not reach the bottom of the weave: the crossings self-shadow,
// and that micro-occlusion is most of the depth you see in a close-up.
float audiWeaveAo = mix(1.0, mix(1.0 - uWeaveParams.w, 1.0, clamp(audiWeaveH, 0.0, 1.0)), audiWeaveRes);
diffuseColor.rgb *= audiWeaveAo * (1.0 + audiWeaveShade * uWeaveParams.z);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: '$&\nroughnessFactor = clamp(roughnessFactor - audiWeaveH * 0.06 * audiWeaveRes, 0.1, 1.0);',
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  AudiFrame fr = audiMakeFrame(vAudiObjPos, -vViewPosition);
  normal = normalize(audiObjToView(fr, audiWeaveNObj));
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Carpet
// ---------------------------------------------------------------------------

export function createCarpet(): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x nap field cells/m  y nap contrast  z fibre cells/m  w fibre contrast
    uCarpetParams: { value: new THREE.Vector4(11.0, 0.26, 750.0, 0.30) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.carpet,
    metalness: 0,
    roughness: 0.96,
    sheen: 0.45,
    sheenRoughness: 0.95,
    sheenColor: new THREE.Color(0.24, 0.25, 0.26),
    envMapIntensity: 0.45,
  });

  extend(material, {
    key: 'audi-carpet-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${CABIN_PRELUDE}\nuniform vec4 uCarpetParams;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
{
  AudiFrame fr = audiMakeFrame(vAudiObjPos, -vViewPosition);
  vec3 nObj = normalize(vAudiObjNormal);
  vec3 nap = audiNapDirection(vAudiObjPos, nObj, uCarpetParams.x);
  vec3 viewObj = normalize(audiViewToObj(fr, normalize(vViewPosition)));
  vec3 viewTan = viewObj - nObj * dot(viewObj, nObj);
  // Looking along the lie of the pile you see the sides of the fibres; looking
  // into it you see the shadowed base. That is the vacuum-stripe effect.
  float align = dot(normalize(viewTan + vec3(1e-5)), nap);
  float fibre = audiNoise(vAudiObjPos * uCarpetParams.z);
  float res = audiResolved(vAudiObjPos * uCarpetParams.z);
  diffuseColor.rgb *= (1.0 + align * uCarpetParams.y)
                    * (1.0 + (fibre - 0.5) * uCarpetParams.w * res);
  // Cut pile lightens at grazing: at a glancing angle you see the tips rather
  // than down between them.
  float ndv = saturate(dot(nObj, viewObj));
  diffuseColor.rgb *= mix(1.18, 0.88, ndv);
}
`,
      },
    ],
  });

  return material;
}

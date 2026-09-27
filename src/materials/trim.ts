/**
 * Exterior non-metal trim: satin black surrounds, grained bumper cladding,
 * tyre rubber.
 *
 * These three are the materials most often got wrong on a period German car,
 * and always in the same direction — too smooth. A C3's bumper is a coarse
 * moulded grain you can feel; its window surrounds are a satin anodise that is
 * neither gloss nor matte; its tyres are so rough they are nearly Lambertian
 * except where the mould polished the lettering. Smooth, uniform plastic reads
 * as a toy instantly, no matter how good the geometry is.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

const TAU = 6.2831853;

const TRIM_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
${GLSL_LIB}
${GLSL_SURFACE}

float audiSlopeAmp(float slope, float freq) {
  return slope / (${TAU.toFixed(7)} * freq);
}
`;

// ---------------------------------------------------------------------------
// Satin black trim
// ---------------------------------------------------------------------------

/**
 * Black anodised extrusion — window surrounds, the B-pillar cover, wiper arms.
 *
 * The signature is a *soft, broad* highlight that never becomes a mirror and
 * never disappears: roughness around a third, die lines running the length of
 * the section to smear the highlight into a band, and a sheen lobe so the
 * grazing edge lifts to a dusty grey instead of going black.
 */
export function createBlackTrim(opts: { brushAxis?: THREE.Vector3 } = {}): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x die-line slope  y die-line cells/m  z mottle cells/m  w mottle amount
    uTrimParams: { value: new THREE.Vector4(0.045, 9000.0, 45.0, 0.07) },
    uTrimAxis: { value: (opts.brushAxis ?? new THREE.Vector3(0, 0, 1)).clone().normalize() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.blackTrim,
    // A trace of metalness: anodising is a transparent oxide over aluminium,
    // and the cool, slightly metallic cast is what stops it reading as paint.
    metalness: 0.08,
    roughness: 0.34,
    sheen: 0.32,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0.10, 0.11, 0.13),
    envMapIntensity: 0.9,
  });

  extend(material, {
    key: 'audi-blacktrim-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${TRIM_PRELUDE}\nuniform vec4 uTrimParams;\nuniform vec3 uTrimAxis;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiTrimMottle = audiFbm2(vAudiObjPos * uTrimParams.z) - 0.5;
diffuseColor.rgb *= 1.0 + audiTrimMottle * uTrimParams.w;
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
{
  float res = audiResolved(vAudiObjPos * uTrimParams.y);
  roughnessFactor = clamp(roughnessFactor + audiTrimMottle * 0.10 + (1.0 - res) * 0.06, 0.05, 1.0);
}
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  vec3 nObj = normalize(vAudiObjNormal);
  vec3 dir = uTrimAxis - nObj * dot(uTrimAxis, nObj);
  float len = length(dir);
  dir = len > 0.25 ? dir / len : normalize(cross(nObj, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
  float res = audiResolved(vAudiObjPos * uTrimParams.y);
  float h = (audiStreak(vAudiObjPos, dir, uTrimParams.y, 40.0) - 0.5)
          * audiSlopeAmp(uTrimParams.x, uTrimParams.y) * res;
  normal = audiBump(-vViewPosition, normal, dFdx(h), dFdy(h), 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Bumper / cladding thermoplastic
// ---------------------------------------------------------------------------

/**
 * The C3's grained grey-black bumper and lower cladding.
 *
 * Two things sell it. The **grain** is a moulded cell pattern, not noise: flat
 * plateaus with creases between them, about 0.7 mm across. And the **sheen
 * varies with the grain**: the plateaus were polished by the tool and are
 * slightly glossier than the creases, which is why a bumper glints unevenly as
 * you walk past it. A uniform roughness kills both.
 */
export function createBumperPlastic(): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x grain cells/m  y grain slope  z mottle cells/m  w mottle amount
    uPlasticGrain: { value: new THREE.Vector4(1450.0, 0.55, 9.0, 0.09) },
    // x peak roughness  y crease roughness  z UV-fade lift  w unused
    uPlasticFinish: { value: new THREE.Vector4(0.60, 0.86, 0.10, 0.0) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.bumperPlastic,
    metalness: 0,
    roughness: 0.74,
    // Polypropylene scatters in its top few microns; the sheen lobe is what
    // gives the slightly chalky grazing lift that aged bumper plastic has.
    sheen: 0.18,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0.20, 0.20, 0.21),
    envMapIntensity: 0.85,
  });

  extend(material, {
    key: 'audi-bumper-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${TRIM_PRELUDE}\nuniform vec4 uPlasticGrain;\nuniform vec4 uPlasticFinish;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiGrainH = audiGrain(vAudiObjPos, uPlasticGrain.x, 3.7);
float audiGrainRes = audiResolved(vAudiObjPos * uPlasticGrain.x);
float audiPlasticMottle = audiFbm2(vAudiObjPos * uPlasticGrain.z) - 0.5;
// Sun-faded cladding is blotchy and slightly lighter where it has chalked.
diffuseColor.rgb *= (1.0 + audiPlasticMottle * uPlasticGrain.w)
                  * mix(0.88, 1.06, mix(0.5, audiGrainH, audiGrainRes));
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
{
  // As the grain drops below a pixel its sheen variation folds into the mean
  // roughness, so the panel keeps the same gloss at every distance.
  float g = mix(0.5, audiGrainH, audiGrainRes);
  roughnessFactor = clamp(mix(uPlasticFinish.y, uPlasticFinish.x, g)
                          + audiPlasticMottle * 0.07, 0.05, 1.0);
}
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float h = (audiGrainH - 0.5) * audiSlopeAmp(uPlasticGrain.y, uPlasticGrain.x) * audiGrainRes;
  // The grain is a field of plateaus with creases between them, so its
  // screen-space derivative spikes every time a crease crosses a quad. Left
  // alone those spikes flip the normal skyward on one pixel at a time and
  // print white grit over the whole bumper.
  vec2 audiGrainGrad = audiBoundGradient(h, vAudiObjPos, uPlasticGrain.y);
  normal = audiBump(-vViewPosition, normal, audiGrainGrad.x, audiGrainGrad.y, 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Rubber
// ---------------------------------------------------------------------------

export interface RubberOptions {
  roughness?: number;
  /**
   * Road-film coverage, 0..1.
   *
   * A weatherstrip sits in a gutter and collects a lot; a tyre sidewall is
   * wiped by its own rotation and carries a thin, even film. The default is
   * the seal's.
   */
  dust?: number;
  /**
   * Blotch frequency of that film, cells/m.
   *
   * The default 120 is an 8 mm cell, which is invisible on a 15 mm door seal
   * and reads as **camouflage** on a 130 mm sidewall filling half a close-up —
   * the one number that made the tyre look like wet cardboard. A sidewall
   * wants ~320 (a 3 mm cell), fine enough to read as dirt rather than as
   * pattern.
   */
  dustCells?: number;
  /**
   * How much gloss a moulded character picks up over the carcass around it.
   *
   * Sidewall lettering comes out of a polished cavity in the tool. The default
   * is tuned for a weatherstrip's bead.
   */
  mouldGloss?: number;
  /**
   * Curvature, in 1/m, at which a crease starts to count as moulded relief.
   *
   * A 1.3 mm letter on a surface as large as a sidewall curves hard enough to
   * clear a much lower threshold than a seal's bead does, and letting more of
   * the character's flank count is the difference between a legend you can
   * read in a still and a smudge.
   */
  mouldCurve?: number;
  vertexColors?: boolean;
}

/**
 * Tyre sidewall and weatherstrip.
 *
 * Nearly Lambertian, with a grey bloom of road dust that only shows at grazing
 * angles, and a *sharper* finish wherever the geometry creases — moulded
 * sidewall lettering comes out of a polished cavity in the mould and is
 * visibly glossier than the carcass around it. Curvature is measured per metre
 * rather than per pixel, so the lettering stays glossy from any distance.
 *
 * ## Why the film and the sheen are neutral
 *
 * Both used to be warm — a road-dust brown at 0.055/0.050/0.044 and a sheen
 * lobe to match. Under a golden-hour sun that compounds: the light is already
 * 1 : 0.8 : 0.6, and a surface that adds its own warmth on top of it lands the
 * sunlit sidewall at a brown-grey rather than at black. Tyre rubber is carbon
 * black with a silica/antiozonant bloom on it, which is neutral to faintly
 * cool; the *light* is what should be warm. So the film is now a neutral grey
 * and the sheen a faintly cool one, and the sidewall tracks whatever is
 * shining on it instead of tinting it. This is also why it is fixed here
 * rather than by taking a fraction out through vertex colour: a multiplier
 * tuned against one lighting preset is wrong under the next one.
 */
export function createRubber(opts: RubberOptions = {}): THREE.MeshPhysicalMaterial {
  const uniforms = {
    // x micro cells/m  y micro slope  z dust amount  w dust cells/m
    uRubberParams: {
      value: new THREE.Vector4(2400.0, 0.30, opts.dust ?? 0.30, opts.dustCells ?? 120.0),
    },
    // x curvature threshold (1/m)  y curvature range  z lettering gloss gain  w unused
    uRubberMould: {
      value: new THREE.Vector4(opts.mouldCurve ?? 90.0, 420.0, opts.mouldGloss ?? 0.30, 0.0),
    },
    // Road film on a near-black carcass. Barely brighter than the rubber in
    // linear terms — a grey that looks right on paper is eight times the
    // reflectance of tyre black and turns the sidewall into concrete — and
    // neutral, so it cannot warm the surface under a warm sun.
    uDustColor: { value: new THREE.Color(0.043, 0.043, 0.045) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.rubber,
    metalness: 0,
    roughness: opts.roughness ?? 0.92,
    sheen: 0.1,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color(0.105, 0.110, 0.120),
    envMapIntensity: 0.6,
    // For a tyre carrying baked road film in its vertices.
    vertexColors: opts.vertexColors ?? false,
  });

  extend(material, {
    // One key for every roughness. Roughness is a material property, not part
    // of this source, so a per-roughness key compiled the identical program
    // once per caller — six extra links for nothing.
    key: 'audi-rubber-v1',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      {
        find: '#include <common>',
        replace: `$&\n${TRIM_PRELUDE}\nuniform vec4 uRubberParams;\nuniform vec4 uRubberMould;\nuniform vec3 uDustColor;`,
      },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiRubberMicro = audiGrain(vAudiObjPos, uRubberParams.x, 2.9);
float audiRubberRes = audiResolved(vAudiObjPos * uRubberParams.x);
float audiDust = audiFbm2(vAudiObjPos * uRubberParams.w) * uRubberParams.z;
diffuseColor.rgb = mix(diffuseColor.rgb, uDustColor, audiDust);
diffuseColor.rgb *= mix(0.9, 1.05, mix(0.5, audiRubberMicro, audiRubberRes));
`,
      },
      {
        find: '#include <normal_fragment_begin>',
        replace: /* glsl */ `$&
float audiMould = smoothstep(uRubberMould.x, uRubberMould.x + uRubberMould.y,
                             audiCurvatureM(nonPerturbedNormal, vAudiObjPos));
`,
      },
      {
        // normal_fragment_begin runs after the roughness chunk, so the mould
        // gloss is applied late, straight onto the material.
        find: '#include <lights_physical_fragment>',
        replace: /* glsl */ `$&
material.roughness = clamp(material.roughness
                           - audiMould * uRubberMould.z
                           + audiDust * 0.06
                           + (1.0 - audiRubberRes) * 0.03, 0.06, 1.0);
`,
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float h = (audiRubberMicro - 0.5) * audiSlopeAmp(uRubberParams.y, uRubberParams.x) * audiRubberRes;
  // Creased height: bound the gradient or the creases print as white grit.
  vec2 audiRubGrad = audiBoundGradient(h, vAudiObjPos, uRubberParams.y);
  normal = audiBump(-vViewPosition, normal, audiRubGrad.x, audiRubGrad.y, 1.0);
}
`,
      },
    ],
  });

  return material;
}

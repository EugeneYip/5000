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
  /**
   * ≤0.07 polished (a mirror glass, a plated reveal); above that it brushes
   * and the number is the finish, not a hint — see `CHROME_DEFAULT_ROUGHNESS`
   * for why the default is not in the polished band.
   */
  roughness?: number;
  /** Object-space direction the brush marks run. Most C3 brightwork is fore-aft. */
  brushAxis?: THREE.Vector3;
}

/**
 * Roughness at or below which `createChrome` is polished plate and
 * `brushAxis` has no effect at all.
 *
 * Exported because the library has to know it: the axis is an input the
 * material identity depends on *only* above this line, and keying it below it
 * would split the polished rungs for a uniform the shader never reads.
 */
export const CHROME_BRUSH_THRESHOLD = 0.07;

/**
 * What `chrome()` is when nobody says — and it is **not** a mirror.
 *
 * This was 0.045, inside the polished band, and every caller that wanted
 * "bright trim" and passed nothing got plate glass. Four do: the belt trim
 * (`car/trim.ts`), the grille's bright surround (`trim/grille.ts`), the
 * tailgate script and the four rings (`trim/badges.ts`), and the body details
 * (`trim/details.ts`). Not one of them is a mirror on a real C3 — they are
 * roll-formed anodised aluminium and chrome-plated mouldings, all satin. The
 * two parts on the car that *are* mirrors (the door mirror glass, at 0.012 and
 * 0.02) ask for it explicitly, so nothing loses a finish it actually wanted.
 *
 * Measured cost of the old default, on the tailgate script at the `badge` pose
 * over the badge band (x 370–1590, y 460–600): at near-mirror roughness a
 * letter *face* is flat and rearward, so it mirrors the hemisphere behind the
 * camera — which has nothing in it — and goes **darker than the paint it sits
 * on**, while the rolled edges sweep through every angle and catch the sky.
 * The badge renders as neon outline lettering. The reference
 * (`scratchpad/ref3/bat3_badge_audi5000cs_tailgate.jpg`) has solid bright
 * letterforms at 1.32× the surrounding paint with a thin dark edge. Swapping
 * the script onto metalness-1 finishes at a run of roughnesses, three real
 * boots, band mean RGB:
 *
 *   0.05 (shipped) (69.9, 74.3, 90.6)  chroma 21.6  p95 56
 *   0.32           (93.6, 97.2,112.6)  chroma 19.3  p95 33
 *   0.42           (97.8,101.5,116.1)  chroma 18.5  p95 30
 *   0.74           (99.5,103.1,116.8)  chroma 17.5  p95 26
 *
 * The faces come up thirty levels and the edge-vs-face contrast inverts back
 * the right way round; almost all of it is bought by 0.32 and it is flat after
 * 0.42. 0.18 is the existing `CHROME_RUNGS` rung under that knee — the ladder
 * did not need a new rung, only a default that lands on one.
 */
export const CHROME_DEFAULT_ROUGHNESS = 0.18;

export function createChrome(opts: ChromeOptions = {}): THREE.MeshPhysicalMaterial {
  const roughness = opts.roughness ?? CHROME_DEFAULT_ROUGHNESS;
  // Below the threshold it is polished plate; above it the part is a brushed
  // anodised extrusion, and the marks are what carry the roughness.
  const brush = THREE.MathUtils.clamp((roughness - CHROME_BRUSH_THRESHOLD) / 0.35, 0, 1);

  const uniforms = {
    // x waviness slope  y waviness cells/m  z brush slope  w brush cells/m
    uChromeParams: { value: new THREE.Vector4(0.016, 9.0, brush * 0.5, 4200.0) },
    uBrushAxis: { value: (opts.brushAxis ?? new THREE.Vector3(0, 0, 1)).clone().normalize() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: TRIM_COLORS.chrome,
    metalness: 1,
    /**
     * The number the caller asked for, which it was not until this round.
     *
     * This used to be `lerp(roughness, 0.09, brush)`: "brushing lives in the
     * normal, so the base stays near-mirror". The brush marks do carry real
     * roughness — the `roughnessmap_fragment` splice below hands their slope
     * over as they go sub-pixel, which is right — but pulling the *base* down
     * on top of that meant the effective finish never left the polished band.
     * `createAnodised` below was written because of it, and quotes the figure:
     * asking `chrome()` for 0.30 got an effective 0.162, a near-mirror with
     * brush marks on it, and the whole region "genuinely metal, genuinely not
     * smooth" was unreachable through this entry.
     *
     * Double-counting was the fear and it does not survive measurement: the
     * marks are 0.24 mm, so they are resolved only in a close-up, and in a
     * close-up the lift is faded out by `audiResolved` precisely so the normal
     * can carry it instead. The two terms hand over to each other; they do not
     * stack.
     *
     * Nothing in the polished band moves: `brush` is 0 at or below
     * `CHROME_BRUSH_THRESHOLD`, where the old lerp was already the identity.
     */
    roughness,
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
  // 0.55 against a slope held in '.z' is 1.1 x slope, which is the conversion
  // 'createDirtyMetal' and 'createAlloy' now use for their own grains: one
  // constant for the whole file.
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
 * Cast aluminium with a painted silver face.
 *
 * Zones are keyed off the radius about the **local +X axis through the object
 * origin** — the axle line. A wheel built anywhere else in its own object
 * space will still look like metal, it just loses the lip/face distinction.
 *
 * ## `polished` is "the whole part wears the face finish"
 *
 * It sets `machinedFrom` to −1, so the face/barrel boundary never triggers and
 * every fragment is on the face side of it. That is all it has ever done. It is
 * a bad name for that and the name is what let the wheel face end up as a
 * mirror: **nothing on this car is polished alloy.** `rim.ts` passes
 * `polished: true` for the slot plate and the centre cap, and §4.3 of
 * `docs/REFERENCE-VEHICLE.md` describes what that part is — the full-face
 * "bottlecap" disc, finish "Silver/machined face", which in every reference
 * photograph is **matte painted silver**. The rename belongs in one pass with
 * the call site and is in the stream report; the finish is fixed here.
 *
 * ## What the face finish is now, and how it was measured
 *
 * Three things were wrong with it and only one was the roughness.
 *
 * **Level.** `bat3_side_profile.jpg` is the pose-matched reference, so the
 * reading that transfers across exposures is the cover against the car's own
 * door paint in the same frame: **0.88 front, 0.82 rear**. The render was
 * **1.30** — the wheel covers were the brightest thing in a `side` frame at V
 * p50 245 against paint 188, on their way to clipping. Both references instead
 * show a cover clearly *darker* than the paint.
 *
 * **Specular occlusion.** `envMapIntensity` on this project is that term (see
 * `DirtyMetalOptions.envMapIntensity`), and a wheel face had **1** — the whole
 * sky, unoccluded, for a disc sitting inside a wheel arch with the arch lip
 * over it, the inner wing behind it and the brake inboard of it. 0.55 is the
 * figure that doc gives for a part at the floor line and it is the right one
 * here.
 *
 * **Hue.** 0xc9ccd1 is B−R **+8**: a blue-biased silver, feeding the same
 * blue-trim problem as everything else on the car. Aged silver wheel paint is
 * warm — `bat3_wheel_hubcap_a.jpg`'s cover is (184, 180, 177), B−R −7.4, and
 * it is warmer than the body paint beside it by 3.6. 0xcbc8c2 carries those
 * ratios.
 *
 * Swept on the real rim face at both `side` and `wheel`, cover/paint at `side`:
 *
 *   shipped        r 0.19  e 1.00  #c9ccd1   1.303
 *   r 0.62  e 0.60  #cbc8c2                  1.064
 *   r 0.74  e 0.60  #cbc8c2                  0.968
 *   r 0.62  e 0.45  #cbc8c2                  0.973
 *   r 0.74  e 0.45  #cbc8c2                  0.861
 *
 * 0.74 at 0.55 sits between the last two, and deliberately short of the
 * reference's 0.88: a good part of what is left is the bloom skirt the frame
 * still puts round the cap, which is not this material's to spend.
 *
 * **Roughness is the weak lever of the three here, and it does not point the
 * way it does on the beads.** The face is near vertical and faces outboard, so
 * it mirrors the *horizon*, which is warm; roughening widens the lobe into the
 * blue overhead and the ground, and chroma goes **up** — 3.8 at 0.62 to 16.0
 * at 0.86 in one run. It earns its place by killing the mirror, not by
 * desaturating. Compare the rub-strip bead, where the normal points up at 58°
 * and roughening is the only lever that works: chroma 60.6 → 17.3 over the
 * same range. Same ladder, opposite sign. Measure at more than one pose.
 */
export function createAlloy(opts: { polished?: boolean; vertexColors?: boolean } = {}): THREE.MeshPhysicalMaterial {
  const rimRadius = (WHEEL.rimDiameterIn * 0.0254) / 2;
  // The turned band on this generation of Audi alloy is the outer lip only.
  const machinedFrom = opts.polished ? -1 : rimRadius * 0.86;

  const uniforms = {
    // x machined-from radius (m)  y turning pitch (m)  z cast grain cells/m  w grime
    uAlloyParams: { value: new THREE.Vector4(machinedFrom, 0.00035, 1100.0, opts.polished ? 0.25 : 0.7) },
    // x cast roughness  y face roughness  z ring slope  w cast slope
    //
    // The ring slope is down from 0.06 because a *painted* face has its turning
    // marks under the paint film: the render's cap read as a set of concentric
    // mirror bands and neither reference shows them at all. A trace is left
    // rather than none, because the film does follow the marks.
    uAlloyFinish: { value: new THREE.Vector4(0.33, 0.74, 0.02, 0.22) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Warm-neutral aged silver paint, not blue-biased plate. See above.
    color: 0xcbc8c2,
    metalness: 1,
    roughness: 0.3,
    // Specular occlusion for a disc inside a wheel arch, not an open-sky part.
    envMapIntensity: 0.55,
    // For a caller baking brake dust or occlusion into the rim mesh. Opting in
    // through the library rather than cloning keeps one shared instance per
    // variant instead of one per wheel.
    vertexColors: opts.vertexColors ?? false,
    dithering: true,
  });

  extend(material, {
    key: opts.polished ? 'audi-alloy-polished-v2' : 'audi-alloy-cast-v2',
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
  // Both lifts are the slope the normal below gives up as its feature goes
  // sub-pixel, at the same 1.1 x slope 'createChrome' and 'createDirtyMetal'
  // use. They were two unrelated constants, 0.05 and 0.10, that did not know
  // how deep either feature was: the cast grain's 0.22 slope was being handed
  // over at a quarter strength while the turning rings' 0.06 was handed over at
  // nearly twice theirs.
  float castR = uAlloyFinish.x + (1.0 - resC) * uAlloyFinish.w * 1.1;
  float machR = uAlloyFinish.y + (1.0 - resR) * uAlloyFinish.z * 1.1;
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
// Dirty metal — castings, heat shields, oxidised iron
// ---------------------------------------------------------------------------

export interface DirtyMetalOptions {
  /** Base tint. Oxide browns, phosphate greys, dull aluminium. */
  color?: number;
  roughness?: number;
  /**
   * Oxide is mostly *not* a metal; a rusty part at metalness 1 reads as
   * painted brown chrome. 0.1–0.35 is the useful band for a casting.
   *
   * **1 means bare metal** — an anodised extrusion, a stainless tip — and is
   * the other end of a two-valued physical quantity rather than the top of
   * that band. It needs `grime: 0` and an `envMapIntensity` that suits where
   * the part actually is; `anodised()` is the authored entry for it.
   */
  metalness?: number;
  /** 0 = washed casting, 1 = a decade under a car. Darkens the grain floors. */
  grime?: number;
  /**
   * IBL strength, which on this project is the **specular-occlusion** term: a
   * casting 200 mm inside a wheel arch sees a fraction of the sky and three's
   * IBL gives it all of the sky unless something says otherwise. The 0.55
   * default is that fraction for a part under the floor line. A bright strip
   * on the outside of the car sees the whole sky and wants 1.
   */
  envMapIntensity?: number;
  /** For callers baking occlusion or road film into the mesh. */
  vertexColors?: boolean;
}

/**
 * Everything metal on the car that is neither brightwork nor a wheel.
 *
 * `alloy()` exists for the wheels and is authored for them — near-white and
 * fully metallic — so a sump, a bellhousing or a heat shield wearing it blazes
 * like a lamp the moment a low sun gets under the car. `chrome()` is no better:
 * it floors at roughness 0.09 whatever it is asked for, and a mirror-finish
 * heat shield throws sky-blue light around an area that should be in shadow.
 * Both the underbody and the wheel corner had to fork a local material for
 * this; this is the entry they fork *to*.
 *
 * The shading is deliberately the cheap half of `alloy()`: a cast grain, the
 * dirt that lives in the bottom of it, and nothing turned or machined, because
 * nothing down here is. What makes it read as a real part is that the grime is
 * *in the grain* rather than a flat multiplier — the high spots stay metallic
 * and the low spots go dead, which is what a dirty casting looks like.
 */
export function createDirtyMetal(opts: DirtyMetalOptions = {}): THREE.MeshPhysicalMaterial {
  const grime = THREE.MathUtils.clamp(opts.grime ?? 0.7, 0, 1);

  const uniforms = {
    // x grain cells/m  y grain slope  z grime  w mottle cells/m
    uDirtParams: { value: new THREE.Vector4(900.0, 0.26, grime, 24.0) },
    // Road film: a warm-neutral dust, dark in linear terms. A grey that looks
    // right on paper is several times the reflectance of what is actually
    // under a car and turns every casting into concrete.
    uDirtColor: { value: new THREE.Color(0.055, 0.050, 0.044) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0x3a3c3d,
    metalness: opts.metalness ?? 0.22,
    roughness: opts.roughness ?? 0.78,
    envMapIntensity: opts.envMapIntensity ?? 0.55,
    vertexColors: opts.vertexColors ?? false,
    dithering: true,
  });

  extend(material, {
    key: 'audi-dirtymetal-v2',
    uniforms,
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${METAL_PRELUDE}\nuniform vec4 uDirtParams;\nuniform vec3 uDirtColor;` },
      {
        find: '#include <color_fragment>',
        replace: /* glsl */ `$&
float audiDirtGrain = audiGrain(vAudiObjPos, uDirtParams.x, 3.1);
float audiDirtRes = audiResolved(vAudiObjPos * uDirtParams.x);
// Dirt collects in the grain, not on top of it, and pools where the mottle
// says the part has been sheltered from spray.
float audiDirtAmt = uDirtParams.z * (1.0 - audiDirtGrain)
                  * (0.55 + 0.45 * audiFbm2(vAudiObjPos * uDirtParams.w));
diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.82, 1.04, mix(0.5, audiDirtGrain, audiDirtRes)),
                       uDirtColor, audiDirtAmt);
`,
      },
      {
        find: '#include <roughnessmap_fragment>',
        replace: /* glsl */ `$&
// Fade variance, not amplitude — the shader library's second house rule, which
// this program was the one not obeying. The grain's normal perturbation below
// is multiplied out by 'audiDirtRes' as the cells go sub-pixel, and the slope
// it gives up has to arrive in roughness or the surface quietly turns back into
// a mirror as you walk away from it. The flat +0.06 this replaces was a floor,
// not a conversion: it did not know how deep the grain was, so a bright
// extrusion whose 1.1 mm grain is seven times sub-pixel at 'side' kept the
// roughness of a polished one. 1.1 x slope is the conversion 'createChrome'
// already uses for its brush marks (a brush amount of 1 is a slope of 0.5 and
// lifts roughness by 0.55), so the two programs now agree.
roughnessFactor = clamp(roughnessFactor + audiDirtAmt * 0.18
                        + (1.0 - audiDirtRes) * uDirtParams.y * 1.1, 0.08, 1.0);
`,
      },
      {
        // Dust is a dielectric film. Without this the dirt still reflects the
        // sky like the metal underneath it and the part never looks dirty.
        find: '#include <metalnessmap_fragment>',
        replace: '$&\nmetalnessFactor = mix(metalnessFactor, 0.03, audiDirtAmt);',
      },
      {
        find: '#include <normal_fragment_maps>',
        replace: /* glsl */ `$&
{
  float h = (audiDirtGrain - 0.5) * audiSlopeAmp(uDirtParams.y, uDirtParams.x) * audiDirtRes;
  // Creased height: bound the gradient or the creases print as white grit.
  vec2 audiDirtGrad = audiBoundGradient(h, vAudiObjPos, uDirtParams.y);
  normal = audiBump(-vViewPosition, normal, audiDirtGrad.x, audiDirtGrad.y, 1.0);
}
`,
      },
    ],
  });

  return material;
}

// ---------------------------------------------------------------------------
// Anodised aluminium extrusion
// ---------------------------------------------------------------------------

export interface AnodisedOptions {
  /** Defaults to `TRIM_COLORS.chrome`, the same brightwork value as `chrome()`. */
  color?: number;
  /** 0.30 bright mill finish … 0.45 matt etched. */
  roughness?: number;
  /**
   * Specular occlusion. 1 for a strip in the open; drop it for one down a
   * reveal that cannot see the sky.
   */
  envMapIntensity?: number;
  vertexColors?: boolean;
}

/**
 * The rub-strip beads, the window reveals, the bumper cap strips.
 *
 * This is the finish neither of the other two brightwork entries could reach,
 * and the gap was measured rather than guessed. **`chrome()` could not be
 * rough** — it read any roughness above 0.07 as a *brushing* amount and lerped
 * the base back down, so its effective floor was 0.152 and asking it for 0.30
 * got a near-mirror with brush marks on it. *(That lerp is gone as of this
 * round; see `createChrome`. An authored roughness now means what it says
 * there too, so the two entries overlap where they used not to. They are still
 * different surfaces — chrome is plate with a long waviness and directional
 * marks, this is a fine grain on solid metal — and the beads want this one.)*
 * `dirtyMetal()`'s ladder could not be
 * metallic: its top metalness rung was 0.35, and at 0.35 two thirds of the
 * response is Lambertian. A Lambertian bead has **no tonal range** — the
 * front bumper bead came out 1.33 % of the car in 176–224 and 0.23 % above
 * 224 where the photograph is 0.43 % and 0.47 %, because the real extrusion
 * is genuinely dark over its shaded third and clipping over its sunlit third.
 * Flat where the real one has range. See commit `5b4becd`.
 *
 * So: metalness **1**, roughness on the bright rungs, `grime: 0` — an
 * exterior strip is rained on, not caked — and the IBL at full strength,
 * because a bead on the outside of a bumper sees the whole sky and 0.55 is an
 * under-floor occlusion figure.
 *
 * Deliberately `createDirtyMetal` with authored constants and **not** a new
 * shader, exactly as the cast-iron family below is: the surface wanted here is
 * a fine grain on solid metal, which is what that program already draws once
 * the dirt is turned off. At `grime: 0` every dirt term — the diffuse mix, the
 * metalness knock-down, the roughness lift — drops out, and what is left is
 * the grain modulating F0 by ±11 % and a bounded normal. One program, one
 * link, whatever else on the car is wearing a casting.
 *
 * The colour is the axis to measure against the plate, not the roughness: at
 * metalness 1 `color` is F0 rather than an albedo, so the value `5b4becd`
 * solved for at metalness 0.35 (`0xd0d4d8`) does not carry over and has to be
 * re-read from the frame. Three real builds with the bead swapped onto this
 * finish, at the `photomatch` pose, over the bead's own band of the frame:
 *
 *   shipped  m0.35 r0.62  #d0d4d8   >224  4.9 %   176–224 20.8 %
 *   anodised       r0.32  #d8dade   >224 11.6 %   176–224 23.8 %
 *   anodised       r0.32  #d0d4d8   >224 10.7 %   176–224 24.2 %
 *   anodised       r0.42  #d0d4d8   >224  8.7 %   176–224 24.3 %
 *
 * The range appears at either rung — the bead goes from one flat value end to
 * end to clipping over its sunlit run and mid-grey over the rest. The colour
 * is the *weak* lever of the two, because the clipped part is clipped either
 * way; the roughness rung is the strong one, and `0.42` is the better of the
 * two here: it shortens the glint and takes most of the bloom skirt off the
 * moulding under it. A caller on this finish still owes the frame a level, but
 * it is choosing between two rungs and a colour, not fighting the shader.
 *
 * ## First caller, and what it got
 *
 * `trim/sides.ts` puts the side moulding's bright cap here at `r 0.42`,
 * `0xd0d4d8`. Over the whole run between the arches at `side`, that takes the
 * cap from p50 145 / p95 155 / max 158 with **nothing above 176 anywhere** —
 * a flat ribbon — to p50 150 / p95 182 / max 194, 7.7 % of it above 176. The
 * reference photographs have the same part clipped at L 237–254 with the row
 * above it at 85–92, so the direction is right and there is more left in it.
 * No glint and no bloom skirt at `side`, `front3q` or `wheel`, and the tone
 * profile does not move because the part is not in the `photomatch` frame.
 *
 * ## …and what it was still getting wrong: the bead was blue
 *
 * CRITIQUE-5 item 3 measured that cap at `side` x 700–800, rows 475–479, and
 * found a 5 px band peaking at **(131, 145, 191), chroma 60**, where the
 * registered reference's bead is neutral — (190, 192, 197), chroma 7.4 on the
 * brightest row of `bat3_side_profile.jpg`. `pick` at x 750 says the peak row
 * is `rubStripLine` with a world normal of (0.53, 0.85, 0), i.e. tipped 58° up:
 * for a near-horizontal camera that mirrors a direction 64° above the horizon,
 * which in this IBL is the blue zenith. The horizon in the same frame is warm
 * (B−R −7) and an outboard-facing chrome a few pixels away reads B−R −4, so
 * the blue is not a white balance — it is which single direction a tight lobe
 * was sampling.
 *
 * **Roughness is the whole lever, and `envMapIntensity` is not a lever at
 * all.** Real boots on the real bead, chroma on the peak row:
 *
 *   r 0.32  e 1.00   80.0      (worse — below 0.42 it tightens)
 *   r 0.42  e 1.00   60.6      shipped
 *   r 0.62  e 1.00   28.2
 *   r 0.74  e 1.00   17.3
 *   r 0.86  e 1.00   16.9      (the knee; nothing left after 0.74)
 *   r 0.42  e 0.60   60.7      ← **no change**, and V p50 196 → 166
 *   r 0.62  e 0.70   31.9
 *
 * Dropping the IBL scales the blue and the level together, so it costs thirty
 * grey levels of the range `5b4becd` was fought for and buys nothing. Nobody
 * should spend another round on it.
 *
 * What it actually took was the grain handover in `createDirtyMetal`'s
 * `roughnessmap_fragment` splice: at `side` this bead is 3 mm per pixel and the
 * grain is 1.1 mm, so it is three times sub-pixel and its slope now arrives in
 * roughness instead of evaporating. 0.42 authored becomes **0.706** effective
 * there, and the peak row goes **chroma 60.7 → 25.5** with V p50 191 → 193 —
 * the bead keeps its level, which is the whole point of doing it this way
 * rather than by moving the caller onto a rougher rung.
 *
 * Measured at a second pose, because this one is angle-specific and that is
 * exactly how `anodised` got reverted off the front bumper bead once before:
 * at `front3q` the same cap's worst flank row is chroma 8.2 before and 7.3
 * after. There was never a defect there — the bead only goes blue where its
 * normal tips up into the zenith.
 *
 * The 25.5 that is left is not reachable from this file. The lobe at 0.706
 * already spans most of the upper hemisphere and the whole upper hemisphere is
 * blue; `ibl.ts` owns the rest. The next thing that would move it from here is
 * `trim/sides.ts` asking for `r 0.62` instead of `0.42` (→ 0.906 effective,
 * extrapolating to chroma ≈ 12), which is a call-site change and is in the
 * stream report rather than done behind that stream's back.
 */
export function createAnodised(opts: AnodisedOptions = {}): THREE.MeshPhysicalMaterial {
  return createDirtyMetal({
    color: opts.color ?? TRIM_COLORS.chrome,
    metalness: 1,
    roughness: opts.roughness ?? 0.32,
    grime: 0,
    envMapIntensity: opts.envMapIntensity ?? 1,
    vertexColors: opts.vertexColors,
  });
}

// ---------------------------------------------------------------------------
// The cast-iron family
// ---------------------------------------------------------------------------
//
// Three named finishes the wheel corner asked for by name and had been holding
// locally in 'src/car/wheels/materials.ts'. All three are 'createDirtyMetal'
// with authored constants rather than new shaders, which is deliberate: they
// are the same *surface* — a rough casting with dirt in the bottom of its
// grain — at three different points, so they share one program and one link,
// and the brake corner costs the renderer nothing for having three of them.

/** Phosphate grey, for a casting that has not been left to rust. */
const IRON_PHOSPHATE = 0x54565a;
/** Wet-brown iron oxide. Not orange: dry rust powder is orange, a wheel arch
 *  is not dry, and an orange caliper reads as a toy. */
const IRON_OXIDE = 0x6d4c33;

export interface CastIronOptions {
  /** Override the oxide/phosphate mix outright. */
  color?: number;
  /**
   * 0 = a freshly machined or phosphated casting, 1 = a month of weather.
   *
   * Drives the colour and, with it, the metalness: oxide is a mineral, not a
   * metal, and leaving metalness high is the mistake that makes a rusty part
   * read as painted brown chrome.
   */
  oxide?: number;
  /** 0 = washed, 1 = a decade under a car. */
  grime?: number;
  roughness?: number;
  /** For a caller baking occlusion or brake dust into the mesh. */
  vertexColors?: boolean;
}

/** Blend two sRGB hexes without going through a Color allocation. */
function mixHex(a: number, b: number, t: number): number {
  const m = (sh: number): number => {
    const x = Math.round(THREE.MathUtils.lerp((a >> sh) & 255, (b >> sh) & 255, t));
    return THREE.MathUtils.clamp(x, 0, 255);
  };
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/**
 * Grey cast iron, oxidised: disc hats and vanes, dust shields, pad backing
 * plates — every brake part the pads never touch, which on any car driven in
 * the last month is orange-brown. The rust/bright contrast against
 * `brakeDisc()`'s swept band is the single strongest cue that what is behind
 * the spokes is a real part rather than a grey disc on a stick.
 */
export function createCastIron(opts: CastIronOptions = {}): THREE.MeshPhysicalMaterial {
  const oxide = THREE.MathUtils.clamp(opts.oxide ?? 1, 0, 1);
  return createDirtyMetal({
    color: opts.color ?? mixHex(IRON_PHOSPHATE, IRON_OXIDE, oxide),
    metalness: THREE.MathUtils.lerp(0.32, 0.12, oxide),
    roughness: opts.roughness ?? THREE.MathUtils.lerp(0.74, 0.88, oxide),
    grime: opts.grime ?? 0.7,
    vertexColors: opts.vertexColors,
  });
}

/**
 * The caliper casting: phosphated or painted from new, so it is darker, flatter
 * and far less oxidised than the iron around it. It is also the part a low sun
 * gets under, which is why it must not be wearing `alloy()`.
 */
export function createCaliperPaint(opts: { color?: number; vertexColors?: boolean } = {}): THREE.MeshPhysicalMaterial {
  return createDirtyMetal({
    color: opts.color ?? 0x4a4540,
    metalness: 0.3,
    roughness: 0.74,
    grime: 0.5,
    vertexColors: opts.vertexColors,
  });
}

/**
 * Sintered friction material.
 *
 * Non-metallic by construction, and the roughest thing on the car: a pad's
 * face is pressed powder. The only reason it is a `dirtyMetal` at all is that
 * the grain and the dirt-in-the-grain are exactly right for it and it costs no
 * extra program to say so.
 */
export function createPadFriction(opts: { vertexColors?: boolean } = {}): THREE.MeshPhysicalMaterial {
  const m = createDirtyMetal({
    color: 0x2e2a28,
    metalness: 0,
    roughness: 0.95,
    grime: 0.75,
    vertexColors: opts.vertexColors,
  });
  // A pad sits inside the caliper, in its own shadow, and should not be
  // picking the sky up the way an exposed casting does.
  m.envMapIntensity = 0.3;
  return m;
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
    // A stipple is a *diffuser*, and a diffuser's cells have to be small
    // against the part, not merely small against the pixel: 1.1 mm pebbling on
    // a 400 mm bowl. At 6.7 mm — where this started — each cell was a concave
    // mirror wide enough to focus the sun into one pixel of itself, so the
    // headlamp bowl rendered as a field of white glitter rather than as a
    // paraboloid, and behind a taillamp the same lattice printed straight
    // through the transmissive lens as a 27-pixel grid. That grid was a good
    // half of what reads as the lens' "dot-matrix crosshatch", and no amount of
    // work on the lens itself could have removed it.
    //
    // At 1.1 mm the lattice is a fine satin grain in a close-up and a broad
    // scatter cone at any real distance, which is what a vapour-deposited bowl
    // actually is. Depth comes down with it: the bowl needs a wide cone, not a
    // steep one.
    // x cells/m  y dimple depth  z gap darkening  w unused
    uReflParams: { value: new THREE.Vector4(900.0, 0.32, 0.14, 0.0) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    // Vacuum-deposited aluminium, ~88 % broadband.
    color: 0xe8e9ec,
    metalness: 1,
    roughness: 0.13,
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
// The pebbling aliases in the *highlight* long before it aliases as a pattern:
// six pixels to a dimple is plenty to draw the dimple and nowhere near enough
// to draw a 7°-wide specular lobe swinging across it. So the normal's
// per-pixel spread is convolved into roughness, and the sun spreads over the
// dimple instead of landing on one pixel of it. This is what turns the bowl
// back into a paraboloid; the fade above only handles the distant case.
roughnessFactor = audiSpecularAA(audiReflNObj, roughnessFactor, 0.50, 0.30);
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

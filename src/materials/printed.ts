/**
 * Printed surfaces: anything carrying a drawn graphic.
 *
 * Licence plates, inspection stickers, dial faces, switch pictograms, the
 * centre-stack legend. Two work streams had to fork a local material for this
 * — `src/car/trim/printed.ts` and `src/car/interior/printed.ts` — for the same
 * two reasons, and both are answered here:
 *
 *  - the library had **no entry that takes a map**; and
 *  - library instances are **memoised and shared**, so assigning a map to one
 *    would repaint every other caller holding it.
 *
 * The second is the important one, and it is why `printed()` keys on the map's
 * own identity. Two callers handing over the same texture and the same finish
 * get one shared material and batch together; a caller with its own canvas
 * gets its own instance and cannot disturb anyone else's. That is the same
 * memoisation everything else in the library gets, applied to the one axis
 * that actually has to vary.
 *
 * ## Why one entry covers both
 *
 * The two forks differ in exactly three ways, all of which are options here:
 *
 *  - a plate is **semi-gloss over paint** (a thin clearcoat) where a dial face
 *    is **matte print under a separate acrylic lens**, so `clearcoat` varies;
 *  - a dial face carries an **emissive map** for the night lighting, driven by
 *    `emissiveIntensity` from outside;
 *  - a plate needs its **shadow cast from the back faces**. It is a large flat
 *    panel with 2.9 mm of embossed relief, which is the exact case a shadow
 *    map self-shadows into acne, and `Car` forces `castShadow` on after the
 *    builders run so it cannot be solved at the mesh.
 *
 * Nothing here does any procedural shading — with one exception, `retroGain`,
 * which is not shading the print but changing how the *sheeting under it*
 * returns light. Everything else about a printed surface's appearance is the
 * map; adding grain over it would fight the artwork.
 */

import * as THREE from 'three';
import { extend } from './extend';

export interface PrintedOptions {
  /** Semi-gloss paint ~0.34; matte instrument print ~0.62. */
  roughness?: number;
  /** A thin clear over the print. 0 for a dial face under its own lens. */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Self-lit artwork — instrument graphics at night. */
  emissiveMap?: THREE.Texture | null;
  emissive?: number;
  /** Driven from outside as the lights come up; 0 leaves the map dark. */
  emissiveIntensity?: number;
  envMapIntensity?: number;
  /**
   * Scale the dielectric specular lobe. 1 is the physical 4 % Fresnel floor
   * of any non-metal; below that the surface is being told it sits somewhere
   * light cannot reach it from.
   *
   * That is not a licence to fake a dark surface — an albedo knob does that
   * and is already here. It is for a *cavity*: a patch 52 mm behind a 13.7 mm
   * slot sees sin(atan(6.85/52)) = 0.131 of the hemisphere, and the occlusion
   * that would tell it so is not computed anywhere. GTAO runs at half
   * resolution behind a six-pixel denoise and cannot see an eight-pixel slot.
   * Without this the grille aperture is albedo-limited at the Fresnel floor
   * and cannot get below 0.18 of the licence plate, where the photograph's
   * is 0.119.
   */
  specularIntensity?: number;
  /**
   * Cast this part's shadow from its back faces.
   *
   * For a flat embossed panel — a plate — that moves the recorded depth off
   * the lit surface and the acne speckle goes away.
   */
  backfaceShadow?: boolean;
  /**
   * **Retroreflective sheeting.** How much brighter than a matte card of the
   * same albedo this surface reads when the light is directly behind the
   * lens. `0`, the default, is ordinary print and adds no code to the shader.
   *
   * A US licence plate is not white paint. It is glass-bead or prismatic
   * sheeting, engineered to send light back the way it came, and it is the
   * only surface on this car that behaves that way. See `RETRO_GLSL`.
   */
  retroGain?: number;
  /**
   * Cosine power of the retro lobe. Higher is a tighter, more selective
   * flare. See `RETRO_GLSL` for why this is not the sheeting's real
   * divergence and cannot be.
   */
  retroLobe?: number;
}

/**
 * The retroreflective return, spliced into the directional-light loop.
 *
 * ## What a retroreflector is, in one line of geometry
 *
 * A specular lobe peaks about the *half-vector* — light in, light out,
 * mirrored in the normal. A retroreflector peaks about the **incident ray
 * itself**: it sends light back where it came from. So the parameter is the
 * angle between the surface's view vector and its *light* vector — the
 * observation angle, `cosObs` below — and the normal barely enters it. That
 * one substitution is the whole model, and it is why this flares when the sun
 * is behind the camera and does nothing when the sun is off to one side.
 *
 * ## The divergence is broadened, deliberately, and by a lot
 *
 * Engineering-grade sheeting is about 70 cd/lx/m² at 0.2° of observation
 * angle and has lost an order of magnitude by 2°. That curve cannot be used
 * here: measured at the plate in the `photomatch` pose, the sun stands **54°**
 * off the camera axis, and at the real divergence the term would be
 * identically zero in that frame and in every other frame this project
 * renders. `retroLobe` is therefore a broadened stand-in, and it is a tuning
 * parameter, not a photometric figure.
 *
 * What is kept is the *shape* and the *dependence on geometry*: peaked on the
 * retroreflection axis, monotone away from it, falling by roughly an order of
 * magnitude over the lobe's own angular scale, and gated by the entrance
 * angle. What is given up is the angular scale itself.
 *
 * ## Two cosines on the entrance angle, not one
 *
 * `cosEnt` appears squared. One factor is the plain projected irradiance any
 * surface gets — a plate lit at 56° receives cos 56° of the sun. The second
 * is the sheeting's own entrance-angle loss: the bead array's effective
 * aperture shrinks as it turns away from the light and the rim losses climb,
 * which is why sheeting is only specified out to 30° of entrance and falls
 * off hard past 50°. It is also what keeps `noon` and `overcast` out of this:
 * at 70° of solar elevation the plate is lit at 77° of entrance and the
 * squared cosine is 6.5× smaller than it is at golden hour.
 *
 * ## Why the sun's shadow map is not applied
 *
 * It would be wrong here, and it would defeat the measurement this exists to
 * reproduce: the photograph's plate reads **236 in shade**, with the bumper
 * 50 mm away on the same panel reading 65.
 *
 * The shadow map answers "is the sun's disc occluded *along the sun axis*".
 * The retro return is an integral of environment radiance over a cone about
 * the *view* axis, and at the divergence above that cone is most of the
 * sun-side sky. A canopy overhead occludes the sun; it does not occlude the
 * low, bright, sun-side sky behind the lens, which is what a plate under a
 * tree is returning. The key light is used as the stand-in for the radiance
 * of that cone because in this rig the sky *is* synthesised from the sun, so
 * its colour and strength track together.
 *
 * The consequence is deliberate and is the point: the plate reads the same
 * whether the car is in the grove's shade or out of it, which is exactly what
 * the reference photograph shows and exactly what lets the shade go deeper
 * without taking the one calibrated neutral in frame down with it.
 *
 * ## Why it is added to `directDiffuse`, tinted by the map
 *
 * The characters are ink *over* the sheeting. Light returning from under them
 * has crossed the ink, so the return is albedo-modulated — which is why a
 * plate in headlights reads as a bright field with dark characters rather
 * than a uniform glow, and why tinting by `material.diffuseColor` here is
 * what keeps the registration legible instead of washing it out.
 *
 * `RECIPROCAL_PI` puts `retroGain` in readable units: **1.0 is a Lambertian
 * surface of the same albedo**, seen on the retro axis. Real sheeting against
 * a real Lambertian is a gain of order 200 — but over a lobe some 1600×
 * narrower in solid angle than this one, so the two numbers are not
 * comparable and nothing here is energy-conserving with the real thing. It is
 * an appearance model.
 */
const RETRO_GLSL = /* glsl */`
{
  float cosObs = dot( geometryViewDir, directionalLight.direction );
  float cosEnt = dot( geometryNormal, directionalLight.direction );
  float lobe = pow( max( cosObs, 0.0 ), uRetroLobe );
  float entrance = max( cosEnt, 0.0 );
  reflectedLight.directDiffuse += uRetroGain * lobe * entrance * entrance
    * RECIPROCAL_PI * material.diffuseColor * directionalLight.color;
}
`;

/**
 * Live retro uniforms, so the figure can be swept against the tone gate
 * without a rebuild — see `__AUDI_RETRO` at the bottom of this file.
 */
const retroLive: Array<{ gain: THREE.IUniform<number>; lobe: THREE.IUniform<number> }> = [];

function applyRetro(m: THREE.MeshPhysicalMaterial, gain: number, lobe: number): void {
  const uRetroGain = { value: gain };
  const uRetroLobe = { value: lobe };
  extend(m, {
    key: 'printed:retro',
    uniforms: { uRetroGain, uRetroLobe },
    // `getDirectionalLightInfo` is the one call site in the fragment shader
    // that has the *unshadowed* light struct and the geometry in scope at the
    // same time. It lives inside `lights_fragment_begin`, so the chunk has to
    // be inlined before the needle exists.
    expandChunks: ['lights_fragment_begin'],
    fragment: [
      { find: '#include <common>', replace: '$&\nuniform float uRetroGain;\nuniform float uRetroLobe;' },
      { find: 'getDirectionalLightInfo( directionalLight, directLight );', replace: `$&\n${RETRO_GLSL}` },
    ],
  });
  retroLive.push({ gain: uRetroGain, lobe: uRetroLobe });
}

export function createPrinted(map: THREE.Texture, opts: PrintedOptions = {}): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    // White, so the artwork is the colour. Tinting here would multiply through
    // the print and there is no case on this car where that is wanted.
    color: 0xffffff,
    metalness: 0,
    roughness: opts.roughness ?? 0.42,
    clearcoat: opts.clearcoat ?? 0,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.16,
    emissiveMap: opts.emissiveMap ?? null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    envMapIntensity: opts.envMapIntensity ?? 0.6,
    specularIntensity: opts.specularIntensity ?? 1,
    side: THREE.FrontSide,
  });
  if (opts.backfaceShadow) m.shadowSide = THREE.BackSide;
  if ((opts.retroGain ?? 0) > 0) applyRetro(m, opts.retroGain ?? 0, opts.retroLobe ?? 3);
  return m;
}

/**
 * Debug surface, in the house style of `__AUDI_MAT` and `__AUDI_LIGHTS`:
 *
 *   __AUDI_RETRO.read()            gain and lobe on every retro material
 *   __AUDI_RETRO.set(gain, lobe)   sweep them live
 *
 * This exists because the plate's gain is not independent of how deep the
 * grove's shade is, and that is owned by another file. Whoever takes the
 * shade down next has to re-read the plate against the photograph's 236, and
 * without this that is a rebuild per sample.
 *
 * `set` announces `audi:materials-dirty`. It has to: the post chain's
 * accumulation buffer only drops when something *moves*, and a uniform change
 * moves nothing — sweep without it and every reading is a blend of the
 * previous fifteen frames at the old value. That trap has already cost this
 * project a round of paint measurements.
 */
(globalThis as Record<string, unknown>).__AUDI_RETRO = {
  read: () => retroLive.map((u) => ({ gain: u.gain.value, lobe: u.lobe.value })),
  set: (gain: number, lobe?: number) => {
    for (const u of retroLive) {
      u.gain.value = gain;
      if (lobe !== undefined) u.lobe.value = lobe;
    }
    globalThis.dispatchEvent?.(new Event('audi:materials-dirty'));
    return retroLive.length;
  },
};

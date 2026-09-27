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
 * Nothing here does any procedural shading. A printed surface's whole
 * appearance is the map; adding grain over it would fight the artwork.
 */

import * as THREE from 'three';

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
  return m;
}

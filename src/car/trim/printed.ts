/**
 * The one material this stream makes for itself.
 *
 * `src/materials` covers every surface the car has — paint, chrome, grained
 * bumper plastic, satin trim, rubber, lens, alloy. What it has no entry for is
 * a *printed* surface: painted sheet steel carrying a graphic, which is what a
 * licence plate and an inspection sticker are. Nothing in the library takes a
 * map, and the library's instances are shared and memoised, so assigning a map
 * to one would repaint it everywhere.
 *
 * So this is deliberately minimal — colour from a canvas, a semi-gloss clear
 * over it, nothing clever — and it should move into `src/materials` as
 * `printed(map)` the next time that stream is open. See the stream report.
 */

import * as THREE from 'three';

export function createPrinted(map: THREE.Texture, opts: { roughness?: number; clearcoat?: number } = {}): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    metalness: 0.0,
    roughness: opts.roughness ?? 0.34,
    clearcoat: opts.clearcoat ?? 0.45,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.9,
    side: THREE.FrontSide,
    // The plate is a large, nearly flat panel carrying 2.9 mm of embossed
    // relief, which is exactly the case a shadow map self-shadows into acne.
    // Casting from the back faces moves the recorded depth off the lit
    // surface and the speckle goes away. `Car` forces castShadow on every
    // mesh after the builders run, so this has to be solved in the material.
    shadowSide: THREE.BackSide,
  });
}

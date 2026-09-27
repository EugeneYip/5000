/**
 * Canvas plumbing for the cabin's drawn artwork, and the one material the
 * library still has no entry for.
 *
 * The printed surfaces — the dial faces, the centre-stack legend — now come
 * from `materials.printed(map)`, which keys on the map's own identity, so a
 * caller with its own canvas gets its own instance and cannot repaint anyone
 * else's. That was the gap this file was opened for and it is closed.
 *
 * `createLens` is what is left, and it is here under protest: see its own
 * comment. It is the only mesh in this stream not in the material registry,
 * which means `setEnvMap` does not reach it — `buildCluster` follows a
 * registry material by hand to make up for it.
 */

import * as THREE from 'three';

export interface CanvasHandle {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Pixels per unit of the caller's own layout space. */
  s: number;
}

/** A canvas laid out in millimetres, so dial geometry can be read off a ruler. */
export function makeCanvas(wUnits: number, hUnits: number, pxPerUnit: number): CanvasHandle {
  const w = Math.round(wUnits * pxPerUnit);
  const h = Math.round(hUnits * pxPerUnit);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('interior: no 2d context');
  g.scale(pxPerUnit, pxPerUnit);
  return { canvas, g, w, h, s: pxPerUnit };
}

export function canvasTexture(h: CanvasHandle, renderer: THREE.WebGLRenderer, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(h.canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Period instrument lettering. Audi's supplier was VDO, whose pre-1988 faces
 * are a plain grotesque with slightly condensed figures — Helvetica's metrics
 * are the closest thing a browser has without shipping a font file, which the
 * project's no-binary-assets rule forbids.
 */
export const DIAL_FONT = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif";

/**
 * The cluster lens — the one finish in this stream with no library entry.
 *
 * The only glossy thing in the cabin: a thin acrylic cover a few millimetres
 * off the dial faces, which is what gives an instrument pack its depth and
 * its one hard reflection. What it needs is a **non-transmissive, alpha-blended
 * dielectric cover**: near-clear, sharp specular, no refraction.
 *
 * Nothing in the library is that. `glass()` and `lens()` are both
 * `transmission: 1`, which would put 30 cm^2 of acrylic into the transmission
 * pass and make the driver read the dial through a 0.6-scale copy of it;
 * `printed()` needs a map and floors its roughness on a three-rung ladder at
 * 0.34, and there is no artwork on a lens to key it on anyway;
 * `interiorPlastic()` is opaque and its lowest rung is 0.40.
 *
 * So it stays local, and it is reported rather than quietly forked further:
 * the entry it wants is roughly
 *
 *   clearCover(opts?: { tint?: number; opacity?: number; roughness?: number;
 *                       clearcoat?: number; clearcoatRoughness?: number })
 *
 * which would also serve any other moulded cover — a clock bezel, a switch
 * window. Until then `buildCluster` keeps its env map in step by hand.
 */
export function createLens(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0x0a0b0d,
    metalness: 0,
    roughness: 0.035,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.35,
    transparent: true,
    opacity: 0.085,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

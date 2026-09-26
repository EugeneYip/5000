/**
 * The one material this stream makes for itself, and the canvas plumbing
 * behind it.
 *
 * `src/materials` has an entry for every *surface* in the cabin — grained
 * plastic, woven cloth, cut-pile carpet — and this stream uses those and
 * nothing else for them. What the library has no entry for is a **printed**
 * surface: a dial face, a switch pictogram, a radio fascia legend. Those need
 * a map, the library takes none, and its instances are memoised and shared, so
 * assigning a map to one would repaint it on every other caller.
 *
 * The same gap was found and documented by the trim stream in
 * `src/car/trim/printed.ts`. Both should collapse into a `printed(map)` entry
 * in `src/materials` next time that stream is open; see the stream report.
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

/** Matte printed surface: a dial face, a switch legend, a radio fascia. */
export function createPrinted(map: THREE.Texture, opts: { roughness?: number; emissiveMap?: THREE.Texture; emissive?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    metalness: 0,
    roughness: opts.roughness ?? 0.62,
    emissiveMap: opts.emissiveMap ?? null,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: 0,
    envMapIntensity: 0.35,
    side: THREE.FrontSide,
  });
}

/**
 * The cluster lens.
 *
 * The only glossy thing in the cabin: a thin acrylic cover a few millimetres
 * off the dial faces, which is what gives an instrument pack its depth and
 * its one hard reflection. Deliberately *not* a transmissive material — a
 * transmission pass for 30 cm^2 of acrylic would cost more than the whole
 * rest of the interior, and a near-clear layer with a sharp specular lobe is
 * indistinguishable at any angle you can actually see the cluster from.
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

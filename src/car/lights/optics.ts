/**
 * Material plumbing for lamps.
 *
 * Three things the library cannot do for us on its own:
 *
 *  - **Independent emissive instances.** `materials.emissive()` memoises on
 *    (colour, intensity) so a caller ramping a lamp cannot flood the cache.
 *    But the left and right indicators are the same colour and must flash
 *    independently, so each driven surface needs its own instance.
 *  - **Flute orientation.** The lens shader picks its prism axis from the
 *    object-space normal, which gives vertical flutes on any forward-facing
 *    lens. A period taillamp is vertically fluted and is therefore correct,
 *    but the US headlamp lens is *horizontally* fluted. Rotating the geometry
 *    about the lens normal and counter-rotating the mesh turns the prisms
 *    through 90° without moving a single vertex in world space.
 *  - **Lamp-off discipline.** An emissive surface with intensity 0 is still a
 *    near-black plate, and a near-black plate in front of a reflector is the
 *    "unlit lamp is a void" failure. Driven surfaces are hidden outright until
 *    they are carrying current.
 */

import * as THREE from 'three';
import type { MaterialLibrary } from '@/types';

/**
 * A clone that keeps the library's shader patch. `Material.copy()` does not
 * carry `onBeforeCompile` or `customProgramCacheKey`, so a plain clone would
 * silently render with the stock shader. Re-pointing both at the original
 * keeps the patch *and* the program-cache key, so the two still share one
 * compiled program.
 */
export function independent<T extends THREE.Material>(src: T): T {
  const m = src.clone() as T;
  m.onBeforeCompile = src.onBeforeCompile;
  m.customProgramCacheKey = src.customProgramCacheKey;
  return m;
}

/** Turn a forward-facing lens' moulded flutes from vertical to horizontal. */
export function fluteHorizontal(geometry: THREE.BufferGeometry, mesh: THREE.Object3D): void {
  geometry.rotateZ(Math.PI / 2);
  mesh.rotation.z = -Math.PI / 2;
}

// ---------------------------------------------------------------------------
// Driven emissive surfaces
// ---------------------------------------------------------------------------

/** One illuminated surface — a chamber blaze, a filament, a marker lens. */
export class Glow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly hot: THREE.Color;
  private readonly cold: THREE.Color;
  private readonly shifts: boolean;
  private level = -1;
  private over = -1;

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    /** Emissive intensity at full level. Above ~1.4 the bloom pass picks it up. */
    private readonly peak: number,
    /** Intensity carried with no current — a filament is never pure black. */
    private readonly floor = 0,
    /** Colour the filament runs to when it is driven hard (brake over tail). */
    hotColor?: number,
  ) {
    this.material = material;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.cold = material.emissive.clone();
    this.shifts = hotColor !== undefined;
    this.hot = this.shifts ? new THREE.Color().setHex(hotColor!, THREE.SRGBColorSpace) : this.cold;
    this.set(0);
  }

  /**
   * `level` 0..1 is the filament's output. `over` 0..1 drives the colour up
   * towards the hot tint — a brake filament runs whiter than the same filament
   * on tail current, and that shift is most of what reads as "brakes on".
   */
  set(level: number, over = 0): void {
    if (level === this.level && over === this.over) return;
    this.level = level;
    this.over = over;
    const lit = level > 0.004 || this.floor > 0;
    this.mesh.visible = lit;
    if (!lit) return;
    this.material.emissiveIntensity = this.floor + (this.peak - this.floor) * level;
    if (this.shifts) this.material.emissive.copy(this.cold).lerp(this.hot, over);
  }
}

export interface GlowSpec {
  color: number;
  peak: number;
  floor?: number;
  hotColor?: number;
}

/**
 * Hands out emissive materials. Every driven surface gets its own instance so
 * that channels can be animated apart; undriven decoration can share.
 */
export class GlowFactory {
  private seq = 0;
  constructor(private readonly materials: MaterialLibrary) {}

  make(geometry: THREE.BufferGeometry, spec: GlowSpec): Glow {
    // The library's cache key rounds intensity to 2 dp, so stepping the seed
    // by 0.01 is exactly the amount that guarantees a fresh instance.
    const seed = 1 + this.seq++ * 0.01;
    const base = this.materials.emissive(spec.color, seed) as THREE.MeshStandardMaterial;
    return new Glow(geometry, independent(base), spec.peak, spec.floor ?? 0, spec.hotColor);
  }
}

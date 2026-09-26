/**
 * Ground query.
 *
 * The suspension only ever asks the world two questions — "how high is the
 * ground under this point" and "which way is it facing" — so that is the whole
 * interface. Flat ground at y = 0 is the only implementation today; a heightmap
 * or a BVH over terrain geometry drops in behind the same two methods without
 * the vehicle model knowing.
 */

import * as THREE from 'three';

export interface GroundSample {
  /** World height of the surface at the queried point. */
  height: number;
  /** Unit surface normal, world frame. */
  normal: THREE.Vector3;
  /**
   * Surface friction multiplier applied on top of the tyre's own peak. 1.0 is
   * the dry asphalt the tyre model is calibrated against.
   */
  friction: number;
}

export interface GroundProvider {
  /**
   * Sample the surface under a world (x, z). Writes into `out` and returns it
   * so the caller can keep one scratch object per wheel and never allocate.
   */
  sample(x: number, z: number, out: GroundSample): GroundSample;
}

export function createGroundSample(): GroundSample {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0), friction: 1 };
}

/** Infinite flat plane. */
export class FlatGround implements GroundProvider {
  constructor(
    private readonly y = 0,
    private readonly friction = 1,
  ) {}

  sample(_x: number, _z: number, out: GroundSample): GroundSample {
    out.height = this.y;
    out.normal.set(0, 1, 0);
    out.friction = this.friction;
    return out;
  }
}

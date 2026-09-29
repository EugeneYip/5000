/**
 * Wheel-arch liners.
 *
 * Visible in every side and three-quarter shot: you look into the arch past
 * the tyre and either there is a moulded plastic liner there or there is a
 * black void, and the void is what makes a render look like a render. They are
 * also what the wheel's reflection lands on, so they matter more than their
 * screen area suggests.
 *
 * Built as a partial cylinder about the wheel axis that blends out to meet the
 * body's arch opening at the lip, with the radial stiffening ribs a moulded
 * liner has and a rolled edge where it clips under the wing.
 */

import * as THREE from 'three';
import { BODY, tyreRadius } from '@/spec';
import { HP } from '@/car/hardpoints';
import { archTopY, halfWidthAt, tAtY } from '@/car/body/surface';
import { grid, merge, lerp, clamp } from './geom';

const R = tyreRadius();
/**
 * The lip has to ride on the body's own arch edge, not on a constant.
 *
 * `HP.side.archLipX` is the half-width at the arch **crown**; held along the
 * whole arch it walks out through the skin as the body tucks in fore and aft.
 * At the rear arch's trailing end the body is 0.833 and this lip sat at
 * 0.883 — 50 mm proud. `panels.ts`'s `wheelHouse` already learned this; the
 * liner did not, and narrowing the rear arch made it worse.
 *
 * Queried off the surface at the lip's own y, with the crown value as the
 * fallback for stations the query cannot resolve.
 */
function lipXAt(z: number, y: number): number {
  const t = tAtY(z, y);
  const w = Number.isFinite(t) ? halfWidthAt(z, t) : NaN;
  return Number.isFinite(w) && w > 0.2 ? w : HP.side.archLipX;
}
const ARCH_R = HP.side.archRadius;

/** Liner radius: far enough off the tyre to clear it at full bump and lock. */
const SHELL_R = R + 0.058;
const SWEEP = 1.30;

function liner(axleZ: number, sign: 1 | -1, depth: number): THREE.BufferGeometry {
  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();

  const at = (a: number, b: number, out: THREE.Vector3): THREE.Vector3 => {
    const th = lerp(-SWEEP, SWEEP, a);
    const z = axleZ + Math.sin(th) * SHELL_R;
    const yCirc = R + Math.cos(th) * SHELL_R;
    const top = archTopY(z, axleZ);
    // At the lip the liner has to follow the body's opening, which is a
    // flattened superellipse, not a circle. Inboard it relaxes to the cylinder.
    const yLip = (top ?? yCirc) - 0.024;
    const k = b * b * (3 - 2 * b);
    let y = lerp(yLip, yCirc, clamp(k * 1.25, 0, 1));
    // Radial stiffening ribs and the moulded-in dirt trap at the rear.
    y -= 0.0045 * Math.cos(a * 46) * b;
    y -= 0.006 * Math.cos(b * 22) * (0.4 + 0.6 * b);
    const lipX = lipXAt(z, y);
    const x = sign * lerp(lipX - 0.008, lipX - depth, k);
    return out.set(x, y, z);
  };

  return grid(46, 9, (a, b, out) => {
    at(a, b, out.p);
    at(a + 0.004, b, _p).sub(out.p);
    at(a, Math.min(1, b + 0.004), _q).sub(out.p);
    out.n.crossVectors(_p, _q);
    if (out.n.lengthSq() < 1e-14) out.n.set(0, -1, 0); else out.n.normalize();
    // Face down and outboard, into the arch, not up into the wing.
    if (out.n.y > 0) out.n.negate();
    out.u = a * ARCH_R * 6;
    out.v = b * 2.2;
  });
}

/** Both arches, both sides, merged. */
export function buildLiners(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1] as const) {
    parts.push(liner(0, s, 0.232));
    parts.push(liner(-BODY.wheelbase, s, 0.208));
  }
  return merge(parts);
}

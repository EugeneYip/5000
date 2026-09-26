/**
 * Floorpan, structure and the big under-car masses.
 *
 * The car gets photographed from low angles and the contact shadow and the
 * ambient occlusion under it are computed from whatever geometry is actually
 * there — a car with a flat empty underside floats above the ground no matter
 * how good the paint is. So this is a real pan with a real transmission
 * tunnel, real rails and real lumps hanging off it, not a plate.
 *
 * Heights are read off the body's own floor level (`T.floor`) so the pan
 * always meets the rockers, whatever the body stream does to the section.
 */

import * as THREE from 'three';
import { BODY } from '@/spec';
import { HP } from '@/car/hardpoints';
import { T, heightAt, halfWidthAt } from '@/car/body/surface';
import { grid, sqBox, cyl, place, mirror, merge, lerp, clamp, type Sample } from './geom';

const REAR_AXLE = -BODY.wheelbase;

/** Underside of the floor at station `z`, before any local feature. */
const floorY = (z: number): number => heightAt(z, T.floor) + 0.002;
/** Half-width of the pan, inboard of the rocker's inner face. */
const floorHW = (z: number): number => Math.max(0.05, halfWidthAt(z, T.floor) - 0.030);

const Z_FRONT = 0.760;
const Z_REAR = -3.620;

const TUNNEL_HALF = 0.118;
const TUNNEL_FRONT = 0.560;
const TUNNEL_REAR = -2.060;

const SPARE_Z = -3.230;
const SPARE_R = 0.300;

/** A soft-edged window in z, for a local feature like a jacking notch. */
const gate = (x: number, a: number, b: number): number => {
  const mid = 0.5 * (a + b), half = Math.abs(b - a) / 2;
  const k = clamp(1 - Math.abs(x - mid) / half, 0, 1);
  return k * k * (3 - 2 * k);
};

/** Smooth rise used for every stamped feature: never a fold, always a fillet. */
const bump = (x: number, a: number, b: number): number => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/**
 * Height of the pan's underside. Positive is up, so the tunnel — which
 * protrudes into the cabin — *raises* this surface, and the spare well, which
 * hangs below the boot floor, lowers it.
 */
function panY(x: number, z: number): number {
  let y = floorY(z);

  // Transmission tunnel. A C3 is longitudinal front-drive, so the tunnel runs
  // the full length of the cabin whether or not the car is a quattro.
  const inTunnel = bump(z, TUNNEL_REAR - 0.16, TUNNEL_REAR + 0.10)
    * (1 - bump(z, TUNNEL_FRONT - 0.06, TUNNEL_FRONT + 0.18));
  const across = 1 - bump(Math.abs(x), TUNNEL_HALF - 0.030, TUNNEL_HALF + 0.028);
  y += 0.128 * inTunnel * across;

  // Rear seat pan and load floor step.
  y += 0.052 * bump(z, -2.30, -2.46);
  y += 0.030 * bump(z, -2.84, -3.02);

  // Spare wheel well, hanging below the load floor.
  const rr = Math.hypot(x / 1.06, (z - SPARE_Z) / 1.0) / SPARE_R;
  y -= 0.086 * (1 - bump(rr, 0.62, 1.0));

  // Front footwells sit lower than the tunnel sides and the engine bay floor
  // steps up ahead of the bulkhead.
  y += 0.070 * bump(z, 0.30, 0.52);

  // Longitudinal stampings. Shallow, close-pitched, and the reason a real pan
  // never reads as a single flat sheet under raking light.
  y += 0.0065 * Math.cos(x * 46.0) * bump(z, -0.42, -0.30) * (1 - bump(z, -2.90, -2.70));
  y += 0.0040 * Math.cos((z - 0.1) * 30.0) * (1 - bump(Math.abs(x), 0.52, 0.66));

  return y;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function buildFloorpan(): THREE.BufferGeometry {
  const h = 0.012;
  return grid(96, 40, (u, v, out: Sample) => {
    const z = lerp(Z_FRONT, Z_REAR, u);
    const hw = floorHW(z);
    const x = lerp(-hw, hw, v);
    out.p.set(x, panY(x, z), z);
    // Normal from the height field: analytic beats averaged triangles at this
    // resolution and keeps the stampings reading as soft folds.
    _a.set(2 * h, panY(x + h, z) - panY(x - h, z), 0);
    _b.set(0, panY(x, z + h) - panY(x, z - h), 2 * h);
    out.n.crossVectors(_b, _a).normalize();
    if (out.n.y > 0) out.n.negate();
    out.u = x * 3;
    out.v = -z * 3;
  });
}

/** Box-section rails, crossmembers, the rocker pinch weld and jacking notches. */
export function buildStructure(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Front chassis rails: bumper mounts to bulkhead. The engine hangs off these.
  const frontRail = (): THREE.BufferGeometry[] => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const k = i / 11;
      const z = lerp(0.980, -0.470, k);
      const x = lerp(0.372, 0.452, bump(k, 0.15, 0.75));
      const y = lerp(0.392, floorY(z) - 0.048, bump(k, 0.35, 0.95));
      out.push(place(sqBox(0.082, 0.096, 0.150, 0.9, 12, 8), { pos: [x, y, z] }));
    }
    return out;
  };
  parts.push(...frontRail());
  parts.push(...frontRail().map(mirror));

  // Rear rails, kicking up over the axle.
  const rearRail = (): THREE.BufferGeometry[] => {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const k = i / 11;
      const z = lerp(-2.050, -3.560, k);
      const x = lerp(0.408, 0.352, k);
      const y = floorY(z) - 0.042 + 0.055 * (1 - Math.abs(k - 0.45) / 0.45 > 0 ? 1 - Math.abs(k - 0.45) / 0.45 : 0);
      out.push(place(sqBox(0.074, 0.086, 0.150, 0.9, 12, 8), { pos: [x, y, z] }));
    }
    return out;
  };
  parts.push(...rearRail());
  parts.push(...rearRail().map(mirror));

  // Crossmembers.
  for (const [z, w, hgt] of [
    [0.060, 1.02, 0.085], [-0.480, 1.32, 0.072], [-1.480, 1.38, 0.058],
    [-2.290, 1.30, 0.070], [-2.960, 1.16, 0.080],
  ] as const) {
    parts.push(place(sqBox(w, hgt, 0.112, 0.9, 20, 8), { pos: [0, floorY(z) - hgt * 0.42, z] }));
  }

  // Rocker pinch weld: a continuous seam flange hanging just below the sill,
  // and the two jacking notches pressed into it. Built as one strip rather
  // than a row of boxes — spaced boxes read as a saw blade under raking light,
  // and it is the first thing that catches the eye from a low three-quarter.
  for (const s of [1, -1] as const) {
    parts.push(grid(64, 5, (u, v, out) => {
      const z = lerp(0.700, -3.500, u);
      // Stay inboard of the rocker's own lowest point so nothing breaks the
      // body's silhouette in a dead-side view.
      const x = halfWidthAt(z, T.floor) - 0.014;
      const notch = 0.018 * (gate(z, -0.620, -0.500) + gate(z, -2.240, -2.120));
      const drop = 0.020 + notch;
      out.p.set(s * (x - v * 0.008), heightAt(z, T.floor) + 0.004 - v * drop, z);
      out.n.set(s * 0.92, -0.38, 0).normalize();
      out.u = z * 8; out.v = v;
    }));
  }

  return merge(parts);
}

/** Fuel tank, filler pipe, spare well lip and the charcoal canister. */
export function buildTank(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 80 litres, saddled over the propshaft tunnel ahead of the rear axle. Two
  // lobes plus a bridge is what gives the real tank its shape.
  for (const s of [1, -1] as const) {
    parts.push(place(sqBox(0.330, 0.208, 0.560, 0.80, 18, 12), { pos: [s * 0.215, 0.292, -2.360] }));
  }
  parts.push(place(sqBox(0.160, 0.104, 0.500, 0.75, 14, 10), { pos: [0, 0.344, -2.360] }));
  // Sender flange and the strap bosses.
  parts.push(place(cyl(0.062, 0.062, 0.030, 14), { pos: [0.128, 0.406, -2.300] }));
  for (const z of [-2.160, -2.560]) {
    parts.push(place(sqBox(0.760, 0.020, 0.044, 0.9, 12, 6), { pos: [0, 0.196, z] }));
  }

  // Filler neck, running up to the flap on the left rear quarter.
  // Kept well inboard of the quarter panel: the flap is at the body surface,
  // but the neck has to live inside the wheel house, not through it.
  const fx = HP.side.fuelFlapCenter[0] + 0.155;
  parts.push(place(cyl(0.030, 0.030, 0.230, 12), {
    pos: [fx, 0.470, -2.800], rot: [-0.34, 0, 0.28],
  }));

  // Charcoal canister, ahead of the right rear wheel.
  parts.push(place(cyl(0.056, 0.056, 0.170, 14), { pos: [0.520, 0.300, -2.420], rot: [0, 0, 0.12] }));

  // Spare well lip, so the well reads as a pressing rather than a dent.
  parts.push(place(new THREE.TorusGeometry(SPARE_R * 1.01, 0.014, 6, 30), {
    pos: [0, floorY(SPARE_Z) - 0.030, SPARE_Z], rot: [Math.PI / 2, 0, 0],
  }));

  return merge(parts);
}

/** The soft front air dam, and the sill and rear valance lips. */
export function buildAero(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // A soft rubber spoiler bolted under the valance. It has to start *at* the
  // body's lower face and curl back under, not hang off it: a flat plate below
  // a gap reads as a shelf bolted to nothing, which is exactly how it looked
  // the first time round.
  parts.push(grid(34, 9, (u, v, out) => {
    const x = lerp(-0.760, 0.760, u);
    const e = Math.abs(x) / 0.760;
    // Dies away into the wheel arches at both ends.
    const drop = (0.118 - 0.070 * Math.pow(e, 2.6)) * (1 - Math.pow(Math.max(0, e - 0.86) / 0.14, 2));
    // v runs down the front face, round the lip, and back under.
    const k = Math.min(1, v / 0.62);
    const back = Math.max(0, (v - 0.62) / 0.38);
    const y = 0.296 - drop * (k * k * (3 - 2 * k)) + back * 0.022;
    const z = lerp(HP.noseZ - 0.086, HP.noseZ - 0.140, k) - back * 0.118;
    out.p.set(x, y, z);
    out.n.set(x * 0.25, -Math.sin(v * Math.PI * 0.9), Math.cos(v * Math.PI * 0.9)).normalize();
    out.u = x * 5; out.v = v * 1.4;
  }));

  // Rear valance lip under the bumper.
  parts.push(place(sqBox(1.30, 0.030, 0.090, 0.85, 20, 6),
    { pos: [0, HP.rear.bumperBottomY + 0.004, HP.tailZ + 0.060] }));

  return merge(parts);
}

/** Aluminised heat shields over the exhaust run. */
export function buildHeatShields(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [z, w, d] of [[-0.62, 0.30, 0.42], [-1.62, 0.34, 0.62], [-2.36, 0.40, 0.46]] as const) {
    parts.push(grid(10, 8, (u, v, out) => {
      const x = lerp(-w / 2, w / 2, u) - 0.06;
      const zz = z + lerp(-d / 2, d / 2, v);
      // Pressed with a shallow dome so it stays stiff; that dome is what
      // catches the light and says "foil" rather than "cardboard".
      const dome = 0.010 * Math.cos(u * Math.PI - Math.PI / 2) * Math.cos(v * Math.PI - Math.PI / 2);
      out.p.set(x, floorY(zz) - 0.012 - dome, zz);
      out.n.set(u - 0.5, -1.6, v - 0.5).normalize();
      out.u = x * 22; out.v = zz * 22;
    }));
  }
  return merge(parts);
}

export { floorY, floorHW, REAR_AXLE };

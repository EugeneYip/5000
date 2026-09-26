/**
 * The box the cabin lives in: floor pan and carpet, transmission tunnel,
 * headliner, pillar trim, sills and the firewall.
 *
 * None of this is what anyone photographs, and all of it is what makes the
 * car read as *occupied* from outside. An empty shell lets the eye run
 * straight through the side glass to the sky, which is exactly the fault this
 * module exists to fix: the floor stops the view going down, the headliner
 * stops it going up, and the pillar trim gives the glass something to be
 * bounded by.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { HP } from '@/car/hardpoints';
import { CABIN, TONE, innerHalfW } from './layout';
import { clamp, fbm, lerp, merge, mesh, mirrored, smoothstep, surface, type Vec3 } from './util';

const TAIL = HP.tailZ;

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

/** Height of the pressed steel floor under the carpet. */
function floorHeight(x: number, z: number): number {
  const ax = Math.abs(x);

  // Longitudinal steps: deep footwells, up at the seat crossmember, up again
  // over the rear axle.
  let y: number = lerp(CABIN.footwellY, CABIN.floorY, smoothstep(-1.34, -1.02, z));
  y = lerp(y, CABIN.rearFloorY, smoothstep(-2.10, -1.86, z));

  // Toe board: the floor turns up hard into the bulkhead.
  y += smoothstep(-0.62, -0.40, z) * 0.20 * (1 - smoothstep(0.55, 0.74, ax));

  // Transmission tunnel. A longitudinal five needs a big one, and it is the
  // single most visible thing on the cabin floor.
  const t = 1 - smoothstep(CABIN.tunnelHalfW, CABIN.tunnelHalfW + 0.105, ax);
  y = lerp(y, Math.max(y, CABIN.tunnelTopY), t * t * (3 - 2 * t));

  // Sill: the floor turns up to meet the rocker.
  y += smoothstep(0.585, 0.70, ax) * 0.13;

  // Under the rear seat the pan lifts over the tank.
  y += smoothstep(-2.34, -2.16, z) * 0.085;
  return y;
}

function buildFloor(ctx: BuildContext): THREE.Object3D[] {
  const nu = 52;
  const nv = 66;
  const z0 = -0.40;
  const z1 = CABIN.cargoFloorFrontZ;
  const g = surface(nu, nv, false, (i, j, out) => {
    const u = i / nu;
    const v = j / nv;
    const x = lerp(-0.735, 0.735, u);
    const z = lerp(z0, z1, v);
    // Cut pile is never flat: it lifts over the crossmembers and takes a
    // shallow trough along the heel line.
    const nap = fbm(x * 9, 3.1, z * 7, 2) * 0.0035;
    const heel = -0.006 * Math.exp(-((z + 0.80) ** 2) / 0.012) * (1 - smoothstep(0.30, 0.52, Math.abs(x)));
    out.set(x, floorHeight(x, z) + 0.011 + nap + heel, z);
  });
  const carpet = mesh(g, ctx.materials.carpet(), 'carpet');

  // Sill plates: the bright tread where the carpet stops at the door.
  const sill: THREE.BufferGeometry[] = [];
  for (const zs of [[-0.46, -1.57], [-1.61, -2.56]]) {
    const s = surface(2, 14, false, (i, j, out) => {
      const z = lerp(zs[0], zs[1], j / 14);
      const prof: Array<[number, number]> = [[0.0, 0.0], [0.052, 0.004], [0.062, -0.004]];
      const q = prof[i];
      out.set(-(0.700 - q[0]), floorHeight(-0.70, z) + 0.016 + q[1], z);
    });
    sill.push(s, mirrored(s));
  }
  const sillMesh = mesh(merge(sill), ctx.materials.chrome({ roughness: 0.38 }), 'sillPlates');

  return [carpet, sillMesh];
}

/**
 * Floor mats. A thirty-year-old car has them, they sit a few millimetres
 * proud of the carpet with a bound edge, and the driver's has been shoved
 * forward by a heel a thousand times.
 */
function buildMats(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const mat = (cx: number, cz: number, hw: number, hz: number, skew: number, seed: number): void => {
    parts.push(surface(12, 14, false, (i, j, out) => {
      const u = (i / 12) * 2 - 1;
      const v = (j / 14) * 2 - 1;
      // Rounded corners, and the whole mat rotated a degree or two out of
      // square because nobody ever puts one back straight.
      const k = 1 - 0.22 * Math.max(0, Math.abs(u) + Math.abs(v) - 1.05) ** 1.4;
      const x0 = u * hw * k;
      const z0 = v * hz * k;
      const x = cx + x0 * Math.cos(skew) - z0 * Math.sin(skew);
      const z = cz + x0 * Math.sin(skew) + z0 * Math.cos(skew);
      // Bound edge stands proud; the middle has been trodden flat.
      const edge = smoothstep(0.80, 0.99, Math.max(Math.abs(u), Math.abs(v)));
      const y = floorHeight(x, z) + 0.0175 + edge * 0.0035 - 0.0015 * (1 - edge)
        + fbm(x * 11 + seed, 7, z * 9, 2) * 0.0016;
      out.set(x, y, z);
    }));
  };
  mat(-CABIN.seatX, -0.640, 0.186, 0.196, 0.035, 1.3);
  mat(CABIN.seatX, -0.662, 0.186, 0.196, -0.012, 4.1);
  mat(-CABIN.seatX + 0.02, -1.790, 0.176, 0.170, -0.02, 7.7);
  mat(CABIN.seatX - 0.02, -1.790, 0.176, 0.170, 0.015, 9.2);
  return mesh(merge(parts), ctx.materials.fabric({ color: 0x26282c }), 'floorMats');
}

// ---------------------------------------------------------------------------
// Headliner
// ---------------------------------------------------------------------------

const ROOF_HALF = 0.706;

function headlinerY(x: number, z: number): number {
  const k = clamp(Math.abs(x) / ROOF_HALF, 0, 1);
  // Crowned across the car, and it drops away at the windscreen header.
  const crown = CABIN.headlinerY - (CABIN.headlinerY - CABIN.headlinerEdgeY) * k * k;
  return crown - (1 - smoothstep(HP.headerZ - 0.27, HP.headerZ - 0.01, z)) * 0.05;
}

function buildHeadliner(ctx: BuildContext): THREE.Mesh {
  const z0 = HP.headerZ - 0.005;
  const z1 = TAIL + 0.80;
  const nu = 26;
  const nv = 34;
  const g = surface(nu, nv, false, (i, j, out) => {
    const u = i / nu;
    const v = j / nv;
    const x = lerp(-ROOF_HALF, ROOF_HALF, u);
    const z = lerp(z0, z1, v);
    const edge = 1 - smoothstep(0.86, 1.0, Math.abs(x) / ROOF_HALF);
    out.set(x, headlinerY(x, z) - (1 - edge) * 0.03 + fbm(x * 6, 11, z * 4, 2) * 0.0015, z);
  });
  // Moulded board, not cloth-over-foam: a light grey so the cabin reads as a
  // space with air in it rather than a black hole behind the glass.
  return mesh(g, ctx.materials.fabric({ color: 0x8c8e93 }), 'headliner');
}

// ---------------------------------------------------------------------------
// Pillars and upper trim
// ---------------------------------------------------------------------------

/**
 * Sweep a soft rectangular moulding along a path, keeping the section's wide
 * axis in the plane of the body side. Pillar trim is a flat cover, not a tube.
 */
function pillar(points: Vec3[], width: number, depth: number, steps = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3);
  const tangent = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const p = new THREE.Vector3();
  const section: Array<[number, number]> = [
    [-0.5, 0.0], [-0.44, 0.78], [-0.24, 1.0], [0.24, 1.0], [0.44, 0.78], [0.5, 0.0],
    [0.46, -0.16], [-0.46, -0.16],
  ];
  return surface(section.length, steps, true, (i, j, out) => {
    const t = j / steps;
    curve.getPoint(t, p);
    curve.getTangent(t, tangent);
    // Inward normal points at the cabin centreline; that keeps the moulding
    // lying flat on the pillar instead of twisting with the Frenet frame.
    nrm.set(-Math.sign(p.x || 1), 0, 0).addScaledVector(tangent, -tangent.x * -Math.sign(p.x || 1)).normalize();
    bin.crossVectors(tangent, nrm).normalize();
    const s = section[i % section.length];
    out.copy(p).addScaledVector(bin, s[0] * width).addScaledVector(nrm, s[1] * depth);
  });
}

function buildPillars(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  // A-pillar: from the header down to the daylight opening's front corner.
  // Both ends are hardpoints, so the trim cannot drift off the glass edge.
  const a = pillar([
    [-0.652, HP.headerY - 0.048, HP.headerZ - 0.012],
    [-0.706, 1.276, -1.010],
    [-0.762, 1.160, -0.800],
    [-0.792, HP.glass.dloBottomY + 0.026, HP.glass.dloFrontZ - 0.010],
  ], 0.058, 0.030, 9);
  parts.push(a, mirrored(a));

  // B-pillar: the tall one, carrying the belt reel and the upper anchor.
  const b = pillar([
    [-0.792, 0.952, -1.585],
    [-0.786, 1.108, -1.588],
    [-0.752, 1.246, -1.592],
    [-0.688, 1.338, -1.596],
  ], 0.092, 0.036, 7);
  parts.push(b, mirrored(b));

  // C-pillar: the body between the rear door's shutline and the quarter
  // glass, so it sits at the midpoint of the two.
  const cz = (HP.side.doorRearZ + HP.glass.quarterRearFrontZ) / 2;
  const c = pillar([
    [-0.786, 0.962, cz],
    [-0.772, 1.128, cz - 0.011],
    [-0.726, 1.272, cz - 0.021],
    [-0.664, 1.340, cz - 0.031],
  ], Math.abs(HP.glass.quarterRearFrontZ - HP.side.doorRearZ) + 0.028, 0.030, 7);
  parts.push(c, mirrored(c));

  // D-pillar: the Avant's, wide and raked, closing the quarter glass.
  const d = pillar([
    [-0.742, 0.986, TAIL + 0.742],
    [-0.726, 1.128, TAIL + 0.786],
    [-0.686, 1.262, TAIL + 0.830],
    [-0.624, 1.338, TAIL + 0.862],
  ], 0.088, 0.034, 7);
  parts.push(d, mirrored(d));

  // Cant rail: the strip of trim between the headliner and the door glass.
  for (const s of [-1, 1]) {
    const rail = surface(3, 22, false, (i, j, out) => {
      const z = lerp(HP.headerZ - 0.02, TAIL + 0.80, j / 22);
      const prof: Array<[number, number]> = [[0, 0], [0.018, -0.014], [0.030, -0.034], [0.030, -0.052]];
      const q = prof[i];
      out.set(s * (ROOF_HALF - q[0]), headlinerY(s * ROOF_HALF, z) + q[1] + 0.004, z);
    });
    parts.push(rail);
  }

  return mesh(merge(parts), ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.78 }), 'pillarTrim');
}

// ---------------------------------------------------------------------------
// Sides below the belt, and the firewall
// ---------------------------------------------------------------------------

function buildInnerSides(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  // Inner rocker / kick panel, from the floor edge up to the door card.
  const kick = surface(3, 26, false, (i, j, out) => {
    const z = lerp(-0.44, -2.60, j / 26);
    const prof: Array<[number, number]> = [[0.012, 0.402], [0.0, 0.452], [0.004, 0.520], [0.018, 0.556]];
    const q = prof[i];
    out.set(-(innerHalfW(q[1]) - q[0] + 0.004), q[1], z);
  });
  parts.push(kick, mirrored(kick));

  // Firewall, so the windscreen has something behind it rather than daylight.
  const fw = surface(10, 4, false, (i, j, out) => {
    const x = lerp(-0.74, 0.74, i / 10);
    const y = lerp(0.36, 0.86, j / 4);
    out.set(x, y, -0.352 + Math.abs(x) * 0.04 + (1 - Math.abs(x) / 0.74) * -0.02);
  });
  parts.push(fw);

  // Rear bulkhead below the rear seat, closing the view under the bench.
  const rb = surface(8, 3, false, (i, j, out) => {
    const x = lerp(-0.66, 0.66, i / 8);
    const y = lerp(CABIN.rearFloorY + 0.06, CABIN.cargoFloorY, j / 3);
    out.set(x, y, -2.392 - j * 0.004);
  });
  parts.push(rb);

  return mesh(merge(parts), ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.82 }), 'innerSides');
}

// ---------------------------------------------------------------------------

export function buildShell(ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shell';
  for (const o of buildFloor(ctx)) g.add(o);
  g.add(buildMats(ctx));
  g.add(buildHeadliner(ctx));
  g.add(buildPillars(ctx));
  g.add(buildInnerSides(ctx));
  return g;
}

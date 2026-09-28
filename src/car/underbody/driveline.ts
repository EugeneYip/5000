/**
 * Engine bay and exhaust.
 *
 * The bonnet opens, so the top of the engine has to survive being looked at.
 * The distinctive thing about this car is that the 2309 cc five is mounted
 * **longitudinally and ahead of the front axle** — that layout is why a C3
 * carries 60 % of its weight on the nose, and it makes the bay read completely
 * differently from a transverse four: one long cam cover down the centre, the
 * radiator a long way forward of it, and the gearbox disappearing under the
 * bulkhead.
 *
 * The exhaust is a single naturally-aspirated system: manifold, downpipe,
 * catalyst, centre silencer, rear box, one pipe. Not a twin-pipe sports
 * system, which this car never had.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { heightAt, tAtX } from '@/car/body/surface';
import { sqBox, cyl, tube, place, merge, lerp, grid } from './geom';

export interface Driveline {
  /** Clean alloy the bonnet exposes: head, cam cover, intake, ancillaries. */
  cast: THREE.BufferGeometry;
  /** Everything below the floor line: block, sump, gearbox, exhaust. */
  grimy: THREE.BufferGeometry;
  black: THREE.BufferGeometry;
  rubber: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
}

/**
 * Height of the body skin directly above a point in the engine bay. Everything
 * in the bay is clamped under this: the bonnet crowns and falls away towards
 * the wings, so a strut tower sized off the centreline height punches straight
 * through the panel at the edges.
 */
function skinY(x: number, z: number): number {
  return heightAt(z, tAtX(z, Math.abs(x)));
}

/** Crank centreline. The five stands upright and on the car's centreline. */
const CRANK_Y = 0.478;
const ENGINE_FRONT = 0.628;
const ENGINE_REAR = 0.038;
/** Bore spacing that gets five cylinders into 590 mm of block. */
const BORE_PITCH = 0.0885;
const CYL_1_Z = ENGINE_FRONT - 0.082;

export function buildDriveline(): Driveline {
  const cast: THREE.BufferGeometry[] = [];
  const grimy: THREE.BufferGeometry[] = [];
  const black: THREE.BufferGeometry[] = [];
  const rubber: THREE.BufferGeometry[] = [];
  const bright: THREE.BufferGeometry[] = [];

  // =========================================================================
  // Block, sump, head and the cam cover
  // =========================================================================
  grimy.push(place(sqBox(0.238, 0.300, 0.592, 0.86, 18, 12),
    { pos: [0.004, CRANK_Y + 0.088, (ENGINE_FRONT + ENGINE_REAR) / 2] }));
  // Sump: deep at the back on a longitudinal engine, to clear the crossmember.
  grimy.push(place(sqBox(0.228, 0.130, 0.360, 0.72, 16, 10), { pos: [0.004, 0.352, 0.300] }));
  grimy.push(place(sqBox(0.216, 0.070, 0.230, 0.7, 14, 8), { pos: [0.004, 0.318, 0.150] }));
  // Bellhousing and gearbox, running back under the bulkhead.
  grimy.push(place(cyl(0.170, 0.152, 0.140, 18), { pos: [0.004, CRANK_Y + 0.010, -0.048], rot: [Math.PI / 2, 0, 0] }));
  grimy.push(place(sqBox(0.190, 0.210, 0.420, 0.7, 16, 10), { pos: [0.004, CRANK_Y - 0.012, -0.320] }));

  // Head.
  cast.push(place(sqBox(0.248, 0.122, 0.560, 0.84, 18, 10), { pos: [0.010, 0.694, 0.322] }));

  // Cam cover. Ten valves, one cam, and a long ribbed alloy lid — the single
  // most recognisable thing in the bay.
  {
    const coverZ = 0.322;
    cast.push(place(sqBox(0.186, 0.072, 0.548, 0.80, 20, 10), { pos: [0.014, 0.788, coverZ] }));
    for (let i = 0; i < 5; i++) {
      const rib = -0.060 + i * 0.030;
      cast.push(place(sqBox(0.012, 0.014, 0.520, 0.6, 6, 5), { pos: [0.014 + rib, 0.824, coverZ] }));
    }
    // Cam-cover bolts down both flanges.
    for (let i = 0; i < 6; i++) {
      const z = coverZ + lerp(-0.240, 0.240, i / 5);
      for (const s of [1, -1] as const) {
        bright.push(place(cyl(0.010, 0.010, 0.012, 8), { pos: [0.014 + s * 0.100, 0.766, z] }));
      }
    }
    // Oil filler, forward, and the breather to the airbox.
    cast.push(place(cyl(0.032, 0.036, 0.034, 14), { pos: [0.014, 0.840, coverZ + 0.212] }));
    rubber.push(place(cyl(0.017, 0.017, 0.150, 10), { pos: [0.082, 0.826, coverZ + 0.120], rot: [0, 0, -0.9] }));
  }

  // Timing belt cover at the front of the engine.
  black.push(place(sqBox(0.070, 0.300, 0.062, 0.7, 12, 12), { pos: [0.014, 0.626, ENGINE_FRONT + 0.016] }));

  // =========================================================================
  // Intake, on the left of the block; exhaust on the right
  // =========================================================================
  // **+X is the car's LEFT** (frame note at the top of `hardpoints.ts`), so
  // the intake is at +x and the exhaust at −x. Both were the other way round
  // until this commit — authored while the package drawing still said "+X
  // right" — which is the same error that put the tailpipe on the car's
  // right. The heading above was the giveaway: it has always been correct and
  // the code has always contradicted it.
  //
  // Bosch CIS-E: a cast plenum with five runners, and the fuel distributor and
  // air sensor plate sitting above it.
  cast.push(place(sqBox(0.110, 0.104, 0.500, 0.78, 14, 10), { pos: [0.192, 0.742, 0.318] }));
  for (let i = 0; i < 5; i++) {
    const z = CYL_1_Z - i * BORE_PITCH;
    cast.push(tube([
      new THREE.Vector3(0.186, 0.742, z),
      new THREE.Vector3(0.166, 0.762, z),
      new THREE.Vector3(0.118, 0.716, z),
    ], 0.0225, 8));
  }
  cast.push(place(cyl(0.082, 0.076, 0.062, 18), { pos: [0.212, 0.836, 0.452] }));
  black.push(place(sqBox(0.230, 0.110, 0.240, 0.78, 14, 10), { pos: [0.316, 0.842, 0.240] }));
  rubber.push(place(cyl(0.040, 0.040, 0.150, 12), { pos: [0.268, 0.840, 0.400], rot: [Math.PI / 2, 0, -0.3] }));

  // Exhaust manifold: five short runners into a collector.
  for (let i = 0; i < 5; i++) {
    const z = CYL_1_Z - i * BORE_PITCH;
    grimy.push(tube([
      new THREE.Vector3(-0.130, 0.694, z),
      new THREE.Vector3(-0.190, 0.660, z),
      new THREE.Vector3(-0.210, 0.580, lerp(z, 0.150, 0.55)),
      new THREE.Vector3(-0.214, 0.528, 0.132),
    ], 0.0175, 8));
  }

  // =========================================================================
  // Exhaust system — one pipe, one catalyst, two boxes
  // =========================================================================
  const TIP = HP.rear.exhaustTip;
  /**
   * The pipe exits on the car's LEFT, i.e. +x. Written as a magnitude and a
   * side rather than read straight off the hardpoint, which still carries the
   * old "+X right" sign (−0.412). So this is right now, and it is
   * **idempotent**: correcting `HP.rear.exhaustTip[0]` to +0.412 moves
   * nothing here. `trim/details.ts` draws the finisher from the hardpoint and
   * will still be on the wrong side until that correction lands.
   */
  const TIP_X = Math.abs(TIP[0]);
  const pipeR = HP.rear.exhaustDiameter / 2;

  grimy.push(tube([
    new THREE.Vector3(-0.214, 0.510, 0.120),
    new THREE.Vector3(-0.216, 0.400, 0.020),
    new THREE.Vector3(-0.208, 0.300, -0.160),
    new THREE.Vector3(-0.186, 0.268, -0.330),
  ], pipeR * 1.16, 12));
  // Catalyst — a US-market MY1988 car has one.
  grimy.push(place(sqBox(0.136, 0.108, 0.320, 0.55, 16, 10), { pos: [-0.172, 0.262, -0.510] }));
  grimy.push(tube([
    new THREE.Vector3(-0.166, 0.262, -0.670),
    new THREE.Vector3(-0.096, 0.256, -0.930),
    new THREE.Vector3(0.030, 0.250, -1.280),
    new THREE.Vector3(0.076, 0.248, -1.480),
  ], pipeR, 12));
  // Centre silencer.
  grimy.push(place(sqBox(0.190, 0.122, 0.520, 0.5, 16, 10), { pos: [0.084, 0.248, -1.720] }));
  grimy.push(tube([
    new THREE.Vector3(0.090, 0.248, -1.984),
    new THREE.Vector3(0.240, 0.238, -2.180),
    new THREE.Vector3(0.404, 0.222, -2.420),
    new THREE.Vector3(0.408, 0.214, -2.560),
    new THREE.Vector3(0.372, 0.236, -2.700),
  ], pipeR, 12));
  // Rear box, ahead of the spare well and inboard of the left trailing arm.
  grimy.push(place(sqBox(0.400, 0.140, 0.330, 0.5, 18, 10), { pos: [0.318, 0.268, -2.930] }));
  grimy.push(tube([
    new THREE.Vector3(0.360, 0.268, -3.090),
    new THREE.Vector3(0.398, 0.268, -3.360),
    new THREE.Vector3(TIP_X, TIP[1], TIP[2] - 0.010),
  ], pipeR, 12));
  // The tip is a plain rolled pipe end, not a chromed finisher.
  grimy.push(place(cyl(pipeR * 1.18, pipeR * 1.12, 0.062, 14),
    { pos: [TIP_X, TIP[1], TIP[2] + 0.012], rot: [Math.PI / 2, 0, 0] }));

  // Rubber hangers, which is what stops the system reading as a welded-on rail.
  for (const [x, z] of [[-0.19, -0.70], [0.08, -1.46], [0.09, -1.99], [0.40, -2.63], [0.36, -3.10]] as const) {
    rubber.push(place(sqBox(0.016, 0.070, 0.038, 0.6, 6, 6), { pos: [x, 0.312, z] }));
  }

  // =========================================================================
  // Cooling pack, forward of everything
  // =========================================================================
  const RAD_Z = 0.712;
  // Core: a fin field, so it reads as a radiator rather than a black plate.
  black.push(grid(46, 10, (u, v, out) => {
    const x = lerp(-0.290, 0.290, u);
    const y = lerp(0.452, 0.786, v);
    out.p.set(x, y, RAD_Z - 0.010 + 0.0035 * Math.cos(u * 300));
    out.n.set(0.12 * Math.sin(u * 300), 0, 1).normalize();
    out.u = u * 40; out.v = v * 6;
  }));
  black.push(place(sqBox(0.620, 0.046, 0.062, 0.7, 16, 6), { pos: [0, 0.800, RAD_Z] }));
  black.push(place(sqBox(0.620, 0.046, 0.062, 0.7, 16, 6), { pos: [0, 0.440, RAD_Z] }));
  // Condenser, ahead of the core.
  black.push(grid(30, 8, (u, v, out) => {
    out.p.set(lerp(-0.256, 0.256, u), lerp(0.492, 0.752, v), RAD_Z + 0.058);
    out.n.set(0, 0, 1);
    out.u = u * 26; out.v = v * 5;
  }));
  // Fan and shroud, behind.
  black.push(place(sqBox(0.360, 0.360, 0.052, 0.55, 16, 12), { pos: [0.010, 0.620, RAD_Z - 0.076] }));
  for (let i = 0; i < 7; i++) {
    black.push(place(sqBox(0.036, 0.152, 0.012, 0.4, 6, 8), {
      pos: [0.010 + Math.sin((i / 7) * Math.PI * 2) * 0.085, 0.620 + Math.cos((i / 7) * Math.PI * 2) * 0.085, RAD_Z - 0.092],
      rot: [0, 0.35, -(i / 7) * Math.PI * 2],
    }));
  }
  rubber.push(tube([
    new THREE.Vector3(0.180, 0.770, RAD_Z - 0.030),
    new THREE.Vector3(0.150, 0.756, RAD_Z - 0.140),
    new THREE.Vector3(0.108, 0.726, ENGINE_FRONT + 0.030),
  ], 0.024, 10));
  rubber.push(tube([
    new THREE.Vector3(-0.190, 0.486, RAD_Z - 0.030),
    new THREE.Vector3(-0.170, 0.500, RAD_Z - 0.170),
    new THREE.Vector3(-0.120, 0.520, ENGINE_FRONT + 0.010),
  ], 0.024, 10));

  // =========================================================================
  // Bay furniture
  // =========================================================================
  // Strut towers, matching the strut top mounts exactly.
  for (const s of [1, -1] as const) {
    const top = skinY(0.538 + 0.128, -0.036) - 0.020;
    black.push(place(cyl(0.104, 0.128, 0.150, 18), { pos: [s * 0.538, top - 0.082, -0.036] }));
    black.push(place(cyl(0.118, 0.118, 0.014, 18), { pos: [s * 0.538, top, -0.036] }));
  }
  // Inner wings and the slam panel: the bay needs walls or the engine floats.
  for (const s of [1, -1] as const) {
    black.push(grid(22, 7, (u, v, out) => {
      const z = lerp(0.760, -0.340, u);
      const x = lerp(0.548, 0.512, v);
      out.p.set(s * x, lerp(skinY(x, z) - 0.016, 0.470, v), z);
      out.n.set(-s, 0.25, 0).normalize();
      out.u = z * 4; out.v = v * 3;
    }));
  }
  black.push(place(sqBox(1.120, 0.086, 0.090, 0.8, 18, 6), { pos: [0, skinY(0.40, 0.770) - 0.064, 0.770] }));
  // Bulkhead.
  black.push(grid(16, 8, (u, v, out) => {
    const x = lerp(-0.556, 0.556, u);
    const z = -0.356 - 0.030 * Math.sin(u * Math.PI);
    out.p.set(x, lerp(0.440, skinY(x, z) - 0.014, v), z);
    out.n.set(0, 0.1, 1).normalize();
    out.u = u * 5; out.v = v * 5;
  }));

  // Battery, servo and master cylinder, expansion tank, washer bottle.
  black.push(place(sqBox(0.240, 0.190, 0.176, 0.85, 12, 10), { pos: [0.352, 0.700, -0.250] }));
  black.push(place(cyl(0.106, 0.106, 0.120, 18), { pos: [-0.352, 0.808, -0.290], rot: [Math.PI / 2, 0, 0] }));
  cast.push(place(cyl(0.032, 0.032, 0.160, 12), { pos: [-0.352, 0.826, -0.150], rot: [Math.PI / 2, 0, 0] }));
  black.push(place(sqBox(0.150, 0.170, 0.130, 0.7, 12, 10), { pos: [0.386, 0.812, 0.128] }));
  black.push(place(sqBox(0.160, 0.220, 0.150, 0.7, 12, 10), { pos: [-0.400, 0.700, 0.230] }));

  // Alternator and the belt drive at the nose of the engine.
  cast.push(place(cyl(0.062, 0.062, 0.120, 16), { pos: [0.140, 0.560, ENGINE_FRONT + 0.046], rot: [Math.PI / 2, 0, 0] }));
  bright.push(place(cyl(0.078, 0.078, 0.022, 20), { pos: [0.004, CRANK_Y, ENGINE_FRONT + 0.060], rot: [Math.PI / 2, 0, 0] }));
  cast.push(place(cyl(0.052, 0.052, 0.110, 14), { pos: [-0.146, 0.566, ENGINE_FRONT + 0.040], rot: [Math.PI / 2, 0, 0] }));

  return {
    cast: merge(cast),
    grimy: merge(grimy),
    black: merge(black),
    rubber: merge(rubber),
    bright: merge(bright),
  };
}

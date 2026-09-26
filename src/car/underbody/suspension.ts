/**
 * Suspension, front and rear.
 *
 * Front is MacPherson: lower wishbone, strut with a coil around it, anti-roll
 * bar, rack and tie rods, and — this being a longitudinal front-drive car —
 * driveshafts out to the hubs. Rear is the C3's torsion-crank beam: two
 * trailing arms welded to a transverse torsion member, with the springs and
 * dampers separate.
 *
 * Everything that should move, moves. `state.suspensionCompression` is read
 * exactly the way `wheels.ts` reads it — 0.5 is static, and the wheel's travel
 * is `(c − 0.5) · 2 · travel` with a different travel each way — so the arms
 * stay attached to the hubs through the whole stroke instead of drifting off
 * them, which is the thing that gives a rigid model away.
 */

import * as THREE from 'three';
import { BODY, SUSPENSION, WHEEL, tyreRadius } from '@/spec';
import { sqBox, cyl, tube, coil, place, mirror, merge, lerp, clamp } from './geom';

const R = tyreRadius();
const TF = BODY.trackFront / 2;
const TR = BODY.trackRear / 2;
const REAR_AXLE = -BODY.wheelbase;
const HALF_TYRE = WHEEL.width / 2;

/** Everything a corner needs to move, in one place. */
export interface Corner {
  /** Swings about its inboard pivot. */
  arm: THREE.Group;
  /** Follows the hub: damper body, lower spring seat. */
  hub: THREE.Group;
  /** Scaled in Y as the spring shortens. */
  spring: THREE.Group;
  armAxis: THREE.Vector3;
  armLength: number;
  springFree: number;
  hubBaseY: number;
  springBaseY: number;
  front: boolean;
}

export interface SuspensionMats {
  /** Painted pressed steel: arms, subframe, bar, beam. */
  steel: THREE.Material;
  /** Cast alloy and bright steel: rack housing, damper tubes, springs. */
  cast: THREE.Material;
  /** Bushes, gaiters, bump stops. */
  rubber: THREE.Material;
}

export interface SuspensionBuild {
  /** Merged, by material. */
  steel: THREE.BufferGeometry;
  cast: THREE.BufferGeometry;
  rubber: THREE.BufferGeometry;
  /** Per-corner movers, front-left first, matching `VehicleState`. */
  corners: Corner[];
  /** Nodes to parent the movers under. */
  groups: THREE.Group[];
}

/** Inboard pivot of the front lower arm. */
const FRONT_ARM_PIVOT = new THREE.Vector3(0.308, 0.196, -0.020);
/** Where the arm meets the upright. */
const FRONT_BALL = new THREE.Vector3(TF - 0.022, 0.148, 0.004);
/** Strut: lower seat on the damper body, upper mount in the inner wing. */
const STRUT_LOW = new THREE.Vector3(TF - 0.078, 0.470, -0.012);
const STRUT_TOP = new THREE.Vector3(TF - 0.196, 0.902, -0.036);

/** Rear trailing-arm bush, and the torsion member behind it. */
const REAR_BUSH = new THREE.Vector3(0.560, 0.318, REAR_AXLE + 0.402);
const REAR_BEAM_Z = REAR_AXLE + 0.182;

export function buildSuspension(mats: SuspensionMats): SuspensionBuild {
  const steel: THREE.BufferGeometry[] = [];
  const cast: THREE.BufferGeometry[] = [];
  const rubber: THREE.BufferGeometry[] = [];
  const corners: Corner[] = [];
  const groups: THREE.Group[] = [];

  // =========================================================================
  // Front subframe, rack and anti-roll bar — body-side, so they never move
  // =========================================================================
  steel.push(place(sqBox(0.86, 0.070, 0.088, 0.9, 18, 8), { pos: [0, 0.232, 0.128] }));
  for (const s of [1, -1] as const) {
    steel.push(place(sqBox(0.082, 0.062, 0.360, 0.88, 12, 8), { pos: [s * 0.372, 0.226, -0.028] }));
  }

  // Rack and pinion, ahead of the axle on a C3, with its gaiters.
  cast.push(place(cyl(0.030, 0.030, 0.760, 14), { pos: [0, 0.404, -0.176], rot: [0, 0, Math.PI / 2] }));
  cast.push(place(sqBox(0.080, 0.092, 0.096, 0.7, 12, 8), { pos: [-0.192, 0.418, -0.176] }));
  for (const s of [1, -1] as const) {
    rubber.push(place(cyl(0.030, 0.030, 0.088, 10), { pos: [s * 0.418, 0.404, -0.176], rot: [0, 0, Math.PI / 2] }));
    // Tie rod out to the steering arm.
    steel.push(place(cyl(0.011, 0.011, 0.268, 8), {
      pos: [s * 0.590, 0.396, -0.190], rot: [0, s * 0.06, Math.PI / 2],
    }));
  }

  // Anti-roll bar: a U across the front of the subframe with drop links.
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 26; i++) {
      const k = i / 26;
      const x = lerp(-0.560, 0.560, k);
      const back = Math.pow(Math.abs(x) / 0.560, 3.0);
      pts.push(new THREE.Vector3(x, 0.212 - 0.026 * back, 0.176 - 0.300 * back));
    }
    steel.push(tube(pts, 0.0115, 8));
    for (const s of [1, -1] as const) {
      steel.push(place(cyl(0.008, 0.008, 0.120, 8), { pos: [s * 0.572, 0.166, -0.118], rot: [0.12, 0, 0.1] }));
    }
  }

  // =========================================================================
  // Front corners
  // =========================================================================
  for (const s of [-1, 1] as const) {
    const g = new THREE.Group();
    g.name = s < 0 ? 'suspensionFL' : 'suspensionFR';
    groups.push(g);

    const pivot = FRONT_ARM_PIVOT.clone();
    pivot.x *= s;
    const ball = FRONT_BALL.clone();
    ball.x *= s;

    // --- lower wishbone, built about its own pivot -------------------------
    const arm = new THREE.Group();
    arm.name = `${g.name}Arm`;
    arm.position.copy(pivot);
    g.add(arm);

    const armGeo: THREE.BufferGeometry[] = [];
    const armVec = ball.clone().sub(pivot);
    const len = armVec.length();
    // The L: a long leg to the ball joint and a short rearward leg to the
    // second bush, which is what stops the arm rotating about the first.
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      const p = armVec.clone().multiplyScalar(k);
      const w = lerp(0.060, 0.034, k);
      armGeo.push(place(sqBox(0.120, 0.030, w, 0.9, 10, 6), { pos: [p.x, p.y, p.z], rot: [0, 0, s * 0.26 * (1 - k)] }));
    }
    armGeo.push(place(sqBox(0.070, 0.048, 0.150, 0.8, 10, 8), { pos: [0, 0, -0.084] }));
    // Bushes and the ball-joint housing.
    const armRub = [
      place(cyl(0.026, 0.026, 0.060, 10), { pos: [0, 0, 0], rot: [0, 0, Math.PI / 2] }),
      place(cyl(0.024, 0.024, 0.054, 10), { pos: [0.010 * s, 0, -0.166], rot: [0, 0, Math.PI / 2] }),
      place(cyl(0.020, 0.026, 0.038, 10), { pos: [armVec.x, armVec.y + 0.020, armVec.z] }),
    ];
    addMesh(arm, merge(armGeo), 'armSteel', mats.steel);
    addMesh(arm, merge(armRub), 'armRubber', mats.rubber);

    // --- strut -------------------------------------------------------------
    const low = STRUT_LOW.clone(); low.x *= s;
    const top = STRUT_TOP.clone(); top.x *= s;
    const axis = top.clone().sub(low).normalize();
    const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);

    // Body-side half of the strut: the rod, the upper seat and the top mount.
    const upper: THREE.BufferGeometry[] = [];
    upper.push(place(cyl(0.0115, 0.0115, 0.230, 10), { pos: [0, 0.300, 0] }));
    upper.push(place(cyl(0.062, 0.058, 0.014, 18), { pos: [0, 0.402, 0] }));
    upper.push(place(cyl(0.048, 0.034, 0.030, 16), { pos: [0, 0.428, 0] }));
    const upperG = new THREE.Group();
    upperG.position.copy(low);
    upperG.quaternion.copy(tilt);
    g.add(upperG);
    addMesh(upperG, merge(upper), 'strutRod', mats.cast);

    // Hub-side half: damper tube, lower seat, bump stop, brake hose bracket.
    const hub = new THREE.Group();
    hub.name = `${g.name}Hub`;
    hub.position.copy(low);
    hub.quaternion.copy(tilt);
    g.add(hub);
    const lowerGeo = [
      place(cyl(0.0255, 0.0270, 0.300, 14), { pos: [0, -0.140, 0] }),
      place(cyl(0.064, 0.060, 0.012, 18), { pos: [0, 0.002, 0] }),
      place(sqBox(0.038, 0.090, 0.046, 0.8, 10, 8), { pos: [0, -0.268, 0.030] }),
    ];
    addMesh(hub, merge(lowerGeo), 'damper', mats.cast);
    addMesh(hub, place(cyl(0.017, 0.013, 0.070, 10), { pos: [0, 0.052, 0] }), 'bumpStop', mats.rubber);

    // --- spring ------------------------------------------------------------
    const springFree = 0.372;
    const spring = new THREE.Group();
    spring.name = `${g.name}Spring`;
    spring.position.set(0, 0.008, 0);
    hub.add(spring);
    addMesh(spring, coil(0.0645, 0.0118, springFree, 6.1), 'coil', mats.steel);

    // --- driveshaft --------------------------------------------------------
    // Longitudinal engine, so the shafts come off the final drive well behind
    // the axle line and run outboard and slightly forward.
    const shaft = new THREE.Group();
    shaft.name = `${g.name}Shaft`;
    g.add(shaft);
    const inner = new THREE.Vector3(s * 0.140, 0.316, -0.118);
    const outer = new THREE.Vector3(s * (TF - HALF_TYRE - 0.004), R, 0.002);
    addMesh(shaft, tube([inner, inner.clone().lerp(outer, 0.5), outer], 0.0165, 10), 'shaft', mats.cast);
    addMesh(shaft, merge([
      gaiter(inner, outer, 0.16, 0.052),
      gaiter(outer, inner, 0.13, 0.044),
    ]), 'gaiters', mats.rubber);

    corners.push({
      arm, hub, spring,
      armAxis: new THREE.Vector3(0, 0, s),
      armLength: len,
      springFree,
      hubBaseY: hub.position.y,
      springBaseY: spring.position.y,
      front: true,
    });
  }

  // =========================================================================
  // Rear: torsion-crank beam
  // =========================================================================
  {
    // The transverse member itself, an open U-section that twists.
    steel.push(place(sqBox(1.06, 0.086, 0.070, 0.75, 20, 8), { pos: [0, 0.300, REAR_BEAM_Z] }));
    steel.push(place(sqBox(1.02, 0.030, 0.040, 0.7, 18, 6), { pos: [0, 0.344, REAR_BEAM_Z - 0.026] }));
    // Panhard-style tie to the floor and the rear anti-roll effect of the beam
    // come from the beam itself on this car; there is no separate bar.
  }

  for (const s of [-1, 1] as const) {
    const g = new THREE.Group();
    g.name = s < 0 ? 'suspensionRL' : 'suspensionRR';
    groups.push(g);

    const bush = REAR_BUSH.clone(); bush.x *= s;
    const hubPt = new THREE.Vector3(s * (TR - 0.030), R, REAR_AXLE);

    const arm = new THREE.Group();
    arm.name = `${g.name}Arm`;
    arm.position.copy(bush);
    g.add(arm);

    const rel = hubPt.clone().sub(bush);
    const armGeo: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const k = i / 9;
      const p = rel.clone().multiplyScalar(k);
      armGeo.push(place(sqBox(0.062, lerp(0.074, 0.110, k), 0.110, 0.88, 10, 6), { pos: [p.x, p.y, p.z] }));
    }
    // Stub axle flange and the beam stub.
    armGeo.push(place(cyl(0.062, 0.062, 0.026, 16), {
      pos: [rel.x + s * 0.020, rel.y, rel.z], rot: [0, 0, Math.PI / 2],
    }));
    armGeo.push(place(sqBox(0.070, 0.086, 0.150, 0.8, 10, 8), {
      pos: [rel.x * 0.42, rel.y * 0.42 - 0.012, REAR_BEAM_Z - bush.z],
    }));
    addMesh(arm, merge(armGeo), 'rearArm', mats.steel);
    addMesh(arm, place(cyl(0.030, 0.030, 0.072, 10), { rot: [0, 0, Math.PI / 2] }), 'rearBush', mats.rubber);

    // Spring, seated on the arm just ahead of the hub.
    const springFree = 0.286;
    const seat = new THREE.Vector3(s * (TR - 0.150), 0.300, REAR_AXLE + 0.070);
    const spring = new THREE.Group();
    spring.name = `${g.name}Spring`;
    spring.position.copy(seat);
    g.add(spring);
    addMesh(spring, coil(0.0625, 0.0125, springFree, 5.4), 'coilRear', mats.steel);
    addMesh(spring, place(cyl(0.070, 0.070, 0.012, 16), { pos: [0, -0.006, 0] }), 'seat', mats.rubber);

    // Damper: near-vertical, outboard of the spring.
    const dLow = new THREE.Vector3(s * (TR - 0.062), 0.300, REAR_AXLE - 0.060);
    const dTop = new THREE.Vector3(s * (TR - 0.106), 0.686, REAR_AXLE - 0.086);
    const dAxis = dTop.clone().sub(dLow).normalize();
    const dTilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dAxis);

    const dUp = new THREE.Group();
    dUp.position.copy(dTop);
    dUp.quaternion.copy(dTilt);
    g.add(dUp);
    addMesh(dUp, place(cyl(0.0105, 0.0105, 0.150, 10), { pos: [0, -0.078, 0] }), 'rearRod', mats.cast);
    addMesh(dUp, place(cyl(0.020, 0.026, 0.028, 12), { pos: [0, 0.004, 0] }), 'rearMount', mats.rubber);

    const hub = new THREE.Group();
    hub.name = `${g.name}Hub`;
    hub.position.copy(dLow);
    hub.quaternion.copy(dTilt);
    g.add(hub);
    addMesh(hub, merge([
      place(cyl(0.0225, 0.0235, 0.235, 14), { pos: [0, 0.118, 0] }),
      place(sqBox(0.034, 0.062, 0.040, 0.8, 8, 6), { pos: [0, -0.012, 0] }),
    ]), 'rearDamper', mats.cast);

    corners.push({
      arm, hub, spring,
      armAxis: new THREE.Vector3(1, 0, 0),
      armLength: Math.hypot(rel.y, rel.z),
      springFree,
      hubBaseY: hub.position.y,
      springBaseY: spring.position.y,
      front: false,
    });
  }

  return {
    steel: merge(steel),
    cast: merge(cast),
    rubber: merge(rubber),
    corners,
    groups,
  };
}

/** A concertina CV gaiter at one end of a shaft. */
function gaiter(from: THREE.Vector3, to: THREE.Vector3, at: number, big: number): THREE.BufferGeometry {
  const dir = to.clone().sub(from).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const r = lerp(big, 0.026, k * k);
    parts.push(cyl(r, r, 0.017, 12).translate(0, lerp(0.02, at, k), 0));
  }
  const g = merge(parts);
  const m = new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, name: string, mat: THREE.Material): void {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  parent.add(m);
}

/** Wheel-centre travel for a compression value, matching `wheels.ts` exactly. */
export function travelFor(c: number, front: boolean): number {
  const comp = clamp(c, 0, 1);
  const s = front ? SUSPENSION.front : SUSPENSION.rear;
  const travel = comp > 0.5 ? s.travelUp : s.travelDown;
  return (comp - 0.5) * 2 * travel;
}

export function applyCorner(c: Corner, dy: number): void {
  // Arm swings about its bush; the hub end rises by dy.
  const theta = Math.asin(clamp(dy / Math.max(c.armLength, 1e-3), -0.9, 0.9));
  c.arm.quaternion.setFromAxisAngle(c.armAxis, theta);

  // Damper body follows the hub, so the strut telescopes.
  c.hub.position.y = c.hubBaseY + dy * (c.front ? 1 : 0.86);

  // Spring shortens by however much the two seats closed up.
  c.spring.scale.y = clamp((c.springFree - dy * 0.92) / c.springFree, 0.55, 1.35);
  c.spring.position.y = c.springBaseY + dy * (c.front ? 0 : 0.86);
}


/**
 * Wipers — front pair and the Avant's tailgate wiper.
 *
 * The arm is a real linkage rather than a stick: a pivot boss, a pressed
 * channel-section base arm, a spring-loaded upper arm with the tension spring
 * visible between them, and a blade carried on a four-point harness — primary
 * yoke, two secondary yokes, and the rubber element sprung between the claws.
 * That articulation is what makes a wiper read as a wiper at any distance.
 *
 * Everything is built flat in the plane of the glass it sweeps, then that
 * whole plane is placed: the windscreen's from `HP.cowl*`/`HP.header*`, the
 * tailgate's from the body's own rear-surface rake.
 *
 * Rear-wiper note: §6.7 reads the motor housing at the *top* of the tailgate
 * aperture and infers a top pivot, and `HP.rear.wiperPivot` (y = 0.985) puts
 * it below the bottom of the glass. **Both are wrong, and the photograph is
 * unambiguous.** On `bat_rear_straight_b.jpg`, dead on, the backlight aperture
 * runs y 284 → 539 px and the parked arm lies across it at 435–450 px — 59 to
 * 61 % of the way down the glass, i.e. in its lower middle and, decisively,
 * *above* the spoiler, whose leading edge is at 65 %. The build had the blade
 * parked at 82–96 %, on the very bottom of the pane and underneath the
 * spoiler.
 *
 * So `fitRearWiper` below parks the blade against the spoiler's leading edge
 * rather than against the bottom of the pane. Both numbers are fractions of
 * the backlight in `trim/spoiler.ts`, so the pair stays together if the glass
 * moves.
 *
 * The pivot's x is left on the hardpoint (−0.315); the photograph measures
 * −0.247. See the stream report.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { Articulation, BuildContext, VehicleState } from '@/types';
import { rearFaceZ } from './bodyref';
import { SPOILER_LEADING_Y } from './spoiler';
import { DEG, at, clamp, lathe, merge, mesh, mirrorX, roundedBox, type Pt } from './util';

const W = HP.wiper;

/** One arm and blade, built along +X from a pivot at the origin, in XY. */
function arm(bladeLength: number): { metal: THREE.BufferGeometry; rubber: THREE.BufferGeometry } {
  const reach = 0.030;
  const bladeStart = reach + 0.118;
  const metal: THREE.BufferGeometry[] = [];
  const rubber: THREE.BufferGeometry[] = [];

  // Pivot boss and the splined shaft cover.
  const boss: Pt[] = [
    [0.0000, 0.0180], [0.0090, 0.0178], [0.0125, 0.0160],
    [0.0135, 0.0120], [0.0138, 0.0040], [0.0175, 0.0020], [0.0175, 0.0000],
  ];
  metal.push(at(lathe(boss, 18), [0, 0, 0], [Math.PI / 2, 0, 0]));

  // Base arm: a tapering channel, wider at the pivot.
  const nSeg = 8;
  for (let i = 0; i < nSeg; i++) {
    const t = i / nSeg;
    const x = reach - 0.012 + t * 0.132;
    const w = 0.132 / nSeg + 0.002;
    const h = 0.0195 - t * 0.0072;
    metal.push(at(roundedBox(w, h, 0.0088, 0.0028), [x, 0.0012 + t * 0.0016, 0.010]));
  }

  // Upper arm, offset above the base arm with the tension spring between.
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const x = bladeStart - 0.070 + t * 0.086;
    metal.push(at(roundedBox(0.086 / 6 + 0.002, 0.0108 - t * 0.0018, 0.0064, 0.0022), [x, 0.0062, 0.0166]));
  }
  // Coil spring.
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.TorusGeometry(0.0042, 0.00075, 4, 10);
    ring.rotateY(Math.PI / 2);
    ring.translate(reach + 0.028 + i * 0.0058, 0.0044, 0.0136);
    metal.push(ring);
  }
  // Hook that picks the blade up.
  metal.push(at(roundedBox(0.026, 0.0090, 0.0060, 0.0024), [bladeStart + 0.004, 0.0030, 0.0148]));

  // --- blade harness -------------------------------------------------------
  const L = bladeLength;
  const cx = bladeStart + L / 2;
  // Primary yoke.
  metal.push(at(roundedBox(L * 0.62, 0.0092, 0.0052, 0.0022), [cx, 0.0026, 0.0118]));
  for (const s of [-1, 1]) {
    // Secondary yokes, and the claws that grip the element.
    metal.push(at(roundedBox(L * 0.30, 0.0070, 0.0042, 0.0018), [cx + s * L * 0.28, -0.0018, 0.0094]));
    for (const k of [-1, 1]) {
      metal.push(at(roundedBox(0.0090, 0.0056, 0.0036, 0.0014),
        [cx + s * L * 0.28 + k * L * 0.13, -0.0052, 0.0072]));
    }
    metal.push(at(roundedBox(0.0068, 0.0082, 0.0046, 0.0020), [cx + s * L * 0.30, 0.0012, 0.0106]));
  }
  // Rubber element, and the thin steel backing strip in it.
  rubber.push(at(roundedBox(L, 0.0102, 0.0038, 0.0012), [cx, -0.0072, 0.0058]));
  rubber.push(at(roundedBox(L, 0.0034, 0.0022, 0.0009), [cx, -0.0136, 0.0050]));

  return { metal: merge(metal), rubber: merge(rubber) };
}

interface Pivot { mount: THREE.Group; group: THREE.Group; park: number; sweep: number }

function mount(
  parent: THREE.Group,
  name: string,
  origin: THREE.Vector3,
  basis: THREE.Matrix4,
  bladeLength: number,
  flip: boolean,
  metalMat: THREE.Material,
  rubberMat: THREE.Material,
  parkDeg: number = W.parkAngleDeg,
): Pivot {
  const g = new THREE.Group();
  g.name = name;
  g.quaternion.setFromRotationMatrix(basis);
  g.position.copy(origin);

  const built = arm(bladeLength);
  const metal = flip ? mirrorX(built.metal) : built.metal;
  const rubber = flip ? mirrorX(built.rubber) : built.rubber;

  const inner = new THREE.Group();
  inner.name = `${name}Arm`;
  inner.add(mesh(`${name}Metal`, metal, metalMat));
  inner.add(mesh(`${name}Rubber`, rubber, rubberMat));
  g.add(inner);
  parent.add(g);

  const sign = flip ? -1 : 1;
  return { mount: g, group: inner, park: parkDeg * DEG * sign, sweep: W.sweepDeg * DEG * sign };
}

export interface WiperResult {
  group: THREE.Group;
  articulation: Articulation;
  nodes: { driver: THREE.Object3D; passenger: THREE.Object3D; rear: THREE.Object3D };
  /** The rear arm's pivot, for `fitRearWiper` and for riding on the tailgate. */
  rearMount: THREE.Group;
  update(dt: number, elapsed: number, state: VehicleState): void;
}

export function buildWipers(ctx: BuildContext): WiperResult {
  const group = new THREE.Group();
  group.name = 'wipers';
  const metalMat = ctx.materials.blackTrim();
  const rubberMat = ctx.materials.rubber({ roughness: 0.94 });

  // --- windscreen plane ----------------------------------------------------
  const up = new THREE.Vector3(0, HP.headerY - HP.cowlY, HP.headerZ - HP.cowlZ).normalize();
  const n = new THREE.Vector3(0, -up.z, up.y).normalize();
  const right = new THREE.Vector3(1, 0, 0);
  const screen = new THREE.Matrix4().makeBasis(right, up, n);

  const lift = 0.014;
  const dp = new THREE.Vector3(...W.pivotDriver).addScaledVector(n, lift);
  const pp = new THREE.Vector3(...W.pivotPassenger).addScaledVector(n, lift);

  // Tandem pair, both sweeping the same way. The passenger blade is the
  // shorter of the two, as it is on the car.
  const driver = mount(group, 'wiperDriver', dp, screen, W.bladeLength, false, metalMat, rubberMat);
  const passenger = mount(group, 'wiperPassenger', pp, screen, W.bladeLength * 0.80, false, metalMat, rubberMat);

  // --- tailgate plane ------------------------------------------------------
  // `fitRearWiper` refines this once the pane is in the graph; the value here
  // is what shows if it never runs, so it is the spoiler-relative height too
  // rather than the hardpoint's 0.985, which is below the glass.
  const ry = SPOILER_LEADING_Y + 0.016;
  const dz = rearFaceZ(HP.rear.wiperPivot[0], ry + 0.06) - rearFaceZ(HP.rear.wiperPivot[0], ry - 0.06);
  const rUp = new THREE.Vector3(0, 0.12, dz).normalize();
  const rN = new THREE.Vector3(0, rUp.z, -rUp.y).normalize();
  const rRight = new THREE.Vector3(-1, 0, 0);
  const tail = new THREE.Matrix4().makeBasis(rRight, rUp, rN);
  const rearOrigin = new THREE.Vector3(HP.rear.wiperPivot[0], ry, rearFaceZ(HP.rear.wiperPivot[0], ry))
    .addScaledVector(rN, 0.020);
  // Parked flat rather than at the windscreen's −8°: over a 523 mm arm that
  // droop drops the blade tip 73 mm, which on a tailgate puts the far half of
  // the blade off the bottom of the glass and onto paint.
  const rear = mount(group, 'wiperRear', rearOrigin, tail, HP.rear.wiperLength, true, metalMat, rubberMat, 0);

  const arms = [driver, passenger, rear];
  const setSweep = (f: number): void => {
    for (const a of arms) a.group.rotation.z = a.park + a.sweep * f;
  };
  setSweep(0);

  const articulation: Articulation = {
    name: 'wipers',
    value: 0,
    target: 0,
    duration: 0.9,
    apply: (v) => setSweep(v),
  };

  /** 0 → 1 → 0, so one period is one out-and-back stroke. */
  const stroke = (p: number): number => (p < 0.5 ? p * 2 : 2 - p * 2);

  return {
    group,
    articulation,
    nodes: { driver: driver.group, passenger: passenger.group, rear: rear.group },
    rearMount: rear.mount,
    update(_dt, elapsed, state) {
      const mode = state.wipers;
      if (mode <= 0) return;
      // Intermittent parks and dwells; low and high run continuously.
      const period = mode === 1 ? 4.6 : mode === 2 ? 1.55 : 1.0;
      const wipe = mode === 1 ? 1.45 : period;
      const phase = elapsed % period;
      const f = phase < wipe ? stroke(clamp(phase / wipe, 0, 1)) : 0;
      setSweep(f);
      articulation.value = f;
      articulation.target = f;
    },
  };
}

/**
 * Put the rear blade on the glass that was actually built.
 *
 * Returns false until the glazing stream's pane is in the graph, so the caller
 * can retry. Measured in the car's own frame, which is the tailgate-closed
 * pose — the mount is re-parented onto the tailgate afterwards, so the fit
 * survives the panel opening.
 */
export function fitRearWiper(mount: THREE.Group, root: THREE.Object3D): boolean {
  const pane = root.getObjectByName('tailgateGlassOuter') ?? root.getObjectByName('tailgateGlazing');
  if (!pane) return false;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pane);
  if (box.isEmpty() || !Number.isFinite(box.min.y)) return false;
  root.worldToLocal(box.min);
  root.worldToLocal(box.max);

  // Parked just above the spoiler's leading edge, the blade lying along the
  // glass — 16 mm of clearance, which is the gap the photograph shows between
  // the blade and the wing. Clamped into the pane that actually got built, so
  // a short backlight can only ever push it back down onto the glass.
  const y = clamp(SPOILER_LEADING_Y + 0.016, box.min.y + 0.020, box.max.y - 0.020);
  const x = HP.rear.wiperPivot[0];
  const dz = rearFaceZ(x, y + 0.06) - rearFaceZ(x, y - 0.06);
  const up = new THREE.Vector3(0, 0.12, dz).normalize();
  const n = new THREE.Vector3(0, up.z, -up.y).normalize();
  mount.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), up, n),
  );
  // The pane's outer face is its most negative z; sit the arm just clear of it.
  mount.position.set(x, y, Math.min(rearFaceZ(x, y), box.min.z) - 0.012);
  return true;
}

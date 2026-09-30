/**
 * CameraRig — named review poses, free orbit, and the driving cameras.
 *
 * The named poses matter as much as the model: reviewers and the screenshot
 * harness must frame the car identically every round, or "is it better than
 * last time" becomes unanswerable. Every pose below is a fixed target point,
 * a spherical offset and a focal length, all in vehicle-local space.
 */

import * as THREE from 'three';
import { BODY, tyreRadius } from '@/spec';
import { HP } from '@/car/hardpoints';
import type { ViewName, VehicleState } from '@/types';

export interface Pose {
  /** Look-at point, vehicle-local metres. */
  target: [number, number, number];
  /** Camera position, vehicle-local metres. */
  position: [number, number, number];
  /** 35 mm-equivalent focal length. Converted to vertical FOV internally. */
  focalMm: number;
  /** Optional depth-of-field hint for the post chain. */
  aperture?: number;
  /**
   * Only set this to defocus deliberately. Left undefined — which is the norm
   * — `focusDistanceFor()` focuses on the pose's own target.
   */
  focusDistance?: number;
  /** Orthographic-style framing for blueprint views. */
  ortho?: boolean;
}

const WB = BODY.wheelbase;
const R = tyreRadius();
// Body centre, longitudinally: halfway between nose and tail.
const CZ = (BODY.overhangFront - (WB + BODY.overhangRear)) / 2;

/**
 * 35 mm focal → vertical FOV. Reviewers get a consistent, photographic look
 * rather than the 75° game default that bends every straight line.
 */
export function fovFromFocal(focalMm: number, sensorHeightMm = 24): number {
  return 2 * Math.atan(sensorHeightMm / 2 / focalMm) * (180 / Math.PI);
}

export const POSES: Record<Exclude<ViewName, 'orbit' | 'chase' | 'hood' | 'cinematic'>, Pose> = {
  // The money shot. 3/4 front, slightly below eye level so the car looks
  // planted rather than looked-down-upon.
  front3q:   { target: [0, 0.68, CZ + 0.35], position: [3.35, 1.32, 5.15], focalMm: 62, aperture: 2.8 },
  // Was framed too tight to hold the car and shot straight into the low sun.
  rear3q:    { target: [0, 0.78, CZ - 0.2], position: [5.4, 1.72, -7.2], focalMm: 62, aperture: 2.8 },

  // Dead-on profile at a long focal length: the only honest way to judge
  // proportion, DLO shape and wheelbase-to-overhang relationships.
  side:      { target: [0, 0.72, CZ], position: [26, 0.78, CZ], focalMm: 200 },
  front:     { target: [0, 0.7, BODY.overhangFront], position: [0, 0.78, 26], focalMm: 200 },
  rear:      { target: [0, 0.72, -(WB + BODY.overhangRear)], position: [0, 0.8, -26], focalMm: 200 },
  top:       { target: [0, 0.6, CZ], position: [0, 52, CZ + 0.001], focalMm: 200 },

  // Detail poses.
  wheel:     { target: [-BODY.trackFront / 2 + 0.05, R, 0], position: [-3.1, 0.62, 1.35], focalMm: 105, aperture: 2.0 },
  headlight: { target: [-0.56, 0.78, BODY.overhangFront - 0.02], position: [-2.0, 1.02, 3.3], focalMm: 105, aperture: 2.2 },
  // Centred on the cluster and set back behind it, not beside the car.
  taillight: { target: [-0.52, 0.79, -(WB + BODY.overhangRear) + 0.03], position: [-1.3, 0.95, -5.15], focalMm: 105, aperture: 2.2 },
  // Aimed at the badging, which is where the scripts actually are — it had
  // been pointed at the lamp and the plate, so the one view whose job is to
  // show the badges did not contain them.
  badge:     { target: [0.42, 0.95, -(WB + BODY.overhangRear) + 0.036], position: [0.72, 1.03, -4.98], focalMm: 135, aperture: 2.0 },
  platecam:  { target: [0, 0.52, BODY.overhangFront + 0.01], position: [0, 0.58, 2.05], focalMm: 135, aperture: 2.8 },
  roofrail:  { target: [-0.6, 1.42, -1.95], position: [-2.9, 2.35, -0.25], focalMm: 85, aperture: 2.8 },

  // Cabin.
  // Over the rear seat looking forward across the cabin — inside the car,
  // which the previous pose was not: it sat 1.55 m out, beyond the body side,
  // framing a closed door.
  interior:  { target: [0.3, 0.95, -0.52], position: [-0.42, 1.12, -2.12], focalMm: 22 },
  /**
   * A seated driver's eye, not a camera resting on the dash top. The old pose
   * sat at y=1.12 looking at a cluster centred at 1.032 with a 1.055 dash top
   * between them, so the sightline grazed the dash at ~5 deg and occluded the
   * instruments — which no interior geometry could fix, because a cluster
   * 105 mm tall centred at 1.032 has to stand proud of the dash in a pod, as
   * it does in the real car. With a 0.612 H-point the driver's eye is ~1.24.
   */
  /**
   * The instrument pack, from where a driver actually sits.
   *
   * This pose used to render the binnacle hood, the wheel rim and the rings
   * on the boss, and no instruments at all, and moving the camera did not
   * help. Two things were in the way and only one of them was the hood.
   *
   * `binnacleSection()` carried a `- 0.0100` that put its run 10 mm in FRONT
   * of the dial face, and a lofted section has no hole in it — so it was not
   * a bezel, it was a solid wall across the full width of the binnacle,
   * covering the whole print. The "instrument pack" in every render before
   * this was the dash pad, and the little round thing at its left was the
   * odometer reset knob poking through.
   *
   * My own grid search missed it and said the pack was 0.64 visible at best.
   * It sampled the front plane of `bbox('cluster')`, which is the front of a
   * 16 mm surround and sits about 5 mm PROUD of that wall, so the rays landed
   * on the rim and reported daylight. Sampled on the print itself it was 0.00
   * from every camera position at every height. **Probe the surface you care
   * about, not the bounding box that contains it.**
   *
   * With that gone and the hood's reach cut 138 mm → 70 mm, the dash blocks
   * nothing from a driver's eye: (−0.372, 1.270, −1.220), hip point + 658 mm
   * and − 75 mm. The wheel rim still crosses the upper third of both main
   * dials, which is a hardpoint question rather than a framing one — see the
   * note on `steeringCenter` in `hardpoints.ts` — and this pose shows it
   * rather than dodging it.
   */
  dash:      { target: [...HP.interior.clusterCenter] as [number, number, number],
               position: [0.372, 1.27, -1.22], focalMm: 75, aperture: 8 },

  /**
   * Reproduces the original photograph's viewpoint: dead-on front, low, ~3.7 m.
   *
   * This pose has now been wrong twice. My first guess put the camera off the
   * car's right; I then "derived" it onto the left quarter at 20 degrees from
   * which side the flank appeared to recede. Both were wrong, and the test
   * that settles it is simple: in the photograph the licence plate's centre
   * (x 982.5) and the four rings' centre (x 979) are within 3 px of each
   * other. Any yaw at all separates them. The camera is on the car's plane of
   * symmetry, and the apparent flank is perspective from a close, wide-ish
   * lens, not rotation.
   *
   * This pose is the project's only acceptance test — `sheet.py --compare`
   * measures paint against the photograph through it — so it has to be right.
   */
  photomatch:{ target: [0, 0.76, BODY.overhangFront], position: [0, 1.12, BODY.overhangFront + 3.7], focalMm: 40, aperture: 5.6 },
};

/** Where a pose actually focuses: its own subject unless told otherwise. */
export function focusDistanceFor(p: Pose): number {
  if (p.focusDistance !== undefined) return p.focusDistance;
  const dx = p.position[0] - p.target[0];
  const dy = p.position[1] - p.target[1];
  const dz = p.position[2] - p.target[2];
  return Math.hypot(dx, dy, dz);
}

/** Scratch, module-level so `update` allocates nothing per frame. */
const _q = new THREE.Quaternion();
const _pivot = new THREE.Vector3();

export class CameraRig {
  private current: ViewName = 'front3q';
  private desiredPos = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3();
  private smoothPos = new THREE.Vector3();
  private smoothTarget = new THREE.Vector3();
  private desiredFov = 38;

  /** Free-orbit state, used when view === 'orbit'. */
  orbit = { theta: Math.PI * 0.28, phi: Math.PI * 0.42, radius: 8.2, target: new THREE.Vector3(0, 0.72, CZ) };

  /** Set true to snap instead of easing — used before a screenshot. */
  snapNext = false;

  /**
   * The car's own frame, which every named pose is now resolved in.
   *
   * ## Why: the camera did not follow the car, and it read as a freeze
   *
   * `chase` and `hood` have always called `carRoot.localToWorld`, so they
   * follow. Every *named* pose set `desiredPos`/`desiredTarget` once, from
   * world-space literals, in `setView()` — and never again. So the fifteen
   * review poses, including the default `front3q`, were nailed to the world
   * origin while the car drove away from them.
   *
   * The symptom reported was not "the camera lags" but **"the whole scene
   * stopped when I pressed s after w"**, and that is the same bug wearing a
   * disguise: hold `w` and the car leaves the frame, so you are looking at an
   * empty road that barely changes. Pressing `s` then brakes a car you cannot
   * see. The HUD read 41 mph in second gear on a frame with no car in it.
   *
   * ## Position and YAW only, deliberately
   *
   * Not the full `localToWorld`. A review pose must not tilt with body roll or
   * pitch — a dead-on side elevation that banks 3° through a corner is useless
   * for review and unpleasant to sit behind. Taking the yaw alone keeps
   * `side` a side view and `top` a plan view whatever the suspension is doing.
   *
   * Vertically the poses stay as authored: they are written against the ground
   * plane, not against the car's floor, and the road here is flat.
   *
   * At rest the car sits at the origin with zero yaw, so this resolves to the
   * authored literals exactly and **every `shoot.mjs` pose is unchanged** —
   * which is the regression test, and it is bit-exact rather than nearly.
   */
  private followPos = new THREE.Vector3();
  private followYaw = 0;

  /** Resolve a pose-space point into the world, in the car's frame. */
  private toWorld(out: THREE.Vector3, a: readonly [number, number, number]): THREE.Vector3 {
    const s = Math.sin(this.followYaw);
    const c = Math.cos(this.followYaw);
    return out.set(
      this.followPos.x + a[0] * c + a[2] * s,
      a[1],
      this.followPos.z - a[0] * s + a[2] * c,
    );
  }

  constructor(private camera: THREE.PerspectiveCamera) {
    this.setView('front3q');
    this.snap();
  }

  get view(): ViewName { return this.current; }

  setView(name: ViewName): boolean {
    this.current = name;
    if (name === 'orbit' || name === 'chase' || name === 'hood' || name === 'cinematic') return true;
    const p = POSES[name];
    if (!p) return false;
    this.desiredPos.fromArray(p.position);
    this.desiredTarget.fromArray(p.target);
    this.desiredFov = fovFromFocal(p.focalMm);
    return true;
  }

  currentPose(): Pose | null {
    if (this.current === 'orbit' || this.current === 'chase' || this.current === 'hood' || this.current === 'cinematic') return null;
    return POSES[this.current] ?? null;
  }

  /** Jump the smoothed camera straight to its target. */
  snap(): void {
    this.smoothPos.copy(this.desiredPos);
    this.smoothTarget.copy(this.desiredTarget);
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothTarget);
    this.camera.fov = this.desiredFov;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, carRoot: THREE.Object3D, state: VehicleState | null): void {
    // The car's frame, recomputed every frame so every pose below follows it.
    carRoot.getWorldPosition(this.followPos);
    carRoot.getWorldQuaternion(_q);
    this.followYaw = Math.atan2(
      2 * (_q.w * _q.y + _q.x * _q.z),
      1 - 2 * (_q.y * _q.y + _q.x * _q.x),
    );

    if (this.current === 'orbit') {
      const o = this.orbit;
      const sp = Math.sin(o.phi);
      // `o.target` is the authored car-relative point; orbit input writes only
      // theta/phi/radius, so the pivot travels with the car.
      this.toWorld(_pivot, [o.target.x, o.target.y, o.target.z]);
      this.desiredPos.set(
        _pivot.x + o.radius * sp * Math.sin(o.theta),
        _pivot.y + o.radius * Math.cos(o.phi),
        _pivot.z + o.radius * sp * Math.cos(o.theta),
      );
      this.desiredTarget.copy(_pivot);
      this.desiredFov = fovFromFocal(55);
    } else if (this.current === 'chase' && state) {
      // Chase camera lags on speed and leans out of the corner, so the car
      // feels like it has mass. A rigid chase cam reads as a video game.
      const back = 6.4 + Math.min(state.speed * 0.085, 2.6);
      const up = 2.05 + Math.min(state.speed * 0.012, 0.5);
      const lean = THREE.MathUtils.clamp(-state.gForce.x * 0.42, -1.1, 1.1);
      this.desiredPos.set(lean, up, -back);
      this.desiredTarget.set(lean * 0.35, 0.95, 4.2);
      this.desiredFov = fovFromFocal(THREE.MathUtils.lerp(34, 26, Math.min(state.speed / 45, 1)));
      carRoot.localToWorld(this.desiredPos);
      carRoot.localToWorld(this.desiredTarget);
    } else if (this.current === 'hood' && state) {
      this.desiredPos.set(0.38, 1.16, -0.2);
      this.desiredTarget.set(0.38 + state.steerAngle * 0.8, 1.02, 9);
      this.desiredFov = fovFromFocal(30);
      carRoot.localToWorld(this.desiredPos);
      carRoot.localToWorld(this.desiredTarget);
    } else {
      // Named review pose, resolved in the car's frame every frame — this is
      // what makes it follow. See `followPos`.
      const p = POSES[this.current as Exclude<ViewName, 'orbit' | 'chase' | 'hood' | 'cinematic'>];
      if (p) {
        this.toWorld(this.desiredPos, p.position);
        this.toWorld(this.desiredTarget, p.target);
        this.desiredFov = fovFromFocal(p.focalMm);
      }
    }

    const k = this.snapNext ? 1 : 1 - Math.pow(0.0015, dt);
    this.smoothPos.lerp(this.desiredPos, k);
    this.smoothTarget.lerp(this.desiredTarget, k);
    this.camera.position.copy(this.smoothPos);
    this.camera.lookAt(this.smoothTarget);

    const nf = this.snapNext ? this.desiredFov : THREE.MathUtils.lerp(this.camera.fov, this.desiredFov, k);
    if (Math.abs(nf - this.camera.fov) > 1e-4) {
      this.camera.fov = nf;
      this.camera.updateProjectionMatrix();
    }
    this.snapNext = false;
  }
}

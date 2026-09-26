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
  rear3q:    { target: [0, 0.72, CZ - 0.35], position: [3.5, 1.38, -5.4], focalMm: 62, aperture: 2.8 },

  // Dead-on profile at a long focal length: the only honest way to judge
  // proportion, DLO shape and wheelbase-to-overhang relationships.
  side:      { target: [0, 0.72, CZ], position: [26, 0.78, CZ], focalMm: 200 },
  front:     { target: [0, 0.7, BODY.overhangFront], position: [0, 0.78, 26], focalMm: 200 },
  rear:      { target: [0, 0.72, -(WB + BODY.overhangRear)], position: [0, 0.8, -26], focalMm: 200 },
  top:       { target: [0, 0.6, CZ], position: [0, 24, CZ + 0.001], focalMm: 200 },

  // Detail poses.
  wheel:     { target: [-BODY.trackFront / 2 + 0.05, R, 0], position: [-3.1, 0.62, 1.35], focalMm: 105, aperture: 2.0 },
  headlight: { target: [-0.56, 0.78, BODY.overhangFront - 0.02], position: [-2.0, 1.02, 3.3], focalMm: 105, aperture: 2.2 },
  taillight: { target: [-0.66, 0.86, -(WB + BODY.overhangRear) + 0.02], position: [-2.2, 1.12, -3.5], focalMm: 105, aperture: 2.2 },
  badge:     { target: [0.2, 0.78, -(WB + BODY.overhangRear) + 0.03], position: [0.62, 0.95, -5.05], focalMm: 135, aperture: 2.0 },
  platecam:  { target: [0, 0.52, BODY.overhangFront + 0.01], position: [0, 0.58, 2.05], focalMm: 135, aperture: 2.8 },
  roofrail:  { target: [-0.6, 1.42, -1.95], position: [-2.9, 2.35, -0.25], focalMm: 85, aperture: 2.8 },

  // Cabin.
  interior:  { target: [0.1, 0.95, -0.85], position: [-1.55, 1.18, -0.35], focalMm: 24 },
  dash:      { target: [-0.38, 1.02, -0.42], position: [-0.38, 1.12, -1.35], focalMm: 40, aperture: 2.8 },

  // Reproduces the original photograph's viewpoint: low, close, front-on with
  // a slight offset to the car's right, warm low sun from camera-left.
  photomatch:{ target: [0.05, 0.75, BODY.overhangFront - 0.4], position: [-0.55, 1.12, 4.55], focalMm: 44, aperture: 5.6 },
};

/** Where a pose actually focuses: its own subject unless told otherwise. */
export function focusDistanceFor(p: Pose): number {
  if (p.focusDistance !== undefined) return p.focusDistance;
  const dx = p.position[0] - p.target[0];
  const dy = p.position[1] - p.target[1];
  const dz = p.position[2] - p.target[2];
  return Math.hypot(dx, dy, dz);
}

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
    if (this.current === 'orbit') {
      const o = this.orbit;
      const sp = Math.sin(o.phi);
      this.desiredPos.set(
        o.target.x + o.radius * sp * Math.sin(o.theta),
        o.target.y + o.radius * Math.cos(o.phi),
        o.target.z + o.radius * sp * Math.cos(o.theta),
      );
      this.desiredTarget.copy(o.target);
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
      this.desiredPos.set(-0.38, 1.16, -0.2);
      this.desiredTarget.set(-0.38 + state.steerAngle * 0.8, 1.02, 9);
      this.desiredFov = fovFromFocal(30);
      carRoot.localToWorld(this.desiredPos);
      carRoot.localToWorld(this.desiredTarget);
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

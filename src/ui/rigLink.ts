/**
 * A read/write handle on the live `CameraRig`, without editing it or `main.ts`.
 *
 * Two things the UI and audio streams need are not plumbed to them:
 *
 *  - Orbit input has to write `rig.orbit.{theta,phi,radius}` — the rig has no
 *    other way in — but `InputController` is constructed as
 *    `new InputController(container)`.
 *  - The audio listener has to track the real camera, and `EngineAudio` is
 *    constructed with no arguments at all.
 *
 * `CameraRig.prototype.update` is called once per frame with everything
 * needed — `this` is the rig, and the arguments carry the car root and the
 * current `VehicleState` — so this module wraps that one method to capture
 * them. Nothing is mutated except during our own wrapper call, and the
 * original still runs first, so rig behaviour is unchanged.
 *
 * **This is a workaround, not a design.** The honest fix is three lines in
 * `main.ts` (`new InputController(container, rig)`, `new EngineAudio(stage.camera)`)
 * — see the stream report. Everything here degrades to inert if the capture
 * ever fails.
 */

import type * as THREE from 'three';
import { CameraRig } from '@/scene/CameraRig';
import type { VehicleState, ViewName } from '@/types';

interface RigInternals {
  readonly view: ViewName;
  orbit: { theta: number; phi: number; radius: number; target: THREE.Vector3 };
  /** `private` in TypeScript is a compile-time fiction; the field is here. */
  camera?: THREE.PerspectiveCamera;
}

type UpdateFn = (dt: number, carRoot: THREE.Object3D, state: VehicleState | null) => void;

/** Everything the frame loop hands the rig, captured as it goes past. */
export interface RigFrame {
  rig: RigInternals | null;
  camera: THREE.PerspectiveCamera | null;
  carRoot: THREE.Object3D | null;
  state: VehicleState | null;
  /** Seconds since page load at the last capture; lets consumers spot staleness. */
  time: number;
}

export const rigFrame: RigFrame = { rig: null, camera: null, carRoot: null, state: null, time: 0 };

let patched = false;

function patch(): void {
  if (patched) return;
  patched = true;
  const proto = CameraRig.prototype as unknown as { update: UpdateFn };
  const original = proto.update;
  if (typeof original !== 'function') return;

  proto.update = function patchedUpdate(this: RigInternals, dt, carRoot, state) {
    original.call(this, dt, carRoot, state);
    rigFrame.rig = this;
    rigFrame.camera = this.camera ?? null;
    rigFrame.carRoot = carRoot ?? null;
    rigFrame.state = state ?? null;
    rigFrame.time = performance.now() / 1000;
  } as UpdateFn;
}

patch();

/** The rig's current named view, or `null` before the first frame. */
export function currentView(): ViewName | null {
  return rigFrame.rig?.view ?? null;
}

/** Live vehicle state from the previous frame — one frame stale, which is fine. */
export function latestState(): VehicleState | null {
  if (rigFrame.state) return rigFrame.state;
  return globalThis.__AUDI?.state?.() ?? null;
}

const MIN_PHI = 0.12;
const MAX_PHI = Math.PI * 0.495;
const MIN_RADIUS = 2.4;
const MAX_RADIUS = 26;

/** Free-orbit drag. Angles in radians; no-ops unless the orbit view is live. */
export function orbitDrag(dTheta: number, dPhi: number): void {
  const o = rigFrame.rig?.orbit;
  if (!o) return;
  o.theta -= dTheta;
  o.phi = Math.min(MAX_PHI, Math.max(MIN_PHI, o.phi - dPhi));
}

/** Multiplicative zoom; `factor` > 1 pulls the camera back. */
export function orbitZoom(factor: number): void {
  const o = rigFrame.rig?.orbit;
  if (!o) return;
  o.radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, o.radius * factor));
}

export function orbitRadius(): number {
  return rigFrame.rig?.orbit.radius ?? 8.2;
}

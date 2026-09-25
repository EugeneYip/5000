/**
 * Module contracts.
 *
 * Every part of the car is built by a `PartBuilder`. Builders are independent:
 * each owns its own directory and may not reach into another's. They talk
 * only through `BuildContext` and the `CarParts` registry, so several can be
 * developed in parallel without stepping on each other.
 */

import type * as THREE from 'three';

/** Shared services handed to every part builder. */
export interface BuildContext {
  /** The shared material library. Never construct a body material yourself. */
  readonly materials: MaterialLibrary;
  /** Scene environment map, for reflective materials. */
  readonly envMap: THREE.Texture | null;
  /** Renderer, for anisotropy limits and capability queries. */
  readonly renderer: THREE.WebGLRenderer;
  /** Report load progress, 0..1, so the boot screen can move. */
  progress(fraction: number, label?: string): void;
}

/** What the material library must provide. Owned by src/materials. */
export interface MaterialLibrary {
  /** Metallic basecoat + clearcoat body paint, with flake. */
  paint(): THREE.Material;
  /** Tinted, laminated, slightly green-edged automotive glass. */
  glass(opts?: { tint?: number; opacity?: number; interiorSide?: boolean }): THREE.Material;
  /** Polished brightwork — the rings, the window reveal. */
  chrome(opts?: { roughness?: number }): THREE.Material;
  /** Satin black window surrounds and B-pillar. */
  blackTrim(): THREE.Material;
  /** Grained bumper/cladding plastic. */
  bumperPlastic(): THREE.Material;
  /** Tyre sidewall and seals. */
  rubber(opts?: { roughness?: number }): THREE.Material;
  /** Headlamp/taillamp lens, with prism refraction. */
  lens(color: number, opts?: { prismatic?: boolean; opacity?: number }): THREE.Material;
  /** Reflector bowl behind a lamp. */
  reflector(): THREE.Material;
  /** Emissive filament/bulb surface. */
  emissive(color: number, intensity: number): THREE.Material;
  /** Cabin plastics. */
  interiorPlastic(opts?: { color?: number; roughness?: number }): THREE.Material;
  /** Seat and door-card cloth. */
  fabric(opts?: { color?: number }): THREE.Material;
  /** Carpet, with fuzz. */
  carpet(): THREE.Material;
  /** Machined/cast alloy for wheels. */
  alloy(opts?: { polished?: boolean }): THREE.Material;
  /** Brake disc iron, with a wear ring. */
  brakeDisc(): THREE.Material;
  /** Update any time-varying uniforms (flake shimmer, etc). */
  update(dt: number, elapsed: number): void;
  /** Push a new environment map into every material that reflects. */
  setEnvMap(env: THREE.Texture | null): void;
  /** Swap the body colour at runtime. */
  setPaintColor(hex: number): void;
}

/** A named, animatable feature — a door, the tailgate, the wipers. */
export interface Articulation {
  readonly name: string;
  /** 0 = closed/rest, 1 = fully open/extended. */
  value: number;
  /** Where it should be heading. Animated towards by the car each frame. */
  target: number;
  /** Seconds for a full 0→1 sweep. */
  readonly duration: number;
  /** Apply `value` to the scene graph. */
  apply(v: number): void;
}

/** The result of a part builder. */
export interface PartResult {
  /** Everything the builder made, parented to one group. */
  group: THREE.Group;
  /** Optional named articulations this part contributes. */
  articulations?: Articulation[];
  /** Optional per-frame update. */
  update?(dt: number, elapsed: number, state: VehicleState): void;
  /** Named nodes other systems may need (wheel hubs, lamp emitters, …). */
  nodes?: Record<string, THREE.Object3D>;
  /** Lights this part contributes (headlamps etc), so the stage can manage them. */
  lights?: THREE.Light[];
}

export type PartBuilder = (ctx: BuildContext) => Promise<PartResult> | PartResult;

/** Live vehicle state, produced by the physics module, read by everything else. */
export interface VehicleState {
  /** Metres per second along the vehicle's forward axis. */
  speed: number;
  /** Signed, for reverse. */
  velocity: THREE.Vector3;
  engineRpm: number;
  gear: number;
  /** 0..1 */
  throttle: number;
  brake: number;
  clutch: number;
  handbrake: number;
  /** Radians, positive = left. */
  steerAngle: number;
  /** Per-wheel, front-left first. */
  wheelSpin: [number, number, number, number];
  wheelSlip: [number, number, number, number];
  suspensionCompression: [number, number, number, number];
  wheelContact: [boolean, boolean, boolean, boolean];
  /** Body attitude for camera shake and light sweep. */
  pitch: number;
  roll: number;
  yawRate: number;
  gForce: THREE.Vector2;
  /** Driver-facing toggles. */
  lights: { low: boolean; high: boolean; brake: boolean; reverse: boolean; hazard: boolean; indicator: -1 | 0 | 1; fog: boolean };
  wipers: 0 | 1 | 2 | 3;
  engineRunning: boolean;
  odometer: number;
}

/** Named camera poses the screenshot harness and the UI can request. */
export type ViewName =
  | 'front3q' | 'rear3q' | 'side' | 'front' | 'rear' | 'top'
  | 'wheel' | 'headlight' | 'taillight' | 'interior' | 'dash'
  | 'roofrail' | 'badge' | 'platecam' | 'photomatch' | 'orbit' | 'chase' | 'hood' | 'cinematic';

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
  chrome(opts?: {
    /** ≤0.07 is polished plate; above it the part brushes and `brushAxis` bites. */
    roughness?: number;
    /**
     * Object-space direction the brush marks run; most C3 brightwork is
     * fore-aft. `createChrome` has always read this and the contract did not
     * offer it, so it was unreachable — and, until the key gained it, two
     * callers at one rung with different axes shared a material and build
     * order decided which way the marks ran on both.
     */
    brushAxis?: THREE.Vector3;
  }): THREE.Material;
  /** Satin black window surrounds and B-pillar. */
  blackTrim(): THREE.Material;
  /** Grained bumper/cladding plastic. */
  bumperPlastic(): THREE.Material;
  /** Tyre sidewall and seals. */
  rubber(opts?: {
    roughness?: number;
    /** Road-film coverage, 0..1. A seal collects ~0.3; a sidewall wipes itself, ~0.1. */
    dust?: number;
    /** Blotch frequency of that film, cells/m. 120 suits a door seal; a 130 mm sidewall wants ~320. */
    dustCells?: number;
    /** Extra gloss on moulded relief — sidewall lettering comes out of a polished cavity. */
    mouldGloss?: number;
    /** Curvature, 1/m, at which a crease starts to count as moulded relief. */
    mouldCurve?: number;
    vertexColors?: boolean;
  }): THREE.Material;
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
  alloy(opts?: { polished?: boolean; vertexColors?: boolean }): THREE.Material;
  /**
   * A surface carrying drawn artwork: plate face, sticker, dial face, switch
   * legend. Keyed on the texture, so two callers sharing one share a material
   * and batch, and a caller with its own canvas can never repaint another's.
   */
  printed(map: THREE.Texture, opts?: {
    roughness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    emissiveMap?: THREE.Texture | null;
    emissive?: number;
    emissiveIntensity?: number;
    envMapIntensity?: number;
    /** Scale the dielectric specular lobe; below 1 only for a real cavity. */
    specularIntensity?: number;
    /** Cast the shadow from the back faces — for a flat embossed panel. */
    backfaceShadow?: boolean;
  }): THREE.Material;
  /** Castings, heat shields, oxidised iron — anything under the floor line. */
  dirtyMetal(opts?: {
    color?: number; roughness?: number;
    /**
     * 0.1–0.35 is the useful band for a casting. **1 means bare metal** — an
     * anodised extrusion, a stainless tip — and is the other end of a
     * two-valued physical quantity, not the top of that band; it wants
     * `grime: 0` and `envMapIntensity: 1`, which is what `anodised()` in
     * `src/materials/library.ts` is.
     */
    metalness?: number;
    /** 0 = washed casting, 1 = a decade under a car. */
    grime?: number;
    /**
     * IBL strength, which on this project is the specular-occlusion term. The
     * 0.55 default is the sky fraction a part under the floor line sees; a
     * bright strip on the outside of the car sees all of it and wants 1.
     */
    envMapIntensity?: number;
    vertexColors?: boolean;
  }): THREE.Material;
  /** Oxidised grey iron: disc hats and vanes, dust shields, pad backing plates. */
  castIron(opts?: {
    color?: number;
    /** 0 = phosphated casting, 1 = a month of weather. */
    oxide?: number;
    grime?: number; roughness?: number; vertexColors?: boolean;
  }): THREE.Material;
  /** The phosphated/painted caliper casting. */
  caliperPaint(opts?: { color?: number; vertexColors?: boolean }): THREE.Material;
  /** Sintered brake friction material. */
  padFriction(opts?: { vertexColors?: boolean }): THREE.Material;
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

/**
 * Live vehicle state, produced by the physics module, read by everything else.
 *
 * SIGN CONVENTIONS — these were undefined until the simulation needed them, so
 * they are fixed here rather than in any one consumer:
 *   gForce.x   lateral, positive to the car's RIGHT (matches the chase cam's lean)
 *   gForce.y   longitudinal, positive under acceleration
 *   pitch      positive = nose UP
 *   roll       positive = RIGHT side down
 *   yawRate    positive = LEFT, matching steerAngle
 *   speed      signed; negative in reverse
 *   odometer   metres
 *   gear       -1 reverse, 0 neutral, 1..n forward
 */
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

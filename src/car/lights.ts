/**
 * Lighting hardware and the lamps' behaviour.
 *
 * Owns every lamp on the car — the composite headlamps, the split Avant rear
 * clusters, the federal side markers and the plate lamps — plus the light
 * sources they throw and the filament model that decides, each frame, what
 * every one of them is doing.
 *
 * Three things here are worth reading before changing anything.
 *
 * **The lights are not parented to this group.** `Car` hands `PartResult.lights`
 * straight to the stage, which adds them to the *scene*. So the emitters live
 * here as plain anchors, riding the body like the rest of the car, and their
 * world transform is copied onto the scene-level lights every frame.
 *
 * **The inner rear sections belong to the tailgate.** On the Avant the rear
 * lamp is split across the shutline (§6.4): the outer section is on the
 * quarter panel, the inner one on the tailgate and travels with it. They are
 * built as separate assemblies and the inner pair is re-parented onto the body
 * stream's `tailgatePanel` on the first frame, once the scene graph exists.
 *
 * **`state.lights` is real now.** Physics and input drive every flag, so the
 * lamps do exactly what the driver asks and nothing else; the auto-on fallback
 * that used to light them whenever the scene went dark has been removed. What
 * survives of that machinery is `keyLight()`, which now only gates the
 * volumetric beam shafts — air scatter you can see is a night phenomenon, and
 * drawing it into a sunlit frame is the single loudest CG tell there is.
 */

import * as THREE from 'three';
import { LIGHTS } from '@/spec';
import type { BuildContext, PartResult, VehicleState } from '@/types';
import { GlowFactory, type Glow } from './lights/optics';
import { LampChannels, type LampState } from './lights/channels';
import { HeadlampBeams } from './lights/beam';
import { buildHeadlamps } from './lights/headlamp';
import { buildTaillamps } from './lights/taillamp';
import { buildSmallLamps } from './lights/small';

/**
 * Tail current as a fraction of stop current. A 5 W/21 W dual filament is
 * roughly this ratio, and it is why brake lights read as a step rather than as
 * something coming on.
 */
const TAIL_OF_BRAKE = 0.28;

/** Standing current in the front amber section when the side lights are on. */
const PARK_IN_AMBER = 0.30;

/** Minimum spill intensity worth spending a light on. */
const SPILL_FLOOR = 0.18;

/** Below this much light on the scene the beams may draw their shafts. */
const DARK_THRESHOLD = 0.25;

export function buildLights(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  group.name = 'lights';

  const glows = new GlowFactory(ctx.materials);

  const head = buildHeadlamps(ctx, glows);
  const tail = buildTaillamps(ctx, glows);
  const small = buildSmallLamps(ctx, glows);

  group.add(head.group, tail.outer, tail.inner, small.group);
  ctx.progress(0.6, 'lights');

  const beams = new HeadlampBeams(group, head.emitters);

  // Near-field spill: what a lit rear cluster throws onto its own bumper, the
  // plate and the road. Colour is mixed from whichever filaments are alight.
  const rearSpill = tail.spill.map((p, i) => new Spill(group, p, 3.6, `rearSpill${i}`));
  const plateSpill = new Spill(group, small.plateLightAt, 0.75, 'plateSpill');

  const channels = new LampChannels();

  const lights: THREE.Light[] = [
    ...beams.lights,
    ...rearSpill.map((s) => s.light),
    plateSpill.light,
  ];

  let tidied = false;
  let attached = false;
  let darkAge = 99;
  let dark = false;

  const red = new THREE.Color();
  const tmp = new THREE.Color();

  /**
   * Reviewer override. Anything set here wins over `state.lights`, so a
   * reviewer (or the screenshot harness) can put the car on brakes, on
   * indicators or in reverse without driving it:
   *
   *   __AUDI_LIGHTS.set({ low: true, brake: true })
   *   __AUDI_LIGHTS.clear()
   */
  let override: Partial<VehicleState['lights']> | null = null;
  const merged: VehicleState['lights'] = {
    low: false, high: false, brake: false, reverse: false, hazard: false, indicator: 0, fog: false,
  };
  (globalThis as Record<string, unknown>).__AUDI_LIGHTS = {
    set(patch: Partial<VehicleState['lights']>): void {
      override = { ...(override ?? {}), ...patch };
    },
    clear(): void {
      override = null;
    },
    state: (): LampState => channels.state,
    /** Which panel the tailgate-mounted rear sections ended up on. */
    tailgate: (): string => tail.inner.parent?.name ?? 'unparented',
    /** Draw calls and triangles this part costs, for the perf budget. */
    cost: (): { meshes: number; triangles: number; lights: number } => {
      const seen = new Set<THREE.Mesh>();
      let triangles = 0;
      for (const root of [group, tail.inner]) {
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry || seen.has(m)) return;
          seen.add(m);
          const g = m.geometry as THREE.BufferGeometry;
          triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
        });
      }
      return { meshes: seen.size, triangles: Math.round(triangles), lights: lights.length };
    },
  };

  const update = (dt: number, elapsed: number, state: VehicleState): void => {
    if (!tidied) {
      tidied = true;
      tidy(group);
      attached = attachToTailgate(group, tail.inner);
    } else if (!attached && darkAge % 30 === 0) {
      attached = attachToTailgate(group, tail.inner);
    }

    // The preset only changes when a reviewer asks for it; 20 frames of lag is
    // free and this walks the scene graph.
    if (darkAge++ > 20) {
      darkAge = 0;
      dark = keyLight(group) < DARK_THRESHOLD;
    }

    let want = state.lights;
    if (override) {
      Object.assign(merged, state.lights, override);
      want = merged;
    }
    const s: LampState = channels.step(dt, elapsed, want);

    // --- front -------------------------------------------------------------
    head.main.set(s.head);
    // On a US car the amber section is the parking lamp as well as the turn
    // signal, so it carries a low steady current whenever the side lights are
    // on and steps to full when the indicator fires.
    head.indicator[0].set(Math.max(s.indicator[0], s.tail * PARK_IN_AMBER));
    head.indicator[1].set(Math.max(s.indicator[1], s.tail * PARK_IN_AMBER));
    beams.apply(s.head, s.high, dark);
    beams.sync();

    // --- rear --------------------------------------------------------------
    const stop = Math.max(s.tail * TAIL_OF_BRAKE, s.brake);
    for (const g of tail.tail) g.set(stop, s.brake);
    for (const g of tail.reverse) g.set(s.reverse);
    for (let side = 0; side < 2; side++) {
      for (const g of tail.indicator[side]) g.set(s.indicator[side]);
    }

    for (const g of small.markers) g.set(s.tail);
    small.plate.set(s.tail);

    // --- spill -------------------------------------------------------------
    for (let side = 0; side < 2; side++) {
      const r = stop;
      const w = s.reverse;
      const a = s.indicator[side];
      const sum = r + w + a;
      const power = 0.30 * r + 1.5 * w + 0.45 * a;
      // A forward renderer pays for every light on every fragment, so a lamp
      // that cannot be seen to do anything should not be a light at all. Tail
      // current alone throws nothing worth 1/13th of the shading budget.
      if (sum < 0.004 || power < SPILL_FLOOR) {
        rearSpill[side].off();
      } else {
        // Mix the three filaments' own colours in proportion to what each is
        // drawing, so a braking car under an indicator washes orange-red the
        // way a real one does rather than flipping between two flat tints.
        red.setHex(s.brake > 0.5 ? LIGHTS.brakeColor : LIGHTS.tailColor, THREE.SRGBColorSpace);
        tmp.copy(red).multiplyScalar(r);
        mixIn(tmp, LIGHTS.reverseColor, w);
        mixIn(tmp, LIGHTS.indicatorColor, a);
        tmp.multiplyScalar(1 / sum);
        // Reversing lamps are the only rear lamp meant to light anything, so
        // they carry most of the spill; tail and indicator barely wash. Kept
        // low deliberately — the apparent brightness of a lit lamp comes from
        // its emissive and the bloom, not from a point source next to it.
        rearSpill[side].on(tmp, power);
      }
    }
    // The plate lamp's whole job is to make the plate legible after dark, so
    // it is the one spill that earns its light — but only once it is dark.
    if (!dark || s.tail < 0.05) plateSpill.off();
    else plateSpill.on(warmWhite, 0.16 * s.tail);

    for (const sp of rearSpill) sp.sync();
    plateSpill.sync();
  };

  ctx.progress(1, 'lights');

  return {
    group,
    lights,
    update,
    nodes: {
      headlamps: head.group,
      taillampOuter: tail.outer,
      taillampInner: tail.inner,
      sideMarkers: small.group,
    },
  };
}

// ---------------------------------------------------------------------------
// Spill lights
// ---------------------------------------------------------------------------

/** A point source riding the car, mirrored onto a scene-level light. */
class Spill {
  readonly light = new THREE.PointLight(0xffffff, 0, 1, 2);
  private readonly anchor = new THREE.Object3D();

  constructor(parent: THREE.Object3D, at: THREE.Vector3, range: number, name: string) {
    this.anchor.name = name;
    this.anchor.position.copy(at);
    parent.add(this.anchor);
    this.light.name = name;
    this.light.distance = range;
    this.light.visible = false;
    this.light.castShadow = false;
  }

  on(color: THREE.Color, intensity: number): void {
    this.light.visible = true;
    this.light.color.copy(color);
    this.light.intensity = intensity;
  }

  off(): void {
    this.light.visible = false;
  }

  sync(): void {
    if (!this.light.visible) return;
    this.anchor.updateWorldMatrix(true, false);
    this.light.position.setFromMatrixPosition(this.anchor.matrixWorld);
  }
}

const warmWhite = new THREE.Color().setHex(0xfff2dc, THREE.SRGBColorSpace);
const _c = new THREE.Color();

/** Accumulate `hex` into `into`, weighted. `Color` has no `addScaledVector`. */
function mixIn(into: THREE.Color, hex: number, weight: number): void {
  if (weight <= 0) return;
  _c.setHex(hex, THREE.SRGBColorSpace);
  into.r += _c.r * weight;
  into.g += _c.g * weight;
  into.b += _c.b * weight;
}

// ---------------------------------------------------------------------------
// Scene-graph housekeeping
// ---------------------------------------------------------------------------

function rootOf(o: THREE.Object3D): THREE.Object3D {
  let r = o;
  while (r.parent) r = r.parent;
  return r;
}

/**
 * `Car.build` switches shadows on for every mesh in the car once the parts are
 * assembled, which is right for bodywork and wrong for lamp internals: a lens
 * casting a shadow would black out the beam behind it, and a 3 mm filament in
 * a shadow map buys nothing at any distance.
 */
function tidy(group: THREE.Object3D): void {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = false;
    if (/Glow|Lens|lens/.test(m.name)) m.receiveShadow = false;
  });
}

/**
 * Hang the inner rear sections off the tailgate so they open with it. Uses
 * `attach`, which preserves the world transform, so the assemblies do not have
 * to know where the body stream put its hinge.
 */
function attachToTailgate(group: THREE.Object3D, inner: THREE.Object3D): boolean {
  const root = rootOf(group);
  const panel = root.getObjectByName('tailgatePanel');
  if (!panel) return false;
  root.updateMatrixWorld(true);
  panel.attach(inner);
  return true;
}

const _dir = new THREE.Vector3();
/**
 * How lit the world is. The environment names its key light, so this reads the
 * real thing rather than guessing from a preset name, and it degrades to
 * "daylight" if the environment stream ever renames it.
 *
 * Used only to decide whether the beams may draw their volumetric shafts.
 *
 * The obvious test — sun intensity scaled by its elevation — gets golden hour
 * exactly wrong. A low sun has a small `dir.y`, so a bright, warm, entirely
 * daylit scene scored below the threshold and the car drove around with its
 * headlamps on, pooling light on the road in front of the bumper. Elevation
 * says where the sun is, not how much light there is.
 *
 * So: keep most of the sun's intensity regardless of how low it sits, and add
 * the ambient and hemisphere terms, which are what actually carry a scene once
 * the sun is near the horizon — and are near zero at night, which is the case
 * this test exists to catch.
 */
function keyLight(group: THREE.Object3D): number {
  const root = rootOf(group);
  const sun = root.getObjectByName('env:sun') as THREE.DirectionalLight | null;

  let ambient = 0;
  root.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight || l === sun) return;
    if ((l as THREE.HemisphereLight).isHemisphereLight || (l as THREE.AmbientLight).isAmbientLight) {
      ambient += l.intensity;
    }
  });

  if (!sun) return ambient > 0 ? ambient : 1;
  _dir.copy(sun.position).sub(sun.target.position).normalize();
  const elevation = Math.max(_dir.y, 0);
  return sun.intensity * (0.4 + 0.6 * elevation) + ambient;
}

export type { Glow };

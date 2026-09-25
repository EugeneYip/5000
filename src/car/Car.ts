/**
 * Car — assembly point.
 *
 * Owns nothing visual itself. It runs each part builder, parents the results
 * under one root, collects articulations and per-frame updaters, and exposes
 * named nodes to the rest of the app.
 *
 * Part builders are deliberately independent and each lives in its own file,
 * so they can be developed and reviewed separately.
 */

import * as THREE from 'three';
import type { BuildContext, PartBuilder, PartResult, Articulation, VehicleState } from '@/types';

import { buildBody } from './body';
import { buildGlass } from './glass';
import { buildWheels } from './wheels';
import { buildLights } from './lights';
import { buildTrim } from './trim';
import { buildInterior } from './interior';
import { buildUnderbody } from './underbody';

interface RegisteredPart {
  name: string;
  result: PartResult;
}

const BUILDERS: Array<{ name: string; fn: PartBuilder; weight: number }> = [
  { name: 'body', fn: buildBody, weight: 0.3 },
  { name: 'glass', fn: buildGlass, weight: 0.08 },
  { name: 'wheels', fn: buildWheels, weight: 0.14 },
  { name: 'lights', fn: buildLights, weight: 0.13 },
  { name: 'trim', fn: buildTrim, weight: 0.15 },
  { name: 'interior', fn: buildInterior, weight: 0.14 },
  { name: 'underbody', fn: buildUnderbody, weight: 0.06 },
];

export class Car {
  /** Root of the whole vehicle. Physics drives this transform. */
  readonly root = new THREE.Group();
  /** Sprung mass — everything that rolls and pitches on the suspension. */
  readonly body = new THREE.Group();

  readonly parts = new Map<string, PartResult>();
  readonly articulations = new Map<string, Articulation>();
  readonly nodes = new Map<string, THREE.Object3D>();

  private updaters: Array<(dt: number, t: number, s: VehicleState) => void> = [];

  private constructor() {
    this.root.name = 'Audi5000SWagon';
    this.body.name = 'SprungMass';
    this.root.add(this.body);
  }

  static async build(ctx: BuildContext): Promise<Car> {
    const car = new Car();
    let done = 0;
    const total = BUILDERS.reduce((a, b) => a + b.weight, 0);

    for (const { name, fn, weight } of BUILDERS) {
      ctx.progress(done / total, name);
      const result = await fn(ctx);
      result.group.name = name;
      car.body.add(result.group);
      car.parts.set(name, result);

      for (const a of result.articulations ?? []) car.articulations.set(a.name, a);
      for (const [k, v] of Object.entries(result.nodes ?? {})) car.nodes.set(k, v);
      if (result.update) car.updaters.push(result.update.bind(result));

      done += weight;
      ctx.progress(done / total, name);
    }

    car.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // Frustum culling off for body panels: they are one logical object and
        // popping a door panel at the frame edge looks broken.
        o.frustumCulled = true;
      }
    });

    return car;
  }

  /** Request an articulation move. `open` 0..1. */
  setArticulation(name: string, open: number): void {
    const a = this.articulations.get(name);
    if (a) a.target = THREE.MathUtils.clamp(open, 0, 1);
  }

  toggleArticulation(name: string): void {
    const a = this.articulations.get(name);
    if (a) a.target = a.target > 0.5 ? 0 : 1;
  }

  update(dt: number, elapsed: number, state: VehicleState): void {
    for (const a of this.articulations.values()) {
      if (Math.abs(a.value - a.target) > 1e-4) {
        const step = dt / Math.max(a.duration, 1e-3);
        const dir = Math.sign(a.target - a.value);
        let v = a.value + dir * step;
        if ((dir > 0 && v > a.target) || (dir < 0 && v < a.target)) v = a.target;
        a.value = v;
        // Ease so a door does not snap to a stop at the end of its travel.
        a.apply(v * v * (3 - 2 * v));
      }
    }
    for (const u of this.updaters) u(dt, elapsed, state);
  }

  /** Total triangle count, for the perf budget. */
  triangleCount(): number {
    let n = 0;
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        const g = m.geometry as THREE.BufferGeometry;
        n += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      }
    });
    return Math.round(n);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      }
    });
  }
}

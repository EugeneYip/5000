/**
 * The cabin.
 *
 * The C3's glass is large, flush and only lightly tinted, so the interior is
 * on show from every exterior angle — an empty shell behind the side glass is
 * as obvious a fault as a wrong wheel. Everything here therefore earns its
 * place twice: once in the `interior` and `dash` review poses, and once as
 * the thing you see *through* the windows in `side` and `front3q`.
 *
 * Build target is the pre-facelift car throughout: old cluster, 4-spoke
 * urethane wheel, velour. The January 1988 facelift reached the US a model
 * year later, so a MY1988 5000 S never had the new interior — see
 * docs/REFERENCE-VEHICLE.md §5.6.
 *
 * Sub-modules each own one region and hand back geometry; this file only
 * assembles, names, and routes `update()` to the parts that move.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext, PartResult, VehicleState } from '@/types';

import { StaticBatch } from './interior/batch';
import { buildShell } from './interior/shell';
import { buildDash } from './interior/dash';
import { buildSeats } from './interior/seats';
import { buildWheel } from './interior/wheel';
import { buildCluster } from './interior/cluster';
import { buildConsole } from './interior/console';
import { buildDoors } from './interior/doors';
import { buildCargo } from './interior/cargo';
import { buildDetails } from './interior/details';

/** This stream's share of the car's triangle budget. */
const TRIANGLE_BUDGET = 350_000;

export function buildInterior(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];
  const updaters: Array<(dt: number, t: number, s: VehicleState) => void> = [];

  /**
   * Everything in the cabin that is bolted down goes through one batch and
   * comes out as one mesh per material. Five finishes were arriving as
   * thirty-two meshes across six modules for want of somewhere to put them;
   * see `interior/batch.ts` for what is and is not allowed in.
   */
  const batch = new StaticBatch();

  buildShell(ctx, batch);
  buildDash(ctx, batch);

  const seats = buildSeats(ctx, batch);
  group.add(seats.group);
  articulations.push(...seats.articulations);

  const wheel = buildWheel(ctx);
  group.add(wheel.group);
  nodes.steeringWheel = wheel.group;
  updaters.push((dt, _t, s) => wheel.update(dt, s));

  const cluster = buildCluster(ctx);
  group.add(cluster.group);
  nodes.cluster = cluster.group;
  updaters.push((dt, _t, s) => cluster.update(dt, s));

  const console_ = buildConsole(ctx, batch);
  group.add(console_.group);
  updaters.push((dt, _t, s) => console_.update(dt, s));

  // Door cards keep their own meshes: the body stream articulates the doors
  // and the cards are the one region that will have to follow them.
  group.add(buildDoors(ctx));
  buildDetails(ctx, batch);

  const cargo = buildCargo(ctx, batch);
  group.add(cargo.group);
  articulations.push(...cargo.articulations);

  const cabin = new THREE.Group();
  cabin.name = 'cabinStatic';
  batch.flush(cabin);
  group.add(cabin);

  // The cabin's share of the car's triangle budget. Kept as a live check
  // rather than a comment because every one of these surfaces is parametric:
  // raising a seat's station count by ten is a one-character edit.
  let tris = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    if (m.isMesh && g) tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
  });
  if (tris > TRIANGLE_BUDGET) console.warn(`interior: ${Math.round(tris)} triangles, over the ${TRIANGLE_BUDGET} budget`);

  // TEMP cb4 A/B hook — removed before report.
  (globalThis as unknown as Record<string, unknown>).__CB4_CABIN = group;

  return {
    group,
    articulations,
    nodes,
    update(dt: number, elapsed: number, state: VehicleState) {
      for (const u of updaters) u(dt, elapsed, state);
    },
  };
}

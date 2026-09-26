/**
 * Trim, grille and badging — everything bolted to the painted shell.
 *
 * The front end lives or dies here: grille, rings, the deep US impact bumpers,
 * the licence plate. So does the Avant's signature — roof rails — and the
 * details that tell a viewer the car is a specific one rather than a generic
 * 1980s saloon: the recessed pull handles, the aero mirror, the rub strips,
 * the plate that reads `A2M 909`.
 *
 * Sub-modules each own one part and return geometry; this file only assembles,
 * names and wires up the wiper articulation. Every material comes from
 * `ctx.materials`; every dimension from `@/spec` or `@/car/hardpoints`.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext, PartResult, VehicleState } from '@/types';
import { HP } from '@/car/hardpoints';

import { buildGrille } from './trim/grille';
import { buildBumpers } from './trim/bumpers';
import { buildPlate, mountPlate } from './trim/plate';
import { buildRoofRails } from './trim/roofrails';
import { buildMirrors } from './trim/mirrors';
import { buildSides } from './trim/sides';
import { buildRearBadges } from './trim/badges';
import { buildWipers } from './trim/wipers';
import { buildDetails } from './trim/details';

export function buildTrim(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];

  group.add(buildGrille(ctx));
  group.add(buildBumpers(ctx).group);

  // One plate, built once, mounted twice: same texture, same material, same
  // geometry at both ends of the car.
  const plate = buildPlate(ctx.renderer);
  const chrome = ctx.materials.chrome();
  const front = mountPlate(plate, chrome, HP.front.plateCenter, 1, -2.5);
  const rear = mountPlate(plate, chrome, HP.rear.plateCenter, -1, 1.5);
  group.add(front, rear);
  nodes.plateFront = front;
  nodes.plateRear = rear;

  group.add(buildRoofRails(ctx));
  group.add(buildMirrors(ctx).group);
  group.add(buildSides(ctx));
  group.add(buildRearBadges(ctx));
  group.add(buildDetails(ctx));

  const wipers = buildWipers(ctx);
  group.add(wipers.group);
  articulations.push(wipers.articulation);
  nodes.wiperDriver = wipers.nodes.driver;
  nodes.wiperPassenger = wipers.nodes.passenger;
  nodes.wiperRear = wipers.nodes.rear;

  return {
    group,
    articulations,
    nodes,
    update(dt: number, elapsed: number, state: VehicleState) {
      wipers.update(dt, elapsed, state);
    },
  };
}

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
import { buildTailgatePanel, rearPlateMount } from './trim/tailgate';
import { buildWipers, fitRearWiper } from './trim/wipers';
import { buildDetails } from './trim/details';

export function buildTrim(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];

  group.add(buildGrille(ctx));
  group.add(buildBumpers(ctx).group);

  // One plate, built once, mounted twice: same texture, same material, same
  // geometry at both ends of the car. The rear one goes into the tailgate's
  // ribbed panel, not the bumper — see `trim/tailgate.ts`.
  const plate = buildPlate(ctx);
  const chrome = ctx.materials.chrome();
  const rearMount = rearPlateMount();
  const front = mountPlate(plate, chrome, HP.front.plateCenter, 1, -2.5);
  const rear = mountPlate(plate, chrome, rearMount.centre, -1, rearMount.tiltDeg);
  group.add(front, rear);
  nodes.plateFront = front;
  nodes.plateRear = rear;

  const tailgate = buildTailgatePanel(ctx);
  group.add(tailgate.group);

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

  // The ribbed panel, the plate in it and the rear wiper are all tailgate
  // furniture: they travel with the panel when it opens, and the lighting
  // stream finds the plate lamps' host by walking up from `plateRear` looking
  // for `tailgatePanel`. Neither that node nor the glazing stream's pane
  // exists while this builder runs — `Car` adds each part's group as it is
  // built and trim comes after glass but before anything is assembled — so
  // both hand-overs are tried on the frame loop until they take.
  const riders = [...tailgate.riders, rear, wipers.rearMount];
  let mounted = false;
  let tick = 0;

  return {
    group,
    articulations,
    nodes,
    update(dt: number, elapsed: number, state: VehicleState) {
      if (!mounted && tick++ % 30 === 0) mounted = mountOnTailgate(group, riders, wipers.rearMount);
      wipers.update(dt, elapsed, state);
    },
  };
}

/**
 * Sit the tailgate's furniture on the tailgate. The wiper is fitted to the
 * glass first, in the car's own frame, and re-parented after — `attach`
 * preserves the world transform, so the order only matters for legibility.
 */
function mountOnTailgate(
  group: THREE.Object3D,
  riders: readonly THREE.Object3D[],
  rearWiper: THREE.Group,
): boolean {
  let root: THREE.Object3D = group;
  while (root.parent) root = root.parent;
  const panel = root.getObjectByName('tailgatePanel');
  if (!panel) return false;
  root.updateMatrixWorld(true);
  if (!fitRearWiper(rearWiper, root)) return false;
  root.updateMatrixWorld(true);
  for (const r of riders) panel.attach(r);
  return true;
}

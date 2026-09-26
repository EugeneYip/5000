/**
 * Underbody.
 *
 * Two reasons this exists rather than being a flat plate.
 *
 * The first is that the car gets shot from low angles — under the sills, up
 * into the arches — and there is nothing to look at there unless something has
 * been built. The second is less obvious and matters more: the contact shadow
 * and the ambient occlusion under the car are derived from real geometry, so a
 * car with an empty underside does not sit on the ground, it hovers over it.
 * Floorpan, subframes, tank, exhaust and arch liners are all load-bearing for
 * that even when none of them is directly visible.
 *
 * Layout notes that are specific to this car and easy to get wrong:
 *   · the 2309 cc five is **longitudinal and ahead of the front axle**;
 *   · it drives the front wheels, so there are driveshafts but no propshaft;
 *   · the rear is a torsion-crank beam, not independent — that is the quattro;
 *   · the exhaust is a **single** naturally-aspirated system with one centre
 *     silencer and one rear box, exiting left of centre.
 */

import * as THREE from 'three';
import type { BuildContext, PartResult, VehicleState } from '@/types';
import { merge } from './underbody/geom';
import { buildFloorpan, buildStructure, buildTank, buildAero, buildHeatShields } from './underbody/chassis';
import { buildSuspension, applyCorner, travelFor, type Corner } from './underbody/suspension';
import { buildDriveline } from './underbody/driveline';
import { buildLiners } from './underbody/liners';

export function buildUnderbody(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};

  // Underseal and moulded plastic are both dielectric and both grained, which
  // is exactly what `bumperPlastic` is; the arch liners get the same material
  // so they batch with the pan.
  const pan = ctx.materials.bumperPlastic();
  // Painted pressed steel is a dielectric too — a black subframe is paint, not
  // bare metal, and giving it metalness is the usual mistake.
  const steel = ctx.materials.interiorPlastic({ color: 0x191b1e, roughness: 0.58 });
  // Clean cast alloy, for what the bonnet exposes.
  // NOT alloy(): that is authored near-white and fully metallic for the
  // wheels, and a sump or bellhousing wearing it blazes like a lamp when a low
  // sun gets under the car. Under-floor castings are dull, dark and oxidised.
  const cast = ctx.materials.interiorPlastic({ color: 0x3a3c3d, roughness: 0.72 });
  // Everything under the floor line. `alloy()` is authored for wheels —
  // near-white, fully metallic — and an engine sump wearing it glows like a
  // lamp when a low sun gets under the car. Real under-car castings are dark,
  // dry and dusty, and reading dielectric costs nothing down there.
  const grimy = ctx.materials.interiorPlastic({ color: 0x2c2f31, roughness: 0.66 });
  const bright = ctx.materials.chrome({ roughness: 0.28 });
  // Aluminised foil, not chrome: `chrome()` bottoms out at roughness 0.09
  // whatever it is asked for, and a mirror-finish heat shield throws sky-blue
  // light around under a car that should be in shadow.
  // Aluminised heat shields dull and discolour almost immediately in service;
  // mirror-bright ones do not exist on a road car with miles on it.
  const shield = ctx.materials.interiorPlastic({ color: 0x4a4b4c, roughness: 0.55 });
  const rubber = ctx.materials.rubber({ roughness: 0.94 });
  const black = ctx.materials.blackTrim();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, shadow = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // =========================================================================
  // Structure
  // =========================================================================
  nodes.floorpan = add(merge([buildFloorpan(), buildAero()]), pan, 'floorpan');
  nodes.archLiners = add(buildLiners(), pan, 'archLiners');
  add(merge([buildStructure(), buildTank()]), steel, 'structure');
  add(buildHeatShields(), shield, 'heatShields', false);

  // =========================================================================
  // Engine bay, cooling pack and exhaust
  // =========================================================================
  const dl = buildDriveline();
  nodes.engine = add(dl.cast, cast, 'engine');
  nodes.exhaust = add(dl.grimy, grimy, 'driveline');
  add(dl.black, black, 'engineBay');
  add(dl.rubber, rubber, 'engineBayRubber');
  add(dl.bright, bright, 'engineBright');

  // =========================================================================
  // Suspension
  // =========================================================================
  const susp = buildSuspension({ steel, cast: grimy, rubber });
  add(susp.steel, steel, 'subframes');
  add(susp.cast, grimy, 'steeringRack');
  add(susp.rubber, rubber, 'suspensionBushes');
  for (const g of susp.groups) {
    group.add(g);
    nodes[g.name] = g;
  }

  const corners: Corner[] = susp.corners;

  ctx.progress(1, 'underbody');

  return {
    group,
    nodes,
    update(_dt: number, _elapsed: number, state: VehicleState): void {
      for (let i = 0; i < corners.length; i++) {
        applyCorner(corners[i], travelFor(state.suspensionCompression?.[i] ?? 0.5, corners[i].front));
      }
    },
  };
}

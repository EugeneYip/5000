/**
 * The cabin's static batch.
 *
 * Nine modules build this interior and each used to hang its own meshes off
 * its own group, so one finish came back as five or six draws: a near-black
 * moulded plastic in the fascia, another on the centre stack, another in the
 * cargo bay, another among the cabin details. Counted in the built scene that
 * was **thirty-two** meshes wearing five materials, none of which moves
 * relative to any other — the shell they are all screwed to is one rigid body.
 *
 * So the static half of the cabin is handed here instead, and `buildInterior`
 * flushes it as one mesh per material at the end. The modules keep their own
 * code, their own geometry helpers and their own region; only the destination
 * changes, and a call site can opt back out by adding its mesh to the group
 * the way it always did.
 *
 * ## What must NOT come here
 *
 * Anything that moves or is switched: a seat back on its fold pivot, the
 * handbrake lever, the cargo blind, a needle on its spindle, a warning lamp
 * that is toggled, the steering wheel. Also anything under a group with its
 * own transform, unless the caller bakes that transform into the geometry
 * first — the batch applies none.
 *
 * The door cards are deliberately left out even though they are static today:
 * the body stream has `doorFL`…`doorRR` articulations and the cards are the
 * one region that will have to follow them, so they stay separable.
 */

import * as THREE from 'three';
import { merge, mesh } from './util';

export class StaticBatch {
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Geometry that is bolted to the shell for good. */
  add(material: THREE.Material, ...geometry: THREE.BufferGeometry[]): void {
    let b = this.buckets.get(material);
    if (!b) { b = []; this.buckets.set(material, b); }
    for (const g of geometry) if (g.getAttribute('position')) b.push(g);
  }

  /** One mesh per material, named after it so the audit still reads clearly. */
  flush(group: THREE.Group): void {
    for (const [material, geos] of this.buckets) {
      const g = geos.length === 1 ? geos[0] : merge(geos);
      group.add(mesh(g, material, `cabin:${material.name || material.type}`));
    }
    this.buckets.clear();
  }
}

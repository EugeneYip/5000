/**
 * Tailgate badging.
 *
 * The span between the lamps is the ribbed plate panel (`trim/tailgate.ts`),
 * so nothing can sit there. On the US car nothing does: `US-R` shows two
 * scripts on the body-coloured band **above** the lamps, each pushed hard
 * outboard over its own lamp, and **no four rings at all**. Rings on
 * the tailgate are a Euro 100/200 feature (`AV-R1`, `AV-R2`).
 * `docs/CRITIQUE.md` §17, `docs/REFERENCE-VEHICLE.md` §2.6.
 *
 * Reading sides off `US-R` — worth writing down, because it is easy to get
 * backwards and the two scripts are not interchangeable. The frame has the
 * tail at the left and the nose at the right, so the camera looks along +X and
 * therefore stands on the car's LEFT; the near flank, at the right of the
 * frame, is −X. *FuelInjection* is at that end, *Audi 5000 S* at the far end,
 * so the model script is on the car's RIGHT (+X).
 *
 * ⚠ `HP.rear.badgeRingsCenter` / `badgeAudiCenter` / `badgeModelCenter` all sit
 * between the lamps at |x| ≤ 0.181, which is now the ribbed panel. Only their
 * *order* survives; the positions are derived from the lamp band. See the
 * stream report — those three hardpoints want replacing with a single
 * `badgeY` plus the lamp centreline.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { rearFaceZ } from './bodyref';
import { badgeText } from './glyphs';

/** The tailgate leans as it rises; badges have to lie on that rake. */
function tailBasis(x: number, y: number): { m: THREE.Matrix4; z: number } {
  const dz = rearFaceZ(x, y + 0.03) - rearFaceZ(x, y - 0.03);
  const up = new THREE.Vector3(0, 0.06, dz).normalize();
  const n = new THREE.Vector3(0, up.z, -up.y).normalize();
  const right = new THREE.Vector3(-1, 0, 0);
  return { m: new THREE.Matrix4().makeBasis(right, up, n), z: rearFaceZ(x, y) };
}

function place(obj: THREE.Object3D, x: number, y: number, lift: number): void {
  const { m, z } = tailBasis(x, y);
  obj.quaternion.setFromRotationMatrix(m);
  const n = new THREE.Vector3().setFromMatrixColumn(m, 2);
  obj.position.set(x + n.x * lift, y + n.y * lift, z + n.z * lift);
}

/** Centre a script over one lamp, pulled in if it would overhang the aperture. */
function script(
  group: THREE.Group,
  name: string,
  text: string,
  cap: number,
  side: 1 | -1,
  y: number,
  material: THREE.Material,
): void {
  const g = badgeText(text, cap, { depth: 0.0022, tracking: 0.07, weight: '600' });
  g.computeBoundingBox();
  const w = (g.boundingBox?.max.x ?? 0) - (g.boundingBox?.min.x ?? 0);
  const R = HP.rear;
  const lampCentre = (R.lampInnerX + R.lampOuterX) / 2;
  // Hard outboard, but never hanging off the end of the lamp below it.
  const x = side * Math.min(lampCentre, R.lampOuterX - w / 2 - 0.012);
  const m = new THREE.Mesh(g, material);
  m.name = name;
  place(m, x, y, 0.0016);
  group.add(m);
}

export function buildRearBadges(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rearBadges';
  const chrome = ctx.materials.chrome();

  // Just clear of the lamp band, on the painted band between it and the glass.
  const y = HP.rear.lampTopY + 0.052;

  script(group, 'badgeModel', 'Audi 5000 S', 0.0295, 1, y, chrome);
  script(group, 'badgeFuelInjection', 'FuelInjection', 0.0225, -1, y, chrome);

  return group;
}

/**
 * Tailgate badging.
 *
 * §6.5, read off a MY1988 North-American car: the model designation sits LEFT
 * of centre and the four rings just right of it, with any engine/drivetrain
 * scripts running off to the right. "Left" there is the viewer's left, which
 * is +X in the vehicle frame.
 *
 * ⚠ `HP.rear.badgeModelCenter` (+0.472) and `badgeAudiCenter` (−0.452) both
 * fall *inside* the taillamp aperture, which `HP.rear.lampInnerX`/`lampOuterX`
 * put at |x| = 0.238 … 0.828. The badges are therefore laid out across the
 * body-coloured panel that actually exists between the lamps, keeping the
 * hardpoints' heights and their left-to-right order. See the stream report.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { rearFaceZ } from './bodyref';
import { badgeText } from './glyphs';
import { fourRings, ringsWidth } from './rings';
import { mesh } from './util';

/** The tailgate leans forward as it rises; badges have to lie on that rake. */
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

export function buildRearBadges(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rearBadges';
  const chrome = ctx.materials.chrome();

  const R = HP.rear;
  // Panel actually available between the two lamp apertures.
  const panelHalf = R.lampInnerX - 0.012;

  // --- four rings ---------------------------------------------------------
  // Scaled to 0.62 of the grille badge so they sit comfortably in the panel
  // and read at tailgate scale; the spacing/diameter ratio is unchanged.
  const diameter = HP.front.ringDiameter * 0.62;
  const rings = new THREE.Mesh(fourRings({ diameter }), chrome);
  rings.name = 'fourRingsRear';
  place(rings, R.badgeRingsCenter[0], R.badgeRingsCenter[1], R.badgeRingsCenter[2] - rearFaceZ(0, R.badgeRingsCenter[1]));
  group.add(rings);

  // --- model designation, viewer's left of centre --------------------------
  const modelCap = 0.0335;
  const model = badgeText('5000 S', modelCap, { depth: 0.0024, tracking: 0.09, weight: '600' });
  model.computeBoundingBox();
  const modelW = (model.boundingBox?.max.x ?? 0) - (model.boundingBox?.min.x ?? 0);
  const modelX = Math.min(0.100, panelHalf - modelW / 2 - 0.004);
  const modelMesh = new THREE.Mesh(model, chrome);
  modelMesh.name = 'badgeModel';
  place(modelMesh, modelX, R.badgeModelCenter[1], 0.0016);
  group.add(modelMesh);

  // --- small script to the right of the rings ------------------------------
  const script = badgeText('audi', 0.0205, { depth: 0.0018, tracking: 0.04, weight: '500' });
  script.computeBoundingBox();
  const scriptW = (script.boundingBox?.max.x ?? 0) - (script.boundingBox?.min.x ?? 0);
  const scriptMesh = new THREE.Mesh(script, chrome);
  scriptMesh.name = 'badgeAudi';
  place(scriptMesh, -Math.min(0.138, panelHalf - scriptW / 2 - 0.004), R.badgeAudiCenter[1], 0.0016);
  group.add(scriptMesh);

  void ringsWidth;
  return group;
}

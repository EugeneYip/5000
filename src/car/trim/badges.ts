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
import { BADGE_MODEL_FONT_STACK, BADGE_SCRIPT_FONT_STACK, badgeText } from './glyphs';
import { BADGE_BAND_Y } from './spoiler';

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

interface ScriptOpts {
  cap: number;
  tracking: number;
  weight: string;
  font: string;
  style?: string;
  /** Centre of the run, as a half-width. Mirrored by `side`. */
  centreX: number;
}

/** Lay one script on the painted band, pulled in if it would overhang. */
function script(
  group: THREE.Group,
  name: string,
  text: string,
  side: 1 | -1,
  y: number,
  material: THREE.Material,
  o: ScriptOpts,
): void {
  const g = badgeText(text, o.cap, {
    depth: 0.0022, tracking: o.tracking, weight: o.weight, font: o.font, style: o.style,
  });
  g.computeBoundingBox();
  const w = (g.boundingBox?.max.x ?? 0) - (g.boundingBox?.min.x ?? 0);
  // Never hanging off the end of the lamp below it, whatever the face does.
  const x = side * Math.min(o.centreX, HP.rear.lampOuterX - w / 2 - 0.012);
  const m = new THREE.Mesh(g, material);
  m.name = name;
  place(m, x, y, 0.0016);
  group.add(m);
}

export function buildRearBadges(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'rearBadges';
  const chrome = ctx.materials.chrome();

  /**
   * The badge line drops to the middle of what is left of the painted band
   * once the black trim band is in above it (`trim/spoiler.ts`). It used to
   * sit at `lampTopY + 0.052` = 0.972, which is inside the band's footprint.
   *
   * `BAT-R`, dead-on: band bottom 563 px, badge 575–605, lamp top 624 — so
   * ~19 mm of paint above the script and ~30 mm below it. As built that comes
   * out 13 and 30.
   */
  const y = BADGE_BAND_Y;

  // x: `HP.rear.badgeModelCenter` is ±0.42, and measuring `BAT-R`'s `5000 CD`
  // against the body's own width puts its centre at ~0.375 — so the hardpoint
  // is close and the ±0.51 this used to derive from the lamp band was 90 mm
  // outboard of both. Build to the hardpoint.
  const modelX = Math.abs(HP.rear.badgeModelCenter[0]);
  const scriptX = Math.abs(HP.rear.badgeAudiCenter[0]) + 0.075;

  script(group, 'badgeModel', 'Audi 5000 S', 1, y, chrome, {
    cap: 0.0305, tracking: 0.155, weight: '500', font: BADGE_MODEL_FONT_STACK, centreX: modelX,
  });
  // Two words, lowercase, obliqued — the `turbo`/`quattro` family, not a
  // camel-case word in a modern geometric sans (`docs/CRITIQUE-2.md` §12).
  script(group, 'badgeFuelInjection', 'fuel injection', -1, y, chrome, {
    cap: 0.0185, tracking: 0.008, weight: '500', style: 'italic',
    font: BADGE_SCRIPT_FONT_STACK, centreX: scriptX,
  });

  return group;
}

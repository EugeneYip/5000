/**
 * Tailgate badging.
 *
 * The span between the lamps is the ribbed plate panel (`trim/tailgate.ts`),
 * so nothing can sit there. Everything here goes on the body-coloured strip
 * **above** the lamps, between the black band and the lamp tops.
 *
 * Reading sides off the dead-on frames. Do this in X, not in "left" and
 * "right", because both the photograph and the render are rear views and both
 * naming conventions have already gone wrong on this car once.
 *
 * The `rear` camera sits behind the car looking forward, so its image-left is
 * **+X** (`f × u` with f = +Z, u = +Y gives a camera-right of −X). On
 * `bat_rear_straight_b.jpg` the model designation is left of the tailgate
 * centreline, so it belongs at +X; the engine script is at −X. `HP.rear`'s
 * `badgeModelCenter` (+0.42) and `badgeAudiCenter` (−0.42) already say this,
 * and both scripts build straight to the hardpoint's X.
 *
 * ⚠ The SIDE is right; the MAGNITUDE is not, and it is a hardpoint so it is
 * reported rather than worked round here. The 0.42 was read as "264 px left
 * of the body centreline, +416 mm at that frame's 1.574 mm/px" — the same
 * 1810-mm-at-the-lamp-band scale `MODEL_CAP` below now rejects. Re-measured
 * on the corrected 1.324 mm/px the `5000 CD` run spans x 695→860 px, centre
 * 777.5, which is 273 px from the body centreline at 1051 and therefore
 * **+0.362 m**. `badgeModelCenter[0]` wants 0.36, not 0.42; 0.42 × 1.324 /
 * 1.574 = 0.353, so the discrepancy is exactly the scale and nothing else.
 *
 * (Which physical flank that is follows `hardpoints.ts`: +X is the car's LEFT.
 * Nothing here depends on it — the placement is fixed by the photograph.)
 *
 * THE FOUR RINGS ARE FITTED, and this reverses a previous round.
 *
 * `HP.rear`'s comment ("No rear rings: the four rings on the tailgate are a
 * Euro 100/200 feature, not a US 5000") and `CRITIQUE-2.md` §17 both rest on a
 * single reading of `GCFS-85`. Every other source contradicts it:
 *
 *   · `bat_rear_straight_b.jpg` / `bat_rear_straight.jpg` — 1988 5000 CD
 *     Avant, North American car: chrome rings at the dead centre of the
 *     tailgate, directly above the plate recess. Measured x 1001→1096 px
 *     against a body centreline of 1043, i.e. centred to within 9 mm.
 *   · `bat3_rear3q_silver_b.jpg` — 1988 5000 CS Avant, Oregon plates: same.
 *   · `wm_rear_100avant_22e_b.jpg` — European 100 Avant: same.
 *   · **`docs/REFERENCE-VEHICLE.md` §6.5, which cites `GCFS-85` itself**:
 *     "For a 5000 S Wagon, expect `5000 S` left of centre and the rings right
 *     of centre… `GCFS-85` shows exactly that layout on a US 5000 S Wagon."
 *
 * So the one source quoted for their absence is on record as showing them. No
 * reference in `scratchpad/ref3/` shows a C3 Avant tailgate without rings.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { rearFaceZ } from './bodyref';
import {
  BADGE_SCRIPT_FONT_STACK, audiScriptGeometry, badgeText,
} from './glyphs';
import { fourRings } from './rings';
import { BADGE_BAND_Y, BADGE_STRIP_HEIGHT } from './spoiler';
import { mesh } from './util';

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

/**
 * Cap height of the model script.
 *
 * ⚠ THE SCALE THIS WAS MEASURED ON WAS WRONG, and this is the hard-coded
 * equivalent of a hardpoint that moved. It read **30 ± 2 mm** from 19.5 px on
 * `bat_rear_straight_b.jpg` at 1.574 mm/px and 26 px on `bat_rear_straight`
 * at 1.089 — and both of those mm/px came from "body width at the lamp band =
 * 1810 mm", which is exactly the error `HP.rear.lampInnerX`'s comment records
 * as the broken link in every earlier reading of this elevation. The tail
 * does not reach 1810 anywhere near the lamps.
 *
 * Rescaled on the corrected hardpoints, which cross-check in both axes: the
 * lamp band measures 1136 px across between the outer gasket edges against
 * `2 × lampOuterX` = 1500 mm (1.320 mm/px) and 139 px between the top and
 * bottom gasket minima against `lampTopY − lampBottomY` = 184 mm (1.324),
 * agreeing to 0.25 %. Re-measured on that scale the cap is 18 px on the first
 * frame and 26 px on the second — **24 ± 2 mm**, not 30.
 *
 * Still capped at 0.48 of the painted strip, but that no longer binds: the
 * strip is 85 mm now that `lampTopY` has come down, so the cap would have to
 * exceed 41 mm before it did.
 */
const MODEL_CAP = Math.min(0.025, BADGE_STRIP_HEIGHT * 0.48);

/**
 * Four-ring outer diameter. Measured 101 px across the four and 33 px tall on
 * `bat_rear_straight_b.jpg` at the corrected 1.324 mm/px — **134 mm and
 * 42 mm**. (The 150/49 this used to carry is the same 1.574 mm/px error as
 * `MODEL_CAP`.) `rings.ts` holds the canonical `spacing / diameter` = 0.769,
 * so a 41 mm diameter lands the overall span on 135 mm, one millimetre inside
 * the measurement's own noise on a 33 px feature.
 *
 * Expressed against the script's cap rather than absolutely, because **that
 * relationship is what the eye actually checks**: the photograph's rings stand
 * 1.63 × the height of the `5000 CD` beside them, and a first pass that tied
 * both to the same fraction of the strip made them the same height, which
 * reads instantly wrong however correct each is on its own.
 */
const RING_DIAMETER = Math.min(MODEL_CAP * 1.63, BADGE_STRIP_HEIGHT * 0.70);
/** Half the overall span of the four, from the canonical 0.769 spacing ratio. */
const RINGS_HALF_W = (3 * 0.769 * RING_DIAMETER + RING_DIAMETER) / 2;

interface ScriptOpts {
  cap: number;
  tracking: number;
  weight: string;
  font: string;
  style?: string;
  /** Centre of the run, as a half-width. Mirrored by `side`. */
  centreX: number;
}

/** Lay one set script on the painted band, pulled in if it would overhang. */
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
  lay(group, name, g, side, y, material, o.centreX);
}

/**
 * Put a finished badge geometry on the strip at ±`centreX`.
 *
 * The run is pulled inboard if it would hang off the end of the lamp below it,
 * and pushed outboard if it would foul the rings at the centre — there is no
 * sheet metal outboard of `lampOuterX` at this height, and the rings own the
 * middle of the strip.
 */
function lay(
  group: THREE.Group,
  name: string,
  g: THREE.BufferGeometry,
  side: 1 | -1,
  y: number,
  material: THREE.Material,
  centreX: number,
): void {
  g.computeBoundingBox();
  const w = (g.boundingBox?.max.x ?? 0) - (g.boundingBox?.min.x ?? 0);
  const outerLimit = HP.rear.lampOuterX - w / 2 - 0.012;
  const innerLimit = RINGS_HALF_W + 0.030 + w / 2;
  const x = side * Math.min(Math.max(centreX, innerLimit), outerLimit);
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
   * The badge line is the mid-height of the painted strip. Both dead-on frames
   * put the script's cap box dead centre in it — on `bat_rear_straight.jpg`,
   * strip 414→502 px with the glyphs at 445→471, so 31 px of paint above and
   * 31 below.
   */
  const y = BADGE_BAND_Y;

  lay(
    group, 'badgeModel',
    audiScriptGeometry('Audi 5000 S', MODEL_CAP, { depth: 0.0022 }),
    1, y, chrome, Math.abs(HP.rear.badgeModelCenter[0]),
  );

  // Two words, lowercase, obliqued — the `turbo`/`quattro` family, not a
  // camel-case word in a modern geometric sans. Still set rather than drawn:
  // the reference's engine scripts are a slanted geometric sans, which a font
  // stack does reach, and the wordmark's shapes are not shared with them.
  //
  // Built to `badgeAudiCenter` (−0.42). This used to add 75 mm to that, which
  // is why the mesh measured its centre at −0.4945 — a previous fix that
  // landed on one side of the car only.
  //
  // 0.78 of the model cap: on the dead-on frame `quattro`'s x-height is 14 px
  // against `5000 CD`'s 19.5 px cap, so the engine scripts are nearly as tall
  // as the model letters and not the half-size line this used to set. Held
  // below 1.0 only because the painted strip is short — see `MODEL_CAP`.
  script(group, 'badgeFuelInjection', 'fuel injection', -1, y, chrome, {
    cap: MODEL_CAP * 0.78, tracking: 0.008, weight: '500', style: 'italic',
    font: BADGE_SCRIPT_FONT_STACK, centreX: Math.abs(HP.rear.badgeAudiCenter[0]),
  });

  // --- four rings, dead centre --------------------------------------------
  // Lifted a shade further than the scripts: these are a thicker casting and
  // the photograph shows them standing proud of the flat letters beside them.
  const rings = mesh('badgeRearRings', fourRings({ diameter: RING_DIAMETER }), chrome);
  place(rings, 0, y, 0.0022);
  group.add(rings);

  return group;
}

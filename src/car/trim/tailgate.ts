/**
 * The tailgate's black ribbed centre panel — and the plate that bolts into it.
 *
 * On a US 5000 S Wagon the rear plate is **not** in the bumper. The whole span
 * between the two lamp apertures is a black, horizontally ribbed moulding set
 * into the tailgate with the plate bolted through the middle of it; from ten
 * paces it reads almost as a second grille. `docs/CRITIQUE.md` §3, and
 * `docs/REFERENCE-VEHICLE.md` §2.3 ("a black recessed panel set into the lower
 * tailgate, centred between the two taillights … the plate mounts directly
 * onto this recessed face").
 *
 * Measured off `US-R` (the 1985 US wagon, rear three-quarter) by sampling the
 * image and scaling on the plate's own 305 × 152 mm:
 *
 *   · ribbed field carries **~60 mm of ribbing above and below the plate**
 *     (panel ≈ 275 mm tall against the plate's 152);
 *   · **rib pitch ≈ 26 mm** — ten rib crests across the panel;
 *   · the panel's top and bottom edges sit roughly level with the lamp band,
 *     a shade taller than it at the top.
 *
 * Every dimension below is derived from `HP.rear.lamp*` rather than written
 * down, so that when the lamp aperture moves the panel still meets it. One of
 * those hardpoints does not agree with the photograph — see the stream report.
 *
 * The moulding is now genuinely recessed: the body stream has cut the aperture
 * this panel drops into. See `APERTURE` and the depth constants below.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { PLATE } from '@/spec';
import type { BuildContext } from '@/types';
import { rearFaceZ } from './bodyref';
import { DEG, merge, mesh, roundedBox, sweep, type Frame, type Pt } from './util';

const R = HP.rear;

/**
 * The hole in the tailgate's lower face, as `body.ts` cuts it: lamp to lamp in
 * width, from 20 mm above the tailgate's bottom shutline (so that edge
 * survives) up to the top of the lamp. 330 × 248 mm about y 0.796.
 *
 * Mirrored here rather than imported because `body.ts` keeps the two y limits
 * local. Everything below is sized to out-cover it, so if that cut moves these
 * three have to move with it — the over-cover assertions are the only thing
 * standing between a recess and a hole straight through the car.
 */
const APERTURE = {
  halfW: R.lampInnerX,
  loY: R.tailgateBottomY + 0.020,
  hiY: R.lampTopY,
} as const;

/** Centre of the aperture: panel, ribs and plate are all centred in it. */
const CENTER_Y = (APERTURE.loY + APERTURE.hiY) / 2;

/**
 * Panel half-width. Wide enough to out-cover the aperture by 17.5 mm a side —
 * which lands under the lamp, since the hole's edge *is* `lampInnerX` and the
 * tailgate has no skin outboard of it at this height — and never narrower than
 * the plate plus 30 mm of ribbing.
 */
const HALF_W = Math.max(APERTURE.halfW + 0.0175, PLATE.widthM / 2 + 0.030);
/**
 * Panel half-height: 60 mm of ribbing above and below the plate per `US-R`,
 * and never less than 12 mm of over-cover on the aperture. As built the two
 * agree at 136 mm, which leaves 48 mm of ribbing showing through the hole
 * above and below the plate — see the stream report on growing the aperture.
 */
const HALF_H = Math.max((APERTURE.hiY - APERTURE.loY) / 2 + 0.012, PLATE.heightM / 2 + 0.060);

/**
 * Depths, all measured IN from the painted skin — at the tail, +z is into the
 * car. The moulding is recessed, which is what the real one does and what the
 * aperture now allows: rib crests 11.5 mm in, the dark band between them 20 mm
 * in, the slab that closes the hole behind that, and the plate on pads 7 mm in
 * so its embossed characters still clear the skin by 1.5 mm. Raycast against
 * the built scene: crest 12.4, plate field 5.0, characters 1.5.
 *
 * The rib field out-covers the aperture on its own (±173.5 mm against the
 * hole's ±165; y 0.6665…0.9265 against 0.672…0.920), so it is the RIBS the eye
 * reads as the floor of the recess. The slab behind them is a backstop for
 * oblique angles, and is never seen head-on.
 *
 * Before the aperture existed this panel was applied *on top of* a solid
 * tailgate, and these numbers were the other way round — a pocket cut relative
 * to the analytic rear surface is simply buried behind the sheet metal, and
 * every rib in it was invisible with only the plate poking through.
 */
const PANEL_RECESS = 0.018;
/** Thickness of the slab that closes the aperture behind the ribs. */
const PANEL_THICK = 0.009;
/** How far a rib stands out of the recess datum, and the pitch between ribs. */
const RIB_OUT = 0.0065;
/**
 * How far a rib's own back plane sits behind the datum. This is the shadowed
 * band between crests — the surface that reads as the bottom of the relief.
 */
const RIB_BACK = 0.002;
const RIB_PITCH = 0.026;
/**
 * Where the backing slab's face sits, 2 mm behind the ribs' back plane.
 *
 * It cannot simply sit on the datum. `roundedBox` triangulates its flat face
 * from the outline alone — there are no interior vertices — so `conform` can
 * only move that face's perimeter, and the middle of it ends up a chord across
 * a curved surface, bowing ~6 mm deeper. At the perimeter the bow goes to zero,
 * and a slab placed on the datum would surface 2 mm in FRONT of the very rib it
 * is supposed to back. Referencing it to the ribs keeps it behind them
 * everywhere, which is the only thing this slab has to do.
 *
 * 2 mm rather than 1 because each rib is laid on `rearFaceZ` at its own row's
 * centre while the slab is conformed per vertex: over a 26 mm cell the two
 * disagree by up to a millimetre, and 1 mm of nominal clearance measured out
 * at 0.1 in the worst cell.
 */
const FLOOR = PANEL_RECESS + RIB_BACK + 0.002;
/** Plate mounting face, in from the skin — on pads, clear of the rib crests. */
const PLATE_SET = 0.007;

/**
 * Where the rear plate goes, and how far it has to lean to lie on the panel.
 *
 * `mountPlate` turns a rear plate through π about Y before applying the tilt,
 * which reverses the sense of the rotation — hence the negation. The angle is
 * taken across the plate's own height rather than from a local derivative,
 * because the body's rear-face blend has a shallow crease near this station
 * and a two-point chord is what the plate would actually sit on.
 */
export function rearPlateMount(): { centre: [number, number, number]; tiltDeg: number } {
  const span = PLATE.heightM / 2;
  const dz = rearFaceZ(0, CENTER_Y + span) - rearFaceZ(0, CENTER_Y - span);
  const tiltDeg = -Math.atan2(dz, 2 * span) / DEG;
  return { centre: [0, CENTER_Y, rearFaceZ(0, CENTER_Y) + PLATE_SET], tiltDeg };
}

/**
 * One rib. This is a louvre, not a corrugation: a bar standing out of the
 * floor with a vertical front face, an underside that faces down into its own
 * shadow, and a top face raked back at about 38° so it takes the sky. Below
 * each bar is 11 mm of open floor, which is the dark part.
 *
 * The first attempt made the rib a gentle ramp across the whole pitch. It was
 * geometrically present and completely invisible: every face ended up within
 * 12° of the panel's own normal, so under a sky dome nothing on it shaded
 * differently from the floor behind it. What makes a ribbed panel read is the
 * angle between adjacent faces, not the depth of the relief.
 */
function ribGeometry(halfW: number): THREE.BufferGeometry {
  const h = RIB_PITCH / 2;
  // (out from the recess datum, y about the cell centre). The back sits
  // `RIB_BACK` *inside* the datum, and the slab is referenced to that rather
  // than to the datum, so the two can never co-plane and z-fight.
  const section: Pt[] = [
    [-RIB_BACK, -h],
    [-RIB_BACK, -h + 0.0110],
    [RIB_OUT * 0.94, -h + 0.0122],
    [RIB_OUT, -h + 0.0175],
    [RIB_OUT * 0.35, -h + 0.0245],
    [-RIB_BACK, h],
  ];
  const frames: Frame[] = [];
  for (let i = 0; i <= 3; i++) {
    const x = -halfW + (2 * halfW * i) / 3;
    frames.push({
      o: new THREE.Vector3(x, 0, 0),
      // Section-right is out of the panel, i.e. away from the car.
      r: new THREE.Vector3(0, 0, -1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }
  // `flip`: sweeping along +X with the section's right axis pointing out of
  // the car gives the opposite handedness to the rest of this directory.
  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, flip: true });
}

export interface TailgatePanelResult {
  group: THREE.Group;
  /** Ribbed panel + plate ride on the tailgate, so they open with it. */
  riders: THREE.Object3D[];
}

export function buildTailgatePanel(ctx: BuildContext): TailgatePanelResult {
  const group = new THREE.Group();
  group.name = 'tailgateCentrePanel';
  const dark = ctx.materials.blackTrim();

  // --- the moulding itself -------------------------------------------------
  // The back of the recess: a soft-edged slab sitting `FLOOR` behind the skin
  // and lapping the aperture on all four sides, so the hole closes on the
  // moulding rather than on daylight. Conformed vertex by vertex, because the
  // rear surface creases near this station — though only its perimeter has
  // vertices to conform, which is why `FLOOR` is referenced to the ribs.
  //
  // `roundedBox` adds its bevel outside the extrusion, so the solid it returns
  // is NOT centred in depth — it runs [−(d/2 + r), d/2 − r], and its frontmost
  // plane is the flat face, inset by r, with the full-size rim r behind it.
  // Placing it from its own bounds rather than assuming is the difference
  // between a slab that backs the ribs and one buried 4 mm further in.
  const slab = roundedBox(HALF_W * 2, HALF_H * 2, PANEL_THICK, 0.004, 3);
  slab.computeBoundingBox();
  const front = slab.boundingBox!.min.z;
  slab.translate(0, CENTER_Y, FLOOR - front);
  conform(slab);
  group.add(mesh('tailgateRibPanel', slab, dark));

  // --- the ribs ------------------------------------------------------------
  // The rear face is flat across this span (the body's blend is driven by the
  // y-edge here, not the x-edge), so one straight rib serves every row and the
  // whole field is a single instanced draw.
  const ribHalfW = HALF_W - 0.009;
  const rows: number[] = [];
  const first = CENTER_Y - HALF_H + RIB_PITCH * 0.75;
  for (let y = first; y <= CENTER_Y + HALF_H - RIB_PITCH * 0.4; y += RIB_PITCH) rows.push(y);

  // Ten ribs of 48 triangles. An InstancedMesh would be the same single draw
  // call and the same 480 rasterised triangles, and `Car.build` forces
  // `frustumCulled` back on afterwards — which an InstancedMesh answers from a
  // bounding sphere that knows nothing about its instance offsets. One merged
  // static mesh is the same cost without that trap.
  const ribGeo = ribGeometry(ribHalfW);
  const laid: THREE.BufferGeometry[] = [];
  for (const y of rows) {
    const g = ribGeo.clone();
    g.translate(0, y, rearFaceZ(0, y) + PANEL_RECESS);
    laid.push(g);
  }
  group.add(mesh('tailgateRibs', merge(laid), dark));

  // --- plate mounting pads -------------------------------------------------
  // Four small bosses under the plate's bolt holes, so the plate stands off the
  // ribs on something rather than floating over them.
  const pads: THREE.BufferGeometry[] = [];
  const padH = FLOOR - PLATE_SET;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const y = CENTER_Y + sy * PLATE.heightM * 0.395;
      // `rotateX` puts the cylinder's +y end at +z, i.e. into the car: the
      // wider end is the one rooted in the floor.
      const pad = new THREE.CylinderGeometry(0.012, 0.010, padH, 10);
      pad.rotateX(Math.PI / 2);
      pad.translate(sx * PLATE.widthM * 0.441, y, rearFaceZ(0, y) + PLATE_SET + padH / 2);
      pads.push(pad);
    }
  }
  group.add(mesh('tailgatePlatePads', merge(pads), dark));

  return { group, riders: [group] };
}

/**
 * Lay a geometry built flat onto the body's rear surface.
 *
 * The bounds have to be rebuilt afterwards, and that is not housekeeping.
 * `roundedBox` is measured here before it is placed, so `geometry.boundingBox`
 * is already populated; `translate` refreshes it, but moving the vertices by
 * hand does not. Leaving it stale left `tailgateRibPanel` reporting
 * z [+0.022, +0.031] — the FRONT-AXLE plane, 3.8 m from where the mesh
 * actually draws — which is what `docs/CRITIQUE-2.md` §6 measured. A stale box
 * is not cosmetic: `Mesh.raycast` early-outs on it, so the panel was
 * unhittable, and it is the same class of bug as round one's stranded
 * `fritDots`.
 */
function conform(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) + rearFaceZ(pos.getX(i), pos.getY(i)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

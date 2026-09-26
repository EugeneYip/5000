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
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { PLATE } from '@/spec';
import type { BuildContext } from '@/types';
import { rearFaceZ } from './bodyref';
import { DEG, merge, mesh, roundedBox, sweep, type Frame, type Pt } from './util';

const R = HP.rear;

/** Centre of the lamp band: the plate is centred on it on every reference. */
const CENTER_Y = (R.lampTopY + R.lampBottomY) / 2;

/**
 * Lamp edge to lamp edge, tucked a few millimetres under each aperture so no
 * painted sliver survives between panel and lens. The floor keeps the plate
 * from touching the ribs if the lamp aperture ever closes in further.
 */
const HALF_W = Math.max(R.lampInnerX + 0.005, PLATE.widthM / 2 + 0.030);
/** 60 mm of ribbing above and below the plate, per `US-R`. */
const HALF_H = PLATE.heightM / 2 + 0.060;

/**
 * The real moulding is *recessed* into the tailgate. This one is applied on
 * top of it, standing 1.5 mm proud, because the body stream's tailgate skin is
 * solid across this span — there is no aperture to recess into, and a pocket
 * cut relative to the analytic rear surface is simply buried behind the sheet
 * metal. (That is not hypothetical: the first version of this file built the
 * recess correctly and every rib in it was invisible, hidden 10 mm inside the
 * panel, with only the plate poking through.) Reported — the proper fix is an
 * aperture in `tailgatePanel`, after which these four numbers flip sign.
 */
const PANEL_PROUD = 0.0015;
/** How far the moulding's back is buried, so no edge gap opens on the rake. */
const PANEL_BACK = 0.008;
/** How far a rib stands out of the panel face, and the pitch between ribs. */
const RIB_OUT = 0.0065;
const RIB_PITCH = 0.026;
/** Plate centre, out from the painted skin — clear of the rib crests. */
const PLATE_PROUD = 0.0105;

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
  return { centre: [0, CENTER_Y, rearFaceZ(0, CENTER_Y) - PLATE_PROUD], tiltDeg };
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
  // (out from the panel floor, y about the cell centre). The back sits 2 mm
  // *inside* the floor so the two surfaces never co-plane and z-fight.
  const section: Pt[] = [
    [-0.002, -h],
    [-0.002, -h + 0.0110],
    [RIB_OUT * 0.94, -h + 0.0122],
    [RIB_OUT, -h + 0.0175],
    [RIB_OUT * 0.35, -h + 0.0245],
    [-0.002, h],
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
  // A soft-edged slab lying on the tailgate. Conformed vertex by vertex, so
  // the back stays buried where the rear surface creases near this station.
  const slab = roundedBox(HALF_W * 2, HALF_H * 2, PANEL_PROUD + PANEL_BACK, 0.004, 3);
  slab.translate(0, CENTER_Y, (PANEL_BACK - PANEL_PROUD) / 2);
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
    g.translate(0, y, rearFaceZ(0, y) - PANEL_PROUD);
    laid.push(g);
  }
  group.add(mesh('tailgateRibs', merge(laid), dark));

  // --- plate mounting pads -------------------------------------------------
  // Four small bosses under the plate's bolt holes, so the plate stands off the
  // ribs on something rather than floating over them.
  const pads: THREE.BufferGeometry[] = [];
  const padH = PLATE_PROUD - PANEL_PROUD;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const y = CENTER_Y + sy * PLATE.heightM * 0.395;
      const pad = new THREE.CylinderGeometry(0.010, 0.012, padH, 10);
      pad.rotateX(Math.PI / 2);
      pad.translate(sx * PLATE.widthM * 0.441, y, rearFaceZ(0, y) - PANEL_PROUD - padH / 2);
      pads.push(pad);
    }
  }
  group.add(mesh('tailgatePlatePads', merge(pads), dark));

  return { group, riders: [group] };
}

/** Lay a geometry built flat onto the body's rear surface. */
function conform(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) + rearFaceZ(pos.getX(i), pos.getY(i)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

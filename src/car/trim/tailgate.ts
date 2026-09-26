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
import { DEG, dish, merge, mesh, sweep, type Frame, type Pt } from './util';

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

/** How deep the moulding is set into the tailgate skin. */
const RECESS = 0.018;
/** Rib crest above the panel floor, and the pitch between crests. */
const RIB_OUT = 0.0075;
const RIB_PITCH = 0.026;
/** The plate's own face, measured in from the painted skin. */
const PLATE_INSET = 0.004;

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
  return { centre: [0, CENTER_Y, rearFaceZ(0, CENTER_Y) + PLATE_INSET], tiltDeg };
}

/**
 * One rib: a horizontal ridge whose upper edge takes the light and whose
 * undercut throws the shadow line below it. Swept along X rather than boxed,
 * so the crest is a single continuous highlight instead of a row of facets.
 */
function ribGeometry(halfW: number): THREE.BufferGeometry {
  const h = RIB_PITCH / 2;
  // (out from the panel floor, y about the rib centre). The back sits 2 mm
  // *inside* the floor so the two surfaces never co-plane and z-fight.
  const section: Pt[] = [
    [-0.002, -h],
    [0.0014, -h + 0.0016],
    [RIB_OUT * 0.55, -h + 0.0060],
    [RIB_OUT, h - 0.0050],
    [RIB_OUT * 0.82, h - 0.0012],
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

  // --- the recess ----------------------------------------------------------
  // One displaced grid rather than a swept wall plus a floor: a pocket made of
  // two pieces has a seam to keep watertight at every station, and this one is
  // going to be almost entirely covered by ribs anyway.
  const pocket = dish(HALF_W * 2, HALF_H * 2, RECESS, {
    shape: 6,
    rim: 0.0012,
    floor: 0.94,
    seg: 44,
  });
  // Built facing +Z; turn it to face the tail, then lay it on the rear skin.
  pocket.rotateY(Math.PI);
  pocket.translate(0, CENTER_Y, 0);
  conform(pocket);
  group.add(mesh('tailgateRibPanelRecess', pocket, dark));

  // --- the ribs ------------------------------------------------------------
  // The rear face is flat across this span (the body's blend is driven by the
  // y-edge here, not the x-edge), so one straight rib serves every row and the
  // whole field is a single instanced draw.
  const ribHalfW = HALF_W - 0.007;
  const rows: number[] = [];
  const first = CENTER_Y - HALF_H + RIB_PITCH * 0.75;
  for (let y = first; y <= CENTER_Y + HALF_H - RIB_PITCH * 0.4; y += RIB_PITCH) rows.push(y);

  const ribGeo = ribGeometry(ribHalfW);
  const laid: THREE.BufferGeometry[] = [];
  for (const y of rows) {
    const g = ribGeo.clone();
    g.translate(0, y, rearFaceZ(0, y) + RECESS);
    laid.push(g);
  }
  group.add(mesh('tailgateRibs', merge(laid), dark));

  // --- plate mounting pads -------------------------------------------------
  // Four small bosses under the plate's bolt holes, so the plate stands off the
  // ribs on something rather than floating over them.
  const pads: THREE.BufferGeometry[] = [];
  const padZ = rearFaceZ(0, CENTER_Y) + PLATE_INSET;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const y = CENTER_Y + sy * PLATE.heightM * 0.395;
      const pad = new THREE.CylinderGeometry(0.010, 0.012, RECESS - PLATE_INSET, 10);
      pad.rotateX(Math.PI / 2);
      pad.translate(sx * PLATE.widthM * 0.441, y, padZ + (RECESS - PLATE_INSET) / 2);
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

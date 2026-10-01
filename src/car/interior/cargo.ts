/**
 * The Avant's load bay.
 *
 * Factory copy for the wagon: "Carpeted cargo area with removable folding
 * cover · Three separate storage compartments in cargo area". All of it is
 * here — the carpeted flat floor with its recessed centre locker, a
 * compartment in each side trim, the lashing eyes, the ribbed scuff plate at
 * the sill, and the roller blind in its spring-loaded cassette behind the
 * rear seat backrest, with end pins dropping into brackets in the side trims.
 *
 * It is left retracted, which is how you see the bay through the tailgate
 * glass; `cargoCover` pulls it back to its trailing bar at the aperture.
 *
 * The tailgate's own inner trim is here too — see `buildTailgateInner()` for
 * why it is in this file and what it is still waiting on.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext } from '@/types';
import { HP } from '@/car/hardpoints';
import { rearFaceZ, rearHalfWidth } from '@/car/body/panels';
import { CABIN, TONE } from './layout';
import { clamp, cyl, fbm, lerp, merge, mesh, mirrored, roundedBox, roundedRect, smoothstep, surface } from './util';
import type { StaticBatch } from './batch';

const FY = CABIN.cargoFloorY;
const Z0 = CABIN.cargoFloorFrontZ;
const Z1 = CABIN.cargoFloorRearZ;
const HW = CABIN.cargoHalfW;

/** Rear arch intrusion, as a height above the load floor. */
function archBulge(x: number, z: number): number {
  const along = 1 - clamp(Math.abs((z + 2.687) / 0.395) ** 1.6, 0, 1);
  const across = smoothstep(0.455, 0.60, Math.abs(x));
  return along * across * 0.155;
}

// ---------------------------------------------------------------------------
// Tailgate inner trim and gas struts
// ---------------------------------------------------------------------------

/** Standoff of the trim card from the tailgate's outer skin. */
const CARD_GAP = 0.028;
/** Card runs from the bottom shutline rim up to the backlight sill. */
const CARD_Y0 = 0.676;
const CARD_Y1 = 1.006;
/** External lock barrel, measured on `bat_rear_straight.jpg`; see below. */
const LOCK_Y = 0.704;

/**
 * Half-width of the trim card at height `y`.
 *
 * Deliberately `tailgateHalfWidth()` from `body.ts` with an inset, because
 * that is the panel the card covers: full width above the taillamps, necking
 * to the lamps' inner edge below them, which is where the tailgate becomes a
 * plate-width tongue running down between the lamps. Reading the panel's own
 * rule rather than typing a width means the card cannot overhang the panel if
 * the lamp aperture moves.
 */
function cardHalfW(y: number): number {
  const full = rearHalfWidth(y) - 0.026;
  const k = clamp((y - HP.rear.lampTopY) / 0.020, 0, 1);
  return lerp(Math.min(HP.rear.lampInnerX - 0.010, full), full, k * k * (3 - 2 * k));
}

/**
 * The tailgate's inner trim card, its latch surround, and the two gas struts.
 *
 * ### Why this is a defect and not a nicety
 *
 * `renders/crit4/c4_bay.png`, camera inside looking aft: **"Audi 5000 S",
 * the four rings and "fuel injection" all read in mirror image across the
 * tailgate's lower panel from inside the car.** The tailgate skin is a
 * one-sided `facePatch`, so from behind it is simply not there, and what the
 * eye reaches is the back of the badge letters. There was no inner card at
 * all, so nothing stood between them and the cabin.
 *
 * ### What is built, and what could not be verified
 *
 * The card covers the whole painted lower half: the full-width band above the
 * taillamps that carries the badges, and the plate-width tongue below it. The
 * latch surround goes at the bottom centre, at **y 0.704** — measured off
 * `bat_rear_straight.jpg`, where the external lock barrel sits between the
 * plate recess and the tailgate's bottom shutline, 35 px above a shutline
 * 180 px below the badge band, i.e. 52 mm above 0.652 at 1.49 mm/px.
 *
 * The pull feature is a **moulded trough in the card above the latch**, not a
 * separate grab handle. That is a deliberate read of the evidence rather than
 * a shortcut: CRITIQUE-4 §10 asks for a grab handle, and **no reference
 * photograph in `scratchpad/ref3/` shows the tailgate's inner lower panel at
 * all.** `bat_tailgate_open_spoiler.jpg` has the tailgate open past vertical,
 * so only its header trim, hinges and wiper motor cover are in frame, and
 * `bat_cargo_area.jpg` crops the tailgate off the top. Modelling a handle
 * whose existence, shape and position are all unknown is how the climate head
 * and these louvres got built wrong; a trough costs nothing extra because it
 * is a modulation of a surface the card needs anyway.
 *
 * Material is the felt the header trim plainly is in
 * `bat_tailgate_open_spoiler.jpg` — coarse dark needle-felt, not moulded
 * plastic — which also means the card merges into the load floor's carpet
 * bucket and costs **no extra draw**.
 *
 * ### What this still needs from outside the stream
 *
 * All of it is in the **closed** position and in the static batch, because
 * `buildCargo` cannot reach the node it should hang off. `body.ts` publishes
 * `nodes.tailgatePivot` and the `tailgate` articulation turns it, but
 * `Car.build` collects part `nodes` into `car.nodes` *after* each builder
 * returns and `BuildContext` carries no way to read them, so the interior —
 * which builds sixth, long after the body — has no reference to it. One field
 * on `BuildContext` closes it; see the stream report. Until then the card is
 * correct at rest, which is the state every review pose and the acceptance
 * gate use, and is left behind if a viewer opens the tailgate.
 */
function buildTailgateInner(hard: THREE.BufferGeometry[], brights: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const felt: THREE.BufferGeometry[] = [];
  const zAt = (x: number, y: number): number => rearFaceZ(x, y) + CARD_GAP;

  /**
   * Pull trough above the latch: a horizontal moulded dish you hook your
   * fingers into to swing the tailgate down. 22 mm deep over 190 mm.
   */
  const trough = (x: number, y: number): number =>
    0.022 * (1 - smoothstep(0.070, 0.095, Math.abs(x))) * (1 - smoothstep(0.0, 0.026, Math.abs(y - 0.792)));

  // -- the tongue, between the taillamps ------------------------------------
  const tongueHW = HP.rear.lampInnerX - 0.010;
  felt.push(surface(8, 14, false, (i, j, out) => {
    const x = lerp(-tongueHW, tongueHW, i / 8);
    const y = lerp(CARD_Y0, HP.rear.lampTopY + 0.004, j / 14);
    // Edges roll aft onto the panel so the card never shows a raw edge.
    const roll = smoothstep(0.86, 1.0, Math.abs(x) / tongueHW) * 0.018;
    out.set(x, y, zAt(x, y) - trough(x, y) - roll);
  }));

  // -- the band above them, which is what the badges read through -----------
  felt.push(surface(28, 8, false, (i, j, out) => {
    const y = lerp(HP.rear.lampTopY, CARD_Y1, j / 8);
    const hw = cardHalfW(y);
    const x = lerp(-hw, hw, i / 28);
    const roll = smoothstep(0.90, 1.0, Math.abs(x) / hw) * 0.020
      + smoothstep(0.88, 1.0, j / 8) * 0.012;
    // A pressed panel with a card over it is never flat.
    out.set(x, y, zAt(x, y) - roll + fbm(x * 6, 3.1, y * 7, 2) * 0.0016);
  }));

  // -- latch surround -------------------------------------------------------
  const zLock = zAt(0, LOCK_Y);
  const outline = roundedRect(0.076, 0.052, 0.008, 3);
  outline.holes.push(new THREE.Path(roundedRect(0.048, 0.026, 0.005, 3).getPoints(3)));
  const esc = new THREE.ExtrudeGeometry(outline, {
    depth: 0.007, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015,
    bevelSegments: 1, curveSegments: 3, steps: 1,
  });
  esc.computeVertexNormals();
  esc.translate(0, LOCK_Y, zLock + 0.0015);
  hard.push(esc);
  // Behind the aperture: the latch body, with the claw that takes the striker.
  const latchBox = roundedBox(0.052, 0.030, 0.026, 0.002, 1, 1);
  latchBox.translate(0, LOCK_Y, zLock - 0.010);
  hard.push(latchBox);
  const claw = roundedBox(0.030, 0.008, 0.012, 0.002, 1, 2);
  claw.translate(0, LOCK_Y - 0.007, zLock - 0.004);
  brights.push(claw);

  // -- gas struts -----------------------------------------------------------
  // Anchors, with the tailgate closed. The tailgate end is 470 mm from the
  // hinge along the tailgate's own side rail, which makes the strut 380 mm
  // shut and 550 mm at the 0.94 rad `body.ts` opens to — a 170 mm stroke, a
  // real strut's numbers. `bat_tailgate_open_spoiler.jpg` shows about 500 mm
  // of extended strut with its lower end running behind the aperture frame.
  //
  // x is 30 mm outboard of `tailgateGlassHalfW`: the strut has to clear the
  // backlight, and in the photograph it runs just inside the tailgate's side
  // rail, which is exactly that band.
  const sx = HP.glass.tailgateGlassHalfW + 0.030;
  for (const s of [-1, 1]) {
    const bodyEnd = new THREE.Vector3(s * sx, 1.205, -3.010);
    const gateEnd = new THREE.Vector3(s * sx, 1.180, -3.389);
    const axis = gateEnd.clone().sub(bodyEnd);
    const len = axis.length();
    const mid = bodyEnd.clone().addScaledVector(axis, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), axis.clone().normalize(),
    );
    const place = (g: THREE.BufferGeometry, along: number): THREE.BufferGeometry => {
      g.applyQuaternion(q);
      g.translate(
        mid.x + axis.x * along, mid.y + axis.y * along, mid.z + axis.z * along,
      );
      return g;
    };
    // Cylinder on the body end, bright rod out of it to the tailgate: the
    // fat half is nearest the body anchor in the photograph.
    hard.push(place(cyl(0.0105, 0.0105, len * 0.60, 8), -0.20));
    brights.push(place(cyl(0.0042, 0.0042, len * 0.46, 6), 0.27));
    for (const [r, along] of [[0.0075, -0.5], [0.0075, 0.5]] as const) {
      hard.push(place(cyl(r, r, 0.016, 6), along));
    }
  }

  return felt;
}

export function buildCargo(ctx: BuildContext, batch: StaticBatch): { group: THREE.Group; articulations: Articulation[] } {
  const group = new THREE.Group();
  group.name = 'cargo';

  const carpet = ctx.materials.carpet();
  const trim = ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.82 });
  const dark = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 });
  const bright = ctx.materials.chrome({ roughness: 0.30 });
  const vinyl = ctx.materials.interiorPlastic({ color: TONE.leatherette, roughness: 0.68 });

  // -- floor ----------------------------------------------------------------
  // Flat and carpeted, with the recessed locker lid set into the centre.
  const floor = surface(34, 30, false, (i, j, out) => {
    const x = lerp(-HW, HW, i / 34);
    const z = lerp(Z0, Z1, j / 30);
    const inLid = (1 - smoothstep(0.176, 0.196, Math.abs(x))) * smoothstep(-3.30, -3.27, z) * (1 - smoothstep(-2.95, -2.92, z));
    const y = FY - inLid * 0.0035 + archBulge(x, z) * 0.14
      + fbm(x * 8, 5.5, z * 6, 2) * 0.0022;
    out.set(x, y, z);
  });
  const hard: THREE.BufferGeometry[] = [];
  const brights: THREE.BufferGeometry[] = [];

  // Load floor and cabin floor are the same cut pile and the same rigid body,
  // and so is the tailgate's inner card — one carpet bucket, one draw.
  batch.add(carpet, floor, ...buildTailgateInner(hard, brights));

  // Flush latch for the locker.
  const latch = roundedBox(0.062, 0.006, 0.030, 0.002, 1, 2);
  latch.translate(0, FY + 0.001, -2.945);
  brights.push(latch);

  // -- side trims -----------------------------------------------------------
  const sideTrim = surface(6, 26, false, (i, j, out) => {
    const v = j / 26;
    const z = lerp(Z0 - 0.01, Z1 + 0.02, v);
    const prof: Array<[number, number]> = [
      [0.000, FY - 0.004], [0.006, FY + 0.050], [0.020, FY + 0.130],
      [0.026, FY + 0.240], [0.020, FY + 0.318], [0.006, FY + 0.352], [0.010, FY + 0.372],
    ];
    const q = prof[i];
    // The arch pushes the trim inboard, which is why an estate's load width
    // is quoted between the arches and not at the tailgate.
    const arch = archBulge(HW, z) * (1 - smoothstep(0.0, 0.26, q[1] - FY)) * 1.1;
    // Storage compartment door, one per side.
    const door = (1 - smoothstep(0.30, 0.34, Math.abs(z + 3.20))) * smoothstep(0.05, 0.09, q[1] - FY) * (1 - smoothstep(0.20, 0.24, q[1] - FY));
    out.set(-(HW + 0.014 - q[0] - arch - door * 0.006), q[1], z);
  });
  batch.add(trim, merge([sideTrim, mirrored(sideTrim)]));

  // Lashing eyes: bright D-rings on plates, one at each rear corner.
  for (const sx of [-1, 1]) {
    for (const z of [-2.585, -3.475]) {
      const plate = roundedBox(0.044, 0.005, 0.030, 0.002, 1, 2);
      plate.translate(sx * 0.545, FY + 0.002, z);
      brights.push(plate);
      const ringG = new THREE.TorusGeometry(0.0125, 0.0022, 6, 16, Math.PI);
      ringG.rotateY(Math.PI / 2);
      ringG.translate(sx * 0.545, FY + 0.005, z);
      brights.push(ringG);
    }
  }

  // Ribbed scuff plate along the tailgate sill.
  const scuff = surface(30, 6, false, (i, j, out) => {
    const x = lerp(-0.60, 0.60, i / 30);
    const v = j / 6;
    const rib = 0.0016 * (0.5 - 0.5 * Math.cos(x * Math.PI * 2 * 26));
    out.set(x, FY + 0.018 * v + rib, lerp(Z1 + 0.004, Z1 + 0.040, v));
  });
  brights.push(scuff);

  // -- cargo cover ----------------------------------------------------------
  // A spring-loaded cassette on end pins, exactly as the factory describes it.
  const cassY = 0.952;
  // Immediately behind the backrest, which at cover height is back at -2.58.
  const cassZ = -2.628;
  const cassette = cyl(0.030, 0.030, 1.202, 20);
  cassette.rotateZ(Math.PI / 2);
  cassette.translate(0, cassY, cassZ);
  hard.push(cassette);
  for (const sx of [-1, 1]) {
    const bracket = roundedBox(0.020, 0.052, 0.046, 0.006, 1, 2);
    bracket.translate(sx * 0.612, cassY, cassZ);
    hard.push(bracket);
  }

  const zA = cassZ - 0.030;
  const zB = Z1 + 0.030;
  const blind = new THREE.Group();
  blind.name = 'cargoCover';
  group.add(blind);
  const web = surface(2, 16, false, (i, j, out) => {
    const v = j / 16;
    const x = lerp(-0.588, 0.588, i / 2);
    // A blind under spring tension still sags a little across its width.
    out.set(x, cassY - 0.0008 - 0.006 * (1 - (x / 0.588) ** 2) * v, lerp(zA, zB, v));
  });
  const webMesh = mesh(web, vinyl, 'cargoBlind');
  blind.add(webMesh);
  const bar = roundedBox(1.186, 0.022, 0.030, 0.008, 2, 3);
  bar.translate(0, cassY - 0.008, zB);
  const barMesh = mesh(bar, dark, 'cargoCoverBar');
  blind.add(barMesh);
  // Retracted by default: the bay is what makes the car read as an estate.
  blind.visible = false;

  // The blind and its bar stay out of the batch: they are on the `cargoCover`
  // articulation and have to keep moving.
  batch.add(dark, merge(hard));
  batch.add(bright, merge(brights));

  const articulations: Articulation[] = [{
    name: 'cargoCover',
    value: 0,
    target: 0,
    duration: 0.9,
    apply: (v) => {
      // Scale about the cassette end, so the blind unrolls out of it rather
      // than growing from the middle.
      blind.visible = v > 0.02;
      webMesh.scale.z = Math.max(0.02, v);
      webMesh.position.z = zA * (1 - v);
      barMesh.position.z = (zB - zA) * (v - 1);
    },
  }];
  return { group, articulations };
}

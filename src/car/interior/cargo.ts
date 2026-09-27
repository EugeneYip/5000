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
 */

import * as THREE from 'three';
import type { Articulation, BuildContext } from '@/types';
import { CABIN, TONE } from './layout';
import { clamp, cyl, fbm, lerp, merge, mesh, mirrored, roundedBox, smoothstep, surface } from './util';
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
  // Load floor and cabin floor are the same cut pile and the same rigid body.
  batch.add(carpet, floor);

  const hard: THREE.BufferGeometry[] = [];
  const brights: THREE.BufferGeometry[] = [];

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

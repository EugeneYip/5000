/**
 * The things that are only missed when they are absent: visors, mirror, grab
 * handles, lamps, coat hooks — and the seat belts, which matter more than any
 * of them, because a belt hanging slack down the B-pillar is the single most
 * reliable cue that a cabin is a real one and not a stage set.
 *
 * MY1988 has height-adjustable front shoulder belts, so the upper anchor is a
 * slider on a short rail. The automatic tensioners are procon-ten's, and they
 * arrive with the facelift: not this car.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { HP } from '@/car/hardpoints';
import { CABIN, TONE, headlinerY } from './layout';
import { cyl, merge, roundedBox, slab, surface, tube, type Vec3 } from './util';
import type { StaticBatch } from './batch';

/**
 * A flat woven ribbon along a path. Frenet frames twist unpredictably on a
 * nearly straight run, so the width axis is given explicitly and simply
 * orthogonalised against the tangent — a belt lies flat on its pillar.
 */
function ribbon(points: Vec3[], widthDir: Vec3, width: number, thick: number, steps = 16): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.4);
  const wd = new THREE.Vector3(...widthDir).normalize();
  const t = new THREE.Vector3();
  const w = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  // Twelve points, not four: with only the corners the averaged vertex
  // normals tilt 45 degrees and a flat black belt shades like chrome.
  const sec: Array<[number, number]> = [
    [-0.5, -0.42], [-0.42, -0.5], [-0.2, -0.5], [0.2, -0.5], [0.42, -0.5], [0.5, -0.42],
    [0.5, 0.42], [0.42, 0.5], [0.2, 0.5], [-0.2, 0.5], [-0.42, 0.5], [-0.5, 0.42],
  ];
  return surface(sec.length, steps, true, (i, j, out) => {
    const s = j / steps;
    curve.getPoint(s, p);
    curve.getTangent(s, t);
    w.copy(wd).addScaledVector(t, -wd.dot(t)).normalize();
    n.crossVectors(t, w).normalize();
    const q = sec[i % sec.length];
    out.copy(p).addScaledVector(w, q[0] * width).addScaledVector(n, q[1] * thick);
  });
}

function frontBelt(sx: number): { web: THREE.BufferGeometry; hard: THREE.BufferGeometry[]; metal: THREE.BufferGeometry[] } {
  const X = sx * 0.784;
  const Z = -1.586;
  // Hanging free: out of the slider, down the pillar, into the reel, with the
  // slight inboard bow that unused webbing always takes.
  const web = ribbon(
    [
      [X - sx * 0.004, 1.040, Z + 0.004],
      [X - sx * 0.013, 0.905, Z + 0.001],
      [X - sx * 0.016, 0.742, Z - 0.004],
      [X - sx * 0.009, 0.575, Z - 0.008],
      [X - sx * 0.001, 0.452, Z - 0.006],
    ],
    [0, 0, 1], 0.047, 0.0016, 18,
  );

  const hard: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // Height-adjustable upper anchor on its rail.
  const rail = roundedBox(0.016, 0.130, 0.036, 0.006, 1, 2);
  rail.translate(sx * 0.790, 1.060, Z);
  hard.push(rail);
  const slider = roundedBox(0.022, 0.044, 0.048, 0.008, 2, 3);
  slider.translate(sx * 0.784, 1.048, Z);
  hard.push(slider);
  const reel = roundedBox(0.030, 0.088, 0.078, 0.010, 1, 3);
  reel.translate(sx * 0.788, 0.418, Z - 0.004);
  hard.push(reel);

  // The tongue, parked where it falls on the webbing.
  const tongue = roundedBox(0.010, 0.056, 0.038, 0.004, 1, 3);
  tongue.rotateZ(sx * 0.06);
  tongue.translate(X - sx * 0.016, 0.878, Z + 0.001);
  metal.push(tongue);

  // Buckle stalk, inboard of the seat.
  const stalk = roundedBox(0.020, 0.096, 0.030, 0.008, 1, 2);
  stalk.rotateX(-0.20);
  stalk.rotateZ(-sx * 0.16);
  stalk.translate(sx * 0.196, 0.572, -1.238);
  hard.push(stalk);
  const head = roundedBox(0.030, 0.058, 0.034, 0.010, 2, 3);
  head.rotateX(-0.20);
  head.rotateZ(-sx * 0.16);
  head.translate(sx * 0.206, 0.628, -1.226);
  hard.push(head);
  const release = roundedBox(0.018, 0.026, 0.008, 0.003, 1, 2);
  release.rotateX(-0.20);
  release.rotateZ(-sx * 0.16);
  release.translate(sx * 0.206, 0.638, -1.208);
  metal.push(release);

  return { web, hard, metal };
}

function rearBelt(sx: number): { web: THREE.BufferGeometry; hard: THREE.BufferGeometry[] } {
  const X = sx * 0.760;
  // On the C-pillar, between the rear door shutline and the quarter glass.
  const Z = (HP.side.doorRearZ + HP.glass.quarterRearFrontZ) / 2 - 0.006;
  const web = ribbon(
    [
      [X - sx * 0.002, 1.042, Z + 0.006],
      [X - sx * 0.010, 0.918, Z + 0.002],
      [X - sx * 0.012, 0.800, Z - 0.004],
      [X - sx * 0.004, 0.706, Z - 0.006],
    ],
    [0, 0, 1], 0.045, 0.0016, 12,
  );
  const hard: THREE.BufferGeometry[] = [];
  const anchor = roundedBox(0.020, 0.040, 0.044, 0.008, 1, 2);
  anchor.translate(sx * 0.766, 1.050, Z);
  hard.push(anchor);
  const reel = roundedBox(0.028, 0.076, 0.070, 0.010, 1, 3);
  reel.translate(sx * 0.768, 0.676, Z - 0.004);
  hard.push(reel);
  // Buckles lying on the bench cushion.
  for (const bx of [sx * 0.318, sx * 0.108]) {
    const b = roundedBox(0.030, 0.052, 0.024, 0.009, 1, 2);
    b.rotateX(0.32);
    b.translate(bx, 0.672, -2.332);
    hard.push(b);
  }
  return { web, hard };
}

export function buildDetails(ctx: BuildContext, batch: StaticBatch): void {

  const soft = ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.84 });
  const dark = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 });
  const bright = ctx.materials.chrome({ roughness: 0.28 });
  const mirrorGlass = ctx.materials.chrome({ roughness: 0.02 });
  const webbing = ctx.materials.fabric({ color: 0x1e2024 });

  const softParts: THREE.BufferGeometry[] = [];
  const darkParts: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  // -- sun visors -----------------------------------------------------------
  for (const sx of [-1, 1]) {
    const v = slab(0.272, 0.132, 0.016, 0.007, 2);
    // Stowed against the headliner but never quite flat against it.
    v.rotateX(-1.40);
    v.rotateZ(sx * 0.03);
    v.translate(sx * 0.316, headlinerY(sx * 0.316, HP.headerZ - 0.048) - 0.038, HP.headerZ - 0.048);
    softParts.push(v);
    const rod = cyl(0.0048, 0.0048, 0.286, 8);
    rod.rotateZ(Math.PI / 2);
    rod.rotateX(-1.40);
    rod.translate(sx * 0.316, headlinerY(sx * 0.316, HP.headerZ - 0.080) - 0.018, HP.headerZ - 0.080);
    metal.push(rod);
    const clip = roundedBox(0.020, 0.024, 0.016, 0.004, 1, 2);
    clip.translate(sx * 0.176, headlinerY(sx * 0.176, HP.headerZ - 0.086) - 0.026, HP.headerZ - 0.086);
    darkParts.push(clip);
  }
  // Vanity mirror on the passenger visor — the car's right, so -X.
  const vanity = slab(0.104, 0.052, 0.004, 0.002, 1);
  vanity.rotateX(-1.40);
  vanity.translate(-0.316, headlinerY(-0.316, HP.headerZ - 0.042) - 0.046, HP.headerZ - 0.042);
  metal.push(vanity);

  // -- rear-view mirror -----------------------------------------------------
  // Glued to the windscreen a hand's width below the header, which is where
  // the hardpoints put the glass — not floating off the headliner.
  const glassDir = new THREE.Vector2(HP.cowlZ - HP.headerZ, HP.cowlY - HP.headerY).normalize();
  const mz = HP.headerZ + glassDir.x * 0.092;
  const my = HP.headerY + glassDir.y * 0.092;
  const base = roundedBox(0.048, 0.030, 0.022, 0.006, 1, 2);
  base.rotateX(0.38);
  base.translate(0, my, mz);
  darkParts.push(base);
  const stem = cyl(0.0095, 0.0105, 0.058, 10);
  stem.rotateX(0.62);
  stem.translate(0, my - 0.026, mz - 0.016);
  darkParts.push(stem);
  // The head hangs a few millimetres toward the driver, which is +X.
  const headG = roundedBox(0.248, 0.062, 0.030, 0.010, 2, 3);
  headG.rotateX(0.10);
  headG.translate(0.012, my - 0.052, mz - 0.038);
  darkParts.push(headG);
  const face = slab(0.232, 0.050, 0.004, 0.002, 1);
  face.rotateX(0.10);
  face.translate(0.012, my - 0.0535, mz - 0.0525);
  batch.add(mirrorGlass, face);

  // -- grab handles ---------------------------------------------------------
  // Above the front passenger door and both rear doors; never above the
  // driver, who has the wheel.
  const handleAt = (sx: number, z: number): void => {
    const y = 1.318;
    const x = sx * 0.672;
    const path: Vec3[] = [
      [x, y + 0.004, z + 0.098],
      [x - sx * 0.020, y - 0.012, z + 0.056],
      [x - sx * 0.024, y - 0.016, z],
      [x - sx * 0.020, y - 0.012, z - 0.056],
      [x, y + 0.004, z - 0.098],
    ];
    softParts.push(tube(path, 0.0115, 7, false, 0.4));
    for (const dz of [0.104, -0.104]) {
      const boss = roundedBox(0.026, 0.020, 0.030, 0.006, 1, 2);
      boss.translate(x + sx * 0.004, y + 0.006, z + dz);
      darkParts.push(boss);
    }
  };
  // Front handle on the passenger's side only, which is -X.
  handleAt(-1, -1.320);
  handleAt(1, -2.120);
  handleAt(-1, -2.120);

  // -- lamps ----------------------------------------------------------------
  // Front and rear dome lens are the same moulding in the same material and
  // neither moves; one mesh.
  const lampLenses: THREE.BufferGeometry[] = [];
  for (const [z, w] of [[HP.headerZ - 0.29, 0.128], [-2.760, 0.104]] as Array<[number, number]>) {
    const housing = roundedBox(w + 0.020, 0.012, 0.070, 0.006, 1, 2);
    housing.translate(0, headlinerY(0, z) - 0.006, z);
    darkParts.push(housing);
    const lensG = slab(w, 0.008, 0.052, 0.003, 1);
    lensG.translate(0, headlinerY(0, z) - 0.014, z);
    lampLenses.push(lensG);
  }
  batch.add(ctx.materials.lens(0xf2f2ea, { opacity: 0.86 }), merge(lampLenses));

  // -- coat hooks and the rear pull straps ----------------------------------
  for (const sx of [-1, 1]) {
    const hook = roundedBox(0.022, 0.030, 0.014, 0.005, 1, 2);
    // Above the belt the section tumbles home hard; innerHalfW does not
    // describe it, so the hook goes on the roof-edge line instead.
    hook.translate(sx * 0.686, 1.262, HP.glass.quarterRearFrontZ - 0.018);
    darkParts.push(hook);
  }

  // -- belts ----------------------------------------------------------------
  const webs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const f = frontBelt(sx);
    webs.push(f.web);
    darkParts.push(...f.hard);
    metal.push(...f.metal);
    const r = rearBelt(sx);
    webs.push(r.web);
    darkParts.push(...r.hard);
  }
  batch.add(webbing, merge(webs));

  batch.add(soft, merge(softParts));
  batch.add(dark, merge(darkParts));
  batch.add(bright, merge(metal));
}


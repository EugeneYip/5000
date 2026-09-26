/**
 * The instrument pack.
 *
 * Geometry, needles and warning lamps over the canvas artwork in `dials.ts`.
 * Three things separate an instrument pack from a picture of one, and all
 * three are here: the face is *behind* a glossy lens with air between them,
 * every needle has a pivot boss and throws a shadow onto the dial, and the
 * needles have mass — they are driven through a spring and damper, so they
 * settle rather than snap and the tachometer sits very slightly unsteady at
 * idle, the way a five-cylinder's does.
 */

import * as THREE from 'three';
import type { BuildContext, VehicleState } from '@/types';
import { ENGINE } from '@/spec';
import { HP } from '@/car/hardpoints';
import { TONE } from './layout';
import { ARROWS, DIALS, FACE, SPEEDO_MAX, SWEEP, TACHO_MAX, drawCluster, shortSweep, tileCentre } from './dials';
import { canvasTexture, createLens, createPrinted } from './printed';
import { clamp, cyl, D2R, lerp, merge, mesh } from './util';

const C = HP.interior.clusterCenter;
/** Face rake: square to the driver's eye, which sits 16 degrees above it. */
const RAKE = 16;
const MPS_TO_MPH = 2.2369362920544;

/** Face millimetres to cluster-local metres. */
const lx = (mm: number): number => (FACE.w / 2 - mm) / 1000;
const ly = (mm: number): number => (FACE.h / 2 - mm) / 1000;
const lw = (mm: number): number => mm / 1000;

function needleBlade(len: number, rootW: number, tipW: number, tail: number, thick: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-rootW / 2, -tail);
  s.lineTo(rootW / 2, -tail);
  s.lineTo(tipW / 2, len);
  s.lineTo(0, len + tipW * 0.9);
  s.lineTo(-tipW / 2, len);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 2 });
  g.computeVertexNormals();
  return g;
}

/** Emissive lamp silhouettes, drawn as shapes so the pictogram survives. */
function lampShape(kind: 'arrowL' | 'arrowR' | 'beam' | 'bar' | 'batt'): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const m = 0.001;
  switch (kind) {
    case 'arrowL':
    case 'arrowR': {
      const d = kind === 'arrowR' ? 1 : -1;
      s.moveTo(d * 4.6 * m, 0);
      s.lineTo(-d * 0.6 * m, 4.0 * m);
      s.lineTo(-d * 0.6 * m, 1.5 * m);
      s.lineTo(-d * 4.6 * m, 1.5 * m);
      s.lineTo(-d * 4.6 * m, -1.5 * m);
      s.lineTo(-d * 0.6 * m, -1.5 * m);
      s.lineTo(-d * 0.6 * m, -4.0 * m);
      s.closePath();
      break;
    }
    case 'beam':
      s.absellipse(0, 0, 3.1 * m, 3.0 * m, -Math.PI / 2, Math.PI / 2, false, 0);
      s.lineTo(-1.0 * m, -3.0 * m);
      s.closePath();
      break;
    case 'batt':
      s.moveTo(-4.2 * m, -2.4 * m);
      s.lineTo(4.2 * m, -2.4 * m);
      s.lineTo(4.2 * m, 2.6 * m);
      s.lineTo(-4.2 * m, 2.6 * m);
      s.closePath();
      break;
    default:
      s.moveTo(-5.4 * m, -3.0 * m);
      s.lineTo(5.4 * m, -3.0 * m);
      s.lineTo(5.4 * m, 3.0 * m);
      s.lineTo(-5.4 * m, 3.0 * m);
      s.closePath();
      break;
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: false, curveSegments: 5 });
  g.computeVertexNormals();
  g.rotateY(Math.PI);
  return g;
}

export interface ClusterHandle {
  group: THREE.Group;
  update(dt: number, state: VehicleState): void;
}

export function buildCluster(ctx: BuildContext): ClusterHandle {
  const group = new THREE.Group();
  group.name = 'cluster';
  group.position.set(C[0], C[1], C[2]);
  group.rotation.x = RAKE * D2R;

  const art = drawCluster();
  const faceTex = canvasTexture(art.face, ctx.renderer);
  const litTex = canvasTexture(art.lit, ctx.renderer);
  const faceMat = createPrinted(faceTex, { roughness: 0.74, emissiveMap: litTex, emissive: 0xffffff });

  // The printed face. Built facing +Z then turned about Y, which puts the
  // canvas the right way round for an eye on the driver's side of it.
  const faceGeom = new THREE.PlaneGeometry(lw(FACE.w), lw(FACE.h));
  faceGeom.rotateY(Math.PI);
  group.add(mesh(faceGeom, faceMat, 'clusterFace'));

  const black = ctx.materials.interiorPlastic({ color: TONE.clusterBlack, roughness: 0.88 });
  const bright = ctx.materials.chrome({ roughness: 0.30 });

  // Surround and the two dial bezels, standing off the face.
  const trim: THREE.BufferGeometry[] = [];
  const surround = new THREE.Shape();
  surround.moveTo(-lw(FACE.w) / 2 - 0.006, -lw(FACE.h) / 2 - 0.006);
  surround.lineTo(lw(FACE.w) / 2 + 0.006, -lw(FACE.h) / 2 - 0.006);
  surround.lineTo(lw(FACE.w) / 2 + 0.006, lw(FACE.h) / 2 + 0.006);
  surround.lineTo(-lw(FACE.w) / 2 - 0.006, lw(FACE.h) / 2 + 0.006);
  surround.closePath();
  surround.holes.push(new THREE.Path().setFromPoints([
    new THREE.Vector2(-lw(FACE.w) / 2, -lw(FACE.h) / 2),
    new THREE.Vector2(lw(FACE.w) / 2, -lw(FACE.h) / 2),
    new THREE.Vector2(lw(FACE.w) / 2, lw(FACE.h) / 2),
    new THREE.Vector2(-lw(FACE.w) / 2, lw(FACE.h) / 2),
  ]));
  const sg = new THREE.ExtrudeGeometry(surround, { depth: 0.016, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
  sg.translate(0, 0, -0.016);
  sg.computeVertexNormals();
  trim.push(sg);

  for (const d of [DIALS.speedo, DIALS.tacho]) {
    const ring = new THREE.TorusGeometry(lw(d.r) + 0.0012, 0.0013, 6, 40);
    ring.translate(lx(d.x), ly(d.y), -0.0016);
    trim.push(ring);
  }
  group.add(mesh(merge(trim), black, 'clusterBezel'));

  // Odometer reset knob, protruding at the lower left of the speedometer.
  const knob = cyl(0.0034, 0.0042, 0.010, 10);
  knob.rotateX(Math.PI / 2);
  knob.translate(lx(DIALS.speedo.x - 24), ly(DIALS.speedo.y + 27), -0.0065);
  group.add(mesh(knob, black, 'odoReset'));

  // -- needles --------------------------------------------------------------
  const needleMat = ctx.materials.interiorPlastic({ color: 0xd8501c, roughness: 0.38 });
  const shadowMat = ctx.materials.interiorPlastic({ color: 0x090a0b, roughness: 0.95 });

  interface Needle { pivot: THREE.Group; shadow: THREE.Group; a0: number; a1: number; }
  const needles: Record<string, Needle> = {};
  const bosses: THREE.BufferGeometry[] = [];

  const makeNeedle = (key: string, d: { x: number; y: number; r: number }, big: boolean, a0: number, a1: number): void => {
    const pivot = new THREE.Group();
    pivot.position.set(lx(d.x), ly(d.y), -0.0048);
    const blade = needleBlade(lw(d.r) - (big ? 0.0062 : 0.0046), big ? 0.0034 : 0.0026, big ? 0.0011 : 0.0009, big ? 0.0072 : 0.0052, 0.0009);
    pivot.add(mesh(blade, needleMat, `${key}Needle`));
    group.add(pivot);
    const boss = cyl(big ? 0.0042 : 0.0032, big ? 0.0046 : 0.0036, 0.0035, 14);
    boss.rotateX(Math.PI / 2);
    boss.translate(lx(d.x), ly(d.y), -0.0076);
    bosses.push(boss);

    // Its shadow: the same blade, flat on the dial, offset as if the cluster
    // were lit from above and slightly outboard.
    const shadow = new THREE.Group();
    shadow.position.set(lx(d.x) + 0.0016, ly(d.y) - 0.0018, -0.0012);
    const sb = needleBlade(lw(d.r) - (big ? 0.0062 : 0.0046), big ? 0.0038 : 0.0029, 0.0014, big ? 0.0072 : 0.0052, 0.0003);
    shadow.add(mesh(sb, shadowMat, `${key}NeedleShadow`));
    group.add(shadow);

    needles[key] = { pivot, shadow, a0, a1 };
  };

  const ss = shortSweep();
  makeNeedle('speedo', DIALS.speedo, true, SWEEP.start, SWEEP.end);
  makeNeedle('tacho', DIALS.tacho, true, SWEEP.start, SWEEP.end);
  makeNeedle('temp', DIALS.temp, false, ss.start, ss.end);
  makeNeedle('fuel', DIALS.fuel, false, ss.start, ss.end);
  group.add(mesh(merge(bosses), black, 'needleBosses'));

  // -- warning lamps --------------------------------------------------------
  const red = ctx.materials.emissive(0xff2a18, 2.4);
  const green = ctx.materials.emissive(0x3ce052, 2.0);
  const blue = ctx.materials.emissive(0x4a78ff, 2.2);
  const amber = ctx.materials.emissive(0xffa012, 2.6);

  const lamp = (geom: THREE.BufferGeometry, mm: [number, number], mat: THREE.Material, name: string): THREE.Mesh => {
    geom.translate(lx(mm[0]), ly(mm[1]), -0.0022);
    const m = mesh(geom, mat, name);
    m.visible = false;
    m.castShadow = false;
    group.add(m);
    return m;
  };

  const lamps = {
    indL: lamp(lampShape('arrowL'), ARROWS[0], amber, 'lampIndicatorL'),
    indR: lamp(lampShape('arrowR'), ARROWS[1], amber, 'lampIndicatorR'),
    park: lamp(lampShape('bar'), tileCentre(0, 0), red, 'lampParkBrake'),
    low: lamp(lampShape('beam'), tileCentre(2, 0), green, 'lampDipped'),
    high: lamp(lampShape('beam'), tileCentre(1, 0), blue, 'lampHighBeam'),
    batt: lamp(lampShape('batt'), tileCentre(0, 1), red, 'lampBattery'),
    oil: lamp(lampShape('bar'), tileCentre(1, 2), red, 'lampOilPressure'),
  };

  // The lens: a few millimetres of acrylic in front of the whole thing, which
  // is where the cluster's one hard reflection comes from.
  const lensGeom = new THREE.PlaneGeometry(lw(FACE.w) + 0.004, lw(FACE.h) + 0.004, 6, 3);
  {
    const p = lensGeom.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (lw(FACE.w) / 2);
      p.setZ(i, -0.0012 * (1 - u * u));
    }
    lensGeom.computeVertexNormals();
  }
  lensGeom.rotateY(Math.PI);
  lensGeom.translate(0, 0, -0.0108);
  const lens = mesh(lensGeom, createLens(), 'clusterLens');
  lens.castShadow = false;
  lens.receiveShadow = false;
  lens.renderOrder = 2;
  group.add(lens);

  // -- motion ---------------------------------------------------------------
  // Second-order: stiff enough to keep up, light enough to overshoot a little.
  const sweep = (n: Needle, frac: number): number => lerp(n.a0, n.a1, clamp(frac, -0.02, 1.02)) * D2R;
  const st = { speed: 0, speedV: 0, rpm: 0, rpmV: 0, temp: 0, fuel: 0, lit: 0, blink: 0 };

  const spring = (pos: number, vel: number, target: number, k: number, c: number, dt: number): [number, number] => {
    const a = (target - pos) * k - vel * c;
    const v = vel + a * dt;
    return [pos + v * dt, v];
  };

  return {
    group,
    update(dt: number, s: VehicleState) {
      const step = Math.min(dt, 1 / 30);

      const mph = Math.abs(s.speed) * MPS_TO_MPH;
      [st.speed, st.speedV] = spring(st.speed, st.speedV, mph, 70, 15, step);
      // A five idles with a visible tremor in the needle; it smooths out as
      // the firing frequency climbs past the needle's own resonance.
      const tremor = s.engineRunning ? 26 * Math.exp(-(((s.engineRpm - ENGINE.idleRpm) / 900) ** 2)) : 0;
      const rpmTarget = s.engineRunning ? s.engineRpm + Math.sin(st.blink * 41) * tremor : 0;
      [st.rpm, st.rpmV] = spring(st.rpm, st.rpmV, rpmTarget, 230, 26, step);
      st.blink += step;

      // Coolant and fuel move on their own long time constants.
      const tempTarget = s.engineRunning ? 0.58 : 0.06;
      st.temp += (tempTarget - st.temp) * (1 - Math.exp(-step * 0.09));
      const fuelTarget = 0.62 - clamp(s.odometer, 0, 4e5) * 1e-7;
      st.fuel += (fuelTarget - st.fuel) * (1 - Math.exp(-step * 0.7));

      needles.speedo.pivot.rotation.z = sweep(needles.speedo, st.speed / SPEEDO_MAX);
      needles.tacho.pivot.rotation.z = sweep(needles.tacho, st.rpm / TACHO_MAX);
      needles.temp.pivot.rotation.z = sweep(needles.temp, st.temp);
      needles.fuel.pivot.rotation.z = sweep(needles.fuel, st.fuel);
      for (const k of Object.keys(needles)) needles[k].shadow.rotation.z = needles[k].pivot.rotation.z;

      // Backlighting comes up with the headlamps, not with dusk.
      const want = s.lights.low || s.lights.high ? 1 : 0;
      st.lit += (want - st.lit) * (1 - Math.exp(-step * 6));
      faceMat.emissiveIntensity = st.lit * 0.95;

      const flash = s.lights.hazard || s.lights.indicator !== 0 ? Math.sin(st.blink * Math.PI * 1.5) > 0 : false;
      lamps.indL.visible = flash && (s.lights.hazard || s.lights.indicator < 0);
      lamps.indR.visible = flash && (s.lights.hazard || s.lights.indicator > 0);
      lamps.low.visible = s.lights.low && !s.lights.high;
      lamps.high.visible = s.lights.high;
      lamps.park.visible = s.handbrake > 0.45;
      lamps.batt.visible = !s.engineRunning;
      lamps.oil.visible = !s.engineRunning;
    },
  };
}


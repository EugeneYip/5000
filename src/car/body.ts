/**
 * Body — the painted shell.
 *
 * Owns every steel surface of the car: bonnet, wings, doors, quarters, roof,
 * pillars, tailgate, rockers and the front/rear structures the bumpers mount
 * to. Glass, trim, lamps, wheels and interior belong to other streams; this
 * module leaves apertures at the hardpoints and models none of them.
 *
 * The surface itself lives in `body/surface.ts` — a lofted set of transverse
 * stations. This file only decides where the panel cuts fall, how each edge is
 * finished, and how the opening panels hinge.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext, PartResult } from '@/types';
import { HP } from '@/car/hardpoints';
import { QUALITY } from '@/spec';

import { T, Z_NOSE_FACE, Z_TAIL_END, topAt, heightAt, halfWidthAt, tAtY, dtFor } from './body/surface';
import { mergeGeometries, mirrorGeometry, clamp, lerp } from './body/math';
import { buildShell, type GridSample } from './body/panel';
import {
  Z, shellPanel, facePatch, wheelHouse,
  tRoofOuter, tScreenEdge, wingTop, tTailgate, tDloRear, aPillarLower, flankBottom,
  rearHalfWidth, rearFaceZ, noseHalfWidth, noseFaceZ,
  FRONT_AXLE, REAR_AXLE,
  SHUT, SHUT_DEEP, OPEN, SOFT, ARCH, BUTT,
} from './body/panels';

const REAR_Y_TOP = heightAt(Z_TAIL_END, 0.0);

/**
 * Half-width of the tailgate at height `y`.
 *
 * Above the taillamps the tailgate is the full width of the tail; below them it
 * necks in to the lamps' inner edge and runs down to its bottom shutline, which
 * is `HP.rear.tailgateBottomY` — the hatch's painted lower section. The 20 mm
 * blend keeps the corner a radius rather than a step.
 *
 * The local constant this replaced put the tailgate's bottom at 0.988, i.e.
 * essentially at `HP.glass.tailgateGlassBottomY` (0.962). Those are two
 * different things: 0.962 is where the GLASS stops, and it is right; the
 * tailgate itself carries on down to 0.652, and a fixed panel was standing in
 * for it with a shutline across the tail that the real car does not have.
 */
function tailgateHalfWidth(y: number): number {
  const full = rearHalfWidth(y);
  const k = clamp((y - HP.rear.lampTopY) / 0.020, 0, 1);
  return lerp(Math.min(HP.rear.lampInnerX, full), full, k * k * (3 - 2 * k));
}

export function buildBody(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const paint = ctx.materials.paint();
  const dark = ctx.materials.blackTrim();
  const bumperDark = ctx.materials.bumperPlastic();

  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];

  const addPainted = (name: string, g: THREE.BufferGeometry, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(g, paint);
    m.name = name;
    parent.add(m);
    return m;
  };

  const addDark = (name: string, g: THREE.BufferGeometry, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(g, bumperDark);
    m.name = name;
    parent.add(m);
    return m;
  };

  // =========================================================================
  // Bonnet
  // =========================================================================
  const hoodGeo = shellPanel({
    zFront: Z.hoodFront, zRear: Z.hoodRear,
    tLo: 0, tHi: () => T.roofEdge, span: true,
    front: SHUT, rear: SHUT, hi: SHUT_DEEP,
  });
  const hoodHinge = new THREE.Vector3(0, HP.front.hoodRearY, Z.hoodRear);
  hoodGeo.translate(-hoodHinge.x, -hoodHinge.y, -hoodHinge.z);
  const hoodPivot = new THREE.Group();
  hoodPivot.name = 'hoodPivot';
  hoodPivot.position.copy(hoodHinge);
  group.add(hoodPivot);
  const hoodPanel = addPainted('hoodPanel', hoodGeo, hoodPivot);
  nodes.hoodPanel = hoodPanel;
  nodes.hoodPivot = hoodPivot;

  // =========================================================================
  // Nose top strip — the brow over the lamp band, ahead of the bonnet
  // =========================================================================
  const noseUpper = shellPanel({
    zFront: Z_NOSE_FACE, zRear: Z.hoodFront,
    tLo: 0, tHi: () => T.roofEdge, span: true,
    front: OPEN, rear: SHUT, hi: SHUT,
  });

  // =========================================================================
  // Cowl / scuttle — a shallow trough for the wiper park
  // =========================================================================
  const cowlGeo = shellPanel({
    zFront: Z.hoodRear, zRear: Z.cowlRear,
    tLo: 0, tHi: (z) => wingTop(z), span: true,
    front: SHUT, rear: OPEN, hi: BUTT,
    sink: (_z, t) => 0.016 * Math.max(0, 1 - Math.pow(Math.abs(t) / T.roofEdge, 2)),
    nz: 7,
  });
  nodes.cowl = addPainted('cowl', cowlGeo);

  // =========================================================================
  // Roof skin
  // =========================================================================
  const roofGeo = shellPanel({
    zFront: Z.header, zRear: Z.tgHinge,
    tLo: 0, tHi: tRoofOuter, span: true,
    front: OPEN, rear: SHUT, hi: SOFT,
  });
  nodes.roofPanel = addPainted('roofPanel', roofGeo);

  // =========================================================================
  // Tailgate — header band, side frames, and the near-vertical lower face
  // =========================================================================
  const tgHeader = shellPanel({
    zFront: Z.tgHinge, zRear: Z.tgGlassTop,
    tLo: 0, tHi: tTailgate, span: true,
    front: SHUT, rear: OPEN, hi: SHUT_DEEP,
    nz: 6,
  });
  const tgSideR = shellPanel({
    zFront: Z.tgGlassTop, zRear: Z_TAIL_END,
    tLo: (z) => tTailgate(z) - dtFor(z, tTailgate(z), 0.082),
    tHi: tTailgate,
    front: BUTT, rear: BUTT, lo: OPEN, hi: SHUT_DEEP,
  });
  const tgFace = facePatch({
    // Stop at the glass line, not the top of the tail. Running it to
    // REAR_Y_TOP painted metal over the whole 176 mm of backlight aperture, so
    // the glazing stream's correctly-built 320 mm backlight rendered as the
    // slit it had been before. An oversight in the change that moved the
    // tailgate's bottom down — that commit's own comment noted 0.962 is where
    // the glass stops.
    yLo: HP.rear.tailgateBottomY, yHi: HP.glass.tailgateGlassBottomY,
    xLo: (y) => -tailgateHalfWidth(y), xHi: tailgateHalfWidth,
    zAt: rearFaceZ, facing: -1,
    bottom: SHUT_DEEP, top: BUTT, inner: OPEN, outer: OPEN,
    ny: 22,
  });
  const tailgateGeo = mergeGeometries([tgHeader, tgSideR, mirrorGeometry(tgSideR), tgFace]);
  const tgHinge = new THREE.Vector3(0, topAt(Z.tgHinge), Z.tgHinge);
  tailgateGeo.translate(-tgHinge.x, -tgHinge.y, -tgHinge.z);
  const tgPivot = new THREE.Group();
  tgPivot.name = 'tailgatePivot';
  tgPivot.position.copy(tgHinge);
  group.add(tgPivot);
  nodes.tailgatePanel = addPainted('tailgatePanel', tailgateGeo, tgPivot);
  nodes.tailgatePivot = tgPivot;

  // =========================================================================
  // Pillars
  // =========================================================================
  const aPillarR = shellPanel({
    zFront: Z.cowlRear, zRear: Z.header,
    tLo: tScreenEdge, tHi: wingTop,
    front: BUTT, rear: BUTT, lo: OPEN, hi: OPEN,
  });
  const bPillarR = shellPanel({
    zFront: Z.doorM + 0.040, zRear: Z.doorM - 0.048,
    tLo: tRoofOuter, tHi: () => T.belt,
    front: OPEN, rear: OPEN, lo: BUTT, hi: BUTT,
    nz: 5,
  });
  const cPillarR = shellPanel({
    zFront: Z.doorR + 0.028, zRear: Z.cPillarRear,
    tLo: tRoofOuter, tHi: () => T.belt,
    front: OPEN, rear: OPEN, lo: BUTT, hi: BUTT,
    nz: 5,
  });
  const dPillarR = shellPanel({
    zFront: Z.dPillar, zRear: Z.dPillarRear,
    tLo: (z) => Math.max(tRoofOuter(z), tTailgate(z)),
    tHi: (z) => clamp(tDloRear(z), Math.max(tRoofOuter(z), tTailgate(z)) + 0.004, T.belt),
    front: BUTT, rear: BUTT, lo: SHUT, hi: OPEN,
  });

  // =========================================================================
  // Front wings — leading edge notches back around the lamp aperture
  // =========================================================================
  const wingT = (z: number): number => wingTop(z);
  const wingB = (z: number): number => flankBottom(z, FRONT_AXLE);
  const wingFrontZ = (b: number): number => {
    // b runs from the bonnet shutline (0) to the rocker (1). The lamp band
    // occupies roughly the upper 60 %, where the wing stops short of the face.
    const k = clamp((b - 0.56) / 0.10, 0, 1);
    return lerp(Z.lampBack, Z_NOSE_FACE, k * k * (3 - 2 * k));
  };
  const wingR = shellPanel({
    zFront: wingFrontZ, zRear: Z.doorF,
    tLo: wingT, tHi: wingB,
    front: OPEN, rear: SHUT, lo: SHUT, hi: ARCH,
  });

  // =========================================================================
  // Doors
  // =========================================================================
  const doorFrontR = shellPanel({
    zFront: Z.doorF, zRear: Z.doorM,
    tLo: () => T.belt, tHi: () => T.lowerA,
    front: SHUT_DEEP, rear: SHUT_DEEP, lo: OPEN, hi: SHUT_DEEP,
  });
  const doorRearR = shellPanel({
    zFront: Z.doorM, zRear: Z.doorR,
    tLo: () => T.belt, tHi: () => T.lowerA,
    front: SHUT_DEEP, rear: SHUT_DEEP, lo: OPEN, hi: SHUT_DEEP,
  });

  // =========================================================================
  // Rear quarters
  // =========================================================================
  const quarterR = shellPanel({
    zFront: Z.doorR, zRear: Z_TAIL_END,
    tLo: () => T.belt, tHi: (z) => flankBottom(z, REAR_AXLE),
    front: SHUT, rear: BUTT, lo: OPEN, hi: ARCH,
  });

  // =========================================================================
  // Rockers and floor
  // =========================================================================
  const rockerR = shellPanel({
    zFront: 0.840, zRear: -3.660,
    tLo: () => T.lowerA, tHi: () => T.floor,
    front: BUTT, rear: BUTT, lo: SHUT, hi: BUTT,
  });

  // =========================================================================
  // Front structure
  // =========================================================================
  const noseLower = facePatch({
    yLo: 0.286, yHi: HP.front.grilleBottomY,
    xLo: (y) => -noseHalfWidth(y), xHi: (y) => noseHalfWidth(y),
    zAt: noseFaceZ, facing: 1,
    bottom: BUTT, top: OPEN, inner: BUTT, outer: BUTT,
    ny: 8,
  });

  // =========================================================================
  // Rear structure — taillamp apertures and the panel between them
  // =========================================================================
  const rearLower = facePatch({
    yLo: 0.338, yHi: HP.rear.tailgateBottomY,
    xLo: (y) => -rearHalfWidth(y), xHi: (y) => rearHalfWidth(y),
    zAt: rearFaceZ, facing: -1,
    bottom: BUTT, top: SHUT, inner: BUTT, outer: BUTT,
    ny: 8,
  });
  // Sliver of fixed panel outboard of the tailgate's lower corners: between its
  // bottom shutline and the foot of the taillamp aperture.
  const lampBaseR = facePatch({
    yLo: HP.rear.tailgateBottomY, yHi: HP.rear.lampBottomY,
    xLo: () => HP.rear.lampInnerX, xHi: rearHalfWidth,
    zAt: rearFaceZ, facing: -1,
    bottom: BUTT, top: OPEN, inner: SHUT, outer: BUTT,
    ny: 4,
  });

  // =========================================================================
  // Assembly — static shells
  // =========================================================================
  const frontStructure = new THREE.Group();
  frontStructure.name = 'frontStructure';
  group.add(frontStructure);
  addPainted('noseUpper', noseUpper, frontStructure);
  // The lower nose sits below the bumper's rub strip, where the reference
  // photograph shows dark moulding rather than body colour. Left in `paint` it
  // mirrors the sky at grazing angles and reads cream.
  addDark('noseLower', noseLower, frontStructure);
  addPainted('frontWingR', wingR, frontStructure);
  addPainted('frontWingL', mirrorGeometry(wingR), frontStructure);
  nodes.frontStructure = frontStructure;
  nodes.frontWingR = frontStructure.getObjectByName('frontWingR')!;
  nodes.frontWingL = frontStructure.getObjectByName('frontWingL')!;

  const rearStructure = new THREE.Group();
  rearStructure.name = 'rearStructure';
  group.add(rearStructure);
  addPainted('rearLower', rearLower, rearStructure);
  addPainted('lampBaseR', lampBaseR, rearStructure);
  addPainted('lampBaseL', mirrorGeometry(lampBaseR), rearStructure);
  addPainted('quarterR', quarterR, rearStructure);
  addPainted('quarterL', mirrorGeometry(quarterR), rearStructure);
  addPainted('dPillarR', dPillarR, rearStructure);
  addPainted('dPillarL', mirrorGeometry(dPillarR), rearStructure);
  addPainted('cPillarR', cPillarR, rearStructure);
  addPainted('cPillarL', mirrorGeometry(cPillarR), rearStructure);
  nodes.rearStructure = rearStructure;

  const upper = new THREE.Group();
  upper.name = 'upperStructure';
  group.add(upper);
  addPainted('aPillarR', aPillarR, upper);
  addPainted('aPillarL', mirrorGeometry(aPillarR), upper);
  addPainted('bPillarR', bPillarR, upper);
  addPainted('bPillarL', mirrorGeometry(bPillarR), upper);
  nodes.aPillarR = upper.getObjectByName('aPillarR')!;
  nodes.bPillarR = upper.getObjectByName('bPillarR')!;

  const lower = new THREE.Group();
  lower.name = 'lowerStructure';
  group.add(lower);
  addPainted('rockerR', rockerR, lower);
  addPainted('rockerL', mirrorGeometry(rockerR), lower);
  nodes.rockerR = lower.getObjectByName('rockerR')!;

  // Wheel houses and a closing floor so no aperture ever shows daylight.
  const houses = mergeGeometries([
    wheelHouse(FRONT_AXLE, 1), wheelHouse(FRONT_AXLE, -1),
    wheelHouse(REAR_AXLE, 1), wheelHouse(REAR_AXLE, -1),
    floorPan(),
  ]);
  const housesMesh = new THREE.Mesh(houses, dark);
  housesMesh.name = 'bodyInner';
  housesMesh.castShadow = false;
  lower.add(housesMesh);

  // =========================================================================
  // Doors, with their hinges
  // =========================================================================
  const doorDef: Array<[string, THREE.BufferGeometry, number, number]> = [
    ['doorFR', doorFrontR, Z.doorF, 1],
    ['doorFL', mirrorGeometry(doorFrontR), Z.doorF, -1],
    ['doorRR', doorRearR, Z.doorM, 1],
    ['doorRL', mirrorGeometry(doorRearR), Z.doorM, -1],
  ];
  const doorPivots: Record<string, THREE.Group> = {};
  for (const [name, geo, hingeZ, sign] of doorDef) {
    const hx = sign * (halfWidthAt(hingeZ, T.crown) - 0.055);
    const hinge = new THREE.Vector3(hx, 0.70, hingeZ + 0.004);
    geo.translate(-hinge.x, -hinge.y, -hinge.z);
    const pivot = new THREE.Group();
    pivot.name = `${name}Pivot`;
    pivot.position.copy(hinge);
    group.add(pivot);
    const mesh = addPainted(name, geo, pivot);
    nodes[name] = mesh;
    doorPivots[name] = pivot;
  }

  // =========================================================================
  // Articulations
  // =========================================================================
  const xAxis = new THREE.Vector3(1, 0, 0);
  // Doors swing on an axis raked a couple of degrees, so they lift as they
  // open and drop back onto their strikers — exactly like the real hinge.
  const doorAxis = new THREE.Vector3(0, 1, 0.055).normalize();

  articulations.push({
    name: 'hood', value: 0, target: 0, duration: 1.6,
    apply: (v) => hoodPivot.quaternion.setFromAxisAngle(xAxis, -0.86 * v),
  });
  articulations.push({
    name: 'tailgate', value: 0, target: 0, duration: 1.8,
    apply: (v) => tgPivot.quaternion.setFromAxisAngle(xAxis, 0.94 * v),
  });
  for (const [name, swing] of [['doorFR', -1], ['doorFL', 1], ['doorRR', -1], ['doorRL', 1]] as const) {
    const pivot = doorPivots[name];
    const max = name.startsWith('doorF') ? 1.16 : 1.02;
    articulations.push({
      name, value: 0, target: 0, duration: 1.25,
      apply: (v) => pivot.quaternion.setFromAxisAngle(doorAxis, swing * max * v),
    });
  }

  ctx.progress(1, 'body');
  return { group, nodes, articulations };
}

// ---------------------------------------------------------------------------
// A plain closing floor. The underbody stream dresses it; this only exists so
// that an open door or a wheel arch never shows straight through the car.
// ---------------------------------------------------------------------------

function floorPan(): THREE.BufferGeometry {
  const zF = 0.760, zR = -3.620;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3(0, -1, 0);
  const sample = (a: number, b: number): GridSample => {
    const z = lerp(zF, zR, a);
    const t = tAtY(z, heightAt(z, T.floor));
    const hw = halfWidthAt(z, t) - 0.03;
    const x = lerp(-hw, hw, b);
    const y = heightAt(z, T.floor) + 0.012;
    p.set(x, y, z);
    return { p, n, u: x, v: -z };
  };
  return buildShell({ sample, na: 30, nb: 8, edges: {} });
}

/** Exposed for the review harness: how heavy the shell came out. */
export const BODY_QUALITY = QUALITY.bodySegments;

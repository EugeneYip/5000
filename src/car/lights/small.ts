/**
 * The small lamps: side markers and the plate lamps.
 *
 * Federal side markers — amber forward, red aft — are the detail that most
 * quickly marks a car out as a US-market import, and a C3 without them reads
 * as a European 100. They are tiny, so they are built flat in a local frame
 * and set onto the flank using the body's own surface point and normal; over a
 * 95 mm patch the flank's curvature is well under the 1.5 mm the lens stands
 * proud, so nothing sinks and nothing floats.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS, PLATE } from '@/spec';
import { surfaceNormal, surfacePoint, tAtY } from '@/car/body/surface';
import type { BuildContext } from '@/types';
import { bothSides, bowl, merge, slab, type Outline } from './shapes';
import type { Glow, GlowFactory } from './optics';
import { FILAMENT } from './headlamp';

const FLAT = (): number => 0;

export interface SmallLamps {
  group: THREE.Group;
  /** Markers and plate lamps all run off the parking-lamp circuit. */
  markers: Glow[];
  plate: Glow;
  plateLightAt: THREE.Vector3;
}

export function buildSmallLamps(ctx: BuildContext, glows: GlowFactory): SmallLamps {
  const group = new THREE.Group();
  group.name = 'smallLamps';

  const black = ctx.materials.blackTrim();
  const reflectorMat = ctx.materials.reflector();

  const bodies: THREE.BufferGeometry[] = [];
  const bowls: THREE.BufferGeometry[] = [];
  const amberLensGeo: THREE.BufferGeometry[] = [];
  const redLensGeo: THREE.BufferGeometry[] = [];
  const amberGlowGeo: THREE.BufferGeometry[] = [];
  const redGlowGeo: THREE.BufferGeometry[] = [];

  // --- side markers --------------------------------------------------------
  for (const [hp, amber] of [
    [HP.side.markerFront, true],
    [HP.side.markerRear, false],
  ] as const) {
    const m = flankFrame(hp[2], hp[1]);
    const parts = markerParts(0.096, 0.044);
    bodies.push(place(parts.body, m));
    bowls.push(place(parts.bowl, m));
    (amber ? amberLensGeo : redLensGeo).push(place(parts.lens, m));
    (amber ? amberGlowGeo : redGlowGeo).push(place(parts.glow, m));
  }

  // --- plate lamps ---------------------------------------------------------
  // Two festoon lamps in the lip above the plate recess, shining down onto it.
  const plateLensGeo: THREE.BufferGeometry[] = [];
  const plateGlowGeo: THREE.BufferGeometry[] = [];
  const plateBodies: THREE.BufferGeometry[] = [];
  // In the lip above the plate recess, standing proud of the recess face so
  // the housings cannot fight the trim stream's plate and bumper for depth.
  const plateY = HP.rear.plateCenter[1] + PLATE.heightM / 2 + 0.019;
  const plateZ = HP.rear.plateCenter[2] - 0.014;
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4()
      .makeRotationX(-Math.PI * 0.62)
      .setPosition(sx * 0.106, plateY, plateZ);
    const parts = markerParts(0.042, 0.016, 0.0022);
    plateBodies.push(place(parts.body, m));
    plateLensGeo.push(place(parts.lens, m));
    plateGlowGeo.push(place(parts.glow, m));
  }

  const add = (name: string, geo: THREE.BufferGeometry | null, mat: THREE.Material, mirror: boolean): void => {
    if (!geo) return;
    const mesh = new THREE.Mesh(mirror ? bothSides(geo) : geo, mat);
    mesh.name = name;
    group.add(mesh);
  };

  add('markerBodies', merge(bodies), black, true);
  add('markerReflectors', merge(bowls), reflectorMat, true);
  add('markerLensFront', merge(amberLensGeo), ctx.materials.lens(LIGHTS.sidemarkerFrontColor, { prismatic: true }), true);
  add('markerLensRear', merge(redLensGeo), ctx.materials.lens(LIGHTS.sidemarkerRearColor, { prismatic: true }), true);
  add('plateLampBodies', merge(plateBodies), black, false);
  add('plateLampLens', merge(plateLensGeo), ctx.materials.lens(0xf2f4fa, { prismatic: false }), false);

  const markers: Glow[] = [
    glows.make(bothSides(merge(amberGlowGeo)!), { color: FILAMENT, peak: 2.6 }),
    glows.make(bothSides(merge(redGlowGeo)!), { color: FILAMENT, peak: 2.6 }),
  ];
  markers[0].mesh.name = 'markerGlowFront';
  markers[1].mesh.name = 'markerGlowRear';
  group.add(markers[0].mesh, markers[1].mesh);

  const plate = glows.make(merge(plateGlowGeo)!, { color: 0xfff4e2, peak: 2.6 });
  plate.mesh.name = 'plateLampGlow';
  group.add(plate.mesh);

  return {
    group,
    markers,
    plate,
    plateLightAt: new THREE.Vector3(0, plateY - 0.008, plateZ - 0.030),
  };
}

// ---------------------------------------------------------------------------

/** Local frame sitting on the right-hand flank at (z, y), +Z out of the body. */
function flankFrame(z: number, y: number): THREE.Matrix4 {
  const t = tAtY(z, y);
  const p = surfacePoint(z, t);
  const n = surfaceNormal(z, t).normalize();
  // Longitudinal tangent, made perpendicular to the normal.
  const along = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
  const up = new THREE.Vector3().crossVectors(n, along).normalize();
  return new THREE.Matrix4().makeBasis(along, up, n).setPosition(p);
}

function place(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  return g.applyMatrix4(m);
}

interface MarkerParts {
  body: THREE.BufferGeometry;
  bowl: THREE.BufferGeometry;
  lens: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
}

/** A marker, flat in its own frame: dark surround, bowl, lens, blaze. */
function markerParts(length: number, height: number, proud = 0.0035): MarkerParts {
  const outline: Outline = {
    yLo: -height / 2,
    yHi: height / 2,
    xInner: () => -length / 2,
    xOuter: () => length / 2,
    radiusInner: height * 0.3,
    radiusOuter: height * 0.3,
  };
  const lensArea: Outline = {
    ...outline,
    yLo: outline.yLo + 0.0028,
    yHi: outline.yHi - 0.0028,
    xInner: () => -length / 2 + 0.0028,
    xOuter: () => length / 2 - 0.0028,
  };
  return {
    body: slab({
      outline, zAt: FLAT, facing: 1,
      front: -0.0008, back: 0.017,
      nu: 16, nv: 6,
    }),
    bowl: bowl({
      cx: 0, cy: 0,
      halfW: length / 2 - 0.004, halfH: height / 2 - 0.004,
      zRim: -0.0035, facing: 1, depth: 0.011, corner: 4.0, flat: 0.10,
      fit: lensArea, nu: 22, nv: 12,
    }),
    lens: slab({
      outline: lensArea, zAt: FLAT, facing: 1,
      front: -proud, back: -proud + 0.0038,
      crown: 0.0012,
      nu: 16, nv: 6,
    }),
    glow: bowl({
      cx: 0, cy: 0,
      halfW: length / 2 - 0.005, halfH: height / 2 - 0.005,
      zRim: -0.0055, facing: 1, depth: -0.0022, corner: 4.0,
      fit: lensArea, nu: 16, nv: 8,
    }),
  };
}

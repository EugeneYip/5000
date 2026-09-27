/**
 * The 6J x 14 Audi "bottlecap" alloy, part 443 601 025 A.
 *
 * Nine capsule slots on a 40 degree pitch, a flat machined face, a deep
 * centre pocket with the bolts in it and a large flat cap with the four rings.
 * Slot count, pitch, angular span and the 0.66/0.82/0.46 radius breakpoints
 * were measured off a square face-on photograph of a bare wheel rather than
 * guessed — the catalogue name for it is literally "9 slot".
 *
 * The barrel is a real section: outer J flange, outer bead seat with its
 * safety hump, the drop centre, the inner hump and seat, and the inner flange,
 * all with wall thickness so the inside of the rim is a surface you can see
 * through the slots. A faked flat backing plate is obvious the moment the
 * camera gets below the axle line.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { EDGE, FACE, FLANGE_R, RIM } from './dims';
import { circlePath, fbm3, paintVertexColors, polarCapsule, revolveX, smoothstep, type P2, mergeAll } from './util';
import { liftAlongNormals } from './materials';

const BARREL_SEGMENTS = 72;
const POCKET_SEGMENTS = 56;

/** Outboard face plane of the spider, and the mounting face. */
export const SPIDER_FACE_X = 0.0888 - 0.0120;
export const MOUNT_FACE_X = RIM.offset;
const POCKET_FLOOR_X = MOUNT_FACE_X + RIM.mountThickness;
const BOSS_R = 0.400 * FLANGE_R;
const PLATE_INNER_R = FACE.capR + 0.0013;

export interface RimResult {
  group: THREE.Group;
  /** A scuffed arc for the one corner that has met a kerb. */
  kerbRash: THREE.Mesh;
}

// ---------------------------------------------------------------------------
// Barrel
// ---------------------------------------------------------------------------

/** Tyre-side half section, inboard flange tip to outboard flange tip. */
function barrelOuterProfile(): P2[] {
  const Rb = RIM.beadR;
  const Rf = FLANGE_R;
  const hump = Rb + 0.0034;
  const well = Rb - RIM.wellDepth;
  const sw = RIM.seatW / 2;

  const half: P2[] = [
    [-0.0888, Rf],
    [-0.0812, Rf - 0.0036],
    [-0.0782, Rf - 0.0115],
    [-sw, Rb],                 // bead seat, inboard
    [-0.0660, Rb + 0.0012],    // seats are tapered 5 deg
    [-0.0600, hump - 0.0012],
    [-0.0566, hump],           // safety hump crest
    [-0.0532, hump - 0.0016],
    [-0.0460, Rb - 0.0110],
    [-0.0390, well + 0.0022],
    [-0.0310, well],           // drop centre
    [0.0130, well],
    [0.0230, well + 0.0022],
    [0.0310, Rb - 0.0120],
    [0.0402, hump - 0.0016],
    [0.0440, hump],            // safety hump crest, outboard
    [0.0478, hump - 0.0012],
    [0.0620, Rb + 0.0012],
    [sw, Rb],                  // bead seat, outboard
    [0.0782, Rf - 0.0115],
    [0.0812, Rf - 0.0036],
    [0.0888, Rf],
  ];
  return half;
}

/** Offset a profile inwards to make the drum-side surface, then close it. */
function closedBarrelProfile(): P2[] {
  const out = barrelOuterProfile();
  const n = out.length;
  const normals: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p = out[Math.max(i - 1, 0)];
    const q = out[Math.min(i + 1, n - 1)];
    const da = q[0] - p[0];
    const dr = q[1] - p[1];
    const len = Math.hypot(da, dr) || 1;
    normals.push([-dr / len, da / len]);
  }
  const wall = RIM.wall;
  const inner: P2[] = out.map((p, i) => [p[0] - wall * normals[i][0], p[1] - wall * normals[i][1]]);

  // Round the flange tips rather than letting them come to a knife edge.
  const tipArc = (idx: number, dir: 1 | -1): P2[] => {
    const p = out[idx];
    const nn = normals[idx];
    const cx = p[0] - (wall / 2) * nn[0];
    const cr = p[1] - (wall / 2) * nn[1];
    const t: P2 = [nn[1] * dir, -nn[0] * dir];
    const pts: P2[] = [];
    for (let i = 1; i < 4; i++) {
      const a = (Math.PI * i) / 4;
      pts.push([cx + (wall / 2) * (Math.cos(a) * nn[0] + Math.sin(a) * t[0]), cr + (wall / 2) * (Math.cos(a) * nn[1] + Math.sin(a) * t[1])]);
    }
    return pts;
  };

  return [...out, ...tipArc(n - 1, 1), ...inner.slice().reverse(), ...tipArc(0, -1)];
}

// ---------------------------------------------------------------------------
// Spider
// ---------------------------------------------------------------------------

function buildSlotPlate(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outer = circlePath(FACE.outerR, 64);
  shape.curves = outer.curves;
  shape.autoClose = false;

  const holes: THREE.Path[] = [circlePath(PLATE_INNER_R, 36, true)];
  const span = (FACE.slotSpanDeg * Math.PI) / 180;
  for (let i = 0; i < FACE.slots; i++) {
    const a = (i / FACE.slots) * Math.PI * 2 + Math.PI / 2;
    holes.push(polarCapsule(FACE.slotInnerR, FACE.slotOuterR, span, a));
  }
  shape.holes = holes;

  const g = new THREE.ExtrudeGeometry(shape, {
    depth: FACE.thickness,
    bevelEnabled: true,
    bevelThickness: EDGE * 0.55,
    bevelSize: EDGE * 0.55,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Extrusion runs along +Z; the wheel spins about +X.
  g.rotateY(Math.PI / 2);
  // rotateY maps +Z to +X, so the front face lands at x = depth + bevel.
  g.translate(SPIDER_FACE_X - (FACE.thickness + EDGE * 0.55), 0, 0);
  g.computeVertexNormals();
  return g;
}

/** Centre pocket: boss wall, floor, bore, and the inboard-facing back. */
function buildPocket(): THREE.BufferGeometry {
  const boreR = RIM.boreR;
  const prof: P2[] = [
    // Outboard-facing surfaces are traversed from large radius to small.
    [SPIDER_FACE_X - 0.0004, PLATE_INNER_R + 0.0008],
    [SPIDER_FACE_X - 0.0035, BOSS_R + 0.0090],
    [SPIDER_FACE_X - 0.0105, BOSS_R + 0.0020],
    [SPIDER_FACE_X - 0.0155, BOSS_R],
    [POCKET_FLOOR_X + 0.0035, BOSS_R - 0.0030],   // pocket wall
    [POCKET_FLOOR_X, BOSS_R - 0.0075],
    [POCKET_FLOOR_X, boreR + 0.0055],             // pocket floor
    [POCKET_FLOOR_X - 0.0020, boreR + 0.0012],
    [POCKET_FLOOR_X - 0.0045, boreR],
    // Down the bore, then back out along the inboard side.
    [MOUNT_FACE_X + 0.0010, boreR],
    [MOUNT_FACE_X, boreR + 0.0018],
    [MOUNT_FACE_X, BOSS_R - 0.0040],              // the mounting face itself
    [MOUNT_FACE_X + 0.0028, BOSS_R + 0.0035],
    [MOUNT_FACE_X + 0.0060, BOSS_R + 0.0180],     // web sweeping out to the plate
    [MOUNT_FACE_X + 0.0150, BOSS_R + 0.0105],
    [SPIDER_FACE_X - FACE.thickness - 0.0006, PLATE_INNER_R + 0.0008],
  ];
  return revolveX(prof, POCKET_SEGMENTS);
}

/** M14 wheel bolts, recessed in their pockets. Audi bolted its wheels on. */
function buildBolts(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pcdR = RIM.pcd / 2;
  const seatX = POCKET_FLOOR_X;

  for (let i = 0; i < RIM.bolts; i++) {
    const a = (i / RIM.bolts) * Math.PI * 2 - Math.PI / 2;
    const y = pcdR * Math.cos(a);
    const z = pcdR * Math.sin(a);

    // Tapered seat sunk into the pocket floor.
    const seat = revolveX(
      [
        [seatX + 0.0002, RIM.boltPocketR],
        [seatX - 0.0068, RIM.boltHeadR + 0.0008],
        [seatX - 0.0072, RIM.boltHeadR * 0.62],
      ],
      12,
    );
    // Hex head with a domed flange, sitting proud of the seat.
    const head = revolveX(
      [
        [seatX - 0.0070, 0],
        [seatX - 0.0068, RIM.boltHeadR * 0.6],
        [seatX - 0.0050, RIM.boltHeadR],
        [seatX + 0.0038, RIM.boltHeadR],
        [seatX + 0.0052, RIM.boltHeadR - 0.0018],
        [seatX + 0.0056, RIM.boltHeadR * 0.55],
        [seatX + 0.0050, 0],
      ],
      10,
    );
    for (const g of [seat, head]) {
      g.translate(0, y, z);
      parts.push(g);
    }
  }
  return mergeAll(parts);
}

/** Centre cap: a flat disc with the four rings, filling the pocket. */
function buildCentreCap(): THREE.BufferGeometry {
  const faceX = SPIDER_FACE_X - 0.0022;
  // Traversed from the rim inwards: a disc facing outboard needs a
  // decreasing-radius profile, or it renders inside out and you see the
  // bolts straight through it.
  const capProfile: P2[] = [
    [faceX - 0.0090, FACE.capR],
    [faceX - 0.0030, FACE.capR],
    [faceX - 0.0004, FACE.capR - 0.0026],
    [faceX, FACE.capR - 0.0075],
    [faceX + FACE.capRise * 0.35, FACE.capR * 0.55],
    [faceX + FACE.capRise, 0.0001],
  ];
  const parts: THREE.BufferGeometry[] = [revolveX(capProfile, POCKET_SEGMENTS)];

  // The four rings, chunky 1980s section, raised off the cap face.
  const ringR = FACE.ringsOuterD / 2;
  const tube = FACE.ringsTubeR;
  const spacing = FACE.ringsOuterD * 0.77;
  for (let i = 0; i < 4; i++) {
    const g = new THREE.TorusGeometry(ringR - tube, tube, 5, 22);
    g.rotateY(Math.PI / 2);
    g.translate(faceX + FACE.capRise * 0.9, 0, (i - 1.5) * spacing);
    parts.push(g);
  }
  return mergeAll(parts);
}

/** Snap-in rubber valve, in the drop centre between two slots. */
function buildValve(): THREE.BufferGeometry {
  const well = RIM.beadR - RIM.wellDepth;
  // Behind a web rather than behind a slot, which is how they are fitted.
  const a = Math.PI / 2 + Math.PI / FACE.slots;

  const stem = new THREE.CylinderGeometry(0.0042, 0.0062, 0.0215, 12, 1);
  stem.translate(0, 0.0107, 0);
  const cap = new THREE.CylinderGeometry(0.0046, 0.0044, 0.0098, 12, 1);
  cap.translate(0, 0.0252, 0);
  const g = mergeAll([stem, cap]);
  // +Y becomes the local radial direction at angle `a`.
  g.rotateX(a);
  g.translate(0.0155, well * Math.cos(a), well * Math.sin(a));
  return g;
}

// ---------------------------------------------------------------------------
// Dirt
// ---------------------------------------------------------------------------

const DUST = new THREE.Color(0.40, 0.345, 0.305);

/** Brake dust and road film, as vertex colour. */
function grimeRim(g: THREE.BufferGeometry, gain = 1): THREE.BufferGeometry {
  return paintVertexColors(g, (p, n, out) => {
    const r = Math.hypot(p.y, p.z) / FLANGE_R;
    const inboard = Math.max(0, -n.x);
    const axial = Math.max(0, Math.min(1, 1 - Math.abs(n.x)));
    const inSlotBand = smoothstep(0.60, 0.67, r) * (1 - smoothstep(0.82, 0.90, r));
    const deep = smoothstep(0.035, -0.055, p.x);

    let dust =
      0.08 +
      0.46 * inboard +
      0.34 * axial * (0.4 + 0.6 * inSlotBand) +
      0.20 * (1 - Math.min(r, 1)) +
      0.26 * deep;
    // Break the symmetry — a real wheel is never evenly dirty.
    dust += (fbm3(p.x * 42, p.y * 42, p.z * 42, 3) - 0.5) * 0.30;
    dust = Math.max(0, Math.min(0.88, dust * gain));

    out.setRGB(
      1 + (DUST.r - 1) * dust,
      1 + (DUST.g - 1) * dust,
      1 + (DUST.b - 1) * dust,
    );
  });
}

// ---------------------------------------------------------------------------

export function buildRim(ctx: BuildContext): RimResult {
  const group = new THREE.Group();
  group.name = 'rim';

  // Straight from the library, vertex colours and all. This used to be two
  // `privateClone`s, taken only so `vertexColors` could be switched on; the
  // option is on `alloy()` now, and the shared instances are the ones
  // `setEnvMap` actually reaches.
  const machined = ctx.materials.alloy({ polished: true, vertexColors: true });
  const cast = ctx.materials.alloy({ vertexColors: true });

  // Machined: everything the turning tool reaches — the face and the lip.
  const machinedGeo = grimeRim(
    mergeAll([buildSlotPlate(), buildCentreCap()]),
    0.75,
  );
  // Cast: the barrel, the pocket, the bolts. Duller, and where the dust sits.
  const castGeo = grimeRim(
    mergeAll([
      revolveX(closedBarrelProfile(), BARREL_SEGMENTS, { closeProfile: true }),
      buildPocket(),
      buildBolts(),
    ]),
    1.15,
  );

  const faceMesh = new THREE.Mesh(machinedGeo, machined);
  faceMesh.name = 'rimFace';
  const barrelMesh = new THREE.Mesh(castGeo, cast);
  barrelMesh.name = 'rimBarrel';
  group.add(faceMesh, barrelMesh);

  const valveMat = ctx.materials.rubber({ roughness: 0.78 });
  const valve = new THREE.Mesh(buildValve(), valveMat);
  valve.name = 'valveStem';
  group.add(valve);

  const rash = new THREE.Mesh(buildKerbRash(), machined);
  rash.name = 'kerbRash';

  return { group, kerbRash: rash };
}

/**
 * Kerb rash: a scuffed arc of bare, scratched aluminium on the outer lip.
 * Fitted to one corner only — damage is never symmetrical.
 *
 * Taken off the flange's own outboard face rather than drawn as a free arc.
 * The arc this replaced was authored at radii that put it *inside* the flange
 * wall — up to half a millimetre under the surface at its inboard end — and it
 * was only visible because it carried `polygonOffset`. Polygon offset is a
 * material property, so keeping it meant keeping a private material for thirty
 * triangles. A third of a millimetre of real standoff does the same job and
 * lets the scuff wear the same polished `alloy()` the rim face does.
 */
function buildKerbRash(): THREE.BufferGeometry {
  // The closed section runs [...tyre side, tip arc, drum side reversed, ...],
  // so the flange tip and the outboard face just inboard of it are the seven
  // points either side of the tip arc — the exact strip a kerb touches.
  const closed = closedBarrelProfile();
  const nOut = barrelOuterProfile().length;
  const lip = closed.slice(nOut - 1, nOut + 6);

  const g = liftAlongNormals(revolveX(lip, 20), 0.0003);
  // Keep only a 46 degree sector of it.
  trimSector(g, 20, 4, 9);

  // Torn metal: bright where it was freshly exposed, grey where the road has
  // already dulled it, streaked along the direction of the scrape.
  return paintVertexColors(g, (p, _n, out) => {
    const a = Math.atan2(p.z, p.y);
    const k = 0.82 + 0.26 * fbm3(a * 34, p.x * 900, a * 7, 3);
    out.setRGB(k, k * 0.995, k * 0.984);
  });
}

/** Keep only columns [from, to) of a revolved geometry. */
function trimSector(g: THREE.BufferGeometry, segments: number, from: number, to: number): void {
  const idx = g.getIndex()!;
  const n = idx.count / (segments * 6);
  const keep: number[] = [];
  for (let c = from; c < to; c++) {
    for (let i = 0; i < n * 6; i++) keep.push(idx.getX(c * n * 6 + i));
  }
  g.setIndex(keep);
}

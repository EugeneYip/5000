/**
 * Brakes, seen through nine slots.
 *
 * Vented disc at the front, solid at the rear, with the vanes actually
 * modelled between the friction faces — on a 14 in wheel the disc's outer edge
 * sits right behind the slot band and the vane ends are visible.
 *
 * The detail that sells it is not the shape, it is the finish: a bright ring
 * where the pads sweep, and orange-brown oxide everywhere they do not — the
 * outer ledge, the inner ledge, the hat and the vanes. `materials.brakeDisc()`
 * already draws that boundary on the friction faces; the parts the pads never
 * touch wear `materials.castIron()`, because it is a different surface, not a
 * darker version of the same one.
 *
 * All four finishes come from the library. `castIron()`, `caliperPaint()` and
 * `padFriction()` are `dirtyMetal()` underneath with authored constants, so
 * the three of them share one program — and, being registry members, they
 * track `setEnvMap`. The local `MeshPhysicalMaterial`s they replaced did not,
 * and held whatever IBL was current when the car was built.
 *
 * Each of the two groups is merged down to one mesh per finish. The rotor's
 * parts never move relative to each other and neither do the upright's; only
 * the two groups move relative to one another, and that is the one split that
 * has to survive.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { BRAKE, RIM } from './dims';
import { arcRevolve, fbm3, mirrorZ, paintVertexColors, radialUv, revolveX, type P2, mergeAll } from './util';
import { MOUNT_FACE_X } from './rim';

const D2R = Math.PI / 180;
const DISC_SEGMENTS = 72;

/** Friction-ring centre plane, inboard of the wheel's mounting face. */
const RING_X = MOUNT_FACE_X - BRAKE.hatDepth;

export interface BrakeResult {
  /** Turns with the wheel. */
  rotating: THREE.Group;
  /** Bolted to the upright: must never spin. */
  fixed: THREE.Group;
}

// ---------------------------------------------------------------------------
// Disc
// ---------------------------------------------------------------------------

function frictionPlate(rIn: number, rOut: number, xMid: number, thick: number): THREE.BufferGeometry {
  const h = thick / 2;
  const e = 0.0012;
  // Closed section, traversed so the outboard face ends up facing outboard.
  const prof: P2[] = [
    [xMid + h, rIn + e],
    [xMid + h, rOut - e],
    [xMid + h - e, rOut],
    [xMid - h + e, rOut],
    [xMid - h, rOut - e],
    [xMid - h, rIn + e],
    [xMid - h + e, rIn],
    [xMid + h - e, rIn],
  ];
  return revolveX(prof, DISC_SEGMENTS, { closeProfile: true });
}

function buildHat(rDisc: number, rIn: number): THREE.BufferGeometry {
  const face = MOUNT_FACE_X;
  const hatR = BRAKE.hatR;
  const bore = RIM.boreR;
  const prof: P2[] = [
    // Outboard face of the hat, from the OD in to the spigot.
    [face, hatR],
    [face, bore + 0.0135],
    [face - 0.0015, bore + 0.0055],
    [face - 0.0040, bore],
    [face - 0.0150, bore],
    // Back out along the inboard side.
    [face - 0.0150, bore + 0.0075],
    [face - 0.0092, bore + 0.0125],
    [face - 0.0080, hatR - 0.0075],
    // The cylinder down to the friction ring, and the ring's inner ledge.
    [RING_X + 0.0130, hatR - 0.0062],
    [RING_X + 0.0102, hatR],
    [RING_X + 0.0090, rIn + 0.0035],
    [RING_X - 0.0010, rIn + 0.0030],
    [RING_X - 0.0022, hatR - 0.0010],
    [RING_X + 0.0078, hatR + 0.0012],
    [RING_X + 0.0118, hatR + 0.0030],
    [face - 0.0062, hatR + 0.0018],
    [face - 0.0030, hatR + 0.0006],
  ];
  const g = revolveX(prof, 48, { closeProfile: true });
  return g;
}

/** Radial vanes between the friction faces. Cast in, and clearly visible at
 *  the disc's outer edge once the wheel is on. */
function buildVanes(rIn: number, rOut: number, gap: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = gap / 2;
  for (let i = 0; i < BRAKE.vanes; i++) {
    const a = (i / BRAKE.vanes) * Math.PI * 2;
    const wIn = 0.0032;
    const wOut = 0.0052;
    const g = new THREE.BufferGeometry();
    const len = rOut - rIn;
    const v: number[] = [];
    // A simple tapered prism: cheap, and only its end and sides are ever seen.
    const corners: Array<[number, number, number]> = [
      [-h, rIn, -wIn / 2], [h, rIn, -wIn / 2], [h, rIn, wIn / 2], [-h, rIn, wIn / 2],
      [-h, rIn + len, -wOut / 2], [h, rIn + len, -wOut / 2], [h, rIn + len, wOut / 2], [-h, rIn + len, wOut / 2],
    ];
    for (const [x, r, z] of corners) v.push(x, r, z);
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([
      0, 1, 2, 0, 2, 3,       // inner end
      4, 6, 5, 4, 7, 6,       // outer end
      0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3,
      3, 7, 4, 3, 4, 0,
    ]);
    g.computeVertexNormals();
    g.rotateX(a);
    g.translate(RING_X, 0, 0);
    parts.push(g);
  }
  return mergeAll(parts);
}

// ---------------------------------------------------------------------------
// Caliper
// ---------------------------------------------------------------------------

/** The C-section that straddles the disc. */
function caliperProfile(thick: number): P2[] {
  const xOut = RING_X + thick / 2;
  const xIn = RING_X - thick / 2;
  const top = BRAKE.caliperMaxR;
  const bridge = 0.1408;
  const foot = 0.0985;
  return [
    [xOut + 0.0215, top],
    [xOut + 0.0215, 0.1055],
    [xOut + 0.0155, foot],
    [xOut + 0.0042, foot],
    [xOut + 0.0042, bridge],
    [xIn - 0.0042, bridge],
    [xIn - 0.0042, foot],
    [xIn - 0.0180, 0.0955],
    [xIn - 0.0455, 0.0985],
    [xIn - 0.0520, 0.1160],
    [xIn - 0.0470, top - 0.0035],
    [xIn - 0.0300, top],
  ];
}

function buildCaliper(thick: number): THREE.BufferGeometry {
  const phi = BRAKE.caliperPhiDeg * D2R;
  const span = BRAKE.caliperSpanDeg * D2R;
  const body = arcRevolve(caliperProfile(thick), phi - span / 2, phi + span / 2, 12);

  const parts: THREE.BufferGeometry[] = [body];

  // Piston boss on the inboard face, and the bleed nipple on top.
  const xIn = RING_X - thick / 2;
  const boss = new THREE.CylinderGeometry(0.0235, 0.0255, 0.0135, 16, 1);
  boss.rotateZ(Math.PI / 2);
  boss.translate(xIn - 0.0520, 0.1215 * Math.cos(phi), 0.1215 * Math.sin(phi));
  parts.push(boss);

  const nipple = new THREE.CylinderGeometry(0.0032, 0.0040, 0.0165, 8, 1);
  nipple.translate(0, 0.0082, 0);
  nipple.rotateX(phi + 0.10);
  nipple.translate(xIn - 0.0285, BRAKE.caliperMaxR * Math.cos(phi + 0.10), BRAKE.caliperMaxR * Math.sin(phi + 0.10));
  parts.push(nipple);

  // Slide pins: the two guides a sliding caliper floats on.
  for (const s of [-1, 1]) {
    const a = phi + s * span * 0.42;
    const pin = new THREE.CylinderGeometry(0.0062, 0.0062, 0.042, 10, 1);
    pin.rotateZ(Math.PI / 2);
    pin.translate(xIn - 0.0210, 0.1060 * Math.cos(a), 0.1060 * Math.sin(a));
    parts.push(pin);
  }

  return mergeAll(parts);
}

/** Pad backing plates and friction blocks, one each side of the disc. */
function buildPads(thick: number): { backs: THREE.BufferGeometry; friction: THREE.BufferGeometry } {
  const phi = BRAKE.caliperPhiDeg * D2R;
  const span = BRAKE.caliperSpanDeg * D2R * 0.82;
  const rIn = 0.1015;
  const rOut = 0.1352;
  const xOut = RING_X + thick / 2;
  const xIn = RING_X - thick / 2;
  const backs: THREE.BufferGeometry[] = [];
  const fric: THREE.BufferGeometry[] = [];

  for (const side of [1, -1]) {
    const x0 = side > 0 ? xOut + 0.0008 : xIn - 0.0008;
    const fProf: P2[] = side > 0
      ? [[x0, rIn], [x0 + BRAKE.padThickness, rIn], [x0 + BRAKE.padThickness, rOut], [x0, rOut]]
      : [[x0 - BRAKE.padThickness, rIn], [x0, rIn], [x0, rOut], [x0 - BRAKE.padThickness, rOut]];
    fric.push(arcRevolve(fProf, phi - span / 2, phi + span / 2, 9));

    const b0 = side > 0 ? x0 + BRAKE.padThickness : x0 - BRAKE.padThickness;
    const bProf: P2[] = side > 0
      ? [[b0, rIn - 0.0035], [b0 + BRAKE.padBackThickness, rIn - 0.0035], [b0 + BRAKE.padBackThickness, rOut + 0.0030], [b0, rOut + 0.0030]]
      : [[b0 - BRAKE.padBackThickness, rIn - 0.0035], [b0, rIn - 0.0035], [b0, rOut + 0.0030], [b0 - BRAKE.padBackThickness, rOut + 0.0030]];
    backs.push(arcRevolve(bProf, phi - span / 2, phi + span / 2, 9));
  }
  return { backs: mergeAll(backs), friction: mergeAll(fric) };
}

/** Flexible hose from the strut down to the caliper, with its banjo bolt. */
function buildBrakeLine(thick: number): { hose: THREE.BufferGeometry; fitting: THREE.BufferGeometry } {
  const phi = BRAKE.caliperPhiDeg * D2R;
  const xIn = RING_X - thick / 2;
  const start = new THREE.Vector3(
    xIn - 0.0330,
    (BRAKE.caliperMaxR - 0.012) * Math.cos(phi - 0.30),
    (BRAKE.caliperMaxR - 0.012) * Math.sin(phi - 0.30),
  );
  const curve = new THREE.CatmullRomCurve3([
    start,
    start.clone().add(new THREE.Vector3(-0.022, 0.030, -0.012)),
    start.clone().add(new THREE.Vector3(-0.036, 0.078, -0.034)),
    start.clone().add(new THREE.Vector3(-0.030, 0.121, -0.062)),
  ]);
  const hose = new THREE.TubeGeometry(curve, 16, 0.0048, 7, false);

  const banjo = new THREE.CylinderGeometry(0.0092, 0.0092, 0.0130, 10, 1);
  banjo.rotateZ(Math.PI / 2);
  banjo.translate(start.x - 0.0035, start.y, start.z);
  return { hose, fitting: banjo };
}

/** Stamped steel backing plate behind the disc. Always rusty, always bent. */
function buildDustShield(rDisc: number, thick: number): THREE.BufferGeometry {
  const x = RING_X - thick / 2 - BRAKE.shieldGap;
  const prof: P2[] = [
    [x + 0.0165, BRAKE.hatR + 0.0075],
    [x + 0.0030, BRAKE.hatR + 0.0180],
    [x, BRAKE.hatR + 0.0400],
    [x - 0.0022, rDisc - 0.0060],
    [x - 0.0098, rDisc + 0.0035],
    [x - 0.0104, rDisc + 0.0035],
    [x - 0.0030, rDisc - 0.0060],
    [x - 0.0008, BRAKE.hatR + 0.0400],
    [x + 0.0022, BRAKE.hatR + 0.0180],
    [x + 0.0157, BRAKE.hatR + 0.0075],
  ];
  return revolveX(prof, 44, { closeProfile: true });
}

// ---------------------------------------------------------------------------

const RUST = new THREE.Color(0.78, 0.50, 0.30);

function mottle(g: THREE.BufferGeometry, base = 1): THREE.BufferGeometry {
  return paintVertexColors(g, (p, _n, out) => {
    const n = fbm3(p.x * 85, p.y * 85, p.z * 85, 3);
    const k = base * (0.72 + 0.56 * n);
    out.setRGB(k * RUST.r * 1.28, k * RUST.g * 1.45, k * RUST.b * 1.75);
  });
}

export function buildBrakes(ctx: BuildContext, front: boolean, mirrored: boolean): BrakeResult {
  const rDisc = front ? BRAKE.discR : BRAKE.discRRear;
  const thick = front ? BRAKE.frontThickness : BRAKE.rearThickness;
  const rIn = rDisc * BRAKE.frictionInnerFrac;

  const rotating = new THREE.Group();
  rotating.name = 'brakeRotor';
  const fixed = new THREE.Group();
  fixed.name = 'brakeFixed';

  const discMat = ctx.materials.brakeDisc();
  // Vertex colours everywhere the mesh carries a baked mottle; the pad face
  // does not, so it asks for the plain instance.
  const ironMat = ctx.materials.castIron({ vertexColors: true });
  const caliperMat = ctx.materials.caliperPaint({ vertexColors: true });
  const padMat = ctx.materials.padFriction();

  // --- rotor --------------------------------------------------------------
  const plates: THREE.BufferGeometry[] = [];
  const rotorIron: THREE.BufferGeometry[] = [mottle(buildHat(rDisc, rIn), 1.0)];
  if (front) {
    const face = BRAKE.frontFaceThickness;
    const gap = thick - 2 * face;
    plates.push(frictionPlate(rIn, rDisc, RING_X + (thick - face) / 2, face));
    plates.push(frictionPlate(rIn, rDisc, RING_X - (thick - face) / 2, face));
    rotorIron.push(mottle(buildVanes(rIn + 0.0015, rDisc - 0.0015, gap), 0.92));
  } else {
    plates.push(frictionPlate(rIn, rDisc, RING_X, thick));
  }
  const discGeo = radialUv(mergeAll(plates), rDisc);
  rotating.add(new THREE.Mesh(discGeo, discMat));
  rotating.add(new THREE.Mesh(mergeAll(rotorIron), ironMat));

  // --- fixed to the upright ------------------------------------------------
  let caliper = buildCaliper(thick);
  const pads = buildPads(thick);
  let padBacks = pads.backs;
  let padFric = pads.friction;
  const line = buildBrakeLine(thick);
  let hose = line.hose;
  let fitting = line.fitting;

  if (mirrored) {
    caliper = mirrorZ(caliper);
    padBacks = mirrorZ(padBacks);
    padFric = mirrorZ(padFric);
    hose = mirrorZ(hose);
    fitting = mirrorZ(fitting);
  }

  fixed.add(new THREE.Mesh(paintVertexColors(caliper, (p, _n, out) => {
    const n = fbm3(p.x * 70, p.y * 70, p.z * 70, 3);
    const k = 0.82 + 0.34 * n;
    out.setRGB(k, k * 0.98, k * 0.95);
  }), caliperMat));
  // Backing plates, banjo bolt and dust shield: one oxidised casting as far as
  // the renderer is concerned, and all bolted to the same upright.
  fixed.add(new THREE.Mesh(mergeAll([
    mottle(padBacks, 0.85),
    mottle(fitting, 0.7),
    mottle(buildDustShield(rDisc, thick), 1.05),
  ]), ironMat));
  fixed.add(new THREE.Mesh(padFric, padMat));
  fixed.add(new THREE.Mesh(hose, ctx.materials.rubber({ roughness: 0.68 })));

  return { rotating, fixed };
}

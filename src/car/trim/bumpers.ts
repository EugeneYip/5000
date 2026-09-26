/**
 * The 5 mph impact bumpers.
 *
 * These are the single most characteristic thing about a US-market C3 and the
 * easiest to under-do. `HP.front.bumperZ` puts the face 226 mm ahead of the
 * headlamp plane, so the top of the moulding is a *shelf* a good hand's-width
 * deep standing out in front of the lamps. Flattening that back into a
 * European-looking blade is the difference between a 5000 and a 100.
 *
 * Two corrections from `docs/REFERENCE-VEHICLE.md` §6.3 are built in:
 *
 *  · the bright rub strip caps the moulding's **upper edge**, it does not run
 *    across the middle of its face — the brochure scan that suggested
 *    mid-height was simply too coarse to read;
 *  · the amber at the bumper end is a **small discrete marker**. The big
 *    wrap-around amber is inside the headlamp, which is the lights stream's.
 *
 * Geometry is one section swept along a plan-form spine, with the section's
 * return depth shortening as it wraps the corner so the moulding always buries
 * itself in the wing rather than hanging in space.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS, QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import {
  at, clamp, framesXZ, lathe, lerp, merge, mesh, offsetPolyline, profileStrip,
  roundedBox, smoothstep, sweep, type Frame, type Pt,
} from './util';

/**
 * Plan-form of the moulding, as (half-width, distance back from the face) —
 * flat across the middle, then wrapping hard round the corner and running aft
 * to die into the wing just ahead of the wheel arch.
 */
const PLAN: ReadonlyArray<readonly [number, number]> = [
  [0.000, 0.000], [0.140, 0.0015], [0.280, 0.006], [0.400, 0.015],
  [0.520, 0.030], [0.620, 0.052], [0.700, 0.080], [0.770, 0.117],
  [0.826, 0.163], [0.866, 0.218], [0.892, 0.282], [0.903, 0.352],
  [0.905, 0.424], [0.898, 0.492], [0.882, 0.548], [0.858, 0.590],
];

/**
 * Resample the half plan-form into a full, symmetric spine.
 *
 * Through a spline, not straight between the control points: the moulding is
 * smooth-shaded, so a piecewise-linear plan puts a faint vertical crease down
 * the bumper at every control station and they are clearly visible in a
 * three-quarter render.
 */
function spine(faceZ: number, sign: 1 | -1, samples = 6): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(
    PLAN.map(([x, d]) => new THREE.Vector3(x, 0, faceZ + sign * -d)),
    false,
    'catmullrom',
    0.5,
  );
  const n = (PLAN.length - 1) * samples;
  const half: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
    half.push([p.x, p.z]);
  }
  const left = half.slice(1).reverse().map(([x, z]) => [-x, z] as [number, number]);
  return [...left, ...half];
}

/** 0 at the centreline, 1 at the very tip of the wrap. */
function wrapK(x: number): number {
  return smoothstep(clamp((Math.abs(x) - 0.60) / 0.30, 0, 1));
}

export interface BumperSpec {
  faceZ: number;
  topY: number;
  bottomY: number;
  /** +1 for the nose (the moulding faces +Z), −1 for the tail. */
  sign: 1 | -1;
  valanceBottomY: number;
}

/** How far the face falls back from its crown at height `y`. */
function crown(s: BumperSpec, y: number): number {
  const mid = (s.topY + s.bottomY) / 2;
  const half = (s.topY - s.bottomY) / 2;
  const k = clamp((y - mid) / half, -1, 1);
  // Slightly more tuck under the bottom than over the top: the moulding rolls
  // under towards the valance and stands nearly vertical at its top.
  return -0.0125 * k * k - (k < 0 ? 0.0042 * k * k : 0);
}

/** Outer profile of the moulding, face and both rolls, top to bottom. */
function outerProfile(s: BumperSpec): Pt[] {
  const t = s.topY;
  const b = s.bottomY;
  return [
    [-0.0325, t + 0.0110],
    [-0.0182, t + 0.0072],
    [-0.0092, t + 0.0034],
    [-0.0040, t - 0.0018],
    [-0.0026, t - 0.0078],
    ...profileStrip(t - 0.016, b + 0.024, 9, (y) => crown(s, y)),
    [crown(s, b + 0.015) - 0.0022, b + 0.0150],
    [crown(s, b + 0.007) - 0.0076, b + 0.0070],
    [-0.0170, b + 0.0016],
    [-0.0290, b - 0.0012],
    [-0.0470, b - 0.0030],
  ];
}

/** Closed section: outer profile, then the return that buries it in the body. */
function section(s: BumperSpec, depth: number): Pt[] {
  const outer = outerProfile(s);
  const back = -depth;
  return [
    [back, s.topY + 0.0190],
    ...outer,
    [back * 0.86, s.bottomY - 0.0120],
    [back, s.bottomY - 0.0140],
  ];
}

function buildMoulding(s: BumperSpec): { geo: THREE.BufferGeometry; frames: Frame[] } {
  const pts = spine(s.faceZ, s.sign);
  const frames = framesXZ(pts, 0).map((f) => (s.sign > 0 ? f : { ...f, r: f.r.clone().negate() }));
  const geo = sweep(
    (j) => section(s, lerp(0.255, 0.062, wrapK(pts[j][0]))),
    frames,
    { closed: true, capStart: true, capEnd: true, flip: s.sign > 0, uvScale: 0.18 },
  );
  return { geo, frames };
}

/** The bright strip that caps the moulding's top edge. */
function rubStrip(s: BumperSpec, frames: Frame[]): THREE.BufferGeometry {
  const t = s.topY;
  const along: Pt[] = [
    [-0.0430, t + 0.0128],
    [-0.0245, t + 0.0092],
    [-0.0125, t + 0.0050],
    [-0.0055, t + 0.0002],
    [-0.0032, t - 0.0062],
    ...profileStrip(t - 0.013, t - HP.front.rubStripHeight + 0.004, 4, (y) => crown(s, y)),
  ];
  const lifted = offsetPolyline(along, -0.0017);
  return sweep(lifted, frames, { flip: s.sign > 0, uvScale: 0.06 });
}

/**
 * Lower valance / air dam. Body-coloured on this car — §6.3 reconciles the
 * brochure's "integrated body-colored bumper aprons" with the dark moulding:
 * the moulding is grey, the aprons above and below it are paint.
 *
 * It tucks *under* the moulding rather than standing out in front of it, and
 * it dies away to nothing before the wheel arch instead of wrapping.
 */
function valance(s: BumperSpec, frames: Frame[], spinePts: Array<[number, number]>): THREE.BufferGeometry {
  const b = s.bottomY;
  const drop = b - s.valanceBottomY;
  // The top of the apron is buried inside the moulding's bottom roll: leaving
  // the two edges coplanar put a row of z-fighting slashes across the valance.
  // Near-vertical where it shows under the moulding, then turning hard under
  // for the bottom half. The apron is body colour, and paint this dark only
  // reads dark when it is facing the ground rather than the sky: a gently
  // convex apron mirrors the horizon and comes out brighter than the bonnet.
  // The top edge is carried right up inside the moulding: anywhere it came out
  // level with the moulding's underside the two surfaces grazed each other and
  // left a row of dark slivers along the join.
  const shape: Array<readonly [number, number]> = [
    [-0.090, 0.060], [-0.078, -drop * 0.20], [-0.082, -drop * 0.44],
    [-0.094, -drop * 0.66], [-0.120, -drop * 0.86], [-0.158, -drop * 0.97],
    [-0.196, -drop], [-0.222, -drop + 0.004], [-0.262, -drop * 0.50], [-0.262, 0.060],
  ];
  return sweep(
    (j) => {
      const fade = 1 - smoothstep(clamp((Math.abs(spinePts[j][0]) - 0.50) / 0.22, 0, 1));
      // At the ends every point collapses onto one, so the sweep closes to a
      // line rather than leaving a shelf sticking into the wheel arch.
      return shape.map(([d, dy]) => [lerp(-0.060, d, fade), b + 0.060 + (dy - 0.060) * fade] as Pt);
    },
    frames,
    { closed: true, capStart: true, capEnd: true, flip: s.sign > 0, uvScale: 0.18 },
  );
}

/** Frame nearest a given half-width, for hanging a marker or a towing eye on. */
function frameAt(frames: Frame[], x: number): Frame {
  let best = frames[0];
  let bestD = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.o.x - x);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** Place a flat detail on the moulding face at `x`, `y`, facing outward. */
function onFace(frames: Frame[], s: BumperSpec, x: number, y: number, g: THREE.BufferGeometry, lift = 0): THREE.BufferGeometry {
  const f = frameAt(frames, x);
  const d = crown(s, y) + lift;
  const o = new THREE.Vector3(f.o.x, y, f.o.z).addScaledVector(f.r, d);
  const yaw = Math.atan2(f.r.x, f.r.z);
  g.rotateY(yaw);
  g.translate(o.x, o.y, o.z);
  return g;
}

export interface BumperResult {
  moulding: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
  valance: THREE.BufferGeometry;
  frames: Frame[];
  spec: BumperSpec;
}

function build(s: BumperSpec): BumperResult {
  const pts = spine(s.faceZ, s.sign);
  const { geo, frames } = buildMoulding(s);
  return {
    moulding: geo,
    bright: rubStrip(s, frames),
    valance: valance(s, frames, pts),
    frames,
    spec: s,
  };
}

export function buildBumpers(ctx: BuildContext): { group: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'bumpers';

  const plastic = ctx.materials.bumperPlastic();
  const bright = ctx.materials.chrome({ roughness: 0.2 });
  const paint = ctx.materials.paint();
  const dark = ctx.materials.blackTrim();

  const front: BumperSpec = {
    faceZ: HP.front.bumperZ,
    topY: HP.front.bumperTopY,
    bottomY: HP.front.bumperBottomY,
    sign: 1,
    valanceBottomY: HP.front.valanceBottomY,
  };
  const rear: BumperSpec = {
    faceZ: HP.rear.bumperZ,
    topY: HP.rear.bumperTopY,
    bottomY: HP.rear.bumperBottomY,
    sign: -1,
    // No rear valance figure is published; carry the front's drop across.
    valanceBottomY: HP.rear.bumperBottomY - (HP.front.bumperBottomY - HP.front.valanceBottomY),
  };

  const f = build(front);
  const r = build(rear);

  // --- front detail --------------------------------------------------------
  const frontExtras: THREE.BufferGeometry[] = [f.moulding];

  // Plate plinth: the pad the plate bolts onto, standing proud of the crown.
  const plate = HP.front.plateCenter;
  frontExtras.push(at(roundedBox(0.328, 0.176, 0.030, 0.0065), [plate[0], plate[1], plate[2] - 0.0165]));

  // Impact-absorber access plugs and the towing eye — both visible in §6.3.
  for (const sx of [-1, 1]) {
    const plug = lathe([[0, 0.0055], [0.0150, 0.0052], [0.0195, 0.0034], [0.0205, 0], [0.0205, -0.010]], 18);
    plug.rotateX(Math.PI / 2);
    frontExtras.push(onFace(f.frames, front, sx * 0.452, 0.596, plug, -0.0042));
    frontExtras.push(onFace(f.frames, front, sx * 0.845, 0.452, roundedBox(0.048, 0.026, 0.016, 0.006), -0.0105));
  }
  group.add(mesh('frontBumper', merge(frontExtras), plastic));
  group.add(mesh('frontRubStrip', f.bright, bright));
  // Not `paint`: the photograph shows dark grey moulding through here, and a
  // metallic clearcoat on a panel this close to horizontal mirrors the sky.
  group.add(mesh('frontValance', f.valance, plastic));

  // Small amber marker low in the bumper's outboard face.
  const amber: THREE.BufferGeometry[] = [];
  const bezel: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1] as const) {
    amber.push(onFace(f.frames, front, sx * HP.front.markerX, HP.front.markerY,
      roundedBox(0.062, 0.030, 0.012, 0.005), 0.0015));
    bezel.push(onFace(f.frames, front, sx * HP.front.markerX, HP.front.markerY,
      roundedBox(0.072, 0.040, 0.010, 0.005), -0.0035));
  }
  group.add(mesh('frontMarkerBezel', merge(bezel), dark));
  group.add(mesh('frontMarkerLens', merge(amber), ctx.materials.lens(LIGHTS.sidemarkerFrontColor, { prismatic: true })));

  // --- rear detail ---------------------------------------------------------
  const rearExtras: THREE.BufferGeometry[] = [r.moulding];
  // The rear plate sits in a recess rather than on a plinth (§2.3), so the
  // surround is a frame rather than a pad.
  const rp = HP.rear.plateCenter;
  const surround: THREE.BufferGeometry[] = [];
  // Set BEHIND the plate face, not proud of it: standing 4 mm forward of the
  // plate threw a grazing shadow 30 mm across it at low sun, which read as a
  // rash of dark blotches over the characters.
  for (const [w, h, y, x] of [[0.352, 0.018, 0.094, 0], [0.352, 0.018, -0.094, 0], [0.020, 0.206, 0, 0.166], [0.020, 0.206, 0, -0.166]] as const) {
    surround.push(at(roundedBox(w, h, 0.016, 0.005), [rp[0] + x, rp[1] + y, rp[2] + 0.012]));
  }
  rearExtras.push(...surround);
  group.add(mesh('rearBumper', merge(rearExtras), plastic));
  group.add(mesh('rearRubStrip', r.bright, bright));
  group.add(mesh('rearValance', r.valance, paint));

  // Black backing panel the rear plate mounts against.
  group.add(mesh('rearPlatePanel', at(roundedBox(0.330, 0.178, 0.012, 0.004), [rp[0], rp[1], rp[2] + 0.012]), dark));

  void QUALITY;
  return { group };
}

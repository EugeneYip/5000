/**
 * Seats: two front buckets and the 60/40 folding rear bench, in the period
 * velour. This is where the triangle budget goes, because it is what fills
 * the glass.
 *
 * The two front seats are built from the same description with different
 * numbers — the driver's is set further forward, sits a degree more upright
 * and has had four years more use than the passenger's. Identical mirrored
 * seats are one of the loudest CG tells there is.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext } from '@/types';
import { CABIN, TONE } from './layout';
import { bolster, crease, dish, panel, welt, type Frame } from './soft';
import { clamp, cyl, D2R, lerp, merge, mesh, roundedBox, roundedRect, smoothstep, surface, type Vec3 } from './util';
import type { StaticBatch } from './batch';

function frame(origin: Vec3, runTiltDeg: number): Frame {
  const r = runTiltDeg * D2R;
  const run = new THREE.Vector3(0, Math.cos(r), -Math.sin(r));
  const lat = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(lat, run).normalize();
  return { origin: new THREE.Vector3(...origin), lat, run, up };
}

/** Thin out a swept edge before it becomes piping — 12 stations is plenty. */
function thin(path: Vec3[], n = 12): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) out.push(path[Math.round((i * (path.length - 1)) / (n - 1))]);
  return out;
}


/**
 * The "open" head restraint: a padded loop on two chromed posts, which is
 * what [AW-87]'s "four open head restraints" means. Built as a solid with a
 * real opening rather than a bent tube, because a constant-section tube reads
 * as a doughnut on sticks and this reads as a head restraint.
 */
function openHeadRestraint(w: number, h: number, d: number, cy: number, cz: number, rakeDeg: number): THREE.BufferGeometry {
  const r = 0.020;
  const shape = roundedRect(w - 2 * r, h - 2 * r, Math.min((h - 2 * r) / 2 - 1e-4, 0.046), 4);
  const hole = new THREE.Path();
  const hw = (w - 2 * r) * 0.365;
  const hh = (h - 2 * r) * 0.26;
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * hw;
    const y = Math.sin(a) * hh;
    if (i === 0) hole.moveTo(x, y); else hole.lineTo(x, y);
  }
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4, steps: 1,
  });
  g.translate(0, 0, -(d - 2 * r) / 2 - r);
  g.computeVertexNormals();
  g.rotateX(-rakeDeg * D2R);
  g.translate(0, cy, cz);
  return g;
}

// ---------------------------------------------------------------------------
// Front bucket
// ---------------------------------------------------------------------------

interface SeatOpts {
  /** -1 driver, +1 passenger. */
  side: number;
  /** Fore/aft travel from the nominal H-point, +forward. */
  slide: number;
  /** Backrest rake, degrees from vertical. */
  rakeDeg: number;
  /** 0 showroom, 1 well used. */
  wear: number;
  headrestUp: number;
  seed: number;
}

function frontSeat(ctx: BuildContext, o: SeatOpts): { cloth: THREE.BufferGeometry[]; hard: THREE.BufferGeometry[]; posts: THREE.BufferGeometry[] } {
  const cloth: THREE.BufferGeometry[] = [];
  const hard: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const w = o.wear;

  const cushFrontZ = -0.815 + o.slide;
  const cushRearZ = -1.285 + o.slide;
  const cushLen = cushFrontZ - cushRearZ;
  const cushY = 0.606;

  // -- cushion --------------------------------------------------------------
  const cushionFlutes = [-0.62, -0.31, 0, 0.31, 0.62];
  const cush = panel({
    frame: { origin: new THREE.Vector3(0, cushY, cushFrontZ), lat: new THREE.Vector3(1, 0, 0), run: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
    length: cushLen,
    ring: 34,
    stations: 42,
    halfWidth: (v) => 0.214 + 0.034 * Math.sin(Math.PI * clamp(v * 1.05, 0, 1)) - 0.012 * smoothstep(0.82, 1, v),
    depth: (v) => 0.132 + 0.055 * Math.sin(Math.PI * clamp(v * 0.92 + 0.06, 0, 1)) - 0.03 * smoothstep(0.86, 1, v),
    flutes: cushionFlutes,
    fluteDepth: 0.0075,
    seed: o.seed,
    face: (t, v) =>
      // Bolsters down both sides, a nose roll at the front, the dish the
      // occupant leaves, and the fold that dish puts across the front third.
      bolster(t, 0.026 - 0.006 * w, 0.60) * smoothstep(0.02, 0.22, v) * (1 - smoothstep(0.88, 1, v))
      - 0.030 * smoothstep(0.10, 0, v)
      + dish(t, v, 0.46, 0.085, 0.016 + 0.010 * w)
      + crease(t, v, 0.20, 0.0045 * (0.4 + w))
      + crease(t, v, 0.285, 0.0032 * (0.4 + w), 0.02)
      + crease(t, v, 0.63, 0.0028 * (0.4 + w), 0.016)
      // The outboard bolster of a seat people climb over collapses first.
      - (o.side < 0 ? 1 : 0.35) * w * 0.006 * smoothstep(0.66, 0.99, -t * o.side * -1) * smoothstep(0.1, 0.4, v),
    back: () => 0,
  });
  cloth.push(cush.geometry);
  cloth.push(welt(thin(cush.edgeL, 15), 0.0042), welt(thin(cush.edgeR, 15), 0.0042));

  // -- backrest -------------------------------------------------------------
  const backLen = 0.578;
  const backFrame = frame([0, cushY - 0.012, cushRearZ + 0.028], o.rakeDeg);
  const back = panel({
    frame: backFrame,
    length: backLen,
    ring: 34,
    stations: 48,
    halfWidth: (v) => 0.216 + 0.026 * Math.sin(Math.PI * clamp(v * 0.8 + 0.1, 0, 1)) - 0.052 * smoothstep(0.72, 1, v),
    depth: (v) => 0.112 - 0.030 * smoothstep(0.35, 1, v) + 0.012 * Math.sin(Math.PI * v),
    flutes: [-0.58, -0.29, 0, 0.29, 0.58],
    fluteDepth: 0.0070,
    seed: o.seed + 3.7,
    face: (t, v) =>
      bolster(t, 0.032 - 0.008 * w, 0.56) * smoothstep(0.03, 0.2, v) * (1 - smoothstep(0.82, 1, v))
      // Lumbar swell, then the hollow a pair of shoulders leaves above it.
      + 0.013 * Math.exp(-((v - 0.27) ** 2) / 0.012) * (1 - Math.abs(t) * 0.5)
      - (0.010 + 0.006 * w) * Math.exp(-((v - 0.66) ** 2) / 0.020) * (1 - Math.abs(t) ** 2 * 0.6)
      - 0.022 * smoothstep(0.90, 1.0, v)
      + crease(t, v, 0.41, 0.0040 * (0.4 + w), 0.02)
      + crease(t, v, 0.52, 0.0032 * (0.4 + w), 0.018)
      + crease(t, v, 0.16, 0.0030 * (0.4 + w), 0.014),
    back: (t) => -0.004 * (1 - t * t),
  });
  cloth.push(back.geometry);
  cloth.push(welt(thin(back.edgeL, 15), 0.0040), welt(thin(back.edgeR, 15), 0.0040));

  // -- head restraint: the open type, on two chromed posts ------------------
  const topPt = backFrame.origin.clone().addScaledVector(backFrame.run, backLen);
  const hrY = topPt.y + 0.050 + o.headrestUp;
  const hrZ = topPt.z - 0.014;
  cloth.push(openHeadRestraint(0.215, 0.118, 0.072, hrY + 0.059, hrZ, o.rakeDeg));

  for (const px of [-0.052, 0.052]) {
    const post = cyl(0.0058, 0.0058, 0.105, 10);
    post.rotateX(-o.rakeDeg * D2R);
    post.translate(px, hrY + 0.002, hrZ + 0.012);
    posts.push(post);
  }

  // -- shells, shields and the recliner -------------------------------------
  // Outboard side shield: the moulded panel that hides the frame. It follows
  // the cushion's own outline, so the two never disagree.
  for (const s of [-1, 1]) {
    const shield = surface(3, 16, false, (i, j, out) => {
      const v = j / 16;
      const z = lerp(cushFrontZ + 0.01, cushRearZ - 0.008, v);
      const hwid = 0.214 + 0.034 * Math.sin(Math.PI * clamp(v * 1.05, 0, 1));
      const prof: Array<[number, number]> = [[0.0, 0.612], [0.010, 0.560], [0.014, 0.508], [0.006, 0.474]];
      const q = prof[i];
      out.set(s * (hwid + 0.008 - q[0]), q[1] - 0.02 * smoothstep(0.86, 1, v), z);
    });
    hard.push(shield);
  }

  // Recliner handwheel, outboard, at the hinge.
  const knob = cyl(0.030, 0.030, 0.016, 20);
  knob.rotateZ(Math.PI / 2);
  knob.translate(o.side * 0.252, cushY - 0.012, cushRearZ + 0.030);
  hard.push(knob);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rib = roundedBox(0.018, 0.0045, 0.010, 0.0018, 1, 2);
    rib.rotateX(a);
    rib.rotateZ(Math.PI / 2);
    rib.translate(o.side * 0.252, cushY - 0.012 + Math.cos(a) * 0.0305, cushRearZ + 0.030 + Math.sin(a) * 0.0305);
    hard.push(rib);
  }

  // Height-adjust lever, driver only.
  if (o.side < 0) {
    const lever = roundedBox(0.014, 0.020, 0.115, 0.006, 2, 3);
    lever.rotateX(0.22);
    lever.translate(-0.246, cushY - 0.055, cushRearZ + 0.150);
    hard.push(lever);
  }

  // Backrest rear shell: hard plastic with a map pocket cut into it.
  const shellLen = backLen - 0.03;
  const shell = surface(14, 16, false, (i, j, out) => {
    const v = j / 16;
    const t = -1 + (2 * i) / 14;
    const hwid = (0.214 + 0.024 * Math.sin(Math.PI * clamp(v * 0.8 + 0.1, 0, 1)) - 0.050 * smoothstep(0.72, 1, v)) * 0.99;
    const dep = 0.112 - 0.030 * smoothstep(0.35, 1, v) + 0.012 * Math.sin(Math.PI * v);
    const pocket = -0.020 * smoothstep(0.10, 0.22, v) * (1 - smoothstep(0.42, 0.52, v)) * (1 - smoothstep(0.7, 0.95, Math.abs(t)));
    out.copy(backFrame.origin)
      .addScaledVector(backFrame.lat, t * hwid)
      .addScaledVector(backFrame.run, 0.018 + v * shellLen)
      .addScaledVector(backFrame.up, -dep - 0.002 + pocket - 0.006 * (1 - Math.cos(t * 1.4)));
  });
  hard.push(shell);

  // Seat base: pedestal and rails, seen through the door in every side shot.
  const ped = roundedBox(0.30, 0.075, 0.33, 0.016, 2, 3);
  ped.translate(0, 0.452, (cushFrontZ + cushRearZ) / 2 + 0.01);
  hard.push(ped);
  for (const rx of [-0.116, 0.116]) {
    const rail = roundedBox(0.026, 0.028, 0.46, 0.006, 1, 2);
    rail.translate(rx, 0.418, (cushFrontZ + cushRearZ) / 2);
    hard.push(rail);
    const foot = roundedBox(0.038, 0.036, 0.050, 0.008, 1, 2);
    foot.translate(rx, 0.400, cushRearZ + 0.06);
    hard.push(foot);
  }

  return { cloth, hard, posts };
}

// ---------------------------------------------------------------------------
// Rear bench — 60/40, and it folds, because that is the difference between
// 38.5 and 76.8 cubic feet.
// ---------------------------------------------------------------------------

/** Where the split falls, as a fraction of the half width. */
const SPLIT_X = -0.115;
const BENCH_HALF = 0.612;
const BENCH_BACK_Z = -2.398;
const BENCH_BACK_Y = 0.616;
const BENCH_RAKE = 17;

function benchCushion(): { cloth: THREE.BufferGeometry[] } {
  const cloth: THREE.BufferGeometry[] = [];
  const p = panel({
    frame: { origin: new THREE.Vector3(0, 0.652, -1.975), lat: new THREE.Vector3(1, 0, 0), run: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
    length: 0.425,
    ring: 44,
    stations: 30,
    halfWidth: (v) => BENCH_HALF - 0.026 * smoothstep(0.75, 1, v) + 0.012 * Math.sin(Math.PI * v),
    depth: (v) => 0.118 + 0.040 * Math.sin(Math.PI * clamp(v * 0.9 + 0.08, 0, 1)) - 0.045 * smoothstep(0.86, 1, v),
    flutes: [-0.86, -0.72, -0.30, -0.16, 0.16, 0.30, 0.72, 0.86],
    fluteDepth: 0.0062,
    seed: 11.3,
    face: (t, v) =>
      // Three places sculpted into one cushion: two outer dishes and a
      // slightly proud centre that nobody wants to sit on.
      -0.020 * smoothstep(0.10, 0, v)
      + 0.010 * Math.exp(-(t * t) / 0.018)
      + dish(t * 3 + 1.62, v, 0.46, 0.10, 0.011)
      + dish(t * 3 - 1.62, v, 0.46, 0.10, 0.009)
      + bolster(t, 0.016, 0.88)
      + crease(t, v, 0.24, 0.0030, 0.02)
      + crease(t, v, 0.60, 0.0024, 0.018),
  });
  cloth.push(p.geometry, welt(thin(p.edgeL, 14), 0.0040), welt(thin(p.edgeR, 14), 0.0040));
  return { cloth };
}

function benchBack(side: 1 | -1): { cloth: THREE.BufferGeometry[]; hard: THREE.BufferGeometry[]; posts: THREE.BufferGeometry[] } {
  // side -1 is the narrow 40 % section, +1 the wide 60 %.
  const inner = SPLIT_X + side * 0.006;
  const outer = side * BENCH_HALF;
  const cx = (inner + outer) / 2;
  const half = Math.abs(outer - inner) / 2;

  const f = frame([cx, BENCH_BACK_Y, BENCH_BACK_Z], BENCH_RAKE);
  const cloth: THREE.BufferGeometry[] = [];
  const hard: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const len = 0.492;

  const p = panel({
    frame: f,
    length: len,
    ring: side > 0 ? 34 : 26,
    stations: 32,
    halfWidth: (v) => half - 0.012 * smoothstep(0.86, 1, v),
    depth: (v) => 0.088 - 0.016 * smoothstep(0.4, 1, v) + 0.008 * Math.sin(Math.PI * v),
    flutes: side > 0 ? [-0.74, -0.58, -0.10, 0.06, 0.58, 0.74] : [-0.6, -0.42, 0.42, 0.6],
    fluteDepth: 0.0060,
    seed: side > 0 ? 5.1 : 8.9,
    face: (t, v) =>
      bolster(t, 0.014, 0.80) * smoothstep(0.04, 0.2, v)
      + 0.008 * Math.exp(-((v - 0.30) ** 2) / 0.016)
      - 0.018 * smoothstep(0.90, 1, v)
      + crease(t, v, 0.44, 0.0030, 0.02)
      + crease(t, v, 0.66, 0.0024, 0.016),
    back: (t) => -0.003 * (1 - t * t),
  });
  cloth.push(p.geometry, welt(thin(p.edgeL, 12), 0.0038), welt(thin(p.edgeR, 12), 0.0038));

  // Head restraint, outboard position only.
  const hx = cx + side * (half - 0.150);
  const topPt = f.origin.clone().addScaledVector(f.run, len);
  const hrY = topPt.y + 0.052;
  const hrZ = topPt.z - 0.014;
  const hr = openHeadRestraint(0.196, 0.106, 0.064, hrY + 0.052, hrZ, BENCH_RAKE);
  hr.translate(hx, 0, 0);
  cloth.push(hr);
  for (const dx of [-0.046, 0.046]) {
    const post = cyl(0.0054, 0.0054, 0.090, 8);
    post.rotateX(-BENCH_RAKE * D2R);
    post.translate(hx + dx, hrY - 0.006, hrZ + 0.010);
    posts.push(post);
  }

  // Hard backing — this is the load floor once the seat is folded.
  const shell = surface(10, 12, false, (i, j, out) => {
    const v = j / 12;
    const t = -1 + (2 * i) / 10;
    const hwid = (half - 0.012 * smoothstep(0.86, 1, v)) * 0.985;
    const dep = 0.088 - 0.016 * smoothstep(0.4, 1, v) + 0.008 * Math.sin(Math.PI * v);
    out.copy(f.origin)
      .addScaledVector(f.lat, t * hwid)
      .addScaledVector(f.run, 0.012 + v * (len - 0.02))
      .addScaledVector(f.up, -dep - 0.003 - 0.004 * (1 - Math.cos(t * 1.3)));
  });
  hard.push(shell);

  return { cloth, hard, posts };
}

// ---------------------------------------------------------------------------

export function buildSeats(ctx: BuildContext, batch: StaticBatch): { group: THREE.Group; articulations: Articulation[] } {
  const group = new THREE.Group();
  group.name = 'seats';
  const fabric = ctx.materials.fabric();
  const hardMat = ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.74 });
  const postMat = ctx.materials.chrome({ roughness: 0.26 });
  const articulations: Articulation[] = [];

  // Driver: forward on its rails, a degree more upright, four years more use.
  const driver = frontSeat(ctx, { side: -1, slide: 0.030, rakeDeg: CABIN.seatBackRakeDeg - 1.5, wear: 1.0, headrestUp: 0.004, seed: 1.7 });
  const pass = frontSeat(ctx, { side: 1, slide: -0.048, rakeDeg: CABIN.seatBackRakeDeg + 3.5, wear: 0.42, headrestUp: -0.022, seed: 6.4 });

  // Not mirrored: each bucket is built for the side it sits on, so the
  // recliner wheel and the height lever land outboard on both and the two
  // seats are never each other's reflection.
  // The two buckets and the bench cushion are three meshes per finish in the
  // scene graph and one draw each in the renderer only if they share geometry
  // as well as material. Nothing in front articulates — the 60/40 backs below
  // are the only seats that move — so the seat's X offset is baked in and the
  // three velour pieces, the two frames and the two pairs of posts each go out
  // as one mesh. Six draws become three.
  const frontCloth: THREE.BufferGeometry[] = [merge(benchCushion().cloth)];
  const frontHard: THREE.BufferGeometry[] = [];
  const frontPosts: THREE.BufferGeometry[] = [];
  for (const [s, seat] of [[-1, driver], [1, pass]] as Array<[number, ReturnType<typeof frontSeat>]>) {
    const dx = s * CABIN.seatX;
    frontCloth.push(merge(seat.cloth).translate(dx, 0, 0));
    frontHard.push(merge(seat.hard).translate(dx, 0, 0));
    frontPosts.push(merge(seat.posts).translate(dx, 0, 0));
  }
  // The buckets and the bench cushion are bolted down; only the 60/40 backs
  // below fold, and those keep their own meshes under their pivots.
  batch.add(fabric, merge(frontCloth));
  batch.add(hardMat, merge(frontHard));
  batch.add(postMat, merge(frontPosts));

  for (const side of [1, -1] as Array<1 | -1>) {
    const b = benchBack(side);
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? 'rearBack60' : 'rearBack40';
    pivot.position.set(0, BENCH_BACK_Y, BENCH_BACK_Z);
    const cloth = merge(b.cloth);
    cloth.translate(0, -BENCH_BACK_Y, -BENCH_BACK_Z);
    const hard = merge(b.hard);
    hard.translate(0, -BENCH_BACK_Y, -BENCH_BACK_Z);
    pivot.add(mesh(cloth, fabric, `${pivot.name}Cloth`));
    pivot.add(mesh(hard, hardMat, `${pivot.name}Shell`));
    const posts = merge(b.posts);
    posts.translate(0, -BENCH_BACK_Y, -BENCH_BACK_Z);
    pivot.add(mesh(posts, postMat, `${pivot.name}Posts`));
    group.add(pivot);
    articulations.push({
      name: side > 0 ? 'rearSeat60' : 'rearSeat40',
      value: 0,
      target: 0,
      duration: 1.1,
      // Folded flat the backrest becomes the load floor; that is the whole
      // point of the 60/40 and the difference between 38.5 and 76.8 cu ft.
      apply: (v) => { pivot.rotation.x = v * (Math.PI / 2 + BENCH_RAKE * D2R) * 0.985; },
    });
  }

  return { group, articulations };
}

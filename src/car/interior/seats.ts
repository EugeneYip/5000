/**
 * Seats: two front buckets and the 60/40 folding rear bench, in the period
 * velour. This is where the triangle budget goes, because it is what fills
 * the glass.
 *
 * The two front seats are built from the same description with different
 * numbers — the driver's is set further forward, sits a degree more upright
 * and has had four years more use than the passenger's. Identical mirrored
 * seats are one of the loudest CG tells there is.
 *
 * ## What a C3 seat actually is
 *
 * Measured off `scratchpad/ref3/bat_int_front_seats.jpg` and
 * `bat_int_rear_seats.jpg` — a 1988 US Avant cabin, shot square on:
 *
 *  - Every panel is **bolster · insert · bolster**, and — this is the thing
 *    that was missed twice — the bolsters are **smooth leather** while the
 *    insert between them is **matte suede**. Two materials, not one. On the
 *    backrest each bolster is about a quarter of the panel width and stands
 *    ~45 mm proud, but what makes it read at twenty metres through a window
 *    is the finish change, not the 45 mm. A seat modelled in one cloth has
 *    thrown away its primary cue before any relief is even evaluated, which
 *    is how a seat with correct bolsters still came back looking like a slab.
 *  - The insert is crossed by **transverse** stitched seams — two on the
 *    backrest, two on the cushion. The reference car's inserts carry no
 *    longitudinal flutes at all; the four shallow ones kept here belong to
 *    the velour trim this car wears rather than to that car's leather, and
 *    that disagreement is called out in the stream report rather than
 *    silently resolved.
 *  - A full-width **shoulder roll** across the top of the backrest, above its
 *    own seam, and a nose roll across the front of the cushion. Both are
 *    leather straight across, which is why the insert is cut to pinch out
 *    under them — see `insertWidth` in `soft.ts`.
 *  - The head restraint is an **open loop** in leather, with no cloth on it
 *    anywhere: a fat padded frame with a large rounded-rectangular opening, a
 *    pale welt cord round its outer edge, on two dark posts that are plainly
 *    visible between it and the seat.
 *  - The rear of the front backrest is a **hard plastic shell** with a moulded
 *    map-pocket recess, inset from the upholstery so cloth shows as a border,
 *    and the pocket's own face is made of the seat's suede.
 *
 * ## Which way the one-sided parts face
 *
 * The shells and side shields are single sheets, so their winding decides
 * whether they exist. Three of them were wound inward and were therefore
 * invisible from the only cameras that look at them: the seat-back shell
 * faced *into* the seat (so the `interior` view, which is a camera in the
 * rear seat looking forward, saw nothing but the flat back of the
 * upholstery), and both left-hand side shields were mirrored by negating x
 * without reversing the triangles. They are built once and `mirrored()` now,
 * or explicitly `flipWinding()`ed — see the note in `util.ts`.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext } from '@/types';
import { CABIN, TONE } from './layout';
import { crease, dish, panel, roll, thin, welt, type BolsterSpec, type Frame, type Panel } from './soft';
import {
  clamp, cyl, D2R, flipWinding, lerp, merge, mesh, mirrored, roundedBox, roundedRect,
  smoothstep, surface, tube, type Vec3,
} from './util';
import type { StaticBatch } from './batch';

/**
 * Everything one seat contributes, sorted by the finish it wears.
 *
 * `cloth` is the matte insert only. Every bolster, roll, welt and the whole
 * head restraint are `leather` — see `panel()`'s note on why the material
 * boundary, not the relief, is what makes a bolster read.
 */
interface SeatParts {
  cloth: THREE.BufferGeometry[];
  leather: THREE.BufferGeometry[];
  hard: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  light: THREE.BufferGeometry[];
}

const KEYS = ['cloth', 'leather', 'hard', 'dark', 'light'] as const;

const empty = (): SeatParts => ({ cloth: [], leather: [], hard: [], dark: [], light: [] });

/**
 * File a finished panel under its finishes: insert to cloth, hull and welts to
 * leather. An unsplit panel is all cloth, which is what the bench cushion's
 * underside wants — nobody sees it and it costs a seam not to.
 */
function clad(p: Panel, out: SeatParts, weltR: number, stations: number): void {
  out.cloth.push(p.insert);
  if (p.hull) out.leather.push(p.hull);
  out.leather.push(welt(thin(p.edgeL, stations), weltR), welt(thin(p.edgeR, stations), weltR));
}

function frame(origin: Vec3, runTiltDeg: number): Frame {
  const r = runTiltDeg * D2R;
  const run = new THREE.Vector3(0, Math.cos(r), -Math.sin(r));
  const lat = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(lat, run).normalize();
  return { origin: new THREE.Vector3(...origin), lat, run, up };
}

/** A closed rounded-rectangle path, for piping that follows a moulding. */
function roundedRectPath(w: number, h: number, r: number, arcSeg = 3): Vec3[] {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  const hx = Math.max(1e-4, w / 2 - rr);
  const hy = Math.max(1e-4, h / 2 - rr);
  const corners: Array<[number, number, number]> = [
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
    [hx, -hy, Math.PI * 1.5],
  ];
  const out: Vec3[] = [];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= arcSeg; i++) {
      const a = a0 + (i / arcSeg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Head restraint
// ---------------------------------------------------------------------------

interface HeadRestraint {
  w: number;
  h: number;
  d: number;
  /** Air between the top of the seat back and the bottom of the pad. */
  gap: number;
  /** How far behind the backrest's A-surface plane the pad is centred. */
  standoff: number;
  postHalfSpacing: number;
  postRadius: number;
  /** The light welt round the outer edge. Off where nothing can see it. */
  bead: boolean;
}

/**
 * The open head restraint — [AW-87]'s "four open head restraints".
 *
 * Built as a solid with a real opening rather than a bent tube, because a
 * constant-section tube reads as a doughnut on sticks and this reads as a
 * head restraint.
 *
 * ## The two numbers that matter
 *
 * Measured off the left restraint in `bat_int_rear_seats.jpg`, which is very
 * nearly square on: the pad is 375 x 190 px, its opening 275 x 95 px inside
 * frame rails of 50 px at the sides and 40 px top and bottom. In metres, at a
 * 250 mm pad: **rails of 33 and 28 mm**, so the opening finishes at 0.73 of
 * the width and 0.58 of the height, and the pad's own aspect is 1.97 : 1.
 *
 * The previous pass had 0.65 x 0.37 on a 1.79 : 1 pad, which is a slot in a
 * brick. The opening is most of the point: a solid pad is a bright block in
 * every shot through the side glass, and a loop with 40 % of its area removed
 * lets the dark cabin through it and gives the light something to break
 * against.
 *
 * ## It is leather, not cloth
 *
 * In both reference photographs the head restraints are *entirely* smooth
 * black leather — there is no cloth on them anywhere, on a car whose seat
 * inserts are suede. Trimming them in the seat fabric is what made them the
 * pale blocks the review saw through the glass; a dark, smooth, specular loop
 * is a completely different object in the same light.
 */
function headRestraint(f: Frame, backLen: number, hr: HeadRestraint, rakeDeg: number, out: SeatParts): void {
  const bevel = 0.016;
  const iw = hr.w - 2 * bevel;
  const ih = hr.h - 2 * bevel;

  // The bevel offsets BOTH contours outward from the material: at full depth
  // the silhouette has grown by `bevel` and the opening has *shrunk* by it, so
  // both are specified here at the size they should finish, plus the bevel.
  // The first cut of this asked for a 66 % x 46 % opening and rendered a 53 %
  // x 23 % letterbox, which is where the "no visible opening" read came from.
  const shape = roundedRect(iw, ih, 0.042 - bevel, 5);
  const hole = roundedRect(hr.w * 0.73 + 2 * bevel, hr.h * 0.58 + 2 * bevel, 0.030, 4);
  shape.holes.push(hole);

  const pad = new THREE.ExtrudeGeometry(shape, {
    depth: hr.d - 2 * bevel,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 5,
    steps: 1,
  });
  // ExtrudeGeometry's bevel grows the shape *outward* by `bevelSize` and the
  // extrusion by `bevelThickness` at each end, so the finished pad is exactly
  // w x h x d — and its centre sits at d/2 - bevel, not at the midpoint the
  // obvious translate assumes.
  pad.translate(0, 0, -(hr.d / 2 - bevel));
  pad.computeVertexNormals();

  // Local +Y becomes `run` and local +Z becomes `up` after this rotation, so
  // the pad, the bead and the posts all share the backrest's own axes.
  const centre = f.origin.clone()
    .addScaledVector(f.run, backLen + hr.gap + hr.h / 2)
    .addScaledVector(f.up, hr.standoff);
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    g.rotateX(-rakeDeg * D2R);
    g.translate(centre.x, centre.y, centre.z);
    return g;
  };

  out.leather.push(place(pad));

  if (hr.bead) {
    // A pale welt cord follows the outer edge of the pad. It is a separate
    // light-coloured part in both reference photographs — a piped seam where
    // the two halves of the cover are sewn together, not a bright strip: the
    // earlier chrome version rendered as a single glaring specular streak
    // down one side and nothing anywhere else. A matte cord in the headliner
    // grey catches the whole rim instead, which is what the photograph shows.
    const bead = tube(roundedRectPath(hr.w - 0.004, hr.h - 0.004, 0.042, 4), 0.0028, 5, true, 0.5);
    out.light.push(place(bead));
  }

  // Posts, from inside the pad down into the seat top. Dark grey plastic, not
  // chrome: the close-up of the passenger restraint shows a matt dark post
  // through the opening. The `gap` of bare post between pad and seat is the
  // whole reason the restraint reads as a separate object rather than as a
  // lump grown out of the backrest.
  //
  // The two ratchet notches are the height stops — a C3 restraint has two
  // positions and the notches are cut into the rear of the post. They are
  // ~1 mm deep on an 8 mm post, so they are sub-pixel at any cabin camera;
  // what they actually buy is a break in the specular run down a straight
  // black cylinder, which is visible well before the notch itself is.
  const topRun = backLen + hr.gap + hr.h * 0.30;
  const botRun = backLen - 0.034;
  const len = topRun - botRun;
  for (const s of [-1, 1]) {
    const post = surface(8, 14, true, (i, j, o2) => {
      const a = (i / 8) * Math.PI * 2;
      const u = j / 14;
      // Notches at the two stops, cut only into the back half of the post.
      const notch = Math.max(
        Math.exp(-((u - 0.34) ** 2) / 0.0006),
        Math.exp(-((u - 0.52) ** 2) / 0.0006),
      // `up` points out of the seat's face, so -cos(a) is the rear of the
      // post: the side the pawl engages, and the side every cabin camera —
      // all of which sit behind the front seats — is looking at.
      ) * smoothstep(-0.2, 0.7, -Math.cos(a));
      const r = hr.postRadius * (1 - 0.14 * notch);
      o2.set(Math.sin(a) * r, u * len, Math.cos(a) * r);
    });
    post.rotateX(-rakeDeg * D2R);
    const p = f.origin.clone()
      .addScaledVector(f.run, botRun)
      .addScaledVector(f.up, hr.standoff - 0.012)
      .addScaledVector(f.lat, s * hr.postHalfSpacing);
    post.translate(p.x, p.y, p.z);
    out.dark.push(post);
  }
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

const BACK_LEN = 0.585;

function frontSeat(o: SeatOpts): SeatParts {
  const out = empty();
  const w = o.wear;

  const cushFrontZ = -0.815 + o.slide;
  const cushRearZ = -1.285 + o.slide;
  const cushLen = cushFrontZ - cushRearZ;
  const cushY = 0.606;

  // -- cushion --------------------------------------------------------------
  const cushBolster: BolsterSpec = {
    at: 0.50,
    height: 0.036 - 0.007 * w,
    seam: 0.0060,
    crown: 0.50,
    // Dies into the nose roll at the front; still full height at the back,
    // where the occupant's thighs sit between the two of them.
    fade: (v) => smoothstep(0.03, 0.20, v) * (1 - 0.35 * smoothstep(0.88, 1, v)),
  };
  const cush = panel({
    frame: {
      origin: new THREE.Vector3(0, cushY, cushFrontZ),
      lat: new THREE.Vector3(1, 0, 0),
      run: new THREE.Vector3(0, 0, -1),
      up: new THREE.Vector3(0, 1, 0),
    },
    length: cushLen,
    ring: 48,
    stations: 40,
    capStart: true,
    capEnd: true,
    halfWidth: (v) => 0.220 + 0.032 * Math.sin(Math.PI * clamp(v * 1.05, 0, 1)) - 0.012 * smoothstep(0.82, 1, v),
    depth: (v) => 0.132 + 0.055 * Math.sin(Math.PI * clamp(v * 0.92 + 0.06, 0, 1)) - 0.03 * smoothstep(0.86, 1, v),
    bolsters: cushBolster,
    split: true,
    // Narrow under the nose roll, which is leather straight across, and again
    // at the very back where the cushion tucks under the backrest.
    insertWidth: (v) => lerp(0.10, 1, smoothstep(0.05, 0.11, v)) * lerp(1, 0.40, smoothstep(0.88, 0.96, v)),
    seams: [
      { at: 0.34, depth: 0.0050 },
      { at: 0.70, depth: 0.0042 },
    ],
    flutes: [-0.66, -0.22, 0.22, 0.66],
    fluteDepth: 0.0052,
    seed: o.seed,
    face: (t, v) =>
      // A nose roll at the front, the dish the occupant leaves, and the fold
      // that dish puts across the front third.
      roll(v, 0.0, 0.16, 0.012) - 0.026 * smoothstep(0.09, 0, v)
      + dish(t, v, 0.48, 0.085, 0.016 + 0.010 * w)
      + crease(t, v, 0.22, 0.0040 * (0.4 + w))
      + crease(t, v, 0.62, 0.0026 * (0.4 + w), 0.016)
      // The outboard bolster of a seat people climb over collapses first.
      - (o.side < 0 ? 1 : 0.35) * w * 0.007 * smoothstep(0.62, 0.99, t * o.side) * smoothstep(0.1, 0.4, v),
    back: () => -0.002,
  });
  clad(cush, out, 0.0042, 12);

  // -- backrest -------------------------------------------------------------
  const backFrame = frame([0, cushY - 0.012, cushRearZ + 0.028], o.rakeDeg);
  const backBolster: BolsterSpec = {
    at: 0.52,
    height: 0.046 - 0.009 * w,
    seam: 0.0065,
    crown: 0.52,
    // Up out of the cushion, and gone again where the shoulder roll takes over.
    fade: (v) => smoothstep(0.03, 0.19, v) * (1 - smoothstep(0.74, 0.93, v)),
  };
  const back = panel({
    frame: backFrame,
    length: BACK_LEN,
    ring: 48,
    stations: 44,
    capEnd: true,
    halfWidth: (v) => 0.224 + 0.024 * Math.sin(Math.PI * clamp(v * 0.8 + 0.1, 0, 1)) - 0.050 * smoothstep(0.72, 1, v),
    depth: (v) => 0.115 - 0.032 * smoothstep(0.35, 1, v) + 0.012 * Math.sin(Math.PI * v),
    bolsters: backBolster,
    split: true,
    // Pinched to a tenth under the shoulder roll, so the leather carries the
    // whole width up there exactly as it does in the photograph, and narrowed
    // again at the bottom where the cover is drawn under the frame.
    insertWidth: (v) => lerp(0.10, 1, smoothstep(0.045, 0.085, v)) * lerp(1, 0.10, smoothstep(0.775, 0.815, v)),
    seams: [
      { at: 0.30, depth: 0.0050 },
      { at: 0.56, depth: 0.0046 },
      // The shoulder-roll seam, which runs the full width across the bolsters.
      { at: 0.775, depth: 0.0068, puff: 0.30 },
    ],
    flutes: [-0.65, -0.22, 0.22, 0.65],
    fluteDepth: 0.0052,
    seed: o.seed + 3.7,
    face: (t, v) =>
      roll(v, 0.775, 0.225, 0.015)
      // Lumbar swell, then the hollow a pair of shoulders leaves above it.
      + 0.013 * Math.exp(-((v - 0.27) ** 2) / 0.012) * (1 - Math.abs(t) * 0.5)
      - (0.010 + 0.006 * w) * Math.exp(-((v - 0.64) ** 2) / 0.020) * (1 - Math.abs(t) ** 2 * 0.6)
      + crease(t, v, 0.43, 0.0036 * (0.4 + w), 0.02)
      + crease(t, v, 0.18, 0.0028 * (0.4 + w), 0.014),
    back: (t) => -0.002 * (1 - t * t),
  });
  clad(back, out, 0.0040, 13);

  // 1.97 : 1, off the rear-bench photograph. 90 mm of depth turned the
  // opening into a tunnel that read shut from anywhere off-axis.
  headRestraint(backFrame, BACK_LEN, {
    w: 0.250, h: 0.127, d: 0.076,
    gap: 0.052 + o.headrestUp,
    standoff: -0.020,
    postHalfSpacing: 0.062,
    postRadius: 0.0078,
    bead: true,
  }, o.rakeDeg, out);

  // -- shells, shields and the recliner -------------------------------------
  // Outboard side shield: the moulded panel that hides the frame and the
  // rails. Built once on +x and mirrored, because negating x on its own
  // leaves the left-hand copy wound inside out and therefore invisible.
  const shield = surface(4, 18, false, (i, j, o2) => {
    const v = j / 18;
    const z = lerp(cushFrontZ + 0.012, cushRearZ - 0.012, v);
    const hwid = 0.220 + 0.032 * Math.sin(Math.PI * clamp(v * 1.05, 0, 1));
    // (inset from the cushion's own outline, height) — a top lip that stands
    // just proud, then a face that falls away under it.
    const prof: Array<[number, number]> = [
      [0.000, 0.618], [0.004, 0.586], [0.014, 0.540], [0.018, 0.492], [0.008, 0.452],
    ];
    const q = prof[i];
    o2.set(hwid + 0.010 - q[0], q[1] - 0.022 * smoothstep(0.84, 1, v), z);
  });
  out.hard.push(shield, mirrored(shield));

  // Recliner handwheel, outboard, on the hinge. Manual seats: the 5000 S got
  // the wheel, the CS quattro in the reference photographs has the power
  // switch pack in the same place.
  const hubX = o.side * 0.248;
  const hubY = cushY - 0.014;
  const hubZ = cushRearZ + 0.030;
  const knob = cyl(0.031, 0.029, 0.017, 20);
  knob.rotateZ(Math.PI / 2);
  knob.translate(hubX, hubY, hubZ);
  out.hard.push(knob);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rib = roundedBox(0.019, 0.0048, 0.011, 0.0018, 1, 2);
    rib.rotateX(a);
    rib.rotateZ(Math.PI / 2);
    rib.translate(hubX, hubY + Math.cos(a) * 0.0312, hubZ + Math.sin(a) * 0.0312);
    out.hard.push(rib);
  }

  // The recline hinge, both sides. The handwheel above is outboard, where no
  // camera inside the cabin can reach it — every interior pose sits between
  // or behind the seats and sees the *inboard* hinge, which had nothing on it
  // at all. A real one carries a moulded escutcheon over the pivot with the
  // backrest's own rotating arm coming out of it, and the pair of them is
  // what stops the backrest looking welded to the cushion.
  for (const s of [-1, 1]) {
    const hx = s * 0.246;
    const cover = cyl(0.044, 0.044, 0.013, 16);
    cover.rotateZ(Math.PI / 2);
    cover.translate(hx, hubY, hubZ);
    out.dark.push(cover);
    // The arm, raked with the backrest it drives.
    const arm = roundedBox(0.012, 0.086, 0.030, 0.005, 1, 2);
    arm.rotateX(-o.rakeDeg * D2R);
    arm.translate(hx, hubY + 0.040 * Math.cos(o.rakeDeg * D2R), hubZ - 0.040 * Math.sin(o.rakeDeg * D2R));
    out.dark.push(arm);
  }

  // Height-adjust lever, driver only.
  if (o.side < 0) {
    const lever = roundedBox(0.014, 0.020, 0.115, 0.006, 2, 3);
    lever.rotateX(0.22);
    lever.translate(-0.246, cushY - 0.055, cushRearZ + 0.150);
    out.hard.push(lever);
  }

  backShell(backFrame, out);

  // Seat base: pedestal and rails, seen through the door in every side shot.
  const ped = roundedBox(0.30, 0.075, 0.33, 0.016, 2, 3);
  ped.translate(0, 0.452, (cushFrontZ + cushRearZ) / 2 + 0.01);
  out.hard.push(ped);
  for (const rx of [-0.116, 0.116]) {
    const rail = roundedBox(0.026, 0.028, 0.46, 0.006, 1, 2);
    rail.translate(rx, 0.418, (cushFrontZ + cushRearZ) / 2);
    out.hard.push(rail);
    const foot = roundedBox(0.038, 0.036, 0.050, 0.008, 1, 2);
    foot.translate(rx, 0.400, cushRearZ + 0.06);
    out.hard.push(foot);
  }

  return out;
}

/**
 * The hard plastic panel on the back of a front seat.
 *
 * This is the single most-looked-at surface in the cabin — the `interior`
 * camera sits in the rear seat and looks forward, so everything it sees of the
 * front seats is this panel. The previous pass got it drawn (it had been wound
 * facing into the seat and was simply absent), but what it drew was a black
 * rectangle: `field` was a *uniform* 12 mm step back over everything more than
 * a fifth of the way in from the edge, so across 90 % of the panel it was a
 * constant, which is another way of spelling "flat". A plane with one normal
 * takes one shade of light no matter how good the material is.
 *
 * So the relief is now authored as bands with a length each, in metres:
 *
 *  - a **rim** 14 mm wide standing proud all the way round, which is what
 *    catches the light along the edge and separates the shell from the cloth;
 *  - a **field** that falls away from it over 40 mm and then keeps falling,
 *    very gently, to a low point two-thirds of the way up — a moulded panel
 *    this big is never flat, it is drafted so it will leave the tool;
 *  - a **map pocket** with a lip above it and a floor below, cut 34 mm in;
 *  - a **kick strip** across the bottom, where rear passengers' shoes land.
 *
 * And then the pocket gets a **cloth face**, which is the part that actually
 * does the work. Relief alone cannot rescue this panel: it is the darkest
 * colour in the cabin, it faces directly away from every light in the scene,
 * and a 9 mm step on a surface that takes almost no light is a 9 mm step you
 * cannot see. On the reference car the pocket is made of the same suede as the
 * seat inserts, with the rings embroidered on it — a *lighter* rectangle two
 * thirds of the way up. That is the one thing on the back of a front seat with
 * any tonal separation from the rest of it, and it costs nothing here because
 * the cloth bucket is already being flushed.
 */
const SHELL_V0 = 0.045;
const SHELL_V1 = 0.845;
/** 468 mm of panel, top to bottom. */
const SHELL_RUN = (SHELL_V1 - SHELL_V0) * BACK_LEN;
const POCKET_U = 0.30;
const POCKET_HALF_Y = 0.064;
const POCKET_HALF_X = 0.128;

function backShell(f: Frame, out: SeatParts): void {
  const hwAt = (v: number): number =>
    (0.224 + 0.024 * Math.sin(Math.PI * clamp(v * 0.8 + 0.1, 0, 1)) - 0.050 * smoothstep(0.72, 1, v)) * 0.94;
  const depAt = (v: number): number =>
    0.115 - 0.032 * smoothstep(0.35, 1, v) + 0.012 * Math.sin(Math.PI * v);
  /** The shell's own barrel, before any of the mouldings are cut into it. */
  const shellAt = (t: number, v: number): number => -depAt(v) - 0.005 - 0.010 * (1 - Math.cos(t * 1.5));

  const g = surface(26, 30, false, (i, j, o2) => {
    const t = -1 + (2 * i) / 26;
    const u = j / 30;
    const v = lerp(SHELL_V0, SHELL_V1, u);
    const hw = hwAt(v);

    // How far in from the shell's own outline, in metres of panel.
    const inX = (1 - Math.abs(t)) * hw;
    const inY = Math.min(u, 1 - u) * SHELL_RUN;
    const d = Math.min(inX, inY);

    // The shell is an infinitely thin sheet, so its boundary has to go
    // *somewhere* — and a sheet that simply stops has a raw cut edge which,
    // seen from the rear seat at a shallow angle, renders as a hard-edged
    // facet floating off the corner of the backrest. So the last 12 mm turn
    // back toward the seat and bury themselves 16 mm inside the upholstery,
    // which is where a real shell's flange is anyway: clipped to the frame
    // under the cover, not butted against it.
    const tuck = 0.016 * (1 - smoothstep(0, 0.012, d));
    // Rim, then the drafted field behind it. Apart from the tuck every term
    // is negative, so nothing here can push out through the cloth in front.
    const rim = -0.011 * smoothstep(0.012, 0.048, d);
    const draft = -0.007 * Math.sin(Math.PI * clamp(u * 1.05, 0, 1)) * smoothstep(0.02, 0.08, inX);

    // The pocket: 34 mm deep, with its own lip and floor rather than a
    // smoothstep in and out of nothing.
    const py = (u - POCKET_U) * SHELL_RUN;    // metres from the pocket centre
    const px = Math.abs(t) * hw;
    const inPocket = (1 - smoothstep(POCKET_HALF_Y - 0.012, POCKET_HALF_Y + 0.012, Math.abs(py)))
      * (1 - smoothstep(POCKET_HALF_X - 0.004, POCKET_HALF_X + 0.020, px));
    const pocket = -0.034 * inPocket;
    // A raised welt along the pocket's top edge — the moulded-in seam the
    // elastic is stapled behind.
    const lip = 0.0055 * Math.exp(-((py + POCKET_HALF_Y) ** 2) / 0.00012)
      * (1 - smoothstep(POCKET_HALF_X, POCKET_HALF_X + 0.024, px));

    // Kick strip: a shallow ribbed band along the bottom 70 mm.
    const kickY = (1 - u) * SHELL_RUN;
    const kick = -0.0035 * (1 - smoothstep(0.050, 0.072, kickY))
      * (0.5 + 0.5 * Math.cos(px * 190));

    o2.copy(f.origin)
      .addScaledVector(f.lat, t * hw)
      .addScaledVector(f.run, v * BACK_LEN)
      .addScaledVector(f.up, shellAt(t, v) + tuck + rim + draft + pocket + lip + kick);
  });
  // Wound from (+lat, +run), which puts its normal at +up — into the seat.
  out.hard.push(flipWinding(g));

  // The pocket's cloth face. It hangs 12 mm proud of the pocket floor at its
  // centre and tucks back to it at every edge, the way a slack pocket with a
  // road atlas in it actually sits — flat would read as a painted rectangle.
  const face = surface(14, 10, false, (i, j, o2) => {
    const a = -1 + (2 * i) / 14;
    const b = -1 + (2 * j) / 10;
    const py = b * POCKET_HALF_Y;
    const u = POCKET_U + py / SHELL_RUN;
    const v = lerp(SHELL_V0, SHELL_V1, u);
    const hw = hwAt(v);
    const x = a * POCKET_HALF_X;
    const slack = 0.012 * Math.cos(a * Math.PI * 0.5) ** 1.4 * Math.cos(b * Math.PI * 0.5) ** 0.8;
    o2.copy(f.origin)
      .addScaledVector(f.lat, x)
      .addScaledVector(f.run, v * BACK_LEN)
      .addScaledVector(f.up, shellAt(x / hw, v) - 0.011 - 0.034 + slack);
  });
  out.cloth.push(flipWinding(face));
}

// ---------------------------------------------------------------------------
// Rear bench — 60/40, and it folds, because that is the difference between
// 38.5 and 76.8 cubic feet.
// ---------------------------------------------------------------------------

/** Where the split falls, in metres from the centreline. */
const SPLIT_X = -0.115;
const BENCH_HALF = 0.612;
const BENCH_BACK_Z = -2.398;
const BENCH_BACK_Y = 0.616;
const BENCH_RAKE = 17;
const BENCH_BACK_LEN = 0.498;

function benchCushion(): SeatParts {
  const p = panel({
    frame: {
      origin: new THREE.Vector3(0, 0.652, -1.975),
      lat: new THREE.Vector3(1, 0, 0),
      run: new THREE.Vector3(0, 0, -1),
      up: new THREE.Vector3(0, 1, 0),
    },
    length: 0.425,
    ring: 52,
    stations: 30,
    capStart: true,
    capEnd: true,
    halfWidth: (v) => BENCH_HALF - 0.026 * smoothstep(0.75, 1, v) + 0.012 * Math.sin(Math.PI * v),
    depth: (v) => 0.118 + 0.040 * Math.sin(Math.PI * clamp(v * 0.9 + 0.08, 0, 1)) - 0.045 * smoothstep(0.86, 1, v),
    bolsters: { at: 0.84, height: 0.024, seam: 0.0050, crown: 0.55, fade: (v) => smoothstep(0.04, 0.22, v) },
    split: true,
    insertWidth: (v) => lerp(0.12, 1, smoothstep(0.05, 0.10, v)),
    seams: [
      { at: 0.40, depth: 0.0042 },
      { at: 0.74, depth: 0.0034 },
    ],
    seed: 11.3,
    face: (t, v) =>
      // Three places sculpted into one cushion: two outer dishes and a
      // slightly proud centre that nobody wants to sit on.
      roll(v, 0.0, 0.14, 0.010) - 0.018 * smoothstep(0.09, 0, v)
      + 0.010 * Math.exp(-(t * t) / 0.018)
      + dish(t * 3 + 1.62, v, 0.46, 0.10, 0.011)
      + dish(t * 3 - 1.62, v, 0.46, 0.10, 0.009)
      + crease(t, v, 0.26, 0.0028, 0.02)
      + crease(t, v, 0.62, 0.0022, 0.018),
    back: () => -0.002,
  });
  const out = empty();
  clad(p, out, 0.0040, 12);
  return out;
}

function benchBack(side: 1 | -1): SeatParts {
  // side -1 is the narrow 40 % section, +1 the wide 60 %.
  const inner = SPLIT_X + side * 0.006;
  const outer = side * BENCH_HALF;
  const cx = (inner + outer) / 2;
  const half = Math.abs(outer - inner) / 2;

  const f = frame([cx, BENCH_BACK_Y, BENCH_BACK_Z], BENCH_RAKE);
  const out = empty();
  const len = BENCH_BACK_LEN;
  // The 40 % section is 230 mm narrower, so a bolster of the same width in
  // metres has to sit at a larger |t| on it.
  const at = side > 0 ? 0.76 : 0.70;

  const p = panel({
    frame: f,
    length: len,
    ring: side > 0 ? 44 : 36,
    stations: 34,
    capEnd: true,
    halfWidth: (v) => half - 0.012 * smoothstep(0.86, 1, v),
    depth: (v) => 0.090 - 0.016 * smoothstep(0.4, 1, v) + 0.008 * Math.sin(Math.PI * v),
    bolsters: {
      at,
      height: 0.030,
      seam: 0.0055,
      crown: 0.50,
      fade: (v) => smoothstep(0.04, 0.20, v) * (1 - smoothstep(0.72, 0.92, v)),
    },
    split: true,
    insertWidth: (v) => lerp(0.10, 1, smoothstep(0.05, 0.095, v)) * lerp(1, 0.10, smoothstep(0.755, 0.80, v)),
    seams: [
      { at: 0.34, depth: 0.0042 },
      { at: 0.755, depth: 0.0060, puff: 0.30 },
    ],
    seed: side > 0 ? 5.1 : 8.9,
    face: (t, v) =>
      roll(v, 0.755, 0.245, 0.013)
      + 0.008 * Math.exp(-((v - 0.30) ** 2) / 0.016)
      + crease(t, v, 0.48, 0.0026, 0.02),
    back: (t) => -0.002 * (1 - t * t),
  });
  clad(p, out, 0.0038, 12);

  // Head restraint, outboard position only. No bright bead back here: the
  // rear restraints are behind every interior camera and sub-pixel through
  // the rear glass, and a chrome bucket on each folding half would cost two
  // draws out of a budget that is already over.
  const hrFrame: Frame = {
    origin: f.origin.clone().addScaledVector(f.lat, side * (half - 0.170)),
    lat: f.lat, run: f.run, up: f.up,
  };
  headRestraint(hrFrame, len, {
    w: 0.238, h: 0.134, d: 0.082,
    gap: 0.030,
    standoff: -0.016,
    postHalfSpacing: 0.058,
    postRadius: 0.0072,
    bead: false,
  }, BENCH_RAKE, out);

  // Hard backing — this is the load floor once the seat is folded, so it gets
  // the same rim-and-field treatment as the front shells.
  const shell = surface(18, 16, false, (i, j, o2) => {
    const t = -1 + (2 * i) / 18;
    const u = j / 16;
    const v = lerp(0.03, 0.90, u);
    const hwid = (half - 0.012 * smoothstep(0.86, 1, v)) * 0.97;
    const dep = 0.090 - 0.016 * smoothstep(0.4, 1, v) + 0.008 * Math.sin(Math.PI * v);
    // In metres of board, not in parameters: `half` is 360 mm on the 60 and
    // 245 mm on the 40, so the same figure in `t` was a different rim on each.
    const d = Math.min((1 - Math.abs(t)) * hwid, Math.min(u, 1 - u) * 0.87 * len);
    // Bury the boundary in the upholstery — see the note on the front shell.
    const tuck = 0.014 * (1 - smoothstep(0, 0.011, d));
    o2.copy(f.origin)
      .addScaledVector(f.lat, t * hwid)
      .addScaledVector(f.run, v * len)
      .addScaledVector(f.up, -dep - 0.004 + tuck - 0.010 * smoothstep(0.012, 0.044, d)
        - 0.006 * (1 - Math.cos(t * 1.3)));
  });
  out.hard.push(flipWinding(shell));

  return out;
}

// ---------------------------------------------------------------------------

export function buildSeats(ctx: BuildContext, batch: StaticBatch): { group: THREE.Group; articulations: Articulation[] } {
  const group = new THREE.Group();
  group.name = 'seats';
  const fabric = ctx.materials.fabric();
  const hardMat = ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.74 });
  /**
   * The bolsters, rolls, welts and head restraints.
   *
   * `TONE.leatherette` is an alias onto `TONE.trim`, and `interiorPlastic`
   * snaps roughness to `CABIN_RUNGS` — so 0.70 lands on the 0.67 rung, which
   * is the material the centre console's shift gaiter and the load bay's
   * vinyl already share. Every one of those goes to the cabin's static batch,
   * so the whole two-material seat costs **no extra draw at all**: the
   * leather simply joins a bucket that was already being flushed.
   *
   * It is a shade darker than the cloth and much smoother, which is the
   * relationship the reference car has between its leather and its suede.
   */
  const leatherMat = ctx.materials.interiorPlastic({ color: TONE.leatherette, roughness: 0.70 });
  // Already in the cabin's batch from four other modules, so the head
  // restraint posts and the pale welt both cost nothing in draws either.
  const darkMat = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 });
  const lightMat = ctx.materials.interiorPlastic({ color: TONE.bright, roughness: 0.42 });
  const articulations: Articulation[] = [];

  // Driver: forward on its rails, a degree more upright, four years more use.
  const driver = frontSeat({ side: -1, slide: 0.030, rakeDeg: CABIN.seatBackRakeDeg - 1.5, wear: 1.0, headrestUp: 0.006, seed: 1.7 });
  const pass = frontSeat({ side: 1, slide: -0.048, rakeDeg: CABIN.seatBackRakeDeg + 3.5, wear: 0.42, headrestUp: -0.024, seed: 6.4 });

  // Not mirrored: each bucket is built for the side it sits on, so the
  // recliner wheel and the height lever land outboard on both and the two
  // seats are never each other's reflection.
  //
  // Nothing in front articulates — the 60/40 backs below are the only seats
  // that move — so the seat's X offset is baked in and each finish goes to
  // the cabin's static batch as one contribution. Eight meshes become none.
  const buckets = benchCushion();
  for (const [s, seat] of [[-1, driver], [1, pass]] as Array<[number, SeatParts]>) {
    const dx = s * CABIN.seatX;
    for (const key of KEYS) {
      if (seat[key].length) buckets[key].push(merge(seat[key]).translate(dx, 0, 0));
    }
  }
  for (const [key, material] of [
    ['cloth', fabric], ['leather', leatherMat], ['hard', hardMat],
    ['dark', darkMat], ['light', lightMat],
  ] as Array<[typeof KEYS[number], THREE.Material]>) {
    if (buckets[key].length) batch.add(material, merge(buckets[key]));
  }

  for (const side of [1, -1] as Array<1 | -1>) {
    const b = benchBack(side);
    const pivot = new THREE.Group();
    pivot.name = side > 0 ? 'rearBack60' : 'rearBack40';
    pivot.position.set(0, BENCH_BACK_Y, BENCH_BACK_Z);

    const local = (geos: THREE.BufferGeometry[]): THREE.BufferGeometry =>
      merge(geos).translate(0, -BENCH_BACK_Y, -BENCH_BACK_Z);

    pivot.add(mesh(local(b.cloth), fabric, `${pivot.name}Cloth`));
    // Everything that is not the cloth insert goes out as one mesh in the
    // leather. A folding half cannot use the static batch, so each material
    // it wears is a draw of its own — and the bolsters, the rolls, the welts,
    // the restraint, the posts and the moulded board behind them are all the
    // same trim colour, separated in the real car by finish rather than by
    // hue. Taking them at the leather's roughness rather than the board's
    // costs a little gloss on the board, which for moulded ABS is if anything
    // more right, and it keeps the rear bench at the two draws per half it
    // already cost.
    pivot.add(mesh(
      local([...b.leather, ...b.hard, ...b.dark, ...b.light]),
      leatherMat,
      `${pivot.name}Shell`,
    ));
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

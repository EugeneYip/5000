/**
 * The dashboard moulding.
 *
 * On a C3 the dash is one soft mass in one dark colour, running the full
 * width, with a pronounced brow over the centre stack and a deep binnacle
 * hood in front of the driver. It is also the single most visible interior
 * surface from outside the car: it faces the windscreen, and the windscreen
 * is enormous and nearly flush. So it gets built as a proper lofted moulding
 * rather than a box, and it is kept resolutely semi-matte — a shiny dash top
 * is both historically wrong and something no manufacturer would ever sign
 * off, because it would be reflected straight back at the driver.
 *
 * The moulding is a blend between two hand-written cross-sections: the plain
 * one that runs most of the width, and the binnacle one, which doubles back
 * on itself to form the hood, the cluster cavity and its lower lip. Lerping
 * between them across X is what a real moulding does, and it means the hood
 * can never drift away from the surface it grows out of.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { CABIN, PACK, TONE, packSection, packSightline, screenY, softMin } from './layout';
import type { StaticBatch } from './batch';
import {
  clamp, cyl, fbm, lerp, merge, mesh, mirrored, roundedBox, roundedRect, slab, smoothstep, surface, type Vec3,
} from './util';

/**
 * Where the binnacle sits across the car: the pack's own centre, not a second
 * reading of `HP.interior.steeringCenter` — which is on the car's right, and
 * which is what put the binnacle, the bolster and every switch on the fascia
 * on the wrong flank. One number, in `layout.ts`, and the hood cannot drift
 * off the pack it covers.
 */
const DX = PACK.centre[0];
const FRONT_Z = CABIN.dashFrontZ;

/**
 * How far the hood reaches back over the dial face.
 *
 * It was 138 mm, which put the lip 44 mm above a face it overhung by more
 * than its own height — a lid, not a hood. A real C3's projects nearer 70 mm.
 */
const HOOD_REACH = 0.070;

/** Air the hood's ceiling keeps above the driver's sightline at the lip. */
const HOOD_CLEAR = 0.0066;

type P2 = [number, number];

/** Nothing on the dash top may reach the glass; it has to run out beneath it. */
function underScreen(z: number, y: number, gap = 0.013, k = 0.012): number {
  return softMin(y, screenY(z) - gap, k);
}

/** Plain section, (z, y), windscreen → under-dash. 36 stations. */
function plainSection(): P2[] {
  const p: P2[] = [];
  for (let i = 0; i < 12; i++) {
    const s = i / 11;
    const z = lerp(FRONT_Z, -0.700, s);
    p.push([z, underScreen(z, 1.0468 + 0.0092 * Math.sin(Math.PI * s ** 0.72))]);
  }
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * Math.PI * 0.5;
    p.push([-0.700 - 0.0125 * Math.sin(a), 1.0280 + 0.0175 * Math.cos(a)]);
  }
  const fz = (y: number): number => -0.7125 + (1.028 - y) * CABIN.fasciaRake;
  for (let i = 1; i <= 12; i++) {
    const y = lerp(1.028, 0.846, i / 12);
    p.push([fz(y), y]);
  }
  for (let i = 1; i <= 7; i++) {
    const s = i / 7;
    const y = lerp(0.846, CABIN.dashBottomY, s);
    // The fascia tucks forward under itself into the knee bolster.
    p.push([fz(y) + 0.058 * s * s, y]);
  }
  return p;
}

/**
 * Binnacle section: up the brow, back along the crown to the rear lip,
 * forward again along the hood's ceiling onto the top of the instrument
 * pack's rim, then down *behind* the pack and out underneath it.
 *
 * Two rules, and the section exists to obey them:
 *
 * 1. **Nothing in it may pass in front of the pack.** The previous version
 *    ran its "bezel" 10 mm in front of the dial face — and because this is a
 *    loft with no hole in it, that was not a bezel, it was a wall across the
 *    whole binnacle. It is what the 8–12/255 "cluster" in `renders/dash3`
 *    actually was: the dash pad, with the odometer reset knob poking through
 *    it. The run past the pack is therefore struck from `packSection()` on
 *    the far side of the print, where the pack's own rim covers the joint.
 *
 * 2. **Nothing in it may cross the driver's line of sight to the pack.**
 *    `packSightline()` is that line, struck from `DRIVER_EYE` through the
 *    top-front corner of the rim — the pack's silhouette edge. The ceiling
 *    leaves from that exact corner and climbs away from the line all the way
 *    back to the lip, so the margin only ever grows.
 *
 * The brow runs close to the windscreen where it passes over the pack: see
 * `BROW_GAP`.
 */

/**
 * Standoff the brow keeps from the windscreen, against the 13 mm the rest of
 * the dash top keeps.
 *
 * Not a liberty — a consequence. `HP.interior.clusterCenter` at y 1.032 puts
 * the pack's own rim 10 mm under the screen chord, so a hood that meets the
 * top of that rim, as any hood must, cannot also stay 13 mm clear. The chord
 * is the conservative reading of a screen that is really bowed outward, and
 * the surface this applies to is a dark moulding a centimetre under dark
 * glass. Reported with the stream: 1.032 is ~15 mm high for this package.
 */
const BROW_GAP = 0.004;

function binnacleSection(): P2[] {
  const p: P2[] = [];

  // The pack's silhouette edge: top-front corner of the rim. Everything the
  // hood does is measured from here.
  const [rimZ, rimY] = packSection(PACK.halfH + PACK.rim, PACK.rimDepth);
  const LIP_Z = PACK.centre[2] - HOOD_REACH;
  const CEIL_LIP = packSightline(LIP_Z) + HOOD_CLEAR;
  const CEIL_RIM = rimY + 0.0020;
  const BROW_RIM = rimY + 0.0045;
  const LIP_Y = CEIL_LIP + 0.0045;

  // -- the brow, 12 stations ------------------------------------------------
  // Stations are bunched where the section turns: the leading face climbs out
  // of the dash top over the 60 mm just forward of the pack, and one station
  // lands on `rimZ` so the crown starts exactly where the pack ends.
  const TOE_Z = rimZ + 0.060;
  const at = [0, 0.10, 0.21, 0.32, 0.43, 0.52, 0.61, 0.69, 0.77, 0.85, 0.93, 1];
  for (const t of at) {
    const z = lerp(FRONT_Z, LIP_Z, t);
    const onPad = z >= TOE_Z;
    const y = onPad
      ? 1.0468
      : z >= rimZ
        ? lerp(1.0468, BROW_RIM, smoothstep(0, 1, (TOE_Z - z) / (TOE_Z - rimZ)))
        : lerp(BROW_RIM, LIP_Y, (rimZ - z) / (rimZ - LIP_Z));
    p.push([z, onPad ? underScreen(z, y) : underScreen(z, y, BROW_GAP, 0.004)]);
  }

  // -- the lip, 5 stations --------------------------------------------------
  // The rear rim rolls back and under to a thin edge; this is the one part of
  // the hood the driver sees end-on.
  p.push(
    [LIP_Z - 0.0028, LIP_Y - 0.0010],
    [LIP_Z - 0.0040, LIP_Y - 0.0026],
    [LIP_Z - 0.0030, CEIL_LIP + 0.0006],
    [LIP_Z + 0.0002, CEIL_LIP],
    [LIP_Z + 0.0050, CEIL_LIP - 0.0016],
  );

  // -- the ceiling, 6 stations ----------------------------------------------
  // Straight from the lip onto the rim. Its slope is steeper than the
  // sightline's, so clearance is least where they meet and grows from there.
  for (let i = 1; i <= 6; i++) {
    const s = i / 6;
    p.push([lerp(LIP_Z + 0.0050, rimZ, s), lerp(CEIL_LIP - 0.0016, CEIL_RIM, s)]);
  }

  // -- the aperture, 6 stations ---------------------------------------------
  // Over the top of the rim, then straight down 1.5 mm behind the print. The
  // pack is 16 mm proud of this, so from the eye — which is on the face
  // normal — the rim covers the joint exactly.
  const hTop = PACK.halfH + PACK.rim;
  p.push(packSection(hTop, 0.0010));
  for (let i = 0; i < 5; i++) {
    p.push(packSection(lerp(hTop - 0.004, -hTop, i / 4), -0.0015));
  }

  // -- out under the cluster to the fascia, 7 stations -----------------------
  const [outZ, outY] = packSection(-hTop, -0.0015);
  const fz = (y: number): number => -0.7125 + (1.028 - y) * CABIN.fasciaRake;
  for (let i = 1; i <= 7; i++) {
    const s = i / 7;
    const y = lerp(outY, CABIN.dashBottomY, s ** 0.85);
    const z = lerp(outZ, fz(y) + 0.058 * s * s, smoothstep(0, 0.45, s));
    p.push([z, y]);
  }
  return p;
}

/** Half width of the moulding at path station v — it narrows as it goes down. */
function dashHalfW(v: number): number {
  return CABIN.dashHalfW - 0.086 * smoothstep(0.46, 0.92, v);
}

function buildMoulding(): THREE.BufferGeometry {
  const plain = plainSection();
  const binn = binnacleSection();
  // The loft lerps the two sections station for station, so they have to be
  // the same length. The binnacle is now five blocks with hand-set counts and
  // getting one of them wrong throws out of `surface()` with nothing that
  // points back here.
  if (plain.length !== binn.length) {
    throw new Error(`dash: ${plain.length} plain stations vs ${binn.length} binnacle`);
  }
  const NV = plain.length - 1;
  const NU = 100;

  return surface(NU, NV, false, (i, j, out) => {
    const u = i / NU;
    const v = j / NV;
    const hw = dashHalfW(v);
    const x = lerp(-hw, hw, u);

    // Binnacle: a flat-topped blend so the hood has parallel sides rather
    // than fading away like a Gaussian bump.
    const k = 1 - smoothstep(0.186, 0.272, Math.abs(x - DX));
    const kk = k * k * (3 - 2 * k);
    let z = lerp(plain[j][0], binn[j][0], kk);
    let y = lerp(plain[j][1], binn[j][1], kk);

    // Bay for the centre stack, so the dash top reads as a brow and the stack
    // sits in a recess rather than on the face.
    //
    // It was 350 mm wide at full depth and closed again at v 0.94, which is
    // 40 mm above where the stack now ends: the bay has to be the stack's own
    // width (250 mm) and has to run the stack's full height, or the panel's
    // bottom third stands 21 mm proud of a fascia that has closed up behind
    // it. v 0.982 is the tuck station at y 0.694, which is the panel's lower
    // edge — `console.ts` PANEL.
    const bay = (1 - smoothstep(0.128, 0.150, Math.abs(x))) * smoothstep(0.42, 0.52, v) * (1 - smoothstep(0.985, 1.0, v));
    z += bay * 0.021;

    // Ends lift and roll forward into the A-pillars.
    const end = smoothstep(0.70, CABIN.dashHalfW, Math.abs(x));
    y += end * 0.016 * smoothstep(0.30, 0.0, v);
    z += end * 0.030 * smoothstep(0.55, 1.0, v);

    // A dash pad is vacuum-formed over foam: it is never dead flat.
    const relax = smoothstep(0.02, 0.10, v) * (1 - smoothstep(0.90, 1.0, v));
    y += fbm(x * 5.2, 2.7, v * 3.1, 2) * 0.0013 * relax;
    out.set(x, y, z);
  });
}

// ---------------------------------------------------------------------------
// Vents
// ---------------------------------------------------------------------------

/** A corrugated trough: the windscreen defroster and the side demisters. */
function grille(x0: number, x1: number, zc: number, halfDepth: number, y: number, ribs: number, nu: number): THREE.BufferGeometry {
  const nv = ribs * 4;
  return surface(nu, nv, false, (i, j, out) => {
    const x = lerp(x0, x1, i / nu);
    const t = j / nv;
    const phase = t * ribs * Math.PI * 2;
    // Square-ish corrugation: flat lands, steep walls, a dark floor.
    const c = Math.cos(phase);
    const d = -0.0115 * (0.5 - 0.5 * Math.sign(c) * Math.abs(c) ** 0.35);
    const fade = Math.sin(Math.PI * clamp(t * 1.04 - 0.02, 0, 1)) ** 0.4;
    out.set(x, y + d * fade - 0.001, zc - halfDepth + t * halfDepth * 2);
  });
}

/**
 * A knurled roller: a lathe whose radius scallops along its own axis.
 *
 * Both the block's vane wheels and its big inboard shut-off roller are this
 * part at two sizes, and the ribbing is the whole reason either of them reads
 * — a plain cylinder at 8 mm diameter is a grey smudge, while the scallops
 * catch a row of highlights that says "you turn this". Axis is +Y; the first
 * and last rings collapse onto it, which caps both ends for two free rows.
 */
function knurledRoller(r: number, len: number, ribs: number, nu: number, nv: number): THREE.BufferGeometry {
  return surface(nu, nv + 2, true, (i, j, out) => {
    const u = (i / nu) * Math.PI * 2;
    const t = clamp((j - 1) / nv, 0, 1);
    const cap = j === 0 || j === nv + 2;
    const rr = cap ? 0 : r * (1 - 0.15 * (0.5 - 0.5 * Math.cos(t * ribs * Math.PI * 2)));
    out.set(Math.cos(u) * rr, (t - 0.5) * len, Math.sin(u) * rr);
  });
}

/** Outer bezel and aperture of the outboard louvre block, in metres. */
const LV = {
  apertureW: 0.180,
  apertureH: 0.070,
  /** Inboard section that carries the shut-off roller, then a partition. */
  rollerBay: 0.032,
  partition: 0.005,
  /** Each of the two vane bays, and the post between them. */
  bay: 0.068,
  divider: 0.007,
  vanes: 5,
  /** Cross-ribs tying the vanes together, which is what makes it read as mesh. */
  ribs: 2,
  frame: 0.009,
} as const;

/**
 * The outboard louvre block.
 *
 * The part this replaced was one bay of five **horizontal** blades with a
 * thumbwheel outside the bezel, built from a §5.1 paragraph that described a
 * vent this car does not have. `bat_int_dash_wide.jpg` (1600-2048, 540-920)
 * and `bat_int_dash_passenger.jpg` (1180-1760, 0-300) both show the real one:
 * a **two-bay block with five VERTICAL vanes per bay**, two horizontal
 * cross-ribs over them, a **knurled roller standing in the centre of each
 * bay**, and a third, larger ribbed roller — the shut-off — on a recessed
 * panel at the block's inboard edge with a small eyelet above it and a bright
 * detent dot below.
 *
 * Two things about the old one were separately wrong and worth recording,
 * because the second is the same bug `c46e5e8` found three times on the
 * centre stack:
 *
 * - **The bezel was a solid `roundedBox` 1.2 mm in front of the blades**, and
 *   `w + 0.016 × h + 0.016` covers the aperture entirely. All five blades and
 *   the cavity behind them were inside it, so the part rendered as a blank
 *   slab whatever was built behind the frame. The bezel here is a real frame:
 *   an extruded rounded rect with a rounded-rect *hole*, so the aperture is a
 *   hole in the geometry and the bevel gives its lip a radius.
 * - The thumbwheel sat `w/2 + 0.010` outboard of the aperture, i.e. **on the
 *   dash pad beside the vent**, not on the part.
 *
 * Sizing. The internal proportions are measured — they are ratios along one
 * direction inside one small planar patch, so the obliquity of both
 * photographs cancels. The absolute size is *not* a measurement and is
 * flagged as such: the aperture keeps the 70 mm height the single-bay part
 * had (unchallenged, and boxed in by the dash-pad seam at y 1.028 above and
 * the glovebox lid's top edge at 0.945 below), and the width follows from the
 * measured aperture aspect. Image aspect along the block's own edges is 1.94
 * on the passenger frame; the fascia is seen there at roughly 45° so the true
 * aspect is near 1.94/cos45° ≈ 2.7, which at 70 mm gives 170-200 mm. 180 mm
 * is also what the layout wants: 32 + 5 + 68 + 7 + 68. Both sides of that
 * agreeing is the only reason to trust it.
 *
 * `inb` is +1 when the car's centreline is at +x from the block, so the
 * roller panel goes on the correct edge of each of the two blocks.
 */
function louvreBlock(cx: number, cy: number, inb: number): { dark: THREE.BufferGeometry[]; bright: THREE.BufferGeometry[] } {
  const dark: THREE.BufferGeometry[] = [];
  const bright: THREE.BufferGeometry[] = [];
  const AW = LV.apertureW;
  const AH = LV.apertureH;

  /** Local x of a point `a` metres inboard-to-outboard across the aperture. */
  const px = (a: number): number => inb * (AW / 2 - a);
  /** Distance across the aperture at which each section starts. */
  const A_ROLLER = 0;
  const A_PART = LV.rollerBay;
  const A_BAY1 = A_PART + LV.partition;
  const A_DIV = A_BAY1 + LV.bay;
  const A_BAY2 = A_DIV + LV.divider;

  // -- bezel ----------------------------------------------------------------
  const outline = roundedRect(AW + LV.frame * 2, AH + LV.frame * 2, 0.008, 3);
  outline.holes.push(new THREE.Path(roundedRect(AW, AH, 0.005, 3).getPoints(3)));
  const bez = new THREE.ExtrudeGeometry(outline, {
    depth: 0.009, bevelEnabled: true, bevelSize: 0.0018, bevelThickness: 0.0018,
    bevelSegments: 1, curveSegments: 3, steps: 1,
  });
  bez.computeVertexNormals();
  // Front face of the bevel sits 4 mm proud of the fascia.
  bez.translate(0, 0, 0.004 - (0.009 + 0.0018));
  dark.push(bez);

  // Cavity. Everything in the aperture is seen against this, so it runs the
  // whole block rather than one box per bay.
  const cavity = roundedBox(AW - 0.003, AH - 0.003, 0.048, 0.002, 1, 2);
  cavity.translate(0, 0, -0.038);
  dark.push(cavity);

  // -- inboard shut-off roller, on its own recessed panel -------------------
  const panel = roundedBox(LV.rollerBay + LV.partition, AH - 0.002, 0.004, 0.0012, 1, 1);
  panel.translate(px((A_ROLLER + A_BAY1) / 2), 0, -0.010);
  dark.push(panel);

  const shut = knurledRoller(0.0068, 0.032, 7, 10, 12);
  shut.translate(px(A_ROLLER + LV.rollerBay / 2), 0, -0.0078);
  bright.push(shut);
  // The eyelet above it and the detent dot below are both distinct in the
  // photographs and are what stops the panel reading as a blank recess.
  const eye = cyl(0.0030, 0.0030, 0.003, 6);
  eye.rotateX(Math.PI / 2);
  eye.translate(px(A_ROLLER + LV.rollerBay / 2), 0.0245, -0.0095);
  dark.push(eye);
  const dot = cyl(0.0022, 0.0022, 0.003, 6);
  dot.rotateX(Math.PI / 2);
  dot.translate(px(A_ROLLER + LV.rollerBay / 2 + 0.006), -0.0265, -0.0095);
  bright.push(dot);

  // -- posts ----------------------------------------------------------------
  for (const [a, w] of [[A_PART, LV.partition], [A_DIV, LV.divider]] as const) {
    const post = roundedBox(w, AH - 0.002, 0.015, 0.0010, 1, 1);
    post.translate(px(a + w / 2), 0, -0.0055);
    dark.push(post);
  }

  // -- the two vane bays ----------------------------------------------------
  for (const a0 of [A_BAY1, A_BAY2]) {
    const pitch = LV.bay / (LV.vanes + 1);
    for (let k = 0; k < LV.vanes; k++) {
      const vane = roundedBox(0.0026, AH - 0.006, 0.014, 0.0008, 1, 1);
      // A vent nobody has touched in thirty years does not have its vanes
      // dead parallel; the wheel that drives them has backlash.
      vane.rotateY(0.035 * Math.sin(k * 2.1 + a0 * 40));
      vane.translate(px(a0 + pitch * (k + 1)), 0, -0.002);
      dark.push(vane);
    }
    for (let k = 0; k < LV.ribs; k++) {
      const rib = roundedBox(LV.bay - 0.001, 0.0022, 0.006, 0.0007, 1, 1);
      rib.translate(px(a0 + LV.bay / 2), (k + 1) / (LV.ribs + 1) * (AH - 0.006) - (AH - 0.006) / 2, -0.001);
      dark.push(rib);
    }
    // Second stage: the horizontal blade set, behind the vanes. A fluted wall
    // rather than four free slats — at this size the read is the banding, and
    // the banding costs 56 triangles instead of 240.
    const back = surface(2, 14, false, (i, j, out) => {
      const t = j / 14;
      out.set(
        px(a0 + LV.bay * (i / 2)),
        (t - 0.5) * (AH - 0.006),
        -0.024 - 0.0065 * (0.5 - 0.5 * Math.cos(t * 4 * Math.PI * 2)),
      );
    });
    dark.push(back);

    const wheel = knurledRoller(0.0042, 0.023, 6, 8, 8);
    wheel.translate(px(a0 + LV.bay / 2), 0, -0.0062);
    bright.push(wheel);
  }

  // Into the fascia frame: the block is a flat part on a raked face, so it is
  // built square and laid on once rather than each piece being rotated.
  const zFace = -0.7125 + (1.028 - cy) * CABIN.fasciaRake + 0.004;
  const tilt = Math.atan(CABIN.fasciaRake);
  for (const g of [...dark, ...bright]) {
    g.rotateX(tilt);
    g.translate(cx, cy, zFace);
  }
  return { dark, bright };
}

// ---------------------------------------------------------------------------

export function buildDash(ctx: BuildContext, batch: StaticBatch): void {

  const padMat = ctx.materials.interiorPlastic({ color: TONE.dashPad, roughness: 0.86 });
  const faceMat = ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.78 });
  const darkMat = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.84 });
  const brightMat = ctx.materials.interiorPlastic({ color: TONE.bright, roughness: 0.42 });

  batch.add(padMat, buildMoulding());

  // Windscreen defroster: one long slotted trough along the leading edge.
  const vents: THREE.BufferGeometry[] = [];
  vents.push(grille(-0.694, 0.694, FRONT_Z - 0.016, 0.028, 1.0452, 22, 76));
  // Side-window demisters, coarser and rectangular, at each outboard end.
  const side = grille(0.606, 0.742, -0.474, 0.030, 1.0535, 5, 10);
  vents.push(side, mirrored(side));

  // Everything dark and moulded on the fascia is one colour and one finish,
  // and none of it moves: the defroster grilles, the louvres, the glovebox
  // lid, the fuse door and the two rotaries go out as one draw.
  const dark: THREE.BufferGeometry[] = [...vents];
  const bright: THREE.BufferGeometry[] = [];

  // Outboard louvres, one each side. The shut-off roller is on the block's
  // inboard edge, so the panel faces the centreline on both sides: at +x the
  // centreline is at -x from the block, hence -s.
  for (const s of [-1, 1]) {
    const l = louvreBlock(s * 0.618, 0.9845, -s);
    dark.push(...l.dark);
    bright.push(...l.bright);
  }
  // The centre louvres are NOT up here. Three 104 x 48 blocks used to sit at
  // y 1.0115, spread over 330 mm right under the brow — a vent row the car
  // does not have. On `bat3_int_dash_console.jpg` and `bat_int_dash_wide.jpg`
  // the centre vents are the top bay of the centre stack, one tall three-bay
  // block beside the clock, and there is nothing at all between them and the
  // brow. `console.ts` builds it.

  // Glovebox: a wide lid with a small round lock and no handle. Passenger's
  // side, so -X — the car's right.
  const lid = slab(0.516, 0.206, 0.020, 0.009, 2);
  lid.rotateX(Math.atan(CABIN.fasciaRake));
  lid.translate(-0.452, 0.842, -0.6925 + 0.006);
  dark.push(lid);
  const lock = cyl(0.0105, 0.0105, 0.010, 14);
  lock.rotateX(Math.PI / 2 + Math.atan(CABIN.fasciaRake));
  lock.translate(-0.664, 0.845, -0.6895);
  bright.push(lock);

  // Knee bolster / lower dash on the driver's side, with the fuse lid.
  const bolsterG = surface(12, 5, false, (i, j, out) => {
    const x = lerp(0.742, 0.088, i / 12);
    const v = j / 5;
    const y = lerp(0.792, CABIN.dashBottomY - 0.012, v);
    const z = -0.7125 + (1.028 - y) * CABIN.fasciaRake + 0.052 * v * v + 0.010 * Math.sin(Math.PI * v);
    out.set(x, y, z - 0.004);
  });
  batch.add(faceMat, bolsterG);

  const fuse = slab(0.168, 0.086, 0.012, 0.006, 1);
  fuse.rotateX(0.5);
  fuse.translate(0.556, 0.706, -0.618);
  dark.push(fuse);

  // Headlamp rotary and the instrument rheostat, outboard of the column.
  const knobProfile = (r: number, h: number): THREE.BufferGeometry => {
    const g = cyl(r * 0.92, r, h, 18);
    g.rotateX(Math.PI / 2 + Math.atan(CABIN.fasciaRake));
    return g;
  };
  const hl = knobProfile(0.0235, 0.020);
  hl.translate(0.632, 0.9015, -0.6845);
  dark.push(hl);
  const rheo = knobProfile(0.0155, 0.016);
  rheo.translate(0.556, 0.8985, -0.6865);
  dark.push(rheo);
  const hlFlat = slab(0.016, 0.030, 0.006, 0.002, 1);
  hlFlat.rotateX(Math.atan(CABIN.fasciaRake));
  hlFlat.translate(0.632, 0.9015, -0.6745);
  bright.push(hlFlat);

  batch.add(darkMat, merge(dark));
  batch.add(brightMat, merge(bright));
}


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
import { HP } from '@/car/hardpoints';
import { CABIN, TONE, screenY, softMin } from './layout';
import {
  clamp, cyl, D2R, fbm, lerp, merge, mesh, mirrored, roundedBox, slab, smoothstep, surface, type Vec3,
} from './util';

const DX = HP.interior.steeringCenter[0];
const FRONT_Z = CABIN.dashFrontZ;

type P2 = [number, number];

/** Nothing on the dash top may reach the glass; it has to run out beneath it. */
function underScreen(z: number, y: number): number {
  return softMin(y, screenY(z) - 0.013, 0.012);
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
 * Binnacle section: over the hood, down its rear lip, forward along the
 * cavity ceiling, down the bezel, then back out under the cluster.
 */
function binnacleSection(): P2[] {
  const p: P2[] = [];
  // Over the hood. It crests above the lens and its rear rim curls down to a
  // thin lip, which is what shades the glass from the windscreen.
  const CREST = 1.1005;
  const LIP_Z = -0.7130;
  for (let i = 0; i < 12; i++) {
    const s = i / 11;
    const up = smoothstep(0, 0.58, s);
    const down = smoothstep(0.62, 1.0, s);
    const z = lerp(FRONT_Z, LIP_Z, s);
    p.push([z, underScreen(z, lerp(1.0468, CREST, up) - down * 0.0240)]);
  }
  const lip: P2[] = [
    [LIP_Z - 0.0034, 1.0645], [LIP_Z - 0.0044, 1.0600],
    [LIP_Z - 0.0018, 1.0568], [LIP_Z + 0.0042, 1.0558], [LIP_Z + 0.0108, 1.0570],
  ];
  p.push(...lip);
  // Cavity ceiling, running forward to just above the top of the lens.
  for (let i = 1; i <= 6; i++) {
    const s = i / 6;
    p.push([lerp(LIP_Z + 0.0108, -0.5540, s), lerp(1.0570, 1.0965, s ** 0.8)]);
  }
  // Down the bezel, parallel to the lens.
  const tilt = 16 * D2R;
  for (let i = 1; i <= 6; i++) {
    const h = lerp(0.0565, -0.0575, i / 6);
    p.push([-0.575 + Math.sin(tilt) * h - 0.0100, 1.032 + Math.cos(tilt) * h]);
  }
  const outZ = -0.575 + Math.sin(tilt) * -0.0575 - 0.0100;
  const outY = 1.032 + Math.cos(tilt) * -0.0575;
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

    // Shallow bay for the centre stack, so the dash top reads as a brow.
    const bay = (1 - smoothstep(0.175, 0.235, Math.abs(x))) * smoothstep(0.42, 0.52, v) * (1 - smoothstep(0.86, 0.94, v));
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

/** An adjustable louvre: the housing, the blades, and the thumbwheel. */
function louvre(cx: number, cy: number, w: number, h: number, blades: number, thumbSide: number): { dark: THREE.BufferGeometry[]; bright: THREE.BufferGeometry[] } {
  const dark: THREE.BufferGeometry[] = [];
  const bright: THREE.BufferGeometry[] = [];
  const zFace = -0.7125 + (1.028 - cy) * CABIN.fasciaRake + 0.004;
  const tilt = Math.atan(CABIN.fasciaRake);

  // Housing: a rectangular bezel with a dark box behind it.
  const bez = roundedBox(w + 0.016, h + 0.016, 0.016, 0.005, 2, 3);
  bez.rotateX(tilt);
  bez.translate(cx, cy, zFace - 0.008);
  dark.push(bez);
  const boxg = roundedBox(w, h, 0.052, 0.003, 1, 2);
  boxg.rotateX(tilt);
  boxg.translate(cx, cy, zFace - 0.040);
  dark.push(boxg);

  for (let i = 0; i < blades; i++) {
    const t = (i + 0.5) / blades;
    const by = cy + (t - 0.5) * h * 0.94;
    const b = roundedBox(w - 0.008, h / blades * 0.78, 0.014, 0.0012, 1, 2);
    // Blades are set a few degrees off flat and not all identically — a vent
    // nobody has touched in thirty years does not have parallel blades.
    b.rotateX(-0.16 + (i % 3) * 0.018 + tilt);
    b.translate(cx, by, zFace - 0.012);
    dark.push(b);
  }

  const wheel = cyl(h * 0.30, h * 0.30, 0.010, 14);
  wheel.rotateZ(Math.PI / 2);
  wheel.rotateY(Math.PI / 2);
  wheel.rotateX(tilt);
  wheel.translate(cx + thumbSide * (w / 2 + 0.010), cy, zFace - 0.006);
  bright.push(wheel);
  return { dark, bright };
}

// ---------------------------------------------------------------------------

export function buildDash(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dash';

  const padMat = ctx.materials.interiorPlastic({ color: TONE.dashPad, roughness: 0.86 });
  const faceMat = ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.78 });
  const darkMat = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.84 });
  const brightMat = ctx.materials.interiorPlastic({ color: TONE.bright, roughness: 0.42 });

  group.add(mesh(buildMoulding(), padMat, 'dashMoulding'));

  // Windscreen defroster: one long slotted trough along the leading edge.
  const vents: THREE.BufferGeometry[] = [];
  vents.push(grille(-0.694, 0.694, FRONT_Z - 0.016, 0.028, 1.0452, 22, 76));
  // Side-window demisters, coarser and rectangular, at each outboard end.
  const side = grille(0.606, 0.742, -0.474, 0.030, 1.0535, 5, 10);
  vents.push(side, mirrored(side));
  group.add(mesh(merge(vents), darkMat, 'dashVents'));

  const dark: THREE.BufferGeometry[] = [];
  const bright: THREE.BufferGeometry[] = [];

  // Outboard louvres, one each side, thumbwheel inboard as on the real car.
  for (const s of [-1, 1]) {
    const l = louvre(s * 0.618, 0.9845, 0.152, 0.070, 5, -s);
    dark.push(...l.dark);
    bright.push(...l.bright);
  }
  // Centre block under the brow: three sections, finer blades.
  for (const cx of [-0.113, 0, 0.113]) {
    const l = louvre(cx, 1.0115, 0.104, 0.048, 4, cx === 0 ? 0 : 0);
    dark.push(...l.dark);
  }

  // Glovebox: a wide lid with a small round lock and no handle.
  const lid = slab(0.516, 0.206, 0.020, 0.009, 2);
  lid.rotateX(Math.atan(CABIN.fasciaRake));
  lid.translate(0.452, 0.842, -0.6925 + 0.006);
  dark.push(lid);
  const lock = cyl(0.0105, 0.0105, 0.010, 14);
  lock.rotateX(Math.PI / 2 + Math.atan(CABIN.fasciaRake));
  lock.translate(0.664, 0.845, -0.6895);
  bright.push(lock);

  // Knee bolster / lower dash on the driver's side, with the fuse lid.
  const bolsterG = surface(12, 5, false, (i, j, out) => {
    const x = lerp(-0.742, -0.088, i / 12);
    const v = j / 5;
    const y = lerp(0.792, CABIN.dashBottomY - 0.012, v);
    const z = -0.7125 + (1.028 - y) * CABIN.fasciaRake + 0.052 * v * v + 0.010 * Math.sin(Math.PI * v);
    out.set(x, y, z - 0.004);
  });
  group.add(mesh(bolsterG, faceMat, 'kneeBolster'));

  const fuse = slab(0.168, 0.086, 0.012, 0.006, 1);
  fuse.rotateX(0.5);
  fuse.translate(-0.556, 0.706, -0.618);
  dark.push(fuse);

  // Headlamp rotary and the instrument rheostat, outboard of the column.
  const knobProfile = (r: number, h: number): THREE.BufferGeometry => {
    const g = cyl(r * 0.92, r, h, 18);
    g.rotateX(Math.PI / 2 + Math.atan(CABIN.fasciaRake));
    return g;
  };
  const hl = knobProfile(0.0235, 0.020);
  hl.translate(-0.632, 0.9015, -0.6845);
  dark.push(hl);
  const rheo = knobProfile(0.0155, 0.016);
  rheo.translate(-0.556, 0.8985, -0.6865);
  dark.push(rheo);
  const hlFlat = slab(0.016, 0.030, 0.006, 0.002, 1);
  hlFlat.rotateX(Math.atan(CABIN.fasciaRake));
  hlFlat.translate(-0.632, 0.9015, -0.6745);
  bright.push(hlFlat);

  group.add(mesh(merge(dark), darkMat, 'dashDetail'));
  group.add(mesh(merge(bright), brightMat, 'dashBright'));
  return group;
}


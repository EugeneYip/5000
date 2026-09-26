/**
 * The grille — seven bright slats, eight apertures, four rings.
 *
 * Counted off 2048 px photography of a MY1988 North-American car: seven slats
 * between the bright upper and lower frame members, apertures roughly twice
 * the slat thickness so the grille reads dark overall, even pitch, dead
 * horizontal (`docs/REFERENCE-VEHICLE.md` §6.1). `HP.front.grilleSlats` is the
 * count; the pitch falls out of it and the aperture height, so neither is a
 * free number here.
 *
 * A slat is not a plane. It has a rounded bright leading edge, a top face that
 * runs back and slightly down, and an underside that drops further — which is
 * what puts a hard shadow across the aperture below it and gives the grille
 * its depth. Behind the slats the recess is genuinely deep and genuinely dark,
 * with the radiator core just readable in it.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import { fourRings, ringsWidth } from './rings';
import { noseFaceZ } from './bodyref';
import { arc, at, lerp, merge, mesh, roundedBox, sweep, type Frame, type Pt } from './util';

const F = HP.front;

/** Depth of a slat, front to back. */
const SLAT_DEPTH = 0.0175;
/** Where the slat fronts sit: the quoted recess behind the grille datum. */
const SLAT_Z = F.grilleZ - F.grilleRecess;
/** The dark box behind the slats, and the core in front of its back wall. */
const BACK_Z = SLAT_Z - 0.052;
const CORE_Z = SLAT_Z - 0.030;

/** 2 : 1 open to solid, so seven slats and eight apertures fill the opening. */
function pitch(): { slat: number; aperture: number } {
  const n = F.grilleSlats;
  const height = F.grilleTopY - F.grilleBottomY;
  const slat = height / (n + 2 * (n + 1));
  return { slat, aperture: slat * 2 };
}

/**
 * Section of one slat, in (z back from its front face, y about its centre).
 *
 * The bright face is FLAT with a small radius top and bottom, not a half-round
 * nose: a rounded nose only catches light along one wire-thin line and the
 * grille then reads as a set of wires rather than blades. §6.1 calls the slats
 * "thin, flat-faced, bright, with a rounded leading edge" — the radius is the
 * edge break, not the whole front.
 */
function slatSection(t: number): Pt[] {
  const r = t / 2;
  const fr = r * 0.40;
  const d = SLAT_DEPTH;
  return [
    ...arc(-fr, -r + fr, fr, -Math.PI / 2, 0, 3),
    [0, r - fr],
    ...arc(-fr, r - fr, fr, 0, Math.PI / 2, 3),
    // Top face runs back and drops a little — you see it from above.
    [-d + 0.0015, r - 0.0014],
    [-d, r - 0.0024],
    // Back edge, then the underside, which sits lower than the leading edge so
    // it throws a clean shadow onto the slat below.
    [-d, -r - 0.0052],
    [-d + 0.0020, -r - 0.0054],
    [-fr - 0.0004, -r - 0.0004],
  ];
}

function slats(): THREE.BufferGeometry {
  const { slat, aperture } = pitch();
  const hw = F.grilleHalfW - 0.004;
  const parts: THREE.BufferGeometry[] = [];

  // The nose face is very slightly convex across the grille; the slats follow
  // it, which is why they are swept rather than boxed.
  const frames: Frame[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = lerp(-hw, hw, i / n);
    const zf = SLAT_Z - (noseFaceZ(0, F.grilleTopY) - noseFaceZ(x, F.grilleTopY));
    frames.push({
      o: new THREE.Vector3(x, 0, zf),
      r: new THREE.Vector3(0, 0, 1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }

  for (let k = 0; k < F.grilleSlats; k++) {
    const y = F.grilleBottomY + aperture + slat / 2 + k * (aperture + slat);
    const g = sweep(slatSection(slat), frames, { closed: true, capStart: true, capEnd: true });
    g.translate(0, y, 0);
    parts.push(g);
  }
  return merge(parts);
}

/** Outline of the aperture: a wide slot with softened corners. */
function apertureRing(inset: number): { pts: THREE.Vector2[]; out: THREE.Vector2[] } {
  const hw = F.grilleHalfW - inset;
  const hh = (F.grilleTopY - F.grilleBottomY) / 2 - inset;
  const cy = (F.grilleTopY + F.grilleBottomY) / 2;
  const r = Math.min(0.016, hh * 0.55);
  const corner = (cx: number, ccy: number, a0: number): THREE.Vector2[] =>
    arc(cx, ccy, r, a0, a0 + Math.PI / 2, 5).map(([x, y]) => new THREE.Vector2(x, y));
  const pts = [
    ...corner(hw - r, cy + hh - r, 0),
    ...corner(-(hw - r), cy + hh - r, Math.PI / 2),
    ...corner(-(hw - r), cy - hh + r, Math.PI),
    ...corner(hw - r, cy - hh + r, 1.5 * Math.PI),
  ];
  return { pts, out: pts.map((p) => new THREE.Vector2(p.x, p.y - cy)) };
}

function ringFrames(pts: readonly THREE.Vector2[], faceZ: (x: number, y: number) => number): Frame[] {
  const n = pts.length;
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    // Outward in the face plane, walking the outline anticlockwise.
    const r = new THREE.Vector3(t.y, -t.x, 0);
    frames.push({ o: new THREE.Vector3(p.x, p.y, faceZ(p.x, p.y)), r, u: new THREE.Vector3(0, 0, 1) });
  }
  return frames;
}

export function buildGrille(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'grille';

  const chromeBright = ctx.materials.chrome();
  const chromeSlat = ctx.materials.chrome({ roughness: 0.15 });
  const dark = ctx.materials.blackTrim();

  const faceZ = (x: number, y: number): number => noseFaceZ(x, y);

  // --- bright surround -----------------------------------------------------
  // A slim bead capping the aperture edge, continuous with the headlamp
  // bezels' top and bottom legs (§2.1) so the nose reads as one band.
  const bead: Pt[] = [
    [-0.0010, -0.0060],
    [-0.0010, 0.0000],
    [0.0004, 0.0026],
    [0.0028, 0.0042],
    [0.0060, 0.0047],
    [0.0092, 0.0041],
    [0.0110, 0.0024],
    [0.0116, -0.0004],
    [0.0116, -0.0070],
  ];
  const beadRing = apertureRing(0);
  group.add(mesh('grilleSurround', sweep(bead, ringFrames(beadRing.pts, faceZ), { uvScale: 0.05 }), chromeBright));

  // --- recess walls --------------------------------------------------------
  const wall: Pt[] = [
    [0.0004, 0.0004],
    [-0.0016, -0.0090],
    [-0.0030, -0.0260],
    [-0.0034, SLAT_Z - F.grilleZ - 0.010],
    [-0.0034, BACK_Z - F.grilleZ],
  ];
  group.add(mesh('grilleRecess', sweep(wall, ringFrames(beadRing.pts, faceZ), { uvScale: 0.05 }), dark));

  // --- back panel and a hint of radiator core ------------------------------
  const hw = F.grilleHalfW - 0.004;
  const hh = (F.grilleTopY - F.grilleBottomY) / 2 - 0.002;
  const cy = (F.grilleTopY + F.grilleBottomY) / 2;
  const backPanel = at(roundedBox(hw * 2 + 0.01, hh * 2 + 0.01, 0.006, 0.002), [0, cy, BACK_Z]);

  const fins: THREE.BufferGeometry[] = [];
  const finPitch = 0.0098;
  const count = Math.floor((hw * 2) / finPitch);
  for (let i = 0; i <= count; i++) {
    const x = -hw + i * finPitch + (hw * 2 - count * finPitch) / 2;
    // Plain boxes: seventy fins behind eight slots, none of whose edges are
    // ever resolved, is not where the triangle budget should go.
    fins.push(at(new THREE.BoxGeometry(0.0016, hh * 2 - 0.004, 0.009), [x, cy, CORE_Z]));
  }
  // Two header tanks, so the core reads as a radiator and not as a grid.
  fins.push(at(roundedBox(hw * 2 - 0.01, 0.010, 0.012, 0.003), [0, cy + hh - 0.008, CORE_Z]));
  fins.push(at(roundedBox(hw * 2 - 0.01, 0.010, 0.012, 0.003), [0, cy - hh + 0.008, CORE_Z]));
  group.add(mesh('radiatorCore', merge([backPanel, ...fins]), dark));

  // --- slats ---------------------------------------------------------------
  group.add(mesh('grilleSlats', slats(), chromeSlat));

  // --- the rings ----------------------------------------------------------
  // §2.1 describes a "solid black central bar" behind them, but §6.1's much
  // better photography shows the rings standing proud of the slat plane and
  // *overlapping several slat pitches* — so the slats run on behind them and
  // read through the openings. A backing bar would fill the rings with black
  // and turn them into four discs. Only the mounting spigots are modelled.
  const ringsW = ringsWidth();
  for (const sx of [-1, 1]) {
    group.add(mesh(
      `grilleBadgeMount${sx > 0 ? 'R' : 'L'}`,
      at(roundedBox(0.012, 0.012, 0.030, 0.004),
        [F.ringsCenter[0] + sx * ringsW * 0.22, F.ringsCenter[1] - F.ringDiameter * 0.42, SLAT_Z + 0.020]),
      dark,
    ));
  }

  const rings = fourRings();
  rings.translate(F.ringsCenter[0], F.ringsCenter[1], F.ringsCenter[2]);
  group.add(mesh('fourRingsFront', rings, chromeBright));

  return group;
}

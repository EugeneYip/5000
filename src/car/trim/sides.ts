/**
 * The flanks: rubbing strips, door handles, fuel flap, weatherstrip.
 *
 * Two of these are model-year tells and both are settled in
 * `docs/REFERENCE-VEHICLE.md`:
 *
 *  · **Recessed pull door handles.** The flush handle arrives with the
 *    January 1988 European facelift, which reaches the US only with MY1989 and
 *    the rename to Audi 100 (§6.8). A MY1988 5000 S is pre-facelift
 *    throughout, so the handle sits in a pressed pocket with the lever
 *    pivoting out of it.
 *  · **The rubbing strip carries a thin bright line along its top edge**
 *    (§6.10) — but *not* the red-and-gold pinstripe on the car that evidence
 *    came from, which is a dealer decor item and appears in no factory list.
 *
 * The strip is swept along the body's own surface rather than along a straight
 * line, because the flank has 19° of tumblehome at strip height and a strip
 * built on a plane would sink into the door at the middle and lift off it at
 * the ends.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import { placeOnSkin, sideNormal, sidePoint, skinFrame, roofEdgeNormal, roofEdgePoint, type SkinFrame } from './bodyref';
import { badgeText } from './glyphs';
import {
  at, clamp, dish, framesFrom, lathe, lerp, merge, mesh, mirrorX, offsetPolyline,
  roundedBox, smoothstep, sweep, type Frame, type Pt,
} from './util';

const S = HP.side;

// ---------------------------------------------------------------------------
// Frames along the flank
// ---------------------------------------------------------------------------

/** Frames from the tail forward, so the section's up vector comes out up. */
function flankFrames(zRear: number, zFront: number, y: number, n: number): Frame[] {
  const pts: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const z = lerp(zRear, zFront, i / n);
    pts.push(sidePoint(z, y));
    nor.push(sideNormal(z, y));
  }
  return framesFrom(pts, nor);
}

// ---------------------------------------------------------------------------
// Rubbing strip
// ---------------------------------------------------------------------------

const HH = S.rubStripHeight / 2;

/** Outer face of the moulding: a soft crown, fullest a little above centre. */
const STRIP_FACE: Pt[] = [
  [0.0000, HH],
  [0.0058, HH - 0.0022],
  [0.0104, HH - 0.0064],
  [0.0132, HH - 0.0134],
  [0.0142, HH - 0.0250],
  [0.0132, -HH + 0.0150],
  [0.0102, -HH + 0.0068],
  [0.0054, -HH + 0.0022],
  [0.0000, -HH],
];

function stripSection(scale: number): Pt[] {
  const face = STRIP_FACE.map(([x, y]) => [x * scale, y * scale] as Pt);
  return [...face, [-0.016, -HH * scale], [-0.016, HH * scale]];
}

function rubbingStrip(): { body: THREE.BufferGeometry; bright: THREE.BufferGeometry } {
  const frames = flankFrames(S.rubStripRearZ, S.rubStripFrontZ, S.rubStripY, 86);
  const span = Math.abs(S.rubStripFrontZ - S.rubStripRearZ);
  const capFrac = 0.045 / span;

  const body = sweep(
    (_j, t) => stripSection(lerp(0.55, 1, smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1)))),
    frames,
    { closed: true, capStart: true, capEnd: true, uvScale: 0.25 },
  );

  // The bright line along the top edge, offset off the moulding's own profile
  // so the two can never drift apart.
  const line = offsetPolyline(STRIP_FACE.slice(0, 4), -0.0014);
  const bright = sweep(
    (_j, t) => {
      const k = smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1));
      return line.map(([x, y]) => [x * lerp(0.55, 1, k), y * lerp(0.55, 1, k)] as Pt);
    },
    frames,
    { uvScale: 0.25 },
  );
  return { body, bright };
}

// ---------------------------------------------------------------------------
// Door handles — pre-facelift recessed pull
// ---------------------------------------------------------------------------

/**
 * Pre-facelift recessed pull handle (§6.8).
 *
 * A pocket pressed into the door skin — body-coloured, because it *is* the
 * door skin — with a black lever across its top and the finger gap under it.
 * The lock barrel goes on the driver's door only, which on a LHD car is the
 * left one.
 */
function handle(f: SkinFrame, withLock: boolean): {
  pocket: THREE.BufferGeometry;
  lever: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
} {
  const [w, h, d] = S.handleSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, dx: number, dy: number, dn: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(
      f.o.x + f.along.x * dx + f.up.x * dy + f.n.x * dn,
      f.o.y + f.along.y * dx + f.up.y * dy + f.n.y * dn,
      f.o.z + f.along.z * dx + f.up.z * dy + f.n.z * dn,
    );
    return g;
  };

  const pocket = place(dish(w + 0.030, h + 0.030, d, { shape: 4.2, rim: 0.0010, floor: 0.46 }), 0, 0, 0);
  // Lever across the top of the pocket; the gap beneath it is the finger hole.
  const lever = place(roundedBox(w - 0.014, h * 0.54, 0.015, 0.0038), -0.002, h * 0.26, -0.0098);

  const bright: THREE.BufferGeometry[] = [];
  if (withLock) {
    const barrel = lathe([
      [0, 0.0030], [0.0062, 0.0029], [0.0082, 0.0018], [0.0088, 0],
      [0.0104, -0.0012], [0.0104, -0.0090], [0, -0.0090],
    ], 18);
    barrel.rotateX(Math.PI / 2);
    bright.push(place(barrel, w / 2 + 0.020, 0, 0.0016));
  }

  return { pocket, lever, bright: merge(bright) };
}

// ---------------------------------------------------------------------------
// Fuel flap
// ---------------------------------------------------------------------------

function fuelFlap(f: SkinFrame): { well: THREE.BufferGeometry; flap: THREE.BufferGeometry } {
  const [w, h] = S.fuelFlapSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(f.o.x + f.n.x * lift, f.o.y + f.n.y * lift, f.o.z + f.n.z * lift);
    return g;
  };
  const well = place(roundedBox(w + 0.006, h + 0.006, 0.040, 0.010), -0.021);
  const flap = place(roundedBox(w - QUALITY.panelGap * 2, h - QUALITY.panelGap * 2, 0.012, 0.009), 0.0005);
  return { well, flap };
}

// ---------------------------------------------------------------------------

export function buildSides(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sideTrim';

  const plastic = ctx.materials.bumperPlastic();
  const bright = ctx.materials.chrome({ roughness: 0.2 });
  const dark = ctx.materials.blackTrim();
  const paint = ctx.materials.paint();
  const seal = ctx.materials.rubber({ roughness: 0.96 });

  // --- rubbing strip -------------------------------------------------------
  const strip = rubbingStrip();
  group.add(mesh('rubStrip', merge([strip.body, mirrorX(strip.body)]), plastic));
  group.add(mesh('rubStripLine', merge([strip.bright, mirrorX(strip.bright)]), bright));

  // Small oval "audi" on the front-fender section of the moulding, just aft of
  // the front wheel arch (§2.6).
  {
    const z = -0.424;
    const f = skinFrame(z, S.rubStripY + 0.002);
    const oval = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), dark);
    oval.name = 'fenderBadgeGroundRight';
    oval.scale.set(1, 0.40, 1);
    placeOnSkin(oval, f, 0.0146);
    const text = badgeText('audi', 0.0092, { depth: 0.0012, tracking: 0.02, weight: '500' });
    const txt = new THREE.Mesh(text, bright);
    txt.name = 'fenderBadgeRight';
    placeOnSkin(txt, f, 0.0148);
    const ovalL = oval.clone(); ovalL.position.x *= -1; ovalL.scale.x *= -1; ovalL.name = 'fenderBadgeGroundLeft';
    const txtL = txt.clone(); txtL.position.x *= -1; txtL.scale.x *= -1; txtL.name = 'fenderBadgeLeft';
    group.add(oval, txt, ovalL, txtL);
  }

  // --- door handles --------------------------------------------------------
  const pockets: THREE.BufferGeometry[] = [];
  const levers: THREE.BufferGeometry[] = [];
  const locks: THREE.BufferGeometry[] = [];
  for (const [z, isFront] of [[S.handleFrontCenter[2], true], [S.handleRearCenter[2], false]] as const) {
    const right = handle(skinFrame(z, S.handleFrontCenter[1]), false);
    pockets.push(right.pocket, mirrorX(right.pocket));
    levers.push(right.lever, mirrorX(right.lever));
    // LHD car: the lock barrel is on the driver's — left-hand — front door.
    if (isFront) {
      const left = handle(skinFrame(z, S.handleFrontCenter[1]), true);
      locks.push(mirrorX(left.bright));
    }
  }
  group.add(mesh('doorHandlePockets', merge(pockets), paint));
  group.add(mesh('doorHandleLevers', merge(levers), dark));
  group.add(mesh('doorLock', merge(locks), bright));

  // --- fuel flap: left-hand quarter on this car ---------------------------
  {
    const f = skinFrame(S.fuelFlapCenter[2], S.fuelFlapCenter[1]);
    const parts = fuelFlap(f);
    group.add(mesh('fuelWell', mirrorX(parts.well), dark));
    group.add(mesh('fuelFlap', mirrorX(parts.flap), paint));
  }

  // --- belt weatherstrip under the DLO ------------------------------------
  {
    const frames = flankFrames(HP.glass.dloRearZ, HP.glass.dloFrontZ, HP.beltY - 0.007, 48);
    const sec: Pt[] = [
      [0.0000, 0.0085], [0.0042, 0.0072], [0.0060, 0.0030],
      [0.0056, -0.0028], [0.0030, -0.0068], [0.0000, -0.0082],
      [-0.0090, -0.0082], [-0.0090, 0.0085],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('beltSeal', merge([g, mirrorX(g)]), seal));
  }

  // --- roof-to-bodyside moulding, in place of a drip rail (§2.2) ----------
  {
    const pts: THREE.Vector3[] = [];
    const nor: THREE.Vector3[] = [];
    const z0 = HP.roof.dPillarZ;
    const z1 = -1.24;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n);
      pts.push(roofEdgePoint(z));
      nor.push(roofEdgeNormal(z));
    }
    const frames = framesFrom(pts, nor);
    const sec: Pt[] = [
      [0.0000, 0.0110], [0.0032, 0.0096], [0.0044, 0.0040],
      [0.0038, -0.0040], [0.0016, -0.0098], [0.0000, -0.0112],
      [-0.0070, -0.0112], [-0.0070, 0.0110],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('roofMoulding', merge([g, mirrorX(g)]), dark));
  }

  void at;
  return group;
}

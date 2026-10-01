/**
 * The box the cabin lives in: floor pan and carpet, transmission tunnel,
 * headliner, pillar trim, sills and the firewall.
 *
 * None of this is what anyone photographs, and all of it is what makes the
 * car read as *occupied* from outside. An empty shell lets the eye run
 * straight through the side glass to the sky, which is exactly the fault this
 * module exists to fix: the floor stops the view going down, the headliner
 * stops it going up, and the pillar trim gives the glass something to be
 * bounded by.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { HP } from '@/car/hardpoints';
import {
  CABIN, ROOF_FRONT_Z, ROOF_REAR_Z, TONE, headlinerShoulder, headlinerY, innerHalfW, skinHalfW,
} from './layout';
import {
  DLO, FLUSH, PILLAR_SLIM_Z, SIDE_THICK, T as GT, aPillarLower, dloBotT, dloTopT, glassPoint,
  surfaceDir, tDloRear, zAtPillarFront, Z as GZ,
} from '@/car/glass/aperture';
import { dtFor } from '@/car/body/surface';
import { clamp, fbm, flipWinding, lerp, merge, mesh, mirrored, smoothstep, surface, type Vec3 } from './util';
import type { StaticBatch } from './batch';

const TAIL = HP.tailZ;

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------

/** Height of the pressed steel floor under the carpet. */
function floorHeight(x: number, z: number): number {
  const ax = Math.abs(x);

  // Longitudinal steps: deep footwells, up at the seat crossmember, up again
  // over the rear axle.
  let y: number = lerp(CABIN.footwellY, CABIN.floorY, smoothstep(-1.34, -1.02, z));
  y = lerp(y, CABIN.rearFloorY, smoothstep(-2.10, -1.86, z));

  // Toe board: the floor turns up hard into the bulkhead.
  y += smoothstep(-0.62, -0.40, z) * 0.20 * (1 - smoothstep(0.55, 0.74, ax));

  // Transmission tunnel. A longitudinal five needs a big one, and it is the
  // single most visible thing on the cabin floor.
  const t = 1 - smoothstep(CABIN.tunnelHalfW, CABIN.tunnelHalfW + 0.105, ax);
  y = lerp(y, Math.max(y, CABIN.tunnelTopY), t * t * (3 - 2 * t));

  // Sill: the floor turns up to meet the rocker.
  y += smoothstep(0.585, 0.70, ax) * 0.13;

  // Under the rear seat the pan lifts over the tank.
  y += smoothstep(-2.34, -2.16, z) * 0.085;
  return y;
}

function buildFloor(ctx: BuildContext): THREE.Object3D[] {
  const nu = 52;
  const nv = 66;
  const z0 = -0.40;
  const z1 = CABIN.cargoFloorFrontZ;
  const g = surface(nu, nv, false, (i, j, out) => {
    const u = i / nu;
    const v = j / nv;
    const x = lerp(-0.735, 0.735, u);
    const z = lerp(z0, z1, v);
    // Cut pile is never flat: it lifts over the crossmembers and takes a
    // shallow trough along the heel line.
    const nap = fbm(x * 9, 3.1, z * 7, 2) * 0.0035;
    const heel = -0.006 * Math.exp(-((z + 0.80) ** 2) / 0.012) * (1 - smoothstep(0.30, 0.52, Math.abs(x)));
    out.set(x, floorHeight(x, z) + 0.011 + nap + heel, z);
  });
  const carpet = mesh(g, ctx.materials.carpet(), 'carpet');

  // Sill plates: the bright tread where the carpet stops at the door.
  const sill: THREE.BufferGeometry[] = [];
  for (const zs of [[-0.46, -1.57], [-1.61, -2.56]]) {
    const s = surface(2, 14, false, (i, j, out) => {
      const z = lerp(zs[0], zs[1], j / 14);
      const prof: Array<[number, number]> = [[0.0, 0.0], [0.052, 0.004], [0.062, -0.004]];
      const q = prof[i];
      out.set(-(0.700 - q[0]), floorHeight(-0.70, z) + 0.016 + q[1], z);
    });
    sill.push(s, mirrored(s));
  }
  /**
   * Satin alloy tread, **not chrome**.
   *
   * `chrome({ roughness: 0.38 })` lands on the 0.300 rung of `CHROME_RUNGS`,
   * i.e. a mirror, and this is a 2.1 m strip lying almost flat under an open
   * pane on each side of the car. It was the single brightest object in the
   * cabin from every interior pose — a white bar running the length of the
   * car, clipped with a bloom halo — and it is what a review reading the door
   * cards will blame on the door cards: on the `cabinL` pose it lands within
   * 20 px of the card's own trim line, and `pick` at fy 0.475-0.490 returns
   * `cabin:chrome:0.300` at x 0.64-0.67 with `doorTrim` behind it.
   *
   * A sill tread plate is brushed or ribbed alloy. `TONE.bright` at 0.42 is
   * the instance `dash.ts` already dresses its fascia markings with, so this
   * costs no material and batches with them.
   */
  const sillMesh = mesh(merge(sill), ctx.materials.interiorPlastic({ color: TONE.bright, roughness: 0.42 }), 'sillPlates');

  return [carpet, sillMesh];
}

/**
 * Floor mats. A thirty-year-old car has them, they sit a few millimetres
 * proud of the carpet with a bound edge, and the driver's has been shoved
 * forward by a heel a thousand times.
 */
function buildMats(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const mat = (cx: number, cz: number, hw: number, hz: number, skew: number, seed: number): void => {
    parts.push(surface(12, 14, false, (i, j, out) => {
      const u = (i / 12) * 2 - 1;
      const v = (j / 14) * 2 - 1;
      // Rounded corners, and the whole mat rotated a degree or two out of
      // square because nobody ever puts one back straight.
      const k = 1 - 0.22 * Math.max(0, Math.abs(u) + Math.abs(v) - 1.05) ** 1.4;
      const x0 = u * hw * k;
      const z0 = v * hz * k;
      const x = cx + x0 * Math.cos(skew) - z0 * Math.sin(skew);
      const z = cz + x0 * Math.sin(skew) + z0 * Math.cos(skew);
      // Bound edge stands proud; the middle has been trodden flat.
      const edge = smoothstep(0.80, 0.99, Math.max(Math.abs(u), Math.abs(v)));
      const y = floorHeight(x, z) + 0.0175 + edge * 0.0035 - 0.0015 * (1 - edge)
        + fbm(x * 11 + seed, 7, z * 9, 2) * 0.0016;
      out.set(x, y, z);
    }));
  };
  // Driver's first, and the driver is on +X: the mat that has been shoved
  // forward is the one under the pedals, not the one in front of the glovebox.
  mat(CABIN.seatX, -0.640, 0.186, 0.196, -0.035, 1.3);
  mat(-CABIN.seatX, -0.662, 0.186, 0.196, 0.012, 4.1);
  mat(CABIN.seatX - 0.02, -1.790, 0.176, 0.170, 0.02, 7.7);
  mat(-CABIN.seatX + 0.02, -1.790, 0.176, 0.170, -0.015, 9.2);
  return mesh(merge(parts), ctx.materials.fabric({ color: 0x26282c }), 'floorMats');
}

// ---------------------------------------------------------------------------
// Headliner
// ---------------------------------------------------------------------------
//
// This is the part that closes the cabin, and it was doing none of it. Three
// separate faults, each of which on its own leaves the roof open to the sky:
//
//   1. It was wound (i → +x, j → −z), which puts the normal at +y. A one-sided
//      sheet facing the sky is invisible from underneath — the whole 2.6 m² of
//      it — and behind it the roof skin is another one-sided shell facing the
//      same way, so the cabin was simply open.
//   2. It stopped at z −3.016, 92 mm short of the tailgate hinge, leaving a
//      full-width slot at the back of the roof.
//   3. It was flat at `BODY.height − 0.046` while the real roof falls 77 mm
//      over the back of the cabin, so from about z −2.9 it stood *above* the
//      skin it was supposed to hang under.
//
// Rebuilt as what it is: a moulded board with a thickness, crowned across the
// car, following the roof skin's own fall, running the full length of the
// fixed roof, and wrapping down at each side to lap over the top of the glass
// so there is no slot at the cant rail either. Closed in section, so it reads
// from above as well — through the tailgate glass you are looking down onto
// the back of it.

/** Board thickness, feathered to nothing at the two ends so the shell seals. */
const BOARD = 0.010;
/** How far past the shoulder the board turns down to meet the glass. */
const CANT_DROP = 0.026;

/**
 * The lining's section at station `z`, as a half-profile from the centreline
 * out to the bottom of the turn-down. `s` runs 0..1; the last sixth of it is
 * the turn-down, which follows the body side rather than a straight chamfer,
 * because above the belt the section tumbles home hard.
 */
function linerSection(z: number, s: number, out: THREE.Vector2): THREE.Vector2 {
  const [xs, ys] = headlinerShoulder(z);
  const crown = headlinerY(0, z);
  const TURN = 0.84;
  if (s <= TURN) {
    const k = s / TURN;
    return out.set(k * xs, crown - (crown - ys) * k * k);
  }
  const u = (s - TURN) / (1 - TURN);
  // Ease the drop so the board leaves the crown tangentially and lands on the
  // glass square, the way a moulded edge does.
  const y = ys - CANT_DROP * u * u * (3 - 2 * u);
  return out.set(Math.max(xs, skinHalfW(z, y) - 0.012), y);
}

function buildHeadliner(ctx: BuildContext): THREE.Mesh {
  const nu = 22;            // stations across one half-section
  const nv = 36;            // stations fore-and-aft
  const ring = 4 * nu;      // underside both halves, then the top back again
  const a = new THREE.Vector2();
  const b = new THREE.Vector2();
  const c = new THREE.Vector2();

  const g = surface(ring, nv, true, (i, j, out) => {
    const v = j / nv;
    const z = lerp(ROOF_FRONT_Z, ROOF_REAR_Z, v);
    // Feathered at both ends, which closes the shell into the header trim at
    // the front and the tailgate aperture at the back with no open rim.
    const thick = BOARD * smoothstep(0, 0.022, v) * (1 - smoothstep(0.978, 1, v));

    const top = i >= 2 * nu;
    // Walk the underside left→right, then the top right→left.
    const k = top ? (4 * nu - i) : i;
    const s = Math.abs(k - nu) / nu;
    const sx = k < nu ? -1 : 1;

    linerSection(z, s, a);
    let y = a.y;
    if (top) {
      // Offset along the section normal, so the board keeps its thickness
      // round the turn-down instead of shearing to nothing.
      linerSection(z, Math.max(0, s - 0.03), b);
      linerSection(z, Math.min(1, s + 0.03), c);
      const dx = c.x - b.x;
      const dy = c.y - b.y;
      const len = Math.hypot(dx, dy) || 1;
      out.set(sx * (a.x + (dy / len) * thick * sx * sx), a.y - (dx / len) * thick, z);
      // Sign of the offset: the underside's outward normal points down, so
      // the top face is the same section pushed the other way.
      out.x = sx * (a.x - (dy / len) * thick);
      out.y = a.y + (dx / len) * thick;
      return;
    }
    // Moulded board, not cloth over foam: a shallow, slow undulation only.
    y += fbm(a.x * 6, 11, z * 4, 2) * 0.0012;
    out.set(sx * a.x, y, z);
  });

  // Wound underside-first, so the sheet the cabin sees faces down.
  flipWinding(g);
  return mesh(g, ctx.materials.fabric({ color: TONE.light }), 'headliner');
}

// ---------------------------------------------------------------------------
// Pillars and upper trim
// ---------------------------------------------------------------------------

/**
 * Sweep a soft rectangular moulding along a path, keeping the section's wide
 * axis in the plane of the body side. Pillar trim is a flat cover, not a tube.
 */
function pillar(points: Vec3[], width: number, depth: number, steps = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3);
  const tangent = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  const p = new THREE.Vector3();
  const section: Array<[number, number]> = [
    [-0.5, 0.0], [-0.44, 0.78], [-0.24, 1.0], [0.24, 1.0], [0.44, 0.78], [0.5, 0.0],
    [0.46, -0.16], [-0.46, -0.16],
  ];
  return surface(section.length, steps, true, (i, j, out) => {
    const t = j / steps;
    curve.getPoint(t, p);
    curve.getTangent(t, tangent);
    // Inward normal points at the cabin centreline; that keeps the moulding
    // lying flat on the pillar instead of twisting with the Frenet frame.
    nrm.set(-Math.sign(p.x || 1), 0, 0).addScaledVector(tangent, -tangent.x * -Math.sign(p.x || 1)).normalize();
    bin.crossVectors(tangent, nrm).normalize();
    const s = section[i % section.length];
    out.copy(p).addScaledVector(bin, s[0] * width).addScaledVector(nrm, s[1] * depth);
  });
}

/**
 * Depth of the A-pillar trim's outer face below the body skin.
 *
 * `FLUSH` + `SIDE_THICK` is the glass's own inner face; 4 mm further in is the
 * trim. Written as the sum rather than as a number so it tracks the flush
 * offset, which is the car's signature and the one dimension in the glazing
 * nobody may drift from.
 */
const A_PILLAR_DEPTH = FLUSH + SIDE_THICK + 0.004;

/**
 * A-pillar trim.
 *
 * **This was the worst defect on the car**, and it was not the glass stream's.
 * The trim was a 58 x 30 mm section swept along a CatmullRom through four
 * hand-typed control points, and hand-typed x does not know where the body
 * skin is: measured on a common ray from the `side` camera it ran 10 mm
 * outboard of `aPillarR` at the top and **40 mm at the bottom**, against the
 * windscreen's outer face a median 14.3 mm and a maximum 38.3 mm proud where
 * `HP.glass.flushOffset` is 2. What it read as, from outside, was a fat
 * coarsely-woven black tube running down the A-pillar and into the cowl —
 * reported as a glazing seal, and chased there, because from outside that is
 * exactly what it looks like. Hiding this one batch took the pillar's apparent
 * width from 51 mm to 21 against a reference 17.
 *
 * So it no longer carries an x at all. The path is the A-pillar's own lower
 * edge — `zAtPillarFront(t)`, which is what the glazing cuts its panes to —
 * sampled through `glassPoint` at `A_PILLAR_DEPTH`, and the section is built
 * in the surface's own frame with every vertex pushed further in. It is inside
 * the skin *by construction*: there is no combination of body-surface changes
 * that can put it back out, which is the only kind of fix worth making here.
 *
 * The weave is a separate matter and not this trim's: Laplacian energy over
 * patch mean reads the cowl at 0.844 against this trim's 0.287, so the stipple
 * is a whole family of small dark parts and belongs to whoever owns that
 * material's normal treatment.
 */
function buildAPillarTrim(): THREE.BufferGeometry {
  const NT = 16;
  const t0 = aPillarLower(PILLAR_SLIM_Z);
  const t1 = GT.belt;
  const sample = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };

  /**
   * Section across the pillar: `dz` forward from the daylight opening's front
   * edge, `dd` further under the skin than `A_PILLAR_DEPTH`.
   *
   * The width runs in **z at fixed t**, which is the one thing that makes this
   * safe. A section swept on the tangent plane — which is what a `bin`/`nrm`
   * frame gives — leaves the surface as soon as the surface curves, and the
   * A-pillar is the corner between the roof and the body side, so 58 mm of
   * tangent plane there ends up well outside the skin. Parameterised in (z, t)
   * every vertex is a body-surface point pushed inward, and there is nowhere
   * else for it to be.
   */
  const SEC: Array<[number, number]> = [
    [0.000, 0.015], [0.004, 0.005], [0.011, 0.001], [0.036, 0.000],
    [0.045, 0.003], [0.049, 0.012], [0.044, 0.028], [0.005, 0.028],
  ];

  const g = surface(SEC.length, NT, true, (i, j, out) => {
    const f = j / NT;
    const t = lerp(t0, t1, f);
    const zEdge = zAtPillarFront(t);
    // The moulding narrows toward the beltline, as the real cover does.
    const w = 1 - 0.34 * smoothstep(0.5, 1.0, f);
    const q = SEC[i % SEC.length];
    glassPoint(zEdge + q[0] * w, t, sample, A_PILLAR_DEPTH + q[1]);
    out.copy(sample.p);
  });
  // Wound from a section that runs forward-then-back, which puts the outward
  // face on the inside; the cabin has to see the front of it.
  flipWinding(g);
  return g;
}

/** Depth of the quarter and C-pillar boards below the body skin. */
const BOARD_DEPTH = FLUSH + SIDE_THICK + 0.016;

/**
 * A trim board lying on the inside of the body side.
 *
 * Both of the boards below were swept sections through hand-typed world
 * points, which is the authoring mistake that produced the worst defect on
 * the car: a section swept on a tangent frame leaves the surface the moment
 * the surface curves, and hand-typed x does not know where the skin is. Here
 * every vertex is a body-surface point pushed `BOARD_DEPTH` inward, so the
 * board is inside the skin by construction and tracks the glass apertures it
 * has to meet.
 *
 * `a` runs fore-to-aft between the two z edges, `b` down the section between
 * the two t edges; both edges may be functions of the other coordinate, which
 * is what the Avant's raked D-pillar needs.
 */
function innerBoard(
  tLo: (z: number) => number,
  tHi: (z: number) => number,
  zAt: (t: number, a: number) => number,
  nz: number,
  nt: number,
): THREE.BufferGeometry {
  const smp = { p: new THREE.Vector3(), n: new THREE.Vector3(), u: 0, v: 0 };
  return surface(nz, nt, false, (i, j, out) => {
    const a = i / nz;
    const b = j / nt;
    // Solved on the mid-station's t range, then re-solved at the z it lands
    // on: the two differ by under a millimetre and one pass is enough.
    const zMid = zAt(0, a);
    const t = lerp(tLo(zMid), Math.max(tLo(zMid), tHi(zMid)), b);
    const z = zAt(t, a);
    glassPoint(z, t, smp, BOARD_DEPTH);
    out.copy(smp.p);
  });
}

/** 10 mm of arc past the glass's lower edge, so the belt rail laps the board. */
function belowBelt(z: number): number {
  const tb = dloBotT(z);
  return tb + dtFor(z, tb, 0.010);
}

/**
 * C-pillar inner: the board between the rear door's aperture and the quarter
 * light. Narrow, and the one piece of trim the rear belt's upper guide is
 * screwed to.
 */
function cPillarInner(): THREE.BufferGeometry {
  return innerBoard(
    (z) => dloTopT(z) + 0.002,
    belowBelt,
    (_t, a) => lerp(DLO.cPillarFrontZ + 0.008, DLO.cPillarRearZ - 0.008, a),
    3, 9,
  );
}

/**
 * D-pillar inner: the Avant's, and the largest piece of trim in the load bay.
 *
 * Its leading edge is the quarter glass's trailing edge, which rakes from the
 * tailgate hinge at the roof to z −3.42 at the beltline — so at the cant rail
 * the board is a sliver and at the belt it is 180 mm of board. `tDloRear(z)`
 * is the body's own statement of where that edge falls, which is why the
 * section range is read from it rather than typed: the old sweep ran down a
 * straight line at z −3.07 and therefore crossed the *inside* of the quarter
 * light over the bottom two thirds of the pane.
 */
function dPillarInner(): THREE.BufferGeometry {
  return innerBoard(
    (z) => dloTopT(z) + 0.002,
    (z) => Math.max(dloTopT(z) + 0.002, tDloRear(z)),
    (_t, a) => lerp(GZ.dPillar - 0.004, GZ.dPillarRear + 0.026, a),
    5, 9,
  );
}

function buildPillars(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  const a = buildAPillarTrim();
  parts.push(a, mirrored(a));

  // B-pillar: the tall one, carrying the belt reel and the upper anchor.
  const b = pillar([
    [-0.792, 0.952, -1.585],
    [-0.786, 1.108, -1.588],
    [-0.752, 1.246, -1.592],
    [-0.688, 1.338, -1.596],
  ], 0.092, 0.036, 7);
  parts.push(b, mirrored(b));

  // C- and D-pillar inner boards. Both are flat trim over the pressed inner
  // panel, so both are built on the body's own surface; see `innerBoard`.
  for (const g of [cPillarInner(), dPillarInner()]) parts.push(g, mirrored(g));

  // Cant rail: the strip of trim between the headliner and the door glass.
  for (const s of [-1, 1]) {
    const rail = surface(3, 22, false, (i, j, out) => {
      const z = lerp(HP.headerZ - 0.02, TAIL + 0.80, j / 22);
      const prof: Array<[number, number]> = [[0, 0], [0.018, -0.014], [0.030, -0.034], [0.030, -0.052]];
      const q = prof[i];
      // The headliner's own shoulder, not a fixed half-width: a constant here
      // would drift away from the surface the rail is supposed to sit on.
      const xs = headlinerShoulder(z)[0];
      out.set(s * (xs - q[0]), headlinerY(s * xs, z) + q[1] + 0.004, z);
    });
    parts.push(rail);
  }

  return mesh(merge(parts), ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.78 }), 'pillarTrim');
}

// ---------------------------------------------------------------------------
// Sides below the belt, and the firewall
// ---------------------------------------------------------------------------

function buildInnerSides(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  // Inner rocker / kick panel, from the floor edge up to the door card.
  const kick = surface(3, 26, false, (i, j, out) => {
    const z = lerp(-0.44, -2.60, j / 26);
    const prof: Array<[number, number]> = [[0.012, 0.402], [0.0, 0.452], [0.004, 0.520], [0.018, 0.556]];
    const q = prof[i];
    out.set(-(innerHalfW(q[1]) - q[0] + 0.004), q[1], z);
  });
  parts.push(kick, mirrored(kick));

  // Firewall, so the windscreen has something behind it rather than daylight.
  const fw = surface(10, 4, false, (i, j, out) => {
    const x = lerp(-0.74, 0.74, i / 10);
    const y = lerp(0.36, 0.86, j / 4);
    out.set(x, y, -0.352 + Math.abs(x) * 0.04 + (1 - Math.abs(x) / 0.74) * -0.02);
  });
  parts.push(fw);

  // Rear bulkhead below the rear seat, closing the view under the bench.
  const rb = surface(8, 3, false, (i, j, out) => {
    const x = lerp(-0.66, 0.66, i / 8);
    const y = lerp(CABIN.rearFloorY + 0.06, CABIN.cargoFloorY, j / 3);
    out.set(x, y, -2.392 - j * 0.004);
  });
  parts.push(rb);

  return mesh(merge(parts), ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.82 }), 'innerSides');
}

// ---------------------------------------------------------------------------

/**
 * Carpet, sill plates, mats, headliner, pillar trim, inner sides. Every one of
 * them is screwed to the shell and none of them moves, so all six go into the
 * cabin's static batch rather than into six meshes of their own — the sill
 * plates and the pillar trim then share their draw with the brightwork and the
 * moulded trim the other modules contribute.
 */
export function buildShell(ctx: BuildContext, batch: StaticBatch): void {
  const parts: THREE.Mesh[] = [
    ...(buildFloor(ctx) as THREE.Mesh[]),
    buildMats(ctx), buildHeadliner(ctx), buildPillars(ctx), buildInnerSides(ctx),
  ];
  for (const m of parts) batch.add(m.material as THREE.Material, m.geometry);
}

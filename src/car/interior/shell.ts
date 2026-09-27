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
import { clamp, fbm, flipWinding, lerp, merge, mesh, mirrored, smoothstep, surface, type Vec3 } from './util';

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
  const sillMesh = mesh(merge(sill), ctx.materials.chrome({ roughness: 0.38 }), 'sillPlates');

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
  mat(-CABIN.seatX, -0.640, 0.186, 0.196, 0.035, 1.3);
  mat(CABIN.seatX, -0.662, 0.186, 0.196, -0.012, 4.1);
  mat(-CABIN.seatX + 0.02, -1.790, 0.176, 0.170, -0.02, 7.7);
  mat(CABIN.seatX - 0.02, -1.790, 0.176, 0.170, 0.015, 9.2);
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

function buildPillars(ctx: BuildContext): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];

  // A-pillar: from the header down to the daylight opening's front corner.
  // Both ends are hardpoints, so the trim cannot drift off the glass edge.
  const a = pillar([
    [-0.652, HP.headerY - 0.048, HP.headerZ - 0.012],
    [-0.706, 1.276, -1.010],
    [-0.762, 1.160, -0.800],
    [-0.792, HP.glass.dloBottomY + 0.026, HP.glass.dloFrontZ - 0.010],
  ], 0.058, 0.030, 9);
  parts.push(a, mirrored(a));

  // B-pillar: the tall one, carrying the belt reel and the upper anchor.
  const b = pillar([
    [-0.792, 0.952, -1.585],
    [-0.786, 1.108, -1.588],
    [-0.752, 1.246, -1.592],
    [-0.688, 1.338, -1.596],
  ], 0.092, 0.036, 7);
  parts.push(b, mirrored(b));

  // C-pillar: the body between the rear door's shutline and the quarter
  // glass, so it sits at the midpoint of the two.
  const cz = (HP.side.doorRearZ + HP.glass.quarterRearFrontZ) / 2;
  const c = pillar([
    [-0.786, 0.962, cz],
    [-0.772, 1.128, cz - 0.011],
    [-0.726, 1.272, cz - 0.021],
    [-0.664, 1.340, cz - 0.031],
  ], Math.abs(HP.glass.quarterRearFrontZ - HP.side.doorRearZ) + 0.028, 0.030, 7);
  parts.push(c, mirrored(c));

  // D-pillar: the Avant's, wide and raked, closing the quarter glass.
  const d = pillar([
    [-0.742, 0.986, TAIL + 0.742],
    [-0.726, 1.128, TAIL + 0.786],
    [-0.686, 1.262, TAIL + 0.830],
    [-0.624, 1.338, TAIL + 0.862],
  ], 0.088, 0.034, 7);
  parts.push(d, mirrored(d));

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

export function buildShell(ctx: BuildContext): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shell';
  for (const o of buildFloor(ctx)) g.add(o);
  g.add(buildMats(ctx));
  g.add(buildHeadliner(ctx));
  g.add(buildPillars(ctx));
  g.add(buildInnerSides(ctx));
  return g;
}

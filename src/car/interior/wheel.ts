/**
 * Steering wheel, column, stalks and ignition.
 *
 * Pre-facelift, so this is the **four-spoke urethane** wheel: two nearly
 * horizontal upper spokes at 10 and 2, two lower ones at 5 and 7, and a broad
 * soft centre pad carrying the rings and a slotted insert below them. The
 * leather-rimmed wheel belongs to the CS Turbo, and to the facelift that
 * reached the US only for MY1989 — see docs/REFERENCE-VEHICLE.md §5.4.
 *
 * The rim is moulded, not wrapped: a fat round section with the parting line
 * from the mould still on it and shallow finger reliefs behind the upper
 * spokes, where a driver's hands actually live.
 */

import * as THREE from 'three';
import type { BuildContext, VehicleState } from '@/types';
import { STEERING } from '@/spec';
import { HP } from '@/car/hardpoints';
import { TONE } from './layout';
import { cyl, D2R, lerp, merge, mesh, roundedBox, slab, smoothstep, surface, TAU } from './util';

const C = HP.interior.steeringCenter;
const OUTER = HP.interior.steeringDiameter / 2;
const SECTION = 0.0158;
const RING_R = OUTER - SECTION;

/** Where the spokes meet the rim, radians CCW from the 3 o'clock position. */
const SPOKES = [20 * D2R, 160 * D2R, 235 * D2R, 305 * D2R];

function buildRim(): THREE.BufferGeometry {
  const NA = 128;
  const NS = 26;
  return surface(NS, NA, true, (i, j, out) => {
    // `surface` closes the i direction; the rim is closed in both, so the
    // last ring is written on top of the first and the seam disappears.
    const a = ((j % NA) / NA) * TAU;
    const s = (i / NS) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);

    // Finger reliefs on the back of the rim, either side of the upper spokes.
    let grip = 0;
    for (const sp of [SPOKES[0], SPOKES[1]]) {
      const d = Math.abs(((a - sp + Math.PI * 3) % TAU) - Math.PI);
      grip += 0.0016 * Math.exp(-((d - 0.34) ** 2) / 0.010);
    }
    const back = smoothstep(0.1, 0.8, Math.cos(s));
    // Parting line: a hair of flash left round the mould's equator.
    const flash = 0.00035 * Math.exp(-((Math.abs(Math.sin(s)) - 1) ** 2) / 0.0006);
    const r = SECTION - grip * back + flash;
    const rr = RING_R + r * Math.cos(s);
    out.set(rr * ca, rr * sa, r * Math.sin(s) * 1.06);
  });
}

function buildSpokes(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < SPOKES.length; k++) {
    const a = SPOKES[k];
    const upper = k < 2;
    const g = surface(14, 9, true, (i, j, o) => {
      const v = j / 9;
      // Root at the pad, tip buried in the rim.
      const rad = lerp(0.052, RING_R + 0.004, v);
      const w = lerp(upper ? 0.030 : 0.026, upper ? 0.0155 : 0.0135, smoothstep(0.1, 0.9, v));
      const t = lerp(0.0175, 0.0128, v);
      const th = (i / 14) * TAU;
      // Flattened oval section: a urethane spoke is wide and shallow.
      const cx = Math.cos(th) * w;
      const cy = Math.sin(th) * t;
      const ca = Math.cos(a), sa = Math.sin(a);
      o.set(rad * ca - cx * sa, rad * sa + cx * ca, cy - 0.006 * (1 - v) + 0.004 * v);
    });
    out.push(g);
  }
  return out;
}

export function buildWheel(ctx: BuildContext): { group: THREE.Group; update(dt: number, s: VehicleState): void } {
  const group = new THREE.Group();
  group.name = 'steering';
  group.position.set(C[0], C[1], C[2]);
  // Tilt the wheel plane back from vertical; the column follows its normal.
  group.rotation.x = HP.interior.steeringTiltDeg * D2R;

  const spin = new THREE.Group();
  spin.name = 'steeringWheel';
  group.add(spin);

  const urethane = ctx.materials.interiorPlastic({ color: TONE.wheelUrethane, roughness: 0.66 });
  const padMat = ctx.materials.interiorPlastic({ color: 0x2f3136, roughness: 0.80 });
  const brightMat = ctx.materials.chrome({ roughness: 0.22 });
  const darkMat = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.82 });

  spin.add(mesh(merge([buildRim(), ...buildSpokes()]), urethane, 'wheelRim'));

  // Centre pad: a broad horizontal rounded rectangle filling the hub area.
  const pad: THREE.BufferGeometry[] = [];
  const padBody = surface(30, 10, true, (i, j, o) => {
    const v = j / 10;
    const th = (i / 30) * TAU;
    const k = 3.0;
    const ux = Math.sign(Math.cos(th)) * Math.abs(Math.cos(th)) ** (2 / k);
    const uy = Math.sign(Math.sin(th)) * Math.abs(Math.sin(th)) ** (2 / k);
    const scale = Math.sin(Math.PI * (0.5 + v * 0.5)) ** 0.45;
    o.set(ux * 0.105 * scale, uy * 0.0555 * scale, -0.018 + v * 0.040);
  });
  pad.push(padBody);
  const padCap = surface(30, 4, true, (i, j, o) => {
    const th = (i / 30) * TAU;
    const k = 3.0;
    const rr = 1 - (j / 4) ** 1.7;
    const ux = Math.sign(Math.cos(th)) * Math.abs(Math.cos(th)) ** (2 / k);
    const uy = Math.sign(Math.sin(th)) * Math.abs(Math.sin(th)) ** (2 / k);
    o.set(ux * 0.105 * rr, uy * 0.0555 * rr, 0.022 + (1 - rr ** 2) * 0.004);
  });
  pad.push(padCap);
  spin.add(mesh(merge(pad), padMat, 'hornPad'));

  // The four rings, moulded into the pad and picked out bright.
  const rings: THREE.BufferGeometry[] = [];
  const rd = 0.0222;
  const rsp = 0.0170;
  for (let i = 0; i < 4; i++) {
    const t = new THREE.TorusGeometry(rd / 2, 0.0016, 8, 26);
    t.translate((i - 1.5) * rsp, 0.007, 0.0262);
    rings.push(t);
  }
  spin.add(mesh(merge(rings), brightMat, 'hubRings'));

  // The slotted insert under the rings.
  const slots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const s = slab(0.0088, 0.0125, 0.006, 0.0018, 1);
    s.translate(-0.0335 + i * 0.0134, -0.016, 0.0235);
    slots.push(s);
  }
  spin.add(mesh(merge(slots), darkMat, 'hubSlots'));

  // Column shroud: two-piece, running forward along the wheel's own normal.
  const col: THREE.BufferGeometry[] = [];
  const upper = cyl(0.0345, 0.0465, 0.155, 20, true);
  upper.rotateX(Math.PI / 2);
  upper.translate(0, 0, -0.098);
  col.push(upper);
  const lower = cyl(0.0470, 0.0540, 0.115, 20, true);
  lower.rotateX(Math.PI / 2);
  lower.translate(0, -0.004, -0.228);
  col.push(lower);
  group.add(mesh(merge(col), padMat, 'columnShroud'));

  // Stalks. Left: lights and indicators. Right: wipers and washer. Plus the
  // cruise-control stalk below the left one.
  const stalks: THREE.BufferGeometry[] = [];
  const stalk = (sx: number, sy: number, len: number, thick: number, droop: number): THREE.BufferGeometry => {
    const g = roundedBox(thick, thick * 0.82, len, thick * 0.4, 2, 3);
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.sign(sx) * (Math.PI / 2 - 0.16));
    g.rotateX(droop);
    g.translate(sx * 0.040, sy, -0.062);
    return g;
  };
  stalks.push(stalk(-1, -0.004, 0.118, 0.0175, 0.10));
  stalks.push(stalk(1, -0.004, 0.112, 0.0175, 0.10));
  stalks.push(stalk(-1, -0.036, 0.082, 0.0135, 0.22));

  // Ignition barrel: right of the column on a left-hand-drive Audi.
  const barrel = cyl(0.0205, 0.0225, 0.030, 18);
  barrel.rotateX(Math.PI / 2);
  barrel.translate(0.062, -0.014, -0.078);
  stalks.push(barrel);
  const slot = slab(0.0125, 0.0035, 0.004, 0.001, 1);
  slot.translate(0.062, -0.014, -0.063);
  stalks.push(slot);

  // Stalks and barrel are the same moulding and both fixed to the column —
  // only the wheel itself turns, and that is a different node.
  group.add(mesh(merge(stalks), darkMat, 'columnControls'));

  // Lock-to-lock, mapped from the road-wheel angle the physics reports.
  const maxRim = STEERING.turnsLockToLock * Math.PI;
  const maxRoad = STEERING.maxSteerAngleDeg * D2R;
  let shown = 0;

  return {
    group,
    update(dt: number, s: VehicleState) {
      const want = (s.steerAngle / maxRoad) * maxRim;
      // The rim follows the rack through a little compliance, so it never
      // snaps between frames when the physics steps hard.
      shown += (want - shown) * (1 - Math.exp(-dt * 18));
      spin.rotation.z = shown;
    },
  };
}

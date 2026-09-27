/**
 * Centre stack, console, shifter, handbrake and pedals.
 *
 * The stack is a narrow vertical column angled slightly toward the driver,
 * and it reads top to bottom exactly as the car's does: a three-section
 * louvre block under the brow (built with the dash), a digital clock and two
 * rows of square rockers, the Blaupunkt-built cassette head unit, then the
 * electronic climate control head — three big rotaries with a column of
 * square buttons beside them, which is standard equipment on a US 5000 S and
 * not a lever box.
 *
 * All of the fine printing — legends, scales, the clock and radio displays —
 * is one canvas on one plane, with the knobs, keycaps and slots standing on
 * top of it in geometry. That keeps the legends crisp, the registration
 * exact, and the whole stack to a single extra draw call.
 */

import * as THREE from 'three';
import type { BuildContext, VehicleState } from '@/types';
import { CABIN, TONE } from './layout';
import { canvasTexture, DIAL_FONT, makeCanvas } from './printed';
import { cyl, lerp, merge, mesh, mirrored, roundedBox, surface, tube, type Vec3 } from './util';
import type { StaticBatch } from './batch';

const PANEL = { w: 256, h: 240 } as const;
const PPMM = 6.0;
/** Stack panel centre, in vehicle space. */
const PANEL_Y = 0.876;
const RAKE = Math.atan(CABIN.fasciaRake);
const PANEL_Z = -0.7125 + (1.028 - PANEL_Y) * CABIN.fasciaRake + 0.0205 - 0.006;

const px = (mm: number): number => (PANEL.w / 2 - mm) / 1000;
const py = (mm: number): number => (PANEL.h / 2 - mm) / 1000;

/** Switch keycap centres, canvas mm. */
const SWITCHES: Array<[number, number, string]> = [
  [100, 12, 'hazard'], [143, 12, 'defog'], [186, 12, 'rwipe'], [229, 12, 'fog'],
  [100, 31, 'seatL'], [143, 31, 'seatR'], [186, 31, 'blank'], [229, 31, 'blank'],
];
const ROTARIES: Array<[number, number]> = [[52, 148], [110, 148], [168, 148]];

// ---------------------------------------------------------------------------

function drawPanel(): ReturnType<typeof makeCanvas> {
  const c = makeCanvas(PANEL.w, PANEL.h, PPMM);
  const g = c.g;
  g.fillStyle = '#25272b';
  g.fillRect(0, 0, PANEL.w, PANEL.h);

  const well = (x: number, y: number, w: number, h: number, fill: string): void => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#121316';
    g.lineWidth = 0.8;
    g.strokeRect(x, y, w, h);
  };

  // Digital clock, top left of the switch row.
  well(6, 4, 64, 30, '#101215');
  g.fillStyle = '#1e5a3c';
  g.font = `600 17px ${DIAL_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('10:42', 38, 20);

  // Rocker bezel and its cut-outs.
  well(78, 2, 174, 38, '#1c1e21');
  for (const [sx, sy] of SWITCHES) {
    g.fillStyle = '#0d0e10';
    g.fillRect(sx - 19, sy - 8.5, 38, 17);
  }

  // Head unit.
  well(4, 46, 248, 60, '#1a1c1f');
  g.fillStyle = '#0b0c0d';
  g.fillRect(58, 52, 140, 13);
  well(64, 70, 78, 14, '#101418');
  g.fillStyle = '#2a6f4e';
  g.font = `600 9px ${DIAL_FONT}`;
  g.textAlign = 'left';
  g.fillText('FM1  101.1', 68, 77.5);
  g.fillStyle = '#8e8c88';
  g.font = `500 5.5px ${DIAL_FONT}`;
  g.textAlign = 'right';
  g.fillText('audi', 194, 77.5);
  g.font = `400 4px ${DIAL_FONT}`;
  g.textAlign = 'center';
  for (let i = 0; i < 5; i++) g.fillText(String(i + 1), 74 + i * 24, 104);

  // Climate head.
  well(4, 112, 248, 76, '#1c1e21');
  g.strokeStyle = '#3a3d42';
  g.lineWidth = 1.0;
  for (const [rx, ry] of ROTARIES) {
    g.beginPath();
    g.arc(rx, ry, 27, 0, Math.PI * 2);
    g.stroke();
  }
  // Temperature knob: the blue-to-red band round the left rotary.
  const [tx, ty] = ROTARIES[0];
  g.lineWidth = 3.2;
  g.strokeStyle = '#2d5fa8';
  g.beginPath(); g.arc(tx, ty, 30, Math.PI * 0.62, Math.PI * 1.22); g.stroke();
  g.strokeStyle = '#a8352d';
  g.beginPath(); g.arc(tx, ty, 30, Math.PI * 1.78, Math.PI * 2.38); g.stroke();
  g.fillStyle = '#9a9894';
  g.font = `500 6px ${DIAL_FONT}`;
  g.textAlign = 'center';
  g.fillText('OFF', ROTARIES[1][0], ROTARIES[1][1] + 36);
  g.fillText('AUTO', ROTARIES[2][0], ROTARIES[2][1] + 36);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = '#0d0e10';
    g.fillRect(202, 118 + i * 16, 44, 13);
  }

  // Ashtray surround and the lighter.
  well(58, 194, 140, 38, '#1a1c1f');
  g.fillStyle = '#0d0e10';
  g.beginPath();
  g.arc(218, 213, 11, 0, Math.PI * 2);
  g.fill();
  return c;
}

// ---------------------------------------------------------------------------

export interface ConsoleHandle {
  group: THREE.Group;
  update(dt: number, s: VehicleState): void;
}

export function buildConsole(ctx: BuildContext, batch: StaticBatch): ConsoleHandle {
  const group = new THREE.Group();
  group.name = 'console';

  const dark = ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 });
  const trimMat = ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.78 });
  const lowMat = ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.76 });
  const bright = ctx.materials.chrome({ roughness: 0.28 });
  const rubberMat = ctx.materials.rubber({ roughness: 0.88 });
  const leather = ctx.materials.interiorPlastic({ color: TONE.leatherette, roughness: 0.72 });

  // -- stack face -----------------------------------------------------------
  const panelGroup = new THREE.Group();
  panelGroup.position.set(0, PANEL_Y, PANEL_Z);
  panelGroup.rotation.x = RAKE;
  group.add(panelGroup);

  const plane = new THREE.PlaneGeometry(PANEL.w / 1000, PANEL.h / 1000);
  plane.rotateY(Math.PI);
  // Library `printed()`, keyed on this canvas, so the instance is the console's
  // own and is in the registry — the local material it replaces was not, and
  // `setEnvMap` never reached it. `envMapIntensity` is the level the local one
  // was authored at, carried over unchanged; no cavity correction, because the
  // stack faces straight out into the cabin.
  panelGroup.add(mesh(plane, ctx.materials.printed(canvasTexture(drawPanel(), ctx.renderer), {
    roughness: 0.70,
    envMapIntensity: 0.35,
  }), 'stackFace'));

  const caps: THREE.BufferGeometry[] = [];
  const knobs: THREE.BufferGeometry[] = [];
  const marks: THREE.BufferGeometry[] = [];

  // Rocker keycaps: each one a separate moulding in its own cut-out, domed
  // and slightly proud, so the panel reads as pressable rather than printed.
  for (const [sx, sy, kind] of SWITCHES) {
    const cap = roundedBox(0.036, 0.0155, 0.009, 0.0016, 2, 3);
    // A rocker sits tipped in its aperture, and no two sit quite alike.
    cap.rotateX(kind === 'blank' ? 0 : -0.10 + (sx % 3) * 0.02);
    cap.translate(px(sx), py(sy), -0.0042);
    caps.push(cap);
    if (kind === 'hazard') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        const bar = roundedBox(0.0075, 0.0011, 0.0016, 0.0004, 1, 2);
        bar.rotateZ(a + Math.PI / 2);
        bar.translate(px(sx) + Math.cos(a) * 0.0022, py(sy) + Math.sin(a) * 0.0022, -0.0090);
        marks.push(bar);
      }
    } else if (kind !== 'blank') {
      const bar = roundedBox(0.0135, 0.0018, 0.0014, 0.0005, 1, 2);
      bar.translate(px(sx), py(sy), -0.0090);
      marks.push(bar);
    }
  }

  // Cassette door and preset keys.
  const door = roundedBox(0.138, 0.012, 0.006, 0.0015, 1, 2);
  door.translate(px(128), py(58.5), -0.0035);
  caps.push(door);
  for (let i = 0; i < 5; i++) {
    const b = roundedBox(0.016, 0.0095, 0.007, 0.0015, 1, 2);
    b.translate(px(74 + i * 24), py(95), -0.004);
    caps.push(b);
  }
  for (const rx of [26, 230]) {
    const k = cyl(0.0125, 0.0135, 0.014, 14);
    k.rotateX(Math.PI / 2);
    k.translate(px(rx), py(76), -0.006);
    knobs.push(k);
  }

  // Climate rotaries: big, ribbed, and standing well proud.
  for (const [rx, ry] of ROTARIES) {
    const k = cyl(0.0205, 0.0215, 0.016, 22);
    k.rotateX(Math.PI / 2);
    k.translate(px(rx), py(ry), -0.007);
    knobs.push(k);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rib = roundedBox(0.0022, 0.0075, 0.014, 0.0008, 1, 2);
      rib.rotateZ(a);
      rib.translate(px(rx) + Math.sin(a) * 0.0195, py(ry) + Math.cos(a) * 0.0195, -0.007);
      knobs.push(rib);
    }
    const pointer = roundedBox(0.0022, 0.0105, 0.0022, 0.0008, 1, 2);
    pointer.translate(px(rx) + 0.0, py(ry) + 0.009, -0.0152);
    marks.push(pointer);
  }
  for (let i = 0; i < 4; i++) {
    const b = roundedBox(0.042, 0.0125, 0.0075, 0.0015, 1, 2);
    b.translate(px(224), py(124.5 + i * 16), -0.0042);
    caps.push(b);
  }

  // Ashtray lid with a finger recess, and the lighter.
  const ash = roundedBox(0.134, 0.034, 0.010, 0.003, 2, 3);
  ash.translate(px(128), py(213), -0.0045);
  caps.push(ash);
  const finger = roundedBox(0.040, 0.007, 0.006, 0.002, 1, 2);
  finger.translate(px(128), py(203), -0.0094);
  marks.push(finger);
  const lighter = cyl(0.0098, 0.0108, 0.012, 14);
  lighter.rotateX(Math.PI / 2);
  lighter.translate(px(218), py(213), -0.006);
  knobs.push(lighter);

  // The keycaps carry no artwork and never move, so they are baked out of the
  // panel's frame and batched with the rest of the cabin's dark mouldings.
  batch.add(dark, merge(caps).rotateX(RAKE).translate(0, PANEL_Y, PANEL_Z));
  panelGroup.add(mesh(merge(knobs), ctx.materials.interiorPlastic({ color: 0x1b1d20, roughness: 0.66 }), 'stackKnobs'));

  // The stack legends are brightwork, and so is the shift pattern; neither
  // moves. Bake the panel's own rake and offset into the geometry so the two
  // can share one mesh instead of being two draws for the same finish.
  const brightParts: THREE.BufferGeometry[] = [merge(marks).rotateX(RAKE).translate(0, PANEL_Y, PANEL_Z)];

  // -- console body ---------------------------------------------------------
  // Swept from the base of the stack down onto the tunnel and back between
  // the seats, so the shifter and handbrake grow out of it.
  const body = surface(10, 26, false, (i, j, out) => {
    const v = j / 26;
    const z = lerp(-0.648, -1.520, v);
    const drop = 0.760 - 0.196 * Math.min(1, v / 0.30) + 0.032 * Math.max(0, v - 0.30);
    const hw = lerp(0.128, 0.119, Math.min(1, v / 0.26)) - 0.012 * Math.max(0, (v - 0.72) / 0.28);
    // Section: flat top, rounded shoulders, sides falling to the tunnel.
    const prof: Array<[number, number]> = [
      [-1.0, -0.128], [-1.0, -0.030], [-0.93, -0.004], [-0.72, 0.0], [-0.30, 0.004],
      [0.30, 0.004], [0.72, 0.0], [0.93, -0.004], [1.0, -0.030], [1.0, -0.128], [1.0, -0.20],
    ];
    const q = prof[i];
    out.set(q[0] * hw, drop + q[1] + (v < 0.28 ? (0.28 - v) * 0.10 : 0), z);
  });
  batch.add(trimMat, body);

  const sideTrim: THREE.BufferGeometry[] = [];
  const side = surface(3, 18, false, (i, j, out) => {
    const v = j / 18;
    const z = lerp(-0.660, -1.510, v);
    const drop = 0.760 - 0.196 * Math.min(1, v / 0.30) + 0.032 * Math.max(0, v - 0.30);
    const hw = lerp(0.128, 0.119, Math.min(1, v / 0.26)) - 0.012 * Math.max(0, (v - 0.72) / 0.28);
    const prof: Array<[number, number]> = [[1.0, -0.128], [1.02, -0.175], [1.0, -0.208], [0.86, -0.228]];
    const q = prof[i];
    out.set(-q[0] * hw, drop + q[1] + (v < 0.28 ? (0.28 - v) * 0.10 : 0), z);
  });
  sideTrim.push(side, mirrored(side));
  // Heat duct to the rear seat area, at the back of the console.
  const duct = roundedBox(0.128, 0.042, 0.020, 0.005, 1, 3);
  duct.translate(0, 0.606, -1.516);
  sideTrim.push(duct);

  // -- shifter --------------------------------------------------------------
  const shiftZ = -1.005;
  const gaiter = surface(16, 8, true, (i, j, out) => {
    const v = j / 8;
    const a = (i / 16) * Math.PI * 2;
    const r = lerp(0.046, 0.0165, v ** 0.75) * (1 + 0.10 * Math.sin(a * 4) * (1 - v));
    // A moulded bellows has rings; they collapse as it narrows.
    const rings = 1 + 0.055 * Math.sin(v * Math.PI * 7) * (1 - v * 0.5);
    out.set(Math.cos(a) * r * rings * 1.06, 0.640 + v * 0.104, shiftZ + Math.sin(a) * r * rings + v * 0.006);
  });
  batch.add(leather, gaiter);

  const lever = cyl(0.0088, 0.0115, 0.048, 10);
  lever.translate(0, 0.762, shiftZ + 0.008);
  const knobBody = new THREE.SphereGeometry(0.0245, 18, 12);
  knobBody.scale(1, 0.86, 1.04);
  knobBody.translate(0, 0.792, shiftZ + 0.009);
  const knobTop = cyl(0.0225, 0.0225, 0.003, 18);
  knobTop.translate(0, 0.8095, shiftZ + 0.009);
  batch.add(ctx.materials.interiorPlastic({ color: 0x141517, roughness: 0.52 }), merge([lever, knobBody, knobTop]));

  // Shift pattern on the knob's crown: five gates and reverse.
  const pattern: THREE.BufferGeometry[] = [];
  const gate = (a: Vec3[], w: number): void => { pattern.push(tube(a, w, 4, false, 0.1)); };
  const ky = 0.8112;
  const kz = shiftZ + 0.009;
  gate([[-0.010, ky, kz - 0.009], [-0.010, ky, kz + 0.009]], 0.0008);
  gate([[0.000, ky, kz - 0.009], [0.000, ky, kz + 0.009]], 0.0008);
  gate([[0.010, ky, kz - 0.009], [0.010, ky, kz + 0.009]], 0.0008);
  gate([[-0.010, ky, kz], [0.010, ky, kz]], 0.0008);
  brightParts.push(merge(pattern));
  batch.add(bright, merge(brightParts));

  // -- handbrake ------------------------------------------------------------
  const hbPivot = new THREE.Group();
  hbPivot.position.set(0.062, 0.596, -1.196);
  group.add(hbPivot);
  const hbArm = roundedBox(0.026, 0.030, 0.196, 0.008, 2, 3);
  hbArm.translate(0, 0.014, 0.100);
  const hbGrip = roundedBox(0.030, 0.034, 0.108, 0.014, 2, 4);
  hbGrip.translate(0, 0.016, 0.166);
  hbPivot.add(mesh(merge([hbArm]), lowMat, 'handbrakeArm'));
  hbPivot.add(mesh(hbGrip, ctx.materials.interiorPlastic({ color: 0x141517, roughness: 0.58 }), 'handbrakeGrip'));
  const button = cyl(0.0095, 0.0095, 0.010, 12);
  button.rotateX(Math.PI / 2);
  button.translate(0, 0.016, 0.224);
  hbPivot.add(mesh(button, bright, 'handbrakeButton'));

  // -- pedals ---------------------------------------------------------------
  const pedals: THREE.BufferGeometry[] = [];
  const pads: THREE.BufferGeometry[] = [];
  const pedal = (x: number, w: number, h: number, reach: number): void => {
    const arm = roundedBox(0.014, 0.020, reach, 0.005, 1, 2);
    arm.rotateX(-0.62);
    arm.translate(x, 0.545 - reach * 0.22, -0.552 - reach * 0.30);
    pedals.push(arm);
    const pad = roundedBox(w, h, 0.012, 0.004, 2, 3);
    pad.rotateX(-0.26);
    pad.translate(x, 0.434, -0.618);
    pads.push(pad);
    for (let i = 0; i < 4; i++) {
      const rib = roundedBox(w - 0.010, 0.0035, 0.004, 0.0012, 1, 2);
      rib.rotateX(-0.26);
      rib.translate(x, 0.434 + (i - 1.5) * h * 0.24, -0.6122 + (i - 1.5) * h * 0.24 * 0.27);
      pads.push(rib);
    }
  };
  pedal(-0.508, 0.056, 0.086, 0.230);
  pedal(-0.378, 0.062, 0.088, 0.222);
  pedal(-0.258, 0.040, 0.112, 0.208);

  // Footrest, canted to meet the sole of a left foot.
  const rest = roundedBox(0.070, 0.150, 0.014, 0.005, 2, 3);
  rest.rotateX(-0.34);
  rest.rotateZ(0.16);
  rest.translate(-0.614, 0.420, -0.612);
  pads.push(rest);

  // Console side trim, heat duct and pedal arms are one moulding colour and
  // all bolted to the floor — one draw, not two.
  sideTrim.push(...pedals);
  batch.add(lowMat, merge(sideTrim));
  batch.add(rubberMat, merge(pads));

  return {
    group,
    update(_dt: number, s: VehicleState) {
      // Applied, the lever stands up; released it lies along the console.
      hbPivot.rotation.x = -(0.09 + s.handbrake * 0.50);
    },
  };
}


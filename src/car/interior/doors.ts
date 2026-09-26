/**
 * Door cards.
 *
 * Three horizontal zones, as on the car: a padded upper panel in the
 * interior colour, a bright trim line, and a darker lower panel with a map
 * pocket along its bottom edge. Running most of the card's width at about
 * mid-height is the long grab handle on its raised plinth, which is also the
 * armrest — and on the front doors carries the window switch pod at its
 * forward end. Four rockers with a rear lockout on the driver's door; one
 * each elsewhere.
 *
 * The cards matter more than they look: they are what the eye actually lands
 * on through an open-looking side window, and their top edge is the line the
 * daylight opening is read against.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { CABIN, TONE, innerHalfW } from './layout';
import { clamp, cyl, lerp, merge, mesh, roundedBox, smoothstep, surface, TAU } from './util';

interface DoorSpec {
  /** +1 right, -1 left. */
  side: number;
  zFront: number;
  zRear: number;
  /** Where the armrest plinth starts and stops, as fractions along the card. */
  armFrom: number;
  armTo: number;
  switches: number;
  speaker: boolean;
  /** Driver's door: handle worn, card slightly scuffed. */
  wear: number;
}

/**
 * Card section, inboard offset from the trim surface against height. The
 * armrest entries are scaled by a window so the plinth has ends.
 */
const SECTION: Array<[number, number, number]> = [
  // offset, y, armrest weight
  [0.004, 0.302, 0], [0.011, 0.346, 0], [0.050, 0.362, 0], [0.048, 0.398, 0],
  [0.013, 0.416, 0], [0.014, 0.696, 0], [0.024, 0.712, 1], [0.074, 0.736, 1],
  [0.076, 0.772, 1], [0.040, 0.798, 0.45], [0.028, 0.812, 0], [0.023, 0.938, 0],
  [0.030, 0.966, 0], [0.007, 0.9855, 0],
];

function cardSurface(d: DoorSpec): THREE.BufferGeometry {
  const NV = 30;
  return surface(SECTION.length - 1, NV, false, (i, j, out) => {
    const v = j / NV;
    const z = lerp(d.zFront, d.zRear, v);
    const arm = smoothstep(d.armFrom, d.armFrom + 0.07, v) * (1 - smoothstep(d.armTo - 0.07, d.armTo, v));
    const [off0, y, w] = SECTION[i];
    const off = lerp(SECTION[i][0] * (w > 0 ? 0.30 : 1), off0, w > 0 ? arm * w + (1 - w) : 1);
    // Ends of the card pull back to the shutline.
    const end = 1 - smoothstep(0.92, 1.0, Math.abs(v * 2 - 1));
    out.set(d.side * (innerHalfW(y) - off * end - 0.002), y, z);
  });
}

function speakerGrille(radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const rings = 9;
  for (let i = 0; i <= rings * 3; i++) {
    const t = i / (rings * 3);
    const r = t * radius;
    const d = -0.0032 * (0.5 - 0.5 * Math.cos(t * rings * TAU)) - 0.004 * (1 - clamp(t * 1.15, 0, 1) ** 2);
    pts.push(new THREE.Vector2(Math.max(0.0004, r), d));
  }
  const g = new THREE.LatheGeometry(pts, 26);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

interface DoorGeo { card: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[]; switches: THREE.BufferGeometry[]; bright: THREE.BufferGeometry[] }

function door(d: DoorSpec, out: DoorGeo): void {
  out.card.push(cardSurface(d));

  const parts: THREE.BufferGeometry[] = [];
  const brights: THREE.BufferGeometry[] = [];
  const darks: THREE.BufferGeometry[] = [];

  const len = d.zFront - d.zRear;
  const zAt = (f: number): number => lerp(d.zFront, d.zRear, f);
  const xAt = (y: number, off: number): number => d.side * (innerHalfW(y) - off);

  // The bright line dividing the upper panel from the lower.
  const line = surface(1, 20, false, (i, j, o) => {
    const v = j / 20;
    const y = 0.8045 + i * 0.0042;
    o.set(xAt(y, 0.0265 - i * 0.002), y, lerp(d.zFront - 0.012, d.zRear + 0.012, v));
  });
  brights.push(line);

  // Grab handle: a separate moulding lying on the plinth, in a darker tone.
  const hz0 = zAt(d.armFrom + 0.10);
  const hz1 = zAt(d.armTo - 0.06);
  const handle = surface(9, 16, false, (i, j, o) => {
    const v = j / 16;
    const z = lerp(hz0, hz1, v);
    const prof: Array<[number, number]> = [
      [0.020, 0.7300], [0.068, 0.7315], [0.082, 0.7385], [0.082, 0.7565], [0.070, 0.7625],
      [0.044, 0.7635], [0.036, 0.7580], [0.038, 0.7440], [0.026, 0.7370], [0.018, 0.7330],
    ];
    const q = prof[i];
    const taper = 1 - 0.28 * smoothstep(0.86, 1.0, Math.abs(v * 2 - 1));
    o.set(xAt(q[1], q[0] * taper), q[1], z);
  });
  darks.push(handle);

  // Door release: a small lever in a recess, high and forward.
  const relZ = zAt(0.10);
  const recess = roundedBox(0.086, 0.036, 0.016, 0.005, 1, 3);
  recess.rotateY(d.side * Math.PI / 2);
  recess.translate(xAt(0.895, 0.006), 0.895, relZ);
  darks.push(recess);
  const lever = roundedBox(0.056, 0.014, 0.011, 0.004, 1, 2);
  lever.rotateY(d.side * Math.PI / 2);
  lever.rotateX(0.06);
  lever.translate(xAt(0.897, 0.020), 0.897, relZ - 0.006);
  brights.push(lever);

  // Window switch pod, angled up off the forward end of the armrest.
  if (d.switches > 0) {
    const podZ = zAt(d.armFrom + 0.035);
    const pod = roundedBox(0.062, 0.010, 0.030 + d.switches * 0.026, 0.005, 2, 3);
    pod.rotateZ(d.side * 0.42);
    pod.translate(xAt(0.762, 0.052), 0.768, podZ - d.switches * 0.010);
    darks.push(pod);
    for (let i = 0; i < d.switches; i++) {
      const cap = roundedBox(0.030, 0.007, 0.020, 0.0022, 1, 2);
      cap.rotateZ(d.side * 0.42);
      cap.rotateX(-0.12 + (i % 2) * 0.05);
      cap.translate(xAt(0.762, 0.060), 0.7715, podZ - d.switches * 0.010 - 0.0135 * (d.switches - 1) + i * 0.027);
      parts.push(cap);
    }
    if (d.switches === 4) {
      const lock = roundedBox(0.020, 0.006, 0.012, 0.002, 1, 2);
      lock.rotateZ(d.side * 0.42);
      lock.translate(xAt(0.752, 0.028), 0.754, podZ + 0.040);
      parts.push(lock);
    }
  }

  if (d.speaker) {
    const g = speakerGrille(0.064);
    g.rotateZ(d.side * Math.PI / 2);
    g.translate(xAt(0.470, 0.010), 0.470, zAt(0.16));
    darks.push(g);
  }

  // Mirror control, driver's door only: a joystick pad above the pull.
  if (d.switches === 4) {
    const base = roundedBox(0.044, 0.030, 0.034, 0.006, 1, 3);
    base.rotateY(d.side * Math.PI / 2);
    base.translate(xAt(0.800, 0.016), 0.800, zAt(0.16));
    darks.push(base);
    const stick = cyl(0.0048, 0.0060, 0.014, 10);
    stick.rotateZ(d.side * Math.PI / 2);
    stick.translate(xAt(0.800, 0.030), 0.800, zAt(0.16));
    parts.push(stick);
  }

  // Lock pin at the top of the card, just inboard of the glass.
  const pin = cyl(0.0035, 0.0035, 0.032, 8);
  pin.translate(xAt(0.9855, 0.026), 1.000, zAt(0.055));
  brights.push(pin);

  void len;
  out.trim.push(...darks);
  out.switches.push(...parts);
  out.bright.push(...brights);
}

export function buildDoors(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'doorCards';

  const specs: DoorSpec[] = [
    { side: -1, zFront: CABIN.doorFrontZ - 0.012, zRear: CABIN.doorMidZ + 0.026, armFrom: 0.30, armTo: 0.92, switches: 4, speaker: true, wear: 1 },
    { side: 1, zFront: CABIN.doorFrontZ - 0.012, zRear: CABIN.doorMidZ + 0.026, armFrom: 0.30, armTo: 0.92, switches: 1, speaker: true, wear: 0.3 },
    { side: -1, zFront: CABIN.doorMidZ - 0.026, zRear: CABIN.doorRearZ + 0.028, armFrom: 0.22, armTo: 0.88, switches: 1, speaker: true, wear: 0.5 },
    { side: 1, zFront: CABIN.doorMidZ - 0.026, zRear: CABIN.doorRearZ + 0.028, armFrom: 0.22, armTo: 0.88, switches: 1, speaker: true, wear: 0.2 },
  ];
  const geo: DoorGeo = { card: [], trim: [], switches: [], bright: [] };
  for (const s of specs) door(s, geo);
  group.add(mesh(merge(geo.card), ctx.materials.interiorPlastic({ color: TONE.fascia, roughness: 0.80 }), 'doorCards'));
  group.add(mesh(merge(geo.trim), ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.82 }), 'doorTrim'));
  group.add(mesh(merge(geo.switches), ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 }), 'doorSwitches'));
  group.add(mesh(merge(geo.bright), ctx.materials.chrome({ roughness: 0.32 }), 'doorBright'));
  return group;
}


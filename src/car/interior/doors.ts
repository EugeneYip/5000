/**
 * Door cards.
 *
 * Four cards used to be 3120 triangles — a flat field with one fold, one lever
 * and a 20 mm chrome bar rendering at V 250, which no interior material is.
 * Everything below is measured off `scratchpad/ref3/bat_int_doorcard_b.jpg`,
 * which shows a whole front card very nearly square-on, cross-checked against
 * `bat_int_doorcard_front.jpg` (the opposite door, so its frame is mirrored —
 * on both cars the release lever is at the card's FORWARD end, which is what
 * settles which way round either frame is).
 *
 * ## The bands
 *
 * As fractions of the card's own height in that frame (y 248 → 1190 px), so
 * the reading survives not knowing the photograph's scale:
 *
 *     capping        0      – 0.045      vinyl, rolled over the beltline
 *     cloth insert   0.045  – 0.459      the one light-toned zone
 *     bright strip   0.459  – 0.480      along the top of the armrest
 *     armrest        0.480  – 0.671      padded, and it is the grab handle
 *     lower panel    0.671  – 0.756      dark grained vinyl
 *     map pocket     0.756  – 1.0        mouth, then the pocket's outer face
 *
 * mapped onto the card's own 0.9855 (beltline) → 0.302 (lower edge, 67 mm
 * above `HP.sillY`). That puts the bright strip at y 0.666 and the armrest's
 * top at 0.670 — **140 mm lower than the old 0.8045**, which had the strip up
 * by the glass and the armrest at shoulder height.
 *
 * ## Along the card
 *
 * Same frame, as fractions of the card's length from its forward edge:
 *
 *     speaker grille    centre 0.137, diameter 0.28 of the card height
 *     release lever     centre 0.156, at 0.114 of the height
 *     window pod        0.06, on the shelf at the armrest's forward end
 *     grab strap        rises forward out of the armrest at 0.33
 *     armrest           0.33 → 0.97
 *
 * The speaker is the surprise: 0.28 of the card height is a **~190 mm** grille,
 * against the 128 mm that was here. It is a wide moulded surround over a much
 * smaller cone, and it is the largest single feature on the card.
 *
 * The cards matter more than they look: they are what the eye actually lands
 * on through an open-looking side window, and their top edge is the line the
 * daylight opening is read against.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { CABIN, DRIVER, TONE, innerHalfW } from './layout';
import { clamp, cyl, fbm, lerp, merge, mesh, mirrored, roundedBox, smoothstep, surface, TAU } from './util';

/** Card heights, world y. Struck from the band fractions above. */
const Y = {
  top: 0.9855,
  cappingRoll: 0.9720,
  cappingBot: 0.9530,
  insertTop: 0.9300,
  insertBot: 0.6900,
  stripTop: 0.6740,
  stripBot: 0.6640,
  armTop: 0.6700,
  armBelly: 0.5850,
  armBot: 0.5270,
  lowerBot: 0.4700,
  pocketMouth: 0.4470,
  pocketFaceTop: 0.4280,
  pocketFaceBot: 0.3600,
  bottom: 0.3020,
} as const;

/** Speaker centre and the release lever, world y. */
const Y_SPEAKER = 0.5630;
const Y_LEVER = 0.9050;

interface DoorSpec {
  /** Which flank: +1 is the car's LEFT, so +1 is the driver's side. */
  side: number;
  zFront: number;
  zRear: number;
  /** Where the armrest runs, as fractions along the card. */
  armFrom: number;
  armTo: number;
  switches: number;
  /** Driver's door: handle worn, card slightly scuffed. */
  wear: number;
}

/**
 * The card shell, between two heights.
 *
 * Three sheets rather than one, because the card's three zones are three
 * materials on the real car — vinyl capping, cloth insert, grained vinyl
 * below — and splitting the loft is what gets the tonal break without adding
 * a draw: the insert goes out with the cards' lighter moulding colour and the
 * other two with the darker trim, which are both already meshes here.
 */
type Station = [number, number];

function shell(d: DoorSpec, stations: Station[], nv = 26): THREE.BufferGeometry {
  return surface(stations.length - 1, nv, false, (i, j, out) => {
    const v = j / nv;
    const z = lerp(d.zFront, d.zRear, v);
    const [off, y] = stations[i];
    // Ends of the card pull back to the shutline.
    const end = 1 - smoothstep(0.93, 1.0, Math.abs(v * 2 - 1));
    // The driver's card has been kicked, leaned on and climbed over; the
    // others have not. Scuffing is strongest low down, where feet reach.
    const scuff = d.wear * (1 - smoothstep(0.42, 0.72, y)) * fbm(y * 34, d.side * 3.1, z * 7, 2) * 0.0018;
    out.set(d.side * (innerHalfW(y) - off * end - 0.002 + scuff), y, z);
  });
}

// All three run BOTTOM to TOP. `surface()` takes its winding from the vertex
// order, and these are one-sided sheets: a card whose stations descend is
// wound to face outboard, which means the cabin sees straight through it to
// the door skin. Every station list in this stream ascends for that reason.

/** Capping: the insert's top edge, up over the beltline roll. */
const CAP: Station[] = [
  [0.013, Y.insertTop], [0.024, Y.cappingBot], [0.030, Y.cappingRoll], [0.007, Y.top],
];

/** Cloth insert: the one light zone, very slightly dished. */
const INSERT: Station[] = [
  [0.014, Y.insertBot], [0.011, 0.720], [0.009, 0.790], [0.010, 0.870], [0.013, Y.insertTop],
];

/** Everything below the bright strip, including the map pocket. */
const LOWER: Station[] = [
  [0.004, Y.bottom], [0.014, 0.335], [0.034, Y.pocketFaceBot], [0.036, Y.pocketFaceTop],
  [0.008, Y.pocketMouth], [0.015, Y.lowerBot], [0.016, Y.armBot],
  [0.017, 0.640], [0.026, Y.stripBot], [0.030, Y.stripTop], [0.014, Y.insertBot],
];

/**
 * The speaker grille.
 *
 * A wide, shallow moulded surround with concentric ridges in it — 190 mm
 * across on the photograph, which is nearly a third of the card's height and
 * the biggest single thing on it.
 */
function speakerGrille(radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const rings = 11;
  for (let i = 0; i <= rings * 3; i++) {
    const t = i / (rings * 3);
    const r = t * radius;
    // Ridges across the perforated field, then a raised rim at the edge.
    const d = -0.0026 * (0.5 - 0.5 * Math.cos(t * rings * TAU)) * smoothstep(0.92, 0.7, t)
      - 0.0075 * (1 - clamp(t * 1.18, 0, 1) ** 2);
    pts.push(new THREE.Vector2(Math.max(0.0004, r), d));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

interface DoorGeo { card: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[]; switches: THREE.BufferGeometry[]; bright: THREE.BufferGeometry[] }

function door(d: DoorSpec, out: DoorGeo): void {
  out.card.push(shell(d, INSERT as Station[]));
  out.trim.push(shell(d, CAP as Station[], 22), shell(d, LOWER as Station[]));

  const parts: THREE.BufferGeometry[] = [];
  const brights: THREE.BufferGeometry[] = [];
  const darks: THREE.BufferGeometry[] = [];

  const zAt = (f: number): number => lerp(d.zFront, d.zRear, f);
  const xAt = (y: number, off: number): number => d.side * (innerHalfW(y) - off);
  const len = Math.abs(d.zRear - d.zFront);

  /**
   * The bright dividing line.
   *
   * 8 mm of face where it was 20, and it runs only where the armrest runs,
   * which is what the photograph shows — forward of the armrest the cloth
   * insert carries straight on down to the speaker panel. Its face is tipped
   * DOWN so it looks into the cabin rather than up at the window: the old one
   * was a 20 mm horizontal chrome shelf under an open pane and it rendered at
   * V 250 the whole length of the car.
   */
  // **Three millimetres of it**, and only three. `TONE.bright` is 2.7x the
  // albedo of the card around it, so anything wider is a glowing bar wherever
  // the sun comes through the far side of the cabin and lands on the card's
  // inboard face — which it does in every one of these poses. On
  // `bat_int_doorcard_b.jpg` it is a hairline, and the tonal break under it is
  // made by the armrest's own shadow, not by the strip's width.
  const beadZ0 = zAt(d.armFrom - 0.02);
  const beadZ1 = zAt(Math.min(1, d.armTo + 0.02));
  const bead = (prof: Station[], nu: number): THREE.BufferGeometry => surface(nu, 22, false, (i, j, o) => {
    const [off, y] = prof[i];
    o.set(xAt(y, off), y, lerp(beadZ0, beadZ1, j / 22));
  });
  /**
   * The divider is **dark trim**, not a bright strip, and that is a measured
   * concession rather than a shortcut.
   *
   * The reference card does carry a bright metal line here, photographed under
   * overcast. This scene has a hard low sun that comes through the far side of
   * the cabin and lands square on the near card's inboard face, and a long
   * strip at a grazing angle turns any smooth material into a swept specular
   * highlight: 20 mm of chrome, 9 mm of satin bare metal, 2.8 mm of 0x8c8e93
   * and 2.8 mm of 0x5a5d63 all clipped to 255 with a bloom halo, whichever way
   * the bevel faced. That is the V-250 bar the review named, and its cause is
   * the length and the angle, not the width or the colour.
   *
   * So the break is carried the way the photograph carries it in shadow: the
   * cloth insert above against the grained vinyl below, with the armrest's own
   * shelf and shadow gap between them. The three zones read; nothing clips.
   */
  darks.push(bead([
    [0.020, Y.stripTop - 0.0088], [0.031, Y.stripTop - 0.0052], [0.030, Y.stripTop - 0.0028],
  ], 2));
  // `off` GROWS with y, so the bead's face leans inboard-and-DOWN. The other
  // way round it is an up-facing bevel and an up-facing bevel under a pane
  // collects the sky.
  brights.push(bead([[0.028, Y.stripTop - 0.0028], [0.0315, Y.stripTop]], 1));
  darks.push(bead([[0.0300, Y.stripTop + 0.0002], [0.024, Y.stripTop + 0.0022]], 1));

  /**
   * Armrest, and it is also the grab handle — one padded moulding lying on the
   * card, standing 86 mm proud at its belly, with its ends rolled back into
   * the card. Nothing like it was here: the old `handle` was a 30 mm strip at
   * y 0.73 with no pad under it.
   */
  const armProf: Station[] = [
    [0.020, Y.armBot], [0.048, Y.armBot + 0.006], [0.074, 0.548], [0.086, Y.armBelly],
    [0.086, 0.622], [0.080, 0.648], [0.062, Y.armTop - 0.004], [0.040, Y.armTop],
    [0.024, Y.armTop + 0.004], [0.016, Y.stripTop - 0.006],
  ];
  const arm = surface(armProf.length - 1, 20, false, (i, j, o) => {
    const v = j / 20;
    const z = lerp(zAt(d.armFrom), zAt(d.armTo), v);
    const [off, y] = armProf[i];
    // The ends roll back to the card so the moulding has ends.
    const taper = 1 - 0.86 * smoothstep(0.90, 1.0, Math.abs(v * 2 - 1));
    o.set(xAt(y, off * taper), y, z);
  });
  darks.push(arm);

  /**
   * Grab strap: rises forward out of the armrest's front end and lands just
   * under the release lever. It is the part of the C3's door that a hand
   * actually pulls on, and it is the card's strongest line.
   */
  const strapZ0 = zAt(d.armFrom + 0.010);
  const strapZ1 = zAt(Math.max(0, d.armFrom - 0.090));
  // `surface(n, …)` on an open sweep writes n+1 stations, so every count here
  // is `prof.length - 1` and not a typed literal. A 7 against this seven-entry
  // profile read `prof[7]`, and an `undefined` destructure in a geometry
  // callback throws at build time with `tsc` clean — it took the whole app's
  // boot down, and with it every other stream's ability to measure anything.
  const strapProf: Station[] = [
    [0.014, -0.020], [0.040, -0.022], [0.060, -0.012], [0.062, 0.006],
    [0.050, 0.018], [0.030, 0.020], [0.016, 0.012],
  ];
  const strap = surface(strapProf.length - 1, 14, false, (i, j, o) => {
    const t = j / 14;
    const z = lerp(strapZ0, strapZ1, t);
    const y = lerp(Y.armTop - 0.004, 0.812, t ** 0.9);
    const [off, dy] = strapProf[i];
    // Thins as it climbs, and its top end sinks back into the card.
    const k = 1 - 0.42 * smoothstep(0.55, 1.0, t);
    o.set(xAt(y + dy * k, off * k), y + dy * k, z);
  });
  darks.push(strap);

  // Speaker grille: low and forward, the far side of the strap from the
  // armrest. 0.28 of the card height on the photograph.
  const sp = speakerGrille(0.090);
  sp.rotateZ(d.side * Math.PI / 2);
  sp.translate(xAt(Y_SPEAKER, 0.006), Y_SPEAKER, zAt(0.137 * (len > 1.0 ? 1 : 1.18)));
  darks.push(sp);

  // Release lever on its plinth: a rectangular pocket with a hooked lever in
  // it, and the lever's pivot pad is the ribbed bright bit.
  const relZ = zAt(0.156 * (len > 1.0 ? 1 : 1.18));
  const recess = roundedBox(0.084, 0.056, 0.020, 0.006, 1, 3);
  recess.rotateY(d.side * Math.PI / 2);
  recess.translate(xAt(Y_LEVER, 0.004), Y_LEVER, relZ);
  darks.push(recess);
  const lever = roundedBox(0.046, 0.013, 0.012, 0.004, 1, 2);
  lever.rotateY(d.side * Math.PI / 2);
  lever.rotateX(0.05);
  lever.translate(xAt(Y_LEVER, 0.021), Y_LEVER + 0.002, relZ - 0.010);
  parts.push(lever);
  const pad = roundedBox(0.019, 0.023, 0.010, 0.002, 1, 2);
  pad.rotateY(d.side * Math.PI / 2);
  pad.translate(xAt(Y_LEVER, 0.024), Y_LEVER + 0.002, relZ + 0.020);
  brights.push(pad);

  /**
   * Window pod: a small shelf at the armrest's forward end, canted up, with
   * the rockers standing on it. Four plus a rear lockout on the driver's
   * door, one everywhere else.
   */
  const podZ = zAt(0.062 * (len > 1.0 ? 1 : 1.18));
  const podY = 0.7180;
  const podW = 0.030 + d.switches * 0.030;
  const shelf = roundedBox(0.056, 0.013, podW, 0.005, 1, 3);
  shelf.rotateZ(d.side * 0.30);
  shelf.translate(xAt(podY, 0.030), podY, podZ + podW * 0.20);
  darks.push(shelf);
  for (let i = 0; i < d.switches; i++) {
    const cap = roundedBox(0.026, 0.008, 0.021, 0.0022, 1, 2);
    cap.rotateZ(d.side * 0.30);
    cap.rotateX(-0.10 + (i % 2) * 0.05);
    cap.translate(xAt(podY, 0.042), podY + 0.004, podZ + podW * 0.20 - podW * 0.36 + i * 0.029);
    parts.push(cap);
  }
  if (d.switches === 4) {
    // Rear-window lockout, forward of the four.
    const lock = roundedBox(0.018, 0.007, 0.013, 0.002, 1, 2);
    lock.rotateZ(d.side * 0.30);
    lock.translate(xAt(podY - 0.020, 0.024), podY - 0.020, podZ - podW * 0.30);
    parts.push(lock);
    // Mirror joystick, just aft of the pod on the same shelf line.
    const base = roundedBox(0.040, 0.026, 0.030, 0.006, 1, 3);
    base.rotateY(d.side * Math.PI / 2);
    base.translate(xAt(0.752, 0.014), 0.752, podZ + podW * 0.95);
    darks.push(base);
    const stick = cyl(0.0048, 0.0060, 0.014, 10);
    stick.rotateZ(d.side * Math.PI / 2);
    stick.translate(xAt(0.752, 0.028), 0.752, podZ + podW * 0.95);
    parts.push(stick);
  }

  // Map-pocket mouth: a lip along the top of the pocket's outer face, which is
  // what makes the slot read as an opening rather than a groove.
  const lip = surface(1, 20, false, (i, j, o) => {   // two stations, i in 0..1
    const v = j / 20;
    const y = Y.pocketFaceTop + i * 0.0060;
    o.set(xAt(y, 0.036 - i * 0.004), y, lerp(zAt(0.075), zAt(0.965), v));
  });
  darks.push(lip);

  // Courtesy lamp, at the pocket's forward end and low — the one bright
  // rectangle on the bottom half of the real card.
  const lamp = roundedBox(0.048, 0.019, 0.009, 0.002, 1, 2);
  lamp.rotateY(d.side * Math.PI / 2);
  lamp.rotateX(0.25);
  lamp.translate(xAt(0.4090, 0.036), 0.4090, zAt(0.052 * (len > 1.0 ? 1 : 1.18)));
  brights.push(lamp);

  // Lock pin at the top of the card, just inboard of the glass.
  const pin = cyl(0.0035, 0.0035, 0.032, 8);
  pin.translate(xAt(Y.top, 0.026), 1.000, zAt(0.048));
  brights.push(pin);

  out.trim.push(...darks);
  out.switches.push(...parts);
  out.bright.push(...brights);
}

export function buildDoors(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'doorCards';

  // The four-rocker pod, the mirror joystick, the rear-window lockout and the
  // worn card belong to the driver's door, which on a left-hand-drive car is
  // the car's LEFT — side +1. They were all on the right.
  const specs: DoorSpec[] = [
    { side: DRIVER, zFront: CABIN.doorFrontZ - 0.012, zRear: CABIN.doorMidZ + 0.026, armFrom: 0.33, armTo: 0.97, switches: 4, wear: 1 },
    { side: -DRIVER, zFront: CABIN.doorFrontZ - 0.012, zRear: CABIN.doorMidZ + 0.026, armFrom: 0.33, armTo: 0.97, switches: 1, wear: 0.3 },
    { side: DRIVER, zFront: CABIN.doorMidZ - 0.026, zRear: CABIN.doorRearEndZ, armFrom: 0.26, armTo: 0.94, switches: 1, wear: 0.5 },
    { side: -DRIVER, zFront: CABIN.doorMidZ - 0.026, zRear: CABIN.doorRearEndZ, armFrom: 0.26, armTo: 0.94, switches: 1, wear: 0.2 },
  ];
  const geo: DoorGeo = { card: [], trim: [], switches: [], bright: [] };
  for (const s of specs) {
    /**
     * Every card is built on +X and the passenger pair are **mirrored**, not
     * re-evaluated with a flipped sign.
     *
     * `side * f(x)` mirrors a one-sided sheet without reversing its winding,
     * so the -X copy comes out inside-out and the cabin sees through it to the
     * door skin — the second of the two traps `flipWinding` in `util.ts` is
     * written up for, and the old `door()` was squarely in it: all four cards
     * were evaluated with `d.side` inside the sampler, so the two on the car's
     * right have been back-faces for as long as they have existed.
     */
    const one: DoorGeo = { card: [], trim: [], switches: [], bright: [] };
    door({ ...s, side: 1 }, one);
    for (const k of ['card', 'trim', 'switches', 'bright'] as const) {
      for (const g of one[k]) geo[k].push(s.side < 0 ? mirrored(g) : g);
    }
  }
  /**
   * The upper insert is **cloth**, and that is the three-zone tonal split.
   *
   * It was `interiorPlastic` at `TONE.fascia`, one step off the panel below it
   * — a 1.24x albedo ratio, which at cabin light levels is no split at all.
   * The real card's upper panel is the same velour as the seats, so it is the
   * same `fabric()` instance the seats already carry: lighter, matte, and it
   * scatters, which is the whole difference. No new material and no new draw.
   */
  group.add(mesh(merge(geo.card), ctx.materials.fabric(), 'doorCardInsert'));
  group.add(mesh(merge(geo.trim), ctx.materials.interiorPlastic({ color: TONE.lowerTrim, roughness: 0.82 }), 'doorTrim'));
  group.add(mesh(merge(geo.switches), ctx.materials.interiorPlastic({ color: 0x131417, roughness: 0.80 }), 'doorSwitches'));
  /**
   * The strip, the lever pad, the lamp lens and the lock pin are **not metal**.
   *
   * They were `chrome({ roughness: 0.32 })`, which put a 20 mm mirror shelf
   * along the whole length of a card that sits directly under an open pane:
   * it rendered at V 250 and was the brightest object in the cabin from every
   * pose, inside and out. Satin bare metal — `dirtyMetal` at `metalness: 1`,
   * which is what `anodised()` in the library is — was no better: at
   * `envMapIntensity: 1` beside a window, any orientation reads past 200.
   *
   * `TONE.bright` at 0.42 is the same instance `dash.ts` dresses its fascia
   * markings and `shell.ts` its sill treads with, so this costs no material
   * and no draw. Three millimetres of it, leaning down — see the bead below.
   *
   * Worth recording because it cost most of a round: the white bar a review
   * reads as this strip is mostly **not** this strip. `pick` on the `cabinL`
   * and `doorrear2` poses puts `cabin:chrome:0.300` — the sill tread plate in
   * `shell.ts`, 2.1 m of mirror lying flat under the pane — within 20 px of
   * the card's trim line from any camera that looks slightly down. Both were
   * over-bright; only one of them was on the door.
   */
  group.add(mesh(merge(geo.bright), ctx.materials.interiorPlastic({
    color: TONE.bright, roughness: 0.42,
  }), 'doorSatin'));
  return group;
}

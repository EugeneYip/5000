/**
 * Centre stack, console, shifter, handbrake and pedals.
 *
 * The stack reads top to bottom exactly as the car's does, against
 * `scratchpad/ref3/bat3_int_dash_console.jpg` and the near-dead-on
 * `bat_int_centre_stack.jpg`: the **centre louvre block** with the digital
 * clock and trip-computer panel beside it, a single row of seven tall
 * rockers, the **ELECTRONIC CLIMATE CONTROL** head, the cassette head unit,
 * and the equaliser/preset panel below it.
 *
 * Two things in here were the wrong part, not badly built:
 *
 * - The climate head was **three large rotaries**, which came from
 *   `REFERENCE-VEHICLE.md` §5.3 before `8fed44a` corrected it off the
 *   photograph. There is not one rotary knob on the real part: it is a flat
 *   black glass panel with a red WARMER rocker over a blue COOLER one, a red
 *   seven-segment readout, an OUTSIDE TEMP degC/degF slide, and a row of seven
 *   flat push-buttons — OFF ECON BI-LEV AUTO defrost LO/HI.
 * - The **centre louvre block was missing altogether**, and it is the most
 *   prominent object on the real stack. Three token louvres were sitting under
 *   the dash brow in `dash.ts` at y 1.0115, above where this block goes; the
 *   real car has no vent row up there and they are gone.
 *
 * ## Scale, and the one thing that is still wrong
 *
 * Bay heights measured off `bat_int_centre_stack.jpg`, scaled on its DIN radio
 * aperture (182 x 53 mm, which gives 0.267 mm/px vertical):
 *
 *     louvre + clock  ~145      switch row  79      climate  68
 *     radio (DIN)       54      equaliser   44      total   390 mm
 *
 * The package gives this face **306 mm** between the brow and the console's
 * nose, so the bays are laid in at their measured proportions and a single
 * 0.785 height factor. Widths are at full size — the stack is 250 mm wide and
 * the real one measures ~250 — so the stack is slightly squat. The 84 mm is
 * the console's, not the fascia's: see `consoleTop`.
 *
 * All of the fine printing — legends, scales, the clock and radio displays —
 * is one canvas on one plane, with the knobs, keycaps, blades and slots
 * standing on top of it in geometry. That keeps the legends crisp, the
 * registration exact, and the whole stack to a single extra draw call.
 */

import * as THREE from 'three';
import type { BuildContext, VehicleState } from '@/types';
import { CABIN, TONE } from './layout';
import { canvasTexture, DIAL_FONT, makeCanvas } from './printed';
import { cyl, lerp, merge, mesh, mirrored, roundedBox, smoothstep, surface, tube, type Vec3 } from './util';
import type { StaticBatch } from './batch';

const PANEL = { w: 250, h: 306 } as const;
const PPMM = 6.0;
/** Stack panel centre, in vehicle space. Spans y 0.9955 (brow) to 0.6940. */
const PANEL_Y = 0.84475;
/**
 * The panel's rake, **negative** about x.
 *
 * The fascia's face moves forward as it goes down — `fz(y) = dashRearZ +
 * (dashTopY - y) * fasciaRake`, so z grows as y falls. A plane rotated by
 * `+RAKE` does the opposite: its top edge swings AWAY from the driver. The
 * panel used to carry `+RAKE`, which at the old 240 mm height buried its top
 * 33 mm inside the dash pad and stood its bottom 20 mm out of it. That is
 * what `pick` found over the whole upper bay — `cabin:interiorPlastic:26282c`
 * (the dash pad) frontmost at z -0.679 with `stackFace` 32 mm behind it — and
 * it is why the stack has looked 200 mm tall in every render: everything
 * above the switch row was inside the moulding.
 */
const RAKE = -Math.atan(CABIN.fasciaRake);
const PANEL_Z = -0.7125 + (1.028 - PANEL_Y) * CABIN.fasciaRake + 0.0205 - 0.006;

const px = (mm: number): number => (PANEL.w / 2 - mm) / 1000;
const py = (mm: number): number => (PANEL.h / 2 - mm) / 1000;

/**
 * The five bays, canvas mm from the top. Measured proportions x 0.785 — see
 * the note at the head of the file.
 */
const BAY = {
  clock: { x: 8, y: 6, w: 92, h: 102 },
  vent: { x: 106, y: 6, w: 138, h: 102 },
  sw: { x: 6, y: 118, w: 238, h: 54 },
  ecc: { x: 6, y: 180, w: 238, h: 45 },
  rad: { x: 6, y: 232, w: 238, h: 36 },
  eq: { x: 6, y: 274, w: 238, h: 28 },
} as const;

/**
 * Switch bays, left to right as the driver sees them — canvas x 0 is the car's
 * LEFT, which on this left-hand-drive car is the driver's side.
 *
 * Seven bays, one row, not the eight in two rows that were here: the row on
 * `bat_int_centre_stack.jpg` is seven tall portrait rockers across the full
 * width of the stack, with a seat-heater rheostat wheel at each END and the
 * round red hazard button in the middle.
 */
const SWITCHES: Array<'seat' | 'rdefog' | 'antilock' | 'rfog' | 'hazard' | 'ffog'> = [
  'seat', 'rdefog', 'antilock', 'rfog', 'hazard', 'ffog', 'seat',
];
const SW_PITCH = BAY.sw.w / SWITCHES.length;
const swX = (i: number): number => BAY.sw.x + (i + 0.5) * SW_PITCH;

/** The seven climate push-buttons, and the label each carries above it. */
const ECC_KEYS = ['OFF', 'ECON', 'BI-LEV', 'AUTO', '', 'LO', 'HI'] as const;

/** Key `i` of the climate row, across a glass panel at `gx` of width `gw`. */
const eccKeyX = (gx: number, gw: number, i: number): number =>
  gx + 16 + (i * (gw - 26)) / (ECC_KEYS.length - 1);

/**
 * Height of the console's top surface at path station v.
 *
 * The nose of the tunnel used to start at y 0.788 — 396 mm above the floor
 * pan — which left the fascia barely 200 mm of face between the dash brow and
 * the console, and the real stack is 390 mm tall. So the nose is dropped 98 mm
 * and blended back onto the old line by v 0.22, which is also what the real
 * console does: a low recessed tray in front of the shifter, with the ashtray
 * lid on it rather than standing on the stack face where it was.
 *
 * Everything aft of v 0.22 — the shifter at 0.41, the handbrake at 0.63, the
 * rear heat duct — is untouched, and reads this so it cannot drift.
 */
function consoleTop(v: number): number {
  return 0.760 - 0.196 * Math.min(1, v / 0.30) + 0.032 * Math.max(0, v - 0.30)
    - 0.098 * (1 - smoothstep(0, 0.22, v));
}

// ---------------------------------------------------------------------------

/**
 * The stack's artwork.
 *
 * Every legend, display and coloured pilot on the real stack is printed or
 * behind glass, so all of it is here and none of it is geometry: the red
 * WARMER and blue COOLER rocker faces, the seven-segment readout, the four
 * red pilots, the clock, the radio's tuning display and the equaliser grid.
 * The keycaps, blades, knobs and slots that stand on top of this are the only
 * things that need to be solid, which is what keeps the stack to two draws.
 */
function drawPanel(): ReturnType<typeof makeCanvas> {
  const c = makeCanvas(PANEL.w, PANEL.h, PPMM);
  const g = c.g;
  g.fillStyle = '#25272b';
  g.fillRect(0, 0, PANEL.w, PANEL.h);
  g.textBaseline = 'middle';

  /** A moulded recess: darker floor, a hard shadow line round the opening. */
  const well = (x: number, y: number, w: number, h: number, fill: string): void => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#121316';
    g.lineWidth = 0.8;
    g.strokeRect(x, y, w, h);
  };
  const text = (t: string, x: number, y: number, size: number, fill: string, weight = '500', align: CanvasTextAlign = 'center'): void => {
    g.fillStyle = fill;
    g.font = `${weight} ${size}px ${DIAL_FONT}`;
    g.textAlign = align;
    g.fillText(t, x, y);
  };
  const pilot = (x: number, y: number, r: number, on: string): void => {
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, on);
    rad.addColorStop(0.6, on);
    rad.addColorStop(1, '#1a0603');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  // Bay divisions: the stack is five mouldings in one aperture, and the
  // shadow gaps between them are most of what makes it read as five.
  for (const b of [BAY.sw, BAY.ecc, BAY.rad, BAY.eq]) {
    g.fillStyle = '#1b1d20';
    g.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    g.strokeStyle = '#0e0f11';
    g.lineWidth = 1.4;
    g.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  }

  // -- clock and trip computer ----------------------------------------------
  // Driver's side of the top bay, as on `bat3_int_int_dash_console.jpg`: the
  // LCD, three keys, the `computer` legend, the selector, then the instrument
  // rheostat slider and the `check` lamp at the bottom.
  const K = BAY.clock;
  g.fillStyle = '#1b1d20';
  g.fillRect(K.x - 2, K.y - 2, K.w + 4, K.h + 4);
  well(K.x + 6, K.y + 5, 52, 22, '#0c1013');
  text('10:42', K.x + 32, K.y + 16.5, 15, '#2f7f57', '600');
  for (let i = 0; i < 3; i++) well(K.x + 8 + i * 15, K.y + 33, 12, 9, '#141619');
  text('computer', K.x + 46, K.y + 49, 5.2, '#8a8884', '500', 'left');
  well(K.x + 8, K.y + 55, 54, 18, '#141619');
  well(K.x + 12, K.y + 60, 30, 8, '#26282c');
  // Instrument rheostat: a ribbed slider with a lamp glyph over it.
  well(K.x + 6, K.y + 84, 26, 10, '#101215');
  g.strokeStyle = '#5d5f63';
  g.lineWidth = 0.7;
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.moveTo(K.x + 9 + i * 3.2, K.y + 86);
    g.lineTo(K.x + 9 + i * 3.2, K.y + 92);
    g.stroke();
  }
  text('check', K.x + 44, K.y + 89, 5.6, '#8a8884', '500', 'left');
  pilot(K.x + 74, K.y + 89, 4.2, '#d98518');

  // -- centre louvre block --------------------------------------------------
  // Only the dark box behind the blades is printed; the blades, the two posts
  // and the thumbwheels are geometry, because at `dash` distance the gaps
  // between them are the whole point.
  const V = BAY.vent;
  g.fillStyle = '#1b1d20';
  g.fillRect(V.x - 2, V.y - 2, V.w + 4, V.h + 4);
  well(V.x, V.y, V.w, V.h, '#07080a');

  // -- switch row -----------------------------------------------------------
  // Icons print at the top of each bay; the rocker stands in the lower half.
  const S = BAY.sw;
  for (let i = 0; i < SWITCHES.length; i++) {
    const cx = swX(i);
    const kind = SWITCHES[i];
    well(cx - SW_PITCH / 2 + 1.6, S.y + 2, SW_PITCH - 3.2, S.h - 4, '#191b1e');
    const iy = S.y + 12;
    if (kind === 'hazard') {
      // Printed, not moulded: this was a chrome cylinder and it rendered as a
      // pure white disc in the middle of the stack. A 13 mm red button in a
      // black bay is all it is.
      const hy = S.y + S.h * 0.60;
      g.fillStyle = '#0b0c0d';
      g.beginPath(); g.arc(cx, hy, 8.4, 0, Math.PI * 2); g.fill();
      pilot(cx, hy, 6.5, '#e0281c');
      continue;
    }
    g.strokeStyle = '#b9b7b2';
    g.fillStyle = '#b9b7b2';
    g.lineWidth = 0.8;
    if (kind === 'seat') {
      // A seat in section with heat lines off its back.
      g.beginPath();
      g.moveTo(cx - 5, iy + 5); g.lineTo(cx + 4, iy + 5); g.lineTo(cx + 4, iy + 3);
      g.lineTo(cx - 2, iy + 3); g.lineTo(cx - 2, iy - 5); g.lineTo(cx - 5, iy - 5);
      g.closePath();
      g.fill();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(cx + 0.5, iy - 5 + k * 3.4);
        g.lineTo(cx + 6, iy - 6.5 + k * 3.4);
        g.stroke();
      }
    } else if (kind === 'rdefog') {
      g.strokeRect(cx - 6, iy - 4.5, 12, 9);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(cx - 3 + k * 3, iy + 3);
        g.lineTo(cx - 3 + k * 3, iy - 3);
        g.stroke();
      }
    } else if (kind === 'antilock') {
      text('ANTI', cx, iy - 3, 5.4, '#b9b7b2', '500');
      text('LOCK', cx, iy + 4, 5.4, '#b9b7b2', '500');
    } else if (kind === 'rfog' || kind === 'ffog') {
      // Lamp body with three rays, struck through for the rear pair.
      g.beginPath();
      g.moveTo(cx - 6, iy - 4); g.lineTo(cx - 1, iy - 4);
      g.lineTo(cx - 1, iy + 4); g.lineTo(cx - 6, iy + 4);
      g.closePath();
      g.fill();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(cx + 0.5, iy - 3.5 + k * 3.5);
        g.lineTo(cx + 6, iy - 3.5 + k * 3.5);
        g.stroke();
      }
      if (kind === 'rfog') {
        g.beginPath();
        g.moveTo(cx + 1.5, iy + 4.5);
        g.lineTo(cx + 6, iy - 4.5);
        g.stroke();
      }
    }
  }

  // -- electronic climate control -------------------------------------------
  // The moulding carries the name in three lines at the left; everything else
  // is behind the glass panel to its right.
  const E = BAY.ecc;
  text('ELECTRONIC', E.x + 6, E.y + 20, 6.4, '#c9c7c2', '600', 'left');
  text('CLIMATE', E.x + 6, E.y + 28, 6.4, '#c9c7c2', '600', 'left');
  text('CONTROL', E.x + 6, E.y + 36, 6.4, '#c9c7c2', '600', 'left');

  const GL = { x: E.x + 82, y: E.y + 2, w: 142, h: E.h - 4 };
  // Flat black glass: a near-black field with a single soft sheen across it,
  // which is what makes it read as glass and not as a painted panel.
  const gl = g.createLinearGradient(GL.x, GL.y, GL.x + GL.w * 0.6, GL.y + GL.h);
  gl.addColorStop(0, '#0a0b0d');
  gl.addColorStop(0.45, '#15181c');
  gl.addColorStop(0.55, '#0c0d0f');
  gl.addColorStop(1, '#090a0b');
  g.fillStyle = gl;
  g.fillRect(GL.x, GL.y, GL.w, GL.h);
  g.strokeStyle = '#2b2d31';
  g.lineWidth = 0.7;
  g.strokeRect(GL.x, GL.y, GL.w, GL.h);

  /**
   * A coloured rocker face.
   *
   * Printed rather than moulded. The pair were geometry over the print, and a
   * `roundedBox` is a solid: the two boxes covered the red and the blue
   * exactly, which is how the one panel on the car that is unmistakably
   * WARMER-over-COOLER came out as two black rectangles.
   */
  const rocker = (x: number, y: number, w: number, h: number, face: string, edge: string): void => {
    g.fillStyle = '#0c0d0f';
    g.fillRect(x - 1.6, y - 1.6, w + 3.2, h + 3.2);
    g.fillStyle = edge;
    g.fillRect(x, y, w, h);
    g.fillStyle = face;
    g.fillRect(x, y + h * 0.16, w, h * 0.68);
  };

  text('WARMER', GL.x + 26, GL.y + 4.5, 4.8, '#e6e4e0', '600');
  rocker(GL.x + 15, GL.y + 8, 22, 5.4, '#c4231a', '#e0574a');
  text('COOLER', GL.x + 26, GL.y + 17.5, 4.8, '#e6e4e0', '600');
  rocker(GL.x + 15, GL.y + 21, 22, 5.4, '#1e3fa8', '#4f74d6');

  // Seven-segment cabin setpoint, centre.
  text('68', GL.x + 76, GL.y + 13, 17, '#e8241a', '700');
  // OUTSIDE TEMP, its degC/degF slide and its own pilot, right.
  text('OUTSIDE  TEMP', GL.x + 113, GL.y + 4.5, 4.2, '#e6e4e0', '600');
  pilot(GL.x + 96, GL.y + 12.5, 2.3, '#e8241a');
  well(GL.x + 103, GL.y + 8.5, 24, 8.5, '#1d2024');
  g.fillStyle = '#c9c7c2';
  g.fillRect(GL.x + 116, GL.y + 9.5, 10, 6.5);
  text('C', GL.x + 109, GL.y + 21, 4.2, '#e6e4e0', '600');
  text('F', GL.x + 122, GL.y + 21, 4.2, '#e6e4e0', '600');

  // The button row's labels, and the red pilot that sits beside OFF.
  for (let i = 0; i < ECC_KEYS.length; i++) {
    const cx = eccKeyX(GL.x, GL.w, i);
    if (ECC_KEYS[i]) text(ECC_KEYS[i], cx, GL.y + 30.5, 4.4, '#e6e4e0', '600');
    else {
      // Defrost: a screen with three wavy rays.
      g.strokeStyle = '#e6e4e0';
      g.lineWidth = 0.6;
      g.beginPath();
      g.ellipse(cx, GL.y + 31.5, 3.8, 2.6, 0, Math.PI, Math.PI * 2);
      g.stroke();
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.moveTo(cx - 2.2 + k * 2.2, GL.y + 29.2);
        g.lineTo(cx - 2.2 + k * 2.2, GL.y + 31.4);
        g.stroke();
      }
    }
  }
  pilot(GL.x + 6, GL.y + 30.5, 2.4, '#e8241a');
  text('Audi', GL.x + GL.w - 5, GL.y + GL.h - 3, 4.2, '#7c7a76', '500', 'right');

  // -- cassette head unit ---------------------------------------------------
  const R = BAY.rad;
  // Cassette door, then the tuning display, then the preset row.
  well(R.x + 34, R.y + 3, 170, 11, '#0b0c0d');
  well(R.x + 58, R.y + 16, 76, 11, '#0d1216');
  text('FM1   101.1', R.x + 62, R.y + 22, 7, '#2f7f57', '600', 'left');
  text('Audi  design', R.x + 226, R.y + 9, 4.6, '#8a8884', '500', 'right');
  g.font = `400 3.8px ${DIAL_FONT}`;
  g.textAlign = 'center';
  g.fillStyle = '#9a9894';
  for (let i = 0; i < 5; i++) g.fillText(String(i + 1), R.x + 62 + i * 21, R.y + 34.5);
  text('SEEK', R.x + 182, R.y + 31, 4.2, '#9a9894', '500');
  text('SCAN', R.x + 208, R.y + 31, 4.2, '#9a9894', '500');

  // -- equaliser / preset panel --------------------------------------------
  // The pale grid is the one light-toned thing on the whole stack, and it is
  // what makes the bottom bay read at distance.
  const Q = BAY.eq;
  const grid = { x: Q.x + 54, y: Q.y + 4, w: 86, h: 20 };
  g.fillStyle = '#0a0b0c';
  g.fillRect(grid.x, grid.y, grid.w, grid.h);
  g.strokeStyle = '#6e6c68';
  g.lineWidth = 0.35;
  for (let i = 0; i <= 17; i++) {
    g.beginPath(); g.moveTo(grid.x + i * (grid.w / 17), grid.y); g.lineTo(grid.x + i * (grid.w / 17), grid.y + grid.h); g.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(grid.x, grid.y + i * (grid.h / 4)); g.lineTo(grid.x + grid.w, grid.y + i * (grid.h / 4)); g.stroke();
  }
  // Two slider handles standing on the grid, as on the photograph.
  g.fillStyle = '#c4c2bd';
  for (const sx of [grid.x + 20, grid.x + 52]) {
    g.fillRect(sx - 3, grid.y + 1, 6, grid.h - 2);
    g.fillRect(sx - 5, grid.y + 7, 10, 6);
  }
  text('PROGRAM', Q.x + 176, Q.y + 8, 4.2, '#9a9894', '500');
  text('AM · FM', Q.x + 176, Q.y + 18, 4.2, '#9a9894', '500');
  text('DX', Q.x + 30, Q.y + 6, 4.2, '#9a9894', '500');
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

  // -- centre louvre block --------------------------------------------------
  // The hero of the stack, and it was not here at all. Three bays of fine
  // horizontal blades behind a bezel, split by two posts, with a round
  // thumbwheel standing on each post — `bat3_int_dash_console.jpg`.
  //
  // Discrete blades rather than a corrugated sheet: the dark air gaps between
  // them are what a louvre reads as, and at the `dash` pose this block is
  // 300 mm from the eye. 14 rows x 3 bays is ~5.6 k triangles, which is what
  // the most prominent object on the stack is worth.
  {
    const V = BAY.vent;
    // A FRAME, four bars. It was one `roundedBox` the size of the bay, and a
    // rounded box is solid: it covered all forty-two blades, and the most
    // prominent object on the stack rendered as a flat slab.
    for (const [bw, bh, bx, by] of [
      [V.w + 8, 5, V.x + V.w / 2, V.y - 2.5],
      [V.w + 8, 5, V.x + V.w / 2, V.y + V.h + 2.5],
      [5, V.h + 8, V.x - 2.5, V.y + V.h / 2],
      [5, V.h + 8, V.x + V.w + 2.5, V.y + V.h / 2],
    ] as Array<[number, number, number, number]>) {
      const bar = roundedBox(bw / 1000, bh / 1000, 0.013, 0.0016, 1, 3);
      bar.translate(px(bx), py(by), -0.0055);
      caps.push(bar);
    }

    const ROWS = 14;
    const POST = 3;
    const bayW = (V.w - 2 * POST) / 3;
    for (let b = 0; b < 3; b++) {
      const bx = V.x + b * (bayW + POST);
      for (let r = 0; r < ROWS; r++) {
        const cy = V.y + ((r + 0.5) / ROWS) * V.h;
        const blade = roundedBox((bayW - 2) / 1000, (V.h / ROWS) * 0.62 / 1000, 0.009, 0.0006, 1, 2);
        // A vent nobody has touched in thirty years does not have parallel
        // blades; the set is tipped and each row is a degree or two off it.
        blade.rotateX(-0.20 + ((r + b) % 3) * 0.022);
        blade.translate(px(bx + bayW / 2), py(cy), -0.0045);
        caps.push(blade);
      }
      if (b < 2) {
        const post = roundedBox(POST / 1000, (V.h - 3) / 1000, 0.012, 0.0006, 1, 2);
        post.translate(px(V.x + (b + 1) * bayW + b * POST + POST / 2), py(V.y + V.h / 2), -0.0050);
        caps.push(post);
        // Thumbwheel: a knurled disc turning in the plane of the panel, which
        // is how it swings the vanes. It reads as a circle on the
        // photograph, not as a roller band — so the axis is the panel's
        // normal, not a horizontal one.
        const wy = V.y + (b === 0 ? 0.34 : 0.62) * V.h;
        const wx = px(V.x + (b + 1) * bayW + b * POST + POST / 2);
        const wheel = cyl(0.0092, 0.0092, 0.0062, 18);
        wheel.rotateX(Math.PI / 2);
        wheel.translate(wx, py(wy), -0.0080);
        knobs.push(wheel);
        for (let k = 0; k < 12; k++) {
          const a2 = (k / 12) * Math.PI * 2;
          const rib = roundedBox(0.0018, 0.0026, 0.0060, 0.0005, 1, 1);
          rib.rotateZ(a2);
          rib.translate(wx + Math.sin(a2) * 0.0088, py(wy) + Math.cos(a2) * 0.0088, -0.0080);
          knobs.push(rib);
        }
      }
    }
  }

  // -- clock / trip-computer keys -------------------------------------------
  {
    const K = BAY.clock;
    for (let i = 0; i < 3; i++) {
      const b = roundedBox(0.011, 0.008, 0.005, 0.0012, 1, 2);
      b.translate(px(K.x + 14 + i * 15), py(K.y + 37.5), -0.0035);
      caps.push(b);
    }
    // Trip selector: a small lever in its own recess.
    const sel = roundedBox(0.028, 0.0065, 0.006, 0.0015, 1, 2);
    sel.translate(px(K.x + 27), py(K.y + 64), -0.0040);
    caps.push(sel);
    const slide = roundedBox(0.022, 0.0055, 0.005, 0.0012, 1, 2);
    slide.translate(px(K.x + 19), py(K.y + 89), -0.0038);
    knobs.push(slide);
  }

  // -- switch row -----------------------------------------------------------
  // One row of seven tall rockers. Both ends are the seat-heater rheostats,
  // which are ribbed wheels and not rockers; the middle is the round red
  // hazard button on its own plinth.
  for (let i = 0; i < SWITCHES.length; i++) {
    const cx = swX(i);
    const kind = SWITCHES[i];
    const cy = BAY.sw.y + BAY.sw.h * 0.63;
    if (kind === 'seat') {
      // Rheostat: a ribbed wheel lying in the bay, turning about x.
      const w = cyl(0.0105, 0.0105, 0.016, 16);
      w.rotateZ(Math.PI / 2);
      w.translate(px(cx), py(cy), -0.0072);
      knobs.push(w);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const rib = roundedBox(0.0155, 0.0011, 0.0011, 0.0003, 1, 1);
        rib.translate(px(cx), py(cy) + Math.cos(a) * 0.0102, -0.0072 + Math.sin(a) * 0.0102);
        knobs.push(rib);
      }
    } else if (kind === 'hazard') {
      // Nothing. The button is printed — see `drawPanel`. A ring of four bars
      // stood here and read as a dark cross over it.
    } else {
      // A rocker sits tipped in its aperture, and no two sit quite alike.
      const cap = roundedBox((SW_PITCH - 5) / 1000, 0.028, 0.009, 0.0016, 2, 3);
      cap.rotateX(-0.09 + (i % 3) * 0.02);
      cap.translate(px(cx), py(cy), -0.0042);
      caps.push(cap);
    }
  }

  // -- climate push-buttons -------------------------------------------------
  // Seven flat keys along the bottom of the glass, and nothing rotary.
  {
    const GL = { x: BAY.ecc.x + 82, y: BAY.ecc.y + 2, w: 142, h: BAY.ecc.h - 4 };
    const keyY = GL.y + GL.h - 3.5;
    for (let i = 0; i < ECC_KEYS.length; i++) {
      const b = roundedBox(0.0150, 0.0050, 0.0055, 0.0009, 1, 2);
      b.rotateX(-0.20);
      b.translate(px(eccKeyX(GL.x, GL.w, i)), py(keyY), -0.0034);
      caps.push(b);
    }
    // Nothing else on the glass is solid. The WARMER and COOLER faces carried
    // a `roundedBox` aperture each and the boxes covered the colour they were
    // supposed to frame; both are printed, bevel and all.
    //
    // OUTSIDE TEMP slide: a small lever in its window, which is the one thing
    // on this panel that really does stand off the glass.
    const sl = roundedBox(0.0080, 0.0058, 0.0038, 0.0009, 1, 2);
    sl.translate(px(GL.x + 121), py(GL.y + 12.5), -0.0028);
    knobs.push(sl);
  }

  // -- cassette head unit ---------------------------------------------------
  {
    const R = BAY.rad;
    // Cassette door: a wide flap with a finger lip along its bottom edge.
    const doorG = roundedBox(0.168, 0.0105, 0.006, 0.0014, 1, 2);
    doorG.translate(px(R.x + 119), py(R.y + 8.5), -0.0035);
    caps.push(doorG);
    const lip = roundedBox(0.026, 0.0020, 0.0026, 0.0005, 1, 2);
    lip.translate(px(R.x + 119), py(R.y + 12.6), -0.0068);
    caps.push(lip);
    // Presets, then the seek/scan pair outboard of them.
    for (let i = 0; i < 5; i++) {
      const b = roundedBox(0.0155, 0.0072, 0.0060, 0.0012, 1, 2);
      b.translate(px(R.x + 62 + i * 21), py(R.y + 30), -0.0036);
      caps.push(b);
    }
    for (const kx of [182, 208]) {
      const b = roundedBox(0.0135, 0.0058, 0.0055, 0.0011, 1, 2);
      b.translate(px(R.x + kx), py(R.y + 27), -0.0034);
      caps.push(b);
    }
    // Volume over tone, stacked at the left as on the photograph.
    for (const [kx, ky, r] of [[20, 12, 0.0092], [20, 28, 0.0078]] as Array<[number, number, number]>) {
      const k = cyl(r, r * 1.06, 0.013, 16);
      k.rotateX(Math.PI / 2);
      k.translate(px(R.x + kx), py(R.y + ky), -0.0058);
      knobs.push(k);
      // No bright pointer. These were two chrome bars 13 mm proud of the face
      // and they read as the brightest thing on the stack; the real volume and
      // tone knobs are plain black with a moulded notch.
      const notch = roundedBox(0.0018, r * 1.3, 0.0022, 0.0005, 1, 1);
      notch.translate(px(R.x + kx), py(R.y + ky) + r * 0.35, -0.0126);
      knobs.push(notch);
    }
  }

  // -- equaliser / preset panel --------------------------------------------
  {
    const Q = BAY.eq;
    for (const [kx, r] of [[26, 0.0098], [176, 0.0072]] as Array<[number, number]>) {
      const k = cyl(r, r * 1.06, 0.014, 16);
      k.rotateX(Math.PI / 2);
      k.translate(px(Q.x + kx), py(Q.y + Q.h / 2), -0.0062);
      knobs.push(k);
      const flat = roundedBox(0.0016, r * 1.4, 0.0016, 0.0005, 1, 1);
      flat.translate(px(Q.x + kx), py(Q.y + Q.h / 2) + r * 0.35, -0.0128);
      marks.push(flat);
    }
  }

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
  // the seats, so the shifter and handbrake grow out of it. The nose now dips
  // to a low tray in front of the shifter — see `consoleTop`.
  const crown = (v: number): number => consoleTop(v) + (v < 0.28 ? (0.28 - v) * 0.10 : 0);
  const halfW = (v: number): number => lerp(0.128, 0.119, Math.min(1, v / 0.26)) - 0.012 * Math.max(0, (v - 0.72) / 0.28);
  const body = surface(10, 26, false, (i, j, out) => {
    const v = j / 26;
    const z = lerp(-0.648, -1.520, v);
    // Section: flat top, rounded shoulders, sides falling to the tunnel.
    const prof: Array<[number, number]> = [
      [-1.0, -0.128], [-1.0, -0.030], [-0.93, -0.004], [-0.72, 0.0], [-0.30, 0.004],
      [0.30, 0.004], [0.72, 0.0], [0.93, -0.004], [1.0, -0.030], [1.0, -0.128], [1.0, -0.20],
    ];
    const q = prof[i];
    out.set(q[0] * halfW(v), crown(v) + q[1], z);
  });
  batch.add(trimMat, body);

  const sideTrim: THREE.BufferGeometry[] = [];
  const side = surface(3, 18, false, (i, j, out) => {
    const v = j / 18;
    const z = lerp(-0.660, -1.510, v);
    const prof: Array<[number, number]> = [[1.0, -0.128], [1.02, -0.175], [1.0, -0.208], [0.86, -0.228]];
    const q = prof[i];
    out.set(-q[0] * halfW(v), crown(v) + q[1], z);
  });
  sideTrim.push(side, mirrored(side));
  // Heat duct to the rear seat area, at the back of the console.
  const duct = roundedBox(0.128, 0.042, 0.020, 0.005, 1, 3);
  duct.translate(0, 0.606, -1.516);
  sideTrim.push(duct);

  // Ashtray and lighter, on the tray the dipped nose makes — which is where
  // they are on the car. They were printed and moulded onto the stack face,
  // 200 mm up the fascia, because there was nowhere else for them to go.
  {
    const trayV = 0.128;
    const trayY = crown(trayV) + 0.004;
    const trayZ = lerp(-0.648, -1.520, trayV);
    const ash = roundedBox(0.126, 0.011, 0.090, 0.003, 1, 3);
    ash.translate(-0.012, trayY + 0.004, trayZ);
    batch.add(dark, ash);
    // `marks` has already been baked into `brightParts` above, and this is
    // authored in world space rather than panel space, so it goes straight in.
    const finger = roundedBox(0.038, 0.005, 0.007, 0.0016, 1, 2);
    finger.translate(-0.012, trayY + 0.010, trayZ - 0.046);
    brightParts.push(finger);
    const lighter = cyl(0.0098, 0.0108, 0.013, 14);
    lighter.translate(0.070, trayY + 0.002, trayZ + 0.006);
    batch.add(dark, lighter);
  }

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
  // Clutch outboard, then brake, then throttle inboard — so on a left-hand
  // drive car they run from +X in toward the tunnel. They were mirrored, with
  // the clutch against the console and the throttle out by the sill.
  pedal(0.508, 0.056, 0.086, 0.230);
  pedal(0.378, 0.062, 0.088, 0.222);
  pedal(0.258, 0.040, 0.112, 0.208);

  // Footrest, canted to meet the sole of a left foot: outboard of the clutch,
  // against the sill.
  const rest = roundedBox(0.070, 0.150, 0.014, 0.005, 2, 3);
  rest.rotateX(-0.34);
  rest.rotateZ(-0.16);
  rest.translate(0.614, 0.420, -0.612);
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


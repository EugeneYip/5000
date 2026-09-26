/**
 * Procedural textures for the wheel. Everything is generated at load — the
 * project ships no image assets.
 *
 * The important one is the tyre sidewall map. A tyre's sidewall is not a
 * smooth surface: it carries moulded raised lettering, a ring of fine
 * serrations above the bead, and an overall rubber grain. All three are baked
 * into one height field and differentiated into a normal map.
 */

import * as THREE from 'three';
import { fbm3, hash1 } from './util';

/** Where a point on the sidewall lands in the tyre's v coordinate.
 *  `t` is the fraction of section height: 0 at the bead seat, 1 at the crown. */
export interface SidewallLayout {
  vAtT(t: number, outboard: boolean): number;
  /** Texture repeats this many times around the circumference. */
  uRepeat: number;
  /** Section height in metres, so millimetres can be converted to `t`. */
  sectionHeight: number;
}

/** Radii are given as a fraction of section height so the legend keeps its
 *  place on the sidewall whatever the tyre is scaled to. */
/** Sipes per half turn — the texture wraps twice around the tyre. */
const TREAD_SIPES_PER_HALF_TURN = 64;

const LETTER_STACK: Array<{ t: number; mm: number; text: string; track: number; weight: string; x: number }> = [
  // Brand and pattern, big, just under the shoulder.
  { t: 0.824, mm: 11.5, text: 'NORDSTERN', track: 1.20, weight: '700', x: 0.055 },
  { t: 0.824, mm: 8.2, text: 'SR 70', track: 1.10, weight: '700', x: 0.315 },
  // Size marking, the one everybody checks.
  { t: 0.697, mm: 8.6, text: '185/70 R 14  87 H', track: 1.08, weight: '700', x: 0.480 },
  // Construction legend.
  { t: 0.608, mm: 5.2, text: 'STEEL BELTED RADIAL \u00b7 TUBELESS', track: 1.02, weight: '500', x: 0.120 },
  // DOT code and origin. 0487 = 4th week of 1987, right for this car.
  { t: 0.523, mm: 4.4, text: 'DOT HU L9 VB4R 0487 \u00b7 MADE IN GERMANY', track: 1.0, weight: '400', x: 0.560 },
  { t: 0.434, mm: 3.8, text: 'MAX LOAD 515 KG (1135 LBS)   MAX PRESS 300 kPa (44 PSI)', track: 1.0, weight: '400', x: 0.150 },
];

/**
 * Sidewall + tread normal map.
 *
 * `W x H` is deliberately anisotropic: u wraps half the circumference, v runs
 * across the whole cross-section, and the two work out to roughly the same
 * millimetres per texel with these numbers.
 */
export function buildTyreNormalMap(layout: SidewallLayout, freeR: number): THREE.Texture {
  const W = 4096;
  const H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;

  // Metres per texel, used to size everything in real units.
  const mPerU = (2 * Math.PI * freeR) / layout.uRepeat / W;

  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);

  const yOf = (v: number): number => (1 - v) * H;

  // --- moulded lettering, INBOARD sidewall only -----------------------------
  // The outboard side carries real extruded relief built by `sidewall.ts`;
  // stamping the same legend into the normal map as well double-prints it, at
  // a different size and a different clocking. The far side never gets close
  // enough for the difference between relief and a normal map to show, so it
  // keeps the cheap version.
  const dt = 0.004 / layout.sectionHeight;
  for (const outboard of [false]) {
    for (const row of LETTER_STACK) {
      const v = layout.vAtT(row.t, outboard);
      const texelsPerM = Math.abs(yOf(layout.vAtT(row.t + dt, outboard)) - yOf(v)) / 0.004;
      const px = (row.mm / 1000) * texelsPerM;
      if (px < 3) continue;
      g.save();
      g.translate(0, yOf(v));
      g.font = `${row.weight} ${px.toFixed(1)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      g.textBaseline = 'middle';
      g.fillStyle = '#e8e8e8';
      // Letter-spacing by hand: a mould's legend is tracked out, and
      // measureText gives no way to ask for that.
      const natural = g.measureText(row.text).width;
      const advance = (natural / row.text.length) * row.track;
      let x = W * row.x;
      for (const ch of row.text) {
        g.fillText(ch, x, 0);
        x += advance;
      }
      g.restore();
    }
  }

  // --- serration ring above the bead ----------------------------------------
  // The fine vertical ribbing every tyre carries low on the sidewall.
  for (const outboard of [true, false]) {
    const y0 = Math.min(yOf(layout.vAtT(0.253, outboard)), yOf(layout.vAtT(0.160, outboard)));
    const y1 = Math.max(yOf(layout.vAtT(0.253, outboard)), yOf(layout.vAtT(0.160, outboard)));
    const pitch = Math.max(0.0022 / mPerU, 3);
    g.fillStyle = '#a2a2a2';
    for (let x = 0; x < W; x += pitch) {
      g.fillRect(x, y0, Math.max(pitch * 0.45, 1), y1 - y0);
    }
  }

  // --- tread sipes ----------------------------------------------------------
  // Sipes are a millimetre wide. Cutting them as geometry costs thousands of
  // triangles for a feature the eye only ever reads as a fine line, so they
  // live in the normal map. The tread band is v 0.28 .. 0.72.
  {
    const yTread0 = yOf(0.72);
    const yTread1 = yOf(0.28);
    const h = yTread1 - yTread0;
    const pitchPx = W / (TREAD_SIPES_PER_HALF_TURN);
    g.strokeStyle = '#6a6a6a';
    g.lineWidth = Math.max(0.0013 / mPerU, 1.4);
    // Inner ribs: v 0.28..0.72 minus the grooves; two bands each side of centre.
    const ribs: Array<[number, number]> = [
      [0.315, 0.400], [0.405, 0.465], [0.535, 0.595], [0.600, 0.685],
    ];
    for (let i = 0; i < TREAD_SIPES_PER_HALF_TURN; i++) {
      const x = i * pitchPx + pitchPx * 0.5;
      for (const [a, b] of ribs) {
        const ya = yOf(b);
        const yb = yOf(a);
        // Sipes rake across the rib, alternating sense either side of centre.
        const rake = (a + b) / 2 > 0.5 ? h * 0.055 : -h * 0.055;
        g.beginPath();
        g.moveTo(x - rake, ya);
        g.lineTo(x + rake, yb);
        g.stroke();
      }
    }
  }

  // --- rubber grain ---------------------------------------------------------
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const inv = 1 / 96;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // Grain plus a slow blotch so the rubber is not uniform.
      //
      // The grain has to be FINE. One texel is about half a millimetre of real
      // sidewall here, so the 3.1 this used to run at made 14 mm pebbles and
      // the close-up read as cast concrete rather than rubber. 13 puts the
      // cell at ~3.5 mm, which is what moulded rubber actually looks like, and
      // the amplitude comes down to match because fine grain needs less of it.
      const n = fbm3(x * inv * 13.0, y * inv * 13.0, 0, 3) - 0.5;
      const blotch = fbm3(x * 0.0016, y * 0.0016, 11.5, 2) - 0.5;
      const val = d[i] + n * 13 + blotch * 6;
      d[i] = d[i + 1] = d[i + 2] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }

  // --- differentiate the height field into a tangent-space normal map -------
  const out = new Uint8Array(W * H * 4);
  const strength = 2.6;
  for (let y = 0; y < H; y++) {
    const ym = ((y - 1 + H) % H) * W;
    const yp = ((y + 1) % H) * W;
    const yc = y * W;
    for (let x = 0; x < W; x++) {
      const xm = (x - 1 + W) % W;
      const xp = (x + 1) % W;
      const hl = d[(yc + xm) * 4];
      const hr = d[(yc + xp) * 4];
      const hd = d[(ym + x) * 4];
      const hu = d[(yp + x) * 4];
      let nx = ((hl - hr) / 255) * strength;
      let ny = ((hd - hu) / 255) * strength;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      const o = (y * W + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len) * 0.5 * 255 + 127;
      out[o + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Fine cast-and-machined grain for the alloy. Tiles. */
export function buildAlloyRoughness(): THREE.Texture {
  const S = 512;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Lathe lines run in one direction; casting porosity is isotropic.
      const line = Math.sin(y * 1.9 + fbm3(x * 0.06, y * 0.02, 3, 2) * 4) * 0.5 + 0.5;
      const cast = fbm3(x * 0.11, y * 0.11, 7, 3);
      const v = 0.55 + line * 0.10 + (cast - 0.5) * 0.30;
      const o = (y * S + x) * 4;
      const b = Math.max(0, Math.min(255, v * 255));
      data[o] = data[o + 1] = data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Brake disc face: concentric turning grooves plus rust mottle. Mapped with
 * v = radius, so the grooves come out as true concentric rings.
 */
export function buildDiscFaceMap(): { rough: THREE.Texture; normal: THREE.Texture } {
  const W = 256;
  const H = 512;
  const rough = new Uint8Array(W * H * 4);
  const norm = new Uint8Array(W * H * 4);
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const groove = Math.sin(y * 2.3 + hash1(y) * 0.8) * 0.5 + 0.5;
      const chatter = fbm3(x * 0.03, y * 0.35, 2, 2);
      height[y * W + x] = groove * 0.6 + chatter * 0.4;
      const o = (y * W + x) * 4;
      const r = 0.22 + groove * 0.16 + (chatter - 0.5) * 0.2;
      const b = Math.max(0, Math.min(255, r * 255));
      rough[o] = rough[o + 1] = rough[o + 2] = b;
      rough[o + 3] = 255;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const hl = height[y * W + ((x - 1 + W) % W)];
      const hr = height[y * W + ((x + 1) % W)];
      const hd = height[((y - 1 + H) % H) * W + x];
      const hu = height[((y + 1) % H) * W + x];
      let nx = (hl - hr) * 1.1;
      let ny = (hd - hu) * 1.1;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * W + x) * 4;
      norm[o] = ((nx / l) * 0.5 + 0.5) * 255;
      norm[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      norm[o + 2] = (1 / l) * 0.5 * 255 + 127;
      norm[o + 3] = 255;
    }
  }
  const mk = (data: typeof rough): THREE.Texture => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.needsUpdate = true;
    return t;
  };
  return { rough: mk(rough), normal: mk(norm) };
}

/**
 * The motion-blur disc. Holds the angular average of the wheel face, so that
 * above a few tens of rad/s it can be faded in over the spider and the slots
 * stop strobing against the frame rate.
 */
export function buildSpinBlurMap(slotInnerFrac: number, slotOuterFrac: number, slotDuty: number): THREE.Texture {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const c = (S - 1) / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - c, y - c) / c;
      const o = (y * S + x) * 4;
      let lum = 0.72;
      let alpha = 0.55;
      if (r >= slotInnerFrac && r <= slotOuterFrac) {
        // Inside the slot band the average is mostly hole.
        lum = 0.72 * (1 - slotDuty) + 0.07 * slotDuty;
        alpha = 0.97;
      } else if (r < slotInnerFrac) {
        alpha = 0.5 + 0.2 * (1 - r / slotInnerFrac);
      } else {
        alpha = 0.55;
      }
      // Feather the band edges — a hard ring would read as a decal.
      const edge = Math.min(
        Math.abs(r - slotInnerFrac),
        Math.abs(r - slotOuterFrac),
      );
      if (r > slotInnerFrac - 0.05 && r < slotOuterFrac + 0.05 && edge < 0.035) {
        const t = edge / 0.035;
        alpha = alpha * t + 0.6 * (1 - t);
      }
      if (r > 1.0) alpha = 0;
      const b = Math.max(0, Math.min(255, lum * 255));
      data[o] = data[o + 1] = data[o + 2] = b;
      data[o + 3] = Math.max(0, Math.min(255, alpha * 255));
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

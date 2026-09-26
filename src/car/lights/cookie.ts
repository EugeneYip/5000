/**
 * Beam cookies — the projected photometric pattern.
 *
 * A spotlight with no map throws a round pool of light. A headlamp does not:
 * it throws a wide, shallow field with a **flat top**, because a shield inside
 * the lamp cuts the filament's upward half off at the reflector. On a
 * European-pattern lamp that cut is horizontal on the traffic side and kicks
 * up about 15° on the kerb side, so the lamp lights the verge and the signs
 * without lighting the oncoming driver's eyes. That asymmetric flat top is the
 * single most recognisable thing about a real headlamp on a road, and it is
 * what the map below encodes.
 *
 * ## Frame
 *
 * three builds a spotlight's map matrix with `lookAt(position, target, +Y)`,
 * so the map's +x axis is `cross(up, back)` = world **−X** when the lamp faces
 * the car's +Z. So in this texture **u = 0 is the car's right**, which on a
 * left-hand-drive US car is the kerb side, and **v = 0 is down**.
 *
 * Values are consumed raw — `lights_fragment_begin` multiplies the sampled rgb
 * straight into the light colour with no colour-space decode — so the data is
 * written linear.
 */

import * as THREE from 'three';

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

export interface BeamCookieOpts {
  /** Cone half-angle of the spotlight this map is projected through. */
  halfAngle: number;
  /** Cutoff height above the beam axis, radians. */
  cutoffAbove: number;
  /** Kerb-side kick-up angle. 15° is the ECE figure. */
  kickDeg?: number;
  /** Horizontal span the kick-up covers before it flattens off, radians. */
  kickSpan?: number;
  /** Hot spot offset from the axis, radians. +x is towards the kerb. */
  hotX?: number;
  hotY?: number;
  /** Hot spot size, radians. */
  hotW?: number;
  hotH?: number;
  /** Fraction of peak that leaks above the cutoff. Real lamps are not black. */
  stray?: number;
  size?: number;
}

/**
 * Low beam: flat top with the kerb-side kick, a hot band just under the cut,
 * and a wide dim foreground wash.
 */
export function lowBeamCookie(o: BeamCookieOpts): THREE.DataTexture {
  const size = o.size ?? 384;
  const tanA = Math.tan(o.halfAngle);
  const cutTan = Math.tan(o.cutoffAbove);
  const kick = Math.tan(((o.kickDeg ?? 15) * Math.PI) / 180);
  // Held to 0.22 rad so the kerb-side cut tops out ~3.4° above the flat one
  // and still falls on the road, rather than climbing above the horizon and
  // lighting the tree line.
  const kickSpan = Math.tan(o.kickSpan ?? 0.22);
  const hx = o.hotX ?? 0;
  const hy = o.hotY ?? 0;
  const hw = Math.tan(o.hotW ?? 0.10);
  const hh = Math.tan(o.hotH ?? 0.045);
  const stray = o.stray ?? 0.035;

  const lum = new Float32Array(size * size);
  let peak = 0;

  for (let j = 0; j < size; j++) {
    // v = 0 is down. Tangent of the angle above the beam axis.
    const ty = (((j + 0.5) / size) * 2 - 1) * tanA;
    for (let i = 0; i < size; i++) {
      // u = 0 is the car's right; +tx therefore points at the kerb.
      const tx = (0.5 - (i + 0.5) / size) * 2 * tanA;

      const cut = cutTan + Math.min(Math.max(tx, 0), kickSpan) * kick;
      const above = ty - cut;
      // ~0.55° of roll-off: sharp enough to read as a cutoff, soft enough not
      // to alias into a staircase where the kick-up crosses the pixel grid.
      const below = 1 - smoothstep(-0.003, 0.0072, above);

      const hot = Math.exp(-(((tx - Math.tan(hx)) / hw) ** 2 + ((ty - Math.tan(hy)) / hh) ** 2));
      const broad = Math.exp(-((tx / (tanA * 0.62)) ** 2 + ((ty - Math.tan(hy) * 1.8) / (tanA * 0.48)) ** 2));
      // Everything close to the car: wide, dim, and low in the field.
      const wash = Math.exp(-((tx / (tanA * 1.05)) ** 2)) * smoothstep(0, -tanA * 0.55, ty);

      // Scalloping from the lens flutes. Faint, but a perfectly smooth pool is
      // the tell that there is no optic in front of the filament.
      const flute = 1 + 0.05 * Math.cos((tx / tanA) * 21) + 0.03 * Math.cos((tx / tanA) * 47 + 1.1);

      let value = (1.0 * hot + 0.34 * broad + 0.44 * wash) * flute;
      value = value * below + stray * Math.exp(-Math.max(above, 0) * 11) * (1 - below);

      // Kill the cone's own circular edge so the spot never shows a rim.
      const r = Math.hypot(tx, ty) / tanA;
      value *= 1 - smoothstep(0.78, 1.0, r);

      lum[j * size + i] = value;
      if (value > peak) peak = value;
    }
  }

  return pack(lum, size, peak);
}

/** High beam: no cutoff, the hot spot lifted onto the horizon and tightened. */
export function highBeamCookie(opts: { halfAngle: number; size?: number }): THREE.DataTexture {
  const size = opts.size ?? 256;
  const tanA = Math.tan(opts.halfAngle);
  const lum = new Float32Array(size * size);
  let peak = 0;
  for (let j = 0; j < size; j++) {
    const ty = (((j + 0.5) / size) * 2 - 1) * tanA;
    for (let i = 0; i < size; i++) {
      const tx = (0.5 - (i + 0.5) / size) * 2 * tanA;
      const hot = Math.exp(-((tx / (tanA * 0.30)) ** 2 + ((ty - tanA * 0.16) / (tanA * 0.21)) ** 2));
      const broad = Math.exp(-((tx / (tanA * 0.78)) ** 2 + ((ty - tanA * 0.05) / (tanA * 0.55)) ** 2));
      let value = 1.0 * hot + 0.4 * broad;
      const r = Math.hypot(tx, ty) / tanA;
      value *= 1 - smoothstep(0.74, 1.0, r);
      lum[j * size + i] = value;
      if (value > peak) peak = value;
    }
  }
  return pack(lum, size, peak);
}

/**
 * Half-float rather than byte or full float: eight bits bands visibly in the
 * long gradient under the cutoff, and linear filtering of a *full* float
 * texture needs `OES_texture_float_linear`, which is an optional extension
 * even on WebGL2. Half-float filtering is core.
 */
function pack(lum: Float32Array, size: number, peak: number): THREE.DataTexture {
  const k = peak > 0 ? 1 / peak : 1;
  const data = new Uint16Array(size * size * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  for (let i = 0; i < lum.length; i++) {
    const v = THREE.DataUtils.toHalfFloat(lum[i] * k);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = one;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

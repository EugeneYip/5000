/**
 * Lighting presets.
 *
 * Every number here is a *look* decision, kept out of the machinery so the
 * five environments can be compared side by side. Colours are written as sRGB
 * hex because that is how a human reads them; three converts them to the
 * linear working space on the way in.
 *
 * `goldenhour` is the hero: it reproduces the reference photograph — a low
 * warm sun from camera-left, a deep blue sky overhead, warm bounce off the
 * Parkway asphalt and dappled shade from the street trees.
 */

export interface SkyParams {
  /** Straight up. */
  zenith: number;
  /** The band just above the horizon, away from the sun. */
  horizon: number;
  /** What the sky sphere shows below the horizon line. */
  ground: number;
  /** Sun disc and forward-scatter tint. */
  sun: number;
  /** HDR value of the sun disc itself — this is what glints off the clearcoat. */
  sunIntensity: number;
  /** Apparent radius of the disc, radians. The real sun is 0.00465. */
  sunAngularRadius: number;
  /** Strength/tightness of the aureole around the sun. */
  mieStrength: number;
  miePower: number;
  /** How fast the sky darkens from horizon to zenith. */
  gradientPower: number;
  /** Haze hugging the horizon line. */
  haze: number;
  hazeColor: number;
  hazeHeight: number;
  /**
   * Sky radiance relative to the sun. This is the single most important number
   * in the file: hex colours read as "a nice blue" but convert to linear far
   * more saturated and far brighter than a real sky is relative to direct sun,
   * and an over-bright sky is why so many outdoor renders come out magenta —
   * the orange sun fills R, the blue sky fills B, and nothing fills G.
   */
  exposure: number;
}

export interface LampSpec {
  positions: ReadonlyArray<readonly [number, number, number]>;
  color: number;
  /** Candela-ish; three's point lights are physically scaled. */
  intensity: number;
  distance: number;
}

/** Grading hints the post chain reads. Each preset wants a different finish. */
export interface GradeParams {
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  aoIntensity: number;
  aoRadius: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  chromatic: number;
  /** Cool the shadows / warm the highlights, or the reverse. */
  shadowTint: number;
  highlightTint: number;
  splitStrength: number;
}

export interface EnvPreset {
  readonly name: string;
  /** Unit vector pointing *towards* the sun. */
  readonly sunDir: readonly [number, number, number];
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly sunShadow: boolean;
  /** VSM softness — a low sun through a big atmosphere is not a point source. */
  readonly sunShadowRadius: number;
  readonly sky: SkyParams;
  /** Insurance ambient for anything the IBL under-serves. Kept small. */
  readonly hemi: { sky: number; ground: number; intensity: number };
  /** Light kicked back up off the road surface. */
  readonly bounce: { color: number; intensity: number; dir: readonly [number, number, number] };
  /** Optional back/rim light to separate the roof from the sky. */
  readonly rim?: { color: number; intensity: number; dir: readonly [number, number, number] };
  /** Colour is derived from the sky so the horizon never shows a seam. */
  readonly fog: { density: number } | null;
  readonly ground: 'asphalt' | 'studio';
  /** Multiplies the asphalt albedo. */
  readonly groundTint: number;
  /** 0 = bone dry, 1 = standing water. Drives roughness and albedo darkening. */
  readonly wetness: number;
  /** Strength of the tree-shade gobo projected onto the road. */
  readonly dapple: number;
  /** What colour shaded road is — sky-lit, so usually cooler than the sun. */
  readonly shadeTint: number;
  /**
   * How much of the baked proxy world actually reaches a material.
   *
   * Not a look knob and not an exposure: it is the factor by which the proxy
   * world under-counts the real one, and it was measured rather than picked.
   * `paint.ts` builds the body at `metalness: 1.0`, so a body panel has no
   * diffuse lobe and the hemisphere, bounce and rim lights contribute nothing
   * to it — taking `hemi.intensity` from 0.12 to 0.75 moves a shaded flank by
   * zero levels. Every panel not in direct sun is showing this map and only
   * this map, and zeroing the map's terms one at a time says the flank is
   * mirroring the *ground*: without the proxy road it falls 56 → 30, without
   * the furniture only to 48, and no change to the sky band moves it at all.
   *
   * What the 140 m disc and forty-two leaf blobs leave out of that band is
   * most of a boulevard — the far carriageway and its traffic, parked cars
   * (vertical, specular, at exactly flank height), the pavement crowds, the
   * lamp standards with their flags, the sunlit grass past the trees. All of
   * it stands in the reflection and none of it is modelled.
   */
  readonly envIntensity: number;
  /** Darkness of the rendered contact-occlusion pool under the car. */
  readonly contactStrength: number;
  readonly lamps?: LampSpec;
  /** Studio only: the softbox strips that make the flank highlights. */
  readonly studio?: boolean;
  readonly background: number;
  readonly grade: GradeParams;
}

const BASE_GRADE: GradeParams = {
  exposure: 1.0,
  bloomStrength: 0.22,
  bloomThreshold: 1.15,
  bloomRadius: 0.5,
  aoIntensity: 0.62,
  aoRadius: 0.18,
  contrast: 0.13,
  saturation: 1.04,
  vignette: 0.26,
  grain: 0.016,
  chromatic: 2.2,
  shadowTint: 0x2e3a52,
  highlightTint: 0xfff2dc,
  splitStrength: 0.055,
};

/**
 * Camera-left in both the hero `front3q` pose and the `photomatch` pose works
 * out to roughly −X with a little +Z, so one sun azimuth serves both. 11.5°
 * of elevation is late enough to stretch the shadows without losing all form
 * on the flanks.
 */
const GOLDEN_SUN = [-0.797, 0.199, 0.561] as const;

export const PRESETS: Record<string, EnvPreset> = {
  goldenhour: {
    name: 'goldenhour',
    sunDir: GOLDEN_SUN,
    sunColor: 0xffdec0,
    // 5.6, down from 6.0. The sun is the one source in the rig whose level was
    // already right — the road, the plate and the bumper all landed within a
    // few per cent of the white-balanced photograph — so this is a trim, not a
    // rebalance. Cutting the key further to chase a key-to-fill number takes
    // the road down with it, and the road is the fill.
    sunIntensity: 5.6,
    sunShadow: true,
    sunShadowRadius: 2.2,
    sky: {
      zenith: 0x5c8ac8,
      // Pulled a little bluer. This colour is doing two jobs: it is the sky
      // the horizon washes out to, and — through the IBL road's grazing
      // Fresnel — it is what the lower half of every vertical panel's
      // reflection is made of. A grey-green horizon put a grey-green cast on
      // the flanks that no amount of extra light was going to remove.
      horizon: 0xaec6dc,
      ground: 0x6b5c4c,
      sun: 0xffb066,
      sunIntensity: 120,
      sunAngularRadius: 0.019,
      mieStrength: 0.85,
      miePower: 13,
      gradientPower: 3.0,
      haze: 0.26,
      hazeColor: 0xf2d2ac,
      hazeHeight: 0.034,
      // Was 0.5, which put the sky's irradiance at 0.7× the direct sun's on a
      // horizontal surface. Measured golden hour under a hazy summer sky —
      // which is what the photograph shows — runs 0.8 to 1.3, and this is the
      // energy the flanks are actually standing in: a vertical panel sees
      // almost no sun and almost nothing but sky and what the sky lights.
      // Underrating it by half is why they were reading two stops dark.
      //
      // 1.10 now, still inside the 0.8–1.3 measured above and at the hazy end
      // of it because the photograph is hazy. It cannot go much past this: the
      // dome is the background as well as the source, and at 1.9 the sky is at
      // 224 and at 2.8 it is clipped. Anyone who tries to fix the flanks from
      // here will wash the frame out before the flanks arrive — measured, the
      // sky reaches 250 while a shaded flank is still only at 112.
      exposure: 1.1,
    },
    // Inert on the body, which is `metalness: 1.0` and has no diffuse lobe at
    // all. This is doing its job on the interior, the tyres and the trim, and
    // nothing whatever on the paint — do not reach for it to lift the flanks.
    hemi: { sky: 0x93b8e8, ground: 0x6d5a45, intensity: 0.18 },
    // `dir` is the direction the light *travels*, and this vector used to have
    // a negative y: the "light kicked back up off the road" was shining down,
    // which made it a second uncredited key from above and left, and left the
    // sills and arch liners with nothing. Pointed up, where a bounce belongs.
    bounce: { color: 0xd4a173, intensity: 0.7, dir: [0.3, 0.55, 0.62] },
    rim: { color: 0xbad4f0, intensity: 0.28, dir: [0.62, 0.42, -0.66] },
    fog: { density: 0.0038 },
    ground: 'asphalt',
    groundTint: 0xf6f2ec,
    wetness: 0.06,
    dapple: 0.62,
    shadeTint: 0x5d7196,
    envIntensity: 2.8,
    contactStrength: 0.62,
    background: 0x8fb4d8,
    grade: { ...BASE_GRADE },
  },

  studio: {
    name: 'studio',
    sunDir: [-0.42, 0.82, 0.39],
    sunColor: 0xffffff,
    sunIntensity: 1.15,
    sunShadow: true,
    sunShadowRadius: 3.4,
    sky: {
      // A cyclorama, not a sky: near-black overhead lifting to a soft grey
      // behind the subject, which is what a sheet of paper lit from the sides
      // actually looks like.
      zenith: 0x060709,
      horizon: 0x23262c,
      ground: 0x0a0b0d,
      sun: 0xffffff,
      sunIntensity: 0,
      sunAngularRadius: 0.02,
      mieStrength: 0,
      miePower: 8,
      gradientPower: 2.4,
      haze: 0,
      hazeColor: 0x000000,
      hazeHeight: 0.1,
      exposure: 1.0,
    },
    hemi: { sky: 0x30343c, ground: 0x08090b, intensity: 0.25 },
    bounce: { color: 0x9aa0aa, intensity: 0.18, dir: [0.4, -0.7, 0.58] },
    rim: { color: 0xdfe6f2, intensity: 0.5, dir: [0.1, 0.34, -0.94] },
    fog: null,
    ground: 'studio',
    groundTint: 0xffffff,
    wetness: 0,
    dapple: 0,
    shadeTint: 0x202429,
    envIntensity: 1.0,
    contactStrength: 0.72,
    studio: true,
    background: 0x0b0c0e,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.3,
      bloomThreshold: 1.0,
      contrast: 0.09,
      saturation: 1.0,
      vignette: 0.34,
      grain: 0.01,
      chromatic: 1.4,
      splitStrength: 0.02,
      aoIntensity: 0.55,
    },
  },

  overcast: {
    name: 'overcast',
    sunDir: [-0.28, 0.93, 0.24],
    sunColor: 0xdfe6ee,
    sunIntensity: 0.65,
    sunShadow: true,
    sunShadowRadius: 8,
    sky: {
      zenith: 0xa9b3bd,
      horizon: 0xd2d7dc,
      ground: 0x767c82,
      sun: 0xe8edf2,
      sunIntensity: 1.4,
      sunAngularRadius: 0.12,
      mieStrength: 0.5,
      miePower: 3,
      gradientPower: 0.85,
      haze: 0.7,
      hazeColor: 0xd7dbe0,
      hazeHeight: 0.16,
      exposure: 0.85,
    },
    hemi: { sky: 0xc7ced6, ground: 0x5e6165, intensity: 0.35 },
    bounce: { color: 0x8e9398, intensity: 0.22, dir: [0.2, -0.8, 0.55] },
    fog: { density: 0.011 },
    ground: 'asphalt',
    groundTint: 0xdfe3e8,
    wetness: 0.72,
    dapple: 0,
    shadeTint: 0x6e767e,
    envIntensity: 1.05,
    contactStrength: 0.78,
    background: 0xc9cfd5,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.1,
      bloomThreshold: 1.6,
      contrast: 0.17,
      saturation: 0.95,
      vignette: 0.2,
      grain: 0.018,
      splitStrength: 0.02,
      aoIntensity: 0.72,
    },
  },

  dusk: {
    name: 'dusk',
    // Sun below the horizon: nothing direct left, only the afterglow.
    sunDir: [-0.86, -0.05, 0.5],
    sunColor: 0x6d86b8,
    sunIntensity: 0.22,
    sunShadow: false,
    sunShadowRadius: 6,
    sky: {
      zenith: 0x0d1a33,
      horizon: 0x3a3752,
      ground: 0x11151e,
      sun: 0xc06a3a,
      sunIntensity: 3.0,
      sunAngularRadius: 0.05,
      mieStrength: 1.1,
      miePower: 5,
      gradientPower: 1.7,
      haze: 0.55,
      hazeColor: 0x8a4f3c,
      hazeHeight: 0.07,
      exposure: 0.34,
    },
    hemi: { sky: 0x2b4470, ground: 0x171410, intensity: 0.28 },
    bounce: { color: 0x6b5236, intensity: 0.14, dir: [0.3, -0.75, 0.6] },
    rim: { color: 0x9fb6e0, intensity: 0.22, dir: [0.5, 0.3, -0.81] },
    fog: { density: 0.018 },
    ground: 'asphalt',
    groundTint: 0xe4e7ec,
    wetness: 0.45,
    dapple: 0.18,
    shadeTint: 0x22304d,
    envIntensity: 0.9,
    contactStrength: 0.5,
    lamps: {
      positions: [
        [5.4, 5.3, 7.5],
        [5.4, 5.3, -6.5],
        [-6.2, 5.3, 1.0],
        [-6.2, 5.3, -14.0],
      ],
      color: 0xffb066,
      intensity: 130,
      distance: 34,
    },
    background: 0x1b2743,
    grade: {
      ...BASE_GRADE,
      exposure: 1.12,
      bloomStrength: 0.44,
      bloomThreshold: 0.82,
      bloomRadius: 0.62,
      contrast: 0.1,
      saturation: 1.08,
      vignette: 0.4,
      grain: 0.026,
      chromatic: 3.2,
      shadowTint: 0x1a2a52,
      highlightTint: 0xffd9a8,
      splitStrength: 0.11,
      aoIntensity: 0.55,
    },
  },

  noon: {
    name: 'noon',
    sunDir: [-0.26, 0.94, 0.22],
    sunColor: 0xfff4e2,
    sunIntensity: 5.4,
    sunShadow: true,
    sunShadowRadius: 1.1,
    sky: {
      zenith: 0x5e92d8,
      horizon: 0xc3d8ec,
      ground: 0x8d8a82,
      sun: 0xfff6e8,
      sunIntensity: 190,
      sunAngularRadius: 0.0095,
      mieStrength: 0.7,
      miePower: 22,
      gradientPower: 2.2,
      haze: 0.22,
      hazeColor: 0xdfeaf5,
      hazeHeight: 0.1,
      exposure: 0.5,
    },
    hemi: { sky: 0x9fc4ec, ground: 0x7a7468, intensity: 0.25 },
    bounce: { color: 0xc9c2b2, intensity: 0.32, dir: [0.15, -0.9, 0.4] },
    fog: { density: 0.0022 },
    ground: 'asphalt',
    groundTint: 0xfffaf0,
    wetness: 0.02,
    dapple: 0.3,
    shadeTint: 0x4d6a94,
    envIntensity: 1.0,
    contactStrength: 0.8,
    background: 0x77a6da,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.2,
      bloomThreshold: 1.5,
      contrast: 0.16,
      saturation: 1.02,
      vignette: 0.22,
      grain: 0.012,
      aoIntensity: 0.6,
    },
  },
};

export const DEFAULT_PRESET = 'goldenhour';

export function resolvePreset(name: string): EnvPreset {
  return PRESETS[name] ?? PRESETS[DEFAULT_PRESET];
}

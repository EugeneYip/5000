/**
 * ============================================================================
 *  AUDI 5000 S WAGON  ·  C3 / Type 44  ·  MASTER SPECIFICATION
 * ============================================================================
 *
 *  SINGLE SOURCE OF TRUTH. Every module imports from here. Never hard-code a
 *  dimension, a colour or a ratio anywhere else in the codebase.
 *
 *  Units: metres, kilograms, radians, seconds — unless a field name says
 *  otherwise (`*Mm`, `*Deg`, `*Rpm`, `*Kw`).
 *
 *  Coordinate frame (right-handed, matches Three.js):
 *      +X = vehicle RIGHT (passenger side in a LHD car)
 *      +Y = UP
 *      +Z = vehicle FORWARD (towards the nose)
 *  Origin sits on the ground plane, on the centreline, at the front-axle
 *  centre. So the rear axle is at z = -WHEELBASE.
 *
 *  Reference photograph: a period snapshot of the actual car this model
 *  reproduces — Philadelphia, Benjamin Franklin Parkway, golden hour.
 *  Paint and plate below were sampled from that photograph directly
 *  (see docs/REFERENCE-PHOTO.md for the colour-science derivation).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// 1. BODY / PACKAGE DIMENSIONS
// ---------------------------------------------------------------------------

export const BODY = {
  /** Overall length. US wagon: the 5 mph impact bumpers add ~102 mm over Euro. */
  length: 4.895,
  /** Overall width, excluding mirrors. */
  width: 1.814,
  /** Width across the mirrors, both extended. */
  widthOverMirrors: 2.01,
  /** Roof height at the highest point of the roof skin, unladen. */
  height: 1.415,
  /** Top of the roof rails — they stand ~50 mm proud of the skin. */
  heightOverRails: 1.468,

  wheelbase: 2.687,
  /** Factory brochure gives the same track front and rear. */
  trackFront: 1.468,
  trackRear: 1.468,

  /**
   * Overhangs are not published. Measured off the 1986 100 Avant orthographic
   * elevation (Euro 1033/1078 mm, validated to 0.15 % against the published
   * wheelbase), then +51 mm each end for the US impact bumpers.
   */
  overhangFront: 1.084,
  overhangRear: 1.129,

  groundClearance: 0.135,

  /** Kerb weight, US 5000 S Wagon. */
  massKerb: 1340,
  /**
   * Static front axle weight fraction. NOT a sourced figure — no period test
   * or factory split was found. 0.60 is the figure commonly quoted for Audi's
   * longitudinal-FWD layout, which hangs the inline-5 ahead of the axle.
   */
  weightDistFront: 0.6,

  /**
   * The wagon's figure, from the factory brochure. The famous Cd 0.30 belongs
   * to the EURO SALOON and does not apply to this car — using it would be
   * wrong both aerodynamically and historically.
   */
  dragCoefficient: 0.34,
  /** Not published; computed from the modelled body. */
  frontalArea: 2.1,

  /** Beltline height above ground — top of the door skin / base of the DLO. */
  beltlineHeight: 0.985,
  /** Rocker (sill) underside height. */
  rockerHeight: 0.235,
  /** Body sides are not slab-sided: half-width at the beltline vs at the sill. */
  tumblehomeTop: 0.855,
  tumblehomeSill: 0.79,
} as const;

// ---------------------------------------------------------------------------
// 2. WHEELS & TYRES
// ---------------------------------------------------------------------------

export const WHEEL = {
  /**
   * 6J x 14 light alloy with 185/70 HR14, the factory fitment for the 5000 S
   * saloon and wagon. The 15-inch wheel belongs to the CS Turbo, not this car.
   * Rolling diameter 614.6 mm.
   */
  rimDiameterIn: 14,
  rimWidthIn: 6,
  tyreSectionMm: 185,
  tyreAspect: 70,

  /** Derived at module load — see `tyreRadius()` below. */
  get radius(): number {
    return (this.rimDiameterIn * 0.0254) / 2 + (this.tyreSectionMm / 1000) * (this.tyreAspect / 100);
  },
  get width(): number {
    return this.tyreSectionMm / 1000;
  },
  /**
   * FOUR bolts on a 108 mm circle, ET 45. Five-bolt 5x112 is the quattro
   * only — getting this wrong is immediately visible.
   */
  boltCount: 4,
  boltCircleMm: 108,
  offsetMm: 45,
  /** The "bottlecap" alloy: 12 slots at 30 degrees. */
  bottlecapSlots: 12,

  /** Unsprung mass per corner: wheel + tyre + hub + brake. */
  massUnsprung: 38,

  /** Static camber, degrees. Negative = top leans in. */
  camberFrontDeg: -0.5,
  camberRearDeg: -1.2,
  /** Static toe per wheel, degrees. Positive = toe-in. */
  toeFrontDeg: 0.08,
  toeRearDeg: 0.15,
} as const;

// ---------------------------------------------------------------------------
// 3. SUSPENSION
// ---------------------------------------------------------------------------

export const SUSPENSION = {
  front: {
    /** MacPherson strut. */
    type: 'macpherson' as const,
    /** Spring rate at the wheel, N/m. */
    springRate: 26_500,
    /** Damping, N·s/m — bump is softer than rebound, as on a real damper. */
    damperBump: 2_100,
    damperRebound: 3_400,
    /** Total suspension travel. */
    travelUp: 0.09,
    travelDown: 0.08,
    /**
     * Anti-roll bar rate, N·m/rad. Sources conflict on the bar itself:
     * parts catalogues say 23 mm for the base C3 and call 26 mm the
     * Sport/200/V8 bar, while Audi of America's MY1988 sheet says 26 mm for
     * the 5000 S. Unresolved; this rate assumes the smaller bar.
     */
    arbRate: 14_000,
    /** Suspension geometry that the raycast model needs. */
    antiDive: 0.25,
    rollCentreHeight: 0.05,
  },
  rear: {
    /** Torsion-beam / trailing arm on FWD, independent on quattro. */
    type: 'trailing-beam' as const,
    springRate: 23_000,
    damperBump: 1_800,
    damperRebound: 2_900,
    travelUp: 0.095,
    travelDown: 0.085,
    /**
     * No separate rear anti-roll bar exists — the torsion-crank beam IS the
     * rear roll stiffness. This figure stands in for the beam's torsional
     * rate rather than a bar.
     */
    arbRate: 9_000,
    antiSquat: 0.15,
    rollCentreHeight: 0.11,
  },
  /** Ride height measured at the wheel centre, unladen. */
  rideHeightFront: 0.335,
  rideHeightRear: 0.342,
} as const;

// ---------------------------------------------------------------------------
// 4. POWERTRAIN — the iconic longitudinal inline-5
// ---------------------------------------------------------------------------

export const ENGINE = {
  name: 'NF 2.3 litre SOHC inline-5',
  cylinders: 5,
  displacementL: 2.309,
  /** Firing order — the source of the 5-cylinder's offbeat warble. */
  firingOrder: [1, 2, 4, 5, 3],
  /** 720° / 5 = 144° between firings. Half-order content is what you hear. */
  firingIntervalDeg: 144,

  idleRpm: 820,
  /** Red band starts here, measured off a MY1988 cluster photograph. */
  redlineRpm: 6_500,
  /** Low confidence — a single forum source. */
  limiterRpm: 6_800,

  /** 130 hp SAE net. Bore 82.5 x stroke 86.4, CR 10.0:1, Bosch CIS-E. */
  peakPowerKw: 96.9,
  peakPowerRpm: 5_600,
  peakTorqueNm: 190,
  peakTorqueRpm: 4_000,

  /**
   * Normalised torque curve — [rpm, fraction of peak torque].
   *
   * Only two points are sourced: 190 N·m at 4000 rpm (factory brochure) and
   * 165.3 N·m at 5600 rpm, which falls out exactly from T = P/w at the stated
   * power peak — that is 0.87 here. Everything between is modelled
   * interpolation, not factory data. Gentle, flat and mid-range-rich, as a
   * Bosch CIS-E 10-valve five should be.
   */
  torqueCurve: [
    [800, 0.52],
    [1200, 0.68],
    [1600, 0.78],
    [2000, 0.85],
    [2500, 0.91],
    [3000, 0.95],
    [3500, 0.985],
    [4000, 1.0],
    [4500, 0.985],
    [5000, 0.95],
    [5500, 0.89],
    [6000, 0.79],
    [6300, 0.71],
    [6500, 0.64],
    [6800, 0.34],
  ] as ReadonlyArray<readonly [number, number]>,

  /** Rotational inertia of the crank + flywheel, kg·m². */
  inertia: 0.24,
  /** Engine braking coefficient, N·m per rad/s. */
  frictionCoeff: 0.032,
  frictionConstant: 14,
} as const;

export const TRANSMISSION = {
  type: 'manual-5' as const,
  /**
   * Audi 016 gearbox, ratio code AAZ (NF engine to 12/1987). Read off the
   * factory brochure's Front-Wheel Drive (Sedan and Wagon) column.
   *
   * The earlier placeholders here — 1.36 / 0.967 / 0.744 — were the 5000CS
   * TURBO's ratios, read across the wrong column. On those the car sits at
   * ~2500 rpm at 100 km/h and can never reach its claimed top speed; on these
   * it sits at ~2880 rpm and tops out just past the power peak, which is how
   * the ratios were cross-validated.
   */
  gearRatios: [3.6, 2.125, 1.458, 1.071, 0.857],
  reverseRatio: 3.5,
  finalDrive: 3.889,
  /** Overall driveline efficiency. */
  efficiency: 0.9,
  /** Clutch torque capacity, N·m. */
  clutchTorqueCapacity: 320,
  shiftTimeUp: 0.42,
  shiftTimeDown: 0.35,
  /**
   * The three-speed automatic, VAG type 087. Genuine fluid coupling with no
   * lock-up clutch — a 1983-88 087 has none — which is why it creeps away at
   * idle, is 1.6 s slower to 60 and gives up 2.7 mph at the top end while
   * still slipping 3-4 %.
   */
  automatic: {
    gearRatios: [2.71, 1.5, 1.0],
    reverseRatio: 2.43,
    finalDrive: 3.25,
  },

  /** FWD on the 5000 S; the quattro was a separate model. */
  driveType: 'fwd' as const,
  /** If driveType were 'awd', fraction of torque to the front axle. */
  torqueSplitFront: 0.5,
} as const;

export const STEERING = {
  /** Rack and pinion, power-assisted. Ratio 18.7:1. */
  maxSteerAngleDeg: 36,
  steeringRatio: 18.7,
  turnsLockToLock: 3.5,
  turningCircle: 10.42,
  /** Caster, gives self-centring. */
  casterDeg: 2.0,
  /** Ackermann fraction: 1 = perfect Ackermann. */
  ackermann: 0.82,
} as const;

export const BRAKES = {
  /**
   * 256 x 22 vented front, 245 x 10 solid rear. The 276 mm disc previously
   * here is the CS Turbo's. A 256 disc also shows a lot more gap inside a
   * 14-inch wheel, so this is visible, not just a number.
   */
  discDiameterFront: 0.256,
  discDiameterRear: 0.245,
  /** Max brake torque per axle, N·m. */
  maxTorqueFront: 2_400,
  maxTorqueRear: 1_150,
  /** Front bias. */
  bias: 0.66,
  handbrakeTorque: 1_600,
} as const;

export const TYRE_MODEL = {
  /**
   * Pacejka magic-formula coefficients.
   *
   * `E` controls the shape past the peak and must be negative for a road
   * tyre — a positive E makes force keep climbing past the slip angle where a
   * real tyre has already started to give up. These were positive and
   * `tyre.ts` had to clamp them to keep the curves peaking at sane slip;
   * with the correct signs those clamps go inert.
   */
  longitudinal: { B: 11.0, C: 1.62, D: 1.05, E: -0.5 },
  /** Lateral — a period 185/70 HR14: tall sidewall, modest grip, lots of squirm. */
  lateral: { B: 9.2, C: 1.4, D: 0.98, E: -1.6 },
  /** Load sensitivity: grip falls off as vertical load rises. */
  loadSensitivity: 0.00008,
  rollingResistance: 0.014,
  /** Relaxation length — tyre force lags slip, m. */
  relaxationLength: 0.42,
} as const;

/**
 * Factory performance claims for the WAGON specifically — the brochure quotes
 * it separately from the saloon, which almost no other source does. These are
 * manufacturer figures, not instrumented tests.
 *
 * The one independent measurement found is Car and Driver's 1987 5000 S
 * quattro saloon: 9.70 s to 60 and 17.00 s at 81.0 mph — same engine and
 * ratios, about 350 lb heavier. So a real FWD wagon should land around
 * 9.7-10.5 s, and the simulation is right if it does.
 *
 * No skidpad or braking figure exists for any C3. The lateral target below is
 * an estimate for a soft, nose-heavy estate on period 185/70 HR rubber.
 */
export const PERFORMANCE = {
  zeroToSixtyManual: 9.9,
  zeroToSixtyAuto: 11.7,
  zeroToFiftyManual: 7.3,
  topSpeedMph: 124,
  topSpeedKmh: 200,
  /** Estimate, not a measurement. */
  skidpadGEstimate: 0.72,
  /** Sanity check: 200 km/h needs ~83 kW at the wheels and the engine gives
   *  ~86 kW at the rpm this gearing puts it at, so the claim is honest. */
  rpmAt100Kmh: 2880,
} as const;

// ---------------------------------------------------------------------------
// 5. PAINT & COLOUR
// ---------------------------------------------------------------------------
//
// Derived from the reference photograph by white-balancing against the
// licence plate (a known neutral) and then sampling the vertical front-fender
// faces, which reflect the surroundings rather than mirroring the sky.
//
//   plate as photographed  → rgb(249, 233, 220)   (warm 1980s film cast)
//   white-balance gains    → (0.948, 1.013, 1.073)
//   fender, balanced       → #90919a … #92939b   (saturation 0.096 — near-neutral)
//   hood, balanced         → #7690ad             (saturation 0.31 — that is SKY,
//                                                 mirrored in a horizontal panel,
//                                                 not the paint)
//
// Conclusion: a mid-dark neutral graphite metallic with a faint cool
// undertone. Audi called this family Graphit/Titan Grau Metallic.
// ---------------------------------------------------------------------------

export const PAINT = {
  name: 'Graphite Metallic',
  code: 'LY7L',
  /** Base coat, sRGB hex. The flake and clearcoat lift this considerably. */
  baseColor: 0x6b6f76,
  /** Metallic flake tint — slightly brighter and cooler than the base. */
  flakeColor: 0xaeb4bd,
  /** Flake density (per m²-ish) and size, consumed by the paint shader. */
  flakeDensity: 640.0,
  flakeSize: 0.55,
  /** How strongly flakes brighten at grazing angles. */
  flakeIntensity: 0.34,

  metalness: 0.86,
  roughness: 0.29,
  clearcoat: 1.0,
  clearcoatRoughness: 0.035,
  /** Clearcoat IOR — modern automotive 2K clear. */
  clearcoatIor: 1.48,

  /** Faint orange-peel in the clearcoat. Real paint is never perfectly flat. */
  orangePeelScale: 220.0,
  orangePeelStrength: 0.012,
} as const;

export const TRIM_COLORS = {
  /** Bumpers, lower cladding, mirror shells — textured grey-black plastic. */
  bumperPlastic: 0x2b2d31,
  /** Window surrounds, B-pillar, wiper arms — satin black. */
  blackTrim: 0x17181a,
  /** Grille slats. */
  grille: 0x1b1d21,
  /** Brightwork: the rings, the window reveal. */
  chrome: 0xd8dade,
  /** Roof rails on the Avant — anodised dark. */
  roofRail: 0x33363a,
  /** Tyre sidewall. */
  rubber: 0x141416,
  /** Glass tint. */
  glassTint: 0x1b2026,
  /** Interior: period Audi grey-anthracite. */
  interiorPlastic: 0x33353a,
  interiorFabric: 0x4a4d54,
  carpet: 0x2d3034,
} as const;

// ---------------------------------------------------------------------------
// 6. LICENCE PLATE — reproduced from the photograph
// ---------------------------------------------------------------------------
//
// White plate, dark-navy characters, thin inset border, four corner bolt
// holes, and a small keystone separating the groups — a Pennsylvania issue
// of the period, photographed in Philadelphia.
// ---------------------------------------------------------------------------

export const PLATE = {
  text: 'A2M 909',
  left: 'A2M',
  right: '909',
  /** Pennsylvania uses a keystone as the group separator. */
  separator: 'keystone' as const,
  state: 'PENNSYLVANIA',
  /** US standard plate, metres. */
  widthM: 0.305,
  heightM: 0.152,
  cornerRadius: 0.012,
  /** Plate face and characters, as they read after white balance. */
  faceColor: 0xf2f0ea,
  textColor: 0x1d2a4a,
  borderColor: 0x1d2a4a,
  boltHoleColor: 0x3a3226,
} as const;

// ---------------------------------------------------------------------------
// 7. LIGHTING SIGNATURE
// ---------------------------------------------------------------------------

export const LIGHTS = {
  headlampColor: 0xfff2d0,
  /** 1980s sealed-beam halogen: warm, and not very bright by modern standards. */
  headlampIntensityLow: 42,
  headlampIntensityHigh: 90,
  headlampTempK: 3200,
  /**
   * The amber dye, chosen by clipping count rather than by eye.
   *
   * 0xff8a12 is R/G 1.85 and **the lens charges for it twice** — the dye tints
   * the transmitted path and the Fresnel front-surface return separately — so
   * the displayed saturation ran well past the photograph's. Measured on the
   * right indicator at `photomatch`, row 453, x 1072-1126 (located by hue,
   * `R>140 & R-B>60 & R-G>25`):
   *
   *     0xff8a12   R/G 1.82   R clipped in 15 of 55 columns   V peak 255
   *     0xf5a428   R/G 1.55   R clipped in  3 of 55           V peak 255
   *     0xeeb040   R/G 1.41   R clipped in  0 of 55           V peak 247
   *
   * The photograph clips **1-2 columns** and holds a 255 peak. So 0xf5a428:
   * 0xeeb040 reaches the right saturation and loses the specular peak, which
   * the photograph has. Clipping count is the criterion because it is
   * scale-free and does not depend on which window you average.
   *
   * ⚠ A lamp round reported the photograph's R/G as 1.16 at the bright end and
   * 1.90 at the dark end. Those are **not** comparable with the figures above
   * — it averaged different quarter-windows on a different row — so do not
   * mix the two sets. Its other findings stand: the dyed amber also carries a
   * 2-D prism cross-hatch from `createLens` drawing two prism runs, which
   * reads as orange canvas and is `src/materials/lamp.ts`'s to fix, and
   * `LensOptions` has no way to ask for a 1-D fluted lens.
   */
  indicatorColor: 0xf5a428,
  indicatorHz: 1.5,
  tailColor: 0xcc1417,
  brakeColor: 0xff1a1a,
  reverseColor: 0xf2f4ff,
  fogColor: 0xffd9a0,
  sidemarkerFrontColor: 0xff9a20,
  sidemarkerRearColor: 0xd41a1a,
} as const;

// ---------------------------------------------------------------------------
// 8. RENDER QUALITY TARGETS
// ---------------------------------------------------------------------------

export const QUALITY = {
  /** Panel gap width — the C3 was tight for its era. */
  panelGap: 0.004,
  /** Radius on every body edge. Nothing in a real car is a sharp corner;
   *  this single value does more for realism than any texture. */
  edgeRadius: 0.006,
  /** Subdivision level for body lofts. */
  bodySegments: 96,
  /** Shadow map resolution for the key light. */
  shadowMapSize: 4096,
  /** Env map cube resolution. */
  envMapSize: 1024,
  targetFps: 60,
} as const;

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Rolling radius of the fitted tyre, metres. */
export function tyreRadius(): number {
  return (WHEEL.rimDiameterIn * 0.0254) / 2 + (WHEEL.tyreSectionMm / 1000) * (WHEEL.tyreAspect / 100);
}

/** Wheel-centre positions in the vehicle frame. Front axle is the origin. */
export function wheelPositions(): { fl: [number, number, number]; fr: [number, number, number]; rl: [number, number, number]; rr: [number, number, number] } {
  const r = tyreRadius();
  const tf = BODY.trackFront / 2;
  const tr = BODY.trackRear / 2;
  return {
    fl: [-tf, r, 0],
    fr: [tf, r, 0],
    rl: [-tr, r, -BODY.wheelbase],
    rr: [tr, r, -BODY.wheelbase],
  };
}

/** Longitudinal extents of the body in the vehicle frame. */
export function bodyExtents(): { noseZ: number; tailZ: number } {
  return { noseZ: BODY.overhangFront, tailZ: -(BODY.wheelbase + BODY.overhangRear) };
}

/** Interpolate the engine torque curve. Returns N·m. */
export function engineTorque(rpm: number): number {
  const c = ENGINE.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1] * ENGINE.peakTorqueNm;
  const last = c[c.length - 1];
  if (rpm >= last[0]) return last[1] * ENGINE.peakTorqueNm;
  for (let i = 0; i < c.length - 1; i++) {
    const [r0, t0] = c[i];
    const [r1, t1] = c[i + 1];
    if (rpm >= r0 && rpm <= r1) {
      const k = (rpm - r0) / (r1 - r0);
      // Smoothstep rather than linear — a torque curve has no kinks.
      const s = k * k * (3 - 2 * k);
      return (t0 + (t1 - t0) * s) * ENGINE.peakTorqueNm;
    }
  }
  return 0;
}

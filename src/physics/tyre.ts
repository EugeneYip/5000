/**
 * Pacejka magic-formula tyre, one instance per corner.
 *
 * Three things here are what make a vehicle model feel like a car rather than
 * a box on springs, and all three are easy to leave out:
 *
 *  1. **Load sensitivity.** Grip rises *sub*-linearly with vertical load, so
 *     two wheels at 2000 N generate more force than one at 4000 N. This is the
 *     entire reason weight transfer changes handling, why an inside wheel going
 *     light costs more than the outside wheel gains, and why a nose-heavy car
 *     understeers even with identical tyres at each corner. Omit it and every
 *     transient feels wrong in a way no amount of spring tuning will fix.
 *  2. **Combined slip.** A tyre has one friction budget shared between braking
 *     and cornering. A locked wheel has essentially no steering left — which is
 *     exactly what an ABS-less 1988 car does under panic braking.
 *  3. **Relaxation length.** Force builds over distance rolled, not instantly.
 *     ~0.4 m on a 70-series sidewall is one wheel revolution of lag, and it is
 *     what gives steering its natural, slightly late, slightly elastic feel.
 *
 * The 185/70 HR14 this car wears is a tall, soft, period radial: a late and
 * very rounded force peak, and a gentle fall-away past it rather than a snap.
 */

import { BODY, TYRE_MODEL } from '@/spec';
import { clamp, finite } from './math';

interface Coeffs {
  readonly B: number;
  readonly C: number;
  readonly D: number;
  readonly E: number;
  /** Slip at which the formula peaks, solved at module load. */
  readonly peak: number;
}

/**
 * Physical ceiling on where the force peak may sit.
 *
 * `TYRE_MODEL.longitudinal.E = 0.95` and `lateral.E = 0.97` are both so close
 * to 1 that the magic formula's peak is pushed far outside any slip a real tyre
 * ever sees — the lateral curve as written does not peak until about 2 rad
 * (120 degrees) of slip angle, i.e. it never breaks away at all and the car
 * would simply plough with no limit behaviour. Rather than silently rewrite a
 * spec constant, `E` is clamped to whichever value puts the peak at the limits
 * below, which are ordinary measured values for a period passenger radial:
 * a late 20 % longitudinal peak and a late 10.3 degrees of slip angle, chosen
 * at the soft, vague end because that is this tyre's character.
 *
 * If `TYRE_MODEL.*.E` is ever corrected to a physical value (lateral E is
 * normally NEGATIVE for a passenger radial — around -1.6 puts the peak at 8.5
 * degrees) the clamp becomes inert and spec wins. See the stream report.
 */
const MAX_PEAK_KAPPA = 0.20;
const MAX_PEAK_ALPHA = 0.18;

/** `E` that places the formula's peak exactly at `peakAt`. */
function eForPeak(B: number, C: number, peakAt: number): number {
  const target = Math.tan(Math.PI / (2 * C));
  const bx = B * peakAt;
  const den = bx - Math.atan(bx);
  if (Math.abs(den) < 1e-9) return 0;
  return (bx - target) / den;
}

/** Bisect for the slip at which the formula peaks. */
function solvePeak(B: number, C: number, E: number, hi: number): number {
  const target = Math.tan(Math.PI / (2 * C));
  const u = (x: number): number => B * x * (1 - E) + E * Math.atan(B * x);
  if (u(hi) <= target) return hi;
  let lo = 0;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 48; i++) {
    const m = (a + b) * 0.5;
    if (u(m) < target) a = m;
    else b = m;
  }
  lo = (a + b) * 0.5;
  return Math.max(lo, 1e-4);
}

function makeCoeffs(src: { B: number; C: number; D: number; E: number }, maxPeak: number): Coeffs {
  const E = Math.min(src.E, eForPeak(src.B, src.C, maxPeak));
  return { B: src.B, C: src.C, D: src.D, E, peak: solvePeak(src.B, src.C, E, maxPeak * 1.001) };
}

const LONG = makeCoeffs(TYRE_MODEL.longitudinal, MAX_PEAK_KAPPA);
const LAT = makeCoeffs(TYRE_MODEL.lateral, MAX_PEAK_ALPHA);

/** The magic formula itself, normalised: returns a fraction of `D`. */
function magic(slip: number, c: Coeffs): number {
  const bx = c.B * slip;
  return c.D * Math.sin(c.C * Math.atan(bx - c.E * (bx - Math.atan(bx))));
}

// ---------------------------------------------------------------------------
// Grip
// ---------------------------------------------------------------------------

/** Reference load the coefficients are calibrated at: one corner, car at rest. */
const FZ_REF = (BODY.massKerb * 9.81) / 4;

/**
 * Road-surface friction, applied on top of the tyre's own peak.
 *
 * `TYRE_MODEL.*.D` describes the tyre; this describes what it is rolling on.
 * Calibrated against the skidpad target in `PERFORMANCE.skidpadGEstimate`
 * (0.72 g) — see `selftest.ts`, which measures it.
 */
export const SURFACE_GRIP = 0.845;

/**
 * Load sensitivity. The linear form implied by `TYRE_MODEL.loadSensitivity`
 * is only valid near the reference load, so the multiplier is clamped: without
 * the clamp a lightly loaded inside wheel would be handed a friction
 * coefficient well over 1, which is not a thing.
 */
function loadFactor(fz: number): number {
  return clamp(1 - TYRE_MODEL.loadSensitivity * (fz - FZ_REF), 0.55, 1.22);
}

/** Peak longitudinal friction available at this load, for the brake limiter. */
export function peakMuLong(fz: number, surface: number): number {
  return LONG.D * loadFactor(fz) * surface;
}

// ---------------------------------------------------------------------------
// Low-speed conditioning
// ---------------------------------------------------------------------------

/** Slip ratios divide by speed; below this they would divide by nothing. */
const V_SLIP_FLOOR = 2.2;
/** Relaxation is driven by distance rolled; at rest, pretend we roll this fast. */
const V_RELAX_FLOOR = 1.2;
/**
 * Tread damping. A real carcass dissipates energy as it shears, and without a
 * term like this the wheel-spin/tyre-force pair is a very lightly damped ~20 Hz
 * oscillator at low speed that rings visibly in `wheelSpin`. Faded out with
 * speed so it never contributes meaningfully to steady-state force.
 */
const TREAD_DAMPING = 2600;
const TREAD_DAMPING_FADE = 4.0;

export interface TyreInput {
  /** Vertical load at the contact patch, N. Zero or less means airborne. */
  fz: number;
  /** Contact-patch velocity along the wheel's heading, m/s. */
  vx: number;
  /** Contact-patch velocity across the wheel's heading, +ve to the wheel's right. */
  vy: number;
  /** Wheel angular velocity, rad/s. Positive rolls the car forward. */
  omega: number;
  /** Loaded rolling radius, m. */
  radius: number;
  /** Surface friction multiplier from the ground query. */
  surface: number;
}

export interface TyreForces {
  /** Longitudinal force on the car, N, along the wheel's heading. */
  fx: number;
  /** Lateral force on the car, N, to the wheel's right. */
  fy: number;
  /** Lagged slip ratio actually used. */
  kappa: number;
  /** Lagged slip angle actually used, radians. */
  alpha: number;
  /**
   * Combined slip as a fraction of the peak: 0 gripping, 1 at the limit, above
   * that sliding. This is what `VehicleState.wheelSlip` reports.
   */
  slip: number;
  /** Peak friction available at this instant's load, for the brake model. */
  mu: number;
}

export class Tyre {
  /** Relaxation state: slip that the carcass has actually built up to. */
  private kappaLag = 0;
  private alphaSlipLag = 0;

  readonly out: TyreForces = { fx: 0, fy: 0, kappa: 0, alpha: 0, slip: 0, mu: 0 };

  reset(): void {
    this.kappaLag = 0;
    this.alphaSlipLag = 0;
    const o = this.out;
    o.fx = 0; o.fy = 0; o.kappa = 0; o.alpha = 0; o.slip = 0; o.mu = 0;
  }

  /** Airborne, or load has gone to nothing: bleed the carcass back to neutral. */
  private relax(dt: number): TyreForces {
    const k = 1 - Math.exp(-dt / 0.08);
    this.kappaLag -= this.kappaLag * k;
    this.alphaSlipLag -= this.alphaSlipLag * k;
    const o = this.out;
    o.fx = 0; o.fy = 0; o.slip = 0; o.mu = 0;
    o.kappa = this.kappaLag;
    o.alpha = Math.atan(this.alphaSlipLag);
    return o;
  }

  step(inp: TyreInput, dt: number): TyreForces {
    if (!(inp.fz > 1)) return this.relax(dt);

    const vx = finite(inp.vx);
    const vy = finite(inp.vy);
    const absVx = Math.abs(vx);
    const den = Math.max(absVx, V_SLIP_FLOOR);

    // --- instantaneous slip --------------------------------------------------
    const slipVel = finite(inp.omega) * inp.radius - vx;
    const kappaRaw = clamp(slipVel / den, -4, 4);
    // Lateral slip is carried as tan(alpha) rather than the angle so the
    // combined-slip normalisation stays linear in the sliding velocity.
    const tanAlphaRaw = clamp(-vy / den, -4, 4);

    // --- relaxation ----------------------------------------------------------
    // Force builds over distance rolled, so the lag rate is speed over the
    // relaxation length. Longitudinal relaxation is shorter than lateral: the
    // tread block shears in-plane, the sidewall has to wind up.
    const vRelax = Math.max(absVx, V_RELAX_FLOOR);
    const kLong = 1 - Math.exp(-(dt * vRelax) / (TYRE_MODEL.relaxationLength * 0.4));
    const kLat = 1 - Math.exp(-(dt * vRelax) / TYRE_MODEL.relaxationLength);
    this.kappaLag += (kappaRaw - this.kappaLag) * kLong;
    this.alphaSlipLag += (tanAlphaRaw - this.alphaSlipLag) * kLat;

    const kappa = this.kappaLag;
    const tanAlpha = this.alphaSlipLag;
    const alpha = Math.atan(tanAlpha);

    // --- combined slip -------------------------------------------------------
    // Normalise each slip by its own peak, then evaluate both curves at the
    // combined magnitude and split the result along the slip direction. That
    // gives a friction ellipse that collapses to the pure-slip curves on either
    // axis, which is what makes a braking tyre stop steering.
    const kn = kappa / LONG.peak;
    const an = tanAlpha / Math.tan(LAT.peak);
    const rho = Math.hypot(kn, an);

    const mu = loadFactor(inp.fz) * inp.surface;
    const scale = inp.fz * mu;

    let fx: number;
    let fy: number;
    if (rho < 1e-6) {
      fx = 0;
      fy = 0;
    } else {
      fx = (kn / rho) * magic(rho * LONG.peak, LONG) * scale;
      fy = (an / rho) * magic(Math.atan(rho * Math.tan(LAT.peak)), LAT) * scale;
    }

    // --- tread damping -------------------------------------------------------
    const damp = (TREAD_DAMPING * TREAD_DAMPING_FADE) / (TREAD_DAMPING_FADE + absVx);
    fx += clamp(damp * slipVel, -0.3 * scale, 0.3 * scale);
    fy += clamp(damp * -vy * 0.35, -0.3 * scale, 0.3 * scale);

    // Safety net: nothing may leave the friction circle by more than the
    // formula's own overshoot allowance.
    const ceiling = scale * Math.max(LONG.D, LAT.D) * 1.05;
    const mag = Math.hypot(fx, fy);
    if (mag > ceiling && mag > 1e-6) {
      const k = ceiling / mag;
      fx *= k;
      fy *= k;
    }

    const o = this.out;
    o.fx = finite(fx);
    o.fy = finite(fy);
    o.kappa = kappa;
    o.alpha = alpha;
    o.slip = rho;
    o.mu = mu;
    return o;
  }
}

/** Rolling resistance torque, N·m, opposing rotation. */
export function rollingResistance(fz: number, radius: number, omega: number): number {
  if (fz <= 0) return 0;
  // Smoothed sign so a stationary wheel does not buzz between +/- the torque.
  const s = clamp(omega * 4, -1, 1);
  return -s * TYRE_MODEL.rollingResistance * fz * radius;
}

/** Exposed for the self-test's report, and so the numbers can be eyeballed. */
export const TYRE_DEBUG = {
  peakKappa: LONG.peak,
  peakAlphaDeg: (LAT.peak * 180) / Math.PI,
  longE: LONG.E,
  latE: LAT.E,
  fzRef: FZ_REF,
};

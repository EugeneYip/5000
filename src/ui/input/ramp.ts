/**
 * Turning binary keys into pedals.
 *
 * A key is on or off; a throttle cable is not. Everything here exists so the
 * car answers a keystroke the way it answers a foot: with a rate limit, a
 * progressive curve, and a centring spring on the steering that stiffens with
 * road speed the way a real rack's self-aligning torque does.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Move `current` toward `target` at no more than `rate` units per second. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  const delta = target - current;
  if (delta > step) return current + step;
  if (delta < -step) return current - step;
  return target;
}

/**
 * Pedal travel → demand. Slightly progressive: the first third of the ramp
 * does less than a third of the work, which is what makes part-throttle
 * cruising possible with a key that only knows 0 and 1.
 */
export function pedalCurve(x: number): number {
  const a = clamp(x, 0, 1);
  return a * (0.55 + 0.45 * a);
}

/**
 * Steering-wheel angle → road-wheel demand. Cubic-blended expo: fine either
 * side of centre, full lock still reachable at the stop.
 */
export function steerCurve(x: number): number {
  const a = clamp(Math.abs(x), 0, 1);
  return Math.sign(x) * (0.36 * a + 0.64 * a * a * a);
}

/** Gamepad axis conditioning: radial deadzone, rescale, then a gentle expo. */
export function axisCurve(v: number, deadzone = 0.09, expo = 0.45): number {
  const a = Math.abs(v);
  if (a <= deadzone) return 0;
  const scaled = (a - deadzone) / (1 - deadzone);
  return Math.sign(v) * lerp(scaled, scaled * scaled * scaled, expo);
}

/** Normalised speed, 0 at rest and 1 at about 100 km/h. */
export function speedFactor(speedMs: number): number {
  return clamp(Math.abs(speedMs) / 28, 0, 1);
}

/** Rate limits, all per second. Tuned by feel, not by any factory figure. */
export const RATES = {
  throttleRise: 3.0,
  throttleFall: 6.5,
  brakeRise: 4.6,
  brakeFall: 8.0,
  handbrakeRise: 7.0,
  handbrakeFall: 9.0,
  clutchRise: 9.0,
  clutchFall: 7.0,

  /** Lock-to-lock rate at a standstill, and at speed. */
  steerFast: 2.9,
  steerSlow: 0.95,
  /** Reversing an input is quicker than starting one — that is a real reflex. */
  counterSteerBoost: 1.85,
  /** Self-centring, at a standstill and at speed. */
  returnSlow: 1.5,
  returnFast: 5.2,
  /** How much lock a digital input may command, parked vs. at speed. */
  lockAtRest: 1.0,
  lockAtSpeed: 0.44,
  /** An analogue stick keeps full authority — the driver has real resolution. */
  steerAnalogueRate: 6.5,
} as const;

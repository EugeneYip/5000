/**
 * Small numeric helpers for the vehicle simulation.
 *
 * Everything here is deliberately branch-cheap and allocation-free: these run
 * four times per wheel, several hundred times a second.
 */

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Hermite ease between two edges. Returns 0 below `a`, 1 above `b`. */
export function smoothstep(a: number, b: number, x: number): number {
  if (b === a) return x < a ? 0 : 1;
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}

/** `Math.sign`, but exactly 0 inside a dead band so forces do not chatter. */
export const signDead = (x: number, eps = 1e-9): number => (x > eps ? 1 : x < -eps ? -1 : 0);

/**
 * NaN/Infinity guard. One bad divide anywhere in a vehicle model propagates to
 * the transform within a frame and the car disappears; this is the single most
 * common failure in code of this kind, so every integrator output goes through
 * it and the caller is told when it fired.
 */
export const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);

/**
 * Frame-rate-independent exponential approach. `tau` is the time constant in
 * seconds; `dt / tau` is clamped so a long frame can never overshoot.
 */
export function approach(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 1e-6) return target;
  return current + (target - current) * clamp01(1 - Math.exp(-dt / tau));
}

/** Move `current` towards `target` at no more than `rate` units per second. */
export function moveTowards(current: number, target: number, rate: number, dt: number): number {
  const d = target - current;
  const step = rate * dt;
  if (d > step) return current + step;
  if (d < -step) return current - step;
  return target;
}

export const RPM_TO_RADS = Math.PI / 30;
export const RADS_TO_RPM = 30 / Math.PI;
export const MPS_TO_MPH = 2.2369362920544;
export const MPH_TO_MPS = 1 / MPS_TO_MPH;
export const MPS_TO_KMH = 3.6;

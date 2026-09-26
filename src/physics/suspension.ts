/**
 * Per-corner raycast suspension.
 *
 * The wheel is massless: a ray is dropped from the strut top along the body's
 * down axis, the ground is found, and the spring/damper is solved from how far
 * the body has moved relative to that contact. It is the architecture every
 * driving game uses because it is stable, cheap, and — for one vehicle — more
 * accurate than a general constraint solver.
 *
 * Character notes for this car specifically:
 *
 *  - The rates in `SUSPENSION` put the front at about 1.3 Hz of ride frequency.
 *    That is genuinely soft — a modern hatchback is 1.7-2.0 Hz — and it is the
 *    single biggest reason a C3 floats, dives and rolls the way it does.
 *  - Bump and rebound damping are deliberately different. A damper that is
 *    symmetric lets the body keep bobbing after a bump; the rebound stroke
 *    being roughly 1.6x the bump stroke is what settles it in one motion.
 *  - There is **no rear anti-roll bar** on a FWD C3. The torsion-crank beam's
 *    own torsional stiffness is the rear roll stiffness, which is what
 *    `SUSPENSION.rear.arbRate` stands in for.
 */

import * as THREE from 'three';
import { BODY, SUSPENSION, WHEEL, tyreRadius, wheelPositions } from '@/spec';
import { clamp, smoothstep } from './math';

export const FL = 0;
export const FR = 1;
export const RL = 2;
export const RR = 3;

/**
 * Centre-of-gravity height above ground.
 *
 * **Not a sourced figure** — no period measurement of the C3's CG height was
 * found, the same as `BODY.weightDistFront`. 0.545 m is ~0.385 of overall
 * height, the usual proportion for a saloon/estate of this era, and it is a
 * tuning parameter: it sets how much weight transfers, so it moves dive, roll
 * and the load-sensitivity balance together.
 */
export const CG_HEIGHT = 0.545;

/** Distance from the CG forward to the front axle, m. */
export const CG_TO_FRONT = BODY.wheelbase * (1 - BODY.weightDistFront);
/** Distance from the CG back to the rear axle, m. */
export const CG_TO_REAR = BODY.wheelbase * BODY.weightDistFront;

/**
 * Strut top above the wheel centre. Sets where the suspension force enters the
 * body; on a MacPherson car the top mount is high in the inner wing.
 */
const MOUNT_ABOVE_HUB = 0.50;

/**
 * Top-out taper.
 *
 * At 1.3 Hz the spring is already ~145 mm into its travel just holding the car
 * up, so within the 80-85 mm of rebound travel the spring alone never unloads
 * to zero — yet a hanging wheel obviously carries nothing. What actually
 * happens is that the strut reaches its internal rebound stop and the residual
 * spring force is reacted internally instead of through the body. Tapering the
 * corner force to zero over the last stretch of droop models exactly that, and
 * makes lift-off continuous instead of a step.
 */
const TOPOUT_ZONE = 0.028;

/** Damper blow-off: above this piston speed the valve opens and the curve flattens. */
const BLOWOFF_SPEED = 0.26;
const BLOWOFF_SLOPE = 0.34;
/** Absolute ceiling, so a kerb strike cannot fire the car into orbit. */
const DAMPER_LIMIT = 16_000;

/** Progressive bump stop. Quadratic, reaching several times the corner load. */
const BUMPSTOP_RATE = 900_000;
const BUMPSTOP_REF = 0.05;

export interface CornerConfig {
  readonly index: number;
  readonly front: boolean;
  readonly left: boolean;
  /** +1 for the right of the car, -1 for the left. */
  readonly side: number;
  /** Strut top in the body frame, relative to the CG. */
  readonly mount: THREE.Vector3;
  /** Mount-to-wheel-centre distance at the design ride height. */
  readonly restLength: number;
  readonly springRate: number;
  readonly damperBump: number;
  readonly damperRebound: number;
  readonly travelUp: number;
  readonly travelDown: number;
  /** Half the axle's roll-bar rate, expressed as a force per metre of L-R difference. */
  readonly arbCoupling: number;
  /** Corner load at the design ride height, N. */
  readonly staticLoad: number;
  /** Spring compression already dialled in at the design ride height, m. */
  readonly preload: number;
  /** Height above the contact patch at which lateral tyre force enters the body. */
  readonly latForceHeight: number;
  /** Height above the contact patch at which longitudinal tyre force enters. */
  readonly longForceHeight: number;
  readonly unsprungWeight: number;
}

export function buildCorners(): CornerConfig[] {
  const pos = wheelPositions();
  const r = tyreRadius();
  const g = 9.81;
  const layout: Array<{ p: readonly [number, number, number]; front: boolean; left: boolean }> = [
    { p: pos.fl, front: true, left: true },
    { p: pos.fr, front: true, left: false },
    { p: pos.rl, front: false, left: true },
    { p: pos.rr, front: false, left: false },
  ];

  return layout.map((l, index) => {
    const s = l.front ? SUSPENSION.front : SUSPENSION.rear;
    const track = l.front ? BODY.trackFront : BODY.trackRear;
    const axleLoad = BODY.massKerb * g * (l.front ? BODY.weightDistFront : 1 - BODY.weightDistFront);
    const staticLoad = axleLoad / 2;

    // Model frame has the front axle at z = 0 and the ground at y = 0; the
    // rigid body works about the CG, so shift into that frame here once.
    const mount = new THREE.Vector3(
      l.p[0],
      r + MOUNT_ABOVE_HUB - CG_HEIGHT,
      l.p[2] + CG_TO_FRONT,
    );

    return {
      index,
      front: l.front,
      left: l.left,
      side: l.left ? -1 : 1,
      mount,
      restLength: MOUNT_ABOVE_HUB,
      springRate: s.springRate,
      damperBump: s.damperBump,
      damperRebound: s.damperRebound,
      travelUp: s.travelUp,
      travelDown: s.travelDown,
      // M = K * phi, phi ~ dx / track, delivered as a couple F * track.
      arbCoupling: s.arbRate / (track * track),
      staticLoad,
      preload: staticLoad / s.springRate,
      latForceHeight: s.rollCentreHeight,
      longForceHeight: (l.front ? SUSPENSION.front.antiDive : SUSPENSION.rear.antiSquat) * CG_HEIGHT,
      unsprungWeight: WHEEL.massUnsprung * g,
    };
  });
}

/**
 * Spring force for a compression `x` measured from the design ride height.
 * Positive `x` is compression; the return is the upward force on the body.
 */
export function springForce(c: CornerConfig, x: number): number {
  const raw = c.springRate * (x + c.preload);
  if (x >= -c.travelDown + TOPOUT_ZONE) return raw;
  // Into the rebound stop: hand the load over to the hanging unsprung weight.
  const k = smoothstep(-c.travelDown, -c.travelDown + TOPOUT_ZONE, x);
  return raw * k - c.unsprungWeight * (1 - k);
}

/** Damper force. `xd` is the compression rate; positive is bump. */
export function damperForce(c: CornerConfig, xd: number): number {
  const rate = xd >= 0 ? c.damperBump : c.damperRebound;
  const a = Math.abs(xd);
  const f = a <= BLOWOFF_SPEED
    ? rate * a
    : rate * (BLOWOFF_SPEED + (a - BLOWOFF_SPEED) * BLOWOFF_SLOPE);
  return clamp(Math.sign(xd) * f, -DAMPER_LIMIT, DAMPER_LIMIT);
}

/** Progressive bump stop once `x` passes the jounce travel limit. */
export function bumpStopForce(c: CornerConfig, x: number): number {
  const over = x - c.travelUp;
  if (over <= 0) return 0;
  return (BUMPSTOP_RATE * over * over) / BUMPSTOP_REF;
}

/** Map compression to the 0..1 the wheel and underbody meshes consume. */
export function compressionFraction(c: CornerConfig, x: number): number {
  const span = x >= 0 ? c.travelUp : c.travelDown;
  return clamp(0.5 + (0.5 * x) / span, 0, 1);
}

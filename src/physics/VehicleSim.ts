/**
 * Vehicle simulation — 6-DOF rigid body on four raycast struts.
 *
 * ## Shape of the model
 *
 * One rigid body carries the whole kerb mass. Four struts are raycast from
 * their top mounts along the body's down axis; each returns a vertical load,
 * and each load feeds a Pacejka tyre (`tyre.ts`) that returns a longitudinal
 * and a lateral force. Those forces are applied back to the body at the
 * contact patch, raised to the roll centre laterally and to the anti-dive /
 * anti-squat height longitudinally, which is what gives geometric load
 * transfer, dive and squat without a linkage solver. Engine, clutch and
 * gearbox live in `powertrain.ts` and hand back one number: the torque on the
 * front axle, split evenly by an open differential.
 *
 * ## Why it is integrated at 480 Hz
 *
 * A tyre is a very stiff spring in series with a very small wheel inertia. At
 * 60 Hz that loop is unstable at any speed you would care about; relaxation
 * length (force lags slip by about a wheel revolution) softens it enormously,
 * but not enough. 480 Hz with a fixed step and an accumulator is cheap for one
 * vehicle — four tyre evaluations per step — and it makes behaviour
 * independent of frame rate, which matters because the same code has to give
 * the same 0-60 on a 144 Hz monitor and in a headless self-test. Render state
 * is interpolated between the last two fixed steps so the car does not shimmer
 * when the frame rate and the step rate beat against each other.
 *
 * ## Character this is aiming at
 *
 * 1340 kg, 60 % of it over the driven front axle, a 1.3 Hz ride frequency, no
 * rear anti-roll bar and period 185/70 rubber. It should roll visibly, dive
 * under braking, wash wide if you ask too much of the front, spin an inside
 * front wheel out of a tight junction, and lock its front wheels — it has no
 * ABS, and a locked front wheel has no steering left in it, which is exactly
 * how a 1988 base-model car behaves and is not a bug.
 *
 * ## Scene coupling
 *
 * `car.root` gets the ground-plane position and the heading. `car.body` — the
 * sprung mass — gets pitch and roll *about the centre of gravity*, not about
 * the model origin, which sits on the ground at the front axle and would swing
 * the tail around if it were used as the pivot. The wheels hang off the body
 * and are positioned by `suspensionCompression`, so the two motions cancel
 * exactly and the tyres stay on the road.
 */

import * as THREE from 'three';
import type { Car } from '@/car/Car';
import type { VehicleState } from '@/types';
import type { ControlInput } from '@/ui/input';
import { BODY, BRAKES, ENGINE, STEERING, WHEEL, tyreRadius } from '@/spec';
import { clamp, clamp01, finite, lerp, smoothstep, approach, moveTowards } from './math';
import {
  buildCorners, compressionFraction, springForce, damperForce, bumpStopForce,
  CG_HEIGHT, CG_TO_FRONT, type CornerConfig, FL, FR, RL, RR,
} from './suspension';
import { Tyre, rollingResistance, type TyreInput } from './tyre';
import { FlatGround, createGroundSample, type GroundProvider, type GroundSample } from './ground';
import { Powertrain, REVERSE, NEUTRAL, type GearboxMode } from './powertrain';

// ---------------------------------------------------------------------------
// Constants that are tuning, not vehicle data, and so are not in `spec.ts`
// ---------------------------------------------------------------------------

/** Fixed integration rate. See the module header for why it is this high. */
const FIXED_HZ = 480;
const FIXED_DT = 1 / FIXED_HZ;
/**
 * A backgrounded tab must not try to catch up an hour of simulation at once.
 * 24 covers everything down to 20 fps at real time; below that the car goes
 * into slow motion, which is the right failure — the alternative is a spiral
 * where each frame costs more than the last. A whole step measures 3.2 µs, so
 * even a worst-case frame is 0.08 ms of the budget.
 */
const MAX_SUBSTEPS = 24;

const GRAVITY = 9.80665;
/** Sea level, 15 °C. */
const AIR_DENSITY = 1.225;

/**
 * Inertia of the body about its own axes, as a fraction of the solid-box value
 * for `BODY`'s length, width and height. A car is not a solid box — its mass
 * sits low and towards the middle — and the usual measured correction for a
 * saloon or estate is 0.7-0.8. These put yaw inertia at ~2190 kg·m² and roll at
 * ~443 kg·m², both ordinary for a 1340 kg car of this size. **Tuning
 * parameters**: no measured inertia for a C3 was found, as with the springs.
 */
const INERTIA_SCALE = { pitch: 0.72, yaw: 0.72, roll: 0.75 };

/**
 * Rotating inertia of one wheel. `WHEEL.massUnsprung` (38 kg) is hub, brake,
 * rim and tyre together; a little over half of that actually turns about the
 * axle, at a radius of gyration of roughly 0.72 r for a rim-and-tyre assembly.
 * That comes to 1.02 kg·m², an ordinary figure for a 14-inch wheel — and it
 * matters, because in first gear the engine's own inertia is worth ~500 kg of
 * extra car and these four are worth another 49 kg. Leave them out and the
 * car is a second quicker to 60 than it has any right to be.
 */
const ROTATING_FRACTION = 0.55;
const GYRATION_FRACTION = 0.72;

/**
 * `BRAKES.maxTorqueFront/Rear` are per-axle torques at a buried pedal, and the
 * pair already encodes a front split of 0.676 — near enough `BRAKES.bias`
 * (0.66) that applying the bias on top would be counting it twice. So the two
 * are used directly as the demand, and `bias` is left to the regulator below,
 * which pushes the *working* bias to about 0.78 once the pedal is hard down.
 *
 * 1200 N·m on a front wheel is a shade more than the ~1175 N·m that tyre needs
 * to be dragged past its peak at full weight transfer. That is exactly how a
 * real brake system is sized: it can lock a dry front axle, but only with the
 * pedal all the way to the floor.
 */

/**
 * Rear pressure regulator — the load-sensitive valve the brochure lists in the
 * brake-circuit description. Without it this car locks its rear wheels before
 * its front ones in a panic stop, because the rear axle carries 40 % of the
 * weight before transfer and barely 25 % after it, and the result is a car
 * that spins every time you brake hard. Above the knee the rear circuit sees
 * `REGULATOR_SLOPE` of the pressure rise the front sees.
 */
const REGULATOR_KNEE = 0.35;
const REGULATOR_SLOPE = 0.42;

const MAX_STEER = (STEERING.maxSteerAngleDeg * Math.PI) / 180;
/** Road-wheel angular rate the rack can actually deliver, rad/s. */
const RACK_RATE = 2.6;
/** Rack lag going out to lock and coming back — the rack has mass, so do the tyres. */
const RACK_TAU_SLOW = 0.075;
const RACK_TAU_FAST = 0.038;
/**
 * Speed-sensitive lock limit. A real rack does not shorten its travel with
 * speed, but self-aligning torque climbs with the square of it, so no driver
 * holds full lock at 80 mph. Fading the commanded lock models that, and it is
 * also what stops a keyboard — which has no weight to warn you — being a trap.
 */
const LOCK_AT_SPEED = 0.30;

/** Driver input above this counts as "the driver is here", and selects drive. */
const WAKE_THRESHOLD = 0.02;

// ---------------------------------------------------------------------------

export interface CornerRuntime {
  readonly cfg: CornerConfig;
  readonly tyre: Tyre;
  readonly ground: GroundSample;
  /** Spring compression from the design ride height, m. Positive is bump. */
  x: number;
  /** Compression rate, m/s. Positive is bump. */
  xd: number;
  fz: number;
  omega: number;
  slip: number;
  contact: boolean;
  /** Road-wheel steer angle for this corner, after Ackermann. */
  steer: number;
  /** Distance from the strut mount down to the contact patch, m. */
  reach: number;
  /** Interpolation endpoints for `suspensionCompression`. */
  compPrev: number;
  compCurr: number;
}

// Scratch. The step loop runs 480 times a second and must not allocate. Each
// name is used for exactly one thing so nothing can be clobbered from a helper.
const vFwd = new THREE.Vector3();
const vUp = new THREE.Vector3();
const vRight = new THREE.Vector3();
const vHeading = new THREE.Vector3();
const vLateral = new THREE.Vector3();
const vArm = new THREE.Vector3();
const vPoint = new THREE.Vector3();
const vPatch = new THREE.Vector3();
const vVel = new THREE.Vector3();
const vForce = new THREE.Vector3();
const vMount = new THREE.Vector3();
const vTmpA = new THREE.Vector3();
const vTmpB = new THREE.Vector3();
const vTmpC = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
const eTmp = new THREE.Euler();

export class VehicleSim {
  readonly powertrain: Powertrain;

  /** Centre-of-gravity position in world space. */
  private readonly pos = new THREE.Vector3(0, CG_HEIGHT, -CG_TO_FRONT);
  private readonly vel = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  /** Angular velocity, world frame, rad/s. */
  private readonly spin = new THREE.Vector3();

  /** Principal moments about the body axes: x = pitch, y = yaw, z = roll. */
  private readonly inertia: THREE.Vector3;
  private readonly mass = BODY.massKerb;
  private readonly wheelInertia: number;
  private readonly radius = tyreRadius();
  /** The CG in the model's own frame — origin on the ground at the front axle. */
  private readonly cgLocal = new THREE.Vector3(0, CG_HEIGHT, -CG_TO_FRONT);

  private readonly corners: CornerRuntime[];
  private ground: GroundProvider = new FlatGround(0, 1);

  private steerAngle = 0;
  private accumulator = 0;
  private alpha = 1;
  private pendingUp = false;
  private pendingDown = false;
  /**
   * The automatic sits in neutral until the driver touches something. A
   * three-speed with no lock-up clutch creeps at idle, and a car that drives
   * itself off down the road while the boot screen is still up — or while the
   * screenshot harness is composing a shot — is not what anyone wants.
   */
  private awake = false;

  /** Interpolation endpoints for the render transform. */
  private readonly posPrev = new THREE.Vector3(0, CG_HEIGHT, -CG_TO_FRONT);
  private readonly quatPrev = new THREE.Quaternion();

  private readonly accelFiltered = new THREE.Vector3();
  private readonly lastVel = new THREE.Vector3();
  private readonly forceAcc = new THREE.Vector3();
  private readonly torqueAcc = new THREE.Vector3();
  private readonly brakeTorque = [0, 0, 0, 0];
  private readonly extTorque = [0, 0, 0, 0];

  private odometerM = 0;
  private nanTrips = 0;

  private readonly state: VehicleState = {
    speed: 0,
    velocity: new THREE.Vector3(),
    engineRpm: ENGINE.idleRpm,
    gear: 0,
    throttle: 0, brake: 0, clutch: 0, handbrake: 0,
    steerAngle: 0,
    wheelSpin: [0, 0, 0, 0],
    wheelSlip: [0, 0, 0, 0],
    suspensionCompression: [0.5, 0.5, 0.5, 0.5],
    wheelContact: [true, true, true, true],
    pitch: 0, roll: 0, yawRate: 0,
    gForce: new THREE.Vector2(),
    lights: { low: false, high: false, brake: false, reverse: false, hazard: false, indicator: 0, fog: false },
    wipers: 0,
    engineRunning: true,
    odometer: 0,
  };

  constructor(private readonly car: Car | null = null, mode: GearboxMode = 'automatic') {
    this.powertrain = new Powertrain(mode);

    const m = BODY.massKerb / 12;
    const L = BODY.length;
    const W = BODY.width;
    const H = BODY.height;
    this.inertia = new THREE.Vector3(
      m * (H * H + L * L) * INERTIA_SCALE.pitch,
      m * (W * W + L * L) * INERTIA_SCALE.yaw,
      m * (W * W + H * H) * INERTIA_SCALE.roll,
    );

    this.wheelInertia = WHEEL.massUnsprung * ROTATING_FRACTION * (this.radius * GYRATION_FRACTION) ** 2;

    this.corners = buildCorners().map((cfg) => ({
      cfg,
      tyre: new Tyre(),
      ground: createGroundSample(),
      x: 0, xd: 0, fz: cfg.staticLoad, omega: 0, slip: 0, contact: true, steer: 0,
      reach: cfg.restLength, compPrev: 0.5, compCurr: 0.5,
    }));

    this.installDebugHooks();
  }

  // -------------------------------------------------------------------------
  // Public surface
  // -------------------------------------------------------------------------

  setGround(g: GroundProvider): void {
    this.ground = g;
  }

  setGearbox(mode: GearboxMode): void {
    this.powertrain.setMode(mode);
    this.awake = false;
  }

  /**
   * Put the car back on its wheels, stopped, facing `heading` radians.
   *
   * `x` and `z` place the **model origin** — the point on the ground at the
   * front-axle centre that every other module builds to — not the centre of
   * gravity, which sits 1.07 m behind it. So `reset()` leaves `car.root` at the
   * world origin, exactly where it was before physics existed, and none of the
   * calibrated camera poses move.
   */
  reset(x = 0, z = 0, heading = 0): void {
    this.quat.setFromAxisAngle(vTmpA.set(0, 1, 0), heading);
    this.pos.copy(this.cgLocal).applyQuaternion(this.quat).add(vTmpA.set(x, 0, z));
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.posPrev.copy(this.pos);
    this.quatPrev.copy(this.quat);
    this.steerAngle = 0;
    this.accumulator = 0;
    this.pendingUp = false;
    this.pendingDown = false;
    this.awake = false;
    this.accelFiltered.set(0, 0, 0);
    this.lastVel.set(0, 0, 0);
    this.powertrain.reset();
    for (const c of this.corners) {
      c.tyre.reset();
      c.x = 0; c.xd = 0; c.fz = c.cfg.staticLoad; c.omega = 0; c.slip = 0;
      c.contact = true; c.steer = 0; c.reach = c.cfg.restLength;
      c.compPrev = 0.5; c.compCurr = 0.5;
    }
  }

  /**
   * Advance by a wall-clock `dt` and return the live state. The state object is
   * reused frame to frame; a caller that needs to keep one must copy it.
   */
  step(dt: number, input: ControlInput): VehicleState {
    if (input.reset) this.reset();

    this.accumulator += clamp(finite(dt, FIXED_DT), 0, 0.25);

    // Shift requests are single-frame edges, and at over 480 fps a frame can
    // run no substeps at all — so they are latched here and delivered exactly
    // once, on the first substep that actually happens.
    if (input.shiftUp) this.pendingUp = true;
    if (input.shiftDown) this.pendingDown = true;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.fixedStep(FIXED_DT, input, steps === 0 && this.pendingUp, steps === 0 && this.pendingDown);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps > 0) {
      this.pendingUp = false;
      this.pendingDown = false;
    }
    if (steps >= MAX_SUBSTEPS) this.accumulator = 0;
    this.alpha = clamp01(this.accumulator / FIXED_DT);

    this.publish(input);
    this.applyToScene();
    return this.state;
  }

  /** Total distance travelled, metres. */
  get odometer(): number {
    return this.odometerM;
  }

  /** How often the NaN guard has had to recover the body. Should stay at zero. */
  get nanRecoveries(): number {
    return this.nanTrips;
  }

  /** Read-only view of the corners, for the self-test and the debug hooks. */
  cornerState(i: number): Readonly<CornerRuntime> {
    return this.corners[i];
  }

  // -------------------------------------------------------------------------
  // One fixed step
  // -------------------------------------------------------------------------

  private fixedStep(dt: number, input: ControlInput, shiftUp: boolean, shiftDown: boolean): void {
    this.posPrev.copy(this.pos);
    this.quatPrev.copy(this.quat);
    for (const c of this.corners) c.compPrev = c.compCurr;

    vFwd.set(0, 0, 1).applyQuaternion(this.quat);
    vUp.set(0, 1, 0).applyQuaternion(this.quat);
    const speed = this.vel.dot(vFwd);

    if (!this.awake && driverPresent(input)) {
      this.awake = true;
      if (this.powertrain.mode === 'automatic' && this.powertrain.gear === NEUTRAL) {
        this.powertrain.gear = 1;
      }
    }

    this.updateSteering(dt, input, speed);

    this.forceAcc.set(0, -this.mass * GRAVITY, 0);
    this.torqueAcc.set(0, 0, 0);

    this.solveSuspension();
    this.applyAntiRoll();
    for (const c of this.corners) this.addSuspensionForce(c);

    this.updateBrakeTorques(input);
    this.solveTyres(dt);

    const axle = this.powertrain.step({
      dt,
      throttle: clamp01(finite(input.throttle)),
      clutchPedal: clamp01(finite(input.clutch)),
      brake: clamp01(finite(input.brake)),
      shiftUp,
      shiftDown,
      ignition: input.ignition,
      cranking: input.cranking,
      omegaFL: this.corners[FL].omega,
      omegaFR: this.corners[FR].omega,
      extTorqueFL: this.extTorque[FL] - brakeSign(this.corners[FL].omega) * this.brakeTorque[FL],
      extTorqueFR: this.extTorque[FR] - brakeSign(this.corners[FR].omega) * this.brakeTorque[FR],
      wheelInertia: this.wheelInertia,
      speed,
    });

    this.integrateWheels(dt, axle);
    this.applyAero();
    this.integrateBody(dt);

    for (const c of this.corners) c.compCurr = compressionFraction(c.cfg, c.x);
    this.odometerM += Math.abs(speed) * dt;
  }

  // --- suspension -----------------------------------------------------------

  private solveSuspension(): void {
    for (const c of this.corners) {
      const cfg = c.cfg;
      vMount.copy(cfg.mount).applyQuaternion(this.quat);
      vPoint.copy(vMount).add(this.pos);
      const g = this.ground.sample(vPoint.x, vPoint.z, c.ground);
      const n = g.normal;

      // Distance down the strut axis that puts the tyre on the ground:
      //   n · (mount - groundPoint) - reach * (n · up) = radius
      const denom = vUp.dot(n);
      const maxReach = cfg.restLength + cfg.travelDown;
      const reach = denom > 0.2
        ? (n.y * (vPoint.y - g.height) - this.radius) / denom
        : maxReach;

      const airborne = reach > maxReach;
      c.reach = clamp(reach, cfg.restLength - cfg.travelUp - 0.07, maxReach);
      c.x = cfg.restLength - c.reach;
      c.contact = !airborne;

      if (airborne) {
        c.xd = 0;
        c.fz = 0;
        continue;
      }

      // Compression rate from the mount's own velocity, which already carries
      // the body's rotation. Clamped so a kerb strike cannot spike the damper.
      vVel.copy(this.spin).cross(vMount).add(this.vel);
      c.xd = clamp(-vVel.dot(n) / Math.max(denom, 0.2), -6, 6);

      const f = springForce(cfg, c.x) + damperForce(cfg, c.xd) + bumpStopForce(cfg, c.x);
      c.fz = Math.max(0, finite(f));
    }
  }

  /**
   * Anti-roll bars, as a load transfer across each axle. The rear "bar" is the
   * torsion-crank beam's own stiffness — a front-wheel-drive C3 has no discrete
   * rear anti-roll bar, which is a large part of why it understeers.
   */
  private applyAntiRoll(): void {
    this.arbPair(this.corners[FL], this.corners[FR]);
    this.arbPair(this.corners[RL], this.corners[RR]);
  }

  private arbPair(a: CornerRuntime, b: CornerRuntime): void {
    const d = (a.x - b.x) * a.cfg.arbCoupling;
    if (a.contact) a.fz = Math.max(0, a.fz + d);
    if (b.contact) b.fz = Math.max(0, b.fz - d);
  }

  /** Strut load into the body, along the contact normal at the wheel centre. */
  private addSuspensionForce(c: CornerRuntime): void {
    if (!c.contact || c.fz <= 0) return;
    vArm.copy(c.cfg.mount).applyQuaternion(this.quat).addScaledVector(vUp, -c.reach);
    vForce.copy(c.ground.normal).multiplyScalar(c.fz);
    this.forceAcc.add(vForce);
    this.torqueAcc.add(vTmpA.copy(vArm).cross(vForce));
  }

  // --- tyres ----------------------------------------------------------------

  private solveTyres(dt: number): void {
    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      const cfg = c.cfg;
      const n = c.ground.normal;

      // Wheel heading. Steer is positive to the left, and a positive rotation
      // about +Y in this frame turns the nose right, hence the negation.
      vHeading.copy(vFwd);
      if (cfg.front && c.steer !== 0) vHeading.applyAxisAngle(vUp, -c.steer);
      vHeading.addScaledVector(n, -vHeading.dot(n));
      if (vHeading.lengthSq() < 1e-8) vHeading.copy(vFwd);
      vHeading.normalize();
      vLateral.copy(n).cross(vHeading).normalize();

      // Contact patch, and its velocity including the body's rotation.
      vPatch.copy(cfg.mount).applyQuaternion(this.quat)
        .addScaledVector(vUp, -c.reach)
        .addScaledVector(n, -this.radius);
      vVel.copy(this.spin).cross(vPatch).add(this.vel);

      const inp: TyreInput = {
        fz: c.fz,
        vx: vVel.dot(vHeading),
        vy: vVel.dot(vLateral),
        omega: c.omega,
        radius: this.radius,
        surface: c.ground.friction,
      };
      const f = c.tyre.step(inp, dt);
      c.slip = f.slip;

      // Tyre force enters the body at the height the suspension geometry
      // actually reacts it — roll centre laterally, anti-dive / anti-squat
      // longitudinally. Everything above those heights is reacted by the
      // springs, and that difference *is* roll, dive and squat.
      this.addForceAt(f.fx, vHeading, cfg.longForceHeight, n);
      this.addForceAt(f.fy, vLateral, cfg.latForceHeight, n);

      this.extTorque[i] = -f.fx * this.radius + rollingResistance(c.fz, this.radius, c.omega);
    }
  }

  /** `f` along `dir`, applied at the current patch raised `height` along `n`. */
  private addForceAt(f: number, dir: THREE.Vector3, height: number, n: THREE.Vector3): void {
    if (f === 0) return;
    vForce.copy(dir).multiplyScalar(f);
    this.forceAcc.add(vForce);
    vTmpB.copy(vPatch).addScaledVector(n, height);
    this.torqueAcc.add(vTmpB.cross(vForce));
  }

  // --- wheels ---------------------------------------------------------------

  private integrateWheels(dt: number, axleTorque: number): void {
    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      const drive = c.cfg.front ? axleTorque * 0.5 : 0;
      let w = c.omega + ((drive + this.extTorque[i]) / this.wheelInertia) * dt;

      // A brake can only ever take speed out of a wheel. Letting it drive one
      // backwards through zero in a single step is the classic way to make a
      // stopped car shiver, and it is also how a locked wheel ends up exactly
      // stopped — which is what kills the steering, correctly, on a car with
      // no ABS.
      const dw = (this.brakeTorque[i] / this.wheelInertia) * dt;
      if (Math.abs(w) <= dw) w = 0;
      else w -= Math.sign(w) * dw;
      c.omega = finite(w);
    }
  }

  private updateBrakeTorques(input: ControlInput): void {
    const pedal = clamp01(finite(input.brake));
    const hand = clamp01(finite(input.handbrake));

    const front = BRAKES.maxTorqueFront * pedal * 0.5;
    const rearFull = BRAKES.maxTorqueRear;
    const knee = rearFull * REGULATOR_KNEE;
    let rearDemand = rearFull * pedal;
    if (rearDemand > knee) rearDemand = knee + (rearDemand - knee) * REGULATOR_SLOPE;
    const rear = rearDemand * 0.5 + BRAKES.handbrakeTorque * hand * 0.5;

    this.brakeTorque[FL] = front;
    this.brakeTorque[FR] = front;
    this.brakeTorque[RL] = rear;
    this.brakeTorque[RR] = rear;
  }

  // --- aerodynamics ---------------------------------------------------------

  private applyAero(): void {
    const v2 = this.vel.lengthSq();
    if (v2 < 1e-6) return;
    const q = 0.5 * AIR_DENSITY * BODY.dragCoefficient * BODY.frontalArea * Math.sqrt(v2);
    this.forceAcc.addScaledVector(this.vel, -q);
  }

  // --- steering -------------------------------------------------------------

  private updateSteering(dt: number, input: ControlInput, speed: number): void {
    const sf = smoothstep(3, 38, Math.abs(speed));
    const lock = MAX_STEER * lerp(1, LOCK_AT_SPEED, sf);
    const target = clamp(finite(input.steer), -1, 1) * lock;

    // The rack has mass and the tyres resist it, so the road wheels arrive a
    // little after the driver does. Coming back to centre is quicker than
    // going out to lock, because self-aligning torque is doing the work — and
    // it gets quicker with speed, because that torque rises with speed.
    const returning = Math.abs(target) < Math.abs(this.steerAngle);
    const tau = returning ? lerp(RACK_TAU_SLOW, RACK_TAU_FAST, sf) : RACK_TAU_SLOW;
    const wanted = approach(this.steerAngle, target, tau, dt);
    this.steerAngle = finite(moveTowards(this.steerAngle, wanted, RACK_RATE, dt));

    this.corners[FL].steer = ackermann(this.steerAngle, true);
    this.corners[FR].steer = ackermann(this.steerAngle, false);
  }

  // --- rigid body -----------------------------------------------------------

  private integrateBody(dt: number): void {
    this.vel.addScaledVector(this.forceAcc, dt / this.mass);
    this.pos.addScaledVector(this.vel, dt);

    // Angular, in the body frame where the inertia tensor is diagonal.
    qTmp.copy(this.quat).invert();
    const tBody = vTmpA.copy(this.torqueAcc).applyQuaternion(qTmp);
    const wBody = vTmpB.copy(this.spin).applyQuaternion(qTmp);
    const I = this.inertia;
    // Gyroscopic coupling. Small on a car, but it is part of why a car that is
    // yawing and rolling at once feels like one object rather than two.
    vTmpC.set(wBody.x * I.x, wBody.y * I.y, wBody.z * I.z).cross(wBody);
    wBody.x += ((tBody.x + vTmpC.x) / I.x) * dt;
    wBody.y += ((tBody.y + vTmpC.y) / I.y) * dt;
    wBody.z += ((tBody.z + vTmpC.z) / I.z) * dt;
    this.spin.copy(wBody).applyQuaternion(this.quat);

    // q += 0.5 * (omega as a pure quaternion) * q * dt
    qTmp.set(this.spin.x * dt * 0.5, this.spin.y * dt * 0.5, this.spin.z * dt * 0.5, 0)
      .multiply(this.quat);
    this.quat.set(
      this.quat.x + qTmp.x, this.quat.y + qTmp.y,
      this.quat.z + qTmp.z, this.quat.w + qTmp.w,
    ).normalize();

    vTmpA.copy(this.vel).sub(this.lastVel).multiplyScalar(1 / dt);
    this.lastVel.copy(this.vel);
    this.accelFiltered.lerp(vTmpA, clamp01(1 - Math.exp(-dt / 0.055)));

    this.guard();
  }

  /**
   * One divide by zero anywhere in a vehicle model reaches the transform within
   * a frame and the car vanishes. Everything upstream goes through `finite()`;
   * this is the last line, and it counts how often it fires so the self-test
   * can fail a model that only *looks* stable.
   */
  private guard(): void {
    const ok = Number.isFinite(this.pos.x + this.pos.y + this.pos.z)
      && Number.isFinite(this.vel.x + this.vel.y + this.vel.z)
      && Number.isFinite(this.spin.x + this.spin.y + this.spin.z)
      && Number.isFinite(this.quat.x + this.quat.y + this.quat.z + this.quat.w);
    if (ok) return;
    this.nanTrips++;
    this.pos.set(finite(this.pos.x), CG_HEIGHT, finite(this.pos.z, -CG_TO_FRONT));
    this.vel.set(0, 0, 0);
    this.spin.set(0, 0, 0);
    this.quat.identity();
    this.accelFiltered.set(0, 0, 0);
    this.lastVel.set(0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // State and scene
  // -------------------------------------------------------------------------

  private publish(input: ControlInput): void {
    const s = this.state;
    const pt = this.powertrain;

    qTmp.copy(this.quatPrev).slerp(this.quat, this.alpha);
    eTmp.setFromQuaternion(qTmp, 'YXZ');
    vFwd.set(0, 0, 1).applyQuaternion(qTmp);
    vRight.set(1, 0, 0).applyQuaternion(qTmp);
    vUp.set(0, 1, 0).applyQuaternion(qTmp);

    s.speed = finite(this.vel.dot(vFwd));
    s.velocity.copy(this.vel);
    s.engineRpm = finite(pt.rpm, ENGINE.idleRpm);
    s.gear = pt.gear;
    s.throttle = clamp01(finite(input.throttle));
    s.brake = clamp01(finite(input.brake));
    s.clutch = clamp01(finite(input.clutch));
    s.handbrake = clamp01(finite(input.handbrake));
    s.steerAngle = this.steerAngle;

    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      s.wheelSpin[i] = finite(c.omega);
      s.wheelSlip[i] = finite(c.slip);
      s.suspensionCompression[i] = lerp(c.compPrev, c.compCurr, this.alpha);
      s.wheelContact[i] = c.contact;
    }

    // Nose-up positive; right-side-down positive; yaw rate positive to the
    // left — all three matching `steerAngle`, which is positive to the left.
    s.pitch = finite(-eTmp.x);
    s.roll = finite(-eTmp.z);
    s.yawRate = finite(-this.spin.dot(vUp));

    // `gForce` is a Vector2 and its axes are not self-describing, so: **x is
    // lateral**, positive to the car's right, which is what `CameraRig`'s chase
    // lean reads; **y is longitudinal**, positive under acceleration and
    // negative under braking. Both in g, and both low-passed — the raw
    // per-step figure is spiky enough to make a chase camera seasick.
    s.gForce.set(
      finite(this.accelFiltered.dot(vRight) / GRAVITY),
      finite(this.accelFiltered.dot(vFwd) / GRAVITY),
    );

    // Lamps. Switch positions are resolved by the input module; brake and
    // reverse are ours, because they come from pedal travel and the gear.
    // A throw in here blanks the whole page, so the switch block is read
    // defensively: `input.lights` is non-optional in the contract, but the
    // physics loop is not the place to find out that it was not supplied.
    const l = s.lights;
    const src = input.lights ?? l;
    l.low = src.low;
    l.high = src.high;
    l.hazard = src.hazard;
    l.indicator = src.indicator;
    l.fog = src.fog;
    l.brake = s.brake > 0.05 || s.handbrake > 0.35;
    l.reverse = pt.gear === REVERSE && pt.running;

    s.wipers = input.wiperLevel ?? 0;
    s.engineRunning = pt.running;
    s.odometer = this.odometerM;
  }

  /**
   * `car.root` carries position and heading; `car.body` carries pitch and roll
   * about the centre of gravity. See the module header for the derivation of
   * the body offset — rotating the sprung mass about the model origin instead
   * would swing the tail through the road.
   */
  private applyToScene(): void {
    const car = this.car;
    if (!car) return;

    vTmpA.copy(this.posPrev).lerp(this.pos, this.alpha);
    qTmp.copy(this.quatPrev).slerp(this.quat, this.alpha);
    eTmp.setFromQuaternion(qTmp, 'YXZ');

    car.root.quaternion.setFromAxisAngle(vTmpB.set(0, 1, 0), eTmp.y);
    car.root.position.copy(vTmpA).sub(vTmpC.copy(this.cgLocal).applyQuaternion(car.root.quaternion));

    eTmp.set(eTmp.x, 0, eTmp.z, 'XYZ');
    car.body.quaternion.setFromEuler(eTmp);
    car.body.position.copy(this.cgLocal)
      .sub(vTmpB.copy(this.cgLocal).applyQuaternion(car.body.quaternion));
  }

  // -------------------------------------------------------------------------

  /**
   * Reviewer hooks, the same pattern `car/lights.ts` uses. Nothing in the
   * shipped path depends on these.
   *
   *   __AUDI_PHYS.gearbox('manual')
   *   __AUDI_PHYS.debug()
   */
  private installDebugHooks(): void {
    (globalThis as Record<string, unknown>).__AUDI_PHYS = {
      sim: this,
      gearbox: (m: GearboxMode): void => this.setGearbox(m),
      reset: (): void => this.reset(),
      debug: (): Record<string, unknown> => ({
        mode: this.powertrain.mode,
        gear: this.powertrain.gear,
        rpm: Math.round(this.powertrain.rpm),
        engagement: +this.powertrain.engagement.toFixed(3),
        converterSlip: +this.powertrain.converterSlip.toFixed(3),
        axleTorque: Math.round(this.powertrain.axleTorque),
        kmh: +(this.state.speed * 3.6).toFixed(1),
        fz: this.corners.map((c) => Math.round(c.fz)),
        compression: this.corners.map((c) => +c.x.toFixed(4)),
        slip: this.corners.map((c) => +c.slip.toFixed(3)),
        pitchDeg: +((this.state.pitch * 180) / Math.PI).toFixed(2),
        rollDeg: +((this.state.roll * 180) / Math.PI).toFixed(2),
        nanRecoveries: this.nanTrips,
      }),
    };
  }
}

/** Has the driver actually done anything yet? */
function driverPresent(i: ControlInput): boolean {
  return i.throttle > WAKE_THRESHOLD || i.brake > WAKE_THRESHOLD
    || Math.abs(i.steer) > WAKE_THRESHOLD || i.handbrake > WAKE_THRESHOLD
    || i.shiftUp || i.shiftDown;
}

/**
 * Ackermann. The inner wheel has to turn further than the outer or the front
 * tyres scrub against each other through every car-park manoeuvre; real racks
 * only get part of the way there, hence `STEERING.ackermann`.
 *
 * This deliberately duplicates the geometry in `car/wheels.ts`: that function
 * is not exported and the wheel meshes belong to another stream. Both read the
 * same spec constants, so the two cannot drift apart silently.
 */
function ackermann(delta: number, isLeftWheel: boolean): number {
  const mag = Math.abs(delta);
  if (mag < 1e-4) return delta;
  const L = BODY.wheelbase;
  const half = BODY.trackFront / 2;
  const turnRadius = L / Math.tan(mag);
  const inner = Math.atan(L / Math.max(turnRadius - half, L * 0.08));
  const outer = Math.atan(L / (turnRadius + half));
  const k = STEERING.ackermann;
  const isInner = delta > 0 ? isLeftWheel : !isLeftWheel;
  const target = isInner ? mag + (inner - mag) * k : mag + (outer - mag) * k;
  return Math.sign(delta) * target;
}

/** Smoothed direction of rotation, so a stopped wheel does not buzz. */
function brakeSign(omega: number): number {
  return clamp(omega / 0.15, -1, 1);
}

export { REVERSE, NEUTRAL };
export type { GearboxMode };

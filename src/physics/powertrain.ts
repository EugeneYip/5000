/**
 * Engine, clutch / torque converter, gearbox and final drive.
 *
 * The whole torque path from the crankshaft to the front axle lives here. The
 * vehicle model owns the wheels; this module owns everything upstream of them
 * and hands back one number — the torque delivered to the front axle.
 *
 * ## Why the clutch is solved implicitly
 *
 * A friction clutch joining two inertias is a stiff constraint. Modelled as a
 * spring-damper it either rings at a few hundred hertz or needs a timestep
 * nobody can afford; modelled as pure Coulomb friction it chatters around the
 * lock point and the engine speed buzzes. So instead the torque that would
 * *exactly* synchronise the two shafts over this timestep is solved for in
 * closed form, then clamped to the clutch's friction capacity. Below capacity
 * the clutch is rigid and unconditionally stable; above it, it slips. That is
 * both the physically correct behaviour and the numerically robust one.
 *
 * The reflected driveline inertia deliberately does *not* include the vehicle
 * mass: the wheels are free bodies integrated by `VehicleSim`, and it is the
 * tyre's longitudinal force that resists them. That force enters here as
 * `extTorque*`, which is why the sync torque comes out right in first gear —
 * where the engine's own rotational inertia is worth ~500 kg of extra vehicle
 * mass and is the single biggest reason this car is not quicker than it is.
 *
 * ## Two gearboxes, because the car came with two
 *
 * The US 5000 S was sold with the 016/AAZ five-speed (`TRANSMISSION`, 3.889
 * final) and with a **three**-speed automatic, the VAG 087 — 2.71 / 1.50 /
 * 1.00, reverse 2.43, final drive 3.25 (docs/REFERENCE-VEHICLE.md §3.5, read
 * off the 1987 factory brochure p.16). Those automatic ratios are not in
 * `src/spec.ts`; they belong there and the stream report says so. Until they
 * move, `AUTOMATIC` below is the single place they are written down.
 *
 * The automatic is a genuine fluid coupling — no lock-up clutch, because a
 * 1983-88 087 does not have one. That is why it creeps at idle, why it is
 * 1.8 s slower to 60 than the manual, and why its top speed is 2 mph down:
 * the converter is still slipping a few per cent at 120 mph.
 */

import { ENGINE, TRANSMISSION, engineTorque } from '@/spec';
import { clamp, clamp01, finite, lerp, smoothstep, RADS_TO_RPM, RPM_TO_RADS } from './math';

export type GearboxMode = 'manual' | 'automatic';

/** `gear` in `VehicleState`: −1 reverse, 0 neutral, 1..n forward. */
export const REVERSE = -1;
export const NEUTRAL = 0;

/**
 * VAG 087 three-speed automatic. See the module header for the source; these
 * numbers want to live in `src/spec.ts` next to `TRANSMISSION`.
 *
 * `efficiency` is below the manual's 0.90 because a period automatic drags an
 * ATF pump and three brake bands around with it whatever gear it is in. The
 * converter's own slip loss is modelled separately and is not in this figure.
 */
export const AUTOMATIC = {
  gearRatios: [2.71, 1.5, 1.0],
  reverseRatio: 2.43,
  finalDrive: 3.25,
  efficiency: 0.89,
  /** Parasitic pump/band drag at the input shaft, N·m per rad/s of engine speed. */
  pumpDrag: 0.009,
  shiftTime: 0.55,
} as const;

// ---------------------------------------------------------------------------
// Torque converter
// ---------------------------------------------------------------------------

/**
 * Stall torque ratio. Period three-element converters run 1.9-2.2; the higher
 * the number the softer and more "slushy" the car feels off the line.
 */
const TC_STALL_RATIO = 2.05;
/** Speed ratio at which multiplication is used up and the unit is a coupling. */
const TC_COUPLING = 0.86;
/**
 * Capacity constant, N·m per (rad/s)². Set from a stall speed: at zero turbine
 * speed and wide-open throttle the converter absorbs exactly the engine's
 * torque at `TC_STALL_RPM`, so that is the speed the engine flares to against
 * the brakes. 1900 rpm is a fairly tight unit, which is what a 2.3 litre family
 * estate got — a looser one would launch harder and cost more top speed, and
 * the factory's 122 mph claim does not leave room for it.
 */
const TC_STALL_RPM = 1900;
const TC_K = engineTorque(TC_STALL_RPM) / (TC_STALL_RPM * RPM_TO_RADS) ** 2;

/** Torque multiplication as a function of speed ratio. */
function converterRatio(sr: number): number {
  return 1 + (TC_STALL_RATIO - 1) * clamp01(1 - sr / TC_COUPLING);
}

/**
 * Capacity shape: how much torque the impeller can shed at a given speed ratio.
 *
 * The exponent is what sets cruise slip, and it matters more than it looks. A
 * square law collapses the capacity so fast near the coupling point that the
 * unit has to sit at 6-7 % slip just to pass cruise torque, which costs the
 * car four miles an hour of top speed it is supposed to have. Real K-factor
 * curves are flatter than that; 3.5 puts steady-state slip at 3-4 %, which is
 * what a period converter actually does.
 *
 * Past unity it goes negative, which is how a converter passes engine braking
 * back — weakly, which is why an automatic coasts so much further than a
 * manual in gear.
 */
const TC_EXPONENT = 3.5;

function converterCapacity(sr: number): number {
  if (sr <= 0) return 1;
  const s = Math.min(sr, 1.6);
  return clamp(1 - s ** TC_EXPONENT, -1, 1);
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Below this the engine has stopped turning over and dies. */
const STALL_RPM = 300;
/** Cranking torque from the starter motor, N·m. */
const STARTER_TORQUE = 145;
/** Cranking speed the starter can sustain unaided. */
const CRANK_RPM = 260;
/** It has to be turning at least this fast to have any chance of firing. */
const CATCH_RPM = 170;
/**
 * How long the key has to be held before it catches. A real engine fires on
 * the first cylinder to see fuel and spark; modelling that properly would mean
 * modelling cam phase, so it is a delay, and 0.45 s is what a warm CIS-E car
 * sounds like.
 */
const CATCH_TIME = 0.45;
/** Fuel cut duration once the limiter trips — long enough to be heard. */
const LIMITER_CUT = 0.055;

/**
 * Idle governor. CIS-E holds idle with an electrically controlled auxiliary
 * air valve, so what it commands is a small extra air bleed, modelled here as
 * throttle.
 *
 * It needs both terms. A pure integrator has no damping of its own and settles
 * into a slow limit cycle — idle wandering between 710 and 800 rpm on a
 * 30-second period, which reads as a car with a sticking idle valve. The
 * proportional term puts the damping ratio at about 0.6.
 *
 * `IDLE_MAX` has to be generous enough to hold idle against a stalled torque
 * converter, which asks for roughly 30 N·m at 820 rpm — otherwise the engine
 * visibly sags every time the car is held on the brake in drive.
 */
const IDLE_P = 0.40;
const IDLE_I = 0.55;
const IDLE_MAX = 0.52;
/**
 * Where the integral starts. Holding 820 rpm against this engine's own
 * friction needs about this much air; starting from zero instead means the
 * tachometer spends the first ten seconds of the page climbing to idle, which
 * a visitor sees and a screenshot catches.
 */
const IDLE_TRIM_REST = 0.15;

/**
 * Tip-in lag, seconds.
 *
 * Bosch CIS-E / KE-Jetronic is **mechanical continuous metering** with an
 * electro-hydraulic pressure actuator — the air-flow sensor plate has to move,
 * the fuel distributor has to follow it, and the mixture arrives some way
 * behind the pedal. docs/REFERENCE-VEHICLE.md §3.2 calls this out explicitly:
 * "expect a soft, slightly laggy tip-in and no injector-cut fuel shutoff on
 * overrun of the modern kind". Closing is quicker than opening, because the
 * plate falls back under its own control pressure.
 *
 * Together with the clutch and input-shaft inertia below this is worth about
 * 0.6 s to 60 mph, and it is the difference between a car that feels like a
 * 1988 Audi and one that feels like a drive-by-wire hatchback pretending.
 */
const TIP_IN_TAU = 0.15;
const TIP_OUT_TAU = 0.09;

/**
 * Clutch cover, driven plate and gearbox input shaft, kg·m². `ENGINE.inertia`
 * is the crank and flywheel only, and this sits on the same side of the clutch
 * — in first gear it is worth another ~73 kg of car.
 */
const CLUTCH_INERTIA = 0.035;

/**
 * Pumping and friction torque. `ENGINE.frictionConstant/frictionCoeff` describe
 * a motored engine; it is blended out with throttle so that at wide-open
 * throttle the published 190 N·m arrives at the flywheel undiminished — the
 * brochure figure is already a net output and must not be taxed twice.
 */
function frictionTorque(omega: number): number {
  return ENGINE.frictionConstant + ENGINE.frictionCoeff * Math.abs(omega);
}

// ---------------------------------------------------------------------------

export interface DrivelineInput {
  dt: number;
  /** 0..1 driver demand, before the idle governor. */
  throttle: number;
  /** 0..1 clutch pedal travel; 1 is fully depressed. Ignored by the automatic. */
  clutchPedal: number;
  brake: number;
  shiftUp: boolean;
  shiftDown: boolean;
  /** Key position. False switches the engine off. */
  ignition: boolean;
  cranking: boolean;
  /** Front wheel speeds, rad/s. */
  omegaFL: number;
  omegaFR: number;
  /** Everything acting on each front wheel that is not the driveline, N·m. */
  extTorqueFL: number;
  extTorqueFR: number;
  wheelInertia: number;
  /** Forward road speed, m/s. Signed. */
  speed: number;
}

export class Powertrain {
  mode: GearboxMode;

  /** −1 reverse, 0 neutral, 1..n forward. */
  gear = NEUTRAL;
  omegaEngine = ENGINE.idleRpm * RPM_TO_RADS;
  running = true;

  /** 0..1, how much of the clutch's capacity is available right now. */
  engagement = 0;
  /** Torque actually crossing the clutch or converter, N·m. */
  clutchTorque = 0;
  /** Torque delivered to the front axle, N·m. Split evenly by the open diff. */
  axleTorque = 0;
  /** Converter speed ratio, automatic only. 1 would be no slip. */
  converterSlip = 0;
  /** True while a ratio change is in progress. */
  shifting = false;
  /** True while the limiter is cutting fuel. */
  onLimiter = false;
  /** Governed throttle actually delivered to the engine, 0..1. */
  effectiveThrottle = 0;

  /** Impeller reaction torque the engine actually feels, automatic only. */
  private pumpTorque = 0;
  private shiftTimer = 0;
  private shiftDuration = 0;
  private shiftTarget = NEUTRAL;
  private sinceShift = 9;
  private limiterCut = 0;
  private idleTrim = IDLE_TRIM_REST;
  private idleIntegral = IDLE_TRIM_REST;
  private crankTime = 0;
  /** Mixture actually reaching the cylinders, behind the pedal by `TIP_IN_TAU`. */
  private metered = IDLE_TRIM_REST;
  private prevUp = false;
  private prevDown = false;

  constructor(mode: GearboxMode = 'automatic') {
    this.mode = mode;
  }

  get rpm(): number {
    return this.omegaEngine * RADS_TO_RPM;
  }

  get gearCount(): number {
    return this.mode === 'automatic' ? AUTOMATIC.gearRatios.length : TRANSMISSION.gearRatios.length;
  }

  get efficiency(): number {
    return this.mode === 'automatic' ? AUTOMATIC.efficiency : TRANSMISSION.efficiency;
  }

  /** Gearbox × final drive, signed. Zero in neutral and mid-shift. */
  ratioTotal(gear = this.gear): number {
    if (this.mode === 'automatic') {
      if (gear === REVERSE) return -AUTOMATIC.reverseRatio * AUTOMATIC.finalDrive;
      if (gear <= 0 || gear > AUTOMATIC.gearRatios.length) return 0;
      return AUTOMATIC.gearRatios[gear - 1] * AUTOMATIC.finalDrive;
    }
    if (gear === REVERSE) return -TRANSMISSION.reverseRatio * TRANSMISSION.finalDrive;
    if (gear <= 0 || gear > TRANSMISSION.gearRatios.length) return 0;
    return TRANSMISSION.gearRatios[gear - 1] * TRANSMISSION.finalDrive;
  }

  setMode(mode: GearboxMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.gear = NEUTRAL;
    this.shifting = false;
    this.shiftTimer = 0;
  }

  reset(): void {
    this.omegaEngine = ENGINE.idleRpm * RPM_TO_RADS;
    this.running = true;
    this.gear = NEUTRAL;
    this.engagement = 0;
    this.clutchTorque = 0;
    this.axleTorque = 0;
    this.shifting = false;
    this.shiftTimer = 0;
    this.sinceShift = 9;
    this.limiterCut = 0;
    this.idleTrim = IDLE_TRIM_REST;
    this.idleIntegral = IDLE_TRIM_REST;
    this.crankTime = 0;
    this.metered = IDLE_TRIM_REST;
    this.converterSlip = 0;
  }

  // -------------------------------------------------------------------------

  step(inp: DrivelineInput): number {
    const dt = inp.dt;
    this.sinceShift += dt;

    this.updateSelector(inp);
    if (this.mode === 'automatic') this.updateAutoShift(inp);
    this.advanceShift(dt);

    const engineTorqueNet = this.updateEngine(inp);
    const n = this.ratioTotal();

    const omegaAxle = 0.5 * (finite(inp.omegaFL) + finite(inp.omegaFR));
    const omegaClutch = omegaAxle * n;
    const sumExt = finite(inp.extTorqueFL) + finite(inp.extTorqueFR);

    const clutchTorque = this.mode === 'automatic'
      ? this.converterTorque(inp, omegaClutch, n)
      : this.frictionClutchTorque(inp, engineTorqueNet, omegaClutch, sumExt, n);

    // The converter's own reaction torque on the engine is the pump torque,
    // which is not the same number as the turbine torque it delivers.
    const reaction = this.mode === 'automatic' ? this.pumpTorque : clutchTorque;

    this.omegaEngine += ((engineTorqueNet - reaction) / (ENGINE.inertia + CLUTCH_INERTIA)) * dt;
    if (!Number.isFinite(this.omegaEngine)) this.omegaEngine = ENGINE.idleRpm * RPM_TO_RADS;
    // An engine cannot be driven backwards through its own clutch.
    if (this.omegaEngine < 0) this.omegaEngine = 0;
    if (this.running && this.rpm < STALL_RPM && !inp.cranking) this.running = false;

    this.clutchTorque = clutchTorque;
    this.axleTorque = finite(clutchTorque * n * this.efficiency);
    return this.axleTorque;
  }

  // --- engine ---------------------------------------------------------------

  private updateEngine(inp: DrivelineInput): number {
    const rpm = this.rpm;

    if (!inp.ignition) this.running = false;
    if (this.running || !inp.cranking || !inp.ignition) this.crankTime = 0;
    else {
      this.crankTime += inp.dt;
      if (this.crankTime > CATCH_TIME && rpm > CATCH_RPM) this.running = true;
    }

    if (rpm > ENGINE.limiterRpm) this.limiterCut = LIMITER_CUT;
    this.limiterCut = Math.max(0, this.limiterCut - inp.dt);
    this.onLimiter = this.limiterCut > 0;

    // Idle governor. `near` is full authority at and below idle and releases
    // it by about 2200 rpm; it gates the output as well as the integral, so
    // the trim the integral converges on is the trim the engine actually gets.
    const err = (ENGINE.idleRpm - rpm) / ENGINE.idleRpm;
    const near = smoothstep(ENGINE.idleRpm + 1400, ENGINE.idleRpm + 250, rpm);
    const authority = near * (1 - clamp01(inp.throttle * 5));
    this.idleIntegral = clamp(this.idleIntegral + err * IDLE_I * authority * inp.dt, 0, IDLE_MAX);
    this.idleTrim = clamp((this.idleIntegral + err * IDLE_P) * authority, 0, IDLE_MAX);

    const demand = clamp01(Math.max(inp.throttle, this.running ? this.idleTrim : 0));
    const tau = demand > this.metered ? TIP_IN_TAU : TIP_OUT_TAU;
    this.metered += (demand - this.metered) * clamp01(1 - Math.exp(-inp.dt / tau));
    let th = this.metered;
    if (this.onLimiter) th = 0;
    this.effectiveThrottle = th;

    if (!this.running) {
      const drag = -frictionTorque(this.omegaEngine) * 0.55;
      return inp.cranking && inp.ignition
        ? drag + STARTER_TORQUE * smoothstep(CRANK_RPM * 1.6, CRANK_RPM * 0.2, rpm)
        : drag;
    }

    // Full throttle must deliver the published curve untaxed; closed throttle
    // must deliver pure motoring drag. Blend between the two.
    return engineTorque(rpm) * th - frictionTorque(this.omegaEngine) * (1 - th);
  }

  // --- friction clutch (manual) --------------------------------------------

  private frictionClutchTorque(
    inp: DrivelineInput, engineNet: number, omegaClutch: number, sumExt: number, n: number,
  ): number {
    const engagement = this.manualEngagement(inp, omegaClutch);
    this.engagement = engagement;
    if (n === 0 || engagement < 1e-3) return 0;

    const Ie = ENGINE.inertia + CLUTCH_INERTIA;
    // Reflected driveline inertia at the clutch output. Two wheels through an
    // open differential behave as one shaft turning at their average speed.
    const Id = (2 * inp.wheelInertia) / (n * n * this.efficiency);
    const aE = engineNet / Ie;
    const aD = (n * sumExt) / (2 * inp.wheelInertia);
    const mu = (Ie * Id) / (Ie + Id);

    const sync = ((this.omegaEngine - omegaClutch) / inp.dt + aE - aD) * mu;
    const cap = TRANSMISSION.clutchTorqueCapacity * engagement;
    return clamp(finite(sync), -cap, cap);
  }

  /**
   * How much clutch the driver has. Three things close it: the pedal, a shift
   * in progress, and the auto-clutch that stands in for a driver's left foot —
   * without which a keyboard would stall the car at every junction.
   */
  private manualEngagement(inp: DrivelineInput, omegaClutch: number): number {
    if (this.gear === NEUTRAL) return 0;
    const pedal = 1 - clamp01(inp.clutchPedal);
    const gate = this.shiftGate();

    const syncRpm = Math.abs(omegaClutch) * RADS_TO_RPM;
    // Above idle-equivalent road speed the clutch is simply home.
    const rolling = smoothstep(ENGINE.idleRpm * 0.32, ENGINE.idleRpm * 0.95, syncRpm);
    // Below it, the driver slips it against engine speed to pull away.
    const flare = smoothstep(ENGINE.idleRpm * 0.95, ENGINE.idleRpm * 1.9, this.rpm);
    const launch = flare * smoothstep(0.015, 0.3, inp.throttle);

    return Math.min(pedal, gate, Math.max(rolling, launch));
  }

  // --- torque converter (automatic) ----------------------------------------

  private converterTorque(inp: DrivelineInput, omegaClutch: number, n: number): number {
    const we = Math.max(this.omegaEngine, 1e-3);
    const sr = n === 0 ? 1 : clamp(omegaClutch / we, -1.5, 1.6);
    this.converterSlip = sr;

    // Drive-band and ATF-pump drag are there whatever the selector says: it is
    // what a period slushbox costs you before it has done any work.
    const parasitic = AUTOMATIC.pumpDrag * we;

    if (n === 0) {
      this.engagement = 0;
      // In neutral the impeller still churns fluid but nothing comes out.
      this.pumpTorque = parasitic + TC_K * we * we * 0.12;
      return 0;
    }

    const gate = this.shiftGate();
    this.engagement = gate;
    const cap = converterCapacity(sr);
    const tr = sr >= 1 ? 1 : converterRatio(Math.max(sr, 0));
    // Whatever the turbine is not taking, the impeller does not feel either.
    this.pumpTorque = finite(parasitic + TC_K * we * we * cap * lerp(0.12, 1, gate));
    return finite(TC_K * we * we * cap * tr * gate);
  }

  // --- shifting -------------------------------------------------------------

  /** 0 while the ratio is in transit, 1 when drive is fully restored. */
  private shiftGate(): number {
    if (!this.shifting) return 1;
    const k = 1 - this.shiftTimer / Math.max(this.shiftDuration, 1e-3);
    // Out fast, back in progressively — a shift you can feel but not trip over.
    return k < 0.55 ? 0 : smoothstep(0.55, 1, k);
  }

  private advanceShift(dt: number): void {
    if (!this.shifting) return;
    const prev = this.shiftTimer;
    this.shiftTimer -= dt;
    const half = this.shiftDuration * 0.45;
    if (prev > half && this.shiftTimer <= half) this.gear = this.shiftTarget;
    if (this.shiftTimer <= 0) {
      this.shifting = false;
      this.shiftTimer = 0;
      this.gear = this.shiftTarget;
      this.sinceShift = 0;
    }
  }

  private beginShift(target: number, up: boolean): void {
    if (this.shifting || target === this.gear) return;
    this.shiftTarget = target;
    this.shiftDuration = this.mode === 'automatic'
      ? AUTOMATIC.shiftTime
      : (up ? TRANSMISSION.shiftTimeUp : TRANSMISSION.shiftTimeDown);
    this.shiftTimer = this.shiftDuration;
    this.shifting = true;
  }

  /** Driver-commanded ratio changes and selector moves. */
  private updateSelector(inp: DrivelineInput): void {
    const up = inp.shiftUp && !this.prevUp;
    const down = inp.shiftDown && !this.prevDown;
    this.prevUp = inp.shiftUp;
    this.prevDown = inp.shiftDown;
    if (!up && !down) return;

    const stopped = Math.abs(inp.speed) < 1.6;

    if (this.mode === 'automatic') {
      // The selector, not the gearbox: R - N - D, and only at a standstill.
      if (!stopped) return;
      if (down) this.gear = this.gear > 0 ? NEUTRAL : REVERSE;
      else this.gear = this.gear === REVERSE ? NEUTRAL : 1;
      this.shifting = false;
      this.shiftTimer = 0;
      return;
    }

    if (up) {
      if (this.gear === REVERSE) { if (stopped) this.gear = NEUTRAL; return; }
      if (this.gear === NEUTRAL) { this.beginShift(1, true); return; }
      if (this.gear < this.gearCount) this.beginShift(this.gear + 1, true);
    } else {
      if (this.gear === REVERSE) return;
      if (this.gear === NEUTRAL) { if (stopped) this.gear = REVERSE; return; }
      if (this.gear > 1) this.beginShift(this.gear - 1, false);
      else if (stopped) this.gear = NEUTRAL;
    }
  }

  /**
   * Automatic shift schedule.
   *
   * Thresholds move with throttle: lift off and it changes up at 2300 rpm and
   * stays there; bury it and it holds to just short of the power peak. The
   * downshift guard is what stops a three-speed hunting — a change down is only
   * allowed if the gear below would not immediately want to change back up.
   */
  private updateAutoShift(inp: DrivelineInput): void {
    if (this.shifting || this.gear <= 0 || this.sinceShift < 0.6) return;

    const load = clamp01(inp.throttle);
    const shaped = load * load * (3 - 2 * load);
    const upRpm = lerp(2280, 5750, shaped);
    const downRpm = lerp(1080, 4450, shaped);
    const rpm = this.rpm;

    // Never change up while the driver is slowing down: on a period box the
    // governor pressure is already falling, and an upshift on the way into a
    // corner is the one thing a three-speed must not do.
    if (this.gear < this.gearCount && rpm > upRpm && inp.brake < 0.15) {
      this.beginShift(this.gear + 1, true);
      return;
    }
    if (this.gear > 1 && rpm < downRpm) {
      const next = this.ratioTotal(this.gear - 1) / this.ratioTotal(this.gear);
      if (rpm * next < upRpm - 420) this.beginShift(this.gear - 1, false);
    }
  }
}

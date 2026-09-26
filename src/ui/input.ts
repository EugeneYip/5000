/**
 * Driver input: keyboard, gamepad, touch — resolved into one analogue frame.
 *
 * A key is binary and a pedal is not, so nothing here is passed through raw.
 * Throttle, brake and above all steering are rate-limited and curved (see
 * `input/ramp.ts`), and the steering self-centres faster the quicker the car
 * is going, which is what stops keyboard driving feeling like a switch.
 *
 * ## Note for the physics stream
 *
 * The original fields are unchanged and still mean what they did. Everything
 * added below is *resolved switch state*, so the lamps no longer need the
 * `__AUDI_LIGHTS` override to be driven:
 *
 *   state.lights.low  = input.lights.low       state.wipers = input.wiperLevel
 *   state.lights.high = input.lights.high
 *   state.lights.hazard = input.lights.hazard
 *   state.lights.indicator = input.lights.indicator
 *   state.lights.fog  = input.lights.fog
 *
 * `brake` and `reverse` stay yours — they come from pedal travel and gear.
 * The `toggle*` / `indicate*` booleans are still single-frame edges, kept for
 * anyone who would rather latch the state themselves.
 *
 * Sign conventions: `steer` positive = left, matching `VehicleState.steerAngle`.
 * `lights.indicator` is −1 left / +1 right, matching `car/interior/cluster.ts`.
 */

import { Keyboard } from './input/keyboard';
import { GamepadReader } from './input/gamepad';
import { TouchControls } from './input/touch';
import { OrbitInput } from './input/orbit';
import { approach, clamp, lerp, pedalCurve, steerCurve, speedFactor, RATES } from './input/ramp';
import { latestState } from './rigLink';

export interface ControlInput {
  throttle: number; brake: number; steer: number; handbrake: number; clutch: number;
  shiftUp: boolean; shiftDown: boolean;
  toggleLights: boolean; toggleHigh: boolean; indicateLeft: boolean; indicateRight: boolean;
  horn: boolean; starter: boolean; wiper: boolean;

  /** Resolved switch state — copy straight onto `VehicleState.lights`. */
  lights: { low: boolean; high: boolean; hazard: boolean; indicator: -1 | 0 | 1; fog: boolean };
  /** Resolved wiper stalk position, matching `VehicleState.wipers`. */
  wiperLevel: 0 | 1 | 2 | 3;
  /** Key position: false means the driver has switched the engine off. */
  ignition: boolean;
  /** True while the starter is being cranked. */
  cranking: boolean;
  /** Single-frame request to put the car back where it started. */
  reset: boolean;
}

function neutralInput(): ControlInput {
  return {
    throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0,
    shiftUp: false, shiftDown: false,
    toggleLights: false, toggleHigh: false, indicateLeft: false, indicateRight: false,
    horn: false, starter: false, wiper: false,
    lights: { low: false, high: false, hazard: false, indicator: 0, fog: false },
    wiperLevel: 0,
    ignition: true,
    cranking: false,
    reset: false,
  };
}

const NEUTRAL: ControlInput = neutralInput();

let active: InputController | null = null;

/** The live controller, for UI that needs to flip the same switches. */
export function activeInput(): InputController | null {
  return active;
}

/** Last frame's resolved input — read by the HUD tell-tales and by the audio. */
export function latestControls(): ControlInput {
  return active?.current ?? NEUTRAL;
}

export class InputController {
  readonly current: ControlInput = neutralInput();

  private keys = new Keyboard();
  private pad = new GamepadReader();
  private touch: TouchControls;
  private orbit: OrbitInput;

  /** Steering-wheel angle, −1…+1, before the response curve. */
  private wheel = 0;
  private rawThrottle = 0;
  private rawBrake = 0;
  private handbrakeVal = 0;
  private clutchVal = 0;
  private indicatorSince = 0;
  private indicatorArmed = false;
  private prevPadStarter = false;

  /** True once the driver has actually done something. */
  driverActive = false;

  constructor(el: HTMLElement) {
    this.touch = new TouchControls(el);
    this.orbit = new OrbitInput(el);
    active = this;
  }

  // --- switchgear, also callable from the HUD panel --------------------------

  toggleLights(): void {
    const l = this.current.lights;
    l.low = !l.low;
    if (!l.low) l.high = false;
  }

  toggleHighBeam(): void {
    const l = this.current.lights;
    l.high = !l.high;
    if (l.high) l.low = true;
  }

  toggleFog(): void {
    const l = this.current.lights;
    l.fog = !l.fog;
    if (l.fog) l.low = true;
  }

  toggleHazard(): void {
    const l = this.current.lights;
    l.hazard = !l.hazard;
    if (l.hazard) l.indicator = 0;
  }

  setIndicator(dir: -1 | 0 | 1): void {
    const l = this.current.lights;
    l.indicator = l.indicator === dir ? 0 : dir;
    l.hazard = false;
    this.indicatorArmed = false;
    this.indicatorSince = 0;
  }

  cycleWipers(): void {
    this.current.wiperLevel = ((this.current.wiperLevel + 1) % 4) as 0 | 1 | 2 | 3;
  }

  setWipers(n: 0 | 1 | 2 | 3): void {
    this.current.wiperLevel = n;
  }

  // --- per-frame ------------------------------------------------------------

  sample(dt: number): ControlInput {
    const step = clamp(dt, 0, 0.1);
    const out = this.current;
    const k = this.keys;
    const pad = this.pad.read();
    const touch = this.touch.read();

    const state = latestState();
    const sf = speedFactor(state?.speed ?? 0);

    // --- pedals -------------------------------------------------------------
    const digitalThrottle = k.down('throttle') || touch.throttle > 0;
    const digitalBrake = k.down('brake') || touch.brake > 0;

    this.rawThrottle = approach(
      this.rawThrottle, digitalThrottle ? 1 : 0,
      digitalThrottle ? RATES.throttleRise : RATES.throttleFall, step,
    );
    this.rawBrake = approach(
      this.rawBrake, digitalBrake ? 1 : 0,
      digitalBrake ? RATES.brakeRise : RATES.brakeFall, step,
    );

    // An analogue trigger outranks the ramp: the driver already has resolution.
    out.throttle = Math.max(pedalCurve(this.rawThrottle), pad.throttle);
    out.brake = Math.max(pedalCurve(this.rawBrake), pad.brake);

    const wantHandbrake = k.down('handbrake') || touch.handbrake > 0 || pad.handbrake > 0;
    this.handbrakeVal = approach(
      this.handbrakeVal, wantHandbrake ? 1 : 0,
      wantHandbrake ? RATES.handbrakeRise : RATES.handbrakeFall, step,
    );
    out.handbrake = this.handbrakeVal;

    const wantClutch = k.down('clutch') || pad.clutch > 0;
    this.clutchVal = approach(
      this.clutchVal, wantClutch ? 1 : 0,
      wantClutch ? RATES.clutchRise : RATES.clutchFall, step,
    );
    out.clutch = this.clutchVal;

    // --- steering -----------------------------------------------------------
    out.steer = this.updateSteering(step, sf, pad.steer, touch);

    // --- gearbox ------------------------------------------------------------
    out.shiftUp = k.pressed('shiftUp') || pad.shiftUp || touch.shiftUp;
    out.shiftDown = k.pressed('shiftDown') || pad.shiftDown || touch.shiftDown;

    // --- switchgear ---------------------------------------------------------
    out.toggleLights = k.pressed('lights') || pad.lights;
    out.toggleHigh = k.pressed('highBeam') || pad.highBeam;
    out.indicateLeft = k.pressed('indicateLeft') || pad.indicateLeft;
    out.indicateRight = k.pressed('indicateRight') || pad.indicateRight;
    out.wiper = k.pressed('wipers') || pad.wipers;
    out.reset = k.pressed('reset');

    if (out.toggleLights) this.toggleLights();
    if (out.toggleHigh) this.toggleHighBeam();
    if (out.indicateLeft) this.setIndicator(-1);
    if (out.indicateRight) this.setIndicator(1);
    if (k.pressed('hazard') || pad.hazard) this.toggleHazard();
    if (k.pressed('fog')) this.toggleFog();
    if (out.wiper) this.cycleWipers();

    this.updateIndicatorSelfCancel(out.steer, step);

    out.horn = k.down('horn') || pad.horn || touch.horn;

    // Key: hold to crank when it is off, a tap kills it when it is running.
    const keyHeld = k.down('starter') || pad.starter;
    const keyEdge = k.pressed('starter') || (pad.starter && !this.prevPadStarter);
    this.prevPadStarter = pad.starter;
    if (keyEdge) {
      if (state?.engineRunning && out.ignition) out.ignition = false;
      else out.ignition = true;
    }
    out.cranking = keyHeld && out.ignition && !(state?.engineRunning ?? false);
    out.starter = out.cranking;

    // --- camera -------------------------------------------------------------
    this.orbit.pad(pad.look.x, pad.look.y, pad.zoom, step);

    if (!this.driverActive) {
      this.driverActive = this.keys.touchedControls || this.touch.used || this.pad.seen;
    }
    k.endFrame();
    return out;
  }

  private updateSteering(dt: number, sf: number, padSteer: number, touch: { steer: number; steerHeld: boolean }): number {
    const left = this.keys.down('left');
    const right = this.keys.down('right');
    const digital = (left ? 1 : 0) - (right ? 1 : 0);

    if (padSteer !== 0) {
      // Analogue: track the stick, rate-limited only enough to give the rack
      // some mass. Full lock stays available at any speed.
      const target = -padSteer;
      this.wheel = approach(this.wheel, target, RATES.steerAnalogueRate, dt);
    } else if (touch.steerHeld) {
      this.wheel = approach(this.wheel, -touch.steer, RATES.steerAnalogueRate * 0.75, dt);
    } else if (digital !== 0) {
      // Digital: ramp toward the speed-limited lock. Reversing lock is quicker
      // than applying it, so a correction lands before the slide does.
      const maxLock = lerp(RATES.lockAtRest, RATES.lockAtSpeed, sf);
      let rate = lerp(RATES.steerFast, RATES.steerSlow, sf);
      if (Math.sign(this.wheel) === -digital && this.wheel !== 0) rate *= RATES.counterSteerBoost;
      this.wheel = approach(this.wheel, digital * maxLock, rate, dt);
    } else {
      // Self-centring. Faster with road speed, as the real rack's
      // self-aligning torque is.
      this.wheel = approach(this.wheel, 0, lerp(RATES.returnSlow, RATES.returnFast, sf), dt);
    }

    this.wheel = clamp(this.wheel, -1, 1);
    return steerCurve(this.wheel);
  }

  /** Indicators cancel themselves once the wheel comes back through centre. */
  private updateIndicatorSelfCancel(steer: number, dt: number): void {
    const l = this.current.lights;
    if (l.indicator === 0) { this.indicatorArmed = false; return; }
    this.indicatorSince += dt;
    if (this.indicatorSince < 0.6) return;
    const turned = Math.sign(steer) === l.indicator * -1 && Math.abs(steer) > 0.2;
    if (turned) this.indicatorArmed = true;
    else if (this.indicatorArmed && Math.abs(steer) < 0.05) {
      l.indicator = 0;
      this.indicatorArmed = false;
    }
  }

  neutral(): ControlInput {
    return neutralInput();
  }
}

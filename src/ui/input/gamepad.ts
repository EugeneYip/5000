/**
 * Gamepad API reader — standard mapping.
 *
 * Triggers are read as analogue values, not as buttons, so a pad gives the
 * progressive throttle and brake a keyboard has to fake. Steering comes off
 * the left stick with a radial deadzone and the same expo curve the rest of
 * the input path uses, so pad and keyboard feel like the same car.
 */

import { axisCurve } from './ramp';

export interface PadSnapshot {
  connected: boolean;
  /** −1 (left) … +1 (right), already deadzoned and curved. */
  steer: number;
  throttle: number;
  brake: number;
  handbrake: number;
  clutch: number;
  shiftUp: boolean;
  shiftDown: boolean;
  horn: boolean;
  starter: boolean;
  lights: boolean;
  highBeam: boolean;
  wipers: boolean;
  indicateLeft: boolean;
  indicateRight: boolean;
  hazard: boolean;
  /** Right stick, for orbiting the camera from the pad. */
  look: { x: number; y: number };
  zoom: number;
}

const EMPTY: PadSnapshot = {
  connected: false, steer: 0, throttle: 0, brake: 0, handbrake: 0, clutch: 0,
  shiftUp: false, shiftDown: false, horn: false, starter: false,
  lights: false, highBeam: false, wipers: false,
  indicateLeft: false, indicateRight: false, hazard: false,
  look: { x: 0, y: 0 }, zoom: 0,
};

/** Some pads report triggers as axes rather than analogue buttons. */
function trigger(pad: Gamepad, buttonIndex: number, axisIndex: number): number {
  const b = pad.buttons[buttonIndex];
  if (b && (b.value > 0.001 || b.pressed)) return Math.max(b.value, b.pressed ? 1 : 0);
  const a = pad.axes[axisIndex];
  // Axis triggers idle at −1 and reach +1 at full travel.
  if (typeof a === 'number' && a > -0.999) return (a + 1) / 2;
  return 0;
}

function pressed(pad: Gamepad, i: number): boolean {
  return pad.buttons[i]?.pressed === true;
}

export class GamepadReader {
  private prev: boolean[] = [];
  private snapshot: PadSnapshot = { ...EMPTY, look: { x: 0, y: 0 } };
  /** Set the first time a pad actually moves, so the HUD can hint at it. */
  seen = false;

  read(): PadSnapshot {
    const pads = navigator.getGamepads?.() ?? [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }

    const s = this.snapshot;
    if (!pad) {
      Object.assign(s, EMPTY);
      s.look = { x: 0, y: 0 };
      this.prev.length = 0;
      return s;
    }

    s.connected = true;
    s.steer = axisCurve(pad.axes[0] ?? 0);
    s.throttle = trigger(pad, 7, 5);
    s.brake = trigger(pad, 6, 4);
    s.handbrake = pressed(pad, 0) ? 1 : 0;
    s.clutch = pressed(pad, 10) ? 1 : 0;
    s.look = { x: axisCurve(pad.axes[2] ?? 0, 0.14), y: axisCurve(pad.axes[3] ?? 0, 0.14) };
    s.zoom = (pressed(pad, 12) ? -1 : 0) + (pressed(pad, 13) ? 1 : 0);

    // Edge-triggered buttons: only true on the frame the button goes down.
    const edge = (i: number): boolean => {
      const now = pressed(pad, i);
      const was = this.prev[i] === true;
      this.prev[i] = now;
      return now && !was;
    };
    s.shiftUp = edge(5);
    s.shiftDown = edge(4);
    s.lights = edge(3);
    s.wipers = edge(2);
    s.highBeam = edge(11);
    s.indicateLeft = edge(14);
    s.indicateRight = edge(15);
    s.hazard = edge(8);
    s.starter = pressed(pad, 9);
    s.horn = pressed(pad, 1);

    if (s.steer !== 0 || s.throttle > 0.02 || s.brake > 0.02) this.seen = true;
    return s;
  }
}

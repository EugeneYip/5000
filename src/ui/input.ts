/**
 * Input — placeholder. Owned by the UI work stream.
 * Keyboard + gamepad + touch. Analogue ramping on steer/throttle/brake so a
 * digital key feels like a pedal, not a switch.
 */
export interface ControlInput {
  throttle: number; brake: number; steer: number; handbrake: number; clutch: number;
  shiftUp: boolean; shiftDown: boolean;
  toggleLights: boolean; toggleHigh: boolean; indicateLeft: boolean; indicateRight: boolean;
  horn: boolean; starter: boolean; wiper: boolean;
}

const NEUTRAL: ControlInput = {
  throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0,
  shiftUp: false, shiftDown: false,
  toggleLights: false, toggleHigh: false, indicateLeft: false, indicateRight: false,
  horn: false, starter: false, wiper: false,
};

export class InputController {
  constructor(_el: HTMLElement) {}
  sample(_dt: number): ControlInput { return { ...NEUTRAL }; }
  neutral(): ControlInput { return { ...NEUTRAL }; }
}

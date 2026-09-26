/**
 * Keyboard state.
 *
 * Bindings are read off `KeyboardEvent.code` so they stay on the same physical
 * keys on AZERTY and QWERTZ. `1`–`6`, `0`, `O`, `P` and `L` are deliberately
 * left alone: `main.ts` binds those to camera poses and articulations.
 */

export const KEYS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  clutch: ['KeyC'],
  shiftUp: ['ShiftLeft', 'ShiftRight'],
  shiftDown: ['ControlLeft', 'ControlRight'],
  lights: ['KeyN'],
  highBeam: ['KeyB'],
  indicateLeft: ['Comma'],
  indicateRight: ['Period'],
  hazard: ['KeyV'],
  fog: ['KeyF'],
  horn: ['KeyH'],
  wipers: ['KeyX'],
  starter: ['KeyK'],
  reset: ['KeyR'],
} as const;

export type KeyAction = keyof typeof KEYS;

/** Held keys that should not also scroll or select the page underneath. */
const SWALLOW = new Set<string>([
  ...KEYS.throttle, ...KEYS.brake, ...KEYS.left, ...KEYS.right, ...KEYS.handbrake,
]);

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

export class Keyboard {
  private held = new Set<string>();
  private edges = new Set<string>();
  /** True once any key has been pressed — used to dismiss the first-run hint. */
  touchedControls = false;

  constructor() {
    window.addEventListener('keydown', this.onDown, { passive: false });
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    if (SWALLOW.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    this.edges.add(e.code);
    this.touchedControls = true;
  };

  private onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  /** Losing focus mid-corner must not leave the throttle pinned. */
  private onBlur = (): void => {
    this.held.clear();
  };

  down(action: KeyAction): boolean {
    for (const code of KEYS[action]) if (this.held.has(code)) return true;
    return false;
  }

  /** True exactly once per physical press. */
  pressed(action: KeyAction): boolean {
    for (const code of KEYS[action]) if (this.edges.has(code)) return true;
    return false;
  }

  /** Call once per sampled frame, after every `pressed()` query. */
  endFrame(): void {
    this.edges.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

/**
 * On-screen driving controls for phones and tablets.
 *
 * This ships on GitHub Pages, so a large share of visitors arrive with no
 * keyboard at all. The layout keeps both thumbs where they naturally rest:
 * a horizontal steering strip bottom-left, pedals bottom-right.
 *
 * Tilt steering is offered but never assumed — iOS requires an explicit
 * permission grant from inside a user gesture, which is why it lives behind
 * its own button.
 */

import { ensureStyles } from '../styles';
import { onUiVisibility } from '../visibility';
import { clamp } from './ramp';

export interface TouchSnapshot {
  active: boolean;
  /** −1 … +1, raw steering-wheel demand from thumb or tilt. */
  steer: number;
  steerHeld: boolean;
  throttle: number;
  brake: number;
  handbrake: number;
  horn: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
}

interface DeviceOrientationCtor {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export class TouchControls {
  private root: HTMLDivElement | null = null;
  private knob: HTMLElement | null = null;
  private pad: HTMLElement | null = null;
  private tiltBtn: HTMLElement | null = null;

  private snap: TouchSnapshot = {
    active: false, steer: 0, steerHeld: false,
    throttle: 0, brake: 0, handbrake: 0, horn: false, shiftUp: false, shiftDown: false,
  };
  private edges = { shiftUp: false, shiftDown: false };
  private held = new Set<string>();
  private steerPointer = -1;
  private tilt = { on: false, zero: 0, value: 0 };
  private uiVisible = true;

  /** True once the user has actually touched something. */
  used = false;

  constructor(private container: HTMLElement) {
    if (this.isTouchLikely()) this.mount();
    else {
      // A hybrid laptop might only reveal itself on the first real touch.
      const once = (e: TouchEvent): void => {
        if (e.touches.length) { this.mount(); window.removeEventListener('touchstart', once); }
      };
      window.addEventListener('touchstart', once, { passive: true });
    }
    onUiVisibility((v) => { this.uiVisible = v; this.applyVisibility(); });
  }

  private isTouchLikely(): boolean {
    return (navigator.maxTouchPoints ?? 0) > 0 && window.matchMedia('(pointer: coarse)').matches;
  }

  private applyVisibility(): void {
    if (this.root) this.root.hidden = !this.uiVisible;
  }

  private mount(): void {
    if (this.root) return;
    ensureStyles();

    const root = document.createElement('div');
    root.className = 'audi-touch';
    root.innerHTML = `
      <div class="audi-pad" data-role="pad">
        <div class="axis"></div><div class="knob"></div><div class="cap">STEER</div>
      </div>
      <div class="audi-aux">
        <button class="audi-pedal small" data-hold="handbrake" aria-label="Handbrake">HAND</button>
        <button class="audi-pedal small" data-hold="horn" aria-label="Horn">HORN</button>
        <button class="audi-pedal small" data-tap="shiftUp" aria-label="Shift up">UP</button>
        <button class="audi-pedal small" data-tap="shiftDown" aria-label="Shift down">DN</button>
        <button class="audi-pedal small" data-role="tilt" aria-label="Tilt steering">TILT</button>
      </div>
      <div class="audi-pedals">
        <div class="audi-pedal" data-hold="brake" role="button" aria-label="Brake">BRAKE</div>
        <div class="audi-pedal" data-hold="throttle" role="button" aria-label="Throttle">GAS</div>
      </div>`;
    this.container.appendChild(root);
    this.root = root;
    this.pad = root.querySelector('[data-role="pad"]');
    this.knob = root.querySelector('.knob');
    this.tiltBtn = root.querySelector('[data-role="tilt"]');
    this.applyVisibility();

    for (const el of root.querySelectorAll<HTMLElement>('[data-hold]')) {
      const name = el.dataset.hold!;
      const down = (e: PointerEvent): void => {
        e.preventDefault();
        this.used = true;
        this.held.add(name);
        el.classList.add('hit');
        el.setPointerCapture?.(e.pointerId);
      };
      const up = (): void => { this.held.delete(name); el.classList.remove('hit'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    for (const el of root.querySelectorAll<HTMLElement>('[data-tap]')) {
      const name = el.dataset.tap as 'shiftUp' | 'shiftDown';
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.used = true;
        this.edges[name] = true;
        el.classList.add('hit');
        setTimeout(() => el.classList.remove('hit'), 110);
      });
    }

    this.tiltBtn?.addEventListener('pointerdown', (e) => { e.preventDefault(); void this.toggleTilt(); });
    this.bindPad();
  }

  private bindPad(): void {
    const pad = this.pad;
    if (!pad) return;
    const move = (e: PointerEvent): void => {
      const r = pad.getBoundingClientRect();
      const half = Math.max(24, r.width / 2 - 30);
      this.snap.steer = clamp((e.clientX - (r.left + r.width / 2)) / half, -1, 1);
      if (this.knob) this.knob.style.transform = `translateX(${this.snap.steer * half}px)`;
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.used = true;
      this.steerPointer = e.pointerId;
      pad.setPointerCapture?.(e.pointerId);
      this.snap.steerHeld = true;
      move(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === this.steerPointer) move(e); });
    const release = (e: PointerEvent): void => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = -1;
      this.snap.steerHeld = false;
      this.snap.steer = 0;
      if (this.knob) this.knob.style.transform = '';
    };
    pad.addEventListener('pointerup', release);
    pad.addEventListener('pointercancel', release);
  }

  private async toggleTilt(): Promise<void> {
    if (this.tilt.on) {
      this.tilt.on = false;
      this.tiltBtn?.classList.remove('hit');
      if (this.pad) this.pad.style.opacity = '';
      return;
    }
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationCtor | undefined;
    if (!ctor) return;
    if (typeof ctor.requestPermission === 'function') {
      try {
        if ((await ctor.requestPermission()) !== 'granted') return;
      } catch { return; }
    }
    this.tilt.on = true;
    this.tilt.zero = Number.NaN;
    this.tiltBtn?.classList.add('hit');
    if (this.pad) this.pad.style.opacity = '0.35';
    window.addEventListener('deviceorientation', this.onOrient);
  }

  private onOrient = (e: DeviceOrientationEvent): void => {
    if (!this.tilt.on) return;
    // Portrait tilt shows up on gamma, landscape on beta; whichever axis the
    // device reports, zero it where the phone was held when tilt was enabled.
    const landscape = Math.abs(window.orientation ?? 0) === 90 || window.innerWidth > window.innerHeight;
    const raw = landscape ? (e.beta ?? 0) : (e.gamma ?? 0);
    const signed = landscape && (window.orientation ?? 0) === -90 ? -raw : raw;
    if (Number.isNaN(this.tilt.zero)) this.tilt.zero = signed;
    this.tilt.value = clamp((signed - this.tilt.zero) / 24, -1, 1);
    this.used = true;
  };

  read(): TouchSnapshot {
    const s = this.snap;
    s.throttle = this.held.has('throttle') ? 1 : 0;
    s.brake = this.held.has('brake') ? 1 : 0;
    s.handbrake = this.held.has('handbrake') ? 1 : 0;
    s.horn = this.held.has('horn');
    s.shiftUp = this.edges.shiftUp;
    s.shiftDown = this.edges.shiftDown;
    this.edges.shiftUp = false;
    this.edges.shiftDown = false;
    if (this.tilt.on) { s.steer = this.tilt.value; s.steerHeld = Math.abs(this.tilt.value) > 0.02; }
    s.active = this.root !== null;
    return s;
  }
}

/**
 * The electrical side: what each filament is doing this frame.
 *
 * Everything here exists to avoid the thing that makes CG lighting look like
 * CG — instant switching. A 21 W bulb takes roughly 80 ms to come up and twice
 * that to die away, and the eye knows it: an indicator that snaps on and off
 * reads as a blinking texture, while one that swells and fades reads as a car.
 * So every channel runs through a first-order thermal lag with a longer time
 * constant falling than rising.
 */

import { LIGHTS } from '@/spec';
import type { VehicleState } from '@/types';

/** One filament's thermal state. */
class Filament {
  level = 0;
  private temp = 0;

  constructor(
    private readonly tauOn: number,
    private readonly tauOff: number,
    /** >1 makes the first part of the rise lazier, as a cold coil is. */
    private readonly lazy = 1,
  ) {}

  step(dt: number, target: number): void {
    const tau = target > this.temp ? this.tauOn : this.tauOff;
    this.temp += (target - this.temp) * (1 - Math.exp(-dt / Math.max(tau, 1e-4)));
    if (this.temp < 1e-4) this.temp = 0;
    this.level = this.lazy === 1 ? this.temp : Math.pow(this.temp, this.lazy);
  }
}

export interface LampState {
  /** Dipped beam output, 0..1. */
  head: number;
  /** How much of `head` is main beam rather than dipped. */
  high: number;
  /** Tail / parking lamps and the side markers. */
  tail: number;
  /** Stop lamps. Shares the tail filament's segment on a dual-filament bulb. */
  brake: number;
  reverse: number;
  indicator: [number, number];
  /** True while the driver has asked for any lamp at all. */
  any: boolean;
}

export class LampChannels {
  readonly state: LampState = {
    head: 0, high: 0, tail: 0, brake: 0, reverse: 0, indicator: [0, 0], any: false,
  };

  private readonly head = new Filament(0.085, 0.135, 1.25);
  private readonly tail = new Filament(0.10, 0.165, 1.2);
  // "Large and instant" — a stop lamp is the one filament that has to snap.
  private readonly brake = new Filament(0.032, 0.070, 1.1);
  private readonly reverse = new Filament(0.055, 0.115, 1.2);
  private readonly ind: [Filament, Filament] = [
    new Filament(0.048, 0.112, 1.3),
    new Filament(0.048, 0.112, 1.3),
  ];
  private high = 0;

  /**
   * True until something actually drives `state.lights`. The input and physics
   * modules are still stubs that leave every flag false for ever, so without a
   * fallback the car would be unlit in every dusk render. See `lights.ts`.
   */
  private driven = false;

  /** Did the vehicle state ever ask for a lamp? Latches on the first `true`. */
  observe(l: VehicleState['lights']): boolean {
    if (!this.driven && (l.low || l.high || l.brake || l.reverse || l.hazard || l.indicator !== 0 || l.fog)) {
      this.driven = true;
    }
    return this.driven;
  }

  step(dt: number, elapsed: number, l: VehicleState['lights'], darkFallback: boolean): LampState {
    const auto = !this.observe(l) && darkFallback;

    const low = l.low || l.high || auto;
    const park = low || l.fog;
    const wantHigh = l.high;

    // 50 % duty at the regulation rate; hazard drives both sides together.
    const flashOn = (elapsed * LIGHTS.indicatorHz) % 1 < 0.5;
    const left = l.hazard || l.indicator === 1;
    const right = l.hazard || l.indicator === -1;

    this.head.step(dt, low ? 1 : 0);
    this.tail.step(dt, park ? 1 : 0);
    this.brake.step(dt, l.brake ? 1 : 0);
    this.reverse.step(dt, l.reverse ? 1 : 0);
    this.ind[0].step(dt, left && flashOn ? 1 : 0);
    this.ind[1].step(dt, right && flashOn ? 1 : 0);
    // Main beam is a relay, not a filament: it swaps which coil is fed.
    this.high += (Math.min(Math.max((wantHigh ? 1 : 0) - this.high, -dt / 0.09), dt / 0.09));
    this.high = Math.min(Math.max(this.high, 0), 1);

    const s = this.state;
    s.head = this.head.level;
    s.high = this.high;
    s.tail = this.tail.level;
    s.brake = this.brake.level;
    s.reverse = this.reverse.level;
    s.indicator[0] = this.ind[0].level;
    s.indicator[1] = this.ind[1].level;
    s.any = s.head + s.tail + s.brake + s.reverse + s.indicator[0] + s.indicator[1] > 0.002;
    return s;
  }
}

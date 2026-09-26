/**
 * AudioContext lifecycle, master bus and listener.
 *
 * Autoplay policy: the context is not constructed until the visitor has
 * actually done something. Until then the whole audio stream costs nothing —
 * which is also why the screenshot harness renders in silence with no extra
 * work on the render thread.
 */

import type * as THREE from 'three';
import { biquad, gain, ramp } from './dsp';

/** Where a sound sits in vehicle-local metres. */
export type Anchor = [number, number, number];

export interface HubOptions {
  onReady?: (hub: AudioHub) => void;
}

const MUTE_KEY = 'audi5000.muted';
const VOL_KEY = 'audi5000.volume';

export class AudioHub {
  ctx: AudioContext | null = null;
  /** Everything in the car connects here. */
  bus: GainNode | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private cabinLp: BiquadFilterNode | null = null;
  private cabinShelf: BiquadFilterNode | null = null;

  private starting: Promise<void> | null = null;
  private listeners = new Set<(hub: AudioHub) => void>();

  muted = false;
  volume = 0.85;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      const v = Number(localStorage.getItem(VOL_KEY));
      if (Number.isFinite(v) && v > 0) this.volume = Math.min(1, v);
    } catch { /* private mode; defaults are fine */ }
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  get created(): boolean {
    return this.ctx !== null;
  }

  onReady(fn: (hub: AudioHub) => void): void {
    if (this.bus) fn(this);
    else this.listeners.add(fn);
  }

  /** Must be called from inside a user gesture the first time. */
  async start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = this.build();
    return this.starting;
  }

  private async build(): Promise<void> {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;

    // A gentle bus compressor. The engine's peak-to-mean ratio at idle is
    // enormous — individual blowdown pulses with near silence between — and
    // without this the whole car has to be mixed for the pulses and is then
    // inaudible at cruise.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -19;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    const master = gain(ctx, 0);
    const bus = gain(ctx, 1);

    // Glass and trim between the listener and the world: a first-order-ish
    // roll-off plus the low-frequency lift a sealed cabin gives. Inert until
    // `setCabin` is called, so an exterior camera pays nothing for it.
    const cabinLp = biquad(ctx, 'lowpass', 20_000, 0.5);
    const cabinShelf = biquad(ctx, 'lowshelf', 110, 0.7, 0);

    bus.connect(cabinLp);
    cabinLp.connect(cabinShelf);
    cabinShelf.connect(comp);
    comp.connect(master);
    master.connect(ctx.destination);

    this.comp = comp;
    this.master = master;
    this.bus = bus;
    this.cabinLp = cabinLp;
    this.cabinShelf = cabinShelf;

    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* the gesture will come round again */ }
    }

    // Fade in rather than appearing: a context that starts at full gain
    // mid-pulse clicks.
    ramp(master.gain, this.muted ? 0 : this.volume, 0.25);

    document.addEventListener('visibilitychange', this.onVisibility);

    for (const fn of this.listeners) fn(this);
    this.listeners.clear();
  }

  private onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (!this.muted) void ctx.resume();
  };

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) ramp(this.master.gain, m ? 0 : this.volume, 0.08);
    if (m) this.ctx?.suspend().catch(() => {});
    else this.ctx?.resume().catch(() => {});
  }

  /** 0 = camera outside the car, 1 = camera in the cabin with the doors shut. */
  setCabin(amount: number): void {
    const a = Math.min(1, Math.max(0, amount));
    if (this.cabinLp) ramp(this.cabinLp.frequency, 20_000 - a * 18_100, 0.18);
    if (this.cabinShelf) ramp(this.cabinShelf.gain, a * 4.5, 0.18);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    try { localStorage.setItem(VOL_KEY, String(this.volume)); } catch { /* ignore */ }
    if (this.master && !this.muted) ramp(this.master.gain, this.volume, 0.05);
  }

  /**
   * Point the listener at the camera. Uses the AudioParam form where the
   * browser has it — the deprecated `setPosition` jumps, and a jumping
   * listener zippers every panner downstream of it.
   */
  updateListener(camera: THREE.PerspectiveCamera, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const p = camera.position;
    const tau = Math.max(0.02, Math.min(0.12, dt * 0.8));

    const m = camera.matrixWorld.elements;
    // Three's camera looks down −Z; the audio listener's forward is −Z too.
    const fx = -m[8], fy = -m[9], fz = -m[10];
    const ux = m[4], uy = m[5], uz = m[6];

    if (l.positionX) {
      ramp(l.positionX, p.x, tau);
      ramp(l.positionY, p.y, tau);
      ramp(l.positionZ, p.z, tau);
      ramp(l.forwardX, fx, tau);
      ramp(l.forwardY, fy, tau);
      ramp(l.forwardZ, fz, tau);
      ramp(l.upX, ux, tau);
      ramp(l.upY, uy, tau);
      ramp(l.upZ, uz, tau);
    } else {
      const legacy = l as AudioListener & {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (x: number, y: number, z: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition?.(p.x, p.y, p.z);
      legacy.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  }

  /** A spatialised source anchored to a point on the car. */
  panner(pos: Anchor, opts: { cone?: [number, number, number]; hrtf?: boolean; ref?: number } = {}): PannerNode {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = opts.hrtf === false ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = opts.ref ?? 1.8;
    p.maxDistance = 90;
    p.rolloffFactor = 0.9;
    if (opts.cone) {
      p.coneInnerAngle = opts.cone[0];
      p.coneOuterAngle = opts.cone[1];
      p.coneOuterGain = opts.cone[2];
    }
    p.positionX.value = pos[0];
    p.positionY.value = pos[1];
    p.positionZ.value = pos[2];
    return p;
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.bus = null;
  }
}

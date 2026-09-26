/**
 * The car's whole sound, in one object.
 *
 * `main.ts` constructs this with no arguments and calls `update(state)` once
 * per frame, so everything else — which camera the listener is at, where the
 * car is in the world, what the driver's hands are doing — is picked up from
 * the modules that already publish it (`ui/rigLink`, `ui/input`, `audio/events`).
 *
 * ## Nothing exists until the visitor does something
 *
 * No `AudioContext` is constructed until a real user gesture. Until then this
 * object costs one event listener. That is required by autoplay policy, and it
 * is also why the screenshot harness renders in silence without any special
 * case: it never clicks anything.
 *
 * ## Why synthesis, and why a worklet
 *
 * Samples cannot answer a throttle. A crossfade between a recorded idle and a
 * recorded 4000 rpm loop is a crossfade no matter how it is disguised, and the
 * moment the rpm moves quickly the seam shows. Here the crank angle is
 * integrated per sample on the audio thread (`engineWorklet.ts`), so rpm is a
 * *frequency*, not an index: it can slew as hard as the physics likes and the
 * waveform's phase never discontinues. Every scalar that reaches an AudioParam
 * goes through `ramp()` — `setTargetAtTime` — so no control change is ever
 * applied as a step at a block boundary. Those two rules together are what
 * keep the zipper and the clicks out.
 *
 * ## The note itself
 *
 * Five cylinders over 720° is a firing every 144°: **2.5 firings per
 * revolution**. One revolution gets three power strokes, the next gets two, so
 * any difference at all between the cylinders repeats on a two-revolution
 * period and lands on **half orders**. That is the warble, and it is geometry,
 * not an effect. See the header of `engineWorklet.ts` for the three physical
 * asymmetries that feed it.
 */

import * as THREE from 'three';
import { ENGINE } from '@/spec';
import type { VehicleState } from '@/types';
import { AudioHub } from './context';
import { clamp, gain, biquad, ramp } from './dsp';
import { EngineVoice, ensureEngineWorklet, type PlacedSource } from './engine';
import { RoadVoice } from './road';
import { BodyVoice } from './body';
import { installArticulationTaps } from './events';
import { latestControls } from '@/ui/input';
import { rigFrame, currentView } from '@/ui/rigLink';

/** How muffled the world is in each camera pose. */
const CABIN: Partial<Record<string, number>> = {
  interior: 1,
  dash: 1,
  hood: 0.22,
};

let active: EngineAudio | null = null;

/** The live audio system, for UI that needs to mute it. Null before boot. */
export function activeAudio(): EngineAudio | null {
  return active;
}

export class EngineAudio {
  readonly hub = new AudioHub();

  private engine: EngineVoice | null = null;
  private road: RoadVoice | null = null;
  private body: BodyVoice | null = null;
  private placed: PlacedSource[] = [];

  private diffuse: GainNode | null = null;
  private reverb: GainNode | null = null;

  private lastFrame = performance.now() / 1000;
  private loadSmoothed = 0;
  private started = false;
  private gestureBound = false;

  private world = new THREE.Vector3();

  constructor() {
    active = this;
    installArticulationTaps();
    this.bindGesture();
  }

  get muted(): boolean {
    return this.hub.muted;
  }

  get volume(): number {
    return this.hub.volume;
  }

  /** True once the context exists and the engine voice is sounding. */
  get running(): boolean {
    return this.hub.running && this.engine !== null;
  }

  setMuted(m: boolean): void {
    this.hub.setMuted(m);
    if (!m) void this.start();
  }

  setVolume(v: number): void {
    this.hub.setVolume(v);
  }

  // --- lifecycle -------------------------------------------------------------

  private bindGesture(): void {
    if (this.gestureBound) return;
    this.gestureBound = true;
    const go = (): void => { void this.start(); };
    // `pointerdown` rather than `click`, so pressing a pedal on a phone counts.
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, go, { once: true, passive: true });
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      // A context can be suspended again by the tab going away; the next
      // gesture should bring it back.
      if (this.hub.ctx?.state === 'suspended' && !this.hub.muted) {
        await this.hub.ctx.resume().catch(() => {});
      }
      return;
    }
    this.started = true;
    await this.hub.start();
    const ctx = this.hub.ctx;
    const bus = this.hub.bus;
    if (!ctx || !bus) return;

    // A short, dark bed under everything, and a very short reflection. The
    // car is outdoors on a hard surface: there is no reverb to speak of, but
    // there is a ground bounce, and without it a synthesised engine sits
    // unnaturally close to the ear.
    const diffuse = gain(ctx, 0.5);
    const diffuseLp = biquad(ctx, 'lowpass', 520, 0.6);
    diffuse.connect(diffuseLp);
    diffuseLp.connect(bus);
    this.diffuse = diffuse;

    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = groundReflection(ctx);
    const send = gain(ctx, 0.5);
    send.connect(conv);
    conv.connect(bus);
    this.reverb = send;

    this.road = new RoadVoice(this.hub, diffuse);
    this.body = new BodyVoice(this.hub, diffuse);
    this.placed = [...this.road.sources, ...this.body.sources];

    if (await ensureEngineWorklet(ctx)) {
      const engine = new EngineVoice(this.hub, diffuse, send);
      if (engine.ready) {
        this.engine = engine;
        this.placed = [...engine.sources, ...this.placed];
      }
    }
  }

  stop(): void {
    this.engine?.dispose();
    this.engine = null;
    this.body?.dispose();
    this.body = null;
    this.hub.dispose();
    this.started = false;
  }

  // --- per frame -------------------------------------------------------------

  update(state: VehicleState): void {
    const now = performance.now() / 1000;
    const dt = clamp(now - this.lastFrame, 0, 0.1);
    this.lastFrame = now;
    if (!this.hub.created || !this.hub.bus) return;

    const controls = latestControls();
    const view = currentView();
    const cabin = CABIN[view ?? ''] ?? 0;
    this.hub.setCabin(cabin);

    if (rigFrame.camera) this.hub.updateListener(rigFrame.camera, dt);
    this.updatePlacement(dt);

    // --- what the engine is being asked to do --------------------------------
    // `load` is the sign of the torque through the clutch, not the throttle:
    // trailing at 4000 rpm and idling at 4000 rpm are completely different
    // sounds, and the difference is pumping against a closed throttle.
    const rpm = Number.isFinite(state.engineRpm) ? state.engineRpm : ENGINE.idleRpm;
    const th = clamp(state.throttle, 0, 1);
    const engaged = state.gear !== 0 && state.clutch < 0.6;
    const overrun = engaged && th < 0.06 && rpm > ENGINE.idleRpm * 1.25 && Math.abs(state.speed) > 1.5;
    const target = overrun
      ? -clamp((rpm - ENGINE.idleRpm) / 2600, 0.15, 1)
      : th > 0.04
        ? clamp(th * (0.55 + 0.45 * clamp(rpm / ENGINE.peakTorqueRpm, 0, 1.3)), 0, 1)
        : 0;
    // A CIS-E five does not snap: the metering plate has mass and the fuel
    // distributor takes a moment to catch up, which is why tip-in on this car
    // is soft. Rising is slower than falling for exactly that reason.
    const k = target > this.loadSmoothed ? 5.5 : 9.0;
    this.loadSmoothed += (target - this.loadSmoothed) * clamp(dt * k, 0, 1);

    this.engine?.update({
      rpm,
      throttle: th,
      load: this.loadSmoothed,
      running: state.engineRunning,
      cranking: controls.cranking,
    }, dt);

    this.road?.update(state, dt, cabin);

    const indicating = state.lights.hazard || state.lights.indicator !== 0
      || controls.lights.hazard || controls.lights.indicator !== 0;

    this.body?.update({
      dt,
      indicator: indicating,
      horn: controls.horn,
      cranking: controls.cranking,
      wipers: state.wipers || controls.wiperLevel,
      cabin,
    });
  }

  /**
   * Pin every panner to its point on the car. Panner positions are world
   * space; the anchors are vehicle-local, so they have to go through the car's
   * transform — and through `ramp`, because a panner whose position is
   * assigned jumps and zippers just like any other param.
   */
  private updatePlacement(dt: number): void {
    const root = rigFrame.carRoot;
    if (!root || this.placed.length === 0) return;
    const tau = clamp(dt * 1.5, 0.02, 0.08);
    for (const s of this.placed) {
      this.world.set(s.local[0], s.local[1], s.local[2]).applyMatrix4(root.matrixWorld);
      ramp(s.panner.positionX, this.world.x, tau);
      ramp(s.panner.positionY, this.world.y, tau);
      ramp(s.panner.positionZ, this.world.z, tau);
    }
  }
}

/**
 * A ~90 ms impulse: the ground bounce and the first few body reflections, not
 * a room. Generated, like everything else — no binary assets ship.
 */
function groundReflection(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.09);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // Two discrete early reflections — tarmac under the car, and the body
    // side — then a fast diffuse tail.
    const taps = ch === 0 ? [0.006, 0.017, 0.029] : [0.007, 0.019, 0.032];
    for (const t of taps) {
      const i = Math.floor(t * ctx.sampleRate);
      if (i < len) d[i] += (1 - t * 18) * 0.7;
    }
    for (let i = 0; i < len; i++) {
      d[i] += (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.24)) * 0.22;
    }
  }
  return buf;
}

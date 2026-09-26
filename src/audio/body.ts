/**
 * Switchgear, latches, motors and the horn — the small sounds that make a car
 * feel operated rather than simulated.
 *
 * All of it is synthesised the same way: a short excitation (a filtered noise
 * burst, or a decaying tone) through a fixed resonator that stands in for
 * whatever the sound is actually radiating from. A door latch is a small steel
 * box on a big steel panel; a relay is a small steel box on a plastic dash.
 * Same excitation, different resonator, and the ear reads them as different
 * objects.
 *
 * Every envelope goes through `blip()`, which starts from silence and returns
 * to it — nothing here ever assigns a running `gain.value`, so nothing here
 * can click.
 */

import { LIGHTS } from '@/spec';
import type { AudioHub, Anchor } from './context';
import { biquad, blip, clamp, gain, noiseBuffer, noiseSource, ramp } from './dsp';
import type { PlacedSource } from './engine';
import { onAudio, type AudioEvent } from './events';

const ANCHORS = {
  /** Relay behind the dash, driver's side. +X is vehicle right, so LHD is −X. */
  dash: [-0.34, 0.90, -0.60] as Anchor,
  horn: [0, 0.60, 1.00] as Anchor,
  starter: [-0.20, 0.40, 0.42] as Anchor,
  wiperMotor: [-0.10, 1.00, 0.42] as Anchor,
};

/** Where each articulation lives on the car, and how it behaves. */
interface Part {
  at: Anchor;
  /** Seconds of travel — matched to the `Articulation.duration` on the car. */
  duration: number;
  kind: 'door' | 'lid' | 'window' | 'fabric' | 'seat';
  /** Resonator centre for the latch and the closing thunk. */
  body: number;
}

const PARTS: Record<string, Part> = {
  hood:       { at: [0, 0.94, 0.86],    duration: 1.6,  kind: 'lid',    body: 148 },
  tailgate:   { at: [0, 1.10, -3.70],   duration: 1.8,  kind: 'lid',    body: 116 },
  doorFL:     { at: [-0.92, 0.80, -0.62], duration: 1.25, kind: 'door', body: 96 },
  doorFR:     { at: [0.92, 0.80, -0.62],  duration: 1.25, kind: 'door', body: 96 },
  doorRL:     { at: [-0.92, 0.80, -1.72], duration: 1.25, kind: 'door', body: 104 },
  doorRR:     { at: [0.92, 0.80, -1.72],  duration: 1.25, kind: 'door', body: 104 },
  windowFL:   { at: [-0.86, 1.05, -0.62], duration: 1.4, kind: 'window', body: 240 },
  windowFR:   { at: [0.86, 1.05, -0.62],  duration: 1.4, kind: 'window', body: 240 },
  windowRL:   { at: [-0.86, 1.05, -1.72], duration: 1.4, kind: 'window', body: 240 },
  windowRR:   { at: [0.86, 1.05, -1.72],  duration: 1.4, kind: 'window', body: 240 },
  rearSeat60: { at: [0.34, 0.75, -2.20], duration: 1.1, kind: 'seat',   body: 132 },
  rearSeat40: { at: [-0.34, 0.75, -2.20], duration: 1.1, kind: 'seat',  body: 132 },
  cargoCover: { at: [0, 0.92, -2.85],    duration: 0.9,  kind: 'fabric', body: 320 },
};

interface Motion {
  part: Part;
  /** Travel bed — hinge, motor or fabric, depending on the part. */
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  /** Built once per part and re-triggered, so repeated use cannot leak nodes. */
  latch: GainNode;
  thunk: GainNode;
  until: number;
}

export class BodyVoice {
  readonly sources: PlacedSource[] = [];
  private ctx: AudioContext;
  private hub: AudioHub;
  /**
   * Everything in this module is a narrow resonator excited by white noise,
   * and a narrow filter throws most of that noise away — a Q of 2 keeps about
   * 0.2 % of the power. So the whole voice needs a large make-up trim to sit
   * anywhere near the engine. Measured, not guessed: a door shutting should
   * be louder than the same car idling. Every panner in here feeds this node
   * rather than the hub bus directly, so the trim is in one place.
   */
  private bus: AudioNode;
  private white: AudioBuffer;
  private noise: AudioBufferSourceNode;

  private relayPan: PannerNode;
  private relayClick: GainNode;
  private relayClack: GainNode;
  private relayPhase = -1;
  private relayWasOn = false;

  private hornGain: GainNode;
  /** Set by an `emitAudio` event; the pressed key is polled separately. */
  private hornEvent = false;

  private starterGain: GainNode;
  private starterWhine: OscillatorNode;
  private starterOn = false;

  private wiperGain: GainNode;
  private wiperSwish: GainNode;
  private wiperFilter: BiquadFilterNode;
  private wiperPhase = 0;
  private wiperSide = 0;

  private motions = new Map<string, Motion>();
  private unsubscribe: () => void;

  constructor(hub: AudioHub, diffuse: AudioNode) {
    const ctx = hub.ctx!;
    this.ctx = ctx;
    this.hub = hub;
    const out = gain(ctx, 8);
    out.connect(hub.bus!);
    this.bus = out;
    this.white = noiseBuffer(ctx, 3, false);
    // One shared noise source feeds every transient's filter; starting a
    // buffer source per event is both wasteful and a click risk.
    this.noise = noiseSource(ctx, this.white, 1);

    // --- indicator relay ---------------------------------------------------
    // Two different sounds: the armature pulling in is bright and sharp, and
    // dropping out is duller and a shade quieter. A relay that ticks the same
    // both ways sounds like a metronome.
    this.relayPan = hub.panner(ANCHORS.dash, { ref: 0.9 });
    this.relayPan.connect(this.bus);
    this.sources.push({ panner: this.relayPan, local: ANCHORS.dash });

    this.relayClick = this.transient(2600, 4.5, this.relayPan);
    this.relayClack = this.transient(1250, 3.2, this.relayPan);

    // --- horn --------------------------------------------------------------
    // Period two-tone: a pair of vibrating discs a major third apart, heavily
    // formant-shaped by the trumpet. Sawtooths because a horn diaphragm is
    // nowhere near sinusoidal.
    const hornPan = hub.panner(ANCHORS.horn, { ref: 2.2 });
    hornPan.connect(this.bus);
    this.sources.push({ panner: hornPan, local: ANCHORS.horn });
    const hornG = gain(ctx, 0);
    const hornForm = biquad(ctx, 'bandpass', 1450, 1.1);
    const hornPeak = biquad(ctx, 'peaking', 2400, 2.2, 6);
    const hornHp = biquad(ctx, 'highpass', 300, 0.7);
    hornG.connect(hornHp); hornHp.connect(hornForm); hornForm.connect(hornPeak); hornPeak.connect(hornPan);
    const hd = gain(ctx, 0.35);
    hornPeak.connect(hd); hd.connect(diffuse);
    for (const f of [400, 500]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      // A hair of detune per horn — they are never exactly in tune, and the
      // slow beat between them is most of what makes a two-tone horn.
      o.detune.value = f === 400 ? -6 : 7;
      o.connect(hornG);
      o.start();
    }
    this.hornGain = hornG;

    // --- starter -----------------------------------------------------------
    const stPan = hub.panner(ANCHORS.starter, { ref: 1.4 });
    stPan.connect(this.bus);
    this.sources.push({ panner: stPan, local: ANCHORS.starter });
    const stG = gain(ctx, 0);
    const stBand = biquad(ctx, 'bandpass', 520, 1.4);
    const stPeak = biquad(ctx, 'peaking', 1300, 3, 5);
    stG.connect(stBand); stBand.connect(stPeak); stPeak.connect(stPan);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 148;
    whine.connect(stG);
    whine.start();
    const grind = gain(ctx, 0.35);
    this.noise.connect(grind);
    grind.connect(stG);
    this.starterGain = stG;
    this.starterWhine = whine;

    // --- wipers ------------------------------------------------------------
    const wpPan = hub.panner(ANCHORS.wiperMotor, { ref: 1.1 });
    wpPan.connect(this.bus);
    this.sources.push({ panner: wpPan, local: ANCHORS.wiperMotor });
    const wpG = gain(ctx, 0);
    const wpBand = biquad(ctx, 'bandpass', 210, 2.4);
    const wpHarm = biquad(ctx, 'peaking', 640, 3, 5);
    this.noise.connect(wpBand);
    wpBand.connect(wpHarm); wpHarm.connect(wpG); wpG.connect(wpPan);
    // The blade dragging across dry glass — a separate, much brighter band.
    const swish = gain(ctx, 0);
    const swishF = biquad(ctx, 'bandpass', 1400, 1.6);
    this.noise.connect(swishF); swishF.connect(swish); swish.connect(wpPan);
    this.wiperGain = wpG;
    this.wiperSwish = swish;
    this.wiperFilter = swishF;

    this.unsubscribe = onAudio((e) => this.onEvent(e));
  }

  /** A gated resonator fed from the shared noise source. */
  private transient(freq: number, q: number, dest: AudioNode): GainNode {
    const g = gain(this.ctx, 0);
    const f = biquad(this.ctx, 'bandpass', freq, q);
    this.noise.connect(g);
    g.connect(f);
    f.connect(dest);
    return g;
  }

  // -------------------------------------------------------------------------

  private onEvent(e: AudioEvent): void {
    if (e.kind === 'horn') { this.hornEvent = e.on; return; }
    if (e.kind === 'articulation') this.articulate(e.name, e.open);
  }

  private articulate(name: string, open: boolean): void {
    const part = PARTS[name];
    if (!part) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    let m = this.motions.get(name);
    if (!m) {
      const panner = this.hub.panner(part.at, { ref: 1.3 });
      panner.connect(this.bus);
      this.sources.push({ panner, local: part.at });
      const g = gain(ctx, 0);
      const filter = biquad(ctx, 'bandpass', 260, 2.2);
      this.noise.connect(filter);
      filter.connect(g);
      g.connect(panner);
      m = {
        part, gain: g, filter, panner, until: 0,
        latch: this.transient(part.body * 6.5, 4, panner),
        thunk: this.transient(part.body, 0.9, panner),
      };
      this.motions.set(name, m);
    }
    m.until = now + part.duration;
    const { latch, thunk } = m;

    if (part.kind === 'window') {
      // Electric window: no latch, just the motor and the seal, then the
      // regulator hitting its stop.
      blip(ctx, thunk, 0.10, 0.02, 0.10, now + part.duration * 0.96);
    } else if (part.kind === 'fabric') {
      blip(ctx, latch, 0.06, 0.003, 0.05, now);
    } else if (part.kind === 'seat') {
      blip(ctx, latch, 0.16, 0.002, 0.045, now);
      blip(ctx, thunk, open ? 0.12 : 0.30, 0.006, open ? 0.14 : 0.30, now + part.duration * 0.9);
    } else if (open) {
      // Handle pulled, striker released, then the check-strap and the hinge.
      blip(ctx, latch, 0.24, 0.0015, 0.035, now);
      blip(ctx, thunk, 0.07, 0.01, 0.12, now + 0.03);
    } else {
      // Shut: the panel arrives, the seal compresses, the striker seats. The
      // C3 shuts with a dull, well-damped thud, not a clang.
      const at = now + part.duration * 0.88;
      blip(ctx, thunk, part.kind === 'lid' ? 0.9 : 1.25, 0.004, 0.26, at);
      blip(ctx, latch, 0.22, 0.0015, 0.045, at + 0.012);
    }
  }

  // -------------------------------------------------------------------------

  update(opts: {
    dt: number;
    indicator: boolean;
    horn: boolean;
    cranking: boolean;
    wipers: number;
    cabin: number;
  }): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const { dt } = opts;

    // --- relay -------------------------------------------------------------
    // Freewheels at the lamp's own rate, and is re-phased on the first frame
    // of a new indication so the first tick lands with the first flash.
    if (opts.indicator) {
      if (!this.relayWasOn) this.relayPhase = 0;
      else this.relayPhase += dt * LIGHTS.indicatorHz;
      const half = Math.floor(this.relayPhase * 2);
      const prevHalf = Math.floor((this.relayPhase - dt * LIGHTS.indicatorHz) * 2);
      if (half !== prevHalf || this.relayPhase === 0) {
        const pullIn = half % 2 === 0;
        const g = pullIn ? this.relayClick : this.relayClack;
        blip(ctx, g, pullIn ? 0.30 : 0.19, 0.0008, pullIn ? 0.022 : 0.030, now + 0.004);
      }
    } else if (this.relayWasOn) {
      // Dropping out when the stalk cancels is a single, softer clack.
      blip(ctx, this.relayClack, 0.14, 0.001, 0.028, now + 0.004);
      this.relayPhase = -1;
    }
    this.relayWasOn = opts.indicator;

    // --- horn --------------------------------------------------------------
    // Assigning the polled value straight onto the flag silently cancels the
    // event path on the very next frame, which leaves the horn permanently
    // mute for anyone driving it from `emitAudio`.
    const horn = opts.horn || this.hornEvent;
    ramp(this.hornGain.gain, horn ? 0.055 : 0, horn ? 0.006 : 0.035);

    // --- starter -----------------------------------------------------------
    if (opts.cranking !== this.starterOn) {
      this.starterOn = opts.cranking;
      if (opts.cranking) {
        // Bendix engaging with the ring gear.
        blip(ctx, this.relayClick, 0.10, 0.001, 0.02, now);
      }
    }
    ramp(this.starterGain.gain, this.starterOn ? 0.13 : 0, this.starterOn ? 0.035 : 0.09);
    // A tired 12 V starter drops in pitch as the battery sags under load.
    if (this.starterOn) ramp(this.starterWhine.frequency, 132 + Math.sin(now * 5.4) * 5, 0.25);
    else ramp(this.starterWhine.frequency, 150, 0.2);

    // --- wipers ------------------------------------------------------------
    // Sweeps per second: intermittent, slow, fast. Level 0 is parked.
    const rate = opts.wipers === 1 ? 0.34 : opts.wipers === 2 ? 0.72 : opts.wipers === 3 ? 1.15 : 0;
    if (rate > 0) {
      this.wiperPhase += dt * rate;
      if (this.wiperPhase >= 1) {
        this.wiperPhase -= 1;
        this.wiperSide ^= 1;
      }
      // Motor loads up through the sweep and unloads at the reversal.
      const sweep = Math.sin(this.wiperPhase * Math.PI);
      ramp(this.wiperGain.gain, 0.05 + 0.055 * sweep, 0.04);
      ramp(this.wiperSwish.gain, 0.020 * sweep * (1 - 0.5 * opts.cabin), 0.05);
      // The blade travels one way then the other; the band follows it, which
      // is a cheap and surprisingly convincing sense of direction.
      const dir = this.wiperSide ? 1 : -1;
      ramp(this.wiperFilter.frequency, 1350 + dir * 260 * (this.wiperPhase - 0.5) * 2, 0.06);
    } else {
      ramp(this.wiperGain.gain, 0, 0.07);
      ramp(this.wiperSwish.gain, 0, 0.07);
      this.wiperPhase = 0;
    }

    // --- things still in motion ---------------------------------------------
    for (const [, m] of this.motions) {
      const remaining = m.until - now;
      if (remaining <= 0) {
        ramp(m.gain.gain, 0, 0.05);
        continue;
      }
      const t = 1 - remaining / m.part.duration;
      if (m.part.kind === 'window') {
        // The regulator motor: a steady whirr that loads slightly at the top.
        ramp(m.gain.gain, 0.055 * (1 - 0.35 * Math.max(0, t - 0.7) / 0.3), 0.04);
        ramp(m.filter.frequency, 185 + 25 * Math.sin(t * 9), 0.05);
      } else if (m.part.kind === 'lid' || m.part.kind === 'door') {
        // Hinge and check-strap: loudest as the panel gets moving, then gone.
        const env = Math.sin(clamp(t, 0, 1) * Math.PI) * 0.6;
        ramp(m.gain.gain, 0.018 * env, 0.05);
        ramp(m.filter.frequency, 300 + 220 * t, 0.06);
      } else if (m.part.kind === 'fabric') {
        ramp(m.gain.gain, 0.030 * Math.sin(clamp(t, 0, 1) * Math.PI), 0.04);
        ramp(m.filter.frequency, 900 + 500 * t, 0.05);
      } else {
        ramp(m.gain.gain, 0.022 * Math.sin(clamp(t, 0, 1) * Math.PI), 0.05);
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}

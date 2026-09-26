/**
 * The engine voice: the worklet's three raw outputs, made into a car.
 *
 * The worklet (see `engineWorklet.ts`) produces the *source* — pressure pulses
 * at the collector, induction events at the plenum, valve events at the head.
 * Everything that turns those into the sound of a particular car happens here,
 * in native nodes, and almost all of it is **fixed**: a real exhaust system's
 * resonances do not move with engine speed. That is the whole reason an engine
 * sounds different at 2000 and at 5000 rpm rather than merely higher — the
 * harmonic series slides across a stationary set of pipe modes. Sweeping the
 * filters with rpm, which is the usual shortcut, destroys exactly that.
 *
 * What does move: the saturation drive and the final tone roll-off, both with
 * load. A trailing-throttle five is soft and hollow; the same engine pulling
 * hard is brassy, because the pulse is stronger and the gas column is being
 * driven harder. That is one WaveShaper and one lowpass, and it is most of the
 * difference between "engine noise" and "an engine responding to a driver".
 *
 * This is a naturally-aspirated 10-valve with a single silencer in a family
 * estate. Nothing here barks.
 */

import { ENGINE } from '@/spec';
import type { AudioHub, Anchor } from './context';
import { biquad, clamp, gain, ramp, saturationCurve } from './dsp';
import { ENGINE_WORKLET_NAME, ENGINE_WORKLET_SRC } from './engineWorklet';

/** Vehicle-frame anchors. Origin = front-axle centre on the ground, +Z forward. */
export const ENGINE_ANCHORS = {
  /** `HP.rear.exhaustTip`, left of centre under the rear bumper. */
  exhaust: [-0.412, 0.268, -3.761] as Anchor,
  /** Plenum, ahead of the front axle — the five hangs over the nose. */
  intake: [0.27, 0.76, 0.64] as Anchor,
  /** Cam cover, under the bonnet. */
  mech: [0.0, 0.82, 0.70] as Anchor,
};

let moduleLoad: Promise<boolean> | null = null;

/** Compile the worklet once per context. Resolves false if it cannot be used. */
export async function ensureEngineWorklet(ctx: AudioContext): Promise<boolean> {
  if (moduleLoad) return moduleLoad;
  moduleLoad = (async () => {
    if (!ctx.audioWorklet) return false;
    // No binary assets ship, so the processor travels as a string and is
    // handed to the worklet through a Blob URL.
    const url = URL.createObjectURL(new Blob([ENGINE_WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
      return true;
    } catch (err) {
      console.warn('[audio] inline-five worklet unavailable:', err);
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  return moduleLoad;
}

export interface EngineDrive {
  rpm: number;
  throttle: number;
  /** +1 pulling hard, 0 neutral, −1 trailing throttle. */
  load: number;
  running: boolean;
  cranking: boolean;
}

/** One panner and the vehicle-local point it is pinned to. */
export interface PlacedSource {
  panner: PannerNode;
  local: Anchor;
}

export class EngineVoice {
  readonly sources: PlacedSource[] = [];
  private node: AudioWorkletNode | null = null;

  private p: Record<string, AudioParam> = {};
  private drive: GainNode | null = null;
  private tone: BiquadFilterNode | null = null;
  private induct: BiquadFilterNode | null = null;
  private exGain: GainNode | null = null;
  private ikGain: GainNode | null = null;
  private mcGain: GainNode | null = null;
  private bodyBoom: BiquadFilterNode | null = null;

  get ready(): boolean {
    return this.node !== null;
  }

  /**
   * Build the graph. `diffuse` receives a lowpassed, unspatialised copy of the
   * exhaust — without it an HRTF panner makes the engine almost vanish when
   * the camera is broadside, which never happens with a real car because the
   * ground and the body are re-radiating in every direction.
   */
  constructor(hub: AudioHub, diffuse: AudioNode, reverb: AudioNode | null) {
    const ctx = hub.ctx;
    const bus = hub.bus;
    if (!ctx || !bus) return;

    const node = new AudioWorkletNode(ctx, ENGINE_WORKLET_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 3,
      outputChannelCount: [1, 1, 1],
      processorOptions: {
        firingOrder: [...ENGINE.firingOrder],
        firingIntervalDeg: ENGINE.firingIntervalDeg,
        limiterRpm: ENGINE.limiterRpm,
        idleRpm: ENGINE.idleRpm,
      },
    });
    this.node = node;
    for (const k of ['rpm', 'throttle', 'load', 'running', 'cranking']) {
      const param = node.parameters.get(k);
      if (param) this.p[k] = param;
    }
    if (this.p.rpm) this.p.rpm.value = ENGINE.idleRpm;

    // ---- exhaust ----------------------------------------------------------
    // Mode frequencies for a ~2.2 m single-silencer system. Odd quarter-wave
    // modes, shifted up because the gas near the collector is hot (c ≈ 480
    // m/s rather than 343). Fixed, deliberately.
    const hp = biquad(ctx, 'highpass', 26, 0.7);
    const mode1 = biquad(ctx, 'peaking', 88, 3.4, 7.5);
    const mode2 = biquad(ctx, 'peaking', 167, 2.8, 5.0);
    const mode3 = biquad(ctx, 'peaking', 248, 2.2, 3.2);
    // The one notch a silencer really does have: a chamber that kills a band
    // an octave or so above the mode stack. Without it the tone is too open.
    const notch = biquad(ctx, 'notch', 620, 1.4);

    const drive = gain(ctx, 1);
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(2.35);
    shaper.oversample = '4x';
    const makeup = gain(ctx, 0.8);

    const tone = biquad(ctx, 'lowpass', 1400, 0.72);
    const boom = biquad(ctx, 'lowshelf', 120, 0.7, 2.0);
    const exGain = gain(ctx, 0.9);

    node.connect(hp, 0);
    hp.connect(mode1); mode1.connect(mode2); mode2.connect(mode3); mode3.connect(notch);
    notch.connect(drive); drive.connect(shaper); shaper.connect(makeup);
    makeup.connect(tone); tone.connect(boom); boom.connect(exGain);

    const exPan = hub.panner(ENGINE_ANCHORS.exhaust, { ref: 2.0 });
    exGain.connect(exPan);
    exPan.connect(bus);
    this.sources.push({ panner: exPan, local: ENGINE_ANCHORS.exhaust });

    const exDiffuse = gain(ctx, 0.30);
    exGain.connect(exDiffuse);
    exDiffuse.connect(diffuse);
    if (reverb) {
      const send = gain(ctx, 0.16);
      exGain.connect(send);
      send.connect(reverb);
    }

    // ---- intake -----------------------------------------------------------
    // Airbox Helmholtz sits still; the induction growl is a peak that tracks
    // the firing frequency, which is the one filter here that has any business
    // moving with rpm.
    const airbox = biquad(ctx, 'bandpass', 330, 1.05);
    const induct = biquad(ctx, 'peaking', 170, 2.1, 6.5);
    const ikLp = biquad(ctx, 'lowpass', 3100, 0.8);
    const ikGain = gain(ctx, 0.0001);

    node.connect(airbox, 1);
    airbox.connect(induct); induct.connect(ikLp); ikLp.connect(ikGain);

    const ikPan = hub.panner(ENGINE_ANCHORS.intake, { ref: 1.6 });
    ikGain.connect(ikPan);
    ikPan.connect(bus);
    this.sources.push({ panner: ikPan, local: ENGINE_ANCHORS.intake });

    const ikDiffuse = gain(ctx, 0.16);
    ikGain.connect(ikDiffuse);
    ikDiffuse.connect(diffuse);

    // ---- valvetrain -------------------------------------------------------
    // Hydraulic lifters and a belt-driven single cam: a soft tick, not a
    // diesel rattle, and proportionally loudest at idle.
    const mcHp = biquad(ctx, 'highpass', 900, 0.8);
    const mcPeak = biquad(ctx, 'peaking', 2350, 1.6, 4.0);
    const mcLp = biquad(ctx, 'lowpass', 5600, 0.7);
    const mcGain = gain(ctx, 0.0001);

    node.connect(mcHp, 2);
    mcHp.connect(mcPeak); mcPeak.connect(mcLp); mcLp.connect(mcGain);

    const mcPan = hub.panner(ENGINE_ANCHORS.mech, { ref: 1.4 });
    mcGain.connect(mcPan);
    mcPan.connect(bus);
    this.sources.push({ panner: mcPan, local: ENGINE_ANCHORS.mech });

    this.drive = drive;
    this.tone = tone;
    this.induct = induct;
    this.exGain = exGain;
    this.ikGain = ikGain;
    this.mcGain = mcGain;
    this.bodyBoom = boom;
  }

  update(d: EngineDrive, dt: number): void {
    if (!this.node) return;
    // Long enough to be a slew rather than a step, short enough that a
    // blipped throttle still sounds like a blipped throttle. The worklet
    // integrates crank phase per sample, so even a hard step in rpm only
    // bends the frequency — it can never discontinue the waveform.
    const tau = clamp(dt * 1.6, 0.018, 0.05);

    if (this.p.rpm) ramp(this.p.rpm, d.rpm, tau);
    if (this.p.throttle) ramp(this.p.throttle, clamp(d.throttle, 0, 1), tau * 1.4);
    if (this.p.load) ramp(this.p.load, clamp(d.load, -1, 1), 0.09);
    if (this.p.running) ramp(this.p.running, d.running ? 1 : 0, 0.05);
    if (this.p.cranking) ramp(this.p.cranking, d.cranking ? 1 : 0, 0.03);

    const th = clamp(d.throttle, 0, 1);
    const pull = Math.max(0, d.load);
    const over = Math.max(0, -d.load);
    const revs = clamp(d.rpm / ENGINE.redlineRpm, 0, 1.1);
    const alive = d.running || d.cranking ? 1 : 0;

    // Drive into the saturator: this is what makes a loaded engine brassy
    // rather than just louder.
    if (this.drive) ramp(this.drive.gain, 0.85 + 2.5 * pull + 0.5 * revs * th, 0.10);

    // Tone opens with load and, much more weakly, with speed.
    if (this.tone) {
      const f = 900 + 2600 * pull + 520 * revs - 260 * over;
      ramp(this.tone.frequency, clamp(f, 620, 4200), 0.09);
    }

    // Induction peak rides the firing frequency (2.5 orders), one octave up
    // where the plenum actually resonates.
    if (this.induct) {
      const fire = (d.rpm / 60) * 2.5;
      ramp(this.induct.frequency, clamp(fire * 2, 110, 960), 0.06);
      ramp(this.induct.gain, 2.5 + 6.5 * th, 0.12);
    }

    // The 120 Hz shelf is the body cavity booming — it only does it on load.
    if (this.bodyBoom) ramp(this.bodyBoom.gain, 1.2 + 4.2 * pull, 0.14);

    if (this.exGain) ramp(this.exGain.gain, alive * (0.62 + 0.55 * th + 0.20 * revs), 0.05);
    if (this.ikGain) ramp(this.ikGain.gain, alive * (0.05 + 0.55 * th) * (0.35 + 0.65 * revs) * 0.62, 0.06);
    // Mechanical noise is a constant in absolute terms, so its share of the
    // mix falls away as the exhaust comes up — which is why you only hear the
    // tappets at idle.
    if (this.mcGain) ramp(this.mcGain.gain, alive * (0.30 + 0.30 * revs) * (1 - 0.45 * th) * 0.5, 0.06);
  }

  dispose(): void {
    this.node?.port.postMessage('stop');
    this.node?.disconnect();
    this.node = null;
  }
}

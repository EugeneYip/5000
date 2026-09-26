/**
 * Small Web Audio helpers shared by every voice in the car.
 *
 * The one rule that matters here: **nothing ever assigns `param.value` while
 * the graph is running.** Every change goes through `ramp()`, which schedules
 * an exponential approach on the audio thread. A direct assignment is applied
 * at a block boundary and steps the signal — 128 samples of discontinuity,
 * heard as the zipper noise this module exists to avoid.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smoothly chase a target. `tau` is the 63 % time in seconds. */
export function ramp(param: AudioParam, value: number, tau = 0.04): void {
  if (!Number.isFinite(value)) return;
  const ctx = (param as AudioParam & { context?: BaseAudioContext }).context;
  const t = ctx ? ctx.currentTime : 0;
  param.setTargetAtTime(value, t, Math.max(0.001, tau));
}

/** Set a value before the graph is running, where a step cannot be heard. */
export function setNow(param: AudioParam, value: number): void {
  param.value = value;
}

/**
 * A looping noise bed. Long enough (4 s) that the loop point is not a
 * perceptible period, and generated rather than fetched — no binary assets.
 */
export function noiseBuffer(ctx: BaseAudioContext, seconds = 4, pink = false): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (!pink) {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else {
    // Voss-McCartney-ish: cheap, and flat enough to be a convincing pink.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Taper the seam so the loop cannot click.
  const fade = Math.min(512, len >> 4);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    d[i] *= g;
    d[len - 1 - i] *= g;
  }
  return buf;
}

/** A looping noise source, already started. */
export function noiseSource(ctx: BaseAudioContext, buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start();
  return src;
}

/**
 * Soft asymmetric saturation. Exhaust gas is a one-way flow: the positive
 * blowdown half compresses harder than the negative reflection, which is part
 * of why a loaded engine sounds brassy rather than just louder.
 */
export function saturationCurve(drive = 2.2, samples = 2048) {
  const c = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    const k = x >= 0 ? drive : drive * 0.72;
    c[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return c;
}

export function biquad(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  freq: number,
  q = 1,
  gainDb = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

export function gain(ctx: BaseAudioContext, value = 1): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/**
 * A one-shot envelope that starts from silence and returns to it, with no
 * assignment to `gain.value` anywhere — used by every transient in the car
 * (latches, relay ticks, thumps).
 */
export function blip(
  ctx: BaseAudioContext,
  g: GainNode,
  peak: number,
  attack: number,
  decay: number,
  at = ctx.currentTime,
): void {
  const p = g.gain;
  p.cancelScheduledValues(at);
  p.setValueAtTime(0.0001, at);
  p.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + Math.max(0.0005, attack));
  p.exponentialRampToValueAtTime(0.0001, at + attack + Math.max(0.005, decay));
  p.setValueAtTime(0, at + attack + decay + 0.001);
}

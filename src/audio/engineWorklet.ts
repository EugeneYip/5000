/**
 * The inline-five, as an AudioWorklet.
 *
 * Shipped as a source string and loaded from a Blob URL, because the project
 * ships no binary assets and a worklet is not importable as a module from the
 * main graph. It still ends up on the audio rendering thread, which is the
 * whole point: the crank angle is integrated **per sample**, so an rpm that
 * jumps 2000 in one 100 ms frame changes the frequency of a waveform whose
 * phase never discontinues. That is what buys the "no zipper, no click"
 * requirement — nothing here is crossfaded between pre-rendered states.
 *
 * The model, in one paragraph. A five fires every 144° of crank, five times
 * per 720°, so 2.5 firings per revolution: one revolution carries three power
 * strokes and the next carries two. Any difference at all between cylinders
 * therefore repeats on a **two-revolution** period and shows up at half
 * orders — that is the warble, and it is geometric, not an effect bolted on.
 * Three physical asymmetries feed it here: per-cylinder combustion strength
 * (exaggerated at idle, where a CIS-E five really does distribute mixture
 * unevenly), a fixed few tenths of a degree of cam/lash timing error per
 * cylinder, and — the big one — **exhaust runner transit time**. Cylinder 1 is
 * at the front of a longitudinal engine and its runner is the longest; with
 * firing order 1-2-4-5-3 the pulses arrive at the collector after delays of
 * 1.81, 1.60, 1.20, 0.99, 1.40 ms, a sequence that is *not* monotonic. The
 * crank spacing is even; the spacing at the collector is not, and because the
 * transit time is a constant in seconds while the firing interval shrinks with
 * rpm, the unevenness grows as the engine is revved.
 *
 * Those two mechanisms peak at opposite ends, and that is why the car sounds
 * like two different things. Measured through the shipping filter chain, the
 * firing tone's envelope wobbles about **10 % at idle** — slow enough (6.8 Hz)
 * to be heard as a lope — and under 2 % at 4000 rpm, where the same asymmetry
 * has become *timing* rather than amplitude and shows up as sidebands 14-17 dB
 * down at the 2.0 and 3.0 orders. At 33 Hz that is not a rhythm any more, it
 * is roughness in the timbre. Both are the half-order, heard differently.
 *
 * Three outputs — exhaust, intake, mechanical — share one phase integrator so
 * they stay coherent. Resonators, saturation and spatialisation are native
 * nodes on the far side.
 */

export const ENGINE_WORKLET_NAME = 'audi-inline-five';

export const ENGINE_WORKLET_SRC = /* js */ `
const TBL = 1024;
const CYCLE_TBL = 2048;

function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Exhaust blowdown. Sharp opening transient, exponential decay, then the
 * inverted wave that comes back off the collector and the silencer. Tapered
 * to exactly zero at the end so the table can never step.
 */
function blowdown(x, sharp, decay, refl, reflAmp, crack) {
  const rise = 1 - Math.exp(-x / sharp);
  let y = rise * Math.exp(-x * decay);
  if (x > refl) {
    const r = x - refl;
    y -= reflAmp * (1 - Math.exp(-r / 0.035)) * Math.exp(-r * 4.6);
  }
  if (crack > 0) y += crack * Math.exp(-x * 26) * Math.sin(x * 88);
  const w = x < 0.82 ? 1 : 0.5 + 0.5 * Math.cos(((x - 0.82) / 0.18) * Math.PI);
  return y * w;
}

function buildTable(fn) {
  const t = new Float32Array(TBL + 2);
  let peak = 0;
  for (let i = 0; i <= TBL; i++) {
    const v = fn(i / TBL);
    t[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  if (peak > 0) for (let i = 0; i <= TBL; i++) t[i] /= peak;
  t[TBL] = 0;
  t[TBL + 1] = 0;
  return t;
}

class InlineFive extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 820, minValue: 0, maxValue: 9000, automationRate: 'a-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'load', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'a-rate' },
      { name: 'running', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cranking', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    const order = o.firingOrder || [1, 2, 4, 5, 3];
    // \`phase\` is measured in REVOLUTIONS and wraps at 2, so the firing
    // interval converts through 360, not 720. Dividing by 720 packs all five
    // firings into the first revolution and leaves the second silent, which
    // reads as a violent once-per-two-revolutions burst rather than a warble.
    const interval = (o.firingIntervalDeg || 144) / 360; // 144 deg = 0.4 rev
    this.limiterRpm = o.limiterRpm || 6800;
    this.idleRpm = o.idleRpm || 820;

    this.rand = lcg(0x5000c3);
    const n = order.length;
    this.n = n;

    this.fireRev = new Float32Array(n);
    this.runner = new Float32Array(n);
    this.cylAmp = new Float32Array(n);
    this.cylTilt = new Float32Array(n);

    // Runner lengths in metres, front cylinder longest, over the speed of
    // sound in hot exhaust gas (~480 m/s, not the 343 of cold air).
    const lengths = [0.87, 0.77, 0.67, 0.58, 0.48];
    const jitterDeg = [0.0, -0.34, 0.22, -0.17, 0.31];
    const ampTrim = [1.006, 0.938, 1.058, 0.966, 1.032];
    const tilt = [0.0, -0.035, 0.04, -0.02, 0.025];

    for (let k = 0; k < n; k++) {
      const cyl = order[k] - 1;
      this.fireRev[cyl] = k * interval + jitterDeg[cyl] / 720;
      this.runner[cyl] = (lengths[cyl] || 0.6) / 480;
      this.cylAmp[cyl] = ampTrim[cyl] || 1;
      this.cylTilt[cyl] = tilt[cyl] || 0;
    }

    this.soft = buildTable(function (x) { return blowdown(x, 0.085, 3.1, 0.34, 0.40, 0); });
    this.hard = buildTable(function (x) { return blowdown(x, 0.018, 5.9, 0.27, 0.46, 0.20); });

    const pn = lcg(0xa5d3);
    let last = 0;
    this.pop = buildTable(function (x) {
      last = last * 0.62 + (pn() - 0.5) * 0.38;
      return last * Math.exp(-x * 7.5) * (1 - Math.exp(-x / 0.02));
    });

    // Intake: one induction event per cylinder per cycle, a full turn after
    // that cylinder fires. Precomputed over the cycle because it depends on
    // crank angle alone.
    this.intakeEnv = new Float32Array(CYCLE_TBL + 1);
    this.mechEnv = new Float32Array(CYCLE_TBL + 1);
    const W = 0.30;
    for (let i = 0; i <= CYCLE_TBL; i++) {
      const u = (i / CYCLE_TBL) * 2;
      let a = 0;
      for (let c = 0; c < n; c++) {
        let d = u - (this.fireRev[c] + 1.0);
        d -= Math.floor(d / 2) * 2;
        if (d < W) a += 0.5 - 0.5 * Math.cos((1 - d / W) * Math.PI);
      }
      this.intakeEnv[i] = Math.min(1.4, a);
    }
    // Ten valve events over the cycle for a 10-valve head: inlet opens near
    // the induction event, exhaust opens near the end of the power stroke.
    const VW = 0.022;
    for (let i = 0; i <= CYCLE_TBL; i++) {
      const u = (i / CYCLE_TBL) * 2;
      let a = 0;
      for (let c = 0; c < n; c++) {
        for (let v = 0; v < 2; v++) {
          const at = this.fireRev[c] + (v === 0 ? 0.94 : 1.72);
          let d = u - at;
          d -= Math.floor(d / 2) * 2;
          if (d < VW) a += (0.62 + 0.38 * ((c * 2 + v) % 3) / 2) * Math.exp(-d / (VW * 0.25));
        }
      }
      this.mechEnv[i] = a;
    }

    this.phase = 0;
    this.vt = new Float32Array(n).fill(1e6);
    this.vdur = new Float32Array(n).fill(0.01);
    this.vamp = new Float32Array(n);
    this.vblend = new Float32Array(n);
    this.pt = new Float32Array(n).fill(1e6);
    this.pamp = new Float32Array(n);

    this.wander = 0;
    this.wanderTarget = 0;
    this.noiseLp = 0;
    this.noiseHp = 0;
    this.prevNoise = 0;
    this.alive = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; };
  }

  process(inputs, outputs, params) {
    const ex = outputs[0][0];
    const ik = outputs[1][0];
    const mc = outputs[2][0];
    if (!ex || !ik || !mc) return this.alive;

    const n = ex.length;
    const sr = sampleRate;
    const inv = 1 / sr;
    const rpmP = params.rpm;
    const thP = params.throttle;
    const ldP = params.load;
    const run = params.running[0];
    const crank = params.cranking[0];
    const rand = this.rand;

    // Idle hunt: a real CIS-E five never holds a perfectly flat idle.
    if (rand() < 0.10) this.wanderTarget = (rand() - 0.5) * 2;

    const soft = this.soft;
    const hard = this.hard;
    const pop = this.pop;
    const cyl = this.n;

    for (let i = 0; i < n; i++) {
      const rpmRaw = rpmP.length > 1 ? rpmP[i] : rpmP[0];
      const th = thP.length > 1 ? thP[i] : thP[0];
      const load = ldP.length > 1 ? ldP[i] : ldP[0];

      const idleness = clamp((1500 - rpmRaw) / 800, 0, 1);
      this.wander += (this.wanderTarget - this.wander) * 0.00022;
      const rpm = Math.max(0, rpmRaw * (1 + this.wander * 0.030 * idleness));
      const rps = rpm * (1 / 60);

      // --- crank integration, and firing-event detection -------------------
      if (rps > 0.35) {
        const dph = rps * inv;
        const prev = this.phase;
        let ph = prev + dph;
        if (ph >= 2) ph -= 2;

        for (let c = 0; c < cyl; c++) {
          const target = this.fireRev[c];
          let d0 = prev - target; d0 -= Math.floor(d0 / 2) * 2;
          let d1 = ph - target; d1 -= Math.floor(d1 / 2) * 2;
          if (d1 < d0) {
            // Fired. Everything about this pulse is decided now and held for
            // its whole life, so no parameter can modulate a sounding pulse
            // and produce a step.
            const period = 1 / (2.5 * rps);
            this.vdur[c] = clamp(period * 0.62, 0.0022, 0.026);
            this.vt[c] = d1 / rps - this.runner[c];

            const variance = (this.cylAmp[c] - 1) * (1 + 5.0 * idleness);
            let amp = (1 + variance) * (0.42 + 0.58 * th) * run;
            amp += 0.16 * crank * (1 + variance);
            // Trailing throttle: fuel is cut, so the pulse is air only.
            if (load < 0) amp *= 1 + load * 0.55;

            const zone = clamp((rpm - (this.limiterRpm - 170)) / 170, 0, 1);
            let popAmp = 0;
            if (zone > 0 && rand() < zone * 0.82) {
              amp *= 0.05;
              if (rand() < 0.5) popAmp = 0.34 * zone;
            } else if (load < -0.18 && rpm > 1600 && rand() < 0.045 * -load) {
              popAmp = 0.10 + rand() * 0.14;
            }

            this.vamp[c] = amp;
            this.vblend[c] = clamp(
              th * 0.72 + Math.max(0, load) * 0.42 + (rpm - 1400) / 7000 + this.cylTilt[c],
              0, 1,
            );
            if (popAmp > 0) { this.pt[c] = 0; this.pamp[c] = popAmp; }
          }
        }
        this.phase = ph;
      }

      // --- exhaust ----------------------------------------------------------
      let e = 0;
      for (let c = 0; c < cyl; c++) {
        const t = this.vt[c];
        if (t >= 0) {
          const d = this.vdur[c];
          if (t < d) {
            const idx = (t / d) * TBL;
            const i0 = idx | 0;
            const f = idx - i0;
            const s = soft[i0] + (soft[i0 + 1] - soft[i0]) * f;
            const h = hard[i0] + (hard[i0 + 1] - hard[i0]) * f;
            e += this.vamp[c] * (s + (h - s) * this.vblend[c]);
          }
        }
        this.vt[c] = t + inv;

        const pt = this.pt[c];
        if (pt >= 0 && pt < 0.075) {
          const idx = (pt / 0.075) * TBL;
          const i0 = idx | 0;
          const f = idx - i0;
          e += this.pamp[c] * (pop[i0] + (pop[i0 + 1] - pop[i0]) * f);
        }
        this.pt[c] = pt + inv;
      }

      // White noise, reused by all three outputs this sample.
      const w = rand() * 2 - 1;
      this.noiseLp += (w - this.noiseLp) * 0.34;

      // Gas rush through the pipe: keeps a hard pull from turning into a
      // pure periodic tone, which is the tell of a synthesised engine.
      const flow = clamp(rpm / 6500, 0, 1.1) * (0.25 + 0.75 * th);
      e += this.noiseLp * 0.085 * flow;

      const cyclePos = this.phase * (CYCLE_TBL / 2);
      const ci = cyclePos | 0;
      const cf = cyclePos - ci;

      // --- intake -----------------------------------------------------------
      const ie = this.intakeEnv[ci] + (this.intakeEnv[ci + 1] - this.intakeEnv[ci]) * cf;
      const intakeGain = (0.12 + 0.88 * th) * clamp(rpm / 4200, 0.12, 1.25);
      ik[i] = w * (0.30 + 0.70 * ie) * intakeGain * 0.55;

      // --- valvetrain and bearings -----------------------------------------
      const me = this.mechEnv[ci] + (this.mechEnv[ci + 1] - this.mechEnv[ci]) * cf;
      const hp = w - this.prevNoise;
      this.prevNoise = w;
      const spin = clamp(rpm / 3000, 0, 2);
      mc[i] = hp * (me * 0.34 + 0.05 * spin) * (0.45 + 0.55 * run) + hp * 0.10 * crank;

      ex[i] = e * 0.42;
    }

    return this.alive;
  }
}

registerProcessor('${ENGINE_WORKLET_NAME}', InlineFive);
`;

/**
 * Everything the car makes that is not the engine: tyres, air, suspension.
 *
 * Three ideas do most of the work here.
 *
 *  1. **Roll noise is the road, not the tyre.** Its spectrum barely changes
 *     with speed — the *rate* of tread-block impacts does, so the band centre
 *     climbs a little and the level climbs a lot. A 185/70 on a tall sidewall
 *     is a soft, low, rounded noise; nothing like a modern low-profile.
 *  2. **Squeal is a resonance, not a scream.** The tread rubber stick-slips
 *     against the road at a frequency set by the block geometry, so it is a
 *     narrow band around 1 kHz that swells and dies as grip goes. Each corner
 *     is detuned slightly, because four tyres never squeal in unison — and
 *     because four identical high-Q bands in phase sound synthetic instantly.
 *  3. **Wind is not one noise.** There is a broad roar off the body and a much
 *     narrower whistle off the mirror and the A-pillar that only appears at
 *     speed, and only the second one rises fast enough to make the car feel
 *     quick.
 */

import { BODY, WHEEL, wheelPositions } from '@/spec';
import type { AudioHub, Anchor } from './context';
import { biquad, blip, clamp, gain, noiseBuffer, noiseSource, ramp } from './dsp';
import type { PlacedSource } from './engine';
import type { VehicleState } from '@/types';

const CONTACT_Y = 0.11;

function contactAnchors(): Anchor[] {
  const w = wheelPositions();
  return [w.fl, w.fr, w.rl, w.rr].map((p) => [p[0], CONTACT_Y, p[2]] as Anchor);
}

/** Per-corner detune so four squealing tyres never phase-lock. */
const SQUEAL_HZ = [1010, 1085, 930, 975];

interface Corner {
  roll: GainNode;
  rollBand: BiquadFilterNode;
  squeal: GainNode;
  squealBand: BiquadFilterNode;
  thump: GainNode;
  thumpTone: OscillatorNode;
  thumpToneGain: GainNode;
  lastComp: number;
  lastThump: number;
  squealPhase: number;
}

export class RoadVoice {
  readonly sources: PlacedSource[] = [];
  private ctx: AudioContext;
  private corners: Corner[] = [];

  private windRoar: GainNode | null = null;
  private windLp: BiquadFilterNode | null = null;
  private windWhistle: GainNode | null = null;
  private windWhistleBand: BiquadFilterNode | null = null;

  private time = 0;

  constructor(hub: AudioHub, diffuse: AudioNode) {
    const ctx = hub.ctx!;
    const bus = hub.bus!;
    this.ctx = ctx;

    const pink = noiseBuffer(ctx, 4, true);
    const white = noiseBuffer(ctx, 3, false);
    const anchors = contactAnchors();

    for (let i = 0; i < 4; i++) {
      const pan = hub.panner(anchors[i], { ref: 1.5, hrtf: i < 2 });
      pan.connect(bus);
      this.sources.push({ panner: pan, local: anchors[i] });

      // --- roll ---
      const src = noiseSource(ctx, pink, 0.85 + i * 0.05);
      const band = biquad(ctx, 'bandpass', 120, 0.55);
      const lp = biquad(ctx, 'lowpass', 900, 0.7);
      // The sidewall's own resonance. A 70-series tyre has a very audible one.
      const wall = biquad(ctx, 'peaking', 190, 2.6, 5.0);
      const g = gain(ctx, 0.0001);
      src.connect(band); band.connect(wall); wall.connect(lp); lp.connect(g);
      g.connect(pan);
      const gd = gain(ctx, 0.5);
      g.connect(gd); gd.connect(diffuse);

      // --- squeal ---
      const sq = noiseSource(ctx, white, 1 + i * 0.03);
      // One moderately narrow band plus its first overtone. Two cascaded
      // high-Q bands, which is the obvious way to write this, throw away so
      // much of the noise power that the squeal never gets over the road
      // noise it is supposed to be competing with.
      const sqBand = biquad(ctx, 'bandpass', SQUEAL_HZ[i], 5.5);
      const sqBand2 = biquad(ctx, 'peaking', SQUEAL_HZ[i] * 2.02, 4, 8);
      const sqG = gain(ctx, 0.0001);
      sq.connect(sqBand); sqBand.connect(sqBand2); sqBand2.connect(sqG);
      sqG.connect(pan);

      // --- suspension thump ---
      // A bump is a broadband knock plus the body's own low ring. The sine
      // runs continuously through its own gain so it can never be started
      // mid-cycle, which is the classic source of a click.
      const th = gain(ctx, 0);
      const thNoise = noiseSource(ctx, white, 0.7 + i * 0.02);
      const thLp = biquad(ctx, 'lowpass', 220, 1.1);
      thNoise.connect(thLp); thLp.connect(th);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 58 - i * 2;
      const oscG = gain(ctx, 0);
      osc.connect(oscG);
      osc.start();
      th.connect(pan);
      oscG.connect(pan);

      this.corners.push({
        roll: g, rollBand: band,
        squeal: sqG, squealBand: sqBand,
        thump: th, thumpTone: osc, thumpToneGain: oscG,
        lastComp: 0.5, lastThump: -1, squealPhase: i * 0.7,
      });
    }

    // --- wind --------------------------------------------------------------
    // Unspatialised on purpose: at 70 mph the air is everywhere, and a panned
    // wind that moves when the camera orbits is immediately wrong.
    const wsrc = noiseSource(ctx, pink, 1);
    const whp = biquad(ctx, 'highpass', 230, 0.6);
    const wlp = biquad(ctx, 'lowpass', 800, 0.6);
    const wg = gain(ctx, 0.0001);
    wsrc.connect(whp); whp.connect(wlp); wlp.connect(wg); wg.connect(bus);

    const w2 = noiseSource(ctx, white, 1);
    const wb = biquad(ctx, 'bandpass', 1750, 5.5);
    const wg2 = gain(ctx, 0.0001);
    w2.connect(wb); wb.connect(wg2); wg2.connect(bus);

    this.windRoar = wg;
    this.windLp = wlp;
    this.windWhistle = wg2;
    this.windWhistleBand = wb;
  }

  update(state: VehicleState, dt: number, cabin: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const v = Math.abs(state.speed);
    // 0 at rest, 1 at about 130 km/h.
    const sf = clamp(v / 36, 0, 1.3);
    const rolling = clamp(v / 1.6, 0, 1);
    // Tread-block passing rate: contacts per second at the patch.
    const blockHz = clamp((v / (2 * Math.PI * WHEEL.radius)) * 62, 20, 620);

    for (let i = 0; i < 4; i++) {
      const c = this.corners[i];
      const contact = state.wheelContact[i] !== false;
      const slip = Math.abs(state.wheelSlip[i] ?? 0);

      ramp(c.rollBand.frequency, 95 + blockHz * 0.34, 0.08);
      const rollLevel = contact
        ? rolling * (0.10 + 0.52 * sf * sf) * (1 - 0.45 * cabin)
        : 0;
      ramp(c.roll.gain, rollLevel, 0.07);

      // Squeal needs slip *and* speed: a stationary wheel spinning on a
      // polished floor is not what this is.
      const squealAmt = clamp((slip - 0.14) / 0.5, 0, 1) * clamp(v / 3.2, 0, 1) * (contact ? 1 : 0);
      if (squealAmt > 0.001) {
        // A scrubbing tyre wavers; a constant tone is the giveaway.
        c.squealPhase += dt * (3.1 + i * 0.37);
        const waver = 1 + 0.035 * Math.sin(c.squealPhase * 6.2831853);
        ramp(c.squealBand.frequency, SQUEAL_HZ[i] * waver * (0.9 + 0.22 * squealAmt), 0.05);
      }
      ramp(c.squeal.gain, squealAmt * squealAmt * 2.6 * (1 - 0.3 * cabin), 0.05);

      // --- bumps ---
      const comp = state.suspensionCompression[i] ?? 0.5;
      const rate = (comp - c.lastComp) / Math.max(dt, 1 / 240);
      c.lastComp = comp;
      const now = ctx.currentTime;
      if (Math.abs(rate) > 2.2 && now - c.lastThump > 0.085) {
        c.lastThump = now;
        const hit = clamp((Math.abs(rate) - 2.2) / 7, 0.05, 1);
        blip(ctx, c.thump, 0.34 * hit, 0.004, 0.09 + 0.05 * hit, now + 0.002);
        blip(ctx, c.thumpToneGain, 0.22 * hit, 0.006, 0.16, now + 0.002);
      }
    }

    // --- wind ---
    // Drag rises with v², and so does the acoustic power the body radiates;
    // the Cd is the wagon's own 0.34, so a boxier car is a windier one.
    const drag = sf * sf * (BODY.dragCoefficient / 0.30);
    if (this.windRoar) ramp(this.windRoar.gain, drag * 0.30 * (1 - 0.62 * cabin), 0.10);
    if (this.windLp) ramp(this.windLp.frequency, 620 + 900 * sf, 0.12);
    if (this.windWhistle) ramp(this.windWhistle.gain, Math.pow(sf, 3.1) * 0.10 * (1 - 0.8 * cabin), 0.14);
    if (this.windWhistleBand) ramp(this.windWhistleBand.frequency, 1500 + 900 * sf, 0.14);
  }
}

/**
 * Headless validation of the vehicle model.
 *
 * Run it with no browser, no renderer and no car:
 *
 *   node_modules/.bin/esbuild src/physics/selftest.ts --bundle --format=esm \
 *     --platform=node --outfile=/tmp/selftest.mjs && node /tmp/selftest.mjs
 *
 * Every number it prints has a published figure beside it. The factory claims
 * in `PERFORMANCE` are manufacturer numbers rather than instrumented tests, so
 * the acceptance bands are deliberately wider than the claims: Car and Driver
 * measured 9.70 s to 60 for the *heavier* quattro saloon on the same engine and
 * ratios, which is the strongest evidence for where a FWD wagon really sits.
 *
 * The last test is the least glamorous and the most important. A vehicle model
 * that quietly creeps, shivers or NaNs while parked will do all three while
 * driven, and nobody notices until the car is halfway through the scenery.
 */

import type { ControlInput } from '@/ui/input';
import { BODY, PERFORMANCE, SUSPENSION, TRANSMISSION, tyreRadius } from '@/spec';
import { VehicleSim } from './VehicleSim';
import { TYRE_DEBUG, SURFACE_GRIP } from './tyre';
import { CG_HEIGHT } from './suspension';
import { AUTOMATIC } from './powertrain';
import { MPS_TO_MPH, RADS_TO_RPM, clamp, clamp01 } from './math';

const DT = 1 / 60;
const G = 9.80665;

function makeInput(): ControlInput {
  return {
    throttle: 0, brake: 0, steer: 0, handbrake: 0, clutch: 0,
    shiftUp: false, shiftDown: false,
    toggleLights: false, toggleHigh: false, indicateLeft: false, indicateRight: false,
    horn: false, starter: false, wiper: false,
    lights: { low: false, high: false, hazard: false, indicator: 0, fog: false },
    wiperLevel: 0,
    ignition: true,
    cranking: false,
    reset: false,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  measured: string;
  reference: string;
  ok: boolean;
}

const rows: Row[] = [];
let failures = 0;

function report(name: string, measured: string, reference: string, ok: boolean): void {
  rows.push({ name, measured, reference, ok });
  if (!ok) failures++;
}

function band(v: number, lo: number, hi: number): boolean {
  return Number.isFinite(v) && v >= lo && v <= hi;
}

// ---------------------------------------------------------------------------
// Test rigs
// ---------------------------------------------------------------------------

/**
 * Wide-open-throttle run. Manual shifts at the redline; the automatic shifts
 * itself. Returns times to a list of speeds plus the terminal speed.
 */
function accelerationRun(mode: 'manual' | 'automatic', marksMph: number[], seconds: number): {
  times: number[]; topMph: number; log: string[];
} {
  const sim = new VehicleSim(null, mode);
  const inp = makeInput();
  const times = marksMph.map(() => NaN);
  const log: string[] = [];
  let t = 0;
  let lastGear = 0;

  // Manual: select first. The automatic wakes into D on the first pedal input.
  inp.throttle = 1;
  if (mode === 'manual') {
    inp.shiftUp = true;
    sim.step(DT, inp);
    inp.shiftUp = false;
    t += DT;
  }

  let best = 0;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    const s = sim.step(DT, inp);
    t += DT;
    const mph = s.speed * MPS_TO_MPH;
    if (mph > best) best = mph;

    if (s.gear !== lastGear) {
      log.push(`      ${t.toFixed(2)} s  →  gear ${s.gear}  at ${mph.toFixed(1)} mph, ${Math.round(s.engineRpm)} rpm`);
      lastGear = s.gear;
    }

    // Manual driver: change up at the red band.
    inp.shiftUp = mode === 'manual' && s.engineRpm > 6500 && s.gear < TRANSMISSION.gearRatios.length;

    for (let m = 0; m < marksMph.length; m++) {
      if (Number.isNaN(times[m]) && mph >= marksMph[m]) times[m] = t;
    }
    if (!Number.isFinite(s.speed)) throw new Error('speed went non-finite during acceleration run');
  }
  return { times, topMph: best, log };
}

/** Terminal velocity: hold wide-open throttle until acceleration dies away. */
function topSpeedRun(mode: 'manual' | 'automatic'): { mph: number; rpm: number; gear: number } {
  const sim = new VehicleSim(null, mode);
  const inp = makeInput();
  inp.throttle = 1;
  if (mode === 'manual') {
    inp.shiftUp = true;
    sim.step(DT, inp);
    inp.shiftUp = false;
  }

  let prev = 0;
  let out = { mph: 0, rpm: 0, gear: 0 };
  const frames = Math.round(420 / DT);
  for (let i = 0; i < frames; i++) {
    const s = sim.step(DT, inp);
    inp.shiftUp = mode === 'manual' && s.engineRpm > 6500 && s.gear < TRANSMISSION.gearRatios.length;
    out = { mph: s.speed * MPS_TO_MPH, rpm: s.engineRpm, gear: s.gear };
    if (i % 120 === 0) {
      if (i > 0 && Math.abs(s.speed - prev) < 0.004) break;
      prev = s.speed;
    }
  }
  return out;
}

/**
 * Accelerate to 60 mph, then brake at a given pedal travel and measure the
 * stop. `steer` lets the same rig ask the second, more interesting question:
 * what is left of the steering once the front wheels have stopped turning?
 */
function brakingRun(pedal: number, steer = 0): {
  metres: number; feet: number; peakG: number; locked: boolean; lateralG: number;
  dive: number; frontTravel: number;
} {
  const sim = new VehicleSim(null, 'manual');
  const inp = makeInput();
  inp.throttle = 1;
  inp.shiftUp = true;
  sim.step(DT, inp);
  inp.shiftUp = false;

  let s = sim.step(DT, inp);
  let guard = 0;
  while (s.speed * MPS_TO_MPH < 62 && guard++ < 60 / DT) {
    s = sim.step(DT, inp);
    inp.shiftUp = s.engineRpm > 6500 && s.gear < TRANSMISSION.gearRatios.length;
  }

  inp.throttle = 0;
  inp.shiftUp = false;
  // Let it settle to exactly 60 on a trailing throttle before the stop.
  while (s.speed * MPS_TO_MPH > 60) s = sim.step(DT, inp);

  const start = sim.odometer;
  inp.brake = pedal;
  inp.clutch = 1;
  inp.steer = steer;
  let peakG = 0;
  let lateralG = 0;
  let locked = false;
  let dive = 0;
  let frontTravel = 0;
  guard = 0;
  while (s.speed > 0.15 && guard++ < 20 / DT) {
    s = sim.step(DT, inp);
    peakG = Math.max(peakG, -s.gForce.y);
    // Only count the lateral response while the car is still moving properly.
    if (s.speed > 12) lateralG = Math.max(lateralG, Math.abs(s.gForce.x));
    if (-s.pitch > dive) {
      dive = -s.pitch;
      frontTravel = (s.suspensionCompression[0] - 0.5) * 2 * SUSPENSION.front.travelUp;
    }
    if (Math.abs(s.wheelSpin[0]) < 0.4 && s.speed > 3) locked = true;
    if (steer !== 0 && s.speed < 12) break;
  }
  const metres = sim.odometer - start;
  return { metres, feet: metres * 3.28084, peakG, locked, lateralG, dive, frontTravel };
}

/**
 * Steady-state skidpad on a 30 m circle.
 *
 * Target speed is ramped slowly while a yaw-rate loop adds lock; once the front
 * axle runs out of grip the yaw rate stops following and `v · yawRate` — which
 * is exactly the lateral acceleration in a steady turn — plateaus. The peak of
 * that plateau is the number.
 */
function skidpadRun(): {
  g: number; atMph: number; steerAtPeak: number; understeer: boolean; roll: number;
} {
  const sim = new VehicleSim(null, 'manual');
  const inp = makeInput();
  const R = 30;

  // Roll out to a starting speed in third, then hold the gearbox there.
  inp.throttle = 0.55;
  inp.shiftUp = true;
  let s = sim.step(DT, inp);
  inp.shiftUp = false;
  let guard = 0;
  while (s.gear < 3 && guard++ < 40 / DT) {
    s = sim.step(DT, inp);
    inp.shiftUp = s.engineRpm > 4200 && s.gear < 3;
  }
  inp.shiftUp = false;

  let steer = 0;
  let peak = 0;
  let atMph = 0;
  let steerAtPeak = 0;
  let understeerSeen = false;
  let rollAtPeak = 0;

  const seconds = 75;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    const v = s.speed;
    const target = 9 + (16 * i) / frames;

    // Speed loop.
    const err = target - v;
    inp.throttle = clamp01(0.12 + err * 0.5);
    inp.brake = clamp01(-err * 0.3);
    inp.shiftUp = s.engineRpm > 6200 && s.gear < TRANSMISSION.gearRatios.length;
    inp.shiftDown = false;

    // Yaw-rate loop. Positive steer and positive yaw rate are both to the left.
    const wantYaw = v / R;
    steer = clamp(steer + (wantYaw - s.yawRate) * 0.9 * DT, 0, 1);
    inp.steer = steer;

    s = sim.step(DT, inp);

    // In a steady turn the lateral acceleration is exactly v times yaw rate.
    const lat = Math.abs(s.speed * s.yawRate) / G;
    if (i > frames * 0.05 && lat > peak && Number.isFinite(lat)) {
      peak = lat;
      atMph = s.speed * MPS_TO_MPH;
      steerAtPeak = s.steerAngle;
      rollAtPeak = Math.abs(s.roll);
    }
    // Understeer is the front tyres working harder than the rear ones.
    if (lat > peak * 0.9 && s.wheelSlip[1] > s.wheelSlip[3]) understeerSeen = true;
  }
  return { g: peak, atMph, steerAtPeak, understeer: understeerSeen, roll: rollAtPeak };
}

/**
 * Standing start in first. A nose-heavy front-driver on period rubber cannot
 * put 190 N·m through a 14.0:1 first gear, so it should spin its front wheels
 * — docs/REFERENCE-VEHICLE.md §3.10 calls that out as correct behaviour rather
 * than a bug. Also measures squat, which should be small and rearward.
 */
function launchRun(): { slipRatio: number; squat: number; innerLift: number } {
  const sim = new VehicleSim(null, 'manual');
  const inp = makeInput();
  inp.throttle = 1;
  inp.shiftUp = true;
  let s = sim.step(DT, inp);
  inp.shiftUp = false;

  // A manual change takes `TRANSMISSION.shiftTimeUp`, so first is not in yet.
  let guard = 0;
  while (s.gear !== 1 && guard++ < 2 / DT) s = sim.step(DT, inp);

  let slip = 0;
  let squat = 0;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    s = sim.step(DT, inp);
    if (s.gear !== 1) break;
    const k = (s.wheelSpin[0] * tyreRadius() - s.speed) / Math.max(s.speed, 2.2);
    slip = Math.max(slip, k);
    squat = Math.max(squat, s.pitch);
  }
  return { slipRatio: slip, squat, innerLift: 0 };
}

/**
 * Sixty seconds of deliberately stupid driving: full lock reversed against
 * itself, the handbrake yanked at speed, throttle and brake together, gears
 * thrown about. Nothing here needs to *look* good — it needs to stay finite
 * and keep the car the right way up.
 */
function abuseRun(): { nan: number; maxTilt: number; airborne: boolean; finite: boolean } {
  const sim = new VehicleSim(null, 'manual');
  const inp = makeInput();
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  let maxTilt = 0;
  let airborne = false;
  let ok = true;
  for (let i = 0; i < Math.round(60 / DT); i++) {
    if (i % 20 === 0) {
      inp.throttle = rnd() > 0.3 ? 1 : 0;
      inp.brake = rnd() > 0.75 ? 1 : 0;
      inp.steer = rnd() * 2 - 1;
      inp.handbrake = rnd() > 0.9 ? 1 : 0;
      inp.clutch = rnd() > 0.9 ? 1 : 0;
      inp.shiftUp = rnd() > 0.7;
      inp.shiftDown = rnd() > 0.85;
    }
    const s = sim.step(DT, inp);
    maxTilt = Math.max(maxTilt, Math.abs(s.pitch), Math.abs(s.roll));
    if (s.wheelContact.some((c) => !c)) airborne = true;
    ok = ok && Number.isFinite(s.speed + s.pitch + s.roll + s.yawRate + s.engineRpm
      + s.gForce.x + s.gForce.y + s.velocity.lengthSq()
      + s.wheelSpin.reduce((a, b) => a + b, 0)
      + s.suspensionCompression.reduce((a, b) => a + b, 0));
  }
  return { nan: sim.nanRecoveries, maxTilt, airborne, finite: ok };
}

/** Reverse: select it at a standstill and make sure the car goes backwards. */
function reverseRun(): { speed: number; lampOn: boolean } {
  const sim = new VehicleSim(null, 'automatic');
  const inp = makeInput();
  inp.brake = 1;
  sim.step(DT, inp);
  inp.shiftDown = true;
  sim.step(DT, inp);            // D -> N
  sim.step(DT, inp);
  inp.shiftDown = false;
  sim.step(DT, inp);
  inp.shiftDown = true;
  let s = sim.step(DT, inp);    // N -> R
  inp.shiftDown = false;
  inp.brake = 0;
  inp.throttle = 0.6;
  for (let i = 0; i < Math.round(4 / DT); i++) s = sim.step(DT, inp);
  return { speed: s.speed, lampOn: s.lights.reverse };
}

/**
 * The same standing start at a range of frame rates, and with a jittery one.
 *
 * This is the whole reason for the fixed step and the accumulator. If these
 * numbers disagree, the car is faster on a gaming monitor than on a laptop and
 * every figure above is meaningless.
 */
function frameRateSweep(): { times: Array<[string, number]>; spread: number } {
  const run = (dt: number, jitter = 0): number => {
    const sim = new VehicleSim(null, 'manual');
    const inp = makeInput();
    inp.throttle = 1;
    inp.shiftUp = true;
    sim.step(dt, inp);
    inp.shiftUp = false;
    let t = dt;
    let seed = 7;
    for (let i = 0; i < Math.round(30 / dt); i++) {
      let h = dt;
      if (jitter) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        h = dt * (1 + jitter * (seed / 0x7fffffff - 0.5));
      }
      const s = sim.step(h, inp);
      t += h;
      inp.shiftUp = s.engineRpm > 6500 && s.gear < TRANSMISSION.gearRatios.length;
      if (s.speed * MPS_TO_MPH >= 60) return t;
    }
    return NaN;
  };

  const times: Array<[string, number]> = [
    ['30 fps', run(1 / 30)],
    ['60 fps', run(1 / 60)],
    ['144 fps', run(1 / 144)],
    ['500 fps', run(1 / 500)],
    ['60 fps, jittery', run(1 / 60, 0.8)],
  ];
  const vals = times.map(([, v]) => v);
  return { times, spread: Math.max(...vals) - Math.min(...vals) };
}

/** Sixty seconds parked. Nothing at all should happen. */
function parkedRun(): {
  drift: number; heightDrift: number; jitter: number; nan: number; rideFront: number; rideRear: number;
} {
  const sim = new VehicleSim(null, 'automatic');
  const inp = makeInput();

  // One step to settle the very first frame, then record the datum.
  sim.step(DT, inp);
  const s0 = sim.step(DT, inp);
  const c0 = sim.cornerState(0);
  const datumFront = c0.x;
  let maxJitter = 0;
  let maxSpeed = 0;
  let s = s0;

  const frames = Math.round(60 / DT);
  for (let i = 0; i < frames; i++) {
    s = sim.step(DT, inp);
    maxSpeed = Math.max(maxSpeed, Math.abs(s.speed));
    for (let k = 0; k < 4; k++) {
      maxJitter = Math.max(maxJitter, Math.abs(s.suspensionCompression[k] - 0.5));
    }
    if (!Number.isFinite(s.speed + s.pitch + s.roll + s.odometer)) {
      throw new Error('state went non-finite while parked');
    }
  }

  const drift = sim.odometer;
  const heightDrift = Math.abs(sim.cornerState(0).x - datumFront);
  const r = tyreRadius();
  return {
    drift,
    heightDrift,
    jitter: maxJitter,
    nan: sim.nanRecoveries,
    rideFront: r - sim.cornerState(0).x,
    rideRear: r - sim.cornerState(2).x,
  };
}

/** Engine speed at a given road speed in top gear — the gearing cross-check. */
function rpmAtSpeed(kmh: number): number {
  const top = TRANSMISSION.gearRatios[TRANSMISSION.gearRatios.length - 1] * TRANSMISSION.finalDrive;
  return ((kmh / 3.6) / tyreRadius()) * top * RADS_TO_RPM;
}

// ---------------------------------------------------------------------------

function main(): void {
  const head = (t: string): void => console.log(`\n[1m${t}[0m`);

  console.log('[1mAudi 5000 S Wagon — vehicle model self-test[0m');
  console.log(`  kerb ${BODY.massKerb} kg · ${(BODY.weightDistFront * 100).toFixed(0)}/${((1 - BODY.weightDistFront) * 100).toFixed(0)} front · Cd ${BODY.dragCoefficient} × ${BODY.frontalArea} m²`);
  console.log(`  CG height ${CG_HEIGHT} m · ride freq ${(Math.sqrt(SUSPENSION.front.springRate / ((BODY.massKerb * BODY.weightDistFront) / 2 - 38)) / (2 * Math.PI)).toFixed(2)} Hz front`);
  console.log(`  tyre peak: ${(TYRE_DEBUG.peakKappa * 100).toFixed(1)} % slip ratio, ${TYRE_DEBUG.peakAlphaDeg.toFixed(1)}° slip angle · surface ${SURFACE_GRIP}`);
  console.log(`  rolling radius ${(tyreRadius() * 1000).toFixed(1)} mm · auto ${AUTOMATIC.gearRatios.join(' / ')} on ${AUTOMATIC.finalDrive}`);

  head('Gearing');
  const rpm100 = rpmAtSpeed(100);
  report('rpm at 100 km/h, 5th', `${rpm100.toFixed(0)} rpm`, `${PERFORMANCE.rpmAt100Kmh} rpm`,
    band(rpm100, PERFORMANCE.rpmAt100Kmh - 60, PERFORMANCE.rpmAt100Kmh + 60));

  head('Acceleration — 5-speed manual');
  const man = accelerationRun('manual', [50, 60], 40);
  for (const l of man.log) console.log(l);
  report('0-50 mph, manual', `${man.times[0].toFixed(2)} s`, `${PERFORMANCE.zeroToFiftyManual} s factory`,
    band(man.times[0], 6.6, 8.4));
  report('0-60 mph, manual', `${man.times[1].toFixed(2)} s`,
    `${PERFORMANCE.zeroToSixtyManual} s factory · 9.70 s C/D quattro`, band(man.times[1], 9.4, 10.6));

  head('Acceleration — 3-speed automatic');
  const auto = accelerationRun('automatic', [50, 60], 45);
  for (const l of auto.log) console.log(l);
  report('0-60 mph, automatic', `${auto.times[1].toFixed(2)} s`, `${PERFORMANCE.zeroToSixtyAuto} s factory`,
    band(auto.times[1], 10.9, 12.6));

  head('Top speed');
  const tsM = topSpeedRun('manual');
  report('top speed, manual', `${tsM.mph.toFixed(1)} mph (${(tsM.mph / MPS_TO_MPH * 3.6).toFixed(0)} km/h, ${tsM.rpm.toFixed(0)} rpm in ${tsM.gear})`,
    `${PERFORMANCE.topSpeedMph} mph / ${PERFORMANCE.topSpeedKmh} km/h`, band(tsM.mph, 118, 130));
  const tsA = topSpeedRun('automatic');
  report('top speed, automatic', `${tsA.mph.toFixed(1)} mph (${tsA.rpm.toFixed(0)} rpm in ${tsA.gear})`,
    '122 mph', band(tsA.mph, 115, 127));

  head('Braking — no ABS');
  const full = brakingRun(1);
  let best = full;
  let bestPedal = 1;
  for (let p = 0.6; p < 1.0; p += 0.02) {
    const r = brakingRun(p);
    if (r.metres < best.metres) { best = r; bestPedal = p; }
  }
  report('60-0 mph, best stop', `${best.metres.toFixed(1)} m / ${best.feet.toFixed(0)} ft at ${(bestPedal * 100).toFixed(0)} % pedal, peak ${best.peakG.toFixed(2)} g`,
    'period car, 140-175 ft', band(best.feet, 135, 180));
  report('front wheels lock', full.locked ? 'yes' : 'no', 'expected: yes, there is no ABS', full.locked);

  // The point of having no ABS is not the stopping distance — this tyre is so
  // flat past its peak that sliding barely costs any. It is that a locked
  // wheel has no friction budget left for cornering, so the steering goes.
  const turnFree = brakingRun(0, 0.55);
  const turnLocked = brakingRun(1, 0.55);
  const retained = turnLocked.lateralG / Math.max(turnFree.lateralG, 1e-6);
  report('steering with fronts locked',
    `${(retained * 100).toFixed(0)} % of the lateral g it makes unbraked (${turnLocked.lateralG.toFixed(2)} vs ${turnFree.lateralG.toFixed(2)} g)`,
    'combined slip: a locked wheel does not steer', retained < 0.55);

  head('Lateral grip');
  const sk = skidpadRun();
  report('skidpad, 30 m circle', `${sk.g.toFixed(3)} g at ${sk.atMph.toFixed(1)} mph, ${((sk.steerAtPeak * 180) / Math.PI).toFixed(1)}° lock`,
    `${PERFORMANCE.skidpadGEstimate} g estimate`, band(sk.g, 0.66, 0.79));
  report('balance at the limit', sk.understeer ? 'understeer' : 'oversteer',
    'nose-heavy FWD, no rear bar: understeer', sk.understeer);

  head('Body attitude');
  const hard = brakingRun(0.9);
  report('dive under braking', `${((hard.dive * 180) / Math.PI).toFixed(2)}° at ${hard.peakG.toFixed(2)} g, ${(hard.frontTravel * 1000).toFixed(0)} mm of front travel`,
    'soft 1.3 Hz springs, 25 % anti-dive: 1-2°', band((hard.dive * 180) / Math.PI, 0.7, 2.2));
  const lan = launchRun();
  report('squat on full throttle', `${((lan.squat * 180) / Math.PI).toFixed(2)}° nose-up`,
    'small — squat is resisted by the rear springs', band((lan.squat * 180) / Math.PI, 0.1, 1.2));
  report('roll at the limit', `${((sk.roll * 180) / Math.PI).toFixed(2)}° = ${((sk.roll * 180) / Math.PI / sk.g).toFixed(2)}°/g`,
    'soft estate, no rear bar: 4-6°/g', band((sk.roll * 180) / Math.PI / sk.g, 3.4, 6.5));
  report('wheelspin off the line', `${(lan.slipRatio * 100).toFixed(0)} % slip ratio in first`,
    'REFERENCE §3.10: first gear is traction-limited', lan.slipRatio > 0.12);

  head('Reverse');
  const rev = reverseRun();
  report('reverse gear', `${rev.speed.toFixed(1)} m/s backwards, lamp ${rev.lampOn ? 'on' : 'off'}`,
    'negative speed and reversing lamps lit', rev.speed < -1 && rev.lampOn);

  head('Frame-rate independence');
  const fr = frameRateSweep();
  for (const [label, v] of fr.times) console.log(`      ${label.padEnd(16)} 0-60 = ${v.toFixed(3)} s`);
  // What is left is the *driver*, not the integrator: the shift command is
  // issued once per rendered frame, so at 30 fps the change up can land a
  // whole 33 ms late. The physics itself is identical.
  report('0-60 across 30-500 fps', `${(fr.spread * 1000).toFixed(0)} ms spread`,
    'fixed 480 Hz step: under one frame at 30 fps', fr.spread < 0.08);

  head('Robustness — 60 seconds of abuse');
  const ab = abuseRun();
  report('state stays finite', ab.finite ? 'yes' : 'no', 'every field, every frame', ab.finite);
  report('NaN recoveries under abuse', `${ab.nan}`, '0', ab.nan === 0);
  report('stays on its wheels', `max tilt ${((ab.maxTilt * 180) / Math.PI).toFixed(1)}°`,
    'a road car should never get near 45°', ab.maxTilt < Math.PI / 4);

  head('Parked, 60 seconds');
  const pk = parkedRun();
  report('position drift', `${(pk.drift * 1000).toFixed(3)} mm`, '< 1 mm', pk.drift < 0.001);
  report('ride height drift', `${(pk.heightDrift * 1000).toFixed(4)} mm`, '< 0.1 mm', pk.heightDrift < 1e-4);
  report('suspension jitter', `${(pk.jitter * 100).toFixed(4)} % of travel`, '< 0.5 %', pk.jitter < 0.005);
  report('NaN recoveries', `${pk.nan}`, '0', pk.nan === 0);
  report('static ride height', `${(pk.rideFront * 1000).toFixed(1)} / ${(pk.rideRear * 1000).toFixed(1)} mm f/r`,
    `${(tyreRadius() * 1000).toFixed(1)} mm design`,
    Math.abs(pk.rideFront - tyreRadius()) < 0.002 && Math.abs(pk.rideRear - tyreRadius()) < 0.002);

  // --- table ---------------------------------------------------------------
  const w1 = Math.max(...rows.map((r) => r.name.length));
  const w2 = Math.max(...rows.map((r) => r.measured.length));
  head('Summary');
  for (const r of rows) {
    const mark = r.ok ? '[32m  ok [0m' : '[31mFAIL [0m';
    console.log(`  ${mark} ${r.name.padEnd(w1)}  ${r.measured.padEnd(w2)}  [2m${r.reference}[0m`);
  }
  console.log(`\n  ${rows.length - failures}/${rows.length} within band\n`);
  // `@types/node` is not a dependency of this project and is not worth adding
  // for one line, so the exit code is set through `globalThis`.
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (failures > 0 && proc) proc.exitCode = 1;
}

main();

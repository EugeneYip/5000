/**
 * Bootstrap.
 *
 * Builds the stage, the environment, the car and the vehicle simulation, wires
 * input and UI, then runs the frame loop. Also publishes `window.__AUDI`, the
 * debug surface the screenshot harness drives.
 */

import * as THREE from 'three';
import { Stage, assertWebGL2 } from '@/scene/Stage';
import { CameraRig } from '@/scene/CameraRig';
import { buildEnvironment, type EnvironmentHandle } from '@/scene/Environment';
import { createPostChain, type PostChain } from '@/scene/Post';
import { createMaterialLibrary } from '@/materials/library';
import { Car } from '@/car/Car';
import { VehicleSim } from '@/physics/VehicleSim';
import { InputController } from '@/ui/input';
import { createHud, type Hud } from '@/ui/hud';
import { EngineAudio } from '@/audio/EngineAudio';
import { rigFrame } from '@/ui/rigLink';
import type { ViewName, VehicleState } from '@/types';

declare global {
  // eslint-disable-next-line no-var
  var __AUDI: AudiDebugApi | undefined;
}

interface AudiDebugApi {
  ready: boolean;
  setView(name: ViewName): boolean;
  setEnvironment(name: string): void;
  setPaint(hex: number): void;
  setArticulation(name: string, open: number): void;
  setUiVisible(v: boolean): void;
  settle(frames?: number): void;
  measureFps(frames?: number): Promise<{ fps: number; ms: number; drawCalls: number; triangles: number }>;
  elapsed(): number;
  state(): VehicleState | null;
  stats(): Record<string, unknown>;
  three: typeof THREE;
}

const bootEl = document.getElementById('boot')!;
const bootBar = document.getElementById('boot-bar') as HTMLElement;
const bootPct = document.getElementById('boot-pct') as HTMLElement;

function setProgress(f: number, label?: string): void {
  const pct = Math.round(THREE.MathUtils.clamp(f, 0, 1) * 100);
  bootBar.style.width = `${pct}%`;
  bootPct.textContent = label ? `${pct}% · ${label}` : `${pct}%`;
}

async function main(): Promise<void> {
  if (!assertWebGL2()) {
    document.getElementById('nogl')!.classList.add('show');
    bootEl.classList.add('done');
    return;
  }

  const container = document.getElementById('app')!;
  const stage = new Stage({ container });

  setProgress(0.02, 'environment');
  const materials = createMaterialLibrary(stage.renderer);
  const env: EnvironmentHandle = await buildEnvironment(stage.scene, stage.renderer, {
    onProgress: (f) => setProgress(0.02 + f * 0.18, 'environment'),
  });
  materials.setEnvMap(env.envMap);

  setProgress(0.2, 'body');
  const car = await Car.build({
    materials,
    envMap: env.envMap,
    renderer: stage.renderer,
    progress: (f, label) => setProgress(0.2 + f * 0.6, label),
  });
  stage.scene.add(car.root);
  for (const part of car.parts.values()) {
    for (const l of part.lights ?? []) stage.scene.add(l);
  }

  setProgress(0.82, 'physics');
  const sim = new VehicleSim(car);

  setProgress(0.88, 'post');
  const post: PostChain = createPostChain(stage, env);
  stage.setComposer(post);

  const rig = new CameraRig(stage.camera);
  const input = new InputController(container);
  const hud: Hud = createHud(container);
  const audio = new EngineAudio();

  // Keyboard shortcuts that are not driving inputs.
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === '1') rig.setView('front3q');
    else if (k === '2') rig.setView('rear3q');
    else if (k === '3') rig.setView('side');
    else if (k === '4') rig.setView('interior');
    else if (k === '5') rig.setView('chase');
    else if (k === '6') rig.setView('hood');
    else if (k === '0') rig.setView('orbit');
    else if (k === 'o') car.toggleArticulation('doorFL');
    else if (k === 'p') car.toggleArticulation('hood');
    else if (k === 'l') car.toggleArticulation('tailgate');
  });

  // --- warm up ---------------------------------------------------------------
  // Compile every shader before the first visible frame, otherwise the opening
  // seconds stutter while programs link.
  setProgress(0.94, 'shaders');
  stage.renderer.compile(stage.scene, stage.camera);
  rig.snap();
  stage.settle(4);

  setProgress(1, 'ready');
  bootEl.classList.add('done');

  // --- frame loop ------------------------------------------------------------
  let elapsed = 0;
  let lastState: VehicleState | null = null;

  const frame = (): void => {
    const dt = stage.render();
    elapsed += dt;

    const controls = input.sample(dt);
    const state = sim.step(dt, controls);
    lastState = state;

    car.update(dt, elapsed, state);
    materials.update(dt, elapsed);
    env.update(dt, elapsed);
    rig.update(dt, car.root, state);
    post.setPose(rig.currentPose());

    // Publish the frame here rather than leaving the audio and HUD modules to
    // monkey-patch CameraRig.prototype to get at it. `time` is the app's own
    // `elapsed`, which matters: the lamp flasher runs off it, so a HUD
    // tell-tale or a relay tick keyed to `performance.now()` instead can sit
    // up to a third of a second out of phase with the lamp it represents.
    // `RigFrame.rig` is structurally typed and reads `camera`, which is
    // private on CameraRig. Same object either way.
    rigFrame.rig = rig as unknown as typeof rigFrame.rig;
    rigFrame.camera = stage.camera;
    rigFrame.carRoot = car.root;
    rigFrame.state = state;
    rigFrame.time = elapsed;

    hud.update(state, stage.stats());
    audio.update(state);

    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // --- debug surface ---------------------------------------------------------
  globalThis.__AUDI = {
    ready: true,
    three: THREE,
    setView(name) {
      const ok = rig.setView(name);
      rig.snapNext = true;
      return ok;
    },
    setEnvironment(name) { env.setPreset(name); },
    setPaint(hex) { materials.setPaintColor(hex); },
    setArticulation(name, open) { car.setArticulation(name, open); },
    setUiVisible(v) { hud.setVisible(v); },
    settle(frames = 24) {
      for (let i = 0; i < frames; i++) {
        const dt = 1 / 60;
        elapsed += dt;
        const state = sim.step(dt, input.neutral());
        car.update(dt, elapsed, state);
        materials.update(dt, elapsed);
        rig.update(dt, car.root, state);
        post.setPose(rig.currentPose());
        stage.render();
      }
    },
    async measureFps(frames = 120) {
      for (let i = 0; i < frames; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      const s = stage.stats();
      return { fps: s.fps, ms: s.ms, drawCalls: s.drawCalls, triangles: s.triangles };
    },
    elapsed: () => elapsed,
    state: () => lastState,
    stats: () => ({ ...stage.stats(), carTriangles: car.triangleCount(), parts: [...car.parts.keys()], articulations: [...car.articulations.keys()] }),
  };
}

main().catch((err) => {
  console.error(err);
  bootPct.textContent = `failed: ${err?.message ?? err}`;
  bootBar.style.background = '#d04a4a';
});

/**
 * Bootstrap.
 *
 * Builds the stage, the environment, the car and the vehicle simulation, wires
 * input and UI, then runs the frame loop. Also publishes `window.__AUDI`, the
 * debug surface the screenshot harness drives.
 */

import * as THREE from 'three';
import { Stage, assertWebGL2 } from '@/scene/Stage';
import { CameraRig, POSES } from '@/scene/CameraRig';
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
  setMaskMode(mode: 'off' | 'car' | 'paint'): void;
  pick(x: number, y: number): Record<string, unknown>[];
  census(): Record<string, number>;
  bbox(match: string): Record<string, unknown>[];
  setPose(name: string, patch: Record<string, unknown>): unknown;
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
  const maskMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide });
  const maskSaved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  let maskMode: 'off' | 'car' | 'paint' = 'off';

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
    // Used by the screenshot harness to shoot a silhouette frame, from which
    // the review tools derive an exact mask.
    //
    // Deriving the mask from the image instead — "a pixel far from its own
    // row's median is car" — worked only while the background was a smooth
    // gradient. Once the environment grew trees, road texture and a HUD, that
    // mask covered 57 % of the frame, so every per-car figure read through it
    // was really a whole-scene figure, and the tone calibration was steered by
    // it for several rounds.
    //
    // Magenta rather than hiding the car, because hiding it also removes its
    // cast and contact shadows, and those land on road the mask must not
    // claim. Nothing else in the scene has both R and B far above G, so the
    // test survives the grade; bloom could defeat it, so `post.setMaskMode`
    // stands bloom and defocus down while this is on.
    //
    // `'paint'` marks only the meshes wearing the body colour. The colour gate
    // needs that and cannot infer it: at the `photomatch` pose there is no
    // vertical fender face in frame at all, so a gate that goes looking for
    // "a near-neutral mid-value patch on the car" finds the grille, and then
    // asks the grille to be the colour of a fender.
    setMaskMode(mode) {
      const next = mode === 'off' ? 'off' : mode;
      if (next === maskMode) return;
      for (const [m, prev] of maskSaved) m.material = prev;
      maskSaved.clear();
      maskMode = next;
      post.setMaskMode(next !== 'off');
      if (next === 'off') return;
      const paintMat = materials.paint();
      car.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (next === 'paint' && m.material !== paintMat) return;
        maskSaved.set(m, m.material);
        m.material = maskMat;
      });
    },
    /**
     * What mesh is at this pixel? `x` and `y` are fractions of the frame.
     *
     * Every review round so far has had at least one "what IS that" moment —
     * a cream cylinder at the bumper corner, a black void beside a headlamp —
     * and answering it by reading geometry code has been slow and twice
     * wrong. This answers it in one call, with the node path and the material
     * the registry issued, so a defect can be attributed before it is
     * theorised about.
     */
    pick(x, y) {
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), stage.camera);
      const path = (o: THREE.Object3D): string => {
        const parts: string[] = [];
        for (let n: THREE.Object3D | null = o; n && n !== stage.scene; n = n.parent) {
          if (n.name) parts.unshift(n.name);
        }
        return parts.join('/');
      };
      const r3 = (v: number): number => Math.round(v * 1000) / 1000;
      return ray.intersectObject(stage.scene, true).slice(0, 8).map((h) => {
        const m = h.object as THREE.Mesh;
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        // World normal, because the usual answer to "why is this pixel the
        // wrong brightness" is that it is facing somewhere unexpected.
        const n = h.normal
          ? h.normal.clone().applyNormalMatrix(
              new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize()
          : null;
        return {
          name: m.name || '(unnamed)',
          path: path(m),
          material: `${mat?.type ?? '?'}#${mat?.name || mat?.uuid.slice(0, 6) || '?'}`,
          distance: r3(h.distance),
          point: h.point ? [r3(h.point.x), r3(h.point.y), r3(h.point.z)] : null,
          normal: n ? [r3(n.x), r3(n.y), r3(n.z)] : null,
          uv: h.uv ? [r3(h.uv.x), r3(h.uv.y)] : null,
          receiveShadow: m.receiveShadow,
          castShadow: m.castShadow,
        };
      });
    },

    /**
     * Geometry counted ONCE, by traversal, beside what `renderer.info` says.
     *
     * The two differ by however many times the scene is rasterised in a
     * frame, and that number is not a constant anyone can write down: it
     * depends on which passes re-render (the transmission pass does, GTAO
     * stopped when it was handed the colour pass's depth) and on what
     * survives frustum culling in each. A fixed correction factor written
     * into a document goes stale silently, and this project has already sent
     * agents optimising a car that was inside budget twice over, once in each
     * direction. So: measure it, do not remember it.
     *
     * `hidden` is counted separately because `renderer.info` will not see it,
     * and the spin-blur discs and several interior parts are invisible at
     * rest — hiding the car root and taking the delta gives the car's meshes
     * times the pass count, not the car's meshes.
     */
    census() {
      let meshes = 0, hidden = 0, tris = 0, materials = 0;
      const seen = new Set<string>();
      stage.scene.traverse((o) => {
        const m = o as THREE.Mesh & { isInstancedMesh?: boolean; count?: number };
        if (!m.isMesh) return;
        let up: THREE.Object3D | null = o;
        for (; up; up = up.parent) if (!up.visible) break;
        if (up) { hidden++; return; }
        meshes++;
        const g = m.geometry;
        const n = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        tris += n * (m.isInstancedMesh ? (m.count ?? 1) : 1);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (mat && !seen.has(mat.uuid)) { seen.add(mat.uuid); materials++; }
        }
      });
      const info = stage.renderer.info.render;
      return {
        meshes, hidden, triangles: Math.round(tris), materials,
        reportedCalls: info.calls, reportedTriangles: info.triangles,
        passMultiplier: meshes ? Math.round((info.calls / meshes) * 100) / 100 : 0,
      };
    },

    /**
     * World-space bounds of every mesh whose name contains `match`.
     *
     * Each mesh's OWN `geometry.boundingBox` transformed by its
     * `matrixWorld` — never `Box3.setFromObject`, which descends into
     * children. Several nodes here are shared parents: `tailgatePanel` alone
     * carries the inner taillamps, the plate, the ribbed panel and the rear
     * wiper, contributed by three different streams, and probing it with
     * `setFromObject` once reported 52,794 triangles for a 3,548-triangle
     * panel and looked exactly like a corruption bug. Written correctly once,
     * here, so nobody has to get it right again.
     */
    bbox(match) {
      const out: Record<string, unknown>[] = [];
      const r3 = (v: number): number => Math.round(v * 1000) / 1000;
      stage.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.name.toLowerCase().includes(match.toLowerCase())) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
        const g = m.geometry;
        out.push({
          name: m.name,
          visible: m.visible,
          min: [r3(b.min.x), r3(b.min.y), r3(b.min.z)],
          max: [r3(b.max.x), r3(b.max.y), r3(b.max.z)],
          triangles: Math.round((g.index ? g.index.count : g.attributes.position.count) / 3),
        });
      });
      return out;
    },

    /**
     * Override a named pose in place, so a camera can be searched for in one
     * browser session instead of one edit-and-render cycle per candidate.
     *
     * The `dash` pose cost several of those cycles before this existed: the
     * instrument pack sits under an overhang and behind a steering wheel, and
     * where a camera has to stand to see past both is not something you can
     * read off the hardpoints — the binnacle hood is part of the batched dash
     * shell and has no bounds of its own to consult.
     */
    setPose(name, patch) {
      const p = (POSES as unknown as Record<string, Record<string, unknown>>)[name];
      if (!p) return null;
      Object.assign(p, patch);
      rig.setView(name as ViewName);
      rig.snapNext = true;
      return { ...p };
    },

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

/**
 * Post-processing chain.
 *
 * Order matters and is physical, not arbitrary — each stage sits where the
 * corresponding thing happens in a real camera:
 *
 *   1. scene → 2× MSAA half-float buffer   (the sensor, oversampled)
 *   2. GTAO                                (contact occlusion, in linear light)
 *   3. depth of field                      (the lens defocuses before the film)
 *   4. bloom                               (veiling glare inside the lens)
 *   5. progressive accumulation            (more shading samples while still)
 *   6. grade → screen                      (tonemap, curve, aberration, grain)
 *
 * Screen-space reflections are deliberately absent. Three's `SSRPass` needs a
 * second depth+normal prepass and still swims badly on curved panels and at
 * grazing angles, which is precisely where a car body spends its time. A
 * prefiltered environment map with a proxy world in it is more stable and, on
 * a subject this reflective, more convincing. That judgement is the whole
 * reason the IBL scene has trees and buildings in it.
 *
 * Anti-aliasing is 2× MSAA plus the accumulation pass. MSAA alone fixes
 * silhouettes; it does nothing for the specular crawl on chrome trim and panel
 * gaps, which is what actually reads as "computer graphics". The accumulation
 * pass supersamples the *shading* whenever the camera and the car are still,
 * and drops to a single sample the instant anything moves, so there is no
 * ghosting to trade against.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Stage } from './Stage';
import type { EnvironmentHandle } from './Environment';
import { focusDistanceFor, type Pose } from './CameraRig';
import { AccumulationPass, DofPass, GradePass, ScaledGtaoPass } from './post/passes';

export interface PostChain {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  setPose(pose: Pose | null): void;
}

const CAR_ROOT = 'Audi5000SWagon';

/**
 * Fraction of the output resolution the ambient occlusion is computed at.
 * See `ScaledGtaoPass`: this one number was worth 20 ms of a 112 ms frame.
 */
const AO_SCALE = 0.5;

export function createPostChain(stage: Stage, env: EnvironmentHandle): PostChain {
  const { renderer, scene, camera } = stage;
  const pr = renderer.getPixelRatio();
  let width = Math.max(1, Math.round(stage.width * pr));
  let height = Math.max(1, Math.round(stage.height * pr));

  // 2× MSAA on a half-float buffer.
  //
  // This was 4×, and 4× multisampling a 16-bit-float target is expensive in a
  // way 4× multisampling an 8-bit one is not: the tile store is 32 bytes a
  // sample, so the raster tiles shrink and the resolve moves four times the
  // bytes. Measured on the hero frame at 1600×900 on an M2, samples 4 → 2 was
  // worth 17 ms of a 78 ms frame, and 4 → 0 worth 31 ms.
  //
  // Almost nothing is given up. MSAA only contributes while something is
  // moving: the moment the scene is still the accumulation pass supersamples
  // the whole frame sixteen ways, which is better coverage than 4× MSAA and
  // also fixes the specular crawl MSAA cannot touch. Every reviewed still is
  // therefore identical. Two samples are kept rather than none because while
  // the car is being driven the accumulator is reset every frame and MSAA is
  // the only anti-aliasing left.
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 2,
    stencilBuffer: false,
  });

  const composer = new EffectComposer(renderer, target);
  // EffectComposer applies the renderer's pixel ratio on top of whatever it is
  // handed; the sizes above are already device pixels.
  composer.setPixelRatio(1);

  const renderPass = new RenderPass(scene, camera);

  const gtao = new ScaledGtaoPass(scene, camera, width, height, AO_SCALE);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.updateGtaoMaterial({
    // 22 cm: the scale of a wheel arch lip and a bumper undercut. Larger and
    // the whole lower body starts to look grubby rather than occluded.
    radius: 0.22,
    distanceExponent: 1.4,
    thickness: 0.35,
    scale: 1.0,
    samples: 16,
    screenSpaceRadius: false,
  });
  gtao.updatePdMaterial({ lumaPhi: 8, depthPhi: 1.6, normalPhi: 4, radius: 6, samples: 16 });

  const dof = new DofPass(camera);
  dof.setDepth(gtao.depthTexture);

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.22, 0.5, 1.15);

  const accum = new AccumulationPass(width, height);
  const grade = new GradePass();

  composer.addPass(renderPass);
  composer.addPass(gtao);
  composer.addPass(dof);
  composer.addPass(bloom);
  composer.addPass(accum);
  composer.addPass(grade);

  // The GTAO pass re-renders the scene for its normal buffer, and every
  // `renderer.render` re-runs the shadow maps while `autoUpdate` is on. At
  // 4096² VSM that is a second full blur of a 16 M-texel map for nothing.
  // Drive it manually instead: one update per frame, before the chain runs.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const applyGrade = (): void => {
    const g = env.grade;
    grade.apply(g);
    bloom.strength = g.bloomStrength;
    bloom.threshold = g.bloomThreshold;
    bloom.radius = g.bloomRadius;
    gtao.blendIntensity = g.aoIntensity;
    gtao.updateGtaoMaterial({ radius: g.aoRadius, distanceExponent: 1.4, thickness: 0.35, scale: 1, samples: 16, screenSpaceRadius: false });
  };
  let revision = -1;

  // --- motion detection ------------------------------------------------------
  // Accumulation is only safe while nothing moves, so everything that can move
  // has to be watched. The camera and the car's *root* cover orbiting, the
  // named pose transitions and driving — but not the articulations, which
  // swing a hinge group deep inside the car and leave the root alone. That is
  // why an opening bonnet used to smear for seconds: the chain never noticed
  // the panel moving, kept averaging frames of it at different angles, and
  // then sat on that average until something unrelated moved. So the test
  // walks the car's nodes.
  //
  // It compares against a threshold rather than hashing. A parked car is still
  // being integrated by the physics every frame and its transforms drift in
  // the low bits; an exact comparison would reset the accumulator forever and
  // leave every still at one sample. The thresholds are set just under what a
  // pixel can show — a fifth of a millimetre of travel, and a rotation that
  // moves the far corner of the body by about the same.
  //
  // The reference state is only updated when a move is *accepted*, so a drift
  // too slow to trip the test on any single frame still trips it once it has
  // added up to something visible.
  const baseProj = new THREE.Matrix4();
  const jitter = new THREE.Vector2();
  let carRoot: THREE.Object3D | null = null;
  let carNodes: THREE.Object3D[] = [];
  let lookups = 0;

  /** Metres. */
  const POS_EPS = 2e-4;
  /** Quaternion components; ×2 rad, so ~0.2 mm at a 2.5 m radius. */
  const ROT_EPS = 4e-5;

  /** 16 matrix elements plus the two projection terms a pose can animate. */
  const CAM = 18;
  const PER_NODE = 7;
  let prev = new Float64Array(CAM);
  let prevValid = false;

  const collectCarNodes = (): void => {
    carNodes.length = 0;
    if (carRoot) carRoot.traverse((o) => carNodes.push(o));
    const want = CAM + carNodes.length * PER_NODE;
    if (prev.length !== want) {
      prev = new Float64Array(want);
      prevValid = false;
    }
  };

  /**
   * True if anything visible has moved since the last accepted state. Reads
   * the *local* transforms: `Articulation.apply()` writes them the frame
   * before the renderer folds them into `matrixWorld`, so the locals see a
   * move on the same frame it is first rendered.
   */
  const moved = (): boolean => {
    // Parts arrive asynchronously, so keep re-reading the graph until it stops
    // growing, then only occasionally in case a stream adds something later.
    if (lookups++ % 30 === 0) {
      if (!carRoot) carRoot = scene.getObjectByName(CAR_ROOT) ?? null;
      collectCarNodes();
    }

    let dirty = !prevValid;
    const e = camera.matrixWorld.elements;
    // 0–11 are the basis, so an epsilon on them is an angle; 12–15 are the
    // translation, so it is a distance.
    for (let i = 0; i < 16; i++) {
      if (Math.abs(e[i] - prev[i]) > (i < 12 ? ROT_EPS : POS_EPS)) dirty = true;
    }
    if (Math.abs(camera.fov - prev[16]) > 1e-3 || Math.abs(camera.aspect - prev[17]) > 1e-4) dirty = true;

    for (let n = 0, k = CAM; n < carNodes.length; n++, k += PER_NODE) {
      const p = carNodes[n].position;
      const q = carNodes[n].quaternion;
      if (
        Math.abs(p.x - prev[k]) > POS_EPS ||
        Math.abs(p.y - prev[k + 1]) > POS_EPS ||
        Math.abs(p.z - prev[k + 2]) > POS_EPS ||
        Math.abs(q.x - prev[k + 3]) > ROT_EPS ||
        Math.abs(q.y - prev[k + 4]) > ROT_EPS ||
        Math.abs(q.z - prev[k + 5]) > ROT_EPS ||
        Math.abs(q.w - prev[k + 6]) > ROT_EPS
      ) {
        dirty = true;
        break;
      }
    }

    if (!dirty) return false;

    for (let i = 0; i < 16; i++) prev[i] = e[i];
    prev[16] = camera.fov;
    prev[17] = camera.aspect;
    for (let n = 0, k = CAM; n < carNodes.length; n++, k += PER_NODE) {
      const p = carNodes[n].position;
      const q = carNodes[n].quaternion;
      prev[k] = p.x; prev[k + 1] = p.y; prev[k + 2] = p.z;
      prev[k + 3] = q.x; prev[k + 4] = q.y; prev[k + 5] = q.z; prev[k + 6] = q.w;
    }
    prevValid = true;
    return true;
  };

  let elapsed = 0;
  let frameCount = 0;

  // TEMP-PROBE (removed before hand-off)
  (globalThis as any).__POST_PROBE = { renderer, scene, camera, composer, renderPass, gtao, dof, bloom, accum, grade, env };

  return {
    render(dt: number): void {
      elapsed += dt;
      grade.setTime(elapsed * 60);

      if (revision !== env.revision) {
        revision = env.revision;
        applyGrade();
        accum.reset();
      }

      const inMotion = moved();
      if (inMotion) accum.reset();

      // Several poses are stopped down far enough to be sharp throughout. The
      // shader already exits early for those, but a full-screen quad that only
      // copies is still a full-screen quad; skipping the pass also saves the
      // composer a buffer swap.
      dof.enabled = dof.active;

      // A 4096² VSM map costs two blur passes over 16 M texels. Re-running
      // that when nothing has moved is pure waste, so the shadow follows the
      // same motion signal the accumulation does, with a periodic refresh to
      // catch anything the signature cannot see (wheels turning on the spot,
      // a door opening).
      frameCount++;
      renderer.shadowMap.needsUpdate = inMotion || accum.index <= 2 || frameCount % 15 === 0;

      // Sub-pixel jitter for this accumulation sample. Perspective projections
      // shear cleanly: nudging m02/m12 slides the whole frustum sideways
      // without changing its shape, which is what a sensor shift does.
      camera.updateProjectionMatrix();
      baseProj.copy(camera.projectionMatrix);
      if (!accum.converged) {
        accum.jitter(jitter);
        const e = camera.projectionMatrix.elements;
        e[8] += (jitter.x * 2) / width;
        e[9] += (jitter.y * 2) / height;
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      }

      composer.render(dt);

      camera.projectionMatrix.copy(baseProj);
      camera.projectionMatrixInverse.copy(baseProj).invert();
    },

    setSize(w: number, h: number): void {
      width = Math.max(1, Math.round(w * renderer.getPixelRatio()));
      height = Math.max(1, Math.round(h * renderer.getPixelRatio()));
      composer.setSize(width, height);
      dof.setDepth(gtao.depthTexture);
      accum.reset();
      prevValid = false;
    },

    setPose(pose: Pose | null): void {
      if (!pose || pose.aperture === undefined) {
        dof.setLens(null);
        return;
      }
      dof.setLens({
        focalMm: pose.focalMm,
        aperture: pose.aperture,
        focusDistance: focusDistanceFor(pose),
      });
    },
  };
}

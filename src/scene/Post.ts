/**
 * Post-processing chain.
 *
 * Order matters and is physical, not arbitrary — each stage sits where the
 * corresponding thing happens in a real camera:
 *
 *   1. scene → 4× MSAA half-float buffer   (the sensor, oversampled)
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
 * Anti-aliasing is 4× MSAA plus the accumulation pass. MSAA alone fixes
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
import { AccumulationPass, DofPass, GradePass } from './post/passes';

export interface PostChain {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  setPose(pose: Pose | null): void;
}

const CAR_ROOT = 'Audi5000SWagon';

export function createPostChain(stage: Stage, env: EnvironmentHandle): PostChain {
  const { renderer, scene, camera } = stage;
  const pr = renderer.getPixelRatio();
  let width = Math.max(1, Math.round(stage.width * pr));
  let height = Math.max(1, Math.round(stage.height * pr));

  // 4× MSAA on a half-float buffer. Eight would cost another 66 MB a target
  // for a difference nobody can point at once the accumulation pass is doing
  // the shading samples.
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 4,
    stencilBuffer: false,
  });

  const composer = new EffectComposer(renderer, target);
  // EffectComposer applies the renderer's pixel ratio on top of whatever it is
  // handed; the sizes above are already device pixels.
  composer.setPixelRatio(1);

  const renderPass = new RenderPass(scene, camera);

  const gtao = new GTAOPass(scene, camera, width, height);
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
  // Accumulation is only safe while nothing moves. Watching the camera and the
  // car's root transform catches every case that matters: orbiting, the named
  // pose transitions, and driving.
  const baseProj = new THREE.Matrix4();
  const jitter = new THREE.Vector2();
  let lastSig = NaN;
  let carRoot: THREE.Object3D | null = null;
  let lookups = 0;

  const signature = (): number => {
    if (!carRoot && lookups++ % 30 === 0) carRoot = scene.getObjectByName(CAR_ROOT) ?? null;
    let s = 0;
    const e = camera.matrixWorld.elements;
    for (let i = 0; i < 16; i++) s = s * 1.000137 + e[i] * (i + 3);
    s += camera.fov * 7.31 + camera.aspect * 3.17;
    if (carRoot) {
      const c = carRoot.matrixWorld.elements;
      for (let i = 0; i < 16; i++) s = s * 1.000091 + c[i] * (i + 11);
    }
    return s;
  };

  let elapsed = 0;
  let frameCount = 0;

  return {
    render(dt: number): void {
      elapsed += dt;
      grade.setTime(elapsed * 60);

      if (revision !== env.revision) {
        revision = env.revision;
        applyGrade();
        accum.reset();
      }

      const sig = signature();
      const moved = sig !== lastSig;
      if (moved) {
        accum.reset();
        lastSig = sig;
      }

      // A 4096² VSM map costs two blur passes over 16 M texels. Re-running
      // that when nothing has moved is pure waste, so the shadow follows the
      // same motion signal the accumulation does, with a periodic refresh to
      // catch anything the signature cannot see (wheels turning on the spot,
      // a door opening).
      frameCount++;
      renderer.shadowMap.needsUpdate = moved || accum.index <= 2 || frameCount % 15 === 0;

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
      lastSig = NaN;
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

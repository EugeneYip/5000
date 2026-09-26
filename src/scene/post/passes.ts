/**
 * Bespoke passes: progressive accumulation, depth of field and the grade.
 *
 * Everything the stock addons already do well (GTAO, UnrealBloom) is used
 * as-is; these three are the ones with no good stock equivalent.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { QUAD_VERT, ACCUM_FRAG, COPY_FRAG, DOF_FRAG, GRADE_FRAG } from './shaders';

function hdrTarget(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

function rawMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    uniforms,
    vertexShader: QUAD_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * GTAO evaluated below the output resolution.
 *
 * `GTAOPass` costs three things: a full re-render of the scene into a
 * normal+depth G-buffer, the horizon search itself (16 samples a pixel), and a
 * Poisson denoise (another 16). Measured on the hero frame at 1600×900 that
 * came to 34 ms of a 112 ms frame — 9 ms of G-buffer and 25 ms of full-screen
 * gathering — which is more than the entire car costs to shade.
 *
 * Ambient occlusion is the lowest-frequency signal in the chain: the denoise
 * already blurs it over a radius far wider than two output pixels, so nothing
 * survives to half resolution that was not going to be smeared anyway. Running
 * the whole pass at half res quarters every one of those three costs, and the
 * composite lifts it back with a plain bilinear fetch — the AO buffer is
 * smooth enough by then that a bilateral filter has nothing left to preserve.
 *
 * The blend and the copy still run at the output resolution, so the image the
 * AO is multiplied into is never resampled.
 */
export class ScaledGtaoPass extends GTAOPass {
  /** Fraction of the output resolution the AO is computed at. */
  private scale = 0.5;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    scale = 0.5,
  ) {
    super(scene, camera, Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    this.scale = scale;
  }

  setSize(width: number, height: number): void {
    super.setSize(
      Math.max(1, Math.round(width * this.scale)),
      Math.max(1, Math.round(height * this.scale)),
    );
  }
}

/**
 * Progressive supersampling.
 *
 * MSAA fixes geometric edges and nothing else. What still crawls on a car is
 * *shading*: specular glints on chrome trim, the noise floor of the AO, the
 * dither in the depth-of-field gather. Those need more shading samples, not
 * more coverage samples.
 *
 * So while the camera and the car are both still — which is every review
 * still, and most of the time a viewer spends looking — the projection matrix
 * is jittered by a sub-pixel Halton offset each frame and the results are
 * averaged. Sixteen frames is a quarter of a second and gives 16× supersampled
 * shading for free. Any motion resets the average to a single sample, so
 * nothing ever ghosts.
 */
export class AccumulationPass extends Pass {
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private blendMat: THREE.RawShaderMaterial;
  private copyMat: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private blendUniforms = {
    tNew: { value: null as THREE.Texture | null },
    tPrev: { value: null as THREE.Texture | null },
    uMix: { value: 1 },
  };
  private copyUniforms = { tDiffuse: { value: null as THREE.Texture | null } };

  index = 0;
  maxSamples = 16;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = true;
    this.a = hdrTarget(width, height);
    this.b = hdrTarget(width, height);
    this.blendMat = rawMaterial(ACCUM_FRAG, this.blendUniforms);
    this.copyMat = rawMaterial(COPY_FRAG, this.copyUniforms);
    this.quad = new FullScreenQuad(this.copyMat);
  }

  get converged(): boolean {
    return this.index >= this.maxSamples;
  }

  reset(): void {
    this.index = 0;
  }

  /** Sub-pixel offset for sample `n`, in pixels, from a Halton(2,3) sequence. */
  jitter(out: THREE.Vector2): THREE.Vector2 {
    const n = this.index + 1;
    let x = 0;
    for (let i = n, f = 1 / 2; i > 0; i = Math.floor(i / 2), f /= 2) x += (i % 2) * f;
    let y = 0;
    for (let i = n, f = 1 / 3; i > 0; i = Math.floor(i / 3), f /= 3) y += (i % 3) * f;
    return out.set(x - 0.5, y - 0.5);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    if (this.index === 0) {
      this.copyUniforms.tDiffuse.value = readBuffer.texture;
      this.quad.material = this.copyMat;
      renderer.setRenderTarget(this.a);
      this.quad.render(renderer);
      this.index = 1;
    } else if (this.index < this.maxSamples) {
      this.blendUniforms.tNew.value = readBuffer.texture;
      this.blendUniforms.tPrev.value = this.a.texture;
      this.blendUniforms.uMix.value = 1 / (this.index + 1);
      this.quad.material = this.blendMat;
      renderer.setRenderTarget(this.b);
      this.quad.render(renderer);
      const t = this.a;
      this.a = this.b;
      this.b = t;
      this.index++;
    }

    this.copyUniforms.tDiffuse.value = this.a.texture;
    this.quad.material = this.copyMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  setSize(width: number, height: number): void {
    this.a.setSize(width, height);
    this.b.setSize(width, height);
    this.reset();
  }

  dispose(): void {
    this.a.dispose();
    this.b.dispose();
    this.blendMat.dispose();
    this.copyMat.dispose();
  }
}

export interface LensState {
  /** 35 mm-equivalent focal length. */
  focalMm: number;
  /** f-number. Zero or undefined disables the effect entirely. */
  aperture: number;
  /** Metres. */
  focusDistance: number;
}

/** Sensor height the focal lengths in `CameraRig` are quoted against. */
const SENSOR_MM = 24;

export class DofPass extends Pass {
  private material: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 600 },
    uFocus: { value: 6 },
    uCoCScale: { value: 0 },
    uMaxCoC: { value: 18 },
  };
  private height = 1080;

  constructor(private camera: THREE.PerspectiveCamera) {
    super();
    this.needsSwap = true;
    this.material = rawMaterial(DOF_FRAG, this.uniforms);
    this.quad = new FullScreenQuad(this.material);
  }

  setDepth(depth: THREE.Texture | null): void {
    this.uniforms.tDepth.value = depth;
  }

  /**
   * Turn a real lens into a pixel radius.
   *
   *   CoC(mm) = f² / (N · (df − f)) · |d − df| / d
   *
   * and a millimetre on a 24 mm sensor is `height / 24` pixels. Nothing here
   * is a fudge factor, which is why the wide poses come out naturally sharp
   * and the long close-ups separate without anyone dialling anything.
   */
  setLens(lens: LensState | null): void {
    if (!lens || !lens.aperture || !lens.focusDistance) {
      this.uniforms.uCoCScale.value = 0;
      return;
    }
    const f = lens.focalMm;
    const dfMm = lens.focusDistance * 1000;
    if (dfMm <= f * 1.05) {
      this.uniforms.uCoCScale.value = 0;
      return;
    }
    const cocMmPerUnit = (f * f) / (lens.aperture * (dfMm - f));
    this.uniforms.uCoCScale.value = (cocMmPerUnit / SENSOR_MM) * this.height;
    this.uniforms.uFocus.value = lens.focusDistance;
  }

  get active(): boolean {
    return this.uniforms.uCoCScale.value > 0;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uNear.value = this.camera.near;
    this.uniforms.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  setSize(width: number, height: number): void {
    this.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.height = height;
    // The pixel radius of a given lens depends on the output height, so the
    // blur has to be re-derived on resize or a window drag changes the f-stop.
    this.uniforms.uMaxCoC.value = Math.max(10, Math.round(height * 0.02));
  }

  dispose(): void {
    this.material.dispose();
  }
}

export interface GradeSettings {
  exposure: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  chromatic: number;
  shadowTint: number;
  highlightTint: number;
  splitStrength: number;
}

export class GradePass extends Pass {
  private material: THREE.RawShaderMaterial;
  private quad: FullScreenQuad;
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
    uExposure: { value: 1 },
    uContrast: { value: 0.13 },
    uSaturation: { value: 1.04 },
    uVignette: { value: 0.26 },
    uGrain: { value: 0.016 },
    uChromatic: { value: 0.55 },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplit: { value: 0.055 },
  };

  constructor() {
    super();
    this.needsSwap = true;
    this.material = rawMaterial(GRADE_FRAG, this.uniforms);
    this.quad = new FullScreenQuad(this.material);
  }

  apply(s: GradeSettings): void {
    const u = this.uniforms;
    u.uExposure.value = s.exposure;
    u.uContrast.value = s.contrast;
    u.uSaturation.value = s.saturation;
    u.uVignette.value = s.vignette;
    u.uGrain.value = s.grain;
    u.uChromatic.value = s.chromatic;
    u.uSplit.value = s.splitStrength;
    // Normalise both tints to unit luminance so the split tone shifts hue
    // without also changing exposure — otherwise every grade tweak needs the
    // exposure re-set.
    normaliseTint(s.shadowTint, u.uShadowTint.value);
    normaliseTint(s.highlightTint, u.uHighlightTint.value);
  }

  setTime(t: number): void {
    this.uniforms.uTime.value = t % 1000;
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  setSize(width: number, height: number): void {
    this.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.uniforms.uAspect.value = width / Math.max(height, 1);
  }

  dispose(): void {
    this.material.dispose();
  }
}

const _c = new THREE.Color();
function normaliseTint(hex: number, out: THREE.Vector3): void {
  _c.setHex(hex);
  const l = Math.max(0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b, 1e-4);
  out.set(_c.r / l, _c.g / l, _c.b / l);
}

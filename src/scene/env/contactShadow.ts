/**
 * Rendered contact occlusion.
 *
 * Without a dark pool directly under the car, the car floats. That is the
 * most common failure in WebGL vehicle scenes and no amount of sun shadow
 * fixes it: a sun shadow is cast *away* from the subject, so at the low solar
 * elevations that flatter a car there is nothing at all under the sills.
 * Screen-space AO only reaches a few centimetres, which is not the scale of
 * the occlusion a 4.9 m body throws onto the road.
 *
 * So: an orthographic camera sits just under the ground looking up, renders
 * the scene with a depth material — the depth test therefore keeps the
 * *lowest* surface over each point — and the result is blurred into an alpha
 * mask painted onto the road.
 *
 * ## One blur radius was the bug, and it was worth 15-25x
 *
 * This used to take that depth map, blur the whole of it with one ~0.40 m
 * kernel, and multiply the result by `contactStrength` as an alpha. Both
 * halves of that are wrong, and measured against `bat3_front3q.jpg` they were
 * wrong by more than an order of magnitude:
 *
 *     ground just beyond the silhouette, / open road at the same image row
 *       render   0.52 at p10, 0.34 at the darkest station
 *       photo    0.011 at p5 of the under-car void, 0.12 at its median
 *
 * The *ceiling* is the first half: alpha could never exceed `contactStrength`,
 * which is 0.5–0.8 across the presets, so the deepest the pool could ever go
 * was a 20 % transmission — and a ground point under the middle of the
 * floorpan sees essentially no sky at all. 0.2 m up and ±0.8 m wide subtends
 * 76° of half-angle, so sky visibility there is about 0.06, not 0.38.
 *
 * The *single radius* is the second half and it is the one that shows. A 0.40 m
 * penumbra is right for the roof, 0.4 m up; it is 10x too wide for a tyre,
 * which touches. So the tyre's contact — the thing that actually welds a car
 * to a road, and a crisp dark wrap in every photograph of one — arrived as the
 * same soft blob as everything else, and the blur dragged zeros in from
 * outside the silhouette across the void it was supposed to be darkening.
 *
 * So the occluder is split into three height bands and each is blurred at its
 * own radius before they are combined:
 *
 *     band        occluder height      penumbra    what is in it
 *     near        0 … 0.10 m           0.04 m      tyre contact patches
 *     mid         0 … 0.45 m           0.19 m      valance, sills, floorpan
 *     far         0 … 1.45 m           0.55 m      body sides, glass, roof
 *
 * They are deliberately **nested** rather than disjoint: the depth map holds
 * one layer, so a ground point with a tyre 5 mm above it also has a wheel
 * arch and a wing over it and the capture cannot see them separately. Nesting
 * is what lets the contact patch end up darker than the floorpan instead of
 * the other way round.
 *
 * Combination is an absorption, not a sum — `1 - exp(-Σ cᵢBᵢ)`. A sum of
 * three terms saturates by clipping, which flattens the whole core to one
 * value; an exponential saturates smoothly, so the pool keeps its shape where
 * it is deep and stays soft at the fringe where only the far band reaches.
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The depth capture runs at twice the occlusion resolution and the band
 * extract box-filters 2x2 down into it. A depth-only pass does not care about
 * resolution — there is no shading in it — and the fractional coverage this
 * buys at the band edges is exactly what the tyre's contact wrap is made of:
 * a contact patch is 160 x 140 mm, which is ten texels across at 1024 and
 * five at 512.
 */
const DEPTH_RES = 1024;
const RES = 512;
/** Nothing above this contributes. Roughly the height of the roof. */
const HEIGHT = 1.45;

/** Band ceilings, metres. Nested: each band is "an occluder below this". */
const BAND_TOP = [0.1, 0.45, HEIGHT] as const;
/** Penumbra (Gaussian sigma) each band is blurred with, metres. */
const BAND_SIGMA = [0.04, 0.19, 0.55] as const;
/**
 * Optical depth each band contributes at full coverage, per unit of
 * `contactStrength`. Calibrated at `goldenhour`'s 0.62 against the
 * photograph's under-car void: see the header.
 */
const BAND_DEPTH = [2.0, 3.4, 1.5] as const;
/** The pool is never a hole. */
const OCC_MAX = 0.985;

/**
 * A 9-tap Gaussian whose stride is **per channel**, so the three bands are
 * blurred at three radii in one pass over one target. Three separate
 * ping-pong chains would cost three times the bandwidth for the same answer.
 */
const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uDir;
uniform vec3 uStride;
uniform vec3 uDepth;
uniform float uMax;
uniform float uResolve;
varying vec2 vUv;
const float W0 = 0.2270270, W1 = 0.1945946, W2 = 0.1216216, W3 = 0.0540541, W4 = 0.0162162;
vec3 tap(float i, float w) {
  vec3 s;
  vec2 d = uDir * i;
  s.r = texture2D(tDiffuse, vUv + d * uStride.r).r + texture2D(tDiffuse, vUv - d * uStride.r).r;
  s.g = texture2D(tDiffuse, vUv + d * uStride.g).g + texture2D(tDiffuse, vUv - d * uStride.g).g;
  s.b = texture2D(tDiffuse, vUv + d * uStride.b).b + texture2D(tDiffuse, vUv - d * uStride.b).b;
  return s * w;
}
void main() {
  vec3 sum = texture2D(tDiffuse, vUv).rgb * W0
    + tap(1.0, W1) + tap(2.0, W2) + tap(3.0, W3) + tap(4.0, W4);
  sum = clamp(sum, 0.0, 1.0);
  // Absorption, not a sum. See the header.
  float occ = min(uMax, 1.0 - exp(-dot(sum, uDepth)));
  gl_FragColor = vec4(mix(sum, vec3(occ), uResolve), 1.0);
}
`;

/**
 * Depth map -> three nested band coverages, box-filtered 2x2 on the way down.
 *
 * `MeshDepthMaterial` with `BasicDepthPacking` writes `1 - fragCoordZ`, and
 * the camera is orthographic with its near plane at the road, so that is
 * `1 - y / HEIGHT` for an occluder at height y. The clear is black, so empty
 * ground reads 0 and lands at y = HEIGHT, where every band weight is already
 * zero — no separate emptiness test needed.
 *
 * Each band's weight falls off smoothly through its own ceiling rather than
 * stepping at it, so a surface that slopes up through a boundary — which is
 * most of the underbody — hands over without drawing a line.
 */
const EXTRACT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform vec3 uBandTop;
uniform float uHeight;
varying vec2 vUv;
vec3 bands(vec2 uv) {
  float y = (1.0 - texture2D(tDepth, uv).g) * uHeight;
  return vec3(
    1.0 - smoothstep(0.0, uBandTop.r, y),
    1.0 - smoothstep(0.0, uBandTop.g, y),
    1.0 - smoothstep(0.0, uBandTop.b, y));
}
void main() {
  vec2 o = uTexel * 0.5;
  gl_FragColor = vec4(0.25 * (
    bands(vUv + vec2(o.x, o.y)) + bands(vUv + vec2(-o.x, o.y)) +
    bands(vUv + vec2(o.x, -o.y)) + bands(vUv + vec2(-o.x, -o.y))), 1.0);
}
`;

const QUAD_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export interface ContactShadowHandle {
  mesh: THREE.Mesh;
  /** Re-render the occlusion mask. Call on a budget, not necessarily every frame. */
  capture(scene: THREE.Scene, hide: THREE.Object3D[]): void;
  /** Recentre and resize the capture over a world-space footprint. */
  fit(centre: THREE.Vector3, radius: number): void;
  setStrength(v: number): void;
  dispose(): void;
}

export function createContactShadow(renderer: THREE.WebGLRenderer): ContactShadowHandle {
  const rtOpts = {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  } as const;

  const depthRT = new THREE.WebGLRenderTarget(DEPTH_RES, DEPTH_RES, { ...rtOpts, depthBuffer: true });
  const pingRT = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpts, depthBuffer: false });
  const pongRT = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpts, depthBuffer: false });

  // A dedicated camera underneath the road, pointing straight up: the depth
  // test then resolves to the lowest surface rather than the highest.
  const cam = new THREE.OrthographicCamera(-4, 4, 4, -4, 0, HEIGHT);
  cam.up.set(0, 0, 1);
  cam.position.set(0, -0.004, -1.37);
  cam.lookAt(0, 1, -1.37);

  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
  depthMat.side = THREE.DoubleSide;

  const extractUniforms = {
    tDepth: { value: depthRT.texture as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / DEPTH_RES, 1 / DEPTH_RES) },
    uBandTop: { value: new THREE.Vector3(BAND_TOP[0], BAND_TOP[1], BAND_TOP[2]) },
    uHeight: { value: HEIGHT },
  };
  const extractMat = new THREE.RawShaderMaterial({
    uniforms: extractUniforms,
    vertexShader: QUAD_VERT,
    fragmentShader: EXTRACT_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const blurUniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uDir: { value: new THREE.Vector2() },
    uStride: { value: new THREE.Vector3() },
    uDepth: { value: new THREE.Vector3(BAND_DEPTH[0], BAND_DEPTH[1], BAND_DEPTH[2]) },
    uMax: { value: OCC_MAX },
    uResolve: { value: 0 },
  };
  const blurMat = new THREE.RawShaderMaterial({
    uniforms: blurUniforms,
    vertexShader: QUAD_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(extractMat);

  const tex = pongRT.texture;
  // The capture camera's +v runs along world +Z; a ground plane laid down
  // with rotateX(-90°) runs the other way, so flip the sampling rather than
  // contorting the geometry.
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, -1);
  tex.offset.set(0, 1);

  const planeGeo = new THREE.PlaneGeometry(8, 8, 1, 1);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: tex,
    transparent: true,
    // The depth of the pool is in the mask now, where it can vary with the
    // occluder's height. This stays at one: an opacity scalar is a dimmer and
    // a dimmer is exactly what the previous version was.
    opacity: 1,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(planeGeo, planeMat);
  mesh.name = 'env:contactShadow';
  mesh.position.set(0, 0.0018, -1.37);
  mesh.renderOrder = -900;
  mesh.frustumCulled = false;

  let extent = 4;
  const sigma = BAND_SIGMA.slice() as [number, number, number];
  let occMax = OCC_MAX;

  /**
   * Probe surface for the pool's own constants.
   *
   * The three band depths, their three penumbrae and the ceiling are the only
   * free parameters in here and there is no way to read a pool's darkness off
   * the code — it has to be measured through the car mask against the
   * photograph. Patches accumulate, like `__AUDI_ENV.ab`, so a sweep point
   * has to restate every field it touches. The pool is recaptured on a 16
   * frame budget, so give it twenty before screenshotting.
   */
  (globalThis as unknown as { __AUDI_GND: unknown }).__AUDI_GND = {
    pool: () => ({
      depth: blurUniforms.uDepth.value.toArray(),
      sigma: sigma.slice(),
      max: occMax,
      extent,
      texelMm: Math.round(((extent * 2) / RES) * 1e5) / 100,
    }),
    tune: (p: { depth?: number[]; sigma?: number[]; max?: number }) => {
      if (p.depth) blurUniforms.uDepth.value.fromArray(p.depth);
      if (p.sigma) for (let i = 0; i < 3; i++) sigma[i] = p.sigma[i];
      if (p.max !== undefined) {
        occMax = p.max;
        blurUniforms.uMax.value = p.max;
      }
      return { depth: blurUniforms.uDepth.value.toArray(), sigma: sigma.slice(), max: occMax };
    },
  };

  const stride = new THREE.Vector3();
  const blurPass = (
    from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget,
    dx: number, dy: number, scale: number, resolve: number,
  ): void => {
    blurMat.uniforms.tDiffuse.value = from.texture;
    blurUniforms.uDir.value.set(dx / RES, dy / RES);
    // Metres -> texels -> the 9-tap's stride. Two passes at r and 0.42r give
    // a combined sigma of 2.17r texels, which is what the constants below
    // invert; the second, narrower pass is there to fill the gaps the wide
    // one's five taps leave at the far band's radius.
    const texelM = (extent * 2) / RES;
    for (let i = 0; i < 3; i++) {
      const r = (sigma[i] / texelM) / 2.17;
      stride.setComponent(i, Math.max(0.6, r * scale));
    }
    blurUniforms.uStride.value.copy(stride);
    blurUniforms.uResolve.value = resolve;
    quad.material = blurMat;
    renderer.setRenderTarget(to);
    quad.render(renderer);
  };

  return {
    mesh,

    fit(centre, radius) {
      extent = THREE.MathUtils.clamp(radius, 2.2, 9);
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
      cam.position.set(centre.x, -0.004, centre.z);
      cam.lookAt(centre.x, 1, centre.z);
      cam.updateMatrixWorld();
      mesh.position.set(centre.x, 0.0018, centre.z);
      mesh.scale.set(extent / 4, 1, extent / 4);
      mesh.updateMatrix();
      mesh.updateMatrixWorld();
    },

    capture(scene, hide) {
      const restore = hide.map((o) => o.visible);
      for (const o of hide) o.visible = false;
      const prevTarget = renderer.getRenderTarget();
      const prevOverride = scene.overrideMaterial;
      const prevBg = scene.background;
      const prevShadow = renderer.shadowMap.enabled;
      const prevClear = renderer.getClearColor(new THREE.Color());
      const prevAlpha = renderer.getClearAlpha();

      scene.overrideMaterial = depthMat;
      scene.background = null;
      renderer.shadowMap.enabled = false;
      // Clear to 1.0 depth => "nothing here", which the depth material maps
      // to an occlusion of zero.
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(depthRT);
      renderer.clear(true, true, false);
      renderer.render(scene, cam);

      extractUniforms.tDepth.value = depthRT.texture;
      quad.material = extractMat;
      renderer.setRenderTarget(pongRT);
      quad.render(renderer);

      // Wide then narrow on each axis, and the last pass resolves the three
      // bands into one occlusion. The stride is in texels, so the penumbra
      // scales with the capture footprint and the shadow does not change
      // shape when the framing does. The chain is ordered to land in
      // `pongRT`, which is the target the alpha map reads.
      blurPass(pongRT, pingRT, 1, 0, 1.0, 0);
      blurPass(pingRT, pongRT, 0, 1, 1.0, 0);
      blurPass(pongRT, pingRT, 1, 0, 0.42, 0);
      blurPass(pingRT, pongRT, 0, 1, 0.42, 1);

      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      renderer.shadowMap.enabled = prevShadow;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
      for (let i = 0; i < hide.length; i++) hide[i].visible = restore[i];
    },

    setStrength(v) {
      blurUniforms.uDepth.value.set(
        BAND_DEPTH[0] * v, BAND_DEPTH[1] * v, BAND_DEPTH[2] * v,
      );
    },

    dispose() {
      depthRT.dispose();
      pingRT.dispose();
      pongRT.dispose();
      depthMat.dispose();
      extractMat.dispose();
      blurMat.dispose();
      planeGeo.dispose();
      planeMat.dispose();
    },
  };
}

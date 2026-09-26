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
 * mask painted onto the road. Height above the ground fades the contribution,
 * which is why the pool is near-black under the tyres and diffuse under the
 * floorpan, exactly as it is in a photograph.
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const RES = 512;
/** Nothing above this contributes. Roughly the height of the roof. */
const HEIGHT = 1.45;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uStep;
uniform float uGamma;
uniform float uFinal;
varying vec2 vUv;
void main() {
  // Nine-tap Gaussian. Two passes of this at different strides cover the
  // ~0.4 m of real penumbra without a 50-tap kernel.
  float w[5];
  w[0] = 0.2270270; w[1] = 0.1945946; w[2] = 0.1216216; w[3] = 0.0540541; w[4] = 0.0162162;
  float sum = texture2D(tDiffuse, vUv).g * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uStep * float(i);
    sum += texture2D(tDiffuse, vUv + o).g * w[i];
    sum += texture2D(tDiffuse, vUv - o).g * w[i];
  }
  // Only the last pass shapes the curve, so the intermediate stays linear.
  float v = mix(sum, pow(clamp(sum, 0.0, 1.0), uGamma), uFinal);
  gl_FragColor = vec4(vec3(v), 1.0);
}
`;

const BLUR_VERT = /* glsl */ `
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

  const depthRT = new THREE.WebGLRenderTarget(RES, RES, { ...rtOpts, depthBuffer: true });
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

  const blurUniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    uStep: { value: new THREE.Vector2() },
    uGamma: { value: 1.0 },
    uFinal: { value: 0 },
  };
  const blurMat = new THREE.RawShaderMaterial({
    uniforms: blurUniforms,
    vertexShader: BLUR_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(blurMat);

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
    opacity: 0.65,
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

  const blurPass = (from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, dx: number, dy: number, final: number): void => {
    blurUniforms.tDiffuse.value = from.texture;
    blurUniforms.uStep.value.set(dx / RES, dy / RES);
    blurUniforms.uFinal.value = final;
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

      // Blur wide then narrow: reach first, smoothness second. The stride is
      // in texels, so the penumbra scales with the capture footprint and the
      // shadow does not change shape when the framing does.
      const wide = Math.max(2, (0.38 / (extent * 2)) * RES * 0.5);
      blurPass(depthRT, pingRT, wide, 0, 0);
      blurPass(pingRT, pongRT, 0, wide, 0);
      blurPass(pongRT, pingRT, wide * 0.34, 0, 0);
      blurPass(pingRT, pongRT, 0, wide * 0.34, 1);

      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      renderer.shadowMap.enabled = prevShadow;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
      for (let i = 0; i < hide.length; i++) hide[i].visible = restore[i];
    },

    setStrength(v) {
      planeMat.opacity = v;
      // A softer roll-off at low strengths keeps the pool from looking like a
      // decal when the light is flat.
      blurUniforms.uGamma.value = THREE.MathUtils.lerp(1.5, 0.95, THREE.MathUtils.clamp(v, 0, 1));
    },

    dispose() {
      depthRT.dispose();
      pingRT.dispose();
      pongRT.dispose();
      depthMat.dispose();
      blurMat.dispose();
      planeGeo.dispose();
      planeMat.dispose();
    },
  };
}

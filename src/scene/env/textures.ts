/**
 * Procedural surface textures, rasterised on the GPU at boot.
 *
 * Doing this in a fragment shader rather than on a 2D canvas is not a micro
 * optimisation: a 1024² asphalt tile with four octaves of noise plus a Worley
 * aggregate layer is ~40 M operations, which is a visible stall in JavaScript
 * and free here. It also lets the height, roughness and normal maps come out
 * of one shared height field, so they agree with each other exactly.
 */

import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/** Inverse of the gain baked into the stored albedo maps. */
export const ASPHALT_ALBEDO_SCALE = 0.25;
export const STUDIO_ALBEDO_SCALE = 0.125;

export interface AsphaltMaps {
  map: THREE.Texture;
  /** r = dry roughness, g = wet roughness, b = puddle mask, a = macro shade. */
  surface: THREE.Texture;
  normalMap: THREE.Texture;
  dispose(): void;
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Tiling value noise. The lattice wraps on `p`, so every map is seamless. */
const NOISE = /* glsl */ `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 x, float period) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 p00 = mod(i, period), p10 = mod(i + vec2(1.0, 0.0), period);
  vec2 p01 = mod(i + vec2(0.0, 1.0), period), p11 = mod(i + vec2(1.0), period);
  float a = hash1(p00), b = hash1(p10), c = hash1(p01), d = hash1(p11);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 x, float period, int oct) {
  float v = 0.0, amp = 0.5, per = period;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    v += amp * vnoise(x, per);
    x *= 2.0; per *= 2.0; amp *= 0.5;
  }
  return v;
}
/** Worley / cellular — this is the aggregate in the asphalt. */
float worley(vec2 x, float period) {
  vec2 i = floor(x), f = fract(x);
  float d = 1e9;
  for (int y = -1; y <= 1; y++) {
    for (int z = -1; z <= 1; z++) {
      vec2 g = vec2(float(z), float(y));
      vec2 o = hash2(mod(i + g, period));
      d = min(d, length(g + o - f));
    }
  }
  return d;
}
/** The shared asphalt height field. Everything else is derived from it. */
float asphaltHeight(vec2 uv) {
  vec2 p = uv * 64.0;
  float agg = 1.0 - worley(p, 64.0);
  agg = pow(clamp(agg, 0.0, 1.0), 2.2);
  float grit = fbm(uv * 220.0, 220.0, 2);
  float macro = fbm(uv * 5.0, 5.0, 4);
  return agg * 0.62 + grit * 0.16 + macro * 0.22;
}
`;

interface RenderOpts {
  wrap?: THREE.Wrapping;
}

function render(
  renderer: THREE.WebGLRenderer,
  size: number,
  fragmentShader: string,
  uniforms: Record<string, THREE.IUniform> = {},
  opts: RenderOpts = {},
): THREE.Texture {
  const wrap = opts.wrap ?? THREE.RepeatWrapping;
  const rt = new THREE.WebGLRenderTarget(size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: wrap,
    wrapT: wrap,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  const material = new THREE.RawShaderMaterial({
    uniforms,
    vertexShader: `precision highp float;\nattribute vec3 position;\nattribute vec2 uv;\n${QUAD_VERT}`,
    fragmentShader: `precision highp float;\n${fragmentShader}`,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);

  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(prevTarget);
  // Never quad.dispose() — three shares one fullscreen triangle between every
  // FullScreenQuad, and disposing it here would evict the buffer for the post
  // chain's passes too.
  material.dispose();

  return rt.texture;
}

const ASPHALT_ALBEDO = /* glsl */ `
${NOISE}
varying vec2 vUv;
void main() {
  float h = asphaltHeight(vUv);
  // Bitumen is nearly black; what you read as "grey road" is the exposed
  // aggregate. So build the albedo from the height field, not the other way.
  vec3 bitumen = vec3(0.038, 0.038, 0.041);
  vec3 stone   = vec3(0.072, 0.072, 0.072);
  vec3 pale    = vec3(0.105, 0.104, 0.101);
  float chip = smoothstep(0.55, 0.92, h);
  vec3 c = mix(bitumen, stone, smoothstep(0.16, 0.70, h));
  c = mix(c, pale, chip * (0.15 + 0.45 * hash1(floor(vUv * 64.0))));
  // Low-frequency tonal drift stops the tile reading as a repeat.
  c *= 0.90 + 0.20 * fbm(vUv * 3.0, 3.0, 3);
  // A few pale scuffs and tar-seam darkening.
  float seam = smoothstep(0.86, 0.995, fbm(vUv * 7.0 + 13.0, 7.0, 3));
  c = mix(c, bitumen * 1.25, seam * 0.55);
  // Stored pre-scaled: asphalt albedo lives in 0.02–0.2 linear, which is
  // five to fifty in an eight-bit channel. Scaling by ALBEDO_GAIN and taking
  // it back out in the material buys two extra stops of tonal resolution in
  // the bitumen, where all the texture actually is.
  gl_FragColor = vec4(clamp(c * 4.0, 0.0, 1.0), 1.0);
}
`;

const ASPHALT_SURFACE = /* glsl */ `
${NOISE}
varying vec2 vUv;
void main() {
  float h = asphaltHeight(vUv);
  // Dry: rough everywhere, slightly smoother on the polished stone faces.
  float dry = mix(0.93, 0.64, smoothstep(0.35, 0.92, h));
  dry *= 0.94 + 0.12 * fbm(vUv * 9.0, 9.0, 3);
  // Wet: water fills the low spots first, so the inverse of the height field
  // is the puddle mask. Wet asphalt is not uniformly glossy — it is a mosaic.
  float low = 1.0 - smoothstep(0.1, 0.55, h);
  float pools = smoothstep(0.42, 0.78, fbm(vUv * 2.6 + 4.0, 2.6, 4));
  float puddle = clamp(low * 0.55 + pools * 0.8, 0.0, 1.0);
  float wet = mix(0.52, 0.055, puddle);
  gl_FragColor = vec4(dry, wet, puddle, fbm(vUv * 1.7 + 9.0, 1.7, 3));
}
`;

const ASPHALT_NORMAL = /* glsl */ `
${NOISE}
varying vec2 vUv;
uniform vec2 uTexel;
uniform float uStrength;
void main() {
  float hl = asphaltHeight(vUv - vec2(uTexel.x, 0.0));
  float hr = asphaltHeight(vUv + vec2(uTexel.x, 0.0));
  float hd = asphaltHeight(vUv - vec2(0.0, uTexel.y));
  float hu = asphaltHeight(vUv + vec2(0.0, uTexel.y));
  vec3 n = normalize(vec3((hl - hr) * uStrength, (hd - hu) * uStrength, 1.0));
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

export function createAsphaltMaps(renderer: THREE.WebGLRenderer, size = 1024): AsphaltMaps {
  const map = render(renderer, size, ASPHALT_ALBEDO);
  const surface = render(renderer, size, ASPHALT_SURFACE);
  const normalMap = render(renderer, size, ASPHALT_NORMAL, {
    uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
    uStrength: { value: 2.1 },
  });
  for (const t of [map, surface, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return {
    map,
    surface,
    normalMap,
    dispose() {
      map.dispose();
      surface.dispose();
      normalMap.dispose();
    },
  };
}

/**
 * Tree-canopy gobo. Projected onto the road to fake the dappled shade that
 * street trees throw across the Parkway in the reference photograph. A real
 * shadow-casting canopy would need a shadow frustum tens of metres across,
 * which would throw away the resolution the car's own shadow needs.
 */
const GOBO = /* glsl */ `
${NOISE}
varying vec2 vUv;
void main() {
  // Overlapping crowns of a few different sizes. High = under a crown.
  float c1 = fbm(vUv * 2.2, 2.2, 3);
  float c2 = fbm(vUv * 5.5 + 2.0, 5.5, 3);
  float c3 = fbm(vUv * 13.0 + 5.0, 13.0, 2);
  float canopy = smoothstep(0.36, 0.63, c1 * 0.55 + c2 * 0.3 + c3 * 0.15);
  // Leaf-scale breakup punched through the crowns: ragged edges, and sun
  // flecks in the middle of the shade. Never fully dark — shade on a street
  // is lit by the whole sky dome.
  float leaf = smoothstep(0.34, 0.66, fbm(vUv * 26.0 + 11.0, 26.0, 2));
  float light = mix(1.0, 0.3 + 0.55 * leaf, canopy);
  gl_FragColor = vec4(vec3(light), 1.0);
}
`;

export function createGoboTexture(renderer: THREE.WebGLRenderer, size = 512): THREE.Texture {
  const t = render(renderer, size, GOBO);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Studio cyclorama floor: a soft pool of light under the car falling to black
 * at the edges, with a faint sweep so the floor is not a flat disc.
 */
const STUDIO_FLOOR = /* glsl */ `
${NOISE}
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // Elliptical, longer along the car than across it, and falling to black long
  // before the edge of the sheet so the floor dissolves into the cyc instead
  // of ending on a visible line. p = 1 is STUDIO_FLOOR_SIZE / 2 metres out.
  float r = length(p * vec2(1.0, 0.62));
  float pool = 1.0 - smoothstep(0.055, 0.30, r);
  vec3 c = mix(vec3(0.0012), vec3(0.060, 0.062, 0.067), pool * pool);

  // Gloss falls away fast outside the pool. At the grazing angles a profile
  // camera uses, Fresnel is already at one, so a floor that stays semi-gloss
  // to the horizon mirrors the softboxes straight into clipping.
  float rough = mix(0.72, 0.15, pool) + 0.03 * fbm(vUv * 40.0 + 3.0, 40.0, 2);
  gl_FragColor = vec4(clamp(c * 8.0, 0.0, 1.0), rough);
}
`;

export function createStudioFloorMaps(renderer: THREE.WebGLRenderer, size = 1024): {
  map: THREE.Texture;
  dispose(): void;
} {
  const map = render(renderer, size, STUDIO_FLOOR, {}, { wrap: THREE.ClampToEdgeWrapping });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return { map, dispose: () => map.dispose() };
}

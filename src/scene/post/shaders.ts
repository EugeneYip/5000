/**
 * Fragment shaders for the bespoke post passes.
 *
 * Three of them, all operating on a linear half-float buffer:
 *   · `ACCUM_FRAG` — progressive supersampling while the camera is still.
 *   · `DOF_FRAG`   — a gather-based depth of field driven by real lens maths.
 *   · `GRADE_FRAG` — tonemap, contrast, split tone, aberration, vignette,
 *                    grain and the sRGB encode, in one pass.
 */

export const QUAD_VERT = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const ACCUM_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tNew;
uniform sampler2D tPrev;
uniform float uMix;
varying vec2 vUv;
void main() {
  vec4 n = texture2D(tNew, vUv);
  vec4 p = texture2D(tPrev, vUv);
  gl_FragColor = mix(p, n, uMix);
}
`;

export const COPY_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

/**
 * Depth of field.
 *
 * The circle of confusion is computed from the actual lens in the pose —
 * focal length, f-number and focus distance — rather than from a made-up
 * "blur amount". That is why a 200 mm profile shot comes out essentially
 * sharp throughout while the 105 mm f/2 wheel close-up separates properly:
 * the numbers in `CameraRig` already describe real lenses, so trusting them
 * gives photographic behaviour for free.
 *
 *   CoC(mm) = f² / (N · (df − f)) · |d − df| / d
 */
export const DOF_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uCoCScale;
uniform float uMaxCoC;
varying vec2 vUv;

#define TAPS 28
const float GOLDEN = 2.39996323;

float viewDistance(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  // perspectiveDepthToViewZ, inlined; returns a negative view-space z.
  float vz = (uNear * uFar) / ((uFar - uNear) * d - uFar);
  return -vz;
}

float cocPixels(float d) {
  return clamp(uCoCScale * abs(d - uFocus) / max(d, 1e-4), 0.0, uMaxCoC);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 centre = texture2D(tDiffuse, vUv);
  if (uCoCScale <= 0.0) { gl_FragColor = centre; return; }

  float dC = viewDistance(vUv);
  float cocC = cocPixels(dC);
  bool sharp = cocC < 1.5;

  // A circle of confusion under about a pixel and a half is not a blur, it is
  // just a way to lose sharpness. A sharp pixel still has to check whether a
  // *nearer*, blurred neighbour bleeds onto it — otherwise an out-of-focus
  // foreground gets a hard cut-out edge. One cheap ring answers that, and
  // most of a wide frame then exits here, which is where the budget comes from.
  if (sharp) {
    float bleed = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0472;
      vec2 o = vec2(cos(a), sin(a)) * uMaxCoC * 0.5 * uTexel;
      float d = viewDistance(vUv + o);
      if (d < dC) bleed = max(bleed, cocPixels(d));
    }
    if (bleed < 1.5) { gl_FragColor = centre; return; }
  }

  float rot = hash12(gl_FragCoord.xy) * 6.2831853;
  float searchRadius = 0.5 * (sharp ? uMaxCoC : cocC);

  vec4 sum = centre;
  float wsum = 1.0;
  for (int i = 1; i <= TAPS; i++) {
    float t = float(i) / float(TAPS);
    float ang = float(i) * GOLDEN + rot;
    // sqrt(t) keeps the taps area-uniform, so the bokeh disc is flat rather
    // than centre-weighted — which is what a real aperture does.
    float rad = sqrt(t) * searchRadius;
    vec2 uv = vUv + vec2(cos(ang), sin(ang)) * rad * uTexel;
    float dS = viewDistance(uv);
    float cocS = cocPixels(dS);
    // A sample may only contribute if its own circle of confusion actually
    // reaches this pixel, and only if it is in front of us or we are blurred
    // too. Without both tests the background smears over sharp foregrounds.
    float w = clamp(cocS * 0.5 - rad + 1.0, 0.0, 1.0);
    w *= max(step(dS, dC), sharp ? 0.0 : 1.0);
    sum += texture2D(tDiffuse, uv) * w;
    wsum += w;
  }
  gl_FragColor = sum / wsum;
}
`;

/**
 * Grade and output.
 *
 * Each of these is meant to be invisible on its own; together they are the
 * difference between "a render" and "a photograph". The aberration is under a
 * pixel and only at the frame edge, the grain is a percent, the vignette is a
 * quarter stop in the corners. Any one of them dialled up to where you can
 * point at it is the amateur tell.
 */
export const GRADE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uChromatic;
uniform float uTime;
uniform float uAspect;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplit;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// Bit-for-bit the same curve three's ACESFilmicToneMapping applies, so the
// image does not shift when the post chain is bypassed.
vec3 acesFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );
  color *= uExposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 encodeSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(0.41666)) - 0.055, step(vec3(0.0031308), c));
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 c = vUv - 0.5;
  // Normalised so r² is exactly 1 at the frame corner, whatever the aspect.
  // Without that the vignette saturates well inside the frame and reads as a
  // dark border rather than as lens falloff.
  vec2 ca = c * vec2(uAspect, 1.0);
  float r2 = dot(ca, ca) * 4.0 / (uAspect * uAspect + 1.0);

  // Lateral chromatic aberration: zero in the centre, growing with r², the
  // way a real lens misbehaves. Sub-pixel at the corners.
  vec2 dir = c * r2 * uChromatic;
  vec3 col;
  col.r = texture2D(tDiffuse, vUv + dir * uTexel * 1.0).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - dir * uTexel * 1.0).b;

  col = acesFilmic(col);

  // Gentle S-curve about mid grey. smoothstep is already an S; mixing towards
  // it by a small amount gives a filmic shoulder and toe without crushing.
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.1, 0.8, luma));
  col = mix(col, col * tint, uSplit);

  col = mix(vec3(luma), col, uSaturation);

  // Vignette. A quarter of a stop in the extreme corners, no more.
  float vig = 1.0 - uVignette * pow(clamp(r2, 0.0, 1.0), 1.7);
  col *= vig;

  col = encodeSRGB(col);

  // Grain last, in display space, strongest in the mid-tones exactly as film
  // grain is — clean in the blacks, clean in the specular highlights.
  float g = hash13(vec3(gl_FragCoord.xy, uTime)) - 0.5;
  float mid = 1.0 - abs(luma * 2.0 - 1.0);
  col += g * uGrain * (0.35 + 0.65 * mid);

  gl_FragColor = vec4(col, 1.0);
}
`;

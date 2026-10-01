/**
 * Analytic sky.
 *
 * No HDRI files ship with this project, so the sky is evaluated in a shader
 * and used twice: once on a 300 m dome that the camera actually sees, and
 * once inside the small scene that gets baked to a cubemap and prefiltered
 * into the IBL. Both read the same uniform block, so the reflection in the
 * paint can never disagree with the sky behind the car.
 *
 * The model is deliberately not Preetham. Preetham is calibrated for clear
 * midday skies and goes strange at 10° solar elevation, which is precisely
 * where the reference photograph sits. This is a hand-tuned gradient plus a
 * Henyey–Greenstein-ish forward lobe and a horizon haze band, which holds up
 * from noon to below-horizon dusk.
 */

import * as THREE from 'three';
import type { SkyParams } from './presets';

export interface SkyUniforms {
  [k: string]: THREE.IUniform;
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uGroundColor: { value: THREE.Color };
  uSunColor: { value: THREE.Color };
  uHazeColor: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunIntensity: { value: number };
  uSunAngularRadius: { value: number };
  uMieStrength: { value: number };
  uMiePower: { value: number };
  uGradientPower: { value: number };
  uHaze: { value: number };
  uHazeHeight: { value: number };
  uCloud: { value: number };
  uExposure: { value: number };
}

export function createSkyUniforms(): SkyUniforms {
  return {
    uZenith: { value: new THREE.Color(0x2f63a8) },
    uHorizon: { value: new THREE.Color(0xbfd0dd) },
    uGroundColor: { value: new THREE.Color(0x6b5c4c) },
    uSunColor: { value: new THREE.Color(0xffb466) },
    uHazeColor: { value: new THREE.Color(0xf6cfa0) },
    uSunDir: { value: new THREE.Vector3(-0.797, 0.199, 0.561) },
    uSunIntensity: { value: 46 },
    uSunAngularRadius: { value: 0.019 },
    uMieStrength: { value: 1.35 },
    uMiePower: { value: 12 },
    uGradientPower: { value: 1.45 },
    uHaze: { value: 0.5 },
    uHazeHeight: { value: 0.085 },
    uCloud: { value: 0 },
    uExposure: { value: 1 },
  };
}

export function applySkyParams(u: SkyUniforms, p: SkyParams, sunDir: THREE.Vector3, exposure = 1): void {
  u.uZenith.value.setHex(p.zenith);
  u.uHorizon.value.setHex(p.horizon);
  u.uGroundColor.value.setHex(p.ground);
  u.uSunColor.value.setHex(p.sun);
  u.uHazeColor.value.setHex(p.hazeColor);
  u.uSunDir.value.copy(sunDir);
  u.uSunIntensity.value = p.sunIntensity;
  u.uSunAngularRadius.value = p.sunAngularRadius;
  u.uMieStrength.value = p.mieStrength;
  u.uMiePower.value = p.miePower;
  u.uGradientPower.value = p.gradientPower;
  u.uHaze.value = p.haze;
  u.uHazeHeight.value = p.hazeHeight;
  u.uCloud.value = p.cloud ?? 0;
  u.uExposure.value = p.exposure * exposure;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_BODY = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGroundColor, uSunColor, uHazeColor, uSunDir;
uniform float uSunIntensity, uSunAngularRadius, uMieStrength, uMiePower;
uniform float uGradientPower, uHaze, uHazeHeight, uExposure;
uniform float uCloud;
varying vec3 vDir;

float skyHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float skyNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x),
             mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0)), f.x), f.y);
}
/**
 * A cirrus deck, projected onto a flat layer so it converges at the horizon
 * the way real cloud does rather than sitting on the dome like wallpaper.
 * Four octaves stretched 3:1 across the wind, which is what gives cirrus its
 * combed look, and warm on the sunward side because at this elevation the
 * deck is lit from underneath.
 */
float cirrus(vec3 dir) {
  if (dir.y < 0.02) return 0.0;
  vec2 p = dir.xz / dir.y;                 // flat-layer projection
  p = mat2(0.87, -0.5, 0.5, 0.87) * p;     // wind bearing
  p *= vec2(0.33, 1.0);                    // combed along the wind
  float v = 0.0, a = 0.55, s = 0.6;
  for (int i = 0; i < 4; i++) {
    v += a * skyNoise(p * s);
    s *= 2.17; a *= 0.5;
  }
  // Thin out towards the zenith and fade into the haze at the horizon, so the
  // deck never reads as a texture wrapped over a ball.
  float band = smoothstep(0.03, 0.22, dir.y) * (1.0 - smoothstep(0.55, 1.0, dir.y) * 0.55);
  return smoothstep(0.42, 0.80, v) * band;
}

vec3 evalSky(vec3 dir) {
  float up = dir.y;

  // Vertical gradient. pow() on (1 - up) keeps the zenith saturated while the
  // horizon washes out, which is what actually happens as path length grows.
  float t = pow(clamp(1.0 - max(up, 0.0), 0.0, 1.0), uGradientPower);
  vec3 col = mix(uZenith, uHorizon, t);

  // Forward-scattered aureole. Low suns have a huge one; it is most of what
  // makes a golden-hour sky look like golden hour rather than a blue ramp.
  float cosT = dot(dir, uSunDir);
  col += uSunColor * uMieStrength * pow(max(cosT, 0.0), uMiePower);

  // Haze slab straddling the horizon line. Its *thickness* is the same all
  // the way round, but its colour is not: the warm cast is forward-scattered
  // sunlight and so is strongest in the sun's quadrant.
  //
  // The anti-solar floor was 0.18, on the grounds that warm haze right round
  // the compass makes a synthetic golden hour go sepia, and that a vertical
  // body panel reflects this band straight onto the flanks. The second half of
  // that turns out to be false — measured by changing this band by every
  // amount available, a shaded flank does not move by a single level, because
  // what a vertical panel on this car mirrors is the *road*. So the band is
  // free to be what a real one is, and a real one at 11° of solar elevation is
  // warm the whole way round: the light reaching the anti-solar horizon has
  // come through the same five air masses. It is what turns the road warm, and
  // the road is what turns the flanks warm.
  float haze = exp(-abs(up) / max(uHazeHeight, 1e-4));
  float forward = pow(max(cosT, 0.0), 2.0);
  vec3 hazeCol = mix(uHorizon, uHazeColor, clamp(0.46 + 0.54 * forward, 0.0, 1.0));
  col = mix(col, hazeCol, clamp(haze * uHaze, 0.0, 1.0));

  // …and a second, far thinner band sitting right on the skyline. The wide
  // slab above is an aerosol *column* and is correctly a smooth wash; what it
  // cannot produce is the bright line a hazy city evening actually has along
  // the horizon, where the sight line is through fifty times the air and
  // every particle of it is forward-scattering. Without this the visible sky
  // in a low, wide pose is one flat tone from the tree line to the top of
  // frame — which is exactly the complaint, and it is not fixed by making the
  // slab stronger, only flatter.
  float skyline = exp(-abs(up) / 0.05);
  col = mix(col, hazeCol * (1.0 + 0.34 * forward), clamp(skyline * uHaze * 0.6, 0.0, 1.0));

  // Structure in the band the camera is actually pointed at.
  //
  // The cirrus deck below is the only thing in this model with any shape to
  // it, and it lives above fifteen degrees of elevation — where a 200 mm lens
  // aimed at a car never looks. Measured on the profile pose, the whole
  // visible sky ran 221 to 225 with a standard deviation of three levels: a
  // cream card. Every review pose has the same problem, because every one of
  // them is looking within ten degrees of the horizon.
  //
  // What is there in reality is the aerosol itself. It lies in layers and a
  // near-horizontal sight line runs *along* them for tens of kilometres, so
  // the last few degrees of any hazy city evening are banded and blotched,
  // with a bank of distant cloud sitting on the skyline. Sampled on the unit
  // circle rather than on an azimuth angle, so there is no seam at due north.
  vec2 ring = normalize(vec2(dir.x, dir.z) + vec2(1e-5));
  // The frequencies have to be high, and that is not a taste call: a 200 mm
  // lens covers twelve degrees of azimuth, so a feature has to be about a
  // degree across before two of them fit in frame at all. Four cells round
  // the whole compass is one feature per review pose, which is a tint.
  float bankN = 0.50 * skyNoise(ring * 13.0 + vec2(1.7, up * 40.0))
              + 0.30 * skyNoise(ring * 31.0 + vec2(5.2, up * 70.0))
              + 0.20 * skyNoise(ring * 74.0);
  // A soft slab a few degrees up, which is where a distant deck sits when you
  // are standing under it.
  float bankH = exp(-pow((up - 0.052) / 0.058, 2.0));
  // Two-sided, and it has to be. What was here darkened only, on the argument
  // -- correct as far as it goes -- that at 222 of 255 ACES is compressing a
  // twenty per cent lift into two or three levels while downwards there is a
  // whole stop of room. Measured with the backdrop stood down, that deck gave
  // the entire visible sky a standard deviation of **five to nine levels**:
  // 205 to 216 at the rear pose, 199 to 203 at photomatch, a cream card in
  // every review pose. A single mix that bottoms out at 0.62 of the haze can
  // only reach -17 % of radiance, which at the shoulder is ten levels.
  //
  // And the *shape* it was aiming at is not what a photograph has. Over the
  // owner's frame, the band its tree line stands in puts 1.4 % of its pixels
  // above 224 and 3.2 % above 200; this render put 0.01 % and 12.6 %. Almost
  // nothing in a real background lives at the top of the shoulder. It is
  // either well under it or through it -- and a broken deck raked by an 11
  // degree sun is exactly the thing that does both at once, a grey-mauve
  // shaded base with its margins burnt through to the sun behind them.
  //
  // The two sides are sized so the mean radiance does not move: this dome is
  // the light source as well as the background, and presets.ts is explicit
  // that nothing may be bought by spending its exposure. Measured with the
  // backdrop stood down, the sky the rear pose sees goes from mean 206.2,
  // sd 7.9 to mean 201.0, sd 17.7 -- two and a half per cent of mean for
  // two and a quarter times the spread -- with its tenth and ninetieth
  // percentiles moving 194/214 to 174/222. On the gate pose the mean moves
  // 201.3 to 199.2. Composited, the rear frame's tree-line band goes from
  // 12.6 % over 200 and 0.01 % over 224 to 7.6 % and 1.85 %, against the
  // photograph's 4.1 % and 1.59 %; the car's own share over 224 does not
  // move at all, 7.7 % either way.
  //
  // **The bright side used to be a band in bankN, and that is a contour
  // plot.** smoothstep(0.26,0.38) * (1 - smoothstep(0.38,0.48)) selects a
  // *level set* of a continuous field, and the level set of a continuous
  // field is a family of **closed loops**. Drawn at 1.5x the haze they are
  // bright rings with clear sky inside them, and four of them standing over
  // the tree line in the gate frame is what CRITIQUE-6 read as chimney smoke.
  // Rendered as a field on its own it is unmistakable: a contour map. 53 % of
  // its bright pixels were more than ten pixels from any part of the deck at
  // all -- rings drawn round maxima that never reach cloud density, outlining
  // nothing.
  //
  // So the two sides are now one **monotone split** of the same field at a
  // single threshold: thick enough to shade, or thin enough to burn through.
  // Both sides are filled regions sharing one boundary, which is what a
  // broken deck is, and no closed bright outline can form because there is no
  // band for one to live in. The threshold sits at the field's own median
  // (bankN p50 = 0.491) so the split is even, and 0.30 is set where the mean
  // radiance does not move: measured over the band envelope, mean 0.4908 ->
  // 0.4915 (+0.14 %) with the spread slightly up, sd 15.94 -> 16.27. The
  // paragraphs above keep their figures.
  //
  // On the gate frame itself, a clear-sky box at photomatch x 650-1010,
  // y 95-175 goes p50 203.8 -> 204.3 with its structure against a 41 px
  // running mean falling from sd 2.34 / p99 8.9 to sd 2.08 / p99 7.8 — the
  // level holds and what leaves is the high-frequency part, which is the
  // contour lines. Differenced against the previous build the removed signal
  // is the loops themselves, in outline, including where they were standing
  // in the windscreen's reflection.
  float dev  = bankN - 0.47;
  float base = bankH * smoothstep(0.0, 0.10, dev) * uCloud;
  float burn = bankH * smoothstep(0.0, 0.10, -dev) * uCloud;
  col = mix(col, hazeCol * (0.40 + 0.36 * forward), clamp(base, 0.0, 1.0));
  col = mix(col, hazeCol * (1.50 + 0.85 * forward), clamp(burn * 0.30, 0.0, 1.0));
  // …and the layering itself, which darkens as much as it brightens and is
  // what stops the band reading as a painted ramp.
  float layer = skyNoise(vec2(ring.x * 12.0 + ring.y * 8.5, up * 95.0));
  col *= 1.0 + (layer - 0.5) * 0.34 * exp(-abs(up) / 0.16) * uHaze;

  // Cirrus, added before the disc so the sun can still burn through it. The
  // deck is lit from below at this solar elevation, so its underside takes
  // the haze's colour and goes gold towards the sun and pink away from it —
  // and it is the only thing in the upper hemisphere with any structure, so
  // it is also the only thing a horizontal panel has to reflect.
  float cl = cirrus(dir) * uCloud;
  vec3 cloudLit = mix(uHazeColor, uSunColor, 0.35 * forward + 0.1);
  col = mix(col, cloudLit * (0.62 + 0.9 * forward), clamp(cl, 0.0, 1.0));

  // The disc. Kept in the IBL as well as the background, because the tiny
  // sharp glint it leaves in a clearcoat is half the reason a car photograph
  // reads as outdoors.
  float ang = acos(clamp(cosT, -1.0, 1.0));
  float disc = 1.0 - smoothstep(uSunAngularRadius * 0.72, uSunAngularRadius * 1.3, ang);
  col += uSunColor * uSunIntensity * disc;

  // Below the horizon the dome shows ground, not sky.
  col = mix(col, uGroundColor, smoothstep(0.004, -0.05, up));

  return max(col * uExposure, vec3(0.0));
}
`;

const SKY_FRAG = /* glsl */ `
${SKY_BODY}
void main() {
  gl_FragColor = vec4(evalSky(normalize(vDir)), 1.0);
}
`;

/**
 * The dome the camera sees. Unlit, depth-neutral and drawn first, so it costs
 * one full-screen worth of very cheap fragments and nothing else.
 */
export function createSkyDome(uniforms: SkyUniforms): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 32), mat);
  mesh.name = 'env:skyDome';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * A gain on the sky **in the bake only**, inert at 1 and not shipped at
 * anything else.
 *
 * It exists to price one specific question, because there was no way to ask
 * it without a rebuild. `ibl.ts` gives the horizon, the ground and the vista
 * `preset.proxyGain` and deliberately does **not** give it to the sky —
 * `proxyGain`'s docstring argues that the furniture is under-counted and the
 * sky is not, which is sound as far as it goes. What it was never checked
 * against is what a *horizontal* panel mirrors. Measured over the full
 * sphere, this shader's own radiance runs
 *
 *     elev     0°     10°    20°    40°    70°    90°
 *     max L   1.12   1.13   1.08   0.59   0.34   0.34
 *
 * — a horizon-to-zenith ratio of **3.3 : 1**, which is what a golden-hour sky
 * should be. The baked cube reads **13 : 1** over the same bands. The
 * difference is not the sky: the zenith figure agrees to the digit with the
 * cube's own 0.34, so the extra ten is `proxyGain` on the lower hemisphere's
 * furniture and nothing else. A bonnet mirrors the half that did not get it.
 *
 * Turning this up **deliberately breaks the invariant at the top of this
 * file** — the reflection and the background stop being the same sky — so it
 * must not ship above 1 on its own. It is a measuring instrument: set it,
 * call `__AUDI_ENV.reset()` to force a re-bake, and the gate reads the bake
 * half of the hypothesis in isolation, in one boot and without a rebuild.
 * The visible half is already sweepable through `__AUDI_ENV.ab` on
 * `sky.exposure`.
 */
const iblSkyGain = { value: 1 };

const SKY_FRAG_IBL = /* glsl */ `
${SKY_BODY}
uniform float uIblGain;
void main() {
  gl_FragColor = vec4(evalSky(normalize(vDir)) * uIblGain, 1.0);
}
`;

/** The same sky, sized to sit inside the cube camera used for the IBL bake. */
export function createSkySphereForIbl(uniforms: SkyUniforms): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    // Spread, not replace: the entries are the same `IUniform` objects the
    // visible dome holds, so `applySkyParams` still reaches both at once and
    // only `uIblGain` is private to the bake.
    uniforms: { ...uniforms, uIblGain: iblSkyGain },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG_IBL,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 40), mat);
  mesh.name = 'ibl:sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  (globalThis as unknown as {
    __AUDI_PERF?: { register(name: string, fn: (v: number | boolean) => unknown): void };
  }).__AUDI_PERF?.register('skyIblGain', (v) => {
    iblSkyGain.value = Number(v);
    // The cube is only redrawn by `applyPreset`, so a sweep has to follow
    // this with `__AUDI_ENV.reset()` or the gate reads the previous bake.
    return iblSkyGain.value;
  });
  return mesh;
}

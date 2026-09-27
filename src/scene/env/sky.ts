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
  float bankH = exp(-pow((up - 0.055) / 0.05, 2.0));
  float bank = bankH * smoothstep(0.40, 0.66, bankN) * uCloud;
  // Darker, not brighter, and that is forced by where the sky sits.
  //
  // The dome renders at 222 of 255. ACES is compressing hard by then, so a
  // twenty per cent *lift* in radiance comes out as two or three levels and
  // the structure is invisible — measured, adding it changed the frame's
  // standard deviation by less than half a level. Downwards there is a whole
  // stop of room, and downwards is also what is true: a deck seen from
  // underneath at 11° of solar elevation is lit on its top and shows you its
  // shaded base, which against a bright hazy sky reads as a grey-mauve mass.
  col = mix(col, hazeCol * (0.62 + 0.55 * forward), clamp(bank * 0.85, 0.0, 1.0));
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

/** The same sky, sized to sit inside the cube camera used for the IBL bake. */
export function createSkySphereForIbl(uniforms: SkyUniforms): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 40), mat);
  mesh.name = 'ibl:sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

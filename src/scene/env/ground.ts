/**
 * The surface the car stands on.
 *
 * Two of them: real asphalt for the street presets and a studio cyclorama
 * floor. Neither is a flat grey plane — the ground is half of what sells a
 * car render, because it is what the lower body panels and the wheels
 * actually reflect.
 *
 * The asphalt material is a stock `MeshStandardMaterial` with three small
 * shader injections:
 *   · roughness picked between a dry and a wet curve from one packed map,
 *   · a world-space albedo drift so a 4 m tile does not read as a tile,
 *   · a world-space gobo that paints the dappled shade of the street trees.
 *
 * The gobo is a cheat and worth explaining. Casting that shade for real needs
 * a canopy tens of metres up-sun, which would have to sit inside the sun's
 * shadow frustum — and that frustum is the one thing that must stay tight
 * around the car. Painting the shade into the road instead costs one texture
 * fetch and leaves all 4096² of shadow map on the subject.
 */

import * as THREE from 'three';
import {
  createAsphaltMaps,
  createGoboTexture,
  createStudioFloorMaps,
  ASPHALT_ALBEDO_SCALE,
  STUDIO_ALBEDO_SCALE,
  type AsphaltMaps,
} from './textures';
import type { EnvPreset } from './presets';

/** One asphalt tile, metres. Also the scale everything world-space keys off. */
const TILE = 4;
const GROUND_SIZE = 4000;
/** Studio sheet. The lit pool is a small fraction of this; the rest is black. */
const STUDIO_FLOOR_SIZE = 90;

export interface GroundHandle {
  group: THREE.Group;
  apply(preset: EnvPreset): void;
  update(elapsed: number): void;
  dispose(): void;
}

interface Patch {
  uWetness: THREE.IUniform<number>;
  uGobo: THREE.IUniform<THREE.Texture | null>;
  uGoboScale: THREE.IUniform<number>;
  uGoboStrength: THREE.IUniform<number>;
  uGoboOffset: THREE.IUniform<THREE.Vector2>;
  uDriftScale: THREE.IUniform<number>;
  uSunAz: THREE.IUniform<THREE.Vector2>;
  uShadeTint: THREE.IUniform<THREE.Color>;
  uKerbColor: THREE.IUniform<THREE.Color>;
  uVergeColor: THREE.IUniform<THREE.Color>;
}

function patchAsphalt(mat: THREE.MeshStandardMaterial, gobo: THREE.Texture): Patch {
  const u: Patch = {
    uWetness: { value: 0 },
    uGobo: { value: gobo },
    // 17 m to the gobo tile, not 26.
    //
    // This is the framing fix. The pattern is a *canopy*, so its features are
    // whole crowns: at a 26 m tile the shaded and lit masses were 10-14 m
    // across and the near road in a wide frame spans about twenty, which means
    // whether any dapple appeared at all in a given pose was a coin toss on
    // the offset — and in the hero poses it kept landing in a lit patch and
    // the road came back as one flat sheet. At 17 m the frame always contains
    // a crown and a gap, which is what the photograph shows, and the leaf
    // structure inside the mask lands at 27 cm rather than 41 — dapple rather
    // than blotches.
    uGoboScale: { value: 1 / 17 },
    uGoboStrength: { value: 0 },
    uGoboOffset: { value: new THREE.Vector2(0.58, 0.21) },
    uDriftScale: { value: 1 / 210 },
    uSunAz: { value: new THREE.Vector2(-0.818, 0.575) },
    uShadeTint: { value: new THREE.Color(0.42, 0.46, 0.58) },
    uKerbColor: { value: new THREE.Color(0.08, 0.08, 0.08) },
    uVergeColor: { value: new THREE.Color(0.05, 0.06, 0.03) },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vGroundXZ;
uniform float uWetness;
uniform sampler2D uGobo;
uniform float uGoboScale;
uniform float uGoboStrength;
uniform vec2 uGoboOffset;
uniform float uDriftScale;
uniform vec2 uSunAz;
uniform vec3 uShadeTint;
uniform vec3 uKerbColor;
uniform vec3 uVergeColor;

// --- breaking the four-metre repeat ---------------------------------------
//
// The world-space drift below carries everything coarser than a metre, but it
// cannot touch what happens *inside* a tile: the aggregate, the grit and the
// chips repeat their exact arrangement every four metres, and in the near
// foreground of a wide frame four metres is three hundred pixels. That is a
// visible printed pattern, and no amount of tonal drift over the top of it
// hides a pattern whose phase is constant.
//
// So the tile is sampled twice — once straight, once rotated by an angle that
// is no fraction of a right angle and scaled by an irrational-ish factor — and
// the two are cross-faded by a mask whose own period is 61 m, far longer than
// any frame contains. Two taps do not remove the repeat; they remove the
// *phase*, which is the thing the eye locks on to. Cost is one extra fetch on
// each of two maps, on a surface that is already the cheapest thing in frame.
const float AUDI_TILE_ROT = 1.91;
const float AUDI_TILE_SCALE = 0.83;
vec2 audiRot(vec2 p, float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c) * p;
}
float audiTileMask(vec2 w) {
  return smoothstep(0.34, 0.66, texture2D(uGobo, w * (1.0 / 61.0) + vec2(0.13, 0.77)).r);
}
vec2 audiTileUv2(vec2 uv) {
  return audiRot(uv, AUDI_TILE_ROT) * AUDI_TILE_SCALE + vec2(0.37, 0.61);
}
vec4 audiTileColor(sampler2D t, vec2 uv, vec2 w) {
  return mix(texture2D(t, uv), texture2D(t, audiTileUv2(uv)), audiTileMask(w));
}
vec3 audiTileNormal(sampler2D t, vec2 uv, vec2 w) {
  vec3 n1 = texture2D(t, uv).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(t, audiTileUv2(uv)).xyz * 2.0 - 1.0;
  // The second tap's features are rotated in uv space, so its gradient has to
  // be rotated back before the two can be blended.
  n2.xy = audiRot(n2.xy, -AUDI_TILE_ROT);
  return normalize(mix(n1, n2, audiTileMask(w)));
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 mapN = audiTileNormal(normalMap, vNormalMapUv, vGroundXZ);
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );`,
      )
      .replace(
        '#include <map_fragment>',
        `diffuseColor *= audiTileColor(map, vMapUv, vGroundXZ);
float audiShade = 0.0;
{
  // Low-frequency tonal drift, in WORLD space, so nothing at this scale can
  // ever wrap with the four-metre albedo tile. Two octaves an order of
  // magnitude apart and mutually prime in offset: the coarse one is the
  // patching and wear of a whole carriageway, the finer one the sweep of
  // traffic within a lane. Between them they carry every tonal variation the
  // road has above a metre, which is the band the eye reads a repeat in.
  float drift = texture2D(uGobo, vGroundXZ * uDriftScale).r;
  float wear = texture2D(uGobo, vGroundXZ * uDriftScale * 7.3 + vec2(0.41, 0.17)).r;
  diffuseColor.rgb *= 0.80 + 0.30 * drift + 0.14 * wear;

  // Longitudinal tar seams: metres apart, running with the road, not a
  // lattice. One low-frequency band across x, jittered along z so it wanders
  // the way a poured seam does.
  float seamX = vGroundXZ.x * 0.22 + texture2D(uGobo, vGroundXZ * vec2(0.004, 0.02)).r * 2.4;
  float seam = smoothstep(0.93, 0.995, abs(fract(seamX) * 2.0 - 1.0));
  diffuseColor.rgb *= 1.0 - 0.34 * seam;

  // Standing water darkens bitumen far more than it changes its hue.
  vec4 surf = texture2D(roughnessMap, vMapUv);
  diffuseColor.rgb *= mix(1.0, 0.34, surf.b * uWetness);

  // The kerb, the gutter and the grass verge. The carriageway is eleven metres
  // wide, then two metres of concrete, then grass — and without them the
  // asphalt ran to the horizon in every direction as one unbroken sheet,
  // which is most of why a frame with a correctly lit car in it still read as
  // a salt flat. The same three bands, at the same stations and the same
  // reflectances, are in the IBL's proxy ground, so the road the car is
  // standing on and the road it is reflecting are one surface.
  float across = abs(vGroundXZ.x);
  float onKerb = smoothstep(10.4, 11.0, across) * (1.0 - smoothstep(12.4, 13.0, across));
  float onVerge = smoothstep(15.4, 16.6, across);
  // Gutter line: a dark strip of silt where the camber drains.
  float gutter = (1.0 - smoothstep(9.7, 10.4, across)) * smoothstep(9.2, 9.8, across);
  diffuseColor.rgb *= 1.0 - 0.34 * gutter;
  diffuseColor.rgb = mix(diffuseColor.rgb, uKerbColor, onKerb);
  diffuseColor.rgb = mix(diffuseColor.rgb, uVergeColor * (0.72 + 0.5 * drift), onVerge);

  // Dappled shade. Shaded road is lit by sky alone, so it goes cool as well
  // as dark — that colour shift is most of why real shade reads as shade.
  //
  // Carried into the indirect specular too, at lights_fragment_end below.
  // Modulating only the albedo was not enough: with the fill at its proper
  // strength roughly half of what the road returns is environment reflection,
  // so a gobo that touched the diffuse alone came out at half strength and the
  // dapple washed away exactly when the rest of the frame came right.
  // Read in the *sun's* frame, stretched two to one along its azimuth.
  //
  // A canopy shadow is not an isotropic blob. At 11.5° of solar elevation a
  // fifteen-metre plane throws a seventy-metre shadow, so everything the
  // canopy casts is drawn out along the sun's bearing — which is also why the
  // photograph's road is mostly *in* shade with sun flecks in it rather than
  // the other way round. Sampling axis-aligned gave round blobs on a square
  // lattice of crowns, and whether any of them landed near the car was luck.
  vec2 sunFwd = uSunAz;
  vec2 sunRt = vec2(-sunFwd.y, sunFwd.x);
  float acrossSun = dot(vGroundXZ, sunRt);
  vec2 goboUv = vec2(acrossSun, dot(vGroundXZ, sunFwd) * 0.5);
  vec3 gb = texture2D(uGobo, goboUv * uGoboScale + uGoboOffset).rgb;

  // The bands, and this is what finally made the dapple land.
  //
  // A noise mask alone cannot be relied on to put shade anywhere in
  // particular: its features are whole crowns, the near field of a wide frame
  // is a few of them across, and whether the car stood in sun or shade was
  // decided by the texture offset. Three offsets in a row put it in full sun
  // and the road came back as one flat sheet — which is the actual complaint.
  //
  // But the shade under a street planting is not a random field. The trees
  // stand in a row at a fixed pitch and the sun is 11.5° up, so what lands on
  // the road is a set of long parallel bands running along the sun's bearing,
  // spaced by the row's pitch, wandering slowly as the row does — exactly what
  // the photograph shows across the pavement. A 13 m pitch across a frame that
  // is fifteen or twenty metres wide *cannot* miss, so the dapple is there in
  // every pose instead of in the lucky ones.
  float wander = texture2D(uGobo, vGroundXZ * (1.0 / 140.0) + vec2(0.27, 0.61)).r;
  float s = acrossSun / 13.0 + wander * 2.2;
  // abs(fract(s) - 0.5) is zero at a band's centre and 0.5 at the middle of
  // the gap between two, so this covers half the pitch solidly and another
  // sixth in the soft edge — a boulevard at 11.5° of solar elevation is
  // mostly in its own planting's shade.
  float bands = 1.0 - smoothstep(0.24, 0.44, abs(fract(s) - 0.5));
  float canopy = clamp(max(gb.b, bands * 0.9), 0.0, 1.0);
  // Channel g is what gets *through* a crown: the leaf, fleck and twig
  // structure that turns a shadow into dapple.
  float lit = mix(1.0, gb.g, canopy);
  // One tap only. A second at a coarser scale, however it was combined,
  // always won where it was darker and it carries no leaf detail at that
  // scale — so the fine structure that makes dapple read as dapple was being
  // replaced by a smooth blob over most of the near field.
  float shadeAmt = (1.0 - lit) * uGoboStrength;
  // Only a hue filter here — light that has come through leaves is greener.
  // The *depth* of the shade is not an albedo change and must not be done as
  // one: darkening the albedo scales the sun and the sky together, which is a
  // dimmer, not a shadow. See lights_fragment_end.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uShadeTint, shadeAmt * 0.55);
  audiShade = shadeAmt;
}`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
// What a canopy actually does: it takes the sun off the road and leaves the
// sky on it. That is a change to the *direct* term, and doing it here rather
// than by tinting the albedo is the whole difference between dapple and a
// dimmer — an albedo change scales sun and sky by the same factor, so it
// lowers the road's mean and its variance together, which is measurably the
// opposite of a shadow. Twelve per cent of the direct term is left standing
// because the road-bounce light is lumped in with the sun here and is not
// blocked by anything.
//
// The colour comes out on its own once the split is right: what is removed is
// warm and what remains is the sky and the bounce, so shade goes cool without
// anyone choosing a colour for it.
float audiSunLeft = 1.0 - 0.88 * audiShade;
reflectedLight.directDiffuse *= audiSunLeft;
reflectedLight.directSpecular *= audiSunLeft;
// And the crown that is blocking the sun blocks about half the sky as well.
reflectedLight.indirectDiffuse *= 1.0 - 0.45 * audiShade;
reflectedLight.indirectSpecular *= 1.0 - 0.55 * audiShade;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
{
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= mix(texelRoughness.r, texelRoughness.g, uWetness);
}`,
      );
  };
  // Force a fresh program: onBeforeCompile is keyed on the material's cache key.
  mat.customProgramCacheKey = () => 'audi-asphalt-v8';
  return u;
}

function makeAsphalt(maps: AsphaltMaps, gobo: THREE.Texture): {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  patch: Patch;
} {
  const repeat = GROUND_SIZE / TILE;
  for (const t of [maps.map, maps.surface, maps.normalMap]) {
    t.repeat.set(repeat, repeat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }

  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.surface,
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(0.34, 0.34),
    dithering: true,
  });
  const patch = patchAsphalt(mat, gobo);

  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env:asphalt';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  // A 4 km plane is never outside the frustum and the test is not free.
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, mat, patch };
}

function makeStudioFloor(map: THREE.Texture): { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughnessMap: map,
    roughness: 1,
    metalness: 0.0,
    color: new THREE.Color(1, 1, 1).multiplyScalar(STUDIO_ALBEDO_SCALE),
    dithering: true,
  });
  // The floor's gloss is packed in alpha, where three does not look for it.
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      'float roughnessFactor = roughness * texture2D( roughnessMap, vRoughnessMapUv ).a;',
    );
  };
  mat.customProgramCacheKey = () => 'audi-studio-floor-v1';

  const geo = new THREE.PlaneGeometry(STUDIO_FLOOR_SIZE, STUDIO_FLOOR_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'env:studioFloor';
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  return { mesh, mat };
}

export function createGround(renderer: THREE.WebGLRenderer): GroundHandle {
  const maps = createAsphaltMaps(renderer, 1024);
  const gobo = createGoboTexture(renderer, 1024);
  const studio = createStudioFloorMaps(renderer, 1024);

  const asphalt = makeAsphalt(maps, gobo);
  const floor = makeStudioFloor(studio.map);

  const group = new THREE.Group();
  group.name = 'env:ground';
  group.add(asphalt.mesh, floor.mesh);
  // Underneath the studio floor so its edge does not show the sky dome.
  floor.mesh.position.y = 0.0005;
  floor.mesh.updateMatrix();
  asphalt.mesh.updateMatrix();

  const tint = new THREE.Color();
  const shade = new THREE.Color();
  const sun = new THREE.Color();

  const apply = (preset: EnvPreset): void => {
    const useStudio = preset.ground === 'studio';
    asphalt.mesh.visible = !useStudio;
    floor.mesh.visible = useStudio;

    // Undo the gain the albedo map was stored with, then tint.
    tint.setHex(preset.groundTint).multiplyScalar(ASPHALT_ALBEDO_SCALE);
    asphalt.mat.color.copy(tint);
    // Kerb and verge, at the same reflectances the IBL's proxy ground uses —
    // 0.197 for weathered concrete against asphalt's 0.155, 0.11 for grass.
    // These substitute for `diffuseColor` after the map has been sampled, and
    // by then it is already true albedo (the 4x baked into the map and the
    // 0.25 in `material.color` have cancelled), so they are written as plain
    // reflectances.
    //
    // Both were roughly double this, and the reference photograph measures
    // them directly: road, pavement and grass inside one patch of tree shade
    // white-balance to luminances of 102, 130 and 85, so the pavement returns
    // 1.27x the road and the grass 0.6-0.8x. See the derivation in ibl.ts —
    // the two files have to agree, because the verge you see and the verge
    // the paint reflects are the same grass.
    asphalt.patch.uKerbColor.value.setRGB(0.92, 0.91, 0.88).multiplyScalar(0.197);
    // Straw, not green — see the matching note in ibl.ts.
    asphalt.patch.uVergeColor.value.setRGB(0.82, 0.74, 0.42).multiplyScalar(0.11);
    asphalt.patch.uWetness.value = preset.wetness;
    asphalt.patch.uGoboStrength.value = preset.dapple;
    const azLen = Math.hypot(preset.sunDir[0], preset.sunDir[2]) || 1;
    asphalt.patch.uSunAz.value.set(preset.sunDir[0] / azLen, preset.sunDir[2] / azLen);

    // What shade *is*, rather than what colour it was decided to be.
    //
    // Shaded road is the same road with the sun taken off it and the sky left
    // on, so the multiplier is per-channel `E_sky / (E_sun + E_sky)` — and
    // both of those are already in the preset. At golden hour that works out
    // near (0.49, 0.66, 0.79): distinctly cooler than sun, a third of a stop
    // down, and nothing like the (0.33, 0.53, 0.97) a hand-picked blue hex
    // normalised to a target brightness produces. A hex cannot get this right
    // because the answer moves with the sun's elevation and colour — which is
    // precisely why the same number was wrong in all five presets at once,
    // taking the road to a quarter of its lit value and dragging a third of
    // every wide frame below level 40 with it.
    //
    // `shadeTint` survives as a small hue nudge on top, for the reflected
    // colour of whatever is doing the shading — leaves here, a building
    // elsewhere — which the sky term alone cannot know about.
    //
    // One correction to the plain sun/sky split: this gobo is *canopy* shade,
    // not open shade. A point under a plane tree has lost the sun and about
    // half the sky as well, because the crown that is blocking the one is
    // blocking much of the other. Without that factor the dapple washed out
    // to almost nothing the moment the fill came up — the road went flat and
    // pale and the frame read as a salt flat — and with it the shade lands
    // near (0.27, 0.36, 0.43), which is roughly where the peak-normalised hex
    // used to sit by accident, but correctly distributed across the channels
    // instead of nearly all in blue.
    const CANOPY_SKY_VIS = 0.55;
    const eSunY = Math.max(preset.sunDir[1], 0) * preset.sunIntensity;
    sun.setHex(preset.sunColor).multiplyScalar(eSunY);
    shade
      .setHex(preset.sky.zenith)
      .lerp(tint.setHex(preset.sky.horizon), 0.62)
      .multiplyScalar(Math.PI * preset.sky.exposure * preset.envIntensity);
    // …and one term back the other way. A patch of shade on a boulevard at
    // golden hour is not lit by sky alone: it is surrounded by a very large
    // area of *sunlit* road, stone and foliage, and takes a share of the
    // sun's energy back off all of it at one bounce. Leave that out and shade
    // comes back lilac — sky-coloured light and nothing else — which is what
    // the road did as soon as the fill came up, and which no real street does.
    // 0.15 of the sun's irradiance, warm, is what a 0.15-0.35 albedo surround
    // returns across a wide open aspect.
    const BOUNCE_FRAC = 0.15;
    shade.setRGB(
      (CANOPY_SKY_VIS * shade.r + BOUNCE_FRAC * sun.r) / Math.max(shade.r + sun.r, 1e-4),
      (CANOPY_SKY_VIS * shade.g + BOUNCE_FRAC * sun.g) / Math.max(shade.g + sun.g, 1e-4),
      (CANOPY_SKY_VIS * shade.b + BOUNCE_FRAC * sun.b) / Math.max(shade.b + sun.b, 1e-4),
    );
    tint.setHex(preset.shadeTint);
    const tLum = Math.max(0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b, 1e-4);
    shade.lerp(tint.multiplyScalar(1 / tLum).multiply(shade), 0.25);
    // Renormalised to unit luminance: this uniform is now a *hue* only. The
    // depth of the shade is done on the direct light in the shader, where it
    // belongs, and leaving any brightness in here as well would count it twice.
    const sLum = Math.max(0.2126 * shade.r + 0.7152 * shade.g + 0.0722 * shade.b, 1e-4);
    shade.multiplyScalar(1 / sLum);
    asphalt.patch.uShadeTint.value.copy(shade);
  };

  return {
    group,
    apply,
    update: () => {},
    dispose() {
      maps.dispose();
      studio.dispose();
      gobo.dispose();
      asphalt.mat.dispose();
      floor.mat.dispose();
      asphalt.mesh.geometry.dispose();
      floor.mesh.geometry.dispose();
    },
  };
}

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
  uShadeTint: THREE.IUniform<THREE.Color>;
}

function patchAsphalt(mat: THREE.MeshStandardMaterial, gobo: THREE.Texture): Patch {
  const u: Patch = {
    uWetness: { value: 0 },
    uGobo: { value: gobo },
    uGoboScale: { value: 1 / 26 },
    uGoboStrength: { value: 0 },
    uGoboOffset: { value: new THREE.Vector2(0.31, 0.62) },
    uDriftScale: { value: 1 / 210 },
    uShadeTint: { value: new THREE.Color(0.42, 0.46, 0.58) },
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
uniform vec3 uShadeTint;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
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

  // Dappled shade. Shaded road is lit by sky alone, so it goes cool as well
  // as dark — that colour shift is most of why real shade reads as shade.
  float lit = texture2D(uGobo, vGroundXZ * uGoboScale + uGoboOffset).r;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uShadeTint, (1.0 - lit) * uGoboStrength);
}`,
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
  mat.customProgramCacheKey = () => 'audi-asphalt-v1';
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
    normalScale: new THREE.Vector2(0.5, 0.5),
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
  const gobo = createGoboTexture(renderer, 512);
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
    asphalt.patch.uWetness.value = preset.wetness;
    asphalt.patch.uGoboStrength.value = preset.dapple;

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

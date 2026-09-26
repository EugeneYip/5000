/**
 * Image-based lighting, generated rather than loaded.
 *
 * The project ships no binary assets, so there is no .hdr to load. Instead a
 * small proxy world is assembled here — sky, road, roadside masses, or a set
 * of studio softboxes — rendered once into a 512² HDR cubemap and handed to
 * `PMREMGenerator` for prefiltering.
 *
 * The proxy world matters more than it looks. A car body is a curved mirror:
 * every horizontal panel shows the sky, every vertical panel shows whatever
 * is standing around at eye level. Give it an empty gradient and the flanks
 * go dead flat, which is the single most common reason a WebGL car looks like
 * a WebGL car. So the golden-hour world has tree masses and lit facades in it
 * at the right heights, and the studio world has strip lights positioned so
 * their reflections land along the shoulder line.
 *
 * The PMREM render target is allocated once and reused, so `envMap` keeps the
 * same texture identity across preset changes and nothing downstream has to
 * be re-pointed.
 */

import * as THREE from 'three';
import { createSkySphereForIbl, type SkyUniforms } from './sky';
import type { EnvPreset } from './presets';

/** Where the cube camera sits — roughly the car's own centre of mass. */
const PROBE = new THREE.Vector3(0, 0.95, -1.37);

export interface IblHandle {
  /** Stable across preset changes. */
  readonly texture: THREE.Texture;
  bake(preset: EnvPreset, sunDir: THREE.Vector3): void;
  dispose(): void;
}

const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSheenColor;
uniform vec3 uSunAzimuth;
uniform float uSheen;
varying vec3 vWorld;
void main() {
  vec3 v = vWorld - cameraPosition;
  float dist = length(v.xz);
  vec3 dir = normalize(v);
  // Grazing angles on a road are far brighter than the view straight down —
  // Fresnel plus the fact that you are looking along the wet/polished film.
  float graze = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 6.0);
  // A sheen streak running towards the sun, the way a low sun lays a path
  // down a road exactly as it does across water.
  float toSun = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), uSunAzimuth), 0.0), 8.0);
  vec3 c = uColor * (1.0 + graze * 1.6);
  c += uSheenColor * uSheen * (graze * 0.65 + toSun * graze * 2.2);
  // Fade the far field into the horizon haze instead of ending in a hard rim.
  c = mix(c, uColor * 2.2, smoothstep(40.0, 110.0, dist));
  gl_FragColor = vec4(c, 1.0);
}
`;

const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

interface Furniture {
  group: THREE.Group;
  apply(preset: EnvPreset, sunDir: THREE.Vector3): void;
}

/**
 * Trees and facades for the street presets. Placement follows the reference:
 * a double row of plane trees close in on both sides, taller massing behind,
 * and a low warm-lit stone facade on the sun side.
 */
function buildStreet(): Furniture {
  const group = new THREE.Group();
  group.name = 'ibl:street';

  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
  const canopyMat = new THREE.MeshBasicMaterial({ color: 0x1d2416 });
  const canopyLitMat = new THREE.MeshBasicMaterial({ color: 0x4a4a22 });
  const facadeMat = new THREE.MeshBasicMaterial({ color: 0x6b5a44 });
  const facadeLitMat = new THREE.MeshBasicMaterial({ color: 0xa08052 });

  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 6, 6);

  // A row each side, staggered, at the spacing of a boulevard planting.
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 7; i++) {
      const z = -26 + i * 9.5 + (side > 0 ? 4 : 0);
      const x = side * (9 + (i % 2) * 1.2);
      const h = 7.5 + (i % 3) * 1.4;

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 3, z);
      group.add(trunk);

      // Three overlapping blobs read as a crown; one sphere reads as a ball.
      for (let b = 0; b < 3; b++) {
        const crown = new THREE.Mesh(canopyGeo, b === 0 ? canopyLitMat : canopyMat);
        crown.position.set(
          x + (b - 1) * 1.6 + (i % 2) * 0.4,
          h + (b === 1 ? 1.1 : 0),
          z + (b - 1) * 1.1,
        );
        crown.scale.set(3.1 - b * 0.35, 2.2 - b * 0.2, 3.0 - b * 0.3);
        group.add(crown);
      }
    }
  }

  // Facades: a long block each side, well back, plus a taller mass ahead.
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const blocks: Array<[number, number, number, number, number, number, boolean]> = [
    [-26, 9, -12, 8, 18, 50, false],
    [26, 9, -6, 8, 18, 46, true],
    [-6, 7, 58, 26, 14, 8, true],
    [34, 11, 26, 10, 22, 22, true],
  ];
  for (const [x, y, z, sx, sy, sz, lit] of blocks) {
    const m = new THREE.Mesh(blockGeo, lit ? facadeLitMat : facadeMat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    group.add(m);
  }

  const tmp = new THREE.Color();
  return {
    group,
    apply(preset, sunDir) {
      // Everything roadside is lit by the same sun, so tie the "lit" faces to
      // the sun colour and elevation rather than leaving them hand-painted.
      const sunLit = Math.max(sunDir.y, 0) * preset.sunIntensity;
      const amb = preset.envIntensity * 0.35;

      tmp.setHex(preset.sunColor).multiplyScalar(0.085 * sunLit + 0.02 * amb);
      canopyLitMat.color.copy(tmp).lerp(new THREE.Color(0x394a20), 0.45);
      canopyMat.color.setHex(0x14180f).multiplyScalar(0.6 + amb);
      trunkMat.color.setHex(0x120f0c).multiplyScalar(0.6 + amb);

      facadeLitMat.color.setHex(preset.sunColor).multiplyScalar(0.19 * sunLit + 0.05 * amb);
      facadeMat.color.setHex(preset.sky.zenith).multiplyScalar(0.16 + 0.1 * amb);
    },
  };
}

/**
 * The studio. Three strip softboxes — a long one overhead running nose to
 * tail, and one high on each side angled in. The elongated highlight those
 * throw down the flanks is the single most recognisable automotive-studio
 * cue, so their aspect ratio and height are the load-bearing numbers here.
 */
function buildStudio(): Furniture {
  const group = new THREE.Group();
  group.name = 'ibl:studio';

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(26, 14, 34),
    new THREE.MeshBasicMaterial({ color: 0x050507, side: THREE.BackSide }),
  );
  shell.position.set(0, 6, -1.4);
  group.add(shell);

  const key = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
  const fill = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
  const top = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
  const back = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });

  const strip = (
    mat: THREE.Material,
    w: number,
    h: number,
    pos: [number, number, number],
    rot: [number, number, number],
  ): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    group.add(m);
    return m;
  };

  const D = Math.PI / 180;
  // Overhead strip: long and narrow, so the roof and bonnet get one clean
  // band rather than a wash.
  strip(top, 1.9, 11, [0, 6.4, -1.4], [Math.PI / 2, 0, 0]);
  // Key, camera-left, tilted down 38°. Sits at 2.9 m — about shoulder height
  // for a softbox on a boom, which puts its reflection on the beltline.
  strip(key, 1.35, 9.5, [-4.6, 3.1, -1.2], [0, 90 * D, -52 * D]);
  // Fill, camera-right, a stop and a half down.
  strip(fill, 1.6, 9.0, [4.8, 3.3, -1.6], [0, -90 * D, 52 * D]);
  // Low backlight to pop the roofline off the black.
  strip(back, 6.0, 2.4, [0, 2.6, -11], [0, Math.PI, 0]);

  return {
    group,
    apply(preset) {
      const g = preset.envIntensity;
      key.color.setRGB(1, 0.99, 0.97).multiplyScalar(7.2 * g);
      fill.color.setRGB(0.97, 0.98, 1).multiplyScalar(2.6 * g);
      top.color.setRGB(1, 1, 1).multiplyScalar(5.2 * g);
      back.color.setRGB(0.93, 0.96, 1).multiplyScalar(2.0 * g);
    },
  };
}

export function createIbl(renderer: THREE.WebGLRenderer, skyUniforms: SkyUniforms): IblHandle {
  const scene = new THREE.Scene();
  scene.add(createSkySphereForIbl(skyUniforms));

  const groundUniforms = {
    uColor: { value: new THREE.Color(0.04, 0.04, 0.042) },
    uSheenColor: { value: new THREE.Color(1, 0.72, 0.44) },
    uSunAzimuth: { value: new THREE.Vector3(-0.82, 0, 0.58) },
    uSheen: { value: 0.25 },
  };
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 72),
    new THREE.ShaderMaterial({
      uniforms: groundUniforms,
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const street = buildStreet();
  const studio = buildStudio();
  scene.add(street.group, studio.group);

  const cubeRT = new THREE.WebGLCubeRenderTarget(512, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const cubeCam = new THREE.CubeCamera(0.4, 400, cubeRT);
  cubeCam.position.copy(PROBE);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let target: THREE.WebGLRenderTarget | null = null;

  // Allocate the PMREM target up front so `texture` can be readonly and the
  // material library only ever has to be handed one texture object.
  const placeholder = pmrem.fromCubemap(cubeRT.texture);
  target = placeholder;

  const albedo = new THREE.Color();
  const sunAz = new THREE.Vector3();

  const bake = (preset: EnvPreset, sunDir: THREE.Vector3): void => {
    street.group.visible = preset.ground !== 'studio';
    studio.group.visible = preset.ground === 'studio';
    ground.visible = preset.ground !== 'studio';

    street.apply(preset, sunDir);
    studio.apply(preset, sunDir);

    // Outgoing radiance of the road: albedo × irradiance / π. Road reflectance
    // is around 0.09; this is why bounce off asphalt is a subtle warm lift and
    // not the floodlight people tend to dial in.
    const sunTerm = (Math.max(sunDir.y, 0) * preset.sunIntensity) / Math.PI;
    const skyTerm = 0.14 * preset.envIntensity;
    albedo.setHex(preset.groundTint).multiplyScalar(0.09 * (sunTerm + skyTerm));
    groundUniforms.uColor.value.copy(albedo);
    groundUniforms.uSheenColor.value.setHex(preset.sky.sun);
    groundUniforms.uSheen.value = 0.12 + preset.wetness * 0.95;
    sunAz.set(sunDir.x, 0, sunDir.z);
    if (sunAz.lengthSq() < 1e-6) sunAz.set(0, 0, 1);
    groundUniforms.uSunAzimuth.value.copy(sunAz.normalize());

    scene.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    cubeCam.update(renderer, scene);
    renderer.shadowMap.enabled = prevShadow;
    renderer.setRenderTarget(prevTarget);


    pmrem.fromCubemap(cubeRT.texture, target!);

    // TEMP-PROBE (removed before hand-off)
    (globalThis as any).__IBL_PROBE = () => {
      const half = (h: number): number => {
        const s = (h & 0x8000) >> 15, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
        if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
        if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
        return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
      };
      const faceStats = [];
      let total = 0;
      for (let f = 0; f < 6; f++) {
        const buf = new Uint16Array(512 * 512 * 4);
        renderer.readRenderTargetPixels(cubeRT as any, 0, 0, 512, 512, buf, f);
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < buf.length; i += 4) {
          r += half(buf[i]); g += half(buf[i + 1]); b += half(buf[i + 2]);
        }
        const n = 512 * 512;
        faceStats.push([r / n, g / n, b / n]);
        total += (0.2126 * r + 0.7152 * g + 0.0722 * b) / n;
      }
      const pw = target!.width, ph = target!.height;
      const pbuf = new Uint16Array(pw * ph * 4);
      renderer.readRenderTargetPixels(target!, 0, 0, pw, ph, pbuf);
      let pr = 0, pg = 0, pb = 0, pmax = 0, cnt = 0;
      for (let i = 0; i < pbuf.length; i += 4) {
        const R = half(pbuf[i]), G = half(pbuf[i + 1]), B = half(pbuf[i + 2]);
        if (!Number.isFinite(R)) continue;
        pr += R; pg += G; pb += B; cnt++;
        pmax = Math.max(pmax, 0.2126 * R + 0.7152 * G + 0.0722 * B);
      }
      return {
        cubeFaces: { px: faceStats[0], nx: faceStats[1], py: faceStats[2], ny: faceStats[3], pz: faceStats[4], nz: faceStats[5] },
        cubeMeanLuminance: total / 6,
        pmremSize: [pw, ph],
        pmremMean: [pr / cnt, pg / cnt, pb / cnt],
        pmremMaxLuminance: pmax,
      };
    };
  };

  return {
    get texture(): THREE.Texture {
      return target!.texture;
    },
    bake,
    dispose() {
      cubeRT.dispose();
      target?.dispose();
      pmrem.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
    },
  };
}

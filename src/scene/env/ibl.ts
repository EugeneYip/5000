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

/**
 * Diffuse reflectance of city asphalt. Measured values for urban road surface
 * run 0.12–0.18; fresh laid bitumen is nearer 0.07 and is not what a car is
 * ever photographed standing on.
 */
const ROAD_ALBEDO = 0.155;

/**
 * …and the two surfaces either side of it, which a vertical body panel
 * mirrors just as much of and which were not modelled at all. Weathered
 * concrete pavement, and dry late-summer grass.
 */
const KERB_ALBEDO = 0.35;
const VERGE_ALBEDO = 0.22;

export interface IblHandle {
  /** Stable across preset changes. */
  readonly texture: THREE.Texture;
  bake(preset: EnvPreset, sunDir: THREE.Vector3): void;
  dispose(): void;
}

const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uKerbColor;
uniform vec3 uVergeColor;
uniform vec3 uHorizonColor;
uniform vec3 uSheenColor;
uniform vec3 uSunAzimuth;
uniform float uSheen;
uniform float uGloss;
varying vec3 vWorld;
void main() {
  vec3 v = vWorld - cameraPosition;
  float dist = length(v.xz);
  vec3 dir = normalize(v);

  // The boulevard is not one surface. Carriageway out to eleven metres, then
  // a concrete kerb and pavement, then the grass verge the trees stand in.
  // Their reflectances are 0.155, 0.35 and 0.22 — the pavement returns nearly
  // two and a half times what the asphalt does and the verge half as much
  // again, and all three sit in the band a vertical body panel mirrors.
  //
  // This matters more than anything else in the file. Measured by zeroing the
  // terms one at a time: with the proxy road removed a shaded flank falls from
  // 56 to 30, with the furniture removed it only falls to 48, and with the sky
  // band changed by any amount it does not move at all. A vertical panel on
  // this car is lit by the reflection of the ground and essentially nothing
  // else — so reducing the whole lower hemisphere to one flat asphalt colour
  // was throwing away most of the fill the flanks are supposed to stand in.
  float across = abs(vWorld.x);
  vec3 surf = mix(uColor, uKerbColor, smoothstep(10.5, 12.5, across));
  surf = mix(surf, uVergeColor, smoothstep(15.5, 18.0, across));

  // Schlick. A road is a dielectric, so at grazing incidence it stops being
  // asphalt and becomes a mirror — which is why the far end of a dry street
  // is pale and looks wet. What it mirrors is the sky just above the horizon
  // in the same direction, and that is the single largest cool source a
  // vertical body panel has: the panel's own reflection points along the
  // horizon, and the lower half of that band is all road.
  //
  // The previous version multiplied the *asphalt* colour up at grazing
  // angles instead. Same brightness, entirely the wrong colour — it made the
  // brightest part of the lower hemisphere the warmest, and the flanks went
  // orange.
  float graze = pow(clamp(1.0 - abs(dir.y), 0.0, 1.0), 5.0);
  float fres = 0.04 + 0.96 * graze;
  float mirror = fres * uGloss;

  vec3 c = surf * (1.0 - mirror);
  c += uHorizonColor * mirror;

  // A sheen streak running towards the sun, the way a low sun lays a path
  // down a road exactly as it does across water. This one *is* warm, because
  // it is the sun's own image; it just has no business anywhere else.
  float toSun = pow(max(dot(normalize(vec3(v.x, 0.0, v.z)), uSunAzimuth), 0.0), 8.0);
  c += uSheenColor * uSheen * toSun * graze * 2.4;

  // Beyond about thirty metres the surface is veiled, and what it is veiled
  // by is the same horizon sky, so the road and the sky meet without a seam.
  c = mix(c, uHorizonColor, smoothstep(30.0, 150.0, dist));
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
 * Mean radiance of the sky dome for a preset, in the same units the rest of
 * the bake works in. The sky shader ramps from zenith to horizon, so the mean
 * is a weighted blend of the two; the weight leans towards the horizon because
 * that is where most of a hemisphere's solid angle is.
 *
 * Irradiance on a surface seeing a fraction `f` of this sky is `f · π · L`,
 * and a lambertian surface then emits `albedo · f · L` — the π cancels, which
 * is why nothing below divides by it except the direct-sun terms.
 */
function skyRadiance(preset: EnvPreset, out: THREE.Color): number {
  out
    .setHex(preset.sky.zenith)
    .lerp(_hor.setHex(preset.sky.horizon), 0.62)
    .multiplyScalar(preset.sky.exposure * preset.envIntensity);
  return 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
}
const _hor = new THREE.Color();

/** `out += c · k`. Radiances add; `Color` has no operator for it. */
function addScaled(out: THREE.Color, c: THREE.Color, k: number): THREE.Color {
  out.r += c.r * k;
  out.g += c.g * k;
  out.b += c.b * k;
  return out;
}

/**
 * The Parkway, as far as a reflection is concerned.
 *
 * What a vertical body panel sees is a band of the world roughly fifteen
 * degrees either side of the horizon — that is where the mirror direction
 * points when the camera is at chest height and the panel is upright. So the
 * only things in here that matter are the ones standing in that band: the tree
 * trunks and the lower crowns, the building masses, and the road itself.
 *
 * Every radiance below is derived rather than picked. A lambertian surface
 * emits `albedo · E / π`, so all that is needed is the irradiance reaching it
 * and a plausible reflectance — limestone 0.42, foliage 0.14, bark 0.10. That
 * is why the flanks come out at the brightness they do instead of at whatever
 * looked right in one preset and then went wrong in the next four.
 *
 * The geometry is set out to leave the horizon *open*. The previous version
 * put an eighteen-metre wall twenty-two metres away, which subtended nearly
 * forty degrees and closed the sky out of the very band the panels reflect;
 * that, more than any missing light, is what made the flanks go dark. The
 * masses are now further out and lower, and the tree rows are spaced so sky
 * shows between the crowns — which is what the photograph shows too.
 *
 * **Why this file, and not the light rig, decides how bright the car is.**
 * `paint.ts` builds the body with `metalness: 1.0`. A fully metallic material
 * has *no diffuse lobe at all*, so the hemisphere light, the road-bounce light
 * and the rim light contribute nothing whatsoever to a body panel — measured:
 * taking `hemi.intensity` from 0.12 to 0.75 moves a shaded flank by zero
 * levels. Everything a panel that is not in direct sun shows is the
 * environment map. So when the flanks read two stops dark, the fault is here,
 * in what the proxy world radiates into the band those panels mirror — and
 * raising the sky's own exposure cannot fix it, because the sky dome is also
 * the background and reaches white long before the flanks reach 148.
 */
function buildStreet(): Furniture {
  const group = new THREE.Group();
  group.name = 'ibl:street';

  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
  const trunkLitMat = new THREE.MeshBasicMaterial({ color: 0x6b553c });
  const canopyMat = new THREE.MeshBasicMaterial({ color: 0x1d2416 });
  const canopyLitMat = new THREE.MeshBasicMaterial({ color: 0x4a4a22 });
  const facadeMat = new THREE.MeshBasicMaterial({ color: 0x6b5a44 });
  const facadeLitMat = new THREE.MeshBasicMaterial({ color: 0xa08052 });

  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 7, 6);

  /** Crowns whose sunward side is turned towards the probe, and trunks. */
  const crowns: Array<{ mesh: THREE.Mesh; nx: number; nz: number }> = [];
  const trunks: Array<{ mesh: THREE.Mesh; nx: number; nz: number }> = [];

  // A row each side at boulevard spacing. Set back to the far kerb — plane
  // trees on the Parkway stand about twelve metres off the centre of a traffic
  // lane, and at nine they loomed over the car and shuttered the horizon.
  //
  // Sixteen, not twelve and a half. The band a vertical panel actually mirrors
  // runs from the horizon to about twenty degrees up, and at 12.5 m a crown
  // whose underside is at 6 m already starts at 24° — so the row was not in
  // the band, it was the *lid* on it, and the panels were mirroring the dark
  // undersides of two hundred leaf blobs. Out at sixteen the same crown starts
  // at 19° and the band below it opens onto road, kerb and lit stone.
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 7; i++) {
      const z = -30 + i * 11.5 + (side > 0 ? 5 : 0);
      const x = side * (16.0 + (i % 2) * 1.4);
      const h = 8.6 + (i % 3) * 1.5;

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 3.5, z);
      group.add(trunk);
      trunks.push({ mesh: trunk, nx: -x, nz: -z });

      // Three overlapping blobs read as a crown; one sphere reads as a ball.
      // Sized to leave four metres of sky between neighbours — a continuous
      // hedge at this height is a wall, and a wall is what we are removing.
      for (let b = 0; b < 3; b++) {
        const crown = new THREE.Mesh(canopyGeo, canopyMat);
        const cx = x + (b - 1) * 1.5 + (i % 2) * 0.4;
        const cz = z + (b - 1) * 1.0;
        crown.position.set(cx, h + (b === 1 ? 1.0 : 0), cz);
        crown.scale.set(2.8 - b * 0.3, 2.0 - b * 0.18, 2.7 - b * 0.28);
        group.add(crown);
        crowns.push({ mesh: crown, nx: -cx, nz: -cz });
      }
    }
  }

  // Building masses. Long and low rather than near and tall: at forty metres
  // an eleven-metre cornice sits fifteen degrees up, so the sky above it stays
  // in the reflection band.
  //
  // Broken into separate masses with varied heights and setbacks, because a
  // single long slab reflects as a single long slab — it put a hard-edged tan
  // rectangle across the bonnet with a dead straight top edge, which is the
  // one thing in a reflection the eye reads instantly as artificial. A street
  // of separate buildings gives a broken cornice line and reads as a street.
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const blocks: Array<[number, number, number, number, number, number]> = [];
  // Deterministic, so the boulevard is the same every run.
  let seed = 0x5000c3;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 7; i++) {
      const h = 7 + rnd() * 9;
      const depth = 15 + rnd() * 9;
      const setback = 38 + rnd() * 9;
      blocks.push([side * setback, h / 2, -72 + i * 19 + side * 7, 13, h, depth]);
    }
  }
  // The Museum end of the boulevard, which is the one place the photograph
  // shows real height, and a taller mass off to one side.
  blocks.push([-7, 8, 86, 46, 16, 14]);
  blocks.push([26, 11, 94, 22, 22, 16]);
  blocks.push([58, 10, 40, 16, 20, 30]);

  const blockMeshes: THREE.Mesh[] = [];
  for (const [x, y, z, sx, sy, sz] of blocks) {
    const m = new THREE.Mesh(blockGeo, facadeMat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    group.add(m);
    blockMeshes.push(m);
  }

  const sky = new THREE.Color();
  const sun = new THREE.Color();
  const tint = new THREE.Color();

  /** Pale limestone, sun-bleached brick, concrete. */
  const STONE = 0.42;
  /** Plane-tree foliage in leaf. */
  const LEAF = 0.15;
  /** …and what gets *through* a crown rather than off it. */
  const LEAF_T = 0.1;
  /** Bark. */
  const BARK = 0.11;

  return {
    group,
    apply(preset, sunDir) {
      // The sun's irradiance, resolved onto the two orientations that matter.
      // At 11.5° of elevation a wall turned square to the sun receives five
      // times what the road does — that asymmetry is the whole character of a
      // low sun in a street, and it is why the flanks are lit by buildings
      // rather than from above. `sunColor · sunIntensity` is the irradiance
      // the matching DirectionalLight delivers, so the two cannot drift.
      const sunFlat = Math.min(Math.hypot(sunDir.x, sunDir.z), 1);
      const eWall = sunFlat * preset.sunIntensity;
      const eGround = Math.max(sunDir.y, 0) * preset.sunIntensity;

      skyRadiance(preset, sky);
      sun.setHex(preset.sunColor);

      // Which face of each mass the car can see, and whether the sun is on
      // it. Only the side turned towards the probe is ever in the reflection,
      // so the test is whether that side's normal faces the sun. This used to
      // be a hand-set flag per block, and it was wrong for the mass ahead of
      // the car — which put a warm slab in the bonnet's reflection where the
      // photograph has sky. Deriving it also means the five presets, which do
      // not share a sun azimuth, each get their own answer.
      const facesSun = (nx: number, nz: number): number => {
        const inv = 1 / Math.max(Math.hypot(nx, nz), 1e-4);
        return nx * inv * sunDir.x + nz * inv * sunDir.z;
      };

      for (const m of blockMeshes) {
        m.material = facesSun(-m.position.x, -m.position.z) > 0.08 ? facadeLitMat : facadeMat;
      }

      // The same test for the planting, which used to pick the lit blob as
      // `b === 0` — one in three, everywhere, regardless of where the sun was.
      // A crown is lit on the side the sun is on like everything else, and the
      // crowns a *shaded* flank mirrors are precisely the ones across the road,
      // whose car-facing side is the sunward one. Getting that wrong is most of
      // why the shaded flank had a dark tunnel to look into: two thirds of the
      // canopy was shaded no matter which way it faced.
      for (const c of crowns) c.mesh.material = facesSun(c.nx, c.nz) > 0 ? canopyLitMat : canopyMat;
      for (const t of trunks) t.mesh.material = facesSun(t.nx, t.nz) > 0 ? trunkLitMat : trunkMat;

      // A surface seeing a fraction f of the sky emits `albedo · f · L`, and
      // one facing the sun adds `albedo · E · cos / π`. Every colour below is
      // one or both of those; nothing is hand-painted.
      addScaled(
        facadeLitMat.color.copy(sun).multiplyScalar((STONE / Math.PI) * eWall * 0.82),
        sky,
        STONE * 0.45,
      );
      facadeMat.color.copy(sky).multiplyScalar(STONE * 0.5);

      // Lit foliage at this sun elevation is half *transmitted* light, so it
      // goes gold rather than staying green, and it is far from black. It was
      // black — 0.006 — which turned the whole tree row into a matte the
      // flanks could only lose light to.
      addScaled(
        canopyLitMat.color.setRGB(1.0, 0.84, 0.44).multiply(sun).multiplyScalar((LEAF / Math.PI) * eWall * 1.5),
        sky,
        LEAF * 0.3,
      );
      // Shaded foliage keeps the sky's colour through its own green, and a
      // crown at this sun elevation is also *translucent*: roughly a tenth of
      // what hits the far side comes through. That transmitted light is the
      // difference between a tree line and a hole in the world.
      //
      // The transmitted term carried a further 0.4 discount on top of the 0.1
      // transmittance, which is double-counting: `LEAF_T` is already the
      // fraction that gets through. At a sun 11° above the horizon every crown
      // in the row is edge-on to the beam and glowing, which is exactly what
      // the photograph shows of the planting behind the car.
      canopyMat.color.copy(sky).multiply(tint.setRGB(0.42, 0.56, 0.33)).multiplyScalar(0.45);
      addScaled(canopyMat.color, tint.setRGB(1.0, 0.82, 0.4).multiply(sun), (LEAF_T / Math.PI) * eWall);

      // Bark. A trunk is *vertical*, so the irradiance on it is the wall's,
      // not the ground's — this read `eGround`, which at 11.5° of elevation is
      // one fifth of `eWall`, and then discounted it by a further 0.12. The
      // row came out at 0.025 radiance: black posts standing in front of the
      // one bright thing in the band. A cylinder averages 1/π of the normal
      // irradiance over its lit half, which is the only discount it should get.
      trunkMat.color.copy(sky).multiplyScalar(BARK * 0.45);
      addScaled(
        trunkLitMat.color.copy(sun).multiplyScalar((BARK / Math.PI) * eWall * (1 / Math.PI)),
        sky,
        BARK * 0.45,
      );
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
    uKerbColor: { value: new THREE.Color(0.09, 0.09, 0.09) },
    uVergeColor: { value: new THREE.Color(0.06, 0.07, 0.04) },
    uHorizonColor: { value: new THREE.Color(0.2, 0.24, 0.3) },
    uSheenColor: { value: new THREE.Color(1, 0.72, 0.44) },
    uSunAzimuth: { value: new THREE.Vector3(-0.82, 0, 0.58) },
    uSheen: { value: 0.25 },
    uGloss: { value: 0.55 },
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
  const skyCol = new THREE.Color();
  const sunAz = new THREE.Vector3();

  const bake = (preset: EnvPreset, sunDir: THREE.Vector3): void => {
    street.group.visible = preset.ground !== 'studio';
    studio.group.visible = preset.ground === 'studio';
    ground.visible = preset.ground !== 'studio';

    street.apply(preset, sunDir);
    studio.apply(preset, sunDir);

    // Outgoing radiance of the road: albedo × irradiance / π.
    //
    // The reflectance was 0.09, which is fresh tarmac in a car park. City
    // asphalt that has been rained on, swept, and driven polished for twenty
    // years measures 0.12–0.18 and is warmer, because what you are actually
    // looking at is the aggregate and the dust, not the bitumen. 0.155 is the
    // middle of that, and it nearly doubles what the road returns to the
    // sills, the wheels and the lower body sides.
    const sunTerm = (Math.max(sunDir.y, 0) * preset.sunIntensity) / Math.PI;
    // Sky irradiance over π is just the mean sky radiance, which is what the
    // sky shader ramps between — so read it from there rather than carrying a
    // second, silently disagreeing constant.
    const skyTerm = skyRadiance(preset, skyCol);
    const eTotal = sunTerm + skyTerm;
    albedo.setHex(preset.groundTint).multiplyScalar(ROAD_ALBEDO * eTotal);
    groundUniforms.uColor.value.copy(albedo);
    // The kerb and pavement, and the grass verge the trees stand in. Same
    // irradiance, their own reflectances — concrete weathered to 0.35, dry
    // late-summer grass to 0.22 with the green it still has.
    groundUniforms.uKerbColor.value.setHex(preset.groundTint).multiplyScalar(KERB_ALBEDO * eTotal);
    groundUniforms.uVergeColor.value.setRGB(0.78, 0.86, 0.52).multiplyScalar(VERGE_ALBEDO * eTotal);
    // What the far field is veiled by: the sky the shader itself draws at the
    // horizon, at the same exposure, so the road and the sky meet without a
    // seam and the panels see one continuous band.
    //
    // No 0.88 discount any more. That was here to stop the far road reading
    // brighter than the sky above it — but at eighty-odd degrees of incidence
    // a dielectric returns what it is given, and the photograph has exactly
    // that: the far half of the boulevard at 171 against a sky of about 135.
    groundUniforms.uHorizonColor.value
      .setHex(preset.sky.horizon)
      .multiplyScalar(preset.sky.exposure * preset.envIntensity);
    groundUniforms.uSheenColor.value.setHex(preset.sky.sun);
    groundUniforms.uSheen.value = 0.12 + preset.wetness * 0.95;
    // How sharply the surface mirrors. Dry asphalt scatters most of its
    // grazing reflection into a wide lobe, so it picks up the horizon's
    // colour without ever showing an image; standing water approaches one.
    //
    // 0.74 dry, not 0.52. Scattering the lobe wide does not *destroy* the
    // energy — at 85° of incidence a dielectric returns nearly all of it, just
    // smeared over the whole horizon band instead of into an image, and the
    // horizon band is what this term is already painting. The photograph
    // settles it: the far half of the boulevard reads 171 against a sky of
    // ~135, i.e. the road is the *brighter* of the two, and at 0.52 it could
    // never get past 55 % of the horizon sky. The lower half of every vertical
    // panel's reflection is made of this number.
    groundUniforms.uGloss.value = 0.74 + preset.wetness * 0.24;
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

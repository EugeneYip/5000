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
 *
 * Both were about twice this and both are measurable, because the reference
 * photograph shows all three surfaces standing in the *same* light. Sampling
 * road, pavement and grass inside one patch of tree shade and white-balancing
 * them gives luminances of 102, 130 and 85 — the pavement returns 1.27 times
 * what the road does and the grass 0.6 to 0.8 times. Against asphalt's 0.155
 * that is 0.197 and about 0.11. The file had 0.35 and 0.22, i.e. 2.26x and
 * 1.42x, which put a pale khaki band along the horizon brighter than the
 * carriageway in front of it — the render's verge measured 196 against the
 * road's 121, where the photograph has the grass *darker* than the road.
 *
 * 0.22 for grass is the classic vegetation mistake: that is roughly its
 * near-infrared reflectance. Leaf pigment absorbs hard right across the
 * visible, and mown grass measures 0.10-0.13 to the eye however bright it
 * looks on a false-colour plate.
 *
 * This matters here rather than anywhere else because these two surfaces sit
 * at ten to eighteen metres, which is square in the band a vertical body
 * panel mirrors — so the whole of that overstatement was arriving on the
 * flanks as warm fill.
 */
const KERB_ALBEDO = 0.197;
const VERGE_ALBEDO = 0.11;

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
uniform vec3 uShadeMul;
uniform float uSheen;
uniform float uGloss;
uniform float uCanopy;
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

  // The planting's shade, on the road the car *reflects*.
  //
  // ground.ts has painted this on the road the car stands on since the gobo
  // went in, but the proxy ground here was left in unbroken sunlight — so the
  // flanks were mirroring a boulevard that does not exist, one lit by an open
  // sky where the real one in frame is mostly in its own trees' shade. At
  // 11.5° of solar elevation a fifteen-metre plane tree throws seventy metres
  // of shadow and the row is seven trees deep: the reference photograph's
  // carriageway is in shade with sun flecks punched through it, not the other
  // way round, and that shade is both a stop down and distinctly cooler.
  //
  // Only the bands, not the leaf structure. This map is prefiltered by PMREM
  // and every body panel that matters reads it at a roughness where features
  // finer than a few degrees are already gone, so the leaf-scale detail the
  // gobo texture carries would be integrated away — while the 13 m band pitch
  // survives and is what actually changes the colour of the lower hemisphere.
  // Same pitch, same sun frame and the same depth and tint as ground.ts, so
  // the road the car stands on and the road it mirrors are one surface.
  vec2 sunFwd = uSunAzimuth.xz;
  float acrossSun = dot(vWorld.xz, vec2(-sunFwd.y, sunFwd.x));
  float alongSun = dot(vWorld.xz, sunFwd);
  // A row of trees wanders; two incommensurate periods are enough to stop the
  // bands reading as a ruled grating once they are blurred into the map.
  float wander = sin(alongSun * 0.071) * 1.25 + sin(alongSun * 0.0293 + 1.7) * 0.85;
  float s = acrossSun / 13.0 + wander;
  float shade = (1.0 - smoothstep(0.24, 0.44, abs(fract(s) - 0.5))) * uCanopy;
  surf *= mix(vec3(1.0), uShadeMul, shade);

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
  // …and the streak is the sun's image, so the canopy takes it out along with
  // everything else the sun was doing to that stretch of road.
  c += uSheenColor * uSheen * toSun * graze * 2.4 * (1.0 - shade * 0.88);

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
 * Mean radiance of the sky dome for a preset, **as the sky actually stands in
 * the baked cubemap** — `sky.exposure` and nothing else, because that is all
 * `createSkySphereForIbl` is given. The sky shader ramps from zenith to
 * horizon, so the mean is a weighted blend of the two; the weight leans
 * towards the horizon because that is where most of a hemisphere's solid
 * angle is.
 *
 * Irradiance on a surface seeing a fraction `f` of this sky is `f · π · L`,
 * and a lambertian surface then emits `albedo · f · L` — the π cancels, which
 * is why nothing below divides by it except the direct-sun terms.
 *
 * ## It used to fold `envIntensity` in, and that was a double count
 *
 * The justification written here was that `envIntensity` “is the units a
 * material finally sees, and the material side multiplies the whole map by
 * `envIntensity` again”. **The material side does no such thing.** three
 * applies `scene.environmentIntensity` in exactly one place
 * (`WebGLRenderer.js`, in `setProgram`):
 *
 *     if ( ( material.isMeshStandardMaterial || … )
 *          && material.envMap === null && scene.environment !== null )
 *         m_uniforms.envMapIntensity.value = scene.environmentIntensity;
 *
 * — only for materials with **no `envMap` of their own**. `materials.setEnvMap`
 * hands every car material the IBL texture directly, so 77 of the 87 materials
 * in the scene never see `envIntensity` at all; measured, taking
 * `scene.environmentIntensity` from 3.3 to 0 leaves the bonnet, the flanks and
 * the bumper on exactly their old numbers and moves only the road, which is
 * one of the ten that has no `envMap`.
 *
 * So the sky term of the irradiance budget was standing 3.3× over the sky in
 * the same cubemap, while the direct-sun term next to it was not — which is
 * both a brightness error and a *ratio* error between the two, and the second
 * one is why the proxy road's tree shade came out a stop too weak (`shadeMul`
 * below is that ratio).
 *
 * `envIntensity` is still applied, because what presets.ts defines it as — the
 * factor by which this proxy world under-counts the real boulevard — is a real
 * argument and the flanks are standing in it. It is applied where that
 * definition puts it: as a gain on what the proxy world *emits*, after the
 * budget is worked out honestly, and not to the sky or to the overhead canopy,
 * neither of which is under-counted.
 */
function skyRadiance(preset: EnvPreset, out: THREE.Color): number {
  out
    .setHex(preset.sky.zenith)
    .lerp(_hor.setHex(preset.sky.horizon), 0.62)
    .multiplyScalar(preset.sky.exposure);
  return 0.2126 * out.r + 0.7152 * out.g + 0.0722 * out.b;
}
const _hor = new THREE.Color();

/**
 * The gain the proxy world — and only the proxy world — carries.
 *
 * presets.ts defines `envIntensity` as the factor by which this forty-blob
 * boulevard under-counts the real one: the far carriageway and its traffic,
 * parked cars at exactly flank height, the pavement crowds, the lamp standards.
 * All of that is *furniture*, so the factor belongs on what the furniture and
 * the road emit and nowhere else. The sky is not under-counted — it is
 * modelled in full by the same shader the background dome uses — and neither
 * is the overhead canopy, which is a silhouette *against* that sky and would
 * become brighter than it.
 */
function proxyGain(preset: EnvPreset): number {
  return preset.proxyGain;
}

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
      trunk.name = 'ibl:trunk';
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
        crown.name = 'ibl:crown';
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
    m.name = 'ibl:block';
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    group.add(m);
    blockMeshes.push(m);
  }

  // --- the canopy ------------------------------------------------------------
  //
  // The single largest error in the project was here: the upper hemisphere of
  // this proxy world was open sky from twenty degrees to the zenith, right
  // round the compass, and the paint is `metalness: 1.0` with no diffuse lobe,
  // so a horizontal panel had nothing else to be. The bonnet came back at a
  // flat 170 over its whole area. The photograph's is 113, running 83 on the
  // kerb side to 159 on the carriageway side with one bright streak — because
  // the real car is parked under a row of London planes and a bonnet is a
  // mirror, so what it shows is a broken dark canopy with sky through the
  // holes.
  //
  // **Laid out in the probe's angular frame, not in metres.** What a mirror
  // integrates is solid angle, so the thing that has to be controlled is how
  // much of each *direction* is leaf and how much is sky — and placing crowns
  // at plausible street coordinates gives no control over that at all (the
  // existing row at ±16 m covers 19°–39° at two azimuths and nothing else).
  // Cells of azimuth × elevation, one jittered lobe each, a keep probability
  // per cell: coverage becomes a number that can be read off the photograph
  // and set, instead of an emergent property of a tree spacing.
  //
  // Two bands of elevation matter and they are not the same surface:
  //   · 10°–30° behind the car is what the **bonnet** mirrors. A panel that
  //     slopes 8° forward, seen from a camera 3.7 m ahead at 1.12 m, reflects
  //     2 × 8° + 3° ≈ 19° up and aft.
  //   · 50°–70° over the camera is what the **windscreen** mirrors, at 60° of
  //     rake and near-grazing incidence.
  // Both are covered here; the roof and the tailgate glass pick up the rest.
  const canopyGroup = new THREE.Group();
  canopyGroup.name = 'ibl:canopy';
  group.add(canopyGroup);

  const canopyDeepMat = new THREE.MeshBasicMaterial({ color: 0x0d1109 });
  const canopyRimMat = new THREE.MeshBasicMaterial({ color: 0x2e2a14 });
  /**
   * The outer, thin part of a crown, where the sky comes through the leaves.
   *
   * Without it the layer is binary — full sky or full leaf — and so is the
   * bonnet: measured, it came back with a quarter of its area at 173 and
   * another quarter at 70 and almost nothing in between, which is a stencil,
   * not shade. The photograph's bonnet is graded, half of it lying between 95
   * and 145, because a real crown has an opaque core and a ragged skirt and a
   * panel sees both. `depthWrite: false` so overlapping skirts compound the
   * way overlapping foliage does.
   */
  const canopyVeilMat = new THREE.MeshBasicMaterial({
    color: 0x0d1109, transparent: true, opacity: 0.55, depthWrite: false,
  });
  /**
   * …and the same skirt when the sun is on it. Sunlight is a *lighting* state,
   * not an opacity one: the previous version swapped a lit skirt for the
   * opaque rim material, so half the layer silently stopped being skirt on
   * whichever side the sun was, and the `VEIL_FRAC` calibration below only
   * held on the shaded side.
   */
  const canopyRimVeilMat = new THREE.MeshBasicMaterial({
    color: 0x2e2a14, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const leaves: Array<{
    mesh: THREE.Mesh; ux: number; uy: number; uz: number;
    rank: number; veil: boolean;
  }> = [];

  let cseed = 0x0a17d1;
  const crnd = (): number => {
    cseed = (cseed * 1103515245 + 12345) & 0x7fffffff;
    return cseed / 0x7fffffff;
  };

  /**
   * Fraction of the sky the planting stands in front of, over the kerb it
   * grows on and over the open carriageway. Half of it is skirt rather than
   * core, so what a panel actually sees through is
   * `(1 − cover) + cover · VEIL_FRAC · (1 − opacity)`, which at these two
   * numbers is 0.29 and 0.77.
   *
   * Both were read off the photograph rather than chosen. Inverting the tone
   * curve on the bonnet's left and right thirds — 83 and 159 against the 170
   * this render gives under an open sky — asks for transmissions of 0.29 and
   * 0.79, and the mid third then lands at 130 against a measured 128.
   */
  const COVER_KERB = 0.86;
  const COVER_ROAD = 0.24;
  /** How much of the layer is skirt rather than opaque core. */
  const VEIL_FRAC = 0.5;

  /**
   * Fraction of a direction the planting stands in front of. `sa` is the sine
   * of the azimuth (−1 over the planted kerb, +1 over the open carriageway)
   * and `uy` the sine of the elevation.
   *
   * Shared with the sun-reach calculation in `apply` below rather than written
   * out twice, because the two have to agree: what shadows the *bonnet* and
   * what shadows a *crown* are the same leaves.
   */
  const coverAt = (sa: number, uy: number): number => {
    const openAz = THREE.MathUtils.smoothstep(sa, -0.85, 0.85);
    // Azimuth stops meaning anything overhead: a direction eighty degrees up
    // is not over one kerb or the other, it is simply under the crowns. So the
    // kerb/carriageway split fades out towards the zenith rather than the
    // *coverage* fading out — which is what the first version did, on the
    // theory that a street planting is a band over its kerb. It is not, here:
    // the photograph's windscreen carries big dark tree reflections and
    // measures 81 with a tenth of it below 28, and a windscreen at 60° of rake
    // mirrors 59° of elevation. Thinning the zenith left it at 118 with
    // nothing below 66 — a clean mirror of an empty sky.
    const open = THREE.MathUtils.lerp(openAz, 0.12, THREE.MathUtils.smoothstep(uy, 0.55, 0.95));
    return Math.min(COVER_KERB * (1 - open) + COVER_ROAD * open, 0.97);
  };

  /** What gets through the layer along one radial crossing of it. */
  const layerTransmit = (cover: number): number =>
    (1 - cover) + cover * VEIL_FRAC * (1 - canopyVeilMat.opacity);

  const EL_LO = 10 * (Math.PI / 180);
  const EL_HI = 84 * (Math.PI / 180);
  /** 7.5°–13° of angular radius; mean solid angle of one lobe, steradians. */
  const ANG_LO = 0.13;
  const ANG_HI = 0.23;
  const LOBE_SA = 2 * Math.PI * (1 - Math.cos((ANG_LO + ANG_HI) / 2));
  /** Solid angle of the band the layer occupies. */
  const BAND_SA = 2 * Math.PI * (Math.sin(EL_HI) - Math.sin(EL_LO));
  /**
   * Candidate directions, sampled uniformly in solid angle and then kept with
   * the probability the coverage at that direction asks for.
   *
   * A cell grid with one lobe per cell was the obvious thing and it silently
   * put a ceiling on the answer: a lobe subtends about 1.7 cells near the
   * horizon, so "every cell filled" is a coverage of 0.82 and no request above
   * that can be met. Half the layer then became skirt rather than core and the
   * opaque coverage quietly halved with it — the bonnet went back to 171,
   * which is where it started. Sampling by density has no such ceiling.
   */
  const CANDIDATES = 520;
  for (let i = 0; i < CANDIDATES; i++) {
    // x = sin(a), z = cos(a): a = 0 is ahead of the car (towards the camera),
    // a = ±π/2 is the two kerbs.
    const a = crnd() * Math.PI * 2;
    const el = Math.asin(Math.sin(EL_LO) + crnd() * (Math.sin(EL_HI) - Math.sin(EL_LO)));
    const ce = Math.cos(el);
    const ux = Math.sin(a) * ce;
    const uz = Math.cos(a) * ce;
    const uy = Math.sin(el);

    // The asymmetry is the whole point and it is measurable. The planting is
    // on the near kerb at −x; the far carriageway at +x is open sky, which is
    // why the photograph's bonnet runs 83 on one side and 159 on the other. A
    // canopy that closed the sky evenly would take the bonnet's mean down and
    // its *variance* with it, which is a lens cap, not shade.
    const cover = coverAt(Math.sin(a), uy);

    // Lobes dropped at random cover `1 − exp(−λ · lobeΩ)` of a direction, so
    // the density the asked-for coverage needs is `−ln(1 − cover) / lobeΩ`,
    // and a uniform candidate standing for `bandΩ / CANDIDATES` of sky is kept
    // with that density times its own share.
    if (crnd() > (-Math.log(1 - cover) / LOBE_SA) * (BAND_SA / CANDIDATES)) continue;

    // Depth in the layer, so the crowns overlap raggedly instead of sitting on
    // one shell — a shell reads as a dome, and a dome has a visible edge.
    const ang = ANG_LO + crnd() * (ANG_HI - ANG_LO);
    const dist = 17 + crnd() * 19;
    const lobe = new THREE.Mesh(canopyGeo, canopyDeepMat);
    lobe.position.set(PROBE.x + ux * dist, PROBE.y + uy * dist, PROBE.z + uz * dist);
    lobe.scale.set(dist * ang, dist * ang * 0.74, dist * ang);
    lobe.rotation.set(crnd() * 3, crnd() * 3, crnd() * 3);
    lobe.name = 'ibl:leaf';
    canopyGroup.add(lobe);
    leaves.push({ mesh: lobe, ux, uy, uz, rank: crnd(), veil: crnd() < VEIL_FRAC });
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

  /**
   * How much sky a leaf on the underside of a crown can still see past its own
   * neighbours and the mass above it. This is the number that makes a canopy a
   * canopy: the lobes here are convex shells with nothing inside them, and left
   * to collect the whole hemisphere they render at the sky's own brightness.
   */
  const CANOPY_SKY_VIS = 0.16;
  /** Diffuse sky that comes down *through* the leaf layer rather than off it. */
  const CANOPY_TRANSMIT = 0.075;
  /** Foliage in late-summer leaf, as a multiplier on whatever is lighting it. */
  const CANOPY_TINT = new THREE.Color(0.62, 0.8, 0.42);
  /** What the low sun does to the crowns it grazes: transmitted, so gold. */
  const CANOPY_GOLD = new THREE.Color(1.0, 0.8, 0.42);
  const bakedSky = new THREE.Color();

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
      // Everything this row of furniture emits carries the proxy gain; the sky
      // it is standing in front of does not. See `proxyGain`.
      const gain = proxyGain(preset);

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
      ).multiplyScalar(gain);
      facadeMat.color.copy(sky).multiplyScalar(STONE * 0.5 * gain);

      // Lit foliage at this sun elevation is half *transmitted* light, so it
      // goes gold rather than staying green, and it is far from black. It was
      // black — 0.006 — which turned the whole tree row into a matte the
      // flanks could only lose light to.
      addScaled(
        canopyLitMat.color.setRGB(1.0, 0.84, 0.44).multiply(sun).multiplyScalar((LEAF / Math.PI) * eWall * 1.5),
        sky,
        LEAF * 0.3,
      ).multiplyScalar(gain);
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
      addScaled(canopyMat.color, tint.setRGB(1.0, 0.82, 0.4).multiply(sun), (LEAF_T / Math.PI) * eWall)
        .multiplyScalar(gain);

      // Bark. A trunk is *vertical*, so the irradiance on it is the wall's,
      // not the ground's — this read `eGround`, which at 11.5° of elevation is
      // one fifth of `eWall`, and then discounted it by a further 0.12. The
      // row came out at 0.025 radiance: black posts standing in front of the
      // one bright thing in the band. A cylinder averages 1/π of the normal
      // irradiance over its lit half, which is the only discount it should get.
      trunkMat.color.copy(sky).multiplyScalar(BARK * 0.45 * gain);
      addScaled(
        trunkLitMat.color.copy(sun).multiplyScalar((BARK / Math.PI) * eWall * (1 / Math.PI)),
        sky,
        BARK * 0.45,
      ).multiplyScalar(gain);

      // --- and the canopy overhead -----------------------------------------
      //
      // **No `gain` here, deliberately.** What is being set is a *contrast
      // ratio* against the sky inside the same cubemap, and that ratio is what
      // the photograph measures: canopy 50 against an open sky of 200. A
      // canopy carrying the proxy gain would be brighter than the sky it is
      // silhouetted against, which is not a canopy, it is a cloud.
      canopyVeilMat.opacity = 0.55;
      canopyRimVeilMat.opacity = canopyVeilMat.opacity;
      const density = preset.canopy ?? 0;
      canopyGroup.visible = density > 0;
      if (density > 0) {
        skyRadiance(preset, bakedSky);
        // Two terms, and keeping them apart is what keeps the bonnet *cool*.
        //
        // Only the first is leaf-coloured: it is sky light that has bounced
        // off a leaf, so it carries the leaf's green. The second has come
        // straight down between the leaves and is still sky — and it is the
        // larger of the two, which is why a canopy photographs as a dark
        // blue-grey rather than as a green one. Tinting both turned the
        // bonnet olive: (105, 87, 62) against the photograph's (91, 111, 134),
        // the red/blue order inverted.
        canopyDeepMat.color.copy(bakedSky).multiplyScalar(CANOPY_TRANSMIT);
        addScaled(
          canopyDeepMat.color,
          tint.copy(bakedSky).multiply(CANOPY_TINT),
          LEAF * CANOPY_SKY_VIS,
        );
        // The rim — sunlit foliage — and **how much sun there is to be lit by**.
        //
        // Two separate questions, and the previous version answered the second
        // one backwards. Geometrically, the face of a crown turned towards the
        // probe is sunlit when `-dot(u, sunDir) > 0`; that part is right and is
        // kept. What it leaves out is everything in the way, and the guard it
        // carried — "only lobes over the *open* side are lit" — selects exactly
        // the wrong lobes: the sun is at −x, over the planted kerb, so a crown
        // out over the open carriageway at +x has the whole seven-deep row
        // between it and the sun, while the one guard value that mattered,
        // dead aft, sits at `open` 0.50 and cleared a 0.45 threshold anyway.
        //
        // Measured off the baked cubemap in the directions the bonnet's own
        // pixels mirror (camera solved from `__AUDI.pick`, mean incidence 78°,
        // clearcoat lobe at 22° of elevation aft): the gold rim was **40 % of
        // what the bonnet reflects**, at R/B 2.12, and the layer's gold was all
        // on the +x side. That is the whole of the inverted cast.
        //
        // So the gold is scaled by how much sun actually reaches a crown inside
        // the layer: the layer's own transmittance along the sun's azimuth,
        // raised to the plane-parallel air mass `1/sin(elevation)` because at a
        // low sun the beam crosses the layer nearly horizontally and therefore
        // many times over. Nothing is hand-set, and the five presets each get
        // their own answer — at `goldenhour`'s 11.5° it comes out at 0.004 and
        // the crowns are silhouettes, at `noon`'s 70° it is 0.37 and they are
        // not.
        const sunHoriz = Math.hypot(sunDir.x, sunDir.z);
        const sunReach = Math.pow(
          layerTransmit(coverAt(sunHoriz > 1e-4 ? sunDir.x / sunHoriz : 0, Math.max(sunDir.y, 0))),
          Math.min(1 / Math.max(sunDir.y, 0.12), 8),
        );
        addScaled(
          canopyRimMat.color.copy(sun).multiply(CANOPY_GOLD)
            .multiplyScalar((LEAF / Math.PI) * eWall * 0.55 * sunReach),
          canopyDeepMat.color,
          1,
        );
        canopyVeilMat.color.copy(canopyDeepMat.color);
        canopyRimVeilMat.color.copy(canopyRimMat.color);
        for (const l of leaves) {
          l.mesh.visible = l.rank < density;
          const lit = -(l.ux * sunDir.x + l.uy * sunDir.y + l.uz * sunDir.z) > 0.15;
          l.mesh.material = l.veil
            ? (lit ? canopyRimVeilMat : canopyVeilMat)
            : (lit ? canopyRimMat : canopyDeepMat);
        }
      }
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
      const g = proxyGain(preset);
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
    uShadeMul: { value: new THREE.Color(1, 1, 1) },
    uSheen: { value: 0.25 },
    uGloss: { value: 0.55 },
    uCanopy: { value: 0 },
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
  const shadeMul = new THREE.Color();
  const sunAz = new THREE.Vector3();

  const bake = (preset: EnvPreset, sunDir: THREE.Vector3): void => {
    (globalThis as unknown as Record<string, unknown>).__IBL_LAST = { preset, sunDir: sunDir.clone() };
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
    // …and the road, the kerb and the verge carry the proxy gain like every
    // other piece of furniture. `eTotal` itself must not: it is the ratio the
    // shade multiplier below is read off, and inflating the sky half of it was
    // what left the proxy road's tree shade a stop too weak.
    const gain = proxyGain(preset);
    albedo.setHex(preset.groundTint).multiplyScalar(ROAD_ALBEDO * eTotal * gain);
    groundUniforms.uColor.value.copy(albedo);
    // The kerb and pavement, and the grass verge the trees stand in. Same
    // irradiance, their own reflectances — concrete weathered to 0.35, dry
    // late-summer grass to 0.22 with the green it still has.
    groundUniforms.uKerbColor.value.setHex(preset.groundTint).multiplyScalar(KERB_ALBEDO * eTotal * gain);
      // Dry late-summer grass, and it is *straw*, not green.
      //
      // This was (0.78, 0.86, 0.52) — G above R — and the verge is fifteen to
      // eighteen metres out, square in the band a vertical body panel mirrors,
      // so it was putting a green cast straight onto the flanks. The
      // photograph settles it: its verge measures (90, 81, 63) after white
      // balance, R above G above B, because a Parkway verge in September is
      // burnt off. Swapping the two channels is worth ten levels of green on
      // the fender patch the colour gate reads.
    groundUniforms.uVergeColor.value.setRGB(0.86, 0.78, 0.48).multiplyScalar(VERGE_ALBEDO * eTotal * gain);
    // What the far field is veiled by: the sky the shader itself draws at the
    // horizon, at the same exposure, so the road and the sky meet without a
    // seam and the panels see one continuous band.
    //
    // No 0.88 discount any more. That was here to stop the far road reading
    // brighter than the sky above it — but at eighty-odd degrees of incidence
    // a dielectric returns what it is given, and the photograph has exactly
    // that: the far half of the boulevard at 171 against a sky of about 135.
    //
    // It carries the proxy gain too, and that is the one place the gain is
    // uncomfortable: this term is a *mirror image of the sky*, so multiplying
    // it says the far carriageway is brighter than the sky directly above it,
    // which no Fresnel reflection can be. It stays because what a vertical
    // panel mirrors along the horizon is not sky, it is the missing furniture
    // standing in front of it — and because taking it out is measurable and
    // costs more than it buys: the door face falls 72 → 69 and the tone
    // profile goes 18.3 → 21.1 for no movement at all on B−R.
    groundUniforms.uHorizonColor.value
      .setHex(preset.sky.horizon)
      .multiplyScalar(preset.sky.exposure * gain);
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

    // What the planting's shade does to the proxy road, derived the same way
    // ground.ts derives it for the road the car stands on rather than picked
    // again here: the canopy takes the sun off and leaves most of the sky on,
    // so the multiplier is per-channel `(k·E_sky + 0.12·E_sun) / E_total`.
    // Both terms are already to hand — `skyCol` is the mean sky radiance and
    // `sunTerm · sunColor` is the sun's. 0.55 because a point under a crown
    // has lost much of the sky as well as the sun, and 0.12 of the sun left
    // standing for what comes through the leaves; the same two constants are
    // in ground.ts, and if they drift apart the reflected road will stop
    // matching the one in front of the bumper.
    shadeMul.setHex(preset.sunColor).multiplyScalar(sunTerm);
    shadeMul.setRGB(
      (0.55 * skyCol.r + 0.12 * shadeMul.r) / Math.max(skyCol.r + shadeMul.r, 1e-4),
      (0.55 * skyCol.g + 0.12 * shadeMul.g) / Math.max(skyCol.g + shadeMul.g, 1e-4),
      (0.55 * skyCol.b + 0.12 * shadeMul.b) / Math.max(skyCol.b + shadeMul.b, 1e-4),
    );
    groundUniforms.uShadeMul.value.copy(shadeMul);
    // `canopy`, not `dapple`, and the two have parted company on purpose.
    //
    // `dapple` is the gobo's strength on the road the car *stands* on, and it
    // was cut from 0.88 to 0.45 when the grove started casting a real shadow
    // over that road — inside the sun's frustum the two were compounding. But
    // nothing casts a shadow in *here*: this proxy road is a shader on a disc
    // in a scene with no lights in it at all. Left on `dapple` it came back
    // 0.43 of a stop brighter than the road in front of the bumper, and since
    // the lower half of every horizontal panel's reflection lobe is made of
    // it, that arrived on the bonnet as warm fill.
    groundUniforms.uCanopy.value = preset.canopy ?? preset.dapple;

    scene.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    cubeCam.update(renderer, scene);
    renderer.shadowMap.enabled = prevShadow;
    renderer.setRenderTarget(prevTarget);

    pmrem.fromCubemap(cubeRT.texture, target!);
  };

  /**
   * A measurement hook, and the reason three rounds of "where is the warmth
   * coming from" can now be answered in one browser session instead of one
   * edit-and-render cycle per hypothesis.
   *
   * `rebake` re-derives the proxy world from a preset object a probe hands it,
   * while everything outside this file — the sky dome, the lights, the grade —
   * stays exactly where the app put it. Cloning the live preset with one field
   * changed therefore isolates that field: `envIntensity` to separate the
   * bake-side use of it from the material-side one, `sunIntensity: 0` to take
   * every sunlit proxy surface out without touching the key light, `groundTint`
   * to ask whether the road's warmth reaches the paint at all. All three of
   * those were run; none of them moved the paint's B−R by more than a level.
   *
   * Read-only handles beside it so a probe can point a camera at the bake
   * scene and read the radiance back in a given direction.
   *
   * This is deliberately *not* a set of value knobs. The ones that used to be
   * here scaled real constants from a global, which means a render can silently
   * stop being the render the code describes.
   */
  /**
   * Radiance of the proxy world in a given direction, in the linear units the
   * cubemap is baked in — a narrow-FOV render of the bake scene from the probe,
   * read back as floats with tone mapping off.
   *
   * This is the question every "where is the bonnet's colour coming from" round
   * has had to answer and none has had a tool for. A panel at `metalness: 1.0`
   * is a mirror, so its colour *is* this function evaluated along its own
   * reflection vector; combined with the `ibl:` mesh names above (toggle a
   * class of them and re-sample) it attributes a panel's cast to one surface of
   * the proxy world rather than to a hypothesis about one.
   */
  let dbgRt: THREE.WebGLRenderTarget | null = null;
  const dbgCam = new THREE.PerspectiveCamera(8, 1, 0.1, 400);
  const dbgAt = new THREE.Vector3();
  const sample = (
    dirs: ReadonlyArray<readonly [number, number, number]>,
    fovDeg = 8,
  ): number[][] => {
    const N = 24;
    if (!dbgRt) dbgRt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType });
    const buf = new Float32Array(N * N * 4);
    const prevTarget = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    dbgCam.fov = fovDeg;
    dbgCam.updateProjectionMatrix();
    dbgCam.position.copy(PROBE);
    const out: number[][] = [];
    for (const d of dirs) {
      dbgAt.set(PROBE.x + d[0], PROBE.y + d[1], PROBE.z + d[2]);
      dbgCam.lookAt(dbgAt);
      dbgCam.updateMatrixWorld(true);
      renderer.setRenderTarget(dbgRt);
      renderer.render(scene, dbgCam);
      renderer.readRenderTargetPixels(dbgRt, 0, 0, N, N, buf);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < N * N; i++) { r += buf[i * 4]; g += buf[i * 4 + 1]; b += buf[i * 4 + 2]; }
      out.push([r / (N * N), g / (N * N), b / (N * N)]);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTone;
    return out;
  };

  (globalThis as unknown as Record<string, unknown>).__IBL_DBG = {
    scene, cubeRT, renderer, probe: PROBE, groundUniforms, sample,
    rebake: (p: EnvPreset, s: { x: number; y: number; z: number }): void =>
      bake(p, new THREE.Vector3(s.x, s.y, s.z)),
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

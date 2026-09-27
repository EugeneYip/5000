/**
 * Distant surroundings, in the scene rather than only in the reflection.
 *
 * The IBL proxy world puts trees and facades into the car's *reflections*,
 * but a wide shot also has to have something on the horizon or the boulevard
 * reads as a salt flat. This is that something: two receding rows of plane
 * trees at boulevard spacing, a deeper row behind them, and a broken skyline.
 *
 * Kept to four draw calls with `InstancedMesh`. The planting *does* cast now:
 * at 11.5° of solar elevation the trees that shade the car stand fifty to
 * seventy metres up-sun of it, so the sun's frustum reaches out that far and
 * the crowns write a leaf-cut depth so what lands on the road is dapple.
 */

import * as THREE from 'three';
import type { EnvPreset } from './presets';

export interface BackdropHandle {
  group: THREE.Group;
  apply(preset: EnvPreset, sunDir: THREE.Vector3): void;
  dispose(): void;
}

/** Deterministic, so the boulevard is the same every run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three texture-free octaves of value noise, shared by the colour and depth cuts. */
const LEAF_NOISE = /* glsl */ `
float leafHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float leafNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(leafHash(i + vec3(0, 0, 0)), leafHash(i + vec3(1, 0, 0)), f.x),
                 mix(leafHash(i + vec3(0, 1, 0)), leafHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(leafHash(i + vec3(0, 0, 1)), leafHash(i + vec3(1, 0, 1)), f.x),
                 mix(leafHash(i + vec3(0, 1, 1)), leafHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/**
 * The cut. Two things are substituted per pass.
 *
 * `LEAF_EDGE` because the silhouette of a lobe is whatever is looking at it —
 * the camera in the colour pass, the sun in the shadow pass — and those are
 * not the same rim.
 *
 * `LEAF_BASE` because **the shadow pass has to stand in for a penumbra it
 * cannot draw.** The occluders that shade the car are fifty to seventy metres
 * up-sun; the sun's disc subtends 0.53°, so its penumbra at that range is
 * half a metre — wider than most of the gaps this noise cuts. The true result
 * is therefore a *partially transmitting* shade, and a binary depth map with a
 * two-texel PCF kernel (3.7 mm per texel over this frustum) cannot express
 * one: it gives full shadow wherever the core is solid.
 *
 * Cutting harder in the depth pass is how that partial transmission is paid
 * for. At the visible threshold the layer was opaque and a third of the car's
 * pixels fell below level 40, against the photograph's 11.5 % — for a car the
 * photograph plainly shows standing in the same shade.
 */
const LEAF_CUT = /* glsl */ `
{
  float v = 0.62 * leafNoise(vLeafPos * 3.2 * LEAF_FREQ)
          + 0.26 * leafNoise(vLeafPos * 7.6 * LEAF_FREQ + 11.0)
          + 0.12 * leafNoise(vLeafPos * 18.0 * LEAF_FREQ + 31.0);
  // Thin towards the rim of the lobe: a leaf mass has no hard edge, and a
  // uniform cut just gives a solid ball with freckles.
  float edge = smoothstep(0.34, 0.98, LEAF_EDGE);
  if (v < LEAF_BASE + LEAF_RIM * edge) discard;
}
`;

export function createBackdrop(): BackdropHandle {
  const group = new THREE.Group();
  group.name = 'env:backdrop';

  const rnd = mulberry(0x5000a4d1);

  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.62, 1.0, 1, 7, 1, true);
  const branchGeo = new THREE.CylinderGeometry(0.1, 0.34, 1, 5, 1, true);
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);

  /**
   * `instanceColor` is a trap. The vertex chunk multiplies it into `vColor`
   * under `USE_INSTANCING_COLOR`, but the *fragment* chunk only declares and
   * consumes `vColor` under `USE_COLOR` — which three defines from
   * `material.vertexColors` and from nothing else. So an InstancedMesh with an
   * instanceColor and a material without `vertexColors` compiles, runs, and
   * silently throws every per-instance tint away: the planting rendered at its
   * white base colour and did not move by one level when the tints were
   * changed by a factor of five. And `vertexColors` in turn requires a real
   * `color` attribute, because a disabled vertex attribute reads back as
   * (0, 0, 0) and the whole row would go black instead.
   */
  const unitColor = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return geo;
  };
  unitColor(crownGeo);
  unitColor(trunkGeo);
  unitColor(branchGeo);

  // Base colours are white; every instance carries its own tint, so one draw
  // covers sunlit and shaded foliage, pale and weathered bark.
  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true,
  });

  /**
   * The thing that actually separates foliage from a blob.
   *
   * No arrangement of solid lobes reads as a canopy, because a canopy's
   * defining property is that you can see *through* it: the sky comes through
   * in a thousand small holes, the silhouette is ragged at every scale, and
   * the mass thins towards its edge. Solid convex lobes have a smooth
   * silhouette at every scale and no holes at all, which is why the crowns
   * read as a bunch of grapes however many of them there were.
   *
   * So the lobes are cut with a three-octave hash noise evaluated in the
   * *tree's* frame — so neighbouring lobes cut differently and the seams
   * between them disappear — with the cut deepening towards each lobe's own
   * rim, which is what thins the mass at the edge. Three texture-free octaves
   * and a discard, on geometry that is a few hundred pixels at most.
   */
  crownMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeafPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vLeafPos = (instanceMatrix * vec4(position, 1.0)).xyz;
#else
vLeafPos = position;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLeafPos;\n${LEAF_NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${LEAF_CUT}`)
      // The lobe's own silhouette: the interpolated view normal's lateral
      // component, which is one at the rim and zero facing the camera.
      .replace('LEAF_EDGE', 'length(vNormal.xy) / max(length(vNormal), 1e-3)')
      .replace(/LEAF_FREQ/g, '1.0')
      .replace('LEAF_BASE', '0.40')
      .replace('LEAF_RIM', '0.26');
  };
  crownMat.customProgramCacheKey = () => 'audi-canopy-v3';

  /**
   * The cut again for the shadow pass, at a different frequency and depth —
   * and without it the canopy casts solid ellipsoids.
   *
   * `MeshDepthMaterial` knows nothing about a discard in the colour material,
   * so a crown that reads as open foliage from the camera writes a filled blob
   * into the shadow map. That is the difference between dapple and a
   * tarpaulin, and dapple is the whole reason these cast at all.
   *
   * Three things differ from the colour version and all three are deliberate:
   * the silhouette term is evaluated in the *light's* view rather than the
   * camera's, which is what a shadow's own outline is; there is no `vNormal`
   * in the depth shader, so it is carried across as its own varying; and the
   * cut itself is finer and deeper, for the reason set out where it is
   * substituted below.
   */
  const crownDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  crownDepthMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLeafPos;\nvarying vec3 vLeafN;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vLeafPos = (instanceMatrix * vec4(position, 1.0)).xyz;
vLeafN = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
#else
vLeafPos = position;
vLeafN = normalize(normalMatrix * normal);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLeafPos;\nvarying vec3 vLeafN;\n${LEAF_NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${LEAF_CUT}`)
      .replace('LEAF_EDGE', 'length(vLeafN.xy) / max(length(vLeafN), 1e-3)')
      // Finer, deeper, and with the rim term damped — and every one of those
      // three is paying for a penumbra this renderer cannot draw.
      //
      // The crowns that shade the car stand fifty to seventy metres up-sun.
      // The sun's disc subtends 0.53°, so its penumbra at that range is half a
      // metre: what actually reaches the car is not shadow-or-sun but a
      // *partially transmitting* shade, the gaps averaged away. A depth map is
      // binary and `PCFSoftShadowMap` blurs over a fixed ±2 texels, so it
      // cannot express that — at the colour pass's own threshold the layer is
      // opaque and a third of the car's pixels fell below level 40 against the
      // photograph's 11.5 %, for a car the photograph plainly shows standing
      // in that same shade.
      //
      // So the transmission is bought by cutting harder (0.625) and the grain
      // it arrives in is set by the frequency. Both ends of that were tried.
      // At the visible frequency what gets discarded is whole thin lobes and
      // the shade lands as metre-wide camouflage; at 3.5x it is centimetre
      // flecks at full shadow contrast, which reads as dirt. 2.4x puts the
      // features at about 15 cm, which the 31 mm shadow kernel (see the
      // frustum floor in Environment.ts) softens into shade.
      .replace(/LEAF_FREQ/g, '2.4')
      .replace('LEAF_BASE', '0.625')
      .replace('LEAF_RIM', '0.15');
  };
  crownDepthMat.customProgramCacheKey = () => 'audi-canopy-depth-vB';

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: true,
  });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x8d8377, roughness: 0.88, metalness: 0 });

  /**
   * Two receding rows at Parkway spacing.
   *
   * The proportions were the whole problem. A crown radius of 3.4–5.4 m on a
   * 5.4–10.6 m tree is a ball as wide as the tree is tall, sitting on a stick:
   * a lollipop, and no amount of lobe count rescues it. A London plane on the
   * Parkway is 14–22 m tall with a crown 7–13 m *wide* — radius a quarter to a
   * third of its height — and it carries that crown on a clean bole for the
   * first half of its height, which is why the photograph can see straight
   * down the boulevard underneath the planting. Those three numbers, not the
   * blob count, are what separates a street tree from a lollipop.
   *
   * The row also stood at 31 m, twice as far out as the tree row in the IBL's
   * proxy world at 16 m — so the trees the paint reflected were not the trees
   * in the frame. It is at 17 m now, just past the grass verge the ground
   * shader puts at 16 m, which is where the planting actually is.
   */
  interface Tree {
    x: number; z: number;
    /** Overall height, metres. */
    h: number;
    /** Height at which the bole stops and the crown begins. */
    bole: number;
    /** Crown half-width. */
    r: number;
    lean: number;
    /** Bark tone, 0 = weathered dark, 1 = freshly shed and near-white. */
    bark: number;
  }
  const trees: Tree[] = [];
  const plant = (
    side: number, z: number, xBase: number, xJit: number, hLo: number, hHi: number,
  ): void => {
    // A gap every so often: a felled tree, a driveway, a bus stop.
    if (rnd() < 0.14) return;
    const h = hLo + rnd() * (hHi - hLo);
    trees.push({
      x: side * (xBase + rnd() * xJit),
      z,
      h,
      bole: h * (0.38 + rnd() * 0.13),
      r: h * (0.27 + rnd() * 0.11),
      lean: (rnd() - 0.5) * 0.14,
      bark: rnd(),
    });
  };
  for (let side = -1; side <= 1; side += 2) {
    let z = -210 + (side > 0 ? 8 : 0);
    while (z < 210) {
      // The 40 m around the car is left clear: a tree closer than that fills a
      // quarter of the sky behind the roof in the photomatch pose.
      if (z < -40 || z > 46) plant(side, z, 20, 5.5, 10.5, 16.5);
      z += 11 + rnd() * 10;
    }
  }
  // A second, deeper row offset from the first, so the line reads as a planting
  // with depth rather than as a single row of cut-outs.
  for (let side = -1; side <= 1; side += 2) {
    let z = -200 + (side > 0 ? 17 : 0);
    while (z < 200) {
      if (z < -56 || z > 60) plant(side, z, 32, 12, 9.5, 15.5);
      z += 24 + rnd() * 22;
    }
  }

  /**
   * The grove on the park side — and it is the thing that actually puts the
   * car in shade, so it is not scenery.
   *
   * At 11.5° of solar elevation a twelve-metre plane throws a fifty-seven
   * metre shadow, so whatever is shading the car stands 50–70 m up-sun of it:
   * with the sun at azimuth (−0.818, 0.575) that is around x −45, z +33. Two
   * rows at x ±20 cannot reach there however tall they are, which is why the
   * car has been standing in open sun with a tree row beside it — the row was
   * never in a position to shadow anything in frame.
   *
   * The photograph settles what is actually there: the whole left of that
   * frame is lawn with plane trees several deep, not a single kerbside row,
   * and the pavement under them is in broken shade with sun flecks punched
   * through. So: a grove from the far kerb out to seventy metres, Poisson-ish
   * rather than ranked, and taller than the street row because park trees are
   * not pollarded back off a carriageway.
   *
   * It is on the −x side only. Shade that is symmetrical is overcast, and the
   * photograph is explicit that the carriageway on the far side is in sun.
   */
  for (let row = 0; row < 5; row++) {
    const xBase = 26 + row * 10;
    let z = -150 + rnd() * 20;
    while (z < 170) {
      plant(-1, z, xBase, 9, 12.5, 19.0);
      z += 13 + rnd() * 13;
    }
  }

  const LOBES = 20;
  const BRANCHES = 4;
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length * LOBES);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const branches = new THREE.InstancedMesh(branchGeo, trunkMat, trees.length * BRANCHES);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  /**
   * Per-instance shading inputs, kept so `apply` can re-tint the planting when
   * the sun moves without rebuilding any geometry: the horizontal direction of
   * each lobe from its own trunk (which decides whether the sun is on it), and
   * a per-instance brightness jitter.
   */
  const lobeDir = new Float32Array(trees.length * LOBES * 2);
  const lobeJit = new Float32Array(trees.length * LOBES);
  const barkTone = new Float32Array(trees.length);

  const leanAxis = new THREE.Vector3(0, 0, 1);
  const spin = new THREE.Vector3(0, 1, 0);
  const branchAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  trees.forEach((t, i) => {
    barkTone[i] = t.bark;
    // Trunk radii are authored at 1 m and scaled by the tree's own girth, so a
    // 22 m plane is not the same stick as a 13 m one.
    const girth = 0.024 + 0.010 * t.bark;
    pos.set(t.x, t.bole * 0.5, t.z);
    scl.set(girth * t.h, t.bole, girth * t.h);
    // A plane tree does not grow plumb. Fourteen milliradians of lean, signed
    // per tree, is all it takes to break the row of parallel verticals that
    // reads as a row of posts.
    q.setFromAxisAngle(leanAxis, t.lean);
    trunks.setMatrixAt(i, m.compose(pos, q, scl));

    const tiltAt = (y: number): number => Math.tan(t.lean) * y;

    // Limbs. A plane forks two or three times low in the crown and the limbs
    // carry on through it — the bare Y at the top of a bare stick is most of
    // what made these read as posts with balls on.
    for (let b = 0; b < BRANCHES; b++) {
      const a = (b / BRANCHES) * Math.PI * 2 + rnd() * 1.3;
      const y0 = t.bole * (0.82 + rnd() * 0.16);
      const len = t.r * (0.5 + rnd() * 0.5);
      const rise = 0.55 + rnd() * 0.5;
      branchAxis.set(Math.cos(a), rise, Math.sin(a)).normalize();
      pos.set(
        t.x - tiltAt(y0) + branchAxis.x * len * 0.5,
        y0 + branchAxis.y * len * 0.5,
        t.z + branchAxis.z * len * 0.5,
      );
      q.setFromUnitVectors(yAxis, branchAxis);
      scl.set(girth * t.h * 0.85, len, girth * t.h * 0.85);
      branches.setMatrixAt(i * BRANCHES + b, m.compose(pos, q, scl));
    }

    // The crown: lobes on an irregular, flattened shell with the middle left
    // comparatively empty, so sky shows through it. A plane's canopy is open —
    // you read the sky between the leaf masses, and that is the difference
    // between foliage and a solid ball.
    const crownH = t.h - t.bole;
    for (let b = 0; b < LOBES; b++) {
      const a = (b / LOBES) * Math.PI * 2 + rnd() * 1.4;
      // Radially biased outward: sqrt() would spread them evenly over the
      // disc, and an even spread fills the centre in.
      const rad = t.r * (0.38 + 0.62 * rnd());
      const fy = 0.18 + 0.82 * rnd();
      const cy = t.bole + crownH * fy;
      const dx = Math.cos(a) * rad * (1.0 - 0.45 * fy);
      const dz = Math.sin(a) * rad * (1.0 - 0.45 * fy);
      pos.set(t.x - tiltAt(cy) + dx, cy, t.z + dz);
      q.setFromAxisAngle(spin, rnd() * 3);
      const rr = t.r * (0.30 + 0.26 * rnd());
      scl.set(rr, rr * 0.74, rr * 0.94);
      crowns.setMatrixAt(i * LOBES + b, m.compose(pos, q, scl));
      const k = i * LOBES + b;
      const inv = 1 / Math.max(Math.hypot(dx, dz), 1e-3);
      lobeDir[k * 2] = dx * inv;
      lobeDir[k * 2 + 1] = dz * inv;
      lobeJit[k] = 0.78 + rnd() * 0.44;
    }
  });
  crowns.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;

  crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * LOBES * 3), 3);
  trunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3);
  branches.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * BRANCHES * 3), 3);

  // A skyline, not six slabs. These sit well past the point where the
  // exponential fog has taken them — they exist to give the horizon an edge,
  // not to be looked at. Each was a single box hundreds of metres
  // long, and fully veiled by fog each came back as one flat evenly lit
  // rectangle standing against the sky: a card, not a city. Broken into masses
  // of varied height and setback they keep a broken roofline, which is the
  // only thing that still reads once the haze has taken everything else.
  const blocks: Array<[number, number, number, number, number, number]> = [];
  const runs: Array<[number, number, number, number, number, number]> = [
    // x, z, along-z span, count, base height, spread
    [-360, -180, 200, 6, 16, 22],
    [400, -60, 220, 6, 18, 26],
    [-100, 580, 240, 7, 15, 18],
    [480, 260, 100, 4, 24, 30],
    [-530, 200, 110, 4, 19, 24],
    [160, -620, 260, 7, 13, 16],
  ];
  for (const [x, z, span, count, base, spread] of runs) {
    const alongZ = span > 150;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const h = base + rnd() * spread;
      const w = 34 + rnd() * 30;
      const d = 40 + rnd() * 40;
      blocks.push(
        alongZ
          ? [x + (rnd() - 0.5) * 60, h / 2, z + t * span, w, h, d]
          : [x + t * span, h / 2, z + (rnd() - 0.5) * 60, d, h, w],
      );
    }
  }
  const blockMesh = new THREE.InstancedMesh(blockGeo, blockMat, blocks.length);
  blocks.forEach(([x, y, z, sx, sy, sz], i) => {
    blockMesh.setMatrixAt(i, m.compose(pos.set(x, y, z), q.identity(), scl.set(sx, sy, sz)));
  });
  blockMesh.instanceMatrix.needsUpdate = true;

  // The planting casts now, and the sun's frustum has been opened up-sun to
  // hold it — see `SHADOW_REACH` in Environment.ts. Three extra shadow-pass
  // draws, and they are what put the car in the trees' shade instead of
  // painting a gobo on the road and hoping.
  //
  // They do not *receive*: these are convex proxies with no interior, so a
  // self-shadow term on them is a lie that costs a second depth fetch. The
  // per-instance sunward/shaded tint below is standing in for it.
  crowns.castShadow = true;
  crowns.customDepthMaterial = crownDepthMat;
  trunks.castShadow = true;
  branches.castShadow = true;
  blockMesh.castShadow = false;
  for (const mesh of [crowns, trunks, branches, blockMesh]) {
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const lit = new THREE.Color();
  const shade = new THREE.Color();
  const mixed = new THREE.Color();

  return {
    group,
    apply(preset, sunDir) {
      group.visible = preset.ground !== 'studio';

      // These proxies have no self-shadowing, so a smooth 0.04 dielectric
      // Fresnel over the whole mass was returning the sky at full strength —
      // measured, a trunk with a 0.007 albedo was rendering at level 122,
      // brighter than the lit foliage beside it, because almost none of what
      // it returned was its own colour. A real canopy occludes most of the sky
      // from its own interior; this stands in for that.
      crownMat.envMapIntensity = 0.22;
      trunkMat.envMapIntensity = 0.18;
      blockMat.envMapIntensity = 0.45;

      // Distant foliage in low sun goes almost black against the sky; at noon
      // it is merely dark. Tying it to elevation keeps the silhouette honest.
      //
      // The absolute level is a *self-occlusion* term, not a look knob, and
      // that is why it had to come down so far. These proxies are convex
      // lobes with nothing inside them: every one of them collects the entire
      // sky hemisphere, where a patch of real canopy sees maybe a quarter of
      // it past its own neighbours and the mass behind it. Left at face value
      // the planting rendered at level 172 against a sky of 205 — no
      // separation at all, where the photograph has its canopy at 78 against
      // an open sky, a full two stops down. Bark is worse: a trunk is a
      // vertical cylinder in a street, and most of what it can see is other
      // trunks and the ground.
      const up = Math.max(sunDir.y, 0);
      // Roughly 0.55x what these were, and it is measured rather than felt.
      //
      // The self-occlusion argument that set them is right and this is the
      // same argument carried further: these lobes are convex shells that
      // collect the whole sky, and the grove is now five rows deep, so a crown
      // inside it sees a *great deal* less of that sky than one in a single
      // kerbside row did. Against the photograph: its canopy measures 50 and
      // its trunks 55 under an open sky that clips at 232 — a ratio of about
      // 0.22 — where this render had canopy 96 and trunks 115-134 against a
      // sky of 181, i.e. 0.53. The boulevard read as a colonnade in fog
      // because its planting was half a stop from the sky behind it.
      const lift = 0.042 + up * 0.08;
      const barkLift = 0.032 + up * 0.062;
      crownMat.color.setRGB(1, 1, 1);
      trunkMat.color.setRGB(1, 1, 1);
      blockMat.color.setHex(0x6e6a64).multiplyScalar(0.11 + up * 0.28);

      // Which side of its own trunk a lobe sits on decides whether the sun is
      // on it. At 11° of elevation the sunward half of a plane's crown is
      // three-quarters *transmitted* light and goes gold; the far half keeps
      // the sky's colour through its own green. The photograph measures those
      // two at (92, 77, 45) and (61, 55, 45) — a two-to-one warm bias and a
      // full stop apart, where the old single flat green gave neither.
      const az = Math.hypot(sunDir.x, sunDir.z) || 1;
      const sx = sunDir.x / az;
      const sz = sunDir.z / az;

      const paint = (
        mesh: THREE.InstancedMesh, i: number, k: number, litHex: number, shadeHex: number,
        jit: number, gain: number,
      ): void => {
        lit.setHex(litHex);
        shade.setHex(shadeHex);
        mixed.copy(shade).lerp(lit, k).multiplyScalar(jit * gain);
        mesh.instanceColor!.setXYZ(i, mixed.r, mixed.g, mixed.b);
      };

      for (let i = 0; i < trees.length * LOBES; i++) {
        const d = lobeDir[i * 2] * sx + lobeDir[i * 2 + 1] * sz;
        // A wide ramp, not a step: a crown is a volume, and the transition
        // from its lit face to its shaded one takes most of its width.
        const k = THREE.MathUtils.smoothstep(d, -0.15, 0.78);
        paint(crowns, i, k, 0xa89a4a, 0x38492c, lobeJit[i], lift);
      }
      // Plane bark is the one tree in a city you can identify from a hundred
      // metres by its trunk: it sheds in plates and reads as pale mottled
      // cream over olive-grey, not as the near-black post it was.
      for (let i = 0; i < trees.length; i++) {
        const t = barkTone[i];
        trunkMat.color.setRGB(1, 1, 1);
        paint(trunks, i, t, 0xc6bda8, 0x443f34, 1, barkLift);
        for (let b = 0; b < BRANCHES; b++) {
          paint(branches, i * BRANCHES + b, t * 0.8, 0xb4ab96, 0x3c382e, 1, barkLift);
        }
      }
      crowns.instanceColor!.needsUpdate = true;
      trunks.instanceColor!.needsUpdate = true;
      branches.instanceColor!.needsUpdate = true;
    },
    dispose() {
      crownGeo.dispose();
      trunkGeo.dispose();
      branchGeo.dispose();
      blockGeo.dispose();
      crownMat.dispose();
      crownDepthMat.dispose();
      trunkMat.dispose();
      blockMat.dispose();
    },
  };
}

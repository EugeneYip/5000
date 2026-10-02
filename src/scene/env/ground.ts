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
  /**
   * Where the sun's own cast shadow is authoritative, so the painted gobo can
   * hand over to it instead of compounding with it: the subject's position,
   * the sun's bearing, and the half-extents of the shading rank's shadow in
   * the sun's own frame — `across` its bearing and `along` it, in metres.
   *
   * These are the **shadow's** extents, not the shadow frustum's. The frustum
   * has to stay wide for penumbra reasons that have nothing to do with where
   * the trees are (see the floor in `Environment.ts`), so passing it here
   * silences the gobo over ground that has no cast shadow on it at all.
   * `across <= 0` means there is no cast shadow to defer to.
   */
  setCastFootprint(
    centre: THREE.Vector3, sunDir: THREE.Vector3, across: number, along: number,
  ): void;
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
  uCastCentre: THREE.IUniform<THREE.Vector2>;
  /** x: half-extent across the sun, y: along it. Zero = no cast shadow. */
  uCastHalf: THREE.IUniform<THREE.Vector2>;
  uShadeTint: THREE.IUniform<THREE.Color>;
  uKerbColor: THREE.IUniform<THREE.Color>;
  uVergeColor: THREE.IUniform<THREE.Color>;
  /** Amplitude of the fragment-space grit. 0 restores the pre-grit surface. */
  uGritAmp: THREE.IUniform<number>;
  /** Band-limit margin on that grit, in footprints per noise cell. */
  uGritBand: THREE.IUniform<number>;
  /** Domain warp on the tiled maps, in uv units (one unit = one tile). */
  uWarpAmp: THREE.IUniform<number>;
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
    uCastCentre: { value: new THREE.Vector2(0, 0) },
    uCastHalf: { value: new THREE.Vector2(0, 0) },
    uShadeTint: { value: new THREE.Color(0.42, 0.46, 0.58) },
    uKerbColor: { value: new THREE.Color(0.08, 0.08, 0.08) },
    uVergeColor: { value: new THREE.Color(0.05, 0.06, 0.03) },
    // 0.6 against the photographs, not by eye.
    //
    // The target is relative texture — mean |laplacian| over the box mean,
    // because the render's road is in the planting's shade at a mean of 40-61
    // and both references are in sun at 92-178, and comparing the absolute
    // figures (which is what CRITIQUE-5 § 8's "2.5-6x too smooth" does)
    // charges the difference in exposure to the texture. Relatively, the
    // references run 11.2 % (owner pavement), 15.4 % and 18.2 % (bat3 road),
    // and this surface read 6.9-9.8 % before. Swept in one boot, at the
    // band limit below set to 2.2:
    //
    //      amp     front3q   pm left   pm right   side
    //      0          9.4 %     8.0 %      6.9 %    8.1 %
    //      0.15       9.7       8.4        7.8      9.2
    //      0.30      10.7       9.4        9.8      8.0
    //      0.60      14.2      12.7       14.8      9.9
    //      1.00      20.6      17.4       21.1     12.9
    //
    // 1.0 overshoots the references at three of the four boxes. 0.6 sits
    // inside them, and it is the first setting at which the near road reads
    // as aggregate rather than as a sheet.
    uGritAmp: { value: 0.60 },
    // 1.8, which lets the 30 mm octave through at the side pose where 2.2
    // holds it at half weight: relative texture 11.2 % against 10.2 % there
    // and 15.8 % against 14.2 % at front3q, for the same gate to the decimal
    // and the same pixel-diff magnitude. Below about 1.5 the finest octave
    // starts arriving while its cell is under the four-tap kernel's own
    // Nyquist, and a still frame cannot show what that does while driving.
    uGritBand: { value: 1.8 },
    // Zero, and this is a **measured null** rather than an unfinished idea.
    // A domain warp is the obvious answer to CRITIQUE-5 § 8's "repeating
    // diamond lattice" and it was the next thing the previous round intended
    // to test. Tested: at a 5 cm warp on a 0.8 m field the near road's
    // |laplacian| went 6.33 -> 6.37 and its x/y correlation ratio 3.63 ->
    // 3.72, i.e. nothing, because there is no tile to break — see the note
    // above audiGritHash. Kept as a lever so the next person can re-measure
    // it in one call instead of rebuilding it.
    uWarpAmp: { value: 0 },
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
uniform vec2 uCastCentre;
uniform vec2 uCastHalf;
uniform vec3 uShadeTint;
uniform vec3 uKerbColor;
uniform vec3 uVergeColor;
uniform float uGritAmp;
uniform float uGritBand;
uniform float uWarpAmp;

// --- the road's missing centimetre, and why no texture could supply it -----
//
// Measured on the gate's own frames, the near road's correlation length is
// 3.7 px along screen x against 1.1 px down y at front3q, and **36 px against
// 1.8 px** at side — a ratio of 3.5 and 20 where both reference photographs
// read 1.15 to 1.56. The spectrum has no peak at any pitch, so the "repeating
// diamond lattice" in CRITIQUE-5 § 8 is not a tiling artefact: it is that
// every surviving feature is the same shape, a short horizontal dash, which
// is what a surface looks like once it has been low-passed an order of
// magnitude harder across one axis than the other.
//
// The cause is the filter, not the content. A ground plane at a grazing angle
// has a pixel footprint tens of times longer in depth than across, and the
// mip level is chosen by the LONG axis — so the across-road detail, which the
// screen has resolution to spare for, is averaged away with it. Anisotropic
// filtering caps at 16:1 and this is well past that. Authoring a finer tile in
// textures.ts cannot reach it: whatever is in the map, the sampler throws
// the same band away.
//
// So the fine grain is computed here instead, per fragment, with the two
// things a sampler cannot do: the band limit comes from the SHORT axis of the
// footprint rather than the long one, and the long axis is pre-filtered by
// hand with four taps along it. Octaves fade out individually as they reach
// that limit, so the far road stays smooth — which is correct, it is past the
// resolution — and nothing is drawn that the pixel cannot carry.
float audiGritHash(vec2 p) {
  // Wrapped first: the plane is 4 km across and this noise has centimetre
  // cells, so the raw cell index reaches six figures and fract() of it has no
  // mantissa left. 4096 cells is a 45 m period on the finest octave, which no
  // eye reads as a repeat of an 11 mm stone.
  p = mod(p, 4096.0);
  p = fract(p * vec2(0.3183099, 0.3678794) + vec2(0.71, 0.113));
  p *= 23.0;
  return fract(p.x * p.y * (p.x + p.y));
}
float audiGritNoise(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(audiGritHash(i), audiGritHash(i + vec2(1.0, 0.0)), f.x),
             mix(audiGritHash(i + vec2(0.0, 1.0)), audiGritHash(i + vec2(1.0)), f.x), f.y);
}
/** One octave, box-filtered along the footprint's long axis. */
float audiGritOct4(vec2 p, vec2 s) {
  return 0.25 * (audiGritNoise(p - s * 1.5) + audiGritNoise(p - s * 0.5)
               + audiGritNoise(p + s * 0.5) + audiGritNoise(p + s * 1.5));
}
float audiGritOct2(vec2 p, vec2 s) {
  return 0.5 * (audiGritNoise(p - s) + audiGritNoise(p + s));
}
/**
 * Signed grit, mean zero, sd 0.128 where every octave prints.
 *
 * Returned as a deviation rather than a colour because two things read it:
 * the albedo and the roughness. Relief is deliberately absent — the road
 * beside the car stands in the planting's shade, so what it returns is sky
 * and bounce rather than a sun it could cast a slope shadow from, and a
 * gradient costs two more taps an octave to obtain.
 */
float audiGrit(vec2 w) {
  vec2 dX = dFdx(w);
  vec2 dY = dFdy(w);
  float lX = length(dX), lY = length(dY);
  vec2 majorV = lX > lY ? dX : dY;
  // The band limit is the SHORT axis of the footprint, floored at a quarter
  // of the long one because the kernel has four taps and cannot pre-filter
  // finer than that. Taking the short axis is the whole trick: it is what the
  // sampler cannot do, and it is where the missing detail is.
  float band = max(min(lX, lY), max(lX, lY) * 0.25);
  const float CA = 0.011, CB = 0.030, CC = 0.085;
  float ia = 1.0 / (uGritBand * band);
  float wa = clamp(CA * ia - 0.35, 0.0, 1.0);
  float wb = clamp(CB * ia - 0.35, 0.0, 1.0);
  float wc = clamp(CC * ia - 0.35, 0.0, 1.0);
  float dev = 0.0;
  if (wa > 0.0) dev += 0.45 * wa * (audiGritOct4(w / CA, majorV / (4.0 * CA)) - 0.5);
  if (wb > 0.0) dev += 0.32 * wb * (audiGritOct4(w / CB, majorV / (4.0 * CB)) - 0.5);
  if (wc > 0.0) dev += 0.23 * wc * (audiGritOct2(w / CC, majorV / (2.0 * CC)) - 0.5);
  // Both tails pulled out, and ODD in dev, which is what keeps this out of
  // the tonal band. A road is dark bitumen with bright stone faces in it —
  // a distribution with two tails, not a brighter or darker grey — and an
  // even term here would read as a drift laid over the whole near field,
  // which the world-space pass below already owns. The noise is symmetric
  // about 0.5, so an odd function of it has mean exactly zero and this term
  // cannot move the albedo's average however hard it is driven.
  //
  // The *rendered* road does still come up 0.9-2.2 levels, and it is the
  // roughness term that does it, not this one: a lower roughness on the
  // positive tail returns more environment specular than the negative tail
  // gives back. Worth knowing before anyone reads that as an exposure drift.
  return dev * (1.0 + 3.0 * abs(dev));
}
/**
 * Domain warp on the tiled maps' uv, in tile units.
 *
 * The idea: the two-tap cross-fade above removes the four-metre tile's
 * *phase*, but both taps are still axis-aligned samples of a Worley field
 * whose cell walls run with u and v, i.e. with world x and z, so bending the
 * lookup on a sub-metre field should curve those walls.
 *
 * It does, and it buys nothing, because there were no straight ridges to
 * curve — see uWarpAmp, where the measurement is. Shipped at zero and kept
 * only so the next person can re-measure it with one lever call.
 */
vec2 audiWarp(vec2 uv, vec2 w) {
  if (uWarpAmp <= 0.0) return uv;
  return uv + uWarpAmp * vec2(audiGritNoise(w * 1.3 + 7.1) - 0.5,
                              audiGritNoise(w * 1.3 + 19.7) - 0.5);
}

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
        `vec3 mapN = audiTileNormal(normalMap, audiWarp(vNormalMapUv, vGroundXZ), vGroundXZ);
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );`,
      )
      .replace(
        '#include <map_fragment>',
        `diffuseColor *= audiTileColor(map, audiWarp(vMapUv, vGroundXZ), vGroundXZ);
float audiShade = 0.0;
float audiGritDev = 0.0;
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

  // …and the centimetre band the sampler threw away. See audiGrit above.
  audiGritDev = audiGrit(vGroundXZ);
  diffuseColor.rgb *= 1.0 + uGritAmp * audiGritDev;

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
  // **abs(x) cannot describe this road, because the car is parked AT the
  // near kerb and the two sides of it are nothing like each other.**
  //
  // Registered on the plate and cast through the photomatch camera, the
  // photograph's grass edge stands at |x| 1.08 / 1.38 / 1.86 m at three
  // stations with the car's own flank at 0.91 — the verge begins within a
  // metre of the sill. These stations had it at 15.4 and the kerb at 10.4,
  // eight to fourteen times too far out, so both first touched the frame
  // *behind the trees and inside the fog*: the furniture existed and was
  // correctly coloured, and no pose could see any of it. That, not a missing
  // model, is why every wide frame read as a salt flat.
  //
  // The section is the photograph's, which is a Parkway section: carriageway,
  // gutter, kerb, the grass tree-lawn the planes stand in, the pavement, then
  // the park. The far kerb keeps the stations both of them used to share,
  // because that one really is a whole carriageway away. ibl.ts carries the
  // same two sections -- the road the car stands on and the road it mirrors
  // have to be one surface.
  float nearX = max(-vGroundXZ.x, 0.0);
  float farX = max(vGroundXZ.x, 0.0);
  float onKerb = smoothstep(1.00, 1.09, nearX) * (1.0 - smoothstep(1.33, 1.44, nearX))
               + smoothstep(10.4, 11.0, farX) * (1.0 - smoothstep(12.4, 13.0, farX));
  float onWalk = smoothstep(4.60, 4.82, nearX) * (1.0 - smoothstep(7.00, 7.22, nearX));
  float onVerge = smoothstep(1.44, 1.60, nearX) * (1.0 - smoothstep(4.50, 4.70, nearX))
                + smoothstep(7.10, 7.42, nearX)
                + smoothstep(15.4, 16.6, farX);
  // Gutter line: a dark strip of silt where the camber drains.
  float gutter = (1.0 - smoothstep(0.86, 1.00, nearX)) * smoothstep(0.58, 0.78, nearX)
               + (1.0 - smoothstep(9.7, 10.4, farX)) * smoothstep(9.2, 9.8, farX);
  diffuseColor.rgb *= 1.0 - 0.34 * gutter;
  diffuseColor.rgb = mix(diffuseColor.rgb, uKerbColor, clamp(onKerb + onWalk, 0.0, 1.0));
  // Grass is not a flat colour at two metres, and without this the verge
  // reads as a second carriageway in a different paint. A clump field a
  // third of a metre across, plus the same low-frequency drift the road
  // uses so the two do not wear separate rhythms.
  float blade = texture2D(uGobo, vGroundXZ * 2.9 + vec2(0.63, 0.19)).r;
  float tuft = texture2D(uGobo, vGroundXZ * 0.42 + vec2(0.11, 0.87)).r;
  vec3 vergeCol = uVergeColor * (0.52 + 0.46 * drift + 0.52 * tuft + 0.34 * blade);
  diffuseColor.rgb = mix(diffuseColor.rgb, vergeCol, clamp(onVerge, 0.0, 1.0));
  // The kerb's own riser, which is the whole reason a kerb reads as a kerb
  // and not as a painted line. At a grazing camera this 150 mm face is most
  // of what is visible of it and it is in its own shadow all day — without it
  // the near kerb came back as a white stripe down the frame, which is worse
  // than the empty asphalt it replaced.
  float riser = smoothstep(0.93, 0.99, nearX) * (1.0 - smoothstep(1.03, 1.10, nearX));
  diffuseColor.rgb *= 1.0 - 0.52 * riser;

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

  // …and then handed over, where the grove's own cast shadow falls.
  //
  // The gobo was painted on because the trees that shade this road could not
  // be in the frustum. They are now, and where both are running they are the
  // same shadow counted twice: a painted 40 % laid over a cast 65 % took the
  // car two stops under, which is why the preset's dapple had to be cut to
  // 0.45 and why the road it is still responsible for came back at a 1.35
  // sun/shade ratio against the photograph's 2.9.
  //
  // So the two divide the ground between them instead of sharing it, and
  // uCastHalf is the **shading rank's own shadow footprint**, not the
  // shadow frustum's. Those are different by a factor of four across the
  // sun's bearing and by twenty along it, and the previous round passed the
  // frustum: it suppressed the gobo over sixty metres by a hundred and fifty,
  // which is every pixel of road in this pose. Measured, that is most of the
  // 15.1 -> 32.2 tone regression — not because the painted shade was missed,
  // but because with the bands gone the road had no *lit* reference left in
  // frame and the whole lower half of the histogram collapsed into one bucket.
  //
  // The frame is the sun's: lx runs across its bearing and ly along it, so
  // the crossfade follows the band's long axis rather than a circle drawn
  // around the car.
  float handover = 1.0;
  if (uCastHalf.x > 0.0) {
    vec2 d = vGroundXZ - uCastCentre;
    float lx = abs(dot(d, vec2(-uSunAz.y, uSunAz.x)));
    float ly = abs(dot(d, uSunAz));
    // Zero in the core, one outside — and the ramp starts inside the band
    // rather than at its edge, because the shadow map's own penumbra is
    // already softening the boundary from the other side and two ramps that
    // meet exactly produce a visible seam. Measured on the plan view, a
    // crossfade centred on the edge left a straight line across the road.
    handover = max(smoothstep(0.55, 1.15, lx / uCastHalf.x),
                   smoothstep(0.55, 1.15, ly / uCastHalf.y));
  }
  // What the gobo is standing in for differs on the two sides of that ramp,
  // and this is the distinction that was missing. Inside the band it is
  // standing in for nothing — the cast shadow is there. Outside it, it is
  // standing in for the *same canopy* beyond the rank's reach, so it should
  // carry that canopy's depth rather than the halved strength the preset had
  // to adopt while the two were compounding: at 0.45 the paint took 40 % off
  // the sun wherever it fell, so the road it owned could not exceed a 1.4:1
  // sun/shade ratio however the texture was cut, against the photograph's
  // 2.2–2.9:1. Coverage and opacity are different quantities and multiplying
  // them into one number is what limited it to a dimmer.
  float deferring = uCastHalf.x > 0.0 ? handover : 0.0;
  // Channel g is what gets *through* a crown: the leaf, fleck and twig
  // structure that turns a shadow into dapple.
  float lit = mix(1.0, gb.g, canopy);
  // One tap only. A second at a coarser scale, however it was combined,
  // always won where it was darker and it carries no leaf detail at that
  // scale — so the fine structure that makes dapple read as dapple was being
  // replaced by a smooth blob over most of the near field.
  //
  // The deferring term above carries the strength back up over the same ramp the
  // handover comes in on, so the two are one crossfade rather than two: the
  // gobo arrives at full canopy depth exactly where it stops overlapping the
  // cast band. The doubling is the thing to delete the day the preset's
  // dapple goes back to 0.9 — and where there is no cast shadow at all to
  // defer to, coverage and opacity stay conflated exactly as they were,
  // because the four presets in that position are calibrated on it.
  float cover = mix(uGoboStrength, min(1.0, uGoboStrength * 2.0), deferring);
  float shadeAmt = (1.0 - lit) * cover * handover;
  // Not attempted twice: giving the band back the gobo's *fine* channel, on
  // the reasoning that the shadow map owns the coverage and its sub-texel
  // holes cannot own the grain. The road beside the car is smoother than the
  // photograph — residual 6.8 % against 9.8 % — and that term is the obvious
  // way to close it. It does not: swept 0 to 1.4x it moved the residual by
  // 0.3 of a point, because the gobo's leaf channel only has amplitude
  // *inside* its own crown mask and the mask is low over the band.
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
// And the crown that is blocking the sun blocks part of the sky as well —
// but far less of it than this used to claim, because the crown is now *in
// the environment map*. ibl.ts builds a real canopy over the proxy world, so
// the map a shaded patch of road samples has already lost the sky the leaves
// are covering; taking another 45 % off here counted it twice and dragged a
// quarter of the frame below level 32.
reflectedLight.indirectDiffuse *= 1.0 - 0.18 * audiShade;
reflectedLight.indirectSpecular *= 1.0 - 0.24 * audiShade;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
{
  vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
  roughnessFactor *= mix(texelRoughness.r, texelRoughness.g, uWetness);
  // A polished stone face is smoother than the bitumen it sits in, so the
  // grit has to reach the specular as well — a term that only moves the
  // albedo reads as dirt on a smooth sheet rather than as the sheet being
  // made of stones. Roughly half of what this surface returns is environment
  // reflection, so an albedo-only grit arrives at half strength.
  roughnessFactor *= 1.0 - 1.6 * uGritAmp * audiGritDev;
}`,
      );
  };
  // Force a fresh program: onBeforeCompile is keyed on the material's cache key.
  mat.customProgramCacheKey = () => 'audi-asphalt-v12';
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

  // Sweepable in one boot, because that is the only kind of sweep this
  // machine supports: two boots of identical code differ in ~6 % of pixels.
  // `groundGrit` 0 is the pre-grit surface exactly.
  const perf = (globalThis as unknown as {
    __AUDI_PERF?: { register(name: string, fn: (v: number | boolean) => unknown): void };
  }).__AUDI_PERF;
  perf?.register('groundGrit', (v) => (asphalt.patch.uGritAmp.value = Number(v)));
  perf?.register('groundGritBand', (v) => (asphalt.patch.uGritBand.value = Number(v)));
  perf?.register('groundWarp', (v) => (asphalt.patch.uWarpAmp.value = Number(v)));

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
    // These substitute for diffuseColor after the map has been sampled, and
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
    setCastFootprint(centre, sunDir, across, along) {
      asphalt.patch.uCastCentre.value.set(centre.x, centre.z);
      const azLen = Math.hypot(sunDir.x, sunDir.z) || 1e-3;
      asphalt.patch.uSunAz.value.set(sunDir.x / azLen, sunDir.z / azLen);
      asphalt.patch.uCastHalf.value.set(across, along);
    },
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

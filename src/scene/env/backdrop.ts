/**
 * Distant surroundings, in the scene rather than only in the reflection.
 *
 * The IBL proxy world puts trees and facades into the car's *reflections*,
 * but a wide shot also has to have something on the horizon or the boulevard
 * reads as a salt flat. This is that something: two receding rows of plane
 * trees at boulevard spacing, a deeper row behind them, a broken skyline —
 * and the vista, which is what closes the boulevard's own ends and the ground
 * line beside it, because rows that *flank* a sight line never close one.
 *
 * Six draw calls with `InstancedMesh`. The planting *does* cast: at 11.5° of
 * solar elevation the trees that shade the car stand fifty to seventy metres
 * up-sun of it, so the sun's frustum reaches out that far and the crowns
 * write a leaf-cut depth so what lands on the road is dapple. The vista does
 * not cast — it is two hundred metres outside that frustum.
 *
 * **There are two leaf cuts in this file and they are not two settings of
 * one thing.** `LEAF_CUT` is the shadow pass's, and it stands in for a
 * penumbra the depth map cannot draw, so it is finer and deeper than
 * anything visible. `LEAF_CUT_VISIBLE` is the colour pass's, and it stands
 * in for the mip chain procedural noise has never had, so it is band-limited
 * to the pixel and rescaled to hold its own variance. The near planting and
 * the vista then share that one shader at two settings, because a crown at
 * 30 m and a crown at 260 m are the same object at two sampling rates and
 * not two different objects. Anything that moves all of them together will
 * be wrong in most of them.
 */

import * as THREE from 'three';
import type { EnvPreset } from './presets';

export interface BackdropHandle {
  group: THREE.Group;
  apply(preset: EnvPreset, sunDir: THREE.Vector3): void;
  /** Crown instances, and how many of them stand in the shading rank. */
  casterCount(): { crowns: number; shadeRank: number; trees: number };
  /** Probe only: stop the planting writing into the sun's depth pass. */
  setCasting(on: boolean): void;
  /**
   * How much of the sun the crowns hold back, at what grain, and — the part
   * a scalar could never express — with what structure. `gapDepth` 0 is the
   * old blanket; `core*` size the shade the subject itself stands in, in
   * metres, in the sun's own frame.
   */
  setDepthCut(cut: {
    freq?: number; base?: number; rim?: number;
    gapFreq?: number; gapDepth?: number;
    coreAcross?: number; coreAlong?: number; coreSoft?: number;
  }): {
    freq: number; base: number; rim: number;
    gapFreq: number; gapDepth: number;
    coreAcross: number; coreAlong: number; coreSoft: number;
  };
  /** Probe only: scale the shading row's pitch across the sun. */
  setSpread(s: number): number;
  /**
   * Probe only: stand the vista down, so the A/B that asks what it is worth
   * can be run without a rebuild. It neither casts nor receives, so hiding it
   * changes nothing else in the frame.
   */
  setVistaVisible(on: boolean): boolean;
  /**
   * Ground footprint of the shading rank's own shadow, in metres from the
   * subject, in the sun's frame — `across` its bearing and `along` it. Null
   * when no rank is standing. This is what lets the painted gobo hand over to
   * the real cast shadow where it falls and keep the road everywhere else;
   * feeding it the *frustum* extent instead, which is what the previous round
   * did, suppresses the gobo over the whole frame.
   */
  shadeFootprint(): { across: number; along: number; height: number } | null;
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
 * The cut, as the **shadow pass** uses it. The colour pass has its own, below,
 * and the two must stay apart: this one is standing in for a penumbra, and
 * the other one is standing in for a mip chain.
 *
 * Two things are substituted per pass.
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
  // --- five octaves of 3D noise, and why there is a cheap door out ---------
  //
  // This block is the most expensive thing in the frame, and the cost is not
  // where "fill-bound" suggests. Five leafNoise calls is forty leafHash
  // evaluations, run at every fragment of every lobe, with a discard that
  // stops the hardware rejecting the ones behind — and a sun ray crosses five
  // or more lobes through a crown. The map is 4096², so the grove pays for
  // tens of millions of fragments at a few hundred flops each. That is the
  // 17 ms, and it is ALU, not rasterisation. Measured: the same lobes at the
  // same count with a plain MeshDepthMaterial cost 75.2 ms of GPU against
  // 93.6 with this cut, and 75.1 with the grove not casting at all — so
  // rasterising 208,404 triangles into a 4096 map is free to within 0.2 ms
  // and every millisecond of the 18.4 is here.
  //
  // The cheap path keeps the first octave and replaces the other two with one
  // hash, because **octaves two and three are below the texel**. At the ±30 m
  // frustum a texel is 14.6 mm; those octaves have wavelengths of 8.8 and
  // 3.7 mm, so a texel samples each of them once, at one point, and what
  // reaches the map is their *distribution* and nothing else. A single hash
  // with the same mean and spread is the same instrument at a sixteenth of
  // the price: mean 0.19 (= 0.5 * (0.26 + 0.12)) and sd 0.0530
  // (= LEAF_SIGMA * hypot(0.26, 0.12)), and a U(0,1) hash scaled by
  // 0.0530 * sqrt(12) = 0.1835 carries exactly that. Measured, 5.6 ms of GPU
  // on the desktop chain and no readable change in any frame.
  //
  // The FIRST octave is sub-texel too — 2.1 cm against 14.6 mm is 1.43
  // samples a cycle — so the same argument retires it, and it is left alone
  // on purpose. It carries 0.62 of the weight, and collapsing it would take
  // the last of the shade's graininess with it: the residual across the
  // bumper is already 0.9 % against the photograph's 4.7 %, so this surface
  // is over-smooth, not under. The next 11 ms is not here. It is in how many
  // lobes a sun ray crosses: cost falls roughly linearly with the crown
  // instance count (groveCrownFrac), so a shadow-only proxy of four or six
  // lobes a tree instead of twenty should take most of it — at the price of
  // re-tuning uLeafBase against the gate, because fewer layers transmit more.
  float v = 0.62 * leafNoise(vLeafPos * 3.2 * LEAF_FREQ);
  if (uCheapCut > 0.5) {
    v += 0.19 + 0.1835 * (leafHash(floor(vLeafPos * 18.0 * LEAF_FREQ + 31.0)) - 0.5);
  } else {
    v += 0.26 * leafNoise(vLeafPos * 7.6 * LEAF_FREQ + 11.0)
       + 0.12 * leafNoise(vLeafPos * 18.0 * LEAF_FREQ + 31.0);
  }
  // Thin towards the rim of the lobe: a leaf mass has no hard edge, and a
  // uniform cut just gives a solid ball with freckles.
  float edge = smoothstep(0.34, 0.98, LEAF_EDGE);

  // --- and the dapple, which is the part that is not a scalar --------------
  //
  // Where this fragment's own shadow lands, in metres on the road. **The
  // dapple has to be authored in the ground's frame and not in the crown's**,
  // for the reason below.
  vec2 gp = vLeafPos.xz - uSunGround * (vLeafPos.y / uTanElev);
  // Stretched along the sun's bearing before the field is sampled, and the
  // reason is the depth the shared field throws away. Projecting every
  // fragment to its own ground intercept makes the whole layer agree about
  // where the holes are, which is the point — but a real canopy's cores sit
  // at different heights, and a core Dh metres thick smears its own shadow
  // Dh / tan(elev) along the bearing: fifty metres at 11.5° for a ten-metre
  // layer. The anisotropy here stands in for that smear, so it scales as
  // 1 / tan(elev) and shortens correctly as the sun comes up. A dapple from
  // a low sun is streaks, not spots, and this is why.
  vec2 across2 = vec2(-uSunGround.y, uSunGround.x);
  vec2 gq = vec2(dot(gp, across2), dot(gp, uSunGround) * uTanElev);
  // These two octaves are NOT cheapened, and the attempt is worth recording.
  //
  // They are 3D calls whose third coordinate never moves, so each pays eight
  // hashes to interpolate between two identical planes, and a 2D noise of the
  // same mean and spread costs four. That swap saves 2.7 ms and it is wrong:
  // a different noise is a different *realisation*, and unlike the octaves
  // above these are resolved — 3.3 m and 1.4 m wavelengths against a 14.6 mm
  // texel. So moving them moves where the dapple's holes are. Measured, the
  // near road at the side pose went from a mean of 60.9 to 82.1, twenty-one
  // levels, because one box swapped shade for sun. Cheapening a term is only
  // free below the texel; at 200 texels a wavelength it is a redesign.
  float gap = 0.62 * leafNoise(vec3(gq * uGapFreq, 3.1))
            + 0.38 * leafNoise(vec3(gq * uGapFreq * 2.3, 17.7));
  // Pushed to its own ends over ±0.37 sd of the sum above, so the field
  // spends a third of its time hard open and a third hard shut rather than
  // sliding between them. Symmetric about 0.5, so the *mean* threshold is
  // still LEAF_BASE and the dapple costs nothing on level — see uGapDepth.
  float g = smoothstep(0.45, 0.55, gap);
  // …and a core standing over the subject, which is the same decision
  // placeShadeRank already makes one scale up and for the same reason: a
  // car is either under the trees or it is not, and which of those it is
  // should not come out of a hash. An ellipse in the sun's own frame, because
  // the car's shadow *intercepts* are an ellipse in that frame — the roof at
  // 1.46 m is shaded by the crown whose shadow lands 7.2 m down-sun of the
  // roof itself, so a core sized to the car's plan view would leave the top
  // of it in the sun.
  vec2 cd = gp - uCoreAt;
  float cr = length(vec2(dot(cd, across2) / uCoreAcross, dot(cd, uSunGround) / uCoreAlong));
  g *= smoothstep(1.0, 1.0 + uCoreSoft, cr);

  if (v < LEAF_BASE + LEAF_RIM * edge + (g - 0.5) * 2.0 * uGapDepth) discard;
}
`;

/**
 * Standard deviation of one octave of `leafNoise` over [0, 1].
 *
 * Needed as a number rather than a feeling, because the coverage below is
 * the probability that the noise clears its threshold, and a probability
 * needs a spread. Trilinear-smoothstep interpolation of eight independent
 * uniforms has variance (1/12) * E[w^2 + (1-w)^2]^3, and for w = 3t^2 - 2t^3
 * that expectation is 0.7429, giving sd 0.185. Measured over the compiled
 * shader it comes back 0.18, which is the same number.
 */
const LEAF_SIGMA = '0.185';

/**
 * How much brighter the margin of a leaf mass is than the mass behind it.
 *
 * Standing in for the coverage this pass cannot composite: a pixel the cut
 * only just passes is part leaf and part whatever is behind, and on the
 * `rear` band that is a leaf at 75 against a sky at 213, so twice the leaf
 * is about the honest average and a little over is where the margin starts
 * to read as the translucent edge it also is. A multiplier on the crown's
 * own colour rather than an absolute tone, which is what stops it printing a
 * halo of the wrong hue when the preset changes.
 */
const LEAF_FRINGE_GAIN = '2.6';

/**
 * Clump shading — the part that stops a crown being one colour.
 *
 * The instance tint already decides whether a *lobe* faces the sun, which is
 * a two-metre decision. Inside that lobe there was nothing: at the `rear`
 * pose a crown covers three hundred pixels and every one of them was the
 * same brown. Photographed, the same mass is not: measured off the owner's
 * frame the sunward clumps are (92, 77, 45) and the shaded ones (61, 55, 45)
 * — a stop and a half apart and two to one warm — and they alternate at
 * roughly half a metre, which is the scale `leafClump` runs at.
 *
 * So the clump term drives a *colour* and not only a level, and the first
 * attempt at it failed for a reason worth recording: endpoints picked for
 * hue alone were 14 % apart in luminance, so the crown changed colour and
 * did not change tone, and at 300 px it still read flat. The pair below is
 * 1.57:1 in luminance with a midpoint that is neutral to one part in fifty,
 * so it redivides the crown's existing colour between its lit and shaded
 * clumps rather than adding anything to the sum — which is what keeps a
 * per-fragment term out of the paint's colour gate.
 */
const LEAF_SHADE = /* glsl */ `
{
  float k = clamp(0.5 + 0.5 * LEAF_STRUCT * leafClump, 0.0, 1.0);
  vec3 warmShade = mix(vec3(0.685, 0.764, 1.175), vec3(1.390, 1.210, 0.800), k);
  diffuseColor.rgb *= warmShade * mix(${LEAF_FRINGE_GAIN}, 1.0, leafFringe);
}
`;


/**
 * What a crown puts on screen that is **not** its own colour.
 *
 * Measured three ways on the same `rear` band. As shipped it reads 75.5.
 * Zero the crowns' albedo outright and it reads 71.1. Zero their whole
 * outgoing light and it still reads 65.4 — that floor is the exponential fog
 * and the bloom off a 213-level sky, and at 260 m it is two thirds of the
 * band. Of the third that is actually the crown, **more than half was a 0.04
 * dielectric Fresnel returning the sky** rather than the crown's own colour:
 * 5.7 levels of specular against 4.4 of albedo. At `photomatch`, where the
 * fog is half a per cent, the same pair is 54.8 and 33.8, so the crown's own
 * light is 21 levels there and the specular is a fifth of them.
 *
 * That is the same fault a previous round found on the trunks — "a trunk
 * with a 0.007 albedo was rendering at level 122" — and lowering
 * `envMapIntensity` only scaled it down, because that scales the specular
 * and the albedo together and the albedo was never the part doing the work.
 * With the tint carrying a fifth of the signal, every per-instance colour,
 * the sunward-to-shaded lerp and any per-fragment clump shading are being
 * applied to a fifth of what is on screen, which is why a crown reads as one
 * flat tone whatever is done to its colour.
 *
 * The albedo had been pushed down to about 0.05 to make the mass dark, and
 * that is the wrong place for it: self-occlusion attenuates the *light* a
 * patch of canopy receives, not the fraction it reflects, and it attenuates
 * the specular exactly as much as the diffuse. Put it on the specular and
 * the albedo can carry the tone instead — at which point the crowns respond
 * to the sun, which they never have.
 */
const LEAF_SELF_OCCLUSION = /* glsl */ `
reflectedLight.indirectSpecular *= 0.11 * uSpecScale;
reflectedLight.directSpecular *= 0.22 * uSpecScale;
float leafOcc = mix(1.0, leafSky * uSkyGain, uSkyOcc);
reflectedLight.indirectDiffuse *= leafOcc;
reflectedLight.directDiffuse *= leafOcc;
`;

/**
 * The sky a patch of canopy can actually see — the part of self-occlusion
 * that has to be **per-fragment**, because the defect it answers is a spread
 * and not a level.
 *
 * The level was already landed: the crowns measure 55.4 against the
 * photograph's 54.8. What CRITIQUE-6 files as "the trees read as stencils"
 * is the distribution around it. Measured on `front`, a tree window puts
 * **73 % of its pixels in two adjacent buckets** (48-80) with **0.0 % below
 * 48 and 0.0 % above 224**, and its fifth percentile is **59.8** — there is
 * nothing darker than level 60 anywhere in a tree. The owner's own canopy
 * decays smoothly across all sixteen buckets with 43 % below 48 and a fifth
 * percentile of **21**. A two-stop foliage range against a real eight.
 *
 * The cause is that every term standing in for self-occlusion here is a
 * **constant**: `lift`, and the two specular dampings above. A constant
 * multiplier moves the mean and cannot touch the shape — it scales p5 and
 * p50 together, which is why the render's p5/p50 is 0.78 where the
 * photograph's is 0.39. What is genuinely non-uniform inside a canopy is the
 * *light a patch receives*, and nothing here attenuates that: these lobes
 * are convex shells with nothing inside them, so a fragment on the underside
 * of the mass collects the same hemisphere, and the same sun, as one on top
 * of it. A real canopy is two stops apart across that distance and it is the
 * dark end of it that the histogram is missing.
 *
 * It has to be **both** diffuse terms and not only the sky's, and that was
 * measured rather than assumed. Attenuating `indirectDiffuse` alone moved
 * the `front` window's fifth percentile by **0.8 of a level** across the
 * whole sweep, because at `front`, `photomatch` and `front3q` the sun is
 * behind the camera and the visible canopy is **sun-lit** — the sky is the
 * minority term in exactly the poses the gate is read from.
 *
 * So `leafOcc` attenuates both diffuse terms by a per-fragment visibility,
 * from two factors that are already paid for:
 *
 * - which way the surface faces, from a vertex-shader varying, which is the
 *   top-of-mass to underside gradient;
 * - `leafClump`, the half-metre clumping the shading term already computes.
 *
 * `uSkyGain` is not a look knob — it is set where the band's mean does not
 * move, so the term redistributes light rather than removing it and the
 * carefully-set level above survives. Both are uniforms, swept in one boot
 * through `groveSkyOcc` / `groveSkyGain`, and `uSkyOcc = 0` reproduces the
 * previous build exactly whatever the gain is.
 *
 * ## What this is worth, and what it is not
 *
 * **It is worth a few points, and the cause of the defect is elsewhere.**
 * Say that plainly, because the paragraphs above make a case that sounds
 * like it should be worth a stop and it is not. Over both `front` tree
 * windows together, 1.0 / 3.3 moves the two-bucket pile from 66.4 % to
 * 61.6 % and the share under level 64 from 9.2 % to 12.7 %; at `front3q` it
 * moves the share under 48 from 14.6 % to 15.9 %. Every sign is right and
 * every magnitude is small.
 *
 * The reason is a ceiling, and `uSpecScale` exists to measure it. With the
 * crowns emitting **nothing at all** — both diffuse terms zeroed and the
 * specular with them — the `front` tree window still reads p50 **65.1**
 * against the shipped 79.1. The crowns' entire output is fourteen of those
 * seventy-nine levels, so nothing done to their shading can be worth more
 * than that, whatever its shape.
 *
 * What fills the other sixty-five is the **exponential fog**, and it is not
 * close: turning `preset.fog.density` off takes the same window from p50
 * 79.1 to **27.0** and from 0.1 % under level 48 to **72.9 %**, against the
 * photograph's 53.9 and 43.1 %. Bloom is worth one level of it. The render
 * with fog is far too light and flat; the render without it is too dark; the
 * photograph is between, at about 0.0012 of density rather than 0.0018 by
 * either measure. The foliage shading was never the thing that was wrong —
 * shot with the fog off, this canopy has near-black interiors, gold sunlit
 * tops and sky through the holes. **`fog.density` lives in `presets.ts` and
 * is applied in `Environment.ts`; neither is this file's to change.**
 */
const LEAF_SKY_VIS = /* glsl */ `
float leafSky = clamp((0.5 + 0.5 * vLeafUp) * clamp(0.55 + 0.45 * leafClump, 0.0, 1.0), 0.0, 1.0);
`;

/**
 * The albedo that replaces the specular taken off above, as a reflectance.
 *
 * Additive rather than a multiplier on `lift`, and the difference is
 * measurable: what was removed is a fraction of a *constant* 0.04 Fresnel,
 * so what replaces it is a constant too. Scaling `lift` over-pays at a high
 * sun, where the albedo term is already twice what it is at golden hour —
 * on the `noon` control that put 6.5 levels on the tree band where this puts
 * 4, with every band from the bonnet down moving under 0.2.
 *
 * 0.026 is set by measurement, not derivation: it is what lands the
 * golden-hour canopy on 55.4 against the photograph's own near-left canopy
 * at 54.8 and the previous build's 54.8.
 */
const LEAF_SPEC_TO_ALBEDO = 0.026;

/**
 * The trunks had the crowns' disease and a worse case of it.
 *
 * Measured the same way — a real build with `trunkMat`'s albedo zeroed, then
 * a second with its whole outgoing light zeroed, differenced against the
 * shipped frame pixel by pixel so the attribution is to the trunks and not to
 * a band that happens to contain them. Over the 23,437 pixels at `photomatch`
 * where the trunks contribute more than 20 levels: **18.9 levels of specular
 * against 12.9 of albedo, 59.5 %.** On the vista trunks at `rear` it is 24.2
 * against 5.9, which is 80 %. (Boot-to-boot noise over the same mask is
 * +0.02 and +0.32 of a level, so neither figure is a coin toss.)
 *
 * The cause is not the same as the crowns' though, and the difference matters
 * for the size of the correction. A crown's albedo had been pushed to 0.05 to
 * make the mass dark. A trunk's is pushed to **0.024** — `barkLift` times the
 * instance tint — and it is attenuated *twice*: once correctly, by
 * `envMapIntensity` 0.18 standing in for how little sky a trunk in a grove
 * can see, and once again by the tint. Real plane bark is one of the palest
 * natural surfaces there is, 0.25 to 0.40 diffuse. So the trunks are not a
 * dark surface rendered too bright; they are a *pale* surface whose own
 * colour has been turned almost off, leaving a sky-coloured Fresnel to stand
 * in for it — which is why no amount of bark tint ever showed.
 *
 * Direct is damped less than the crowns' 0.22: a leaf mass is mostly
 * self-shadowed and a trunk's lit flank is not, and the sheen along a wet-ish
 * bole at a raking sun is a real thing a photograph shows.
 *
 * Re-measured the same way after this and the reflectance below: at
 * `photomatch` the core goes to 58.2 of albedo against 3.4 of specular, so
 * the specular share falls 59.5 % → 5.6 %; on the vista trunks at `rear`,
 * 80.4 % → 5.4 %. What the tint does is now what is on the screen.
 */
const BARK_SELF_OCCLUSION = /* glsl */ `
reflectedLight.indirectSpecular *= 0.12;
reflectedLight.directSpecular *= 0.30;
`;

/**
 * What is left on a bole that the sun never reaches — sky, and the road and
 * the trunks around it.
 *
 * Measured off the photograph rather than derived: its trunks in the
 * planting's own shade read 33 to 58 and the ones the sun rakes read 120 to
 * 155. This is not that ratio, though, and the difference is worth stating —
 * it is the fraction of a *lit bole's reflectance* that a shaded one keeps in
 * this renderer, where the sky a trunk sees has already been cut to 0.18 by
 * `envMapIntensity` above. Set at 0.30 first, on the photograph's ratio
 * directly, and the shaded trunks came back at a lower decile of 55 against
 * the photograph's 34; at 0.16 the trunks run 47 / 87 / 135 at the tenth,
 * fiftieth and ninetieth percentiles, against 34 / 73 / 175 for the
 * photograph's own five comparable trunks. Reading it as a sky-to-sun ratio
 * and "correcting" it upwards would undo that and pay the self-occlusion
 * term twice.
 */
const BARK_SKY_SHARE = 0.16;

/**
 * Plane bark, which is the one tree in a city you can name from a hundred
 * metres by its trunk alone.
 *
 * It sheds in plates: last season's bark comes away in irregular sheets and
 * what is under it is fresh, pale and nearly white, so the trunk is a jigsaw
 * of cream over olive-ochre with abrupt edges — not a smooth mottle and not
 * a noise field. Measured off the owner's photograph on a patch of the near
 * trunk high enough to be clear of canopy dapple, the top quartile of it runs
 * 1.51× the patch mean and the bottom quartile 0.88×, a plate-to-underbark
 * ratio of 1.87:1; further down, where the canopy is throwing shade across it
 * as well, the same trunk spans 6:1.
 *
 * Two things this deliberately does not do.
 *
 * **It does not hold its variance as it recedes.** The canopy cut has to,
 * because its threshold sits far from the median and letting the field
 * average away changes the *fraction* it cuts, closing the crowns into solid
 * lobes. This threshold is *at* the median, so coverage is 50 % at every
 * distance and the only thing averaging costs is contrast — which is exactly
 * what a mip chain would take off it, and the right answer for a mottle.
 *
 * **It does not add light.** The endpoints are multipliers whose mean over a
 * symmetric field is 1.000 in luminance, so the plates redivide the tint the
 * instance already carries. A bark pattern that also brightened the trunks
 * would be unattributable the next time somebody measures this.
 */
const BARK_PLATES = /* glsl */ `
{
  // The same band-limit the canopy needs, and for the same reason: this noise
  // has no mip chain either, and a 7 cm plate margin at 260 m is a tenth of a
  // pixel. Wavelengths are in metres of trunk: 0.63 m for the flank-scale
  // shading, 0.22 m for the plate and 0.077 m for its ragged edge.
  float px = max(length(dFdx(vBarkPos)), length(dFdy(vBarkPos)));
  float a1 = smoothstep(1.0, 2.5, 1.0 / max(1.6 * px, 1e-6));
  float a2 = smoothstep(1.0, 2.5, 1.0 / max(4.5 * px, 1e-6));
  float a3 = smoothstep(1.0, 2.5, 1.0 / max(13.0 * px, 1e-6));
  float a4 = smoothstep(1.0, 2.5, 1.0 / max(34.0 * px, 1e-6));
  // Stretched 2:1 up the trunk, because a shed plate is longer than it is
  // wide — it comes away along the grain.
  vec3 s = vec3(1.0, 0.5, 1.0);
  float n1 = mix(0.5, leafNoise(vBarkPos * 1.6 * s + 3.0), a1);
  float n2 = mix(0.5, leafNoise(vBarkPos * 4.5 * s + 19.0), a2);
  float n3 = mix(0.5, leafNoise(vBarkPos * 13.0 * s + 47.0), a3);
  float n4 = mix(0.5, leafNoise(vBarkPos * 34.0 * s + 71.0), a4);
  // Four octaves, and the weights are set by what the *close* poses showed
  // rather than by the usual halving. At three octaves the coarsest carried
  // 0.34 of the field, which is a 0.63 m feature — 98 px on the profile
  // pose's 200 mm lens at 20 m — and with nothing finer inside it the boles
  // came back as pale poles with dark blotches on them, camouflage rather
  // than bark. The weight moves down the octaves and a fourth is added at
  // 3 cm, which is the scale of the crazing inside a plate.
  float plate = 0.16 * n1 + 0.30 * n2 + 0.32 * n3 + 0.22 * n4;
  // Centred on the median so the coverage cannot drift with distance, and a
  // hard-ish ramp because bark comes away as a sheet and not as a gradient.
  // The ramp is 0.58 of the field's own standard deviation wide, so most of a
  // trunk sits at one endpoint or the other — a jigsaw, which is what
  // shedding bark is, rather than a smooth mottle. It cannot be made much
  // harder than this: the band-limit above only guarantees the surviving
  // octaves are two and a half pixels or more, so a step narrower than that
  // would put an aliasing edge back in. The endpoints are 1.8:1 in luminance
  // — the ratio measured on the photograph's own dapple-free bark patch —
  // with a mean of exactly 1.000, so the plates redivide the instance tint
  // and cannot add light to the frame.
  float shed = smoothstep(0.5 - 0.055, 0.5 + 0.055, plate);
  diffuseColor.rgb *= mix(vec3(0.760, 0.678, 0.544), vec3(1.252, 1.235, 1.157), shed);
}
`;

/**
 * The cut as the **colour pass** uses it — and what was wrong was the
 * frequency, not the threshold.
 *
 * A leaf-cut alpha *texture* has a mip chain: minify it and the fine holes
 * average into a grey, so what an alpha test gets at distance is a smooth
 * field. Procedural noise has none. Every octave keeps full amplitude however
 * small it lands on screen, so the cut goes on producing full-contrast detail
 * after that detail has shrunk past the pixel. Shot dead-on from 26 m through
 * the 200 mm `rear` lens the vista's third octave lands at 0.7 px and its
 * second at 1.7 px, and the band measures a 99th-percentile pixel Laplacian
 * of 193 against the photograph's 111, with 59 % of it at one end of the
 * range or the other against the photograph's 40 %. That is the "blown-out
 * blotches" reading, and no value of `base` or `rim` reaches it.
 *
 * Two things are done here that the depth pass deliberately does not do.
 *
 * **The octaves are band-limited.** `dFdx`/`dFdy` of the lobe position give
 * the world metres a pixel covers, so each octave's wavelength is known in
 * pixels and is faded out below about two of them, its contribution replaced
 * by its own mean.
 *
 * **What survives is rescaled to hold the variance.** This is the same
 * correction a mip-mapped alpha test needs and for the same reason: averaging
 * the fine detail away shrinks the spread, the threshold then cuts a
 * different fraction than it did at full resolution, and a canopy closes up
 * into a solid lobe as it recedes. Rescaling by the ratio of the full spread
 * to the surviving one keeps the *statistics* of the cut fixed while its
 * *scale* coarsens, which is what a real canopy does.
 *
 * What is **not** done is partial coverage, and it was built before it was
 * rejected. Mixing the sky's own radiance in by the uncovered fraction,
 * before tone mapping where the two are still radiances, is the textbook
 * answer and it is wrong here: inside a grove a hole does not show sky, it
 * shows the next lobe. The rim term leaves a wide band of every crown partly
 * open, so blending that band towards the horizon printed a bright halo round
 * all six hundred of them and took the `rear` band from 107 to 127 mean. It
 * also exposed the lobes' own facets, because the binary noise had been
 * dithering the interpolated-normal rim term and a smooth coverage does not.
 * Order-independent compositing is what this needs; alpha-to-coverage on a
 * 2x MSAA target offers three levels, which is worse than what the 16-sample
 * jittered accumulation already does to a binary cut's silhouette.
 */
const LEAF_CUT_VISIBLE = /* glsl */ `
float leafClump;
float leafFringe;
{
  float px = max(length(dFdx(vLeafPos)), length(dFdy(vLeafPos)));
  // Each octave's wavelength in pixels, and how much of it survives. Below
  // one pixel a feature can only alias; above two and a half it is detail.
  // Nothing here is tuned — it is the sampling theorem with a ramp on it.
  float a1 = smoothstep(1.0, 2.5, 1.0 / max(3.2 * LEAF_FREQ * px, 1e-6));
  float a2 = smoothstep(1.0, 2.5, 1.0 / max(7.6 * LEAF_FREQ * px, 1e-6));
  float a3 = smoothstep(1.0, 2.5, 1.0 / max(18.0 * LEAF_FREQ * px, 1e-6));
  float n1 = mix(0.5, leafNoise(vLeafPos * 3.2 * LEAF_FREQ), a1);
  float n2 = mix(0.5, leafNoise(vLeafPos * 7.6 * LEAF_FREQ + 11.0), a2);
  float n3 = mix(0.5, leafNoise(vLeafPos * 18.0 * LEAF_FREQ + 31.0), a3);
  float v = 0.62 * n1 + 0.26 * n2 + 0.12 * n3;
  // Hold the spread. Capped at 2.4x, because past that the survivor is one
  // octave and stretching it only turns a soft field into a hard one.
  float sRem = sqrt(0.3844 * a1 * a1 + 0.0676 * a2 * a2 + 0.0144 * a3 * a3);
  v = 0.5 + (v - 0.5) * min(0.6829 / max(sRem, 1e-3), 2.4);
  // Thin towards the rim of the lobe: a leaf mass has no hard edge, and a
  // uniform cut just gives a solid ball with freckles.
  float edge = smoothstep(0.34, 0.98, LEAF_EDGE);
  float t = LEAF_BASE + LEAF_RIM * edge;
  // Four and a half pixels of margin inside the cut, wherever it lands.
  //
  // A discard is binary and the pixel it lands in is not: the true answer at
  // a silhouette is part leaf and part whatever is behind, and with six
  // hundred crowns overlapping there is no honest way to composite that
  // order-independently here. What there is, is the fact that the part-leaf
  // pixel is *brighter* — the margin of a canopy is thin, backlit and
  // transmitting, which the photograph measures directly at (92, 77, 45)
  // against (61, 55, 45) for the mass behind it. So the pixels just inside
  // the cut are lifted instead of composited, and because the width comes
  // from fwidth it is the same few pixels at 20 m and at 290 m. Without it
  // the whole vista reads as torn paper: every edge in the band is a razor,
  // which is the one thing no photograph of foliage has.
  float fw = max(fwidth(v), 1e-5);
  if (v < t) discard;
  leafFringe = smoothstep(0.0, 4.5 * fw, v - t);
  // Clump shading, on its own wavelength rather than the cut's.
  //
  // Inside a lobe the old shader had exactly one colour, so a crown filling
  // 300 px of the rear frame was 300 px of flat brown: all the detail it had
  // was in the discard, which is to say at the silhouette. A plane's canopy
  // is clumped at roughly half a metre, which is 19 px at the vista's range
  // and 35 px at the near row's, so this is a *world* frequency and not a
  // multiple of the cut's — the cut's wavelength is set by what it has to
  // close and is far too fine to read as leaves.
  float sa = smoothstep(1.0, 2.5, 1.0 / max(1.8 * px, 1e-6));
  leafClump = (0.62 * mix(0.5, leafNoise(vLeafPos * 1.8 + 57.0), sa)
             + 0.38 * n2 - 0.5) / ${LEAF_SIGMA};
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

  /** Shared by the near crowns and the vista — see `LEAF_SKY_VIS`. */
  const canopySky = {
    uSkyOcc: { value: 1.0 },
    // Set where the band's mean holds: at `front` p50 moves 79.2 -> 77.5 and
    // at `front3q` 90.4 -> 91.3, so the pair is level-neutral across the two
    // poses and buys its spread rather than borrowing it from the exposure.
    uSkyGain: { value: 3.3 },
    /**
     * Diagnostic only, and inert at 1.
     *
     * With this at 0 and the pair above at 1 / 0, a crown emits nothing at
     * all, which is how the ceiling in `LEAF_SKY_VIS` was measured. Keep it:
     * it is the only way to ask "how much of this band is the trees?" without
     * a rebuild, and the answer turned out to be 14 of 79 levels.
     */
    uSpecScale: { value: 1 },
  };

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
  const colourCut = (freq: string, base: string, rim: string, struct: string) =>
    (shader: THREE.WebGLProgramParametersWithUniforms): void => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLeafPos;\nvarying float vLeafUp;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
vLeafPos = (instanceMatrix * vec4(position, 1.0)).xyz;
vLeafUp = normalize((modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz).y;
#else
vLeafPos = position;
vLeafUp = normalize((modelMatrix * vec4(normal, 0.0)).xyz).y;
#endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vLeafPos;\nvarying float vLeafUp;\n`
          + `uniform float uSkyOcc;\nuniform float uSkyGain;\nuniform float uSpecScale;\n${LEAF_NOISE}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n${LEAF_CUT_VISIBLE}\n${LEAF_SKY_VIS}`,
        )
        // After `<color_fragment>`, so the clump term modulates the instance
        // tint the sun direction already chose rather than replacing it.
        .replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>\n${LEAF_SHADE}`.replace('LEAF_STRUCT', struct),
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>\n${LEAF_SELF_OCCLUSION}`,
        )
        // The lobe's own silhouette: the interpolated view normal's lateral
        // component, which is one at the rim and zero facing the camera.
        .replace('LEAF_EDGE', 'length(vNormal.xy) / max(length(vNormal), 1e-3)')
        .replace(/LEAF_FREQ/g, freq)
        .replace('LEAF_BASE', base)
        .replace('LEAF_RIM', rim);
      Object.assign(shader.uniforms, canopySky);
    };
  crownMat.onBeforeCompile = colourCut('1.0', '0.40', '0.26', '1.0');
  crownMat.customProgramCacheKey = () => 'audi-canopy-v7';

  /**
   * The same cut for the vista, at a quarter of the wavelength and a sixth of
   * the discard — and both numbers are set by the lens rather than by taste.
   *
   * The near planting's cut is a 0.31 m wavelength discarding about half of
   * what it covers, which is right at 20–70 m. At 250 m through the 200 mm
   * `rear` pose it is not: 0.31 m subtends 0.069°, that pose resolves 155 px
   * a degree, so every hole arrives 11 px across and half the mass is hole.
   * What lands is black lace over a bright sky — the same "reads as printed
   * pattern" `CRITIQUE-3` filed against the backdrop's block motif, and
   * measurably the wrong thing: the photograph's mid-distance tree mass is
   * dense and soft, because at that range the leaves and the sky between them
   * have already averaged into one tone.
   *
   * That was answered first with 2.6x the frequency and a base of 0.16, and
   * the frequency went the wrong way. At 0.16 the core is 2.7 standard
   * deviations under the noise's mean, so it is 99.6 % closed — every hole
   * in the vista came from the rim term alone, and the result is exactly
   * what the `rear` pose showed: a flat solid lobe with a 4 px speckled
   * fringe round it. Finer is not denser. It is the same openness at a scale
   * the eye reads as grain.
   *
   * So the frequency comes down to 0.9 — an 11 px wavelength at the `rear`
   * pose, 12 cm of leaf clump at 260 m, which is about the scale a canopy
   * does break up at — while the density stays where it was. 0.20 is 1 %
   * open through the core against the near row's 0.40, which is 21 %, and
   * that is the right relation: a sight line into the vista crosses three
   * staggered ranks and a thicket, and one into the kerbside row crosses a
   * single tree.
   *
   * Swept at 0.32 / 0.26 / 0.20 against both poses that see this bank, and
   * the two agree, which is the useful part — a more open vista lights the
   * `rear` band up (blown-sky share 22.6 / 16.7 / 11.9 %) and lights the
   * windscreen up with it, because the transmitted image is the same bank
   * seen from the other end (patch mean 98.9 / 96.6 / 92.7 and its 176-plus
   * population 5.4 / 4.3 / 1.8 %). 0.20 is the best of the three on both,
   * and on the second it is better than what it replaces, which read 97.0
   * and 3.2 %.
   *
   * The rim stays high at 0.30 — the ragged silhouette is most of what this
   * cut is being asked for at this distance and a solid lobe cannot give it
   * — but below the 0.42 it had, because with real amplitude back in the
   * field the rim no longer has to carry the whole job alone.
   */
  const vistaMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true,
  });
  vistaMat.onBeforeCompile = colourCut('0.9', '0.20', '0.38', '1.2');
  vistaMat.customProgramCacheKey = () => 'audi-vista-v5';

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
  /**
   * What the canopy holds back, and at what grain.
   *
   * `uLeafFreq` is in multiples of the colour pass's own 0.31 m wavelength.
   * 15.0 puts the holes at about 2 cm on the crown, which the sun's 5:1
   * projection at 11.5° stretches to 2 x 10 cm on the ground — at or below
   * the 7.8 mm shadow texel over most of it, which is the condition for the
   * PCF kernel to average them into a level instead of printing them. Below
   * about 8 the features outrun the kernel and the result is camouflage.
   *
   * `uLeafBase` is the level the three-octave noise has to clear to write
   * depth at all, so it sets the transmission: the noise is concentrated
   * about 0.5, so 0.5 is roughly half-open, and every 0.05 above that is
   * worth about a tenth of the sun. `uLeafRim` grades that threshold up
   * towards the rim of each lobe, so a crown thins at its margins instead of
   * ending — which is the *only* thing giving the band's edge a penumbra
   * wider than one shadow texel, and 0.26 is the figure the visible cut
   * already uses for the same reason.
   *
   * 0.56 / 0.26, and this pair is the round's one tuned number. Swept in
   * eight steps against the photograph on `photomatch`, holding everything
   * else, reading the tone-profile gate and the colour witnesses together:
   *
   *     base/rim   tone   bumper   dRGB   plate   road mid
   *     off        14.6    87.3    53.5    224    2.19 / 11.7 %
   *     0.64/0.15  16.2    80.6    44.2    210    2.16 / 12.0 %
   *     0.56/0.26  15.6    73.2    36.6    202    2.15 / 12.3 %
   *     0.56/0.15  22.1    63.4    25.4    193    2.10 / 12.8 %
   *     0.50/0.15  29.3    51.5    17.9    180    2.08 / 13.8 %
   *     photograph    —    74.8       —    235    2.23 /  9.6 %
   *
   * The bumper lands on the photograph's number to a level and a half, and it
   * is the last setting that does so without the tone profile going. Deeper
   * shade keeps improving the paint's colour all the way down — dRGB 36.6 to
   * 17.9 — and that is real, but it is buying it with the whole histogram:
   * see the note in `Environment.ts` on what the bright end cannot do.
   */
  /**
   * …and why none of the three above could ever have done it on its own.
   *
   * `uLeafBase` is a **scalar attenuation**. The cut it thresholds is finer
   * than the shadow texel by design — that is the paragraph above — so the
   * PCF kernel averages every hole away and what lands on the car is a
   * *level*. Swept, that level has no useful middle: 0.72 is no shade at all,
   * 0.44 is full shade with a quarter of the car below level 40 against the
   * photograph's 11.5 %, and nothing in between is a canopy. The only thing
   * moving is the mean.
   *
   * A canopy is not a mean. It is deep cores with open holes, and the car in
   * the reference photograph is standing in a core while the pavement twenty
   * metres away is flecked with sun — both in the same frame, which is what
   * settles it.
   *
   * So the threshold becomes a field, and three things about that field are
   * the whole of this round.
   *
   * **It is evaluated in the ground's frame, not the crown's.** The obvious
   * version perturbs the threshold by the crown's own world position, and it
   * measurably does not work: five ranks of planting stand between the sun
   * and this road, each carries its own independent field, and a ray reaching
   * the car crosses all five. Independent fields multiply, and a product of
   * five bimodal fields is a blanket again — darker, but with no holes in it.
   * Projecting each fragment down its own shadow ray to `y = 0` first makes
   * every rank agree about where the holes are, which is a simplification of
   * a real grove and the only version that produces a pattern rather than an
   * average.
   *
   * **The amplitude has to reach both ends.** `uGapDepth` is the field's
   * half-amplitude in `uLeafBase`'s own units, so 0 reproduces the old
   * behaviour exactly. It has to be big enough that the open end stops
   * writing depth altogether — the three-octave noise is concentrated at
   * 0.5 with sd 0.185, so a threshold past about 1.05 is never cleared — and
   * that the shut end writes it everywhere, rim included. It saturates: by
   * 0.30 the open end already clears the noise at 0.86 + the rim, which over
   * the ten-odd shells a ray crosses is sun, and the shut end is solid.
   * 0.35 is just past that knee, and 0.35 / 0.45 / 0.60 read the same gate
   * to a tenth. **0.15 does not**, and that is the trap the previous attempt
   * fell into: it darkens the cores without opening the holes, which is a
   * worse blanket.
   *
   * **The mean is untouched.** `g` is symmetric about 0.5, so a third of the
   * ground is open, a third is solid and a third carries exactly the cut the
   * paragraph above calibrated. Mean transmission over the band stays at the
   * swept 0.5; only the variance moves, which is the whole intent.
   *
   * `uGapFreq` is in cycles per metre *across* the sun's bearing, and it is
   * the one number here that wants reasoning about rather than sweeping.
   * 0.30 is a 3.3 m wavelength across the bearing and, after the 5:1 stretch
   * along it, 16 m — a streak wide enough to hold the car and short enough
   * that the same frame still has sunflecks in it.
   *
   * All of them are uniforms rather than substituted constants, for the same
   * reason the three above are: they sweep through `__AUDI_ENV.cut` without
   * a shader recompile.
   */
  const depthCut = {
    uLeafFreq: { value: 15.0 },
    uLeafBase: { value: 0.56 },
    uLeafRim: { value: 0.26 },
    uGapFreq: { value: 0.30 },
    uGapDepth: { value: 0.35 },
    /** Horizontal unit vector *towards* the sun, and tan of its elevation. */
    uSunGround: { value: new THREE.Vector2(0, 1) },
    uTanElev: { value: 1 },
    /**
     * The core, in metres, as an ellipse in the sun's frame. The car's own
     * shadow intercepts run from the origin to 7.2 m down-sun of it at this
     * elevation, so the centre sits half that back along the bearing and the
     * semi-axis along it covers the rest with margin.
     */
    uCoreAt: { value: new THREE.Vector2(0, 0) },
    uCoreAcross: { value: 3.0 },
    uCoreAlong: { value: 5.5 },
    uCoreSoft: { value: 0.9 },
    /**
     * Which of the two cuts below runs. 1 is the cheap one and is shipped;
     * 0 restores the five-octave cut exactly. See `LEAF_CUT`.
     *
     * A uniform rather than two programs because the point was to measure the
     * difference inside one boot: this layer is the single most expensive
     * thing in the frame and a two-build A/B on this machine is worthless.
     * Verified that way — 0 and 1 scored dRGB 7.5, tone 16.0, below-40 8.3 %,
     * above-224 6.8 % and car mask 16.0 % in the same boot, with the near
     * road's mean and texture identical to two decimals at every pose.
     */
    uCheapCut: { value: 1 },
  };

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
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vLeafPos;\nvarying vec3 vLeafN;\n`
        + `uniform float uLeafFreq;\nuniform float uLeafBase;\nuniform float uLeafRim;\n`
        + `uniform float uGapFreq;\nuniform float uGapDepth;\n`
        + `uniform vec2 uSunGround;\nuniform float uTanElev;\n`
        + `uniform vec2 uCoreAt;\nuniform float uCoreAcross;\nuniform float uCoreAlong;\n`
        + `uniform float uCoreSoft;\nuniform float uCheapCut;\n${LEAF_NOISE}`,
      )
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${LEAF_CUT}`)
      .replace('LEAF_EDGE', 'length(vLeafN.xy) / max(length(vLeafN), 1e-3)')
      // Uniforms rather than substituted constants, because these three are
      // the only handle there is on what a canopy shadow *is* — how much of
      // the sun it holds back and at what grain — and the answer is not the
      // same for a rank sixty metres up-sun of the subject as for the row
      // behind the camera. They are also the only way to sweep the setting
      // without a shader recompile per step, which is how the numbers below
      // were arrived at.
      //
      // The crowns that shade the car stand fifty to seventy metres up-sun.
      // The sun's disc subtends 0.53°, so its penumbra at that range is half a
      // metre: what actually reaches the car is not shadow-or-sun but a
      // *partially transmitting* shade, the gaps averaged away. A depth map is
      // binary and `PCFSoftShadowMap` blurs over a fixed ±2 texels, so the
      // only way it can express a partial transmission is to put the holes
      // *below* the blur kernel and let the kernel average them.
      //
      // 2.4 did not do that. A 0.31 m base wavelength at 2.4x is 13 cm on the
      // crown, and the sun's 5:1 projection at this elevation drags it to a
      // quarter of a metre on the ground — twenty times the 7.8 mm texel and
      // eight times the kernel, so nothing averaged anything and what landed
      // on the car was quarter-metre blotches. Measured against the same frame
      // with the planting's `castShadow` off, that is exactly the defect
      // `CRITIQUE-3` calls dapple on the car: the whole grove was taking 14 %
      // off the front bumper and taking it off in patches. Measured across
      // the bumper face, the residual after a running-mean detrend falls from
      // 12.1 % at 2.4 to 0.9 % at 15, against the photograph's 4.7 % — the
      // 7.3x over-modulation that review found is gone, and slightly past
      // gone. What is left of the photograph's 4.7 % is film grain and real
      // surface, neither of which belongs in a shadow map.
      .replace(/LEAF_FREQ/g, 'uLeafFreq')
      .replace(/LEAF_BASE/g, 'uLeafBase')
      .replace(/LEAF_RIM/g, 'uLeafRim');
    Object.assign(shader.uniforms, depthCut);
  };
  crownDepthMat.customProgramCacheKey = () => 'audi-canopy-depth-vE';

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: true,
  });
  trunkMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBarkPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vBarkPos = (instanceMatrix * vec4(position, 1.0)).xyz;
#else
vBarkPos = position;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBarkPos;\n${LEAF_NOISE}`)
      // After the instance tint, so the plates redivide the colour the bark
      // tone already chose rather than replacing it.
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>\n${BARK_PLATES}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\n${BARK_SELF_OCCLUSION}`,
      );
  };
  trunkMat.customProgramCacheKey = () => 'audi-bark-v1';
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
  // **The two rows are not mirror images, because the car is at the near
  // kerb.** The row on the planted side stands in the grass tree-lawn that
  // `ground.ts` now puts 1.5–4.5 m off the car's flank, not seventeen metres
  // out; the row on the far side is across the carriageway, beyond the far
  // verge at 15.4, which is where both of them used to be. With both at ±20
  // the planting was on neither kerb and the photograph's nearest trunk — a
  // plane two metres behind the couple — had nothing standing for it.
  //
  // The clearance shrinks with the row. Forty metres was set to stop a tree
  // at 20 m filling a quarter of the sky behind the roof; at 3.4 m out the
  // same subtense is reached at about fourteen, and the trunks then land in
  // the frame's left margin rather than behind the car, which is where the
  // photograph has them.
  for (let side = -1; side <= 1; side += 2) {
    const nearRow = side < 0;
    let z = -210 + (side > 0 ? 8 : 0);
    while (z < 210) {
      const clear = nearRow ? (z < -14 || z > 19) : (z < -40 || z > 46);
      if (clear) plant(side, z, nearRow ? 2.9 : 20, nearRow ? 1.5 : 5.5, 10.5, 16.5);
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

  /**
   * The rank of the grove that actually shades the car — and where it stands
   * is worked out from the sun, not from the seed.
   *
   * Everything above is planted at build time in world space, so whether
   * anything at all occupies the corridor that shadows a car at the origin is
   * a dice roll on `mulberry(0x5000a4d1)`. Measured by A/B against the same
   * frame with the planting's `castShadow` off, that roll came up nearly no:
   * the whole grove was taking 14 % off the front bumper, in quarter-metre
   * patches. A car is either under the trees or it is not, and which of those
   * it is should not depend on a hash.
   *
   * At 11.5° of solar elevation a crown whose centre is y metres up throws
   * its shadow y / tan(elev) ≈ 4.9 y metres down-sun of itself, so the rank
   * that shades the origin is a specific fifty-to-seventy-metre arc of the
   * grove — around x −48, z +34 for this sun, which is inside the grove's own
   * footprint and reads as more of it.
   *
   * **It has to be a band and not a blanket, and that is the whole finding of
   * this round.** Six trees on three columns at a 7.5 m pitch was the previous
   * shape, and with a 4–7 m crown radius it closed up into thirty-six metres
   * of solid shade across the sun — which at this pose is every pixel of road
   * in frame. Measured, that took the tone profile from 15.1 to 32.2, the
   * licence plate from 226 to 181 against the photograph's 236, and the car's
   * own cast shadow to nothing at all, because a shadow laid into shade has
   * no contrast to show. The photograph is explicit that this is wrong: it has
   * the car in shade *and* sunflecks on pavement twenty metres away in the
   * same frame, so the shadow it stands in has a visible edge.
   *
   * So: a single row of three across the sun, pitch 6.4 m, which with the
   * crowns' own radius gives a core about fourteen metres wide and a soft
   * margin either side. One rank rather than two, because the 5:1 projection
   * at this elevation smears a single crown thirty metres down-sun and a
   * second rank only adds opacity — which is `uLeafBase`'s job, where it can
   * be measured.
   */
  const shadeFrom = trees.length;
  const shadeTargets: Array<[number, number]> = [];
  /** Half-extent of the rank's own trunk positions across the sun, metres. */
  let shadeSpanAcross = 0;
  /** Crown radius and centroid height of the tallest of them. */
  let shadeCrownR = 0;
  let shadeCrownY = 0;
  for (const u of [-6.4, 0, 6.4]) {
    const h = 13.5 + rnd() * 4.5;
    const bole = h * (0.40 + rnd() * 0.10);
    const r = h * (0.30 + rnd() * 0.09);
    trees.push({
      // Placed in `apply`, from the sun. Planted at the origin here so the
      // instance matrices carry the tree's own internal offsets and nothing
      // else, and `apply` only has to add a translation.
      x: 0,
      z: 0,
      h,
      bole,
      r,
      lean: (rnd() - 0.5) * 0.14,
      bark: rnd(),
    });
    const ju = u + (rnd() - 0.5) * 2.2;
    shadeTargets.push([ju, (rnd() - 0.5) * 5]);
    shadeSpanAcross = Math.max(shadeSpanAcross, Math.abs(ju));
    shadeCrownR = Math.max(shadeCrownR, r);
    shadeCrownY = Math.max(shadeCrownY, bole + (h - bole) * 0.55);
  }
  const SHADE_COUNT = trees.length - shadeFrom;

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

  /**
   * The shading rank's instance translations as composed above — i.e. each
   * part's offset within its own tree, the tree itself still at the origin.
   * `placeShadeRank` adds the up-sun translation to these rather than
   * accumulating on the live matrices, which would drift every time the
   * preset changed.
   */
  const shadeBase = {
    crowns: new Float32Array(SHADE_COUNT * LOBES * 3),
    trunks: new Float32Array(SHADE_COUNT * 3),
    branches: new Float32Array(SHADE_COUNT * BRANCHES * 3),
  };
  const snapshot = (mesh: THREE.InstancedMesh, from: number, n: number, out: Float32Array): void => {
    for (let j = 0; j < n; j++) {
      const e = (from + j) * 16;
      out[j * 3] = mesh.instanceMatrix.array[e + 12];
      out[j * 3 + 1] = mesh.instanceMatrix.array[e + 13];
      out[j * 3 + 2] = mesh.instanceMatrix.array[e + 14];
    }
  };
  snapshot(crowns, shadeFrom * LOBES, SHADE_COUNT * LOBES, shadeBase.crowns);
  snapshot(trunks, shadeFrom, SHADE_COUNT, shadeBase.trunks);
  snapshot(branches, shadeFrom * BRANCHES, SHADE_COUNT * BRANCHES, shadeBase.branches);

  /**
   * Stand the rank up-sun of the origin, or park it out of the world.
   *
   * `on` is false wherever an up-sun rank is not what the preset is
   * describing, and the gate is the arithmetic itself rather than a taste
   * call: at noon 4.9 y metres down-sun is four metres, so the tree that
   * shades the car would be standing in the middle of the road. Parked trees
   * go 500 m down, under a four-kilometre ground plane, which is cheaper than
   * rebuilding the instance buffers and leaves the counts alone.
   *
   * `spread` scales the row's pitch across the sun, so the width of the band
   * can be swept without a rebuild — see `__AUDI_ENV.band`.
   */
  let shadeSpread = 1;
  /** tan(solar elevation) the rank was last placed for. */
  let shadeTanElev = 1;
  /** Where `placeShadeRank` last stood each of the rank's trees, in x,z. */
  const shadeOffset = new Float32Array(SHADE_COUNT * 2);
  const placeShadeRank = (sunDir: THREE.Vector3, on: boolean): void => {
    const az = Math.hypot(sunDir.x, sunDir.z) || 1e-3;
    const sx = sunDir.x / az;
    const sz = sunDir.z / az;
    const tanElev = sunDir.y / az;
    shadeTanElev = tanElev;
    const move = (
      mesh: THREE.InstancedMesh, from: number, per: number, base: Float32Array,
    ): void => {
      for (let i = 0; i < SHADE_COUNT; i++) {
        const t = trees[shadeFrom + i];
        const [u, v] = shadeTargets[i];
        // The crown's own centroid height is what decides how far up-sun it
        // has to stand: the bole casts nothing that matters.
        const yCrown = t.bole + (t.h - t.bole) * 0.55;
        const run = on ? yCrown / Math.max(tanElev, 1e-3) : 0;
        const us = u * shadeSpread;
        const ox = on ? -sz * us + sx * (v + run) : 0;
        const oz = on ? sx * us + sz * (v + run) : 0;
        shadeOffset[i * 2] = ox;
        shadeOffset[i * 2 + 1] = on ? oz : 1e4;
        for (let j = 0; j < per; j++) {
          const k = i * per + j;
          const e = (from + k) * 16;
          mesh.instanceMatrix.array[e + 12] = base[k * 3] + ox;
          mesh.instanceMatrix.array[e + 13] = base[k * 3 + 1] + (on ? 0 : -500);
          mesh.instanceMatrix.array[e + 14] = base[k * 3 + 2] + oz;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    move(crowns, shadeFrom * LOBES, LOBES, shadeBase.crowns);
    move(trunks, shadeFrom, 1, shadeBase.trunks);
    move(branches, shadeFrom * BRANCHES, BRANCHES, shadeBase.branches);
  };

  /**
   * Point the dapple's frame at the sun and stand its core over the subject.
   *
   * Gated on the same test as the rank, and it has to be: the depth cut is
   * one material shared by every crown in the scene, so a core left standing
   * would put the car in solid shade under `noon` and `overcast` as well,
   * where there is no up-sun rank and nothing that should be shading it.
   * Parked by moving the core's centre out of the world rather than by a
   * switch, so the shader keeps one code path.
   *
   * The height is the car's, not a crown's: what has to be covered is the
   * *span of shadow intercepts* the subject occupies, which runs from its own
   * footprint to `roof / tan(elev)` down-sun of it — 7.2 m at 11.5°, against
   * a car 4.8 m long. Sizing the core to the plan view leaves the roof, the
   * screen header and the top of the bonnet in the sun.
   */
  const SUBJECT_TOP = 1.48;
  const placeDappleCore = (sunDir: THREE.Vector3, on: boolean): void => {
    const az = Math.hypot(sunDir.x, sunDir.z) || 1e-3;
    const tanElev = Math.max(sunDir.y / az, 1e-3);
    depthCut.uSunGround.value.set(sunDir.x / az, sunDir.z / az);
    depthCut.uTanElev.value = tanElev;
    const back = on ? (SUBJECT_TOP / tanElev) * 0.5 : -1e5;
    depthCut.uCoreAt.value.set(
      -depthCut.uSunGround.value.x * back,
      -depthCut.uSunGround.value.y * back,
    );
  };
  placeShadeRank(new THREE.Vector3(0, 1, 0), false);
  placeDappleCore(new THREE.Vector3(0, 1, 0), false);

  /**
   * How much of the sun reaches each tree's bole — and this is the term that
   * had been missing, with the bark's own reflectance standing in for it.
   *
   * The trunks do not `receiveShadow`, and they cannot usefully: the sun's
   * frustum is 60 m across, sized for the car and the rank that shades it,
   * and every trunk in frame at `photomatch` stands 45 m or more down the
   * boulevard, outside it. So each trunk was receiving the *whole* sun, and
   * the only thing keeping the colonnade from reading as a row of glowing
   * poles was a reflectance of 0.024 — a tenth of what plane bark actually
   * is. That is the crowns' fault one level up: a shading term written into
   * the albedo, where it cannot respond to anything.
   *
   * The grove is five ranks deep and its own geometry answers the question,
   * so this marches the real ray. From a point on each bole, towards the sun,
   * against every other tree's crown as one flattened ellipsoid; each crown
   * crossed transmits what the canopy's own cut transmits, weighted by how
   * near the ray passes to its centre. O(n^2) over a few hundred trees, run
   * once per preset change, not per frame.
   */
  const boleSun = new Float32Array(trees.length);
  /**
   * What one crown lets through. The shadow pass's cut writes depth wherever
   * its three-octave noise clears 0.56, and that noise has sd 0.185 about a
   * mean of 0.5, so a ray through the middle of a crown finds it about 37 %
   * open. Not a tuning constant: change `uLeafBase` and this follows it.
   */
  const CROWN_TRANSMIT = 0.37;
  const computeBoleSun = (sunDir: THREE.Vector3): void => {
    const sx = sunDir.x, sy = Math.max(sunDir.y, 1e-3), sz = sunDir.z;
    const ex = (i: number): number =>
      (i >= shadeFrom ? shadeOffset[(i - shadeFrom) * 2] : 0) + trees[i].x;
    const ez = (i: number): number =>
      (i >= shadeFrom ? shadeOffset[(i - shadeFrom) * 2 + 1] : 0) + trees[i].z;
    for (let i = 0; i < trees.length; i++) {
      const ti = trees[i];
      // Two thirds up the bole: the bottom of a trunk is in everything's
      // shadow and the top is in none, and one sample has to stand for both.
      const px = ex(i), py = ti.bole * 0.62, pz = ez(i);
      let transmit = 1;
      // Its own crown counts, and has to: at noon the ray leaves the bole
      // almost straight up and the only thing over it is its own canopy.
      for (let j = 0; j < trees.length && transmit > 0.02; j++) {
        const tj = trees[j];
        const hy = (tj.h - tj.bole) * 0.5;
        const cy = tj.bole + hy * 1.15;
        // Ray against the crown as one flattened ellipsoid, in the space
        // where that ellipsoid is a unit sphere. Testing it at the crown's
        // centre *height* instead — which is the obvious shortcut and was the
        // first thing tried — samples one horizontal slice out of a body
        // seven metres deep, and at 11.5° of solar elevation that slice sits
        // 34 m up-sun of the bole: a lattice question, answered no almost
        // every time. It reported 110 of 126 boles in full sun.
        const ux = (px - ex(j)) / tj.r;
        const uy = (py - cy) / hy;
        const uz = (pz - ez(j)) / tj.r;
        const vx = sx / tj.r, vy = sy / hy, vz = sz / tj.r;
        const vv = vx * vx + vy * vy + vz * vz;
        const uv = ux * vx + uy * vy + uz * vz;
        const disc = uv * uv - vv * (ux * ux + uy * uy + uz * uz - 1);
        if (disc <= 0) continue;
        const sq = Math.sqrt(disc);
        if ((-uv + sq) / vv <= 0) continue;                 // crown is behind
        // The chord, as a fraction of the longest one through this crown: a
        // ray clipping the rim crosses almost no canopy, one through the
        // middle crosses all of it.
        transmit *= 1 - (1 - CROWN_TRANSMIT) * Math.min(sq / Math.sqrt(vv), 1);
      }
      boleSun[i] = transmit;
    }
  };

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

  /**
   * The vista — what closes the boulevard, and why two rows beside it cannot.
   *
   * Rows of street trees flank a sight line; they never close one that runs
   * *along* the road. Measured through `fixedGlassOuter` on the photomatch
   * pose, the rays that leave the backlight run within 6.7° of dead astern at
   * an elevation of 0.0–2.3°: 1.4 m up at 200 m, 5 m up at 300. They pass
   * under every crown in the scene — a bole is 4–9 m — between the boles, and
   * out of the far end of a planting that stopped at z ±210. Fourteen per
   * cent of the windscreen was `env:skyDome` at level 184 with 77 % of it
   * above 176: bare horizon haze, seen straight through the cabin.
   *
   * The photograph has no bare horizon anywhere in frame. White-balanced, the
   * band just above the skyline reads 77–122 behind the car and 77–106 across
   * the far carriageway, against this render's flat 202–213. A hundred
   * levels, and it is a hole in the world rather than a lighting error: the
   * IBL is baked from its own proxy scene and there is no screen-space
   * reflection, so the only way any of this reaches the car is the
   * transmission pass — which is exactly where the defect was found.
   *
   * Three parts, because the band has three causes:
   *
   *   · **The end banks**, 214–262 m out. The Parkway is closed at both ends
   *     — Eakins Oval one way, Logan Circle and the city the other. Three
   *     staggered rows rather than one, because a 9 m crown at any pitch that
   *     reads as a street planting leaves sky between the crowns, and down a
   *     corridor every gap in a single row lines up with the eye.
   *   · **The thicket at their foot.** This is the part that actually answers
   *     the measurement. A crown that begins at a 6 m bole is *above* every
   *     ray in the cone; what stops a ray 1.4 m off the ground at 200 m is
   *     understory, so the banks stand in 4.4–8.8 m of scrub, in two lines so
   *     the gaps in one are covered by the other. The first attempt topped
   *     the scrub out at 6.8 m and dropped the sky share from 14.4 % to
   *     3.3 % — and the 3.3 % that survived came back at an elevation of
   *     0.93–1.15° on the nose, i.e. through the slot between the top of the
   *     scrub and the bottom of the boles behind it. The boles came down to
   *     match rather than the scrub going up alone, because a 9 m shrub is a
   *     tree.
   *   · **The understory behind each kerb**, which is where the photograph
   *     puts its dark mass: outboard of the street trees on the far side,
   *     so the far carriageway, its kerb and its grass strip all stay
   *     visible in front of it — they are plainly visible in the frame — and
   *     at the far edge of the lawn on the park side, where the same frame
   *     shows the ground line closed by scrub and low buildings with the
   *     trunks standing clear in front of it. Not one symmetrical hedge:
   *     the two sides of this boulevard do not look alike.
   *
   * None of it casts or receives: it is 200 m outside a shadow frustum that
   * reaches 90 m up-sun, so a depth pass over it would write nothing and cost
   * a draw. It is also on its own random stream — consuming `rnd()` here
   * would re-roll the shading rank planted above it, and that rank's cast
   * shadow is calibrated against the photograph's sun/shade spread.
   */
  const farRnd = mulberry(0x5000fa72);
  const FAR_LOBES = 6;
  const THICKET_LOBES = 3;
  const farPos: number[] = [];
  const farScl: number[] = [];
  const farDir: number[] = [];
  const farJit: number[] = [];
  /** x, z, height, bole, girth-per-metre, bark tone. */
  const farTrunk: Array<[number, number, number, number, number, number]> = [];

  const farLobe = (
    px: number, py: number, pz: number,
    sx: number, sy: number, sz: number, dx: number, dz: number, jit: number,
  ): void => {
    farPos.push(px, py, pz);
    farScl.push(sx, sy, sz);
    const inv = 1 / Math.max(Math.hypot(dx, dz), 1e-3);
    farDir.push(dx * inv, dz * inv);
    farJit.push(jit);
  };

  const farTree = (x: number, z: number, h: number): void => {
    const bole = h * (0.26 + farRnd() * 0.14);
    const r = h * (0.28 + farRnd() * 0.10);
    const bark = farRnd();
    farTrunk.push([x, z, h, bole, 0.024 + 0.010 * bark, bark]);
    const crownH = h - bole;
    for (let b = 0; b < FAR_LOBES; b++) {
      const a = (b / FAR_LOBES) * Math.PI * 2 + farRnd() * 1.6;
      const rad = r * (0.30 + 0.70 * farRnd());
      const fy = 0.16 + 0.84 * farRnd();
      const dx = Math.cos(a) * rad * (1.0 - 0.45 * fy);
      const dz = Math.sin(a) * rad * (1.0 - 0.45 * fy);
      // Six lobes where the near trees carry twenty, so each one is bigger:
      // at 230 m the mass is what reads and the lobe count is not resolvable.
      // Bigger again than they were, because a ring of six balls at 0.42–0.70
      // of the crown radius leaves sky between them, and against a 213-level
      // sky every one of those gaps is a hole in the tree line. The
      // photograph's canopy at this range is 85–90 % closed with the sky
      // coming through as sparkles.
      const rr = r * (0.56 + 0.30 * farRnd());
      farLobe(x + dx, bole + crownH * fy, z + dz, rr, rr * 0.78, rr * 0.96, dx, dz,
        0.80 + farRnd() * 0.40);
    }
  };

  /** Scrub: a mass that reaches the ground, which is the whole point of it. */
  const farThicket = (x: number, z: number, r: number, h: number): void => {
    for (let b = 0; b < THICKET_LOBES; b++) {
      const a = farRnd() * Math.PI * 2;
      const rad = r * 0.5 * farRnd();
      const dx = Math.cos(a) * rad;
      const dz = Math.sin(a) * rad;
      const rr = r * (0.60 + 0.32 * farRnd());
      farLobe(x + dx, h * 0.45, z + dz, rr, h * 0.52, rr, dx, dz, 0.70 + farRnd() * 0.38);
    }
  };

  /**
   * A bank: staggered tree rows with scrub at their foot. `u` runs along it,
   * `v` outward from the subject, so the same builder lays the two ends of
   * the boulevard and the park's far boundary.
   */
  const farBank = (
    at: (u: number, v: number) => readonly [number, number],
    uFrom: number, uTo: number, rows: number, scrub: readonly number[],
  ): void => {
    for (let row = 0; row < rows; row++) {
      let u = uFrom + farRnd() * 10;
      while (u < uTo) {
        const [x, z] = at(u, 12 + row * 24 + (farRnd() - 0.5) * 12);
        farTree(x, z, 12.5 + farRnd() * 7.5);
        u += 15 + farRnd() * 9;
      }
    }
    for (const v of scrub) {
      let u = uFrom - 6;
      while (u < uTo + 6) {
        const [x, z] = at(u, v + farRnd() * 9);
        farThicket(x, z, 3.6 + farRnd() * 2.6, 5.0 + farRnd() * 4.6);
        u += 5.5 + farRnd() * 3.5;
      }
    }
  };

  // The two ends, at x ±142 because that is what the photomatch frame covers
  // at this depth: a 40 mm lens is ±24°, so its edge at 230 m out is x ∓104.
  //
  // **Three ranks and not four, and the fourth was built and measured.** Dead
  // astern through a 200 mm lens this bank is the whole upper frame, and with
  // three ranks its gaps still line up often enough to leave holes of bare
  // 213-level sky through the tree line; a fourth at 286 m closed them, and
  // it is only 6 k triangles on a mesh that already carries 49 k. It took the
  // `rear` band's blown-sky share from 22.4 % to 16.8 % and its mean from 106
  // to 97, which is the right direction on both.
  //
  // It cost the tone profile 11.4 to 11.7, three runs each way, and the
  // mechanism is not a coincidence: the rays that leave the windscreen do so
  // at 0.0-2.3 deg of elevation, which at 214-286 m is y 1.1-12.6 m, and the
  // `rear` frame's own 2.9 deg half-angle covers y -12 to +13.5 at the same
  // range. **The two poses are looking at the same part of the same bank**,
  // so anything that closes the tree line for one darkens the transmitted
  // image for the other, and the gate's 64-80 bucket is already 16.4 %
  // against the photograph's 11.6 %. There is no height separation to be had
  // and no way to have the density without the transmission.
  farBank((u, v) => [u, -(202 + v)], -142, 142, 3, [0, 28]);
  farBank((u, v) => [u, +(202 + v)], -142, 142, 3, [0, 28]);
  /**
   * A third bank down the park side is **not** here, and it was tried twice.
   *
   * At x −87, just beyond the grove's outermost row, which is where the
   * photograph's left-hand ground line closes: it bought nothing and cost a
   * great deal. A 40 mm lens is ±24°, so the photomatch frame's left edge is
   * only x −89 at 200 m out and x −45 at 100 m — a bank on that bearing is
   * outside the frame at every depth it could stand at, and the left horizon
   * was already being closed by the down-boulevard bank above. Meanwhile the
   * `side` pose stands at x +26 with a 200 mm lens, so it had 8 m lobes at
   * 113 m filling a third of its frame with black blobs behind the car.
   *
   * Moved to x −196 it stops being blobs and becomes a speckle: 0.31 m of
   * leaf-cut wavelength at 235 m is 11 px through a 200 mm lens, and two tree
   * rows of it ran right across the top of that frame, with no aperture on
   * the pose to soften it. Measured on the gate frame, removing it entirely
   * costs **nothing** — it never appeared there.
   *
   * So the park side's ground line is still open in `side` and in orbit. That
   * is the pre-existing state rather than a regression, and closing it wants
   * its own round: it is a question about what a 200 mm lens should find at
   * 250 m, and this cut answers it as noise.
   */
  /**
   * The city side's understory: outboard of the street trees at x 20–25.5, so
   * the far carriageway, its kerb and its grass strip stay in front of it —
   * all three are plainly visible in the photograph, with the dark mass
   * behind them.
   *
   * The gap at |z| < 14 is not scenery. The `side` review pose puts the
   * camera at x +26, z −1.37, which is *inside* this line; a 4.8 m clump
   * landing there swallows the lens, and whether one does is a dice roll on
   * a seed. Nothing in frame at photomatch is nearer than z −60 on this
   * bearing, so the gap costs nothing.
   */
  for (let z = -206; z < 206; z += 6.0 + farRnd() * 4.0) {
    if (Math.abs(z) < 14) continue;
    farThicket(27 + farRnd() * 7, z, 3.0 + farRnd() * 1.8, 3.0 + farRnd() * 2.8);
  }

  const farCount = farJit.length;
  // A 32-triangle lobe where the near planting uses 80. Subdivided once, so
  // `normalizeNormals` still gives it a smooth normal and `LEAF_EDGE` still
  // finds a rim to thin — an unsubdivided icosahedron is 20 triangles but its
  // normals are per-face, which turns the rim thinning into facets. What is
  // left of the polygon silhouette the cut discards anyway. Sharing
  // `crownGeo` instead cost 122 k triangles and three frames a second at
  // `front3q`; this is 49 k and gives them back.
  const vistaGeo = unitColor(new THREE.OctahedronGeometry(1, 1));
  const farCrowns = new THREE.InstancedMesh(vistaGeo, vistaMat, farCount);
  const farTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, farTrunk.length);
  // Named, because an unnamed InstancedMesh comes back from `__AUDI.pick` as
  // `(unnamed)` and the next round has to guess what it just measured.
  farCrowns.name = 'env:vistaCrowns';
  farTrunks.name = 'env:vistaTrunks';
  for (let i = 0; i < farCount; i++) {
    pos.set(farPos[i * 3], farPos[i * 3 + 1], farPos[i * 3 + 2]);
    scl.set(farScl[i * 3], farScl[i * 3 + 1], farScl[i * 3 + 2]);
    q.setFromAxisAngle(spin, farRnd() * 3);
    farCrowns.setMatrixAt(i, m.compose(pos, q, scl));
  }
  farTrunk.forEach(([x, z, h, bole, girth], i) => {
    pos.set(x, bole * 0.5, z);
    scl.set(girth * h, bole, girth * h);
    farTrunks.setMatrixAt(i, m.compose(pos, q.identity(), scl));
  });
  farCrowns.instanceMatrix.needsUpdate = true;
  farTrunks.instanceMatrix.needsUpdate = true;
  farCrowns.instanceColor =
    new THREE.InstancedBufferAttribute(new Float32Array(farCount * 3), 3);
  farTrunks.instanceColor =
    new THREE.InstancedBufferAttribute(new Float32Array(farTrunk.length * 3), 3);

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
  farCrowns.castShadow = false;
  farTrunks.castShadow = false;
  for (const mesh of [crowns, trunks, branches, blockMesh, farCrowns, farTrunks]) {
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // --- measurement levers, all inert at their defaults -----------------------
  //
  // The grove's three casters are 17-19 ms of every frame that rebuilds the
  // shadow map, which while driving is every frame. These split that figure
  // inside one boot, which is the only way it can honestly be split on this
  // machine. `shadowCasters` in `Stage` isolates the grove; these say what
  // *about* the grove costs the time.
  const perf = (globalThis as unknown as {
    __AUDI_PERF?: { register(name: string, fn: (v: number | boolean) => unknown): void };
  }).__AUDI_PERF;
  /** A depth pass with no cut at all: the raster floor under `crownDepthMat`. */
  const plainDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  perf?.register('groveDepthPlain', (v) => {
    crowns.customDepthMaterial = v ? plainDepthMat : crownDepthMat;
    return v ? 'plain' : 'cut';
  });
  perf?.register('groveCheapCut', (v) => {
    depthCut.uCheapCut.value = v ? 1 : 0;
    return depthCut.uCheapCut.value;
  });
  /**
   * The canopy's sky-occlusion strength and its mean-holding gain.
   *
   * Uniforms, so they re-upload — unlike a material property, which is the
   * trap `WORKSTREAM.md` records. `groveSkyOcc` 0 reproduces the build
   * before `LEAF_SKY_VIS` exactly, whatever the gain is, so the sweep has a
   * real null. They are separate levers because the gain that holds the mean
   * is `1 / E[leafSky]` over the *visible* fragments, and that expectation is
   * taken after the cut's discard and weighted by projected area — not a
   * number worth deriving when one boot can measure it.
   */
  perf?.register('groveSkyOcc', (v) => {
    canopySky.uSkyOcc.value = Number(v);
    globalThis.dispatchEvent(new Event('audi:materials-dirty'));
    return canopySky.uSkyOcc.value;
  });
  perf?.register('groveSpecScale', (v) => {
    canopySky.uSpecScale.value = Number(v);
    globalThis.dispatchEvent(new Event('audi:materials-dirty'));
    return canopySky.uSpecScale.value;
  });
  perf?.register('groveSkyGain', (v) => {
    canopySky.uSkyGain.value = Number(v);
    globalThis.dispatchEvent(new Event('audi:materials-dirty'));
    return canopySky.uSkyGain.value;
  });
  /**
   * Fraction of the crown instances drawn, for the overdraw slope only.
   *
   * It truncates, and the shading rank is at the END of the instance list, so
   * anything below 1 takes the car out of the trees' shade. Timing only —
   * never read an image through this.
   */
  perf?.register('groveCrownFrac', (v) => {
    crowns.count = Math.max(1, Math.round(trees.length * LOBES * Number(v)));
    return { count: crowns.count, of: trees.length * LOBES };
  });

  const lit = new THREE.Color();
  const shade = new THREE.Color();
  const mixed = new THREE.Color();
  let shadeRankOn = false;

  return {
    group,
    casterCount: () => ({
      crowns: crowns.count,
      shadeRank: shadeRankOn ? SHADE_COUNT : 0,
      trees: trees.length,
    }),
    setCasting(on) {
      crowns.castShadow = on;
      trunks.castShadow = on;
      branches.castShadow = on;
    },
    setDepthCut(cut) {
      if (cut.freq !== undefined) depthCut.uLeafFreq.value = cut.freq;
      if (cut.base !== undefined) depthCut.uLeafBase.value = cut.base;
      if (cut.rim !== undefined) depthCut.uLeafRim.value = cut.rim;
      if (cut.gapFreq !== undefined) depthCut.uGapFreq.value = cut.gapFreq;
      if (cut.gapDepth !== undefined) depthCut.uGapDepth.value = cut.gapDepth;
      if (cut.coreAcross !== undefined) depthCut.uCoreAcross.value = cut.coreAcross;
      if (cut.coreAlong !== undefined) depthCut.uCoreAlong.value = cut.coreAlong;
      if (cut.coreSoft !== undefined) depthCut.uCoreSoft.value = cut.coreSoft;
      return {
        freq: depthCut.uLeafFreq.value,
        base: depthCut.uLeafBase.value,
        rim: depthCut.uLeafRim.value,
        gapFreq: depthCut.uGapFreq.value,
        gapDepth: depthCut.uGapDepth.value,
        coreAcross: depthCut.uCoreAcross.value,
        coreAlong: depthCut.uCoreAlong.value,
        coreSoft: depthCut.uCoreSoft.value,
      };
    },
    setSpread(s) {
      shadeSpread = s;
      return shadeSpread;
    },
    setVistaVisible(on) {
      farCrowns.visible = on;
      farTrunks.visible = on;
      return on;
    },
    shadeFootprint() {
      if (!shadeRankOn) return null;
      // Across the sun the shadow is as wide as the row plus a crown either
      // side: the projection at a low sun is along the bearing only and does
      // not widen anything.
      const across = shadeSpanAcross * shadeSpread + shadeCrownR;
      // Along it, the crown's own vertical extent is what sets the length —
      // its top edge lands 2r / tan(elev) further down-sun than its bottom
      // edge, and at 11.5° that is the ten metres of crown stretched to fifty.
      // Half of that reaches past the origin, which is the figure the ground
      // needs: beyond it there is no cast shadow and the painted gobo is the
      // only thing that can keep the far carriageway banded.
      const along = shadeCrownR / Math.max(shadeTanElev, 1e-3) + 4;
      return { across, along, height: shadeCrownY };
    },
    apply(preset, sunDir) {
      group.visible = preset.ground !== 'studio';

      // Is the sun low enough that the planting shading this road is up-sun
      // of it rather than on top of it? That is the whole gate, and it is the
      // arithmetic rather than a taste call: at noon 4.9 y metres down-sun is
      // four metres, so the tree that shades the car would be standing in the
      // middle of the road. Only `goldenhour` passes — `noon` and `overcast`
      // are at 70°, `dusk` is below the horizon — which is why the other four
      // frames are untouched by any of this.
      //
      // Deliberately not gated on `canopy`: that number says what is
      // *overhead*, which decides what a bonnet mirrors, and this one says
      // what is up-sun, which decides whether there is a shadow. The
      // photograph is explicit that they are different — the car stands in
      // the planting's shade with open sky and sunlit buildings above and to
      // the right of it — and tying them together makes one untestable
      // without the other.
      shadeRankOn = preset.sunShadow && preset.ground !== 'studio'
        && sunDir.y > 0.06 && sunDir.y < 0.45;
      placeShadeRank(sunDir, shadeRankOn);
      placeDappleCore(sunDir, shadeRankOn);

      // These proxies have no self-shadowing, so a smooth 0.04 dielectric
      // Fresnel over the whole mass was returning the sky at full strength —
      // measured, a trunk with a 0.007 albedo was rendering at level 122,
      // brighter than the lit foliage beside it, because almost none of what
      // it returned was its own colour. A real canopy occludes most of the sky
      // from its own interior; this stands in for that.
      // ⚠ **These three assignments do nothing, and the paragraph above is
      // describing a knob that is not connected.** Three overwrites
      // `envMapIntensity` with `scene.environmentIntensity` in
      // `WebGLRenderer.setProgram` for every standard material whose own
      // `envMap` is null, and none of these materials has one — they read
      // `scene.environment`. So the planting's ambient is `preset.envIntensity`
      // and has been since the IBL was handed to the scene rather than to each
      // material. What is actually holding a trunk down to plausible is
      // `BARK_SELF_OCCLUSION` and `LEAF_SELF_OCCLUSION` above, which are
      // per-fragment and cannot be overwritten.
      //
      // Left in place rather than deleted: they are harmless, and the same
      // trap has now cost two rounds — see the note on `envIntensity` in
      // presets.ts, which was tuned for a year on the belief that it reached
      // the car. Anyone reaching for a number here should reach for
      // `envIntensity` or for the self-occlusion terms instead.
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
      const lift = 0.042 + up * 0.08 + LEAF_SPEC_TO_ALBEDO;
      // A reflectance, and a reflectance does not know what time it is.
      //
      // This was `0.032 + up * 0.062` — a self-occlusion term written into
      // the albedo, which is the fault this round is about, and which had it
      // an order of magnitude under what plane bark is. With the sun's own
      // occlusion now marched per tree by `computeBoleSun`, the number here
      // can be what it should always have been: 0.42 against the palest
      // instance tint is a reflectance of 0.241, against the darkest 0.024,
      // and measured plane bark runs 0.25 to 0.40 on a freshly shed plate
      // and well under 0.1 on the retained bark at the bole.
      computeBoleSun(sunDir);
      const barkLift = 0.42;
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
      // The vista, on the same two endpoints. It is two hundred metres out,
      // so the exponential fog is what separates it from the near planting —
      // giving it its own paler colour here as well would double-count the
      // aerial perspective the fog is already applying.
      for (let i = 0; i < farCount; i++) {
        const d = farDir[i * 2] * sx + farDir[i * 2 + 1] * sz;
        const k = THREE.MathUtils.smoothstep(d, -0.15, 0.78);
        paint(farCrowns, i, k, 0xa89a4a, 0x38492c, farJit[i], lift);
      }
      // The vista's boles stand inside a bank three hundred metres deep, so
      // whatever the sun is doing it is not reaching them: a flat shaded
      // share rather than a marched one, at the same 0.30 floor the near
      // trunks use for a bole in full shade.
      for (let i = 0; i < farTrunk.length; i++) {
        paint(farTrunks, i, farTrunk[i][5], 0xc6bda8, 0x443f34, 1, barkLift * BARK_SKY_SHARE);
      }
      farCrowns.instanceColor!.needsUpdate = true;
      farTrunks.instanceColor!.needsUpdate = true;
      // Plane bark is the one tree in a city you can identify from a hundred
      // metres by its trunk: it sheds in plates and reads as pale mottled
      // cream over olive-grey, not as the near-black post it was.
      //
      // The per-tree gain is what the grove's own geometry hands back, and it
      // is the thing that turns a row of identical posts into a colonnade:
      // the photograph's near trunks run from 33 where a crown stands up-sun
      // of them to 155 where none does, and every one of ours read the same.
      for (let i = 0; i < trees.length; i++) {
        const t = barkTone[i];
        const g = barkLift * (BARK_SKY_SHARE + (1 - BARK_SKY_SHARE) * boleSun[i]);
        trunkMat.color.setRGB(1, 1, 1);
        paint(trunks, i, t, 0xc6bda8, 0x443f34, 1, g);
        for (let b = 0; b < BRANCHES; b++) {
          paint(branches, i * BRANCHES + b, t * 0.8, 0xb4ab96, 0x3c382e, 1, g);
        }
      }
      crowns.instanceColor!.needsUpdate = true;
      trunks.instanceColor!.needsUpdate = true;
      branches.instanceColor!.needsUpdate = true;
    },
    dispose() {
      crownGeo.dispose();
      vistaGeo.dispose();
      trunkGeo.dispose();
      branchGeo.dispose();
      blockGeo.dispose();
      crownMat.dispose();
      vistaMat.dispose();
      crownDepthMat.dispose();
      trunkMat.dispose();
      blockMat.dispose();
    },
  };
}

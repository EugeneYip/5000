/**
 * Lighting presets.
 *
 * Every number here is a *look* decision, kept out of the machinery so the
 * five environments can be compared side by side. Colours are written as sRGB
 * hex because that is how a human reads them; three converts them to the
 * linear working space on the way in.
 *
 * `goldenhour` is the hero: it reproduces the reference photograph — a low
 * warm sun from camera-left, a deep blue sky overhead, warm bounce off the
 * Parkway asphalt and dappled shade from the street trees.
 */

export interface SkyParams {
  /** Straight up. */
  zenith: number;
  /** The band just above the horizon, away from the sun. */
  horizon: number;
  /** What the sky sphere shows below the horizon line. */
  ground: number;
  /** Sun disc and forward-scatter tint. */
  sun: number;
  /** HDR value of the sun disc itself — this is what glints off the clearcoat. */
  sunIntensity: number;
  /** Apparent radius of the disc, radians. The real sun is 0.00465. */
  sunAngularRadius: number;
  /** Strength/tightness of the aureole around the sun. */
  mieStrength: number;
  miePower: number;
  /** How fast the sky darkens from horizon to zenith. */
  gradientPower: number;
  /** Haze hugging the horizon line. */
  haze: number;
  /**
   * Cirrus cover, 0-1. Not decoration: an empty upper hemisphere is a flat
   * gradient, and a flat gradient is the only thing a bonnet or a roof has to
   * reflect. Structure up there is what stops a horizontal panel reading as a
   * painted ramp.
   */
  cloud?: number;
  hazeColor: number;
  hazeHeight: number;
  /**
   * Sky radiance relative to the sun. This is the single most important number
   * in the file: hex colours read as "a nice blue" but convert to linear far
   * more saturated and far brighter than a real sky is relative to direct sun,
   * and an over-bright sky is why so many outdoor renders come out magenta —
   * the orange sun fills R, the blue sky fills B, and nothing fills G.
   */
  exposure: number;
}

export interface LampSpec {
  positions: ReadonlyArray<readonly [number, number, number]>;
  color: number;
  /** Candela-ish; three's point lights are physically scaled. */
  intensity: number;
  distance: number;
}

/** Grading hints the post chain reads. Each preset wants a different finish. */
export interface GradeParams {
  exposure: number;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  aoIntensity: number;
  aoRadius: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  chromatic: number;
  /** Cool the shadows / warm the highlights, or the reverse. */
  shadowTint: number;
  highlightTint: number;
  splitStrength: number;
}

export interface EnvPreset {
  readonly name: string;
  /** Unit vector pointing *towards* the sun. */
  readonly sunDir: readonly [number, number, number];
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly sunShadow: boolean;
  /** VSM softness — a low sun through a big atmosphere is not a point source. */
  readonly sunShadowRadius: number;
  readonly sky: SkyParams;
  /** Insurance ambient for anything the IBL under-serves. Kept small. */
  readonly hemi: { sky: number; ground: number; intensity: number };
  /** Light kicked back up off the road surface. */
  readonly bounce: { color: number; intensity: number; dir: readonly [number, number, number] };
  /** Optional back/rim light to separate the roof from the sky. */
  readonly rim?: { color: number; intensity: number; dir: readonly [number, number, number] };
  /** Colour is derived from the sky so the horizon never shows a seam. */
  readonly fog: { density: number } | null;
  readonly ground: 'asphalt' | 'studio';
  /** Multiplies the asphalt albedo. */
  readonly groundTint: number;
  /** 0 = bone dry, 1 = standing water. Drives roughness and albedo darkening. */
  readonly wetness: number;
  /** Strength of the tree-shade gobo projected onto the road. */
  readonly dapple: number;
  /**
   * Density of the planting *overhead*, 0 = open sky.
   *
   * Separate from `dapple`, which only ever painted the road. This one is read
   * by the IBL's proxy world and by the backdrop's near planting, and it is
   * the number that decides what a horizontal body panel has to mirror. The
   * body is `metalness: 1.0`, so for the bonnet, the roof and the glass it is
   * the *only* number that decides anything.
   */
  readonly canopy?: number;
  /** What colour shaded road is — sky-lit, so usually cooler than the sun. */
  readonly shadeTint: number;
  /**
   * `scene.environmentIntensity` — and **it reaches ten of the eighty-seven
   * materials in the scene.**
   *
   * This used to be documented as "how much of the baked proxy world actually
   * reaches a material", and the whole light rig was tuned on that belief. It
   * is not what the number does. three applies it in one place, in
   * `WebGLRenderer.setProgram`:
   *
   *     if ( ( material.isMeshStandardMaterial || … )
   *          && material.envMap === null && scene.environment !== null )
   *         m_uniforms.envMapIntensity.value = scene.environmentIntensity;
   *
   * — only where the material has no `envMap` of its own, and it *overwrites*
   * that material's `envMapIntensity` when it applies. `materials.setEnvMap`
   * hands the IBL texture to every car material directly, so the car never
   * sees this number at all. Measured on the `photomatch` and `side` frames:
   * taking it from 3.3 to 0 leaves the bonnet at (126,126,137), the front
   * door at 72, the bumper band at 176 and the bumper face at 28 — every one
   * of them unchanged to the level — and moves only the road, 140 → 76.
   *
   * At 3.3 it was therefore not lifting the flanks, which is what it was
   * raised for. What it was doing was putting 3.3× the ambient on the road,
   * the backdrop and the ground plane and on nothing else, which is most of
   * why the car's own umbra measured 0.65 of the lit road where the
   * photograph has 0.35 — a 0.53:1 key-to-fill against the photograph's
   * 1.88:1. It is 1.0 now, which is what a map already carrying true scene
   * radiance asks for.
   *
   * The argument it was carrying is real and has moved to `proxyGain` below,
   * which is applied inside the bake where every material can see it.
   */
  readonly envIntensity: number;
  /**
   * The factor by which the baked proxy world under-counts the real one.
   *
   * `paint.ts` builds the body at `metalness: 1.0` and the basecoat flops to
   * near-black at grazing, so a body panel is essentially a clearcoat mirror:
   * the hemisphere, bounce and rim lights contribute nothing to it — taking
   * `hemi.intensity` from 0.12 to 0.75 moves a shaded flank by zero levels.
   * Every panel not in direct sun is showing the IBL and only the IBL, and
   * zeroing the map's terms one at a time says the flank is mirroring the
   * *ground*: without the proxy road it falls 56 → 30, without the furniture
   * only to 48, and no change to the sky band moves it at all.
   *
   * What the 140 m disc and forty-two leaf blobs leave out of that band is
   * most of a boulevard — the far carriageway and its traffic, parked cars
   * (vertical, specular, at exactly flank height), the pavement crowds, the
   * lamp standards with their flags, the sunlit grass past the trees. All of
   * it stands in the reflection and none of it is modelled.
   *
   * So it is a gain on what the proxy *furniture and road* emit, applied in
   * `ibl.ts`. Not on the sky, which is modelled in full by the same shader the
   * background dome uses, and not on the overhead canopy, which is a
   * silhouette against that sky and would end up brighter than it.
   */
  readonly proxyGain: number;
  /** Darkness of the rendered contact-occlusion pool under the car. */
  readonly contactStrength: number;
  readonly lamps?: LampSpec;
  /** Studio only: the softbox strips that make the flank highlights. */
  readonly studio?: boolean;
  readonly background: number;
  readonly grade: GradeParams;
}

const BASE_GRADE: GradeParams = {
  exposure: 1.0,
  bloomStrength: 0.22,
  bloomThreshold: 1.15,
  bloomRadius: 0.5,
  aoIntensity: 0.62,
  aoRadius: 0.18,
  contrast: 0.13,
  saturation: 1.04,
  vignette: 0.26,
  grain: 0.016,
  chromatic: 2.2,
  shadowTint: 0x2e3a52,
  highlightTint: 0xfff2dc,
  splitStrength: 0.055,
};

/**
 * Camera-left in both the hero `front3q` pose and the `photomatch` pose works
 * out to roughly −X with a little +Z, so one sun azimuth serves both. 11.5°
 * of elevation is late enough to stretch the shadows without losing all form
 * on the flanks.
 */
const GOLDEN_SUN = [-0.797, 0.199, 0.561] as const;

export const PRESETS: Record<string, EnvPreset> = {
  goldenhour: {
    name: 'goldenhour',
    sunDir: GOLDEN_SUN,
    sunColor: 0xffdec0,
    // The key went *up*, not down, and that wants explaining, because the
    // obvious reading of "the shaded panels are two stops dark" is that the
    // key is too strong.
    //
    // It is not. The sun is the one source in this rig that was already
    // calibrated: at 7.0, against the white-balanced photograph, the plate
    // reads 232 to its 234, the sunlit bumper 69 to its 73, the shaded road
    // beside the car 127 to its 123 and the lit bonnet 167 to its 165. Every
    // one of those is a *sunlit* or sun-dominated surface and every one of
    // them lands. Cutting the key to improve a key-to-fill ratio takes all
    // four down with it — and takes the road down hardest, which is the one
    // that matters, because the road is what the flanks are lit by.
    //
    // The ratio was fixed from the other end: `envIntensity` below.
    //
    // 6.3 now, and the reason is not a ratio preference — it is that the
    // white balance in `docs/REFERENCE-PHOTO.md` settles which light the car
    // in the photograph is standing in, and it is not this one.
    //
    // The gains were derived from the plate, so the plate is neutral in the
    // balanced photograph by construction: (236.0, 236.0, 234.9). Measure
    // anything else in that frame in the same space and the split is stark —
    // sunlit pavement reads B−R −42, the sunlit far carriageway −24, while
    // every panel on the car reads the other way: fender face +9, roof +16,
    // bonnet +49. A neutral derived from a *sunlit* card cannot leave sunlit
    // concrete forty levels warm. So the plate is in shade, the reference's
    // neutral is shade, and the car is standing in the planting's shade with
    // the sun flecking the pavement beside it — which is also plainly what
    // the photograph shows. This render has it in open sun.
    //
    // The calibration above still holds, it just re-lands: measured now, the
    // plate reads 238 at 7.0 and 235 at 6.3 against the photograph's 236, so
    // 6.3 is the better fit to the very anchor the paragraph above cites. The
    // four sun-dominated surfaces do not go down with it either, because the
    // 0.7 comes straight back as sky fill — the car's median level goes 126
    // to 130 against the photograph's 131, and the proportion of it crushed
    // below 40 goes 1.1 % to 1.4 % against the photograph's 3.2 %. Nothing is
    // bought with exposure: the sky dome never sees `envIntensity`.
    //
    // Measured on the twenty-four patches the colour gate reads, held at
    // fixed screen positions so the change cannot come from the gate picking
    // a luckier set: mean error against `#92939b` falls from 13.8 to 9.2.
    // Trimming the key alone does it (9.7 at 6.3 with the fill left at 2.8);
    // raising the fill alone makes it *worse* (15.6 at 3.2 with the key left
    // at 7.0, even though the gate's own number improves — that one is the
    // gate re-forming its top ten and is worth knowing about).
    // 6.9, and the 0.6 is the plate again. The one calibrated neutral in frame
    // measures 236 white-balanced; with `envIntensity` corrected the render's
    // plate face reads 225 at 6.3 and 236 at 6.9. It moves the right bucket
    // too: the photograph puts 8.3 % of the car between 224 and 240 and this
    // render had 2.5 %, with the surplus sitting one bucket below.
    sunIntensity: 6.9,
    sunShadow: true,
    sunShadowRadius: 2.2,
    sky: {
      // Both pulled back towards neutral, and the note that used to sit under
      // `horizon` — that it was "pulled a little bluer" to stop a grey-green
      // cast on the flanks — withdrawn. The flanks are not made of this
      // colour. They are made of the road, which is measurable: changing this
      // band by any amount moves a shaded flank by zero levels.
      //
      // What it *is* made of is every horizontal surface in the scene, and
      // with the fill at its proper strength a saturated blue sky turned the
      // asphalt lilac — `#6d7897` against the photograph's `#8f7969`, the hue
      // error mirror-imaged. A hazy city evening desaturates hard: the sky in
      // the photograph, white-balanced, reads `#9b8c6b` through the branches,
      // which is warmer than either of these. The road now comes back at
      // `#787e92`, saturation 0.18 against the photograph's 0.27.
      zenith: 0x6e93c0,
      // Warm, not neutral-cool, and this one is arithmetic rather than taste.
      //
      // What lights a horizontal surface is the cosine-weighted hemisphere,
      // which `skyRadiance()` models as zenith lerped 0.62 towards this band.
      // At 0xcbd0d2 that mean came out at linear (0.433, 0.510, 0.586), and
      // adding the sun's own (1.39, 1.02, 0.77) still left the total
      // irradiance on the road at R/B 0.865 — measurably blue, and the
      // rendered asphalt came back at (118, 123, 142) against the
      // white-balanced photograph's (108, 102, 103). The hue error was
      // mirror-imaged, which is the single loudest thing left in a wide frame:
      // golden hour with a lilac road.
      //
      // 0xd4d1cd puts the mean at (0.466, 0.506, 0.579), which lands the
      // road's irradiance at R/B 0.93 and then `groundTint` — the aggregate's
      // own warmth, which is where the rest of it belongs — carries it the
      // remaining 17 % to 1.09. Luminance holds to within one per cent of the
      // old value, so nothing the car is measured on moves.
      //
      // Splitting it that way rather than doing it all here matters, because
      // this band is also what a *vertical* panel mirrors, and the photograph
      // is explicit that the fender face is a touch COOLER than the road it
      // stands on (146,147,155 against 108,102,103). Warming the sky warms
      // both; warming the asphalt warms only the road. Doing the whole
      // correction here overshot the flanks to R/B 1.05 where they want 0.94.
      //
      // …and then it was done here anyway. 0xd4d1cd is R/B 1.078 — a warm
      // band — which is exactly the overshoot the paragraph above warns
      // against, and the panels went neutral where the photograph has them
      // cool. `groundTint` below now carries the road's share, as that
      // paragraph says it should, and this endpoint goes back to a cool
      // grey-blue at the same luminance (R/B 1.078 → 0.845, luminance 0.640
      // either way, so the road's *level* does not move).
      //
      // That is also what this number is: the clear-sky gradient endpoint,
      // not the sky anyone sees at the horizon. sky.ts lays an aerosol slab
      // and a skyline band of `hazeColor` over the bottom fifteen degrees, so
      // the visible horizon stays warm — measured on the photomatch frame it
      // goes from B−R −13 to −5, still warm, just no longer carrying the
      // road's correction as well as its own.
      //
      // Worth 1.7 on the colour gate and, measured on twenty-four patches
      // held at fixed screen positions, 1.3 levels of the panels' error.
      horizon: 0xced1de,
      ground: 0x6b5c4c,
      sun: 0xffb066,
      sunIntensity: 120,
      sunAngularRadius: 0.019,
      // A broader, stronger aureole. At 11° of solar elevation the sun's
      // forward-scatter lobe covers most of a quadrant of sky, and it is the
      // one structure a horizontal panel can mirror that is not a flat ramp.
      mieStrength: 1.15,
      miePower: 9,
      // 1.9, not 3.0. The exponent is how fast the zenith colour gives way to
      // the horizon band, and at 3.0 the band owned everything below twenty
      // degrees of elevation — which in a wide pose is the entire visible sky.
      // Measured on the profile pose, the dome ran 222 at the top of frame to
      // 225 at the bottom with a standard deviation of three levels: a flat
      // cream card, with the blue that is supposed to be up there pushed out
      // of frame entirely. At 1.9 the ramp is visible where the camera
      // actually looks, which is also what a horizontal panel has to mirror.
      gradientPower: 1.9,
      // A real aerosol layer rather than a rule drawn on the horizon.
      // `hazeHeight` is an e-folding angle in radians, so 0.034 was a band two
      // degrees thick — thinner than the sun is wide. A hazy Philadelphia
      // evening in September carries its aerosol fifteen to twenty degrees up,
      // which is 0.30, and that band is most of what a horizontal panel and
      // the road itself are lit by. Widening it is what lets the road stay
      // warm while the fill comes up; leaving it at two degrees, every unit of
      // extra fill arrived as blue zenith light and turned the asphalt lilac.
      // Pulled back, and it is safe to now. This slab was carrying the whole
      // warm cast of the low sky at 0.72 over an e-folding angle of 0.30 rad,
      // which is a wash rather than a band — seventeen degrees of uniform
      // cream. Two things have since taken that job properly: the thin
      // skyline glow in sky.ts, which is what a hazy horizon actually looks
      // like, and `groundTint`, which is where the road's warmth belongs.
      // `skyRadiance()` never read either of these numbers, so the derived
      // irradiance on the road is unchanged by the pull-back.
      haze: 0.6,
      cloud: 0.9,
      hazeColor: 0xf2d2ac,
      hazeHeight: 0.2,
      // Was 0.5, which put the sky's irradiance at 0.7× the direct sun's on a
      // horizontal surface. Measured golden hour under a hazy summer sky —
      // which is what the photograph shows — runs 0.8 to 1.3, and this is the
      // energy the flanks are actually standing in: a vertical panel sees
      // almost no sun and almost nothing but sky and what the sky lights.
      // Underrating it by half is why they were reading two stops dark.
      //
      // 1.10 now, still inside the 0.8–1.3 measured above and at the hazy end
      // of it because the photograph is hazy. It cannot go much past this: the
      // dome is the background as well as the source, and at 1.9 the sky is at
      // 224 and at 2.8 it is clipped. Anyone who tries to fix the flanks from
      // here will wash the frame out before the flanks arrive — measured, the
      // sky reaches 250 while a shaded flank is still only at 112.
      exposure: 1.1,
    },
    // Inert on the body, which is `metalness: 1.0` and has no diffuse lobe at
    // all. This is doing its job on the interior, the tyres and the trim, and
    // nothing whatever on the paint — do not reach for it to lift the flanks.
    //
    // 0.35, and the reason is that the car is now standing in the planting's
    // shadow instead of in open sun. Every *dielectric* surface on it — the
    // bumper, the valance, the grille surround, the arch liners, the tyres —
    // had the sun as about half its light and has just lost it, and the two
    // terms that stand in for one-bounce fill from the sunlit boulevard around
    // it are this and `bounce` below. Left where they were, the lower half of
    // the car went to black: a quarter of the car's pixels below level 32
    // against the photograph's 6.6 %, and the photograph's own shaded bumper
    // measures 65, not 20.
    //
    // It still does nothing to the paint, so it cannot be used to cheat the
    // colour gate in either direction.
    hemi: { sky: 0x93b8e8, ground: 0x6d5a45, intensity: 0.5 },
    // `dir` is the direction the light *travels*, and this vector used to have
    // a negative y: the "light kicked back up off the road" was shining down,
    // which made it a second uncredited key from above and left, and left the
    // sills and arch liners with nothing. Pointed up, where a bounce belongs.
    // (The other four presets still point theirs down. Noted rather than
    // changed blind — each one needs its own look.)
    //
    // **0.7 and a far cooler colour, back from 2.2 and 0xd4a173.** The case
    // for 2.2 was that a shaded car stands beside a large sunlit surround
    // returning a fifth of the sun. That is true, and it is *already in the
    // cubemap*: the proxy road, kerb and verge are derived from the same
    // irradiance and they light every material through `envMap`. A second
    // directional light doing it again is the same bounce counted twice, and
    // with `proxyGain` now reaching the car it is counted twice at full
    // strength.
    //
    // Measured, 2.2 was not buying the fill it was credited with either. A/B
    // with the light off: the shaded bumper does not move at all (87, B−R
    // −11.9, both ways), the front door does not move (72), the bonnet does
    // not move. Its whole footprint is a thin band — the rocker rub strip,
    // the arch lips and the rear valance — where it laid an orange rim the
    // photograph has no trace of. Mean change over the `side` frame with it
    // switched off: 0.53 of a level.
    //
    // The colour is the shaded carriageway the light is supposed to be coming
    // off, which the white-balanced photograph measures at (108, 102, 103),
    // R/B 1.05. 0xd4a173 is R/B 1.84 — an orange that is nowhere in the frame.
    bounce: { color: 0xd8c8bc, intensity: 0.7, dir: [0.3, 0.55, 0.62] },
    rim: { color: 0xbad4f0, intensity: 0.28, dir: [0.62, 0.42, -0.66] },
    // 0.0018, not 0.0038. Halving the extinction is worth a kilometre of
    // visibility and it is the photograph that asks for it: the far end of the
    // Parkway in that frame still resolves buildings, a traffic signal and the
    // flags on the lamp standards, where this render dissolved the tree line
    // into one flat cream wash about a hundred and fifty metres out and the
    // frame read as a salt flat with a car on it. Nothing on the car moves —
    // it is four metres from the lens, where the old density was already
    // worth 0.006 % — so this is a background change only.
    fog: { density: 0.0018 },
    ground: 'asphalt',
    // City asphalt is not neutral. What you read as grey road is exposed
    // aggregate and tyre-ground dust, and both are warm; the photograph's
    // shaded carriageway measures (108, 102, 103) after white balance, an
    // R/B of 1.05, where this render's was coming back at 0.83 — blue. Half
    // of that gap is the sky band above (see `horizon`) and half is here.
    //
    // All of it is here now, and the split matters more than the amount. The
    // road is *diffuse*, so its colour is its own albedo times an irradiance
    // gathered over the whole hemisphere; a body panel is metal at roughness
    // 0.3, so its colour is the radiance of one band of that hemisphere.
    // Warming this number reaches only the first. Measured: taking R/B from
    // 1.24 to 1.60 moves the rendered carriageway's B−R from +18 to +11
    // against the photograph's −10, and moves the panels by one level.
    //
    // Which is what lets a vertical panel and a horizontal one end up with
    // opposite casts, the thing the photograph is explicit about and the
    // thing no single white-balance knob can do: the sky band went cool for
    // the panels and the road's warmth came back here, on the surface that
    // is the only thing it belongs to.
    groundTint: 0xfff4cf,
    wetness: 0.06,
    // 0.45, not 0.88, and the reason is that this is no longer the only thing
    // shading the road.
    //
    // The gobo was painted on because casting the shade for real needed a
    // canopy tens of metres up-sun and the sun's frustum stopped six metres in
    // front of the bonnet. It does not any more — `SHADOW_REACH` in
    // Environment.ts opens it to ninety, the park grove in backdrop.ts stands
    // in it, and the crowns write a leaf-cut depth. So inside the frustum the
    // two now compound, and at 0.88 they took the car two stops under: a white
    // plate that measures 236 in the photograph came back at 185 and a quarter
    // of the car's pixels fell below level 32 against the photograph's 6.6 %.
    //
    // It cannot go to zero either. The frustum is fifteen metres across and
    // the road runs to the horizon, so beyond it there is no cast shadow at
    // all — the gobo is what keeps the far carriageway banded instead of
    // ending at a visible line.
    dapple: 0.45,
    // The reference photograph is taken *under* the row, not beside it: the
    // car is in the planting's shade with the sun flecking the pavement, and
    // the bonnet is mirroring a broken canopy rather than an open sky.
    canopy: 1.0,
    shadeTint: 0x5d7196,
    // 3.2, and the 0.4 is bookkeeping rather than a look change.
    //
    // Two reflectances in the proxy world were corrected downward at the same
    // time as this went up: the pavement from 0.35 to 0.197 and the grass
    // verge from 0.22 to 0.11, both measured off the reference photograph
    // (road, pavement and grass standing in one patch of tree shade white
    // balance to 102, 130 and 85). Those two surfaces occupy the band from
    // ten metres out to the horizon — which is most of the lower hemisphere
    // seen from the probe — so halving them took real energy out of exactly
    // the band the flanks are lit by. This number is defined as the factor by
    // which the proxy world under-counts the real one, so when the proxy gets
    // more honest and dimmer, it is the number that has to absorb it.
    //
    // It buys nothing on its own: the sky dome is unchanged (this does not
    // reach `applySkyParams`), and the plate — the one calibrated neutral in
    // frame — reads 235 against the white-balanced photograph's 236.
    proxyGain: 3.3,
    // 1.0, down from 3.3, and not a look change — a correction. See the note
    // on the field: `scene.environmentIntensity` reaches ten of the scene's
    // eighty-seven materials, and the car is not among them. At 3.3 it was
    // lighting the road, the backdrop and the ground plane at three and a
    // third times ambient while the car it stands under saw none of it, which
    // is what filled the car's own umbra in and gave the frame a 0.53:1
    // key-to-fill where the photograph reads 1.88:1.
    envIntensity: 1.0,
    // 0.62, up from 0.44. The 0.44 was set when `envIntensity` was believed to
    // be lifting the car; it was in fact lifting only the ground plane, which
    // is exactly what this pool sits on, so the pool was being laid over a
    // surface already 3.3× over-filled. With that corrected the ground under
    // the car is honestly dark and the pool has to do its own work again.
    contactStrength: 0.62,
    background: 0x8fb4d8,
    grade: {
      ...BASE_GRADE,
      // 1.0, up from 0.88. Occlusion is *more* visible in shade, not less: in
      // open sun the key washes the crevices out, and with the car under the
      // canopy there is no key left to do it. The photograph's deepest sixth
      // of a stop — the grille's slat shadows, the gap behind the bumper, the
      // arch liners — measures 6.6 % of the car below level 32 where this
      // render had 0.6 %, and those are exactly the places a screen-space
      // occlusion term is describing. The last 0.12 came back when the flake
      // grit was capped and the proxy world stopped over-filling the shadows.
      aoIntensity: 1.0,
    },
  },

  studio: {
    name: 'studio',
    sunDir: [-0.42, 0.82, 0.39],
    sunColor: 0xffffff,
    sunIntensity: 1.15,
    sunShadow: true,
    sunShadowRadius: 3.4,
    sky: {
      // A cyclorama, not a sky: near-black overhead lifting to a soft grey
      // behind the subject, which is what a sheet of paper lit from the sides
      // actually looks like.
      zenith: 0x060709,
      horizon: 0x23262c,
      ground: 0x0a0b0d,
      sun: 0xffffff,
      sunIntensity: 0,
      sunAngularRadius: 0.02,
      mieStrength: 0,
      miePower: 8,
      gradientPower: 2.4,
      haze: 0,
      hazeColor: 0x000000,
      hazeHeight: 0.1,
      exposure: 1.0,
    },
    hemi: { sky: 0x30343c, ground: 0x08090b, intensity: 0.25 },
    bounce: { color: 0x9aa0aa, intensity: 0.18, dir: [0.4, -0.7, 0.58] },
    rim: { color: 0xdfe6f2, intensity: 0.5, dir: [0.1, 0.34, -0.94] },
    fog: null,
    ground: 'studio',
    groundTint: 0xffffff,
    wetness: 0,
    dapple: 0,
    shadeTint: 0x202429,
    envIntensity: 1.0,
    // The other four presets never had a proxy-gain argument to make: their
    // `envIntensity` was already within 10 % of unity, so splitting the two
    // roles apart leaves them where they were.
    proxyGain: 1.0,
    contactStrength: 0.72,
    studio: true,
    background: 0x0b0c0e,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.3,
      bloomThreshold: 1.0,
      contrast: 0.09,
      saturation: 1.0,
      vignette: 0.34,
      grain: 0.01,
      chromatic: 1.4,
      splitStrength: 0.02,
      aoIntensity: 0.55,
    },
  },

  overcast: {
    name: 'overcast',
    sunDir: [-0.28, 0.93, 0.24],
    sunColor: 0xdfe6ee,
    sunIntensity: 0.65,
    sunShadow: true,
    sunShadowRadius: 8,
    sky: {
      zenith: 0xa9b3bd,
      horizon: 0xd2d7dc,
      ground: 0x767c82,
      sun: 0xe8edf2,
      sunIntensity: 1.4,
      sunAngularRadius: 0.12,
      mieStrength: 0.5,
      miePower: 3,
      gradientPower: 0.85,
      haze: 0.7,
      cloud: 0.0,
      hazeColor: 0xd7dbe0,
      hazeHeight: 0.16,
      exposure: 0.85,
    },
    hemi: { sky: 0xc7ced6, ground: 0x5e6165, intensity: 0.35 },
    bounce: { color: 0x8e9398, intensity: 0.22, dir: [0.2, -0.8, 0.55] },
    fog: { density: 0.011 },
    ground: 'asphalt',
    groundTint: 0xdfe3e8,
    wetness: 0.72,
    dapple: 0,
    shadeTint: 0x6e767e,
    envIntensity: 1.05,
    // The other four presets never had a proxy-gain argument to make: their
    // `envIntensity` was already within 10 % of unity, so splitting the two
    // roles apart leaves them where they were.
    proxyGain: 1.0,
    contactStrength: 0.78,
    background: 0xc9cfd5,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.1,
      bloomThreshold: 1.6,
      contrast: 0.17,
      saturation: 0.95,
      vignette: 0.2,
      grain: 0.018,
      splitStrength: 0.02,
      aoIntensity: 0.72,
    },
  },

  dusk: {
    name: 'dusk',
    // Sun below the horizon: nothing direct left, only the afterglow.
    sunDir: [-0.86, -0.05, 0.5],
    sunColor: 0x6d86b8,
    sunIntensity: 0.22,
    sunShadow: false,
    sunShadowRadius: 6,
    sky: {
      zenith: 0x0d1a33,
      horizon: 0x3a3752,
      ground: 0x11151e,
      sun: 0xc06a3a,
      sunIntensity: 3.0,
      sunAngularRadius: 0.05,
      mieStrength: 1.1,
      miePower: 5,
      gradientPower: 1.7,
      haze: 0.55,
      cloud: 0.55,
      hazeColor: 0x8a4f3c,
      hazeHeight: 0.07,
      exposure: 0.34,
    },
    hemi: { sky: 0x2b4470, ground: 0x171410, intensity: 0.28 },
    bounce: { color: 0x6b5236, intensity: 0.14, dir: [0.3, -0.75, 0.6] },
    rim: { color: 0x9fb6e0, intensity: 0.22, dir: [0.5, 0.3, -0.81] },
    fog: { density: 0.018 },
    ground: 'asphalt',
    groundTint: 0xe4e7ec,
    wetness: 0.45,
    dapple: 0.18,
    canopy: 0.55,
    shadeTint: 0x22304d,
    envIntensity: 0.9,
    // The other four presets never had a proxy-gain argument to make: their
    // `envIntensity` was already within 10 % of unity, so splitting the two
    // roles apart leaves them where they were.
    proxyGain: 1.0,
    contactStrength: 0.5,
    lamps: {
      positions: [
        [5.4, 5.3, 7.5],
        [5.4, 5.3, -6.5],
        [-6.2, 5.3, 1.0],
        [-6.2, 5.3, -14.0],
      ],
      color: 0xffb066,
      intensity: 130,
      distance: 34,
    },
    background: 0x1b2743,
    grade: {
      ...BASE_GRADE,
      exposure: 1.12,
      bloomStrength: 0.44,
      bloomThreshold: 0.82,
      bloomRadius: 0.62,
      contrast: 0.1,
      saturation: 1.08,
      vignette: 0.4,
      grain: 0.026,
      chromatic: 3.2,
      shadowTint: 0x1a2a52,
      highlightTint: 0xffd9a8,
      splitStrength: 0.11,
      aoIntensity: 0.55,
    },
  },

  noon: {
    name: 'noon',
    sunDir: [-0.26, 0.94, 0.22],
    sunColor: 0xfff4e2,
    sunIntensity: 5.4,
    sunShadow: true,
    sunShadowRadius: 1.1,
    sky: {
      zenith: 0x5e92d8,
      horizon: 0xc3d8ec,
      ground: 0x8d8a82,
      sun: 0xfff6e8,
      sunIntensity: 190,
      sunAngularRadius: 0.0095,
      mieStrength: 0.7,
      miePower: 22,
      gradientPower: 2.2,
      haze: 0.22,
      cloud: 0.35,
      hazeColor: 0xdfeaf5,
      hazeHeight: 0.1,
      exposure: 0.5,
    },
    hemi: { sky: 0x9fc4ec, ground: 0x7a7468, intensity: 0.25 },
    bounce: { color: 0xc9c2b2, intensity: 0.32, dir: [0.15, -0.9, 0.4] },
    fog: { density: 0.0022 },
    ground: 'asphalt',
    groundTint: 0xfffaf0,
    wetness: 0.02,
    dapple: 0.3,
    // Same boulevard, but a sun overhead comes almost straight down through
    // the crowns, so far less of the sky is closed off from a body panel.
    canopy: 0.45,
    shadeTint: 0x4d6a94,
    envIntensity: 1.0,
    // The other four presets never had a proxy-gain argument to make: their
    // `envIntensity` was already within 10 % of unity, so splitting the two
    // roles apart leaves them where they were.
    proxyGain: 1.0,
    contactStrength: 0.8,
    background: 0x77a6da,
    grade: {
      ...BASE_GRADE,
      bloomStrength: 0.2,
      bloomThreshold: 1.5,
      contrast: 0.16,
      saturation: 1.02,
      vignette: 0.22,
      grain: 0.012,
      aoIntensity: 0.6,
    },
  },
};

export const DEFAULT_PRESET = 'goldenhour';

export function resolvePreset(name: string): EnvPreset {
  return PRESETS[name] ?? PRESETS[DEFAULT_PRESET];
}

/**
 * Shared GLSL for the material library.
 *
 * Everything here is injected into stock three.js shaders through
 * `onBeforeCompile`, so it must not collide with three's own identifiers —
 * hence the `audi` prefix on every symbol.
 *
 * Two ideas run through the whole file and are worth stating once:
 *
 *  1. **Object space, not UV space.** Every procedural feature (flake, grain,
 *     weave, orange peel) is keyed off the object-space position, so its size
 *     is fixed in metres no matter how the UVs of a lofted panel stretch. The
 *     car is authored in metres, so a scale of `600.0` means "600 cells per
 *     metre" ≈ 1.7 mm features. That is the only unit you ever need to think in.
 *
 *  2. **Footprint fading.** A procedural detail smaller than a pixel does not
 *     average out on its own — it aliases into crawling noise, which is the
 *     single ugliest artefact in a procedural car render. `audiFootprint()`
 *     measures how many cells a pixel covers and every detail layer fades its
 *     *variance* (not its mean) out as that number climbs.
 */

/** Hashes, value noise with analytic gradient, and the footprint helper. */
export const GLSL_NOISE = /* glsl */ `
// Hoskins-style integer-free hashes. No sin(), so they stay stable at the
// large coordinates a 600-cells-per-metre lattice produces.
float audiHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 audiHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float audiHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Value noise, 0..1. */
float audiNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = audiHash13(i + vec3(0.0, 0.0, 0.0));
  float b = audiHash13(i + vec3(1.0, 0.0, 0.0));
  float c = audiHash13(i + vec3(0.0, 1.0, 0.0));
  float d = audiHash13(i + vec3(1.0, 1.0, 0.0));
  float e = audiHash13(i + vec3(0.0, 0.0, 1.0));
  float g = audiHash13(i + vec3(1.0, 0.0, 1.0));
  float h = audiHash13(i + vec3(0.0, 1.0, 1.0));
  float k = audiHash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
    mix(mix(e, g, f.x), mix(h, k, f.x), f.y),
    f.z);
}

/** Value noise returning (value, dx, dy, dz). Quintic, so the gradient is C1. */
vec4 audiNoised(vec3 x) {
  vec3 p = floor(x);
  vec3 w = fract(x);
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);

  float a = audiHash13(p + vec3(0.0, 0.0, 0.0));
  float b = audiHash13(p + vec3(1.0, 0.0, 0.0));
  float c = audiHash13(p + vec3(0.0, 1.0, 0.0));
  float d = audiHash13(p + vec3(1.0, 1.0, 0.0));
  float e = audiHash13(p + vec3(0.0, 0.0, 1.0));
  float f = audiHash13(p + vec3(1.0, 0.0, 1.0));
  float g = audiHash13(p + vec3(0.0, 1.0, 1.0));
  float h = audiHash13(p + vec3(1.0, 1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = e - a;
  float k4 = a - b - c + d;
  float k5 = a - c - e + g;
  float k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;

  float v = k0 + k1 * u.x + k2 * u.y + k3 * u.z
          + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x
          + k7 * u.x * u.y * u.z;

  vec3 gr = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
    k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);

  return vec4(v, gr);
}

/** Two-octave fbm, value only. */
float audiFbm2(vec3 x) {
  return audiNoise(x) * 0.65 + audiNoise(x * 2.17 + 19.3) * 0.35;
}

/** Cells of 'p' covered by one pixel. >1 means the detail is under-sampled. */
float audiFootprint(vec3 p) {
  vec3 dx = dFdx(p);
  vec3 dy = dFdy(p);
  return max(length(dx), length(dy));
}

/** 1 where a lattice is comfortably resolved, 0 where it is far below a pixel. */
float audiResolved(vec3 p) {
  return 1.0 - smoothstep(0.45, 2.2, audiFootprint(p));
}
`;

/**
 * Object-anchored frame transfer.
 *
 * Several effects need a direction that is *glued to the surface* — a flake
 * normal, a brush direction, a weave axis — expressed in view space, which is
 * where three does its shading. Passing a normal matrix as a varying would cost
 * nine floats per vertex. Instead we exploit the fact that `dFdx` of the
 * object-space position and `dFdx` of the view-space position are the *same
 * physical vector written in two spaces*: build the same frame from each, and
 * the change of basis between them is free and exact.
 */
export const GLSL_FRAME = /* glsl */ `
struct AudiFrame {
  vec3 To; vec3 Bo; vec3 No;
  vec3 Tv; vec3 Bv; vec3 Nv;
};

AudiFrame audiMakeFrame(vec3 objPos, vec3 viewPos) {
  vec3 oX = dFdx(objPos);
  vec3 oY = dFdy(objPos);
  vec3 vX = dFdx(viewPos);
  vec3 vY = dFdy(viewPos);

  AudiFrame f;
  f.No = normalize(cross(oX, oY) + vec3(1e-12));
  f.Nv = normalize(cross(vX, vY) + vec3(1e-12));
  // cross(oX, oY) is perpendicular to oX by construction, so oX is already a
  // valid tangent — no Gram-Schmidt needed.
  f.To = normalize(oX + vec3(1e-12));
  f.Tv = normalize(vX + vec3(1e-12));
  f.Bo = cross(f.No, f.To);
  f.Bv = cross(f.Nv, f.Tv);
  return f;
}

/** Rewrite an object-space direction in view space. */
vec3 audiObjToView(AudiFrame f, vec3 d) {
  return f.Tv * dot(d, f.To) + f.Bv * dot(d, f.Bo) + f.Nv * dot(d, f.No);
}
`;

/**
 * Screen-space bump. Mikkelsen's surface-gradient form, the same one three uses
 * for `bumpMap` — but three only compiles it in when a bump texture is bound,
 * so we carry our own copy for procedural heights.
 */
export const GLSL_BUMP = /* glsl */ `
/**
 * A screen-space height gradient, bounded by the slope the pattern actually
 * has.
 *
 * dFdx of a height built from creases — turbulence, |noise|, a moulded grain —
 * spikes wherever a crease crosses the 2x2 quad, because one pixel's step
 * across a V reads as an arbitrarily steep wall. Those spikes land on isolated
 * pixels and tilt the normal far enough to catch the sky, which is the white
 * "dust on the sensor" speckle a grained black bumper shows on a dark panel.
 *
 * A moulded grain has no facet steeper than the slope it was authored with, so
 * clamping the per-pixel rise to that slope times the surface's own per-pixel
 * step discards nothing real and removes the spikes exactly. 'surfPos' must be
 * the space the height was evaluated in, so the two agree on what a metre is.
 */
vec2 audiBoundGradient(float h, vec3 surfPos, float slope) {
  float lim = slope * length(fwidth(surfPos)) + 1e-9;
  return clamp(vec2(dFdx(h), dFdy(h)), -lim, lim);
}

vec3 audiBump(vec3 surfPos, vec3 N, float dHdx, float dHdy, float scale) {
  vec3 sX = dFdx(surfPos);
  vec3 sY = dFdy(surfPos);
  vec3 R1 = cross(sY, N);
  vec3 R2 = cross(N, sX);
  float det = dot(sX, R1);
  vec3 grad = sign(det) * (dHdx * R1 + dHdy * R2) * scale;
  return normalize(abs(det) * N - grad);
}
`;

/**
 * Flake lattice.
 *
 * One draw from the flake orientation distribution per lattice cell, skewed by
 * a fixed rotation before lookup so the cells never line up with the car's own
 * axes and read as a grid.
 *
 * **There is deliberately no particle here** — no radius, no coverage disc.
 * Aluminium flake in a 1980s basecoat is 10-50 µm across and the closest pose
 * this project shoots is `badge` at ~0.45 mm/px, so a pixel covers of order a
 * hundred flakes and *nothing ever resolves one*. Anything with a size in it
 * would therefore be drawing something that cannot be seen, and what it would
 * actually draw is glitter: the disc this replaced was 0.4-0.9 mm, with a
 * companion population at 1.3-3.0 mm, and at 0.45 mm/px those discs are
 * exactly the 2-4 px white specks CRITIQUE-4 §11 counted on the tailgate.
 *
 * The physical flake size enters through `audiFlakeGrain` instead, as an
 * amplitude rather than as a shape.
 */
export const GLSL_FLAKE = /* glsl */ `
// Deliberately irrational-ish rotation: kills axis-aligned banding on the
// flat panels, which is exactly where a cubic lattice would show.
const mat3 AUDI_FLAKE_SKEW = mat3(
   0.8037, 0.5233, -0.2827,
  -0.4302, 0.8232,  0.3703,
   0.4112, -0.2196, 0.8847);

/**
 * One flake's normal, in whatever space 'nObj' is given in.
 *
 * Aluminium flake settles roughly parallel to the substrate, so this is a
 * tight lobe about the local basecoat normal and not a uniform sphere.
 *
 * @param q       position, already multiplied by cells-per-metre
 * @param nObj    the normal to tilt about. Pass the *clumped* basecoat normal
 *                rather than the panel's, so a flake inherits the lay of the
 *                domain it is sitting in.
 * @param spread  how far off that normal a flake may lie
 */
vec3 audiFlakeTilt(vec3 q, vec3 nObj, float spread) {
  vec3 h = audiHash33(floor(q) * 1.913 + 7.13);
  vec3 tilt = (h - 0.5) * 2.0;
  tilt -= nObj * dot(tilt, nObj);
  return normalize(nObj + tilt * spread);
}

/**
 * **How much of one flake's deviation a pixel may show.** The band limit.
 *
 * Procedural noise has no mip chain, so a fragment's own screen-space
 * derivative is the only thing that can band-limit a flake field — and it has
 * to rescale the *variance* to what the sampling density supports rather than
 * switch the detail off.
 *
 * 'pitch' is the real flake spacing in metres and 'audiFootprint(objPos)' is
 * what one pixel covers, in the same metres. Their ratio is 1/n for n flakes
 * across a pixel, so the pixel holds n² of them. Those n² are uncorrelated,
 * so what the pixel shows is not a flake — it is the *fluctuation* in how
 * many of its flakes happen to be tilted into the highlight, and the standard
 * error of a mean of n² draws is 1/n of a single draw's. That ratio is the
 * whole function.
 *
 * At 'badge' (~0.45 mm/px) a 39.5 µm pitch gives n ≈ 11, so a flake carries an
 * eleventh of its own contrast and the paint reads as a fine grain. At
 * 'photomatch' the bonnet is foreshortened to ~17 mm/px and it is a four
 * hundredth — which is correct, not a bug. At that distance the sheen is the
 * clump field's job, not one particle's.
 *
 * Nothing here ever reaches zero. A hard cutoff is what "fade the detail out"
 * band limits do and it leaves a distant panel glassy; this only ever reports
 * the variance the sampling density actually supports.
 */
float audiFlakeGrain(vec3 objPos, float pitch) {
  return clamp(pitch / max(audiFootprint(objPos), 1e-9), 0.0, 1.0);
}
`;

/**
 * Geometric specular antialiasing.
 *
 * `audiResolved()` and friends handle a detail that has gone *smaller* than a
 * pixel. This handles the other half of the problem, and it is the one that
 * produced the headlamp reflector's glitter: a lattice that is comfortably
 * resolved — six pixels to a dimple — can still alias, because what aliases is
 * the *highlight*, not the pattern. A dimple whose normal sweeps 50° across
 * six pixels sweeps it past a specular lobe only 6° wide, so the light source
 * lands inside one pixel of each dimple and nowhere else: a field of isolated
 * white dots instead of a bowl. Fading the dimples out cannot fix that, and
 * supersampling only makes the dots smoother.
 *
 * The cure is Tokuyoshi & Kaplanyan's: measure the normal's screen-space
 * variance, treat it as an extra roughness kernel, and convolve it into the
 * material's own roughness. The lobe then spans exactly the range of normals
 * the pixel actually contains, so the glint spreads over the dimple instead of
 * flickering on one pixel of it — at the same average energy, which is why the
 * surface does not get darker or duller when it stops sparkling.
 *
 * `n` may be in any rigid frame, object or view: variance is invariant under
 * rotation, and object space is often the only frame the perturbed normal is
 * available in early enough to reach `roughnessmap_fragment`.
 *
 * `sigma2` weights the variance (0.25 is the conventional half-pixel filter);
 * `cap` bounds how much roughness a single pixel may invent, so a silhouette —
 * where the normal genuinely flips — cannot blur the whole surface.
 */
export const GLSL_SPECAA = /* glsl */ `
float audiSpecularAA(vec3 n, float roughness, float sigma2, float cap) {
  vec3 dx = dFdx(n);
  vec3 dy = dFdy(n);
  float variance = sigma2 * (dot(dx, dx) + dot(dy, dy));
  return clamp(sqrt(roughness * roughness + min(2.0 * variance, cap)), 0.0, 1.0);
}
`;

/** Everything a fragment shader in this library might want, concatenated. */
export const GLSL_LIB = GLSL_NOISE + GLSL_FRAME + GLSL_BUMP + GLSL_SPECAA;

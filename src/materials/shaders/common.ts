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
 * One aluminium flake per lattice cell, each with its own orientation and its
 * own sub-cell footprint so there is binder *between* the flakes rather than a
 * continuous mosaic. The lattice is skewed by a fixed rotation before lookup so
 * the cubes never line up with the car's own axes and read as a grid.
 */
export const GLSL_FLAKE = /* glsl */ `
// Deliberately irrational-ish rotation: kills axis-aligned banding on the
// flat panels, which is exactly where a cubic lattice would show.
const mat3 AUDI_FLAKE_SKEW = mat3(
   0.8037, 0.5233, -0.2827,
  -0.4302, 0.8232,  0.3703,
   0.4112, -0.2196, 0.8847);

struct AudiFlake {
  vec3 normalObj;
  float mask;
};

/**
 * @param q       object-space position, already multiplied by cells-per-metre
 * @param nObj    object-space surface normal
 * @param size    0..1, fraction of the cell the flake body covers
 * @param spread  how far off the panel normal a flake may tilt
 */
AudiFlake audiFlakeAt(vec3 q, vec3 nObj, float size, float spread) {
  vec3 cell = floor(q);
  vec3 local = q - cell;

  vec3 h = audiHash33(cell + 0.37);
  // Flake centres jitter inside the cell so the packing is irregular.
  vec3 centre = 0.5 + (h - 0.5) * 0.78;
  float d = length((local - centre) * vec3(1.0, 1.0, 1.0));

  vec3 h2 = audiHash33(cell * 1.913 + 7.13);
  // Aluminium flake settles roughly parallel to the substrate: a tight cosine
  // lobe about the panel normal, not a uniform sphere.
  vec3 tilt = (h2 - 0.5) * 2.0;
  tilt -= nObj * dot(tilt, nObj);

  AudiFlake f;
  f.normalObj = normalize(nObj + tilt * spread);
  // Flakes vary in size; the largest are the ones you actually notice.
  float r = size * (0.45 + 0.55 * h.z);
  f.mask = 1.0 - smoothstep(r * 0.55, r, d);
  return f;
}
`;

/** Everything a fragment shader in this library might want, concatenated. */
export const GLSL_LIB = GLSL_NOISE + GLSL_FRAME + GLSL_BUMP;

/**
 * Procedural surface GLSL: grain, weave, nap, prisms, dimples, brush marks.
 *
 * Companion to `common.ts`, which supplies the noise, the object/view frame
 * transfer and the screen-space bump. Everything here assumes those are
 * already in the shader (`GLSL_LIB`), and follows the same two rules:
 *
 *  1. **Object space, in metres.** A `scale` argument is always *cells per
 *     metre*, so `1800.0` means 0.55 mm features regardless of how a lofted
 *     panel's UVs stretch. There are no UVs in this library at all.
 *
 *  2. **Fade variance, not amplitude, when a feature goes sub-pixel.** A
 *     1 mm grain viewed from eight metres covers a tenth of a pixel; left
 *     alone it turns into crawling noise. Each layer therefore fades its
 *     perturbation out with `audiResolved()` *and* hands the energy it gave up
 *     to roughness, so the surface keeps the same average sheen at every
 *     distance instead of going glassy as you walk away.
 *
 * A note on derivatives: patterns with a hard period (`fract`) get **analytic**
 * normals rather than `dFdx` of the height. A screen-space derivative across a
 * `fract` seam is enormous and draws a bright one-pixel line down every prism
 * — the single most common tell in a procedural lamp lens.
 */

export const GLSL_SURFACE = /* glsl */ `
// --------------------------------------------------------------------------
// Triplanar projection
// --------------------------------------------------------------------------
// A *directional* pattern (a weave, a brush mark) cannot use the derivative
// frame from GLSL_FRAME: that frame is built from screen-space derivatives, so
// its tangent rotates as the camera moves and the weave would swim. Projecting
// from the three object-space axes instead gives directions that are welded to
// the object.

/** Blend weights, sharpened so the cross-fade band between planes is narrow. */
vec3 audiTriWeights(vec3 n) {
  vec3 w = max(abs(n) - 0.2, vec3(0.0));
  w *= w;
  w *= w;
  return w / max(w.x + w.y + w.z, 1e-5);
}

/** Turbulence — summed |noise|. The creases are what make it read as moulded. */
float audiTurb3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  vec3 q = p;
  for (int i = 0; i < 3; i++) {
    s += abs(audiNoise(q) * 2.0 - 1.0) * a;
    q = q * 2.07 + 7.13;
    a *= 0.5;
  }
  return s;
}

/** Rewrite a view-space direction in object space (the inverse of audiObjToView). */
vec3 audiViewToObj(AudiFrame f, vec3 d) {
  return f.To * dot(d, f.Tv) + f.Bo * dot(d, f.Bv) + f.No * dot(d, f.Nv);
}

/**
 * Surface curvature in inverse metres — how fast the normal turns per metre of
 * surface, not per pixel. Dividing the normal's screen derivative by the
 * position's makes it a property of the object rather than of the camera, so a
 * moulded letter still reads as a sharp edge from across the street.
 */
float audiCurvatureM(vec3 n, vec3 p) {
  return length(fwidth(n)) / max(length(fwidth(p)), 1e-5);
}

/**
 * Resolve tests for *strictly periodic* patterns — a weave, a prism run, a
 * dimple lattice.
 *
 * These alias much sooner than the noise fields 'audiResolved()' was tuned
 * for. A regular grid at 0.7 cells per pixel is already past Nyquist and beats
 * against the pixel grid into moiré rings, which is far more objectionable
 * than the grain it came from. Hence the tighter thresholds.
 */
float audiResolved1(float x) {
  return 1.0 - smoothstep(0.22, 0.85, fwidth(x));
}

float audiResolvedTight(vec3 p) {
  return 1.0 - smoothstep(0.20, 0.80, audiFootprint(p));
}

// --------------------------------------------------------------------------
// Moulded grain — bumper cladding, dashboard, door cards
// --------------------------------------------------------------------------
// Injection-moulded texture is not noise: it is a field of small plateaus with
// sharp creases between them, because the mould was etched. Turbulence
// inverted gives exactly that shape for a fraction of the cost of a Worley
// cell search.

/** 0..1 grain height. 'scale' cells/m for the plateaus, 'fine' a multiplier
 *  for the matte stipple riding on top of them. */
float audiGrain(vec3 p, float scale, float fine) {
  vec3 q = p * scale;
  float cell = smoothstep(0.12, 0.92, 1.0 - audiTurb3(q));
  float stipple = audiNoise(q * fine);
  return cell * 0.76 + stipple * 0.24;
}

// --------------------------------------------------------------------------
// Directional marks — brushed trim, machined alloy
// --------------------------------------------------------------------------

/** Noise stretched into streaks running along 'dir'. 'stretch' >= 1. */
float audiStreak(vec3 p, vec3 dir, float scale, float stretch) {
  vec3 q = p * scale;
  q -= dir * dot(dir, q) * (1.0 - 1.0 / stretch);
  return audiNoise(q) * 0.62 + audiNoise(q * 2.63 + 5.17) * 0.38;
}

/**
 * Lathe marks: concentric grooves centred on the object's own origin — what a
 * boring bar leaves on a wheel lip or a brake face.
 *
 * Radius is measured as the plain distance from the origin, deliberately, not
 * as the distance from an axis. A wheel might be built from a cylinder (axis
 * +Y), a lathe (+Y), a torus (+Z) or a hand-rolled section (+X), and guessing
 * wrong turns the concentric rings into a linear gradient. Distance from the
 * hub centre needs no such guess: on a disc face it *is* the radius, and on the
 * rim it over-reads by the axial offset, which only shifts where the machined
 * band starts by a few millimetres.
 */
float audiTurned(vec3 p, float pitch, out float rOut) {
  float r = length(p);
  rOut = r;
  // A real cut wanders: the tool chatters and the part is never perfectly true.
  float wobble = (audiNoise(p * 260.0) - 0.5) * pitch * 0.4;
  return abs(fract((r + wobble) / pitch) - 0.5) * 2.0;
}

// --------------------------------------------------------------------------
// Prism fluting — lamp lenses
// --------------------------------------------------------------------------

/**
 * Facet normal of a run of triangular prisms.
 *
 * @param n       object-space surface normal
 * @param across  unit object-space direction the prisms step along
 * @param x       coordinate along 'across', in metres
 * @param pitch   prism pitch in metres
 * @param slope   tangent of the facet angle
 *
 * Analytic, not a bump: the facets are perfectly flat and the ridge between
 * them is a true crease, which is how a moulded prism catches a highlight as
 * one hard line rather than a soft smear.
 */
vec3 audiPrismNormal(vec3 n, vec3 across, float x, float pitch, float slope) {
  float t = fract(x / pitch);
  float s = t < 0.5 ? 1.0 : -1.0;
  // Round the ridge and the valley slightly — a moulding tool has a radius.
  float k = smoothstep(0.0, 0.06, min(t, 1.0 - t)) * smoothstep(0.0, 0.06, abs(t - 0.5));
  float res = audiResolved1(x / pitch);
  return normalize(n + across * s * slope * mix(0.35, 1.0, k) * res);
}

/** Prism height across a run of flutes: 0 in the valley, 1 on the ridge. */
float audiPrismHeight(float x, float pitch) {
  return 1.0 - abs(fract(x / pitch) - 0.5) * 2.0;
}

// --------------------------------------------------------------------------
// Dimpled / stippled bowl — reflectors
// --------------------------------------------------------------------------

/**
 * Spherical dimples on a lattice, the pebbled optic of a period reflector.
 * Each dimple is a little concave mirror, so a single light source becomes a
 * field of separate glints and the bowl stops reading as a flat metal shell.
 */
vec3 audiDimpleNormal(vec3 p, vec3 n, float cells, float depth, out float mask) {
  vec3 q = p * cells;
  vec3 c = floor(q);
  vec3 f = q - c;
  vec3 h = audiHash33(c + 0.21);
  vec3 centre = 0.5 + (h - 0.5) * 0.45;
  vec3 d = f - centre;
  d -= n * dot(d, n);
  float r = length(d);
  float rad = 0.40 + 0.16 * h.x;
  float res = audiResolvedTight(q);
  // A raised-cosine cap, not a disc: the tilt rises from zero at the dimple
  // centre and returns to zero at its rim, so neighbouring dimples meet with a
  // continuous normal. A hard-edged dimple aliases into salt at any distance.
  float u = clamp(r / rad, 0.0, 1.0);
  float profile = sin(u * 3.14159265) * (1.0 - u * u);
  mask = (1.0 - smoothstep(0.55, 1.0, u)) * res;
  vec3 dir = r > 1e-5 ? d / r : vec3(0.0);
  // Concave: the normal leans back towards the dimple centre.
  return normalize(n - dir * profile * depth * res);
}

// --------------------------------------------------------------------------
// Plain weave — seat cloth, door card inserts
// --------------------------------------------------------------------------

struct AudiWeave {
  float h;      // height, 0..1
  vec2 grad;    // analytic dh/duv, in yarn units
  vec2 dir;     // the top yarn's run direction, in uv
  float shade;  // per-yarn tone variation, -1..1
};

/** One yarn per unit of 'uv'. Plain over-one-under-one. */
AudiWeave audiWeaveAt(vec2 uv) {
  vec2 c = floor(uv);
  vec2 f = uv - c;
  // Warp runs along +v, so its cross-section varies with u, and vice versa.
  float warpTop = step(mod(c.x + c.y, 2.0), 0.5);

  vec2 r = f * 2.0 - 1.0;
  // Clamped so the slope stays finite where the yarn meets its neighbour.
  float cu = sqrt(max(1.0 - r.x * r.x, 0.04));
  float cv = sqrt(max(1.0 - r.y * r.y, 0.04));

  float hTop = mix(cv, cu, warpTop);
  float hBot = mix(cu, cv, warpTop);

  vec2 gTop = mix(vec2(0.0, -r.y * 2.0 / cv), vec2(-r.x * 2.0 / cu, 0.0), warpTop);
  vec2 gBot = mix(vec2(-r.x * 2.0 / cu, 0.0), vec2(0.0, -r.y * 2.0 / cv), warpTop);

  AudiWeave w;
  w.h = hTop + hBot * 0.22;
  w.grad = clamp(gTop + gBot * 0.22, vec2(-4.0), vec2(4.0));
  w.dir = mix(vec2(1.0, 0.0), vec2(0.0, 1.0), warpTop);
  // Dyed yarn is never uniform; this is most of what stops cloth looking flat.
  float yarn = mix(audiHash12(vec2(c.y, 3.1)), audiHash12(vec2(c.x, 7.7)), warpTop);
  w.shade = (yarn - 0.5) * 2.0;
  return w;
}

/**
 * Weave evaluated triplanar and blended, so the cloth keeps a fixed yarn size
 * and a stable direction across a curved seat squab with no visible seam.
 * Returns the *object-space* normal perturbation; 'hOut' is the blended height.
 */
vec3 audiWeaveNormal(vec3 p, vec3 n, float yarnsPerM, float amp, out float hOut, out float shadeOut) {
  vec3 w = audiTriWeights(n);
  vec3 q = p * yarnsPerM;
  float res = audiResolvedTight(q);

  AudiWeave wx = audiWeaveAt(q.zy);
  AudiWeave wy = audiWeaveAt(q.xz);
  AudiWeave wz = audiWeaveAt(q.xy);

  hOut = wx.h * w.x + wy.h * w.y + wz.h * w.z;
  shadeOut = (wx.shade * w.x + wy.shade * w.y + wz.shade * w.z) * res;

  // Each plane's gradient pushed back out into object space.
  vec3 g = vec3(0.0);
  g += w.x * (vec3(0.0, wx.grad.y, wx.grad.x));
  g += w.y * (vec3(wy.grad.x, 0.0, wy.grad.y));
  g += w.z * (vec3(wz.grad.x, wz.grad.y, 0.0));
  g -= n * dot(g, n);
  return normalize(n - g * amp * res);
}

// --------------------------------------------------------------------------
// Carpet nap
// --------------------------------------------------------------------------

/**
 * Direction the pile is lying, as a smooth object-space field. Cut pile takes
 * a set from the last thing that brushed it, which is why a carpet shows broad
 * light and dark bands that swap over as you move — the single cue that
 * separates carpet from flat dark felt.
 */
vec3 audiNapDirection(vec3 p, vec3 n, float scale) {
  vec3 d = vec3(
    audiNoise(p * scale) - 0.5,
    audiNoise(p * scale + 19.7) - 0.5,
    audiNoise(p * scale + 41.3) - 0.5);
  d -= n * dot(d, n);
  return normalize(d + vec3(1e-5));
}
`;

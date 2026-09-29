/**
 * Lamp optics: moulded lenses and bulb surfaces.
 *
 * ## Why a period lens is hard
 *
 * A 1988 taillamp is not a red surface. It is a 3 mm slab of dyed PMMA with a
 * field of prisms moulded into its **back** face, sitting in front of a
 * stippled aluminium bowl. Everything that makes it look expensive happens
 * inside it:
 *
 *  - the prisms are *behind* the outer surface, so they slide against it with
 *    parallax as you move — the strongest depth cue the part has, and the one
 *    a normal map can never produce;
 *  - light crossing the body is absorbed by Beer–Lambert, so the same lens is
 *    a bright orange-red where the path is short and nearly black where it is
 *    long. That gradient *is* the glow;
 *  - the facets are flat and their ridges are creases, so a low sun breaks
 *    into a grid of separate hard glints rather than one smeared highlight.
 *
 * All three are modelled here. Flat red plastic is what you get when you model
 * none of them.
 *
 * ## …and why it is easy to make it worse
 *
 * Every one of those three is a *strictly periodic* signal with hard edges in
 * it, read through a *parallax offset*, on a *curved* surface. That is three
 * separate ways to produce a pattern the frame cannot hold, and the accumulation
 * pass cannot help with any of them: it jitters the projection, not the
 * lookup, so sixteen samples average sixteen copies of the same artefact.
 *
 * So the rules here are tighter than elsewhere in the library:
 *
 *  - the flute *phase* rides on fixed part axes, never on an axis re-derived
 *    from the interpolated normal — see rule 3 in `shaders/surfaces.ts`;
 *  - the rate that arms the band limit is measured with the parallax term
 *    added analytically, because `fwidth` cannot see it;
 *  - the creases (facet flip, TIR blaze, glint lobe) are surrendered early and
 *    the smooth banding late, each toward *its own mean*, so the lamp keeps
 *    its colour and its average brightness at every distance and simply stops
 *    resolving individual prisms.
 */

import * as THREE from 'three';
import { extend, OBJECT_SPACE_VARYINGS } from './extend';
import { GLSL_LIB } from './shaders/common';
import { GLSL_SURFACE } from './shaders/surfaces';

export interface LensOptions {
  /** Moulded prism fluting on the inner face. */
  prismatic?: boolean;
  opacity?: number;
  /**
   * **Cat's-eye return.** How much brighter than a Lambertian surface of the
   * same colour the *whole aperture* reads when the sun stands behind the
   * camera. `0`, the default, adds no code to the shader and is what a lamp
   * with no reflector behind it should use.
   *
   * This is the headlamp's equivalent of the licence plate's sheeting, and it
   * is a different mechanism with the same signature. See `LENS_RETRO`.
   */
  retroGain?: number;
  /** Cosine power of that return's lobe. See `LENS_RETRO`. */
  retroLobe?: number;
  /**
   * Extra roughness applied to the **transmitted** image only.
   *
   * A fluted lens is a cylindrical-lens array: it spreads what is behind it
   * across the aperture. Without this the bowl behind a clear lens arrives as
   * a mirror image and the sun lands on it as a single hot lobe per chamber.
   * Does not touch the surface's own specular, which is a moulded finish and
   * is set by `roughness`.
   *
   * **It cannot carry the whole spread, and measurement is why** — see
   * `homogenise`, which is the term that actually flattens an aperture.
   */
  spread?: number;
  /**
   * **Flute homogenisation.** The share of the aperture's exit radiance that
   * has been scattered by the lens's own flutes through a cone wider than the
   * cavity behind it, and therefore carries that cavity's *average* radiance
   * rather than whatever happens to sit directly behind the pixel.
   *
   * `0`, the default, adds no code to the shader and is a plain window. See
   * `LENS_CAVITY`.
   */
  homogenise?: number;
  /**
   * Apparent diffuse reflectance of the cavity, seen through its own
   * aperture — the level `homogenise` mixes towards. Only read when
   * `homogenise` is above zero. See `LENS_CAVITY`.
   */
  cavity?: number;
}

/** Acrylic. */
const LENS_IOR = 1.49;

const LENS_PRELUDE = /* glsl */ `
${OBJECT_SPACE_VARYINGS.fragmentDecl}
uniform vec3 uLensColor;
// x body thickness (m)  y prism pitch (m)  z prism slope  w internal env gain
uniform vec4 uLensOptics;
// x absorption passes  y bulk scatter  z facet roughness  w cross-prism ratio
uniform vec4 uLensBody;
uniform float uLensIor;
// x cat's-eye gain  y its lobe power  z transmitted-image spread
uniform vec3 uLensRetro;
// x flute homogenisation  y apparent cavity reflectance
uniform vec2 uLensCavity;

${GLSL_LIB}
${GLSL_SURFACE}

// --------------------------------------------------------------------------
// Pillow optic
// --------------------------------------------------------------------------
//
// The taillamp's back face is not a field of V-flutes, and it is not a field
// of pillows either. Enlarge the 2048 px close-up to 8x and the moulding is a
// grid of **flat square pads** with a **narrow rounded groove** between them,
// about three tenths of the pitch wide. What the eye reads is that groove: a
// thin dark line at every cell edge, and — where a groove runs horizontally,
// so that one of its two walls faces up at the sky — a short bright dash along
// the top of every cell. The pad between them is almost featureless.
//
// Getting that duty cycle wrong is the whole of the dot-matrix complaint. A
// full-width profile of any shape spreads its one cycle of shading over the
// entire cell, which at ten pixels a cell is a soft blob however it is shaped:
// a V-flute gives a two-level step per run and a regular 2x2 array of them
// crossed, which is a halftone screen; min() of two triangle runs, which the
// previous attempt substituted, peaks at a single point and gives one round
// dot per cell, which is the same screen with softer edges. Neither can
// produce a *line*, and a line is what the part actually shows.
//
// These are here rather than in shaders/surfaces.ts because the headlamp's
// flutes really are V-cut and must keep the functions they have.

/**
 * Groove width as a fraction of the pitch — the **full** width, both walls.
 *
 * 0.34 from the phase-averaged cell: folding every cell of a flat patch into
 * one and reading the across profile in twelve bins puts five of them below
 * the cell's own mean on both the clear window and the amber, at either end
 * of the run, and seven flat between.
 *
 * audiPadProfile() divided by this directly, which measures the groove from
 * each boundary *separately* and therefore built one twice as wide as stated —
 * 0.60 of the pitch, leaving only 0.40 of flat pad. That is not a crease with
 * a pad beside it, it is very nearly the full-width triangle the comment above
 * exists to warn against, and it is why the render's cell contrast came back
 * five to eight times under the photograph's however the depth was set:
 * a profile that wide has no edge left in it to be dark.
 */
#define AUDI_GROOVE 0.34

/**
 * 0 in the middle of a groove, 1 anywhere on the flat pad.
 *
 * The groove is never allowed to be narrower than a pixel and a half: below
 * that it is a step, and a step is what beats against the pixel grid into
 * moiré. Widening it is also what a real tool radius does, so as the cells go
 * sub-pixel the profile opens smoothly out into a full-width flute rather than
 * breaking up.
 */
float audiPadProfile(float phase, float cpp) {
  // Half, because the distance measured is to the nearer of the two
  // boundaries and each of them owns half the groove.
  float g = 0.5 * clamp(max(AUDI_GROOVE, cpp * 1.6), 0.0, 1.0);
  return smoothstep(0.0, 1.0, clamp((0.5 - abs(fract(phase) - 0.5)) / g, 0.0, 1.0));
}

/**
 * Surface tilt across one run, −1..+1. Zero over the pad, hard over through
 * the groove, opposite signs on the groove's two walls.
 *
 * Fades to the run's own mean — zero, since the two walls cancel — as the run
 * stops being sampled.
 */
float audiPadTilt(float phase, float cpp, float res) {
  float t = fract(phase) - 0.5;
  return sign(t) * (1.0 - audiPadProfile(phase, cpp)) * res;
}

/**
 * RMS tilt over one cell: the groove's two walls cover AUDI_GROOVE of the
 * pitch between them, so it is sqrt(g * 0.371) for a smoothstep wall — 0.371
 * being the integral of (1 - smoothstep)^2 over one wall. This is the spread
 * the gate has to average over once a pixel can no longer tell one wall from
 * the other.
 */
#define AUDI_TILT_RMS 0.3550

/** Mean of the pad profile over one cell — half a groove's worth of missing pad. */
#define AUDI_PAD_MEAN 0.83

/**
 * Band limit for this lens's creases, in place of audiCreaseRes().
 *
 * The shared one starts surrendering at 0.06 cycles per pixel and is gone by
 * 0.26 — that is, it begins giving up the facet flip at **seventeen pixels a
 * cell** and has abandoned it by four. It is sized for the headlamp, whose
 * flutes are 5.5 mm on a part that spends most of its life small in frame, and
 * for that it is right.
 *
 * It is not right here, and it was the whole of the remaining contrast
 * deficit. A taillamp cell is 2.8 mm and the close-up frames it at seven to
 * ten pixels, where the photograph resolves the grooves completely: measured,
 * the reference swings 21-37 grey levels down the cell. The shared curve was
 * holding the render at 0.63 of the tilt at that size, which drops the facet
 * to 35 degrees against a 42 degree critical angle — so the blaze never fired
 * at all, and the lens came back at 3.7 levels. Raising the slope did nothing
 * because the slope was being scaled away before it was used.
 *
 * Fading over 0.18..0.42 instead keeps a real band limit — it is gone before
 * Nyquist, and the crease is surrendered toward its own mean exactly as
 * before, so the lamp neither aliases nor changes colour with distance — while
 * letting a cell that occupies five pixels or more actually be drawn.
 *
 * Local rather than in shaders/surfaces.ts for the same reason the pad
 * profile is: the headlamp's V-cut flutes must keep the curve they have.
 */
float audiLensCrease(float cyclesPerPixel) {
  return 1.0 - smoothstep(0.18, 0.42, cyclesPerPixel);
}
`;

const LENS_SETUP = /* glsl */ `
AudiFrame audiLensFr = audiMakeFrame(vAudiObjPos, -vViewPosition);
vec3 audiLensNObj = normalize(vAudiObjNormal);
vec3 audiLensVo = normalize(audiViewToObj(audiLensFr, normalize(vViewPosition)));

// Into the body, and on to the back face where the prisms live.
vec3 audiLensRay = refract(-audiLensVo, audiLensNObj, 1.0 / uLensIor);
float audiLensCosT = max(-dot(audiLensRay, audiLensNObj), 0.18);
float audiLensPath = uLensOptics.x / audiLensCosT;

// --- where the flutes are, and where they point ---------------------------
// Two different questions, and conflating them is what made the lens swirl.
//
// A moulded prism grid is cut into the back face on the *mould's* axes, so its
// phase is a straight linear ramp in the part's own coordinates. Measuring it
// instead along an axis re-projected onto the interpolated normal — which is
// what this did — evaluates 'dot(objPos, across)' against a position vector
// nearly four metres from the car's origin. At that lever arm a tilt of one
// twentieth of a degree in the normal slides the phase by a whole 5.5 mm
// pitch, so the flutes stop being parallel and close into contours: the
// fingerprint rings, which are not aliasing at all and which no amount of
// band-limiting or supersampling can remove.
//
// So the *phase* rides on fixed part axes, and only the *facet tilt* is
// re-projected onto the local normal, where a slow rotation over a curved lens
// is what a real moulding does anyway and costs nothing.
//
// A lamp that faces sideways (a marker in a bumper end) picks the other axes
// so the runs never go degenerate.
vec3 audiAxisA = abs(audiLensNObj.x) > 0.7 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
vec3 audiAxisB = abs(audiLensNObj.y) > 0.7 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
vec3 audiAcross = normalize(audiAxisA - audiLensNObj * dot(audiAxisA, audiLensNObj) + vec3(1e-5));
vec3 audiAlong = normalize(cross(audiLensNObj, audiAcross));

// --- how fast the flutes run on screen ------------------------------------
// Everything below — the facet flip, the TIR blaze, the glint lobe, the depth
// banding — is a strictly periodic pattern read through a parallax offset, and
// every one of them has to be band-limited *at the source*. Jittering the
// projection, as the accumulation pass does, resamples the same aliased signal
// sixteen times and averages sixteen copies of the same moiré.
float audiPitchA = uLensOptics.y;
float audiPitchB = uLensOptics.y * uLensBody.w;
// The prisms live on the back face, so the grid is read through the refracted
// ray: the flutes slide against the outer surface as the eye moves, which is
// the part's strongest depth cue. Bounded by the slab — the refracted ray can
// never exceed the 42° critical angle, so the slide tops out near 3 mm.
float audiPhaseA = (dot(vAudiObjPos, audiAxisA) + dot(audiLensRay, audiAxisA) * audiLensPath) / audiPitchA;
float audiPhaseB = (dot(vAudiObjPos, audiAxisB) + dot(audiLensRay, audiAxisB) * audiLensPath) / audiPitchB;
float audiCppA = audiPhaseRate(audiPhaseA, audiLensPath, audiLensNObj, audiPitchA);
float audiCppB = audiPhaseRate(audiPhaseB, audiLensPath, audiLensNObj, audiPitchB);

// Two limits per run. The creases go first and go early; the fundamental
// survives nearly to Nyquist, so the lens keeps its banding long after it has
// stopped trying to draw individual facet edges.
float audiCreaseA = audiLensCrease(audiCppA);
float audiCreaseB = audiLensCrease(audiCppB);
float audiLensSharp = max(audiCreaseA, audiCreaseB);

// The two runs are NOT cut to the same depth, and equalising them is the whole
// of the "uniform low-contrast orthogonal grid" report.
//
// Phase-averaged over every cell of five flat patches on the 2048 px close-up,
// with a quadratic form fit removed first, the two families come out three to
// four times apart:
//
//                              down (rows)   across (cols)
//   clear reversing window       30 lv          12 lv
//   amber above the window       25 lv           7 lv
//   amber outer cell             17 lv           3 lv
//
// "Down" is the modulation you see moving vertically, which is produced by the
// grooves that run *horizontally* — run B, the fine one. So the fine
// horizontal grooves are deep and the coarse vertical ones are a shallow
// cross-cut for spread, which is what a period signal lens is: cylindrical
// flutes with a light cross-hatch, not a waffle iron.
//
// A previous round had this asymmetry and had it the wrong way round
// (audiSlopeB = z * 0.24 — the fine run held shallow), and the round after
// that removed it, arguing the sky would supply the difference by itself: a
// facet tilted up or down swings between sky and ground where one tilted left
// or right does not. That is true of a *sky*, and this scene's is a nearly
// uniform hemisphere, so it supplied nothing — the render came back isotropic
// to within a grey level and read exactly like a halftone screen. The tool has
// to carry it.
// Applied to the cross run's *depth* as well as its slope, below. Slope alone
// did nothing: measured on the render, the visible grid comes overwhelmingly
// from the sag term, which was a symmetric min() of the two runs and therefore
// isotropic whatever the slopes were set to. Shallowing the tilt and leaving
// the groove its full depth just moves the halftone from one term to another.
// 0.30 was too deep a cut. Measured as 2-D local contrast rather than as a
// 1-D profile — which is the honest way to ask, because a profile averaged
// along 300 px of a lens a few degrees off square destroys the run that is
// square to it and keeps the other — the reference's two families carry
// *near-equal energy*: sigma down 13.5-20.0 against across 11.9-17.1, a ratio
// of 0.92-1.29. What is asymmetric is their coherence. The horizontal grooves
// run dead straight the width of the cell and the vertical ones are broken by
// them, which is what a 1-D fold reads as 3:1 and what the eye reads as
// fluting. So the cross run is scored, not skipped.
#define AUDI_CROSS 0.55
float audiSlopeA = uLensOptics.z * AUDI_CROSS;
float audiSlopeB = uLensOptics.z;
float audiEa = 0.0;
float audiEb = 0.0;
#ifdef AUDI_PRISMATIC
  audiEa = audiPadTilt(audiPhaseA, audiCppA, audiCreaseA) * audiSlopeA;
  audiEb = audiPadTilt(audiPhaseB, audiCppB, audiCreaseB) * audiSlopeB;
#endif
vec3 audiFacetObj = audiPrismFacetNormal(audiLensNObj, audiAcross, audiAlong, audiEa, audiEb);
vec3 audiFacetV = normalize(audiObjToView(audiLensFr, audiFacetObj));

// Total internal reflection is the whole point of a moulded prism. Looking
// out through acrylic, anything steeper than the critical angle (42°) is
// reflected *completely* rather than at the 4 % a flat interface would give,
// so the facets that happen to exceed it blaze while their neighbours stay
// dark. That hard split between adjacent facet families is the pattern a
// period lamp actually shows, and nothing else reproduces it.
//
// It is also a *step*, and a step sampled once per pixel is the dot-matrix
// crosshatch. Once a pixel covers more than one facet it has to return the
// family's average rather than whichever member it happened to land on, and
// widening the step by the spread of cos(theta) across the facets the pixel
// can no longer separate does exactly that — in one evaluation, and per run,
// so a coarse run that is still resolved keeps its hard split while the fine
// run that is not dissolves into its mean instead of beating against the grid.
float audiRn = dot(audiLensRay, audiLensNObj);
float audiRa = dot(audiLensRay, audiAcross);
float audiRb = dot(audiLensRay, audiAlong);
float audiCritCos = sqrt(max(1.0 - 1.0 / (uLensIor * uLensIor), 0.0));
#define AUDI_TIR_GATE(ea, eb) \
  (1.0 - smoothstep(audiCritCos - 0.06, audiCritCos + 0.06, \
                    audiPrismCosI(audiRn, audiRa, audiRb, (ea), (eb))))
// The gate is a step, and a step sampled once per pixel is the crosshatch. So
// it is evaluated over the spread of tilts the pixel can no longer separate —
// the part of each run's sawtooth the band limit has already surrendered —
// quadratured at the RMS tilt of a uniform sweep. Four evaluations of a
// five-instruction function.
//
// The residual goes to zero exactly as the crease survives, so a resolved run
// keeps its hard split while an unresolved one dissolves into its own mean
// instead of beating against the pixel grid. Per run, so a coarse run that is
// still resolved is not dragged down by a fine one that is not.
float audiTirSa = 0.0;
float audiTirSb = 0.0;
#ifdef AUDI_PRISMATIC
  audiTirSa = audiSlopeA * AUDI_TILT_RMS * (1.0 - audiCreaseA);
  audiTirSb = audiSlopeB * AUDI_TILT_RMS * (1.0 - audiCreaseB);
#endif
float audiTir = 0.25 * (AUDI_TIR_GATE(audiEa + audiTirSa, audiEb + audiTirSb)
                      + AUDI_TIR_GATE(audiEa + audiTirSa, audiEb - audiTirSb)
                      + AUDI_TIR_GATE(audiEa - audiTirSa, audiEb + audiTirSb)
                      + AUDI_TIR_GATE(audiEa - audiTirSa, audiEb - audiTirSb));

// Mean of min(scored cross run, full-depth fine run) over one cell. The fine
// run dominates it; the cross run only removes the little that is left where
// the fine run is on its pad. 0.70 * (1 - AUDI_CROSS * 0.30 * ...) to two
// figures, and it only has to be close: it is the anchor that keeps the lens
// the same colour whether or not its cells are resolved, not a light value.
#define AUDI_WAFFLE_MEAN 0.81

float audiPrismH = 1.0;
// How far into a groove wall this pixel is: 0 on the flat pad, 1 at the
// deepest cut. It falls to 0 with the sag when the cells stop resolving, so it
// carries no aliasing of its own.
float audiWall = 0.0;
#ifdef AUDI_PRISMATIC
  // Two crossed runs cut into one face, so what is left standing is the
  // *lower* of the two: a point inside either groove is cut away whether or
  // not it is inside the other. That is min(), and here — unlike on a pair of
  // full-width triangle runs, where min() collapses to a single peak per cell
  // — it is exactly right, because two narrow grooves crossed leave a wide
  // flat pad with a continuous groove network around it.
  // The cross run is a *scoring* cut, not a groove: AUDI_CROSS of the depth of
  // the fine run beside it. Without that the two runs are interchangeable and
  // min() of them is symmetric in x and y by construction — which is a
  // halftone screen and cannot be anything else, however the slopes are set.
  //
  // Measured: sigma down 7.8-11.2 grey levels against sigma across 1.9-4.3 on
  // the reference, and 1.3 against 3.6 on the render before this. Not merely
  // weak — the wrong way round.
  float audiPadA = audiPadProfile(audiPhaseA, audiCppA);
  float audiPadB = audiPadProfile(audiPhaseB, audiCppB);
  audiPrismH = mix(AUDI_WAFFLE_MEAN,
                   min(mix(1.0, audiPadA, AUDI_CROSS), audiPadB),
                   min(audiPeriodRes(audiCppA), audiPeriodRes(audiCppB)));
  // The lenslets are pressed into the *back* of the slab, so a crease sits
  // most of a millimetre deeper than a cell centre and the light crossing it is
  // absorbed that much harder. This is what banks the lens light-to-dark at
  // pitch and gives the part its thickness; without it the cells are only a
  // normal map.
  //
  // Because the sag fades to its own mean rather than to a flat face, the
  // *average* extra depth survives the band limit intact: a lens whose cells
  // have gone sub-pixel is the same colour and the same darkness as one whose
  // cells are resolved. It simply stops banding.
  // Depth scales with the *deep* run's pitch and slope — run B — because that
  // is the groove doing the cutting. The shallow cross-cut adds almost nothing.
  audiWall = clamp((AUDI_WAFFLE_MEAN - audiPrismH) / (AUDI_WAFFLE_MEAN - 0.12), 0.0, 1.0);
  audiLensPath += (1.0 - audiPrismH) * audiPitchB * uLensOptics.z * 0.5;
#endif

// Beer–Lambert over the true path. sigma is set so that *one* crossing of the
// lens's mean path reproduces the nominal dye colour exactly — see
// createLens(): what uLensColor states is the dye's single-pass
// transmittance, and an unlit lamp is seen through roughly the square of it.
//
// Normalising on the bare slab instead — which is what this did — is only
// right for a lens with no prisms in it. Once the creases lengthen the mean
// path by a further 27 %, every prismatic lens comes out more saturated than
// the colour it was handed, and by a different amount for every pitch and
// slope anyone sets. Measured against the photograph that cost the amber a
// third of its green.
//
// The floor is only there to keep log() finite and has to sit *below* every
// channel of every lens colour on the car. At 0.015 it did not: the darkest
// channels of the signal reds and ambers are 0.006–0.009 in linear light, so
// the clamp was raising them — two to three times in the case of amber's blue
// — and no dye on the car could extinguish anything. That single number is
// what made an unlit lens read as a lit one: a lamp whose filament is on is
// pale because it is *desaturated*, and this was desaturating the lens the
// same way, to a measured blue of 0.053–0.150 of the licence plate against a
// photographed 0.006.
float audiMeanPath = uLensOptics.x;
#ifdef AUDI_PRISMATIC
  audiMeanPath += (1.0 - AUDI_WAFFLE_MEAN) * audiPitchB * uLensOptics.z * 0.5;
#endif
vec3 audiLensSigma = -log(clamp(uLensColor, vec3(0.0015), vec3(0.999))) / max(audiMeanPath, 1e-5);
vec3 audiLensAbsorb = exp(-audiLensSigma * audiLensPath * uLensBody.x);

vec3 audiLensGlint = vec3(0.0);
vec3 audiLensRetro = vec3(0.0);
// Direct irradiance on the lens face, collected in the directional loop
// because the irradiance three has in scope at the transmission stage holds
// the ambient and probe terms only — the sun goes through RE_Direct into
// reflectedLight and never reaches a variable that survives to there.
vec3 audiLensDirect = vec3(0.0);
// Scale factor handed to the transmission volume: true slab path, lengthened
// again wherever the prism is cut deepest. The colour itself comes from the
// attenuation over that distance, not from a tint on the surface.
float audiLensThickScale = audiLensPath / max(audiMeanPath, 1e-5);
// What the eye actually reads as relief on an *unlit* lens is the reflector
// behind it appearing and disappearing cell by cell, and that is the gate
// above, not a shading term: past the critical angle a lenslet returns the
// light it was handed *completely* instead of letting the bowl through, so the
// bowl is simply not visible there and the cell goes dark. Scaling the
// transmitted sample by the gate is the whole of it.
//
// The previous height-only modulation could not do this. It is symmetric about
// each cell's centre, so however far it was pushed — 0.78..1.0, then
// 0.62..1.0 — all it could ever draw was a round dot per cell, which is the
// reported crosshatch. The sag is kept, but as the small second-order term it
// is.
//
// A smooth lens holds the gate at its flat-face value and the sag at 1.0, so
// it is left alone.
// The sag's own share is deepened from 12 % to 38 %. The note above — that
// pushing it only ever drew a rounder dot — was written when the profile was a
// symmetric min() of two equal runs, where depth is genuinely all it could
// buy. Against a scored cross run it buys a line, because that is now the
// shape of the thing being deepened.
//
// And the gate is driven by the groove as well as by the cosine test, which is
// the change that finally put contrast on the part. The cosine test is the
// right physics and it is also *marginal*: it asks whether the facet mean is
// past 42 degrees at the angle this pixel is viewed from, and over most of a
// lens most of the time the answer is no, so the optic this whole file is
// built around was contributing a 2 % ripple. Where a pixel is in a groove
// wall at all, part of the cone it gathers is past the critical angle whatever
// the mean does — a wall is a continuum of facets, not one — so the wall
// blazes. audiWall is geometry rather than a test and cannot go marginal.
//
// Measured as 2-D local sigma at matched magnification, which is what the eye
// reads: reference 16.4-23.5 grey levels across the amber and the clear
// window, render 5.4 before this.
float audiBlaze = max(audiTir, audiWall);
diffuseColor.rgb = vec3(mix(1.0, 0.16, audiBlaze) * mix(0.50, 1.0, audiPrismH));
`;

const LENS_GLINT = /* glsl */ `
{
  // A flat facet returns a light source as a point, not a streak: a very tight
  // lobe about the facet normal, which is why a lens twinkles in a pan.
  //
  // A lobe that tight is a delta function to a pixel, so once the pixel covers
  // more than one facet it must return the lobe *averaged over* them: broader,
  // and lower in the same proportion, so the energy is unchanged. The lens
  // stops twinkling and starts glowing at exactly the distance a real one
  // does, instead of flickering on one pixel in three.
  vec3 audiLh = normalize(directLight.direction + geometryViewDir);
  float audiLnl = saturate(dot(geometryNormal, directLight.direction));
  float audiLfh = saturate(dot(audiFacetV, audiLh));
  float audiLp = mix(26.0, 320.0, audiLensSharp);
  audiLensGlint += directLight.color * audiLnl * pow(audiLfh, audiLp)
                 * 0.55 * ((audiLp + 1.0) / 321.0) * mix(0.1, 1.0, audiTir);
}
`;

/**
 * The cat's-eye return, spliced into the directional-light loop.
 *
 * ## Why a headlamp is a retroreflector, and why it is a flat block
 *
 * A paraboloid collimates whatever sits at its focus. Run that backwards:
 * collimated light entering the aperture — the sun — converges on the focus,
 * and in an H4 lamp the focus is *occupied*. The filament, its shield, the
 * black-tipped envelope and the collar are all sitting there, and they
 * scatter. Whatever leaves the focus is then re-collimated back out along the
 * lamp's axis, i.e. back towards where it came from. Lens in front, mirror
 * behind, scatterer between: that is the cat's-eye, the same construction as
 * a road stud, and it is why walking towards a parked car with a torch lights
 * its headlamps up.
 *
 * The consequence that matters here is not the brightness but the **shape**.
 * Every point of the paraboloid maps to the *same* focus, so the return does
 * not depend on where in the aperture you look: the lamp reads as one flat
 * block, edge to edge, rather than as a mirror with the sun's image somewhere
 * on it. Measured on the reference photograph across the lamp's whole width,
 * 228-243 with no falloff at either end. A mirror bowl cannot do that — a
 * mirror has one point whose normal bisects the sun and the eye, so it
 * returns one hot lobe per chamber, which is exactly what this render did:
 * 249 at two lobe centres, 218-226 in the troughs between and beside them.
 *
 * So this term is added flat across the aperture, and the lobes it replaces
 * are taken down by `spread`.
 *
 * ## The divergence is broadened, as the plate's is, and for the same reason
 *
 * The cat's-eye's own divergence is set by the scatterer's size against the
 * focal length: ~10 mm of bulb hardware at f = R²/4D ≈ 27 mm is a lobe some
 * 10° wide. In the `photomatch` pose the sun stands **47°** off the view axis
 * at the near lamp and **63°** at the far one, so at the true divergence this
 * would be identically zero in the one frame it exists to reproduce. As with
 * `materials/printed.ts`, `retroLobe` is a broadened stand-in and is a tuning
 * parameter, not a photometric figure.
 *
 * Broadening it is less of a lie here than it is for sheeting, because the
 * cat's-eye is not the only return path. The bowl, the shelf, the housing and
 * the dividers are all vacuum-aluminised — `headlamp.ts` says why — so the
 * lamp is also a partially-diffusing cavity of 88 % mirror, and a cavity
 * returns light over a wide cone weighted towards the way it came in.
 *
 * ## Two cosines on the entrance angle
 *
 * One is the plain projected irradiance: this is added outside `RE_Direct`,
 * so nothing else applies it. The second is the aperture's own vignetting —
 * a 52 mm deep box seen through a 168 mm slot loses its far wall quickly as
 * it turns away from the light, and the paraboloid stops re-collimating what
 * it does collect.
 *
 * That pair is also what keeps the other presets out of this, which is the
 * whole test of whether a retro term is honest: on a near-vertical lamp face
 * `noon` and `overcast` stand at 70° of solar elevation, so the squared
 * cosine is 3.2x smaller than at golden hour before the lobe is even asked.
 *
 * ## Tinted by the dye, not by a white Fresnel
 *
 * The return crosses the lens body twice — in, off the optic, out — which is
 * exactly the two passes `uLensBody.x` already describes, so it is applied
 * through `audiLensAbsorb` in `LENS_APPLY` like the glint and the internal
 * reflection. That is deliberate and it is the reason this is not
 * `specularIntensity`: a front-surface Fresnel term is untinted by
 * construction, and buying level with it is what put white into the red
 * taillamp and made the cluster read as switched on. An amber section returns
 * amber light; a water-clear section returns the sun.
 */
const LENS_RETRO = /* glsl */ `
{
  float audiRetroObs = dot(geometryViewDir, directionalLight.direction);
  float audiRetroEnt = max(dot(geometryNormal, directionalLight.direction), 0.0);
  audiLensRetro += uLensRetro.x * pow(max(audiRetroObs, 0.0), uLensRetro.y)
                 * audiRetroEnt * audiRetroEnt * RECIPROCAL_PI * directionalLight.color;
}
`;

/**
 * Collect the sun's projected irradiance for `LENS_CAVITY`.
 *
 * Unshadowed, for the reason set out at length for the cat's-eye above and in
 * `materials/printed.ts`: the photograph's lamp reads 232 with the car under
 * the grove, and what fills a cavity whose aperture faces the low sun is the
 * whole sun-side sky, not the sun's disc alone. The directional loop is also
 * the only light loop this may run in — the lamp's own beam is a spotlight,
 * so a cavity term gathered from every light would switch itself on with the
 * headlights, which is the one state it must never contribute to.
 */
const LENS_DIRECT = /* glsl */ `
audiLensDirect += directionalLight.color
  * max(dot(geometryNormal, directionalLight.direction), 0.0);
`;

/**
 * **Why an aperture is flat, and why the renderer cannot make it flat.**
 *
 * The sun off the reflector is the whole of the structure in an unlit lamp,
 * and this is measured rather than argued: driving `transmission` to zero on
 * the headlamp lens in the `photomatch` frame collapses the aperture from
 * 222-239 down its height and 221-248 across it to **243-247 both ways**,
 * flat to a grey level and a half. Every lobe, every gradient and the whole
 * vignette are the transmitted image of the bowl; nothing else in this shader
 * contributes any of it. The same probe run against the front-surface Fresnel
 * (`specularIntensity` 0.18 -> 0) and against the internal reflection
 * (`uLensOptics.w` 0.88 -> 0) moved the aperture's column range by 0.0 and
 * 1.2 grey levels respectively, so neither is a candidate.
 *
 * The photograph has no structure of that kind: 228-240 corner to corner,
 * column range 13 and row range 10, with the only variation in it being the
 * bulb hardware showing faintly through. So the model has to remove the
 * bowl's image, not add something on top of it.
 *
 * ## The flutes do it, and they do it by convolution
 *
 * A fluted lens is a lenslet array. What leaves the aperture in a given
 * direction is not the bowl at that point but the bowl *convolved* with the
 * lens's scattering kernel, over a cone tens of degrees wide. A 52 mm cavity
 * behind a kernel that broad is averaged out completely: the integral stops
 * depending on where in the aperture you look. That is why the real part is a
 * block, and it is the same reason a ground-glass screen shows an even field.
 *
 * ## `spread` is the wrong domain for it, and the sweep says so
 *
 * `spread` asks three's transmission for that convolution, and three's
 * transmission is a *screen-space* mip of the opaque buffer. Blurring in
 * screen space does not stay inside the aperture: it averages in the grille
 * and the bumper around the lamp. Swept in the same frame, the aperture's
 * column range does not move at all — 27.6 at spread 0.05, 27.6 at 0.18,
 * 26.1 at 0.35 — while the mean falls 235 -> 228 -> 194. All cost, no
 * flattening. Raising the lens's own `roughness` to 0.6 does the same thing
 * harder: 188 mean, column range still 25.
 *
 * So the convolution is done here instead, in the one term that does not need
 * neighbouring pixels: mix the transmitted image towards the cavity's
 * *average* radiance. That average is modelled as a Lambertian of apparent
 * reflectance `uLensCavity.y` under the irradiance the aperture actually
 * receives — which is what an integrating cavity is. Sphere theory puts that
 * reflectance at rho*f/(1 - rho(1 - f)); for this lamp's 88 % aluminised
 * walls and an aperture about a third of the internal area, 0.70. Swept
 * against the photograph the headlamp wants 0.59, and it should: 0.70 is the
 * figure for a cavity that *diffuses*, and a mirror cavity puts part of its
 * return into the retro lobe rather than into the average. `headlamp.ts`
 * carries the sweep and says why the value it ships is higher still.
 *
 * This is a redistribution, not a source: it replaces transmitted light
 * rather than adding to it, so the aperture's mean is preserved and only its
 * variance falls. The *directional* excess over that average stays where it
 * was, in the cat's-eye term above — which is exactly what a retroreflector
 * is, and why `LENS_RETRO`'s units (1.0 = a Lambertian of the same albedo)
 * and this term's are the same units.
 *
 * Tinted by `audiLensAbsorb` like everything else that has been inside the
 * lamp: an amber section returns amber, a clear section returns the sun.
 */
const LENS_CAVITY = /* glsl */ `
totalDiffuse = mix(
  totalDiffuse,
  uLensCavity.y * (audiLensDirect + irradiance + iblIrradiance)
    * RECIPROCAL_PI * audiLensAbsorb,
  uLensCavity.x );
`;

const LENS_APPLY = /* glsl */ `
{
  float audiBlaze = max(audiTir, audiWall);
  vec3 audiInternal = audiLensGlint + audiLensRetro;
  #ifdef USE_ENVMAP
    // What a pixel holds once the flutes go sub-pixel is a *distribution* of
    // facet normals, not one of them. Surrendering the spread to roughness —
    // the band limit's share analytically, the residual per-pixel swing
    // measured — keeps the internal reflection at the same brightness while it
    // stops resolving into a sparkling grid.
    float audiFacetRough = audiSpecularAA(
      audiFacetV, uLensBody.z + (1.0 - audiLensSharp) * 0.30, 0.25, 0.25);
    // Blazes with the groove, and the diffuse term goes dark by the same gate,
    // so the two *swap* rather than both brightening: a cell centre shows the
    // bowl through the dye, a groove wall shows the sky off the prism. That
    // exchange is the relief.
    audiInternal += getIBLRadiance(geometryViewDir, audiFacetV, audiFacetRough)
                  * uLensOptics.w * mix(0.05, 1.0, audiBlaze);
  #endif
  // Seen through the body, so tinted by the path it crossed to get out.
  reflectedLight.indirectSpecular += audiInternal * audiLensAbsorb;
}
`;

/**
 * A moulded lens.
 *
 * `color` is the dye's **single-pass transmittance**, not the colour the part
 * photographs as. An unlit lamp is seen by light that crosses the dye twice —
 * in through the glass, off the reflector, back out — so what you see is
 * roughly the *square* of what you pass here. Handing this function the colour
 * you want to see is the mistake that made the whole cluster read as switched
 * on: it deletes one of the two crossings, and a lens missing a crossing is
 * exactly a lens with a lamp behind it.
 *
 * So `LIGHTS.tailColor` and friends, which are signal colours, are not lens
 * dyes; `taillamp.ts` states its dyes separately and says where they came
 * from.
 */
export function createLens(color: number, opts: LensOptions = {}): THREE.MeshPhysicalMaterial {
  const prismatic = opts.prismatic === true;
  const retroGain = Math.max(opts.retroGain ?? 0, 0);
  const retroLobe = opts.retroLobe ?? 2;
  const spread = Math.max(opts.spread ?? 0, 0);
  const homogenise = THREE.MathUtils.clamp(opts.homogenise ?? 0, 0, 1);
  const cavity = Math.max(opts.cavity ?? 0.70, 0);
  const tint = new THREE.Color().setHex(color, THREE.SRGBColorSpace);

  const uniforms = {
    uLensColor: { value: tint },
    // Pitch settled on **two frames that disagree about nothing**, which is
    // what makes it trustworthy — the oblique 2048 px close-up
    // `scratchpad/ref3/bat3_badge_audi5000cs_tailgate.jpg`, and the dead-on
    // `scratchpad/ref3/bat_rear_straight.jpg`, whose foreshortening is the one
    // thing the close-up cannot rule out by itself.
    //
    // Sub-pixel pitch by maximising folded variance, on five flat patches per
    // frame with a quadratic form fit removed first:
    //
    //                    close-up            dead-on
    //   across          14.0 px             5.0 px
    //   down             9.0 px             3.0 px
    //
    // The close-up's vertical scale is fixed by the lamp band itself, 647 px
    // for a 205 mm cluster = 3.16 px/mm, giving 2.85 mm down. The dead-on
    // frame's is fixed by the cluster's 675 mm width, 760 px = 1.13 px/mm,
    // giving 4.44 mm across and 2.66 mm down. Those two independent scales
    // agree on the vertical pitch to 7 %, and the across figure then implies a
    // horizontal scale for the close-up of 3.15 px/mm — equal to its own
    // vertical one, i.e. the close-up is not measurably foreshortened in the
    // lamp plane after all. So both frames say the same thing:
    //
    //   **4.4 mm across, 2.8 mm down.**  Ratio 0.64.
    //
    // The review's 5–6 mm is coarse and square; the round before this had the
    // right vertical pitch (2.86 mm) and the round before *that* 4.1 x 3.1.
    // w is the internal reflection's gain: the share of what the prism field
    // returns that comes back out at the eye, *after* crossing the dye. Past
    // the critical angle a facet reflects the whole of what it was handed, so
    // unity is the physical ceiling and near it is the honest setting; 0.32
    // was leaving two thirds of the light a real lens returns on the table and
    // handing the difference to an untinted front-surface term instead. It is
    // also what makes a groove wall read *bright* rather than dark, which the
    // reference's folded cell profile is unambiguous about: a narrow +15 grey
    // level spike per cell over a darker field, not a dark line on a light one.
    // z is the facet slope. 0.85 is a 40 degree facet against acrylic's 42
    // degree critical angle, so it could never total-internal-reflect and the
    // blaze the whole optic is built around never fired; period lens tooling
    // cuts these at 45 and over precisely so that it does. 1.15 is 49 degrees,
    // which clears it with the margin the band limit then eats into.
    // w at 1.05 was a bright, almost unmodulated veil over the whole lens: it
    // lifted the level, which was wanted, and washed the cell relief down from
    // 8.1 grey levels of local sigma to 5.4, which was not. It only pays once
    // the gate driving it actually varies, which it now does.
    uLensOptics: { value: new THREE.Vector4(0.0034, 0.0044, 1.15, 0.88) },
    // x is the number of times light crosses the dye before it reaches the
    // eye: two, for the reflector return.
    uLensBody: { value: new THREE.Vector4(2.0, 0.09, 0.07, 0.64) },
    uLensIor: { value: LENS_IOR },
    uLensRetro: { value: new THREE.Vector3(retroGain, retroLobe, spread) },
    uLensCavity: { value: new THREE.Vector2(homogenise, cavity) },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    // The outer face is moulded, not polished. Every close-up of the real part
    // shows it matte: the sky arrives as a broad sheen with no horizon in it,
    // and what little structure there is comes from inside. At 0.035 it was a
    // mirror, and on a lens crowned 1.4 mm out of its own plane a mirror
    // returns the sun as one blown-out smear across the middle of the cell,
    // which flattens the moulding under it. This also blurs the transmitted
    // image, which is right: a prism field scatters what is behind it.
    roughness: 0.20,
    ior: LENS_IOR,
    // 1.0 is the physical 3.9 % Fresnel of acrylic, and it is wrong here for a
    // reason that lives outside this file: 'getIBLRadiance' integrates an
    // *unoccluded* hemisphere, and this lens does not have one. The real part
    // sits at the bottom of a 40 mm aperture between the tailgate lip, the
    // bumper and the quarter panel, so most of what it is being handed — in
    // particular the sky — it cannot see.
    //
    // The size of the correction is measured, not guessed. Segmenting the lamp
    // by hue on two photographs in two different lightings — the 2048 px
    // close-up and the daylight three-quarter 'bat3_rear3q_silver_b.jpg' —
    // gives the amber a blue of 0.005 and 0.006 of its own red, and the red
    // lens a green of 0.050 in both. At 1.0 this returned 0.069: enough
    // untinted white to drop the *red* lens below a 0.55 saturation threshold,
    // which is to say a hue segmenter could no longer tell it was a lamp. That
    // is precisely the complaint that the lenses are flat and switched on.
    //
    // If the scene ever gives recesses specular occlusion, put this back to 1
    // and delete this comment.
    //
    // 0.26 was too far, and 0.52 too far the other way: it doubled the level
    // but it tripled the *white* in the red lens, whose B/R went 0.024 -> 0.043
    // against a photographed 0.005-0.013. This term is the front-surface
    // Fresnel and it is untinted by construction, so it can only ever be a
    // leak; the brightness a real lens has comes from the light that goes in,
    // reflects off the prism field or the bowl, and comes back out *through the
    // dye*, which is `uLensOptics.w` below. Level was moved onto that, and this
    // left near where it was.
    //
    // The correction is real but it was set by pushing the
    // *red* lens back over a hue-segmenter's saturation threshold, which is a
    // one-sided test — it can only ever ask for less white, so it bottoms out
    // wherever it is pointed. Measured against the same two frames on the
    // other side: the reference amber returns 1.6x a white licence plate in
    // the red channel and the reference clear reversing window 1.03x, and
    // nothing Lambertian does that. Both are beating a white card because a
    // prism field over an aluminised bowl is a partial retroreflector, and at
    // 0.26 that whole contribution was gone — our clear window came back at
    // 0.79x. Half is the compromise the aperture actually justifies: ~40 mm of
    // it is open sky out of a notional hemisphere.
    specularIntensity: 0.18,
    // A lens has to be see-through, or the reflector behind it is wasted and an
    // unlit lamp is a flat coloured plate. Transmission is what makes the bowl,
    // the bulb and the housing visible *through* the dye, at the strength the
    // dye allows: a clear headlamp lens shows everything, a red taillamp lens
    // shows the same assembly drowned in crimson.
    transmission: 1,
    thickness: uniforms.uLensOptics.value.x,
    // Same floor as the shader's sigma, and for the same reason: above the
    // darkest real channel it stops being a guard and starts being a leak.
    attenuationColor: new THREE.Color(
      THREE.MathUtils.clamp(tint.r, 0.0015, 0.995),
      THREE.MathUtils.clamp(tint.g, 0.0015, 0.995),
      THREE.MathUtils.clamp(tint.b, 0.0015, 0.995),
    ),
    // Half the body thickness, so the transmission pass attenuates over *two*
    // crossings of it.
    //
    // The backdrop this samples is the reflector bowl as the renderer lit it —
    // that is, lit as though the lens were not in front of it. In the real part
    // the only light that ever reaches the bowl has already been through the
    // dye once, and then has to come back out through it. Attenuating once, as
    // this did, models a lamp whose reflector is lit from inside, which is what
    // the unlit cluster looked like.
    attenuationDistance: uniforms.uLensOptics.value.x / uniforms.uLensBody.value.x,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    envMapIntensity: 1,
    dithering: true,
  });

  extend(material, {
    // The retro and the spread are different *programs*, not different
    // settings — each splices GLSL of its own — so they have to key apart or
    // a headlamp and a taillamp would collapse onto one compiled program and
    // wear each other's optics.
    key: `audi-lens-${prismatic ? 'prism' : 'smooth'}${retroGain > 0 ? '-retro' : ''}`
      + `${spread > 0 ? '-spread' : ''}${homogenise > 0 ? '-cavity' : ''}-v7`,
    uniforms,
    defines: prismatic ? { AUDI_PRISMATIC: 1 } : undefined,
    expandChunks: ['lights_fragment_begin', 'transmission_fragment'],
    vertex: OBJECT_SPACE_VARYINGS.vertex,
    fragment: [
      { find: '#include <common>', replace: `$&\n${LENS_PRELUDE}` },
      { find: '#include <color_fragment>', replace: `$&\n${LENS_SETUP}` },
      {
        find: 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        replace: `$&\n${LENS_GLINT}`,
        all: true,
      },
      // The sun only. `getDirectionalLightInfo` is the one call site with the
      // unshadowed light struct and the geometry in scope at once, and it is
      // reached exactly once, by the directional loop — spliced at `RE_Direct`
      // instead, like the glint above, the lamp's own beam spotlight would
      // sit a centimetre in front of its lens at `cosObs` 1.0 and the term
      // would fire at full strength the moment the headlights were switched
      // on, which is the one state it must never contribute to.
      //
      // Unshadowed for the reason `materials/printed.ts` sets out at length
      // for the plate: what the cat's-eye returns is an integral over a broad
      // cone about the *view* axis, and the shadow map answers a question
      // about the sun's disc alone. The photograph settles it — its plate and
      // its headlamp both read ~236 in the same shade.
      ...(retroGain > 0 || homogenise > 0 ? [{
        find: 'getDirectionalLightInfo( directionalLight, directLight );',
        replace: `$&${homogenise > 0 ? `\n${LENS_DIRECT}` : ''}${retroGain > 0 ? `\n${LENS_RETRO}` : ''}`,
      }] : []),
      { find: '#include <lights_fragment_end>', replace: `$&\n${LENS_APPLY}` },
      // A fluted lens spreads what is behind it. Applied here rather than to
      // `material.roughness` itself because the outer face's own sheen is a
      // moulded finish and is measured; only the transmitted image is
      // scattered. Safe at this point in the shader — `transmission_fragment`
      // runs after all the lighting has been accumulated.
      ...(spread > 0 ? [{
        find: 'vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );',
        replace: '$&\n\tmaterial.roughness = min( 1.0, material.roughness + uLensRetro.z );',
      }] : []),
      {
        // True slab path, plus the extra depth of a prism valley. A lens is
        // banded light-to-dark at prism pitch because of this, not because of
        // any shading on its surface.
        find: 'material.thickness = thickness;',
        replace: 'material.thickness = thickness * audiLensThickScale;',
      },
      {
        // One needle, both terms, in the order they have to run: the flutes
        // homogenise what came *through* the lens, and the dye's own bulk
        // scatter is then added on top of the result rather than being
        // averaged into it.
        find: 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );',
        replace: /* glsl */ `$&${homogenise > 0 ? LENS_CAVITY : ''}
// The dye is a scattering medium, not just an absorber: the body stays
// luminous in shade instead of going to a dead black. This is the difference
// between a lamp that glows and a lamp that is a red sticker.
totalDiffuse += (irradiance + iblIrradiance) * RECIPROCAL_PI * audiLensAbsorb * uLensBody.y;
`,
      },
    ],
  });

  // Only lenses whose program actually carries the splices, so a sweep that
  // reports a change has made one.
  if (retroGain > 0 || spread > 0) lensLive.push(uniforms.uLensRetro);
  if (homogenise > 0) cavityLive.push(uniforms.uLensCavity);

  return material;
}

// ---------------------------------------------------------------------------
// Bulb / filament surfaces
// ---------------------------------------------------------------------------

/**
 * An emitting surface — a lit filament, a bulb envelope, an illuminated
 * instrument face.
 *
 * The rim lift is the detail worth having: a glowing diffuser is brighter at
 * its silhouette than at its centre, because you are looking through more of
 * the emitting volume. Without it a lit bulb reads as a flat disc of colour.
 */
export function createEmissive(color: number, intensity: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: new THREE.Color().setHex(color, THREE.SRGBColorSpace),
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0,
    toneMapped: true,
  });

  extend(material, {
    key: 'audi-emissive-v1',
    fragment: [
      {
        find: '#include <emissivemap_fragment>',
        replace: /* glsl */ `$&
{
  float audiNdV = saturate(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance *= mix(1.0, 2.4, pow(1.0 - audiNdV, 2.5));
}
`,
      },
    ],
  });

  return material;
}

/**
 * Live cat's-eye uniforms, in the house style of `__AUDI_RETRO`:
 *
 *   __AUDI_LENS.read()                     gain, lobe and spread per lens
 *   __AUDI_LENS.set(gain, lobe, spread)    sweep them live
 *
 * Here for the same reason the plate's is: these three are not independent of
 * how deep the grove's shade is or of how bright the reflector bowl behind
 * the lens comes out, and neither of those is this file's to set. Whoever
 * moves either has to re-read the lamp against the photograph's 228-243, and
 * without this that is a rebuild per sample.
 *
 * `set` announces `audi:materials-dirty` because it has to: the post chain's
 * accumulation buffer only drops when something *moves*, and a uniform change
 * moves nothing, so a sweep without it reads a blend of the previous fifteen
 * frames at the old value.
 */
const lensLive: Array<THREE.IUniform<THREE.Vector3>> = [];
const cavityLive: Array<THREE.IUniform<THREE.Vector2>> = [];

(globalThis as Record<string, unknown>).__AUDI_LENS = {
  read: () => lensLive.map((u) => ({ gain: u.value.x, lobe: u.value.y, spread: u.value.z })),
  readCavity: () => cavityLive.map((u) => ({ homogenise: u.value.x, cavity: u.value.y })),
  setCavity: (homogenise: number, cavity?: number) => {
    for (const u of cavityLive) {
      u.value.x = homogenise;
      if (cavity !== undefined) u.value.y = cavity;
    }
    globalThis.dispatchEvent?.(new Event('audi:materials-dirty'));
    return cavityLive.length;
  },
  set: (gain: number, lobe?: number, spread?: number) => {
    for (const u of lensLive) {
      u.value.x = gain;
      if (lobe !== undefined) u.value.y = lobe;
      if (spread !== undefined) u.value.z = spread;
    }
    globalThis.dispatchEvent?.(new Event('audi:materials-dirty'));
    return lensLive.length;
  },
};

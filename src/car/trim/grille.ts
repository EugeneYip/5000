/**
 * The grille — seven slats, eight apertures, four rings.
 *
 * Counted off 2048 px photography of a MY1988 North-American car: seven slats
 * between the bright upper and lower frame members, apertures roughly twice
 * the slat thickness so the grille reads dark overall, even pitch, dead
 * horizontal (`docs/REFERENCE-VEHICLE.md` §6.1). `HP.front.grilleSlats` is the
 * count; the pitch falls out of it and the aperture height, so neither is a
 * free number here.
 *
 * ## The grille is a dark mass, not a bright egg-crate
 *
 * Measured off the owner's photograph, white-balanced, through one pitch of
 * the grille (`docs/REFERENCE-PHOTO.md`):
 *
 * | | luminance |
 * |---|---|
 * | aperture — what you see between the slats | **23–26** |
 * | slat's own lit face, at its brightest | **52–64** |
 * | the bright frame above and below the aperture | **218–231** |
 *
 * Three facts follow, and the render had all three wrong.
 *
 *  1. **The aperture is a void.** Behind the slats is an engine bay seen
 *     through a radiator core, lit by nothing. It has to render at a quarter
 *     of the bumper's value. It used to render at 50, because the recess wore
 *     `blackTrim` at `envMapIntensity` 0.9 and three has no occlusion to stop
 *     the whole sky reaching a surface 52 mm inside a 14 mm slot. Nothing in
 *     the pipeline will darken that for us — GTAO runs at half resolution
 *     behind a 6 px denoise and cannot see an 8 px slot — so the cavity is a
 *     `printed` surface with its own low `envMapIntensity`, which is where the
 *     occlusion that the renderer will not compute is carried.
 *  2. **The slats are not chrome.** In the same frame, at the same exposure,
 *     the frame member reads 225 and the slat reads 57 — a factor of four, so
 *     they are not the same finish. The slat is satin dark anodised with a
 *     fine bright crest along its leading edge, and it is the crest, about a
 *     millimetre of it, that is bright. Modelled as polished chrome over its
 *     whole 6 mm face it rendered at 205 and the grille came out silver.
 *  3. **A rounded nose is a sky mirror.** The leading edge used to break over
 *     1.2 mm — a fifth of the slat — and an arc that wide sweeps the normal
 *     through every angle from straight-ahead to straight-up, so it finds the
 *     sun wherever the sun is. The break is 0.35 mm now, which is what an
 *     extruded rib actually has.
 *
 * The slat is therefore two parts: a dark blade with a top face that runs back
 * and *down*, so its normal tilts into the cavity rather than at the sky, and
 * a 0.5 mm bright crest bead standing a quarter of a millimetre proud of it.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { audiMaterials } from '@/materials/library';
import type { BuildContext } from '@/types';
import { fourRings, ringsWidth } from './rings';
import { noseFaceZ } from './bodyref';
import { makeCanvas } from './glyphs';
import { arc, at, lerp, merge, mesh, roundedBox, sweep, type Frame, type Pt } from './util';

const F = HP.front;

/** Depth of a slat, front to back. */
const SLAT_DEPTH = 0.0105;
/** Where the slat fronts sit: the quoted recess behind the grille datum. */
const SLAT_Z = F.grilleZ - F.grilleRecess;
/** The dark box behind the slats, and the core in front of its back wall. */
const BACK_Z = SLAT_Z - 0.052;

/** Edge break on the slat's leading edge. An extruded rib, not a wire. */
const EDGE_BREAK = 0.00035;
/**
 * The bright crest: how tall it is, and how far proud of the blade it sits.
 *
 * 0.5 mm on a 6.1 mm blade — a twelfth of the pitch, a fifth of a pixel at
 * the reference framing. That is deliberate. Everything about the
 * grille's *value* has to come from the blade and the void; the crest is there
 * to put the fine bright line in a close-up, and any wider it starts carrying
 * the grille's exposure instead.
 *
 * ## It is not chrome, and §2.1 is not the only reason
 *
 * The rib wore `chrome({ roughness: 0.18 })` — the same material as the
 * aperture's bright frame, which reads 218-248 in the photograph. A crest
 * that polished is a hard white wire: put the render's grille and the
 * photograph's side by side at *one* scale and the difference is not the
 * level, it is that the photograph's rib lines are broad, soft and barely
 * separated from the mass while the render's are crisp filaments.
 *
 * Measured, owner's photograph, row means across one clean column band
 * between the rings and the aperture edge:
 *
 *     slat crest rows   70-81      aperture (void) rows   39-47
 *
 * — a factor of **1.7**, not the 5 a polished rib against a void gives. So
 * the crest is a dark anodised extrusion with a satin top, which is what an
 * aluminium grille rib on a 1988 car is; the fine bright line survives in the
 * close-up, and it stops being a wire at distance.
 *
 * ## 0.5 mm was a quarter of a pixel, and a quarter of a pixel is not relief
 *
 * The argument above is sound about *level* and wrong about *size*, and the
 * measurement says so. Cut vertically through a clean slat band at
 * `photomatch` and through `owner_1988` at the same scale — the pitch is
 * matched, ~10.3 px for a 19.8 mm pitch, which is 1.92 mm/px — and take the
 * peak-to-trough of the row-mean profile:
 *
 *     band                      render   photo
 *     x 650–730 / 905–1000       5.7      77.1   (the photo band holds a ring)
 *     x 880–960 / 1080–1170      5.4      41.5   clean on both
 *     p50                        34 / 41  51 / 47
 *
 * **Seven times too little.** ±3 on a 34–41 field is a flat dark rectangle;
 * put the two crops side by side and the photograph is a hard corduroy and
 * the render is a smudge. The pitch is right, the level is right
 * (grille p50 / plate p50 0.159 against 0.205 — if anything 20 % *under*),
 * and nothing about either is what the eye is missing.
 *
 * Walking the photograph's clean band down one pitch gives
 *
 *     void 41 · 42 · 43 · ramp 45 · 48 · 65 · peak 75 · fall 57 · void 43
 *
 * — about 3 px bright against 7 px of void, and 3 px at 1.92 mm/px is
 * **6.1 mm, which is the blade**. So the photograph's whole blade face is the
 * bright part; ours renders at 36 against the void's 33, a ratio of 1.09
 * where the header of this file measures the reference at **1.7** (its
 * "aperture 23–26, slat's own lit face 52–64").
 *
 * A 0.5 mm crest cannot carry that at any finish, which is why
 * `CRITIQUE-4`'s chrome-crest round moved the grille's *exposure* (0.298 of
 * plate, 58 % over) without ever moving its relief: all it did was bloom. So
 * the crest grows to **3.0 mm**, half the blade and 1.56 px, and goes to the
 * blade's top edge where the photograph's bright run is. It stays anodised
 * rather than chrome — the level argument above is still the reason the
 * colour below is 0xa9aeb5 and not a mirror.
 */
const CREST_H = 0.0030;
const CREST_PROUD = 0.0012;
/**
 * At the top of the blade, not below its centre line.
 *
 * The blade is 6.1 mm, so its half-height is 3.05 mm; a 3.0 mm crest centred
 * at +1.4 mm spans −0.1 → +2.9 mm and dies 0.15 mm short of the blade's own
 * top break. Below the centre line it would be lighting the part of the slat
 * that the slat above already shades.
 */
const CREST_Y = 0.0014;

/**
 * Open to solid. §6.1 says "roughly twice"; the owner's photograph scans
 * 30 : 70 bright to dark across seven slats, which is 2.25 : 1 once the slat's
 * own lit edge is counted, and that is the number the render has to match.
 */
const OPEN_RATIO = 2.25;

function pitch(): { slat: number; aperture: number } {
  const n = F.grilleSlats;
  const height = F.grilleTopY - F.grilleBottomY;
  const slat = height / (n + OPEN_RATIO * (n + 1));
  return { slat, aperture: slat * OPEN_RATIO };
}

/**
 * Section of one slat blade, in (z back from its front face, y about its
 * centre).
 *
 * The face is FLAT, with only an edge break top and bottom: a rounded nose
 * catches light along a wire-thin line and the grille then reads as a set of
 * wires rather than blades, and a *wide* rounded nose is worse still because
 * it presents the sky. §6.1 calls the slats "thin, flat-faced, bright, with a
 * rounded leading edge" — the radius is the edge break, not the whole front.
 *
 * The skirt below the leading edge used to drop 5.4 mm, which is 40 % of the
 * aperture under it. `pitch()` was already 30 : 70 open-to-solid, but a column
 * scan of the render came back 50 : 50 (`docs/CRITIQUE.md` §11) because the
 * skirt is bright chrome too and the eye counts it as slat. It is 0.8 mm now,
 * and the blade is 10.5 mm deep rather than 17.5, so less of the top face is
 * presented to a camera looking slightly down at the nose.
 */
function bladeSection(t: number): Pt[] {
  const r = t / 2;
  const fr = EDGE_BREAK;
  const d = SLAT_DEPTH;
  return [
    ...arc(-fr, -r + fr, fr, -Math.PI / 2, 0, 3),
    [0, r - fr],
    ...arc(-fr, r - fr, fr, 0, Math.PI / 2, 3),
    // Top face runs back and DOWN, which tilts its normal into the cavity.
    // Sloped the other way it is a mirror aimed at the sky, and at 10 mm of
    // lever arm that is the whole difference between a dark grille and a
    // silver one.
    [-d + 0.0012, r - 0.0011],
    [-d, r - 0.0019],
    // Back edge, then the underside. It still sits a shade lower than the
    // leading edge, so it throws a clean shadow onto the slat below.
    [-d, -r - 0.0006],
    [-d + 0.0014, -r - 0.0008],
    [-fr - 0.0004, -r - 0.0004],
  ];
}

/**
 * The bright top lip, standing proud of the blade's face.
 *
 * A **half-round**, not a flat-topped bead with two hairline radii. Over
 * 2.2 mm it sweeps its normal through a full 180°, so a band of it is aimed
 * at the sky whatever the camera's height — the same argument
 * `grilleSurround`'s bead makes below, at a twelfth the size, and the same
 * failure it was written to fix: a flat face with 0.12 mm radii presents
 * about a fifth of a pixel to the sky and renders as part of the dark mass.
 */
function crestSection(): Pt[] {
  const hh = CREST_H / 2;
  const p = CREST_PROUD;
  // Runs back past the blade's own face so the two solids interpenetrate and
  // no seam can open between them at a grazing angle.
  const back = -0.0012;
  const pts: Pt[] = [[back, CREST_Y - hh]];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([p * Math.cos(a), CREST_Y + hh * Math.sin(a)]);
  }
  pts.push([back, CREST_Y + hh]);
  return pts;
}

/**
 * Frames the slats sweep along: the nose face is very slightly convex across
 * the grille and the slats follow it, which is why they are swept rather than
 * boxed.
 */
function slatFrames(): Frame[] {
  const hw = F.grilleHalfW - 0.004;
  const frames: Frame[] = [];
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const x = lerp(-hw, hw, i / n);
    const zf = SLAT_Z - (noseFaceZ(0, F.grilleTopY) - noseFaceZ(x, F.grilleTopY));
    frames.push({
      o: new THREE.Vector3(x, 0, zf),
      r: new THREE.Vector3(0, 0, 1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }
  return frames;
}

/** Centre height of slat `k`, counting up from the bottom of the aperture. */
function slatY(k: number): number {
  const { slat, aperture } = pitch();
  return F.grilleBottomY + aperture + slat / 2 + k * (aperture + slat);
}

function slatSolids(section: (t: number) => Pt[]): THREE.BufferGeometry {
  const { slat } = pitch();
  const frames = slatFrames();
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < F.grilleSlats; k++) {
    const g = sweep(section(slat), frames, { closed: true, capStart: true, capEnd: true });
    g.translate(0, slatY(k), 0);
    parts.push(g);
  }
  return merge(parts);
}

/**
 * The radiator core, drawn rather than built.
 *
 * Seventy fins behind eight slots, none of whose edges are ever resolved, is
 * not where the triangle budget should go — and as geometry they were seventy
 * more surfaces for the sky to land on. Drawn, the core is one dark texture on
 * one panel, and the panel's `envMapIntensity` decides how much light reaches
 * a cavity the renderer will not occlude for us.
 *
 * Values are authored to land where the photograph's aperture lands, which is
 * 23–26 out of 255 with a faint cool cast — a black cavity holding a little
 * blue skylight, not a black hole.
 */
function coreTexture(ctx: BuildContext): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const c = makeCanvas(w, h);
  const g = c.getContext('2d')!;

  g.fillStyle = '#060a18';
  g.fillRect(0, 0, w, h);

  // Tube stacks: the vertical rhythm you can just read in the photograph.
  // ~9.8 mm pitch across a 732 mm core is 75 of them.
  const fins = 75;
  for (let i = 0; i < fins; i++) {
    const x = (i + 0.5) * (w / fins);
    g.fillStyle = '#161d33';
    g.fillRect(x - 1.4, 0, 2.8, h);
    g.fillStyle = '#080c17';
    g.fillRect(x + 1.4, 0, 1.6, h);
  }

  // Header tanks top and bottom, and the shadow the bonnet lip throws down
  // the back of the cavity.
  const tank = g.createLinearGradient(0, 0, 0, h);
  tank.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  tank.addColorStop(0.12, 'rgba(0,0,0,0.16)');
  tank.addColorStop(0.5, 'rgba(0,0,0,0.0)');
  tank.addColorStop(0.9, 'rgba(0,0,0,0.18)');
  tank.addColorStop(1.0, 'rgba(0,0,0,0.45)');
  g.fillStyle = tank;
  g.fillRect(0, 0, w, h);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
  map.needsUpdate = true;
  return map;
}

/**
 * Outline of the aperture: a wide slot with softened corners.
 *
 * The corner radius was 16 mm, and it shows. Traced row by row on the owner's
 * photograph the aperture's right edge is a straight line from the top bead to
 * the bottom one — 1192.0 px at the top row, 1176.0 at the bottom, monotone,
 * with no rounding resolvable at either end at 1.92 mm/px. 16 mm is 8 px
 * there, which would be plain, and at matched scale the render's top-outboard
 * corner is visibly a curve where the photograph's is a corner. 7 mm is under
 * the photograph's resolution and reads as one.
 */
function apertureRing(inset: number): { pts: THREE.Vector2[]; out: THREE.Vector2[] } {
  const hw = F.grilleHalfW - inset;
  const hh = (F.grilleTopY - F.grilleBottomY) / 2 - inset;
  const cy = (F.grilleTopY + F.grilleBottomY) / 2;
  const r = Math.min(0.007, hh * 0.55);
  const corner = (cx: number, ccy: number, a0: number): THREE.Vector2[] =>
    arc(cx, ccy, r, a0, a0 + Math.PI / 2, 5).map(([x, y]) => new THREE.Vector2(x, y));
  const pts = [
    ...corner(hw - r, cy + hh - r, 0),
    ...corner(-(hw - r), cy + hh - r, Math.PI / 2),
    ...corner(-(hw - r), cy - hh + r, Math.PI),
    ...corner(hw - r, cy - hh + r, 1.5 * Math.PI),
  ];
  return { pts, out: pts.map((p) => new THREE.Vector2(p.x, p.y - cy)) };
}

function ringFrames(pts: readonly THREE.Vector2[], faceZ: (x: number, y: number) => number): Frame[] {
  const n = pts.length;
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const p = pts[i % n];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    // Outward in the face plane, walking the outline anticlockwise.
    const r = new THREE.Vector3(t.y, -t.x, 0);
    frames.push({ o: new THREE.Vector3(p.x, p.y, faceZ(p.x, p.y)), r, u: new THREE.Vector3(0, 0, 1) });
  }
  return frames;
}

export function buildGrille(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'grille';

  const chromeBright = ctx.materials.chrome();
  const crestChrome = ctx.materials.chrome({ roughness: 0.18 });

  /**
   * The rib's own crest. Dark anodised aluminium, satin, and standing 52 mm
   * inside a 14 mm slot, so it sees about a seventh of the sky — the same
   * specular-occlusion argument `voidMat` carries below, one rung less severe
   * because the crest faces out of the slot rather than sitting at the back
   * of it.
   *
   * `anodised()` rather than `chrome()` because chrome reads any roughness
   * over 0.07 as a *brushing* amount and lerps its base back down: asking it
   * for 0.45 gets a near-mirror with brush marks on it, which is the wire
   * again. See `createAnodised` in `materials/metals.ts`.
   */
  /*
   * Lighter and less occluded than it was, because the lip is now the
   * grille's relief and a 0x33373d / 0.34 rib had nothing to give.
   *
   * The ceiling is set by the reference, not by taste: the photograph's
   * bright aperture frame is 218–231 and its slat tops are 65–75, so the lip
   * wants about a third of the frame — a *lip*, not a wire.
   *
   * 0x6e737a / 0.40 / 0.50 was the first try and it was measured: slat
   * peak-to-trough went 5.4 → **14.7** against the photograph's 41.5, and
   * the crop still read as a black field with thin wires on it rather than
   * the photograph's corduroy. So one more rung on each of the three.
   * `envMapIntensity` stays under 1 because the lip still sits 52 mm inside
   * a 14 mm slot and sees a fraction of the sky, which is the same
   * specular-occlusion argument `voidMat` carries below.
   */
  /*
   * ## 0xa9aeb5 overshot, and it overshot neutral
   *
   * Measured in the matched boxes described at `voidMat`: the lip's rows read
   * L/plate **0.355 against the photograph's 0.241** with B-R **+9.6 against
   * +22.0**. So the lip is 47 % too bright and half as blue as the slat it
   * stands on, which is the same error the void has and for the same reason —
   * a rib 52 mm inside a 14 mm slot is lit by a strip of sky, not by the
   * scene's fill.
   *
   * An anodised metal reflects the environment **through its own colour**, so
   * the hue has to be in the colour: 0x8696b7 holds B:R 1.37 against
   * 0xa9aeb5's 1.07, which carries the render's measured 1.13 to about the
   * photograph's 1.44. Its luminance is 0.86 of the old one and 0.72 -> 0.58
   * takes another 0.81, for 0.70 overall against the 0.68 the table wants.
   */
  const crestRib = audiMaterials(ctx.materials).anodised({
    color: 0x8696b7,
    roughness: 0.38,
    envMapIntensity: 0.58,
  });

  /**
   * The rib itself.
   *
   * `blackTrim` is the nearest thing in the library by description — a satin
   * dark anodised extrusion — but it is authored for a window surround, out in
   * the open, and it carries `envMapIntensity` 0.9 and a sheen lobe that lifts
   * every grazing edge to a dusty grey. On a rib that is exactly what must not
   * happen: the blade's top face runs back at 10 degrees and the sheen put it
   * at 45 where the photograph has the whole dark mass at 25-30, so a third of
   * each aperture came back as grey instead of void.
   *
   * With no sheen, half the albedo and 0.55 of the IBL, this lands the blade's
   * lit face at the photograph's 52-64 and its top face down in the void with
   * the rest of the mass.
   *
   * ## The mass is navy, and 0x090a0d rendered it brown
   *
   * Put the two grilles side by side at one scale — the photograph's aperture
   * cropped at 1.92 mm/px against `photomatch` resampled to the same — and the
   * first difference is hue, not level: the photograph's mass is a cold
   * blue-black and the render's a warm brown-black. The cavity texture is
   * already authored cold (`#0b0e15`), so it was the blade, whose albedo was
   * within a level of neutral and therefore took the warm light of the grove
   * straight on.
   *
   * **0x070a12 is chosen to be hue-only.** Relative luminance 9.94 against
   * 0x090a0d's 10.0, so nothing about the grille's *level* moves with it,
   * while B:R goes 1.44 → 2.6. That restraint is deliberate, because the
   * grille's level is not this material's to set — see the note at `voidMat`.
   */
  //
  // ## 0x0c1020: the same hue, 1.8x the luminance
  //
  // The restraint below is right about *level* and the slat face is the one
  // place it costs something. Measured at `photomatch`, the blade's lit face
  // reads 36 against the void's 33 — a ratio of **1.09** where the table at
  // the head of this file has the reference at 23-26 against 52-64, i.e.
  // **1.7**. A face that is within 3 levels of the hole beside it is not a
  // blade, and no amount of crest fixes that.
  //
  // 0x0c1020 holds B:R at 2.67 against 0x070a12's 2.57, so the cold cast the
  // note below argues for is kept to within a tenth, and relative luminance
  // goes 0.00306 -> 0.00552. The blade face is 28 % of the grille box, so at
  // the measured 0.159 grille p50 / plate p50 against the photograph's 0.205
  // this moves the ratio *towards* the reference, not past it.
  //
  // 0x0a1226 keeps that 1.8x luminance and takes B:R from 2.67 to 3.8, for
  // the hue reason the note at `crestRib` gives: the blade faces out of the
  // slot at the sky and nothing else.
  const blade = ctx.materials.dirtyMetal({
    color: 0x0a1226,
    roughness: 0.86,
    metalness: 0.05,
    grime: 0,
  });

  /**
   * The void behind the slats.
   *
   * `envMapIntensity` is the occlusion term. A real cavity 52 mm inside a
   * 14 mm slot sees a few per cent of the sky; three's IBL gives it all of the
   * sky unless something says otherwise, and nothing else in this pipeline
   * will. Carrying it on the material is the only lever a geometry module has,
   * and it is the same approximation an offline renderer's specular-occlusion
   * term makes.
   *
   * The geometry sets the scale of it. A patch on the back wall sits 52 mm
   * behind a 13.7 mm slot, so it sees sky over ±7.5° vertically and
   * essentially all of it horizontally; cosine-weighted, that is
   * sin(atan(6.85/52)) = 0.131 of the hemisphere, and the slat above shades
   * part of even that. So 0.13, derived, not fitted.
   *
   * **It is worth knowing what this number cannot do.** A cavity is lit by
   * fill, not by sun, so it tracks the scene's ambient — and `envMapIntensity`
   * only scales the IBL share of that, not the hemisphere and bounce lights in
   * `src/scene/Environment.ts`. Measured while the environment stream was
   * tuning: with the fill up, 0.085 and 0.35 both rendered the aperture at
   * 0.18-0.26 of the licence plate, so the knob had almost no authority; with
   * the fill down, 0.085 rendered it at 0.02. The photograph wants 0.119.
   *
   * The plate is the only surface whose reflectance is known in both images,
   * so that ratio is the gate. If the ambient settles somewhere that leaves
   * the aperture off 0.119, read it against the plate and move this — and if
   * moving it does nothing, the fill is the thing to move, not the grille.
   *
   * At 0.05 — the first guess — the aperture rendered 9–13 against the
   * photograph's 23–26, a black hole rather than a cavity with a little
   * skylight in it. The photograph's grille is *navy*, not black, and that
   * blue is the few per cent of sky it does see.
   *
   * **Still 0.13, and the ratio is why.** Read it the way this note says to —
   * the aperture's median against the plate's, both in the same frame, one
   * clean column band between the rings and the aperture edge:
   *
   *                                   grille p50   plate p50   ratio
   *     owner's photograph                47         249       0.189
   *     committed build                   38         226       0.168
   *     the slats as polished chrome      62         208       0.298
   *     as built here                     36         207       0.174
   *
   * The third row is `CRITIQUE-4` §4, reproduced: a chrome crest puts the
   * aperture **58 % over** the photograph against the one surface whose
   * reflectance is known in both images. The fourth is this file as it stands,
   * 8 % under. That is closer than the gap between the first two rows, which
   * are the *same materials* in two different boots.
   *
   * Which is the point. The absolute level is not this material's to set:
   *
   *                        grille box p50      lamp box mean
   *     committed                  38               242.1
   *     env stream mid-tune        54               246.8
   *     ditto, + the lamp's
   *       shelf landing            37               242.9
   *
   * The 16 levels between the first two are an environment being retuned
   * underneath the grille. The 17 the third gives back came from **the
   * headlamps**: `headlamp.ts`'s shelf takes the aperture's `above 240`
   * content down, the bloom pass stops carrying it out over the nose, and the
   * grille 200 mm away goes with it. No material moved in that third row.
   *
   * So: read the ratio, not the number. At 0.174 against 0.189 this is inside
   * the boot-to-boot spread and is left alone; if it settles low once the fill
   * and the lamps have, it wants about 0.15, and if moving it does nothing the
   * fill is the thing to move.
   */
  /*
   * ## The cavity is lit by sky and the render lights it with the street
   *
   * Re-measured with boxes mapped between the two frames through the plate
   * (render x 859-940 / y 436-478 against photo x 1060-1170 / y 690-748,
   * the clean column band between the rings and the outboard aperture edge
   * `CRITIQUE-4` describes), void rows against peak rows:
   *
   *                     L/plate   B-R
   *     render void      0.155    -0.7
   *     photo  void      0.109   +22.8
   *     render peak      0.355    +9.6
   *     photo  peak      0.241   +22.0
   *     peak/void        2.29 render, 2.22 photo
   *
   * **The contrast ratio is right** — `f84efa7`'s lip landed that, and the
   * row-mean peak-to-trough is 54 against the photograph's 41. What is wrong
   * is that the whole grille is ~45 % too light and **neutral where the
   * photograph is navy by 22 levels at both ends**. A cavity 52 mm inside a
   * 14 mm slot cannot see the sun or the warm road bounce; it sees a strip of
   * blue sky. The render gives it the scene's whole neutral fill because
   * nothing occludes the IBL, and `envMapIntensity` does not reach the
   * hemisphere and bounce lights (the note at `voidMat` below records a sweep
   * where it had almost no authority).
   *
   * `specularIntensity` is the knob `printed()` carries for exactly this and
   * no caller had used it: its own doc says the aperture is otherwise
   * "albedo-limited at the Fresnel floor and cannot get below 0.18 of the
   * licence plate". 0.182 is what the p50 measured. Cutting the neutral
   * dielectric lobe is also what lets the texture's navy through — darkening
   * the texture alone moves the level and not the hue, because the hue error
   * is in the lobe, not the albedo.
   */
  const voidMat = ctx.materials.printed(coreTexture(ctx), {
    roughness: 0.62,
    envMapIntensity: 0.11,
    specularIntensity: 0.30,
  });

  const faceZ = (x: number, y: number): number => noseFaceZ(x, y);

  // --- bright surround -----------------------------------------------------
  // A slim bead capping the aperture edge, continuous with the headlamp
  // bezels' top and bottom legs (§2.1) so the nose reads as one band. This is
  // the one part of the grille that is genuinely bright: it is the 225 in the
  // photograph, and it is bright because it is a rolled edge that presents the
  // sky, not because of its finish.
  //
  // **A chrome moulding reads as a bright line because it is rolled.** What
  // makes the photograph's frame member 225 is not its polish, it is the few
  // millimetres of it that are tilted far enough to mirror the sky instead of
  // the street. This section had 1.8 mm of flank steeper than 30 degrees —
  // half a pixel at the reference framing — and the whole bead came back at
  // 38-82, a dull grey bar where the photograph has a hard white one above and
  // below the aperture. The crest is now flanked by two 4 mm chamfers, so
  // whichever way `outward` points — up at the top of the aperture, down at
  // the bottom — one of them is aimed at the sky and is 1.5 px wide.
  //
  // The crest is a half-round, not a flat-topped bead with two small
  // chamfers. Over 14 mm it sweeps its normal through a full 180 degrees, so
  // whichever way `outward` points — up at the top of the aperture, down at
  // the bottom — a quarter of it is aimed at the sky and no camera angle can
  // miss it. The flat-topped version had 1.8 mm steeper than 30 degrees,
  // which is half a pixel at the reference framing, and the bar never read.
  //
  // Satin, not mirror: the frame is an anodised aluminium extrusion. A
  // polished one returns the sky only along the one line where the normal
  // bisects exactly, so it renders as a hairline highlight in a grey bar;
  // the photograph's bar is *broad* and flat at 218-231 across four pixels,
  // which is what a 0.18-roughness metal over a curved section gives.
  const beadR = 0.0070;
  const beadRise = 0.0052;
  const bead: Pt[] = [
    [-0.0025, -0.0070],
    ...arc(0.0045, 0.0004, 1, Math.PI, 0, 12).map(
      ([x, y]) => [0.0045 + (x - 0.0045) * beadR, 0.0004 + (y - 0.0004) * beadRise] as Pt,
    ),
    [0.0115, -0.0070],
  ];
  const beadRing = apertureRing(0);
  // `flip`, because this section is written outward-first and the recess below
  // is written inward-first, and `sweep` takes its winding from the direction
  // of travel along the section. Without it every triangle in the surround
  // faced backwards: `chrome` is `FrontSide`, so the bright frame round the
  // aperture was culled away and what the camera saw through the hole it left
  // was the nose pressing behind it. **The grille has had no bright frame in
  // any render so far** — the photograph puts that frame at 218-231 and it is
  // 1.9 % of the car's pixels, a fifth of everything the photograph has above
  // 224. Nothing looked broken; it just looked like a car without brightwork.
  group.add(mesh(
    'grilleSurround',
    sweep(bead, ringFrames(beadRing.pts, faceZ), { uvScale: 0.05, flip: true }),
    crestChrome,
  ));

  // --- recess walls --------------------------------------------------------
  const wall: Pt[] = [
    [0.0004, 0.0004],
    [-0.0016, -0.0090],
    [-0.0030, -0.0260],
    [-0.0034, SLAT_Z - F.grilleZ - 0.010],
    [-0.0034, BACK_Z - F.grilleZ],
  ];
  group.add(mesh('grilleRecess', sweep(wall, ringFrames(beadRing.pts, faceZ), { uvScale: 0.05 }), voidMat));

  // --- the core at the back of the cavity ----------------------------------
  const hw = F.grilleHalfW - 0.004;
  const hh = (F.grilleTopY - F.grilleBottomY) / 2 - 0.002;
  const cy = (F.grilleTopY + F.grilleBottomY) / 2;
  const core = new THREE.PlaneGeometry(hw * 2 + 0.01, hh * 2 + 0.01);
  core.translate(0, cy, BACK_Z);
  group.add(mesh('radiatorCore', core, voidMat));

  // --- slats ---------------------------------------------------------------
  group.add(mesh('grilleSlats', slatSolids(bladeSection), blade));
  group.add(mesh('grilleSlatCrests', slatSolids(crestSection), crestRib));

  // --- the rings ----------------------------------------------------------
  // §2.1 describes a "solid black central bar" behind them, but §6.1's much
  // better photography shows the rings standing proud of the slat plane and
  // *overlapping several slat pitches* — so the slats run on behind them and
  // read through the openings. A backing bar would fill the rings with black
  // and turn them into four discs. Only the mounting spigots are modelled.
  const ringsW = ringsWidth();
  for (const sx of [-1, 1]) {
    group.add(mesh(
      `grilleBadgeMount${sx > 0 ? 'R' : 'L'}`,
      at(roundedBox(0.012, 0.012, 0.030, 0.004),
        [F.ringsCenter[0] + sx * ringsW * 0.22, F.ringsCenter[1] - F.ringDiameter * 0.42, SLAT_Z + 0.020]),
      voidMat,
    ));
  }

  const rings = fourRings();
  rings.translate(F.ringsCenter[0], F.ringsCenter[1], F.ringsCenter[2]);
  group.add(mesh('fourRingsFront', rings, chromeBright));

  return group;
}

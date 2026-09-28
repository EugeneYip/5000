/**
 * The tailgate's three missing black parts: the spoiler, the band under the
 * backlight, and the centre high-mounted stop lamp.
 *
 * `docs/REFERENCE-VEHICLE.md` §6.5 is explicit that the spoiler and the band
 * are **two different parts and the wagon has both**. [AW-87] lists "Rear
 * spoiler" as standard wagon equipment and a "center high-mounted rear brake
 * light" as standard (§6.11).
 *
 * WHERE THE SPOILER ACTUALLY SITS — re-measured this round on the two dead-on
 * rear frames in `scratchpad/ref3/`, because the previous reading put it far
 * too high.
 *
 * `bat_rear_straight_b.jpg`, dead on, no foreshortening. The backlight
 * aperture runs y 284 → 539 px at the centreline. The spoiler's top edge is at
 * 450 and its shadowed under-edge bottoms out at 490, so the part occupies
 * **65 % → 81 % of the way down the backlight**, and the rear wiper parks at
 * 59–61 %, i.e. *above* it. `bat_rear_straight.jpg`, `bat_rear3q_left_b.jpg`
 * and `bat3_rear3q_silver_b.jpg` all agree: in every view this is a bar across
 * the LOWER half of the glass, nowhere near the roof trailing edge.
 *
 * ⚠ `bat3_rear_closeup_spoiler.jpg` is shot from above and its foreshortening
 * reverses the apparent vertical order of the spoiler and the glass. Do not
 * measure this part on it.
 *
 * Consequence for this model. The body's centreline profile breaks from the
 * near-horizontal roof extension to the near-vertical tail face at y ≈ 1.138,
 * which is only **53 % of the way down our backlight** (1.285 → 1.010). So the
 * reference's 65 % is *below* our break: the spoiler belongs on the lower,
 * near-vertical part of the glass, not astride the break, and it stands proud
 * **aft** rather than up. That is also what `bat_tailgate_open_spoiler.jpg`
 * shows — the part is bonded to the tailgate, full width, with a defined
 * trailing lip, and is not a roof extension at all.
 *
 * The old build stood a 57 mm rail up off the roof extension at z −3.43…−3.70,
 * which put its top edge at y 1.195 — 32 % down the backlight, half as far as
 * the photograph. Air comes over the roof and *down* the backlight here, so
 * the leading edge is the upper one and the lip is the lower one.
 *
 * The 53 % break was read as a symptom of `HP.glass.tailgateGlassBottomY`
 * being ~50 mm low. It is not: that sill is SETTLED at 1.010 against 994
 * measured. What actually shortens the backlight is the other end —
 * `HP.glass.tailgateGlassTopY`, and the shortfall is bigger than the ~65 mm
 * this note used to quote.
 *
 * Re-measured directly on `bat_rear_straight_b.jpg`, roll-rectified (the frame
 * carries a 0.98° roll: the lamp band's gasket minima run −0.0171 px/px across
 * it) and read on the lamp band's own 138.8 px for 184 mm:
 *
 *   roof trailing edge, i.e. the top of the silhouette   row 256 ± 1
 *   top of the clear glass                               row 274 ± 2
 *
 * — **18 px, 24 mm of projected height**, holding across x 800…1185. The same
 * two features in our own `rear` frame are 36 px apart on a 62.2 px band, i.e.
 * 106 mm. Correcting for the photograph's parallax (the roof edge is ~0.77 m
 * further from the lens than the tail plane; the camera height is fixed at
 * 0.798 by the horizon crossing the lamp band at 49 %, and the distance that
 * puts the roof edge on `HP.roofRearY` 1.412 is ~10 m) gives a glass top of
 * **1.375 ± 0.010**, so 1.285 is **90 mm short**, not 76.
 *
 * That in turn re-derives the hinge rather than being blocked by it. The
 * tailgate's top edge has to clear the glass by the header band — 82 mm of
 * surface here, ~15 mm of drop — so `HP.rear.tailgateHingeY` wants **≈1.39**,
 * not 1.340, and since the hinge cannot stand above the roof skin,
 * `tailgateHingeZ` has to come forward from −3.108 to where our roof is still
 * that high, z ≈ −2.97…−3.00 — which is `HP.roof.dPillarZ`, where a wagon's
 * tailgate cut actually is. Reported, not applied.
 *
 * Everything in this file is a fraction of the aperture, so it follows them.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS } from '@/spec';
import type { BuildContext } from '@/types';
import { rearFaceZ, rearHalfWidth, skinNormal, skinY } from './bodyref';
import { clamp, lerp, mesh, roundedBox, smoothstep, sweep, type Frame, type Pt } from './util';

// ---------------------------------------------------------------------------
// Spoiler
// ---------------------------------------------------------------------------

/** Backlight aperture in the rear projection — everything here is a fraction of it. */
const GLASS_TOP_Y = HP.glass.tailgateGlassTopY;
const GLASS_DROP = GLASS_TOP_Y - HP.glass.tailgateGlassBottomY;

/**
 * Where the part lands, as a fraction of the way down the backlight.
 *
 * Measured on `bat_rear_straight_b.jpg` (aperture y 284 → 539 px at the
 * centreline): leading edge 450 px → 0.651, shadowed under-edge 490 px →
 * 0.808. Kept as fractions rather than absolute heights so that correcting
 * `HP.glass.tailgateGlassBottomY` moves the spoiler with the glass instead of
 * stranding it.
 *
 * 0.665 rather than 0.651 for the leading edge: at 0.651 the tail face is
 * already inside its top corner radius (`rearHalfWidth` falls from 727 mm at
 * y 1.100 to 534 mm by y 1.125), and a full-width part cannot start there.
 * 14 points of backlight is 4 mm of height.
 */
const SPOILER_TOP_F = 0.665;
const SPOILER_BOT_F = 0.825;
const SPOILER_TOP_Y = GLASS_TOP_Y - GLASS_DROP * SPOILER_TOP_F;   // ≈ 1.102
const SPOILER_BOT_Y = GLASS_TOP_Y - GLASS_DROP * SPOILER_BOT_F;   // ≈ 1.058
const SPOILER_MID_Y = (SPOILER_TOP_Y + SPOILER_BOT_Y) / 2;

/** Read by `wipers.ts`: the blade parks just clear of the leading edge. */
export const SPOILER_LEADING_Y = SPOILER_TOP_Y;

/**
 * Half-span. Full width on every reference — on the dead-on frame the wing
 * runs x 597 → 1505 px against a backlight aperture of exactly the same
 * extent. `rearHalfWidth` is 727 mm at the leading edge, so this leaves 27 mm
 * of paint outboard at the tightest station.
 */
const SPOILER_HALF_W = Math.min(HP.glass.tailgateGlassHalfW, rearHalfWidth(SPOILER_TOP_Y)) - 0.027;
/** Length over which each end dies onto the skin. */
const SPOILER_END = 0.085;

/**
 * Section through the wing, as (absolute height, how far it stands AFT of the
 * tail face), walked top → bottom down the outer surface.
 *
 * Aft, not up: at these heights the tailgate is ~24° off vertical, so a wing
 * bonded here projects backwards. That is why the photograph shows a lit upper
 * surface over a near-black under-edge rather than a raised rail against the
 * sky — and why the old build, which stood 57 mm *up* off the roof extension,
 * put its top edge at 32 % of the backlight instead of 65 %.
 *
 * Air comes over the roof and down the backlight, so the LEADING edge is the
 * upper one: the section feathers onto the glass at the top, thickens to a
 * 37 mm lip low down, then tucks back under. Both ends are carried 6 mm *into*
 * the skin so no sliver of daylight opens under the middle of the span.
 */
const SPOILER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [SPOILER_TOP_Y + 0.0000, -0.0060],
  [SPOILER_TOP_Y - 0.0000, 0.0010],
  [SPOILER_TOP_Y - 0.0030, 0.0052],
  [SPOILER_TOP_Y - 0.0065, 0.0118],
  [SPOILER_TOP_Y - 0.0110, 0.0196],
  [SPOILER_TOP_Y - 0.0155, 0.0262],
  // A shallow channel ahead of the lip — the wing's top reads as a raised
  // outer rail with a recessed trough inboard of it, and that crease is what
  // makes it a moulded part rather than a blister.
  [SPOILER_TOP_Y - 0.0190, 0.0288],
  [SPOILER_TOP_Y - 0.0215, 0.0282],
  [SPOILER_TOP_Y - 0.0245, 0.0320],
  [SPOILER_TOP_Y - 0.0275, 0.0362],
  // Flat across the crest of the lip, then a crisp fall to the trailing edge.
  [SPOILER_TOP_Y - 0.0305, 0.0374],
  [SPOILER_TOP_Y - 0.0335, 0.0368],
  [SPOILER_TOP_Y - 0.0365, 0.0330],
  [SPOILER_TOP_Y - 0.0390, 0.0252],
  [SPOILER_BOT_Y + 0.0025, 0.0130],
  [SPOILER_BOT_Y + 0.0000, 0.0010],
  [SPOILER_BOT_Y - 0.0010, -0.0060],
];

function buildSpoiler(): THREE.BufferGeometry {
  const n = 52;
  const xs: number[] = [];
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(-SPOILER_HALF_W, SPOILER_HALF_W, i / n);
    xs.push(x);
    frames.push({
      o: new THREE.Vector3(x, SPOILER_MID_Y, rearFaceZ(x, SPOILER_MID_Y)),
      // Section-right is aft; section-up is +y. A section point (a, b) lands
      // at world (x, MID + b, z0 − a), so `a` is depth measured aft.
      r: new THREE.Vector3(0, 0, -1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }

  const span = SPOILER_HALF_W * 2;
  const capFrac = SPOILER_END / span;
  const section = (j: number, t: number): Pt[] => {
    const x = xs[j];
    const z0 = rearFaceZ(x, SPOILER_MID_Y);
    const k = smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1));
    // Only the proud part collapses at the ends; the buried edges stay buried,
    // so each end cap is a sliver inside the sheet metal, not a visible cut.
    // Conformed per point rather than per station: the tail face leans 17 mm
    // over the 44 mm this section spans and comes forward 46 mm at the ends.
    return SPOILER_PROFILE.map(([y, out]) =>
      [z0 - rearFaceZ(x, y) + (out > 0 ? out * k : out), y - SPOILER_MID_Y] as Pt);
  };

  // NOT flipped, unlike `tailgateRibs`, which sweeps the same axes with the
  // same frames. Walking the loop gives a face normal of (0, ±Δa, ±Δb) with
  // the sign set by `flip`, so the two parts need opposite settings purely
  // because the rib's section runs UP the loop and this one runs DOWN it.
  // Flipped, every outward face here is back-facing: `blackTrim` is
  // single-sided, so the part vanishes and `Mesh.raycast` returns its buried
  // inner surface as the nearest hit. See the stream report — the black band
  // below had exactly this bug and had never been rendered.
  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.12 });
}

// ---------------------------------------------------------------------------
// The matt-black band under the backlight
// ---------------------------------------------------------------------------

/**
 * Band height, as a fraction of the gap between the backlight and the lamps.
 *
 * The band is the SMALLER of the two. `CRITIQUE-3.md` §4 has them the other
 * way round (93 mm of band over 83 mm of strip); that does not reproduce on
 * either dead-on frame. An earlier reading here gave 41 mm of band over 98,
 * and its *ratio* was right — its millimetres were on the discredited
 * "1810 mm of body width at the lamp band" scale and are 14 % long.
 *
 * SETTLED, on the corrected 1.3256 mm/px (the lamp band's own 138.8 px for
 * 184 mm) and read at five columns rather than one, because the plate strap
 * fouls the two nearest the centre. Rows are the end of the *clear* glass, the
 * first painted row, and the lamp's upper gasket minimum:
 *
 *   | x | band px | strip px | split |
 *   |---|---|---|---|
 *   |  780 | 27 | 54.5 | 0.331 |
 *   |  900 | 23 | 56.5 | 0.289 |
 *   | 1150 | 24 | 55.3 | 0.303 |
 *   | 1300 | 24 | 54.8 | 0.305 |
 *   | 1400 | 24 | 55.1 | 0.303 |
 *
 * **0.306 ± 0.015**, so the 0.30 held here is right and stays. Note what the
 * "band" is: 20 px of ceramic frit ON the glass (its hue is the glass's at a
 * uniform 62 % in all three channels) plus 4 px of bond seal. Our convention
 * puts the frit below the visible glass and paints the band there instead —
 * see `HP.glass.tailgateGlassBottomY`. Read the frit as glass and the split
 * becomes 0.05, not 0.3: change both files or neither.
 *
 * The 90-mm-versus-139 shortfall this note used to carry is gone: with
 * `lampTopY` at 0.888 the hardpoints leave 122 mm against the **105.5 ± 1.5**
 * measured (79.6 px), so the band builds at 37 mm against 32.5 and the strip
 * at 85 against 73 — 16 % long rather than 35 % short, and all of that residue
 * is the 16 mm by which `tailgateGlassBottomY` 1.010 exceeds the 994 measured.
 * Holding the split as a fraction is what made it self-correct.
 */
const BAND_TOP_Y = HP.glass.tailgateGlassBottomY;
const BAND_GAP = BAND_TOP_Y - HP.rear.lampTopY;
const BAND_HEIGHT = BAND_GAP * 0.30;
const BAND_MID_Y = BAND_TOP_Y - BAND_HEIGHT / 2;
/** The painted badge strip left below the band. Read by `badges.ts`. */
export const BADGE_STRIP_TOP_Y = BAND_TOP_Y - BAND_HEIGHT;
export const BADGE_STRIP_HEIGHT = BADGE_STRIP_TOP_Y - HP.rear.lampTopY;
/**
 * Where the badge line goes. Both dead-on frames put the script's cap box
 * dead centre in the painted strip (31 px of paint above and 31 below on
 * `bat_rear_straight.jpg`), so this is simply the strip's mid-height.
 */
export const BADGE_BAND_Y = (BADGE_STRIP_TOP_Y + HP.rear.lampTopY) / 2;

/** How far the band stands out of the paint, and how far it is let in behind. */
const BAND_PROUD = 0.004;
const BAND_BURY = 0.012;

function buildBand(): THREE.BufferGeometry {
  const halfH = BAND_HEIGHT / 2;
  // The tail's outline at band height, less enough to leave paint showing
  // outboard of it at the tailgate's side shutline.
  const halfW = rearHalfWidth(BAND_MID_Y) - 0.030;

  const n = 56;
  const xs: number[] = [];
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(-halfW, halfW, i / n);
    xs.push(x);
    frames.push({
      o: new THREE.Vector3(x, BAND_MID_Y, rearFaceZ(x, BAND_MID_Y)),
      r: new THREE.Vector3(0, 0, -1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }

  // (height above the band's centre, how far proud of the skin).
  const shape: ReadonlyArray<readonly [number, number]> = [
    [halfH, -BAND_BURY],
    [halfH, 0.0],
    [halfH - 0.0012, BAND_PROUD * 0.7],
    [halfH - 0.0040, BAND_PROUD],
    [-halfH + 0.0040, BAND_PROUD],
    [-halfH + 0.0012, BAND_PROUD * 0.7],
    [-halfH, 0.0],
    [-halfH, -BAND_BURY],
  ];

  const section = (j: number): Pt[] => {
    const x = xs[j];
    const z0 = rearFaceZ(x, BAND_MID_Y);
    // Conformed per point, not per station: over a 766 mm half-span the tail
    // face comes forward by ~50 mm at the ends and leans over the band's own
    // 37 mm of height, and a section that ignored either would float.
    return shape.map(([b, out]) => [z0 - rearFaceZ(x, BAND_MID_Y + b) + out, b] as Pt);
  };

  // `flip` removed — see `buildSpoiler`. With it, the band's outward faces were
  // all back-facing against a single-sided material, so the part had never
  // actually appeared in a render: `__AUDI.pick` straight down the tailgate
  // returned `tailgatePanel` where the band is, then the band's *buried* inner
  // face 12 mm behind it. Its bounding box was always right, which is why
  // three review rounds measured it rather than noticing it was invisible.
  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.12 });
}

// ---------------------------------------------------------------------------
// Centre high-mounted stop lamp
// ---------------------------------------------------------------------------

/**
 * Standard on the US car (§6.11, [AW-87]) and plainly visible in `BAT-R` as a
 * pale bar inside the top centre of the backlight — 132 × 27 px.
 *
 * ⚠ The PIXELS were right and the millimetres were not. They were scaled by
 * calling the backlight 1424 mm wide over 940 px, and 1424 is twice the built
 * `tailgateGlassHalfW` 0.712 rather than anything measured — the same circular
 * scale the rest of this elevation has been purged of. On the lamp band's own
 * 1.3256 mm/px those 940 px are 1246 mm, which agrees with the aperture
 * measured directly (956–966 px, 1267–1281 mm). So the unit is **175 × 36 mm**
 * and not 202 × 41; the bar is the same bar, read on the right ruler.
 *
 * It is an interior-mounted unit: it sits behind the glass on the tailgate's
 * inner face, not on the skin. So it is let *in* along the surface normal, and
 * the lens is the only part of it that faces the camera.
 */
const CHMSL_Z = -3.246;
const CHMSL_WIDTH = 0.175;
const CHMSL_HEIGHT = 0.036;

function chmslBasis(): { m: THREE.Matrix4; o: THREE.Vector3; n: THREE.Vector3 } {
  const n = skinNormal(CHMSL_Z, 0).normalize();
  // Up-slope, in the YZ plane: perpendicular to the normal, pointing forward.
  const up = new THREE.Vector3(0, -n.z, n.y).normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  return {
    m: new THREE.Matrix4().makeBasis(right, up, n),
    o: new THREE.Vector3(0, skinY(CHMSL_Z, 0), CHMSL_Z),
    n,
  };
}

// ---------------------------------------------------------------------------

export interface SpoilerResult {
  group: THREE.Group;
  /** Everything here is tailgate furniture and opens with the tailgate. */
  riders: THREE.Object3D[];
  nodes: Record<string, THREE.Object3D>;
}

export function buildTailgateSpoiler(ctx: BuildContext): SpoilerResult {
  const group = new THREE.Group();
  group.name = 'tailgateSpoiler';
  const dark = ctx.materials.blackTrim();

  group.add(mesh('tailgateSpoiler', buildSpoiler(), dark));
  group.add(mesh('tailgateBlackBand', buildBand(), dark));

  // --- CHMSL ---------------------------------------------------------------
  const { m, o, n } = chmslBasis();
  const place = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(o.x + n.x * lift, o.y + n.y * lift, o.z + n.z * lift);
    return g;
  };

  const housing = place(roundedBox(CHMSL_WIDTH, CHMSL_HEIGHT, 0.034, 0.004, 3), -0.036);
  const lens = place(roundedBox(CHMSL_WIDTH - 0.018, CHMSL_HEIGHT - 0.013, 0.010, 0.003, 3), -0.018);
  const chmslHousing = mesh('chmslHousing', housing, dark);
  // The lights stream owns whether this is lit; all this module does is put a
  // named lens where the lamp goes. Unlit it reads as dark red behind the
  // glass, which is what the reference photograph shows.
  const chmslLens = mesh('chmslLens', lens, ctx.materials.lens(LIGHTS.tailColor, { prismatic: true }));
  group.add(chmslHousing, chmslLens);

  return {
    group,
    riders: [group],
    nodes: { chmsl: chmslHousing, chmslLens },
  };
}

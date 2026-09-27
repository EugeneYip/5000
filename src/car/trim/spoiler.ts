/**
 * The tailgate's three missing black parts: the spoiler, the band under the
 * backlight, and the centre high-mounted stop lamp.
 *
 * `docs/CRITIQUE-2.md` §3 found no mesh of any kind in this area, and
 * `docs/REFERENCE-VEHICLE.md` §6.5 is explicit that the spoiler and the band
 * are **two different parts and the wagon has both**. [AW-87] lists "Rear
 * spoiler" as standard wagon equipment and a "center high-mounted rear brake
 * light" as standard (§6.11).
 *
 * WHERE THE SPOILER ACTUALLY SITS — this matters, because the obvious reading
 * of §2.3 ("across the top of the tailgate glass at the roof trailing edge")
 * and the obvious reading of a dead-on rear photograph ("two thirds of the way
 * down the backlight") sound like different places and are not.
 *
 * The C3's tail does two things at once. The centreline profile runs *level*
 * over the last 150 mm — `body/surface.ts` calls it "the roof extension above
 * the tailgate glass", and probing it confirms y 1.160 at z −3.50 flattening
 * to 1.138 by z −3.64 — and then the surface breaks and falls away almost
 * vertically to the tail face. The backlight spans that break: its top half
 * lies on the near-horizontal extension, its bottom half on the near-vertical
 * face. **The spoiler sits astride the break.** Seen dead-on from behind, that
 * reads as a bar low on the glass; seen in elevation, it is the trailing edge
 * of the roof. Both descriptions are of this one part.
 *
 * Measured off `GCFS-85` (a US 5000 S Wagon — our exact model, and the only
 * reference that shows the part unobstructed) and `BAT-R`:
 *
 *   · a deep moulded wing, not a lip: ~270 mm of chord along the tailgate;
 *   · a **raised rail along its trailing edge** standing ~57 mm proud of the
 *     skin, its top catching light and its aft face in shadow — on `BAT-R`
 *     that pair reads as a bright line at 452 px over near-black at 490 px;
 *   · feathering onto the glass at its leading edge, and dying down onto the
 *     skin at both outboard ends just inside the D-pillars.
 *
 * ⚠ It does **not** break the roofline. Its crest reaches y ≈ 1.195 against a
 * roof crown of 1.415; no part of this car's tailgate can reach the roofline,
 * because the tailgate hinge is at 1.338 and falls from there. The flat
 * roofline the review is reacting to is the roof rails (§5), which are fixed
 * separately in `roofrails.ts`. What the spoiler does change is the tail's
 * silhouette: it squares off the last 270 mm, which is the same complaint from
 * the other end.
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

/**
 * Half-span. The roof-to-bodyside joint measures x 0.604–0.616 over the
 * spoiler's stations, so this leaves ~20 mm of skin outboard of the wing
 * before the surface turns down into the D-pillar.
 */
const SPOILER_HALF_W = 0.585;
/** Chord: leading edge forward on the roof extension, trailing edge at the break. */
const SPOILER_FRONT_Z = -3.430;
const SPOILER_BACK_Z = -3.700;
/** Length over which each end dies onto the skin. */
const SPOILER_END = 0.078;

/**
 * Section through the wing, as (station z, height above the local skin),
 * walked as a closed loop: the top surface front → aft, then the underside
 * aft → front.
 *
 * The underside is carried 4–6 mm *into* the skin the whole way. The wing is
 * bonded down its whole length on the real car, and burying it is also what
 * stops the transverse crown — 17 mm from centreline to x 0.58 — showing a
 * sliver of daylight under the middle of the span.
 */
const SPOILER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [-3.4300, 0.0015],
  [-3.4620, 0.0105],
  [-3.5000, 0.0175],
  [-3.5450, 0.0225],
  [-3.5880, 0.0264],
  [-3.6160, 0.0300],
  [-3.6280, 0.0402],
  [-3.6380, 0.0505],
  [-3.6520, 0.0556],
  [-3.6680, 0.0570],
  [-3.6810, 0.0540],
  [-3.6910, 0.0438],
  [-3.6975, 0.0300],
  [-3.7000, 0.0150],
  [-3.7000, 0.0010],
  [-3.6990, -0.0060],
  [-3.6400, -0.0052],
  [-3.5500, -0.0046],
  [-3.4700, -0.0040],
  [-3.4320, -0.0034],
];

function buildSpoiler(): THREE.BufferGeometry {
  const n = 44;
  const xs: number[] = [];
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(-SPOILER_HALF_W, SPOILER_HALF_W, i / n);
    xs.push(x);
    // Sweeping along +X with the section laid out in (aft, up): a section
    // point (a, b) lands at world (x, b, −a), so `a` is just −z.
    frames.push({
      o: new THREE.Vector3(x, 0, 0),
      r: new THREE.Vector3(0, 0, -1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }

  const span = SPOILER_HALF_W * 2;
  const capFrac = SPOILER_END / span;
  const section = (j: number, t: number): Pt[] => {
    const x = xs[j];
    const k = smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1));
    // Only the proud part collapses at the ends; the buried underside stays
    // buried, so the cap at each end is a 4 mm sliver inside the sheet metal
    // rather than a visible cut face.
    return SPOILER_PROFILE.map(([z, out]) =>
      [-z, skinY(z, Math.abs(x)) + (out > 0 ? out * k : out)] as Pt);
  };

  // `flip`: same handedness problem as the tailgate ribs — sweeping along +X
  // with the section's right axis pointing aft reverses the winding.
  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, flip: true, uvScale: 0.12 });
}

// ---------------------------------------------------------------------------
// The matt-black band under the backlight
// ---------------------------------------------------------------------------

/**
 * `BAT-R`, dead-on, column x 800: the band runs 540 → 563 px between the
 * bottom of the glass and the painted badge band, ~36 mm at that frame's
 * 1.55 mm/px. The build has only 90 mm between `tailgateGlassBottomY` (1.010)
 * and `HP.rear.lampTopY` (0.920) to fit the band *and* the badge line into;
 * the photograph splits that gap 31 : 69, which is what these two numbers are.
 */
const BAND_TOP_Y = HP.glass.tailgateGlassBottomY;
const BAND_HEIGHT = 0.032;
const BAND_MID_Y = BAND_TOP_Y - BAND_HEIGHT / 2;
/** Where the badge line has to go once the band is in. Read by `badges.ts`. */
export const BADGE_BAND_Y = (BAND_TOP_Y - BAND_HEIGHT + HP.rear.lampTopY) / 2;

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
    // Conformed per point, not per station: over a 765 mm half-span the tail
    // face comes forward by 47 mm at the ends and leans 11 mm over the band's
    // own 32 mm of height, and a section that ignored either would float.
    return shape.map(([b, out]) => [z0 - rearFaceZ(x, BAND_MID_Y + b) + out, b] as Pt);
  };

  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, flip: true, uvScale: 0.12 });
}

// ---------------------------------------------------------------------------
// Centre high-mounted stop lamp
// ---------------------------------------------------------------------------

/**
 * Standard on the US car (§6.11, [AW-87]) and plainly visible in `BAT-R` as a
 * pale bar inside the top centre of the backlight — 132 × 27 px against a
 * 1424 mm glass width over 940 px, so **≈200 × 41 mm**, its top ~26 mm below
 * the glass's upper edge.
 *
 * It is an interior-mounted unit: it sits behind the glass on the tailgate's
 * inner face, not on the skin. So it is let *in* along the surface normal, and
 * the lens is the only part of it that faces the camera.
 */
const CHMSL_Z = -3.246;
const CHMSL_WIDTH = 0.202;
const CHMSL_HEIGHT = 0.041;

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

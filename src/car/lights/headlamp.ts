/**
 * Front composite headlamp — US specification.
 *
 * Resolved off 2048 px photography of a MY1988 North-American Avant
 * (`docs/REFERENCE-VEHICLE.md` §6.2) and built to that reading exactly:
 *
 *   **one flush housing per side**, under **one continuous chrome bezel**,
 *   containing **two rectangular reflector chambers side by side** behind a
 *   single clear horizontally-fluted lens, with an **amber section outboard**
 *   of them in the same housing, its outer edge following the wing's corner
 *   radius.
 *
 * The thing that makes or breaks it is what the lamp looks like **switched
 * off**, in daylight, which is how it appears in almost every frame. An unlit
 * lamp is not a dark rectangle: it is a deep box whose far wall is a pebbled
 * aluminium bowl, and the bowl is what you see. So the reflectors are real
 * paraboloids sunk 52 mm behind the lens, the bulbs and their shields sit in
 * front of them where you can see them through the glass, and the lens is
 * genuinely transmissive rather than a coloured plate.
 *
 * The aperture's outboard edge is not the hardpoint's nominal 850 mm: the nose
 * face has already begun to roll into the wing at that height, so the outline
 * is clamped to the body's own half-width. That clamp is what produces the
 * wrapped, chamfered top-outboard corner the real lamp has.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS } from '@/spec';
import { noseFaceZ, noseHalfWidth } from '@/car/body/panels';
import type { BuildContext } from '@/types';
import {
  bowl, bothSides, frame, filament, gridSurface, inset, limitsAt, merge, mirrored, slab,
  sliceX, sliceY, spanAt, tubeZ,
  type Outline,
} from './shapes';
import { FILAMENT, fluteHorizontal, type Glow, type GlowFactory } from './optics';
import type { BeamGeometry } from './beam';
import { audiMaterials } from '@/materials/library';
import type { LensOptions } from '@/materials/lamp';

const F = HP.front;
const FACE = noseFaceZ;
const FACING = 1 as const;

/**
 * The painted edge of the aperture itself — the rolled lip of the pressing,
 * plus the hairline of bright trim that runs over it.
 *
 * **It is a lip, not a bezel, and the previous 9 mm of chrome here is what
 * made the lamp one unbroken white slab.** See `GASKET`.
 *
 * ## It is meshed as a roll now, and that is all it is
 *
 * 2.4 mm of section rather than 1.5, six bands at slopes +72°, +56°, +21°,
 * −27°, −62°, −75°, crest 2.05 mm proud — the same proud height `94fc4ba`
 * measured, properly radiused. Three profile points gave two bands and two
 * normals, and "nothing in a real car is a perfectly sharp edge" applies to
 * the one edge on this lamp that is meant to be bright.
 *
 * **It is worth nothing measurable, and that is the finding rather than an
 * excuse.** The bead reads 218-221 against the three-point version's 217, and
 * the 0.9 mm the roll borrows costs the channel 0.4 of a row. Both are inside
 * noise. Two things were tried on the way to that and both are worth
 * recording, because each looks as though it should have worked:
 *
 *  - **A band laid on the sun's mirror angle.** `goldenhour` puts the sun at
 *    `(-0.797, 0.199, 0.561)`, 11.5° up; the `photomatch` camera solves to
 *    `(0, 1.121, 4.784)`, 5.65° above the band. Their half-vector is
 *    `(-0.512, 0.152, 0.845)` — **31° out of the section's own y–z plane**,
 *    because the sun is across the car rather than in front of it. A
 *    horizontal bead's normal lies in that plane by construction, so `N·H`
 *    tops out at 0.858, and `chrome`'s 0.05 roughness is a 3 mrad lobe:
 *    0.009 % of peak. The bead cannot see the sun from this pose at this
 *    roughness. The band moved it 217 → 220.
 *  - **A 3.6 mm proud crest carried 1.4 mm out over the channel**, to give the
 *    channel the proud neighbour the amber joint has. The amber joint reads
 *    178 where this channel reads 203 at the same depth in the same material,
 *    and a wall on the second side looked like the reason. It is not — see
 *    `GASKET` — so the crest went back to 2.05 mm.
 *
 * The photograph's 254 strip above the lamp is not brightwork at all: it is
 * sunlit `noseUpper`, which renders at 185-192. That shortfall is the body's
 * and the report carries it.
 */
const LIP = 0.0024;
/**
 * The black channel between the lip and the glass: the single most important
 * dimension on this part.
 *
 * ## The brightwork and the gasket were swapped
 *
 * Read down the owner's photograph through the lamp (x 1230-1300, rows
 * 648-791, V = max(R,G,B), 1.826 mm/px off the plate):
 *
 *     652-663   150 → 254   sunlit sheet metal above the lamp      22 mm
 *     664-676   221 → 81 → 248   **BLACK CHANNEL**                24 mm
 *     677-757   246-253, dipping to 228 at 0.56 down   the glass   148 mm
 *     758-771   197 → 94 → 135   **BLACK CHANNEL**                26 mm
 *     772-777   178 → 255   the bumper's bright top                11 mm
 *     780+      69-89       the bumper face
 *
 * So the glass is 148 mm — which this model already had — and it is framed
 * by **25 mm of near-black per side**, with the bright strips *outside* that.
 * The 254 and 255 strips are not the lamp's: both are the same warm hue as the
 * paint and the lens (R/G 1.07 against the lens's 1.05) and the zoom shows
 * them continuous with the sheet metal and the bumper. They are sunlit body.
 *
 * `94fc4ba` measured 671 → 677 and 753 → 759 px and called the resulting
 * 11.7 mm a side *brightwork*. Those rows are the channel's **rising ramp**
 * — 671 is V 142 and 677 is V 247 — so the width was right and the sign was
 * exactly backwards: 12.5 mm a side of bright chrome where the photograph has
 * black. That is why its row-range fix measured ±4 on a 246 field. The
 * structure it added inside the lens is real and stays; what was missing is
 * the joint around it.
 *
 * ## Why 10 mm and not 25
 *
 * `LIP + GASKET` is held at 12.5 mm so the glass does not move. 25 mm a side
 * needs `HP.front.lampTopY`/`lampBottomY` to open from 168 mm to ~196 mm, and
 * the bottom of that additionally needs the bumper to come down — see the
 * report. 10 mm is 4.1 rows at `photomatch` 1600x900 and carries the edge.
 *
 * ## The floor is the bloom's, not the gasket's — and this is the measurement
 *
 * **Nothing built in this file can darken the channel at `photomatch`, and it
 * is measured to the grey level rather than argued.** The surface in the slot
 * was replaced with `anodised({ color: 0x000000, envMapIntensity: 0 })` —
 * metalness 1, so `F0` is the colour and the colour is zero; no IBL; the only
 * term a path to the eye can carry is the direct lobe of a black mirror. An
 * absolute black. Same geometry, same pose, one build apart:
 *
 *     row    rubber   absolute black   the photograph
 *     423      202          202               81
 *     424      209          206
 *     482      155          139               94
 *
 * **Zero levels at the upper groove's floor and 16 at the lower.** Four
 * changes tried against it agree: deepening the channel 12.5 → 22.5 mm,
 * raking its floor 13° → 50° (which takes `N·L` for the low sun from 0.49 to
 * 0.207), taking the road film off the rubber and standing a 3.6 mm wall
 * beside it moved row 423 from 203 to **202**. Depth also looked like a lever
 * from the outside — the amber joint reads 178 at 14 mm where this reads 203
 * at 12.5 — and it is not one; that 25 levels is distance from the lens, not
 * depth.
 *
 * What is reaching those pixels is the **bloom halo round the lens**, and it
 * is enormous. Read along the grille recess at three rows, approaching the
 * lens's inboard edge at x 957:
 *
 *     x        890   900   910   920   930   940   945   950
 *     y 430     30    36    42    50    64    89   105   126
 *     y 450     28    36    41    51    64    92   109   137
 *     y 470     26    32    37    45    55    69    79    93
 *
 * The grille is a 100 mm recess full of black slats — as near an absolute
 * black as this car has — and it rises **110 levels over the last 50 px**
 * purely because it is next to the lamp. The same curve at three rows 20 px
 * apart is a halo, not geometry. So the floor is a function of distance from
 * the lens and of nothing else this file owns:
 *
 *     px from the lens's edge     1-3    6-7    20    50+
 *     floor                       202    137    64     28
 *
 * **Which is why the channel's width, and not its depth or its finish, is the
 * one dimension here that would still pay.** At 10 mm the whole channel sits
 * inside the halo's core. At the photograph's 25 mm its outer half would sit
 * 6-10 px out, where the same bloom only reaches 137. That needs the aperture
 * hardpoint, which is why the report leads with it.
 *
 * The bloom itself is `src/scene/Post.ts` and `src/scene/post/**`. It is **not
 * an exposure problem and the fix is not to dim the lamp**: `CRITIQUE-5` had
 * the lens at 1.079 of the plate against the photograph's 0.992 with nothing
 * clipping, and that still holds. It is the kernel's reach at small radii.
 */
const GASKET = 0.0101;
/** Acrylic body thickness. Matches the lens shader's own optical thickness. */
const LENS_BODY = 0.0042;

/**
 * What makes the unlit lamp one flat sheet rather than two lobes with a seam.
 *
 * ## The lamp's *level* was already right. Its *shape* was not.
 *
 * Read on the tight glass rectangle, this render against the white-balanced
 * photograph, before any of this:
 *
 *                       photo      render L    render R
 *   mean                232.3       236.0       235.0
 *   p90                 243.0       248.7       248.7
 *   above 240           27.7 %      38.5 %      38.4 %
 *   192-224             12.1 %       7.7 %      17.7 %
 *
 * So the aperture was not dark and did not want lifting — it was already a
 * couple of levels *over*. What it had instead was the signature of a mirror:
 * scanned across, the two chambers came out as two lobes peaking at 249 with
 * **218-226 troughs** between and beside them, where the photograph runs
 * 228-243 corner to corner with no falloff at either end. A mirror cannot do
 * anything else — with the sun and the eye both effectively at infinity the
 * half-vector is constant over the whole bowl, so exactly one point of a
 * paraboloid is aimed right and the rest of the aperture is off-peak.
 *
 * `retroGain` is the one term that is flat across the aperture, because every
 * point of a paraboloid maps to the same focus and the focus is what returns
 * the light — see `LENS_RETRO` in `materials/lamp.ts` for the mechanism. It
 * is set to fill the troughs and no further: 0.5.
 *
 * **It is deliberately small, and the sweep is why.** Swept alone it buys
 * level, not shape. On the full glass rectangle (x 534-649, y 427-480 at
 * 1600x900) it moves the aperture's *mean* 235.2 -> 237.6 -> 239.8 -> 243.3
 * at gain 0 -> 0.5 -> 1.0 -> 1.8 while `above 240` climbs 38 -> 43 -> 50 ->
 * 73 % against the photograph's 23 %, and the column range only falls from 28
 * to 15 because everything under it has been pushed into the clip. Burying a
 * lobe is not removing one.
 *
 * ## What removed it: `homogenise`
 *
 * The lobes and the vignette are **entirely** the transmitted image of the
 * bowl. That is measured, not inferred — driving this lens's `transmission`
 * to zero live in the `photomatch` frame takes the aperture from 222-239 down
 * its height and 221-248 across it to 243-247 in both directions, flat to a
 * grey level and a half, while zeroing the front-surface Fresnel moves the
 * column range by 0.0 and zeroing the internal reflection by 1.2. There is
 * nothing else in the shader that could be making the shape.
 *
 * `homogenise` is the fluted lens doing to that image what a fluted lens
 * does: scattering it through a cone wider than the cavity, so what leaves
 * the aperture is the cavity's *average* radiance rather than whatever sits
 * behind the pixel. `materials/lamp.ts` § `LENS_CAVITY` has the model. It is
 * what removed the shape. Read three pixels in from the aperture's own edge,
 * `photomatch` at 1600x900, against the white-balanced photograph:
 *
 *                       off        0.60       0.70       photo
 *   row range          15.3       11.6       11.4        10.8
 *   column range       26.4       15.7       13.7        12.0
 *
 * There is no lobe and no vignette left at either setting. 0.60 rather than
 * 0.70 for two reasons that both point the same way: it is worth 0.2 more of
 * the whole-car tone profile, and it leaves 40 % of the transmitted image
 * instead of 30 %, which is the difference between the bulb and the chamber
 * divider being faintly visible in the `headlight` close-up and the aperture
 * being blank. The photograph has them faintly visible.
 *
 * ## Why the level is four grey levels hot, deliberately
 *
 * `cavity` is what the flat field is worth, and it is **not** set where the
 * lamp alone wants it. At 0.59 the aperture is the best match this model can
 * make — mean 234.0 against the photograph's 232.4 and `above 240` 24.5 %
 * against 23.3 %, both inside noise. It is not used, because the lamp is not
 * the only thing that reads it: swept live in one boot, the *whole car's*
 * median tracks the aperture's clip almost one for one — 96 at `homogenise`
 * 0, 93 at 0.6/0.64, 91 at 0.7/0.64, 89 at 0.8/0.59 — because the bloom pass
 * carries the lamps' `above 240` content out over the whole nose and, at this
 * radius, over the roof and flanks as well. Taking the aperture down to its
 * own correct level takes 4-6 levels off every panel on the car with it, and
 * the tone profile goes 14.1 -> 15.9.
 *
 * That coupling is a *defect elsewhere*, and this is the measurement that
 * exposes it: the car's own lighting is four to six levels short in the
 * midtones — the photograph holds 14.5 % of the car in 80-96 and 10.4 % in
 * 96-112 where this render holds 11.0 % and 8.0 % — and it was being held up
 * by headlamps blown well past what the photograph shows. `src/scene` owns
 * that. **Whoever raises it should come back here and take `cavity` to
 * 0.59**, which is a one-line change and is where the lamp measures right.
 *
 * Until then 0.64: it keeps the flat aperture, it takes `above 224` over the
 * whole car from 7.2 % to 7.5 % and the tone profile from 14.1 to 13.8, and
 * it leaves the aperture 4 levels hot at 35 % `above 240` against 23 %.
 *
 * `spread` is **0 now, and this is why**: it asked three's transmission for
 * the same convolution, and three's transmission is a screen-space mip.
 * Swept in this frame it does not flatten the aperture at all — column range
 * 27.6 at 0.05, 27.6 at 0.18, 26.1 at 0.35 — while the mean falls 235 -> 228
 * -> 194 as the blur reaches outside the lens and averages in the grille. At
 * the settled `homogenise` it is worth 0.2 of a grey level in every statistic
 * the aperture has, so it is not worth a second shader program.
 *
 * None of these figures belongs in `spec.ts`: they are not factory numbers.
 * The model and the units are in `materials/lamp.ts`; the measurement is in
 * `docs/REFERENCE-PHOTO.md`.
 *
 * Typed through `LensOptions` rather than written inline at the call because
 * `src/types.ts` carries its own copy of the lens option list and that copy
 * does not know about any of these options yet — the same stopgap
 * `trim/plate.ts` uses for the sheeting, and it comes out when the contract
 * catches up.
 */
const OPTIC: LensOptions = {
  prismatic: true,
  retroGain: 0.5,
  retroLobe: 2,
  // Not higher: the bulb, its shield and the chamber divider are what the
  // photograph still shows faintly through the glass, and they live in the
  // transmitted image this mixes away. At 0.8 the `headlight` close-up is a
  // blank white block.
  //
  // **0.48 now, and the reason is that there is finally something behind the
  // glass worth keeping.** The figure above was settled against a cavity whose
  // only structure was the bowl's own specular lobe — an artefact to be mixed
  // away — so the term was pushed until the aperture was flat, and it landed
  // flat: row range 4.0 against the photograph's 12.1, which is the
  // "featureless white card" of `CRITIQUE-4` §3 stated as a number. With the
  // shelf and the chamber wall in there the transmitted image now carries the
  // structure the photograph has, and mixing 60 % of it away would throw the
  // fix out with the artefact. 0.48 keeps 52 %.
  homogenise: 0.48,
  // Below the 0.70 an ideally diffusing cavity of these proportions would
  // have — rho*f/(1 - rho(1 - f)) for 88 % walls and a third-open aperture —
  // because this one is not diffusing: a mirror cavity puts part of its
  // return into the retro lobe rather than into the average, and that part is
  // `retroGain` above. Swept against the photograph's aperture, 0.56 lands
  // the mean at 232.1 and 0.64 at 236.6; see above for why it is the high end
  // of that and what has to change before it comes down.
  cavity: 0.64,
};

/**
 * The indicator's own optic, which is a **different lamp**.
 *
 * Measured across the amber at `photomatch`, before this: R pinned at
 * 254.4 ± 0.3 for all 32 of its columns while G fell 204 → 124. The red
 * channel was clipped from end to end, so the amber rendered as a flat
 * vermilion card with a green-channel gradient on it — and `headlight` was
 * the only pose in the set that clipped at all, at 5.65 %.
 *
 * The photograph does not clip: R runs 252 → 203 across the amber and G
 * 214 → 105, V falling 252 → 202. So the amber is ~8 levels *below* the
 * clear lens where this model had it ~8 *above*.
 *
 * Two terms, both for the same reason — an indicator is not a headlamp.
 * `cavity` comes down because there is no H4 and no deep paraboloid in there
 * to return the sun that many times; `homogenise` comes down because the
 * photograph's amber is **not** a flat field. It is a left-to-right ramp with
 * the bowl's lobe plainly in it, and mixing 52 % of the transmitted image
 * away is what flattened ours into a card.
 *
 * ## 0.28, because 0.46 was still clipping and that is what flattened it
 *
 * `0.46` did not stop the clip. Read across the amber at `photomatch`, row
 * 450, against the photograph at rows 700-710, x 1341-1384 (which is where
 * the amber actually is — 1.826 mm/px off the plate):
 *
 *                       render        photograph
 *     peak V            255           255
 *     far-end V         240           197-209
 *     V range            16            55
 *     R/G, bright end   1.47          **1.11**
 *     R/G, dark end     2.35          **1.92**
 *
 * **R was pinned at 254-255 across 21 of its 31 columns**, where the
 * photograph's R only touches the clip for one or two. Which means the
 * flatness and the clip are the *same* defect: `V = max(R,G,B) = R` on an
 * amber lens, so a saturated R channel flattens V by construction while G is
 * underneath it running 174 → 102, a range of 72. There was never a missing
 * ramp. There was a ceiling on top of one.
 *
 * It also explains the saturation. The photograph's dark end is R/G **1.92**
 * and `LIGHTS.indicatorColor`'s own R/G is 1.85, so the dye is close to right;
 * what the bright end has that this does not is the lens's **neutral
 * front-surface reflection** outweighing the dyed return. `cavity` is the
 * dyed term — it goes through the dye twice — and the Fresnel is neutral, so
 * taking `cavity` down raises the Fresnel's share and walks R/G at the bright
 * end towards 1.11 at the same time as it lifts R off the clip. One term,
 * three readings.
 */
const AMBER_OPTIC: LensOptions = {
  ...OPTIC,
  homogenise: 0.30,
  cavity: 0.28,
};

/**
 * The aperture the body pressing leaves for the lamp.
 *
 * **It runs to the body's own silhouette, not to `HP.front.lampOuterX`.** The
 * hardpoint's 779 mm is where the *clear* lamp ends; measured on the reference
 * photograph the amber corner lens butts straight onto the headlamp glass and
 * carries on to the body edge at ~850 mm, wrapping round onto the wing face.
 * The 71 mm between the two is indicator, not paint. `src/car/body.ts` now
 * carries a `lampSideR` panel across that band — it is the sheet metal behind
 * the indicator, which is right — and this outline is what covers it. Clamped
 * to the hardpoint instead, that panel renders as a bright painted strip
 * outboard of the lamp that the real car does not have.
 */
const aperture: Outline = {
  yLo: F.lampBottomY,
  yHi: F.lampTopY,
  xInner: () => F.lampInnerX,
  xOuter: (y) => Math.max(noseHalfWidth(y) - 0.004, F.lampOuterX),
  radiusInner: 0.010,
  radiusOuter: 0.028,
};

/**
 * The glass: inset by the seal and the bezel where there IS a bezel — top,
 * bottom and inboard — and by the seal alone at the outboard end, because
 * there is no bezel there.
 *
 * Inset uniformly, the amber stopped 19 mm short of the body corner and what
 * showed in the gap was the housing's own wall. That reads as a bright
 * vertical bar closing the cluster off, which is the single thing that most
 * makes the nose look like jewellery rather than like the car.
 */
/**
 * How far short of the body corner the amber stops.
 *
 * **Not `LIP`, which is what it used to be, and the difference is a painted
 * panel showing through the indicator.** `perimeterFade` collapses the lip to
 * zero width over t 0.25-0.5, which is the outboard end, so there is no lip
 * out there for the glass to clear — the inset is only the moulding gap. Tying
 * it to `LIP` meant widening the lip to mesh it as a roll also widened the
 * strip of `lampSideL` left uncovered, and that panel is **already 1 mm proud
 * of the amber lens** before anything is taken off the glass:
 *
 *     __AUDI.pick at `headlight` (380, 520)
 *       lampSideL          paint                d 2.651   z 0.944
 *       headlampAmberLens  lens:ff8a12:...      d 2.652   z 0.944
 *
 * — so the outboard half of the indicator renders as body paint. That is
 * `src/car/body.ts`'s panel, not this outline, and the report carries it; this
 * constant exists so that work in here cannot make it worse.
 */
const OUTBOARD_GAP = 0.0015;
const lensOutline: Outline = {
  yLo: aperture.yLo + LIP + GASKET,
  yHi: aperture.yHi - LIP - GASKET,
  xInner: (y) => aperture.xInner(y) + LIP + GASKET,
  xOuter: (y) => aperture.xOuter(y) - OUTBOARD_GAP,
  radiusInner: Math.max((aperture.radiusInner ?? 0) - LIP - GASKET, 0),
  radiusOuter: Math.max((aperture.radiusOuter ?? 0) - OUTBOARD_GAP, 0),
};
const AMBER_SPLIT = F.indicatorInnerX;
/**
 * Half-width of the moulded wall between the amber and the clear sections.
 *
 * **Not a hairline, and not aluminium.** "The photograph's lamp is a
 * near-featureless sheet" was read off a frame whose own lamp was already
 * featureless. Measured across the owner's photograph at the lens's mid rows
 * (690-730), the clear-to-amber joint falls 252 → **173** → 252 over cols
 * 1336-1348 — an amplitude of **79**, 13 mm wide at V < 230. In
 * `bat3_front3q.jpg` at 4x it is a hard black line with the amber's own
 * rounded corner sitting inside it.
 *
 * This model had the gap at 5.2 mm and filled it with `reflector()`, so the
 * joint read **241 → 254, an amplitude of 4 and the wrong sign**. 6 mm of
 * half-width gives the measured 12 mm, and it wears `rubber` — see
 * `amberGasketGeo`.
 */
const DIVIDER = 0.0060;
/**
 * Half-width of the wall between the two CLEAR chambers, which is a different
 * part and a different width — see `CHAMBER_SPLIT`. The photograph resolves
 * it; it is the one division on the lamp that is meant to be seen.
 */
const CHAMBER_WALL = 0.0055;

/**
 * How much bigger the reflector's own paraboloid is than the slot it is seen
 * through. Mostly vertical: the aperture is a letterbox and the optic is not.
 *
 * These are also what keeps the glass reading as ONE sheet. A paraboloid sized
 * to the slot puts its steep rim at the slot's edge and its vertex in the
 * middle, which is exactly the two-lobe, X-seamed look the reference frame
 * does not have; cropping the flat middle of a much larger optic does not.
 * `OPTIC_W` is bounded at ~1.34 by `f < depth` — beyond that the H4's envelope
 * comes out through the lens.
 */
const OPTIC_W = 1.3;
const OPTIC_H = 2.4;

/**
 * Vertical division between the two clear chambers.
 *
 * **It is not the midpoint.** It sat at the midpoint, and `CRITIQUE-4` §3 read
 * `headlampDivider`'s bounds as ±0.692 and concluded the divider was at the
 * lens's own inboard edge dividing nothing. That is the bounding-box trap:
 * the mesh is a merge of *two* dividers, at 0.535 and 0.688, and a box round
 * both reports only the outer one. The divider existed. It was in the wrong
 * place and it could not be seen.
 *
 * Where it belongs, as a fraction of the clear lens's width measured from its
 * inboard edge, on three photographs:
 *
 *     owner_1988.png, lower band where the flutes modulate   0.346
 *     bat3_front3q.jpg, the dark wall at 4x                  0.36
 *     bat3_front3q.jpg read by eye off the 4x crop           0.30
 *
 * So the inboard unit is about a third of the glass and the outboard one two
 * thirds — which is also why the inboard chamber's flutes are visibly finer
 * per unit width in `bat3_front3q.jpg`: the two chambers are not the same
 * size and never were.
 */
const CHAMBER_FRACTION = 0.35;
const CHAMBER_SPLIT = (() => {
  const inner = lensOutline.xInner(0.78);
  return inner + CHAMBER_FRACTION * ((AMBER_SPLIT - DIVIDER) - inner);
})();

/**
 * Where the reflector's shelf breaks, as a fraction down the glass.
 *
 * The lens is not one field. Owner's photograph, row means across the clear
 * lens, white-balanced:
 *
 *     rows 679-718    246-249        rows 720-751    237-243
 *
 * — a step of **8.1** grey levels with the break at row 719-721, which is
 * 0.56 of the way down a lens spanning 677-753. Above it the aperture returns
 * the bowl and the sun; below it the reflector's lower shelf tilts out of the
 * sun and the glass carries the road instead.
 *
 * The model had a step of **1.7** and a row range of 4.0 against the
 * photograph's 12.1: one paraboloid filling the aperture gives a field with a
 * vertical gradient and no break in it anywhere, which is exactly the
 * "featureless white card" reading.
 */
const SHELF_FRACTION = 0.56;

export interface HeadlampSet {
  group: THREE.Group;
  /** The two clear chambers, both sides — they never run independently. */
  main: Glow;
  /** Amber sections, left then right. */
  indicator: [Glow, Glow];
  emitters: BeamGeometry[];
}

export function buildHeadlamps(ctx: BuildContext, glows: GlowFactory): HeadlampSet {
  const group = new THREE.Group();
  group.name = 'headlamps';

  const chrome = ctx.materials.chrome({ roughness: 0.055 });
  const black = ctx.materials.blackTrim();
  /**
   * The gasket's own rubber — **with the road film taken off it.**
   *
   * `rubber`'s default `dust: 0.3` mixes 30 % of `uDustColor`, a 0.043 linear
   * grey, into a 0x141416 carcass whose own albedo is 0.0065. That is 0.0175,
   * **2.7× the carcass**, on the surface this joint is relying on to be the
   * darkest thing on the nose. The default is a weatherstrip's, and a
   * weatherstrip sits in a gutter and collects; a lens rebate is inside a
   * sealed lamp and does not. 0.73 is the lowest rung `RUBBER_RUNGS` offers,
   * on the same reasoning: a narrower lobe collects less of a low sun from a
   * surface aimed nowhere near it.
   *
   * **Both are physics, not measurement: the change is worth 0-3 levels and
   * the null test in `GASKET` says why.** An absolutely black surface in this
   * slot reads the same as this one at the upper groove and 16 levels lower at
   * the lower one, so the whole of what any finish can do here is 16 levels,
   * and the road film was never more than a few of them. Kept because a sealed
   * rebate carrying a weatherstrip's road film is wrong, not because it moved
   * the frame.
   */
  const rubber = audiMaterials(ctx.materials).rubber({
    roughness: 0.73, dust: 0, mouldGloss: 0,
  });
  const reflectorMat = ctx.materials.reflector();
  /**
   * The shelf's own finish.
   *
   * Aluminised, like everything else in there, but **matt** — and that is a
   * real distinction, not a dodge round the "no black plastic inside a
   * composite headlamp" rule above. The optical bowl is bright-finished
   * because its job is to aim light; the shelf below it is outside the beam
   * pattern and comes out of the tool textured. `reflector()` is a 0.13
   * roughness mirror with a 1.1 mm pebble diffuser on it and cannot be asked
   * for anything else, so this is the same aluminium at a roughness that
   * scatters the sun instead of mirroring it.
   *
   * **The orientation alone was not enough, and that is measured.** With the
   * shelf wearing `reflector()` the aperture's upper half came out 2.3 above
   * its lower 44 % against the photograph's 8.1 — a mirror tilted 19° in a
   * scene whose sky and road are only a few levels apart through half a metre
   * of `homogenise` barely moves. Splitting the finish as well as the angle is
   * what gets the step, and it survives an environment being retuned
   * underneath it because it is carried by the surface rather than by what the
   * surface happens to be looking at.
   */
  const shelfMat = audiMaterials(ctx.materials).anodised({
    color: 0xdfe2e6,
    roughness: 0.34,
    envMapIntensity: 1.0,
  });
  // **Water-clear.** The 0xf4f7fc it used to be is a 7 % tint, and the lens
  // shader charges for it twice — once in its own Beer–Lambert term and again
  // in the transmission volume's attenuation — over a path the prism valleys
  // lengthen by half as much again. That is 12-15 % off the brightest element
  // on the car, to model a tint moulded acrylic does not have. The faint green
  // people see in a headlamp lens is soda-lime *glass*, and this one is PMMA.
  const lenses = audiMaterials(ctx.materials);
  const clearLens = lenses.lens(0xffffff, OPTIC);
  const amberLens = lenses.lens(LIGHTS.indicatorColor, AMBER_OPTIC);
  // A bulb envelope has to be OPAQUE. Three renders transmissive surfaces
  // against the opaque back buffer, so anything transparent inside the lens is
  // simply absent when you look through it — and the point of the whole
  // exercise is that you can see the bulb in there. A near-black emissive with
  // the library's rim lift reads as glass and costs nothing when unlit.
  const coldBulb = ctx.materials.emissive(0xe6ebf4, 0.06);
  const coldFilament = ctx.materials.emissive(0xffe6b4, 0.4);

  // --- lip and gasket ------------------------------------------------------
  /**
   * The pressing's rolled edge with the hairline of bright trim over it —
   * **meshed as a roll, which is the whole point.**
   *
   * Six bands over 5.6 mm of section at slopes +70°, +61°, +41°, +7°, −66°,
   * −84°, so the normal sweeps continuously instead of jumping between the two
   * values three profile points could carry.
   *
   * The crest is **3.6 mm proud and 2.2 mm inboard of the aperture's edge**,
   * which is what makes it a wall rather than a line: it is the proud
   * neighbour the channel did not have, and the amber joint's 178 against the
   * channel's 203 is what one of those is worth. The last band is the 0.4 mm
   * near-vertical drop into the channel.
   */
  const lipGeo = frame({
    outline: aperture,
    zAt: FACE, facing: FACING,
    profile: [
      [-0.0022, 0.00220],
      [-0.0013, -0.00050],
      [-0.0005, -0.00170],
      [0.0004, -0.00205],
      [0.0013, -0.00160],
      [0.0020, -0.00030],
      [LIP, 0.00120],
    ],
    fade: perimeterFade,
  });
  /**
   * The black channel: the gasket, the lens's retaining rebate and the shadow
   * they sit in, which from any distance are one feature.
   *
   * The darkness is geometric, not a material trick. The lip's crest stands
   * 2.1 mm proud and the floor is 12.5-14.2 mm behind the skin, so the sky is
   * cut off within ~60° of the floor's normal over a 10 mm slot, and the
   * glass closes the other side. GTAO's 0.18 m radius does the rest.
   *
   * **The floor is raked, and which way it tilts is doing real work.** It runs
   * 1.7 mm deeper as it goes inward, so the normal leans 13° — and because
   * `frame` sweeps one section round the whole perimeter, that lean is *down*
   * along the top edge and *up* along the bottom one. The top channel then
   * looks at the bumper and the road and the bottom one at the sky, which is
   * the asymmetry the photograph has: 81 at the top against 94 at the bottom,
   * the top warm (81/67/63) and the bottom cool (94/87/91). One profile, both
   * readings, with no per-edge special case to get wrong.
   *
   * It lands at the reflector's own rim depth so the bowl's `fit` edge meets
   * it flush; anything shallower leaves an annular void that shows the
   * housing's aluminium through a 0.4 mm slot.
   *
   * **13° and 12.5 mm after a round of trying 50° and 22.5 mm.** At
   * `goldenhour`'s 11.5° of solar elevation a floor leaning 13° has `N·L`
   * 0.49, so it looked as though it were taking half the sun's full irradiance
   * and that that was why it read 203. Raking it to 50° takes `N·L` to 0.207
   * and costs one of the 3.3 apparent rows to foreshortening; with ten more
   * millimetres of depth beside it, the pair moved the pixel by **1 level**,
   * because the pixel is the bloom's. See `GASKET`. So the rake is back where
   * its warm/cool asymmetry was measured and the row is back in the groove.
   *
   * ## The lower channel is one row, and the bumper is why
   *
   * `__AUDI.pick` down x 1012 at `photomatch` puts the aperture's lower edge
   * at y 0.6545 and the glass at 0.667 — and **`frontBumper`'s top shelf at
   * y 0.661, z 0.948**, which is 6.5 mm up into the 12.5 mm channel and only
   * 5.5 mm behind the skin where this floor is 13.5. At row 483 the pick
   * returns `frontBumper` at d 3.901 *in front of* `headlampSeal` at d 3.909:
   * the bumper's own shelf is drawn over the outer half of the lamp's lower
   * gasket. The camera is 5.65° above, so the sight-line clears that shelf
   * only for the inner 4 mm, which is the **one row** that survives against
   * the photograph's 24. Nothing in this file opens it up — a deeper floor
   * was tried for exactly this and bought no rows — and
   * `src/car/trim/bumpers.ts` owns the shelf. The report carries it.
   */
  const gasketGeo = frame({
    outline: aperture,
    zAt: FACE, facing: FACING,
    profile: [
      [LIP, 0.0012],
      [LIP + 0.0018, 0.0125],
      [LIP + GASKET - 0.0016, 0.0142],
      [LIP + GASKET, 0.0135],
    ],
    fade: perimeterFade,
  });

  // --- housing -------------------------------------------------------------
  // Closes the aperture off at `Z.lampBack`, the wall the body pressing leaves.
  const housingGeo = slab({
    // **Inboard of the gasket, and starting behind its floor.** At
    // `inset(aperture, 0.0055)` / `front: 0.012` the rim wall crossed straight
    // through the new channel at 13 mm, and with `capFront: false` what showed
    // in the slot was a 7 mm ring of 88 % aluminium — the brightest thing on
    // the car, exactly where the photograph is at 81.
    outline: inset(aperture, LIP + GASKET),
    zAt: FACE, facing: FACING,
    // 78 mm keeps the back wall just clear of `Z.lampBack`, the wall the wing
    // pressing already leaves, even where the nose face has rolled 14 mm back.
    front: 0.016,
    back: 0.078,
    capFront: false,
    nu: 20, nv: 12,
  });

  // --- chambers ------------------------------------------------------------
  const chambers = [
    { x0: lensOutline.xInner(0.78), x1: CHAMBER_SPLIT - DIVIDER, amber: false },
    { x0: CHAMBER_SPLIT + DIVIDER, x1: AMBER_SPLIT - DIVIDER, amber: false },
    { x0: AMBER_SPLIT + DIVIDER, x1: 10, amber: true },
  ];

  const bowls: THREE.BufferGeometry[] = [];
  const shelves: THREE.BufferGeometry[] = [];
  const envelopes: THREE.BufferGeometry[] = [];
  const shields: THREE.BufferGeometry[] = [];
  const coils: THREE.BufferGeometry[] = [];
  const mainGlow: THREE.BufferGeometry[] = [];
  const amberGlow: THREE.BufferGeometry[] = [];
  const focus: THREE.Vector3[] = [];

  for (const c of chambers) {
    const fit = sliceX(lensOutline, c.x0, c.x1, 0.006);
    const box = measure(fit);
    const RIM_DEPTH = 0.0135;
    const rimZ = FACE(box.cx, box.cy) - RIM_DEPTH;
    const depth = 0.052;
    // The optic is BIGGER than the hole you see it through, and much bigger
    // vertically: the reflector shell is a shape of revolution flanged out
    // behind the seal, and the aperture is a 130 mm letterbox cut across it.
    // Sizing the paraboloid to the slot instead made the slot's own edge the
    // rim, where the surface is steepest — so the top of the bowl mirrored the
    // road and the bottom mirrored the sky's edge, and the lamp rendered 198
    // at its top and 184 at its bottom against 230 through the middle. The
    // photograph is flat at 228-244 corner to corner. Cropping a larger, much
    // flatter paraboloid is what produces that.
    const halfW = (box.halfW - 0.0006) * OPTIC_W;
    const halfH = (box.halfH - 0.0006) * OPTIC_H;

    bowls.push(
      bowl({
        cx: box.cx, cy: box.cy,
        halfW, halfH,
        zAt: FACE, rimDepth: RIM_DEPTH, facing: FACING, depth,
        corner: 4.4, flat: c.amber ? 0.16 : 0.13,
        // The bowl is pulled out to the lens' own outline. The 1.5 mm it used
        // to stand back from it was a ring of housing showing through the
        // glass all the way round the aperture, and in the reference frame
        // there is no such ring: the optic runs to the seal.
        fit: inset(fit, 0.0004),
        nu: 30, nv: 22,
      }),
    );

    // The lower shelf. Clear chambers only: the amber section is a plain
    // reflector behind a dyed lens and the photographs show no break in it.
    if (!c.amber) shelves.push(shelfPanel(inset(fit, 0.0004), rimZ));


    // A paraboloid r² = 4fζ: with the rim half-width as r and the bowl's own
    // depth as ζ, the focus falls f = R²/4D forward of the vertex. Putting the
    // filament anywhere else is what makes a modelled lamp look like a torch.
    //
    // `f < depth` is the condition for the filament to sit inside the bowl at
    // all, and it used to bound `OPTIC_W`: at 1.45 the H4's envelope came out
    // through the lens.
    //
    // **It is clamped now, because the bound was on the wrong quantity.** The
    // condition is not about `OPTIC_W` — it is about the chamber's own width,
    // and the chambers stopped being the same size when `CHAMBER_SPLIT` went
    // to its measured 0.35. The outboard chamber's half-width went 75 → 90 mm,
    // `f` with it 45.7 → 64.2 against a 52 mm bowl, and the bulb came out 5 mm
    // in front of the lens's inner face as a dark blob sitting *on* the glass.
    // A real rectangular reflector is not a paraboloid of revolution and its
    // filament does not sit at the focus of the wide section; 0.82 of the
    // bowl's depth keeps the envelope inside the bowl at any split.
    const f = Math.min((halfW * halfW) / (4 * depth), depth * 0.82);
    const vertexZ = rimZ - depth;
    const fz = vertexZ + f;
    focus.push(new THREE.Vector3(box.cx, box.cy, fz));

    // H4-style capsule: glass envelope, coiled filament at the focus, and the
    // little cup shield under it that makes the flat top of a dipped beam.
    const glass = tubeZ(0.0075, 0.0072, 0.038, 18, false);
    glass.translate(box.cx, box.cy, fz - 0.010);
    envelopes.push(glass);

    // The black-painted dome on the end of an H4. It exists to stop the
    // filament throwing light straight down the axis, and against a bright
    // bowl it is the one part of the bulb you can actually pick out through
    // the lens — a small dark disc dead centre of each chamber.
    const tip = tubeZ(0.0092, 0.0074, 0.006, 18, false);
    tip.translate(box.cx, box.cy, fz + 0.012);
    shields.push(tip);

    const coil = filament(0.0062, 0.0016, 4.5, 0.00045);
    coil.translate(box.cx, box.cy, fz);
    coils.push(coil);

    if (!c.amber) {
      const shield = tubeZ(0.0042, 0.0042, 0.010, 14, true);
      shield.translate(box.cx, box.cy - 0.0035, fz + 0.001);
      shields.push(shield);
    }
    const collar = tubeZ(0.0105, 0.0088, 0.012, 16, false);
    collar.translate(box.cx, box.cy, vertexZ - 0.004);
    shields.push(collar);

    // The blaze: a shallow dish filling the chamber, hidden while the lamp is
    // off so nothing masks the reflector, and bright enough when lit that the
    // bloom pass takes it.
    const dish = bowl({
      cx: box.cx, cy: box.cy,
      halfW: box.halfW - 0.0035, halfH: box.halfH - 0.0035,
      zAt: FACE, rimDepth: 0.0175, facing: FACING, depth: -0.010,
      corner: 4.4, fit, nu: 18, nv: 12,
    });
    (c.amber ? amberGlow : mainGlow).push(dish);
  }

  // --- lenses and dividers -------------------------------------------------
  const clearGeo = slab({
    outline: sliceX(lensOutline, 0, AMBER_SPLIT - DIVIDER, 0.007),
    zAt: FACE, facing: FACING,
    front: 0.0018, back: 0.0018 + LENS_BODY,
    crown: 0.0016,
    nu: 24, nv: 10,
  });
  // **`nv` 24, not 10, and that is the "folded paper" of `CRITIQUE-5` §11.**
  // This is the one lens panel whose outline wraps: `aperture.xOuter` follows
  // `noseHalfWidth(y)` and carries a 28 mm corner radius, and the wrap is in
  // *y*, so it is `nv` that resolves it. Ten steps over 148 mm is a 14.8 mm
  // station pitch — **two stations across a 28 mm radius** — and a radius
  // sampled twice is a chamfer. 24 gives 6.2 mm, five stations on the corner.
  // `nu` goes to 20 for the crown, which was being carried on 14.
  const amberGeo = slab({
    outline: sliceX(lensOutline, AMBER_SPLIT + DIVIDER, 10, 0.007),
    zAt: FACE, facing: FACING,
    front: 0.0018, back: 0.0018 + LENS_BODY,
    crown: 0.0014,
    nu: 20, nv: 24,
  });

  // The amber division is a hairline: a 10 mm wall 48 mm deep behind a clear
  // lens reads as a dark slot right across the glass, and in the reference
  // frame the amber division is one bright line. It stops at the reflector rim
  // rather than running to the back of the housing, which is all a moulded
  // divider does anyway.
  //
  // The **chamber** wall is not a hairline. §2.1 asks for "two clear
  // rectangular optical units side by side, separated by a visible vertical
  // divider", and all three photographs resolve it: in `bat3_front3q.jpg` it
  // is 26 px of a 200 px lens, about 11 mm of glass, with a dark core. So it
  // is 11 mm wide, it is crowned — the same rolled section the grille's
  // surround uses, so part of it presents the sky and part the dark chamber
  // beside it whichever way the camera stands — and it stands 3 mm in front of
  // the bowl rims rather than 1.2, which is what puts its flanks in shadow.
  const dividerGeo = divider(CHAMBER_SPLIT, CHAMBER_WALL * 2, 0.016, 0.0030, 0.0022);
  /**
   * The amber joint, which is the one division on this lamp that is a *gap*
   * rather than a wall seen through glass.
   *
   * It was merged into `headlampDivider` and so wore `reflector()` with it,
   * which is how a 79-level black line came out as a 4-level bright one. Now
   * it is a 12 mm rebate 14 mm behind the skin — 12.2 mm below the lens
   * faces either side of it, so the slot subtends about 45° and the two lens
   * rims shade it — in `rubber`, and it merges with the perimeter gasket
   * instead, which costs no draw call because that is the same material.
   */
  const amberGasketGeo = divider(AMBER_SPLIT, DIVIDER * 2, 0.024, 0.014);

  // --- assembly ------------------------------------------------------------
  const add = (name: string, geo: THREE.BufferGeometry | null, mat: THREE.Material): void => {
    if (!geo) return;
    const mesh = new THREE.Mesh(bothSides(geo), mat);
    mesh.name = name;
    group.add(mesh);
  };

  /**
   * **A clear lens does not cast a shadow.**
   *
   * `Car.build` runs a post-pass that turns `castShadow` on for every mesh a
   * builder produced unless it is marked `userData.noShadow`. `tidy()` in
   * `src/car/lights.ts` sets `castShadow = false` on the lamps and runs
   * *before* that pass, so the flag was put straight back — and the headlamp
   * lens, a solid 409 x 168 mm plate 13 mm in front of the reflector, was
   * writing itself into the sun's shadow map and blacking out its own bowl.
   *
   * That is why the unlit lamp read as a washed-out lens rather than a block
   * of reflected sun: the only light reaching the reflector was the IBL. In
   * the reference photograph the lamp is the brightest thing on the car at
   * 228–244 — that is direct sun, off the bowl, back out through the glass.
   *
   * `noShadow` is the documented opt-out and is the mechanism `tidy()` should
   * have used; the rest of the lamps still need the same fix in that file.
   */
  const noShadow = (o: THREE.Object3D): void => {
    o.traverse((n) => { n.userData.noShadow = true; });
  };

  add('headlampBezel', lipGeo, chrome);
  add('headlampSeal', merge([gasketGeo, amberGasketGeo]), rubber);
  // **There is no black plastic inside a composite headlamp.** The housing is
  // a black moulding from outside, but every interior surface — the bowl, the
  // shelf around it, the wall between the chambers — is vacuum-aluminised in
  // one operation, because any absorbing surface in there is lost beam.
  //
  // Modelled in `blackTrim` and mirror `chrome`, they were both dark: the
  // bowl is a mirror and what a mirror shows is whatever is inside the lamp,
  // so a black shelf and a mirror-polished divider fed the bowl its own dark
  // interior and the aperture came out at 0.89 of the licence plate's value.
  // The photograph has the lamp *level with* the plate — 236 against 236 —
  // because everything the bowl can see in there is 88 % aluminium.
  add('headlampHousing', housingGeo, reflectorMat);
  add('headlampReflector', merge(bowls), reflectorMat);
  add('headlampShelf', merge(shelves), shelfMat);
  add('headlampDivider', dividerGeo, reflectorMat);
  add('headlampShield', merge(shields), black);
  add('headlampBulb', merge(envelopes), coldBulb);
  add('headlampFilament', merge(coils), coldFilament);

  const clearMesh = new THREE.Mesh(bothSides(clearGeo), clearLens);
  clearMesh.name = 'headlampLens';
  fluteHorizontal(clearMesh.geometry, clearMesh);
  group.add(clearMesh);

  const amberMesh = new THREE.Mesh(bothSides(amberGeo), amberLens);
  amberMesh.name = 'headlampAmberLens';
  fluteHorizontal(amberMesh.geometry, amberMesh);
  group.add(amberMesh);

  // --- driven surfaces -----------------------------------------------------
  // 3.4, not 10: a 1988 halogen is warm and not very bright, and an emissive
  // pushed until it clips is how a period lamp ends up looking like an LED.
  // The bloom pass carries the apparent brightness from here.
  const main = glows.make(bothSides(merge(mainGlow)!), {
    color: LIGHTS.headlampColor,
    peak: 2.0,
  });
  main.mesh.name = 'headlampGlow';
  group.add(main.mesh);

  const amberRight = merge(amberGlow)!;
  const indicator: [Glow, Glow] = [
    glows.make(mirrored(amberRight), { color: FILAMENT, peak: 2.3 }),
    glows.make(amberRight, { color: FILAMENT, peak: 2.3 }),
  ];
  indicator[0].mesh.name = 'headlampIndicatorL';
  indicator[1].mesh.name = 'headlampIndicatorR';
  group.add(indicator[0].mesh, indicator[1].mesh);

  noShadow(group);

  // --- beam emitters -------------------------------------------------------
  // One emitter per side, between the two clear chambers — but placed a
  // centimetre *in front of* the lens rather than at the filament. A
  // spotlight is a point source with inverse-square falloff, so an emitter at
  // the real focus lands 14 000 units of light on its own lens 30 mm away and
  // blows the whole assembly to white. Ahead of the glass, the lamp lights the
  // road and the bumper and leaves its own optics to the emissives.
  const cx = (focus[0].x + focus[1].x) / 2;
  const cy = (focus[0].y + focus[1].y) / 2;
  const cz = FACE(cx, cy) + 0.012;
  const emitters: BeamGeometry[] = [
    { origin: new THREE.Vector3(-cx, cy, cz), dir: new THREE.Vector3(0, 0, 1) },
    { origin: new THREE.Vector3(cx, cy, cz), dir: new THREE.Vector3(0, 0, 1) },
  ];

  return { group, main, indicator, emitters };
}

// ---------------------------------------------------------------------------

/** 0 below `lo`, 1 above `hi`, smooth between — for `frame`'s fade. */
function smoothBand(t: number, lo: number, hi: number): number {
  const k = Math.min(Math.max((t - lo) / (hi - lo), 0), 1);
  return k * k * (3 - 2 * k);
}

/**
 * No leg at the outboard end, for the lip and the gasket alike.
 *
 * `perimeter` puts the outboard edge at t 0.25-0.5, so this fades out over
 * the bottom-outboard corner and back in over the top-outboard one: the
 * strips above and below the glass each run out to the corner radius and
 * stop. The amber meets the body edge, which is what the photograph shows.
 * The two parts have to share it — a gasket that kept its 11 mm round the
 * outboard end would eat that much of the amber's width.
 */
function perimeterFade(t: number): number {
  const a = 1 - smoothBand(t, 0.205, 0.255);
  const b = smoothBand(t, 0.495, 0.545);
  return Math.min(a + b, 1);
}

function divider(
  x: number, width: number, depth: number, front = 0.0012, crown = 0,
): THREE.BufferGeometry {
  return slab({
    outline: {
      ...lensOutline,
      xInner: () => x - width / 2,
      xOuter: () => x + width / 2,
      radiusInner: 0.002,
      radiusOuter: 0.002,
    },
    zAt: FACE, facing: FACING,
    front, back: depth, crown,
    nu: crown > 0 ? 8 : 3, nv: 12,
    capBack: false,
  });
}

/**
 * The reflector's lower shelf: a plain aluminised panel filling the bottom
 * `1 − SHELF_FRACTION` of a clear chamber, tilted so it looks at the road.
 *
 * **The tilt is the whole mechanism, not the depth.** The bowl behind it is 46
 * to 52 mm back from its own rim everywhere inside the aperture — `OPTIC_H` is
 * 2.4, so the slot is a letterbox cut across the flat middle of a much taller
 * paraboloid and nothing in the aperture is near the paraboloid's rim. So a
 * panel 4 to 30 mm behind the rim sits comfortably in front of it and simply
 * substitutes for it, without shrinking the bowl and re-opening the ring of
 * housing that `fit` exists to close.
 *
 * A mirror tilted down by θ sends the camera's ray down by 2θ. The lamp is
 * ~0.7 m up, so even θ = 6° puts the returned ray on the road 3.3 m out
 * instead of on the sky; at the 19° this panel reaches over its lower half it
 * is 1 m out. That is the step the photograph has, and it costs no light from
 * the upper two thirds of the aperture, which is where the level the whole car
 * is exposed against comes from.
 *
 * The setback eases in rather than stepping, so the panel's own top edge still
 * catches the sun and the break reads as a fine bright line with a darker
 * field under it — which is what `bat3_front3q.jpg` shows at 4x.
 */
function shelfPanel(fit: Outline, rimZ: number): THREE.BufferGeometry {
  const yBreak = fit.yHi - SHELF_FRACTION * (fit.yHi - fit.yLo);
  const band = sliceY(fit, fit.yLo, yBreak, 0.003);
  const s = { y: 0, xLo: 0, xHi: 0 };
  return gridSurface({
    nu: 10, nv: 10,
    flip: FACING < 0,
    // **v runs UPWARD, and it has to.** `gridSurface` takes its winding from
    // the handedness of (u, v), and every other surface in this file — `bowl`,
    // `slab` — has x increasing with u and y increasing with v. Written the
    // other way round with the same `flip`, the triangles come out wound
    // backwards, the panel faces −Z, and `MeshPhysicalMaterial` is `FrontSide`,
    // so it is culled: present in `census()`, invisible in every frame. It
    // measured as the shelf being worth +0.6 of a grey level of step when it
    // was worth nothing at all.
    point: (u, v, out) => {
      const y = band.yLo + (band.yHi - band.yLo) * v;
      limitsAt(band, y, s);
      const x = s.xLo + (s.xHi - s.xLo) * u;
      // **Linear in the drop, not eased.** Eased, the setback's slope is zero
      // at both ends and steepest in the middle, so the panel is parallel to
      // the rim at the break, parallel again at the aperture's lower edge and
      // tilted only across the middle — which renders as a dark *band* at 0.6
      // down the glass with the field bright again below it. A constant slope
      // is one plane with one normal, and the whole lower field goes with it.
      out.set(x, y, rimZ - (0.0035 + 0.0225 * (1 - v)));
    },
  });
}

interface Box { cx: number; cy: number; halfW: number; halfH: number }

/** Largest usable rectangle inside an outline, for sizing a reflector. */
function measure(o: Outline, samples = 24): Box {
  const s = { y: 0, xLo: 0, xHi: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (let i = 0; i <= samples; i++) {
    spanAt(o, i / samples, s);
    if (s.xHi - s.xLo < 1e-4) continue;
    lo = Math.min(lo, s.xLo);
    hi = Math.max(hi, s.xHi);
    n++;
  }
  if (n === 0) return { cx: 0, cy: 0, halfW: 0.001, halfH: 0.001 };
  // The widest span, not the mean: a chamber under a wing that rolls away is a
  // wedge, and the bowl is meant to fill it and be trimmed by its own `fit`
  // clamp rather than shrink to an ellipse floating in the middle of it.
  return {
    cx: (lo + hi) / 2,
    cy: (o.yLo + o.yHi) / 2,
    halfW: Math.max((hi - lo) / 2, 0.002),
    halfH: Math.max((o.yHi - o.yLo) / 2, 0.002),
  };
}

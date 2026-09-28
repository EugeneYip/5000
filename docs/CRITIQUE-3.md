# Hostile review, round three — 2026-09-27

Shot at 1920×1080 through the shipped harness, all fifteen views, plus four
preset sets at 1600×900. Geometry measured in the built scene through
`__AUDI.bbox` / `__AUDI.pick` / `__AUDI.census`. Cast-shadow depth measured by
an A/B render with the car root hidden. Photometry against the owner's
photograph white-balanced with the gains in `REFERENCE-PHOTO.md`; plate scale
1.74 mm/px in the photograph, 1.76 in `photomatch.png`, 2.64 in `front.png`.

Reference images gathered this round live in `scratchpad/ref3/` with a
`SOURCES.txt` — 69 files, all confirmed **wagon**, including dead-on rears of
US-market 1988 5000 CS/CD Avants, a full left-flank profile, a 2048 px tailgate
badge close-up, and a roof-rail crop.

## Verdict

**No.** But the failure has moved and become tractable. The geometry is largely
right and the materials are largely right — **`noon` and `overcast` produce the
two most photographic frames this project has made.** Almost everything that
makes `goldenhour` read as CG is in the `goldenhour` light rig, and one number
explains most of it.

## The dapple adjudication

The lead thought the dapple read as dirt; the stream that built it had tested a
finer cut, scored it *better* (14.6 vs 16.6) and rejected it by eye. **Both were
right about different things, and the axis they were arguing over was the wrong
one.**

**On the car, where the photograph has none.** Across 443 mm of bumper face,
detrended with a 600 mm running mean to separate form from fleck:

| | mean | form (trend range) | fleck (residual σ) |
|---|---|---|---|
| photograph | 77.3 | 3.7 | **1.9 (2.4 %)** |
| render | 79.9 | 23.7 | **13.9 (17.4 %)** |

7.3× too much modulation on a surface the photograph measures flat to 2.4 %.
The render steps 45 % in 90 mm and back; the photograph is a monotone form
gradient and nothing else.

**And it reads as dirt because it is brown.** Neither party had measured this:

| | photo bumper | photo valance | render bumper |
|---|---|---|---|
| B − R | **+19.1** | **+22.9** | **−9.5** |

Independently re-measured by the lead: photograph +22.0, render −9.0. What fills
shade is sky, so shaded plastics are blue. Brown irregular patches on a brown
panel is the definition of a stain.

**On the road, where the photograph's dapple actually is, the render has almost
none.** Pavement under the canopy measures sun/shade 2.91 with residual σ 25.4 %;
the render's road manages 1.25–1.56 and 0.8–1.6 %. **17× too flat.**

And the premise itself is wrong — but **not in the direction this round
claimed**, and the correction matters.

The measurement stands: the road beside the car is flat to 1.9 % with a 1.35
spread, while pavement twenty metres away under the same trees is at 25.4 %
and 2.91. The *inference* does not. Flat means unbroken; it does not mean
sunlit. Measured in the same white-balanced space, colour settles it, because
in this photograph sun and shade have opposite casts:

| | level | B − R |
|---|---|---|
| pavement sunfleck (p85) | 147.2 | **−52.7** warm |
| pavement shade (p15) | 50.6 | **+4.1** neutral |
| road beside the car | 107.2 | **−2.5** |
| road in the foreground right | 103.9 | **−6.0** |
| road under the front bumper | 63.4 | **+10.3** |
| woman's skirt, camera-right face | 219.5 | **−1.1** |

The ground around the car carries the *shade* signature, not the sunfleck one,
and so does the white skirt of a person leaning on it. That is the same
argument the white balance already made: the balance was derived from the
licence plate, so anything sharing the plate's illumination reads neutral —
and sunlit concrete twenty metres away reads **fifty levels warm**. A neutral
derived from a sunlit card cannot do that.

**So the car and the people are in shade, and the sunflecks are elsewhere in
the frame.** `presets.ts`'s premise was right. What is wrong is that our car,
standing in that premise, still receives the full key: scaling the key alone
to the photograph's own 0.35 shade ratio takes dRGB 38.8 → 21.4 and the shaded
plastics from B−R −12.5 to −1.2. The fix is a real cast shadow over the car
from the grove, which keeps the road's sunflecks; cutting `sunIntensity` would
take those with it.

## 1. The key is ~3.5× too weak against the fill

The single number behind the tone profile, the milky look, the dead dapple, the
flat wheels, the glowing sills and the over-lit cabin. Round two's item 1 was
real and its fix was right; the pendulum has gone past the target.

A/B render, car root hidden, measured inside the car's own umbra (232,309 px,
16.1 % of frame):

```
render   road lit 106.1   in umbra 69.4   ratio 0.654  ->  direct:indirect 0.53 : 1
photo    sunfleck  147    shade    51     ratio 0.35   ->  direct:indirect 1.88 : 1
```

A car's own hard shadow should be *deeper* than partially-transmitting canopy
shade, so 1.88 is a floor. Corroborated twice: the grille trough reads 49–55
against the photograph's 27–30 at matched scale, and the histogram piles **30 %
of the car into one 32-level band** while missing both ends. Not a car that is
too dark or too light — a car shot with a 0.5 : 1 key.

## 2. The fill is orange and comes from underneath — `DISPROVED as the cause`

The light-rig stream A/B'd it: switching `env:bounce` off changes the shaded
bumper by nothing either way (87, B−R −11.9 both), and the front door and
bonnet by nothing. Its entire footprint is a thin band on the rub strip, arch
lips and rear valance — mean 0.53 of a level over the whole `side` frame. It
was cut anyway, because it is an orange rim the photograph has no trace of and
it double-counts a road bounce the cubemap already carries. But the 31-level
hue error is direct sun on a car that should be in shade, not this light.

Worth someone's attention separately: goldenhour's `bounce.dir` has a positive
y and the other four presets have negative — four of the five "bounce" lights
shine *downward*, which is a second key from above, not a bounce.

### As originally reported

`env:bounce` is a DirectionalLight at intensity **2.2**, colour `0xd4a173`,
direction `[0.3, 0.55, 0.62]` — *pointed up* — against a key of 6.3. A
35 %-of-key orange uplight. The rear rocker, a `paint` panel on a near-neutral
graphite, returns **saturation 0.42 in orange**. Under `noon` the identical
geometry and material returns bumper 27 and correct sills: the materials are
innocent.

## 3. The roof rails are black; every reference shows bright silver

`roofRails` wears `blackTrim`. `scratchpad/ref3/wm_roofrail_CROP_red_rail_and_feet.jpg`
shows a slim bright-anodised round-section rail; `wm_rear3q_100avant_tdi.jpg`
shows both full-length in silver. Stand-off ≈ 57 mm, section ≈ 20 mm, brackets
`REFERENCE-VEHICLE` §6.6's independently-derived 50–55 mm. Feet counted 5–6 per
rail against `HP.roof.railFeet` = 3. The rear terminations also stand proud as
black hooks where the reference sweeps down into the roof skin.

**Caveat: neither US wagon in `ref3` has rails at all, so the finish evidence is
Euro-only.** The owner's photograph shows rails, so the car has them.

## 4. The rear band is half height; the spoiler is ~96 mm too high

Dead-on rear, `bat_rear_straight_b.jpg`, scale 1.60 mm/px:

| | reference | render | error |
|---|---|---|---|
| black band | 93 mm | 32 mm | 2.9× short |
| badge strip | 83 mm | 58 mm | 1.4× short |

Spoiler top edge sits 65 % down the backlight on the reference, 30 % on ours.
The rear wiper parks *above* the spoiler on the reference and below it on ours.
(`bat3_rear_closeup_spoiler.jpg` misleads here — shot from above, the
foreshortening reverses the apparent order.)

## 5. The tailgate script is a modern geometric sans

`bat3_badge_audi5000cs_tailgate.jpg` at 2048 px: squared-off numerals with
rectangular counters and flat terminals, a dotless "ı", the 1980s Audi "d".
Character height ≈ 40 mm against our 31 mm. `badgeFuelInjection` is 74 mm
outboard of its hardpoint — a previous fix landed on one side only.

Open: all three US/Canada and German references carry **chrome four rings at
tailgate centre**. Round two recorded their absence as correct for a 5000 S on
one source. The sources disagree.

## 6. Dark panels are covered in white grit

`badge` view, dark tailgate panel, 0.213 mm/px: 88 specks above median+30,
median speck 4 px (~0.9 mm), peak 168 against a median of 40 — 4.2× local
contrast, ~0.6 per cm². `common.ts:174` already names it and `paint.ts:276` has
a resolve fade for sub-pixel flakes, but at this magnification the flakes are
*resolved*, so the fade never touches them. Their contrast is what is wrong.

## 7. The fuel filler is on the wrong flank

`fuelFlap x[−0.886, −0.860]`, and picking the `side` view returns `doorFR` at
+x, so −x is the car's left. `bat3_side_profile.jpg` is a left flank with no
flap; `bat3_rear_closeup_spoiler.jpg` shows it on the other side. Lower
confidence: `exhaustTip` is also on the left and two references put it right —
but both are turbo quattros.

## 8. `dusk` is physically impossible; `studio` blows half the car away

`dusk`'s ground is **3.2× brighter than the sky supposed to be lighting it**
(60 vs 19), and the car is a uniform caramel sculpture with no neutral anywhere.
`studio` has an unbounded specular punching a white hole through roughly
x 1180–1420, y 570–760 at 1600×900, with bloom bleeding across the grille.
**`noon` and `overcast` are the best frames in the project — leave them alone
and use them as the control.**

## 9. The cabin is over-lit and the seats are slabs

The headliner reads ~205 against a road outside at ~200 — cabin and sunlit
street at the same exposure. Real cabins sit two to three stops down behind
glass. The consequence shows on the money shot: head restraints and rear seat
backs read as bright cream blocks through the side glass.

The seats have no side bolsters, no centre-panel flutes, no piping, no seat-back
shell, no recline hardware, and head restraints with no visible posts. One
fabric weave at one scale for backs, bases and restraints alike.

## 10–13. Smaller, with pointers

- Lamp lenses carry a regular dot-matrix crosshatch, not fluting; the amber is
  flat and bright enough to read as *switched on*. Real amber (237, 139, 10),
  real red (144, 5, 14) — both deeper than ours.
- Mud flaps render as flat slate slabs with a dead-straight bottom edge.
  Neither BaT wagon nor the German Avant has mud flaps at all.
- The backlight mirrors a tiled, identical block-building motif from the
  backdrop's block runs — reads as printed pattern in any glass.
- Trees are still a mechanical row: uniform spacing, near-identical crowns, one
  khaki-olive tone.
- `headlampShaft` (×2, `visible: false`) has a world bbox spanning
  x[−11, 10], z[−0.28, 17.5] and intercepts every `__AUDI.pick` aimed at the
  front of the car. Costs nothing to draw; wastes every reviewer's time.
- 110 car meshes have `castShadow = false`, correctly for glazing and lenses but
  also for `headlampBezel`, `headlampHousing` and `markerBodies`, which are
  opaque.
- **35.2 fps at 1920×1080** against a 60 fps budget; 284 draws against 220.
  Triangles 971,694 against 1.2 M — comfortably inside.

## Verified right — do not disturb

Bumper-to-plate ratio 0.348 vs the photograph's 0.358. `rubStrip` 99 mm,
exactly the blueprint column scan. `tailgateRibPanel` on the tailgate at
z −3.767. Spoiler, CHMSL, black band and mud flaps all exist. **The grille is
right**: 7 bright slat lines at 19.8 mm pitch in a 135 mm aperture against the
photograph's 7 at 17.7 mm in 137 mm; only its trough level is wrong, which is
finding 1. Sun direction matches the photograph's shadows. Wheelbase 2687.5 mm,
half-width 908, tyre OD 616, plate 306 × 152. **Stance is right — 35 mm
arch-lip-to-tyre; do not "fix" it.** Track right: tyre outer face 833 against a
907 half-width. Front plate, keystone, PA blue-on-white, corner bolts,
inspection sticker, flush glazing, D-pillar in body colour, backlight rake.

## Claims checked and dropped — do not re-report

- *"The car casts no shadow."* It does; 16.1 % of the plan frame is umbra. It is
  3.5× too shallow, not missing. That it could not be seen by eye **is** the
  finding.
- *"A light-beam mesh hangs in front of the car."* `headlampShaft` is invisible;
  it only blocks raycasts.
- *"The car sits too high."* 35 mm arch gap, measured.
- *"The grille slats are too fine."* 7 at 19.8 mm vs 7 at 17.7 mm.
- *"The spoiler is in the middle of the glass where the real one is at the top."*
  The dead-on reference puts the real one 65 % down with glass above it. The
  error is 96 mm of height, not a relocation.
- *"The photomatch pose has no yaw and the photograph does."* ≈ 6°, negligible.
  A first eyeball of this said 33° and was wrong.
- *"The tyre sidewall has no lettering."* At `side` magnification the reference
  is equally featureless.
- *"The rear is too narrow."* Backlight ÷ body width 0.79 against 0.81.

## If only three things get fixed, in this order

1. Restore the key-to-fill ratio on the ground to ≈ 1.9 : 1 direct-to-indirect.
   It moves the tone profile, the dapple, the wheels, the cabin and the sills at
   once.
2. Make shaded plastics blue (B−R +19, not −10) by taking the orange out of
   `env:bounce`.
3. Turn the roof rails silver.

# Reference photograph — colour & plate derivation

The model reproduces one specific car: the Audi 5000 S Wagon in a period
snapshot taken on the Benjamin Franklin Parkway in Philadelphia at golden
hour (Danish and other national flags on the Parkway lampposts are visible,
as is the Museum of Art end of the boulevard).

The photograph is a warm-cast consumer film print, so nothing can be sampled
from it naively. Everything below was white-balanced first.

## White balance

The licence plate is the only certain neutral in frame.

| | R | G | B |
|---|---|---|---|
| Plate as photographed | 249 | 233 | 220 |
| Assumed true neutral | 236 | 236 | 236 |
| **Gain applied** | **0.948** | **1.013** | **1.073** |

## Paint

Sampling *after* white balance, by panel orientation:

| Sample | Balanced RGB | Hex | Saturation |
|---|---|---|---|
| Front fender, vertical face, y=600–640 | (144–147, 146–148, 154–155) | `#90919a` → `#92939b` | **0.096** |
| Hood, horizontal, centre | (118, 145, 174) | `#7690ad` | 0.309 |
| Hood, horizontal, right | (142, 170, 202) | `#8eaac9` | 0.33 |
| Hood, shadow pocket | (85, 89, 101) | `#555964` | low |

The hood is strongly blue **because a horizontal panel mirrors the sky** — that
is reflection, not pigment. The vertical fender faces, which see the street and
the trees rather than the sky, are near-neutral at saturation 0.096.

**Conclusion: a mid-dark neutral graphite metallic with a faint cool
undertone.** Base coat set to `#6b6f76`; the flake layer and clearcoat lift it
to the photographed `#90919a` under comparable light. Audi's period name for
this family was Graphit/Titan Grau Metallic.

A render is only accepted as colour-correct when, posed and lit like the
photograph (`--views=photomatch`), the fender face lands within ΔE 3 of
`#92939b` and the hood shows the same sky-driven blue shift.

## Tone

What the car in the photograph actually measures, white-balanced, read through
the polygon traced in `tools/sheet.py` (`PHOTO_CAR_POLY` — 17.8 % of the frame,
car all the way through, checked by overlay):

| | |
|---|---|
| median | **95** |
| below 40 | **11.5 %** |
| below 32 | 6.6 % |
| above 224 | **10.3 %** |

The shape matters more than any of those numbers. The photograph's car is
**wide**: it holds deep shadow and clipped highlight in the same frame. The
grille gaps are below 32 and the headlamps are above 224, thirty centimetres
apart. A render that matches the median and misses both ends is not close —
that is exactly the failure this project had, and a median moves for neither.

Two earlier figures, "median 131" and "3.2 % below 40", appear in
`docs/CRITIQUE-2.md` and were wired into `tools/sheet.py` as the acceptance
target. Neither is in the photograph. Both came from a car mask that was
selecting most of the frame, and the pair was swapped on top of that. Corrected
in commit 18e8bfc.

## The bonnet's colour is a lighting fact, not a paint fact

The single most useful measurement made on this photograph. Read through
`PHOTO_PAINT_POLY` (87,034 px) against the render's own `photomatch_paint.png`
mask (64,212 px), by percentile of each one's own luminance:

| | photograph | render |
|---|---|---|
| p10 | (64, 75, 89) **B−R +25** | (72, 71, 74) B−R +2 |
| p50 | (91, 110, 134) **B−R +43** | (110, 110, 117) B−R +7 |
| p75 | (131, 154, 181) **B−R +51** | (132, 131, 141) B−R +9 |
| p90 | (155, 175, 203) **B−R +48** | (178, 168, 167) **B−R −11** |

**In the photograph the brighter a bonnet pixel is, the bluer it is.** Bright
pixels are sky seen through branches. In ours the brighter it is the warmer it
is, because bright pixels are direct sun — and the sign flips at p90.

The tone *shape* already matches: normalised by their own medians the
photograph runs p10/p50/p90 = 0.68 / 1.00 / 1.57 and the render 0.65 / 1.00 /
1.51. So this is not a contrast-curve problem and the tonemap is not the
lever.

What it is, measured by A/B with the non-ambient lights zeroed, in linear
radiance over the paint mask:

    environment term   (0.0868, 0.0983, 0.1316)   B/R 1.52   52 %
    direct-light term  (0.1178, 0.0964, 0.0820)   B/R 0.70   48 %

Solving those against the photograph's bonnet through an inverted ACES gives
**env × 1.42, direct × −0.09**. The photographed car has essentially no direct
sun on its bonnet; ours gets half its light that way. The grove *is* shading
the car — `__AUDI_ENV.cast(false)` moves below-40 from 8.6 % to 2.1 % — but as
a **blanket rather than a dapple**, and a single scalar attenuation cannot
express what a canopy does.

Closed, with numbers, so nobody re-opens them: the canopy is not too bright or
too warm (10:1 darker than the sky behind it and fractionally cooler);
`sunIntensity` down does not work, because `ibl.ts` bakes the proxy world
under the same `preset.sunIntensity` and cutting the key cuts the fill the
flanks are made of (6.9 → 3.5 takes below-40 to 32.4 % and tone to 36.4);
opening the canopy puts blue exactly on target and makes dRGB *worse* while
flattening the dapple.

**Steer by the sign of B−R at p90, not by dRGB.** When the dapple is right it
goes positive on its own.

## Licence plate

Pennsylvania issue of the period: white face, dark navy characters, a thin
inset navy border, four corner bolt holes, and a small keystone separating the
character groups.

```
A2M ⬟ 909
```

Face `#f2f0ea`, characters `#1d2a4a`. The separator is a keystone, not a dot
and not a comma — it reads comma-like in the photograph only because of the
film grain and the shallow angle.

## The datum for any reading off a flank photograph

**Reference to the tyre's contact line, never to the hub.**

A loaded tyre is not a circle. Both BaT flank cars measure hub-to-contact
279.1 and 291.3 mm (silver, front and rear) and 266.9 and 279.8 (red) against
a free radius of ~304 mm for the 185/70 HR14 — they sit about 25 mm down on
their sidewalls with a driver's weight and a full tank on them. So a height
taken as "hub centre minus free radius" comes back **~25 mm high**, uniformly,
on every feature in the frame.

That is not a small error here. It is most of the difference between the front
bead being 40 mm out and being 62 mm out, and it was live in the hardpoints
until `b7157e3`. `scratchpad/cl2_datum.py` finds both contact lines and the
ground line through them; use it rather than re-deriving.

The same script reports the frame's **tilt**, which is not the same thing as
the ground line's slope — the hub-to-hub line and the contact line disagree
by a few tenths of a degree because the two tyres deflect differently. Fit the
ground line through the two contact patches and ignore the hubs entirely.

**Yaw matters too, and it is not negligible.** A constant mm/px is only correct
at the mean depth over the wheelbase. The scale that maps the front wheel patch
onto the rear one is 1.0050 on the silver car and 1.0200 on the red, so height
readings want ×1.005/×1.018 at the nose and ×0.995/×0.982 at the tail. It is a
1-2% correction and it is what takes a cross-check from 8 mm to 4.8 mm.

## Two things measured off the flank photographs, recorded here so they are not
## re-derived

- **The bright strip line rises over the wheelbase**: +42.5 mm (silver) and
  +32.6 (red) on the bright cap's top edge, yaw-corrected; +43.8 and +38.8 on
  the top of the dark band under it, uncorrected, which is the same measurement
  plus the yaw term. The rocker cover's top edge in the same frames rises only
  +20.0 and +11.9 with four times the scatter, so it is not a datum tilt — a
  tilted ground fit would tilt both. Full note at `HP.side.rubStripY`.

- **The side moulding runs unbroken to 81 mm from the tail.** Scanned aft of
  the rear axle on `bat3_side_profile.jpg` in 20 px steps, a dark band is
  present at strip height at every station from 815 mm forward of TAIL to
  81 mm forward of it, and vanishes only at 28 mm, where the body has curved
  out of a profile view. `HP.side.rubStripRearZ` is `TAIL + 0.398`, which ends
  the flank band 317 mm short of that. **Whether that is a defect depends on
  how far forward the rear bumper's own moulding wraps** — the two may meet
  with no visible gap, and the `side` render suggests they do. Measured and
  recorded; not yet resolved either way.

## Other details visible in the photograph

- **Roof rails fitted** — visible above the windscreen header. Confirms Avant.
- Large aero door mirror in black.
- One wide composite headlamp per side with the amber indicator at the
  outboard end. **Measured at ~409 x 168 mm, an aspect of 2.4 : 1**, agreed
  independently from this photograph (scaled on the plate) and from a 1985 US
  wagon (yaw solved from its square amber lens).
- Horizontal-slat grille, four rings centred in it. **Grille-to-single-lamp
  width ratio 1.81 : 1.**

  > An earlier reading of this photograph gave 1.41 : 1 and a 3.6 : 1 lamp, and
  > that error propagated into the hardpoints as a 700/500 mm front-face split.
  > Two mistakes caused it: the frame was measured without solving for yaw, and
  > the brightness threshold used to locate the lamp kept swallowing the
  > bumper's bright top strip. The strip sits at y 771-778 and the lamp aperture
  > at y 670-759 — separable, but only once you know to look.
- Dark grey textured bumper with a rub strip, amber marker in the bumper end.
- **The lower front apron is dark moulding on this car, not body colour.**
  `REFERENCE-VEHICLE` §6.3 reads the brochure's "integrated body-colored bumper
  aprons" as meaning the aprons above and below the grey moulding are paint.
  That may well be right in general, but the white-balanced photograph measures
  `#191f31` through the whole lower front — far darker than the `#91929b`
  fender. This photograph is the specific car being reproduced, so it wins.
  `frontValance` stays `bumperPlastic`; this note exists so the two documents
  no longer disagree silently.
- A Pennsylvania inspection sticker **low on the windscreen, driver's side** — frame-right in the
  photograph, at roughly (1157, 444), where the screen spans x 800-1250 and y 280-480. The car faces the
  camera, so frame-right is the car's left, which on a LHD car is the driver's side. That is also where
  Pennsylvania stickers go. *(This line read "top of the windscreen, passenger side" and was wrong on
  both counts. The model is right and the document was not; a review nearly "fixed" the model to match
  it.)*
- Flush glazing — the glass sits almost level with the body side.

---

# Blueprint silhouette — measured station heights

Source: <https://getoutlines.com/blueprints/car/audi/audi-100-avant-1986.gif>
(1986 Audi 100 C3 Avant orthographic side elevation, 542 × 172 px)

Calibration, re-verified independently of the body stream:

| | |
|---|---|
| Front axle | x = 426.0 px |
| Rear axle | x = 126.5 px |
| Ground line | y = 168.0 px |
| Scale | **8.972 mm/px** |
| Wheelbase check | 2687 mm vs published 2687 — exact |
| Length check | 4791 mm vs published 4792 (Euro) — 0.02 % |

The drawing is a true orthographic elevation, not a 3/4: the tyre circles are
round to 1 %. Silhouette heights above ground, at vehicle stations measured
from the front axle (nose is +z; on the drawing the nose is at the RIGHT):

| Station | z (m) | Height (mm) |
|---|---|---|
| Bonnet leading edge | +0.78 | **843** |
| Cowl / screen base | −0.37 | **1014** |
| Windscreen header | −1.17 | **1364** |
| Mid-roof (over rails) | −2.00 | 1462 |
| D-pillar | −3.05 | **1283** |
| Tail | −3.70 | **1148** |
| Max ink (roof rails) | — | 1480 |

These are the numbers the hardpoints were corrected against: `cowlY` 1.045 →
1.014, `headerZ` −1.280 → −1.170, and the whole front-end height family
(bonnet, grille top, lamp top, rings) dropped ~35 mm, which had it sitting
above a bonnet line the drawing puts at ~820 mm at the grille plane.

**Caution when re-measuring:** the drawing is low-resolution line art and its
outline has gaps. A naive "topmost ink in this column" scan returns a detail
line instead of the silhouette at some stations — a scan at z = +0.20 returns
655 mm, which is below the bonnet's leading edge and therefore obviously
wrong. Read several adjacent columns and sanity-check monotonicity.

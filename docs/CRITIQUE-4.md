# Critique 4

A hostile review of every standard view plus thirteen driven poses, against
the reference photographs and the factory literature. Written by a reviewer
that owned nothing and changed nothing.

Gate at the time of writing: dRGB 25.7 (stable across boots), tone profile
12.6, car mask 16.7 %. `census()` in a quiet moment: **287 meshes (+31
hidden), 1,037,828 triangles, 71 materials**. Triangles are inside the 1.2 M
budget; 287 draws is over the 220 target — a real but low-priority note.

## Two calibrations everything here rests on

Both established rather than assumed, and worth reusing.

- **`side` is near-orthographic at 3.3568 mm/px** on the flank plane, contact
  line at py 664.3, front hub at px 392.0. Derived by `__AUDI.pick` on a
  21-point grid and cross-checked against the 2687 mm wheelbase (800.4 px).
- **`bat3_side_profile.jpg` levelled on its contact line (−0.426°) and
  rescaled 0.7809×** lands its front hub and contact line exactly on the
  render's. Sanity check: that datum puts the reference roof edge at 1361 mm,
  which plus ~55 mm of roof crown gives 1416 against the published 1415.

## Ranked defects

### 1. The fixed-glass seal is a 117 mm woven tube standing 20 mm proud

The worst thing on the car. Down the whole A-pillar and round the fixed
glazing runs a fat, round-section, **coarsely woven black sausage** carrying a
visible fabric weave — the same family of texture as the cabin cloth. It
merges into the mirror sail and continues along the cowl.

```
  width across the pillar, dead-on side, same scale
      render ~117 mm       bat3_side_profile.jpg ~25 mm      ~90 mm too wide

  proud of the glass, in x
      fixedGlassOuter 0.836   fixedSeals 0.856   fixedSurround 0.859
                                    20-23 mm, against flushOffset of 2

  the DOOR seal next door is correct
      doorFRGlassOuter 0.857   doorFRSeals 0.860      3 mm
```

§2.5 asks for "a flush-bonded windscreen and a **very narrow black
surround**". CLAUDE.md states the rule outright: *flush glazing is the car's
signature, and if the glass looks recessed the model is wrong regardless of
everything else.*

> ### ⚠ Corrected. The defect is real; the attribution and both numbers above
> ### were wrong.
>
> **It is not the glass seal. It is `pillarTrim` — the INTERIOR A-pillar trim
> — poking out through the body**, from the A-pillar entry of `buildPillars()`
> in `src/car/interior/shell.ts`, a section swept along a CatmullRom through
> four hand-typed control points. Established by bit-identical A/B: hide the
> `cabin:interiorPlastic` batch and the tube goes, leaving a narrow dark
> pillar with a bright edge — the reference's read. Confirmed by eye on a
> matched-scale three-way figure.
>
> **"~117 mm" is a horizontal chord, not a width.** 35 px × 3.3568 reproduces
> it exactly. The pillar rakes at dx/dy ≈ −1.83, so a horizontal run converts
> by 0.4798. At matched scale, across the pillar:
>
> | | as shipped | trim hidden | reference |
> |---|---|---|---|
> | mean | 50.8 mm | 20.7 mm | 16.6 mm |
> | range | 40-58 | 18-27 | 13-20 |
>
> So the headline was inflated ~2.1× *and* compared against a reference
> number that was not measured the same way. The real gap is 51 against 17,
> and hiding the interior trim alone closes it to 21. The residual ~4 mm is
> `roofMoulding` being slightly wide — a note, not a defect.
>
> **The "proud in x" table is three whole-mesh bounding boxes**, each attained
> somewhere different on the car. `fixedGlassOuter` spans z −3.430…−0.437 —
> windscreen and rear quarter in one merged mesh — so 0.836 is the widest
> point of the greenhouse near the beltline, ~2.5 m from the A-pillar.
> Measured **at the A-pillar station** (z −1.10…−0.80, y 1.05…1.32):
>
>     fixedGlassOuter  0.7740
>     fixedSeals       0.7760     2.0 mm — exactly HP.glass.flushOffset
>     fixedSurround    0.7921
>     aPillarR         0.7937     the body skin
>     roofMoulding     0.8049
>
> **The seal is exactly right and needed no change.** Worse, *neither* seal
> can be proud of the skin by construction: `buildSeal` samples `glassPoint(z,
> t, smp, 0)` *on* the skin and every offset in `SEAL_PROFILE` and
> `BOND_PROFILE` is ≥ 0, i.e. into the body. The door seal held up above as
> the "working example" at 3 mm is the same kind of bad reading.
>
> This is WORKSTREAM.md's own trap — **the bounds of a part are not the part**
> — for the third time on this project, and I repeated it in my own summary of
> this critique without checking. The lesson generalises: a bbox on a *merged*
> mesh is worse than useless, because the number it returns is real and
> belongs to somewhere else entirely.
>
> **And the weave is not the interior plastic's.** Laplacian energy over patch
> mean in `front3q`: trim tube 0.287, `mirrorShells` 0.346, **`cowl` 0.844**,
> door glass 0.094, roof paint 0.133. It is a whole family of small dark
> parts, not one material.
>
> Also: `renders/sl_ab/` from an earlier attempt is **unusable** — its
> `front3q_no_fixedSeals`, `front3q_no_fixedSurround` and
> `front3q_no_cabin_interiorPlastic…` frames are bit-identical to each other,
> so that harness hid the same thing three times. Anyone reading those files
> will draw a false conclusion.

### 2. The grille is ~100 mm too narrow; the headlamps eat the difference

As the grille's share of the lamp band, which is depth- and scale-free:

| | grille share |
|---|---|
| owner's photograph | **0.514** |
| `photomatch`, y=458 | 0.448 |
| `front`, through the lamps | 0.452 |

The **total** band is right — 4.89 plate-widths against the photograph's 4.87
— so nothing is globally mis-scaled and only the split is wrong. On the
render's 1653 mm band the grille is 747 mm against ~850, and each lamp
assembly 429 against ~402. `grilleSlatCrests` is x ±0.366 and wants ~±0.415.

Scale chain: the plate's white field is 165 px for a 305 mm US plate
(1.848 mm/px); the grille's right edge is x=1183; the rings centre at 976.5,
so by symmetry the aperture is 770→1183.

Secondary, same pass: **the four rings are ~13 % too wide** — ring group over
plate width 0.842 rendered against 0.745 measured, ~270 mm against ~238.

> ### ⚠ Corrected: 26 mm per side, not 50. Rings 7-9 %, not 13 %.
>
> Every render-side figure above is a **luminance threshold**, and the grille's
> own level moves between boots: a fixed threshold on *identical* geometry read
> band shares of 0.4513, 0.4646 and 0.4675 across three runs. The 0.448 above
> is one of those, and it corresponds to an aperture edge at world x 0.355 —
> **15 mm inboard of where the geometry actually is.** `pick` puts the edge at
> x 0.370 exactly.
>
> Measured geometrically, two depth-free routes (both cameras within 0.5 % at
> ~4.3 m): band-share → 399.7 mm, plate-ratio → 393.2 mm. `grilleHalfW` 0.370
> → **0.396**, so `grilleSlatCrests` wants **±0.392, not the ±0.415 asked for
> above**. Rings: a uniform 0.93× on the group, 264 → 240-246 mm, i.e. **7-9 %**
> — the geometric ring/plate ratio is 0.80-0.82, not 0.842.
>
> Also established: `indicatorInnerX` must move 5 mm with it. Widening the
> grille takes clear:amber from 3.62 to 3.41 against a measured 3.65, so
> "the amber is correct, do not touch it" is true of the *ratio* and false of
> the *hardpoint*. Applied in `94fc4ba`.
>
> And the aperture is a **trapezoid** — the photograph's right edge runs 1192.0
> px at the top row to 1176.0 at the bottom, monotone, a 12° lean, ±17 mm of
> taper per side. Ours leans 0.3 px. Not built: the lamp's inner edge is the
> same line and `body.ts` butts onto it, so it needs a hardpoint field.

### 3. The headlamp lens is a featureless white card

§2.1 requires "two clear rectangular optical units side by side, separated by
a visible vertical divider". In `headlight.png` the lens is one undivided flat
white field from x 545 to 935 — no divider, no flutes, no bulb, no shelf.
`headlampDivider` exists but sits at x = ±0.692, which is the lens's *inboard*
edge (`headlampLens` runs to ±0.685): a divider that divides nothing.

The amber corner lens is **correct** — clear:amber 3.63 rendered against 3.85
measured. Do not touch it.

> ### ⚠ Corrected: "a divider that divides nothing" is a bounding-box artefact
>
> **The fourth on this project.** `headlampDivider` is a merge of *two*
> dividers, at x 0.535 and 0.688, and a bounding box drawn round both reports
> only ±0.692. The divider existed all along — it was in the wrong place and
> invisible, which is a different and smaller defect than the one written
> above.
>
> The lens defect itself was real and is closed (`94fc4ba`): row range 3.5 →
> 11.9 against the photograph's 12.1, and the reflector shelf's step +0.8 →
> +6.8 against +8.1. Two findings from doing it — the two chambers are **not
> the same size** (the inboard one is a third of the glass, 0.346 measured),
> and the flute orientation was about to be flipped until a high-pass
> |d/dx|:|d/dy| measurement showed the render already matches the owner's
> photograph at 1.10 against 1.18, despite reading as horizontal striations to
> the eye.

### 4. The grille slats are glossy where they should be matt black

Same box on both: render 10.8 % of pixels above V 100 and 7.2 % above V 150,
p90 116; photograph 1.8 % and 1.2 %, p90 73. Six times the specular — and the
**means are almost identical** (59.8 vs 54.1), so it is not exposure.

> ### The defect was real; the statistic was environment-dependent
>
> Read as an absolute the figure above is not reproducible. Read as the
> aperture against **the plate** — the one surface whose reflectance is known
> in both images — it is:
>
> | | aperture p50 / plate p50 |
> |---|---|
> | owner's photograph | 0.189 |
> | the committed build | 0.168 |
> | the tree this critique was written in | **0.298** |
> | after `94fc4ba` | 0.174 |
>
> So a chrome crest does put the aperture 58 % over the photograph, and the fix
> lands 8 % under — closer than the gap between the first two rows, which are
> the *same materials* in two different boots.
>
> The file now carries the caution that came out of it: **the grille's absolute
> level is not the grille's to set.** Three windows on identical materials read
> p50 38 / 54 / 37, and **17 of that came from the headlamps** — the new
> reflector shelf cuts the aperture's above-240 content, the bloom pass stops
> carrying it out over the nose, and the grille 200 mm away goes with it. Read
> the ratio, not the number.

### 5. The climate control is the wrong part; the centre vents are missing

See `8fed44a` — `REFERENCE-VEHICLE.md` §5.3 was wrong, not the reviewer. The
real head is a flat push-button **ELECTRONIC CLIMATE CONTROL** panel with no
rotary knob on it. Also absent from the stack entirely: the **centre louvre
vent block**, a tall three-bay grille with fine blades and two thumbwheels
that is the most prominent object on the real stack; the clock/trip-computer
panel beside it; and a radio with more than one lit bar.

### 6. The driver cannot see the fuel or coolant gauge

From the `dash` pose — a seated driver's eye at `[0.372, 1.27, −1.22]` —
`__AUDI.pick` returns **`wheelRim` as the frontmost hit at both small-dial
centres**. Raise the camera to y=1.40 and they appear, so they are drawn and
correct; the rim covers them.

`wheelRim` outer Ø 382 mm centred (0.372, 0.939, −0.737); the small dials land
at world y ≈ 1.020, x ≈ 0.507 and 0.237. At 81 mm above the wheel axis the
rim's half-span is √(191²−81²) = 173 mm, so its centreline crosses the cluster
plane at x = 0.199 and 0.545 — through both dials. Hardpoint.

### 7. The bilingual fuel legend is split across the whole cluster

`dials.ts` prints `UNLEADED FUEL ONLY` under the fuel gauge and `ESSENCE SANS
PLOMB` under the **coolant** gauge, 270 face-mm apart. On the real cluster
both stack under the fuel gauge with a third line `UNIQUEMENT`; the coolant
end carries only `°C`.

Same photograph: **the small dials are placed wrong.** The temp centre sits
0.450 of the speedo→tacho span outboard and 0.233 *below*; fuel 0.398 and
0.241. `dials.ts` has 0.507 and 0.149 for both — so each wants ~19 face-mm
inboard and ~11 lower, hanging below the main dials as the real ones do.

### 8. The door cards are blank panels

3120 triangles for four cards — 780 each. A flat field with one fold, one
lever, and a bar rendering at **V ≈ 250, pure white**, which no interior
material is. Missing: the grab-handle plinth that doubles as the armrest, the
round speaker grille, the map-pocket slot, the four-rocker window pod, the
release lever on its plinth, and the three-zone tonal split.

### 9. The rear valance is a pale glossy blister; the underbody flashes silver

`rearValance` reads median V 68 against the bumper face above it at 44 and the
tailgate paint at 51 — **55 % brighter than the part it should match** — and
it is glossy and bulges where the reference shows a flat panel. Below it,
`driveline`, `subframes` and `floorpan` catch a hard specular across the whole
car: a bright silver bar under the bumper in a dead-on rear view.

### 10-15, lower

Tailgate has no inner trim — **the exterior badge reads in mirror image from
inside the car** — and the load bay is unfurnished (`cargoBlind` is a
64-triangle flat plane where §5.5 asks for a cassette, a carpeted floor with a
recessed compartment, a scuff plate and two struts). Metallic flake resolves
at **0.9–1.8 mm of real flake** against an actual 10–50 µm, so it reads as
glitter. `platecam` characters render ~3.5× too light in the view whose whole
job is legibility. The B/C-pillar blackouts read as matte tape on the glass
rather than gloss sheet metal behind it. Two neighbouring panes of the same
glass are 55 V apart in one frame. The door handle levers are invisible at
money-shot distance, so the car looks like it has no door handles.

## Checked and **correct** — do not burn a round re-reporting these

Several of these were chased on a first impression and the measurement killed
them. That is the most useful half of this document.

- **Taillamp.** Inner amber 95 mm over inner red 85 = 1.12; measured 1.10 on a
  dead-on reference. Reverse window 0.57 of the amber band against 0.58–0.60.
  Panel division and crosshatch both match. It is good.
- **Head restraints.** 250 × 127 × 76 mm at 1.97:1 with a 0.73 × 0.58 opening
  — exactly the note in `seats.ts`. They look oversized in `interior.png` only
  because that pose is a 22 mm lens 600 mm away; from a proper pose the
  restraint is 0.53 of the seat back's width against a real 0.52.
- **Roof rails.** Stand-off ~54 mm against §6.6's 50–55. Two intermediate
  posts plus two swept ends = the four support points specified. Bright silver
  is correct per the OEM part description.
- **The flank.** At z = −2.041: beltline 984 mm against 958 (+26); DLO depth
  363 against 373 (−10); belt-to-trim band 359 against 356 (+3). An earlier
  impression that it was too deep was wrong.
- **Plan proportion.** 2.67 against 4895/1814 = 2.70.
- **Roofline downturn** starts at z ≈ −2860 against ≈ −2830. Within 30 mm; the
  apparent silhouette difference is the roof rail, which the BaT cars lack.
- **Tailgate badging.** Letterforms including the swashed *d* match exactly.
  "Audi" does belong. The full-width matt band below the glass is present.
- **Auto-Check panel** matches the photograph row for row.
- **Windscreen sticker, handbrake side, climate panel type** — in all three
  the *document* was wrong and the model right. Corrected in `8fed44a`.

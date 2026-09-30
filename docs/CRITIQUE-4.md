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
everything else.* Geometry, plus material — nothing on the outside of this car
should wear a weave.

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

### 3. The headlamp lens is a featureless white card

§2.1 requires "two clear rectangular optical units side by side, separated by
a visible vertical divider". In `headlight.png` the lens is one undivided flat
white field from x 545 to 935 — no divider, no flutes, no bulb, no shelf.
`headlampDivider` exists but sits at x = ±0.692, which is the lens's *inboard*
edge (`headlampLens` runs to ±0.685): a divider that divides nothing.

The amber corner lens is **correct** — clear:amber 3.63 rendered against 3.85
measured. Do not touch it.

### 4. The grille slats are glossy where they should be matt black

Same box on both: render 10.8 % of pixels above V 100 and 7.2 % above V 150,
p90 116; photograph 1.8 % and 1.2 %, p90 73. Six times the specular — and the
**means are almost identical** (59.8 vs 54.1), so it is not exposure.

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

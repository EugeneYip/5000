# Critique 5 — why the car does not read as photoreal

A narrower brief than CRITIQUE-4's, and deliberately so. The measured gates
are close — **dRGB 6.1–7.2 against an aim of 12, the bonnet's B−R +42 against
the photograph's +43** — and the car still does not read as photoreal. That
gap was the subject. Not dimensional accuracy; the look.

Written by a reviewer that owned nothing and changed nothing. `census()` at the
time: 288 meshes (+31 hidden), 1,052,982 triangles, 73 materials.

## The answer, in one measurement

Split the bonnet's image into variation **across** rows and **along** rows, at
matched scale, with the panel's own vertical gradient removed:

| | sd(row means) | sd(within row) | across/along |
|---|---|---|---|
| render, `photomatch` x 719–1050, y 328–402 | 45.31 | 21.75 | **2.08** |
| photo, `owner_1988` x 870–1316, y 543–643 | 10.21 | 36.88 | **0.28** |

**7.4× too anisotropic.** The render's bonnet is a stack of three or four long
smooth streaks running the full width of the panel; the photograph's is a
two-dimensional lace whose row means are almost flat. Band-split the along-row
part:

| along-row sd | <3 px | 3–8 | 8–25 | >25 px |
|---|---|---|---|---|
| render | **9.25** | 8.09 | 5.99 | **10.85** |
| photo | **3.57** | 5.40 | 7.08 | **33.20** |

2.6× too much grain, and **one third of the reflected structure**. `|grad|
p99/sd` is 1.05 against 0.39: what structure the render has is concentrated in
two or three hard streak boundaries instead of being distributed.

**A histogram gate cannot see this.** You can hit dRGB and B−R exactly while
the panel reads as brushed aluminium. And it is **specific to the near-dead-on
pose the gate is read from** — at `front3q` the same measurement gives 0.41
against `bat3_front3q`'s 0.60, because there the bonnet's normal does not
sweep vertically through an azimuthally smooth sky.

Attributed to lighting: the IBL proxy world does contain crowns, but a **512²
cube through `PMREMGenerator` returns them as soft bands** — the tan blob on
the roof in `roofrail.png` is the same canopy, 20× too blurred.
`clearcoatRoughness` is 0.035, so the clearcoat is not the cause.

## The unifying diagnosis

> **Every joint on this car is a smooth blend where the real one is a hard
> black line.**

Items 1, 2 and 3 are all that failure, and between them they account for most
of "unpolished details". None is about dimensional accuracy and none will move
dRGB or tone profile — which is exactly why they survived four critiques.

## Ranked

### 1. The face has no gaskets

Vertical cut through the lamp band, `photomatch` x 975–1050, rows 422→481
(148 mm of car): **226 → 248 → 227, monotone, not one dip.** Horizontal, y
440–460 over 280 mm: **241–249, not one dip.** The photograph, same cut, has
five hard edges:

| | render | photo |
|---|---|---|
| chrome bead above lens | 247 | **254** |
| groove, bead to lens | **247** | **79** |
| lens | 247 | 248 |
| internal reflector dip | none | 230 |
| groove, lens to lower bead | **247** | **94** |
| lower chrome bead | 227 | **255** |
| bumper below | 105 after a 14-row ramp | **70 in 4 rows** |

Two near-black grooves of ~11 and ~25 mm, **amplitude 169 and 154**, and zero
at both. The clear-to-amber joint dips −80 in the photograph and goes **+13 in
the render — the wrong sign.**

**The lens is not too bright, which corrects the obvious diagnosis.** lens p50
/ plate p50 is **1.079** against the photograph's **0.992** — 9 % hot, not 3×.
Nothing clips: V ≥ 250 is 0.24 % at `photomatch`, 0.00 % at `side`. What makes
it a white card is that nothing *separates* bead, lens and lower bead. And
`94fc4ba`'s row-range fix delivers **±4 on a 246 field — 1.6 %**, invisible at
any distance.

### 2. The car casts almost no occlusion shadow under itself

Ground beyond the silhouette against open road at the same row: render
**0.5–0.8** of open road, darkest station 0.34; `bat3_front3q.jpg` under-car
**V 2–6 against 170–184, i.e. 0.015–0.035**. **15–25× too light.** In the
reference the under-car void is the darkest thing in the frame and it is what
welds the car to the road. `env:contactShadow` exists but is nearly
transparent, and there is no close-contact darkening at the tyre.

Same family: **the roof rail casts no shadow on the roof** (roof declines
250→167 across it with no step at x 500/700/900) and **the badge casts no
shadow on the tailgate.** A 54 mm stand-off and a 3 mm raised letter both
throw a hard line in sunlight.

### 3. The bead is a blue filament 3× too wide, and the door cut dies at it

`side.png` x 700–800, rows 475–479: a 5 px band peaking at **(131, 145, 191),
chroma 60**. The registered reference's bead is **(212, 212, 213), chroma 0.8,
in 2 px.** Three times too wide and saturated blue where the reference is
neutral. Shutline depth at x 865:

| band | render | reference |
|---|---|---|
| paint | 125–149 | 100–192 |
| **rub strip** | **0–1** | **114 / 26 / 11** |
| lower body | 15–27 | 87–123 |

**The gap is not cut into the strip at all.** A continuous 4 m extrusion with
no panel joints is the clearest injection-moulded signal on the flank.

### 4–12, in order

**The hubcap is a polished mirror** (`alloy:polished`) where both references
show matte painted silver — the bloom fix will not change that. **The grille
slats carry one fifth of the photograph's modulation** (peak-to-trough 8.0/9.5
against 70.0/42.0): the pitch and level are right, the **bright top lip** is
missing. **The body side has no shoulder and no crease** — the normal sweeps
10.5° → 1.7° monotonically over 321 mm of door, so a reflection can only sweep
18°, and the panel renders 190 → 189 where the reference runs 242 → 177. **The
door handle is an outline with the door's paint inside it** — `pick` at its
dead centre returns `doorFR`, material `paint`. **The ground has no asphalt in
it** (mean |lap| 3.89–5.47 against 13.41–30.98) and carries a visible
repeating diamond lattice. **The badge renders inverted** — `chrome:0.050` at
near-mirror roughness makes letter faces dark and only the edges bright.
**Everything chrome is blue**, one cause: trim-angle reflections see only the
blue zenith. **Close-range facets** on the indicator surround and bonnet
leading edge. **The trees** read as camouflage stencils against a white sky —
ranked low only because they are not the car, but they cost more of the first
impression than that suggests.

> ### ⚠ Three of the items above were misattributed. Corrected in place.
>
> **The "indicator's chrome surround" is not a surround.** `pick` at
> `headlight` (330, 480) returns `headlampReflector` at d 2.689 against
> `frontWingL` at d 2.718 — **the reflector bowl is drawn in front of the
> wing.** The pebbled faceted pale L-strip at x 320-430 is the bowl poking
> through the body. Separately `lampSideL`, material **`paint`**, is 1 mm proud
> of `headlampAmberLens` and covers the outboard ~40 % of the indicator as a
> flat grey slab. Both are lamp-vs-body registration failures in
> `src/car/body/**`, not lamp material or tessellation.
>
> **The amber's woven cross-hatch is the shader, not the mesh.** `createLens`
> draws **two** prism runs (`audiPhaseA`, `audiPhaseB`), the second's pitch
> from `uLensBody.w`. A 2-D prism grid: invisible on the clear lens, orange
> canvas on the dyed amber, and still there after the mesh was refined from
> 14×10 to 20×24. `LensOptions` has no way to express a 1-D fluted lens, and
> both the US headlamp and the indicator want horizontal flutes only.
> `src/materials/lamp.ts`.
>
> The "folded paper" half of this item **is** closed by that refinement: the
> amber is the one lens panel whose outline wraps, the wrap is in *y*, and ten
> steps over 148 mm gave a 14.8 mm pitch — **two stations across a 28 mm
> corner radius, and a radius sampled twice is a chamfer.**
>
> **`platecam` (item 12) does not reproduce as a bloom defect.** Characters
> read mean 69.8 with bloom and 65.0 without — bloom is 5 of 70 levels, 7 %.
> They are too light, but not because of bloom. Hard triangulation facets
> across the A, 2 and M are visible there and are a separate, real finding.

## Checked and **not** a defect

- **The door shutlines on the paint are right** — positions within 25 mm,
  depths 125–149 against 100–192. Only the strip crossing is wrong.
- **The headlamp lens is not too bright** — see item 1.
- **The grille's level is close** — grille/plate 0.159 against 0.205. It is
  the relief that is missing, not the exposure.
- **The taillamp holds up at close range.** CRITIQUE-4 was right.
- **Plan proportion and silhouette** look right at every pose; the tyre
  sidewall lettering is legible at `wheel`.
- **An aggregate "crevice content" metric was abandoned before reporting** —
  6.25 % against the photograph's 7.12 % is too close to carry an argument,
  because the render's grille slats and shutlines fill the bucket. The
  localised cuts in item 1 are the measurement that holds.

## Three methods notes

- **`pick` at the station, not a bbox.** The "cladding band" below the strip
  turns out to be `doorFR` *paint* tumbling under at 29°, not a separate
  cladding part — which changes what any fix there should touch.
- **Segment on chroma or `V`, never luma**, on any reference photograph.
- **A `--dist` shoot is no longer safe from other streams.** One rebuilt
  `dist/` twice during this review, so a `--dist` run tells you about whatever
  was last built, not about HEAD. Check `ls -lT dist/assets/*.js` against your
  own build before trusting a frame.

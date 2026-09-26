# Hostile review — renders/critique, 2026-09-26

Method: every named view shot at 1800×1000 through `tools/shoot.mjs`, then read.
Geometry measured **in the built scene** (Playwright probe of `window.__AUDI.three`,
world→car-local bounding boxes per named node) rather than off pixels, because
pixel measurement of the side render produced two wrong conclusions before the
ground line was pinned down. Photographic measurement scaled on the licence
plate (305 × 152 mm) and on the 1986 100 Avant orthographic elevation
(8.972 mm/px per `REFERENCE-PHOTO.md`).

References used, all verified as **wagon**:

| Tag | What | Source |
|---|---|---|
| `OWNER` | the actual car, dead-on front, 1988 | `…/images/1.jpg` |
| `US-F` | 1985 Audi **5000S Wagon**, front 3/4 | commons `1985 Audi 5000S Wagon in Stone Grey Metallic, front right.jpg` |
| `US-R` | same car, rear 3/4 | commons `…, rear right.jpg` |
| `AV-R1` | Audi 100 C3 **Avant**, rear 3/4, roof rails | commons `Audi 100 Avant` (p_rear) |
| `AV-R2` | Audi 100 C3 **Avant**, rear 3/4 | commons `Audi C3 Avant rear 20071012.jpg` |
| `AV-R3` | Audi 100 CC **Avant**, rear 3/4 | commons `Audi 100 c3 avant h sst.jpg` |
| `BP` | 1986 100 Avant orthographic side | getoutlines blueprint |

---

## What is right — do not disturb

* **Side-elevation proportion.** An exact orthographic max-Y profile taken from
  the built geometry tracks `BP` to within ±2 % at almost every station
  (bonnet −3.8 %, cowl −1.5 %, header −2.0 %, D-pillar −1.8 %, tail −1.4 %).
  Roof skin peaks at **1415 mm = `BODY.height` exactly**. Overall length
  4917 mm vs spec 4895. Wheelbase, both tracks and all four wheel centres
  are on spec.
* **The "wider and lower than the photograph" suspicion is refuted.** Body max
  half-width is **896 mm** (spec 907 — if anything 1.2 % *narrow*), and the
  roof is on spec, not low. The rear roof drop that reads as a "fastback" in
  `side.png` is in `BP` too: the C3 Avant's D-pillar genuinely rakes hard.
* **Paint.** Sunlit vertical door face `#8d9099` against target `#92939b`,
  RGB distance 6.2. I checked where `sheet.py` samples — the patch lands on
  the front door's vertical face, so the pass is real, not an artefact.
* **Plate.** 306 × 152 mm, PA blue-on-white, four corner bolt holes, keystone
  separator, legible at `platecam`. Matches `OWNER`. Front plate on the bumper
  is correct (`OWNER`).
* **Wheel.** 12-slot bottlecap with a raised centre disc and rings, no exposed
  bolts — that is exactly what `AV-R2` and `AV-R3` show. Rim face 362 mm ≈ 14 in.
* **Amber indicator outboard on the headlamp; amber-over-red taillamp banding.**
  Both correct per `OWNER`, `US-R`, `AV-R1`.
* **Lower body: dark grey cladding with one bright strip along its top edge,**
  running the full flank. Correct per `US-F`. I nearly flagged the bright strip
  as wrong; it is not.
* Flush glazing reads correctly in all views.

---

## Ranked defects

### 1. Headlamp is a letterbox slit. `WRONG` — spec and build both

The spec's `500 × 139 mm` (3.60 : 1) is not what the car has.

| | width | height | aspect |
|---|---|---|---|
| `OWNER`, scaled on the plate | ~413 mm | ~165 mm | **2.40 : 1** |
| `US-F`, scaled on the (square) amber lens | ~405 mm | ~172 mm | **2.36 : 1** |
| `HP.front` nominal | 500 | 139 | 3.60 : 1 |
| **as built** (`headlamps` group) | 502 | **143** | **3.51 : 1** |

Method for `OWNER`: plate white face measured at 165 × 81 px (aspect 2.04 vs
true 2.006 ⇒ the camera is on the centreline, yaw ≈ 0, so aspect is directly
readable). Lamp aperture 1172→1383 px × 670→759 px = 211 × 89. For `US-F` the
amber lens is square in fact (`indicatorInnerX`→`lampOuterX` = 138 × 139) and
measures 75 × 95 px, giving cos(yaw) = 0.80; the lamp measures 221 × 117 px,
so 1.89 / 0.80 = 2.36.

Two independent photographs converge on **≈ 405 × 170 mm**. The lamp is about
**20–25 % too wide and 20 % too short**. This is the first thing the eye lands
on in `front3q` — the money shot — and it is why the face reads as a 1990s
concept rather than a Type 44.

Related and consistent: `hardpoints.ts` states the grille-to-single-lamp width
ratio measures **1.41 : 1** in the photograph. Measured again: grille aperture
half-width 191 px, single lamp 211 px ⇒ **1.81 : 1**. The derivation recorded
in the header comment is wrong, which is where the 700/500 split came from.

*Views:* `front`, `front3q`, `headlight`, `photomatch`. *Owner:* `src/car/lights`, and `src/car/hardpoints` for the numbers.

### 2. Tailgate glass is half its specified height; the rear reads as a hatchback. `WRONG`

| | top Y | bottom Y | height |
|---|---|---|---|
| `HP.glass` | 1.372 | 0.962 | **410 mm** |
| as built (`tailgateGlassOuter`) | 1.287 | 1.056 | **231 mm** |

The build misses its own package drawing by 56 %. The glass also spans 519 mm
in z for 231 mm of rise — 66° off vertical — so from directly behind you are
looking at the top of it rather than through it (`rear.png`). Every reference
(`US-R`, `AV-R1`, `AV-R2`, `AV-R3`) shows a large trapezoidal pane filling the
whole upper tailgate, roughly as tall as the painted panel beneath it.

*Views:* `rear`, `rear3q`, `roofrail`. *Owner:* `src/car/glass`, with `src/car/body` for the tailgate aperture.

### 3. Rear licence plate is in the bumper. On this car it is in the tailgate. `WRONG`

`plateRear` sits at y 0.442–0.594; `taillampOuter` at y 0.686–0.984 — the plate
is 92 mm *below* the bottom of the lamps, in the bumper face.

`US-R` (the same model, same market) puts the plate **recessed into the tailgate,
between the two lamps, vertically centred on the lamp band**. `AV-R1` and
`AV-R2` agree.

Worse, the model has nothing where the real car's most distinctive rear feature
is. On `US-R` the entire span between the lamps is a **black, horizontally
ribbed panel** — it reads almost as a second grille — and the plate is bolted
into the middle of it. The model has body-coloured painted metal there with
three small badges floating on it. Fixing the plate height without adding the
ribbed centre panel will not fix the rear.

*Views:* `rear`, `rear3q`, `badge`. *Owner:* `src/car/trim` (plate + panel), `src/car/hardpoints` (`HP.rear.plateCenter`).

### 4. Roof rails: wrong section, wrong mounting, 120 mm too far inboard. `WRONG`

| | build | `HP.roof` | references |
|---|---|---|---|
| rail top Y | 1.454 | 1.474 | — |
| rail base Y | **1.336** | 1.408 | — |
| section depth | **118 mm** | 66 mm | shallow blade |
| inboard of roof edge | **120 mm** (x 0.654 vs roof half-width 0.774) | — | ~30 mm (`US-F`, `AV-R1`, `OWNER`) |

In `OWNER` the rails sit at photo x 785–832 and 1095–1140 with the roof spanning
800–1140 — i.e. right on the roof edges. `roofrail.png` shows them instead
standing on corrugated, bellows-like posts well inboard, reading as an
aftermarket luggage rack. The rails are also `0x33363a` "anodised dark" where
`US-F` and `US-R` show **bright polished aluminium** (`OWNER` is backlit and
can't settle the colour — call the colour *low confidence*, the position and
section *high*).

*Views:* `roofrail`, `front3q`, `rear3q`, `photomatch`. *Owner:* `src/car/trim`, `src/car/hardpoints` (`HP.roof`).

### 5. `photomatch` no longer matches the photograph's pose. `WRONG` — and it disables the only acceptance test

`OWNER` is **dead-on front**: plate centre x = 982.5, four-rings centre
x = 979 (two centreline features at different depths projecting to the same
column ⇒ camera laterally on the centreline), plate aspect 2.04 vs true 2.006
⇒ yaw ≈ 0. Camera ≈ 3.7 m out at roughly a 50 mm lens (plate scale
1.85 mm/px).

The render is a three-quarter from the car's right, lower and further back.
`REFERENCE-PHOTO.md` says a render is only accepted as colour-correct "posed
and lit like the photograph (`--views=photomatch`)". That pose is not being
produced, so no stance, overhang or front-face comparison is possible from
this view — which is exactly how "the render looks wider and lower" survives
as an impression without ever being testable. Fix the pose before trusting
anything from this frame.

*Owner:* `src/scene` (`CameraRig.ts`).

---

### 6. Broken geometry at the cowl / A-pillar / wiper junction. `WRONG`

`interior.png` shows a torn V-shaped gap between the windscreen base and the
bonnet, loose polygon shards and a detached wiper fragment. It is the worst
mesh break in the set and it sits in the middle of the most-photographed part
of the car. *Owner:* `src/car/body` / `src/car/glass` boundary.

### 7. Taillamp has amber across its whole upper band; no reverse lamp. `WRONG`

Built: `taillampOuterAmber` and `taillampInnerAmber` both span y 0.855–0.969
across the full lamp width, and there are indicator cells in *both* the inner
and outer blocks (`taillampInnerIndicatorR` x 0.255–0.362,
`taillampOuterIndicatorR` x 0.504–0.812). All three rear references show one
amber indicator at the **outboard** end only, with a **clear/white reverse
rectangle inset into the upper band at the inboard end**, red across the
bottom. `HP.rear.lampSegments: 4` already describes this; the build didn't
follow it. *Views:* `rear`, `rear3q`, `badge`. *Owner:* `src/car/lights`.

### 8. Rear wiper cannot reach the glass. `WRONG`

`wiperRear` y 0.906–1.007; `tailgateGlassOuter` bottom y 1.056. The blade
parks 49 mm clear of the glass, lying on painted metal — in `rear.png` it
reads as an arm floating across the body above the lamps. (Mount height varies
across the references — `US-R` and `AV-R3` park it along the *top* edge under
the spoiler, `AV-R1` and `AV-R2` along the bottom — so pick either, but it has
to be on the glass.) *Owner:* `src/car/trim`.

### 9. Bumper stands ~210 mm proud of the lamp face; should be ~130. `WRONG` (medium confidence)

Built: `frontBumper` front face z = **+1.084** (on spec); `headlampLens`
z = +0.872; `grilleSurround` z = +0.879. Standoff **212 mm**.

`BP` (Euro) puts the frontmost ink at x = 540 ⇒ z = +1.023 and the lamp's
side-view leading edge at x ≈ 531 ⇒ z ≈ +0.942, i.e. **~81 mm** of standoff.
The US 5 mph bumper adds 51 mm to the bumper only, giving **~132 mm**. So the
bumper depth itself is right and the **lamp/grille plane is set ~70–80 mm too
far back**. That is what makes `headlight.png` read as a lamp at the bottom of
a tunnel under a protruding brow.

Confidence is medium because the blueprint is 542 px wide (18 mm/px at the
nose) and the lamp's side-view edge is not strictly the front-face plane.
*Owner:* `src/car/hardpoints` (`lampZ`, `grilleZ`), `src/car/body`.

### 10. D-pillar is black. It is body colour on every reference. `WRONG`

`AV-R1`, `AV-R2`, `AV-R3`, `US-F` all show a wide, **painted** D-pillar with
the blacked-out pillars stopping at the C-pillar. In `side.png` and
`rear3q.png` the whole region aft of the rear door is a glossy black band,
which shortens the greenhouse visually and is a large part of why the side
view reads "wrong" even though the silhouette measures right.
*Owner:* `src/car/trim` / `src/materials`.

### 11. Grille slats are about twice as thick as they should be. `WRONG`

Column scan through the grille: render `###...###...###....##....##....##` —
bright:dark ≈ 50:50, six slats. `OWNER` at x = 1080–1150:
`####....###.......###.......###........##` — bright:dark ≈ 30:70, seven to
eight slats. Consequence: the render's grille reads as a **bright silver
louvre panel**; the real one reads as a **black grille with thin bright slat
edges**. Slat *count* is close enough (`HP` says 7); it's the section depth
that's wrong. *Views:* `front`, `headlight`. *Owner:* `src/car/trim`.

### 12. Four rings are oversized relative to the grille. `WRONG`

Built `fourRingsFront` y 0.695–0.788 = 93 mm inside a `grilleRecess` of
141 mm ⇒ rings occupy **0.66** of the grille height. In `OWNER` the rings
measure 41.6 px inside a 78 px grille aperture ⇒ **0.53**. Scaled on the plate
the rings are ~80 mm, against `HP.front.ringDiameter` 0.093. About **16 %
too large**. *Owner:* `src/car/trim`, `HP.front.ringDiameter`.

### 13. Tyres. `MISSING` tread and sidewall; `WRONG` diameter by 4 %

`wheelFL_tyre` y −0.012 → +0.627 ⇒ OD **639 mm** against `tyreRadius()`
614.6 mm, and the tyre therefore **clips 12 mm into the ground plane**.
(`BP` confirms 610 mm: rear tyre circle y 100→168 at 8.972 mm/px.)
`wheel.png` shows a completely smooth rubber torus — no tread blocks, no
sidewall lettering, no bead ring, no shoulder radius, in a close-up view whose
entire job is to show those. *Owner:* `src/car/wheels`.

### 14. Four of fifteen review views are unusable. `WRONG` (tooling)

* `top` — camera far too close; frames the windscreen, not the plan.
* `dash` — shot from *outside* the car through the screen, and the cabin has
  no fill light, so the frame is essentially black.
* `interior` — also an exterior shot, of the A-pillar/mirror.
* `taillight` — the lamp is half out of frame at the right edge; ~55 % of the
  frame is empty road.

A review set that cannot show the instrument panel cannot catch anything wrong
with it. *Owner:* `src/scene/CameraRig.ts`.

### 15. Performance is 4× over budget. `WRONG` (budget)

`shoot.mjs` reports **2,284,938 triangles, 931 draw calls, 13.9 fps** at
1800×1000. `docs/WORKSTREAM.md` budget: ≤1.2 M tris, ≤220 draws, 60 fps at
1080p. 1.9× triangles, 4.2× draw calls, 23 % of target frame rate.

Probable large contributor: `headlampShaft` has a bounding box of
x ±11.96 m, y −9.25 → +4.65 m, z +0.88 → +17.94 m — a 24 × 14 × 17 m volume
attached to the car. That single node sets the bounds of the whole
`Audi5000SWagon` root, which will defeat frustum culling and blow up
shadow-map fitting for every other node.

### 16. Untransformed geometry buried in the ground. `WRONG` (latent)

`fritDots` and `fritDotsTailgate` both have bounds
x −0.450 → +0.500, y **−0.487 → +0.487**, z 0.000 → 0.000 — a flat sheet at the
front-axle plane, half of it below ground, never placed on the glass it belongs
to. It propagates a y-min of −0.487 up through `glass`, `body`,
`tailgateGlazing` and `tailgatePivot`. Not visible (it is inside/below the
body) but it is dead geometry in the draw call count and it means the tailgate
frit is not where it should be. *Owner:* `src/car/glass`.

### 17. Rear badging is the Euro car's, not the US car's. `WRONG`

Built: `fourRingsRear` + `badgeAudi` + `badgeModel` — three items including the
four rings. `US-R` shows the US-market 5000 S Wagon tailgate carrying **one
"Audi 5000 S" script above the left lamp and one "FuelInjection" script above
the right lamp, and no rings at all**. Rings on the tailgate are a Euro
100/200 feature (`AV-R1`, `AV-R2`). Both scripts sit *above* the lamps, hard
outboard — not clustered near the centreline as `HP.rear.badge*Center` places
them (x −0.166 … +0.181).

### 18. `MISSING` — smaller absences, in descending order of visibility

* **Black tailgate spoiler / air deflector** across the top of the tailgate
  glass — a large moulded black wing, unmistakable in `US-R` and `AV-R3`.
* **Mud flaps** with the rings, behind all four arches — present on both
  `US-F` and `US-R`. On a wagon they are a strong silhouette cue at the rear.
* **Wheel-arch lip.** `wheel.png` shows the tyre disappearing into an
  undefined black void; there is no arch edge, radius or highlight.
* **Tyre sidewall lettering.**

### 19. Body is 22 mm narrow. `MERELY UNCONVINCING`

Max half-width 896 mm vs `BODY.width/2` = 907. 1.2 % — below the threshold at
which anyone would notice, listed only so it isn't rediscovered as a defect.

### 20. Ambient fill. `MERELY UNCONVINCING` (low confidence)

Shadowed vertical panels fall to `#303138`-ish in `front3q` while the sunlit
ones hit target. In `OWNER` — the same golden-hour, open-boulevard condition —
the shaded fender faces still sit near `#92939b`, because an open sky fills
them. The scene's sky dome appears to contribute very little. I cannot prove
this without matching the exposure, so: low confidence, and it does not
invalidate the paint pass in §"What is right".

---

## Claims I checked and am dropping

* *"The roofline is wrong / the car is a fastback."* No. The built profile
  matches `BP` within 2 %.
* *"The car is too low."* No. Roof skin 1415 mm = spec; rails 1454 vs `BP`'s
  1462–1480 over-rails ink.
* *"The car is too wide."* No — it is 1.2 % narrow.
* *"The side rub strip should not be bright."* Wrong — `US-F` clearly shows a
  bright strip along the top of the dark lower cladding.
* *"The bumper's upper bright strip is wrong."* Wrong — it is there in both
  `OWNER` and `US-F`.
* *"The bottlecap should show four bolts."* Wrong — the centre disc covers
  them on every reference. The model is right.
* *"The windscreen is too raked."* No: built cowl→header gives ≈64° from
  vertical, `BP` gives ≈66°. The impression comes from the camera, not the
  glass.

# Hostile review, round two — `renders/critique2`, 2026-09-26

Method: all fifteen views shot at 1800×1000 through `tools/shoot.mjs` (page clean,
exit 0), contact-sheeted and compared, then every PNG opened and read.

Geometry measured **in the built scene** through the Playwright probe, using
`mesh.geometry.boundingBox` transformed by `matrixWorld` — never
`Box3.setFromObject`. 331 meshes, 765,148 triangles counted once.
Performance figures taken as a **delta with the car root hidden**, then divided by
the documented 2.925× three-pass multiplier.

Photometric claims are made against the owner's photograph white-balanced with the
gains in `REFERENCE-PHOTO.md`, or against the calibrated blueprint
(8.972 mm/px, front axle x=426.0, ground y=168.0), or by re-rendering the same
view under a different environment preset. Every number below is reproducible.

References used this round, all confirmed **wagon**:

| Tag | What | Where |
|---|---|---|
| `OWNER` | the actual car, dead-on front, 1988 | `…/images/1.jpg` |
| `BAT-R` | 1988 Avant, **dead-on rear**, 2048×1365 | `scratchpad/bat_rear.jpg` |
| `BAT-T` | 1988 Avant, taillamp + plate recess close-up | `scratchpad/img2/bat_taillamp.jpg` |
| `GCFS-85` | **1985 US 5000 S Wagon, rear 3/4** — the closest match to our car | `scratchpad/img/gc85_2.jpeg` |
| `BP` | 1986 100 Avant orthographic side | `scratchpad/audi-100-avant-1986.gif` |

---

## Verdict

**No. It would not pass as a photograph of the real car**, and the reasons are
almost entirely *photographic* now rather than geometric. The shape is right; the
light is not. A C3 Avant owner would get to "that's a render" in about a second,
from three things: the car's shaded panels are two stops too dark, the front bumper
glows pale where it should be charcoal, and the tailgate is missing its big black
spoiler.

The geometry has genuinely improved. Nine of the round-one items I re-measured are
now correct to within measurement error, and two of my own first impressions this
round were killed by the measurement (see **Claims I am dropping**).

---

## Top five

### 1. The ambient/sky fill is roughly two stops short — shaded panels crush to near-black. `WRONG`

This was round one's §20, marked low confidence. It is now measured, and it is the
single largest reason the set does not read as a photograph.

The photograph's most diagnostic surface is the one `REFERENCE-PHOTO.md` derived the
paint from: a **vertical** fender face, which sees the street and the sky but not the
sun. White-balanced, at photo (1390, 610) it sits at **`#91929b` — mean 148,
saturation 0.062.** Six adjacent patches agree to within ΔRGB 2.

The same surface orientation in the render:

| Surface | `front3q` | |
|---|---|---|
| front wing, vertical face | `#2e3036` | 48 |
| front door, vertical face | `#343942` | 57 |
| rear door, vertical face | `#3d444f` | 67 |
| rear quarter, vertical face | `#49525e` | 73 |
| **median of all 1483 mid-neutral (sat<0.30) patches on the flank** | | **63.8** |
| RH front wing face in `photomatch` | `#595054` | 85 |

**148 against 48–85.** That measurement stands, and the fix that followed it was
right: vertical faces now land within ΔRGB 10 of the photograph.

> **The histogram sentence that used to follow it did not stand, and it did real
> damage.** It read: *"on the shaded side of `photomatch`, 17.7 % of the car's
> pixels fall below level 40, against 3.2 % in the photograph; the medians are
> 87 and 131."* The pair is swapped. Both figures were taken through
> `sheet.py`'s row-median car mask, and applied to the *photograph* that mask
> selects 83 % of the frame — for which the photograph measures median 87 with
> 17.5 % below 40, which is precisely what the sentence attributes to the
> render. 131 and 3.2 % were the render's own numbers.
>
> Measured through a traced polygon, the photograph's car is **median 95 with
> 11.5 % of it below 40**. So the target the project then spent three rounds
> lifting towards was the number it started from. The flanks genuinely were two
> stops dark and lifting them was correct; carrying on until the *whole car*
> reached 131 was not, and it flattened the frame. See commit 18e8bfc.

Cause is visible in the light rig: `sun i=6.0`, `hemi i=0.12`, `bounce i=0.42`,
`rim i=0.28` — a **50 : 1** key-to-sky ratio. Open-sky golden hour on a boulevard is
nearer 5 : 1 to 10 : 1 on a vertical panel. The result is cinema contrast, not
daylight contrast: blown highlights and crushed blacks with the midtones missing.

Knock-on effects, all of which are this bug and not separate defects:
`side.png` shows a **black** car and is useless as a proportion check;
`interior.png` and `dash.png` are dark holes; the lower flank, the cladding and the
wheel arches lose all separation.

*Views:* every one, worst in `side`, `dash`, `interior`, `front3q`.
*Owner:* `src/scene/env/presets.ts` (`goldenhour` sun/hemi/envIntensity),
`src/scene/Environment.ts`.

---

### 2. The pale front bumper is real, it is wrong, and it is bloom — not golden hour. `WRONG`

You suspected this. It is not correct behaviour on a convex grey moulding. Three
independent lines of evidence.

**(a) The material is innocent.** `TRIM_COLORS.bumperPlastic` is `0x2b2d31`, and
`frontBumper`, `rearBumper`, `frontValance`, `rubStrip`, `archLiners`, `mirrorShells`
and `floorpan` all share one instance of it. Re-shooting the identical `front3q`
frame under other presets, sampling the same pixels:

| preset | bumper, sunlit outboard | plate white face | ratio |
|---|---|---|---|
| **goldenhour** | `#a18f82` (145) | `#ebe4dc` (228) | **0.64** |
| overcast | `#121316` (19) | `#aeb1b2` (177) | 0.11 |
| noon | `#1e1f21` (31) | `#cdcbc7` (203) | 0.15 |
| `OWNER`, white-balanced | `#49464b` (73) | `#f9e9db` (234) | **0.31** |

A ~0.025-albedo polypropylene beside a ~0.85-albedo plate, nearly coplanar and
identically lit, cannot return 0.64 of the plate's signal. It returns 0.11–0.15
under every other light in this project, and 0.31 in the photograph.

**(b) The spatial profile is a bloom halo, not shading.** Columns through the front
face (`front.png`, x = 700), against the same column in the photograph (x = 1250,
white-balanced):

| | bright strip | 4–8 px below | 30 px | 60 px | 100 px |
|---|---|---|---|---|---|
| `OWNER` | 227 | **67** | 75 | 76 | 65 |
| render | 245 | **183** | 129 | 92 | 71 |

In the photograph the bumper is dark **immediately** under the bright strip. In the
render it takes ~100 px (≈250 mm of car) to fall to the same value. That decay is a
multi-mip bloom skirt.

**(c) The source of the blown pixels.** `frontRubStrip` is `chrome:0.180` running the
full depth of the bumper's top edge at y 0.606–0.662; with the sun at 11.5°
elevation it blows to 245–249 along its whole length. The `goldenhour` grade then
doubles the base bloom and drops the threshold below unity:

| | BASE_GRADE | goldenhour |
|---|---|---|
| exposure | 1.0 | 1.12 |
| bloomStrength | 0.22 | **0.44** |
| bloomThreshold | 1.15 | **0.82** |
| bloomRadius | 0.5 | 0.62 |

The rear bumper, same material, same chrome strip, stays correctly dark
(`#332d2e`) because in `front3q`/`rear3q` it never catches the sun square.

**Corollary — this also explains "the headlamps look switched on."** They are not.
All four lamp `SpotLight`/`PointLight` objects report `intensity = 0`, and measured
aperture brightness is *lower* than the photograph's (render mean 177–196, photo
231). The "beam" spilling down-left across the bumper in `photomatch` and `front3q`
is the same blown chrome strip bleeding.

*Views:* `front3q`, `front`, `headlight`, `photomatch`, `side`.
*Owner:* `src/scene/env/presets.ts` (goldenhour grade), `src/scene/Post.ts`,
`src/car/trim/bumpers.ts` (`frontRubStrip` roughness).

---

### 3. The black tailgate spoiler is missing, and so is the black band under the backlight. `MISSING`

`GCFS-85` — a US 5000 S Wagon, the same model as this car — carries a **large matt-
black moulded wing across the entire top of the tailgate**, standing well proud of
the roof line with a raised lip. It is the most recognisable single feature of the
wagon's rear three-quarter. `BAT-R` and `BAT-T` show it too; `[AW-87]` lists "Rear
spoiler" as standard wagon equipment.

There is **no mesh of any kind** in that position — I searched the whole 331-mesh
inventory for `spoiler|deflect|wing`. The render's roof simply ends and the glass
begins.

Separately, `BAT-R`/`BAT-T` show a **full-width matt-black trim band between the
backlight's lower edge and the badge line** (it carries the debossed model script on
turbo cars). `REFERENCE-VEHICLE.md` §6.5 says explicitly that these are two
different parts and the wagon has both. The render has painted metal there.

Also absent and listed as standard in `[AW-87]`: the **centre high-mounted stop
lamp**, clearly visible in `BAT-R` as a black bar inside the top centre of the
backlight. And **mud flaps**, visible behind the rear wheel in `GCFS-85`.

*Views:* `rear`, `rear3q`, `side`, `top`. *Owner:* `src/car/trim` (+ `src/car/lights`
for the CHMSL), and a new hardpoint for the spoiler.

---

### 4. The lamp lenses moiré. `WRONG` — the loudest "computer graphics" tell in the set

`taillight.png` and `badge.png` are dominated by **swirling concentric interference
rings and a dot-matrix crosshatch** across the amber and the red. It is classic
procedural-texture aliasing (a high-frequency prism pattern evaluated without
mip/anisotropic filtering, or generated per-pixel in the shader). It survives the
16-sample accumulation because accumulation jitters the projection, not the texture
lookup.

Real lens fluting — see `BAT-T` at 2048 px — reads as crisp parallel prisms with
directional glints and a regular fine grid. Nothing swirls.

The same artefact appears at lower amplitude in the full-car `rear.png`, so it is not
confined to close-ups. The headlamp reflector has a related problem: in
`headlight.png` it renders as a field of white glitter speckle rather than a
paraboloid, which is a large part of why that lamp reads as switched on.

A secondary version of this: a fine **white speckle** (grain/dust) sits on every dark
trim surface in `badge.png` and `taillight.png` and reads as dirt on a sensor.

*Views:* `taillight`, `badge`, `headlight`, `rear`. *Owner:* `src/materials/lamp.ts`,
`src/car/lights.ts`.

---

### 5. The roof rails sit 54–72 mm too low, and the roofline is flat by ~34 mm. `WRONG`

Three independent measurements agree.

**The rail against its own hardpoint.** Raycasting straight down onto the built
geometry at the rail's x station:

| probe | roof skin | rail top |
|---|---|---|
| x 0.673, z −2.0 | 1373 | **1408** |
| x 0.673, z −2.6 | 1362 | 1407 |

`HP.roof.railTopY` is **1.474**. The build is **66 mm short of its own package
drawing** at mid-span. Stand-off above the local roof skin is **35 mm**;
`REFERENCE-VEHICLE.md` §6.6 derives **50–55 mm** twice, independently.

**The rail against the blueprint.** `BP`'s topmost ink over the rails is
**1462–1480 mm** from z −1.6 to −2.5. An exact silhouette scan of the render at the
same stations returns a flat **1447**, i.e. **28–34 mm low** all the way along. The
rail's crown (1408) is actually **7 mm *below* the roof's centre crown (1415)** — so
in a true orthographic side elevation the rails would not break the roofline at all,
where on the real car they add ~50–65 mm to it.

**The roofline aft of the rails.** Same silhouette scan, against `BP`:

| z (mm) | render | `BP` | Δ |
|---|---|---|---|
| −1334 | 1406 | 1453 | **−47** |
| −2083…−2457 | 1447 | 1480 | **−34** |
| −2831 | 1434 | 1373 | **+61** |
| −2956 | 1422 | 1382 | **+40** |
| −3081 | 1372 | 1337 | **+35** |
| −3206 | 1281 | 1283 | −2 |

So the roof doesn't crown high enough over the B/C-pillars and then carries on flat
about 100 mm too far aft before dropping. Net effect: a slightly squashed greenhouse
and a slightly too-square tail — which is, I suspect, the real source of the
"something is off about the profile" feeling that produced three wrong proportion
calls in round one.

*Views:* `side`, `roofrail`, `rear3q`, `top`. *Owner:* `src/car/trim/roofrails.ts`;
`src/car/body/surface.ts` for the roofline aft of `HP.roof.dPillarZ`.

---

## The rest, in descending order of damage

### 6. `tailgateRibPanel` is at the front axle, not the tailgate. `WRONG` (latent geometry bug)

```
tailgateRibPanel  blackTrim  x[-0.182, 0.182]  y[0.660, 0.932]  z[+0.022, +0.031]
tailgateRibs      blackTrim  x[-0.173, 0.173]  y[0.666, 0.926]  z[-3.779, -3.758]
```

The ribs are at the tail; **the panel they are supposed to sit on is at z ≈ +0.026 —
the front-axle plane, buried inside the engine bay.** This is the exact failure mode
of round one's §16 (`fritDots` stranded at the same plane), in the same stream. It is
252 triangles of dead geometry and it leaves the rear plate recess with no backing.

Two further points on that recess, from `GCFS-85` (which has no plate fitted, so the
panel is fully visible) and `BAT-T`:

* The ribs in the render run **vertically**. `GCFS-85` shows the panel finely
  **horizontally** ribbed. *(Note `BAT-T`, the 1988 car, shows a smooth black recess
  with mounting rails instead — the two references disagree, so treat the ribbing as
  medium confidence; the misplaced panel is not in doubt.)*
* `HP.rear.lampInnerX` = 0.165 gives a 330 mm gap between the lamps and the plate is
  305 mm, so only 12 mm of panel shows each side. Measured off `BAT-R` dead-on
  (lamp inner edges at px 924 and 1180, body half-width 590 px at that height), the
  real gap is ~21.7 % of half-width, i.e. **≈ 369 mm**, leaving ~32 mm each side.
  Low-to-medium confidence; the calibration is indirect.

*Views:* `rear`, `badge`. *Owner:* `src/car/trim/tailgate.ts`.

### 7. The side rubbing strip is about half its proper height. `WRONG`

| | dark band | bright line |
|---|---|---|
| as built (`rubStrip` + `rubStripLine`) | y 530 → 587 = **57 mm** | 23 mm, 40 % of the strip |
| `BP`, column scan at z −1.0 / −1.6 / −2.2 | y 538 → 637 = **99 mm** | 18 mm at 601–619, 18 % |
| `GCFS-85`, front and rear door columns | ≈ **97 mm** | thin |

So the moulding is ~42 % too shallow and its bright line is proportionally twice as
wide as it should be. On the flank — the thing you look at in `side` and `front3q` —
this reads as a pinstripe where the car should have a substantial protective band.
`HP.side.rubStripHeight` (0.054) is the number to fix, not the geometry.

*Views:* `side`, `front3q`, `rear3q`. *Owner:* `src/car/trim/sides.ts`,
`src/car/hardpoints.ts`.

### 8. The environment reads as computer graphics, and it is in every frame

Not the car, but it is what the eye hits first:

* **Lollipop trees** — identical extruded-cylinder trunks with blobby crowns, in a
  dead-straight row, repeated ~20 times.
* **The road is one tiling stipple pattern** with a visible repeat, flat to the
  horizon, with a hard straight edge where the asphalt meets the dirt.
* **The sky is a bare gradient** with no cloud, no haze structure, no sun disc.
* The cast shadow (I checked at full resolution — it is a genuine car-shaped shadow,
  not the rectangle it looks like in the contact sheet) is **tonally flat**: the
  asphalt texture inside it is identical to outside, there is no skylight gradient,
  and no brighter band under the middle of the car where sky reaches between the
  wheels.

The paint is a mirror and it has nothing worth reflecting. Half of item 1's
"looks CG" impression is actually this.

*Owner:* `src/scene/env/*`.

### 9. Two review views are still unusable, and one has regressed. `WRONG` (tooling)

* **`dash`** — the camera is now inside the cabin (progress), but it is aimed at the
  top of the steering wheel and the windscreen. **The instrument cluster is not in
  frame at all**, and the cabin has no fill, so the lower two-thirds sits at level
  20–40. A review set that cannot show the instrument panel cannot catch anything
  wrong with it. Round one's §14 is only half fixed.
* **`badge`** — shows the inner taillamp and the licence plate. The badges sit at
  y 0.955–0.989, just *above* the top of frame. The only view whose job is the
  badging does not contain the badging.
* `top`, `taillight` and `interior` are all genuinely fixed.

*Owner:* `src/scene/CameraRig.ts`.

### 10. `sheet.py`'s colour gate is measuring the background. `WRONG` (tooling — and it invalidates the acceptance test)

`python3 tools/sheet.py --compare renders/critique2/photomatch.png` reports

```
paint distance from photograph target: 3.9 (aim < 18)   (x 0.10 y 0.32, sat 0.072)
```

That patch is pixels **(180,320)–(234,370)** — empty distant road haze at the far
left of the frame, **250 px clear of the car**. I drew it on the render to be sure.
`REFERENCE-PHOTO.md` says a render is only accepted as colour-correct when the
fender face lands within ΔE 3 of `#92939b` in the `photomatch` pose. That gate is
currently passing on background and enforcing nothing — which is precisely why
item 1 above has survived two rounds.

The search window (`fy` 0.28–0.72, `fx` 0.10–0.92, sat < 0.13, 90 < hi < 200) admits
any near-neutral mid-value region in most of the frame; the haze wins because the
car's shaded panels are too dark to qualify and its lit ones are too saturated.

Related, smaller: the compare sheet's footer still prints
`grille-to-lamp width ratio 1.41:1`, the figure `hardpoints.ts` now documents at
length as wrong (1.81 : 1).

*Owner:* `tools/sheet.py`.

### 11. Draw calls are ~40 % over budget; frame rate is under. `WRONG` (budget)

Measured properly, with the car root hidden and the delta taken:

| | with car | scene only | car delta | ÷2.925 | budget |
|---|---|---|---|---|---|
| triangles | 2,319,895 | 81,580 | 2,238,315 | **765,148** ✅ | ≤1.2 M |
| draw calls | 929 | 32 | 897 | **307** ❌ | ≤220 |
| fps @1800×1000 | 32.3 | 55.9 | — | — | 60 @1080p |

Triangles are comfortably inside budget and `car.triangleCount()` independently
returns 765,148, confirming the 2.925× multiplier exactly. **Draw calls are not** —
307 against 220, 40 % over, from 331 meshes of which many are tiny (`lampParkBrake`
12 tris, `fenderBadgeGroundLeft` 24, `antennaMast` 40, four separate `bumpStop`
meshes). The shoot harness reported 48.3 fps on its own run and the probe 32.3 on
another; either way it is 54–80 % of target at *fewer* pixels than 1080p.

### 12. "FuelInjection". `WRONG`

The right-hand tailgate script renders as a single camel-case word in a modern
geometric sans. No period Audi script was ever set that way; `GCFS-85` shows a small
two-word script. The left-hand `Audi 5000 S` is in the same modern sans where the
real badge is a distinctive squared-off face with wide letter spacing.

Build positions are `badgeModel` centred at x +0.51 and `badgeFuelInjection` at
−0.51, against `HP.rear.badgeAudiCenter/badgeModelCenter` at ±0.42 — 90 mm outboard
of the hardpoint. The left/right *order* is correct (model script viewer-left),
and the absence of tailgate rings is correct for a 5000 S per `GCFS-85`.

*Views:* `rear`, `taillight`. *Owner:* `src/car/trim/badges.ts`, `glyphs.ts`.

### 13. The wheel arch has no lip, and the arch liner is the wrong value. `MISSING` / `WRONG`

`wheel.png` shows the tyre meeting a **flat, featureless taupe plane**. There is no
arch lip, no edge radius catching light, no inner-wing form. `archLiners` wears
`bumperPlastic` (`0x2b2d31`) but renders as a mid-brown sheet under the golden sun —
same lift as item 2.

I raycast eleven pixels through the region that looks like torn geometry at the top
left of that frame: every one hits real surfaces (`frontWingL`, `bodyInner`,
`archLiners`, `innerSides`, `rockerL`). **It is not a mesh break.** It reads like one
because the inner panels are flat, hard-edged and un-radiused, and one of them is lit
only by sky so it returns `#6284b0` — brighter than the sky itself — beside a
near-black neighbour. Fix the fill (item 1) and radius the edges and it stops
looking broken.

### 14. `frontValance` and `rearValance` disagree about what they are. `WRONG` (one of them)

`frontValance` is `bumperPlastic`; `rearValance` is `paint`. `REFERENCE-VEHICLE.md`
§6.3 is explicit — *"the lower valance below the bumper is BODY-COLOURED, not dark"* —
reconciling `[AW-87]`'s "integrated body-colored bumper aprons" with the dark bumper
moulding. `BAT-R` confirms it at the rear: dark bumper, red valance below. So the
**front** one is wrong, and because it currently matches the bumper the whole lower
nose reads as one undifferentiated mass.

### 15. The underbody is legible and bright in `side` and `rear`. `MERELY UNCONVINCING`

`floorpan` (y 0.178–0.452, `bumperPlastic`) and `structure` are clearly visible as a
pale ladder of hard-edged rectangular blocks between the wheels in `side.png`, and as
a bright horizontal shelf below the rear bumper in `rear.png`. In `BAT-R` the same
region is a dark void with one exhaust pipe in it. This is item 1 and item 2 again —
a 0.025-albedo surface returning mid-grey — but the hard box silhouettes are their
own problem.

### 16. Roof-rail finish. `WRONG` (medium confidence)

`roofRails` wears `blackTrim`. `REFERENCE-VEHICLE.md` §6.6 records the OEM Typ 44
Avant rail pair (445860021/022) as **chrome/bright finish** and reads the Euro
reference photography as bright polished aluminium. `OWNER` is backlit and cannot
settle it, which is why this is medium and not high. The *feet* are also flat sheet
tabs where §6.6 describes swept integral end terminations plus two short posts —
`HP.roof.railFeet` is 3, the reference is 4 support points.

---

## Claims I checked and am dropping

These are things I believed on sight this round and the measurement killed. Listing
them so nobody re-reports them.

* **"The nose is long and low."** It is not. Front overhang as built is **1084 mm**
  to the bumper face (1096 to the plate bolts); `BP` gives a Euro overhang of
  **1023 mm** and the US 5 mph bumper adds 51, so the target is **1074**. That is
  **+10 mm, 0.9 %** — three pixels in `side.png`. Bonnet leading edge is **844 mm**
  against `BP`'s **843**. Overall length 4912 against 4893–4895. Wheelbase, both
  overhangs and max half-width (905 vs spec 907) are all on the money. The
  impression comes from item 5's flat roofline and item 2's glowing bumper, not the
  nose.
* **"The headlamps are switched on."** All lamp lights are at `intensity = 0`, and
  the aperture is measurably *dimmer* than the photograph's (render mean 177–196 vs
  `OWNER` 231). The apparent beam is the bumper-strip bloom.
* **"Panel gaps read as painted lines."** They do not. `QUALITY.panelGap` is 4 mm,
  each panel insets by half and rolls its edge, with a 30 mm return (55 mm on moving
  panels). Scanning across five shutlines in `side.png` finds the correct signature
  every time — bright rolled edge then a dark trough: bonnet front contrast 44,
  door mid 36, bonnet rear 14, door front 11, door rear 9. At the side view's
  3.12 mm/px a 4 mm gap *is* about one pixel, which is correct.
* **"The grille is a bright silver louvre."** It is not. A column profile through
  the aperture (rows 457–511 of `front.png`) reads a dark ground at 24–30 with
  **seven** bright slat lines at 120–148, bright runs of 2–2.5 px against dark runs
  of 4. Bright : dark ≈ 30 : 70, matching `OWNER`. Round one's §11 is properly fixed;
  the bloom in the downscaled contact sheet is what fooled me.
* **"The taillamp's amber band is too tall."** `REFERENCE-VEHICLE.md` §6.4 says upper
  45 % / lower 55 %; that appears to be wrong. Vertical profiles at three stations on
  `BAT-R` (dead-on, so no foreshortening) give upper : lower of **54 : 46 to 56 : 44**.
  As built it is 112 : 98 = 53 : 47. Correct.
* **"The reverse lamp should fill the upper band."** It should not. `BAT-R` scans at
  x 700 and x 1420 both show amber above *and* below the clear cell. The render's
  inset window is right.
* **"The rear lamp aspect is wrong."** Measured 451 × 137–150 px on `BAT-R` gives
  3.0–3.3 : 1; as built 685 × 226 = 3.03 : 1. Inside the error bar of where you put
  the lamp's edges. Leave it.
* **"The backlight is too raked."** `BP`'s rear silhouette drops 1319 → 1148 mm over
  413 mm of z — **67.5° from vertical**. As built, 272 mm of rise over 568 mm of run
  = 64°. Correct; the C3 Avant's backlight really is that shallow.
* **"Triangles are over budget."** 765,148 against 1.2 M. Fine.
* **"There is a hole in the bodywork at the front wheel."** There is not — eleven
  raycasts all hit geometry. See item 13.
* **"The shadow in `rear3q` is a hard-edged rectangle."** At full resolution it is a
  normal car-shaped cast shadow with a ~15 px penumbra. It looks rectangular only in
  the downscaled sheet.

---

## What is right — do not disturb

Everything on the round-one "fixed" list that I could measure, I measured:

* **Headlamp.** Aperture measures **138 × 51–63 px at 3.005 mm/px = 415 × 153–189 mm**
  in `front.png`, bracketing `HP`'s 409 × 168 (2.4 : 1) exactly as a real bezel
  should. Amber outboard, two reflector chambers, continuous bright bezel. ✅
* **Front-face setback.** Bumper face z +1.084, lamp bezel z +0.958 → **126 mm**
  against the ~132 mm the blueprint plus the US bumper implies. ✅
* **Grille.** Seven bright slats, reads dark, rings proud and centred. ✅
* **Taillamp.** Split across the tailgate shutline with the correct outer/inner
  sections, one reverse cell inset in the inner section's outboard upper band, amber
  outboard, red below, band ratio correct. ✅
* **Rear plate.** In the tailgate, centred on the lamp band (y 0.720–0.872 against a
  lamp band of 0.688–0.920), not in the bumper. ✅
* **Backlight.** Bottom at 1.010 on a raised sill above `beltY`, rake matches `BP`.
  Rear wiper now lies on the glass. ✅
* **Roof rails** are at the roof edge (x 0.654–0.692 against `HP.roof.railInnerX`
  0.655), not inboard on bellows posts. Position fixed; height is item 5. ✅
* **D-pillar is body colour.** ✅
* **Tyres.** OD **616 mm**, ground contact at −1 mm, legible moulded sidewall
  lettering and size, shoulder lugs present. ✅
* **Wheel.** 12-slot bottlecap, raised centre disc with rings, polished lip, no
  exposed bolts. ✅
* **Plate.** 304 × 152, PA blue-on-white, corner bolts, keystone, legible at
  `platecam`; front plate on the bumper per `OWNER`. ✅
* **Dimensions.** Wheelbase 2687, overhangs 1084/1129, length 4912, max half-width
  905, bonnet leading edge 844, cowl 1033. All within 1–2 % of `BP`. ✅
* **`photomatch` is a genuine dead-on front again** at 4.78 m and 33.4° — the
  acceptance pose is producible. ✅
* **Panel gaps, headliner, inspection sticker (x 0.426–0.478, y 1.369–1.398,
  passenger side, top of screen — exactly where `OWNER` has it), cowl, washer jets,
  four rings absent from the tailgate (correct for a 5000 S), no cowl/A-pillar
  shard.** ✅
* **Triangle budget.** ✅

---

## If only three things get fixed

1. **Raise the sky/ambient fill** until a vertical body panel not in sun lands near
   **148**, and re-point `sheet.py`'s search window at the car so the gate can never
   pass on background again.
2. **Pull the `goldenhour` bloom back to the base grade** (strength 0.22, threshold
   1.15) and roughen `frontRubStrip` so it stops blowing out.
3. **Build the tailgate spoiler**, the black band under the backlight and the CHMSL,
   and move `tailgateRibPanel` from z +0.026 to the tail.

Those three change more of the illusion than every remaining geometry item combined.

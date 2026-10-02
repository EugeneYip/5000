# Critique 6 — verdict: **reject**

> Would a careful enthusiast, shown this beside a photograph of the real car,
> believe it is a photograph? **No.**

And the belief breaks *before the eye reaches the car*, which is the single
most useful thing in this round. At the distance a person looks from, the
frame fails on **sky, scene and the absence of highlights**. At 1:1 it fails on
**parts and materials**. Those two disagree, and the disagreement says the
remaining work is in the light and the environment, **not in more detail** —
the opposite of the usual CG failure mode.

Shot at HEAD `bee8af5` with a verified-clean tree. `census()`: 292 meshes
(+31 hidden), 1,048,132 triangles, 74 materials.

## The gate's shape is the whole report

dRGB **4.8** (aim < 12), stable across three boots. Tone profile **16.4 / 16.6
/ 16.6** — stable, so not the bimodality, and **worse than CRITIQUE-4's 12.6.
Nobody had flagged that.**

32.3 % of car pixels pile into buckets 48–80 against the photograph's 19.6 %;
9.0 % against 14.5 % in 80–96; and the **240–256 bucket is 0.2 % against
1.9 % — ten times short.**

## 1. The paint has no highlight

The car's entire specular budget is spent on 2 px edge radii: every panel is a
soft continuous mid-tone wash and every *edge* is traced in a near-white
hairline. A clay model with its edges pencilled in chrome.

Through the harness's own `photomatch_paint.png` mask (81,600 px): paint p99
**211**, max 247, **≥240 = 0.19 %, ≥250 = 0.00 %**. Not a tonemap ceiling —
the frame and the car mask both reach 255.

Matched windows, photograph registered on the plate (×0.735), `photomatch`
x 860–1130, y 330–470:

| | p50 | p90 | p99 | ≥240 |
|---|---|---|---|---|
| render | 186 | 206 | **214** | **0.38 %** |
| photo | 162 | 192 | **250** | **2.65 %** |

**Brighter at the median, 7× fewer highlight pixels, p99 thirty-six levels
lower.** Of 4,921 car-mask pixels ≥240 at `photomatch`, **every one is in rows
400–480** — the headlamp lenses. Nothing on the paint. Meanwhile at `front` a
2–3 px run at V 239–245 sweeps the front bumper's corner radius where the
surrounding plastic is V 65–110.

**This is why tone 16.6 sits beside dRGB 4.8: a histogram can be matched in
the middle while the top decile is missing.**

## 2. Four smoke plumes in the sky, in the gate frame

`photomatch` x 630–1100, y 100–280: four or five tall thin hairpin grey plumes
rising out of the treeline, exactly like chimney smoke. `pick` returns
**`env:skyDome` only** — the sky's own cloud synthesis, not geometry. Nothing
like it in the photograph. Pre-attentive: a viewer reads "rendered" in the
first second, before reaching the car. It also contaminates the IBL.

## 3. At `side` the greenhouse is a light box

| | glass p50 | flank p50 | glass/flank | chroma |
|---|---|---|---|---|
| render | 220 | 186 | **1.18** | 9 |
| photo | 133 | 208 | **0.64** | 29 |

1.85× too bright, **and the glass is brighter than the paint, which no
reference does** — neutral-warm where the reference is cool blue. The horizon
reads continuously through the car.

Cause, by dense `pick` requiring glass as the first hit: at `side`, **1,422 of
1,998 rear-DLO pixels (71.2 %) find nothing behind but `env:skyDome` at
325 m**; front DLO 39.8 %. **But at `front3q` / `photomatch` / `rear3q` the
same scan finds 0–1 % sky-only and 73–85 % cabin.** So this is specific to the
lateral poses and **the fix is a lateral occluder, not a full cabin.**

## 4. The lower front end is a pale blister hanging 125 mm too low

Plate-normalised at `photomatch`: bumper upper face 0.381 against 0.345 (fine);
**bumper lower blade 0.376 against 0.225 — 1.67×.** The photograph's blade is
35 % darker than the face above it; ours is the same tone, so the bumper reads
as one pale part. Relative texture on the blade 4.94 % against 11.34 %, 2.3×
too smooth, while the upper face is fine.

Silhouette, plate-bottom to car-mask-bottom — a plate-internal ratio immune to
camera height — **render 65 px, photo 15 px: 50 px = 125 mm too deep.**

**Also missing entirely:** the photograph has an amber bumper side-marker at
render-space x 1014–1060, y 547–557 (435 px with R−B > 55). The render has
**zero** amber pixels in x 950–1200, y 520–600.

## 5–13, in order

**The grille aperture is 40 % too dark** (plate-normalised 0.124 against
0.201) where CRITIQUE-4 recorded 0.174 after `94fc4ba` — a possible
regression, but re-measure with that round's own box first. **The door handles
are invisible at every pose**: an automated trough scan finds broad reference
troughs at x 827 (37 mm, depth 17) and x 1100 (44 mm, depth 15) and **no
trough at either station in the render.** **The beltline is a black bar** (4
rows, V 30–41) where both side references carry bright anodised brightwork (7
rows, 236–251) — *check the owner's own car before acting, US trim varied.*
**The scene is empty** — no kerb, verge, grass, markings, signs, cars,
buildings; and the trees read as stencils not because their silhouettes are
bad but because **they have one value**: 0.0 % below 48, 0 % above 224, 68 %
inside buckets 48–112, against the photograph canopy's 33 % below 48 and 2.9 %
above 240. A 2-stop foliage range against a real 8. **The rub strip is V 68
where the reference is 23–29** and its bead is lavender at chroma 30–41.
**The mirror** is a featureless grey lump. **The badge is still inverted**
(stroke faces 131–146 against their own edges at 207–240). **`platecam`
faceting** persists. **The paint's colour family changes with view**: the same
roof panel reads (12, 35, 85) at `top` against (244, 241, 239) at `roofrail`;
our B−R runs +81 → −19 across panels where the references run 30 and 26
levels — **the pigment term is too weak against the mirror term.**

## ⚠ Corrections to THIS document, from re-measurement

**Item 5, the grille, is wrong in both directions.** The relief is *not*
missing — the 8.0/9.5-against-70/42 figure predates `f84efa7`, and on the
current build the row-mean peak-to-trough is **54.2 against the photograph's
40.7, 33 % over.** And the level is not 40 % too dark, it is **40 % too
light**: 0.182 of plate against 0.128 on luma. The 0.201 above could not be
reproduced on any clean band — the left side of the photograph's aperture is
behind the woman's dress, so the outboard band is the only clean one.

**The real finding is that the direction flips with the statistic.** On
`V = max(R,G,B)` the render's void is 35 against 42 (darker); on luma 33
against 26 (lighter). Both true, because **our grille is neutral and the
photograph's is navy by 22 levels at both ends.** And ~28 of the void's 31
levels are an additive neutral glare floor from the aperture frame and the
lamps — cutting the core albedo 45 % moved it 32.8 → 30.7 and its hue not at
all. **That residual is the bloom's, not the grille's.**

**Item 6's "no trough at either station" is true but misleading: the handle is
not at the station.** The reference troughs at x 827 and 1100 are the *aft
ends* of the reference handles; ours sit 100-140 px forward, so the scan's
window held plain door. The real errors are hardpoints — 339 mm of z on the
front handle — recorded at `HP.side.handleFrontCenter`.

**Item 9's bead is retracted.** Normalised to each car's own paint the bead is
**1.33× ours against 1.02-1.06× the reference's** — slightly hot, not 2.5×
short. The "5 px / 17 mm" width was a half-rise threshold artefact: on a
graphite car the paint above the bead sits above the half level and the
measurement leaks upward into it. The *strip's* 2.5× level error is real, but
it is `bumperPlastic`, shared with the bumper covers, so it belongs in
`materials/trim.ts`.

## ⚠ A correction to CRITIQUE-5 that will cost a round if ignored

**"The car casts almost no occlusion shadow under itself — 15–25× too light"
does not reproduce at the money shot, and darkening the under-car will push
`photomatch` the wrong way.**

Plate-normalised at `photomatch` against the owner's photograph:

| | render | photo | ratio |
|---|---|---|---|
| under the bumper centre | 0.265 | 0.446 | **0.60× (too dark)** |
| front tyre | 0.283 | 0.494 | 0.57× |
| wheel-arch void | 0.350 | 0.514 | 0.68× |
| windscreen | 0.695 | 0.474 | 1.47× |
| bonnet | 0.874 | 0.651 | 1.34× |

Every dark region is **darker** than the photograph's and every mid/bright
region **lighter**. It *does* reproduce at `side` against `bat3_side_profile`
— but that car is parked in deep shade against a wall, so its blacks are near
zero and the ratio is a property of the reference. **The render's real tonal
error is not "shadows too light"; it is too contrasty below the midpoint and
crushed above it** — which is item 1 again, from the other end.

## Checked and **correct** — do not burn a round

- **The lamp gaskets have substantially landed.** Vertical cut at `photomatch`
  x 620: bonnet 151 → 107 → bead 201 → **groove 61** → lens 235, against the
  photograph's 181 → 248/239 → **groove 105/123** → lens 247. Comparable
  amplitude and width; CRITIQUE-5's "monotone, not one dip" no longer holds.
  One residual: the photograph has lens → groove → **bright bead 244** →
  bumper, and the render goes lens → groove → straight to the bumper with **no
  lower bead**.
- **The headlamp lens is not too bright** — plate-normalised 1.044 against
  0.976, confirming CRITIQUE-5. The defect is *uniformity*: lens sd **2.3**
  against the photograph's **9.4**.
- **The amber cross-hatch is invisible where it matters** — mean |lap|/mean
  **1.74 % against the photograph's 3.87 %**; ours is *smoother* than the real
  lens at money-shot scale. A close-range-only defect. Rank it last.
- **The road's texture is fine** (12.93 % against 14.43 %), and so is the
  bumper's upper face.
- **Shutlines on the paint are right** — 10–17 mm wide, depth 60–107 against
  the reference's 10–13 mm and 70–86.
- **Roof-rail sparkle: retracted.** Pixels >+40 over a 5×5 local median read
  render **0.48 %** against the reference moulding's **0.58 %**. The reference
  has more; the reviewer's own crop resampling produced the impression.
- **"The flank is blown out": retracted.** It is **24 levels darker** than the
  registered reference (p50 189 against 213) with **0.03 % ≥240 against
  17.2 %**. It *looks* blown because it is flat — p5→p95 spans 32 levels
  against 76. That flatness is the known missing shoulder and crease.
- **Small crevices work; large voids do not.** Shutlines, lamp grooves and the
  arch void above the tyre are all fine. What fills with ambient at V 50–75 is
  the metre-scale: the wheel well (0.254 against 0.019) and under the sill
  (0.392 against 0.014). GTAO handles 10 mm cuts; nothing handles half-metre
  voids.

## Methods notes

- **Register the owner photograph on the plate and transfer the harness's own
  `photomatch_paint.png` mask onto it** — scale 122/166 = 0.7349, plate centres
  render (799.5, 549) and photo (979.5, 844). That is how item 1 became a
  number instead of an impression. **Restrict to x > 860** or the mask lands on
  the couple's clothing and reports 19 % highlight.
- **`bat3_side_profile` registers at dx −10, dy +221** from the front-hub
  centre, not the +213 a hubcap-threshold mask gives — the threshold mask eats
  the arch lip.
- **Plate-normalise everything at `photomatch`.** Five findings only became
  arguable once divided by the plate.
- A "lowest painted hit / highest tyre hit" pick loop over an arch **measures
  the arch opening's silhouette, not the lip** — the tyre stops being the
  frontmost hit exactly at the lip, so it reports a flat 537 mm across ±200 mm
  and looks like a rectangular arch. Do not publish that number.

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
- A Pennsylvania inspection sticker at the top of the windscreen, passenger side.
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

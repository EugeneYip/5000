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
- Quad-style composite headlamps with the amber indicator at the outboard end.
- Horizontal-slat grille, four rings centred in it.
- Dark grey textured bumper with a rub strip, amber marker in the bumper end.
- A Pennsylvania inspection sticker at the top of the windscreen, passenger side.
- Flush glazing — the glass sits almost level with the body side.

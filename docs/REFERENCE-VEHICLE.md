# Reference Vehicle — Audi 5000 S Wagon (C3 / Type 44), MY1986–1991

Engineering reference for a photoreal parametric 3D build.
Compiled 2026-09-25. Every number is followed by its source. Where sources disagree, both values are given.

---

## 0. Scope, naming and which car this actually is

**Read this before using any number below.** The name in the brief does not map cleanly onto a single model year range, and the US car is not dimensionally identical to the European one.

| Market | Name | Years | Notes |
|---|---|---|---|
| Europe | Audi 100 Avant (C3, Typ 44) | Avant launched Aug/Sep 1983; built to 1990/91 | Sedan launched Sep 1982 |
| USA | **Audi 5000 S Wagon** | MY1984 – MY1988 | The name you asked for |
| USA | **Audi 100 (wagon / Avant)** | MY1989 – MY1991 | Same body. Renamed after the 1986 *60 Minutes* unintended-acceleration episode |

- The "Audi 5000" badge was used in North America from 1978 and was **dropped after MY1988**; for MY1989 the C3 was rebranded **Audi 100 / Audi 200**. So a "1991 Audi 5000 S Wagon" does not exist — that car is a *1991 Audi 100 Avant*. ([en.wikipedia.org/wiki/Audi_100](https://en.wikipedia.org/wiki/Audi_100), [thetruthaboutcars.com](https://www.thetruthaboutcars.com/2016/01/junkyard-find-1990-audi-100-quattro-sedan/))
- The Avant body ran 1983–1991 across the whole C3 run. ([classic.com C3 market](https://www.classic.com/m/audi/100-200-5000/c3/))
- **Facelift, January 1988:** flush/integrated door handles, revised interior, procon-ten becomes available, optional driver airbag. This is the single most visible exterior change in the range and it splits the model into pre-'88 and post-'88 bodies. ([en.wikipedia.org/wiki/Audi_100](https://en.wikipedia.org/wiki/Audi_100), [de.wikipedia.org/wiki/Audi_100_C3](https://de.wikipedia.org/wiki/Audi_100_C3))

### Primary source used throughout
The highest-authority source in this document is the **factory US sales brochure, "Audi for 1987"**, pages 16–17, which carry the complete `AUDI 5000S SPECIFICATIONS` table with a dedicated *5000S Sedan and Wagon* column.
PDF: <https://www.auto-brochures.com/makes/Audi/Audi_US%20Full%20Line_1987.pdf>
Cited below as **[BROCHURE-87]**. Prefer these numbers over any aggregator database.

### Recommended build target
**MY1987–1988 US-market Audi 5000 S Wagon**, 2.3 L NF inline-five, FWD, 5-speed manual, 14-inch "bottlecap" alloys. This is the configuration with the most complete factory documentation (the entire [BROCHURE-87] table) and it sits in the middle of the requested year span.

---

## 1. Exterior dimensions

### 1.1 Primary envelope — US-spec 5000 S Wagon

| Parameter | Value (mm) | Value (imperial) | Source |
|---|---|---|---|
| Overall length | **4895** | 192.7 in | [BROCHURE-87] |
| Overall width (excl. mirrors) | **1814** | 71.4 in | [BROCHURE-87] |
| Overall width (incl. mirrors) | ~2000 (est.) | ~78.7 in | *Not published — see note* |
| Overall height, unladen | **1415** | 55.7 in | [BROCHURE-87] |
| Wheelbase | **2687** | 105.8 in | [BROCHURE-87] |
| Front track | **1468** | 57.8 in | [BROCHURE-87] |
| Rear track | **1468** | 57.8 in | [BROCHURE-87] |
| Ground clearance (laden), Wagon | **135** | 5.2 in | [BROCHURE-87] |
| Ground clearance (laden), Sedan | 125 | 4.9 in | [BROCHURE-87] |
| Curb weight, Wagon | **1340 kg** | **2954 lb** | [BROCHURE-87] |
| Curb weight, Sedan | 1290 kg | 2844 lb | [BROCHURE-87] |
| Fuel tank | **80 L** | 21.1 US gal | [BROCHURE-87] |
| Turning circle, curb-to-curb | **10.42 m** | 34.2 ft | [BROCHURE-87] |
| Drag coefficient, **Wagon** | **Cd 0.34** | — | [BROCHURE-87] |
| Drag coefficient, Sedan | Cd 0.32 | — | [BROCHURE-87] |

> **Mirror-inclusive width is not published in any source found.** Do not invent it — derive it from the model once the mirror housings are placed, or measure it off a scaled direct-front reference photo.

### 1.2 Euro (Audi 100 Avant) envelope — differs from US

The European car has short bumpers; the US car has 5-mph impact bumpers that add **~102 mm (4.0 in)** to overall length. Everything else is shared.

| Parameter | Euro 100 Avant | Source |
|---|---|---|
| Overall length | 4792–4793 mm | [automoli](https://www.automoli.com/de/vehicles/audi/100/100-avant-c3-typ-44-44q-1061/), [auto-data.net](https://www.auto-data.net/en/audi-100-avant-c3-typ-44-44q-generation-1061), [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |
| Overall width | 1814 mm | same |
| Overall height | 1422 mm | same |
| Wheelbase | 2687 mm (de.wikipedia says 2685) | same |
| Front track | 1468–1476 mm | [automoli](https://www.automoli.com/de/vehicles/audi/100/100-avant-c3-typ-44-44q-1061/) |
| Rear track | 1467–1490 mm | same |
| Kerb weight range | 1130–1450 kg | same |
| GVWR range | 1630–2000 kg | same |

**⚠ Source conflict on track width.** German Wikipedia lists front 1497 mm / rear 1511 mm for the C3, which contradicts the factory [BROCHURE-87] figure of 1468/1468 mm and the 1468–1490 mm range from automoli/auto-data. **Use 1468 mm front and rear** — it is the factory number for the exact car being modelled. Treat 1497/1511 as an outlier or as applying to a wide-track variant (the 1991 200 20V had flared arches for wider tyres, per [en.wikipedia](https://en.wikipedia.org/wiki/Audi_100)).

### 1.3 Overhangs and angles — DERIVED, not published

Audi did not publish overhangs or approach/departure angles. These were **measured directly off the 1986 Audi 100 C3 Avant orthographic side elevation** ([getoutlines.com blueprint](https://getoutlines.com/blueprints/221/1986-audi-100-c3-avant-wagon-blueprints), direct image <https://getoutlines.com/blueprints/car/audi/audi-100-avant-1986.gif>) using a circle-Hough fit to locate both wheel centres, scaled against the published 2687 mm wheelbase.

**Validation of the method:** scaling the drawing by overall length (4792 mm) independently reproduced the wheelbase as **2683 mm vs the published 2687 mm — a 0.15 % error.** The drawing is geometrically trustworthy.

| Derived parameter | Value | Confidence |
|---|---|---|
| Front overhang (Euro bumpers) | **1033 mm** | ±15 mm |
| Rear overhang (Euro bumpers) | **1078 mm** | ±15 mm |
| Check: 1033 + 2687 + 1078 | 4798 mm vs published 4792 mm | 0.13 % error |
| Front overhang (US bumpers) | **~1084 mm** | derived: +51 mm |
| Rear overhang (US bumpers) | **~1129 mm** | derived: +51 mm |
| Approach angle | **~18.3°** | ±2°, unladen, Euro bumpers |
| Departure angle | **~19.5°** | ±2°, unladen, Euro bumpers |

The US overhang split assumes the 102 mm of extra US bumper length is shared equally front/rear. If you can find a US-market orthographic drawing, verify this — it is the weakest assumption in this document.

Also measured from the same drawing: total height **with roof rails fitted** scales to ~1474 mm, i.e. the rails stand roughly **50–55 mm proud of the roof skin** (1474 − 1422). Low confidence (±15 mm) — the drawing is only 542 px wide.

### 1.4 Weights and distribution

| Parameter | Value | Source |
|---|---|---|
| Curb weight, US 5000 S Wagon | 2954 lb / 1340 kg | [BROCHURE-87] |
| Curb weight, US 5000 S Sedan | 2844 lb / 1290 kg | [BROCHURE-87], [autodetective](https://www.autodetective.com/directory/1988/audi/5000/trim/s/) |
| GVWR | **Not published in US literature found** | — |
| GVWR, Euro equivalent (zul. Gesamtgewicht) | 1630–2000 kg depending on variant; 1960 kg for the 2.2E Turbo quattro Avant | [automoli](https://www.automoli.com/de/vehicles/audi/100/100-avant-c3-typ-44-44q-1061/), [autokosten.net](https://www.autokosten.net/audi/100-avant/100-avant-2-2-e-turbo-kat/100-c3-avant-06-83-12-90_42/technische-daten) |
| Payload, 2.2E Turbo quattro Avant | 610 kg | [autokosten.net](https://www.autokosten.net/audi/100-avant/100-avant-2-2-e-turbo-kat/100-c3-avant-06-83-12-90_42/technische-daten) |
| Weight distribution F/R | **NOT FOUND — do not treat as sourced** | — |

> **Weight distribution warning.** No period road test or factory figure for the C3's front/rear split was located. The only supportable statement is the general one: Audi's longitudinal-engine FWD layout places the engine ahead of the front axle line, making these cars markedly nose-heavy, with roughly 60/40 commonly quoted for Audis of this architecture ([AudiWorld](https://www.audiworld.com/forums/a8-s8-d2-platform-discussion-8/weight-distribution-1732229/), [VWVortex](https://www.vwvortex.com/threads/why-isnt-audi-not-concerned-about-weight-distribution.1918207/)). **For simulation, use 60/40 front/rear as a placeholder and flag it.** The wagon's extra rear structure will shift it slightly rearward of the sedan.

### 1.5 Tyres and wheels (dimensional — see §3 for styling)

| Variant | Wheel | Tyre | Source |
|---|---|---|---|
| **5000 S Sedan and Wagon** | **6J × 14 light alloy** | **185/70 HR14** steel-belted radial | [BROCHURE-87] |
| 5000 CS Turbo / Turbo quattro | 6J × 15 light alloy (7J × 15 optional on Turbo quattro) | 205/60 VR15 | [BROCHURE-87] |
| Euro 100 Avant range | 14 or 15 in | 185/70 R14 or 205/60 R15 | [automoli](https://www.automoli.com/de/vehicles/audi/100/100-avant-c3-typ-44-44q-1061/) |

Rolling diameter, 185/70 R14 = 355.6 + 2(185 × 0.70) = **614.6 mm**. (205/60 R15 = 627 mm; 195/60 R15 = 615 mm.) The blueprint's drawn tyre circle scales to ~647 mm, ~5 % larger — that fit is almost certainly locking onto the wheel-arch line rather than the tyre, so **use 615 mm, not the drawing.**

### 1.6 Volumes

| Parameter | Value | Source |
|---|---|---|
| Cargo, Wagon, seats up (SAE) | **38.5 cu ft** | [BROCHURE-87] |
| Cargo, Wagon, rear seat folded (SAE) | **76.8 cu ft** | [BROCHURE-87] |
| Cargo, Sedan (SAE) | 16.7 cu ft | [BROCHURE-87] |
| Cargo, Euro Avant (DIN/VDA) | 644 L seats up | [automoli](https://www.automoli.com/de/vehicles/audi/100/100-avant-c3-typ-44-44q-1061/), [autokosten.net](https://www.autokosten.net/audi/100-avant/100-avant-2-2-e-turbo-kat/100-c3-avant-06-83-12-90_42/technische-daten) |
| Cargo, Euro Avant, seats folded | 1920 L (automoli) / 1837 L (autokosten, quattro) / 2025 L "sphere measurement" (de.wikipedia) | as cited |
| Passenger volume front/rear, Wagon (SAE) | 52.6 / 45.0 cu ft | [BROCHURE-87] |
| Passenger volume front/rear, Sedan (SAE) | 52.6 / 44.4 cu ft | [BROCHURE-87] |
| EPA total passenger volume | 98 cu ft; cargo 39 cu ft | [fueleconomy.gov](https://fueleconomy.gov/feg/noframes/3541.shtml) |
| Engine oil / coolant | 5.3 US qt with filter / 8.5 US qt | [BROCHURE-87] |

> **SAE vs DIN mismatch is expected, not an error.** 38.5 cu ft = 1090 L, but the DIN figure is 644 L. SAE and DIN/VDA measure station-wagon load bays completely differently (SAE fills to the roof; VDA stacks 200×100×50 mm blocks to the parcel-shelf line). Quote both, convert neither.

### 1.7 Aerodynamics — the C3's headline feature

| Body | Cd | Source |
|---|---|---|
| **US 5000 S Wagon** | **0.34** | [BROCHURE-87] (also stated in the brochure's wagon copy) |
| US 5000 S Sedan | 0.32 | [BROCHURE-87] |
| US 5000 CS Turbo Sedan / Wagon | 0.33 / 0.35 | [BROCHURE-87] |
| Euro 100 Avant | 0.34 — "most aerodynamic estate car in the world" at launch | [Audi Lebanon / Audi official](https://m.facebook.com/OfficialAudiLebanon/photos/a.471612512897671/1706751209383789/) |
| Euro 100 Avant 1.8 | 0.33 | [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |
| **Euro 100 Sedan (the famous number)** | **0.30** — lowest of any production car on sale in 1982 | [en.wikipedia](https://en.wikipedia.org/wiki/Audi_100), [supercars.net](https://www.supercars.net/blog/1982-audi-100-audi-200-c3/), [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |

**Do not use 0.30 for this model.** 0.30 is the Euro base sedan. The wagon you are building is **0.34**. Frontal area is not published in any source found; compute it from the model (expect roughly 2.05–2.15 m²).

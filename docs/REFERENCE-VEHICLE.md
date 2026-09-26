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

---

## 2. Body and styling, panel by panel

**Evidence basis.** Descriptions marked *(observed)* were read directly off the factory photography in [BROCHURE-87] — pages 4–5 are the 5000S Wagon spread (front-3/4 and rear-3/4, US-spec, MY1987), pages 8–9 the 5000CS Turbo, pages 10–11 the Turbo quattro. Descriptions marked *(cited)* carry a URL. Anything marked **[VERIFY]** could not be resolved to the precision you need and must be checked against a high-resolution photograph before modelling.

### 2.1 Front

**Grille**
- A single **shallow, wide, full-width horizontal-slat grille** spanning the gap between the two headlamp units. Fine horizontal ribs, closely pitched, in matt black. The grille is much wider than it is tall — it reads as a letterbox slot, not a face. *(observed, p.9/p.11)*
- **The four rings sit IN the grille, not on the hood edge.** They are mounted on a solid black central bar within the grille aperture, horizontally centred, in bright chrome. *(observed, p.9 — clearly resolved at magnification)*
- A **thin bright (chrome/aluminium-look) surround frame** outlines the grille aperture and continues as a bright line along the top edge, tying the grille to the inboard edge of each headlamp. *(observed)*
- **[VERIFY] Slat count.** At the available scan resolution roughly 8–9 horizontal ribs are countable per side of the central bar, but this is not reliable. Count it off a grille close-up before committing geometry.
- On quattro cars a **lowercase "quattro" script** sits on the grille's black panel, offset to one side of the rings (not centred). *(observed, p.11)*

**Headlights (US-spec) — it is BOTH composite AND quad**

This was the most confused point in the brief, and the factory photography resolves it. At high magnification on [BROCHURE-87] p.9 the MY1987 US front lamp assembly reads, **outboard → inboard**, as:

1. an **amber turn-signal lens** — outboard-most, roughly trapezoidal/wedge-shaped, wrapping slightly around the corner;
2. **two clear rectangular optical units side by side**, separated by a visible vertical divider — an outer lamp and an inner lamp;
3. then the grille aperture begins.

So: **one flush composite housing per side, containing two rectangular headlamp units (four lamps across the car = "quad") plus an integrated outboard amber turn signal, all under a common bright chrome bezel.** *(observed, p.9)*

- The **chrome bezel outlines the whole assembly** and continues along its top and bottom edges to meet the grille's bright surround, so the grille and both lamp units read as one continuous horizontal band across the nose. *(observed)*
- The assembly is flush-mounted and gently wrapped at the outboard end, following the fender's corner radius.
- The band's proportions echo the grille: long and shallow, with the top edge following the hood shutline dead straight across.
- **Model-year split on the US front clip.** A verified **1985 US 5000 S Avant** wears visibly **separate quad rectangular lamps** (two discrete lamps per side, not under one flush bezel) — see `https://germancarsforsaleblog.com/wp-content/uploads/2017/05/441.jpeg`. By MY1987 the flush one-piece composite bezel above is fitted. **If you are building MY1986–1991, use the flush composite assembly, not the 1985 look.**
- Context: US federal law required sealed-beam headlamps until the early 1980s and permitted composite (replaceable-bulb) units from MY1984, after which European imports switched to home-market-style composites during 1985–86 — consistent with the MY1987 car. ([Hagerty](https://www.hagerty.com/media/automotive-history/how-the-humble-sealed-beam-headlight-hobbled-american-automotive-design-for-decades/), [classiccarstodayonline.com](https://www.classiccarstodayonline.com/2022/05/09/a-brief-history-of-headlamp-styles-in-the-u-s/))
- **Euro cars differ** — a single one-piece lamp per side with no amber segment and no US side marker. Do not mix Euro and US front-clip references.

**Amber corner / turn-signal placement**
- Separate **amber wrap-around corner lamps at the outboard ends of the front bumper**, curving around the corner so they are visible from both front and side. These are in addition to the amber segment inside the headlamp unit. *(observed, p.6 and p.11)*

**Bumper and rub strip**
- Deep, **dark-grey/black moulded impact bumper**, full width, wrapping well around both corners.
- A **full-width bright rub strip runs horizontally across the bumper face**, aluminium-look, at roughly mid-bumper height, and continues around the corners. *(observed, p.6/p.11)*
- The bumper visually merges into the **dark lower-body cladding**, so the car reads as having a dark band running its entire perimeter. The factory copy describes a wide, steel-reinforced moulding along the side panels acting as a virtual wraparound bumper. *(cited: [BROCHURE-87] wagon copy, p.5)*
- US bumpers are the 5-mph impact type and are **~51 mm longer per end** than European ones (see §1.3).

**Lower valance**
- A separate **plain lower valance/air dam** below the bumper, same dark finish, with no visible grille aperture on the 5000 S. *(observed)*

**Fog lights**
- **Not fitted** to the 5000 S Wagon in the factory photography. No fog-lamp cutouts are visible in the valance. *(observed)* **[VERIFY]** whether fogs were a dealer/factory option for the US 5000 S — not resolved.

**Hood**
- Long, gently domed, falling away towards the nose. The **leading edge is soft-radiused** and forms the upper border of the headlamp/grille band.
- **Shutlines:** the hood's rear shutline runs across the base of the windscreen; the side shutlines run along the top of each front fender, parallel to the body sides. The front shutline is a single straight transverse line across the top of the lamps and grille.
- **Character line:** a soft crown runs down the hood centre with a gentle break above each headlamp, echoing the fender tops. There is no hard crease — the C3's front is defined by large-radius surfacing, which is exactly what produced the low Cd. *(observed)*

### 2.2 Sides

**Flush glazing — the signature detail**
- This is the C3's defining feature and the thing that will make or break the model. The side glass is **pin-mounted and sits essentially flush with the surrounding sheet metal**, rather than recessed inside a frame. The C3 was the first mass-market car to do this, and it was central to the 0.30 Cd. ([en.wikipedia](https://en.wikipedia.org/wiki/Audi_100), [supercars.net](https://www.supercars.net/blog/1982-audi-100-audi-200-c3/), [curbsideclassic](https://www.curbsideclassic.com/curbside-classics-european/curbside-classic-1983-1991-audi-5000100-c3-a-picturebook-story-of-the-very-model-of-the-modern-car/))
- Modelling consequence: **the glass outer surface and the adjacent body outer surface should be near-coplanar**, separated only by a thin black rubber/trim seal. Do not inset the glass. The step is on the order of a few millimetres, not the 10–20 mm typical of contemporaries.
- Windscreen and rear glass are likewise bonded flush with very thin black surrounds. *(observed)*

**Window frame treatment**
- Slim frames finished in **black**, with the B-pillar fully blacked out so the DLO reads as one continuous dark band. *(observed, p.4/p.6)*

**Rain gutters**
- **Concealed/flush** — the C3 deleted the conventional projecting drip rail as part of the aerodynamic programme. On the Avant a slim bright/black moulding runs along the roof-to-body joint above the door glass rather than a proud gutter. *(observed, p.5 roofline; consistent with the flush-body programme cited above)*

**Door handles — the model-year split**
- **Pre-January-1988:** a **recessed pull handle** sitting in a roughly circular/teardrop-shaped pocket pressed into the door skin, with the lever pivoting out of the pocket. *(observed, p.4 — MY1987 car)*
- **From January 1988:** **flush/integrated door handles**. ([en.wikipedia](https://en.wikipedia.org/wiki/Audi_100), [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3))
- Pick one and be consistent with the rest of the body's model year.

**Side rubbing strips and lower cladding**
- A **wide, steel-reinforced dark moulding runs the full length of the side panels**, front bumper to rear bumper, forming a continuous protective band. Factory copy explicitly calls it a virtual wraparound bumper. *(cited: [BROCHURE-87] p.5)*
- **A thin bright trim line runs along the top edge** of this moulding. *(observed, p.4)*
- Below the moulding the rocker area is finished in the same dark grey, giving a two-tone effect on light-coloured cars. *(observed)*
- A **small oval "audi" badge sits on the front-fender section of the moulding**, just behind the front wheel arch. *(observed, p.4)*

**Side marker lights**
- US-market requirement. Amber at the front (integrated into the wrap-around front corner lamp) and red at the rear. **[VERIFY]** exact rear side-marker shape and position — not clearly resolvable in the available photography.

**Mirrors**
- **Large black aero mirror**, wedge/teardrop plan-form, mounted on the door skin at the base of the A-pillar on a short integrated stalk with a triangular sail panel. Housing is matt/satin black on the 5000 S. Power adjustment was fitted. *(observed, p.4; power mirrors listed by [carweek](https://www.carweek.com/research/audi/5000/1988/specs))*

**Fuel filler**
- Appears on the **right-hand rear quarter** (passenger side on a LHD car), as a small rounded-square flap set into the quarter panel just aft of the rear door, above the rubbing strip. *(observed in the [getoutlines blueprint](https://getoutlines.com/blueprints/221/1986-audi-100-c3-avant-wagon-blueprints) side elevation, which shows the car's right side)* **[VERIFY]** against a photograph — side-of-car determination from a mirrored line drawing is error-prone.

**Wheel arches**
- **Plain, unflared, near-semicircular openings** with a small radiused lip, cut close to the tyre. No plastic arch extensions on the 5000 S. The arch line is a clean arc that dies into the body sides. *(observed)*
- Note for contrast: the 1991 200 20V — a different car — did get flared arches. ([en.wikipedia](https://en.wikipedia.org/wiki/Audi_100))

### 2.3 Rear — WAGON specifically

**Tailgate**
- Large, **full-height tailgate hinged at the roof**, wrapping down to bumper level. The glass occupies roughly the upper two-thirds; below it a body-coloured transverse panel carries the badging, and below that the licence-plate recess. *(observed, p.5/p.7)*
- The tailgate's shoulder line continues the body's beltline, and the D-pillar/tailgate joint is a crisp vertical-ish shutline. *(observed)*

**Rear glass**
- Steeply raked relative to a conventional estate — this is the "fastback Avant" profile that made the 0.34 Cd possible. The glass wraps slightly at its lower corners. *(observed)*
- A **black spoiler/lip runs across the top of the tailgate glass** at the roof trailing edge. *(observed, p.5 roofline crop)*

**Taillights**
- **Tall, roughly rectangular units with rounded outboard corners**, one per side, flanking the plate recess. Fine vertical lens ribbing across the whole face. *(observed, p.5 at high magnification)*
- **Internal segmentation, upper band, outboard→inboard:** a dark/black recessed section, then an **amber** segment, then a pale **clear/white** segment (reverse lamp) adjacent to the plate recess.
- **Lower band:** a single large **red** field (tail/stop) running the full width of the unit, with a small integrated reflector detail towards the bottom.
- **[VERIFY]** exact segment boundaries and which function is which — get a taillight close-up. The wagon lamps are **not** the same as the sedan's.

**Licence-plate recess**
- A **black recessed panel set into the lower tailgate, centred between the two taillights**, sitting below the badge line and above the bumper. The plate mounts directly onto this recessed face. *(observed, p.5)*

**Rear bumper**
- Deep, dark-grey/black, wrapping around both corners, with a **bright horizontal rub strip across the face** matching the front, and a separate lower valance beneath. *(observed)*

**Exhaust tip**
- A **single round tailpipe** exiting below the bumper, offset to one side. *(observed, p.5 — visible on the right of the rear view)* **[VERIFY]** which side; single exit is clear, side is not.

**Rear wiper**
- Fitted. Rear wiper blades are catalogued for the C3 Avant and forum threads discuss the Avant's rear-wiper mechanism, confirming it as standard equipment on the body. ([autodoc.de](https://www.autodoc.de/autoteile/scheibenwischer-10233/audi/100/100-avant-44-44q-c3), [group44.de forum](https://forum.group44.de/viewtopic.php?f=6&t=141461)) **[VERIFY]** park position and arm geometry from a photo.

**Centre high-mounted stop lamp (CHMSL)**
- Present on the US wagon — the factory copy explicitly calls out a centre, high-mounted brake light. *(cited: [BROCHURE-87] p.5)* Expect it at the top of the tailgate glass / spoiler area.

**Antenna**
- A **mast antenna at the rear of the roof**, offset to one side, raking backwards. *(observed, p.5)*

### 2.4 Roof and roof rails

- **Roof rails were OPTIONAL on the C3 Avant, not standard.** Cars built without them simply have no holes in the roof. ([typ43.eu forum](http://www.typ43.eu/Forum/viewtopic.php?t=6019); aftermarket rails/bars catalogued for the 1982–1990 C3 Avant at [MicksGarage](https://www.micksgarage.com/d/roof-racks-and-bars/audi/audi-100/100-c3-avant-1982-to-1990/products))
- **The MY1987 US 5000 S Wagon in the factory brochure has NO roof rails** — the roof is smooth from windscreen header to tailgate spoiler. *(observed, p.5)*
- **The 1986 Euro 100 Avant orthographic drawing DOES show rails** — two longitudinal rails running most of the roof length. *(observed in the [getoutlines blueprint](https://getoutlines.com/blueprints/221/1986-audi-100-c3-avant-wagon-blueprints))*
- **Decide explicitly which you are building.** If rails: two rails, longitudinal, running from just behind the windscreen header to the tailgate hinge line, standing **~50–55 mm** proud of the roof skin (derived, §1.3, ±15 mm).
- **[VERIFY]** number of feet/mounting points per rail, rail cross-section profile, and material/colour. Period C3 Avant rails are commonly satin-black or body-coloured aluminium extrusion, but no authoritative source for this specific car was found. Do not guess this from later Audi Avants — the C5/C6 rails are a different design.
- A slim moulding runs along each roof-to-bodyside joint in place of a conventional drip rail (see §2.2).

### 2.5 Greenhouse / DLO

- **DLO shape:** a long, low, near-parallel-sided band. Front door glass roughly rectangular with a raked leading edge following the A-pillar; rear door glass rectangular; then, on the wagon, the DLO **continues into a large fixed rear quarter window** before the D-pillar. *(observed, p.4/p.5)*
- The beltline is dead straight and horizontal for the whole length of the DLO — no kick-up until the D-pillar. This straightness is a major part of the car's read; get it exactly level.
- **D-pillar:** broad and body-coloured, raked forward at the top, forming the transition from the roof into the tailgate. It is noticeably wider than the B- and C-pillars, and it is the only pillar not blacked out. *(observed, p.5)*
- **Rain gutters:** hidden/flush (§2.2).
- A-pillar is steeply raked with a flush-bonded windscreen and a very narrow black surround.

### 2.6 Badging

| Badge | Text / form | Location | Evidence |
|---|---|---|---|
| Front | **Four rings**, chrome | Centred on the grille's black central bar, in the grille aperture — **not** on the hood edge | *(observed, p.9)* |
| Front (quattro only) | lowercase **quattro** script | On the grille's black panel, offset to one side of the rings | *(observed, p.11)* |
| Front fender | small oval **audi** | On the side rubbing strip, just aft of the front wheel arch | *(observed, p.4)* |
| Rear | **Audi 5000 S** | On the tailgate's body-coloured transverse panel, above the licence-plate recess, offset towards one side (not centred) | *(observed, p.5)* |
| Rear (Euro) | **Avant** | Euro cars carry an *Avant* script; the US car uses *5000 S* instead | [VERIFY] |

- **Font:** these are 1980s Audi badges and are **not** the modern "Audi Type" face, which Bold Monday only designed in 2008–09 ([boldmonday.com](https://boldmonday.com/custom/audi/)). Model the letterforms from a photograph, not from a current Audi typeface. **[VERIFY]** — no authoritative period typeface identification was found.
- The four rings of this era are **overlapping open circles with a flat chrome section**, noticeably chunkier than the modern flat logo. *(observed, p.9)*

---

> ## ⚠ Numbering note — read this if you were sent here for "section 2, Powertrain"
>
> The brief for this research pass asked for Powertrain as §2, Wheels §3, Interior §4, Body/styling §5,
> Reference imagery §6. **§2 was already occupied** by *Body and styling, panel by panel*, written in an
> earlier pass, and that section already covers everything the brief asked for under its §5. Rather than
> renumber existing work and break the internal cross-references (`see §2.2`, `§1.3` …), the new material is
> appended with the next free numbers:
>
> | Brief asked for | Actually lives at |
> |---|---|
> | §2 Powertrain | **§3 — Powertrain, chassis and performance** |
> | §3 Wheels | **§4 — Wheels** |
> | §4 Interior | **§5 — Interior** |
> | §5 Body and styling | **§2** (already written) **+ §6, addenda and resolved `[VERIFY]` items** |
> | §6 Reference imagery | **§7 — Reference imagery** |

---

## 3. Powertrain, chassis and performance

**Primary source, again, is [BROCHURE-87]** — the `AUDI 5000S SPECIFICATIONS` table on pages 16–17 of
<https://www.auto-brochures.com/makes/Audi/Audi_US%20Full%20Line_1987.pdf>. Every figure in §3 marked
[BROCHURE-87] was read directly off that table at magnification, in the *5000S Sedan and Wagon* column.

The second source used throughout is the **AudiWorld model archive**, which reproduces Audi of America's own
model-year press specifications:
- MY1987: <https://www.audiworld.com/model/5000/87-5000.shtml> — cited as **[AW-87]**
- MY1988: <https://www.audiworld.com/model/5000/88-5000.shtml> — cited as **[AW-88]**
- MY1989 (the renamed *Audi 100*): <https://www.audiworld.com/model/100/89-100.shtml> — cited as **[AW-89]**

[AW-87]/[AW-88] agree with [BROCHURE-87] on essentially everything and add several figures the brochure omits
(brake diameters, anti-roll bar diameter, standard-equipment lists). Where they disagree, the conflict is
called out and the brochure wins.

### 3.1 Which engine is actually in the car — the MY1987 split

**This matters and it is easy to get wrong.** The US 5000 S did not have the 2.3 for the whole of MY1987.

| Model year | Engine | Displacement | Output | Source |
|---|---|---|---|---|
| MY1984 – early MY1987 | 2.2 L SOHC I5 | 2226 cc | **110 hp (82 kW) / 122 lb-ft (165 Nm)** | [automobile-catalog 1987 5000 S Wagon](https://www.automobile-catalog.com/car/1987/234425/audi_5000_s_wagon.html); [AW-87] standard-features list describes the base 5000 S engine as *"2.22L fuel-injected engine with hydraulic valve lifters, electronic idle control, air shrouded injectors"* |
| **mid-MY1987 – MY1988** | **2.3 L SOHC I5, code NF** | **2309 cc** | **130 hp (97 kW) / 140 lb-ft (190 Nm)** | [BROCHURE-87] |
| MY1989 – MY1991 (as *Audi 100*) | 2.3 L SOHC I5 | 2309 cc | 130 hp, but torque peak quoted at **4500 rpm** | [AW-89] |

[BROCHURE-87] carries the footnote **"\*Delayed Introduction on 130 hp Engine"** against the *5000S Sedan and
Wagon* column heading — i.e. the 2.3 was announced with the MY1987 range but arrived part-way through the
year. [automobile-catalog](https://www.automobile-catalog.com/car/1988/1490105/audi_5000_s.html) independently
dates the 130 hp car as *"since mid-year 1987"*.

> **Build-target consequence.** A MY1987 5000 S Wagon could be a 110 hp 2.2 or a 130 hp 2.3. A **MY1988** car is
> unambiguously the 130 hp 2.3. If the physics stream wants one engine and no asterisk, **build the MY1988 car.**

### 3.2 The 2.3 L NF inline-five — US specification

| Parameter | Value | Source |
|---|---|---|
| Configuration | 5-cylinder, in-line, front-mounted, **longitudinal** | [BROCHURE-87] |
| Bore | **82.5 mm** (3.25 in) | [BROCHURE-87] |
| Stroke | **86.4 mm** (3.40 in) | [BROCHURE-87] |
| Displacement | **2309 cc** (141 cu in) | [BROCHURE-87] |
| Bore/stroke ratio | 0.955 — **undersquare** (long-stroke), which is part of why it is so torquey low down | derived |
| Compression ratio | **10.0 : 1** | [BROCHURE-87], [AW-87], [AW-88], [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |
| Max power (SAE net) | **130 hp / 96.9 kW @ 5600 rpm** | [BROCHURE-87], [AW-88] |
| Max torque | **140 lb-ft / 190 Nm @ 4000 rpm** | [BROCHURE-87], [AW-87], [AW-88] |
| Block | Cast iron | [BROCHURE-87] |
| Head | Aluminium alloy | [BROCHURE-87] |
| Crankshaft | Forged steel, **6 main bearings** | [BROCHURE-87] |
| Valvetrain | **SOHC, belt-driven, hydraulic lifters**, 2 valves/cyl (10 valves total) | [BROCHURE-87] |
| Injection | **Bosch CIS-E = KE-Jetronic**, with electronic idle control | [BROCHURE-87] ("Fuel injection (CIS-E) with electronic idle control"), [AW-88] |
| Euro equivalent | **KE-III Jetronic** | [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |
| Ignition | Electronic (no knock sensor on the S; the CS Turbo gets *"digital electronic with knock sensor"*) | [BROCHURE-87] |
| Emissions | 3-way catalyst + oxygen sensor ([AW-87] says **dual** 3-way catalyst) | [BROCHURE-87], [AW-87] |
| Cooling | Water-cooled, thermostatically controlled **electric** radiator fan | [BROCHURE-87] |
| Lubrication | Double spur-gear pump, crankshaft driven (no oil cooler — the CS Turbo gets one) | [BROCHURE-87] |
| Fuel requirement | Unleaded; **premium recommended for maximum performance** | [BROCHURE-87] |
| Oil capacity | 5.3 US qt with filter | [BROCHURE-87] |
| Battery / alternator | 12 V 63 Ah / 14 V 90 A | [BROCHURE-87] |

**✅ "Bosch KE-Jetronic?" — yes.** CIS-E (*Continuous Injection System – Electronic*) is Bosch's US marketing
name for KE-Jetronic. The brochure says CIS-E, German Wikipedia says KE-III Jetronic for the same NF engine.
Treat them as the same system. It is mechanical-continuous metering with an electro-hydraulic pressure
actuator, **not** a pulsed EFI system — which matters if the physics stream is modelling throttle response:
expect a soft, slightly laggy tip-in and no injector-cut fuel shutoff on overrun of the modern kind.

**⚠ Peak-power rpm conflict.** [AW-87] states **130 hp @ 5500 rpm**; [BROCHURE-87] and [AW-88] both state
**5600 rpm**. Use **5600** — two sources, one of them the factory brochure.

### 3.3 Euro NF figures — the same engine, different test standards

| Standard | Power | Torque | Source |
|---|---|---|---|
| SAE net (US) | 130 hp / 96.9 kW @ 5600 | 140 lb-ft / 190 Nm @ 4000 | [BROCHURE-87] |
| EG 80/1269 | 98 kW (133 PS) | 186 Nm @ 4000 | [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |
| DIN 70020 | 100 kW (136 PS) | 190 Nm | [de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3) |

These are not in conflict — they are three measurement standards applied to one engine, and they bracket each
other within 3 %. **For the simulation use the SAE figures**, because everything else in this document
(weights, gearing, drag, the 0–60 target) is the US car.

### 3.4 Torque curve for simulation

**Only two points on this curve are sourced. Everything else is a modelled interpolation and is labelled as
such — do not present the intermediate values as factory data.**

The two hard anchors are:
1. **190 Nm @ 4000 rpm** — stated peak torque. [BROCHURE-87]
2. **165.3 Nm @ 5600 rpm** — *derived exactly*, not guessed: at the stated power peak,
   `T = P/ω = 96 940 W ÷ (5600 × 2π/60) = 165.3 N·m`. Any curve that does not pass through this point is
   inconsistent with the factory power figure.

Everything between and outside those two points is shaped to a conventional 10-valve SOHC KE-Jetronic
naturally-aspirated five: a long flat plateau from roughly 3000 to 4800 rpm and a gentle, undramatic fall-off.

| rpm | Torque (N·m) | Fraction of peak | Implied power (kW) | Implied power (hp) | Basis |
|---:|---:|---:|---:|---:|---|
| 800 (idle) | 105 | 0.553 | 8.8 | 11.8 | modelled |
| 1000 | 120 | 0.632 | 12.6 | 16.9 | modelled |
| 1500 | 145 | 0.763 | 22.8 | 30.6 | modelled |
| 2000 | 160 | 0.842 | 33.5 | 44.9 | modelled |
| 2500 | 172 | 0.905 | 45.0 | 60.4 | modelled |
| 3000 | 181 | 0.953 | 56.9 | 76.3 | modelled |
| 3500 | 187 | 0.984 | 68.5 | 91.9 | modelled |
| **4000** | **190** | **1.000** | 79.6 | 106.7 | **[BROCHURE-87]** |
| 4500 | 188 | 0.989 | 88.6 | 118.8 | modelled |
| 5000 | 180 | 0.947 | 94.2 | 126.4 | modelled |
| **5600** | **165.3** | **0.870** | **96.9** | **130.0** | **derived from the stated power peak** |
| 6000 | 152 | 0.800 | 95.5 | 128.1 | modelled |
| 6300 | 141 | 0.742 | 93.0 | 124.8 | modelled |

The implied power curve peaks at 5600 rpm at exactly 130 hp and decays gently — self-consistent. If you plot
it and it does anything else, the interpolation is wrong.

> **The placeholder curve currently in `src/spec.ts` is structurally fine but its peak is at the wrong rpm.**
> `ENGINE.peakTorqueRpm` is 4000 (correct) but `peakPowerRpm` is 5500 and `peakPowerKw` 97 — set
> `peakPowerRpm: 5600`. `peakTorqueNm: 184` should be **190**. The normalised shape in `torqueCurve` is close;
> the value at 5500 (0.89) should be ~0.875 to hit 130 hp at 5600.

### 3.5 Transmission — ACTUAL factory gear ratios

**This is the headline finding of this pass.** The ratios below were read directly off the
`Transmission gear ratios` block of [BROCHURE-87] p.16, in the **Front-Wheel Drive (Sedan and Wagon)** column,
at 9× magnification, and they are independently confirmed word-for-word by [AW-87] and [AW-88].

#### 5-speed manual — US 5000 S Sedan and Wagon

| Gear | Ratio | Overall (× final drive 3.89) |
|---|---:|---:|
| 1st | **3.60 : 1** | 14.004 |
| 2nd | **2.13 : 1** | 8.286 |
| 3rd | **1.46 : 1** | 5.679 |
| 4th | **1.07 : 1** | 4.162 |
| 5th | **0.86 : 1** | 3.345 |
| Reverse | **3.50 : 1** | 13.615 |
| **Final drive** | **3.89 : 1** | — |

Sources: [BROCHURE-87] p.16; [AW-87]; [AW-88].

> ### 🔴 The placeholder ratios in `src/spec.ts` are wrong — and wrong in a specific, traceable way
>
> `src/spec.ts` currently carries `gearRatios: [3.6, 2.125, 1.36, 0.967, 0.744]`, `finalDrive: 3.889`.
>
> 1st and 2nd are right. **3rd, 4th and 5th are the *5000CS Turbo's* ratios, not the 5000 S's.** [BROCHURE-87]
> lists 1.36 / 0.97 / 0.73 in the **Turbo** column and 1.46 / 1.07 / 0.86 in the **5000 S** column — somebody
> read across the wrong column. The S has a noticeably *shorter, closer-stacked* top three gears than the Turbo,
> which is exactly what you would expect of the naturally-aspirated car.
>
> Correct to **`[3.600, 2.125, 1.458, 1.071, 0.857]`**, `reverseRatio: 3.50`, `finalDrive: 3.889` (the
> three-decimal gearbox-code values — see the AAZ table below; they agree with the brochure to its precision).
>
> The practical difference is large. Overall ratios, placeholder → correct:
>
> | | placeholder | correct | change |
> |---|---:|---:|---:|
> | 3rd | 5.289 | **5.671** | 7.2 % shorter |
> | 4th | 3.761 | **4.165** | 10.7 % shorter |
> | 5th | 2.893 | **3.333** | **15.2 % shorter** |
>
> Top gear is the big one: the placeholder gives 40.1 km/h per 1000 rpm, the real car **34.7**. On the
> placeholder gearing the engine would be loafing at 2500 rpm at 100 km/h and would never reach its claimed
> top speed; on the real gearing it sits at ~2880 rpm and tops out just past the power peak, exactly as the
> factory intended. The car should feel appreciably busier and more willing in the mid-gears than the
> placeholder suggests.

**Gearbox identification — and the exact, unrounded ratios.** The brochure rounds to two decimals. A German
owner-forum gearbox-code table gives the same box to three, and names it:

| | Type | Final drive | 1st | 2nd | 3rd | 4th | 5th | Fitment |
|---|---|---:|---:|---:|---:|---:|---:|---|
| **AAZ** | **016** | **3.889** | **3.600** | **2.125** | **1.458** | **1.071** | **0.857** | **"NF engine until 12/1987"** |
| AMK | 012 | 3.889 | 3.545 | 2.105 | 1.428 | 1.029 | 0.837 | NF 1986–1990 |
| AXG | 012 | — | — | — | — | — | — | NF after 12/1987 |
| 5N / AGD | 016 | 4.111 | 3.600 | 2.125 | 1.360 | 0.967 | 0.729 | KZ engine |

Source: [audifieber.de gearbox-code thread](https://www.audifieber.de/threads/welches-getriebe-passt-in-den-audi-100-typ-44-nf.179834/).
Corroborated by the 016 code table at
[classic-audi.co.uk](https://www.classic-audi.co.uk/forum/viewtopic.php?t=14668) (AAZ: 3.89 final, 3.60 / 2.13
/ 1.46 / 1.07 / 0.86, reverse 3.50), which also lists the alternative sets **3K** (3.89 final, 1.36 / 0.97 /
0.78) and **5N** (4.11 final, 1.36 / 0.97 / 0.73) — the latter being where the stray 1.36 / 0.97 figures
circulating online come from. The Audi 100 C3 workshop manual has a section headed *"5 speed gearbox 016 and
012"*, confirming both designs were used on this car
([audimanual.ru index](https://www.audimanual.ru/en/100/C3)).

> **⚠ Note the December 1987 change.** European NF cars moved from the **016/AAZ** to the **012/AXG** around
> 12/1987, and the 012 family carries the shorter 3.545 / 2.105 / 1.428 / 1.029 / 0.837 set — which is
> recognisably the MY1989 US ratio set. **US literature still quotes the 016/AAZ set for MY1988**
> ([AW-88]), so a US MY1988 5000 S should be built on 3.60 / 2.13 / 1.46 / 1.07 / 0.86 with a 3.89 final
> drive. But be aware the two boxes overlap in time and the 012 and 016 are not interchangeable designs.
>
> **For `src/spec.ts` use the three-decimal figures: `[3.600, 2.125, 1.458, 1.071, 0.857]`, final `3.889`.**
> They agree with the brochure to its stated precision and are more accurate for simulation.

#### 3-speed automatic — US 5000 S Sedan and Wagon

| Gear | Ratio | Overall (× final drive 3.25) |
|---|---:|---:|
| 1st | **2.71 : 1** | 8.808 |
| 2nd | **1.50 : 1** | 4.875 |
| 3rd | **1.00 : 1** | 3.250 |
| 4th / 5th | — (none: it is a **three**-speed) | — |
| Reverse | **2.43 : 1** | 7.898 |
| **Final drive** | **3.25 : 1** | — |

Source: [BROCHURE-87] p.16 — the 4th and 5th rows in the Automatic column are dashes, so the US 5000 S
automatic is definitively a **3-speed**, not a 4-speed.

**Type number: 087.** The US 5000 S's 3-speed automatic is the VAG **087**
([AudiWorld thread "1986 Audi 5000 S 087 Transmission Woes"](https://www.audiworld.com/forums/audi-5000-200-v8-discussion-27/1986-audi-5000-s-087-transmission-woes-2202685/));
087 / 089 / 090 are one family, and rebuild kits are sold as *"VW-087 … Fits Audi 5000 1983-1988"*
([cobratransmission](https://cobratransmission.com/vw-087-089-090-automatic-transmission-overhaul-repair-with-final-drive-seals-fits-volkswagen-audi-porsche/)).
The 2.71 / 1.50 / 1.00 / R 2.43 ratio set is independently confirmed for the Type 44 200 automatic at
[AudiWorld](https://www.audiworld.com/forums/audi-100-a6-c4-platform-24/gear-ratios;-transmission-data-2131145/).

**⚠ Automatic final-drive conflict — resolved.** [AW-87] and [AW-88] both print **3.46:1** for the 5000 S
automatic's final drive, while [BROCHURE-87] clearly reads **3.25:1** (verified at 9× on the scan) and gives
3.25 for the CS Turbo automatic as well. Two things break the tie for **3.25**:
- [AW-89] gives the MY1989 Audi 100 automatic as 2.71 / 1.50 / 1.00, reverse 2.43, **final drive 3.25** —
  the same box, same final drive, one model year later.
- 3.25 is self-consistent with the factory's own top-speed claim: 123 mph (198 km/h) in top gear works out at
  ≈5550 rpm on 185/70 R14, i.e. essentially *at* the 5600 rpm power peak. With 3.46 the engine would have to
  be spinning ≈5910 rpm, past the power peak, to reach the claimed speed.

A third set of figures muddies it further: the 087 forum thread cites **3.08** and **3.45** as the two known
final drives across the 087 family, and an AudiWorld data sheet gives **3.08** for the Type 44 *200*
automatic ([087 thread](https://www.audiworld.com/forums/audi-5000-200-v8-discussion-27/1986-audi-5000-s-087-transmission-woes-2202685/),
[200 data sheet](https://www.audiworld.com/forums/audi-100-a6-c4-platform-24/gear-ratios;-transmission-data-2131145/)).
No source outside Audi of America's own literature confirms 3.25.

**Use 3.25 — it is the factory brochure's figure, it is repeated for MY1989, and it is the only value
consistent with the factory's own 123 mph automatic top-speed claim. Record 3.46 / 3.45 / 3.08 as disputed
alternatives, and treat the automatic's final drive as the least certain number in §3.**

#### For contrast — the facelift car is geared differently again

[AW-89] gives the MY1989 US Audi 100 manual as **3.54 / 2.10 / 1.43 / 1.03 / 0.84, reverse 3.50, final drive
3.98**. Do **not** mix these with the 5000 S numbers: they belong to the post-January-1988 car (see §5.6).

#### Other driveline figures

| Parameter | Value | Source |
|---|---|---|
| Clutch | Self-adjusting **hydraulic** clutch | [AW-87] standard features |
| Road speed per 1000 rpm in 5th | **34.7 km/h / 21.6 mph** (on 185/70 R14, 615 mm rolling dia. per §1.5) | derived |
| Engine rpm at 100 km/h in 5th | **≈2880 rpm** | derived |
| Engine rpm at 60 mph (96.6 km/h) in 5th | **≈2780 rpm** | derived |

### 3.6 Drivetrain layout, and where quattro differs

- **5000 S Sedan and Wagon: front-wheel drive.** [BROCHURE-87] heads the column *"Front-Wheel Drive (Sedan and
  Wagon)"*. Engine **front-mounted, longitudinal**, sitting ahead of the front-axle line — the Audi
  architecture that makes these cars nose-heavy (see §1.4's weight-distribution warning, which still stands).
- **MY1988 added a "5000 S quattro"** — the 2.3 NF with all-wheel drive. Critically for anyone tempted to
  reuse ratios: [AW-88] gives the 5000 S quattro the **same** 3.60 / 2.13 / 1.46 / 1.07 / 0.86 and 3.89 final
  drive as the FWD S. Kerb weight rises to **3307 lb** (vs 2954 lb for the FWD wagon).
- **What changes on a quattro** (the car you are *not* building):
  - **Rear suspension becomes fully independent** — *"independent four joint trapezoidal arms, coil spring
    struts"* — replacing the FWD car's torsion-crank axle. [BROCHURE-87], [AW-88]
  - Rear track and ground clearance shift slightly. [AW-88]
  - On the CS Turbo quattro, ABS is standard and 7J×15 forged wheels are optional. [BROCHURE-87], [AW-87]
  - **Bolt pattern changes from 4 × 108 to 5 × 112.** ([AudiWorld](https://www.audiworld.com/forums/audi-5000-200-v8-discussion-27/quattro-wheel-bolt-pattern-2180462/))
  - **Centre differential, two generations.** *Quattro I* (to 1987): open centre diff, **manually lockable**
    from a console switch, plus a manually lockable open rear diff; ABS is disabled when the locks are
    engaged. *Quattro II* (1988 on): **Torsen Type 1 centre differential**, nominally 50/50, automatically
    biasing up to 80 % to either axle; the **rear diff stays open and manually lockable**; the front diff is
    always open. ([awdwiki](https://www.awdwiki.com/en/quattro+evolutions)) The Torsen centre unit debuted on
    the Audi 80 quattro in autumn 1986.
    ([Audi technology portal](https://www.audi-technology-portal.de/en/drivetrain/quattro_en/torsen-differential))
    **So: Torsen in the centre, never in the rear, on a C3.**
  - The grille gains a lowercase *quattro* script (§2.1).
- **`TRANSMISSION.driveType: 'fwd'` in `src/spec.ts` is correct.** `torqueSplitFront: 0.5` is inert for a FWD
  car; leave it.

### 3.7 Suspension

| Axle | Design | Source |
|---|---|---|
| **Front** | **Independent MacPherson struts with negative roll radius** (negative scrub radius), coil springs, **anti-roll bar** | [BROCHURE-87], [AW-87], [AW-88] |
| **Front anti-roll bar** | **26 mm** per US literature — **but see the conflict below; 23 mm is better supported for the base car** | [AW-88] — *"MacPherson struts with negative roll radius, 26 mm stabilizer bar, coil springs"* |
| **Rear (FWD S)** | **Torsion crank axle** (torsion-beam / *Verbundlenkerachse*), **Panhard rod**, **integral stabiliser**, coil-spring struts | [BROCHURE-87], [AW-87], [AW-88] |
| **Rear (quattro)** | Independent four-joint trapezoidal arms, coil-spring struts | [BROCHURE-87], [AW-88] |
| Body | Unitised construction, **fully galvanised sheet metal**, multi-step rust protection | [BROCHURE-87], [AW-87] |

Two things worth understanding before modelling or simulating this:

- **"Negative roll radius"** is Audi's period term for a *negative scrub radius* front geometry. Under
  asymmetric braking (split-µ, or a front tyre deflating) the steering self-corrects instead of pulling. It
  also means the steering-axis inclination is high and the kingpin offset is on the inboard side of the tyre
  contact patch. For a suspension model this mostly shows up as a stabilising torque under differential
  braking.
**⚠ Front anti-roll bar diameter — genuine conflict, unresolved.**

| Figure | Evidence |
|---|---|
| **23 mm** | OE-supplier **bush** catalogues, which are cut to the bar they fit: TOPRAN 103 618 *"front axle left and right, 23 mm stabiliser diameter"*; FAG 819 0049 10 *"front axle, 23 mm inner diameter"*; FEBI BILSTEIN 171159 *"23.2 mm"*. Catalogue indexes: [autoteiledirekt](https://www.autoteiledirekt.de/autoersatzteil/audi/stabigummis/100-44-44q-c3.html), [pkwteile](https://www.pkwteile.de/ersatzteil/stabigummis/audi/100-44-44q-c3). A 21 mm bar also exists on some C3 variants |
| **26 mm** | [AW-88] for the US 5000 S. Audi part **441411309F** is sold as *"Audi 100 200 C3 Typ 44 Stabilisator … Vorderachse 26mm"* ([happyparts](https://www.happyparts.de/karosserie-fahrwerk/achsteile/112799/audi-100-200-c3-typ-44-stabilisator-441411309f-vorderachse-26mm-achse-querstrebe)), and 26 mm bush kits are sold specifically for *"Audi 100 200 C3 / V8 D11"* ([parts33](https://parts33.com/products/verkline-stabilisator-buchsen-26mm-audi-100-200-c3-v8-d11-vorderachse-pu)). The German owner wiki says the thicker bar belongs to *the Sport, 220V and the V8* ([selbst-doku](https://audi100.selbst-doku.de/Main/UebersichtAllerFahrwerkskomponenten)) |

So the parts trade says the base C3 runs **23 mm** and that 26 mm is the Sport/200/V8 bar, while Audi of
America's own MY1988 press specification says the 5000 S has **26 mm**. Both readings are defensible — the US
car may well have had the thicker bar. **Model it as 23 mm unless the roll stiffness needs to be tuned up,
and label whichever you pick.**

- **"Integral stabiliser"** means the rear has **no separate anti-roll bar**. The torsion-crank beam's own
  torsional stiffness *is* the rear roll stiffness. So: front bar 26 mm, rear bar none. Combined with a
  nose-heavy FWD layout, expect strong understeer balance and a rear axle that lifts an inside wheel readily.
  The **Panhard rod** is what locates the beam laterally — it introduces a small amount of lateral axle
  movement in roll, which a good tyre/suspension model should not ignore.
  The absence of a discrete rear bar is independently confirmed by an owner thread in which one is
  *retrofitted* to a FWD Typ 44 (the retrofitted tube measures 26 mm):
  [group44.de](https://forum.group44.de/viewtopic.php?f=22&t=159631). The **quattro**, with its independent
  rear end, does get a discrete rear bar.

**⚠ Spring rates: NOT FOUND.** No factory or aftermarket published spring rate (N/mm or lb/in) for the C3
100/5000, front or rear, was located in this pass. **Do not invent one.** If the physics stream needs rates,
derive them from the sprung mass and a chosen ride frequency and label the result as a tuning parameter, the
same way `BODY.weightDistFront` is labelled.

**⚠ Damper rates: NOT FOUND.** Same. Bilstein's own vehicle search returns *"keine Ergebnisse"* for
replacement springs on the 2.3 E
([bilstein-fahrwerkshop](https://www.bilstein-fahrwerkshop.de/fahrzeugsuche/audi/100-44-44q-c3/2.3-e/100-kw-136-ps/serien-ersatzfedern/)),
and aftermarket coilover listings quote ride-height ranges only, never rates.

> **One unexhausted lead.** The factory **Audi 200 (Typ 44) chassis Reparaturleitfaden** is online as a PDF
> at <https://www.audi-klassik.de/docs/replf/Fahrwerk-Audi200.pdf>. It exceeded the automated fetch size limit
> in this pass, but it is the most likely home for factory spring and anti-roll-bar data. **Download it by
> hand if the physics stream ever genuinely needs real rates.**

### 3.8 Steering

| Parameter | Value | Source |
|---|---|---|
| Type | **Rack and pinion, power assisted** | [BROCHURE-87] |
| Steering ratio | **18.7 : 1** | [BROCHURE-87], [AW-87], [AW-88] |
| **Turns, lock to lock** | **3.5** | [BROCHURE-87], [AW-87], [AW-88] |
| Turning circle, curb-to-curb | 10.42 m / 34.2 ft | [BROCHURE-87] |

> **`src/spec.ts` has `turnsLockToLock: 3.3`. The factory figure is 3.5.**

**⚠ Assist-type conflict.** [BROCHURE-87] says simply *"Rack and pinion (power-assisted)"*. [AW-87] and
[AW-88] both describe it as *"Rack & pinion, servotronic — variable power assist"*. Servotronic
(speed-sensitive assist) on a 1987 5000 S is plausible but not corroborated by the brochure, which would
almost certainly have advertised it. **Model it as conventional constant-rate hydraulic assist and treat
"servotronic" as unverified.** The comment in `src/spec.ts` ("engine-speed-sensitive power assist") is a third
variant and is also unsourced.

Geometry figures — **caster, camber, kingpin inclination, toe: NOT FOUND** in any accessible source. The
`casterDeg: 2.0` and `ackermann: 0.82` in `src/spec.ts` are unsourced tuning values; keep them labelled as such.

### 3.9 Brakes

| Parameter | Value | Source |
|---|---|---|
| Circuit | **Hydraulic, power-assisted, dual *diagonal* circuit**, self-adjusting, with rear pressure regulator | [BROCHURE-87] |
| **Front** | **Ventilated, 256 mm × 22 mm** (min. 20 mm, hat height 46–46.5 mm, 4 holes on 108 mm, 68 mm centring dia.) | [Brembo 09.5033.10](https://www.bremboparts.com/europe/en/catalogue/disc/09-5033-10), listed as the front disc for *"AUDI 100 C3 Saloon 2.3 E (100 kW), 10/86–11/90"* ([Brembo application](https://www.bremboparts.com/europe/en/catalogue/audi-100-c3-saloon-443-444-2-3-e/000001319-1)); [Zimmermann 500079](https://www.zimmermann-bremsentechnik.eu/zimmermann-brake-disc-for-audi-100-44-44q-c3-front-500079.html?language=en). US literature rounds it to **10.1 in** — [AW-87], [AW-88], [AW-89] |
| **Rear** | **Solid, 245 mm × 10 mm** (min. 8 mm, 4 holes on 108 mm, 68 mm centring dia.) | [Brembo 08.5510.10](https://www.bremboparts.com/europe/en/catalogue/disc/08-5510-10); [Zimmermann 100.1205.20](https://www.zimmermann-bremsentechnik.eu/zimmermann-brake-disc-for-audi-100-44-44q-c3-rear-500256.html?language=en); genuine Audi part sold as "245×10 4/108" ([ahw-shop](https://shop.ahw-shop.de/audi-100/80-bremsscheiben-hinten-original-scheibenbremsen-245x10-4/108)). US literature rounds it to **9.6 in** — [AW-88], [AW-89] |
| Parking brake | Mechanical, to the rear wheels | [BROCHURE-87] |
| ABS | **Optional** on the 5000 S; standard on the CS Turbo quattro | [AW-87], [AW-88], [BROCHURE-87] |
| Linings | Asbestos-free | [AW-87] |
| *(for contrast)* CS Turbo front | Vented **11.0 in = 280 mm** ([AW-88] says 10.9 in) | [BROCHURE-87], [AW-87], [AW-88] |
| *(for contrast)* CS Turbo rear | Solid **9.4 in = 239 mm** | [BROCHURE-87] |

> ### 🔴 `src/spec.ts` has the Turbo's front brake on the 5000 S
> `BRAKES.discDiameterFront: 0.276` is ~10.9 in — the **CS Turbo** disc. The 5000 S runs **10.1 in ≈ 0.256 m**.
> `discDiameterRear: 0.245` is right (9.6 in = 0.2438 m); 0.244 is marginally more accurate.
> This matters visually as well as physically: a 256 mm disc inside a 14-inch wheel shows a lot more gap
> between disc edge and rim than a 280 mm one.

**⚠ Rear-disc diameter conflict.** [BROCHURE-87] quotes **9.4 in** (= 238.8 mm) for the *CS Turbo* rear.
**No parts catalogue anywhere lists a 239 mm rear disc for this car** — every supplier gives 245 mm on both
FWD and quattro C3s. [AW-88]/[AW-89]'s 9.6 in = 243.8 mm rounds to the same 245 mm disc. **Use 245 mm.**
Record 9.4 in as a factory-literature figure that disagrees with the whole aftermarket.

**Caliper and disc families across the C3**, for context (German owner wiki,
[selbst-doku](https://audi100.selbst-doku.de/Main/Kurz-%C3%9Cbersicht%C3%9CberDieVerbautenBremss%C3%A4ttel)):

| Caliper | Period | Front disc | Applies to |
|---|---|---|---|
| **Girling 54** | from Typ 44 launch, 1983 | **256 × 22 vented** (or 256 × 10 solid on low-spec 4-cyl) | **the 4-bolt cars — including your 5000 S** |
| Girling 60 | from ~03/1986 | 276 × 25 vented | 5-bolt (quattro/turbo) chassis, to the facelift |
| ATE 57 | after the 1/88 facelift | 276 × 25 vented | 5-bolt |
| ATE (4-bolt) | post-facelift | same as Girling 54 | 4-bolt |

Brembo dates the 5-bolt front change precisely: **280 × 22** up to VIN 44-G-073362, **276 × 25** from
44-G-073363 ([09.4964.10](https://www.bremboparts.com/europe/en/catalogue/audi-100-c3-saloon-443-444-2-2-e-quattro/000004998-1),
[09.5734.10](https://www.bremboparts.com/europe/en/catalogue/disc/09-5734-10)). That explains the
brochure's "11.0 in" and [AW-88]'s "10.9 in" for the CS Turbo — they are the two successive discs, not a
contradiction.

**The audi-sport.net "BRAKE DISC SIZE GUIDE LIST (OEM FIT)" thread is a dead end** — it covers the A3/S3 8P
PR-code system and contains nothing on the Type 44.

### 3.10 Period performance figures — physics validation targets

These are **Audi of America's own published figures**, read off [BROCHURE-87] p.17. They are manufacturer
claims, not independent instrumented tests — but they are the only numbers that are unambiguously for *this*
body, *this* engine and *this* gearbox, and the brochure quotes the **Wagon separately from the Sedan**, which
almost no other source does.

| Metric | **Wagon, 5-speed manual** | Wagon, 3-speed auto | *(Sedan, manual)* | *(Sedan, auto)* |
|---|---:|---:|---:|---:|
| **0–60 mph** | **9.9 sec** | 11.7 sec | 9.3 sec | 11.1 sec |
| 0–50 mph | **7.3 sec** | 8.2 sec | 6.9 sec | 7.8 sec |
| **Top speed** | **124 mph (200 km/h)** | 122 mph (196 km/h) | 125 mph | 123 mph |
| EPA city/highway | 18 / 24 mpg | 19 / 22 mpg | 18 / 24 | 19 / 23 |

Source for the whole table: [BROCHURE-87] p.17. The wagon figures are corroborated verbatim by [AW-88].
EPA figures also at [fueleconomy.gov](https://fueleconomy.gov/feg/noframes/3541.shtml).

**Independent instrumented tests — what exists, and what does not.** No independent test of a **FWD** 5000 S
or Euro 100 2.3 was located. The closest real measurements, all attributed via
[0-60specs.com](https://www.0-60specs.com/audi/5000-0-60-times):

| Car | 0–60 mph | ¼ mile | Tester |
|---|---:|---|---|
| **1987 Audi 5000 S *quattro* sedan** (same 130 hp 2.3, same 1.46/1.07/0.86 ratios, ~350 lb heavier) | **9.70 s** | **17.00 s @ 81.0 mph** | **Car and Driver** |
| 1986 Audi 5000 CS quattro sedan (turbo) | 9.50 s | 16.50 s @ 84.0 mph | MotorWeek |
| 1983 Audi 5000 S sedan (2.1, FWD) | 10.80 s | 17.80 s @ 77.0 mph | Car and Driver |

**Read it this way:** Car and Driver measured **9.70 s** for the heavier all-wheel-drive version of the same
engine and gearbox, against a factory claim of 9.3 s for the lighter FWD *sedan*. So the factory numbers are
in the right area but mildly optimistic, and a FWD wagon at **9.9 s claimed** should realistically land
somewhere around **9.7–10.5 s**. If the simulation returns a figure in that band, it is right.

⚠ **Do not use automobile-catalog.com** as a road-test source — its 5000 S pages are paywalled (HTTP 402) and
its performance figures are site-computed simulations, not measurements. ⚠ Also discount a syndicated UPI
review of 28 Oct 1986 claiming the 110 hp 2.2 5000S *"reaches 60 mph in just under eight seconds"*
([upi.com](https://www.upi.com/Archives/1986/10/28/Audi-5000S-A-model-model/6684530859600/)) — that is not a
measured figure and is far out of line with everything else.

**No skidpad, braking-distance or slalom figures were found for any C3 5000/100 in any accessible source.**

**Physics cross-check — the numbers are at least self-consistent.** Two independent checks were run against
the ratios and the aero data in §1:

1. **Top speed.** In 5th (0.857 × 3.889 = 3.333 overall) on a 615 mm-diameter tyre (§1.5), 200 km/h
   corresponds to **≈5770 rpm**, where the modelled curve gives ≈96 kW. Drag at 200 km/h with Cd 0.34 and a
   frontal area of 2.10 m² is ≈73.5 kW, rolling resistance ≈9.5 kW, total ≈83 kW at the wheels; with 90 %
   driveline efficiency the engine supplies ≈86 kW. **200 km/h is achievable with a little in hand**, and it
   is reached a shade past the 5600 rpm power peak. The factory claim is physically honest, and it
   independently validates the 0.857 / 3.889 gearing — gearing for maximum speed just beyond the power peak
   is exactly the period convention. *(This check fails on the placeholder gearing, which is one more way to
   see that the placeholder is wrong.)*
2. **First gear is traction-limited, not torque-limited.** 190 N·m × 14.004 × 0.9 ÷ 0.3073 m ≈ **7790 N** of
   tractive effort, i.e. ≈5.6 m/s² on a 1400 kg car — but a nose-heavy FWD car with ~60 % front weight on
   period 185/70 rubber can only put down ≈0.5 g (≈7000 N, ≈5.0 m/s²). If the sim spins the wheels off the
   line in 1st, that is *correct behaviour*, not a bug.

### 3.11 Firing order and the acoustic consequence

**Firing order: 1-2-4-5-3.** [BROCHURE-87] states it explicitly in the *Electrical System* block, for both the
5000 S and the CS Turbo. (`ENGINE.firingOrder: [1, 2, 4, 5, 3]` in `src/spec.ts` is therefore **correct and now
sourced** — it was previously uncited.)

What the audio stream needs to know:

- **Firing interval: 720° ÷ 5 = 144° of crankshaft rotation.** Evenly spaced — the Audi five is *not* an
  unevenly-fired engine. `firingIntervalDeg: 144` is correct.
- **The dominant exhaust order is 2.5, a *half* order.** Five firings per two crank revolutions = 2.5 firings
  per revolution. This is the whole acoustic story. Four- and six-cylinder engines fire at 2.0 and 3.0 orders
  — whole numbers, so the exhaust note repeats every crank revolution and sounds "even". At 2.5 orders the
  pattern only repeats every **two** revolutions, and the spectrum carries strong content at half-integer
  orders (2.5, 5.0, 7.5) plus an audible **0.5-order** component. That half-order content is heard as the
  characteristic offbeat warble / "five-cylinder burble".
- **Firing frequencies to synthesise:**

  | Engine speed | Firing frequency (2.5 × rpm/60) | Half-order component (0.5 × rpm/60) |
  |---:|---:|---:|
  | 820 rpm (idle) | 34.2 Hz | 6.8 Hz |
  | 2000 rpm | 83.3 Hz | 16.7 Hz |
  | 2880 rpm (100 km/h in 5th) | 120.0 Hz | 24.0 Hz |
  | 4000 rpm (torque peak) | 166.7 Hz | 33.3 Hz |
  | 5600 rpm (power peak) | 233.3 Hz | 46.7 Hz |
  | 6300 rpm | 262.5 Hz | 52.5 Hz |

- **Cylinder 1 is at the front** of a longitudinally-mounted engine, and the 1-2-4-5-3 order means consecutive
  firings jump back and forth along the block rather than marching down it. In a physically-modelled exhaust
  this produces uneven pulse spacing *arriving at the collector* even though the crank-angle spacing is even,
  because the runner lengths differ — a second-order effect, but it is part of why a five sounds "wrong" in a
  pleasing way.
- A naturally-aspirated 10-valve with a single silencer is **much** softer than the turbocharged five people
  usually mean when they say "Audi five-cylinder". Do not synthesise a Sport Quattro. This is a family estate.

### 3.12 What could not be found — say so rather than guess

| Item | Status |
|---|---|
| **Tachometer redline** | **≈6500 rpm, measured — not factory-stated.** [BROCHURE-87] quotes no redline. Measured off the MY1988 NA cluster photograph (§5.2): the scale runs 1000–7000 rpm, majors every 1000, minors every 250, and the hatched red band begins at **6500 rpm ± 150** and runs to the end of the scale. For contrast, a C3 **diesel** cluster starts its red at 5300 ([group44.de](https://forum.group44.de/viewtopic.php?p=1218604)) and a 1988 5000CS **Turbo** (MC engine) is reported at 6400 ([Audi Club NA](https://audiclubna.org/find-of-the-day-1988-audi-5000cs-turbo-quattro-sedan-5-speed/)) — neither is the NF. |
| **Rev-limiter / fuel cut rpm** | **LOW CONFIDENCE — 6800 rpm.** A single German owner-forum thread on the NG/NF limiter states *"Also der Begrenzer reicht bis 6800 /min"* and confirms the limiter lives in the ECU, not the distributor; the same thread reports ignition-advance rollback on an NF from ~6100–6200 rpm and power falling away from ~5800 ([audifieber.de](https://www.audifieber.de/threads/drehzahlbegrenzer-im-ng-nf-ueberlisten.38434/)). One forum assertion, no factory confirmation. `src/spec.ts`'s `redlineRpm: 6300` / `limiterRpm: 6500` should probably become **6500 / 6800**, both labelled as unverified. |
| **Spring rates, damper rates** | **NOT FOUND** (§3.7) |
| **Caster / camber / KPI / toe** | **NOT FOUND** (§3.8) |
| **Engine dry weight** | **NOT FOUND** |
| **Front/rear weight distribution** | **NOT FOUND** — see the existing warning in §1.4, which still stands. Note that *maximum permissible axle loads* (e.g. 1070 kg front / 950 kg rear for a Typ 44 saloon, [autewo](https://www.autewo.de/ersatzteile/autewo-performance-parts/nach-hersteller/k.a.w.-fahrwerke/audi-100200-typ-44/)) are a **different quantity** and must not be substituted for a kerb-weight split |
| **Independent period road-test data** | **NOT FOUND** (§3.10) |
| **Automatic gearbox type number** (087 / 089 / other) | **NOT FOUND** — the box is confirmed as a 3-speed by [BROCHURE-87] but its type number was not established |
| **Idle speed** | **NOT FOUND** — `idleRpm: 820` in `src/spec.ts` is unsourced |
| **Clutch torque capacity, driveline inertias** | **NOT FOUND** — these are and must remain tuning parameters |

---

## 4. Wheels

### 4.1 What the factory fitted

| Fitment | Wheel | Tyre | Source |
|---|---|---|---|
| **5000 S Sedan and Wagon (standard, MY1987–88)** | **6J × 14 light alloy** — factory copy calls it a *"6J aerodynamic alloy wheel"* | **185/70 HR14** steel-belted radial | [BROCHURE-87], [AW-87], [AW-88] |
| 5000 CS Turbo / Turbo quattro | 6J × 15 light alloy (7J × 15 forged optional on Turbo quattro) — factory copy calls this one *"aero-spoke style"* | 205/60 VR15 | [BROCHURE-87], [AW-87] |
| MY1989 US Audi 100 **base (100E)** | **5.5J × 14 steel** with hubcap | 185/70 R14 | [AW-89] |
| MY1989 US Audi 100 (standard) | 6J × 15 light alloy | 205/60 R15 | [AW-89] |

**⚠ Tyre speed-rating conflict, inside one source.** [AW-87]'s *specification table* says **185/70 HR 14** (matching [BROCHURE-87]); [AW-87]'s *standard-equipment list* on the same page says **185/70 SR 14**. Use **HR** — it is the brochure's figure and it matches the car's 124 mph claimed top speed (an S-rated tyre is only good for 112 mph).

### 4.2 Hub interface

| Parameter | Value | Source |
|---|---|---|
| **Bolt pattern** | **4 × 108 mm** (quoted by US wheel dealers as "4 × 4.25 in") | [StockWheels 58643](https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim), [awrswheels](https://awrswheels.com/product/factory-oem-14-wheel-fits-1985-1987-audi-4000-443601025ay7y-2/) |
| Offset (ET) | **45 mm** | [StockWheels](https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim), [awrswheels](https://awrswheels.com/product/factory-oem-14-wheel-fits-1985-1987-audi-4000-443601025ay7y-2/) |
| Studs | **4** | as above |
| Brake-disc centring diameter on the hub | 68 mm | [Brembo 09.5033.10](https://www.bremboparts.com/europe/en/catalogue/disc/09-5033-10) |

> **The 4-bolt/5-bolt split is a hard model-year-and-drivetrain boundary.** FWD 5000s are **4 × 108**; the
> 1986–88 5000 **quattro** is **5 × 112**.
> ([AudiWorld forum](https://www.audiworld.com/forums/audi-5000-200-v8-discussion-27/quattro-wheel-bolt-pattern-2180462/))
> You are building a FWD wagon: **four wheel bolts, not five.** Getting this wrong is instantly visible.

### 4.3 The 14-inch "bottlecap" alloy — modelling description

This is the wheel on the MY1987 5000 S Wagon in the factory photography ([BROCHURE-87] p.4–5) and the one
your reference photograph shows. OEM part number **443601025 / 443601025A / 443601025AY7Y**; the US
reconditioned-wheel trade indexes it as **Hollander 58643**, fitting *Audi 5000 1984–1988* (and Audi 4000
1985–87).
([StockWheels](https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim),
[awrswheels](https://awrswheels.com/product/factory-oem-14-wheel-fits-1985-1987-audi-4000-443601025ay7y-2/))

**Overall form.** It is a *full-face disc*, not a spoked wheel. Read as a section from the centre outwards:

1. **Centre cap.** A circular cap, slightly domed, covering the bolt circle entirely — you do **not** see the
   four wheel bolts on a complete car. Diameter is roughly **40–45 % of the face diameter**. It carries the
   four rings, small, in the middle, in a dark/contrasting finish on a body-matched cap face.
   *(observed: face-on-ish rear wheel of a US 5000 S Wagon, `germancarsforsaleblog.com/wp-content/uploads/2017/05/442.jpeg`,
   and the [BROCHURE-87] p.4 wheel crop)*
   **Note the bare-wheel photos look different**: dealer photos of the wheel *without* its cap show a recessed
   centre pocket with the four bolts exposed and only a tiny hub plug. Don't model that state.
2. **A broad, smooth, gently domed disc face** running out from the cap. It is a continuous surface — no
   spokes, no windows — which is exactly why the wheel is nicknamed a "bottlecap"/crown cap.
3. **A ring of slots near the outer edge.** Each slot is a **stadium / rounded-rectangle** shape, distinctly
   **wider (circumferentially) than it is tall (radially)** — roughly **2 : 1** — with generous corner radii.
   They sit at about **0.72–0.86 of the face radius**, leaving narrow radial webs between them.
4. **A plain outer rim flange band** outboard of the slot ring, then the tyre bead.

**Finish.** Silver/machined face. Factory description is simply "light alloy"; the reconditioned-wheel trade
describes the finish as "Machined & Tan" and "Silver". The slot recesses read dark because you are seeing
through to the brake and the wheel's inner barrel, not because they are painted.
([StockWheels](https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim))

#### Slot count — the one number that needed work

| Source | Count |
|---|---|
| US wheel-dealer catalogue description for the exact part number | **"9 Slot"** — [StockWheels](https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim) |
| **Measured off a period photograph (this pass)** | **12** |

**How the 12 was arrived at, so you can check the working.** The rear wheel of the US 5000 S Wagon in
`germancarsforsaleblog.com/wp-content/uploads/2017/05/442.jpeg` was cropped, the wheel face fitted as an
ellipse (semi-axes 287 × 452 px, i.e. a ~50° oblique view), and slot centres measured in *true* wheel angle
after undoing the foreshortening. The three best-resolved adjacent slots gave spacings of **30.3° and 29.8°**
— i.e. **360 / 30 = 12**. An independent radial-minimum scan around the same annulus found 9 clean slots plus
one 47° gap (≈1 missed slot) and one 86° gap (≈2 missed slots) = **12**. Two methods, same answer.

**So: model 12 slots at 30° spacing.** The "9 Slot" catalogue name is a Hollander-style trade description and
those are routinely approximate. **[VERIFY]** against a straight face-on photograph before committing the
geometry — no such photograph above 400 × 400 px was found in this pass, and that is the weakest link in §4.

**Also worth knowing:** there was more than one 14-inch alloy on these cars. A verified **1985 US 5000 S
Wagon** on Wikimedia
(<https://upload.wikimedia.org/wikipedia/commons/a/ab/1985_Audi_5000S_Wagon_in_Stone_Grey_Metallic%2C_front_right.jpg>)
wears a **multi-spoke** 14-inch alloy, not the bottlecap. The bottlecap is what the **MY1987 brochure car**
and the project's own reference photograph wear, so the bottlecap is correct for the build — but do not assume
every period 5000 S photo shows the right wheel.

### 4.4 Steel wheel and hubcap

**There was no steel-wheel US 5000 S.** [AW-87] and [AW-88] list *"6J aerodynamic alloy wheels"* as **standard
equipment** on the 5000 S Sedan and Wagon — alloys were not an option, they were the fitment. A steel wheel
with a full plastic hubcap appears in the US range only later, on the MY1989 **Audi 100E** base model
(5.5J × 14 steel, 185/70 R14). [AW-89]

For completeness, because European base 100s did run steels: the period Audi 14-inch full wheel cover is part
**443601147 / 443601147A / 443601147B** (and the shared **893601147** across Typ 81/85/89 and Typ 44), a
full-face plastic disc.
([autewo](https://www.autewo.de/audi-80/90-typ-81/85/89/100-typ44-radkappen-14-zoll-443601147a),
[audi-klaus.at](https://audi-klaus.at/shop/produkt/audi-100-200-80-zierdeckel-radkappen-14-zoll-443601147a-b-855601147a/))

**⚠ Aero disc / smooth wheel cover: NOT FOUND.** The C3's aerodynamic programme is often described as
including flush wheel covers, but **no source was found documenting a smooth "aero disc" cover as a factory
option on the US 5000 S or the Euro 100 C3.** The "aerodynamic" adjective in the US brochure attaches to the
*alloy wheel itself* (its closed, near-flush face is the aero feature), not to a separate disc. Do not model
an aero disc unless someone turns up a period source.

### 4.5 Summary — what is correct for a US 5000 S Wagon

- **6J × 14 four-bolt (4 × 108) alloy, ET 45, twelve stadium-shaped slots, large centre cap over the bolts.**
- **185/70 HR14** on a 615 mm rolling diameter (§1.5).
- **Not** the 15-inch five-spoke "aero-spoke" wheel — that is the CS Turbo's, and it is the wheel most
  Google Image results for "Audi 5000 wheel" will hand you.
- **Not** a five-bolt hub.

---

## 5. Interior

**Evidence basis.** The MY1988 North-American Avant photographed for
[this Bring a Trailer listing](https://bringatrailer.com/listing/1988-audi-5000-cs-quattro-wagon-4/) is the
primary visual reference for this section: its door-jamb plate reads **WEST GERMANY 10/87**, so it is a
pre-facelift MY1988 car built in the right month, in the right body, for the right market. ⚠ It is a
**Canadian** car (metric speedometer) and a **CD Turbo quattro** (so it has trim and equipment a 5000 S would
not), but the dashboard moulding, cluster architecture, switchgear, door cards and cargo bay are the
5000 S Wagon's. Equipment lists are from [AW-87] / [AW-88], which are Audi of America's own.

### 5.1 Dashboard architecture

- A single **wide, soft, dark moulded dash** running the full width, with a pronounced **brow/overhang** above
  the centre stack and a raised **instrument binnacle** in front of the driver. The whole thing is one visual
  mass in a single dark colour — this is not a two-tone dash.
- Along the base of the windscreen, a **long horizontal defroster grille** with fine slots.
- At each outboard end of the dash top, a **separate side-window demister grille**, coarser and rectangular.
- Immediately below the driver's demister grille, a **large rectangular adjustable louvre vent** with fine
  horizontal blades and a **vertical thumbwheel on its inboard edge**. The passenger side mirrors it.
- The binnacle has a **deep hood** and a flat, forward-raked lens.
- To the left of the steering column: the **rotary headlamp switch** and the instrument-lighting rheostat.
- Two column stalks (left: lights/indicators; right: wipers/washer), plus a cruise-control stalk.
- **Glovebox** on the passenger side: a wide lid with a small round key lock, no handle.
- The dash face is grained; gloss is very low. *(all observed on the BaT MY1988 Avant)*

### 5.2 Instrument cluster — pre-facelift, the one you are building

Read **left to right** across the binnacle:

| Position | Instrument | Detail |
|---|---|---|
| Far left, low | **Coolant temperature gauge** | Small dial, scale 50 – 100 – 120 °C, thermometer-in-water pictogram |
| Left, large | **Speedometer** | US cars in mph; the photographed Canadian car reads 0–260 km/h. Carries a **6-digit odometer window** in the upper half and a **4-digit trip odometer** below centre, with a **reset knob protruding at the lower left of the dial**. "VDO" and the part number are printed at the bottom |
| Centre, stacked | **Turn-signal window**, then the **trip-computer LCD**, then the **Auto-Check panel** | see below |
| Right, large | **Tachometer** | Scale **10–70**, legend **`1/min × 100`** = 1000–7000 rpm; majors every 1000, minors every 250. **Red zone is a dense hatched band beginning at ≈6500 rpm** (measured off the photograph, ±150 rpm) and running to the end of the scale |
| Far right, low | **Fuel gauge** | Small dial with a red reserve segment, ½ and full marks, fuel-pump pictogram; on US/Canadian cars a bilingual **"UNLEADED FUEL ONLY"** legend is printed beneath it |

*(all observed on the BaT MY1988 Avant cluster photograph; equipment list corroborated by [AW-87]:
"Tachometer · Digital clock · Trip odometer · Coolant temperature gauge")*

**The Auto-Check panel** — the thing the brief asked about specifically:

- Audi of America's own description is **"13 function 'Auto-Check System'"**, standard on the 5000 S. [AW-87], [AW-88]
- Physically it is a **3-wide × 3-high block of backlit rectangular pictogram windows**, sitting in the centre
  of the cluster **directly below the trip-computer LCD**, between the speedometer and the tachometer.
  *(observed)*
- Legible tiles in the photographed car, by row:
  - **`PARK BRAKE`** (red text) · red warning triangle · dipped-beam lamp symbol
  - red battery symbol · **`ANTILOCK OFF`** (red text) · red oil-can symbol
  - blank · red engine/oil-pressure symbol · blank
- Unlit tiles read as flat dark grey rectangles with the pictogram barely visible — **model the off state as
  near-invisible, not as a printed icon.**
- Period service literature confirms the system as a separate diagnostic control unit: *"All models have Auto
  Check System which diagnoses vehicle safety functions… located behind center console on some models and
  underneath glove box on others."*
  ([Mitchell manual scan, 1985 Audi, Switches & Instrument Panels](https://www.kolhosniki.ru/mitchell&marke=Audi&model=1398&year=1985&file=A00012364))

**The trip computer** (the optional *"Trip information computer (6 function)"*, [AW-87], [AW-88]) is a
monochrome LCD immediately above the Auto-Check block, with fixed legends around it — `bar`, `km →`, `ltr`
across the top and `⟳ l/100km`, `⌚ km/h`, `∅ ltr` along the bottom. The `bar` position is the boost readout
and is **only functional on turbo cars**. *(observed)*

### 5.3 Centre stack, HVAC and console

Top to bottom, in a **narrow vertical column angled slightly toward the driver**:

1. **A horizontal louvre vent block** under the dash brow, split into **three sections** with fine horizontal
   blades. On the photographed car a small digital clock/display sits immediately left of it.
2. **A panel of small square rocker switches**, in two rows, with pictogram legends (hazard, rear defogger,
   rear wiper, fog, heated seats where fitted).
3. **The radio** — a period Audi-branded (Blaupunkt-built) AM/FM cassette head unit, a wide horizontal slab
   with a row of preset buttons along its lower edge and a cassette slot above. Factory description:
   *"AM/FM stereo cassette, electronically tuned"* (optional); *"4-speaker stereo prep with automatic power
   antenna"* was standard. [AW-87]
4. **The climate panel** — **three large round rotary knobs in a row**, the left one ringed in red/blue for
   temperature, the centre and right ones for distribution and fan, with a vertical column of small square
   buttons flanking them on the right. The US 5000 S had **electronic climate control as standard equipment**
   ([AW-87] *"Electronic climate control system"*), so the panel is a control head, not a simple lever box.
5. **The console** then runs down and back to the transmission tunnel.

*(all observed on the BaT MY1988 Avant and the Wikimedia C3 interior photographs)*

### 5.4 Steering wheel

- **Four spokes.** Two upper spokes leaving the hub at roughly **10 and 2 o'clock**, nearly horizontal; two
  lower spokes at roughly **5 and 7 o'clock**. *(observed on the BaT MY1988 Avant and on both Wikimedia C3
  interiors)*
- A **large, broad, soft centre pad** shaped as a **horizontally-oriented rounded rectangle**, spanning most
  of the wheel's inner diameter. The **four rings** are moulded into it, centred, fairly small relative to the
  pad. Below the rings the photographed wheel carries a **horizontal ribbed/slotted insert**.
- The rim is **thick and round in section**.
- On the 5000 S the wheel is **not** leather-covered as standard: [AW-87] lists *"4-spoke, leather-covered
  steering wheel"* as an **additional** feature of the 5000 CS Turbo, i.e. the S gets the same 4-spoke design
  in moulded urethane. A leather rim arrives as standard only with the facelift (§5.6).
- **No airbag.** A driver airbag became optional only with the January 1988 facelift
  ([de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3)), and there is no airbag module in the
  photographed MY1988 NA car's hub.

### 5.5 Seats, door cards, gear selector, cargo area

**Seats**
- **Front:** reclining buckets with **manual height adjustment for the driver**; standard upholstery is
  **velour**. [AW-87], [AW-88]
- **Head restraints:** *"Four open head restraints"* — the **open-hoop** type on twin chromed posts, front and
  rear. [AW-87] *(confirmed visually on the tan-interior US wagon at
  `germancarsforsaleblog.com/wp-content/uploads/2022/10/B43.jpg`)*
- **Rear:** bench with a **fold-down centre armrest** (sedan and wagon), **front seatback map pockets**, and
  **heat ducts to the rear seat area**. [AW-87]
- **Wagon-specific:** **60/40 split fold-down rear seat**. [AW-87], [AW-88]
- Optional: **8-way power front seats with 4-position driver memory**, **heatable front seats with temperature
  control**, **full leather**. [AW-87], [AW-88]

**Door cards** *(observed on the US 5000 CS quattro Avant at `germancarsforsaleblog.com/wp-content/uploads/2022/10/B3.jpg`
and on the BaT MY1988 Avant)*
- Three horizontal zones: a **padded upper panel** in the interior colour; a **middle band**; a **darker lower
  panel**.
- A **long horizontal grab/pull handle** on a raised plinth, in a darker tone than the panel, running most of
  the card's width at about mid-height — it doubles as the armrest.
- A **thin bright trim line** separating the upper colour panel from the lower dark panel.
- A **round speaker grille** low and forward on the card.
- A **map pocket** formed as a horizontal slot along the bottom of the lower panel.
- The **interior door-release** is a small lever in a recess high and forward, on a dark plinth.
- **Power-window switches** on an angled pod at the forward end of the armrest (four rockers on the driver's
  door). Factory: *"Power windows with door-mounted controls and rear lockout feature"* and *"Dual power
  mirrors with defog feature"*, both standard. [AW-87]

**Gear selector**
- Manual: a **short lever with a leather gaiter** and a **round black knob** carrying the shift pattern,
  rising from the console. A **leather shift knob and boot** is listed as an *extra* on the CS Turbo, so the
  5000 S's is the plain moulded item. [AW-87] *(observed)*
- Handbrake: a lever between the seats, to the right of the gear lever on a LHD car, black grip. *(observed)*

**Cargo area — the Avant's defining interior feature**
Factory description for the wagon, verbatim: *"60/40 split fold-down rear seat · Rear window wiper/washer
system · **Carpeted cargo area with removable folding cover** · Three separate storage compartments in cargo
area · Rear spoiler."* [AW-87], [AW-88]

Observed detail from `germancarsforsaleblog.com/wp-content/uploads/2022/10/B43.jpg` (US wagon, tailgate open):
- The cover is a **roller blind in a cylindrical spring-loaded cassette** mounted transversely immediately
  behind the rear seat backrest, with **end pins dropping into brackets** in the side trim panels. It pulls
  rearwards to a **rigid trailing bar** that latches near the tailgate aperture. Material is dark vinyl /
  leatherette. It is **removable** as a unit, exactly as the factory copy says.
- Floor is **carpeted**, flat, with a **recessed centre panel** closed by a small rectangular flush latch —
  one of the "three separate storage compartments".
- **Two lashing eyes** (bright steel D-rings on rectangular plates) set into the floor near the rear corners.
- A **bright ribbed scuff plate** along the tailgate sill.
- Two **gas struts**, one per side, from the D-pillar to the tailgate.
- The tailgate aperture has a heavy black rubber seal all round; a black box at the top centre of the aperture
  carries the rear wiper motor / high-level lamp wiring.

### 5.6 What the January 1988 facelift changed inside — and whether it affects your car

> ### 🟢 Short answer: it does not. Both MY1987 and MY1988 US 5000 S cars are pre-facelift.
>
> The European facelift is dated **January 1988**
> ([de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3),
> [en.wikipedia](https://en.wikipedia.org/wiki/Audi_100)). In the **United States** it arrived one model year
> later, with the **MY1989 rebrand from "Audi 5000" to "Audi 100"**. The evidence:
>
> | | MY1988 US **5000 S** [AW-88] | MY1989 US **100** [AW-89] |
> |---|---|---|
> | Gauges | tachometer, coolant temp, fuel, digital clock, trip odometer | **adds oil temperature, oil pressure, voltmeter**; electric speedometer (160 mph) |
> | Steering wheel | 4-spoke urethane (leather only on CS Turbo) | **"Leather wrapped steering wheel, shift knob and shift boot"** standard |
> | Upholstery names | *Kensington Velour*, *Savory Velour* | **"Serret velour"** |
> | Belts | height-adjustable front shoulder belts | **"Automatic front seat belt tensioners"** (procon-ten's belt function) |
> | Gearbox | 3.60 / 2.13 / 1.46 / 1.07 / 0.86, FD 3.89 | **3.54 / 2.10 / 1.43 / 1.03 / 0.84, FD 3.98** |
> | Interior colours | Marine Blue, Quartz Grey, **Brasil Brown**, **Sierra Beige** (+ leather in Platinum Grey, Graphite) | Velour: Marine Blue, Quartz Grey, **Graphite**. Leather: Graphite, Platinum Grey, **Nautical Blue**. Brown and beige **dropped** |
>
> A MY1988 5000 S is on the old cluster, the old wheel, the old upholstery names and the old gearbox. So
> **§0's warning that the build target "straddles" the facelift resolves cleanly: it does not. Build the
> pre-facelift interior throughout.**

What actually changed, for reference:

- **Redesigned interior and a new dashboard.** German Wikipedia: *"Im Januar 1988 erfolgte eine größere
  Modellpflege, wodurch der Audi 100 einen neu gestalteten Innenraum sowie in die Karosserie bündig
  eingepasste Türgriffe erhielt"* — a larger model revision giving a newly designed interior and door handles
  fitted flush into the bodywork. ([de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3))
  A secondary account puts it more strongly: *"with the major facelift of model year 1988, the interior is
  completely overhauled; the new dashboard takes it to the next level."*
  ([techzle](https://techzle.com/the-audi-100-c3-was-an-aerodynamic-marvel-from-1982))
- **procon-ten** (the cable-operated system that pulls the steering wheel away from the driver and tensions
  the belts in a frontal impact) becomes available, and an **optional driver airbag** appears.
  ([de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3), [en.wikipedia](https://en.wikipedia.org/wiki/Audi_100))
  Facelift cars carry a small **`procon-ten` badge on the dash face below the cluster** — a quick way to tell
  the two apart in a photograph. *(observed on
  <https://upload.wikimedia.org/wikipedia/commons/0/04/Audi_100_C3_Facelift_Interior.jpg>, a 1990 100 Avant
  quattro)*
- **A supplementary gauge pack** — oil temperature, oil pressure and voltmeter as a row of four small dials
  inboard of the main pair. [AW-89], *(observed on the same Wikimedia facelift photograph)*

**⚠ [VERIFY] — honest limitation.** Placing the pre-facelift and post-facelift dashboards side by side, the
**basic moulding, the centre-stack layout, the three-rotary climate panel and the 4-spoke wheel all carry
over**. The visible differences are the procon-ten badge, the added gauges and detail changes to switchgear
and trim. The German-language sources' "completely overhauled" is stronger than what the photographs support.
**No factory document establishing exactly which dashboard parts were re-tooled in January 1988 was found.**
Since you are building the pre-facelift car this does not block you, but do not repeat "completely new
dashboard" as fact.

### 5.7 Colours

**Interior trims and colours offered on the US 5000 S, MY1987** ([AW-87]):

| Material | Colours |
|---|---|
| **Kensington Velour** | Marine Blue · Quartz Grey · Brasil Brown · Sierra Beige |
| **Savory Velour** | Marine Blue · Quartz Grey · Brasil Brown · Sierra Beige |
| **Leatherette — *5000 S Wagon only*** | Quartz Grey · Brasil Brown · Sierra Beige |
| **Kodiak Leather** (optional) | Platinum Grey · Brasil Brown · Sierra Beige · Graphite · Marine Blue |
| **Alcantara** | Graphite · Sierra Beige |

MY1988 is the same less the wagon-only leatherette, with the leather listed simply as "Leather". [AW-88]
*"Perforated leatherette interior (wagon)"* is listed as a MY1987 5000 S Wagon **option**. [AW-87]

**Exterior colours, US 5000 range, MY1987/88** ([AW-87], [AW-88]):
Tornado Red · Alpine White · Black (MY1988: *Clearcoat Black*) · **Zermatt Silver Metallic** ·
**Stone Grey Metallic** · Sapphire Metallic · Almond Beige Metallic · Maraschino Red Metallic ·
Pearl White Metallic · Nautical Blue Metallic · Satin Black Metallic.
*(Clearcoat metallic paint was a cost option on the 5000 S.)*

> **Relevant to `docs/REFERENCE-PHOTO.md`.** That document derives the car's paint as a mid-dark neutral
> graphite metallic with a faint cool undertone and notes Audi's period German name as *Graphit/Titan Grau
> Metallic*. The **US** names on the MY1987/88 chart for that part of the palette are **Stone Grey Metallic**
> and **Zermatt Silver Metallic** — Stone Grey being the darker of the two. That is not a correction to the
> measured colour, which stands on its own measurement, but if a period paint name is ever wanted for the
> build, **"Stone Grey Metallic" is the US-market name to use.** (A verified US 5000 S Wagon in Stone Grey
> Metallic is on Wikimedia — see §7.)

---

## 6. Body and styling — addenda to §2

§2 already gives the panel-by-panel description. This section does two things: it **resolves several of §2's
`[VERIFY]` flags** against high-resolution photography that was not available when §2 was written, and it
adds the items §2 did not cover. **Nothing in §2 is contradicted except where explicitly said so.**

**Primary new evidence:** the MY1988 (build 10/87) North-American C3 Avant photographed at 2048 × 1365 for
<https://bringatrailer.com/listing/1988-audi-5000-cs-quattro-wagon-4/>, cited below as **[BAT-88]**; and a
US-market 1985 Audi 5000 S Wagon at `germancarsforsaleblog.com/wp-content/uploads/2017/05/442.jpeg`, cited as
**[GCFS-85]**. ⚠ [BAT-88] is a **CD Turbo quattro**, so its badging and wheels are not the S's — its bodywork,
lamps, bumpers and trim are.

### 6.1 RESOLVED — grille slat count (§2.1 `[VERIFY]`)

Counted off [BAT-88]'s grille/headlamp close-up at 4× magnification:

- **7 bright horizontal slats**, producing **8 open apertures**, between the grille's bright upper and lower
  frame members.
- Slats are thin, flat-faced, bright (aluminium/chrome-look) with a rounded leading edge, and each carries a
  small moulding pip roughly every 60–70 mm along its length.
- The apertures are matt black and considerably taller than the slats are thick — roughly **2 : 1 open to
  solid**, so the grille reads dark overall.
- Pitch is even top to bottom; the slats are parallel and dead horizontal.
- The **four rings sit proud of the slat plane**, overlapping several slat pitches, toward the grille's
  centre. They are a separate chromed component standing forward of the slats, not a flat badge.

§2.1's estimate of "roughly 8–9 horizontal ribs" was close; **use 7 slats / 8 apertures.**

### 6.2 RESOLVED — US headlamp assembly (§2.1)

[BAT-88]'s close-up confirms §2.1's reading in full, and sharpens it:

- **One flush composite housing per side**, under a **single continuous bright chrome bezel** that wraps the
  top, outboard and bottom edges and runs inboard along the top to meet the grille's bright frame — so the
  grille and both lamps read as one uninterrupted horizontal band. *(confirmed)*
- Inside the housing, **one large clear lens** with a horizontal prismatic/fluted pattern, behind which sit
  **two reflector chambers side by side** separated by a visible vertical division — the "quad" reading.
  *(confirmed)*
- **Outboard of the clear lens, an amber segment**, roughly trapezoidal, its outboard edge following the front
  fender's corner radius and wrapping very slightly around it. Same housing, same bezel. *(confirmed)*
- The bezel's **lower leg continues outboard and downward** to meet the top edge of the bumper, tying the
  lamp into the bumper line.

### 6.3 CORRECTED — front bumper, rub strip and marker lamp (§2.1)

Two refinements to §2.1 from [BAT-88]:

- **The bright rub strip runs along the bumper's UPPER edge, not across its face at mid-height.** It is a
  slim bright strip capping the top of the dark bumper moulding, continuous with the headlamp bezel's lower
  leg. §2.1's "roughly mid-bumper height" appears to be an artefact of the low-resolution brochure scan.
- **The front amber marker is a small rectangular lens set low into the outboard face of the bumper**, not a
  large wrap-around corner lamp. §2.1's "amber wrap-around corner lamps" overstates it. The amber *wrap* is in
  the **headlamp** housing (§6.2); the **bumper** carries a discrete small amber marker below and outboard of
  it. This matches `docs/REFERENCE-PHOTO.md`'s observation of "amber marker in the bumper end".
- Also visible: two small round plugs on the bumper face (impact-absorber access) and a towing-eye aperture at
  the outboard lower corner.
- **The lower valance below the bumper is BODY-COLOURED**, not dark. This reconciles [AW-87]'s standard-
  equipment line *"Integrated body-colored front and rear bumper aprons"* with §2.1's dark bumper: the
  **bumper moulding is dark grey; the aprons/valances above and below it are body colour.**

### 6.4 RESOLVED — wagon taillamp geometry and internal segmentation (§2.3 `[VERIFY]`)

This was §2.3's biggest open question. [BAT-88]'s taillamp close-up settles it. **The wagon's rear lamp is
split across the shutline**: an outer section on the rear quarter panel and an inner section on the tailgate,
which together read as one continuous band.

**Outer section (on the rear quarter panel), outboard → inboard:**

| Band | Segment | Function |
|---|---|---|
| Upper | **Amber**, with the outboard end rounded and wrapped around the body corner | side marker / indicator wrap |
| Upper | **Amber** | indicator |
| Lower | **Red**, fine vertical lens ribbing, full width of the section | tail / stop |

**Inner section (on the tailgate), outboard → inboard:**

| Band | Segment | Function |
|---|---|---|
| Upper | **Clear/white**, fine textured lens, roughly square | reverse lamp |
| Upper | **Amber**, wide | indicator / rear fog on Euro cars |
| Lower | **Red**, full width of the section | tail / stop |

- Overall the unit is **taller than it is wide**, with a **square inboard edge** and a **rounded outboard
  corner** following the body.
- The **upper band is about 45 % of the unit's height**, the lower red band about 55 %.
- The division between upper and lower bands is a **straight horizontal line** running the full width.
- Between the two inner sections sits the **black recessed licence-plate panel**, flush with the lamp faces.
- ⚠ **Euro facelift cars differ**: a secondary source states that for the final year *"the 100 has rear lights
  that are designed differently and the orange upper part turns red."*
  ([techzle](https://techzle.com/the-audi-100-c3-was-an-aerodynamic-marvel-from-1982)) Do not use a late Euro
  car as your taillamp reference.
- §2.3's reading (amber then clear in the upper band, a single red lower band) was **correct**; what it could
  not see was the shutline split and the second inboard amber.

### 6.5 RESOLVED — tailgate badging layout (§2.6)

[BAT-88] shows the badge line on the tailgate's body-coloured transverse panel, **left → right**:

`5000 CD` (chrome block letters, left of centre) — **four rings** (chrome, just right of centre) — `turbo`
(script) — `quattro` (script, far right).

So the **model designation sits left of centre and the rings just right of centre**; engine/drivetrain scripts
run off to the right. For a **5000 S Wagon**, expect `5000 S` left of centre and the rings right of centre,
with nothing further right. [GCFS-85] shows exactly that layout on a US 5000 S Wagon, with a second small
script at the far right (legible as a `fuel injection`-style line — **[VERIFY]** its exact wording).

Above the badge line, below the tailgate glass, there is a **full-width matt-black trim panel** carrying a
debossed model script on turbo/quattro cars. §2.3's "black spoiler/lip across the top of the tailgate glass"
and this lower black band are **two different parts** — the wagon has both. [AW-87] confirms *"Rear spoiler"*
as standard wagon equipment.

### 6.6 Roof rails — profile, feet, material

§2.4 established that rails were **optional**, that the MY1987 brochure wagon has none, and that the Euro
blueprint car does. Adding to that:

- **US availability is confirmed as a factory option**: [AW-87] and [AW-88] both list **"Roof rails (wagon)"**
  / **"Roof rails (wagon only)"** in the 5000 S option list. So a US 5000 S Wagon with rails is correct, and
  `docs/REFERENCE-PHOTO.md` records that the reference car **has them fitted**.
- **OEM part numbers**: the Typ 44 Avant roof-rail pair is **445860021 / 445860022**, sold with fitting
  hardware and described as **chrome/bright finish**
  ([autewo](https://www.autewo.de/audi-100/200-typ-44-avant-dachreling-mit-anbaumaterial-chrom),
  [eBay listing 191667947098](https://www.ebay.de/itm/Audi-100-C3-Typ-44-Avant-Dachtrager-Dachreling-Grundtrager-445860021-445860022/191667947098)).
  The `445` prefix is the C3 Avant body group.
- **Observed geometry** (from a photograph of a Euro 100 Avant with rails, held in the project scratchpad;
  provenance not recorded, so treat the numbers as indicative and confirm against the cited Wikimedia images
  in §7):
  - **Two longitudinal rails**, one each side, set inboard of the roof-to-bodyside moulding, running from just
    behind the windscreen header to the rear of the roof at the tailgate hinge line.
  - **Finish: bright polished/anodised silver aluminium.** Not black, not body colour.
  - **Section:** a slim extrusion, roughly **twice as wide as it is tall** with a rounded top — read it as a
    flattened oval, about 25–30 mm tall.
  - **Four support points per rail**: the front and rear ends **sweep down onto the roof skin** as integral
    terminations, with **two short vertical posts** between them at roughly the B- and C-pillar stations.
  - Stand-off above the roof skin is consistent with §1.3's independently-derived **50–55 mm**.
- **[VERIFY] still open:** no factory drawing or parts diagram giving the rail section or foot spacing was
  found, and it is not established whether the US option used the same part as the European one.

### 6.7 Rear wiper, antenna, mirrors

- **Rear wiper/washer.** [AW-87] and [AW-88] list *"Rear window wiper/washer system"* as **standard wagon
  equipment** — so it is not an option to decide about. Park position and arm geometry remain **[VERIFY]**;
  [BAT-88]'s tailgate-open shot shows the motor housing at the **top centre** of the tailgate aperture, which
  means the wiper **pivots from the top of the glass and sweeps downward**, not from the bottom.
- **Antenna.** §2.3 records a mast at the **rear of the roof**, offset, on the brochure car. A Euro Avant
  photograph shows a mast at the **front of the roof** instead. Both exist. [AW-87] specifies *"4-speaker
  stereo prep with **automatic power antenna**"* as standard — so on a US 5000 S it is a **motorised
  retracting mast**, which means it should be modelled as retracted (flush) unless the radio is on.
- **Mirrors.** [AW-87]: *"Dual power mirrors with defog feature"*, standard. So both mirrors are powered and
  heated, matching §2.2's large black aero housing. No manual-mirror variant to worry about on a US car.

### 6.8 Door handles — the pre/post-facelift split, dated for the US market

- **Pre-January-1988** (your car): recessed pull handle in a pressed pocket in the door skin (§2.2).
- **From January 1988** in Europe: flush handles let into the bodywork.
  ([de.wikipedia](https://de.wikipedia.org/wiki/Audi_100_C3))
- **In the United States the change lands with MY1989**, when the car was renamed Audi 100 — see the
  MY1988-vs-MY1989 equipment and gearing comparison in §5.6, which shows MY1988 US cars still on the entirely
  pre-facelift specification.
- **Therefore: build the recessed pull handle.** Both MY1987 and MY1988 US 5000 S Wagons have it.

### 6.9 Fog lights (§2.1 `[VERIFY]`)

**Resolved as far as the sources allow: not fitted, and not listed.** Front fog lamps appear **nowhere** in
the MY1987 or MY1988 US 5000 S standard-equipment or option lists ([AW-87], [AW-88]), and the [BAT-88]
close-up shows an unbroken bumper and valance with no lamp apertures. Model the valance plain.

### 6.10 Side rubbing strip and decorative stripe

- §2.2's description of the wide dark moulding with a **thin bright trim line along its top edge** is
  confirmed by [BAT-88].
- ⚠ [BAT-88] additionally carries a **red-and-gold pinstripe decal** on the body above the moulding. That is a
  dealer/decor item, **not** standard 5000 S trim — it appears in no factory equipment list. Do not copy it.

### 6.11 Body construction notes worth having

| Item | Value | Source |
|---|---|---|
| Body type | Unitised (monocoque) construction | [BROCHURE-87] |
| Corrosion protection | **Fully galvanised sheet metal**, multi-step factory rust protection | [AW-87] |
| Glazing | Tinted glass throughout, **banded windscreen** (graduated tint band along the top) | [AW-87] |
| CHMSL | *"Center high-mounted rear brake light"*, standard | [AW-87] |
| Bumpers | *"Integrated body-colored front and rear bumper aprons"*, *"Wide protective wraparound moldings"* | [AW-87] |

---

## 7. Reference imagery

**Read the body-style column before you open anything.** The C3 saloon and the C3 Avant share a nose and
nothing aft of the B-pillar. Every entry below has been visually checked as wagon or saloon; where that check
was not possible it says so.

### 7.1 The single best source — a MY1988 North-American Avant

<https://bringatrailer.com/listing/1988-audi-5000-cs-quattro-wagon-4/> — **96 photographs, all 2048 × 1365.**
Door-jamb plate reads **WEST GERMANY 10/87**, so it is a pre-facelift MY1988 car: the right year, the right
body, the right market.

⚠ **Three caveats.** It is a **Canadian** car (km/h speedometer, bilingual fuel legend). It is a **CD Turbo
quattro**, so its badging, wheels (15-inch multi-spoke, five-bolt) and some interior equipment are not the
5000 S's. It has **no roof rails**.

All URLs share the prefix
`https://bringatrailer.com/wp-content/uploads/2024/10/1988_audi_5000-cs-quattro-wagon_1988_audi_5000-cs-quattro-wagon_`

| View | Filename suffix | Body |
|---|---|---|
| **Direct side** | `421c521d-9ad3-4b4a-8489-2da21a4308ca-siyMBA-21375-21376-scaled.jpg` | WAGON |
| **Direct front** | `ed24c857-97c0-423f-ac9a-ca4a5876e17f-8Hdcbe-21332-21333-scaled.jpg` | WAGON |
| **Direct rear** | `c90d758f-d303-4e7e-ab67-0b070f385988-pLDwq9-21360-21361-scaled.jpg` | WAGON |
| Front 3/4 | `7a28fdcf-4fd9-41d4-bb1c-cad2e6b447fd-YMPmIB-21324-21325-scaled.jpg` | WAGON |
| Front 3/4, low angle | `a4e6c91f-baf0-497f-ba33-260e290dbbd1-HGWr6O-21339-21340-scaled.jpg` | WAGON |
| Rear 3/4 left | `5b416b3d-966d-4b27-b0ba-0f2dec6b63bc-qaI2RF-21368-21369-scaled.jpg` | WAGON |
| Rear 3/4 right | `d6d7750b-a782-4d00-983b-95169b1ca50f-MqkqzX-21353-21354-scaled.jpg` | WAGON |
| **Headlamp + grille close-up, LH** — *used for §6.1 and §6.2* | `e8beb56c-0278-467e-b809-63bed2fe02b6-SzpU4s-21469-21470-scaled.jpg` | WAGON |
| Headlamp + grille close-up, RH | `8f8a01ab-627d-4849-ac33-2e582b34de5b-y6cJTR-21461-21462-scaled.jpg` | WAGON |
| **Taillamp close-up** — *used for §6.4 and §6.5* | `a1718198-7a71-4808-b1b1-c8ded69c1cf6-akAYpA-21477-21478-scaled.jpg` | WAGON |
| Taillamp, second angle | `c6f1891d-241b-4d4e-8f42-cc193e7fb633-7lK5iN-21440-21441-scaled.jpg` | WAGON |
| Taillamp RH | `5974a0cd-c437-41c7-9604-dc627a3d6431-FnmdrM-21454-21455-scaled.jpg` | WAGON |
| **Dashboard, wide** — *used throughout §5* | `b1db32d6-97c4-4fd4-9b85-015319de5569-WSplS4-21615-21616-scaled.jpg` | WAGON |
| Steering wheel + cluster | `934781b6-8871-47e6-b81d-789853bb8142-TM8vIq-21622-21623-scaled.jpg` | WAGON |
| **Instrument cluster, square-on** — *used for §5.2* | `ab0f88b4-452b-49c2-b7bf-135fc85337c4-1wRVDR-21644-21645-scaled.jpg` | WAGON |
| Tailgate open / cargo bay | `9353827f-91ba-4c82-b4f9-be4c0bb85fc7-JjFL7A-21818-21819-scaled.jpg` | WAGON |
| Wheel — **15-inch multi-spoke, NOT the bottlecap** | `1577bbe4-27d8-47e9-a3e8-0782c0a8bc77-SuA3IL-21535-21536-scaled.jpg` | WAGON |

Second direct-rear, different path:
`https://bringatrailer.com/wp-content/uploads/2024/10/1988_audi_5000-cs-quattro-wagon_image0-78883-scaled-1-79399.jpeg`

### 7.2 US-spec 5000 S Wagons — the right model

| What | URL | Notes |
|---|---|---|
| **1985 5000 S Wagon, Stone Grey Metallic, front 3/4 — 4984 × 2732** | <https://upload.wikimedia.org/wikipedia/commons/a/ab/1985_Audi_5000S_Wagon_in_Stone_Grey_Metallic%2C_front_right.jpg> | WAGON, **US**, **roof rails fitted**, US composite headlamp with amber. ⚠ wears a **multi-spoke** 14-inch alloy, not the bottlecap. Also: this is the US paint name discussed in §5.7 |
| **1985 5000 S Wagon, rear 3/4 — 5195 × 2859** | <https://upload.wikimedia.org/wikipedia/commons/2/2f/1985_Audi_5000S_Wagon_in_Stone_Grey_Metallic%2C_rear_right.jpg> | WAGON, US, wagon taillamps, roof rails, tailgate spoiler |
| **1985 5000 wagon, California — 2636 × 1223** | <https://upload.wikimedia.org/wikipedia/commons/e/e0/1985_Audi_5000_wagon.jpg> | WAGON, US, front wheel near face-on wearing **the bottlecap** |
| 1985 5000 S Avant, front 3/4 | `https://germancarsforsaleblog.com/wp-content/uploads/2017/05/441.jpeg` | WAGON, US, 1600 × 1200, **bottlecap wheels**. ⚠ the host page's text claims quad sealed beams; the photograph shows **composite** lamps with amber outboard |
| **1985 5000 S Avant, rear 3/4 — the §6.5 badging reference** | `https://germancarsforsaleblog.com/wp-content/uploads/2017/05/442.jpeg` | WAGON, US, `Audi 5000 S` tailgate badging, **bottlecap wheel measured for §4.3** |
| 1985 5000 S Avant, interior | `https://germancarsforsaleblog.com/wp-content/uploads/2017/05/443.jpeg` | WAGON, US |
| 1987 5000 CS quattro Avant — front 3/4 / rear 3/4 / interior / side | `…/2022/10/B1.jpg`, `B2.jpg`, `B3.jpg`, `B5.jpg` on `germancarsforsaleblog.com/wp-content/uploads` — page <https://germancarsforsaleblog.com/1987-audi-5000cs-quattro-avant-2/> | WAGON, US. **B3 is the tan-leather interior used in §5.5**; B2 shows US wagon taillamps |
| US wagon, tailgate open, cargo bay + roller blind — **the §5.5 cargo reference** | `https://germancarsforsaleblog.com/wp-content/uploads/2022/10/B43.jpg` | WAGON, US |
| 1987 5000 S Avant, US press/brochure scan, **bottlecap wheels both axles** | `https://autopolis.wordpress.com/2022/02/1987-audi-5000s-avant.jpg` — page <https://autopolis.wordpress.com/2022/02/12/1984-1988-audi-5000-avant-not-your-usual-family-hauler/> | WAGON, US, 1372 × 518 |
| 1984 5000 wagon, B&W press side profile | `https://autopolis.wordpress.com/2022/02/1984-5000-side-profile.jpg` | WAGON, US, 600 × 298 (low-res) |

⚠ **Do not use** `germancarsforsaleblog.com/wp-content/uploads/2015/10/441.jpg`, `442`, `443`, `444`, `449`,
`4410`, `4411`, `4412`, `4413` — those are **saloons**. In that same roundup, `445.jpg`, `446.jpg`, `447.jpg`,
`448.jpg` are a red **wagon** (600 × 337).

### 7.3 European 100 Avant — higher resolution, but Euro bumpers and lamps

All confirmed WAGON, all Wikimedia Commons.

| View | URL | Res |
|---|---|---|
| **Near-pure side profile, pre-facelift, public domain** | <https://upload.wikimedia.org/wikipedia/commons/9/95/Audi_100_C3_Avant_1983.jpg> | 1509 × 906 |
| **Front 3/4, roof rails very clear** | <https://upload.wikimedia.org/wikipedia/commons/b/b9/1990_Audi_100_Avant_TDI_front.jpg> | **5412 × 2796** |
| **Rear 3/4, roof rails + full tail** | <https://upload.wikimedia.org/wikipedia/commons/b/b8/1990_Audi_100_Avant_TDI_rear.jpg> | **5372 × 2996** |
| Near-direct front (grille) | <https://upload.wikimedia.org/wikipedia/commons/5/52/1985_Audi_100_Avant_%2814456023269%29.jpg> | 2890 × 1928 |
| Rear 3/4 | <https://upload.wikimedia.org/wikipedia/commons/1/18/1985_Audi_100_Avant_%2813412802184%29.jpg> | 2892 × 1930 |
| Front 3/4, 2.3 E | <https://upload.wikimedia.org/wikipedia/commons/6/6f/Audi_100_Avant_2.3_E_%2827106916137%29.jpg> | 4303 × 3158 |
| Rear 3/4, 2.3 E | <https://upload.wikimedia.org/wikipedia/commons/1/1b/Audi_100_Avant_2.3_E_%2828104745618%29.jpg> | 4530 × 3310 |
| Front 3/4, very high res | <https://upload.wikimedia.org/wikipedia/commons/0/03/Audi_100_Avant.jpg> | 5400 × 3600 |
| Near-direct rear | <https://upload.wikimedia.org/wikipedia/commons/a/a2/Audi_100_Avant_rear1.jpg> | 2816 × 1276 |
| Rear 3/4 | <https://upload.wikimedia.org/wikipedia/commons/f/f5/Audi_100_2.3_Avant_%2812347808594%29.jpg> | 3864 × 2916 |
| **Facelift** front 3/4 / rear 3/4 — *for comparison only, NOT your car* | <https://upload.wikimedia.org/wikipedia/commons/d/dc/1989_Audi_100_Avant_E_2.2_Front.jpg> · <https://upload.wikimedia.org/wikipedia/commons/0/09/1989_Audi_100_Avant_E_2.2_Rear.jpg> | 3335 × 1535 · 3671 × 1734 |
| Facelift front / rear | <https://upload.wikimedia.org/wikipedia/commons/7/7c/Audi_C3_Avant_front_20071012.jpg> · <https://upload.wikimedia.org/wikipedia/commons/3/36/Audi_C3_Avant_rear_20071012.jpg> | 1644 × 927 · 1545 × 954 |

Full category (49 files, all Avant): <https://commons.wikimedia.org/wiki/Category:Audi_100_C3_Avant>

> **Wikimedia rate-limits automated downloads (HTTP 429).** If a direct `upload.wikimedia.org` URL returns
> 429, fetch it through `https://commons.wikimedia.org/wiki/Special:FilePath/<Filename>?width=1800` instead —
> that worked reliably during this pass.

### 7.4 Interiors — both generations

| What | URL | Body |
|---|---|---|
| **Pre-facelift, MY1988, NA — the build target** | the three [BAT-88] interior files in §7.1 | **WAGON** |
| Pre-facelift, Euro, 5184 × 3456, photographer-captioned *"Version ohne Facelift"* | <https://upload.wikimedia.org/wikipedia/commons/d/d9/Audi_100_C3_Typ_44_Limo_14062014_%28Foto_Hilarmont%29_%283%29.JPG> · <https://upload.wikimedia.org/wikipedia/commons/5/5f/Audi_100_C3_Typ_44_Limo_14062014_%28Foto_Hilarmont%29_%284%29.JPG> | ⚠ **SALOON** — but the dash moulding is shared with the Avant, and these are the highest-resolution clean shots available |
| US, pre-facelift, tan leather, door card + seats | `https://germancarsforsaleblog.com/wp-content/uploads/2022/10/B3.jpg` | **WAGON**, 1600 × 1200 |
| **Post-facelift, 4640 × 2088** — Commons metadata identifies it as a 1990 **100 Avant quattro "Sport"** | <https://upload.wikimedia.org/wikipedia/commons/0/04/Audi_100_C3_Facelift_Interior.jpg> | **WAGON** — use for the §5.6 comparison only |

### 7.5 Wheels

| What | URL | Note |
|---|---|---|
| Bottlecap, bare, near face-on | <https://awrswheels.com/wp-content/uploads/2025/04/176452152.jpg> | **only 400 × 400** — the best clean face-on found |
| Bottlecap product shot | <https://www.stockwheels.com/content/images/thumbs/000/0006510_58643_228.jpeg> | 228 × 228 |
| Bottlecap **on a US 5000 S Wagon** — measured for §4.3 | `https://germancarsforsaleblog.com/wp-content/uploads/2017/05/442.jpeg` | 1600 × 1200 |
| Bottlecap on a US wagon | <https://upload.wikimedia.org/wikipedia/commons/e/e0/1985_Audi_5000_wagon.jpg> | 2636 × 1223 |
| Part pages | <https://awrswheels.com/product/factory-oem-14-wheel-fits-1985-1987-audi-4000-443601025ay7y-2/> · <https://www.stockwheels.com/Audi-5000-1984-1988-14x6-Aluminum-Alloy-Silver-9-Slot-58643-Wheel-Rim> · <https://www.ebay.com/itm/277413770218> | |

### 7.6 Orthographic blueprints

- 1986 100 C3 Avant — front/top/rear/side, **542 × 172**:
  <https://getoutlines.com/blueprints/car/audi/audi-100-avant-1986.gif>
  (page: <https://getoutlines.com/blueprints/221/1986-audi-100-c3-avant-wagon-blueprints>) — already used in §1.3
- **1989 100 C3 Avant — front/top/rear/side, 544 × 170 — NEW this pass:**
  <https://getoutlines.com/blueprints/car/audi/audi-100-avant-1989.gif>
  (page: <https://getoutlines.com/blueprints/222/1989-audi-100-c3-avant-wagon-blueprints>)
  ⚠ This is the **facelift** car, so its door handles differ — but it is a second independent orthographic set
  for cross-checking §1.3's derived overhangs.
- Paid vector set (1988–91 Avant): <https://getoutlines.com/vector-drawings/15738/1988-1991-audi-100-drawings>

### 7.7 Views that could NOT be filled

- **Top / overhead: NOT FOUND.** No genuine overhead photograph of a C3 Avant exists in any accessible source.
  The only plan view available is the top elevation inside the two getoutlines blueprints, where the whole
  four-view sheet is ~544 px wide, so the plan view is roughly 150 px long — **too coarse to model from.**
  Derive the plan from the side and front/rear elevations instead, and say so.
  *(The [BROCHURE-87] "Art of Engineering" spread on pp.22–23 contains overhead studio photographs, but of a
  saloon and a Coupé GT, not the wagon.)*
- **Bottlecap alloy, straight face-on at useful resolution: NOT FOUND.** 400 × 400 is the best. This is why
  §4.3's slot count carries a `[VERIFY]`.

### 7.8 Sources that are blocked to automated fetching

`curbsideclassic.com` (403, and no Wayback snapshot of the C3 article), `carsandbids.com` (403),
`classic.com` (403), `autodoc.*` (403), `automobile-catalog.com` (**402 — paywalled**, and its performance
figures are site-computed simulations, not measured tests), `press.audi.co.uk` / `audi-mediacenter.com` (no
C3 Avant imagery served). Bring a Trailer has exactly **one** reachable 5000 wagon listing — the one in §7.1.

---

## 8. Corrections to `src/spec.ts` — one checklist

`docs/WORKSTREAM.md` says to **report** corrections to `src/spec.ts` rather than edit it. This section is that
report. Nothing here has been changed in code by this research pass.

| Field | Currently | Should be | Why / source |
|---|---|---|---|
| `TRANSMISSION.gearRatios` | `[3.6, 2.125, 1.36, 0.967, 0.744]` | **`[3.600, 2.125, 1.458, 1.071, 0.857]`** | 3rd/4th/5th track the **CS Turbo's** ratios, not the S's. Top gear is **15 % too tall**. [BROCHURE-87] §3.5 |
| `TRANSMISSION.reverseRatio` | `3.5` | `3.50` ✅ correct | [BROCHURE-87] |
| `TRANSMISSION.finalDrive` | `3.889` | `3.889` ✅ correct | [BROCHURE-87] / 016 AAZ |
| `TRANSMISSION.driveType` | `'fwd'` | ✅ correct | [BROCHURE-87] |
| `ENGINE.peakPowerRpm` | `5_500` | **`5_600`** | [BROCHURE-87], [AW-88] §3.2 |
| `ENGINE.peakPowerKw` | `97` | `96.9` (or leave 97) ✅ effectively correct | 130 hp SAE net |
| `ENGINE.peakTorqueNm` | `184` | **`190`** | 140 lb-ft, [BROCHURE-87] |
| `ENGINE.peakTorqueRpm` | `4_000` | ✅ correct | [BROCHURE-87] |
| `ENGINE.torqueCurve` | value at 5500 = `0.89` | **≈`0.875` at 5500** so the curve passes through 165.3 N·m at 5600 | §3.4 |
| `ENGINE.firingOrder` | `[1,2,4,5,3]` | ✅ correct — **and now sourced** | [BROCHURE-87] §3.11 |
| `ENGINE.firingIntervalDeg` | `144` | ✅ correct | derived, §3.11 |
| `ENGINE.redlineRpm` | `6_300` | **`6_500`** (measured off the cluster, ±150) | §5.2, §3.12 |
| `ENGINE.limiterRpm` | `6_500` | **`6_800`** — *low confidence, single forum source; label it* | §3.12 |
| `ENGINE.idleRpm` | `820` | unsourced — keep, but label | §3.12 |
| `STEERING.turnsLockToLock` | `3.3` | **`3.5`** | [BROCHURE-87], [AW-87], [AW-88] §3.8 |
| `STEERING.turningCircle` | `10.42` | ✅ correct | [BROCHURE-87] |
| `STEERING` comment | "engine-speed-sensitive power assist" | **unsourced** — the brochure says only "power-assisted"; [AW-87]/[AW-88] say "servotronic". Reword to "power-assisted; assist type unverified" | §3.8 |
| `BRAKES.discDiameterFront` | `0.276` | **`0.256`** — 0.276 is the **CS Turbo** disc | Brembo/Zimmermann/[AW-87] §3.9 |
| `BRAKES.discDiameterRear` | `0.245` | ✅ correct (245 mm × 10 mm solid) | Brembo/Zimmermann §3.9 |
| `BODY.weightDistFront` | placeholder | still a placeholder — **NOT FOUND** confirmed twice over | §1.4, §3.12 |
| suspension spring/damper rates | — | **NOT FOUND**; if added, label as tuning parameters | §3.7 |

**Things `src/spec.ts` does not carry yet but now has sourced values for**, if anyone wants them:
front anti-roll bar 23 mm (or 26 mm — see §3.7's conflict box), no rear anti-roll bar, steering ratio 18.7:1,
wheel bolt pattern 4 × 108 mm, wheel offset ET 45, gearbox type 016 code AAZ, automatic type 087.

---

*Sections 3–8 compiled 2026-09-25. Primary source throughout: the factory US sales brochure "Audi for 1987",
pages 16–17. Where a figure could not be sourced it says NOT FOUND rather than carrying an estimate.*

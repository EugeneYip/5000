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

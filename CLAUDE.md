# Audi 5000 S Wagon — project notes

A photoreal, drivable 3D reconstruction of a **1988 Audi 5000 S Wagon
(C3 / Type 44)** in Three.js, deployed to GitHub Pages.

## The one rule

**Everything is generated in code. No imported mesh assets, no binary
textures, no downloaded HDRIs.** Geometry is lofted from parametric sections,
textures are drawn to canvas or computed in shaders, and the sky is
synthesised. This keeps the whole thing diffable, reviewable and small.

## Where the numbers live

- `src/spec.ts` — every dimension, ratio, colour, gear ratio. **Never hard-code
  a number that belongs here.** Figures come from the factory US brochure
  ("Audi for 1987", the AUDI 5000S SPECIFICATIONS table); anything not from a
  primary source is commented as such.
- `src/car/hardpoints.ts` — the package drawing: fixed attachment points every
  geometry module builds to. Fixing these up front is what let the body, lamp,
  trim, glass and interior work happen concurrently without the parts missing
  each other. Aft points are expressed relative to `TAIL` so an overhang change
  can't leave a lamp floating behind the bumper.
- `docs/REFERENCE-VEHICLE.md` — researched specifications, with a source URL
  against every number and conflicts called out rather than silently resolved.
- `docs/REFERENCE-PHOTO.md` — how the paint colour and plate were derived by
  measurement from the original photograph.

## Things that are easy to get wrong

- **Cd is 0.34**, not 0.30. The famous 0.30 is the Euro *saloon*. This wagon is
  0.34 — still the most aerodynamic estate in the world at launch.
- **The wheel is 6J × 14 on 185/70 HR14.** The 15-inch/205-60 combination
  belongs to the CS Turbo. The tall sidewall is a big part of how the car reads.
- **Flush glazing** is the car's signature. `HP.glass.flushOffset` is 2 mm. If
  the glass looks recessed, the model is wrong regardless of everything else.
- **`BODY.weightDistFront` is not a sourced figure.** No factory or period test
  gives the C3's split. Treat it as a tuning parameter.
- It is a **wagon**. The saloon's roofline and rear are completely different,
  and most reference photographs you'll find are of the saloon.

## Commands

```bash
npm run dev                                   # vite dev server
npm run build                                 # typecheck + production build
node tools/shoot.mjs --views=side,front3q     # review renders, free port each run
python3 tools/sheet.py --dir renders/latest   # contact sheet
python3 tools/sheet.py --compare renders/latest/photomatch.png
```

`shoot.mjs` renders through the shipped renderer and exits non-zero if the page
threw, so it doubles as a smoke test. It also writes `<view>_mask.png` and
`<view>_paint.png`, silhouettes of the car and of the painted panels that
`sheet.py` reads its per-car figures through. Judge work by opening the PNGs,
never by reading the code.

In the page: `__AUDI.census()` counts geometry once (never trust
`renderer.info`), `__AUDI.pick(x, y)` says what mesh a pixel is and where it
faces, and `__AUDI_MAT.audit()` lists meshes wearing materials the library
never issued.

## Environment quirk

The system `git` is blocked by an unsigned Xcode licence. Use:

```bash
export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
```

## Concurrency

Work streams own disjoint directories (see `docs/WORKSTREAM.md`). When several
run at once, `tsc` will report errors in files you don't own — read the paths
and fix only your own.

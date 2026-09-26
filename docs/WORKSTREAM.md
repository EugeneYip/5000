# Work stream rules

Read this before touching anything. Several streams run concurrently.

## The project

A photoreal, drivable 3D **Audi 5000 S Wagon (C3 / Type 44, 1988)** built in
Three.js. **No imported mesh assets** — every surface is generated in code, so
it stays diffable, reviewable and tiny to ship.

The quality bar is not "good for WebGL". It is: *a knowledgeable person who
owned one of these looks at a still and cannot immediately tell it from a
photograph of the real car.* Anything less gets sent back.

## Read before you start

| File | What it is |
|---|---|
| `src/spec.ts` | Every dimension, ratio, colour, gear ratio. **Never hard-code a number that belongs here.** |
| `src/car/hardpoints.ts` | The package drawing — fixed attachment points. Build *to* these. |
| `src/types.ts` | Module contracts. Your export signature is defined here. |
| `docs/REFERENCE-PHOTO.md` | The exact car: paint derivation and plate. |
| `docs/REFERENCE-VEHICLE.md` | Researched dimensions, styling detail, powertrain data. |

## File ownership

You own **only** the paths assigned in your brief. Other streams are editing
other directories *right now*. Do not edit, refactor, reformat or "tidy"
anything outside your ownership — not even imports. If you need something
changed elsewhere, say so in your report instead of doing it.

Never edit: `src/spec.ts`, `src/car/hardpoints.ts`, `src/types.ts`,
`src/main.ts`, `src/car/Car.ts`, `tools/`, `docs/`. If a hardpoint is genuinely
wrong, report the correction — do not work around it locally.

## Verifying

```bash
cd /Volumes/Projects/5000
npx tsc --noEmit                    # must be clean before you report done
node tools/shoot.mjs --views=front3q,side --out=renders/<yourstream> --w=1600 --h=900
```

`shoot.mjs` renders through the shipped renderer, so what you see is what a
visitor sees. It exits non-zero if the page threw. It picks a free port each
run, so several streams can shoot at the same time.

### Concurrency: errors that are not yours

Other streams are mid-edit in the same working tree. So:

- `npx tsc --noEmit` may report errors in files you do not own. **Read the
  paths.** Fix only errors in files you own; ignore the rest, and do not
  "helpfully" repair someone else's half-written module — you will lose their
  work and cause a conflict.
- `shoot.mjs` may fail to load the page entirely because another stream has a
  broken import right now. Wait a minute and try again before concluding it is
  you. If it persists for several attempts, note it in your report.
- To check just your own files:
  `npx tsc --noEmit 2>&1 | grep "^src/<your-directory>/"`

**Then open the PNGs with the Read tool and actually look at them.** Judge
them with your own eyes against real reference photographs of the car, which
you should fetch with WebSearch/WebFetch. Iterate. Never report success from
reading your own code — code that compiles and looks wrong is a failure.

Views available: `front3q rear3q side front rear top wheel headlight taillight
interior dash roofrail badge platecam photomatch`.

## Git

The default `git` is blocked by an unsigned Xcode licence. Use:

```bash
export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
```

**Do not commit or push.** Leave your files in the working tree; the lead
integrates and commits. Committing concurrently will conflict.

## House style

- TypeScript, strict. `npx tsc --noEmit` clean.
- Comments explain *why*, and only where a reader would otherwise wonder.
  Do not narrate what the code plainly does.
- Geometry helpers go in your own directory. Do not add dependencies without
  asking — Three.js and its `examples/jsm` addons are already available and
  are almost always enough.
- Performance budget: the whole car ≤ 1.2 M triangles, ≤ 220 draw calls,
  60 fps at 1080p. Merge static geometry. Instance repeated parts (slats,
  bolts, tread blocks).

  **Read `renderer.info` carefully — it does not mean what it looks like.**
  The scene is rendered **three times every frame**: the transmission pass
  (three re-renders the opaque scene because the glazing and lamp lenses are
  transmissive), the colour pass, and GTAO's normal/depth override. So both
  counters come back at about **2.92×** the geometry actually present.

  Measured at `front3q`: `renderer.info` reports 2,368,765 triangles, but the
  visible geometry counted once is **811,714 — of which the car is 770,934,
  comfortably inside the 1.2 M budget.** Likewise a reported 931 draws is
  32 for the scene plus 308 car meshes at 2.92 each.

  Also: an occasional 1237 in the readout is the one-frame-in-fifteen
  shadow-map refresh, not the steady state.

  So before optimising anything, check whether the number you are chasing is
  real. Hide the car root and re-measure to get the delta, or count geometry
  directly. `__AUDI_MAT.audit()` lists meshes wearing materials the registry
  never issued, and `__AUDI_MAT.raw()` records every option set the library
  was handed before quantisation.
- **Probing a node other streams attach to: use `mesh.geometry.boundingBox`
  transformed by `matrixWorld`, never `Box3.setFromObject`.** The latter
  descends into children, and several nodes are shared parents —
  `tailgatePanel` alone carries the inner taillamps, the plate, the ribbed
  panel and the rear wiper, contributed by three other streams. A probe of it
  with `setFromObject` reported 52,794 triangles for a 3,548-triangle panel
  and looked exactly like a corruption bug.
- Nothing in a real car is a perfectly sharp edge. Every visible edge gets a
  radius (`QUALITY.edgeRadius`). This single habit does more for realism than
  any texture.

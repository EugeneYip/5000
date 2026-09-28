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

`--mask` (on by default for `photomatch`) also writes `<view>_mask.png`, the
car repainted flat magenta. `sheet.py` reads the car through that silhouette
and prints a 16-bucket luminance histogram beside the photograph's. That
printout is the scoreboard; the single `tone profile` figure at the top of it
is the percentage of the car's pixels that would have to change bucket to
match. **Do not calibrate lighting against anything else** — the mask this
replaced was selecting 57 % of the frame, so every per-car number the gate
printed for several rounds was a whole-scene number, and the two constants it
compared against were invented. Details in `docs/REFERENCE-PHOTO.md` § Tone.

**Probe the surface you care about, not the bounding box around it.** A grid
search over the instrument pack sampled the front plane of
`__AUDI.bbox('cluster')` — which is the front of a 16 mm surround, about 5 mm
proud of the wall that was actually covering the dials — and reported the pack
64 % visible when it was 0 % visible from every camera position at every
height. The bounds of a part are not the part.

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

**Namespace your scratch files.** The session scratchpad is shared between
every stream running at once, not per-stream. Two streams both wrote
`probe.mjs` and one silently replaced the other's mid-round. Prefix yours.

## House style

- TypeScript, strict. `npx tsc --noEmit` clean.
- Comments explain *why*, and only where a reader would otherwise wonder.
  Do not narrate what the code plainly does.
- Geometry helpers go in your own directory. Do not add dependencies without
  asking — Three.js and its `examples/jsm` addons are already available and
  are almost always enough.
- Performance.

  **Do not read `renderer.info` and do not apply a correction factor to it.**
  Use `__AUDI.census()`, which counts the scene once by traversal and prints
  the reported figures beside its own:

      front3q     meshes 284 (+31 hidden)  tris 971,694  mats 67   multiplier 2.64
      photomatch  meshes 284               tris 971,694            multiplier 1.97
      wheel       meshes 284               tris 971,694            multiplier 1.59
      interior    meshes 284               tris 971,694            multiplier 1.36

  The scene is rasterised more than once a frame — the transmission pass
  re-renders the opaque scene because the glazing and the lamp lenses are
  transmissive — so `renderer.info` comes back inflated. **The inflation is
  not a constant.** It moves with how many passes run and with what survives
  frustum culling in each, which is why it ranges 1.36 to 2.64 above.

  This file used to say "about 2.92×" and work an example from it. That was
  true when GTAO rendered its own normal/depth pass; it stopped doing that
  when it was handed the colour pass's depth (`gtao.setGBuffer`), and the note
  did not follow. A stale correction factor is worse than none: agents on this
  project have been sent optimising geometry that was already inside budget,
  and a later stream applying 2.92 today would conclude the car is 40 %
  smaller than it is.

  Two traps `census()` exists to close:

  - **Hiding the car root and taking the delta does not give the car's draw
    count.** It gives the car's meshes multiplied by the pass count, which is
    the same error in a different hat.
  - **`__AUDI_MAT.audit()` skips invisible meshes.** Thirty-one meshes are
    hidden at rest — the spin-blur discs, several interior parts — so an audit
    that comes back clean has not necessarily seen everything.

  Budget: ≤ 1.2 M triangles counted once, ≤ 220 draws, 60 fps at 1080p. Merge
  static geometry. Instance repeated parts (slats, bolts, tread blocks).

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
- **Relief is only drawn where a vertex lands in it.** A 22 mm stitch trough on
  a 13 mm station pitch needs a station *inside* the trough, and authoring the
  seam at a parametric `v` does not make one: a seam at v 0.755 on a 44-station
  loft falls between rows 33 and 34, so the deepest point of every stitch line
  in the car was a place with no vertex in it. Snap features to the nearest
  station or ring before evaluating them. The same trap explains relief that
  "does not show up" at any amplitude.
- **A texture authored in object space has a physical pitch — do not rescale it
  per part.** The cabin weave is 620 yarns/m of object-space position, i.e. a
  1.6 mm yarn, which is what a real cloth has. If one part reads as sackcloth
  and another as fine cloth, the parts are the wrong size or the wrong material,
  not the texture.

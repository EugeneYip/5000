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
- **`__AUDI.pick` drops hidden geometry by default now.** Three's raycaster
  does not test `visible`, so `headlampShaft` — a 16 m cone of scattered air
  that is off unless the lamps are lit, with a frame-sized bounding box — was
  the frontmost hit on 35 % of samples aimed at the front of the car, and it
  cost three separate rounds probe cycles before each noticed. Pass
  `{ includeHidden: true }` to get the old behaviour, which is the right tool
  for a bit-identical A/B: hide a thing, keep the ray set, and only the pixels
  move.
- **`shoot.mjs`'s perf line is not a performance measurement.** It comes from
  `renderer.info`, and it moves by a factor of two on identical code. Two ways:
  the probe used to run from whatever view was shot *last*, and frustum culling
  at a close-up drops most of the scene — `last = photomatch` gave draws 567 /
  2,030,328 tris where `last = wheel` gave **270 / 1,416,667**, same commit. It
  is pose-pinned now and prints `@photomatch`. But even pinned it reads 567 in
  a one-view run and **759 in a three-view run**, the same 1.34× on draws and
  triangles, because `renderer.info` is per-frame and what lands in the sampled
  frame (a shadow update, an IBL bake) changes it.
  **Use `__AUDI.census()`, which traverses the scene once.** It says 288 meshes
  / 1,052,982 triangles / 73 materials, against a 220-draw target and a 1.2 M
  triangle budget. I read the 270-vs-567 pair as "draw calls halved" and
  committed it as a verified isolation in `bfd6f10`; it was two different poses.
- **A bbox on a MERGED mesh is worse than useless.** "The bounds of a part
  are not the part" has now cost three rounds, and the third was the worst
  because the numbers looked so specific. A critique reported the windscreen
  seal standing 20-23 mm proud of the glass from `fixedGlassOuter` 0.836 /
  `fixedSeals` 0.856 / `fixedSurround` 0.859. All three are true bounding
  boxes — and `fixedGlassOuter` merges the windscreen with the rear quarter,
  spanning z −3.430…−0.437, so its 0.836 is the widest point of the
  greenhouse **2.5 m away from the pillar being discussed**. At the A-pillar
  station the seal reads 2.0 mm proud, which is exactly `flushOffset`. It was
  never wrong. Measure at the station you are talking about, with `pick` on a
  common ray, and if you quote a bbox say which mesh it is and check what else
  got merged into it. It has now happened a **fourth** time, on
  `headlampDivider`: a critique reported "a divider that divides nothing"
  because the box read ±0.692, the lens's own inboard edge. The mesh is a
  merge of *two* dividers at 0.535 and 0.688 and a box round both can only
  report the outer one. The divider existed.
- **Check a new `gridSurface`'s handedness against `bowl`.** `gridSurface` has
  y *decreasing* with `v` where `bowl` and `slab` both have it *increasing*, so
  the same `flip` argument produces opposite winding. A reflector shelf built
  that way came out facing −Z, and `MeshPhysicalMaterial` is `FrontSide`: the
  panel was present in the scene, absent from every frame, and measured as
  "worth +0.6 of a grey level". Two shoot cycles to find. A back-facing panel
  does not error, does not warn, and does not show up in `census()`.
- **Never threshold a reference photograph on luminance.** The red car on
  `scratchpad/ref3/bat_side_profile.jpg` has paint at RGB (160, 1, 0) —
  **luma 34**, below the luma-60 line that separates black plastic from paint
  on the silver car. A luma scan of that frame classifies the entire flank as
  trim: every door column drops out silently, the rear quarter survives
  because the light is different there, and you get a confident slope fitted
  to one end of a car. That is exactly what produced "the red car is level to
  4 mm", which stood for two rounds and blocked the strip line. Segment on
  chroma, or on `V = max(R, G, B)` — paint reads 160-180 and trim 5-20 on
  **both** cars. The tell that you have this bug is a column count far below
  what the span should give you; print it.
- **The gate is bimodal across boots.** The same committed build read tone
  profile 11.4, 11.4 and 10.8 on three identical runs, with `dRGB` 31.9 vs
  33.2 and the car mask 16.6 vs 16.7 % tracking the same two states.
  **Nothing under about 0.5 of tone profile is a result.** Run three to five
  times. fps is worse: the same build read 9.3, 23.1 and 44.6 at `front3q`
  within a few minutes while other streams were rendering — interleave an A/B
  in a quiet window or do not quote it.
- **The dev server issues a full reload of its own shortly after first load**,
  which destroys `__AUDI` and returns the rig to `front3q` with the HUD up.
  `tools/shoot.mjs` used to optional-chain every call into it, so it silently
  no-opped and shot whatever was on screen — a silhouette frame taken in that
  window is a `front3q` frame with no silhouette in it. It throws now. Any
  probe of your own must wait the reload out and re-apply the pose.
- **A live sweep in one boot is not reliable on this app.** Two failure modes,
  both of which have nearly shipped a wrong conclusion. Mutating a property on
  an existing material does **not** re-upload its uniforms — three only
  refreshes when the material id or `version` changes, and `roughness`,
  `color` and `envMapIntensity` bump neither, so one sweep can silently report
  the same frame three times. And `material.clone()` on an `extend()`ed
  material loses about **12 grey levels** on its own, so a "restored" clone
  reads lower than the original. Assign a **new material object**, and confirm
  anything that matters with a real build. Playwright will also hand back a
  stale swap-chain frame: put a throwaway screenshot between two settles.
- **To get the live scene graph from a probe, hook
  `Raycaster.prototype.intersectObject`** — `__AUDI.pick` passes `stage.scene`
  straight into it. Patching `WebGLRenderer.render` catches nothing, because
  it is an instance property and not a prototype method.
- **+X is the car's LEFT.** `hardpoints.ts` said "+X right" for most of this
  project's life and the mesh names follow that, so `mirrorSailRight` is at +X
  and `doorFR` is on the left. A review reported the fuel filler on the wrong
  flank by trusting those names; it is correct. The steering wheel is not — it
  is at −X, which is the car's right, so the car is built right-hand drive.
  **Never reason about a side from a mesh name.** Check the sign against the
  note at the top of `hardpoints.ts`, or with `__AUDI.pick` on the `side` pose.
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

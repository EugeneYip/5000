/**
 * The flanks: rubbing strips, door handles, fuel flap, weatherstrip.
 *
 * Two of these are model-year tells and both are settled in
 * `docs/REFERENCE-VEHICLE.md`:
 *
 *  · **Recessed pull door handles.** The flush handle arrives with the
 *    January 1988 European facelift, which reaches the US only with MY1989 and
 *    the rename to Audi 100 (§6.8). A MY1988 5000 S is pre-facelift
 *    throughout, so the handle sits in a pressed pocket with the lever
 *    pivoting out of it.
 *  · **The rubbing strip carries a thin bright line along its top edge**
 *    (§6.10) — but *not* the red-and-gold pinstripe on the car that evidence
 *    came from, which is a dealer decor item and appears in no factory list.
 *
 * The strip is swept along the body's own surface rather than along a straight
 * line, because the flank has 19° of tumblehome at strip height and a strip
 * built on a plane would sink into the door at the middle and lift off it at
 * the ends.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { audiMaterials } from '@/materials/library';
import { QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import { sideNormal, sidePoint, skinFrame, roofOuterNormal, roofOuterPoint, type SkinFrame } from './bodyref';
import { badgeText } from './glyphs';
import {
  at, clamp, DEG, dish, framesFrom, lathe, lerp, merge, mesh, mirrorX, offsetPolyline,
  roundedBox, smoothstep, sweep, type Frame, type Pt,
} from './util';

const S = HP.side;

// ---------------------------------------------------------------------------
// Frames along the flank
// ---------------------------------------------------------------------------

/** Frames from the tail forward, so the section's up vector comes out up. */
function flankFrames(zRear: number, zFront: number, y: number, n: number): Frame[] {
  const pts: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const z = lerp(zRear, zFront, i / n);
    pts.push(sidePoint(z, y));
    nor.push(sideNormal(z, y));
  }
  return framesFrom(pts, nor);
}

// ---------------------------------------------------------------------------
// Rubbing strip
// ---------------------------------------------------------------------------

/**
 * `docs/CRITIQUE-2.md` §7 measured the built moulding at **57 mm** against
 * **99 mm** on the calibrated blueprint (column scans at z −1.0 / −1.6 / −2.2
 * give y 538 → 637) and **≈97 mm** off `GCFS-85`'s door columns. The strip was
 * grown upward with its bottom edge held, which also brought its top to within
 * 11 mm of the bumper mouldings' own bead instead of 65 mm below it. On the
 * real car those two are one continuous line round the corner — see the note
 * on `capStrip` in `buildSides` for how far ours has got.
 *
 * Both figures are now in `hardpoints.ts` and read from there; this file used
 * to carry local copies of them and a note saying the hardpoints were wrong.
 *
 * ## The bright cap is 13 mm, and its bounding box says 32 mm
 *
 * A trap worth the paragraph, because a review round read the bbox and
 * concluded the cap was twice its height. `__AUDI.bbox('rubStripLine')` gives
 * y **0.606–0.638**, but 0.606 is not on the flank: `rubbingStrip` tapers the
 * section to 0.55 over the last 45 mm at each end so the moulding dies into
 * the arch instead of ending square, and that taper pulls the bead's *scaled*
 * bottom edge to 0.607 at the two tips. The cap is `STRIP_FACE[0..3]` offset
 * 1.4 mm, so between the arches it is exactly `STRIP_Y + HH − 0.0134` to
 * `STRIP_Y + HH`, i.e. y **0.6231–0.6365 = 13.4 mm** of a 98 mm band.
 *
 * Confirmed by column scan rather than by reading that back off the source:
 * `__AUDI.pick` over x 420–1260 at `side` gives the cap 4 px at y 0.625–0.635
 * above 25 px of moulding at 0.541–0.622, and 6–8 px of 23–32 at `front3q`.
 * **Not one of those rows comes back with an upward-facing normal** — the
 * whole cap is between n·y 0.24 and 0.86, no row above 0.9 — so the sky-facing
 * shelf that `5b4becd` found under the front bumper bead is not present here.
 * That was the first thing to rule out and it is ruled out.
 *
 * On `bat3_side_profile.jpg` (front/rear hub centres 1025 px apart for a
 * 2687 mm wheelbase, so 2.62 mm/px) the cap measures 4.6 px = **12 mm** of a
 * 36 px = 94 mm band, i.e. **13 %** against our 13.7 %. It is right.
 *
 * (That same trace puts the whole band at 89–94 mm where the blueprint and
 * `GCFS-85` give 97–99. One photograph against two calibrated sources is not
 * enough to move `rubStripHeight`, so it is recorded here and reported, not
 * acted on.)
 *
 * ⚠ The blueprint's **"18 mm at 601–619"** in §7 is not this part. Both
 * photographs put body paint immediately above the bright cap, with the
 * flank's own feature line creasing it ~20 mm higher: at the door shutline in
 * `bat3_side_profile.jpg` at 14× the shutline runs uninterrupted through the
 * band above the cap and is cut by the moulding's end cap only at the cap
 * itself. 601–619 is that paint, so a bead built to it would sit 18 mm below
 * the moulding's top edge with dark plastic above it, which no photograph of
 * the car shows.
 *
 * ## The line dies 281 mm short of the rear bumper, and 40 mm above it
 *
 * Reported, not fixed: both ends of it are hardpoints and the far end is
 * `bumpers.ts`. Measured off `__AUDI.bbox` —
 *
 *   frontRubStrip  z  0.497 … 1.079   y 0.618–0.632
 *   rubStripLine   z −3.420 … 0.495   y 0.623–0.638
 *   rearRubStrip   z −3.814 … −3.701  y 0.582–0.594
 *
 * — the front bead wraps 582 mm and meets this cap within 2 mm of z, which is
 * why the nose reads as one part. The **rear** bead wraps only 113 mm, so
 * between z −3.420 and −3.701 the bright line simply stops; picked at `side`,
 * x 1430–1490 returns nothing but `quarterR`, so what looks in the frame like
 * the moulding carrying on is painted quarter panel in shadow. And the rear
 * bead's centreline sits at y 0.588 against 0.630 here and 0.625 at the nose
 * — **42 mm low**, so even where it does exist it is not on this line.
 *
 * `bat3_side_profile.jpg` has the bright cap unbroken to within 63 mm of the
 * rearmost point of the car, at one height the whole way. `HP.rear.rubStripY`
 * went 0.613 → 0.588 in `7bf4046` on the reading that "0.613 described the old
 * full-height band, not a bead"; the bead's *height* is what `rubStripHeight`
 * describes, and its centre still belongs on the line, so that correction
 * looks like it moved the wrong number. See the stream report.
 */
const STRIP_HEIGHT = S.rubStripHeight;
const STRIP_Y = S.rubStripY;

const HH = STRIP_HEIGHT / 2;

/** Outer face of the moulding: a soft crown, fullest a little above centre. */
const STRIP_FACE: Pt[] = [
  [0.0000, HH],
  [0.0058, HH - 0.0022],
  [0.0104, HH - 0.0064],
  [0.0132, HH - 0.0134],
  [0.0142, HH - 0.0250],
  [0.0132, -HH + 0.0150],
  [0.0102, -HH + 0.0068],
  [0.0054, -HH + 0.0022],
  [0.0000, -HH],
];

function stripSection(scale: number): Pt[] {
  const face = STRIP_FACE.map(([x, y]) => [x * scale, y * scale] as Pt);
  return [...face, [-0.016, -HH * scale], [-0.016, HH * scale]];
}

function rubbingStrip(): { body: THREE.BufferGeometry; bright: THREE.BufferGeometry } {
  const frames = flankFrames(S.rubStripRearZ, S.rubStripFrontZ, STRIP_Y, 86);
  const span = Math.abs(S.rubStripFrontZ - S.rubStripRearZ);
  const capFrac = 0.045 / span;

  const body = sweep(
    (_j, t) => stripSection(lerp(0.55, 1, smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1)))),
    frames,
    { closed: true, capStart: true, capEnd: true, uvScale: 0.25 },
  );

  // The bright line along the top edge, offset off the moulding's own profile
  // so the two can never drift apart.
  const line = offsetPolyline(STRIP_FACE.slice(0, 4), -0.0014);
  const bright = sweep(
    (_j, t) => {
      const k = smoothstep(clamp(Math.min(t, 1 - t) / capFrac, 0, 1));
      return line.map(([x, y]) => [x * lerp(0.55, 1, k), y * lerp(0.55, 1, k)] as Pt);
    },
    frames,
    { uvScale: 0.25 },
  );
  return { body, bright };
}

// ---------------------------------------------------------------------------
// Door handles — pre-facelift recessed pull
// ---------------------------------------------------------------------------

/**
 * Pre-facelift recessed pull handle (§6.8).
 *
 * A pocket pressed into the door skin — body-coloured, because it *is* the
 * door skin — with a black lever across its top and the finger gap under it.
 * The lock barrel goes on the driver's door only, which on a LHD car is the
 * left one.
 */
function handle(f: SkinFrame, withLock: boolean): {
  pocket: THREE.BufferGeometry;
  lever: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
} {
  const [w, h, d] = S.handleSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, dx: number, dy: number, dn: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(
      f.o.x + f.along.x * dx + f.up.x * dy + f.n.x * dn,
      f.o.y + f.along.y * dx + f.up.y * dy + f.n.y * dn,
      f.o.z + f.along.z * dx + f.up.z * dy + f.n.z * dn,
    );
    return g;
  };

  const pocket = place(dish(w + 0.030, h + 0.030, d, { shape: 4.2, rim: 0.0010, floor: 0.46 }), 0, 0, 0);
  // Lever across the top of the pocket; the gap beneath it is the finger hole.
  const lever = place(roundedBox(w - 0.014, h * 0.54, 0.015, 0.0038), -0.002, h * 0.26, -0.0098);

  const bright: THREE.BufferGeometry[] = [];
  if (withLock) {
    const barrel = lathe([
      [0, 0.0030], [0.0062, 0.0029], [0.0082, 0.0018], [0.0088, 0],
      [0.0104, -0.0012], [0.0104, -0.0090], [0, -0.0090],
    ], 18);
    barrel.rotateX(Math.PI / 2);
    bright.push(place(barrel, w / 2 + 0.020, 0, 0.0016));
  }

  return { pocket, lever, bright: merge(bright) };
}

// ---------------------------------------------------------------------------
// Fuel flap
// ---------------------------------------------------------------------------

function fuelFlap(f: SkinFrame): { well: THREE.BufferGeometry; flap: THREE.BufferGeometry } {
  const [w, h] = S.fuelFlapSize;
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  const place = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
    g.applyMatrix4(m);
    g.translate(f.o.x + f.n.x * lift, f.o.y + f.n.y * lift, f.o.z + f.n.z * lift);
    return g;
  };
  const well = place(roundedBox(w + 0.006, h + 0.006, 0.040, 0.010), -0.021);
  const flap = place(roundedBox(w - QUALITY.panelGap * 2, h - QUALITY.panelGap * 2, 0.012, 0.009), 0.0005);
  return { well, flap };
}

// ---------------------------------------------------------------------------

export function buildSides(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sideTrim';

  const plastic = ctx.materials.bumperPlastic();
  const bright = ctx.materials.chrome({ roughness: 0.2 });
  const dark = ctx.materials.blackTrim();
  const paint = ctx.materials.paint();
  const seal = ctx.materials.rubber({ roughness: 0.96 });

  /**
   * The moulding's bright cap and the bumper caps' bead are **one extrusion**
   * on the real car — the line crosses both wheel arches with nothing but a
   * small step at the joint — so this keeps `bumpers.ts`'s colour, `0xd0d4d8`,
   * which four real builds there settled against the licence plate.
   *
   * It was `chrome({ roughness: 0.2 })`, which quantises to the `chrome:0.180`
   * rung and an effective roughness of 0.152 — a mirror. On a flank that is
   * the worst place for one: the cap's crown turns through 69° of sky over its
   * top 6 mm, so at `side` the line came back **(83,103,138) → (190,174,157)**
   * top to bottom, B−R **+55 to −33**, a blue-over-orange pinstripe peaking at
   * L 174 where the reference reads a neutral L 250. Do not put it back:
   * `5b4becd` measured `chrome()` at both the 0.152 and 0.30 rungs blowing the
   * bumper corners and taking the tone profile to 14.0.
   *
   * ## Why `anodised()` and not the bead's own `dirtyMetal({ metalness: 0.35 })`
   *
   * Because at metalness 0.35 two thirds of the response is Lambertian and a
   * Lambertian bead has no range. Column-scanned at `side` over the whole run
   * between the arches (y 475–479, x 300–1330), the cap on that finish read
   * **p50 145, p95 155, max 158, nothing above 176 anywhere** — a flat ribbon.
   * Both reference photographs have it clipped: `bat3_side_profile.jpg` peaks
   * **L 253–254 across the front bumper and fender together** and **237–251**
   * along the rear quarter, with the row immediately above it down at 85–92.
   * The real extrusion is dark over its shaded edge and blown over its lit
   * face, thirty millimetres apart.
   *
   * Three real builds, one view per boot — a live sweep cannot be trusted here
   * (`docs/WORKSTREAM.md`) — over that same band:
   *
   *   dirtyMetal m0.35 r0.62   p50 145  p95 155  max 158   >176  0.0 %
   *   anodised         r0.32   p50 134  p95 178  max 192   >176  5.8 %
   *   anodised         r0.42   p50 150  p95 182  max 194   >176  7.7 %
   *
   * `0.42` over `0.32`: the same median as the shipped bead (so the two still
   * read as one line at the arch) with the range on top of it, and a weaker
   * blue fringe on the sky-facing top row — B−R +26 against +41, where the
   * reference reads +13. It is also the rung `createAnodised`'s own three
   * builds preferred, for the same reason: the narrower rung's glint is longer
   * and drags a bloom skirt onto the moulding under it.
   *
   * ⚠ **`bumpers.ts` has not made this move**, so the bead and the cap are no
   * longer one registry instance. They are still one colour, and at `side` the
   * peak steps 163 → 190 across the front joint where the photograph steps by
   * about nothing — because in the photograph *both* are clipped and it is the
   * bead that cannot get there. `frontRubStrip`/`rearRubStrip` want exactly
   * this call; when they take it the two collapse back onto one instance with
   * no other change.
   */
  const capStrip = audiMaterials(ctx.materials).anodised({ color: 0xd0d4d8, roughness: 0.42 });

  // --- rubbing strip -------------------------------------------------------
  const strip = rubbingStrip();
  group.add(mesh('rubStrip', merge([strip.body, mirrorX(strip.body)]), plastic));
  group.add(mesh('rubStripLine', merge([strip.bright, mirrorX(strip.bright)]), capStrip));

  // Small oval "audi" on the front-fender section of the moulding, just aft of
  // the front wheel arch (§2.6).
  //
  // Baked into two meshes rather than four Object3Ds: `docs/CRITIQUE-2.md` §11
  // names `fenderBadgeGroundLeft` (24 triangles) as an example of the tiny
  // meshes putting the draw count 40 % over budget, and a badge that is
  // mirrored rather than instanced costs nothing to merge.
  {
    const z = -0.424;
    const f = skinFrame(z, STRIP_Y - 0.004);
    const onFlank = (g: THREE.BufferGeometry, lift: number): THREE.BufferGeometry => {
      const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
      m.setPosition(f.o.clone().addScaledVector(f.n, lift));
      g.applyMatrix4(m);
      return g;
    };
    const oval = new THREE.CircleGeometry(0.026, 24);
    oval.scale(1, 0.40, 1);
    onFlank(oval, 0.0146);
    const text = onFlank(badgeText('audi', 0.0092, { depth: 0.0012, tracking: 0.02, weight: '500' }), 0.0148);
    group.add(mesh('fenderBadgeGrounds', merge([oval, mirrorX(oval)]), dark));
    group.add(mesh('fenderBadges', merge([text, mirrorX(text)]), bright));
  }

  // --- mud flaps -----------------------------------------------------------
  //
  // `docs/CRITIQUE-2.md` §3 lists them as missing; `GCFS-85` shows a large one
  // hanging off the arch's trailing lip, roughly as tall as it is wide and
  // reaching down past the rocker's bottom edge. All four in one mesh — they
  // are four copies of one moulding and nothing needs them apart.
  {
    const flaps: THREE.BufferGeometry[] = [];
    // A flap bolts to the OUTSIDE of the arch's trailing lip, so its outboard
    // face has to clear `archLipX`. Sat on the tyre's outer face instead
    // (x 0.845, which is where the tread is) the top two thirds of it end up
    // inside the quarter panel and only the part hanging below the rocker
    // shows — a floating blade rather than a mud flap.
    const outboard = S.archLipX + 0.006;
    for (const axleZ of [S.archFrontCenter[2], S.archRearCenter[2]]) {
      // Just aft of where the arch opening's trailing edge meets the body, so
      // the flap reads as bolted to that lip rather than floating behind it.
      const z = axleZ - S.archRadius - 0.012;
      const g = roundedBox(0.200, 0.178, 0.008, 0.004, 3);
      // Leaning back at the bottom, the way a rubber flap hangs at rest.
      g.rotateX(-7 * DEG);
      g.translate(outboard - 0.100, 0.218, z);
      flaps.push(g, mirrorX(g));
    }
    group.add(mesh('mudFlaps', merge(flaps), plastic));
  }

  // --- door handles --------------------------------------------------------
  const pockets: THREE.BufferGeometry[] = [];
  const levers: THREE.BufferGeometry[] = [];
  const locks: THREE.BufferGeometry[] = [];
  for (const [z, isFront] of [[S.handleFrontCenter[2], true], [S.handleRearCenter[2], false]] as const) {
    const right = handle(skinFrame(z, S.handleFrontCenter[1]), false);
    pockets.push(right.pocket, mirrorX(right.pocket));
    levers.push(right.lever, mirrorX(right.lever));
    // LHD car: the lock barrel is on the driver's — left-hand — front door.
    if (isFront) {
      const left = handle(skinFrame(z, S.handleFrontCenter[1]), true);
      locks.push(mirrorX(left.bright));
    }
  }
  group.add(mesh('doorHandlePockets', merge(pockets), paint));
  group.add(mesh('doorHandleLevers', merge(levers), dark));
  group.add(mesh('doorLock', merge(locks), bright));

  // --- fuel flap: left-hand quarter on this car ---------------------------
  {
    const f = skinFrame(S.fuelFlapCenter[2], S.fuelFlapCenter[1]);
    const parts = fuelFlap(f);
    group.add(mesh('fuelWell', mirrorX(parts.well), dark));
    group.add(mesh('fuelFlap', mirrorX(parts.flap), paint));
  }

  // --- belt weatherstrip under the DLO ------------------------------------
  {
    const frames = flankFrames(HP.glass.dloRearZ, HP.glass.dloFrontZ, HP.beltY - 0.007, 48);
    const sec: Pt[] = [
      [0.0000, 0.0085], [0.0042, 0.0072], [0.0060, 0.0030],
      [0.0056, -0.0028], [0.0030, -0.0068], [0.0000, -0.0082],
      [-0.0090, -0.0082], [-0.0090, 0.0085],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('beltSeal', merge([g, mirrorX(g)]), seal));
  }

  // --- roof-to-bodyside moulding, in place of a drip rail (§2.2) ----------
  //
  // Swept on `roofOuterPoint`, the joint itself, so the 22 mm section straddles
  // it — 11 mm up on the roof skin, 11 mm down onto the daylight opening, which
  // is where the glazing's blackout runs underneath. Swept on `roofEdgePoint`
  // it sat wholly inboard and its outboard lip only just reached the joint.
  //
  // It runs the body's continuous DLO top line end to end: the tailgate hinge
  // aft, where the tailgate shutline leaves `tRoofOuter` and rakes down across
  // the D-pillar, and z −0.700 forward, where the A-pillar's lower edge leaves
  // it and drops to the beltline (`aPillarLower`'s smoothstep in
  // `body/panels.ts`). Short of either end the bead stops in mid-air on a line
  // the eye follows right past it.
  {
    const pts: THREE.Vector3[] = [];
    const nor: THREE.Vector3[] = [];
    const z0 = HP.rear.tailgateHingeZ;
    const z1 = -0.700;
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const z = lerp(z0, z1, i / n);
      pts.push(roofOuterPoint(z));
      nor.push(roofOuterNormal(z));
    }
    const frames = framesFrom(pts, nor);
    const sec: Pt[] = [
      [0.0000, 0.0110], [0.0032, 0.0096], [0.0044, 0.0040],
      [0.0038, -0.0040], [0.0016, -0.0098], [0.0000, -0.0112],
      [-0.0070, -0.0112], [-0.0070, 0.0110],
    ];
    const g = sweep(sec, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.25 });
    group.add(mesh('roofMoulding', merge([g, mirrorX(g)]), dark));
  }

  void at;
  return group;
}

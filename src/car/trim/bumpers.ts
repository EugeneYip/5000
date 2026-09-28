/**
 * The 5 mph impact bumpers.
 *
 * These are the single most characteristic thing about a US-market C3 and the
 * easiest to under-do. `HP.front.bumperZ` puts the face 226 mm ahead of the
 * headlamp plane, so the top of the moulding is a *shelf* a good hand's-width
 * deep standing out in front of the lamps. Flattening that back into a
 * European-looking blade is the difference between a 5000 and a 100.
 *
 * Two corrections from `docs/REFERENCE-VEHICLE.md` §6.3 are built in:
 *
 *  · the bright rub strip caps the moulding's **upper edge**, it does not run
 *    across the middle of its face — the brochure scan that suggested
 *    mid-height was simply too coarse to read;
 *  · the amber at the bumper end is a **small discrete marker**. The big
 *    wrap-around amber is inside the headlamp, which is the lights stream's.
 *
 * Geometry is one section swept along a plan-form spine, with the section's
 * return depth shortening as it wraps the corner so the moulding always buries
 * itself in the wing rather than hanging in space.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { LIGHTS, QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import { rearFaceZ, rearHalfWidth } from './bodyref';
import {
  at, clamp, framesXZ, lathe, lerp, merge, mesh, offsetPolyline, profileStrip,
  roundedBox, smoothstep, sweep, type Frame, type Pt,
} from './util';

/**
 * Plan-form of the NOSE moulding, as (half-width, distance back from the
 * face) — flat across the middle, then wrapping hard round the corner and
 * running aft to die into the wing just ahead of the wheel arch.
 *
 * ⚠ This is the nose's plan and only the nose's. It was used for the tail too
 * and the tail is a completely different shape: see `tailPlan`.
 */
const PLAN: ReadonlyArray<readonly [number, number]> = [
  [0.000, 0.000], [0.140, 0.0015], [0.280, 0.006], [0.400, 0.015],
  [0.520, 0.030], [0.620, 0.052], [0.700, 0.080], [0.770, 0.117],
  [0.826, 0.163], [0.866, 0.218], [0.892, 0.282], [0.903, 0.352],
  [0.905, 0.424], [0.898, 0.492], [0.882, 0.548], [0.858, 0.590],
];

/**
 * Resample the half plan-form into a full, symmetric spine.
 *
 * Through a spline, not straight between the control points: the moulding is
 * smooth-shaded, so a piecewise-linear plan puts a faint vertical crease down
 * the bumper at every control station and they are clearly visible in a
 * three-quarter render.
 */
function spine(faceZ: number, sign: 1 | -1, samples = 6): Array<[number, number]> {
  const curve = new THREE.CatmullRomCurve3(
    PLAN.map(([x, d]) => new THREE.Vector3(x, 0, faceZ + sign * -d)),
    false,
    'catmullrom',
    0.5,
  );
  const n = (PLAN.length - 1) * samples;
  const half: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n);
    half.push([p.x, p.z]);
  }
  const left = half.slice(1).reverse().map(([x, z]) => [-x, z] as [number, number]);
  return [...left, ...half];
}

/**
 * Plan-form of the TAIL moulding: the tail's own rear face, carried aft by the
 * standoff `HP.rear.bumperZ` asks for at the centreline.
 *
 * The nose's `PLAN` was being swept at both ends of the car and the two
 * plan-forms are nothing like each other. The nose falls away from the
 * centreline almost at once — 30 mm by half-width 0.520 — while the tail's
 * rear face is flat to |x| ≈ 0.55 and then wraps hard. Swept at the tail,
 * `PLAN` put the moulding 38 mm forward of its own crown at x 0.569 where the
 * body had moved 3 mm, so everything outboard of about half-width sat *behind*
 * the sheet metal and `body.ts`'s `rearLower` occluded it. `__AUDI.pick`
 * straight at the bumper returned `rearLower` first and `rearBumper` 16 mm
 * behind it from |x| ≈ 0.5 outwards.
 *
 * It survived three reviews because the old moulding was 244 mm tall: the
 * middle metre of it still read as a black bar and nobody asked why the ends
 * faded. At the re-derived 113 mm there is not enough left to hide the fault.
 *
 * Built from `rearFaceZ` rather than written down, so the moulding wraps
 * exactly where the body does and a change to the tail's section cannot leave
 * it buried again.
 */
function tailPlan(midY: number, samples = 40): Array<[number, number]> {
  // Constant along the span, and set by the hardpoint: at the centreline the
  // crown lands on `HP.rear.bumperZ` exactly, as it did before.
  const standoff = rearFaceZ(0, midY) - HP.rear.bumperZ;
  const xEnd = rearHalfWidth(midY) - 0.006;
  const half: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const x = (xEnd * i) / samples;
    // The last eighth of the span gives the standoff back, so the moulding
    // dies into the quarter panel instead of ending in the silhouette.
    const k = 1 - smoothstep(clamp((x / xEnd - 0.875) / 0.125, 0, 1));
    half.push([x, rearFaceZ(x, midY) - standoff * k]);
  }
  const left = half.slice(1).reverse().map(([x, z]) => [-x, z] as [number, number]);
  return [...left, ...half];
}

/**
 * Height of the tail's bright cap strip.
 *
 * It was `HP.front.rubStripHeight`, 46 mm, because one `rubStrip` serves both
 * ends of the car and only the nose had a figure. That is a hard-coded
 * equivalent of a moved hardpoint: it did not move when
 * `HP.rear.bumperTopY`/`bumperBottomY` cut the tail moulding from 244 mm to
 * 113 mm, so the strip went from a fifth of the part to two-fifths of it and
 * the render's tail acquired a chrome band the width of the car.
 *
 * On `bat_rear_straight_b.jpg` the bright line measures 8.5 px at x 1450 and
 * 10 px at x 880 — 11 to 13 mm at 1.324 mm/px — against ~100 mm of black
 * below it, and the two together are the 113 mm the hardpoints allow. The
 * strip caps the moulding's top roll, so the dead-astern band is roughly
 * `stripHeight` less the 12 mm of roll above the face: 24 mm here projects
 * as ~12. `HP.rear` wants its own `rubStripHeight` — reported.
 */
const REAR_STRIP_HEIGHT = 0.024;

/** 0 at the centreline, 1 at the very tip of the wrap. */
function wrapK(x: number): number {
  return smoothstep(clamp((Math.abs(x) - 0.60) / 0.30, 0, 1));
}

export interface BumperSpec {
  faceZ: number;
  topY: number;
  bottomY: number;
  /** +1 for the nose (the moulding faces +Z), −1 for the tail. */
  sign: 1 | -1;
  valanceBottomY: number;
  /**
   * Height of the bright cap strip down the moulding's top edge.
   *
   * Per end, because the two are not the same part and were sharing
   * `HP.front.rubStripHeight`. 46 mm is a fifth of the nose's 246 mm moulding
   * and two-fifths of the tail's re-derived 113 mm — see `REAR_STRIP_HEIGHT`.
   */
  stripHeight: number;
  /** Plan-form, as (half-width, z). The nose's `PLAN` is not reusable here. */
  plan: Array<[number, number]>;
}

/** How far the face falls back from its crown at height `y`. */
function crown(s: BumperSpec, y: number): number {
  const mid = (s.topY + s.bottomY) / 2;
  const half = (s.topY - s.bottomY) / 2;
  const k = clamp((y - mid) / half, -1, 1);
  // Slightly more tuck under the bottom than over the top: the moulding rolls
  // under towards the valance and stands nearly vertical at its top.
  return -0.0125 * k * k - (k < 0 ? 0.0042 * k * k : 0);
}

/** Outer profile of the moulding, face and both rolls, top to bottom. */
function outerProfile(s: BumperSpec): Pt[] {
  const t = s.topY;
  const b = s.bottomY;
  return [
    [-0.0325, t + 0.0110],
    [-0.0182, t + 0.0072],
    [-0.0092, t + 0.0034],
    [-0.0040, t - 0.0018],
    [-0.0026, t - 0.0078],
    ...profileStrip(t - 0.016, b + 0.024, 9, (y) => crown(s, y)),
    [crown(s, b + 0.015) - 0.0022, b + 0.0150],
    [crown(s, b + 0.007) - 0.0076, b + 0.0070],
    [-0.0170, b + 0.0016],
    [-0.0290, b - 0.0012],
    [-0.0470, b - 0.0030],
  ];
}

/** Closed section: outer profile, then the return that buries it in the body. */
function section(s: BumperSpec, depth: number): Pt[] {
  const outer = outerProfile(s);
  const back = -depth;
  return [
    [back, s.topY + 0.0190],
    ...outer,
    [back * 0.86, s.bottomY - 0.0120],
    [back, s.bottomY - 0.0140],
  ];
}

function buildMoulding(s: BumperSpec): { geo: THREE.BufferGeometry; frames: Frame[] } {
  const pts = s.plan;
  const frames = framesXZ(pts, 0).map((f) => (s.sign > 0 ? f : { ...f, r: f.r.clone().negate() }));
  const geo = sweep(
    (j) => section(s, lerp(0.255, 0.062, wrapK(pts[j][0]))),
    frames,
    { closed: true, capStart: true, capEnd: true, flip: s.sign > 0, uvScale: 0.18 },
  );
  return { geo, frames };
}

/** The bright strip that caps the moulding's top edge. */
function rubStrip(s: BumperSpec, frames: Frame[]): THREE.BufferGeometry {
  const t = s.topY;
  const along: Pt[] = [
    [-0.0430, t + 0.0128],
    [-0.0245, t + 0.0092],
    [-0.0125, t + 0.0050],
    [-0.0055, t + 0.0002],
    [-0.0032, t - 0.0062],
    ...profileStrip(t - 0.013, t - s.stripHeight + 0.004, 4, (y) => crown(s, y)),
  ];
  const lifted = offsetPolyline(along, -0.0017);
  return sweep(lifted, frames, { flip: s.sign > 0, uvScale: 0.06 });
}

/**
 * Lower valance / air dam. Body-coloured on this car — §6.3 reconciles the
 * brochure's "integrated body-colored bumper aprons" with the dark moulding:
 * the moulding is grey, the aprons above and below it are paint.
 *
 * It tucks *under* the moulding rather than standing out in front of it, and
 * it dies away to nothing before the wheel arch instead of wrapping.
 */
function valance(s: BumperSpec, frames: Frame[], spinePts: Array<[number, number]>): THREE.BufferGeometry {
  const b = s.bottomY;
  const drop = b - s.valanceBottomY;
  // The top of the apron is buried inside the moulding's bottom roll: leaving
  // the two edges coplanar put a row of z-fighting slashes across the valance.
  // Near-vertical where it shows under the moulding, then turning hard under
  // for the bottom half. The apron is body colour, and paint this dark only
  // reads dark when it is facing the ground rather than the sky: a gently
  // convex apron mirrors the horizon and comes out brighter than the bonnet.
  // The top edge is carried right up inside the moulding: anywhere it came out
  // level with the moulding's underside the two surfaces grazed each other and
  // left a row of dark slivers along the join.
  const shape: Array<readonly [number, number]> = [
    [-0.090, 0.060], [-0.078, -drop * 0.20], [-0.082, -drop * 0.44],
    [-0.094, -drop * 0.66], [-0.120, -drop * 0.86], [-0.158, -drop * 0.97],
    [-0.196, -drop], [-0.222, -drop + 0.004], [-0.262, -drop * 0.50], [-0.262, 0.060],
  ];
  return sweep(
    (j) => {
      const fade = 1 - smoothstep(clamp((Math.abs(spinePts[j][0]) - 0.50) / 0.22, 0, 1));
      // At the ends every point collapses onto one, so the sweep closes to a
      // line rather than leaving a shelf sticking into the wheel arch.
      return shape.map(([d, dy]) => [lerp(-0.060, d, fade), b + 0.060 + (dy - 0.060) * fade] as Pt);
    },
    frames,
    { closed: true, capStart: true, capEnd: true, flip: s.sign > 0, uvScale: 0.18 },
  );
}

// ---------------------------------------------------------------------------
// The rear apron
// ---------------------------------------------------------------------------

/**
 * Where the tail's apron stops being a face and turns under.
 *
 * Measured off `bat_rear_straight_b.jpg` on the taillamp band's own scale
 * (`lampTopY`−`lampBottomY` = 184 mm over the 139 px between the two gasket
 * minima, so 1.324 mm/px): body colour runs unbroken from the moulding's
 * lower edge at y 905 px — 0.496, `HP.rear.bumperBottomY` to 1 mm — down to
 * the underbody cut at y 1010–1020 px depending on station, i.e. 0.344 to
 * 0.357. So the apron is **145 mm**, not the ~104 the old `bumperBottomY`
 * 0.392 suggests: 0.392 is the *old* hardpoint, and there is no edge there.
 * The face is one gently convex panel with a broad highlight across its
 * middle and no crease anywhere in it. `HP.rear` has no hardpoint for the
 * bottom edge — reported.
 *
 * Built at 0.340 rather than the measured 0.350, and that is deliberate:
 * `body.ts` ends `rearLower` at 0.338, so a lip at 0.350 left 12 mm of the
 * body's own bottom edge showing *under* it, and that edge faces astern and
 * catches sky — a bright sliver exactly where the photograph is black. The
 * apron therefore ends where the panel behind it does, 10 mm low.
 */
const APRON_KNEE_Y = 0.340;

/** How far the apron's face stands proud of the painted tail behind it. */
const APRON_PROUD = 0.009;
/** …and how far its top and bottom edges are let in behind that tail. */
const APRON_BURY = 0.026;

/**
 * The tail's body-coloured apron.
 *
 * `bumpers.ts` builds `bumperTopY`→`bumperBottomY` as the black moulding, and
 * the re-derived hardpoints cut that from 244 mm to 113 mm. On the photograph
 * the 131 mm that came off is not a gap: it is apron, in body colour, and it
 * carries the lower third of the rear elevation. The crop at (380,600)–
 * (1720,1100) reads, top to bottom, lamps / body colour and the plate recess /
 * a bright strip / a *narrow* black moulding / a large body-coloured apron.
 *
 * `body.ts`'s `rearLower` does put paint across this band already, but as an
 * unbroken face from 0.338 to the tailgate shutline with no edge anywhere in
 * it, which is why the render's lower tail reads as one bland mass where the
 * photograph has a lit apron over a shadowed undercut. So this is a part, not
 * a region: 9 mm proud of that face, gently convex, with a defined lower lip
 * at `APRON_KNEE_Y` whose underside faces the road.
 *
 * There is deliberately NO valance below it, unlike the nose. Two shapes were
 * tried and both came out *brighter* than the bare gap they replaced: a
 * convex roll down to `valanceBottomY` reads the horizon, and even at 76° off
 * vertical it takes enough ground bounce to lift a 30 mm strip from L 45 to
 * L 90 where the photograph is black. What the photograph actually shows
 * under the apron's lip is the underbody in shadow, which is what is there.
 *
 * Conformed per point to `rearFaceZ` rather than swept at a constant depth —
 * the tail face comes forward 47 mm over the half-span and another 29 mm over
 * the apron's own height, and a section that ignored either would float off
 * the body at the corners. Same construction as `spoiler.ts`'s black band.
 */
function rearApron(s: BumperSpec): THREE.BufferGeometry {
  const top = s.bottomY;
  const knee = APRON_KNEE_Y;
  const midY = (top + knee) / 2;
  // Just inside the silhouette, so the apron never becomes the body's edge.
  const halfW = rearHalfWidth(midY) - 0.010;

  const n = 48;
  const xs: number[] = [];
  const frames: Frame[] = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(-halfW, halfW, i / n);
    xs.push(x);
    frames.push({
      o: new THREE.Vector3(x, midY, rearFaceZ(x, midY)),
      r: new THREE.Vector3(0, 0, -1),
      u: new THREE.Vector3(0, 1, 0),
    });
  }

  // (absolute height, how far proud of the skin), walked top → bottom down the
  // outer face and back along a buried return. Top → bottom and NOT flipped,
  // for the reason spelled out in `spoiler.ts`: the winding follows the
  // direction the section walks, and the same axes swept the other way round
  // need the opposite setting.
  const shape: Array<readonly [number, number]> = [
    [top + 0.010, -APRON_BURY],
    [top + 0.004, -0.004],
    [top - 0.008, APRON_PROUD * 0.62],
    [top - 0.024, APRON_PROUD * 0.92],
    // Crown of the convex face, a little above mid-height: that is where the
    // photograph puts the highlight band.
    [lerp(top, knee, 0.42), APRON_PROUD],
    [lerp(top, knee, 0.76), APRON_PROUD * 0.86],
    [knee + 0.012, APRON_PROUD * 0.52],
    [knee, APRON_PROUD * 0.18],
    // The lip's underside: 22 mm of depth in 5 mm of height, so it faces the
    // road and reads as the shadow line the photograph has here.
    [knee - 0.005, -0.013],
    [knee - 0.007, -APRON_BURY],
  ];

  const section = (j: number): Pt[] => {
    const x = xs[j];
    const z0 = rearFaceZ(x, midY);
    return shape.map(([y, out]) => [z0 - rearFaceZ(x, y) + out, y - midY] as Pt);
  };

  return sweep(section, frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.18 });
}

/** Frame nearest a given half-width, for hanging a marker or a towing eye on. */
function frameAt(frames: Frame[], x: number): Frame {
  let best = frames[0];
  let bestD = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.o.x - x);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** Place a flat detail on the moulding face at `x`, `y`, facing outward. */
function onFace(frames: Frame[], s: BumperSpec, x: number, y: number, g: THREE.BufferGeometry, lift = 0): THREE.BufferGeometry {
  const f = frameAt(frames, x);
  const d = crown(s, y) + lift;
  const o = new THREE.Vector3(f.o.x, y, f.o.z).addScaledVector(f.r, d);
  const yaw = Math.atan2(f.r.x, f.r.z);
  g.rotateY(yaw);
  g.translate(o.x, o.y, o.z);
  return g;
}

export interface BumperResult {
  moulding: THREE.BufferGeometry;
  bright: THREE.BufferGeometry;
  valance: THREE.BufferGeometry;
  frames: Frame[];
  spec: BumperSpec;
}

function build(s: BumperSpec): BumperResult {
  const { geo, frames } = buildMoulding(s);
  return {
    moulding: geo,
    bright: rubStrip(s, frames),
    valance: s.sign > 0 ? valance(s, frames, s.plan) : rearApron(s),
    frames,
    spec: s,
  };
}

export function buildBumpers(ctx: BuildContext): { group: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'bumpers';

  const plastic = ctx.materials.bumperPlastic();
  /**
   * The bumper strips are NOT brightwork in the sense the rings are.
   *
   * `docs/CRITIQUE-2.md` §2 traced the pale front bumper to this material: at
   * `chrome:0.180` the strip clips to 245–249 along the whole sunlit length,
   * and the golden-hour grade's bloom then smears a ~250 mm skirt down the
   * moulding — which is what makes a 0.025-albedo grey apron return 0.64 of
   * the licence plate where the photograph gives 0.31.
   *
   * ⚠ Moving it up the chrome ladder does not fix it, and this was measured
   * rather than assumed. `chrome:0.300` makes it **worse**: `createChrome`
   * treats roughness above 0.07 as brushing and pulls the base roughness back
   * toward 0.09 as it does, so 0.18 → 0.30 moves the base from 0.152 to only
   * 0.162 while tripling the brush-normal slope — the peak stays and the
   * *area* at the mirror angle grows. Re-shot identically, pixels over 246 in
   * `front3q` went 2072 → 3420.
   *
   * So: not a plated finish at all. A US 5 mph bumper's cap strip is an
   * anodised aluminium extrusion that has been in weather since 1988, and
   * `dirtyMetal` is the library's parameterised metal — metalness 0.35 rather
   * than 1.0, roughness 0.62, `envMapIntensity` 0.55 and a little road film.
   * At α = 0.62 the specular lobe is ~40× broader than chrome's, so the sun
   * cannot clip it, and what is left is the bright satin line the reference
   * photographs actually show.
   */
  const strip = ctx.materials.dirtyMetal({
    color: 0xb4b9bf, roughness: 0.62, metalness: 0.35, grime: 0.25,
  });
  const paint = ctx.materials.paint();
  const dark = ctx.materials.blackTrim();

  const front: BumperSpec = {
    faceZ: HP.front.bumperZ,
    topY: HP.front.bumperTopY,
    bottomY: HP.front.bumperBottomY,
    sign: 1,
    valanceBottomY: HP.front.valanceBottomY,
    stripHeight: HP.front.rubStripHeight,
    plan: spine(HP.front.bumperZ, 1),
  };
  const rear: BumperSpec = {
    faceZ: HP.rear.bumperZ,
    topY: HP.rear.bumperTopY,
    bottomY: HP.rear.bumperBottomY,
    sign: -1,
    // No rear valance figure is published; carry the front's drop across.
    valanceBottomY: HP.rear.bumperBottomY - (HP.front.bumperBottomY - HP.front.valanceBottomY),
    stripHeight: REAR_STRIP_HEIGHT,
    plan: tailPlan((HP.rear.bumperTopY + HP.rear.bumperBottomY) / 2),
  };

  const f = build(front);
  const r = build(rear);

  // --- front detail --------------------------------------------------------
  const frontExtras: THREE.BufferGeometry[] = [f.moulding];

  // Plate plinth: the pad the plate bolts onto, standing proud of the crown.
  const plate = HP.front.plateCenter;
  frontExtras.push(at(roundedBox(0.328, 0.176, 0.030, 0.0065), [plate[0], plate[1], plate[2] - 0.0165]));

  // Impact-absorber access plugs and the towing eye — both visible in §6.3.
  for (const sx of [-1, 1]) {
    const plug = lathe([[0, 0.0055], [0.0150, 0.0052], [0.0195, 0.0034], [0.0205, 0], [0.0205, -0.010]], 18);
    plug.rotateX(Math.PI / 2);
    frontExtras.push(onFace(f.frames, front, sx * 0.452, 0.596, plug, -0.0042));
    frontExtras.push(onFace(f.frames, front, sx * 0.845, 0.452, roundedBox(0.048, 0.026, 0.016, 0.006), -0.0105));
  }
  group.add(mesh('frontBumper', merge(frontExtras), plastic));
  group.add(mesh('frontRubStrip', f.bright, strip));
  // Not `paint`: the photograph shows dark grey moulding through here, and a
  // metallic clearcoat on a panel this close to horizontal mirrors the sky.
  group.add(mesh('frontValance', f.valance, plastic));

  // Small amber marker low in the bumper's outboard face.
  const amber: THREE.BufferGeometry[] = [];
  const bezel: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1] as const) {
    amber.push(onFace(f.frames, front, sx * HP.front.markerX, HP.front.markerY,
      roundedBox(0.062, 0.030, 0.012, 0.005), 0.0015));
    bezel.push(onFace(f.frames, front, sx * HP.front.markerX, HP.front.markerY,
      roundedBox(0.072, 0.040, 0.010, 0.005), -0.0035));
  }
  group.add(mesh('frontMarkerBezel', merge(bezel), dark));
  group.add(mesh('frontMarkerLens', merge(amber), ctx.materials.lens(LIGHTS.sidemarkerFrontColor, { prismatic: true })));

  // --- rear detail ---------------------------------------------------------
  const rearExtras: THREE.BufferGeometry[] = [r.moulding];
  // Nothing mounts on the rear bumper's face. The plate recess that used to be
  // here has gone to the tailgate, where this car actually carries it
  // (`trim/tailgate.ts`, `docs/CRITIQUE.md` §3) — `HP.rear.plateCenter` still
  // describes the bumper position and is no longer read by anything.
  group.add(mesh('rearBumper', merge(rearExtras), plastic));
  group.add(mesh('rearRubStrip', r.bright, strip));
  // `rearApron`, not the front's `valance` — see the two functions. The name
  // stays `rearValance` because other streams probe it by name.
  group.add(mesh('rearValance', r.valance, paint));

  void QUALITY;
  return { group };
}

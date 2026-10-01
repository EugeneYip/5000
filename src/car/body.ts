/**
 * Body — the painted shell.
 *
 * Owns every steel surface of the car: bonnet, wings, doors, quarters, roof,
 * pillars, tailgate, rockers and the front/rear structures the bumpers mount
 * to. Glass, trim, lamps, wheels and interior belong to other streams; this
 * module leaves apertures at the hardpoints and models none of them.
 *
 * The surface itself lives in `body/surface.ts` — a lofted set of transverse
 * stations. This file only decides where the panel cuts fall, how each edge is
 * finished, and how the opening panels hinge.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext, PartResult } from '@/types';
import { HP } from '@/car/hardpoints';
import { QUALITY } from '@/spec';

import { T, Z_NOSE_FACE, Z_TAIL_END, topAt, heightAt, halfWidthAt, tAtY, dtFor } from './body/surface';
import { mergeGeometries, mirrorGeometry, clamp, lerp } from './body/math';
import { buildShell, type GridSample } from './body/panel';
import {
  Z, shellPanel, facePatch, wheelHouse,
  tRoofOuter, tScreenEdge, wingTop, tTailgate, tDloRear, aPillarLower, flankBottom,
  rearHalfWidth, rearFaceZ, noseHalfWidth, noseFaceZ,
  FRONT_AXLE, REAR_AXLE,
  SHUT, SHUT_DEEP, OPEN, SOFT, ARCH, BUTT,
  type Bound,
} from './body/panels';

const REAR_Y_TOP = heightAt(Z_TAIL_END, 0.0);

/**
 * Half-width of the tailgate at height `y`.
 *
 * Above the taillamps the tailgate is the full width of the tail; below them it
 * necks in to the lamps' inner edge and runs down to its bottom shutline, which
 * is `HP.rear.tailgateBottomY` — the hatch's painted lower section. The 20 mm
 * blend keeps the corner a radius rather than a step.
 *
 * The local constant this replaced put the tailgate's bottom at 0.988, i.e.
 * essentially at `HP.glass.tailgateGlassBottomY` (0.962 then, 1.010 now).
 * Those are two different things: the glass sill is where the GLASS stops, and
 * it is right; the tailgate itself carries on down to 0.652, and a fixed panel
 * was standing in for it with a shutline across the tail that the real car
 * does not have.
 */
function tailgateHalfWidth(y: number): number {
  const full = rearHalfWidth(y);
  const k = clamp((y - HP.rear.lampTopY) / 0.020, 0, 1);
  return lerp(Math.min(HP.rear.lampInnerX, full), full, k * k * (3 - 2 * k));
}

export function buildBody(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const paint = ctx.materials.paint();
  const dark = ctx.materials.blackTrim();
  const bumperDark = ctx.materials.bumperPlastic();

  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];

  const addPainted = (name: string, g: THREE.BufferGeometry, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(g, paint);
    m.name = name;
    parent.add(m);
    return m;
  };

  const addDark = (name: string, g: THREE.BufferGeometry, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(g, bumperDark);
    m.name = name;
    parent.add(m);
    return m;
  };

  // =========================================================================
  // Bonnet
  // =========================================================================
  const hoodGeo = shellPanel({
    zFront: Z.hoodFront, zRear: Z.hoodRear,
    tLo: 0, tHi: () => T.roofEdge, span: true,
    front: SHUT, rear: SHUT, hi: SHUT_DEEP,
  });
  const hoodHinge = new THREE.Vector3(0, HP.front.hoodRearY, Z.hoodRear);
  hoodGeo.translate(-hoodHinge.x, -hoodHinge.y, -hoodHinge.z);
  const hoodPivot = new THREE.Group();
  hoodPivot.name = 'hoodPivot';
  hoodPivot.position.copy(hoodHinge);
  group.add(hoodPivot);
  const hoodPanel = addPainted('hoodPanel', hoodGeo, hoodPivot);
  nodes.hoodPanel = hoodPanel;
  nodes.hoodPivot = hoodPivot;

  // =========================================================================
  // Nose top strip — the brow over the lamp band, ahead of the bonnet
  // =========================================================================
  const noseUpper = shellPanel({
    zFront: Z_NOSE_FACE, zRear: Z.hoodFront,
    tLo: 0, tHi: () => T.roofEdge, span: true,
    front: OPEN, rear: SHUT, hi: SHUT,
  });

  // =========================================================================
  // Cowl / scuttle — a shallow trough for the wiper park
  // =========================================================================
  const cowlGeo = shellPanel({
    zFront: Z.hoodRear, zRear: Z.cowlRear,
    tLo: 0, tHi: (z) => wingTop(z), span: true,
    front: SHUT, rear: OPEN, hi: BUTT,
    sink: (_z, t) => 0.016 * Math.max(0, 1 - Math.pow(Math.abs(t) / T.roofEdge, 2)),
    nz: 7,
  });
  nodes.cowl = addPainted('cowl', cowlGeo);

  // =========================================================================
  // Roof skin
  // =========================================================================
  const roofGeo = shellPanel({
    zFront: Z.header, zRear: Z.tgHinge,
    tLo: 0, tHi: tRoofOuter, span: true,
    front: OPEN, rear: SHUT, hi: SOFT,
  });
  nodes.roofPanel = addPainted('roofPanel', roofGeo);

  // =========================================================================
  // Tailgate — header band, side frames, and the near-vertical lower face
  // =========================================================================
  const tgHeader = shellPanel({
    zFront: Z.tgHinge, zRear: Z.tgGlassTop,
    tLo: 0, tHi: tTailgate, span: true,
    front: SHUT, rear: OPEN, hi: SHUT_DEEP,
    nz: 6,
  });
  const tgSideR = shellPanel({
    zFront: Z.tgGlassTop, zRear: Z_TAIL_END,
    tLo: (z) => tTailgate(z) - dtFor(z, tTailgate(z), 0.082),
    tHi: tTailgate,
    front: BUTT, rear: BUTT, lo: OPEN, hi: SHUT_DEEP,
  });
  // The tailgate's lower face is a frame, not a sheet: the whole span between
  // the lamp apertures is a real hole that the trim stream's black ribbed
  // moulding recesses into, with the licence plate bolted through it. Cutting
  // a *pocket* in the analytic rear surface does not work and was tried — the
  // surface is already the outermost skin, so anything set behind it is simply
  // buried and only the plate shows.
  //
  // The aperture is as wide as the tailgate's face is at this height (the face
  // necks to `lampInnerX`, so the hole runs lamp to lamp, exactly as on the
  // car) and stops 20 mm short of the tailgate's bottom shutline so that edge
  // survives. The trim panel is derived from the same lamp hardpoints and comes
  // out 17 mm wider and 20 mm taller than the hole on every side, so the recess
  // cannot leak daylight however the lamp aperture moves.
  const apLoY = HP.rear.tailgateBottomY + 0.020;
  const apHiY = HP.rear.lampTopY;
  const tgFaceRail = (yLo: number, yHi: number, bottom: Bound, top: Bound, ny: number) => facePatch({
    yLo, yHi,
    xLo: (y) => -tailgateHalfWidth(y), xHi: tailgateHalfWidth,
    zAt: rearFaceZ, facing: -1,
    bottom, top, inner: OPEN, outer: OPEN,
    ny,
  });
  // Below the hole: the tailgate's bottom shutline. Above it: the painted band
  // the model scripts sit on, which flares back out to full width as soon as it
  // clears the lamps and runs up to the backlight aperture.
  const tgFaceLower = tgFaceRail(HP.rear.tailgateBottomY, apLoY, SHUT_DEEP, OPEN, 3);
  const tgFaceUpper = tgFaceRail(apHiY, HP.glass.tailgateGlassBottomY, OPEN, BUTT, 6);

  // The painted band stopped on a straight line at the glass sill, but the
  // body silhouette there is still 77 mm wider than the glass — so between the
  // glass edge and the silhouette there was no panel at all, and each lower
  // corner of the backlight showed the load bay through a wedge. Carry the
  // paint up the outboard side of the aperture until the silhouette closes
  // onto the glass edge, which it does about 100 mm higher.
  const glassHalfW = HP.glass.tailgateGlassHalfW;
  let yClose = HP.glass.tailgateGlassBottomY;
  const yCloseLimit = HP.glass.tailgateGlassTopY;
  while (yClose < yCloseLimit && tailgateHalfWidth(yClose) > glassHalfW) yClose += 0.003;
  const tgFaceCornerR = facePatch({
    yLo: HP.glass.tailgateGlassBottomY, yHi: yClose,
    xLo: () => glassHalfW,
    xHi: (y) => Math.max(tailgateHalfWidth(y), glassHalfW),
    zAt: rearFaceZ, facing: -1,
    bottom: OPEN, top: OPEN, inner: OPEN, outer: OPEN,
    ny: 5,
  });

  const tailgateGeo = mergeGeometries([
    tgHeader, tgSideR, mirrorGeometry(tgSideR), tgFaceLower, tgFaceUpper,
    tgFaceCornerR, mirrorGeometry(tgFaceCornerR),
  ]);
  const tgHinge = new THREE.Vector3(0, topAt(Z.tgHinge), Z.tgHinge);
  tailgateGeo.translate(-tgHinge.x, -tgHinge.y, -tgHinge.z);
  const tgPivot = new THREE.Group();
  tgPivot.name = 'tailgatePivot';
  tgPivot.position.copy(tgHinge);
  group.add(tgPivot);
  nodes.tailgatePanel = addPainted('tailgatePanel', tailgateGeo, tgPivot);
  nodes.tailgatePivot = tgPivot;

  // =========================================================================
  // Pillars
  // =========================================================================
  const aPillarR = shellPanel({
    zFront: Z.cowlRear, zRear: Z.header,
    tLo: tScreenEdge, tHi: wingTop,
    front: BUTT, rear: BUTT, lo: OPEN, hi: OPEN,
  });
  const bPillarR = shellPanel({
    zFront: Z.doorM + 0.040, zRear: Z.doorM - 0.048,
    tLo: tRoofOuter, tHi: () => T.belt,
    front: OPEN, rear: OPEN, lo: BUTT, hi: BUTT,
    nz: 5,
  });
  const cPillarR = shellPanel({
    zFront: Z.doorR + 0.028, zRear: Z.cPillarRear,
    tLo: tRoofOuter, tHi: () => T.belt,
    front: OPEN, rear: OPEN, lo: BUTT, hi: BUTT,
    nz: 5,
  });
  const dPillarR = shellPanel({
    zFront: Z.dPillar, zRear: Z.dPillarRear,
    tLo: (z) => Math.max(tRoofOuter(z), tTailgate(z)),
    tHi: (z) => clamp(tDloRear(z), Math.max(tRoofOuter(z), tTailgate(z)) + 0.004, T.belt),
    front: BUTT, rear: BUTT, lo: SHUT, hi: OPEN,
  });

  // =========================================================================
  // Front wings
  // =========================================================================
  //
  // ## The leading edge runs to the nose face. It used to notch back, and the
  // ## notch was a hole in the car.
  //
  // It read `lerp(Z.lampBack, Z_NOSE_FACE, …)` over b 0.56–0.66, so above
  // y ≈ 0.75 the wing's skin stopped 80 mm behind the face — "notched back
  // around the lamp aperture". But the aperture is a hole in the *face*,
  // bounded inboard by the grille and outboard by `lampSideR`; it does not
  // extend aft, and the wing was never what cut it. What the notch did cut
  // was the body itself, in two places, and `__AUDI.pick` at `headlight`
  // finds both:
  //
  //  · **The silhouette slot.** The shell is 8–10 mm wider at `Z.lampBack`
  //    than at the face (0.858 against 0.8498 at y 0.76), so the face patch's
  //    outer edge hung inboard of the wing's leading edge with nothing between
  //    them. A −Z ray at x 0.855 passed the face plane and hit the wing at
  //    z 0.861. That slot is the vertical arm of the "pebbled faceted pale
  //    L-strip" CRITIQUE-5 §11 attributed to the indicator's chrome surround:
  //    `headlampReflector` at (330, 480), d 2.690, p (−0.829, 0.760, 0.893),
  //    with nothing in front of it and the cabin 1.4 m behind.
  //
  //  · **The brow.** Between the lamp band's top and the nose's own top the
  //    face has no panel at all — `noseUpper`'s front flange closes it inboard
  //    of x 0.642 and nothing closed it outboard. Through that hole you saw
  //    the wing's leading-edge roll 83 mm back, lit face-on: the white tab
  //    over the lamp. `noseBrow` below caps the rest of it.
  //
  // The front bound keeps its roll — that roll IS the nose's outer corner
  // radius — but takes **no flange**. An `OPEN` flange here is 34 mm of skirt
  // lying in the face plane 1–2 mm behind the headlamp lens, which is a
  // z-fight waiting to happen and would reach 40 mm inboard across the amber.
  // There is nothing for a flange to hide anyway: `lampSideR` and `noseBrow`
  // butt onto this edge from the other side.
  const WING_NOSE: Bound = { gap: 0, radius: QUALITY.edgeRadius, flange: 0 };
  const wingT = (z: number): number => wingTop(z);
  const wingB = (z: number): number => flankBottom(z, FRONT_AXLE);
  const wingR = shellPanel({
    zFront: Z_NOSE_FACE, zRear: Z.doorF,
    tLo: wingT, tHi: wingB,
    front: WING_NOSE, rear: SHUT, lo: SHUT, hi: ARCH,
  });

  // =========================================================================
  // Doors
  // =========================================================================
  const doorFrontR = shellPanel({
    zFront: Z.doorF, zRear: Z.doorM,
    tLo: () => T.belt, tHi: () => T.lowerA,
    front: SHUT_DEEP, rear: SHUT_DEEP, lo: OPEN, hi: SHUT_DEEP,
  });
  const doorRearR = shellPanel({
    zFront: Z.doorM, zRear: Z.doorR,
    tLo: () => T.belt, tHi: () => T.lowerA,
    front: SHUT_DEEP, rear: SHUT_DEEP, lo: OPEN, hi: SHUT_DEEP,
  });

  // =========================================================================
  // Rear quarters
  // =========================================================================
  const quarterR = shellPanel({
    zFront: Z.doorR, zRear: Z_TAIL_END,
    tLo: () => T.belt, tHi: (z) => flankBottom(z, REAR_AXLE),
    front: SHUT, rear: BUTT, lo: OPEN, hi: ARCH,
  });

  // =========================================================================
  // Rockers and floor
  // =========================================================================
  const rockerR = shellPanel({
    zFront: 0.840, zRear: -3.660,
    tLo: () => T.lowerA, tHi: () => T.floor,
    front: BUTT, rear: BUTT, lo: SHUT, hi: BUTT,
  });

  // =========================================================================
  // Front structure
  // =========================================================================
  const noseLower = facePatch({
    yLo: 0.286, yHi: HP.front.grilleBottomY,
    xLo: (y) => -noseHalfWidth(y), xHi: (y) => noseHalfWidth(y),
    zAt: noseFaceZ, facing: 1,
    bottom: BUTT, top: OPEN, inner: BUTT, outer: BUTT,
    ny: 8,
  });

  // Front face outboard of the headlamp's *clear* lens, between
  // `HP.front.lampOuterX` (0.779) and the silhouette (0.850). Without it
  // `noseLower` simply stopped at 0.779 and there were 71 mm of unpanelled
  // front face across the 160 mm lamp band, open to the engine bay: 1624 of
  // 7171 rays fired down −Z through that band came out on
  // `interior/shell/innerSides`, `underbody/engineBay` and
  // `underbody/driveline`.
  //
  // ## It is two panels, because it is two different things
  //
  // `HP.front.lampOuterX`'s own note is explicit that the 71 mm outboard of
  // it is **amber, not paint** — the corner lens butts onto the headlamp
  // glass and wraps round the corner — and that this panel is the sheet metal
  // *behind* the indicator. It was not behind it. Built flat on `noseFaceZ`
  // it came out **1 mm proud of the lens** and rendered the outboard 40 % of
  // the indicator as a flat grey slab:
  //
  //     __AUDI.pick at `headlight` (380, 520)
  //       lampSideL          paint    d 2.651   z 0.944
  //       headlampAmberLens  lens:…   d 2.652   z 0.944
  //
  // That is not a tolerance. `lights/headlamp.ts` builds the lens with
  // `slab({ zAt: FACE, front: 0.0018, crown: 0.0014 })`, so its outer skin
  // runs `noseFaceZ − 0.0018` at the rim and `− 0.0004` at the crown: a panel
  // ON `noseFaceZ` is proud of it everywhere, by construction and at every
  // station. Anything the lens covers therefore has to leave the face plane.
  //
  // So the covered part is a separate recessed panel in black, and only the
  // strip the lens genuinely does not reach stays painted and on the face.
  const LAMP_BACK_SINK = 0.012;
  /**
   * Inboard edge of the painted sliver = outboard edge of the amber lens.
   *
   * The lens runs to `aperture.xOuter(y) − OUTBOARD_GAP`, and `aperture`
   * clamps to `noseHalfWidth(y) − 0.004` — our own function, imported from
   * `body/panels.ts`, so the two files already agree in x and in z. 5.5 mm is
   * that chain's sum (0.004 + 0.0015) written once here.
   *
   * It is deliberately the exact lens edge and not a millimetre less. Leaving
   * paint under the glass is what this change exists to stop; leaving a GAP
   * shows the housing wall, which `lampOuterX`'s note calls the single thing
   * that most makes the nose read as jewellery. The seam is closed from the
   * other side instead — `inner: OPEN` rolls this edge and returns it 34 mm
   * aft, behind the lens rim, and `lampBackR` runs 4 mm past it underneath.
   */
  const LENS_CLEAR = 0.0055;
  const lampPaintInner = (y: number): number =>
    Math.max(noseHalfWidth(y) - LENS_CLEAR, HP.front.lampOuterX + 0.001);
  const lampSideR = facePatch({
    yLo: HP.front.grilleBottomY, yHi: HP.front.lampTopY,
    xLo: lampPaintInner,
    xHi: (y) => Math.max(noseHalfWidth(y), lampPaintInner(y) + 0.001),
    zAt: noseFaceZ, facing: 1,
    bottom: BUTT, top: BUTT, inner: OPEN, outer: BUTT,
    ny: 5, nx: 4,
  });
  // The sheet metal behind the indicator. 12 mm clears the lens's own back
  // face (`FACE − 0.006`) by 6 mm, so the amber has a chamber behind it
  // rather than a skin pressed against its back.
  const lampBackR = facePatch({
    yLo: HP.front.grilleBottomY, yHi: HP.front.lampTopY,
    xLo: () => HP.front.lampOuterX,
    // 4 mm under the painted sliver, so the two cannot part at the seam.
    xHi: (y) => lampPaintInner(y) + 0.004,
    zAt: (x, y) => noseFaceZ(x, y) - LAMP_BACK_SINK,
    facing: 1,
    bottom: BUTT, top: BUTT, inner: OPEN, outer: BUTT,
    ny: 5, nx: 6,
  });

  // The brow: the band of front face between the lamp aperture's top and the
  // nose's own top edge. `noseUpper`'s front flange closes it inboard of
  // t = `T.roofEdge` (x 0.642 at the face) and nothing closed it outboard, so
  // there was a 50 mm × 160 mm hole per side with the wing's leading edge
  // visible 80 mm down it. The region closes itself: `noseHalfWidth` falls
  // from 0.798 at the lamp's top to zero at the crown, so the patch is a
  // wedge and the upper limit is where it runs out of width.
  const BROW_X_IN = halfWidthAt(Z_NOSE_FACE, T.roofEdge);
  const noseBrow = facePatch({
    yLo: HP.front.lampTopY, yHi: topAt(Z_NOSE_FACE) - 0.004,
    xLo: (y) => Math.min(BROW_X_IN, noseHalfWidth(y) - 0.002),
    xHi: noseHalfWidth,
    zAt: noseFaceZ, facing: 1,
    bottom: BUTT, top: BUTT, inner: BUTT, outer: BUTT,
    ny: 8, nx: 6,
  });

  // =========================================================================
  // Rear structure — taillamp apertures and the panel between them
  // =========================================================================
  const rearLower = facePatch({
    yLo: 0.338, yHi: HP.rear.tailgateBottomY,
    xLo: (y) => -rearHalfWidth(y), xHi: (y) => rearHalfWidth(y),
    zAt: rearFaceZ, facing: -1,
    bottom: BUTT, top: SHUT, inner: BUTT, outer: BUTT,
    ny: 8,
  });
  // Sliver of fixed panel outboard of the tailgate's lower corners: between its
  // bottom shutline and the foot of the taillamp aperture.
  const lampBaseR = facePatch({
    yLo: HP.rear.tailgateBottomY, yHi: HP.rear.lampBottomY,
    // Start where the TAILGATE's face actually ends, not at a constant. Below
    // the aperture the tailgate silhouette narrows inside `lampInnerX`, so a
    // fixed inboard edge left a 16 x 4 mm hole per side at the shutline that
    // you could see the rear seat through. The lamp base is fixed structure
    // and the tailgate swings past it, so tucking it inboard is also what is
    // behind a tailgate on the real car.
    xLo: (y) => Math.min(HP.rear.lampInnerX, tailgateHalfWidth(y) - QUALITY.panelGap),
    xHi: rearHalfWidth,
    zAt: rearFaceZ, facing: -1,
    bottom: BUTT, top: OPEN, inner: SHUT, outer: BUTT,
    ny: 4,
  });

  // =========================================================================
  // Assembly — static shells
  // =========================================================================
  const frontStructure = new THREE.Group();
  frontStructure.name = 'frontStructure';
  group.add(frontStructure);
  addPainted('noseUpper', noseUpper, frontStructure);
  // The lower nose sits below the bumper's rub strip, where the reference
  // photograph shows dark moulding rather than body colour. Left in `paint` it
  // mirrors the sky at grazing angles and reads cream.
  addDark('noseLower', noseLower, frontStructure);
  addPainted('frontWingR', wingR, frontStructure);
  addPainted('frontWingL', mirrorGeometry(wingR), frontStructure);
  addPainted('lampSideR', lampSideR, frontStructure);
  addPainted('lampSideL', mirrorGeometry(lampSideR), frontStructure);
  addPainted('noseBrowR', noseBrow, frontStructure);
  addPainted('noseBrowL', mirrorGeometry(noseBrow), frontStructure);
  // Inside the lamp, behind the amber — see `lampBackR` above. `blackTrim`
  // rather than `bumperPlastic`: this is a painted-black housing wall seen
  // through a dye, not a moulding anyone sees directly.
  for (const [n, g] of [
    ['lampBackR', lampBackR], ['lampBackL', mirrorGeometry(lampBackR)],
  ] as const) {
    const m = new THREE.Mesh(g, dark);
    m.name = n;
    m.castShadow = false;
    frontStructure.add(m);
  }
  nodes.frontStructure = frontStructure;
  nodes.frontWingR = frontStructure.getObjectByName('frontWingR')!;
  nodes.frontWingL = frontStructure.getObjectByName('frontWingL')!;

  const rearStructure = new THREE.Group();
  rearStructure.name = 'rearStructure';
  group.add(rearStructure);
  addPainted('rearLower', rearLower, rearStructure);
  addPainted('lampBaseR', lampBaseR, rearStructure);
  addPainted('lampBaseL', mirrorGeometry(lampBaseR), rearStructure);
  addPainted('quarterR', quarterR, rearStructure);
  addPainted('quarterL', mirrorGeometry(quarterR), rearStructure);
  addPainted('dPillarR', dPillarR, rearStructure);
  addPainted('dPillarL', mirrorGeometry(dPillarR), rearStructure);
  addPainted('cPillarR', cPillarR, rearStructure);
  addPainted('cPillarL', mirrorGeometry(cPillarR), rearStructure);
  nodes.rearStructure = rearStructure;

  const upper = new THREE.Group();
  upper.name = 'upperStructure';
  group.add(upper);
  addPainted('aPillarR', aPillarR, upper);
  addPainted('aPillarL', mirrorGeometry(aPillarR), upper);
  addPainted('bPillarR', bPillarR, upper);
  addPainted('bPillarL', mirrorGeometry(bPillarR), upper);
  nodes.aPillarR = upper.getObjectByName('aPillarR')!;
  nodes.bPillarR = upper.getObjectByName('bPillarR')!;

  const lower = new THREE.Group();
  lower.name = 'lowerStructure';
  group.add(lower);
  addPainted('rockerR', rockerR, lower);
  addPainted('rockerL', mirrorGeometry(rockerR), lower);
  nodes.rockerR = lower.getObjectByName('rockerR')!;

  // Wheel houses and a closing floor so no aperture ever shows daylight.
  const houses = mergeGeometries([
    wheelHouse(FRONT_AXLE, 1), wheelHouse(FRONT_AXLE, -1),
    wheelHouse(REAR_AXLE, 1), wheelHouse(REAR_AXLE, -1),
    floorPan(),
  ]);
  const housesMesh = new THREE.Mesh(houses, dark);
  housesMesh.name = 'bodyInner';
  housesMesh.castShadow = false;
  lower.add(housesMesh);

  // =========================================================================
  // Doors, with their hinges
  // =========================================================================
  const doorDef: Array<[string, THREE.BufferGeometry, number, number]> = [
    ['doorFR', doorFrontR, Z.doorF, 1],
    ['doorFL', mirrorGeometry(doorFrontR), Z.doorF, -1],
    ['doorRR', doorRearR, Z.doorM, 1],
    ['doorRL', mirrorGeometry(doorRearR), Z.doorM, -1],
  ];
  const doorPivots: Record<string, THREE.Group> = {};
  for (const [name, geo, hingeZ, sign] of doorDef) {
    const hx = sign * (halfWidthAt(hingeZ, T.crown) - 0.055);
    const hinge = new THREE.Vector3(hx, 0.70, hingeZ + 0.004);
    geo.translate(-hinge.x, -hinge.y, -hinge.z);
    const pivot = new THREE.Group();
    pivot.name = `${name}Pivot`;
    pivot.position.copy(hinge);
    group.add(pivot);
    const mesh = addPainted(name, geo, pivot);
    nodes[name] = mesh;
    doorPivots[name] = pivot;
  }

  // =========================================================================
  // Articulations
  // =========================================================================
  const xAxis = new THREE.Vector3(1, 0, 0);
  // Doors swing on an axis raked a couple of degrees, so they lift as they
  // open and drop back onto their strikers — exactly like the real hinge.
  const doorAxis = new THREE.Vector3(0, 1, 0.055).normalize();

  articulations.push({
    name: 'hood', value: 0, target: 0, duration: 1.6,
    apply: (v) => hoodPivot.quaternion.setFromAxisAngle(xAxis, -0.86 * v),
  });
  articulations.push({
    name: 'tailgate', value: 0, target: 0, duration: 1.8,
    apply: (v) => tgPivot.quaternion.setFromAxisAngle(xAxis, 0.94 * v),
  });
  for (const [name, swing] of [['doorFR', -1], ['doorFL', 1], ['doorRR', -1], ['doorRL', 1]] as const) {
    const pivot = doorPivots[name];
    const max = name.startsWith('doorF') ? 1.16 : 1.02;
    articulations.push({
      name, value: 0, target: 0, duration: 1.25,
      apply: (v) => pivot.quaternion.setFromAxisAngle(doorAxis, swing * max * v),
    });
  }

  ctx.progress(1, 'body');
  return { group, nodes, articulations };
}

// ---------------------------------------------------------------------------
// A plain closing floor. The underbody stream dresses it; this only exists so
// that an open door or a wheel arch never shows straight through the car.
// ---------------------------------------------------------------------------

function floorPan(): THREE.BufferGeometry {
  const zF = 0.760, zR = -3.620;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3(0, -1, 0);
  const sample = (a: number, b: number): GridSample => {
    const z = lerp(zF, zR, a);
    const t = tAtY(z, heightAt(z, T.floor));
    const hw = halfWidthAt(z, t) - 0.03;
    const x = lerp(-hw, hw, b);
    const y = heightAt(z, T.floor) + 0.012;
    p.set(x, y, z);
    return { p, n, u: x, v: -z };
  };
  return buildShell({ sample, na: 30, nb: 8, edges: {} });
}

/** Exposed for the review harness: how heavy the shell came out. */
export const BODY_QUALITY = QUALITY.bodySegments;

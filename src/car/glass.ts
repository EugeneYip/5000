/**
 * Glazing.
 *
 * The C3 was *the* flush-glazed car: the glass is bonded within 2 mm of the
 * body skin where every contemporary recessed it by 12–18 mm behind a proud
 * frame. That single detail is what the car is remembered for and what the
 * whole 0.30 Cd programme was built around, so the glazing here is generated
 * from the body's own analytic surface displaced by exactly
 * `HP.glass.flushOffset` — see `glass/aperture.ts` for why that is structural
 * rather than a number to be maintained.
 *
 * What is here:
 *
 *   · windscreen — doubly curved, 5.8 mm laminate, black ceramic frit with a
 *     three-row dot fade where the band meets clear glass;
 *   · side glass — front quarter light, both door drop glasses, and the
 *     wagon's long rear quarter, all on the body's tumblehome;
 *   · tailgate glass — the wagon's big near-upright backlight, heated, with
 *     element lines and busbars, travelling with `tailgatePanel`. It is the one
 *     pane that is not a rectangle of the body's (z, t) loft: see
 *     `glass/tailgate.ts`;
 *   · the surround: a slim black roof-joint moulding in place of the drip rail
 *     the C3 deleted, blacked-out B- and C-pillars so the daylight opening
 *     reads as one dark band, and a belt moulding along the door tops.
 *
 * Nothing here is chrome. Chunky bright window frames are a different car.
 */

import * as THREE from 'three';
import type { Articulation, BuildContext, PartResult, VehicleState } from '@/types';
import { merge, lerp } from './glass/geom';
import {
  FLUSH, SCREEN_THICK, SIDE_THICK, mouldTopT, mouldBotT, PILLAR_SLIM_Z,
  DLO, Z, dloBotT, dloPane, quarterFrontPane, quarterRearPane, screenPane,
  dropVector, dropTravel, aPillarLower, tDloRear,
  type Region,
} from './glass/aperture';
import { tailgatePatch } from './glass/tailgate';
import { dtFor } from '@/car/body/surface';
import {
  buildSlab, buildFrit, buildStrip, buildSeal, buildPatchSeal, buildApplique, loftPatch,
  loopUV, BOND_PROFILE, type Slab,
} from './glass/pane';

/** Depth of the ceramic print: on the inner face of the outer ply. */
const FRIT_DEPTH = FLUSH + 0.0016;

/** Mirror a right-hand region onto the left. */
const flip = (r: Region): Region => (a, b) => {
  const p = r(a, b);
  return { z: p.z, t: -p.t };
};

/**
 * Depth profile for an applique: proud in the middle so it reads as a fitted
 * piece, rolling back under the panel it laps at every edge so no edge is a
 * bare cut.
 */
const edgeRoll = (k: number, mid: number, edge: number) => (a: number, b: number): number => {
  const d = Math.min(Math.min(a, 1 - a), Math.min(b, 1 - b)) / k;
  return lerp(edge, mid, d >= 1 ? 1 : d * d * (3 - 2 * d));
};

/** Panel edges the panes hide behind, worked out once in `aperture.ts`. */
const B_PILLAR = { front: DLO.bPillarFrontZ, rear: DLO.bPillarRearZ };
const C_PILLAR = { front: DLO.cPillarFrontZ, rear: DLO.cPillarRearZ };

interface Bundle {
  outer: THREE.BufferGeometry[];
  inner: THREE.BufferGeometry[];
  /** Rubber: pane edge bands and seals. */
  seal: THREE.BufferGeometry[];
  /** Satin black: mouldings, pillar blackouts, the division bar. */
  trim: THREE.BufferGeometry[];
  frit: THREE.BufferGeometry[];
}

const bundle = (): Bundle => ({ outer: [], inner: [], seal: [], trim: [], frit: [] });

function addSlab(b: Bundle, s: Slab): void {
  b.outer.push(s.outer);
  b.inner.push(s.inner);
  b.seal.push(s.edge);
}

export function buildGlass(ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  const nodes: Record<string, THREE.Object3D> = {};
  const articulations: Articulation[] = [];

  const glassOut = ctx.materials.glass();
  const glassIn = ctx.materials.glass({ interiorSide: true });
  const sealMat = ctx.materials.rubber({ roughness: 0.88 });
  const trimMat = ctx.materials.blackTrim();
  // Fired ceramic: blacker and flatter than the anodised surrounds, and it has
  // to stay opaque so three's transmission pass can see it behind the glass.
  const fritMat = ctx.materials.interiorPlastic({ color: 0x08090a, roughness: 0.58 });
  // Printed silver-ceramic conductor. Reddish-brown, semi-gloss, and only ever
  // seen through the backlight.
  const heaterMat = ctx.materials.interiorPlastic({ color: 0x7c4527, roughness: 0.4 });

  // Panes that never move, panes that hang off a door, and the tailgate.
  const fixed = bundle();
  const doors: Record<string, { frame: Bundle; drop: Bundle }> = {};
  const tail = bundle();

  // =========================================================================
  // Windscreen
  // =========================================================================
  const screen = loftPatch(screenPane());
  addSlab(fixed, buildSlab({ patch: screen, na: 46, nb: 54, thickness: SCREEN_THICK, depth: FLUSH }));

  const screenFrit = buildFrit({
    patch: screen,
    // Wider across the top (the shade band) than down the sides, as printed.
    bandA: 0.030, bandB: 0.026,
    depth: FRIT_DEPTH,
    dotCount: 128, dotRows: 3, dotSize: 0.0075,
  });
  fixed.frit.push(screenFrit.band);
  if (screenFrit.dots) fixed.frit.push(screenFrit.dots);

  fixed.seal.push(buildSeal({
    at: (k) => {
      const [a, b] = loopUV(k, 0.07);
      // The aperture edge, not the pane edge: the glass runs on past this and
      // under the cowl, the header and the A-pillars.
      const z = lerp(Z.cowlRear + 0.006, Z.header - 0.006, a);
      const t = lerp(-0.1120, 0.1120, b);
      return { z, t };
    },
    n: 150, closed: true, hint: { dz: 0, dt: 1 }, profile: BOND_PROFILE,
  }));

  // =========================================================================
  // Side glass
  // =========================================================================
  for (const side of [1, -1] as const) {
    const L = side > 0 ? 'R' : 'L';
    const wrap = (r: Region): Region => (side > 0 ? r : flip(r));

    // --- fixed front quarter light, and the sail panel ahead of it ---------
    const quarter = loftPatch(wrap(quarterFrontPane()));
    const qSlab = buildSlab({ patch: quarter, na: 16, nb: 24, thickness: SIDE_THICK, depth: FLUSH });

    // --- door drop glasses -------------------------------------------------
    const front = loftPatch(wrap(dloPane(DLO.quarterDivZ - 0.003, B_PILLAR.front - 0.006)));
    const rear = loftPatch(wrap(dloPane(B_PILLAR.rear + 0.006, C_PILLAR.front - 0.006)));
    const fSlab = buildSlab({ patch: front, na: 40, nb: 26, thickness: SIDE_THICK, depth: FLUSH });
    const rSlab = buildSlab({ patch: rear, na: 34, nb: 26, thickness: SIDE_THICK, depth: FLUSH });

    // --- the wagon's rear quarter -----------------------------------------
    const qRear = loftPatch(wrap(quarterRearPane()));
    addSlab(fixed, buildSlab({ patch: qRear, na: 36, nb: 26, thickness: SIDE_THICK, depth: FLUSH }));

    // Seal along the D-pillar's leading edge, which rakes hard forward.
    fixed.seal.push(buildSeal({
      at: (k) => {
        const z = lerp(Z.dPillar - 0.004, DLO.rearZ, k);
        const t = tDloRear(z) - dtFor(z, tDloRear(z), 0.006);
        return { z, t: side * Math.min(t, dloBotT(z)) };
      },
      n: 40, hint: { dz: -side, dt: 0 },
    }));

    // Front edge of the DLO, against the A-pillar.
    fixed.seal.push(buildSeal({
      at: (k) => {
        const z = lerp(DLO.frontZ + 0.010, PILLAR_SLIM_Z, k);
        const t = aPillarLower(z) - dtFor(z, aPillarLower(z), 0.006);
        return { z, t: side * t };
      },
      n: 26, hint: { dz: -1, dt: 0 },
    }));

    // Mirror sail. The A-pillar's lower edge reaches the beltline 115 mm aft of
    // the front door's shutline, so the door carries a blanked-off wedge ahead
    // of its glass — which is where the mirror mounts. It travels with the
    // door, not the body.
    const sail = buildApplique(loftPatch(wrap((a, b) => {
      const z = lerp(Z.doorF - 0.004, DLO.frontZ + 0.004, a);
      const tTop = Math.max(aPillarLower(z) - dtFor(z, aPillarLower(z), 0.010), mouldBotT(z));
      return { z, t: lerp(tTop, dloBotT(z), b) };
    })), 12, 10, edgeRoll(0.16, -0.0010, 0.0018));

    // --- the surround ------------------------------------------------------
    // Roof-joint moulding: the C3 deleted the drip rail, and this slim black
    // finisher is what replaced it. One constant width from the A-pillar to the
    // D-pillar — it no longer has a step to swallow, see `mouldBotT`.
    fixed.trim.push(buildApplique(loftPatch(wrap((a, b) => {
      const z = lerp(PILLAR_SLIM_Z, DLO.rearZ + 0.02, a);
      return {
        z,
        t: lerp(mouldTopT(z), mouldBotT(z), b),
      };
    })), 110, 7, (_a, b) => (b < 0.10 ? -0.0005 : b > 0.74 ? lerp(-0.0011, 0.0014, (b - 0.74) / 0.26) : -0.0011)));

    // Blacked-out B and C pillars, so the greenhouse reads as one band.
    for (const p of [B_PILLAR, C_PILLAR]) {
      fixed.trim.push(buildApplique(loftPatch(wrap((a, b) => ({
        z: lerp(p.front + 0.006, p.rear - 0.006, a),
        t: lerp(mouldBotT(0.5 * (p.front + p.rear)) - 0.0018, dloBotT(0.5 * (p.front + p.rear)) + 0.0012, b),
      }))), 8, 14, (a) => (a < 0.14 || a > 0.86 ? 0.0016 : -0.0012)));
    }

    // Belt moulding, split at the shutlines so each piece travels with its own
    // panel. Slim: on this car it is a rubber lip, not a bright strip.
    const beltSeal = (z0: number, z1: number, n: number): THREE.BufferGeometry => buildSeal({
      at: (k) => {
        const z = lerp(z0, z1, k);
        return { z, t: side * (dloBotT(z) - dtFor(z, dloBotT(z), 0.010)) };
      },
      n, hint: { dz: 0, dt: -side },
    });
    fixed.seal.push(beltSeal(Z.doorR + 0.002, DLO.rearZ, 30));

    // --- assemble the two doors -------------------------------------------
    const fName = `door${L === 'R' ? 'FR' : 'FL'}`;
    const rName = `door${L === 'R' ? 'RR' : 'RL'}`;
    doors[fName] = { frame: bundle(), drop: bundle() };
    doors[rName] = { frame: bundle(), drop: bundle() };

    addSlab(doors[fName].frame, qSlab);
    addSlab(doors[fName].drop, fSlab);
    addSlab(doors[rName].drop, rSlab);

    // Division bar between the fixed quarter light and the drop glass.
    doors[fName].frame.trim.push(sail);
    doors[fName].frame.trim.push(buildApplique(loftPatch(wrap((a, b) => ({
      z: lerp(DLO.quarterDivZ + 0.006, DLO.quarterDivZ - 0.005, a),
      t: lerp(mouldBotT(DLO.quarterDivZ) - 0.0018, dloBotT(DLO.quarterDivZ) + 0.0010, b),
    }))), 5, 12, (a) => (a < 0.2 || a > 0.8 ? 0.0016 : -0.0009)));

    doors[fName].frame.seal.push(beltSeal(DLO.frontZ + 0.002, Z.doorM - 0.002, 16));
    doors[rName].frame.seal.push(beltSeal(Z.doorM + 0.002, Z.doorR - 0.002, 14));
  }

  // =========================================================================
  // Tailgate glass
  // =========================================================================
  const tg = tailgatePatch();
  addSlab(tail, buildSlab({ patch: tg, na: 52, nb: 56, thickness: SCREEN_THICK, depth: FLUSH }));

  const tgFrit = buildFrit({
    // Narrower across the top and bottom than the windscreen's shade band: on
    // the backlight the print is there to hide the bond line, nothing more.
    patch: tg, bandA: 0.020, bandB: 0.020, depth: FRIT_DEPTH,
    dotCount: 118, dotRows: 3, dotSize: 0.0068,
  });
  tail.frit.push(tgFrit.band);
  if (tgFrit.dots) tail.frit.push(tgFrit.dots);

  // Heated backlight. Fourteen elements between two busbars — printed on the
  // cabin face, so they sit inboard of the inner skin and read from both sides.
  const HEAT_DEPTH = FLUSH + SCREEN_THICK + 0.0004;
  const heater: THREE.BufferGeometry[] = [];
  // Elements only across the near-upright part of the glass. Above the
  // roll-over the pane is lying down as the tail's top surface; a real car
  // does not heat its roof.
  for (let i = 0; i < 14; i++) {
    const a = 0.335 + (i / 13) * 0.615;
    heater.push(buildStrip({ patch: tg, at: a, axis: 'a', from: 0.055, to: 0.945, half: 0.0028, depth: HEAT_DEPTH }));
  }
  for (const b of [0.055, 0.945]) {
    heater.push(buildStrip({ patch: tg, at: b, axis: 'b', from: 0.325, to: 0.960, half: 0.005, depth: HEAT_DEPTH }));
  }

  tail.seal.push(buildPatchSeal({
    patch: tg, at: (k) => loopUV(k, 0.06), n: 170, profile: BOND_PROFILE,
  }));

  // =========================================================================
  // Meshes
  // =========================================================================
  const panes: THREE.Mesh[] = [];

  const emit = (b: Bundle, parent: THREE.Object3D, tag: string): void => {
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, isPane: boolean): void => {
      if (geo.getAttribute('position') === undefined) return;
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      parent.add(m);
      if (isPane) panes.push(m);
    };
    if (b.outer.length) add(merge(b.outer), glassOut, `${tag}GlassOuter`, true);
    if (b.inner.length) add(merge(b.inner), glassIn, `${tag}GlassInner`, true);
    if (b.seal.length) add(merge(b.seal), sealMat, `${tag}Seals`, false);
    if (b.trim.length) add(merge(b.trim), trimMat, `${tag}Surround`, false);
    if (b.frit.length) add(merge(b.frit), fritMat, `${tag}Frit`, false);
  };

  emit(fixed, group, 'fixed');

  const doorGroups: Record<string, THREE.Group> = {};
  const dropGroups: Record<string, THREE.Group> = {};
  for (const [name, b] of Object.entries(doors)) {
    const g = new THREE.Group();
    g.name = `${name}Glazing`;
    const drop = new THREE.Group();
    drop.name = `${name}Drop`;
    g.add(drop);
    group.add(g);
    emit(b.frame, g, name);
    emit(b.drop, drop, `${name}Drop`);
    doorGroups[name] = g;
    dropGroups[name] = drop;
    nodes[`${name}Glazing`] = g;
  }

  const tailGroup = new THREE.Group();
  tailGroup.name = 'tailgateGlazing';
  group.add(tailGroup);
  emit(tail, tailGroup, 'tailgate');
  if (heater.length) {
    const hm = new THREE.Mesh(merge(heater), heaterMat);
    hm.name = 'demisterElements';
    hm.castShadow = false;
    tailGroup.add(hm);
  }
  nodes.tailgateGlazing = tailGroup;

  // =========================================================================
  // Articulations — drop glass
  // =========================================================================
  const drops: Array<{ node: THREE.Group; axis: THREE.Vector3; travel: number }> = [];
  for (const [name, node] of Object.entries(dropGroups)) {
    const side: 1 | -1 = name.endsWith('R') ? 1 : -1;
    const zMid = name.startsWith('doorF')
      ? 0.5 * (DLO.quarterDivZ + B_PILLAR.front)
      : 0.5 * (B_PILLAR.rear + C_PILLAR.front);
    const axis = dropVector(zMid, side);
    const travel = dropTravel(zMid, side);
    drops.push({ node, axis, travel });
    const key = `window${name.slice(4)}`;
    articulations.push({
      name: key, value: 0, target: 0, duration: 1.4,
      apply: (v) => node.position.copy(axis).multiplyScalar(travel * v),
    });
  }

  // =========================================================================
  // Runtime wiring
  // =========================================================================
  //
  // Builders cannot see each other's nodes, so the door and tailgate glazing
  // is re-parented onto the body's own pivots on the first frame. Doing it by
  // the documented node names keeps this the only coupling, and because the
  // pivots are identity at rest nothing moves when it happens.
  let wired = false;

  const wire = (): void => {
    wired = true;
    const root = group.parent;
    if (!root) return;

    const attach = (child: THREE.Group, panelName: string): void => {
      const panel = root.getObjectByName(panelName);
      const pivot = panel?.parent;
      if (!pivot || pivot === child.parent) return;
      child.position.copy(pivot.position).negate();
      child.quaternion.copy(pivot.quaternion).invert();
      pivot.add(child);
    };

    attach(tailGroup, 'tailgatePanel');
    for (const [name, g] of Object.entries(doorGroups)) attach(g, name);

    // Glass should not cast a hard shadow into its own cabin: three has no
    // notion of a translucent shadow caster, and a solid one turns the
    // interior black. The surrounds still cast, which is what you see anyway.
    for (const m of panes) m.castShadow = false;
  };

  return {
    group,
    nodes,
    articulations,
    update(_dt: number, _elapsed: number, _state: VehicleState): void {
      if (!wired) wire();
    },
  };
}

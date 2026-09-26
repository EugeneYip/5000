/**
 * Panel layout.
 *
 * Every panel is a region of the (z, t) parameter rectangle of the master
 * surface, or — for the two end faces, which a transverse loft cannot express
 * — a region of the (x, y) plane rolled back onto the shell's end section.
 *
 * Shutlines come straight from `HP.side.doorFrontZ / doorMidZ / doorRearZ`;
 * each panel insets its own edge by half of `QUALITY.panelGap` and then rolls
 * through `QUALITY.edgeRadius` before returning inward as a flange, so the gap
 * is a real void with a dark return behind it.
 */

import * as THREE from 'three';
import { QUALITY, BODY } from '@/spec';
import { HP } from '@/car/hardpoints';
import { buildShell, type GridSample, type EdgeOpt } from './panel';
import { clamp, lerp, smoothstep, mirrorGeometry, mergeGeometries } from './math';
import {
  T, Z_NOSE_FACE, Z_TAIL_END,
  surfacePoint, surfaceNormal, arcLen, arcRate, dtFor,
  tAtY, halfWidthAt, heightAt, archT, archTopY, zSteps, tSteps,
} from './surface';

// ---------------------------------------------------------------------------
// Edge treatments
// ---------------------------------------------------------------------------

export interface Bound { gap: number; radius: number; flange: number }

const ER = QUALITY.edgeRadius;
const HALF_GAP = QUALITY.panelGap / 2;

/** Panel-to-panel shutline: real gap, rolled edge, deep return. */
const SHUT: Bound = { gap: HALF_GAP, radius: ER, flange: 0.030 };
/** A shutline on a moving panel — returns further so nothing shows through. */
const SHUT_DEEP: Bound = { gap: HALF_GAP, radius: ER, flange: 0.055 };
/** Edge of an aperture the glass or a lamp will fill. */
const OPEN: Bound = { gap: 0, radius: ER, flange: 0.034 };
/** Roof turning down into the daylight opening — a radius, never a gutter. */
const SOFT: Bound = { gap: 0, radius: ER, flange: 0.016 };
/** Wheel-arch lip: bigger radius, long return into the wheel house. */
const ARCH: Bound = { gap: 0, radius: ER * 1.4, flange: 0.062 };
/** Welded or shared with the neighbouring panel: no inset, no roll. */
const BUTT: Bound = { gap: 0, radius: 0, flange: 0 };

const toEdge = (b: Bound): EdgeOpt => ({ radius: b.radius, flange: b.flange });

// ---------------------------------------------------------------------------
// Longitudinal landmarks
// ---------------------------------------------------------------------------

export const Z = {
  noseFace: Z_NOSE_FACE,                  //  0.862
  lampBack: 0.782,                        //  rear wall of the lamp aperture
  hoodFront: HP.front.hoodFrontZ,         //  0.782
  hoodRear: -0.345,
  cowlRear: -0.372,
  doorF: HP.side.doorFrontZ,              // −0.455
  doorM: HP.side.doorMidZ,                // −1.585
  doorR: HP.side.doorRearZ,               // −2.585
  cPillarRear: -2.648,
  header: HP.headerZ,                     // −1.280
  dPillar: HP.roof.dPillarZ,              // −2.968
  tgHinge: HP.rear.tailgateHingeZ,        // −3.108
  tgGlassTop: -3.186,
  dPillarRear: -3.606,
  tailEnd: Z_TAIL_END,                    // −3.700
} as const;

const FRONT_AXLE = 0;
const REAR_AXLE = -BODY.wheelbase;

// ---------------------------------------------------------------------------
// Feature lines in (z, t)
// ---------------------------------------------------------------------------

/** Outer limit of the roof skin — just past where it turns down. */
export const tRoofOuter = (z: number): number => T.roofEdge + dtFor(z, T.roofEdge, 0.016);

/** Inner edge of the A-pillar, i.e. the windscreen aperture. */
const tScreenEdge = (z: number): number => T.roofEdge - dtFor(z, T.roofEdge, 0.032);

/**
 * Lower edge of the A-pillar. At the scuttle the pillar is as deep as the
 * whole cowl side; by the time the front door starts it has narrowed to a slim
 * flush-glazed pillar, which is what lets the DLO read as one clean band.
 */
const aPillarLower = (z: number): number => {
  const slim = T.roofEdge + dtFor(z, T.roofEdge, 0.078);
  return lerp(slim, T.belt, smoothstep(-0.620, -0.400, z));
};

/** Top edge of the front wing: the bonnet shutline, turning up at the cowl. */
export const wingTop = (z: number): number => {
  if (z >= Z.hoodRear) return T.roofEdge;
  return lerp(aPillarLower(z), T.roofEdge, smoothstep(-0.400, Z.hoodRear, z));
};

/**
 * Tailgate side shutline. It leaves the roof at the hinge line and rakes hard
 * back and down across the D-pillar to meet the beltline near the lamps —
 * on the Avant this cut is close to 55° from vertical.
 */
export const tTailgate = (z: number): number => {
  if (z >= Z.tgHinge) return tRoofOuter(z);
  const k = smoothstep(Z.dPillarRear, Z.tgHinge, z);   // 1 at the hinge, 0 aft
  return lerp(T.belt, tRoofOuter(z), k);
};

/** Rear edge of the daylight opening — the D-pillar's leading edge. */
export const tDloRear = (z: number): number => {
  if (z >= Z.dPillar) return tRoofOuter(z);
  const k = smoothstep(-3.420, Z.dPillar, z);
  return lerp(T.belt, tRoofOuter(z), k);
};

/** Lower bound of a flank panel: the beltline, or the arch where there is one. */
function flankBottom(z: number, axleZ: number): number {
  return Math.min(T.lowerA, archT(z, axleZ, heightAt(z, T.lowerA) + 0.012));
}

// ---------------------------------------------------------------------------
// Shell panel builder
// ---------------------------------------------------------------------------

export interface ShellPanelSpec {
  /** Forward z limit; a function of the lateral parameter b ∈ [0,1] if needed. */
  zFront: number | ((b: number) => number);
  zRear: number | ((b: number) => number);
  /** t bounds at a given station. tLo is nearer the roof. */
  tLo: number | ((z: number) => number);
  tHi: number | ((z: number) => number);
  /** Mirror t about zero, so the panel spans both sides (roof, bonnet, …). */
  span?: boolean;
  front?: Bound; rear?: Bound; lo?: Bound; hi?: Bound;
  /** Push the surface inward along its normal (the cowl's wiper trough). */
  sink?: (z: number, t: number) => number;
  nz?: number; nt?: number;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

export function shellPanel(s: ShellPanelSpec): THREE.BufferGeometry {
  const zF = typeof s.zFront === 'function' ? s.zFront : () => s.zFront as number;
  const zR = typeof s.zRear === 'function' ? s.zRear : () => s.zRear as number;
  const tL = typeof s.tLo === 'function' ? s.tLo : () => s.tLo as number;
  const tH = typeof s.tHi === 'function' ? s.tHi : () => s.tHi as number;
  const span = s.span ?? false;

  const bFront = s.front ?? SHUT;
  const bRear = s.rear ?? SHUT;
  const bLo = s.lo ?? SHUT;
  const bHi = s.hi ?? SHUT;

  const zMid = 0.5 * (zF(0.5) + zR(0.5));
  const nz = s.nz ?? zSteps(zF(0.5), zR(0.5));
  const nt = s.nt ?? tSteps(zMid, span ? -tH(zMid) : tL(zMid), tH(zMid));

  // Arc-length table at the mid station: gives paint grain a consistent scale
  // across every panel without integrating per vertex.
  const tabLo = span ? -tH(zMid) : tL(zMid);
  const tabHi = tH(zMid);
  const TAB = 33;
  const tabU: number[] = [];
  for (let i = 0; i < TAB; i++) tabU.push(arcLen(zMid, lerp(tabLo, tabHi, i / (TAB - 1))));
  const uAt = (t: number): number => {
    const k = clamp((t - tabLo) / Math.max(tabHi - tabLo, 1e-6), 0, 1) * (TAB - 1);
    const i = Math.min(TAB - 2, Math.floor(k));
    return lerp(tabU[i], tabU[i + 1], k - i);
  };

  const sample = (a: number, b: number): GridSample => {
    const z0 = zF(b) - (bFront.gap + bFront.radius);
    const z1 = zR(b) + (bRear.gap + bRear.radius);
    const z = lerp(z0, z1, a);

    let lo = span ? -tH(z) : tL(z);
    let hi = tH(z);
    if (span) {
      const d = dtFor(z, hi, bHi.gap + bHi.radius);
      lo += d; hi -= d;
    } else {
      lo += dtFor(z, lo, bLo.gap + bLo.radius);
      hi -= dtFor(z, hi, bHi.gap + bHi.radius);
      if (hi < lo + 1e-4) hi = lo + 1e-4;
    }
    const t = lerp(lo, hi, b);

    surfacePoint(z, t, _p);
    surfaceNormal(z, t, _n);
    if (s.sink) _p.addScaledVector(_n, -s.sink(z, t));
    return { p: _p, n: _n, u: uAt(t), v: Z_NOSE_FACE - z };
  };

  return buildShell({
    sample, na: nz, nb: nt,
    edges: {
      a0: toEdge(bFront), a1: toEdge(bRear),
      b0: toEdge(span ? bHi : bLo), b1: toEdge(bHi),
    },
  });
}

// ---------------------------------------------------------------------------
// End-face patch builder
// ---------------------------------------------------------------------------

export interface FacePatchSpec {
  yLo: number; yHi: number;
  /** Signed x limits at a given height. */
  xLo: (y: number) => number;
  xHi: (y: number) => number;
  /** z of the face as a function of how close the point is to the roll-over. */
  zAt: (x: number, y: number) => number;
  /** +1 if the outward normal points forward (nose), −1 for the tail. */
  facing: 1 | -1;
  bottom?: Bound; top?: Bound; inner?: Bound; outer?: Bound;
  ny?: number; nx?: number;
}

export function facePatch(s: FacePatchSpec): THREE.BufferGeometry {
  const bBot = s.bottom ?? OPEN;
  const bTop = s.top ?? OPEN;
  const bIn = s.inner ?? OPEN;
  const bOut = s.outer ?? OPEN;
  const ny = s.ny ?? Math.max(4, Math.round((s.yHi - s.yLo) * QUALITY.bodySegments * 0.42));
  const nx = s.nx ?? Math.max(4, Math.round(
    (s.xHi(0.5 * (s.yLo + s.yHi)) - s.xLo(0.5 * (s.yLo + s.yHi))) * QUALITY.bodySegments * 0.42));

  const D = 0.004;
  const sample = (a: number, b: number): GridSample => {
    const y = lerp(s.yLo + bBot.gap + bBot.radius, s.yHi - (bTop.gap + bTop.radius), a);
    const x0 = s.xLo(y) + bIn.gap + bIn.radius;
    const x1 = s.xHi(y) - (bOut.gap + bOut.radius);
    const x = lerp(x0, Math.max(x1, x0 + 1e-4), b);
    const z = s.zAt(x, y);
    const fx = (s.zAt(x + D, y) - s.zAt(x - D, y)) / (2 * D);
    const fy = (s.zAt(x, y + D) - s.zAt(x, y - D)) / (2 * D);
    _p.set(x, y, z);
    _n.set(-s.facing * fx, -s.facing * fy, s.facing).normalize();
    return { p: _p, n: _n, u: x, v: y };
  };

  return buildShell({
    sample, na: ny, nb: nx,
    edges: {
      a0: toEdge(bBot), a1: toEdge(bTop),
      b0: toEdge(bIn), b1: toEdge(bOut),
    },
  });
}

// ---------------------------------------------------------------------------
// Rear face geometry
// ---------------------------------------------------------------------------
//
// The tail rolls over from the last lofted station to a near-flat face. The
// roll is concentrated in the outer ~100 mm so the taillamp and plate area is
// genuinely flat, and only the extreme corners wrap.

const REAR_FLAT_Z = -3.792;
const REAR_Y_LO = heightAt(Z_TAIL_END, 0.96);
const REAR_Y_HI = heightAt(Z_TAIL_END, 0.0);

/** Half-width of the tail's outline at height `y`. */
export function rearHalfWidth(y: number): number {
  const t = tAtY(Z_TAIL_END, clamp(y, REAR_Y_LO, REAR_Y_HI));
  return halfWidthAt(Z_TAIL_END, t);
}

export function rearFaceZ(x: number, y: number): number {
  const hw = Math.max(rearHalfWidth(y), 1e-3);
  const ex = clamp(Math.abs(x) / hw, 0, 1);
  const ey = clamp(Math.max(
    (y - REAR_Y_HI) / (REAR_Y_HI - REAR_Y_LO) + 1,
    (REAR_Y_LO - y) / (REAR_Y_HI - REAR_Y_LO) + 1,
  ), 0, 1);
  const e = Math.max(ex, ey);
  return lerp(REAR_FLAT_Z, Z_TAIL_END, Math.pow(e, 6));
}

// ---------------------------------------------------------------------------
// Front face geometry
// ---------------------------------------------------------------------------

const NOSE_FLAT_Z = Z_NOSE_FACE + 0.014;
const NOSE_Y_LO = heightAt(Z_NOSE_FACE, 0.96);
const NOSE_Y_HI = heightAt(Z_NOSE_FACE, 0.0);

export function noseHalfWidth(y: number): number {
  const t = tAtY(Z_NOSE_FACE, clamp(y, NOSE_Y_LO, NOSE_Y_HI));
  return halfWidthAt(Z_NOSE_FACE, t);
}

export function noseFaceZ(x: number, y: number): number {
  const hw = Math.max(noseHalfWidth(y), 1e-3);
  const ex = clamp(Math.abs(x) / hw, 0, 1);
  const ey = clamp(Math.max(
    (y - NOSE_Y_HI) / (NOSE_Y_HI - NOSE_Y_LO) + 1,
    (NOSE_Y_LO - y) / (NOSE_Y_HI - NOSE_Y_LO) + 1,
  ), 0, 1);
  return lerp(NOSE_FLAT_Z, Z_NOSE_FACE, Math.pow(Math.max(ex, ey), 5));
}

// ---------------------------------------------------------------------------
// Wheel-house liners — so an open arch never shows daylight through the car.
// ---------------------------------------------------------------------------

export function wheelHouse(axleZ: number, sign: 1 | -1): THREE.BufferGeometry {
  const inner = HP.side.archLipX - 0.215;
  const nA = 26, nB = 8;
  const sample = (a: number, b: number): GridSample => {
    const ang = lerp(-1, 1, a);
    const zz = axleZ + ang * HP.side.archRadius * 0.995;
    const topY = archTopY(zz, axleZ) ?? HP.wheelRadius;
    const depth = lerp(0, 1, b);
    const x = lerp(HP.side.archLipX - 0.012, inner, depth);
    // The liner drops away from the lip and closes over the top of the tyre.
    const y = lerp(topY - 0.012, HP.wheelRadius + HP.side.archRadius * 0.62, depth * depth);
    _p.set(sign * x, y, zz);
    _n.set(0, -1, 0);
    return { p: _p, n: _n, u: ang * HP.side.archRadius, v: depth * 0.2 };
  };
  return buildShell({ sample, na: nA, nb: nB, edges: {} });
}

// ---------------------------------------------------------------------------
// Mirroring helper
// ---------------------------------------------------------------------------

export function pair(g: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  return [g, mirrorGeometry(g)];
}

export { mergeGeometries, aPillarLower, tScreenEdge, flankBottom, FRONT_AXLE, REAR_AXLE };
export { SHUT, SHUT_DEEP, OPEN, SOFT, ARCH, BUTT };

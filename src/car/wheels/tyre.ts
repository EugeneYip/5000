/**
 * 185/70 HR14.
 *
 * Three things make or break a rendered tyre.
 *
 *  1. **The sidewall is not a torus.** It leaves the bead, flares over the
 *     flange into the rim protector rib, is *concave* above it, and only then
 *     swells out to the widest point at 69 % of section height before turning
 *     into the shoulder. A circular arc from bead to tread reads as a
 *     doughnut and no amount of shading rescues it. The section lives in
 *     `dims.sidewallProfile()` and every radius in it is a fraction of
 *     `TYRE.sectionH`, so the whole shape follows `tyreRadius()`.
 *  2. **It is flat where it meets the road.** A perfectly round tyre resting
 *     on a plane is the single most damning error in CG car work, and one
 *     that clips through the plane is worse. See "Contact patch" below —
 *     neither is possible here by construction.
 *  3. **It is exactly 614.6 mm across.** Built from `tyreRadius()` and
 *     nothing else. The previous build added the static sag to the free
 *     radius so the hub could stay at `wheelPositions()`, which made the tyre
 *     639 mm and — because the deformation shader never actually ran, the
 *     clone it was layered onto having dropped the library's `onBeforeCompile`
 *     — left it 12 mm inside the road as well.
 *
 * ## Contact patch
 *
 * `wheelPositions()` puts the hub at exactly one free radius above the road,
 * so the free circle is *tangent* to it: there is nothing to cut away. The
 * patch is therefore made by growing a foot rather than slicing a chord. For
 * every vertex the shader works out `rGround`, the radius at which that vertex
 * would sit exactly on the road, and then
 *
 *   * pulls the carcass **out** to `rGround` inside the patch window, which
 *     makes the tread dead flat along the road, and
 *   * clamps every vertex to `rGround`, which makes penetration impossible
 *     for any load, camber or steering angle.
 *
 * Outside the window nothing moves, so the free diameter is untouched: the
 * tyre measures 614.6 mm loaded or not, and its lowest point is the road
 * plane to the last decimal. The window is `acos((R − sag)/R)` wide, i.e. the
 * chord a real tyre of that sag would cut, so the patch is the right *length*
 * even though it is arrived at from the other direction.
 *
 * `uSpin` rotates the carcass *inside* the shader, so the flat spot stays at
 * the bottom while the tread pattern turns through it, and all four corners
 * can share one geometry and one material.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import {
  DEFLECT_MAX, DEFLECT_MIN, DEFLECT_STATIC, RIM, TYRE, sidewallProfile,
} from './dims';
import { smoothstep } from './util';
import { buildTyreNormalMap } from './textures';
import { buildLegend } from './sidewall';
import { layerVertex } from './materials';

const PITCHES = TYRE.pitches;

/**
 * Where each angular ring sits inside one tread pitch, and whether the
 * lateral grooves are open there. Five rings per pitch is the minimum that
 * gives a groove two walls and a floor; the pattern's stagger is bought for
 * nothing by reading the flag from a *shifted* ring for each band, so the two
 * shoulders and the two intermediate ribs never slot in lockstep.
 */
const RING_PHASES = [0.00, 0.52, 0.60, 0.80, 0.88];
const CUT_AT = [false, false, true, true, false];

/** Real tyres vary the pitch length so the tread noise spreads over a band
 *  instead of putting it all on one screaming harmonic. */
const PITCH_SEQUENCE = [1.0, 0.88, 1.12, 0.94, 1.06];

/** How far the flag is read ahead for each band, in rings. */
const STAGGER = { shoulderOut: 0, shoulderIn: 2, interOut: 1, interIn: 3 };

type Band = 'sidewall' | 'shoulderOut' | 'shoulderIn' | 'interOut' | 'interIn' | 'centre' | 'groove';

interface Lateral {
  axial: number;
  rBase: number;
  band: Band;
  /** How much of the contact-patch deflection this station follows. */
  flex: number;
  /** How much it swells outboard beside the patch. */
  bulge: number;
  v: number;
  /** 0 = land, 1 = full groove depth. */
  baseDepth: number;
  /** How much of this band's lateral cut reaches this station. Lets a shoulder
   *  block carry on over the shoulder and die out down the sidewall. */
  cutScale: number;
}

// ---------------------------------------------------------------------------
// Cross-section
// ---------------------------------------------------------------------------

/**
 * Tread stations as `s = axial / (treadW/2)`.
 *
 * Four circumferential grooves, five ribs: a continuous centre rib, two
 * intermediate ribs notched laterally, and two shoulder ribs broken into
 * blocks. That is the period all-season layout — an asymmetric or
 * directional pattern would be forty years early.
 */
const TREAD_S: Array<[number, Band, number]> = [
  [-1.000, 'shoulderIn', 0],
  [-0.880, 'shoulderIn', 0],
  [-0.730, 'shoulderIn', 0],
  [-0.690, 'groove', 1],
  [-0.640, 'groove', 1],
  [-0.600, 'interIn', 0],
  [-0.270, 'interIn', 0],
  [-0.230, 'groove', 1],
  [-0.170, 'groove', 1],
  [-0.130, 'centre', 0],
  [0.000, 'centre', 0],
  [0.130, 'centre', 0],
  [0.170, 'groove', 1],
  [0.230, 'groove', 1],
  [0.270, 'interOut', 0],
  [0.600, 'interOut', 0],
  [0.640, 'groove', 1],
  [0.690, 'groove', 1],
  [0.730, 'shoulderOut', 0],
  [0.880, 'shoulderOut', 0],
  [1.000, 'shoulderOut', 0],
];

/** The inboard sidewall is never on camera: same section, every other point. */
const INBOARD_KEEP = [0, 1, 3, 5, 7, 9, 11, 13];

/**
 * How much of the contact-patch deflection a station at radius `r` follows.
 *
 * The belt is inextensible, so where it flattens it is the *sidewall* that
 * gives, folding outward. The bead is clamped on the rim and cannot move at
 * all; the shoulder moves with the belt. Ramping between the two over the
 * whole section height — rather than saturating a third of the way up, as an
 * earlier version did — is what stops the tyre reading as a flat one: the
 * mid-sidewall no longer balloons radially either side of the patch.
 */
function flexAt(r: number): number {
  const Rb = RIM.beadR;
  return smoothstep(Rb + TYRE.sectionH * 0.09, Rb + TYRE.sectionH * 0.96, r);
}

export interface CrossSection {
  lat: Lateral[];
  /** Radius (as a fraction of section height) to texture v. */
  vAtT(t: number, outboard: boolean): number;
}

function buildCrossSection(): CrossSection {
  const Rt = TYRE.freeR;
  const Rb = RIM.beadR;
  const sec = TYRE.sectionH;
  const half = TYRE.treadW / 2;
  const side = sidewallProfile();

  // Arc length up the section, so the legend and the serration ring keep their
  // proportions in the texture instead of bunching where the section turns.
  const arc: number[] = [0];
  for (let i = 1; i < side.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(side[i][0] - side[i - 1][0], side[i][1] - side[i - 1][1]));
  }
  const arcTotal = arc[arc.length - 1];

  const bulgeOf = (r: number): number => {
    const t = Math.max(0, Math.min(1, (r - Rb) / sec));
    return Math.sin(Math.PI * Math.pow(t, 1.45));
  };

  const lat: Lateral[] = [];

  // The shoulder blocks do not stop at the edge of the tread band. On a real
  // 185/70 they wrap over the shoulder and die out a centimetre down the
  // sidewall, and that wrap is the ONLY part of the tread a camera outside the
  // car can see at all — everything on the crown is inside the arch. Keyed by
  // sidewall station index, counting down from the shoulder.
  const SHOULDER_WRAP = [0.78, 0.42, 0.16];

  const pushSide = (i: number, outboard: boolean): void => {
    const [ax, r] = side[i];
    const fromTop = side.length - 1 - i;
    const wrap = SHOULDER_WRAP[fromTop] ?? 0;
    lat.push({
      axial: outboard ? ax : -ax,
      rBase: r,
      band: wrap > 0 ? (outboard ? 'shoulderOut' : 'shoulderIn') : 'sidewall',
      flex: flexAt(r),
      bulge: bulgeOf(r),
      v: outboard ? 0.72 + 0.28 * (arc[i] / arcTotal) : 0.28 - 0.28 * (arc[i] / arcTotal),
      baseDepth: 0,
      cutScale: wrap,
    });
  };

  // The strip has to trace the section in ONE direction — inboard bead up to
  // the inboard shoulder, across the tread, down to the outboard bead — or the
  // triangle winding reverses halfway along it. Both sidewalls used to be
  // traversed the wrong way round, so both came out inside-out; backface
  // culling then removed whichever one faced the camera and the tyre lost most
  // of its visible width. That is what made the car look like it was on stilts.
  for (const k of INBOARD_KEEP) pushSide(k, false);

  for (const [s, band, depth] of TREAD_S) {
    // Barrelled, not cylindrical: the crown stands proud of the shoulders.
    const rBase = Rt - TYRE.crownDrop * s * s;
    lat.push({
      axial: s * half,
      rBase,
      band,
      flex: 1,
      bulge: bulgeOf(rBase),
      v: 0.5 + s * 0.22,
      baseDepth: depth,
      cutScale: 1,
    });
  }

  for (let i = side.length - 1; i >= 0; i--) pushSide(i, true);

  const vAtT = (t: number, outboard: boolean): number => {
    const target = Rb + t * sec;
    for (let i = 1; i < side.length; i++) {
      const r0 = side[i - 1][1];
      const r1 = side[i][1];
      if (target >= r0 && target <= r1) {
        const k = (target - r0) / (r1 - r0 || 1e-9);
        const a = (arc[i - 1] + (arc[i] - arc[i - 1]) * k) / arcTotal;
        return outboard ? 0.72 + 0.28 * a : 0.28 - 0.28 * a;
      }
    }
    return outboard ? 1 : 0;
  };

  return { lat, vAtT };
}

// ---------------------------------------------------------------------------
// Tread pattern
// ---------------------------------------------------------------------------

interface Ring {
  angle: number;
  cut: boolean;
}

function ringPhases(): Ring[] {
  const rings: Ring[] = [];
  const weights = Array.from({ length: PITCHES }, (_, i) => PITCH_SEQUENCE[i % PITCH_SEQUENCE.length]);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let p = 0; p < PITCHES; p++) {
    const start = (acc / total) * Math.PI * 2;
    const span = (weights[p] / total) * Math.PI * 2;
    acc += weights[p];
    for (let k = 0; k < RING_PHASES.length; k++) {
      rings.push({ angle: start + span * RING_PHASES[k], cut: CUT_AT[k] });
    }
  }
  return rings;
}

/** Lateral cut depth, 0..1, for one band at one angular ring. */
function cutDepth(band: Band, rings: readonly Ring[], c: number): number {
  const at = (shift: number): boolean => rings[(c + shift) % rings.length].cut;
  switch (band) {
    // Shoulder blocks are cut right through, and the cut runs on into the
    // outer circumferential groove so the block really is a block.
    case 'shoulderOut': return at(STAGGER.shoulderOut) ? 1 : 0;
    case 'shoulderIn': return at(STAGGER.shoulderIn) ? 1 : 0;
    // The intermediate ribs are only notched — half depth, so the rib still
    // runs continuously round the tyre and carries the steering.
    case 'interOut': return at(STAGGER.interOut) ? 0.55 : 0;
    case 'interIn': return at(STAGGER.interIn) ? 0.55 : 0;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface Built {
  geom: THREE.BufferGeometry;
  /** Widest radius actually present, for the measured-OD report. */
  maxR: number;
}

function buildCarcass(lat: Lateral[], rings: Ring[]): Built {
  const n = lat.length;
  const cols = rings.length;
  const count = n * (cols + 1);

  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const flex = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const idx: number[] = [];

  const depth = TYRE.treadDepth;
  let maxR = 0;

  for (let c = 0; c <= cols; c++) {
    const wrapped = c % cols;
    const ang = c === cols ? Math.PI * 2 : rings[wrapped].angle;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);

    for (let i = 0; i < n; i++) {
      const L = lat[i];
      const d = Math.max(L.baseDepth, cutDepth(L.band, rings, wrapped) * L.cutScale);
      const r = L.rBase - d * depth;
      if (r > maxR) maxR = r;

      const o = (c * n + i) * 3;
      pos[o] = L.axial;
      pos[o + 1] = r * ca;
      pos[o + 2] = r * sa;

      uv[(c * n + i) * 2] = (c / cols) * 2;
      uv[(c * n + i) * 2 + 1] = L.v;

      flex[(c * n + i) * 2] = L.flex;
      flex[(c * n + i) * 2 + 1] = L.bulge;

      // Baked occlusion. Smooth normals cannot tell a groove from a dimple;
      // darkening the floors is what makes the channels read as channels.
      const ao = 1 - 0.62 * d;
      // Road film collects low on the sidewall and in the tread. It is a clean
      // radial gradient and nothing else: a vertex-rate fbm on a mesh this
      // coarse cannot make anything finer than 50 mm blotches, and those read
      // as damp cardboard. The fine variation is the material's job.
      const film = 0.13 * smoothstep(0.30, 0.08, (L.rBase - RIM.beadR) / TYRE.sectionH);
      // 0.88: the shared rubber carries a road-film tint that is right for a
      // weatherstrip and a little light for a carbon-black tread compound.
      // Vertex colour is the cheap, local way to take a tyre back towards
      // tyre black without touching a material five other parts wear.
      const g = Math.max(0.35, Math.min(1.1, ao * (1 - film))) * 0.88;
      const k = (c * n + i) * 3;
      col[k] = g * 1.02;
      col[k + 1] = g;
      col[k + 2] = g * 0.97;
    }
  }

  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < n - 1; i++) {
      const a = c * n + i;
      const b = (c + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geom: g, maxR };
}

/**
 * Give the legend the carcass's own attribute set so the two can be merged
 * into one draw: the letters have to flex, dust and deform with the rubber
 * they are moulded into, not sit on it as a separate object.
 */
function dressLegend(legend: THREE.BufferGeometry, xs: CrossSection): THREE.BufferGeometry {
  const pos = legend.getAttribute('position');
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  const flex = new Float32Array(n * 2);
  const col = new Float32Array(n * 3);

  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(y, z);
    const t = (r - RIM.beadR) / TYRE.sectionH;

    uv[i * 2] = ((Math.atan2(z, y) / (Math.PI * 2) + 1) % 1) * 2;
    uv[i * 2 + 1] = xs.vAtT(Math.max(0, Math.min(1, t)), true);

    flex[i * 2] = flexAt(r);
    flex[i * 2 + 1] = Math.sin(Math.PI * Math.pow(Math.max(0, Math.min(1, t)), 1.45));

    // A polished mould cavity leaves the characters cleaner than the
    // sand-blasted carcass around them.
    col[i * 3] = 0.96;
    col[i * 3 + 1] = 0.94;
    col[i * 3 + 2] = 0.91;
  }

  legend.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  legend.setAttribute('aFlex', new THREE.BufferAttribute(flex, 2));
  legend.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return legend;
}

// ---------------------------------------------------------------------------
// Deformation
// ---------------------------------------------------------------------------

const DECLS = /* glsl */ `
uniform float uSpin;
uniform float uFreeRadius;
uniform float uDeflect;
uniform float uBulgeGain;
uniform float uGroundY;
attribute vec2 aFlex;
vec3 audiTyreDeformed;
float audiTyreFlat;
vec2 audiTyreRot;
vec3 audiTyreUp;
`;

const DEFORM = /* glsl */ `
{
  float phi = atan(position.z, position.y);
  float r   = length(position.yz);
  float p2  = phi + uSpin;
  vec2  rot = vec2(cos(p2), sin(p2));

  // World "up" written in the wheel's own frame. Doing it this way rather
  // than assuming local -Y is what lets camber put the patch on the inner
  // shoulder, and what keeps the flat spot on the road when the wheel steers.
  audiTyreUp = normalize(vec3(modelMatrix[0].y, modelMatrix[1].y, modelMatrix[2].y));
  float H = modelMatrix[3].y - uGroundY;

  float cd = -(rot.x * audiTyreUp.y + rot.y * audiTyreUp.z);   // 1 = pointing down
  float rGround = cd > 1e-3 ? (H + position.x * audiTyreUp.x) / cd : 1.0e6;

  // Half-angle of the chord a real tyre of this sag would cut. The ramp is a
  // fraction of it, so the patch keeps the right length as the load changes
  // instead of growing a fixed skirt that never scales.
  float cosA = (uFreeRadius - uDeflect) / uFreeRadius;
  float ramp = (1.0 - cosA) * 0.45 + 0.002;
  float win  = smoothstep(cosA - ramp, cosA + ramp, cd);
  float push = max(0.0, rGround - uFreeRadius) * win * aFlex.x;
  // The min() is the no-penetration guarantee: nothing can end up at a radius
  // that would put it below the road, whatever the load or the camber.
  float rn   = min(r + push, rGround);

  audiTyreFlat = win * aFlex.x * aFlex.x;
  audiTyreRot  = rot;
  float bulge  = aFlex.y * uDeflect * win * uBulgeGain;
  audiTyreDeformed = vec3(
    position.x + sign(position.x) * bulge,
    rn * rot.x,
    rn * rot.y
  );
}
`;

const DEFORM_NORMAL = /* glsl */ `
{
  float cs = cos(uSpin);
  float sn = sin(uSpin);
  vec3 nRot = vec3(objectNormal.x,
                   objectNormal.y * cs - objectNormal.z * sn,
                   objectNormal.y * sn + objectNormal.z * cs);
  // Inside the contact patch the surface normal is the road's, not the tyre's.
  vec3 radial = normalize(vec3(0.0, audiTyreRot.x, audiTyreRot.y));
  float facing = max(0.0, dot(radial, nRot));
  objectNormal = normalize(mix(nRot, -audiTyreUp, clamp(audiTyreFlat, 0.0, 1.0) * facing * 0.9));
}
`;

export interface TyreResult {
  mesh: THREE.Mesh;
  uniforms: {
    uSpin: THREE.IUniform<number>;
    uFreeRadius: THREE.IUniform<number>;
    uDeflect: THREE.IUniform<number>;
    uBulgeGain: THREE.IUniform<number>;
    uGroundY: THREE.IUniform<number>;
  };
  triangles: number;
  /** Measured off the built vertices, not off the parameters. */
  measured: { outerDiameter: number; sectionWidth: number; legendTriangles: number };
}

export function buildTyre(ctx: BuildContext): TyreResult {
  const xs = buildCrossSection();
  const built = buildCarcass(xs.lat, ringPhases());

  let geom = built.geom;
  let legendTris = 0;
  const legend = buildLegend(sidewallProfile());
  if (legend) {
    legendTris = (legend.getIndex()?.count ?? legend.getAttribute('position').count) / 3;
    const merged = mergeIntoCarcass(geom, dressLegend(legend, xs));
    if (merged) {
      geom.dispose();
      geom = merged;
    }
  }

  // The shader moves vertices outside the rest pose; give the culler room.
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), TYRE.freeR * 1.09);

  const normalMap = buildTyreNormalMap(
    { vAtT: xs.vAtT, uRepeat: 2, sectionHeight: TYRE.sectionH },
    TYRE.freeR,
  );

  // One shared library instance, asked for in the library's own terms.
  //
  // This used to be a `privateClone` whose `onBeforeCompile` then reached into
  // `createRubber`'s uniforms *by name* to retune them — `uRubberParams` for
  // the road film and `uRubberMould` for the lettering gloss — with a runtime
  // warning for the day the library renamed them. Both are options now:
  //
  //  - `createRubber` is authored for weatherstrips and runs its dust blotch at
  //    120 cells/m, an 8 mm cell. Invisible on a door seal; on a 130 mm
  //    sidewall filling half a close-up it reads as camouflage, which is what
  //    made the tyre look like wet cardboard. A tyre's dirt is a film, not a
  //    pattern: finer (320 cells/m) and fainter (0.10 coverage).
  //  - the library finds a moulded character by how sharply the surface curves,
  //    and 1.3 mm of relief on a surface this big clears a much lower threshold
  //    than a weatherstrip's bead does. 55 1/m, and more gloss when it clears,
  //    is the difference between a legend you can read in a still and a smudge.
  //
  // Nothing else on the car asks for this option set, so the instance is the
  // tyre's alone and `layerVertex` below may safely mutate it. Unlike the
  // clone it is in the registry, so `setEnvMap` reaches it.
  const material = ctx.materials.rubber({
    roughness: 0.93,
    dust: 0.10,
    dustCells: 320,
    mouldGloss: 0.46,
    mouldCurve: 55,
    vertexColors: true,
  }) as THREE.MeshPhysicalMaterial;
  material.normalMap = normalMap;
  material.normalScale = new THREE.Vector2(0.62, 0.62);
  material.needsUpdate = true;

  const uniforms = {
    uSpin: { value: 0 },
    uFreeRadius: { value: TYRE.freeR },
    uDeflect: { value: DEFLECT_STATIC },
    uBulgeGain: { value: 1.0 },
    uGroundY: { value: 0 },
  };

  layerVertex(material, {
    key: 'wheels-tyre-deform-v2',
    uniforms,
    declarations: DECLS,
    afterBeginNormal: `${DEFORM}\n${DEFORM_NORMAL}`,
    afterBeginVertex: 'transformed = audiTyreDeformed;',
    // Keep the library's procedural grain locked to the rubber rather than
    // letting the tyre spin through a pattern fixed in object space.
    rebindObjPos: 'position',
  });

  const mesh = new THREE.Mesh(geom, material);
  mesh.name = 'tyre';

  // The shadow has to be squashed too, or the car appears to hover over a
  // perfectly round shadow while its tyres are visibly flat.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  layerVertex(depth, {
    key: 'wheels-tyre-deform-depth-v2',
    uniforms,
    declarations: DECLS,
    afterBeginVertex: `${DEFORM}\ntransformed = audiTyreDeformed;`,
  });
  mesh.customDepthMaterial = depth;

  const tri = geom.index!.count / 3;
  return {
    mesh,
    uniforms,
    triangles: tri,
    measured: {
      outerDiameter: 2 * built.maxR,
      sectionWidth: bb.max.x - bb.min.x,
      legendTriangles: legendTris,
    },
  };
}

/** Concatenate two geometries that already share an attribute set. */
function mergeIntoCarcass(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const names = ['position', 'normal', 'uv', 'aFlex', 'color'];
  for (const n of names) {
    if (!a.getAttribute(n) || !b.getAttribute(n)) return null;
  }
  const out = new THREE.BufferGeometry();
  const baseCount = a.getAttribute('position').count;

  for (const n of names) {
    const aa = a.getAttribute(n);
    const ba = b.getAttribute(n);
    const size = aa.itemSize;
    const arr = new Float32Array((aa.count + ba.count) * size);
    for (let i = 0; i < aa.count * size; i++) arr[i] = aa.array[i] as number;
    for (let i = 0; i < ba.count * size; i++) arr[aa.count * size + i] = ba.array[i] as number;
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }

  const ai = a.getIndex()!;
  const bi = b.getIndex()!;
  const idx = new Uint32Array(ai.count + bi.count);
  for (let i = 0; i < ai.count; i++) idx[i] = ai.getX(i);
  for (let i = 0; i < bi.count; i++) idx[ai.count + i] = bi.getX(i) + baseCount;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * Suspension compression to contact-patch sag. 0.5 is the static ride.
 *
 * Deliberately not linear about the static point: a tyre is a progressive
 * spring, so a corner that is unloading gives up much less radius than a
 * corner taking a kerb gains.
 */
export function deflectionFor(compression: number): number {
  const c = Math.max(0, Math.min(1, compression));
  return c < 0.5
    ? DEFLECT_MIN + (DEFLECT_STATIC - DEFLECT_MIN) * (c / 0.5)
    : DEFLECT_STATIC + (DEFLECT_MAX - DEFLECT_STATIC) * Math.pow((c - 0.5) / 0.5, 1.35);
}

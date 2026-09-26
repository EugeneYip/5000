/**
 * 185/70 HR14.
 *
 * Three things make or break a rendered tyre, and none of them is the tread:
 *
 *  1. **The sidewall is not a torus.** It leaves the bead, flares over the
 *     flange into the rim protector rib, is *concave* above it, and only then
 *     swells out to the widest point at about 68 % of section height before
 *     turning into the shoulder. A circular arc from bead to tread reads as a
 *     doughnut and no amount of shading rescues it.
 *  2. **It is flat where it meets the road.** A perfectly round tyre resting
 *     on a plane is the single most damning error in CG car work. The carcass
 *     here is cut by the ground plane in the vertex stage and the sidewall
 *     bulges in proportion, which on a 129 mm sidewall is a lot of bulge.
 *  3. **It is built oversize.** `wheelPositions()` fixes the hub at
 *     `tyreRadius()`, so the free radius is that plus the static deflection
 *     and the loaded radius comes back to the spec figure exactly.
 *
 * The deformation is done in the vertex shader rather than on the CPU so that
 * the geometry can be shared by all four corners and the flat spot can stay at
 * the bottom while the tread rotates through it.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';
import { DEFLECT_MAX, DEFLECT_MIN, DEFLECT_STATIC, RIM, TYRE } from './dims';
import { fbm3, smoothstep, type P2 } from './util';
import { buildTyreNormalMap } from './textures';
import { layerVertex, privateClone, type EnvLink } from './materials';

const PITCHES = TYRE.pitches;
/** land, land, land, slot floor, slot floor — see `ringPhases`. */
const RING_PHASES = [0.0, 0.4, 0.8, 0.86, 0.96];
const RINGS = PITCHES * RING_PHASES.length;

/** Pitch-length sequence. Real tyres vary it to spread the tread noise over a
 *  band instead of putting it all on one screaming harmonic. */
const PITCH_SEQUENCE = [1.0, 0.88, 1.12, 0.94, 1.06];

type Band = 'shoulder' | 'inner' | 'groove' | 'sidewall';

interface Lateral {
  axial: number;
  rBase: number;
  band: Band;
  flex: number;
  bulge: number;
  v: number;
  /** 0 = land, 1 = full groove depth. */
  baseDepth: number;
}

// ---------------------------------------------------------------------------
// Cross-section
// ---------------------------------------------------------------------------

/** s = axial / treadHalfWidth. Rib tops, groove walls and groove floors. */
const TREAD_S: Array<[number, Band, number]> = [
  [-1.000, 'shoulder', 0],
  [-0.930, 'shoulder', 0],
  [-0.820, 'shoulder', 0],
  [-0.700, 'shoulder', 0],
  [-0.620, 'shoulder', 0],
  [-0.570, 'groove', 1],
  [-0.480, 'groove', 1],
  [-0.430, 'inner', 0],
  [-0.340, 'inner', 0],
  [-0.200, 'inner', 0],
  [-0.075, 'inner', 0],
  [-0.028, 'groove', 0.78],
  [0.028, 'groove', 0.78],
  [0.075, 'inner', 0],
  [0.200, 'inner', 0],
  [0.340, 'inner', 0],
  [0.430, 'inner', 0],
  [0.480, 'groove', 1],
  [0.570, 'groove', 1],
  [0.620, 'shoulder', 0],
  [0.700, 'shoulder', 0],
  [0.820, 'shoulder', 0],
  [0.930, 'shoulder', 0],
  [1.000, 'shoulder', 0],
];

/** Outboard sidewall, tread edge down to where the bead tucks under the
 *  flange. Measured off a 185/70 section drawing rather than eyeballed. */
function sidewallControls(): P2[] {
  const Rt = TYRE.freeR;
  return [
    [0.0800, Rt - 0.0048],
    [0.0842, Rt - 0.0103],
    [0.0888, Rt - 0.0183],
    [0.0916, Rt - 0.0313],
    [0.0925, Rt - 0.0433],   // widest point, ~68 % of section height
    [0.0912, Rt - 0.0573],
    [0.0891, Rt - 0.0743],
    [0.0879, Rt - 0.0908],
    [0.0888, Rt - 0.1058],
    [0.0919, Rt - 0.1153],   // rim protector rib crest
    [0.0910, Rt - 0.1233],
    [0.0880, Rt - 0.1298],   // tucks in behind the flange tip
  ];
}

function buildCrossSection(): { lat: Lateral[]; vAtT: (t: number, outboard: boolean) => number } {
  const Rt = TYRE.freeR;
  const Rb = RIM.beadR;
  const sec = Rt - Rb;
  const half = TYRE.treadW / 2;

  const flexOf = (r: number): number => smoothstep(Rb + 0.014, Rb + 0.082, r);
  const bulgeOf = (r: number): number => {
    const t = Math.max(0, Math.min(1, (r - Rb) / sec));
    return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 1.1);
  };

  const lat: Lateral[] = [];

  // Inboard sidewall, bead up to the tread edge.
  const side = sidewallControls();
  const arc: number[] = [0];
  for (let i = 1; i < side.length; i++) {
    arc.push(arc[i - 1] + Math.hypot(side[i][0] - side[i - 1][0], side[i][1] - side[i - 1][1]));
  }
  const arcTotal = arc[arc.length - 1];

  for (let i = side.length - 1; i >= 0; i--) {
    const [ax, r] = side[i];
    lat.push({
      axial: -ax,
      rBase: r,
      band: 'sidewall',
      flex: flexOf(r),
      bulge: bulgeOf(r),
      v: 0.28 - 0.28 * (arc[i] / arcTotal),
      baseDepth: 0,
    });
  }

  for (const [s, band, depth] of TREAD_S) {
    const rBase = Rt - TYRE.crownDrop * s * s;
    lat.push({
      axial: s * half,
      rBase,
      band,
      flex: 1,
      bulge: bulgeOf(rBase),
      v: 0.5 + s * 0.22,
      baseDepth: depth,
    });
  }

  for (let i = 0; i < side.length; i++) {
    const [ax, r] = side[i];
    lat.push({
      axial: ax,
      rBase: r,
      band: 'sidewall',
      flex: flexOf(r),
      bulge: bulgeOf(r),
      v: 0.72 + 0.28 * (arc[i] / arcTotal),
      baseDepth: 0,
    });
  }

  // Radius -> v on the sidewall, so the texture knows where to put the legend.
  const vAtT = (t: number, outboard: boolean): number => {
    const target = Rb + t * sec;
    for (let i = 1; i < side.length; i++) {
      const r0 = side[i - 1][1];
      const r1 = side[i][1];
      if (target <= r0 && target >= r1) {
        const k = (r0 - target) / (r0 - r1 || 1e-9);
        const a = (arc[i - 1] + (arc[i] - arc[i - 1]) * k) / arcTotal;
        return outboard ? 0.72 + 0.28 * a : 0.28 - 0.28 * a;
      }
    }
    return outboard ? 0.72 : 0.28;
  };

  return { lat, vAtT };
}

// ---------------------------------------------------------------------------
// Tread pattern
// ---------------------------------------------------------------------------

interface Ring {
  angle: number;
  /** Inside a lateral shoulder slot. */
  slot: boolean;
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
      rings.push({ angle: start + span * RING_PHASES[k], slot: k >= 3 });
    }
  }
  return rings;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function buildTyreGeometry(lat: Lateral[], rings: Ring[]): THREE.BufferGeometry {
  const n = lat.length;
  const cols = rings.length;
  const count = n * (cols + 1);

  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const flex = new Float32Array(count * 2);
  const col = new Float32Array(count * 3);
  const idx: number[] = [];

  const depth = TYRE.treadDepth;

  for (let c = 0; c <= cols; c++) {
    const ring = rings[c % cols];
    const ang = c === cols ? Math.PI * 2 : ring.angle;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // Half the shoulder slots are phase-shifted to the other side of the
    // tyre, so the two shoulders do not slot in lockstep.
    const slotIn = ring.slot;
    const slotOut = rings[(c + 2) % cols].slot;

    for (let i = 0; i < n; i++) {
      const L = lat[i];
      let d = L.baseDepth;
      if (L.band === 'shoulder') {
        const cut = L.axial > 0 ? slotOut : slotIn;
        if (cut) d = Math.max(d, 1);
      }
      const r = L.rBase - d * depth;
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
      const ao = 1 - 0.55 * d;
      // Road film collects low on the sidewall and in the tread.
      const film =
        0.12 * smoothstep(0.30, 0.10, (L.rBase - RIM.beadR) / (TYRE.freeR - RIM.beadR)) +
        (fbm3(L.axial * 60, r * 30 * ca, r * 30 * sa, 2) - 0.5) * 0.10;
      const g = Math.max(0.35, Math.min(1.1, ao * (1 - film)));
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
  // The shader moves vertices well outside the rest pose; give the culler room.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), TYRE.freeR * 1.12);
  return g;
}

// ---------------------------------------------------------------------------
// Deformation
// ---------------------------------------------------------------------------

const DECLS = /* glsl */ `
uniform float uSpin;
uniform float uFreeRadius;
uniform float uDeflect;
uniform float uBulgeGain;
attribute vec2 aFlex;
vec3 audiTyreDeformed;
float audiTyreFlat;
vec2 audiTyreRot;
`;

/** Cut the carcass with the ground plane and bulge the sidewall to match. */
const DEFORM = /* glsl */ `
{
  float phi = atan(position.z, position.y);
  float r   = length(position.yz);
  float p2  = phi + uSpin;
  float cd  = -cos(p2);                       // 1 when this vertex points down
  float pen = max(0.0, uDeflect - uFreeRadius * (1.0 - cd));
  // Feather the edges of the patch. A bare chord cut is too flat for too long
  // and reads as a flat tyre rather than a loaded one.
  float shape = smoothstep(0.0, 0.45, pen / max(uDeflect, 1e-4));
  float rmax  = (uFreeRadius - uDeflect) / max(cd, 1e-3);
  float rn    = (cd > 0.0 && r > rmax) ? mix(r, rmax, aFlex.x * shape) : r;
  audiTyreFlat = (r - rn) / max(uDeflect, 1e-4);
  audiTyreRot  = vec2(cos(p2), sin(p2));
  float bulge  = aFlex.y * pen * uBulgeGain;
  audiTyreDeformed = vec3(
    position.x + sign(position.x) * bulge,
    rn * audiTyreRot.x,
    rn * audiTyreRot.y
  );
}
`;

const DEFORM_NORMAL = /* glsl */ `
{
  float cs = cos(uSpin);
  float sn = sin(uSpin);
  vec3 nRot = vec3(objectNormal.x, objectNormal.y * cs - objectNormal.z * sn, objectNormal.y * sn + objectNormal.z * cs);
  // Inside the contact patch the surface normal is the road's, not the tyre's.
  vec3 radial = normalize(vec3(0.0, audiTyreRot.x, audiTyreRot.y));
  float facing = max(0.0, dot(radial, nRot));
  objectNormal = normalize(mix(nRot, vec3(0.0, -1.0, 0.0), clamp(audiTyreFlat, 0.0, 1.0) * facing * 0.92));
}
`;

export interface TyreResult {
  mesh: THREE.Mesh;
  envLinks: EnvLink[];
  uniforms: {
    uSpin: THREE.IUniform<number>;
    uFreeRadius: THREE.IUniform<number>;
    uDeflect: THREE.IUniform<number>;
    uBulgeGain: THREE.IUniform<number>;
  };
  triangles: number;
}

export function buildTyre(ctx: BuildContext): TyreResult {
  const { lat, vAtT } = buildCrossSection();
  const geom = buildTyreGeometry(lat, ringPhases());

  const normalMap = buildTyreNormalMap({ vAtT, uRepeat: 2, sectionHeight: TYRE.freeR - RIM.beadR }, TYRE.freeR);

  const source = ctx.materials.rubber({ roughness: 0.93 });
  const material = privateClone(source);
  material.vertexColors = true;
  material.normalMap = normalMap;
  material.normalScale = new THREE.Vector2(0.9, 0.9);
  material.envMap = ctx.envMap;

  const uniforms = {
    uSpin: { value: 0 },
    uFreeRadius: { value: TYRE.freeR },
    uDeflect: { value: DEFLECT_STATIC },
    uBulgeGain: { value: 1.35 },
  };

  layerVertex(material, {
    key: 'wheels-tyre-deform-v1',
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
    key: 'wheels-tyre-deform-depth-v1',
    uniforms,
    declarations: DECLS,
    afterBeginVertex: `${DEFORM}\ntransformed = audiTyreDeformed;`,
  });
  mesh.customDepthMaterial = depth;

  const tri = geom.index!.count / 3;
  return { mesh, envLinks: [{ clone: material, source }], uniforms, triangles: tri };
}

/** Map suspension compression to tyre deflection. 0.5 is the static ride. */
export function deflectionFor(compression: number): number {
  const c = Math.max(0, Math.min(1, compression));
  return c < 0.5
    ? DEFLECT_MIN + (DEFLECT_STATIC - DEFLECT_MIN) * (c / 0.5)
    : DEFLECT_STATIC + (DEFLECT_MAX - DEFLECT_STATIC) * ((c - 0.5) / 0.5);
}

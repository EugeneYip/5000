/**
 * Distant surroundings, in the scene rather than only in the reflection.
 *
 * The IBL proxy world puts trees and facades into the car's *reflections*,
 * but a wide shot also has to have something on the horizon or the boulevard
 * reads as a salt flat. This is that something: two receding rows of plane
 * trees at boulevard spacing, a deeper row behind them, and a broken skyline.
 *
 * Kept to three draw calls with `InstancedMesh`, unlit-but-fogged materials,
 * and no shadow participation — they sit far outside the sun's shadow frustum,
 * which is fitted tight to the car on purpose.
 */

import * as THREE from 'three';
import type { EnvPreset } from './presets';

export interface BackdropHandle {
  group: THREE.Group;
  apply(preset: EnvPreset, sunDir: THREE.Vector3): void;
  dispose(): void;
}

/** Deterministic, so the boulevard is the same every run. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBackdrop(): BackdropHandle {
  const group = new THREE.Group();
  group.name = 'env:backdrop';

  const rnd = mulberry(0x5000a4d1);

  // Smooth-shaded, and eight small lobes a crown instead of five large ones.
  // Flat shading put a hard highlight on every one of an icosahedron's faces,
  // which is what made the boulevard read as rocks on sticks; the silhouette
  // was the other half of it, and more, smaller lobes fix that without paying
  // for subdivision. 36 k triangles for the whole planting, in one draw.
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 1, 8, 1, true);
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);

  const crownMat = new THREE.MeshStandardMaterial({ color: 0x283318, roughness: 0.95, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b241d, roughness: 0.95, metalness: 0 });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x8d8377, roughness: 0.88, metalness: 0 });

  // Two receding rows, Parkway spacing. No scattered middle-distance trees:
  // at the 200 mm focal lengths the profile poses use, a single tree 200 m out
  // magnifies into a readable lollipop, whereas a row reads as perspective and
  // dissolves correctly into the haze.
  // Spacing, setback and height are all jittered, and jittered by enough to
  // matter. The row used to run `z = -210 + i * 16` with a ±2.6 m height
  // spread on a ±5 m setback, which is a picket fence: identical objects,
  // identical pitch, identical size, and the eye locks on to the rhythm
  // instantly and calls it computer graphics. A real planting was put in over
  // fifty years, has lost trees to storms and gained replacements, and no two
  // of its gaps are the same. ±45 % on the pitch and a 2:1 height range is
  // what it takes before the row stops counting itself.
  const trees: Array<{ x: number; z: number; h: number; r: number; lean: number }> = [];
  const plant = (
    side: number, z: number, xBase: number, xJit: number,
    hLo: number, hHi: number, rLo: number, rHi: number,
  ): void => {
    // A gap every so often: a felled tree, a driveway, a bus stop.
    if (rnd() < 0.14) return;
    const h = hLo + rnd() * (hHi - hLo);
    trees.push({
      x: side * (xBase + rnd() * xJit),
      z,
      h,
      // Crown size follows height, as a tree's does, rather than rolling free.
      r: (rLo + rnd() * (rHi - rLo)) * (0.72 + 0.38 * (h - hLo) / Math.max(hHi - hLo, 1e-3)),
      lean: (rnd() - 0.5) * 0.16,
    });
  };
  for (let side = -1; side <= 1; side += 2) {
    let z = -210 + (side > 0 ? 8 : 0);
    while (z < 210) {
      // The 46 m around the car is left clear. Trees closer than that loom
      // over a 62 mm three-quarter and read as scenery, not surroundings —
      // and in the photomatch pose the nearest of them used to fill a quarter
      // of the sky behind the roof.
      if (z < -46 || z > 50) plant(side, z, 31, 6.5, 5.4, 10.6, 3.4, 5.4);
      z += 11 + rnd() * 10;
    }
  }
  // A second, deeper row offset from the first, so the line reads as a planting
  // with depth rather than as a single row of cut-outs.
  for (let side = -1; side <= 1; side += 2) {
    let z = -200 + (side > 0 ? 17 : 0);
    while (z < 200) {
      if (z < -60 || z > 64) plant(side, z, 44, 9, 6.2, 11.8, 3.8, 6.2);
      z += 24 + rnd() * 22;
    }
  }

  const BLOBS = 8;
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length * BLOBS);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  const leanAxis = new THREE.Vector3(0, 0, 1);
  const spin = new THREE.Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    pos.set(t.x, t.h * 0.45, t.z);
    scl.set(1, t.h * 0.9, 1);
    // A plane tree does not grow plumb. Sixteen milliradians of lean, signed
    // per tree, is all it takes to break the row of parallel verticals that
    // reads as a row of posts.
    q.setFromAxisAngle(leanAxis, t.lean);
    trunks.setMatrixAt(i, m.compose(pos, q, scl));
    const tilt = Math.tan(t.lean) * t.h;
    for (let b = 0; b < BLOBS; b++) {
      const k = rnd();
      pos.set(
        t.x - tilt + (rnd() - 0.5) * t.r * 1.9,
        t.h + (rnd() - 0.4) * t.r * 1.05,
        t.z + (rnd() - 0.5) * t.r * 1.75,
      );
      q.setFromAxisAngle(spin, rnd() * 3);
      // Smaller lobes, more of them: a crown is a cloud of leaf clusters, and
      // the ragged edge that gives is most of what says "tree" at 200 m.
      const rr = t.r * (0.46 + k * 0.34);
      scl.set(rr, rr * 0.78, rr * 0.96);
      crowns.setMatrixAt(i * BLOBS + b, m.compose(pos, q, scl));
    }
  });
  crowns.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;

  // A skyline, not six slabs. These sit well past the point where the
  // exponential fog has taken them — they exist to give the horizon an edge,
  // not to be looked at. Each was a single box hundreds of metres
  // long, and fully veiled by fog each came back as one flat evenly lit
  // rectangle standing against the sky: a card, not a city. Broken into masses
  // of varied height and setback they keep a broken roofline, which is the
  // only thing that still reads once the haze has taken everything else.
  const blocks: Array<[number, number, number, number, number, number]> = [];
  const runs: Array<[number, number, number, number, number, number]> = [
    // x, z, along-z span, count, base height, spread
    [-360, -180, 200, 6, 16, 22],
    [400, -60, 220, 6, 18, 26],
    [-100, 580, 240, 7, 15, 18],
    [480, 260, 100, 4, 24, 30],
    [-530, 200, 110, 4, 19, 24],
    [160, -620, 260, 7, 13, 16],
  ];
  for (const [x, z, span, count, base, spread] of runs) {
    const alongZ = span > 150;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const h = base + rnd() * spread;
      const w = 34 + rnd() * 30;
      const d = 40 + rnd() * 40;
      blocks.push(
        alongZ
          ? [x + (rnd() - 0.5) * 60, h / 2, z + t * span, w, h, d]
          : [x + t * span, h / 2, z + (rnd() - 0.5) * 60, d, h, w],
      );
    }
  }
  const blockMesh = new THREE.InstancedMesh(blockGeo, blockMat, blocks.length);
  blocks.forEach(([x, y, z, sx, sy, sz], i) => {
    blockMesh.setMatrixAt(i, m.compose(pos.set(x, y, z), q.identity(), scl.set(sx, sy, sz)));
  });
  blockMesh.instanceMatrix.needsUpdate = true;

  for (const mesh of [crowns, trunks, blockMesh]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  return {
    group,
    apply(preset) {
      group.visible = preset.ground !== 'studio';
      // Distant foliage in low sun goes almost black against the sky; at noon
      // it is merely dark. Tying it to elevation keeps the silhouette honest.
      const lift = 0.3 + Math.max(preset.sunDir[1], 0) * 0.45;
      crownMat.color.setHex(0x2a3a1c).multiplyScalar(lift);
      trunkMat.color.setHex(0x2b241d).multiplyScalar(lift);
      blockMat.color.setHex(0x7d766c).multiplyScalar(0.4 + lift * 0.4);
    },
    dispose() {
      crownGeo.dispose();
      trunkGeo.dispose();
      blockGeo.dispose();
      crownMat.dispose();
      trunkMat.dispose();
      blockMat.dispose();
    },
  };
}

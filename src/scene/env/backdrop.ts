/**
 * Distant surroundings, in the scene rather than only in the reflection.
 *
 * The IBL proxy world puts trees and facades into the car's *reflections*,
 * but a wide shot also has to have something on the horizon or the boulevard
 * reads as a salt flat. This is that something: two rows of plane trees at
 * boulevard spacing, a further mass behind them, and a few blocks of building.
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

  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6, 1, true);
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);

  const crownMat = new THREE.MeshStandardMaterial({ color: 0x283318, roughness: 0.95, metalness: 0, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2b241d, roughness: 0.95, metalness: 0 });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x8d8377, roughness: 0.88, metalness: 0 });

  // Two receding rows, Parkway spacing. No scattered middle-distance trees:
  // at the 200 mm focal lengths the profile poses use, a single tree 200 m out
  // magnifies into a readable lollipop, whereas a row reads as perspective and
  // dissolves correctly into the haze.
  const trees: Array<{ x: number; z: number; h: number; r: number }> = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 26; i++) {
      // The 30 m around the car is left clear. Trees that close would loom
      // over a 62 mm three-quarter and read as scenery, not surroundings.
      const z = -210 + i * 16 + (side > 0 ? 8 : 0);
      if (z > -30 && z < 36) continue;
      trees.push({ x: side * (27 + rnd() * 4), z, h: 6.6 + rnd() * 2.6, r: 3.8 + rnd() * 1.4 });
    }
  }

  const BLOBS = 5;
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length * BLOBS);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  trees.forEach((t, i) => {
    pos.set(t.x, t.h * 0.45, t.z);
    scl.set(1, t.h * 0.9, 1);
    trunks.setMatrixAt(i, m.compose(pos, q.identity(), scl));
    for (let b = 0; b < BLOBS; b++) {
      const k = rnd();
      pos.set(
        t.x + (rnd() - 0.5) * t.r * 1.5,
        t.h + (rnd() - 0.35) * t.r * 0.8,
        t.z + (rnd() - 0.5) * t.r * 1.4,
      );
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 3);
      const rr = t.r * (0.66 + k * 0.4);
      scl.set(rr, rr * 0.74, rr * 0.94);
      crowns.setMatrixAt(i * BLOBS + b, m.compose(pos, q, scl));
    }
  });
  crowns.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;

  // Well past the point where the exponential fog has taken them: they exist
  // to give the horizon a silhouette, not to be looked at. A 200 mm profile
  // shot magnifies anything inside ~200 m into a featureless slab.
  const blocks: Array<[number, number, number, number, number, number]> = [
    [-340, 16, -180, 44, 32, 190],
    [390, 18, -60, 48, 36, 210],
    [-90, 15, 560, 210, 30, 40],
    [470, 24, 260, 60, 48, 80],
    [-520, 19, 200, 70, 38, 90],
    [150, 13, -600, 260, 26, 44],
  ];
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

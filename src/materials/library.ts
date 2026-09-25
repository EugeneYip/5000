/**
 * Material library — placeholder. Owned by the materials work stream.
 * Must implement every member of MaterialLibrary in src/types.ts, with a real
 * flake+clearcoat paint shader as the centrepiece.
 */
import * as THREE from 'three';
import { PAINT, TRIM_COLORS } from '@/spec';
import type { MaterialLibrary } from '@/types';

export function createMaterialLibrary(_renderer: THREE.WebGLRenderer): MaterialLibrary {
  let env: THREE.Texture | null = null;
  const all: THREE.Material[] = [];
  const keep = <T extends THREE.Material>(m: T): T => { all.push(m); return m; };

  const paintMat = keep(new THREE.MeshPhysicalMaterial({
    color: PAINT.baseColor, metalness: PAINT.metalness, roughness: PAINT.roughness,
    clearcoat: PAINT.clearcoat, clearcoatRoughness: PAINT.clearcoatRoughness,
  }));

  return {
    paint: () => paintMat,
    glass: (o) => keep(new THREE.MeshPhysicalMaterial({ color: o?.tint ?? TRIM_COLORS.glassTint, metalness: 0, roughness: 0.03, transmission: 0.92, thickness: 0.006, transparent: true, opacity: o?.opacity ?? 1 })),
    chrome: (o) => keep(new THREE.MeshPhysicalMaterial({ color: TRIM_COLORS.chrome, metalness: 1, roughness: o?.roughness ?? 0.06 })),
    blackTrim: () => keep(new THREE.MeshPhysicalMaterial({ color: TRIM_COLORS.blackTrim, metalness: 0.1, roughness: 0.5 })),
    bumperPlastic: () => keep(new THREE.MeshPhysicalMaterial({ color: TRIM_COLORS.bumperPlastic, metalness: 0, roughness: 0.72 })),
    rubber: (o) => keep(new THREE.MeshPhysicalMaterial({ color: TRIM_COLORS.rubber, metalness: 0, roughness: o?.roughness ?? 0.88 })),
    lens: (c, o) => keep(new THREE.MeshPhysicalMaterial({ color: c, metalness: 0, roughness: 0.08, transmission: 0.7, transparent: true, opacity: o?.opacity ?? 1 })),
    reflector: () => keep(new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.08 })),
    emissive: (c, i) => keep(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i })),
    interiorPlastic: (o) => keep(new THREE.MeshPhysicalMaterial({ color: o?.color ?? TRIM_COLORS.interiorPlastic, metalness: 0, roughness: o?.roughness ?? 0.78 })),
    fabric: (o) => keep(new THREE.MeshPhysicalMaterial({ color: o?.color ?? TRIM_COLORS.interiorFabric, metalness: 0, roughness: 0.95 })),
    carpet: () => keep(new THREE.MeshPhysicalMaterial({ color: TRIM_COLORS.carpet, metalness: 0, roughness: 1 })),
    alloy: (o) => keep(new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: o?.polished ? 0.12 : 0.34 })),
    brakeDisc: () => keep(new THREE.MeshPhysicalMaterial({ color: 0x55585c, metalness: 1, roughness: 0.45 })),
    update: () => {},
    setEnvMap: (e) => {
      env = e;
      for (const m of all) {
        const mm = m as THREE.MeshPhysicalMaterial;
        if ('envMap' in mm) { mm.envMap = env; mm.needsUpdate = true; }
      }
    },
    setPaintColor: (hex) => { paintMat.color.setHex(hex); },
  };
}

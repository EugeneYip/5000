/**
 * Environment — placeholder. Owned by the environment/lighting work stream.
 * Must provide sky, IBL, key/fill lights, ground and the named presets.
 */
import * as THREE from 'three';

export interface EnvironmentHandle {
  envMap: THREE.Texture | null;
  setPreset(name: string): void;
  update(dt: number, elapsed: number): void;
  /** Sun direction, for post effects that need it (god rays, flare). */
  sunDirection: THREE.Vector3;
}

export async function buildEnvironment(
  scene: THREE.Scene,
  _renderer: THREE.WebGLRenderer,
  opts?: { onProgress?: (f: number) => void },
): Promise<EnvironmentHandle> {
  opts?.onProgress?.(1);
  scene.background = new THREE.Color(0x11151a);
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x40352a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(-6, 7, 5);
  sun.castShadow = true;
  scene.add(sun);
  return {
    envMap: null,
    setPreset: () => {},
    update: () => {},
    sunDirection: sun.position.clone().normalize(),
  };
}

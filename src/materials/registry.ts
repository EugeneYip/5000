/**
 * Shared bookkeeping: caching, env-map propagation and the animation clock.
 *
 * Callers expect `materials.paint()` to hand back *the same* instance every
 * time — the body work stream will call it once per panel and three must see
 * one material so the panels batch into one draw call and share one program.
 */

import * as THREE from 'three';

type Reflective = THREE.Material & { envMap?: THREE.Texture | null; envMapIntensity?: number };

export class MaterialRegistry {
  private readonly cache = new Map<string, THREE.Material>();
  private readonly reflective: Array<{ mat: Reflective; intensity: number }> = [];
  private readonly clocks: THREE.IUniform[] = [];

  envMap: THREE.Texture | null = null;

  /** Memoise by key. The factory runs at most once. */
  make<T extends THREE.Material>(key: string, factory: () => T): T {
    const hit = this.cache.get(key);
    if (hit) return hit as T;
    const m = factory();
    m.name = key;
    this.cache.set(key, m);
    return m;
  }

  /** Opt this material into `setEnvMap()`. `intensity` scales the IBL for it. */
  reflects<T extends THREE.Material>(mat: T, intensity = 1): T {
    const r = mat as Reflective;
    r.envMap = this.envMap;
    r.envMapIntensity = intensity;
    this.reflective.push({ mat: r, intensity });
    return mat;
  }

  /** Opt a uniform into `update()`; it receives elapsed seconds. */
  animates(u: THREE.IUniform): THREE.IUniform {
    this.clocks.push(u);
    return u;
  }

  setEnvMap(env: THREE.Texture | null): void {
    if (env === this.envMap) return;
    // Gaining or losing an env map flips the USE_ENVMAP define, so the program
    // genuinely has to be rebuilt — but only then.
    const structural = (this.envMap === null) !== (env === null);
    this.envMap = env;
    for (const r of this.reflective) {
      r.mat.envMap = env;
      r.mat.envMapIntensity = r.intensity;
      if (structural) r.mat.needsUpdate = true;
    }
  }

  update(_dt: number, elapsed: number): void {
    for (const u of this.clocks) u.value = elapsed;
  }

  all(): THREE.Material[] {
    return [...this.cache.values()];
  }
}

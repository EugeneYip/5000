/**
 * Materials for the wheel corner.
 *
 * Almost everything comes from the shared library: `alloy()` already knows
 * about the cast/machined split and the grime in the casting grain, and
 * `brakeDisc()` already knows about the swept band. Two things it cannot
 * provide are added here:
 *
 *  - a **layered vertex patch**, so the tyre can be deformed in the vertex
 *    stage without discarding the library's rubber shading;
 *  - **rusty cast iron** for the hat, vanes, caliper, shield and pad backing
 *    plates. The library has no entry for it, and the rust/bright contrast is
 *    the single strongest cue that the brake behind the spokes is a real part.
 *    If `MaterialLibrary` ever grows a `castIron()`, this should move there.
 */

import * as THREE from 'three';
import type { BuildContext } from '@/types';

type Phys = THREE.MeshPhysicalMaterial;

/**
 * Clone a library material so it can be modified without touching the shared
 * instance — the shared one is also on the weatherstrips and the other
 * streams' parts, so a tyre cannot simply patch it.
 *
 * `Material.copy()` does **not** carry `onBeforeCompile` or
 * `customProgramCacheKey`: three copies a fixed list of properties and those
 * two are not on it. A plain `clone()` therefore silently drops the entire
 * library shader — the cast/machined split on the alloy, and every bit of
 * `createRubber`: the road film, the micro-grain and the mould gloss that is
 * supposed to make the sidewall lettering shine. That is why the tyre rendered
 * as featureless black. Carrying both hooks across is what makes this a clone
 * of the library material rather than a fork of it.
 *
 * The clone does lose registry membership, so its IBL has to be kept in step
 * by hand — see `syncEnvMaps`.
 */
export function privateClone(src: THREE.Material): Phys {
  const m = src.clone() as Phys;
  m.onBeforeCompile = src.onBeforeCompile;
  m.customProgramCacheKey = src.customProgramCacheKey;
  return m;
}

export interface EnvLink {
  clone: THREE.Material;
  source: THREE.Material;
}

/** Push the library's current IBL into every private clone. Cheap enough to
 *  run every frame, and it means an environment preset change is not missed. */
export function syncEnvMaps(links: readonly EnvLink[]): void {
  for (const { clone, source } of links) {
    const c = clone as Phys;
    const s = source as Phys;
    if (c.envMap !== s.envMap) {
      c.envMap = s.envMap;
      c.envMapIntensity = s.envMapIntensity;
      c.needsUpdate = true;
    }
  }
}

export interface VertexLayer {
  /** Appended to the material's existing program cache key. */
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  /** Injected immediately after `#include <beginnormal_vertex>`. */
  afterBeginNormal?: string;
  /** Injected immediately after `#include <begin_vertex>`. */
  afterBeginVertex?: string;
  /** Injected once, after `#include <common>` in the vertex stage. */
  declarations?: string;
  /** Rebind the library's object-space varying to the *rest* position, so a
   *  procedural grain stays locked to the rubber instead of swimming through
   *  it as the tyre turns. Pass the GLSL expression to bind. */
  rebindObjPos?: string;
  /**
   * Retune uniforms the *library* installed, after its own hook has run.
   *
   * `extend()` assigns the same `IUniform` objects into every shader compiled
   * from a material, so the callback must **replace** an entry rather than
   * mutate the value it finds — mutating would reach every other part wearing
   * the same library material.
   */
  tuneUniforms?(uniforms: Record<string, THREE.IUniform>): void;
}

/**
 * Layer a vertex-stage patch on top of whatever the material already does.
 * The library's own `onBeforeCompile` runs first and is left intact.
 */
export function layerVertex<T extends THREE.Material>(material: T, layer: VertexLayer): T {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;

  material.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer);
    Object.assign(shader.uniforms, layer.uniforms);
    layer.tuneUniforms?.(shader.uniforms);

    let v = shader.vertexShader;
    if (layer.declarations) {
      v = v.replace('#include <common>', `#include <common>\n${layer.declarations}`);
    }
    if (layer.afterBeginNormal) {
      v = v.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${layer.afterBeginNormal}`);
    }
    if (layer.afterBeginVertex) {
      v = v.replace('#include <begin_vertex>', `#include <begin_vertex>\n${layer.afterBeginVertex}`);
    }
    if (layer.rebindObjPos) {
      // Only if the library actually publishes that varying — a no-op replace
      // if it has since changed how it does object-space shading.
      v = v.replace('vAudiObjPos = transformed;', `vAudiObjPos = ${layer.rebindObjPos};`);
    }
    shader.vertexShader = v;

    // Hold the live shader so per-mesh uniform pushes can find it.
    material.userData.shader = shader;
  };

  material.customProgramCacheKey = function () {
    return `${prevKey ? prevKey.call(this) : ''}|${layer.key}`;
  };
  return material;
}

/**
 * Grey cast iron, oxidised. Used for the disc hat and vanes, the caliper, the
 * pad backing plates and the dust shield — every brake part the pads never
 * touch, which on any car driven in the last month is orange-brown.
 */
export function createRustyIron(
  ctx: BuildContext,
  opts: { color?: number; roughness?: number; metalness?: number } = {},
): Phys {
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0x6d4c33,
    // Oxide is not a metal. Leaving metalness high here is the classic mistake
    // that makes a rusty part read as painted brown chrome.
    metalness: opts.metalness ?? 0.18,
    roughness: opts.roughness ?? 0.86,
    envMapIntensity: 0.55,
    vertexColors: true,
    dithering: true,
  });
  m.envMap = ctx.envMap;
  return m;
}

/** Painted / phosphated caliper casting — darker and less oxidised. */
export function createCaliperIron(ctx: BuildContext): Phys {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x4a4540,
    metalness: 0.35,
    roughness: 0.74,
    envMapIntensity: 0.6,
    vertexColors: true,
    dithering: true,
  });
  m.envMap = ctx.envMap;
  return m;
}

/** Friction material: a dark, dusty, entirely non-metallic ceramic. */
export function createPadFriction(ctx: BuildContext): Phys {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x2e2a28,
    metalness: 0,
    roughness: 0.95,
    envMapIntensity: 0.3,
  });
  m.envMap = ctx.envMap;
  return m;
}

/**
 * The one thing the wheel corner still builds for itself: a vertex-stage patch.
 *
 * Every *finish* in the corner now comes from the shared library —
 * `alloy()` for the rim and the kerb rash, `rubber()` for the tyre, the valve
 * and the brake hose, `brakeDisc()` for the swept faces, and
 * `castIron()` / `caliperPaint()` / `padFriction()` for the brake parts this
 * file used to mint locally. A locally constructed `MeshPhysicalMaterial` is
 * not in the registry, so `setEnvMap` never reaches it and it holds whatever
 * IBL happened to be current when the car was built; with the environment
 * being rebuilt underneath us that is a guaranteed mismatch.
 *
 * `privateClone`/`syncEnvMaps` are gone with them. They existed to add
 * `vertexColors` and to reach into `createRubber`'s uniforms by name; both are
 * library options now (`alloy({ vertexColors })`, `rubber({ dust, dustCells,
 * mouldGloss, mouldCurve })`), so the corner takes the shared instance and
 * tracks the environment for free.
 */

import * as THREE from 'three';

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
}

/**
 * Layer a vertex-stage patch on top of whatever the material already does.
 * The library's own `onBeforeCompile` runs first and is left intact.
 *
 * This **mutates a shared instance**, so it may only be used on one the caller
 * has exclusive title to. The tyre does: `rubber()` is memoised on its full
 * option set, and the tyre's set — a 320 cells/m road film at a 0.10 coverage,
 * a 60 1/m mould threshold and vertex colours — is one no other part of the
 * car asks for. Anything less specific must not be layered.
 */
export function layerVertex<T extends THREE.Material>(material: T, layer: VertexLayer): T {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;

  material.onBeforeCompile = function (shader, renderer) {
    prev?.call(this, shader, renderer);
    Object.assign(shader.uniforms, layer.uniforms);

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
 * Push every vertex out along its own normal.
 *
 * For a surface that lies *on* another one — the kerb scuff on the rim lip —
 * this is what stops it z-fighting. The alternative, `polygonOffset`, is a
 * material property, so using it forces a private material for the one mesh
 * that needs it; a third of a millimetre of real standoff costs nothing and
 * lets the part wear the shared alloy.
 */
export function liftAlongNormals(g: THREE.BufferGeometry, by: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  if (!nrm) return g;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + nrm.getX(i) * by,
      pos.getY(i) + nrm.getY(i) * by,
      pos.getZ(i) + nrm.getZ(i) * by,
    );
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

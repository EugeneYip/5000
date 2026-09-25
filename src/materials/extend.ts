/**
 * `onBeforeCompile` plumbing.
 *
 * Every material in this library is a stock three.js material with GLSL spliced
 * into it. Going through `MeshPhysicalMaterial` rather than a bare
 * `ShaderMaterial` is a deliberate choice: it buys correct IBL, the full punch
 * list of light types, shadows, clearcoat, transmission, fog and tone mapping
 * for free, and it keeps the materials working when the environment work stream
 * changes what it hands us.
 */

import * as THREE from 'three';

export interface Patch {
  /** Literal chunk include or GLSL substring to look for. */
  find: string;
  /** What to put there. Use `$&` to keep the original text. */
  replace: string;
  /** Replace every occurrence rather than the first. */
  all?: boolean;
  /** Throw if the needle is missing. Default true — a silent no-op is worse. */
  required?: boolean;
}

export interface Extension {
  /**
   * Unique per *kind* of material. three's default program cache key is the
   * source text of `onBeforeCompile`, which is identical for every material
   * built through this module — without an explicit key they would all share
   * one compiled program and silently wear each other's shaders.
   */
  key: string;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number>;
  vertex?: Patch[];
  fragment?: Patch[];
  /**
   * Chunks to inline *before* patching, by name.
   *
   * `onBeforeCompile` runs before three resolves `#include`s, so a patch aimed
   * at a line that lives inside a chunk — `RE_Direct(…)` in
   * `lights_fragment_begin`, say — finds nothing and throws. Naming the chunk
   * here splices its source in first so those needles exist. Any `#include`
   * nested inside the chunk is left alone for three to resolve as usual.
   */
  expandChunks?: string[];
}

function expandChunks(src: string, names: string[] | undefined, key: string): string {
  if (!names) return src;
  let out = src;
  for (const n of names) {
    const chunk = (THREE.ShaderChunk as Record<string, string>)[n];
    if (chunk === undefined) throw new Error(`[materials/${key}] unknown shader chunk: ${n}`);
    out = out.split(`#include <${n}>`).join(chunk);
  }
  return out;
}

function splice(src: string, patches: Patch[] | undefined, where: string, key: string): string {
  if (!patches) return src;
  let out = src;
  for (const p of patches) {
    if (!out.includes(p.find)) {
      if (p.required !== false) {
        throw new Error(`[materials/${key}] ${where} patch target not found: ${JSON.stringify(p.find.slice(0, 60))}`);
      }
      continue;
    }
    if (p.all) out = out.split(p.find).join(p.replace.replace(/\$&/g, p.find));
    else out = out.replace(p.find, () => p.replace.replace(/\$&/g, p.find));
  }
  return out;
}

export function extend<T extends THREE.Material>(material: T, ext: Extension): T {
  material.onBeforeCompile = (shader) => {
    if (ext.uniforms) Object.assign(shader.uniforms, ext.uniforms);
    shader.vertexShader = splice(shader.vertexShader, ext.vertex, 'vertex', ext.key);
    shader.fragmentShader = splice(
      expandChunks(shader.fragmentShader, ext.expandChunks, ext.key),
      ext.fragment,
      'fragment',
      ext.key,
    );
  };
  material.customProgramCacheKey = () => ext.key;
  if (ext.defines) {
    const m = material as THREE.Material & { defines?: Record<string, unknown> };
    m.defines = { ...(m.defines ?? {}), ...ext.defines };
  }
  return material;
}

/**
 * Varyings carrying the object-space position and normal.
 *
 * Object space, not UV space: a procedural feature keyed off `vAudiObjPos` is a
 * fixed size in metres everywhere on the car, including on lofted panels whose
 * UVs stretch by 3:1 between the sill and the roof.
 */
export const OBJECT_SPACE_VARYINGS: { vertex: Patch[]; fragmentDecl: string } = {
  vertex: [
    {
      find: '#include <common>',
      replace: '$&\nvarying vec3 vAudiObjPos;\nvarying vec3 vAudiObjNormal;',
    },
    {
      find: '#include <begin_vertex>',
      replace: '$&\nvAudiObjPos = transformed;\nvAudiObjNormal = objectNormal;',
    },
  ],
  fragmentDecl: 'varying vec3 vAudiObjPos;\nvarying vec3 vAudiObjNormal;\n',
};

/** Convenience: sRGB hex → a linear-space `THREE.Color` uniform value. */
export function linearColor(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

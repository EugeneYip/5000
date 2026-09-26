/**
 * The material library.
 *
 * Every surface on the car comes from here, and every call is memoised: the
 * body stream asks for `paint()` once per panel and must get *one* instance
 * back, or the panels stop batching and the car costs a draw call per panel.
 * The same is true of the trim, the glass and the wheel alloy.
 *
 * Nothing in this file does any shading itself. It owns four jobs only:
 *
 *  - **identity** — one material per distinct set of options, via the registry;
 *  - **quantisation** — deciding which option sets are *the same* set (below);
 *  - **environment** — pushing the IBL into everything that reflects, with the
 *    per-material intensity each one was authored with;
 *  - **time** — driving whatever uniforms have asked to be animated.
 *
 * The shading lives in `paint.ts`, `glass.ts`, `metals.ts`, `trim.ts`,
 * `lamp.ts`, `interior.ts` and `printed.ts`.
 *
 * ## Why the option keys are quantised
 *
 * The registry memoises on the option key, so two callers a hundredth of a
 * roughness apart silently get two materials, two programs, and two meshes
 * that can never be merged into one draw. Counted in the built scene that was
 * costing twelve chrome instances spanning an *effective* roughness of 0.123
 * to 0.168 — a spread no one can see — and three separate near-black cabin
 * plastics whose colours differed by one part in 255.
 *
 * So identity is decided on a ladder rather than on the exact number. The
 * rungs are placed at the clusters the call sites actually form, never within
 * 0.02 of a call site, and the worst shift any part takes is quoted against
 * each ladder. Colours snap to an already-issued colour only when every
 * channel is within `COLOR_TOLERANCE`, which at 2/255 is below the dither
 * noise the materials already add.
 *
 * This does **not** reduce draw calls on its own — three draws one call per
 * mesh whether or not two meshes share a material. What it does is make the
 * merge *possible*: geometry that wants to batch across modules can only do so
 * once the modules are handed the same instance.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import type { MaterialLibrary } from '@/types';
import { MaterialRegistry } from './registry';
import { createPaint } from './paint';
import { createGlass } from './glass';
import { createChrome, createAlloy, createBrakeDisc, createReflector, createDirtyMetal, type DirtyMetalOptions } from './metals';
import { createBlackTrim, createBumperPlastic, createRubber } from './trim';
import { createLens, createEmissive } from './lamp';
import { createInteriorPlastic, createFabric, createCarpet } from './interior';
import { createPrinted, type PrintedOptions } from './printed';

type Reflective = THREE.Material & { envMapIntensity?: number };

/**
 * The library as this module actually builds it.
 *
 * `MaterialLibrary` in `src/types.ts` is the contract every part builder is
 * handed and this stream does not own that file, so the two entries added
 * here — `printed` and `dirtyMetal` — are declared as an extension. A caller
 * reaches them with `audiMaterials(ctx.materials).printed(map)`. They should
 * move onto `MaterialLibrary` itself the next time `src/types.ts` is open;
 * see the stream report.
 */
export interface AudiMaterialLibrary extends MaterialLibrary {
  /**
   * A surface carrying drawn artwork: a plate, a sticker, a dial face, a
   * switch legend. Keyed on the map's own identity, so two callers sharing a
   * texture share a material and batch, and a caller with its own canvas
   * cannot repaint anyone else's.
   */
  printed(map: THREE.Texture, opts?: PrintedOptions): THREE.Material;
  /**
   * Castings, heat shields, oxidised iron — every metal part under the floor
   * line or behind a wheel. `alloy()` is authored near-white and fully
   * metallic for the wheels and blazes down here; this is the entry to use
   * instead of forking one locally.
   */
  dirtyMetal(opts?: DirtyMetalOptions): THREE.Material;
}

/** Widen the contract to what this module really returns. */
export function audiMaterials(m: MaterialLibrary): AudiMaterialLibrary {
  return m as AudiMaterialLibrary;
}

// ---------------------------------------------------------------------------
// Option-key quantisation
// ---------------------------------------------------------------------------

/**
 * Brightwork. `createChrome` folds roughness into a brush amount, so what the
 * eye sees is `lerp(r, 0.09, clamp((r - 0.07) / 0.35))`: the twelve call sites
 * spanned 0.012–0.38 but only 0.012–0.168 of *effective* roughness. Worst
 * shift on any part is 0.039 (an interior sill plate of 224 triangles); every
 * exterior part moves by less than 0.016.
 */
const CHROME_RUNGS = [0.016, 0.05, 0.18, 0.3] as const;

/**
 * Seals, tyres, hoses. Worst shift 0.02, at roughnesses where the specular
 * lobe is already almost flat.
 */
const RUBBER_RUNGS = [0.7, 0.8, 0.88, 0.94] as const;

/**
 * Cabin plastics. Worst shift 0.06 — which sounds large until you note that
 * `createInteriorPlastic` already perturbs roughness per pixel by up to +0.14
 * from its own grain and dust, so the ladder step is well inside the variation
 * the material was authored with.
 */
const CABIN_RUNGS = [0.4, 0.56, 0.67, 0.8, 0.93] as const;

/** Under-floor castings and shields; nothing down there is smooth. */
const DIRT_RUNGS = [0.62, 0.74, 0.86, 0.95] as const;

/** Oxide/phosphate/aluminium — three bands is all this ever needs. */
const METALNESS_RUNGS = [0.05, 0.2, 0.35] as const;

/** Printed finishes: semi-gloss paint, satin, matte instrument print. */
const PRINT_RUNGS = [0.34, 0.48, 0.62] as const;

/** Per channel, out of 255. Below the dither these materials already apply. */
const COLOR_TOLERANCE = 2;

function nearest(value: number, rungs: readonly number[]): number {
  let best = rungs[0];
  let bd = Infinity;
  for (const r of rungs) {
    const d = Math.abs(value - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

export function createMaterialLibrary(_renderer: THREE.WebGLRenderer): AudiMaterialLibrary {
  const registry = new MaterialRegistry();
  const paint = createPaint();

  /**
   * Cache, then opt into env-map propagation at whatever intensity the
   * material was authored with — a reflector wants more IBL than a tyre.
   */
  function shared<T extends Reflective>(key: string, factory: () => T): T {
    return registry.make(key, () => {
      const m = factory();
      registry.reflects(m, m.envMapIntensity ?? 1);
      return m;
    });
  }

  const hex = (n: number): string => n.toString(16).padStart(6, '0');

  /**
   * Fold a colour onto one already in use when every channel is within
   * `COLOR_TOLERANCE`.
   *
   * Two streams reaching independently for "near-black cabin plastic" wrote
   * `0x131417`, `0x141517` and `0x141518` — three materials for one colour.
   * First caller wins, so the result depends on build order, but every
   * candidate is within two parts in 255 of every other, which is why it does
   * not matter which. Deliberately *not* a fixed grid: a grid puts a boundary
   * somewhere, and two colours either side of it stay split, which is the
   * problem this is here to solve.
   */
  const issued: number[] = [];
  function snapColor(value: number): number {
    for (const c of issued) {
      if (Math.abs(((c >> 16) & 255) - ((value >> 16) & 255)) <= COLOR_TOLERANCE
        && Math.abs(((c >> 8) & 255) - ((value >> 8) & 255)) <= COLOR_TOLERANCE
        && Math.abs((c & 255) - (value & 255)) <= COLOR_TOLERANCE) return c;
    }
    issued.push(value);
    return value;
  }

  const lib: AudiMaterialLibrary = {
    paint: () => shared('paint', () => paint.material),

    glass: (o) =>
      shared(
        `glass:${hex(o?.tint ?? TRIM_COLORS.glassTint)}:${o?.opacity ?? 1}:${o?.interiorSide ? 'in' : 'out'}`,
        () => createGlass(o),
      ),

    chrome: (o) => {
      const r = nearest(o?.roughness ?? 0.045, CHROME_RUNGS);
      return shared(`chrome:${r.toFixed(3)}`, () => createChrome({ ...o, roughness: r }));
    },

    blackTrim: () => shared('blackTrim', () => createBlackTrim()),

    bumperPlastic: () => shared('bumperPlastic', () => createBumperPlastic()),

    rubber: (o) => {
      const r = nearest(o?.roughness ?? 0.92, RUBBER_RUNGS);
      const vc = (o as { vertexColors?: boolean } | undefined)?.vertexColors ?? false;
      return shared(`rubber:${r.toFixed(2)}${vc ? ':vc' : ''}`, () => createRubber({ roughness: r, vertexColors: vc }));
    },

    // The lens and the glass are the two surfaces the review singled out as
    // correct, so neither is quantised: their options are few, deliberate and
    // come straight from `spec.ts`.
    lens: (color, o) =>
      shared(`lens:${hex(color)}:${o?.prismatic ? 'prism' : 'smooth'}:${o?.opacity ?? 1}`, () => createLens(color, o)),

    reflector: () => shared('reflector', () => createReflector()),

    // Keyed on a rounded intensity so a caller that ramps a lamp up and down
    // cannot fill the cache with near-duplicate materials. Anything animating
    // faster than that should hold one material and drive `emissiveIntensity`.
    emissive: (color, intensity) =>
      shared(`emissive:${hex(color)}:${intensity.toFixed(2)}`, () => createEmissive(color, intensity)),

    interiorPlastic: (o) => {
      const c = snapColor(o?.color ?? TRIM_COLORS.interiorPlastic);
      const r = nearest(o?.roughness ?? 0.7, CABIN_RUNGS);
      return shared(`interiorPlastic:${hex(c)}:${r.toFixed(2)}`, () => createInteriorPlastic({ color: c, roughness: r }));
    },

    fabric: (o) => {
      const c = snapColor(o?.color ?? TRIM_COLORS.interiorFabric);
      return shared(`fabric:${hex(c)}`, () => createFabric({ color: c }));
    },

    carpet: () => shared('carpet', () => createCarpet()),

    alloy: (o) => {
      const vc = (o as { vertexColors?: boolean } | undefined)?.vertexColors ?? false;
      return shared(`alloy:${o?.polished ? 'polished' : 'cast'}${vc ? ':vc' : ''}`,
        () => createAlloy({ polished: o?.polished, vertexColors: vc }));
    },

    brakeDisc: () => shared('brakeDisc', () => createBrakeDisc()),

    dirtyMetal: (o) => {
      const c = snapColor(o?.color ?? 0x3a3c3d);
      const r = nearest(o?.roughness ?? 0.78, DIRT_RUNGS);
      const m = nearest(o?.metalness ?? 0.22, METALNESS_RUNGS);
      const g = Math.round(THREE.MathUtils.clamp(o?.grime ?? 0.7, 0, 1) * 4) / 4;
      const vc = o?.vertexColors ?? false;
      return shared(
        `dirtyMetal:${hex(c)}:${r.toFixed(2)}:${m.toFixed(2)}:${g.toFixed(2)}${vc ? ':vc' : ''}`,
        () => createDirtyMetal({ color: c, roughness: r, metalness: m, grime: g, vertexColors: vc }),
      );
    },

    // The map is the identity. Everything else about a printed surface is a
    // finish, and finishes quantise like any other.
    printed: (map, o) => {
      const r = nearest(o?.roughness ?? 0.42, PRINT_RUNGS);
      const cc = o?.clearcoat ? Math.round(o.clearcoat * 10) / 10 : 0;
      const key = [
        'printed', map.uuid, r.toFixed(2), cc.toFixed(1),
        o?.emissiveMap ? o.emissiveMap.uuid : '-',
        hex(o?.emissive ?? 0),
        (o?.envMapIntensity ?? 0.6).toFixed(2),
        o?.backfaceShadow ? 'bs' : '-',
      ].join(':');
      return shared(key, () => createPrinted(map, { ...o, roughness: r, clearcoat: cc }));
    },

    update: (dt, elapsed) => registry.update(dt, elapsed),

    setEnvMap: (env) => registry.setEnvMap(env),

    /**
     * Recolour the body in place.
     *
     * The paint runs at `metalness: 1` with `material.color` left white, so
     * its visible colour is entirely `uPaintFace` / `uPaintFlop` /
     * `uPaintPigment` / `uFlakeColor`. Writing `material.color` from out here
     * would do very nearly nothing; the tints have to be re-derived from the
     * new hex and copied into the live uniform objects, which is what
     * `paint.setColor` does.
     *
     * Deliberately *not* a rebuild: `needsUpdate` stays false, the material
     * object, its program and every mesh pointing at it are untouched, so the
     * twenty-nine painted panels keep sharing one instance and the recolour
     * costs no new draw call and no shader link.
     *
     * Known limitation, and it is not in this stream: the post chain's
     * `AccumulationPass` (`src/scene/Post.ts`) only invalidates its converged
     * buffer when something *moves*. A colour change is not motion, so with a
     * still camera the new paint is rendered every frame and then discarded,
     * and the picker looks dead until the user orbits. See the stream report.
     */
    setPaintColor: (value) => {
      paint.setColor(value);
      paint.material.needsUpdate = false;
    },
  };

  /**
   * Debug surface, in the house style of `__AUDI_LIGHTS` and `__AUDI_PHYS`:
   *
   *   __AUDI_MAT.list()          every instance the registry has handed out
   *   __AUDI_MAT.paint()         the tints currently in the paint uniforms
   *   __AUDI_MAT.setPaint(hex)
   *
   * `list()` is the only way to see what the option keys actually collapsed
   * to, which is the thing this file is most easily wrong about.
   */
  (globalThis as Record<string, unknown>).__AUDI_MAT = {
    list: () => registry.all().map((m) => m.name),
    count: () => registry.all().length,
    paint: () => ({
      color: paint.color().toString(16).padStart(6, '0'),
      face: paint.uniforms.uPaintFace.value.getHexString(),
      flop: paint.uniforms.uPaintFlop.value.getHexString(),
      pigment: paint.uniforms.uPaintPigment.value.getHexString(),
      flake: paint.uniforms.uFlakeColor.value.getHexString(),
    }),
    setPaint: (v: number) => lib.setPaintColor(v),
  };

  return lib;
}

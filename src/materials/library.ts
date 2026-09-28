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
 * rungs are placed at the clusters the call sites actually form — read off
 * `__AUDI_MAT.raw()`, which records every option set the library was handed
 * before quantisation — and the worst shift any part takes is quoted against
 * each ladder. Colours snap to an already-issued colour only when every
 * channel is within `COLOR_TOLERANCE`.
 *
 * This does **not** reduce draw calls on its own — three draws one call per
 * mesh whether or not two meshes share a material. What it does is make the
 * merge *possible*: geometry that wants to batch across modules can only do so
 * once the modules are handed the same instance.
 *
 * ## How far quantisation can actually get the draw count
 *
 * Measured, so that nobody spends another day here expecting it to: in the
 * `front3q` build the car and stage are **314 visible meshes wearing 57
 * materials**, and they fall into **191 distinct (part, material) pairs**.
 * 191 is therefore the floor the colour pass could reach if every geometry
 * module merged everything it already can *without a single further material
 * change* — 123 draws below where it is. Quantising harder cannot go below
 * one draw per mesh, so it cannot get near the 220-draw budget on its own;
 * what it can do is stop a module being *unable* to merge, which is what the
 * ladders and `printed()` / `castIron()` / `caliperPaint()` / `padFriction()`
 * are for. Use `__AUDI_MAT.audit()` to see which of the two a given material
 * is suffering from.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import type { MaterialLibrary } from '@/types';
import { MaterialRegistry } from './registry';
import { createPaint } from './paint';
import { createGlass } from './glass';
import {
  createChrome, createAlloy, createBrakeDisc, createReflector, createDirtyMetal,
  createCastIron, createCaliperPaint, createPadFriction,
  type DirtyMetalOptions, type CastIronOptions,
} from './metals';
import { createBlackTrim, createBumperPlastic, createRubber, type RubberOptions } from './trim';
import { createLens, createEmissive } from './lamp';
import { createInteriorPlastic, createFabric, createCarpet } from './interior';
import { createPrinted, type PrintedOptions } from './printed';

type Reflective = THREE.Material & { envMapIntensity?: number };

/**
 * The library as this module actually builds it.
 *
 * `MaterialLibrary` in `src/types.ts` is the contract every part builder is
 * handed and this stream does not own that file, so everything added beyond it
 * — `printed`, `dirtyMetal`, `castIron`, `caliperPaint`, `padFriction`, and
 * the widened `rubber` and `alloy` — is declared as an extension. A caller
 * reaches them with `audiMaterials(ctx.materials).printed(map)`. They should
 * move onto `MaterialLibrary` itself the next time `src/types.ts` is open;
 * the exact signatures are in the stream report.
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
  /**
   * Seals and tyres. Wider than the contract in `src/types.ts`, which only
   * offers `roughness`: the dust film's coverage and cell size and the mould
   * gloss all have to move between a 15 mm door seal and a 130 mm sidewall,
   * and the wheels stream had been reaching into the uniforms by name through
   * a private clone to get at them.
   */
  rubber(opts?: RubberOptions): THREE.Material;
  /** As `MaterialLibrary.alloy`, plus the vertex-colour opt-in. */
  alloy(opts?: { polished?: boolean; vertexColors?: boolean }): THREE.Material;
  /** Oxidised grey iron: disc hats and vanes, dust shields, backing plates. */
  castIron(opts?: CastIronOptions): THREE.Material;
  /** The phosphated/painted caliper casting. */
  caliperPaint(opts?: { color?: number; vertexColors?: boolean }): THREE.Material;
  /** Sintered brake friction material. */
  padFriction(opts?: { vertexColors?: boolean }): THREE.Material;
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
 * Seals, tyres, hoses.
 *
 * `__AUDI_MAT.raw()` over a full build gives thirteen calls at
 * 0.68 ×4 · 0.78 · 0.88 ×2 · 0.93 · 0.94 ×2 · 0.95 ×2 · 0.96 — four clusters,
 * of which the lowest two are a tenth apart and were carrying one rung each
 * for one part apiece. One rung between them costs 0.05 on both, at a
 * roughness where the GGX lobe is already so broad that 0.05 changes its width
 * by about seven per cent. Worst shift anywhere else is 0.02.
 */
const RUBBER_RUNGS = [0.73, 0.88, 0.94] as const;

/**
 * Cabin plastics. Worst shift 0.06 — which sounds large until you note that
 * `createInteriorPlastic` already perturbs roughness per pixel by up to +0.14
 * from its own grain and dust, so the ladder step is well inside the variation
 * the material was authored with.
 *
 * Checked against `__AUDI_MAT.raw()`: the thirty-four calls cluster at ≈0.40,
 * ≈0.55, ≈0.67, ≈0.80 and 0.95, which is where these rungs already are. The
 * 0.67 and 0.80 rungs are tempting to merge — the band from 0.66 to 0.88 is a
 * continuum with a call site every two hundredths and no gap to put a boundary
 * in — but collapsing them saves exactly **one** instance and costs a 0.10
 * shift on the parts at either end, so it is not done. That the 0.72 and 0.74
 * call sites land on different rungs is real and is a consequence of the band
 * having no gap, not of the ladder being in the wrong place.
 */
const CABIN_RUNGS = [0.4, 0.56, 0.67, 0.8, 0.93] as const;

/** Under-floor castings and shields; nothing down there is smooth. */
const DIRT_RUNGS = [0.62, 0.74, 0.86, 0.95] as const;

/** Oxide/phosphate/aluminium — three bands is all this ever needs. */
const METALNESS_RUNGS = [0.05, 0.2, 0.35] as const;

/** Printed finishes: semi-gloss paint, satin, matte instrument print. */
const PRINT_RUNGS = [0.34, 0.48, 0.62] as const;

/**
 * Per channel, out of 255.
 *
 * Nineteen distinct cabin greys were requested in one build for an interior
 * the spec gives **one** colour for, and they are not evenly spread: they come
 * in pairs and triples 1–3 apart (`131417`/`141517`/`141518`,
 * `08090a`/`090a0b`, `191b1e`/`1b1d20`, `2c2e33`/`2c2f31`, `232529`/`26282c`).
 * Three folds all of them and nothing else — four folds nothing further, which
 * is the check that three is not merely a number that happened to work. On a
 * cabin grey near 40/255 three parts is a seven per cent step, and
 * `createInteriorPlastic` already swings its own diffuse by ±8 % from grain.
 *
 * The proliferation itself is not a quantisation problem and is not fixed
 * here: see the stream report.
 */
const COLOR_TOLERANCE = 3;

/**
 * Emissive intensity, quantised.
 *
 * `emissive()` was keyed on two decimal places, which is fine for a lamp that
 * is on or off and a disaster for one that ramps: warming the headlamp through
 * 1.00 → 1.10 minted **eleven** materials and linked eleven programs, all of
 * them retained for the life of the page, for one bulb. Nothing was drawn
 * twice — the old ones simply sat in the cache — but each one cost a shader
 * link at exactly the moment the user was watching the lamp come on.
 *
 * Steps of 0.1 above half, 0.05 below it: coarse enough to make a ramp cost
 * two instances instead of eleven, and fine enough not to quantise a bulb's
 * glow-up into visible stairs (the bloom in the post chain is far wider than a
 * 10 % step). A caller animating faster than this should still hold one
 * material and drive `emissiveIntensity` itself.
 */
function quantiseIntensity(i: number): number {
  const v = Math.max(i, 0);
  return v < 0.5 ? Math.round(v * 20) / 20 : Math.round(v * 10) / 10;
}

/** One row of `__AUDI_MAT.audit()`. */
interface AuditRow {
  /** The registry key, which is also `material.name`. */
  material: string;
  /** Drawables wearing it. */
  meshes: number;
  /**
   * Draw calls they actually cost.
   *
   * One per mesh, *not* one per geometry group. three only walks
   * `geometry.groups` when `mesh.material` is an array; a merged geometry that
   * kept its groups but wears a single material is still one draw. Counting
   * groups here reported `chrome:0.050` at 56 draws for 8 meshes and put the
   * whole audit about 40 % over the renderer's own figure — which, on a budget
   * item, is the difference between chasing a real saving and chasing nothing.
   */
  draws: number;
  /**
   * Geometry groups those meshes carry *beyond* the materials that address
   * them. Zero cost today, but it is dead bookkeeping on every merge, and a
   * later caller that turns one of these into a material array pays a draw per
   * group the moment it does.
   */
  idleGroups: number;
  triangles: number;
  /** Meshes not parented under the car — stage, ground, sky. */
  offCar: number;
}

/**
 * Count what is actually wearing each material in the live scene.
 *
 * The scene is not reachable from here — the library is handed a renderer and
 * nothing else — so it is borrowed from the next `renderer.render` call and
 * the hook removes itself immediately. Hence the promise: this resolves on the
 * next frame, not on this one.
 */
function auditScene(renderer: THREE.WebGLRenderer, registry: MaterialRegistry): Promise<AuditRow[]> {
  type Renderable = { render(scene: THREE.Object3D, camera: THREE.Camera): void };
  const r = renderer as unknown as Renderable;
  const orig = r.render.bind(renderer);

  return new Promise((resolve) => {
    r.render = (scene, camera) => {
      r.render = orig;
      orig(scene, camera);

      const known = new Map(registry.all().map((m) => [m.uuid, m.name]));
      const rows = new Map<string, AuditRow>();
      const row = (name: string): AuditRow => {
        let e = rows.get(name);
        if (!e) { e = { material: name, meshes: 0, draws: 0, idleGroups: 0, triangles: 0, offCar: 0 }; rows.set(name, e); }
        return e;
      };

      scene.traverse((o) => {
        const mesh = o as THREE.Mesh & { isMesh?: boolean; count?: number };
        if (!mesh.isMesh || !mesh.geometry) return;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;

        const g = mesh.geometry;
        const tri = Math.round(((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * (mesh.count ?? 1));
        const multi = Array.isArray(mesh.material);
        const mats = multi ? (mesh.material as THREE.Material[]) : [mesh.material as THREE.Material];
        const groups = g.groups ?? [];
        let onCar = false;
        for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === 'Audi5000SWagon') { onCar = true; break; }

        for (let i = 0; i < mats.length; i++) {
          const m = mats[i];
          const e = row(known.get(m.uuid) ?? `(unregistered) ${m.name || m.type}`);
          e.meshes += 1;
          // A material array is drawn once per group that addresses it; a
          // single material is drawn once, groups or no groups.
          e.draws += multi ? Math.max(groups.filter((gr) => gr.materialIndex === i).length, 1) : 1;
          if (!multi) e.idleGroups += Math.max(groups.length - 1, 0);
          e.triangles += Math.round(tri / mats.length);
          if (!onCar) e.offCar += 1;
        }
      });

      resolve([...rows.values()].sort((a, b) => b.draws - a.draws || b.triangles - a.triangles));
    };
  });
}

function nearest(value: number, rungs: readonly number[]): number {
  let best = rungs[0];
  let bd = Infinity;
  for (const r of rungs) {
    const d = Math.abs(value - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/**
 * Every raw option set the library was asked for, before quantisation.
 *
 * The ladders above are only defensible if the rungs sit where the call sites
 * actually cluster, and the call sites are spread over six other work streams.
 * This is how that is checked — `__AUDI_MAT.raw()` after a build prints what
 * was really asked for, so a rung can be moved on evidence rather than on a
 * guess about what somebody meant by 0.67. Capped, because a caller animating
 * an option would otherwise grow it without bound.
 */
const REQUEST_LOG_MAX = 4000;
const requests: Array<{ entry: string; opts: unknown }> = [];
function record<T>(entry: string, opts: T): T {
  if (requests.length < REQUEST_LOG_MAX) requests.push({ entry, opts: opts ?? null });
  return opts;
}

export function createMaterialLibrary(renderer: THREE.WebGLRenderer): AudiMaterialLibrary {
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
  function fold(into: number[], value: number, tol: number): number {
    for (const c of into) {
      if (Math.abs(((c >> 16) & 255) - ((value >> 16) & 255)) <= tol
        && Math.abs(((c >> 8) & 255) - ((value >> 8) & 255)) <= tol
        && Math.abs((c & 255) - (value & 255)) <= tol) return c;
    }
    into.push(value);
    return value;
  }

  const issued: number[] = [];
  const snapColor = (value: number): number => fold(issued, value, COLOR_TOLERANCE);

  /**
   * Bulbs fold on their own, much coarser, list.
   *
   * A lamp filament is authored at an intensity of one to two and a half and
   * then goes through bloom and a tone curve, so it is clipped to white over
   * most of its area before anybody sees its hue; the three warm whites in the
   * build (`fff0dc`, `fff2d0`, `fff4e2`) are indistinguishable in the frame.
   * Sharing the cabin's three-parts-in-255 list would keep them apart for no
   * reason — and, worse, would let a bulb colour fold onto a *plastic* one.
   */
  const issuedEmissive: number[] = [];
  const snapEmissive = (value: number): number => fold(issuedEmissive, value, 8);

  /**
   * A caller ramping one bulb's intensity mints a material per step.
   *
   * `quantiseIntensity` blunts that — nine steps of a headlamp warm-up became
   * two — but it cannot fix it, and the fix belongs at the call site: hold one
   * material and drive `emissiveIntensity` on it. Say so, once, rather than
   * letting the cache quietly grow.
   */
  const emissiveSteps = new Map<number, Set<number>>();
  function watchEmissive(color: number, intensity: number): void {
    let s = emissiveSteps.get(color);
    if (!s) { s = new Set(); emissiveSteps.set(color, s); }
    const before = s.size;
    s.add(intensity);
    if (before === 3 && s.size === 4) {
      console.warn(`[materials] emissive #${hex(color)} has been asked for at four intensities`
        + ' — that is four materials and four program links for one bulb.'
        + ' Hold one material and drive emissiveIntensity instead.');
    }
  }

  const lib: AudiMaterialLibrary = {
    paint: () => shared('paint', () => paint.material),

    glass: (o) =>
      shared(
        `glass:${hex(o?.tint ?? TRIM_COLORS.glassTint)}:${o?.opacity ?? 1}:${o?.interiorSide ? 'in' : 'out'}`,
        () => createGlass(o),
      ),

    chrome: (o) => {
      record('chrome', o);
      const r = nearest(o?.roughness ?? 0.045, CHROME_RUNGS);
      return shared(`chrome:${r.toFixed(3)}`, () => createChrome({ ...o, roughness: r }));
    },

    blackTrim: () => shared('blackTrim', () => createBlackTrim()),

    bumperPlastic: () => shared('bumperPlastic', () => createBumperPlastic()),

    /**
     * Roughness quantises onto the ladder; the three film/mould options round
     * instead. A ladder wants call-site clusters to sit on and there are only
     * two here — a seal and a sidewall — so a ladder would be a guess, while
     * rounding to a step no one can see is defensible on its own.
     */
    rubber: (o) => {
      record('rubber', o);
      const r = nearest(o?.roughness ?? 0.92, RUBBER_RUNGS);
      const dust = Math.round(THREE.MathUtils.clamp(o?.dust ?? 0.3, 0, 1) * 20) / 20;
      const cells = Math.max(20, Math.round((o?.dustCells ?? 120) / 40) * 40);
      const gloss = Math.round(THREE.MathUtils.clamp(o?.mouldGloss ?? 0.3, 0, 1) * 20) / 20;
      const curve = Math.max(10, Math.round((o?.mouldCurve ?? 90) / 10) * 10);
      const vc = o?.vertexColors ?? false;
      return shared(
        `rubber:${r.toFixed(2)}:${dust.toFixed(2)}:${cells}:${gloss.toFixed(2)}:${curve}${vc ? ':vc' : ''}`,
        () => createRubber({ roughness: r, dust, dustCells: cells, mouldGloss: gloss, mouldCurve: curve, vertexColors: vc }),
      );
    },

    // The lens and the glass are the two surfaces the review singled out as
    // correct, so neither is quantised: their options are few, deliberate and
    // come straight from `spec.ts`.
    lens: (color, o) => {
      record('lens', { color, ...o });
      return shared(`lens:${hex(color)}:${o?.prismatic ? 'prism' : 'smooth'}:${o?.opacity ?? 1}`, () => createLens(color, o));
    },

    reflector: () => shared('reflector', () => createReflector()),

    // Bulbs: a coarse colour fold and a coarse intensity ladder, because a
    // filament is clipped to white over most of its area long before anyone
    // can judge its hue. See `quantiseIntensity` and `watchEmissive`.
    emissive: (color, intensity) => {
      record('emissive', { color, intensity });
      const c = snapEmissive(color);
      const i = quantiseIntensity(intensity);
      watchEmissive(c, i);
      return shared(`emissive:${hex(c)}:${i.toFixed(2)}`, () => createEmissive(c, i));
    },

    interiorPlastic: (o) => {
      record('interiorPlastic', o);
      const c = snapColor(o?.color ?? TRIM_COLORS.interiorPlastic);
      const r = nearest(o?.roughness ?? 0.7, CABIN_RUNGS);
      return shared(`interiorPlastic:${hex(c)}:${r.toFixed(2)}`, () => createInteriorPlastic({ color: c, roughness: r }));
    },

    fabric: (o) => {
      record('fabric', o);
      const c = snapColor(o?.color ?? TRIM_COLORS.interiorFabric);
      return shared(`fabric:${hex(c)}`, () => createFabric({ color: c }));
    },

    carpet: () => shared('carpet', () => createCarpet()),

    alloy: (o) => {
      record('alloy', o);
      const vc = o?.vertexColors ?? false;
      return shared(`alloy:${o?.polished ? 'polished' : 'cast'}${vc ? ':vc' : ''}`,
        () => createAlloy({ polished: o?.polished, vertexColors: vc }));
    },

    brakeDisc: () => shared('brakeDisc', () => createBrakeDisc()),

    dirtyMetal: (o) => {
      record('dirtyMetal', o);
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

    // The three brake finishes are `dirtyMetal` underneath — same program, same
    // link — so they are keyed on their own axes rather than being folded into
    // its key, which would make an oxide level look like a colour coincidence.
    castIron: (o) => {
      record('castIron', o);
      const ox = Math.round(THREE.MathUtils.clamp(o?.oxide ?? 1, 0, 1) * 4) / 4;
      const g = Math.round(THREE.MathUtils.clamp(o?.grime ?? 0.7, 0, 1) * 4) / 4;
      const c = o?.color !== undefined ? snapColor(o.color) : undefined;
      const r = o?.roughness !== undefined ? nearest(o.roughness, DIRT_RUNGS) : undefined;
      const vc = o?.vertexColors ?? false;
      return shared(
        `castIron:${ox.toFixed(2)}:${g.toFixed(2)}:${c === undefined ? '-' : hex(c)}:${r === undefined ? '-' : r.toFixed(2)}${vc ? ':vc' : ''}`,
        () => createCastIron({ oxide: ox, grime: g, color: c, roughness: r, vertexColors: vc }),
      );
    },

    caliperPaint: (o) => {
      record('caliperPaint', o);
      const c = snapColor(o?.color ?? 0x4a4540);
      const vc = o?.vertexColors ?? false;
      return shared(`caliperPaint:${hex(c)}${vc ? ':vc' : ''}`, () => createCaliperPaint({ color: c, vertexColors: vc }));
    },

    padFriction: (o) => {
      record('padFriction', o);
      const vc = o?.vertexColors ?? false;
      return shared(`padFriction${vc ? ':vc' : ''}`, () => createPadFriction({ vertexColors: vc }));
    },

    // The map is the identity. Everything else about a printed surface is a
    // finish, and finishes quantise like any other.
    printed: (map, o) => {
      record('printed', o);
      const r = nearest(o?.roughness ?? 0.42, PRINT_RUNGS);
      const cc = o?.clearcoat ? Math.round(o.clearcoat * 10) / 10 : 0;
      const key = [
        'printed', map.uuid, r.toFixed(2), cc.toFixed(1),
        o?.emissiveMap ? o.emissiveMap.uuid : '-',
        hex(o?.emissive ?? 0),
        (o?.envMapIntensity ?? 0.6).toFixed(2),
        (o?.specularIntensity ?? 1).toFixed(2),
        o?.backfaceShadow ? 'bs' : '-',
        // Retroreflection is a different *program*, not just a different
        // finish — `printed()` splices GLSL for it — so two callers at
        // different settings must not collapse onto one instance and wear
        // each other's sheeting.
        (o?.retroGain ?? 0).toFixed(2),
        (o?.retroLobe ?? 3).toFixed(1),
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
     * ## The event, and why it has to be here
     *
     * The tints above are correct and measurable the instant they are written
     * — but the post chain's `AccumulationPass` (`src/scene/Post.ts`) only
     * drops its converged buffer when something *moves*, and it tests for
     * motion by comparing object transforms. A colour change moves nothing, so
     * with a still camera the repainted car is rendered and then averaged away
     * at a weight of 1/n against fifteen frames of the old colour. That is
     * exactly the "the swatches barely do anything, and green pushes red up"
     * symptom: what is being measured is a stale blend of the *previous*
     * swatch, not this one. Measured on the door skin, red lands at
     * (173, 53, 57) once the buffer is dropped and at (58, 50, 52) when it is
     * not.
     *
     * This stream cannot reset that buffer — `src/scene` owns it — so the
     * library announces the change and the post chain is asked to listen:
     *
     *   globalThis.addEventListener('audi:materials-dirty', () => accum.reset());
     *
     * Dispatching costs nothing when no one is listening, and it is the right
     * contract either way: anything that changes what a pixel should be
     * without moving a vertex belongs on this event.
     */
    setPaintColor: (value) => {
      paint.setColor(value);
      paint.material.needsUpdate = false;
      globalThis.dispatchEvent?.(new Event('audi:materials-dirty'));
    },
  };

  /**
   * Debug surface, in the house style of `__AUDI_LIGHTS` and `__AUDI_PHYS`:
   *
   *   __AUDI_MAT.list()          every instance the registry has handed out
   *   __AUDI_MAT.audit()         …and how many drawables are wearing each
   *   __AUDI_MAT.paint()         the tints currently in the paint uniforms
   *   __AUDI_MAT.setPaint(hex)
   *
   * `list()` is the only way to see what the option keys actually collapsed
   * to, which is the thing this file is most easily wrong about — and `audit()`
   * is the only way to see whether that mattered. A material handed to one
   * mesh is a material that has split a batch for nothing; a material handed
   * to twenty meshes that are still twenty draws is a merge the geometry
   * stream has not taken yet. The two cases look identical in `list()` and
   * want opposite fixes, so do not read one without the other.
   */
  (globalThis as Record<string, unknown>).__AUDI_MAT = {
    list: () => registry.all().map((m) => m.name),
    raw: () => requests,
    count: () => registry.all().length,
    audit: () => auditScene(renderer, registry),
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

/**
 * The material library.
 *
 * Every surface on the car comes from here, and every call is memoised: the
 * body stream asks for `paint()` once per panel and must get *one* instance
 * back, or the panels stop batching and the car costs a draw call per panel.
 * The same is true of the trim, the glass and the wheel alloy.
 *
 * Nothing in this file does any shading itself. It owns three jobs only:
 *
 *  - **identity** — one material per distinct set of options, via the registry;
 *  - **environment** — pushing the IBL into everything that reflects, with the
 *    per-material intensity each one was authored with;
 *  - **time** — driving whatever uniforms have asked to be animated.
 *
 * The shading lives in `paint.ts`, `glass.ts`, `metals.ts`, `trim.ts`,
 * `lamp.ts` and `interior.ts`.
 */

import * as THREE from 'three';
import { TRIM_COLORS } from '@/spec';
import type { MaterialLibrary } from '@/types';
import { MaterialRegistry } from './registry';
import { createPaint } from './paint';
import { createGlass } from './glass';
import { createChrome, createAlloy, createBrakeDisc, createReflector } from './metals';
import { createBlackTrim, createBumperPlastic, createRubber } from './trim';
import { createLens, createEmissive } from './lamp';
import { createInteriorPlastic, createFabric, createCarpet } from './interior';

type Reflective = THREE.Material & { envMapIntensity?: number };

export function createMaterialLibrary(_renderer: THREE.WebGLRenderer): MaterialLibrary {
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

  return {
    paint: () => shared('paint', () => paint.material),

    glass: (o) =>
      shared(
        `glass:${hex(o?.tint ?? TRIM_COLORS.glassTint)}:${o?.opacity ?? 1}:${o?.interiorSide ? 'in' : 'out'}`,
        () => createGlass(o),
      ),

    chrome: (o) => shared(`chrome:${(o?.roughness ?? 0.045).toFixed(3)}`, () => createChrome(o)),

    blackTrim: () => shared('blackTrim', () => createBlackTrim()),

    bumperPlastic: () => shared('bumperPlastic', () => createBumperPlastic()),

    rubber: (o) => shared(`rubber:${(o?.roughness ?? 0.92).toFixed(2)}`, () => createRubber(o)),

    lens: (color, o) =>
      shared(`lens:${hex(color)}:${o?.prismatic ? 'prism' : 'smooth'}:${o?.opacity ?? 1}`, () => createLens(color, o)),

    reflector: () => shared('reflector', () => createReflector()),

    // Keyed on a rounded intensity so a caller that ramps a lamp up and down
    // cannot fill the cache with near-duplicate materials. Anything animating
    // faster than that should hold one material and drive `emissiveIntensity`.
    emissive: (color, intensity) =>
      shared(`emissive:${hex(color)}:${intensity.toFixed(2)}`, () => createEmissive(color, intensity)),

    interiorPlastic: (o) =>
      shared(
        `interiorPlastic:${hex(o?.color ?? TRIM_COLORS.interiorPlastic)}:${(o?.roughness ?? 0.7).toFixed(2)}`,
        () => createInteriorPlastic(o),
      ),

    fabric: (o) => shared(`fabric:${hex(o?.color ?? TRIM_COLORS.interiorFabric)}`, () => createFabric(o)),

    carpet: () => shared('carpet', () => createCarpet()),

    alloy: (o) => shared(`alloy:${o?.polished ? 'polished' : 'cast'}`, () => createAlloy(o)),

    brakeDisc: () => shared('brakeDisc', () => createBrakeDisc()),

    update: (dt, elapsed) => registry.update(dt, elapsed),

    setEnvMap: (env) => registry.setEnvMap(env),

    setPaintColor: (value) => {
      // Recolour in place. Rebuilding would hand the body stream a second
      // material and silently split its batch.
      paint.setColor(value);
      paint.material.needsUpdate = false;
    },
  };
}

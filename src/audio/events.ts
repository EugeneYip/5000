/**
 * One-shot events the audio needs but cannot observe.
 *
 * Articulations live on the car and are driven through `__AUDI.setArticulation`
 * or the keyboard shortcuts in `main.ts`; nothing publishes *when* one is
 * commanded. Whoever flips a door publishes it here and the sound follows.
 */

export type AudioEvent =
  | { kind: 'articulation'; name: string; open: boolean }
  | { kind: 'horn'; on: boolean };

import { Car as CarClass } from '@/car/Car';

type Handler = (e: AudioEvent) => void;

const handlers = new Set<Handler>();
let installed = false;

export function emitAudio(e: AudioEvent): void {
  for (const h of handlers) h(e);
}

export function onAudio(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

/**
 * Make the car itself publish. `main.ts` binds O/P/L to
 * `car.toggleArticulation` and the harness calls `__AUDI.setArticulation`, and
 * neither says anything to us; wrapping the two methods on the prototype means
 * every route into an articulation — keyboard, debug API, HUD — emits exactly
 * one event, at the moment the move is *commanded*.
 *
 * **This is a workaround, not a design**, in the same spirit as `ui/rigLink`.
 * The honest fix is for `Car` to emit, or for `main.ts` to route through one
 * place. Both wrappers call the original first and are idempotent, so a second
 * install is a no-op and behaviour is otherwise unchanged.
 */
export function installArticulationTaps(): void {
  if (installed) return;
  installed = true;

  interface CarLike {
    articulations: Map<string, { target: number }>;
    setArticulation(name: string, open: number): void;
    toggleArticulation(name: string): void;
  }

  const proto = CarClass.prototype as unknown as CarLike;
  const setOrig = proto.setArticulation;
  const toggleOrig = proto.toggleArticulation;
  if (typeof setOrig !== 'function' || typeof toggleOrig !== 'function') return;

  proto.setArticulation = function tapped(this: CarLike, name: string, open: number): void {
    const before = this.articulations.get(name)?.target;
    setOrig.call(this, name, open);
    const after = this.articulations.get(name)?.target;
    if (after !== undefined && after !== before) emitAudio({ kind: 'articulation', name, open: after > 0.5 });
  };

  proto.toggleArticulation = function tapped(this: CarLike, name: string): void {
    toggleOrig.call(this, name);
    const after = this.articulations.get(name)?.target;
    if (after !== undefined) emitAudio({ kind: 'articulation', name, open: after > 0.5 });
  };
}

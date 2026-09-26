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

type Handler = (e: AudioEvent) => void;

const handlers = new Set<Handler>();

export function emitAudio(e: AudioEvent): void {
  for (const h of handlers) h(e);
}

export function onAudio(h: Handler): () => void {
  handlers.add(h);
  return () => handlers.delete(h);
}

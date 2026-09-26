/**
 * One switch for every pixel of chrome the UI stream draws.
 *
 * `main.ts` routes `__AUDI.setUiVisible()` to `hud.setVisible()`, but the HUD
 * is not the only thing on screen — the touch driving controls live in
 * `input.ts` and are created *before* the HUD exists. The screenshot harness
 * must be able to clear both with one call, so both subscribe here instead of
 * reaching into each other.
 */

type Listener = (visible: boolean) => void;

const listeners = new Set<Listener>();
let visible = true;

export function isUiVisible(): boolean {
  return visible;
}

export function setUiVisible(v: boolean): void {
  if (v === visible) return;
  visible = v;
  for (const fn of listeners) fn(v);
}

/** Subscribe; the callback fires immediately with the current value. */
export function onUiVisibility(fn: Listener): () => void {
  listeners.add(fn);
  fn(visible);
  return () => listeners.delete(fn);
}

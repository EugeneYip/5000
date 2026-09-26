/**
 * Drag to orbit, scroll or pinch to zoom.
 *
 * Writes straight into the rig's own `orbit` object (see `rigLink`), so there
 * is a single source of truth for where the camera is. A drag that starts in
 * one of the fixed review poses drops into the orbit view first — otherwise
 * the gesture silently does nothing and the model feels dead to the touch.
 * The driving cameras are exempt: nobody wants the chase cam to jump because
 * they brushed the screen mid-corner.
 */

import { currentView, orbitDrag, orbitZoom } from '../rigLink';
import type { ViewName } from '@/types';

/** Views a drag is allowed to pull out of. */
const STATIC_VIEWS = new Set<ViewName>([
  'front3q', 'rear3q', 'side', 'front', 'rear', 'top',
  'wheel', 'headlight', 'taillight', 'roofrail', 'badge', 'platecam', 'photomatch',
]);

const DRAG_THRESHOLD = 4;

export class OrbitInput {
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private moved = 0;
  private dragging = false;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** UI chrome handles its own pointers; never orbit from a button press. */
  private fromChrome(e: PointerEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t?.closest?.('.audi-ui, .audi-touch');
  }

  private onDown = (e: PointerEvent): void => {
    if (this.fromChrome(e)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.moved = 0;
    this.dragging = false;
    this.el.setPointerCapture?.(e.pointerId);
    if (this.pointers.size === 2) this.lastPinch = this.pinchDistance();
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.pointers.size >= 2) {
      const d = this.pinchDistance();
      if (this.lastPinch > 0 && d > 0) orbitZoom(this.lastPinch / d);
      this.lastPinch = d;
      return;
    }

    this.moved += Math.abs(dx) + Math.abs(dy);
    if (!this.dragging) {
      if (this.moved < DRAG_THRESHOLD) return;
      const view = currentView();
      if (view !== 'orbit') {
        if (view && !STATIC_VIEWS.has(view)) return;
        globalThis.__AUDI?.setView?.('orbit');
      }
      this.dragging = true;
    }
    // Screen pixels → radians; a full window width is a little over half a turn.
    const k = 2.2 / Math.max(320, this.el.clientWidth);
    orbitDrag(dx * k, dy * k * 0.9);
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.lastPinch = 0;
    if (this.pointers.size === 0) this.dragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (currentView() !== 'orbit') return;
    e.preventDefault();
    const unitPx = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    orbitZoom(Math.exp((e.deltaY * unitPx) * 0.0012));
  };

  /** Right-stick look from a pad, applied per frame. */
  pad(lookX: number, lookY: number, zoom: number, dt: number): void {
    if (lookX === 0 && lookY === 0 && zoom === 0) return;
    if (currentView() !== 'orbit') return;
    orbitDrag(-lookX * 2.1 * dt, -lookY * 1.4 * dt);
    if (zoom !== 0) orbitZoom(Math.exp(zoom * 0.9 * dt));
  }
}

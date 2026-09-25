/**
 * HUD / control panel — placeholder. Owned by the UI work stream.
 */
import type { VehicleState } from '@/types';

export interface Hud {
  update(state: VehicleState, stats: { fps: number; drawCalls: number; triangles: number }): void;
  setVisible(v: boolean): void;
}

export function createHud(_container: HTMLElement): Hud {
  return { update: () => {}, setVisible: () => {} };
}

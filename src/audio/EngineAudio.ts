/**
 * Engine audio — placeholder. Owned by the audio work stream.
 * The inline-5's 144-degree firing interval gives a half-order component that
 * is the whole character of the sound. Synthesise, do not sample.
 */
import type { VehicleState } from '@/types';

export class EngineAudio {
  update(_state: VehicleState): void {}
  start(): void {}
  stop(): void {}
}

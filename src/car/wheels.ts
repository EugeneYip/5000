/**
 * Wheels — placeholder.
 *
 * This module is owned by the wheels work stream. Replace this stub entirely.
 * Contract: export `buildWheels(ctx: BuildContext): PartResult | Promise<PartResult>`.
 * Read every dimension from `@/spec`; take every material from `ctx.materials`.
 */
import * as THREE from 'three';
import type { BuildContext, PartResult } from '@/types';

export function buildWheels(_ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  return { group };
}

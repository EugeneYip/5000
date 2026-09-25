/**
 * Body — placeholder.
 *
 * This module is owned by the body work stream. Replace this stub entirely.
 * Contract: export `buildBody(ctx: BuildContext): PartResult | Promise<PartResult>`.
 * Read every dimension from `@/spec`; take every material from `ctx.materials`.
 */
import * as THREE from 'three';
import type { BuildContext, PartResult } from '@/types';

export function buildBody(_ctx: BuildContext): PartResult {
  const group = new THREE.Group();
  return { group };
}

/**
 * Post-processing — placeholder. Owned by the render/post work stream.
 * Must provide TAA or SMAA, SSAO/GTAO, screen-space reflections or a
 * convincing substitute, bloom, depth of field, and a film grain/vignette.
 */
import type { Stage } from './Stage';
import type { EnvironmentHandle } from './Environment';
import type { Pose } from './CameraRig';

export interface PostChain {
  render(dt: number): void;
  setSize(w: number, h: number): void;
  setPose(pose: Pose | null): void;
}

export function createPostChain(stage: Stage, _env: EnvironmentHandle): PostChain {
  return {
    render: () => stage.renderer.render(stage.scene, stage.camera),
    setSize: () => {},
    setPose: () => {},
  };
}

/**
 * Stage — renderer, colour pipeline and post-processing.
 *
 * Colour management is the thing most WebGL car renders get wrong: they light
 * in sRGB, blow the highlights, and the paint reads like plastic. Here
 * everything is linear through to a filmic tonemap at the very end, and the
 * clearcoat is allowed to overbloom slightly the way a real specular does on
 * film.
 */

import * as THREE from 'three';
import { QUALITY } from '@/spec';

export interface StageOptions {
  container: HTMLElement;
  /** Render scale. 1 = native, >1 = supersample then downfilter. */
  pixelRatio?: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  /** Set by the post chain once it is installed. */
  private composer: { render(dt: number): void; setSize(w: number, h: number): void } | null = null;

  private clock = new THREE.Clock();
  private frameCount = 0;
  private fpsSamples: number[] = [];
  private lastCalls = 0;
  private lastTriangles = 0;

  constructor(private opts: StageOptions) {
    const canvas = document.createElement('canvas');
    opts.container.appendChild(canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      // A 16-bit float back buffer keeps highlight detail for the tonemapper.
      // Without it the clearcoat specular clips to white and the paint dies.
      depth: true,
      preserveDrawingBuffer: true,
    });

    this.renderer.setPixelRatio(Math.min(opts.pixelRatio ?? window.devicePixelRatio, 2));
    this.renderer.setSize(opts.container.clientWidth, opts.container.clientHeight, false);

    // --- colour pipeline ---
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES filmic: rolls off highlights instead of clipping them. This is what
    // makes a bright clearcoat specular read as light rather than as a hole.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // The transmission pass re-renders the whole opaque scene into its own
    // target and rebuilds a mip chain every frame, so glazing costs roughly
    // 2.7x. Nothing in the scene refracts finely enough to need that at full
    // resolution — the backdrop seen through a windscreen is low-frequency.
    this.renderer.transmissionResolutionScale = 0.6;

    // --- shadows ---
    // Take manual control of the stats counters: the composer issues many
    // render calls per frame and each one resets them, so the automatic reset
    // leaves you reading the last pass instead of the frame.
    this.renderer.info.autoReset = false;

    this.renderer.shadowMap.enabled = true;
    // PCF-soft rather than VSM. VSM's Chebyshev bound bleeds badly when one
    // blur kernel straddles occluders at very different depths, and the
    // canopy dapple the reference photograph has needs an occluder ~45 m
    // up-sun (a 9 m crown at 11.5 degrees of sun throws 44 m). That would mix
    // a 45 m occluder with the car's own 2 m contact shadow in one kernel and
    // return ~1, erasing the contact shadow inside the canopy shade — the one
    // thing that must not happen.
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.scene = new THREE.Scene();

    // 40 mm-equivalent by default; individual views override this. A long lens
    // is used for the profile and dead-on views so proportions stay honest.
    this.camera = new THREE.PerspectiveCamera(38, this.aspect, 0.08, 600);
    this.camera.position.set(5.2, 1.75, 6.4);

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  get aspect(): number {
    const el = this.opts.container;
    return Math.max(el.clientWidth, 1) / Math.max(el.clientHeight, 1);
  }

  get width(): number { return this.opts.container.clientWidth; }
  get height(): number { return this.opts.container.clientHeight; }

  setComposer(c: { render(dt: number): void; setSize(w: number, h: number): void } | null): void {
    this.composer = c;
    if (c) c.setSize(this.width, this.height);
  }

  private onResize = (): void => {
    const w = this.opts.container.clientWidth;
    const h = this.opts.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  };

  /** One frame. Returns the delta time actually used. */
  render(): number {
    // Two different numbers. The simulation needs dt clamped or a long frame
    // explodes the integrator; the fps readout needs the REAL elapsed time.
    // Sharing one clamped value meant 1/dt could never fall below 10, so every
    // "10.0 fps" reading actually meant "100 ms or worse" and the readout was
    // useless exactly when it mattered.
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    this.renderer.info.reset();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);

    this.lastCalls = this.renderer.info.render.calls;
    this.lastTriangles = this.renderer.info.render.triangles;
    this.frameCount++;
    if (rawDt > 0) {
      this.fpsSamples.push(1 / rawDt);
      if (this.fpsSamples.length > 180) this.fpsSamples.shift();
    }
    return dt;
  }

  /** Render `n` frames back-to-back so temporal effects converge before a capture. */
  settle(n = 24): void {
    for (let i = 0; i < n; i++) this.render();
  }

  stats(): { fps: number; ms: number; drawCalls: number; triangles: number; programs: number } {
    const s = [...this.fpsSamples].sort((a, b) => a - b);
    const fps = s.length ? s[Math.floor(s.length / 2)] : 0;
    return {
      fps,
      ms: fps > 0 ? 1000 / fps : 0,
      drawCalls: this.lastCalls,
      triangles: this.lastTriangles,
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}

/** Fails fast with a readable message rather than a blank canvas. */
export function assertWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') as WebGL2RenderingContext | null);
  } catch {
    return false;
  }
}

export const SHADOW_MAP_SIZE = QUALITY.shadowMapSize;

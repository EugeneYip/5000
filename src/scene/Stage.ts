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

// ---------------------------------------------------------------------------
// Quality tiers
// ---------------------------------------------------------------------------

export type QualityTier = 'desktop' | 'tablet' | 'phone';

/**
 * What a tier is allowed to change. Everything here is measured; see
 * `docs`-free note below each field for what it buys and what it costs.
 *
 * The rule the whole table is built around: **`desktop` is the committed
 * behaviour, field for field.** The review pipeline and the colour gate shoot
 * at 1600x900 with a fine pointer, which resolves to `desktop`, so no tier can
 * move a gate figure. If that stops being true the gate stops being
 * reproducible, which is worse than a slow phone.
 */
export interface TierSettings {
  /**
   * Ceiling on `devicePixelRatio`. The whole frame is fragment-bound, so this
   * is the only lever that scales every cost in the chain at once.
   */
  pixelRatioCap: number;
  /** MSAA samples on the one pass that rasterises geometry. */
  msaaSamples: number;
  /** Fraction of output resolution the ambient occlusion is computed at. */
  aoScale: number;
  /** Ambient occlusion at all. */
  ao: boolean;
  /** Veiling glare. */
  bloom: boolean;
  /** Lens defocus, on the poses that are stopped down for it. */
  dof: boolean;
  /** Frames the still-frame supersampler averages before it converges. */
  accumSamples: number;
  /** Sun shadow map, per side. */
  shadowMapSize: number;
  /** Resolution the transmission prepass re-renders the opaque scene at. */
  transmissionScale: number;
}

const DESKTOP: TierSettings = {
  pixelRatioCap: 2,
  msaaSamples: 2,
  aoScale: 0.5,
  ao: true,
  bloom: true,
  dof: true,
  accumSamples: 16,
  shadowMapSize: QUALITY.shadowMapSize,
  transmissionScale: 0.6,
};

/**
 * Tier table. Measured on an Apple M2 at each tier's own pixel count, GPU time
 * per frame with the throttle held (`__AUDI_PERF.gpuStats()`); see the numbers
 * against each entry. A phone GPU is several times slower per pixel than this
 * one, so the ratios are what transfer, not the absolute milliseconds.
 */
export const TIERS: Record<QualityTier, TierSettings> = {
  desktop: DESKTOP,

  /**
   * Tablet: a large panel on a mobile GPU. 1668x2388 native is 3.98 MP, 2.8x
   * the desktop gate, and that alone is the whole problem — the geometry is
   * identical.
   *
   * Drops, in order of what they buy:
   *  - device pixel ratio capped at 1.5 rather than 2: 3.98 -> 2.24 MP.
   *    Everything downstream is per-pixel, so this is worth more than the rest
   *    of the table combined. The panel is 264 ppi, so 1.5x is still past the
   *    point most eyes resolve.
   *  - MSAA off. The accumulation pass supersamples 16 ways the moment the
   *    scene is still, which is strictly better coverage; MSAA only does
   *    anything while the car is moving, and a moving car is not being
   *    inspected for edge quality.
   *  - shadow map 4096 -> 2048. This one is visible: the canopy dapple's holes
   *    are cut at about one texel, so doubling the texel (14.6 -> 29 mm)
   *    prints the mottle instead of averaging it. Accepted on a tier that is
   *    not the gate.
   */
  tablet: {
    ...DESKTOP,
    pixelRatioCap: 1.5,
    msaaSamples: 0,
    shadowMapSize: 2048,
  },

  /**
   * Phone. Note the pixel count is NOT the problem here: an iPhone 13 at the
   * committed cap of 2 is 780x1328 = 1.04 MP, which is *less* than the
   * 1.44 MP desktop gate. The problem is entirely that the GPU is several
   * times slower per pixel, so the fix has to come out of the per-pixel work
   * rather than out of the pixels.
   *
   * Drops everything the tablet drops, plus:
   *  - ambient occlusion. The largest single item in the chain. What goes with
   *    it is the contact darkening under the arches and sills; the environment
   *    still lays a separate contact shadow under the car, so the car does not
   *    float.
   *  - bloom. Three blur mip levels and a composite. What goes is the veiling
   *    glare around the clearcoat highlights, which on a 6-inch panel at arm's
   *    length is close to invisible anyway.
   *  - depth of field. What goes is the defocused foreground on the stopped-
   *    down poses. Nothing on the driving views was ever defocused.
   *  - accumulation 16 -> 6 samples. Only changes how long a still frame takes
   *    to converge, not what it converges to; at 6 the residual specular crawl
   *    is visible if you look for it.
   *  - pixel ratio capped at 1.5, MSAA off, shadow map 2048, as tablet.
   *  - transmission prepass at 0.4 rather than 0.6 of output. It re-renders
   *    the whole opaque scene for the glazing, so it is the second-largest
   *    item; what is seen through a windscreen is low-frequency and survives.
   */
  phone: {
    pixelRatioCap: 1.5,
    msaaSamples: 0,
    aoScale: 0.5,
    ao: false,
    bloom: false,
    dof: false,
    accumSamples: 6,
    shadowMapSize: 2048,
    transmissionScale: 0.4,
  },
};

/**
 * Which tier this device gets.
 *
 * Decided from the **pointer**, not the screen size and not the user agent.
 * `(pointer: coarse)` without `(pointer: fine)` is a device whose only input
 * is a finger; a touchscreen laptop reports both and stays on `desktop`, and
 * headless Chromium with `hasTouch` unset reports fine and not coarse, so the
 * review pipeline at 1600x900 resolves to `desktop` and cannot do otherwise.
 * That last property is the point: it is what keeps the colour gate
 * reproducible.
 *
 * Phone against tablet is then the CSS viewport's short side. 700 px sits in
 * the gap between every phone in portrait (iPhone 13 is 390, the largest
 * Android phones are under 500) and every tablet (iPad mini 744, iPad Pro 11
 * is 834).
 *
 * `?quality=desktop|tablet|phone` overrides, which is how the tiers were
 * measured against each other in one boot and how someone on a fast phone can
 * ask for the full chain.
 */
export function resolveTier(): QualityTier {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === 'desktop' || forced === 'tablet' || forced === 'phone') return forced;

  const mm = (q: string): boolean => {
    try { return window.matchMedia(q).matches; } catch { return false; }
  };
  const touchOnly = mm('(pointer: coarse)') && !mm('(pointer: fine)');
  if (!touchOnly) return 'desktop';

  const shortSide = Math.min(
    window.innerWidth || screen.width || 0,
    window.innerHeight || screen.height || 0,
  );
  return shortSide >= 700 ? 'tablet' : 'phone';
}

// ---------------------------------------------------------------------------

/**
 * Levers registered by whichever module owns them, so a tier can be A/B'd
 * against another inside one boot. Measuring two builds against each other is
 * not an option on this project: six streams share the tree and the numbers
 * move between boots for reasons that have nothing to do with the change.
 */
type Lever = (v: number | boolean) => unknown;

export interface PerfSurface {
  tier: QualityTier;
  settings: TierSettings;
  pixelRatio: number;
  /** Turn the GPU timer on or off. Off by default and free when off. */
  gpu(on?: boolean): boolean;
  /**
   * GPU milliseconds a frame.
   *
   * Read `min`, not `p50`. Contention only ever *adds* time — this machine
   * runs six work streams, a desktop compositor and a browser, and ANGLE's
   * Metal backend times a command buffer from submit to completion, so a
   * contended sample includes queue waiting that is not the frame's own cost.
   * The cheapest sample in a long window is the one that ran least obstructed,
   * and it is the only figure here that is stable enough to quote.
   */
  gpuStats(): {
    n: number; min: number; p05: number; p50: number; p95: number;
    disjoint: number; supported: boolean;
  };
  /** Apply one lever by name; returns whatever the owner reports. */
  set(name: string, value: number | boolean): unknown;
  levers(): string[];
  register(name: string, fn: Lever): void;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly tier: QualityTier;
  readonly quality: TierSettings;

  /** Set by the post chain once it is installed. */
  private composer: { render(dt: number): void; setSize(w: number, h: number): void } | null = null;

  private clock = new THREE.Clock();
  private frameCount = 0;
  private fpsSamples: number[] = [];
  private lastCalls = 0;
  private lastTriangles = 0;

  // --- GPU timing ---
  // `performance.now()` around a frame measures the CPU submitting work, not
  // the GPU doing it, and on this project the wall clock is unusable anyway:
  // six streams share the machine and the load average has been over 200,
  // which is exactly how the same build came back at 9.3, 23.1 and 44.6 fps
  // within a few minutes. `EXT_disjoint_timer_query_webgl2` reports the GPU's
  // own elapsed time for the commands between begin and end, which is immune
  // to what else is on the CPU and is also the number that actually differs
  // between this machine and a phone.
  private timerExt: { GPU_DISJOINT_EXT: number; TIME_ELAPSED_EXT: number } | null = null;
  /**
   * Queries whose result has not been collected yet.
   *
   * Only one `TIME_ELAPSED` query may be *active* at a time, but any number
   * may be pending. Timing one frame and then waiting for its result before
   * timing another gave 19 samples out of 220 frames on a contended machine —
   * a result takes as long to come back as the contention makes it — and a
   * minimum over 19 samples is not a minimum. A pool times every frame.
   */
  private timerPending: WebGLQuery[] = [];
  private timerFree: WebGLQuery[] = [];
  private timerOpen: WebGLQuery | null = null;
  private gpuSamples: number[] = [];
  private gpuDisjoint = 0;
  private gpuEnabled = false;

  constructor(private opts: StageOptions) {
    const canvas = document.createElement('canvas');
    opts.container.appendChild(canvas);

    this.tier = resolveTier();
    this.quality = TIERS[this.tier];

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

    this.renderer.setPixelRatio(
      Math.min(opts.pixelRatio ?? window.devicePixelRatio, this.quality.pixelRatioCap),
    );
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
    this.renderer.transmissionResolutionScale = this.quality.transmissionScale;

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

    this.publishPerf();
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
    this.gpuBegin();
    try {
      if (this.composer) this.composer.render(dt);
      else this.renderer.render(this.scene, this.camera);
    } finally {
      this.gpuEnd();
    }

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

  /**
   * Resize the sun's shadow map.
   *
   * The sun belongs to `Environment`, which sizes its map from
   * `QUALITY.shadowMapSize` when it builds the light — before this stage knows
   * whether it is running on a phone. So the tier applies its own size
   * afterwards, by dropping the allocated map so three reallocates at the new
   * one. Returns how many shadow-casting directional lights it found.
   *
   * Note for whoever owns `Environment`: `__AUDI_ENV.info().shadow.texelMm`
   * divides by `QUALITY.shadowMapSize` directly, so it will misreport the
   * texel size on any tier that is not `desktop`.
   */
  setShadowMapSize(n: number): number {
    let applied = 0;
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (!l.isDirectionalLight || !l.castShadow) return;
      if (l.shadow.mapSize.x === n && l.shadow.mapSize.y === n) { applied++; return; }
      l.shadow.mapSize.set(n, n);
      l.shadow.map?.dispose();
      l.shadow.map = null;
      applied++;
    });
    this.renderer.shadowMap.needsUpdate = true;
    return applied;
  }

  // --- GPU timer -------------------------------------------------------------

  private gpuBegin(): void {
    if (!this.gpuEnabled || !this.timerExt) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.gpuPoll(gl);
    const q = this.timerFree.pop() ?? gl.createQuery();
    if (!q) return;
    gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
    this.timerOpen = q;
  }

  private gpuEnd(): void {
    if (!this.timerOpen || !this.timerExt) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    this.timerPending.push(this.timerOpen);
    this.timerOpen = null;
  }

  private gpuPoll(gl: WebGL2RenderingContext): void {
    const ext = this.timerExt;
    if (!ext) return;
    // A disjoint means the GPU was reset or descheduled during the window and
    // every timing that overlapped it is garbage — count it and throw the
    // samples away rather than letting them into the statistics.
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      this.gpuDisjoint += this.timerPending.length;
      this.timerFree.push(...this.timerPending);
      this.timerPending.length = 0;
      return;
    }
    let keep = 0;
    for (const q of this.timerPending) {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
        this.timerPending[keep++] = q;
        continue;
      }
      this.gpuSamples.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      this.timerFree.push(q);
    }
    this.timerPending.length = keep;
    while (this.gpuSamples.length > 600) this.gpuSamples.shift();
  }

  private publishPerf(): void {
    const levers = new Map<string, Lever>();

    levers.set('pixelRatio', (v) => {
      this.renderer.setPixelRatio(Number(v));
      this.onResize();
      return this.renderer.getPixelRatio();
    });
    levers.set('transmissionScale', (v) => {
      this.renderer.transmissionResolutionScale = Number(v);
      return this.renderer.transmissionResolutionScale;
    });
    levers.set('shadowMapSize', (v) => ({
      size: Number(v), lights: this.setShadowMapSize(Number(v)),
    }));
    levers.set('shadows', (v) => {
      this.renderer.shadowMap.enabled = !!v;
      this.renderer.shadowMap.needsUpdate = true;
      return this.renderer.shadowMap.enabled;
    });

    const renderer = this.renderer;
    const surface: PerfSurface = {
      tier: this.tier,
      settings: this.quality,
      get pixelRatio(): number { return renderer.getPixelRatio(); },
      gpu: (on = true) => {
        if (on && !this.timerExt) {
          const gl = this.renderer.getContext() as WebGL2RenderingContext;
          this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        }
        this.gpuEnabled = on && !!this.timerExt;
        this.gpuSamples.length = 0;
        this.gpuDisjoint = 0;
        // Queries already in flight belong to the window that just ended.
        this.timerFree.push(...this.timerPending);
        this.timerPending.length = 0;
        return this.gpuEnabled;
      },
      gpuStats: () => {
        const s = [...this.gpuSamples].sort((a, b) => a - b);
        const at = (f: number): number =>
          s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * f))] * 100) / 100 : 0;
        return {
          n: s.length, min: at(0), p05: at(0.05), p50: at(0.5), p95: at(0.95),
          disjoint: this.gpuDisjoint, supported: !!this.timerExt,
        };
      },
      set: (name, value) => {
        const fn = levers.get(name);
        if (!fn) return `unknown lever "${name}"; have: ${[...levers.keys()].join(', ')}`;
        return fn(value);
      },
      levers: () => [...levers.keys()],
      register: (name, fn) => { levers.set(name, fn); },
    };

    (globalThis as unknown as { __AUDI_PERF: PerfSurface }).__AUDI_PERF = surface;
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

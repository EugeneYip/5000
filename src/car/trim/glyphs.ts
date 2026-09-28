/**
 * Text as real, extruded geometry.
 *
 * The characters on a licence plate and the letters of a tailgate badge are
 * *pressed metal*: they stand proud, they have a draft angle, and the light
 * that catches their top edges is most of what tells you they are not a
 * sticker. A decal cannot do that, and the project forbids importing a font
 * file, so the path taken here is:
 *
 *   canvas fillText  →  binary mask  →  marching-squares contours
 *   →  simplify  →  THREE.Shape (+ holes)  →  bevelled extrusion
 *
 * which gets real outlines out of whatever condensed grotesque the platform
 * actually has, with no asset.
 *
 * The tailgate model badge is the exception. Its two faces — the squared
 * numerals and the `Audi` wordmark — exist on no platform, and substituting a
 * grotesque for them got the *width* wrong by a third as well as the shapes.
 * So the bottom of this file replaces `fillText` with a small drawn glyph
 * table and feeds the identical mask → contour → emboss pipeline.
 */

import * as THREE from 'three';

export type Poly = Array<[number, number]>;

export interface Mask {
  data: Uint8Array;
  w: number;
  h: number;
}

/**
 * A condensed grotesque, in the order of how close each is to US plate
 * lettering. Whatever resolves is then squeezed to an exact target width, so
 * the layout is identical on every platform even if the face is not.
 */
export const PLATE_FONT_STACK =
  `"DIN Condensed", "DIN Alternate", "Haettenschweiler", "Arial Narrow", ` +
  `"Helvetica Neue Condensed", "Liberation Sans Narrow", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/** Period Audi badge script: a plain, slightly wide grotesque in caps. */
export const BADGE_FONT_STACK = `"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif`;

/**
 * Fallback only. The tailgate model designation is drawn, not set — see
 * `audiScriptGeometry` below. This stack is what an unsupported character
 * falls through to so a string change can never silently drop a glyph.
 */
export const BADGE_MODEL_FONT_STACK =
  `"DIN Alternate", "PT Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`;

/**
 * The small engine/drivetrain scripts — `fuel injection`, and the same family
 * as the `turbo` and `quattro` on `BAT-R`.
 *
 * Read off that frame at 2048 px: lowercase, obliqued, **geometric** — round
 * bowls, near-circular `o`, letters almost touching. That is a slanted
 * geometric sans, not a connected copperplate, and not the upright camel-case
 * `FuelInjection` this used to render. Futura's oblique is the closest
 * available face; the tight tracking is as important as the shapes.
 */
export const BADGE_SCRIPT_FONT_STACK =
  `"Futura", "Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif`;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Cap height of the resolved face, in pixels, for a given `font` size. */
export function capHeightPx(ctx: CanvasRenderingContext2D): number {
  const m = ctx.measureText('H');
  const asc = m.actualBoundingBoxAscent;
  return Number.isFinite(asc) && asc > 0 ? asc : 0.7 * parseFloat(ctx.font);
}

// ---------------------------------------------------------------------------
// Marching squares
// ---------------------------------------------------------------------------

interface Node { x: number; y: number; links: string[] }

const CASES: ReadonlyArray<ReadonlyArray<readonly ['T' | 'R' | 'B' | 'L', 'T' | 'R' | 'B' | 'L']>> = [
  [], [['L', 'T']], [['T', 'R']], [['L', 'R']],
  [['R', 'B']], [], [['T', 'B']], [['L', 'B']],
  [['B', 'L']], [['T', 'B']], [], [['R', 'B']],
  [['L', 'R']], [['T', 'R']], [['L', 'T']], [],
];

/**
 * Closed iso-contours of `mask` at `threshold`, in pixel coordinates.
 * The mask must have a zero border, which `textMask` guarantees.
 */
export function contours(mask: Mask, threshold = 128): Poly[] {
  const { data, w, h } = mask;
  const nodes = new Map<string, Node>();

  const v = (x: number, y: number): number => data[y * w + x];
  const touch = (key: string, x: number, y: number): Node => {
    let n = nodes.get(key);
    if (!n) { n = { x, y, links: [] }; nodes.set(key, n); }
    return n;
  };

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = v(x, y), tr = v(x + 1, y), br = v(x + 1, y + 1), bl = v(x, y + 1);
      let code = 0;
      if (tl >= threshold) code |= 1;
      if (tr >= threshold) code |= 2;
      if (br >= threshold) code |= 4;
      if (bl >= threshold) code |= 8;
      if (code === 0 || code === 15) continue;

      const mix = (a: number, b: number): number => {
        const d = b - a;
        return Math.abs(d) < 1e-6 ? 0.5 : (threshold - a) / d;
      };
      const edge = (e: 'T' | 'R' | 'B' | 'L'): { key: string; x: number; y: number } => {
        switch (e) {
          case 'T': return { key: `h${x},${y}`, x: x + mix(tl, tr), y };
          case 'B': return { key: `h${x},${y + 1}`, x: x + mix(bl, br), y: y + 1 };
          case 'L': return { key: `v${x},${y}`, x, y: y + mix(tl, bl) };
          default: return { key: `v${x + 1},${y}`, x: x + 1, y: y + mix(tr, br) };
        }
      };

      let pairs = CASES[code] as ReadonlyArray<readonly ['T' | 'R' | 'B' | 'L', 'T' | 'R' | 'B' | 'L']>;
      if (code === 5 || code === 10) {
        // Saddle: the cell centre decides which way the contour splits.
        const centreIn = (tl + tr + br + bl) / 4 >= threshold;
        const joined = code === 5 ? centreIn : !centreIn;
        pairs = joined
          ? ([['L', 'B'], ['T', 'R']] as const)
          : ([['L', 'T'], ['R', 'B']] as const);
      }

      for (const [ea, eb] of pairs) {
        const a = edge(ea), b = edge(eb);
        const na = touch(a.key, a.x, a.y);
        const nb = touch(b.key, b.x, b.y);
        na.links.push(b.key);
        nb.links.push(a.key);
      }
    }
  }

  const out: Poly[] = [];
  const seen = new Set<string>();
  for (const [startKey, startNode] of nodes) {
    if (seen.has(startKey) || startNode.links.length === 0) continue;
    const loop: Poly = [];
    let key = startKey;
    let prev = '';
    for (let guard = 0; guard < nodes.size + 4; guard++) {
      const n = nodes.get(key);
      if (!n || seen.has(key)) break;
      seen.add(key);
      loop.push([n.x, n.y]);
      const next = n.links.find((k) => k !== prev && !seen.has(k)) ?? n.links.find((k) => k !== prev);
      if (next === undefined) break;
      prev = key;
      key = next;
      if (key === startKey) break;
    }
    if (loop.length >= 6) out.push(loop);
  }
  return out;
}

export function area(poly: Poly): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] * poly[i][1]) - (poly[i][0] * poly[j][1]);
  }
  return a / 2;
}

function inside(pt: readonly [number, number], poly: Poly): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Ramer–Douglas–Peucker. Contours come out of a raster staircased. */
export function simplify(poly: Poly, eps: number): Poly {
  if (poly.length < 5) return poly;
  const keep = new Uint8Array(poly.length);
  keep[0] = 1;
  keep[poly.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, poly.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 <= i0 + 1) continue;
    const [x0, y0] = poly[i0];
    const [x1, y1] = poly[i1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1, bestD = eps;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((poly[i][0] - x0) * dy - (poly[i][1] - y0) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  const out: Poly = [];
  for (let i = 0; i < poly.length; i++) if (keep[i]) out.push(poly[i]);
  return out.length >= 4 ? out : poly;
}

// ---------------------------------------------------------------------------
// Mask → shapes → geometry
// ---------------------------------------------------------------------------

export interface ShapeOpts {
  /** Metres per mask pixel. */
  scale: number;
  /** Pixel coordinates that map to geometry (0, 0). */
  originPx: readonly [number, number];
  /** RDP tolerance in pixels. */
  epsilon?: number;
  /** Discard specks smaller than this, in px². */
  minArea?: number;
}

export function shapesFromMask(mask: Mask, o: ShapeOpts): THREE.Shape[] {
  const eps = o.epsilon ?? 0.75;
  const minArea = o.minArea ?? 12;
  const loops = contours(mask)
    .map((p) => simplify(p, eps))
    .filter((p) => Math.abs(area(p)) >= minArea);

  // Nesting depth decides outer vs hole; winding from marching squares is not
  // reliable enough to lean on, containment is.
  const depth = loops.map((p, i) =>
    loops.reduce((d, q, j) => (i !== j && Math.abs(area(q)) > Math.abs(area(p)) && inside(p[0], q) ? d + 1 : d), 0),
  );

  const [ox, oy] = o.originPx;
  const toV2 = (p: Poly): THREE.Vector2[] =>
    p.map(([x, y]) => new THREE.Vector2((x - ox) * o.scale, -(y - oy) * o.scale));

  const shapes: THREE.Shape[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depth[i] % 2 !== 0) continue;
    const s = new THREE.Shape(toV2(loops[i]));
    for (let j = 0; j < loops.length; j++) {
      if (depth[j] !== depth[i] + 1 || !inside(loops[j][0], loops[i])) continue;
      // Only the immediately-enclosing outer owns the hole.
      const parent = loops.reduce(
        (best, q, k) => (k !== j && depth[k] === depth[i] && inside(loops[j][0], q)
          && Math.abs(area(q)) < Math.abs(area(loops[best])) ? k : best),
        i,
      );
      if (parent === i) s.holes.push(new THREE.Path(toV2(loops[j])));
    }
    shapes.push(s);
  }
  return shapes;
}

export interface EmbossOpts {
  /** How far the characters stand proud of the face. */
  depth: number;
  /** The little draft the die leaves on the flank. */
  bevel?: number;
  /**
   * How far the solid is carried BEHIND the face. Invisible, but it moves the
   * back faces — which is what a `shadowSide: BackSide` material writes into
   * the shadow map — clear of the surface the characters sit on, and that is
   * the difference between clean relief and a rash of self-shadow speckle.
   */
  sink?: number;
}

export function embossGeometry(shapes: THREE.Shape[], o: EmbossOpts): THREE.BufferGeometry {
  const bevel = o.bevel ?? Math.min(o.depth * 0.3, 0.0006);
  const sink = o.sink ?? 0;
  const g = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(o.depth + sink - bevel, 1e-4),
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 1,
    steps: 1,
  });
  if (sink !== 0) g.translate(0, 0, -sink);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Laying text out by hand
// ---------------------------------------------------------------------------

export interface RunOpts {
  font: string;
  /** Extra tracking between glyphs, as a fraction of cap height. */
  tracking?: number;
  /** Horizontal squeeze applied to every glyph. */
  condense?: number;
}

export interface Glyph { ch: string; x: number; advance: number }

/** Measure a string glyph by glyph so tracking and group gaps are exact. */
export function layout(ctx: CanvasRenderingContext2D, text: string, o: RunOpts): { glyphs: Glyph[]; width: number } {
  ctx.font = o.font;
  const cap = capHeightPx(ctx);
  const track = (o.tracking ?? 0) * cap;
  const condense = o.condense ?? 1;
  const glyphs: Glyph[] = [];
  let x = 0;
  for (const ch of text) {
    const adv = ctx.measureText(ch).width * condense;
    glyphs.push({ ch, x, advance: adv });
    x += adv + track;
  }
  return { glyphs, width: Math.max(x - track, 0) };
}

/** Draw a measured run with the baseline at `baselineY`, left edge at `x0`. */
export function drawRun(
  ctx: CanvasRenderingContext2D,
  glyphs: readonly Glyph[],
  x0: number,
  baselineY: number,
  condense: number,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(x0 + g.x, baselineY);
    ctx.scale(condense, 1);
    ctx.fillText(g.ch, 0, 0);
    ctx.restore();
  }
}

/** Read a canvas back as a single-channel mask, padded so no contour is open. */
export function maskFromCanvas(c: HTMLCanvasElement): Mask {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const w = c.width + 4;
  const h = c.height + 4;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      data[(y + 2) * w + (x + 2)] = img[(y * c.width + x) * 4 + 3];
    }
  }
  return { data, w, h };
}

/**
 * Extruded caps for a short badge string. Returns geometry centred on its own
 * bounding box, lying in XY and facing +Z, sized so its cap height is `cap`.
 */
export function badgeText(
  text: string,
  cap: number,
  opts: {
    depth?: number; tracking?: number; condense?: number; weight?: string; font?: string;
    /** CSS font-style — `italic` for the obliqued engine scripts. */
    style?: string;
  } = {},
): THREE.BufferGeometry {
  const PX = 320;
  const probe = makeCanvas(8, 8).getContext('2d')!;
  const font = `${opts.style ? `${opts.style} ` : ''}${opts.weight ?? '500'} ${PX}px ${opts.font ?? BADGE_FONT_STACK}`;
  probe.font = font;
  const capPx = capHeightPx(probe);
  const condense = opts.condense ?? 1;
  const { glyphs, width } = layout(probe, text, { font, tracking: opts.tracking ?? 0.06, condense });

  const pad = Math.round(capPx * 0.35);
  const c = makeCanvas(Math.ceil(width) + pad * 2, Math.ceil(capPx * 1.6) + pad * 2);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  const baseline = pad + Math.round(capPx * 1.15);
  drawRun(ctx, glyphs, pad, baseline, condense);

  const mask = maskFromCanvas(c);
  const scale = cap / capPx;
  const shapes = shapesFromMask(mask, {
    scale,
    originPx: [pad + 2 + width / 2, baseline + 2 - capPx / 2],
    epsilon: 0.6,
  });
  const g = embossGeometry(shapes, { depth: opts.depth ?? 0.0022, bevel: Math.min((opts.depth ?? 0.0022) * 0.28, 0.0005) });
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------------------
// The 1980s Audi tailgate script, drawn rather than set
// ---------------------------------------------------------------------------

/**
 * `Audi 5000 S` is two typefaces, and neither is on any platform this runs on.
 *
 * Measured on `scratchpad/ref3/bat3_badge_audi5000cs_tailgate.jpg` (2048 px
 * across one badge) and calibrated against the two dead-on frames, which are
 * the only ones with no foreshortening:
 *
 *   · **The numerals are rounded rectangles, not circles.** A `0` measures
 *     1.22 × 1.00 cap with a rectangular counter — 1.7× the width of a
 *     grotesque zero — on a monoline stroke with flat terminals. Advance is
 *     1.45 cap, so a quarter of a character of air between digits.
 *   · **`Audi` is a separate, lighter, calligraphic wordmark**: a leaning `A`
 *     with a long shallow right leg and a low crossbar, a wide flat-oval `d`
 *     bowl with a diagonal flag for an ascender, and a **dotless `ı`**.
 *
 * The consequence is mostly horizontal. Set in DIN Alternate the run came out
 * 256 mm long at a 30.5 mm cap; the reference's own `5000 CD` is 8.97 cap
 * widths long (measured 167 px over a 19.5 px cap on one frame, 244 over 26 on
 * the other), which puts `Audi 5000 S` at **12.7 cap widths ≈ 390 mm**. The
 * cap height itself was already right — `CRITIQUE-3.md` §5's 40 mm does not
 * reproduce on either dead-on frame, both of which give 28–31 mm.
 *
 * Drawing is cheaper than it looks because the pipeline below already turns a
 * canvas into outlines with holes: these functions stroke centre-lines onto
 * the same canvas `fillText` would have written to, and everything downstream
 * is unchanged.
 */

/** Stroke weights, as a fraction of cap height. The wordmark is the lighter. */
const WORDMARK_STROKE = 0.145;
const NUMERAL_STROKE = 0.215;
/** Width of a numeral or a squared capital, and the advance between them. */
const NUMERAL_W = 1.22;
const NUMERAL_ADV = 1.45;
/** x-height of the wordmark's lowercase, measured 0.641 of the `A`. */
const X_HEIGHT = 0.641;

/**
 * A glyph's drawing instructions in a unit box: baseline at y = 0, cap at
 * y = 1, pen starting at x = 0, y up. `advance` is where the next pen lands —
 * `A` deliberately draws past its own advance, because on the real badge the
 * `A`'s long right leg tucks under the `u`.
 */
interface DrawnGlyph {
  advance: number;
  draw(p: Pen): void;
}

/** Unit-box drawing surface: converts to pixels and strokes. */
class Pen {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly x0: number,
    private readonly baseline: number,
    private readonly cap: number,
  ) {}

  private px(x: number): number { return this.x0 + x * this.cap; }
  private py(y: number): number { return this.baseline - y * this.cap; }

  /** Move the pen origin for the next glyph. */
  advanceBy(dx: number): Pen {
    return new Pen(this.ctx, this.x0 + dx * this.cap, this.baseline, this.cap);
  }

  private begin(weight: number): void {
    this.ctx.lineWidth = weight * this.cap;
    // Butt caps and round joins: the reference's terminals are cut square
    // across the stroke, and its corners are radiused.
    this.ctx.lineCap = 'butt';
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();
  }

  /** An open polyline with every interior corner radiused by `r`. */
  polyline(pts: ReadonlyArray<readonly [number, number]>, r: number, weight: number): void {
    this.begin(weight);
    this.ctx.moveTo(this.px(pts[0][0]), this.py(pts[0][1]));
    for (let i = 1; i < pts.length - 1; i++) {
      this.ctx.arcTo(
        this.px(pts[i][0]), this.py(pts[i][1]),
        this.px(pts[i + 1][0]), this.py(pts[i + 1][1]),
        r * this.cap,
      );
    }
    const last = pts[pts.length - 1];
    this.ctx.lineTo(this.px(last[0]), this.py(last[1]));
    this.ctx.stroke();
  }

  /** A closed rounded rectangle, given its two opposite centre-line corners. */
  roundRect(xa: number, ya: number, xb: number, yb: number, r: number, weight: number): void {
    const [ax, bx] = [this.px(xa), this.px(xb)];
    const [ay, by] = [this.py(ya), this.py(yb)];
    const rr = r * this.cap;
    this.begin(weight);
    this.ctx.moveTo((ax + bx) / 2, ay);
    this.ctx.arcTo(bx, ay, bx, by, rr);
    this.ctx.arcTo(bx, by, ax, by, rr);
    this.ctx.arcTo(ax, by, ax, ay, rr);
    this.ctx.arcTo(ax, ay, bx, ay, rr);
    this.ctx.closePath();
    this.ctx.stroke();
  }

  /** A closed ellipse on its bounding centre-line box. */
  oval(xa: number, ya: number, xb: number, yb: number, weight: number): void {
    this.begin(weight);
    this.ctx.ellipse(
      this.px((xa + xb) / 2), this.py((ya + yb) / 2),
      Math.abs(this.px(xb) - this.px(xa)) / 2, Math.abs(this.py(yb) - this.py(ya)) / 2,
      0, 0, Math.PI * 2,
    );
    this.ctx.stroke();
  }
}

const S = NUMERAL_STROKE;
const W = NUMERAL_W;
/** Inset of a numeral's centre-line from its cap box. */
const IN = S / 2;

const GLYPHS: Record<string, DrawnGlyph> = {
  ' ': { advance: 0.64, draw: () => {} },

  // --- the wordmark ------------------------------------------------------
  // Leaning triangle: a short steep left leg, a long shallow right leg that
  // runs on past the advance and under the `u`, and a crossbar low down.
  A: {
    advance: 1.374,
    draw: (p) => {
      p.polyline([[0.00, 0.00], [0.242, 1.00], [1.513, 0.011]], 0.06, WORDMARK_STROKE);
      p.polyline([[0.055, 0.228], [0.930, 0.228]], 0, WORDMARK_STROKE);
    },
  },
  u: {
    advance: 1.375,
    draw: (p) => {
      p.polyline(
        [[0.00, X_HEIGHT], [0.00, 0.085], [1.073, 0.085], [1.073, X_HEIGHT]],
        0.26, WORDMARK_STROKE,
      );
    },
  },
  // A wide flat bowl with the ascender laid across it as a diagonal flag.
  // This is the detail that dates the badge: the stem is not vertical.
  //
  // The flag stops on the bowl's right flank rather than running to the
  // measured join at (1.142, 0.370). Drawn to the letter it crosses the
  // counter at its widest and the `d` closes up into a filled almond — the
  // reference keeps a clear crescent under the diagonal, and a stroke this
  // heavy needs the extra 0.1 of a cap to leave one.
  d: {
    advance: 1.462,
    draw: (p) => {
      p.oval(0.00, 0.085, 1.271, X_HEIGHT, WORDMARK_STROKE);
      p.polyline([[0.260, 0.946], [1.205, 0.497]], 0, WORDMARK_STROKE);
    },
  },
  // Dotless. There is no dot on the badge and putting one there is the single
  // most visible way to get this script wrong.
  i: {
    advance: 0.300,
    draw: (p) => {
      p.polyline([[0.0695, 0.652], [0.0695, 0.00]], 0, WORDMARK_STROKE);
    },
  },

  // --- the squared model face --------------------------------------------
  '0': {
    advance: NUMERAL_ADV,
    draw: (p) => p.roundRect(IN, IN, W - IN, 1 - IN, 0.30, S),
  },
  '5': {
    advance: NUMERAL_ADV,
    draw: (p) => {
      p.polyline(
        [[W - IN, 1 - IN], [IN, 1 - IN], [IN, 0.560], [W - IN, 0.560], [W - IN, IN], [0.22, IN]],
        0.055, S,
      );
      // The bowl's corners are much softer than the shoulder above them, so
      // they get their own pass rather than one radius for the whole path.
      p.polyline([[IN, 0.560], [W - IN, 0.560], [W - IN, IN], [0.22, IN]], 0.26, S);
    },
  },
  S: {
    advance: NUMERAL_ADV,
    draw: (p) => {
      p.polyline(
        [
          [W - IN, 0.800], [W - IN, 1 - IN], [IN, 1 - IN], [IN, 0.500],
          [W - IN, 0.500], [W - IN, IN], [IN, IN], [IN, 0.240],
        ],
        0.22, S,
      );
    },
  },
  C: {
    advance: NUMERAL_ADV,
    draw: (p) => {
      p.polyline(
        [[W - IN, 0.760], [W - IN, 1 - IN], [IN, 1 - IN], [IN, IN], [W - IN, IN], [W - IN, 0.240]],
        0.28, S,
      );
    },
  },
  D: {
    advance: NUMERAL_ADV,
    draw: (p) => {
      p.polyline(
        [[IN, IN], [IN, 1 - IN], [W - IN, 1 - IN], [W - IN, IN], [IN, IN], [IN, 0.5]],
        0.30, S,
      );
    },
  },
};

/**
 * Lay out and draw a badge string, returning its total advance in cap units.
 * Unknown characters fall through to `fillText` in `BADGE_MODEL_FONT_STACK`,
 * so adding a character to the string can never silently drop it.
 */
function drawAudiScript(
  ctx: CanvasRenderingContext2D,
  text: string,
  x0: number,
  baseline: number,
  cap: number,
): number {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  let pen = new Pen(ctx, x0, baseline, cap);
  let width = 0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      g.draw(pen);
      pen = pen.advanceBy(g.advance);
      width += g.advance;
    } else {
      ctx.save();
      ctx.font = `500 ${cap / 0.72}px ${BADGE_MODEL_FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const adv = ctx.measureText(ch).width / cap;
      ctx.fillText(ch, x0 + width * cap, baseline);
      ctx.restore();
      pen = pen.advanceBy(adv);
      width += adv;
    }
  }
  ctx.restore();
  return width;
}

/** Total advance of a drawn run, in cap units. */
export function audiScriptWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += GLYPHS[ch]?.advance ?? NUMERAL_ADV;
  return w;
}

/**
 * The drawn counterpart of `badgeText`: same mask → contour → emboss pipeline,
 * but the letterforms come from `GLYPHS` instead of from whatever grotesque
 * the platform happens to resolve. Geometry comes back centred on its own
 * bounding box, lying in XY and facing +Z, with cap height `cap` metres.
 */
export function audiScriptGeometry(
  text: string,
  cap: number,
  opts: { depth?: number } = {},
): THREE.BufferGeometry {
  // 200 px of cap is ~0.3 % contour precision and a quarter of the
  // marching-squares work that `badgeText`'s 320 would cost on a run this
  // long — `Audi 5000 S` is nearly thirteen cap widths.
  const capPx = 200;
  const runW = audiScriptWidth(text);
  const pad = Math.round(capPx * 0.35);
  // Tall enough for the `A` apex at 1.0 and for a stroke half-width below the
  // baseline, both with the bevel the emboss adds.
  const c = makeCanvas(Math.ceil(runW * capPx) + pad * 2, Math.ceil(capPx * 1.5) + pad * 2);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const baseline = pad + Math.round(capPx * 1.12);
  drawAudiScript(ctx, text, pad, baseline, capPx);

  const mask = maskFromCanvas(c);
  const shapes = shapesFromMask(mask, {
    scale: cap / capPx,
    originPx: [pad + 2 + (runW * capPx) / 2, baseline + 2 - capPx / 2],
    epsilon: 0.8,
  });
  const depth = opts.depth ?? 0.0022;
  const g = embossGeometry(shapes, { depth, bevel: Math.min(depth * 0.28, 0.0005) });
  g.computeBoundingBox();
  return g;
}

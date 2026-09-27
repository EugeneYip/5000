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
 * actually has, with no asset and no hand-drawn glyph table.
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
 * The tailgate model designation — `Audi 5000 S`.
 *
 * `docs/CRITIQUE-2.md` §12: the real badge is "a distinctive squared-off face
 * with wide letter spacing", not the modern grotesque this was set in. The
 * squared industrial face the 1980s badge actually derives from (Eurostile /
 * Microgramma) is not on any platform this runs on — probed, it falls straight
 * through to the default. **DIN Alternate** is: same German-industrial
 * lineage, flat terminals, and the straight-sided zeros `BAT-R` shows in
 * `5000 CD` at 2048 px. The spacing is carried by `tracking`, not the face.
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

/**
 * The licence plate — `A2M 909`, Pennsylvania, as photographed.
 *
 * Three things separate a plate from a sticker of a plate, and all three are
 * built here:
 *
 *  1. the characters are **embossed** — pressed out of the blank, so their top
 *     faces are the only part that took paint and their flanks catch the sun;
 *  2. the blank is **bowed** — nothing bolted through four corners stays flat;
 *  3. the graphic is **printed at plate resolution**, 2048 px across 305 mm,
 *     i.e. 6.7 px per millimetre, which still resolves in the `platecam` crop.
 *
 * The face texture and the embossed geometry are generated from the *same*
 * canvas pass, so the paint and the pressing register exactly. The whole plate
 * is therefore one material and one draw call: the raised characters take
 * their colour from the texture underneath them, because their UVs are their
 * own position on the plate.
 *
 * See `docs/REFERENCE-PHOTO.md` for where the colours and the text come from.
 */

import * as THREE from 'three';
import { PLATE, QUALITY } from '@/spec';
import type { BuildContext } from '@/types';
import {
  BADGE_FONT_STACK, PLATE_FONT_STACK, capHeightPx, drawRun, embossGeometry,
  layout, makeCanvas, maskFromCanvas, shapesFromMask,
} from './glyphs';
import { bolt, clamp, merge, mesh } from './util';
import type { PrintedOptions } from '@/materials/printed';

const W = PLATE.widthM;
const H = PLATE.heightM;
const HW = W / 2;
const HH = H / 2;

/** 2048 px across the plate's 305 mm — 6.7 px/mm, about a real press proof. */
const TEX_W = 2048;
const TEX_H = Math.round((TEX_W * H) / W);
const PPM = TEX_W / W;

/** Everything below is a fraction of the plate, so the layout is one place. */
const LAYOUT = {
  /** Embossed rim: inset from the edge, and the width of the rib itself. */
  rimInset: 0.0062,
  rimWidth: 0.0042,
  /** State name across the top. */
  stateCap: 0.0158,
  stateBaselineFromTop: 0.0292,
  /** The registration itself. */
  charCap: 0.0625,
  charBaselineFromTop: 0.1288,
  runWidth: 0.2420,
  tracking: 0.055,
  /** Keystone separator between the groups. */
  keystoneW: 0.0300,
  keystoneH: 0.0430,
  keystoneGap: 0.0098,
  /** How far the characters stand out of the blank. */
  emboss: 0.0029,
  /** Bolt holes. */
  boltX: 0.1345,
  boltY: 0.0600,
  boltHoleR: 0.0040,
  /** Blank thickness and how much it bows. */
  gauge: 0.0013,
  bow: 0.0026,
} as const;

/**
 * Draft on the pressed flank. The roller only inks the top faces on a real
 * plate, but the flanks here are inked too (the graphic is dilated to match):
 * a white sliver appearing along one edge of a character because the paint and
 * the pressing disagreed by a texel is a far worse artefact than a flank that
 * is a shade too dark.
 */
const EMBOSS_DRAFT = 0.0009;

/**
 * The sheeting. `retroGain` is in units of a Lambertian surface of the same
 * albedo seen on the retroreflection axis, so 1.0 would be ordinary white
 * paint and these two numbers say the face returns a few times that when the
 * light is behind the lens.
 *
 * Both were swept against the one thing that can settle them — the
 * white-balanced photograph's plate face at 236, read through
 * `tools/sheet.py`. The lobe is not the sheeting's real divergence and cannot
 * be; `materials/printed.ts` explains why in detail. Neither belongs in
 * `spec.ts`: they are not factory figures, they are an appearance model with
 * a measurement behind it, and the measurement is in `docs/REFERENCE-PHOTO.md`.
 *
 * They are also **not independent of how deep the grove's shade is**, which
 * is `src/scene`'s to set. Whoever takes the shade down next should re-read
 * the plate against 236 — `__AUDI_RETRO.set(gain, lobe)` sweeps it live.
 */
const RETRO_GAIN = 1.2;
const RETRO_LOBE = 3;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const FACE = hex(PLATE.faceColor);
const INK = hex(PLATE.textColor);
const HOLE = hex(PLATE.boltHoleColor);

/** A plate bolted at four corners is never flat; it bellies out in the middle. */
function bow(x: number, y: number): number {
  const u = clamp(x / HW, -1, 1);
  const v = clamp(y / HH, -1, 1);
  return LAYOUT.bow * (1 - u * u) * (1 - v * v) * (1 + 0.22 * u * v) + 0.0004 * u;
}

// ---------------------------------------------------------------------------
// Shared layout: the graphic and the pressing are measured once, together.
// ---------------------------------------------------------------------------

interface Run {
  font: string;
  condense: number;
  leftX: number;
  rightX: number;
  baselineY: number;
  left: ReturnType<typeof layout>;
  right: ReturnType<typeof layout>;
  keystoneCx: number;
  keystoneCy: number;
}

const PX = 512;

function measure(): Run {
  const probe = makeCanvas(8, 8).getContext('2d')!;
  const font = `700 ${PX}px ${PLATE_FONT_STACK}`;
  probe.font = font;
  const capPx = capHeightPx(probe);

  const charCapPx = LAYOUT.charCap * PPM;
  const sizePx = (PX * charCapPx) / capPx;
  const sized = `700 ${sizePx.toFixed(2)}px ${PLATE_FONT_STACK}`;

  // Squeeze whichever face resolved until the two groups exactly fill the run
  // minus the keystone and its gaps. The layout is then platform-independent.
  const groups = (LAYOUT.runWidth - LAYOUT.keystoneW - 2 * LAYOUT.keystoneGap) * PPM;
  const natural = layout(probe, PLATE.left + PLATE.right, { font: sized, tracking: LAYOUT.tracking, condense: 1 });
  const condense = groups / Math.max(natural.width, 1);

  const left = layout(probe, PLATE.left, { font: sized, tracking: LAYOUT.tracking, condense });
  const right = layout(probe, PLATE.right, { font: sized, tracking: LAYOUT.tracking, condense });

  const runPx = LAYOUT.runWidth * PPM;
  const leftX = (TEX_W - runPx) / 2;
  const keystoneCx = leftX + left.width + LAYOUT.keystoneGap * PPM + (LAYOUT.keystoneW * PPM) / 2;
  const rightX = keystoneCx + (LAYOUT.keystoneW * PPM) / 2 + LAYOUT.keystoneGap * PPM;
  const baselineY = LAYOUT.charBaselineFromTop * PPM;

  return {
    font: sized, condense, leftX, rightX, baselineY, left, right,
    keystoneCx, keystoneCy: baselineY - charCapPx / 2,
  };
}

/** The Pennsylvania keystone that separates the two groups. */
function keystonePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, grow = 0): void {
  const a = w / 2 + grow;
  const b = h / 2 + grow;
  // Full width across the top, straight for the upper third, then shouldered
  // in to a narrower flat base — the Pennsylvania keystone, not a triangle.
  const pts: Array<[number, number]> = [
    [-a, -b], [a, -b], [a, -0.22 * b], [0.90 * a, 0.02 * b],
    [0.46 * a, b], [-0.46 * a, b], [-0.90 * a, 0.02 * b], [-a, -0.22 * b],
  ];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x, cy + y) : ctx.lineTo(cx + x, cy + y)));
  ctx.closePath();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * The printed face. Characters are drawn slightly heavier here than they are
 * pressed, so the raised flanks always sample ink rather than a white halo.
 */
function drawFace(run: Run): HTMLCanvasElement {
  const c = makeCanvas(TEX_W, TEX_H);
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = FACE;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Aged, slightly uneven enamel. Barely there, but a dead-flat white face is
  // the tell that gives away every rendered plate.
  ctx.save();
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * TEX_W;
    const y = Math.random() * TEX_H;
    ctx.globalAlpha = 0.018 + Math.random() * 0.03;
    ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  ctx.globalAlpha = 0.05;
  const grime = ctx.createLinearGradient(0, TEX_H * 0.58, 0, TEX_H);
  grime.addColorStop(0, 'rgba(60,54,44,0)');
  grime.addColorStop(1, 'rgba(60,54,44,0.85)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.restore();

  const dilate = Math.ceil(EMBOSS_DRAFT * PPM) + 1;
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';

  // Embossed rim.
  const inset = LAYOUT.rimInset * PPM;
  const rib = LAYOUT.rimWidth * PPM;
  ctx.lineWidth = rib + dilate * 2;
  roundRectPath(ctx, inset + rib / 2, inset + rib / 2, TEX_W - 2 * inset - rib, TEX_H - 2 * inset - rib,
    PLATE.cornerRadius * PPM - inset);
  ctx.stroke();

  // State name.
  const stateProbe = `600 ${PX}px ${BADGE_FONT_STACK}`;
  ctx.font = stateProbe;
  const stateCapPx = capHeightPx(ctx);
  const stateSize = (PX * LAYOUT.stateCap * PPM) / stateCapPx;
  const stateFont = `600 ${stateSize.toFixed(2)}px ${BADGE_FONT_STACK}`;
  const state = layout(ctx, PLATE.state, { font: stateFont, tracking: 0.30, condense: 0.92 });
  ctx.font = stateFont;
  ctx.lineWidth = dilate * 2;
  ctx.save();
  drawRun(ctx, state.glyphs, (TEX_W - state.width) / 2, LAYOUT.stateBaselineFromTop * PPM, 0.92);
  ctx.restore();

  // Registration.
  ctx.font = run.font;
  ctx.save();
  ctx.lineWidth = dilate * 2;
  for (const pass of ['stroke', 'fill'] as const) {
    ctx.save();
    for (const g of [...run.left.glyphs.map((g) => ({ g, x0: run.leftX })), ...run.right.glyphs.map((g) => ({ g, x0: run.rightX }))]) {
      ctx.save();
      ctx.translate(g.x0 + g.g.x, run.baselineY);
      ctx.scale(run.condense, 1);
      if (pass === 'stroke') ctx.strokeText(g.g.ch, 0, 0); else ctx.fillText(g.g.ch, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();

  keystonePath(ctx, run.keystoneCx, run.keystoneCy, LAYOUT.keystoneW * PPM, LAYOUT.keystoneH * PPM, dilate);
  ctx.fill();

  // Bolt holes: a dark hole with the shadow the bolt sits in.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = TEX_W / 2 + sx * LAYOUT.boltX * PPM;
      const cy = TEX_H / 2 - sy * LAYOUT.boltY * PPM;
      const r = LAYOUT.boltHoleR * PPM;
      const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 2.3);
      g.addColorStop(0, 'rgba(40,34,26,0.55)');
      g.addColorStop(1, 'rgba(40,34,26,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r * 2.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = HOLE;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  return c;
}

/** The pressing mask: exactly what stands proud, drawn at the pressed size. */
function drawEmbossMask(run: Run): HTMLCanvasElement {
  const c = makeCanvas(TEX_W, TEX_H);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';

  const inset = LAYOUT.rimInset * PPM;
  const rib = LAYOUT.rimWidth * PPM;
  ctx.lineWidth = rib;
  roundRectPath(ctx, inset + rib / 2, inset + rib / 2, TEX_W - 2 * inset - rib, TEX_H - 2 * inset - rib,
    PLATE.cornerRadius * PPM - inset);
  ctx.stroke();

  const stateProbe = `600 ${PX}px ${BADGE_FONT_STACK}`;
  ctx.font = stateProbe;
  const stateCapPx = capHeightPx(ctx);
  const stateSize = (PX * LAYOUT.stateCap * PPM) / stateCapPx;
  const stateFont = `600 ${stateSize.toFixed(2)}px ${BADGE_FONT_STACK}`;
  const state = layout(ctx, PLATE.state, { font: stateFont, tracking: 0.30, condense: 0.92 });
  ctx.font = stateFont;
  drawRun(ctx, state.glyphs, (TEX_W - state.width) / 2, LAYOUT.stateBaselineFromTop * PPM, 0.92);

  ctx.font = run.font;
  drawRun(ctx, run.left.glyphs, run.leftX, run.baselineY, run.condense);
  drawRun(ctx, run.right.glyphs, run.rightX, run.baselineY, run.condense);

  keystonePath(ctx, run.keystoneCx, run.keystoneCy, LAYOUT.keystoneW * PPM, LAYOUT.keystoneH * PPM);
  ctx.fill();

  return c;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Rounded-rectangle outline, sampled evenly enough to bow smoothly. */
function outline(a: number, b: number, r: number, per = 44): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  const corners: Array<[number, number, number]> = [
    [a - r, b - r, 0], [-(a - r), b - r, Math.PI / 2],
    [-(a - r), -(b - r), Math.PI], [a - r, -(b - r), 1.5 * Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (Math.PI / 2) * (i / steps);
      pts.push(new THREE.Vector2(cx + Math.cos(t) * r, cy + Math.sin(t) * r));
    }
    // Straight run to the next corner, sampled so the bow stays smooth.
    void per;
  }
  // Re-sample the closed outline at a constant spacing.
  const dense: THREE.Vector2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(p.distanceTo(q) / 0.012));
    for (let s = 0; s < steps; s++) dense.push(p.clone().lerp(q, s / steps));
  }
  return dense;
}

/** A filled disc over an outline, dense enough that the bow reads as a curve. */
function facePanel(ring: THREE.Vector2[], rings: number, z: (x: number, y: number) => number, flip: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const push = (x: number, y: number): void => {
    pos.push(x, y, z(x, y));
    uv.push((x + HW) / W, (y + HH) / H);
  };
  push(0, 0);
  for (let r = 1; r <= rings; r++) {
    const k = r / rings;
    for (const p of ring) push(p.x * k, p.y * k);
  }
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    if (flip) idx.push(0, b, a); else idx.push(0, a, b);
  }
  for (let r = 1; r < rings; r++) {
    const base = 1 + (r - 1) * n;
    const next = 1 + r * n;
    for (let i = 0; i < n; i++) {
      const a = base + i, b = base + ((i + 1) % n);
      const c = next + i, d = next + ((i + 1) % n);
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Push a flat-built geometry onto the bowed blank and give it plate UVs. */
function conform(g: THREE.BufferGeometry, lift = 0): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) + bow(x, y) + lift);
    uv[i * 2] = (x + HW) / W;
    uv[i * 2 + 1] = (y + HH) / H;
  }
  pos.needsUpdate = true;
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export interface PlateParts {
  /** Blank + pressing, one material. */
  plate: THREE.BufferGeometry;
  /** Four bolts, chrome. */
  bolts: THREE.BufferGeometry;
  material: THREE.MeshPhysicalMaterial;
}

/**
 * Build the plate once; both ends of the car share the geometry, the texture
 * and the material, so two plates cost one extra draw call, not two.
 */
export function buildPlate(ctx: BuildContext): PlateParts {
  const run = measure();

  const faceCanvas = drawFace(run);
  const map = new THREE.CanvasTexture(faceCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
  map.needsUpdate = true;

  const mask = maskFromCanvas(drawEmbossMask(run));
  const shapes = shapesFromMask(mask, {
    scale: 1 / PPM,
    // maskFromCanvas pads by 2 px, and the mask's origin is its top-left.
    originPx: [TEX_W / 2 + 2, TEX_H / 2 + 2],
    // 1.6 px at 6.7 px/mm is 0.24 mm of chord error on a character edge — a
    // quarter of the die's own draft, and below what `platecam` resolves. At
    // the previous 0.9 px the marching-squares trace was carrying a vertex
    // every couple of pixels and the pressing alone cost 6.6 k triangles.
    epsilon: 1.6,
    minArea: 24,
  });
  const emboss = conform(embossGeometry(shapes, { depth: LAYOUT.emboss, bevel: EMBOSS_DRAFT, sink: 0.0040 }));

  const ring = outline(HW, HH, PLATE.cornerRadius);
  // The blank is a 2.6 mm quadratic bow over 305 mm. A 16-ring radial fan on
  // an 0.006 m outline was 4.7 k triangles of it; the shading is identical at
  // 8 rings on an 0.012 m outline, and the UVs are linear in x and y so no
  // amount of coarsening moves the artwork.
  const front = facePanel(ring, 8, (x, y) => bow(x, y), false);
  const back = facePanel(ring, 3, (x, y) => bow(x, y) - LAYOUT.gauge, true);

  // Rolled edge between the two faces.
  const rimPos: number[] = [];
  const rimUv: number[] = [];
  const rimIdx: number[] = [];
  for (const p of ring) {
    const b = bow(p.x, p.y);
    rimPos.push(p.x, p.y, b, p.x, p.y, b - LAYOUT.gauge);
    const u = (p.x + HW) / W, v = (p.y + HH) / H;
    rimUv.push(u, v, u, v);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = i * 2, b = a + 1;
    const c = ((i + 1) % ring.length) * 2, d = c + 1;
    rimIdx.push(a, b, c, b, d, c);
  }
  const rim = new THREE.BufferGeometry();
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rimPos, 3));
  rim.setAttribute('uv', new THREE.Float32BufferAttribute(rimUv, 2));
  rim.setIndex(rimIdx);
  rim.computeVertexNormals();

  const bolts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * LAYOUT.boltX;
      const y = sy * LAYOUT.boltY;
      const b = bolt(0.0062, 0.0042);
      b.rotateX(Math.PI / 2);
      b.translate(x, y, bow(x, y) + 0.0008);
      bolts.push(b);
    }
  }

  // Typed through `PrintedOptions` rather than written inline at the call,
  // because `src/types.ts` carries its own copy of this option list and that
  // copy does not know about the two retro options yet. It is not this
  // stream's file to edit; the annotation here is what keeps the call honest
  // in the meantime, and it can come out the moment the contract catches up.
  const finish: PrintedOptions = {
    roughness: 0.33,
    clearcoat: 0.42,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.9,
    // A large, nearly flat panel carrying 2.9 mm of relief is exactly the
    // case a shadow map self-shadows into acne; casting from the back faces
    // moves the recorded depth off the lit surface. `Car` forces castShadow
    // on every mesh after the builders run, so it has to be the material.
    backfaceShadow: true,
    // The face is retroreflective sheeting, not white paint, and that is the
    // whole reason this plate could not be made to read right. The
    // photograph's plate measures 236 **in shade**, with the bumper 50 mm
    // away on the same panel at 65 — fifteen to one across one flat surface,
    // which no albedo produces and no amount of fill buys back. See the
    // model, and the units these two numbers are in, in
    // `materials/printed.ts`.
    retroGain: RETRO_GAIN,
    retroLobe: RETRO_LOBE,
  };

  return {
    plate: merge([front, back, rim, emboss]),
    bolts: merge(bolts),
    material: ctx.materials.printed(map, finish) as THREE.MeshPhysicalMaterial,
  };
}

/**
 * Mount a plate. `facing` is +1 for the nose, −1 for the tail; `tilt` leans the
 * plate back to sit on a bumper face that is not quite vertical.
 */
export function mountPlate(
  parts: PlateParts,
  chrome: THREE.Material,
  centre: readonly [number, number, number],
  facing: 1 | -1,
  tiltDeg = 0,
): THREE.Group {
  const g = new THREE.Group();
  g.name = facing > 0 ? 'plateFront' : 'plateRear';
  g.add(mesh('plateBlank', parts.plate, parts.material));
  g.add(mesh('plateBolts', parts.bolts, chrome));
  g.position.set(centre[0], centre[1], centre[2]);
  if (facing < 0) g.rotation.y = Math.PI;
  g.rotateX(tiltDeg * (Math.PI / 180));
  void QUALITY;
  return g;
}

/**
 * Moulded sidewall legend.
 *
 * The lettering on a tyre is *raised rubber*, pulled out of a cavity cut into
 * the mould. It is the same material as the carcass, so it cannot be a decal
 * and it cannot be a colour change: what makes it readable in a photograph is
 * that the cavity is polished, so the letter faces and their draft flanks come
 * out glossier than the sand-blasted carcass around them, and that they carry
 * their own tiny shadow.
 *
 * `createRubber()` in the shared library already does the first half of that —
 * it drops roughness wherever the *geometry* creases. Getting the benefit of
 * it means the legend has to be real geometry rather than a normal map, so
 * that is what this builds: outlines traced out of a canvas by the trim
 * stream's marching-squares tracer, extruded a millimetre, welded so the top
 * edges shade soft like rubber rather than machined plastic, and then bent
 * round onto the sidewall's own section.
 *
 * Cost is the reason it is laid out by hand rather than repeated: at roughly
 * 80 triangles a character, one legend per tyre is affordable and two is not.
 */

import * as THREE from 'three';
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BADGE_FONT_STACK, capHeightPx, drawRun, layout, makeCanvas, maskFromCanvas, shapesFromMask,
} from '../trim/glyphs';
import { LEGEND, TYRE } from './dims';
import { RIM } from './dims';

/** Raster cap height for the tracer. Low on purpose: the outline point count
 *  it produces is what the triangle count is made of, and a 14 in tyre's
 *  legend is 15 px tall on screen in the closest view there is. */
const TRACE_PX = 108;

export interface LegendRow {
  text: string;
  /** Radial position, as a fraction of section height above the bead seat. */
  t: number;
  /** Cap height, metres. */
  cap: number;
  /** How far the characters stand proud of the sidewall, metres. */
  relief: number;
  /** Where the middle of the run sits, degrees about the axle. 0 = 12 o'clock. */
  centreDeg: number;
  tracking?: number;
  weight?: string;
  condense?: number;
}

/**
 * The legend of a period European 185/70.
 *
 * `NORDSTERN` is invented — a real brand name moulded onto a rendered tyre is
 * somebody's trademark, and the car is not wearing one in any reference we
 * have that is sharp enough to read. Everything else is a genuine ETRTO/DOT
 * legend: load index 87 and speed symbol H are the correct pair for this
 * fitment, and `0487` dates the tyre to the 4th week of 1987, which is right
 * for a car built in 1988.
 */
export const LEGEND_ROWS: readonly LegendRow[] = [
  { text: 'NORDSTERN', t: LEGEND.brandT, cap: 0.0118, relief: 0.0014, centreDeg: 96, tracking: 0.10, weight: '700' },
  { text: '185/70 HR 14', t: LEGEND.sizeT, cap: 0.0094, relief: 0.0013, centreDeg: 96, tracking: 0.09, weight: '700' },
  { text: 'STEEL RADIAL TUBELESS', t: LEGEND.constructionT, cap: 0.0050, relief: 0.0008, centreDeg: -84, tracking: 0.10, weight: '500' },
  { text: 'DOT HU L9 0487', t: LEGEND.dotT, cap: 0.0044, relief: 0.0008, centreDeg: -84, tracking: 0.08, weight: '400' },
];

// ---------------------------------------------------------------------------
// Flat run
// ---------------------------------------------------------------------------

/**
 * One text run as flat, welded relief in XY, standing +Z proud of z = 0 and
 * centred on its own bounding box.
 */
function runGeometry(row: LegendRow): { geom: THREE.BufferGeometry; width: number } | null {
  const probe = makeCanvas(8, 8).getContext('2d');
  if (!probe) return null;

  const font = `${row.weight ?? '500'} ${TRACE_PX}px ${BADGE_FONT_STACK}`;
  probe.font = font;
  const capPx = capHeightPx(probe);
  const condense = row.condense ?? 1;
  const { glyphs, width } = layout(probe, row.text, { font, tracking: row.tracking ?? 0.08, condense });
  if (width <= 0) return null;

  const pad = Math.round(capPx * 0.45);
  const cv = makeCanvas(Math.ceil(width) + pad * 2, Math.ceil(capPx * 1.7) + pad * 2);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  const baseline = pad + Math.round(capPx * 1.2);
  drawRun(ctx, glyphs, pad, baseline, condense);

  const scale = row.cap / capPx;
  // `maskFromCanvas` pads two texels all round so no contour runs off the edge.
  const shapes = shapesFromMask(maskFromCanvas(cv), {
    scale,
    originPx: [pad + 2 + width / 2, baseline + 2 - capPx / 2],
    epsilon: 1.15,
    minArea: 8,
  });
  if (shapes.length === 0) return null;

  // No bevel: a bevelled extrusion is four times the triangles, and at this
  // size the draft angle is a third of a pixel. Welding the caps to the walls
  // and re-deriving the normals gets the same soft moulded edge for nothing,
  // and gives the library's curvature test a gradient to find.
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, {
    depth: row.relief,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = BGU.mergeVertices(g, 1e-5);
  g.computeVertexNormals();

  return { geom: g, width: width * scale };
}

// ---------------------------------------------------------------------------
// Bending it onto the section
// ---------------------------------------------------------------------------

/** Axial position and outward unit normal of the sidewall at a given radius. */
interface Section {
  axialAt(r: number): number;
  normalAt(r: number): { na: number; nr: number };
}

function sectionSampler(profile: ReadonlyArray<readonly [number, number]>): Section {
  const find = (r: number): number => {
    for (let i = 1; i < profile.length; i++) {
      const r0 = profile[i - 1][1];
      const r1 = profile[i][1];
      if (r >= r0 && r <= r1) return i;
    }
    return r < profile[0][1] ? 1 : profile.length - 1;
  };
  return {
    axialAt(r) {
      const i = find(r);
      const [a0, r0] = profile[i - 1];
      const [a1, r1] = profile[i];
      const k = (r - r0) / (r1 - r0 || 1e-9);
      return a0 + (a1 - a0) * k;
    },
    normalAt(r) {
      const i = find(r);
      const [a0, r0] = profile[i - 1];
      const [a1, r1] = profile[i];
      // Tangent runs up the section; the outward normal is it turned 90 deg.
      const ta = a1 - a0;
      const tr = r1 - r0;
      const len = Math.hypot(ta, tr) || 1e-9;
      return { na: tr / len, nr: -ta / len };
    },
  };
}

/**
 * Wrap the flat runs onto the outboard sidewall.
 *
 * The inboard side gets nothing. It carries the same legend on a real tyre,
 * but it is behind the wheel on every camera this project has, and a second
 * copy is a quarter of the whole tyre's triangle budget.
 */
export function buildLegend(profile: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry | null {
  const Rb = RIM.beadR;
  const section = sectionSampler(profile);
  const parts: THREE.BufferGeometry[] = [];

  for (const row of LEGEND_ROWS) {
    const run = runGeometry(row);
    if (!run) continue;

    const rRef = Rb + row.t * TYRE.sectionH;
    const phi0 = (row.centreDeg * Math.PI) / 180;
    const pos = run.geom.getAttribute('position') as THREE.BufferAttribute;
    const out = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const tx = pos.getX(i);
      const ty = pos.getY(i);
      const tz = pos.getZ(i);          // 0 at the carcass, `relief` at the face

      const r0 = rRef + ty;
      const { na, nr } = section.normalAt(r0);
      const r = r0 + tz * nr;
      const axial = section.axialAt(r0) + tz * na;
      // Arc length along the row's own radius, so a run does not shear as it
      // climbs the sidewall. The sign is negative because +phi runs *towards*
      // the viewer's left on the outboard face: with +tx the whole legend came
      // out mirror-written.
      const phi = phi0 - tx / rRef;

      out[i * 3] = axial;
      out[i * 3 + 1] = r * Math.cos(phi);
      out[i * 3 + 2] = r * Math.sin(phi);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    // Reversing phi mirrors the mapping, which flips every triangle's winding.
    // Reversing the index list flips it back, so the relief still faces out.
    const idx = run.geom.getIndex();
    if (idx) {
      const src = idx.array;
      const flipped = new Uint32Array(src.length);
      for (let k = 0; k < src.length; k++) flipped[k] = src[src.length - 1 - k] as number;
      g.setIndex(new THREE.BufferAttribute(flipped, 1));
    }
    g.computeVertexNormals();
    parts.push(g);
    run.geom.dispose();
  }

  if (parts.length === 0) return null;
  const merged = BGU.mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged ?? null;
}

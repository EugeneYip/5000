/**
 * Roof rails — the Avant's signature, and confirmed fitted on this car.
 *
 * They were a factory option rather than standard (§2.4), listed in the US
 * books as "Roof rails (wagon)", and `docs/REFERENCE-PHOTO.md` records them
 * visible above the windscreen header in the reference photograph.
 *
 * Section is a flattened extrusion with a rounded top — about twice as wide as
 * it is tall (§6.6), not round tube, which is the detail that separates a
 * period Typ 44 rail from every later Avant. Three feet per rail, per
 * `HP.roof.railFeet`, with the ends closed by moulded caps rather than swept
 * down onto the skin.
 *
 * NOTE on height: `HP.roof.railTopY` (1.474) and `BODY.heightOverRails` both
 * put the rail top at y ≈ 1.47, and the spec comments read that as ~50 mm of
 * stand-off. It is only 50 mm above the roof *centreline* crown; at the rail's
 * own station (x = 0.615) the skin is 32 mm lower, so taking the figure
 * literally would put the rail 90 mm in the air on stilt-like legs. The rail
 * therefore follows the roof at a constant stand-off, clamped to 75 mm. See
 * the stream report.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { skinNormal, skinY } from './bodyref';
import { arc, at, clamp, framesFrom, lerp, merge, mesh, roundedBox, sweep, type Pt } from './util';

const R = HP.roof;
const CX = R.railInnerX + R.railWidth / 2;
const SECTION_H = 0.028;
const FOOT_W = 0.030;
const FOOT_L = 0.048;

/** Flattened D-section: flat underside, radiused flanks, elliptical top. */
function railSection(scale: number): Pt[] {
  const hw = (R.railWidth / 2) * scale;
  const hh = (SECTION_H / 2) * scale;
  const pts: Pt[] = [
    [-hw * 0.82, -hh],
    [hw * 0.82, -hh],
    [hw * 0.97, -hh * 0.80],
    [hw, -hh * 0.35],
  ];
  for (let i = 1; i < 11; i++) {
    const a = (i / 11) * Math.PI;
    pts.push([Math.cos(a) * hw, -hh * 0.35 + Math.sin(a) * hh * 1.30]);
  }
  pts.push([-hw, -hh * 0.35], [-hw * 0.97, -hh * 0.80]);
  return pts;
}

function railTopY(z: number, standoff: number): number {
  return skinY(z, CX) + standoff;
}

export function buildRoofRails(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roofRails';
  const anodised = ctx.materials.blackTrim();

  // Stand-off the rail keeps above the skin, taken from the hardpoint where
  // the hardpoint is physically sane and clamped where it is not.
  let crest = 0;
  for (let z = R.railRearZ; z <= R.railFrontZ; z += 0.05) crest = Math.max(crest, skinY(z, CX));
  const standoff = clamp(R.railTopY - crest, 0.045, 0.075);

  const parts: THREE.BufferGeometry[] = [];

  const n = 40;
  const pts: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    // Ordered rear → front so the frame's up vector comes out pointing up.
    const z = lerp(R.railRearZ, R.railFrontZ, i / n);
    pts.push(new THREE.Vector3(CX, railTopY(z, standoff) - SECTION_H / 2, z));
    nor.push(new THREE.Vector3(1, 0, 0));
  }
  const frames = framesFrom(pts, nor);

  // Ends: the section closes down over the last 55 mm into a moulded cap.
  const capFrac = 0.055 / Math.abs(R.railFrontZ - R.railRearZ);
  parts.push(
    sweep(
      (_j, t) => {
        const end = Math.min(t / capFrac, (1 - t) / capFrac, 1);
        return railSection(lerp(0.34, 1, Math.sqrt(clamp(end, 0, 1))));
      },
      frames,
      { closed: true, capStart: true, capEnd: true, uvScale: 0.05 },
    ),
  );

  // Feet: short pedestals, inset from the ends so the rail visibly overhangs.
  const feet: number = R.railFeet;
  for (let k = 0; k < feet; k++) {
    const t = feet < 2 ? 0.5 : 0.09 + (k / (feet - 1)) * 0.82;
    const z = lerp(R.railRearZ, R.railFrontZ, t);
    const top = railTopY(z, standoff) - SECTION_H * 0.55;
    const skin = skinY(z, CX);
    const h = Math.max(top - skin, 0.012);
    const tilt = Math.asin(clamp(skinNormal(z, CX).x, -1, 1));

    // One tapered leg per foot, flaring into the roof and buried a few
    // millimetres below the skin so there is never a gap under it. An extra
    // base flange looked like a loose tab from anything but dead abeam.
    const nSeg = 6;
    for (let i = 0; i < nSeg; i++) {
      const t = i / nSeg;
      const k = 1 + 0.55 * Math.pow(t, 2.4);
      const seg = roundedBox(FOOT_W * k, h / nSeg + 0.004, FOOT_L * (0.78 + 0.34 * Math.pow(t, 2.2)), 0.005);
      seg.rotateZ(-tilt * t);
      seg.translate(CX, skin - 0.006 + h * (1 - t - 0.5 / nSeg), z);
      parts.push(seg);
    }
  }

  const right = merge(parts);
  const left = right.clone();
  left.scale(-1, 1, 1);
  const idx = left.getIndex();
  if (idx) {
    const a = idx.array as unknown as number[];
    for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  left.computeVertexNormals();

  group.add(mesh('roofRails', merge([right, left]), anodised));

  void arc; void at;
  return group;
}

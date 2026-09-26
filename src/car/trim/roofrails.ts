/**
 * Roof rails — the Avant's signature, and confirmed fitted on this car.
 *
 * They were a factory option rather than standard (§2.4), listed in the US
 * books as "Roof rails (wagon)", and `docs/REFERENCE-PHOTO.md` records them
 * visible above the windscreen header in the reference photograph.
 *
 * WHERE THEY SIT. `docs/CRITIQUE.md` §4: the previous build put them 120 mm
 * inboard, standing on corrugated stacked-box posts that read as an
 * aftermarket luggage rack. Every reference — `US-F`, `AV-R1` and the owner's
 * own photograph, where the rails measure x 785–832 and 1095–1140 against a
 * roof spanning 800–1140 — puts them **on the roof edge**. So the centreline
 * here is taken from the body's own roof-to-bodyside joint rather than from
 * `HP.roof.railInnerX`, and it follows that joint, tucking inboard at the rear
 * where the roof narrows into the D-pillar, exactly as the real extrusion does.
 *
 * ⚠ The joint measures **x ≈ 0.700** over the rail's span, not the 0.774 the
 * critique quotes for "roof half-width" — 0.774 is the roof *panel's* bounding
 * box, which includes the skin after it has turned down into the bodyside. So
 * the move available is ~45 mm, not 120. See the stream report.
 *
 * SECTION. §6.6: a slim extrusion, roughly twice as wide as it is tall with a
 * rounded top, about 25–30 mm; four support points per rail, the front and
 * rear ends sweeping down onto the skin as integral terminations with two
 * short posts between them. Built that way here — the blade dives to the roof
 * over its last 90 mm at each end, so the terminations are the extrusion
 * itself rather than something bolted under it.
 *
 * HEIGHT. `HP.roof.railTopY` (1.474) and `BODY.heightOverRails` are overall
 * *vehicle* height, measured over the roof's centreline crown — at the rail's
 * own station the skin is 47 mm lower, and taking 1.474 literally puts the
 * blade 100 mm in the air on stilts. What is achievable is `railBaseY`: the
 * blade's underside sits at 1.408, which is 40 mm above the skin under it and
 * within §6.6's 50–55 mm. Reported.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { roofEdgePoint, skinY } from './bodyref';
import { clamp, framesFrom, lerp, merge, mesh, roundedBox, smoothstep, sweep, type Pt } from './util';

const R = HP.roof;
/** Blade section: 38 × 22 mm, the "twice as wide as tall" of §6.6. */
const SECTION_H = 0.022;
/** Gap the blade keeps above the skin through the straight part of its run. */
const STANDOFF = 0.040;
/** How far in from the roof-to-bodyside joint the blade's outer face sits. */
const EDGE_GAP = 0.008;
/** Length over which each end sweeps down onto the skin. */
const TERMINATION = 0.090;

const SPAN = Math.abs(R.railFrontZ - R.railRearZ);

/** Blade centreline at station `z`, riding just inboard of the roof edge. */
function railX(z: number): number {
  return roofEdgePoint(z).x - EDGE_GAP - R.railWidth / 2;
}

/** Roof skin directly under the blade. */
function skinUnder(z: number): number {
  return skinY(z, railX(z));
}

/**
 * Underside of the blade. Level at `railBaseY` where the roof is flat enough
 * to carry it, following the skin down where it is not, and diving onto the
 * skin over the last `TERMINATION` at each end.
 */
function baseY(z: number, t: number): number {
  const skin = skinUnder(z);
  const run = Math.min(R.railBaseY, skin + STANDOFF);
  const k = clamp(Math.min(t, 1 - t) / (TERMINATION / SPAN), 0, 1);
  return lerp(skin + 0.003, run, smoothstep(k));
}

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

export function buildRoofRails(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roofRails';
  const anodised = ctx.materials.blackTrim();

  const parts: THREE.BufferGeometry[] = [];

  const n = 48;
  const pts: THREE.Vector3[] = [];
  const nor: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    // Ordered rear → front so the frame's up vector comes out pointing up.
    const t = i / n;
    const z = lerp(R.railRearZ, R.railFrontZ, t);
    pts.push(new THREE.Vector3(railX(z), baseY(z, t) + SECTION_H / 2, z));
    nor.push(new THREE.Vector3(1, 0, 0));
  }
  const frames = framesFrom(pts, nor);

  // The section also narrows into the last 55 mm, so the termination is a
  // moulded taper rather than a blade cut off square on the roof.
  const capFrac = 0.055 / SPAN;
  parts.push(
    sweep(
      (_j, t) => railSection(lerp(0.42, 1, Math.sqrt(clamp(Math.min(t, 1 - t) / capFrac, 0, 1)))),
      frames,
      { closed: true, capStart: true, capEnd: true, uvScale: 0.05 },
    ),
  );

  // Two short posts between the terminations, at roughly the B- and C-pillar
  // stations — the other two of §6.6's four support points are the ends
  // themselves. One tapered pedestal each: the previous six-segment stack read
  // as a bellows from every angle that mattered.
  const posts = Math.max(1, R.railFeet - 1);
  for (let k = 0; k < posts; k++) {
    const t = posts < 2 ? 0.5 : 0.28 + (k / (posts - 1)) * 0.44;
    const z = lerp(R.railRearZ, R.railFrontZ, t);
    const skin = skinUnder(z);
    const top = baseY(z, t) + 0.002;
    const h = Math.max(top - skin, 0.010) + 0.006;
    const post = roundedBox(0.026, h, 0.044, 0.005);
    post.translate(railX(z), skin - 0.005 + h / 2, z);
    parts.push(post);
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
  return group;
}

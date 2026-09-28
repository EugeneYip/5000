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
 * rounded top, about 25–30 mm. The terminations are the extrusion itself
 * rather than something bolted under it: the blade dives to the roof at each
 * end.
 *
 * Re-measured on the quattro Sport. Scale from the rear-door glass (≈380 mm)
 * and independently from the rim's outer flange (≈400 mm), which agree to
 * 3 % — both verticals at roughly the post's depth, so they survive the
 * oblique view where a length along the car would not. Section **≈29 mm**.
 * Stand-off from the post, which is the only thing in any of these pictures
 * that spans skin to blade with both ends visible: **58–72 mm**, the spread
 * being how much of the blade the post's top disappears behind. So the 60 mm
 * below is at the bottom of the measured range, not above it, and §6.6's
 * 50–55 mm is under it.
 *
 * Do not measure the stand-off off the apparent daylight under the rail. On
 * every low-angle shot in the set what closes that gap is the roof's own near
 * edge, not the skin under the blade, and it reads 89 mm on the blue car that
 * way against 58–72 from its own post.
 *
 * SUPPORT POINTS — counted, not assumed. §6.6 says four per rail (two ends
 * plus two posts) and `docs/CRITIQUE-3.md` §3 says five or six. Both are
 * wrong, and the high counts come from the same mistake: on a three-quarter
 * photograph the far rail's supports show through the gap under the near one,
 * so one rail's three read as five or six. Counted at native resolution over
 * the *full* run of one traced rail, on three European Avants:
 *
 * | car | image | intermediate posts | post, % of span from front |
 * |---|---|---|---|
 * | 1990 100 Avant TDI       | 5372×2996 | **1** | 43.5 % |
 * | 100 Avant quattro Sport  | 2541×1430 | **1** | 44.2 % |
 * | 100 Avant (blue, street) | 2816×1276 | **1** | 44.3 % |
 *
 * So **three support points per rail**: the two swept-down ends, and one post
 * just forward of mid-span. That is exactly `HP.roof.railFeet` (3) read as
 * *support points*, which is how §6.6 counts them — so the hardpoint is right
 * and this file's arithmetic was wrong: it built `railFeet - 1` = two posts,
 * giving four contact points on a rail that has three.
 *
 * Three different viewpoints agreeing inside a percentage point is the useful
 * part: a fraction measured between the rail's own two ends barely moves under
 * perspective, where an absolute station does. Distrust anything below that
 * was derived from a length rather than a ratio.
 *
 * TERMINATION LENGTH. The sweep is long and shallow, not a hook. On all three
 * the blade leaves its straight run 10–15 % of the span before it touches
 * down, so ~200 mm here against the 90 mm this file used. That single number
 * is most of why the rear end read as a hook standing off the roof.
 *
 * HEIGHT — rewritten after `docs/CRITIQUE-2.md` §5 measured it.
 *
 * The previous version of this file capped the blade's underside at
 * `HP.roof.railBaseY` (1.408) and argued that `railTopY` (1.474) could not be
 * reached without stilts. It was right about 1.474 and wrong about everything
 * that follows from it. Raycasting the built scene put the blade's crown at
 * **1408 — seven millimetres BELOW the roof's own centreline crown (1415)** —
 * so in a true side elevation the rails did not break the roofline at all,
 * where the blueprint's topmost ink over them is 1462–1480. A roof rail you
 * cannot see in profile is not a roof rail.
 *
 * Probed, at the rail's own station (x 0.673):
 *
 * | | z −1.4 | z −2.0 | z −2.6 | z −3.075 |
 * |---|---|---|---|---|
 * | roof skin | 1367 | 1373 | 1364 | 1308 |
 *
 * So the three numbers cannot all be satisfied: 1.474 over a 1.373 skin is a
 * **79 mm** stand-off, against §6.6's twice-derived 50–55. This build takes
 * §6.6's figure at its top end and lets the hardpoint act as a *ceiling*
 * rather than a target:
 *
 *   underside 1.373 + 0.060 = **1.433**, crown **1.459**
 *
 * — 44 mm clear of the roof's centre crown, so the rails break the roofline in
 * elevation; 3 mm under the blueprint's lower bound; 15 mm under `railTopY`,
 * against the 66 mm the review measured. `HP.roof.railBaseY` (1.408) is now
 * 25 mm low and wants raising with it; reported rather than edited here.
 *
 * FINISH — reversed. This file used to argue for `blackTrim` on the grounds
 * that the rails "read dark" in the owner's photograph. They do not read
 * anything reliable there: the rails cross the frame at 3–4 px against a blown
 * background of flagpoles and a white building, and the only clean pixels on
 * them are specular highlights. Every reference that resolves the part shows
 * bright polished/anodised aluminium — rail *and* feet, the feet are not body
 * colour — against a red car, a blue-black car and a near-black car alike,
 * which is also what §6.6 concluded and what the OEM listings for the Typ 44
 * pair (445860021/022) describe. So: `chrome()` above the brush threshold,
 * which `createChrome` documents as "a brushed anodised extrusion" and which
 * brushes fore-aft by default — the right description of this part.
 *
 * ⚠ All of that evidence is European. No US-market 5000 S wagon with rails
 * resolves the finish in the reference set (neither BaT wagon has rails), and
 * the owner's photograph cannot settle it. If US evidence ever contradicts
 * this, it wins.
 *
 * WHERE THE RUN ENDS — unresolved, and a hardpoint question. The rail's
 * *length* looks right, but on the TDI the rear termination dies into the
 * skin roughly 100 mm forward of the roof's rearmost point, where
 * `railRearZ` leaves ours 27 mm short of the roof panel's rear edge and
 * 107 mm **aft** of `HP.roof.dPillarZ` — so the last of our sweep lands on
 * skin that has already started falling into the D-pillar, which is what
 * stands the ends proud in a dead-on rear elevation. Every reference that
 * shows the termination is a three-quarter shot with enough perspective that
 * the near and far wheels differ by half again in size, so none of them will
 * give a station that can be trusted to 50 mm. Reported, not worked around;
 * it wants a side elevation of a railed car, which the reference set has not
 * got.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { roofEdgePoint, skinY } from './bodyref';
import {
  clamp, framesFrom, lerp, merge, mesh, roundedRectSection, smoothstep, sweep, type Pt,
} from './util';

const R = HP.roof;
/** Blade section: 38 × 26 mm — §6.6 gives "about 25–30 mm tall". */
const SECTION_H = 0.026;
/** Gap the blade keeps above the skin through the straight part of its run. */
const STANDOFF = 0.060;
/** How far in from the roof-to-bodyside joint the blade's outer face sits. */
const EDGE_GAP = 0.008;
/**
 * Length over which each end sweeps down onto the skin. Measured off the TDI
 * at 10–15 % of the rail's span; the 90 mm this was is a hook, not a sweep.
 */
const TERMINATION = 0.200;

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
  // `railTopY` as a ceiling on the blade's crown, not as the level to build
  // to: over the flat of the roof the stand-off governs, and the hardpoint
  // only bites if the skin under the rail is ever higher than it should be.
  const run = Math.min(R.railTopY - SECTION_H, skin + STANDOFF);
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
  // 0.18 sits on a `CHROME_RUNGS` step, so it is not quantised away, and it
  // is above `createChrome`'s 0.07 brush threshold: bright anodised extrusion
  // with fore-aft marks, not the mirror plate the four rings wear.
  const anodised = ctx.materials.chrome({ roughness: 0.18 });

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

  // `railFeet` counts support points, and two of them are the swept ends, so
  // the posts are `railFeet - 2` — one, on the four cars counted in the header,
  // sitting just aft of mid-span. This was `railFeet - 1`, which put two posts
  // under a rail that has one. One tapered pedestal each: the previous
  // six-segment stack read as a bellows from every angle that mattered.
  const posts = Math.max(1, R.railFeet - 2);
  for (let k = 0; k < posts; k++) {
    // Re-measured from the front termination's touchdown to the rear's, over
    // the whole run of one near-side rail on each of three cars: 44.2 %
    // (red quattro Sport), 44.3 % (blue), 43.5 % (TDI) of the span back from
    // the *front* end. `t` runs rear → front, so that is t ≈ 0.56 — the post
    // sits just forward of mid-span, not aft of it.
    const t = posts < 2 ? 0.56 : 0.28 + (k / (posts - 1)) * 0.44;
    const z = lerp(R.railRearZ, R.railFrontZ, t);
    const skin = skinUnder(z);
    const top = baseY(z, t) + 0.002;
    const h = Math.max(top - skin, 0.010) + 0.006;
    const x = railX(z);
    // A flared fin, not a tab. On all three cars the post is slim where it
    // meets the blade and spreads fore-aft into a foot pad on the skin; the
    // plain box this was read as a flat plate from the side view, which is
    // the one view it is always in.
    const rise: THREE.Vector3[] = [];
    const nor: THREE.Vector3[] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      rise.push(new THREE.Vector3(x, skin - 0.005 + (i / steps) * h, z));
      nor.push(new THREE.Vector3(1, 0, 0));
    }
    parts.push(
      sweep(
        (_j, k) => {
          const flare = Math.pow(1 - k, 2.5);
          return roundedRectSection(0.020 + 0.010 * flare, 0.030 + 0.034 * flare, 0.006);
        },
        framesFrom(rise, nor),
        { closed: true, capStart: true, capEnd: true, uvScale: 0.05 },
      ),
    );
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

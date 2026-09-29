/**
 * The small stuff: washer jets, the power antenna, the exhaust tip, and the
 * Pennsylvania inspection sticker in the top corner of the windscreen.
 *
 * The sticker is in the reference photograph and is the sort of thing that
 * makes a render stop looking like a configurator: a real car carries paper.
 *
 * The antenna is modelled **retracted**. [AW-87] lists an automatic power
 * antenna as standard on the US 5000 S (§6.7), so with the radio off only the
 * base and a short stub of mast should show.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { skinY } from './bodyref';
import { makeCanvas } from './glyphs';
import { DEG, at, lathe, merge, mesh, roundedBox, type Pt } from './util';

/**
 * The pair of Pennsylvania windscreen stickers, drawn onto one canvas.
 *
 * The photograph shows **two** of them side by side, not one: the safety
 * inspection sticker on the left, cream and near-white with no dark field
 * anywhere on it, and the emissions sticker on the right, white inside a thin
 * pink border. White-balanced and measured on their own interiors they are
 * (220, 227, 232) and (210, 208, 219) — 85 % and 48 % of their own area above
 * level 224. Between them they are about 0.38 % of the car and 0.19 % of it
 * above 224 — which is **1.8 %** of the photograph's 10.2 % total, not "nearly
 * a fifth" as this said at first. A fifth is the grille surround's number
 * (1.89 % of the car) and I conflated the two. Small, then — but it was worth
 * fixing because it cost the highlight bucket its whole share, not part of it.
 *
 * What was here before was one portrait sticker with a dark green band across
 * its top third and a navy numeral filling its middle. It measured mean 183
 * with **nothing at all** above 224.
 *
 * They are square, and they read as landscape because the screen is raked.
 * At 64 deg from vertical, and viewed from a camera level with them, a metre
 * up the slope moves 0.065 of image height against 0.188 for a metre across —
 * so a square sticker projects at about 2.9 : 1. Do not "fix" the aspect.
 */
function stickerTexture(): THREE.CanvasTexture {
  // Two tiles side by side on one canvas, so the pair is one draw.
  //
  // They butt edge to edge and fill the canvas completely, because
  // `printed()` issues an opaque material — anything left clear here would
  // render as black, which is the defect this function exists to remove. The
  // photograph shows them touching anyway.
  const W = 512, H = 356;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const half = W / 2;

  // --- left: safety. Cream, plain, no border, a grid of faint type.
  // The safety sticker is the brighter of the two and the cooler: measured on
  // its own interior the photograph gives (220, 227, 232) against the
  // emissions sticker's (210, 208, 219), a 14-level lead. Rendered from equal
  // canvases the pair came out the wrong way round, so the lead is set here.
  ctx.fillStyle = '#fbfdff';
  ctx.fillRect(0, 0, half, H);
  ctx.fillStyle = '#4c5158';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(H * 0.12)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('PENNSYLVANIA', half / 2, H * 0.17);
  ctx.font = `700 ${Math.round(H * 0.30)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('9', half * 0.30, H * 0.50);
  ctx.fillText('88', half * 0.68, H * 0.50);
  ctx.font = `500 ${Math.round(H * 0.085)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('SAFETY INSPECTION', half / 2, H * 0.84);

  // --- right: emissions. White, thin pink border inset from the edge.
  ctx.fillStyle = '#f0eef4';
  ctx.fillRect(half, 0, half, H);
  ctx.strokeStyle = '#c05263';
  ctx.lineWidth = 11;
  ctx.strokeRect(half + 10, 10, half - 20, H - 20);
  ctx.fillStyle = '#6e424c';
  ctx.font = `700 ${Math.round(H * 0.11)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('EMISSION', half * 1.5, H * 0.23);
  ctx.font = `700 ${Math.round(H * 0.26)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('9', half * 1.32, H * 0.52);
  ctx.fillText('88', half * 1.68, H * 0.52);
  ctx.font = `500 ${Math.round(H * 0.08)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('PROGRAM', half * 1.5, H * 0.80);

  // Sun-bleached and slightly grubby, like everything on a 1980s windscreen.
  // Kept to 0.05: at 0.10 it pulled both faces below the photograph's.
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#6b6252';
  for (let i = 0; i < 700; i++) {
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.globalAlpha = 1;

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildDetails(ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = 'details';

  const dark = ctx.materials.blackTrim();
  const chrome = ctx.materials.chrome();
  const steel = ctx.materials.chrome({ roughness: 0.28 });

  // --- windscreen washer jets ---------------------------------------------
  {
    const jets: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const x = sx * 0.305;
      const z = -0.296;
      const y = skinY(z, Math.abs(x));
      const body = roundedBox(0.0170, 0.0052, 0.0125, 0.0024);
      body.rotateX(-6 * DEG);
      body.translate(x, y + 0.0026, z);
      jets.push(body);
      // The two spray nozzles, which is what you actually see.
      for (const k of [-1, 1]) {
        const n = new THREE.SphereGeometry(0.0016, 8, 6);
        n.translate(x + k * 0.0042, y + 0.0044, z + 0.0022);
        jets.push(n);
      }
    }
    group.add(mesh('washerJets', merge(jets), dark));
  }

  // --- power antenna, retracted -------------------------------------------
  {
    const x = -0.548;
    const z = -2.885;
    const y = skinY(z, Math.abs(x));
    const base: Pt[] = [
      [0.0000, 0.0000], [0.0135, 0.0000], [0.0138, 0.0026],
      [0.0105, 0.0062], [0.0062, 0.0082], [0.0038, 0.0090],
    ];
    const boot = lathe(base, 20);
    boot.rotateX(22 * DEG);
    boot.translate(x, y - 0.001, z);
    const mast = new THREE.CylinderGeometry(0.0026, 0.0032, 0.062, 10);
    mast.rotateX(22 * DEG);
    mast.translate(x + 0.0004, y + 0.031, z - 0.012);
    group.add(mesh('antennaBase', boot, dark));
    group.add(mesh('antennaMast', mast, steel));
  }

  // --- exhaust tip ---------------------------------------------------------
  {
    const [x, y, z] = HP.rear.exhaustTip;
    const r = HP.rear.exhaustDiameter / 2;
    // Outer wall and the rolled lip only: a dark disc set back inside it reads
    // as the bore, which is cheaper and blacker than modelling the tube.
    const tip: Pt[] = [
      [r * 0.86, -0.150], [r * 0.86, -0.050], [r * 0.92, -0.020],
      [r * 0.97, 0.000], [r, 0.008], [r * 1.02, 0.014],
      [r * 0.96, 0.018], [r * 0.90, 0.014],
    ];
    const g = lathe(tip, 24);
    g.rotateX(-Math.PI / 2 - 6 * DEG);
    g.translate(x, y, z);
    group.add(mesh('exhaustTip', g, steel));

    const bore = new THREE.CircleGeometry(r * 0.90, 24);
    bore.rotateY(Math.PI);
    bore.rotateX(6 * DEG);
    bore.translate(x, y - 0.004, z + 0.038);
    group.add(mesh('exhaustBore', bore, dark));
    void chrome;
  }

  // --- Pennsylvania windscreen stickers ------------------------------------
  {
    // The windscreen is the plane through the cowl and the header.
    const up = new THREE.Vector3(0, HP.headerY - HP.cowlY, HP.headerZ - HP.cowlZ).normalize();
    const n = new THREE.Vector3(0, -up.z, up.y).normalize();
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up, n);

    // Low in the corner, not up against the header where this used to sit.
    // Measured on the photograph against the glass itself, which needs no
    // scale: the pair's centre is 0.80 of the way down from the header line to
    // the cowl line at its own x, and 0.80 of the glass half-width out from
    // the centreline. That is where Pennsylvania puts an inspection sticker —
    // the lower corner on the driver's side, which on a left-hand-drive car is
    // the car's LEFT, and +X (see the frame note in `hardpoints.ts`).
    const DOWN = 0.80;
    const z = HP.headerZ + DOWN * (HP.cowlZ - HP.headerZ);
    const k = (z - HP.cowlZ) / (HP.headerZ - HP.cowlZ);
    const y = HP.cowlY + k * (HP.headerY - HP.cowlY);

    // Sized by measurement, not by what a sticker "should" be. The pair
    // renders 44 x 8 px at photomatch and the photograph, scaled on the plate
    // (124 render px against 175), wants 60 x 16 — so 1.36x across and 2.0x
    // up the slope. That gives a 201 mm pair, two tiles of about 100 x 140,
    // and two independent routes agree on it: the same 201 mm falls out of
    // the plate-derived 0.421 px/mm at the screen plane, and out of the pair
    // being 0.32 of the glass half-width at its own row.
    //
    // They are portrait and read landscape because the screen is raked. At
    // 64 deg from vertical, viewed from a camera level with them, a metre up
    // the slope is worth 0.065 of image height against 0.188 for a metre
    // across — so each tile projects at about 2.4 : 1 the other way up. Do
    // not "correct" the aspect to what the render looks like.
    const plane = new THREE.PlaneGeometry(0.201, 0.140);
    const stickers = new THREE.Mesh(
      plane,
      ctx.materials.printed(stickerTexture(), {
        roughness: 0.55,
        clearcoat: 0.1,
        // The canvas is near-white and the sticker still rendered at 183
        // against the photograph's 226, because it is paper inside a cabin
        // and the renderer has no interior bounce — the same gap the
        // instrument cluster has, documented at `clusterFace`. This is the
        // stand-in for that missing light, not a fudge for the paper's
        // albedo: the safety tile's canvas went 240 -> 246 -> 251 and moved
        // the render 211.9 -> 214.8 -> 214.0, i.e. it saturated. What is
        // short here is light, not white.
        //
        // 2.0 chosen on the gate's own terms rather than on the mean. At 1.7
        // the pair reads median 217.3 with 31.6 % of itself over 224; at 2.0
        // it is 221.3 and 44.4 %, against the photograph's ~220 and ~45 %,
        // and its contribution to the car's above-224 share goes 0.113 % to
        // 0.159 % against the photograph's 0.196 %. The mean runs 9 levels
        // high at 2.0 and that is the trade.
        //
        // NOT `retroGain`. That term exists for the licence plate, which is
        // glass-bead sheeting; a paper sticker behind tinted glass is not
        // retroreflective and borrowing it here would put a flare on the
        // screen whenever the sun came round behind the camera.
        envMapIntensity: 2.0,
      }),
    );
    stickers.name = 'windscreenStickers';
    stickers.quaternion.setFromRotationMatrix(basis);
    // Applied on the inside of the glass.
    stickers.position.set(0.520, y, z).addScaledVector(n, -0.004);
    group.add(stickers);
  }

  void at;
  return group;
}

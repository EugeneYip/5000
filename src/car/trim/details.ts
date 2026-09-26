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

/** A period PA inspection sticker: month band, year, and the issuing station. */
function stickerTexture(): THREE.CanvasTexture {
  const W = 384, H = 496;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#e8e2cf';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d4a2e';
  ctx.fillRect(0, 0, W, H * 0.30);
  ctx.fillStyle = '#e8e2cf';
  ctx.font = `700 ${Math.round(H * 0.155)}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PA', W / 2, H * 0.155);

  ctx.fillStyle = '#1d2a4a';
  ctx.font = `700 ${Math.round(H * 0.34)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('9', W / 2, H * 0.53);
  ctx.font = `700 ${Math.round(H * 0.13)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('88', W / 2, H * 0.755);
  ctx.font = `500 ${Math.round(H * 0.065)}px Helvetica, Arial, sans-serif`;
  ctx.fillText('INSPECTION', W / 2, H * 0.885);
  ctx.strokeStyle = '#1d2a4a';
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, W - 18, H - 18);

  // Sun-bleached and slightly grubby, like everything on a 1980s windscreen.
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#6b6252';
  for (let i = 0; i < 700; i++) {
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

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

  // --- Pennsylvania inspection sticker -------------------------------------
  {
    // The windscreen is the plane through the cowl and the header.
    const up = new THREE.Vector3(0, HP.headerY - HP.cowlY, HP.headerZ - HP.cowlZ).normalize();
    const n = new THREE.Vector3(0, -up.z, up.y).normalize();
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), up, n);

    const z = -1.148;
    const k = (z - HP.cowlZ) / (HP.headerZ - HP.cowlZ);
    const y = HP.cowlY + k * (HP.headerY - HP.cowlY);

    const plane = new THREE.PlaneGeometry(0.052, 0.067);
    const sticker = new THREE.Mesh(plane, ctx.materials.printed(stickerTexture(), { roughness: 0.55, clearcoat: 0.1 }));
    sticker.name = 'inspectionSticker';
    sticker.quaternion.setFromRotationMatrix(basis);
    // Applied on the inside of the glass, passenger side, high in the corner.
    sticker.position.set(0.452, y, z).addScaledVector(n, -0.004);
    group.add(sticker);
  }

  void at;
  return group;
}

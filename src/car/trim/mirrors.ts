/**
 * The door mirrors.
 *
 * *"Large black aero mirror, wedge/teardrop plan-form, mounted on the door
 * skin at the base of the A-pillar on a short integrated stalk with a
 * triangular sail panel"* (§2.2), power and heated on every US car (§6.7), and
 * clearly visible in the reference photograph.
 *
 * The teardrop points FORWARD: the housing is small and rounded where it meets
 * the stalk and swells to full section at the back, where the glass is.
 * Getting that round the wrong way is the commonest mistake with this shape.
 *
 * `HP.side.mirrorBase` nominates x = 0.895, which is 46 mm outboard of the
 * built sail panel, and its y sits right where the skin rolls over into the
 * DLO. The foot is therefore snapped onto the actual surface and the
 * hardpoint's y and z used as given; the housing reaches out to
 * `BODY.widthOverMirrors`, which is what the published width across the
 * mirrors actually measures.
 */

import * as THREE from 'three';
import { BODY } from '@/spec';
import { HP } from '@/car/hardpoints';
import type { BuildContext } from '@/types';
import { skinFrame } from './bodyref';
import { clamp, lerp, merge, mesh, mirrorX, smoothstep, sweep, type Frame, type Pt } from './util';

const S = HP.side;
const LEN = S.mirrorSize[2];
const HEIGHT = S.mirrorSize[1];

/** Superellipse section — a moulded housing, not a box and not a cylinder. */
function shellSection(hw: number, hh: number, n = 2.7, steps = 22): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([
      Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * hw,
      Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * hh,
    ]);
  }
  return pts;
}

export function buildMirrors(ctx: BuildContext): { group: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'mirrors';

  const shell = ctx.materials.bumperPlastic();
  const dark = ctx.materials.blackTrim();
  // A door mirror is a first-surface mirror: the library's chrome, polished
  // right down, is exactly the right material and costs nothing extra.
  const glassMat = ctx.materials.chrome({ roughness: 0.012 });

  const base = skinFrame(S.mirrorBase[2], S.mirrorBase[1]);
  const footX = base.o.x;

  const cz = S.mirrorBase[2] + S.mirrorOffset[2];
  const cy = S.mirrorBase[1] + S.mirrorOffset[1];
  const outer = BODY.widthOverMirrors / 2 - 0.008;
  const inner = footX + 0.026;
  const width = outer - inner;
  const cx = (inner + outer) / 2;

  const zFront = cz + LEN * 0.46;
  const zRear = cz - LEN * 0.54;

  // --- housing -------------------------------------------------------------
  const nz = 26;
  const frames: Frame[] = [];
  const secs: Pt[][] = [];
  for (let i = 0; i <= nz; i++) {
    const t = i / nz;
    // Swells quickly out of the stalk, then holds full section to the glass.
    const grow = lerp(0.14, 1, smoothstep(clamp(t * 1.30, 0, 1)));
    // ...and rolls off again over the last few millimetres so the rear face is
    // a radiused rim round the glass rather than a cut-off tube.
    const close = 1 - 0.16 * smoothstep(clamp((t - 0.90) / 0.10, 0, 1));
    const k = grow * close;
    frames.push({
      o: new THREE.Vector3(
        lerp(inner + width * 0.42, cx, smoothstep(clamp(t * 1.3, 0, 1))),
        cy + (1 - grow) * 0.008,
        lerp(zFront, zRear, t),
      ),
      r: new THREE.Vector3(1, 0, 0),
      u: new THREE.Vector3(0, 1, 0),
    });
    secs.push(shellSection((width / 2) * k, (HEIGHT / 2) * k));
  }
  const housing = sweep((j) => secs[j], frames, { closed: true, capStart: true, capEnd: true, uvScale: 0.06 });

  // --- stalk ---------------------------------------------------------------
  // A short wedge off the sail panel: tall and thin where it leaves the body,
  // compact and deep where it disappears into the housing.
  const ns = 12;
  const stalkFrames: Frame[] = [];
  const stalkSecs: Pt[][] = [];
  for (let i = 0; i <= ns; i++) {
    const t = i / ns;
    stalkFrames.push({
      o: new THREE.Vector3(
        lerp(footX - 0.010, inner + width * 0.30, t),
        lerp(S.mirrorBase[1] - 0.004, cy + 0.004, t),
        lerp(S.mirrorBase[2] - 0.006, cz + LEN * 0.20, t),
      ),
      r: new THREE.Vector3(0, 0, 1),
      u: new THREE.Vector3(0, 1, 0),
    });
    stalkSecs.push(shellSection(lerp(0.052, 0.036, t), lerp(0.036, 0.030, t), 2.4, 16));
  }
  const stalk = sweep((j) => stalkSecs[j], stalkFrames, { closed: true, capStart: true, capEnd: true, uvScale: 0.06 });

  const right = merge([housing, stalk]);
  group.add(mesh('mirrorShells', merge([right, mirrorX(right)]), shell));

  // --- sail-panel plinth ---------------------------------------------------
  const plinth = new THREE.Mesh(new THREE.CircleGeometry(0.046, 20), dark);
  plinth.name = 'mirrorSailRight';
  plinth.scale.set(1.25, 0.72, 1);
  plinth.position.copy(base.o).addScaledVector(base.n, 0.0018);
  plinth.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(base.along, base.up, base.n));
  const plinthL = plinth.clone();
  plinthL.name = 'mirrorSailLeft';
  plinthL.position.x *= -1;
  plinthL.scale.x *= -1;
  group.add(plinth, plinthL);

  // --- glass ---------------------------------------------------------------
  // Convex, as a period door mirror is, so it gathers a wide reflection and
  // never shows the flat, dead sheet a plane mirror does.
  const gw = width * 0.78;
  const gh = HEIGHT * 0.74;
  const seg = 20;
  const pos: number[] = [];
  const idx: number[] = [];
  const uv: number[] = [];
  for (let iy = 0; iy <= seg; iy++) {
    for (let ix = 0; ix <= seg; ix++) {
      const u = ix / seg;
      const v = iy / seg;
      // Square domain pushed onto a rounded rectangle, so the pane fills the
      // housing's opening instead of sitting in it as a disc.
      const sx = (u * 2 - 1);
      const sy = (v * 2 - 1);
      const r = Math.max(Math.abs(sx), Math.abs(sy));
      const soft = r < 1e-6 ? 0 : Math.pow(r, 2.6) / r;
      const x = sx * (gw / 2) * lerp(1, soft, 0.30);
      const y = sy * (gh / 2) * lerp(1, soft, 0.30);
      const d = clamp((x / (gw / 2)) ** 2 + (y / (gh / 2)) ** 2, 0, 1);
      pos.push(cx + x, cy + y, zRear + 0.013 + 0.0055 * (1 - d));
      uv.push(u, v);
    }
  }
  for (let iy = 0; iy < seg; iy++) {
    for (let ix = 0; ix < seg; ix++) {
      const a = iy * (seg + 1) + ix;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const pane = new THREE.BufferGeometry();
  pane.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pane.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  pane.setIndex(idx);
  pane.computeVertexNormals();

  group.add(mesh('mirrorGlass', merge([pane, mirrorX(pane)]), glassMat));

  return { group };
}

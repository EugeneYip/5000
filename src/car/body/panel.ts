/**
 * Panel builder.
 *
 * A body panel is a quad grid sampled from the master surface plus a *rolled
 * edge* around whichever of its four boundaries are free. The rolled edge is
 * the whole point: a pressed steel panel turns through ~90° over a small
 * radius and then returns inward as a flange, and it is the highlight running
 * along that radius that makes a car read as metal. A panel that simply stops
 * at a sharp boundary catches no highlight and looks like cardboard.
 *
 * Together with the panel-gap inset the caller applies, that also produces a
 * real geometric gap with a dark recess behind it, rather than a painted line.
 *
 * Vertex normals for the face come from the analytic surface, not from the
 * triangles, so two panels that butt against each other (roof to pillar, say)
 * shade continuously even though they are separate meshes; panels separated by
 * a gap get a hard break for free because the rolled edge turns away.
 */

import * as THREE from 'three';

export interface GridSample {
  p: THREE.Vector3;
  n: THREE.Vector3;
  /** Surface coordinates in metres, so paint grain runs continuously. */
  u: number;
  v: number;
}

export interface EdgeOpt {
  /** Fillet radius. 0 disables the rolled edge on that side entirely. */
  radius?: number;
  /** How far the flange returns inward behind the visible edge. */
  flange?: number;
}

export interface ShellOpts {
  /** a runs 0→1 across the first grid axis, b across the second. */
  sample: (a: number, b: number) => GridSample;
  na: number;
  nb: number;
  edges?: { a0?: EdgeOpt; a1?: EdgeOpt; b0?: EdgeOpt; b1?: EdgeOpt };
}

const ARC_STEPS = 3;

/** Build a panel: face grid + rolled edge + flange. */
export function buildShell(opts: ShellOpts): THREE.BufferGeometry {
  const { sample, na, nb } = opts;
  const e = opts.edges ?? {};
  const rA0 = e.a0?.radius ?? 0, fA0 = e.a0?.flange ?? 0;
  const rA1 = e.a1?.radius ?? 0, fA1 = e.a1?.flange ?? 0;
  const rB0 = e.b0?.radius ?? 0, fB0 = e.b0?.flange ?? 0;
  const rB1 = e.b1?.radius ?? 0, fB1 = e.b1?.flange ?? 0;

  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];

  // --- face -----------------------------------------------------------------
  const grid: THREE.Vector3[][] = [];
  const gnrm: THREE.Vector3[][] = [];
  for (let i = 0; i < na; i++) {
    const a = na === 1 ? 0 : i / (na - 1);
    const row: THREE.Vector3[] = [];
    const nrow: THREE.Vector3[] = [];
    for (let j = 0; j < nb; j++) {
      const b = nb === 1 ? 0 : j / (nb - 1);
      const s = sample(a, b);
      row.push(s.p.clone());
      nrow.push(s.n.clone());
      pos.push(s.p.x, s.p.y, s.p.z);
      nor.push(s.n.x, s.n.y, s.n.z);
      uvs.push(s.u, s.v);
    }
    grid.push(row);
    gnrm.push(nrow);
  }
  const at = (i: number, j: number): number => i * nb + j;
  for (let i = 0; i < na - 1; i++) {
    for (let j = 0; j < nb - 1; j++) {
      idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      idx.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }

  // --- perimeter walk -------------------------------------------------------
  // Ordered ring of (i, j) around the grid, with the matching one-step-inward
  // neighbour used to derive the outward direction. The ring is traversed so
  // the generated skirt keeps a consistent winding.
  type Ring = { i: number; j: number; ii: number; jj: number; r: number; f: number };
  const ring: Ring[] = [];
  const push = (i: number, j: number, ii: number, jj: number, r: number, f: number): void => {
    ring.push({ i, j, ii, jj, r, f });
  };
  const cornerR = (r1: number, r2: number): number => Math.max(r1, r2);

  const iin = na > 1 ? 1 : 0;
  const jin = nb > 1 ? 1 : 0;

  // b = 0 edge, walking a upward
  for (let i = 0; i < na; i++) {
    const r = i === 0 ? cornerR(rB0, rA0) : i === na - 1 ? cornerR(rB0, rA1) : rB0;
    const f = i === 0 ? cornerR(fB0, fA0) : i === na - 1 ? cornerR(fB0, fA1) : fB0;
    push(i, 0, i, jin, r, f);
  }
  // a = na-1 edge, walking b upward
  for (let j = 1; j < nb; j++) {
    const r = j === nb - 1 ? cornerR(rA1, rB1) : rA1;
    const f = j === nb - 1 ? cornerR(fA1, fB1) : fA1;
    push(na - 1, j, na - 1 - iin, j, r, f);
  }
  // b = nb-1 edge, walking a downward
  for (let i = na - 2; i >= 0; i--) {
    const r = i === 0 ? cornerR(rB1, rA0) : rB1;
    const f = i === 0 ? cornerR(fB1, fA0) : fB1;
    push(i, nb - 1, i, nb - 1 - jin, r, f);
  }
  // a = 0 edge, walking b downward
  for (let j = nb - 2; j >= 1; j--) {
    push(0, j, iin, j, rA0, fA0);
  }

  const ringLen = ring.length;
  if (ringLen > 2) {
    const outw: THREE.Vector3[] = [];
    const nrm: THREE.Vector3[] = [];
    const baseIdx: number[] = [];
    const tmp = new THREE.Vector3();

    for (const e2 of ring) {
      const P = grid[e2.i][e2.j];
      const Q = grid[e2.ii][e2.jj];
      const n = gnrm[e2.i][e2.j];
      tmp.copy(P).sub(Q);
      tmp.addScaledVector(n, -tmp.dot(n));
      if (tmp.lengthSq() < 1e-12) tmp.set(0, 0, 1).addScaledVector(n, -n.z);
      tmp.normalize();
      outw.push(tmp.clone());
      nrm.push(n.clone());
      baseIdx.push(at(e2.i, e2.j));
    }

    // Rings: ARC_STEPS around the fillet, then one flange tip.
    const rings: number[][] = [];
    for (let s = 1; s <= ARC_STEPS + 1; s++) {
      const rowStart = pos.length / 3;
      const rowIdx: number[] = [];
      for (let k = 0; k < ringLen; k++) {
        const P = grid[ring[k].i][ring[k].j];
        const r = ring[k].r;
        const f = ring[k].f;
        const o = outw[k];
        const n = nrm[k];
        let px: number, py: number, pz: number, nx: number, ny: number, nz: number;
        if (s <= ARC_STEPS) {
          const th = (Math.PI / 2) * (s / ARC_STEPS);
          const st = Math.sin(th), ct = Math.cos(th);
          px = P.x + o.x * r * st - n.x * r * (1 - ct);
          py = P.y + o.y * r * st - n.y * r * (1 - ct);
          pz = P.z + o.z * r * st - n.z * r * (1 - ct);
          nx = n.x * ct + o.x * st;
          ny = n.y * ct + o.y * st;
          nz = n.z * ct + o.z * st;
        } else {
          // Flange: straight back into the body, angled very slightly inboard
          // so the recess reads dark rather than catching the key light.
          px = P.x + o.x * r * 0.86 - n.x * (r + f);
          py = P.y + o.y * r * 0.86 - n.y * (r + f);
          pz = P.z + o.z * r * 0.86 - n.z * (r + f);
          nx = o.x; ny = o.y; nz = o.z;
        }
        pos.push(px, py, pz);
        nor.push(nx, ny, nz);
        const uvRef = (baseIdx[k] * 2);
        uvs.push(uvs[uvRef], uvs[uvRef + 1]);
        rowIdx.push(rowStart + k);
      }
      rings.push(rowIdx);
    }

    let prev = baseIdx;
    for (const cur of rings) {
      for (let k = 0; k < ringLen; k++) {
        const k2 = (k + 1) % ringLen;
        idx.push(prev[k], cur[k], cur[k2]);
        idx.push(prev[k], cur[k2], prev[k2]);
      }
      prev = cur;
    }
  }

  // The (a, b) parameterisation of a panel may run either way round depending
  // on which side of the car it is on, so decide the winding from the surface
  // normal rather than making every caller get it right.
  if (na > 1 && nb > 1) {
    const e0 = grid[1][0].clone().sub(grid[0][0]);
    const e1 = grid[0][1].clone().sub(grid[0][0]);
    if (e0.cross(e1).dot(gnrm[0][0]) < 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const t0 = idx[i];
        idx[i] = idx[i + 2];
        idx[i + 2] = t0;
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(pos.length / 3 > 65535
    ? new THREE.BufferAttribute(new Uint32Array(idx), 1)
    : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

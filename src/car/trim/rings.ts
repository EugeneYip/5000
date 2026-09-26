/**
 * The four rings.
 *
 * The one piece of this car everybody knows by heart, so the proportion has to
 * be exact: `HP.front.ringSpacing / HP.front.ringDiameter` is 0.769, which is
 * what makes the overlap read as Audi's and not as a generic four-circle mark.
 * Both numbers live in the hardpoints; nothing here invents one.
 *
 * Period badges are a chromed casting, not the flat modern logo — §2.6 calls
 * them "noticeably chunkier". So each ring is a torus of real section rather
 * than a ribbon, the section is slightly flattened in the viewing direction the
 * way a polished casting is, and consecutive rings are stepped a fraction of a
 * tube radius fore and aft so they genuinely interlock instead of intersecting.
 */

import * as THREE from 'three';
import { HP } from '@/car/hardpoints';
import { merge, sweep, type Frame, type Pt } from './util';

export interface RingOpts {
  /** Outer diameter of one ring. Defaults to the front grille badge. */
  diameter?: number;
  /** Centre-to-centre spacing. Scales with `diameter` if only that is given. */
  spacing?: number;
  tube?: number;
  /** Segments around the ring and around its section. */
  around?: number;
  section?: number;
}

/**
 * Four interlocking rings in the XY plane, facing +Z, centred on the origin.
 * The returned geometry is a single mesh — four rings is four tori, but it is
 * one draw call.
 */
export function fourRings(o: RingOpts = {}): THREE.BufferGeometry {
  const diameter = o.diameter ?? HP.front.ringDiameter;
  const k = diameter / HP.front.ringDiameter;
  const spacing = o.spacing ?? HP.front.ringSpacing * k;
  const tube = o.tube ?? HP.front.ringTubeRadius * k;
  const around = o.around ?? 52;
  const nSec = o.section ?? 12;

  /** Centreline radius: the diameter quoted is the OUTSIDE of the ring. */
  const radius = diameter / 2 - tube;

  // Section of the casting: a circle flattened ~18 % front-to-back, with the
  // front face slightly proud so the chrome carries one broad highlight
  // instead of a thin rim reflection.
  const section: Pt[] = [];
  for (let i = 0; i < nSec; i++) {
    const a = (i / nSec) * Math.PI * 2;
    section.push([Math.cos(a) * tube, Math.sin(a) * tube * 0.82]);
  }

  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 4; r++) {
    const cx = (r - 1.5) * spacing;
    // Weave: alternate rings sit a shade fore and aft of the badge plane, so
    // the overlaps read as four separate loops threaded together.
    const cz = (r % 2 === 0 ? 1 : -1) * tube * 0.46;

    const frames: Frame[] = [];
    for (let i = 0; i <= around; i++) {
      const a = (i / around) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      frames.push({
        o: new THREE.Vector3(cx + ca * radius, sa * radius, cz),
        // Section-right is radially outward; section-up is the badge normal.
        r: new THREE.Vector3(ca, sa, 0),
        u: new THREE.Vector3(0, 0, 1),
      });
    }
    parts.push(sweep(section, frames, { closed: true }));
  }
  return merge(parts);
}

/** Overall width of a four-ring badge, for fitting it into a panel. */
export function ringsWidth(diameter = HP.front.ringDiameter): number {
  const k = diameter / HP.front.ringDiameter;
  return 3 * HP.front.ringSpacing * k + diameter;
}

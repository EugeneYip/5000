/**
 * The one place this stream reads the body's surface.
 *
 * Trim is bolted *to* sheet metal: a rub strip has to lie on the door skin, a
 * mirror foot has to sit on the sail panel, a roof-rail leg has to land on the
 * roof. The hardpoints give the station and the height of each of those, but
 * not the half-width or the surface normal there — and a strip that floats
 * 20 mm off the flank is worse than no strip at all. (Measured: the hardpoints'
 * nominal X for the door handles and the mirror base stand 30 mm and 46 mm
 * outside the built surface respectively, so this is not hypothetical.)
 *
 * So this module imports the body stream's *read-only* analytic surface and
 * nothing else, and every other file here goes through it. If `src/car/body`
 * moves those queries, this is the only file that needs touching.
 */

import * as THREE from 'three';
import { T, tAtX, tAtY, halfWidthAt, heightAt, surfaceNormal, surfacePoint, topAt } from '@/car/body/surface';
import { noseFaceZ, noseHalfWidth, rearFaceZ, rearHalfWidth, tRoofOuter } from '@/car/body/panels';

export { noseFaceZ, noseHalfWidth, rearFaceZ, rearHalfWidth, topAt };

/** Half-width of the body side at station `z` and height `y`. */
export function sideX(z: number, y: number): number {
  return halfWidthAt(z, tAtY(z, y));
}

/** Outward normal of the body side at station `z` and height `y`, right side. */
export function sideNormal(z: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfaceNormal(z, tAtY(z, y), out);
}

/** Point on the right-hand body side at station `z` and height `y`. */
export function sidePoint(z: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfacePoint(z, tAtY(z, y), out);
}

/** Height of the skin at station `z` and half-width `x` — used for the roof. */
export function skinY(z: number, x: number): number {
  return heightAt(z, tAtX(z, x));
}

/** Outward normal of the skin at station `z` and half-width `x`. */
export function skinNormal(z: number, x: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfaceNormal(z, tAtX(z, x), out);
}

/**
 * Inboard end of the roof's turn-down. Not the joint — use this only for
 * things that sit *up on* the roof skin, like the rails' feet.
 */
export function roofEdgePoint(z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfacePoint(z, T.roofEdge, out);
}

export function roofEdgeNormal(z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfaceNormal(z, T.roofEdge, out);
}

/**
 * The roof-to-bodyside joint proper. The C3 deleted the projecting drip rail,
 * so the moulding that replaces it has to sit exactly on this line (§2.2) —
 * and the line is `tRoofOuter`, ~16 mm of arc outboard of `T.roofEdge`. That
 * is the parameter the body cuts every panel that meets the daylight opening
 * to: roof skin, A-, B-, C- and D-pillars, and the tailgate's side shutline.
 */
export function roofOuterPoint(z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfacePoint(z, tRoofOuter(z), out);
}

export function roofOuterNormal(z: number, out = new THREE.Vector3()): THREE.Vector3 {
  return surfaceNormal(z, tRoofOuter(z), out);
}

/**
 * A local frame on the right-hand body side: outward normal, the +Z direction
 * projected into the skin, and up. Everything that bolts flat to the flank —
 * handles, the fuel flap, badges — is built in one of these.
 */
export interface SkinFrame {
  o: THREE.Vector3;
  n: THREE.Vector3;
  along: THREE.Vector3;
  up: THREE.Vector3;
}

export function skinFrame(z: number, y: number): SkinFrame {
  const o = sidePoint(z, y);
  const n = sideNormal(z, y);
  const along = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
  const up = new THREE.Vector3().crossVectors(along, n).normalize();
  return { o, n, along, up };
}

/** Orient an object built in XY (facing +Z) onto a skin frame. */
export function placeOnSkin(obj: THREE.Object3D, f: SkinFrame, lift = 0): void {
  const m = new THREE.Matrix4().makeBasis(f.along, f.up, f.n);
  obj.quaternion.setFromRotationMatrix(m);
  obj.position.copy(f.o).addScaledVector(f.n, lift);
}

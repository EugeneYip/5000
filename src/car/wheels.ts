/**
 * Wheels, tyres and brakes.
 *
 * One wheel is built and instanced four times. Left-hand corners are turned
 * 180 degrees about Y rather than mirrored, because that is how a real wheel
 * is fitted — the same casting goes on both sides — and because a negative
 * scale inverts every triangle's winding.
 *
 * Node hierarchy per corner:
 *
 *     wheelFL            placed by `wheelPositions()`, carries suspension travel
 *       steer            steering angle, front axle only
 *         align          static camber and toe from `WHEEL`
 *           hubSpin      rim + brake rotor. Turns.
 *           upright      caliper, pads, hose, shield. **Never turns.**
 *           tyre         turned and squashed in the vertex stage
 *           spinBlur     fades in to kill spoke strobing
 *
 * A caliper that rotates with the wheel is an instant tell, so it is hung off
 * `upright`, which nothing ever rotates.
 */

import * as THREE from 'three';
import { BODY, STEERING, SUSPENSION, wheelPositions } from '@/spec';
import type { BuildContext, PartResult, VehicleState } from '@/types';
import { alignment, FACE, FLANGE_R } from './wheels/dims';
import { buildRim, SPIDER_FACE_X } from './wheels/rim';
import { buildTyre, deflectionFor } from './wheels/tyre';
import { buildBrakes } from './wheels/brakes';
import { buildSpinBlurMap } from './wheels/textures';
import { smoothstep, triangles } from './wheels/util';

const TAU = Math.PI * 2;
/** Spin rate over which the slots start to strobe against the frame rate. */
const BLUR_FROM = 20;
const BLUR_TO = 56;

interface Corner {
  node: THREE.Group;
  steer: THREE.Group;
  hub: THREE.Group;
  blur: THREE.Mesh;
  front: boolean;
  /** +1 for the right of the car, −1 for the left. */
  sideSign: number;
  baseY: number;
  angle: number;
  deflect: number;
}

export function buildWheels(ctx: BuildContext): PartResult {
  const group = new THREE.Group();

  // --- shared parts -------------------------------------------------------
  const rim = buildRim(ctx);
  const tyre = buildTyre(ctx);

  const blurGeo = new THREE.CircleGeometry(FLANGE_R * 0.995, 48);
  blurGeo.rotateY(Math.PI / 2);
  blurGeo.translate(SPIDER_FACE_X + 0.0012, 0, 0);
  const blurMap = buildSpinBlurMap(
    FACE.slotInnerR / FLANGE_R,
    FACE.slotOuterR / FLANGE_R,
    FACE.slotSpanDeg / (360 / FACE.slots),
  );

  /**
   * One material for all four discs, from the library rather than four local
   * `MeshStandardMaterial`s — which were four programs, and which `setEnvMap`
   * could never reach.
   *
   * `printed()` is the only entry that takes a map, and it keys on the map's
   * identity, so this instance is the wheel stream's alone; the three blending
   * flags below are set on it because the library has no option for them. They
   * are what the part *is* — a fade-in overlay — not a finish, and a library
   * `printed({ transparent })` would be the right home for them.
   */
  const blurMat = ctx.materials.printed(blurMap, { roughness: 0.48, envMapIntensity: 0.9 });
  blurMat.transparent = true;
  blurMat.opacity = 0;
  blurMat.depthWrite = false;

  const brakes = {
    frontRight: buildBrakes(ctx, true, false),
    frontLeft: buildBrakes(ctx, true, true),
    rearRight: buildBrakes(ctx, false, false),
    rearLeft: buildBrakes(ctx, false, true),
  };

  // --- corners ------------------------------------------------------------
  const pos = wheelPositions();
  const layout: Array<{ key: 'wheelFL' | 'wheelFR' | 'wheelRL' | 'wheelRR'; p: [number, number, number]; front: boolean; left: boolean }> = [
    { key: 'wheelFL', p: pos.fl, front: true, left: true },
    { key: 'wheelFR', p: pos.fr, front: true, left: false },
    { key: 'wheelRL', p: pos.rl, front: false, left: true },
    { key: 'wheelRR', p: pos.rr, front: false, left: false },
  ];

  const corners: Corner[] = [];
  const nodes: Record<string, THREE.Object3D> = {};

  for (const { key, p, front, left } of layout) {
    const node = new THREE.Group();
    node.name = key;
    node.position.set(p[0], p[1], p[2]);
    // The same wheel, turned round, rather than a mirrored one.
    if (left) node.rotation.y = Math.PI;

    const steer = new THREE.Group();
    steer.name = `${key}_steer`;
    const align = new THREE.Group();
    align.name = `${key}_align`;
    const hub = new THREE.Group();
    hub.name = `${key}_hub`;
    const upright = new THREE.Group();
    upright.name = `${key}_upright`;

    const sideSign = left ? -1 : 1;
    const { camberRad, toeRad } = alignment(front);
    align.rotation.z = camberRad;
    align.rotation.y = -sideSign * toeRad;

    hub.add(rim.group.clone());
    if (key === 'wheelFL') hub.add(rim.kerbRash);

    const brake = front ? (left ? brakes.frontLeft : brakes.frontRight) : left ? brakes.rearLeft : brakes.rearRight;
    hub.add(brake.rotating);
    upright.add(brake.fixed);

    const tyreMesh = new THREE.Mesh(tyre.mesh.geometry, tyre.mesh.material);
    tyreMesh.name = `${key}_tyre`;
    tyreMesh.customDepthMaterial = tyre.mesh.customDepthMaterial;

    const blur = new THREE.Mesh(blurGeo, blurMat);
    blur.name = `${key}_spinBlur`;
    blur.visible = false;
    blur.castShadow = false;
    blur.receiveShadow = false;
    blur.renderOrder = 3;

    align.add(hub, upright, tyreMesh, blur);
    steer.add(align);
    node.add(steer);
    group.add(node);

    const corner: Corner = {
      node, steer, hub, blur,
      front, sideSign, baseY: p[1], angle: 0, deflect: 0,
    };
    corners.push(corner);
    nodes[key] = node;
    nodes[`hub${key.slice(5)}`] = hub;
    nodes[`upright${key.slice(5)}`] = upright;

    // One material, four tyres: the per-corner spin and squash are pushed in
    // just before each draw rather than by cloning the material four times.
    tyreMesh.onBeforeRender = (): void => {
      tyre.uniforms.uSpin.value = corner.sideSign * corner.angle;
      tyre.uniforms.uDeflect.value = corner.deflect;
    };
  }

  // Initialise to the static ride so the very first frame is already right.
  for (const c of corners) c.deflect = deflectionFor(0.5);

  {
    const per = (o: THREE.Object3D): number => triangles(o);
    const c0 = corners[0];
    console.info('[wheels] total', triangles(group),
      'rim', per(rim.group), 'tyre', tyre.triangles,
      'brakeRot', per(brakes.frontRight.rotating), 'brakeFix', per(brakes.frontRight.fixed),
      'rearRot', per(brakes.rearRight.rotating), 'rearFix', per(brakes.rearRight.fixed),
      'corner0', per(c0.node));
  }
  ctx.progress(1, 'wheels');

  return {
    group,
    nodes,
    update(dt: number, _elapsed: number, state: VehicleState): void {
      let blurPeak = 0;
      for (let i = 0; i < 4; i++) {
        const c = corners[i];
        const comp = clamp01(state.suspensionCompression?.[i] ?? 0.5);
        const susp = c.front ? SUSPENSION.front : SUSPENSION.rear;
        const travel = comp > 0.5 ? susp.travelUp : susp.travelDown;
        c.node.position.y = c.baseY + (comp - 0.5) * 2 * travel;

        if (c.front) {
          c.steer.rotation.y = -steerFor(state.steerAngle ?? 0, c.sideSign < 0);
        }

        const omega = state.wheelSpin?.[i] ?? 0;
        c.angle = (c.angle + omega * dt) % TAU;
        c.hub.rotation.x = c.sideSign * c.angle;

        const airborne = state.wheelContact?.[i] === false;
        c.deflect = airborne ? 0.0015 : deflectionFor(comp);

        const k = smoothstep(BLUR_FROM, BLUR_TO, Math.abs(omega)) * 0.94;
        c.blur.visible = k > 0.012;
        if (k > blurPeak) blurPeak = k;
      }
      // One material means one opacity. Each disc still appears at its own
      // corner's threshold; what they share is the level, taken from the
      // fastest wheel. The four only diverge under wheelspin or a locked
      // brake, and by then the wheel that is out of step is at the far end of
      // the fade where a tenth of opacity is not a thing anyone can see.
      blurMat.opacity = blurPeak;
    },
  };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Ackermann steering. The inner wheel has to turn further than the outer or
 * the front tyres fight each other through every car-park manoeuvre; real
 * racks only get part of the way there, hence `STEERING.ackermann`.
 * `delta` is positive for a left turn.
 */
function steerFor(delta: number, isLeftWheel: boolean): number {
  const mag = Math.abs(delta);
  if (mag < 1e-4) return delta;
  const L = BODY.wheelbase;
  const halfTrack = BODY.trackFront / 2;
  const turnRadius = L / Math.tan(mag);
  const inner = Math.atan(L / Math.max(turnRadius - halfTrack, L * 0.08));
  const outer = Math.atan(L / (turnRadius + halfTrack));
  const k = STEERING.ackermann;
  const isInner = delta > 0 ? isLeftWheel : !isLeftWheel;
  const target = isInner ? mag + (inner - mag) * k : mag + (outer - mag) * k;
  return Math.sign(delta) * target;
}

/** Exposed for the triangle-budget check in the harness. */
export function wheelTriangles(result: PartResult): number {
  return triangles(result.group);
}

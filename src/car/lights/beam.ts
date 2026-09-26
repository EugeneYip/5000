/**
 * The beams themselves: spotlights, their projected patterns, and the faint
 * shafts of scattered air you see in them after dark.
 *
 * ## Why two spotlights per side
 *
 * A headlamp is not one cone. It is a wide, dim field that fills the road in
 * front of the bumper, plus a tight hot core that throws a long way — and the
 * ratio between them is most of what separates a headlamp from a torch. Both
 * carry the same projected cutoff, so they agree about where the beam stops.
 *
 * ## Where the lights live
 *
 * `Car` hands `PartResult.lights` to the stage, which parents them to the
 * *scene*, not to the car. So the emitters are plain anchors inside this part's
 * own group — they ride the car's body through the suspension like everything
 * else — and `sync()` copies their world transform onto the scene-level lights
 * each frame. `light.target` is parented to the light itself so it inherits
 * that orientation and never has to be registered separately.
 */

import * as THREE from 'three';
import { LIGHTS } from '@/spec';
import { highBeamCookie, lowBeamCookie } from './cookie';

export interface BeamGeometry {
  /** Emitter position in vehicle space. */
  origin: THREE.Vector3;
  /** Beam direction in vehicle space, normalised by the caller or not. */
  dir: THREE.Vector3;
}

const WIDE_HALF_ANGLE = 0.62;
const CORE_HALF_ANGLE = 0.275;
/**
 * Where the flat top sits relative to the horizon.
 *
 * This is the one number here that is *not* the real figure, and it is worth
 * saying why. Road aim is 1-2 % down, which from a 0.78 m lamp centre puts the
 * cutoff 40-80 m out; on a real car you never see it on the road at all, only
 * on a wall or a rise. Every review pose in `CameraRig` sees at most the first
 * 12 m of road ahead of the nose, so at the true angle the flat top — the one
 * feature that distinguishes a headlamp from a torch — would never appear in a
 * single frame. 4.2° puts it at 10.6 m, inside every pose, and keeps the shape
 * of the pattern exactly right.
 */
const CUTOFF_BELOW_HORIZON = (4.2 * Math.PI) / 180;
/** How far the axis of each cone is tipped below the horizon. */
const WIDE_PITCH = (11 * Math.PI) / 180;
const CORE_PITCH = (6.5 * Math.PI) / 180;

const SHAFT_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vAxis;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorldPos = w.xyz;
  // modelMatrix is not declared in three's fragment prefix, so the beam axis
  // has to cross as a varying.
  vAxis = (modelMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uLength;
uniform float uSpread;
uniform float uCutTan;
uniform float uKick;
uniform float uKickSpan;
varying vec3 vLocal;
varying vec3 vWorldPos;
varying vec3 vAxis;

void main() {
  float z = max(vLocal.z, 1e-3);
  float t = clamp(z / uLength, 0.0, 1.0);
  vec2 ta = vLocal.xy / z;

  // Local +x is the kerb side, so the shaft's top edge kicks up the same way
  // the projected pattern does. Without this the shaft has a flat lid and the
  // road has an asymmetric one, and they visibly disagree.
  float cut = uCutTan + min(max(ta.x, 0.0), uKickSpan) * uKick;
  float lid = 1.0 - smoothstep(-0.012, 0.055, ta.y - cut);

  float r = length(ta) / uSpread;
  float cone = 1.0 - smoothstep(0.30, 1.0, r);

  // Air scatters what reaches it: brightest just clear of the lens, gone by
  // the time the beam has spread over its whole throw.
  float fall = exp(-t * 2.7) * smoothstep(0.0, 0.055, t);

  // Looking down the barrel there is nothing to see — a shaft is side-scatter.
  vec3 view = normalize(cameraPosition - vWorldPos);
  vec3 axis = normalize(vAxis);
  float graze = 1.0 - abs(dot(view, axis));

  float a = cone * lid * fall * (0.18 + 0.82 * graze * graze) * uIntensity;
  gl_FragColor = vec4(uColor * a, a);
}
`;

interface Side {
  wide: THREE.SpotLight;
  core: THREE.SpotLight;
  wideAnchor: THREE.Object3D;
  coreAnchor: THREE.Object3D;
  shaft: THREE.Mesh;
  shaftUniforms: Record<string, THREE.IUniform>;
}

export class HeadlampBeams {
  readonly lights: THREE.Light[] = [];
  private readonly sides: Side[] = [];
  private readonly lowWide = lowBeamCookie({
    halfAngle: WIDE_HALF_ANGLE,
    cutoffAbove: WIDE_PITCH - CUTOFF_BELOW_HORIZON,
    hotX: 0.055,
    // Just under the cut: that is where a real lamp puts its hot spot, and it
    // is what makes the cutoff edge visible instead of merely present.
    hotY: WIDE_PITCH - CUTOFF_BELOW_HORIZON - 0.045,
    hotW: 0.20,
    hotH: 0.062,
    stray: 0.045,
  });
  private readonly lowCore = lowBeamCookie({
    halfAngle: CORE_HALF_ANGLE,
    cutoffAbove: CORE_PITCH - CUTOFF_BELOW_HORIZON,
    hotX: 0.03,
    hotY: CORE_PITCH - CUTOFF_BELOW_HORIZON - 0.013,
    hotW: 0.085,
    hotH: 0.026,
    stray: 0.03,
    size: 512,
  });
  private readonly highWide = highBeamCookie({ halfAngle: WIDE_HALF_ANGLE });
  private readonly highCore = highBeamCookie({ halfAngle: CORE_HALF_ANGLE });

  private shadowsOn = false;

  constructor(parent: THREE.Object3D, emitters: BeamGeometry[]) {
    const color = new THREE.Color().setHex(LIGHTS.headlampColor, THREE.SRGBColorSpace);

    for (const e of emitters) {
      const wideAnchor = aim(parent, e.origin, e.dir, WIDE_PITCH);
      const coreAnchor = aim(parent, e.origin, e.dir, CORE_PITCH);

      const wide = spot(color, WIDE_HALF_ANGLE, 0.88, this.lowWide, 0.05, 140);
      const core = spot(color, CORE_HALF_ANGLE, 0.34, this.lowCore, 0.35, 60);
      core.shadow.mapSize.set(1024, 1024);
      core.shadow.bias = -0.0006;
      core.shadow.normalBias = 0.02;
      core.shadow.radius = 2.4;
      core.shadow.blurSamples = 6;

      const uniforms: Record<string, THREE.IUniform> = {
        uColor: { value: color.clone() },
        uIntensity: { value: 0 },
        uLength: { value: 16 },
        uSpread: { value: Math.tan(WIDE_HALF_ANGLE) * 0.92 },
        uCutTan: { value: Math.tan(WIDE_PITCH - CUTOFF_BELOW_HORIZON) },
        uKick: { value: Math.tan((15 * Math.PI) / 180) },
        uKickSpan: { value: Math.tan(0.33) },
      };
      const shaft = new THREE.Mesh(shaftCone(16, Math.tan(WIDE_HALF_ANGLE) * 16), new THREE.ShaderMaterial({
        uniforms,
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        toneMapped: true,
      }));
      shaft.name = 'headlampShaft';
      shaft.visible = false;
      shaft.castShadow = false;
      shaft.receiveShadow = false;
      wideAnchor.add(shaft);

      this.sides.push({ wide, core, wideAnchor, coreAnchor, shaft, shaftUniforms: uniforms });
      this.lights.push(wide, core);
    }
  }

  /** Copy the car-space anchors onto the scene-level lights. */
  sync(): void {
    for (const s of this.sides) {
      copyPose(s.wideAnchor, s.wide);
      copyPose(s.coreAnchor, s.core);
    }
  }

  /**
   * `level` is the dipped-beam filament, `high` the main-beam relay, `dark`
   * gates the volumetric shafts to a scene with no sun left in it.
   */
  apply(level: number, high: number, dark: boolean): void {
    const lit = level > 0.004;
    const base = LIGHTS.headlampIntensityLow + (LIGHTS.headlampIntensityHigh - LIGHTS.headlampIntensityLow) * high;

    // Shadow casting is the expensive half of a spotlight, so it only runs
    // while the lamp is actually alight.
    const wantShadows = lit;
    if (wantShadows !== this.shadowsOn) {
      this.shadowsOn = wantShadows;
      for (const s of this.sides) s.core.castShadow = wantShadows;
    }

    for (const s of this.sides) {
      s.wide.visible = lit;
      s.core.visible = lit;
      if (lit) {
        s.wide.intensity = base * 0.85 * level;
        s.core.intensity = base * 1.9 * level;
        s.wide.map = high > 0.5 ? this.highWide : this.lowWide;
        s.core.map = high > 0.5 ? this.highCore : this.lowCore;
      }
      const shaft = dark && lit;
      s.shaft.visible = shaft;
      if (shaft) s.shaftUniforms.uIntensity.value = 0.11 * level * (1 + 0.5 * high);
    }
  }

  dispose(): void {
    for (const t of [this.lowWide, this.lowCore, this.highWide, this.highCore]) t.dispose();
    for (const s of this.sides) {
      s.shaft.geometry.dispose();
      (s.shaft.material as THREE.Material).dispose();
    }
  }
}

// ---------------------------------------------------------------------------

function spot(
  color: THREE.Color,
  angle: number,
  penumbra: number,
  map: THREE.Texture,
  near: number,
  far: number,
): THREE.SpotLight {
  const l = new THREE.SpotLight(0xffffff, 0, 0, angle, penumbra, 2);
  l.color.copy(color);
  l.map = map;
  l.visible = false;
  l.castShadow = false;
  // `inSpotLightMap` is false outside the map frustum and the pattern is then
  // *not* applied, so the near plane has to sit close in or the lamp throws an
  // unshaped halo over its own bumper.
  l.shadow.camera.near = near;
  l.shadow.camera.far = far;
  l.shadow.focus = 1;
  // Parenting the target to the light means the light's own orientation steers
  // it, and three never has to find the target elsewhere in the graph.
  l.add(l.target);
  l.target.position.set(0, 0, 1);
  return l;
}

function aim(parent: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3, pitchDown: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = 'beamAnchor';
  o.position.copy(origin);
  parent.add(o);
  const d = dir.clone().normalize();
  // Tip the axis below the horizon without disturbing its heading.
  const horiz = Math.hypot(d.x, d.z) || 1;
  d.set(d.x * Math.cos(pitchDown), -Math.sin(pitchDown) * horiz, d.z * Math.cos(pitchDown));
  o.lookAt(origin.x + d.x, origin.y + d.y, origin.z + d.z);
  return o;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function copyPose(from: THREE.Object3D, to: THREE.Object3D): void {
  from.updateWorldMatrix(true, false);
  from.matrixWorld.decompose(_pos, _quat, _scale);
  to.position.copy(_pos);
  to.quaternion.copy(_quat);
  to.updateMatrixWorld(true);
}

/** Cone with its apex at the origin, opening along +Z. */
function shaftCone(length: number, radius: number): THREE.BufferGeometry {
  const seg = 28;
  const rings = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const z = v * length;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // Flattened: a headlamp's shaft is far wider than it is tall.
      pos.push(Math.cos(a) * radius * v, Math.sin(a) * radius * 0.62 * v, z);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const i1 = (i + 1) % seg;
      const a = j * seg + i;
      const b = j * seg + i1;
      const c = (j + 1) * seg + i;
      const d = (j + 1) * seg + i1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

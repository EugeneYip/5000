/**
 * Environment — sky, image-based lighting, key/fill rig, ground and shadows.
 *
 * Everything here is generated in code. No HDRI ships with the project, so the
 * sky is an analytic shader, the IBL is that sky plus a proxy world baked to a
 * cubemap and prefiltered with `PMREMGenerator`, and the road is procedural.
 *
 * Three things do most of the work and are worth knowing about before editing:
 *
 *   · **The IBL is not just a gradient.** A car body is a curved mirror. Empty
 *     surroundings produce flat, dead flanks. The proxy world has roadside
 *     masses (or softboxes) at the right heights so there is something to see
 *     in the doors.
 *   · **The sun's shadow frustum is fitted per preset** to the car's bounds
 *     *plus the ground its own shadow lands on*. At 11° of solar elevation the
 *     cast shadow is 7 m long; a frustum sized to the car alone would clip it,
 *     and one sized by guesswork would throw away most of the 4096².
 *   · **There is a rendered contact-occlusion pool under the car**, because
 *     neither the sun shadow nor screen-space AO puts anything under the sills
 *     at a low sun, and without it the car floats.
 */

import * as THREE from 'three';
import { BODY, QUALITY } from '@/spec';
import { createSkyUniforms, applySkyParams, createSkyDome, type SkyUniforms } from './env/sky';
import { createGround, type GroundHandle } from './env/ground';
import { createIbl, type IblHandle } from './env/ibl';
import { createContactShadow, type ContactShadowHandle } from './env/contactShadow';
import { createBackdrop, type BackdropHandle } from './env/backdrop';
import { PRESETS, DEFAULT_PRESET, resolvePreset, type EnvPreset, type GradeParams } from './env/presets';

export interface EnvironmentHandle {
  envMap: THREE.Texture | null;
  setPreset(name: string): void;
  update(dt: number, elapsed: number): void;
  /** Sun direction, for post effects that need it (god rays, flare). */
  sunDirection: THREE.Vector3;
  /** Grading hints for the post chain; changes with the preset. */
  readonly grade: GradeParams;
  /** Bumped whenever the preset changes, so the post chain can resync. */
  readonly revision: number;
  readonly presetName: string;
  readonly presetNames: string[];
}

/** Fallback subject bounds, straight off the package drawing. */
function specBounds(): THREE.Box3 {
  const halfW = BODY.widthOverMirrors / 2;
  return new THREE.Box3(
    new THREE.Vector3(-halfW, 0, -(BODY.wheelbase + BODY.overhangRear) - 0.1),
    new THREE.Vector3(halfW, BODY.heightOverRails + 0.05, BODY.overhangFront + 0.1),
  );
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Size the sun's orthographic shadow frustum to the subject *and* the patch of
 * road its shadow falls on, measured in the light's own space. Anything looser
 * spends shadow texels on empty asphalt.
 */
function fitSunShadow(light: THREE.DirectionalLight, sunDir: THREE.Vector3, box: THREE.Box3): void {
  const centre = box.getCenter(new THREE.Vector3());
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    pts.push(p);
    if (sunDir.y > 0.05) {
      // Where this corner's shadow lands on y = 0.
      const t = Math.min(p.y / sunDir.y, 26);
      pts.push(new THREE.Vector3(p.x - sunDir.x * t, 0, p.z - sunDir.z * t));
    }
  }

  const eye = centre.clone().addScaledVector(sunDir, 60);
  const m = new THREE.Matrix4().lookAt(eye, centre, UP).setPosition(eye);
  const toLight = m.invert();

  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  for (const p of pts) {
    v.copy(p).applyMatrix4(toLight);
    lo.min(v);
    hi.max(v);
  }

  const pad = 0.35;
  const cam = light.shadow.camera;
  cam.left = lo.x - pad;
  cam.right = hi.x + pad;
  cam.bottom = lo.y - pad;
  cam.top = hi.y + pad;
  // View space looks down −z, so the near plane is the *largest* z.
  cam.near = Math.max(0.1, -hi.z - pad);
  cam.far = -lo.z + pad;
  cam.updateProjectionMatrix();

  light.position.copy(eye);
  light.target.position.copy(centre);
  light.target.updateMatrixWorld();
}

export async function buildEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  opts?: { onProgress?: (f: number) => void },
): Promise<EnvironmentHandle> {
  const progress = opts?.onProgress ?? (() => {});

  const root = new THREE.Group();
  root.name = 'env';
  scene.add(root);

  // --- sky -------------------------------------------------------------------
  const skyUniforms: SkyUniforms = createSkyUniforms();
  const dome = createSkyDome(skyUniforms);
  root.add(dome);
  progress(0.12);

  // --- ground ----------------------------------------------------------------
  const ground: GroundHandle = createGround(renderer);
  root.add(ground.group);
  progress(0.42);

  // --- distant surroundings --------------------------------------------------
  const backdrop: BackdropHandle = createBackdrop();
  root.add(backdrop.group);
  progress(0.46);

  // --- contact occlusion -----------------------------------------------------
  const contact: ContactShadowHandle = createContactShadow(renderer);
  root.add(contact.mesh);
  progress(0.5);

  // --- lights ----------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.name = 'env:sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.012;
  sun.shadow.blurSamples = 6;
  root.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.2);
  hemi.name = 'env:hemi';
  root.add(hemi);

  // Light thrown back up off the road. Real, and usually missing: it is what
  // stops the sills and the underside of the mirrors going to black.
  const bounce = new THREE.DirectionalLight(0xffffff, 0);
  bounce.name = 'env:bounce';
  root.add(bounce, bounce.target);

  const rim = new THREE.DirectionalLight(0xffffff, 0);
  rim.name = 'env:rim';
  root.add(rim, rim.target);

  const lampGroup = new THREE.Group();
  lampGroup.name = 'env:lamps';
  root.add(lampGroup);
  const lamps: THREE.PointLight[] = [];
  const lampHeads: THREE.Mesh[] = [];
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffb066, toneMapped: true, fog: false });
  const lampHeadGeo = new THREE.SphereGeometry(0.16, 12, 8);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 30, 2);
    l.visible = false;
    lamps.push(l);
    lampGroup.add(l);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.visible = false;
    head.frustumCulled = false;
    lampHeads.push(head);
    lampGroup.add(head);
  }
  progress(0.56);

  // --- IBL -------------------------------------------------------------------
  const ibl: IblHandle = createIbl(renderer, skyUniforms);
  progress(0.8);

  // --- state -----------------------------------------------------------------
  const sunDirection = new THREE.Vector3();
  let preset: EnvPreset = resolvePreset(DEFAULT_PRESET);
  let revision = 0;
  let bounds = specBounds();
  let frame = 0;
  let boundsAge = 999;

  const tmpColor = new THREE.Color();
  const hideForCapture: THREE.Object3D[] = [dome, ground.group, contact.mesh, backdrop.group];
  /** Last car pose the occlusion pool was captured for; NaN forces a capture. */
  let poolSig = NaN;
  let poolAge = 0;

  const applyPreset = (p: EnvPreset): void => {
    preset = p;
    sunDirection.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();

    applySkyParams(skyUniforms, p.sky, sunDirection);

    sun.color.setHex(p.sunColor);
    sun.intensity = p.sunIntensity;
    sun.castShadow = p.sunShadow;
    sun.shadow.radius = p.sunShadowRadius;
    fitSunShadow(sun, sunDirection, bounds);

    hemi.color.setHex(p.hemi.sky);
    hemi.groundColor.setHex(p.hemi.ground);
    hemi.intensity = p.hemi.intensity;

    bounce.color.setHex(p.bounce.color);
    bounce.intensity = p.bounce.intensity;
    bounce.position.set(p.bounce.dir[0], p.bounce.dir[1], p.bounce.dir[2]).normalize().multiplyScalar(-30);
    bounce.target.position.set(0, 0.6, -1.37);
    bounce.target.updateMatrixWorld();

    if (p.rim) {
      rim.visible = true;
      rim.color.setHex(p.rim.color);
      rim.intensity = p.rim.intensity;
      rim.position.set(p.rim.dir[0], p.rim.dir[1], p.rim.dir[2]).normalize().multiplyScalar(30);
      rim.target.position.set(0, 0.8, -1.37);
      rim.target.updateMatrixWorld();
    } else {
      rim.visible = false;
      rim.intensity = 0;
    }

    for (let i = 0; i < lamps.length; i++) {
      const spec = p.lamps?.positions[i];
      const on = !!spec;
      lamps[i].visible = on;
      lampHeads[i].visible = on;
      if (spec && p.lamps) {
        lamps[i].position.set(spec[0], spec[1], spec[2]);
        lamps[i].color.setHex(p.lamps.color);
        lamps[i].intensity = p.lamps.intensity;
        lamps[i].distance = p.lamps.distance;
        lamps[i].decay = 2;
        lampHeads[i].position.copy(lamps[i].position);
      }
    }
    if (p.lamps) {
      // Bright enough to bloom, which is what makes a lamp read as a lamp.
      lampHeadMat.color.setHex(p.lamps.color).multiplyScalar(5.5);
    }

    if (p.fog) {
      // Derive the fog from the sky it has to meet. Hand-picking both is how
      // you get a hard seam at the horizon, which is exactly what a distance
      // haze exists to hide.
      const fogColor = new THREE.Color(p.sky.horizon)
        .lerp(new THREE.Color(p.sky.hazeColor), p.sky.haze)
        .multiplyScalar(p.sky.exposure * 0.72);
      // 0.72 rather than 1.0: three's fog converges on one colour in every
      // direction, but a real haze converges on whatever sky is behind it,
      // which is darkest overhead. Matching the horizon exactly makes distant
      // objects read brighter than the sky above them; pulling it down keeps
      // a tree line looking like a tree line.
      scene.fog = new THREE.FogExp2(fogColor.getHex(), p.fog.density);
    } else {
      scene.fog = null;
    }
    scene.background = null;
    scene.environmentIntensity = p.envIntensity;

    ground.apply(p);
    backdrop.apply(p, sunDirection);
    contact.setStrength(p.contactStrength);
    ibl.bake(p, sunDirection);
    scene.environment = ibl.texture;
    revision++;
    // Force a fresh capture on the next update.
    boundsAge = 999;
    frame = 0;

    tmpColor.setHex(p.background);
    renderer.setClearColor(tmpColor, 1);
  };

  applyPreset(preset);
  progress(1);


  /**
   * Bounds of everything that is not ours, so the shadow frustum and the
   * contact pool follow whatever the car stream has actually built — and keep
   * working if it has built nothing yet.
   */
  const measureBounds = (): void => {
    const box = new THREE.Box3();
    let any = false;
    for (const child of scene.children) {
      if (child === root || !child.visible) continue;
      if ((child as THREE.Light).isLight || (child as THREE.Camera).isCamera) continue;
      const b = new THREE.Box3().setFromObject(child);
      if (b.isEmpty() || !Number.isFinite(b.min.x)) continue;
      box.union(b);
      any = true;
    }
    if (!any) {
      bounds = specBounds();
      return;
    }
    // Guard against a stream mid-build parking geometry at the origin.
    const size = box.getSize(new THREE.Vector3());
    if (size.x > 24 || size.z > 24 || size.y > 12) {
      bounds = specBounds();
      return;
    }
    box.min.y = Math.min(box.min.y, 0);
    bounds = box;
  };

  const centre = new THREE.Vector3();

  /**
   * Where the subject is standing, to a tenth of a millimetre. The occlusion
   * pool is a function of that and of the subject's shape, so this is what
   * decides whether it needs re-rendering — not the frame counter.
   */
  const poolSignature = (): number => {
    let s = 0;
    for (const child of scene.children) {
      if (child === root || !child.visible) continue;
      if ((child as THREE.Light).isLight || (child as THREE.Camera).isCamera) continue;
      const e = child.matrixWorld.elements;
      for (let i = 0; i < 16; i++) s = s * 1.000211 + ((e[i] * 8192) | 0) * (i + 3);
    }
    return s;
  };

  return {
    envMap: ibl.texture,
    sunDirection,
    get grade(): GradeParams {
      return preset.grade;
    },
    get revision(): number {
      return revision;
    },
    get presetName(): string {
      return preset.name;
    },
    get presetNames(): string[] {
      return Object.keys(PRESETS);
    },

    setPreset(name: string): void {
      const p = PRESETS[name];
      if (!p || p === preset) return;
      applyPreset(p);
    },

    update(_dt: number, _elapsed: number): void {
      frame++;

      if (boundsAge++ > 20) {
        boundsAge = 0;
        const before = bounds.clone();
        measureBounds();
        if (!before.equals(bounds)) {
          if (preset.sunShadow) fitSunShadow(sun, sunDirection, bounds);
          bounds.getCenter(centre);
          const size = bounds.getSize(new THREE.Vector3());
          contact.fit(centre, Math.max(size.x, size.z) * 0.62 + 0.8);
        }
      }

      // The capture is a whole extra geometry pass over the scene, so it is
      // driven by the subject rather than by the clock: the pool is a function
      // of where the car is standing and nothing else. Parked, that is one
      // capture every 16 frames to absorb anything the signature cannot see;
      // driving, it is every other frame, which at this softness is already
      // past the point where the lag is visible.
      const sig = poolSignature();
      const settled = sig === poolSig;
      poolSig = sig;
      if (frame < 4 || (!settled && frame % 2 === 0) || poolAge++ > 15) {
        poolAge = 0;
        contact.capture(scene, hideForCapture);
      }
    },
  };
}

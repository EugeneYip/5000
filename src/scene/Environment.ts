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
 * How far up-sun of the subject the frustum reaches, metres.
 *
 * This used to be zero — the near plane sat just in front of the car — and
 * that is why the car stood in open sun with a tree row beside it. At 11.5° of
 * solar elevation the thing that shades a car is fifty to seventy metres
 * up-sun and ten to fifteen metres up; the old frustum's *near plane* was
 * about six metres in front of the bonnet, so every occluder that could have
 * done anything was clipped away before the depth pass saw it.
 *
 * 90 m clears a nineteen-metre crown (19 / sin 11.5° = 95 m of run, and the
 * bole is not what casts) with room for the subject to drive a little.
 *
 * **The cost is depth precision, and it is affordable here.** Three renders
 * shadow maps through `MeshDepthMaterial` with `RGBADepthPacking`, so the
 * stored depth is 32-bit fixed point over the frustum's range, not a 16- or
 * 24-bit depth buffer: at a 100 m range that is 23 nm per step. What does
 * scale with the range is `shadow.bias`, which is in normalised depth — so
 * the same bias that was 1 mm of world offset over a 12 m frustum would be
 * 8 mm over this one, which is enough to detach a tyre from its own contact
 * patch. `applyPreset` rescales it below rather than leaving it to drift.
 */
const SHADOW_REACH = 90;

/** The depth range the shadow bias below was set against. */
const SHADOW_BIAS_RANGE = 12;
const BASE_SHADOW_BIAS = -0.00008;

/**
 * Lateral half-extent floor on the sun's frustum, metres — see `fitSunShadow`.
 *
 * Wide only at a sun low enough for the planting to be up-sun of the subject
 * rather than on top of it — the same gate `backdrop` uses to decide whether
 * to stand its shading rank up at all, and for the same reason.
 *
 * ±30 m puts a texel at 14.6 mm and `PCFSoftShadowMap`'s fixed ±2-texel
 * kernel at 59 mm, which is about the penumbra the sun's own 0.53° disc puts
 * on the car's contact shadow at this elevation.
 *
 * It is **not** independent of `uLeafBase`, and that is worth knowing before
 * anyone sweeps one of them alone. The canopy's holes are deliberately cut at
 * or below one texel, so how many of them the depth pass resolves — and
 * therefore how much sun gets through — moves with the texel size. Measured,
 * the same cut at ±16 passes noticeably more light than at ±30: bumper 77.9
 * against 72.7, plate 222 against 202, tone 14.5 against 15.6. ±16 scores
 * better and is still the wrong choice: at 31 mm the holes start printing
 * rather than averaging, and the mottle that puts back on the valance is the
 * exact defect this round exists to remove. So the frustum is set by the
 * penumbra it owes the car's own contact edge, and the transmission is then
 * set by `uLeafBase` against the photograph's bumper — in that order.
 *
 * Nothing here decides *what stands in shade*. That is wherever the rank's
 * crowns are, which is a band about fourteen metres wide across the sun, and
 * `backdrop.shadeFootprint()` is what reports it. A previous round passed
 * this figure to the ground as the footprint and silenced the painted gobo
 * over sixty metres by a hundred and fifty — the whole frame — which cost the
 * tone profile fifteen points.
 *
 * ---
 *
 * How deep the grove's shade can go, and why it stops where it does — read
 * this before reaching for `uLeafBase` in `backdrop.ts` again.
 *
 * `CRITIQUE-3` and commit 4cf9778 both conclude the car is in shade and both
 * bracket it at the photograph's own 0.35 shade-to-sunfleck ratio. Delivered
 * as a real cast shadow, that ratio scores **29.3** on the tone-profile gate
 * against a hold of 15.8, and no amount of fill brings it back. Swept at the
 * deep setting:
 *
 *     base 0.50 +        tone   median   below 40   above 224   plate
 *     as shipped         29.3     62       27.3 %      2.7 %     180
 *     proxyGain 4.6      21.5     80        9.4 %      5.2 %     193
 *     proxyGain 6.0      22.1     97        4.4 %      7.0 %     203
 *     sky.exposure 1.8   24.6     94        5.6 %      6.3 %     199
 *     hemi 1.0           28.7     64       25.7 %      2.7 %     183
 *     photograph            0     94.8     11.5 %     10.3 %     236
 *
 * Fill moves the median and the shadow tail and will not move the highlight
 * tail: nothing tried puts more than 7 % of the car above 224 where the
 * photograph has 10.3 %, and the licence plate — the calibrated neutral, and
 * a large part of that tail in this pose — tops out near 203 in shade where
 * the photograph's reads **236 in shade**. That is an albedo ceiling, not a
 * lighting one. Our plate reads 226 in full sun; the photograph's is ten
 * levels brighter than that with no sun on it at all.
 *
 * So the order of work is: raise the bright end first — the plate's
 * reflectance in `src/materials`, and the headlamp lenses and chrome with it
 * — and only then take the shade deeper. Doing it the other way round is
 * what produced a 32.2 and a black car. Not tried and worth trying: the
 * photograph's plate may simply be retroreflective sheeting, which returns
 * the camera's own axis and is not a Lambertian albedo at all.
 *
 * Also disproved this round: that `canopy: 1.0` now double-counts, the
 * overhead canopy being redundant once the shade is cast for real. It does
 * not. Cutting it to 0.5 raises the median but takes dRGB from 36.6 to 76.9
 * — the bonnet stops mirroring a broken canopy and starts mirroring a bright
 * warm sky, which is the one thing the paint's colour cannot survive. Leave
 * it at 1.0: what is overhead and what is up-sun are different questions and
 * the photograph answers them differently.
 */
function shadowFloorFor(p: EnvPreset, sunDir: THREE.Vector3): number {
  const lowSun = p.sunShadow && p.ground !== 'studio' && sunDir.y > 0.06 && sunDir.y < 0.45;
  return lowSun ? 30 : 16;
}

/**
 * Size the sun's orthographic shadow frustum to the subject, the patch of road
 * its shadow falls on, and the column of air up-sun of both that whatever is
 * shading it has to be standing in. Anything looser spends shadow texels on
 * empty asphalt.
 *
 * Only the *depth* range grows. Left, right, top and bottom stay fitted to the
 * subject, because light-space x and y are perpendicular to the sun and an
 * occluder that shadows the car is by definition at the car's own light-space
 * x and y — so the 4096² stays where it was and the texel size does not move.
 */
function fitSunShadow(
  light: THREE.DirectionalLight, sunDir: THREE.Vector3, box: THREE.Box3, floor: number,
): void {
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

  // The eye has to stand beyond the occluders, not among them: at 60 m it was
  // level with the crowns that shade the car and half of them fell behind it.
  const eye = centre.clone().addScaledVector(sunDir, 60 + SHADOW_REACH);
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
  // …and then opened out to a floor, which is the opposite of what a shadow
  // fit normally wants and is here on purpose.
  //
  // `PCFSoftShadowMap` blurs over a fixed ±2 texels, so the only control over
  // how soft a shadow is, is how big a texel is. Fitted tight the frustum is
  // about fifteen metres across, which at 4096² is 3.7 mm a texel and a 15 mm
  // penumbra — a razor edge. That is wrong twice over: the sun's disc puts a
  // 7 cm penumbra on the car's own shadow at this elevation and half a metre
  // on anything cast from the crowns sixty metres up-sun, and with a razor
  // edge the canopy's leaf-scale gaps arrive as hard black flecks. Thirty-two
  // metres puts a texel at 7.8 mm and the kernel at 31 mm, which is about
  // where the car's own contact edge should sit, and it is enough to start
  // averaging the canopy's speckle into shade rather than camouflage.
  //
  // `floor` is that number, and it is a preset's call rather than a constant
  // because what it is worth depends on what is casting. Under a canopy the
  // leaf-scale gaps have to be averaged into a level rather than printed, so
  // wider is better up to the point where the car's own contact edge goes
  // soft. At a high sun there is no canopy shadow to soften and the only
  // thing a wide frustum does is blur that edge, which at noon should be
  // nearly hard.
  //
  // It is *not* a statement about how much ground is shaded. That is decided
  // by where the crowns are, and it is reported separately — see
  // `pushCastFootprint`.
  const cx = (cam.left + cam.right) * 0.5;
  const cy = (cam.bottom + cam.top) * 0.5;
  cam.left = Math.min(cam.left, cx - floor);
  cam.right = Math.max(cam.right, cx + floor);
  cam.bottom = Math.min(cam.bottom, cy - floor);
  cam.top = Math.max(cam.top, cy + floor);
  // View space looks down −z, so the near plane is the *largest* z.
  cam.near = Math.max(0.1, -hi.z - pad - SHADOW_REACH);
  cam.far = -lo.z + pad;
  cam.updateProjectionMatrix();
  // `shadow.bias` is a normalised-depth offset, so its world-space meaning is
  // the frustum's depth range times itself. Hold that meaning fixed as the
  // range opens up, or the contact shadows lift off the road.
  light.shadow.bias = BASE_SHADOW_BIAS * (SHADOW_BIAS_RANGE / Math.max(cam.far - cam.near, 1));

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
  // Rescaled by `fitSunShadow` to keep its world-space meaning fixed.
  sun.shadow.bias = BASE_SHADOW_BIAS;
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
  let shadowFloor = 16;
  /** Probe only: pin the frustum floor while sweeping it. */
  let floorOverride: number | null = null;
  let frame = 0;
  let boundsAge = 999;

  const tmpColor = new THREE.Color();
  const castCentre = new THREE.Vector3();
  /**
   * Hand the ground the shading rank's shadow footprint. Called after every
   * `backdrop.apply` and after every bounds change, because the footprint
   * depends on where the rank stands and the crossfade is centred on the car.
   */
  const pushCastFootprint = (): void => {
    const fp = backdrop.shadeFootprint();
    ground.setCastFootprint(castCentre, sunDirection, fp?.across ?? 0, fp?.along ?? 0);
  };
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
    shadowFloor = floorOverride ?? shadowFloorFor(p, sunDirection);
    fitSunShadow(sun, sunDirection, bounds, shadowFloor);

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
    // `backdrop` first, then the ground: the footprint the gobo defers over
    // is the shading rank's, and only the backdrop knows where it just stood
    // the rank up. At a high sun there is no rank, the footprint is null, and
    // the four presets calibrated on the painted gobo alone are untouched.
    backdrop.apply(p, sunDirection);
    bounds.getCenter(castCentre);
    pushCastFootprint();
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
  const _carPos = new THREE.Vector3();

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
    // Guard against a stream mid-build parking geometry at the origin, or a
    // single rogue object with an enormous bounding box poisoning the union.
    //
    // This used to fall back to a box at the world origin, which quietly broke
    // as soon as the car could drive: a lamp's volumetric shaft reported a
    // 24 x 14 x 17 m bound, tripped this guard every frame, pinned the shadow
    // frustum to the origin, and the car drove out of its own shadow. Centre
    // the fallback on wherever the car actually is.
    const size = box.getSize(new THREE.Vector3());
    if (size.x > 24 || size.z > 24 || size.y > 12) {
      bounds = specBounds();
      const car = scene.getObjectByName('Audi5000SWagon');
      if (car) {
        car.getWorldPosition(_carPos);
        bounds.translate(_carPos);
      }
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

  /**
   * Probe surface, alongside `__AUDI` and `__AUDI_MAT`.
   *
   * "Is this patch of ground standing in the sun?" is the question the last
   * two review rounds turned on, and there was no way to ask it: the answer
   * had to be inferred from the car's own colour, and it was inferred wrong
   * once in each direction. `ab()` re-applies the current preset with fields
   * overridden, so the painted gobo and the real cast shadow can be separated
   * by rendering the same frame twice — which is the only honest way to find
   * out which of them is doing the work. It does not write to the preset, so
   * nothing leaks into the four other streams that read the same object.
   */
  (globalThis as unknown as { __AUDI_ENV: unknown }).__AUDI_ENV = {
    info: () => ({
      preset: preset.name,
      sun: sunDirection.toArray().map((v) => Math.round(v * 1000) / 1000),
      elevationDeg: Math.round(Math.asin(sunDirection.y) * 57.2958 * 100) / 100,
      sunIntensity: sun.intensity,
      shadow: {
        left: sun.shadow.camera.left, right: sun.shadow.camera.right,
        bottom: sun.shadow.camera.bottom, top: sun.shadow.camera.top,
        near: sun.shadow.camera.near, far: sun.shadow.camera.far,
        bias: sun.shadow.bias,
        // `sun.shadow.mapSize.x`, NOT `QUALITY.shadowMapSize`:
        // `Stage.setShadowMapSize` reassigns the light's own map per quality
        // tier, so dividing by the module constant misreported this on every
        // tier but `desktop`. Two streams noticed independently.
        texelMm: Math.round(
          ((sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x) * 1e5,
        ) / 100,
      },
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      skyParams: preset.sky,
      grade: preset.grade,
      canopyCasters: backdrop.casterCount(),
    }),
    ab: (patch: Record<string, unknown>) => {
      applyPreset({ ...preset, ...patch } as EnvPreset);
      return preset.name;
    },
    cast: (on: boolean) => backdrop.setCasting(on),
    cut: (c: { freq?: number; base?: number; rim?: number }) => {
      const r = backdrop.setDepthCut(c);
      // The post chain accumulates until something moves, and a shadow map
      // that changes under a stationary camera moves nothing — so without
      // this the sweep reads a converged buffer of the *previous* setting.
      // Same event `Post.ts` already listens for, and the same trap that
      // once made the paint picker look one click behind.
      globalThis.dispatchEvent(new Event('audi:materials-dirty'));
      return r;
    },
    floor: (m: number | null) => {
      floorOverride = m;
      applyPreset(preset);
      return shadowFloor;
    },
    /** Scale the shading row's pitch across the sun, and re-hand the ground. */
    band: (s: number) => {
      backdrop.setSpread(s);
      applyPreset(preset);
      return backdrop.shadeFootprint();
    },
    footprint: () => backdrop.shadeFootprint(),
    /** Stand the vista down and redraw, for the A/B that prices it. */
    vista: (on: boolean) => {
      const r = backdrop.setVistaVisible(on);
      globalThis.dispatchEvent(new Event('audi:materials-dirty'));
      return r;
    },
    reset: () => applyPreset(PRESETS[preset.name] ?? preset),
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
          if (preset.sunShadow) fitSunShadow(sun, sunDirection, bounds, shadowFloor);
          bounds.getCenter(centre);
          castCentre.copy(centre);
          pushCastFootprint();
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

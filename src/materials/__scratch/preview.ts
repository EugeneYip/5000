/**
 * Materials bench — a scratch harness, not part of the car.
 *
 * The body and environment streams are still stubs, so there is nothing on
 * screen to judge the materials against. This puts them on primitives under a
 * procedural golden-hour IBL that has actual *structure* in it — a sun, a
 * horizon, a skyline — because a smooth gradient environment flatters every
 * paint shader ever written and tells you nothing.
 *
 * Delete with the directory once the car is standing up.
 */

import * as THREE from 'three';
import { createMaterialLibrary } from '@/materials/library';
import { LIGHTS, PAINT, TRIM_COLORS } from '@/spec';

// --- renderer: same colour pipeline as src/scene/Stage.ts --------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 400);

// --- environment -------------------------------------------------------------

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 11), // 11° elevation: late golden hour
  THREE.MathUtils.degToRad(48),
);

/** A sky with a skyline in it. The skyline is the point. */
function buildEquirect(w = 1024, h = 512): THREE.DataTexture {
  const data = new Float32Array(w * h * 4);
  const zenith = new THREE.Color(0.22, 0.38, 0.78);
  const horizon = new THREE.Color(1.45, 0.92, 0.55);
  const ground = new THREE.Color(0.055, 0.052, 0.05);

  const dir = new THREE.Vector3();
  const c = new THREE.Color();

  for (let y = 0; y < h; y++) {
    // Row 0 is the *bottom*: equirectUv() puts v=1 at the zenith, and a
    // DataTexture ignores flipY (UNPACK_FLIP_Y_WEBGL does not apply to raw
    // array uploads), so the data has to be written bottom-up by hand.
    const theta = (1 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const phi = (x + 0.5) / w * Math.PI * 2 - Math.PI;
      dir.setFromSphericalCoords(1, theta, phi);
      const up = dir.y;

      if (up >= 0) {
        const t = Math.pow(1 - up, 3.2);
        c.copy(zenith).lerp(horizon, t).multiplyScalar(1.5);
        // Sun disc plus its aureole.
        const cosA = dir.dot(SUN_DIR);
        const ang = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
        if (ang < 0.018) c.addScalar(300);
        c.addScalar(9 * Math.exp(-ang * 13));
      } else {
        const t = Math.pow(1 + up, 2.0);
        c.copy(ground).lerp(new THREE.Color(0.42, 0.33, 0.24), Math.max(0, 1 - t * 6) * 0.55);
        c.multiplyScalar(1.1);
      }

      // Skyline: a ragged band of buildings and trees just above the horizon.
      // Without hard vertical edges in the environment there is nothing for a
      // clearcoat to draw, and every paint looks acceptable.
      const band = Math.sin(phi * 7.3) * 0.5 + Math.sin(phi * 2.1 + 1.7) * 0.35 + Math.sin(phi * 17.0) * 0.12;
      const top = 0.012 + (band * 0.5 + 0.5) * 0.085;
      if (up > -0.004 && up < top) {
        const lit = 0.35 + 0.65 * Math.max(0, Math.cos(phi - Math.atan2(SUN_DIR.x, SUN_DIR.z)));
        c.multiplyScalar(0.10).addScalar(0.09 * lit);
      }

      const i = (y * w + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 1;
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const equirect = buildEquirect();
const envRT = pmrem.fromEquirectangular(equirect);
scene.environment = envRT.texture;
scene.background = equirect;

const sun = new THREE.DirectionalLight(new THREE.Color(LIGHTS.headlampColor), 3.4);
sun.position.copy(SUN_DIR).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0008;
scene.add(sun);

const groundMat = new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.92, metalness: 0 });
const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// --- the materials under test ------------------------------------------------

// `?noenv` drops the IBL. The app runs without one while the environment
// stream is still a stub, so every shader here has to compile with USE_ENVMAP
// undefined as well — a missing #ifdef there takes the whole page down.
const NO_ENV = new URLSearchParams(location.search).has('noenv');

const mats = createMaterialLibrary(renderer);
if (!NO_ENV) mats.setEnvMap(envRT.texture);
if (NO_ENV) scene.environment = null;

function put(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// Hero: a panel-scale sphere and a flat panel, both in body paint. If the
// sphere does not read as a wing, the paint is not finished.
const paintMat = mats.paint();
put(new THREE.SphereGeometry(0.55, 160, 96), paintMat, -0.85, 0.62, 0);
const panel = put(new THREE.BoxGeometry(1.5, 0.92, 0.09, 120, 80, 8), paintMat, 0.95, 0.68, 0);
panel.rotation.set(0, -0.42, 0);

// Swatch grid, 4 x 3, read left-to-right then front-to-back.
const ball = new THREE.SphereGeometry(0.16, 96, 64);
const swatches: THREE.Material[] = [
  mats.chrome(),
  mats.chrome({ roughness: 0.26 }),
  mats.alloy(),
  mats.alloy({ polished: true }),
  mats.blackTrim(),
  mats.bumperPlastic(),
  mats.rubber(),
  mats.reflector(),
  mats.interiorPlastic(),
  mats.fabric(),
  mats.carpet(),
  mats.lens(LIGHTS.tailColor, { prismatic: true }),
];
swatches.forEach((m, i) => {
  put(ball, m, -0.63 + (i % 4) * 0.42, 0.17, 2.0 + Math.floor(i / 4) * 0.42);
});

// Cabin close-up: flat plates viewed from 0.4 m, where weave and grain live.
{
  const plate = new THREE.BoxGeometry(0.3, 0.3, 0.02);
  const g = new THREE.Group();
  g.position.set(2.5, 0.35, 1.5);
  g.rotation.y = 0.62;
  scene.add(g);
  const items = [mats.fabric(), mats.carpet(), mats.interiorPlastic(), mats.bumperPlastic()];
  items.forEach((m, i) => {
    const q = new THREE.Mesh(plate, m);
    q.position.set((i % 2) * 0.33 - 0.165, Math.floor(i / 2) * -0.33 + 0.165, 0);
    q.rotation.x = -0.3;
    q.castShadow = true;
    q.receiveShadow = true;
    g.add(q);
  });
}

// Wheel corner. Cylinders are built about their own +Y — exactly the axis
// confusion a real wheel builder hits, so the alloy has to survive it.
const wheelGroup = new THREE.Group();
wheelGroup.position.set(0.3, 0.307, -2.6);
scene.add(wheelGroup);
{
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.178, 0.152, 96, 4, true), mats.alloy());
  rim.rotation.z = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.178, 0.168, 0.02, 96, 1), mats.alloy());
  face.rotation.z = Math.PI / 2;
  face.position.x = 0.066;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.242, 0.068, 48, 96), mats.rubber());
  tyre.rotation.y = Math.PI / 2;
  for (const m of [rim, face, tyre]) {
    m.castShadow = true;
    m.receiveShadow = true;
    wheelGroup.add(m);
  }
}

// Brake disc on its own, so the wear ring is actually visible.
{
  const disc = put(new THREE.CylinderGeometry(0.138, 0.138, 0.022, 128), mats.brakeDisc(), -1.5, 0.32, -2.5);
  disc.rotation.set(Math.PI / 2 - 0.3, 0, 0.25);
}

// Taillamp: stippled bowl, red prismatic lens in front of it, black housing.
const lampGroup = new THREE.Group();
lampGroup.position.set(1.9, 0.42, -2.4);
lampGroup.rotation.y = -0.55;
scene.add(lampGroup);
{
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.18), mats.bumperPlastic());
  housing.position.z = -0.095;
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 64, 48, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
    mats.reflector(),
  );
  bowl.rotation.x = -Math.PI / 2;
  bowl.position.z = -0.075;
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.03, 8, 8, 2),
    mats.lens(LIGHTS.tailColor, { prismatic: true }),
  );
  lens.position.z = 0.012;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16), mats.emissive(LIGHTS.brakeColor, 3));
  bulb.position.z = -0.06;
  for (const m of [housing, bowl, lens, bulb]) lampGroup.add(m);
}

// Glazing: a raked pane over an open-fronted cabin, so it reads from outside at
// a grazing angle *and* from the driver's seat looking out.
const glassGroup = new THREE.Group();
glassGroup.position.set(-2.4, 0, -2.0);
glassGroup.rotation.y = 0.55;
scene.add(glassGroup);
{
  const shell = mats.interiorPlastic();
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number): void => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    glassGroup.add(m);
  };
  wall(1.1, 0.8, 0.04, 0, 0.55, -0.7);
  wall(0.04, 0.8, 1.4, -0.55, 0.55, 0);
  wall(0.04, 0.8, 1.4, 0.55, 0.55, 0);
  wall(1.14, 0.04, 1.44, 0, 0.95, 0);

  const floorPlate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 1.4), mats.carpet());
  floorPlate.position.set(0, 0.16, 0);
  floorPlate.receiveShadow = true;
  glassGroup.add(floorPlate);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.24), mats.fabric());
  seat.position.set(0, 0.42, -0.42);
  seat.castShadow = true;
  glassGroup.add(seat);

  // Raked 28° from vertical, like the C3's screen.
  const pane = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.78, 0.005, 48, 36, 1), mats.glass());
  pane.position.set(0, 0.56, 0.64);
  pane.rotation.x = -0.49;
  glassGroup.add(pane);
}

// --- views -------------------------------------------------------------------

interface Pose { pos: [number, number, number]; target: [number, number, number]; fov: number }

const VIEWS: Record<string, Pose> = {
  paint:      { pos: [1.7, 1.15, 3.3], target: [0.0, 0.6, 0.0], fov: 34 },
  paintclose: { pos: [0.55, 0.95, 1.75], target: [-0.85, 0.62, 0.0], fov: 30 },
  paintflop:  { pos: [3.4, 0.72, 1.5], target: [0.7, 0.66, 0.0], fov: 20 },
  swatches:   { pos: [0.0, 1.3, 5.0], target: [0.0, 0.25, 2.4], fov: 34 },
  cabin:      { pos: [3.06, 0.62, 2.18], target: [2.5, 0.35, 1.5], fov: 40 },
  wheel:      { pos: [1.5, 0.62, -1.75], target: [0.3, 0.3, -2.6], fov: 34 },
  disc:       { pos: [-0.95, 0.52, -1.95], target: [-1.5, 0.32, -2.5], fov: 28 },
  lamp:       { pos: [2.62, 0.58, -1.62], target: [1.9, 0.42, -2.4], fov: 26 },
  lampclose:  { pos: [2.24, 0.48, -1.98], target: [1.9, 0.42, -2.4], fov: 22 },
  glass:      { pos: [-0.75, 0.92, -0.75], target: [-2.35, 0.6, -1.85], fov: 32 },
  glassgraze: { pos: [-0.72, 0.73, -1.92], target: [-2.07, 0.56, -1.46], fov: 28 },
  glassin:    { pos: [-2.55, 0.62, -2.2], target: [-1.2, 0.5, -0.9], fov: 52 },
};

function setView(name: string): boolean {
  const v = VIEWS[name];
  if (!v) return false;
  camera.position.set(...v.pos);
  camera.lookAt(new THREE.Vector3(...v.target));
  camera.fov = v.fov;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  return true;
}
setView('paint');

let elapsed = 0;
const clock = new THREE.Clock();
function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  mats.update(dt, elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
renderer.compile(scene, camera);
frame();

(window as unknown as Record<string, unknown>).__MAT = {
  ready: true,
  views: Object.keys(VIEWS),
  setView,
  lib: mats,
  // Callers expect one paint instance per car, not one per panel.
  identity: (): boolean => mats.paint() === mats.paint() && mats.paint() === paintMat,
  probe: (x: number, y: number): number[] => {
    const buf = new Uint8Array(4);
    const gl = renderer.getContext();
    gl.readPixels(x, renderer.domElement.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [buf[0], buf[1], buf[2]];
  },
  stats: () => ({
    calls: renderer.info.render.calls,
    tris: renderer.info.render.triangles,
    programs: renderer.info.programs?.length ?? 0,
  }),
  paintHex: PAINT.baseColor,
  trim: TRIM_COLORS,
};

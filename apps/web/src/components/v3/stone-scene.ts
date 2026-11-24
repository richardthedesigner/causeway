/**
 * The live stone's three.js scene (FEAT-73). Rebuilt from Jonny's approved
 * render (docs/ux/v3/stone/render.html): the same sett, bevel, worn surface,
 * materials, eyes, lights and camera. What is new is the rig: the body can
 * squash, tilt and slump, and the eyes have lids, so each state reads by
 * shape alone (stone-poses.ts).
 *
 * Imported only by stone-stage.ts, which StoneLive loads on demand, and by
 * scripts/render-stones.mjs, which renders the static images from it.
 */
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clamp01, type Pose } from "./stone-poses";

/**
 * The frame. The approved renders are an 800 px square view, cropped to 676 by 550
 * from (80, 128). The live stone needs a little room to tilt and stretch inside the
 * same box, so it is framed 10% wider, about the same foot: the stone is drawn 9%
 * smaller and sits where it did. Every image and the live stone use this one frame.
 */
const FULL = 800;
export const CROP = { x: 46, y: 83, w: 744, h: 605 };

const EYE_X = 0.36;
const EYE_Y = 0.74;
const EYE_Z = 0.86;
const EYE_R = 0.17;
/** The eye is a squashed sphere, as in the render. */
const EYE_SHAPE = new Vector3(1, 1.35, 0.55);
/** Lids sit just proud of the eye. */
const LID_OVER = 1.14;
const HALF_W = 1.15;
const HALF_D = 0.85;
const BEVEL = 0.3;
/** Mist puffs at the stone's foot: x, y, z, size, phase. */
const PUFFS: [number, number, number, number, number][] = [
  [-0.55, 0.24, 0.95, 0.77, 0],
  [-0.05, 0.19, 1.1, 0.85, 1.3],
  [0.5, 0.22, 1.05, 0.81, 2.1],
  [1.05, 0.26, 0.8, 0.77, 3.4],
  [1.35, 0.24, 0.2, 0.72, 4.6],
  [0.2, 0.34, 1.2, 0.63, 5.5],
  [-0.35, 0.36, 1.05, 0.59, 0.7],
  [0.85, 0.38, 1.0, 0.59, 2.9],
];

interface Shared {
  body: BufferGeometry;
  eye: SphereGeometry;
  lidTop: SphereGeometry;
  lidLow: SphereGeometry;
  glint: SphereGeometry;
  eyeMat: MeshStandardMaterial;
  glintMat: MeshBasicMaterial;
  mist: Texture;
}

/** The sett: a rounded box with a worn, uneven surface, smoother where the eyes are (from render.html). */
function settGeometry(): BufferGeometry {
  const g = new RoundedBoxGeometry(2.3, 1.35, 1.7, 24, BEVEL);
  const p = g.attributes.position!;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + v.z * 1.3) * 0.025 + Math.sin(v.y * 3.3 + v.x * 1.7) * 0.02 + Math.sin(v.z * 2.7 - v.y * 1.9) * 0.02;
    const front = v.z > 0.7 && Math.abs(v.x) < 0.75 && v.y > -0.2 && v.y < 0.35 ? 0.2 : 1;
    v.multiplyScalar(1 + n * front);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A soft white disc for the mist, drawn here so nothing is fetched. */
function mistTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.5, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = r;
  x.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function makeShared(): Shared {
  return {
    body: settGeometry(),
    eye: new SphereGeometry(1, 32, 24),
    // Half shells, top and bottom. A lid turns about the eye's centre, so it slides over the eye or tucks behind it into the stone.
    lidTop: new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    lidLow: new SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    glint: new SphereGeometry(0.04, 16, 12),
    eyeMat: new MeshStandardMaterial({ color: 0x14110e, roughness: 0.2, metalness: 0 }),
    glintMat: new MeshBasicMaterial({ color: 0xffffff }),
    mist: mistTexture(),
  };
}

interface Eye {
  group: Group;
  top: Mesh;
  low: Mesh;
  glint: Mesh;
  side: -1 | 1;
}

/** One stone: its own materials (for its colour) on the shared shapes. */
export interface Rig {
  root: Group;
  body: Group;
  eyes: [Eye, Eye];
  mat: MeshPhysicalMaterial;
  puffs: Sprite[];
  colour: Color;
}

/** The stage everything is drawn on: renderer, lights, ground and camera. */
export interface StoneScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  hemi: HemisphereLight;
  shared: Shared;
  rig(colour: string): Rig;
  /** Take a rig off the stage and free its materials. */
  drop(r: Rig): void;
  dispose(): void;
}

/** Build the scene. Throws if WebGL can't start. */
export function createStoneScene(opts: { canvas?: HTMLCanvasElement; shadowSize?: number; preserveDrawingBuffer?: boolean; failIfMajorPerformanceCaveat?: boolean } = {}): StoneScene {
  const renderer = new WebGLRenderer({
    canvas: opts.canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: opts.failIfMajorPerformanceCaveat ?? false,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const pm = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pm.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.45;
  room.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
  pm.dispose();

  const camera = new PerspectiveCamera(23, 1, 0.1, 100);
  camera.position.set(4.2, 3.4, 6.2);
  camera.lookAt(0, 0.55, 0);

  // The ground only takes the shadow. It writes no depth, so the mist at the foot is not cut off by it.
  const ground = new Mesh(new PlaneGeometry(20, 20), new ShadowMaterial({ opacity: 0.22, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const key = new DirectionalLight(0xffffff, 2.6);
  key.position.set(3, 7, 4);
  key.castShadow = true;
  const ss = opts.shadowSize ?? 2048;
  key.shadow.mapSize.set(ss, ss);
  key.shadow.radius = 12;
  key.shadow.blurSamples = 20;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  scene.add(key);
  const rim = new DirectionalLight(0xfff3e0, 1.0);
  rim.position.set(-5, 3, -3);
  scene.add(rim);
  const hemi = new HemisphereLight(0xffffff, 0x000000, 0.35);
  scene.add(hemi);

  const shared = makeShared();
  const rigs: Rig[] = [];

  return {
    renderer,
    scene,
    camera,
    hemi,
    shared,
    rig(colour) {
      const r = makeRig(shared, colour);
      r.root.visible = false;
      scene.add(r.root);
      rigs.push(r);
      return r;
    },
    drop(r) {
      const i = rigs.indexOf(r);
      if (i < 0) return;
      rigs.splice(i, 1);
      scene.remove(r.root);
      disposeRig(r);
    },
    dispose() {
      for (const r of rigs) disposeRig(r);
      env.dispose();
      ground.geometry.dispose();
      (ground.material as ShadowMaterial).dispose();
      key.shadow.map?.dispose();
      for (const g of [shared.body, shared.eye, shared.lidTop, shared.lidLow, shared.glint]) g.dispose();
      shared.eyeMat.dispose();
      shared.glintMat.dispose();
      shared.mist.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function makeRig(shared: Shared, colour: string): Rig {
  const c = new Color(colour);
  const mat = new MeshPhysicalMaterial({ color: c, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.35, sheenColor: c.clone().offsetHSL(0, 0, 0.2), sheenRoughness: 0.6 });
  const root = new Group();
  const body = new Group();
  root.add(body);
  const box = new Mesh(shared.body, mat);
  box.position.y = 0.675;
  box.castShadow = true;
  body.add(box);
  const eye = (side: -1 | 1): Eye => {
    const group = new Group();
    const ball = new Mesh(shared.eye, shared.eyeMat);
    const top = new Mesh(shared.lidTop, mat);
    const low = new Mesh(shared.lidLow, mat);
    for (const lid of [top, low]) {
      lid.scale.setScalar(LID_OVER);
      // Turn about the eye first, then slant: so the lid keeps hugging the eye.
      lid.rotation.order = "ZXY";
    }
    group.add(ball, top, low);
    const glint = new Mesh(shared.glint, shared.glintMat);
    body.add(group, glint);
    return { group, top, low, glint, side };
  };
  const puffs = PUFFS.map(() => {
    const s = new Sprite(new SpriteMaterial({ map: shared.mist, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    s.renderOrder = 2;
    root.add(s);
    return s;
  });
  return { root, body, eyes: [eye(-1), eye(1)], mat, puffs, colour: c };
}

function disposeRig(r: Rig) {
  r.mat.dispose();
  for (const p of r.puffs) p.material.dispose();
}

/** Set a rig's colour (the morph between states blends it). */
export function setColour(r: Rig, colour: Color) {
  r.colour.copy(colour);
  r.mat.color.copy(colour);
  r.mat.sheenColor.copy(colour).offsetHSL(0, 0, 0.2);
}

/** Put a rig in a pose, at `t` seconds (the mist drifts with time). */
export function applyPose(r: Rig, p: Pose, t: number) {
  r.root.rotation.y = -0.32 + p.yaw;
  // Roll and slump about the foot, then lift so the low edge still rests on the ground.
  const rest = (HALF_W - BEVEL) * Math.abs(Math.sin(p.tilt)) * p.sx + (HALF_D - BEVEL) * Math.abs(Math.sin(p.lean)) * p.sz;
  r.root.position.y = p.lift + rest;
  r.body.rotation.set(p.lean, 0, -p.tilt, "XZY");
  r.body.scale.set(p.sx, p.sy, p.sz);

  const s = EYE_R * p.eyeScale;
  for (const e of r.eyes) {
    const x = e.side * EYE_X + p.lookX;
    const y = EYE_Y + p.lookY;
    e.group.position.set(x, y, EYE_Z);
    e.group.scale.set(s * EYE_SHAPE.x, s * EYE_SHAPE.y, s * EYE_SHAPE.z);
    const own = e.side < 0 ? p.lidL : p.lidR;
    const top = clamp01(own + (1 - clamp01(own)) * p.blink);
    const low = clamp01(p.lidLow + (1 - clamp01(p.lidLow)) * p.blink * 0.35);
    // 0 is tucked behind the eye, 1 is right over it.
    e.top.rotation.set(-Math.PI / 2 + top * Math.PI, 0, -e.side * p.slant);
    e.low.rotation.set(Math.PI / 2 - low * Math.PI, 0, 0);
    // The glint dims out as the lid comes down over it.
    const g = 1 - clamp01((top - 0.3) / 0.16);
    e.glint.visible = g > 0.02;
    e.glint.scale.setScalar(g * p.eyeScale);
    e.glint.position.set(x - 0.04 * p.eyeScale, y + 0.07 * p.eyeScale, 0.93 + 0.01 * (p.eyeScale - 1));
  }

  for (let i = 0; i < r.puffs.length; i++) {
    const [x, y, z, size, phase] = PUFFS[i]!;
    const sp = r.puffs[i]!;
    const drift = Math.sin(t * 0.35 + phase);
    sp.position.set(x + drift * 0.1, y + Math.sin(t * 0.22 + phase) * 0.04 - r.root.position.y, z);
    sp.scale.setScalar(size * (1 + 0.06 * drift));
    sp.material.opacity = p.veil * (0.34 + 0.1 * Math.sin(t * 0.5 + phase * 2));
    sp.visible = p.veil > 0.01;
  }
}

/** Point the camera at a region of the full 800 px frame, in that frame's pixels. */
export function frame(camera: PerspectiveCamera, x: number, y: number, w: number, h: number) {
  camera.setViewOffset(FULL, FULL, x, y, w, h);
  camera.updateProjectionMatrix();
}

/** Draw one rig alone, with the sky light tinted by its colour as in the render. */
export function drawRig(s: StoneScene, r: Rig) {
  for (const c of s.scene.children) if (c instanceof Group) c.visible = c === r.root;
  s.hemi.groundColor.copy(r.colour).multiplyScalar(0.4);
  s.renderer.render(s.scene, s.camera);
}


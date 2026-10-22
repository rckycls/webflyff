// The character view, `#/character?gender=male&head=…&motion=…&frame=0&paused=1`: one player character, its parts
// re-bound to one skeleton (assemble.ts), playing one motion in a loop, with orbit controls (mouse and touch) and a
// panel of dropdowns, one per slot and one for the motion. A dropdown changes the address, and the router builds the
// view again from it, so an address always shows exactly what it names.
//
// `paused=1` holds the pose at `frame` (0 by default) and stops everything else that moves with time (orbit damping),
// and the camera frames the character from its bounds in that pose: the picture tests rely on it.

import {
  GENDERS,
  NO_PART,
  PART_SLOTS,
  assembleCharacter,
  geometryBytes,
  loadGltf,
  loopMotion,
  motionKey,
  partKey,
  partsBySlot,
  readCharacterParams,
  skeletonKey,
} from '@flyffweb/scene';
import type { AssembledCharacter, CharacterParams, Gender, PartSlot } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  LoopOnce,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  Vector2,
  Vector3,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ViewContext, ViewFactory } from '../router';

const FOV_DEGREES = 30;
/** Room left around the character when it is framed. */
const FRAME_MARGIN = 1.2;
const AMBIENT_INTENSITY = 2;
const SUN_INTENSITY = 2.5;
/** Below this width the panel starts folded, so it does not cover a phone screen. */
const NARROW_SCREEN = 700;

const PANEL_STYLE =
  'position:absolute;top:0;right:0;z-index:1000;max-width:min(100vw,20rem);max-height:calc(100% - 48px);' +
  'overflow:auto;box-sizing:border-box;padding:6px 8px;background:rgba(0,0,0,.65);color:#e6e6e6;' +
  'font:12px/1.4 system-ui,sans-serif;';
const GRID_STYLE = 'display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 6px;align-items:center;margin-top:6px;';
const SELECT_STYLE = 'min-width:0;max-width:100%;font:12px system-ui,sans-serif;';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const characterView: ViewFactory = (ctx) => {
  const { renderer, store, overlay } = ctx;
  const params = readCharacterParams(ctx.route.params, store.keys('models/part_'));

  const scene = new Scene();
  const sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
  sun.position.set(1, 2, 3);
  scene.add(new AmbientLight(0xffffff, AMBIENT_INTENSITY), sun);

  const camera = new PerspectiveCamera(FOV_DEGREES, aspectOf(renderer), 0.05, 500);
  camera.position.set(0, 1, 5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !params.paused;

  const panel = buildPanel(ctx, params);
  ctx.container.append(panel);

  let character: AssembledCharacter | null = null;
  let models = 0;
  let gpuBytes = 0;
  let disposed = false;

  /** A glb, or null (and an error on the overlay) when it cannot be had. */
  const load = async (key: string): Promise<GLTF | null> => {
    try {
      return await loadGltf(store, ctx.loaders.gltf, key);
    } catch (error) {
      overlay.error(`character: ${key}: ${messageOf(error)}`);
      return null;
    }
  };

  const start = async (): Promise<void> => {
    const partKeys = PART_SLOTS.flatMap((slot) => {
      const stem = params.parts[slot];
      return stem === undefined ? [] : [partKey(stem)];
    });
    const [skeleton, motion, ...parts] = await Promise.all([
      load(skeletonKey(params.gender)),
      load(motionKey(params.gender, params.motion)),
      ...partKeys.map(load),
    ]);
    if (disposed || skeleton === null) return;

    const usable = parts.flatMap((part, i) => (part === null ? [] : [{ part, key: partKeys[i]! }]));
    let assembled: AssembledCharacter;
    try {
      assembled = await assembleCharacter(skeleton, usable.map((u) => u.part), ctx.textures);
    } catch (error) {
      const names = usable.map((u, i) => `${i}: ${u.key}`).join(', ');
      overlay.error(`character: could not assemble the parts (${names}): ${messageOf(error)}`);
      return;
    }
    if (disposed) {
      assembled.release();
      return;
    }
    character = assembled;
    models = usable.length;
    scene.add(assembled.root);
    gpuBytes = meshBytes(assembled.root);
    overlay.addGpuBytes(gpuBytes);

    if (motion !== null) play(assembled, motion);
    assembled.root.updateMatrixWorld(true);
    frameCamera(camera, controls, boundsOf(assembled.root));
  };

  const play = (assembled: AssembledCharacter, motion: GLTF): void => {
    const clip = motion.animations[0];
    if (clip === undefined) {
      overlay.error(`character: motion ${params.motion} has no animation`);
      return;
    }
    const looped = loopMotion(clip);
    const action = assembled.mixer.clipAction(looped.clip);
    // A one-frame motion has no length to loop over.
    if (looped.frames < 2) action.setLoop(LoopOnce, 1).clampWhenFinished = true;
    action.play();
    assembled.mixer.setTime(looped.frameTime(params.frame));
  };

  const ready = start().catch((error: unknown) => overlay.error(`character: ${messageOf(error)}`));

  return {
    ready,
    frame(dt) {
      const aspect = aspectOf(renderer);
      if (aspect !== camera.aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      if (character !== null && !params.paused) character.mixer.update(dt);
      if (controls.enableDamping) controls.update(dt);
      renderer.render(scene, camera);
    },
    counts() {
      return { tiles: 0, models };
    },
    dispose() {
      disposed = true;
      controls.dispose();
      panel.remove();
      sun.dispose();
      if (character !== null) {
        scene.remove(character.root);
        character.release();
        overlay.addGpuBytes(-gpuBytes);
        character = null;
      }
    },
  };
};

const drawingSize = new Vector2();

function aspectOf(renderer: WebGLRenderer): number {
  const size = renderer.getSize(drawingSize);
  return size.y > 0 ? size.x / size.y : 1;
}

/** What the skinned meshes under `root` hold on the GPU (geometry; textures are counted by the cache). */
function meshBytes(root: Object3D): number {
  let total = 0;
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) total += geometryBytes(object.geometry);
  });
  return total;
}

/** The world bounds of the skinned meshes under `root` in their current pose; the joints when there is no mesh. */
function boundsOf(root: Object3D): Box3 {
  const box = new Box3();
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    object.computeBoundingBox();
    box.union(object.boundingBox!.clone().applyMatrix4(object.matrixWorld));
  });
  if (box.isEmpty()) root.traverse((object) => box.expandByPoint(object.getWorldPosition(new Vector3())));
  return box;
}

/** Puts the camera in front of `box` (on +z), far enough back for all of it to show. */
function frameCamera(camera: PerspectiveCamera, controls: OrbitControls, box: Box3): void {
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const tan = Math.tan(MathUtils.degToRad(camera.fov / 2));
  const fitHeight = size.y / 2 / tan;
  const fitWidth = Math.max(size.x, size.z) / 2 / (tan * camera.aspect);
  const distance = Math.max(fitHeight, fitWidth, 0.5) * FRAME_MARGIN + size.z / 2;
  camera.position.set(center.x, center.y, center.z + distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

/** The dropdowns. Each one changes the address; the router then builds the view again from it. */
function buildPanel(ctx: ViewContext, params: CharacterParams): HTMLElement {
  const doc = ctx.container.ownerDocument;
  const panel = doc.createElement('details');
  panel.className = 'character-panel';
  panel.open = (doc.defaultView?.innerWidth ?? NARROW_SCREEN) >= NARROW_SCREEN;
  panel.style.cssText = PANEL_STYLE;
  const summary = doc.createElement('summary');
  summary.textContent = 'Character';
  summary.style.cursor = 'pointer';
  const grid = doc.createElement('div');
  grid.style.cssText = GRID_STYLE;
  panel.append(summary, grid);

  const go = (next: URLSearchParams): void => {
    const location = doc.defaultView?.location;
    if (location !== undefined) location.hash = `#/character?${next.toString()}`;
  };
  const add = (name: string, value: string, options: readonly string[], none: boolean, change: (v: string) => void) => {
    const label = doc.createElement('label');
    label.textContent = name;
    const select = doc.createElement('select');
    select.name = name;
    select.style.cssText = SELECT_STYLE;
    const values = options.includes(value) || value === '' ? [...options] : [value, ...options];
    if (none) values.unshift('');
    for (const v of values) select.add(new Option(v === '' ? '(none)' : v, v));
    select.value = value;
    select.addEventListener('change', () => change(select.value));
    label.htmlFor = select.id = `character-${name}`;
    grid.append(label, select);
  };

  add('gender', params.gender, GENDERS, false, (gender) => go(new URLSearchParams({ gender })));
  const bySlot = partsBySlot(ctx.store.keys('models/part_'), params.gender);
  for (const slot of PART_SLOTS) {
    add(slot, params.parts[slot] ?? '', bySlot[slot], true, (stem) => go(withParam(ctx, slot, stem || NO_PART)));
  }
  add('motion', params.motion, motionsOf(ctx, params.gender), false, (motion) => go(withParam(ctx, 'motion', motion)));
  return panel;
}

function withParam(ctx: ViewContext, name: PartSlot | 'motion', value: string): URLSearchParams {
  const next = new URLSearchParams(ctx.route.params);
  next.set(name, value);
  return next;
}

/** The motions of a player skeleton, by stem. */
function motionsOf(ctx: ViewContext, gender: Gender): string[] {
  const prefix = `motions/mvr_${gender}/`;
  return ctx.store
    .keys(prefix)
    .map((key) => key.slice(prefix.length, -'.glb'.length))
    .sort();
}

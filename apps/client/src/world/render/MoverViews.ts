// The movers in view on screen: a model per mover, placed and turned where the rules put it and playing the motion they
// set, or a placeholder figure when its model cannot be had. Models load on demand, through the page's asset store and
// texture cache (`loadMoverModel`); motions too, each file once for every mover that plays it.
//
// The drawn pose is Neuz's `m_vScrPos` / `m_fScrAngle`: the own character is drawn where the rules have it, any other
// mover follows its rules position a step behind, an eighth of the way per step (`CMover::Interpolate`), which smooths
// the jumps a server correction makes. A model's motion goes on a frame per step as `CModel::FrameMove` does, and
// `CActionMover`'s `IsEndFrame` asks it whether a one-play motion (sitting down, getting up) has played to its end.

import { applyTextures, assembleCharacter, d3dColor, geometryBytes, loadGltf, noonLight, partSlot } from '@flyffweb/scene';
import type { AssembledCharacter, LoopedMotion, Overlay, SceneServices } from '@flyffweb/scene';
import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { AnimationAction, Material, Object3D, Scene, Texture } from 'three';
import {
  AnimationMixer, Box3, CapsuleGeometry, Color, Group, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  SRGBColorSpace,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AniLoop } from '../sim/constants';
import { STEPS_PER_SECOND } from '../sim/stepper';
import type { Mover, WorldChanges } from '../WorldState';
import type { MoverLook } from './looks';

/** `MOP_NO_TRANS` (`_Common/Mover.h:46`): a motion that starts without blending from the last one. */
const MOP_NO_TRANS = 0x00000004;
/** `m_fBlendWeight += 0.05f` a frame move (`CModelObject::FrameMove`, `ModelObject.cpp:1749-1754`): 20 steps of blending. */
const BLEND_SECONDS = 20 / STEPS_PER_SECOND;
/** The placeholder: a grey figure a little taller than a person, standing on its origin. */
const PLACEHOLDER_HEIGHT = 1.8;
const PLACEHOLDER_RADIUS = 0.3;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

interface Clip {
  /** Null while loading, and for good once it failed. */
  motion: LoopedMotion | null;
  loading: boolean;
}

interface View {
  mover: Mover;
  look: MoverLook | null;
  /** Placed where the mover is drawn; holds what is drawn of it. */
  holder: Group;
  /** The loaded model, which plays the motions; null while loading, and for a plain object or the placeholder. */
  model: AssembledCharacter | null;
  /** The height of the top of what is drawn, at scale 1; null while the model loads. */
  head: number | null;
  /** What the model added to the overlay's GPU estimate. */
  bytes: number;
  /** `m_vScrPos` (D3D) and `m_fScrAngle` (degrees): where the mover is drawn. */
  scrPos: Vec3;
  scrAngle: number;
  /** The motion the rules set as last seen at a step (`m_dwMotion`, the option and the loop), and the steps it has played. */
  motion: { id: number; option: number; loop: number } | null;
  steps: number;
  action: AnimationAction | null;
  actionKey: string | null;
  gone: boolean;
}

/**
 * The views of the movers in view, kept in step with `WorldState`: `sync` with its changes each frame, `step` after each
 * of its steps, `update` before drawing. `load` gives the model of a look (rejecting when it cannot be had: the mover is
 * then the placeholder, and the overlay says why, once); `lookFor` is `lookOf` with the game data; `loadMotion` gives a
 * motion file, looped as the client loops it.
 */
export class MoverViews {
  private readonly views = new Map<number, View>();
  private readonly clips = new Map<string, Clip>();
  /** Model and motion loads under way; each settles, never rejects. */
  private readonly pending = new Set<Promise<void>>();
  private readonly placeholderGeometry = new CapsuleGeometry(PLACEHOLDER_RADIUS, PLACEHOLDER_HEIGHT - 2 * PLACEHOLDER_RADIUS)
    .translate(0, PLACEHOLDER_HEIGHT / 2, 0);
  private readonly placeholderMaterial = new MeshLambertMaterial({ color: 0x9a9a9a });
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly load: (look: MoverLook) => Promise<AssembledCharacter | Object3D>,
    private readonly overlay: Pick<Overlay, 'error' | 'addGpuBytes'>,
    private readonly lookFor: (mover: Mover) => MoverLook | null,
    private readonly loadMotion: (key: string) => Promise<LoopedMotion>,
  ) {}

  /** Drops the views of the movers that left, then makes one for each mover that came and is still in `movers`. */
  sync(changes: WorldChanges, movers: ReadonlyMap<number, Mover>): void {
    for (const objectId of changes.removed) {
      const view = this.views.get(objectId);
      if (view !== undefined) this.drop(view);
    }
    for (const mover of changes.added) {
      if (movers.get(mover.objectId) !== mover || this.views.has(mover.objectId)) continue;
      this.add(mover);
    }
  }

  /**
   * One rules step of the drawing side (`CMover::Process` after the rules, `Mover.cpp:3538`, `:3862`): the drawn pose
   * follows (`Interpolate`), and each model's motion plays a frame on, or starts again where the rules set it anew.
   */
  step(movers: ReadonlyMap<number, Mover>): void {
    for (const view of this.views.values()) {
      if (movers.get(view.mover.objectId) !== view.mover) continue;
      interpolate(view);
      const { motion, motionOption, loop } = view.mover.act;
      const seen = view.motion;
      if (seen === null || seen.id !== motion || seen.option !== motionOption || seen.loop !== loop) {
        // CMover::SetMotion starts the model's motion at frame 0 (m_bEndFrame = FALSE); this step's FrameMove plays one on
        view.motion = { id: motion, option: motionOption, loop };
        view.steps = 1;
        // its file is asked for now, to be in by the time the motion is drawn (`update`) or asked about (`isEndFrame`)
        const key = view.model === null ? null : (view.look?.motion(motion) ?? null);
        if (key !== null) this.clip(key);
      } else {
        view.steps++;
      }
    }
  }

  /** Places every view where its mover is drawn, starts the motions the rules set, and plays them on by `dt` seconds. */
  update(movers: ReadonlyMap<number, Mover>, dt: number): void {
    for (const view of this.views.values()) {
      if (movers.get(view.mover.objectId) !== view.mover) continue;
      const { holder } = view;
      holder.position.set(...toWebPosition(view.scrPos));
      holder.rotation.y = (view.scrAngle * Math.PI) / 180;
      holder.scale.setScalar(view.mover.added.scale);
      if (view.model === null) continue;
      this.play(view);
      view.model.mixer.update(dt);
    }
  }

  /** `CMover::InitInterpolation` (`Mover.cpp:4118`): the mover is drawn where the rules have it, at once (after SETPOS). */
  snap(objectId: number): void {
    const view = this.views.get(objectId);
    if (view === undefined) return;
    view.scrPos = copy(view.mover.act.body.pos);
    view.scrAngle = view.mover.act.body.angle;
  }

  /** Where a mover is drawn (web coordinates) and the top of its model, for its name tag; null while its model loads. */
  placeOf(objectId: number): { at: Vec3; head: Vec3 } | null {
    const view = this.views.get(objectId);
    if (view === undefined || view.head === null) return null;
    const at = toWebPosition(view.scrPos);
    return { at, head: [at[0], at[1] + view.head * view.mover.added.scale, at[2]] };
  }

  /** The movers drawn with their own model. */
  count(): number {
    let n = 0;
    for (const view of this.views.values()) if (view.model !== null) n++;
    return n;
  }

  /** Resolves once every model and motion asked for so far (and any they lead to) has arrived or failed. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  /** Holds every model still at the first frame of the motion it plays, for a picture that does not change. */
  freeze(): void {
    for (const view of this.views.values()) {
      if (view.model === null) continue;
      view.model.mixer.stopAllAction();
      view.action?.reset().play();
      view.model.mixer.setTime(0);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const view of [...this.views.values()]) this.drop(view);
    this.placeholderGeometry.dispose();
    this.placeholderMaterial.dispose();
    this.clips.clear();
  }

  private add(mover: Mover): void {
    const holder = new Group();
    holder.name = `mover ${mover.objectId}`;
    this.scene.add(holder);
    const view: View = {
      mover, look: this.lookFor(mover), holder, model: null, head: null, bytes: 0,
      // ADD_OBJ ends with InitInterpolation (ObjSerializeOpt.cpp:764): a new mover is drawn where it is
      scrPos: copy(mover.act.body.pos), scrAngle: mover.act.body.angle, motion: null, steps: 0, action: null, actionKey: null,
      gone: false,
    };
    this.views.set(mover.objectId, view);
    const { look } = view;
    if (look === null) {
      this.showPlaceholder(view);
      return;
    }
    this.track((async () => {
      let loaded: AssembledCharacter | Object3D;
      try {
        loaded = await this.load(look);
      } catch (error) {
        this.overlay.error(`${moverLabel(mover)}: ${messageOf(error)}`);
        if (!view.gone) this.showPlaceholder(view);
        return;
      }
      // the motion it is in, so that it is drawn in it from the first frame
      const key = look.motion(mover.act.motion);
      if (key !== null) await this.clip(key).ready;
      if (view.gone) {
        if ('release' in loaded) loaded.release();
        return;
      }
      this.attach(view, loaded);
    })());
  }

  private attach(view: View, loaded: AssembledCharacter | Object3D): void {
    const model = 'release' in loaded ? loaded : null;
    const root = model?.root ?? (loaded as Object3D);
    // the top of the model's box, as RenderName projects pBB->m_vPos[0] (MoverRender.cpp:1349-1356), at scale 1
    root.updateWorldMatrix(true, true);
    view.head = Math.max(0, new Box3().setFromObject(root).max.y);
    view.holder.add(root);
    if (model === null) return;
    root.traverse((object) => {
      if (object instanceof Mesh) view.bytes += geometryBytes(object.geometry);
    });
    this.overlay.addGpuBytes(view.bytes);
    view.model = model;
    const act = view.mover.act;
    view.motion = { id: act.motion, option: act.motionOption, loop: act.loop };
    view.steps = 0;
    act.isEndFrame = () => this.isEndFrame(view);
    this.play(view);
    model.mixer.update(0);
  }

  private showPlaceholder(view: View): void {
    const figure = new Mesh(this.placeholderGeometry, this.placeholderMaterial);
    figure.name = 'placeholder';
    view.holder.add(figure);
    view.head = PLACEHOLDER_HEIGHT;
  }

  private drop(view: View): void {
    view.gone = true;
    this.views.delete(view.mover.objectId);
    view.holder.removeFromParent();
    if (view.model !== null) {
      view.model.release();
      this.overlay.addGpuBytes(-view.bytes);
      view.mover.act.isEndFrame = () => true;
      view.model = null;
    }
  }

  /**
   * `m_pModel->IsEndFrame()` (`Model.h:142`): whether the motion the rules set has played past its last frame
   * (`CModel::FrameMove`, `Model.cpp:36-50`, a looping one at its first wrap). False right after the rules set it
   * (`SetMotion` clears the flag) and while its file loads; true for a motion the model cannot play.
   */
  private isEndFrame(view: View): boolean {
    const act = view.mover.act;
    const seen = view.motion;
    if (seen === null || seen.id !== act.motion || seen.option !== act.motionOption || seen.loop !== act.loop) return false;
    const key = view.look?.motion(act.motion) ?? null;
    if (key === null) return true;
    const clip = this.clip(key);
    if (clip.loading) return false;
    if (clip.motion === null || clip.motion.frames < 2) return true;
    return view.steps > clip.motion.frameTime(clip.motion.frames - 1) * STEPS_PER_SECOND;
  }

  /**
   * Starts the motion the rules set, once its file is in: looping for `ANILOOP_LOOP`, else once and held at its last
   * frame. It blends in over 20 steps from the last one, unless the option says not to (`CMover::SetMotion`,
   * `Mover.cpp:4924-4925`). A motion the model has no file for keeps the last one playing.
   */
  private play(view: View): void {
    const model = view.model;
    const act = view.mover.act;
    const key = view.look?.motion(act.motion) ?? null;
    if (model === null || key === null || key === view.actionKey) return;
    const clip = this.clip(key);
    if (clip.motion === null) return;
    const action = model.mixer.clipAction(clip.motion.clip);
    if (act.loop === AniLoop.LOOP && clip.motion.frames >= 2) {
      action.setLoop(LoopRepeat, Infinity);
    } else {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    const last = view.action;
    action.reset().play();
    if (last !== null && last !== action) {
      if (act.motionOption & MOP_NO_TRANS) last.stop();
      else {
        action.fadeIn(BLEND_SECONDS);
        last.fadeOut(BLEND_SECONDS);
      }
    }
    view.action = action;
    view.actionKey = key;
  }

  /** A motion file by key, loaded once; a failure is said once on the overlay and kept, so it is not asked for again. */
  private clip(key: string): Clip & { ready: Promise<void> } {
    let clip = this.clips.get(key) as (Clip & { ready: Promise<void> }) | undefined;
    if (clip === undefined) {
      const entry: Clip & { ready: Promise<void> } = { motion: null, loading: true, ready: Promise.resolve() };
      entry.ready = this.track(this.loadMotion(key).then(
        (motion) => {
          entry.motion = motion;
        },
        (error: unknown) => {
          if (!this.disposed) this.overlay.error(`motion ${key}: ${messageOf(error)}`);
        },
      ).finally(() => {
        entry.loading = false;
      }));
      this.clips.set(key, entry);
      clip = entry;
    }
    return clip;
  }

  private track(work: Promise<void>): Promise<void> {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
    return work;
  }
}

/**
 * `CMover::Interpolate` (`Mover.cpp:4135-4216`) on the ground. The own character (`IsActiveObj`) is drawn where it is.
 * Any other: its drawn position goes an eighth of the way to its position each step, and onto it once the square of the
 * distance is 0.001 or less; its drawn angle goes an eighth of the way round, the shorter way, kept in 0 to 360. Within 4
 * degrees the C++ first puts it on the angle and then still adds the eighth, which this copies.
 */
function interpolate(view: View): void {
  const { pos, angle } = view.mover.act.body;
  if (view.mover.isSelf) {
    view.scrPos = copy(pos);
    view.scrAngle = angle;
    return;
  }
  const scr = view.scrPos;
  if (Math.abs(pos[0] - scr[0]) > 0.001 || Math.abs(pos[1] - scr[1]) > 0.001 || Math.abs(pos[2] - scr[2]) > 0.001) {
    const v: Vec3 = [pos[0] - scr[0], pos[1] - scr[1], pos[2] - scr[2]];
    if (v[0] * v[0] + v[1] * v[1] + v[2] * v[2] > 0.001) view.scrPos = [scr[0] + v[0] / 8, scr[1] + v[1] / 8, scr[2] + v[2] / 8];
    else view.scrPos = copy(pos);
  }
  if (Math.abs(angle - view.scrAngle) > 0.001) {
    let d = angle - view.scrAngle;
    if (Math.abs(d) < 4) view.scrAngle = angle;
    if (d < -180) d += 360;
    else if (d > 180) d -= 360;
    view.scrAngle += d / 8;
    if (view.scrAngle > 360) view.scrAngle -= 360;
    else if (view.scrAngle < 0) view.scrAngle += 360;
  }
}

/** How the overlay names a mover: its `MI_*` index and its name. */
function moverLabel(mover: Mover): string {
  return `mover ${mover.added.index}${mover.name === '' ? '' : ` (${mover.name})`}`;
}

/**
 * How bright the hair is lit: `fblack` of `CModelObject::Render` (`ModelObject.cpp:1158-1167`), the mean of the light's
 * diffuse colour times `g_fHairLight` (1.5, `ModelGlobal.cpp:41`) times 0.6, and at least 0.3 (`__BS_FIX_HAIR_AMBIENT`).
 * The light is the world's at noon (`noonLight`): 0.99.
 */
function hairLight(): number {
  const diffuse = noonLight().sunColor;
  return Math.max(0.3, ((diffuse * 1.5 * 3) / 3) * 0.6);
}

/**
 * Neuz draws the hair part unlit: diffuse 0 and ambient the hair colour times `hairLight`, at most 1
 * (`CModelObject::Render`, `ModelObject.cpp:1147-1175`, after `CMover::Render` put the colour in the hair's
 * `m_fAmbient`, `MoverRender.cpp:348-360`). So its materials become unlit ones of that colour over the same texture.
 */
function tintHair(lod: Object3D, hairColor: number): void {
  const light = hairLight();
  const [r, g, b] = d3dColor(hairColor).map((c) => Math.min(c * light, 1)) as [number, number, number];
  const color = new Color().setRGB(r, g, b, SRGBColorSpace);
  lod.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const tint = (old: Material): Material => {
      const { map } = old as Material & { map?: Texture | null };
      const unlit = new MeshBasicMaterial({
        name: old.name, map: map ?? null, color, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest,
        side: old.side, depthWrite: old.depthWrite,
      });
      old.dispose(); // its texture is the cache's: the assembled character gives it back
      return unlit;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
  });
}

/**
 * The model of a look, from the page's asset store: the skeleton with every part re-bound to it (`assembleCharacter`),
 * the hair tinted as Neuz tints it, or for a model with no skeleton its `lod0` as it is. A part that cannot be had is
 * left out and said on the overlay; a skeleton, or every part, that cannot be had rejects.
 */
export function loadMoverModel(
  services: Pick<SceneServices, 'store' | 'loaders' | 'textures'>,
  overlay: Pick<Overlay, 'error'>,
): (look: MoverLook) => Promise<AssembledCharacter> {
  const { store, loaders, textures } = services;
  const glb = (key: string): Promise<GLTF> => loadGltf(store, loaders.gltf, key);
  return async (look) => {
    const skeleton = look.skeleton === null ? null : glb(look.skeleton);
    // awaited below, once the parts are in; until then a failure must not count as unhandled
    skeleton?.catch(() => {});
    const parts = await Promise.all(look.parts.map(async (key) => {
      try {
        return { key, gltf: await glb(key) };
      } catch (error) {
        overlay.error(`part ${key}: ${messageOf(error)}`);
        return null;
      }
    }));
    const loaded = parts.flatMap((part) => (part === null ? [] : [part]));
    if (loaded.length === 0) throw new Error(`none of its parts could be loaded (${look.parts.join(', ')})`);
    if (skeleton === null) return plainModel(loaded[0]!.gltf, textures);
    const hair = loaded.find((part) => partSlot(part.key) === 'hair')?.gltf.scene.getObjectByName('lod0');
    const character = await assembleCharacter(await skeleton, loaded.map((part) => part.gltf), textures);
    if (hair !== undefined && look.hairColor !== null) tintHair(hair, look.hairColor);
    return character;
  };
}

/** A model that is not animated: its `lod0` with its textures, and a mixer that has nothing to play. */
async function plainModel(gltf: GLTF, textures: SceneServices['textures']): Promise<AssembledCharacter> {
  const lod = gltf.scene.getObjectByName('lod0');
  if (lod === undefined) throw new Error('the model has no "lod0" node');
  const root = new Group();
  root.add(lod);
  const keys = await applyTextures(lod, textures);
  let released = false;
  return {
    root,
    mixer: new AnimationMixer(root),
    release() {
      if (released) return;
      released = true;
      for (const key of keys) textures.release(key);
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
    },
  };
}

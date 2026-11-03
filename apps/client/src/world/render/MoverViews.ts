// The movers in view on screen: a model per mover, placed and turned where the rules put it and playing the motion they
// set, with the items of its hands, or a placeholder figure when its model cannot be had. Models load on demand,
// through the page's asset store and texture cache (`loadMoverModel` and `loadHeldItems`, `moverModels.ts`); motions
// too, each file once for every mover that plays it.
//
// The drawn pose is Neuz's `m_vScrPos` / `m_fScrAngle`: the own character is drawn where the rules have it, any other
// mover follows its rules position a step behind, an eighth of the way per step (`CMover::Interpolate`), which smooths
// the jumps a server correction makes. Each model keeps its frame of the motion the rules set as `CModel::FrameMove`
// moves it, a step at a time at the mover's animation speed, held while the rules pause the model: `CActionMover`'s
// `IsEndFrame` asks it whether a motion has played to its end (sitting down, a swing), and `IsAttrHit` whether a step
// went past a hit frame of a swing. In combat a player plays its weapon's set of each motion (`motionFor`). A hit
// flashes a model and shakes a monster's drawing (`sparks.ts`): `flash` and `shake`, stepped with the rules.

import { attachHeld, geometryBytes, handPosition } from '@flyffweb/scene';
import type { AssembledCharacter, LoopedMotion, ModelBox, Overlay } from '@flyffweb/scene';
import { toWebPosition } from '@flyffweb/formats';
import type { MotionEvents, Vec3, WebItemProp, WebMover } from '@flyffweb/formats';
import type { AnimationAction, Object3D, Scene } from 'three';
import { AnimationClip, Box3, CapsuleGeometry, Group, LoopOnce, LoopRepeat, Mesh, MeshLambertMaterial } from 'three';
import { motionFor } from '../sim/ActionMover';
import type { ModelFrame as ActionModelFrame, MotionHand } from '../sim/ActionMover';
import { AniLoop, Ik3, Mop, Mti, ObjSta, ObjStaF } from '../sim/constants';
import { soundAt } from '../sound/soundRules';
import type { Vec } from '../sound/soundRules';
import { STEPS_PER_SECOND } from '../sim/stepper';
import { isDie } from '../WorldState';
import type { Mover, WorldChanges } from '../WorldState';
import { MI_FEMALE, MI_MALE, Parts } from './looks';
import type { MoverLook } from './looks';
import type { HeldItem } from './moverModels';
import { moverMatrix } from './picking';
import type { PickCandidate } from './picking';
import {
  DAMAGE_SHAKE_TICKS, SPARK_CAST, idleSpark, lightWithSpark, setSparkUniforms, shakeOffset, sparkUniforms, startSpark, stepSpark,
} from './sparks';
import type { SparkInfo, SparkUniforms } from './sparks';

/** `m_fBlendWeight += 0.05f` a frame move (`CModelObject::FrameMove`, `ModelObject.cpp:1749-1754`): 20 steps of blending. */
const BLEND_SECONDS = 20 / STEPS_PER_SECOND;
/** The placeholder: a grey figure a little taller than a person, standing on its origin. */
const PLACEHOLDER_HEIGHT = 1.8;
const PLACEHOLDER_RADIUS = 0.3;
/** The box round the placeholder, in the model's own D3D space (a new one each time: a caller may keep it). */
const placeholderBox = (): ModelBox => ({
  min: [-PLACEHOLDER_RADIUS, 0, -PLACEHOLDER_RADIUS], max: [PLACEHOLDER_RADIUS, PLACEHOLDER_HEIGHT, PLACEHOLDER_RADIUS],
});
/** `MI_DWARPETMAS`, `MI_CROWNIBLIS`, `MI_CROWNSHADE`, `MI_CROWNBUBBLE` (`defineObj.h:1167-1170`): the master bodies. */
const MASTER_BODIES: ReadonlySet<number> = new Set([202, 203, 204, 205]);
/** `II_WEA_HAN_HAND` (`Resource/defineItem.h:25`): the bare hand's item, held when the hand is empty. */
const II_WEA_HAN_HAND = 11;
/** `HD_TWO` (`Resource/defineAttribute.h:28`): a two-handed weapon. */
const HD_TWO = 2;
/** `JOB_PSYCHIKEEPER`, its master and its hero (`Resource/defineJob.h:59,72,83`). */
const PSYKEEPERS: ReadonlySet<number> = new Set([12, 22, 30]);
/**
 * The motions that each have a blow's frame: a swing's (`OBJMSG_ATK1` to `OBJMSG_ATK4`, `ActionMoverMsg.cpp:596-704`) and
 * the Vagrant's skills' (`OBJMSG_MELEESKILL`, :736-772; Flurry has three).
 */
const SWING_MOTIONS: ReadonlySet<number> = new Set([
  Mti.ATK1, Mti.ATK2, Mti.ATK3, Mti.ATK4, Mti.VAG_ONE_CLEANHIT, Mti.VAG_ONE_BRANDISH, Mti.VAG_ONE_OVERCUTTER,
]);

const f32 = Math.fround;
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];
/** The frame of a mover with no model to play its motions: 0 of 0, so a motion is over at once (`ActionMover.modelFrame`). */
const noFrame = (): ActionModelFrame => ({ current: 0, max: 0 });

interface Clip {
  /** Null while loading, and for good once it failed. */
  motion: LoopedMotion | null;
  loading: boolean;
}

/**
 * `CModel`'s frame of a motion (`Model.h:86-94`), as `FrameMove` moves it: `current` is `m_fFrameCurrent`, `old`
 * `m_fFrameOld`, `endFrame` `m_bEndFrame`. `sets` is the rules' `motionSets` it belongs to: the next motion set starts
 * a new one (`InitAnimate`, `Model.h:125-136`). The frame moves of the steps that went by while the motion's file
 * loaded (its frame count and speed are in it) wait in `backlog`, as their speeds, and are made at once when it is in.
 * Neuz, whose files are in at once, tests each frame move's `old` and `current` for a hit before the next; so a hit that
 * one of those moves passes, whose frames the next move replaces untested, waits in `waiting` for the rules' next tests,
 * oldest first, with the hits of the moves that come after it.
 */
interface ModelFrame {
  sets: number;
  current: number;
  old: number;
  endFrame: boolean;
  backlog: number[];
  waiting: number[];
}

const startFrame = (sets: number): ModelFrame => ({ sets, current: 0, old: -1, endFrame: false, backlog: [], waiting: [] });

/**
 * `CModel::FrameMove` (`Model.cpp:13-55`) once, at `speed` (`m_fAniSpeed`), for a motion of `events.frames` frames
 * (`m_nFrameMax`) that moves `m_fPerSlerp` frames a step, cut to 3 decimals as `CModelObject::LoadMotion` does
 * (`ModelObject.cpp:582`). A looping motion ends at its first wrap and goes round; any other stops on its last frame.
 * The pause (`m_nPause`) is its caller's; `m_bSlow` comes from `MOP_HITSLOW`, which `__XSLOW1018` (not built) sets.
 */
function frameMove(frame: ModelFrame, events: MotionEvents, loop: number, speed: number): void {
  const max = events.frames;
  if (max === 0) return;
  const perSlerp = f32(Math.trunc(f32(events.perSlerp * 1000)) / 1000);
  frame.old = frame.current;
  if (frame.old > max - 1) frame.old = f32(frame.old - max);
  frame.current = f32(frame.current + f32(perSlerp * speed));
  let n = Math.trunc(frame.current);
  let slp = f32(frame.current - n);
  if (frame.current > max - 1) {
    frame.endFrame = true;
    if (loop & AniLoop.LOOP) {
      n %= max;
    } else {
      slp = 0;
      n = max - 1;
    }
  }
  frame.current = f32(n + slp);
}

/**
 * `CMotion::IsAttrHit( fOldFrm, fNumFrm )` (`Bone.h:162-169`): the attribute of frame `(int)current` holds a hit
 * frame `f` with `old < f <= current`; so a hit that one frame move jumps right over is missed, as in Neuz. The index
 * of `f` in the motion's hit frames, or -1.
 */
function hitIndex(hits: readonly number[], old: number, current: number): number {
  const o = f32(old);
  const c = f32(current);
  const at = Math.trunc(c);
  return hits.findIndex((h) => {
    const f = f32(h);
    return Math.trunc(f) === at && o < f && f <= c;
  });
}

/** The clip time of the model's frame `frame` (`m_fFrameCurrent`): between the key times of its frame and the next. */
function timeOf(motion: LoopedMotion, frame: number): number {
  if (motion.frames < 2) return 0;
  const n = Math.min(Math.trunc(frame), motion.frames - 1);
  const time = motion.frameTime(n);
  const next = n + 1 < motion.frames ? motion.frameTime(n + 1) : motion.clip.duration;
  return time + (frame - n) * (next - time);
}

interface View {
  mover: Mover;
  look: MoverLook | null;
  /** `handOf`'s last answer and what it was made from (asked several times a step: Piece 6 M5, part B). */
  hand?: { look: boolean; right: number | null; left: number | null; job: number; value: MotionHand | null };
  /** Placed where the mover is drawn; holds what is drawn of it. */
  holder: Group;
  /** The loaded model, which plays the motions; null while loading, and for a plain object or the placeholder. */
  model: AssembledCharacter | null;
  /** The items in the model's hands. */
  held: HeldItem[];
  /** The height of the top of what is drawn, at scale 1; null while the model loads. */
  head: number | null;
  /** The placeholder figure is what is drawn (`showPlaceholder`). */
  placeholder: boolean;
  /** What the model added to the overlay's GPU estimate. */
  bytes: number;
  /** `m_vScrPos` (D3D) and `m_fScrAngle` (degrees): where the mover is drawn. */
  scrPos: Vec3;
  scrAngle: number;
  /** The model's frame of the motion the rules set (`CModel`'s), from the step its model came on. */
  frame: ModelFrame;
  /** The action playing on screen, and the rules' `motionSets` of the motion it was last started for. */
  action: AnimationAction | null;
  played: number;
  gone: boolean;
  /** The model's `m_SparkInfo`, and the uniforms its lit skinned parts take it from (`sparks.ts`). */
  spark: SparkInfo;
  sparkUniforms: SparkUniforms;
  /** `CMover::m_nDmgCnt`: the steps a hit still shakes the drawing for. */
  dmgCnt: number;
}

/** `RANK_SUPER` (`Resource/defineAttribute.h:165`): a boss that a hit does not shake (`MoverRender.cpp:286`). */
const RANK_SUPER = 7;

/** What the views read besides the movers: the ranks of the mover catalog, and `xRandom( n )` (0 to n - 1). */
export interface MoverViewsOptions {
  moverProps?: ReadonlyMap<number, Pick<WebMover, 'rank'>>;
  random?: (n: number) => number;
  /**
   * Where a frame move's sounds go (Piece 6 M2): a motion's MA_SOUND frame (`IsAttrSound`, ModelObject.cpp:1594-1596)
   * and a player's footstep (`ProcessWalkSound`, Mover.cpp:3202-3219), each at the mover's FlyFF position.
   */
  sounds?: { motion(at: Vec, id: number): void; footstep(at: Vec): void };
}

/**
 * The views of the movers in view, kept in step with `WorldState`: `sync` with its changes each frame, `step` after each
 * of its steps, `update` before drawing. `load` gives the model of a look (rejecting when it cannot be had: the mover is
 * then the placeholder, and the overlay says why, once), and says to `report` what it left out; `lookFor` is `lookOf`
 * with the game data; `loadMotion` gives a motion file, looped as the client loops it; `loadHeld` gives the items of a
 * look's hands (never rejecting: what it cannot have it says to `report` and leaves out). A model that throws as it is
 * put on screen is the placeholder too. Once disposed, nothing more is said on the overlay: it is the page's, and the
 * next entry's errors are listed there. `itemProps` is the item catalog, which tells what a player's hands hold for its
 * weapon's motion sets (`handOf`); an item it lacks is the bare hand's. `options` give the mover catalog's ranks (which
 * monsters a hit does not shake) and the shake's random.
 *
 * The models' frames run at the rules' steps, exactly; what is drawn plays the same motion by the frame's time, at the
 * mover's animation speed, still while the model is paused. A one-play motion stops on its last frame. A motion the
 * rules set again (`motionSets`) starts again, but a looping one goes on as it was, as in Piece 3 (Neuz starts it again
 * at each `ActionForceSet`, `MoverParam.cpp:3336-3338`).
 */
export class MoverViews {
  private readonly views = new Map<number, View>();
  private readonly clips = new Map<string, Clip>();
  /** The motions' clips played once, which end on their last frame (`once`). */
  private readonly onceClips = new WeakMap<LoopedMotion, AnimationClip>();
  /** The attack motions found with no hit frame, said once each. */
  private readonly hitless = new Set<string>();
  /** Model and motion loads under way; each settles, never rejects. */
  private readonly pending = new Set<Promise<void>>();
  private readonly placeholderGeometry = new CapsuleGeometry(PLACEHOLDER_RADIUS, PLACEHOLDER_HEIGHT - 2 * PLACEHOLDER_RADIUS)
    .translate(0, PLACEHOLDER_HEIGHT / 2, 0);
  private readonly placeholderMaterial = new MeshLambertMaterial({ color: 0x9a9a9a });
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly load: (look: MoverLook, report: (message: string) => void) => Promise<AssembledCharacter | Object3D>,
    private readonly overlay: Pick<Overlay, 'error' | 'addGpuBytes'>,
    private readonly lookFor: (mover: Mover) => MoverLook | null,
    private readonly loadMotion: (key: string) => Promise<LoopedMotion>,
    private readonly loadHeld: (look: MoverLook, report: (message: string) => void) => Promise<HeldItem[]>,
    private readonly itemProps: ReadonlyMap<number, WebItemProp>,
    private readonly options: MoverViewsOptions = {},
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

  /** Equipment confirmation invalidates the assembled parts and held models, with normal async-load disposal. */
  refresh(mover: Mover): void {
    const old = this.views.get(mover.objectId);
    if (old) this.drop(old);
    this.add(mover);
  }

  /**
   * One rules step of the drawing side (`CMover::Process` after the rules, `Mover.cpp:3538`, `:3862`): the drawn pose
   * follows (`Interpolate`), a hit's shake counts down (`--m_nDmgCnt`, :3526-3527) and its flash fades
   * (`ProcessETC`, :3953, `stepSpark`), and each model's frame moves on, from the first frame of a motion the rules set
   * anew. The world screen hands the step's flashes and shakes over before this, so a hit's are counted on the step
   * it lands in, as `ProcessETC` at the end of the attacker's `Process` counts its own.
   */
  step(movers: ReadonlyMap<number, Mover>): void {
    for (const view of this.views.values()) {
      if (movers.get(view.mover.objectId) !== view.mover) continue;
      interpolate(view);
      if (view.dmgCnt > 0) view.dmgCnt--;
      // Piece 7 M2: a cast lights its caster cyan from behind at each of its steps (ProcessStateMagicCasting, :714-724)
      const atk = view.mover.act.state & ObjSta.ATK_ALL;
      if (atk === ObjSta.ATK_CASTING1 || atk === ObjSta.ATK_CASTING2) {
        const rad = Math.fround((view.mover.act.body.angle * Math.PI) / 180);
        startSpark(view.spark, [Math.fround(-Math.sin(rad)), 0, Math.fround(Math.cos(rad))], SPARK_CAST);
      }
      stepSpark(view.spark);
      if (view.model === null) continue;
      const act = view.mover.act;
      // CMover::SetMotion loaded a motion: the model starts it at frame 0 (InitAnimate), and this step moves it on
      if (view.frame.sets !== act.motionSets) view.frame = startFrame(act.motionSets);
      this.moveFrame(view);
    }
  }

  /**
   * Places every view where its mover is drawn (off by a hit's shake, `CMover::Render`, `MoverRender.cpp:286-296`: a
   * new offset each frame), lights its skinned parts with its flash, starts the motions the rules set, and plays them on
   * by `dt` seconds.
   */
  update(movers: ReadonlyMap<number, Mover>, dt: number): void {
    for (const view of this.views.values()) {
      if (movers.get(view.mover.objectId) !== view.mover) continue;
      const { holder } = view;
      holder.position.set(...toWebPosition(this.shaken(view) ? shakenPos(view.scrPos, this.random) : view.scrPos));
      setSparkUniforms(view.sparkUniforms, view.spark);
      holder.rotation.y = (view.scrAngle * Math.PI) / 180;
      holder.scale.setScalar(view.mover.added.scale);
      if (view.model === null) continue;
      this.play(view);
      view.model.mixer.update(dt);
    }
  }

  /**
   * A hit's flash on the mover `objectId`'s model (`m_SparkInfo`: `CMover::OnDamage`, `MoverActEvent.cpp:1522-1538`;
   * `OnAttackMelee`, :1704-1717), lit along `direction` (`m_v3SparkDir`, D3D). A mover whose model is still loading
   * keeps it, and its model takes it when it comes.
   */
  flash(objectId: number, direction: Vec3, color?: Vec3): void {
    const view = this.views.get(objectId);
    if (view !== undefined) startSpark(view.spark, direction, color);
  }

  /** A blow landed on the mover `objectId`: `m_nDmgCnt = 10` (`CActionMover::OnDamageMsgC`, `ActionMoverDmg.cpp:118`). */
  shake(objectId: number): void {
    const view = this.views.get(objectId);
    if (view !== undefined) view.dmgCnt = DAMAGE_SHAKE_TICKS;
  }

  /** `CMover::InitInterpolation` (`Mover.cpp:4118`): the mover is drawn where the rules have it, at once (after SETPOS). */
  snap(objectId: number): void {
    const view = this.views.get(objectId);
    if (view === undefined) return;
    view.scrPos = copy(view.mover.act.body.pos);
    view.scrAngle = view.mover.act.body.angle;
  }

  /** Where a mover is drawn (web coordinates) and the top of its model, for its name tag; null while its model loads. */
  /**
   * Piece 7 M2: where a mover's hand is (`CModelObject::GetHandPos`, `handPosition`), in D3D, from its model as last
   * drawn: a missile leaves from it and a yoyo goes back to it. Null with no model (loading, a placeholder) or no grips.
   */
  handAt(objectId: number, hand: 'right' | 'left'): Vec3 | null {
    const model = this.views.get(objectId)?.model ?? null;
    if (model === null) return null;
    try {
      const at = handPosition(model, hand);
      return at === null ? null : toWebPosition([at.x, at.y, at.z]);
    } catch {
      return null; // a skeleton without the hand's bone
    }
  }

  placeOf(objectId: number): { at: Vec3; head: Vec3 } | null {
    const view = this.views.get(objectId);
    if (view === undefined || view.head === null) return null;
    const at = toWebPosition(view.scrPos);
    return { at, head: [at[0], at[1] + view.head * view.mover.added.scale, at[2]] };
  }

  /**
   * The movers a tap may land on (`CWorld::PickObject_Fast`'s candidates, `pickMover`): each one drawn, the mover `except`
   * (`CMover::GetActiveMover()`, its exception object) left out, with what the pick tests it by: the box of its model, a
   * held item's included (`AssembledCharacter.box`; the placeholder's own for the placeholder), the D3D world matrix it
   * is drawn with (`moverMatrix` of `m_vScrPos`, `m_fScrAngle` and the scale), whether it is dead and whether it is a
   * player. A mover whose model is still loading is not drawn and not among them. `dead` is `CMover::IsDie`
   * (`Mover.h:1221`, `isDie`): the dead state, or no HP left. The boxes are made anew from the models at each call: it
   * is for a tap, not for a step.
   */
  pickCandidates(except: number | undefined): PickCandidate[] {
    const found: PickCandidate[] = [];
    for (const view of this.views.values()) {
      if (view.mover.objectId === except) continue;
      const candidate = candidateOf(view);
      if (candidate !== null) found.push(candidate);
    }
    return found;
  }

  /**
   * The candidate `pickCandidates` gives for the mover `objectId` alone, or null when nothing is drawn of it (not in view,
   * or its model still loading): its box and drawn matrix, for the target corners each frame (`CWndWorld::GetBoundRect`)
   * without making every view's box.
   */
  pickCandidate(objectId: number): PickCandidate | null {
    const view = this.views.get(objectId);
    return view === undefined ? null : candidateOf(view);
  }

  /** The movers drawn with their own model. */
  count(): number {
    let n = 0;
    for (const view of this.views.values()) if (view.model !== null) n++;
    return n;
  }

  /** Starts loading an action's motion and allows local combat only once a real model can play it. */
  motionReady(mover: Mover, motion: number): boolean {
    const view = this.views.get(mover.objectId);
    if (view === undefined || view.model === null) return false;
    // swing() enters combat before SetMotion, even when the character was standing peacefully.
    const key = view.look?.motion(motionFor(motion, this.handOf(view), mover.act.stateFlag | ObjStaF.COMBAT, 0));
    if (key == null) return false;
    const clip = this.clip(key);
    return !clip.loading && clip.motion !== null && clip.motion.events.frames > 1;
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
      mover, look: this.lookFor(mover), holder, model: null, held: [], head: null, placeholder: false, bytes: 0,
      // ADD_OBJ ends with InitInterpolation (ObjSerializeOpt.cpp:764): a new mover is drawn where it is
      scrPos: copy(mover.act.body.pos), scrAngle: mover.act.body.angle, frame: startFrame(mover.act.motionSets),
      action: null, played: -1, gone: false, spark: idleSpark(), sparkUniforms: sparkUniforms(), dmgCnt: 0,
    };
    this.views.set(mover.objectId, view);
    const { look } = view;
    if (look === null) {
      this.showPlaceholder(view);
      return;
    }
    // the items of the hands load beside the body, and go in its hands once it is on screen (`hold`)
    const held = this.loadHeld(look, this.report);
    this.track((async () => {
      let loaded: AssembledCharacter | Object3D;
      try {
        loaded = await this.load(look, this.report);
      } catch (error) {
        this.report(`${moverLabel(mover)}: ${messageOf(error)}`);
        if (!view.gone) this.showPlaceholder(view);
        return;
      }
      try {
        // the motion it is in, so that it is drawn in it from the first frame
        const key = this.keyOf(view);
        if (key !== null) await this.clip(key).ready;
        if (view.gone) {
          if ('release' in loaded) loaded.release();
          return;
        }
        this.attach(view, loaded);
      } catch (error) {
        // a model that cannot be put on screen is let go, and the mover is the placeholder, as for one that cannot be had
        this.report(`${moverLabel(mover)}: ${messageOf(error)}`);
        this.detach(view, loaded);
        if (!view.gone) this.showPlaceholder(view);
      }
    })().finally(async () => this.hold(view, await held)));
  }

  private attach(view: View, loaded: AssembledCharacter | Object3D): void {
    const model = 'release' in loaded ? loaded : null;
    const root = model?.root ?? (loaded as Object3D);
    // the top of the model's box, as RenderName projects pBB->m_vPos[0] (MoverRender.cpp:1349-1356), at scale 1
    root.updateWorldMatrix(true, true);
    view.head = Math.max(0, new Box3().setFromObject(root).max.y);
    view.holder.add(root);
    // the skinned parts take the model's flash; the items of the hands, held later (`hold`), are not skinned
    lightWithSpark(root, view.sparkUniforms);
    if (model === null) return;
    const bytes = bytesOf(root);
    this.overlay.addGpuBytes(bytes);
    view.bytes = bytes;
    view.model = model;
    const act = view.mover.act;
    // the model comes on at the first frame of the motion the rules have set
    view.frame = startFrame(act.motionSets);
    act.isEndFrame = () => this.isEndFrame(view);
    act.isAttrHit = () => this.isAttrHit(view);
    act.isAttrQuake = () => this.isAttrQuake(view);
    act.modelFrame = () => this.modelFrame(view);
    this.play(view);
    model.mixer.update(0);
  }

  /**
   * Puts the items of the hands in the model's hands (`attachHeld`), after `attach` took the top of the body for the name
   * tag: RenderName projects the model's box (MoverRender.cpp:1349), where a held item adds only its own box, unioned as
   * it lies at the model's origin (ModelObject.cpp:735-744), not the place the hand carries it to. An item with no model
   * to go on (the mover left, or is the placeholder) is let go; one that cannot be held is let go and said.
   */
  private hold(view: View, items: readonly HeldItem[]): void {
    for (const held of items) {
      const model = view.model;
      if (model === null) {
        held.release();
        continue;
      }
      try {
        attachHeld(model, held.item, held.slot);
      } catch (error) {
        this.report(`${moverLabel(view.mover)}: ${messageOf(error)}`);
        held.release();
        continue;
      }
      view.held.push(held);
      const bytes = bytesOf(held.item);
      this.overlay.addGpuBytes(bytes);
      view.bytes += bytes;
    }
  }

  /**
   * `IsNPC() && m_nDmgCnt > 0 && pMoverProp->dwClass != RANK_SUPER` (`MoverRender.cpp:286`): a mover that is not a
   * player, hit in the last 10 steps, and not a `RANK_SUPER` boss, is drawn shaken. A mover the catalog has no row for
   * counts as no boss.
   */
  private shaken(view: View): boolean {
    const { mover } = view;
    if (mover.added.isPlayer || view.dmgCnt <= 0) return false;
    return this.options.moverProps?.get(mover.added.index)?.rank !== RANK_SUPER;
  }

  /** `xRandom( n )`: the options', or `Math.random`'s (Neuz's `xRand` is a global sequence of its own). */
  private readonly random = (n: number): number =>
    this.options.random?.(n) ?? Math.floor(Math.random() * n);

  /** Takes back what `attach` did of a model that threw on the way, and lets the model go. */
  private detach(view: View, loaded: AssembledCharacter | Object3D): void {
    ('release' in loaded ? loaded.root : loaded).removeFromParent();
    if (view.bytes !== 0) this.overlay.addGpuBytes(-view.bytes);
    view.bytes = 0;
    view.model = null;
    view.head = null;
    view.action = null;
    view.mover.act.isEndFrame = () => true;
    view.mover.act.isAttrHit = () => -1;
    view.mover.act.isAttrQuake = () => false;
    view.mover.act.modelFrame = noFrame;
    if ('release' in loaded) loaded.release();
  }

  private showPlaceholder(view: View): void {
    const figure = new Mesh(this.placeholderGeometry, this.placeholderMaterial);
    figure.name = 'placeholder';
    view.holder.add(figure);
    view.head = PLACEHOLDER_HEIGHT;
    view.placeholder = true;
  }

  private drop(view: View): void {
    view.gone = true;
    this.views.delete(view.mover.objectId);
    view.holder.removeFromParent();
    if (view.model !== null) {
      view.model.release();
      for (const held of view.held) held.release();
      view.held = [];
      this.overlay.addGpuBytes(-view.bytes);
      view.mover.act.isEndFrame = () => true;
      view.mover.act.isAttrHit = () => -1;
      view.mover.act.isAttrQuake = () => false;
      view.mover.act.modelFrame = noFrame;
      view.model = null;
    }
  }

  /**
   * The motion file the model plays for the motion the rules set: the weapon's set of it (`motionFor`), as the look
   * names it; null for a mover with no motions.
   */
  private keyOf(view: View): string | null {
    const act = view.mover.act;
    return view.look?.motion(motionFor(act.motion, this.handOf(view), act.stateFlag, act.motionOption)) ?? null;
  }

  /**
   * What `motionFor` reads of a mover's hand (`CMover::SetMotion`, `Mover.cpp:4821-4864`), for a player of the two
   * bodies or the four master bodies: the right hand's item (`GetActiveHandItemProp`), or the bare hand's row when it
   * is empty or the catalog lacks it; dual when the left hand holds a weapon, not a shield (`IsDualWeapon`,
   * `Mover.cpp:3059-3081`; a left item the catalog lacks counts as none). Null for any other mover.
   */
  private handOf(view: View): MotionHand | null {
    const right = view.look?.held.right ?? null, left = view.look?.held.left ?? null, job = view.mover.added.player?.job ?? -1;
    const cached = view.hand;
    if (cached !== undefined && cached.look === (view.look !== null) && cached.right === right && cached.left === left
      && cached.job === job) return cached.value;
    const value = this.handNow(view);
    view.hand = { look: view.look !== null, right, left, job, value };
    return value;
  }

  private handNow(view: View): MotionHand | null {
    const { mover, look } = view;
    const { index } = mover.added;
    const master = MASTER_BODIES.has(index);
    if (look === null || !mover.added.isPlayer || (index !== MI_MALE && index !== MI_FEMALE && !master)) return null;
    const { right, left } = look.held;
    const item = (right === null ? undefined : this.itemProps.get(right)) ?? this.itemProps.get(II_WEA_HAN_HAND);
    const leftItem = left === null ? undefined : this.itemProps.get(left);
    return {
      kind3: item?.kind3 ?? Ik3.HAND,
      twoHanded: item?.handed === HD_TWO,
      dual: right !== null && leftItem !== undefined && leftItem.part !== Parts.SHIELD,
      master,
      psykeeper: PSYKEEPERS.has(mover.added.player?.job ?? -1),
    };
  }

  /**
   * The model's frame move of this step (`pModel->FrameMove( &vPos, m_fAniSpeed )`, `Mover.cpp:3862`), none while the
   * rules pause the model (`m_nPause`, `Model.cpp:15-16`). While the motion's file loads the move waits (`ModelFrame`).
   * The walk's and the turn's speed factor (`__AI_0509`, :3828-3861) is left out with the rest of Piece 3's walking.
   */
  private moveFrame(view: View): void {
    const act = view.mover.act;
    if (act.paused > 0) return;
    const key = this.keyOf(view);
    if (key === null) return;
    const clip = this.clip(key);
    const { frame } = view;
    if (clip.loading) {
      frame.backlog.push(act.aniSpeed);
      return;
    }
    if (clip.motion === null) return;
    // the hit the rules were given since the last frame move (or, paused, passed by) is behind the model now
    frame.waiting.shift();
    const late = frame.backlog.length > 0;
    this.catchUp(view, clip.motion, true);
    // the moves made late, after the file came, play no sound (the plan's ruling 6)
    if (!late) this.frameSounds(view, clip.motion.events);
    frameMove(frame, clip.motion.events, act.loop, act.aniSpeed);
    if (frame.waiting.length > 0) this.keepHit(frame, clip.motion);
  }

  /**
   * The sounds Neuz plays before the model's frame move, with the old and current frame of the last move: the motion's
   * sound frame (`CModelObject::FrameMove`, ModelObject.cpp:1588-1610) and, for a player moving forward, a footstep on
   * its hit frames (`ProcessWalkSound`, Mover.cpp:3202-3219, called at :3822 before the move at :3862). Transparent mode
   * (a GM's) is not kept by the client, so it does not silence them.
   */
  private frameSounds(view: View, events: MotionEvents): void {
    const sounds = this.options.sounds;
    if (sounds === undefined) return;
    const { frame, mover } = view;
    const p = mover.act.body.pos;
    const at = { x: p[0], y: p[1], z: p[2] };
    const id = soundAt(events.sound, frame.old, frame.current);
    if (id > 0) sounds.motion(at, id);
    const forward = (mover.act.state & ObjSta.MOVE_ALL & ObjSta.FMOVE) !== 0;
    if (mover.kind === 'player' && forward && hitIndex(events.hit, frame.old, frame.current) >= 0) sounds.footstep(at);
  }

  /**
   * Makes the frame moves that waited for the motion's file (`ModelFrame`). The hit each passes waits for the rules,
   * unless it is the last of them, nothing waits before it and no move comes after it (`more`): then the rules test its
   * frames themselves, as any frame move's.
   */
  private catchUp(view: View, motion: LoopedMotion, more: boolean): void {
    const { frame } = view;
    const { backlog } = frame;
    if (backlog.length === 0) return;
    frame.backlog = [];
    backlog.forEach((speed, i) => {
      frameMove(frame, motion.events, view.mover.act.loop, speed);
      if (more || i < backlog.length - 1 || frame.waiting.length > 0) this.keepHit(frame, motion);
    });
  }

  /** Keeps for the rules the hit that the frame's last move passed (`hitIndex`, the C++'s test of one move), if any. */
  private keepHit(frame: ModelFrame, motion: LoopedMotion): void {
    const hit = hitIndex(motion.events.hit, frame.old, frame.current);
    if (hit >= 0) frame.waiting.push(hit);
  }

  /**
   * `m_pModel->IsEndFrame()` (`Model.h:142`): whether the motion the rules set has played past its last frame
   * (`CModel::FrameMove`, `Model.cpp:36-53`, a looping one at its first wrap). False right after the rules set it
   * (`SetMotion` clears the flag) and while its file loads; true for a motion the model cannot play.
   */
  private isEndFrame(view: View): boolean {
    if (view.frame.sets !== view.mover.act.motionSets) return false;
    const key = this.keyOf(view);
    if (key === null) return true;
    const clip = this.clip(key);
    if (clip.loading) return false;
    if (clip.motion === null) return true;
    this.catchUp(view, clip.motion, false);
    return view.frame.endFrame;
  }

  /**
   * `m_pModel->m_fFrameCurrent` and `m_nFrameMax` of the motion the rules set (`ProcessStateMeleeSkill` reads them,
   * `ActionMoverState.cpp:614`): frame 0 right after the rules set it (`InitAnimate`); null while its file loads; 0 of 0
   * for a motion the model cannot play, which is over at once as `isEndFrame` says. While a hit that the frame moves made
   * as the file came in passed waits for the rules (`ModelFrame.waiting`), the frame is that hit's: Neuz, its file in at
   * once, tests each move's hit before the next move, so a skill's 65% cut, which `ProcessStateMeleeSkill` tests before
   * the hit (:614-619, then :651-658), never comes before a hit frame below it; the moves made at once would otherwise
   * carry the frame past the cut and end the skill with its blow untold. A waiting hit at or past the cut ends it, as
   * Neuz never reaches one. The frame given is the waiting hit's own, not the frame of the move that passed it, which is
   * what Neuz would read; the two decide the cut differently only when one move is longer than the gap from the hit to
   * the cut (Neuz would then end the skill with the blow untold). The Vagrant's smallest gap is Flurry's last blow, 0.65
   * of a frame (39 to 39.65; Clean Hit's is 6.15, Over Cut's 10.15), which a move of half a frame (speed 1 at the motions'
   * 30 frames a second) never spans, but a fast enough `aniSpeed` (up to 2, a frame a move) could.
   */
  private modelFrame(view: View): ActionModelFrame | null {
    const key = this.keyOf(view);
    if (key === null) return noFrame();
    const clip = this.clip(key);
    if (clip.loading) return null;
    if (clip.motion === null) return noFrame();
    const max = clip.motion.events.frames;
    if (view.frame.sets !== view.mover.act.motionSets) return { current: 0, max };
    this.catchUp(view, clip.motion, false);
    const waiting = view.frame.waiting[0];
    return { current: waiting === undefined ? view.frame.current : clip.motion.events.hit[waiting]!, max };
  }

  /**
   * `m_pModel->IsAttrHit()` (`ModelObject.h:280-286`): the hit frame of the motion that the model's last frame move went
   * past (`hitIndex`), from frame -1 to 0 for a motion set since (`InitAnimate`); -1 for none, and while the file loads.
   * A hit kept from the moves made as the file came in comes first (`ModelFrame.waiting`). The rules ask it during a
   * swing, whose state can play another motion than the swing's: a level up sets `MTI_LEVELUP` over it
   * (`CMover::SetExperience`, `MoverParam.cpp:1725-1726`: `IsState` is a bitwise test, `Action.h:307`), and that motion
   * has no blow. So only a swing's own motion (`SWING_MOTIONS`) with no hit frame at all is an attack motion of a
   * conversion from before hit frames, or one with no blow, which look the same: that is said once.
   */
  private isAttrHit(view: View): number {
    const key = this.keyOf(view);
    if (key === null) return -1;
    const motion = this.clip(key).motion;
    if (motion === null) return -1;
    const { hit } = motion.events;
    if (hit.length === 0) {
      if (SWING_MOTIONS.has(view.mover.act.motion) && !this.hitless.has(key)) {
        this.hitless.add(key);
        console.warn(`motion ${key}: an attack motion with no hit frame (converted before hit frames, or it has no blow)`);
      }
      return -1;
    }
    if (view.frame.sets !== view.mover.act.motionSets) return hitIndex(hit, -1, 0);
    this.catchUp(view, motion, false);
    const { frame } = view;
    return frame.waiting[0] ?? hitIndex(hit, frame.old, frame.current);
  }

  /**
   * Piece 7 M2: `m_pModel->IsAttrQuake()` (`ModelObject.h:304`, `CMotion::IsAttrQuake`, `Bone.h:178-185`): whether the
   * model's last frame move went past a quake frame of the motion the rules set (`hitIndex` over its quake frames), from
   * frame -1 to 0 for a motion set since; false while the file loads. A quake passed by the moves made as the file came
   * in is not kept, as hits are: it only throws a yoyo, which is drawing.
   */
  private isAttrQuake(view: View): boolean {
    const key = this.keyOf(view);
    if (key === null) return false;
    const motion = this.clip(key).motion;
    if (motion === null || motion.events.quake.length === 0) return false;
    if (view.frame.sets !== view.mover.act.motionSets) return hitIndex(motion.events.quake, -1, 0) >= 0;
    this.catchUp(view, motion, false);
    return hitIndex(motion.events.quake, view.frame.old, view.frame.current) >= 0;
  }

  /**
   * Plays the motion the rules set, once its file is in: looping for `ANILOOP_LOOP`, else once and held at its last
   * frame (`once`). A new motion, or one set again that does not loop, starts at the model's frame, and blends in over
   * 20 steps from the last one unless the option says not to (`CMover::SetMotion`, `Mover.cpp:4924-4925`). It plays at
   * the mover's animation speed, and holds still while the model is paused. A motion the model has no file for keeps
   * the last one playing.
   */
  private play(view: View): void {
    const model = view.model;
    const key = this.keyOf(view);
    if (model === null || key === null) return;
    const motion = this.clip(key).motion;
    if (motion === null) return;
    const act = view.mover.act;
    const looping = act.loop === AniLoop.LOOP && motion.frames >= 2;
    const action = model.mixer.clipAction(looping || motion.frames < 2 ? motion.clip : this.once(motion));
    if (action !== view.action || (view.played !== act.motionSets && !looping)) {
      if (looping) {
        action.setLoop(LoopRepeat, Infinity);
      } else {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      const last = view.action;
      action.reset().play();
      if (view.frame.sets === act.motionSets) {
        this.catchUp(view, motion, false);
        action.time = timeOf(motion, view.frame.current);
      }
      if (last !== null && last !== action) {
        if (act.motionOption & Mop.NO_TRANS) last.stop();
        else {
          action.fadeIn(BLEND_SECONDS);
          last.fadeOut(BLEND_SECONDS);
        }
      }
      view.action = action;
    }
    view.played = act.motionSets;
    action.timeScale = act.paused > 0 ? 0 : act.aniSpeed;
  }

  /**
   * The clip of a motion played once, which stops on its last frame as `CModel::FrameMove` stops it (`Model.cpp:45-53`):
   * the motion's tracks, ended at the last frame, before the way back to frame 0 that `loopMotion` adds for looping.
   */
  private once(motion: LoopedMotion): AnimationClip {
    let clip = this.onceClips.get(motion);
    if (clip === undefined) {
      clip = new AnimationClip(motion.clip.name, motion.frameTime(motion.frames - 1), motion.clip.tracks);
      this.onceClips.set(motion, clip);
    }
    return clip;
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
        (error: unknown) => this.report(`motion ${key}: ${messageOf(error)}`),
      ).finally(() => {
        entry.loading = false;
      }));
      this.clips.set(key, entry);
      clip = entry;
    }
    return clip;
  }

  /**
   * Keeps a load in `pending` until it settles. Whatever it throws is said on the overlay instead: nothing goes
   * unhandled, and `settled` never rejects, so one bad model cannot end the entry.
   */
  private track(work: Promise<void>): Promise<void> {
    const settled = work.catch((error: unknown) => this.report(`mover views: ${messageOf(error)}`));
    this.pending.add(settled);
    void settled.finally(() => this.pending.delete(settled));
    return settled;
  }

  /** Says `message` on the overlay, unless the views are disposed: the overlay is the page's, and outlives this entry. */
  private readonly report = (message: string): void => {
    if (!this.disposed) this.overlay.error(message);
  };
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

/**
 * Where a shaken mover is drawn this frame (`MoverRender.cpp:289-294`): its drawn position plus the offset
 * `shakeOffset` gives, in D3D, added as `mWorld * matDmg` adds it.
 */
function shakenPos(scrPos: Vec3, random: (n: number) => number): Vec3 {
  const [x, y, z] = shakeOffset(random);
  return [scrPos[0] + x, scrPos[1] + y, scrPos[2] + z];
}

/** A view's pick candidate (`MoverViews.pickCandidates`), or null when nothing is drawn of it yet. */
function candidateOf(view: View): PickCandidate | null {
  const { mover } = view;
  const box = view.model !== null ? view.model.box() : view.placeholder ? placeholderBox() : null;
  if (box === null) return null;
  return {
    objectId: mover.objectId, box, world: moverMatrix(view.scrPos, view.scrAngle, mover.added.scale), dead: isDie(mover),
    isPlayer: mover.added.isPlayer,
  };
}

/** What the meshes under `object` add to the overlay's GPU estimate. */
function bytesOf(object: Object3D): number {
  let bytes = 0;
  object.traverse((o) => {
    if (o instanceof Mesh) bytes += geometryBytes(o.geometry);
  });
  return bytes;
}

/** How the overlay names a mover: its `MI_*` index and its name. */
function moverLabel(mover: Mover): string {
  return `mover ${mover.added.index}${mover.name === '' ? '' : ` (${mover.name})`}`;
}

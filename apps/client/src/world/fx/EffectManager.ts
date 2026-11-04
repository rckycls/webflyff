import type { Vec3, WebEffect } from '@flyffweb/formats';
import { toWebMatrix } from '@flyffweb/formats';
import { EffectModel } from '@flyffweb/scene';
import type { EffectRandom, EffectRenderer } from '@flyffweb/scene';
import type { Camera } from 'three';
import type { MissileView } from '../combat/missiles';
import type { GameData } from '../gameData';
import { wrapAngle } from '../sim/ActionMover';

/**
 * Effects by `XI_*` id, played as Neuz plays them. `CreateSfx` (`Source/_Common/CreateObj.cpp:33-377`) makes an object of
 * the class the id names and puts it in the world; `CSfx::Process` (`SfxObj.cpp:134-238`) steps it and moves it each
 * tick; `CSfx::Render` (`:241-260`) draws it. The three classes Piece 4 needs:
 *
 * - **`CSfx`**, the plain one (the `default` of the switch, `CreateObj.cpp:311`: the level up, the critical, miss, parry
 *   and block banners, the monster spawn): follows the mover whose id it was made with, and is drawn 0.2 m up.
 * - **`CSfxGenNormalDmg01`** (`XI_HIT_SWORD01/02`, `XI_HIT_STICK01/02`, `CreateObj.cpp:61-64`; `Sfx.cpp:47-68`): follows
 *   nothing, is drawn where it is (no 0.2) and with heading 0: its `Render` never sets `m_vRotate.y`.
 * - **`CSfxFixed`** (the Vagrant skills and the other ids of `CreateObj.cpp:94-153`; `Sfx.cpp:2086-2119`): sits at the
 *   point it was given, is drawn there (no 0.2) and turned to the caster as `CreateSfx` turns it (below).
 *
 * **The heading** is `CreateSfx`'s: for the ids of its `CSfxFixed` cases it calls `SetAngle` with the source mover's angle
 * turned by the case, when the source is a valid mover (`CreateObj.cpp:110-111,118-121,151-152`): `-a` for the melee
 * skill hits, `-a + 180` for the two Knuckle Hammer hits, `180 - a` for the bow, yoyo and arrow hits. `SetAngle` keeps
 * it in 65536 steps a circle (`Obj.cpp:662-664`). Every other effect keeps the angle a new `CObj` has, 0 (`Obj.cpp:49`).
 * The callers pass the source's angle, and the manager turns it. (Not copied, as none is in Piece 4: `CreateSfx` also
 * turns the plain `XI_SKILL_MER_ONE_BLOODYSTRIKE02` by the direction from the source to the target, `CreateObj.cpp:206-217`;
 * and Neuz has callers that call `SetAngle` on the effect `CreateSfx` returns: the boss attacks `XI_NPCSP1DIRFIRESP` and
 * `XI_NPCSP1DIRCANNON`, `MoverActEvent.cpp:906,920,1165`; gathering, `MoverActEvent.cpp:2160`, `Mover.cpp:11579`; the
 * party leader's marker, `DPClient.cpp:5433`. So there is no way to give a heading of one's own yet.)
 *
 * The other classes (projectiles, effects linked to a hand or a back, the casting effects) are not in Piece 4's reach,
 * and would play here as the plain one.
 *
 * Every effect plays once (`nSec` is 0, `SfxObj.cpp:143-147`) and goes when its model says it is over. Time is the
 * game's 60 Hz tick (`step`); the model has no clock of its own.
 */

/**
 * The `XI_*` ids of `Resource/defineObj.h` the manager tells apart, and the ones the fight and the skills play. Named
 * after the C++ as the other constants are: `Xi.HIT_SWORD01` is `XI_HIT_SWORD01`. A corpus test checks every value
 * against the client's `defineObj.h`.
 */
export const Xi = {
  HIT_CRITICAL01: 11,
  HIT_MISS01: 12,
  HIT_PARRY01: 13,
  HIT_HITBLOCK01: 16,
  HIT_YOY01: 17,
  HIT_SWORD01: 20,
  HIT_SWORD02: 21,
  /** Piece 7 M2: the wand's hit (`sfx_HitWand01`), its missile on the ground and in the air, the arrow. */
  HIT_WAND01: 22,
  FIR_WAND01: 27,
  FIR_WAND02: 28,
  ITEM_RANGE_ATK1: 112,
  HIT_STICK01: 24,
  HIT_STICK02: 25,
  HIT_KNUCKLE01: 31,
  HIT_BOW01: 33,
  GEN_LEVEL_UP01: 42,
  GEN_MONSTER_SPAWN01: 59,
  SKILL_VAG_ONE_CLEANHIT01: 201,
  SKILL_VAG_ONE_BRANDISH01: 202,
  SKILL_VAG_ONE_OVERCUTTER01: 203,
  SKILL_MER_ONE_SPECIALHIT02: 229,
  SKILL_MER_ONE_REFLEXHIT02: 232,
  SKILL_KNT_TWO_POWERSWING02: 318,
  SKILL_KNT_TWOSW_EARTHDIVIDER02: 326,
  SKILL_BLD_DOUBLESW_BLADEDANCE02: 340,
  SKILL_BLD_DOUBLE_CROSSSTRIKE02: 343,
  SKILL_BLD_DOUBLE_ARMORPENETRATE02: 345,
  SKILL_BLD_DOUBLESW_BLADEDANCE03: 347,
  SKILL_BLD_DOUBLEAX_HAWKATTACK03: 348,
  SKILL_BLD_DOUBLE_SONICBLADE03: 349,
  SKILL_BIL_KNU_BELIALSMESHING02: 375,
  SKILL_BIL_KNU_PIERCINGSERPENT02: 376,
  SKILL_BIL_KNU_BLOODFIST02: 377,
  SKILL_BIL_KNU_SONICHAND02: 378,
  SKILL_BIL_KNU_ASALRAALAIKUM02: 382,
  SKILL_ELE_FIRE_BURINGFIELD02: 421,
  SKILL_RIN_SUP_MERKABAHANZELRUSHA03: 503,
  SKILL_ACR_BOW_JUNKBOW03: 551,
  SKILL_ACR_BOW_AIMEDSHOT03: 553,
  SKILL_ACR_YOYO_SLOWSTEP02: 554,
  SKILL_ACR_BOW_SILENTSHOT03: 555,
  SKILL_ACR_BOW_AUTOSHOT03: 559,
  SKILL_ACR_YOYO_SNITCH02: 560,
  SKILL_JST_YOYO_HITOFPENYA02: 569,
  SKILL_JST_YOYO_VATALSTAB02: 571,
  SKILL_RAG_BOW_FLAMEARROW03: 574,
  SKILL_RAG_BOW_PIRCINGARROW03: 575,
  SKILL_RAG_BOW_POISONARROW03: 576,
  SKILL_RAG_BOW_SILENTARROW03: 577,
  SKILL_RAG_SUP_NATURE02: 578,
  SKILL_RAG_BOW_TRIPLESHOT03: 579,
  EVE_EVENT_FAIRYLY: 810,
} as const;

/** The ids `CreateSfx` makes a `CSfxGenNormalDmg01` of (`CreateObj.cpp:61-64`). */
const NORMAL_DMG = new Set<number>([Xi.HIT_SWORD01, Xi.HIT_SWORD02, Xi.HIT_STICK01, Xi.HIT_STICK02]);

/** The ids `CreateSfx` makes a `CSfxFixed` of and turns by `-a`: the melee skill hits (`CreateObj.cpp:94-111`). */
const FIXED_FACING = new Set<number>([
  Xi.SKILL_VAG_ONE_OVERCUTTER01, Xi.SKILL_VAG_ONE_CLEANHIT01, Xi.SKILL_VAG_ONE_BRANDISH01,
  Xi.SKILL_MER_ONE_SPECIALHIT02, Xi.SKILL_MER_ONE_REFLEXHIT02, Xi.SKILL_BIL_KNU_BELIALSMESHING02,
  Xi.SKILL_BLD_DOUBLE_CROSSSTRIKE02, Xi.SKILL_BLD_DOUBLE_ARMORPENETRATE02, Xi.SKILL_BIL_KNU_BLOODFIST02,
  Xi.SKILL_BLD_DOUBLE_SONICBLADE03, Xi.SKILL_BIL_KNU_PIERCINGSERPENT02, Xi.SKILL_RIN_SUP_MERKABAHANZELRUSHA03,
  Xi.SKILL_ELE_FIRE_BURINGFIELD02, Xi.SKILL_KNT_TWOSW_EARTHDIVIDER02,
]);

/** The ids it makes a `CSfxFixed` of and turns by `-a + 180`: "the sfx is drawn the other way round" (`CreateObj.cpp:115-124`). */
const FIXED_BACK = new Set<number>([Xi.SKILL_BIL_KNU_SONICHAND02, Xi.SKILL_BIL_KNU_ASALRAALAIKUM02]);

/** The ids it makes a `CSfxFixed` of and turns by `180 - a`: the bow, yoyo and arrow hits (`CreateObj.cpp:128-152`). */
const FIXED_AROUND = new Set<number>([
  Xi.HIT_YOY01, Xi.HIT_BOW01, Xi.SKILL_JST_YOYO_HITOFPENYA02, Xi.SKILL_JST_YOYO_VATALSTAB02, Xi.SKILL_ACR_YOYO_SLOWSTEP02,
  Xi.SKILL_RAG_BOW_FLAMEARROW03, Xi.SKILL_RAG_BOW_PIRCINGARROW03, Xi.SKILL_RAG_BOW_POISONARROW03,
  Xi.SKILL_RAG_BOW_SILENTARROW03, Xi.SKILL_RAG_SUP_NATURE02, Xi.SKILL_RAG_BOW_TRIPLESHOT03, Xi.SKILL_ACR_YOYO_SNITCH02,
  Xi.SKILL_ACR_BOW_AIMEDSHOT03, Xi.SKILL_ACR_BOW_JUNKBOW03, Xi.SKILL_ACR_BOW_SILENTSHOT03, Xi.SKILL_ACR_BOW_AUTOSHOT03,
  Xi.SKILL_BLD_DOUBLEAX_HAWKATTACK03, Xi.SKILL_BLD_DOUBLESW_BLADEDANCE02, Xi.SKILL_BLD_DOUBLESW_BLADEDANCE03,
  Xi.SKILL_KNT_TWO_POWERSWING02,
]);

/** Every id `CreateSfx` makes a `CSfxFixed` of: those three groups, and the fairy (`CreateObj.cpp:294-296`), which is not turned. */
const FIXED = new Set<number>([...FIXED_FACING, ...FIXED_BACK, ...FIXED_AROUND, Xi.EVE_EVENT_FAIRYLY]);

const f32 = Math.fround;
/** `vPosSrc.y += 0.01f`: "a little off the ground, or it flickers" (`CSfx::SetSfx`, `SfxObj.cpp:85`). */
const MADE_LIFT = f32(0.01);
/** `m_vPos.y += 0.2f` (`CSfx::Render`, `SfxObj.cpp:254`). */
const DRAWN_LIFT = f32(0.2);

/** What to play, as the arguments and the follow-up calls of `CreateSfx` say it. */
export interface EffectRequest {
  /** The `XI_*` id of mdlDyna.inc (`Xi`). 0 and below are no effect (`case 0: break;`, `CreateObj.cpp:310`). */
  xi: number;
  /**
   * Where it is made (D3D). For a plain effect and `CSfxGenNormalDmg01` that is `vPosSrc`, which `SetSfx` lifts by 0.01.
   * For a `CSfxFixed` it is **`vPosDest`**: while its caster is a valid mover the effect sits at `m_vPosDest`
   * (`Sfx.cpp:2089-2092`), a copy made before the lift (`SfxObj.cpp:82,85`), so a fixed effect gets no 0.01. (With the
   * caster gone Neuz leaves it at `vPosSrc` + 0.01; the manager has no caster to ask. A Vagrant skill gives the same
   * point for both.) `play` copies it.
   */
  pos: Vec3;
  /**
   * `idSrc`: the mover the effect follows. Each tick the effect goes to the mover's position, and it ends when the mover
   * is gone (`CSfx::Process`, `SfxObj.cpp:229-235`). Without it the effect stays where it was made. The two classes
   * that do not follow (`CSfxGenNormalDmg01`, `CSfxFixed`) never do.
   */
  followId?: number;
  /**
   * `followId` is the effect's `idDest` too, or instead: it goes to the mover's position each tick as before, but a mover
   * that is gone leaves it at the last position, where it plays on, instead of ending it (`SfxObj.cpp:178-188`; the
   * destination is looked at first). `OnCreateSfxObj` (`Neuz/DPClient.cpp:4038-4067`) gives the mover as both.
   */
  followDest?: boolean;
  /** Play it as a `CSfxFixed` (stays where made, no 0.2 m), whatever its id. The ids `CreateSfx` makes one of are fixed anyway. */
  fixed?: boolean;
  /**
   * `pSrc->GetAngle()`: the source mover's (the caster's) angle in FlyFF degrees. Pass the caster's angle as it is; the
   * manager turns it as `CreateSfx` turns it (`-a`, `-a + 180` or `180 - a` by the id, see the top of the file). Leave it
   * out when there is no valid source mover (`IsValidObj( pSrc )` fails: no turn). It does nothing for the ids that
   * `CreateSfx` does not turn.
   */
  sourceAngle?: number;
  /** `SetScale( s, s, s )` after `CreateSfx`: replaces the scale of the index entry (`CObj::SetScale`, `Obj.cpp:709-714`). */
  scale?: number;
  /**
   * Piece 7 M2: `SetAngle( a )` after `CreateSfx`, a heading of its own (degrees) that replaces the one `CreateSfx` turned
   * from `sourceAngle`: an arrow's hit takes the arrow's yaw (`pSfx->SetAngle( m_pSfxObj->m_vRotate.y )`, `Sfx.cpp:1053-1056`).
   */
  angle?: number;
  /**
   * Piece 7 M2: `nSec` of `CreateSfx`: the effect's model loops until `nSec * 60` ticks have gone by
   * (`CSfx::Process`, `SfxObj.cpp:148-158`), as a buff's lasting effect does (`dwSfxObj4`). Without it, once.
   */
  seconds?: number;
  /**
   * Piece 7 M3: a `CSfxReady`, an item cast's ready effect: its model loops while this holds, and it is deleted the tick
   * it no longer does (its caster has left `STATE_BASEMOTION_MODE`), or when the mover it follows is gone
   * (`CSfxReady::Process`, `Sfx.cpp:3826-3837`).
   */
  whileTrue?: () => boolean;
}

/** One effect in the world: a `CSfx`. */
interface Playing {
  model: EffectModel;
  /** `GetPos()` (D3D). */
  pos: Vec3;
  /** `m_idSrc` (or `m_idDest`), or null for an effect that stays put. */
  followId: number | null;
  /** The mover it follows is `m_idDest`: the effect stays at its last position when the mover is gone. */
  keepWhenGone: boolean;
  /** Piece 7 M2: `m_nSec` (seconds) and `m_nFrame`, for an effect that loops for a time; null plays once. */
  seconds: number | null;
  frame: number;
  /** Piece 7 M3: a `CSfxReady`'s test, or null. */
  whileTrue: (() => boolean) | null;
  /** `GetAngle()`, degrees, as `SetAngle` stores it. */
  angle: number;
  /** `GetScale()`. */
  scale: Vec3;
  /** What `Render` adds to y: 0.2, or 0 for the two classes that do not. */
  lift: number;
}

/**
 * The heading `CreateSfx` leaves the effect at (`CreateObj.cpp:94-153`): for the ids of its `CSfxFixed` cases, with a valid
 * source mover, `SetAngle` of `-a` (`:111`), `-a + 180` (`:119-121`) or `180 - a` (`:152`), in floats, and `SetAngle`
 * stores it in 65536 steps a circle (`wrapAngle`, `Obj.cpp:662-664`). Anything else is not turned: the `CObj`'s own 0
 * (`Obj.cpp:49`), which `CSfxGenNormalDmg01::Render` and the plain `CSfx::Render` hand to the model as `m_vRotate.y`.
 */
function headingOf(xi: number, sourceAngle: number | undefined): number {
  if (sourceAngle === undefined) return 0;
  const angle = f32(sourceAngle);
  if (FIXED_FACING.has(xi)) return wrapAngle(-angle);
  if (FIXED_BACK.has(xi)) return wrapAngle(f32(-angle + 180));
  if (FIXED_AROUND.has(xi)) return wrapAngle(f32(180 - angle));
  return 0;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class EffectManager {
  private effects: Playing[] = [];
  /** The effect files that are in, by logical key. */
  private readonly loaded = new Map<string, WebEffect>();
  /** Each file's load, started once; null when it could not be had. */
  private readonly loading = new Map<string, Promise<WebEffect | null>>();
  private readonly reported = new Set<string>();
  /** Piece 7 M2: the missiles' flight models by missile id (null while the file loads), with their last view. */
  private readonly missiles = new Map<number, { model: EffectModel | null; view: MissileView }>();
  /**
   * Told of each effect made, with its id and where it is made: `CreateSfx` plays the effect's sound there
   * (CreateObj.cpp:82, :180-181, :328-329), at once, whether or not the file is in yet (Piece 6 M2).
   */
  made: ((xi: number, pos: Vec3) => void) | undefined;

  /**
   * @param data    The effects index (`GameData.effects`): each `XI_*` id's effect file and scale.
   * @param load    An effect file by logical key; rejects for one that is not in the asset index. 17 of the 652 entries
   *                name a `.sfx` the client lacks, and play as nothing.
   * @param random  What the models draw their particles' randoms from (`neuzRandom`).
   * @param report  Where problems go, each once. `console.error` unless given.
   */
  constructor(
    private readonly data: Pick<GameData, 'effects'>,
    private readonly load: (key: string) => Promise<WebEffect>,
    private readonly renderer: Pick<EffectRenderer, 'begin' | 'draw' | 'end'>,
    private readonly random: EffectRandom,
    private readonly report: (message: string) => void = (message) => console.error(message),
  ) {}

  /**
   * `CreateSfx`. An id that is not in the index, or whose file cannot be had, is skipped and said once. The first
   * time an effect file is wanted it has to come over the network, and the effect begins when it has: later plays begin
   * at once.
   */
  play(given: EffectRequest): void {
    if (given.xi <= 0) return;
    // a copy: an effect that waits for its file reads the request when the file arrives, not when it was played
    const request: EffectRequest = { ...given, pos: [given.pos[0], given.pos[1], given.pos[2]] };
    const ref = this.data.effects.get(request.xi);
    if (ref === undefined) {
      this.reportOnce(`xi ${request.xi}`, `effect XI ${request.xi}: not in the effects index`);
      return;
    }
    this.made?.(request.xi, request.pos);
    const ready = this.loaded.get(ref.effect);
    if (ready !== undefined) {
      this.start(ready, ref.effect, request, ref.scale);
      return;
    }
    void this.file(ref.effect).then((effect) => {
      if (effect !== null) this.start(effect, ref.effect, request, ref.scale);
    });
  }

  /**
   * One 60 Hz tick of every effect, `CSfx::Process` (`SfxObj.cpp:134-238`): the model's tick, and an effect that is over
   * is deleted (`:143-147`); then an effect that follows goes to the position of the mover (`:178-188,229-235`), or is
   * deleted when `find` has no such mover (unless it follows a destination).
   */
  step(find: (objectId: number) => { pos: Vec3 } | undefined): void {
    this.effects = this.effects.filter((effect) => {
      effect.frame++;
      if (effect.whileTrue !== null) {
        if (!effect.whileTrue()) return false; // CSfxReady::Process: the cast is over
        if (effect.model.step()) effect.model.rewind();
      } else if (effect.seconds === null) {
        if (effect.model.step()) return false;
      } else {
        if (effect.model.step()) effect.model.rewind(); // m_nCurFrame = 0
        if (effect.frame > effect.seconds * 60) return false;
      }
      if (effect.followId !== null) {
        const source = find(effect.followId);
        if (source !== undefined) effect.pos = [f32(source.pos[0]), f32(source.pos[1]), f32(source.pos[2])];
        else if (!effect.keepWhenGone) return false;
      }
      return true;
    });
  }

  /**
   * Hands the renderer each effect's draw list: `CSfx::Render` (`SfxObj.cpp:241-260`) at its position, lifted by 0.2 m
   * for the plain class, with its heading and scale. The billboards face `camera`: the inverse view `g_matInvView` is
   * the camera's world matrix in D3D's handedness (`toWebMatrix` is its own inverse), and its translation is ignored.
   */
  draw(camera: Camera): void {
    camera.updateMatrixWorld();
    const invView = toWebMatrix(Float32Array.from(camera.matrixWorld.elements));
    this.renderer.begin();
    for (const effect of this.effects) {
      const list = effect.model.drawList(effect.angle, effect.scale, invView);
      if (list.length === 0) continue;
      this.renderer.draw(list, [effect.pos[0], f32(effect.pos[1] + effect.lift), effect.pos[2]], camera);
    }
    // Piece 7 M2: the missiles in flight, `Render2` at their position, unlifted (`CSfxItemWandAtk1::Render`, `Sfx.cpp:939-951`)
    for (const { model, view } of this.missiles.values()) {
      if (model === null) continue;
      const list = model.drawList2(view.rotation, [view.scale, view.scale, view.scale], invView);
      if (list.length > 0) this.renderer.draw(list, view.pos, camera);
    }
    this.renderer.end();
  }

  /**
   * Piece 7 M2: one 60 Hz tick of the missiles' flight models, given the missiles in flight (`Missiles.views`): a new one
   * gets its model once its file is in (`CreateSfx`), each steps (`m_pSfxObj->Process()`) and goes back to frame 0 at its
   * `loopFrame` (the wand's 20, `Sfx.cpp:884-888`) or, with none, once it is over (the arrow's, :978-981); a missile no more
   * in flight drops its model. A missile whose file cannot be had flies undrawn (said once).
   */
  stepMissiles(views: readonly MissileView[]): void {
    const live = new Set<number>();
    for (const view of views) {
      live.add(view.id);
      let missile = this.missiles.get(view.id);
      if (missile === undefined) {
        missile = { model: null, view };
        this.missiles.set(view.id, missile);
        this.missileModel(view.id, view.xi);
      }
      missile.view = view;
      const model = missile.model;
      if (model === null) continue;
      const over = model.step();
      if (view.loopFrame !== null ? model.frame === view.loopFrame : over) model.rewind();
    }
    for (const id of [...this.missiles.keys()]) if (!live.has(id)) this.missiles.delete(id);
  }

  /** The flight model of the missile `id`, `xi`'s file, as soon as it is in (and the missile still flies). */
  private missileModel(id: number, xi: number): void {
    const ref = this.data.effects.get(xi);
    if (ref === undefined) {
      this.reportOnce(`xi ${xi}`, `effect XI ${xi}: not in the effects index`);
      return;
    }
    const start = (effect: WebEffect | null): void => {
      const missile = this.missiles.get(id);
      if (effect === null || missile === undefined) return;
      try {
        missile.model = new EffectModel(effect, this.random);
      } catch (error) {
        this.reportOnce(`start ${ref.effect}`, `effect ${ref.effect}: ${messageOf(error)}`);
      }
    };
    const ready = this.loaded.get(ref.effect);
    if (ready !== undefined) start(ready);
    else void this.file(ref.effect).then(start);
  }

  /**
   * Loads the file of `xi` ahead of its first `play`, which then starts at once, and names to `texture` the logical key of
   * each texture its parts draw (`texture`, and each frame of a texture animation), for the renderer's textures to start
   * loading too. Neuz has every file on disk; here they come over the network on first use, and a hit spark (19 ticks)
   * asked for the first time could be over before its file and textures are in. An id not in the index, or a file that
   * cannot be had, is said once, as `play` says it; 0 and below are nothing.
   */
  preload(xi: number, texture: (key: string) => void): void {
    if (xi <= 0) return;
    const ref = this.data.effects.get(xi);
    if (ref === undefined) {
      this.reportOnce(`xi ${xi}`, `effect XI ${xi}: not in the effects index`);
      return;
    }
    void this.file(ref.effect).then((effect) => {
      if (effect === null) return;
      for (const part of effect.parts) {
        if (part.texture !== null) texture(part.texture);
        for (const frame of part.frames) if (frame !== null) texture(frame);
      }
    });
  }

  /** The effects playing now. */
  count(): number {
    return this.effects.length;
  }

  /** An effect file's load: once per file, shared by every effect that wants it. Resolves to null when it cannot be had. */
  private file(key: string): Promise<WebEffect | null> {
    let pending = this.loading.get(key);
    if (pending === undefined) {
      pending = new Promise<WebEffect>((resolve) => resolve(this.load(key))).then(
        (effect) => {
          this.loaded.set(key, effect);
          return effect;
        },
        (error: unknown) => {
          this.reportOnce(`file ${key}`, `effect ${key}: ${messageOf(error)}`);
          return null;
        },
      );
      this.loading.set(key, pending);
    }
    return pending;
  }

  /** `CSfx::SetSfx` and the class `CreateSfx` chose, for an effect whose file is in. */
  private start(effect: WebEffect, key: string, request: EffectRequest, indexScale: number): void {
    try {
      const fixed = request.fixed === true || FIXED.has(request.xi);
      const plain = !fixed && !NORMAL_DMG.has(request.xi);
      const scale = request.scale ?? indexScale;
      this.effects.push({
        model: new EffectModel(effect, this.random),
        // `SetPos( vPosSrc )` after `vPosSrc.y += 0.01f`; a fixed effect is at `m_vPosDest`, which has no lift (`Sfx.cpp:2091`)
        pos: [f32(request.pos[0]), fixed ? f32(request.pos[1]) : f32(f32(request.pos[1]) + MADE_LIFT), f32(request.pos[2])],
        followId: plain && request.followId !== undefined ? request.followId : null,
        keepWhenGone: request.followDest === true,
        seconds: request.seconds !== undefined && request.seconds > 0 ? request.seconds : null,
        frame: 0,
        whileTrue: request.whileTrue ?? null,
        angle: request.angle === undefined ? headingOf(request.xi, request.sourceAngle) : wrapAngle(f32(request.angle)),
        scale: [scale, scale, scale],
        lift: plain ? DRAWN_LIFT : 0,
      });
    } catch (error) {
      this.reportOnce(`start ${key}`, `effect ${key}: ${messageOf(error)}`);
    }
  }

  private reportOnce(id: string, message: string): void {
    if (this.reported.has(id)) return;
    this.reported.add(id);
    this.report(message);
  }
}

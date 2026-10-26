import type { Vec3, WebEffect } from '@flyffweb/formats';
import { toWebMatrix } from '@flyffweb/formats';
import { EffectModel } from '@flyffweb/scene';
import type { EffectRandom, EffectRenderer } from '@flyffweb/scene';
import type { Camera } from 'three';
import type { GameData } from '../gameData';

/**
 * Effects by `XI_*` id, played as Neuz plays them. `CreateSfx` (`Source/_Common/CreateObj.cpp:33-377`) makes an object of
 * the class the id names and puts it in the world; `CSfx::Process` (`SfxObj.cpp:134-238`) steps it and moves it each
 * tick; `CSfx::Render` (`:241-260`) draws it. The three classes Piece 4 needs:
 *
 * - **`CSfx`**, the plain one (the `default` of the switch, `CreateObj.cpp:311`: the level up, the critical, miss, parry
 *   and block banners, the monster spawn): follows the mover whose id it was made with, and is drawn 0.2 m up.
 * - **`CSfxGenNormalDmg01`** (`XI_HIT_SWORD01/02`, `XI_HIT_STICK01/02`, `CreateObj.cpp:61-64`; `Sfx.cpp:47-68`): follows
 *   nothing, is drawn where it is (no 0.2) and with heading 0: its `Render` never sets `m_vRotate.y`.
 * - **`CSfxFixed`** (the Vagrant skills and the other ids of `CreateObj.cpp:94-153`; `Sfx.cpp:2086-2119`): stays at the
 *   point it was made at, is drawn there (no 0.2) with the heading it was given (`CreateSfx` sets it from the caster).
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

/**
 * The ids `CreateSfx` makes a `CSfxFixed` of: the melee skill hits (`CreateObj.cpp:94-114`, heading `-caster angle`),
 * the two Knuckle Hammer ones turned round (`:115-124`, `-angle + 180`), the bow, yoyo and arrow hits (`:128-153`,
 * `180 - angle`) and the fairy (`:294-296`, no heading set).
 */
const FIXED = new Set<number>([
  Xi.SKILL_VAG_ONE_OVERCUTTER01, Xi.SKILL_VAG_ONE_CLEANHIT01, Xi.SKILL_VAG_ONE_BRANDISH01,
  Xi.SKILL_MER_ONE_SPECIALHIT02, Xi.SKILL_MER_ONE_REFLEXHIT02, Xi.SKILL_BIL_KNU_BELIALSMESHING02,
  Xi.SKILL_BLD_DOUBLE_CROSSSTRIKE02, Xi.SKILL_BLD_DOUBLE_ARMORPENETRATE02, Xi.SKILL_BIL_KNU_BLOODFIST02,
  Xi.SKILL_BLD_DOUBLE_SONICBLADE03, Xi.SKILL_BIL_KNU_PIERCINGSERPENT02, Xi.SKILL_RIN_SUP_MERKABAHANZELRUSHA03,
  Xi.SKILL_ELE_FIRE_BURINGFIELD02, Xi.SKILL_KNT_TWOSW_EARTHDIVIDER02,
  Xi.SKILL_BIL_KNU_SONICHAND02, Xi.SKILL_BIL_KNU_ASALRAALAIKUM02,
  Xi.HIT_YOY01, Xi.HIT_BOW01, Xi.SKILL_JST_YOYO_HITOFPENYA02, Xi.SKILL_JST_YOYO_VATALSTAB02, Xi.SKILL_ACR_YOYO_SLOWSTEP02,
  Xi.SKILL_RAG_BOW_FLAMEARROW03, Xi.SKILL_RAG_BOW_PIRCINGARROW03, Xi.SKILL_RAG_BOW_POISONARROW03,
  Xi.SKILL_RAG_BOW_SILENTARROW03, Xi.SKILL_RAG_SUP_NATURE02, Xi.SKILL_RAG_BOW_TRIPLESHOT03, Xi.SKILL_ACR_YOYO_SNITCH02,
  Xi.SKILL_ACR_BOW_AIMEDSHOT03, Xi.SKILL_ACR_BOW_JUNKBOW03, Xi.SKILL_ACR_BOW_SILENTSHOT03, Xi.SKILL_ACR_BOW_AUTOSHOT03,
  Xi.SKILL_BLD_DOUBLEAX_HAWKATTACK03, Xi.SKILL_BLD_DOUBLESW_BLADEDANCE02, Xi.SKILL_BLD_DOUBLESW_BLADEDANCE03,
  Xi.SKILL_KNT_TWO_POWERSWING02, Xi.EVE_EVENT_FAIRYLY,
]);

const f32 = Math.fround;
/** `vPosSrc.y += 0.01f`: "a little off the ground, or it flickers" (`CSfx::SetSfx`, `SfxObj.cpp:85`). */
const MADE_LIFT = f32(0.01);
/** `m_vPos.y += 0.2f` (`CSfx::Render`, `SfxObj.cpp:254`). */
const DRAWN_LIFT = f32(0.2);

/** What to play, as the arguments and the follow-up calls of `CreateSfx` say it. */
export interface EffectRequest {
  /** The `XI_*` id of mdlDyna.inc (`Xi`). 0 and below are no effect (`case 0: break;`, `CreateObj.cpp:310`). */
  xi: number;
  /** `vPosSrc` (D3D): where it is made. */
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
   * `SetAngle`, the effect's heading in degrees, as it is given: `CreateSfx` has the caller's angle turned for the effect
   * (`-caster angle` for a Vagrant skill, `CreateObj.cpp:94-111`). 0 when absent; not used by `CSfxGenNormalDmg01`.
   */
  angle?: number;
  /** `SetScale( s, s, s )` after `CreateSfx`: replaces the scale of the index entry (`CObj::SetScale`, `Obj.cpp:709-714`). */
  scale?: number;
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
  /** `GetAngle()`, degrees. */
  angle: number;
  /** `GetScale()`. */
  scale: Vec3;
  /** What `Render` adds to y: 0.2, or 0 for the two classes that do not. */
  lift: number;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class EffectManager {
  private effects: Playing[] = [];
  /** The effect files that are in, by logical key. */
  private readonly loaded = new Map<string, WebEffect>();
  /** Each file's load, started once; null when it could not be had. */
  private readonly loading = new Map<string, Promise<WebEffect | null>>();
  private readonly reported = new Set<string>();

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
  play(request: EffectRequest): void {
    if (request.xi <= 0) return;
    const ref = this.data.effects.get(request.xi);
    if (ref === undefined) {
      this.reportOnce(`xi ${request.xi}`, `effect XI ${request.xi}: not in the effects index`);
      return;
    }
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
      if (effect.model.step()) return false;
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
    this.renderer.end();
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
      const plain = request.fixed !== true && !NORMAL_DMG.has(request.xi) && !FIXED.has(request.xi);
      const scale = request.scale ?? indexScale;
      this.effects.push({
        model: new EffectModel(effect, this.random),
        pos: [f32(request.pos[0]), f32(f32(request.pos[1]) + MADE_LIFT), f32(request.pos[2])],
        followId: plain && request.followId !== undefined ? request.followId : null,
        keepWhenGone: request.followDest === true,
        angle: NORMAL_DMG.has(request.xi) ? 0 : (request.angle ?? 0),
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

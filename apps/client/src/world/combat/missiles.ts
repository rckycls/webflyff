// The missiles in flight (Piece 7 M2, [R §5]): the wand's and the bow's, every player's and the monsters', moved by the
// rules each 60 Hz tick, and the hit reports of the ones the own client owns. Drawing is the effect manager's
// (`EffectManager.drawMissiles`), from `views()`; a missile whose effect file is missing still flies and hits (spec §4).
//
//   CSfx::SetSfx                    _Common/SfxObj.cpp:76-98          made 0.01 m up
//   CSfxItemWandAtk1::Process       _Common/Sfx.cpp:848-938           the wand's: homes at 0.2 m, arrives in a third of
//                                                                     the target's box, reports the next tick
//   CSfxItemRangeAtk1::Process      Sfx.cpp:965-1065                  the bow's: 0.7 m to the target + 1 m, < 0.4 m
//   QuaternionRotationToYPW         _Common/xUtil3D.cpp               the facing in flight, +Z turned to the target
//   CSfx::DamageToTarget            SfxObj.cpp:107-133                the report (SFX_HIT) and the target's shake
//   CSfx::~CSfx                     SfxObj.cpp:44-55                  SFX_CLEAR for a missile that never hit
//   CSfxItemYoyoAtk::MakePath       Sfx.cpp:1118-1234                 the thrown yoyo's path out and back
//   CSfxItemYoyoAtk::Process        Sfx.cpp:1236-1348                 to the path at 0.3 m, along it, home at 0.4 m
//   CSfxShoot::Process              Sfx.cpp:3470-3537                 a skill's shot: target + 1 m, 0.2 m, < 0.2
//   CSfxItemRangeAtk_JunkBow        Sfx.cpp:1376-1510                 the arrow, drawn three times
//   CSfxSkillMagSwordWind           Sfx.cpp:2539-2607                 feet to feet, 0.2 m, < 0.4, the next tick
//   CSfxSkillMagStrongWind          Sfx.cpp:2449-2537                 feet to feet, 0.2 m, < 0.2, the next tick, a push
//   CSfxSkillMagFireBoomerang &c.   Sfx.cpp:2617-2690, :3131-3370     to the target + 0.3 m, 0.2 m, < 0.2, scale 2
//   CSfxShootWave                   Sfx.cpp:3582-3700                 the target's feet at its height, 0.25 m, < 0.4
//   CSfxSkillMagHotAir              Sfx.cpp:2714-2800                 no flight: one report at once, then its time
//
// Who reports is the launcher's to say (`report`): the own player's missiles, and a monster's missile at the own
// player, which carries the server's id (`MoverActEvent.cpp:754-763`); another player's carries none.

import type { Vec3 } from '@flyffweb/protocol';
import { normalize, sub } from '../sim/d3dx';
import type { OwnShots } from './ownShots';

const f32 = Math.fround;

/** `vPosSrc.y += 0.01f` (`CSfx::SetSfx`, `SfxObj.cpp:85`). */
const MADE_LIFT = f32(0.01);
/** `vPos += (vDelta * 0.2f)` (`Sfx.cpp:893`) and `vDelta * 0.7f` (:987). */
const WAND_STEP = f32(0.2);
const ARROW_STEP = f32(0.7);
/** `m_fRadiusXZ = 0.2f` (`Sfx.cpp:841`): the wand's radius before its first frame measures the target. */
const WAND_RADIUS = f32(0.2);
/** `D3DXVec3LengthSq( &vDelta ) < 0.4f * 0.4f` (`Sfx.cpp:1046`). */
const ARROW_RADIUS = f32(0.4);
/** `m_vPosDest = pObjDest->GetPos() + D3DXVECTOR3( 0, 1.0f, 0 )` (`Sfx.cpp:970`) and the wand's hit model 1 m up (:921). */
const ONE_UP = 1;
/** `m_nFrame >= SEC1 * 10` (`Sfx.cpp:936`, :1065): ten seconds of 60 ticks. */
const TIMEOUT = 600;
/** `if( m_pSfxObj->m_nCurFrame == 20 ) m_nCurFrame = 0` (`Sfx.cpp:884-888`): the wand's flight model loops its 20 frames. */
const WAND_LOOP = 20;
/** `D3DXToDegree`. */
const DEGREES = f32(180 / Math.PI);
/** The yoyo's steps: `vDelta * 0.3f` to the path (`Sfx.cpp:1262`), `vDelta * 0.4f` home (:1297). */
const YOYO_OUT = f32(0.3);
const YOYO_HOME = f32(0.4);
/** `fLen <= 0.05f` at the path's start (:1267), `fLen <= 0.1f` home (:1302): squared lengths. */
const YOYO_AT_PATH = f32(0.05);
const YOYO_AT_HAND = f32(0.1);
/** `m_nDelayCount = 6` (:1270): the ticks it hangs at the path's start. */
const YOYO_DELAY = 6;
/** `m_nFrame >= SEC1 * 5` (:1345): five seconds. */
const YOYO_TIMEOUT = 300;
/** `MAX_SF_SLERP` (`ModelObject.h:13`): the steps of a key's interpolation. */
const MAX_SF_SLERP = 3;
/** `if( m_nMaxSpline >= 30 )` (:1195). */
const MAX_SPLINE = 30;

/**
 * The missile classes the rules copy. `'yoyo'` is drawn only: no report, no arrival test. Piece 7 M2's skills: `'shoot'`
 * (`CSfxShoot`, every shot skill's default), `'skillArrow'` (a bow skill's `CSfxItemRangeAtk1`, the arrow's rules),
 * `'junkBow'`, `'swordWind'`, `'strongWind'`, `'straight'` (Boomerang, Ice Missile, Lightning Ball, Spike Stone),
 * `'wave'` (Guillotine) and `'hotAir'`.
 */
export type MissileClass =
  | 'wand' | 'arrow' | 'yoyo' | 'shoot' | 'skillArrow' | 'junkBow' | 'swordWind' | 'strongWind' | 'straight' | 'wave'
  | 'hotAir';

/**
 * The homing skill classes' rules: where they aim (above the target's feet, or at its feet with the wave's own height),
 * their step, their arrival (a squared length under `arrive`), whether the report is the arrival tick's or the next's,
 * the hit model's scale, and the facing: all three angles, or the winds' yaw alone (`atan2( dx, -dz )`).
 */
interface Homing {
  aim: number | 'wave';
  speed: number;
  arrive: number;
  next: boolean;
  hitScale: number;
  yawOnly: boolean;
}
const HOMING: Partial<Record<MissileClass, Homing>> = {
  shoot: { aim: 1, speed: f32(0.2), arrive: f32(0.2 * 0.2), next: false, hitScale: 1, yawOnly: false },
  swordWind: { aim: 0, speed: f32(0.2), arrive: f32(0.4 * 0.4), next: true, hitScale: 1, yawOnly: true },
  strongWind: { aim: 0, speed: f32(0.2), arrive: f32(0.2 * 0.2), next: true, hitScale: 1, yawOnly: true },
  straight: { aim: f32(0.3), speed: f32(0.2), arrive: f32(0.2 * 0.2), next: true, hitScale: 2, yawOnly: false },
  wave: { aim: 'wave', speed: f32(0.25), arrive: f32(0.4 * 0.4), next: false, hitScale: 2, yawOnly: false },
};
/** Junk Bow's three arrows: one where it flies, one 0.5 m over, one 0.5 m under (`Sfx.cpp:1466-1476`). */
const JUNK_BOW_ROWS = [0, f32(0.5), f32(-0.5)];
/** `dwClass` `RANK_MIDBOSS` 5 and `RANK_SUPER` 7: Strong Wind pushes neither (`Sfx.cpp:2512-2516`). */
const RANK_MIDBOSS = 5;
const RANK_SUPER = 7;

/** What `CreateSfx` and its caller give a missile. */
export interface MissileLaunch {
  cls: MissileClass;
  /** `m_idSrc` and `m_idDest`. */
  sourceId: number;
  targetId: number;
  /** `vPosSrc`, before `SetSfx`'s lift. */
  from: Vec3;
  /** The flight's effect and the hit's (`XI_*`; -1 for none). */
  flightXi: number;
  hitXi: number;
  /** `SetScale` of the flight model: the wand's charge (1.2, 1.7, 2.5). */
  scale: number;
  /** `m_idSfxHit`, `m_nMagicPower` and `m_dwSkill` of a missile this client reports; null for one it does not. */
  report: { sfxHitId: number; power: number; skill: number } | null;
  /**
   * A yoyo's: the hand it goes back to (`m_nType`, `PARTS_RWEAPON` or `PARTS_LWEAPON`), its thrower's position
   * (`GetMatrixTrans()`), and `vPosDest`, the target + 1 m when it was thrown.
   */
  yoyo?: { hand: 'right' | 'left'; sourceAt: Vec3; dest: Vec3 };
  /** Strong Wind's push, `dwDmgShift * 0.2` (`Sfx.cpp:2508-2510`). */
  push?: number;
  /** Hot Air's times in ticks (`dwPainTime`, `dwSkillTime`) and its hits (`dwSkillTime / dwPainTime + 1`). */
  hotAir?: { painTicks: number; lastTicks: number; maxDmgCnt: number };
}

/** A missile as it is drawn: its flight model, where, turned how (degrees: pitch, yaw, roll), how big. */
export interface MissileView {
  id: number;
  xi: number;
  pos: Vec3;
  rotation: Vec3;
  scale: number;
  /** The frame the flight model goes back to 0 at (the wand's 20), or null: back to 0 at the model's end (the arrow). */
  loopFrame: number | null;
}

/** A hit to show: its effect (`XI_*`) at `pos`, turned to `angle` (degrees), between `sourceId` and `targetId`. */
export interface MissileHit {
  xi: number;
  pos: Vec3;
  angle: number;
  sourceId: number;
  targetId: number;
  /** A hit model's scale of its own (the straight four's 2); 1 when not given. */
  scale?: number;
}

/**
 * What the missiles read of the world: the movers in view, a mover's model box (`m_vMin`, `m_vMax`) and x scale, and
 * where a mover's hand is now (`CModelObject::GetHandPos`, `ModelObject.cpp:2388+`), which a yoyo goes back to; with no
 * hand to tell, its position + 1 m (`vPosSrc`, `ActionMoverState.cpp:1058`).
 */
export interface MissileWorld {
  movers: ReadonlyMap<number, { act: { body: { pos: Vec3 }; isDie(): boolean } }>;
  boxOf(moverId: number): { min: Vec3; max: Vec3; scale: number } | undefined;
  handOf?(moverId: number, hand: 'right' | 'left'): Vec3 | null;
  /** A monster's `dwClass` (`RANK_*`), which Strong Wind reads; 0 for a player or one the catalog lacks. */
  rankOf?(moverId: number): number;
}

interface Missile extends MissileLaunch {
  id: number;
  pos: Vec3;
  dest: Vec3;
  radius: number;
  rotation: Vec3;
  /** `m_nFrame`. */
  frame: number;
  /** `m_bHit`: the wand's arrived, its report the next tick. */
  hit: boolean;
  /** A yoyo's `m_aSpline`, `m_nStep`, `m_nCount` and `m_nDelayCount`. */
  path?: Vec3[];
  stage?: 0 | 1 | 2;
  count?: number;
  delay?: number;
}

/**
 * `QuaternionRotationToYPW( qRot, vYPW )` (`_Common/xUtil3D.cpp`) of `D3DXQuaternionRotationAxis( vAxis, acosf( fTheta ) )`
 * that turns +Z (`vDir`) to `dir` (normalized): `vAxis = vDir x dir`, normalized by D3DX, `fTheta = vDir . dir`. The cosine
 * is kept in [-1, 1], where a float a hair over 1 would make `acosf` NaN. In degrees: pitch, yaw, roll.
 */
export function facingOf(dir: Vec3): Vec3 {
  const axis = normalize([f32(-dir[1]), dir[0], 0]);
  const half = f32(Math.acos(Math.max(-1, Math.min(1, dir[2]))) / 2);
  const s = f32(Math.sin(half));
  const x = f32(axis[0] * s);
  const y = f32(axis[1] * s);
  const z = f32(axis[2] * s);
  const w = f32(Math.cos(half));
  const sqw = f32(w * w);
  const sqx = f32(x * x);
  const sqy = f32(y * y);
  const sqz = f32(z * z);
  const pitch = f32(Math.asin(Math.max(-1, Math.min(1, f32(2 * f32(f32(w * x) - f32(y * z)))))));
  const yaw = f32(Math.atan2(f32(2 * f32(f32(x * z) + f32(w * y))), f32(f32(f32(-sqx - sqy) + sqz) + sqw)));
  const roll = f32(Math.atan2(f32(2 * f32(f32(x * y) + f32(w * z))), f32(f32(f32(-sqx + sqy) - sqz) + sqw)));
  return [f32(pitch * DEGREES), f32(yaw * DEGREES), f32(roll * DEGREES)];
}

const lengthSq = (v: Vec3): number => f32(f32(f32(v[0] * v[0]) + f32(v[1] * v[1])) + f32(v[2] * v[2]));

/**
 * `CSfxItemYoyoAtk::SplineSlerp` (`Sfx.cpp:1075-1097`): the Hermite curve from `v2` to `v3` at `t`, its tangents
 * half the chords around each end (`alpha` 0).
 */
function splineSlerp(v1: Vec3, v2: Vec3, v3: Vec3, v4: Vec3, t: number): Vec3 {
  const t2 = f32(t * t);
  const t3 = f32(t2 * t);
  const h1 = f32(f32(f32(2 * t3) - f32(3 * t2)) + 1);
  const h2 = f32(f32(t3 - f32(2 * t2)) + t);
  const h3 = f32(t3 - t2);
  const h4 = f32(f32(-2 * t3) + f32(3 * t2));
  const out: Vec3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const m0 = f32(0.5 * f32(f32(v2[i]! - v1[i]!) + f32(v3[i]! - v2[i]!)));
    const m1 = f32(0.5 * f32(f32(v3[i]! - v2[i]!) + f32(v4[i]! - v3[i]!)));
    out[i] = f32(f32(f32(f32(h1 * v2[i]!) + f32(h2 * m0)) + f32(h3 * m1)) + f32(h4 * v3[i]!));
  }
  return out;
}

/**
 * `CSfxItemYoyoAtk::MakePath` (`Sfx.cpp:1118-1234`) of a yoyo thrown from `pos` (made, so lifted) at `dest` by a
 * mover at `sourceAt`: a length of `|dest - pos|²`, 49 past 7 m and 12 under 3, over 5; seven keys ahead along -Z at
 * that length and 0.5, 1 and 1.2 m more, out a little low and back a little high; each span cut in `MAX_SF_SLERP` + 1
 * points (24 in all); then each turned from -Z to the target (`D3DXQuaternionRotationAxis` of `vDir x vDestNor` and
 * `acosf( vDir . vDestNor )`) and set at the thrower's x and z and the yoyo's height (`mWorld._42 = vPosPos.y`).
 */
export function yoyoPath(pos: Vec3, sourceAt: Vec3, dest: Vec3): Vec3[] {
  let length = lengthSq(sub(dest, pos));
  if (length > 49) length = 49;
  if (length < 9) length = 12;
  length = f32(length / 5);
  const ahead = (more: number, up: number): Vec3 => [0, f32(up), f32(-f32(length + more))];
  const keys: Vec3[] = [
    ahead(0, -0.2), ahead(0.5, -0.2), ahead(1, -0.1), ahead(1.2, 0), ahead(1, 0.1), ahead(0.5, 0.2), ahead(0, 0.2),
  ];
  const spline: Vec3[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = Math.max(i - 1, 0);
    const d = Math.min(i + 2, keys.length - 1);
    for (let j = 0; j < MAX_SF_SLERP + 1 && spline.length < MAX_SPLINE; j++) {
      spline.push(splineSlerp(keys[a]!, keys[i]!, keys[i + 1]!, keys[d]!, f32(j / MAX_SF_SLERP)));
    }
  }
  // the turn of -Z to the target: an axis D3DX normalizes, and the cosine kept in [-1, 1]
  const to = normalize(sub(dest, pos));
  const axis = normalize([to[1], f32(-to[0]), 0]);
  const half = f32(Math.acos(Math.max(-1, Math.min(1, f32(-to[2])))) / 2);
  const s = f32(Math.sin(half));
  const x = f32(axis[0] * s);
  const y = f32(axis[1] * s);
  const z = f32(axis[2] * s);
  const w = f32(Math.cos(half));
  // D3DXMatrixRotationQuaternion, its rows
  const m: ReadonlyArray<Vec3> = [
    [f32(1 - f32(2 * f32(f32(y * y) + f32(z * z)))), f32(2 * f32(f32(x * y) + f32(z * w))), f32(2 * f32(f32(x * z) - f32(y * w)))],
    [f32(2 * f32(f32(x * y) - f32(z * w))), f32(1 - f32(2 * f32(f32(x * x) + f32(z * z)))), f32(2 * f32(f32(y * z) + f32(x * w)))],
    [f32(2 * f32(f32(x * z) + f32(y * w))), f32(2 * f32(f32(y * z) - f32(x * w))), f32(1 - f32(2 * f32(f32(x * x) + f32(y * y))))],
  ];
  const at: Vec3 = [sourceAt[0], pos[1], sourceAt[2]];
  return spline.map((p) => {
    const out: Vec3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      out[c] = f32(f32(f32(f32(p[0] * m[0]![c]!) + f32(p[1] * m[1]![c]!)) + f32(p[2] * m[2]![c]!)) + at[c]!);
    }
    return out;
  });
}

export class Missiles {
  private flying: Missile[] = [];
  private nextId = 1;

  /**
   * `shots` sends the reports. `struck` is told of each `DamageToTarget` that reached its target: the target's
   * `dwSndDmg2` plays for every missile (:119), and it shakes (`SetDmgCnt( 10 )`, :126) where the hit was reported.
   */
  constructor(
    private readonly shots: Pick<OwnShots, 'hit' | 'clear'>,
    private readonly struck: (targetId: number, shake: boolean) => void = () => {},
    /** Strong Wind's push of its target, `AngleToVectorXZ( angle, power )`, which the world adds to its `m_vDeltaE`. */
    private readonly push: (moverId: number, delta: Vec3) => void = () => {},
  ) {}

  /** `CreateSfx`: the missile at `from` + 0.01, heading for its target. Its id. */
  launch(launch: MissileLaunch): number {
    const pos: Vec3 = [f32(launch.from[0]), f32(launch.from[1] + MADE_LIFT), f32(launch.from[2])];
    const missile: Missile = {
      ...launch, id: this.nextId++, pos, dest: [...pos], radius: WAND_RADIUS, rotation: [0, 0, 0], frame: 0, hit: false,
    };
    if (launch.yoyo !== undefined) {
      missile.dest = launch.yoyo.dest;
      missile.path = yoyoPath(pos, launch.yoyo.sourceAt, launch.yoyo.dest);
      missile.stage = 0;
      missile.count = 0;
      missile.delay = 0;
    }
    this.flying.push(missile);
    return missile.id;
  }

  /** One tick of every missile (`Process`): moves, arrives, reports. The hit effects to play this tick. */
  step(world: MissileWorld): MissileHit[] {
    const hits: MissileHit[] = [];
    for (const missile of [...this.flying]) {
      if (missile.cls === 'yoyo') {
        this.stepYoyo(missile, world);
        continue;
      }
      if (missile.cls === 'hotAir') {
        this.stepHotAir(missile, world, hits);
        continue;
      }
      const homing = HOMING[missile.cls];
      if (homing !== undefined) {
        this.stepHoming(missile, homing, world, hits);
        if (this.flying.includes(missile)) missile.frame++;
        continue;
      }
      if (missile.cls === 'wand') this.stepWand(missile, world, hits);
      else this.stepArrow(missile, world, hits);
      if (!this.flying.includes(missile)) continue;
      missile.frame++;
      if (missile.frame >= TIMEOUT) this.remove(missile);
    }
    return hits;
  }

  /** What to draw: the missiles still in flight (the wand's after its arrival is its hit model, played as an effect). */
  views(): readonly MissileView[] {
    const views: MissileView[] = [];
    for (const missile of this.flying) {
      if (missile.hit) continue;
      const view: MissileView = {
        id: missile.id, xi: missile.flightXi, pos: missile.pos, rotation: missile.rotation, scale: missile.scale,
        loopFrame: missile.cls === 'wand' ? WAND_LOOP : null, // the yoyo's goes back at its end (:1320-1323)
      };
      if (missile.cls !== 'junkBow') {
        views.push(view);
        continue;
      }
      // three arrows, each a model of its own (the ids are the effect manager's keys: negative ones are the extra two)
      JUNK_BOW_ROWS.forEach((dy, k) => views.push({
        ...view, id: k === 0 ? missile.id : -(missile.id * 2 + k), pos: [missile.pos[0], f32(missile.pos[1] + dy), missile.pos[2]],
      }));
    }
    return views;
  }

  /** Every missile goes, and nothing is reported: the world they flew in is gone. */
  dispose(): void {
    this.flying = [];
  }

  /**
   * `CSfxItemWandAtk1::Process` (`Sfx.cpp:848-938`): a target gone or dead deletes it; its aim is the target's middle
   * (`|m_vMax.y| / 2` times its x scale) and, at the first frame, its radius a third of the box's half sum; in flight it
   * steps 0.2 m and turns; arrived (inside the radius) its hit model plays 1 m up; the next tick it reports.
   */
  private stepWand(missile: Missile, world: MissileWorld, hits: MissileHit[]): void {
    const target = world.movers.get(missile.targetId);
    if (target === undefined || target.act.isDie()) {
      this.remove(missile);
      return;
    }
    const box = world.boxOf(missile.targetId);
    const center = box === undefined ? 0 : f32(f32(Math.abs(box.max[1]) / 2) * box.scale);
    const at = target.act.body.pos;
    missile.dest = [at[0], f32(at[1] + center), at[2]];
    if (missile.frame === 0 && box !== undefined) {
      const lenX = f32(Math.abs(f32(box.max[0] - box.min[0])));
      const lenZ = f32(Math.abs(f32(box.max[2] - box.min[2])));
      missile.radius = f32(f32(f32(f32(lenX + lenZ) / 2) * box.scale) / 3);
    }
    if (missile.hit) {
      this.damage(missile, world);
      this.remove(missile);
      return;
    }
    this.move(missile, WAND_STEP);
    if (lengthSq(sub(missile.pos, missile.dest)) < f32(missile.radius * missile.radius)) {
      missile.hit = true;
      hits.push({
        xi: missile.hitXi, pos: [missile.pos[0], f32(missile.pos[1] + ONE_UP), missile.pos[2]], angle: missile.rotation[1],
        sourceId: missile.sourceId, targetId: missile.targetId,
      });
    }
  }

  /**
   * `CSfxItemRangeAtk1::Process` (`Sfx.cpp:965-1065`): a target gone deletes it (a dead one is still flown at); its aim
   * is the target + 1 m; it steps 0.7 m and turns; within 0.4 m it reports and makes its hit effect, turned to its yaw
   * (`SetAngle( m_pSfxObj->m_vRotate.y )`), and goes. The trail (`etc_Tail2.bmp`) is not drawn (plan, Decisions 6).
   */
  private stepArrow(missile: Missile, world: MissileWorld, hits: MissileHit[]): void {
    const target = world.movers.get(missile.targetId);
    if (target === undefined) {
      this.remove(missile);
      return;
    }
    const at = target.act.body.pos;
    missile.dest = [at[0], f32(at[1] + ONE_UP), at[2]];
    this.move(missile, ARROW_STEP);
    if (lengthSq(sub(missile.pos, missile.dest)) < f32(ARROW_RADIUS * ARROW_RADIUS)) {
      this.damage(missile, world);
      hits.push({
        xi: missile.hitXi, pos: missile.pos, angle: missile.rotation[1], sourceId: missile.sourceId, targetId: missile.targetId,
      });
      this.remove(missile);
    }
  }

  /**
   * `CSfxItemYoyoAtk::Process` (`Sfx.cpp:1236-1348`): its thrower gone deletes it; hanging at the path's start it
   * counts down (no frame counted); else it steps 0.3 m to the path's start, and there hangs 6 ticks; then takes a point
   * of the path each tick; then steps 0.4 m to the thrower's hand, where it goes (its `m_dwSfxHit` is `NULL_ID`: no hit
   * effect). It never deals damage (the hit frame does) and goes after 5 s. The held yoyo it hides (`XE_HIDE`) and its
   * trail are not drawn (plan, Decisions 6).
   */
  private stepYoyo(missile: Missile, world: MissileWorld): void {
    const source = world.movers.get(missile.sourceId);
    if (source === undefined) {
      this.remove(missile);
      return;
    }
    if (missile.delay! > 0) {
      missile.delay!--;
      return;
    }
    const path = missile.path!;
    if (missile.stage === 0) {
      this.toward(missile, path[0]!, YOYO_OUT);
      if (lengthSq(sub(path[0]!, missile.pos)) <= YOYO_AT_PATH) {
        missile.stage = 1;
        missile.delay = YOYO_DELAY;
      }
    } else if (missile.stage === 1) {
      missile.pos = [...path[missile.count!]!];
      missile.count!++;
      if (missile.count! >= path.length) missile.stage = 2;
    } else {
      const at = source.act.body.pos;
      const hand = world.handOf?.(missile.sourceId, missile.yoyo!.hand) ?? [at[0], f32(at[1] + ONE_UP), at[2]];
      this.toward(missile, hand, YOYO_HOME);
      if (lengthSq(sub(hand, missile.pos)) <= YOYO_AT_HAND) {
        this.remove(missile);
        return;
      }
    }
    missile.frame++;
    if (missile.frame >= YOYO_TIMEOUT) this.remove(missile);
  }

  /**
   * Piece 7 M2: a homing skill class (`HOMING`): its aim is the target's (above its feet, or the wave's at the target's
   * height), kept at the last one when the target is gone; it steps and turns; arrived, its hit model plays where it
   * hit (the straight four's at the aim, scale 2) and it reports then or the next tick. Strong Wind's report carries
   * its angle and push, none against a mid-boss or a super monster, and pushes the target as it reports.
   */
  private stepHoming(missile: Missile, homing: Homing, world: MissileWorld, hits: MissileHit[]): void {
    const target = world.movers.get(missile.targetId);
    if (target !== undefined) {
      const at = target.act.body.pos;
      missile.dest = homing.aim === 'wave' ? [at[0], at[1], at[2]] : [at[0], f32(at[1] + homing.aim), at[2]];
    }
    if (missile.hit) {
      this.reportSkill(missile, world);
      this.remove(missile);
      return;
    }
    this.toward(missile, missile.dest, homing.speed);
    const left = sub(missile.dest, missile.pos);
    missile.rotation = homing.yawOnly
      ? [0, f32(f32(Math.atan2(left[0], -left[2])) * DEGREES), 0]
      : facingOf(normalize(left));
    if (lengthSq(left) >= homing.arrive) return;
    const pos: Vec3 = homing.hitScale === 2 || homing.yawOnly ? [...missile.dest] : missile.pos;
    hits.push({
      xi: missile.hitXi, pos, angle: missile.rotation[1], sourceId: missile.sourceId, targetId: missile.targetId,
      ...(homing.hitScale !== 1 ? { scale: homing.hitScale } : {}),
    });
    if (homing.next) {
      missile.hit = true;
      return;
    }
    this.reportSkill(missile, world);
    this.remove(missile);
  }

  /** `DamageToTarget` of a skill's missile, Strong Wind's with its angle and push (`Sfx.cpp:2504-2525`). */
  private reportSkill(missile: Missile, world: MissileWorld): void {
    if (missile.cls !== 'strongWind') {
      this.damage(missile, world);
      return;
    }
    const rank = world.rankOf?.(missile.targetId) ?? 0;
    const blocked = rank === RANK_SUPER || rank === RANK_MIDBOSS;
    const angle = blocked ? 0 : Math.trunc(missile.rotation[1]);
    const power = blocked ? 0 : missile.push ?? 0;
    this.damage(missile, world, 0, angle, power);
    if (power === 0 || !world.movers.has(missile.targetId)) return;
    const rad = f32((angle * Math.PI) / 180);
    this.push(missile.targetId, [f32(f32(Math.sin(rad)) * power), 0, f32(f32(-f32(Math.cos(rad))) * power)]);
  }

  /**
   * Piece 7 M2: `CSfxSkillMagHotAir::Process` (`Sfx.cpp:2714-2800`): no flight; its fire at the caster's feet and its
   * hit model at the target's from the first tick; at that tick its one report (`DamageToTarget( 1, 0, 0, nMaxDmgCnt )`;
   * the later hits are the server's), its id kept until every pain tick has gone by; gone after `dwSkillTime`, or with
   * its caster or its target.
   */
  private stepHotAir(missile: Missile, world: MissileWorld, hits: MissileHit[]): void {
    const times = missile.hotAir!;
    const target = world.movers.get(missile.targetId);
    if (target === undefined || !world.movers.has(missile.sourceId)) {
      this.remove(missile);
      return;
    }
    if (missile.frame === 0) {
      hits.push({ xi: missile.hitXi, pos: [...target.act.body.pos], angle: 0, sourceId: missile.sourceId, targetId: missile.targetId });
    }
    if (missile.frame % Math.max(1, times.painTicks) === 0) {
      missile.count = (missile.count ?? 0) + 1;
      if (missile.count === 1) this.damage(missile, world, 1, 0, 0, times.maxDmgCnt);
      if (missile.count >= times.maxDmgCnt) missile.report = null;
    }
    if (missile.frame >= times.lastTicks) {
      this.remove(missile);
      return;
    }
    missile.frame++;
  }

  /** `vPos += normalize( to - vPos ) * speed`, the facing left as it is. */
  private toward(missile: Missile, to: Vec3, speed: number): void {
    const dir = normalize(sub(to, missile.pos));
    missile.pos = [
      f32(missile.pos[0] + f32(dir[0] * speed)), f32(missile.pos[1] + f32(dir[1] * speed)), f32(missile.pos[2] + f32(dir[2] * speed)),
    ];
  }

  /** A step of `speed` along `normalize( dest - pos )`, then the facing toward the destination from where it got to. */
  private move(missile: Missile, speed: number): void {
    const dir = normalize(sub(missile.dest, missile.pos));
    missile.pos = [
      f32(missile.pos[0] + f32(dir[0] * speed)), f32(missile.pos[1] + f32(dir[1] * speed)), f32(missile.pos[2] + f32(dir[2] * speed)),
    ];
    missile.rotation = facingOf(normalize(sub(missile.dest, missile.pos)));
  }

  /**
   * `CSfx::DamageToTarget()` (`SfxObj.cpp:107-133`): nothing with its source or target out of view; else the target is
   * struck, and a missile this client reports sends SFX_HIT with its source as the attacker, after which it has no id.
   */
  private damage(missile: Missile, world: MissileWorld, dmgCnt = 0, dmgAngle = 0, dmgPower = 0, maxDmgCnt = 1): void {
    if (!world.movers.has(missile.sourceId) || !world.movers.has(missile.targetId)) return;
    const report = missile.report;
    this.struck(missile.targetId, report !== null);
    if (report === null) return;
    this.shots.hit(report.sfxHitId, report.power, report.skill, missile.sourceId, dmgCnt, dmgAngle, dmgPower);
    if (maxDmgCnt === 1) missile.report = null; // a one-hit missile's id is spent (SfxObj.cpp:127-128)
  }

  /** `Delete()` and `~CSfx`: a missile that still has its id clears it with its source. */
  private remove(missile: Missile): void {
    this.flying = this.flying.filter((m) => m !== missile);
    if (missile.report !== null) this.shots.clear(missile.report.sfxHitId, missile.sourceId);
    missile.report = null;
  }
}

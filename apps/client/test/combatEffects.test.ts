// What the screen plays for the world's combat and own events (combatEffects): the effects by XI id, where and how big,
// the damage numbers, the models' flashes and shakes, as CDPClient::OnDamage, OnMoverDeath, OnSetLevel, OnAddObj,
// OnSetExperience, CMover::SetExperience, CMover::OnDamage, OnAttackMelee and CActionMover::OnDamageMsgC make them.
// What is played goes to a recorder.

import type { Vec3 } from '@flyffweb/formats';
import { AttackFlag, NULL_ID } from '@flyffweb/protocol';
import { describe, expect, it } from 'vitest';
import { WARM_UP_EFFECTS, isGameMaster, playCombatEvent, playOwnEvent } from '../src/world/fx/combatEffects';
import type { CombatFxOut, CombatFxWorld, FxMover } from '../src/world/fx/combatEffects';
import { Xi } from '../src/world/fx/EffectManager';
import type { EffectRequest } from '../src/world/fx/EffectManager';
import { Ik3 } from '../src/world/sim/constants';
import { normalize, sub } from '../src/world/sim/d3dx';

const f32 = Math.fround;

const OWN_ID = 1;
const MONSTER_ID = 30;
const OTHER_ID = 50;
/** Items: a sword (`XI_HIT_SWORD01`), a yoyo (`XI_HIT_YOY01`), the bare hand (no effect, `=` in propItem.txt). */
const SWORD = 21;
const YOYO = 22;
const HAND = 11;

const OWN_AT: Vec3 = [f32(6968.25), f32(100.3), f32(3328.7)];
const MONSTER_AT: Vec3 = [f32(6970.3), f32(100.7), f32(3330.1)];
const OTHER_AT: Vec3 = [f32(6960.1), f32(99.9), f32(3320.4)];

const mover = (objectId: number, pos: Vec3, angle: number): FxMover => ({ objectId, act: { body: { pos, angle } } });

/** The own player, a monster facing it and another player; `gone` leaves movers out of view. */
function worldOf(options: { self?: boolean; gone?: number[]; gameMaster?: boolean; focusId?: number } = {}): CombatFxWorld {
  const movers = new Map<number, FxMover>([
    [OWN_ID, mover(OWN_ID, OWN_AT, 37.5)],
    [MONSTER_ID, mover(MONSTER_ID, MONSTER_AT, 217.5)],
    [OTHER_ID, mover(OTHER_ID, OTHER_AT, 300.25)],
  ]);
  for (const id of options.gone ?? []) movers.delete(id);
  return {
    movers,
    selfId: options.self === false ? undefined : OWN_ID,
    gameMaster: options.gameMaster ?? false,
    focusId: options.focusId ?? null,
    itemProps: new Map([
      [SWORD, { sfxHit: Xi.HIT_SWORD01, kind3: Ik3.SWD }],
      [YOYO, { sfxHit: Xi.HIT_YOY01, kind3: Ik3.YOYO }],
      [HAND, { sfxHit: -1, kind3: Ik3.HAND }],
    ]),
  };
}

type Played =
  | { effect: EffectRequest }
  | { number: [Vec3, number, boolean] }
  | { flash: [number, Vec3] }
  | { shake: number };

function recorder(): { played: Played[]; out: CombatFxOut } {
  const played: Played[] = [];
  return {
    played,
    out: {
      effect: (request) => void played.push({ effect: request }),
      number: (pos, value, ownHurt) => void played.push({ number: [pos, value, ownHurt] }),
      flash: (moverId, direction) => void played.push({ flash: [moverId, direction] }),
      shake: (moverId) => void played.push({ shake: moverId }),
    },
  };
}

/** `pMover->GetPos()` with `vPos.y += 1.5f`: where the banners are made (`DPClient.cpp:1845-1888`). */
const over = (p: Vec3): Vec3 => [p[0], f32(p[1] + 1.5), p[2]];

/** What was played as a short word: an effect's XI id (and scale), a number, or anything else as JSON. */
function wordOf(p: Played, scale: boolean): string {
  if ('effect' in p) return scale ? `xi ${p.effect.xi} x${p.effect.scale}` : `xi ${p.effect.xi}`;
  return 'number' in p ? `number ${p.number[1]}` : JSON.stringify(p);
}

/** The XI ids and the numbers a DAMAGE plays, in order, as short words. */
function hitPlays(flags: number, hit = 25, world = worldOf()): string[] {
  const r = recorder();
  playCombatEvent({ kind: 'hit', victimId: MONSTER_ID, attackerId: OWN_ID, hit, flags, attackerInView: true }, world, r.out);
  return r.played.map((p) => wordOf(p, true));
}

describe('playCombatEvent: a DAMAGE (CDPClient::OnDamage, DPClient.cpp:1792-1897)', () => {
  it("shows the own player's hit on a monster as a number at the monster's feet, in the second colour set", () => {
    const r = recorder();
    playCombatEvent({ kind: 'hit', victimId: MONSTER_ID, attackerId: OWN_ID, hit: 25, flags: AttackFlag.GENERIC, attackerInView: true }, worldOf(), r.out);
    expect(r.played).toEqual([{ number: [MONSTER_AT, 25, false] }]);
  });

  it('shows a hit on the own player in the first colour set (`IsActiveMover() ? 0 : 1`)', () => {
    const r = recorder();
    playCombatEvent({ kind: 'hit', victimId: OWN_ID, attackerId: MONSTER_ID, hit: 7, flags: 0, attackerInView: true }, worldOf(), r.out);
    expect(r.played).toEqual([{ number: [OWN_AT, 7, true] }]);
  });

  it('plays the critical banner 1.5 m over the feet at scale 3, then the number', () => {
    const r = recorder();
    playCombatEvent({ kind: 'hit', victimId: MONSTER_ID, attackerId: OWN_ID, hit: 60, flags: AttackFlag.CRITICAL1, attackerInView: true }, worldOf(), r.out);
    expect(r.played).toEqual([
      { effect: { xi: Xi.HIT_CRITICAL01, pos: over(MONSTER_AT), scale: 3 } },
      { number: [MONSTER_AT, 60, false] },
    ]);
  });

  it('takes the flags in the order of [combat §4.1]: blocking, then parry, else resist, else miss, else critical and the number', () => {
    const { BLOCKING, PARRY, RESIST, MISS, CRITICAL, CRITICAL2 } = AttackFlag;
    const block = `xi ${Xi.HIT_HITBLOCK01} x2`;
    const parry = `xi ${Xi.HIT_PARRY01} x2`;
    const miss = `xi ${Xi.HIT_MISS01} x2`;
    const crit = `xi ${Xi.HIT_CRITICAL01} x3`;
    // blocking plays its banner and goes on to the rest
    expect(hitPlays(BLOCKING)).toEqual([block, 'number 25']);
    expect(hitPlays(BLOCKING | CRITICAL2)).toEqual([block, crit, 'number 25']);
    expect(hitPlays(BLOCKING | PARRY)).toEqual([block, parry]);
    // parry: no number, and nothing after it
    expect(hitPlays(PARRY | RESIST | MISS | CRITICAL)).toEqual([parry]);
    // resist: the miss banner when nothing got through, else the number; nothing after it
    expect(hitPlays(RESIST | MISS, 0)).toEqual([miss]);
    expect(hitPlays(RESIST | CRITICAL, 9)).toEqual(['number 9']);
    // miss: its banner, no number (the MISS! glyph is not used)
    expect(hitPlays(MISS | CRITICAL)).toEqual([miss]);
    // a hit of 0 with no flags is a 0
    expect(hitPlays(0, 0)).toEqual(['number 0']);
  });

  it('makes the banners where they stay: no mover followed, 1.5 m over the feet, in floats', () => {
    const r = recorder();
    playCombatEvent({ kind: 'hit', victimId: MONSTER_ID, attackerId: OWN_ID, hit: 0, flags: AttackFlag.BLOCKING | AttackFlag.PARRY, attackerInView: true }, worldOf(), r.out);
    expect(r.played).toEqual([
      { effect: { xi: Xi.HIT_HITBLOCK01, pos: over(MONSTER_AT), scale: 2 } },
      { effect: { xi: Xi.HIT_PARRY01, pos: over(MONSTER_AT), scale: 2 } },
    ]);
  });

  it('shows nothing of a fight the own player is not in, unless the attacker was not in view (goto g_PASS, :1811-1812)', () => {
    expect(hitPlaysOf({ victimId: MONSTER_ID, attackerId: OTHER_ID })).toEqual([]);
    expect(hitPlaysOf({ victimId: OTHER_ID, attackerId: MONSTER_ID })).toEqual([]);
    // an attacker the browser did not have as the message came (attackerInView): NULL_ID, or one out of view then,
    // whatever is in view when the event is played
    expect(hitPlaysOf({ victimId: OTHER_ID, attackerId: NULL_ID }, worldOf(), false)).toEqual(['number 4']);
    expect(hitPlaysOf({ victimId: MONSTER_ID, attackerId: OTHER_ID }, worldOf(), false)).toEqual(['number 4']);
    // one in view then and gone since is still the attacker the handler found: not the own player's fight
    expect(hitPlaysOf({ victimId: MONSTER_ID, attackerId: OTHER_ID }, worldOf({ gone: [OTHER_ID] }), true)).toEqual([]);
    // and the own player's, gone or not, is
    expect(hitPlaysOf({ victimId: MONSTER_ID, attackerId: OWN_ID }, worldOf({ gone: [OWN_ID] }), true)).toEqual(['number 4']);
  });

  it('shows a game master the hits on its focus, whoever deals them (:1824-1828)', () => {
    const fight = { victimId: MONSTER_ID, attackerId: OTHER_ID };
    expect(hitPlaysOf(fight, worldOf({ gameMaster: true, focusId: MONSTER_ID }))).toEqual(['number 4']);
    expect(hitPlaysOf(fight, worldOf({ gameMaster: true, focusId: OTHER_ID }))).toEqual([]);
    expect(hitPlaysOf(fight, worldOf({ gameMaster: false, focusId: MONSTER_ID }))).toEqual([]);
  });

  it('shows nothing for a victim no longer in view', () => {
    expect(hitPlaysOf({ victimId: MONSTER_ID, attackerId: OWN_ID }, worldOf({ gone: [MONSTER_ID] }))).toEqual([]);
  });
});

function hitPlaysOf(ids: { victimId: number; attackerId: number }, world = worldOf(), attackerInView = true): string[] {
  const r = recorder();
  playCombatEvent({ kind: 'hit', ...ids, hit: 4, flags: 0, attackerInView }, world, r.out);
  return r.played.map((p) => wordOf(p, false));
}

describe('playCombatEvent: a MOVERDEATH (CDPClient::OnMoverDeath, DPClient.cpp:2003-2007)', () => {
  it('shows the HP the mover had as its last number, when the own player killed it or died, and the killer is in view', () => {
    const death = (victimId: number, attackerId: number, attackerInView = true, world = worldOf()): Played[] => {
      const r = recorder();
      playCombatEvent({ kind: 'death', victimId, attackerId, lastHp: 13, attackerInView }, world, r.out);
      return r.played;
    };
    expect(death(MONSTER_ID, OWN_ID)).toEqual([{ number: [MONSTER_AT, 13, false] }]);
    expect(death(OWN_ID, MONSTER_ID)).toEqual([{ number: [OWN_AT, 13, true] }]);
    expect(death(MONSTER_ID, OTHER_ID)).toEqual([]);
    // `if( pAttacker )`: no killer in view as the message came, no number, whatever is in view now
    expect(death(OWN_ID, NULL_ID, false)).toEqual([]);
    expect(death(OWN_ID, MONSTER_ID, false)).toEqual([]);
    // a killer in view then that has gone since still counts
    expect(death(OWN_ID, MONSTER_ID, true, worldOf({ gone: [MONSTER_ID] }))).toEqual([{ number: [OWN_AT, 13, true] }]);
  });
});

describe("playCombatEvent: a swing's hit frame (CActionMover::OnDamageMsgC, ActionMoverDmg.cpp:74-100)", () => {
  /** `AngleToVectorXZ( &v, angle, 1.0f )` (`xUtil3D.h:37-43`) plus the victim's feet, and 1 m up, in floats. */
  const sparkAt = (victim: Vec3, angle: number): Vec3 => {
    const rad = f32(angle * f32(f32(3.141592654) / 180));
    return [f32(f32(Math.sin(rad)) + victim[0]), f32(victim[1] + 1), f32(f32(-f32(Math.cos(rad))) + victim[2])];
  };

  it("plays the weapon's dwSfxObj3 a metre in front of the victim along the attacker's heading, 1 m up, then shakes the victim", () => {
    const r = recorder();
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: SWORD }, worldOf(), r.out);
    expect(r.played).toEqual([{ effect: { xi: Xi.HIT_SWORD01, pos: sparkAt(MONSTER_AT, 37.5) } }, { shake: MONSTER_ID }]);
    // D3D: the heading 90 is +x
    const [x, , z] = sparkAt([0, 0, 0], 90);
    expect(x).toBeCloseTo(1, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('plays a yoyo\'s 1 m over the victim; no effect for the bare hand (`=`) or an item not known, the shake all the same', () => {
    const r = recorder();
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: YOYO }, worldOf(), r.out);
    expect(r.played).toEqual([
      { effect: { xi: Xi.HIT_YOY01, pos: [MONSTER_AT[0], f32(MONSTER_AT[1] + 1), MONSTER_AT[2]] } }, { shake: MONSTER_ID },
    ]);
    const bare = recorder();
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: HAND }, worldOf(), bare.out);
    playCombatEvent({ kind: 'attackerHit', attackerId: MONSTER_ID, victimId: OWN_ID, weapon: null }, worldOf(), bare.out);
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: 999 }, worldOf(), bare.out);
    // `m_nDmgCnt = 10` is outside the AF_GENERIC branch (ActionMoverDmg.cpp:118): every blow that landed shakes
    expect(bare.played).toEqual([{ shake: MONSTER_ID }, { shake: OWN_ID }, { shake: MONSTER_ID }]);
  });

  it('plays nothing of a hit whose movers are not in view (the event is played on the step that made it, so they are)', () => {
    const none = recorder();
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: SWORD }, worldOf({ gone: [MONSTER_ID] }), none.out);
    playCombatEvent({ kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER_ID, weapon: SWORD }, worldOf({ gone: [OWN_ID] }), none.out);
    expect(none.played).toEqual([]);
  });
});

describe("playCombatEvent: a model's flash (m_SparkInfo: CMover::OnDamage, MoverActEvent.cpp:1522-1538, :1704-1717)", () => {
  it('flashes the mover, lit along the way from the other one to it: D3DXVec3Normalize( GetPos() - pOther->GetPos() )', () => {
    const r = recorder();
    // the victim's flash: pHitObj->GetPos() - GetPos(); the attacker's: GetPos() - pHitObj->GetPos()
    playCombatEvent({ kind: 'spark', moverId: MONSTER_ID, fromId: OWN_ID }, worldOf(), r.out);
    playCombatEvent({ kind: 'spark', moverId: OWN_ID, fromId: MONSTER_ID }, worldOf(), r.out);
    const toMonster = normalize(sub(MONSTER_AT, OWN_AT));
    expect(r.played).toEqual([{ flash: [MONSTER_ID, toMonster] }, { flash: [OWN_ID, normalize(sub(OWN_AT, MONSTER_AT))] }]);
    expect(Math.hypot(...toMonster)).toBeCloseTo(1, 6);
  });

  it('flashes nothing when either mover is not in view (IsValidObj( pHitObj ))', () => {
    const r = recorder();
    playCombatEvent({ kind: 'spark', moverId: MONSTER_ID, fromId: OWN_ID }, worldOf({ gone: [OWN_ID] }), r.out);
    playCombatEvent({ kind: 'spark', moverId: MONSTER_ID, fromId: OWN_ID }, worldOf({ gone: [MONSTER_ID] }), r.out);
    expect(r.played).toEqual([]);
  });
});

describe('playCombatEvent: level ups, spawns and the rest', () => {
  it("plays another player's level up on it, following it (OnSetLevel, DPClient.cpp:3351)", () => {
    const r = recorder();
    playCombatEvent({ kind: 'levelUp', moverId: OTHER_ID }, worldOf(), r.out);
    expect(r.played).toEqual([{ effect: { xi: Xi.GEN_LEVEL_UP01, pos: OTHER_AT, followId: OTHER_ID, sourceAngle: 300.25 } }]);
  });

  it('plays the spawn on a mover that came near, following it (OnAddObj, DPClient.cpp:1226)', () => {
    const r = recorder();
    playCombatEvent({ kind: 'spawned', moverId: MONSTER_ID }, worldOf(), r.out);
    expect(r.played).toEqual([
      { effect: { xi: Xi.GEN_MONSTER_SPAWN01, pos: MONSTER_AT, followId: MONSTER_ID, sourceAngle: 217.5 } },
    ]);
  });

  it('plays nothing for a mover gone, a swing or a text', () => {
    const r = recorder();
    const world = worldOf({ gone: [MONSTER_ID, OTHER_ID] });
    playCombatEvent({ kind: 'levelUp', moverId: OTHER_ID }, world, r.out);
    playCombatEvent({ kind: 'spawned', moverId: MONSTER_ID }, world, r.out);
    playCombatEvent({ kind: 'swing', attackerId: OWN_ID, targetId: MONSTER_ID }, worldOf(), r.out);
    playCombatEvent({ kind: 'text', textId: 5, args: '' }, worldOf(), r.out);
    expect(r.played).toEqual([]);
  });
});

describe('playOwnEvent (CMover::SetExperience, MoverParam.cpp:1727; CDPClient::OnSetExperience, DPClient.cpp:3398-3400)', () => {
  it('plays the level up on the own player for a level up, and again for new skill points', () => {
    const r = recorder();
    playOwnEvent({ kind: 'levelUp', from: 1, to: 2, chatLine: true }, worldOf(), r.out);
    playOwnEvent({ kind: 'skillPointUp' }, worldOf(), r.out);
    const levelUp = { effect: { xi: Xi.GEN_LEVEL_UP01, pos: OWN_AT, followId: OWN_ID, sourceAngle: 37.5 } };
    expect(r.played).toEqual([levelUp, levelUp]);
  });

  it('plays nothing for the other events, or with the own player not in view', () => {
    const r = recorder();
    for (const event of [{ kind: 'patternUp', level: 2 }, { kind: 'refilled' }, { kind: 'statsChanged' }, { kind: 'died' }, { kind: 'revived' }] as const) {
      playOwnEvent(event, worldOf(), r.out);
    }
    playOwnEvent({ kind: 'levelUp', from: 1, to: 2, chatLine: true }, worldOf({ self: false }), r.out);
    expect(r.played).toEqual([]);
  });
});

describe('WARM_UP_EFFECTS', () => {
  it("holds milestone 1's effects: the weapons' hit sparks, the four banners, the level up and the spawn", () => {
    expect([...WARM_UP_EFFECTS].sort((a, b) => a - b)).toEqual([
      Xi.HIT_CRITICAL01, Xi.HIT_MISS01, Xi.HIT_PARRY01, Xi.HIT_HITBLOCK01, Xi.HIT_YOY01, Xi.HIT_SWORD01, Xi.HIT_STICK01,
      Xi.HIT_KNUCKLE01, Xi.HIT_BOW01, Xi.GEN_LEVEL_UP01, Xi.GEN_MONSTER_SPAWN01,
    ]);
  });
});

describe('isGameMaster (IsAuthHigher( AUTH_GAMEMASTER ), authorization.h:58-102)', () => {
  it("is a game master's from 'L' (GM level 1) up, and not a player's, a VIP's, a helper's or a moderator's", () => {
    const of = (letter: string): boolean => isGameMaster(letter.charCodeAt(0));
    expect(['F', '1', '3', 'G', 'H', 'J', 'K', 'D'].map(of)).toEqual([false, false, false, false, false, false, false, false]);
    expect(['L', 'M', 'N', 'O', 'P'].map(of)).toEqual([true, true, true, true, true]);
  });
});

// Using skills (spec §3.11, [skills §4]): the own character's skill use (SkillUse) with the attack loop and the world, as
// the world screen steps them: a bar slot's skill walks to the focus and sends USESKILL on arrival, the action slot
// sends its first skill, the server's USESKILL plays the skill's motion and its hits, and its other answers (and their
// absence) end the request. With them, the own numbers' skill messages and CREATESFXOBJ.

import { describe, expect, it, vi } from 'vitest';
import type { WebSkill } from '@flyffweb/formats';
import { MAX_SKILL_JOB, NULL_ID, ShortcutKind } from '@flyffweb/protocol';
import type { MoveReport, Shortcut, SkillSlot, Vec3, WorldMessage } from '@flyffweb/protocol';
import { newVagrantOwn } from '@flyffweb/testkit';
import { ServerClock } from '../src/net/serverClock';
import { AttackLoop } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import { playCombatEvent } from '../src/world/fx/combatEffects';
import type { CombatFxOut } from '../src/world/fx/combatEffects';
import type { EffectRequest } from '../src/world/fx/EffectManager';
import { OwnState } from '../src/world/OwnState';
import type { OwnEvent } from '../src/world/OwnState';
import { terrainGround } from '../src/world/sim/collision';
import type { CollisionObject, Ground } from '../src/world/sim/collision';
import { ActMsg, Belli, Ik3, Mop, Mti, ObjSta } from '../src/world/sim/constants';
import { SkillUse } from '../src/world/skills/skillUse';
import { WorldState } from '../src/world/WorldState';
import type { CombatEvent, Mover } from '../src/world/WorldState';
import { MI_MALE, addedNpc, addedPlayer, webMoverOf } from './helpers/movers';
import { OWN_ID, STARTER_EQUIPMENT, itemProp, ownAdded, ownGameData } from './helpers/ownState';
import { CLEAN_HIT, FLURRY, OVER_CUT, vagrantSkills } from './helpers/skills';

/** `MI_AIBATT1`, a monster that can be killed. */
const AIBATT = 20;
const MONSTER_ID = 30;
const PLAYER_ID = 50;
const OWN_AT: Vec3 = [100, 0, 100];
/** 5 m east of the own mover, which faces east (angle 90: D3D +x). */
const MONSTER_AT: Vec3 = [105, 0, 100];
/** `TID_RESKILLPOINT_ERROR` and `TID_GAME_BLOCKTARGETING` (`Resource/defineText.h:1239`, :289). */
const RESKILLPOINT_ERROR = 2362;
const BLOCKTARGETING = 671;

/** The motions the fake models play, by `MTI_*`: frames and hit frames (the `.ani`s of [skills §1.6]). */
const MOTIONS = new Map<number, { frames: number; hits: number[] }>([
  [Mti.VAG_ONE_CLEANHIT, { frames: 51, hits: [27] }],
  [Mti.VAG_ONE_BRANDISH, { frames: 61, hits: [7, 23, 39] }],
  [Mti.VAG_ONE_OVERCUTTER, { frames: 51, hits: [23] }],
]);
/** Any other motion: 24 frames (a swing at speed 1 ends in 46 steps) and no blow. */
const OTHER_MOTION = { frames: 24, hits: [] as number[] };

/** A shortcut of the skill in slot `index` of `m_aJobSkill`, `data` 1 on an item bar, 2 in the action slot. */
const skillShortcut = (index: number, data: 1 | 2): Shortcut =>
  ({ kind: ShortcutKind.SKILL, id: index, type: 0, index: 0, userId: 0, data, text: '' });

/** A Vagrant's skill slots with Clean Hit, Flurry and Over Cut at these levels, the 42 others empty. */
function skillsAt(cleanHit: number, flurry = 0, overCut = 0): SkillSlot[] {
  const levels = [cleanHit, flurry, overCut];
  return Array.from({ length: MAX_SKILL_JOB }, (_, i) => (i < 3 ? { skill: i + 1, level: levels[i]! } : { skill: NULL_ID, level: 0 }));
}

/** The plane x = `x` from height 0 to 10 and z 90 to 110. */
function wallAt(x: number): CollisionObject {
  const a: Vec3 = [x, 0, 110];
  const b: Vec3 = [x, 10, 110];
  const c: Vec3 = [x, 0, 90];
  const d: Vec3 = [x, 10, 90];
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { triangles: new Float32Array([a, b, c, b, d, c].flat()), matrix: identity };
}

type Sent =
  | ['destObj', number, number]
  | ['melee', number, number]
  | ['useSkill', number, number, number]
  | ['endSkillQueue']
  | ['doUseSkillPoint', SkillSlot[]]
  | ['behavior']
  | ['getDestObj'];

interface RigOptions {
  /** The own skill slots; Clean Hit and Flurry at 1 by default. */
  skills?: SkillSlot[];
  /** The action slot's shortcuts (TASKBAR's queue); none by default. */
  queue?: Shortcut[];
  /** Where the Aibatt stands; 5 m east by default. */
  monsterAt?: Vec3;
  ground?: Ground;
  /** More rows of the skills catalog than the Vagrant's three. */
  catalog?: WebSkill[];
}

/**
 * The own character (a level 5 Vagrant with the Wooden Sword) facing an Aibatt 5 m east, and another player, in a
 * `WorldState` with the own numbers; the skill use and the attack loop over one fake session, wired as the world screen
 * wires them; fake models that play each motion at 0.5 frames a step (held while paused) with the skills' hit frames;
 * and a rules step as the world screen takes one: the skill use's step, the attack loop's, the world's, the models'.
 * The clock starts at 0 as the skill use is made (`m_SkillTimer` starts) and is at 10 s for the test.
 */
function rig(options: RigOptions = {}) {
  const data = ownGameData({
    movers: new Map([
      [MI_MALE, webMoverOf({ index: MI_MALE, name: 'Male', speed: 0.1, ai: 1, killable: 1 })],
      [AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', killable: 1, belligerence: Belli.ACTIVEATTACK })],
    ]),
    skills: new Map([...vagrantSkills(), ...(options.catalog ?? []).map((s): [number, WebSkill] => [s.id, s])]),
    texts: new Map([
      ['TID_RESKILLPOINT_ERROR', { id: 'TID_RESKILLPOINT_ERROR', text: 'There was a problem.', color: 0xffffffff, textId: RESKILLPOINT_ERROR }],
      ['TID_GAME_BLOCKTARGETING', { id: 'TID_GAME_BLOCKTARGETING', text: 'Blocked.', color: 0xffffffff, textId: BLOCKTARGETING }],
    ]),
  });
  const added = {
    ...ownAdded(5, { ...newVagrantOwn(), skills: options.skills ?? skillsAt(1, 1) }), pos: OWN_AT, angle: 90,
    state: ObjSta.STAND,
  };
  const numbers = new OwnState(data, added, STARTER_EQUIPMENT);
  const ground = options.ground ?? terrainGround(() => 0);
  const world = new WorldState(data, new ServerClock(() => 0), ground, numbers);
  world.apply(OWN_ID, { type: 'addMover', mover: added });
  const monsterAt = options.monsterAt ?? MONSTER_AT;
  world.apply(MONSTER_ID, {
    type: 'addMover',
    mover: addedNpc(MONSTER_ID, AIBATT, {}, { pos: monsterAt, angle: 270, state: ObjSta.STAND, belligerence: Belli.ACTIVEATTACK }),
  });
  world.apply(PLAYER_ID, { type: 'addMover', mover: addedPlayer(PLAYER_ID, {}, { pos: [100, 0, 97], angle: 180, state: ObjSta.STAND }) });
  world.takeChanges();
  for (const m of world.movers.values()) m.radius = 0.5;
  numbers.apply({ type: 'taskBar', taskBar: { applets: [], items: [], queue: options.queue ?? [], actionPoint: 50 } }, OWN_ID);
  const own = world.self()!;

  // the models: each motion from frame 0 at its set, 0.5 frames a step at the animation speed, held while paused
  const frames = new Map<Mover, { sets: number; current: number; old: number }>();
  const motionOf = (m: Mover): { frames: number; hits: number[] } => MOTIONS.get(m.act.motion) ?? OTHER_MOTION;
  for (const m of world.movers.values()) {
    const f = { sets: m.act.motionSets, current: 0, old: -1 };
    frames.set(m, f);
    m.act.isEndFrame = () => f.sets === m.act.motionSets && f.current >= motionOf(m).frames - 1;
    m.act.modelFrame = () => ({ current: f.sets === m.act.motionSets ? f.current : 0, max: motionOf(m).frames });
    m.act.isAttrHit = () => {
      const [o, c] = f.sets === m.act.motionSets ? [f.old, f.current] : [-1, 0];
      return motionOf(m).hits.findIndex((h) => Math.trunc(h) === Math.trunc(c) && o < h && h <= c);
    };
  }
  const frameMove = (): void => {
    for (const [m, f] of frames) {
      if (f.sets !== m.act.motionSets) Object.assign(f, { sets: m.act.motionSets, current: 0, old: -1 });
      if (m.act.paused > 0) continue;
      f.old = f.current;
      f.current = Math.min(f.current + 0.5 * m.act.aniSpeed, motionOf(m).frames - 1);
    }
  };

  let now = 0;
  const sent: Sent[] = [];
  const sentAt: number[] = [];
  const session = {
    sendDestObj: (targetId: number, range: number) => void sent.push(['destObj', targetId, range]),
    sendMeleeAttack: (message: number, targetId: number) => void sent.push(['melee', message, targetId]),
    sendGetDestObj: () => void sent.push(['getDestObj']),
    sendBehavior: (_m: MoveReport) => void sent.push(['behavior']),
    sendSetTarget: () => {},
    sendUseSkill: (index: number, targetId: number, useType: number) => {
      sent.push(['useSkill', index, targetId, useType]);
      sentAt.push(now);
    },
    sendEndSkillQueue: () => void sent.push(['endSkillQueue']),
    sendDoUseSkillPoint: (skills: readonly SkillSlot[]) => void sent.push(['doUseSkillPoint', [...skills]]),
  };
  const focus = new Focus(session);
  const skills = new SkillUse(session, focus, () => numbers, () => now, data, { tick: () => 1000n, ground: () => ground });
  const loop = new AttackLoop(session, focus, world, () => numbers, { tick: () => 1000n }, data.movers, skills);
  skills.attack = loop;
  world.onUseSkill = (casterId, message, started) => skills.onUseSkill(casterId, message, started);
  const texts: string[] = [];
  skills.onText = (id) => texts.push(id);
  now = 10_000;

  const combat: CombatEvent[] = [];
  const ownEvents: OwnEvent[] = [];
  const take = (): void => {
    const changes = world.takeChanges();
    combat.push(...changes.combat);
    ownEvents.push(...changes.own);
  };
  const step = (): void => {
    loop.step(skills.step(own, (id) => world.movers.get(id)));
    world.step();
    frameMove();
    take();
    now += 1000 / 60;
  };
  const steps = (n: number): void => {
    for (let i = 0; i < n; i++) step();
  };
  /** Steps until `done` holds, at most `limit` steps; fails if it never does. The steps it took. */
  const until = (done: () => boolean, limit = 600): number => {
    for (let i = 0; i < limit; i++) {
      if (done()) return i;
      step();
    }
    throw new Error(`still not done after ${limit} steps`);
  };
  /** A message of the server, about `objectId`, as the world screen applies it. */
  const apply = (objectId: number, message: WorldMessage): void => {
    world.apply(objectId, message);
    skills.onMessage(objectId, message, world.self());
    take();
  };
  /** The server's USESKILL of `casterId`: the skill `skill` (`SI_*`) at `level`, at `targetId`. */
  const useSkill = (casterId: number, skill: number, level: number, targetId: number, useType = 0): void =>
    apply(casterId, { type: 'useSkill', skill, level, targetId, useType, castingTime: 1 });
  /** A tap on the mover `objectId`: pressed and let go before the next step. */
  const tap = (objectId: number): void => {
    loop.onMoverPressed(objectId, now, false);
    loop.onReleased();
  };
  const kinds = (): string[] => sent.map((s) => s.join(' '));
  const skillHits = (): CombatEvent[] => combat.filter((e) => e.kind === 'skillHit');
  return {
    world, own, numbers, skills, loop, focus, sent, sentAt, texts, combat, ownEvents, step, steps, until, apply, useSkill,
    tap, kinds, skillHits, monster: world.movers.get(MONSTER_ID)!, player: world.movers.get(PLAYER_ID)!, now: () => now,
    setNow: (t: number) => {
      now = t;
    },
  };
}

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

describe('SkillUse: a bar slot (UseSkillShortCut, CMD_SetUseSkill, ProcessMoveArrival)', () => {
  it('walks to an Aibatt 5 m away with PLAYERSETDESTOBJ( target, 2.0 ), sends USESKILL( 0, target, SUT_NORMAL ) on arrival, and plays nothing before the server\'s word', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.step();
    // GetAttackRange( AR_SHORT ) = 2.0 (MoverMsg.cpp:144)
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 2]]);
    expect(r.skills.commanding).toBe(true);
    r.until(() => r.sent.length > 1);
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 2], ['useSkill', 0, MONSTER_ID, 0]]);
    expect(r.skills.pending).toBe(true);
    expect(r.skills.commanding).toBe(false);
    // in range as IsRangeObj says (0.8 * 0.5 + 0.8 * 0.5 + 2.0 = 2.8), and stopped there: ClearDestObj and OBJMSG_STOP
    const d = distance(r.own.act.body.pos, MONSTER_AT);
    expect(d).toBeLessThan(2.8);
    expect(d).toBeGreaterThan(2.6);
    expect(r.own.dest?.targetId ?? null).toBeNull();
    // the client starts no motion of its own (MoverMove.cpp:170-180): it waits for the server
    r.steps(30);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(0);
    expect(r.own.act.motion).not.toBe(Mti.VAG_ONE_CLEANHIT);
    expect(r.sent).toHaveLength(2);
    expect(r.skillHits()).toEqual([]);
  });

  it('plays the server\'s USESKILL: Clean Hit\'s motion 1000 as it is (MOP_FIXED), its blow at frame 27 a skillHit, the Aibatt flinching', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    r.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID);
    // OnUseSkill: REQ_USESKILL off; DoUseSkill: faced, OBJMSG_MELEESKILL, the skill in use
    expect(r.skills.pending).toBe(false);
    expect(r.own.act.state).toBe(ObjSta.ATK_MELEESKILL);
    expect(r.own.act.motion).toBe(Mti.VAG_ONE_CLEANHIT);
    expect(r.own.act.motionOption).toBe(Mop.SWDFORCE | Mop.NO_TRANS | Mop.FIXED);
    expect(r.own.act.skillAct).toEqual({ skill: CLEAN_HIT.id, targetId: MONSTER_ID, level: 1 });
    expect(r.own.act.body.angle).toBe(90);
    // frame 27 at 0.5 a step: the 54th frame move, which the 55th step reads
    const steps = r.until(() => r.skillHits().length > 0) ;
    expect(steps).toBe(55);
    const hit = r.combat.findIndex((e) => e.kind === 'skillHit');
    // OnMeleeSkill: the caster's flash from its target's side, then the blow (flinch) and the effect (CreateSkillSfx)
    expect(r.combat.slice(hit - 1, hit + 1)).toEqual([
      { kind: 'spark', moverId: OWN_ID, fromId: MONSTER_ID },
      { kind: 'skillHit', casterId: OWN_ID, targetId: MONSTER_ID, skill: CLEAN_HIT.id, landed: true },
    ]);
    expect(r.monster.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG);
    expect(r.own.act.paused).toBe(4);
    // the skill's effect: CSfxFixed 1.3 m before the caster and 1 m up, turned by the caster's raw angle (ruling R11)
    const effects: EffectRequest[] = [];
    const out: CombatFxOut = { effect: (e) => void effects.push(e), number: () => {}, flash: () => {}, shake: () => {} };
    const fxWorld = {
      movers: r.world.movers, selfId: OWN_ID, gameMaster: false, focusId: MONSTER_ID, itemProps: new Map(), skills: vagrantSkills(),
    };
    playCombatEvent(r.combat[hit]!, fxWorld, out);
    expect(effects).toHaveLength(1);
    expect(effects[0]!.xi).toBe(CLEAN_HIT.sfxHit);
    expect(effects[0]!.sourceAngle).toBe(90);
    expect(effects[0]!.pos[0]).toBeCloseTo(r.own.act.body.pos[0] + 1.3, 4);
    expect(effects[0]!.pos[1]).toBe(1);
  });

  it('Flurry\'s three hit frames give three skillHits, the last before its motion ends at 65%', () => {
    const r = rig();
    r.useSkill(OWN_ID, FLURRY.id, 1, MONSTER_ID);
    r.until(() => (r.own.act.state & ObjSta.ATK_ALL) === 0);
    expect(r.skillHits()).toEqual([1, 2, 3].map(() =>
      ({ kind: 'skillHit', casterId: OWN_ID, targetId: MONSTER_ID, skill: FLURRY.id, landed: true })));
    // OnActEndMeleeSkill: the skill in use goes with the state
    expect(r.own.act.skillAct).toBeNull();
  });

  it('turns the auto-attack on as the server begins the skill (OnUseSkill), which swings once the skill has ended', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    expect(r.loop.autoAttack).toBe(false);
    r.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID);
    expect(r.loop.autoAttack).toBe(true);
    // nothing while the skill plays (UseFocusObj refuses an attack action); then the walk in and ATK1
    r.until(() => (r.own.act.state & ObjSta.ATK_ALL) === 0);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 2`, `useSkill 0 ${MONSTER_ID} 0`]);
    r.until(() => r.sent.some((s) => s[0] === 'melee'));
    expect(r.kinds().slice(2)).toEqual([`destObj ${MONSTER_ID} 0`, `melee ${ActMsg.ATK1} ${MONSTER_ID}`]);
  });

  it('does not turn the auto-attack on with a staff in the hand, nor for a skill the server did not begin', () => {
    const staff = rig();
    staff.numbers.equipped = { weapon: itemProp({ id: 31, kind1: 1, kind2: 2, kind3: Ik3.STAFF, part: 10 }), armour: [] };
    staff.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID);
    expect(staff.own.act.state).toBe(ObjSta.ATK_MELEESKILL);
    expect(staff.loop.autoAttack).toBe(false);
    // a target out of view: DoUseSkill fails (IsInvalidObj), nothing plays, and the request is answered all the same
    const gone = rig();
    gone.tap(MONSTER_ID);
    gone.skills.useSlot(0);
    gone.until(() => gone.skills.pending);
    gone.useSkill(OWN_ID, CLEAN_HIT.id, 1, 999);
    expect(gone.skills.pending).toBe(false);
    expect(gone.own.act.state & ObjSta.ATK_ALL).toBe(0);
    expect(gone.loop.autoAttack).toBe(false);
  });

  it('waits for the server: no swing while the skill walks or its USESKILL waits, whatever the auto-attack', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID); // auto-attack on: the walk to swing begins
    r.step();
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 0`]);
    // CMD_SetUseSkill takes over the one command; the object followed is the same, so no new PLAYERSETDESTOBJ
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 0`, `useSkill 0 ${MONSTER_ID} 0`]);
    r.steps(60);
    expect(r.sent).toHaveLength(2);
    // refused: the attack goes on (WndWorld.cpp:8514-8522 no longer hold it)
    r.apply(OWN_ID, { type: 'clearUseSkill' });
    r.until(() => r.sent.some((s) => s[0] === 'melee'));
  });

  it('a skill pressed while swinging is reserved, ends the combo, and goes once the swing is over', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.tap(MONSTER_ID);
    r.until(() => r.sent.some((s) => s[0] === 'melee'));
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    r.skills.useSlot(0);
    r.step();
    // refused while attacking: SetNextSkill( dwSkillIdx ), and the branch of Process is the reserved skill's
    expect(r.skills.reserved).toBe(true);
    r.until(() => r.sent.some((s) => s[0] === 'useSkill'));
    // no ATK2 (level 5 would have it): the reserved skill ends the combo (ActionMoverState.cpp:826-828)
    expect(r.kinds()).toEqual([
      `destObj ${MONSTER_ID} 0`, `melee ${ActMsg.ATK1} ${MONSTER_ID}`, `destObj ${MONSTER_ID} 2`, `useSkill 0 ${MONSTER_ID} 0`,
    ]);
    expect(r.skills.reserved).toBe(false);
  });

  it('holds a second use within 1 s of the last on arrival, unless a key was let go (m_SkillTimer, m_SkillTimerStop)', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    r.apply(OWN_ID, { type: 'clearUseSkill' });
    // within the second: the arrival drops the command without a USESKILL (MoverMove.cpp:81)
    r.skills.useSlot(0);
    r.steps(3);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 2`, `useSkill 0 ${MONSTER_ID} 0`, `destObj ${MONSTER_ID} 2`]);
    expect(r.skills.commanding).toBe(false);
    expect(r.skills.pending).toBe(false);
    // a key let go since: at once
    r.skills.keyUp();
    r.skills.useSlot(0);
    r.steps(3);
    expect(r.kinds().slice(3)).toEqual([`destObj ${MONSTER_ID} 2`, `useSkill 0 ${MONSTER_ID} 0`]);
    // a key down again, and the second past: at once too
    r.apply(OWN_ID, { type: 'clearUseSkill' });
    r.skills.keyDown();
    r.setNow(r.sentAt[1]! + 1000);
    r.skills.useSlot(0);
    r.steps(3);
    expect(r.kinds().slice(5)).toEqual([`destObj ${MONSTER_ID} 2`, `useSkill 0 ${MONSTER_ID} 0`]);
  });

  it('sends nothing at a target behind an obstacle, and says TID_GAME_BLOCKTARGETING (IntersectObjLine, MoverMove.cpp:83-92)', () => {
    const r = rig({ monsterAt: [102, 0, 100], ground: { ...terrainGround(() => 0), objectsNear: () => [wallAt(101)] } });
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.steps(3);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 2`]);
    expect(r.texts).toEqual(['TID_GAME_BLOCKTARGETING']);
    expect(r.skills.commanding).toBe(false);
    expect(r.skills.pending).toBe(false);
    // with the command gone, the next arrival is the default one: the following ends
    expect(r.own.dest?.targetId ?? null).toBeNull();
  });

  it('walks, but sends no USESKILL the server would drop without a word: a skill of level 0 (DPSrvrLux.cpp:74-75)', () => {
    const r = rig({ skills: skillsAt(0) });
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.step();
    expect(r.skills.commanding).toBe(true);
    r.until(() => !r.skills.commanding);
    expect(r.kinds()).toEqual([`destObj ${MONSTER_ID} 2`]);
    expect(r.skills.pending).toBe(false);
    expect(r.own.dest?.targetId ?? null).toBeNull();
    // an empty slot has no skill: no command at all (CMD_SetUseSkill finds no property)
    r.skills.useSlot(3);
    r.step();
    expect(r.sent).toHaveLength(1);
    // and a slot outside m_aJobSkill is never taken
    r.skills.useSlot(MAX_SKILL_JOB);
    r.step();
    expect(r.sent).toHaveLength(1);
  });

  it('uses no skill with no target (EXT_MELEEATK needs one), nor at a dead one', () => {
    const r = rig();
    r.skills.useSlot(0);
    r.steps(5);
    expect(r.sent).toEqual([]);
    expect(r.skills.commanding).toBe(false);
    r.tap(MONSTER_ID);
    r.apply(MONSTER_ID, { type: 'moverDeath', message: 0, attackerId: PLAYER_ID });
    r.skills.useSlot(0);
    r.steps(5);
    expect(r.sent).toEqual([]);
  });
});

describe('SkillUse: the answer to USESKILL (OnUseSkill, OnClearUseSkill, the 2 s guard)', () => {
  it('CLEAR_USESKILL clears the request; another mover\'s does not', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    r.apply(PLAYER_ID, { type: 'clearUseSkill' });
    expect(r.skills.pending).toBe(true);
    r.apply(OWN_ID, { type: 'clearUseSkill' });
    expect(r.skills.pending).toBe(false);
    expect(r.own.act.state & ObjSta.ATK_ALL).toBe(0);
  });

  it('no answer for 2000 ms clears the request, which can then be made again', () => {
    const r = rig();
    r.tap(MONSTER_ID);
    r.skills.useSlot(0);
    r.until(() => r.skills.pending);
    const at = r.sentAt[0]!;
    r.setNow(at + 1999);
    r.step();
    expect(r.skills.pending).toBe(true);
    r.setNow(at + 2000);
    r.step();
    expect(r.skills.pending).toBe(false);
    r.skills.useSlot(0);
    r.steps(3);
    expect(r.kinds().slice(-1)).toEqual([`useSkill 0 ${MONSTER_ID} 0`]);
  });
});

describe('SkillUse: the action slot (UseSkillQueue, ENDSKILLQUEUE)', () => {
  it('sends the first skill with SUT_QUEUESTART, runs once the server begins it, and ENDSKILLQUEUE ends it', () => {
    const r = rig({ queue: [skillShortcut(0, 2), skillShortcut(1, 2)] });
    r.tap(MONSTER_ID);
    r.skills.useActionSlot();
    r.step();
    // CWndWorld::UseSkill reserves it, Process takes it at once: m_nExecute 1, the walk; UseSkillToFocusObj's auto-attack
    expect(r.sent).toEqual([['destObj', MONSTER_ID, 2]]);
    expect(r.skills.execute).toBe(1);
    expect(r.skills.reserved).toBe(false);
    expect(r.loop.autoAttack).toBe(true);
    r.until(() => r.skills.pending);
    expect(r.sent.slice(1)).toEqual([['useSkill', 0, MONSTER_ID, 1]]);
    // ENDSKILLQUEUE while the request waits is not taken (OnCancelSkill, WndTaskBar.cpp:2440-2441)
    r.apply(OWN_ID, { type: 'endSkillQueue' });
    expect(r.skills.execute).toBe(1);
    r.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID, 1);
    expect(r.skills.execute).toBe(2);
    expect(r.own.act.state).toBe(ObjSta.ATK_MELEESKILL);
    // the server's chain: SETACTIONPOINT, then the next skill's USESKILL (SUT_QUEUEING), then ENDSKILLQUEUE
    r.until(() => (r.own.act.state & ObjSta.ATK_ALL) === 0);
    r.apply(NULL_ID, { type: 'setActionPoint', actionPoint: 44 });
    expect(r.numbers.taskBar?.actionPoint).toBe(44);
    r.useSkill(OWN_ID, FLURRY.id, 1, MONSTER_ID, 2);
    expect(r.own.act.motion).toBe(Mti.VAG_ONE_BRANDISH);
    expect(r.skills.execute).toBe(2);
    r.apply(OWN_ID, { type: 'endSkillQueue' });
    expect(r.skills.execute).toBe(0);
    // the client sent nothing of the chain itself
    expect(r.sent.filter((s) => s[0] === 'useSkill')).toHaveLength(1);
  });

  it('a press in the world while the chain runs sends ENDSKILLQUEUE: on the ground or on a mover, not a double click\'s second', () => {
    const r = rig({ queue: [skillShortcut(0, 2)] });
    r.tap(MONSTER_ID);
    r.loop.onGroundPressed(false);
    expect(r.sent).toEqual([]); // idle: nothing to stop
    r.tap(MONSTER_ID);
    r.skills.useActionSlot();
    r.until(() => r.skills.pending);
    r.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID, 1);
    const before = r.sent.length;
    r.loop.onGroundPressed(false);
    expect(r.sent.slice(before)).toEqual([['endSkillQueue']]);
    r.loop.onGroundPressed(true);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), true);
    expect(r.sent).toHaveLength(before + 1);
    r.loop.onMoverPressed(MONSTER_ID, r.now(), false);
    r.loop.onReleased();
    expect(r.sent.slice(before)).toEqual([['endSkillQueue'], ['endSkillQueue']]);
    // the server answers: the chain is over, and a press stops nothing more
    r.apply(OWN_ID, { type: 'endSkillQueue' });
    r.loop.onGroundPressed(false);
    expect(r.sent).toHaveLength(before + 2);
  });

  it('a bar slot does nothing while the action slot runs, and an empty action slot only drops the reservation', () => {
    const r = rig({ queue: [skillShortcut(0, 2)] });
    r.tap(MONSTER_ID);
    r.skills.useActionSlot();
    r.until(() => r.skills.pending);
    r.useSkill(OWN_ID, CLEAN_HIT.id, 1, MONSTER_ID, 1);
    r.until(() => (r.own.act.state & ObjSta.ATK_ALL) === 0);
    // m_nExecute is 2 until the server's ENDSKILLQUEUE: UseSkillShortCut does nothing (WndManager.cpp:6832); the
    // auto-attack the action slot turned on may walk and swing meanwhile
    const before = r.sent.length;
    r.skills.useSlot(0);
    r.step();
    expect(r.skills.commanding).toBe(false);
    expect(r.sent.slice(before).some((s) => s[0] === 'useSkill' || (s[0] === 'destObj' && s[2] === 2))).toBe(false);
    const empty = rig();
    empty.tap(MONSTER_ID);
    empty.skills.useActionSlot();
    empty.step();
    expect(empty.sent).toEqual([]);
    expect(empty.skills.reserved).toBe(false);
    expect(empty.skills.execute).toBe(0);
  });
});

describe('WorldState: another player\'s USESKILL, and a monster\'s', () => {
  it('another player\'s plays its motion and hits; a monster\'s is not a player\'s skill and does nothing (IsNPC)', () => {
    const r = rig();
    r.useSkill(PLAYER_ID, OVER_CUT.id, 1, MONSTER_ID);
    expect(r.player.act.state).toBe(ObjSta.ATK_MELEESKILL);
    expect(r.player.act.motion).toBe(Mti.VAG_ONE_OVERCUTTER);
    r.until(() => (r.player.act.state & ObjSta.ATK_ALL) === 0);
    expect(r.skillHits()).toEqual([{ kind: 'skillHit', casterId: PLAYER_ID, targetId: MONSTER_ID, skill: OVER_CUT.id, landed: true }]);
    r.useSkill(MONSTER_ID, CLEAN_HIT.id, 1, PLAYER_ID);
    expect(r.monster.act.state & ObjSta.ATK_ALL).toBe(0);
  });
});

describe('SkillUse: the skill-point spend (DOUSESKILLPOINT\'s three answers)', () => {
  it('sends one spend at a time, answered by DOUSESKILLPOINT, by TID_RESKILLPOINT_ERROR, or by 2 s of nothing', () => {
    const r = rig();
    const plan = skillsAt(2, 1);
    expect(r.skills.spendSkillPoints(plan)).toBe(true);
    expect(r.skills.spendSkillPoints(plan)).toBe(false);
    expect(r.sent).toEqual([['doUseSkillPoint', plan]]);
    r.apply(OWN_ID, { type: 'doUseSkillPoint', skills: plan, skillPoint: 3 });
    expect(r.skills.spendPending).toBe(false);
    expect(r.skills.spendSkillPoints(plan)).toBe(true);
    r.apply(NULL_ID, { type: 'definedText', textId: BLOCKTARGETING, args: null });
    expect(r.skills.spendPending).toBe(true);
    r.apply(NULL_ID, { type: 'definedText', textId: RESKILLPOINT_ERROR, args: null });
    expect(r.skills.spendPending).toBe(false);
    expect(r.skills.spendSkillPoints(plan)).toBe(true);
    r.setNow(r.now() + 2000);
    r.step();
    expect(r.skills.spendPending).toBe(false);
  });

  it('says a spend the encoder refuses in the console, and waits for nothing', () => {
    const r = rig();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const session = {
        sendUseSkill: () => {}, sendEndSkillQueue: () => {}, sendDestObj: () => {}, sendBehavior: () => {},
        sendDoUseSkillPoint: () => {
          throw new Error('a skill array has 45 slots, not 3');
        },
      };
      const skills = new SkillUse(session, r.focus, () => r.numbers, () => 0, { skills: vagrantSkills(), texts: new Map(), movers: new Map() });
      expect(skills.spendSkillPoints(skillsAt(1).slice(0, 3))).toBe(false);
      expect(skills.spendPending).toBe(false);
      expect(error).toHaveBeenCalledTimes(1);
    } finally {
      error.mockRestore();
    }
  });
});

describe('OwnState: the skill messages (OnDoUseSkillPoint, OnInitSkillPoint, OnSetActionPoint, OnTaskBar)', () => {
  it('DOUSESKILLPOINT sets each level by skill ID, whatever the slot it comes in, then the points', () => {
    const r = rig({ skills: skillsAt(1) });
    const answer = skillsAt(0);
    answer[0] = { skill: FLURRY.id, level: 4 };
    answer[1] = { skill: CLEAN_HIT.id, level: 3 };
    answer[5] = { skill: 999, level: 7 }; // a skill the player lacks: skipped
    r.apply(OWN_ID, { type: 'doUseSkillPoint', skills: answer, skillPoint: 6 });
    expect(r.numbers.skills.slice(0, 3)).toEqual([
      { skill: CLEAN_HIT.id, level: 3 }, { skill: FLURRY.id, level: 4 }, { skill: OVER_CUT.id, level: 0 },
    ]);
    expect(r.numbers.skills.some((s) => s.skill === 999)).toBe(false);
    expect(r.numbers.skillPoint).toBe(6);
  });

  it('INITSKILLPOINT sets the three levels to 0 and the points to the value, with the level-up effect when they rose', () => {
    const r = rig({ skills: skillsAt(3, 3, 1) });
    r.numbers.skillPoint = 2;
    r.apply(OWN_ID, { type: 'initSkillPoint', skillPoint: 9 });
    expect(r.numbers.skills.slice(0, 3).map((s) => s.level)).toEqual([0, 0, 0]);
    expect(r.numbers.skillPoint).toBe(9);
    expect(r.ownEvents).toEqual([{ kind: 'skillPointReset', effect: true, chatLine: true }]);
    // fewer points: no effect
    r.apply(OWN_ID, { type: 'initSkillPoint', skillPoint: 4 });
    expect(r.ownEvents.slice(1)).toEqual([{ kind: 'skillPointReset', effect: false, chatLine: true }]);
  });

  it('INITSKILLPOINT stops at a skill with a level the catalog lacks (return, DPClient.cpp:14701-14702), and keeps a master\'s', () => {
    const skills = skillsAt(3, 0, 2);
    skills[1] = { skill: 998, level: 2 };
    skills[3] = { skill: 997, level: 1 };
    const r = rig({ skills });
    r.world.apply(OWN_ID, { type: 'initSkillPoint', skillPoint: 0 });
    // Clean Hit reset; the unknown skill stops it: it and Over Cut after it keep their levels; no chat line
    expect(r.numbers.skills.slice(0, 3).map((s) => s.level)).toEqual([0, 2, 2]);
    expect(r.world.takeChanges().own).toEqual([{ kind: 'skillPointReset', effect: false, chatLine: false }]);
    // a master's skill (JTYPE_MASTER) keeps its level
    const masterSkills = skillsAt(3);
    masterSkills[43] = { skill: 997, level: 1 };
    const master = rig({ skills: masterSkills, catalog: [{ ...CLEAN_HIT, id: 997, jobType: 5 }] });
    master.apply(OWN_ID, { type: 'initSkillPoint', skillPoint: 0 });
    expect(master.numbers.skills[0]!.level).toBe(0);
    expect(master.numbers.skills[43]).toEqual({ skill: 997, level: 1 });
  });

  it('SETACTIONPOINT sets the task bar\'s action points, and the TASKBAR sent again after a reset replaces the bars', () => {
    const r = rig({ queue: [skillShortcut(0, 2)] });
    const bars = r.numbers.taskBar!;
    expect(bars.actionPoint).toBe(50);
    r.apply(NULL_ID, { type: 'setActionPoint', actionPoint: 12 });
    // m_nActionPoint alone: the same bars, which the task bar then does not load anew
    expect(r.numbers.taskBar).toBe(bars);
    expect(bars.actionPoint).toBe(12);
    // InitSkillExp (Mover.cpp:1855-1900) empties the skill shortcuts and sends the bars again
    r.apply(OWN_ID, { type: 'initSkillPoint', skillPoint: 3 });
    r.apply(OWN_ID, { type: 'taskBar', taskBar: { applets: [], items: [], queue: [], actionPoint: 12 } });
    expect(r.numbers.taskBar?.queue).toEqual([]);
  });
});

describe('WorldState: CREATESFXOBJ (OnCreateSfxObj, DPClient.cpp:4038-4067)', () => {
  it('a zero position plays on the message\'s mover, following it with its angle; any other is absolute, for an object not in view too', () => {
    const r = rig();
    r.apply(MONSTER_ID, { type: 'createSfxObj', sfxId: 108, pos: [0, 0, 0], flag: 0 });
    r.apply(999, { type: 'createSfxObj', sfxId: 108, pos: [1, 2, 3], flag: 0 });
    r.apply(MONSTER_ID, { type: 'createSfxObj', sfxId: 108, pos: [0, -0, 4], flag: 1 });
    r.apply(999, { type: 'createSfxObj', sfxId: 108, pos: [0, 0, 0], flag: 0 }); // no position, no object: nothing
    const sfx = r.combat.filter((e) => e.kind === 'sfxObj');
    expect(sfx).toEqual([
      { kind: 'sfxObj', xi: 108, pos: null, moverId: MONSTER_ID },
      { kind: 'sfxObj', xi: 108, pos: [1, 2, 3], moverId: null },
      { kind: 'sfxObj', xi: 108, pos: [0, -0, 4], moverId: null },
    ]);
    const effects: EffectRequest[] = [];
    const out: CombatFxOut = { effect: (e) => void effects.push(e), number: () => {}, flash: () => {}, shake: () => {} };
    const fxWorld = { movers: r.world.movers, selfId: OWN_ID, gameMaster: false, focusId: null, itemProps: new Map() };
    playCombatEvent(sfx[0]!, fxWorld, out);
    expect(effects).toEqual([{ xi: 108, pos: MONSTER_AT, followId: MONSTER_ID, followDest: true, sourceAngle: 270 }]);
  });
});

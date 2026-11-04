import { describe, expect, it } from 'vitest';
import type { WebAudio } from '@flyffweb/formats';
import { WorldSounds } from '../src/world/sound/worldSounds';
import type { Vec } from '../src/world/sound/soundRules';

const CATALOG: WebAudio = {
  sounds: {}, music: {}, worlds: {},
  effects: { 300: 'sound/pcskillm-healing.wav', 62: 'sound/pccure.wav' },
  items: { 505: { attack1: 115, attack2: 119, drop: 39 } },
  skills: { 1: 140 },
  movers: { 20: 32 },
  npcMusic: { mafl_benku: 206 },
};

function setup(catalog: WebAudio | null = CATALOG) {
  const sounds: Array<{ id: number | string; at?: Vec }> = [];
  const music: Array<[number, number]> = [];
  const audio = {
    play: (id: number, at?: Vec) => { sounds.push(at === undefined ? { id } : { id, at }); },
    playKey: (key: string, at?: Vec) => { sounds.push(at === undefined ? { id: key } : { id: key, at }); return true; },
  };
  const rules = { play: (id: number, loops = 1) => { music.push([id, loops]); } };
  return { world: new WorldSounds(audio, rules, catalog), sounds, music };
}

const P: Vec = { x: 10, y: 0, z: 20 };

describe('WorldSounds: each trigger of the research\'s table [R §9]', () => {
  it('melee hit and critical: the weapon\'s dwSndAttack1 and dwSndAttack2 at the attacker', () => {
    const { world, sounds } = setup();
    world.meleeHit(P, 505);
    world.critical(P, 505);
    world.meleeHit(P, 999);
    world.critical(P, undefined);
    expect(sounds).toEqual([{ id: 115, at: P }, { id: 119, at: P }]);
  });

  it('equip by kind at the mover, and the inventory drop on unequip', () => {
    const { world, sounds } = setup();
    world.equip(P, { kind1: 1, kind2: 2 }, true);
    world.equip(P, { kind1: 3, kind2: 1 }, true);
    world.equip(P, undefined, true);
    world.equip(P, undefined, false);
    expect(sounds).toEqual([{ id: 8, at: P }, { id: 5, at: P }]);
  });

  it('a pick-up per inventory slot written, at the own player', () => {
    const { world, sounds } = setup();
    world.itemsCreated(P, 3);
    expect(sounds).toEqual([{ id: 7, at: P }, { id: 7, at: P }, { id: 7, at: P }]);
  });

  it('gold, the shop and a drop on the world are 2D', () => {
    const { world, sounds } = setup();
    world.gold();
    world.shop();
    world.drop();
    expect(sounds).toEqual([{ id: 4 }, { id: 4 }, { id: 6 }]);
  });

  it('a ground item\'s dwSubDefine at the item, a clicked mover\'s dwSndIdle1 in 2D', () => {
    const { world, sounds } = setup();
    world.groundItem(P, 505);
    world.groundItem(P, 506);
    world.moverClicked(20);
    world.moverClicked(21);
    expect(sounds).toEqual([{ id: 39, at: P }, { id: 32 }]);
  });

  it('an effect\'s own WAV, and the potions\' level-up sound CreateSfx adds', () => {
    const { world, sounds } = setup();
    world.effect(300, P);
    world.effect(62, P);
    world.effect(1, P);
    expect(sounds).toEqual([{ id: 'sound/pcskillm-healing.wav', at: P }, { id: 70, at: P }, { id: 'sound/pccure.wav', at: P }]);
  });

  it('a skill\'s launch at the caster', () => {
    const { world, sounds } = setup();
    world.skillCast(P, 1);
    world.skillCast(P, 2);
    expect(sounds).toEqual([{ id: 140, at: P }]);
  });

  it('the motions\' sounds and the footsteps at the mover, the server\'s sound in 2D', () => {
    const { world, sounds } = setup();
    world.motion(P, 101);
    world.footstep(P);
    world.serverSound(14);
    world.serverSound(null);
    expect(sounds).toEqual([{ id: 101, at: P }, { id: 1202, at: P }, { id: 14 }]);
  });
});

describe('WorldSounds: the jingles [R §6]', () => {
  it('the own death plays BGM_IN_DEATH, but not in the guild war and boss dungeons', () => {
    const { world, music } = setup();
    world.ownDeath(202);
    world.ownDeath(210);
    world.ownDeath(1);
    expect(music).toEqual([[22, 1]]);
  });

  it('a level-up, an NPC with SetMusic, the server\'s PLAYMUSIC', () => {
    const { world, music } = setup();
    world.ownLevelUp();
    world.npcDialog('MaFl_Benku');
    world.npcDialog('MaFl_Mikyel');
    world.serverMusic(19);
    expect(music).toEqual([[23, 1], [206, 1], [19, 1]]);
  });

  it('a boss added within 30 m plays BGM_IN_BOSS, not at 31 m, nor another rank', () => {
    const { world, music } = setup();
    world.bossAdded({ x: 31, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 4);
    world.bossAdded({ x: 29, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1);
    world.bossAdded({ x: 29, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 4);
    expect(music).toEqual([[21, 1]]);
  });

  it('without a catalog, the data triggers play nothing and the fixed ids still play', () => {
    const { world, sounds, music } = setup(null);
    world.meleeHit(P, 505);
    world.gold();
    world.npcDialog('MaFl_Benku');
    expect(sounds).toEqual([{ id: 4 }]);
    expect(music).toEqual([]);
  });
});

describe('WorldSounds: the events of WorldState and OwnState', () => {
  const movers = new Map([[7, { pos: P, weapon: 505 }], [8, { pos: { x: 1, y: 2, z: 3 }, weapon: null }]]);
  const mover = (id: number) => movers.get(id);

  it('a landed melee hit, a critical DAMAGE and a skill\'s launch, at the attacker', () => {
    const { world, sounds } = setup();
    world.combatEvent({ kind: 'attackerHit', attackerId: 7, victimId: 8, weapon: 505 }, mover);
    world.combatEvent({ kind: 'attackerHit', attackerId: 8, victimId: 7, weapon: null }, mover);
    world.combatEvent({ kind: 'hit', victimId: 8, attackerId: 7, hit: 5, flags: 0x40, attackerInView: true }, mover);
    world.combatEvent({ kind: 'hit', victimId: 8, attackerId: 7, hit: 5, flags: 0, attackerInView: true }, mover);
    world.combatEvent({ kind: 'skillHit', casterId: 7, targetId: 8, skill: 1, landed: true }, mover);
    world.combatEvent({ kind: 'swing', attackerId: 7, targetId: 8 }, mover);
    expect(sounds).toEqual([{ id: 115, at: P }, { id: 119, at: P }, { id: 140, at: P }]);
  });

  it('the own death and level-up', () => {
    const { world, music } = setup();
    world.ownEvent({ kind: 'died' }, 1);
    world.ownEvent({ kind: 'levelUp', from: 1, to: 2, chatLine: true }, 1);
    world.ownEvent({ kind: 'revived' }, 1);
    expect(music).toEqual([[22, 1], [23, 1]]);
  });

  it('a new quest plays BGM_EV_START; an ended or removed one BGM_EV_END (MoverParam.cpp:3495, :3534, :3600)', () => {
    const { world, music } = setup();
    const quest = { id: 151, state: 0, time: 0, kills: [0, 0] as [number, number], patrol: false, dialog: false };
    world.ownEvent({ kind: 'quest', change: { kind: 'started', quest } }, 1);
    world.ownEvent({ kind: 'quest', change: { kind: 'progress', before: quest, after: { ...quest, kills: [1, 0] } } }, 1);
    world.ownEvent({ kind: 'quest', change: { kind: 'ended', quest: { ...quest, state: 14 } } }, 1);
    world.ownEvent({ kind: 'quest', change: { kind: 'removed', questId: 151, cancelled: true } }, 1);
    world.ownEvent({ kind: 'quest', change: { kind: 'listsChanged' } }, 1);
    expect(music).toEqual([[19, 1], [20, 1], [20, 1]]);
  });

  it('a job change plays BGM_IN_LEVELUP (OnSetChangeJob, DPClient.cpp:3638; Piece 7 M2)', () => {
    const { world, music } = setup();
    world.ownEvent({ kind: 'jobChanged', job: 1, title: 'Mercenary' }, 1);
    expect(music).toEqual([[23, 1]]);
  });
});

describe('WorldSounds: flight (Piece 7 M5, MoverEquip.cpp:1804-1821)', () => {
  it('the first flight plays BGM_TH_FLYING, every later one BGM_EV_LIGHTWING', () => {
    const { world, music } = setup();
    world.flightMusic(true);
    world.flightMusic(true);
    world.flightMusic(true);
    expect(music).toEqual([[13, 1], [17, 1], [17, 1]]);
  });
});

describe('WorldSounds: flight music is the own take-off only (MoverEquip.cpp:1808-1821; DoFakeEquip plays none)', () => {
  it("another player's take-off plays nothing", () => {
    const { world, music } = setup();
    world.flightMusic(false);
    expect(music).toEqual([]);
    world.flightMusic(true);
    world.flightMusic(false);
    world.flightMusic(true);
    expect(music).toEqual([[13, 1], [17, 1]]);
  });
});

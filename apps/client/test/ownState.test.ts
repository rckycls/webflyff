import { describe, expect, it } from 'vitest';
import { DstParam, NULL_ID } from '@flyffweb/protocol';
import type { TaskBar, WorldMessage } from '@flyffweb/protocol';
import { newVagrantOwn } from '@flyffweb/testkit';
import { OwnState } from '../src/world/OwnState';
import type { OwnEvent } from '../src/world/OwnState';
import { Dst, FISTS } from '../src/world/sim/params';
import {
  BOOTS, GAUNTLET, OWN_ID, STARTER_EQUIPMENT, SUIT, WOODEN_SWORD, itemProp, newVagrant, ownAdded, ownGameData,
} from './helpers/ownState';

const f32 = Math.fround;

/** The object ID of some other mover in view. */
const OTHER_ID = 77;

// ---- the messages ----------------------------------------------------------------------------------------------------

/** SETEXPERIENCE with the server's defaults: no skill points and `-1` / `0xffff` for the death values (`User.h:494`). */
const setExperience = (exp: bigint, level: number, over: Partial<Extract<WorldMessage, { type: 'setExperience' }>> = {}): WorldMessage => ({
  type: 'setExperience', exp, level, skillLevel: 0, skillPoint: 0, deathExp: -1n, deathLevel: 0xffff, ...over,
});
const setPoint = (param: number, value: number): WorldMessage => ({ type: 'setPointParam', param, value });
const setState = (str: number, sta: number, dex: number, int: number, remainGP: number): WorldMessage => (
  { type: 'setState', str, sta, dex, int, remainGP }
);
const damage = (hit: number): WorldMessage => ({ type: 'damage', attackerId: 20, hit, flags: 1, fly: null });
const death = (): WorldMessage => ({ type: 'moverDeath', attackerId: 20, message: 41 });

/** A TASKBAR with one applet in slot 0. */
const taskBarOf = (id: number): TaskBar => ({
  applets: [{ slot: 0, shortcut: { kind: 1, id, type: 0, index: 0, userId: 0, data: 0, text: '' } }],
  items: [], queue: [], actionPoint: 0,
});

/** The three bars of the own state, as the status window reads them. */
const bars = (own: OwnState): [number, number, number] => [own.hp, own.mp, own.fp];

describe('the own character at the start (a new Vagrant)', () => {
  it('holds the numbers of its ADD_OBJ', () => {
    const own = newVagrant();
    expect(own.objectId).toBe(OWN_ID);
    expect([own.level, own.job]).toEqual([1, 0]);
    expect(own.stats).toEqual({ str: 15, sta: 15, dex: 15, int: 15 });
    expect([own.remainGP, own.exp, own.skillLevel, own.skillPoint]).toEqual([0, 0n, 0, 0]);
    expect([own.deathExp, own.deathLevel]).toEqual([0n, 0]);
    expect(bars(own)).toEqual([230, 63, 32]);
    expect(own.skills).toEqual(newVagrantOwn().skills);
    expect(own.taskBar).toBeNull();
  });

  it('has the maximum HP, MP and FP of the reference table, the EXP text 0.00% and the Wooden Sword speed', () => {
    const own = newVagrant();
    expect([own.maxHp(), own.maxMp(), own.maxFp()]).toEqual([230, 63, 32]);
    expect(own.expText()).toBe('0.00%');
    expect(own.attackSpeed()).toBe(Math.fround(0.085));
  });

  it('keeps the inventory by object ID, with its counts', () => {
    const own = newVagrant();
    expect([...own.inventory!.keys()]).toEqual([0, 1, 2, 42, 43, 44, 45]);
    expect(own.inventory!.get(45)).toEqual({ objectId: 45, itemId: 2800, count: 3 }); // the lollipops
    expect(own.inventory!.get(1)).toEqual({ objectId: 1, itemId: 2801, count: 1 }); // the biscuit
    expect(own.inventoryError).toBeNull();
  });

  it('keeps a broken inventory as null and says why (Ruling R1)', () => {
    const broken = { ...newVagrantOwn(), inventory: null, inventoryError: 'item 3 of 7: need 4 bytes but only 2 remain' };
    const own = new OwnState(ownGameData(), ownAdded(1, broken), STARTER_EQUIPMENT);
    expect(own.inventory).toBeNull();
    expect(own.inventoryError).toBe('item 3 of 7: need 4 bytes but only 2 remain');
    expect(own.stats.str).toBe(15); // the numbers before the inventory are the message's
    expect(own.skills).toHaveLength(45);
  });

  it('copies the skills and the inventory, so the ADD_OBJ stays as it came', () => {
    const added = ownAdded();
    const own = new OwnState(ownGameData(), added, STARTER_EQUIPMENT);
    own.skills[0]!.level = 5;
    own.inventory!.get(45)!.count = 1;
    expect(added.player!.own!.skills[0]).toEqual({ skill: 1, level: 0 });
    expect(added.player!.own!.inventory!.find((item) => item.objectId === 45)!.count).toBe(3);
  });

  it('refuses an ADD_OBJ that is not the own character\'s and a job the table lacks', () => {
    const data = ownGameData();
    const added = ownAdded();
    expect(() => new OwnState(data, { ...added, player: { ...added.player!, own: null } }, [])).toThrow(/own character/);
    expect(() => new OwnState(data, { ...added, player: undefined }, [])).toThrow(/own character/);
    expect(() => new OwnState(data, { ...added, player: { ...added.player!, job: 5 } }, [])).toThrow(/job 5/);
  });
});

describe('what the own character wears (the lobby equipment, slotted as OnPlayerList slots it)', () => {
  it('the Wooden Sword is the weapon and the Cotton suit, gauntlets and boots are the armour', () => {
    const { equipped } = newVagrant();
    expect(equipped.weapon).toBe(WOODEN_SWORD);
    expect(new Set(equipped.armour)).toEqual(new Set([SUIT, GAUNTLET, BOOTS]));
  });

  it('with nothing worn the weapon is none and the speed is the fists\'', () => {
    const own = newVagrant(1, []);
    expect(own.equipped).toEqual({ weapon: null, armour: [] });
    expect(own.attackSpeed()).toBe(FISTS.attackSpeed);
    expect(own.attackSpeed()).toBe(Math.fround(0.07));
  });

  it('a second right-hand weapon moves the first to the left hand, which is no weapon of the right', () => {
    const longSword = itemProp({ id: 23, name: 'Long Sword', kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, attackSpeed: f32(0.1) });
    const data = ownGameData({ itemProps: new Map([WOODEN_SWORD, longSword, SUIT].map((p) => [p.id, p])) });
    const own = newVagrant(1, [21, 23, 502], data);
    expect(own.equipped.weapon).toBe(longSword);
    expect(own.equipped.armour).toContain(WOODEN_SWORD); // still worn, so its parameters still count
    expect(own.attackSpeed()).toBe(f32(0.1));
  });

  it('skips an id the catalog lacks and an item worn nowhere', () => {
    const nowhere = itemProp({ id: 900, name: 'Scroll', part: -1 });
    const data = ownGameData({ itemProps: new Map([WOODEN_SWORD, nowhere].map((p) => [p.id, p])) });
    const own = newVagrant(1, [21, 900, 12345, NULL_ID], data);
    expect(own.equipped).toEqual({ weapon: WOODEN_SWORD, armour: [] });
  });

  it('the worn items\' parameters count in the maxima and the effective stats, not in the base stats', () => {
    const ring = itemProp({ id: 800, name: 'Ring', part: 13, destParams: [Dst.HP_MAX, Dst.STA, Dst.STR], adjParams: [40, 5, 3] });
    const data = ownGameData({ itemProps: new Map([WOODEN_SWORD, SUIT, ring].map((p) => [p.id, p])) });
    const own = newVagrant(1, [21, 502, 800], data);
    expect(own.stats).toEqual({ str: 15, sta: 15, dex: 15, int: 15 }); // m_nStr and the others, as the server sent them
    expect(own.effective()).toEqual({ str: 18, sta: 20, dex: 15, int: 15 });
    // STA 20: HP 280 (verified with the C++ order), +40 from DST_HP_MAX; FP from STA 20
    expect(own.maxHp()).toBe(320);
    expect(own.maxFp()).toBe(42);
    expect(own.maxMp()).toBe(63);
  });

  it('assigning the equipment again takes the new parameters', () => {
    const ring = itemProp({ id: 800, name: 'Ring', part: 13, destParams: [Dst.HP_MAX, -1, -1], adjParams: [40, -1, -1] });
    const own = newVagrant();
    expect(own.maxHp()).toBe(230);
    own.equipped = { weapon: WOODEN_SWORD, armour: [ring] };
    expect(own.maxHp()).toBe(270);
    own.equipped = { weapon: null, armour: [] };
    expect(own.maxHp()).toBe(230);
  });
});

describe('SETEXPERIENCE (CMover::SetExperience, CDPClient::OnSetExperience)', () => {
  it('level 1 to 2 gives one level up, the pattern up of level 2 and a refill to 230 / 63 / 32', () => {
    const own = newVagrant();
    own.hp = 10;
    own.mp = 3;
    own.fp = 0;
    const events = own.apply(setExperience(3n, 2), OWN_ID);
    expect(events).toEqual<OwnEvent[]>([
      { kind: 'levelUp', from: 1, to: 2, chatLine: true },
      { kind: 'patternUp', level: 2 },
      { kind: 'refilled' },
    ]);
    expect(own.level).toBe(2);
    expect(bars(own)).toEqual([230, 63, 32]);
    expect(own.exp).toBe(3n);
    expect(own.expText()).toBe('15.00%'); // 3 of the 20 level 2 needs
  });

  it('a level up that earns skill points ends with the skill point event, as Neuz shows its caption last', () => {
    // the server sends SETEXPERIENCE with the skill points the level gave: +2 at levels 2 to 20, but only while
    // m_nDeathLevel < m_nLevel (AddExperience, MoverParam.cpp:1432-1441)
    const events = newVagrant().apply(setExperience(0n, 2, { skillLevel: 2, skillPoint: 2 }), OWN_ID);
    expect(events).toEqual<OwnEvent[]>([
      { kind: 'levelUp', from: 1, to: 2, chatLine: true },
      { kind: 'patternUp', level: 2 },
      { kind: 'refilled' },
      { kind: 'skillPointUp' },
    ]);
  });

  it('a two-level jump plays one level up', () => {
    const own = newVagrant(3);
    own.hp = 1;
    own.mp = 1;
    own.fp = 1;
    const events = own.apply(setExperience(5n, 5), OWN_ID);
    expect(events).toEqual<OwnEvent[]>([{ kind: 'levelUp', from: 3, to: 5, chatLine: true }, { kind: 'refilled' }]);
    expect(own.level).toBe(5);
    expect(bars(own)).toEqual([234, 65, 34]); // level 5's maxima, not level 3's (231 / 64 / 33)
    expect([own.maxHp(), own.maxMp(), own.maxFp()]).toEqual([234, 65, 34]);
  });

  it.each([
    // the loop of SetExperience stops at the first pattern level a jump crosses, so a jump over two gives one
    [1, 2, 2], [2, 3, null], [7, 8, 8], [8, 9, null], [11, 12, 12], [12, 13, null], [14, 15, null],
    [1, 9, 2], [1, 15, 2], [3, 13, 8], [8, 13, 12], [5, 12, 8], [2, 12, 8],
  ] as const)('level %i to %i: the pattern up is %s', (from, to, pattern) => {
    const events = newVagrant(from).apply(setExperience(0n, to), OWN_ID);
    expect(events.filter((e) => e.kind === 'patternUp')).toEqual(pattern === null ? [] : [{ kind: 'patternUp', level: pattern }]);
    expect(events.filter((e) => e.kind === 'levelUp')).toEqual([{ kind: 'levelUp', from, to, chatLine: true }]);
  });

  it('puts the EXP in first, so the text is the new level\'s bar', () => {
    const own = newVagrant(4);
    own.apply(setExperience(45n, 4), OWN_ID); // 45 of the 90 level 4 needs
    expect(own.expText()).toBe('50.00%');
    own.apply(setExperience(10n, 5), OWN_ID); // 10 of the 152 level 5 needs: 6.57 %
    expect(own.expText()).toBe('6.57%');
  });

  it('a Vagrant at level 15 keeps its EXP at 0', () => {
    const own = newVagrant(14);
    expect(own.apply(setExperience(0n, 15), OWN_ID)).toEqual<OwnEvent[]>([
      { kind: 'levelUp', from: 14, to: 15, chatLine: true }, { kind: 'refilled' },
    ]);
    expect(bars(own)).toEqual([265, 71, 40]);
    // every later kill sends the same level and the 0 the server keeps (AddExperience, MoverParam.cpp:1173-1177)
    expect(own.apply(setExperience(0n, 15), OWN_ID)).toEqual([]);
    expect(own.exp).toBe(0n);
    expect(own.expText()).toBe('0.00%');
  });

  it('the same level only changes the EXP: no event and no refill', () => {
    const own = newVagrant();
    own.hp = 100;
    own.mp = 20;
    expect(own.apply(setExperience(7n, 1), OWN_ID)).toEqual([]);
    expect(own.exp).toBe(7n);
    expect(own.expText()).toBe('50.00%');
    expect(bars(own)).toEqual([100, 20, 32]);
  });

  it('a lower level only changes the level (no event and no refill)', () => {
    const own = newVagrant(5);
    own.hp = 100;
    expect(own.apply(setExperience(0n, 4), OWN_ID)).toEqual([]);
    expect(own.level).toBe(4);
    expect(own.hp).toBe(100);
  });

  it('keeps the skill points, and a rise in them is an event', () => {
    const own = newVagrant();
    expect(own.apply(setExperience(2n, 1, { skillLevel: 4, skillPoint: 4 }), OWN_ID)).toEqual<OwnEvent[]>([{ kind: 'skillPointUp' }]);
    expect([own.skillLevel, own.skillPoint]).toEqual([4, 4]);
    expect(own.apply(setExperience(2n, 1, { skillLevel: 4, skillPoint: 4 }), OWN_ID)).toEqual([]); // the same
    expect(own.apply(setExperience(2n, 1, { skillLevel: 4, skillPoint: 3 }), OWN_ID)).toEqual([]); // spent one
    expect([own.skillLevel, own.skillPoint]).toEqual([4, 3]);
  });

  it('keeps the death values unless the server sends its defaults (-1 and 0xffff)', () => {
    const own = newVagrant();
    own.apply(setExperience(0n, 1, { deathExp: 120n, deathLevel: 9 }), OWN_ID);
    expect([own.deathExp, own.deathLevel]).toEqual([120n, 9]);
    own.apply(setExperience(0n, 1), OWN_ID); // deathExp -1n and deathLevel 0xffff: no new value
    expect([own.deathExp, own.deathLevel]).toEqual([120n, 9]);
    own.apply(setExperience(0n, 1, { deathExp: 0n, deathLevel: 0 }), OWN_ID);
    expect([own.deathExp, own.deathLevel]).toEqual([0n, 0]);
  });

  describe('the level-up chat line (TID_GAME_LEVELUP) is decided before the death level of the same message is stored', () => {
    // SetExperience tests `m_nDeathLevel < nLevel` (MoverParam.cpp:1729); OnSetExperience stores the death level after
    // it (DPClient.cpp:3389-3393). A GM's /level (CMover::SetLevel, Mover.cpp:1826-1837) sends deathLevel = level - 1.
    const chatLineOf = (events: OwnEvent[]): boolean | undefined => {
      const up = events.find((e) => e.kind === 'levelUp');
      return up?.kind === 'levelUp' ? up.chatLine : undefined;
    };

    it('is due when the death level it replaces is below the new level, whatever the message brings with it', () => {
      const own = newVagrant(); // death level 0
      expect(chatLineOf(own.apply(setExperience(0n, 5, { deathLevel: 9 }), OWN_ID))).toBe(true); // 0 < 5, though 9 is not
      expect(own.deathLevel).toBe(9); // stored after
    });

    it('is not due when the death level it replaces is not below the new level, whatever the message brings with it', () => {
      const own = newVagrant(5);
      own.apply(setExperience(0n, 5, { deathLevel: 9 }), OWN_ID); // died at level 9 once
      // a GM's /level 7 sends death level 6, which is below 7 once stored; the 9 it replaces is not
      expect(chatLineOf(own.apply(setExperience(0n, 7, { deathLevel: 6 }), OWN_ID))).toBe(false);
      expect(own.deathLevel).toBe(6);
    });

    it('is due while the death level is below the new level and not when it equals it', () => {
      const own = newVagrant(5);
      own.apply(setExperience(0n, 5, { deathLevel: 6 }), OWN_ID);
      expect(chatLineOf(own.apply(setExperience(0n, 6), OWN_ID))).toBe(false); // 6 < 6 is false
      expect(chatLineOf(own.apply(setExperience(0n, 7), OWN_ID))).toBe(true); // 6 < 7
    });
  });
});

describe('SETSTATE (CDPClient::OnSetState)', () => {
  it('sets the stats and the stat points and shows full bars at the new maxima', () => {
    const own = newVagrant(15);
    own.apply(setPoint(DstParam.HP, 50), OWN_ID);
    own.mp = 1;
    own.fp = 1;
    own.remainGP = 28;
    // 30 points into STA, as the reference table has it: HP 581, FP 103, MP unchanged
    const events = own.apply(setState(15, 45, 15, 15, 0), OWN_ID);
    expect(events).toEqual<OwnEvent[]>([{ kind: 'statsChanged' }, { kind: 'refilled' }]);
    expect(own.stats).toEqual({ str: 15, sta: 45, dex: 15, int: 15 });
    expect(own.remainGP).toBe(0);
    expect(bars(own)).toEqual([581, 71, 103]);
    expect([own.maxHp(), own.maxMp(), own.maxFp()]).toEqual([581, 71, 103]);
  });

  it('INT 20 raises MP to 85 and leaves HP and FP', () => {
    const own = newVagrant(15);
    own.apply(setState(15, 15, 15, 20, 23), OWN_ID);
    expect(bars(own)).toEqual([265, 85, 40]);
    expect(own.remainGP).toBe(23);
  });

  it('takes no object ID: Neuz applies it to the own player whatever the message names', () => {
    const own = newVagrant();
    expect(own.apply(setState(16, 15, 15, 15, 1), OTHER_ID)).toEqual<OwnEvent[]>([
      { kind: 'statsChanged' }, { kind: 'refilled' },
    ]);
    expect(own.stats.str).toBe(16);
  });
});

describe('SET_GROWTH_LEARNING_POINT (CDPClient::OnSetGrowthLearningPoint)', () => {
  it('sets the stat points and changes nothing else', () => {
    const own = newVagrant();
    own.hp = 100;
    expect(own.apply({ type: 'setGrowthLearningPoint', remainGP: 2 }, OWN_ID)).toEqual([]);
    expect(own.remainGP).toBe(2);
    expect(own.hp).toBe(100);
    expect(own.stats).toEqual({ str: 15, sta: 15, dex: 15, int: 15 });
  });
});

describe('SETPOINTPARAM (CMover::SetPointParam)', () => {
  it('HP clamps to the maximum, and to 0 below it', () => {
    const own = newVagrant();
    own.hp = 100;
    expect(own.apply(setPoint(DstParam.HP, 500), OWN_ID)).toEqual([]);
    expect(own.hp).toBe(230);
    own.apply(setPoint(DstParam.HP, 46), OWN_ID);
    expect(own.hp).toBe(46);
    own.apply(setPoint(DstParam.HP, -5), OWN_ID);
    expect(own.hp).toBe(0);
  });

  it('MP and FP clamp the same way', () => {
    const own = newVagrant();
    own.apply(setPoint(DstParam.MP, 999), OWN_ID);
    own.apply(setPoint(DstParam.FP, 12), OWN_ID);
    expect([own.mp, own.fp]).toEqual([63, 12]);
    own.apply(setPoint(DstParam.MP, -1), OWN_ID);
    own.apply(setPoint(DstParam.FP, 33), OWN_ID);
    expect([own.mp, own.fp]).toEqual([0, 32]);
  });

  it('clamps to the maximum of the stats it has now', () => {
    const own = newVagrant(15);
    own.apply(setState(15, 45, 15, 15, 0), OWN_ID);
    own.apply(setPoint(DstParam.HP, 600), OWN_ID);
    expect(own.hp).toBe(581);
  });

  it('leaves a parameter that is not HP, MP or FP alone (penya is not kept here)', () => {
    const own = newVagrant();
    own.hp = 100;
    expect(own.apply(setPoint(10000, 5000), OWN_ID)).toEqual([]);
    expect(bars(own)).toEqual([100, 63, 32]);
  });
});

describe('DAMAGE (CDPClient::OnDamage)', () => {
  it('takes the hit off the HP, at least to 1 (a hit never kills here: MOVERDEATH does)', () => {
    const own = newVagrant();
    expect(own.apply(damage(30), OWN_ID)).toEqual([]);
    expect(own.hp).toBe(200);
    own.apply(damage(500), OWN_ID);
    expect(own.hp).toBe(1); // IncHitPoint( -500 ) clamps to 0, OnDamage bumps it to 1
  });
});

describe('MOVERDEATH, REVIVAL and REVIVAL_TO_LODESTAR', () => {
  it('MOVERDEATH empties the HP and says the own character died', () => {
    const own = newVagrant();
    expect(own.apply(death(), OWN_ID)).toEqual<OwnEvent[]>([{ kind: 'died' }]);
    expect(own.hp).toBe(0);
    expect([own.mp, own.fp]).toEqual([63, 32]);
  });

  it('REVIVAL says it came back and leaves the bars to the SETPOINTPARAM that follows', () => {
    const own = newVagrant();
    own.apply(death(), OWN_ID);
    expect(own.apply({ type: 'revival' }, OWN_ID)).toEqual<OwnEvent[]>([{ kind: 'revived' }]);
    expect(own.hp).toBe(0); // OnRevival's HP lines are under __VER < 9
    own.apply(setPoint(DstParam.HP, 46), OWN_ID);
    expect(own.hp).toBe(46);
  });

  it.each([
    // HP = max * rate / 10 (int), from 0; MP and FP rise to it: 8 / 6 / 5 / 4 / 3 tenths for level 1 / 2 / 3-5 / 6-10 / 11-15
    [1, 184, 50, 25], [2, 138, 37, 19], [5, 117, 32, 17], [6, 94, 26, 14], [10, 98, 27, 14], [11, 74, 20, 11],
    [15, 79, 21, 12],
  ])('REVIVAL_TO_LODESTAR at level %i gives %i / %i / %i from empty bars', (level, hp, mp, fp) => {
    const own = newVagrant(level);
    own.apply(death(), OWN_ID);
    own.mp = 0;
    own.fp = 0;
    expect(own.apply({ type: 'revivalToLodestar' }, OWN_ID)).toEqual<OwnEvent[]>([{ kind: 'revived' }]);
    expect(bars(own)).toEqual([hp, mp, fp]);
  });

  it('REVIVAL_TO_LODESTAR raises MP and FP only when they are lower', () => {
    const own = newVagrant();
    own.apply(death(), OWN_ID);
    own.mp = 60; // above 50
    own.fp = 10; // below 25
    own.apply({ type: 'revivalToLodestar' }, OWN_ID);
    expect(bars(own)).toEqual([184, 60, 25]);
    // then the server's SETPOINTPARAMs of 20 % overwrite them
    own.apply(setPoint(DstParam.HP, 46), OWN_ID);
    expect(own.hp).toBe(46);
  });
});

describe('TASKBAR (CDPClient::OnTaskBar)', () => {
  it('replaces the shortcut bars, and takes no object ID', () => {
    const own = newVagrant();
    const first = taskBarOf(400);
    expect(own.apply({ type: 'taskBar', taskBar: first }, OWN_ID)).toEqual([]);
    expect(own.taskBar).toBe(first);
    const second = taskBarOf(401);
    own.apply({ type: 'taskBar', taskBar: second }, OTHER_ID);
    expect(own.taskBar).toBe(second);
  });
});

describe('messages that are not about the own character', () => {
  const snapshot = (own: OwnState): unknown => [
    own.level, own.stats, own.remainGP, own.hp, own.mp, own.fp, own.exp, own.skillPoint, own.taskBar,
  ];
  const aboutOthers: [string, WorldMessage][] = [
    ['SETPOINTPARAM', setPoint(DstParam.HP, 1)],
    ['SETEXPERIENCE', setExperience(5n, 9, { skillPoint: 9 })],
    ['SET_GROWTH_LEARNING_POINT', { type: 'setGrowthLearningPoint', remainGP: 9 }],
    ['DAMAGE', damage(100)],
    ['MOVERDEATH', death()],
    ['REVIVAL', { type: 'revival' }],
    ['REVIVAL_TO_LODESTAR', { type: 'revivalToLodestar' }],
  ];

  it.each(aboutOthers)('%s for another mover changes nothing and plays nothing', (_name, message) => {
    const own = newVagrant();
    const before = snapshot(own);
    expect(own.apply(message, OTHER_ID)).toEqual([]);
    expect(snapshot(own)).toEqual(before);
  });

  it('applies the same messages when they name the own mover', () => {
    const own = newVagrant();
    const events = aboutOthers.flatMap(([, message]) => own.apply(message, OWN_ID));
    expect(events.map((e) => e.kind)).toEqual([
      'levelUp', 'patternUp', 'refilled', 'skillPointUp', 'died', 'revived', 'revived',
    ]);
    expect([own.level, own.remainGP, own.skillPoint]).toEqual([9, 9, 9]);
  });

  it('does not take a message with no object ID for the own one: a monster\'s DAMAGE is not the player\'s', () => {
    // apply( message, objectId ) needs the ID; a caller that leaves it out (undefined at run time) gets the message ignored
    const own = newVagrant();
    // @ts-expect-error the object ID is not optional
    expect(own.apply(damage(100))).toEqual([]);
    expect(own.hp).toBe(230);
  });

  it('the level of a mover in view (SETLEVEL, never sent to the player itself) and the other kinds are ignored', () => {
    const own = newVagrant();
    const before = snapshot(own);
    expect(own.apply({ type: 'setLevel', level: 9 }, OWN_ID)).toEqual([]);
    expect(own.apply({ type: 'definedText', textId: 5, args: '' }, OWN_ID)).toEqual([]);
    expect(own.apply({ type: 'meleeAttack', message: 29, targetId: 3, param2: 0, param3: 0 }, OWN_ID)).toEqual([]);
    expect(own.apply({ type: 'delObj' }, OWN_ID)).toEqual([]);
    expect(snapshot(own)).toEqual(before);
  });
});

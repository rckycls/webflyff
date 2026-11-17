import { describe, expect, it } from 'vitest';
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { AutoPlay } from '../src/world/autoplay/controller';
import type { AutoPlayHooks } from '../src/world/autoplay/controller';
import type { Gauges } from '../src/world/autoplay/potions';
import { defaultSettings } from '../src/world/autoplay/settings';
import type { AutoPlaySettings } from '../src/world/autoplay/settings';
import type { TargetMover } from '../src/world/autoplay/targets';

const HP_POT = 1001;
const US = 1;

type Mob = { -readonly [K in keyof TargetMover]: TargetMover[K] } & { pos: Vec3 };

function mob(objectId: number, x: number, z: number): Mob {
  const pos: Vec3 = [x, 0, z];
  return { objectId, kind: 'monster', hp: 100, maxHp: 100, flying: false, dest: null, act: { body: { pos } }, pos };
}

/** Fake hooks around a little world state the tests change. */
function world() {
  const selfPos: Vec3 = [0, 0, 0];
  const state = {
    now: 0,
    worldId: 1,
    inDuel: false,
    alive: true,
    flying: false,
    wand: false,
    bagFull: false,
    gauges: { hp: 1000, maxHp: 1000, mp: 500, maxMp: 500, fp: 300, maxFp: 300 } as Gauges,
    inventory: new Map<number, InventoryItem>([[10, { objectId: 10, itemId: HP_POT, count: 3 }]]),
    self: { objectId: US, kind: 'player', hp: 1000, maxHp: 1000, flying: false, dest: null, act: { body: { pos: selfPos } } } as TargetMover,
    selfPos,
    mobs: [] as Mob[],
    items: new Set<number>(),
    focus: null as number | null,
    used: [] as number[],
    said: [] as string[],
    saved: [] as AutoPlaySettings[],
    engaged: [] as number[],
    walks: [] as Vec3[],
    picks: [] as number[],
    wandHolds: [] as boolean[],
    alerts: 0,
    titles: [] as string[],
    actionSlot: true,
    chainBusy: false,
    slots: 0,
    skills: [] as number[],
    buffs: [] as Array<{ buffType: number; id: number; level: number; leftMs: number; totalMs: number }>,
    standing: true,
    awake: [] as boolean[],
    disengages: 0,
    throwMovers: false,
    kinds: new Map<number, number>(),
    blockedIds: new Set<number>(),
    partner: null as null | { objectId: number; hp: number; maxHp: number; pos: Vec3; dead: boolean; buffs: Array<{ buffType: number; id: number; level: number; leftMs: number; totalMs: number }> },
    casts: [] as Array<[number, number]>,
    follows: [] as number[],
    left: null as number | null,
    usageTicks: 0,
    usageMs: [] as number[],
  };
  const hooks: AutoPlayHooks = {
    now: () => state.now,
    worldId: () => state.worldId,
    inDuel: () => state.inDuel,
    alive: () => state.alive,
    gauges: () => state.gauges,
    inventory: () => state.inventory,
    cooldownLeft: () => 0,
    useItem: (objectId) => { state.used.push(objectId); return true; },
    say: (text) => { state.said.push(text); },
    save: (s) => { state.saved.push(structuredClone(s)); },
    self: () => state.self,
    movers: () => { if (state.throwMovers) throw new Error('boom'); return state.mobs; },
    rankOf: () => 1,
    attackable: (m) => m.hp > 0,
    isPlayer: (id) => id === US || id >= 900,
    partyIds: () => new Set(),
    flying: () => state.flying,
    engage: (id) => { state.engaged.push(id); state.focus = id; },
    focusId: () => state.focus,
    walkTo: (pos) => { state.walks.push([...pos] as Vec3); },
    pick: (id) => { state.picks.push(id); return true; },
    itemThere: (id) => state.items.has(id),
    bagFull: () => state.bagFull,
    holdsWand: () => state.wand,
    wandHold: (on) => { state.wandHolds.push(on); },
    alert: () => { state.alerts++; },
    flashTitle: (reason) => { state.titles.push(reason); },
    actionSlotHasSkills: () => state.actionSlot,
    chainBusy: () => state.chainBusy,
    useActionSlot: () => { state.slots++; },
    useSkill: (i) => { state.skills.push(i); },
    skillKnown: (i) => i !== 99,
    skillCostOk: () => true,
    skillCooldownMs: () => 5000,
    buffs: () => state.buffs,
    standing: () => state.standing,
    buffSkillId: (i) => 100 + i,
    keepAwake: (on) => { state.awake.push(on); },
    disengage: () => { state.disengages++; state.focus = null; },
    indexOf: (m) => state.kinds.get(m.objectId) ?? 0,
    lineBlocked: (m) => state.blockedIds.has(m.objectId),
    partner: (playerId) => (playerId === 501 ? state.partner : null),
    castOn: (skillIndex, objectId) => { state.casts.push([skillIndex, objectId]); },
    follow: (objectId) => { state.follows.push(objectId); },
    resurrectSkill: () => 9,
    usageLeftMin: () => state.left,
    usageTick: (ms) => { state.usageTicks++; state.usageMs.push(ms); },
  };
  return { state, hooks };
}

/** The hunting area centred where Start was pressed (the bot walks back to it), as before 2026-11-18. */
function startPoint(): AutoPlaySettings {
  const s = defaultSettings();
  s.farm.center = 'start';
  return s;
}

function potsOn(): AutoPlaySettings {
  const s = defaultSettings();
  s.pots.enabled = true;
  s.pots.rows.hp.itemIndex = HP_POT;
  return s;
}

/** Runs `steps` rules steps of 1000/60 ms. */
function run(play: AutoPlay, state: ReturnType<typeof world>['state'], steps: number): void {
  for (let i = 0; i < steps; i++) {
    state.now += 1000 / 60;
    play.step();
  }
}

describe('AutoPlay controller: auto pots (custom, owner 2026-11-15)', () => {
  it('pots on, HP low → useItem with the stack id', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    expect(state.used).toEqual([10]);
  });

  it('paces: two steps in a row use one item', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    state.now = 16;
    play.step();
    expect(state.used).toEqual([10]);
    state.now = 816;
    play.step();
    expect(state.used).toEqual([10, 10]);
  });

  it('pots off → nothing', () => {
    const { state, hooks } = world();
    const s = potsOn(); s.pots.enabled = false;
    const play = new AutoPlay(hooks, s);
    state.gauges = { ...state.gauges, hp: 300 };
    play.step();
    expect(state.used).toEqual([]);
  });

  it('dead → nothing', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 0 };
    state.alive = false;
    play.step();
    expect(state.used).toEqual([]);
  });

  it('world 208 → nothing; in a duel → nothing', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.gauges = { ...state.gauges, hp: 300 };
    state.worldId = 208;
    play.step();
    state.worldId = 1;
    state.inDuel = true;
    play.step();
    expect(state.used).toEqual([]);
  });

  it('count 0 → one "no HP items left" line, not repeated each step; again after a refill runs out', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    state.inventory = new Map();
    play.step();
    play.step();
    expect(state.said).toEqual(['Auto pots: no HP items left.']);
    state.inventory = new Map([[11, { objectId: 11, itemId: HP_POT, count: 1 }]]);
    play.step();
    state.inventory = new Map();
    play.step();
    expect(state.said).toEqual(['Auto pots: no HP items left.', 'Auto pots: no HP items left.']);
  });

  it('saved() hands the current settings to the save hook', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    play.settings.pots.rows.hp.below = 70;
    play.saved();
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]!.pots.rows.hp.below).toBe(70);
  });
});

describe('AutoPlay controller: the farm bot (spec 6.2-6.5, 6.8)', () => {
  it('start in 208 → false, with the stop line; flying → false', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    state.worldId = 208;
    expect(play.start()).toBe(false);
    expect(state.said).toEqual(['Auto Play stopped: not allowed here.']);
    state.worldId = 1;
    state.flying = true;
    expect(play.start()).toBe(false);
    expect(play.farm).toBe('off');
  });

  it('start engages the nearest monster', () => {
    const { state, hooks } = world();
    state.mobs = [mob(20, 8, 0), mob(21, 3, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    expect(play.start()).toBe(true);
    expect(state.said).toEqual(['Auto Play started.']);
    run(play, state, 1);
    expect(state.engaged).toEqual([21]);
    expect(play.phase).toBe('fighting');
  });

  it('a kill → engages the next', () => {
    const { state, hooks } = world();
    const first = mob(21, 3, 0), second = mob(20, 8, 0);
    state.mobs = [first, second];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    first.hp = 0;
    state.mobs = [second];
    play.onEvent({ kind: 'kill', targetId: 21, pos: first.pos });
    run(play, state, 2);
    expect(state.engaged).toEqual([21, 20]);
  });

  it('a target that leaves the radius mid-fight is still fought (Review Focus 1)', () => {
    const { state, hooks } = world();
    const runner = mob(21, 3, 0);
    state.mobs = [runner, mob(22, 10, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    runner.pos[0] = 25;
    play.onEvent({ kind: 'hit', attackerId: US, victimId: 21 });
    run(play, state, 60);
    expect(new Set(state.engaged)).toEqual(new Set([21]));
  });

  it('no target and 4 m from the anchor → walks back to it', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, startPoint());
    play.start();
    state.selfPos[0] = 4;
    run(play, state, 40);
    expect(state.walks[0]).toEqual([0, 0, 0]);
    expect(play.phase).toBe('returning');
  });

  it('a cleared walk (the tab hidden: stopOwnMover) is sent again within a second (Review Focus 5)', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, startPoint());
    play.start();
    state.selfPos[0] = 6;
    run(play, state, 30);
    expect(state.walks).toHaveLength(1);
    run(play, state, 61);
    expect(state.walks).toHaveLength(2);
  });

  it('5 s without an attack of ours → another target (owner 2026-11-17)', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0), mob(22, 9, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 5 - 5);
    expect(state.engaged.at(-1)).toBe(21);
    run(play, state, 10);
    expect(state.engaged.at(-1)).toBe(22);
  });

  it('our hit, swing or skill on the target starts the 5 s again', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0), mob(22, 9, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 4);
    play.onEvent({ kind: 'hit', attackerId: US, victimId: 21 });
    run(play, state, 60 * 3);
    play.onEvent({ kind: 'swing', attackerId: US, targetId: 21 });
    run(play, state, 60 * 3);
    play.onEvent({ kind: 'skillOk', skillIndex: 3 });
    run(play, state, 60 * 3);
    expect(new Set(state.engaged)).toEqual(new Set([21]));
    run(play, state, 60 * 3);
    expect(state.engaged.at(-1)).toBe(22);
  });

  it('3 stuck in a row → walks back to the anchor', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0), mob(22, 6, 0), mob(23, 9, 0), mob(24, 12, 0)];
    const play = new AutoPlay(hooks, startPoint());
    play.start();
    state.selfPos[0] = 5;
    run(play, state, 61 * 16);
    expect(state.walks.some((w) => w[0] === 0 && w[1] === 0 && w[2] === 0)).toBe(true);
  });

  it('an item 2 m from our kill 1 s later is picked; one there 2 s before the kill is not', () => {
    const { state, hooks } = world();
    const m = mob(21, 3, 0);
    state.mobs = [m];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    play.onEvent({ kind: 'itemAppeared', id: 50, pos: [3, 0, 1] });
    state.items.add(50);
    run(play, state, 120);
    m.hp = 0;
    state.mobs = [];
    play.onEvent({ kind: 'kill', targetId: 21, pos: m.pos });
    run(play, state, 60);
    play.onEvent({ kind: 'itemAppeared', id: 51, pos: [4, 0, 1] });
    state.items.add(51);
    run(play, state, 2);
    expect(state.picks).toEqual([51]);
    expect(play.phase).toBe('looting');
  });

  it('pickRefused → the next item', () => {
    const { state, hooks } = world();
    const m = mob(21, 3, 0);
    state.mobs = [m];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    m.hp = 0;
    state.mobs = [];
    play.onEvent({ kind: 'kill', targetId: 21, pos: m.pos });
    for (const id of [51, 52]) { play.onEvent({ kind: 'itemAppeared', id, pos: [3, 0, 0] }); state.items.add(id); }
    run(play, state, 2);
    expect(play.lootingId).toBe(51);
    play.onEvent({ kind: 'pickRefused', id: 51 });
    run(play, state, 2);
    expect(state.picks).toEqual([51, 52]);
  });

  it('bag full → no pick, still engages', () => {
    const { state, hooks } = world();
    const m = mob(21, 3, 0);
    state.mobs = [m];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    m.hp = 0;
    play.onEvent({ kind: 'bagFull' });
    state.bagFull = true;
    play.onEvent({ kind: 'kill', targetId: 21, pos: m.pos });
    play.onEvent({ kind: 'itemAppeared', id: 51, pos: [3, 0, 0] });
    state.items.add(51);
    state.mobs = [mob(22, 6, 0)];
    run(play, state, 2);
    expect(state.picks).toEqual([]);
    expect(state.engaged).toEqual([21, 22]);
    expect(play.bagIsFull).toBe(true);
  });

  it('died → stopped, "you died", one line, the alert and the title', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    play.onEvent({ kind: 'died' });
    play.onEvent({ kind: 'died' });
    expect(play.farm).toBe('stopped');
    expect(play.lastStop).toBe('you died');
    expect(state.said).toEqual(['Auto Play started.', 'Auto Play stopped: you died.']);
    expect([state.alerts, state.titles]).toEqual([1, ['you died']]);
  });

  it('stop after 60 min → "time limit" at 60 min', () => {
    const { state, hooks } = world();
    const s = defaultSettings();
    s.farm.stopAfterMin = 60;
    const play = new AutoPlay(hooks, s);
    play.start();
    state.now = 59 * 60_000;
    play.step();
    expect(play.farm).toBe('running');
    state.now = 60 * 60_000;
    play.step();
    expect(play.lastStop).toBe('time limit');
  });

  it('HP 15 % with no HP item → "low HP, no potions"; with potions on and in stock it goes on', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, potsOn());
    play.start();
    state.gauges = { ...state.gauges, hp: 150 };
    play.step();
    expect(play.farm).toBe('running');
    state.inventory = new Map();
    play.step();
    expect(play.lastStop).toBe('low HP, no potions');
  });

  it('the screen is kept on while the farm bot runs (spec 6.10)', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    play.stop('time limit');
    expect(state.awake).toEqual([true, false]);
  });

  it('a wand is held on a target and let go at the stop', () => {
    const { state, hooks } = world();
    state.wand = true;
    state.actionSlot = false;
    state.mobs = [mob(21, 3, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 3);
    play.stop('you took control');
    expect(state.wandHolds).toEqual([true, false]);
  });
});

describe('AutoPlay controller: auto skills and buffs (spec 6.4, 6.7)', () => {
  function fighting(settings = defaultSettings()) {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0)];
    const play = new AutoPlay(hooks, settings);
    play.start();
    run(play, state, 1);
    return { state, play };
  }

  it('a ready skill goes before the Action Slot; then the Action Slot', () => {
    const s = defaultSettings();
    s.skills.ready = [7];
    const { state, play } = fighting(s);
    run(play, state, 61);
    expect(state.skills).toEqual([7]);
    play.onEvent({ kind: 'skillOk', skillIndex: 7 });
    run(play, state, 70);
    expect(state.slots).toBe(1);
  });

  it('the Action Slot is not fired while the chain runs, and again 1 s after it ended', () => {
    const { state, play } = fighting();
    run(play, state, 61);
    expect(state.slots).toBe(1);
    state.chainBusy = true;
    run(play, state, 200);
    expect(state.slots).toBe(1);
    state.chainBusy = false;
    play.onEvent({ kind: 'hit', attackerId: US, victimId: 21 }); // the chain's skills land (the 5 s rule, 2026-11-17)
    play.onEvent({ kind: 'chainEnded' });
    run(play, state, 50);
    expect(state.slots).toBe(1);
    run(play, state, 20);
    expect(state.slots).toBe(2);
  });

  it('Use Action Slot off → only auto attack', () => {
    const s = defaultSettings();
    s.skills.actionSlot = false;
    const { state, play } = fighting(s);
    run(play, state, 300);
    expect([state.slots, state.skills]).toEqual([0, []]);
  });

  it('a buff is cast between fights, not while a monster hits us', () => {
    const { state, hooks } = world();
    const s = defaultSettings();
    s.skills.buffs = [{ kind: 'skill', index: 4 }];
    const play = new AutoPlay(hooks, s);
    play.start();
    play.onEvent({ kind: 'hit', attackerId: 30, victimId: US });
    run(play, state, 2);
    expect(state.skills).toEqual([]);
    state.now += 6000;
    run(play, state, 2);
    expect(state.skills).toEqual([4]);
    expect(play.phase).toBe('buffing');
    state.buffs = [{ buffType: 1, id: 104, level: 1, leftMs: 60_000, totalMs: 60_000 }];
    run(play, state, 200);
    expect(state.skills).toEqual([4]);
  });

  it('a buff waits while the player moves', () => {
    const { state, hooks } = world();
    const s = defaultSettings();
    s.skills.buffs = [{ kind: 'skill', index: 4 }];
    const play = new AutoPlay(hooks, s);
    play.start();
    state.standing = false;
    run(play, state, 10);
    expect(state.skills).toEqual([]);
  });
});

describe('AutoPlay in a hidden tab (spec 6.10): the rules step from the worker clock, not from frames', () => {
  it('worker pulses alone (no frame) keep the farm bot engaging, kill after kill; the saver stops only the drawing', async () => {
    const { SimulationClock } = await import('../src/world/simulationClock');
    const { SaverScreen } = await import('../src/world/hud/autoPlay/saverScreen');
    const { state, hooks } = world();
    const first = mob(21, 3, 0), second = mob(22, 6, 0);
    state.mobs = [first, second];
    const play = new AutoPlay(hooks, defaultSettings());
    let pulse: (() => void) | null = null, clockNow = 0, drawing = true;
    const saver = new SaverScreen(play, { isPhone: () => false, gauges: () => state.gauges, onShow: (shown) => { drawing = !shown; } }, {
      createElement: () => ({ append() {}, addEventListener() {}, setAttribute() {}, style: {}, dataset: {}, className: '', hidden: true, textContent: '' }),
    } as unknown as Document);
    const clock = new SimulationClock((steps) => {
      for (let i = 0; i < steps; i++) { state.now += 1000 / 60; play.step(); saver.step(state.now); }
    }, () => false, () => ({ addEventListener: (_type, listener) => { pulse = listener; }, terminate: () => {} }), () => clockNow);
    play.start();
    saver.show();
    expect(drawing).toBe(false);
    for (let i = 0; i < 10; i++) { clockNow += 50; pulse!(); }
    expect(state.engaged).toEqual([21]);
    first.hp = 0;
    state.mobs = [second];
    play.onEvent({ kind: 'kill', targetId: 21, pos: first.pos });
    for (let i = 0; i < 10; i++) { clockNow += 50; pulse!(); }
    expect(state.engaged).toEqual([21, 22]);
    expect(play.farm).toBe('running');
    clock.dispose();
  });
});

describe('AutoPlay controller: the review fixes (2026-11-15)', () => {
  it('dispose (log out, a world gone) lets the screen sleep again, without a chat line', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    play.dispose();
    expect(state.awake).toEqual([true, false]);
    expect(state.said).toEqual(['Auto Play started.']);
    expect(play.farm).toBe('off');
  });

  it('a stuck target is let go (the V15 auto attack no longer chases it), and so before walking home', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0)];
    const play = new AutoPlay(hooks, startPoint());
    play.start();
    run(play, state, 61 * 10);
    expect(state.disengages).toBe(1);
    expect(play.phase).not.toBe('fighting');
    state.focus = 21;
    state.selfPos[0] = 30;
    run(play, state, 2);
    expect(state.disengages).toBe(2);
    expect(state.walks.at(-1)).toEqual([0, 0, 0]);
  });

  it('a wand is not held again while a fired Action Slot waits for its answer (a press would drop it)', () => {
    const { state, hooks } = world();
    state.wand = true;
    state.mobs = [mob(21, 3, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 3);
    expect(state.slots).toBe(1);
    run(play, state, 120);
    expect(state.wandHolds).toEqual([]);
    play.onEvent({ kind: 'chainEnded' });
    run(play, state, 30);
    expect(state.wandHolds).toEqual([]);
    state.chainBusy = true;
    run(play, state, 60);
    expect(state.wandHolds).toEqual([]);
  });

  it('a buff item is used once, the bot does not stand for it, and one whose buff never shows is skipped with a line', () => {
    const { state, hooks } = world();
    const s = defaultSettings();
    s.skills.buffs = [{ kind: 'item', index: 2001 }];
    state.inventory = new Map([[40, { objectId: 40, itemId: 2001, count: 5 }]]);
    const play = new AutoPlay(hooks, s);
    play.start();
    run(play, state, 2);
    expect(state.used).toEqual([40]);
    run(play, state, 30);
    expect(play.phase).not.toBe('buffing');
    run(play, state, 200);
    expect(state.said).toContain('Auto Play: a buff item showed no buff, so it is skipped.');
    run(play, state, 1200);
    expect(state.used).toEqual([40]);
  });

  it('a buff item whose buff shows is used again only when it runs low', () => {
    const { state, hooks } = world();
    const s = defaultSettings();
    s.skills.buffs = [{ kind: 'item', index: 2001 }];
    state.inventory = new Map([[40, { objectId: 40, itemId: 2001, count: 5 }]]);
    const play = new AutoPlay(hooks, s);
    play.start();
    run(play, state, 2);
    state.buffs = [{ buffType: 3, id: 2001, level: 1, leftMs: 600_000, totalMs: 600_000 }];
    run(play, state, 600);
    expect(state.used).toEqual([40]);
    expect(state.said.some((line) => line.includes('skipped'))).toBe(false);
  });

  it('an error inside Auto Play stops it ("error") and never reaches the game\'s rules step', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    state.throwMovers = true;
    expect(() => play.step()).not.toThrow();
    expect(play.lastStop).toBe('error');
    expect(() => play.step()).not.toThrow();
  });
});

describe('AutoPlay controller: obstacles and the owner\'s options (2026-11-17)', () => {
  it('blocked on the way (no step closer and no attack for 1.5 s, still far): a side step, then at it again', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 10, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 85);
    expect(state.walks).toEqual([]);
    run(play, state, 10);
    expect(state.disengages).toBe(1);
    expect(state.walks).toHaveLength(1);
    const [x, , z] = state.walks[0]!;
    expect(Math.abs(x)).toBeLessThan(0.01);
    expect(Math.abs(Math.abs(z) - 4)).toBeLessThan(0.01);
    run(play, state, 60);
    expect(state.engaged).toEqual([21]);
    run(play, state, 30);
    expect(state.engaged).toEqual([21, 21]);
  });

  it('no side step while close (within 4 m): only the 5 s rule', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0)];
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 4);
    expect(state.walks).toEqual([]);
  });

  it('a monster behind an obstacle gives way to a clear one', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0), mob(22, 9, 0)];
    state.blockedIds.add(21);
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 1);
    expect(state.engaged).toEqual([22]);
  });

  it('only the chosen kinds; Avoid giants off lets a giant be chosen', () => {
    const { state, hooks } = world();
    state.mobs = [mob(21, 3, 0), mob(22, 9, 0)];
    state.kinds.set(21, 100).set(22, 200);
    const s = defaultSettings();
    s.farm.only = [200];
    const play = new AutoPlay(hooks, s);
    play.start();
    run(play, state, 1);
    expect(state.engaged).toEqual([22]);
    const giants = world();
    giants.state.mobs = [mob(30, 3, 0)];
    const g = defaultSettings();
    g.farm.avoidGiants = false;
    const rank7 = { ...giants.hooks, rankOf: () => 7 };
    const play2 = new AutoPlay(rank7, g);
    play2.start();
    run(play2, giants.state, 1);
    expect(giants.state.engaged).toEqual([30]);
  });
});

describe('AutoPlay: the farm centre (2026-11-17)', () => {
  it('anchorAt: where Start was pressed while it runs, null otherwise', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    expect(play.anchorAt).toBeNull();
    state.selfPos[0] = 7;
    play.start();
    state.selfPos[0] = 9;
    expect(play.anchorAt).toEqual([7, 0, 0]);
    play.stop('time limit');
    expect(play.anchorAt).toBeNull();
  });
});

describe('AutoPlay controller: Support mode (owner 2026-11-17)', () => {
  const PAL = 77, HEAL = 3, BLESS = 6;
  function support() {
    const w = world();
    w.state.partner = { objectId: PAL, hp: 1000, maxHp: 1000, pos: [2, 0, 0], dead: false, buffs: [{ buffType: 1, id: 106, level: 1, leftMs: 600_000, totalMs: 600_000 }] };
    const s = defaultSettings();
    s.support.partnerPlayerId = 501;
    s.support.partnerName = 'Rocky';
    s.support.heals = [HEAL];
    s.support.buffs = [BLESS];
    const play = new AutoPlay(w.hooks, s);
    return { ...w, play };
  }

  it('refused with no partner, and in the Arena; allowed in an instance dungeon (121)', () => {
    const { state, play } = support();
    play.settings.support.partnerPlayerId = 0;
    expect(play.startSupport()).toBe(false);
    expect(state.said.at(-1)).toBe('Auto Play stopped: no partner.');
    play.settings.support.partnerPlayerId = 501;
    state.worldId = 208;
    expect(play.startSupport()).toBe(false);
    state.worldId = 121;
    expect(play.startSupport()).toBe(true);
    expect(state.said.at(-1)).toBe('Support started.');
    expect(play.mode).toBe('support');
    expect(play.settings.mode).toBe('support');
  });

  it('the partner under 70 % → one heal on them (then waits for the answer)', () => {
    const { state, play } = support();
    play.startSupport();
    state.partner!.hp = 600;
    run(play, state, 30);
    expect(state.casts).toEqual([[HEAL, PAL]]);
  });

  it('a partner buff gone → recast on them; far partner → follow, again each second', () => {
    const { state, play } = support();
    play.startSupport();
    state.partner!.buffs = [];
    run(play, state, 2);
    expect(state.casts).toEqual([[BLESS, PAL]]);
    play.onEvent({ kind: 'skillOk', skillIndex: BLESS });
    state.partner!.buffs = [{ buffType: 1, id: 106, level: 1, leftMs: 600_000, totalMs: 600_000 }];
    state.partner!.pos = [20, 0, 0];
    run(play, state, 120);
    expect(state.follows.length).toBeGreaterThanOrEqual(1);
    expect(state.follows.every((id) => id === PAL)).toBe(true);
    expect(play.phase).toBe('following');
  });

  it('never attacks: a monster near is left alone', () => {
    const { state, play } = support();
    state.mobs = [mob(21, 3, 0)];
    play.startSupport();
    run(play, state, 120);
    expect(state.engaged).toEqual([]);
  });

  it('the partner out of sight 10 s → "partner gone"', () => {
    const { state, play } = support();
    play.startSupport();
    state.partner = null;
    run(play, state, 595);
    expect(play.farm).toBe('running');
    run(play, state, 10);
    expect(play.lastStop).toBe('partner gone');
  });

  it('a whisper from the partner does not stop it; from anyone else it does', () => {
    const { play } = support();
    play.startSupport();
    play.onEvent({ kind: 'whisper', from: 'Rocky' });
    expect(play.farm).toBe('running');
    play.onEvent({ kind: 'whisper', from: 'GM_Ann' });
    expect(play.lastStop).toBe('message from GM_Ann');
  });

  it('startMode: the AUTO button starts the mode last started', () => {
    const { state, play } = support();
    play.startSupport();
    play.stop('you took control');
    expect(play.startMode()).toBe(true);
    expect(play.mode).toBe('support');
    play.stop('you took control');
    state.mobs = [mob(21, 3, 0)];
    play.start();
    play.stop('you took control');
    play.startMode();
    expect(play.mode).toBe('farm');
  });
});

describe('AutoPlay controller: the weekly hours (owner 2026-11-17)', () => {
  it('no hours left this week: the farm bot and Support mode refuse to start', () => {
    const { state, hooks } = world();
    state.left = 0;
    const play = new AutoPlay(hooks, defaultSettings());
    expect(play.start()).toBe(false);
    expect(state.said.at(-1)).toBe('Auto Play stopped: weekly limit reached.');
    play.settings.support.partnerPlayerId = 501;
    expect(play.startSupport()).toBe(false);
  });

  it('a tick a minute while it runs (none while off, none with auto pots alone)', () => {
    const { state, hooks } = world();
    state.left = 600;
    const s = defaultSettings();
    s.pots.enabled = true;
    const play = new AutoPlay(hooks, s);
    run(play, state, 60 * 60 * 3);
    expect(state.usageTicks).toBe(0);
    play.start();
    run(play, state, 60 * 60 * 3 + 2);
    expect(state.usageTicks).toBe(3);
  });

  it('the hours running out mid-run stop it: "weekly limit reached"', () => {
    const { state, hooks } = world();
    state.left = 1;
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 30);
    expect(play.farm).toBe('running');
    state.left = 0;
    run(play, state, 1);
    expect(play.lastStop).toBe('weekly limit reached');
  });

  it('unknown or no limit (null): never held back', () => {
    const { state, hooks } = world();
    state.left = null;
    const play = new AutoPlay(hooks, defaultSettings());
    expect(play.start()).toBe(true);
    run(play, state, 120);
    expect(play.farm).toBe('running');
  });
});

describe('AutoPlay controller: owner bugs of 2026-11-18', () => {
  it('each weekly tick carries the minute it ran; a stop sends the part-minute; nothing for under a second', () => {
    const { state, hooks } = world();
    state.left = 600;
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 90);
    play.stop('you took control');
    expect(state.usageMs.map((ms) => Math.round(ms / 1000))).toEqual([60, 30]);
    run(play, state, 60 * 120);
    expect(state.usageTicks).toBe(2);
    play.start();
    play.stop('you took control');
    expect(state.usageTicks).toBe(2);
  });

  it('the world going (log out, travel) sends the part-minute too', () => {
    const { state, hooks } = world();
    state.left = 600;
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 20);
    play.dispose();
    expect(state.usageMs.map((ms) => Math.round(ms / 1000))).toEqual([20]);
  });

  it('the Time line stops with the bot ("still counting even when stopped")', () => {
    const { state, hooks } = world();
    const play = new AutoPlay(hooks, defaultSettings());
    play.start();
    run(play, state, 60 * 5);
    play.stop('you took control');
    run(play, state, 60 * 60);
    expect(play.stats.lines(state.now)[0]).toBe('Time 5s');
  });

  it('Last kill (the default): the radius moves to where the last monster died', () => {
    const { state, hooks } = world();
    const first = mob(21, 3, 0), far = mob(22, 26, 0);
    state.mobs = [first, far];
    const play = new AutoPlay(hooks, defaultSettings());
    expect(play.settings.farm.center).toBe('lastKill');
    play.start();
    run(play, state, 1);
    expect(state.engaged).toEqual([21]);
    first.hp = 0;
    state.mobs = [far];
    play.onEvent({ kind: 'kill', targetId: 21, pos: [14, 0, 0] });
    run(play, state, 2);
    expect(state.engaged).toEqual([21, 22]);
    expect(play.anchorAt).toEqual([14, 0, 0]);
  });

  it('Start point: the radius stays where Start was pressed', () => {
    const { state, hooks } = world();
    const first = mob(21, 3, 0), far = mob(22, 26, 0);
    state.mobs = [first, far];
    const play = new AutoPlay(hooks, startPoint());
    play.start();
    run(play, state, 1);
    first.hp = 0;
    state.mobs = [far];
    play.onEvent({ kind: 'kill', targetId: 21, pos: [14, 0, 0] });
    run(play, state, 2);
    expect(state.engaged).toEqual([21]);
  });

  it('Last kill never walks back: idle far from where it began, it stays; Start point walks back', () => {
    const lastKill = world();
    const play = new AutoPlay(lastKill.hooks, defaultSettings());
    play.start();
    lastKill.state.selfPos[0] = 40;
    run(play, lastKill.state, 120);
    expect(lastKill.state.walks).toEqual([]);
    const start = world();
    const back = new AutoPlay(start.hooks, startPoint());
    back.start();
    start.state.selfPos[0] = 40;
    run(back, start.state, 120);
    expect(start.state.walks.length).toBeGreaterThan(0);
  });
});

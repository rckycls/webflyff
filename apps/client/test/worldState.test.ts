import { describe, expect, it } from 'vitest';
import { AttackFlag, DstParam, NULL_ID } from '@flyffweb/protocol';
import type { AddedMover, MonsterRate, MoveReport, TaskBar, Vec3, WorldMessage } from '@flyffweb/protocol';
import { GAME_DATA_KEYS } from '@flyffweb/formats';
import type { WebMover } from '@flyffweb/formats';
import { ServerClock } from '../src/net/serverClock';
import { GameDataMissingError, loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { OwnState } from '../src/world/OwnState';
import { terrainGround } from '../src/world/sim/collision';
import type { Ground } from '../src/world/sim/collision';
import { ActMsg, AniLoop, Mop, Mti, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { attackSpeed } from '../src/world/sim/params';
import { Missiles } from '../src/world/combat/missiles';
import { WorldState, isDie, isLive } from '../src/world/WorldState';
import type { CombatEvent, Mover } from '../src/world/WorldState';
import { catalogFiles, storeOf } from './helpers/gameDataFiles';
import { gameDataOf, webMoverOf } from './helpers/movers';
import { MERCENARY, OWN_ID, STARTER_EQUIPMENT, VAGRANT, WOODEN_SWORD, itemProp, ownAdded, ownGameData } from './helpers/ownState';

const f32 = Math.fround;

// ---- the world's inputs -------------------------------------------------------------------------------------------

/** The server's tick when the clock starts, and the local time (ms) it starts at. */
const SERVER_TICK = 1_000_000_000_000n;
const START_MS = 1000;

/** `dwAI` values of Resource/defineNeuz.h. */
const AII_MOVER = 1;
const AII_MONSTER = 2;
const AII_CLOCKWORKS = 4;

const moverProp = (index: number, name: string, speed: number, ai = AII_MOVER, flying = false): WebMover =>
  webMoverOf({ index, name, speed, ai, flying });

function gameData(): GameData {
  return gameDataOf({
    movers: new Map([
      [11, moverProp(11, 'Male', 0.1)],
      [20, moverProp(20, 'Aibatt', 0.2, AII_MONSTER)],
      [21, moverProp(21, 'Clockworks', 0.2, AII_CLOCKWORKS)], // the same table speed as the Aibatt
      [22, moverProp(22, 'Mothbee', 0.2, AII_MONSTER, true)], // dwFlying 1
    ]),
    // keyed by the lower-cased key, as CProject::GetCharacter looks it up
    npcs: new Map([['mafl_mikyel', { key: 'MaFl_Mikyel', name: 'Mikyel' }]]),
  });
}

/**
 * A world on a clock that stands at `START_MS` until the test moves `time.now`; the ground is flat at height 0. `own` is
 * the own character's numbers, which the world applies the own messages to.
 */
function newWorld(
  data: GameData = gameData(), ground: Ground = terrainGround(() => 0), own?: OwnState,
): { world: WorldState; time: { now: number }; clock: ServerClock } {
  const time = { now: START_MS };
  const clock = new ServerClock(() => time.now);
  clock.start(START_MS, SERVER_TICK);
  return { world: new WorldState(data, clock, ground, own), time, clock };
}

/** No changes at all, as `takeChanges` reports them. */
const NO_CHANGES = { added: [], removed: [], combat: [], own: [], dropped: 0 };

describe('ground item lifecycle', () => {
  it('updates another player equipment and invalidates its look after confirmation', () => {
    const { world } = newWorld(ownGameData());
    world.apply(90, { type: 'addMover', mover: playerOf(90, 'Other') });
    let refreshed = 0;
    world.onEquipmentChange = () => { refreshed++; };
    world.apply(90, { type: 'equipItem', objectId: 6, itemId: 21, equip: true, flag: 0, option: 0, part: -1 });
    expect(world.movers.get(90)?.added.player?.worn).toContainEqual({ part: 10, itemId: 21, flag: 0 });
    world.apply(90, { type: 'equipItem', objectId: 6, itemId: 21, equip: false, flag: 0, option: 0, part: -1 });
    expect(world.movers.get(90)?.added.player?.worn.some((p) => p.part === 10)).toBe(false);
    expect(refreshed).toBe(2);
  });
  it('keeps known in-world items, removes them on DEL_OBJ, and ignores unknown/invalid drops', () => {
    const { world } = newWorld(ownGameData());
    world.setItemBounds(200, 200);
    const item = { index: 21, scale: 1, pos: [100, 0, 100] as Vec3, angle: 0, item: { objectId: 0, itemId: 21, count: 1 } };
    world.apply(90, { type: 'addItem', item });
    expect(world.groundItems.has(90)).toBe(true);
    world.apply(91, { type: 'addItem', item: { ...item, pos: [201, 0, 100] } });
    world.apply(92, { type: 'addItem', item: { ...item, pos: [NaN, 0, 100] } });
    world.apply(93, { type: 'addItem', item: { ...item, item: { ...item.item, itemId: 999999 } } });
    expect(world.groundItems.size).toBe(1);
    world.apply(90, { type: 'delObj' });
    expect(world.groundItems.size).toBe(0);
  });
});

// ---- ADD_OBJ payloads ---------------------------------------------------------------------------------------------

const BASE = { scale: 1, motion: Mti.STAND, hitPoint: 100, state: 0, stateFlag: 0, belligerence: 0, sfxId: 0 };
const AT: Vec3 = [100, 0, 100];

/** A player's ADD_OBJ: a level 1 Vagrant with STA and DEX 15, wearing nothing. */
function playerOf(objectId: number, name: string, extra: Partial<AddedMover> = {}, self = false): AddedMover {
  return {
    ...BASE, index: 11, pos: AT, angle: 0, objectId, isPlayer: true, ...extra,
    player: {
      self, name, sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: objectId, job: 0, sta: 15,
      dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1,
      worn: [], equipmentObjectIds: [], own: null, shopTitle: '',
    },
  };
}

function npcOf(objectId: number, index: number, characterKey = '', extra: Partial<AddedMover> = {}, speedFactor = 1): AddedMover {
  return {
    ...BASE, index, pos: AT, angle: 0, objectId, isPlayer: false, ...extra,
    npc: {
      hairMesh: 0, hairColor: 0, headMesh: 0, characterKey, worn: [], activeAttack: 0, movePattern: 0, moveEvent: 0,
      moveEventCount: 0, speedFactor,
    },
  };
}

const add = (world: WorldState, mover: AddedMover): void => world.apply(mover.objectId, { type: 'addMover', mover });

/** What another client reported: a run (FMOVE) at `angle` from `pos`. */
function report(pos: Vec3, extra: Partial<MoveReport> = {}): MoveReport {
  return {
    pos, delta: [0, 0, -0.1], angle: 0, state: ObjSta.FMOVE, stateFlag: 0, motion: Mti.RUN, motionEx: 0,
    loop: AniLoop.LOOP, motionOption: 0, tick: SERVER_TICK, ...extra,
  };
}

function steps(world: WorldState, n: number): void {
  for (let i = 0; i < n; i++) world.step();
}

function near(actual: number, expected: number, tolerance = 1e-4): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

// ---- the movers in view -------------------------------------------------------------------------------------------

describe('WorldState: what is in view', () => {
  it('adds a player, a monster and an NPC with their names', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    add(world, npcOf(2, 20));
    add(world, npcOf(3, 11, 'MaFl_Mikyel')); // the key's case is the file's; the lookup lower-cases it

    expect(world.movers.size).toBe(3);
    const [alice, aibatt, mikyel] = [world.movers.get(1)!, world.movers.get(2)!, world.movers.get(3)!];
    expect([alice.kind, alice.name]).toEqual(['player', 'Alice']);
    expect([aibatt.kind, aibatt.name]).toEqual(['monster', 'Aibatt']);
    expect([mikyel.kind, mikyel.name]).toEqual(['npc', 'Mikyel']); // not "Male", the name of its index
    expect(alice.objectId).toBe(1);
    expect(alice.added.objectId).toBe(1);
    expect(alice.act.body.pos).toEqual([100, 0, 100]);
    expect(alice.act.body.isPlayer).toBe(true);
    expect(aibatt.act.body.isPlayer).toBe(false);
  });

  it('adds an NPC whose key is unknown and a monster whose index is unknown, with no name', () => {
    const { world } = newWorld();
    expect(() => add(world, npcOf(1, 11, 'nobody_here'))).not.toThrow();
    expect(() => add(world, npcOf(2, 999))).not.toThrow();
    expect([world.movers.get(1)!.kind, world.movers.get(1)!.name]).toEqual(['npc', '']);
    expect([world.movers.get(2)!.kind, world.movers.get(2)!.name]).toEqual(['monster', '']);
    expect(world.movers.get(2)!.act.body.speed).toBe(0); // no row, no speed: it stands where it is put
  });

  it('takes the ADD_OBJ state, state flag, motion, angle and position as they come', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Sitter', {
      pos: [10.5, 2, 30.25], angle: 90, state: ObjSta.SIT, stateFlag: ObjStaF.SIT, motion: Mti.SITSTAND,
    }));
    const act = world.movers.get(1)!.act;
    expect(act.state).toBe(ObjSta.SIT);
    expect(act.stateFlag).toBe(ObjStaF.SIT);
    expect(act.motion).toBe(Mti.SITSTAND);
    expect(act.body.pos).toEqual([10.5, 2, 30.25]);
    near(act.body.angle, 90, 0.01);
  });

  it('DEL_OBJ removes', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    add(world, playerOf(2, 'Bob'));
    world.apply(1, { type: 'delObj' });
    expect([...world.movers.keys()]).toEqual([2]);
    world.apply(1, { type: 'delObj' }); // twice, or for one never added: nothing to remove
    world.apply(77, { type: 'delObj' });
    expect([...world.movers.keys()]).toEqual([2]);
  });

  it('ADD_OBJ for a present ID keeps the mover in view', () => {
    const { world } = newWorld();
    add(world, playerOf(5, 'Old', { state: ObjSta.FMOVE, angle: 90 }));
    const old = world.movers.get(5)!;
    world.takeChanges();
    steps(world, 10); // under way, so the sim state is not the ADD_OBJ's
    const pos = [...old.act.body.pos];
    expect(pos[0]).toBeGreaterThan(100.5);

    // OnAddObj reads the new data into a throwaway object when the ID is in the world (:1081-1104)
    add(world, playerOf(5, 'New', { pos: [120, 0, 100], state: 0, angle: 0 }));
    expect(world.movers.size).toBe(1);
    expect(world.movers.get(5)).toBe(old);
    expect(old.name).toBe('Old');
    expect(old.added.player?.name).toBe('Old');
    expect(old.act.body.pos).toEqual(pos);
    expect(old.act.state).toBe(ObjSta.FMOVE);
    expect(world.takeChanges()).toEqual(NO_CHANGES);
  });

  it('a repeated ADD_OBJ of the own character keeps it too', () => {
    const { world } = newWorld();
    add(world, playerOf(7, 'Me', {}, true));
    const me = world.self();
    world.takeChanges();
    add(world, playerOf(7, 'Me again', {}, true));
    expect(world.self()).toBe(me);
    expect(world.movers.get(7)).toBe(me);
    expect(world.takeChanges()).toEqual(NO_CHANGES);
  });

  it('DEL_OBJ then ADD_OBJ for the same ID adds a new mover', () => {
    const { world } = newWorld();
    add(world, playerOf(5, 'Old'));
    const old = world.movers.get(5)!;
    world.takeChanges();

    world.apply(5, { type: 'delObj' });
    add(world, playerOf(5, 'New', { pos: [120, 0, 100] }));
    const fresh = world.movers.get(5)!;
    expect(fresh).not.toBe(old);
    expect([fresh.name, fresh.act.body.pos]).toEqual(['New', [120, 0, 100]]);

    const changes = world.takeChanges();
    expect(changes.removed).toEqual([5]); // once
    expect(changes.added).toEqual([fresh]);
    expect(changes.added[0]).toBe(fresh);
    expect(world.takeChanges()).toEqual(NO_CHANGES);
  });

  it('moves for an unknown ID are ignored', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    world.takeChanges();
    const messages: WorldMessage[] = [
      { type: 'moverMoved', move: report([110, 0, 100]) },
      { type: 'moverBehavior', move: report([110, 0, 100]) },
      {
        type: 'moverAngle', pos: [110, 0, 100], delta: [0, 0, 0], angle: 10, angleX: 0, accPower: 0, turnAngle: 0,
        tick: SERVER_TICK,
      },
      { type: 'destPos', pos: [110, 0, 110], forward: true },
      { type: 'destAngle', angle: 90, left: true },
      { type: 'setDestObj', targetId: 1, range: 1 },
      { type: 'motion', message: ActMsg.STOP },
      { type: 'setPos', pos: [1, 2, 3] },
      { type: 'setPosAngle', pos: [1, 2, 3], angle: 45 },
    ];
    for (const message of messages) expect(() => world.apply(99, message)).not.toThrow();
    expect(world.movers.size).toBe(1);
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
    expect(world.takeChanges()).toEqual(NO_CHANGES);
  });

  it('leaves the other objects and the world messages to whoever handles them', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    world.takeChanges();
    world.apply(2, { type: 'addOther', objectType: 3 });
    world.apply(1, { type: 'worldReadInfo', worldId: 1, pos: [5, 0, 5] });
    world.apply(1, { type: 'replace', worldId: 2, pos: [5, 0, 5] });
    expect(world.movers.size).toBe(1);
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
    expect(world.takeChanges()).toEqual(NO_CHANGES);
  });

  it('self is the mover whose ID is the bundle\'s player object ID', () => {
    const { world } = newWorld();
    expect(world.self()).toBeUndefined();
    add(world, playerOf(8, 'Other'));
    expect(world.self()).toBeUndefined();
    add(world, playerOf(7, 'Me', {}, true)); // ADD_OBJ with the bundle's player object ID reads with player.self set
    expect(world.self()).toBe(world.movers.get(7));
    expect(world.movers.get(7)!.isSelf).toBe(true); // the field the arrival rule reads
    expect(world.movers.get(8)!.isSelf).toBe(false);
    expect(world.movers.get(7)!.kind).toBe('player');

    world.apply(7, { type: 'delObj' });
    expect(world.self()).toBeUndefined();
  });
});

describe('WorldState: takeChanges', () => {
  it('reports what was added and removed since the last call', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    add(world, playerOf(2, 'Bob'));
    const first = world.takeChanges();
    expect(first.added.map((m) => m.objectId)).toEqual([1, 2]);
    expect(first.removed).toEqual([]);
    expect(world.takeChanges()).toEqual(NO_CHANGES);

    world.apply(1, { type: 'delObj' });
    add(world, playerOf(3, 'Carol'));
    const second = world.takeChanges();
    expect(second.removed).toEqual([1]);
    expect(second.added.map((m) => m.objectId)).toEqual([3]);
  });

  it('a mover added and removed between two calls is in neither list: the caller never saw it', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    world.takeChanges();
    add(world, playerOf(2, 'Bob'));
    world.apply(2, { type: 'delObj' });
    expect(world.takeChanges()).toEqual(NO_CHANGES);

    // handed out, removed, added again, removed: the one handed out is in removed, once, and the other in neither
    add(world, playerOf(3, 'Carol'));
    world.takeChanges();
    world.apply(3, { type: 'delObj' });
    add(world, playerOf(3, 'Carol again'));
    world.apply(3, { type: 'delObj' });
    expect(world.takeChanges()).toEqual({ ...NO_CHANGES, removed: [3] });
  });

  it('movers coming and going while nobody takes the changes (a hidden tab) leave nothing behind', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Alice'));
    world.takeChanges();
    for (let id = 100; id < 1100; id++) {
      add(world, playerOf(id, `Passer-by ${id}`));
      world.apply(id, { type: 'delObj' });
    }
    add(world, playerOf(2, 'Bob'));
    world.apply(1, { type: 'delObj' });
    const changes = world.takeChanges();
    expect(changes.removed).toEqual([1]);
    expect(changes.added.map((m) => m.name)).toEqual(['Bob']);
  });

  it('removing and adding an ID twice between two calls leaves the last mover, and the ID in removed once', () => {
    const { world } = newWorld();
    add(world, playerOf(4, 'One'));
    world.takeChanges();
    world.apply(4, { type: 'delObj' });
    add(world, playerOf(4, 'Two'));
    world.apply(4, { type: 'delObj' });
    add(world, playerOf(4, 'Three'));
    const changes = world.takeChanges();
    expect(changes.removed).toEqual([4]);
    expect(changes.added.map((m) => m.name)).toEqual(['Three']);
  });
});

// ---- the rules ----------------------------------------------------------------------------------------------------

describe('WorldState: stepping', () => {
  it('step moves every mover', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner', { state: ObjSta.FMOVE, angle: 90 })); // 0.1 a step to +x
    add(world, npcOf(2, 21, '', { state: ObjSta.FMOVE, angle: 90 })); // 0.2 a step
    add(world, playerOf(3, 'Stander'));
    steps(world, 10);
    near(world.movers.get(1)!.act.body.pos[0], 101);
    near(world.movers.get(2)!.act.body.pos[0], 102);
    expect(world.movers.get(3)!.act.body.pos).toEqual([100, 0, 100]);
    expect(world.movers.get(1)!.act.body.pos[2]).toBeCloseTo(100, 4); // along x only
    expect(world.movers.get(1)!.added.pos).toEqual([100, 0, 100]); // the ADD_OBJ record is not the mover's position
  });

  it('players, monsters and NPCs all collide with the ground they are given', () => {
    // CMover::Process runs ProcessCollisionGround for every mover on the ground (Mover.cpp:3884), and its exceptions
    // are overruled (ActionMoverCollision.cpp:193). A wall across x = 101.5, facing -x (two triangles, D3D, identity):
    const wall = {
      triangles: new Float32Array([
        101.5, 0, 110, 101.5, 3, 110, 101.5, 0, 90, 101.5, 3, 110, 101.5, 3, 90, 101.5, 0, 90,
      ]),
      matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    };
    const walled = newWorld(gameData(), { terrainHeight: () => 0, landAttr: () => 0, objectsNear: () => [wall] }).world;
    const free = newWorld().world;
    for (const world of [walled, free]) {
      add(world, playerOf(1, 'Runner', { state: ObjSta.FMOVE, angle: 90 }));
      add(world, npcOf(2, 20, '', { state: ObjSta.FMOVE, angle: 90 })); // the Aibatt, 0.1 a step
      add(world, npcOf(3, 11, 'MaFl_Mikyel', { state: ObjSta.FMOVE, angle: 90 }));
    }
    // each runs 0.1 a step: after 9 steps (x 100.9) its knee test, 6.5 steps (0.65) long, reaches the wall, and it stops
    steps(walled, 40);
    steps(free, 9);
    for (const id of [1, 2, 3]) {
      expect(walled.movers.get(id)!.act.body.pos).toEqual(free.movers.get(id)!.act.body.pos);
      near(walled.movers.get(id)!.act.body.pos[0], 100.9);
    }
  });

  it('a mover runs at its speed times its speed factor, as CMover::GetSpeed gives it', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Player', { state: ObjSta.FMOVE, angle: 90 })); // the player's factor is 1
    add(world, npcOf(2, 21, '', { state: ObjSta.FMOVE, angle: 90 }, 1.5));
    const [player, monster] = [world.movers.get(1)!, world.movers.get(2)!];
    expect(player.act.body.speed).toBe(f32(0.1));
    expect(monster.act.body.speed).toBe(f32(f32(0.2) * f32(1.5))); // a float product, as the C++ makes it
    expect(player.speedFactor).toBe(1);
    expect(monster.speedFactor).toBe(1.5);
    steps(world, 20);
    near(player.act.body.pos[0], 102);
    near(monster.act.body.pos[0], 100 + 20 * 0.3);
  });

  it('a monster (ai AII_MONSTER) walks at half its table speed, then times its speed factor (CreateObj, GetSpeed)', () => {
    const { world } = newWorld();
    // the Aibatt (ai 2) and the Clockworks (ai 4) have the same table speed, 0.2
    add(world, npcOf(1, 20, '', { state: ObjSta.FMOVE, angle: 90 }));
    add(world, npcOf(2, 21, '', { state: ObjSta.FMOVE, angle: 90 }));
    add(world, npcOf(3, 20, '', { state: ObjSta.FMOVE, angle: 90 }, 1.5));
    const [monster, other, quick] = [world.movers.get(1)!, world.movers.get(2)!, world.movers.get(3)!];
    expect(other.act.body.speed).toBe(f32(0.2));
    expect(monster.act.body.speed).toBe(f32(f32(0.2) / 2)); // CreateObj.cpp:649: m_fSpeed /= 2.0F
    expect(monster.act.body.speed).toBe(other.act.body.speed / 2);
    expect(quick.act.body.speed).toBe(f32(f32(f32(0.2) / 2) * f32(1.5))); // the halving first, then the factor
    steps(world, 20);
    near(monster.act.body.pos[0], 100 + 20 * 0.1);
    near(other.act.body.pos[0], 100 + 20 * 0.2);
    near(quick.act.body.pos[0], 100 + 20 * 0.15);
  });

  it('a player is not halved, and a mover whose table has no ai runs at its table speed', () => {
    const data = gameData();
    data.movers.set(31, moverProp(31, 'Body with a monster ai', 0.1, AII_MONSTER));
    const { world } = newWorld(data);
    add(world, playerOf(1, 'Player'));
    add(world, playerOf(2, 'Odd player', { index: 31 })); // Mover.cpp:1521 sets a player's m_fSpeed from fSpeed alone
    expect(world.movers.get(1)!.act.body.speed).toBe(f32(0.1));
    expect(world.movers.get(2)!.act.body.speed).toBe(f32(0.1));
    const old = moverProp(30, 'Old table', 0.2);
    delete (old as Partial<WebMover>).ai; // a data file the converter wrote before it kept the ai
    data.movers.set(30, old);
    const { world: other } = newWorld(data);
    add(other, npcOf(2, 30));
    expect(other.movers.get(2)!.act.body.speed).toBe(f32(0.2));
  });

  it('a flier is placed but not stepped', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Flier', { state: ObjSta.FMOVE, stateFlag: ObjStaF.FLY, angle: 90 }));
    add(world, playerOf(2, 'Walker', { state: ObjSta.FMOVE, angle: 90 }));
    steps(world, 10);
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
    near(world.movers.get(2)!.act.body.pos[0], 101);
  });

  it('a flying monster (dwFlying 1) is a flier too: placed but not stepped, so the ground does not pull it down', () => {
    // CActionMover::ProcessCollision (ActionMover.cpp:183): IsFly() || pProp->dwFlying == 1 moves with the flying rules
    const { world } = newWorld(gameData(), terrainGround(() => -5));
    add(world, npcOf(1, 22, '', { state: ObjSta.FMOVE, angle: 90 }));
    add(world, npcOf(2, 20, '', { state: ObjSta.FMOVE, angle: 90 }));
    steps(world, 10);
    expect(world.movers.get(1)!.flying).toBe(true);
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
    expect(world.movers.get(2)!.flying).toBe(false);
    near(world.movers.get(2)!.act.body.pos[0], 101); // the Aibatt runs on, at half its table speed
    expect(world.movers.get(2)!.act.body.pos[1]).toBeLessThan(0); // and falls toward the ground
    // a message that places it still does (SETPOS)
    world.apply(1, { type: 'setPos', pos: [120, 3, 100] });
    expect(world.movers.get(1)!.act.body.pos).toEqual([120, 3, 100]);
  });

  it('a mover follows the mover it is sent after, found by object ID, and stops in range', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Follower'));
    add(world, playerOf(2, 'Leader', { pos: [100, 0, 120] }));
    world.apply(1, { type: 'setDestObj', targetId: 2, range: 2 });
    steps(world, 300);
    const [follower, leader] = [world.movers.get(1)!, world.movers.get(2)!];
    const gap = Math.hypot(leader.act.body.pos[0] - follower.act.body.pos[0], leader.act.body.pos[2] - follower.act.body.pos[2]);
    expect(gap).toBeLessThan(2);
    expect(gap).toBeGreaterThan(1.5); // it stopped on entering the range, not on top of the leader
    expect(follower.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('a target that is not in view is not followed (OnMoverSetDestObj)', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Follower'));
    world.apply(1, { type: 'setDestObj', targetId: 50, range: 2 });
    expect(world.movers.get(1)!.dest).toBeNull();
    steps(world, 5);
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
  });

  it('DESTANGLE turns the mover to the angle', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Turner'));
    world.apply(1, { type: 'destAngle', angle: 90, left: true });
    steps(world, 40);
    near(world.movers.get(1)!.act.body.angle, 90, 0.5);
    expect(world.movers.get(1)!.act.state & ObjSta.TURN_ALL).toBe(0);
  });
});

describe('WorldState: the messages and the rules (OnMoverMoved and the others)', () => {
  it('plays another player jumping from the native behavior report through landing', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Jumper'));
    world.apply(1, { type: 'moverBehavior', move: report(AT, {
      state: ObjSta.STAND | ObjSta.SJUMP1, motion: Mti.JUMP1, loop: AniLoop.ONE_PLAY,
    }) });
    world.step();
    expect(world.movers.get(1)!.act.body.pos[1]).toBeGreaterThan(0);
    expect(world.movers.get(1)!.act.motion).toBe(Mti.JUMP2);
    steps(world, 120);
    expect(world.movers.get(1)!.act.body.pos[1]).toBe(0);
    expect(world.movers.get(1)!.act.state & ObjSta.JUMP_ALL).toBe(0);
  });
  it('MOVERMOVED corrects a recent move and takes a late one at once; MOVERBEHAVIOR is always at once', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Recent'));
    add(world, playerOf(2, 'Late'));
    add(world, playerOf(3, 'Behavior'));
    const target: Vec3 = [100, 0, 90];
    // the clock stands at START_MS: a move stamped 951 ms before the server's tick is 951 ms old
    const lateTick = SERVER_TICK - 951n * 10000n;
    world.apply(1, { type: 'moverMoved', move: report(target) });
    world.apply(2, { type: 'moverMoved', move: report(target, { tick: lateTick }) });
    world.apply(3, { type: 'moverBehavior', move: report(target) });

    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]); // not taken: it runs to the point
    expect(world.movers.get(1)!.corr).not.toBeNull();
    expect(world.movers.get(1)!.dest?.pos).toEqual(target);
    expect(world.movers.get(2)!.act.body.pos).toEqual(target); // 22 steps late or more: set at once
    expect(world.movers.get(2)!.corr).toBeNull();
    expect(world.movers.get(3)!.act.body.pos).toEqual(target);
    expect(world.movers.get(3)!.corr).toBeNull();
    expect(world.movers.get(3)!.act.state).toBe(ObjSta.FMOVE);
  });

  it('a clock that has moved on ages the move', () => {
    const { world, time } = newWorld();
    add(world, playerOf(1, 'Late'));
    time.now = START_MS + 951; // 951 ms after the clock started, the server's tick of the move is that old
    world.apply(1, { type: 'moverMoved', move: report([100, 0, 90]) });
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 90]);
  });

  it('a DESTPOS during a correction does not snap the mover back to the correction (OnSetDestPos)', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner'));
    const runner = world.movers.get(1)!;
    world.apply(1, { type: 'moverMoved', move: report([100, 0, 95]) });
    expect(runner.corr?.action).not.toBeNull();

    world.apply(1, { type: 'destPos', pos: [100, 0, 110], forward: true });
    expect(runner.corr?.action ?? null).toBeNull(); // BehaviorActionForceSet drops the action it does not take
    steps(world, 200);
    // it ran to the new point and stopped there; the arrival did not take the old report's position
    near(runner.act.body.pos[0], 100, 0.01);
    near(runner.act.body.pos[2], 110, 0.2);
    expect(runner.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    expect(runner.dest).toBeNull();
  });

  it('a MOTION clears the destination and the correction (OnMotion)', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner'));
    const runner = world.movers.get(1)!;
    world.apply(1, { type: 'moverMoved', move: report([100, 0, 130]) });
    steps(world, 5);
    expect(runner.dest?.pos).toEqual([100, 0, 130]);
    const z = runner.act.body.pos[2];
    expect(z).toBeGreaterThan(100); // under way, towards +z

    world.apply(1, { type: 'motion', message: ActMsg.STAND });
    expect(runner.dest).toBeNull();
    expect(runner.corr?.action ?? null).toBeNull();
    steps(world, 30);
    expect(runner.act.body.pos[2]).toBeCloseTo(z, 3); // it no longer heads for the point
    expect(runner.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('a MOTION that is not an action message is passed on and ignored', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Stander'));
    expect(() => world.apply(1, { type: 'motion', message: 9999 })).not.toThrow();
    expect(() => world.apply(1, { type: 'motion', message: 0 })).not.toThrow();
    expect(world.movers.get(1)!.act.body.pos).toEqual([100, 0, 100]);
  });

  it('MOVERCORR puts the mover where the correction says, its point to run to gone (OnMoverCorr)', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner'));
    const runner = world.movers.get(1)!;
    world.apply(1, { type: 'moverMoved', move: report([100, 0, 80]) });
    steps(world, 5);
    expect(runner.dest?.pos).toEqual([100, 0, 80]);

    world.apply(1, { type: 'moverCorr', move: report([100, 0, 98.5], { state: ObjSta.STAND, motion: Mti.STAND, delta: [0, 0, 0] }) });
    expect(runner.act.body.pos).toEqual([100, 0, 98.5]);
    expect(runner.dest).toBeNull();
    expect(runner.corr).toBeNull();
    steps(world, 30);
    expect(runner.act.body.pos).toEqual([100, 0, 98.5]);
    expect(runner.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('MOVERANGLE changes nothing on the ground, as OnMoverAngle returns for a mover that is not flying', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Walker', { angle: 30 }));
    const walker = world.movers.get(1)!;
    const angle = walker.act.body.angle;
    world.apply(1, {
      type: 'moverAngle', pos: [50, 0, 50], delta: [1, 0, 0], angle: 200, angleX: 10, accPower: 1, turnAngle: 2,
      tick: SERVER_TICK,
    });
    expect(walker.act.body.pos).toEqual([100, 0, 100]);
    expect(walker.act.body.angle).toBe(angle);
    expect(walker.dest).toBeNull();
    expect(walker.corr).toBeNull();
  });

  it('SETPOS places the mover at once and stops it, as OnSetPos does', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner', { state: ObjSta.FMOVE | ObjSta.LTURN, angle: 90 }));
    const runner = world.movers.get(1)!;
    world.apply(1, { type: 'destPos', pos: [100, 0, 200], forward: true });
    expect(runner.dest?.pos).toEqual([100, 0, 200]);

    world.apply(1, { type: 'setPos', pos: [50.5, 3, 60.25] });
    expect(runner.act.body.pos).toEqual([50.5, 3, 60.25]);
    expect(runner.dest).toBeNull(); // ClearDest
    expect(runner.act.state & ObjSta.TURN_ALL).toBe(0); // OBJMSG_STOP_TURN
    expect(runner.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND); // OBJMSG_STAND
  });

  it('SETPOSANGLE places the mover and turns it at once, and nothing else', () => {
    const { world } = newWorld();
    add(world, playerOf(1, 'Runner', { state: ObjSta.FMOVE }));
    const runner = world.movers.get(1)!;
    world.apply(1, { type: 'destPos', pos: [100, 0, 200], forward: true });

    world.apply(1, { type: 'setPosAngle', pos: [50.5, 3, 60.25], angle: 123.5 });
    expect(runner.act.body.pos).toEqual([50.5, 3, 60.25]);
    near(runner.act.body.angle, 123.5, 0.01);
    expect(runner.dest?.pos).toEqual([100, 0, 200]); // OnSetPosAngle clears no destination
    expect(runner.act.state).toBe(ObjSta.FMOVE);
  });
});

// ---- combat: the fight messages on the movers in view -------------------------------------------------------------

/**
 * `MI_AIBATT1` as `propMover.txt` has it: level 1, `dwAddHp` 120, killable, attacking with `II_WEA_MOB_AIBATT1_ATK1`
 * (`dwAtk1`); and a second row of the same name, with no item.
 */
const AIBATT = 20;
const AIBATT_ATK1 = 9000;
const AIBATT_TWIN = 23;
/** A peaceful NPC that cannot be killed. */
const JURIA = 24;
const MONSTER = 2;
const PLAYER = 5;
const GENERIC = AttackFlag.GENERIC;

function combatData(): GameData {
  return ownGameData({
    jobs: [VAGRANT, MERCENARY],
    movers: new Map([
      [11, moverProp(11, 'Male', 0.1)],
      [AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', speed: 0.2, ai: AII_MONSTER, addHp: 120, killable: 1, belligerence: 3, atk1: AIBATT_ATK1 })],
      [AIBATT_TWIN, webMoverOf({ index: AIBATT_TWIN, name: 'Aibatt', ai: AII_MONSTER, addHp: 200, killable: 1, level: 4 })],
      [JURIA, webMoverOf({ index: JURIA, name: 'Juria', ai: AII_MOVER, addHp: 50, killable: 0, belligerence: 1, level: -1 })],
    ]),
  });
}

/**
 * A world with the own character in view at `AT`, standing: a new Vagrant whose numbers (`OwnState`, with the starter
 * items) the world is given, its ADD_OBJ the JOIN bundle's first. Without `numbers` the world has no own numbers.
 */
function combatWorld(numbers = true) {
  const data = combatData();
  const added: AddedMover = { ...ownAdded(1), pos: AT, angle: 90, state: ObjSta.STAND };
  const own = numbers ? new OwnState(data, added, STARTER_EQUIPMENT) : undefined;
  const { world } = newWorld(data, terrainGround(() => 0), own);
  world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
  world.takeChanges();
  return { world, own: own!, self: world.self()!, data };
}

/** An Aibatt's ADD_OBJ: standing, its HP full, at `pos`. */
const aibatt = (objectId: number, pos: Vec3 = [101, 0, 100], extra: Partial<AddedMover> = {}): AddedMover =>
  npcOf(objectId, AIBATT, '', { pos, hitPoint: 120, state: ObjSta.STAND, belligerence: 3, ...extra });

/** A DAMAGE by `attackerId` of `hit`, a plain one unless `flags` say otherwise; `fly` for a knock-back's. */
function damage(attackerId: number, hit: number, flags: number = GENERIC, fly: { pos: Vec3; angle: number } | null = null): WorldMessage {
  return { type: 'damage', attackerId, hit, flags, fly };
}

const rate = (name: string, hitPoint: number): MonsterRate =>
  ({ name, hitPoint, attackPower: 100, defence: 100, exp: 100, itemDrop: 100, penya: 100 });

/** The model's side of a swing: its motion never ends, and its hit frames are the given ones, a step each. */
function hitFrames(m: Mover, frames: number[]): void {
  m.act.isEndFrame = () => false;
  m.act.isAttrHit = () => frames.shift() ?? -1;
}

/** The `hit` event of a DAMAGE on `victimId` by `attackerId`, an attacker in view unless `attackerInView` says not. */
const hitEvent = (victimId: number, attackerId: number, hit: number, flags = GENERIC, attackerInView = true): CombatEvent =>
  ({ kind: 'hit', victimId, attackerId, hit, flags, attackerInView });

/** The model flashes of a swing's blow (`m_SparkInfo`): the victim's, lit from the attacker's side. */
const spark = (moverId: number, fromId: number): CombatEvent => ({ kind: 'spark', moverId, fromId });

describe('WorldState: DAMAGE (CDPClient::OnDamage, DPClient.cpp:1758-1934)', () => {
  it('DAMAGE lowers HP and emits hit, and the following SETPOINTPARAM sets it', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    const monster = world.movers.get(MONSTER)!;
    expect([monster.hp, monster.maxHp, monster.level]).toEqual([120, 120, 1]);
    world.takeChanges();

    world.apply(MONSTER, damage(OWN_ID, 7));
    expect(monster.hp).toBe(113); // IncHitPoint( -dwHit )
    expect(monster.act.hitPoint()).toBe(113); // the rules' m_nHitPoint (IsLive, the end of a fall)
    expect(world.takeChanges().combat).toEqual([hitEvent(MONSTER, OWN_ID, 7)]);

    // the server's absolute value follows (EndPVP, AttackArbiter.cpp:259): SetPointParam, at most the max
    world.apply(MONSTER, { type: 'setPointParam', param: DstParam.HP, value: 110 });
    expect(monster.hp).toBe(110);
    world.apply(MONSTER, { type: 'setPointParam', param: DstParam.HP, value: 500 });
    expect(monster.hp).toBe(120);
    world.apply(MONSTER, { type: 'setPointParam', param: DstParam.HP, value: -3 });
    expect(monster.hp).toBe(0);
    world.apply(MONSTER, { type: 'setPointParam', param: DstParam.MP, value: 40 }); // a monster's MP is not kept
    expect(monster.hp).toBe(0);
  });

  it('a hit never kills: an HP it takes to 0 is 1 (:1787-1788), and a miss is a hit of 0', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, AT, { hitPoint: 5 }));
    const monster = world.movers.get(MONSTER)!;
    world.apply(MONSTER, damage(OWN_ID, 0, AttackFlag.MISS));
    expect(monster.hp).toBe(5);
    world.apply(MONSTER, damage(OWN_ID, 9));
    expect(monster.hp).toBe(1);
    expect(isDie(monster)).toBe(false);
  });

  it('a hit stands a sitting mover up (:1789-1790)', () => {
    const { world } = combatWorld();
    add(world, playerOf(PLAYER, 'Sitter', { state: ObjSta.SIT, stateFlag: ObjStaF.SIT, motion: Mti.SITSTAND }));
    const sitter = world.movers.get(PLAYER)!;
    world.apply(PLAYER, damage(MONSTER, 3));
    expect(sitter.act.stateFlag & ObjStaF.SIT).toBe(0);
    expect(sitter.act.state & ObjSta.MOVE_ALL).toBe(0);
  });

  it('DAMAGE after DEL_OBJ is ignored', () => {
    // Review Focus 3: a message about a mover that left view, even in the same bundle, finds no mover (prj.GetMover)
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    world.takeChanges();
    world.apply(MONSTER, { type: 'delObj' });
    const late: WorldMessage[] = [
      damage(OWN_ID, 7), { type: 'moverDeath', attackerId: OWN_ID, message: ActMsg.DAMAGE },
      { type: 'meleeAttack', message: ActMsg.ATK1, targetId: OWN_ID, param2: 0, param3: 0x00010000 },
      { type: 'setPointParam', param: DstParam.HP, value: 3 }, { type: 'setLevel', level: 9 },
      { type: 'corrReq', pos: [1, 2, 3], attackerId: OWN_ID }, { type: 'revival' }, { type: 'revivalToLodestar' },
    ];
    for (const message of late) expect(() => world.apply(MONSTER, message)).not.toThrow();
    expect([...world.movers.keys()]).toEqual([OWN_ID]); // no ghost
    expect(world.takeChanges()).toEqual({ ...NO_CHANGES, removed: [MONSTER] });
  });

  it('a DAMAGE in the same bundle after the mover\'s ADD_OBJ applies', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    world.apply(MONSTER, damage(OWN_ID, 20));
    expect(world.movers.get(MONSTER)!.hp).toBe(100);
    const changes = world.takeChanges();
    expect(changes.added.map((m) => m.objectId)).toEqual([MONSTER]);
    expect(changes.combat).toEqual([{ kind: 'spawned', moverId: MONSTER }, hitEvent(MONSTER, OWN_ID, 20)]);
  });

  it('a hit says whether its attacker was in view as the message came, which decides who sees its number (:1810-1833)', () => {
    // an attacker prj.GetCtrl finds none of (NULL_ID, or not in view) goes to g_PASS: the number shows for any victim
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    world.takeChanges();
    world.apply(MONSTER, damage(OWN_ID, 3));
    world.apply(MONSTER, damage(77, 4));
    world.apply(MONSTER, damage(NULL_ID, 5));
    world.apply(OWN_ID, damage(MONSTER, 6));
    expect(world.takeChanges().combat).toEqual([
      hitEvent(MONSTER, OWN_ID, 3), hitEvent(MONSTER, 77, 4, GENERIC, false), hitEvent(MONSTER, NULL_ID, 5, GENERIC, false),
      hitEvent(OWN_ID, MONSTER, 6),
    ]);
  });

  it('a knock-back (AF_FLYING) puts the victim where the server says and sends it flying the attacker\'s way (:1771-1781, 1910-1921)', () => {
    const { world, self } = combatWorld();
    add(world, aibatt(MONSTER));
    const monster = world.movers.get(MONSTER)!;
    world.apply(OWN_ID, { type: 'destPos', pos: [100, 0, 140], forward: true }); // the attacker on its way somewhere
    const flags = GENERIC | AttackFlag.CRITICAL1 | AttackFlag.CRITICAL2 | AttackFlag.FLYING;
    world.apply(MONSTER, damage(OWN_ID, 30, flags, { pos: [102.5, 0, 100], angle: 45 }));

    expect(monster.act.body.pos).toEqual([102.5, 0, 100]);
    expect(monster.act.body.angle).toBe(45);
    expect(monster.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG_FLY);
    expect([monster.act.motion, monster.act.loop]).toEqual([Mti.DMGFLY, AniLoop.CONT]);
    // DoDamageFly( attacker's angle 90, 145.0f, 0.18f ): up, and along +x, the way the own mover faces
    const theta2 = f32(145 * f32(f32(3.141592654) / 180));
    expect(monster.act.delta[1]).toBe(f32(-f32(Math.cos(theta2)) * f32(0.18)));
    expect(monster.act.deltaE[0]).toBeGreaterThan(0.1);
    expect(Math.abs(monster.act.deltaE[2])).toBeLessThan(1e-6);
    expect(self.dest).toBeNull(); // the attacker stops (OBJMSG_STOP clears its destination)
    expect(monster.hp).toBe(90);
  });

  it('a knock-back whose attacker is not in view only places the victim', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, AT));
    const monster = world.movers.get(MONSTER)!;
    world.apply(MONSTER, damage(77, 30, GENERIC | AttackFlag.FLYING, { pos: [104, 0, 100], angle: 10 }));
    expect(monster.act.body.pos).toEqual([104, 0, 100]);
    expect(monster.act.state & ObjSta.DMG_ALL).toBe(0);
    expect(monster.act.deltaE).toEqual([0, 0, 0]);
  });
});

describe('WorldState: MOVERDEATH (CDPClient::OnMoverDeath, DPClient.cpp:1936-2090)', () => {
  it('MOVERDEATH emits death with the last HP and sets the dead state', () => {
    const { world, self } = combatWorld();
    add(world, aibatt(MONSTER, AT, { hitPoint: 30 }));
    const monster = world.movers.get(MONSTER)!;
    // the own mover was following it, its swing on it (m_objidHit)
    world.apply(OWN_ID, { type: 'setDestObj', targetId: MONSTER, range: 0 });
    self.act.hitId = MONSTER;
    world.takeChanges();

    world.apply(MONSTER, { type: 'moverDeath', attackerId: OWN_ID, message: ActMsg.DAMAGE });
    expect(monster.hp).toBe(0);
    expect(monster.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DEAD);
    expect([monster.act.motion, monster.act.loop]).toEqual([Mti.DIE1, AniLoop.CONT]);
    expect([isDie(monster), isLive(monster)]).toEqual([true, false]);
    expect(world.takeChanges().combat).toEqual([
      { kind: 'death', victimId: MONSTER, attackerId: OWN_ID, lastHp: 30, attackerInView: true },
    ]);
    // the attacker: SetObjHit( NULL_ID ) and ClearDestObj (:2008-2009)
    expect(self.act.hitId).toBeNull();
    expect(self.dest).toBeNull();
  });

  it('a forced blow (OBJMSG_DAMAGE_FORCE, 42) knocks the dead mover flying; a death with no attacker lays it down', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    add(world, aibatt(MONSTER + 1));
    world.apply(MONSTER, { type: 'moverDeath', attackerId: OWN_ID, message: ActMsg.DAMAGE_FORCE });
    const flown = world.movers.get(MONSTER)!;
    expect(flown.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG_FLY);
    expect(flown.act.deltaE[0]).toBeGreaterThan(0); // the own mover faces +x
    world.apply(MONSTER + 1, { type: 'moverDeath', attackerId: NULL_ID, message: 0 }); // HATTR_DIE
    expect(world.movers.get(MONSTER + 1)!.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DEAD);
    // the death's number needs the killer found (`if( pAttacker )`, :1998-2007): `attackerInView`
    const deaths = world.takeChanges().combat.filter((e) => e.kind === 'death');
    expect(deaths.map((e) => [e.attackerId, e.lastHp, e.attackerInView])).toEqual([[OWN_ID, 120, true], [NULL_ID, 120, false]]);
  });
});

describe('WorldState: the own character\'s numbers (OwnState, one source of its HP)', () => {
  it('the own mover\'s HP, max HP and level are its OwnState\'s, and only OwnState changes them', () => {
    const { world, own, self } = combatWorld();
    expect([self.hp, self.maxHp, self.level]).toEqual([230, 230, 1]);
    world.apply(OWN_ID, damage(MONSTER, 30));
    expect(own.hp).toBe(200);
    expect(self.hp).toBe(200);
    expect(self.act.hitPoint()).toBe(200);
    expect(() => {
      self.hp = 5;
    }).toThrow(TypeError);
    world.apply(OWN_ID, { type: 'setPointParam', param: DstParam.HP, value: 150 });
    expect([own.hp, self.hp]).toEqual([150, 150]);
    world.apply(OWN_ID, { type: 'setPointParam', param: DstParam.MP, value: 10 });
    expect(own.mp).toBe(10);
    expect(world.takeChanges().combat).toEqual([hitEvent(OWN_ID, MONSTER, 30, GENERIC, false)]); // no monster in view
  });

  it('uses server profile movement values without breaking correction steps', () => {
    const { world, own, self } = combatWorld();
    own.apply({ type: 'profileStats', values: [15, 15, 15, 15, 230, 63, 31, 49, 24, 1, 42, 840000, 200000, 25] }, OWN_ID);
    expect(self.profileSpeed?.()).toBe(0.2);
    expect(self.act.jumpBonus()).toBe(25);
    expect(() => world.step()).not.toThrow();
    own.apply({ type: 'profileStats', values: [15, 15, 15, 15, 230, 63, 31, 49, 24, 1, 42, 840000, 0, 0] }, OWN_ID);
    expect(self.profileSpeed?.()).toBe(0);
    expect(() => world.step()).not.toThrow();
  });

  it('the own death: OwnState\'s HP 0 and its event, the death\'s last HP, the dead state', () => {
    const { world, own, self } = combatWorld();
    add(world, aibatt(MONSTER));
    world.apply(OWN_ID, { type: 'setPointParam', param: DstParam.HP, value: 12 });
    world.takeChanges();
    world.apply(OWN_ID, { type: 'moverDeath', attackerId: MONSTER, message: ActMsg.DAMAGE });
    expect([own.hp, self.hp]).toEqual([0, 0]);
    expect(self.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DEAD);
    const changes = world.takeChanges();
    expect(changes.own).toEqual([{ kind: 'died' }]);
    expect(changes.combat).toEqual([{ kind: 'death', victimId: OWN_ID, attackerId: MONSTER, lastHp: 12, attackerInView: true }]);
  });

  it('a level up plays MTI_LEVELUP on the standing own mover and refills its HP (SetExperience, MoverParam.cpp:1725-1772)', () => {
    const { world, own, self } = combatWorld();
    world.apply(OWN_ID, damage(MONSTER, 100));
    world.apply(OWN_ID, {
      type: 'setExperience', exp: 0n, level: 2, skillLevel: 0, skillPoint: 0, deathExp: -1n, deathLevel: 0xffff,
    });
    expect([own.level, self.level, self.hp, self.maxHp]).toEqual([2, 2, 230, 230]);
    expect([self.act.motion, self.act.loop, self.act.motionOption]).toEqual([Mti.LEVELUP, AniLoop.ONE_PLAY, Mop.FIXED]);
    expect(world.takeChanges().own.map((e) => e.kind)).toEqual(['levelUp', 'patternUp', 'refilled']);
  });

  it('the JOIN\'s TASKBAR after the own ADD_OBJ, and SETSTATE, are OwnState\'s whatever their object ID', () => {
    const { world, own } = combatWorld();
    const taskBar: TaskBar = { applets: [], items: [], queue: [], actionPoint: 7 };
    world.apply(OWN_ID, { type: 'taskBar', taskBar }, true);
    expect(own.taskBar).toBe(taskBar);
    world.apply(NULL_ID, { type: 'setState', str: 16, sta: 15, dex: 15, int: 15, remainGP: 1 });
    expect(own.stats.str).toBe(16);
    expect(world.takeChanges().own).toEqual([{ kind: 'statsChanged' }, { kind: 'refilled' }]);
  });

  it('a revival clears the own mover\'s state; REVIVAL_TO_LODESTAR gives the level\'s part of its HP (OnRevivalLodestar)', () => {
    const { world, own, self } = combatWorld();
    world.apply(OWN_ID, { type: 'moverDeath', attackerId: MONSTER, message: ActMsg.DAMAGE });
    world.takeChanges();
    world.apply(OWN_ID, { type: 'revivalToLodestar' });
    expect(self.act.state).toBe(0); // ClearState: the next step stands it up
    expect([own.hp, self.hp]).toEqual([184, 184]); // 230 * 8 / 10 at level 1
    expect(world.takeChanges().own).toEqual([{ kind: 'revived' }]);
    world.step();
    expect(self.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('without the own numbers the own mover is any player\'s: its HP from ADD_OBJ and DAMAGE, its max from its stats', () => {
    const { world, self } = combatWorld(false);
    expect([self.hp, self.maxHp]).toEqual([230, 230]);
    world.apply(OWN_ID, damage(MONSTER, 30));
    expect(self.hp).toBe(200);
    expect(world.takeChanges().own).toEqual([]);
  });
});

describe('WorldState: another player\'s numbers, from its ADD_OBJ\'s job, level, STA and DEX (Ruling R19)', () => {
  /** A player of `level` with the given STA and DEX, standing 1 m north of the own mover; `weapon` in its right hand. */
  function playerWith(level: number, sta: number, dex: number, weapon: number | null = null): AddedMover {
    const added = playerOf(PLAYER, 'Bob', { pos: [100, 0, 99], state: ObjSta.STAND });
    Object.assign(added.player!, { level, sta, dex, worn: weapon === null ? [] : [{ part: 10, itemId: weapon, flag: 0 }] });
    return added;
  }

  it('its max HP is GetMaxOriginHitPoint\'s of its job, level and STA (the BASE_VALUE_TBL values)', () => {
    for (const [level, sta, max] of [[1, 15, 230], [2, 15, 230], [8, 15, 240], [15, 15, 265], [15, 45, 581]] as const) {
      const { world } = combatWorld();
      add(world, playerWith(level, sta, 15));
      expect(world.movers.get(PLAYER)!.maxHp, `level ${level}, STA ${sta}`).toBe(max);
    }
    // a job the catalog has no row for: no max
    const { world } = combatWorld();
    const stranger = playerWith(1, 15, 15);
    stranger.player!.job = 99;
    add(world, stranger);
    expect(world.movers.get(PLAYER)!.maxHp).toBeNull();
  });

  it('SETLEVEL refills its HP to the new level\'s max; SETPOINTPARAM stops at the max; the lodestar gives its part', () => {
    const { world } = combatWorld();
    add(world, playerWith(1, 15, 15));
    const bob = world.movers.get(PLAYER)!;
    world.apply(PLAYER, { type: 'setLevel', level: 8 }); // OnSetLevel: m_nLevel, then m_nHitPoint = GetMaxHitPoint()
    expect([bob.level, bob.maxHp, bob.hp]).toEqual([8, 240, 240]);
    world.apply(PLAYER, { type: 'setPointParam', param: DstParam.HP, value: 999 });
    expect(bob.hp).toBe(240);
    world.apply(PLAYER, { type: 'moverDeath', attackerId: MONSTER, message: ActMsg.DAMAGE });
    world.apply(PLAYER, { type: 'revivalToLodestar' });
    expect(bob.hp).toBe(96); // 240 * 4 / 10 at level 8 (OnRevivalLodestar, DPClient.cpp:3492-3501)
  });

  it('it swings at its attack speed: GetAttackSpeed of its job, right-hand item, DEX and level (ProcessAniSpeed)', () => {
    const cases: Array<[number, number, number | null, number]> = [
      [1, 15, null, f32(0.8416128754615784)], // the fists (II_WEA_HAN_HAND, 0.07)
      [1, 15, WOODEN_SWORD.id, f32(0.8432520031929016)],
      [15, 45, WOODEN_SWORD.id, f32(0.9412389993667603)],
      // an item the catalog has no row for: fItem stays 1.0f (MoverAttack.cpp:162-166)
      [1, 15, 9999, attackSpeed(VAGRANT, 1, 1, 15).speed],
    ];
    for (const [level, dex, weapon, speed] of cases) {
      const { world } = combatWorld();
      add(world, aibatt(MONSTER));
      add(world, playerWith(level, 15, dex, weapon));
      const bob = world.movers.get(PLAYER)!;
      expect(bob.act.sendActMsg(ActMsg.ATK1, MONSTER, 0, 0)).toBe(true);
      expect(bob.act.aniSpeed, `level ${level}, DEX ${dex}, item ${weapon}`).toBe(speed);
      hitFrames(bob, []);
      world.step();
      expect(bob.act.aniSpeed).toBe(speed);
    }
  });
});

describe('WorldState: the other fight messages', () => {
  it('another mover\'s MELEE_ATTACK plays its swing facing the target (OnMeleeAttack, DPClient.cpp:3802-3815)', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, [103, 0, 100], { angle: 0 })); // 3 m east of the own mover
    const monster = world.movers.get(MONSTER)!;
    world.takeChanges();
    world.apply(MONSTER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: OWN_ID, param2: 0, param3: 0x00010000 });
    expect(monster.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    expect([monster.act.motion, monster.act.loop]).toEqual([Mti.ATK1, AniLoop.ONE_PLAY]);
    expect(monster.act.stateFlag & ObjStaF.COMBAT).toBe(ObjStaF.COMBAT);
    expect(monster.act.body.angle).toBe(270); // GetDegree to the target, west
    expect(world.takeChanges().combat).toEqual([{ kind: 'swing', attackerId: MONSTER, targetId: OWN_ID }]);
    // one under way keeps the next for its end, and one at a mover not in view is refused: neither is a swing yet
    world.apply(MONSTER, { type: 'meleeAttack', message: ActMsg.ATK2, targetId: OWN_ID, param2: 0, param3: 0x00010000 });
    world.apply(MONSTER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: 77, param2: 0, param3: 0x00010000 });
    expect(world.takeChanges().combat).toEqual([]);
  });

  it('a swing\'s hit frame flinches the victim, says where the hit lands and holds a player\'s model 5 steps', () => {
    // OnAttackMelee (MoverActEvent.cpp:1592-1726) → OnDamage → OnDamageMsgC (ActionMoverDmg.cpp:54-122)
    const { world, self } = combatWorld();
    add(world, aibatt(MONSTER));
    const monster = world.movers.get(MONSTER)!;
    monster.act.rand = () => 0;
    monster.act.isEndFrame = () => false; // its flinch plays on after the step it took it in
    expect(self.act.sendActMsg(ActMsg.ATK1, MONSTER, 0, 0)).toBe(true);
    world.takeChanges();
    hitFrames(self, [-1, 0]);
    world.step();
    expect(world.takeChanges().combat).toEqual([]);
    world.step();
    // the victim's model flashes (OnDamage, :1522-1538), the blow lands, then the attacker's flashes too (:1704-1717)
    expect(world.takeChanges().combat).toEqual([
      spark(MONSTER, OWN_ID), { kind: 'attackerHit', attackerId: OWN_ID, victimId: MONSTER, weapon: WOODEN_SWORD.id },
      spark(OWN_ID, MONSTER),
    ]);
    expect(monster.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG);
    expect(monster.act.motion).toBe(Mti.DMG1);
    expect(self.act.paused).toBe(5);
    expect(monster.hp).toBe(120); // the client's hit changes no HP: DAMAGE does
  });

  it('a monster\'s hit holds neither model; its hand item is its dwAtk1 (m_dwVirtItem, Mover.cpp:1536, :2960-2966)', () => {
    const { world, self } = combatWorld();
    add(world, aibatt(MONSTER));
    const monster = world.movers.get(MONSTER)!;
    world.apply(MONSTER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: OWN_ID, param2: 0, param3: 0x00010000 });
    self.act.pause(3);
    world.takeChanges();
    hitFrames(monster, [0]);
    world.step();
    expect(world.takeChanges().combat).toEqual([
      spark(OWN_ID, MONSTER), { kind: 'attackerHit', attackerId: MONSTER, victimId: OWN_ID, weapon: AIBATT_ATK1 }, spark(MONSTER, OWN_ID),
    ]);
    expect(self.act.state & ObjSta.DMG_ALL).toBe(ObjSta.DMG);
    expect([monster.act.paused, self.act.paused]).toEqual([0, 0]);
  });

  it('a monster whose dwAtk1 is `=` (NULL_ID) attacks with no item: GetActiveHandItemProp gives none', () => {
    const { world } = combatWorld();
    add(world, npcOf(MONSTER, AIBATT_TWIN, '', { pos: [101, 0, 100], hitPoint: 200, state: ObjSta.STAND, belligerence: 3 }));
    const monster = world.movers.get(MONSTER)!;
    world.apply(MONSTER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: OWN_ID, param2: 0, param3: 0x00010000 });
    world.takeChanges();
    hitFrames(monster, [0]);
    world.step();
    expect(world.takeChanges().combat.filter((e) => e.kind === 'attackerHit')).toEqual([
      { kind: 'attackerHit', attackerId: MONSTER, victimId: OWN_ID, weapon: null },
    ]);
  });

  it('a hit lands on no mover in a dead state (OnDamageMsgC, :59-60) nor on one that cannot be killed (PreProcessDamage)', () => {
    const { world } = combatWorld();
    const juria = 7;
    add(world, aibatt(MONSTER));
    add(world, npcOf(juria, JURIA, '', { pos: [99, 0, 100], state: ObjSta.STAND }));
    add(world, playerOf(PLAYER, 'Bob', { pos: [100, 0, 101], state: ObjSta.STAND }));
    add(world, playerOf(PLAYER + 1, 'Carol', { pos: [100, 0, 99], state: ObjSta.STAND }));
    const [monster, bob, carol] = [world.movers.get(MONSTER)!, world.movers.get(PLAYER)!, world.movers.get(PLAYER + 1)!];
    expect(carol.name).toBe('Carol');
    expect(bob.act.sendActMsg(ActMsg.ATK1, MONSTER, 0, 0)).toBe(true);
    expect(carol.act.sendActMsg(ActMsg.ATK1, juria, 0, 0)).toBe(true);
    // the monster dies under the swing, its HP not yet 0: live to the rules (IsLive), so the hit frame is passed on
    monster.act.sendActMsg(ActMsg.DIE, 0, NULL_ID);
    hitFrames(bob, [0]);
    hitFrames(carol, [0]);
    world.takeChanges();
    world.step();
    // OnDamage flashes the victim's model before the blow is tried (:1522-1538), and no more comes of either
    expect(world.takeChanges().combat).toEqual([spark(MONSTER, PLAYER), spark(juria, PLAYER + 1)]);
    expect([bob.act.paused, carol.act.paused]).toEqual([0, 0]);
    expect(world.movers.get(juria)!.act.state & ObjSta.DMG_ALL).toBe(0);
  });

  it('another player\'s hand item is its worn weapon (m_aEquipInfo[PARTS_RWEAPON]), or the fists\' (II_WEA_HAN_HAND)', () => {
    // GetActiveHandItemProp (Mover.cpp:2930-2948), whose dwSfxObj3 and dwSfxObj5 OnDamageMsgC plays
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, [100, 0, 102]));
    add(world, playerOf(PLAYER, 'Bare', { pos: [100, 0, 101], state: ObjSta.STAND }));
    const armed = playerOf(PLAYER + 1, 'Armed', { pos: [100, 0, 103], state: ObjSta.STAND });
    armed.player!.worn = [{ part: 10, itemId: WOODEN_SWORD.id, flag: 0 }];
    add(world, armed);
    for (const attacker of [PLAYER, PLAYER + 1]) {
      const m = world.movers.get(attacker)!;
      expect(m.act.sendActMsg(ActMsg.ATK1, MONSTER, 0, 0)).toBe(true);
      hitFrames(m, [0]);
    }
    world.takeChanges();
    world.step();
    expect(world.takeChanges().combat.filter((e) => e.kind === 'attackerHit')).toEqual([
      { kind: 'attackerHit', attackerId: PLAYER, victimId: MONSTER, weapon: 11 },
      { kind: 'attackerHit', attackerId: PLAYER + 1, victimId: MONSTER, weapon: WOODEN_SWORD.id },
    ]);
  });

  it('SETLEVEL of another player plays the level up on it when standing (OnSetLevel, DPClient.cpp:3339-3359)', () => {
    const { world } = combatWorld();
    add(world, playerOf(PLAYER, 'Bob', { state: ObjSta.STAND }));
    add(world, playerOf(PLAYER + 1, 'Runner', { state: ObjSta.FMOVE }));
    const [bob, runner] = [world.movers.get(PLAYER)!, world.movers.get(PLAYER + 1)!];
    world.takeChanges();
    world.apply(PLAYER, { type: 'setLevel', level: 3 });
    world.apply(PLAYER + 1, { type: 'setLevel', level: 3 });
    expect([bob.level, runner.level]).toEqual([3, 3]);
    expect([bob.act.motion, bob.act.motionOption]).toEqual([Mti.LEVELUP, Mop.FIXED]);
    expect(runner.act.motion).toBe(Mti.STAND); // not standing: no motion, the effect all the same
    expect(world.takeChanges().combat).toEqual([{ kind: 'levelUp', moverId: PLAYER }, { kind: 'levelUp', moverId: PLAYER + 1 }]);
    world.apply(PLAYER, { type: 'setLevel', level: 2 }); // lower: no level up, but the level and the HP all the same
    expect([bob.level, bob.hp]).toEqual([2, 230]);
    expect(world.takeChanges().combat).toEqual([]);
  });

  it('the own job change plays the level-up motion only when standing, its effect and its event (OnSetChangeJob, DPClient.cpp:3632-3641)', () => {
    const { world, own, self } = combatWorld();
    const skills = Array.from({ length: 45 }, (_, i) => ({ skill: i + 1, level: 0 }));
    world.apply(OWN_ID, { type: 'setJobSkill', job: 1, skills });
    expect(own.job).toBe(1);
    expect([self.act.motion, self.act.motionOption]).toEqual([Mti.LEVELUP, Mop.FIXED]);
    const changes = world.takeChanges();
    expect(changes.combat).toEqual([{ kind: 'jobChanged', moverId: OWN_ID }]);
    expect(changes.own).toEqual([{ kind: 'jobChanged', job: 1, title: 'Mercenary' }]);
  });

  it("another player's job change sets its job, and its HP max follows; running, it plays no motion (OnSetNearChangeJob, :3680-3703)", () => {
    const { world } = combatWorld();
    add(world, playerOf(PLAYER, 'Bob', { state: ObjSta.STAND }));
    add(world, playerOf(PLAYER + 1, 'Runner', { state: ObjSta.FMOVE }));
    const [bob, runner] = [world.movers.get(PLAYER)!, world.movers.get(PLAYER + 1)!];
    world.apply(PLAYER, { type: 'setLevel', level: 15 });
    expect(bob.maxHp).toBe(265);
    world.takeChanges();
    const skills = Array.from({ length: 20 }, (_, i) => ({ skill: i + 7, level: 0 }));
    world.apply(PLAYER, { type: 'setNearJobSkill', job: 1, skills });
    world.apply(PLAYER + 1, { type: 'setNearJobSkill', job: 1, skills });
    expect([bob.added.player!.job, bob.maxHp]).toEqual([1, 288]);
    expect([bob.act.motion, bob.act.motionOption]).toEqual([Mti.LEVELUP, Mop.FIXED]);
    expect(runner.act.motion).toBe(Mti.STAND);
    expect(world.takeChanges().combat).toEqual([
      { kind: 'jobChanged', moverId: PLAYER }, { kind: 'jobChanged', moverId: PLAYER + 1 },
    ]);
  });

  it('a job change of a mover not in view is read and dropped', () => {
    const { world } = combatWorld();
    world.apply(PLAYER + 9, { type: 'setNearJobSkill', job: 1, skills: [] });
    expect(world.takeChanges().combat).toEqual([]);
  });

  it('SETLEVEL sets a mover\'s HP to its max (m_nHitPoint = GetMaxHitPoint())', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, AT, { hitPoint: 40 }));
    world.apply(MONSTER, { type: 'setLevel', level: 1 });
    expect(world.movers.get(MONSTER)!.hp).toBe(120);
  });

  it('CORRREQ puts the monster where the server has it (OnCorrReq, DPClient.cpp:10015-10028)', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    world.apply(MONSTER, { type: 'corrReq', pos: [110.5, 1, 99], attackerId: OWN_ID });
    expect(world.movers.get(MONSTER)!.act.body.pos).toEqual([110.5, 1, 99]);
  });

  it('a revival clears another mover\'s state; REVIVAL_TO_LODESTAR also gives it the level\'s part of its max HP', () => {
    const { world } = combatWorld();
    add(world, playerOf(PLAYER, 'Bob'));
    const bob = world.movers.get(PLAYER)!;
    world.apply(PLAYER, { type: 'moverDeath', attackerId: MONSTER, message: ActMsg.DAMAGE });
    world.apply(PLAYER, { type: 'revival' });
    expect([bob.act.state, bob.hp]).toEqual([0, 0]); // OnRevival's HP lines are __VER < 9
    world.apply(PLAYER, { type: 'moverDeath', attackerId: MONSTER, message: ActMsg.DAMAGE });
    world.apply(PLAYER, { type: 'revivalToLodestar' });
    expect([bob.act.state, bob.hp]).toEqual([0, 184]); // 230 * 8 / 10 at level 1
  });

  it('DEFINEDTEXT is a text whatever its object ID (OnDefinedText, DPClient.cpp:4117)', () => {
    const { world } = combatWorld();
    world.apply(OWN_ID, { type: 'definedText', textId: 1234, args: '"Aibatt"' });
    world.apply(999, { type: 'definedText', textId: 77, args: '' });
    expect(world.takeChanges().combat).toEqual([
      { kind: 'text', textId: 1234, args: '"Aibatt"' }, { kind: 'text', textId: 77, args: '' },
    ]);
  });

  it('MONSTERPROP 150% sets the Aibatt\'s max HP to 180', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    add(world, npcOf(3, AIBATT_TWIN, '', { hitPoint: 200 }));
    const monster = world.movers.get(MONSTER)!;
    // OnMonsterProp (DPClient.cpp:6630-6698) names no mover; GetMoverProp( szName ) is the first row of that name
    world.apply(NULL_ID, { type: 'monsterProp', rates: [rate('Aibatt', 150), rate('Nobody', 300)], removed: [] });
    expect(monster.maxHp).toBe(180);
    expect(monster.hp).toBe(120); // the HP is not changed, only its max
    expect(world.movers.get(3)!.maxHp).toBe(200);
    add(world, aibatt(MONSTER + 10));
    expect(world.movers.get(MONSTER + 10)!.maxHp).toBe(180);
    world.apply(MONSTER, { type: 'setPointParam', param: DstParam.HP, value: 175 });
    expect(monster.hp).toBe(175);
    world.apply(NULL_ID, { type: 'monsterProp', rates: [], removed: ['Aibatt'] });
    expect(monster.maxHp).toBe(120);
  });

  it('a mover\'s level and max HP: a player\'s level from ADD_OBJ; another mover\'s dwLevel, at least 1 (CMover::InitProp)', () => {
    const { world } = combatWorld();
    const veteran = playerOf(PLAYER, 'Veteran');
    Object.assign(veteran.player!, { level: 15, sta: 45 });
    add(world, veteran);
    expect([world.movers.get(PLAYER)!.level, world.movers.get(PLAYER)!.maxHp]).toEqual([15, 581]);
    add(world, npcOf(3, AIBATT_TWIN));
    add(world, npcOf(6, JURIA, 'nobody'));
    add(world, npcOf(7, 999));
    expect([world.movers.get(3)!.level, world.movers.get(3)!.maxHp]).toEqual([4, 200]);
    expect([world.movers.get(6)!.level, world.movers.get(6)!.maxHp]).toEqual([1, 50]);
    expect([world.movers.get(7)!.level, world.movers.get(7)!.maxHp]).toEqual([1, null]); // no row
  });

  it('a monster added 20 m away emits spawned, and one 40 m away doesn\'t', () => {
    // OnAddObj (DPClient.cpp:1215-1228): a mover that is not a player, within 32 m of the own mover on the ground
    const { world } = combatWorld();
    add(world, aibatt(MONSTER, [120, 0, 100]));
    add(world, aibatt(MONSTER + 1, [140, 0, 100]));
    add(world, aibatt(MONSTER + 2, [100, 50, 131])); // 31 m on the ground, whatever the height
    add(world, npcOf(6, JURIA, 'MaFl_Juria', { pos: [110, 0, 100] })); // an NPC is not a player either
    add(world, playerOf(PLAYER, 'Bob', { pos: [101, 0, 100] }));
    expect(world.takeChanges().combat).toEqual([
      { kind: 'spawned', moverId: MONSTER }, { kind: 'spawned', moverId: MONSTER + 2 }, { kind: 'spawned', moverId: 6 },
    ]);
    // in the JOIN bundle (fJoin, :909-911, 1220) nothing spawns
    world.apply(MONSTER + 3, { type: 'addMover', mover: aibatt(MONSTER + 3, [110, 0, 100]) }, true);
    expect(world.takeChanges().combat).toEqual([]);
  });

  it('no spawn without the own mover in view', () => {
    const { world } = newWorld(combatData());
    add(world, aibatt(MONSTER, AT));
    expect(world.takeChanges().combat).toEqual([]);
  });

  it('the drawing events a hidden tab never takes are kept to the last 1024, the drops counted; the texts are all kept', () => {
    const { world } = combatWorld();
    add(world, aibatt(MONSTER));
    world.takeChanges();
    world.apply(OWN_ID, { type: 'definedText', textId: 1, args: '' });
    for (let i = 0; i < 1500; i++) world.apply(MONSTER, damage(OWN_ID, i));
    world.apply(OWN_ID, { type: 'definedText', textId: 2, args: '' });
    const { combat, dropped } = world.takeChanges();
    // Neuz logs every text (OnDefinedText): they are never dropped, and keep their place
    expect(combat.filter((e) => e.kind === 'text')).toEqual([
      { kind: 'text', textId: 1, args: '' }, { kind: 'text', textId: 2, args: '' },
    ]);
    expect(combat[0]).toEqual({ kind: 'text', textId: 1, args: '' });
    const hits = combat.filter((e) => e.kind === 'hit');
    expect(hits).toHaveLength(1024);
    expect([hits[0], hits.at(-1)]).toEqual([hitEvent(MONSTER, OWN_ID, 1500 - 1024), hitEvent(MONSTER, OWN_ID, 1499)]);
    expect(dropped).toBe(1500 - 1024);
    // the count starts again with each call
    world.apply(MONSTER, damage(OWN_ID, 1));
    expect(world.takeChanges()).toMatchObject({ dropped: 0 });
  });
});

// ---- the game data ------------------------------------------------------------------------------------------------

describe('loadGameData', () => {
  it('loadGameData reads the game-data keys', async () => {
    const files = catalogFiles({
      [GAME_DATA_KEYS.movers]: [moverProp(11, 'Male', 0.1), moverProp(20, 'Aibatt', 0.2, AII_MONSTER)],
      [GAME_DATA_KEYS.items]: [
        { id: 500, part: 6, male: 'models/part_mvag02cap.glb', female: 'models/part_fvag02cap.glb' },
      ],
      [GAME_DATA_KEYS.npcs]: [{ key: 'MaFl_Mikyel', name: 'Mikyel' }, { key: 'MaDa_Cooky', name: 'Cooky' }],
      [GAME_DATA_KEYS.honorTitles]: { '0': 'Master Collector', '12': 'Entrepreneur' },
      [GAME_DATA_KEYS.worlds]: { '1': 'wdmadrigal', '40': 'wdheaven06', '41': 'wdheaven06_1' },
    });
    const store = storeOf(files);
    const data = await loadGameData(store);

    expect(store.asked.sort()).toEqual(Object.values(GAME_DATA_KEYS).sort());
    expect([...data.movers.keys()]).toEqual([11, 20]); // numbers, not the JSON's text
    expect(data.movers.get(20)!.name).toBe('Aibatt');
    expect([...data.items.keys()]).toEqual([500]);
    expect(data.items.get(500)!.part).toBe(6);
    expect([...data.npcs.keys()]).toEqual(['mafl_mikyel', 'mada_cooky']); // lower-cased, as GetCharacter looks them up
    expect(data.npcs.get('mafl_mikyel')).toEqual({ key: 'MaFl_Mikyel', name: 'Mikyel' });
    expect(data.nameColors).toEqual({ general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb });
    expect([...data.honorTitles]).toEqual([[0, 'Master Collector'], [12, 'Entrepreneur']]);
    // world id (WI_*) to the web folder: numbers, not the JSON's text
    expect([...data.worlds]).toEqual([[1, 'wdmadrigal'], [40, 'wdheaven06'], [41, 'wdheaven06_1']]);
    expect(data.worlds.get(1)).toBe('wdmadrigal');
  });

  it('a mover of a movers.json from before the converter kept dwFlying is not flying', async () => {
    const old = { index: 20, name: 'Aibatt', speed: 0.2, ai: AII_MONSTER, model: null, skeleton: null, motions: {} };
    const files = catalogFiles({ [GAME_DATA_KEYS.movers]: [old, moverProp(22, 'Mothbee', 0.2, AII_MONSTER, true)] });
    const data = await loadGameData(storeOf(files));
    expect(data.movers.get(20)!.flying).toBe(false);
    expect(data.movers.get(22)!.flying).toBe(true);
  });

  it('a catalog the asset index does not list means game files from an older version, named, and nothing is fetched', async () => {
    const files = catalogFiles();
    delete files[GAME_DATA_KEYS.honorTitles];
    delete files[GAME_DATA_KEYS.worlds];
    const store = storeOf(files);
    const failure = await loadGameData(store).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameDataMissingError);
    expect((failure as GameDataMissingError).keys).toEqual([GAME_DATA_KEYS.honorTitles, GAME_DATA_KEYS.worlds]);
    expect((failure as Error).message).toContain('data/worlds.json');
    expect(store.asked).toEqual([]);
  });

  it('a character defined twice keeps the later one, as CProject::LoadCharacter does', async () => {
    const data = await loadGameData(storeOf(catalogFiles({
      [GAME_DATA_KEYS.npcs]: [{ key: 'Abc', name: 'First' }, { key: 'aBC', name: 'Second' }],
    })));
    expect(data.npcs.size).toBe(1);
    expect(data.npcs.get('abc')!.name).toBe('Second');
  });

  it('fails when a catalog cannot be loaded, and that is not the out-of-date failure', async () => {
    const failure = await loadGameData(storeOf({}, Object.values(GAME_DATA_KEYS))).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GameDataMissingError);
    expect((failure as Error).message).toMatch(/^no data\//);
  });
});

describe('WorldState: the thrown yoyo (_ProcessStateAttack, ActionMoverState.cpp:1040-1078; Piece 7 M2)', () => {
  /** `II_WEA_YOY_ITUN` (`propItem.txt:762`): IK3_YOYO, thrown as XI_ITEM_YOYO_ATK1 116. */
  const ITUN = itemProp({ id: 381, name: 'Itun Yoyo', kind1: 1, kind2: 2, kind3: 11, handed: 2, part: 10, attackRange: 6, sfxMissile: 116 });
  const RIGHT: Vec3 = [100.2, 1, 105];
  const LEFT: Vec3 = [99.8, 1, 105];

  it("a yoyo's quake frame throws from the right hand on ATK1 and the left on ATK2", () => {
    const base = combatData();
    const data = { ...base, itemProps: new Map([...base.itemProps, [ITUN.id, ITUN]]) };
    const { world } = newWorld(data);
    add(world, playerOf(PLAYER, 'Acro', { pos: [100, 0, 105], angle: 90 }));
    const player = world.movers.get(PLAYER)!;
    player.added.player!.worn = [{ part: 10, itemId: ITUN.id, flag: 0 }];
    add(world, aibatt(MONSTER, [104, 0, 105]));
    world.takeChanges();
    const launched: unknown[] = [];
    world.missiles = { launch: (l) => { launched.push(l); return launched.length; } };
    world.handOf = (_id, hand) => (hand === 'right' ? RIGHT : LEFT);

    const quakes = [false, true];
    player.act.isEndFrame = () => false;
    player.act.isAttrQuake = () => quakes.shift() ?? false;
    world.apply(PLAYER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: MONSTER, param2: 0, param3: 0x00010000 });
    steps(world, 3);
    expect(launched).toEqual([{
      cls: 'yoyo', sourceId: PLAYER, targetId: MONSTER, from: RIGHT, flightXi: 116, hitXi: -1, scale: 1, report: null,
      yoyo: { hand: 'right', sourceAt: player.act.body.pos, dest: [104, 1, 105] },
    }]);

    // the swing over, ATK2: its quake throws from the left hand
    player.act.isEndFrame = () => true;
    steps(world, 1);
    player.act.isEndFrame = () => false;
    world.apply(PLAYER, { type: 'meleeAttack', message: ActMsg.ATK2, targetId: MONSTER, param2: 0, param3: 0x00010000 });
    quakes.push(true);
    steps(world, 2);
    expect(launched).toHaveLength(2);
    expect(launched[1]).toMatchObject({ from: LEFT, yoyo: { hand: 'left' } });

    // a sword's quake frame throws nothing
    player.added.player!.worn = [{ part: 10, itemId: WOODEN_SWORD.id, flag: 0 }];
    player.act.isEndFrame = () => true;
    steps(world, 1);
    player.act.isEndFrame = () => false;
    world.apply(PLAYER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: MONSTER, param2: 0, param3: 0x00010000 });
    quakes.push(true);
    steps(world, 2);
    expect(launched).toHaveLength(2);
  });
});

describe('WorldState: the shots of others and of the own player (OnMagicAttack, OnRangeAttack, OnCreateSfxAllow; Piece 7 M2)', () => {
  /** `II_WEA_WAN_SEAL` (`propItem.txt:739`, `defineItem.h:130`: 231): IK3_WAND, its missile XI_FIR_WAND01. */
  const SEAL_WAND = itemProp({ id: 231, name: 'Seal Wand', kind1: 1, kind2: 3, kind3: 6, handed: 1, part: 10, attackRange: 4, sfxMissile: 27 });
  /** A monster's ranged attack item: WT_RANGE, thrown as XI_NPC_RAN_MAGICBALL (a CSfxItemWandAtk1, `CreateObj.cpp:69-75`). */
  const MAGIC_BALL_ID = 9100;
  const MAGIC_BALL = itemProp({ id: MAGIC_BALL_ID, name: 'Magic Ball', kind1: 1, kind2: 2, kind3: 0, weaponType: 8, sfxMissile: 1602 });
  const LEFT: Vec3 = [99.8, 1.2, 105];

  /** A world with the Seal Wand and the Magic Ball in its catalog; with `equipment`, the own level 15 player in it too. */
  function shotWorld(equipment?: number[]) {
    const base = combatData();
    const data = { ...base, itemProps: new Map([...base.itemProps, [SEAL_WAND.id, SEAL_WAND], [MAGIC_BALL.id, MAGIC_BALL]]) };
    const added: AddedMover = { ...ownAdded(15), pos: AT, angle: 90, state: ObjSta.STAND };
    const own = equipment === undefined ? undefined : new OwnState(data, added, equipment);
    const { world } = newWorld(data, terrainGround(() => 0), own);
    if (own !== undefined) world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
    return { world };
  }
  const launches = (world: WorldState) => {
    const launched: Array<Record<string, unknown>> = [];
    world.missiles = { launch: (l) => { launched.push(l as unknown as Record<string, unknown>); return launched.length; } };
    return launched;
  };
  const magicAttack = (targetId: number, power: number, sfxHitId = 0): WorldMessage =>
    ({ type: 'magicAttack', message: ActMsg.ATK_MAGIC1, targetId, param2: 0, param3: 0, power, sfxHitId });

  it("another player's MAGIC_ATTACK plays ATK_MAGIC1 and its missile flies without a report", () => {
    const { world } = shotWorld();
    add(world, playerOf(PLAYER, 'Mage', { pos: [100, 0, 105] }));
    const mage = world.movers.get(PLAYER)!;
    mage.added.player!.worn = [{ part: 10, itemId: SEAL_WAND.id, flag: 0 }];
    add(world, aibatt(MONSTER, [104, 0, 105]));
    world.takeChanges();
    const launched = launches(world);
    hitFrames(mage, [-1, 0]);
    world.apply(PLAYER, magicAttack(MONSTER, 2, 9));
    expect(mage.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_MAGIC1);
    expect(mage.act.body.angle).toBe(90); // facing the Aibatt, east
    steps(world, 2);
    expect(launched).toEqual([{
      cls: 'wand', sourceId: PLAYER, targetId: MONSTER, from: [100, 1, 105], flightXi: 27, hitXi: 22, scale: 1.7, report: null,
    }]);
  });

  it('a busy mover keeps the magic attack for the end of its swing', () => {
    const { world } = shotWorld();
    add(world, playerOf(PLAYER, 'Mage', { pos: [100, 0, 105] }));
    const mage = world.movers.get(PLAYER)!;
    mage.added.player!.worn = [{ part: 10, itemId: SEAL_WAND.id, flag: 0 }];
    add(world, aibatt(MONSTER, [104, 0, 105]));
    world.takeChanges();
    mage.act.isEndFrame = () => false;
    world.apply(PLAYER, { type: 'meleeAttack', message: ActMsg.ATK1, targetId: MONSTER, param2: 0, param3: 0x00010000 });
    world.apply(PLAYER, magicAttack(MONSTER, 1));
    expect(mage.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK1);
    mage.act.isEndFrame = () => true;
    steps(world, 1);
    expect(mage.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_MAGIC1);
  });

  it("CREATESFXALLOW flies an arrow from the shooter's left hand to the target + 1 m", () => {
    const { world } = shotWorld();
    add(world, playerOf(PLAYER, 'Acro', { pos: [100, 0, 105] }));
    add(world, aibatt(MONSTER, [104, 0, 105]));
    world.takeChanges();
    const launched = launches(world);
    world.handOf = (id, hand) => (id === PLAYER && hand === 'left' ? LEFT : null);
    world.apply(PLAYER, { type: 'createSfxAllow', arrowXi: 112, hitXi: 33, pos: [0, 0, 0], targetId: MONSTER });
    expect(launched).toEqual([{
      cls: 'arrow', sourceId: PLAYER, targetId: MONSTER, from: LEFT, flightXi: 112, hitXi: 33, scale: 1, report: null,
    }]);
    // at a target out of view, none
    world.apply(PLAYER, { type: 'createSfxAllow', arrowXi: 112, hitXi: 33, pos: [0, 0, 0], targetId: 999 });
    expect(launched).toHaveLength(1);
  });

  it("a monster's RANGE_ATTACK at the own player reports its hit with the monster as the attacker", () => {
    const { world } = shotWorld(STARTER_EQUIPMENT);
    add(world, aibatt(MONSTER, [104, 0, 100]));
    world.takeChanges();
    const reports: unknown[][] = [];
    const missiles = new Missiles({
      hit: (...a: unknown[]) => void reports.push(['hit', ...a]),
      clear: (...a: unknown[]) => void reports.push(['clear', ...a]),
    });
    world.missiles = missiles;
    const monster = world.movers.get(MONSTER)!;
    hitFrames(monster, [-1, 0]);
    world.apply(MONSTER, { type: 'rangeAttack', message: ActMsg.ATK_RANGE1, targetId: OWN_ID, param2: MAGIC_BALL_ID, param3: 0, sfxHitId: 77 });
    expect(monster.act.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_RANGE1);
    steps(world, 2);
    expect(missiles.views().map((v) => v.xi)).toEqual([1602]);
    for (let i = 0; i < 60 && reports.length === 0; i++) missiles.step({ movers: world.movers, boxOf: () => undefined });
    expect(reports).toEqual([['hit', 77, 0, NULL_ID, MONSTER, 0, 0, 0]]);
  });

  it("the own wand's hit frame registers SFX_ID once and launches a missile carrying that id", () => {
    const { world } = shotWorld([502, 506, 510, SEAL_WAND.id]);
    add(world, aibatt(MONSTER, [104, 0, 100]));
    world.takeChanges();
    const self = world.self()!;
    const launched = launches(world);
    const registered: unknown[][] = [];
    world.shots = { register: (...a: unknown[]) => { registered.push(a); return 5; } };
    hitFrames(self, [-1, 0]);
    expect(self.act.sendActMsg(ActMsg.ATK_MAGIC1, MONSTER)).toBe(true);
    self.shot = { targetId: MONSTER, power: 3, sfxHitId: 0 };
    steps(world, 3);
    expect(registered).toEqual([[MONSTER, AttackFlag.MAGIC]]);
    expect(launched).toEqual([{
      cls: 'wand', sourceId: OWN_ID, targetId: MONSTER, from: [100, 1, 100], flightXi: 27, hitXi: 22, scale: 2.5,
      report: { sfxHitId: 5, power: 3, skill: NULL_ID },
    }]);
  });
});

describe('WorldState: magic casting (DoUseSkill KT_MAGIC, OnMagicSkill; Piece 7 M2)', () => {
  const level = (castingTime: number) => ({ reqMp: 5, reqFp: -1, cooldown: -1, skillCount: -1, castingTime, skillTime: -1, painTime: -1 });
  /** `SI_ASS_HEAL_HEALING` (`propSkill.txt`): KT_MAGIC, a cast of 1066 (wind), its cast effect XI 275, on another (EXT_ANOTHERWITH). */
  const HEALING = {
    id: 44, name: 'Healing', jobType: 1, job: 2, handed: -1, attackRange: 5, reqLevel: 15, reqSkills: [], useMotion: 1066,
    sfxHit: 285, exeTarget: 9, useChance: 1, skillType: 1, evildoing: -1, maxLevel: 20, comboStyle: 0, description: '', icon: null,
    sfxCast: 275, levels: [level(600)],
  } as unknown as import('@flyffweb/formats').WebSkill;
  /** `SI_MAG_MAG_MENTALSTRIKE`: KT_MAGIC, a shot, a cast of 1063 (fire) with XI 274. */
  const MENTAL_STRIKE = { ...HEALING, id: 121, name: 'Mental Strike', exeTarget: 14, useMotion: 1063, sfxCast: 274 } as typeof HEALING;
  const OTHER_PLAYER = 6;

  function castWorld() {
    const base = combatData();
    const data = {
      ...base,
      skills: new Map([[HEALING.id, HEALING], [MENTAL_STRIKE.id, MENTAL_STRIKE]]),
      texts: new Map([
        ['TID_GAME_SKILL_SELF', { id: 'TID_GAME_SKILL_SELF', text: 'You use %s.', color: 0xffffffff, textId: 700 }],
        ['TID_GAME_SKILL_MATE', { id: 'TID_GAME_SKILL_MATE', text: '%s uses %s.', color: 0xffffffff, textId: 701 }],
      ]),
    };
    const added: AddedMover = { ...ownAdded(15), pos: AT, angle: 90, state: ObjSta.STAND };
    const own = new OwnState(data, added, STARTER_EQUIPMENT);
    const { world } = newWorld(data, terrainGround(() => 0), own);
    world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
    add(world, playerOf(PLAYER, 'Assist', { pos: [100, 0, 103] }));
    add(world, playerOf(OTHER_PLAYER, 'Mate', { pos: [102, 0, 103] }));
    add(world, aibatt(MONSTER, [104, 0, 100]));
    world.takeChanges();
    return { world, assist: world.movers.get(PLAYER)! };
  }
  const useSkill = (skill: number, targetId: number, castingTime: number, useType = 0): WorldMessage =>
    ({ type: 'useSkill', skill, level: 1, targetId, useType, castingTime });

  it('a KT_MAGIC USESKILL begins the cast with MAGICCASTING, or MAGICSKILL + 2 when queued or with no cast time', () => {
    const { world, assist } = castWorld();
    world.apply(PLAYER, useSkill(MENTAL_STRIKE.id, MONSTER, 9));
    expect([assist.act.state & ObjSta.ATK_ALL, assist.act.motion]).toEqual([ObjSta.ATK_CASTING1, 1063]);
    expect(assist.act.skillAct).toEqual({ skill: MENTAL_STRIKE.id, targetId: MONSTER, level: 1 });
    world.apply(PLAYER, useSkill(MENTAL_STRIKE.id, MONSTER, 0, 2)); // SUT_QUEUEING
    expect([assist.act.state & ObjSta.ATK_ALL, assist.act.motion]).toEqual([ObjSta.ATK_MAGICSKILL, 1065]);
    world.apply(PLAYER, useSkill(MENTAL_STRIKE.id, MONSTER, 0));
    expect([assist.act.state & ObjSta.ATK_ALL, assist.act.motion]).toEqual([ObjSta.ATK_MAGICSKILL, 1065]);
  });

  it('Healing at a dead target begins nothing', () => {
    const { world, assist } = castWorld();
    world.apply(OTHER_PLAYER, { type: 'setPointParam', param: DstParam.HP, value: 0 });
    world.movers.get(OTHER_PLAYER)!.act.sendActMsg(ActMsg.DIE, 0, 0);
    world.apply(PLAYER, useSkill(HEALING.id, OTHER_PLAYER, 9));
    expect(assist.act.state & ObjSta.ATK_ALL).toBe(0);
  });

  it('a heal on another player prints "%s uses %s." to that player and "You use %s." to the caster', () => {
    const { world } = castWorld();
    world.apply(PLAYER, useSkill(HEALING.id, OWN_ID, 9));
    expect(world.takeChanges().combat.filter((e) => e.kind === 'text')).toEqual([
      { kind: 'text', textId: 701, args: '"Assist" "Healing"' },
    ]);
    world.apply(OWN_ID, useSkill(HEALING.id, OTHER_PLAYER, 9));
    expect(world.takeChanges().combat.filter((e) => e.kind === 'text')).toEqual([{ kind: 'text', textId: 700, args: '"Healing"' }]);
    // an attack skill prints nothing
    world.apply(PLAYER, useSkill(MENTAL_STRIKE.id, OWN_ID, 9));
    expect(world.takeChanges().combat.filter((e) => e.kind === 'text')).toEqual([]);
  });

  it('the cast effect plays on the caster for every skill that has one', () => {
    const { world } = castWorld();
    world.apply(PLAYER, useSkill(MENTAL_STRIKE.id, MONSTER, 9));
    expect(world.takeChanges().combat.filter((e) => e.kind === 'cast')).toEqual([{ kind: 'cast', casterId: PLAYER, xi: 274 }]);
  });
});

describe('WorldState: the skills\' shots (CCtrl::ShootSkill, Ctrl.cpp:1356-1418; Piece 7 M2)', () => {
  const lv = (skillTime = -1, painTime = -1) => ({ reqMp: 5, reqFp: -1, cooldown: -1, skillCount: -1, castingTime: 0, skillTime, painTime });
  const base = {
    jobType: 1, job: 2, handed: -1, attackRange: 5, reqLevel: 15, reqSkills: [], sfxHit: -1, exeTarget: 14, useChance: 4,
    evildoing: -1, maxLevel: 20, comboStyle: 0, description: '', icon: null,
  };
  /** `SI_ACR_BOW_JUNKBOW`: KT_SKILL, a bow's, its missile XI_SKILL_ACR_BOW_JUNKBOW02 536. */
  const JUNK_BOW = { ...base, id: 204, name: 'Junk Bow', useMotion: 1100, skillType: 2, sfxMissile: 536, sfxHit: 545, linkKind: 12, levels: [lv()] } as unknown as import('@flyffweb/formats').WebSkill;
  /** `SI_MAG_FIRE_HOTAIR`: KT_MAGIC, 3 s with a hit every second. */
  const HOT_AIR = { ...base, id: 116, name: 'Hot Air', useMotion: 1063, skillType: 1, sfxMissile: 265, continuousPain: true, levels: [lv(3000, 1000)] } as unknown as import('@flyffweb/formats').WebSkill;
  /** A plain shot skill (`CSfxShoot`): `SI_MAG_FIRE_FIRESTRIKE`'s missile 236 with no class of its own. */
  const FIRE_STRIKE = { ...base, id: 111, name: 'Fire Strike', useMotion: 1063, skillType: 1, sfxMissile: 236, sfxHit: 237, levels: [lv()] } as unknown as import('@flyffweb/formats').WebSkill;

  function skillWorld() {
    const data = { ...combatData(), skills: new Map([JUNK_BOW, HOT_AIR, FIRE_STRIKE].map((s) => [s.id, s])) };
    const added: AddedMover = { ...ownAdded(15), pos: AT, angle: 90, state: ObjSta.STAND };
    const own = new OwnState(data, added, STARTER_EQUIPMENT);
    const { world } = newWorld(data, terrainGround(() => 0), own);
    world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
    add(world, playerOf(PLAYER, 'Mage', { pos: [100, 0, 103] }));
    add(world, aibatt(MONSTER, [104, 0, 100]));
    world.takeChanges();
    const launched: Array<Record<string, unknown>> = [];
    world.missiles = { launch: (l) => { launched.push(l as unknown as Record<string, unknown>); return launched.length; } };
    const registered: unknown[][] = [];
    world.shots = { register: (...a: unknown[]) => { registered.push(a); return registered.length; } };
    return { world, launched, registered, self: world.self()!, mage: world.movers.get(PLAYER)! };
  }
  const use = (skill: number, targetId: number): WorldMessage => ({ type: 'useSkill', skill, level: 1, targetId, useType: 0, castingTime: 0 });

  it("the own Junk Bow's four hit frames register four SFX_IDs with AF_MELEESKILL", () => {
    const { world, launched, registered, self } = skillWorld();
    hitFrames(self, [-1, 0, ...Array(4).fill(-1), 1, ...Array(4).fill(-1), 2, ...Array(4).fill(-1), 3]);
    self.act.modelFrame = () => ({ current: 0, max: 94 }); // SklAcrBow, 94 frames: the 65% cut far off
    world.apply(OWN_ID, use(JUNK_BOW.id, MONSTER));
    steps(world, 40); // each hit holds the model 4 steps (m_nPause)
    expect(registered).toEqual(Array(4).fill([MONSTER, AttackFlag.MELEESKILL, NULL_ID, 1]));
    expect(launched.map((l) => l.cls)).toEqual(['junkBow', 'junkBow', 'junkBow', 'junkBow']);
    expect(launched[0]).toMatchObject({ flightXi: 536, hitXi: 545, report: { sfxHitId: 1, power: 1, skill: JUNK_BOW.id } });
  });

  it('the own Hot Air registers with AF_MAGICSKILL and dwSkillTime / dwPainTime + 1', () => {
    const { world, launched, registered, self } = skillWorld();
    hitFrames(self, [-1, 0]);
    world.apply(OWN_ID, use(HOT_AIR.id, MONSTER));
    steps(world, 3);
    expect(registered).toEqual([[MONSTER, AttackFlag.MAGICSKILL, NULL_ID, 4]]);
    expect(launched).toMatchObject([{ cls: 'hotAir', flightXi: 265, hitXi: 1739, hotAir: { painTicks: 60, lastTicks: 180, maxDmgCnt: 4 } }]);
  });

  it("another player's shot skill flies and reports nothing", () => {
    const { world, launched, registered, mage } = skillWorld();
    hitFrames(mage, [-1, 0]);
    world.apply(PLAYER, use(FIRE_STRIKE.id, MONSTER));
    steps(world, 3);
    expect(registered).toEqual([]);
    expect(launched).toEqual([{
      cls: 'shoot', sourceId: PLAYER, targetId: MONSTER, from: [100, 1, 103], flightXi: 236, hitXi: 237, scale: 1, report: null,
    }]);
  });
});

describe('WorldState: the item cast (OnStateMode, DPClient.cpp:12381-12440; Piece 7 M3)', () => {
  const casting = (objectId: number, itemId?: number): AddedMover => {
    const p = playerOf(objectId, 'Late');
    p.player!.stateMode = 4;
    if (itemId !== undefined) p.player!.useItemId = itemId;
    return p;
  };

  it('STATEMODE ON starts a cast and says so', () => {
    const { world } = newWorld();
    add(world, playerOf(7, 'Caster'));
    steps(world, 6);
    world.takeChanges();
    world.apply(7, { type: 'stateMode', mode: 4, flag: 0, itemId: 4805 });
    const m = world.movers.get(7)!;
    expect(m.stateMode).toBe(4);
    expect(m.cast).toEqual({ itemId: 4805, startedAt: world.nowMs() });
    expect(world.takeChanges().combat).toContainEqual({ kind: 'itemCast', moverId: 7, itemId: 4805, fresh: true });
  });

  it('OFF and CANCEL end it', () => {
    const { world } = newWorld();
    add(world, playerOf(7, 'Caster'));
    for (const flag of [1, 2]) {
      world.apply(7, { type: 'stateMode', mode: 4, flag: 0, itemId: 4805 });
      world.apply(7, { type: 'stateMode', mode: 0, flag, itemId: null });
      const m = world.movers.get(7)!;
      expect(m.cast).toBeNull();
      expect(m.stateMode & 4).toBe(0);
    }
  });

  it('a mover added mid-cast has the effect and no clock (OnAddObj, DPClient.cpp:1380-1391)', () => {
    const { world } = newWorld();
    add(world, casting(8, 4805));
    expect(world.movers.get(8)!.cast).toEqual({ itemId: 4805, startedAt: null });
    expect(world.takeChanges().combat).toContainEqual({ kind: 'itemCast', moverId: 8, itemId: 4805, fresh: false });
    // the mode without an item (a virtual use, an Escape) has no effect
    add(world, casting(9));
    expect(world.movers.get(9)!.cast).toBeNull();
    expect(world.movers.get(9)!.stateMode).toBe(4);
    expect(world.takeChanges().combat.filter((e) => e.kind === 'itemCast')).toEqual([]);
  });
});

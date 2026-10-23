import { describe, expect, it } from 'vitest';
import type { AddedMover, MoveReport, Vec3, WorldMessage } from '@flyffweb/protocol';
import { GAME_DATA_KEYS } from '@flyffweb/formats';
import type { WebMover } from '@flyffweb/formats';
import { ServerClock } from '../src/net/serverClock';
import { GameDataMissingError, loadGameData } from '../src/world/gameData';
import type { GameData } from '../src/world/gameData';
import { terrainGround } from '../src/world/sim/collision';
import type { Ground } from '../src/world/sim/collision';
import { ActMsg, AniLoop, Mti, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';

const f32 = Math.fround;

// ---- the world's inputs -------------------------------------------------------------------------------------------

/** The server's tick when the clock starts, and the local time (ms) it starts at. */
const SERVER_TICK = 1_000_000_000_000n;
const START_MS = 1000;

/** `dwAI` values of Resource/defineNeuz.h. */
const AII_MOVER = 1;
const AII_MONSTER = 2;
const AII_CLOCKWORKS = 4;

const moverProp = (index: number, name: string, speed: number, ai = AII_MOVER, flying = false): WebMover => ({
  index, name, speed, ai, flying, model: null, skeleton: null, motions: {},
});

function gameData(): GameData {
  return {
    movers: new Map([
      [11, moverProp(11, 'Male', 0.1)],
      [20, moverProp(20, 'Aibatt', 0.2, AII_MONSTER)],
      [21, moverProp(21, 'Clockworks', 0.2, AII_CLOCKWORKS)], // the same table speed as the Aibatt
      [22, moverProp(22, 'Mothbee', 0.2, AII_MONSTER, true)], // dwFlying 1
    ]),
    items: new Map(),
    // keyed by the lower-cased key, as CProject::GetCharacter looks it up
    npcs: new Map([['mafl_mikyel', { key: 'MaFl_Mikyel', name: 'Mikyel' }]]),
    nameColors: { general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb },
    honorTitles: new Map(),
    worlds: new Map(),
  };
}

/** A world on a clock that stands at `START_MS` until the test moves `time.now`; the ground is flat at height 0. */
function newWorld(
  data: GameData = gameData(), ground: Ground = terrainGround(() => 0),
): { world: WorldState; time: { now: number }; clock: ServerClock } {
  const time = { now: START_MS };
  const clock = new ServerClock(() => time.now);
  clock.start(START_MS, SERVER_TICK);
  return { world: new WorldState(data, clock, ground), time, clock };
}

// ---- ADD_OBJ payloads ---------------------------------------------------------------------------------------------

const BASE = { scale: 1, motion: Mti.STAND, hitPoint: 100, state: 0, stateFlag: 0, belligerence: 0, sfxId: 0 };
const AT: Vec3 = [100, 0, 100];

function playerOf(objectId: number, name: string, extra: Partial<AddedMover> = {}, self = false): AddedMover {
  return {
    ...BASE, index: 11, pos: AT, angle: 0, objectId, isPlayer: true, ...extra,
    player: {
      self, name, sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: objectId, job: 0, level: 1,
      authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
      equipmentObjectIds: [], shopTitle: '',
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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });
  });

  it('a repeated ADD_OBJ of the own character keeps it too', () => {
    const { world } = newWorld();
    add(world, playerOf(7, 'Me', {}, true));
    const me = world.self();
    world.takeChanges();
    add(world, playerOf(7, 'Me again', {}, true));
    expect(world.self()).toBe(me);
    expect(world.movers.get(7)).toBe(me);
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });
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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });
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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });
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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });
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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });

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
    expect(world.takeChanges()).toEqual({ added: [], removed: [] });

    // handed out, removed, added again, removed: the one handed out is in removed, once, and the other in neither
    add(world, playerOf(3, 'Carol'));
    world.takeChanges();
    world.apply(3, { type: 'delObj' });
    add(world, playerOf(3, 'Carol again'));
    world.apply(3, { type: 'delObj' });
    expect(world.takeChanges()).toEqual({ added: [], removed: [3] });
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

// ---- the game data ------------------------------------------------------------------------------------------------

/**
 * An asset store over `files`, as `loadGameData` uses one: `url` answers for the keys the index lists, `json` reads
 * them (and notes each key asked for). `unreadable` keys are listed but cannot be read, as after three failed tries.
 */
function storeOf(files: Record<string, unknown>, unreadable: string[] = []) {
  const asked: string[] = [];
  return {
    asked,
    url: (key: string): string | null => (key in files || unreadable.includes(key) ? `/assets/${key}` : null),
    json: async <T>(key: string): Promise<T> => {
      asked.push(key);
      if (!(key in files)) throw new Error(`no ${key}`);
      return files[key] as T;
    },
  };
}

describe('loadGameData', () => {
  it('loadGameData reads the game-data keys', async () => {
    const files: Record<string, unknown> = {
      [GAME_DATA_KEYS.movers]: [moverProp(11, 'Male', 0.1), moverProp(20, 'Aibatt', 0.2, AII_MONSTER)],
      [GAME_DATA_KEYS.items]: [
        { id: 500, part: 6, male: 'models/part_mvag02cap.glb', female: 'models/part_fvag02cap.glb' },
      ],
      [GAME_DATA_KEYS.npcs]: [{ key: 'MaFl_Mikyel', name: 'Mikyel' }, { key: 'MaDa_Cooky', name: 'Cooky' }],
      [GAME_DATA_KEYS.nameColors]: { general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb },
      [GAME_DATA_KEYS.honorTitles]: { '0': 'Master Collector', '12': 'Entrepreneur' },
      [GAME_DATA_KEYS.worlds]: { '1': 'wdmadrigal', '40': 'wdheaven06', '41': 'wdheaven06_1' },
    };
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
    const files: Record<string, unknown> = {
      [GAME_DATA_KEYS.movers]: [old, moverProp(22, 'Mothbee', 0.2, AII_MONSTER, true)],
      [GAME_DATA_KEYS.items]: [],
      [GAME_DATA_KEYS.npcs]: [],
      [GAME_DATA_KEYS.nameColors]: { general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb },
      [GAME_DATA_KEYS.honorTitles]: {},
      [GAME_DATA_KEYS.worlds]: {},
    };
    const data = await loadGameData(storeOf(files));
    expect(data.movers.get(20)!.flying).toBe(false);
    expect(data.movers.get(22)!.flying).toBe(true);
  });

  it('a catalog the asset index does not list means game files from an older version, named, and nothing is fetched', async () => {
    const store = storeOf({
      [GAME_DATA_KEYS.movers]: [],
      [GAME_DATA_KEYS.items]: [],
      [GAME_DATA_KEYS.npcs]: [],
      [GAME_DATA_KEYS.nameColors]: { general: 1, chaotic: 2, ready: 3 },
    });
    const failure = await loadGameData(store).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GameDataMissingError);
    expect((failure as GameDataMissingError).keys).toEqual([GAME_DATA_KEYS.honorTitles, GAME_DATA_KEYS.worlds]);
    expect((failure as Error).message).toContain('data/worlds.json');
    expect(store.asked).toEqual([]);
  });

  it('a character defined twice keeps the later one, as CProject::LoadCharacter does', async () => {
    const data = await loadGameData(storeOf({
      [GAME_DATA_KEYS.movers]: [],
      [GAME_DATA_KEYS.items]: [],
      [GAME_DATA_KEYS.npcs]: [{ key: 'Abc', name: 'First' }, { key: 'aBC', name: 'Second' }],
      [GAME_DATA_KEYS.nameColors]: { general: 1, chaotic: 2, ready: 3 },
      [GAME_DATA_KEYS.honorTitles]: {},
      [GAME_DATA_KEYS.worlds]: {},
    }));
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

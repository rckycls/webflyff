import type { AddedMover, AddedNpc, AddedPlayer } from '@flyffweb/protocol';
import { ServerClock } from '../../src/net/serverClock';
import type { GameData } from '../../src/world/gameData';
import { WorldState } from '../../src/world/WorldState';
import type { Mover } from '../../src/world/WorldState';

/** `MI_MALE` and `MI_FEMALE` (`Resource/defineObj.h:954-955`): the player bodies. */
export const MI_MALE = 11;
export const MI_FEMALE = 12;

/** Empty catalogs, with the name colours of `PKSetting.inc` (white, red, pink) unless the test gives its own. */
export function gameDataOf(parts: Partial<GameData> = {}): GameData {
  return {
    movers: new Map(),
    items: new Map(),
    npcs: new Map(),
    nameColors: { general: 0xffffffff, chaotic: 0xffff0000, ready: 0xffffc0cb },
    honorTitles: new Map(),
    worlds: new Map(),
    ...parts,
  };
}

const BASE = { scale: 1, motion: 0, hitPoint: 100, state: 0, stateFlag: 0, belligerence: 0, sfxId: 0 };

/** A player's ADD_OBJ: a new male character with no title, no PK state and ordinary authorization (`AUTH_GENERAL`, 'F'). */
export function addedPlayer(objectId: number, player: Partial<AddedPlayer> = {}, extra: Partial<AddedMover> = {}): AddedMover {
  return {
    ...BASE, index: MI_MALE, pos: [100, 0, 100], angle: 0, objectId, isPlayer: true, ...extra,
    player: {
      self: false, name: `Player${objectId}`, sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0,
      playerId: objectId, job: 0, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0,
      pkPropensity: 0, honor: -1, worn: [], equipmentObjectIds: [], shopTitle: '', ...player,
    },
  };
}

/** The ADD_OBJ of an NPC or a monster: `characterKey` '' for a monster. */
export function addedNpc(objectId: number, index: number, npc: Partial<AddedNpc> = {}, extra: Partial<AddedMover> = {}): AddedMover {
  return {
    ...BASE, index, pos: [100, 0, 100], angle: 0, objectId, isPlayer: false, ...extra,
    npc: {
      hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [], activeAttack: 0, movePattern: 0,
      moveEvent: 0, moveEventCount: 0, speedFactor: 1, ...npc,
    },
  };
}

/** The mover `WorldState` makes of an ADD_OBJ, as the world screen would hold it. */
export function moverFrom(added: AddedMover, data: GameData = gameDataOf()): Mover {
  const world = new WorldState(data, new ServerClock(() => 0), () => 0);
  world.apply(added.objectId, { type: 'addMover', mover: added });
  const mover = world.movers.get(added.objectId);
  if (mover === undefined) throw new Error('the world kept no mover');
  return mover;
}

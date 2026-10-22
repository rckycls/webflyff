import type { Vec3 } from '../constants';
import type { MoveReport } from '../messages/world';

/**
 * One message of a JOIN or SNAPSHOT bundle, as the matching `CDPClient::On*` handler (`Neuz/DPClient.cpp`) reads
 * it. Positions and deltas are D3D coordinates and angles FlyFF degrees, as the C++ holds them. The message's
 * object ID is not here: `readBundle` reports it beside the value.
 */
export type WorldMessage =
  /** ADD_OBJ of a mover (`OT_MOVER`): a player, a monster or an NPC came into view. */
  | { type: 'addMover'; mover: AddedMover }
  /** ADD_OBJ of any other object (`OT_ITEM`, `OT_CTRL`, ...), which the browser does not read past its type. */
  | { type: 'addOther'; objectType: number }
  | { type: 'delObj' }
  | { type: 'worldReadInfo'; worldId: number; pos: Vec3 }
  | { type: 'moverMoved'; move: MoveReport }
  | { type: 'moverBehavior'; move: MoveReport }
  | {
    type: 'moverAngle'; pos: Vec3; delta: Vec3; angle: number; angleX: number; accPower: number; turnAngle: number;
    tick: bigint;
  }
  | { type: 'destPos'; pos: Vec3; forward: boolean }
  | { type: 'destAngle'; angle: number; left: boolean }
  | { type: 'setDestObj'; targetId: number; range: number }
  /** An `OBJMSG`: `CDPClient::OnMotion` passes it to `SendActMsg`. */
  | { type: 'motion'; message: number }
  | { type: 'setPos'; pos: Vec3 }
  | { type: 'setPosAngle'; pos: Vec3; angle: number }
  | { type: 'replace'; worldId: number; pos: Vec3 };

/** The member of `WorldMessage` with this `type`, which is what that message's reader returns. */
export type MessageOf<T extends WorldMessage['type']> = Extract<WorldMessage, { type: T }>;

/**
 * One worn part, as ADD_OBJ fills `m_aEquipInfo[part]`: `part` is a `PARTS_*` index (`Resource/defineNeuz.h`).
 * - Another player or an NPC: `itemId` is the item's ID (`m_dwItemId`, sent as a `u_short`). Only a player's parts
 *   carry `flag` (`m_byFlag`); an NPC's is 0.
 * - The player's own character: `itemId` is `m_aEquipInfo[part].dwId`, which on the world server holds the
 *   inventory's object ID of the item, not the item's ID (`CMover::NormalizePlayerData`,
 *   `_Network/Objects/Obj.cpp:494`, and `DoEquip`, `_Common/MoverEquip.cpp:736`). Neuz dresses its own player from
 *   the inventory instead (`RedoEquip( FALSE )`), which the browser does not read. `flag` is 0.
 */
export interface WornPart { part: number; itemId: number; flag: number }

/**
 * The player part of `CMover::Serialize` (`_Common/ObjSerializeOpt.cpp:405`). Fields the browser has no use for
 * (the stats, the guild and party, the fame, the item options and so on) are read past, not kept.
 */
export interface AddedPlayer {
  /** The player's own character: the message's object ID is the bundle's player object ID (METHOD_NONE). */
  self: boolean;
  name: string;
  sex: number;
  skinSet: number;
  hairMesh: number;
  hairColor: number;
  headMesh: number;
  /** `m_idPlayer`, the character's database ID. */
  playerId: number;
  job: number;
  level: number;
  /** `m_dwAuthorization`, an `AUTH_*` letter (`(char&)` into the DWORD's low byte, so 0 to 255). */
  authorization: number;
  /** `m_dwMode` and `m_dwStateMode`: flag sets. */
  mode: number;
  stateMode: number;
  /** `m_dwPKTime`: the milliseconds of pink state left (the world server sends `m_dwPKTime - GetTickCount()`), or 0. */
  pkTime: number;
  pkValue: number;
  pkPropensity: number;
  /** `m_nHonor`, the chosen honour title (-1 for none), whose text Neuz shows in the name tag. */
  honor: number;
  /** Another player: the parts METHOD_EXCLUDE_ITEM lists. The own character: each part not `NULL_ID` (`WornPart`). */
  worn: WornPart[];
  /** `m_vtInfo.GetTitle()`, the title of the player's private shop (another player only; '' for the own character). */
  shopTitle: string;
}

/** The NPC part of `CMover::Serialize` (`_Common/ObjSerializeOpt.cpp:689`), which monsters take too. */
export interface AddedNpc {
  hairMesh: number;
  hairColor: number;
  headMesh: number;
  /** `m_szCharacterKey`, the NPC's key in `character.inc`; '' for a monster. */
  characterKey: string;
  worn: WornPart[];
  activeAttack: number;
  movePattern: number;
  moveEvent: number;
  moveEventCount: number;
  /** `m_fSpeedFactor`, which `CMover::GetSpeed` multiplies the mover's speed by. */
  speedFactor: number;
}

/** A mover as ADD_OBJ brings it (`CDPClient::OnAddObj`, `Neuz/DPClient.cpp:1053`). */
export interface AddedMover {
  // CObj::Serialize and CCtrl::Serialize
  /** `m_dwIndex`: the mover's ID in `propMover.txt`. */
  index: number;
  /** `m_vScale.x`, one scale for the three axes. */
  scale: number;
  pos: Vec3;
  /**
   * `m_fAngle` as the wire gives it (a tenth of a degree), before `CObj::SetAngle` (`_Common/Obj.cpp:662`) wraps it
   * into 0 to 360 in steps of 360 / 65536.
   */
  angle: number;
  objectId: number;
  // CMover::Serialize, shared part
  /** `m_dwMotion`, a `MTI_*` motion. */
  motion: number;
  isPlayer: boolean;
  hitPoint: number;
  /** `CActionMover`'s state and state flag (`OBJSTA_*`, `OBJSTAF_*`). */
  state: number;
  stateFlag: number;
  belligerence: number;
  /** `m_dwMoverSfxId`: the effect attached to the mover (`__PETVIS`). */
  sfxId: number;
  /** Present when `isPlayer`. */
  player?: AddedPlayer;
  /** Present when not `isPlayer`. */
  npc?: AddedNpc;
}

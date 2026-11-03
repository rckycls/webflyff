import type { Vec3 } from '../constants';
import type { MoveReport } from '../messages/world';

/**
 * One message of a JOIN or SNAPSHOT bundle, as the matching `CDPClient::On*` handler (`Neuz/DPClient.cpp`) reads
 * it. Positions and deltas are D3D coordinates and angles FlyFF degrees, as the C++ holds them. The message's
 * object ID is not here: `readBundle` reports it beside the value.
 */
import type { ChatMessage } from './chat';
import type { NpcMessage } from './npc';
import type { OwnQuest, QuestMessage } from './quest';
import type { ShopMessage } from './shop';

export type WorldMessage = ChatMessage | NpcMessage | ShopMessage | QuestMessage
  | { type: 'profileStats'; values: number[] }
  | { type: 'addItem'; item: GroundItem }
  | { type: 'createItem'; itemType: number; item: InventoryItem; stacks: Array<{ objectId: number; count: number }> }
  | { type: 'updateItem'; itemType: number; objectId: number; param: number; value: number; time: number }
  | { type: 'moveItem'; itemType: number; source: number; destination: number }
  | { type: 'equipItem'; objectId: number; equip: boolean; itemId: number; option: number; flag: number; part: number }
  /** ADD_OBJ of a mover (`OT_MOVER`): a player, a monster or an NPC came into view. */
  | { type: 'addMover'; mover: AddedMover }
  /** ADD_OBJ of any other object (`OT_CTRL`, ...), which the browser does not read past its type. */
  | { type: 'addOther'; objectType: number }
  | { type: 'delObj' }
  /** The season (`SEASON_*`, `Resource/define.h:269-274`), from which Neuz picks some trees' models; the browser keeps it nowhere. */
  | { type: 'environmentSetting'; season: number }
  | { type: 'worldReadInfo'; worldId: number; pos: Vec3 }
  | { type: 'moverMoved'; move: MoveReport }
  | { type: 'moverBehavior'; move: MoveReport }
  /** Another player's correction of itself (its PLAYERCORR, `CDPSrvr::OnPlayerCorr`), passed on by the world server. */
  | { type: 'moverCorr'; move: MoveReport }
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
  | { type: 'replace'; worldId: number; pos: Vec3 }
  /** Another mover's swing: `OnMeleeAttack` passes `message` (an `OBJMSG_ATK*`) and the rest to `SendActMsg`. */
  | { type: 'meleeAttack'; message: number; targetId: number; param2: number; param3: number }
  /** Another mover's wand shot: `OnMagicAttack` passes them to `DoAttackMagic` (`power` is the charge, 0-4). */
  | { type: 'magicAttack'; message: number; targetId: number; param2: number; param3: number; power: number; sfxHitId: number }
  /**
   * Another mover's bow shot or a monster's ranged attack: `OnRangeAttack` passes `param2` to `DoAttackRange` as its
   * `dwItemID` (a player's charge, a monster's attack item) with `sfxHitId` (the server's id for a monster's missile).
   */
  | { type: 'rangeAttack'; message: number; targetId: number; param2: number; param3: number; sfxHitId: number }
  /** Piece 7 M2: the buffs' messages ([R §10]): a buff on `targetId` (`time` its whole length, ms), one gone, all gone. */
  | { type: 'setSkillState'; targetId: number; buffType: number; id: number; level: number; time: number }
  | { type: 'removeSkillInfluence'; buffType: number; id: number }
  | { type: 'removeAllSkillInfluence' }
  /** Piece 7 M2: a live buff's stat change, its end, and DST_SPEED's end with the total left (`m_adjParamAry`). */
  | { type: 'setDestParam'; dst: number; adj: number; chg: number }
  | { type: 'resetDestParam'; dst: number; adj: number }
  | { type: 'resetDestParamSync'; dst: number; adj: number; total: number }
  /** Another mover's arrow (`arrowXi`) at `targetId`, hitting with `hitXi`; Neuz ignores `pos` (`OnCreateSfxAllow`). */
  | { type: 'createSfxAllow'; arrowXi: number; hitXi: number; pos: Vec3; targetId: number }
  /** The own job change: the new job and all 45 skill slots (`OnSetChangeJob`). */
  | { type: 'setJobSkill'; job: number; skills: SkillSlot[] }
  /** Another player's job change: the new job and its 20 (master or hero: 21) skill slots (`OnSetNearChangeJob`). */
  | { type: 'setNearJobSkill'; job: number; skills: SkillSlot[] }
  /**
   * A hit on the mover the message is about. `hit` is `dwHit` and `flags` the `AF_*` set (`AttackFlag`). `fly` is the
   * victim's position and angle when `AF_FLYING` is set, else `null`.
   */
  | { type: 'damage'; attackerId: number; hit: number; flags: number; fly: { pos: Vec3; angle: number } | null }
  /**
   * The mover died. `attackerId` is `NULL_ID` when no mover killed it; `message` is an `OBJMSG`: `OBJMSG_DAMAGE` (41) for
   * a blow, `OBJMSG_DAMAGE_FORCE` (42) for a forced one (`SendDamageForce` → `DoDie` → `AddMoverDeath`), 0 for a death
   * with no blow (`DoDie( NULL )` on deadly land, `HATTR_DIE`, `ActionMoverCollision.cpp:87-89`).
   */
  | { type: 'moverDeath'; attackerId: number; message: number }
  /** The mover's HP, MP or FP, absolute: `param` is a `DST_*` (`DstParam`). */
  | { type: 'setPointParam'; param: number; value: number }
  /**
   * The own EXP and level. `deathExp` is -1n and `deathLevel` 0xffff when the server has no new value for them, and
   * Neuz then keeps its own (`OnSetExperience`).
   */
  | {
    type: 'setExperience'; exp: bigint; level: number; skillLevel: number; skillPoint: number; deathExp: bigint;
    deathLevel: number;
  }
  /** Another player's level. */
  | { type: 'setLevel'; level: number }
  /** The own stat points (`m_nRemainGP`). */
  | { type: 'setGrowthLearningPoint'; remainGP: number }
  /** The own stats and stat points, after the browser spent points (MODIFY_STATUS). */
  | { type: 'setState'; str: number; sta: number; dex: number; int: number; remainGP: number }
  /** A monster's position, and the mover that attacked it (`m_idAttacker`). */
  | { type: 'corrReq'; pos: Vec3; attackerId: number }
  | { type: 'revival' }
  | { type: 'revivalToLodestar' }
  /**
   * A server message: the text ID (`TID_*`) and its arguments, which Neuz splits into tokens and puts in the text
   * (`OnDefinedText`). DEFINEDTEXT1 has no string at all: `args` is null, and Neuz shows the text unformatted
   * (`OnDefinedText1`).
   */
  | { type: 'definedText'; textId: number; args: string | null }
  /** The server asks the own player whether it follows a target; `fromId` goes back in GETDESTOBJ. */
  | { type: 'queryGetDestObj'; fromId: number }
  /** The monster rates the server sets and the monsters whose rates it clears. */
  | { type: 'monsterProp'; rates: MonsterRate[]; removed: string[] }
  /** The own shortcut bars: the applet row, the item bars and the action slot, and the action points. */
  | { type: 'taskBar'; taskBar: TaskBar }
  /**
   * The mover the message is about begins a skill (`OnUseSkill`). `skill` is the real `SI_*` ID, not the index into
   * `m_aJobSkill`; `targetId` is the target's object ID (the caster's own for a skill on itself, and `NULL_ID` for a
   * queue start with no target: `m_idTarget` may be `NULL_ID` there, `_Interface/WndTaskBar.cpp:2252`); `useType` is a
   * `SKILLUSETYPE` (`SUT_NORMAL` 0, `SUT_QUEUESTART` 1, `SUT_QUEUEING` 2); `castingTime` is 1 for a `KT_SKILL`, else the
   * cast in the world server's ticks (`SEC1` is 15 there, `_Common/timer.h:133-140`).
   */
  | { type: 'useSkill'; skill: number; level: number; targetId: number; useType: number; castingTime: number }
  /** The world server refused the own USESKILL (`OnClearUseSkill`): the request is answered, and nothing begins. */
  | { type: 'clearUseSkill' }
  /**
   * The own skills and skill points after a change (`OnDoUseSkillPoint`): always `MAX_SKILL_JOB` (45) slots, and the
   * points left. After a spend the slots are the array the browser sent; a master level-up (`MoverSkill.cpp:88`) or the
   * legend skill's hero level (`DPSrvr.cpp:8453`) sends the server's.
   */
  | { type: 'doUseSkillPoint'; skills: SkillSlot[]; skillPoint: number }
  /**
   * The own skill points after a reset of the skills (`OnInitSkillPoint`); Neuz then sets every skill level to 0, but
   * the master's and the hero's.
   */
  | { type: 'initSkillPoint'; skillPoint: number }
  /** The own action points (`OnSetActionPoint`); the message's object ID is `NULL_ID`. */
  | { type: 'setActionPoint'; actionPoint: number }
  /** The action slot's chain is over (`OnEndSkillQueue`). */
  | { type: 'endSkillQueue' }
  /**
   * An effect (`XI_*`) at a position, or on the object the message is about when `pos` is all zeros (`OnCreateSfxObj`
   * makes the position absolute only `if( x || y || z )`). `flag` is the `BOOL bFlag` (0 fixed, 1 follows the object),
   * which Neuz reads and does not use.
   */
  | { type: 'createSfxObj'; sfxId: number; pos: Vec3; flag: number }
  /** PLAYMUSIC: a `BGM_*` id to play once. */
  | { type: 'playMusic'; music: number }
  /** PLAYSOUND: a `SND_*` id to play, or null for the file name of type 1, which is not played. */
  | { type: 'playSound'; sound: number | null };

/**
 * One shortcut (`SHORTCUT`, `_Common/ProjectCmn.h:930-948`) as `CUserTaskBar::Serialize` writes it, the six `DWORD`s in
 * the order of the wire: `kind` is `m_dwShortcut` (`ShortcutKind`; 0 is an empty slot), `id` `m_dwId` (what `kind`
 * names, for example the `APP_*` window or the inventory object), `type` `m_dwType`, `index` `m_dwIndex`, `userId`
 * `m_dwUserId` and `data` `m_dwData` (which Neuz sets to where the shortcut sits: 0 the applet row, 1 an item bar, 2
 * the action slot).
 * `text` is `m_szString`, which only a chat shortcut in an applet slot or on an item bar carries, else ''.
 *
 * `index` is the value on the wire, which the server keeps from the packet that set the shortcut. Neuz overwrites it
 * with the slot after it reads (`CWndTaskBar::Serialize`, `_Interface/WndTaskBar.cpp:327`, :381, :392), so code that
 * wants Neuz's `m_dwIndex` takes the slot from `TaskBar`.
 */
export interface Shortcut {
  kind: number;
  id: number;
  type: number;
  index: number;
  userId: number;
  data: number;
  text: string;
}

/**
 * The shortcut bars of the own character (`CUserTaskBar`, `_Interface/UserTaskBar.h:20-26`), as the world server
 * lists the non-empty slots of each (`CUserTaskBar::Serialize`, `UserTaskBar.cpp:63-125`) and `CWndTaskBar::Serialize`
 * (`WndTaskBar.cpp:315-400`) reads them. Neuz clears the bars first, so a slot not listed is empty, and a slot listed
 * twice (which the server does not send) holds the later entry: the lists are in the order of the message.
 *
 * Neuz also empties a `SKILL` shortcut in the applet row unless its skill is a `CT_STEP` or `CT_GENERAL` one
 * (`WndTaskBar.cpp:330-343`); that needs the skill properties, so it is left to the code that draws the bar.
 */
export interface TaskBar {
  /** `m_aSlotApplet`: the slot is 0 to `MAX_SLOT_APPLET` - 1 (17). */
  applets: Array<{ slot: number; shortcut: Shortcut }>;
  /** `m_aSlotItem`: the bar is 0 to `MAX_SLOT_ITEM_COUNT` - 1 (7), the slot 0 to `MAX_SLOT_ITEM` - 1 (8). */
  items: Array<{ bar: number; slot: number; shortcut: Shortcut }>;
  /**
   * `m_aSlotQueue`, the action slot's skills: `queue[i]` is slot `i`, up to the last one listed (at most
   * `MAX_SLOT_QUEUE` of them). The server keeps the skills from slot 0 on with none missing, so these are the skills
   * 0 to n-1 (Neuz takes the count `m_nCurQueueNum` from the message's count); a slot the message skips is an
   * empty shortcut (`kind` 0) here, and a queue entry never has a `text`.
   */
  queue: Shortcut[];
  /** `m_nActionPoint`, which follows the queue entries. */
  actionPoint: number;
}

/**
 * One monster's rates from MONSTERPROP, as the percent the server holds them (`OnMonsterProp` divides each by 100
 * into `m_fHitPoint_Rate` and the rest). `name` is the monster's name in `propMover.txt`.
 */
export interface MonsterRate {
  name: string;
  hitPoint: number;
  attackPower: number;
  defence: number;
  exp: number;
  itemDrop: number;
  penya: number;
}

/** The member of `WorldMessage` with this `type`, which is what that message's reader returns. */
export type MessageOf<T extends WorldMessage['type']> = Extract<WorldMessage, { type: T }>;

/**
 * One worn part of another player or of an NPC, as ADD_OBJ lists it into `m_aEquipInfo[part]`: `part` is a
 * `PARTS_*` index (`Resource/defineNeuz.h`) and `itemId` the item's ID (`m_dwItemId`, sent as a `u_short`). Only a
 * player's parts carry `flag` (`m_byFlag`); an NPC's is 0. The player's own character has no such list: see
 * `AddedPlayer.equipmentObjectIds`.
 */
export interface WornPart { part: number; itemId: number; flag: number }

/**
 * One slot of the own character's `m_aJobSkill` (a `SKILL`, `_Common/Item.h:308-314`: `DWORD dwSkill`, `DWORD
 * dwLevel`). `skill` is a `SI_*` skill ID, or `NULL_ID` (0xffffffff) in a slot that holds no skill, whose `level` is 0.
 */
export interface SkillSlot { skill: number; level: number }

/**
 * One item of the own inventory (`CItemContainer<CItemElem>`, `_Common/Item.h:892`). `objectId` is its object ID in
 * the inventory: the slot of `m_apItem` the message puts it in (`ch`, 0 to 72), which is what `GetAtId` looks an item
 * up by (the item's own `m_dwObjId` repeats it on the wire), and what `AddedPlayer.equipmentObjectIds` and a task
 * bar's item shortcut name. `itemId` is `m_dwItemId`, the item's ID in `propItem.txt`, and `count` is `m_nItemNum`
 * (a `short`), how many of it the stack holds.
 */
export interface InventoryItem { objectId: number; itemId: number; count: number; flag?: number; charged?: number }
export interface GroundItem { index: number; scale: number; pos: Vec3; angle: number; item: InventoryItem }

/**
 * What the own ADD_OBJ (METHOD_NONE, `_Common/ObjSerializeOpt.cpp:509-585`) tells about the player's own character
 * beyond what every player has: its base stats (the player part's `m_nStr` to `m_nInt`, :436-439), the points
 * and EXP, the skill array and the inventory.
 */
export interface OwnCharacter {
  /** Native dwGold (optional in older fixtures). */
  gold?: number;
  /** `m_aQuest`, `m_aCompleteQuest`, `m_aCheckedQuest` (ObjSerializeOpt.cpp:509-549); absent in older fixtures. */
  quests?: OwnQuest[];
  completedQuests?: number[];
  checkedQuests?: number[];
  /** `m_nStr`, `m_nSta`, `m_nDex`, `m_nInt`: the base stats, without equipment or buffs (`WORD`s). */
  str: number;
  sta: number;
  dex: number;
  int: number;
  /** `m_nManaPoint` and `m_nFatiguePoint`: the current MP and FP (`WORD`s; the maxima are not on the wire). */
  manaPoint: number;
  fatiguePoint: number;
  /** `m_nExp1`, the EXP towards the next level (`EXPINTEGER`, an `__int64`). */
  exp: bigint;
  /** `m_nSkillLevel`: the skill points earned in total. `m_nSkillPoint`: the unspent ones. */
  skillLevel: number;
  skillPoint: number;
  /** `m_nDeathExp` and `m_nDeathLevel`: the EXP and the level the character had when it last died. */
  deathExp: bigint;
  deathLevel: number;
  /** `m_nRemainGP`: the unspent stat points (a `short` on the wire). */
  remainGP: number;
  /**
   * `m_aJobSkill`, always `MAX_SKILL_JOB` (45) slots: 3 of the first job, 20 expert, 20 professional, the master and
   * the hero skill. The index is what shortcuts and skill packets call the skill; a slot holding no skill has
   * `skill` `NULL_ID`.
   */
  skills: SkillSlot[];
  /**
   * `m_Inventory`'s items, in the order the message lists them (the storing side goes through the slots in order),
   * `[]` for an empty inventory. `null` when the inventory could not be read: `inventoryError` says why, and the
   * numbers and skills above are still the message's.
   */
  inventory: InventoryItem[] | null;
  /** Bag positions 0..41, equipment positions 42..72 -> inventory object IDs, including empty allocations. */
  inventorySlots?: number[];
  /**
   * `null` when the inventory was read. Otherwise what went wrong between the end of the skill array and the end of the
   * inventory (the bytes ran out, or a count or a field was out of range): the part being read, then the
   * `ProtocolError`'s message, for example `item 3 of 7: need 4 bytes but only 2 remain at offset 812`.
   */
  inventoryError: string | null;
}

/**
 * The player part of `CMover::Serialize` (`_Common/ObjSerializeOpt.cpp:405`). Fields the browser has no use for
 * (the guild and party, the fame, the item options and so on) are read past, not kept; a stat of another player is
 * one of them, only the own character's are kept (`own`).
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
  /**
   * `m_nSta` and `m_nDex`, the base STA and DEX (`WORD`s, without items or buffs), which Neuz works another player's max
   * HP and attack speed out from (`GetMaxOriginHitPoint`, `GetAttackSpeed`). The own character's are its numbers' too
   * (`own.sta`, `own.dex`: the same fields). STR and INT are kept for the own character only.
   */
  sta: number;
  dex: number;
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
  /** Another player: the parts METHOD_EXCLUDE_ITEM lists, with item IDs. The own character: `[]`. */
  worn: WornPart[];
  /**
   * The own character: `m_aEquipInfo[i].dwId` for each of the `MAX_HUMAN_PARTS` (31) parts, in array order, `NULL_ID`
   * where the part wears nothing. Another player: `[]`. These are the inventory's object IDs of the worn items, not
   * item IDs: the database server sets them from `m_Inventory.m_apIndex` (`CMover::NormalizePlayerData`,
   * `_Network/Objects/Obj.cpp:494-506`) and `DoEquip` from `m_dwObjId` (`_Common/MoverEquip.cpp:736`); Neuz dresses its
   * own player from the inventory (`RedoEquip( FALSE )`). Each names an item of `own.inventory` by its `objectId`.
   * The browser still dresses the own character from the lobby's PLAYER_LIST equipment (Piece 3), since equipping
   * stays with Piece 5.
   */
  equipmentObjectIds: number[];
  /** The own character's stats, points, EXP, skills and inventory (METHOD_NONE); `null` for another player. */
  own: OwnCharacter | null;
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
/** Piece 7 M2: one buff of an ADD_OBJ (`CBuffMgr::Serialize`): its kind, id, level and the time it has left (ms). */
export interface AddedBuff { buffType: number; id: number; level: number; timeLeft: number }

export interface AddedMover {
  // CObj::Serialize and CCtrl::Serialize
  /** Piece 7 M2: another mover's buffs (`CBuffMgr::Serialize`), when it has some; the own ADD_OBJ's are not read. */
  buffs?: AddedBuff[];
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

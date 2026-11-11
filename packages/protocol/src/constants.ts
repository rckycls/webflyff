/**
 * Packet types of the certifier, login and cache (game) ports, copied from `Source/_Network/MsgHdr.h`. A body
 * starts with its type as a `u32`; some server packets put `DPID_UNKNOWN` in front of it (see `typeOf` in the
 * test helpers).
 */
export const PacketType = {
  TELEPORTER: 0x88100100,
  /** 2026-11-05: `PACKETTYPE_NPC_BUFF`, Buff Pang's menu entry (`CDPClient::SendNPCBuff`, `MsgHdr.h:666`). */
  NPC_BUFF: 0xf000f813,
  /** 2026-11-09 (pets R2): `PACKETTYPE_PET_RELEASE`, the own raised pet sent back from its menu (`MsgHdr.h:626`). */
  PET_RELEASE: 0xf000f600,
  /**
   * 2026-11-09 (pets R3): the raised pet's care (`MsgHdr.h:627-631`, `:775`; world/pets.ts): the food, the tamer's mistake
   * and miracle, the feed pocket's off-switch, the food mill, and the tamer's rename cancel (`__PET_1024`).
   */
  USE_PET_FEED: 0xf000f601,
  PET_TAMER_MISTAKE: 0xf000f602,
  PET_TAMER_MIRACLE: 0xf000f603,
  FEED_POCKET_INACTIVE: 0xf000f604,
  MAKE_PET_FEED: 0xf000f605,
  CLEAR_PET_NAME: 0x8fffff01,
  /** 2026-11-09 (pets B1): the buff pet window's vis out and vis swap (`MsgHdr.h:804-805`, `__PETVIS`; world/pets.ts). */
  VISPET_REMOVEVIS: 0x88000000,
  VISPET_SWAPVIS: 0x88000001,
  /**
   * 2026-11-09 (pets R4): the Pet Tamer's rare windows (`MsgHdr.h:681`, `:768`, `:771`; world/pets.ts): the pet trade for a
   * revival scroll piece (`__JEFF_11`), the egg exchange and the pick-up pet's awakening cancel (`__PET_0519`).
   */
  QUE_PETRESURRECTION: 0x70000009,
  /**
   * 2026-11-10: the Arena's enter and leave (`__JEFF_11_4`, `MsgHdr.h:686-687`) and the Forsaken Tower's teleport
   * (`__VER >= 12`, `MsgHdr.h:713`; world/arenaTower.ts).
   */
  ARENA_ENTER: 0x70000010,
  ARENA_EXIT: 0x70000011,
  HEAVENTOWER_TELEPORT: 0x70001008,
  TRANSFORM_ITEM: 0x8fff000d,
  PICKUP_PET_AWAKENING_CANCEL: 0x8fff000f,
  /** 2026-11-05: the upgrade cursor's packets (`MsgHdr.h`; world/upgrade.ts). */
  ENCHANT: 0xf000b024,
  PIERCING: 0xf000b025,
  RANDOMSCROLL: 0xf000d00d,
  DO_USE_ITEM_TARGET: 0x70000004,
  ULTIMATE_ENCHANTWEAPON: 0xf000f113,
  /** 2026-11-10: Create Jewels and Jewel Setting (`MsgHdr.h:610, 613`; world/upgrade.ts). */
  ULTIMATE_MAKEGEM: 0xf000f111,
  ULTIMATE_SETGEM: 0xf000f114,
  /**
   * 2026-11-11: Create Shining Oricalkum, Create Unique and Ultimate Weapon, and Remove Jewel (`MsgHdr.h:609, 611, 614`);
   * the Repair window (`MsgHdr.h:180`; world/upgrade.ts).
   */
  ULTIMATE_MAKEITEM: 0xf000f110,
  ULTIMATE_TRANSWEAPON: 0xf000f112,
  ULTIMATE_REMOVEGEM: 0xf000f115,
  REPAIRITEM: 0x00ff00b5,
  /** 2026-11-11: the Upgrade Specialist's card and element removals (`MsgHdr.h:660, 521`, `REMVOE` sic; world/upgrade.ts). */
  PIERCINGREMOVE: 0xf000f809,
  REMOVE_ATTRIBUTE: 0xf000d00b,
  /** 2026-11-10: Summon Angel's start and the full angel's buff icon (`MsgHdr.h:254, 256`; world/angel.ts). */
  CREATEANGEL: 0x00fff000,
  ANGELBUFF: 0x00fff002,
  /** 2026-11-05: the Upgrade Specialist's piercing and safe upgrade (`MsgHdr.h:515, 753`; world/upgrade.ts). */
  PIERCING_SIZE: 0xf000d008,
  SMELT_SAFETY: 0x70007000,
  /** 2026-11-05: the item windows' packets (`MsgHdr.h`; world/itemWindows.ts). QUERYSETPLAYERNAME is also its answer. */
  QUERYSETPLAYERNAME: 0x00000012,
  SUMMON_FRIEND: 0xf000e001,
  SUMMON_FRIEND_CONFIRM: 0xf000e002,
  SUMMON_PARTY: 0xf000e003,
  SUMMON_PARTY_CONFIRM: 0xf000e004,
  SUMMON_FRIEND_CANCEL: 0xf000e005,
  DO_USE_ITEM_INPUT: 0x8fffff00,
  CHANGE_ATTRIBUTE: 0xf000d00e,
  ITEMTRANSY: 0xf000d00c,
  CREATEMONSTER: 0x0000002a,
  QUERYTICKCOUNT: 0x0b,
  PING: 0x14,
  CLOSE_EXISTING_CONNECTION: 0x16,
  ONE_HOUR_NOTIFY: 0x17,
  KEEP_ALIVE: 0x18,
  /** Added for browser players: the gateway tells the certifier the player's address. Unused elsewhere in `MsgHdr.h`. */
  GATEWAY_CLIENT_ADDR: 0xe0,
  CACHE_ADDR: 0xf2,
  PLAYER_LIST: 0xf3,
  CREATE_PLAYER: 0xf4,
  DEL_PLAYER: 0xf5,
  GETPLAYERLIST: 0xf6,
  CERTIFY: 0xfc,
  SRVR_LIST: 0xfd,
  ERROR: 0xfe,
  /** `PACKETTYPE_JOIN`: the client's JOIN to the cache server, and the server's answer (a first snapshot bundle). */
  JOIN: 0x0000ff00,
  /** `PACKETTYPE_PRE_JOIN`: the client asks the login server to let the character in; the server's answer has no fields. */
  PRE_JOIN: 0x0000ff05,
  /** `PACKETTYPE_REPLACE`: the server moves the player to another world. */
  REPLACE: 0x00ff0f00,
  /** `PACKETTYPE_SNAPSHOT`: a bundle of object messages (server) or of the player's own messages (client). */
  SNAPSHOT: 0xffffff00,
  /** `PACKETTYPE_PLAYERMOVED`: the client reports where its player is going. */
  PLAYERMOVED: 0xffffff01,
  /** `PACKETTYPE_PLAYERBEHAVIOR`: the client reports its player's state after a change. */
  PLAYERBEHAVIOR: 0xffffff02,
  /** `PACKETTYPE_PLAYERCORR`: the client corrects its player's state where a walk met something or began to fall. */
  PLAYERCORR: 0xffffff05,
  /** `PACKETTYPE_PLAYERSETDESTOBJ`: the client walks its player to a target (`CDPClient::SendPlayerDestObj`). */
  PLAYERSETDESTOBJ: 0xffffff07,
  /** `PACKETTYPE_GETDESTOBJ`: the client's answer to the server's QUERYGETDESTOBJ message (`CDPClient::SendGetDestObj`). */
  GETDESTOBJ: 0xffffff73,
  /** `PACKETTYPE_MELEE_ATTACK`: the client swings at a target (`CDPClient::SendMeleeAttack`). */
  MELEE_ATTACK: 0x00ff0010,
  /** `PACKETTYPE_SETTARGET`: the client selects or releases a target (`CDPClient::SendSetTarget`). */
  SETTARGET: 0x00ff0023,
  /** `PACKETTYPE_REVIVAL_TO_LODESTAR`: the dead player asks to be brought back at the lodestar (`SendHdr`). */
  REVIVAL_TO_LODESTAR: 0x00ff00c1,
  /** `PACKETTYPE_MODIFY_STATUS`: the client spends stat points (`CDPClient::SendModifyStatus`). */
  MODIFY_STATUS: 0xf000f501,
  /** `PACKETTYPE_USESKILL`: the client uses the skill in a slot of `m_aJobSkill` (`CDPClient::SendUseSkill`). */
  USESKILL: 0x00ff0020,
  /** `PACKETTYPE_DOUSESKILLPOINT`: the client spends skill points, with all 45 skills (`CDPClient::SendDoUseSkillPoint`). */
  DOUSESKILLPOINT: 0x000f0003,
  /** `PACKETTYPE_REMOVEAPPLETTASKBAR` (`MsgHdr.h:270`): the client empties a slot of the applet row (`SendRemoveAppletTaskBar`). */
  REMOVEAPPLETTASKBAR: 0xffffff0a,
  /** `PACKETTYPE_ADDAPPLETTASKBAR` (`MsgHdr.h:271`): the client puts a shortcut on the applet row (`SendAddAppletTaskBar`). */
  ADDAPPLETTASKBAR: 0xffffff0b,
  /** `PACKETTYPE_ADDITEMTASKBAR`: the client puts a shortcut on an item bar (`CDPClient::SendAddItemTaskBar`). */
  ADDITEMTASKBAR: 0xffffff0c,
  /** `PACKETTYPE_REMOVEITEMTASKBAR`: the client empties a slot of an item bar (`CDPClient::SendRemoveItemTaskBar`). */
  REMOVEITEMTASKBAR: 0xffffff0d,
  /** `PACKETTYPE_SKILLTASKBAR`: the client sends the five slots of the action slot (`CDPClient::SendSkillTaskBar`). */
  SKILLTASKBAR: 0xffffff0e,
  /** `PACKETTYPE_ENDSKILLQUEUE`: the client stops the running action slot (`CDPClient::SendEndSkillQueue`). */
  ENDSKILLQUEUE: 0x00ff00d5,
  /** `PACKETTYPE_REMOVEQUEST`: the client abandons a quest (`CDPClient::SendRemoveQuest`, MsgHdr.h:154). */
  REMOVEQUEST: 0x00ff0026,
  /** `PACKETTYPE_QUEST_CHECK`: the client ticks a quest for the tracker (`CDPClient::SendCheckedQuestId`, MsgHdr.h:844). */
  QUEST_CHECK: 0x88100110,
  /** `PACKETTYPE_MAGIC_ATTACK`: the client's wand shot, with its charge (`CDPClient::SendMagicAttack`, `MsgHdr.h:136`). */
  MAGIC_ATTACK: 0x00ff0011,
  /** `PACKETTYPE_RANGE_ATTACK`: the client's bow shot, with its charge (`CDPClient::SendRangeAttack`, `MsgHdr.h:137`). */
  RANGE_ATTACK: 0x00ff0012,
  /** `PACKETTYPE_SFX_ID`: a missile the own player fired, at its hit frame (`CDPClient::SendSfxID`, `MsgHdr.h:150`). */
  SFX_ID: 0x00ff0022,
  /** `PACKETTYPE_SFX_CLEAR`: a missile lost without a hit (`CDPClient::SendSfxClear`, `MsgHdr.h:152`). */
  SFX_CLEAR: 0x00ff0024,
  /** `PACKETTYPE_SFX_HIT`: a missile landed (`CDPClient::SendSfxHit`, `MsgHdr.h:192`); the server deals its damage then. */
  SFX_HIT: 0x00ff00d2,
  /** Piece 7 M3: `PACKETTYPE_DOUSEITEM`, an item used (`CDPClient::SendDoUseItem`, `MsgHdr.h:149`). */
  DOUSEITEM: 0x00ff0021,
  /** Piece 7 M3: `PACKETTYPE_STATEMODE`, the item cast's cancel (`CDPClient::SendStateModeCancel`, `MsgHdr.h:389`). */
  STATEMODE: 0xffffff7a,
  /** Piece 7 M3: `PACKETTYPE_RETURNSCROLL`, the Scroll of Return's village or the way back (`MsgHdr.h:552`). */
  RETURNSCROLL: 0xf000d010,
  /** Piece 7 M5: `PACKETTYPE_DOEQUIP`, an item put on or taken off, with the ride's float (`SendDoEquip`, `MsgHdr.h:129`). */
  DOEQUIP: 0x00ff000b,
  /** Piece 7 M5: the flight packets (`MsgHdr.h:262-307`): a flier's move, its state, its correction and its angle. */
  PLAYERMOVED2: 0xffffff03,
  PLAYERBEHAVIOR2: 0xffffff04,
  PLAYERCORR2: 0xffffff06,
  PLAYERANGLE: 0xffffff29,
  /** Piece 7 M5: `PACKETTYPE_MELEE_ATTACK2`, a flier's attack, with no float (`SendMeleeAttack2`, `MsgHdr.h:139`). */
  MELEE_ATTACK2: 0x00ff0014,
  ERROR_STRING: 0x70000003,
  /** Piece 7 M4: the core's direct packets ([R §1.2], `MsgHdr.h:278`, :658, :684, :355): a party error, a player's data,
   *  a log-out of a party or guild member or friend, and a BLOCK (gu 7: the invitee's box was already open). */
  ERRORPARTY: 0xffffff10,
  UPDATE_PLAYER_DATA: 0xf000f808,
  LOGOUT: 0x7000000b,
  /** 2026-11-10: the core's answers to /ip and /count, and /system's notice to all (`MsgHdr.h:207-210`). */
  GETPLAYERADDR: 0x00ff00e7,
  GETPLAYERCOUNT: 0x00ff00e8,
  SYSTEM: 0x00ff00ea,
  BLOCK: 0xffffff5a,
  /** Piece 7 M4: the party packets the client sends ([R §2], `MsgHdr.h:279-314`), and the player data's query (:653). */
  ADDPARTYMEMBER: 0xffffff11,
  REMOVEPARTYMEMBER: 0xffffff12,
  MEMBERREQUEST: 0xffffff17,
  MEMBERREQUESTCANCLE: 0xffffff18,
  CHANGETROUP: 0xffffff19,
  PARTYSKILLUSE: 0xffffff1b,
  PARTYCHANGEITEMMODE: 0xffffff20,
  PARTYCHANGEEXPMODE: 0xffffff21,
  PARTYCHANGELEADER: 0xffffff2f,
  QUERY_PLAYER_DATA: 0xf000f802,
  LOGIN_PROTECT_NUMPAD: 0x88100200,
  LOGIN_PROTECT_CERT: 0x88100201,
} as const;

/** The version string CERTIFY carries (`NEUZ_MSGVR` in `Source/_Common/ServerCommon.h`). */
export const PROTOCOL_VERSION = '20100412';
/** `DPID_UNKNOWN` (`dplay.h`): the sender ID the server writes in front of some packet types. */
export const DPID_UNKNOWN = 0xffffffff;
/** `NULL_ID` (`scanner.h`): "no ID" in the packets that carry object, character or party IDs. */
export const NULL_ID = 0xffffffff;

/** The servers' TCP ports. */
export const Port = { CERTIFIER: 23000, LOGIN: 28000, CACHE: 5400 } as const;

/** Characters one account can hold (`MAX_CHARACTER_LIST` in `ProjectCmn.h`). */
export const MAX_CHARACTER_SLOTS = 3;

/**
 * The message types inside a SNAPSHOT bundle (`SNAPSHOTTYPE_*` in `Source/_Network/MsgHdr.h`), each a `WORD` after
 * the object ID.
 */
export const MessageType = {
  SETPOSANGLE: 0x000e,
  /** An effect made on an object or at a position, to everyone in view (`CUserMng::AddCreateSfxObj`, `User.cpp:5016`). */
  CREATESFXOBJ: 0x000f,
  SETPOS: 0x0010,
  /** Another player's level, to everyone in view but that player (`CUserMng::AddSetLevel`, `WORLDSERVER/User.cpp:4694`). */
  SETLEVEL: 0x0011,
  /** The own EXP, level, skill points and death EXP (`CUser::AddSetExperience`, `User.cpp:1139`). */
  SETEXPERIENCE: 0x0012,
  /** A hit on a mover, to everyone in view of it (`CUserMng::AddDamage`, `User.cpp:4474`). */
  DAMAGE: 0x0013,
  /** A mover begins a skill, to everyone in view of it and the caster too (`CUserMng::AddUseSkill`, `User.cpp:4540`). */
  USESKILL: 0x0019,
  /** The world server refused the own USESKILL (`CUser::AddHdr`, `User.cpp:655`, from `OnUseSkill`, `DPSrvrLux.cpp:96`). */
  CLEAR_USESKILL: 0x001a,
  /** A mover's HP, MP or FP as an absolute value (`CUserMng::AddSetPointParam`, `User.cpp:4663`). */
  SETPOINTPARAM: 0x001e,
  /** A monster's position and attacker, once, on the first hit by a player (`CUser::AddCorrReq`, `User.cpp:2405`). */
  CORRREQ: 0x0041,
  /** The server asks the player whether it follows a target (`CUser::AddQueryGetDestObj`, `User.cpp:2348`). */
  QUERYGETDESTOBJ: 0x0049,
  /** The rates that scale the monsters (`CUser::AddMonsterProp`, `User.cpp:6524`). */
  MONSTERPROP: 0x004e,
  /** With `__ENVIRONMENT_EFFECT` on, the season: the first message of the JOIN bundle (`CUser::Open`). */
  ENVIRONMENTALL: 0x0063,
  /** The own stats, after a MODIFY_STATUS (`CUser::AddSetState`, `User.cpp:2429`). */
  SETSTATE: 0x006a,
  /** The own skill points after a reset (`CUser::AddInitSkill`, `User.cpp:6554`). */
  INITSKILLPOINT: 0x007c,
  /** The own skills and skill points after a spend (`CUser::AddDoUseSkillPoint`, `User.cpp:6566`). */
  DOUSESKILLPOINT: 0x007d,
  /** A server message that is a text ID alone (`CUser::AddDefinedText( int )`, `User.cpp:2264`). */
  DEFINEDTEXT1: 0x0094,
  /** A server message that is a text ID and its arguments (`CUser::AddDefinedText`, `User.cpp:2218`). */
  DEFINEDTEXT: 0x0095,
  /** The own shortcut bars, in the JOIN bundle after the own ADD_OBJ (`CUser::AddTaskBar`, `User.cpp:1232`). */
  TASKBAR: 0x0097,
  MOTION: 0x0098,
  /** The mover is brought back (`CUserMng::AddHdr`, `User.cpp:5439`). */
  REVIVAL: 0x00a1,
  /** The mover is brought back at the lodestar (`CUserMng::AddHdr`, `User.cpp:5439`). */
  REVIVAL_TO_LODESTAR: 0x00a2,
  /** The own stat points (`CUser::AddSetGrowthLearningPoint`, `User.cpp:1161`). */
  SET_GROWTH_LEARNING_POINT: 0x00a6,
  DESTPOS: 0x00c1,
  MOVERSETDESTOBJ: 0x00c2,
  DESTANGLE: 0x00c3,
  /** The own action points, in a message about `NULL_ID` (`CUser::AddSetActionPoint`, `UserLux.cpp:206`). */
  SETACTIONPOINT: 0x00c5,
  /** A mover died (`CUserMng::AddMoverDeath`, `User.cpp:4527`). */
  MOVERDEATH: 0x00c7,
  /** The correction another client sent of its player (PLAYERCORR), which the world server passes on (`AddMoverCorr`). */
  MOVERCORR: 0x00c8,
  MOVERMOVED: 0x00ca,
  MOVERBEHAVIOR: 0x00cb,
  MOVERANGLE: 0x00ce,
  /** A track to play, to everyone in a world (`CUserMng::AddPlayMusic`: the GM `/music` and guild combat; `MsgHdr.h:1128`). */
  PLAYMUSIC: 0x00d1,
  /** A sound to play: upgrade results, `SND_PC_CHAOS` (`CUser::AddPlaySound`, `WORLDSERVER/User.cpp:2528`; `MsgHdr.h:1129`). */
  PLAYSOUND: 0x00d2,
  /** Another mover's swing, to everyone in view but the attacker (`CUserMng::AddMeleeAttack`, `User.cpp:4808`). */
  MELEE_ATTACK: 0x00e0,
  /** The action slot's chain is over (`CUserTaskBar::OnEndSkillQueue`, `_Interface/UserTaskBar.cpp:190`). */
  ENDSKILLQUEUE: 0x00e5,
  /** The own job change, with all 45 skills (`CUser::AddSetChangeJob`, `User.cpp:1181`; `MsgHdr.h:1076`). */
  SET_JOB_SKILL: 0x00a7,
  /** Another player's job change, to everyone in view but that player (`CUserMng::AddNearSetChangeJob`, `User.cpp:5111`). */
  SET_NEAR_JOB_SKILL: 0x00a8,
  /** Another mover's arrow at its target, made from its left hand (`CUserMng::AddCreateSfxAllow`, `User.cpp:5098`). */
  CREATESFXALLOW: 0x00aa,
  /** Another mover's wand shot, to everyone in view but the attacker (`CUserMng::AddMagicAttack`, `User.cpp:4836`). */
  MAGIC_ATTACK: 0x00e1,
  /** Another mover's bow shot, or a monster's ranged attack (`CUserMng::AddRangeAttack`, `User.cpp:4850`). */
  RANGE_ATTACK: 0x00e2,
  /** Piece 7 M2: a buff on a mover in view (`CUserMng::AddSetSkillState`, `MsgHdr.h:974`). */
  SETSKILLSTATE: 0x004c,
  /** Piece 7 M2: one buff of the mover gone (`MsgHdr.h:1162`), and all its common ones, at a death (:1156). */
  REMOVESKILLINFULENCE: 0x00f8,
  REMOVEALLSKILLINFULENCE: 0x00f4,
  /** Piece 7 M2: a live buff's stat change and its end (`MsgHdr.h:912-913`), and DST_SPEED's total (:1295). */
  SETDESTPARAM: 0x001c,
  RESETDESTPARAM: 0x001d,
  RESETDESTPARAM_SYNC: 0x9800,
  /** Piece 7 M4: the party's messages ([R §1.1], `MsgHdr.h:955-1052`), and the player data's answer (:1220). */
  ADDPARTYNAME: 0x0068,
  ADDPARTYCHANGELEADER: 0x0079,
  ERRORPARTY: 0x0081,
  PARTYMEMBER: 0x0082,
  PARTYREQEST: 0x0083,
  PARTYREQESTCANCEL: 0x0084,
  PARTYEXP: 0x0085,
  PARTYCHANGETROUP: 0x0088,
  PARTYCHANGENAME: 0x0089,
  PARTYSKILL_CALL: 0x008a,
  PARTYSKILL_BLITZ: 0x008b,
  PARTYSKILL_RETREAT: 0x008c,
  SETPARTYMODE: 0x008d,
  PARTYSKILL_SPHERECIRCLE: 0x008e,
  PARTYCHANGEITEMMODE: 0x008f,
  PARTYCHANGEEXPMODE: 0x0090,
  SET_PARTY_MEMBER_PARAM: 0x0091,
  PARTYMAPINFO: 0x003c,
  QUERY_PLAYER_DATA: 0x0141,
  /** Piece 7 M3: a mover's state mode on, off or cancelled: an item cast (`CUserMng::AddStateMode`, `MsgHdr.h:1134`). */
  STATEMODE: 0x00df,
  /** 2026-11-10: a mover's whole `m_dwMode` after a game master's command (`CUserMng::AddModifyMode`, `MsgHdr.h:1130`). */
  MODIFYMODE: 0x00d3,
  /** 2026-11-10: `SNAPSHOTTYPE_TEXT` (`MsgHdr.h:1068`): a server line, its state byte first (`__S_SERVER_UNIFY`). */
  TEXT: 0x00a0,
  /** 2026-11-10: `SNAPSHOTTYPE_CMDSETSKILLLEVEL` (`MsgHdr.h:1012`): /skilllevel's answer. */
  CMDSETSKILLLEVEL: 0x006b,
  /** 2026-11-10: `SNAPSHOTTYPE_DISGUISE`, `_NODISGUISE` (`MsgHdr.h:1158-1159`): /disguise and /noDisguise. */
  DISGUISE: 0x00f5,
  NODISGUISE: 0x00f6,
  /**
   * 2026-11-05: a skill applied to a mover in view, Buff Pang's buffs among them (`CUserMng::AddDoApplySkill`,
   * `WORLDSERVER/UserLux.cpp:270-280`; `MsgHdr.h:1132`).
   */
  DOAPPLYUSESKILL: 0x00d7,
  /** 2026-11-05: a premium timer, and all of them at join (`AddSMMode`, `AddSMModeAll`, `MsgHdr.h:957-958`). */
  SM_MODE: 0x003f,
  SM_MODE_ALL: 0x003e,
  /** 2026-11-05: the element stones' elements (`AddResistSMMode`, `MsgHdr.h:995`). */
  RESISTSMMODE: 0x005d,
  /** 2026-11-05: the Ultimate gem's answer (`CUser::AddUltimate`). */
  ULTIMATE: 0x0100,
  /**
   * 2026-11-10: the angel's EXP and level (`CUser::AddAngelInfo`; `MsgHdr.h:1185`), and a local event's state, EVE_PK's
   * among them (`MsgHdr.h:1088`; world/angel.ts).
   */
  ANGEL: 0x00b1,
  /** 2026-11-10: every local event's state at join (`CUser::AddFlyffEvent`, `MsgHdr.h:1087`; world/angel.ts). */
  FLYFF_EVENT: 0x00b2,
  SET_LOCAL_EVENT: 0x00b3,
  /** 2026-11-05: the safe upgrade's answer (`CUser::AddSmeltSafety`, `MsgHdr.h:1301`): a byte. */
  SMELT_SAFETY: 0x9900,
  /** 2026-11-11: Remove Element upgrading's answer (`CUser::AddRemoveAttribute`, User.cpp:7813-7821; `MsgHdr.h:1184`): a BOOL. */
  REMOVE_ATTRIBUTE: 0x0122,
  /** 2026-11-05: the summons, the sex and the face changed (`MsgHdr.h:976, 1149, 1179`). */
  SUMMON: 0x00ed,
  SEX_CHANGE: 0x00dc,
  CHANGEFACE: 0x004d,
  /** Piece 7 M3: the Scroll of Return's village taken, no body (`CUser::AddReturnScroll`, `User.cpp:6636-6645`). */
  RETURNSCORLL: 0x00ad,
  /** Piece 7 M5: another flier's move, state and correction (`User.cpp:4937-5035`); its angle is MOVERANGLE. */
  MOVERMOVED2: 0x00cc,
  MOVERBEHAVIOR2: 0x00cd,
  MOVERCORR2: 0x00c9,
  /** Piece 7 M5: the own fuel and turbo fuel (`CUser::AddSetFuel`, `User.cpp:2440-2450`). */
  SETFUEL: 0x004b,
  /** Piece 7 M5: another flier's attack (`CUserMng::AddMeleeAttack2`, `User.cpp:4845-4857`). */
  MELEE_ATTACK2: 0x00e4,
  /** Piece 7 M5: an action message for a mover, the server's TURBO_OFF among them (`UserLux.cpp:283-295`). */
  SENDACTMSG: 0x005c,
  ADD_OBJ: 0x00f0,
  DEL_OBJ: 0x00f1,
  REPLACE: 0x00f2,
  WORLD_READINFO: 0x9910,
  // 2026-11-09 (pets M0): the pets (`MsgHdr.h:1194-1201`, `:1237`, `:1271`, `:1309-1310`; world/pets.ts)
  PET_CALL: 0x0110,
  PET_RELEASE: 0x0111,
  PET_LEVELUP: 0x0112,
  PET_SET_EXP: 0x0113,
  PET: 0x0114,
  PET_STATE: 0x0115,
  PET_FEED: 0x0116,
  PET_MILL: 0x0117,
  QUE_PETRESURRECTION_RESULT: 0x0203,
  SET_PET_NAME: 0x9100,
  MOVER_CHANGESFX: 0x8800,
  VISPET_ACTIVATE: 0x8801,
} as const;

/**
 * The `AF_*` attack flags a DAMAGE carries (`_AIInterface/ActionMover.h:27-44`). `AF_RESERVED` (0x4) and
 * `AF_MONSTER_SP_CLIENT` (0x8000, for the client alone: the server treats it as `AF_GENERIC`) are left out, as
 * the world server sends neither. `CRITICAL` is `AF_CRITICAL`, both critical bits together, which
 * `CDPClient::OnDamage` tests (`dwAtkFlags & AF_CRITICAL`).
 */
export const AttackFlag = {
  GENERIC: 0x1,
  MISS: 0x2,
  MAGIC: 0x8,
  MELEESKILL: 0x10,
  MAGICSKILL: 0x20,
  /** A critical hit, x2.3. */
  CRITICAL1: 0x40,
  /** A critical hit, x2.6. */
  CRITICAL2: 0x80,
  CRITICAL: 0xc0,
  PUSH: 0x100,
  PARRY: 0x200,
  RESIST: 0x400,
  STUN: 0x800,
  BLOCKING: 0x1000,
  FORCE: 0x2000,
  RANGE: 0x4000,
  /** Knocked back: the DAMAGE then carries the victim's position and angle. */
  FLYING: 0x10000000,
} as const;

/** The `DST_*` values SETPOINTPARAM names (`Resource/defineAttribute.h:286-288`). */
export const DstParam = { HP: 38, MP: 39, FP: 40 } as const;

/** The `SHORTCUT_*` kinds a shortcut's `m_dwShortcut` holds (`_Common/ProjectCmn.h:910-923`). */
export const ShortcutKind = {
  NONE: 0,
  ETC: 1,
  /** `m_dwId` is an `APP_*` window ID (`Resource/ResData.h`). */
  APPLET: 2,
  /** `m_dwId` is a `MOT_*` motion. */
  MOTION: 3,
  SCRIPT: 4,
  /** `m_dwId` is the item's object ID in the inventory. */
  ITEM: 5,
  /** `m_dwId` is the skill's index in `m_aJobSkill`; `m_dwType` 2 is a party skill. */
  SKILL: 6,
  OBJECT: 7,
  /** The only kind whose shortcut carries a string, in an applet slot or on an item bar. */
  CHAT: 8,
  SKILLFUN: 9,
  EMOTICON: 10,
  LORDSKILL: 11,
} as const;

/**
 * The sizes of the shortcut bars, as `ProjectCmn.h:899-906` defines them (`MAX_SLOT_ITEM_COUNT` is 8 for `__VER >= 11`)
 * and `DefineCommon.h:10` the string: the applet slots, the item bars, the slots on one item bar, the action slot's
 * skills, and the `char[128]` of a chat shortcut's text, which holds at most 127 characters.
 */
export const MAX_SLOT_APPLET = 18;
export const MAX_SLOT_ITEM_COUNT = 8;
export const MAX_SLOT_ITEM = 9;
export const MAX_SLOT_QUEUE = 5;
export const MAX_SHORTCUT_STRING = 128;

/** The object types (`OT_*` in `Resource/define.h:80-88`) that ADD_OBJ starts with, as a `BYTE`. */
export const ObjectType = {
  OBJ: 0,
  ANI: 1,
  CTRL: 2,
  SFX: 3,
  ITEM: 4,
  MOVER: 5,
  REGION: 6,
  SHIP: 7,
  PATH: 8,
} as const;

/**
 * The last four bytes of a bundle's table of contents: the bytes "TOC1" read as a little-endian `u32`. The
 * table is added to server bundles by the world-snapshot-index patch (`server-patches/`).
 */
export const BUNDLE_MARKER = 0x31434f54;

/** A position or a delta: x, y, z as `D3DXVECTOR3` holds them (D3D coordinates, as on the wire). */
export type Vec3 = [number, number, number];

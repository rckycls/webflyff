/**
 * Packet types of the certifier, login and cache (game) ports, copied from `Source/_Network/MsgHdr.h`. A body
 * starts with its type as a `u32`; some server packets put `DPID_UNKNOWN` in front of it (see `typeOf` in the
 * test helpers).
 */
export const PacketType = {
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
  ERROR_STRING: 0x70000003,
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
  SETPOS: 0x0010,
  /** Another player's level, to everyone in view but that player (`CUserMng::AddSetLevel`, `WORLDSERVER/User.cpp:4694`). */
  SETLEVEL: 0x0011,
  /** The own EXP, level, skill points and death EXP (`CUser::AddSetExperience`, `User.cpp:1139`). */
  SETEXPERIENCE: 0x0012,
  /** A hit on a mover, to everyone in view of it (`CUserMng::AddDamage`, `User.cpp:4474`). */
  DAMAGE: 0x0013,
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
  /** A server message that is a text ID alone (`CUser::AddDefinedText( int )`, `User.cpp:2264`). */
  DEFINEDTEXT1: 0x0094,
  /** A server message that is a text ID and its arguments (`CUser::AddDefinedText`, `User.cpp:2218`). */
  DEFINEDTEXT: 0x0095,
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
  /** A mover died (`CUserMng::AddMoverDeath`, `User.cpp:4527`). */
  MOVERDEATH: 0x00c7,
  /** The correction another client sent of its player (PLAYERCORR), which the world server passes on (`AddMoverCorr`). */
  MOVERCORR: 0x00c8,
  MOVERMOVED: 0x00ca,
  MOVERBEHAVIOR: 0x00cb,
  MOVERANGLE: 0x00ce,
  /** Another mover's swing, to everyone in view but the attacker (`CUserMng::AddMeleeAttack`, `User.cpp:4808`). */
  MELEE_ATTACK: 0x00e0,
  ADD_OBJ: 0x00f0,
  DEL_OBJ: 0x00f1,
  REPLACE: 0x00f2,
  WORLD_READINFO: 0x9910,
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

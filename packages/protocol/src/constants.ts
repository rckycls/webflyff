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
  MOTION: 0x0098,
  DESTPOS: 0x00c1,
  MOVERSETDESTOBJ: 0x00c2,
  DESTANGLE: 0x00c3,
  MOVERMOVED: 0x00ca,
  MOVERBEHAVIOR: 0x00cb,
  MOVERANGLE: 0x00ce,
  ADD_OBJ: 0x00f0,
  DEL_OBJ: 0x00f1,
  REPLACE: 0x00f2,
  WORLD_READINFO: 0x9910,
} as const;

/**
 * The last four bytes of a bundle's table of contents: the bytes "TOC1" read as a little-endian `u32`. The
 * table is added to server bundles by the world-snapshot-index patch (`server-patches/`).
 */
export const BUNDLE_MARKER = 0x31434f54;

/** A position or a delta: x, y, z as `D3DXVECTOR3` holds them (D3D coordinates, as on the wire). */
export type Vec3 = [number, number, number];

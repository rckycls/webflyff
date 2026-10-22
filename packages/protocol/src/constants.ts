/**
 * Packet types of the certifier and login ports, copied from `Source/_Network/MsgHdr.h`. A body starts with its
 * type as a `u32`; some server packets put `DPID_UNKNOWN` in front of it (see `typeOf` in the test helpers).
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

import { ArReader } from '../ar/ArReader';
import { ArWriter } from '../ar/ArWriter';
import { PacketType, PROTOCOL_VERSION } from '../constants';
import { encryptCertifyPassword } from '../crypto/password';

/** CERTIFY, sent first by the client: version, account and the AES-encrypted password hash. */
export function encodeCertify(account: string, passwordHash: string): Uint8Array {
  return new ArWriter().u32(PacketType.CERTIFY).string(PROTOCOL_VERSION).string(account)
    .bytes(encryptCertifyPassword(passwordHash)).toBytes();
}

/** KEEP_ALIVE has no body beyond its type. */
export function encodeKeepAlive(): Uint8Array {
  return new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes();
}

/** The bare ERROR Neuz sends back after it has received an ERROR_STRING. */
export function encodeErrorReply(): Uint8Array {
  return new ArWriter().u32(PacketType.ERROR).toBytes();
}

/** Asks the certifier to drop an existing session of the account (account, then the password hash). */
export function encodeCloseExistingConnection(account: string, passwordHash: string): Uint8Array {
  return new ArWriter().u32(PacketType.CLOSE_EXISTING_CONNECTION).string(account).string(passwordHash).toBytes();
}

/** What a gateway sends first on a browser player's certifier connection: the player's dotted IPv4 address. */
export function encodeGatewayClientAddr(address: string): Uint8Array {
  return new ArWriter().u32(PacketType.GATEWAY_CLIENT_ADDR).string(address).toBytes();
}

/** One row of SRVR_LIST: a cluster (`parent` is `NULL_ID`) or a channel under one. */
export interface ServerEntry {
  parent: number;
  id: number;
  name: string;
  address: string;
  adult: number;
  playerCount: number;
  enabled: number;
  maxPlayers: number;
}

export type CertifierMessage =
  | { type: 'serverList'; authKey: number; accountFlag: number; account: string; servers: ServerEntry[] }
  | { type: 'error'; code: number }
  | { type: 'errorString'; text: string }
  | { type: 'keepAlive' }
  | { type: 'unknown'; packetType: number };

// Field sizes of `SERVER_DESC` (`Source/_Network/Misc/Include/Misc.h`) and of the CERTIFIER account echo.
const ACCOUNT_BUFFER = 42;
const SERVER_NAME_BUFFER = 36;
const SERVER_ADDRESS_BUFFER = 16;
const ERROR_TEXT_BUFFER = 256;

function readServerList(r: ArReader): CertifierMessage {
  // CDPCertifier::SendServerList, English build: only __GPAUTH_01 and __EUROPE_0514 add a field (the account
  // echo). The GPotato strings are German and French only, and the Thai time-left is Thai only.
  const authKey = r.u32();
  const accountFlag = r.u8();
  const account = r.string(ACCOUNT_BUFFER);
  const count = r.u32();
  const servers: ServerEntry[] = [];
  // No up-front allocation from `count`: a body that lies about it runs out of bytes and throws on the way.
  for (let i = 0; i < count; i++) {
    servers.push({
      parent: r.u32(),
      id: r.u32(),
      name: r.string(SERVER_NAME_BUFFER),
      address: r.string(SERVER_ADDRESS_BUFFER),
      adult: r.i32(),
      playerCount: r.i32(),
      enabled: r.i32(),
      maxPlayers: r.i32(),
    });
  }
  r.expectEnd();
  return { type: 'serverList', authKey, accountFlag, account, servers };
}

/**
 * Decodes a body received on the certifier port. A known type must use the whole body (a leftover byte means the
 * layout was read wrong); a type this does not know is reported, not thrown, so the caller can decide to ignore it.
 */
export function decodeCertifierMessage(body: Uint8Array): CertifierMessage {
  const r = new ArReader(body);
  const packetType = r.u32();
  switch (packetType) {
    case PacketType.SRVR_LIST:
      return readServerList(r);
    case PacketType.ERROR: {
      const code = r.i32();
      r.expectEnd();
      return { type: 'error', code };
    }
    case PacketType.ERROR_STRING: {
      const text = r.string(ERROR_TEXT_BUFFER);
      r.expectEnd();
      return { type: 'errorString', text };
    }
    case PacketType.KEEP_ALIVE:
      r.expectEnd();
      return { type: 'keepAlive' };
    default:
      return { type: 'unknown', packetType };
  }
}

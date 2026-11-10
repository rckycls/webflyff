// The certifier route's allow-list (website spec §3.5), the one gateway change of the website work. The certifier's
// `OnCloseExistingConnection` (Source/CERTIFIER/dpcertifier.cpp:423-440) copies the account and password from the
// packet with no check, and `CloseExistingConnection` builds `LOGIN_STR '%s', '%s', '%s'` from them with `wsprintf`
// (DBManager.cpp:111, :304-324): a `'` in either runs SQL of the sender's choosing on ACCOUNT_DBF. Until the certifier
// is patched (spec §8), the gateway lets through only the four packets the browser sends it (lobby/LoginFlow.ts), with
// the names and hashes it can send.

import { ArReader, PacketType, ProtocolError } from '@flyffweb/protocol';

export type CertifierRefusal = 'type' | 'account' | 'password' | 'malformed';

/** `CAr::ReadString` buffer sizes the certifier reads with: the version (CERTIFY), and `MAX_ACCOUNT` / `MAX_PASSWORD`. */
const VERSION_BUFFER = 32;
const ACCOUNT_BUFFER = 42;
const PASSWORD_BUFFER = 42;
/** What `CAccountMgr::IsAccountName` takes: 1-32 printable ASCII, no space; and never a `'`. */
const ACCOUNT = /^[\x21-\x26\x28-\x7e]{1,32}$/;
/** What `hashPassword` gives: md5 as 32 lowercase hex digits. */
const PASSWORD_HASH = /^[0-9a-f]{32}$/;

const ALLOWED: ReadonlySet<number> = new Set([
  PacketType.CERTIFY, PacketType.CLOSE_EXISTING_CONNECTION, PacketType.KEEP_ALIVE, PacketType.ERROR,
]);

/** Why the gateway refuses a browser body on a certifier route, or `undefined` to let it through. */
export function checkCertifierPacket(body: Uint8Array): CertifierRefusal | undefined {
  try {
    const r = new ArReader(body);
    const type = r.u32();
    if (!ALLOWED.has(type)) return 'type';
    if (type === PacketType.CERTIFY) {
      r.string(VERSION_BUFFER);
      return ACCOUNT.test(r.string(ACCOUNT_BUFFER)) ? undefined : 'account';
    }
    if (type === PacketType.CLOSE_EXISTING_CONNECTION) {
      const account = r.string(ACCOUNT_BUFFER);
      const password = r.string(PASSWORD_BUFFER);
      if (!ACCOUNT.test(account)) return 'account';
      return PASSWORD_HASH.test(password) ? undefined : 'password';
    }
    return undefined;
  } catch (error) {
    if (error instanceof ProtocolError) return 'malformed';
    throw error;
  }
}

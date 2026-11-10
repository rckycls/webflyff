// The certifier route's allow-list (website spec §3.5), the one gateway change of the website work. The certifier's
// `OnCloseExistingConnection` (Source/CERTIFIER/dpcertifier.cpp:423-440) copies the account and password from the
// packet with no check, and `CloseExistingConnection` builds `LOGIN_STR '%s', '%s', '%s'` from them with `wsprintf`
// (DBManager.cpp:111, :304-324): a `'` in either runs SQL of the sender's choosing on ACCOUNT_DBF. Until the certifier
// is patched (spec §8), the gateway lets through only the four packets the browser sends it (lobby/LoginFlow.ts), with
// the names and hashes it can send.

import {
  ArReader, CERTIFY_BLOCK_BYTES, CERTIFY_KEY_TEXT, PacketType, ProtocolError, aes128CbcDecrypt, encodeAscii,
} from '@flyffweb/protocol';

export type CertifierRefusal = 'type' | 'account' | 'password' | 'malformed';

/** `CAr::ReadString` buffer sizes the certifier reads with: the version (CERTIFY), and `MAX_ACCOUNT` / `MAX_PASSWORD`. */
const VERSION_BUFFER = 32;
const ACCOUNT_BUFFER = 42;
const PASSWORD_BUFFER = 42;
/** What `CAccountMgr::IsAccountName` takes: 1-32 printable ASCII, no space; and never a `'`. */
const ACCOUNT = /^[\x21-\x26\x28-\x7e]{1,32}$/;
/** What `hashPassword` gives: md5 as 32 lowercase hex digits. */
const PASSWORD_HASH = /^[0-9a-f]{32}$/;

/** The CERTIFY block's key (zero-padded, as the client's) and the bytes of it the certifier copies: `MAX_PASSWORD`. */
const CERTIFY_KEY = (() => { const key = new Uint8Array(16); key.set(encodeAscii(CERTIFY_KEY_TEXT)); return key; })();
const CERTIFY_COPIED = 42;

/**
 * Whether a CERTIFY password block starts as the browser's does: the hash, 32 lowercase hex digits, then a 0. The
 * certifier copies the block's first 42 decrypted bytes with no terminator (`OnCertify`, dpcertifier.cpp:370) and
 * then reads and copies them as a C string (:378, :405): without a 0 in them it reads and writes past its buffers.
 * Only the first 48 bytes are decrypted: in CBC each block needs only the one before it.
 */
function isHashBlock(block: Uint8Array): boolean {
  const plain = aes128CbcDecrypt(CERTIFY_KEY, new Uint8Array(16), block.subarray(0, 48)).subarray(0, CERTIFY_COPIED);
  if (plain[32] !== 0) return false;
  return PASSWORD_HASH.test(String.fromCharCode(...plain.subarray(0, 32)));
}

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
      if (!ACCOUNT.test(r.string(ACCOUNT_BUFFER))) return 'account';
      return isHashBlock(r.bytes(CERTIFY_BLOCK_BYTES)) ? undefined : 'password';
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

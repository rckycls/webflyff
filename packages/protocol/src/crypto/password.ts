import { ProtocolError } from '../errors';
import { encodeAscii } from '../text';
import { aes128CbcEncrypt } from './aes128';
import { md5Hex } from './md5';

/** Prefix `CNeuzApp::HashMD5` puts before the password. */
export const PASSWORD_SALT = 'kikugalanet';
/** AES key of the CERTIFY password block, zero-padded to 16 bytes. */
export const CERTIFY_KEY_TEXT = 'dldhsvmflvm';
/** Size of the CERTIFY password block: 16 * MAX_PASSWORD (42) in `DPCertified.cpp`. */
export const CERTIFY_BLOCK_BYTES = 672;

/**
 * `CNeuzApp::HashMD5` (`Source/Neuz/Neuz.cpp`): an input of exactly 32 characters is taken to be a hash already
 * and returned unchanged; anything else becomes the MD5 of the salt followed by the text, as 32 lowercase hex
 * digits. Throws `ProtocolError` for text that is not printable ASCII, unless it is the 32 characters returned as is.
 */
export function hashPassword(plain: string): string {
  if (plain.length === 32) return plain;
  return md5Hex(encodeAscii(PASSWORD_SALT + plain));
}

/**
 * The password field of CERTIFY (`Source/Neuz/DPCertified.cpp`): the hash's ASCII padded with zeros to 672 bytes,
 * encrypted with AES-128-CBC under `CERTIFY_KEY_TEXT` (zero-padded) and a zero IV, with no padding added.
 */
export function encryptCertifyPassword(hash: string): Uint8Array {
  const text = encodeAscii(hash);
  if (text.length > CERTIFY_BLOCK_BYTES) {
    throw new ProtocolError(`password hash is ${text.length} bytes; the certify block holds ${CERTIFY_BLOCK_BYTES}`);
  }
  const plain = new Uint8Array(CERTIFY_BLOCK_BYTES);
  plain.set(text);
  const key = new Uint8Array(16);
  key.set(encodeAscii(CERTIFY_KEY_TEXT));
  return aes128CbcEncrypt(key, new Uint8Array(16), plain);
}

/** `CNeuzApp::GetDeleteKey`: the key sent to delete a character is the hash of the Bank PIN. */
export function deleteKey(secondPassword: string): string {
  return hashPassword(secondPassword);
}

// The admin's panel password (admin panel spec §5.2): scrypt from node:crypto, kept as
// `scrypt$<N>$<r>$<p>$<salt base64>$<key base64>` in admin-login.json. Never the game's MD5 form.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 32;

export function hashAdminPassword(password: string, salt: Buffer = randomBytes(SALT_BYTES)): string {
  const key = scryptSync(password, salt, KEY_BYTES, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** True when `password` is the one `stored` was made from. A stored text of another form, or other costs, is false. */
export function verifyAdminPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  if (Number(parts[1]) !== N || Number(parts[2]) !== R || Number(parts[3]) !== P) return false;
  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  const key = scryptSync(password, salt, KEY_BYTES, { N, r: R, p: P });
  return timingSafeEqual(key, expected);
}

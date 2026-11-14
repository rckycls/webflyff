// Authenticator codes (admin panel spec §5.3): RFC 6238 TOTP with HMAC-SHA1, 30-second steps, 6 digits, the form every
// authenticator app reads from an otpauth:// link. The secret is RFC 4648 base32 (A-Z, 2-7, no padding).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_MS = 30_000;

export function base32Encode(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

/** Spaces and case do not matter (people type the key from a screen); any other character throws. */
export function base32Decode(text: string): Buffer {
  const clean = text.replace(/\s+/g, '').toUpperCase().replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`not a base32 character: ${JSON.stringify(char)}`);
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, as RFC 4226 recommends. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / TOTP_STEP_MS);
}

export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, '0');
}

/** The step (now's, the one before or the one after) whose code `code` is, or `undefined`. */
export function matchTotp(secret: string, code: string, nowMs: number): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const now = totpStep(nowMs);
  let found: number | undefined;
  // every step is checked, so the time taken does not tell which one matched
  for (const step of [now - 1, now, now + 1]) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code)) && found === undefined) found = step;
  }
  return found;
}

const ISSUER = 'osflyff admin';

export function otpauthUrl(secret: string, user: string): string {
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${issuer}:${encodeURIComponent(user)}?secret=${secret}&issuer=${issuer}`;
}

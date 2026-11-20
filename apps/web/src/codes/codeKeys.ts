// Redeem codes (2026-11-20, docs/superpowers/specs/2026-11-20-vip-codes-design.md): the key text. Players may type a
// key with spaces or dashes and in any case; it is kept and looked up as its letters and digits in capitals. The panel's
// random keys are 16 characters without the look-alikes 0 O 1 I L, shown in groups of four.

import { randomInt } from 'node:crypto';

export const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RANDOM_KEY_LENGTH = 16;

/** The key as stored: spaces and dashes dropped, capitals, then 4 to 32 letters and digits; `undefined` otherwise. */
export function normalizeKey(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined;
  const key = text.replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-Z0-9]{4,32}$/.test(key) ? key : undefined;
}

/** A new random key (crypto.randomInt over KEY_ALPHABET). */
export function newKey(): string {
  let key = '';
  for (let i = 0; i < RANDOM_KEY_LENGTH; i++) key += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return key;
}

/** A 16-character key as `XXXX-XXXX-XXXX-XXXX`; any other key as it is. */
export function showKey(key: string): string {
  return key.length === RANDOM_KEY_LENGTH ? key.match(/.{4}/g)!.join('-') : key;
}

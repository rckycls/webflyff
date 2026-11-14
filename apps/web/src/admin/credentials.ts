// admin-login.json (admin panel spec §5.2): the one admin's name, password hash and authenticator key. Written by
// `npm run admin:setup`, read once at start. A separate file from web.config.json, so a setup run that rewrites the
// settings never wipes the owner's login.

import { readFileSync } from 'node:fs';
import { object, text } from '../configHelpers';
import { base32Decode } from './totp';

export interface AdminCredentials { user: string; passwordHash: string; totpSecret: string }

export function parseCredentials(json: unknown): AdminCredentials {
  const root = object(json, 'admin-login');
  const user = text(root.user, 'user');
  if (!/^[\x21-\x7e]{1,32}$/.test(user)) throw new Error('user must be 1 to 32 printable characters, no spaces');
  const passwordHash = text(root.passwordHash, 'passwordHash');
  if (!passwordHash.startsWith('scrypt$')) throw new Error('passwordHash must be an scrypt hash from admin:setup');
  const totpSecret = text(root.totpSecret, 'totpSecret');
  let key: Buffer;
  try {
    key = base32Decode(totpSecret);
  } catch {
    throw new Error('totpSecret must be base32');
  }
  if (key.length < 16) throw new Error('totpSecret must hold at least 128 bits');
  return { user, passwordHash, totpSecret };
}

export function readCredentials(path: string): AdminCredentials {
  return parseCredentials(JSON.parse(readFileSync(path, 'utf8')));
}

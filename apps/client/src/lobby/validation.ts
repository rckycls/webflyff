import { MAX_CHARACTER_SLOTS } from '@flyffweb/protocol';
import type { NewCharacter } from '@flyffweb/protocol';
import { HAIR_MESH_COUNT, HEAD_MESH_COUNT, JOB_VAGRANT, Sex } from './appearance';

/**
 * What the create screen checks about a name, for English (`IsValidPlayerName`), in its order. The name is judged
 * trimmed. Returns the message to show, or `undefined` when the name is fine. Piece 2 allows ASCII letters and
 * digits only, so a name always fits the ASCII-only packets.
 */
export function validateCharacterName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter name.';
  if (trimmed.length < 4 || trimmed.length > 16) return 'Character Name must be 4 to 16 characters long.';
  if (/^[0-9]/.test(trimmed)) return 'The name cannot start with a number.';
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'You cannot use special characters or spaces in a name.';
  return undefined;
}

/**
 * The Bank PIN (`__2ND_PASSWORD_SYSTEM`) rules of the create screen, in order. `confirm` is the second entry of
 * the PIN; a caller that asks only once passes the PIN twice. Returns the message to show, or `undefined`.
 */
export function validateBankPin(pin: string, confirm: string): string | undefined {
  if (pin === '') return 'Enter the Bank PIN to continue.';
  if (!/^\d{4}$/.test(pin)) return 'The Bank PIN should be a 4 digit number.';
  if (pin === '0000') return 'Invalid Bank PIN.';
  if (confirm === '') return 'Confirm Bank PIN.';
  if (pin !== confirm) return 'Bank PINs do not match.';
  return undefined;
}

/** True for a character slot: a whole number from 0 to 2. */
export function isCharacterSlot(slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_CHARACTER_SLOTS;
}

const isByte = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xff;

/**
 * True when the look of a new character is one the create screen offers and every field fits its wire size
 * (the packet writers wrap a number that does not, and the server would create a different character).
 */
export function isValidAppearance(c: NewCharacter): boolean {
  return isByte(c.face) && isByte(c.costume) && isByte(c.skinSet)
    && Number.isInteger(c.hairMesh) && c.hairMesh >= 0 && c.hairMesh < HAIR_MESH_COUNT
    && Number.isInteger(c.headMesh) && c.headMesh >= 0 && c.headMesh < HEAD_MESH_COUNT
    && Number.isInteger(c.hairColor) && c.hairColor >= 0 && c.hairColor <= 0xffffffff
    && (c.sex === Sex.MALE || c.sex === Sex.FEMALE)
    && c.job === JOB_VAGRANT;
}

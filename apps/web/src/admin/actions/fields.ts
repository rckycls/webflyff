// Reading an action's JSON body: each field is checked for its type and size before anything uses it.

import type { HttpAnswer } from '../../signUpHandler';

export const reply = (status: number, body: Record<string, unknown>): HttpAnswer => ({ status, body });
export const okReply = (body: Record<string, unknown> = {}): HttpAnswer => reply(200, { ok: true, ...body });
export const invalid = (field: string, message?: string): HttpAnswer =>
  reply(400, { error: 'invalid', field, ...(message === undefined ? {} : { message }) });

/** A trimmed string of 1 to `max` characters, or `undefined` (missing, empty, not a string, too long). */
export function textField(body: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = body[key];
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' || text.length > max ? undefined : text;
}

/** A whole number from `min` to `max`, or `undefined`. */
export function intField(body: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const value = body[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/** A character id as the game keeps it: 7 digits. */
export function idPlayerField(body: Record<string, unknown>): string | undefined {
  const value = body.idPlayer;
  return typeof value === 'string' && /^\d{7}$/.test(value) ? value : undefined;
}

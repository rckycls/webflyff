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

/** The highest list page number taken. */
export const MAX_PAGE = 1_000_000;

/** `page` of a list request: 1 when it is not given; `undefined` when it is not a whole number from 1. */
export function pageField(body: Record<string, unknown>): number | undefined {
  return body.page === undefined ? 1 : intField(body, 'page', 1, MAX_PAGE);
}

/** `yyyymmdd` of the day `days` after `ms`, in this machine's time (SQL Server's GETDATE() on the same VPS). */
export function localDay(ms: number, days = 0): string {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** `yyyy-mm-dd` as `yyyymmdd`, when it is a real calendar day; else `undefined`. */
export function dateInput(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m === null) return undefined;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return undefined;
  return `${m[1]}${m[2]}${m[3]}`;
}

/** A character id as the game keeps it: 7 digits. */
export function idPlayerField(body: Record<string, unknown>): string | undefined {
  const value = body.idPlayer;
  return typeof value === 'string' && /^\d{7}$/.test(value) ? value : undefined;
}

// The VIP tab's Codes view (2026-11-20, redeem codes, docs/superpowers/specs/2026-11-20-vip-codes-design.md): the owner
// makes codes that give a VIP level for some days, up to 6 item stacks (any item of the item list, the game's box
// items too), or both; for everyone (an optional cap), only some accounts, or a batch of one-use keys; with an end
// time. Players redeem them in the game's Redeem Code window. What a code gives never changes after it is made: the
// owner changes only its name and end time, and turns it on or off. Every change is in the Log tab, never a key.
// Without the codes (no vip or admin section) every action answers 503 `off`.

import { newKey, normalizeKey, showKey } from '../../codes/codeKeys';
import type { CodeAdminStore, CodeItem, CodeKind, CodeRow } from '../../codes/codeStore';
import { CODE_KINDS } from '../../codes/codeStore';
import type { HttpAnswer } from '../../signUpHandler';
import type { ActionHandler, AdminDeps } from '../adminServer';
import { runAudited } from '../audit';
import { intField, invalid, okReply, reply, textField } from './fields';

const DAY_MS = 86_400_000;
/** The most days ahead a code may end, of VIP it may give, of uses an everyone code may have, of keys and accounts. */
export const MAX_CODE_DAYS = 366;
export const MAX_VIP_DAYS = 366;
export const MAX_USES = 100_000;
export const MAX_BATCH = 500;
export const MAX_ACCOUNTS = 500;
const USES_ROWS = 100;

const off = (): HttpAnswer => reply(503, { error: 'off', message: 'Codes are off: web.config.json needs good "vip" and "admin" sections.' });
const notFound = (): HttpAnswer => reply(404, { error: 'not_found', message: 'There is no such code.' });

const withCodes = (handler: (body: Record<string, unknown>, ctx: Parameters<ActionHandler>[1], deps: AdminDeps, codes: CodeAdminStore) => Promise<HttpAnswer>): ActionHandler =>
  async (body, ctx, deps) => (deps.vip?.codes === undefined ? off() : handler(body, ctx, deps, deps.vip.codes));

/** An ISO time from now to `MAX_CODE_DAYS` days ahead, as ISO text; `undefined` otherwise. */
function endTime(value: unknown, now: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > now && ms <= now + MAX_CODE_DAYS * DAY_MS ? new Date(ms).toISOString() : undefined;
}

/** Account names typed one per line, or with commas or spaces between them. */
function accountList(value: unknown): string[] | undefined {
  const names = typeof value === 'string' ? value.split(/[\s,;]+/) : Array.isArray(value) ? value : undefined;
  if (names === undefined || !names.every((n) => typeof n === 'string')) return undefined;
  const list = [...new Set((names as string[]).map((n) => n.trim()).filter((n) => n !== ''))];
  return list.every((n) => /^[\x21-\x7e]{1,32}$/.test(n)) ? list : undefined;
}

type Named = CodeItem & { name: string | null };

function named(deps: AdminDeps, items: CodeItem[]): Named[] {
  const names = new Map(deps.catalog.map((i) => [i.id, i.name]));
  return items.map((i) => ({ ...i, name: names.get(i.itemId) ?? null }));
}

/** on, off, expired, or used up (an everyone code at its cap, a batch with no key left). */
function stateOf(row: CodeRow, now: number): 'on' | 'off' | 'expired' | 'used_up' {
  if (!row.on) return 'off';
  if (Date.parse(row.expiresAt) <= now) return 'expired';
  if ((row.kind === 'E' && row.maxUses !== null && row.uses >= row.maxUses) || (row.kind === 'K' && row.keysUnused === 0)) return 'used_up';
  return 'on';
}

const shown = (deps: AdminDeps, row: CodeRow) => ({
  ...row, firstKey: row.firstKey === null ? null : showKey(row.firstKey), items: named(deps, row.items), state: stateOf(row, deps.now()),
});

const list = withCodes(async (_body, _ctx, deps, codes) => reply(200, { rows: (await codes.list()).map((row) => shown(deps, row)) }));

const get = withCodes(async (body, _ctx, deps, codes) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const code = await codes.get(id);
  return code === undefined ? notFound() : reply(200, { code: { ...shown(deps, code), accounts: code.accounts } });
});

const keys = withCodes(async (body, _ctx, _deps, codes) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  return reply(200, { rows: (await codes.keys(id)).map((k) => ({ ...k, key: showKey(k.key) })) });
});

const uses = withCodes(async (body, _ctx, _deps, codes) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  return reply(200, { rows: await codes.uses(id, USES_ROWS) });
});

const add = withCodes(async (body, ctx, deps, codes) => {
  const now = deps.now();
  const label = textField(body, 'label', 64);
  if (label === undefined) return invalid('label', 'Give the code a name (1 to 64 characters).');
  const vipLevel = body.vipLevel === undefined ? 0 : intField(body, 'vipLevel', 0, 4);
  if (vipLevel === undefined) return invalid('vipLevel', 'The VIP level is none or 1 to 4.');
  const vipDays = vipLevel === 0 ? 0 : intField(body, 'vipDays', 1, MAX_VIP_DAYS);
  if (vipDays === undefined) return invalid('vipDays', `The VIP days are 1 to ${MAX_VIP_DAYS}.`);
  const rawItems = body.items ?? [];
  if (!Array.isArray(rawItems) || rawItems.length > 6) return invalid('items', 'A code holds up to 6 item stacks.');
  const items: CodeItem[] = [];
  for (const raw of rawItems as unknown[]) {
    const row = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const id = intField(row, 'itemId', 1, 2_147_483_647);
    const item = id === undefined ? undefined : deps.catalog.find((i) => i.id === id);
    if (item === undefined) return invalid('items', 'Pick each item from the search.');
    const count = intField(row, 'count', 1, 9999);
    if (count === undefined) return invalid('items', `The count of ${item.name} is 1 to ${Math.min(item.packMax, 9999)}.`);
    if (count > item.packMax) return invalid('items', `${item.name} stacks to ${item.packMax}: one stack holds at most that many.`);
    items.push({ itemId: item.id, count });
  }
  if (vipLevel === 0 && items.length === 0) return invalid('items', 'A code gives a VIP level, an item, or both.');
  const kind = body.kind;
  if (typeof kind !== 'string' || !CODE_KINDS.includes(kind as CodeKind)) return invalid('kind', 'Pick who can use it.');
  const expiresAt = endTime(body.expiresAt, now);
  if (expiresAt === undefined) return invalid('expiresAt', `The end time must be in the future, at most ${MAX_CODE_DAYS} days ahead.`);

  let maxUses: number | null = null;
  let codeKeys: string[];
  let accounts: string[] = [];
  if (kind === 'K') {
    const count = intField(body, 'count', 1, MAX_BATCH);
    if (count === undefined) return invalid('count', `A batch has 1 to ${MAX_BATCH} one-use codes.`);
    const made = new Set<string>();
    while (made.size < count) made.add(newKey());
    codeKeys = [...made];
  } else {
    const word = body.word === undefined || body.word === null || body.word === '' ? undefined : normalizeKey(body.word);
    if (word === undefined && body.word !== undefined && body.word !== null && body.word !== '') {
      return invalid('word', 'Your own word is 4 to 32 letters and digits (spaces and dashes are left out).');
    }
    codeKeys = [word ?? newKey()];
    if (kind === 'E' && body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '') {
      const cap = intField(body, 'maxUses', 1, MAX_USES);
      if (cap === undefined) return invalid('maxUses', `The most uses are 1 to ${MAX_USES.toLocaleString('en-US')}, or empty for no cap.`);
      maxUses = cap;
    }
    if (kind === 'L') {
      const names = accountList(body.accounts);
      if (names === undefined || names.length === 0 || names.length > MAX_ACCOUNTS) return invalid('accounts', `List 1 to ${MAX_ACCOUNTS} account names.`);
      accounts = names;
    }
  }

  const before = { label, kind, vipLevel, vipDays, items, maxUses, keys: codeKeys.length, accounts: accounts.length, expiresAt };
  return runAudited(deps, ctx, { action: 'codes.add', before }, async () => {
    const done = await codes.add({ label, kind: kind as CodeKind, vipLevel, vipDays, maxUses, expiresAt, items, keys: codeKeys, accounts, admin: ctx.session.user });
    if ('id' in done) return { answer: okReply({ id: done.id, keys: codeKeys.map(showKey) }), result: 'ok', after: { id: done.id } };
    if (done.refused === 'key_taken') {
      const answer = kind === 'K'
        ? reply(409, { error: 'refused', message: 'A new code matched an old one: press Make again.' })
        : invalid('word', `The code ${showKey(done.detail)} is taken: pick another word.`);
      return { answer, result: 'refused', after: { refused: 'key_taken' } };
    }
    if (done.refused === 'unknown_account') {
      return { answer: invalid('accounts', `There is no account named ${done.detail}.`), result: 'refused', after: { unknown: done.detail } };
    }
    return { answer: invalid('label', 'A value is out of range.'), result: 'refused', after: { refused: 'invalid' } };
  });
});

const save = withCodes(async (body, ctx, deps, codes) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const label = textField(body, 'label', 64);
  if (label === undefined) return invalid('label', 'Give the code a name (1 to 64 characters).');
  const expiresAt = endTime(body.expiresAt, deps.now());
  if (expiresAt === undefined) return invalid('expiresAt', `The end time must be in the future, at most ${MAX_CODE_DAYS} days ahead (turn the code off to end it now).`);
  if (typeof body.on !== 'boolean') return invalid('on');
  const on = body.on;
  const code = await codes.get(id);
  if (code === undefined) return notFound();
  const before = { id, label: code.label, expiresAt: code.expiresAt, on: code.on };
  return runAudited(deps, ctx, { action: 'codes.save', before }, async () => ((await codes.save(id, label, expiresAt, on))
    ? { answer: okReply(), result: 'ok', after: { id, label, expiresAt, on } }
    : { answer: notFound(), result: 'refused', after: { id } }));
});

export const CODE_ACTIONS = {
  'codes.list': list,
  'codes.get': get,
  'codes.add': add,
  'codes.save': save,
  'codes.keys': keys,
  'codes.uses': uses,
} satisfies Record<string, ActionHandler>;

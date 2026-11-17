// The Accounts tab (admin panel spec §5.5): the list, 10 a page (2026-11-17), search, view, create, password, email,
// authority level, ban and unban. Every write looks the account up first (404 when there is none, nothing done), then
// writes to the name as stored, through runAudited, and drops the list pages it changed (pageCache.ts). Passwords and
// their hashes never reach the log.

import { checkSignUp, checkSignUpEmail, checkSignUpPassword, hashPassword, normalizeAccount } from '@flyffweb/protocol';
import type { HttpAnswer } from '../../signUpHandler';
import type { ActionHandler, AdminContext, AdminDeps } from '../adminServer';
import { AUTHORITIES } from '../adminStore';
import type { AccountRow, Authority, Page } from '../adminStore';
import { runAudited } from '../audit';
import { PAGE_SIZE, withStale } from '../pageCache';
import type { AccountFilter, Stale } from '../pageCache';
import { dateInput, invalid, localDay, okReply, pageField, reply, textField } from './fields';

const isAuthority = (letter: unknown): letter is Authority => typeof letter === 'string' && (AUTHORITIES as readonly string[]).includes(letter);

const FOREVER = '99991231';
const NO_RESERVED_NAMES = { exact: [], prefixes: [] };
const notFound = (): HttpAnswer => reply(404, { error: 'not_found' });

/** The account the body names, as stored; or the answer to give instead. */
async function target(body: Record<string, unknown>, deps: AdminDeps): Promise<AccountRow | HttpAnswer> {
  const name = textField(body, 'account', 32);
  if (name === undefined) return invalid('account');
  return (await deps.store.getAccount(name)) ?? notFound();
}

const isAnswer = (value: AccountRow | HttpAnswer): value is HttpAnswer => 'status' in value;

const search: ActionHandler = async (body, _ctx, deps) => {
  const account = textField(body, 'account', 32);
  const email = textField(body, 'email', 100);
  const characterName = textField(body, 'characterName', 32);
  if (account === undefined && email === undefined && characterName === undefined) return invalid('query', 'Enter an account, an email or a character name.');
  if (characterName !== undefined) {
    const names = [...new Set((await deps.store.searchCharacters({ name: characterName })).map((c) => c.account))];
    const rows = (await Promise.all(names.map((name) => deps.store.getAccount(name)))).filter((r): r is AccountRow => r !== undefined);
    return reply(200, { rows });
  }
  return reply(200, { rows: await deps.store.searchAccounts({ account, email }) });
};

/**
 * One page of the account list: every account, or those of an account prefix, an exact email or a character name
 * prefix (its accounts, from at most 50 characters). Kept a short time; `fresh: true` (Refresh) drops every kept page
 * of the list first.
 */
const page: ActionHandler = async (body, _ctx, deps) => {
  const number = pageField(body);
  if (number === undefined) return invalid('page');
  const filter: AccountFilter = { account: textField(body, 'account', 32), email: textField(body, 'email', 100), characterName: textField(body, 'characterName', 32) };
  if (filter.characterName !== undefined) { filter.account = undefined; filter.email = undefined; }
  if (body.fresh === true) deps.pages.clear('accounts');
  const kept = deps.pages.get('accounts', filter, number);
  if (kept !== undefined) return reply(200, { ...kept, page: number, pageSize: PAGE_SIZE, kept: true });
  const offset = (number - 1) * PAGE_SIZE;
  let result: Page<AccountRow>;
  if (filter.characterName !== undefined) {
    const owners = new Map<string, string>();
    for (const c of await deps.store.searchCharacters({ name: filter.characterName })) owners.set(c.account.toLowerCase(), c.account);
    const all = (await Promise.all([...owners.values()].map((name) => deps.store.getAccount(name))))
      .filter((r): r is AccountRow => r !== undefined)
      .sort((x, y) => x.account.toLowerCase().localeCompare(y.account.toLowerCase()));
    result = { rows: all.slice(offset, offset + PAGE_SIZE), total: all.length };
  } else {
    result = await deps.store.accountPage({ account: filter.account, email: filter.email }, offset, PAGE_SIZE);
  }
  return reply(200, { ...deps.pages.set('accounts', filter, number, result), page: number, pageSize: PAGE_SIZE, kept: false });
};

const get: ActionHandler = async (body, _ctx, deps) => {
  const row = await target(body, deps);
  if (isAnswer(row)) return row;
  return reply(200, { account: row, characters: await deps.store.searchCharacters({ account: row.account }) });
};

const create: ActionHandler = async (body, ctx, deps) => {
  const form = {
    account: typeof body.account === 'string' ? body.account : '',
    password: typeof body.password === 'string' ? body.password : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
  };
  const problem = checkSignUp(form, NO_RESERVED_NAMES);
  if (problem !== undefined) return invalid(problem.field, problem.message);
  const account = normalizeAccount(form.account);
  const answer = await runAudited(deps, ctx, { action: 'accounts.create', account, before: { email: form.email } }, async () => {
    const made = await deps.store.createAccount(account, hashPassword(form.password), form.email);
    if (made === 1) return { answer: okReply({ account }), result: 'ok', after: { created: true } };
    if (made === 0) return { answer: reply(409, { error: 'taken' }), result: 'refused', after: { taken: true } };
    return { answer: reply(500, { error: 'server' }), result: 'failed', after: { made } };
  });
  // a new account changes every list's total
  return withStale(deps, answer, { accounts: { all: true } });
};

interface AccountWrite {
  action: string;
  /** A problem with the request, found before anything is logged or done. */
  check?: (row: AccountRow) => HttpAnswer | undefined;
  /** What the audit row keeps as the values before. */
  before: (row: AccountRow) => unknown;
  /** The change; `done` false is a refusal from the database. */
  write: (row: AccountRow) => Promise<{ done: boolean; after: unknown }>;
  /** The list pages the change makes old (none: nothing a list shows changes). */
  stale?: (row: AccountRow) => Stale;
}

/** A write on one existing account: looked up, checked, then done through runAudited. */
async function onAccount(body: Record<string, unknown>, ctx: AdminContext, deps: AdminDeps, w: AccountWrite): Promise<HttpAnswer> {
  const row = await target(body, deps);
  if (isAnswer(row)) return row;
  const problem = w.check?.(row);
  if (problem !== undefined) return problem;
  const answer = await runAudited(deps, ctx, { action: w.action, account: row.account, before: w.before(row) }, async () => {
    const outcome = await w.write(row);
    return outcome.done
      ? { answer: okReply(), result: 'ok', after: outcome.after }
      : { answer: reply(409, { error: 'refused' }), result: 'refused', after: outcome.after };
  });
  return w.stale === undefined ? answer : withStale(deps, answer, w.stale(row));
}

/** The pages that show this account. */
const shown = (row: AccountRow): Stale => ({ accounts: { names: [row.account] } });

const password: ActionHandler = async (body, ctx, deps) => {
  const pw = typeof body.password === 'string' ? body.password : '';
  return onAccount(body, ctx, deps, {
    action: 'accounts.password',
    check: (row) => {
      const problem = checkSignUpPassword(row.account, pw);
      return problem === undefined ? undefined : invalid(problem.field, problem.message);
    },
    before: () => ({}),
    write: async (row) => ({ done: await deps.store.setPassword(row.account, hashPassword(pw)), after: { password: 'changed' } }),
  });
};

const email: ActionHandler = async (body, ctx, deps) => {
  const value = typeof body.email === 'string' ? body.email.trim() : '';
  return onAccount(body, ctx, deps, {
    action: 'accounts.email',
    check: () => {
      const problem = checkSignUpEmail(value);
      return problem === undefined ? undefined : invalid(problem.field, problem.message);
    },
    before: (row) => ({ email: row.email }),
    write: async (row) => ({ done: await deps.store.setEmail(row.account, value), after: { email: value } }),
    // its row, and who an email filter finds
    stale: (row) => ({ accounts: { names: [row.account], byEmail: true } }),
  });
};

/**
 * The account's own authority letter (`m_chLoginAuthority`), then, unless `characters` is false, the same letter on
 * every character of the account (`m_chAuthority`). Each is its own audit row, so the log says which one was done when
 * the second fails. Both are read at the next login (the account's wins in the game unless it is a player or a VIP).
 */
const authority: ActionHandler = async (body, ctx, deps) => {
  const row = await target(body, deps);
  if (isAnswer(row)) return row;
  const letter = body.authority;
  if (!isAuthority(letter)) return invalid('authority');
  if (body.characters !== undefined && typeof body.characters !== 'boolean') return invalid('characters');
  const alsoCharacters = body.characters !== false;

  const first = await runAudited(deps, ctx, { action: 'accounts.authority', account: row.account, before: { authority: row.authority } }, async () => (
    (await deps.store.setLoginAuthority(row.account, letter))
      ? { answer: okReply({ characters: 0 }), result: 'ok', after: { authority: letter } }
      : { answer: reply(409, { error: 'refused' }), result: 'refused', after: { authority: letter } }));
  if (first.status !== 200 || !alsoCharacters) return withStale(deps, first, shown(row));

  let before: unknown;
  try {
    before = (await deps.store.searchCharacters({ account: row.account })).map((c) => ({ name: c.name, authority: c.authority }));
  } catch {
    before = 'not read';
  }
  const second = await runAudited(deps, ctx, { action: 'accounts.charactersAuthority', account: row.account, before: { characters: before } }, async () => {
    const characters = await deps.store.setCharacterAuthority(row.account, letter);
    return { answer: okReply({ characters }), result: 'ok', after: { authority: letter, characters } };
  });
  const stale: Stale = { accounts: { names: [row.account] }, characters: { accounts: [row.account] } };
  if (second.status !== 200) {
    return withStale(deps, reply(500, { error: 'server', message: 'The account\'s level was changed, but its characters\' levels were not. Try again, or set them one by one.' }), stale);
  }
  return withStale(deps, second, stale);
};

const ban: ActionHandler = async (body, ctx, deps) => {
  const until = body.until === 'forever' ? FOREVER : dateInput(body.until);
  const reason = textField(body, 'reason', 200);
  return onAccount(body, ctx, deps, {
    action: 'accounts.ban',
    check: () => {
      if (until === undefined || (until !== FOREVER && until < localDay(deps.now()))) return invalid('until', 'Pick today or a later day, or forever.');
      if (reason === undefined) return invalid('reason', 'Write a reason (up to 200 characters).');
      return undefined;
    },
    before: (row) => ({ blockTime: row.blockTime }),
    write: async (row) => ({ done: await deps.store.setBlockTime(row.account, until!), after: { blockTime: until, reason } }),
    stale: shown,
  });
};

const unban: ActionHandler = async (body, ctx, deps) => onAccount(body, ctx, deps, {
  action: 'accounts.unban',
  before: (row) => ({ blockTime: row.blockTime }),
  write: async (row) => ({ done: await deps.store.setBlockTime(row.account, null), after: { unbanned: true } }),
  stale: shown,
});

export const ACCOUNT_ACTIONS = {
  'accounts.search': search,
  'accounts.page': page,
  'accounts.get': get,
  'accounts.create': create,
  'accounts.password': password,
  'accounts.email': email,
  'accounts.authority': authority,
  'accounts.ban': ban,
  'accounts.unban': unban,
} satisfies Record<string, ActionHandler>;

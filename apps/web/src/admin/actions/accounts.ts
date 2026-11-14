// The Accounts tab (admin panel spec §5.5): search, view, create, password, email, GM level, ban and unban.
// Every write looks the account up first (404 when there is none, nothing done), then writes to the name as stored,
// through runAudited. Passwords and their hashes never reach the log.

import { checkSignUp, checkSignUpEmail, checkSignUpPassword, hashPassword, normalizeAccount } from '@flyffweb/protocol';
import type { HttpAnswer } from '../../signUpHandler';
import type { ActionHandler, AdminContext, AdminDeps } from '../adminServer';
import { AUTHORITIES } from '../adminStore';
import type { AccountRow, Authority } from '../adminStore';
import { runAudited } from '../audit';
import { dateInput, invalid, localDay, okReply, reply, textField } from './fields';

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
  return runAudited(deps, ctx, { action: 'accounts.create', account, before: { email: form.email } }, async () => {
    const made = await deps.store.createAccount(account, hashPassword(form.password), form.email);
    if (made === 1) return { answer: okReply({ account }), result: 'ok', after: { created: true } };
    if (made === 0) return { answer: reply(409, { error: 'taken' }), result: 'refused', after: { taken: true } };
    return { answer: reply(500, { error: 'server' }), result: 'failed', after: { made } };
  });
};

interface AccountWrite {
  action: string;
  /** A problem with the request, found before anything is logged or done. */
  check?: (row: AccountRow) => HttpAnswer | undefined;
  /** What the audit row keeps as the values before. */
  before: (row: AccountRow) => unknown;
  /** The change; `done` false is a refusal from the database. */
  write: (row: AccountRow) => Promise<{ done: boolean; after: unknown }>;
}

/** A write on one existing account: looked up, checked, then done through runAudited. */
async function onAccount(body: Record<string, unknown>, ctx: AdminContext, deps: AdminDeps, w: AccountWrite): Promise<HttpAnswer> {
  const row = await target(body, deps);
  if (isAnswer(row)) return row;
  const problem = w.check?.(row);
  if (problem !== undefined) return problem;
  return runAudited(deps, ctx, { action: w.action, account: row.account, before: w.before(row) }, async () => {
    const outcome = await w.write(row);
    return outcome.done
      ? { answer: okReply(), result: 'ok', after: outcome.after }
      : { answer: reply(409, { error: 'refused' }), result: 'refused', after: outcome.after };
  });
}

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
  });
};

const authority: ActionHandler = async (body, ctx, deps) => {
  const letter = body.authority;
  return onAccount(body, ctx, deps, {
    action: 'accounts.authority',
    check: () => (typeof letter === 'string' && (AUTHORITIES as readonly string[]).includes(letter) ? undefined : invalid('authority')),
    before: (row) => ({ authority: row.authority }),
    write: async (row) => {
      const done = await deps.store.setLoginAuthority(row.account, letter as Authority);
      const characters = done ? await deps.store.setCharacterAuthority(row.account, letter as Authority) : 0;
      return { done, after: { authority: letter, characters } };
    },
  });
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
  });
};

const unban: ActionHandler = async (body, ctx, deps) => onAccount(body, ctx, deps, {
  action: 'accounts.unban',
  before: (row) => ({ blockTime: row.blockTime }),
  write: async (row) => ({ done: await deps.store.setBlockTime(row.account, null), after: { unbanned: true } }),
});

export const ACCOUNT_ACTIONS = {
  'accounts.search': search,
  'accounts.get': get,
  'accounts.create': create,
  'accounts.password': password,
  'accounts.email': email,
  'accounts.authority': authority,
  'accounts.ban': ban,
  'accounts.unban': unban,
} satisfies Record<string, ActionHandler>;

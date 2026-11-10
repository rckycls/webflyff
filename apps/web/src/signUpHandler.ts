// `POST /api/sign-up` (website spec §3.4), in its steps:
//
// 1. the request: JSON (415), at most 1 KB (413), from the site's own Origin (403), an object whose fields are strings
//    (400 invalid). Only account, password, email, website and ticket are read: `cash` or `authority` never reach the
//    database;
// 2. the address's attempts: 20 an hour (429 too_many);
// 3. the ticket: signed, 3 s to 30 min old, used once (400 ticket);
// 4. the trap field: filled, answer 201 as if made, make nothing (logged as a bot);
// 5. the rules and the reserved names (400 invalid, with the field);
// 6. the accounts made: 3 an hour from the address (429 too_many), 60 an hour in all (429 paused);
// 7. `usp_CreateNewAccount` with the password as the login sends it, `hashPassword`: 1 → 201, 0 → 409 taken, anything
//    else or a database error → 500 server.
//
// One log line per request: `signup <address> <account or -> <result>`. Never the password, the email or the ticket.
// The refusals a flood can repeat (type, size, forbidden, a body that is not a form, past the attempts) go through a
// RefusalLog: the first of a kind each minute, then a count.

import { checkSignUp, hashPassword, normalizeAccount } from '@flyffweb/protocol';
import type { AccountStore } from './accountStore';
import type { WebConfig } from './config';
import type { HourlyLimit } from './hourlyLimit';
import type { Logger } from './log';
import type { RefusalLog } from './refusalLog';
import type { TicketBook } from './ticket';

export const MAX_BODY_BYTES = 1024;
/** The site-wide limit's one key. */
const ALL = 'all';

export interface HttpAnswer { status: number; body: Record<string, unknown> }
export interface SignUpRequest { address: string; origin: string | undefined; contentType: string | undefined; body: Buffer }
export interface SignUpDeps {
  config: WebConfig;
  store: AccountStore;
  tickets: TicketBook;
  attempts: HourlyLimit;
  createdByAddress: HourlyLimit;
  createdInAll: HourlyLimit;
  log: Logger;
  /** Where the refusals a flood can repeat go, so that they cannot fill the log. */
  refusals: RefusalLog;
}

const FIELDS = ['account', 'password', 'email', 'website', 'ticket'] as const;
type Form = Record<(typeof FIELDS)[number], string>;

/** A name as a log line can hold it: one word of printable ASCII, at most 32 characters, `-` for none. */
function logName(account: string | undefined): string {
  const name = normalizeAccount(account ?? '').replace(/[^\x21-\x7e]/g, '?').slice(0, 32);
  return name === '' ? '-' : name;
}

/** The fields, when the body is a JSON object whose read fields are strings (missing ones are empty). */
function readForm(body: Buffer): Form | undefined {
  let json: unknown;
  try {
    json = JSON.parse(body.toString('utf8'));
  } catch {
    return undefined;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;
  const form = {} as Form;
  for (const name of FIELDS) {
    const value = (json as Record<string, unknown>)[name] ?? '';
    if (typeof value !== 'string') return undefined;
    form[name] = value;
  }
  return form;
}

export async function handleSignUp(req: SignUpRequest, deps: SignUpDeps): Promise<HttpAnswer> {
  const { address } = req;
  let name = '-';
  const answer = (status: number, body: Record<string, unknown>, result: string): HttpAnswer => {
    deps.log.info(`signup ${address} ${name} ${result}`);
    return { status, body };
  };
  /** An answer a flood can repeat without end (before the attempt is counted, or past the attempts): logged capped. */
  const refuse = (status: number, body: Record<string, unknown>, result: string): HttpAnswer => {
    deps.refusals.note(`signup ${address} ${result}`, `signup ${address} ${name} ${result}`);
    return { status, body };
  };

  if (req.contentType?.toLowerCase().startsWith('application/json') !== true) return refuse(415, { error: 'type' }, 'type');
  if (req.body.length > MAX_BODY_BYTES) return refuse(413, { error: 'size' }, 'size');
  if (req.origin !== deps.config.siteOrigin) return refuse(403, { error: 'forbidden' }, 'forbidden');
  const form = readForm(req.body);
  if (form === undefined) return refuse(400, { error: 'invalid' }, 'invalid');
  name = logName(form.account);

  // every attempt that gets this far counts, whatever comes of it
  if (!deps.attempts.allows(address)) return refuse(429, { error: 'too_many' }, 'too_many');
  deps.attempts.add(address);

  if (deps.tickets.check(form.ticket) !== 'ok') return answer(400, { error: 'ticket' }, 'ticket');
  if (form.website !== '') return answer(201, { ok: true }, 'bot');

  const email = form.email.trim();
  const problem = checkSignUp({ account: form.account, password: form.password, email }, deps.config.reservedNames);
  if (problem !== undefined) return answer(400, { error: 'invalid', field: problem.field }, `invalid:${problem.field}`);

  if (!deps.createdByAddress.allows(address)) return answer(429, { error: 'too_many' }, 'too_many');
  if (!deps.createdInAll.allows(ALL)) return answer(429, { error: 'paused' }, 'paused');

  // The places are taken now, before the database answers: requests sent at once all pass the checks above before
  // any of them is made, so a place counted only afterwards would let every one of them through. One that is not
  // made after all gives its places back.
  deps.createdByAddress.add(address);
  deps.createdInAll.add(ALL);
  const giveBack = () => {
    deps.createdByAddress.release(address);
    deps.createdInAll.release(ALL);
  };

  let made: number;
  try {
    made = await deps.store.create(normalizeAccount(form.account), hashPassword(form.password), email);
  } catch (error) {
    giveBack();
    // the database's message, on one line, with nothing of the request's secrets in it
    let message = String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');
    for (const secret of [form.password, email, form.ticket]) if (secret !== '') message = message.split(secret).join('***');
    deps.log.warn(`signup database error: ${message}`);
    return answer(500, { error: 'server' }, 'error');
  }
  if (made === 1) return answer(201, { ok: true }, 'created');
  giveBack();
  if (made === 0) return answer(409, { error: 'taken' }, 'taken');
  return answer(500, { error: 'server' }, 'error');
}

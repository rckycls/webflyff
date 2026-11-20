// Redeem codes on the public web service (2026-11-20, docs/superpowers/specs/2026-11-20-vip-codes-design.md), reached
// through the VIP routes (vip/siteVip.ts) once the POST's Origin, JSON type, session and CSRF token were checked; the
// game's Redeem Code window calls them on the site session it opened at login.
//
// - `POST /api/codes/check` `{code}`: `200 {ok, offer, vip, replaces}`: what the code would give this account now;
// - `POST /api/codes/redeem` `{code, character, requestId, confirm}`: `200 {ok, useId, offer, vip, repeat}`; the items go
//   to the character (its idPlayer, checked to be the account's) by in-game mail, written right after (deliver) and,
//   if that fails, by the VIP job within 5 minutes.
// Refusals: `400 {error:'format'}` (not 4-32 letters and digits once spaces and dashes are dropped; no try counted),
// `400 {error:'invalid', field}`, `404 {error:'unknown'}`, `409 {error, offer, vip}` (expired, inactive, claimed,
// key_used, mine, not_listed, lower_vip, confirm, character), `429 {error:'too_many'}` (10 wrong tries an hour per
// account, 30 per address: unknown and not_listed count; 30 redeem presses an hour per account, refused ones too, a
// repeat not), `413 {error:'size'}`. The answer goes before the mail is written (the final review).
//
// One log line each: `code <address> <account> <code id or -> <what>`. Never the code text.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HourlyLimit } from '../hourlyLimit';
import type { Logger } from '../log';
import { readBody } from '../server';
import { logWord, parseObject, refuseUnread, send } from '../vip/siteVip';
import { normalizeKey } from './codeKeys';
import type { CodeRefusal, CodeSiteStore } from './codeStore';

export const CODE_FAILS_PER_HOUR = 10;
export const CODE_FAILS_PER_ADDRESS_HOUR = 30;
export const CODE_REDEEMS_PER_HOUR = 30;
const BODY_LIMIT = 512;
/** The refusals that count as a wrong try: they tell a guesser something. */
const WRONG_TRIES: readonly CodeRefusal[] = ['unknown', 'not_listed'];

export type CodeRoutes = (req: IncomingMessage, res: ServerResponse, path: string, address: string, account: string) => Promise<boolean>;

export interface CodeRouteDeps {
  store: CodeSiteStore;
  /** Wrong tries of one account, and from one address, in an hour. */
  failsByAccount: HourlyLimit;
  failsByAddress: HourlyLimit;
  /** Redeems of one account in an hour. */
  redeemsByAccount: HourlyLimit;
  /** Mails the use's items now (codeDelivery.ts deliverOne). A failure only waits for the VIP job. */
  deliver(useId: number): Promise<void>;
  log: Logger;
}

const message = (error: unknown): string => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

export function codeRoutes(deps: CodeRouteDeps): CodeRoutes {
  const { store, log } = deps;
  return async (req, res, path, address, account) => {
    const redeeming = path === '/api/codes/redeem';
    if (!redeeming && path !== '/api/codes/check') return false;
    const { body: raw, whole } = await readBody(req, BODY_LIMIT);
    if (!whole || raw.length > BODY_LIMIT) {
      refuseUnread(req, res, 413, { error: 'size' });
      return true;
    }
    const body = parseObject(raw);
    if (body === undefined) {
      send(res, 400, { error: 'invalid' });
      return true;
    }
    const key = normalizeKey(body.code);
    if (key === undefined) {
      send(res, 400, { error: 'format' });
      return true;
    }
    const { character, requestId, confirm } = body;
    if (redeeming) {
      if (typeof character !== 'number' || !Number.isInteger(character) || character < 1 || character > 9_999_999) {
        send(res, 400, { error: 'invalid', field: 'character' });
        return true;
      }
      if (typeof requestId !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(requestId)) {
        send(res, 400, { error: 'invalid', field: 'requestId' });
        return true;
      }
      if (typeof confirm !== 'boolean') {
        send(res, 400, { error: 'invalid', field: 'confirm' });
        return true;
      }
    }
    const who = `code ${address} ${logWord(account)}`;
    if (!deps.failsByAccount.allows(account) || !deps.failsByAddress.allows(address) || (redeeming && !deps.redeemsByAccount.allows(account))) {
      log.info(`${who} - ${redeeming ? '' : 'check:'}too_many`);
      send(res, 429, { error: 'too_many' });
      return true;
    }

    if (!redeeming) {
      const answer = await store.check(account, key);
      const codeId = answer.offer?.codeId ?? '-';
      if (answer.ok) {
        log.info(`${who} ${codeId} check:ok`);
        send(res, 200, { ok: true, offer: answer.offer, vip: answer.vip, replaces: answer.replaces });
        return true;
      }
      refuse(answer.refused, account, address, `${who} ${codeId} check:`, res, answer.offer, answer.vip);
      return true;
    }

    const idPlayer = String(character).padStart(7, '0');
    const characterName = await store.character(account, idPlayer);
    if (characterName === undefined) {
      deps.redeemsByAccount.add(account); // every press counts but a repeat (the final review: no free hammering)
      log.info(`${who} - character`);
      send(res, 409, { error: 'character', offer: null, vip: null });
      return true;
    }
    const answer = await store.redeem({ account, key, requestId: requestId as string, idPlayer, characterName, address, confirm: confirm as boolean });
    const codeId = answer.offer?.codeId ?? '-';
    if (!(answer.ok && answer.repeat)) deps.redeemsByAccount.add(account);
    if (!answer.ok) {
      refuse(answer.refused, account, address, `${who} ${codeId} `, res, answer.offer, answer.vip);
      return true;
    }
    log.info(`${who} ${codeId} ${answer.repeat ? 'repeat' : 'ok'}`);
    // the answer first: a slow mail write must never turn a used code into "can't reach" (the final review); the
    // mail follows at once, and the VIP job writes it within 5 minutes when this fails
    send(res, 200, { ok: true, useId: answer.useId, offer: answer.offer, vip: answer.vip, repeat: answer.repeat });
    if (!answer.repeat) {
      const useId = answer.useId;
      void Promise.resolve().then(() => deps.deliver(useId)).catch((error: unknown) => {
        log.warn(`code: use ${useId} not mailed now (the VIP job tries again): ${message(error)}`);
      });
    }
    return true;
  };

  function refuse(refused: CodeRefusal, account: string, address: string, line: string, res: ServerResponse, offer: unknown, vip: unknown): void {
    if (WRONG_TRIES.includes(refused)) {
      deps.failsByAccount.add(account);
      deps.failsByAddress.add(address);
    }
    log.info(`${line}${refused}`);
    if (refused === 'unknown') send(res, 404, { error: 'unknown' });
    else send(res, 409, { error: refused, offer, vip });
  }
}

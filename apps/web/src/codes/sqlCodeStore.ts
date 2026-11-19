// Redeem codes' SQL Server stores (apps/web/sql/vip.sql, 2026-11-20): the site's, as `flyffweb_site` (ACCOUNT_DBF for
// check and redeem, CHARACTER_01_DBF for usp_WebCodeCharacter), the panel's, as `flyffweb_admin` (ACCOUNT_DBF), and the
// mail side, as `flyffweb_admin` (CHARACTER_01_DBF, usp_AdminCodeMailSend). Typed parameters only; the key and account
// lists go as xml text. Checked by the owner's run in the VM, as the other SQL stores are.

import sql from 'mssql';
import type { AdminConfig } from '../admin/config';
import type { WebConfig } from '../config';
import { lazyPool } from '../sqlAccountStore';
import type {
  CodeAdminStore, CodeItem, CodeKind, CodeMailStore, CodeOffer, CodeRefusal, CodeRow, CodeSiteStore, LiveVip, PendingUse,
} from './codeStore';

type Row = Record<string, unknown>;
type Run = (name: string, inputs?: (r: sql.Request) => sql.Request) => Promise<sql.IProcedureResult<Row>>;

/** usp_WebCodeCheck / usp_WebCodeRedeem's refusals by their result code. */
export const REFUSALS: Record<number, CodeRefusal> = {
  [-1]: 'unknown', [-2]: 'expired', [-3]: 'inactive', [-4]: 'claimed', [-5]: 'key_used', [-6]: 'mine', [-7]: 'not_listed', [-8]: 'lower_vip', [-9]: 'confirm',
};

/** The most item stacks one code holds (usp_AdminCodeAdd's and usp_AdminCodeMailSend's @item1..@item6). */
export const CODE_SLOTS = 6;

const text = (value: unknown): string => String(value ?? '').trim();
const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value).trim());
const num = (value: unknown): number => Number(value ?? 0);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const bool = (value: unknown): boolean => value === true || value === 1;

function rowsOf(result: sql.IProcedureResult<Row>, index = 0): Row[] {
  return (result.recordsets[index] ?? (index === 0 ? result.recordset : undefined) ?? []) as Row[];
}

const item = (r: Row): CodeItem => ({ itemId: num(r.itemId), count: num(r.count) });

/** Text safe inside an xml element. */
export const xmlText = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runner(pool: ReturnType<typeof lazyPool>): Run {
  return async (name, inputs = (r) => r) => inputs((await pool.get()).request()).execute(`dbo.${name}`);
}

/** The answer row and items of check and redeem: the code's offer (none for -1) and the live VIP. */
function answerOf(result: sql.IProcedureResult<Row>): { code: number; useId: number | null; offer: CodeOffer | null; vip: LiveVip | null } {
  const row = rowsOf(result, 0)[0] ?? {};
  const code = num(row.result);
  const codeId = numOrNull(row.codeId);
  const offer: CodeOffer | null = codeId === null ? null : {
    codeId, label: text(row.label), vipLevel: num(row.vipLevel), vipDays: num(row.vipDays), expiresAt: text(row.expiresAt),
    items: rowsOf(result, 1).map(item),
  };
  const liveLevel = numOrNull(row.liveLevel);
  const vip: LiveVip | null = liveLevel === null || liveLevel === 0 ? null : { level: liveLevel, endsAt: text(row.liveEndsAt) };
  return { code, useId: numOrNull(row.useId), offer, vip };
}

/** A refusal from a result code; an unexpected code is an error (the route answers 500). */
function refusalOf(code: number): CodeRefusal {
  const refusal = REFUSALS[code];
  if (refusal === undefined) throw new Error(`unexpected code answer ${code}`);
  return refusal;
}

export function sqlCodeSiteStore(settings: WebConfig['sql']): CodeSiteStore & { close(): Promise<void> } {
  const accounts = lazyPool(settings, settings.accountDatabase);
  const characters = lazyPool(settings, settings.characterDatabase);
  const runAccounts = runner(accounts);
  const runCharacters = runner(characters);
  return {
    async check(account, key) {
      const answer = answerOf(await runAccounts('usp_WebCodeCheck', (r) => r.input('account', sql.VarChar(32), account).input('key', sql.VarChar(32), key)));
      if ((answer.code === 1 || answer.code === 2) && answer.offer !== null) return { ok: true, offer: answer.offer, vip: answer.vip, replaces: answer.code === 2 };
      return { ok: false, refused: refusalOf(answer.code), offer: answer.offer, vip: answer.vip };
    },
    async redeem(request) {
      const answer = answerOf(await runAccounts('usp_WebCodeRedeem', (r) => r
        .input('account', sql.VarChar(32), request.account)
        .input('key', sql.VarChar(32), request.key)
        .input('requestId', sql.VarChar(64), request.requestId)
        .input('idPlayer', sql.Char(7), request.idPlayer)
        .input('characterName', sql.VarChar(32), request.characterName)
        .input('address', sql.VarChar(45), request.address.slice(0, 45))
        .input('confirm', sql.Bit, request.confirm)));
      if ((answer.code === 1 || answer.code === 3) && answer.offer !== null && answer.useId !== null) {
        return { ok: true, useId: answer.useId, offer: answer.offer, vip: answer.vip, repeat: answer.code === 3 };
      }
      return { ok: false, refused: refusalOf(answer.code), offer: answer.offer, vip: answer.vip };
    },
    async character(account, idPlayer) {
      const row = rowsOf(await runCharacters('usp_WebCodeCharacter', (r) => r.input('account', sql.VarChar(32), account).input('idPlayer', sql.Char(7), idPlayer)))[0];
      return row === undefined ? undefined : text(row.characterName);
    },
    close: async () => { await Promise.all([accounts.close(), characters.close()]); },
  };
}

function codeRow(r: Row, items: Map<number, CodeItem[]>): CodeRow {
  const id = num(r.id);
  return {
    id, label: text(r.label), kind: text(r.kind) as CodeKind, vipLevel: num(r.vipLevel), vipDays: num(r.vipDays), maxUses: numOrNull(r.maxUses),
    uses: num(r.uses), keysTotal: num(r.keysTotal), keysUnused: num(r.keysUnused), firstKey: textOrNull(r.firstKey), expiresAt: text(r.expiresAt),
    on: bool(r.isOn), createdAt: text(r.createdAt), createdBy: text(r.createdBy), items: items.get(id) ?? [],
  };
}

function itemsByCode(rows: Row[]): Map<number, CodeItem[]> {
  const byCode = new Map<number, CodeItem[]>();
  for (const r of rows) {
    const list = byCode.get(num(r.codeId)) ?? [];
    list.push(item(r));
    byCode.set(num(r.codeId), list);
  }
  return byCode;
}

function pendingOf(result: sql.IProcedureResult<Row>): PendingUse[] {
  const items = itemsByCode(rowsOf(result, 1));
  return rowsOf(result, 0).map((r) => ({
    id: num(r.id), codeId: num(r.codeId), label: text(r.label), account: text(r.account), idPlayer: text(r.idPlayer), items: items.get(num(r.codeId)) ?? [],
  }));
}

export function sqlCodeAdminStore(settings: WebConfig['sql'], login: AdminConfig['sql']): CodeAdminStore & { close(): Promise<void> } {
  const accounts = lazyPool({ ...settings, user: login.user, password: login.password }, settings.accountDatabase);
  const run = runner(accounts);
  return {
    async add(code) {
      const stacks = code.items.slice(0, CODE_SLOTS);
      const row = rowsOf(await run('usp_AdminCodeAdd', (r) => {
        r.input('label', sql.VarChar(64), code.label).input('kind', sql.Char(1), code.kind).input('vipLevel', sql.TinyInt, code.vipLevel)
          .input('vipDays', sql.SmallInt, code.vipDays).input('maxUses', sql.Int, code.maxUses).input('expiresAt', sql.DateTime2(0), new Date(code.expiresAt))
          .input('admin', sql.VarChar(32), code.admin)
          .input('keys', sql.Xml, code.keys.map((k) => `<k>${xmlText(k)}</k>`).join(''))
          .input('accounts', sql.Xml, code.kind === 'L' ? code.accounts.map((a) => `<a>${xmlText(a)}</a>`).join('') : null);
        stacks.forEach((s, i) => r.input(`item${i + 1}`, sql.Int, s.itemId).input(`count${i + 1}`, sql.Int, s.count));
        return r;
      }))[0] ?? {};
      const result = num(row.result);
      if (result === 1) return { id: num(row.id) };
      if (result === -1) return { refused: 'key_taken', detail: text(row.detail) };
      if (result === -2) return { refused: 'unknown_account', detail: text(row.detail) };
      return { refused: 'invalid', detail: '' };
    },
    async list() {
      const result = await run('usp_AdminCodeList');
      const items = itemsByCode(rowsOf(result, 1));
      return rowsOf(result, 0).map((r) => codeRow(r, items));
    },
    async get(id) {
      const result = await run('usp_AdminCodeGet', (r) => r.input('id', sql.Int, id));
      const row = rowsOf(result, 0)[0];
      if (row === undefined) return undefined;
      return { ...codeRow(row, itemsByCode(rowsOf(result, 1))), accounts: rowsOf(result, 2).map((r) => text(r.account)) };
    },
    async keys(id) {
      return rowsOf(await run('usp_AdminCodeKeys', (r) => r.input('id', sql.Int, id)))
        .map((r) => ({ key: text(r.keyText), usedBy: textOrNull(r.usedBy), usedAt: textOrNull(r.usedAt) }));
    },
    async save(id, label, expiresAt, on) {
      const row = rowsOf(await run('usp_AdminCodeSave', (r) => r.input('id', sql.Int, id).input('label', sql.VarChar(64), label)
        .input('expiresAt', sql.DateTime2(0), new Date(expiresAt)).input('isOn', sql.Bit, on)))[0];
      return num(row?.changed) === 1;
    },
    async uses(id, max) {
      return rowsOf(await run('usp_AdminCodeUses', (r) => r.input('id', sql.Int, id).input('max', sql.Int, max))).map((r) => ({
        id: num(r.id), account: text(r.account), idPlayer: text(r.idPlayer), characterName: text(r.characterName), usedAt: text(r.usedAt),
        address: text(r.address), vipLevel: num(r.vipLevel), vipDays: num(r.vipDays), vipEndsAt: textOrNull(r.vipEndsAt),
        replacedLevel: numOrNull(r.replacedLevel), replacedEndsAt: textOrNull(r.replacedEndsAt), deliveredAt: textOrNull(r.deliveredAt),
        deliveredName: textOrNull(r.deliveredName),
      }));
    },
    async pending(max, afterId) {
      return pendingOf(await run('usp_AdminCodePending', (r) => r.input('max', sql.Int, max).input('afterId', sql.Int, afterId)));
    },
    async pendingOne(useId) {
      return pendingOf(await run('usp_AdminCodePendingOne', (r) => r.input('useId', sql.Int, useId)))[0];
    },
    async markDelivered(useId, idPlayer, characterName) {
      const row = rowsOf(await run('usp_AdminCodeMarkDelivered', (r) => r.input('useId', sql.Int, useId).input('idPlayer', sql.Char(7), idPlayer)
        .input('characterName', sql.VarChar(32), characterName)))[0];
      return num(row?.changed) === 1;
    },
    close: () => accounts.close(),
  };
}

export function sqlCodeMailStore(settings: WebConfig['sql'], login: AdminConfig['sql']): CodeMailStore & { close(): Promise<void> } {
  const characters = lazyPool({ ...settings, user: login.user, password: login.password }, settings.characterDatabase);
  const run = runner(characters);
  return {
    async sendUse(use, title, mailText) {
      const row = rowsOf(await run('usp_AdminCodeMailSend', (r) => {
        r.input('useId', sql.Int, use.id).input('account', sql.VarChar(32), use.account).input('idPlayer', sql.Char(7), use.idPlayer)
          .input('title', sql.VarChar(128), title.slice(0, 128)).input('text', sql.VarChar(255), mailText.slice(0, 255));
        use.items.slice(0, CODE_SLOTS).forEach((s, i) => r.input(`item${i + 1}`, sql.Int, s.itemId).input(`count${i + 1}`, sql.Int, s.count));
        return r;
      }))[0];
      const code = num(row?.result);
      return { result: code === 1 || code === 2 ? code : 0, idPlayer: textOrNull(row?.idPlayer), characterName: textOrNull(row?.characterName) };
    },
    close: () => characters.close(),
  };
}

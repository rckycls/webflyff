// Support / VIP's SQL Server stores (apps/web/sql/vip.sql): the site's, as `flyffweb_site`, and the panel's, as
// `flyffweb_admin`, each with its own ACCOUNT_DBF pool and only its own procedures. Typed parameters only. Checked by the
// owner's run in the VM, as the other SQL stores are.

import sql from 'mssql';
import type { AdminConfig } from '../admin/config';
import type { WebConfig } from '../config';
import { firstValue, lazyPool } from '../sqlAccountStore';
import type {
  AdminVipRequest, AdminVipRequestDetail, MyVipRequest, PayQr, PayQrRow, VipAdminStore, VipNow, VipRequestStatus,
  VipSiteStore, VipTier, VipTierRow,
} from './vipStore';

type Row = Record<string, unknown>;

const text = (value: unknown): string => String(value ?? '').trim();
const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value).trim());
const num = (value: unknown): number => Number(value ?? 0);
const numOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const bool = (value: unknown): boolean => value === true || value === 1;

function rowsOf(result: sql.IProcedureResult<Row>, index = 0): Row[] {
  return (result.recordsets[index] ?? (index === 0 ? result.recordset : undefined) ?? []) as Row[];
}

const tier = (r: Row): VipTier => ({ level: num(r.level), name: text(r.name), priceCents: num(r.priceCents), pricePhpCents: numOrNull(r.pricePhpCents) });
const qr = (r: Row): PayQr => ({ id: num(r.id), label: text(r.label), accountName: text(r.accountName), note: text(r.note) });

function myRequest(r: Row): MyVipRequest {
  return {
    id: num(r.id), level: num(r.level), name: textOrNull(r.name), currency: text(r.currency) === 'PHP' ? 'PHP' : 'USD',
    priceCents: num(r.priceCents), reference: text(r.reference), status: text(r.status) as VipRequestStatus, reason: textOrNull(r.reason),
    createdAt: text(r.createdAt), decidedAt: textOrNull(r.decidedAt), vipEndsAt: textOrNull(r.vipEndsAt), hasReceipt: bool(r.hasReceipt),
  };
}

function adminRequest(r: Row): AdminVipRequest {
  return {
    ...myRequest(r), account: text(r.account), address: text(r.address), decidedBy: textOrNull(r.decidedBy),
    vipLevel: numOrNull(r.vipLevel), vipNowEndsAt: textOrNull(r.vipNowEndsAt),
  };
}

export function sqlVipSiteStore(settings: WebConfig['sql']): VipSiteStore & { close(): Promise<void> } {
  const accounts = lazyPool(settings, settings.accountDatabase);
  const run = async (name: string, inputs: (r: sql.Request) => sql.Request = (r) => r) => inputs((await accounts.get()).request()).execute(`dbo.${name}`);
  return {
    async login(account, passwordHash) {
      const row = rowsOf(await run('usp_WebPlayerLogin', (r) => r.input('account', sql.VarChar(32), account).input('pw', sql.VarChar(32), passwordHash)))[0];
      const result = num(row?.result);
      if (result === 1) return { result: 'ok', account: text(row?.account) };
      if (result === 2) return { result: 'banned', account: text(row?.account) };
      return { result: 'wrong' };
    },
    async tiers() {
      return rowsOf(await run('usp_WebVipTiers')).map(tier);
    },
    async qrs() {
      return rowsOf(await run('usp_WebPayQrList')).map(qr);
    },
    async qrImage(id) {
      const file = firstValue(await run('usp_WebPayQrImage', (r) => r.input('id', sql.Int, id)));
      return file === undefined || file === null ? undefined : text(file);
    },
    async mine(account) {
      const result = await run('usp_WebVipMine', (r) => r.input('account', sql.VarChar(32), account));
      const live = rowsOf(result, 0)[0];
      const vip: VipNow | null = live === undefined ? null : { level: num(live.level), name: textOrNull(live.name), endsAt: text(live.endsAt) };
      return { vip, requests: rowsOf(result, 1).map(myRequest) };
    },
    async addRequest(request) {
      const id = Number(firstValue(await run('usp_WebVipRequestAdd', (r) => r
        .input('account', sql.VarChar(32), request.account)
        .input('level', sql.TinyInt, request.level)
        .input('currency', sql.Char(3), request.currency)
        .input('reference', sql.VarChar(40), request.reference)
        .input('referenceKey', sql.VarChar(40), request.referenceKey)
        .input('receiptFile', sql.VarChar(40), request.receiptFile)
        .input('address', sql.VarChar(45), request.address)
        .input('maxPending', sql.Int, request.maxPending))));
      if (id > 0) return { id };
      if (id === -1) return { refused: 'tier' };
      if (id === -2) return { refused: 'too_many' };
      if (id === -3) return { refused: 'reference' };
      if (id === -4) return { refused: 'currency' };
      throw new Error(`usp_WebVipRequestAdd gave ${id}`);
    },
    async receipt(id, account) {
      const file = firstValue(await run('usp_WebVipReceipt', (r) => r.input('id', sql.Int, id).input('account', sql.VarChar(32), account)));
      return file === undefined || file === null ? undefined : text(file);
    },
    close: () => accounts.close(),
  };
}

export function sqlVipAdminStore(settings: WebConfig['sql'], login: AdminConfig['sql']): VipAdminStore & { close(): Promise<void> } {
  const accounts = lazyPool({ ...settings, user: login.user, password: login.password }, settings.accountDatabase);
  const run = async (name: string, inputs: (r: sql.Request) => sql.Request = (r) => r) => inputs((await accounts.get()).request()).execute(`dbo.${name}`);
  const changed = (result: sql.IProcedureResult<Row>) => Number(firstValue(result)) > 0;
  return {
    async requests(status) {
      return rowsOf(await run('usp_AdminVipRequests', (r) => r.input('status', sql.Char(1), status))).map(adminRequest);
    },
    async request(id) {
      const row = rowsOf(await run('usp_AdminVipRequestGet', (r) => r.input('id', sql.Int, id)))[0];
      return row === undefined ? undefined : { ...adminRequest(row), receiptFile: textOrNull(row.receiptFile) } satisfies AdminVipRequestDetail;
    },
    async approve(id, admin) {
      const row = rowsOf(await run('usp_AdminVipApprove', (r) => r.input('id', sql.Int, id).input('admin', sql.VarChar(32), admin)))[0];
      const result = num(row?.result);
      if (result === 1) return { result: 'ok', level: num(row?.level), endsAt: text(row?.endsAt) };
      return { result: result === 0 ? 'decided' : 'missing' };
    },
    async reject(id, admin, reason) {
      return changed(await run('usp_AdminVipReject', (r) => r.input('id', sql.Int, id).input('admin', sql.VarChar(32), admin).input('reason', sql.NVarChar(200), reason)));
    },
    async forgetReceipts(days) {
      return rowsOf(await run('usp_AdminVipForgetReceipts', (r) => r.input('days', sql.Int, days))).map((r) => text(r.receiptFile)).filter((f) => f !== '');
    },
    async tiers() {
      return rowsOf(await run('usp_AdminVipTiers')).map((r): VipTierRow => ({ ...tier(r), on: bool(r.isOn) }));
    },
    async saveTier(t) {
      return changed(await run('usp_AdminVipTierSave', (r) => r
        .input('level', sql.TinyInt, t.level).input('name', sql.NVarChar(32), t.name).input('priceCents', sql.Int, t.priceCents)
        .input('pricePhpCents', sql.Int, t.pricePhpCents).input('isOn', sql.Bit, t.on)));
    },
    async qrList() {
      return rowsOf(await run('usp_AdminPayQrList')).map((r): PayQrRow => ({
        ...qr(r), imageFile: text(r.imageFile), on: bool(r.isOn), order: num(r.sortOrder), createdAt: text(r.createdAt),
      }));
    },
    async addQr(q) {
      return Number(firstValue(await run('usp_AdminPayQrAdd', (r) => r
        .input('label', sql.NVarChar(40), q.label).input('accountName', sql.NVarChar(80), q.accountName).input('note', sql.NVarChar(200), q.note)
        .input('imageFile', sql.VarChar(40), q.imageFile).input('isOn', sql.Bit, q.on).input('sortOrder', sql.Int, q.order))));
    },
    async saveQr(q) {
      return changed(await run('usp_AdminPayQrSave', (r) => r
        .input('id', sql.Int, q.id).input('label', sql.NVarChar(40), q.label).input('accountName', sql.NVarChar(80), q.accountName)
        .input('note', sql.NVarChar(200), q.note).input('isOn', sql.Bit, q.on).input('sortOrder', sql.Int, q.order)));
    },
    async deleteQr(id) {
      const file = firstValue(await run('usp_AdminPayQrDelete', (r) => r.input('id', sql.Int, id)));
      return file === undefined || file === null ? undefined : text(file);
    },
    close: () => accounts.close(),
  };
}

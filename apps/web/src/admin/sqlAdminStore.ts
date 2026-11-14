// The admin panel's SQL Server store (admin panel spec §5.4): two pools, ACCOUNT_DBF and CHARACTER_01_DBF, logged in as
// `flyffweb_admin`, which may run the usp_Admin* procedures (apps/web/sql/admin-login.sql) and usp_CreateNewAccount,
// and nothing else. Typed parameters only. Checked by the owner's run in the VM, as sqlAccountStore is.

import sql from 'mssql';
import type { WebConfig } from '../config';
import { firstValue, lazyPool } from '../sqlAccountStore';
import type { AdminConfig } from './config';
import type {
  AccountRow, AdminStore, CharacterDetail, CharacterRow, LogFilter, LogRow, PendingSend,
} from './adminStore';

type Row = Record<string, unknown>;

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ''));
const isoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : iso(value));
const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value).trim());
const num = (value: unknown): number => Number(value ?? 0);
/** char(n) columns come back padded with spaces. */
const trimmed = (value: unknown): string => String(value ?? '').trim();

function rows(result: sql.IProcedureResult<Row>): Row[] {
  return (result.recordsets[0] ?? result.recordset ?? []) as Row[];
}

function logRow(r: Row): LogRow {
  return {
    id: num(r.id), at: iso(r.at), admin: trimmed(r.admin), address: trimmed(r.address), action: trimmed(r.action),
    account: textOrNull(r.account), characterName: textOrNull(r.characterName),
    result: trimmed(r.result) as LogRow['result'], before: String(r.before ?? ''), after: String(r.after ?? ''),
  };
}

function accountRow(r: Row): AccountRow {
  return {
    account: trimmed(r.account), email: textOrNull(r.email), authority: trimmed(r.authority),
    blockTime: textOrNull(r.blockTime), created: iso(r.created),
  };
}

function characterRow(r: Row): CharacterRow {
  return {
    idPlayer: trimmed(r.idPlayer), name: trimmed(r.name), account: trimmed(r.account), level: num(r.level), job: num(r.job),
    slot: num(r.slot), deleted: r.deleted === true || r.deleted === 1, online: r.online === true || r.online === 1,
    worldId: num(r.worldId),
  };
}

function characterDetail(r: Row): CharacterDetail {
  return {
    ...characterRow(r), gold: num(r.gold), x: num(r.x), y: num(r.y), z: num(r.z), created: isoOrNull(r.created),
    playTimeSeconds: num(r.playTimeSeconds), deletedAt: textOrNull(r.deletedAt), inGuild: r.inGuild === true || r.inGuild === 1,
  };
}

function pendingSend(r: Row): PendingSend {
  return {
    no: num(r.no), item: trimmed(r.item), count: num(r.count), upgrade: num(r.upgrade), received: iso(r.received),
    byPanel: r.byPanel === true || r.byPanel === 1,
  };
}

export function sqlAdminStore(settings: WebConfig['sql'], login: AdminConfig['sql']): AdminStore & { close(): Promise<void> } {
  const as = { ...settings, user: login.user, password: login.password };
  const accounts = lazyPool(as, settings.accountDatabase);
  const characters = lazyPool(as, settings.characterDatabase);
  const onAccounts = async () => (await accounts.get()).request();
  const onCharacters = async () => (await characters.get()).request();
  const changed = (result: sql.IProcedureResult<Row>) => Number(firstValue(result)) > 0;
  const word = (result: sql.IProcedureResult<Row>) => String(firstValue(result) ?? '').trim();

  return {
    async logBegin(entry) {
      const result = await (await onAccounts())
        .input('admin', sql.VarChar(32), entry.admin.slice(0, 32))
        .input('address', sql.VarChar(45), entry.address.slice(0, 45))
        .input('action', sql.VarChar(32), entry.action)
        .input('account', sql.VarChar(32), entry.account ?? null)
        .input('characterName', sql.VarChar(32), entry.characterName ?? null)
        .input('before', sql.NVarChar(2000), entry.before)
        .execute('dbo.usp_AdminLogBegin');
      const id = Number(firstValue(result));
      if (!Number.isInteger(id) || id <= 0) throw new Error('usp_AdminLogBegin gave no id');
      return id;
    },
    async logEnd(id, result, after) {
      await (await onAccounts())
        .input('id', sql.Int, id).input('result', sql.VarChar(8), result).input('after', sql.NVarChar(2000), after)
        .execute('dbo.usp_AdminLogEnd');
    },
    async logRead(filter: LogFilter) {
      const result = await (await onAccounts())
        .input('beforeId', sql.Int, filter.beforeId ?? null)
        .input('account', sql.VarChar(32), filter.account ?? null)
        .input('characterName', sql.VarChar(32), filter.characterName ?? null)
        .input('action', sql.VarChar(32), filter.action ?? null)
        .execute('dbo.usp_AdminLogRead');
      return rows(result).map(logRow);
    },
    async recentLogins() {
      return rows(await (await onAccounts()).execute('dbo.usp_AdminRecentLogins')).map(logRow);
    },
    async searchAccounts(q) {
      const result = await (await onAccounts())
        .input('account', sql.VarChar(32), q.account ?? null).input('email', sql.VarChar(100), q.email ?? null)
        .execute('dbo.usp_AdminAccountSearch');
      return rows(result).map(accountRow);
    },
    async getAccount(account) {
      const result = await (await onAccounts()).input('account', sql.VarChar(32), account).execute('dbo.usp_AdminAccountGet');
      const row = rows(result)[0];
      return row === undefined ? undefined : accountRow(row);
    },
    async createAccount(account, passwordHash, email) {
      const result = await (await onAccounts())
        .input('account', sql.VarChar(32), account)
        .input('pw', sql.VarChar(32), passwordHash)
        .input('cash', sql.Int, 0)
        .input('email', sql.VarChar(100), email)
        .execute('dbo.usp_CreateNewAccount');
      const made = Number(firstValue(result));
      return Number.isInteger(made) ? made : -1;
    },
    async setPassword(account, passwordHash) {
      return changed(await (await onAccounts())
        .input('account', sql.VarChar(32), account).input('pw', sql.VarChar(32), passwordHash)
        .execute('dbo.usp_AdminSetPassword'));
    },
    async setEmail(account, email) {
      return changed(await (await onAccounts())
        .input('account', sql.VarChar(32), account).input('email', sql.VarChar(100), email)
        .execute('dbo.usp_AdminSetEmail'));
    },
    async setLoginAuthority(account, authority) {
      return changed(await (await onAccounts())
        .input('account', sql.VarChar(32), account).input('authority', sql.Char(1), authority)
        .execute('dbo.usp_AdminSetLoginAuthority'));
    },
    async setCharacterAuthority(account, authority) {
      const result = await (await onCharacters())
        .input('account', sql.VarChar(32), account).input('authority', sql.Char(1), authority)
        .execute('dbo.usp_AdminSetCharacterAuthority');
      return Math.max(0, Number(firstValue(result)));
    },
    async setBlockTime(account, blockTime) {
      return changed(await (await onAccounts())
        .input('account', sql.VarChar(32), account).input('blockTime', sql.Char(8), blockTime)
        .execute('dbo.usp_AdminSetBlockTime'));
    },
    async searchCharacters(q) {
      const result = await (await onCharacters())
        .input('name', sql.VarChar(32), q.name ?? null).input('account', sql.VarChar(32), q.account ?? null)
        .execute('dbo.usp_AdminCharacterSearch');
      return rows(result).map(characterRow);
    },
    async getCharacter(idPlayer) {
      const result = await (await onCharacters()).input('idPlayer', sql.Char(7), idPlayer).execute('dbo.usp_AdminCharacterGet');
      const row = rows(result)[0];
      return row === undefined ? undefined : characterDetail(row);
    },
    async onlineCharacters() {
      return rows(await (await onCharacters()).execute('dbo.usp_AdminOnlineList')).map(characterRow);
    },
    async renameCharacter(idPlayer, name) {
      return word(await (await onCharacters())
        .input('idPlayer', sql.Char(7), idPlayer).input('name', sql.VarChar(32), name)
        .execute('dbo.usp_AdminCharacterRename')) as 'ok' | 'taken' | 'missing';
    },
    async setGold(idPlayer, gold) {
      return changed(await (await onCharacters())
        .input('idPlayer', sql.Char(7), idPlayer).input('gold', sql.Int, gold)
        .execute('dbo.usp_AdminCharacterSetGold'));
    },
    async moveCharacter(idPlayer, worldId, x, y, z) {
      return changed(await (await onCharacters())
        .input('idPlayer', sql.Char(7), idPlayer).input('worldId', sql.Int, worldId)
        .input('x', sql.Real, x).input('y', sql.Real, y).input('z', sql.Real, z)
        .execute('dbo.usp_AdminCharacterMove'));
    },
    async deleteCharacter(idPlayer) {
      return word(await (await onCharacters()).input('idPlayer', sql.Char(7), idPlayer)
        .execute('dbo.usp_AdminCharacterDelete')) as 'ok' | 'guild' | 'missing';
    },
    async undeleteCharacter(idPlayer) {
      return word(await (await onCharacters()).input('idPlayer', sql.Char(7), idPlayer)
        .execute('dbo.usp_AdminCharacterUndelete')) as 'ok' | 'slot_taken' | 'too_old' | 'missing';
    },
    async sendItem(idPlayer, item, count, upgrade, billingNo) {
      const result = await (await onCharacters())
        .input('idPlayer', sql.Char(7), idPlayer)
        .input('itemName', sql.VarChar(32), item)
        .input('count', sql.Int, count)
        .input('upgrade', sql.Int, upgrade)
        .input('billingNo', sql.Char(21), billingNo)
        .execute('dbo.usp_AdminItemSend');
      const no = Number(firstValue(result));
      if (!Number.isInteger(no) || no <= 0) throw new Error('usp_AdminItemSend made no row');
      return no;
    },
    async pendingSends(idPlayer) {
      const result = await (await onCharacters()).input('idPlayer', sql.Char(7), idPlayer).execute('dbo.usp_AdminItemSendList');
      return rows(result).map(pendingSend);
    },
    async cancelSend(idPlayer, no) {
      return changed(await (await onCharacters())
        .input('idPlayer', sql.Char(7), idPlayer).input('no', sql.Int, no)
        .execute('dbo.usp_AdminItemSendCancel'));
    },
    async sqlAlive() {
      try {
        await (await onAccounts()).execute('dbo.usp_AdminRecentLogins');
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await Promise.all([accounts.close(), characters.close()]);
    },
  };
}

// The SQL Server store (website spec §3.4, §3.6): two pools, ACCOUNT_DBF for `usp_CreateNewAccount` and
// CHARACTER_01_DBF for `usp_WebOnlineCount`, logged in as `flyffweb_site`, which may run those two procedures and nothing
// else (apps/web/sql/web-login.sql). Typed parameters only. Checked by the owner's live run, not by unit tests.

import sql from 'mssql';
import type { AccountStore } from './accountStore';
import type { WebConfig } from './config';

/** A pool that connects on first use and again after a failed connect. */
function lazyPool(settings: WebConfig['sql'], database: string): { get(): Promise<sql.ConnectionPool>; close(): Promise<void> } {
  let pool: Promise<sql.ConnectionPool> | undefined;
  return {
    get() {
      pool ??= new sql.ConnectionPool({
        server: settings.host,
        port: settings.port,
        user: settings.user,
        password: settings.password,
        database,
        connectionTimeout: 5000,
        requestTimeout: 10_000,
        pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
        options: { encrypt: true, trustServerCertificate: settings.trustServerCertificate },
      }).connect().catch((error: unknown) => {
        pool = undefined;
        throw error;
      });
      return pool;
    },
    async close() {
      const open = pool;
      pool = undefined;
      if (open !== undefined) await (await open.catch(() => undefined))?.close();
    },
  };
}

/** The first column of the first row the procedure selected. */
function firstValue(result: sql.IProcedureResult<Record<string, unknown>>): unknown {
  const row = result.recordsets[0]?.[0] ?? result.recordset?.[0];
  return row === undefined ? undefined : Object.values(row)[0];
}

export function sqlAccountStore(settings: WebConfig['sql']): AccountStore & { close(): Promise<void> } {
  const accounts = lazyPool(settings, settings.accountDatabase);
  const characters = lazyPool(settings, settings.characterDatabase);
  return {
    async create(account, passwordHash, email) {
      const result = await (await accounts.get()).request()
        .input('account', sql.VarChar(32), account)
        .input('pw', sql.VarChar(32), passwordHash)
        .input('cash', sql.Int, 0)
        .input('email', sql.VarChar(100), email)
        .execute('dbo.usp_CreateNewAccount');
      const made = Number(firstValue(result));
      return Number.isInteger(made) ? made : -1;
    },
    async onlineCount() {
      const result = await (await characters.get()).request().execute('dbo.usp_WebOnlineCount');
      const count = Number(firstValue(result));
      if (!Number.isInteger(count) || count < 0) throw new Error('usp_WebOnlineCount gave no count');
      return count;
    },
    async close() {
      await Promise.all([accounts.close(), characters.close()]);
    },
  };
}

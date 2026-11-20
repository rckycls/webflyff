// An in-memory AdminStore for the tests and the demo server: it keeps rows in arrays, looks accounts up
// case-insensitively (as SQL Server's collation does), and records each call's name in `calls`.

import type {
  AccountRow, AdminStore, Authority, CharacterDetail, CharacterRow, LogEntry, LogFilter, LogResult, LogRow, Page, PendingSend,
} from '../../src/admin/adminStore';

export interface MemoryAccount extends AccountRow { passwordHash: string }
export type MemoryCharacter = CharacterDetail;

/** SQL Server's order for these names (a case-insensitive collation). */
const byText = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());
export interface MemorySend extends PendingSend { idPlayer: string; billingNo: string | null; delivered: boolean }

export interface MemorySeed { accounts?: MemoryAccount[]; characters?: MemoryCharacter[]; sends?: MemorySend[] }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** `yyyymmdd` of the day `days` from `ms`, in local time (as SQL Server's GETDATE() is). */
export function dayText(ms: number, days = 0): string {
  const d = new Date(ms + days * 86_400_000);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function memoryAccount(account: string, extra: Partial<MemoryAccount> = {}): MemoryAccount {
  return { account, email: null, authority: 'F', blockTime: '20000101', created: '2026-11-01T00:00:00.000Z', passwordHash: 'x', ...extra };
}

export function memoryCharacter(idPlayer: string, name: string, account: string, extra: Partial<MemoryCharacter> = {}): MemoryCharacter {
  return {
    idPlayer, name, account, level: 15, job: 0, slot: 0, deleted: false, online: false, worldId: 1, gold: 1000,
    x: 6971, y: 100, z: 3336, created: '2026-11-01T00:00:00.000Z', playTimeSeconds: 3600, deletedAt: null, inGuild: false,
    authority: 'F', ...extra,
  };
}

export class MemoryAdminStore implements AdminStore {
  readonly accounts: MemoryAccount[];
  readonly characters: MemoryCharacter[];
  readonly sends: MemorySend[];
  readonly log: LogRow[] = [];
  readonly calls: string[] = [];
  /** Methods that throw when called (a database error). */
  readonly failing = new Set<keyof AdminStore>();
  sqlDown = false;
  private nextSend = 1;

  constructor(seed: MemorySeed = {}, private readonly now: () => number = Date.now) {
    this.accounts = seed.accounts ?? [];
    this.characters = seed.characters ?? [];
    this.sends = seed.sends ?? [];
    this.nextSend = this.sends.reduce((max, s) => Math.max(max, s.no), 0) + 1;
  }

  private call(name: keyof AdminStore): void {
    this.calls.push(name);
    if (this.failing.has(name) || (this.sqlDown && name !== 'sqlAlive')) throw new Error(`${name}: database error`);
  }

  private account(name: string): MemoryAccount | undefined {
    return this.accounts.find((a) => same(a.account, name.trim()));
  }

  private character(idPlayer: string): MemoryCharacter | undefined {
    return this.characters.find((c) => c.idPlayer === idPlayer);
  }

  private static row(a: MemoryAccount): AccountRow {
    return { account: a.account, email: a.email, authority: a.authority, blockTime: a.blockTime, created: a.created };
  }

  private static characterRow(c: MemoryCharacter): CharacterRow {
    return {
      idPlayer: c.idPlayer, name: c.name, account: c.account, level: c.level, job: c.job, slot: c.slot, deleted: c.deleted,
      online: c.online, worldId: c.worldId, authority: c.authority,
    };
  }

  async logBegin(entry: LogEntry): Promise<number> {
    this.call('logBegin');
    const id = this.log.length + 1;
    this.log.push({
      id, at: new Date(this.now()).toISOString(), admin: entry.admin, address: entry.address, action: entry.action,
      account: entry.account ?? null, characterName: entry.characterName ?? null, result: 'started', before: entry.before, after: '',
    });
    return id;
  }

  async logEnd(id: number, result: LogResult, after: string): Promise<void> {
    this.call('logEnd');
    const row = this.log.find((r) => r.id === id);
    if (row !== undefined && row.result === 'started') Object.assign(row, { result, after });
  }

  async logRead(filter: LogFilter): Promise<LogRow[]> {
    this.call('logRead');
    return [...this.log].reverse().filter((r) => (filter.beforeId === undefined || r.id < filter.beforeId)
      && (filter.account === undefined || (r.account !== null && same(r.account, filter.account)))
      && (filter.characterName === undefined || (r.characterName !== null && same(r.characterName, filter.characterName)))
      && (filter.action === undefined || r.action === filter.action)).slice(0, 50);
  }

  async recentLogins(): Promise<LogRow[]> {
    this.call('recentLogins');
    return [...this.log].reverse().filter((r) => r.action === 'login' || r.action === 'login_failed').slice(0, 10);
  }

  async searchAccounts(q: { account?: string; email?: string }): Promise<AccountRow[]> {
    this.call('searchAccounts');
    return this.accounts.filter((a) => (q.account === undefined || a.account.toLowerCase().startsWith(q.account.toLowerCase()))
      && (q.email === undefined || (a.email !== null && same(a.email, q.email)))).slice(0, 50).map(MemoryAdminStore.row);
  }

  async accountPage(q: { account?: string; email?: string }, offset: number, count: number): Promise<Page<AccountRow>> {
    this.call('accountPage');
    const all = this.accounts.filter((a) => (q.account === undefined || a.account.toLowerCase().startsWith(q.account.toLowerCase()))
      && (q.email === undefined || (a.email !== null && same(a.email, q.email)))).sort((x, y) => byText(x.account, y.account));
    return { rows: all.slice(offset, offset + count).map(MemoryAdminStore.row), total: all.length };
  }

  async getAccount(account: string): Promise<AccountRow | undefined> {
    this.call('getAccount');
    const a = this.account(account);
    return a === undefined ? undefined : MemoryAdminStore.row(a);
  }

  async createAccount(account: string, passwordHash: string, email: string): Promise<number> {
    this.call('createAccount');
    if (this.account(account) !== undefined) return 0;
    this.accounts.push(memoryAccount(account, { passwordHash, email: email === '' ? null : email, blockTime: dayText(this.now(), -1), created: new Date(this.now()).toISOString() }));
    return 1;
  }

  async setPassword(account: string, passwordHash: string): Promise<boolean> {
    this.call('setPassword');
    const a = this.account(account);
    if (a !== undefined) a.passwordHash = passwordHash;
    return a !== undefined;
  }

  async setEmail(account: string, email: string): Promise<boolean> {
    this.call('setEmail');
    const a = this.account(account);
    if (a !== undefined) a.email = email;
    return a !== undefined;
  }

  async setLoginAuthority(account: string, authority: Authority): Promise<boolean> {
    this.call('setLoginAuthority');
    const a = this.account(account);
    if (a !== undefined) a.authority = authority;
    return a !== undefined;
  }

  async setCharacterAuthority(account: string, authority: Authority): Promise<number> {
    this.call('setCharacterAuthority');
    const mine = this.characters.filter((c) => same(c.account, account));
    for (const c of mine) c.authority = authority;
    return mine.length;
  }

  async setOneCharacterAuthority(idPlayer: string, authority: Authority): Promise<boolean> {
    this.call('setOneCharacterAuthority');
    const c = this.character(idPlayer);
    if (c !== undefined) c.authority = authority;
    return c !== undefined;
  }

  async setBlockTime(account: string, blockTime: string | null): Promise<boolean> {
    this.call('setBlockTime');
    const a = this.account(account);
    if (a !== undefined) a.blockTime = blockTime ?? dayText(this.now(), -1);
    return a !== undefined;
  }

  async searchCharacters(q: { name?: string; account?: string }): Promise<CharacterRow[]> {
    this.call('searchCharacters');
    return this.characters.filter((c) => (q.name === undefined || c.name.toLowerCase().startsWith(q.name.toLowerCase()))
      && (q.account === undefined || same(c.account, q.account))).slice(0, 50).map(MemoryAdminStore.characterRow);
  }

  async characterPage(q: { name?: string; account?: string }, offset: number, count: number): Promise<Page<CharacterRow>> {
    this.call('characterPage');
    const all = this.characters.filter((c) => (q.name === undefined || c.name.toLowerCase().startsWith(q.name.toLowerCase()))
      && (q.account === undefined || same(c.account, q.account)))
      .sort((x, y) => byText(x.name, y.name) || x.idPlayer.localeCompare(y.idPlayer));
    return { rows: all.slice(offset, offset + count).map(MemoryAdminStore.characterRow), total: all.length };
  }

  async getCharacter(idPlayer: string): Promise<CharacterDetail | undefined> {
    this.call('getCharacter');
    const c = this.character(idPlayer);
    return c === undefined ? undefined : { ...c };
  }

  async onlineCharacters(): Promise<CharacterRow[]> {
    this.call('onlineCharacters');
    return this.characters.filter((c) => c.online).map((c) => ({ ...MemoryAdminStore.characterRow(c), counted: c.counted !== false }));
  }

  async renameCharacter(idPlayer: string, name: string): Promise<'ok' | 'taken' | 'missing'> {
    this.call('renameCharacter');
    const c = this.character(idPlayer);
    if (c === undefined) return 'missing';
    if (this.characters.some((o) => o !== c && same(o.name, name))) return 'taken';
    c.name = name;
    return 'ok';
  }

  async setGold(idPlayer: string, gold: number): Promise<boolean> {
    this.call('setGold');
    const c = this.character(idPlayer);
    if (c !== undefined) c.gold = gold;
    return c !== undefined;
  }

  async moveCharacter(idPlayer: string, worldId: number, x: number, y: number, z: number): Promise<boolean> {
    this.call('moveCharacter');
    const c = this.character(idPlayer);
    if (c !== undefined) Object.assign(c, { worldId, x, y, z });
    return c !== undefined;
  }

  async deleteCharacter(idPlayer: string): Promise<'ok' | 'guild' | 'missing'> {
    this.call('deleteCharacter');
    const c = this.character(idPlayer);
    if (c === undefined || c.deleted) return 'missing';
    if (c.inGuild) return 'guild';
    c.deleted = true;
    c.deletedAt = `${dayText(this.now())}0000`;
    return 'ok';
  }

  async undeleteCharacter(idPlayer: string): Promise<'ok' | 'slot_taken' | 'name_taken' | 'too_old' | 'missing'> {
    this.call('undeleteCharacter');
    const c = this.character(idPlayer);
    if (c === undefined || !c.deleted) return 'missing';
    if (c.deletedAt === null || c.deletedAt.slice(0, 8) <= dayText(this.now(), -7)) return 'too_old';
    if (this.characters.some((o) => o !== c && !o.deleted && same(o.account, c.account) && o.slot === c.slot)) return 'slot_taken';
    if (this.characters.some((o) => o !== c && !o.deleted && same(o.name, c.name))) return 'name_taken';
    c.deleted = false;
    c.deletedAt = null;
    return 'ok';
  }

  async sendItem(idPlayer: string, item: string, count: number, upgrade: number, billingNo: string): Promise<number> {
    this.call('sendItem');
    const no = this.nextSend++;
    this.sends.push({
      no, idPlayer, item, count, upgrade, received: new Date(this.now()).toISOString(), byPanel: billingNo.startsWith('ADMIN'),
      billingNo, delivered: false,
    });
    return no;
  }

  async pendingSends(idPlayer: string): Promise<PendingSend[]> {
    this.call('pendingSends');
    return this.sends.filter((s) => s.idPlayer === idPlayer && !s.delivered)
      .map(({ no, item, count, upgrade, received, byPanel }) => ({ no, item, count, upgrade, received, byPanel }));
  }

  async cancelSend(idPlayer: string, no: number): Promise<boolean> {
    this.call('cancelSend');
    const i = this.sends.findIndex((s) => s.idPlayer === idPlayer && s.no === no && !s.delivered && (s.billingNo ?? '').startsWith('ADMIN'));
    if (i < 0) return false;
    this.sends.splice(i, 1);
    return true;
  }

  async sqlAlive(): Promise<boolean> {
    this.call('sqlAlive');
    return !this.sqlDown;
  }
}

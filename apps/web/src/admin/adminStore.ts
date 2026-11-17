// What the admin panel asks of the database (admin panel spec §5.4). sqlAdminStore.ts is the SQL Server one, run as
// the login `flyffweb_admin` through the `usp_Admin*` procedures; the tests and the demo use test/support/memoryAdminStore.

import { AUTHORITY_TITLES, SETTABLE_AUTHORITIES } from '@flyffweb/protocol';

/** The letters the panel gives an account or a character: player, VIP 1-4 (vip-auth), helper, GM 1-3, operator, admin. */
export type Authority = 'F' | 'A' | 'B' | 'C' | 'E' | 'J' | 'L' | 'M' | 'N' | 'O' | 'P';
export const AUTHORITIES: readonly Authority[] = SETTABLE_AUTHORITIES as readonly Authority[];
export const AUTHORITY_NAMES: Readonly<Record<Authority, string>> = Object.freeze(
  Object.fromEntries(AUTHORITIES.map((letter) => [letter, AUTHORITY_TITLES[letter]])) as Record<Authority, string>,
);

/** A page of a list (2026-11-17: Accounts and Characters open on their list, 10 rows a page). */
export interface Page<T> { rows: T[]; total: number }

export type LogResult = 'ok' | 'failed' | 'refused';

export interface LogEntry {
  admin: string;
  address: string;
  action: string;
  account?: string;
  characterName?: string;
  /** JSON, at most 2000 characters: the values before the change. Never a password, hash, code or key. */
  before: string;
}

export interface LogRow {
  id: number;
  /** ISO time (UTC). */
  at: string;
  admin: string;
  address: string;
  action: string;
  account: string | null;
  characterName: string | null;
  result: LogResult | 'started';
  before: string;
  after: string;
}

export interface LogFilter { beforeId?: number; account?: string; characterName?: string; action?: string }

export interface AccountRow {
  /** As stored (the login lower-cases what players type; old accounts can hold capitals). */
  account: string;
  email: string | null;
  /** m_chLoginAuthority. */
  authority: string;
  /** ACCOUNT_TBL_DETAIL.BlockTime, `yyyymmdd`: banned while it is today or later. */
  blockTime: string | null;
  /** ISO time. */
  created: string;
}

export interface CharacterRow {
  /** CHARACTER_TBL.m_idPlayer, 7 digits. */
  idPlayer: string;
  name: string;
  account: string;
  level: number;
  job: number;
  slot: number;
  /** isblock = 'D'. */
  deleted: boolean;
  /** MultiServer > 0 (stale while the World server is stopped). */
  online: boolean;
  worldId: number;
  /** m_chAuthority: the character's own letter (the account's counts instead unless it is 'F' or a VIP letter). */
  authority: string;
}

export interface CharacterDetail extends CharacterRow {
  gold: number;
  x: number;
  y: number;
  z: number;
  created: string | null;
  playTimeSeconds: number;
  /** End_Time of a deleted character, `yyyymmddhhmi`. */
  deletedAt: string | null;
  inGuild: boolean;
}

export interface PendingSend {
  /** ITEM_SEND_TBL.m_nNo. */
  no: number;
  /** Item_Name: an item id as text, or 'penya'. */
  item: string;
  count: number;
  upgrade: number;
  /** ISO time. */
  received: string;
  /** ItemBillingNo starts with 'ADMIN': the panel made it. */
  byPanel: boolean;
}

export interface AdminStore {
  logBegin(entry: LogEntry): Promise<number>;
  logEnd(id: number, result: LogResult, after: string): Promise<void>;
  /** 50 rows, newest first. */
  logRead(filter: LogFilter): Promise<LogRow[]>;
  /** The last 10 'login' and 'login_failed' rows. */
  recentLogins(): Promise<LogRow[]>;
  /** Account name prefix, or an exact email; 50 rows. */
  searchAccounts(q: { account?: string; email?: string }): Promise<AccountRow[]>;
  /** Every account, or those of a name prefix or an exact email, by name: `count` rows from `offset`, and how many in all. */
  accountPage(q: { account?: string; email?: string }, offset: number, count: number): Promise<Page<AccountRow>>;
  /** Case-insensitive; returns the name as stored. */
  getAccount(account: string): Promise<AccountRow | undefined>;
  /** usp_CreateNewAccount: 1 made, 0 taken, -1 error. */
  createAccount(account: string, passwordHash: string, email: string): Promise<number>;
  setPassword(account: string, passwordHash: string): Promise<boolean>;
  setEmail(account: string, email: string): Promise<boolean>;
  setLoginAuthority(account: string, authority: Authority): Promise<boolean>;
  /** Every character of the account; the characters changed. */
  setCharacterAuthority(account: string, authority: Authority): Promise<number>;
  /** One character's own letter. */
  setOneCharacterAuthority(idPlayer: string, authority: Authority): Promise<boolean>;
  /** `yyyymmdd`, or null for yesterday by SQL Server's clock (unban). */
  setBlockTime(account: string, blockTime: string | null): Promise<boolean>;
  /** Name prefix, or an exact account; 50 rows. */
  searchCharacters(q: { name?: string; account?: string }): Promise<CharacterRow[]>;
  /** Every character (deleted ones too), or those of a name prefix or an exact account, by name: a page, and the total. */
  characterPage(q: { name?: string; account?: string }, offset: number, count: number): Promise<Page<CharacterRow>>;
  getCharacter(idPlayer: string): Promise<CharacterDetail | undefined>;
  onlineCharacters(): Promise<CharacterRow[]>;
  renameCharacter(idPlayer: string, name: string): Promise<'ok' | 'taken' | 'missing'>;
  setGold(idPlayer: string, gold: number): Promise<boolean>;
  moveCharacter(idPlayer: string, worldId: number, x: number, y: number, z: number): Promise<boolean>;
  deleteCharacter(idPlayer: string): Promise<'ok' | 'guild' | 'missing'>;
  undeleteCharacter(idPlayer: string): Promise<'ok' | 'slot_taken' | 'name_taken' | 'too_old' | 'missing'>;
  /** A new ITEM_SEND_TBL row (ItemFlag 0); returns its m_nNo. */
  sendItem(idPlayer: string, item: string, count: number, upgrade: number, billingNo: string): Promise<number>;
  /** Rows with ItemFlag 0. */
  pendingSends(idPlayer: string): Promise<PendingSend[]>;
  /** Deletes only an ItemFlag 0 row whose ItemBillingNo starts with 'ADMIN'. */
  cancelSend(idPlayer: string, no: number): Promise<boolean>;
  sqlAlive(): Promise<boolean>;
}

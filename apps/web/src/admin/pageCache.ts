// The Accounts and Characters lists' pages, kept for a short time (2026-11-17): going back to a page, or opening the
// tab again, does not ask SQL Server again. An edit drops only the pages it changed (a `Stale`, which the answer also
// carries so that the page's own copy drops the same ones); Refresh (`fresh: true`) drops a whole list.

import type { HttpAnswer } from '../signUpHandler';
import type { AdminDeps } from './adminServer';
import type { AccountRow, CharacterRow, Page } from './adminStore';

export const PAGE_SIZE = 10;
/** How long a page is kept: long enough for paging back and forth, short enough that a player's new account shows soon. */
export const PAGE_TTL_MS = 30_000;
const MAX_PAGES = 300;

export interface AccountFilter { account?: string; email?: string; characterName?: string }
export interface CharacterFilter { name?: string; account?: string }

/** What an edit changed in the lists: only those pages are dropped. */
export interface Stale {
  accounts?: {
    /** Every account page (a new account changes every list's total). */
    all?: boolean;
    /** The pages that show these accounts. */
    names?: string[];
    /** The pages of an email filter (an email changed, so who matches may have). */
    byEmail?: boolean;
    /** The pages of a character-name filter (a character was renamed). */
    byCharacterName?: boolean;
  };
  characters?: {
    /** Every character page (a rename moves a name in the order). */
    all?: boolean;
    /** The pages that show these characters. */
    ids?: string[];
    /** The pages that show a character of these accounts. */
    accounts?: string[];
  };
}

export interface CachedPage<T> extends Page<T> {
  /** ISO time the rows were read from SQL Server. */
  loadedAt: string;
}

type Kind = 'accounts' | 'characters';
type Filter = AccountFilter | CharacterFilter;
interface Entry { kind: Kind; filter: Filter; at: number; page: CachedPage<AccountRow> | CachedPage<CharacterRow> }

const lower = (text: string) => text.toLowerCase();

/** A filter with only the fields that are set, lower-cased (SQL Server compares without case). */
function normal(filter: Filter): Filter {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filter).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof value === 'string' && value !== '') out[key] = lower(value);
  }
  return out;
}

export class PageCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number, private readonly ttlMs = PAGE_TTL_MS) {}

  private static key(kind: Kind, filter: Filter, page: number): string {
    return JSON.stringify([kind, normal(filter), page]);
  }

  get(kind: 'accounts', filter: AccountFilter, page: number): CachedPage<AccountRow> | undefined;
  get(kind: 'characters', filter: CharacterFilter, page: number): CachedPage<CharacterRow> | undefined;
  get(kind: Kind, filter: Filter, page: number): CachedPage<AccountRow> | CachedPage<CharacterRow> | undefined {
    const key = PageCache.key(kind, filter, page);
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (this.now() - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.page;
  }

  set(kind: 'accounts', filter: AccountFilter, page: number, value: Page<AccountRow>): CachedPage<AccountRow>;
  set(kind: 'characters', filter: CharacterFilter, page: number, value: Page<CharacterRow>): CachedPage<CharacterRow>;
  set(kind: Kind, filter: Filter, page: number, value: Page<AccountRow> | Page<CharacterRow>): CachedPage<AccountRow> | CachedPage<CharacterRow> {
    const at = this.now();
    const cached = { ...value, loadedAt: new Date(at).toISOString() } as CachedPage<AccountRow> | CachedPage<CharacterRow>;
    const key = PageCache.key(kind, filter, page);
    this.entries.delete(key);
    this.entries.set(key, { kind, filter: normal(filter), at, page: cached });
    // the oldest go first
    while (this.entries.size > MAX_PAGES) this.entries.delete(this.entries.keys().next().value!);
    return cached;
  }

  /** Drops every page of one list (Refresh). */
  clear(kind: Kind): void {
    for (const [key, entry] of this.entries) if (entry.kind === kind) this.entries.delete(key);
  }

  /** Drops the pages an edit changed. */
  drop(stale: Stale): void {
    const a = stale.accounts;
    const c = stale.characters;
    const names = new Set((a?.names ?? []).map(lower));
    const ids = new Set(c?.ids ?? []);
    const owners = new Set((c?.accounts ?? []).map(lower));
    for (const [key, entry] of this.entries) {
      let gone = false;
      if (entry.kind === 'accounts' && a !== undefined) {
        const filter = entry.filter as AccountFilter;
        const rows = entry.page.rows as AccountRow[];
        gone = a.all === true || (a.byEmail === true && filter.email !== undefined)
          || (a.byCharacterName === true && filter.characterName !== undefined)
          || rows.some((row) => names.has(lower(row.account)));
      } else if (entry.kind === 'characters' && c !== undefined) {
        const rows = entry.page.rows as CharacterRow[];
        gone = c.all === true || rows.some((row) => ids.has(row.idPlayer) || owners.has(lower(row.account)));
      }
      if (gone) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** After a write: drops what it changed from the panel's cache, and tells the page to drop the same (`stale`). */
export function withStale(deps: AdminDeps, answer: HttpAnswer, stale: Stale): HttpAnswer {
  deps.pages.drop(stale);
  return { ...answer, body: { ...answer.body, stale } };
}

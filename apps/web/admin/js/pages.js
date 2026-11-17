// The list pages this browser has loaded (2026-11-17), so that going back to a page or to the tab shows it at once.
// A page goes when an edit's answer says it is old (`stale`, the same rule as the panel's src/admin/pageCache.ts),
// on Refresh, or after 5 minutes.

import { api, el, fill, table } from './ui.js';

const MAX_AGE_MS = 5 * 60_000;

const lower = (text) => String(text).toLowerCase();

/** A filter with only the fields that are set, lower-cased (the database compares without case). */
function normal(filter) {
  const out = {};
  for (const key of Object.keys(filter).sort()) {
    const value = filter[key];
    if (typeof value === 'string' && value !== '') out[key] = lower(value);
  }
  return out;
}

export class PageBook {
  /** @param {'accounts' | 'characters'} kind */
  constructor(kind) {
    this.kind = kind;
    /** @type {Map<string, { filter: Record<string, string>, at: number, data: any }>} */
    this.pages = new Map();
  }

  key(filter, page) {
    return JSON.stringify([normal(filter), page]);
  }

  get(filter, page) {
    const entry = this.pages.get(this.key(filter, page));
    if (entry === undefined) return undefined;
    if (Date.now() - entry.at > MAX_AGE_MS) {
      this.pages.delete(this.key(filter, page));
      return undefined;
    }
    return entry.data;
  }

  set(filter, page, data) {
    this.pages.set(this.key(filter, page), { filter: normal(filter), at: Date.now(), data });
  }

  clear() {
    this.pages.clear();
  }

  /** Drops the pages an edit changed; true when it dropped any. */
  drop(stale) {
    const part = stale?.[this.kind];
    if (part === undefined) return false;
    const names = new Set((part.names ?? []).map(lower));
    const ids = new Set(part.ids ?? []);
    const owners = new Set((part.accounts ?? []).map(lower));
    let dropped = false;
    for (const [key, entry] of this.pages) {
      const rows = entry.data.rows ?? [];
      const gone = part.all === true
        || (this.kind === 'accounts' && ((part.byEmail === true && entry.filter.email !== undefined)
          || (part.byCharacterName === true && entry.filter.characterName !== undefined)
          || rows.some((row) => names.has(lower(row.account)))))
        || (this.kind === 'characters' && rows.some((row) => ids.has(row.idPlayer) || owners.has(lower(row.account))));
      if (gone) {
        this.pages.delete(key);
        dropped = true;
      }
    }
    return dropped;
  }
}

/** An ISO time as the browser's local time of day. */
function timeOfDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

/**
 * A paged list: "Showing 1-10 of 35 · read at 10:52:01", Refresh, the table and the page buttons. `action` is the
 * panel's page action; `columns` and `cells` make the table; `onRow` opens a row; `onError` shows a problem.
 */
export function pagedList({ kind, action, columns, cells, onRow, onError }) {
  const book = new PageBook(kind);
  let filter = {};
  let current = 1;
  let loaded = false;
  let visible = false;
  let dirty = false;
  const info = el('p', { class: 'small list-info' });
  const refresh = el('button', { type: 'button', class: 'quiet', text: 'Refresh' });
  const body = el('div');
  const pager = el('nav', { class: 'pager', 'aria-label': 'Pages' });
  const node = el('div', { class: 'paged' }, el('div', { class: 'list-head' }, info, refresh), body, pager);

  function pageButton(text, page, label, isCurrent = false) {
    return el('button', {
      type: 'button', class: isCurrent ? '' : 'quiet', text, 'aria-label': label,
      'aria-current': isCurrent ? 'page' : undefined, onclick: () => { show(page).catch(onError); },
    });
  }

  function render(data) {
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    const first = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
    const last = (data.page - 1) * data.pageSize + data.rows.length;
    info.textContent = `${data.total === 0 ? 'None found' : `Showing ${first}-${last} of ${data.total.toLocaleString('en-US')}`}`
      + ` · read at ${timeOfDay(data.loadedAt)}`;
    fill(body, table(columns, data.rows.map(cells), onRow ? (i) => onRow(data.rows[i]) : undefined));
    const buttons = [];
    if (pages > 1) {
      buttons.push(pageButton('«', 1, 'First page'), pageButton('‹', Math.max(1, data.page - 1), 'Previous page'));
      const from = Math.max(1, Math.min(data.page - 2, pages - 4));
      for (let p = from; p <= Math.min(pages, from + 4); p++) buttons.push(pageButton(String(p), p, `Page ${p}`, p === data.page));
      buttons.push(pageButton('›', Math.min(pages, data.page + 1), 'Next page'), pageButton('»', pages, 'Last page'));
    }
    fill(pager, buttons);
  }

  /** Each show() call's number: only the latest one draws (two clicks, or a tab opened while a search runs). */
  let latest = 0;

  /** Shows page `page`: from this browser's pages, else from the panel (which may have kept it too). */
  async function show(page, { fresh = false } = {}) {
    const mine = ++latest;
    const asked = filter;
    if (fresh) book.clear();
    let data = fresh ? undefined : book.get(asked, page);
    if (data === undefined) {
      data = await api(action, { ...asked, page, ...(fresh ? { fresh: true } : {}) });
      book.set(asked, page, data);
    }
    if (mine !== latest) return data;
    // the rows went away (deleted or renamed): the last page there is
    if (data.rows.length === 0 && data.total > 0 && page > 1) return show(Math.ceil(data.total / data.pageSize));
    current = page;
    loaded = true;
    dirty = false;
    render(data);
    return data;
  }

  refresh.addEventListener('click', async () => {
    if (refresh.disabled) return;
    refresh.disabled = true;
    try { await show(current, { fresh: true }); } catch (error) { onError(error); } finally { refresh.disabled = false; }
  });

  return {
    node,
    book,
    /** Sets the filter and shows its first page. */
    async find(next) {
      filter = next;
      return show(1);
    },
    show,
    /** The tab is shown: the first time, the first page; after an edit dropped the page on screen, that page again. */
    async opened() {
      visible = true;
      if (!loaded || dirty || book.get(filter, current) === undefined) await show(loaded ? current : 1);
    },
    closed() {
      visible = false;
    },
    /** An edit's answer said some pages are old: drop them, and show the page on screen again if it was one. */
    stale(stale) {
      if (!book.drop(stale) || !loaded) return;
      if (book.get(filter, current) !== undefined) return;
      if (visible) show(current).catch((error) => { dirty = true; onError(error); });
      else dirty = true;
    },
  };
}

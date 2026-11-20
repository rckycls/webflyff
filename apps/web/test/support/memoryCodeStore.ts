// Redeem codes (2026-11-20) in memory, for the tests and the demo (scripts/adminDemo.ts): the site's, the panel's and
// the mail side on one set of rows, with the rules of apps/web/sql/vip.sql (usp_WebCodeCheck, usp_WebCodeRedeem,
// usp_AdminCodeAdd, usp_AdminCodeMailSend...) in the same order, on the VIP rows of a MemoryVipStore.

import type {
  AddCodeResult, CodeAdminStore, CodeCheck, CodeDetail, CodeItem, CodeKeyRow, CodeKind, CodeMailResult, CodeMailStore, CodeOffer,
  CodeRedeem, CodeRefusal, CodeRow, CodeSiteStore, CodeUseRow, LiveVip, NewCode, PendingUse, RedeemRequest,
} from '../../src/codes/codeStore';
import type { MemoryVipStore } from './memoryVipStore';

const DAY = 86_400_000;
const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

interface CodeRowMem {
  id: number; label: string; kind: CodeKind; vipLevel: number; vipDays: number; maxUses: number | null; uses: number;
  expiresAt: number; on: boolean; createdAt: number; createdBy: string; items: CodeItem[]; accounts: string[]; bound: boolean;
}
interface KeyRowMem { id: number; codeId: number; key: string; usedBy: string | null; usedAt: number | null }
interface UseRowMem {
  id: number; codeId: number; keyId: number; account: string; requestId: string; idPlayer: string; characterName: string;
  usedAt: number; address: string; vipLevel: number; vipDays: number; vipEndsAt: number | null; replacedLevel: number | null;
  replacedEndsAt: number | null; deliveredAt: number | null; deliveredTo: string | null; deliveredName: string | null;
}

export interface MemoryCodeCharacter { account: string; idPlayer: string; name: string; deleted?: boolean; online?: boolean; playTime?: number }

export class MemoryCodeStore implements CodeSiteStore, CodeAdminStore, CodeMailStore {
  readonly codeRows: CodeRowMem[] = [];
  readonly keyRows: KeyRowMem[] = [];
  readonly useRows: UseRowMem[] = [];
  /** The mails written (MAIL_STR 'A1' into server index 51), in order. */
  /** `bound`: written with the binds flag (MAIL_TBL.byFlag 2). */
  readonly mails: Array<{ useId: number; idPlayer: string; itemId: number; count: number; title: string; text: string; bound: boolean }> = [];
  /** WEB_CODE_SENT. */
  readonly sent = new Map<number, { idPlayer: string; characterName: string }>();
  /** Methods made to throw, for the failure tests. */
  readonly failing = new Set<string>();
  private nextCode = 1;
  private nextKey = 1;
  private nextUse = 1;

  constructor(private readonly vip: MemoryVipStore, readonly characters: MemoryCodeCharacter[] = [], private readonly now: () => number = Date.now) {}

  private fail(name: string): void {
    if (this.failing.has(name)) throw new Error(`${name} failed (test)`);
  }

  private offer(code: CodeRowMem): CodeOffer {
    return { codeId: code.id, label: code.label, vipLevel: code.vipLevel, vipDays: code.vipDays, expiresAt: iso(code.expiresAt), items: code.items.map((i) => ({ ...i })), bound: code.bound };
  }

  private live(account: string): LiveVip | null {
    const live = this.vip.liveVipOf(account);
    return live === undefined ? null : { level: live.level, endsAt: iso(live.endsAt) };
  }

  /** The checks of usp_WebCodeCheck / usp_WebCodeRedeem, in their order: a refusal, 'replaces', or 'ok'. */
  private judge(account: string, key: KeyRowMem | undefined, confirm: boolean | undefined): { code?: CodeRowMem; verdict: CodeRefusal | 'replaces' | 'ok' } {
    const code = key === undefined ? undefined : this.codeRows.find((c) => c.id === key.codeId);
    if (key === undefined || code === undefined) return { verdict: 'unknown' };
    const live = this.vip.liveVipOf(account);
    if (!code.on) return { code, verdict: 'inactive' };
    if (code.expiresAt <= this.now()) return { code, verdict: 'expired' };
    if (this.useRows.some((u) => u.codeId === code.id && same(u.account, account))) return { code, verdict: 'mine' };
    if (code.kind === 'L' && !code.accounts.some((a) => same(a, account))) return { code, verdict: 'not_listed' };
    if (code.kind === 'K' && key.usedBy !== null) return { code, verdict: 'key_used' };
    if (code.kind === 'E' && code.maxUses !== null && code.uses >= code.maxUses) return { code, verdict: 'claimed' };
    if (code.vipLevel > 0 && live !== undefined && live.level > code.vipLevel) return { code, verdict: 'lower_vip' };
    if (code.vipLevel > 0 && live !== undefined && live.level < code.vipLevel) {
      if (confirm === false) return { code, verdict: 'confirm' };
      return { code, verdict: 'replaces' };
    }
    return { code, verdict: 'ok' };
  }

  // --- the site ------------------------------------------------------------------------------------------------------

  async check(account: string, key: string): Promise<CodeCheck> {
    this.fail('check');
    const { code, verdict } = this.judge(account, this.keyRows.find((k) => k.key === key), undefined);
    const vip = this.live(account);
    if (verdict === 'ok' || verdict === 'replaces') return { ok: true, offer: this.offer(code!), vip, replaces: verdict === 'replaces' };
    return { ok: false, refused: verdict, offer: code === undefined ? null : this.offer(code), vip };
  }

  async redeem(request: RedeemRequest): Promise<CodeRedeem> {
    this.fail('redeem');
    const before = this.useRows.find((u) => same(u.account, request.account) && u.requestId === request.requestId);
    if (before !== undefined) return this.useAnswer(before, true);
    const key = this.keyRows.find((k) => k.key === request.key);
    const { code, verdict } = this.judge(request.account, key, request.confirm);
    if (verdict !== 'ok' && verdict !== 'replaces') {
      return { ok: false, refused: verdict, offer: code === undefined ? null : this.offer(code), vip: this.live(request.account) };
    }
    const now = this.now();
    const live = this.vip.liveVipOf(request.account);
    let vipEndsAt: number | null = null;
    let replaced: { level: number; endsAt: number } | null = null;
    if (code!.vipLevel > 0) {
      const start = live !== undefined && live.level === code!.vipLevel ? live.endsAt : now;
      vipEndsAt = start + code!.vipDays * DAY;
      if (live !== undefined && live.level < code!.vipLevel) replaced = { ...live };
      this.vip.setVip(this.vip.accountOf(request.account) ?? request.account, code!.vipLevel, vipEndsAt);
    }
    const use: UseRowMem = {
      id: this.nextUse++, codeId: code!.id, keyId: key!.id, account: this.vip.accountOf(request.account) ?? request.account,
      requestId: request.requestId, idPlayer: request.idPlayer, characterName: request.characterName, usedAt: now, address: request.address,
      vipLevel: code!.vipLevel, vipDays: code!.vipDays, vipEndsAt, replacedLevel: replaced?.level ?? null, replacedEndsAt: replaced?.endsAt ?? null,
      deliveredAt: code!.items.length === 0 ? now : null, deliveredTo: null, deliveredName: null,
    };
    this.useRows.push(use);
    code!.uses++;
    if (code!.kind === 'K') {
      key!.usedBy = use.account;
      key!.usedAt = now;
    }
    return this.useAnswer(use, false);
  }

  private useAnswer(use: UseRowMem, repeat: boolean): CodeRedeem {
    const code = this.codeRows.find((c) => c.id === use.codeId)!;
    return { ok: true, useId: use.id, offer: this.offer(code), vip: this.live(use.account), repeat };
  }

  async character(account: string, idPlayer: string): Promise<string | undefined> {
    this.fail('character');
    return this.characters.find((c) => c.idPlayer === idPlayer && same(c.account, account) && c.deleted !== true)?.name;
  }

  // --- the panel -----------------------------------------------------------------------------------------------------

  async add(code: NewCode): Promise<AddCodeResult> {
    this.fail('add');
    const now = this.now();
    const expires = Date.parse(code.expiresAt);
    const vipOk = (code.vipLevel === 0 && code.vipDays === 0) || (code.vipLevel >= 1 && code.vipLevel <= 4 && code.vipDays >= 1 && code.vipDays <= 366);
    const keys = [...new Set(code.keys)];
    if (code.label.trim() === '' || !vipOk || (code.vipLevel === 0 && code.items.length === 0) || code.items.length > 6
      || !(expires > now) || expires > now + 366 * DAY || keys.length === 0 || keys.length > 500 || (code.kind !== 'K' && keys.length !== 1)
      || (code.kind === 'L' && (code.accounts.length === 0 || code.accounts.length > 500)) || (code.kind !== 'L' && code.accounts.length > 0)
      || (code.maxUses !== null && (code.kind !== 'E' || code.maxUses < 1))) {
      return { refused: 'invalid', detail: '' };
    }
    const taken = keys.filter((k) => this.keyRows.some((r) => r.key === k)).sort()[0];
    if (taken !== undefined) return { refused: 'key_taken', detail: taken };
    const unknown = code.accounts.filter((a) => this.vip.accountOf(a) === undefined).sort()[0];
    if (unknown !== undefined) return { refused: 'unknown_account', detail: unknown };
    const id = this.nextCode++;
    this.codeRows.push({
      id, label: code.label, kind: code.kind, vipLevel: code.vipLevel, vipDays: code.vipDays, maxUses: code.maxUses, uses: 0,
      expiresAt: expires, on: true, createdAt: now, createdBy: code.admin, items: code.items.map((i) => ({ ...i })), bound: code.bound === true,
      accounts: [...new Set(code.accounts.map((a) => this.vip.accountOf(a)!))],
    });
    for (const key of keys) this.keyRows.push({ id: this.nextKey++, codeId: id, key, usedBy: null, usedAt: null });
    return { id };
  }

  private row(code: CodeRowMem): CodeRow {
    const keys = this.keyRows.filter((k) => k.codeId === code.id);
    return {
      id: code.id, label: code.label, kind: code.kind, vipLevel: code.vipLevel, vipDays: code.vipDays, maxUses: code.maxUses, uses: code.uses,
      keysTotal: keys.length, keysUnused: keys.filter((k) => k.usedBy === null).length, firstKey: code.kind === 'K' ? null : keys[0]?.key ?? null,
      expiresAt: iso(code.expiresAt), on: code.on, createdAt: iso(code.createdAt), createdBy: code.createdBy, items: code.items.map((i) => ({ ...i })),
      bound: code.bound,
    };
  }

  async list(): Promise<CodeRow[]> {
    this.fail('list');
    return [...this.codeRows].sort((a, b) => b.id - a.id).map((c) => this.row(c));
  }

  async get(id: number): Promise<CodeDetail | undefined> {
    const code = this.codeRows.find((c) => c.id === id);
    return code === undefined ? undefined : { ...this.row(code), accounts: [...code.accounts].sort() };
  }

  async keys(id: number): Promise<CodeKeyRow[]> {
    return this.keyRows.filter((k) => k.codeId === id).map((k) => ({ key: k.key, usedBy: k.usedBy, usedAt: isoOrNull(k.usedAt) }));
  }

  async save(id: number, label: string, expiresAt: string, on: boolean): Promise<boolean> {
    const code = this.codeRows.find((c) => c.id === id);
    const expires = Date.parse(expiresAt);
    if (code === undefined || label.trim() === '' || !Number.isFinite(expires) || expires > this.now() + 366 * DAY) return false;
    code.label = label;
    code.expiresAt = expires;
    code.on = on;
    return true;
  }

  async uses(id: number, max: number): Promise<CodeUseRow[]> {
    return this.useRows.filter((u) => u.codeId === id).sort((a, b) => b.id - a.id).slice(0, max).map((u) => ({
      id: u.id, account: u.account, idPlayer: u.idPlayer, characterName: u.characterName, usedAt: iso(u.usedAt), address: u.address,
      vipLevel: u.vipLevel, vipDays: u.vipDays, vipEndsAt: isoOrNull(u.vipEndsAt), replacedLevel: u.replacedLevel,
      replacedEndsAt: isoOrNull(u.replacedEndsAt), deliveredAt: isoOrNull(u.deliveredAt), deliveredName: u.deliveredName,
    }));
  }

  private pendingRow(u: UseRowMem): PendingUse {
    const code = this.codeRows.find((c) => c.id === u.codeId)!;
    return { id: u.id, codeId: u.codeId, label: code.label, account: u.account, idPlayer: u.idPlayer, items: code.items.map((i) => ({ ...i })), bound: code.bound };
  }

  async pending(max: number, afterId: number): Promise<PendingUse[]> {
    this.fail('pending');
    return this.useRows.filter((u) => u.deliveredAt === null && u.id > afterId).sort((a, b) => a.id - b.id).slice(0, max).map((u) => this.pendingRow(u));
  }

  async pendingOne(useId: number): Promise<PendingUse | undefined> {
    this.fail('pendingOne');
    const use = this.useRows.find((u) => u.id === useId && u.deliveredAt === null);
    return use === undefined ? undefined : this.pendingRow(use);
  }

  async markDelivered(useId: number, idPlayer: string, characterName: string | null): Promise<boolean> {
    this.fail('markDelivered');
    const use = this.useRows.find((u) => u.id === useId && u.deliveredAt === null);
    if (use === undefined) return false;
    use.deliveredAt = this.now();
    use.deliveredTo = idPlayer;
    use.deliveredName = characterName;
    return true;
  }

  // --- the mail (CHARACTER_01_DBF) -------------------------------------------------------------------------------------

  async sendUse(use: PendingUse, title: string, text: string): Promise<CodeMailResult> {
    this.fail('sendUse');
    const before = this.sent.get(use.id);
    if (before !== undefined) return { result: 2, idPlayer: before.idPlayer, characterName: before.characterName };
    const mine = this.characters.filter((c) => same(c.account, use.account) && c.deleted !== true);
    const to = mine.find((c) => c.idPlayer === use.idPlayer)
      ?? [...mine].sort((a, b) => Number(b.online ?? false) - Number(a.online ?? false) || (b.playTime ?? 0) - (a.playTime ?? 0) || a.idPlayer.localeCompare(b.idPlayer))[0];
    if (to === undefined) return { result: 0, idPlayer: null, characterName: null };
    for (const item of use.items.slice(0, 6)) {
      if (item.itemId > 0 && item.count > 0) this.mails.push({ useId: use.id, idPlayer: to.idPlayer, itemId: item.itemId, count: item.count, title, text, bound: use.bound });
    }
    this.sent.set(use.id, { idPlayer: to.idPlayer, characterName: to.name });
    return { result: 1, idPlayer: to.idPlayer, characterName: to.name };
  }
}

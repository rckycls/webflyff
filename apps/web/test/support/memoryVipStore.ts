// Support / VIP's stores in memory, for the tests and the demo (scripts/adminDemo.ts): both sides on one set of rows,
// with the rules of apps/web/sql/vip.sql (the tiers seeded at $2/$4/$6/$10 and P115/P230/P345/P575, the pending limit,
// used references, the approve rule, VIP ending by itself at its end time, old rejected receipts forgotten). 2026-11-19
// (VIP perks): the account letters (only a player's or a VIP's change), Give VIP, adoption, the gift boxes and their
// contents, and MemoryVipCharacters for the CHARACTER_01_DBF side (the characters' letters and the gift mails).

import type {
  AddVipRequestResult, AdminVipRequest, AdminVipRequestDetail, ApproveResult, EndVipResult, GiftSendResult, GiveResult, MyVipRequest,
  NewVipRequest, PayQr, PayQrRow, PlayerLoginResult, VipAdminStore, VipCharacterStore, VipGift, VipGiftItem, VipGiftLogRow,
  VipGiftStatus, VipLetter, VipLetterChange, VipNow, VipRequestStatus, VipSiteStore, VipTier, VipTierRow,
} from '../../src/vip/vipStore';

/** VIP1-4's letters, and whether a letter is a player's or a VIP's (the only ones the website changes), as bytes. */
const VIP_LETTERS = ['A', 'B', 'C', 'E'];
const vipLetter = (level: number): string => VIP_LETTERS[level - 1] ?? 'F';
const playerOrVip = (letter: string): boolean => letter === 'F' || VIP_LETTERS.includes(letter);

interface GiftRow extends VipGiftLogRow { createdMs: number; sentMs: number | null }

/** The starting boxes (vip.sql): HP, MP and FP potions, Town Blinkwings and Scrolls of Resurrection. */
const STARTING_ITEMS: VipGiftItem[] = [[10, 10, 10, 5, 1], [20, 20, 20, 10, 2], [30, 30, 30, 15, 3], [50, 50, 50, 20, 5]]
  .flatMap((counts, i) => [10206, 10207, 10208, 4805, 10431].map((itemId, s) => ({ level: i + 1, slot: s + 1, itemId, count: counts[s]! })));

interface RequestRow extends Omit<NewVipRequest, 'receiptFile'> {
  id: number;
  receiptFile: string | null;
  priceCents: number;
  status: VipRequestStatus;
  reason: string | null;
  createdAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  vipEndsAt: number | null;
}

export interface MemoryPlayer { account: string; passwordHash: string; banned?: boolean }

const iso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));

/** One calendar month after `ms` (UTC), as SQL Server's DATEADD(month, 1, ...): the 31st becomes the month's last day. */
export function monthAfter(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

export class MemoryVipStore implements VipSiteStore, VipAdminStore {
  readonly tierRows: VipTierRow[] = [
    { level: 1, name: 'VIP 1', priceCents: 200, pricePhpCents: 11500, on: true },
    { level: 2, name: 'VIP 2', priceCents: 400, pricePhpCents: 23000, on: true },
    { level: 3, name: 'VIP 3', priceCents: 600, pricePhpCents: 34500, on: true },
    { level: 4, name: 'VIP 4', priceCents: 1000, pricePhpCents: 57500, on: true },
  ];
  readonly qrRows: PayQrRow[] = [];
  readonly requestRows: RequestRow[] = [];
  readonly vips = new Map<string, { level: number; endsAt: number }>();
  /** 2026-11-19: the account letters (lower-case account); a player not listed holds 'F'. */
  readonly accountLetters = new Map<string, string>();
  readonly giftRows: GiftRow[] = [];
  giftItemRows: VipGiftItem[] = STARTING_ITEMS.map((i) => ({ ...i }));
  /** WEB_ADMIN_LOG rows the SQL writes itself (adopt, the letter sync), as vip-job. */
  readonly auditRows: Array<{ action: string; account: string; before: string; after: string }> = [];
  /** Methods made to throw, for the job's failure tests. */
  readonly failing = new Set<string>();
  private nextQr = 1;
  private nextRequest = 1;
  private nextGift = 1;

  constructor(private readonly players: MemoryPlayer[] = [], private readonly now: () => number = Date.now) {}

  private find(account: string): MemoryPlayer | undefined {
    return this.players.find((p) => p.account.toLowerCase() === account.toLowerCase());
  }

  // 2026-11-20 (redeem codes): what the code store (memoryCodeStore.ts) needs of the VIP rows
  /** The account as stored, or `undefined` when there is no such account. */
  accountOf(account: string): string | undefined {
    return this.find(account)?.account;
  }

  liveVipOf(account: string): { level: number; endsAt: number } | undefined {
    return this.liveVip(account);
  }

  /** Sets an account's VIP row and its letter (as Give VIP does). */
  setVip(account: string, level: number, endsAt: number): void {
    this.vips.set(account.toLowerCase(), { level, endsAt });
    this.giveLetter(account, level);
  }

  private liveVip(account: string): { level: number; endsAt: number } | undefined {
    const vip = this.vips.get(account.toLowerCase());
    return vip !== undefined && vip.endsAt > this.now() ? vip : undefined;
  }

  private tierName(level: number): string | null {
    return this.tierRows.find((t) => t.level === level)?.name ?? null;
  }

  private mineRow(r: RequestRow): MyVipRequest {
    return {
      id: r.id, level: r.level, name: this.tierName(r.level), currency: r.currency, priceCents: r.priceCents, reference: r.reference,
      status: r.status, reason: r.reason, createdAt: iso(r.createdAt), decidedAt: isoOrNull(r.decidedAt), vipEndsAt: isoOrNull(r.vipEndsAt),
      hasReceipt: r.receiptFile !== null,
    };
  }

  private adminRow(r: RequestRow): AdminVipRequestDetail {
    const live = this.liveVip(r.account);
    return {
      ...this.mineRow(r), account: r.account, address: r.address, decidedBy: r.decidedBy, receiptFile: r.receiptFile,
      vipLevel: live?.level ?? null, vipNowEndsAt: live === undefined ? null : iso(live.endsAt),
    };
  }

  // --- the site's side ----------------------------------------------------------------------------------------------

  async login(account: string, passwordHash: string): Promise<PlayerLoginResult> {
    const player = this.find(account);
    if (player === undefined || player.passwordHash !== passwordHash) return { result: 'wrong' };
    return { result: player.banned === true ? 'banned' : 'ok', account: player.account };
  }

  async tiers(): Promise<VipTierRow[]> {
    return this.tierRows.map((t) => ({ ...t }));
  }

  /** The site's tiers: only those that are on, without the flag. */
  async siteTiers(): Promise<VipTier[]> {
    return this.tierRows.filter((t) => t.on).map(({ level, name, priceCents, pricePhpCents }) => ({ level, name, priceCents, pricePhpCents }));
  }

  async qrs(): Promise<PayQr[]> {
    return this.qrRows.filter((q) => q.on).sort((a, b) => a.order - b.order || a.id - b.id)
      .map(({ id, label, accountName, note }) => ({ id, label, accountName, note }));
  }

  async qrImage(id: number): Promise<string | undefined> {
    return this.qrRows.find((q) => q.id === id && q.on)?.imageFile;
  }

  async mine(account: string): Promise<{ vip: VipNow | null; requests: MyVipRequest[]; gift: VipGiftStatus | null }> {
    const live = this.liveVip(account);
    const latest = this.giftRows.filter((g) => g.account.toLowerCase() === account.toLowerCase()).at(-1);
    return {
      vip: live === undefined ? null : { level: live.level, name: this.tierName(live.level), endsAt: iso(live.endsAt) },
      requests: this.requestRows.filter((r) => r.account.toLowerCase() === account.toLowerCase()).sort((a, b) => b.id - a.id).slice(0, 20).map((r) => this.mineRow(r)),
      gift: latest === undefined ? null : {
        level: latest.level, createdAt: latest.createdAt, sentAt: latest.sentAt, characterName: latest.characterName, cancelled: latest.items === 'cancelled',
      },
    };
  }

  async addRequest(request: NewVipRequest): Promise<AddVipRequestResult> {
    const tier = this.tierRows.find((t) => t.level === request.level && t.on);
    if (tier === undefined) return { refused: 'tier' };
    const price = request.currency === 'PHP' ? tier.pricePhpCents : tier.priceCents;
    if (price === null) return { refused: 'currency' };
    if (this.requestRows.filter((r) => r.account === request.account && r.status === 'P').length >= request.maxPending) return { refused: 'too_many' };
    if (this.requestRows.some((r) => r.referenceKey === request.referenceKey && r.status !== 'R')) return { refused: 'reference' };
    const row: RequestRow = {
      ...request, id: this.nextRequest++, priceCents: price, status: 'P', reason: null, createdAt: this.now(), decidedAt: null,
      decidedBy: null, vipEndsAt: null,
    };
    this.requestRows.push(row);
    return { id: row.id };
  }

  async receipt(id: number, account: string): Promise<string | undefined> {
    return this.requestRows.find((r) => r.id === id && r.account === account)?.receiptFile ?? undefined;
  }

  // --- the panel's side ---------------------------------------------------------------------------------------------

  async requests(status: VipRequestStatus): Promise<AdminVipRequest[]> {
    const rows = this.requestRows.filter((r) => r.status === status).sort((a, b) => (status === 'P' ? a.id - b.id : b.id - a.id));
    return rows.slice(0, 100).map((r) => {
      const { receiptFile: _file, ...row } = this.adminRow(r);
      return row;
    });
  }

  async request(id: number): Promise<AdminVipRequestDetail | undefined> {
    const row = this.requestRows.find((r) => r.id === id);
    return row === undefined ? undefined : this.adminRow(row);
  }

  async approve(id: number, admin: string): Promise<ApproveResult> {
    const row = this.requestRows.find((r) => r.id === id);
    if (row === undefined) return { result: 'missing' };
    if (row.status !== 'P') return { result: 'decided' };
    const now = this.now();
    const current = this.vips.get(row.account.toLowerCase());
    const start = current !== undefined && current.level === row.level && current.endsAt > now ? current.endsAt : now;
    const endsAt = monthAfter(start);
    this.vips.set(row.account.toLowerCase(), { level: row.level, endsAt });
    Object.assign(row, { status: 'A', decidedAt: now, decidedBy: admin, vipEndsAt: endsAt });
    // 2026-11-19 (VIP perks): the letter and the month's gift box
    this.giveLetter(row.account, row.level);
    this.queueGift(row.account, row.level, row.id, admin);
    return { result: 'ok', level: row.level, endsAt: iso(endsAt) };
  }

  async reject(id: number, admin: string, reason: string): Promise<boolean> {
    const row = this.requestRows.find((r) => r.id === id && r.status === 'P');
    if (row === undefined) return false;
    Object.assign(row, { status: 'R', reason, decidedAt: this.now(), decidedBy: admin });
    return true;
  }

  async forgetReceipts(days: number): Promise<string[]> {
    const before = this.now() - days * 86_400_000;
    const old = this.requestRows.filter((r) => r.status === 'R' && r.receiptFile !== null && r.decidedAt !== null && r.decidedAt < before);
    return old.map((r) => {
      const file = r.receiptFile!;
      r.receiptFile = null;
      return file;
    });
  }

  async saveTier(tier: VipTierRow): Promise<boolean> {
    const row = this.tierRows.find((t) => t.level === tier.level);
    if (row === undefined) return false;
    Object.assign(row, tier);
    return true;
  }

  async qrList(): Promise<PayQrRow[]> {
    return [...this.qrRows].sort((a, b) => a.order - b.order || a.id - b.id).map((q) => ({ ...q }));
  }

  async addQr(qr: { label: string; accountName: string; note: string; imageFile: string; on: boolean; order: number }): Promise<number> {
    const id = this.nextQr++;
    this.qrRows.push({ ...qr, id, createdAt: iso(this.now()) });
    return id;
  }

  async saveQr(qr: { id: number; label: string; accountName: string; note: string; on: boolean; order: number }): Promise<boolean> {
    const row = this.qrRows.find((q) => q.id === qr.id);
    if (row === undefined) return false;
    Object.assign(row, qr);
    return true;
  }

  async deleteQr(id: number): Promise<string | undefined> {
    const at = this.qrRows.findIndex((q) => q.id === id);
    if (at < 0) return undefined;
    return this.qrRows.splice(at, 1)[0]!.imageFile;
  }

  // --- 2026-11-19 (VIP perks) ---------------------------------------------------------------------------------------

  private fail(name: string): void {
    if (this.failing.has(name)) throw new Error(`${name} failed (test)`);
  }

  /** An account's letter: its own, else 'F' (a player). */
  letterOf(account: string): string {
    return this.accountLetters.get(account.toLowerCase()) ?? 'F';
  }

  private giveLetter(account: string, level: number): void {
    if (level >= 1 && level <= 4 && playerOrVip(this.letterOf(account))) this.accountLetters.set(account.toLowerCase(), vipLetter(level));
  }

  private queueGift(account: string, level: number, requestId: number | null, admin: string): void {
    const now = this.now();
    this.giftRows.push({
      id: this.nextGift++, account, level, requestId, createdAt: iso(now), createdMs: now, createdBy: admin,
      sentAt: null, sentMs: null, idPlayer: null, characterName: null, items: null,
    });
  }

  async give(account: string, level: number, days: number, gift: boolean, admin: string): Promise<GiveResult> {
    if (!Number.isInteger(level) || level < 1 || level > 4 || !Number.isInteger(days) || days < 1 || days > 366) return { result: 'invalid' };
    const player = this.find(account);
    if (player === undefined) return { result: 'unknown' };
    const now = this.now();
    const current = this.vips.get(player.account.toLowerCase());
    const start = current !== undefined && current.level === level && current.endsAt > now ? current.endsAt : now;
    const endsAt = start + days * 86_400_000;
    this.vips.set(player.account.toLowerCase(), { level, endsAt });
    this.giveLetter(player.account, level);
    if (gift) this.queueGift(player.account, level, null, admin);
    return { result: 'ok', level, endsAt: iso(endsAt) };
  }

  async letterAccounts(): Promise<VipLetter[]> {
    this.fail('letterAccounts');
    // the account as stored (its own spelling), as the SQL gives it
    return [...this.accountLetters].filter(([, letter]) => VIP_LETTERS.includes(letter))
      .map(([key, letter]) => ({ account: this.find(key)?.account ?? key, letter }));
  }

  /** WEB_VIP_ADOPTED: the accounts the adoption step has seen (lower-case). */
  readonly adopted = new Set<string>();

  async adopt(account: string, level: number): Promise<boolean> {
    this.fail('adopt');
    if (level < 1 || level > 4) return false;
    const key = account.toLowerCase();
    const seen = this.adopted.has(key);
    this.adopted.add(key);
    if (seen || this.vips.has(key)) return false;
    this.vips.set(key, { level, endsAt: this.now() + 30 * 86_400_000 });
    this.auditRows.push({ action: 'vip.adopt', account, before: '{"letter":"set by hand"}', after: `{"level":${level},"days":30}` });
    return true;
  }

  async endVip(account: string, admin: string): Promise<EndVipResult> {
    const player = this.find(account);
    if (player === undefined) return { result: 'unknown', cancelled: 0 };
    const key = player.account.toLowerCase();
    const live = this.liveVip(key);
    if (live === undefined) return { result: 'none', cancelled: 0 };
    const now = this.now();
    this.vips.set(key, { level: live.level, endsAt: now });
    if (playerOrVip(this.letterOf(key))) this.accountLetters.set(key, 'F');
    const unsent = this.giftRows.filter((g) => g.account.toLowerCase() === key && g.sentAt === null);
    for (const g of unsent) Object.assign(g, { sentAt: iso(now), sentMs: now, items: 'cancelled' });
    this.auditRows.push({ action: 'vip.end', account: player.account, before: `{"level":${live.level}}`, after: `{"by":"${admin}"}` });
    return { result: 'ok', cancelled: unsent.length };
  }

  async syncLetters(): Promise<VipLetterChange[]> {
    this.fail('syncLetters');
    const accounts = new Set([...this.accountLetters.keys(), ...[...this.vips.keys()]]);
    const changes: VipLetterChange[] = [];
    for (const account of accounts) {
      const before = this.letterOf(account);
      if (!playerOrVip(before)) continue;
      const after = vipLetter(this.liveVip(account)?.level ?? 0);
      if (before === after) continue;
      this.accountLetters.set(account, after);
      changes.push({ account, before, after });
      this.auditRows.push({ action: 'vip.letter', account, before: `{"letter":"${before}"}`, after: `{"letter":"${after}"}` });
    }
    return changes;
  }

  async pendingGifts(max: number, afterId = 0): Promise<VipGift[]> {
    this.fail('pendingGifts');
    return this.giftRows.filter((g) => g.sentAt === null && g.id > afterId).slice(0, max)
      .map(({ id, account, level, requestId, createdAt }) => ({ id, account, level, requestId, createdAt }));
  }

  async markGiftSent(id: number, idPlayer: string, characterName: string | null, items: string): Promise<boolean> {
    this.fail('markGiftSent');
    const row = this.giftRows.find((g) => g.id === id && g.sentAt === null);
    if (row === undefined) return false;
    const now = this.now();
    Object.assign(row, { sentAt: iso(now), sentMs: now, idPlayer, characterName, items });
    return true;
  }

  async giftItems(): Promise<VipGiftItem[]> {
    this.fail('giftItems');
    return [...this.giftItemRows].sort((a, b) => a.level - b.level || a.slot - b.slot).map((i) => ({ ...i }));
  }

  async saveGiftItem(item: VipGiftItem): Promise<boolean> {
    const { level, slot, itemId, count } = item;
    if (level < 1 || level > 4 || slot < 1 || slot > 6 || count < 0 || count > 9999 || (count > 0 && itemId < 1)) return false;
    this.giftItemRows = this.giftItemRows.filter((i) => !(i.level === level && i.slot === slot));
    if (count > 0) this.giftItemRows.push({ level, slot, itemId, count });
    return true;
  }

  async giftLog(max: number): Promise<VipGiftLogRow[]> {
    return [...this.giftRows].reverse().slice(0, max).map(({ createdMs: _c, sentMs: _s, ...row }) => ({ ...row }));
  }

  async close(): Promise<void> {}
}

/** A server 01 character, for MemoryVipCharacters. */
export interface MemoryCharacter {
  idPlayer: string; account: string; name: string; letter: string; online: boolean; playTime: number; deleted: boolean;
}

/** The CHARACTER_01_DBF side in memory (vip.sql's usp_AdminVipCharacterLetters, ...ClearCharacterLetters, ...GiftSend). */
export class MemoryVipCharacters implements VipCharacterStore {
  /** The mails written (MAIL_STR 'A1' into server index 51), in order. */
  readonly mails: Array<{ idPlayer: string; title: string; text: string; itemId: number; count: number }> = [];
  /** WEB_VIP_GIFT_SENT. */
  readonly sent = new Map<number, { idPlayer: string; characterName: string }>();
  readonly failing = new Set<string>();

  constructor(readonly rows: MemoryCharacter[] = []) {}

  private fail(name: string): void {
    if (this.failing.has(name)) throw new Error(`${name} failed (test)`);
  }

  async characterLetters(): Promise<VipLetter[]> {
    this.fail('characterLetters');
    return this.rows.filter((c) => VIP_LETTERS.includes(c.letter)).map((c) => ({ account: c.account, letter: c.letter }));
  }

  async clearCharacterLetters(): Promise<number> {
    this.fail('clearCharacterLetters');
    const vip = this.rows.filter((c) => VIP_LETTERS.includes(c.letter));
    for (const c of vip) c.letter = 'F';
    return vip.length;
  }

  async sendGift(gift: VipGift, items: VipGiftItem[], title: string, text: string): Promise<GiftSendResult> {
    this.fail('sendGift');
    const before = this.sent.get(gift.id);
    if (before !== undefined) return { result: 2, idPlayer: before.idPlayer, characterName: before.characterName };
    const to = this.rows
      .filter((c) => c.account.toLowerCase() === gift.account.toLowerCase() && !c.deleted)
      .sort((a, b) => Number(b.online) - Number(a.online) || b.playTime - a.playTime || a.idPlayer.localeCompare(b.idPlayer))[0];
    if (to === undefined) return { result: 0, idPlayer: null, characterName: null };
    for (const item of [...items].sort((a, b) => a.slot - b.slot).slice(0, 6)) {
      if (item.itemId > 0 && item.count > 0) this.mails.push({ idPlayer: to.idPlayer, title, text, itemId: item.itemId, count: item.count });
    }
    this.sent.set(gift.id, { idPlayer: to.idPlayer, characterName: to.name });
    return { result: 1, idPlayer: to.idPlayer, characterName: to.name };
  }
}

/** The site's view of the store: `tiers()` gives only the tiers that are on (as usp_WebVipTiers does). */
export function siteView(store: MemoryVipStore): VipSiteStore & { close(): Promise<void> } {
  return {
    login: (a, p) => store.login(a, p),
    tiers: () => store.siteTiers(),
    qrs: () => store.qrs(),
    qrImage: (id) => store.qrImage(id),
    mine: (a) => store.mine(a),
    addRequest: (r) => store.addRequest(r),
    receipt: (id, a) => store.receipt(id, a),
    close: async () => {},
  };
}

// Support / VIP's stores in memory, for the tests and the demo (scripts/adminDemo.ts): both sides on one set of rows,
// with the rules of apps/web/sql/vip.sql (the tiers seeded at $2/$4/$6/$10 and P115/P230/P345/P575, the pending limit,
// used references, the approve rule, VIP ending by itself at its end time, old rejected receipts forgotten).

import type {
  AddVipRequestResult, AdminVipRequest, AdminVipRequestDetail, ApproveResult, MyVipRequest, NewVipRequest, PayQr, PayQrRow,
  PlayerLoginResult, VipAdminStore, VipNow, VipRequestStatus, VipSiteStore, VipTier, VipTierRow,
} from '../../src/vip/vipStore';

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
  private nextQr = 1;
  private nextRequest = 1;

  constructor(private readonly players: MemoryPlayer[] = [], private readonly now: () => number = Date.now) {}

  private find(account: string): MemoryPlayer | undefined {
    return this.players.find((p) => p.account.toLowerCase() === account.toLowerCase());
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

  async mine(account: string): Promise<{ vip: VipNow | null; requests: MyVipRequest[] }> {
    const live = this.liveVip(account);
    return {
      vip: live === undefined ? null : { level: live.level, name: this.tierName(live.level), endsAt: iso(live.endsAt) },
      requests: this.requestRows.filter((r) => r.account.toLowerCase() === account.toLowerCase()).sort((a, b) => b.id - a.id).slice(0, 20).map((r) => this.mineRow(r)),
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

  async close(): Promise<void> {}
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

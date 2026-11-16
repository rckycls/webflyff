// What Support / VIP asks of the database (apps/web/sql/vip.sql). The site runs the player side as `flyffweb_site`, the
// panel the admin side as `flyffweb_admin` (sqlVipStore.ts); the tests and the demo use test/support/memoryVipStore.ts.
// Every time is ISO text in UTC (ending in Z). Prices are cents: US cents, or peso centavos for PHP.

/** P processing, A approved, R rejected (with the admin's reason). */
export type VipRequestStatus = 'P' | 'A' | 'R';
export const VIP_REQUEST_STATUSES: readonly VipRequestStatus[] = ['P', 'A', 'R'];

/** USD for everyone; PHP (pesos) for players in the Philippines, on tiers that have a peso price. */
export type VipCurrency = 'USD' | 'PHP';
export const VIP_CURRENCIES: readonly VipCurrency[] = ['USD', 'PHP'];

/** `pricePhpCents`: the peso price in centavos, or `null` for US$ only. */
export interface VipTier { level: number; name: string; priceCents: number; pricePhpCents: number | null }
export interface VipTierRow extends VipTier { on: boolean }

export interface PayQr { id: number; label: string; accountName: string; note: string }
export interface PayQrRow extends PayQr { imageFile: string; on: boolean; order: number; createdAt: string }

/** A live VIP: none once `endsAt` has passed. */
export interface VipNow { level: number; name: string | null; endsAt: string }

export interface MyVipRequest {
  id: number;
  level: number;
  name: string | null;
  /** What the player was asked to pay: `priceCents` in this currency. */
  currency: VipCurrency;
  priceCents: number;
  reference: string;
  status: VipRequestStatus;
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** The VIP end time the approval gave. */
  vipEndsAt: string | null;
  /** False once a rejected request's picture was deleted (forgetReceipts). */
  hasReceipt: boolean;
}

export interface AdminVipRequest extends MyVipRequest {
  account: string;
  address: string;
  decidedBy: string | null;
  /** The account's live VIP now. */
  vipLevel: number | null;
  vipNowEndsAt: string | null;
}

export interface AdminVipRequestDetail extends AdminVipRequest { receiptFile: string | null }

export type PlayerLoginResult = { result: 'ok' | 'banned'; account: string } | { result: 'wrong' };

export interface NewVipRequest {
  account: string;
  level: number;
  currency: VipCurrency;
  reference: string;
  referenceKey: string;
  receiptFile: string;
  address: string;
  maxPending: number;
}

/**
 * The new request's id, or why it was refused: the tier is off or missing, too many processing, the reference used, the
 * tier has no price in that currency.
 */
export type AddVipRequestResult = { id: number } | { refused: 'tier' | 'too_many' | 'reference' | 'currency' };

export type ApproveResult = { result: 'ok'; level: number; endsAt: string } | { result: 'decided' | 'missing' };

export interface VipSiteStore {
  /** `usp_WebPlayerLogin` with the hash the game's login sends. */
  login(account: string, passwordHash: string): Promise<PlayerLoginResult>;
  /** The tiers that are on, by level. */
  tiers(): Promise<VipTier[]>;
  /** The QRs that are on, in their order. */
  qrs(): Promise<PayQr[]>;
  /** The picture file of a QR that is on. */
  qrImage(id: number): Promise<string | undefined>;
  mine(account: string): Promise<{ vip: VipNow | null; requests: MyVipRequest[] }>;
  addRequest(request: NewVipRequest): Promise<AddVipRequestResult>;
  /** The receipt file of one of the account's own requests. */
  receipt(id: number, account: string): Promise<string | undefined>;
}

export interface VipAdminStore {
  requests(status: VipRequestStatus): Promise<AdminVipRequest[]>;
  request(id: number): Promise<AdminVipRequestDetail | undefined>;
  /** The same tier while it runs adds a month to its end; anything else starts the request's tier now, for a month. */
  approve(id: number, admin: string): Promise<ApproveResult>;
  /** False when the request is not processing any more. */
  reject(id: number, admin: string, reason: string): Promise<boolean>;
  /** Forgets the receipts of requests rejected more than `days` days ago; gives their files, for the service to delete. */
  forgetReceipts(days: number): Promise<string[]>;
  tiers(): Promise<VipTierRow[]>;
  saveTier(tier: VipTierRow): Promise<boolean>;
  qrList(): Promise<PayQrRow[]>;
  addQr(qr: { label: string; accountName: string; note: string; imageFile: string; on: boolean; order: number }): Promise<number>;
  saveQr(qr: { id: number; label: string; accountName: string; note: string; on: boolean; order: number }): Promise<boolean>;
  /** The deleted QR's picture file, or `undefined` when there was no such QR. */
  deleteQr(id: number): Promise<string | undefined>;
}

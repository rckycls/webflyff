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

// --- 2026-11-19 (VIP perks): Give VIP, the VIP letters and the gift boxes ------------------------------------------

/** Give VIP's answer: the new level and end, or no such account, or a level or number of days out of range. */
export type GiveResult = { result: 'ok'; level: number; endsAt: string } | { result: 'unknown' | 'invalid' };

/** A gift box queued by an approval (`requestId`) or by Give VIP (null). */
export interface VipGift { id: number; account: string; level: number; requestId: number | null; createdAt: string }

/** An item stack in a tier's box: slot 1-6, count 1-9999. */
export interface VipGiftItem { level: number; slot: number; itemId: number; count: number }

export interface VipGiftLogRow extends VipGift {
  createdBy: string;
  sentAt: string | null;
  idPlayer: string | null;
  characterName: string | null;
  /** What it held, as `itemId x count` pairs joined by commas. */
  items: string | null;
}

/** The account's latest gift box, as the VIP page shows it; `cancelled` by End VIP. */
export interface VipGiftStatus { level: number; createdAt: string; sentAt: string | null; characterName: string | null; cancelled: boolean }

/** End VIP's answer: ended now (with the unsent boxes it cancelled), no live VIP, or no such account. */
export interface EndVipResult { result: 'ok' | 'none' | 'unknown'; cancelled: number }

/** An account (or one of its characters) and the VIP letter it holds. */
export interface VipLetter { account: string; letter: string }
export interface VipLetterChange { account: string; before: string; after: string }

/** What sending a box did: 1 sent, 2 sent before (the same character), 0 no character yet. */
export interface GiftSendResult { result: 0 | 1 | 2; idPlayer: string | null; characterName: string | null }

/** The VIP job's CHARACTER_01_DBF side, as `flyffweb_admin` (sqlVipCharacterStore.ts). */
export interface VipCharacterStore {
  /** The server 01 characters whose own letter is a VIP letter. */
  characterLetters(): Promise<VipLetter[]>;
  /** Puts every character's VIP letter back to F; gives how many changed. */
  clearCharacterLetters(): Promise<number>;
  /** Writes the box's mails (one per stack) to the account's character, once per gift id. */
  sendGift(gift: VipGift, items: VipGiftItem[], title: string, text: string): Promise<GiftSendResult>;
}

export interface VipSiteStore {
  /** `usp_WebPlayerLogin` with the hash the game's login sends. */
  login(account: string, passwordHash: string): Promise<PlayerLoginResult>;
  /** The tiers that are on, by level. */
  tiers(): Promise<VipTier[]>;
  /** The QRs that are on, in their order. */
  qrs(): Promise<PayQr[]>;
  /** The picture file of a QR that is on. */
  qrImage(id: number): Promise<string | undefined>;
  /** The live VIP, the latest requests and (2026-11-19) the latest gift box. */
  mine(account: string): Promise<{ vip: VipNow | null; requests: MyVipRequest[]; gift: VipGiftStatus | null }>;
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
  // 2026-11-19 (VIP perks)
  /** VIP without a payment: `days` more on the same live tier, else the tier from now; the letter; a gift if `gift`. */
  give(account: string, level: number, days: number, gift: boolean, admin: string): Promise<GiveResult>;
  /** The accounts whose own letter is a VIP letter. */
  letterAccounts(): Promise<VipLetter[]>;
  /**
   * A hand-set VIP letter with no WEB_VIP row becomes 30 days of VIP (no gift), once per account ever (WEB_VIP_ADOPTED):
   * false when the account has a row or was seen before, so a row the owner deletes is never brought back.
   */
  adopt(account: string, level: number): Promise<boolean>;
  /** Puts every player or VIP account letter right; staff letters never change. */
  syncLetters(): Promise<VipLetterChange[]>;
  /** The gift boxes not sent yet, oldest first, after the gift `afterId` (0: from the start). */
  pendingGifts(max: number, afterId?: number): Promise<VipGift[]>;
  /** Ends a live VIP now: the letter back to F (a player's or VIP's only), its unsent boxes cancelled. */
  endVip(account: string, admin: string): Promise<EndVipResult>;
  /** Marks a box sent; false when it was already. */
  markGiftSent(id: number, idPlayer: string, characterName: string | null, items: string): Promise<boolean>;
  giftItems(): Promise<VipGiftItem[]>;
  /** Puts a stack in a slot, or empties it with count 0; false when a value is out of range. */
  saveGiftItem(item: VipGiftItem): Promise<boolean>;
  /** The latest boxes, newest first. */
  giftLog(max: number): Promise<VipGiftLogRow[]>;
}

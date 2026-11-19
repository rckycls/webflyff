// Redeem codes (2026-11-20, docs/superpowers/specs/2026-11-20-vip-codes-design.md): what the codes ask of the database
// (apps/web/sql/vip.sql). The site checks and redeems as `flyffweb_site`; the panel makes and lists codes, and writes
// their mails, as `flyffweb_admin` (sqlCodeStore.ts). The tests and the demo use test/support/memoryCodeStore.ts.
// Every time is ISO text in UTC (ending in Z).

/** E: for everyone (one key, each account once, an optional cap); L: only the listed accounts; K: one-use keys. */
export type CodeKind = 'E' | 'L' | 'K';
export const CODE_KINDS: readonly CodeKind[] = ['E', 'L', 'K'];

export interface CodeItem { itemId: number; count: number }
export interface LiveVip { level: number; endsAt: string }

/** What a code gives: `vipLevel` 0 for no VIP. */
export interface CodeOffer { codeId: number; label: string; vipLevel: number; vipDays: number; expiresAt: string; items: CodeItem[] }

/**
 * Why a key was refused: no such key, past its end time, turned off by the owner, an everyone code at its cap, a one-use
 * key already used, this account used the code, the account is not on its list, the account has a higher live VIP (the
 * whole code, items too), or it would replace a lower live VIP without the player's confirm.
 */
export type CodeRefusal = 'unknown' | 'expired' | 'inactive' | 'claimed' | 'key_used' | 'mine' | 'not_listed' | 'lower_vip' | 'confirm';

/** `vip`: the account's live VIP. `offer` is null only for `unknown`. */
export type CodeCheck =
  | { ok: true; offer: CodeOffer; vip: LiveVip | null; replaces: boolean }
  | { ok: false; refused: CodeRefusal; offer: CodeOffer | null; vip: LiveVip | null };

/** One press of Redeem: `requestId` is the game's, so a press sent again gets the first answer (`repeat`). */
export interface RedeemRequest { account: string; key: string; requestId: string; idPlayer: string; characterName: string; address: string; confirm: boolean }

/** `vip`: the account's live VIP after the redeem. */
export type CodeRedeem =
  | { ok: true; useId: number; offer: CodeOffer; vip: LiveVip | null; repeat: boolean }
  | { ok: false; refused: CodeRefusal; offer: CodeOffer | null; vip: LiveVip | null };

export interface CodeSiteStore {
  check(account: string, key: string): Promise<CodeCheck>;
  redeem(request: RedeemRequest): Promise<CodeRedeem>;
  /** The character's name when `idPlayer` (7 digits) is the account's, on server 01, not deleted. */
  character(account: string, idPlayer: string): Promise<string | undefined>;
}

export interface NewCode {
  label: string;
  kind: CodeKind;
  vipLevel: number;
  vipDays: number;
  maxUses: number | null;
  expiresAt: string;
  items: CodeItem[];
  /** Stored keys (normalizeKey): one for E and L, 1-500 for K. */
  keys: string[];
  /** Kind L only. */
  accounts: string[];
  admin: string;
}

export type AddCodeResult = { id: number } | { refused: 'key_taken' | 'unknown_account' | 'invalid'; detail: string };

export interface CodeRow {
  id: number;
  label: string;
  kind: CodeKind;
  vipLevel: number;
  vipDays: number;
  maxUses: number | null;
  uses: number;
  keysTotal: number;
  keysUnused: number;
  /** The key of an E or L code; null for K. */
  firstKey: string | null;
  expiresAt: string;
  on: boolean;
  createdAt: string;
  createdBy: string;
  items: CodeItem[];
}
export interface CodeDetail extends CodeRow { accounts: string[] }
export interface CodeKeyRow { key: string; usedBy: string | null; usedAt: string | null }

export interface CodeUseRow {
  id: number;
  account: string;
  idPlayer: string;
  characterName: string;
  usedAt: string;
  address: string;
  vipLevel: number;
  vipDays: number;
  vipEndsAt: string | null;
  replacedLevel: number | null;
  replacedEndsAt: string | null;
  deliveredAt: string | null;
  deliveredName: string | null;
}

/** A use whose mails are not written yet. */
export interface PendingUse { id: number; codeId: number; label: string; account: string; idPlayer: string; items: CodeItem[] }

export interface CodeAdminStore {
  add(code: NewCode): Promise<AddCodeResult>;
  list(): Promise<CodeRow[]>;
  get(id: number): Promise<CodeDetail | undefined>;
  keys(id: number): Promise<CodeKeyRow[]>;
  /** False when there is no such code or a value is out of range. */
  save(id: number, label: string, expiresAt: string, on: boolean): Promise<boolean>;
  uses(id: number, max: number): Promise<CodeUseRow[]>;
  /** The uses not delivered yet, oldest first, after the use `afterId` (0: from the start). */
  pending(max: number, afterId: number): Promise<PendingUse[]>;
  pendingOne(useId: number): Promise<PendingUse | undefined>;
  /** False when it was marked already. */
  markDelivered(useId: number, idPlayer: string, characterName: string | null): Promise<boolean>;
}

/** usp_AdminCodeMailSend: 1 sent, 2 sent before, 0 the account has no character. */
export interface CodeMailResult { result: 0 | 1 | 2; idPlayer: string | null; characterName: string | null }
export interface CodeMailStore { sendUse(use: PendingUse, title: string, text: string): Promise<CodeMailResult> }

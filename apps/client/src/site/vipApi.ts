// The Support / VIP page's calls to the web service (apps/web/src/vip/siteVip.ts): the player's session, the page's
// data, the login, and a request with its receipt. Every POST carries the session's CSRF token in X-Site-Token.

import type { GiftStatus } from './vipPerks';

/** USD for everyone; PHP (pesos) for players in the Philippines, on tiers that have a peso price. */
export type Currency = 'USD' | 'PHP';
/**
 * `pricePhpCents`: the peso price in centavos, or `null` for US$ only. 2026-11-19 (VIP perks): `autoPlayHours`, the
 * tier's Auto Play hours a week (null: no limit).
 */
export interface VipTier { level: number; name: string; priceCents: number; pricePhpCents: number | null; autoPlayHours?: number | null }
export interface PayQr { id: number; label: string; accountName: string; note: string; image: string }
export type VipStatus = 'P' | 'A' | 'R';
/** `priceCents` is in `currency`; `receipt` is `null` once a rejected request's picture was deleted. */
export interface MyRequest {
  id: number; level: number; name: string | null; currency: Currency; priceCents: number; reference: string; status: VipStatus;
  reason: string | null; createdAt: string; decidedAt: string | null; vipEndsAt: string | null; receipt: string | null;
}
export interface VipNow { level: number; name: string | null; endsAt: string }
/** 2026-11-19 (VIP perks): `gift`, the latest gift box (vipPerks.ts GiftStatus). */
export interface Me { account: string; vip: VipNow | null; requests: MyRequest[]; gift?: GiftStatus | null }
export interface VipPageData { tiers: VipTier[]; qrs: PayQr[]; maxPending: number; me?: Me }

// 2026-11-20 (redeem codes): the code routes' answers (apps/web/src/codes/siteCodes.ts)
export interface VipLive { level: number; endsAt: string }
/** `bound` (owner 2026-11-20): the items come bound to the character (the game's binds flag: no trade). */
export interface CodeOfferView {
  codeId: number; label: string; vipLevel: number; vipDays: number; expiresAt: string; items: Array<{ itemId: number; count: number }>; bound: boolean;
}
export interface CodeCheckView { offer: CodeOfferView; vip: VipLive | null; replaces: boolean }
export interface CodeRedeemView { useId: number; offer: CodeOfferView; vip: VipLive | null; repeat: boolean }

/** The code refusals, each with its own message in the game (world/codes/codeRedeemer.ts). */
export type CodeError = 'format' | 'unknown' | 'expired' | 'inactive' | 'claimed' | 'key_used' | 'mine' | 'not_listed' | 'lower_vip' | 'confirm' | 'character';
const CODE_ERRORS: readonly CodeError[] = ['format', 'unknown', 'expired', 'inactive', 'claimed', 'key_used', 'mine', 'not_listed', 'lower_vip', 'confirm', 'character'];

export type VipError =
  | 'off' | 'wrong' | 'banned' | 'too_many' | 'session' | 'forbidden' | 'invalid' | 'size' | 'reference' | 'repeat' | 'slow_down'
  | 'server' | 'unreachable' | CodeError;
/** A refusal keeps the code's `offer` and the account's live `vip` when the answer has them (a code refusal). */
export type Answer<T> = { ok: true; value: T } | { ok: false; error: VipError; field?: string; max?: number; offer?: CodeOfferView | null; vip?: VipLive | null };

const NAMED: readonly VipError[] = ['off', 'wrong', 'banned', 'too_many', 'session', 'forbidden', 'invalid', 'size', 'reference', 'repeat', 'slow_down', 'server', ...CODE_ERRORS];

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/** A code's offer from an answer, or null. */
function readOffer(value: unknown): CodeOfferView | null {
  const o = record(value);
  if (o === null) return null;
  const items = Array.isArray(o.items) ? o.items.map(record).filter((i): i is Record<string, unknown> => i !== null) : [];
  return {
    codeId: Number(o.codeId ?? 0), label: String(o.label ?? ''), vipLevel: Number(o.vipLevel ?? 0), vipDays: Number(o.vipDays ?? 0),
    expiresAt: String(o.expiresAt ?? ''), items: items.map((i) => ({ itemId: Number(i.itemId ?? 0), count: Number(i.count ?? 0) })),
    bound: o.bound === true,
  };
}

/** A live VIP from an answer, or null. */
function readLive(value: unknown): VipLive | null {
  const v = record(value);
  return v === null || !(Number(v.level) > 0) ? null : { level: Number(v.level), endsAt: String(v.endsAt ?? '') };
}

/** A refusal by the body's `{error, field, max}`; an unnamed one is `server`. */
async function refusal(response: Response): Promise<{ ok: false; error: VipError; field?: string; max?: number; offer?: CodeOfferView | null; vip?: VipLive | null }> {
  const { error, field, max, offer, vip } = await bodyOf(response);
  const named = NAMED.find((e) => e === error) ?? (response.status === 403 ? 'forbidden' : 'server');
  return {
    ok: false, error: named,
    ...(typeof field === 'string' ? { field } : {}),
    ...(typeof max === 'number' ? { max } : {}),
    ...(offer !== undefined ? { offer: readOffer(offer) } : {}),
    ...(vip !== undefined ? { vip: readLive(vip) } : {}),
  };
}

/** A price as the page shows it: $2, $4.50, ₱115, ₱1,150. */
export function priceText(cents: number, currency: Currency = 'USD'): string {
  const amount = (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${currency === 'PHP' ? '₱' : '$'}${amount}`;
}

/**
 * The currency of the player's country, as the browser tells it without asking: the Philippines' time zone, or a
 * language of the Philippines (en-PH, fil-PH...), gives pesos; anywhere else, US dollars.
 */
export function countryCurrency(timeZone: string | undefined, languages: readonly string[]): Currency {
  if (timeZone === 'Asia/Manila') return 'PHP';
  return languages.some((language) => /-PH$/i.test(language)) ? 'PHP' : 'USD';
}

/** What a tier costs in `currency`: its peso price when it has one, else its dollar price. */
export function tierPrice(tier: VipTier, currency: Currency): { cents: number; currency: Currency } {
  return currency === 'PHP' && tier.pricePhpCents !== null ? { cents: tier.pricePhpCents, currency: 'PHP' } : { cents: tier.priceCents, currency: 'USD' };
}

/** custom (owner 2026-11-17): the answer of /api/autoplay. */
function readUsage(b: Record<string, unknown>): { usedMin: number; limitMin: number | null; resetsAt: string } {
  return { usedMin: Number(b.usedMin ?? 0), limitMin: b.limitMin === null || b.limitMin === undefined ? null : Number(b.limitMin), resetsAt: String(b.resetsAt ?? '') };
}

export class VipApi {
  private csrf = '';

  constructor(private readonly fetchFn: typeof fetch, private readonly newId: () => string = () => crypto.randomUUID()) {}

  private async call<T>(url: string, init: RequestInit, read: (body: Record<string, unknown>) => T): Promise<Answer<T>> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { cache: 'no-store', credentials: 'same-origin', ...init });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    if (!response.ok) return refusal(response);
    return { ok: true, value: read(await bodyOf(response)) };
  }

  private post<T>(url: string, body: unknown, read: (body: Record<string, unknown>) => T): Promise<Answer<T>> {
    return this.call(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Site-Token': this.csrf }, body: JSON.stringify(body),
    }, read);
  }

  /** The logged-in account, or `undefined` (also keeps the session's token for the POSTs). */
  async session(): Promise<string | undefined> {
    const answer = await this.call('/api/account/session', {}, (b) => ({ account: String(b.account ?? ''), csrf: String(b.csrf ?? '') }));
    if (!answer.ok) return undefined;
    this.csrf = answer.value.csrf;
    return answer.value.account;
  }

  data(): Promise<Answer<VipPageData>> {
    return this.call('/api/vip', {}, (b) => b as unknown as VipPageData);
  }

  async login(account: string, password: string): Promise<Answer<string>> {
    const answer = await this.post('/api/account/login', { account, password }, (b) => ({ account: String(b.account ?? ''), csrf: String(b.csrf ?? '') }));
    if (!answer.ok) return answer;
    this.csrf = answer.value.csrf;
    return { ok: true, value: answer.value.account };
  }

  /** custom (owner 2026-11-17): Auto Play's weekly hours of the session's account, or null (no session, off, unreachable). */
  async autoPlayStatus(): Promise<{ usedMin: number; limitMin: number | null; resetsAt: string } | null> {
    const answer = await this.call('/api/autoplay', {}, readUsage);
    return answer.ok ? answer.value : null;
  }

  /** custom (owner 2026-11-17): one running minute of Auto Play; the new count, or null. */
  async autoPlayTick(ms: number): Promise<{ usedMin: number; limitMin: number | null; resetsAt: string } | null> {
    const answer = await this.post('/api/autoplay/tick', { ms: Math.round(ms) }, readUsage);
    return answer.ok ? answer.value : null;
  }

  async logout(): Promise<void> {
    await this.post('/api/account/logout', {}, () => undefined);
    this.csrf = '';
  }

  /** 2026-11-20 (redeem codes): what a code would give the session's account now. */
  codeCheck(code: string): Promise<Answer<CodeCheckView>> {
    return this.post('/api/codes/check', { code }, (b) => ({ offer: readOffer(b.offer)!, vip: readLive(b.vip), replaces: b.replaces === true }));
  }

  /** 2026-11-20 (redeem codes): uses a code; its items go to `character` (the playing character's id). */
  codeRedeem(code: string, character: number, requestId: string, confirm: boolean): Promise<Answer<CodeRedeemView>> {
    return this.post('/api/codes/redeem', { code, character, requestId, confirm }, (b) => ({
      useId: Number(b.useId ?? 0), offer: readOffer(b.offer)!, vip: readLive(b.vip), repeat: b.repeat === true,
    }));
  }

  /** A request: the tier, the currency paid in, the reference number, the receipt as base64. A new request id each time. */
  send(request: { tier: number; currency: Currency; reference: string; receipt: string }): Promise<Answer<number>> {
    return this.post('/api/vip/requests', { ...request, requestId: this.newId() }, (b) => Number(b.id));
  }
}

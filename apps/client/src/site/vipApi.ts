// The Support / VIP page's calls to the web service (apps/web/src/vip/siteVip.ts): the player's session, the page's
// data, the login, and a request with its receipt. Every POST carries the session's CSRF token in X-Site-Token.

export interface VipTier { level: number; name: string; priceCents: number }
export interface PayQr { id: number; label: string; accountName: string; note: string; image: string }
export type VipStatus = 'P' | 'A' | 'R';
export interface MyRequest {
  id: number; level: number; name: string | null; priceCents: number; reference: string; status: VipStatus; reason: string | null;
  createdAt: string; decidedAt: string | null; vipEndsAt: string | null; receipt: string;
}
export interface VipNow { level: number; name: string | null; endsAt: string }
export interface Me { account: string; vip: VipNow | null; requests: MyRequest[] }
export interface VipPageData { tiers: VipTier[]; qrs: PayQr[]; maxPending: number; me?: Me }

export type VipError =
  | 'off' | 'wrong' | 'banned' | 'too_many' | 'session' | 'forbidden' | 'invalid' | 'size' | 'reference' | 'repeat' | 'slow_down'
  | 'server' | 'unreachable';
export type Answer<T> = { ok: true; value: T } | { ok: false; error: VipError; field?: string; max?: number };

const NAMED: readonly VipError[] = ['off', 'wrong', 'banned', 'too_many', 'session', 'forbidden', 'invalid', 'size', 'reference', 'repeat', 'slow_down', 'server'];

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A refusal by the body's `{error, field, max}`; an unnamed one is `server`. */
async function refusal(response: Response): Promise<{ ok: false; error: VipError; field?: string; max?: number }> {
  const { error, field, max } = await bodyOf(response);
  const named = NAMED.find((e) => e === error) ?? (response.status === 403 ? 'forbidden' : 'server');
  return {
    ok: false, error: named,
    ...(typeof field === 'string' ? { field } : {}),
    ...(typeof max === 'number' ? { max } : {}),
  };
}

/** Dollars as the page shows them: $2, $4.50. */
export function priceText(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
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

  async logout(): Promise<void> {
    await this.post('/api/account/logout', {}, () => undefined);
    this.csrf = '';
  }

  /** A request: the tier, the reference number, the receipt as base64. A new request id each time. */
  send(request: { tier: number; reference: string; receipt: string }): Promise<Answer<number>> {
    return this.post('/api/vip/requests', { ...request, requestId: this.newId() }, (b) => Number(b.id));
  }
}

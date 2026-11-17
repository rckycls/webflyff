/**
 * custom (owner 2026-11-17): Auto Play's weekly hours, as the web service counts them per account (apps/web
 * vip/autoPlayUsage.ts): normal 14 h, VIP1 24, VIP2 36, VIP3 48, VIP4 no limit, from Monday 00:00 server time. The game
 * opens the site's account session once its own login is accepted (the lobby hands the typed account and password over,
 * then forgets them), asks the count, and ticks once a minute while the farm bot or Support mode runs. Unknown (no session,
 * the service off or unreachable) holds nothing back: the limit is the server's, and the game plays on without it.
 */
import { VipApi } from '../../site/vipApi';

export interface UsageState { usedMin: number; limitMin: number | null; resetsAt: string }

export interface UsageApi {
  login(account: string, password: string): Promise<boolean>;
  status(): Promise<UsageState | null>;
  /** `ms`: the running time since the last tick (2026-11-18). */
  tick(ms: number): Promise<UsageState | null>;
}

export class AutoPlayLimit {
  /** The server's count, or null while unknown. */
  state: UsageState | null = null;

  constructor(private readonly api: UsageApi) {}

  /** The game's login was accepted: the site session with the same account, then the count. */
  async signIn(account: string, password: string): Promise<void> {
    if (!(await this.api.login(account, password))) return;
    this.state = await this.api.status();
  }

  /** Running time (a minute, or the part-minute at a stop); the server answers with the new count. */
  async tick(ms: number): Promise<void> {
    const next = await this.api.tick(ms);
    if (next !== null) this.state = next;
  }

  /** Minutes left this week; null when there is no limit or it is not known. */
  leftMin(): number | null {
    const state = this.state;
    if (state === null || state.limitMin === null) return null;
    return Math.max(0, state.limitMin - state.usedMin);
  }
}

/** The web service's routes, on the site's own session (VipApi keeps the cookie's CSRF token). */
export function siteUsageApi(fetchFn: typeof fetch): UsageApi {
  const site = new VipApi(fetchFn);
  return {
    login: async (account, password) => (await site.login(account, password)).ok,
    status: () => site.autoPlayStatus(),
    tick: (ms) => site.autoPlayTick(ms),
  };
}

/** The page's one count (the lobby signs it in; every world screen reads and ticks it). */
export const autoPlayLimit = new AutoPlayLimit(siteUsageApi((...args) => globalThis.fetch(...args)));

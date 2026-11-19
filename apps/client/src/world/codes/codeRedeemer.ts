// custom (owner 2026-11-20, redeem codes; docs/superpowers/specs/2026-11-20-vip-codes-design.md): what the Redeem Code
// window does, without the window. The player types a code; Check asks the website what it would give (on the site
// session the game opened at login); Redeem checks the bag has one empty main-bag slot per item stack, asks once more
// when the code would replace a lower VIP, then uses the code. Every answer has its own line (CODE_TEXTS, the owner's
// "error handling taken care really carefully"):
// - a call with no answer in 15 s is "can't reach"; Redeem again sends the same request id, so a code the website used
//   before the answer was lost gives its first answer back, never "already used";
// - a lost session (12 hours, a website restart) asks for the password, then does what it stopped, with the same code.
// The items come by in-game mail (`Code reward #<use id>`), which the game moves into the bag (codeMailTaker.ts).

import { BAG_POSITIONS } from '../trade/itemContainer';
import type { Answer, CodeCheckView, CodeRedeemView, VipError, VipLive } from '../../site/vipApi';

export const CODE_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;

export const CODE_TEXTS = {
  format: 'Check the code: letters and numbers only.',
  unknown: "This code doesn't exist.",
  too_many: 'Too many tries. Try again in an hour.',
  expired: 'This code has expired.',
  inactive: 'This code is no longer active.',
  claimed: 'This code has been fully claimed.',
  key_used: 'This code was already used.',
  mine: 'You already used this code.',
  not_listed: "This code isn't for your account.",
  lower_vip: 'You have VIP{live} until {liveEnd}. This code gives VIP{code} and works until {codeEnd}. Use it after your VIP ends.',
  bag: 'Make room in your bag: this code needs {needed} free slots (you have {free}).',
  character: "Couldn't find your character. Log in again and retry.",
  password: 'Type your password to use codes.',
  wrong: 'Wrong password.',
  banned: 'This account is banned.',
  off: 'Codes are not available right now.',
  unreachable: "Can't reach the code service. Try again in a minute.",
  server: 'Something went wrong. Nothing was used. Try again.',
  replace: 'This ends your VIP{live} ({daysLeft} days left) and gives VIP{code} for {days} days.',
  done: 'Done! Your items arrive in your bag within about a minute. If your bag is full by then, they wait in your mailbox (Post) for 15 days.',
  doneVip: 'You have VIP{level} until {end}. Log out and in again to see it.',
} as const;

const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/** `27 Nov 2026`. */
export function dayText(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : iso;
}

/** The website's rule (apps/web/src/codes/codeKeys.ts normalizeKey): 4 to 32 letters and digits once spaces and dashes are dropped. */
export function codeFormatOk(text: string): boolean {
  return /^[A-Z0-9]{4,32}$/.test(text.replace(/[\s-]+/g, '').toUpperCase());
}

/** The empty slots of the main bag (its first 42 slots; worn gear and the Backpack pockets are not counted). */
export function freeBagSlots(own: { inventory: Map<number, unknown> | null; inventorySlots: number[] }): number {
  if (own.inventory === null) return 0;
  const inventory = own.inventory;
  return own.inventorySlots.slice(0, BAG_POSITIONS).filter((id) => !inventory.has(id)).length;
}

/** The calls the window makes (site/vipApi.ts VipApi). */
export interface CodeApiLike {
  /** The session's account (and its token for the POSTs), or `undefined` (no session, or no answer). */
  session(): Promise<string | undefined>;
  login(account: string, password: string): Promise<Answer<string>>;
  codeCheck(code: string): Promise<Answer<CodeCheckView>>;
  codeRedeem(code: string, character: number, requestId: string, confirm: boolean): Promise<Answer<CodeRedeemView>>;
}

export interface CodeRedeemerHost {
  api: CodeApiLike;
  /** The game account (the one the game logged in with). */
  account(): string;
  /** The playing character's id: its items go there. */
  playerId(): number;
  freeSlots(): number;
  /** The use whose mails the game moves into the bag (codeMailTaker.ts). */
  expectMails(useId: number): void;
  newRequestId(): string;
  now(): number;
}

export type CodeView =
  | { step: 'enter'; message: string | null }
  | { step: 'busy' }
  | { step: 'password'; message: string | null }
  | { step: 'offer'; check: CodeCheckView; needed: number; free: number; warning: string | null; confirming: boolean; message: string | null }
  | { step: 'done'; lines: string[] };

type Refusal = Extract<Answer<unknown>, { ok: false }>;
const UNREACHABLE: Refusal = { ok: false, error: 'unreachable' };

/** `promise`, or `fallback` after CODE_TIMEOUT_MS. */
function timed<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), CODE_TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

const sessionLost = (error: VipError): boolean => error === 'session' || error === 'forbidden';

export class CodeRedeemer {
  view: CodeView = { step: 'enter', message: null };
  private code = '';
  private offerCheck: CodeCheckView | null = null;
  /** The id of this offer's Redeem press: kept after a lost answer, so a press again gets the first answer. */
  private requestId: string | null = null;
  /** Whether this window has the session's token. */
  private ready = false;
  /** What a session loss stopped, done again after the password. */
  private resume: (() => Promise<void>) | null = null;

  constructor(private readonly host: CodeRedeemerHost, private readonly onChange: (view: CodeView) => void) {}

  private show(view: CodeView): void {
    this.view = view;
    this.onChange(view);
  }

  /** A refusal's line. */
  private refusalText(answer: Refusal): string {
    const error = answer.error;
    if (error === 'lower_vip') {
      const live: VipLive | null | undefined = answer.vip;
      return fill(CODE_TEXTS.lower_vip, {
        live: live?.level ?? '?', liveEnd: live ? dayText(live.endsAt) : '?', code: answer.offer?.vipLevel ?? '?',
        codeEnd: answer.offer ? dayText(answer.offer.expiresAt) : '?',
      });
    }
    return error in CODE_TEXTS ? CODE_TEXTS[error as keyof typeof CODE_TEXTS] : CODE_TEXTS.server;
  }

  /**
   * One call on the session: the token first (a new window has none), then the call; a session refusal gets a fresh
   * token and one more try, then the password row (`undefined`: the window now asks for it, and `again` waits).
   */
  private async call<T>(run: () => Promise<Answer<T>>, again: () => Promise<void>): Promise<Answer<T> | undefined> {
    if (!this.ready) this.ready = (await timed(this.host.api.session(), undefined)) !== undefined;
    let answer = await timed(run(), UNREACHABLE as Answer<T>);
    if (!answer.ok && sessionLost(answer.error)) {
      this.ready = (await timed(this.host.api.session(), undefined)) !== undefined;
      if (this.ready) answer = await timed(run(), UNREACHABLE as Answer<T>);
      if (!answer.ok && sessionLost(answer.error)) {
        this.ready = false;
        this.resume = again;
        this.show({ step: 'password', message: CODE_TEXTS.password });
        return undefined;
      }
    }
    return answer;
  }

  private showOffer(confirming: boolean, message: string | null): void {
    const check = this.offerCheck!;
    const live = check.vip;
    const warning = check.replaces && live !== null
      ? fill(CODE_TEXTS.replace, {
        live: live.level, daysLeft: Math.max(1, Math.ceil((Date.parse(live.endsAt) - this.host.now()) / DAY_MS)),
        code: check.offer.vipLevel, days: check.offer.vipDays,
      })
      : null;
    this.show({ step: 'offer', check, needed: check.offer.items.length, free: this.host.freeSlots(), warning, confirming, message });
  }

  async check(text: string): Promise<void> {
    if (!codeFormatOk(text)) {
      this.show({ step: 'enter', message: CODE_TEXTS.format });
      return;
    }
    this.code = text.trim();
    this.offerCheck = null;
    this.requestId = null;
    this.show({ step: 'busy' });
    const answer = await this.call(() => this.host.api.codeCheck(this.code), () => this.check(text));
    if (answer === undefined) return;
    if (!answer.ok) {
      this.show({ step: 'enter', message: this.refusalText(answer) });
      return;
    }
    this.offerCheck = answer.value;
    this.showOffer(false, null);
  }

  async redeem(): Promise<void> {
    const view = this.view;
    if (view.step !== 'offer' || this.offerCheck === null) return;
    const check = this.offerCheck;
    const needed = check.offer.items.length;
    const free = this.host.freeSlots();
    if (free < needed) {
      this.showOffer(false, fill(CODE_TEXTS.bag, { needed, free }));
      return;
    }
    if (check.replaces && !view.confirming) {
      this.showOffer(true, null);
      return;
    }
    this.requestId ??= this.host.newRequestId();
    const requestId = this.requestId;
    this.show({ step: 'busy' });
    const answer = await this.call(() => this.host.api.codeRedeem(this.code, this.host.playerId(), requestId, check.replaces), () => this.redeemAgain());
    if (answer === undefined) return;
    if (!answer.ok) {
      if (answer.error === 'confirm') {
        // the VIP changed since Check: it would now replace a lower one
        this.offerCheck = { ...check, vip: answer.vip ?? check.vip, replaces: true };
        this.showOffer(true, null);
        return;
      }
      if (answer.error === 'unreachable' || answer.error === 'server') {
        this.showOffer(view.confirming, this.refusalText(answer)); // the same request id on the next press
        return;
      }
      this.offerCheck = null;
      this.requestId = null;
      this.show({ step: 'enter', message: answer.error === 'character' ? CODE_TEXTS.character : this.refusalText(answer) });
      return;
    }
    const done = answer.value;
    const lines: string[] = [];
    if (done.offer.items.length > 0) {
      lines.push(CODE_TEXTS.done);
      this.host.expectMails(done.useId);
    }
    if (done.offer.vipLevel > 0 && done.vip !== null) lines.push(fill(CODE_TEXTS.doneVip, { level: done.vip.level, end: dayText(done.vip.endsAt) }));
    this.requestId = null;
    this.show({ step: 'done', lines });
  }

  /** Redeem again after the password: the offer is shown as it was, confirmed when it had been. */
  private async redeemAgain(): Promise<void> {
    if (this.offerCheck === null) return;
    this.showOffer(this.offerCheck.replaces, null);
    await this.redeem();
  }

  async password(text: string): Promise<void> {
    if (text === '') {
      this.show({ step: 'password', message: CODE_TEXTS.password });
      return;
    }
    this.show({ step: 'busy' });
    const answer = await timed(this.host.api.login(this.host.account(), text), UNREACHABLE as Answer<string>);
    if (!answer.ok) {
      const message = answer.error === 'wrong' ? CODE_TEXTS.wrong : answer.error === 'banned' ? CODE_TEXTS.banned : this.refusalText(answer);
      this.show({ step: 'password', message });
      return;
    }
    this.ready = true;
    const resume = this.resume;
    this.resume = null;
    if (resume !== null) await resume();
    else this.show({ step: 'enter', message: null });
  }

  reset(): void {
    this.code = '';
    this.offerCheck = null;
    this.requestId = null;
    this.resume = null;
    this.show({ step: 'enter', message: null });
  }
}

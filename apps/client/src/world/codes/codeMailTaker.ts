// custom (owner 2026-11-20, redeem codes; "mail, then into bag"): a redeemed code's items come by in-game mail, one mail
// per stack, titled `Code reward #<use id>`, from the game itself (sender 0); the website writes them and the Database
// server hands them over within about a minute. The game then takes each one's item into the bag, as the Post window's
// Get Item does (QUERYGETMAILITEM: the World needs one empty bag slot, anywhere in the world).
// - Only those mails: sender 0, the exact title, a use redeemed while this page is open (`expectedCodeUses`, kept at the
//   module so it outlives the log out and in that a VIP code asks for). Never a player's mail, never twice.
// - The mailbox is asked 20 seconds after a redeem, then every 20 seconds for 3 minutes, and when the new-mail notice comes;
//   a "wait" answer (the server still loading the box) is asked again 5 seconds later.
// - No room: nothing is taken, and the chat says once per use that the items wait in the mailbox (Post, 15 days).

import { encodeQueryGetMailItem, encodeQueryMailBox } from '@flyffweb/protocol';
import type { PostMessage } from '@flyffweb/protocol';

/** The use ids redeemed while this page is open. */
export const expectedCodeUses = new Set<number>();
export const WAITING_TEXT = 'Your code items are waiting in your mailbox (Post).';

const TITLE = /^Code reward #(\d+)$/;
const FIRST_ASK_MS = 20_000;
const ASK_EVERY_MS = 20_000;
const ASK_FOR_MS = 3 * 60_000;
const WAIT_ANSWER_MS = 5_000;
/** A world that starts with uses still expected asks 5 seconds in (the entry's own packets first). */
const RESUME_ASK_MS = 5_000;

export interface CodeMailHost {
  send(bytes: Uint8Array): void;
  /** The empty main-bag slots now. */
  freeSlots(): number;
  /** One chat line. */
  say(text: string): void;
}

export class CodeMailTaker {
  /** When the mailbox is asked next (null: not). */
  private nextAsk: number | null = null;
  /** The last time a redeem's asks run until. */
  private asksUntil = 0;
  /** The mails whose item was asked for. */
  private readonly taken = new Set<number>();
  /** The uses whose mails were taken from, and the uses the waiting line was said for. */
  private readonly takenUses = new Set<number>();
  private readonly waitingSaid = new Set<number>();

  constructor(private readonly host: CodeMailHost) {}

  expect(useId: number, now: number): void {
    expectedCodeUses.add(useId);
    this.asksUntil = now + ASK_FOR_MS;
    this.nextAsk = now + FIRST_ASK_MS;
  }

  mailNotice(now: number): void {
    if (expectedCodeUses.size > 0) this.ask(now);
  }

  /** Whether the own MODE_MAILBOX was on at the last frame: a new world starts with it off. */
  private mailOn = false;

  /**
   * The own MODE_MAILBOX each frame (the final review, 2026-11-20): turning on asks the mailbox. The World sets it at
   * entry without a MODIFYMODE (AdjustMailboxState), so the code mails that came during a log out and in are found too.
   */
  mailMode(on: boolean, now: number): void {
    if (on && !this.mailOn) this.mailNotice(now);
    this.mailOn = on;
  }

  /** A world starts while uses are still expected (redeemed before a log out and in): ask again for a while. */
  resume(now: number): void {
    if (expectedCodeUses.size === 0) return;
    this.asksUntil = now + ASK_FOR_MS;
    this.nextAsk = now + RESUME_ASK_MS;
  }

  update(now: number): void {
    if (this.nextAsk === null || now < this.nextAsk) return;
    if (expectedCodeUses.size === 0 || now > this.asksUntil) {
      this.nextAsk = null;
      return;
    }
    this.ask(now);
  }

  private ask(now: number): void {
    this.host.send(encodeQueryMailBox());
    this.nextAsk = now + ASK_EVERY_MS <= this.asksUntil ? now + ASK_EVERY_MS : null;
  }

  handle(message: PostMessage, now: number): void {
    if (message.type === 'mailBoxReq') {
      if (message.hasMail && expectedCodeUses.size > 0) this.nextAsk = now + WAIT_ANSWER_MS;
      return;
    }
    if (message.type !== 'mailBox') return;
    let free = this.host.freeSlots();
    const left = new Set<number>();
    for (const mail of message.mails) {
      const match = TITLE.exec(mail.title);
      if (match === null || mail.senderId !== 0 || mail.item === undefined) continue;
      const useId = Number(match[1]);
      if (!expectedCodeUses.has(useId)) continue;
      left.add(useId);
      if (this.taken.has(mail.id)) continue;
      if (free <= 0) {
        if (!this.waitingSaid.has(useId)) {
          this.waitingSaid.add(useId);
          this.host.say(WAITING_TEXT);
        }
        continue;
      }
      this.host.send(encodeQueryGetMailItem(mail.id));
      this.taken.add(mail.id);
      this.takenUses.add(useId);
      free--;
    }
    // a use whose mails were taken from and have no item left is done
    for (const useId of [...expectedCodeUses]) {
      if (this.takenUses.has(useId) && !left.has(useId)) {
        expectedCodeUses.delete(useId);
        this.takenUses.delete(useId);
      }
    }
  }
}

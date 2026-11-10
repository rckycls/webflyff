// The sign-up form's ticket (website spec §3.4): `<issuedAtMs>.<nonce>.<hmac>`, the nonce 16 random bytes and the HMAC
// SHA-256 of `<issuedAtMs>.<nonce>` with the settings' secret, both base64url. A ticket is good from 3 s to 30 min after
// it was given (a bot that posts at once is refused; a page left open too long fetches a new one) and once only: its
// nonce is kept as spent until the ticket would be late anyway. Kept in memory: a restart forgets the spent nonces,
// and the tickets given before it stay good until they are late.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TICKET_MIN_AGE_MS = 3000;
export const TICKET_MAX_AGE_MS = 1_800_000;

export type TicketCheck = 'ok' | 'bad' | 'early' | 'late' | 'used';

const TICKET = /^(\d{1,15})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

export class TicketBook {
  /** Spent nonces, by the time their ticket was given. */
  private readonly spent = new Map<string, number>();

  constructor(private readonly secret: string, private readonly now: () => number) {}

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }

  issue(): string {
    const body = `${this.now()}.${randomBytes(16).toString('base64url')}`;
    return `${body}.${this.sign(body)}`;
  }

  check(ticket: string): TicketCheck {
    this.sweep();
    const parts = TICKET.exec(ticket);
    if (parts === null) return 'bad';
    const [, issuedText, nonce, mac] = parts as unknown as [string, string, string, string];
    // compared as text: two base64url texts can decode to the same bytes, and only the one this book writes is good
    const expected = Buffer.from(this.sign(`${issuedText}.${nonce}`));
    const given = Buffer.from(mac);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'bad';
    const issued = Number(issuedText);
    const age = this.now() - issued;
    if (age < TICKET_MIN_AGE_MS) return 'early';
    if (age > TICKET_MAX_AGE_MS) return 'late';
    if (this.spent.has(nonce)) return 'used';
    this.spent.set(nonce, issued);
    return 'ok';
  }

  /** How many spent nonces are kept (for the tests). */
  spentCount(): number {
    return this.spent.size;
  }

  private sweep(): void {
    const now = this.now();
    for (const [nonce, issued] of this.spent) if (now - issued > TICKET_MAX_AGE_MS) this.spent.delete(nonce);
  }
}

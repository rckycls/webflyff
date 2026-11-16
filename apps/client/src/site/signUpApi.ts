// The sign-up page's calls to the web service (apps/web, website spec §3.4): a ticket, then the form.

import type { SignUpField } from '@flyffweb/protocol';

export type SignUpError =
  'invalid' | 'taken' | 'too_many' | 'paused' | 'prereg_limit' | 'ticket' | 'server' | 'forbidden' | 'unreachable';
/** `max`: with `prereg_limit`, the accounts one connection or browser may make during pre-registration. */
export type SignUpAnswer = { ok: true } | { ok: false; error: SignUpError; field?: SignUpField; max?: number };

export interface SignUpRequestBody { account: string; password: string; email: string; website: string; ticket: string }

/** The errors the service names in its body; any other answer is `server`. */
const NAMED: readonly SignUpError[] = ['invalid', 'taken', 'too_many', 'paused', 'prereg_limit', 'ticket', 'forbidden', 'server'];

/** The sign-up page's message for `prereg_limit` (docs/2026-11-15-prereg-login.md). */
export function preregLimitText(max: number | undefined): string {
  const most = max === undefined ? 'the most accounts' : `${max} account${max === 1 ? '' : 's'}, the most`;
  return `This internet connection or browser already has ${most} allowed during pre-registration.`;
}
const FIELDS: readonly SignUpField[] = ['account', 'password', 'confirm', 'email'];

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export class SignUpApi {
  constructor(private readonly fetchFn: typeof fetch) {}

  /** A form ticket, or `undefined` when the service refused one or could not be reached. */
  async ticket(): Promise<string | undefined> {
    try {
      const response = await this.fetchFn('/api/sign-up/ticket', { cache: 'no-store' });
      if (!response.ok) return undefined;
      const { ticket } = await bodyOf(response);
      return typeof ticket === 'string' && ticket !== '' ? ticket : undefined;
    } catch {
      return undefined;
    }
  }

  /** Sends the form; the answer, by the HTTP status and the body's `{ error, field }`. */
  async send(form: SignUpRequestBody): Promise<SignUpAnswer> {
    let response: Response;
    try {
      response = await this.fetchFn('/api/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        cache: 'no-store',
      });
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    if (response.status === 201) return { ok: true };
    const { error, field, max } = await bodyOf(response);
    const named = NAMED.find((e) => e === error);
    if (named === undefined) return { ok: false, error: response.status === 403 ? 'forbidden' : 'server' };
    if (named === 'prereg_limit') {
      return typeof max === 'number' && Number.isInteger(max) && max > 0 ? { ok: false, error: named, max } : { ok: false, error: named };
    }
    const known = FIELDS.find((f) => f === field);
    return named === 'invalid' && known !== undefined ? { ok: false, error: named, field: known } : { ok: false, error: named };
  }
}

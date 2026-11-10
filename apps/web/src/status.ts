// `GET /api/status` (website spec §3.4): online when the certifier's and the login server's ports take a connection
// within 1 s; the players in a world, from `usp_WebOnlineCount`, or null when the database fails or takes over 2 s (a
// hanging database must not hang the home page). One answer is kept 30 s and shared by every visitor.

import { connect } from 'node:net';
import type { AccountStore } from './accountStore';
import type { WebConfig } from './config';

/** The home page's type (apps/client/src/site/statusBox.ts has the same: the two share no package for it). */
export interface StatusAnswer { online: boolean; players: number | null; checkedAt: string }

export const PROBE_TIMEOUT_MS = 1000;
export const COUNT_TIMEOUT_MS = 2000;
export const STATUS_TTL_MS = 30_000;

/** Whether `host:port` takes a TCP connection within `timeoutMs`; the connection is closed at once. */
export function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (up: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(up);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** `p`, or a rejection after `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
    p.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

export async function loadStatus(config: WebConfig, store: AccountStore): Promise<StatusAnswer> {
  const { certifier, login } = config.servers;
  const [certifierUp, loginUp, players] = await Promise.all([
    probePort(certifier.host, certifier.port, PROBE_TIMEOUT_MS),
    probePort(login.host, login.port, PROBE_TIMEOUT_MS),
    withTimeout(store.onlineCount(), COUNT_TIMEOUT_MS).then((count) => count, () => null),
  ]);
  return { online: certifierUp && loginUp, players, checkedAt: new Date().toISOString() };
}

/** One answer for `ttlMs`; the callers that ask while it loads share the load. A failed load is not kept. */
export class StatusCache {
  private kept: { answer: StatusAnswer; at: number } | undefined;
  private loading: Promise<StatusAnswer> | undefined;

  constructor(private readonly load: () => Promise<StatusAnswer>, private readonly now: () => number, private readonly ttlMs = STATUS_TTL_MS) {}

  get(): Promise<StatusAnswer> {
    if (this.kept !== undefined && this.now() - this.kept.at <= this.ttlMs) return Promise.resolve(this.kept.answer);
    this.loading ??= this.load().then(
      (answer) => {
        this.kept = { answer, at: this.now() };
        this.loading = undefined;
        return answer;
      },
      (error: unknown) => {
        this.loading = undefined;
        throw error;
      },
    );
    return this.loading;
  }
}

// Panel sessions (admin panel spec §5.3): kept in memory only, so a restart logs everyone out. A session ends after
// `idleMs` without a request, `maxMs` after it began, or at logout. Each has a CSRF token the page sends back in
// X-Admin-Token, and remembers the last request ids it took, so a double click cannot act twice.

import { randomBytes } from 'node:crypto';

export interface AdminSession {
  id: string;
  csrf: string;
  user: string;
  createdAt: number;
  lastSeen: number;
  requestIds: string[];
}

const KEPT_REQUEST_IDS = 50;

const token = (): string => randomBytes(32).toString('base64url');

export class SessionBook {
  private readonly sessions = new Map<string, AdminSession>();

  constructor(private readonly now: () => number, private readonly idleMs: number, private readonly maxMs: number) {}

  create(user: string): AdminSession {
    const now = this.now();
    const session: AdminSession = { id: token(), csrf: token(), user, createdAt: now, lastSeen: now, requestIds: [] };
    this.sessions.set(session.id, session);
    return session;
  }

  /** The live session with this id, its idle time restarted; an expired one is deleted. */
  get(id: string | undefined): AdminSession | undefined {
    if (id === undefined) return undefined;
    const session = this.sessions.get(id);
    if (session === undefined) return undefined;
    const now = this.now();
    if (now - session.lastSeen > this.idleMs || now - session.createdAt >= this.maxMs) {
      this.sessions.delete(id);
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  destroy(id: string): void {
    this.sessions.delete(id);
  }

  /** False when `requestId` was already taken in this session. */
  claimRequest(session: AdminSession, requestId: string): boolean {
    if (session.requestIds.includes(requestId)) return false;
    session.requestIds.push(requestId);
    if (session.requestIds.length > KEPT_REQUEST_IDS) session.requestIds.shift();
    return true;
  }
}

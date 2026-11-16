// The pre-registration lock (docs/2026-11-15-prereg-login.md). Anyone may sign up on the website, but while the lock
// is on only the accounts in a `.env` file may log in to the game. The gateway is where every browser's CERTIFY
// passes, and the certifier's port is closed to the internet (deploy\5-Firewall.ps1), so the check sits here, before
// the certifier ever sees the account. Without the certifier's auth key the login and cache servers take nothing.

import { readFileSync, statSync } from 'node:fs';
import { PREREG_OFF, parsePreregEnv, type PreregRule } from '@flyffweb/protocol';
import type { Logger } from './log';

// The .env reader is shared with the web service (packages/protocol/src/web/prereg.ts)
export { PREREG_OFF, parsePreregEnv, type PreregRule };

/** The log line for a rule read from `path`. */
export function describeRule(rule: PreregRule, path: string): string {
  if (!rule.on) return `prereg: off, everyone may log in (${path})`;
  if (rule.allowed.size === 0) return `prereg: on, nobody may log in: PREREG_ALLOWED_ACCOUNTS is empty (${path})`;
  return `prereg: on, ${rule.allowed.size} account(s) may log in: ${[...rule.allowed].join(', ')} (${path})`;
}

/**
 * The lock as a `.env` file on disk says now. The file is read at the start, and again whenever its time or size
 * changes: at every check, and every `pollMs` (default 2 s) so that the log shows a change soon after it is saved.
 * No restart is needed. With no file the lock is off. A file that cannot be read for another reason (locked while
 * an editor saves it, say) keeps the last rule until it can be read. Each change of the rule writes one log line.
 */
export class PreregLock {
  private rule: PreregRule = PREREG_OFF;
  /** The time and size of the file last read, `missing` when there was none; `undefined` before the first look. */
  private stamp: string | undefined;
  private lastLine: string | undefined;
  private lastError: string | undefined;
  private readonly timer: NodeJS.Timeout | undefined;

  constructor(readonly path: string, private readonly log: Logger, pollMs = 2000) {
    this.refresh();
    if (pollMs > 0) {
      this.timer = setInterval(() => this.refresh(), pollMs);
      this.timer.unref();
    }
  }

  /** Whether `account` may log in now (always, while the lock is off). The file is looked at first. */
  allows(account: string): boolean {
    this.refresh();
    return !this.rule.on || this.rule.allowed.has(account.trim().toLowerCase());
  }

  /** Reads the file again if it changed since the last look. */
  refresh(): void {
    let stamp: string;
    try {
      const stats = statSync(this.path);
      stamp = `${stats.mtimeMs} ${stats.size}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return this.failed(error);
      stamp = 'missing';
    }
    if (stamp === this.stamp) return;
    let rule: PreregRule;
    if (stamp === 'missing') {
      rule = PREREG_OFF;
    } else {
      try {
        rule = parsePreregEnv(readFileSync(this.path, 'utf8'));
      } catch (error) {
        return this.failed(error);
      }
    }
    this.stamp = stamp;
    this.lastError = undefined;
    this.rule = rule;
    const line = stamp === 'missing' ? `prereg: off, everyone may log in (no file at ${this.path})` : describeRule(rule, this.path);
    for (const warning of rule.warnings) this.log.info(`prereg: ${warning}`);
    if (line !== this.lastLine || rule.warnings.length > 0) this.log.info(line);
    this.lastLine = line;
  }

  /** Stops looking at the file. */
  close(): void {
    clearInterval(this.timer);
  }

  private failed(error: unknown): void {
    const code = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
    if (code === this.lastError) return;
    this.lastError = code;
    this.log.info(`prereg: cannot read ${this.path} (${code}); the last settings stay: ${this.rule.on ? 'on' : 'off'}`);
  }
}

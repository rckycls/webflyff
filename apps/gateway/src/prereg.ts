// The pre-registration lock (docs/2026-11-15-prereg-login.md). Anyone may sign up on the website, but while the lock
// is on only the accounts in a `.env` file may log in to the game. The gateway is where every browser's CERTIFY
// passes, and the certifier's port is closed to the internet (deploy\5-Firewall.ps1), so the check sits here, before
// the certifier ever sees the account. Without the certifier's auth key the login and cache servers take nothing.

import { readFileSync, statSync } from 'node:fs';
import type { Logger } from './log';

/** What the `.env` file says. `allowed` holds the names in lower case: account names are not case-sensitive. */
export interface PreregRule {
  on: boolean;
  allowed: ReadonlySet<string>;
  /** Problems worth a line in the log, for example a PREREG_ONLY that is neither true nor false. */
  warnings: string[];
}

export const PREREG_OFF: PreregRule = Object.freeze({ on: false, allowed: new Set<string>(), warnings: [] });

const ON = new Set(['true', '1', 'yes', 'on']);
const OFF = new Set(['false', '0', 'no', 'off', '']);

/** The value of one `KEY=VALUE` line: quotes taken off, or a ` #` comment after an unquoted value. */
function value(raw: string): string {
  const text = raw.trim();
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) return text.slice(1, -1).trim();
  return text.replace(/\s+#.*$/, '').trim();
}

/**
 * Reads the text of a `.env` file: `KEY=VALUE` lines, `#` comments and blank lines; keys in any case; the last line
 * of a key wins. `PREREG_ONLY` true, 1, yes or on turns the lock on; false, 0, no, off, empty or no line leaves it
 * off; anything else turns it on too, with a warning, so a typo never opens the game. `PREREG_ALLOWED_ACCOUNTS` is a
 * list of account names split at commas (spaces and semicolons work too), trimmed and in lower case.
 */
export function parsePreregEnv(text: string): PreregRule {
  const values = new Map<string, string>();
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values.set(trimmed.slice(0, eq).trim().replace(/^export\s+/i, '').toUpperCase(), value(trimmed.slice(eq + 1)));
  }
  const warnings: string[] = [];
  const only = (values.get('PREREG_ONLY') ?? '').toLowerCase();
  const on = !OFF.has(only);
  if (on && !ON.has(only)) warnings.push(`PREREG_ONLY=${only} is neither true nor false: the lock is on`);
  const allowed = new Set(
    (values.get('PREREG_ALLOWED_ACCOUNTS') ?? '').split(/[\s,;]+/).map((name) => name.toLowerCase()).filter((name) => name !== ''),
  );
  return { on, allowed, warnings };
}

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

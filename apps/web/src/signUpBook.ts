// The pre-registration sign-up cap (docs/2026-11-15-prereg-login.md). While the lock is on, one IP and one browser may
// make at most PREREG_MAX_ACCOUNTS_PER_IP accounts in all, restarts or not. Every account made is kept as one JSON line
// in the sign-ups file (time, account, IP, browser, whether pre-registration was on); the cap is counted from it at the
// start, and the VIP list is made from it (scripts/preregList.ts).

import { appendFileSync, readFileSync } from 'node:fs';
import { PREREG_OFF, parsePreregEnv, type PreregRule } from '@flyffweb/protocol';
import type { Logger } from './log';

export interface SignUpRecord {
  /** ISO time, UTC. */
  time: string;
  account: string;
  ip: string;
  /** The browser's `fw_id` cookie; empty when it sent none. */
  browser: string;
  /** Whether the pre-registration lock was on when the account was made. */
  prereg: boolean;
}

/** The browser cookie: a random ID the web service gives with a sign-up ticket (server.ts). */
export const BROWSER_COOKIE = 'fw_id';
export const BROWSER_ID = /^[A-Za-z0-9_-]{22}$/;

function isRecord(value: unknown): value is SignUpRecord {
  const r = value as Record<string, unknown>;
  return typeof value === 'object' && value !== null && typeof r.time === 'string' && typeof r.account === 'string' &&
    typeof r.ip === 'string' && typeof r.browser === 'string' && typeof r.prereg === 'boolean';
}

/** The records of a sign-ups file's text, oldest first. A line that is not a record (cut short, say) is skipped. */
export function readSignUps(text: string): SignUpRecord[] {
  const records: SignUpRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isRecord(value)) records.push(value);
    } catch {
      // a line cut short by a crash: the rest of the file still counts
    }
  }
  return records;
}

/**
 * The accounts made during pre-registration, by IP and by browser, and the file they are kept in. Places are taken
 * before the database answers (`reserve`) and given back when no account was made (`release`), as the hourly limits do.
 */
export class SignUpBook {
  private readonly byIp = new Map<string, number>();
  private readonly byBrowser = new Map<string, number>();

  /** `file` undefined: nothing is written, and a restart forgets the count. */
  constructor(private readonly file: string | undefined, private readonly log: Logger, records: SignUpRecord[] = []) {
    for (const r of records) if (r.prereg) this.add(r.ip, r.browser, 1);
  }

  /** The book of `file` as it is on disk (none yet: empty), with a log line saying what it holds. */
  static open(file: string | undefined, log: Logger): SignUpBook {
    if (file === undefined) {
      log.warn('signups: not kept (no --signups file given): the pre-registration cap forgets them at a restart');
      return new SignUpBook(undefined, log);
    }
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const records = readSignUps(text);
    log.info(`signups: ${records.length} kept in ${file}, ${records.filter((r) => r.prereg).length} of them during pre-registration`);
    return new SignUpBook(file, log, records);
  }

  /** Which of the two already has `max` accounts (places taken count too): 'ip' first, then 'browser'. */
  full(ip: string, browser: string, max: number): 'ip' | 'browser' | undefined {
    if ((this.byIp.get(ip) ?? 0) >= max) return 'ip';
    if (browser !== '' && (this.byBrowser.get(browser) ?? 0) >= max) return 'browser';
    return undefined;
  }

  /** Takes a place for an account about to be made during pre-registration. */
  reserve(ip: string, browser: string): void {
    this.add(ip, browser, 1);
  }

  /** Gives back a place `reserve` took, when no account was made after all. */
  release(ip: string, browser: string): void {
    this.add(ip, browser, -1);
  }

  /** Keeps an account that was made: one line in the file. A pre-registration one keeps the place it reserved. */
  keep(record: SignUpRecord): void {
    if (this.file === undefined) return;
    try {
      appendFileSync(this.file, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      this.log.warn(`signups: cannot write ${this.file}: ${(error as Error).message}`);
    }
  }

  private add(ip: string, browser: string, step: number): void {
    const change = (map: Map<string, number>, key: string) => {
      const n = (map.get(key) ?? 0) + step;
      if (n > 0) map.set(key, n);
      else map.delete(key);
    };
    change(this.byIp, ip);
    if (browser !== '') change(this.byBrowser, browser);
  }
}

/**
 * The pre-registration settings for the web service: the `.env` file read again at every call (sign-ups are few, so
 * a save counts at once). No path or no file: off. A file that cannot be read for another reason: on, with the
 * default cap, so a file held by an editor never opens the cap. Each change of what it says writes one log line.
 */
export class PreregSettings {
  private lastLine: string | undefined;

  constructor(private readonly path: string | undefined, private readonly log: Logger) {}

  rule(): PreregRule {
    let rule: PreregRule;
    let line: string;
    if (this.path === undefined) {
      rule = PREREG_OFF;
      line = 'prereg: off, no sign-up cap (no --env file given)';
    } else {
      try {
        rule = parsePreregEnv(readFileSync(this.path, 'utf8'));
        line = !rule.on ? `prereg: off, no sign-up cap (${this.path})`
          : rule.maxAccounts === 0 ? `prereg: on, no sign-up cap: PREREG_MAX_ACCOUNTS_PER_IP is 0 (${this.path})`
          : `prereg: on, at most ${rule.maxAccounts} account(s) per IP and per browser (${this.path})`;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
        if (code === 'ENOENT') {
          rule = PREREG_OFF;
          line = `prereg: off, no sign-up cap (no file at ${this.path})`;
        } else {
          rule = { ...PREREG_OFF, on: true };
          line = `prereg: cannot read ${this.path} (${code}): the sign-up cap stays on, ${rule.maxAccounts} per IP and per browser`;
        }
      }
    }
    if (line !== this.lastLine) {
      for (const warning of rule.warnings) this.log.warn(`prereg: ${warning}`);
      this.log.info(line);
      this.lastLine = line;
    }
    return rule;
  }
}

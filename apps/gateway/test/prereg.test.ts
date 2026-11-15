import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PreregLock, parsePreregEnv } from '../src/prereg';

const names = (text: string) => [...parsePreregEnv(text).allowed];

describe('parsePreregEnv', () => {
  it('is off with no PREREG_ONLY line, an empty file, or PREREG_ONLY false', () => {
    for (const text of ['', '# nothing\n', 'PREREG_ALLOWED_ACCOUNTS=a', 'PREREG_ONLY=false', 'PREREG_ONLY=0', 'PREREG_ONLY=off', 'PREREG_ONLY=']) {
      expect(parsePreregEnv(text).on, JSON.stringify(text)).toBe(false);
    }
  });

  it('is on with PREREG_ONLY true, 1, yes or on, in any case', () => {
    for (const value of ['true', 'TRUE', 'True', '1', 'yes', 'on']) {
      expect(parsePreregEnv(`PREREG_ONLY=${value}`)).toMatchObject({ on: true, warnings: [] });
    }
  });

  it('stays on, with a warning, for a PREREG_ONLY that is neither true nor false (a typo never opens the game)', () => {
    expect(parsePreregEnv('PREREG_ONLY=ture')).toMatchObject({
      on: true, warnings: ['PREREG_ONLY=ture is neither true nor false: the lock is on'],
    });
  });

  it('splits the names at commas, trims them and puts them in lower case', () => {
    expect(names('PREREG_ALLOWED_ACCOUNTS= Alice , bob,CAROL ,, dave ')).toEqual(['alice', 'bob', 'carol', 'dave']);
    expect(names('PREREG_ALLOWED_ACCOUNTS=alice; bob carol')).toEqual(['alice', 'bob', 'carol']);
    expect(names('PREREG_ALLOWED_ACCOUNTS=Alice,alice,ALICE')).toEqual(['alice']);
  });

  it('gives an empty list for no line or an empty one: with the lock on, nobody may log in', () => {
    expect(parsePreregEnv('PREREG_ONLY=true')).toMatchObject({ on: true, allowed: new Set() });
    expect(parsePreregEnv('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=')).toMatchObject({ on: true, allowed: new Set() });
  });

  it('reads Windows line ends, a byte-order mark, quotes, comments, spaces around = and keys in any case', () => {
    const text = '﻿# the lock\r\n  prereg_only = "true"  \r\nPREREG_ALLOWED_ACCOUNTS=\'Alice, Bob\'\r\n\r\n';
    expect(parsePreregEnv(text)).toMatchObject({ on: true, allowed: new Set(['alice', 'bob']) });
    expect(parsePreregEnv('PREREG_ONLY=true # until launch\nPREREG_ALLOWED_ACCOUNTS=alice # me')).toMatchObject({
      on: true, allowed: new Set(['alice']),
    });
    expect(parsePreregEnv('export PREREG_ONLY=true').on).toBe(true);
  });

  it('takes the last line of a key, and skips lines without =', () => {
    expect(parsePreregEnv('PREREG_ONLY=true\nPREREG_ONLY=false').on).toBe(false);
    expect(parsePreregEnv('PREREG_ONLY\nPREREG_ONLY=true').on).toBe(true);
  });
});

describe('PreregLock', () => {
  const dirs: string[] = [];
  const locks: PreregLock[] = [];
  afterEach(() => {
    for (const lock of locks.splice(0)) lock.close();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A lock on a file in a new folder, that never polls (the tests call `refresh` or `allows`). */
  function lockOn(text?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'prereg-'));
    dirs.push(dir);
    const path = join(dir, '.env');
    if (text !== undefined) writeFileSync(path, text);
    const logs: string[] = [];
    const lock = new PreregLock(path, { info: (line) => { logs.push(line); } }, 0);
    locks.push(lock);
    return { path, lock, logs };
  }

  /** Writes the file with a time one second later than before, so the change shows whatever the clock's grain. */
  let tick = 0;
  function save(path: string, text: string) {
    writeFileSync(path, text);
    const time = new Date(Date.now() + ++tick * 1000);
    utimesSync(path, time, time);
  }

  it('lets everyone in, and says so, when there is no file', () => {
    const { lock, logs, path } = lockOn();
    expect(lock.allows('anyone')).toBe(true);
    expect(logs).toEqual([`prereg: off, everyone may log in (no file at ${path})`]);
  });

  it('lets in only the listed accounts, in any case, and logs the list once', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=Owner, friend');
    expect(lock.allows('owner')).toBe(true);
    expect(lock.allows('OWNER')).toBe(true);
    expect(lock.allows('Friend')).toBe(true);
    expect(lock.allows('stranger')).toBe(false);
    expect(logs).toEqual([`prereg: on, 2 account(s) may log in: owner, friend (${path})`]);
  });

  it('lets nobody in with the lock on and an empty list', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=');
    expect(lock.allows('owner')).toBe(false);
    expect(logs).toEqual([`prereg: on, nobody may log in: PREREG_ALLOWED_ACCOUNTS is empty (${path})`]);
  });

  it('reads the file again after it is saved, with no restart: a name added, the lock switched off, the file deleted', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=owner');
    expect(lock.allows('newfriend')).toBe(false);

    save(path, 'PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=owner,newfriend');
    expect(lock.allows('newfriend')).toBe(true);

    save(path, 'PREREG_ONLY=false\nPREREG_ALLOWED_ACCOUNTS=owner,newfriend');
    expect(lock.allows('stranger')).toBe(true);

    save(path, 'PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=owner');
    expect(lock.allows('stranger')).toBe(false);
    unlinkSync(path);
    expect(lock.allows('stranger')).toBe(true);

    expect(logs).toEqual([
      `prereg: on, 1 account(s) may log in: owner (${path})`,
      `prereg: on, 2 account(s) may log in: owner, newfriend (${path})`,
      `prereg: off, everyone may log in (${path})`,
      `prereg: on, 1 account(s) may log in: owner (${path})`,
      `prereg: off, everyone may log in (no file at ${path})`,
    ]);
  });

  it('writes no line when a save changes nothing the lock uses', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=owner');
    save(path, `${readFileSync(path, 'utf8')}\n# a comment`);
    lock.refresh();
    expect(logs).toHaveLength(1);
  });

  it('logs the warning of a typo, and keeps the lock on', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=yse\nPREREG_ALLOWED_ACCOUNTS=owner');
    expect(lock.allows('stranger')).toBe(false);
    expect(logs).toEqual([
      'prereg: PREREG_ONLY=yse is neither true nor false: the lock is on',
      `prereg: on, 1 account(s) may log in: owner (${path})`,
    ]);
  });

  it('keeps the last settings, and says so once, while the path cannot be read', () => {
    const { lock, logs, path } = lockOn('PREREG_ONLY=true\nPREREG_ALLOWED_ACCOUNTS=owner');
    // A folder where the file was: stat works, reading fails (EISDIR), like a file an editor holds locked.
    unlinkSync(path);
    mkdirSync(path);
    expect(lock.allows('stranger')).toBe(false);
    expect(lock.allows('owner')).toBe(true);
    expect(logs.slice(1)).toEqual([`prereg: cannot read ${path} (EISDIR); the last settings stay: on`]);
  });
});

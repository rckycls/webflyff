import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileLog } from '../src/log';

describe('fileLog', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('writes one stamped line a call', () => {
    dir = mkdtempSync(join(tmpdir(), 'log-'));
    const file = join(dir, 'bots.log');
    const log = fileLog(file, { echo: false, now: () => new Date('2026-11-20T08:00:00Z') });
    log('abCd entered');
    expect(readFileSync(file, 'utf8')).toBe('2026-11-20 16:00:00 abCd entered\n');
  });

  it('keeps the newer half once the file passes its cap', () => {
    dir = mkdtempSync(join(tmpdir(), 'log-'));
    const file = join(dir, 'bots.log');
    const log = fileLog(file, { echo: false, maxBytes: 2000, keepBytes: 1000 });
    for (let i = 0; i < 100; i++) log(`line ${String(i).padStart(3, '0')} ${'x'.repeat(20)}`);
    expect(statSync(file).size).toBeLessThanOrEqual(2000);
    const text = readFileSync(file, 'utf8');
    expect(text).toContain('line 099');
    expect(text).not.toContain('line 000');
    expect(text.startsWith('20')).toBe(true); // cut at a line's start
  });
});

// 2026-11-19 (VIP perks): the website's 5-minute VIP job (src/vip/vipPerksJob.ts) on the memory stores, which follow
// vip.sql's rules: hand-set letters adopted, letters kept in step with WEB_VIP, character letters reset, gift boxes sent once.
import { describe, expect, it } from 'vitest';
import { runVipPerksJob, VipPerksJob } from '../src/vip/vipPerksJob';
import { MemoryVipCharacters, MemoryVipStore } from './support/memoryVipStore';
import type { MemoryCharacter } from './support/memoryVipStore';

const NOW = Date.UTC(2026, 10, 19, 12);
const log = { lines: [] as string[], info(line: string) { this.lines.push(line); }, warn(line: string) { this.lines.push(`warn: ${line}`); } };
const char = (over: Partial<MemoryCharacter>): MemoryCharacter => ({
  idPlayer: '0000001', account: 'tester1', name: 'Main', letter: 'F', online: false, playTime: 100, deleted: false, ...over,
});

describe('runVipPerksJob', () => {
  it('turns a hand-set character VIP3 letter into 30 days of VIP3, no gift, and the character back to F', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    const characters = new MemoryVipCharacters([char({ letter: 'C' })]);
    const report = await runVipPerksJob({ admin, characters }, log);
    expect(report).toMatchObject({ adopted: 1, letters: 1, cleared: 1, sent: 0 });
    expect(admin.vips.get('tester1')).toEqual({ level: 3, endsAt: NOW + 30 * 86_400_000 });
    expect(admin.letterOf('tester1')).toBe('C');
    expect(characters.rows[0]!.letter).toBe('F');
    expect(admin.giftRows).toEqual([]);
  });

  it('takes the letter away once VIP has ended, and leaves a GM with VIP a GM', async () => {
    let now = NOW;
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }, { account: 'gm1', passwordHash: 'x' }], () => now);
    admin.accountLetters.set('gm1', 'P');
    await admin.give('tester1', 1, 1, false, 'owner');
    await admin.give('gm1', 4, 30, false, 'owner');
    const characters = new MemoryVipCharacters([]);
    await runVipPerksJob({ admin, characters }, log);
    expect([admin.letterOf('tester1'), admin.letterOf('gm1')]).toEqual(['A', 'P']);
    now += 2 * 86_400_000;
    await runVipPerksJob({ admin, characters }, log);
    expect([admin.letterOf('tester1'), admin.letterOf('gm1')]).toEqual(['F', 'P']);
    // an ended VIP has a row: its letter is not adopted again
    expect(admin.vips.get('tester1')!.endsAt).toBeLessThan(now);
  });

  it('keeps a gift unsent while the account has no character, then sends it once one exists', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    await admin.give('tester1', 2, 30, true, 'owner');
    const characters = new MemoryVipCharacters([]);
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ sent: 0, waiting: 1 });
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ sent: 0, waiting: 1 });
    expect(characters.mails).toEqual([]);
    characters.rows.push(char({ name: 'Main' }));
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ sent: 1, waiting: 0 });
    expect(characters.mails.map((m) => [m.itemId, m.count])).toEqual([[10206, 20], [10207, 20], [10208, 20], [4805, 10], [10431, 2]]);
    expect(characters.mails[0]).toMatchObject({ idPlayer: '0000001', title: 'VIP 2 gift', text: 'Thank you for supporting osflyff.online!' });
    expect(admin.giftRows[0]).toMatchObject({ characterName: 'Main', items: '10206x20,10207x20,10208x20,4805x10,10431x2' });
  });

  it('never sends a box twice when marking it sent failed: the next run marks it from the first send', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    await admin.give('tester1', 1, 30, true, 'owner');
    const characters = new MemoryVipCharacters([char({})]);
    admin.failing.add('markGiftSent');
    await runVipPerksJob({ admin, characters }, log);
    expect(characters.mails).toHaveLength(5);
    expect(admin.giftRows[0]!.sentAt).toBeNull();
    admin.failing.delete('markGiftSent');
    await runVipPerksJob({ admin, characters }, log);
    expect(characters.mails).toHaveLength(5);
    expect(admin.giftRows[0]).toMatchObject({ idPlayer: '0000001', characterName: 'Main' });
  });

  it('leaves a gift unsent when its tier has no items, and still runs the other steps when one fails', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    admin.giftItemRows = admin.giftItemRows.filter((i) => i.level !== 3);
    await admin.give('tester1', 3, 30, true, 'owner');
    admin.accountLetters.set('tester1', 'F');
    const characters = new MemoryVipCharacters([char({})]);
    characters.failing.add('characterLetters');
    const report = await runVipPerksJob({ admin, characters }, log);
    expect(report).toMatchObject({ sent: 0, waiting: 1, letters: 1 });
    expect(characters.mails).toEqual([]);
    expect(log.lines.some((l) => l.startsWith('warn: vip job: characterLetters'))).toBe(true);
  });
});

describe('VipPerksJob', () => {
  it('runs the steps once when a run is asked for while one is still going', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    await admin.give('tester1', 1, 30, true, 'owner');
    const characters = new MemoryVipCharacters([char({})]);
    const job = new VipPerksJob({ admin, characters }, log);
    const [first, second] = await Promise.all([job.run(), job.run()]);
    expect([first === undefined, second === undefined].sort()).toEqual([false, true]);
    expect(characters.mails).toHaveLength(5);
  });
});

describe('startVip', () => {
  it('runs the VIP job a minute after start (with the admin section), then every 5 minutes, and stops it on close', async () => {
    const { mkdtempSync } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { vi } = await import('vitest');
    const { startVip } = await import('../src/vip/startVip');
    const { siteView } = await import('./support/memoryVipStore');
    const { testConfig } = await import('./support/adminDeps');
    vi.useFakeTimers();
    try {
      const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
      await admin.give('tester1', 1, 30, true, 'owner');
      const characters = Object.assign(new MemoryVipCharacters([char({})]), { close: async () => {} });
      const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-job-'));
      const lines: string[] = [];
      const on = startVip({ ...testConfig, vip: { uploadsDir: dir, maxPendingPerAccount: 3, deleteRejectedAfterDays: 0 }, vipProblem: undefined },
        { info: (l) => lines.push(l), warn: (l) => lines.push(l) }, () => NOW, { site: () => siteView(admin), admin: () => admin, characters: () => characters });
      await vi.advanceTimersByTimeAsync(59_000);
      expect(characters.mails).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(characters.mails).toHaveLength(5);
      await admin.give('tester1', 1, 30, true, 'owner');
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(characters.mails).toHaveLength(10);
      await on.close();
      await admin.give('tester1', 1, 30, true, 'owner');
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(characters.mails).toHaveLength(10);
    } finally {
      vi.useRealTimers();
    }
  });
});

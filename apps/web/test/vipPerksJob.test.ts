// 2026-11-19 (VIP perks): the website's 5-minute VIP job (src/vip/vipPerksJob.ts) on the memory stores, which follow
// vip.sql's rules: hand-set letters adopted, letters kept in step with WEB_VIP, character letters reset, gift boxes sent once.
import { describe, expect, it } from 'vitest';
import { runVipPerksJob, VipPerksJob } from '../src/vip/vipPerksJob';
import { MemoryCodeStore } from './support/memoryCodeStore';
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

  it('leaves a gift unsent when its tier has no items, and still sends the others when a letter step fails', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    admin.giftItemRows = admin.giftItemRows.filter((i) => i.level !== 3);
    await admin.give('tester1', 3, 30, true, 'owner');
    admin.accountLetters.set('tester1', 'F');
    const characters = new MemoryVipCharacters([char({})]);
    characters.failing.add('characterLetters');
    const report = await runVipPerksJob({ admin, characters }, log);
    expect(report).toMatchObject({ sent: 0, waiting: 1 });
    expect(characters.mails).toEqual([]);
    expect(log.lines.some((l) => l.startsWith('warn: vip job: characterLetters'))).toBe(true);
  });

  // --- the final review's fixes (2026-11-19) ---------------------------------------------------------------------------

  it('never stalls behind gifts that wait: one run reaches a gift after more than a page of waiting ones', async () => {
    const players = Array.from({ length: 56 }, (_, i) => ({ account: i === 55 ? 'tester1' : `wait${i}`, passwordHash: 'x' }));
    const admin = new MemoryVipStore(players, () => NOW);
    for (const p of players) await admin.give(p.account, 1, 30, true, 'owner');
    const characters = new MemoryVipCharacters([char({ account: 'tester1' })]);
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ sent: 1, waiting: 55 });
    expect(characters.mails).toHaveLength(5);
  });

  it('skips the letter changes in a run where finding the hand-set letters failed, so no star is lost', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    const characters = new MemoryVipCharacters([char({ letter: 'C' })]);
    characters.failing.add('characterLetters');
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ adopted: 0, letters: 0, cleared: 0 });
    expect(characters.rows[0]!.letter).toBe('C');
    characters.failing.delete('characterLetters');
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ adopted: 1, letters: 1, cleared: 1 });
    expect(admin.letterOf('tester1')).toBe('C');
  });

  it('adopts a hand-set letter once: a VIP row the owner deletes is not brought back', async () => {
    const admin = new MemoryVipStore([{ account: 'Tester1', passwordHash: 'x' }], () => NOW);
    admin.accountLetters.set('tester1', 'B');
    const characters = new MemoryVipCharacters([]);
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ adopted: 1 });
    expect(admin.auditRows.find((r) => r.action === 'vip.adopt')?.account).toBe('Tester1');
    admin.vips.delete('tester1');
    expect(await runVipPerksJob({ admin, characters }, log)).toMatchObject({ adopted: 0, letters: 1 });
    expect(admin.letterOf('tester1')).toBe('F');
  });
});

describe('runVipPerksJob with redeem codes (2026-11-20)', () => {
  it('sends the code uses still waiting, and still sends the gift boxes when the code step fails', async () => {
    const admin = new MemoryVipStore([{ account: 'tester1', passwordHash: 'x' }], () => NOW);
    const codes = new MemoryCodeStore(admin, [{ account: 'tester1', idPlayer: '0000001', name: 'Main' }], () => NOW);
    await codes.add({
      label: 'Launch', kind: 'E', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: '2026-12-01T00:00:00Z',
      items: [{ itemId: 10206, count: 5 }], keys: ['WELCOME2026'], accounts: [], admin: 'owner',
    });
    await codes.redeem({ account: 'tester1', key: 'WELCOME2026', requestId: 'r1', idPlayer: '0000001', characterName: 'Main', address: '203.0.113.5', confirm: false });
    const characters = new MemoryVipCharacters([char({})]);
    expect(await runVipPerksJob({ admin, characters, codes: { admin: codes, mail: codes } }, log)).toMatchObject({ codesSent: 1, codesWaiting: 0 });
    await admin.give('tester1', 1, 30, true, 'owner');
    codes.failing.add('pending');
    expect(await runVipPerksJob({ admin, characters, codes: { admin: codes, mail: codes } }, log)).toMatchObject({ sent: 1, codesSent: 0 });
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

  it('gives the panel the code store and the job the code uses (2026-11-20), with the admin section only', async () => {
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
      const codes = Object.assign(new MemoryCodeStore(admin, [{ account: 'tester1', idPlayer: '0000001', name: 'Main' }], () => NOW), { close: async () => {} });
      await codes.add({
        label: 'Launch', kind: 'E', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: '2026-12-01T00:00:00Z',
        items: [{ itemId: 10206, count: 5 }], keys: ['WELCOME2026'], accounts: [], admin: 'owner',
      });
      await codes.redeem({ account: 'tester1', key: 'WELCOME2026', requestId: 'r1', idPlayer: '0000001', characterName: 'Main', address: '203.0.113.5', confirm: false });
      const characters = Object.assign(new MemoryVipCharacters([char({})]), { close: async () => {} });
      const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-codes-'));
      const stores = { site: () => siteView(admin), admin: () => admin, characters: () => characters, codeSite: () => codes, codeAdmin: () => codes, codeMail: () => codes };
      const log = { info: () => {}, warn: () => {} };
      const vipSection = { uploadsDir: dir, maxPendingPerAccount: 3, deleteRejectedAfterDays: 0 };
      const on = startVip({ ...testConfig, vip: vipSection, vipProblem: undefined }, log, () => NOW, stores);
      expect(on.admin?.codes).toBe(codes);
      await vi.advanceTimersByTimeAsync(61_000);
      expect(codes.mails).toHaveLength(1);
      await on.close();
      const noAdmin = startVip({ ...testConfig, admin: undefined, vip: vipSection, vipProblem: undefined }, log, () => NOW, stores);
      expect(noAdmin.admin).toBeUndefined();
      await noAdmin.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

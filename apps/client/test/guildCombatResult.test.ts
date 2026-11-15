// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, B6): the result window and Donaris's ranking window (hud/guildCombat/resultWindow.ts, rankingWindow.ts;
// A-client.md §2.9, §2.10; Neuz DPClient.cpp:7254-7513, WndField.cpp:17690-18200).
import { describe, expect, it } from 'vitest';
import type { GuildCombatLogEntry } from '@flyffweb/protocol';
import type { UiArt } from '../src/world/hud/art';
import { GuildCombatBook } from '../src/world/guildCombat/guildCombatBook';
import { ResultWindow, logLines, resultRows } from '../src/world/hud/guildCombat/resultWindow';
import type { ResultContext } from '../src/world/hud/guildCombat/resultWindow';
import { RankingWindow, rankTabs } from '../src/world/hud/guildCombat/rankingWindow';

const art: UiArt = { url: () => '', sheets: null };
const T = 'guildCombat' as const;
const NAMES: Record<number, string> = { 1: 'Alice', 2: 'Bob', 3: 'Christopher-Long', 4: 'Dee', 5: 'Eve' };
const GUILDS: Record<number, string> = { 10: 'Alpha', 20: 'Bravo' };
const TEXTS: Record<string, string> = {
  TID_GAME_GC_LOG_GUILD: '[%s]', TID_GAME_GC_LOG_POINT: '(%d grade)', TID_GAME_GC_LOG_MASTER: '[Guild Master]', TID_GAME_GC_LOG_DEFENDER: '[Defender]',
  TID_GAME_ATTACK: 'Attack', TID_GAME_GC_LOG1: 'Basic Point +2', TID_GAME_GC_LOG2: 'Guild Master Bonus +1', TID_GAME_GC_LOG3: 'Defender Bonus +1',
  TID_GAME_GC_LOG4: 'Kill bonus +1', TID_GAME_GC_LOG5: 'Resurrecting Bonus +1',
};
const ctx = (over: Partial<ResultContext> = {}): ResultContext => ({
  playerName: (id) => NAMES[id] ?? '', guildName: (id) => GUILDS[id] ?? '', guildMasterId: (id) => (id === 10 ? 8 : id === 20 ? 9 : 0),
  ownPlayerId: 4, text: (tid) => TEXTS[tid] ?? '', ...over,
});
const entry = (over: Partial<GuildCombatLogEntry> = {}): GuildCombatLogEntry => ({
  atkGuildId: 10, defGuildId: 20, atkPlayerId: 5, defPlayerId: 2, point: 2, diffGuild: false, master: false, defender: false, lastLife: false, ...over,
});

describe('resultRows', () => {
  it('formats the guild and member rows, WINNER on rank 1, MVP, ties blank, long names cut', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'guildPrecedence', guilds: [{ has: true, name: 'Bravo', points: 4 }, { has: false }, { has: true, name: 'AlphaAlphaAlpha', points: 9 }, { has: true, name: 'Zed', points: 4 }] }, 0);
    book.apply({ type: T, sub: 'playerPrecedence', guilds: [[{ playerId: 1, points: 6 }, { playerId: 3, points: 6 }], [{ playerId: 2, points: 1 }, { playerId: 99, points: 0 }]] }, 0);
    book.apply({ type: T, sub: 'bestPlayer', playerId: 1 }, 0);
    const rows = resultRows(book, (id) => NAMES[id] ?? '');
    expect(rows.guilds).toEqual([' 1   AlphaAlpha...\t(9) WINNER', ' 2   Zed\t(4)', '     Bravo\t(4)']);
    // of equal points the later entry first (the multimap's reverse walk); the MVP mark only on a counted first row
    expect(rows.players).toEqual([' 1   Christophe...\t(6)', '     Alice\t(6)', ' 2   Bob\t(1)', ' 3   ?\t(0)']);
  });

  it('marks the MVP when it leads its points', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'playerPrecedence', guilds: [[{ playerId: 1, points: 8 }, { playerId: 2, points: 3 }]] }, 0);
    book.apply({ type: T, sub: 'bestPlayer', playerId: 1 }, 0);
    expect(resultRows(book, (id) => NAMES[id] ?? '').players).toEqual([' 1   Alice\t(8) MVP', ' 2   Bob\t(3)']);
  });
});

describe('logLines', () => {
  it('writes the kill line and the bonus line, then a blank one', () => {
    const lines = logLines(entry({ diffGuild: true, lastLife: true }), 0, ctx());
    expect(lines).toEqual([
      '[Alpha]  Eve(2 grade) Attack → [Bravo]  Bob', '< Basic Point +2, Kill bonus +1, Resurrecting Bonus +1 >', '',
    ]);
  });

  it('names the guild masters and the defender', () => {
    const lines = logLines(entry({ atkPlayerId: 1, defPlayerId: 2, master: true, defender: true }), 0, ctx({ guildMasterId: (id) => (id === 10 ? 1 : 0) }));
    expect(lines[0]).toBe('[Alpha] [Guild Master] Alice(2 grade) Attack → [Bravo] [Defender] Bob');
    expect(lines[1]).toBe('< Basic Point +2, Guild Master Bonus +1, Defender Bonus +1 >');
  });

  it("colours the own kills green and the own guild's deaths red", () => {
    expect(logLines(entry({ atkPlayerId: 4 }), 0, ctx())[0]).toMatch(/^#cff009c00\[Alpha\] {2}Dee\(2 grade\)#nc Attack/);
    expect(logLines(entry(), 10, ctx())[0]).toMatch(/^#cff009c00\[Alpha\]/);
    expect(logLines(entry(), 20, ctx())[0]).toBe('[Alpha]  Eve(2 grade) Attack → #cff9c0000[Bravo]  Bob#nc');
  });

  it('shows ? for an unknown guild or player', () => {
    const lines = logLines(entry({ atkGuildId: 55, defPlayerId: 77 }), 10, ctx());
    expect(lines[0]).toContain('[?]');
    expect(lines[0]).toMatch(/ \?$/);
  });
});

describe('rankTabs', () => {
  const jobs = { 1: { title: 'Mercenary' }, 6: { title: 'Knight' }, 8: { title: 'Jester' } };
  it('makes 5 tabs by job line, highest first, ties sharing a rank, vagrants and puppeteers left out', () => {
    const tabs = rankTabs([
      { playerId: 1, job: 6, point: 5 }, { playerId: 2, job: 8, point: 9 }, { playerId: 3, job: 0, point: 50 },
      { playerId: 4, job: 24, point: 5 }, { playerId: 5, job: 12, point: 1 }, { playerId: 6, job: 5, point: 40 },
    ], jobs);
    expect(tabs).toHaveLength(5);
    expect(tabs[0]!.map((r) => [r.playerId, r.rank, r.shared])).toEqual([[2, 1, false], [4, 2, false], [1, 2, true], [5, 3, false]]);
    expect(tabs[1]!.map((r) => r.playerId)).toEqual([4, 1]); // Mercenary: the hero, the Knight
    expect(tabs[2]!.map((r) => r.playerId)).toEqual([5]); // Magician
    expect(tabs[3]!.map((r) => r.playerId)).toEqual([2]); // Acrobat
    expect(tabs[4]).toEqual([]); // Assist
    expect(tabs[0]![0]!.jobName).toBe('Jester');
  });

  it('keeps 100 rows a tab at most', () => {
    const many = Array.from({ length: 130 }, (_, i) => ({ playerId: i + 1, job: 6, point: 1000 - i }));
    const tabs = rankTabs(many, jobs);
    expect(tabs[0]).toHaveLength(100);
    expect(tabs[1]).toHaveLength(100);
    expect(tabs[0]![0]!.point).toBe(1000);
    expect(tabs[0]![99]!.point).toBe(901);
  });
});

describe('ResultWindow', () => {
  it('opens with the log and Save downloads GuildLog_YYYYMMDD.txt, then says so', () => {
    const book = new GuildCombatBook();
    book.apply({ type: T, sub: 'log', entries: [entry({ atkPlayerId: 1 })] }, 0);
    const saved: Array<[string, string]> = [];
    const boxes: string[] = [];
    const w = new ResultWindow('Guild & Member Ranking', art, {
      book, context: () => ctx(), ownGuildId: () => 0, save: (name, text) => saved.push([name, text]), box: (t) => boxes.push(t),
      saveText: () => 'Log was saved to %s file', now: () => new Date(2026, 10, 5),
    }, document);
    document.body.append(w.element);
    w.open();
    expect(w.isOpen).toBe(true);
    expect(w.element.textContent).toContain('Alice(2 grade) Attack');
    (w.element.querySelector('[data-control="WIDC_BUTTON1"]') as HTMLElement).click();
    expect(saved).toHaveLength(1);
    expect(saved[0]![0]).toBe('GuildLog_20261105.txt');
    expect(saved[0]![1]).toContain('[Alpha]  Alice(2 grade) Attack → [Bravo]  Bob\r\n< Basic Point +2 >\r\n\r\n');
    expect(saved[0]![1]).not.toContain('#c');
    expect(boxes).toEqual(['Log was saved to GuildLog_20261105.txt file']);
  });
});

describe('RankingWindow', () => {
  it('shows the 5 tabs, the first row red, the own row repeated in blue, ? for an unknown name', () => {
    const w = new RankingWindow('Guild Member Ranking', art, {
      playerName: (id) => NAMES[id] ?? '', ownPlayerId: () => 4, jobs: () => ({ 6: { title: 'Knight' } }), text: () => '',
    }, document);
    document.body.append(w.element);
    w.open([{ playerId: 1, job: 6, point: 9 }, { playerId: 4, job: 6, point: 3 }, { playerId: 99, job: 6, point: 1 }]);
    const first = w.element.querySelector('.hud-gc-rank-row.is-first')!;
    expect([...first.querySelectorAll('span')].map((s) => s.textContent!.trim())).toEqual(['1', 'Alice', 'Knight', '9']);
    expect(w.element.querySelector('.hud-gc-rank-own')!.textContent).toContain('Dee');
    expect(w.element.querySelectorAll('.hud-gc-rank-row')).toHaveLength(3);
    expect(w.element.textContent).toContain('?');
    expect([...w.element.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['United Rank', 'Mercenary', 'Magician', 'Acrobat', 'Assist']);
  });
});

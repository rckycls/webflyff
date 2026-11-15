// @vitest-environment jsdom
// 2026-11-15 (Guild Siege, C2): the owner's Siege Ranking window (hud/guildCombat/siegeRankingWindow.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { SiegeRankingWindow } from '../src/world/hud/guildCombat/siegeRankingWindow';
import type { SiegeRankRow } from '../src/world/guildCombat/siegeWebApi';

const art: UiArt = { url: () => '', sheets: null };
afterEach(() => { document.body.replaceChildren(); });

const PLAYERS: SiegeRankRow[] = [
  { rank: 1, name: 'Zed', job: 1, guild: 'Alpha', points: 90 },
  { rank: 2, name: 'Rocky', job: 4, guild: 'Bravo', points: 50 },
];
const GUILDS: SiegeRankRow[] = [
  { rank: 1, name: 'Alpha', wins: 3, sieges: 5, points: 300 },
  { rank: 2, name: 'Bravo', wins: 1, sieges: 5, points: 100 },
];

function rig(answer: (board: string, span: string) => SiegeRankRow[] | null = (b) => (b === 'player' ? PLAYERS : GUILDS)) {
  const load = vi.fn(async (board: 'player' | 'guild', span: 'week' | 'all') => answer(board, span));
  const w = new SiegeRankingWindow(art, {
    load, ownName: () => 'Rocky', ownGuildName: () => 'Bravo', jobs: () => ({ 1: { title: 'Mercenary' }, 4: { title: 'Magician' } }),
  }, document);
  document.body.append(w.element);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const rows = () => [...w.element.querySelectorAll<HTMLElement>('.hud-gc-page:not([hidden]) .hud-sr-row')];
  const cells = (row: HTMLElement) => [...row.children].map((c) => c.textContent);
  const press = (name: string) => [...w.element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === name)!.click();
  return { w, load, flush, rows, cells, press };
}

describe('SiegeRankingWindow', () => {
  it('opens on Individual / This week with rank, name, job, guild and points', async () => {
    const { w, load, flush, rows, cells } = rig();
    w.open();
    await flush();
    expect(load).toHaveBeenCalledWith('player', 'week');
    expect(rows().map(cells)).toEqual([['  1', 'Zed', 'Mercenary', 'Alpha', '90'], ['  2', 'Rocky', 'Magician', 'Bravo', '50']]);
    expect(rows()[0]!.classList.contains('is-first')).toBe(true);
  });

  it('open("guild") shows the Guild tab: rank, guild, wins, sieges, points', async () => {
    const { w, flush, rows, cells } = rig();
    w.open('guild');
    await flush();
    expect(rows().map(cells)).toEqual([['  1', 'Alpha', '3', '5', '300'], ['  2', 'Bravo', '1', '5', '100']]);
  });

  it('switching tab or span loads that board once (the shared cache reuses it)', async () => {
    const { w, load, flush, press } = rig();
    w.open();
    await flush();
    press('Guild'); await flush();
    press('All time'); await flush();
    press('Individual'); await flush();
    expect(load.mock.calls).toEqual([['player', 'week'], ['guild', 'week'], ['guild', 'all'], ['player', 'all']]);
  });

  it('the own name (Individual) or the own guild (Guild) row is blue', async () => {
    const { w, flush, rows, press } = rig();
    w.open();
    await flush();
    expect(rows().map((r) => r.classList.contains('is-own'))).toEqual([false, true]);
    press('Guild'); await flush();
    expect(rows().map((r) => r.classList.contains('is-own'))).toEqual([false, true]);
  });

  it('a 503 or a time-out shows Not available', async () => {
    const { w, flush, rows } = rig(() => null);
    w.open();
    await flush();
    expect(rows()).toHaveLength(0);
    expect(w.element.querySelector('.hud-gc-page:not([hidden]) .hud-sr-note')!.textContent).toBe('Not available');
  });
});

// @vitest-environment jsdom
// 2026-11-11: layered boss HP, a server addition (HP_LAYER 0x9A00): the bars a monster has left, kept by WorldState
// (CDPClient::OnHpLayer) and drawn as "xN" right of the target bar's gauge (the rebuilt Neuz's RenderSelectObj).

import { describe, expect, it } from 'vitest';
import { AttackFlag } from '@flyffweb/protocol';
import type { WorldMessage } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import type { UiArt } from '../src/world/hud/art';
import { TargetBar, barShade, behindShade, targetBarsText } from '../src/world/hud/targetBar';
import { terrainGround } from '../src/world/sim/collision';
import { Belli } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';
import type { Mover } from '../src/world/WorldState';
import { addedNpc, addedPlayer, gameDataOf, webMoverOf } from './helpers/movers';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const AIBATT = 20;
const BOSS = 0x2001;
const PLAYER = 9;
const data = gameDataOf({
  movers: new Map([[AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', level: 1, addHp: 120, belligerence: Belli.CAUTIOUSATTACK })]]),
});

const layer = (bars: number, barsMax: number, barMaxHp: number, hp: number): WorldMessage =>
  ({ type: 'hpLayer', bars, barsMax, barMaxHp, hp });
const damage = (hit: number): WorldMessage => ({ type: 'damage', attackerId: PLAYER, hit, flags: AttackFlag.GENERIC, fly: null });

function world(): { world: WorldState; boss: () => Mover } {
  const w = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0));
  w.apply(BOSS, { type: 'addMover', mover: addedNpc(BOSS, AIBATT, {}, { hitPoint: 120 }) });
  return { world: w, boss: () => w.movers.get(BOSS)! };
}

describe('WorldState: HP_LAYER (CDPClient::OnHpLayer)', () => {
  it('a monster has no bars until the server says; then the bars, the server\'s bar max and the HP', () => {
    const { world: w, boss } = world();
    expect(boss().hpBars).toBeUndefined();
    expect([boss().hp, boss().maxHp]).toEqual([120, 120]);
    w.apply(BOSS, layer(5, 5, 150, 150));
    expect(boss().hpBars).toEqual({ left: 5, max: 5 });
    expect([boss().hp, boss().maxHp]).toEqual([150, 150]);
  });

  it('a hit past the bar: DAMAGE leaves 1 (a hit never kills), then the layer packet puts the next bar\'s HP', () => {
    const { world: w, boss } = world();
    w.apply(BOSS, layer(3, 3, 120, 120));
    w.apply(BOSS, damage(50));
    expect([boss().hp, boss().hpBars?.left]).toEqual([70, 3]);
    // the exact bar: 70 of 70, then a full next bar
    w.apply(BOSS, damage(70));
    expect(boss().hp).toBe(1);
    w.apply(BOSS, layer(2, 3, 120, 120));
    expect([boss().hp, boss().hpBars?.left]).toEqual([120, 2]);
    // a reset gives every bar back
    w.apply(BOSS, layer(3, 3, 120, 120));
    expect(boss().hpBars).toEqual({ left: 3, max: 3 });
  });

  it('one bar at spawn drops the bars; a player is never given any', () => {
    const { world: w, boss } = world();
    w.apply(BOSS, layer(2, 2, 120, 60));
    expect(boss().hpBars).toEqual({ left: 2, max: 2 });
    w.apply(BOSS, layer(1, 1, 120, 60));
    expect(boss().hpBars).toBeUndefined();
    w.apply(PLAYER, { type: 'addMover', mover: addedPlayer(PLAYER, { name: 'Bob' }) });
    w.apply(PLAYER, layer(3, 3, 120, 60));
    expect(w.movers.get(PLAYER)?.hpBars).toBeUndefined();
  });
});

describe('TargetBar: "xN" (layered boss HP)', () => {
  it('shows the bars left beside the gauge, x1 on the last bar, and nothing for a normal monster', () => {
    const { world: w, boss } = world();
    const bar = new TargetBar(art, data.movers);
    document.body.append(bar.element);
    const bars = bar.element.querySelector<HTMLElement>('.hud-target-bars')!;
    const info = bar.element.querySelector<HTMLElement>('.hud-target-info')!;
    bar.update(boss(), 1, new Map());
    expect(bars.hidden).toBe(true);
    expect(targetBarsText(boss())).toBe('');

    w.apply(BOSS, layer(4, 5, 120, 30));
    bar.update(boss(), 1, new Map());
    expect([bars.hidden, bars.textContent, info.textContent]).toEqual([false, 'x4', '30 / 120']);
    expect(bars.style.left).toBe('206px');
    w.apply(BOSS, layer(1, 5, 120, 120));
    bar.update(boss(), 1, new Map());
    expect(bars.textContent).toBe('x1');
  });
});

// 2026-11-20 (owner): each bar its own shade, Neuz's red on the first to white on the last, the next bar's shade behind.
describe('TargetBar: bar shades (layered boss HP)', () => {
  it('goes from the fill red on the first bar to white on the last, alpha 128 to 230', () => {
    expect(barShade(5, 5)).toBe(0x80ff0f0f);
    expect(barShade(4, 5)).toBe(0x9aff4b4b);
    expect(barShade(3, 5)).toBe(0xb3ff8787);
    expect(barShade(1, 5)).toBe(0xe6ffffff);
    expect([barShade(2, 2), barShade(1, 2)]).toEqual([0x80ff0f0f, 0xe6ffffff]);
  });

  it('keeps a bad bar count inside the bars', () => {
    expect(barShade(0, 5)).toBe(barShade(1, 5));
    expect(barShade(9, 5)).toBe(barShade(5, 5));
  });

  it('puts the next bar behind, dark grey behind the last, nothing for one bar', () => {
    expect(behindShade(5, 5)).toBe(barShade(4, 5));
    expect(behindShade(2, 3)).toBe(0xe6ffffff);
    expect(behindShade(1, 5)).toBe(0xc8404040);
    expect(behindShade(1, 1)).toBeNull();
  });

  it('colours the fill and the gauge behind it per frame, and a normal monster keeps the plain red', () => {
    const { world: w, boss } = world();
    const bar = new TargetBar(art, data.movers);
    document.body.append(bar.element);
    const gauge = (name: string) => bar.element.querySelector<HTMLElement>(`[data-gauge="${name}"]`)!;
    const look = (name: string) => {
      const el = gauge(name);
      return [el.hidden, el.style.opacity, (el.firstElementChild as HTMLElement).style.backgroundColor];
    };
    w.apply(BOSS, layer(3, 3, 120, 60));
    bar.update(boss(), 1, new Map());
    expect(look('target')).toEqual([false, String(128 / 255), 'rgb(255, 15, 15)']);
    expect(look('target-next')).toEqual([false, String(0xb3 / 255), 'rgb(255, 135, 135)']);
    expect(gauge('target-next').dataset.width).toBe('200');
    // the order: the empty gauge, the next bar, then the fill over both
    const order = [...bar.element.querySelectorAll<HTMLElement>('[data-gauge]')].map((el) => el.dataset.gauge);
    expect(order).toEqual(['target-empty', 'target-next', 'target']);

    w.apply(BOSS, layer(1, 3, 120, 60));
    bar.update(boss(), 1, new Map());
    expect(look('target')).toEqual([false, String(0xe6 / 255), 'rgb(255, 255, 255)']);
    expect(look('target-next')).toEqual([false, String(0xc8 / 255), 'rgb(64, 64, 64)']);

    // one bar at spawn (no hpBars): Neuz's look, nothing behind
    w.apply(BOSS, layer(1, 1, 120, 60));
    bar.update(boss(), 1, new Map());
    expect(look('target')).toEqual([false, String(128 / 255), 'rgb(255, 15, 15)']);
    expect(gauge('target-next').hidden).toBe(true);
  });
});

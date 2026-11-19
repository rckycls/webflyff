// @vitest-environment jsdom
// 2026-11-19 (VIP perks): an NPC shop shows a VIP the price the World server charges (patch 2026-11-19-vip-perks,
// OnBuyItem): 5/10/15/20% off the penya price, never on Perin or when it would reach the buy-back, with the purchase tax
// still worked out on the full price. Chip vendors are unchanged.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import type { ClientText } from '../src/world/gameData';
import { setTooltipWorld } from '../src/world/hud/itemDetails';
import { ShopWindow } from '../src/world/hud/shopWindow';
import { itemTooltip } from '../src/world/items/itemTooltip';
import type { TooltipContext, TooltipLine } from '../src/world/items/itemTooltip';
import { itemProp, newVagrant, ownGameData } from './helpers/ownState';

const TEXTS: Record<string, string> = {
  TID_GAME_TOOLTIP_COST2: 'Price : %s', TID_GAME_TOOLTIP_SHELLCOST2: 'Selling Price : %s', TID_GAME_TAX_RATE: 'Before tax price : %s',
  TID_GAME_REDCHIP: 'Red Chip',
};
const texts = new Map<string, ClientText>(Object.entries(TEXTS).map(([id, text]) => [id, { id, text, color: 0xffffffff }]));
const DATA = { texts, itemProps: new Map() };
const item = (itemId: number): InventoryItem => ({ objectId: 1, itemId, count: 1 });
const textOf = (lines: TooltipLine[]): string[] => lines.map((line) => line.map((run) => run.text).join(''));
const POTION = itemProp({ id: 802, name: 'Potion', kind1: 3, kind2: 12, kind3: 30, part: -1, cost: 1000 });
const PERIN = itemProp({ id: 26456, name: 'Perin', kind1: 3, kind2: 15, kind3: 30, part: -1, cost: 100_000_000 });
const shop = (over: Partial<TooltipContext> = {}): TooltipContext => ({ flag: 'shop', viewer: null, ...over });

afterEach(() => setTooltipWorld({}));

describe('the shop tooltip', () => {
  it('shows a VIP4 20% off, and the full price to a player', () => {
    expect(textOf(itemTooltip(item(802), POTION, DATA, shop({ vipLevel: 4 }))).at(-1)).toBe('Price : 800');
    expect(textOf(itemTooltip(item(802), POTION, DATA, shop({ vipLevel: 1 }))).at(-1)).toBe('Price : 950');
    expect(textOf(itemTooltip(item(802), POTION, DATA, shop())).at(-1)).toBe('Price : 1,000');
  });

  it('adds the purchase tax on the full price, and shows the VIP price before tax', () => {
    const tax = { purchase: 0.1, sales: 0.1 };
    expect(textOf(itemTooltip(item(802), POTION, DATA, shop({ vipLevel: 4, tax }))).slice(-2)).toEqual(['Price : 900', 'Before tax price : 800']);
  });

  it('never discounts Perin, nor a chip vendor\'s price', () => {
    expect(textOf(itemTooltip(item(26456), PERIN, DATA, shop({ vipLevel: 4 }))).at(-1)).toBe('Price : 100,000,000');
    const box = itemProp({ id: 26499, name: 'Box', kind1: 3, kind2: 15, kind3: 30, part: -1, cost: 4, referValue1: 10000 });
    expect(textOf(itemTooltip(item(26499), box, DATA, shop({ vipLevel: 4, chipVendor: true }))).at(-1)).toBe('Price : 10,000 Red Chip');
  });
});

describe('the shop window', () => {
  const open = (vipLevel: number): ShopWindow => {
    setTooltipWorld({ vipLevel: () => vipLevel });
    const own = newVagrant(), data = ownGameData(); own.gold = 10_000;
    data.itemProps.set(2800, { ...itemProp({ id: 2800, part: -1, packMax: 99 }), cost: 1000 });
    const ui = new ShopWindow({ url: () => '', sheets: null }, data, () => own, () => true, { open: vi.fn(), close: vi.fn(), buy: vi.fn(), sell: vi.fn() });
    document.body.append(ui.frame.element); ui.open(7, 'Luda');
    ui.receive(7, [[{ objectId: 1, itemId: 2800, count: 99 }], [], [], []]);
    ui.frame.element.querySelector<HTMLButtonElement>('[data-stock-id="1"]')!.click();
    return ui;
  };

  it('puts the VIP price in the price box', () => {
    const vip = open(4);
    expect(vip.frame.element.querySelector('output')!.textContent).toBe('800');
    vip.dispose();
    const player = open(0);
    expect(player.frame.element.querySelector('output')!.textContent).toBe('1000');
    player.dispose();
  });
});

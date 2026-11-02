// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { NearbyItems } from '../src/world/items/nearbyItems';
import { ownGameData } from './helpers/ownState';
import type { GroundItem } from '@flyffweb/protocol';

it('lists known drops inside five metres and keeps buttons stable until they leave', () => {
  const pick = vi.fn(), data = ownGameData();
  const ui = new NearbyItems(data, { url: () => '', sheets: null }, pick);
  const item: GroundItem = { index: 21, pos: [3, 0, 0], angle: 0, scale: 1, item: { objectId: 0, itemId: 21, count: 2 } };
  const items = new Map([[90, item], [91, { ...item, pos: [6, 0, 0] as [number, number, number] }]]);
  ui.update(items, [0, 0, 0]);
  expect(ui.element.hidden).toBe(false);
  const row = ui.element.querySelector<HTMLButtonElement>('button')!;
  expect(row.textContent).toContain('Wooden Sword'); expect(row.textContent).toContain('×2');
  ui.update(items, [0.1, 0, 0]);
  expect(ui.element.querySelector('button')).toBe(row);
  row.click(); expect(pick).toHaveBeenCalledWith(90);
  items.delete(90); ui.update(items, [0, 0, 0]);
  expect(ui.element.hidden).toBe(true);
  ui.dispose();
});

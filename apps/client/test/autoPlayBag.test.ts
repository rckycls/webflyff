import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { bagIsFull } from '../src/world/autoplay/bag';

const NULL_ID = 0xffffffff;
const item = (objectId: number): [number, InventoryItem] => [objectId, { objectId, itemId: 1, count: 1 }];

describe('bagIsFull (custom, owner 2026-11-15)', () => {
  it('full when each of the 42 bag positions holds an item; the worn slots after them do not count', () => {
    const inv = new Map(Array.from({ length: 42 }, (_, i) => item(i)));
    const slots = [...Array.from({ length: 42 }, (_, i) => i), NULL_ID, NULL_ID];
    expect(bagIsFull(inv, slots)).toBe(true);
    slots[5] = NULL_ID;
    expect(bagIsFull(inv, slots)).toBe(false);
  });

  it('a position naming an object the bag lacks is free; no bag → not full', () => {
    const inv = new Map(Array.from({ length: 41 }, (_, i) => item(i)));
    expect(bagIsFull(inv, Array.from({ length: 42 }, (_, i) => i))).toBe(false);
    expect(bagIsFull(null, [])).toBe(false);
  });
});

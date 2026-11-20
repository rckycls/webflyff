// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@flyffweb/protocol';
import { DropWindows, dropStart, keptCount } from '../src/world/hud/dropWindows';
import { itemProp } from './helpers/ownState';

const art = { url: () => '', sheets: null };

describe('the V15 ground-drop boxes (2026-11-20, mouse-drag-ui)', () => {
  it("follows CWndWorld::OnDropIcon's checks in order", () => {
    const stack: InventoryItem = { objectId: 1, itemId: 10, count: 5 };
    expect(dropStart(stack, itemProp({ id: 10 }), false)).toEqual({ kind: 'count' });
    expect(dropStart({ ...stack, count: 1 }, itemProp({ id: 10 }), false)).toEqual({ kind: 'confirm' });
    expect(dropStart(stack, itemProp({ id: 10, kind3: 43 }), false)).toEqual({ kind: 'quest' });
    expect(dropStart({ ...stack, guildId: 3 }, itemProp({ id: 10, kind3: 24 }), false)).toEqual({ kind: 'none' });
    expect(dropStart({ ...stack, charged: 1 }, itemProp({ id: 10 }), false)).toEqual({ kind: 'say', tid: 'TID_GAME_NOTDROP' });
    expect(dropStart({ ...stack, resistSMItemId: 7 }, itemProp({ id: 10 }), false)).toEqual({ kind: 'say', tid: 'TID_GAME_NOTDROP' });
    expect(dropStart(stack, itemProp({ id: 10 }), true)).toEqual({ kind: 'none' });
    expect(dropStart(stack, itemProp({ id: 10, flag: 2 }), false)).toEqual({ kind: 'say', tid: 'TID_GAME_ERROR_UNDESTRUCTABLE_ITEM' });
  });

  it('keeps the count box to the stack (CWndDropItem::OnDraw)', () => {
    expect(keptCount('3', 5)).toBe('3');
    expect(keptCount('9', 5)).toBe('5');
    expect(keptCount('2a', 5)).toBe('5');
    expect(keptCount('', 5)).toBe('');
    expect(keptCount('4', 1)).toBe('1');
  });

  it('opens the count box with the whole stack, sends what OK reads, and goes when the item is in use', () => {
    const boxes = new DropWindows(art);
    let item: InventoryItem | undefined = { objectId: 1, itemId: 10, count: 5 };
    let inUse = false;
    const send = vi.fn();
    const target = { item: () => item, inUse: () => inUse, send, questText: () => 'Quest words' };
    boxes.start('count', target, document.body);
    const box = document.querySelector<HTMLElement>('.hud-drop-item')!;
    const input = box.querySelector('input')!;
    expect(box.hidden).toBe(false);
    expect(input.value).toBe('5');
    input.value = '2';
    input.dispatchEvent(new Event('input'));
    box.querySelector<HTMLButtonElement>('[data-control="WIDC_OK"]')!.click();
    expect(send).toHaveBeenCalledWith(2);
    expect(box.hidden).toBe(true);
    // the quest warning first, then one item's Yes/No (count 1); in use: it goes
    item = { objectId: 1, itemId: 10, count: 1 };
    boxes.start('quest', target, document.body);
    const quest = document.querySelector<HTMLElement>('.hud-quest-item-warning')!;
    expect(quest.textContent).toContain('Quest words');
    quest.querySelector<HTMLButtonElement>('[data-control="WIDC_BTN_YES"]')!.click();
    const confirm = document.querySelector<HTMLElement>('.hud-drop-confirm')!;
    expect(confirm.hidden).toBe(false);
    inUse = true;
    boxes.check();
    expect(confirm.hidden).toBe(true);
    inUse = false;
    boxes.start('confirm', target, document.body);
    confirm.querySelector<HTMLButtonElement>('[data-control="WIDC_YES"]')!.click();
    expect(send).toHaveBeenLastCalledWith(1);
    item = undefined;
    boxes.start('count', target, document.body);
    expect(box.hidden).toBe(true);
    boxes.dispose();
  });
});

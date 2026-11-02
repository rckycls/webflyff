// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { NpcDialog } from '../src/world/hud/npcDialog';

it('scopes NPC actions and replies to the selected live NPC, closes out of range, and rejects quest actions', () => {
  let valid = true;
  const send = vi.fn(), shop = vi.fn();
  const ui = new NpcDialog({ url: () => '', sheets: null }, () => valid, send, shop);
  document.body.append(ui.frame.element); ui.open(7, 'Luda', { key: 'luda', name: 'Luda', menus: [0, 2] });
  ui.receive({ kind: 'say', text: 'Unsolicited', quest: 0 }); expect(ui.frame.element.textContent).not.toContain('Unsolicited');
  ui.frame.element.querySelector<HTMLButtonElement>('[data-npc-action=talk]')!.click();
  expect(send).toHaveBeenCalledWith(7, '#init', 0, 0);
  ui.receive({ kind: 'say', text: 'Welcome', quest: 0 }); expect(ui.frame.element.textContent).toContain('Welcome');
  ui.receive({ kind: 'key', label: 'Quest', key: '#quest', param: 0, quest: 1 });
  expect(ui.frame.element.querySelector<HTMLButtonElement>('[data-dialog-key]')!.disabled).toBe(true);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-npc-action=shop]')!.click(); expect(shop).toHaveBeenCalledWith(7);
  valid = false; ui.update(); expect(ui.frame.isOpen).toBe(false);
  ui.receive({ kind: 'say', text: 'Late response', quest: 0 }); expect(ui.frame.isOpen).toBe(false);
  ui.dispose();
});

it('uses native menu labels, follows its NPC anchor and dismisses on outside press', () => {
  const texts = new Map([['TID_MMI_DIALOG', { id: 'TID_MMI_DIALOG', text: 'Resource Dialog', textId: 7000, color: 0xffffffff }], ['TID_MMI_TRADE', { id: 'TID_MMI_TRADE', text: 'Resource Trade', textId: 7002, color: 0xffffffff }]]);
  const ui = new NpcDialog({ url: () => '', sheets: null }, () => true, vi.fn(), vi.fn(), document, texts);
  const layer = document.createElement('div'); Object.defineProperties(layer, { clientWidth: { value: 800 }, clientHeight: { value: 500 } });
  layer.append(ui.frame.element); document.body.append(layer);
  ui.open(7, 'Luda', { key: 'luda', name: 'Luda', menus: [0, 2] });
  expect(ui.frame.element.querySelector('[data-npc-action=talk]')!.textContent).toBe('Resource Dialog');
  expect(ui.frame.element.querySelector('[data-npc-action=shop]')!.textContent).toBe('Resource Trade');
  ui.updateAnchor(id => { expect(id).toBe(7); return { x: 300, y: 200 }; });
  expect(ui.frame.element.style.left).toBe('300px'); expect(ui.frame.element.style.top).toBe('200px');
  ui.updateAnchor(() => ({ x: 340, y: 220 })); expect(ui.frame.element.style.left).toBe('340px');
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); expect(ui.frame.isOpen).toBe(false);
  ui.dispose(); layer.remove();
});

it('opens the native teleporter selector only from a valid resource menu', () => {
  const teleport = vi.fn(); let valid = true;
  const ui = new NpcDialog({ url: () => '', sheets: null }, () => valid, vi.fn(), vi.fn(), document, new Map(), teleport);
  document.body.append(ui.frame.element);
  const npc = { key: 'Pang', name: 'Pang', menus: [146], teleports: [{ x: 7161, z: 3264 }] };
  ui.open(7, 'Pang', npc);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-npc-action=teleport]')!.click();
  expect(teleport).toHaveBeenCalledWith(7, npc);
  valid = false; ui.frame.element.querySelector<HTMLButtonElement>('[data-npc-action=teleport]')!.click();
  expect(teleport).toHaveBeenCalledTimes(1); expect(ui.frame.isOpen).toBe(false); ui.dispose();
});

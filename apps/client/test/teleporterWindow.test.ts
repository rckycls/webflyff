// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { TeleporterWindow, teleportPoint } from '../src/world/hud/teleporterWindow';
it('maps native Madrigal world-map bounds with north at the top', () => {
  expect(teleportPoint({ x: 0, z: 9757 })).toEqual({ x: 0, y: 0 });
  expect(teleportPoint({ x: 11800, z: 1298 })).toEqual({ x: 788, y: 591 });
});
it('uses original resource indexes and only requests a destination while the NPC remains valid', () => {
  let valid = true; const send = vi.fn();
  const ui = new TeleporterWindow({ url: key => key, sheets: null }, () => valid, send);
  document.body.append(ui.frame.element);
  ui.open(7, { key: 'Pang', name: 'Pang', menus: [146], teleports: [{ x: 7161, z: 3264 }, { x: 8321, z: 3720 }] });
  ui.frame.element.querySelector<HTMLButtonElement>('[data-destination="1"]')!.click();
  expect(send).toHaveBeenCalledWith('Pang', 1); expect(ui.frame.isOpen).toBe(false);
  ui.open(7, { key: 'Pang', name: 'Pang', menus: [146], teleports: [{ x: 7161, z: 3264 }] });
  valid = false; ui.frame.element.querySelector<HTMLButtonElement>('[data-destination="0"]')!.click();
  expect(send).toHaveBeenCalledTimes(1); expect(ui.frame.isOpen).toBe(false); ui.dispose();
});

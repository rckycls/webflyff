// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Minimap, navigatorPoint } from '../src/world/hud/minimap';
import type { WorldManifest } from '@flyffweb/formats';
const manifest = { name: 'WdTest', size: [30, 30], mapSize: 128, mpu: 4 } as WorldManifest;
it('maps native positive-z north, player center, offset and negative positions', () => {
  expect(navigatorPoint([100, 0, 200], [100, 0, 200], 256, 512)).toEqual({ x: 66, y: 64 });
  expect(navigatorPoint([120, 0, 220], [100, 0, 200], 256, 512)).toEqual({ x: 76, y: 54 });
  expect(navigatorPoint([-10, 0, -20], [-30, 0, -40], 256, 512)).toEqual({ x: 76, y: 54 });
});
it('uses classic zoom bounds, clips markers and supports native category filters without moving the player', () => {
  const ui = new Minimap({ url: key => key, sheets: null }, manifest, 'wdtest', key => key);
  document.body.append(ui.frame.element); ui.open();
  const draw = () => ui.update([700, 0, 700], Math.PI / 2, [
    { id: 2, kind: 'npc', name: 'Pang', pos: [710, 0, 710] },
    { id: 3, kind: 'monster', name: 'Far away', pos: [5000, 0, 5000] },
  ]);
  draw();
  expect(ui.frame.element.querySelectorAll('[data-marker]')).toHaveLength(1);
  expect(ui.frame.element.querySelector<HTMLElement>('.navigator-player')!.style.transform).toContain('90deg');
  for (let i = 0; i < 20; i++) ui.frame.element.querySelector<HTMLButtonElement>('[data-nav=zoom-in]')!.click();
  expect(ui.zoom).toBe(352);
  for (let i = 0; i < 20; i++) ui.frame.element.querySelector<HTMLButtonElement>('[data-nav=zoom-out]')!.click();
  expect(ui.zoom).toBe(128);
  ui.frame.element.querySelector<HTMLButtonElement>('[data-nav=filter]')!.click();
  ui.frame.element.querySelector<HTMLButtonElement>('[data-filter=npc]')!.click(); draw();
  expect(ui.frame.element.querySelectorAll('[data-marker]')).toHaveLength(0);
  ui.dispose();
});
it('uses dungeon fog and suppresses outdoor markers indoors', () => {
  const ui = new Minimap({ url: key => key, sheets: null }, { ...manifest, indoor: true }, 'dungeon', () => null);
  document.body.append(ui.frame.element); ui.open();
  ui.update([100, 0, 100], 0, [{ id: 2, kind: 'npc', name: 'Pang', pos: [101, 0, 100] }]);
  expect(ui.frame.element.querySelectorAll('[data-marker]')).toHaveLength(0);
  expect(ui.frame.element.querySelector<HTMLButtonElement>('[data-nav=filter]')!.disabled).toBe(true);
  expect(ui.frame.element.querySelector('.navigator-player')!.hasAttribute('hidden')).toBe(false);
  ui.dispose();
});

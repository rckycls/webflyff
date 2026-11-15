// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { Minimap, minimapMaskKey, navigatorPoint } from '../src/world/hud/minimap';
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
it('places the tiles, a marker and the arrow, and moves them as the player moves and turns', () => {
  const ui = new Minimap({ url: key => key, sheets: null }, manifest, 'wdtest', key => key);
  document.body.append(ui.frame.element); ui.open();
  const pang = { id: 2, kind: 'npc' as const, name: 'Pang', pos: [710, 0, 710] as [number, number, number] };
  const tile = () => ui.frame.element.querySelector<HTMLImageElement>('img[src="minimaps/wdtest/1_1.png"]')!.style;
  const dot = () => ui.frame.element.querySelector<HTMLElement>('[data-marker="2"]')!;
  const arrow = () => ui.frame.element.querySelector<HTMLElement>('.navigator-player')!.style.transform;
  ui.update([700, 0, 700], 0, [pang]);
  // the map is 132 x 128 px; a 512 m tile is 256 px at this zoom
  expect([tile().left, tile().top, tile().width]).toEqual(['-28px', '-98px', '256px']);
  expect([dot().style.left, dot().style.top, dot().title]).toEqual(['69px', '57px', 'Pang']);
  expect(arrow()).toContain('rotate(0deg)');
  // the same again changes nothing; then the player moves 64 m east and turns
  ui.update([700, 0, 700], 0, [pang]);
  expect([tile().left, dot().style.left]).toEqual(['-28px', '69px']);
  ui.update([764, 0, 700], Math.PI, [{ ...pang, name: 'Pang the elder' }]);
  expect([tile().left, tile().top]).toEqual(['-60px', '-98px']);
  expect([dot().style.left, dot().style.top, dot().title]).toEqual(['37px', '57px', 'Pang the elder']);
  expect(arrow()).toContain('rotate(180deg)');
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

// 2026-11-15 (Guild Siege, B5): WI_WORLD_GUILDWAR's mask (WdGuildWar_Mask.dds) over each landscape tile, as big, at alpha
// 200 (CWndNavigator, WndField.cpp:9214-9246, :9903); none elsewhere, none when the converter has not written it.
it('draws the siege mask over every tile in world 202 at 200/255, and nothing when the picture is missing', () => {
  expect(minimapMaskKey(202)).toBe('minimaps/wdguildwar/mask.png');
  expect(minimapMaskKey(1)).toBeNull();
  const siege = { name: 'WdGuildWar', size: [5, 5], mapSize: 128, mpu: 4 } as WorldManifest;
  const ui = new Minimap({ url: key => key, sheets: null }, siege, 'wdguildwar', key => key, document, minimapMaskKey(202));
  document.body.append(ui.frame.element); ui.open();
  ui.update([1291, 0, 1279], 0, []);
  const tile = ui.frame.element.querySelector<HTMLImageElement>('img[src="minimaps/wdguildwar/2_2.png"]')!;
  const masks = ui.frame.element.querySelectorAll<HTMLImageElement>('img[src="minimaps/wdguildwar/mask.png"]');
  expect(masks).toHaveLength(ui.frame.element.querySelectorAll('img:not(.navigator-mask)').length);
  const mask = [...masks].find((m) => m.style.left === tile.style.left && m.style.top === tile.style.top)!;
  expect(mask).toBeDefined();
  expect(mask.style.width).toBe(tile.style.width);
  expect(Number(mask.style.opacity)).toBeCloseTo(200 / 255, 5);
  ui.update([1300, 0, 1279], 0, []);
  expect(mask.style.left).toBe(tile.style.left);
  ui.dispose();
  // the picture not converted (its key not in the index): no mask, no error
  const bare = new Minimap({ url: key => key, sheets: null }, siege, 'wdguildwar', key => (key.endsWith('mask.png') ? null : key), document, minimapMaskKey(202));
  document.body.append(bare.frame.element); bare.open();
  bare.update([1291, 0, 1279], 0, []);
  expect(bare.frame.element.querySelectorAll('.navigator-mask')).toHaveLength(0);
  expect(bare.frame.element.querySelector('img[src="minimaps/wdguildwar/2_2.png"]')).not.toBeNull();
  bare.dispose();
});

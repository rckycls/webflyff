// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { GroundItems } from '../src/world/items/groundItems';
import { ownGameData } from './helpers/ownState';

it('makes ground icons smaller with perspective distance, keeping a usable touch target', () => {
  const ui = new GroundItems(ownGameData(), { url: () => '', sheets: null }, () => {});
  const camera = new PerspectiveCamera(50, 1, .1, 100);
  const items = new Map([[1, { index: 21, scale: 1, pos: [0, 0, 0] as [number, number, number], angle: 0, item: { objectId: 0, itemId: 21, count: 1 } }]]);
  camera.position.set(0, 1, 4); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  ui.update(items, camera);
  const button = ui.element.querySelector('button')!;
  const near = parseFloat(button.style.getPropertyValue('--drop-icon-size'));
  camera.position.set(0, 1, 20); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  ui.update(items, camera);
  const far = parseFloat(button.style.getPropertyValue('--drop-icon-size'));
  expect(near).toBeLessThanOrEqual(28); expect(far).toBeLessThan(near);
  expect(far).toBeGreaterThanOrEqual(8);
  ui.dispose();
});

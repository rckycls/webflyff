import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Overlay, OverlaySnapshot } from '../src/overlay/Overlay';
import { createViewerHooks, installTestHooks, registerLoadedTiles, registerWalkRoute } from '../src/testHooks';

const SNAPSHOT: OverlaySnapshot = {
  fps: 60,
  frameMs: 16.7,
  jsHeapBytes: null,
  gpuBytes: 1234,
  tiles: 2,
  models: 3,
  textures: 4,
  device: 'test device',
  errors: [],
};

const overlay = { snapshot: () => SNAPSHOT } as unknown as Overlay;

afterEach(() => {
  registerWalkRoute(null);
  registerLoadedTiles(null);
  Reflect.deleteProperty(globalThis, '__viewer');
});

describe('window.__viewer', () => {
  it('walkRoute rejects with "no world view" until a world view registers one', async () => {
    const hooks = createViewerHooks(overlay, Promise.resolve());

    await expect(hooks.walkRoute([[0, 0, 0]], 5)).rejects.toThrow(new Error('no world view'));
  });

  it('walkRoute goes to the registered implementation, and back to rejecting when it is removed', async () => {
    const walk = vi.fn(async () => {});
    const hooks = createViewerHooks(overlay, Promise.resolve());
    const route: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 5],
    ];

    registerWalkRoute(walk);
    await hooks.walkRoute(route, 7);
    expect(walk).toHaveBeenCalledWith(route, 7);

    registerWalkRoute(null);
    await expect(hooks.walkRoute(route, 7)).rejects.toThrow('no world view');
  });

  it('stats is the overlay snapshot plus the loaded tiles, empty without a world view', () => {
    const hooks = createViewerHooks(overlay, Promise.resolve());
    expect(hooks.stats()).toEqual({ ...SNAPSHOT, loadedTiles: [] });

    registerLoadedTiles(() => ['wdmadrigal/0_0', 'wdmadrigal/1_0']);
    expect(hooks.stats().loadedTiles).toEqual(['wdmadrigal/0_0', 'wdmadrigal/1_0']);
    expect(hooks.stats().fps).toBe(60);
  });

  it('ready waits for the shell and then for the view', async () => {
    let bootDone!: () => void;
    let viewDone!: () => void;
    const booted = new Promise<void>((resolve) => (bootDone = resolve));
    const view = new Promise<void>((resolve) => (viewDone = resolve));
    const hooks = createViewerHooks(overlay, booted, () => view);

    let settled = false;
    const ready = hooks.ready().then(() => (settled = true));

    await Promise.resolve();
    expect(settled).toBe(false);
    bootDone();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    viewDone();
    await ready;
    expect(settled).toBe(true);
  });

  it('ready rejects when the shell failed to start', async () => {
    const hooks = createViewerHooks(overlay, Promise.reject(new Error('index.json: 404')));

    await expect(hooks.ready()).rejects.toThrow('index.json: 404');
  });

  it('installTestHooks puts the hooks on window.__viewer', () => {
    const hooks = installTestHooks(overlay, Promise.resolve());

    expect((globalThis as { __viewer?: unknown }).__viewer).toBe(hooks);
  });
});

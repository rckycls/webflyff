import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_ROUTE, Router, parseRoute } from '../src/router';
import type { RouteName, RouterHost, View, ViewContext, ViewFactory } from '../src/router';

describe('parseRoute', () => {
  it('defaults to the character view', () => {
    expect(DEFAULT_ROUTE).toBe('character');
    expect(parseRoute('').name).toBe('character');
    expect(parseRoute('#').name).toBe('character');
    expect(parseRoute('#/').name).toBe('character');
  });

  it('knows the three views', () => {
    expect(parseRoute('#/character').name).toBe('character');
    expect(parseRoute('#/world').name).toBe('world');
    expect(parseRoute('#/compare').name).toBe('compare');
  });

  it('falls back to the default for a route it does not have', () => {
    expect(parseRoute('#/nonsense').name).toBe('character');
    expect(parseRoute('#/world/extra').name).toBe('character');
  });

  it('reads parameters after the question mark, the world by its web name', () => {
    const route = parseRoute('#/world?world=wdmadrigal&x=1');

    expect(route.name).toBe('world');
    expect(route.params.get('world')).toBe('wdmadrigal');
    expect(route.params.get('x')).toBe('1');
  });

  it('has empty parameters when there is no question mark', () => {
    expect([...parseRoute('#/compare').params]).toEqual([]);
  });
});

describe('Router', () => {
  /** A host with a hash the test sets, and a way to fire the hashchange listener. */
  function fakeHost(initial = '') {
    let hash = initial;
    let listener: () => void = () => {};
    const host: RouterHost = {
      hash: () => hash,
      onHashChange: (fn) => void (listener = fn),
      routeShown: vi.fn<(name: RouteName) => void>(),
    };
    return {
      host,
      go(next: string) {
        hash = next;
        listener();
      },
    };
  }

  function goodView(): View & { dispose: Mock<() => void> } {
    return { ready: Promise.resolve(), frame: () => {}, dispose: vi.fn<() => void>() };
  }

  function routerWith(factories: Partial<Record<RouteName, ViewFactory>>, initialHash = '') {
    const overlay = { error: vi.fn<(message: string) => void>() };
    const base = { overlay } as unknown as Omit<ViewContext, 'route'>;
    const all: Record<RouteName, ViewFactory> = {
      character: () => goodView(),
      world: () => goodView(),
      compare: () => goodView(),
      ...factories,
    };
    const { host, go } = fakeHost(initialHash);
    return { router: new Router(base, all, host), overlay, host, go };
  }

  it('shows the route in the address bar on start, then follows the hash', () => {
    const seen: string[] = [];
    const { router, host, go } = routerWith({
      world: (ctx) => {
        seen.push(`world:${ctx.route.params.get('world')}`);
        return goodView();
      },
    });

    router.start();
    expect(router.current()).not.toBeNull();
    expect(host.routeShown).toHaveBeenLastCalledWith('character');

    go('#/world?world=wdmadrigal');
    expect(seen).toEqual(['world:wdmadrigal']);
    expect(host.routeShown).toHaveBeenLastCalledWith('world');
  });

  it('disposes the old view before it builds the next', () => {
    const order: string[] = [];
    const first = goodView();
    first.dispose.mockImplementation(() => order.push('dispose'));
    const { router, go } = routerWith({
      character: () => first,
      world: () => {
        order.push('create');
        return goodView();
      },
    });

    router.start();
    go('#/world');

    expect(order).toEqual(['dispose', 'create']);
  });

  it('reports a view factory that throws to the overlay, and goes on with the next route', () => {
    const { router, overlay, go } = routerWith({
      world: () => {
        throw new Error('model index is broken');
      },
    });
    router.start();

    go('#/world');

    expect(router.current()).toBeNull();
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toContain('world');
    expect(overlay.error.mock.calls[0]![0]).toContain('model index is broken');

    go('#/compare');
    expect(router.current()).not.toBeNull();
    expect(overlay.error).toHaveBeenCalledTimes(1);
  });

  it('reports a throwing first view too, so the shell does not stop at a blank canvas', () => {
    const { router, overlay } = routerWith({
      character: () => {
        throw new Error('no character data');
      },
    });

    expect(() => router.start()).not.toThrow();
    expect(router.current()).toBeNull();
    expect(overlay.error.mock.calls[0]![0]).toContain('no character data');
  });

  it('reports a dispose that throws, drops the old view, and still builds the new one', () => {
    const broken = goodView();
    broken.dispose.mockImplementation(() => {
      throw new Error('texture cache is gone');
    });
    const next = goodView();
    const { router, overlay, go } = routerWith({ character: () => broken, world: () => next });
    router.start();

    go('#/world');

    expect(router.current()).toBe(next);
    expect(broken.dispose).toHaveBeenCalledTimes(1);
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toContain('texture cache is gone');

    // the half-disposed view is not disposed a second time on the next change
    go('#/compare');
    expect(broken.dispose).toHaveBeenCalledTimes(1);
    expect(next.dispose).toHaveBeenCalledTimes(1);
  });

  it('survives a throwing dispose followed by a throwing factory', () => {
    const broken = goodView();
    broken.dispose.mockImplementation(() => {
      throw new Error('dispose failed');
    });
    const { router, overlay, go } = routerWith({
      character: () => broken,
      world: () => {
        throw new Error('factory failed');
      },
    });
    router.start();

    expect(() => go('#/world')).not.toThrow();

    expect(router.current()).toBeNull();
    expect(overlay.error).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from 'vitest';
import { ScreenAwake } from '../src/world/wakeLock';

/** A document stand-in whose visibility the test sets. */
function fakeDoc() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { listeners.delete(fn); },
  };
  const set = (state: DocumentVisibilityState) => { doc.visibilityState = state; for (const fn of [...listeners]) fn(); };
  return { doc: doc as unknown as Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>, set, listeners };
}

function fakeNav(fail = false) {
  const calls = { requests: 0, releases: 0 };
  const nav = {
    wakeLock: {
      request: async (_type: 'screen') => {
        calls.requests++;
        if (fail) throw new Error('NotAllowedError');
        return { release: async () => { calls.releases++; } };
      },
    },
  };
  return { nav, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ScreenAwake (custom, owner 2026-11-15; spec 6.10)', () => {
  it('hold requests once; a second hold does nothing', async () => {
    const { nav, calls } = fakeNav();
    const awake = new ScreenAwake(nav, fakeDoc().doc);
    awake.hold();
    awake.hold();
    await flush();
    expect(calls.requests).toBe(1);
  });

  it('hidden then visible again → requests again (the browser lets go of it while hidden)', async () => {
    const { nav, calls } = fakeNav();
    const { doc, set } = fakeDoc();
    const awake = new ScreenAwake(nav, doc);
    awake.hold();
    await flush();
    set('hidden');
    set('visible');
    await flush();
    expect(calls.requests).toBe(2);
  });

  it('release lets go and stops asking again', async () => {
    const { nav, calls } = fakeNav();
    const { doc, set, listeners } = fakeDoc();
    const awake = new ScreenAwake(nav, doc);
    awake.hold();
    await flush();
    awake.release();
    await flush();
    expect(calls.releases).toBe(1);
    set('visible');
    await flush();
    expect(calls.requests).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it('no wakeLock, or a refused request → no throw', async () => {
    const quiet = new ScreenAwake({}, fakeDoc().doc);
    expect(() => { quiet.hold(); quiet.release(); }).not.toThrow();
    const { nav } = fakeNav(true);
    const refused = new ScreenAwake(nav, fakeDoc().doc);
    refused.hold();
    await flush();
    expect(() => refused.release()).not.toThrow();
  });
});

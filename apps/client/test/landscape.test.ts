// @vitest-environment jsdom
// Landscape for the whole game (Piece 4 spec §3.10): the cover over a page taller than wide, with the plan's two texts,
// and the full screen and orientation lock a tap on a touch screen asks for, whose refusal is ignored.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { installLandscape, isUpright } from '../src/landscape';

const TOUCH_TEXT = 'Turn your device sideways to play.';
const PC_TEXT = 'Make the window wider to play.';

/** The window `width` by `height` CSS px, with no event (jsdom lays nothing out). */
function sizeTo(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

/** The window `width` by `height` CSS px, as a resize or a turn of the device leaves it. */
function resizeTo(width: number, height: number): void {
  sizeTo(width, height);
  window.dispatchEvent(new Event('resize'));
}

/** The game's element, as index.html has it, with something in it. */
function gameRoot(): HTMLElement {
  const root = document.createElement('main');
  root.id = 'app';
  root.append(Object.assign(document.createElement('button'), { textContent: 'Log in' }));
  document.body.append(root);
  return root;
}

const coverOf = (): HTMLElement | null => document.querySelector<HTMLElement>('.landscape-cover');

const installed: Array<{ dispose(): void }> = [];
function install(root: HTMLElement, isTouch: () => boolean): ReturnType<typeof installLandscape> {
  const landscape = installLandscape(root, isTouch);
  installed.push(landscape);
  return landscape;
}

/** Stubs `name` on `target` for one test (jsdom has no Fullscreen API and no `screen.orientation`). */
const stubs: Array<() => void> = [];
function stub(target: object, name: string, value: unknown): void {
  const own = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, { configurable: true, writable: true, value });
  stubs.push(() => {
    if (own === undefined) delete (target as Record<string, unknown>)[name];
    else Object.defineProperty(target, name, own);
  });
}

afterEach(() => {
  vi.useRealTimers();
  for (const landscape of installed.splice(0)) landscape.dispose();
  for (const undo of stubs.splice(0).reverse()) undo();
  document.body.replaceChildren();
  resizeTo(1024, 768);
});

describe('installLandscape (spec §3.10)', () => {
  it('covers the game while the page is taller than wide, and uncovers it once it is wide again', () => {
    resizeTo(844, 390);
    const root = gameRoot();
    install(root, () => false);
    const cover = coverOf()!;
    expect(cover).not.toBeNull();
    expect(cover.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(false);

    resizeTo(390, 844);
    expect(cover.hidden).toBe(false);
    expect(cover.textContent).toBe(PC_TEXT);
    // the game under it takes no press, key focus or screen reader while covered
    expect(root.hasAttribute('inert')).toBe(true);

    resizeTo(844, 390);
    expect(cover.hidden).toBe(true);
    expect(root.hasAttribute('inert')).toBe(false);
    // a square page is not taller than wide
    resizeTo(600, 600);
    expect(cover.hidden).toBe(true);
  });

  it('takes the focus as it shows, so that a screen reader says it (the game under it is inert)', () => {
    resizeTo(844, 390);
    const root = gameRoot();
    root.querySelector('button')!.focus();
    install(root, () => false);
    expect(document.activeElement).toBe(root.querySelector('button'));
    resizeTo(390, 844);
    expect(document.activeElement).toBe(coverOf());
    // once up, another resize leaves the focus where it is
    const other = document.body.appendChild(Object.assign(document.createElement('button'), { textContent: 'other' }));
    other.focus();
    resizeTo(390, 800);
    expect(document.activeElement).toBe(other);
  });

  it('gives the focus back to where it was as it goes, if nothing took it meanwhile', () => {
    resizeTo(844, 390);
    const root = gameRoot();
    const field = root.appendChild(document.createElement('input'));
    field.focus();
    install(root, () => true);
    resizeTo(390, 844);
    expect(document.activeElement).toBe(coverOf());
    resizeTo(844, 390);
    expect(document.activeElement).toBe(field);
    // the screen under it changed meanwhile (the lobby's next screen, the world): the element is gone, the focus stays put
    resizeTo(390, 844);
    field.remove();
    resizeTo(844, 390);
    expect(document.activeElement).not.toBe(field);
    expect(document.activeElement).not.toBe(coverOf());
  });

  it('a turn of the device alone (orientationchange, no resize) flips it', () => {
    sizeTo(844, 390);
    install(gameRoot(), () => true);
    sizeTo(390, 844);
    window.dispatchEvent(new Event('orientationchange'));
    expect(coverOf()!.hidden).toBe(false);
    sizeTo(844, 390);
    window.dispatchEvent(new Event('orientationchange'));
    expect(coverOf()!.hidden).toBe(true);
  });

  it('looks again 300 ms after a turn, for an iOS that gives the new size late', () => {
    vi.useFakeTimers();
    sizeTo(844, 390);
    install(gameRoot(), () => true);
    // the turn is said while the old size is still there; the new one comes with no event
    window.dispatchEvent(new Event('orientationchange'));
    sizeTo(390, 844);
    expect(coverOf()!.hidden).toBe(true);
    vi.advanceTimersByTime(299);
    expect(coverOf()!.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(coverOf()!.hidden).toBe(false);
  });

  it('isUpright is the cover\'s rule: taller than wide', () => {
    sizeTo(390, 844);
    expect(isUpright(window)).toBe(true);
    sizeTo(844, 390);
    expect(isUpright(window)).toBe(false);
    sizeTo(600, 600);
    expect(isUpright(window)).toBe(false);
  });

  it('is up at once on a page that starts upright', () => {
    resizeTo(390, 844);
    const root = gameRoot();
    install(root, () => false);
    expect(coverOf()!.hidden).toBe(false);
    expect(root.hasAttribute('inert')).toBe(true);
  });

  it('asks a touch screen to turn the device and a PC for a wider window, as the screen is then', () => {
    let touch = false;
    resizeTo(390, 844);
    install(gameRoot(), () => touch);
    const cover = coverOf()!;
    expect(cover.textContent).toBe(PC_TEXT);
    // a computer whose touch screen was just touched (`watchTouch`): the next turn says so
    touch = true;
    resizeTo(391, 844);
    expect(cover.textContent).toBe(TOUCH_TEXT);
    expect(cover.getAttribute('role')).toBe('dialog');
    expect(cover.getAttribute('aria-label')).toBe(TOUCH_TEXT);
  });

  it('pauses and closes nothing behind it: the game stays in the page as it is, beside the cover', () => {
    resizeTo(844, 390);
    const root = gameRoot();
    const button = root.querySelector('button')!;
    install(root, () => true);
    resizeTo(390, 844);
    // outside the game's element, which the lobby and the world screen fill as they like
    expect(coverOf()!.parentElement).toBe(document.body);
    expect(root.contains(coverOf())).toBe(false);
    expect(root.hidden).toBe(false);
    expect(root.style.display).toBe('');
    expect(root.querySelector('button')).toBe(button);
    resizeTo(844, 390);
    expect(root.querySelector('button')).toBe(button);
  });

  it('dispose takes the cover off and lets the game go', () => {
    resizeTo(390, 844);
    const root = gameRoot();
    const landscape = installLandscape(root, () => false);
    landscape.dispose();
    expect(coverOf()).toBeNull();
    expect(root.hasAttribute('inert')).toBe(false);
    resizeTo(391, 844);
    expect(coverOf()).toBeNull();
  });
});

describe('requestLock (spec §3.10: Android Chrome allows it, iOS Safari neither)', () => {
  it('on a touch screen asks for full screen, then the landscape lock', async () => {
    const calls: string[] = [];
    stub(document.documentElement, 'requestFullscreen', vi.fn(async () => {
      calls.push('fullscreen');
    }));
    stub(window.screen, 'orientation', { lock: vi.fn(async (orientation: string) => {
      calls.push(`lock ${orientation}`);
    }) });
    const landscape = install(gameRoot(), () => true);
    await landscape.requestLock();
    expect(calls).toEqual(['fullscreen', 'lock landscape']);
  });

  it('asks for full screen at once, in the tap that calls it (a browser allows it only there)', () => {
    const fullscreen = vi.fn(async () => {});
    stub(document.documentElement, 'requestFullscreen', fullscreen);
    const landscape = install(gameRoot(), () => true);
    void landscape.requestLock();
    expect(fullscreen).toHaveBeenCalledTimes(1);
  });

  it('a refused full screen and a refused lock do not throw, and the lock is still asked for', async () => {
    const lock = vi.fn(async () => {
      throw new DOMException('not supported', 'NotSupportedError');
    });
    stub(document.documentElement, 'requestFullscreen', vi.fn(async () => {
      throw new TypeError('Permissions check failed');
    }));
    stub(window.screen, 'orientation', { lock });
    const landscape = install(gameRoot(), () => true);
    await expect(landscape.requestLock()).resolves.toBeUndefined();
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('a full screen or a lock that throws as it is asked for does not throw either', async () => {
    stub(document.documentElement, 'requestFullscreen', () => {
      throw new TypeError('not allowed');
    });
    stub(window.screen, 'orientation', { lock: () => {
      throw new TypeError('not a function of this browser');
    } });
    const landscape = install(gameRoot(), () => true);
    await expect(landscape.requestLock()).resolves.toBeUndefined();
  });

  it('a browser with neither (iOS Safari on an iPhone) is left to the cover', async () => {
    stub(document.documentElement, 'requestFullscreen', undefined);
    stub(window.screen, 'orientation', undefined);
    const landscape = install(gameRoot(), () => true);
    await expect(landscape.requestLock()).resolves.toBeUndefined();
  });

  it('a page already in full screen only locks', async () => {
    const fullscreen = vi.fn(async () => {});
    const lock = vi.fn(async () => {});
    stub(document.documentElement, 'requestFullscreen', fullscreen);
    stub(document, 'fullscreenElement', document.documentElement);
    stub(window.screen, 'orientation', { lock });
    const landscape = install(gameRoot(), () => true);
    await landscape.requestLock();
    expect(fullscreen).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('a PC is never put in full screen: its cover asks for a wider window instead', async () => {
    const fullscreen = vi.fn(async () => {});
    const lock = vi.fn(async () => {});
    stub(document.documentElement, 'requestFullscreen', fullscreen);
    stub(window.screen, 'orientation', { lock });
    const landscape = install(gameRoot(), () => false);
    await landscape.requestLock();
    expect(fullscreen).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingScreen } from '../src/world/loading/loadingScreen';
import type { LoadParts } from '../src/world/loading/loadProgress';

const NOTHING: LoadParts = { server: 0, files: false, map: null, models: null, windows: false, drawn: false };

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** The layer with the page's animation frames run by hand. */
function make() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  const loading = new LoadingScreen(document, 'Entering the world…');
  document.body.append(loading.element);
  const runFrame = (): void => { for (const frame of frames.splice(0)) frame(0); };
  const percent = (): string => loading.element.querySelector('.world-loading-percent')!.textContent!;
  return { loading, runFrame, percent };
}

describe('LoadingScreen (2026-11-20)', () => {
  it('keeps the words for screen readers, and starts at 0% with no picture', () => {
    const { loading, percent } = make();
    expect(loading.element.querySelector('[role="status"]')!.textContent).toBe('Entering the world…');
    expect(percent()).toBe('0%');
    expect(loading.element.dataset.picture).toBeUndefined();
    loading.setPicture(null); // no convert yet: still none, and no throw
    expect(loading.element.dataset.picture).toBeUndefined();
  });

  it('shows what has come, never going back, and 99% at most before the world is drawn', () => {
    const { loading, runFrame, percent } = make();
    let parts: LoadParts = { ...NOTHING, server: 1, files: true };
    loading.start(() => parts);
    runFrame();
    expect(percent()).toBe('30%');
    parts = { ...NOTHING }; // a part read as less later (a new stage): the bar stays
    runFrame();
    expect(percent()).toBe('30%');
    parts = { server: 1, files: true, map: { done: 9, total: 9 }, models: { done: 2, total: 2 }, windows: true, drawn: false };
    runFrame();
    expect(percent()).toBe('99%');
    expect(loading.element.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('99');
  });

  it('once the world is drawn: 100%, then the fade on the next frame, then off the page', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { loading, runFrame, percent } = make();
    loading.start(() => ({ ...NOTHING, drawn: true }));
    loading.cover();
    runFrame();
    expect(percent()).toBe('100%');
    expect(loading.element.classList.contains('world-loading-fading')).toBe(false);
    runFrame();
    expect(loading.element.classList.contains('world-loading-fading')).toBe(true);
    expect(loading.element.isConnected).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(loading.element.isConnected).toBe(false);
    expect(loading.isDisposed).toBe(true);
  });
});

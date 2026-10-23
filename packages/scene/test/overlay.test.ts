// Node environment, no jsdom: the overlay only needs createElement, append, textContent, style.cssText and
// addEventListener from its root, so a small fake root stands in for the document.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Overlay } from '../src/overlay/Overlay';

class FakeElement {
  id = '';
  textContent = '';
  style = { cssText: '' };
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
}

class FakeRoot extends FakeElement {
  readonly created: FakeElement[] = [];
  readonly ownerDocument = {
    createElement: (tag: string): FakeElement => {
      const element = new FakeElement(tag);
      this.created.push(element);
      return element;
    },
  };
  constructor() {
    super('body');
  }
  /** The first created element with this tag. */
  find(tag: string): FakeElement {
    return this.created.find((e) => e.tag === tag)!;
  }
}

function overlayOn(root = new FakeRoot()): { overlay: Overlay; root: FakeRoot } {
  return { overlay: new Overlay(root as unknown as HTMLElement), root };
}

afterEach(() => vi.unstubAllGlobals());

describe('Overlay.snapshot', () => {
  it('has jsHeapBytes null and does not throw without performance.memory', () => {
    vi.stubGlobal('performance', {});
    const { overlay, root } = overlayOn();

    expect(() => overlay.snapshot()).not.toThrow();
    expect(overlay.snapshot().jsHeapBytes).toBeNull();
    expect(root.find('pre').textContent).toContain('n/a');
  });

  it('reads the JS heap from performance.memory when there is one', () => {
    vi.stubGlobal('performance', { memory: { usedJSHeapSize: 5_000_000 } });
    const { overlay } = overlayOn();

    expect(overlay.snapshot().jsHeapBytes).toBe(5_000_000);
  });

  it('starts at zero with no errors', () => {
    vi.stubGlobal('performance', {});
    const snapshot = overlayOn().overlay.snapshot();

    expect(snapshot).toMatchObject({ fps: 0, frameMs: 0, gpuBytes: 0, tiles: 0, models: 0, textures: 0, errors: [] });
    expect(typeof snapshot.device).toBe('string');
  });

  it('keeps counts, gpu bytes and errors', () => {
    const { overlay } = overlayOn();
    overlay.setCounts({ tiles: 12, models: 340, textures: 55 });
    overlay.addGpuBytes(1000);
    overlay.addGpuBytes(-250);
    overlay.error('texture x.ktx2: decode failed');

    expect(overlay.snapshot()).toMatchObject({
      tiles: 12,
      models: 340,
      textures: 55,
      gpuBytes: 750,
      errors: ['texture x.ktx2: decode failed'],
    });
  });

  it('keeps the latest 100 errors', () => {
    const { overlay } = overlayOn();
    for (let i = 0; i < 105; i++) overlay.error(`e${i}`);

    const { errors } = overlay.snapshot();
    expect(errors).toHaveLength(100);
    expect(errors[0]).toBe('e5');
    expect(errors[99]).toBe('e104');
  });
});

describe('Overlay.frame', () => {
  it('averages the last 60 frames into fps and frameMs', () => {
    const { overlay } = overlayOn();
    for (let i = 0; i < 60; i++) overlay.frame(1 / 60);

    const { fps, frameMs } = overlay.snapshot();
    expect(fps).toBeCloseTo(60, 5);
    expect(frameMs).toBeCloseTo(1000 / 60, 5);
  });

  it('forgets frames older than the window', () => {
    const { overlay } = overlayOn();
    for (let i = 0; i < 60; i++) overlay.frame(0.1);
    for (let i = 0; i < 60; i++) overlay.frame(1 / 60);

    expect(overlay.snapshot().fps).toBeCloseTo(60, 5);
  });

  it('ignores a frame time that is zero, negative or not a number', () => {
    const { overlay } = overlayOn();
    overlay.frame(0.02);
    overlay.frame(0);
    overlay.frame(-1);
    overlay.frame(Number.NaN);

    expect(overlay.snapshot().fps).toBeCloseTo(50, 5);
  });

  it('redraws the text about four times a second, not every frame', () => {
    vi.stubGlobal('performance', {});
    const { overlay, root } = overlayOn();
    const text = root.find('pre');
    overlay.setCounts({ tiles: 3, models: 0, textures: 0 });

    overlay.frame(0.1);
    expect(text.textContent).not.toContain('tiles 3');
    overlay.frame(0.2);
    expect(text.textContent).toContain('tiles 3');
  });

  it('shows an error at once', () => {
    const { overlay, root } = overlayOn();
    overlay.error('world wdx: tile 3_4 failed');

    expect(root.find('pre').textContent).toContain('world wdx: tile 3_4 failed');
  });

  it('shows the bundles, those with a table, and the skipped and mismatched messages once the game client gives them', () => {
    const { overlay, root } = overlayOn();
    const text = root.find('pre');
    overlay.frame(0.3);
    expect(text.textContent).not.toContain('messages');
    expect(text.textContent).not.toContain('bundles');

    overlay.setMessageCounts({ bundles: 12, indexed: 11, skipped: 4, mismatched: 1 });
    overlay.frame(0.3);
    expect(text.textContent).toContain('bundles 12   indexed 11   messages skipped 4   mismatched 1');
  });
});

describe('Overlay device button', () => {
  it('asks for a label once and keeps it', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal('prompt', vi.fn(() => 'Pixel 7'));
    const { overlay, root } = overlayOn();

    root.find('button').listeners.get('click')!();

    expect(store.get('flyffweb.device')).toBe('Pixel 7');
    expect(overlay.snapshot().device).toBe('Pixel 7');
    expect(root.find('pre').textContent).toContain('Pixel 7');
  });

  it('keeps the old label when the prompt is cancelled', () => {
    vi.stubGlobal('navigator', { userAgent: 'TestAgent/1.0' });
    vi.stubGlobal('prompt', vi.fn(() => null));
    const { overlay, root } = overlayOn();

    root.find('button').listeners.get('click')!();

    expect(overlay.snapshot().device).toBe('TestAgent/1.0');
  });
});

describe('Overlay placement', () => {
  it('keeps clear of the notch: the top-left corner of the screen is under it on a phone or iPad turned sideways', () => {
    // index.html asks for viewport-fit=cover, so the page reaches under the notch and the safe-area insets say how far
    const { root } = overlayOn();
    const box = root.find('div').style.cssText;

    expect(box).toContain('position:fixed;top:0;left:0;');
    expect(box).toContain('padding:max(6px, env(safe-area-inset-top)) 8px 6px max(8px, env(safe-area-inset-left));');
  });
});

// @vitest-environment jsdom
// 2026-11-16 (owner's picks after the consistency scan): on a phone, an amount field takes the bank's and the mail's number
// pad (`padField`), and the windows that opened under the open bag open over it (`WindowFrame.overBag`).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { padField } from '../src/world/hud/amountBox';
import { WindowFrame } from '../src/world/hud/frame';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const phone = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query }));

/** The windows a test opened, closed after it (the window stack is the document's, kept between tests). */
const opened: WindowFrame[] = [];

afterEach(() => {
  for (const frame of opened.splice(0)) frame.close();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** A window in a layer with one field in it, open. */
function fieldWindow(title: string): { layer: HTMLElement; frame: WindowFrame; input: HTMLInputElement } {
  const layer = document.createElement('div');
  document.body.append(layer);
  const frame = new WindowFrame(title, art, { width: 200, height: 120 }, document);
  const input = document.createElement('input');
  input.value = '40';
  frame.body.append(input);
  layer.append(frame.element);
  frame.open({ x: 0, y: 0 });
  opened.push(frame);
  return { layer, frame, input };
}

const key = (layer: HTMLElement, name: string) => layer.querySelector<HTMLButtonElement>(`.hud-amount-box [data-pad-key="${name}"]`)!.click();

describe('padField: the phone amount fields on the game\'s number pad', () => {
  it('is nothing on the desktop: the field is typed', () => {
    const { input } = fieldWindow('Contribute Guild');
    expect(padField(input, art, document, () => ({ max: 100 }))).toBe(false);
    expect(input.readOnly).toBe(false);
    input.click();
    expect(document.querySelector('.hud-amount-box')).toBeNull();
  });

  it('on a phone, a tap opens the pad with what the field holds; OK writes the amount in and tells the field', () => {
    phone();
    const { layer, frame, input } = fieldWindow('Contribute Guild');
    const typed = vi.fn();
    input.addEventListener('input', () => typed(input.value));
    expect(padField(input, art, document, () => ({ max: 500 }))).toBe(true);
    expect(input.readOnly).toBe(true);
    input.click();
    const sheet = layer.querySelector<HTMLElement>('.hud-amount-box')!;
    expect(sheet).not.toBeNull();
    expect(sheet.hidden).toBe(false);
    expect(sheet.querySelector('.hud-window-title')!.textContent).toBe(frame.element.getAttribute('aria-label'));
    expect(sheet.querySelector('[data-field="amount"]')!.textContent).toBe('40');
    // the first digit replaces it, as the bank's pad; past the most it is the most
    key(layer, '3');
    key(layer, '0');
    expect(sheet.querySelector('[data-field="amount"]')!.textContent).toBe('30');
    key(layer, '000');
    expect(sheet.querySelector('[data-field="amount"]')!.textContent).toBe('500');
    sheet.querySelector<HTMLButtonElement>('[data-button="ok"]')!.click();
    expect(input.value).toBe('500');
    expect(typed).toHaveBeenCalledWith('500');
    expect(sheet.hidden).toBe(true);
  });

  it('keeps the least it takes, and shares one pad between the fields', () => {
    phone();
    const first = fieldWindow('Maintenance Fee');
    const second = fieldWindow('Guild Siege - Apply');
    padField(first.input, art, document, () => ({ max: 200, min: 1, label: 'Duration' }));
    padField(second.input, art, document, () => ({ max: 1000 }));
    first.input.click();
    key(first.layer, 'escape');
    first.layer.querySelector<HTMLButtonElement>('.hud-amount-box [data-button="ok"]')!.click();
    expect(first.input.value).toBe('1');
    second.input.click();
    // the one pad moved to the second field's layer
    expect(document.querySelectorAll('.hud-amount-box')).toHaveLength(1);
    expect(second.layer.querySelector('.hud-amount-box')).not.toBeNull();
  });
});

describe('WindowFrame.overBag: over the phone\'s open bag (z 60), under its boxes (z 70)', () => {
  const open = (overBag: boolean): WindowFrame => {
    const frame = new WindowFrame('Window', art, { width: 100, height: 100 }, document);
    frame.overBag = overBag;
    document.body.append(frame.element);
    frame.open({ x: 0, y: 0 });
    opened.push(frame);
    return frame;
  };

  it('stacks the windows like it from 61, in their order, on a phone', () => {
    phone();
    const plain = open(false);
    const quest = open(true);
    const motion = open(true);
    expect(Number(plain.element.style.zIndex)).toBeLessThan(60);
    expect([quest.element.style.zIndex, motion.element.style.zIndex]).toEqual(['61', '62']);
    expect(quest.element.style.getPropertyPriority('z-index')).toBe('important');
    quest.raise();
    expect([quest.element.style.zIndex, motion.element.style.zIndex]).toEqual(['62', '61']);
  });

  it('leaves the desktop\'s order as it was', () => {
    const plain = open(false);
    const quest = open(true);
    expect(Number(quest.element.style.zIndex)).toBe(Number(plain.element.style.zIndex) + 1);
    expect(Number(quest.element.style.zIndex)).toBeLessThan(60);
    expect(quest.element.style.getPropertyPriority('z-index')).toBe('');
  });
});

// @vitest-environment jsdom
// Neuz's message box (Piece 7 M3): CWndMessageBox, WndMessageBox.cpp:65-128.

import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { MessageBox } from '../src/world/hud/messageBox';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const button = (box: MessageBox, key: string): HTMLButtonElement | null =>
  box.frame.element.querySelector<HTMLButtonElement>(`[data-button="${key}"]`);

afterEach(() => {
  document.body.replaceChildren();
});

describe('MessageBox (CWndMessageBox)', () => {
  it('OK and Cancel sit where CWndMessageBox puts them (MB_OKCANCEL)', () => {
    const box = new MessageBox(art, document);
    document.body.append(box.element);
    let ok = 0;
    let cancel = 0;
    box.open('Use it?', 'okCancel', () => ok++, () => cancel++);
    expect(box.isOpen).toBe(true);
    // the client area is 244 x 112: OK at the middle - 70, Cancel at the middle + 10, 30 px over the bottom
    expect([button(box, 'ok')!.style.left, button(box, 'ok')!.style.top]).toEqual(['52px', '82px']);
    expect([button(box, 'cancel')!.style.left, button(box, 'cancel')!.style.top]).toEqual(['132px', '82px']);
    expect(button(box, 'cancel')!.hidden).toBe(false);
    button(box, 'ok')!.click();
    expect([ok, cancel, box.isOpen]).toEqual([1, 0, false]);
    box.open('Use it?', 'okCancel', () => ok++, () => cancel++);
    button(box, 'cancel')!.click();
    expect([ok, cancel, box.isOpen]).toEqual([1, 1, false]);
  });

  it('MB_OK has one centred button', () => {
    const box = new MessageBox(art, document);
    let ok = 0;
    box.open('No.', 'ok', () => ok++);
    expect(button(box, 'ok')!.style.left).toBe('92px'); // the middle - 30
    expect(button(box, 'cancel')!.hidden).toBe(true);
    button(box, 'ok')!.click();
    expect(ok).toBe(1);
  });

  it('the text goes in as text, not markup', () => {
    const box = new MessageBox(art, document);
    box.open('<b>bold</b>', 'ok', () => {});
    const text = box.frame.element.querySelector('.hud-message-text')!;
    expect(text.textContent).toBe('<b>bold</b>');
    expect(text.querySelector('b')).toBeNull();
  });
});

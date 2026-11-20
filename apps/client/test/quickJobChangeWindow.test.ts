// @vitest-environment jsdom
// custom (owner 2026-11-20): the Quick Job Change window and its Yes/No box (world/jobs/quickJobChangeWindow.ts).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { QuickJobChangeWindow } from '../src/world/jobs/quickJobChangeWindow';
import type { QuickJobHost } from '../src/world/jobs/quickJobChangeWindow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

interface Fake extends QuickJobHost {
  said: string[];
  sent: number[];
}

function host(job: number, level: number, expPercent = 0, started: readonly number[] = [], done: readonly number[] = []): Fake {
  return {
    said: [], sent: [],
    job: () => job, level: () => level, expPercent: () => expPercent, sex: () => 0,
    started: (questId) => started.includes(questId) || done.includes(questId),
    done: (questId) => done.includes(questId),
    say(text) { this.said.push(text); },
    send(picked) { this.sent.push(picked); },
  };
}

function made(fake: Fake): QuickJobChangeWindow {
  const window = new QuickJobChangeWindow(fake, art);
  document.body.append(window.element);
  return window;
}

const slots = (window: QuickJobChangeWindow): HTMLElement[] => [...window.element.querySelectorAll<HTMLElement>('[role="radio"]')];
const picked = (window: QuickJobChangeWindow): string | null =>
  window.element.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label') ?? null;
const name = (window: QuickJobChangeWindow): string => window.element.querySelector('[data-control="WIDC_STATIC1"]')!.textContent ?? '';
const text = (window: QuickJobChangeWindow): string => window.element.querySelector('[data-control="WIDC_TEXT1"]')!.textContent ?? '';
const go = (window: QuickJobChangeWindow): HTMLButtonElement => window.element.querySelector<HTMLButtonElement>('[data-control="WIDC_GO"] button')!;
const confirmBox = (): HTMLElement | null => document.querySelector<HTMLElement>('.hud-quick-job-confirm');
const confirmShown = (): boolean => { const box = confirmBox(); return box !== null && box.offsetParent !== undefined && !box.closest('[hidden]') && !box.hidden; };

/** A slot's press: the window takes a click only after a press of its own (the phone's ghost click, as Teleport's). */
function press(window: QuickJobChangeWindow, slot: HTMLElement): void {
  window.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  slot.click();
}

function yes(): void {
  (confirmBox()!.querySelector<HTMLButtonElement>('[data-control="WIDC_YES"]')!).click();
}

describe('the Quick Job Change window', () => {
  it('a Lv15 Vagrant sees four portraits, Mercenary picked, its name and description', () => {
    const window = made(host(0, 15));
    expect(window.open()).toBe(true);
    expect(window.isOpen).toBe(true);
    expect(window.element.querySelector('.hud-window-title')?.textContent).toBe('Quick Job Change');
    expect(slots(window).map((slot) => slot.getAttribute('aria-label'))).toEqual(['Mercenary', 'Acrobat', 'Assist', 'Magician']);
    expect(picked(window)).toBe('Mercenary');
    expect(name(window)).toBe('Mercenary');
    expect(text(window)).toContain('close combat');
    expect(slots(window)[0]!.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/jobs/job1_m.png');
  });

  it('the right arrow picks Acrobat; a click on Magician picks it', () => {
    const window = made(host(0, 15));
    window.open();
    window.element.querySelector<HTMLButtonElement>('[data-control="WIDC_RIGHT"]')!.click();
    expect(picked(window)).toBe('Acrobat');
    expect(name(window)).toBe('Acrobat');
    press(window, slots(window)[3]!);
    expect(picked(window)).toBe('Magician');
    // and the left arrow from the first wraps to the last open one
    press(window, slots(window)[0]!);
    window.element.querySelector<HTMLButtonElement>('[data-control="WIDC_LEFT"]')!.click();
    expect(picked(window)).toBe('Magician');
  });

  it('an Acrobat chain started: only Acrobat is open and picked; the others are locked', () => {
    const window = made(host(0, 15, 0, [53]));
    window.open();
    expect(picked(window)).toBe('Acrobat');
    expect(slots(window).filter((slot) => slot.hasAttribute('data-locked')).map((slot) => slot.dataset.job)).toEqual(['1', '3', '4']);
    press(window, slots(window)[0]!);
    expect(picked(window)).toBe('Acrobat');
  });

  it('a Mercenary with the Knight chain begun and the Blade chain finished sees only Blade open', () => {
    const window = made(host(1, 60, 0, [163], [168, 169, 170, 171, 172]));
    window.open();
    expect(picked(window)).toBe('Blade');
    expect(slots(window).filter((slot) => slot.hasAttribute('data-locked')).map((slot) => slot.getAttribute('aria-label'))).toEqual(['Knight', 'Locked', 'Locked']);
  });

  it('a Mercenary at 60 sees Knight, Blade and two locks', () => {
    const window = made(host(1, 60));
    window.open();
    expect(slots(window).map((slot) => slot.getAttribute('aria-label'))).toEqual(['Knight', 'Blade', 'Locked', 'Locked']);
    expect(slots(window)[2]!.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/icon_lock.png');
  });

  it('a Knight at 120/9999 sees Knight Master with the Master mark', () => {
    const window = made(host(6, 120, 9999));
    window.open();
    expect(picked(window)).toBe('Knight Master');
    const slot = slots(window)[0]!;
    expect(slot.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/jobs/job6_m.png');
    expect(slot.querySelector('.quick-job-mark')!.getAttribute('src')).toBe('/assets/ui/icon_mastermark1.png');
    expect(text(window)).toContain('level 60');
  });

  it('Go! asks "Become an Acrobat? This can\'t be undone."; No sends nothing; Yes sends 2 once', () => {
    const fake = host(0, 15);
    const window = made(fake);
    window.open();
    press(window, slots(window)[1]!);
    go(window).click();
    expect(confirmShown()).toBe(true);
    expect(confirmBox()!.querySelector('[data-control="WIDC_TEXT1"]')!.textContent).toBe("Become an Acrobat? This can't be undone.");
    confirmBox()!.querySelector<HTMLButtonElement>('[data-control="WIDC_NO"]')!.click();
    expect(fake.sent).toEqual([]);
    go(window).click();
    yes();
    expect(fake.sent).toEqual([2]);
  });

  it('sends once: a second Yes within 2,000 ms sends nothing; after it Go! works again', () => {
    vi.useFakeTimers();
    const fake = host(0, 15);
    const window = made(fake);
    window.open();
    go(window).click();
    yes();
    expect(go(window).disabled).toBe(true);
    go(window).click();
    yes();
    expect(fake.sent).toEqual([1]);
    vi.advanceTimersByTime(2000);
    expect(go(window).disabled).toBe(false);
    go(window).click();
    yes();
    expect(fake.sent).toEqual([1, 1]);
  });

  it('open() with nothing due returns false and shows nothing', () => {
    const window = made(host(0, 14));
    expect(window.open()).toBe(false);
    expect(window.isOpen).toBe(false);
  });

  it('toggle() at Lv14 says "Your next job change opens at level 15."', () => {
    const fake = host(0, 14);
    const window = made(fake);
    window.toggle();
    expect(window.isOpen).toBe(false);
    expect(fake.said).toEqual(['Your next job change opens at level 15.']);
  });

  it('jobChanged() closes both boxes', () => {
    const window = made(host(0, 15));
    window.open();
    go(window).click();
    window.jobChanged();
    expect(window.isOpen).toBe(false);
    expect(confirmShown()).toBe(false);
  });

  it('the name is in the group box (white title), not a plain static', () => {
    const window = made(host(0, 15));
    window.open();
    const static1 = window.element.querySelector('[data-control="WIDC_STATIC1"]')!;
    expect(static1.classList.contains('is-group')).toBe(true);
    expect(static1.querySelector('.hud-res-static-text')!.classList.contains('is-centred')).toBe(true);
  });

  it('tells its closing by the player (the pop-up does not come back until the tier changes)', () => {
    const window = made(host(0, 15));
    let closed = 0;
    window.onClosed = () => { closed++; };
    window.open();
    window.close();
    expect(closed).toBe(1);
  });
});

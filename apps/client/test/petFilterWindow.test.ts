// @vitest-environment jsdom
// custom (owner 2026-11-16): the Pet Filter window (hud/petFilterWindow.ts), the Wakazaki pet filter's APP_PETFILTER.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { PET_FILTER_LAYOUT, PetFilterWindow } from '../src/world/hud/petFilterWindow';
import { petFilterBit } from '../src/world/items/petFilter';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

afterEach(() => document.body.replaceChildren());

function opened(mask: number): { window: PetFilterWindow; checks: HTMLButtonElement[] } {
  const window = new PetFilterWindow(art);
  document.body.append(window.window.element);
  window.open(mask);
  return { window, checks: [...window.window.frame.body.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')] };
}

const check = (checks: HTMLButtonElement[], name: string): HTMLButtonElement => checks.find((c) => c.getAttribute('aria-label') === name)!;

describe('the Pet Filter window', () => {
  it('is the post\'s window: five groups, 19 checks at their rects, Apply, the bottom line', () => {
    const { window, checks } = opened(0);
    expect(window.window.frame.element.querySelector('.hud-window-title')!.textContent).toBe('Pet Filter');
    expect([PET_FILTER_LAYOUT.width, PET_FILTER_LAYOUT.height]).toEqual([396, 240]);
    const groups = ['WIDC_STATIC1', 'WIDC_STATIC2', 'WIDC_STATIC4', 'WIDC_STATIC3', 'WIDC_STATIC5'].map((id) => window.window.control(id).textContent);
    expect(groups).toEqual(['Food', 'Accessories', 'Cards', 'Equipment', 'Misc.']);
    expect(window.window.control('WIDC_STATIC6').textContent).toBe('Choose the items you DO NOT want to pick up');
    expect(checks.map((c) => c.getAttribute('aria-label'))).toEqual([
      'HP Food', 'MP Food', 'FP Food', 'Necklace', 'Earring', 'Ring', 'Element Card', '4% Cards', '7% Cards', 'B Cards', 'A Cards',
      'Blue Weapons', 'Green Weapons', 'Blue Set Items', 'Green Set Items', 'Egg', 'Sunstone', 'Moonstone', 'Quest Items',
    ]);
    const card4 = check(checks, '4% Cards');
    expect([card4.style.left, card4.style.top, card4.style.width, card4.style.height]).toEqual(['258px', '50px', '96px', '16px']);
    expect(card4.dataset.control).toBe('WIDC_PF_4PCARD');
    const apply = window.window.button('WIDC_BUTTON1');
    expect([apply.style.left, apply.style.top, apply.style.width]).toEqual(['284px', '150px', '50px']);
    expect(apply.style.backgroundImage).toContain('buttcharapply');
    expect(apply.dataset.word).toBe('Apply');
  });

  it('shows the kept filter checked; Apply hands over the window\'s copy and closes', () => {
    const { window, checks } = opened(petFilterBit('ring') | petFilterBit('card4'));
    expect(checks.filter((c) => c.getAttribute('aria-checked') === 'true').map((c) => c.getAttribute('aria-label'))).toEqual(['Ring', '4% Cards']);
    const applied = vi.fn();
    window.onApply = applied;
    check(checks, 'Ring').click();
    check(checks, 'Egg').click();
    expect(check(checks, 'Ring').getAttribute('aria-checked')).toBe('false');
    expect(check(checks, 'Egg').getAttribute('aria-checked')).toBe('true');
    window.window.button('WIDC_BUTTON1').click();
    expect(applied).toHaveBeenCalledWith(petFilterBit('card4') | petFilterBit('egg'));
    expect(window.isOpen).toBe(false);
  });

  it('drops the changes when it closes another way, and the Start menu line toggles it', () => {
    const { window, checks } = opened(0);
    const applied = vi.fn();
    window.onApply = applied;
    check(checks, 'Sunstone').click();
    window.toggle(0);
    expect(window.isOpen).toBe(false);
    expect(applied).not.toHaveBeenCalled();
    window.toggle(0);
    expect(window.isOpen).toBe(true);
    expect(check(checks, 'Sunstone').getAttribute('aria-checked')).toBe('false');
  });
});

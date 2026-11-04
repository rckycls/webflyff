// @vitest-environment jsdom
// The own buffs' icons (Piece 7 M2, [R §10]): CWndBuffStatus, `_Interface/WndField.cpp:18467-19106`.

import type { WebSkill } from '@flyffweb/formats';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuffShown } from '../src/world/buffs';
import type { UiArt } from '../src/world/hud/art';
import { BuffStatus } from '../src/world/hud/buffStatus';
import { TargetBuffs } from '../src/world/hud/targetBuffs';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const skill = (id: number, name: string, extra: Partial<WebSkill> = {}): WebSkill => ({
  id, name, description: `${name}'s words.`, icon: `ui/icon/skill_${id}.png`, evildoing: 1,
  levels: [{ destParams: [4, -1], adjParams: [2, -1] }, { destParams: [4, -1], adjParams: [4, -1] }, { destParams: [4, -1], adjParams: [6, -1] }],
  ...extra,
} as unknown as WebSkill);
const SKILLS = new Map([[49, skill(49, 'Heap Up')], [20, skill(20, 'Haste')], [61, skill(61, 'Curse', { evildoing: -1 })]]);
const buff = (id: number, leftMs: number, level = 3): BuffShown => ({ buffType: 1, id, level, leftMs, totalMs: 60000 });

afterEach(() => {
  document.body.replaceChildren();
});

describe('BuffStatus (CWndBuffStatus)', () => {
  it('shown while there is a skill buff, gone with the last', () => {
    const status = new BuffStatus(art, document);
    document.body.append(status.element);
    status.update([buff(49, 50000)], SKILLS, 0);
    expect(status.element.hidden).toBe(false);
    status.update([], SKILLS, 1);
    expect(status.element.hidden).toBe(true);
    status.dispose();
  });

  it('7 a row on a 34 px pitch, icons 38.4 px, in ascending skill id', () => {
    const status = new BuffStatus(art, document);
    const ids = [20, 49, 61, 20, 49, 61, 20, 49];
    status.update(ids.map((id) => buff(id, 50000)), SKILLS, 0);
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(icons).toHaveLength(8);
    expect([icons[6]!.style.left, icons[6]!.style.top, icons[7]!.style.left, icons[7]!.style.top]).toEqual(['204px', '0px', '0px', '34px']);
    expect(icons[0]!.style.width).toBe('38.4px');
    expect(icons[0]!.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/icon/skill_20.png');
    status.dispose();
  });

  it('under 20 s the alpha moves 6 a frame between 64 and 192', () => {
    const status = new BuffStatus(art, document);
    const alphas: number[] = [];
    for (let frame = 0; frame < 30; frame++) {
      status.update([buff(49, 10000)], SKILLS, frame);
      alphas.push(Math.round(Number(status.element.querySelector<HTMLElement>('.hud-buff')!.style.opacity) * 255));
    }
    expect(alphas.slice(0, 3)).toEqual([186, 180, 174]);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(64);
    expect(alphas.slice(21, 24)).toEqual([64, 70, 76]);
    // more than 20 s left: 192, still
    status.update([buff(49, 30000)], SKILLS, 31);
    expect(Math.round(Number(status.element.querySelector<HTMLElement>('.hud-buff')!.style.opacity) * 255)).toBe(192);
    status.dispose();
  });

  it('the seconds left show on the icon', () => {
    const status = new BuffStatus(art, document);
    status.update([buff(49, 45500)], SKILLS, 0);
    expect(status.element.querySelector('.hud-buff-seconds')!.textContent).toBe('45');
    status.dispose();
  });

  it('the tooltip has the name, "   Lvl 3", the description, a line per param and mm:ss', () => {
    const status = new BuffStatus(art, document);
    status.update([buff(49, 65000)], SKILLS, 0);
    expect(status.element.querySelector<HTMLElement>('.hud-buff')!.title.split('\n')).toEqual([
      'Heap Up   Lvl 3', "Heap Up's words.", 'STA +6', '01:05',
    ]);
    status.dispose();
  });

  it('a harmful buff is tinted (255, 120, 255)', () => {
    const status = new BuffStatus(art, document);
    status.update([buff(61, 50000), buff(49, 50000)], SKILLS, 0);
    const [heap, curse] = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(curse!.dataset.harmful).toBe('');
    expect(heap!.dataset.harmful).toBeUndefined();
    status.dispose();
  });
});

describe('TargetBuffs (RenderMoverBuff, WndWorld.cpp:10836-11140)', () => {
  it('24 px icons from ((W - 200) / 2 - 20 + 24, 44), 8 a row', () => {
    const target = new TargetBuffs(art, document);
    target.update(Array.from({ length: 9 }, (_, i) => buff([20, 49, 61][i % 3]!, 50000)), SKILLS, 0, 1000);
    const icons = [...target.element.querySelectorAll<HTMLElement>('.hud-target-buff')];
    expect(icons).toHaveLength(9);
    const x0 = (1000 - 200) / 2 - 20 + 24;
    expect([icons[0]!.style.left, icons[0]!.style.top, icons[0]!.style.width]).toEqual([`${x0}px`, '44px', '24px']);
    expect([icons[8]!.style.left, icons[8]!.style.top]).toEqual([`${x0}px`, '68px']);
    target.update([], SKILLS, 1, 1000);
    expect(target.element.hidden).toBe(true);
    target.dispose();
  });
});

describe('the buff box and the world under it (final review, Important 2)', () => {
  it('only the icons take the pointer: the box lets a tap through to the world (CWndBuffStatus::GetHitTestResult)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // the tests run from the repository's root (jsdom's import.meta.url is no file URL)
    const css = readFileSync(resolve('apps/client/src/style.css'), 'utf8');
    const rule = (selector: string): string =>
      css.split('\n').find((line) => line.startsWith(`${selector} {`))?.slice(selector.length) ?? '';
    expect(rule('.hud-buffs')).toMatch(/pointer-events: none/);
    expect(rule('.hud-buff')).toMatch(/pointer-events: auto/);
  });
});

describe('the icons from frame to frame (final review, Minor 6 graded Important)', () => {
  it('an icon is the same element from frame to frame, its seconds updated in place; a new buff list remakes them', () => {
    const status = new BuffStatus(art, document);
    status.update([buff(49, 45500)], SKILLS, 0);
    const first = status.element.querySelector('.hud-buff');
    status.update([buff(49, 44400)], SKILLS, 1);
    expect(status.element.querySelector('.hud-buff')).toBe(first);
    expect(first!.querySelector('.hud-buff-seconds')!.textContent).toBe('44');
    status.update([buff(20, 50000), buff(49, 44000)], SKILLS, 2);
    expect(status.element.querySelectorAll('.hud-buff')).toHaveLength(2);
    status.dispose();
    const target = new TargetBuffs(art, document);
    target.update([buff(49, 45500)], SKILLS, 0, 1000);
    const icon = target.element.querySelector('.hud-target-buff');
    target.update([buff(49, 44400)], SKILLS, 1, 1000);
    expect(target.element.querySelector('.hud-target-buff')).toBe(icon);
    target.dispose();
  });
});

describe('the item buffs and the Scroll of Return (CWndWorld::RenderBuffIcon, WndWorld.cpp:9691-9760; Piece 7 M3)', () => {
  const ITEMS = new Map([
    [10469, { name: 'Scroll of Return', icon: 'ui/item/itm_sysscrreturn.png' }],
    [10270, { name: 'Grilled Eel', icon: 'ui/item/itm_eel.png' }],
  ]);
  const itemBuff = (id: number, leftMs: number): BuffShown => ({ buffType: 0, id, level: 0, leftMs, totalMs: 14_400_000 });

  it("an item buff shows the item's icon, after the skill buffs", () => {
    const status = new BuffStatus(art, document, { items: ITEMS });
    status.update([itemBuff(10270, 3_600_000), buff(49, 50000)], SKILLS, 0);
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(icons.map((i) => i.querySelector('img')!.getAttribute('src')))
      .toEqual(['/assets/ui/icon/skill_49.png', '/assets/ui/item/itm_eel.png']);
    expect(icons[1]!.title).toContain('Grilled Eel');
    // the second, on the next place of the row
    expect(icons[1]!.style.left).toBe('34px');
  });

  it("the Scroll of Return's icon blinks, with hours left", () => {
    const status = new BuffStatus(art, document, { items: ITEMS });
    status.update([itemBuff(10469, 3_600_000)], SKILLS, 0);
    const icon = status.element.querySelector<HTMLElement>('.hud-buff')!;
    const first = Number(icon.style.opacity);
    status.update([itemBuff(10469, 3_599_000)], SKILLS, 1);
    expect(Number(icon.style.opacity)).toBeLessThan(first); // bFlash = TRUE for II_SYS_SYS_SCR_RETURN (:9725)
  });

  it('a double-click on it goes back', () => {
    let back = 0;
    const status = new BuffStatus(art, document, { items: ITEMS, onReturnScroll: () => back++ });
    status.update([itemBuff(10270, 3_600_000), itemBuff(10469, 3_600_000)], SKILLS, 0);
    const [eel, scroll] = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    eel!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(back).toBe(0);
    scroll!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(back).toBe(1);
  });

  it('two taps within 500 ms go back, two 600 ms apart do not', () => {
    let back = 0;
    let now = 1000;
    const status = new BuffStatus(art, document, { items: ITEMS, onReturnScroll: () => back++, now: () => now });
    status.update([itemBuff(10469, 3_600_000)], SKILLS, 0);
    const scroll = status.element.querySelector<HTMLElement>('.hud-buff')!;
    const tap = (): void => void scroll.dispatchEvent(Object.assign(new Event('pointerup', { bubbles: true }), { pointerType: 'touch' }));
    tap();
    now += 600;
    tap();
    expect(back).toBe(0);
    now += 400;
    tap();
    expect(back).toBe(1);
  });
});

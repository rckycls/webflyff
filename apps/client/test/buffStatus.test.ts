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

describe('moving the display (2026-11-05: CWndBuffStatus is dragged by its icons, WndBase.cpp:1251-1276, 1362-1370)', () => {
  /** A layer of `w` x `h` (jsdom lays nothing out) with the display in it. */
  function inLayer(status: BuffStatus, w = 800, h = 600): HTMLElement {
    const layer = document.createElement('div');
    Object.defineProperty(layer, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(layer, 'clientHeight', { value: h, configurable: true });
    layer.append(status.element);
    document.body.append(layer);
    return layer;
  }
  const press = (target: Element, type: string, x: number, y: number): void => {
    target.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 }));
  };

  it('a press on an icon and a move carry it; it stays where it is let go', () => {
    const placed: Array<{ x: number; y: number }> = [];
    const status = new BuffStatus(art, document, { place: { x: 100, y: 100 }, onPlace: (at) => placed.push(at) });
    inLayer(status);
    status.update([buff(49, 50000)], SKILLS, 0);
    expect([status.element.style.left, status.element.style.top]).toEqual(['100px', '100px']);
    const icon = status.element.querySelector('.hud-buff')!;
    press(icon, 'pointerdown', 110, 110);
    press(window as unknown as Element, 'pointermove', 210, 160);
    expect([status.element.style.left, status.element.style.top]).toEqual(['200px', '150px']);
    press(window as unknown as Element, 'pointerup', 210, 160);
    press(window as unknown as Element, 'pointermove', 400, 400);
    expect([status.element.style.left, status.element.style.top]).toEqual(['200px', '150px']);
    expect(placed).toEqual([{ x: 200, y: 150 }]);
    status.dispose();
  });

  it('it stays on its layer, above the task bar, and goes against an edge within 10 px (m_bCling)', () => {
    const status = new BuffStatus(art, document, { place: { x: 100, y: 100 }, layoutBottom: () => 48 });
    inLayer(status, 800, 600);
    status.update([buff(20, 50000), buff(49, 50000)], SKILLS, 0);
    const icon = status.element.querySelector('.hud-buff')!;
    press(icon, 'pointerdown', 100, 100);
    press(window as unknown as Element, 'pointermove', 5, 7); // within 10 px of the top left: against it
    expect([status.element.style.left, status.element.style.top]).toEqual(['0px', '0px']);
    // the icons' extent is two on a row: 34 + 38.4 wide, 38.4 high; the room ends 48 px above the layer's bottom
    press(window as unknown as Element, 'pointermove', 2000, 2000);
    expect([status.element.style.left, status.element.style.top]).toEqual([`${Math.round(800 - 72.4)}px`, `${Math.round(552 - 38.4)}px`]);
    press(window as unknown as Element, 'pointerup', 2000, 2000);
    status.dispose();
  });

  it('a press beside the icons is not taken (the box lets it through), and without a place the CSS one stands', () => {
    const status = new BuffStatus(art, document);
    inLayer(status);
    status.update([buff(49, 50000)], SKILLS, 0);
    expect(status.element.style.left).toBe('');
    press(status.element, 'pointerdown', 10, 10);
    press(window as unknown as Element, 'pointermove', 300, 300);
    expect(status.element.style.left).toBe('');
    status.dispose();
  });

  it('refit keeps a placed display on a layer that got smaller', () => {
    const status = new BuffStatus(art, document, { place: { x: 700, y: 500 } });
    const layer = inLayer(status, 800, 600);
    status.update([buff(49, 50000)], SKILLS, 0);
    Object.defineProperty(layer, 'clientWidth', { value: 400 });
    Object.defineProperty(layer, 'clientHeight', { value: 300 });
    status.refit();
    expect([status.element.style.left, status.element.style.top]).toEqual([`${Math.round(400 - 38.4)}px`, `${Math.round(300 - 38.4)}px`]);
    status.dispose();
  });
});

describe('on a phone (2026-11-05, the owner: half size)', () => {
  it('icons 19.2 px on a 17 px pitch, 7 a row', () => {
    const status = new BuffStatus(art, document, { phone: () => true });
    status.update([20, 49, 61, 20, 49, 61, 20, 49].map((id) => buff(id, 50000)), SKILLS, 0);
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect([icons[1]!.style.left, icons[7]!.style.top, icons[0]!.style.width]).toEqual(['17px', '17px', '19.2px']);
    expect(status.element.dataset.phone).toBe('');
    status.dispose();
  });

  it('turned into a desktop size again, the icons are full size', () => {
    let phone = true;
    const status = new BuffStatus(art, document, { phone: () => phone });
    status.update([buff(49, 50000)], SKILLS, 0);
    phone = false;
    status.update([buff(49, 49000)], SKILLS, 1);
    expect(status.element.querySelector<HTMLElement>('.hud-buff')!.style.width).toBe('38.4px');
    expect(status.element.dataset.phone).toBeUndefined();
    status.dispose();
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

  it("the feed pocket's double-click turns it off (SendFeedPocketInactive, WndWorld.cpp:7280-7283; pets R3)", () => {
    let off = 0, back = 0;
    const items = new Map([...ITEMS, [21035, { name: 'Feed Bag', icon: 'ui/item/itm_syssysscrpetfeedpocket.png' }]]);
    const status = new BuffStatus(art, document, { items, onFeedPocket: () => off++, onReturnScroll: () => back++ });
    status.update([itemBuff(10270, 3_600_000), itemBuff(21035, 3_600_000)], SKILLS, 0);
    const [eel, pocket] = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    eel!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(off).toBe(0);
    pocket!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect([off, back]).toEqual([1, 0]);
  });

  it("an item buff's time is under it in RenderOptBuffTime's units; 999999999 ms shows none (WndWorld.cpp:9315-9330, 11197-11227)", () => {
    const texts = (tid: string): string | undefined =>
      ({ TID_PK_LIMIT_DAY: '%.1dday', TID_PK_LIMIT_HOUR: '%.1dhr', TID_PK_LIMIT_MINUTE: '%.1dmin', TID_PK_LIMIT_SECOND: '%.1dsec' })[tid];
    const status = new BuffStatus(art, document, { items: ITEMS, texts });
    const time = (leftMs: number, totalMs = 14_400_000): string | null | undefined => {
      status.update([{ buffType: 0, id: 10270, level: 0, leftMs, totalMs }], SKILLS, 0);
      return status.element.querySelector('.hud-buff-time')?.textContent;
    };
    expect(time(2 * 86_400_000 + 5000, 3 * 86_400_000)).toBe('2day');
    expect(time(3 * 3_600_000 + 1000)).toBe('3hr');
    expect(time(59 * 60_000 + 59_000)).toBe('59min');
    expect(time(45_500)).toBe('45sec');
    expect(time(5_000_000, 999_999_999)).toBeUndefined();
    expect(status.element.querySelector('.hud-buff-seconds')).toBeNull();
  });

  it("a BUFF_ITEM2's time is its level, the seconds it had left (CBuffItem2::SerializeLevel, buff.cpp:604-620)", () => {
    const status = new BuffStatus(art, document, { items: ITEMS });
    status.update([{ buffType: 3, id: 10270, level: 7200, leftMs: 7_190_000, totalMs: 7_200_000 }], SKILLS, 0);
    expect(status.element.querySelector<HTMLElement>('.hud-buff')!.title.split('\n')).toEqual(['Grilled Eel', '01:59:50']);
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

describe('the ES scrolls (CWndWorld::RenderExpBuffIcon, WndWorld.cpp:10236-10517)', () => {
  const ES = new Map([
    [26205, { name: 'Scroll of Amplification ES20', icon: 'ui/item/itm_sysscrampesa.png' }],
    [26206, { name: 'Scroll of Amplification ES1', icon: 'ui/item/itm_sysscrampesa1.png' }],
    [26207, { name: 'Scroll of Amplification ES2', icon: 'ui/item/itm_sysscrampesa2.png' }],
    [30148, { name: 'Scroll of Amplification ES (S)', icon: 'ui/item/itm_sysscrampess.png' }],
    [30149, { name: 'Scroll of Amplification ES (S1)', icon: 'ui/item/itm_sysscrampess.png' }],
    [30150, { name: 'Scroll of Amplification ES (S2)', icon: 'ui/item/itm_sysscrampess.png' }],
  ]);
  const TEXTS: Record<string, string> = {
    TID_GAME_EXPITEM_TOOLTIP: 'Acquired EXP', TID_GAME_EXPITEM_TOOLTIP1: 'Increases', TID_GAME_EXP_COUTMSG0: 'The time left',
    TID_GAME_EXP_COUTMSG1: 'First:', TID_GAME_EXP_COUTMSG2: 'Second:', TID_GAME_EXP_COUTMSG3: 'Third:',
  };
  const es = (id: number, leftMs: number): BuffShown => ({ buffType: 0, id, level: 0, leftMs, totalMs: 3_600_000 });

  it('A, A1 and A2 share one icon of A, the second and third at half size under it', () => {
    const status = new BuffStatus(art, document, { items: ES, texts: (tid) => TEXTS[tid] });
    status.update([es(26205, 3_000_000), es(26206, 1_500_000), es(26207, 65_000)], SKILLS, 0, { level: 30 });
    const icons = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(icons).toHaveLength(1);
    const imgs = [...icons[0]!.querySelectorAll('img')];
    expect(imgs.map((img) => img.getAttribute('src'))).toEqual(Array(3).fill('/assets/ui/item/itm_sysscrampesa.png'));
    expect([imgs[1]!.style.left, imgs[1]!.style.top, imgs[1]!.style.width]).toEqual(['6px', '36px', '19.2px']);
    expect(imgs[2]!.style.left).toBe('26.4px');
    expect(icons[0]!.title.split('\n')).toEqual([
      'Scroll of Amplification ES20', 'Acquired EXP 150% Increases', 'The time left', '  First: 50:00 ', '  Second: 25:00 ',
      '  Third: 01:05 ',
    ]);
    // no blinking, and no time under it
    expect(icons[0]!.style.opacity).toBe(String(192 / 255));
    expect(icons[0]!.querySelector('.hud-buff-time')).toBeNull();
    status.dispose();
  });

  it('the bonus by count and level: 1 is 50%, 2 is 100% under 61, 3 is 100% from 41 (the S scroll as under 41)', () => {
    const status = new BuffStatus(art, document, { items: ES, texts: (tid) => TEXTS[tid] });
    const bonus = (ids: number[], level: number): string => {
      status.update(ids.map((id) => es(id, 600_000)), SKILLS, 0, { level });
      return status.element.querySelector<HTMLElement>('.hud-buff')!.title.split('\n')[1]!;
    };
    expect(bonus([26205], 70)).toBe('Acquired EXP 50% Increases');
    expect(bonus([26205, 26206], 60)).toBe('Acquired EXP 100% Increases');
    expect(bonus([26205, 26206], 61)).toBe('Acquired EXP 50% Increases');
    expect(bonus([26205, 26206, 26207], 50)).toBe('Acquired EXP 100% Increases');
    expect(bonus([30148, 30149, 30150], 90)).toBe('Acquired EXP 150% Increases');
    status.dispose();
  });
});

describe('the premium timers (SM modes, CWndWorld::RenderSMBuff, WndWorld.cpp:10519-10624)', () => {
  const ITEMS = new Map([
    [10212, { name: 'Full Shout 15', icon: 'ui/item/itm_shout.png' }],
    [10430, { name: 'Scroll of Blessing', icon: 'ui/item/itm_blessing.png', circleTime: 1 }],
    [10209, { name: 'Bull Hamstern', icon: 'ui/item/itm_ham.png', circleTime: 900 }],
    [10366, { name: 'STR Penalty', icon: 'ui/item/itm_penstr.png' }],
  ]);
  const TEXTS: Record<string, string> = { TID_GAME_COND_USE: 'Takes effect when player dies.', TID_PK_LIMIT_MINUTE: '%.1dmin', TID_PK_LIMIT_SECOND: '%.1dsec' };
  const make = () => new BuffStatus(art, document, { items: ITEMS, texts: (tid) => TEXTS[tid] });

  it("shown only in its last 30 minutes (to 30:59), with its item's icon and the time left", () => {
    const status = make();
    status.update([], SKILLS, 0, { sm: [{ type: 4, seconds: 31 * 60 }] });
    expect(status.element.hidden).toBe(true);
    status.update([], SKILLS, 1, { sm: [{ type: 4, seconds: 30 * 60 + 59 }] });
    const icon = status.element.querySelector<HTMLElement>('.hud-buff')!;
    expect(icon.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/item/itm_shout.png');
    expect(icon.title.split('\n')).toEqual(['Full Shout 15', '30:59']);
    expect(icon.querySelector('.hud-buff-time')!.textContent).toBe('30min');
    status.dispose();
  });

  it('the stat penalties always show; Blessing says when it works, with no time and no blinking', () => {
    const status = make();
    status.update([], SKILLS, 0, { sm: [{ type: 11, seconds: 7200 }, { type: 20, seconds: 30 }] });
    const [penalty, blessing] = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')];
    expect(penalty!.title.split('\n')).toEqual(['STR Penalty', '02:00:00']);
    expect(blessing!.title.split('\n')).toEqual(['Scroll of Blessing', 'Takes effect when player dies.']);
    expect(blessing!.querySelector('.hud-buff-time')).toBeNull();
    status.update([], SKILLS, 1, { sm: [{ type: 11, seconds: 7199 }, { type: 20, seconds: 30 }] });
    expect(blessing!.style.opacity).toBe(String(192 / 255));
    status.dispose();
  });

  it('under 60 s it blinks; a resist mode with no element known is left out', () => {
    const status = make();
    status.update([], SKILLS, 0, { sm: [{ type: 8, seconds: 59 }, { type: 16, seconds: 50 }] });
    const icons = status.element.querySelectorAll<HTMLElement>('.hud-buff');
    expect(icons).toHaveLength(1);
    expect(Number(icons[0]!.style.opacity)).toBeLessThan(192 / 255);
    status.dispose();
  });

  it("the element stones (16-18) show their element's stone (OnResistSMMode, DPClient.cpp:6070-6125)", () => {
    const stones = new Map([
      [10277, { name: 'Fire Stone', icon: 'ui/item/itm_fire.png' }], [10280, { name: 'Lightning Stone', icon: 'ui/item/itm_elec.png' }],
      [10284, { name: 'Wind Defense Stone', icon: 'ui/item/itm_dewind.png' }],
    ]);
    const status = new BuffStatus(art, document, { items: stones, texts: (tid) => TEXTS[tid] });
    status.update([], SKILLS, 0, {
      sm: [{ type: 16, seconds: 600 }, { type: 17, seconds: 600 }, { type: 18, seconds: 600 }],
      resist: { left: 1, right: 3, defense: 4 }, // FIRE, ELECTRICITY, WIND
    });
    const names = [...status.element.querySelectorAll<HTMLElement>('.hud-buff')].map((icon) => icon.title.split('\n')[0]);
    expect(names).toEqual(['Fire Stone', 'Lightning Stone', 'Wind Defense Stone']);
    status.update([], SKILLS, 1, { sm: [{ type: 16, seconds: 600 }], resist: { left: 0xff, right: 0xff, defense: 0xff } });
    expect(status.element.hidden).toBe(true);
    status.dispose();
  });
});

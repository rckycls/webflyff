// @vitest-environment jsdom
// The phone's window shortcuts at the top right (2026-11-10, owner): each shows the icon Neuz's Start menu gives the same
// window, alone, with no box; a shortcut with no such icon keeps its text.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppId } from '../src/world/hud/applets';
import type { UiArt } from '../src/world/hud/art';
import { MOBILE_SHORTCUTS, MobileTools, iconCssSize, shortcutTip, startMenuName } from '../src/world/hud/mobileTools';

const art = (have: (key: string) => boolean = () => true): UiArt => ({
  url: (key) => (have(key) ? `/assets/${key}` : ''),
  sheets: null,
});

afterEach(() => {
  document.body.replaceChildren();
});

function rig(uiArt = art()) {
  const run = { skill: vi.fn(), bag: vi.fn(), character: vi.fn(), stats: vi.fn() };
  const tools = new MobileTools(uiArt, [
    { label: 'Skill', applet: AppId.SKILL3, run: run.skill },
    { label: 'Bag', applet: AppId.INVENTORY, run: run.bag },
    { label: 'Character', applet: AppId.CHARACTER3, run: run.character },
    { label: 'Stats', applet: null, run: run.stats },
  ], document);
  document.body.append(tools.element);
  const button = (label: string) => tools.buttons.find((b) => b.getAttribute('aria-label') === label)!;
  return { run, tools, button };
}

describe('MOBILE_SHORTCUTS (2026-11-10, owner: the important windows of the Start menu)', () => {
  it("lists ten windows in two rows of five (2026-11-20, owner: the Teleport in Auto Play's place, rearranged), each with its applet's icon", () => {
    expect(MOBILE_SHORTCUTS.map(({ label, applet, window }) => [label, applet, window])).toEqual([
      ['Character', AppId.CHARACTER3, 'character'],
      ['Bag', AppId.INVENTORY, 'inventory'],
      ['Skill', AppId.SKILL3, 'skills'],
      ['Quest', AppId.QUEST_EX_LIST, 'quests'],
      ['Teleport', AppId.TELEPORT, 'teleport'],
      ['World Map', AppId.MAP, 'worldmap'],
      ['Party', AppId.PARTY, 'party'],
      ['Messenger', AppId.MESSENGER_EX, 'messenger'],
      ['Pet Filter', AppId.PETFILTER, 'petFilter'],
      ['Siege Ranking', AppId.SIEGE_RANKING, 'siegeRanking'],
    ]);
  });

  it('ranks them in their order but Character after Bag and Skill', () => {
    const byRank = [...MOBILE_SHORTCUTS].sort((a, b) => a.rank - b.rank).map(({ label }) => label);
    expect(byRank).toEqual(['Bag', 'Skill', 'Character', 'Quest', 'Teleport', 'World Map', 'Party', 'Messenger', 'Pet Filter', 'Siege Ranking']);
  });

  it("shows the client's own windows' icons without their frame (src/icons/bare, ownIcons.ts)", () => {
    const tools = new MobileTools(art(), MOBILE_SHORTCUTS.map((shortcut) => ({ ...shortcut, run: () => {} })), document);
    const icon = (label: string) => tools.buttons.find((b) => b.getAttribute('aria-label') === label)!
      .querySelector<HTMLElement>('.hud-mobile-tool-icon')!.style.backgroundImage;
    expect(icon('Teleport')).toBe('url("/assets/ui/bare/icon_teleport.png")');
    expect(icon('Pet Filter')).toBe('url("/assets/ui/bare/icon_petfilter.png")');
    expect(icon('Siege Ranking')).toBe('url("/assets/ui/bare/icon_siegeranking.png")');
    tools.dispose();
  });

  it('marks each button with its rank', () => {
    const tools = new MobileTools(art(), MOBILE_SHORTCUTS.map((shortcut) => ({ ...shortcut, run: () => {} })), document);
    expect(tools.buttons.map((b) => [b.getAttribute('aria-label'), b.dataset.rank])).toEqual(
      MOBILE_SHORTCUTS.map(({ label, rank }) => [label, String(rank)]),
    );
    tools.dispose();
  });
});

describe('MobileTools', () => {
  it('is a toolbar named Window shortcuts', () => {
    const { tools } = rig();
    expect(tools.element.getAttribute('role')).toBe('toolbar');
    expect(tools.element.getAttribute('aria-label')).toBe('Window shortcuts');
    expect(tools.element.classList.contains('hud-mobile-tools')).toBe(true);
    tools.dispose();
  });

  it("shows each applet's Start-menu icon and no text, its name as label (no browser tooltip: the task bar's, below)", () => {
    const { tools, button } = rig();
    for (const [label, key] of [
      ['Skill', 'ui/bare/icon_skill.png'], ['Bag', 'ui/bare/icon_inventory.png'], ['Character', 'ui/bare/icon_character.png'],
    ] as const) {
      const b = button(label);
      expect(b.title).toBe('');
      expect(b.textContent).toBe('');
      expect(b.dataset.icon).toBe('');
      const icon = b.querySelector<HTMLElement>('.hud-mobile-tool-icon')!;
      expect(icon.style.backgroundImage).toBe(`url("/assets/${key}")`);
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    }
    tools.dispose();
  });

  it('keeps the text of a shortcut with no Start-menu icon', () => {
    const { tools, button } = rig();
    const stats = button('Stats');
    expect(stats.textContent).toBe('Stats');
    expect(stats.title).toBe('Stats');
    expect(stats.dataset.icon).toBeUndefined();
    expect(stats.querySelector('.hud-mobile-tool-icon')).toBeNull();
    tools.dispose();
  });

  it('shows the framed icon when its frameless copy was not converted', () => {
    const { tools, button } = rig(art((key) => !key.startsWith('ui/bare/')));
    expect(button('Skill').querySelector<HTMLElement>('.hud-mobile-tool-icon')!.style.backgroundImage)
      .toBe('url("/assets/ui/icon_skill.png")');
    tools.dispose();
  });

  it('keeps the text when the icon picture is missing', () => {
    const { tools, button } = rig(art((key) => !key.endsWith('icon_skill.png')));
    expect(button('Skill').textContent).toBe('Skill');
    expect(button('Skill').dataset.icon).toBeUndefined();
    expect(button('Bag').dataset.icon).toBe('');
    tools.dispose();
  });

  it('runs the action of the shortcut pressed', () => {
    const { run, tools, button } = rig();
    button('Bag').click();
    button('Stats').click();
    expect(run.bag).toHaveBeenCalledOnce();
    expect(run.stats).toHaveBeenCalledOnce();
    expect(run.skill).not.toHaveBeenCalled();
    tools.dispose();
  });

  it('sizes the icons to a whole multiple of their 32 px in device pixels, for the whole page (the target bar steps aside)', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2.625 });
    const { tools, button } = rig();
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--hud-mobile-icon')).toBe(`${(32 * 3) / 2.625}px`);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    window.dispatchEvent(new Event('resize'));
    expect(root.getPropertyValue('--hud-mobile-icon')).toBe('32px');
    expect(button('Skill')).toBeDefined();
    tools.dispose();
    expect(root.getPropertyValue('--hud-mobile-icon')).toBe('');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
  });
});

// 2026-11-20 (owner, "add the 10 icons like mobile in desktop as well"): under the mouse, the task bar's applet tooltip
// (PutTooTip, WndTaskBar.cpp:548-569): the Start menu's name, and "[Hotkey H]" in blue for one with a hotkey
describe('the shortcuts\' tooltips (desktop)', () => {
  const hover = (button: HTMLElement, pointerType: string, type = 'pointerenter') => {
    const event = new Event(type);
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    button.dispatchEvent(event);
  };
  const tip = () => document.querySelector<HTMLElement>('.hud-shortcut-tooltip');

  it("names each of the ten as the Start menu's line does, with the Start menu's hotkey", () => {
    expect(MOBILE_SHORTCUTS.map(({ applet, label }) => shortcutTip(applet, label).map((line) => line.map((run) => run.text).join(''))))
      .toEqual([
        ['Character', '[Hotkey H]'], ['Inventory', '[Hotkey I]'], ['Skills', '[Hotkey K]'], ['Quest Diary', '[Hotkey Q]'],
        ['Teleport'], ['World Map', '[Hotkey M]'], ['Party', '[Hotkey P]'], ['Messenger', '[Hotkey E]'], ['Pet Filter', '[Hotkey U]'],
        ['Siege Ranking'],
      ]);
    expect(startMenuName(AppId.PARTY)).toBe('Party'); // in the Community folder
    expect(startMenuName(1)).toBeNull();
  });

  it('the name in black, the hotkey line in blue, in the texts catalog\'s word', () => {
    expect(shortcutTip(AppId.INVENTORY, 'Bag', 'Raccourci')).toEqual([
      [{ text: 'Inventory', color: 0x000000 }], [{ text: '[Raccourci I]', color: 0x0000ff }],
    ]);
  });

  it('shows the tooltip while the mouse is over an icon, not for a finger; a press or leaving takes it away', () => {
    const { tools, button } = rig();
    hover(button('Bag'), 'touch');
    expect(tip()).toBeNull();
    hover(button('Bag'), 'mouse');
    expect(tip()!.textContent).toBe('Inventory[Hotkey I]');
    expect(tip()!.classList.contains('hud-taskbar-tooltip')).toBe(true);
    hover(button('Bag'), 'mouse', 'pointerleave');
    expect(tip()).toBeNull();
    hover(button('Skill'), 'mouse');
    expect(tip()!.textContent).toBe('Skills[Hotkey K]');
    button('Skill').click();
    expect(tip()).toBeNull();
    hover(button('Skill'), 'mouse');
    tools.dispose();
    expect(tip()).toBeNull();
  });
});

describe('iconCssSize', () => {
  it('is 32 CSS px at a whole pixel ratio', () => {
    expect(iconCssSize(1)).toBe(32);
    expect(iconCssSize(2)).toBe(32);
    expect(iconCssSize(3)).toBe(32);
  });

  it('is the nearest whole multiple of 32 device px, never under 32, at any other ratio', () => {
    expect(iconCssSize(2.625) * 2.625).toBeCloseTo(96);
    expect(iconCssSize(1.5) * 1.5).toBeCloseTo(64);
    expect(iconCssSize(1.25) * 1.25).toBeCloseTo(32);
    expect(iconCssSize(0.8) * 0.8).toBeCloseTo(32);
  });

  it('is 32 for a ratio it cannot read', () => {
    expect(iconCssSize(Number.NaN)).toBe(32);
    expect(iconCssSize(0)).toBe(32);
  });
});

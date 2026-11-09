// @vitest-environment jsdom
// The phone's window shortcuts at the top right (2026-11-10, owner): each shows the icon Neuz's Start menu gives the same
// window, alone, with no box; a shortcut with no such icon keeps its text.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppId } from '../src/world/hud/applets';
import type { UiArt } from '../src/world/hud/art';
import { MobileTools, iconCssSize } from '../src/world/hud/mobileTools';

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

describe('MobileTools', () => {
  it('is a toolbar named Window shortcuts', () => {
    const { tools } = rig();
    expect(tools.element.getAttribute('role')).toBe('toolbar');
    expect(tools.element.getAttribute('aria-label')).toBe('Window shortcuts');
    expect(tools.element.classList.contains('hud-mobile-tools')).toBe(true);
    tools.dispose();
  });

  it("shows each applet's Start-menu icon and no text, its name as label and tooltip", () => {
    const { tools, button } = rig();
    for (const [label, key] of [
      ['Skill', 'ui/bare/icon_skill.png'], ['Bag', 'ui/bare/icon_inventory.png'], ['Character', 'ui/bare/icon_character.png'],
    ] as const) {
      const b = button(label);
      expect(b.title).toBe(label);
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

  it('sizes the icons to a whole multiple of their 32 px in device pixels', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2.625 });
    const { tools, button } = rig();
    expect(tools.element.style.getPropertyValue('--hud-mobile-icon')).toBe(`${(32 * 3) / 2.625}px`);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    window.dispatchEvent(new Event('resize'));
    expect(tools.element.style.getPropertyValue('--hud-mobile-icon')).toBe('32px');
    expect(button('Skill')).toBeDefined();
    tools.dispose();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
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

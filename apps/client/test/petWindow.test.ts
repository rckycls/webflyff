// @vitest-environment jsdom
// pets R2: the raised pet's status window (CWndPetStatus). The pretend world's bundles (testkit writers, protocol readers)
// drive it as the world opens and closes it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, Group } from 'three';
import type { PetData } from '@flyffweb/protocol';
import { writePetCall, writePetRelease } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import type { AssembledCharacter } from '@flyffweb/scene';
import { ServerClock } from '../src/net/serverClock';
import { WindowFrame } from '../src/world/hud/frame';
import { MMI } from '../src/world/hud/moverMenu';
import { PetStatusWindow } from '../src/world/hud/petStatusWindow';
import { OwnState } from '../src/world/OwnState';
import type { PetChange } from '../src/world/OwnState';
import { PetWindows } from '../src/world/pets/petWindows';
import type { PetWindowsHost } from '../src/world/pets/petWindows';
import { petMoverId } from '../src/world/pets/raisedPet';
import { EGG_CAMERA, PET_CAMERAS, petCamera } from '../src/world/render/petPortrait';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';
import { OWN_ID, STARTER_EQUIPMENT } from './helpers/ownState';
import { EGG_SLOT, MI_TIGER_D, TIGER_C, art, ownAddObj, pet, petData, petItem, read } from './helpers/petData';

afterEach(() => {
  document.body.replaceChildren();
});

// ---- the window --------------------------------------------------------------------------------------------------

function statusFrame(): WindowFrame {
  const frame = new WindowFrame('', art, { width: 220, height: 112, texture: 'WndStatus2.tga' }, document);
  document.body.append(frame.element);
  frame.open({ x: 0, y: 0 });
  return frame;
}

function openWindow(status: WindowFrame | null = statusFrame()): PetStatusWindow {
  const window = new PetStatusWindow(art, petData(), document);
  document.body.append(window.window.element);
  window.open(status);
  return window;
}

const at = (window: PetStatusWindow, selector: string): HTMLElement[] =>
  [...window.frame.element.querySelectorAll<HTMLElement>(selector)];

describe('CWndPetStatus (hud/petStatusWindow.ts)', () => {
  it('gives the portrait the egg\'s camera, each kind\'s, and the mana unicorn the unicorn\'s (SetPetCamTable)', () => {
    expect(petCamera(0, 3)).toBe(EGG_CAMERA);
    expect(petCamera(2, 0)).toEqual({ pos: [1.2, 4.6, -7], lookAt: [-2.4, 3, 0], scale: 6 });
    expect(petCamera(5, 7)).toBe(PET_CAMERAS[6]);
    expect(petCamera(1, 8)).toBeNull();
  });

  it('opens beside the status window, collapsed to 112 px, its numbers in mode 2 (OnInitialUpdate, SetExtension)', () => {
    const window = openWindow();
    expect(window.isOpen).toBe(true);
    expect(window.frame.position).toEqual({ x: 220, y: 0 });
    expect(window.frame.element.style.height).toBe('112px');
    expect(window.state).toEqual({ display: 2, extension: false, choice: -1 });
    // with no status window open: the layout's left + 192
    const alone = openWindow(null);
    expect(alone.frame.position).toEqual({ x: 192, y: 0 });
  });

  it('draws the title, grade, stat, life, gauges and numbers of the pet (DrawPetInformation, OnDraw)', () => {
    const window = openWindow();
    window.update(petItem(TIGER_C));
    expect(window.frame.element.getAttribute('aria-label')).toBe('White Tiger');
    expect(at(window, '.hud-pet-label').map((e) => e.textContent)).toEqual(['Level', 'Ability', 'P.Hp', 'Exp']);
    expect(at(window, '.hud-pet-value').map((e) => e.textContent)).toEqual(['STR +5', 'C Level', '3']);
    // MakeGaugeVertex: 75 * 150 / 300, and (75 / 100000) * 12345 in floats
    expect(at(window, '[data-gauge]').map((g) => [g.dataset.gauge, g.dataset.width])).toEqual([['energy', '37'], ['exp', '9']]);
    // mode 2: the energy at 116 - 3 * 2.6, the most at 154 - 3 * 2, the slash at 135; the EXP ending at 170 (5.8 a letter)
    const numbers = at(window, '.hud-pet-number').map((e) => [e.textContent, e.style.left]);
    expect(numbers).toEqual([['150', '109px'], ['300', '148px'], ['/', '135px'], ['12.34%', '136px']]);
  });

  it('cycles its numbers 2, 0, 1 with a press, not with its button\'s (OnLButtonDown)', () => {
    const window = openWindow();
    const press = (target: Element): void => { target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); };
    press(window.frame.body);
    window.update(petItem(TIGER_C));
    expect(window.state.display).toBe(0);
    expect(at(window, '.hud-pet-number').map((e) => e.textContent)).toEqual(['', '', '', '']);
    press(window.portraitBox());
    window.update(petItem(TIGER_C));
    // mode 1: MulDiv( 150, 100, 300 ) at 107, "150p" ending at 170 (5.8 a letter), no slash
    const [percent, points, slash, exp] = at(window, '.hud-pet-number');
    expect([percent!.textContent, percent!.style.left, points!.textContent, points!.style.left]).toEqual(['50%', '107px', '150p', '147px']);
    expect([slash!.textContent, exp!.textContent]).toEqual(['', '12.34%']);
    press(window.frame.element.querySelector('[data-control="WIDC_BUTTON1"]')!);
    expect(window.state.display).toBe(1);
  });

  it('an egg: its prop name, "None", no life, its EXP of 50,000; a unicorn\'s rate stat in percent', () => {
    const window = openWindow();
    window.update(petItem(pet({ exp: 25000, life: 1 })));
    expect(window.frame.element.getAttribute('aria-label')).toBe('Pet Egg');
    expect(at(window, '.hud-pet-value').map((e) => e.textContent)).toEqual(['None', 'Egg', '0']);
    expect(at(window, '.hud-pet-number').at(-1)!.textContent).toBe('50.00%');
    window.update(petItem({ ...TIGER_C, kind: 6 }));
    expect(at(window, '.hud-pet-value')[0]!.textContent).toBe('Increased HP +5%');
  });

  it('shows its steps 48 px taller with WIDC_BUTTON1: an icon a level at alpha 120, lit and said under the pointer', () => {
    const window = openWindow();
    window.update(petItem(TIGER_C));
    window.frame.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON1"]')!.click();
    window.update(petItem(TIGER_C));
    expect(window.frame.element.style.height).toBe('160px');
    expect(window.frame.element.querySelector<HTMLElement>('.hud-pet-steps')!.hidden).toBe(false);
    const icons = at(window, '.hud-pet-step').filter((icon) => !icon.hidden);
    expect(icons.map((icon) => [icon.getAttribute('src'), icon.style.left, icon.style.opacity])).toEqual([
      ['/assets/ui/icon_petlevel1_s.png', '4px', String(120 / 255)],
      ['/assets/ui/icon_petlevel3_s.png', '39px', String(120 / 255)],
    ]);
    // the cells are 34 px wide from the box's left (6), for D up to the pet's level
    const cells = at(window, '.hud-pet-step-cell').filter((cell) => !cell.hidden);
    expect(cells.map((cell) => cell.style.left)).toEqual(['6px', '40px']);
    cells[1]!.dispatchEvent(new MouseEvent('pointerenter'));
    window.update(petItem(TIGER_C));
    expect(window.state.choice).toBe(2);
    expect(at(window, '.hud-pet-step').filter((icon) => !icon.hidden)[1]!.style.opacity).toBe('1');
    const tooltip = window.frame.element.querySelector<HTMLElement>('.hud-pet-tooltip')!;
    expect(tooltip.textContent).toBe('STR +4');
    expect(tooltip.querySelector('span')!.style.color).toBe('rgb(255, 0, 0)');
    cells[1]!.dispatchEvent(new MouseEvent('pointerleave'));
    expect(window.state.choice).toBe(-1);
    expect(window.frame.element.querySelector('.hud-pet-tooltip')).toBeNull();
    // collapsed again
    window.frame.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON1"]')!.click();
    expect(window.frame.element.style.height).toBe('112px');
    expect(window.frame.element.querySelector<HTMLElement>('.hud-pet-steps')!.hidden).toBe(true);
  });

  it('keeps a locked level\'s old step while the miracle window rolls (LockShowLevel, R3)', () => {
    const window = openWindow();
    window.frame.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON1"]')!.click();
    window.update(petItem(TIGER_C));
    window.lockShowLevel(true, 2, 0);
    const rolled = { ...TIGER_C, availLevels: [1, 6, 0, 0, 0, 0] };
    window.update(petItem(rolled));
    const src = (): string[] => at(window, '.hud-pet-step').filter((icon) => !icon.hidden).map((icon) => icon.getAttribute('src')!);
    expect(src()[1]).toBe('/assets/ui/icon_petlevel3_s.png');
    window.lockShowLevel(false, 2, 0);
    window.update(petItem(rolled));
    expect(src()[1]).toBe('/assets/ui/icon_petlevel6_s.png');
  });

  it('opens as made again: mode 2, collapsed', () => {
    const window = openWindow();
    window.frame.element.querySelector<HTMLButtonElement>('[data-control="WIDC_BUTTON1"]')!.click();
    window.frame.body.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
    window.close();
    window.open(null);
    expect(window.state).toEqual({ display: 2, extension: false, choice: -1 });
    expect(window.frame.element.style.height).toBe('112px');
  });
});

// ---- the window in the pretend world -----------------------------------------------------------------------------

function fakeModel(): AssembledCharacter {
  const root = new Group();
  return { root, mixer: new AnimationMixer(root), release: vi.fn() } as unknown as AssembledCharacter;
}

/** A world with the own pet item `bagPet` (out when `out`), and its pet windows fed the world's own events. */
function pretendWorld(bagPet: PetData, out: boolean) {
  const data = petData();
  const added = ownAddObj(bagPet, out);
  const own = new OwnState(data, added, STARTER_EQUIPMENT);
  const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
  world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
  const models: AssembledCharacter[] = [];
  const host: PetWindowsHost = {
    own: () => own,
    statusFrame: () => null,
    sendPetRelease: vi.fn(),
    petMover: () => world.movers.get(petMoverId(OWN_ID)),
    loadPortrait: vi.fn(async () => { const model = fakeModel(); models.push(model); return { model, motion: null }; }),
    renderer: () => null,
    miracle: vi.fn(),
  };
  const windows = new PetWindows(art, data, host, document);
  document.body.append(windows.element);
  const step = (n = 1): PetChange[] => {
    for (let i = 0; i < n; i++) world.step();
    const changes = world.takeChanges().own.flatMap((e) => (e.kind === 'pet' ? [e.change] : []));
    for (const change of changes) windows.onPet(change);
    return changes;
  };
  const send = (...messages: ScriptMessage[]): void => { for (const { objectId, value } of read(messages)) world.apply(objectId, value); };
  return { world, own, host, windows, step, send, models };
}

describe('the pet window as the world opens and closes it (pets/petWindows.ts)', () => {
  it('opens when the pet comes back after a relog (ProcessPet), and draws the pet item', () => {
    const p = pretendWorld(TIGER_C, true);
    expect(p.windows.status.isOpen).toBe(false);
    expect(p.step()).toEqual([{ kind: 'shown', levelup: 0 }]);
    expect(p.windows.status.isOpen).toBe(true);
    p.windows.frame();
    expect(p.windows.status.frame.element.getAttribute('aria-label')).toBe('White Tiger');
  });

  it('closes on PET_RELEASE, opens again on the next PET_CALL\'s pet (OnPetRelease, ProcessPet)', () => {
    const p = pretendWorld(TIGER_C, true);
    p.step();
    p.send(writePetRelease(OWN_ID));
    expect(p.step()).toEqual([{ kind: 'released' }]);
    expect(p.windows.status.isOpen).toBe(false);
    p.send(writePetCall(OWN_ID, EGG_SLOT, MI_TIGER_D, 2, ''));
    p.step(64);
    expect(p.windows.status.isOpen).toBe(true);
  });

  it('MMI_PET_STATUS toggles it; MMI_PET_RELEASE sends PET_RELEASE and closes it (WndWorld.cpp:5877-5898)', () => {
    const p = pretendWorld(TIGER_C, true);
    p.step();
    p.windows.choose(MMI.PET_STATUS);
    expect(p.windows.status.isOpen).toBe(false);
    p.windows.choose(MMI.PET_STATUS);
    expect(p.windows.status.isOpen).toBe(true);
    p.windows.choose(MMI.PET_RELEASE);
    expect(p.host.sendPetRelease).toHaveBeenCalledOnce();
    expect(p.windows.status.isOpen).toBe(false);
    // a pet made with PF_PET_GET_AVAIL hands the miracle window its steps (CreatePetSfx, R3's)
    p.windows.onPet({ kind: 'shown', levelup: 3 });
    expect(p.host.miracle).toHaveBeenCalledOnce();
  });

  it('its portrait is the pet mover\'s model at the egg\'s camera, let go when the window closes (Process)', async () => {
    const p = pretendWorld(pet({ exp: 100 }), true);
    p.step();
    p.windows.frame();
    expect(p.host.loadPortrait).toHaveBeenCalledWith(p.world.movers.get(petMoverId(OWN_ID)));
    await vi.waitFor(() => expect(p.windows.portrait.shown).toBe(true));
    expect(p.windows.portrait.shown).toBe(true);
    expect(p.models[0]!.root.scale.x).toBe(EGG_CAMERA.scale);
    expect(p.windows.portrait.canvas.parentElement).toBe(p.windows.status.portraitBox());
    p.windows.status.close();
    expect(p.windows.portrait.shown).toBe(false);
    expect(p.models[0]!.release).toHaveBeenCalledOnce();
  });
});

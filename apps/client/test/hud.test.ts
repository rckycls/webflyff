// @vitest-environment jsdom
// The on-screen windows of Piece 4 (spec §3.9), in a DOM: the status window (CWndStatus, _Interface/WndField.cpp:10299-10631),
// the target bar (CWndWorld::RenderSelectObj, _Interface/WndWorld.cpp:2716-2931), the server message lines (CClientMsg,
// _Common/ClientMsg.cpp), the caption (CCaption, WndWorld.cpp:89-300), the window frame (CWndBase, CWndNeuz) and the
// texts of DEFINEDTEXT (CDPClient::OnDefinedText, Neuz/DPClient.cpp:4117-4228).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebMover } from '@flyffweb/formats';
import type { Texts } from '../src/world/gameData';
import { WindowFrame } from '../src/world/hud/frame';
import type { UiArt } from '../src/world/hud/frame';
import { Hud } from '../src/world/hud/hud';
import { Caption, MessageLines, formatDefinedText } from '../src/world/hud/messages';
import { StatusWindow } from '../src/world/hud/statusWindow';
import { TargetBar } from '../src/world/hud/targetBar';
import { Belli } from '../src/world/sim/constants';
import { addedNpc, addedPlayer, moverFrom, webMoverOf } from './helpers/movers';
import { EXP_ROWS, newVagrant } from './helpers/ownState';

/** The art as the asset store would give it: every picture under /assets/. */
const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** A text of the catalog: its TID name, text, colour and number (defineText.h). */
const text = (id: string, textId: number, value: string, color = 0xffffffff) => [id, { id, text: value, color, textId }] as const;

/** The texts these tests read, as data/texts.json gives them (Resource/defineText.h numbers, textClient.inc colours). */
const TEXTS: Texts = new Map([
  text('TID_GAME_WND_STATUS_PLAYER_INFORMATION', 4336, '%s - Lv: %d', 0xff000000),
  text('TID_GAME_WND_STATUS_PERCENT_POINT', 4335, '<%d>', 0xff000000),
  text('TID_GAME_SELECT_OBJECT_INFORMATION_MONSTER', 4333, 'Health: %d/%d', 0xff000000),
  text('TID_GAME_PRIORITYMOB', 655, 'You cannot attack a monster that is fighting against another player.', 0xffff0000),
  text('TID_GAME_REAPITEM', 628, 'You received %s.', 0xffccffcc),
  text('TID_GAME_REAPMONEY', 631, 'You received %s Penya (Total: %s Penya).', 0xffccffcc),
  text('TID_GAME_NPCBUFF_LEVELLIMIT', 3573, 'Only level %s~%s character can get buffs.', 0xfff00000),
  text('TID_GAME_LEVELUP', 601, 'Level up! You can increase your stats in your character window.', 0xffccffcc),
  text('TID_GAME_DEATH', 602, 'Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.', 0xff00ffff),
  text('TID_GAME_PATTERNUP', 610, 'You are learning new attack patterns!', 0xffccffcc),
  text('TID_EVE_LEVEL15', 504, "Now it's time to choose your job.", 0xff3366ff),
  text('TID_GAME_LEVELUP_CAPTION', 3073, 'Congratulations! Level up!'),
  text('TID_GAME_SKILLPOINT_UP', 3067, 'New Skill Points are now available.'),
]);

/** `MI_AIBATT1` (propMover.txt): level 1, not aggressive. */
const AIBATT = 20;
const MOVERS = new Map<number, WebMover>([
  [AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', level: 1, addHp: 120, belligerence: Belli.CAUTIOUSATTACK })],
  [30, webMoverOf({ index: 30, name: 'Demian', level: 7, addHp: 400, belligerence: Belli.ACTIVEATTACK })],
  [31, webMoverOf({ index: 31, name: 'Lawolf', level: 4, addHp: 300 })],
  [32, webMoverOf({ index: 32, name: 'Mushpang', level: 1, addHp: 100 })],
  [33, webMoverOf({ index: 33, name: 'Rockepeller', level: 1, addHp: 1000, hideLevel: 1 })],
  [40, webMoverOf({ index: 40, name: 'Julia', ai: 1, belligerence: Belli.PEACEFUL })],
]);
const DATA = { texts: TEXTS, exp: EXP_ROWS, movers: MOVERS };

const monster = (index: number, extra: { level?: number; activeAttack?: number; hp?: number } = {}) => {
  const data = { movers: new Map([[index, { ...MOVERS.get(index)!, level: extra.level ?? MOVERS.get(index)!.level }]]) };
  const mover = moverFrom(addedNpc(500 + index, index, { activeAttack: extra.activeAttack ?? 0 }, { hitPoint: extra.hp ?? 120 }), {
    ...gameData(), ...data,
  });
  return mover;
};
const gameData = () => ({
  movers: MOVERS, items: new Map(), npcs: new Map(), nameColors: { general: 0, chaotic: 0, ready: 0 },
  honorTitles: new Map(), worlds: new Map(), itemProps: new Map(), jobs: [], exp: [], texts: TEXTS, effects: new Map(),
});

/** A layer as big as a landscape phone, which the windows are kept inside (jsdom lays nothing out). */
function layer(width = 800, height = 450): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  document.body.append(element);
  return element;
}

const pointer = (type: string, x: number, y: number): MouseEvent =>
  new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true });

afterEach(() => {
  document.body.replaceChildren();
});

describe('StatusWindow (CWndStatus, WndField.cpp:10299-10631)', () => {
  /** The text of a row, its value and maximum or percent as drawn ("230 / 230"). */
  const row = (status: StatusWindow, name: string): string =>
    status.frame.element.querySelector(`[data-text="${name}"]`)!.textContent!.trim();
  const gauge = (status: StatusWindow, name: string): HTMLElement =>
    status.frame.element.querySelector<HTMLElement>(`[data-gauge="${name}"]`)!;

  it('shows a new Vagrant as 230 / 230, 63 / 63, 32 / 32 and 0.00%, with the title "%s - Lv: %d"', () => {
    const status = new StatusWindow(art, DATA);
    layer().append(status.frame.element);
    status.update(newVagrant(), 'Webby');
    expect(status.frame.element.querySelector('.hud-window-title')!.textContent).toBe('Webby - Lv: 1');
    expect(row(status, 'hp')).toBe('230 / 230');
    expect(row(status, 'mp')).toBe('63 / 63');
    expect(row(status, 'fp')).toBe('32 / 32');
    expect(row(status, 'exp')).toBe('0.00%');
    // MakeGaugeVertex: 108 * GetHitPoint() / GetMaxHitPoint() (int)
    expect(gauge(status, 'hp').dataset.width).toBe('108');
    expect(gauge(status, 'hp').style.width).toBe('108px');
    expect(gauge(status, 'exp').dataset.width).toBe('0');
  });

  it('fills the bars at trunc(108 x value / max), drawn in the theme\'s 4 px slices and not under two of them', () => {
    const status = new StatusWindow(art, DATA);
    const own = newVagrant(2);
    own.hp = 100;
    own.mp = 5;
    own.exp = 10n; // half of the 20 a level 2 character needs (ExpTable.inc row 3)
    status.update(own, 'Webby');
    expect(row(status, 'hp')).toBe('100 / 230');
    // trunc(108 * 100 / 230) = 46, which CTheme::MakeGaugeVertex draws as 11 slices of 4 px (ITheme.cpp:1691-1703)
    expect(gauge(status, 'hp').dataset.width).toBe('46');
    expect(gauge(status, 'hp').style.width).toBe('44px');
    // trunc(108 * 5 / 63) = 8: two slices, the least the theme draws; 4 would be none
    expect(gauge(status, 'mp').dataset.width).toBe('8');
    expect(gauge(status, 'mp').hidden).toBe(false);
    own.mp = 2;
    status.update(own, 'Webby');
    expect(gauge(status, 'mp').dataset.width).toBe('3');
    expect(gauge(status, 'mp').hidden).toBe(true);
    // EXP: (int)( (float)108 / GetMaxExp1() * GetExp1() ) = 54, and "%.2f%%" of 10 * 10000 / 20 / 100
    expect(gauge(status, 'exp').dataset.width).toBe('54');
    expect(row(status, 'exp')).toBe('50.00%');
  });

  it('a click cycles the numbers 2 -> 0 (none) -> 1 (percent and <points>) -> 2 (OnLButtonDown, :11304-11307)', () => {
    const status = new StatusWindow(art, DATA);
    const own = newVagrant();
    own.hp = 115;
    status.update(own, 'Webby');
    const body = status.frame.element.querySelector('.hud-window-body')!;
    body.dispatchEvent(pointer('pointerdown', 50, 50));
    status.update(own, 'Webby');
    expect(row(status, 'hp')).toBe('');
    expect(row(status, 'exp')).toBe('');
    body.dispatchEvent(pointer('pointerdown', 50, 50));
    status.update(own, 'Webby');
    // GetHitPointPercent: MulDiv( 115, 100, 230 ) = 50; then TID_GAME_WND_STATUS_PERCENT_POINT of the value
    expect(row(status, 'hp')).toBe('50% <115>');
    expect(row(status, 'exp')).toBe('0.00%');
    body.dispatchEvent(pointer('pointerdown', 50, 50));
    status.update(own, 'Webby');
    expect(row(status, 'hp')).toBe('115 / 230');
  });

  it('a level past the EXP table leaves the EXP bar and text empty rather than throwing (GetMaxExp1 has no row)', () => {
    const status = new StatusWindow(art, DATA);
    // EXP_ROWS ends at row 16: a level 16 character needs row 17
    expect(() => status.update(newVagrant(16), 'Webby')).not.toThrow();
    expect(row(status, 'exp')).toBe('');
    expect(gauge(status, 'exp').hidden).toBe(true);
    expect(row(status, 'hp')).not.toBe('');
  });

  it('T toggles it, and the portrait goes in the face box', () => {
    const status = new StatusWindow(art, DATA);
    layer().append(status.frame.element);
    status.update(newVagrant(), 'Webby');
    expect(status.frame.isOpen).toBe(true);
    status.toggle();
    expect(status.frame.isOpen).toBe(false);
    expect(status.frame.element.hidden).toBe(true);
    status.toggle();
    expect(status.frame.isOpen).toBe(true);
    const canvas = document.createElement('canvas');
    status.setPortrait(canvas);
    expect(status.frame.element.querySelector('.hud-status-face canvas')).toBe(canvas);
  });
});

describe('TargetBar (CWndWorld::RenderSelectObj, WndWorld.cpp:2716-2931)', () => {
  const bar = () => {
    const target = new TargetBar(art, MOVERS);
    layer().append(target.element);
    return target;
  };
  const name = (target: TargetBar): HTMLElement => target.element.querySelector<HTMLElement>('.hud-target-name')!;
  const arrow = (target: TargetBar): HTMLElement => target.element.querySelector<HTMLElement>('.hud-target-arrow')!;
  const fill = (target: TargetBar): HTMLElement => target.element.querySelector<HTMLElement>('[data-gauge="target"]')!;

  it('shows "Aibatt <Lvl 1>" in COLOR_MONSTER 0xffffffa0, and an aggressive monster in red', () => {
    const target = bar();
    target.update(monster(AIBATT), 1, TEXTS);
    expect(target.element.hidden).toBe(false);
    expect(name(target).textContent).toBe('Aibatt <Lvl 1>');
    expect(name(target).style.color).toBe('rgb(255, 255, 160)');
    // the 200 px gauge: (int)( 200 * HP / MaxHP ) in 64 bits
    expect(fill(target).dataset.width).toBe('200');
    target.update(monster(30, { activeAttack: 1, hp: 100 }), 1, TEXTS);
    expect(name(target).textContent).toBe('Demian <Lvl 7>');
    expect(name(target).style.color).toBe('rgb(255, 0, 0)');
    expect(fill(target).dataset.width).toBe('50');
  });

  it('the level arrows: 6 levels up is LvUp2, 1 to 5 LvUp, -2 to -5 LvDn, under -5 LvDn2, -1 and 0 none', () => {
    let target = bar();
    const arrowAt = (monsterLevel: number, ownLevel: number): string | null => {
      // the arrow reads the row's dwLevel (:2874-2876), the text the mover's level: both the same here
      target = new TargetBar(art, new Map([[31, { ...MOVERS.get(31)!, level: monsterLevel }]]));
      target.update(monster(31, { level: monsterLevel }), ownLevel, TEXTS);
      return arrow(target).hidden ? null : arrow(target).dataset.art!;
    };
    expect(arrowAt(7, 1)).toBe('LvUp2');
    expect(arrowAt(6, 1)).toBe('LvUp');
    expect(arrowAt(2, 1)).toBe('LvUp');
    expect(arrowAt(4, 4)).toBeNull();
    expect(arrowAt(4, 5)).toBeNull();
    expect(arrowAt(4, 6)).toBe('LvDn');
    expect(arrowAt(4, 9)).toBe('LvDn');
    expect(arrowAt(4, 10)).toBe('LvDn2');
    expect(arrow(target).style.backgroundImage).toContain('/assets/ui/lvdn2.png');
  });

  it('no bar for a peaceful NPC or nothing; a player in white with <Lvl ??> 20 levels up; a hidden level shows the name alone', () => {
    const target = bar();
    target.update(moverFrom(addedNpc(7, 40, {}, { belligerence: Belli.PEACEFUL }), gameData()), 1, TEXTS);
    expect(target.element.hidden).toBe(true);
    target.update(null, 1, TEXTS);
    expect(target.element.hidden).toBe(true);

    const bob = moverFrom(addedPlayer(8, { name: 'Bob', level: 30 }, { belligerence: Belli.PEACEFUL }), gameData());
    target.update(bob, 11, TEXTS);
    expect(target.element.hidden).toBe(false);
    expect(name(target).textContent).toBe('Bob <Lvl 30>');
    expect(name(target).style.color).toBe('rgb(255, 255, 255)');
    expect(arrow(target).hidden).toBe(true);
    target.update(bob, 10, TEXTS);
    expect(name(target).textContent).toBe('Bob <Lvl ??>');

    target.update(monster(33), 1, TEXTS);
    expect(name(target).textContent).toBe('Rockepeller');
  });

  it('a mover with no maximum HP gets the empty gauge only; a game master is shown "Health: %d/%d" under it', () => {
    const target = bar();
    const orphan = moverFrom(addedNpc(9, 99, {}, { hitPoint: 50 }), gameData());
    expect(orphan.maxHp).toBeNull();
    target.update(orphan, 1, TEXTS);
    expect(fill(target).hidden).toBe(true);
    const info = target.element.querySelector<HTMLElement>('.hud-target-info')!;
    expect(info.textContent).toBe('');
    target.update(monster(AIBATT, { hp: 60 }), 1, TEXTS, true);
    expect(info.textContent).toBe('Health: 60/120');
    target.update(monster(AIBATT, { hp: 60 }), 1, TEXTS, false);
    expect(info.textContent).toBe('');
  });
});

describe('WindowFrame (CWndBase, CWndNeuz)', () => {
  it('drags by its title bar, kept inside the screen, and closes with Escape', () => {
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    const onClose = vi.fn();
    frame.onClose = onClose;
    layer().append(frame.element);
    frame.open({ x: 10, y: 20 });
    expect(frame.element.style.left).toBe('10px');
    expect(frame.element.style.top).toBe('20px');

    const title = frame.element.querySelector('.hud-window-title')!;
    title.dispatchEvent(pointer('pointerdown', 15, 25));
    window.dispatchEvent(pointer('pointermove', 115, 85));
    expect(frame.element.style.left).toBe('110px');
    expect(frame.element.style.top).toBe('80px');
    // past the right edge it stops there (m_bCling, WndBase.cpp:1259-1271)
    window.dispatchEvent(pointer('pointermove', 900, 85));
    expect(frame.element.style.left).toBe('600px');
    window.dispatchEvent(pointer('pointerup', 900, 85));
    window.dispatchEvent(pointer('pointermove', 300, 300));
    expect(frame.element.style.left).toBe('600px');

    // the body is not the title: pressing it moves nothing
    frame.body.dispatchEvent(pointer('pointerdown', 620, 100));
    window.dispatchEvent(pointer('pointermove', 400, 200));
    expect(frame.element.style.left).toBe('600px');
    window.dispatchEvent(pointer('pointerup', 400, 200));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(frame.isOpen).toBe(false);
    expect(frame.element.hidden).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the window on top only; the close button closes its own', () => {
    const parent = layer();
    const a = new WindowFrame('A', art);
    const b = new WindowFrame('B', art);
    parent.append(a.element, b.element);
    a.open({ x: 0, y: 0 });
    b.open({ x: 40, y: 40 });
    // a pressed: it comes to the top
    a.element.dispatchEvent(pointer('pointerdown', 5, 5));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(a.isOpen).toBe(false);
    expect(b.isOpen).toBe(true);
    b.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect(b.isOpen).toBe(false);
  });

  it('is tiled from WndTile00 to WndTile11 as AdditionalSkinTexture tiles it (WndNeuz.cpp:255-335)', () => {
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    const tiles = [...frame.element.querySelectorAll<HTMLElement>('.hud-window-frame > div')];
    expect(tiles.map((t) => t.dataset.tile)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(tiles[0]!.style.backgroundImage).toContain('/assets/ui/wndtile00.png');
    // 200 x 150 rounds up to 13 x 10 tiles of 16 px; the middle runs are the tiles between the corners
    expect(tiles[1]!.style.width).toBe('176px');
    expect(tiles[6]!.style.height).toBe('112px');
  });
});

describe('MessageLines (CClientMsg, ClientMsg.cpp)', () => {
  const lines = (messages: MessageLines): Array<[string, string]> =>
    [...messages.element.children].map((e) => [e.textContent!, (e as HTMLElement).style.opacity]);

  it('the oldest line fades 3 s after the last one came, by 10 alpha a frame, and is dropped once below 0', () => {
    const messages = new MessageLines(document);
    messages.step(0);
    messages.add('first', 0xffccffcc);
    messages.add('second', 0xffff0000);
    messages.step(0);
    expect(lines(messages)).toEqual([['first', '1'], ['second', '1']]);
    expect((messages.element.children[1] as HTMLElement).style.color).toBe('rgb(255, 0, 0)');
    messages.step(2999);
    expect(lines(messages)[0]![1]).toBe('1');
    messages.step(3000);
    // 254, then 10 less each frame of 1/60 s
    expect(Number(lines(messages)[0]![1])).toBeCloseTo(254 / 255, 5);
    messages.step(3000 + (1000 / 60) * 11);
    expect(Number(lines(messages)[0]![1])).toBeCloseTo(154 / 255, 5);
    messages.step(3000 + (1000 / 60) * 26);
    expect(Number(lines(messages)[0]![1])).toBeCloseTo(4 / 255, 5);
    messages.step(3000 + (1000 / 60) * 27);
    expect(lines(messages)).toEqual([['second', '1']]);
    // the next one 3 s after the first began to fade
    messages.step(5999);
    expect(lines(messages)).toEqual([['second', '1']]);
    messages.step(6000);
    messages.step(6000 + (1000 / 60) * 27);
    expect(lines(messages)).toEqual([]);
  });

  it('keeps six lines: a seventh drops the oldest; a new line puts the fade off for 3 s', () => {
    const messages = new MessageLines(document);
    messages.step(0);
    for (let i = 1; i <= 7; i++) messages.add(`line ${i}`, 0xffffffff);
    messages.step(1000);
    expect(lines(messages).map(([t]) => t)).toEqual(['line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7']);
    messages.step(2000);
    messages.add('line 8', 0xffffffff);
    messages.step(4999);
    expect(lines(messages)[0]).toEqual(['line 3', '1']);
    messages.step(5000);
    expect(Number(lines(messages)[0]![1])).toBeLessThan(1);
  });
});

describe('Caption (CCaption, WndWorld.cpp:89-300)', () => {
  it('grows from 7 times its size to its size, holds 5 s, then fades by 3 alpha a frame', () => {
    const caption = new Caption(document);
    caption.step(0);
    caption.show('Congratulations! Level up!');
    const line = caption.element.querySelector<HTMLElement>('div')!;
    expect(line.textContent).toBe('Congratulations! Level up!');
    caption.step(1000 / 60);
    // m_fAddScale 0.002, m_fXScale 0.002: drawn 7.0f - 6.0f * 0.002f times as big (C float), at (int)( 0.002 * 255 ) alpha
    const f32 = Math.fround;
    expect(line.style.transform).toBe(`scale(${f32(7 - f32(f32(0.002) * 6))})`);
    expect(line.style.opacity).toBe('0');
    // m_fXScale = 0.001 n (n + 1) after n frames: 1 (clamped) at the 32nd, when the 5 s hold begins
    caption.step((1000 / 60) * 31);
    expect(line.style.transform).not.toBe('scale(1)');
    caption.step((1000 / 60) * 32);
    expect(line.style.transform).toBe('scale(1)');
    expect(line.style.opacity).toBe('1');
    // the 5 s are 300 frames: the 332nd fades by 3, and ten more by 30
    caption.step((1000 / 60) * 331);
    expect(line.style.opacity).toBe('1');
    caption.step((1000 / 60) * 332);
    expect(Number(line.style.opacity)).toBeCloseTo(252 / 255, 5);
    caption.step((1000 / 60) * 342);
    expect(Number(line.style.opacity)).toBeCloseTo(222 / 255, 5);
    caption.step((1000 / 60) * 500);
    expect(line.hidden).toBe(true);
  });

  it('a second caption while the first holds stands under it, and both hold until it has grown', () => {
    const caption = new Caption(document);
    caption.step(0);
    caption.show('Congratulations! Level up!');
    caption.show('New Skill Points are now available.');
    const [first, second] = [...caption.element.querySelectorAll<HTMLElement>('div')];
    caption.step((1000 / 60) * 5);
    expect(second!.hidden).toBe(true);
    caption.step((1000 / 60) * 60);
    expect(first!.style.transform).toBe('scale(1)');
    expect(second!.style.transform).toBe('scale(1)');
    expect(second!.hidden).toBe(false);
  });
});

describe('formatDefinedText (CDPClient::OnDefinedText, DPClient.cpp:4117-4228)', () => {
  it('gives the text of the TID numbered textId, and its colour', () => {
    expect(formatDefinedText(TEXTS, 655, '')).toEqual({
      text: 'You cannot attack a monster that is fighting against another player.', color: 0xffff0000,
    });
  });

  it('fills %s with the tokens of the string, as CScanner reads them; a quoted token keeps its spaces', () => {
    expect(formatDefinedText(TEXTS, 628, '"Wooden Sword"').text).toBe('You received Wooden Sword.');
    expect(formatDefinedText(TEXTS, 3573, '1 15 Heal').text).toBe('Only level 1~15 character can get buffs.');
    // the penya text is cut at the spaces only, as its numbers have commas (:4125-4134)
    expect(formatDefinedText(TEXTS, 631, '1,000 2,500').text).toBe('You received 1,000 Penya (Total: 2,500 Penya).');
    // " @" is taken out of every token (__ULTIMATE, :4140)
    expect(formatDefinedText(TEXTS, 628, '"Wooden @Sword"').text).toBe('You received WoodenSword.');
  });

  it('an unknown number gives no text', () => {
    expect(formatDefinedText(TEXTS, 99999, 'x')).toEqual({ text: '', color: 0 });
  });
});

describe('Hud: what the world and the own numbers show', () => {
  const hudOn = () => {
    const hud = new Hud(document, art, DATA);
    document.body.append(hud.element);
    return hud;
  };
  const shown = (hud: Hud): string[] => [...hud.messages.element.children].map((e) => e.textContent!);

  it("the world's text events go to the message lines, in the text's colour", () => {
    const hud = hudOn();
    hud.play([
      { kind: 'text', textId: 655, args: '' },
      { kind: 'swing', attackerId: 1, targetId: 2 },
      { kind: 'text', textId: 628, args: '"Wooden Sword"' },
    ], [], newVagrant());
    expect(shown(hud)).toEqual([
      'You cannot attack a monster that is fighting against another player.', 'You received Wooden Sword.',
    ]);
    expect((hud.messages.element.children[0] as HTMLElement).style.color).toBe('rgb(255, 0, 0)');
    hud.dispose();
  });

  it('a level up: its chat line when due, the caption, the pattern line, the job line at 15; new skill points their caption', () => {
    const hud = hudOn();
    const own = newVagrant(15);
    hud.play([], [
      { kind: 'levelUp', from: 11, to: 15, chatLine: true },
      { kind: 'patternUp', level: 12 },
      { kind: 'refilled' },
      { kind: 'skillPointUp' },
    ], own);
    expect(shown(hud)).toEqual([
      'Level up! You can increase your stats in your character window.',
      'You are learning new attack patterns!',
      "Now it's time to choose your job.",
    ]);
    expect([...hud.caption.element.children].map((e) => e.textContent)).toEqual([
      'Congratulations! Level up!', 'New Skill Points are now available.',
    ]);
    hud.play([], [{ kind: 'levelUp', from: 2, to: 3, chatLine: false }, { kind: 'died' }], own);
    expect(shown(hud).slice(3)).toEqual([
      'Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.',
    ]);
    hud.dispose();
  });

  it('T toggles the status window; the frame refreshes it with the own numbers and draws the target', () => {
    const hud = hudOn();
    const own = newVagrant();
    hud.frame(0, own, 'Webby', monster(AIBATT), false);
    expect(hud.status.frame.isOpen).toBe(true);
    expect(hud.target.element.hidden).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }));
    expect(hud.status.frame.isOpen).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }));
    expect(hud.status.frame.isOpen).toBe(true);
    // with no own numbers there is no status window to show
    hud.frame(16, undefined, '', null, false);
    expect(hud.status.frame.element.hidden).toBe(true);
    expect(hud.target.element.hidden).toBe(true);
    hud.dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }));
  });
});

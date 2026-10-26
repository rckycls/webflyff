// @vitest-environment jsdom
// The on-screen windows of Piece 4 (spec §3.9), in a DOM: the status window (CWndStatus, _Interface/WndField.cpp:10299-10631),
// the target bar (CWndWorld::RenderSelectObj, _Interface/WndWorld.cpp:2716-2931), the server message lines (CClientMsg,
// _Common/ClientMsg.cpp), the caption (CCaption, WndWorld.cpp:89-300), the window frame (CWndBase, CWndNeuz) and the
// texts of DEFINEDTEXT (CDPClient::OnDefinedText, Neuz/DPClient.cpp:4117-4228).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebMover } from '@flyffweb/formats';
import { ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut, TaskBar as TaskBarMessage } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { AttackLoop } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import type { Texts } from '../src/world/gameData';
import { AttackButton } from '../src/world/hud/attackButton';
import { WindowFrame, escapeWindow } from '../src/world/hud/frame';
import type { UiArt } from '../src/world/hud/art';
import { Hud } from '../src/world/hud/hud';
import { Caption, MessageLines, formatDefinedText } from '../src/world/hud/messages';
import { StatusWindow } from '../src/world/hud/statusWindow';
import { TargetBar } from '../src/world/hud/targetBar';
import { APPLETS, TaskBar, actionPointLit, escapeStep, taskBarLayout } from '../src/world/hud/taskBar';
import type { TaskBarActions } from '../src/world/hud/taskBar';
import { terrainGround } from '../src/world/sim/collision';
import { Belli, ObjSta } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';
import { addedNpc, addedPlayer, moverFrom, webMoverOf } from './helpers/movers';
import { EXP_ROWS, VAGRANT, itemProp, newVagrant, ownAdded, ownGameData } from './helpers/ownState';

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

  // R21: Neuz shows a game master alone "Health: %d/%d" there (:2913-2927); the owner wants "value / max" for everyone
  it('the HP under the gauge as "value / max" for every viewer (R21); a mover with no maximum gets the empty gauge alone', () => {
    const target = bar();
    const info = target.element.querySelector<HTMLElement>('.hud-target-info')!;
    const orphan = moverFrom(addedNpc(9, 99, {}, { hitPoint: 50 }), gameData());
    expect(orphan.maxHp).toBeNull();
    target.update(orphan, 1, TEXTS);
    expect(fill(target).hidden).toBe(true);
    expect(info.textContent).toBe('');
    target.update(monster(AIBATT, { hp: 60 }), 1, TEXTS, false);
    expect(info.textContent).toBe('60 / 120');
    target.update(monster(AIBATT, { hp: 61 }), 1, TEXTS, true);
    expect(info.textContent).toBe('61 / 120');
    const bob = moverFrom(addedPlayer(8, { name: 'Bob', level: 1 }, { hitPoint: 200 }), { ...gameData(), jobs: [VAGRANT] });
    target.update(bob, 1, TEXTS);
    expect(info.textContent).toBe('200 / 230');
  });

  it("another player's fill stays inside its bar when its HP passes the maximum the browser can compute (no gear, no buffs)", () => {
    const target = bar();
    const info = target.element.querySelector<HTMLElement>('.hud-target-info')!;
    // a Vagrant of level 1 and STA 15 has 230 without items (GetMaxOriginHitPoint); its ADD_OBJ says 350
    const bob = moverFrom(addedPlayer(8, { name: 'Bob', level: 1 }, { hitPoint: 350 }), { ...gameData(), jobs: [VAGRANT] });
    expect(bob.maxHp).toBe(230);
    target.update(bob, 1, TEXTS);
    expect(fill(target).dataset.width).toBe('200');
    expect(fill(target).style.width).toBe('200px');
    // the numbers as they came: the maximum is the browser's, short of the gear and buffs
    expect(info.textContent).toBe('350 / 230');
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

  it('DEFINEDTEXT1 (no string) is the text as it is: GETTEXT, not formatted (OnDefinedText1, DPClient.cpp:4230-4239)', () => {
    expect(formatDefinedText(TEXTS, 628, null)).toEqual({ text: 'You received %s.', color: 0xffccffcc });
    // a DEFINEDTEXT with an empty string is still formatted, its %s given nothing
    expect(formatDefinedText(TEXTS, 628, '').text).toBe('You received .');
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
      { kind: 'text', textId: 655, args: null },
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

// The task bar (CWndTaskBar, _Interface/WndTaskBar.cpp), its Start menu (CWndTaskMenu, :2464-2811), the keys
// (CWndTaskBar::Process, :2359-2427; CWndMgr::Process, _Interface/WndManager.cpp:3295-3600) and the attack button.

/** A shortcut as TASKBAR carries it (`m_dwShortcut`, `m_dwId`, `m_dwType`, `m_dwIndex`, `m_dwUserId`, `m_dwData`). */
const shortcut = (kind: number, id: number, index: number, data: number, type = 0): Shortcut => ({
  kind, id, type, index, userId: 0, data, text: '',
});

/**
 * The new character's bars, as BASE_VALUE_TBL holds them (`Database.sql:2741-2742`, both sexes): the applets 400
 * (APP_WEBBOX), 398 (APP_COMM_ITEM), 2010 (APP_CHARACTER), 581 (APP_SKILL1) and the motion 25 (MOT_BASE_ESCAPE) in slots 0
 * to 4; on bar 0 the lollipops (object 45) and the biscuit (object 1), and the motions 3 and 2 in slots 2 and 8.
 */
const NEW_BAR: TaskBarMessage = {
  applets: [
    { slot: 0, shortcut: shortcut(ShortcutKind.APPLET, 400, 0, 0) },
    { slot: 1, shortcut: shortcut(ShortcutKind.APPLET, 398, 1, 0) },
    { slot: 2, shortcut: shortcut(ShortcutKind.APPLET, 2010, 2, 0) },
    { slot: 3, shortcut: shortcut(ShortcutKind.APPLET, 581, 3, 0) },
    { slot: 4, shortcut: shortcut(ShortcutKind.MOTION, 25, 4, 0) },
  ],
  items: [
    { bar: 0, slot: 0, shortcut: shortcut(ShortcutKind.ITEM, 45, 0, 1) },
    { bar: 0, slot: 1, shortcut: shortcut(ShortcutKind.ITEM, 1, 1, 1) },
    { bar: 0, slot: 2, shortcut: shortcut(ShortcutKind.MOTION, 3, 2, 1) },
    { bar: 0, slot: 8, shortcut: shortcut(ShortcutKind.MOTION, 2, 8, 1) },
  ],
  queue: [],
  actionPoint: 0,
};

/** `II_GEN_FOO_INS_LOLLIPOP` and `II_GEN_FOO_INS_BISCUIT` (`propItem.txt:1744-1745`): IK1_GENERAL, IK2_FOOD, IK3_INSTANT. */
const LOLLIPOP = itemProp({ id: 2800, name: 'Lollipop', kind1: 3, kind2: 14, kind3: 30, part: -1, icon: 'ui/item/itm_genfoolollip.png' });
const BISCUIT = itemProp({ id: 2801, name: 'Biscuit', kind1: 3, kind2: 14, kind3: 30, part: -1, icon: 'ui/item/itm_genfoobiscuit.png' });
const BAR_DATA = { itemProps: new Map([LOLLIPOP, BISCUIT].map((prop) => [prop.id, prop])) };

/** The new Vagrant with its TASKBAR. */
function newVagrantWithBar() {
  const own = newVagrant();
  own.taskBar = NEW_BAR;
  return own;
}

/** Actions that record what the task bar asks for. */
function recorder() {
  const calls: string[] = [];
  const actions: TaskBarActions = {
    open: (window) => void calls.push(`open ${window}`),
    logOut: () => void calls.push('logOut'),
    useSlot: (bar, slot) => void calls.push(`useSlot ${bar} ${slot}`),
    useActionSlot: () => void calls.push('useActionSlot'),
  };
  return { calls, actions };
}

const bars: TaskBar[] = [];
/** A task bar in a layer `width` px wide, taken off the window's keys after the test. */
function taskBarOn(width = 800, actions: TaskBarActions = recorder().actions): TaskBar {
  const bar = new TaskBar(art, actions);
  bars.push(bar);
  layer(width).append(bar.element);
  return bar;
}

afterEach(() => {
  for (const bar of bars.splice(0)) bar.dispose();
});

const slot = (bar: TaskBar, row: 'applet' | 'item' | 'queue', i: number): HTMLElement =>
  bar.element.querySelector<HTMLElement>(`.hud-slot[data-row="${row}"][data-slot="${i}"]`)!;
/** What a slot shows: its kind, greyed or not, its icon's picture, its count and its hotkey letter. */
const shown = (element: HTMLElement) => ({
  kind: element.dataset.kind ?? '',
  greyed: element.hasAttribute('data-greyed'),
  icon: element.querySelector<HTMLElement>('.hud-slot-icon')!.style.backgroundImage,
  count: element.querySelector('.hud-slot-count')!.textContent,
  hotkey: element.querySelector('.hud-slot-hotkey')!.textContent,
});
const key = (type: 'keydown' | 'keyup', code: string, extra: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent(type, {
    code, key: code.replace(/^Key|^Digit/, ''), bubbles: true, cancelable: true, ...extra,
  });
  document.body.dispatchEvent(event);
  return event;
};

describe('TaskBar (CWndTaskBar, WndTaskBar.cpp)', () => {
  it("shows the new character's bar: the lollipops (3) and the biscuit (1) greyed, the motions as plain greyed slots, and the applets' icons", () => {
    const bar = taskBarOn();
    bar.update(newVagrantWithBar(), BAR_DATA);
    // the item bar: the item's icon (CItemBase::GetTexture) and m_Inventory.GetItemCount( m_dwItemId ) (:946-956), greyed
    // until items are used (Piece 5)
    expect(shown(slot(bar, 'item', 0))).toEqual({
      kind: 'item', greyed: true, icon: 'url("/assets/ui/item/itm_genfoolollip.png")', count: '3', hotkey: '',
    });
    expect(shown(slot(bar, 'item', 1))).toEqual({
      kind: 'item', greyed: true, icon: 'url("/assets/ui/item/itm_genfoobiscuit.png")', count: '1', hotkey: '',
    });
    for (const i of [2, 8]) {
      expect(shown(slot(bar, 'item', i))).toEqual({ kind: 'plain', greyed: true, icon: '', count: '', hotkey: '' });
    }
    for (const i of [3, 4, 5, 6, 7]) expect(shown(slot(bar, 'item', i)).kind).toBe('');
    // the applets: their icon from AddAllApplet's table (SetTaskBarTexture, :405-416) and their hotkey above (:889-896)
    expect(shown(slot(bar, 'applet', 0))).toEqual({
      kind: 'applet', greyed: false, icon: 'url("/assets/ui/icon_citemmall.png")', count: '', hotkey: '',
    });
    expect(shown(slot(bar, 'applet', 1))).toEqual({
      kind: 'applet', greyed: false, icon: 'url("/assets/ui/icon_citemtime.png")', count: '', hotkey: 'J',
    });
    // APP_CHARACTER (2010) and APP_SKILL1 (581) have no applet in a version 15 Neuz, which registers APP_CHARACTER3 and
    // APP_SKILL3 instead (FuncApplet.cpp:203-217): GetAppletFunc finds nothing, and the slot draws no picture (:405-416,
    // :826-829)
    for (const i of [2, 3]) {
      expect(shown(slot(bar, 'applet', i))).toEqual({ kind: 'applet', greyed: false, icon: '', count: '', hotkey: '' });
    }
    expect(shown(slot(bar, 'applet', 4))).toEqual({ kind: 'plain', greyed: true, icon: '', count: '', hotkey: '' });
  });

  it('with no own numbers, or before the TASKBAR, the bars are empty (InitTaskBar) and the rest of the bar is drawn', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    bar.update(undefined, BAR_DATA);
    expect(bar.element.querySelector<HTMLElement>('.hud-taskbar-strip')!.style.backgroundImage).toContain('wndtaskbar800.png');
    expect(bar.element.querySelectorAll('.hud-slot[data-kind]')).toHaveLength(0);
    expect(bar.element.querySelector('.hud-taskbar-number')!.textContent).toBe('1');
    bar.element.querySelector<HTMLButtonElement>('.hud-taskbar-start')!.click();
    bar.element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[3]!.click();
    expect(calls).toEqual(['logOut']);
    // the own numbers come with no TASKBAR yet: still empty; then it comes
    const own = newVagrant();
    bar.update(own, BAR_DATA);
    expect(bar.element.querySelectorAll('.hud-slot[data-kind]')).toHaveLength(0);
    own.taskBar = NEW_BAR;
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 0)).count).toBe('3');
  });

  it('with inventory null the item slots are plain greyed slots', () => {
    const bar = taskBarOn();
    const own = newVagrantWithBar();
    own.inventory = null;
    bar.update(own, BAR_DATA);
    for (const i of [0, 1]) {
      expect(shown(slot(bar, 'item', i))).toEqual({ kind: 'plain', greyed: true, icon: '', count: '', hotkey: '' });
    }
  });

  it('an item shortcut whose object is gone shows another stack of the same item (m_dwItemId, :347-378, :859-881), or empties', () => {
    const bar = taskBarOn();
    const own = newVagrantWithBar();
    bar.update(own, BAR_DATA);
    // the lollipops are now another object: the shortcut follows the item ID it was loaded with
    own.inventory!.delete(45);
    own.inventory!.set(46, { objectId: 46, itemId: 2800, count: 2 });
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 0))).toMatchObject({ kind: 'item', count: '2' });
    own.inventory!.delete(46);
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 0)).kind).toBe('');
  });

  it('the count is of every stack of the item (GetItemCount, Item.h:378-389)', () => {
    const bar = taskBarOn();
    const own = newVagrantWithBar();
    own.inventory!.set(47, { objectId: 47, itemId: 2800, count: 5 });
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 0)).count).toBe('8');
  });

  it('a skill shows its icon from the skills catalog; one in the applet row that is not CT_STEP or CT_GENERAL is emptied (:330-343)', () => {
    const own = newVagrant();
    // m_aJobSkill: Clean Hit (1), Flurry (2), Over Cut (3) in its slots 0 to 2
    own.taskBar = {
      applets: [
        { slot: 0, shortcut: shortcut(ShortcutKind.SKILL, 0, 0, 0) },
        { slot: 1, shortcut: shortcut(ShortcutKind.SKILL, 1, 1, 0) },
      ],
      items: [{ bar: 0, slot: 3, shortcut: shortcut(ShortcutKind.SKILL, 0, 3, 1) }],
      queue: [shortcut(ShortcutKind.SKILL, 0, 0, 2), shortcut(ShortcutKind.SKILL, 1, 1, 2)],
      actionPoint: 0,
    };
    // no skills catalog (milestone 1): plain slots, kept
    const bar = taskBarOn();
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 3))).toEqual({ kind: 'plain', greyed: true, icon: '', count: '', hotkey: '' });
    expect(shown(slot(bar, 'applet', 1)).kind).toBe('plain');
    expect(shown(slot(bar, 'queue', 0)).kind).toBe('plain');
    // with it (milestone 2): the icons, and Flurry (CT_CIRCLE) leaves the applet row
    const skills = new Map([
      [1, { icon: 'ui/skill_vagonecleanh.png', comboStyle: 1 }],
      [2, { icon: 'ui/skill_vagonebrandi.png', comboStyle: 2 }],
    ]);
    const fresh = taskBarOn();
    fresh.update(own, { ...BAR_DATA, skills });
    expect(shown(slot(fresh, 'item', 3))).toEqual({
      kind: 'skill', greyed: false, icon: 'url("/assets/ui/skill_vagonecleanh.png")', count: '', hotkey: '',
    });
    expect(shown(slot(fresh, 'applet', 0)).kind).toBe('skill');
    expect(shown(slot(fresh, 'applet', 1)).kind).toBe('');
    expect(shown(slot(fresh, 'queue', 1)).icon).toBe('url("/assets/ui/skill_vagonebrandi.png")');
  });

  it('key 2 switches to bar 2, and the arrows cycle the bars with wrap (CWndMgr::Process :3541-3582; WIDC_UP, WIDC_DOWN :1371-1380)', () => {
    const bar = taskBarOn();
    const own = newVagrantWithBar();
    own.taskBar = { ...NEW_BAR, items: [...NEW_BAR.items, { bar: 1, slot: 4, shortcut: shortcut(ShortcutKind.MOTION, 5, 4, 1) }] };
    bar.update(own, BAR_DATA);
    const number = () => bar.element.querySelector('.hud-taskbar-number')!.textContent;
    expect(bar.bar).toBe(0);
    expect(number()).toBe('1');
    key('keydown', 'Digit2');
    bar.update(own, BAR_DATA);
    expect(bar.bar).toBe(1);
    expect(number()).toBe('2');
    expect(shown(slot(bar, 'item', 0)).kind).toBe('');
    expect(shown(slot(bar, 'item', 4)).kind).toBe('plain');
    key('keydown', 'Digit8');
    expect(bar.bar).toBe(7);
    // the down arrow goes on to the next bar, past the last to the first; the up arrow back, past the first to the last
    bar.element.querySelector<HTMLButtonElement>('.hud-taskbar-down')!.click();
    expect(bar.bar).toBe(0);
    bar.element.querySelector<HTMLButtonElement>('.hud-taskbar-up')!.click();
    expect(bar.bar).toBe(7);
    // 9 and 0 are not bars (a position note and a screenshot in Neuz)
    key('keydown', 'Digit9');
    key('keydown', 'Digit0');
    expect(bar.bar).toBe(7);
  });

  it("the Start menu lists Piece 4's windows and Log out in CWndTaskMenu's order; Log out leaves", () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    bar.update(newVagrantWithBar(), BAR_DATA);
    const changes: boolean[] = [];
    bar.onMenuChange = (open) => void changes.push(open);
    const start = bar.element.querySelector<HTMLButtonElement>('.hud-taskbar-start')!;
    const menu = bar.element.querySelector<HTMLElement>('.hud-taskbar-menu')!;
    expect(start.getAttribute('aria-label')).toBe('Start');
    expect(menu.hidden).toBe(true);
    start.click();
    expect(menu.hidden).toBe(false);
    expect(bar.menuOpen).toBe(true);
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(['Status', 'Character', 'Skills', 'Log out']);
    // the skill window is milestone 2's
    expect(items.map((item) => item.disabled)).toEqual([false, false, true, false]);
    expect(items[0]!.querySelector<HTMLElement>('.hud-menu-icon')!.style.backgroundImage).toContain('/assets/ui/icon_status.png');
    items[3]!.click();
    expect(calls).toEqual(['logOut']);
    expect(menu.hidden).toBe(true);
    // Start again opens it; Status opens the status window and closes the menu; Start twice, or a press elsewhere, closes it
    start.click();
    items[0]!.click();
    expect(calls).toEqual(['logOut', 'open status']);
    expect(bar.menuOpen).toBe(false);
    start.click();
    start.click();
    expect(bar.menuOpen).toBe(false);
    start.click();
    document.body.dispatchEvent(pointer('pointerdown', 400, 100));
    expect(bar.menuOpen).toBe(false);
    // its owner hears each opening and closing (the world screen hides the joystick meanwhile)
    expect(changes).toEqual([true, false, true, false, true, false, true, false]);
  });

  it('a press on an applet with a window in Piece 4 opens it; the others, and the plain slots, do nothing', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    const own = newVagrantWithBar();
    own.taskBar = {
      ...NEW_BAR,
      applets: [
        { slot: 0, shortcut: shortcut(ShortcutKind.APPLET, 577, 0, 0) }, // APP_STATUS1
        { slot: 1, shortcut: shortcut(ShortcutKind.APPLET, 764, 1, 0) }, // APP_CHARACTER3
        { slot: 2, shortcut: shortcut(ShortcutKind.APPLET, 1003, 2, 0) }, // APP_INVENTORY: Piece 5's
        { slot: 3, shortcut: shortcut(ShortcutKind.APPLET, 2010, 3, 0) }, // no applet
        { slot: 4, shortcut: shortcut(ShortcutKind.MOTION, 25, 4, 0) },
      ],
    };
    bar.update(own, BAR_DATA);
    for (let i = 0; i < 5; i++) slot(bar, 'applet', i).click();
    expect(calls).toEqual(['open status', 'open character']);
    // a slot of the item bar goes to its owner (ObjectExecutor): items in Piece 5, skills in milestone 2; an empty one is nothing
    slot(bar, 'item', 0).click();
    slot(bar, 'item', 3).click();
    expect(calls).toEqual(['open status', 'open character', 'useSlot 0 0']);
  });

  it('the action slot: its button uses it, and the action points light the slots after the first (:1011-1083)', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    const own = newVagrantWithBar();
    bar.update(own, BAR_DATA);
    const action = bar.element.querySelector<HTMLElement>('.hud-taskbar-action')!;
    // POINT_QUEUE_X - ICON_SIZE - 5 (:1011): 638 - 32 - 5
    expect([action.style.left, action.style.top]).toEqual(['601px', '10px']);
    expect(action.style.backgroundImage).toBe('url("/assets/ui/icon_actionskill.png")');
    action.click();
    expect(calls).toEqual(['useActionSlot']);
    // 0 points: the four slots after the first are shaded; 25: two lit; 100 and more: none shaded
    const shade = bar.element.querySelector<HTMLElement>('.hud-taskbar-ap')!;
    expect([shade.style.left, shade.style.width, shade.style.height]).toEqual(['666px', '112px', '30px']);
    own.taskBar = { ...NEW_BAR, actionPoint: 25 };
    bar.update(own, BAR_DATA);
    expect([shade.style.left, shade.style.width]).toEqual(['722px', '56px']);
    own.taskBar = { ...NEW_BAR, actionPoint: 150 };
    bar.update(own, BAR_DATA);
    expect(shade.style.width).toBe('0px');
  });
});

describe('actionPointLit (the lit width of the action slot, WndTaskBar.cpp:1037-1053)', () => {
  it('is 28 px a step: 10, 25, 50 and 100 points light one, two, three and four slots, in int arithmetic', () => {
    expect([0, 5, 9, 10, 17, 25, 49, 50, 75, 100].map(actionPointLit)).toEqual([0, 14, 25, 28, 41, 56, 82, 84, 98, 112]);
  });
});

describe('taskBarLayout (CWndTaskBar::Initialize, WndTaskBar.cpp:1264-1306; resdata.inc APP_TASKBAR*)', () => {
  it('takes 5, 10 or 18 applet slots by the width, the controls of its window, and its picture', () => {
    expect(taskBarLayout(800)).toMatchObject({
      width: 800, picture: 'wndTaskBar800.bmp', applets: 5, appletX: 106, itemX: 286, queueX: 638, scale: 1,
    });
    expect(taskBarLayout(1023)).toMatchObject({ width: 800, applets: 5 });
    expect(taskBarLayout(1024)).toMatchObject({ width: 1024, applets: 10, appletX: 106, itemX: 446, queueX: 798 });
    expect(taskBarLayout(1280)).toMatchObject({ width: 1280, applets: 18, appletX: 106, itemX: 702, queueX: 1054 });
    // the wide windows have the 1280 one's controls and a wider picture
    expect(taskBarLayout(1500)).toMatchObject({ width: 1440, picture: 'WndTaskBar1440Wide.bmp', applets: 18, itemX: 702 });
    expect(taskBarLayout(2560)).toMatchObject({ width: 1680, picture: 'WndTaskBar1680Wide.bmp' });
    // a screen narrower than the narrowest window gets it scaled down to its width
    expect(taskBarLayout(600)).toMatchObject({ width: 800, applets: 5, scale: 0.75 });
  });

  it('the bar draws the applet slots its width has, 32 px apart from WIDC_CUSTOM1, and its picture', () => {
    const strip = (bar: TaskBar): HTMLElement => bar.element.querySelector<HTMLElement>('.hud-taskbar-strip')!;
    const narrow = taskBarOn(800);
    narrow.update(newVagrantWithBar(), BAR_DATA);
    expect(narrow.element.querySelectorAll('.hud-slot[data-row="applet"]')).toHaveLength(5);
    expect(strip(narrow).style.backgroundImage).toBe('url("/assets/ui/wndtaskbar800.png")');
    expect([slot(narrow, 'item', 1).style.left, slot(narrow, 'item', 1).style.top]).toEqual(['318px', '10px']);
    // the layer learns the bar's height on screen (the attack button stands above it)
    expect(narrow.element.parentElement!.style.getPropertyValue('--hud-taskbar-height')).toBe('48px');
    const wide = taskBarOn(1280);
    wide.update(newVagrantWithBar(), BAR_DATA);
    expect(wide.element.querySelectorAll('.hud-slot[data-row="applet"]')).toHaveLength(18);
    expect(slot(wide, 'queue', 0).style.left).toBe('1054px');
    // narrower than 800 px: the bar and its menu drawn smaller, the menu above the bar
    const small = taskBarOn(400);
    small.update(newVagrantWithBar(), BAR_DATA);
    expect(strip(small).style.transform).toBe('scale(0.5)');
    const menu = small.element.querySelector<HTMLElement>('.hud-taskbar-menu')!;
    expect([menu.style.transform, menu.style.bottom]).toEqual(['scale(0.5)', '24px']);
    expect(small.element.parentElement!.style.getPropertyValue('--hud-taskbar-height')).toBe('24px');
  });
});

describe('APPLETS (CWndMgr::AddAllApplet, FuncApplet.cpp:178-301)', () => {
  it('has the icon and hotkey of each applet the live build registers', () => {
    expect(APPLETS.get(577)).toEqual({ name: 'APP_STATUS1', icon: 'Icon_Status.dds', hotkey: 'T' });
    expect(APPLETS.get(764)).toEqual({ name: 'APP_CHARACTER3', icon: 'Icon_Character.dds', hotkey: 'H' });
    expect(APPLETS.get(622)).toEqual({ name: 'APP_SKILL3', icon: 'Icon_Skill.dds', hotkey: 'K' });
    expect(APPLETS.get(1100)).toEqual({ name: 'APP_LOGOUT', icon: 'Icon_Logout.dds', hotkey: null });
    expect(APPLETS.get(228)).toEqual({ name: 'APP_MAP', icon: 'Icon_Applet.dds', hotkey: 'M' }); // __IMPROVE_MAP_SYSTEM is off
    expect(APPLETS.get(302)).toEqual({ name: 'APP_MESSENGER_EX', icon: 'Icon_Messenger.dds', hotkey: 'E' });
    expect(APPLETS.get(593)).toEqual({ name: 'APP_PARTY_QUICK', icon: null, hotkey: null });
    // the earlier versions' windows are not registered, nor the dead flags' ones (APP_GUILD_VOTE, APP_MAP_EX)
    for (const id of [2010, 581, 321, 2022]) expect(APPLETS.has(id)).toBe(false);
  });
});

describe('the keys (CWndTaskBar::Process, WndTaskBar.cpp:2359-2427; CWndMgr::Process, WndManager.cpp:3541-3582)', () => {
  it('H opens the Character window, and T toggles the status window once (the Hud keys it)', () => {
    const { calls, actions } = recorder();
    const hud = new Hud(document, art, DATA);
    document.body.append(hud.element);
    const bar = new TaskBar(art, actions);
    bars.push(bar);
    hud.element.append(bar.element);
    const own = newVagrantWithBar();
    hud.frame(0, own, 'Webby', null, false);
    bar.update(own, BAR_DATA);
    key('keydown', 'KeyH');
    expect(calls).toEqual(['open character']);
    key('keydown', 'KeyT');
    expect(hud.status.frame.isOpen).toBe(false);
    expect(calls).toEqual(['open character']);
    // held down, the key repeats: once a press
    key('keydown', 'KeyH', { repeat: true });
    expect(calls).toEqual(['open character']);
    hud.dispose();
  });

  it('F1 to F9 use the slots of the bar shown, and the browser does nothing else with them (F5 does not reload)', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    const own = newVagrantWithBar();
    own.taskBar = {
      ...NEW_BAR,
      items: [...NEW_BAR.items, { bar: 2, slot: 4, shortcut: shortcut(ShortcutKind.APPLET, 764, 4, 1) }],
    };
    bar.update(own, BAR_DATA);
    const f5 = key('keydown', 'F5', { key: 'F5' });
    expect(f5.defaultPrevented).toBe(true);
    for (let i = 1; i <= 9; i++) key('keydown', `F${i}`, { key: `F${i}` });
    // the empty slots are nothing to use; the item and motion ones go to the owner
    expect(calls).toEqual(['useSlot 0 0', 'useSlot 0 1', 'useSlot 0 2', 'useSlot 0 8']);
    // an applet on the bar opens its window (ObjectExecutor)
    key('keydown', 'Digit3');
    key('keydown', 'F5', { key: 'F5' });
    expect(calls.at(-1)).toBe('open character');
    // F10 would read the next bar's slot 0 (a quirk of the C++ array, not copied)
    expect(key('keydown', 'F10', { key: 'F10' }).defaultPrevented).toBe(false);
  });

  it('C uses the action slot as it is let go (CWndWorld::OnKeyUp, WndWorld.cpp:7712-7729)', () => {
    const { calls, actions } = recorder();
    taskBarOn(800, actions).update(newVagrantWithBar(), BAR_DATA);
    key('keydown', 'KeyC');
    expect(calls).toEqual([]);
    key('keyup', 'KeyC');
    expect(calls).toEqual(['useActionSlot']);
  });

  it('no key works with Ctrl, Alt or Meta, nor while typing in a field', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    bar.update(newVagrantWithBar(), BAR_DATA);
    key('keydown', 'KeyH', { ctrlKey: true });
    key('keydown', 'Digit2', { altKey: true });
    key('keydown', 'F1', { key: 'F1', metaKey: true });
    const field = document.createElement('input');
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH', key: 'h', bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'c', bubbles: true }));
    expect(calls).toEqual([]);
    expect(bar.bar).toBe(0);
  });

  it('a disposed bar hears no key', () => {
    const { calls, actions } = recorder();
    const bar = taskBarOn(800, actions);
    bar.update(newVagrantWithBar(), BAR_DATA);
    bar.dispose();
    key('keydown', 'KeyH');
    key('keyup', 'KeyC');
    expect(calls).toEqual([]);
    expect(bar.element.isConnected).toBe(false);
  });
});

describe('escapeStep (CWndMgr::Process, WndManager.cpp:3295-3427)', () => {
  const state = { dead: false, menuOpen: false, target: false, window: false };
  it('dead: the revive window; else, the Start menu open: nothing; else a target to clear; else a window to close; else the Start menu', () => {
    expect(escapeStep({ ...state, dead: true, target: true, window: true })).toBe('revive');
    expect(escapeStep({ ...state, menuOpen: true, target: true, window: true })).toBe('none');
    expect(escapeStep({ ...state, target: true, window: true })).toBe('target');
    expect(escapeStep({ ...state, window: true })).toBe('window');
    expect(escapeStep(state)).toBe('menu');
  });
});

describe('Escape and the windows (GetWndBase, WndBase.cpp:2048-2095)', () => {
  it('never closes the status window: it is passed over for the window under it, and with none Escape is left to its owner', () => {
    const parent = layer();
    const status = new StatusWindow(art, DATA);
    const other = new WindowFrame('Character', art);
    parent.append(status.frame.element, other.element);
    other.open({ x: 0, y: 0 });
    status.update(newVagrant(), 'Webby');
    expect(escapeWindow(document)).toBe(other);
    let event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(other.isOpen).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(escapeWindow(document)).toBeUndefined();
    event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(status.frame.isOpen).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    status.frame.close();
  });

  it('an Escape an earlier handler took (a target cleared, the revive window) closes no window', () => {
    const frame = new WindowFrame('Character', art);
    layer().append(frame.element);
    frame.open({ x: 0, y: 0 });
    const take = (event: KeyboardEvent) => event.preventDefault();
    window.addEventListener('keydown', take, true);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    window.removeEventListener('keydown', take, true);
    expect(frame.isOpen).toBe(true);
    frame.close();
  });
});

describe('AttackButton (touch screens; spec §3.9)', () => {
  /** The new Vagrant 6 m from an Aibatt, and the attack loop over them, as the world screen makes it. */
  function fight() {
    const AIBATT_ID = 30;
    const data = ownGameData({
      movers: new Map([[AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', killable: 1, belligerence: Belli.ACTIVEATTACK })]]),
    });
    const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0));
    const self = { ...ownAdded(1), pos: [100, 0, 100] as [number, number, number], angle: 90, state: ObjSta.STAND };
    world.apply(self.objectId, { type: 'addMover', mover: self });
    world.apply(AIBATT_ID, {
      type: 'addMover',
      mover: addedNpc(AIBATT_ID, AIBATT, {}, { pos: [106, 0, 100], state: ObjSta.STAND, belligerence: Belli.ACTIVEATTACK }),
    });
    const session = {
      sendDestObj: () => {}, sendMeleeAttack: () => {}, sendGetDestObj: () => {}, sendBehavior: () => {}, sendSetTarget: () => {},
    };
    const focus = new Focus(session);
    const own = newVagrant();
    const loop = new AttackLoop(session, focus, world, () => own, { tick: () => 0n }, data.movers);
    return { loop, AIBATT_ID };
  }

  it('is disabled with no target and enabled with an Aibatt selected; a press attacks', () => {
    const { loop, AIBATT_ID } = fight();
    const button = new AttackButton(() => loop.attackButton());
    layer().append(button.element);
    expect(button.element.getAttribute('aria-label')).toBe('Attack');
    button.update(loop.canAttackFocus);
    expect(button.element.disabled).toBe(true);
    loop.onMoverPressed(AIBATT_ID, 10_000, false);
    loop.onReleased();
    button.update(loop.canAttackFocus);
    expect(button.element.disabled).toBe(false);
    button.element.click();
    expect(loop.autoAttack).toBe(true);
    button.dispose();
  });

  it('shows on touch screens only: where the main pointer is a finger, or from the first touch (as the joystick)', () => {
    const button = new AttackButton(() => {});
    layer().append(button.element);
    // jsdom has no coarse pointer
    expect(button.element.hidden).toBe(true);
    const mouse = pointer('pointerdown', 10, 10);
    Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
    document.body.dispatchEvent(mouse);
    expect(button.element.hidden).toBe(true);
    const touch = pointer('pointerdown', 10, 10);
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    document.body.dispatchEvent(touch);
    expect(button.element.hidden).toBe(false);
    button.dispose();
    expect(button.element.isConnected).toBe(false);
  });
});

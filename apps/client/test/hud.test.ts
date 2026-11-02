// @vitest-environment jsdom
// The on-screen windows of Piece 4 (spec §3.9), in a DOM: the status window (CWndStatus, _Interface/WndField.cpp:10299-10631),
// the target bar (CWndWorld::RenderSelectObj, _Interface/WndWorld.cpp:2716-2931), the server message lines (CClientMsg,
// _Common/ClientMsg.cpp), the caption (CCaption, WndWorld.cpp:89-300), the window frame (CWndBase, CWndNeuz) and the
// texts of DEFINEDTEXT (CDPClient::OnDefinedText, Neuz/DPClient.cpp:4117-4228).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebMover, WebSkill } from '@flyffweb/formats';
import { NULL_ID, ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut, SkillSlot, TaskBar as TaskBarMessage } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { AttackLoop } from '../src/world/combat/attackLoop';
import { Focus } from '../src/world/combat/focus';
import type { Texts } from '../src/world/gameData';
import { AttackButton } from '../src/world/hud/attackButton';
import { APPLETS, appletText } from '../src/world/hud/applets';
import { escapeStep } from '../src/world/hud/escape';
import { WindowFrame, escapeWindow, refitWindows, setLayoutBottom } from '../src/world/hud/frame';
import type { UiArt } from '../src/world/hud/art';
import { Hud } from '../src/world/hud/hud';
import { Caption, MessageLines, formatDefinedText } from '../src/world/hud/messages';
import { StatusWindow } from '../src/world/hud/statusWindow';
import { TargetBar } from '../src/world/hud/targetBar';
import { LogOutBox } from '../src/world/hud/logOutBox';
import { CharacterWindow } from '../src/world/hud/characterWindow';
import type { StatCounts } from '../src/world/hud/characterWindow';
import { ReviveWindow } from '../src/world/hud/reviveWindow';
import { SkillWindow, skillTooltip } from '../src/world/hud/skillWindow';
import type { SkillHand } from '../src/world/hud/skillWindow';
import { TaskBar, actionPointLit, taskBarLayout } from '../src/world/hud/taskBar';
import type { TaskBarActions } from '../src/world/hud/taskBar';
import { terrainGround } from '../src/world/sim/collision';
import { Belli, ObjSta } from '../src/world/sim/constants';
import { Dst } from '../src/world/sim/params';
import { SkillUse } from '../src/world/skills/skillUse';
import type { OwnState } from '../src/world/OwnState';
import { WorldState } from '../src/world/WorldState';
import { addedNpc, addedPlayer, moverFrom, webMoverOf } from './helpers/movers';
import { EXP_ROWS, OWN_ID, VAGRANT, WOODEN_SWORD, itemProp, newVagrant, ownAdded, ownGameData } from './helpers/ownState';
import { CLEAN_HIT, FLURRY, OVER_CUT } from './helpers/skills';

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
  text(
    'TID_GAME_RECCURENCE', 2621,
    'Your character’s skill points have been reset.  Please redistribute your points in the Skill Tree window.', 0xff99cc00,
  ),
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
  skills: new Map(),
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

  it('a reset of the skill points has its chat line, unless it stopped early (OnInitSkillPoint, DPClient.cpp:14701-14725)', () => {
    const hud = hudOn();
    hud.play([], [
      { kind: 'skillPointReset', effect: true, chatLine: true },
      { kind: 'skillPointReset', effect: false, chatLine: false },
    ], newVagrant());
    expect(shown(hud)).toEqual([
      'Your character’s skill points have been reset.  Please redistribute your points in the Skill Tree window.',
    ]);
    expect((hud.messages.element.children[0] as HTMLElement).style.color).toBe('rgb(153, 204, 0)');
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
const food = { kind1: 3, kind2: 14, kind3: 30, part: -1, packMax: 99 };
const LOLLIPOP = itemProp({ id: 2800, name: 'Lollipop', ...food, icon: 'ui/item/itm_genfoolollip.png' });
const BISCUIT = itemProp({ id: 2801, name: 'Biscuit', ...food, icon: 'ui/item/itm_genfoobiscuit.png' });
/** `II_WEA_SWO_WOODEN` (`propItem.txt:701`): one to a slot (`dwPackMax` 1). */
const SWORD = itemProp({ id: 21, name: 'Wooden Sword', kind1: 1, kind2: 2, kind3: 2, part: 10, icon: 'ui/item/itm_weaswowooden.png' });
const BAR_DATA = { itemProps: new Map([LOLLIPOP, BISCUIT, SWORD].map((prop) => [prop.id, prop])) };
/** The Vagrant's three skills as `data/skills.json` has them, with their icons and descriptions (`propSkill.txt.txt:2-6`). */
const SKILLS: ReadonlyMap<number, WebSkill> = new Map([
  { ...CLEAN_HIT, icon: 'ui/skill_vagonecleanh.png', description: 'A powerful, downward strike.' },
  { ...FLURRY, icon: 'ui/skill_vagonebrandi.png', description: 'Rapid, stabbing attack.' },
  { ...OVER_CUT, icon: 'ui/skill_vagoneovercu.png', description: 'Powerful, upward, finishing move.' },
].map((skill) => [skill.id, skill]));

/** The new Vagrant with its TASKBAR. */
function newVagrantWithBar() {
  const own = newVagrant();
  own.taskBar = NEW_BAR;
  return own;
}

/** What the task bar sent: ADDITEMTASKBAR, REMOVEITEMTASKBAR and SKILLTASKBAR, with their fields. */
type Sent =
  | { type: 'ADDITEMTASKBAR'; bar: number; slot: number; shortcut: Shortcut }
  | { type: 'REMOVEITEMTASKBAR'; bar: number; slot: number }
  | { type: 'SKILLTASKBAR'; queue: Array<Shortcut | null> };

/**
 * Actions that record what the task bar asks for (`calls`), what it sends (`sent`) and the lines it says (`said`);
 * `running.value` is the action slot's chain (`m_nExecute != 0`).
 */
function recorder() {
  const calls: string[] = [];
  const sent: Sent[] = [];
  const said: Array<{ text: string; color: number }> = [];
  const running = { value: false };
  const actions: TaskBarActions = {
    open: (window) => void calls.push(`open ${window}`),
    logOut: () => void calls.push('logOut'),
    useSlot: (bar, slot, used) => void calls.push(`useSlot ${bar} ${slot}${used.kind === ShortcutKind.SKILL ? ` skill ${used.id}` : ''}`),
    useAppletSlot: (slot, used) => void calls.push(`useAppletSlot ${slot} ${used.kind} ${used.id}`),
    useActionSlot: () => void calls.push('useActionSlot'),
    sendAddItemTaskBar: (bar, slot, added) => void sent.push({ type: 'ADDITEMTASKBAR', bar, slot, shortcut: added }),
    sendRemoveItemTaskBar: (bar, slot) => void sent.push({ type: 'REMOVEITEMTASKBAR', bar, slot }),
    sendSkillTaskBar: (queue) => void sent.push({ type: 'SKILLTASKBAR', queue: [...queue] }),
    queueRunning: () => running.value,
    say: (text, color) => void said.push({ text, color }),
  };
  return { calls, sent, said, running, actions };
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
  it('persists a consumed stack shortcut rebind and clears it once the final stack is gone', () => {
    const { actions, sent } = recorder();
    const bar = taskBarOn(800, actions), own = newVagrantWithBar();
    bar.update(own, BAR_DATA);
    own.inventory!.delete(45);
    own.inventory!.set(6, { objectId: 6, itemId: 2800, count: 2 });
    bar.update(own, BAR_DATA);
    expect(sent).toContainEqual({ type: 'ADDITEMTASKBAR', bar: 0, slot: 0, shortcut: expect.objectContaining({ id: 6 }) });
    expect(own.taskBar!.items.find((s) => s.bar === 0 && s.slot === 0)?.shortcut.id).toBe(6);
    own.inventory!.delete(6); bar.update(own, BAR_DATA);
    expect(sent).toContainEqual({ type: 'REMOVEITEMTASKBAR', bar: 0, slot: 0 });
    expect(own.taskBar!.items.find((s) => s.bar === 0 && s.slot === 0)).toBeUndefined();
  });
  it('can place inventory object zero on an item bar', () => {
    const { actions, sent } = recorder();
    const bar = taskBarOn(800, actions), own = newVagrantWithBar();
    bar.update(own, BAR_DATA); bar.setInventoryShortcut(0, 3);
    expect(sent).toContainEqual({ type: 'ADDITEMTASKBAR', bar: 0, slot: 3, shortcut: expect.objectContaining({ id: 0, kind: ShortcutKind.ITEM }) });
  });
  it("shows the new character's bar: the lollipops (3) and the biscuit (1) greyed, the motions as plain greyed slots, and the applets' icons", () => {
    const bar = taskBarOn();
    bar.update(newVagrantWithBar(), BAR_DATA);
    // the item bar: the item's icon (CItemBase::GetTexture) and m_Inventory.GetItemCount( m_dwItemId ) (:946-956), greyed
    // until items are used (Piece 5)
    expect(shown(slot(bar, 'item', 0))).toEqual({
      kind: 'item', greyed: false, icon: 'url("/assets/ui/item/itm_genfoolollip.png")', count: '3', hotkey: '',
    });
    expect(shown(slot(bar, 'item', 1))).toEqual({
      kind: 'item', greyed: false, icon: 'url("/assets/ui/item/itm_genfoobiscuit.png")', count: '1', hotkey: '',
    });
    for (const i of [2, 8]) {
      expect(shown(slot(bar, 'item', i))).toEqual({ kind: 'plain', greyed: true, icon: '', count: '', hotkey: '' });
    }
    for (const i of [3, 4, 5, 6, 7]) expect(shown(slot(bar, 'item', i)).kind).toBe('');
    // the applets: their icon from AddAllApplet's table (SetTaskBarTexture, :405-416) and their hotkey above (:889-896)
    expect(shown(slot(bar, 'applet', 0))).toEqual({
      kind: 'applet', greyed: true, icon: 'url("/assets/ui/icon_citemmall.png")', count: '', hotkey: '',
    });
    expect(shown(slot(bar, 'applet', 1))).toEqual({
      kind: 'applet', greyed: true, icon: 'url("/assets/ui/icon_citemtime.png")', count: '', hotkey: '',
    });
    // APP_CHARACTER (2010) and APP_SKILL1 (581) have no applet in a version 15 Neuz, which registers APP_CHARACTER3 and
    // APP_SKILL3 instead (FuncApplet.cpp:203-217): GetAppletFunc finds nothing, and the slot draws no picture (:405-416,
    // :826-829)
    for (const i of [2, 3]) {
      expect(shown(slot(bar, 'applet', i))).toEqual({ kind: 'applet', greyed: true, icon: '', count: '', hotkey: '' });
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
    bar.element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[7]!.click();
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
    const fresh = taskBarOn();
    fresh.update(own, { ...BAR_DATA, skills: SKILLS });
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

  it('draws its slots itself, as CWndTaskBar does: they make no click sound (Piece 6 M2)', () => {
    const bar = taskBarOn(800, recorder().actions);
    bar.update(newVagrantWithBar(), BAR_DATA);
    expect(slot(bar, 'item', 0).hasAttribute('data-silent')).toBe(true);
    expect(slot(bar, 'applet', 0).hasAttribute('data-silent')).toBe(true);
    expect(bar.element.querySelector('.hud-taskbar-action')!.hasAttribute('data-silent')).toBe(true);
    expect(bar.element.querySelector('.hud-taskbar-start')!.hasAttribute('data-silent')).toBe(false);
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
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(['Status', 'Character', 'Skills', 'Inventory', 'World Map', 'Navigator', 'Option', 'Log out']);
    expect(items.map((item) => item.querySelector('.hud-menu-text')!.textContent)).toEqual(['Status', 'Character', 'Skills', 'Inventory', 'World Map', 'Navigator', 'Option', 'Log out']);
    // every line has its window (the skill window's, milestone 2's, too)
    expect(items.map((item) => item.disabled)).toEqual([false, false, false, false, false, false, false, false]);
    expect(items[0]!.querySelector<HTMLElement>('.hud-menu-icon')!.style.backgroundImage).toContain('/assets/ui/icon_status.png');
    // as CWndTaskMenu draws it (WndTaskBar.cpp:2646-2653), line i at (10, 50 + 22 i), 162 wide, with its applet's hotkey
    // (AppendMenu, :2746); each line takes its whole 22 px row, no gap between two (ruling R27). The picture,
    // WndTaskMenu.tga (192 x 496), is drawn in three: its top edge (0-50), the four lines' rows (50-138) and its bottom
    // edge (the last 26 px), 252 px in all, for the eight lines the client has instead of Neuz's twenty
    const slices = [...menu.querySelectorAll<HTMLElement>('.hud-menu-slice')];
    expect(slices.map((slice) => [slice.style.top, slice.style.height, slice.style.backgroundPosition])).toEqual([
      ['0px', '50px', '0px 0px'], ['50px', '176px', '0px -50px'], ['226px', '26px', '0px -470px'],
    ]);
    expect(slices.every((slice) => slice.style.backgroundImage === 'url("/assets/ui/wndtaskmenu.png")')).toBe(true);
    expect([menu.style.width, menu.style.height]).toEqual(['192px', '252px']);
    expect(items.map((item) => [item.style.left, item.style.top, item.style.width, item.style.height])).toEqual([
      ['10px', '50px', '162px', '22px'], ['10px', '72px', '162px', '22px'], ['10px', '94px', '162px', '22px'],
      ['10px', '116px', '162px', '22px'], ['10px', '138px', '162px', '22px'], ['10px', '160px', '162px', '22px'],
      ['10px', '182px', '162px', '22px'],
      ['10px', '204px', '162px', '22px'],
    ]);
    expect(items.map((item) => item.querySelector('.hud-menu-hotkey')!.textContent)).toEqual(['T', 'H', 'K', 'I', 'M', 'N', '', '']);
    // the menu stands on the bar, its own scale
    expect(menu.style.bottom).toBe('48px');
    items[7]!.click();
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

  it('a press on an applet with a window in Piece 4 opens it; the other applets do nothing; a non-applet goes to the owner', () => {
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
    // the motion of slot 4 is ObjectExecutor's too (OnLButtonUp, WndTaskBar.cpp:2178-2188): its owner's
    expect(calls).toEqual(['open status', 'open character', 'open inventory', 'useAppletSlot 4 3 25']);
    // a slot of the item bar goes to its owner (ObjectExecutor) with its shortcut: items in Piece 5, skills in milestone 2;
    // an empty one is nothing
    slot(bar, 'item', 0).click();
    slot(bar, 'item', 3).click();
    expect(calls).toEqual(['open status', 'open character', 'open inventory', 'useAppletSlot 4 3 25', 'useSlot 0 0']);
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
  it('fills phone widths between native bar sizes without leaving a gap', () => {
    const layout = taskBarLayout(844, true);
    expect(layout.width * layout.scale).toBe(844);
  });
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
    // narrower than 800 px: the bar drawn smaller; the menu above it at its own scale, 1 with a mouse
    const small = taskBarOn(400);
    small.update(newVagrantWithBar(), BAR_DATA);
    expect(strip(small).style.transform).toBe('scale(0.5)');
    const menu = small.element.querySelector<HTMLElement>('.hud-taskbar-menu')!;
    expect([menu.style.transform, menu.style.bottom]).toEqual(['', '24px']);
    expect(small.element.parentElement!.style.getPropertyValue('--hud-taskbar-height')).toBe('24px');
  });
});

describe('APPLETS (CWndMgr::AddAllApplet, FuncApplet.cpp:178-301)', () => {
  it('has the icon and hotkey of each applet the live build registers', () => {
    const tid = (id: string) => ({ tid: id });
    expect(APPLETS.get(577)).toEqual({ name: 'APP_STATUS1', icon: 'Icon_Status.dds', desc: tid('TID_TIP_STATUS'), hotkey: 'T' });
    expect(APPLETS.get(764)).toEqual({ name: 'APP_CHARACTER3', icon: 'Icon_Character.dds', desc: tid('TID_TIP_CHARACTER'), hotkey: 'H' });
    expect(APPLETS.get(622)).toEqual({ name: 'APP_SKILL3', icon: 'Icon_Skill.dds', desc: tid('TID_TIP_SKILL'), hotkey: 'K' });
    expect(APPLETS.get(1100)).toEqual({ name: 'APP_LOGOUT', icon: 'Icon_Logout.dds', desc: tid('TID_TIP_LOGOUT'), hotkey: null });
    // __IMPROVE_MAP_SYSTEM is off
    expect(APPLETS.get(228)).toEqual({ name: 'APP_MAP', icon: 'Icon_Applet.dds', desc: tid('TID_TIP_MAP'), hotkey: 'M' });
    expect(APPLETS.get(302)).toEqual({ name: 'APP_MESSENGER_EX', icon: 'Icon_Messenger.dds', desc: tid('TID_TIP_MESSENGER'), hotkey: 'E' });
    expect(APPLETS.get(593)).toEqual({ name: 'APP_PARTY_QUICK', icon: null, desc: tid('TID_TIP_DIALOG'), hotkey: null });
    // the BB windows name themselves (_T( "Teleporter" ), FuncApplet.cpp:238)
    expect(APPLETS.get(2023)!.desc).toEqual({ text: 'Teleporter' });
    expect(appletText(APPLETS.get(2023)!.desc, new Map())).toBe('Teleporter');
    expect(appletText(APPLETS.get(400)!.desc, new Map([['TID_TIP_ITEMMALL', { text: 'Item Mall' }]]))).toBe('Item Mall');
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
  it('responds to a second touch on pointer-down without waiting for a compatibility click', () => {
    const pressed = vi.fn();
    const button = new AttackButton(pressed, document, { label: 'Jump', className: 'hud-jump' });
    layer().append(button.element);
    button.update(true);
    button.element.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true, cancelable: true }), {
      pointerType: 'touch', pointerId: 2, isPrimary: false, button: 0,
    }));
    expect(pressed).toHaveBeenCalledTimes(1);
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(pressed).toHaveBeenCalledTimes(1);
    button.element.click(); // keyboard/accessibility activation remains usable
    expect(pressed).toHaveBeenCalledTimes(2);
    button.dispose();
  });
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
    document.body.dispatchEvent(pointer('pointermove', 20, 10));
    document.body.dispatchEvent(mouse);
    expect(button.element.hidden).toBe(true);
    button.dispose();
    expect(button.element.isConnected).toBe(false);
  });
});

describe('TaskBar: stackable items, names, focus and room (WndTaskBar.cpp)', () => {
  /** The new Vagrant's bar with the Wooden Sword (object 44, item 21, `dwPackMax` 1) in slot 3. */
  function withSword() {
    const own = newVagrantWithBar();
    own.taskBar = { ...NEW_BAR, items: [...NEW_BAR.items, { bar: 0, slot: 3, shortcut: shortcut(ShortcutKind.ITEM, 44, 3, 1) }] };
    return own;
  }

  it('a non-stackable item shows no count (dwPackMax 1, OnDraw :946-957), and gone it empties: no m_dwItemId (:368-380)', () => {
    const bar = taskBarOn();
    const own = withSword();
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 3))).toEqual({
      kind: 'item', greyed: false, icon: 'url("/assets/ui/item/itm_weaswowooden.png")', count: '', hotkey: '',
    });
    // another sword in the inventory does not take the slot: the shortcut kept no item ID (UpdateItem, :1114-1138)
    own.inventory!.delete(44);
    own.inventory!.set(50, { objectId: 50, itemId: 21, count: 1 });
    bar.update(own, BAR_DATA);
    expect(shown(slot(bar, 'item', 3)).kind).toBe('');
    // an item the catalog lacks stacks no more than a sword
    const unknown = newVagrantWithBar();
    unknown.inventory!.set(45, { objectId: 45, itemId: 9999, count: 3 });
    const other = taskBarOn();
    other.update(unknown, BAR_DATA);
    expect(shown(slot(other, 'item', 0))).toMatchObject({ kind: 'item', count: '' });
  });

  it('names each slot for a screen reader: an item its name, an applet its description (PutTooTip, :547-684)', () => {
    const bar = taskBarOn();
    const texts = new Map([
      ['TID_TIP_ITEMMALL', { text: 'Item Mall' }], ['TID_TIP_ITEMTIME', { text: 'Time Items' }],
      ['TID_GAME_SKILLSHORTCUT', { text: 'Action Slot' }],
    ]);
    bar.update(withSword(), { ...BAR_DATA, texts });
    const name = (row: 'applet' | 'item', i: number) => slot(bar, row, i).getAttribute('aria-label');
    expect([name('item', 0), name('item', 1), name('item', 3)]).toEqual(['Lollipop', 'Biscuit', 'Wooden Sword']);
    expect([name('applet', 0), name('applet', 1)]).toEqual(['Item Mall', 'Time Items']);
    // an applet the build lacks, a plain slot and an empty one have no name
    expect([name('applet', 2), name('item', 2), name('item', 5)]).toEqual([null, null, null]);
    expect(bar.element.querySelector('.hud-taskbar-action')!.getAttribute('aria-label')).toBe('Action Slot');
  });

  it('its buttons take no focus: out of the tab order, and a press gives them none (Space and Enter never press them)', () => {
    const bar = taskBarOn();
    bar.update(newVagrantWithBar(), BAR_DATA);
    const buttons = [...bar.element.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.length).toBeGreaterThan(20);
    for (const button of buttons) {
      expect(button.tabIndex, button.className).toBe(-1);
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
      button.dispatchEvent(press);
      expect(press.defaultPrevented, button.className).toBe(true);
    }
  });

  /** A task bar in a layer `width` x `height`, laid out; its Start menu. */
  const menuOn = (width: number, height: number) => {
    const bar = new TaskBar(art, recorder().actions);
    bars.push(bar);
    layer(width, height).append(bar.element);
    bar.update(newVagrantWithBar(), BAR_DATA);
    return { bar, menu: bar.element.querySelector<HTMLElement>('.hud-taskbar-menu')! };
  };
  /** A page whose main pointer is a finger (`(pointer: coarse)`), for `run`. */
  const onTouchScreen = (run: () => void) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true, value: (query: string) => ({ matches: query === '(pointer: coarse)' }),
    });
    try {
      run();
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  };

  it('with a mouse the menu is at its size, not the bar\'s, and smaller only where the layer is too short for its 164 px', () => {
    // 600 px wide: the bar at 0.75, the menu (192 px wide, it needs only the height) at 1
    const { bar, menu } = menuOn(600, 600);
    expect(bar.element.querySelector<HTMLElement>('.hud-taskbar-strip')!.style.transform).toBe('scale(0.75)');
    expect([menu.style.transform, menu.style.bottom]).toEqual(['', '36px']);
    // 150 px high: 102 px above the bar
    expect(menuOn(800, 150).menu.style.transform).toBe(`scale(${(150 - 48) / 252})`);
  });

  it('on a touch screen it is up to twice its size, as the room above the bar allows: a finger\'s 40 to 44 px a line', () => {
    onTouchScreen(() => {
      // A landscape phone leaves room for twice the 164px menu above the floating bar.
      expect(menuOn(844, 390).menu.style.transform).toBe(`scale(${(390 - 48 * 720 / 620) / 252})`);
      // The compact 620px layout fills the width between the phone's side gutters.
      expect(menuOn(750, 342).menu.style.transform).toBe(`scale(${(342 - 48 * (718 / 620)) / 252})`);
    });
  });

  it('a first touch on a computer with a mouse lays the menu out for a finger', () => {
    const { bar, menu } = menuOn(844, 390);
    expect(menu.style.transform).toBe('');
    const touch = pointer('pointerdown', 10, 10);
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    document.body.dispatchEvent(touch);
    bar.update(newVagrantWithBar(), BAR_DATA);
    expect(menu.style.transform).toBe(`scale(${(390 - 48 * (720 / 620)) / 252})`);
  });

  it('keeps the mobile taskbar bounds while typing or clicking Send on a phone', () => {
    onTouchScreen(() => {
      const { bar } = menuOn(844, 390);
      const bounds = () => [bar.element.style.left, bar.element.style.width,
        bar.element.parentElement!.style.getPropertyValue('--hud-taskbar-height')];
      const before = bounds();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
      bar.update(newVagrantWithBar(), BAR_DATA);
      expect(bounds()).toEqual(before);
      document.body.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' }));
      bar.update(newVagrantWithBar(), BAR_DATA);
      expect(bounds()).toEqual(before);
      expect(bar.element.querySelector<HTMLElement>('.hud-taskbar-strip')!.dataset.layout).toBe('620');
    });
  });

  it("keeps the windows above it: the layout's bottom is the bar's top (WndTaskBar.cpp:1176-1178)", () => {
    const parent = layer(800, 450);
    const bar = new TaskBar(art, recorder().actions);
    bars.push(bar);
    parent.append(bar.element);
    bar.update(newVagrantWithBar(), BAR_DATA);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 0, y: 400 });
    // 450 - 48 - 150
    expect(frame.element.style.top).toBe('252px');
    frame.close();
  });
});

describe('setLayoutBottom (m_rectLayout, WndBase.cpp:1261-1271)', () => {
  it("keeps a window dragged down clear of the layer's bottom by that much, clinging to the line within 10 px", () => {
    const parent = layer(800, 450);
    setLayoutBottom(parent, 48);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 0, y: 0 });
    const title = frame.element.querySelector('.hud-window-title')!;
    title.dispatchEvent(pointer('pointerdown', 5, 5));
    window.dispatchEvent(pointer('pointermove', 5, 600));
    expect(frame.element.style.top).toBe('252px');
    window.dispatchEvent(pointer('pointermove', 5, 249));
    expect(frame.element.style.top).toBe('252px'); // within 10 px of the line: against it
    window.dispatchEvent(pointer('pointerup', 5, 249));
    frame.close();
  });
});

describe('refitWindows (the screen resized or the device turned: Piece 4 spec §3.10)', () => {
  /** A layer whose size changes, as the world's does when the window is resized or the phone turned. */
  function turningLayer(size: { width: number; height: number }): HTMLElement {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { get: () => size.width });
    Object.defineProperty(element, 'clientHeight', { get: () => size.height });
    document.body.append(element);
    setLayoutBottom(element, 48);
    return element;
  }

  it('keeps a centered window centered when the viewport or taskbar layout changes', () => {
    const size = { width: 844, height: 390 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open('center');
    expect(frame.position).toEqual({ x: 322, y: 96 });
    Object.assign(size, { width: 750, height: 342 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 275, y: 72 });
    setLayoutBottom(parent, 84);
    refitWindows(document);
    expect(frame.position).toEqual({ x: 275, y: 54 });
    frame.close();
  });

  it('keeps an open window on the layer as it gets smaller, and puts it back where it was as it grows again', () => {
    const size = { width: 844, height: 390 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 600, y: 180 });
    expect(frame.position).toEqual({ x: 600, y: 180 });

    // upright: 390 x 844, the window squeezed in (the layer hides what is past its edges)
    Object.assign(size, { width: 390, height: 844 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 190, y: 180 });
    // a short window: its bottom above the task bar, its title bar on the screen
    Object.assign(size, { width: 844, height: 300 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 600, y: 102 });
    // turned back: where it was put
    Object.assign(size, { width: 844, height: 390 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 600, y: 180 });
    frame.close();
  });

  it('a window dragged to a place goes back to that place', () => {
    const size = { width: 844, height: 390 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 0, y: 0 });
    const title = frame.element.querySelector('.hud-window-title')!;
    title.dispatchEvent(pointer('pointerdown', 5, 5));
    window.dispatchEvent(pointer('pointermove', 2000, 105));
    window.dispatchEvent(pointer('pointerup', 2000, 105));
    expect(frame.position).toEqual({ x: 644, y: 100 });
    Object.assign(size, { width: 390, height: 844 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 190, y: 100 });
    Object.assign(size, { width: 844, height: 390 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 644, y: 100 });
    frame.close();
  });

  it('leaves a closed window alone', () => {
    const size = { width: 844, height: 390 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 600, y: 180 });
    frame.close();
    Object.assign(size, { width: 390, height: 844 });
    refitWindows(document);
    expect(frame.element.hidden).toBe(true);
    expect(frame.position).toEqual({ x: 600, y: 180 });
  });

  it('a window opened past an edge goes to the point it was opened at once the screen has room for it there', () => {
    const size = { width: 390, height: 844 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 200, height: 150 });
    parent.append(frame.element);
    frame.open({ x: 600, y: 180 });
    expect(frame.position).toEqual({ x: 190, y: 180 });
    Object.assign(size, { width: 844, height: 390 });
    refitWindows(document);
    expect(frame.position).toEqual({ x: 600, y: 180 });
    frame.close();
  });
});

describe('WindowFrame: a window taller than the room above the task bar (Piece 4 spec §3.10)', () => {
  /** A layer whose size changes, with the task bar's 45 px (a 750 px wide screen's) kept free at its bottom. */
  function turningLayer(size: { width: number; height: number }): HTMLElement {
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { get: () => size.width });
    Object.defineProperty(element, 'clientHeight', { get: () => size.height });
    document.body.append(element);
    setLayoutBottom(element, 45);
    return element;
  }
  /** The top of the frame's bottom-left corner tile (WndTile09), where the tiled frame ends. */
  const bottomCornerTop = (frame: WindowFrame): string =>
    frame.element.querySelector<HTMLElement>('.hud-window-frame > [data-tile="9"]')!.style.top;

  it('is cut to the room, its frame tiled at that height and its client area scrolling; with room again it is whole', () => {
    // an iPhone held on its side: 342 px, 297 above the bar; the Character window is 208 x 512 (APP_CHARACTER3)
    const size = { width: 750, height: 342 };
    const parent = turningLayer(size);
    const frame = new WindowFrame('Character', art, { width: 208, height: 512 });
    parent.append(frame.element);
    frame.open({ x: 0, y: 0 });
    expect(frame.element.style.height).toBe('297px');
    // the client area: 18 px of caption and 4 above it, 10 under it
    expect(frame.body.style.height).toBe(`${297 - 22 - 10}px`);
    expect(frame.element.hasAttribute('data-scrolls')).toBe(true);
    // AdditionalSkinTexture's tiles for 19 rows: the last row at 18 x 16
    expect(bottomCornerTop(frame)).toBe('288px');
    expect(frame.position).toEqual({ x: 0, y: 0 });

    // a taller screen: the whole window, its 32 rows of tiles, nothing to scroll
    Object.assign(size, { width: 1280, height: 720 });
    refitWindows(document);
    expect(frame.element.style.height).toBe('512px');
    expect(frame.body.style.height).toBe(`${512 - 22 - 10}px`);
    expect(frame.element.hasAttribute('data-scrolls')).toBe(false);
    expect(bottomCornerTop(frame)).toBe('496px');
    // and back on the phone
    Object.assign(size, { width: 750, height: 342 });
    refitWindows(document);
    expect(frame.element.style.height).toBe('297px');
    expect(frame.element.querySelectorAll('.hud-window-frame > [data-tile="9"]')).toHaveLength(1);
    frame.close();
  });

  it('a window that fits is left its height, and one in a layer not laid out yet too', () => {
    const fits = new WindowFrame('Status', art, { width: 200, height: 150 });
    turningLayer({ width: 750, height: 342 }).append(fits.element);
    fits.open({ x: 0, y: 0 });
    expect([fits.element.style.height, fits.element.hasAttribute('data-scrolls')]).toEqual(['150px', false]);
    const early = new WindowFrame('Character', art, { width: 208, height: 512 });
    turningLayer({ width: 0, height: 0 }).append(early.element);
    early.open({ x: 0, y: 0 });
    expect([early.element.style.height, early.element.hasAttribute('data-scrolls')]).toEqual(['512px', false]);
    fits.close();
    early.close();
  });
});

describe('LogOutBox (CWndLogOut, WndField.cpp:11910-11983; CWndMessageBox, WndMessageBox.cpp:65-129, :198-206)', () => {
  const LOG_OUT_TEXTS = new Map([
    ['TID_DIAG_0068', { text: 'Inbox' }], ['TID_DIAG_0069', { text: 'Do you want to disconnect?' }],
  ]);
  const boxes: LogOutBox[] = [];
  afterEach(() => {
    for (const box of boxes.splice(0)) box.dispose();
  });
  const boxOn = (onOk: () => void = () => {}) => {
    const box = new LogOutBox(art, LOG_OUT_TEXTS, onOk);
    boxes.push(box);
    layer(800, 450).append(box.element);
    return box;
  };
  const button = (box: LogOutBox, name: string) => box.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;

  it('is APP_MESSAGEBOX titled "Message Box" (its resdata title) with TID_DIAG_0069, at the middle of the width and 70 px down', () => {
    const box = boxOn();
    box.open(800);
    const element = box.frame.element;
    expect(box.isOpen).toBe(true);
    // CWndMessageBox::Create sets TID_DIAG_0068 as the title, which CWndNeuz::OnInitialUpdate puts back to the applet's
    // (WndNeuz.cpp:210-216): IDS_RESDATA_INC_003100
    expect(element.querySelector('.hud-window-title')!.textContent).toBe('Message Box');
    expect(element.querySelector('.hud-logout-text')!.textContent).toBe('Do you want to disconnect?');
    expect(element.querySelector<HTMLElement>('.hud-window-frame')!.style.backgroundImage).toBe('url("/assets/ui/wndmessagebox.png")');
    expect([element.style.width, element.style.height]).toEqual(['256px', '144px']);
    expect([element.style.left, element.style.top]).toEqual(['272px', '70px']);
    // OK 70 px left of the client area's middle (122) and Cancel 10 px right of it, 30 px over its bottom (112)
    const ok = button(box, 'ok');
    const cancel = button(box, 'cancel');
    expect([ok.getAttribute('aria-label'), ok.style.left, ok.style.top, ok.style.width]).toEqual(['OK', '52px', '82px', '72px']);
    expect([cancel.getAttribute('aria-label'), cancel.style.left, cancel.style.top]).toEqual(['Cancel', '132px', '82px']);
    expect(ok.style.backgroundImage).toBe('url("/assets/ui/buttok.png")');
    expect(cancel.style.backgroundImage).toBe('url("/assets/ui/buttcancel.png")');
    // RenderWndButton_4Texture's quarters of 72 px: highlighted, normal (at rest), pushed, disabled (ITheme.cpp:1336-1414)
    expect(ok.classList.contains('hud-picture-button')).toBe(true);
    expect(ok.style.getPropertyValue('--hud-quarter')).toBe('72px');
  });

  it('OK logs out and closes it; Cancel and its close button close it and do nothing else', () => {
    const onOk = vi.fn();
    const box = boxOn(onOk);
    box.open(800);
    button(box, 'cancel').click();
    expect(box.isOpen).toBe(false);
    expect(box.element.hidden).toBe(true);
    box.open(800);
    box.frame.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect(box.isOpen).toBe(false);
    expect(onOk).not.toHaveBeenCalled();
    box.open(800);
    button(box, 'ok').click();
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(box.isOpen).toBe(false);
  });

  it('is modal (WBS_MODAL, WndMessageBox.cpp:202): no key reaches the game, Escape does not close it, its backdrop takes the presses', () => {
    const box = boxOn();
    const heard: string[] = [];
    const listen = (event: Event) => void heard.push(event.type);
    window.addEventListener('keydown', listen);
    box.element.parentElement!.addEventListener('pointerdown', listen);
    box.open(800);
    expect(box.element.hidden).toBe(false);
    expect(box.element.classList.contains('hud-modal')).toBe(true);
    press('KeyH');
    press('Escape', { key: 'Escape' });
    box.element.dispatchEvent(pointer('pointerdown', 5, 5));
    expect(heard).toEqual([]);
    expect(box.isOpen).toBe(true);
    button(box, 'cancel').click();
    press('KeyH');
    expect(heard).toEqual(['keydown']);
    window.removeEventListener('keydown', listen);
  });
});

// The revive window (CWndRevival, _Interface/WndField.cpp:12147-12345) and the Character window (CWndCharacter and
// CWndCharInfo, WndField.cpp:2986-4110) with its confirm box (CWndStateConfirm, :4395-4560).

/** The texts these windows read, as data/texts.json gives them. */
const WINDOW_TEXTS: Texts = new Map([
  ...TEXTS,
  text('TID_GAME_TOOLTIP_LODESTAR', 1153, 'Lodestar is a place near the closest city where a character can choose to be resurrected.'),
  text('TID_GAME_TOOLTIP_LODELIGHT', 1152, 'Lodelight is a spawning point where a character can be resurrected.'),
  text('TID_GAME_TOOLTIP_OGNPOINT', 2632, 'You will be revived where you died.'),
  text('TID_GAME_TOOLTIP_SHOP', 3335, 'You can use a Premium item.'),
  text('TID_GAME_TITLE_CHAR_INFO', 4004, 'Character'),
  text('TID_GAME_TITLE_HONOR', 4005, 'Fame/Master'),
  text('TID_APP_CHARACTER_BASE', 158, 'Base'),
  text('TID_APP_CHARACTER_DETAIL', 159, 'Detail'),
  text('TID_APP_CHARACTER_JOB', 160, 'Job'),
  text('TID_GAME_CHARACTER_01', 3077, 'Name'),
  text('TID_GAME_CHARACTER_02', 3078, 'Level'),
  text('TID_GAME_CHAR_SERVER', 3362, 'Server'),
  text('TID_GAME_CHAR_SERVERNAME', 3363, 'Channel'),
  text('TID_GAME_CHARACTER_13', 3089, 'ATK'),
  text('TID_GAME_CHARACTER_14', 3090, 'Critical'),
  text('TID_TOOLTIP_DEFENCE', 1344, 'DEF'),
  text('TID_GAME_CHARACTER_15', 3091, 'A.Speed'),
  text('TID_GAME_CHARACTER_07', 3083, 'Stat Points'),
  text('TID_TOOLTIP_STR', 1377, 'STR'),
  text('TID_TOOLTIP_STA', 1338, 'STA'),
  text('TID_TOOLTIP_DEX', 1336, 'DEX'),
  text('TID_TOOLTIP_INT', 1337, 'INT'),
  text('TID_TOOLTIP_CHARSTATUS_APPLY', 3306, 'Apply new Stats.'),
  text('TID_TOOLTIP_CHARSTATUS_RESET', 3307, 'Return to Previous Stats.'),
  text('TID_GAME_CHARSTATUS_APPLY_Q', 3308, 'Do you want to use the current Stat setup?'),
  text('TID_DIAG_0082', 2081, 'Your stat values will reset after your 1st job change.'),
  text('TID_GAME_YES', 2500, 'Yes', 0xff9a0000),
  text('TID_GAME_NO', 2501, 'No', 0xff9a0000),
]);

/** A key pressed on the page, as the player types it. */
const press = (code: string, extra: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { code, key: code.replace(/^Key|^Digit/, ''), bubbles: true, cancelable: true, ...extra });
  document.body.dispatchEvent(event);
  return event;
};

describe('ReviveWindow (CWndRevival, WndField.cpp:12147-12345)', () => {
  const windows: ReviveWindow[] = [];
  afterEach(() => {
    for (const revive of windows.splice(0)) revive.dispose();
  });
  /** The revive window in a layer 800 px wide, `sent` the REVIVAL_TO_LODESTARs its Lodestar sent. */
  const reviveOn = () => {
    const sent: string[] = [];
    const revive = new ReviveWindow(art, WINDOW_TEXTS, () => void sent.push('REVIVAL_TO_LODESTAR'));
    windows.push(revive);
    layer(800, 450).append(revive.element);
    return { revive, sent };
  };
  const button = (revive: ReviveWindow, name: string) =>
    revive.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;

  it('the own death opens it, says TID_GAME_DEATH among the server messages and stops the auto-attack; Lodestar sends one REVIVAL_TO_LODESTAR', () => {
    // the new Vagrant auto-attacking an Aibatt 6 m away, as the world screen has them
    const AIBATT_ID = 30;
    const own = newVagrant();
    const data = ownGameData({
      movers: new Map([[AIBATT, webMoverOf({ index: AIBATT, name: 'Aibatt', killable: 1, belligerence: Belli.ACTIVEATTACK })]]),
      texts: WINDOW_TEXTS,
    });
    const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0), own);
    world.apply(OWN_ID, { type: 'addMover', mover: { ...ownAdded(1), pos: [100, 0, 100], angle: 90, state: ObjSta.STAND } });
    world.apply(AIBATT_ID, {
      type: 'addMover',
      mover: addedNpc(AIBATT_ID, AIBATT, {}, { pos: [106, 0, 100], state: ObjSta.STAND, belligerence: Belli.ACTIVEATTACK }),
    });
    const session = {
      sendDestObj: () => {}, sendMeleeAttack: () => {}, sendGetDestObj: () => {}, sendBehavior: () => {}, sendSetTarget: () => {},
    };
    const loop = new AttackLoop(session, new Focus(session), world, () => own, { tick: () => 0n }, data.movers);
    loop.onMoverPressed(AIBATT_ID, 10_000, false);
    loop.onReleased();
    loop.attackButton();
    expect(loop.autoAttack).toBe(true);
    const hud = new Hud(document, art, { ...DATA, texts: WINDOW_TEXTS });
    document.body.append(hud.element);
    const { revive, sent } = reviveOn();
    world.takeChanges();

    // MOVERDEATH of the own mover, as the world screen applies it (`WorldScreen.apply`): the attack loop first, then the
    // world; then the frame plays what it brought (`WorldScreen.play`)
    loop.onMoverDeath(OWN_ID, AIBATT_ID);
    world.apply(OWN_ID, { type: 'moverDeath', attackerId: AIBATT_ID, message: 41 });
    const changes = world.takeChanges();
    hud.play(changes.combat, changes.own, own);
    revive.play(changes.own);

    expect(revive.isOpen).toBe(true);
    expect(loop.autoAttack).toBe(false);
    const lines = [...hud.messages.element.children].map((e) => e.textContent);
    expect(lines).toEqual(['Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.']);
    // Revive here wants a resurrection scroll (Piece 5): greyed
    expect(button(revive, 'stand').disabled).toBe(true);
    expect(button(revive, 'lodestar').disabled).toBe(false);
    // Lodestar sends REVIVAL_TO_LODESTAR and destroys the window (:12311-12320, :12342-12343); a second click finds it gone
    button(revive, 'lodestar').click();
    button(revive, 'lodestar').click();
    expect(sent).toEqual(['REVIVAL_TO_LODESTAR']);
    expect(revive.isOpen).toBe(false);
    hud.dispose();
  });

  it('is APP_REVIVAL titled "Revive", with no close button, at the middle of the width and 70 px down; its buttons where v15 moves them', () => {
    const { revive } = reviveOn();
    revive.open();
    const element = revive.frame.element;
    expect([element.style.width, element.style.height]).toEqual(['176px', '128px']);
    expect([element.style.left, element.style.top]).toEqual(['312px', '70px']);
    expect(element.querySelector('.hud-window-title')!.textContent).toBe('Revive');
    // m_wndTitleBar.SetVisible( FALSE ) (:12219): the frame has no close button
    expect(element.querySelector('.hud-window-close')).toBeNull();
    const rect = (name: string) => {
      const b = button(revive, name);
      return [b.style.left, b.style.top, b.style.width, b.style.height, b.style.backgroundImage];
    };
    expect(rect('lodestar')).toEqual(['12px', '12px', '140px', '20px', 'url("/assets/ui/buttlodestar.png")']);
    // __VER >= 9 (:12221-12245): Revive here takes the Lodelight's place, the Shop the Revive here's, the Lodelight hidden
    expect(rect('stand')).toEqual(['12px', '38px', '140px', '20px', 'url("/assets/ui/buttrevivestand.png")']);
    expect(rect('shop')).toEqual(['12px', '64px', '140px', '20px', 'url("/assets/ui/buttflyffshop.png")']);
    expect(element.querySelector('[data-button="lodelight"]')).toBeNull();
    // the tooltips (:12183-12187)
    expect(button(revive, 'lodestar').title)
      .toBe('Lodestar is a place near the closest city where a character can choose to be resurrected.');
    expect(button(revive, 'stand').title).toBe('You will be revived where you died.');
    expect(button(revive, 'shop').title).toBe('You can use a Premium item.');
    // the item mall is not the browser's yet
    expect(button(revive, 'shop').disabled).toBe(true);
  });

  it('is modal (WBS_MODAL): no key reaches the game while it is open, and its backdrop takes the presses; Escape never closes it', () => {
    const { revive } = reviveOn();
    const heard: string[] = [];
    const listen = (event: KeyboardEvent) => void heard.push(event.code);
    window.addEventListener('keydown', listen);
    revive.open();
    expect(revive.element.hidden).toBe(false);
    expect(revive.element.classList.contains('hud-modal')).toBe(true);
    press('KeyH');
    press('Escape', { key: 'Escape' });
    expect(heard).toEqual([]);
    expect(revive.isOpen).toBe(true);
    // a press on the backdrop, where a window or the world lies under it, reaches none of the page's handlers
    const pressed: string[] = [];
    const hear = (event: Event) => void pressed.push(event.type);
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      revive.element.parentElement!.addEventListener(type, hear);
      document.addEventListener(type, hear);
    }
    revive.element.dispatchEvent(pointer('pointerdown', 5, 5));
    revive.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    revive.element.click();
    expect(pressed).toEqual([]);
    // a press in the window still works: the window is pressed, then the page hears it as ever
    button(revive, 'stand').dispatchEvent(pointer('pointerdown', 20, 40));
    expect(pressed).toEqual(['pointerdown', 'pointerdown']);
    for (const type of ['pointerdown', 'mousedown', 'click']) document.removeEventListener(type, hear);
    // opened again while open: one window (`m_pWndRevival == NULL`, WndManager.cpp:3313)
    revive.open();
    expect(revive.isOpen).toBe(true);
    button(revive, 'lodestar').click();
    expect(revive.element.hidden).toBe(true);
    press('KeyH');
    expect(heard).toEqual(['KeyH']);
    window.removeEventListener('keydown', listen);
  });

  it('opens on a death only: no other own event opens it', () => {
    const { revive } = reviveOn();
    revive.play([{ kind: 'refilled' }, { kind: 'statsChanged' }, { kind: 'revived' }]);
    expect(revive.isOpen).toBe(false);
    revive.play([{ kind: 'died' }]);
    expect(revive.isOpen).toBe(true);
  });
});

describe('CharacterWindow (CWndCharInfo, WndField.cpp:3012-4110; CWndStateConfirm, :4395-4560)', () => {
  /** What the lobby handed the world: the character's name and the server and channel picked. */
  const ENTRY = { character: { name: 'Webby' }, serverName: 'FlyFF', channelName: 'Channel 1' };
  /** A time in the red half of the blink (`(g_nRenderCnt / 8) & 1`, 8 frames of 60 a second), and one in the black. */
  const RED_PHASE = 140;
  const BLACK_PHASE = 0;
  const windows: CharacterWindow[] = [];
  afterEach(() => {
    for (const w of windows.splice(0)) w.dispose();
  });
  /**
   * The Character window open in a layer of Neuz's 800 x 600, which holds its whole 512 px (a shorter one cuts it: `fit`);
   * `applied` the MODIFY_STATUS counts it sent.
   */
  const windowOn = () => {
    const applied: StatCounts[] = [];
    const character = new CharacterWindow(art, WINDOW_TEXTS, (counts) => void applied.push(counts));
    windows.push(character);
    layer(800, 600).append(character.frame.element, character.confirm.frame.element);
    character.toggle();
    return { character, applied };
  };
  const value = (w: CharacterWindow, name: string) => w.frame.element.querySelector<HTMLElement>(`[data-value="${name}"]`)!;
  const shown = (w: CharacterWindow, name: string) => value(w, name).textContent;
  const button = (w: CharacterWindow, name: string) => w.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;
  const count = (w: CharacterWindow, stat: string) => w.frame.element.querySelector<HTMLInputElement>(`input[data-count="${stat}"]`)!;
  const confirmButton = (w: CharacterWindow, name: string) =>
    w.confirm.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;

  it('Server, Channel and Name come from the lobby entry; the level and the numbers from the own state', () => {
    const { character } = windowOn();
    character.update(newVagrant(), ENTRY);
    const element = character.frame.element;
    expect(element.querySelector('.hud-window-title')!.textContent).toBe('Character');
    expect([element.style.width, element.style.height, element.style.left, element.style.top])
      .toEqual(['208px', '512px', '0px', '0px']);
    expect([shown(character, 'name'), shown(character, 'level'), shown(character, 'server'), shown(character, 'channel')])
      .toEqual(['Webby', '1', 'FlyFF', 'Channel 1']);
    // GetJobString(): prj.m_aJob[ m_nJob ].szName (MoverParam.cpp:354-359), etc.inc's name of the job (the jobs catalog's)
    expect(shown(character, 'job')).toBe('Vagrant');
    const labels = [...element.querySelectorAll('[data-label]')].map((e) => e.textContent);
    expect(labels).toEqual([
      'Base', 'Name', 'Job', 'Level', 'Server', 'Channel', 'Detail', 'ATK', 'Critical', 'DEF', 'A.Speed', 'STR', 'STA', 'DEX',
      'INT', 'Stat Points',
    ]);
    // the starter Vagrant (Wooden Sword, the cotton suit, gauntlet and boots): ATK (20 + 22) / 2, DEF 0 + 19 / 4,
    // DEX / 10, A 77 shown as 42 % (plan-header reference numbers)
    expect([shown(character, 'atk'), shown(character, 'def'), shown(character, 'critical'), shown(character, 'speed')])
      .toEqual(['21', '4', '1%', '42%']);
    expect(['str', 'sta', 'dex', 'int', 'points'].map((name) => shown(character, name))).toEqual(['15', '15', '15', '15', '0']);
    // the labels in ARGB(255, 0, 0, 180), the values in black (:3170, :3374; :3018)
    expect(element.querySelector<HTMLElement>('[data-label="name"]')!.style.color).toBe('rgb(0, 0, 180)');
    expect(value(character, 'name').style.color).toBe('rgb(0, 0, 0)');
    // CWndCharInfo::OnDraw's places (:3036-3296), from the tab control's top left
    const at = (name: string) => [value(character, name).style.left, value(character, name).style.top];
    expect([at('name'), at('channel'), at('atk'), at('speed'), at('str'), at('int'), at('points')]).toEqual([
      ['80px', '31px'], ['80px', '91px'], ['50px', '131px'], ['140px', '146px'], ['50px', '173px'], ['50px', '218px'],
      ['105px', '233px'],
    ]);
    // the tabs: Character chosen (black), Fame/Master (white)
    expect([...element.querySelectorAll('[data-tab]')].map((e) => [e.textContent, (e as HTMLElement).style.color])).toEqual([
      ['Character', 'rgb(0, 0, 0)'], ['Fame/Master', 'rgb(255, 255, 255)'],
    ]);
  });

  it('with 4 points: + on STR twice and STA twice makes Stat Points 0 and disables every +; the preview ATK and DEF blink red', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY, BLACK_PHASE);
    // nothing placed: every - and Apply and Reset off (OnInitialUpdate :3580-3593, Process :3784-3849), every + on
    for (const stat of ['str', 'sta', 'dex', 'int']) {
      expect(button(character, `${stat}-plus`).disabled).toBe(false);
      expect(button(character, `${stat}-minus`).disabled).toBe(true);
    }
    expect([button(character, 'apply').disabled, button(character, 'reset').disabled]).toEqual([true, true]);
    for (const name of ['str-plus', 'str-plus', 'sta-plus', 'sta-plus']) button(character, name).click();
    character.update(own, ENTRY, RED_PHASE);
    expect(character.counts).toEqual({ str: 2, sta: 2, dex: 0, int: 0 });
    expect(shown(character, 'points')).toBe('0');
    for (const stat of ['str', 'sta', 'dex', 'int']) expect(button(character, `${stat}-plus`).disabled).toBe(true);
    expect([button(character, 'str-minus').disabled, button(character, 'sta-minus').disabled]).toEqual([false, false]);
    expect([button(character, 'dex-minus').disabled, button(character, 'int-minus').disabled]).toEqual([true, true]);
    expect([button(character, 'apply').disabled, button(character, 'reset').disabled]).toEqual([false, false]);
    expect([count(character, 'str').value, count(character, 'sta').value, count(character, 'dex').value]).toEqual(['2', '2', '0']);
    // the stats shown stay the character's; ATK and DEF are previewed with STR 17 and STA 17 (GetVirtualATK, GetVirtualDEF)
    expect([shown(character, 'str'), shown(character, 'sta')]).toEqual(['15', '15']);
    expect([shown(character, 'atk'), shown(character, 'def')]).toEqual(['30', '6']);
    expect(value(character, 'atk').style.color).toBe('rgb(255, 0, 0)');
    expect(value(character, 'def').style.color).toBe('rgb(255, 0, 0)');
    expect(value(character, 'atk').dataset.preview).toBe('');
    // critical and speed are DEX's: no preview
    expect(value(character, 'critical').style.color).toBe('rgb(0, 0, 0)');
    expect(value(character, 'critical').dataset.preview).toBeUndefined();
    // the other half of the blink is black
    character.update(own, ENTRY, BLACK_PHASE);
    expect(value(character, 'atk').style.color).toBe('rgb(0, 0, 0)');
    // - gives one back
    button(character, 'sta-minus').click();
    character.update(own, ENTRY, RED_PHASE);
    expect(shown(character, 'points')).toBe('1');
    expect(button(character, 'int-plus').disabled).toBe(false);
    // Reset puts every count back to 0 (:3700-3706)
    button(character, 'reset').click();
    character.update(own, ENTRY, RED_PHASE);
    expect(character.counts).toEqual({ str: 0, sta: 0, dex: 0, int: 0 });
    expect([shown(character, 'atk'), shown(character, 'def'), shown(character, 'points')]).toEqual(['21', '4', '4']);
    expect(value(character, 'atk').dataset.preview).toBeUndefined();
  });

  it('Apply asks first (CWndStateConfirm): Yes sends MODIFY_STATUS(2, 2, 0, 0) and zeroes the counters; No keeps them', () => {
    const { character, applied } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY);
    for (const name of ['str-plus', 'str-plus', 'sta-plus', 'sta-plus']) button(character, name).click();
    button(character, 'apply').click();
    const confirm = character.confirm;
    expect(confirm.isOpen).toBe(true);
    const box = confirm.frame.element;
    expect(box.querySelector('.hud-window-title')!.textContent).toBe('Change State');
    // TID_GAME_CHARSTATUS_APPLY_Q, and for a base job the line TID_DIAG_0082 (:4409-4452)
    expect(box.querySelector('.hud-confirm-text')!.textContent)
      .toBe('Do you want to use the current Stat setup?\nYour stat values will reset after your 1st job change.');
    // APP_STATE_CONFIRM, 304 x 128 (resdata.inc:1202), at the middle of the 800 x 600 screen (MoveParentCenter)
    expect([box.style.width, box.style.height, box.style.left, box.style.top]).toEqual(['304px', '128px', '248px', '236px']);
    expect([confirmButton(character, 'yes').style.left, confirmButton(character, 'yes').style.top]).toEqual(['56px', '70px']);
    expect([confirmButton(character, 'no').style.left, confirmButton(character, 'no').style.width]).toEqual(['146px', '72px']);
    expect(confirmButton(character, 'yes').getAttribute('aria-label')).toBe('Yes');
    // No: the box goes, the counts stay (:4503-4510)
    confirmButton(character, 'no').click();
    expect(confirm.isOpen).toBe(false);
    expect(character.counts).toEqual({ str: 2, sta: 2, dex: 0, int: 0 });
    expect(applied).toEqual([]);
    // Yes: SendModifyStatus with the counts, which go to 0 at once, and the box goes (:4487-4502)
    button(character, 'apply').click();
    confirmButton(character, 'yes').click();
    expect(applied).toEqual([{ str: 2, sta: 2, dex: 0, int: 0 }]);
    expect(character.counts).toEqual({ str: 0, sta: 0, dex: 0, int: 0 });
    expect(confirm.isOpen).toBe(false);
    // until SETSTATE comes the points are still the server's 4
    character.update(own, ENTRY);
    expect(shown(character, 'points')).toBe('4');
    // Apply with nothing placed asks nothing (:3692-3699)
    button(character, 'apply').click();
    expect(confirm.isOpen).toBe(false);
  });

  it('SETSTATE updates the shown stats', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY);
    own.apply({ type: 'setState', str: 17, sta: 17, dex: 15, int: 15, remainGP: 0 }, OWN_ID);
    character.update(own, ENTRY, RED_PHASE);
    expect(['str', 'sta', 'dex', 'int', 'points'].map((name) => shown(character, name))).toEqual(['17', '17', '15', '15', '0']);
    expect([shown(character, 'atk'), shown(character, 'def')]).toEqual(['30', '6']);
    expect(value(character, 'atk').style.color).toBe('rgb(0, 0, 0)');
    expect(button(character, 'str-plus').disabled).toBe(true);
  });

  it('SETSTATE leaves the counts being placed as they are (OnSetState touches only the stats, DPClient.cpp:13514-13524)', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 6;
    character.update(own, ENTRY);
    for (const name of ['str-plus', 'str-plus', 'dex-plus']) button(character, name).click();
    // another SETSTATE (the server's answer to an earlier Apply, say): 2 points went into STA
    own.apply({ type: 'setState', str: 15, sta: 17, dex: 15, int: 15, remainGP: 4 }, OWN_ID);
    character.update(own, ENTRY, RED_PHASE);
    expect(character.counts).toEqual({ str: 2, sta: 0, dex: 1, int: 0 });
    expect([count(character, 'str').value, count(character, 'dex').value]).toEqual(['2', '1']);
    expect([shown(character, 'sta'), shown(character, 'points')]).toEqual(['17', '1']);
    // the preview still adds them: STR 17 at level 1 with the Wooden Sword
    expect([shown(character, 'atk'), value(character, 'atk').dataset.preview]).toEqual(['30', '']);
  });

  it('DEX previews the critical and the attack speed; a stat raised by an item is blue (:3246-3286)', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 30;
    // a ring of STR +3 (DST_STR): GetStr() 18 over m_nStr 15
    own.equipped = {
      weapon: WOODEN_SWORD, armour: [itemProp({ id: 9, kind2: 9, destParams: [Dst.STR, -1, -1], adjParams: [3, -1, -1] })],
    };
    character.update(own, ENTRY, RED_PHASE);
    expect(shown(character, 'str')).toBe('18');
    expect(value(character, 'str').style.color).toBe('rgb(0, 0, 255)');
    for (let i = 0; i < 25; i++) button(character, 'dex-plus').click();
    character.update(own, ENTRY, RED_PHASE);
    // DEX 40: critical 40 / 10 = 4 %; A = trunc(75 + 0.085 x (160 + 1 / 8) - 3) = 85: 46 %
    expect([shown(character, 'critical'), shown(character, 'speed')]).toEqual(['4%', '46%']);
    expect(value(character, 'critical').style.color).toBe('rgb(255, 0, 0)');
    expect(value(character, 'speed').style.color).toBe('rgb(255, 0, 0)');
    // the stat points blink red while some are left, in INT's colour otherwise (:3288-3296)
    expect(shown(character, 'points')).toBe('5');
    expect(value(character, 'points').style.color).toBe('rgb(255, 0, 0)');
    character.update(own, ENTRY, BLACK_PHASE);
    expect(value(character, 'points').style.color).toBe('rgb(0, 0, 0)');
  });

  it('a count typed in its box is kept to the points left, digits only (OnChildNotify, :3623-3662)', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY);
    button(character, 'dex-plus').click();
    const type = (stat: string, text: string) => {
      const input = count(character, stat);
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('str', '9');
    expect(character.counts).toEqual({ str: 3, sta: 0, dex: 1, int: 0 });
    expect(count(character, 'str').value).toBe('3');
    type('str', '2x');
    expect(character.counts.str).toBe(3);
    expect(count(character, 'str').value).toBe('3');
    type('str', '');
    expect(character.counts.str).toBe(0);
    // with every point placed the boxes take no typing (Process, :3818-3832)
    type('int', '3');
    character.update(own, ENTRY);
    expect(count(character, 'int').disabled).toBe(true);
  });

  it('closing it (H, its button, Escape) forgets the counts and the confirm box, as Destroy does; H opens it again at the top left', () => {
    const { character } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY);
    button(character, 'str-plus').click();
    button(character, 'apply').click();
    expect(character.confirm.isOpen).toBe(true);
    character.toggle();
    expect(character.frame.isOpen).toBe(false);
    expect(character.confirm.isOpen).toBe(false);
    character.toggle();
    expect(character.frame.isOpen).toBe(true);
    expect(character.frame.position).toEqual({ x: 0, y: 0 });
    expect(character.counts).toEqual({ str: 0, sta: 0, dex: 0, int: 0 });
    press('Escape', { key: 'Escape' });
    expect(character.frame.isOpen).toBe(false);
  });

  it('the confirm box takes every key while open (CNeuzApp::KillWindow): Escape and Enter close it, the counts kept', () => {
    const { character, applied } = windowOn();
    const own = newVagrant();
    own.remainGP = 4;
    character.update(own, ENTRY);
    button(character, 'str-plus').click();
    const heard: string[] = [];
    const listen = (event: KeyboardEvent) => void heard.push(event.code);
    window.addEventListener('keydown', listen);
    button(character, 'apply').click();
    press('KeyH');
    expect(heard).toEqual([]);
    // Escape closes the box only, not the Character window under it
    press('Escape', { key: 'Escape' });
    expect(character.confirm.isOpen).toBe(false);
    expect(character.frame.isOpen).toBe(true);
    // Enter: SendYes, which sends the old INC_STAT_LEVEL with id 0 that the world server drops (OnIncStatLevel's default)
    button(character, 'apply').click();
    press('Enter', { key: 'Enter' });
    expect(character.confirm.isOpen).toBe(false);
    expect(applied).toEqual([]);
    expect(character.counts.str).toBe(1);
    press('KeyH');
    expect(heard).toEqual(['KeyH']);
    window.removeEventListener('keydown', listen);
  });
});

// The skill tree window (CWndSkillTreeEx, _Interface/WndField.cpp:6649-8393), its box (CWndReSkillWarning, :13667-13749),
// and the task bar's edits (CWndTaskBar::OnDropIcon, SetShortcut, SetSkillQueue, RemoveSkillQueue, _Interface/WndTaskBar.cpp
// :1446-2093), Milestone 2.

/** The texts the skill window, its box and the bar's edits read (data/texts.json's, with their numbers and colours). */
const SKILL_TEXTS: Texts = new Map([
  ...WINDOW_TEXTS,
  text('TID_GAME_SKILLLEVEL_CHANGE', 3074, 'Confirm changes to skill points?'),
  text('TID_GAME_SKILLDIS', 2368, '%s Skill level %d is needed.'),
  text('TID_GAME_BASESKILLLEVEL', 2371, 'Character Level: %d'),
  text('TID_GAME_SKILLLNOTUSE', 2382, '%s skill cannot be registered in the action slot.', 0xff99cc00),
  text('TID_RESKILLPOINT_ERROR', 2362, 'There was a problem during skill redistribution. Please try again.', 0xffccffcc),
  text('TID_MMI_GHOUSE_RECALL', 7145, 'Remove'),
]);
const SKILL_DATA = { skills: SKILLS, texts: SKILL_TEXTS, jobs: [VAGRANT] };
const EDIT_DATA = { ...BAR_DATA, skills: SKILLS, texts: SKILL_TEXTS };

/** A Vagrant of character level `level` with `points` skill points and Clean Hit, Flurry and Over Cut at `levels`. */
function vagrantWithSkills(level: number, points: number, levels: readonly number[] = [0, 0, 0]): OwnState {
  const own = newVagrant(level, undefined, ownGameData({ skills: new Map(SKILLS) }));
  own.skillPoint = points;
  levels.forEach((value, i) => {
    own.skills[i]!.level = value;
  });
  own.taskBar = NEW_BAR;
  return own;
}

/** A press of a finger at (`x`, `y`): a pointer event whose `pointerType` is touch. */
const touch = (type: string, x = 10, y = 10): MouseEvent => {
  const event = pointer(type, x, y);
  Object.defineProperty(event, 'pointerType', { value: 'touch' });
  return event;
};

/** The bar shown and the windows in one 800 x 600 layer (Neuz's screen), with the bar's recorder. */
function editingOn(own: OwnState) {
  const record = recorder();
  const bar = new TaskBar(art, record.actions);
  bars.push(bar);
  const parent = layer(800, 600);
  parent.append(bar.element);
  bar.update(own, EDIT_DATA);
  return { ...record, bar, parent };
}

const skillWindows: SkillWindow[] = [];
afterEach(() => {
  for (const w of skillWindows.splice(0)) w.dispose();
});

/** The skill tree in `parent`, opened with `own`'s skills; `spent` the slots its Finish handed over. */
function skillWindowOn(own: OwnState, hand: SkillHand, parent = layer(800, 600)) {
  const spent: SkillSlot[][] = [];
  const tree = new SkillWindow(art, SKILL_DATA, (skills) => void spent.push(skills), hand);
  skillWindows.push(tree);
  parent.append(tree.frame.element, tree.warning.element);
  tree.toggle(own);
  return { tree, spent };
}

/** A hand that only records (the task bar's part), for the window's own tests. */
function recordingHand() {
  const carried: string[] = [];
  let picked: number | null = null;
  const hand: SkillHand = {
    carrySkill: (i) => void carried.push(`drag ${i}`),
    pickSkill: (i) => {
      carried.push(`pick ${i}`);
      picked = picked === i ? null : i;
    },
    get pickedSkill() {
      return picked;
    },
    dropPick: () => {
      picked = null;
    },
    queueSkill: (i) => void carried.push(`queue ${i}`),
  };
  return { hand, carried };
}

const skillOf = (w: SkillWindow, id: number) => w.frame.element.querySelector<HTMLElement>(`.hud-skill[data-skill="${id}"]`)!;
const skillButton = (w: SkillWindow, name: string) => w.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;
const warningButton = (w: SkillWindow, name: string) =>
  w.warning.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;
const pointsLeft = (w: SkillWindow) => w.frame.element.querySelector('.hud-skills-points')!.textContent;
/** Chooses the skill `id` (OnLButtonDown), as the mouse's button goes down on it. */
const choose = (w: SkillWindow, id: number) => skillOf(w, id).dispatchEvent(pointer('pointerdown', 70, 110));
const levelsOf = (slots: readonly SkillSlot[]) => slots.slice(0, 3).map((slot) => slot.level);

describe('SkillWindow (CWndSkillTreeEx, WndField.cpp:6649-8393)', () => {
  it('with 4 points at level 5: + Clean Hit to 3, + Flurry to 1, then Finish and Yes send one DOUSESKILLPOINT with levels 3 and 1 and the player\'s IDs', () => {
    const own = vagrantWithSkills(5, 4);
    // the window's Finish goes through the skill use, as the world screen wires it
    const sent: SkillSlot[][] = [];
    const session = {
      sendUseSkill: () => {}, sendEndSkillQueue: () => {}, sendDestObj: () => {}, sendBehavior: () => {}, sendSetTarget: () => {},
      sendDoUseSkillPoint: (skills: readonly SkillSlot[]) => void sent.push(skills.map((slot) => ({ ...slot }))),
    };
    const skillUse = new SkillUse(session, new Focus(session), () => own, () => 0, { skills: new Map(SKILLS), texts: SKILL_TEXTS, movers: new Map() });
    const tree = new SkillWindow(art, SKILL_DATA, (skills) => void skillUse.spendSkillPoints(skills), recordingHand().hand);
    skillWindows.push(tree);
    layer(800, 600).append(tree.frame.element, tree.warning.element);
    tree.toggle(own);

    expect(pointsLeft(tree)).toBe('4');
    // nothing chosen (InitItem, g_nSkillCurSelect = -1): every button off (Process, :7529-7532)
    expect(['plus', 'minus', 'reset', 'finish'].map((name) => skillButton(tree, name).disabled)).toEqual([true, true, true, true]);
    choose(tree, 1);
    expect(tree.chosen).toBe(0);
    for (let i = 0; i < 3; i++) skillButton(tree, 'plus').click();
    expect(pointsLeft(tree)).toBe('1');
    // Flurry opens as Clean Hit reaches 3 in the window's copy (CheckSkill against m_apSkill, :6649-6703)
    choose(tree, 2);
    expect(tree.chosen).toBe(1);
    skillButton(tree, 'plus').click();
    expect(pointsLeft(tree)).toBe('0');
    expect(skillButton(tree, 'plus').disabled).toBe(true);
    expect(levelsOf(tree.skillPlan!.result())).toEqual([3, 1, 0]);
    // the player's own levels are not touched until the server says so
    expect(levelsOf(own.skills)).toEqual([0, 0, 0]);

    // Finish asks first (CWndReSkillWarning, TID_GAME_SKILLLEVEL_CHANGE); nothing is sent before Yes
    skillButton(tree, 'finish').click();
    expect(tree.warning.isOpen).toBe(true);
    expect(tree.warning.frame.element.querySelector('.hud-confirm-text')!.textContent).toBe('Confirm changes to skill points?');
    expect(tree.warning.frame.element.querySelector('.hud-window-title')!.textContent).toBe('Warning');
    expect(tree.warning.modal.isShown).toBe(true);
    expect(sent).toEqual([]);
    warningButton(tree, 'yes').click();
    expect(sent).toHaveLength(1);
    const expected = own.skills.map((slot, i) => ({ skill: slot.skill, level: [3, 1, 0][i] ?? 0 }));
    expect(sent[0]).toEqual(expected);
    expect(sent[0]!.slice(3).every((slot) => slot.skill === NULL_ID && slot.level === 0)).toBe(true);
    // Finish's box leaves the window open (InitItem( FALSE ): m_bParentDestroy stays FALSE)
    expect(tree.warning.isOpen).toBe(false);
    expect(tree.isOpen).toBe(true);
    // a second Finish and Yes while the first waits for its answer sends nothing more (SkillUse.spendPending)
    skillButton(tree, 'finish').click();
    warningButton(tree, 'yes').click();
    expect(sent).toHaveLength(1);

    // the answer: DOUSESKILLPOINT sets the levels and the points, and the window loads them anew (InitItem, :14740-14747)
    const answer = { type: 'doUseSkillPoint' as const, skills: sent[0]!, skillPoint: 0 };
    own.apply(answer, OWN_ID);
    skillUse.onMessage(OWN_ID, answer);
    tree.onMessage(OWN_ID, answer, own);
    expect(skillUse.spendPending).toBe(false);
    expect(levelsOf(tree.skillPlan!.result())).toEqual([3, 1, 0]);
    expect(tree.skillPlan!.changed).toBe(false);
    expect(tree.chosen).toBe(null);
  });

  it('closing it with points placed asks first (the close button, 10000, and the toggle): No closes both and sends nothing, Yes sends', () => {
    const own = vagrantWithSkills(5, 4);
    const { tree, spent } = skillWindowOn(own, recordingHand().hand);
    // nothing placed: the close button closes it at once
    tree.frame.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect(tree.isOpen).toBe(false);
    tree.toggle(own);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    // the close button: the box asks, the window stays
    tree.frame.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect(tree.warning.isOpen).toBe(true);
    expect(tree.isOpen).toBe(true);
    // the toggle (K, the applet) while the box is open does nothing (ObjectExecutor, WndManager.cpp:2588-2590)
    tree.toggle(own);
    expect(tree.isOpen).toBe(true);
    // No: the box goes and takes the window with it (OnDestroy, m_bParentDestroy), the points unsent
    warningButton(tree, 'no').click();
    expect(tree.warning.isOpen).toBe(false);
    expect(tree.isOpen).toBe(false);
    expect(spent).toEqual([]);
    // opened again, the window starts from the player's skills (InitItem)
    tree.toggle(own);
    expect(tree.skillPlan!.changed).toBe(false);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    skillButton(tree, 'plus').click();
    // the toggle asks too; Yes sends and closes both
    tree.toggle(own);
    expect(tree.warning.isOpen).toBe(true);
    warningButton(tree, 'yes').click();
    expect(spent.map(levelsOf)).toEqual([[2, 0, 0]]);
    expect(tree.isOpen).toBe(false);
    // the box's own close button is its No
    tree.toggle(own);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    tree.toggle(own);
    tree.warning.frame.element.querySelector<HTMLButtonElement>('.hud-window-close')!.click();
    expect([tree.warning.isOpen, tree.isOpen]).toEqual([false, false]);
    expect(spent).toHaveLength(1);
  });

  it('Escape closes it without asking, the points dropped, as CWndMgr::Process destroys it (WndManager.cpp:3383-3420)', () => {
    const own = vagrantWithSkills(5, 4);
    const { tree, spent } = skillWindowOn(own, recordingHand().hand);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    press('Escape', { key: 'Escape' });
    expect(tree.isOpen).toBe(false);
    expect(tree.warning.isOpen).toBe(false);
    expect(spent).toEqual([]);
  });

  it('the tooltip of Clean Hit shows "FP : 5"; Flurry\'s names its prerequisite and the level, red while unmet (PutToolTip_Skill)', () => {
    const own = vagrantWithSkills(4, 4);
    const { tree } = skillWindowOn(own, recordingHand().hand);
    const tooltip = tree.frame.element.querySelector<HTMLElement>('.hud-skill-tooltip')!;
    expect(tooltip.hidden).toBe(true);
    skillOf(tree, 1).dispatchEvent(pointer('pointerenter', 70, 110));
    expect(tooltip.hidden).toBe(false);
    const lines = () => [...tooltip.children].map((line) => [line.textContent, (line as HTMLElement).style.color]);
    // open at level 0: "   Lv 0", the name bold in ff2fbe6d; the add-skill row of level 1 (GetAddSkillProp reads 0 as 1)
    expect(lines()).toEqual([
      ['Clean Hit   Lv 0', 'rgb(47, 190, 109)'],
      ['FP : 5', 'rgb(255, 255, 255)'],
      ['Character Level: 3', 'rgb(255, 255, 255)'],
      ['A powerful, downward strike.', 'rgb(255, 255, 255)'],
    ]);
    expect((tooltip.children[0] as HTMLElement).style.fontWeight).toBe('bold');
    // at level 4 the open skill's icon shows on the mouse over it only (m_dwMouseSkill, :7834-7843)
    expect(skillOf(tree, 1).querySelector<HTMLElement>('.hud-skill-icon')!.style.backgroundImage).toContain('skill_vagonecleanh');
    skillOf(tree, 1).dispatchEvent(pointer('pointerleave', 0, 0));
    expect(tooltip.hidden).toBe(true);
    expect(skillOf(tree, 1).querySelector<HTMLElement>('.hud-skill-icon')!.style.backgroundImage).toBe('');
    // Flurry at character level 4: not open (no "Lv"), Clean Hit 0 of 3 and the level 5 in red
    skillOf(tree, 2).dispatchEvent(pointer('pointerenter', 120, 110));
    expect(lines()).toEqual([
      ['Flurry', 'rgb(47, 190, 109)'],
      ['FP : 10', 'rgb(255, 255, 255)'],
      ['Clean Hit Skill level 3 is needed.', 'rgb(255, 0, 0)'],
      ['Character Level: 5', 'rgb(255, 0, 0)'],
      ['Rapid, stabbing attack.', 'rgb(255, 255, 255)'],
    ]);
    // the tooltip reads the player's own levels for the prerequisite, not the window's copy
    expect(skillTooltip(FLURRY, 0, false, vagrantWithSkills(5, 0, [3, 0, 0]), SKILLS, SKILL_TEXTS)[2])
      .toEqual({ text: 'Clean Hit Skill level 3 is needed.', color: 0xffffffff });
  });

  it('shows Clean Hit, Flurry and Over Cut only, by their places (GetSkillPoint): the event buffs of slots 3-6 get none, and no button raises them', () => {
    const QUICK_STEP: WebSkill = { ...CLEAN_HIT, id: 317, name: 'Quick Step (Event)', reqLevel: -1, comboStyle: 4, maxLevel: 5 };
    const own = vagrantWithSkills(15, 10);
    // the array of a Vagrant with the four SI_GEN_EVE_* in slots 3-6 (skills notes §2.1)
    for (let i = 3; i < 7; i++) own.skills[i] = { skill: 317 + i - 3, level: 0 };
    const data = { ...SKILL_DATA, skills: new Map([...SKILLS, [317, QUICK_STEP]]) };
    const tree = new SkillWindow(art, data, () => {}, recordingHand().hand);
    skillWindows.push(tree);
    layer(800, 600).append(tree.frame.element, tree.warning.element);
    tree.toggle(own);
    const shown = [...tree.frame.element.querySelectorAll<HTMLElement>('.hud-skill')];
    expect(shown.map((element) => [element.dataset.skill, element.style.left, element.style.top])).toEqual([
      ['1', '62px', '103px'], ['2', '112px', '103px'], ['3', '164px', '103px'],
    ]);
    expect(shown.map((element) => element.getAttribute('aria-label'))).toEqual(['Clean Hit', 'Flurry', 'Over Cut']);
    // nothing chooses slot 3 (Quick Step), so + raises the three only
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    expect(tree.skillPlan!.result().slice(3, 7).map((slot) => slot.level)).toEqual([0, 0, 0, 0]);
  });

  it('draws the window as resdata.inc lays it out: 256 x 524 at the bottom right, the arrows picture, the level digits', () => {
    const own = vagrantWithSkills(5, 4, [1, 0, 0]);
    own.skills[0]!.level = 1;
    const parent = layer(800, 600);
    setLayoutBottom(parent, 48);
    const { tree } = skillWindowOn(own, recordingHand().hand, parent);
    const element = tree.frame.element;
    // APP_SKILL3 256 x 624, less the hero section (:8017-8022); at the layout's bottom right (:8034-8040)
    expect([element.style.width, element.style.height, element.style.left, element.style.top]).toEqual(['256px', '524px', '544px', '28px']);
    expect(element.querySelector('.hud-window-title')!.textContent).toBe('Skill Tree');
    expect(element.querySelector<HTMLElement>('.hud-skills-picture')!.style.backgroundImage).toBe('url("/assets/ui/imgskillvagrant.png")');
    // the sections' titles: the Vagrant's job name, then none (InitItem, :6769-6776), each with its arrow
    expect([...element.querySelectorAll('.hud-skills-group-title')].map((title) => title.textContent))
      .toEqual(['Vagrant', '', '', 'Skill Point']);
    expect(element.querySelectorAll('.hud-skills-arrow')).toHaveLength(3);
    // Clean Hit at level 1: its icon and the digit frame 0, 2 px up and left
    const digit = (id: number) => skillOf(tree, id).querySelector<HTMLElement>('.hud-skill-digit')!;
    expect(skillOf(tree, 1).querySelector<HTMLElement>('.hud-skill-icon')!.style.backgroundImage)
      .toBe('url("/assets/ui/skill_vagonecleanh.png")');
    expect([digit(1).hidden, digit(1).dataset.frame, digit(1).style.backgroundPosition]).toEqual([false, '0', '-1px -1px']);
    // raised to 2 in the window: frame 1 of the second row, 20 + 1, until it is sent (:7824-7832)
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    expect([digit(1).dataset.frame, digit(1).style.backgroundPosition]).toEqual(['21', '-29px -29px']);
    // the chosen skill in WIDC_CUSTOM1 with its digit; Flurry at level 0 shows no digit, and not open no icon
    expect(element.querySelector<HTMLElement>('.hud-skills-chosen')!.style.backgroundImage).toContain('skill_vagonecleanh');
    expect(digit(2).hidden).toBe(true);
    expect(skillOf(tree, 3).querySelector<HTMLElement>('.hud-skill-icon')!.style.backgroundImage).toBe('');
    // the maximum level is frame 19 (:7828-7831)
    const top = vagrantWithSkills(15, 0, [10, 0, 0]);
    tree.frame.close();
    tree.toggle(top);
    expect(digit(1).dataset.frame).toBe('19');
  });

  it('- gives a level back, down to the player\'s own, and resets what needed it (SubSkillPointDown); Reset loads the skills anew', () => {
    const own = vagrantWithSkills(10, 6, [3, 0, 0]);
    const { tree } = skillWindowOn(own, recordingHand().hand);
    choose(tree, 1);
    expect(skillButton(tree, 'minus').disabled).toBe(true);
    skillButton(tree, 'plus').click();
    choose(tree, 2);
    skillButton(tree, 'plus').click();
    skillButton(tree, 'plus').click();
    expect(levelsOf(tree.skillPlan!.result())).toEqual([4, 2, 0]);
    expect(pointsLeft(tree)).toBe('3');
    choose(tree, 1);
    expect(skillButton(tree, 'minus').disabled).toBe(false);
    skillButton(tree, 'minus').click();
    // Clean Hit back to 3: Flurry keeps its 2
    expect(levelsOf(tree.skillPlan!.result())).toEqual([3, 2, 0]);
    // not below the player's own 3
    expect(skillButton(tree, 'minus').disabled).toBe(true);
    // Reset: the player's skills again, nothing chosen, every button off
    skillButton(tree, 'reset').click();
    expect(levelsOf(tree.skillPlan!.result())).toEqual([3, 0, 0]);
    expect(pointsLeft(tree)).toBe('6');
    expect(tree.chosen).toBe(null);
    expect(['plus', 'minus', 'reset', 'finish'].map((name) => skillButton(tree, name).disabled)).toEqual([true, true, true, true]);
  });

  it('with no skill points the buttons stay off and the window shows 0 (InitItem works on the player\'s own skills)', () => {
    const own = vagrantWithSkills(5, 0, [3, 1, 0]);
    const { tree } = skillWindowOn(own, recordingHand().hand);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    expect(levelsOf(tree.skillPlan!.result())).toEqual([3, 1, 0]);
    expect(pointsLeft(tree)).toBe('0');
    expect(['plus', 'minus', 'reset', 'finish'].map((name) => skillButton(tree, name).disabled)).toEqual([true, true, true, true]);
  });

  it('loads the skills anew, dropping the points placed, on DOUSESKILLPOINT, INITSKILLPOINT and a SETEXPERIENCE that changed the points', () => {
    const own = vagrantWithSkills(5, 4);
    const { tree } = skillWindowOn(own, recordingHand().hand);
    const place = () => {
      choose(tree, 1);
      skillButton(tree, 'plus').click();
      expect(tree.skillPlan!.changed).toBe(true);
    };
    const setExperience = (skillPoint: number) => ({
      type: 'setExperience' as const, exp: 1n, level: 5, skillLevel: 8, skillPoint, deathExp: -1n, deathLevel: 0xffff,
    });
    place();
    // SETEXPERIENCE with the same points (EXP from a kill) keeps them (nSP != nSkillPoint, DPClient.cpp:3426)
    own.apply(setExperience(4), OWN_ID);
    tree.onMessage(OWN_ID, setExperience(4), own);
    expect(tree.skillPlan!.changed).toBe(true);
    // another player's SETEXPERIENCE is not the own one
    own.skillPoint = 6;
    tree.onMessage(OWN_ID + 1, setExperience(6), own);
    expect(tree.skillPlan!.changed).toBe(true);
    // more points: InitItem
    own.apply(setExperience(6), OWN_ID);
    tree.onMessage(OWN_ID, setExperience(6), own);
    expect(tree.skillPlan!.changed).toBe(false);
    expect([pointsLeft(tree), tree.chosen]).toEqual(['6', null]);
    place();
    own.apply({ type: 'initSkillPoint', skillPoint: 6 }, OWN_ID);
    tree.onMessage(OWN_ID, { type: 'initSkillPoint', skillPoint: 6 }, own);
    expect(tree.skillPlan!.changed).toBe(false);
    place();
    const answer = { type: 'doUseSkillPoint' as const, skills: own.skills, skillPoint: 6 };
    tree.onMessage(OWN_ID, answer, own);
    expect(tree.skillPlan!.changed).toBe(false);
    // closed, it hears nothing
    tree.frame.close();
    tree.onMessage(OWN_ID, answer, own);
    expect(tree.skillPlan).toBe(null);
  });

  it('the tooltip ends inside the window: one past its right edge moves left (the window\'s 244 px client area)', () => {
    const own = vagrantWithSkills(10, 4, [3, 3, 0]);
    const { tree } = skillWindowOn(own, recordingHand().hand);
    const tooltip = tree.frame.element.querySelector<HTMLElement>('.hud-skill-tooltip')!;
    let width = 200;
    Object.defineProperty(tooltip, 'offsetWidth', { configurable: true, get: () => width });
    // Over Cut at 164: 164 + 200 is past 244, so it starts at 44
    skillOf(tree, 3).dispatchEvent(pointer('pointerenter', 170, 110));
    expect(tooltip.style.left).toBe('44px');
    skillOf(tree, 3).dispatchEvent(pointer('pointerleave', 0, 0));
    // Clean Hit at 62 with a tooltip of 100: where it is
    width = 100;
    skillOf(tree, 1).dispatchEvent(pointer('pointerenter', 70, 110));
    expect(tooltip.style.left).toBe('62px');
  });

  it("the box's picture is WIDC_WARNING's WndQueItmwarning.tga at (8, 18), 64 x 64 (resdata.inc:23266)", () => {
    const { tree } = skillWindowOn(vagrantWithSkills(5, 4), recordingHand().hand);
    const picture = tree.warning.frame.element.querySelector<HTMLElement>('.hud-skills-picture')!;
    expect([picture.style.left, picture.style.top, picture.style.width, picture.style.height, picture.style.backgroundImage])
      .toEqual(['8px', '18px', '64px', '64px', 'url("/assets/ui/wndqueitmwarning.png")']);
  });

  it('a skill pressed with the mouse is dragged from (OnMouseMove), tapped by a finger is picked; a double click queues it when CheckSkill lets it', () => {
    const own = vagrantWithSkills(5, 2, [3, 0, 0]);
    const { hand, carried } = recordingHand();
    const { tree } = skillWindowOn(own, hand);
    choose(tree, 1);
    expect(carried).toEqual(['drag 0']);
    // a finger: picked on the tap, and marked
    skillOf(tree, 1).dispatchEvent(touch('pointerdown'));
    skillOf(tree, 1).click();
    expect(carried).toEqual(['drag 0', 'pick 0']);
    expect(skillOf(tree, 1).hasAttribute('data-picked')).toBe(true);
    // a skill not open (Over Cut at character level 5) is neither chosen nor carried
    skillOf(tree, 3).dispatchEvent(pointer('pointerdown', 170, 110));
    skillOf(tree, 3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(carried).toEqual(['drag 0', 'pick 0']);
    // Flurry is open, in the window's copy and for the player (its own Clean Hit 3, character level 5): queued
    skillOf(tree, 2).dispatchEvent(pointer('pointerdown', 120, 110));
    skillOf(tree, 2).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(carried).toEqual(['drag 0', 'pick 0', 'drag 1', 'queue 1']);
    // closing it lets the picked skill go
    tree.frame.close();
    expect(hand.pickedSkill).toBe(null);
  });
});

describe('TaskBar: editing the bars (CWndTaskBar::OnDropIcon, WndTaskBar.cpp:1874-2093)', () => {
  /** Drags `from` to `to` with the mouse: the button down, a move of 20 px, and let go on `to`. */
  const drag = (from: Element, to: Element) => {
    from.dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointermove', 30, 30));
    to.dispatchEvent(pointer('pointerup', 30, 30));
  };

  it('dropping Clean Hit on slot 3 sends ADDITEMTASKBAR(0, 3) with the skill shortcut, and the slot shows it', () => {
    const own = vagrantWithSkills(5, 0, [3, 1, 0]);
    const { bar, sent, calls } = editingOn(own);
    const { tree } = skillWindowOn(own, bar);
    drag(skillOf(tree, 1), slot(bar, 'item', 3));
    // SetShortcut( 3, SHORTCUT_SKILL, 0, 0, ..., 1 ): m_dwId the slot of m_aJobSkill, m_dwIndex the bar slot, m_dwData 1
    expect(sent).toEqual([{
      type: 'ADDITEMTASKBAR', bar: 0, slot: 3,
      shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: 3, userId: 0, data: 1, text: 'Clean Hit' },
    }]);
    expect(shown(slot(bar, 'item', 3))).toMatchObject({ kind: 'skill', icon: 'url("/assets/ui/skill_vagonecleanh.png")' });
    // the own bars hold it, which the skill use and F4 read
    expect(own.taskBar!.items.find((entry) => entry.bar === 0 && entry.slot === 3)?.shortcut.kind).toBe(ShortcutKind.SKILL);
    key('keydown', 'F4', { key: 'F4' });
    expect(calls).toEqual(['useSlot 0 3 skill 0']);
    // no ghost is left behind, nothing is lit
    expect(bar.element.querySelector('.hud-carried')).toBeNull();
    expect(bar.carrying).toBe(false);
  });

  it('dropping Flurry on a bar slot is refused (CT_CIRCLE: canPlaceOnBar), and so is a skill of level 0 (CheckSkill, :1920-1928)', () => {
    const own = vagrantWithSkills(5, 0, [3, 1, 0]);
    const { bar, sent } = editingOn(own);
    const { tree } = skillWindowOn(own, bar);
    drag(skillOf(tree, 2), slot(bar, 'item', 3));
    expect(sent).toEqual([]);
    expect(shown(slot(bar, 'item', 3)).kind).toBe('');
    // Clean Hit open in the window but of level 0 for the player
    const fresh = vagrantWithSkills(5, 3);
    const other = editingOn(fresh);
    const second = skillWindowOn(fresh, other.bar);
    drag(skillOf(second.tree, 1), slot(other.bar, 'item', 3));
    expect(other.sent).toEqual([]);
  });

  it("a drop asks CMover::CheckSkill of the player's own levels, not the window's copy (:1920-1928)", () => {
    // Flurry 1 with a Clean Hit of 2: the window, raising Clean Hit to 3, opens Flurry; the player's own Flurry is not open
    const own = vagrantWithSkills(5, 1, [2, 1, 0]);
    own.taskBar = { ...NEW_BAR, queue: [{ ...EMPTY_SKILL, id: 0, index: 0, data: 2 }] };
    const { bar, sent } = editingOn(own);
    const { tree } = skillWindowOn(own, bar);
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    expect(tree.skillPlan!.active(1)).toBe(true);
    drag(skillOf(tree, 2), slot(bar, 'queue', 1));
    expect(sent).toEqual([]);
    // with the player's own Clean Hit at 3 it goes
    own.skills[0]!.level = 3;
    drag(skillOf(tree, 2), slot(bar, 'queue', 1));
    expect(sent).toHaveLength(1);
  });

  it('building the action slot Clean Hit, Flurry, Over Cut sends SKILLTASKBAR with all 5 entries each time; Flurry cannot go first', () => {
    const own = vagrantWithSkills(10, 0, [3, 3, 1]);
    const { bar, sent } = editingOn(own);
    const { tree } = skillWindowOn(own, bar);
    // CheckAddSkill: the first slot takes a CT_STEP or CT_GENERAL skill only
    drag(skillOf(tree, 2), slot(bar, 'queue', 0));
    expect(sent).toEqual([]);
    drag(skillOf(tree, 1), slot(bar, 'queue', 0));
    // a drop past the last skill lands after it (:1804-1805)
    drag(skillOf(tree, 2), slot(bar, 'queue', 4));
    drag(skillOf(tree, 3), slot(bar, 'queue', 2));
    const entry = (id: number, index: number) => ({ kind: ShortcutKind.SKILL, id, type: 0, index, userId: 0, data: 2 });
    expect(sent).toHaveLength(3);
    for (const packet of sent) expect(packet.type === 'SKILLTASKBAR' && packet.queue).toHaveLength(5);
    expect(sent[2]).toMatchObject({ type: 'SKILLTASKBAR', queue: [entry(0, 0), entry(1, 1), entry(2, 2), null, null] });
    expect([0, 1, 2, 3].map((i) => shown(slot(bar, 'queue', i)).kind)).toEqual(['skill', 'skill', 'skill', '']);
    expect(own.taskBar!.queue.map((shortcut) => shortcut.id)).toEqual([0, 1, 2]);
    // nothing goes after the finish skill
    drag(skillOf(tree, 2), slot(bar, 'queue', 4));
    expect(sent).toHaveLength(3);
  });

  it('while the chain runs (m_nExecute) the action slot takes no edit; taking Clean Hit out empties it (RemoveSkillQueue, :1446-1472)', () => {
    const own = vagrantWithSkills(10, 0, [3, 3, 1]);
    const shortcut = (id: number, index: number): Shortcut => ({ ...EMPTY_SKILL, id, index, data: 2 });
    own.taskBar = { ...NEW_BAR, queue: [shortcut(0, 0), shortcut(1, 1), shortcut(2, 2)] };
    const { bar, sent, running } = editingOn(own);
    running.value = true;
    slot(bar, 'queue', 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    drag(slot(bar, 'queue', 1), document.body);
    expect(sent).toEqual([]);
    running.value = false;
    // Over Cut out: the two others stay
    drag(slot(bar, 'queue', 2), document.body);
    expect(sent).toEqual([{ type: 'SKILLTASKBAR', queue: [shortcut(0, 0), shortcut(1, 1), null, null, null] }]);
    // Clean Hit out by a right click: Flurry cannot be first, so it goes too, and the action slot is empty
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    slot(bar, 'queue', 0).dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(sent.at(-1)).toEqual({ type: 'SKILLTASKBAR', queue: [null, null, null, null, null] });
    expect(own.taskBar!.queue).toEqual([]);
  });

  it('a shortcut dragged off the bar comes off its slot (REMOVEITEMTASKBAR); dragged to another slot it moves (ADD there, then REMOVE)', () => {
    const own = vagrantWithSkills(5, 0, [3, 0, 0]);
    const { bar, sent } = editingOn(own);
    // the lollipops (slot 0) to slot 5, then the biscuit (slot 1) off the bar
    drag(slot(bar, 'item', 0), slot(bar, 'item', 5));
    expect(sent).toEqual([
      { type: 'ADDITEMTASKBAR', bar: 0, slot: 5, shortcut: { ...NEW_BAR.items[0]!.shortcut, index: 5, data: 1 } },
      { type: 'REMOVEITEMTASKBAR', bar: 0, slot: 0 },
    ]);
    expect([shown(slot(bar, 'item', 0)).kind, shown(slot(bar, 'item', 5)).count]).toEqual(['', '3']);
    drag(slot(bar, 'item', 1), document.body);
    expect(sent.at(-1)).toEqual({ type: 'REMOVEITEMTASKBAR', bar: 0, slot: 1 });
    // a right click takes one off too (OnRButtonUp)
    slot(bar, 'item', 2).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    expect(sent.at(-1)).toEqual({ type: 'REMOVEITEMTASKBAR', bar: 0, slot: 2 });
    // let go on the applet row, which the browser does not edit: it stays where it was
    drag(slot(bar, 'item', 8), slot(bar, 'applet', 4));
    expect(sent).toHaveLength(4);
    expect(shown(slot(bar, 'item', 8)).kind).toBe('plain');
    // a press that never moved is a press
    slot(bar, 'item', 5).dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointerup', 11, 11));
    expect(sent).toHaveLength(4);
  });

  it('with a finger: a skill tapped, then a slot, goes there; a long press on a slot offers Remove, which takes it off', () => {
    vi.useFakeTimers();
    try {
      const own = vagrantWithSkills(5, 0, [3, 0, 0]);
      const { bar, sent, calls } = editingOn(own);
      const { tree } = skillWindowOn(own, bar);
      skillOf(tree, 1).dispatchEvent(touch('pointerdown'));
      skillOf(tree, 1).click();
      expect(bar.pickedSkill).toBe(0);
      expect(bar.carrying).toBe(true);
      // the rows Clean Hit may go to are lit (OnDraw, :769-819)
      const lit = (row: string) => bar.element.querySelector<HTMLElement>(`.hud-taskbar-lit[data-row="${row}"]`)!.hidden;
      expect([lit('item'), lit('queue')]).toEqual([false, false]);
      // F-keys do nothing while a shortcut is carried (Process, :2331-2338)
      key('keydown', 'F1', { key: 'F1' });
      expect(calls).toEqual([]);
      slot(bar, 'item', 4).click();
      expect(sent).toEqual([{
        type: 'ADDITEMTASKBAR', bar: 0, slot: 4,
        shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: 4, userId: 0, data: 1, text: 'Clean Hit' },
      }]);
      expect(bar.pickedSkill).toBe(null);
      expect([lit('item'), lit('queue')]).toEqual([true, true]);
      // a short tap on the slot uses it
      slot(bar, 'item', 4).dispatchEvent(touch('pointerdown'));
      window.dispatchEvent(touch('pointerup'));
      slot(bar, 'item', 4).click();
      expect(calls).toEqual(['useSlot 0 4 skill 0']);
      // held 500 ms: the Remove line over the slot; the finger's lift is no press
      slot(bar, 'item', 4).dispatchEvent(touch('pointerdown'));
      vi.advanceTimersByTime(499);
      const menu = bar.element.querySelector<HTMLElement>('.hud-slot-menu')!;
      expect(menu.hidden).toBe(true);
      vi.advanceTimersByTime(1);
      expect(menu.hidden).toBe(false);
      window.dispatchEvent(touch('pointerup'));
      slot(bar, 'item', 4).click();
      expect(calls).toEqual(['useSlot 0 4 skill 0']);
      const remove = menu.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
      expect(remove.textContent).toBe('Remove');
      expect(menu.style.left).toBe(`${286 + 4 * 32}px`);
      remove.click();
      expect(sent.at(-1)).toEqual({ type: 'REMOVEITEMTASKBAR', bar: 0, slot: 4 });
      expect(menu.hidden).toBe(true);
      // a finger that moves while held is no long press; a press elsewhere closes the line
      slot(bar, 'item', 0).dispatchEvent(touch('pointerdown', 10, 10));
      window.dispatchEvent(touch('pointermove', 40, 10));
      vi.advanceTimersByTime(600);
      expect(menu.hidden).toBe(true);
      slot(bar, 'item', 0).dispatchEvent(touch('pointerdown', 10, 10));
      vi.advanceTimersByTime(500);
      expect(menu.hidden).toBe(false);
      document.body.dispatchEvent(touch('pointerdown', 400, 100));
      expect(menu.hidden).toBe(true);
      expect(sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a skill with a cool-down is turned away from the action slot with TID_GAME_SKILLLNOTUSE (SetSkillQueue, :1819-1830)', () => {
    const own = vagrantWithSkills(5, 0, [3, 0, 0]);
    const cooling: WebSkill = { ...SKILLS.get(1)!, levels: SKILLS.get(1)!.levels.map((row) => ({ ...row, cooldown: 3000 })) };
    const record = recorder();
    const bar = new TaskBar(art, record.actions);
    bars.push(bar);
    layer(800, 600).append(bar.element);
    bar.update(own, { ...EDIT_DATA, skills: new Map([...SKILLS, [1, cooling]]) });
    bar.queueSkill(0);
    expect(record.sent).toEqual([]);
    expect(record.said).toEqual([{ text: 'Clean Hit skill cannot be registered in the action slot.', color: 0xff99cc00 }]);
  });

  it('a skill in the applet row is used as a bar\'s is; K opens the skill window (APP_SKILL3\'s hotkey), not while carrying', () => {
    const own = vagrantWithSkills(5, 0, [3, 0, 0]);
    own.taskBar = { ...NEW_BAR, applets: [{ slot: 0, shortcut: { ...EMPTY_SKILL, id: 0, index: 0, data: 0 } }] };
    const { bar, calls } = editingOn(own);
    slot(bar, 'applet', 0).click();
    expect(calls).toEqual([`useAppletSlot 0 ${ShortcutKind.SKILL} 0`]);
    key('keydown', 'KeyK');
    expect(calls.at(-1)).toBe('open skills');
    bar.pickSkill(0, document.body);
    key('keydown', 'KeyK');
    expect(calls.filter((call) => call === 'open skills')).toHaveLength(1);
  });

  it("a picked skill is let go by + - Reset Finish, and by a press outside the window and the bar's rows, not by one in them", () => {
    const own = vagrantWithSkills(5, 4, [3, 0, 0]);
    const { bar, sent } = editingOn(own);
    const { tree } = skillWindowOn(own, bar);
    const pick = () => {
      skillOf(tree, 1).dispatchEvent(touch('pointerdown'));
      skillOf(tree, 1).click();
      expect(bar.pickedSkill).toBe(0);
    };
    // + raises Clean Hit, - lowers it, Reset and Finish with a level placed: each lets the pick go
    const pressed = (name: string) => {
      pick();
      expect(skillButton(tree, name).disabled, name).toBe(false);
      skillButton(tree, name).click();
      expect(bar.pickedSkill, name).toBe(null);
    };
    pressed('plus');
    pressed('minus');
    skillButton(tree, 'plus').click();
    pressed('reset');
    // Reset unchose Clean Hit: chosen again and raised
    choose(tree, 1);
    skillButton(tree, 'plus').click();
    pressed('finish');
    expect(tree.warning.isOpen).toBe(true);
    warningButton(tree, 'no').click();
    // a finger elsewhere in the window, or on a slot of the item row or the action slot, keeps it
    pick();
    tree.frame.body.dispatchEvent(touch('pointerdown'));
    slot(bar, 'queue', 0).dispatchEvent(touch('pointerdown'));
    slot(bar, 'item', 5).dispatchEvent(touch('pointerdown'));
    expect(bar.pickedSkill).toBe(0);
    // the tap on the slot, as the finger lifts, places it
    slot(bar, 'item', 5).click();
    expect(sent).toHaveLength(1);
    expect(bar.pickedSkill).toBe(null);
    // the world, the applet row, the Start button: let go, and the next slot tapped is used, not replaced
    for (const target of [document.body, bar.element.querySelector('.hud-taskbar-up')!, bar.element.querySelector('.hud-taskbar-start')!]) {
      pick();
      target.dispatchEvent(touch('pointerdown'));
      expect(bar.pickedSkill).toBe(null);
    }
    slot(bar, 'item', 0).click();
    expect(sent).toHaveLength(1);
  });

  it('a chat line moved on the bar loses its --, \', /* and */ (OnDropIcon, WndTaskBar.cpp:1985-1992)', () => {
    const own = vagrantWithSkills(5, 0, [3, 0, 0]);
    const chat: Shortcut = { kind: ShortcutKind.CHAT, id: 1, type: 0, index: 3, userId: 0, data: 1, text: "hi--'/* there */" };
    own.taskBar = { ...NEW_BAR, items: [...NEW_BAR.items, { bar: 0, slot: 3, shortcut: chat }] };
    const { bar, sent } = editingOn(own);
    const from = slot(bar, 'item', 3);
    from.dispatchEvent(pointer('pointerdown', 10, 10));
    window.dispatchEvent(pointer('pointermove', 30, 30));
    slot(bar, 'item', 4).dispatchEvent(pointer('pointerup', 30, 30));
    expect(sent[0]).toEqual({ type: 'ADDITEMTASKBAR', bar: 0, slot: 4, shortcut: { ...chat, index: 4, text: 'hi there ' } });
  });
});

describe('Hud: T and the carried shortcut', () => {
  it('T does nothing while the task bar carries a shortcut: Process reads the applets\' hotkeys only with none (WndTaskBar.cpp:2331-2338)', () => {
    const hud = new Hud(document, art, DATA);
    document.body.append(hud.element);
    hud.frame(0, newVagrantWithBar(), 'Webby', null, false);
    let carrying = true;
    hud.carrying = () => carrying;
    expect(hud.status.frame.isOpen).toBe(true);
    key('keydown', 'KeyT');
    expect(hud.status.frame.isOpen).toBe(true);
    carrying = false;
    key('keydown', 'KeyT');
    expect(hud.status.frame.isOpen).toBe(false);
    hud.dispose();
  });
});

/** A job skill's shortcut, `SHORTCUT_SKILL` type 0, to fill in. */
const EMPTY_SKILL: Shortcut = { kind: ShortcutKind.SKILL, id: 0, type: 0, index: 0, userId: 0, data: 0, text: '' };

// @vitest-environment jsdom
// 2026-11-14: the Motion window (docs/2026-11-14-motion-window-research.md): the motion table, what using a motion does
// (`CWndMgr::ObjectExecutor`, WndManager.cpp:2717-2723, :2922-3098), OBJMSG_MOTION in the rules (ActionMoverMsg.cpp:1105-1124,
// ActionMoverState.cpp:44-65), the tooltips, the task bar's carried shortcuts and the window's grid.

import { describe, expect, it, vi } from 'vitest';
import { ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut } from '@flyffweb/protocol';
import type { OwnState } from '../src/world/OwnState';
import type { UiArt } from '../src/world/hud/art';
import { MotionWindow } from '../src/world/hud/motionWindow';
import type { MotionWindowHost } from '../src/world/hud/motionWindow';
import { EMPTY, TaskBarEdits } from '../src/world/hud/taskBarEdits';
import type { EditedBar, LoadedBars, TaskBarEditActions } from '../src/world/hud/taskBarEdits';
import { canToggleSit, nearestDrop, useEmoticon, useMotion } from '../src/world/motion/motionRules';
import type { MotionHost } from '../src/world/motion/motionRules';
import { EMOTICON_COUNT, MOTIONS, MotId, emoticonLine, emoticonOfLine, motionProp, playMode, pointAngle } from '../src/world/motion/motionTable';
import { emoticonTip, motionTip } from '../src/world/motion/motionTips';
import { ActionMover } from '../src/world/sim/ActionMover';
import { ActMsg, AniLoop, ObjSta, ObjStaF } from '../src/world/sim/constants';

describe('the motion table (propMotion.txt, textEmotion.txt)', () => {
  it('has the 27 motions in MOT_BASE_* order, MOT_BASE_COLLECT (24) left out', () => {
    expect(MOTIONS).toHaveLength(27);
    expect(MOTIONS.map((m) => m.id)).toEqual([...Array.from({ length: 23 }, (_, i) => i + 1), 25, 26, 27, 28]);
    expect(motionProp(MotId.SIT)).toMatchObject({ mti: 20, icon: 'mot_baseSit.dds', desc: 'Sit Down' });
    expect(motionProp(11)).toMatchObject({ mti: 129, play: 1, say: 'Scissors' });
    expect(motionProp(24)).toBeUndefined();
  });

  it('turns dwPlay into a play mode and gives the Point motions their angle', () => {
    expect([playMode(0), playMode(1), playMode(2)]).toEqual([AniLoop.ONE_PLAY, AniLoop.CONT, AniLoop.LOOP]);
    expect([14, 15, 16, 17, 4].map(pointAngle)).toEqual([180, 0, 90, 270, null]);
  });

  it('has 29 emoticons, "/" and the command, matched exactly over a speaker', () => {
    expect(EMOTICON_COUNT).toBe(29);
    expect([emoticonLine(0), emoticonLine(18), emoticonLine(28), emoticonLine(29)]).toEqual(['/laugh', '/cat face', '/love', '']);
    expect([emoticonOfLine('/laugh'), emoticonOfLine('/love'), emoticonOfLine('/Laugh'), emoticonOfLine('laugh'), emoticonOfLine('/laugh ')])
      .toEqual([0, 28, null, null, null]);
  });
});

/** A host whose senders are spies, around a real ActionMover. */
function host(over: Partial<Omit<MotionHost, 'act'>> = {}): MotionHost & { calls: string[]; act: ActionMover } {
  const calls: string[] = [];
  const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: 0.1 });
  act.state = ObjSta.STAND;
  return {
    calls, act,
    vendorOpen: () => false,
    chatLater: (text) => calls.push(`chat ${text}`),
    runChat: (text) => calls.push(`run ${text}`),
    pickupAround: () => calls.push('pickup'),
    sendMotion: (message) => calls.push(`motion ${message}`),
    setAngle: (angle) => calls.push(`angle ${angle}`),
    behave: () => calls.push('behave'),
    escape: () => calls.push('escape'),
    focusPlayer: () => null,
    sendCheering: (id) => calls.push(`cheer ${id}`),
    autoAttack: () => false,
    confirmPropose: (name) => calls.push(`propose ${name}`),
    say: (tid) => calls.push(`say ${tid}`),
    ...over,
  };
}

describe('useMotion (ObjectExecutor, WndManager.cpp:2922-3098)', () => {
  it('a plain motion: OBJMSG_MOTION with its MTI and play mode, then the behavior (the others see it)', () => {
    const h = host();
    useMotion(4, h); // Shake Hands
    expect(h.act.stateFlag & ObjStaF.ETC).toBe(ObjStaF.ETC);
    expect(h.act.motionEx).toBe(122);
    expect(h.act.motion).toBe(122);
    expect(h.act.loop).toBe(AniLoop.ONE_PLAY);
    expect(h.calls).toEqual(['behave']);
  });

  it('a Point motion turns the player; one with a line says it 1 s later, even refused', () => {
    const h = host();
    useMotion(14, h);
    expect(h.calls).toEqual(['chat North', 'angle 180', 'behave']);
    const sitting = host();
    sitting.act.stateFlag |= ObjStaF.SIT;
    useMotion(11, sitting); // Scissors while sitting: refused, the line said all the same
    expect(sitting.calls).toEqual(['chat Scissors']);
  });

  it('nothing while a shop window is open (GetWndVendorBase)', () => {
    const h = host({ vendorOpen: () => true });
    useMotion(14, h);
    expect(h.calls).toEqual([]);
  });

  it('Combat Stance toggles combat mode with a behavior; Sit sends MOTION sit down, or stand up when sitting', () => {
    const h = host();
    useMotion(MotId.BATTLE, h);
    expect(h.act.stateFlag & ObjStaF.COMBAT).toBe(ObjStaF.COMBAT);
    useMotion(MotId.BATTLE, h);
    expect(h.act.stateFlag & ObjStaF.COMBAT).toBe(0);
    expect(h.calls).toEqual(['behave', 'behave']);
    useMotion(MotId.SIT, h);
    h.act.stateFlag |= ObjStaF.SIT;
    useMotion(MotId.SIT, h);
    expect(h.calls.slice(2)).toEqual([`motion ${ActMsg.SITDOWN}`, `motion ${ActMsg.STANDUP}`]);
    expect(canToggleSit({ state: ObjSta.SJUMP1 })).toBe(false);
  });

  it('Pickup, the town escape, Cheer, Auto attack and Propose', () => {
    const none = host();
    for (const id of [MotId.PICKUP, MotId.ESCAPE, MotId.CHEER, MotId.AUTOATTACK, MotId.COUPLE]) useMotion(id, none);
    expect(none.calls).toEqual(['pickup', 'escape', 'say TID_CHEER_NO2', 'say TID_GAME_NOTTARGET', 'say TID_GAME_NOTCOUPLETARGET']);
    const player = host({ focusPlayer: () => ({ objectId: 77, name: 'Webby' }), autoAttack: () => true });
    for (const id of [MotId.CHEER, MotId.AUTOATTACK, MotId.COUPLE]) useMotion(id, player);
    expect(player.calls).toEqual(['cheer 77', 'propose Webby']);
  });

  it('an emoticon runs "/" and its command as a chat line', () => {
    const h = host();
    useEmoticon(5, h);
    useEmoticon(99, h);
    expect(h.calls).toEqual(['run /anger']);
  });

  it('nearestDrop: the nearest item closer than 4 m (DoPickupItemAround)', () => {
    const items = new Map([[1, { pos: [3, 0, 0] as const }], [2, { pos: [1, 1, 0] as const }], [3, { pos: [4, 0, 0] as const }]]);
    expect(nearestDrop(items, [0, 0, 0])).toBe(2);
    expect(nearestDrop(new Map([[3, { pos: [4, 0, 0] as const }]]), [0, 0, 0])).toBeNull();
  });
});

describe('OBJMSG_MOTION and OBJMSG_MODE_PEACE in the rules', () => {
  it('a motion is refused while sitting, jumping or attacking', () => {
    const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: 0.1 });
    act.state = ObjSta.STAND;
    act.stateFlag |= ObjStaF.SIT;
    expect(act.sendActMsg(ActMsg.MOTION, 122, AniLoop.ONE_PLAY)).toBe(false);
    act.stateFlag &= ~ObjStaF.SIT;
    act.state = ObjSta.SJUMP1;
    expect(act.sendActMsg(ActMsg.MOTION, 122, AniLoop.ONE_PLAY)).toBe(false);
    expect(act.sendActMsg(ActMsg.MODE_PEACE)).toBe(false); // not in combat mode
  });

  it('a held motion ends at the own player\'s click at its last frame; a one-play one by itself', () => {
    const act = new ActionMover({ pos: [0, 0, 0], angle: 0, speed: 0.1 });
    act.state = ObjSta.STAND;
    let held = false;
    act.lButtonDown = () => held;
    expect(act.sendActMsg(ActMsg.MOTION, 127, AniLoop.CONT)).toBe(true); // Parade Rest
    act.step();
    expect(act.stateFlag & ObjStaF.ETC).toBe(ObjStaF.ETC);
    held = true;
    act.step();
    expect(act.stateFlag & ObjStaF.ETC).toBe(0);
    expect(act.sendActMsg(ActMsg.MOTION, 122, AniLoop.ONE_PLAY)).toBe(true);
    held = false;
    act.step();
    expect(act.stateFlag & ObjStaF.ETC).toBe(0);
  });
});

describe('the tooltips', () => {
  const text = (tid: string): string => ({
    TID_CHEER_MESSAGE1: 'Cheer Message Point(s): %d/3', TID_CHEER_MESSAGE2: 'Time left until the next point',
    TID_PK_LIMIT_MINUTE: '%.1dmin', TID_PK_LIMIT_SECOND: '%.1dsec',
  } as Record<string, string>)[tid] ?? '';

  it('a motion\'s description; the Cheer\'s points and the time to the next under 3', () => {
    expect(motionTip(4, null, text, false)).toEqual(['Shake Hands']);
    expect(motionTip(MotId.CHEER, { points: 3, restMs: 0 }, text, false)).toEqual(['Cheer up another character', 'Cheer Message Point(s): 3/3']);
    expect(motionTip(MotId.CHEER, { points: 1, restMs: 25 * 60_000 + 5000 }, text, true))
      .toEqual(['Cheer up another character', '', 'Cheer Message Point(s): 1/3', 'Time left until the next point25m']);
    // 2026-11-15 (consistency scan): the short durations' one unit (formatDuration), as every other time shown
    expect(motionTip(MotId.CHEER, { points: 2, restMs: 42_500 }, text, false)[2]).toBe('Time left until the next point42s');
    expect(emoticonTip(1)).toEqual(['/sad']);
  });
});

/** A bar with nothing on it, for the edits. */
function editedBar(sent: Array<[number, number, Shortcut]>): TaskBarEdits {
  const bars: LoadedBars = {
    applets: Array.from({ length: 18 }, () => EMPTY), items: Array.from({ length: 8 }, () => Array.from({ length: 9 }, () => EMPTY)),
    queue: Array.from({ length: 5 }, () => EMPTY), queueCount: 0, itemIds: new Map(),
  };
  const bar: EditedBar = { bars, own: {} as OwnState, data: { itemProps: new Map() }, bar: 0, commit: () => {} };
  const actions: TaskBarEditActions = {
    sendAddItemTaskBar: (b, slot, shortcut) => sent.push([b, slot, shortcut]), sendRemoveItemTaskBar: () => {},
    sendAddAppletTaskBar: () => {}, sendRemoveAppletTaskBar: () => {}, sendSkillTaskBar: () => {}, queueRunning: () => false, say: () => {},
  };
  return new TaskBarEdits(bar, actions);
}

describe('a motion or an emoticon carried to the task bar (OnDropIcon, SetShortcut)', () => {
  it('goes on an item slot as SHORTCUT_MOTION (its MOT_BASE_*) or SHORTCUT_EMOTICON (its index, "/" and its command)', () => {
    const sent: Array<[number, number, Shortcut]> = [];
    const edits = editedBar(sent);
    edits.dropOn({ from: 'motions', motion: MotId.SIT }, { row: 'item', slot: 2 });
    edits.dropOn({ from: 'emoticons', emoticon: 0 }, { row: 'item', slot: 3 });
    edits.dropOn({ from: 'motions', motion: MotId.SIT }, { row: 'queue', slot: 0 }); // not the action slot
    expect(sent).toEqual([
      [0, 2, { kind: ShortcutKind.MOTION, id: MotId.SIT, type: 0, index: 2, userId: 0, data: 1, text: '' }],
      [0, 3, { kind: ShortcutKind.EMOTICON, id: 0, type: 0, index: 3, userId: 0, data: 1, text: '/laugh' }],
    ]);
  });

  it('an emoticon loaded with no text (the TASKBAR sends none) moves on the bar with its text made again', () => {
    const sent: Array<[number, number, Shortcut]> = [];
    const edits = editedBar(sent);
    edits.dropOn({ from: 'emoticons', emoticon: 0 }, { row: 'item', slot: 0 });
    expect(edits.carriedShortcut({ from: 'item', bar: 0, slot: 0 })?.text).toBe('/laugh');
  });
});

describe('the Motion window', () => {
  const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
  const texts: Record<string, string> = { TID_APP_MOTION: 'Motion', TID_GAME_TOOLTIP_MOTION: 'Motion', TID_GAME_TOOLTIP_EMOTICON: 'Emoticon' };
  const make = (over: Partial<MotionWindowHost> = {}): { window: MotionWindow; host: MotionWindowHost } => {
    const host: MotionWindowHost = {
      text: (tid) => texts[tid] ?? '', useMotion: vi.fn(), useEmoticon: vi.fn(), carry: vi.fn(), pick: vi.fn(), picked: () => null,
      tip: () => [], ...over,
    };
    const window = new MotionWindow(art, host, document);
    document.body.append(window.frame.element);
    return { window, host };
  };

  it('has the Motion tab first: 27 icons 8 a row at (col * 32 + 3, 7 + row * 32), the Emoticon tab\'s 29', () => {
    const { window } = make();
    window.toggle();
    expect(window.isOpen).toBe(true);
    const pages = [...window.frame.body.querySelectorAll<HTMLElement>('.hud-motion-page')];
    expect(pages.map((p) => p.hidden)).toEqual([false, true]);
    const motions = pages[0]!.querySelectorAll<HTMLElement>('.hud-motion-cell');
    expect(motions).toHaveLength(27);
    expect([motions[9]!.style.left, motions[9]!.style.top]).toEqual(['35px', '39px']);
    expect(motions[1]!.getAttribute('aria-label')).toBe('Sit Down');
    expect(motions[1]!.style.getPropertyValue('--motion-icon')).toContain('ui/mot_basesit.png');
    expect(pages[1]!.querySelectorAll('.hud-motion-cell')).toHaveLength(29);
    const titles = [...window.frame.body.querySelectorAll<HTMLElement>('.hud-tab-title')];
    expect(titles.map((t) => t.textContent)).toEqual(['Motion', 'Emoticon']);
    titles[1]!.click();
    expect(window.currentTab).toBe(1);
    window.frame.close();
  });

  it('a click uses the motion or the emoticon; a mouse press carries it', () => {
    const { window, host } = make();
    window.toggle();
    const motion = window.frame.body.querySelector<HTMLElement>('[data-motion="4"]')!;
    motion.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    motion.click();
    expect(host.carry).toHaveBeenCalledWith({ from: 'motions', motion: 4 }, expect.anything());
    expect(host.useMotion).toHaveBeenCalledWith(4);
    window.frame.body.querySelector<HTMLElement>('[data-emoticon="28"]')!.click();
    expect(host.useEmoticon).toHaveBeenCalledWith(28);
    window.frame.close();
  });
});

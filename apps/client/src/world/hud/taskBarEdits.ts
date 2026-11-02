// The task bar's edits (spec §3.11), on the bars as the bar loaded them (`LoadedBars`), with no DOM: a shortcut carried to
// the bar and let go (a skill of the skill window, or a slot of the bar moved or taken off), and the action slot's skills
// put in and taken out, each sent as Neuz sends it. The bar (`TaskBar`) draws them and hands it the presses and the drops;
// its gestures are `slotGestures.ts`'.
//
//   CWndTaskBar::RemoveSkillQueue  _Interface/WndTaskBar.cpp:1446-1472  a skill taken out of the action slot, and the ones
//                                                                      that can no longer follow; SKILLTASKBAR
//   CWndTaskBar::OnRButtonUp       WndTaskBar.cpp:1473-1512             a right click takes a shortcut off
//   CWndTaskBar::SetShortcut       WndTaskBar.cpp:1514-1667             a shortcut put on an item slot; ADDITEMTASKBAR
//   CWndTaskBar::SetSkillQueue     WndTaskBar.cpp:1787-1872             a skill put in the action slot; SKILLTASKBAR
//   CWndTaskBar::OnDropIcon        WndTaskBar.cpp:1874-2093             a carried shortcut let go on the bar, or off it

import { MAX_SLOT_QUEUE, ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut } from '@flyffweb/protocol';
import type { WebSkill } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { canPlaceInQueue, canPlaceOnBar, checkAddSkill, checkSkill } from '../skills/skillRules';
import { formatText } from './format';
import type { TaskBarData } from './taskBar';

/** An empty shortcut (`InitTaskBar`'s `memset`, `WndTaskBar.cpp:530-532`). */
export const EMPTY: Shortcut = { kind: ShortcutKind.NONE, id: 0, type: 0, index: 0, userId: 0, data: 0, text: '' };

/** `m_dwData` of a shortcut: where it is, the applet row 0, an item bar 1, the action slot 2 (`SetShortcut`, `SetSkillQueue`). */
const WHERE_ITEM = 1;
const WHERE_QUEUE = 2;

/**
 * The bars as `CWndTaskBar::Serialize` loads them (`WndTaskBar.cpp:315-400`) and the edits change them: the applet row, the
 * 8 bars of 9 slots and the action slot's 5 slots (`m_aSlotQueue`) with `m_nCurQueueNum` (`queueCount`), each stackable
 * item's shortcut with `m_dwItemId` (`itemIds`, by the same place).
 */
export interface LoadedBars {
  applets: Shortcut[];
  items: Shortcut[][];
  queue: Shortcut[];
  queueCount: number;
  itemIds: Map<Shortcut[], Array<number | null>>;
}

/** `dwPackMax > 1`: the item stacks (`WndTaskBar.cpp:352`, :375, :836, :946). An item the catalog lacks does not. */
export function stacks(itemId: number, data: Pick<TaskBarData, 'itemProps'>): boolean {
  return (data.itemProps.get(itemId)?.packMax ?? 1) > 1;
}

/** `m_dwItemId` of a stackable item's shortcut in slot `i` of `row` (:347-357, :1648-1653); any other shortcut keeps none. */
export function remember(
  bars: LoadedBars, own: OwnState | null | undefined, data: Pick<TaskBarData, 'itemProps'>, row: Shortcut[], i: number,
  shortcut: Shortcut,
): void {
  const ids = bars.itemIds.get(row);
  if (ids !== undefined) ids[i] = null;
  if (shortcut.kind !== ShortcutKind.ITEM) return;
  const item = own?.inventory?.get(shortcut.id);
  if (item === undefined || !stacks(item.itemId, data)) return;
  if (!bars.itemIds.has(row)) bars.itemIds.set(row, []);
  bars.itemIds.get(row)![i] = item.itemId;
}

/**
 * A chat line's text as `OnDropIcon` puts it on an item slot (`WndTaskBar.cpp:1985-1992`): `sChat.Replace( "--", "" )`,
 * then `"'"`, `"/*"` and `"*\/"`, each every time it occurs, in that order (the marks the database's SQL would read).
 */
export function withoutSqlMarks(text: string): string {
  return ['--', "'", '/*', '*/'].reduce((out, mark) => out.split(mark).join(''), text);
}

/**
 * What the pointer or a finger carries to the bar (`m_GlobalShortcut`): a skill of the skill window, by its slot of
 * `m_aJobSkill` (`CWndSkillTreeEx::OnMouseMove`, `WndField.cpp:7438-7463`: `SHORTCUT_SKILL`, type 0, `m_dwId` the slot), or
 * the shortcut of a slot of an item bar or of the action slot (`CWndTaskBar::OnMouseMove`, `WndTaskBar.cpp:2143-2168`).
 */
export type Carried =
  | { from: 'inventory'; objectId: number }
  | { from: 'skills'; skillIndex: number }
  | { from: 'item'; bar: number; slot: number }
  | { from: 'queue'; slot: number };

/**
 * Where a carried shortcut is let go: a slot of the item row or of the action slot, the applet row, elsewhere on the bar,
 * or off it (null).
 */
export type DropTarget = { row: 'item' | 'queue'; slot: number } | 'applet' | 'bar' | null;

/** Where the edits go: the packets, the action slot's chain, and the lines they print. */
export interface TaskBarEditActions {
  /** ADDITEMTASKBAR (`CDPClient::SendAddItemTaskBar`): `shortcut` put on slot `slot` of item bar `bar`. */
  sendAddItemTaskBar(bar: number, slot: number, shortcut: Shortcut): void;
  /** REMOVEITEMTASKBAR (`CDPClient::SendRemoveItemTaskBar`): slot `slot` of item bar `bar` emptied. */
  sendRemoveItemTaskBar(bar: number, slot: number): void;
  /** SKILLTASKBAR (`CDPClient::SendSkillTaskBar`): the action slot's 5 slots, `null` for an empty one. */
  sendSkillTaskBar(queue: ReadonlyArray<Shortcut | null>): void;
  /** `CWndTaskBar::m_nExecute != 0`: the action slot's chain runs (`SkillUse.execute`), and the action slot takes no edit. */
  queueRunning(): boolean;
  /** `g_WndMng.PutString( text, NULL, color )`: a line of the server messages (`TID_GAME_SKILLLNOTUSE`). */
  say(text: string, color: number): void;
}

/** What the edits read of the bar: its bars, the own numbers and catalogs of its last update, the bar shown. */
export interface EditedBar {
  readonly bars: LoadedBars;
  readonly own: OwnState | undefined;
  readonly data: TaskBarData;
  /** `m_nSlotIndex`. */
  readonly bar: number;
  /** The bars as edited, put back in `OwnState.taskBar` and drawn (Neuz's bars are the window's own). */
  commit(): void;
}

/** The task bar's edits on `bar`, sent through `actions`. */
export class TaskBarEdits {
  constructor(private readonly bar: EditedBar, private readonly actions: TaskBarEditActions) {}

  /** The catalog's skill in skill slot `skillIndex` of the own character (`GetSkill( 0, dwId )->GetProp()`), or undefined. */
  skillOf(skillIndex: number): WebSkill | undefined {
    const slot = this.bar.own?.skills[skillIndex];
    return slot === undefined ? undefined : this.bar.data.skills?.get(slot.skill);
  }

  /** The shortcut `carried` stands for: a job skill of the skill window, as `OnMouseMove` makes it, or the slot's. */
  carriedShortcut(carried: Carried): Shortcut | null {
    const bars = this.bar.bars;
    if (carried.from === 'inventory') return this.bar.own?.inventory?.has(carried.objectId) ? {
      kind: ShortcutKind.ITEM, id: carried.objectId, type: 0, index: 0, userId: 0, data: 1, text: '',
    } : null;
    if (carried.from === 'skills') {
      // m_dwShortcut SHORTCUT_SKILL, m_dwType 0, m_dwId the slot, m_dwIndex the skill, m_dwData 0, m_szString its name
      const slot = this.bar.own?.skills[carried.skillIndex];
      return {
        kind: ShortcutKind.SKILL, id: carried.skillIndex, type: 0, index: slot?.skill ?? 0, userId: 0, data: 0,
        text: this.skillOf(carried.skillIndex)?.name ?? '',
      };
    }
    if (carried.from === 'item') {
      const shortcut = bars.items[carried.bar]![carried.slot]!;
      return shortcut.kind === ShortcutKind.NONE ? null : shortcut;
    }
    return carried.slot < bars.queueCount && bars.queue[carried.slot]!.kind !== ShortcutKind.NONE
      ? bars.queue[carried.slot]!
      : null;
  }

  /**
   * The skill window's double click on skill slot `skillIndex` (`CWndSkillTreeEx::OnLButtonDblClk`, `WndField.cpp:8318-8393`):
   * `SetSkillQueue( m_nCurQueueNum, 0, i )`, the skill after the last one of the action slot, unless the chain runs.
   */
  queueSkill(skillIndex: number): void {
    this.setSkillQueue(this.bar.bars.queueCount, skillIndex, this.skillOf(skillIndex)?.name ?? '');
  }

  /**
   * `CWndTaskBar::OnDropIcon( pShortcut, point )` (`WndTaskBar.cpp:1874-2093`): `carried` let go on `target`.
   * - From the bar, off it (`!GetClientRect().PtInRect( point )`, the bar holding the mouse since the press): the shortcut
   *   comes off its slot (REMOVEITEMTASKBAR, or `RemoveSkillQueue`).
   * - A job skill of level 0, or one that `CMover::CheckSkill` turns away on the player's own levels (:1920-1928), goes
   *   nowhere; nor a shortcut with `m_dwId` 0 and no text (:1934-1938: Neuz's empty shortcut, which a skill of slot 0 from a
   *   TASKBAR also is, its text being read for chat lines only, so Clean Hit loaded from the server does not move on the
   *   bar; one placed from the skill window carries its name).
   * - On a slot of the item row: a skill only if `CT_STEP` or `CT_GENERAL` (`canPlaceOnBar`, :2026-2041), else it is refused
   *   and stays where it was; let go on its own slot, nothing. It goes there (`SetShortcut`, ADDITEMTASKBAR), a chat line
   *   without the marks `withoutSqlMarks` takes out.
   * - On a slot of the action slot: a job skill only (`SetSkillQueue`, :2043-2066); one moved within the action slot is
   *   taken out first, unsent (`RemoveSkillQueue( i, FALSE )`), and put back where it is let go.
   * - From the bar, once it has gone somewhere else on the bar (or anywhere on it that takes nothing), its slot is emptied
   *   (:2073-2090): Neuz takes a shortcut off a slot when it is let go on the bar's empty parts too.
   * The applet row takes nothing here, for want of ADDAPPLETTASKBAR: a shortcut let go there stays where it was (Neuz would
   * move it there).
   *
   * Two departures: an item slot's shortcut comes off the bar it was taken from (Neuz empties that slot but sends the
   * REMOVEITEMTASKBAR for the bar shown at the drop, which a digit may have changed in between); and a skill moved within
   * the action slot that cannot go where it is let go is sent as taken out (Neuz sends nothing then, and the server would
   * keep the skill the bar no longer shows).
   */
  dropOn(carried: Carried, target: DropTarget): void {
    const own = this.bar.own;
    const shortcut = this.carriedShortcut(carried);
    if (own === undefined || shortcut === null) return;
    const fromBar = carried.from === 'item' || carried.from === 'queue';
    if (target === null) {
      if (fromBar) this.removeCarried(carried);
      return;
    }
    if (shortcut.kind === ShortcutKind.SKILL && shortcut.type !== 2) {
      const slot = own.skills[shortcut.id];
      if (slot !== undefined && (slot.level <= 0 || !this.playerHasSkillOpen(slot.skill))) return;
    }
    if (shortcut.id === 0 && shortcut.text === '' && shortcut.kind !== ShortcutKind.SKILLFUN && shortcut.kind !== ShortcutKind.ITEM) return;
    if (target === 'applet') return;
    if (target !== 'bar' && target.row === 'item') {
      if (carried.from === 'item' && carried.bar === this.bar.bar && carried.slot === target.slot) return;
      if (shortcut.kind === ShortcutKind.SKILL) {
        const skill = shortcut.type === 2 ? undefined : this.skillOf(shortcut.id);
        // a party skill (type 2) is the troupe's catalog's, which the browser has not: Neuz reads its combo style there
        if (skill === undefined || !canPlaceOnBar(skill, own.skills[shortcut.id]?.level ?? 0)) return;
      }
      // a chat line's text loses its --, ', /* and */ before it goes on the slot (:1985-1992)
      const text = shortcut.kind === ShortcutKind.CHAT ? withoutSqlMarks(shortcut.text) : shortcut.text;
      this.setItemShortcut(target.slot, { ...shortcut, text });
    } else if (target !== 'bar' && target.row === 'queue' && shortcut.kind === ShortcutKind.SKILL && shortcut.type === 0) {
      if (carried.from === 'queue') {
        if (this.actions.queueRunning()) return;
        this.removeSkillQueue(carried.slot, false);
        if (!this.setSkillQueue(target.slot, shortcut.id, shortcut.text)) this.sendQueue();
        return;
      }
      this.setSkillQueue(target.slot, shortcut.id, shortcut.text);
    }
    if (fromBar) this.removeCarried(carried);
  }

  /** A right click on slot `i` of `row` (`OnRButtonUp`, :1473-1512): an item slot empties; the action slot's goes out. */
  rightClick(row: 'item' | 'queue', i: number): void {
    const bar = this.bar.bar;
    if (row === 'item') {
      if (this.bar.bars.items[bar]![i]!.kind !== ShortcutKind.NONE) this.removeItemShortcut(bar, i);
    } else {
      this.removeSkillQueue(i);
    }
  }

  /**
   * `CMover::CheckSkill( dwSkill )` (`MoverParam.cpp:117-156`) of the own character: the skill of the catalog with ID
   * `skillId` is open at the character's level and the player's own levels of its prerequisites (`GetSkill( dwSkill )`, the
   * first slot with it). A skill the catalog lacks is not (`pSkillProp == NULL`).
   */
  private playerHasSkillOpen(skillId: number): boolean {
    const own = this.bar.own;
    const skill = this.bar.data.skills?.get(skillId);
    if (own === undefined || skill === undefined) return false;
    return checkSkill(skill, own.level, (id) => own.skills.find((slot) => slot.skill === id)?.level);
  }

  /** The bar's shortcut `carried` comes off its slot (the end of `OnDropIcon`, :2073-2090). */
  private removeCarried(carried: Carried): void {
    if (carried.from === 'item') this.removeItemShortcut(carried.bar, carried.slot);
    else if (carried.from === 'queue') this.removeSkillQueue(carried.slot);
  }

  /**
   * `SetShortcut( nIndex, ..., nWhere 1 )` (`WndTaskBar.cpp:1514-1667`): `from` on slot `slot` of the bar shown, as Neuz
   * fills it (its kind, type and ID; `m_dwIndex` the slot, `m_dwUserId` 0, `m_dwData` 1, the carried text), keeping a
   * stackable item's `m_dwItemId` (:1648-1653), then ADDITEMTASKBAR. (The 10-chat-shortcut cap, :1520-1539, is the chat's:
   * the bar moves no more chat lines than it had.)
   */
  private setItemShortcut(slot: number, from: Shortcut): void {
    const { bars, own, data, bar } = this.bar;
    const shortcut: Shortcut = {
      kind: from.kind, id: from.id, type: from.type, index: slot, userId: 0, data: WHERE_ITEM, text: from.text,
    };
    const row = bars.items[bar]!;
    row[slot] = shortcut;
    remember(bars, own, data, row, slot, shortcut);
    this.bar.commit();
    this.actions.sendAddItemTaskBar(bar, slot, shortcut);
  }

  /** `lpShortcut->Empty()` and REMOVEITEMTASKBAR for slot `slot` of bar `bar`. */
  private removeItemShortcut(bar: number, slot: number): void {
    const { bars, own, data } = this.bar;
    const row = bars.items[bar]!;
    row[slot] = EMPTY;
    remember(bars, own, data, row, slot, EMPTY);
    this.bar.commit();
    this.actions.sendRemoveItemTaskBar(bar, slot);
  }

  /** The skills of the action slot's slots, for the placement rules: `null` for an empty one or past `m_nCurQueueNum`. */
  private queueSkills(): Array<WebSkill | null> {
    const { queue, queueCount } = this.bar.bars;
    return queue.map((shortcut, i) =>
      (i < queueCount && shortcut.kind === ShortcutKind.SKILL ? this.skillOf(shortcut.id) ?? null : null));
  }

  /**
   * `CWndTaskBar::SetSkillQueue( nIndex, 0, dwId )` (`WndTaskBar.cpp:1787-1872`): the job skill of skill slot `skillIndex`
   * into slot `at` of the action slot; true where it went. Not while the chain runs (`m_nExecute`), nor into a full action
   * slot. An empty slot under `m_nCurQueueNum` is an error, and the action slot is emptied first (:1793-1803). A skill of
   * level 0 is refused; one with a cool-down at its level is refused with `TID_GAME_SKILLLNOTUSE` (:1819-1830); then the
   * place must take its combo style (`canPlaceInQueue`). Past the last skill it goes after it; on a skill, in front of it,
   * the rest moved on (copied as they are: Neuz leaves their `m_dwIndex`). Then SKILLTASKBAR with the 5 slots.
   */
  private setSkillQueue(at: number, skillIndex: number, text: string): boolean {
    if (this.actions.queueRunning()) return false;
    const bars = this.bar.bars;
    if (bars.queueCount >= MAX_SLOT_QUEUE) return false;
    if (bars.queue.slice(0, bars.queueCount).some((shortcut) => shortcut.kind === ShortcutKind.NONE)) {
      bars.queue = bars.queue.map(() => EMPTY);
      bars.queueCount = 0;
    }
    const slot = this.bar.own?.skills[skillIndex];
    const skill = this.skillOf(skillIndex);
    // GetSkill( 0, dwId ) and its prop: a slot the catalog has nothing for is one Neuz would read through a null pointer
    if (slot === undefined || skill === undefined || slot.level <= 0) return false;
    const cooldown = skill.levels[slot.level - 1]?.cooldown;
    if (cooldown !== undefined && cooldown > 0) {
      this.say('TID_GAME_SKILLLNOTUSE', skill.name);
      return false;
    }
    if (!canPlaceInQueue(this.queueSkills(), at, skill, slot.level)) return false;
    const index = Math.min(at, bars.queueCount);
    for (let i = bars.queueCount; i > index; i--) bars.queue[i] = bars.queue[i - 1]!;
    bars.queue[index] = { kind: ShortcutKind.SKILL, id: skillIndex, type: 0, index, userId: 0, data: WHERE_QUEUE, text };
    bars.queueCount++;
    this.bar.commit();
    this.sendQueue();
    return true;
  }

  /**
   * `CWndTaskBar::RemoveSkillQueue( nIndex, bSend )` (`WndTaskBar.cpp:1446-1472`): not while the chain runs. The skill of
   * slot `index` goes out, the ones after it move one slot on (each its new `m_dwIndex`), and as long as the skill taken out
   * could not have stood where it was in the new order (`CheckAddSkill( dwComboStyleSrc, nIndex )`), the one now there goes
   * out too: taking out Clean Hit, the first, empties the action slot. Then SKILLTASKBAR, unless `send` is false, sent also
   * when there was nothing to take out, as Neuz sends it.
   */
  private removeSkillQueue(index: number, send = true): void {
    if (this.actions.queueRunning()) return;
    const bars = this.bar.bars;
    while (index < MAX_SLOT_QUEUE && bars.queue[index]!.kind !== ShortcutKind.NONE) {
      const style = this.skillOf(bars.queue[index]!.id)?.comboStyle ?? 0;
      for (let i = index; i < MAX_SLOT_QUEUE - 1; i++) bars.queue[i] = { ...bars.queue[i + 1]!, index: i };
      bars.queue[MAX_SLOT_QUEUE - 1] = EMPTY;
      bars.queueCount = Math.max(0, bars.queueCount - 1);
      if (checkAddSkill(this.queueSkills(), style, index)) break;
    }
    this.bar.commit();
    if (send) this.sendQueue();
  }

  /** SKILLTASKBAR: the action slot's 5 slots, every one of them (`SendSkillTaskBar`, `DPClient.cpp:10972-10989`). */
  private sendQueue(): void {
    this.actions.sendSkillTaskBar(this.bar.bars.queue.map((shortcut) => (shortcut.kind === ShortcutKind.NONE ? null : shortcut)));
  }

  /** A line of the server messages: the text `id` with `args` (`PutString( str, NULL, prj.GetTextColor( id ) )`). */
  private say(id: string, ...args: string[]): void {
    const entry = this.bar.data.texts?.get(id);
    if (entry === undefined || entry.text === '') return;
    this.actions.say(formatText(entry.text, args), entry.color ?? 0xffffffff);
  }
}

// The V15 boxes of a bag item put on the ground (2026-11-20, mouse-drag-ui), in place of the bag's plain HTML box:
//
//   CWndWorld::OnDropIcon         _Interface/WndWorld.cpp:7765-7926   the checks, then which box opens (`dropRefusal`)
//   CWndDropItem                  _Interface/WndField.cpp:87-205      APP_DROP_ITEM (resdata.inc:28161), a stack: the count
//                                                                     box filled with the whole stack, kept to it, OK or
//                                                                     Enter sends, centred
//   CWndDropConfirm               WndField.cpp:211-288                APP_DROP_CONFIRM (resdata.inc:3215), one item: Yes/No,
//                                                                     Yes or Enter drops 1
//   CWndQuestItemWarning          WndField.cpp:395-471                APP_QUEITMWARNING (resdata.inc:23229), a quest item:
//                                                                     the warning first, Yes opens one of the two above
//   ::Process (__DROP_CONFIRM_BUG) WndField.cpp:175-183, 266-274      each box goes once the item is in use (GetExtra)
//
// None is modal (InitDialog with no WBS_MODAL). On a phone the same windows open in the middle over the bag, and the count
// is typed on the game's number pad (`padField`).

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { padField } from './amountBox';
import { isPhone } from './numpad';
import { ResWindow } from './resWindow';
import type { ResControl, ResLayout } from './resWindow';

const EDIT = 'WndEditTile00.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter: 72 });

/** APP_DROP_ITEM "WndTile02.tga" 272 x 160 (resdata.inc:28161-28217); texts IDS_RESDATA_INC_003564-003575. */
export const DROP_ITEM: ResLayout = {
  title: 'Drop confirmation', width: 272, height: 160,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [46, 14, 232, 36], text: 'Really drop this item?' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [40, 52, 84, 74], text: 'Qty' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [92, 52, 218, 72], tile: EDIT, maxLength: 10 },
    button('WIDC_CANCEL', [140, 90, 212, 110], 'ButtCancel.tga', 'Cancel'),
    button('WIDC_OK', [44, 90, 116, 110], 'ButtOk.tga', 'OK'),
  ],
};

/** APP_DROP_CONFIRM "WndTile08.tga" 272 x 160 (resdata.inc:3215-3253); texts IDS_RESDATA_INC_000360-000367. */
export const DROP_CONFIRM: ResLayout = {
  title: 'Drop Item Confirmation', width: 272, height: 160,
  controls: [
    button('WIDC_YES', [44, 88, 116, 108], 'ButtOk.tga', 'OK'),
    button('WIDC_NO', [142, 88, 214, 108], 'ButtCancel.tga', 'Cancel'),
    { kind: 'static', id: 'WIDC_STATIC1', rect: [48, 10, 210, 28], text: 'Really drop this item?' },
  ],
};

/** APP_QUEITMWARNING "WndTile00.tga" 320 x 160 (resdata.inc:23229-23275); its words TID_GAME_QUEITMWARNING. */
export const QUEST_ITEM_WARNING: ResLayout = {
  title: 'Warning', width: 320, height: 160,
  controls: [
    { kind: 'edit', id: 'WIDC_CONTEXT', rect: [72, 8, 300, 88], tile: EDIT, readOnly: true },
    button('WIDC_BTN_YES', [72, 96, 144, 116], 'ButtYes.tga', 'Yes'),
    button('WIDC_BTN_NO', [164, 96, 236, 116], 'ButtNo.tga', 'No'),
    { kind: 'static', id: 'WIDC_WARNING', rect: [8, 18, 72, 82], picture: 'WndQueItmwarning.tga' },
  ],
};

/** `IK3_CLOAK`, `IK3_QUEST` (Resource/defineItemkind.h:92, :118); `IP_FLAG_UNDESTRUCTABLE` (_Common/ProjectCmn.h:226). */
const IK3_CLOAK = 24;
const IK3_QUEST = 43;
const IP_FLAG_UNDESTRUCTABLE = 0x02;

/** What `OnDropIcon` does with a bag item dropped on the world: a line to say, nothing (`SetForbid`), or a box. */
export type DropStart =
  | { kind: 'say'; tid: string }
  | { kind: 'none' }
  | { kind: 'quest' | 'confirm' | 'count' };

/**
 * `CWndWorld::OnDropIcon`'s item checks in its order (WndWorld.cpp:7860-7926): a guild cloak goes nowhere, a charged item
 * (`IsCharged`: `m_bCharged` or a premium element stone, Item.cpp:323-329) says TID_GAME_NOTDROP, an item in use goes
 * nowhere, an undestructable one says TID_GAME_ERROR_UNDESTRUCTABLE_ITEM; then a quest item's warning, one item's Yes/No,
 * or a stack's count box.
 */
export function dropStart(item: InventoryItem, prop: WebItemProp | undefined, inUse: boolean): DropStart {
  if (prop?.kind3 === IK3_CLOAK && (item.guildId ?? 0) !== 0) return { kind: 'none' };
  if (item.charged === 1 || (item.resistSMItemId ?? 0) !== 0) return { kind: 'say', tid: 'TID_GAME_NOTDROP' };
  if (inUse) return { kind: 'none' };
  if (((prop?.flag ?? 0) & IP_FLAG_UNDESTRUCTABLE) !== 0) return { kind: 'say', tid: 'TID_GAME_ERROR_UNDESTRUCTABLE_ITEM' };
  if (prop?.kind3 === IK3_QUEST) return { kind: 'quest' };
  return { kind: item.count === 1 ? 'confirm' : 'count' };
}

/**
 * The count box's rule each frame (`CWndDropItem::OnDraw`, WndField.cpp:94-130, the same in CWndConfirmSell): one item is
 * "1"; more than the stack is the stack; any letter that is not a digit in the first 8 makes it the stack again. An empty
 * box stays empty (0: OK sends nothing).
 */
export function keptCount(text: string, stack: number): string {
  if (stack === 1) return '1';
  if (/[^0-9]/.test(text.slice(0, 8))) return String(stack);
  const number = Number.parseInt(text, 10);
  if (Number.isFinite(number) && number > stack) return String(stack);
  return text;
}

/** What the boxes ask the bag: the item now (gone: undefined), whether it is in use, and the send (`SendDropItem`). */
export interface DropTarget {
  item(): InventoryItem | undefined;
  inUse(): boolean;
  send(count: number): void;
  /** The quest warning's words (TID_GAME_QUEITMWARNING). */
  questText(): string;
}

/** The three boxes; one is open at a time (a new drop puts the last one away, as `SAFE_DELETE` would). */
export class DropWindows {
  private readonly count: ResWindow;
  private readonly confirm: ResWindow;
  private readonly quest: ResWindow;
  private target: DropTarget | null = null;
  private stack = 0;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.count = this.make(DROP_ITEM, 'hud-drop-item');
    this.confirm = this.make(DROP_CONFIRM, 'hud-drop-confirm');
    this.quest = this.make(QUEST_ITEM_WARNING, 'hud-quest-item-warning');
    const input = this.count.input('WIDC_EDIT1');
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', 'Drop quantity');
    input.addEventListener('input', () => {
      const kept = keptCount(input.value, this.stack);
      if (kept !== input.value) input.value = kept;
    });
    // EN_RETURN sends, as OK (WndField.cpp:186)
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); this.sendCount(); } });
    padField(input, art, doc, () => ({ max: this.stack, min: 1, label: 'Qty', title: DROP_ITEM.title }));
    this.count.button('WIDC_OK').addEventListener('click', () => this.sendCount());
    this.count.button('WIDC_CANCEL').addEventListener('click', () => this.count.close());
    this.confirm.button('WIDC_YES').addEventListener('click', () => this.sendOne());
    this.confirm.button('WIDC_NO').addEventListener('click', () => this.confirm.close());
    this.quest.button('WIDC_BTN_YES').addEventListener('click', () => this.afterWarning());
    this.quest.button('WIDC_BTN_NO').addEventListener('click', () => this.quest.close());
    // Enter on the Yes/No boxes is their Yes (EN_RETURN, :281, :455)
    for (const [box, yes] of [[this.confirm, () => this.sendOne()], [this.quest, () => this.afterWarning()]] as const) {
      box.frame.element.tabIndex = -1;
      box.frame.element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        yes();
      });
    }
  }

  private make(layout: ResLayout, className: string): ResWindow {
    const box = new ResWindow(layout, this.art, this.doc);
    box.frame.element.classList.add('hud-drop-window', className);
    box.frame.element.setAttribute('role', 'dialog');
    // on a phone over the bag and its panels (frame.ts `overBag`)
    box.frame.overBag = true;
    return box;
  }

  /** The window that is open, if one is. */
  get open(): ResWindow | null {
    return [this.count, this.confirm, this.quest].find((box) => box.isOpen) ?? null;
  }

  /** Opens the box `kind` names for `target`, in the windows' `layer`, centred (`MoveParentCenter`). */
  start(kind: 'quest' | 'confirm' | 'count', target: DropTarget, layer: Element): void {
    this.close();
    this.target = target;
    for (const box of [this.count, this.confirm, this.quest]) {
      if (box.element.parentElement !== layer) layer.append(box.element);
    }
    if (kind === 'quest') {
      this.quest.control('WIDC_CONTEXT').textContent = target.questText();
      this.quest.open();
      this.quest.frame.element.focus({ preventScroll: true });
      return;
    }
    this.show(kind);
  }

  private show(kind: 'confirm' | 'count'): void {
    const item = this.target?.item();
    if (item === undefined) return;
    if (kind === 'confirm') {
      this.confirm.open();
      this.confirm.frame.element.focus({ preventScroll: true });
      return;
    }
    // the edit filled with the whole stack and focused, OK the default (OnInitialUpdate, WndField.cpp:131-157)
    this.stack = item.count;
    const input = this.count.input('WIDC_EDIT1');
    input.value = String(item.count);
    this.count.open();
    if (!isPhone(this.doc)) {
      input.focus({ preventScroll: true });
      input.select();
    }
  }

  /** Yes on the quest warning: one item's box or the stack's (WndField.cpp:455-473). */
  private afterWarning(): void {
    if (!this.quest.isOpen) return;
    const item = this.target?.item();
    this.quest.close();
    if (item === undefined) return;
    this.show(item.count === 1 ? 'confirm' : 'count');
  }

  /** OK or Enter on the count box: `atoi` of the box, sent when not 0 (WndField.cpp:186-199). */
  private sendCount(): void {
    if (!this.count.isOpen) return;
    const input = this.count.input('WIDC_EDIT1');
    const count = Number.parseInt(keptCount(input.value, this.stack), 10) || 0;
    const target = this.target;
    this.count.close();
    if (count > 0) target?.send(count);
  }

  /** Yes or Enter on the one item's box: 1 sent (WndField.cpp:279-284). */
  private sendOne(): void {
    if (!this.confirm.isOpen) return;
    const target = this.target;
    this.confirm.close();
    target?.send(1);
  }

  /** Each frame: a box goes once its item is in use or gone (`Process`, `__DROP_CONFIRM_BUG`). */
  check(): void {
    if (this.target === null || this.open === null) return;
    if (this.target.item() === undefined || this.target.inUse()) this.close();
  }

  close(): void {
    for (const box of [this.count, this.confirm, this.quest]) box.close();
  }

  dispose(): void {
    for (const box of [this.count, this.confirm, this.quest]) box.dispose();
  }
}

// The item boxes that ask before a use or an upgrade (2026-11-05, docs/superpowers/specs/2026-11-05-ui-fixes-research.md
// §3), each its own resdata.inc window as Neuz draws it, where the web client showed its message box:
//
//   Box                      Neuz class (file:lines)                          opened for
//   APP_COMMITEM_DIALOG      CWndCommItemDlg (WndField.cpp:12878-12991)       the protection and smelting scrolls, the batteries,
//                                                                             a ticket in its world, Re-Skill, Blessing
//   APP_RESTATE_CONFIRM      CWndRestateConfirm (WndField.cpp:25428-25525)    the Re-Stat scrolls (the bag's; YES only while the
//                                                                             bag is open)
//   APP_SMELT_SAFETY_CONFIRM CWndSmeltSafetyConfirm (WndField.cpp:25236-25311) the upgrade cursor on a +3 item (YES only while
//                                                                             the bag is open; any close ends the upgrade mode)
//   APP_RANDOMSCROLL_CONFIRM CWndRandomScrollConfirm (WndField.cpp:290-385)   the random option scroll, after its 4 s wait
//   APP_FUNNYCOIN_CONFIRM    CWndFunnyCoinConfirm (WndField.cpp:23556-23620)  a Funny Coin
//   APP_CONFIRM_ENTER        CWndConfirmVis (WndPetSys.cpp:2848-2989)         Awakening Protection: modal, Enter is OK
//
// Every box is centred, a new one replaces the one open (`SAFE_DELETE`), its close button and Escape answer nothing.

import type { UiArt } from '../hud/art';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import {
  COMM_ITEM, CONFIRM_VIS, FUNNY_COIN_CONFIRM, RANDOM_SCROLL_CONFIRM, RESTATE_CONFIRM, SMELT_SAFETY_CONFIRM,
} from './itemWindowLayouts';

/** A box's controls: where its words go, and its two buttons. */
interface BoxSpec {
  layout: ResLayout;
  text: string;
  ok: string;
  cancel: string;
  /** The answers count only while the bag is open (`GetWndBase( APP_INVENTORY )`). */
  needsBag?: boolean;
  /** Enter is OK (CWndConfirmVis's hidden edit). */
  enter?: boolean;
}

const BOXES = {
  commItem: { layout: COMM_ITEM, text: 'WIDC_EDIT_COMMUSE', ok: 'WIDC_BUTTON_OK', cancel: 'WIDC_BUTTON_CANCEL' },
  restate: { layout: RESTATE_CONFIRM, text: 'WIDC_RESTATE_CONFIRM_TEXT', ok: 'WIDC_RESTATE_CONFIRM_YES', cancel: 'WIDC_RESTATE_CONFIRM_NO', needsBag: true },
  smeltSafety: { layout: SMELT_SAFETY_CONFIRM, text: 'WIDC_CONFIRM_TEXT', ok: 'WIDC_SMELT_YES', cancel: 'WIDC_SMELT_NO', needsBag: true },
  randomScroll: { layout: RANDOM_SCROLL_CONFIRM, text: 'WIDC_TEXT1', ok: 'WIDC_YES', cancel: 'WIDC_NO' },
  funnyCoin: { layout: FUNNY_COIN_CONFIRM, text: 'WIDC_TEXT1', ok: 'WIDC_YES', cancel: 'WIDC_NO' },
  confirmVis: { layout: CONFIRM_VIS, text: 'WIDC_TEXT1', ok: 'WIDC_BUTTON1', cancel: 'WIDC_BUTTON2', enter: true },
} satisfies Record<string, BoxSpec>;

export type BoxKind = keyof typeof BOXES;

/** The box a text asks in: by its TID, as Neuz's callers pick the class. */
export function boxOf(tid: string): BoxKind {
  if (tid.startsWith('TID_TOOLTIP_RESTATE_') || /^TID_GAME_RESTATE_\w+_LOW_CONFIRM$/.test(tid)) return 'restate';
  if (tid.startsWith('TID_GAME_SMELT_SAFETY_CONFIRM_')) return 'smeltSafety';
  if (tid.startsWith('TID_GAME_RANDOMSCROLL_CONFIRM')) return 'randomScroll';
  if (tid === 'TID_GAME_FUNNYCOIN_ASKUSE') return 'funnyCoin';
  if (tid === 'TID_GAME_REGARDLESS_USE01') return 'confirmVis';
  return 'commItem';
}

/** What a box's answers do: OK (or Yes), the Cancel (or No) button, and any close without OK (Cancel's too). */
export interface BoxAnswers {
  ok: () => void;
  cancel?: () => void;
  closed?: () => void;
}

export class ConfirmBoxes {
  private readonly windows = new Map<BoxKind, ResWindow>();
  private open_: { kind: BoxKind; answers: BoxAnswers; answered: boolean } | null = null;

  constructor(
    private readonly art: UiArt,
    private readonly layer: () => HTMLElement | null,
    private readonly bagOpen: () => boolean = () => true,
    private readonly doc: Document = document,
  ) {}

  /** A box is open. */
  get isOpen(): boolean {
    return this.open_ !== null;
  }

  /** The kind of the box open, or null. */
  get openKind(): BoxKind | null {
    return this.open_?.kind ?? null;
  }

  /**
   * Opens the box `kind` with `text` (its catalog "\n" already line breaks), replacing any box open; centred on the layer,
   * or on `parent` (2026-11-09, pets B1: `MoveParentCenter` of a box made with a parent window, the buff pet window's
   * `CWndConfirmVis`, WndPetSys.cpp:2718, :2927-2931). 2026-11-09 (pets review): it gives this box's close, for a parent
   * window that goes (its child deleted with it), which does nothing once the box has gone or another took its place.
   */
  open(kind: BoxKind, text: string, answers: BoxAnswers, parent?: { x: number; y: number; width: number; height: number }): () => void {
    if (this.open_ !== null) {
      // SAFE_DELETE of the box before: it goes without its answers
      const old = this.open_;
      this.open_ = null;
      this.windows.get(old.kind)?.close();
    }
    const window = this.window(kind);
    window.setText(BOXES[kind].text, text);
    const opened = { kind, answers, answered: false };
    this.open_ = opened;
    const { width, height } = BOXES[kind].layout;
    window.open(parent === undefined ? 'center'
      : { x: parent.x + (parent.width - width) / 2, y: parent.y + (parent.height - height) / 2 });
    return () => { if (this.open_ === opened) window.close(); };
  }

  /** Closes the box open, as its close button does. */
  close(): void {
    if (this.open_ !== null) this.windows.get(this.open_.kind)?.close();
  }

  dispose(): void {
    this.open_ = null;
    for (const window of this.windows.values()) window.dispose();
    this.windows.clear();
  }

  private window(kind: BoxKind): ResWindow {
    let window = this.windows.get(kind);
    if (window === undefined) {
      const spec: BoxSpec = BOXES[kind];
      const made = new ResWindow(spec.layout, this.art, this.doc);
      made.frame.element.dataset.box = kind;
      made.onClose = () => {
        const open = this.open_;
        if (open === null || open.kind !== kind) return;
        this.open_ = null;
        open.answers.closed?.();
      };
      const answer = (yes: boolean): void => {
        const open = this.open_;
        if (open === null || open.kind !== kind) return;
        if (spec.needsBag === true && !this.bagOpen()) return;
        if (yes) open.answers.ok();
        else open.answers.cancel?.();
        // the answer may have opened another box in this one's place
        if (this.open_ === open) made.close();
      };
      made.button(spec.ok).addEventListener('click', () => answer(true));
      made.button(spec.cancel).addEventListener('click', () => answer(false));
      if (spec.enter === true) {
        // ahead of the modal backdrop's hold (it listens from each opening on, this from the box's making)
        (this.doc.defaultView ?? globalThis).addEventListener('keydown', (event: Event) => {
          if (!(event instanceof KeyboardEvent)) return;
          if (event.key !== 'Enter' || this.open_?.kind !== kind) return;
          event.preventDefault();
          answer(true);
        }, true);
      }
      this.windows.set(kind, made);
      window = made;
    }
    const layer = this.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
    return window;
  }
}

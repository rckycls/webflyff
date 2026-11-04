// The task bar's gestures for its edits (spec §3.11): the mouse's drag of a shortcut, its picture at the pointer
// (`m_GlobalShortcut`), let go on the bar or off it; and a finger's long press on a slot, which offers to take its shortcut
// off with a line, Remove. The edits themselves are `taskBarEdits.ts`'; the bar (`TaskBar`) wires the slots to these.
//
//   CWndTaskBar::OnMouseMove ...   _Interface/WndTaskBar.cpp:2143-2188  a slot dragged, or pressed (OnLButtonUp)
//   CWndSkillTreeEx::OnMouseMove   _Interface/WndField.cpp:7438-7463    a skill of the skill window dragged
//   CNeuzApp::Render               Neuz/Neuz.cpp:823-824                the carried shortcut's picture, 16 px up and left
//   CWndBase::WindowProc           _Interface/WndBase.cpp:1000-1037     the drop: `OnDropIcon` of the window under the mouse,
//                                                                       or of the bar holding it since the press
//
// The long press is not Neuz's, which has no touch.

import type { Carried, DropTarget } from './taskBarEdits';
import type { UiArt } from './art';

/**
 * How far the mouse goes with its button down before a press on a slot becomes a drag. Neuz drags at the first move
 * (`OnMouseMove`); a few pixels let a press whose mouse shakes stay a press.
 */
const DRAG_START = 4;
/** The carried shortcut's picture: 16 px up and left of the pointer (`point.x - 16, point.y - 16`). */
const PICTURE_OFFSET = 16;
/** A finger held on a slot this long (ms), and moved no more than `LONG_PRESS_SLOP` px, offers to take its shortcut off. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/** A finger's press (or a pen's): jsdom's mouse events under the pointer events' names carry no `pointerType`, a mouse's. */
export const byFinger = (event: Event): boolean => {
  const type = (event as { pointerType?: string }).pointerType;
  return type === 'touch' || type === 'pen';
};

/** What the gestures ask of the bar. */
export interface SlotGestureHost {
  /** The bar's strip, whose slots a drag may end on (`.hud-slot[data-row]`); the rest of it is the bar's empty part. */
  readonly strip: HTMLElement;
  /** Where the drag's picture and the long press's line go: the bar's holder. */
  readonly holder: HTMLElement;
  /** The picture key of what `carried` stands for (null for none), or undefined when it stands for nothing: no drag. */
  pictureOf(carried: Carried): string | null | undefined;
  /** A drag let go on `target` (`OnDropIcon`). */
  drop(carried: Carried, target: DropTarget): void;
  /** The click that comes next on a slot is not a press on it. */
  swallowClick(): void;
  /** The long press's Remove on slot `slot` of `row`. */
  remove(row: 'item' | 'queue', slot: number): void;
  /** Where the long press's line goes for slot `slot` of `row`: its left and bottom in the holder, in CSS px. */
  menuAt(row: 'item' | 'queue', slot: number): { left: number; bottom: number };
  /** The drag began or ended: the rows it may go to are lit or put out. */
  changed(): void;
}

/** A press on a slot that may become a drag: what it carries, the pointer and where it went down; `ghost` once dragged. */
interface Drag {
  carried: Carried;
  pointerId: number;
  x: number;
  y: number;
  ghost: HTMLElement | null;
}

/** The mouse's drag and the finger's long press on the bar's slots. */
export class SlotGestures {
  private readonly view: Window;
  /** The long press's line over a slot, and the slot it is about. */
  private readonly slotMenu: HTMLElement;
  private readonly removeLine: HTMLButtonElement;
  private menuFor: { row: 'item' | 'queue'; slot: number } | null = null;
  /** A press on a slot or a skill that may become a drag, or the drag (`m_GlobalShortcut` with a mouse). */
  private drag: Drag | null = null;
  /** A finger held on a slot, until `LONG_PRESS_MS`. */
  private hold: { timer: ReturnType<typeof setTimeout>; pointerId: number; x: number; y: number } | null = null;

  constructor(private readonly art: UiArt, private readonly host: SlotGestureHost, private readonly doc: Document) {
    this.view = doc.defaultView ?? window;
    this.slotMenu = doc.createElement('div');
    this.slotMenu.className = 'hud-slot-menu';
    this.slotMenu.setAttribute('role', 'menu');
    this.slotMenu.hidden = true;
    this.removeLine = doc.createElement('button');
    this.removeLine.type = 'button';
    this.removeLine.className = 'hud-slot-menu-line';
    this.removeLine.setAttribute('role', 'menuitem');
    this.removeLine.tabIndex = -1;
    this.removeLine.addEventListener('mousedown', (event) => event.preventDefault());
    this.removeLine.addEventListener('click', () => {
      const at = this.menuFor;
      this.closeMenu();
      if (at !== null) this.host.remove(at.row, at.slot);
    });
    this.slotMenu.append(this.removeLine);
  }

  /** The long press's line, which the bar puts in its holder. */
  get menu(): HTMLElement {
    return this.slotMenu;
  }

  /** What a drag carries once the mouse has moved (its picture at the pointer), or null. */
  get dragged(): Carried | null {
    return this.drag !== null && this.drag.ghost !== null ? this.drag.carried : null;
  }

  /** A finger is held on a slot, or the long press's line is open: a `contextmenu` then is the long press's. */
  get holding(): boolean {
    return this.hold !== null || this.menuFor !== null;
  }

  /** The long press's line's text (`TID_MMI_GHOUSE_RECALL`, "Remove"). */
  setRemoveText(text: string): void {
    if (this.removeLine.textContent !== text) this.removeLine.textContent = text;
  }

  /** A press that carries `carried` once the mouse moves `DRAG_START` px with its button down; let go before, it is a press. */
  press(carried: Carried, event: PointerEvent): void {
    if (event.button !== 0) return;
    this.endDrag();
    this.drag = { carried, pointerId: event.pointerId ?? 0, x: event.clientX, y: event.clientY, ghost: null };
    this.view.addEventListener('pointermove', this.onDragMove);
    this.view.addEventListener('pointerup', this.onDragUp);
    this.view.addEventListener('pointercancel', this.onDragCancel);
  }

  /** A finger goes down on slot `i` of `row`, which holds a shortcut: held `LONG_PRESS_MS`, the slot's line opens. */
  startHold(event: PointerEvent, row: 'item' | 'queue', i: number): void {
    this.cancelHold();
    const timer = setTimeout(() => {
      this.hold = null;
      this.removeHoldListeners();
      // the click of the finger's lift is not a press on the slot
      this.host.swallowClick();
      this.openMenu(row, i);
    }, LONG_PRESS_MS);
    this.hold = { timer, pointerId: event.pointerId ?? 0, x: event.clientX, y: event.clientY };
    this.view.addEventListener('pointermove', this.onHoldMove);
    this.view.addEventListener('pointerup', this.onHoldEnd);
    this.view.addEventListener('pointercancel', this.onHoldEnd);
  }

  /** Closes the long press's line. */
  closeMenu(): void {
    if (this.menuFor === null) return;
    this.menuFor = null;
    this.slotMenu.hidden = true;
    this.doc.removeEventListener('pointerdown', this.onPressOutsideMenu, true);
  }

  /** Ends a drag, a long press and its line. */
  dispose(): void {
    this.endDrag();
    this.cancelHold();
    this.closeMenu();
  }

  /** The drag: the shortcut's picture at the pointer, 16 px up and left of it (`CNeuzApp::Render`, `Neuz.cpp:823-824`). */
  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    if (drag.ghost === null) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START) return;
      const picture = this.host.pictureOf(drag.carried);
      if (picture === undefined) {
        this.endDrag();
        return;
      }
      const ghost = this.doc.createElement('div');
      ghost.className = 'hud-carried';
      if (picture !== null) ghost.style.backgroundImage = `url(${JSON.stringify(this.art.url(picture))})`;
      this.host.holder.append(ghost);
      drag.ghost = ghost;
      this.host.changed();
    }
    drag.ghost.style.left = `${event.clientX - PICTURE_OFFSET}px`;
    drag.ghost.style.top = `${event.clientY - PICTURE_OFFSET}px`;
  };

  /** The button let go: a drag ends on what is under the pointer (`OnDropIcon`); a press that never moved is a press. */
  private readonly onDragUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    const dragged = drag.ghost !== null;
    this.endDrag();
    if (!dragged) return;
    const target = this.targetOf(event.target);
    // a slot dragged back onto itself gets the click of the button let go: it is not a press (a drag that ends anywhere
    // else makes its click on an element both ends share, none of the slots)
    const { carried } = drag;
    if (typeof target === 'object' && target !== null && carried.from !== 'skills' && carried.from === target.row &&
      carried.slot === target.slot) {
      this.host.swallowClick();
    }
    this.host.drop(carried, target);
  };

  private readonly onDragCancel = (event: PointerEvent): void => {
    if (this.drag !== null && (event.pointerId ?? 0) === this.drag.pointerId) this.endDrag();
  };

  private endDrag(): void {
    const drag = this.drag;
    if (drag === null) return;
    this.drag = null;
    drag.ghost?.remove();
    this.view.removeEventListener('pointermove', this.onDragMove);
    this.view.removeEventListener('pointerup', this.onDragUp);
    this.view.removeEventListener('pointercancel', this.onDragCancel);
    this.host.changed();
  }

  /** What an element under the pointer is to the bar: a slot of a row, the applet row, the rest of the bar, or off it. */
  private targetOf(target: EventTarget | null): DropTarget {
    const element = target as Element | null;
    if (element === null || typeof element.closest !== 'function' || !this.host.strip.contains(element)) return null;
    const slot = element.closest<HTMLElement>('.hud-slot[data-row]');
    const row = slot?.dataset.row;
    if ((row === 'item' || row === 'queue' || row === 'applet') && slot !== null && slot !== undefined) return { row, slot: Number(slot.dataset.slot) };
    return 'bar';
  }

  private readonly onHoldMove = (event: PointerEvent): void => {
    const hold = this.hold;
    if (hold === null || (event.pointerId ?? 0) !== hold.pointerId) return;
    if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > LONG_PRESS_SLOP) this.cancelHold();
  };

  private readonly onHoldEnd = (event: PointerEvent): void => {
    if (this.hold !== null && (event.pointerId ?? 0) === this.hold.pointerId) this.cancelHold();
  };

  private cancelHold(): void {
    if (this.hold === null) return;
    clearTimeout(this.hold.timer);
    this.hold = null;
    this.removeHoldListeners();
  }

  private removeHoldListeners(): void {
    this.view.removeEventListener('pointermove', this.onHoldMove);
    this.view.removeEventListener('pointerup', this.onHoldEnd);
    this.view.removeEventListener('pointercancel', this.onHoldEnd);
  }

  /**
   * The long press's line, Remove, above slot `i` of `row` (at the bar's scale), until it is pressed or a press lands
   * elsewhere. Its line is a finger's (the style sheet's 44 px).
   */
  private openMenu(row: 'item' | 'queue', i: number): void {
    const { left, bottom } = this.host.menuAt(row, i);
    this.menuFor = { row, slot: i };
    this.slotMenu.style.left = `${left}px`;
    this.slotMenu.style.bottom = `${bottom}px`;
    this.slotMenu.dataset.row = row;
    this.slotMenu.dataset.slot = String(i);
    this.slotMenu.hidden = false;
    this.doc.addEventListener('pointerdown', this.onPressOutsideMenu, true);
  }

  private readonly onPressOutsideMenu = (event: Event): void => {
    const target = event.target as Node | null;
    if (target !== null && this.slotMenu.contains(target)) return;
    this.closeMenu();
  };
}

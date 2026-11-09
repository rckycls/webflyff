// The buff pet's window (pets B1, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §4.2): `CWndBuffPetStatus`, APP_BUFFPET_STATUS, laid out from its
// resdata.inc entry (`ResWindow`) and drawn as its `OnDraw` draws it. What it does with its slots is
// pets/buffPetWindows.ts's.
//
//   APP_BUFFPET_STATUS                  Resource/resdata.inc:2693-2800           "WndTile00.tga" tiled, 192 x 128, the face
//                                                                                box and the nine slots (WndElemItemBlank.tga,
//                                                                                drawn in the window's own picture,
//                                                                                `AdditionalSkinTexture`, under all else)
//   CWndBuffPetStatus::OnInitialUpdate  _Interface/WndPetSys.cpp:2212-2258       beside APP_STATUS1 (or at its left when the
//                                                                                world's right is passed), else at the
//                                                                                layout's left + 192, top; the slots' ids;
//                                                                                "BuffpetStatusBg .tga"
//   CWndBuffPetStatus::OnDraw           WndPetSys.cpp:2282-2437                  the slots, then (once the pet's model is
//                                                                                had) the picture at the face box's left - 12
//                                                                                and top - 22, then the model
//   CWndBuffPetStatus::Process          WndPetSys.cpp:2439-2467                  the title, the pet mover's name, once
//   CWndBuffPetStatus::DrawSlotItems    WndPetSys.cpp:2654-2705                  none without the pet item, or past MAX_VIS
//                                                                                slots; an open slot's vis icon, white when
//                                                                                it works, else ARGB 0x4f; a closed one
//                                                                                Icon_Lock.dds
//   CWndBuffPetStatus::GetSlotIndexByPoint WndPetSys.cpp:2723-2737              the slot under the pointer
//   CWndBuffPetStatus::OnLButtonDown    WndPetSys.cpp:2739-2768                  a vis picked up (a drag)
//   CWndBuffPetStatus::OnLButtonDblClk  WndPetSys.cpp:2770-2786                  a vis to take out
//   CWndBuffPetStatus::OnDropIcon       WndPetSys.cpp:2476-2528                  an open slot takes a drop
//   CWndBuffPetStatus::OnMouseWndSurface WndPetSys.cpp:2807-2847                 a vis's tooltip
//   CWndWorld::OnDropIcon               _Interface/WndWorld.cpp:7929-7937        a vis dropped on the world: take it out
//
// A drag is the browser's (the bag's `application/x-flyff-inventory`, a slot's `application/x-flyff-vis-slot`). On a
// touch screen a double tap is the double-click; the drags are a mouse's.

import { MAX_VIS } from '../pets/buffPet';
import type { UiArt } from './art';
import { themeKey, themeUrl } from './art';
import type { WindowFrame } from './frame';
import { ResWindow } from './resWindow';
import type { ResLayout, ResRect } from './resWindow';

/** The bag's drag (inventoryWindow.ts) and a slot's. */
const BAG_DRAG = 'application/x-flyff-inventory';
const SLOT_DRAG = 'application/x-flyff-vis-slot';
/** Two taps of a finger this near are a double-click (Windows' own double-click time, as buffStatus.ts). */
const DOUBLE_TAP_MS = 500;

/** The slots' rects, `WIDC_BUFFPET_SLOT1` to `9` (`m_nCtrlId[0..8]`, `OnInitialUpdate` :2247-2255). */
const SLOTS: readonly ResRect[] = [
  [80, 2, 112, 34], [112, 2, 144, 34], [144, 2, 176, 34],
  [80, 32, 112, 64], [112, 32, 144, 64], [144, 32, 176, 64],
  [80, 62, 112, 94], [112, 62, 144, 94], [144, 62, 176, 94],
];
const slotId = (i: number): string => `WIDC_BUFFPET_SLOT${i + 1}`;

/** The face box (`WIDC_CUSTOM1`, resdata.inc:2703). */
const FACE: ResRect = [8, 6, 72, 90];

/**
 * APP_BUFFPET_STATUS (`resdata.inc:2693-2800`), its controls in the entry's order; the title is
 * `IDS_RESDATA_INC_006602`, "Buff Pet Status".
 */
export const BUFFPET_STATUS: ResLayout = {
  title: 'Buff Pet Status', width: 192, height: 128,
  controls: [
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: FACE },
    ...[0, 2, 1, 3, 6, 8, 4, 7, 5].map((i) => ({ kind: 'static' as const, id: slotId(i), rect: SLOTS[i]!, picture: 'WndElemItemBlank.tga' })),
  ],
};

/** `0x4fffffff`: a vis that does not work (`DrawSlotItems`, :2685). */
const FADED = 0x4f / 255;

/** What a slot shows: a vis (its icon, faded when it does not work), nothing, or the lock of a closed slot. */
export type SlotView =
  | { kind: 'vis'; icon: string | null; name: string; works: boolean }
  | { kind: 'empty' }
  | { kind: 'locked' };

/** What the window's slots do; the flows' (buffPetWindows.ts). */
export interface BuffPetSlotActions {
  /** A bag item (`objectId`) or another slot's vis dropped on slot `slot` (`OnDropIcon`). */
  drop(slot: number, from: { bag: number } | { slot: number }): void;
  /** Slot `slot`'s vis double-clicked (`OnLButtonDblClk`), or dropped on the world (`CWndWorld::OnDropIcon`). */
  takeOut(slot: number): void;
  /** The pointer on slot `slot` (`OnMouseWndSurface`), or off every slot (null): its tooltip, put by `anchor`. */
  hover(slot: number | null, anchor: HTMLElement | null): void;
}

/**
 * The window. `open` places it as `OnInitialUpdate` does; `update` draws the slots each frame (`DrawSlotItems`), and the
 * picture and title once the pet's model is had (`modelReady`, `setTitle`); the portrait's canvas goes in `portraitBox`.
 */
export class BuffPetStatusWindow {
  readonly window: ResWindow;
  private readonly cells: HTMLElement[] = [];
  private readonly icons: HTMLImageElement[] = [];
  private readonly back: HTMLElement;
  private readonly face: HTMLElement;
  /** The slot whose vis is being dragged (`m_GlobalShortcut.m_dwData`), or null. */
  private dragging: number | null = null;
  private lastTap: { slot: number; at: number } | null = null;
  private shown = '';
  private readonly onDocDragOver = (event: DragEvent): void => {
    if (this.dragging !== null && onWorld(event.target)) event.preventDefault();
  };
  private readonly onDocDrop = (event: DragEvent): void => {
    const slot = this.dragging;
    this.dragging = null;
    if (slot === null || !onWorld(event.target)) return;
    event.preventDefault();
    this.actions.takeOut(slot); // CWndWorld::OnDropIcon (:7930-7936)
  };

  constructor(
    private readonly art: UiArt, private readonly actions: BuffPetSlotActions, private readonly doc: Document = document,
    private readonly now: () => number = () => performance.now(),
  ) {
    const window = new ResWindow(BUFFPET_STATUS, art, doc);
    window.frame.element.classList.add('hud-buffpet-status');
    this.window = window;
    const body = window.frame.body;

    // DrawSlotItems: over the slots' pictures (the window's own), an icon a slot
    SLOTS.forEach(([left, top, right, bottom], i) => {
      const cell = doc.createElement('div');
      cell.className = 'hud-buffpet-slot';
      cell.dataset.slot = String(i);
      place(cell, left, top, right - left, bottom - top);
      const icon = doc.createElement('img');
      icon.alt = '';
      icon.draggable = false;
      icon.hidden = true;
      cell.append(icon);
      this.wire(cell, i);
      body.append(cell);
      this.cells.push(cell);
      this.icons.push(icon);
    });

    // OnDraw: "BuffpetStatusBg .tga" at the face box's left - 12, top - 22 (:2301-2304), then the model in the face box
    const back = doc.createElement('div');
    back.className = 'hud-buffpet-back';
    place(back, FACE[0] - 12, FACE[1] - 22, 192, 128);
    back.style.backgroundImage = themeUrl(art, 'BuffpetStatusBg .tga');
    back.hidden = true;
    body.append(back);
    this.back = back;
    const face = doc.createElement('div');
    face.className = 'hud-buffpet-face';
    place(face, FACE[0], FACE[1], FACE[2] - FACE[0], FACE[3] - FACE[1]);
    face.hidden = true;
    body.append(face);
    this.face = face;

    doc.addEventListener('dragover', this.onDocDragOver);
    doc.addEventListener('drop', this.onDocDrop);
    window.onClose = () => {
      this.dragging = null;
      this.actions.hover(null, null);
    };
  }

  get frame(): WindowFrame {
    return this.window.frame;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** Where the portrait's canvas goes: the face box, over the picture. */
  portraitBox(): HTMLElement {
    return this.face;
  }

  /**
   * `new CWndBuffPetStatus; Initialize()`, then `OnInitialUpdate`'s place (:2221-2245): at the status window's top right
   * when it is open, or at its left when that would pass the world's right (`worldRight`, the world window's client
   * width); else at the layout's left + 192, top. The title is the entry's until the pet's model is had.
   */
  open(status: WindowFrame | null, worldRight: number | null): void {
    this.shown = '';
    this.lastTap = null;
    this.frame.setTitle(BUFFPET_STATUS.title);
    this.modelReady(false);
    let at = { x: 192, y: 0 };
    if (status !== null && status.isOpen) {
      at = { x: status.position.x + status.size.width, y: status.position.y };
      if (worldRight !== null && at.x + BUFFPET_STATUS.width > worldRight) at.x = status.position.x - BUFFPET_STATUS.width;
    }
    this.window.open(at);
  }

  close(): void {
    this.window.close();
  }

  /** `m_strTitle = pMyBuffPet->GetName()` (`Process`, :2458-2459). */
  setTitle(title: string): void {
    this.frame.setTitle(title);
  }

  /** `m_pPetModel` had or not: `OnDraw` draws the picture and the model only with it (:2290-2291). */
  modelReady(ready: boolean): void {
    this.back.hidden = !ready;
    this.face.hidden = !ready;
  }

  /**
   * One frame of `DrawSlotItems` (:2654-2705): `slots` the nine slots' views, or null to draw none (no pet item, or more
   * than `MAX_VIS` slots).
   */
  update(slots: readonly SlotView[] | null): void {
    const key = slots === null ? '' : slots.map((s) => (s.kind === 'vis' ? `${s.icon}:${s.works}` : s.kind)).join('|');
    if (key === this.shown) return;
    this.shown = key;
    for (let i = 0; i < MAX_VIS; i++) {
      const view = slots?.[i];
      const icon = this.icons[i]!, cell = this.cells[i]!;
      cell.dataset.state = view?.kind ?? 'none';
      cell.draggable = view?.kind === 'vis';
      if (view === undefined || view.kind === 'empty' || (view.kind === 'vis' && view.icon === null)) {
        icon.hidden = true;
        continue;
      }
      const src = this.art.url(view.kind === 'locked' ? themeKey('Icon_Lock.dds') : view.icon!);
      if (icon.getAttribute('src') !== src) icon.src = src;
      icon.alt = view.kind === 'vis' ? view.name : '';
      icon.style.opacity = view.kind === 'vis' && !view.works ? String(FADED) : '';
      icon.hidden = false;
    }
  }

  dispose(): void {
    this.doc.removeEventListener('dragover', this.onDocDragOver);
    this.doc.removeEventListener('drop', this.onDocDrop);
    this.window.dispose();
  }

  /** A slot's pointer, drag and drop (`OnLButtonDown`, `OnLButtonDblClk`, `OnDropIcon`, `OnMouseWndSurface`). */
  private wire(cell: HTMLElement, slot: number): void {
    const hasVis = (): boolean => cell.dataset.state === 'vis';
    cell.addEventListener('pointerenter', () => this.actions.hover(slot, cell));
    cell.addEventListener('pointerleave', () => this.actions.hover(null, null));
    cell.addEventListener('dblclick', (event) => {
      event.preventDefault();
      if (hasVis()) this.actions.takeOut(slot);
    });
    cell.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse') return;
      const at = this.now(), last = this.lastTap;
      this.lastTap = { slot, at };
      if (last !== null && last.slot === slot && at - last.at <= DOUBLE_TAP_MS && hasVis()) {
        this.lastTap = null;
        this.actions.takeOut(slot);
      }
    });
    cell.addEventListener('dragstart', (event) => {
      if (!hasVis()) {
        event.preventDefault();
        return;
      }
      this.dragging = slot;
      event.dataTransfer?.setData(SLOT_DRAG, String(slot));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    cell.addEventListener('dragend', () => { this.dragging = null; });
    cell.addEventListener('dragover', (event) => {
      const types = event.dataTransfer?.types ?? [];
      if (types.includes(BAG_DRAG) || types.includes(SLOT_DRAG)) event.preventDefault();
    });
    cell.addEventListener('drop', (event) => {
      const from = this.dragging;
      this.dragging = null;
      const bag = event.dataTransfer?.getData(BAG_DRAG) ?? '';
      if (from !== null) {
        event.preventDefault();
        this.actions.drop(slot, { slot: from });
      } else if (bag !== '' && Number.isFinite(Number(bag))) {
        event.preventDefault();
        this.actions.drop(slot, { bag: Number(bag) });
      }
    });
  }
}

/** A drop on the world's view (the bag's own test, inventoryWindow.ts). */
function onWorld(target: EventTarget | null): boolean {
  return (target as Element | null)?.matches?.('.world-view canvas') === true;
}

/** Puts `element` at (`left`, `top`), `width` x `height`. */
function place(element: HTMLElement, left: number, top: number, width: number, height: number): void {
  Object.assign(element.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
}

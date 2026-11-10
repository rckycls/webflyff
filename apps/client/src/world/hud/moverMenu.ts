// The menu beside an NPC that a press on it opens, as Neuz builds and draws it:
//
//   CWndWorld::ShowMoverMenu   _Interface/WndWorld.cpp:6517-6710   within 20 units: one entry (or none: Dialog) runs at
//                                                                  once; more give the menu at the right and top of the
//                                                                  NPC's bound rect, every set entry in ascending MMI
//                                                                  number, the guild warehouse only with a guild, the
//                                                                  arena only past the base job
//   CWndMenu                   _Interface/WndControl.cpp:3337-3630 a frame of ARGB(255,226,198,181), white inside;
//                                                                  items 20 px on a 22 px pitch from (2, 2), as wide as
//                                                                  the widest text + 60, the text at (24, 4) in black;
//                                                                  it hides when it loses the focus (a press elsewhere)
//   CWndMenu::AppendMenu       WndControl.cpp:3408-3426            each item's text TID_MMI_DIALOG + id (7000 + id)
//
// Entries the browser cannot open (Deposit, Repair, the rankings ...) are shown greyed, where Neuz opens their windows
// (plan decision 3). Escape closes it at once (decision 4). The sizes are the CSS's (`.hud-mover-menu`, style.css).

import type { WebNpc } from '@flyffweb/formats';
import type { Texts } from '../gameData';

export interface MenuEntry { id: number; label: string; enabled: boolean }
/** The MMI ids the browser acts on (Resource/defineNeuz.h:92-305). */
export const MMI = {
  DIALOG: 0, TRADE: 2, GUILDBANKING: 15, PIERCING: 23, PET_STATUS: 49, PET_RELEASE: 50, PET_FOODMILL: 58, NPC_BUFF: 74,
  PET_RES: 77, PET_RES01: 78, ARENA_ENTER: 80, PET_EGG01: 96, PET_AWAK_CANCEL: 104, RENAME_CANCEL: 120,
  SMELT_SAFETY_GENERAL: 134, SMELT_SAFETY_ACCESSORY: 135, SMELT_SAFETY_PIERCING: 136, BUFFPET_STATUS: 141,
  BUFFPET_RELEASE: 142, TELEPORTER: 146,
  /** 2026-11-10: Jewel Setting and Create Jewels (jewels/jewelWindows.ts). */
  SMELT_JEWEL: 52, SMELT_EXTRACTION: 53,
  /** 2026-11-10: Leave Arena (Harold) and the Forsaken Tower (hud/heavenTowerWindow.ts). */
  ARENA_EXIT: 81, HEAVEN_TOWER: 97,
} as const;
/**
 * 2026-11-10: the Arena's and the Forsaken Tower's entries: Enter and Leave Arena send their header
 * (`WndWorld.cpp:5927-5934`), the tower opens its window (`:5115-5129`).
 */
const ARENA_TOWER_ENTRIES: ReadonlySet<number> = new Set([MMI.ARENA_ENTER, MMI.ARENA_EXIT, MMI.HEAVEN_TOWER]);
/**
 * 2026-11-09 (pets R1): the own raised pet's entries (`MaFl_Pet`, `Resource/character.inc:5880-5891`): its status window
 * and its release (`WndWorld.cpp:5877-5898`), which R2 wires (`WorldScreen.choosePetEntry`). (pets review) The own buff
 * pet's (`MaFl_BuffPet`, :7783-7790, the key its window gives its mover): its window and its release (:5899-5925,
 * `BuffPetWindows.choose`).
 */
const PET_ENTRIES: ReadonlySet<number> = new Set([MMI.PET_STATUS, MMI.PET_RELEASE, MMI.BUFFPET_STATUS, MMI.BUFFPET_RELEASE]);
/**
 * 2026-11-09 (pets R3): the Pet Tamer's entries the browser opens (`MaFl_PetTamer`, `Resource/character.inc:6164-6188`): the
 * food mill (`WndWorld.cpp:5863-5876`) and the rename cancel (`:5237-5240`); (pets R4) the egg exchange (`:5098-5113`), the
 * pet trade for a revival scroll piece (`MMI_PET_RES`, `:4423-4438`) and the pick-up pet's awakening cancel (`:5231-5235`).
 * `MMI_PET_RES01` (the pieces for a revival scroll) has no case of its own: `OnCommand`'s `default` opens the exchange
 * script's window (`CWndDialogEvent` with its MMI, `__TRADESYS`, `:5971-5985`; `Resource/Exchange_Script.txt`), which the
 * browser lacks, so it stays greyed.
 */
const TAMER_ENTRIES: ReadonlySet<number> = new Set([
  MMI.PET_FOODMILL, MMI.RENAME_CANCEL, MMI.PET_EGG01, MMI.PET_RES, MMI.PET_AWAK_CANCEL,
]);
/** 2026-11-05: the Upgrade Specialist's entries the browser opens (upgradeNpcWindows.ts). */
const UPGRADE_ENTRIES: ReadonlySet<number> = new Set([
  MMI.PIERCING, MMI.SMELT_SAFETY_GENERAL, MMI.SMELT_SAFETY_ACCESSORY, MMI.SMELT_SAFETY_PIERCING,
  // 2026-11-10: Peach's Jewel Setting and Create Jewels (items/jewelWindows.ts)
  MMI.SMELT_JEWEL, MMI.SMELT_EXTRACTION,
]);
/** ShowMoverMenu's range (`distSq < 20 * 20`, WndWorld.cpp:6520-6523). */
export const MENU_RANGE = 20;
/** TID_MMI_DIALOG: an entry's text is this + its id. */
const TID_MMI_BASE = 7000;
const FALLBACK: Readonly<Record<number, string>> = {
  [MMI.DIALOG]: 'Dialog', [MMI.TRADE]: 'Trade', [MMI.NPC_BUFF]: 'Get Buffed!', [MMI.TELEPORTER]: 'Teleport',
};

/** Piece 7 M4: an entry's text, `TID_MMI_DIALOG + id` (`CWndMenu::AppendMenu`), or `fallback`. */
export function menuLabel(id: number, texts: Texts, fallback: string): string {
  for (const text of texts.values()) if (text.textId === TID_MMI_BASE + id) return text.text;
  return fallback;
}

/** The menu ShowMoverMenu shows (WndWorld.cpp:6649-6684), in ascending MMI number. */
export function npcMenuEntries(npc: WebNpc | undefined, texts: Texts, ownIsBaseJob: boolean): MenuEntry[] {
  const ids = [...new Set(npc?.menus ?? [])].sort((a, b) => a - b);
  const labels = new Map([...texts.values()].map((text) => [text.textId, text.text]));
  return ids
    // the browser has no guild (MMI_GUILDBANKING, :6663-6669); the arena is past the base job (:6671-6676)
    .filter((id) => id !== MMI.GUILDBANKING && !(id === MMI.ARENA_ENTER && ownIsBaseJob))
    .map((id) => ({
      id,
      label: labels.get(TID_MMI_BASE + id) ?? FALLBACK[id] ?? 'Unavailable',
      // 2026-11-05: Buff Pang's entry only sends its key (MMI_NPC_BUFF, WndWorld.cpp:5131-5136)
      enabled: id === MMI.DIALOG || (id === MMI.TRADE && !npc?.vendorType) || id === MMI.NPC_BUFF || UPGRADE_ENTRIES.has(id) ||
        (id === MMI.TELEPORTER && (npc?.teleports?.length ?? 0) > 0) || PET_ENTRIES.has(id) || TAMER_ENTRIES.has(id) ||
        ARENA_TOWER_ENTRIES.has(id),
    }));
}

/**
 * OnCommand( nMenu ) at once when the NPC has one entry or none (WndWorld.cpp:6630-6645, :6688); null otherwise, and
 * null too when that one entry is one the browser cannot open (`entries`, `npcMenuEntries`'s), so that its menu shows
 * it greyed rather than a press doing nothing.
 */
export function soleEntry(npc: WebNpc | undefined, entries: readonly MenuEntry[]): number | null {
  const ids = [...new Set(npc?.menus ?? [])];
  if (ids.length > 1) return null;
  if (ids.length === 0) return MMI.DIALOG;
  return entries.find((entry) => entry.id === ids[0])?.enabled === true ? ids[0]! : null;
}

/** How far the menu stays from its layer's edges. */
const EDGE = 4;

export class MoverMenu {
  readonly element: HTMLElement;
  private choose: ((id: number) => void) | null = null;
  private npc: number | null = null;

  constructor(private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-mover-menu';
    this.element.setAttribute('role', 'menu');
    this.element.hidden = true;
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** The NPC the open menu is for, or null. */
  get npcId(): number | null {
    return this.npc;
  }

  /** Opens it at `at` (kept inside its layer) for the NPC `npcId`; `choose` hears an enabled entry's id. */
  open(entries: readonly MenuEntry[], at: { x: number; y: number }, choose: (id: number) => void, npcId: number | null = null): void {
    this.close();
    this.element.replaceChildren(...entries.map((entry) => {
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.className = 'hud-mover-menu-item';
      button.setAttribute('role', 'menuitem');
      button.dataset.menuEntry = String(entry.id);
      button.textContent = entry.label;
      button.disabled = !entry.enabled;
      button.addEventListener('click', () => {
        if (button.disabled || this.choose === null) return;
        const chosen = this.choose;
        this.close();
        chosen(entry.id);
      });
      return button;
    }));
    this.choose = choose;
    this.npc = npcId;
    this.element.hidden = false;
    // on a small screen a long menu would run off it: pushed back inside the layer, once it has a size
    const layer = this.element.parentElement;
    const inside = (value: number, room: number, size: number): number =>
      room > 0 ? Math.max(EDGE, Math.min(value, room - size - EDGE)) : value;
    this.element.style.left = `${inside(at.x, layer?.clientWidth ?? 0, this.element.offsetWidth)}px`;
    this.element.style.top = `${inside(at.y, layer?.clientHeight ?? 0, this.element.offsetHeight)}px`;
    this.doc.addEventListener('pointerdown', this.outside, true);
    this.doc.addEventListener('keydown', this.escape, true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    this.element.replaceChildren();
    this.choose = null;
    this.npc = null;
    this.doc.removeEventListener('pointerdown', this.outside, true);
    this.doc.removeEventListener('keydown', this.escape, true);
  }

  dispose(): void {
    this.close();
    this.element.remove();
  }

  /** CWndMenu::OnKillFocus (:3536-3543): a press anywhere else hides it. */
  private readonly outside = (event: Event): void => {
    if (!this.element.contains(event.target as Node)) this.close();
  };

  private readonly escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
  };
}

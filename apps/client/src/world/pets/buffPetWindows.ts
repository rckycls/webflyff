// The buff pet's window as the world opens and closes it, what its slots do, and the boxes before a vis (pets B1,
// docs/superpowers/plans/2026-11-09-pets-rest.md; [R] = docs/superpowers/specs/2026-11-09-pets-research.md §4):
//
//   CDPClient::OnActivateVisPet         Neuz/DPClient.cpp:19002-19029            a buff pet out: the window opens unless
//                                                                                open; none: it closes (SAFE_DELETE)
//   CWndBuffPetStatus::Process          _Interface/WndPetSys.cpp:2439-2467       the pet mover found (`GetEatPetId`): its
//                                                                                model is the portrait's, its name the title
//   CWndBuffPetStatus::OnDraw           WndPetSys.cpp:2282-2437                  the slots; the model while its mover is there
//   CWndBuffPetStatus::OnDropIcon       WndPetSys.cpp:2476-2528                  an open slot: a vis from the bag asks
//                                                                                (CVS_EQUIP_VIS) then DOUSEITEM; another
//                                                                                slot's vis is swapped (VISPET_SWAPVIS)
//   CWndBuffPetStatus::OnLButtonDblClk  WndPetSys.cpp:2770-2786                  a vis asks to come out (CVS_UNEQUIP_VIS)
//   CWndWorld::OnDropIcon               _Interface/WndWorld.cpp:7929-7937        a vis dropped on the world: the same
//   CWndBuffPetStatus::OnMouseWndSurface WndPetSys.cpp:2807-2847                 a vis's tooltip: the vis with its end
//                                                                                as its keep time (`PutToolTip_Item`)
//   CWndConfirmVis                      WndPetSys.cpp:2852-2988                  APP_CONFIRM_ENTER over the window
//                                                                                (`MoveParentCenter`); OK (or Enter) sends
//                                                                                DOUSEITEM naming the player, or
//                                                                                VISPET_REMOVEVIS
//   CWndMgr::CheckConfirm               _Interface/WndManager.cpp:7640-7717      a vis or the vis key used with a buff pet
//                                                                                out opens the window (unless open) and
//                                                                                asks; Pet Magic asks, centred
//   CWndWorld::OnCommand                _Interface/WndWorld.cpp:5899-5925        MaFl_BuffPet's menu (the key `Process`
//                                                                                gives the pet mover): MMI_BUFFPET_STATUS
//                                                                                toggles the window (a new one each
//                                                                                time), MMI_BUFFPET_RELEASE uses the buff
//                                                                                pet item naming the player (pets review)

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { BuffPetStatusWindow } from '../hud/buffPetStatusWindow';
import type { SlotView } from '../hud/buffPetStatusWindow';
import type { WindowFrame } from '../hud/frame';
import { createItemDetails, positionItemDetails } from '../hud/itemDetails';
import { MMI } from '../hud/moverMenu';
import type { TooltipContext, TooltipData } from '../items/itemTooltip';
import type { OwnState, VisPetChange } from '../OwnState';
import { BUFF_PET_FACE, PetPortrait, buffPetCamera } from '../render/petPortrait';
import { setCharacterKey } from '../WorldState';
import type { Mover } from '../WorldState';
import { IK3_VIS, MAX_VIS, NeedVis, checkConfirmVis, confirmVisText, validVisTable, visEndAt } from './buffPet';
import type { ConfirmVisSection } from './buffPet';

/** The key `Process` gives the buff pet's mover (`WndPetSys.cpp:2455`): `MaFl_BuffPet` (`character.inc:7783-7790`). */
const BUFF_PET_CHARACTER = 'MaFl_BuffPet';

/**
 * The event point 0 of the pet's model (`pObj3D->m_vEvent[ 0 ]`, `OnDraw` :2381): the model glb's (2026-11-09, pets R4),
 * else 0, as Neuz's is for a file with none (`memset`, Object3D.cpp:523) and as a glb of an older conversion gives it.
 */
const NO_EVENT_POINT: readonly [number, number, number] = [0, 0, 0];

/** What the window needs of the world screen. */
export interface BuffPetHost {
  /** `g_pPlayer`'s numbers: the buff pet item (`GetVisPetItem`), its vis and times, the pet mover's id. */
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  texts: Texts;
  /** The status window (APP_STATUS1), which the window opens beside, and the world's right edge (its client width). */
  statusFrame(): WindowFrame | null;
  worldRight(): number | null;
  /** A mover in view by its server id (`prj.GetMover`). */
  mover(objectId: number): Mover | undefined;
  /** `GetProp()->szName` of the mover `index`, null for a mover the catalog lacks. */
  moverName(index: number): string | null;
  /** `m_pModelElem->m_fScale` of the mover `index`'s model (1 when the entry has none). */
  modelScale(index: number): number;
  /** The model and stand motion of `mover`, loaded for the portrait alone; null when it cannot be had. */
  loadPortrait(mover: Mover): Promise<{ model: AssembledCharacter; motion: LoopedMotion | null } | null>;
  renderer(): WebGLRenderer | null;
  /**
   * `CWndConfirmVis` with `text`: OK (or Enter) runs `ok`; centred on `parent` (`MoveParentCenter`), else the screen. It
   * gives the box's close (pets review: a box the window made goes with it), or nothing.
   */
  confirm(text: string, ok: () => void, parent: { x: number; y: number; width: number; height: number } | null): (() => void) | void;
  /** `SendDoUseItem( MAKELONG( ITYPE_ITEM, id ), g_pPlayer->GetId() )`: the bag item `objectId` used, naming the player. */
  use(objectId: number): void;
  sendRemoveVis(slot: number): void;
  sendSwapVis(slot1: number, slot2: number): void;
  /** The item tooltip's catalogs and the own player's context (`ownTooltipContext`). */
  tooltipData: TooltipData;
  tooltipContext(item: InventoryItem): TooltipContext;
  ui: { art: UiArt; doc: Document };
}

/**
 * The buff pet window: opened and closed by VISPET_ACTIVATE (`onVisPet`), by `CheckConfirm` (`checkConfirm`); `frame`
 * draws it and its portrait each frame, `step` moves the portrait's motion each step.
 */
export class BuffPetWindows {
  readonly status: BuffPetStatusWindow;
  readonly portrait: PetPortrait;
  /** The pet mover the window found (`m_pPetModel`'s), `objectId:index`, or null. */
  private portraitOf: string | null = null;
  private loading = 0;
  private tooltip: HTMLElement | null = null;
  /** The slot under the pointer and its element, and the clock's second its tooltip was made at (it is made again each second). */
  private hovered: { slot: number; anchor: HTMLElement; at: number } | null = null;
  /**
   * 2026-11-09 (pets review): the close of the box the window asked in (`m_pWndConfirmVis`, made by
   * `DoModal_ConfirmQuestion` with the window as its parent, `WndPetSys.cpp:2708-2720`), which goes with the window.
   */
  private childBox: (() => void) | null = null;

  constructor(private readonly host: BuffPetHost, report: (error: unknown) => void = () => {}) {
    const { art, doc } = host.ui;
    this.status = new BuffPetStatusWindow(art, {
      drop: (slot, from) => this.drop(slot, from),
      takeOut: (slot) => this.takeOut(slot),
      hover: (slot, anchor) => (slot === null ? this.unhover() : this.hover(slot, anchor)),
    }, doc);
    this.portrait = new PetPortrait(doc, report, BUFF_PET_FACE);
    this.status.portraitBox().append(this.portrait.canvas);
    const closed = this.status.window.onClose;
    this.status.window.onClose = () => {
      closed();
      this.dropPortrait();
      this.unhover();
      // the window deleted (SAFE_DELETE on VISPET_ACTIVATE, Destroy): its child box with it
      const box = this.childBox;
      this.childBox = null;
      box?.();
    };
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.status.window.element;
  }

  /** The own buff pet's events (`OwnEvent` 'visPet'): `OnActivateVisPet`'s window (:19011-19028). */
  onVisPet(change: VisPetChange): void {
    if (change.kind === 'activated') this.openUnlessOpen();
    else if (change.kind === 'deactivated') this.status.close();
  }

  /**
   * `CheckConfirm`'s pet branches for the bag item `objectId` (`WndManager.cpp:7646-7692`): true when it asked first (the
   * use is the box's OK), false when DOUSEITEM goes at once.
   */
  checkConfirm(objectId: number): boolean {
    const own = this.host.own();
    const item = own?.inventory?.get(objectId);
    const prop = item === undefined ? undefined : this.host.props.get(item.itemId);
    if (own === undefined || prop === undefined) return false;
    const section = checkConfirmVis(prop, own.visPetSlot !== null);
    if (section === null) return false;
    if (section !== 'pickupToBuff') this.openUnlessOpen(); // `if( !g_WndMng.m_pWndBuffPetStatus )`
    this.ask(section, prop.name, () => this.host.use(objectId), section !== 'pickupToBuff');
    return true;
  }

  /**
   * `CWndWorld::OnCommand` (`WndWorld.cpp:5899-5925`) for MaFl_BuffPet's entries: `MMI_BUFFPET_STATUS` destroys an open
   * window, else makes a new one; `MMI_BUFFPET_RELEASE` sends DOUSEITEM of `GetVisPetItem()` naming the player (the
   * window closes on the VISPET_ACTIVATE that answers).
   */
  choose(entry: number): void {
    if (entry === MMI.BUFFPET_STATUS) {
      if (this.status.isOpen) this.status.close();
      else this.openUnlessOpen();
    } else if (entry === MMI.BUFFPET_RELEASE) {
      const item = this.host.own()?.visPetItem();
      if (item !== undefined) this.host.use(item.objectId);
    }
  }

  /** `Process`'s `FrameMove` of the shared model: the portrait's motion a frame on, each step of the world. */
  step(): void {
    if (this.status.isOpen) this.portrait.step();
  }

  /** A frame: `Process` (the pet mover's model and name, once) and `OnDraw` (the slots, the portrait). */
  frame(): void {
    if (!this.status.isOpen) return;
    const own = this.host.own();
    const mover = own?.eatPetId == null ? undefined : this.host.mover(own.eatPetId);
    if (own?.visPetSlot != null && this.portraitOf === null && mover !== undefined) this.findModel(mover);
    this.status.update(this.slots(own));
    // OnDraw draws the model only while the pet mover is there (`if( !pMoverPet ) return;`, :2371-2373)
    this.portrait.canvas.hidden = mover === undefined;
    const renderer = this.host.renderer();
    if (renderer !== null && mover !== undefined) this.portrait.draw(renderer);
    // OnMouseWndSurface runs each frame: the tooltip's time counts down
    const hovered = this.hovered;
    if (hovered !== null && own !== undefined && own.clock() !== hovered.at) this.hover(hovered.slot, hovered.anchor);
  }

  dispose(): void {
    this.dropPortrait();
    this.unhover();
    this.status.dispose();
  }

  /** `new CWndBuffPetStatus; Initialize()` unless one is open. */
  private openUnlessOpen(): void {
    if (this.status.isOpen) return;
    this.dropPortrait();
    this.status.open(this.host.statusFrame(), this.host.worldRight());
  }

  /**
   * `Process` (:2446-2463): the pet mover given the key `MaFl_BuffPet` (its menu, pets review), its model taken
   * (`m_pPetModel`, here a copy loaded for the portrait) and its name the title; `OnDraw`'s camera (:2366-2399) from the
   * model's box and scale.
   */
  private findModel(mover: Mover): void {
    const of = `${mover.objectId}:${mover.added.index}`;
    setCharacterKey(mover, BUFF_PET_CHARACTER);
    this.portraitOf = of;
    this.status.setTitle(mover.name);
    this.status.modelReady(true);
    const ticket = ++this.loading;
    void this.host.loadPortrait(mover).then((loaded) => {
      if (loaded === null) return;
      // the window closed, or a newer model was asked for, meanwhile: this one is let go
      if (ticket !== this.loading || this.portraitOf !== of) {
        loaded.model.release();
        return;
      }
      const event = loaded.model.events?.[0] ?? NO_EVENT_POINT;
      const camera = buffPetCamera(event, loaded.model.box(), this.host.modelScale(mover.added.index));
      this.portrait.show(loaded.model, loaded.motion, camera);
    });
  }

  /** The window's portrait let go (`m_pPetModel`, the window's). */
  private dropPortrait(): void {
    this.loading++;
    this.portraitOf = null;
    this.portrait.clear();
  }

  /**
   * `DrawSlotItems` (:2654-2705): none without the pet item or past `MAX_VIS` slots; an open slot's vis (none for an id
   * the catalog lacks), white when it works (`GetValidVisTable`), else faded; a closed one locked.
   */
  private slots(own: OwnState | undefined): SlotView[] | null {
    const item = own?.visPetItem();
    const pet = item === undefined ? undefined : own!.visPetOf(item.objectId);
    if (pet === undefined || pet.piercing.length > MAX_VIS) return null;
    const states = validVisTable(pet, this.host.props);
    const views: SlotView[] = [];
    for (let i = 0; i < MAX_VIS; i++) {
      if (i >= pet.piercing.length) {
        views.push({ kind: 'locked' });
        continue;
      }
      const prop = this.host.props.get(pet.piercing[i]!);
      views.push(prop === undefined ? { kind: 'empty' }
        : { kind: 'vis', icon: prop.icon, name: prop.name, works: states[i] === NeedVis.SUCCESS });
    }
    return views;
  }

  /**
   * `OnDropIcon` (:2476-2528): only on an open slot (`IsFreeSlot`: within the piercing list); a bag item that is a vis asks
   * (`DoModal_ConfirmQuestion` with its object id and the vis's id), OK uses it; another slot's vis is swapped there
   * (`SendSwapVis`), unless dropped where it was.
   */
  private drop(slot: number, from: { bag: number } | { slot: number }): void {
    const own = this.host.own();
    const pet = own?.visPetItem();
    if (own === undefined || pet === undefined || slot >= (pet.piercing?.length ?? 0)) return;
    if ('bag' in from) {
      const item = own.inventory?.get(from.bag);
      const prop = item === undefined ? undefined : this.host.props.get(item.itemId);
      if (item === undefined || item.count <= 0 || prop?.kind3 !== IK3_VIS) return;
      this.ask('equipVis', prop.name, () => this.host.use(from.bag), true);
    } else if (from.slot !== slot) {
      this.host.sendSwapVis(from.slot, slot);
    }
  }

  /** `OnLButtonDblClk` (:2770-2786) and the world's drop: a slot with a vis asks (CVS_UNEQUIP_VIS), OK sends VISPET_REMOVEVIS. */
  private takeOut(slot: number): void {
    const own = this.host.own();
    const pet = own?.visPetItem();
    const id = pet?.piercing?.[slot] ?? 0;
    if (id === 0) return;
    const name = this.host.props.get(id)?.name ?? '';
    this.ask('unequipVis', name, () => this.host.sendRemoveVis(slot), true);
  }

  /** `DoModal_ConfirmQuestion`: `CWndConfirmVis` of `section`, over the window (`Initialize( this, ... )`) or centred. */
  private ask(section: ConfirmVisSection, visName: string, ok: () => void, overWindow: boolean): void {
    const own = this.host.own();
    const mover = own?.eatPetId == null ? undefined : this.host.mover(own.eatPetId);
    const petName = mover === undefined ? null : this.host.moverName(mover.added.index);
    const text = confirmVisText(section, this.host.texts, visName, petName);
    const frame = this.status.frame;
    const parent = overWindow && frame.isOpen ? { ...frame.position, ...frame.scaledSize } : null;
    const close = this.host.confirm(text, ok, parent);
    // the window's own box (its child) or g_WndMng's (Pet Magic's, WndManager.cpp:7676-7690), which outlives it
    this.childBox = parent !== null && typeof close === 'function' ? close : null;
  }

  /**
   * `OnMouseWndSurface` (:2807-2847): with the pet item's slots, the vis under the pointer as an item with its end as its
   * keep time (`m_dwKeepTime`), put up by `PutToolTip_Item` (flag 0); none for an empty or closed slot.
   */
  private hover(slot: number | null, anchor: HTMLElement | null): void {
    this.hideTooltip();
    const own = this.host.own();
    this.hovered = slot === null || anchor === null || own === undefined ? null : { slot, anchor, at: own.clock() };
    const item = own?.visPetItem();
    if (slot === null || anchor === null || own === undefined || item === undefined) return;
    const pet = own.visPetOf(item.objectId)!;
    if (pet.piercing.length === 0) return;
    const id = pet.piercing[slot] ?? 0;
    const prop = this.host.props.get(id);
    if (id === 0 || prop === undefined) return;
    const vis: InventoryItem = { objectId: -1, itemId: id, count: 1 };
    const ctx: TooltipContext = { ...this.host.tooltipContext(vis), flag: 'other', keepEnd: visEndAt(pet, slot) };
    const { art, doc } = this.host.ui;
    const tooltip = createItemDetails(doc, art, this.host.tooltipData, vis, prop, ctx);
    tooltip.classList.add('hud-pet-tooltip');
    this.status.frame.element.append(tooltip);
    positionItemDetails(tooltip, anchor, doc);
    this.tooltip = tooltip;
  }

  private hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  /** The pointer left: no tooltip, none made again. */
  private unhover(): void {
    this.hovered = null;
    this.hideTooltip();
  }
}

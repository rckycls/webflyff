// The item windows (2026-11-05, docs/superpowers/specs/2026-11-05-ui-fixes-research.md §2): each its own resdata.inc
// window as Neuz draws it (itemWindowLayouts.ts), doing what its class does, in Neuz's order, and sending its packet.
//
//   Window                       Neuz                                                      sends
//   the name change              CWndChangeName (WndChangeName.cpp:41-123)                 QUERYSETPLAYERNAME
//   a ticket                     CWndSelectCh (WndSelectCh.cpp:24-108), CWndCommItemDlg    DO_USE_ITEM_INPUT
//   the sex change               CWndChangeSex (WndChangeFace.cpp:117-332)                 DOUSEITEM, its part the face
//   the element change           CWndChangeAttribute (WndField.cpp:22856-23115)            CHANGE_ATTRIBUTE
//   the transmute                CWndItemTransy (WndChangeFace.cpp:334-575)                ITEMTRANSY
//   the party summon             CWndSummonParty, CWndSummonPartyMsg, CWndSummonPartyUse   SUMMON_PARTY, _CONFIRM
//                                (WndSummonFriend.cpp:231-494)
//   the friend summon            CWndSummonFriend, CWndSummonFriendMsg (:16-229)           SUMMON_FRIEND, _CONFIRM, _CANCEL
//   the monster summon           the cursor and the click (WndWorldControlPlayer.cpp:240-285)  CREATEMONSTER
//
// Every window opens centred; its close button and Escape send nothing. The element change and the transmute take their
// item from the bag by a drop on their slot or a click on it in the bag (a phone has no drag), and the bag shows the items
// they hold faded (`SetExtra`, `reserve`).

import type { WebItemProp } from '@flyffweb/formats';
import type { Vec3, WorldMessage } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import type { OwnState } from '../OwnState';
import {
  CHANGE_ATTRIBUTE, CHANGE_NAME, CHANGE_SEX, ITEM_TRANSY, SELECT_CHANNEL, SUMMON_FRIEND, SUMMON_FRIEND_MSG, SUMMON_PARTY,
  SUMMON_PARTY_MSG, SUMMON_PARTY_USE,
} from './itemWindowLayouts';
import {
  attributeRefusal, createMonsterRefusal, nameRefusal, sexChangeRefusal, ticketUse, transyRefusal, transyTwin, windowOf,
} from './itemWindows';

/** The packets the flows send, by name, with their fields (WorldSession's senders). */
export type ItemWindowPacket =
  | ['querySetPlayerName', number, string]
  | ['useItem', number, number, number]
  | ['doUseItemInput', number, string]
  | ['changeAttribute', number, number, number]
  | ['itemTransy', number, number, number]
  | ['summonParty', number]
  | ['summonPartyConfirm', number, number]
  | ['summonFriend', number, string]
  | ['summonFriendAnswer', boolean, number, number]
  | ['createMonster', number, Vec3];

export interface ItemWindowHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** 2026-11-10 (guild): the guild rename scroll's window, the guild's name window with the scroll's object id. */
  openGuildName?(objectId: number): void;
  /** 2026-11-10 (bank-mail): the Custody scroll's use, OPENBANKWND with its object and item ids (bank/bankHud.ts). */
  openBank?(objectId: number, itemId: number): void;
  /** The set pieces' item ids (propItemEtc.inc), which the transmute's twin must match. */
  setItems: ReadonlySet<number>;
  worldId(): number;
  worldName(): string;
  partyName(): string;
  isLeader(): boolean;
  /** The own name (the friend summon refuses it). */
  ownName(): string;
  /** The focused mover, which DOUSEITEM names (NULL_ID with none). */
  focusId(): number;
  /** A text by its TID, `%s` filled from `args` (the catalog's "\n" as line breaks). */
  text(tid: string, args?: string[]): string;
  /** CWndCommItemDlg with `text`: OK runs `ok` (a ticket in its own world). */
  box(text: string, ok: () => void): void;
  /** Neuz's message box (`OpenMessageBox`): the name change's rules. */
  alert(text: string): void;
  /** A line in the TID's colour. */
  say(tid: string, args?: string[]): void;
  /** The monster summon's cursor (XI_CHR_CURSOR1) on or off. */
  arm(on: boolean): void;
  send(...packet: ItemWindowPacket): void;
  /** The bag's hold on an item while a window has it (`CItemBase::SetExtra`): drawn faded, not dragged nor used. */
  reserve(objectId: number, on: boolean): void;
  /** The sex change's preview: the other sex's head with face `face` (0-4), drawn once; null when it cannot be. */
  facePreview(face: number): Promise<HTMLCanvasElement | null>;
  /** The online friends' names (`m_RTMessenger`) for the friend summon's list; the browser has none yet. */
  friends(): readonly string[];
  /** What the windows draw with, and the layer they go in. */
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

/** `II_SYS_SYS_SCR_PARTYSUMMON` and `II_SYS_SYS_SCR_FRIENDSUMMON_A` (its name in the friend summon's refusal). */
const PARTY_SUMMON = 26202;
const FRIEND_SUMMON_A = 26201;
/** `MAX_FACE` (WndChangeFace.cpp:117). */
const FACES = 5;
/** `MAX_NAME` (Mover.h:32): a friend's name is 3 to 63 bytes. */
const MAX_NAME = 64;
/** The element icons (`Icon_MonElemantkind.inc`: five frames of 16 x 16, fire to earth), drawn 1.5 times (24 x 24). */
const ELEMENT_ICONS = 'ui/icon_monelemantkind.png';
const ELEMENT_TIPS = [
  'TID_TOOLTIP_CA_FIRE', 'TID_TOOLTIP_CA_WATER', 'TID_TOOLTIP_CA_ELEC', 'TID_TOOLTIP_CA_WIND', 'TID_TOOLTIP_CA_EARTH',
];
/** `Client/Client/ChangeAttribute.inc` (`#b#cff0000ff Scroll of Attribute Change #nb#nc`, then the help). */
const ATTRIBUTE_TITLE = ' Scroll of Attribute Change ';
const ATTRIBUTE_HELP =
  'After placing an applicable item in the box above, you can select one of the below icons to convert the elemental attribute of an item.';

/** The element change's or the transmute's state: its scroll, the item placed, and the element chosen. */
type SlotWindow =
  | { kind: 'attribute'; scroll: number; target: number | null; element: number }
  | { kind: 'transy'; scroll: number; target: number | null };

export class ItemWindowFlows {
  private readonly windows = new Map<ResLayout, ResWindow>();
  /** The element change or the transmute open. */
  private slot: SlotWindow | null = null;
  /** `g_Neuz.m_pCreateMonItem`: the armed monster summon's scroll. */
  private armedScroll: number | null = null;
  /** A party summon a member was told of (`g_Neuz.m_dwSummonParty*`): the leader, the data and the world. */
  private partyCall: { leader: number; data: number; world: string } | null = null;
  /** The open windows' data: the name change's scroll, the sex change's scroll and face, the summons'. */
  private renameScroll = 0;
  private sexChange: { scroll: number; target: number; face: number; drawn: number } | null = null;
  private partyScroll = 0;
  private friendScroll = 0;
  private friendCall: { objectId: number; data: number } | null = null;

  constructor(private readonly host: ItemWindowHost) {}

  /** An item for the element change or the transmute is taken from the bag (its window is open). */
  get picking(): boolean {
    return this.slot !== null;
  }

  /** The monster summon is armed. */
  get armed(): boolean {
    return this.armedScroll !== null;
  }

  /** Opens the window of the item at `objectId`; false when it has none (or, from the task bar, the bag's own). */
  open(objectId: number, from: 'bag' | 'bar' = 'bar'): boolean {
    const own = this.host.own(), item = own?.inventory?.get(objectId);
    const prop = item && this.host.props.get(item.itemId);
    const kind = prop ? windowOf(prop) : null;
    if (!own || own.hp <= 0 || !item || !prop || kind === null) return false;
    // using another item disarms the monster summon (DPClient.cpp:10304-10313)
    if (kind !== 'createMonster') this.disarm();
    switch (kind) {
      case 'rename':
        this.openRename(objectId);
        return true;
      case 'guildName':
        this.host.openGuildName?.(objectId);
        return true;
      case 'custody':
        this.host.openBank?.(objectId, prop.id);
        return true;
      case 'ticket': {
        const use = ticketUse(prop, item, this.host.worldId());
        if (use.kind === 'use') return false;
        if (use.kind === 'leave') {
          this.host.box(this.host.text('TID_GAME_TICKET_DESC'), () => {
            if (this.host.own()?.inventory?.has(objectId) === true) this.host.send('doUseItemInput', objectId, '0');
          });
          return true;
        }
        this.openChannels(objectId, use.count);
        // CWndSelectCh does not return: SendDoUseItem goes on to its DOUSEITEM, which the server does nothing with
        this.host.send('useItem', objectId, -1, this.host.focusId());
        return true;
      }
      case 'sexChange': {
        const refused = sexChangeRefusal(own.equipmentObjectIds);
        if (refused !== null) {
          this.host.say(refused);
          return true;
        }
        this.openSexChange(objectId);
        return true;
      }
      case 'attribute':
        if (from !== 'bag') return false;
        this.openAttribute(objectId);
        return true;
      case 'transy':
        if (from !== 'bag') return false;
        if (this.window(ITEM_TRANSY).isOpen) return true; // already open: nothing (DPClient.cpp:10753-10763)
        this.openTransy(objectId);
        return true;
      case 'partySummon':
        if (!this.host.isLeader()) {
          this.host.say('TID_GAME_TROUPECREATE');
          return true;
        }
        this.openPartySummon(objectId);
        return true;
      case 'createMonster':
        if (this.armedScroll !== null) return true; // a second one while armed does nothing
        this.armedScroll = objectId;
        this.host.arm(true);
        return true;
    }
  }

  /**
   * A bag item clicked (or dropped on a slot) while the element change or the transmute is open: placed in its slot when
   * its window takes it (`OnDropIcon`), refused with its line otherwise; true when a window took the click.
   */
  pick(targetId: number): boolean {
    const slot = this.slot;
    if (slot === null) return false;
    const own = this.host.own(), target = own?.inventory?.get(targetId);
    const targetProp = target && this.host.props.get(target.itemId);
    // the window's own scroll, or an item missing, does nothing
    if (!own || !target || !targetProp || targetId === slot.scroll) return true;
    if (slot.kind === 'attribute') {
      if (slot.target !== null) return true; // a filled slot takes nothing (it is emptied by a double-click)
      const refused = attributeRefusal(targetProp, target);
      if (refused !== null) {
        this.host.say(refused);
        return true;
      }
      slot.target = targetId;
      this.host.reserve(targetId, true);
      this.drawAttribute();
      return true;
    }
    const scroll = own.inventory?.get(slot.scroll);
    const scrollProp = scroll && this.host.props.get(scroll.itemId);
    if (!scrollProp) return true;
    const worn = own.equipmentObjectIds.includes(targetId);
    const refused = transyRefusal(scrollProp.id, targetProp, worn, this.host.props, this.host.setItems);
    if (refused !== null) {
      this.host.say(refused.tid, refused.scroll ? [scrollProp.name] : []);
      return true;
    }
    // a second drop replaces the first item
    if (slot.target !== null) this.host.reserve(slot.target, false);
    slot.target = targetId;
    this.host.reserve(targetId, true);
    this.drawTransy();
    return true;
  }

  /** Kept for the bag's cancel (a right click, the bag closing): the windows stay, as Neuz's do. */
  cancelPick(): void {}

  /** The player moved: the element change closes (WndWorld.cpp:8052, :8487-8491). */
  playerMoved(): void {
    if (this.slot?.kind === 'attribute') this.window(CHANGE_ATTRIBUTE).close();
  }

  /**
   * A click on the world while the monster summon is armed: refused where it may not be placed (and it stays armed), or
   * CREATEMONSTER; false when it is not armed.
   */
  place(pos: Vec3, distance: number, landAttr: number): boolean {
    const scroll = this.armedScroll;
    if (scroll === null) return false;
    const refused = createMonsterRefusal({ distance, worldId: this.host.worldId(), landAttr });
    if (refused !== null) {
      this.host.say(refused);
      return true;
    }
    this.disarm();
    this.host.send('createMonster', scroll, pos);
    return true;
  }

  /** The monster summon's cursor off (a move, Escape, another item). */
  disarm(): void {
    if (this.armedScroll === null) return;
    this.armedScroll = null;
    this.host.arm(false);
  }

  /** SUMMON: a friend summon's use asks for the name; a friend's call and a party summon tell the one called. */
  onSummon(message: Extract<WorldMessage, { type: 'summon' }>): void {
    if (message.kind === 'friendUse') {
      // the scroll is the data's high word, which must be in the bag (DPClient.cpp:16097-16115)
      const scroll = (message.data >>> 16) & 0xffff;
      if (this.host.own()?.inventory?.has(scroll) !== true) return;
      this.openFriendSummon(scroll);
    } else if (message.kind === 'friendConfirm') {
      this.openFriendCall(message.objectId, message.data, message.name, message.world);
    } else if (message.kind === 'partyConfirm') {
      this.partyCall = { leader: message.objectId, data: message.data, world: message.world };
      this.openPartyNotice();
    }
  }

  /** The party summon's buff double-clicked: CWndSummonPartyUse (WndWorld.cpp:7268-7279; WndSummonFriend.cpp:432-494). */
  partySummonBuff(): void {
    const call = this.partyCall;
    const window = this.window(SUMMON_PARTY_USE);
    if (call === null || call.leader === 0 || call.leader === this.host.own()?.objectId || window.isOpen) return;
    window.setText('WIDC_TEXT1', this.host.text('TID_DIAG_SUMMONPARTY_USE', [call.world]));
    this.press(window, 'WIDC_OK', () => {
      this.host.send('summonPartyConfirm', call.leader, call.data);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.open();
  }

  /** Every window closed and let go (the world screen ends). */
  dispose(): void {
    this.disarm();
    for (const window of this.windows.values()) window.dispose();
    this.windows.clear();
    this.slot = null;
  }

  /** A window by its layout, made once and kept in the layer. */
  private window(layout: ResLayout): ResWindow {
    let window = this.windows.get(layout);
    if (window === undefined) {
      window = new ResWindow(layout, this.host.ui.art, this.host.ui.doc);
      this.windows.set(layout, window);
    }
    const layer = this.host.ui.layer();
    if (layer !== null && window.element.parentElement !== layer) layer.append(window.element);
    return window;
  }

  /** The button `id` of `window` now does `press` (the open window's data), in place of what it did. */
  private press(window: ResWindow, id: string, press: () => void): void {
    const button = window.button(id);
    button.onclick = (event) => {
      event.preventDefault();
      press();
    };
  }

  /** CWndChangeName: a second scroll used while it is open only changes its data (`SetData`). */
  private openRename(objectId: number): void {
    const window = this.window(CHANGE_NAME);
    this.renameScroll = objectId;
    if (window.isOpen) return;
    const input = window.input('WIDC_EDIT_CHANGENAME');
    input.value = '';
    this.press(window, 'WIDC_OK', () => {
      // IsValidPlayerName trims the field in place (WndTitle.cpp:2723-2791)
      const { name, tid } = nameRefusal(input.value);
      input.value = name;
      if (tid !== null) {
        this.host.alert(this.host.text(tid));
        input.focus();
        return;
      }
      this.host.send('querySetPlayerName', this.renameScroll, name);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.open();
  }

  /** CWndSelectCh: "Channel 1" and on; a click on a row sends "0" or "-row" and closes. No OK, no Cancel. */
  private openChannels(objectId: number, count: number): void {
    const window = this.window(SELECT_CHANNEL);
    window.close(); // SAFE_DELETE of the one open
    const doc = this.host.ui.doc;
    const channel = this.host.text('TID_GAME_CHAR_SERVERNAME') || 'Channel';
    window.control('WIDC_LISTBOX1').replaceChildren(...Array.from({ length: count }, (_, i) => {
      const row = doc.createElement('div');
      row.setAttribute('role', 'option');
      row.dataset.row = String(i);
      row.textContent = `${channel} ${i + 1}`;
      row.addEventListener('click', () => {
        row.setAttribute('aria-selected', 'true');
        this.host.send('doUseItemInput', objectId, String(-i));
        window.close();
      });
      return row;
    }));
    window.open();
  }

  /** CWndChangeSex: the other sex's head, Left and Right through the five faces, OK sends the face. */
  private openSexChange(objectId: number): void {
    const window = this.window(CHANGE_SEX);
    const state = { scroll: objectId, target: this.host.focusId(), face: 0, drawn: 0 };
    this.sexChange = state;
    const turn = (step: number): void => {
      state.face = (state.face + step + FACES) % FACES;
      this.drawFace(window, state);
    };
    this.press(window, 'WIDC_LEFT', () => turn(-1));
    this.press(window, 'WIDC_RIGHT', () => turn(1));
    this.press(window, 'WIDC_OK', () => {
      this.host.send('useItem', state.scroll, state.face, state.target);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.onClose = () => { if (this.sexChange === state) this.sexChange = null; };
    window.open();
    this.drawFace(window, state);
  }

  /** The preview drawn for the face chosen: at client (12, 38), 6 px left of its box (WndChangeFace.cpp:176-187). */
  private drawFace(window: ResWindow, state: { face: number; drawn: number }): void {
    const ticket = ++state.drawn;
    window.control('WIDC_STATIC1').dataset.face = String(state.face);
    void this.host.facePreview(state.face).then((canvas) => {
      if (canvas === null || ticket !== state.drawn || this.sexChange !== state || !window.isOpen) return;
      const box = window.control('WIDC_STATIC1');
      box.querySelector('.hud-res-preview')?.remove();
      canvas.classList.add('hud-res-preview');
      box.append(canvas);
    });
  }

  /** CWndChangeAttribute: the scroll held, the item's slot, the five elements, OK. */
  private openAttribute(scroll: number): void {
    const window = this.window(CHANGE_ATTRIBUTE);
    window.close(); // SAFE_DELETE of the one open
    const doc = this.host.ui.doc;
    const slot: SlotWindow = { kind: 'attribute', scroll, target: null, element: -1 };
    this.slot = slot;
    this.host.reserve(scroll, true);
    const title = doc.createElement('span');
    title.className = 'hud-res-words-title';
    title.textContent = ATTRIBUTE_TITLE;
    window.setContent('WIDC_TEXT1', title, '\n', ATTRIBUTE_HELP);
    const slotBox = window.control('WIDC_STATIC1').parentElement!;
    slotBox.title = this.host.text('TID_TOOLTIP_CA_INSLOT');
    this.takeDrops(slotBox);
    // a double-click on the slot empties it (OnLButtonDblClk, :23099-23113)
    slotBox.ondblclick = () => {
      if (this.slot !== slot || slot.target === null) return;
      this.host.reserve(slot.target, false);
      slot.target = null;
      this.drawAttribute();
    };
    for (let i = 0; i < ELEMENT_TIPS.length; i++) {
      const icon = window.control(`WIDC_CUSTOM${i + 1}`);
      icon.classList.add('hud-res-element');
      icon.style.backgroundImage = `url(${JSON.stringify(this.host.ui.art.url(ELEMENT_ICONS))})`;
      icon.style.backgroundPosition = `-${24 * i}px 0`;
      icon.title = this.host.text(ELEMENT_TIPS[i]!);
      icon.onclick = () => {
        if (this.slot !== slot) return;
        slot.element = i;
        this.drawAttribute();
      };
    }
    this.press(window, 'WIDC_OK', () => {
      if (slot.target !== null && slot.element >= 0 && this.host.own()?.inventory?.has(slot.scroll) === true) {
        this.host.send('changeAttribute', slot.target, slot.scroll, slot.element + 1);
      }
      window.close();
    });
    window.onClose = () => this.closeSlot(slot);
    this.drawAttribute();
    window.open();
  }

  private drawAttribute(): void {
    const slot = this.slot;
    if (slot?.kind !== 'attribute') return;
    const window = this.window(CHANGE_ATTRIBUTE);
    this.drawItem(window.control('WIDC_STATIC1').parentElement!, slot.target);
    for (let i = 0; i < ELEMENT_TIPS.length; i++) {
      window.control(`WIDC_CUSTOM${i + 1}`).classList.toggle('is-chosen', i === slot.element);
    }
  }

  /** CWndItemTransy: the scroll held, the item's slot, its twin's, OK and Cancel. */
  private openTransy(scroll: number): void {
    const window = this.window(ITEM_TRANSY);
    const slot: SlotWindow = { kind: 'transy', scroll, target: null };
    this.slot = slot;
    this.host.reserve(scroll, true);
    const source = window.control('WIDC_STATIC1').parentElement!;
    this.takeDrops(source);
    // a right click on the item's slot empties it (OnRButtonUp, :450-457)
    source.oncontextmenu = (event) => {
      event.preventDefault();
      if (this.slot !== slot || slot.target === null) return;
      this.host.reserve(slot.target, false);
      slot.target = null;
      this.drawTransy();
    };
    this.press(window, 'WIDC_OK', () => {
      const twin = this.twinOf(slot.target);
      if (slot.target !== null && twin !== null && this.host.own()?.inventory?.has(slot.scroll) === true) {
        this.host.send('itemTransy', slot.target, slot.scroll, twin.id);
      }
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    window.onClose = () => this.closeSlot(slot);
    this.drawTransy();
    window.open();
  }

  private drawTransy(): void {
    const slot = this.slot;
    if (slot?.kind !== 'transy') return;
    const window = this.window(ITEM_TRANSY);
    const source = window.control('WIDC_STATIC1').parentElement!;
    const twinBox = window.control('WIDC_STATIC4').parentElement!;
    const item = slot.target === null ? undefined : this.host.own()?.inventory?.get(slot.target);
    const prop = item && this.host.props.get(item.itemId);
    const twin = this.twinOf(slot.target);
    this.drawItem(source, slot.target);
    this.drawIcon(twinBox, twin);
    source.title = prop?.name ?? this.host.text('TID_GAME_TRANSITEM_PUT');
    twinBox.title = twin?.name ?? this.host.text('TID_GAME_TRANSITEM_PUT1');
  }

  private twinOf(target: number | null): WebItemProp | null {
    const item = target === null ? undefined : this.host.own()?.inventory?.get(target);
    const prop = item && this.host.props.get(item.itemId);
    return prop ? transyTwin(prop, this.host.props, this.host.setItems) : null;
  }

  /** The bag's item `objectId` drawn in `box` (its icon, 32 x 32 at the slot's top left), or the slot emptied. */
  private drawItem(box: HTMLElement, objectId: number | null): void {
    const item = objectId === null ? undefined : this.host.own()?.inventory?.get(objectId);
    this.drawIcon(box, item ? this.host.props.get(item.itemId) ?? null : null);
  }

  private drawIcon(box: HTMLElement, prop: WebItemProp | null): void {
    box.querySelector('.hud-res-slot')?.remove();
    if (prop === null || !prop.icon) return;
    const doc = this.host.ui.doc;
    const holder = doc.createElement('div');
    holder.className = 'hud-res-slot';
    const icon = doc.createElement('img');
    icon.src = this.host.ui.art.url(prop.icon);
    icon.alt = prop.name;
    icon.draggable = false;
    holder.append(icon);
    box.append(holder);
  }

  /** A slot takes a bag item dropped on it (the bag's drag, `application/x-flyff-inventory`). */
  private takeDrops(box: HTMLElement): void {
    box.ondragover = (event) => {
      if (event.dataTransfer?.types.includes('application/x-flyff-inventory') === true) event.preventDefault();
    };
    box.ondrop = (event) => {
      const id = Number(event.dataTransfer?.getData('application/x-flyff-inventory'));
      if (!Number.isFinite(id) || this.slot === null) return;
      event.preventDefault();
      this.pick(id);
    };
  }

  /** The element change or the transmute closed: both items let go (the destructors' `SetExtra( 0 )`). */
  private closeSlot(slot: SlotWindow): void {
    this.host.reserve(slot.scroll, false);
    if (slot.target !== null) this.host.reserve(slot.target, false);
    if (this.slot === slot) this.slot = null;
  }

  /** CWndSummonParty: the leader's question; OK sends while the scroll is in the bag, and closes. */
  private openPartySummon(objectId: number): void {
    const window = this.window(SUMMON_PARTY);
    this.partyScroll = objectId;
    window.setText('WIDC_TEXT1', this.host.text('TID_GAME_SUMMONPARTY', [this.host.worldName()]));
    this.press(window, 'WIDC_OK', () => {
      const scroll = this.partyScroll;
      if (this.host.own()?.inventory?.get(scroll)?.itemId === PARTY_SUMMON) this.host.send('summonParty', scroll);
      else this.host.say('TID_ERROR_SUMMONPARTY_NOITEM', [this.host.props.get(PARTY_SUMMON)?.name ?? '']);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    if (!window.isOpen) window.open();
  }

  /** CWndSummonPartyMsg: each member's notice, the scroll's icon at (12, 116); OK only closes. */
  private openPartyNotice(): void {
    const window = this.window(SUMMON_PARTY_MSG);
    const item = this.host.props.get(PARTY_SUMMON);
    window.setText('WIDC_TEXT1', this.host.text('TID_DIAG_SUMMONPARTY_CONFIRM', [this.host.partyName()]));
    window.setText('WIDC_TEXT2', this.host.text('TID_DIAG_SUMMONPARTY_CONFIRM_USE', [item?.name ?? '']));
    this.drawIcon(window.control('ICON'), item ?? null);
    this.press(window, 'WIDC_OK', () => window.close());
    if (!window.isOpen) window.open();
  }

  /** CWndSummonFriend: a name typed or picked; OK checks it, sends while the scroll is in the bag, and closes. */
  private openFriendSummon(scroll: number): void {
    const window = this.window(SUMMON_FRIEND);
    this.friendScroll = scroll;
    window.setChoices('WIDC_COMBOBOX1', this.host.friends());
    const input = window.input('WIDC_COMBOBOX1');
    this.press(window, 'WIDC_OK', () => {
      const name = input.value;
      // 3 to 63 bytes, else nothing and the window stays
      if (name.length < 3 || name.length >= MAX_NAME) return;
      if (name === this.host.ownName()) this.host.say('TID_GAME_SUMMON_FRIEND_MY_NOUSE');
      else if (this.host.own()?.inventory?.has(this.friendScroll) === true) this.host.send('summonFriend', this.friendScroll, name);
      else this.host.say('TID_ERROR_SUMMONFRIEND_NOITEM', [this.host.props.get(FRIEND_SUMMON_A)?.name ?? '', name]);
      window.close();
    });
    this.press(window, 'WIDC_CANCEL', () => window.close());
    if (!window.isOpen) {
      input.value = '';
      window.open();
    }
    input.focus();
  }

  /** CWndSummonFriendMsg: the friend's question; OK accepts, Cancel refuses, the close button sends nothing. */
  private openFriendCall(objectId: number, data: number, name: string, world: string): void {
    const window = this.window(SUMMON_FRIEND_MSG);
    this.friendCall = { objectId, data };
    window.setText('WIDC_TEXT1', this.host.text('TID_DIAG_SUMMONFRIEND_CONFIRM', [name, world]));
    const answer = (yes: boolean): void => {
      const call = this.friendCall;
      if (call !== null) this.host.send('summonFriendAnswer', yes, call.objectId, call.data);
      window.close();
    };
    this.press(window, 'WIDC_OK', () => answer(true));
    this.press(window, 'WIDC_CANCEL', () => answer(false));
    if (!window.isOpen) window.open();
  }
}

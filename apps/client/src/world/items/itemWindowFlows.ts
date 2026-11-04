// The item windows' flows (2026-11-05, docs/superpowers/specs/2026-11-05-item-windows-research.md §3): what each
// window asks, in Neuz's order, and the packet its OK sends. The windows are the message box's prompts (a text field or
// a row of choices) and boxes; the element change and the transmute take their item from the bag, as the upgrade cursor
// does (Neuz drops it in their window).
//
//   Window                       Neuz                                                      sends
//   the name change              CWndChangeName (WndChangeName.cpp:79-110)                 QUERYSETPLAYERNAME
//   a ticket                     CWndSelectCh, CWndCommItemDlg (DPClient.cpp:10700-10750)  DO_USE_ITEM_INPUT
//   the sex change               CWndChangeSex (WndChangeFace.cpp:176-329)                 DOUSEITEM, its part the face
//   the element change           CWndChangeAttribute (WndField.cpp:22880-23100)            CHANGE_ATTRIBUTE
//   the transmute                CWndItemTransy (WndChangeFace.cpp:440-575)                ITEMTRANSY
//   the party summon             CWndSummonParty, CWndSummonPartyMsg, CWndSummonPartyUse   SUMMON_PARTY, _CONFIRM
//                                (WndSummonFriend.cpp:292-486)
//   the friend summon            CWndSummonFriend, CWndSummonFriendMsg (:40-230)           SUMMON_FRIEND, _CONFIRM, _CANCEL
//   the monster summon           the cursor and the click (WndWorldControlPlayer.cpp:240-285)  CREATEMONSTER

import type { WebItemProp } from '@flyffweb/formats';
import type { Vec3, WorldMessage } from '@flyffweb/protocol';
import type { OwnState } from '../OwnState';
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
  /** The set pieces' item ids (propItemEtc.inc), which the transmute's twin must match. */
  setItems: ReadonlySet<number>;
  worldId(): number;
  worldName(): string;
  partyName(): string;
  isLeader(): boolean;
  /** The focused mover, which DOUSEITEM names (NULL_ID with none). */
  focusId(): number;
  /** A text by its TID, `%s` filled from `args` (the catalog's "\n" as line breaks). */
  text(tid: string, args?: string[]): string;
  prompt(text: string, options: { input?: { maxLength: number }; choices?: string[] },
    onAnswer: (answer: { value: string; choice: number }) => void, onCancel?: () => void): void;
  /** An OK and Cancel box. */
  box(text: string, ok: () => void, cancel?: () => void): void;
  /** An OK box (the name change's rules are said in one, `g_WndMng.OpenMessageBox`). */
  alert(text: string): void;
  /** A line in the TID's colour. */
  say(tid: string, args?: string[]): void;
  /** The monster summon's cursor (XI_CHR_CURSOR1) on or off. */
  arm(on: boolean): void;
  send(...packet: ItemWindowPacket): void;
}

const ELEMENTS = ['Fire', 'Water', 'Electricity', 'Wind', 'Earth'];

export class ItemWindowFlows {
  /** The element change or the transmute waiting for its item from the bag: the window and its scroll. */
  private pending: { kind: 'attribute' | 'transy'; scroll: number } | null = null;
  /** `g_Neuz.m_pCreateMonItem`: the armed monster summon's scroll. */
  private armedScroll: number | null = null;
  /** A party summon a member accepted: the leader and the data, for the buff's double-click. */
  private partyCall: { leader: number; data: number; world: string } | null = null;

  constructor(private readonly host: ItemWindowHost) {}

  /** An item for the element change or the transmute is awaited from the bag. */
  get picking(): boolean {
    return this.pending !== null;
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
        this.host.prompt('Please input the new name to change into.', { input: { maxLength: 16 } }, ({ value }) => {
          const { name, tid } = nameRefusal(value);
          if (tid !== null) this.host.alert(this.host.text(tid));
          else this.host.send('querySetPlayerName', objectId, name);
        });
        return true;
      case 'ticket': {
        const use = ticketUse(prop, item, this.host.worldId());
        if (use.kind === 'use') return false;
        if (use.kind === 'leave') {
          this.host.box(this.host.text('TID_GAME_TICKET_DESC'), () => this.host.send('doUseItemInput', objectId, '0'));
          return true;
        }
        const choices = Array.from({ length: use.count }, (_, i) => `Channel ${i + 1}`);
        this.host.prompt('Please choose a channel', { choices }, ({ choice }) => {
          this.host.send('doUseItemInput', objectId, String(-choice));
        });
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
        const focus = this.host.focusId();
        this.host.prompt('Choose the face', { choices: ['1', '2', '3', '4', '5'] }, ({ choice }) => {
          this.host.send('useItem', objectId, choice, focus);
        });
        return true;
      }
      case 'attribute':
      case 'transy':
        if (from !== 'bag') return false;
        this.pending = { kind, scroll: objectId };
        return true;
      case 'partySummon':
        if (!this.host.isLeader()) {
          this.host.say('TID_GAME_TROUPECREATE');
          return true;
        }
        this.host.box(this.host.text('TID_GAME_SUMMONPARTY', [this.host.worldName()]), () => {
          // the scroll still there (WndSummonFriend.cpp:386-392)
          if (this.host.own()?.inventory?.get(objectId)?.itemId === prop.id) this.host.send('summonParty', objectId);
          else this.host.say('TID_ERROR_SUMMONPARTY_NOITEM', [prop.name]);
        });
        return true;
      case 'createMonster':
        if (this.armedScroll !== null) return true; // a second one while armed does nothing
        this.armedScroll = objectId;
        this.host.arm(true);
        return true;
    }
  }

  /** A bag item clicked while an item is awaited: its window's next step; true when taken. */
  pick(targetId: number): boolean {
    const pending = this.pending;
    if (pending === null) return false;
    this.pending = null;
    const own = this.host.own(), target = own?.inventory?.get(targetId), scroll = own?.inventory?.get(pending.scroll);
    const targetProp = target && this.host.props.get(target.itemId);
    const scrollProp = scroll && this.host.props.get(scroll.itemId);
    if (!own || !target || !targetProp || !scrollProp) return true;
    if (pending.kind === 'attribute') {
      const refused = attributeRefusal(targetProp, target);
      if (refused !== null) {
        this.host.say(refused);
        return true;
      }
      this.host.prompt(targetProp.name, { choices: ELEMENTS }, ({ choice }) => {
        this.host.send('changeAttribute', targetId, pending.scroll, choice + 1);
      });
      return true;
    }
    const worn = own.equipmentObjectIds.includes(targetId);
    const refused = transyRefusal(scrollProp.id, targetProp, worn, this.host.props, this.host.setItems);
    if (refused !== null) {
      this.host.say(refused.tid, refused.scroll ? [scrollProp.name] : []);
      return true;
    }
    const twin = transyTwin(targetProp, this.host.props, this.host.setItems)!;
    this.host.box(`${targetProp.name} → ${twin.name}`, () => this.host.send('itemTransy', targetId, pending.scroll, twin.id));
    return true;
  }

  /** The element change's or the transmute's wait for an item ends (a right click, the bag closing). */
  cancelPick(): void {
    this.pending = null;
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

  /** SUMMON: a friend summon's use asks for the name; a friend's call and a party summon ask the one called. */
  onSummon(message: Extract<WorldMessage, { type: 'summon' }>): void {
    if (message.kind === 'friendUse') {
      const data = message.data;
      this.host.prompt('Input the character name to be summoned.', { input: { maxLength: 32 } }, ({ value }) => {
        if (value.trim() !== '') this.host.send('summonFriend', data, value.trim());
      });
    } else if (message.kind === 'friendConfirm') {
      const { objectId, data } = message;
      this.host.box(this.host.text('TID_DIAG_SUMMONFRIEND_CONFIRM', [message.name, message.world]),
        () => this.host.send('summonFriendAnswer', true, objectId, data),
        () => this.host.send('summonFriendAnswer', false, objectId, data));
    } else if (message.kind === 'partyConfirm') {
      this.partyCall = { leader: message.objectId, data: message.data, world: message.world };
      const item = this.host.props.get(26202)?.name ?? '';
      const text = `${this.host.text('TID_DIAG_SUMMONPARTY_CONFIRM', [this.host.partyName()])}\n` +
        this.host.text('TID_DIAG_SUMMONPARTY_CONFIRM_USE', [item]);
      this.host.box(text, () => {});
    }
  }

  /** The party summon's buff double-clicked: asks, then SUMMON_PARTY_CONFIRM (WndWorld.cpp:7268-7279; :430-486). */
  partySummonBuff(): void {
    const call = this.partyCall;
    if (call === null) return;
    this.host.box(this.host.text('TID_DIAG_SUMMONPARTY_USE', [call.world]), () => this.host.send('summonPartyConfirm', call.leader, call.data));
  }
}

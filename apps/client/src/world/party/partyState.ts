// The party (Piece 7 M4, [R §1.1], [R §3]): `CParty g_Party` and what its handlers in `CDPClient` do. A global in Neuz,
// so it lives on the world screen and outlives a world change (plan Decisions 3). The handlers only change the party and
// say what to print, play or open; the windows read it every frame, as Neuz's do.
//
//   CParty::InitParty, Serialize        _Common/party.cpp:75-95, :215-240   the reset; the block (15 slots, the rest kept)
//   CParty::ChangeLeader, SwapPartyMember party.cpp:176-185, :243-250        a swap of whole slots, positions included
//   CDPClient::OnErrorParty             Neuz/DPClient.cpp:4296-4397          each code's line or box
//   CDPClient::OnAddPartyMember         DPClient.cpp:4399-4542               the block and the join or leave line
//   CDPClient::OnPartyRequest           DPClient.cpp:4544-4579               the invite (the screen decides the box)
//   CDPClient::OnPartyRequestCancel     DPClient.cpp:4581-4677               the refusal's line
//   CDPClient::OnPartyExpLevel          DPClient.cpp:4990-5002               exp, points; the level-up line
//   CDPClient::OnPartyChangeLeader      DPClient.cpp:5004-5021               the swap, the icons cleared
//   CDPClient::OnSetPartyMode           DPClient.cpp:5023-5239               the mode on or off, its line
//   CDPClient::OnPartyChangeItemMode    DPClient.cpp:5241-5249               the item and EXP modes
//   CDPClient::OnPartyChangeName        DPClient.cpp:5251-5293               the name, or the leader's name box
//   CDPClient::OnPartyChangeTroup       DPClient.cpp:5295-5334               the advanced party, its music
//   CDPClient::OnSetPartyMemberParam    DPClient.cpp:5336-5378               a member on or off line; the leader's swap
//   CDPClient::OnMyPartyName            DPClient.cpp:5879-5882               the saved advanced-party name
//   CDPClient::OnPartyMapInfo           DPClient.cpp:6170-6181               a far member's position
//   OnBlock, gu 7                       DPClient.cpp:8385-8389               "You have already invited this player."
//
// Left out: the duel party (`m_idDuelParty`, duels are out of scope) and `m_dwSkillTime` (only a dead branch reads it).

import type { MessageOf, Vec3, WorldMessage } from '@flyffweb/protocol';
import { BGM_IN_FITUP } from '../../audio/soundIds';
import { PARTY_MODE_SKILL, fullPartyTid } from './partyRules';

/** `MAX_PTMEMBER_SIZE` (`_Common/party.h:33`): the slots. */
const SLOTS = 15;
/** `MAX_PARTYMODE` (`party.h:24-26`). */
const MODES = 5;
/** `MAX_PARTYLEVEL` (`ProjectCmn.h:28`): the level-up line names it. */
const MAX_PARTYLEVEL = 10;
/** The colour Neuz forces on the join, leave, FULLPARTY and refusal lines (`DPClient.cpp:4329`, :4515, :4676). */
const OLIVE = 0xff99cc00;
/** `PP_REMOVE` (`party.h:31`), SET_PARTY_MEMBER_PARAM's only parameter. */
const PP_REMOVE = 0;

export type PartyEvent =
  /** A chat line: its TID, its arguments, and its colour (null: the TID's own). */
  | { kind: 'line'; tid: string; args: string[]; color: number | null }
  /** A message box (`OpenMessageBox`). */
  | { kind: 'box'; tid: string }
  | { kind: 'music'; id: number }
  | { kind: 'invited'; request: MessageOf<'partyRequest'> }
  /** The leader's name box, again. */
  | { kind: 'nameBox' }
  | { kind: 'modeOn'; mode: number; skill: number; skillTime: number }
  | { kind: 'modeOff'; mode: number; skill: number }
  /** `CWndWorld::m_buffs.Clear()`: the party-skill icons go. */
  | { kind: 'iconsCleared' }
  /** The members or the leader changed: the names' colours follow. */
  | { kind: 'changed' };

export interface PartyContext {
  ownPlayerId(): number;
  /** `prj.GetUserByID( id )`: the player's mover is in view. */
  inView(playerId: number): boolean;
  /** The name of the player's mover in view, or null. */
  nameInView(playerId: number): string | null;
  /** A party skill's name (the catalog's), for the mode lines; '' without the catalog. */
  skillName(skill: number): string;
  /** TID_GAME_PARTY_NAME's text, "Advance Party": the name that means none. */
  defaultName(): string;
}

export interface PartySlot {
  playerId: number;
  removed: boolean;
  /** `m_vPos`: the position the world map draws a member at (PARTYMAPINFO's, or the screen's for one in view). */
  pos: Vec3;
}

const emptySlot = (): PartySlot => ({ playerId: 0, removed: false, pos: [0, 0, 0] });
const line = (tid: string, args: string[] = [], color: number | null = null): PartyEvent => ({ kind: 'line', tid, args, color });

export class PartyState {
  partyId = 0;
  kind = 0;
  level = 1;
  exp = 0;
  point = 0;
  expMode = 0;
  itemMode = 0;
  /** `m_sParty`. */
  name = '';
  /** `g_pPlayer->m_szPartyName`: the advanced-party name this player registered before (ADDPARTYNAME). */
  savedName = '';
  private sizeOf = 0;
  private readonly slots: PartySlot[] = Array.from({ length: SLOTS }, emptySlot);
  /** `m_nModeTime`: 0 or 1 on the client. `InitParty` leaves it as it is, as Neuz does. */
  private readonly modes: number[] = new Array<number>(MODES).fill(0);

  constructor(private readonly context: PartyContext) {}

  /** The members in slot order, the leader first. */
  get members(): readonly PartySlot[] {
    return this.slots.slice(0, this.sizeOf);
  }

  size(): number {
    return this.sizeOf;
  }

  /** `FindMember( id ) != -1`. */
  isMember(playerId: number): boolean {
    return this.indexOf(playerId) >= 0;
  }

  /** `IsLeader( id )`: slot 0. */
  isLeader(playerId: number): boolean {
    return this.sizeOf > 0 && this.slots[0]!.playerId === playerId;
  }

  modeOn(mode: number): boolean {
    return (this.modes[mode] ?? 0) !== 0;
  }

  /** A log-out: everything, the modes and the saved name too. */
  reset(): void {
    this.initParty();
    this.modes.fill(0);
    this.savedName = '';
    for (const slot of this.slots) slot.pos = [0, 0, 0];
  }

  apply(message: WorldMessage): PartyEvent[] {
    switch (message.type) {
      case 'partyMember':
        return this.onPartyMember(message);
      case 'setPartyMemberParam':
        return this.onMemberParam(message);
      case 'partyChangeLeader': {
        const i = this.indexOf(message.leaderId);
        // Neuz swaps with index -1 when the id is not a member; the browser changes nothing
        if (i < 0) return [];
        this.swap(0, i);
        return [{ kind: 'iconsCleared' }, { kind: 'changed' }];
      }
      case 'partyExp': {
        this.exp = message.exp;
        this.point = message.point;
        const events = message.level > this.level
          ? [line(message.level === MAX_PARTYLEVEL ? 'TID_GAME_TROUPEUP' : 'TID_GAME_PARTYLUP')]
          : [];
        this.level = message.level;
        return events;
      }
      case 'partyChangeTroup':
        this.kind = 1;
        if (message.name !== '') this.name = message.name;
        return [line('TID_GAME_PARTYCHANGE'), { kind: 'music', id: BGM_IN_FITUP }];
      case 'partyChangeName': {
        const own = this.context.ownPlayerId();
        if (message.name !== '' && message.name !== this.context.defaultName()) {
          this.name = message.name;
          if (this.isLeader(own)) this.savedName = message.name;
          return [line('TID_GAME_PARTY', [message.name])];
        }
        return this.isLeader(own) ? [{ kind: 'nameBox' }] : [];
      }
      case 'myPartyName':
        this.savedName = message.name;
        return [];
      case 'partyItemMode':
        this.itemMode = message.mode;
        return [];
      case 'partyExpMode':
        this.expMode = message.mode;
        return [];
      case 'setPartyMode':
        return this.onSetPartyMode(message);
      case 'partyMapInfo': {
        const slot = message.index >= 0 && message.index < this.sizeOf ? this.slots[message.index]! : undefined;
        if (slot !== undefined && !this.context.inView(slot.playerId)) slot.pos = [...message.pos];
        return [];
      }
      case 'errorParty':
        return this.onError(message.code);
      case 'partyRequest':
        return [{ kind: 'invited', request: message }];
      case 'partyRequestCancel':
        return this.onRequestCancel(message);
      case 'block':
        return message.gu === 7 ? [line('TID_GAME_YETPARTY')] : [];
      default:
        return [];
    }
  }

  private onPartyMember(message: MessageOf<'partyMember'>): PartyEvent[] {
    const own = this.context.ownPlayerId();
    const oldSize = this.sizeOf;
    const party = message.party;
    if (party === null) {
      this.initParty();
      const tid = message.playerId === own ? 'TID_GAME_PARTYEXIT' : 'TID_GAME_PARTYDESTROY';
      return [line(tid), { kind: 'iconsCleared' }, { kind: 'changed' }];
    }
    this.partyId = party.partyId;
    this.kind = party.kind;
    this.sizeOf = Math.min(party.members.length, SLOTS);
    this.level = party.level;
    this.exp = party.exp;
    this.point = party.point;
    this.expMode = party.expMode;
    this.itemMode = party.itemMode;
    party.modeTime.slice(0, MODES).forEach((on, mode) => { this.modes[mode] = on; });
    if (party.kind !== 0) this.name = party.name;
    // only the id and bRemove of each slot: its position stays the slot's
    party.members.slice(0, SLOTS).forEach((member, i) => {
      this.slots[i]!.playerId = member.playerId;
      this.slots[i]!.removed = member.removed;
    });
    const events: PartyEvent[] = [];
    if (oldSize === 0 && this.sizeOf === 2) {
      if (this.isLeader(own)) {
        events.push(line('TID_GAME_PARTYCREATE'), line('TID_GAME_PARTYJOIN1', [message.memberName], OLIVE));
      } else {
        events.push(line('TID_GAME_PARTYJOIN2', [message.leaderName], OLIVE));
      }
      events.push({ kind: 'music', id: BGM_IN_FITUP });
    } else if (oldSize < this.sizeOf) {
      events.push(line('TID_GAME_PARTYJOIN1', [message.memberName], OLIVE));
    } else if (oldSize > this.sizeOf) {
      events.push(line('TID_GAME_PARTYREMOVE', [message.memberName], OLIVE));
    }
    events.push({ kind: 'changed' });
    return events;
  }

  private onMemberParam(message: MessageOf<'setPartyMemberParam'>): PartyEvent[] {
    if (message.param !== PP_REMOVE) return [];
    const i = this.indexOf(message.playerId);
    if (i < 0) return [];
    this.slots[i]!.removed = message.value !== 0;
    if (message.value !== 1 || i !== 0) return [{ kind: 'changed' }];
    for (let j = 1; j < this.sizeOf; j++) {
      if (!this.slots[j]!.removed) {
        this.swap(0, j);
        return [{ kind: 'iconsCleared' }, { kind: 'changed' }];
      }
    }
    this.initParty();
    return [{ kind: 'changed' }];
  }

  private onSetPartyMode(message: MessageOf<'setPartyMode'>): PartyEvent[] {
    if (message.mode < 0 || message.mode >= MODES) return [];
    this.modes[message.mode] = message.on ? 1 : 0;
    if (message.on && message.point !== null) this.point = message.point;
    const skill = PARTY_MODE_SKILL[message.mode];
    if (skill === undefined) return [];
    const name = this.context.skillName(skill);
    return message.on
      ? [{ kind: 'modeOn', mode: message.mode, skill, skillTime: message.skillTime }, line('TID_GAME_TROUPESKILLUSE', [name])]
      : [{ kind: 'modeOff', mode: message.mode, skill }, line('TID_GAME_TROUPESKILLSTOP', [name])];
  }

  private onError(code: number): PartyEvent[] {
    switch (code) {
      case 200: return [line('TID_GAME_PARTYNOINVATE')];
      case 201: return [line(fullPartyTid(this.level), [], OLIVE)];
      case 202: return [line('TID_GAME_NOPARTY')];
      case 203: return [line('TID_GAME_DIFFRENTPARTY')];
      case 204: return [{ kind: 'nameBox' }, { kind: 'box', tid: 'TID_DIAG_0033' }];
      case 205: return [{ kind: 'box', tid: 'TID_DIAG_0046' }];
      case 206: return [{ kind: 'box', tid: 'TID_DIAG_0019' }];
      case 207: return [line('TID_GAME_NOTTARGET')];
      case 208: return [line('TID_GAME_PARTYNOTEXMEMBER')];
      case 209: return [line('TID_GAME_PARTY_ALREADYMASTER')];
      default: return [];
    }
  }

  private onRequestCancel(message: MessageOf<'partyRequestCancel'>): PartyEvent[] {
    const name = this.context.nameInView(message.memberId);
    switch (message.mode) {
      case 0:
        return name === null ? [] : [line('TID_GAME_PARTYFAILINVATE', [name], OLIVE)];
      case 1:
        if (name === null) return [];
        return [line(this.isMember(message.memberId) ? 'TID_GAME_PARTYEXISTCHR' : 'TID_GAME_PARTYOTHER', [name], OLIVE)];
      case 2:
        return [line('TID_GAME_PARTYFAILENTER', [], OLIVE)];
      case 3:
        return name === null ? [] : [line('TID_GAME_PARTYDENY', [name], OLIVE)];
      case 4:
        return [line('TID_GAME_PARTYINVATEOTHERSVR', [], OLIVE)];
      default:
        return [];
    }
  }

  private indexOf(playerId: number): number {
    for (let i = 0; i < this.sizeOf; i++) if (this.slots[i]!.playerId === playerId) return i;
    return -1;
  }

  private swap(a: number, b: number): void {
    const slot = this.slots[a]!;
    this.slots[a] = this.slots[b]!;
    this.slots[b] = slot;
  }

  /** `CParty::InitParty`: the modes and the slots' positions stay. */
  private initParty(): void {
    this.partyId = 0;
    this.sizeOf = 0;
    this.name = '';
    this.level = 1;
    this.exp = 0;
    this.point = 0;
    this.expMode = 0;
    this.itemMode = 0;
    this.kind = 0;
    for (const slot of this.slots) {
      slot.playerId = 0;
      slot.removed = false;
    }
  }
}

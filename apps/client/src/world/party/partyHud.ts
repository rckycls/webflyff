// The party's windows joined to its events and to the session (Piece 7 M4): what Neuz's handlers and windows do with
// `g_Party`'s changes, in one place so that the world screen only routes messages to it.
//
//   CWndMgr::PutString                   _Interface/WndManager.cpp:4027-4100   a line: the HUD's lines, as `say` writes the
//                                                                              skill use's (the port's PutString)
//   CWndMgr::OpenMessageBox              WndManager.cpp                        a box: `MessageBox`
//   CDPClient::OnPartyRequest            Neuz/DPClient.cpp:4544-4579           the invite: a box already open → BLOCK(7),
//                                                                              else CWndPartyConfirm
//   CWndPartyConfirm::OnChildNotify      _Interface/WndPartyConfirm.cpp:102-120 Yes: ADDPARTYMEMBER; No: MEMBERREQUESTCANCLE 0
//   CWndParty::OnChildNotify             _Interface/WndParty.cpp:307-466        Leave's box, Hand Over, Change, the radios
//   CWndPartyChangeTroup, ...ChangeName  _Interface/WndPartyChangeTroup.cpp     the advanced party's boxes: CHANGETROUP
//   CWndMgr::ObjectExecutor APP_PARTY    WndManager.cpp:2625-2659               P: `partyToggle`
//   CWndMgr::Process                     WndManager.cpp:3613-3622               the quick view closes below 2 members
//
// The modes' events (`modeOn`, `modeOff`, `iconsCleared`) are the party skills' (Part B).

import type { WebParty } from '@flyffweb/formats';
import type { MessageOf } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { MoverBuffs } from '../buffs';
import { MessageBox } from '../hud/messageBox';
import type { PartyView } from '../hud/party/memberList';
import { PartyBoxes } from '../hud/party/partyBoxes';
import { PartyBuffRow } from '../hud/party/partyBuffRow';
import { PartyConfirm } from '../hud/party/partyConfirm';
import { PartyQuick } from '../hud/party/partyQuick';
import { PartyWindow } from '../hud/party/partyWindow';
import { partySkillCheck, partyToggle, troupNameCheck } from './partyRules';
import type { PartyEvent, PartyState } from './partyState';

/** What the party's windows send (`WorldSession`'s). */
export interface PartyHudSession {
  sendPartyMemberCancel(leaderId: number, memberId: number, mode: number): void;
  sendAddPartyMember(leader: MessageOf<'partyRequest'>['leader'], member: MessageOf<'partyRequest'>['member']): void;
  sendRemovePartyMember(leaveId: number): void;
  sendChangeTroup(name: string): void;
  sendPartyChangeLeader(newLeaderId: number): void;
  sendPartyItemMode(mode: number): void;
  sendPartyExpMode(mode: number): void;
  sendBlock(inviterName: string): void;
  sendPartySkillUse(skill: number): void;
}

export interface PartyHudScreen {
  session: PartyHudSession;
  /** A line of the HUD's messages, in its colour. */
  say(text: string, color: number): void;
  music(id: number): void;
  /** The members changed: the names' colours again. */
  recolor(): void;
  /** A member's row pressed: that player the target (null: none). */
  target(playerId: number | null): void;
  /** Where the quick view opens: under the status window. */
  quickAt(): { x: number; y: number };
  /** The own player's database ID (`g_pPlayer->m_idPlayer`). */
  ownPlayerId(): number;
  /** The buffs' clock (ms): the mode icons run on it. */
  now(): number;
  /** A party skill of the Skill tab carried to the task bar. */
  carryPartySkill(skill: number, event: PointerEvent): void;
}

const WHITE = 0xffffffff;
/** `BUFF_SKILL` (`_Common/buff.h`): the mode icons' kind. */
const BUFF_SKILL = 1;

export class PartyHud {
  readonly window: PartyWindow;
  readonly quick: PartyQuick;
  readonly boxes: PartyBoxes;
  readonly confirm: PartyConfirm;
  readonly messageBox: MessageBox;
  private readonly catalog: () => WebParty | null;
  readonly buffRow: PartyBuffRow;

  constructor(
    art: UiArt,
    private readonly texts: Texts,
    catalog: () => WebParty | null,
    private readonly screen: PartyHudScreen,
    private readonly party: PartyState,
    /** The party skills' mode icons (`CWndWorld::m_buffs`, [R §8.4]): the screen's, as the party is, so a world change keeps them. */
    readonly modeIcons: MoverBuffs,
    doc: Document = document,
  ) {
    this.catalog = catalog;
    this.buffRow = new PartyBuffRow(art, doc);
    const session = screen.session;
    this.messageBox = new MessageBox(art, doc);
    this.window = new PartyWindow(art, texts, doc);
    this.quick = new PartyQuick(art, doc);
    const defaultName = (): string => texts.get('TID_GAME_PARTY_NAME')?.text ?? 'Advance Party';
    this.boxes = new PartyBoxes(art, texts, (name) => troupNameCheck(name, catalog() ?? { invalidNames: [], letters: '' }, defaultName()), doc);
    this.confirm = new PartyConfirm(art, doc);

    const box = (tid: string): void => this.box(tid);
    this.window.onTarget = (playerId) => screen.target(playerId);
    this.window.onLeave = (leaveId, kick) => this.boxes.leave(leaveId, kick);
    this.window.onHandOver = (playerId) => session.sendPartyChangeLeader(playerId);
    this.window.onChangeTroup = () => this.boxes.changeTroup(party.savedName);
    this.window.onQuick = () => this.toggleQuick();
    this.window.onItemMode = (mode) => session.sendPartyItemMode(mode);
    this.window.onExpMode = (mode) => session.sendPartyExpMode(mode);
    this.window.onLine = (tid) => this.line(tid, [], null);
    this.window.onBox = box;
    this.window.skillTab.onUse = (skill) => this.useSkill(skill);
    this.window.skillTab.onDrag = (skill, event) => screen.carryPartySkill(skill, event);
    this.quick.onSelect = (playerId) => screen.target(playerId);
    this.quick.onDetail = () => {
      if (this.window.frame.isOpen) this.window.frame.close();
      else this.window.frame.open('center');
    };
    this.boxes.onLeaveYes = (leaveId) => session.sendRemovePartyMember(leaveId);
    this.boxes.onName = (name) => session.sendChangeTroup(name);
    this.boxes.onBox = box;
    this.confirm.onYes = (request) => session.sendAddPartyMember(request.leader, request.member);
    this.confirm.onNo = (request) => session.sendPartyMemberCancel(request.leader.id, request.member.id, 0);
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [
      this.buffRow.element, this.window.frame.element, this.quick.frame.element, ...this.boxes.elements, this.confirm.frame.element,
      this.messageBox.element,
    ];
  }

  /** The party state's events, in order. */
  handle(events: readonly PartyEvent[]): void {
    for (const event of events) {
      switch (event.kind) {
        case 'line': this.line(event.tid, event.args, event.color); break;
        case 'box': this.box(event.tid); break;
        case 'music': this.screen.music(event.id); break;
        case 'invited': this.invited(event.request); break;
        case 'nameBox': this.boxes.changeName(this.party.savedName); break;
        case 'changed': this.screen.recolor(); break;
        case 'modeOn': this.modeIcons.add(BUFF_SKILL, event.skill, 1, event.skillTime, this.screen.now()); break;
        case 'iconsCleared': for (const icon of this.modeIcons.list(0)) this.modeIcons.remove(icon.buffType, icon.id); break;
        default: break;
      }
    }
  }

  /** APP_PARTY: P, or Start → Party. */
  toggle(): void {
    const next = partyToggle(this.window.frame.isOpen, this.quick.frame.isOpen, this.party.size());
    if (next.window !== this.window.frame.isOpen) {
      if (next.window) this.window.frame.open('center');
      else this.window.frame.close();
    }
    if (next.quick !== this.quick.frame.isOpen) {
      if (next.quick) this.quick.frame.open(this.screen.quickAt());
      else this.quick.frame.close();
    }
  }

  /** Every frame: the open windows from the party; `busy` while auto-attacking (their presses do nothing then). */
  update(view: PartyView, busy: boolean): void {
    this.window.ignoreClicks = busy;
    this.quick.ignoreClicks = busy;
    if (this.window.frame.isOpen) this.window.update(view);
    if (this.quick.frame.isOpen) this.quick.update(view);
  }

  /**
   * A party skill used, from the task bar or the Skill tab (`ObjectExecutor`, `WndManager.cpp:2779-2876`): the rule
   * (`partySkillCheck`), then PARTYSKILLUSE, a box or a line; nothing without the catalog's row.
   */
  useSkill(skill: number): void {
    const row = this.catalog()?.skills.find((s) => s.id === skill);
    if (row === undefined) return;
    const now = this.screen.now();
    const running = this.modeIcons.list(now).some((icon) => icon.buffType === BUFF_SKILL && icon.id === skill && icon.leftMs > 0);
    const result = partySkillCheck(this.party, this.screen.ownPlayerId(), row, running);
    if (result === null) return;
    if ('send' in result) this.screen.session.sendPartySkillUse(skill);
    else if ('box' in result) this.box(result.box);
    else this.line(result.line, result.args, null);
  }

  /** Every frame: the mode icons, shown while `shown` (mode 4 on, or the leader in view). */
  updateIcons(shown: boolean): void {
    const now = this.screen.now();
    this.modeIcons.step(now);
    this.buffRow.update(this.modeIcons, this.catalog(), shown, now);
  }

  private toggleQuick(): void {
    if (this.quick.frame.isOpen) this.quick.frame.close();
    else if (this.party.size() >= 2) this.quick.frame.open(this.screen.quickAt());
  }

  private invited(request: MessageOf<'partyRequest'>): void {
    if (this.confirm.isOpen) {
      this.screen.session.sendBlock(request.leaderName);
      return;
    }
    const format = this.texts.get('TID_DIAG_0072')?.text ?? '%s invites you to join the party. Do you accept?';
    this.confirm.open(request, formatText(format, [request.leaderName]));
  }

  private line(tid: string, args: readonly string[], color: number | null): void {
    const entry = this.texts.get(tid);
    if (entry === undefined) return;
    this.screen.say(formatText(entry.text, args), color ?? entry.color ?? WHITE);
  }

  /** `OpenMessageBox`: MB_OK, centred (M3's box). */
  private box(tid: string): void {
    const text = this.texts.get(tid)?.text;
    if (text === undefined || text === '') return;
    this.messageBox.open(text, 'ok', () => {});
  }

  /**
   * The windows go with the world (the party stays, the screen's): each closed first, so that no modal holds the keys and no
   * window stays in the frames' Escape order; an open invite goes unanswered, as Neuz's box is never closed by a world change.
   */
  dispose(): void {
    this.confirm.dismiss();
    for (const frame of [this.window.frame, this.quick.frame]) if (frame.isOpen) frame.close();
    this.boxes.close();
    this.messageBox.dispose();
    for (const element of this.elements) element.remove();
  }
}

// The Lord system's windows and HUD (2026-11-11, docs/superpowers/specs/2026-11-11-lord-research.md §1, §2, §6), as Neuz
// opens and runs them:
//
//   CWndWorld::OnCommand MMI_LORD_*      _Interface/WndWorld.cpp:5182-5212   an open one is deleted and a new one made
//   CWndLordInfo                         _Interface/WndLord.cpp:1010-1117    the state, the Lord, the time to the end of the vote
//   CWndLordTender                       WndLord.cpp:318-454                 the total to bid; >= 100,000,000 or a box
//   CWndLordState / CWndLordPledge       WndLord.cpp:28-314                  the 10 candidates; a line opens its pledge; the
//                                                                            candidate's own is edited on a double click
//   CWndLordConfirm                      WndLord.cpp:875-901                 a changed pledge's OK / Cancel (1,000,000 penya)
//   CWndLordVote                         WndLord.cpp:457-596                 the name typed, sent when it is a candidate's
//   CWndLordEvent                        WndLord.cpp:599-716                 the two rates and the cost; Start
//   CWndLordSkill                        WndLord.cpp:720-872                 the 8 icons with their tips, dragged to the bar
//   CWndLordSkillConfirm                 WndLord.cpp:943-1007                Call's and Teleport's target name
//   CWndMgr::ObjectExecutor LORDSKILL    WndManager.cpp:2882-2920            a shortcut press
//   CWndWorld::RenderEventIcon           WndWorld.cpp:10749-10785            the running events' icons after the buffs
//
// The phone (style.css, `.hud-lord`): each window a panel; a tap in place of a drag or a double click: a skill's icon goes
// on the first empty slot of the bar shown, the own pledge's text opens its editor, a vote line fills the name; the info
// window has a Lord Skill button (no L key); lines and buttons a finger's size, text 14 px.

import { ElectionState, NULL_ID, encodeElectionAddDeposit, encodeElectionIncVote,
  encodeElectionSetPledge, encodeLordEventCreate, encodeLordSkillUse } from '@flyffweb/protocol';
import type { LordCandidate, LordMessage } from '@flyffweb/protocol';
import type { UiArt } from '../hud/art';
import { themeKey, themeUrl } from '../hud/art';
import { formatText } from '../hud/format';
import { ResWindow } from '../hud/resWindow';
import { isPhone } from '../hud/numpad';
import {
  LORD_EVENT, LORD_INFO, LORD_PLEDGE, LORD_SKILL, LORD_SKILL_CONFIRM, LORD_STATE, LORD_TENDER, LORD_VOTE,
} from '../hud/lord/lordLayouts';
import { LordBook } from './lordBook';
import type { LordNotice, LordNoticeArg } from './lordBook';
import {
  LORD_CANDIDATE_TEXT, LORD_EVENT_DROP, LORD_EVENT_EXP, LORD_INFO_TEXT, LORD_SKILLS, LordSkillId, MAX_CANDIDATES, MIN_DEPOSIT,
  lordEventCost, lordSkill,
} from './lordData';

/** The NPC menu's Lord entries (`Resource/defineNeuz.h:195-210`). */
export const MMI_LORD = { STATE: 91, TENDER: 92, VOTE: 93, EVENT: 94, INFO: 101, RPINFO: 102 } as const;
export const LORD_ENTRIES: ReadonlySet<number> = new Set([MMI_LORD.STATE, MMI_LORD.TENDER, MMI_LORD.VOTE, MMI_LORD.EVENT, MMI_LORD.INFO]);
/** `APP_LORD_SKILL` (`ResData.h:633`), the L key's applet. */
export const APP_LORD_SKILL = 728;
const NO_LORD = NULL_ID;

export interface PlayerInfo { name: string; level: number; job: number }

/** What the Lord windows ask of the world screen. */
export interface LordHost {
  /** A text of the catalog by its TID, with its colour. */
  text(tid: string): { text: string; color: number } | undefined;
  ownPlayerId(): number;
  ownName(): string;
  /** `CPlayerDataCenter::GetPlayerData( id )`: what is known (queried once when not). */
  player(playerId: number): PlayerInfo | undefined;
  /** `prj.m_aJob[ job ].szName`. */
  jobName(job: number): string;
  /** The focused mover's player name when it is a player (`GetObjFocus`), else null (no focus) or '' (not a player). */
  focusName(): string | null;
  /** `PutString( text, NULL, color )`. */
  say(text: string, color: number): void;
  caption(text: string): void;
  /** `OpenMessageBox( text )`: OK only, or OK / Cancel with `ok`. */
  box(text: string, ok?: () => void): void;
  send(bytes: Uint8Array): void;
  /** The task bar: carry a Lord skill with the mouse, put one on the first empty slot (false when full), drop them all. */
  carryLordSkill(skill: number, event: PointerEvent): void;
  placeLordSkill(skill: number): boolean;
  removeLordShortcuts(): void;
  /** A window of the Lord system opened or closed (the phone hides its own controls). */
  changed?(): void;
}

/** "1,234,567": `CWndLordEvent::OnDraw`'s commas (:668-677). */
export function withCommas(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A rate of `lordevent.inc` as the event window writes it, "  25 %" (`OnDraw`, :654-666, the rounding fix kept). */
export function ratePercent(rate: number): string {
  return `  ${Math.round(100 * rate)} %`;
}

/** A window that takes a line's click only after a press of its own (the phone's ghost click on a newly opened window). */
function guardPresses(window: ResWindow): () => boolean {
  let pressed = false;
  window.frame.element.addEventListener('pointerdown', () => { pressed = true; }, true);
  const open = window.open.bind(window);
  window.open = (at) => { pressed = false; open(at); };
  return () => pressed;
}

export class LordHud {
  readonly book: LordBook;
  readonly info: ResWindow;
  readonly tender: ResWindow;
  readonly state: ResWindow;
  readonly pledge: ResWindow;
  readonly vote: ResWindow;
  readonly event: ResWindow;
  readonly skills: ResWindow;
  readonly skillConfirm: ResWindow;
  /** The running events' icons, after the buffs (`RenderEventIcon`). */
  readonly eventIcons: HTMLElement;
  private readonly pledgeEditor: HTMLTextAreaElement;
  /** The pledge window's candidate (`m_pRanker`) and whether its pledge was empty when the editing began (`m_bIsFirst`). */
  private pledgeOf: LordCandidate | null = null;
  private pledgeFirst = true;
  /** The candidate list's chosen line, 1-based (`m_nSelect`), 0 for none. */
  private chosen = 0;
  private expRow = 0;
  private dropRow = 0;
  /** The skill the name window is for (`m_nType`). */
  private confirmSkill = 0;
  private lastDraw = 0;

  /**
   * @param book the Lord state, kept by the world screen from the join on (the LORD snapshot comes in the JOIN bundle,
   *   before the HUD is made)
   */
  constructor(private readonly host: LordHost, private readonly art: UiArt, private readonly doc: Document = document,
    book: LordBook = new LordBook(() => host.ownPlayerId(), (id) => host.player(id)?.name ?? '')) {
    this.book = book;
    const make = (layout: typeof LORD_INFO, name: string): ResWindow => {
      const window = new ResWindow(layout, art, doc);
      window.frame.element.classList.add('hud-lord', `hud-lord-${name}`);
      window.onClose = () => this.host.changed?.();
      return window;
    };
    this.info = make(LORD_INFO, 'info');
    this.tender = make(LORD_TENDER, 'tender');
    this.state = make(LORD_STATE, 'state');
    this.pledge = make(LORD_PLEDGE, 'pledge');
    this.vote = make(LORD_VOTE, 'vote');
    this.event = make(LORD_EVENT, 'event');
    this.skills = make(LORD_SKILL, 'skill');
    this.skillConfirm = make(LORD_SKILL_CONFIRM, 'skill-confirm');

    // Lord info
    this.info.setText('WIDC_TEXT1', LORD_INFO_TEXT);
    this.info.button('WIDC_BUTTON1').addEventListener('click', () => this.info.close());
    this.info.button('WIDC_LORD_SKILL').addEventListener('click', () => this.openSkills());

    // Bid
    this.tender.setText('WIDC_TEXT1', LORD_CANDIDATE_TEXT);
    const total = this.tender.input('WIDC_EDIT1');
    total.inputMode = 'numeric';
    total.setAttribute('aria-label', 'Current application fee');
    this.tender.button('WIDC_BUTTON1').addEventListener('click', () => this.bid());
    this.tender.button('WIDC_BUTTON2').addEventListener('click', () => this.tender.close());

    // Candidates and the pledge
    const statePressed = guardPresses(this.state);
    this.state.control('WIDC_LISTBOX1').addEventListener('click', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-rank]');
      if (row === null || !statePressed()) return;
      this.openPledge(Number(row.dataset.rank));
    });
    this.state.button('WIDC_BUTTON1').addEventListener('click', () => this.state.close());
    this.pledgeEditor = doc.createElement('textarea');
    this.pledgeEditor.className = 'hud-lord-pledge-editor';
    this.pledgeEditor.setAttribute('aria-label', 'Pledge');
    this.pledgeEditor.addEventListener('keydown', (event) => event.stopPropagation());
    this.pledgeEditor.addEventListener('keyup', (event) => event.stopPropagation());
    this.pledge.control('WIDC_EDIT1').append(this.pledgeEditor);
    this.pledge.control('WIDC_EDIT1').hidden = true;
    const pledgeText = this.pledge.control('WIDC_TEXT1');
    pledgeText.parentElement!.addEventListener('dblclick', () => this.editPledge());
    pledgeText.parentElement!.addEventListener('click', () => { if (isPhone(this.doc)) this.editPledge(); });
    this.pledge.button('WIDC_BUTTON2').addEventListener('click', () => this.sendPledge());
    this.pledge.onClose = () => { this.pledgeOf = null; this.host.changed?.(); };

    // Vote
    const votePressed = guardPresses(this.vote);
    this.vote.control('WIDC_LISTBOX1').addEventListener('click', (event) => {
      // Neuz's list click is commented out (:560-572); on a phone a tap fills the name, a finger's way to type it
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-name]');
      if (row !== null && votePressed() && isPhone(this.doc)) this.vote.input('WIDC_EDIT1').value = row.dataset.name ?? '';
    });
    this.vote.input('WIDC_EDIT1').setAttribute('aria-label', 'Name');
    this.vote.button('WIDC_BUTTON1').addEventListener('click', () => this.castVote());

    // Event
    const exp = LORD_EVENT_EXP.length, drop = LORD_EVENT_DROP.length;
    this.event.button('WIDC_BUTTON1').addEventListener('click', () => { this.expRow = (this.expRow - 1 + exp) % exp; this.drawEvent(); });
    this.event.button('WIDC_BUTTON2').addEventListener('click', () => { this.expRow = (this.expRow + 1) % exp; this.drawEvent(); });
    this.event.button('WIDC_BUTTON3').addEventListener('click', () => { this.dropRow = (this.dropRow - 1 + drop) % drop; this.drawEvent(); });
    // :641 wraps the drop row by the EXP table's size; both tables have 11 rows, so it is the same
    this.event.button('WIDC_BUTTON4').addEventListener('click', () => { this.dropRow = (this.dropRow + 1) % exp; this.drawEvent(); });
    this.event.button('WIDC_BUTTON5').addEventListener('click', () => {
      if (this.book.eventOf(this.host.ownPlayerId()) === undefined) this.host.send(encodeLordEventCreate(this.expRow, this.dropRow));
    });

    // Lord Skill
    this.skills.setText('WIDC_TEXT1', this.tid('TID_GAME_LORD_SKILL_INFO'));
    LORD_SKILLS.forEach((skill, i) => {
      const slot = this.skills.control(`WIDC_CUSTOM${i + 1}`);
      slot.classList.add('hud-lord-skill-icon');
      slot.dataset.skill = String(skill.id);
      slot.style.backgroundImage = themeUrl(art, `${skill.icon}.dds`);
      slot.title = `${skill.name}\n${skill.desc}`;
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-label', skill.name);
      slot.addEventListener('pointerdown', (event) => { if (!isPhone(this.doc)) this.host.carryLordSkill(skill.id, event); });
      slot.addEventListener('click', () => { if (isPhone(this.doc)) this.host.placeLordSkill(skill.id); });
    });

    // Call / Teleport
    this.skillConfirm.input('WIDC_EDIT1').setAttribute('aria-label', 'Character name');
    this.skillConfirm.button('WIDC_BUTTON1').addEventListener('click', () => {
      const name = this.skillConfirm.input('WIDC_EDIT1').value;
      if (name !== '' && this.confirmSkill !== 0) {
        this.send(() => encodeLordSkillUse(this.confirmSkill, name));
        this.skillConfirm.close();
      }
    });

    this.eventIcons = doc.createElement('div');
    this.eventIcons.className = 'hud-lord-events';
  }

  /** The windows, for the world screen's layer. */
  get elements(): HTMLElement[] {
    return [this.info, this.tender, this.state, this.pledge, this.vote, this.event, this.skills, this.skillConfirm].map((w) => w.element);
  }

  get isOpen(): boolean {
    return [this.info, this.tender, this.state, this.pledge, this.vote, this.event, this.skills, this.skillConfirm].some((w) => w.isOpen);
  }

  /** A Lord message of the server, run on the book here (the tests'; the world screen runs its book and calls `notify`). */
  handle(message: LordMessage): void {
    this.notify(this.book.apply(message));
  }

  /** What the book said of a message: the captions, lines and boxes, the windows redrawn. */
  notify(notices: readonly LordNotice[]): void {
    for (const notice of notices) this.notice(notice);
  }

  /** An entry of the Lord Manager's menu (`WndWorld.cpp:5182-5212`): any open one is made anew. */
  openEntry(entry: number): void {
    switch (entry) {
      case MMI_LORD.INFO: this.reopen(this.info); break;
      case MMI_LORD.TENDER: {
        this.reopen(this.tender);
        this.tender.input('WIDC_EDIT1').value = '0'; // OnInitialUpdate's "0", then RefreshDeposit
        this.refreshDeposit();
        break;
      }
      case MMI_LORD.STATE: this.chosen = 0; this.pledge.close(); this.reopen(this.state); break;
      case MMI_LORD.VOTE: this.vote.input('WIDC_EDIT1').value = ''; this.reopen(this.vote); break;
      case MMI_LORD.EVENT: {
        // Initialize: not the Lord, a box and no window (:610-619)
        if (!this.book.isLord()) { this.box('TID_GAME_L_EVENT_CREATE_E001'); return; }
        this.expRow = 0; this.dropRow = 0;
        this.reopen(this.event);
        break;
      }
      default: return;
    }
    this.draw();
  }

  /** The L key's applet (`APP_LORD_SKILL`): toggles the Lord Skill window; not the Lord, a box (:736-746). */
  openSkills(): void {
    if (this.skills.isOpen) { this.skills.close(); return; }
    if (!this.book.isLord()) { this.box('TID_GAME_L_EVENT_CREATE_E001'); return; }
    this.skills.open('center');
    this.host.changed?.();
  }

  /** A `SHORTCUT_LORDSKILL` pressed on the bar (`WndManager.cpp:2882-2920`). */
  useShortcut(skillId: number): void {
    const skill = lordSkill(skillId);
    if (skill === undefined) return;
    if (skillId === LordSkillId.SUMMON || skillId === LordSkillId.TELEPORT) {
      if (this.book.skillTick(skillId) === 0) this.openSkillConfirm(skillId);
      else this.say('TID_GAME_STILLNOTUSE');
      return;
    }
    const focus = this.host.focusName();
    if (focus === null) this.send(() => encodeLordSkillUse(skillId, this.host.ownName()));
    else if (focus !== '') this.send(() => encodeLordSkillUse(skillId, focus));
  }

  /** The share of a Lord skill's cool down gone, or null when it is ready (`RenderLordCollTime`). */
  cooldown(skillId: number): number | null {
    const skill = lordSkill(skillId), tick = this.book.skillTick(skillId);
    if (skill === undefined || tick <= 0 || skill.cooltime <= 0) return null;
    return Math.max(0, Math.min(1, (skill.cooltime - tick) / skill.cooltime));
  }

  /** The task bar's catalog of the Lord skills: icon and name by id. */
  static skillCatalog(): ReadonlyMap<number, { name: string; icon: string }> {
    return new Map(LORD_SKILLS.map((s) => [s.id, { name: s.name, icon: themeKey(`${s.icon}.dds`) }]));
  }

  /** Each frame: the open windows and the event icons once a second (`CWndLordState::Process`'s second, the info's clock). */
  step(nowMs: number): void {
    if (nowMs - this.lastDraw < 1000) return;
    this.lastDraw = nowMs;
    this.draw();
  }

  close(): void {
    for (const w of [this.info, this.tender, this.state, this.pledge, this.vote, this.event, this.skills, this.skillConfirm]) w.close();
  }

  dispose(): void {
    for (const w of [this.info, this.tender, this.state, this.pledge, this.vote, this.event, this.skills, this.skillConfirm]) w.dispose();
    this.eventIcons.remove();
  }

  // --- the notices of the book ---

  private notice(notice: LordNotice): void {
    switch (notice.kind) {
      case 'changed': this.draw(); break;
      case 'caption': this.host.caption(this.format(notice.tid, notice.args)); break;
      case 'say': {
        const color = this.host.text(notice.colorTid ?? notice.tid)?.color ?? 0xffffffff;
        this.host.say(this.format(notice.tid, notice.args), color);
        break;
      }
      case 'box': this.host.box(this.format(notice.tid, notice.args)); break;
      case 'voted': this.vote.close(); break;
      case 'deposit': this.refreshDeposit(); break;
      case 'notLord':
        this.host.removeLordShortcuts();
        this.skills.close();
        this.skillConfirm.close();
        this.event.close();
        break;
    }
  }

  // --- the windows ---

  private reopen(window: ResWindow): void {
    window.close();
    window.open('center');
    this.host.changed?.();
  }

  /** `RefreshDeposit` (:354-374): the own bid in the box. */
  private refreshDeposit(): void {
    const own = this.book.candidate(this.host.ownPlayerId());
    if (own !== undefined) this.tender.input('WIDC_EDIT1').value = String(own.deposit);
  }

  /** WIDC_BUTTON1 (:426-447): `atol` of the box; 100,000,000 or more is sent, less is TID_UPGRADE_ERROR_NOMONEY. */
  private bid(): void {
    const value = Number.parseInt(this.tender.input('WIDC_EDIT1').value.replace(/[,\s]/g, ''), 10);
    if (Number.isFinite(value) && value >= MIN_DEPOSIT) this.host.send(encodeElectionAddDeposit(value));
    else this.box('TID_UPGRADE_ERROR_NOMONEY');
  }

  private openPledge(rank: number): void {
    const ranker = this.book.ranker(rank);
    if (ranker === undefined) return;
    this.chosen = rank;
    this.pledgeOf = ranker;
    this.pledgeFirst = true;
    this.pledge.setText('WIDC_TEXT1', ranker.pledge);
    this.pledge.control('WIDC_TEXT1').parentElement!.hidden = false;
    this.pledge.control('WIDC_EDIT1').hidden = true;
    this.pledge.frame.element.toggleAttribute('data-own', ranker.playerId === this.host.ownPlayerId());
    this.reopen(this.pledge);
    this.draw();
  }

  /** A double click on the text, the candidate's own only (:244-260): the editor with the pledge. */
  private editPledge(): void {
    const ranker = this.pledgeOf;
    if (ranker === null || ranker.playerId !== this.host.ownPlayerId() || !this.pledge.control('WIDC_EDIT1').hidden) return;
    this.pledgeFirst = ranker.pledge === '';
    this.pledgeEditor.value = ranker.pledge;
    this.pledge.control('WIDC_TEXT1').parentElement!.hidden = true;
    this.pledge.control('WIDC_EDIT1').hidden = false;
    this.pledgeEditor.focus();
  }

  /**
   * WIDC_BUTTON2 (:271-304): over 255 a box; a change asks first (CWndLordConfirm, 1,000,000 penya), then sends and closes;
   * a first pledge is sent at once when not empty; the window closes.
   */
  private sendPledge(): void {
    const editing = !this.pledge.control('WIDC_EDIT1').hidden;
    const text = editing ? this.pledgeEditor.value : '';
    if (text.length > 255) { this.box('TID_GUILD_NOTICE_ERROR'); return; }
    if (editing && !this.pledgeFirst) {
      this.host.box(this.tid('TID_GAME_MOD_PLEGDE'), () => {
        if (text !== '' && this.send(() => encodeElectionSetPledge(text))) this.pledge.close();
      });
      return;
    }
    if (text !== '') this.send(() => encodeElectionSetPledge(text));
    this.pledge.close();
  }

  /** WIDC_BUTTON1 (:574-593): the name typed, sent for the candidate who has it; nothing when none has. */
  private castVote(): void {
    const name = this.vote.input('WIDC_EDIT1').value;
    if (name === '') return;
    for (let rank = 1; rank <= MAX_CANDIDATES; rank++) {
      const ranker = this.book.ranker(rank);
      if (ranker !== undefined && ranker.playerId > 0 && this.host.player(ranker.playerId)?.name === name) {
        this.host.send(encodeElectionIncVote(ranker.playerId));
      }
    }
  }

  private openSkillConfirm(skillId: number): void {
    this.confirmSkill = skillId;
    this.skillConfirm.setText('WIDC_TEXT1', this.tid(skillId === LordSkillId.SUMMON ? 'TID_GAME_LORD_SKILL_CONFIRM1' : 'TID_GAME_LORD_SKILL_CONFIRM2'));
    const name = this.skillConfirm.input('WIDC_EDIT1');
    name.value = '';
    name.title = this.tid(skillId === LordSkillId.SUMMON ? 'TID_TIP_LORD_SKILL_CONFIRM1' : 'TID_TIP_LORD_SKILL_CONFIRM2');
    this.reopen(this.skillConfirm);
  }

  /** Redraws the open windows and the event icons. */
  draw(): void {
    if (this.info.isOpen) this.drawInfo();
    if (this.tender.isOpen) this.drawTender();
    if (this.state.isOpen) this.drawState();
    if (this.vote.isOpen) this.drawVote();
    if (this.event.isOpen) this.drawEvent();
    if (this.skills.isOpen) this.drawSkills();
    this.drawEventIcons();
  }

  /** `CWndLordInfo::OnDraw` (:1029-1090). */
  private drawInfo(): void {
    const lord = this.book.lordId;
    let name = '', rest = '';
    if (lord !== NO_LORD) {
      name = this.host.player(lord)?.name ?? '';
      const left = this.book.restTimeEndVote();
      if (left >= 0) {
        const days = Math.floor(left / 86400), hours = Math.floor(left / 3600) % 24, minutes = Math.floor(left / 60) % 60;
        rest = formatText(this.tid('TID_TOOLTIP_DATE'), [days, hours, minutes, left % 60]);
      }
    }
    const state = this.book.state;
    const status = state === ElectionState.CANDIDACY ? 'TID_GAME_LORD_STATUS_L1'
      : state === ElectionState.VOTE ? 'TID_GAME_LORD_STATUS_L2'
        : state === ElectionState.READY && lord !== NO_LORD ? 'TID_GAME_LORD_STATUS_IS' : 'TID_GAME_LORD_STATUS_VA';
    this.setIf(this.info, 'WIDC_STATIC4', this.tid(status));
    this.setIf(this.info, 'WIDC_STATIC5', name);
    this.setIf(this.info, 'WIDC_STATIC6', rest);
  }

  /** `CWndLordTender::OnDraw` (:324-352): every bidder "rank  name". */
  private drawTender(): void {
    const lines = this.book.candidates.map((c, i) => `  ${i + 1}            ${this.host.player(c.playerId)?.name || '....'} `);
    this.setIf(this.tender, 'WIDC_TEXT2', lines.join('\n'));
  }

  /** `CWndLordState::Process` and `OnDraw` (:38-113): the minimum's word, and a line per candidate of the 10. */
  private drawState(): void {
    this.setIf(this.state, 'WIDC_LIVE', this.tid(this.book.isValid() ? 'TID_GAME_LORD_MINREQ_OK' : 'TID_GAME_LORD_MINREQ_NO'));
    const rows: HTMLElement[] = [];
    for (let rank = 1; rank <= MAX_CANDIDATES; rank++) {
      const c = this.book.ranker(rank);
      if (c === undefined || c.playerId <= 0) continue;
      const info = this.host.player(c.playerId);
      rows.push(this.row({ rank: String(rank) }, rank === this.chosen,
        [`  ${rank}        ${info?.name ?? ''}`, 'name'], [info === undefined ? '' : this.host.jobName(info.job), 'class'], ['open', 'pledge']));
    }
    this.replaceRows(this.state.control('WIDC_LISTBOX1'), rows);
  }

  /** `CWndLordVote::OnDraw` (:465-496): level, name and class of each candidate. */
  private drawVote(): void {
    const rows: HTMLElement[] = [];
    for (let rank = 1; rank <= MAX_CANDIDATES; rank++) {
      const c = this.book.ranker(rank);
      if (c === undefined || c.playerId <= 0) continue;
      const info = this.host.player(c.playerId);
      rows.push(this.row({ name: info?.name ?? '' }, false, [String(info?.level ?? ''), 'level'], [info?.name ?? '', 'name'],
        [info === undefined ? '' : this.host.jobName(info.job), 'class']));
    }
    this.replaceRows(this.vote.control('WIDC_LISTBOX1'), rows);
  }

  private drawEvent(): void {
    this.setIf(this.event, 'WIDC_TEXT1', ratePercent(LORD_EVENT_EXP[this.expRow]![0]));
    this.setIf(this.event, 'WIDC_TEXT2', ratePercent(LORD_EVENT_DROP[this.dropRow]![0]));
    this.setIf(this.event, 'WIDC_TEXT3', withCommas(lordEventCost(this.expRow, this.dropRow)));
  }

  private drawSkills(): void {
    for (const skill of LORD_SKILLS) {
      const tick = this.book.skillTick(skill.id);
      const slot = this.skills.control(`WIDC_CUSTOM${skill.id + 1}`);
      slot.toggleAttribute('data-cooling', tick > 0);
      const title = `${skill.name}\n${skill.desc}${tick > 0 ? `\n${formatText(this.tid('TID_TOOLTIP_COOLTIME'), [tick, 0])}` : ''}`;
      if (slot.title !== title) slot.title = title;
    }
  }

  /** `RenderEventIcon` (:10753-10785): Skill_TroGiftbox02.dds per running event, its tip and minutes left. */
  private drawEventIcons(): void {
    const icons = this.book.events.map((e) => {
      const icon = this.doc.createElement('div');
      icon.className = 'hud-lord-event-icon';
      icon.style.backgroundImage = themeUrl(this.art, 'Skill_TroGiftbox02.dds');
      const tip = formatText(this.tid('TID_GAME_LORD_EVENT_TOOLTIP'), [this.host.player(e.playerId)?.name ?? '', e.expFactor * 100, e.dropFactor * 100]);
      icon.title = `${tip}\n${e.tick}`;
      icon.setAttribute('aria-label', tip);
      const time = this.doc.createElement('span');
      time.className = 'hud-lord-event-icon-time';
      time.textContent = `${e.tick}m`;
      icon.append(time);
      return icon;
    });
    const key = this.book.events.map((e) => `${e.playerId}:${e.tick}`).join(',');
    if (this.eventIcons.dataset.key === key) return;
    this.eventIcons.dataset.key = key;
    this.eventIcons.replaceChildren(...icons);
  }

  private row(data: Record<string, string>, chosen: boolean, ...cells: Array<[string, string]>): HTMLElement {
    const row = this.doc.createElement('div');
    row.setAttribute('role', 'option');
    for (const [key, value] of Object.entries(data)) row.dataset[key] = value;
    row.toggleAttribute('data-chosen', chosen);
    row.setAttribute('aria-selected', String(chosen));
    for (const [text, cell] of cells) {
      const span = this.doc.createElement('span');
      span.className = `hud-lord-cell is-${cell}`;
      span.textContent = text;
      row.append(span);
    }
    return row;
  }

  private replaceRows(list: HTMLElement, rows: HTMLElement[]): void {
    const key = rows.map((r) => r.textContent + (r.hasAttribute('data-chosen') ? '*' : '')).join('|');
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...rows);
  }

  private setIf(window: ResWindow, id: string, text: string): void {
    if (window.control(id).textContent !== text) window.setText(id, text);
  }

  private tid(tid: string): string {
    return this.host.text(tid)?.text ?? '';
  }

  private format(tid: string, args: LordNoticeArg[] = []): string {
    return formatText(this.tid(tid), args);
  }

  private say(tid: string): void {
    const entry = this.host.text(tid);
    if (entry !== undefined && entry.text !== '') this.host.say(entry.text, entry.color);
  }

  private box(tid: string): void {
    this.host.box(this.tid(tid));
  }

  /** A packet made by `make`, which refuses text the game cannot send (a box of the error then). */
  private send(make: () => Uint8Array): boolean {
    try {
      this.host.send(make());
      return true;
    } catch (error) {
      if (error instanceof RangeError) { this.host.box(error.message); return false; }
      throw error;
    }
  }
}

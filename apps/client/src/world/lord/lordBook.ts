// The Lord system's client state (2026-11-11, docs/superpowers/specs/2026-11-11-lord-research.md §1-§3): `CCLord` with its
// election (`CCElection`), events (`CLEvent`) and skill ticks, run on the server's messages the way Neuz runs them:
//
//   IElection::AddDeposit ... EndVote, PrepareNext   _Common/lord.cpp:221-342   the steps and the two sorts (deposit, then
//                                                                                votes; ties by the earlier first bid)
//   IElection::GetNextBegin                          lord.cpp:184-200            the next begin: + nDays, or the next
//                                                                                start day and hour from now
//   CCElection::DoTest* / Do*Complete                Neuz/clord.cpp:75-206       the captions, the chat lines and the boxes
//   CLEvent::DoTestAddComponent                      clord.cpp:263-294           the event's caption and chat line
//   ILordEvent::SerializeTick, EraseExpiredComponents  lord.cpp:604-642          the event minutes, those at 0 dropped
//   CDPClient::OnLordSkillUse                        Neuz/DPClient.cpp:17870-17901  the skill's cool down set here (`Use`)
//
// The book returns notices; LordHud shows them and refreshes the windows.

import { ElectionState, NULL_ID } from '@flyffweb/protocol';
import type { LordCandidate, LordElection, LordEvent, LordMessage, LordSnapshot } from '@flyffweb/protocol';
import { MAX_CANDIDATES, lordSkill } from './lordData';

export type LordNoticeArg = string | number;

export type LordNotice =
  /** Something changed: the open windows redraw. */
  | { kind: 'changed' }
  /** `g_Caption1.AddCaption( text )`. */
  | { kind: 'caption'; tid: string; args?: LordNoticeArg[] }
  /** `PutString( text, NULL, color )`: the TID's own colour, or that of `colorTid`. */
  | { kind: 'say'; tid: string; args?: LordNoticeArg[]; colorTid?: string }
  /** `OpenMessageBox( text )` / `OpenMessageBoxUpper`. */
  | { kind: 'box'; tid: string; args?: LordNoticeArg[] }
  /** The own vote was counted: the vote window closes (`clord.cpp:157`). */
  | { kind: 'voted' }
  /** The own bid changed: the bid window shows it (`RefreshDeposit`). */
  | { kind: 'deposit' }
  /** The election ended and the own player is not the Lord: shortcuts and Lord windows go (`clord.cpp:170-206`). */
  | { kind: 'notLord' };

/** `CTime` is local time: the next start day (1 = Sunday) and hour after `nowSec`, as `GetNextBegin` with no begin. */
export function firstBegin(dayOfWeek: number, hour: number, nowSec: number): number {
  const now = new Date(nowSec * 1000);
  let d = dayOfWeek - (now.getDay() + 1);
  if (d < 0) d += 7;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, hour, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
  return Math.floor(next.getTime() / 1000);
}

const byDeposit = (a: LordCandidate, b: LordCandidate): number => (a.deposit === b.deposit ? a.created - b.created : b.deposit - a.deposit);
const byVotes = (a: LordCandidate, b: LordCandidate): number => (a.votes === b.votes ? a.created - b.created : b.votes - a.votes);

export class LordBook {
  lordId = NULL_ID;
  election: LordElection | null = null;
  events: LordEvent[] = [];
  /** Each skill's cool down left in minutes, by skill id. */
  readonly skillTicks = new Map<number, number>();

  /**
   * @param ownPlayerId the own player's id (`election::IsActivePlayer`)
   * @param nameOf a player's name, empty when unknown (`CPlayerDataCenter::GetPlayerString`)
   * @param nowSec the clock in seconds (`time_null()`)
   */
  constructor(
    private readonly ownPlayerId: () => number,
    private readonly nameOf: (playerId: number) => string,
    private readonly nowSec: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  get state(): number {
    return this.election?.state ?? ElectionState.READY;
  }

  get candidates(): readonly LordCandidate[] {
    return this.election?.candidates ?? [];
  }

  isLord(playerId = this.ownPlayerId()): boolean {
    return this.lordId !== NULL_ID && this.lordId === playerId;
  }

  candidate(playerId: number): LordCandidate | undefined {
    return this.candidates.find((c) => c.playerId === playerId);
  }

  /** `GetRanker( n )` (`clord.cpp:234-244`): the candidate at 1-based rank `rank`. */
  ranker(rank: number): LordCandidate | undefined {
    return rank > 0 ? this.candidates[rank - 1] : undefined;
  }

  /** `IElection::GetVote`: the votes cast. */
  totalVotes(): number {
    return this.candidates.reduce((sum, c) => sum + c.votes, 0);
  }

  /** `IsValid`: enough votes for a Lord. */
  isValid(): boolean {
    return this.totalVotes() >= (this.election?.requirement ?? 0);
  }

  /** `GetRestTimeEndVote` (`clord.h:39-40`): seconds to the end of the (next) vote, the Lord's term. */
  restTimeEndVote(): number {
    const e = this.election;
    if (e === null) return -1;
    return e.begin + e.property.candidacySeconds + e.property.voteSeconds - this.nowSec();
  }

  skillTick(id: number): number {
    return this.skillTicks.get(id) ?? 0;
  }

  /** The own Lord's running event (`GetComponent( idPlayer )`). */
  eventOf(playerId: number): LordEvent | undefined {
    return this.events.find((e) => e.playerId === playerId);
  }

  apply(message: LordMessage): LordNotice[] {
    switch (message.type) {
      case 'lord': return this.restore(message.lord);
      case 'electionAddDeposit': return this.addDeposit(message.playerId, message.deposit, message.created);
      case 'electionSetPledge': {
        const c = this.candidate(message.playerId);
        if (c === undefined) return [];
        c.pledge = message.pledge;
        return [{ kind: 'changed' }];
      }
      case 'electionIncVote': return this.incVote(message.playerId, message.voterId);
      case 'electionBeginCandidacy':
        if (this.election !== null) this.election.state = ElectionState.CANDIDACY;
        return [{ kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_BEGIN_CANDIDACY_01' }, { kind: 'changed' }];
      case 'electionBeginVote': return this.beginVote(message.requirement);
      case 'electionEndVote': return this.endVote(message.lordId);
      case 'lordEventCreate': return this.addEvent(message.event);
      case 'lordEventInitialize':
        this.events = [];
        return [{ kind: 'changed' }];
      case 'lordSkillTick':
        for (const { id, tick } of message.ticks) if (lordSkill(id) !== undefined) this.skillTicks.set(id, tick);
        return [{ kind: 'changed' }];
      case 'lordEventTick':
        for (const { id, tick } of message.ticks) {
          const event = this.eventOf(id);
          if (event !== undefined) event.tick = tick;
        }
        this.events = this.events.filter((e) => e.tick !== 0);
        return [{ kind: 'changed' }];
      case 'lordSkillUse': {
        const skill = lordSkill(message.skill);
        if (skill !== undefined) this.skillTicks.set(skill.id, skill.cooltime); // Execute → Use()
        return [{ kind: 'changed' }];
      }
      default: return [];
    }
  }

  private restore(lord: LordSnapshot): LordNotice[] {
    this.lordId = lord.lordId;
    this.election = { ...lord.election, candidates: lord.election.candidates.map((c) => ({ ...c })) };
    this.events = lord.events.map((e) => ({ ...e }));
    this.skillTicks.clear();
    for (const { id, tick } of lord.skillTicks) if (lordSkill(id) !== undefined) this.skillTicks.set(id, tick);
    return [{ kind: 'changed' }];
  }

  private addDeposit(playerId: number, deposit: number, created: number): LordNotice[] {
    const e = this.election;
    if (e === null) return [];
    const notices: LordNotice[] = [];
    let c = this.candidate(playerId);
    if (playerId === this.ownPlayerId()) {
      const old = c?.deposit ?? 0;
      notices.push(old !== 0
        ? { kind: 'box', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S001', args: [old, deposit, old + deposit] }
        : { kind: 'box', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S002', args: [deposit] });
      notices.push({ kind: 'say', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S003' });
    }
    if (c === undefined) {
      c = { playerId, deposit: 0, votes: 0, created, pledge: '' };
      e.candidates.push(c);
    }
    c.deposit += deposit;
    e.candidates.sort(byDeposit);
    notices.push({ kind: 'deposit' }, { kind: 'changed' });
    return notices;
  }

  private incVote(playerId: number, voterId: number): LordNotice[] {
    const notices: LordNotice[] = [];
    if (voterId === this.ownPlayerId()) {
      notices.push({ kind: 'voted' }, { kind: 'box', tid: 'TID_GAME_VOTE_COMPLETE', args: [this.nameOf(playerId)] });
    }
    const c = this.candidate(playerId);
    if (c !== undefined) c.votes++;
    notices.push({ kind: 'changed' });
    return notices;
  }

  private beginVote(requirement: number): LordNotice[] {
    const e = this.election;
    const notices: LordNotice[] = [
      { kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_BEGIN_VOTE_01' },
      { kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_BEGIN_VOTE_02' },
    ];
    if (e === null) return notices;
    // DoTestBeginVote runs before the list is cut: every own entry in it (one at most) hears it
    if (e.candidates.some((c) => c.playerId === this.ownPlayerId())) notices.push({ kind: 'box', tid: 'TID_GAME_ELECTION_BEGIN_VOTE_S001' });
    e.state = ElectionState.VOTE;
    if (e.candidates.length > MAX_CANDIDATES) e.candidates.splice(MAX_CANDIDATES);
    e.requirement = requirement;
    notices.push({ kind: 'changed' });
    return notices;
  }

  private endVote(lordId: number): LordNotice[] {
    const e = this.election;
    e?.candidates.sort(byVotes);
    const notices: LordNotice[] = [{ kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_END_VOTE_01' }];
    if (lordId !== NULL_ID) {
      const name = this.nameOf(lordId);
      notices.push({ kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_END_VOTE_02', args: [name] },
        { kind: 'say', tid: 'TID_GAME_ELECTION_END_VOTE_S000', args: [name] });
    } else {
      notices.push({ kind: 'say', tid: 'TID_GAME_ELECTION_END_VOTE_S001' });
    }
    this.lordId = lordId;
    this.skillTicks.clear(); // ResetSkill
    if (e !== null) { // PrepareNext
      e.state = ElectionState.READY;
      e.candidates = [];
      e.begin = e.begin !== 0 ? e.begin + e.property.days * 86400 : firstBegin(e.property.dayOfWeek, e.property.hour, this.nowSec());
      e.id++;
    }
    if (!this.isLord()) notices.push({ kind: 'notLord' });
    notices.push({ kind: 'changed' });
    return notices;
  }

  private addEvent(event: LordEvent): LordNotice[] {
    this.events.push({ ...event });
    const lord = this.nameOf(this.lordId);
    const e = event.expFactor * 100, i = event.dropFactor * 100;
    const notices: LordNotice[] = [];
    if (event.expFactor > 0 && event.dropFactor > 0) {
      notices.push({ kind: 'caption', tid: 'TID_GAME_L_EVENT_CREATE_S001' },
        { kind: 'say', tid: 'TID_GAME_L_EVENT_CREATE_S004', args: [lord, e, i], colorTid: 'TID_ADMIN_ANNOUNCE' });
    } else if (event.expFactor > 0) {
      notices.push({ kind: 'caption', tid: 'TID_GAME_L_EVENT_CREATE_S002' },
        { kind: 'say', tid: 'TID_GAME_L_EVENT_CREATE_S005', args: [lord, e], colorTid: 'TID_ADMIN_ANNOUNCE' });
    } else if (event.dropFactor > 0) {
      notices.push({ kind: 'caption', tid: 'TID_GAME_L_EVENT_CREATE_S003' },
        { kind: 'say', tid: 'TID_GAME_L_EVENT_CREATE_S006', args: [lord, i], colorTid: 'TID_ADMIN_ANNOUNCE' });
    }
    notices.push({ kind: 'changed' });
    return notices;
  }
}

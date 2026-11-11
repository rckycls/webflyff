// The Lord system's packets (2026-11-11, docs/superpowers/specs/2026-11-11-lord-research.md §3), both ways. The reads copy
// Neuz's handlers, the writes its senders; the server's writers are `CUser::AddLord`, `CUserMng::AddElection*` ...
// (`WORLDSERVER/User.cpp:8160-8335`). The build is Win32 with `_USE_32BIT_TIME_T`: `time_t` and `size_t` are 4 bytes.
//
//   snapshots   CDPClient::OnElectionAddDeposit ... OnLordSkillUse   Neuz/DPClient.cpp:17782-17901 (dispatch :753-778)
//               CLord::Serialize                                     _Common/lord.cpp:361-371 (election :151-177,
//                                                                    property :56-95, candidate :39-53, event :582-602,
//                                                                    ticks :604-629, skills lordskill.cpp:157-181)
//   senders     SendElectionAddDeposit ... SendLordSkillUse          Neuz/DPClient.cpp:17903-17936

import type { ArReader } from '../ar/ArReader';
import { encodeGameText } from '../text';
import { clientPacket } from './packet';

/** The Lord's packet types, client to world (`Source/_Network/MsgHdr.h:755-767`). */
export const LordPacket = {
  ELECTION_ADD_DEPOSIT: 0x8fff0000,
  ELECTION_SET_PLEDGE: 0x8fff0001,
  ELECTION_INC_VOTE: 0x8fff0002,
  L_EVENT_CREATE: 0x8fff0008,
  LORD_SKILL_USE: 0x8fff0009,
} as const;

/** The Lord's snapshot types (`MsgHdr.h:1226-1239`). */
export const LordMessageType = {
  ELECTION_ADD_DEPOSIT: 0x8f00,
  ELECTION_SET_PLEDGE: 0x8f01,
  ELECTION_INC_VOTE: 0x8f02,
  ELECTION_BEGIN_CANDIDACY: 0x8f03,
  ELECTION_BEGIN_VOTE: 0x8f04,
  ELECTION_END_VOTE: 0x8f05,
  LORD: 0x8f06,
  L_EVENT_CREATE: 0x8f08,
  L_EVENT_INITIALIZE: 0x8f09,
  LORD_SKILL_TICK: 0x8f0a,
  L_EVENT_TICK: 0x8f0b,
  LORD_SKILL_USE: 0x8f0d,
} as const;

/** `IElection::ELECTION_STATE` (`_Common/lord.h:56`). */
export const ElectionState = { READY: 0, CANDIDACY: 1, VOTE: 2, EXPIRED: 3 } as const;

/** `CCandidate::nMaxPledgeLen` (`lord.h:25`): the pledge's buffer, so at most 254 bytes. */
export const MAX_PLEDGE = 255;
/** `MAX_PLAYER`: a name's buffer. */
const MAX_PLAYER = 32;

/** A candidate (`CCandidate`): the deposit is an `__int64`, kept as a number (it stays far below 2^53). */
export interface LordCandidate {
  playerId: number;
  deposit: number;
  votes: number;
  /** `m_tCreate`: when the first bid came, in seconds; it breaks ties. */
  created: number;
  pledge: string;
}

/** `IElection::sProperty`: `election.inc` as the DB server read it. */
export interface ElectionProperty {
  /** 1 = Sunday ... 7 = Saturday. */
  dayOfWeek: number;
  hour: number;
  candidacySeconds: number;
  voteSeconds: number;
  requirementFactor: number;
  days: number;
  /** The deposit returned by final rank 1-10, then the rate for a bidder left out of the top 10. */
  returnRates: number[];
  /** The Lord's items, male then female. */
  items: [number[], number[]];
}

export interface LordElection {
  id: number;
  state: number;
  /** `m_tBegin`: the start of the candidacy, in seconds (0 before the first election). */
  begin: number;
  requirement: number;
  property: ElectionProperty;
  candidates: LordCandidate[];
}

/** A Lord event (`CLEComponent`): `tick` minutes left, the Lord who started it and its two rates (0.05 = 5 %). */
export interface LordEvent {
  tick: number;
  playerId: number;
  expFactor: number;
  dropFactor: number;
}

export interface LordTick { id: number; tick: number }

/** The whole state (`CLord::Serialize`). `lordId` is `NULL_ID` when there is no Lord. */
export interface LordSnapshot {
  lordId: number;
  election: LordElection;
  events: LordEvent[];
  /** Each skill's cool down left, in minutes. */
  skillTicks: LordTick[];
}

export type LordMessage =
  | { type: 'lord'; lord: LordSnapshot }
  /** A bid added: `deposit` is the amount added, not the total. */
  | { type: 'electionAddDeposit'; playerId: number; deposit: number; created: number }
  | { type: 'electionSetPledge'; playerId: number; pledge: string }
  | { type: 'electionIncVote'; playerId: number; voterId: number }
  | { type: 'electionBeginCandidacy' }
  | { type: 'electionBeginVote'; requirement: number }
  /** `lordId` `NULL_ID`: nobody was elected. */
  | { type: 'electionEndVote'; lordId: number }
  | { type: 'lordEventCreate'; event: LordEvent }
  | { type: 'lordEventInitialize' }
  | { type: 'lordSkillTick'; ticks: LordTick[] }
  /** Each event's minutes left by its Lord's player id (`ILordEvent::SerializeTick`); those at 0 then go. */
  | { type: 'lordEventTick'; ticks: LordTick[] }
  /** The message's object is the Lord; `targetId` a player id (the Lord's own for a skill on self). */
  | { type: 'lordSkillUse'; targetId: number; skill: number };

const count = (r: ArReader): number => r.u32();

export function readLordCandidate(r: ArReader): LordCandidate {
  const playerId = r.u32(), deposit = Number(r.i64()), votes = r.i32(), created = r.i32();
  return { playerId, deposit, votes, created, pledge: r.string(MAX_PLEDGE) };
}

function readProperty(r: ArReader): ElectionProperty {
  const dayOfWeek = r.i32(), hour = r.i32(), candidacySeconds = r.i32(), voteSeconds = r.i32();
  const requirementFactor = r.f32(), days = r.i32();
  const returnRates = Array.from({ length: count(r) }, () => r.f32());
  const male = Array.from({ length: count(r) }, () => r.i32());
  const female = Array.from({ length: count(r) }, () => r.i32());
  return { dayOfWeek, hour, candidacySeconds, voteSeconds, requirementFactor, days, returnRates, items: [male, female] };
}

export function readLordEvent(r: ArReader): LordEvent {
  const tick = r.i32(), playerId = r.u32(), expFactor = r.f32();
  return { tick, playerId, expFactor, dropFactor: r.f32() };
}

/** LORD (`CDPClient::OnLord`, :17838-17841). */
export function readLord(r: ArReader): LordMessage {
  const lordId = r.u32();
  const id = r.u32(), state = r.i32(), begin = r.i32(), requirement = r.i32();
  const property = readProperty(r);
  const candidates = Array.from({ length: count(r) }, () => readLordCandidate(r));
  const events = Array.from({ length: count(r) }, () => readLordEvent(r));
  const skillTicks = Array.from({ length: count(r) }, () => { const skill = r.i32(); return { id: skill, tick: r.i32() }; });
  return { type: 'lord', lord: { lordId, election: { id, state, begin, requirement, property, candidates }, events, skillTicks } };
}

/** The snapshot readers of the Lord system, for `WORLD_READERS`. */
export const LORD_READERS: ReadonlyArray<[number, (r: ArReader) => LordMessage]> = [
  [LordMessageType.ELECTION_ADD_DEPOSIT, (r) => {
    const playerId = r.u32(), deposit = Number(r.i64());
    return { type: 'electionAddDeposit', playerId, deposit, created: r.i32() };
  }],
  [LordMessageType.ELECTION_SET_PLEDGE, (r) => { const playerId = r.u32(); return { type: 'electionSetPledge', playerId, pledge: r.string(MAX_PLEDGE) }; }],
  [LordMessageType.ELECTION_INC_VOTE, (r) => { const playerId = r.u32(); return { type: 'electionIncVote', playerId, voterId: r.u32() }; }],
  [LordMessageType.ELECTION_BEGIN_CANDIDACY, () => ({ type: 'electionBeginCandidacy' })],
  [LordMessageType.ELECTION_BEGIN_VOTE, (r) => ({ type: 'electionBeginVote', requirement: r.i32() })],
  [LordMessageType.ELECTION_END_VOTE, (r) => ({ type: 'electionEndVote', lordId: r.u32() })],
  [LordMessageType.LORD, readLord],
  [LordMessageType.L_EVENT_CREATE, (r) => ({ type: 'lordEventCreate', event: readLordEvent(r) })],
  [LordMessageType.L_EVENT_INITIALIZE, () => ({ type: 'lordEventInitialize' })],
  [LordMessageType.LORD_SKILL_TICK, (r) => ({
    type: 'lordSkillTick', ticks: Array.from({ length: count(r) }, () => { const id = r.i32(); return { id, tick: r.i32() }; }),
  })],
  [LordMessageType.L_EVENT_TICK, (r) => ({
    type: 'lordEventTick', ticks: Array.from({ length: count(r) }, () => { const id = r.u32(); return { id, tick: r.i32() }; }),
  })],
  [LordMessageType.LORD_SKILL_USE, (r) => { const targetId = r.u32(); return { type: 'lordSkillUse', targetId, skill: r.i32() }; }],
];

const LORD_TYPES: ReadonlySet<string> = new Set([
  'lord', 'electionAddDeposit', 'electionSetPledge', 'electionIncVote', 'electionBeginCandidacy', 'electionBeginVote',
  'electionEndVote', 'lordEventCreate', 'lordEventInitialize', 'lordSkillTick', 'lordEventTick', 'lordSkillUse',
]);

/** Whether a world message is one of the Lord system's. */
export function isLordMessage(message: { type: string }): message is LordMessage {
  return LORD_TYPES.has(message.type);
}

// --- the client's packets ---

/** `SendElectionAddDeposit( iDeposit )` (:17903-17908): the **total** to have bid (`__int64`); the server takes the difference. */
export const encodeElectionAddDeposit = (total: number): Uint8Array =>
  clientPacket(LordPacket.ELECTION_ADD_DEPOSIT).i64(BigInt(Math.trunc(total))).toBytes();

/** `SendElectionSetPledge( szPledge )` (:17910-17915): at most 254 bytes, line breaks kept (`EBS_WANTRETURN`). */
export function encodeElectionSetPledge(pledge: string): Uint8Array {
  const bytes = encodeGameText(pledge, MAX_PLEDGE - 1, true);
  return clientPacket(LordPacket.ELECTION_SET_PLEDGE).i32(bytes.length).bytes(bytes).toBytes();
}

/** `SendElectionIncVote( idPlayer )` (:17917-17922): the candidate's player id. */
export const encodeElectionIncVote = (playerId: number): Uint8Array =>
  clientPacket(LordPacket.ELECTION_INC_VOTE).u32(playerId).toBytes();

/** `SendLEventCreate( iEEvent, iIEvent )` (:17924-17929): the rows of `lordevent.inc`'s two tables. */
export const encodeLordEventCreate = (expRow: number, dropRow: number): Uint8Array =>
  clientPacket(LordPacket.L_EVENT_CREATE).i32(expRow).i32(dropRow).toBytes();

/** `SendLordSkillUse( nSkill, szTarget )` (:17931-17936): the skill id and the target's name (the Lord's own for self). */
export function encodeLordSkillUse(skill: number, target: string): Uint8Array {
  const bytes = encodeGameText(target, MAX_PLAYER - 1);
  return clientPacket(LordPacket.LORD_SKILL_USE).i32(skill).i32(bytes.length).bytes(bytes).toBytes();
}

/** For the pretend servers: a Lord packet the client sent, after its type. */
export type LordRequestPacket =
  | { type: 'electionAddDepositRequest'; total: number }
  | { type: 'electionSetPledgeRequest'; pledge: string }
  | { type: 'electionIncVoteRequest'; playerId: number }
  | { type: 'lordEventCreateRequest'; expRow: number; dropRow: number }
  | { type: 'lordSkillUseRequest'; skill: number; target: string };

export function readLordRequestPacket(packetType: number, r: ArReader): LordRequestPacket | null {
  switch (packetType) {
    case LordPacket.ELECTION_ADD_DEPOSIT: return { type: 'electionAddDepositRequest', total: Number(r.i64()) };
    case LordPacket.ELECTION_SET_PLEDGE: return { type: 'electionSetPledgeRequest', pledge: r.string(MAX_PLEDGE) };
    case LordPacket.ELECTION_INC_VOTE: return { type: 'electionIncVoteRequest', playerId: r.u32() };
    case LordPacket.L_EVENT_CREATE: { const expRow = r.i32(); return { type: 'lordEventCreateRequest', expRow, dropRow: r.i32() }; }
    case LordPacket.LORD_SKILL_USE: { const skill = r.i32(); return { type: 'lordSkillUseRequest', skill, target: r.string(MAX_PLAYER) }; }
    default: return null;
  }
}

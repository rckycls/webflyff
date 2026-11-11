// 2026-11-11: the Lord system's snapshots as the world server writes them (`CUser::AddLord`, `CUser::AddLordSkillTick`,
// `CUserMng::AddElection*`, `AddLEvent*`, `AddLordSkillUse`, `WORLDSERVER/User.cpp:8160-8335`), in the order of the readers
// (`@flyffweb/protocol` world/lord.ts). All but LORD_SKILL_USE have the object `NULL_ID`.

import { ArWriter, LordMessageType, NULL_ID, encodeGameText } from '@flyffweb/protocol';
import type { ElectionProperty, LordCandidate, LordElection, LordEvent, LordSnapshot, LordTick } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (type: number, w: ArWriter = new ArWriter(), objectId = NULL_ID): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** `Resource/election.inc` as the DB server reads it. */
export const STOCK_ELECTION_PROPERTY: ElectionProperty = {
  dayOfWeek: 6, hour: 0, candidacySeconds: 86400, voteSeconds: 172800, requirementFactor: 0.1, days: 14,
  returnRates: [1, 1, 0.8, 0.6, 0.4, 0.2, 0, 0, 0, 0, 0.98],
  items: [[], []],
};

/** A pledge as `CAr::WriteString` writes it: the game's code page, line breaks kept. */
function pledge(w: ArWriter, text: string): ArWriter {
  const bytes = encodeGameText(text, 254, true);
  return w.i32(bytes.length).bytes(bytes);
}

function writeCandidate(w: ArWriter, c: LordCandidate): void {
  pledge(w.u32(c.playerId).i64(BigInt(c.deposit)).i32(c.votes).i32(c.created), c.pledge);
}

function writeEvent(w: ArWriter, e: LordEvent): void {
  w.i32(e.tick).u32(e.playerId).f32(e.expFactor).f32(e.dropFactor);
}

function writeTicks(w: ArWriter, ticks: readonly LordTick[]): void {
  w.u32(ticks.length);
  for (const t of ticks) w.i32(t.id).i32(t.tick);
}

/** An election with the stock property; `begin` in seconds. */
export function lordElection(partial: Partial<LordElection> = {}): LordElection {
  return { id: 1, state: 0, begin: 0, requirement: 0, property: STOCK_ELECTION_PROPERTY, candidates: [], ...partial };
}

/** LORD (`CUser::AddLord`, :8161-8168, `CLord::Serialize`). */
export function writeLord(lord: Partial<LordSnapshot> = {}): ScriptMessage {
  const { lordId = NULL_ID, election = lordElection(), events = [], skillTicks = [] } = lord;
  const w = new ArWriter().u32(lordId);
  w.u32(election.id).i32(election.state).i32(election.begin).i32(election.requirement);
  const p = election.property;
  w.i32(p.dayOfWeek).i32(p.hour).i32(p.candidacySeconds).i32(p.voteSeconds).f32(p.requirementFactor).i32(p.days);
  w.u32(p.returnRates.length);
  for (const rate of p.returnRates) w.f32(rate);
  for (const items of p.items) { w.u32(items.length); for (const item of items) w.i32(item); }
  w.u32(election.candidates.length);
  for (const c of election.candidates) writeCandidate(w, c);
  w.u32(events.length);
  for (const e of events) writeEvent(w, e);
  writeTicks(w, skillTicks);
  return scripted(LordMessageType.LORD, w);
}

/** ELECTION_ADD_DEPOSIT (`AddElectionAddDeposit`, :8253-8260): the amount added and `tCreate`. */
export const writeElectionAddDeposit = (playerId: number, deposit: number, created: number): ScriptMessage =>
  scripted(LordMessageType.ELECTION_ADD_DEPOSIT, new ArWriter().u32(playerId).i64(BigInt(deposit)).i32(created));

/** ELECTION_SET_PLEDGE (`AddElectionSetPledge`, :8262-8270). */
export const writeElectionSetPledge = (playerId: number, text: string): ScriptMessage =>
  scripted(LordMessageType.ELECTION_SET_PLEDGE, pledge(new ArWriter().u32(playerId), text));

/** ELECTION_INC_VOTE (`AddElectionIncVote`, :8272-8279). */
export const writeElectionIncVote = (playerId: number, voterId: number): ScriptMessage =>
  scripted(LordMessageType.ELECTION_INC_VOTE, new ArWriter().u32(playerId).u32(voterId));

/** ELECTION_BEGIN_CANDIDACY (`AddElectionBeginCandidacy`, :8227-8233). */
export const writeElectionBeginCandidacy = (): ScriptMessage => scripted(LordMessageType.ELECTION_BEGIN_CANDIDACY);

/** ELECTION_BEGIN_VOTE (`AddElectionBeginVote`, :8235-8242). */
export const writeElectionBeginVote = (requirement = 0): ScriptMessage =>
  scripted(LordMessageType.ELECTION_BEGIN_VOTE, new ArWriter().i32(requirement));

/** ELECTION_END_VOTE (`AddElectionEndVote`, :8244-8251): the new Lord, `NULL_ID` for none. */
export const writeElectionEndVote = (lordId: number): ScriptMessage =>
  scripted(LordMessageType.ELECTION_END_VOTE, new ArWriter().u32(lordId));

/** L_EVENT_CREATE (`AddLEventCreate`, :8281-8288). */
export function writeLordEventCreate(event: LordEvent): ScriptMessage {
  const w = new ArWriter();
  writeEvent(w, event);
  return scripted(LordMessageType.L_EVENT_CREATE, w);
}

/** L_EVENT_INITIALIZE (`AddLEventInitialize`, :8290-8296). */
export const writeLordEventInitialize = (): ScriptMessage => scripted(LordMessageType.L_EVENT_INITIALIZE);

/** L_EVENT_TICK (`AddLEventTick`, :8298-8305): each event's minutes left, by its Lord's player id. */
export function writeLordEventTick(ticks: readonly LordTick[]): ScriptMessage {
  const w = new ArWriter();
  writeTicks(w, ticks);
  return scripted(LordMessageType.L_EVENT_TICK, w);
}

/** LORD_SKILL_TICK (`CUser::AddLordSkillTick`, :8179-8186): to the Lord only. */
export function writeLordSkillTick(ticks: readonly LordTick[]): ScriptMessage {
  const w = new ArWriter();
  writeTicks(w, ticks);
  return scripted(LordMessageType.LORD_SKILL_TICK, w);
}

/** LORD_SKILL_USE (`AddLordSkillUse`, :8307-8318): the Lord's object, the target's player id, the skill. */
export const writeLordSkillUse = (lordObjectId: number, targetId: number, skill: number): ScriptMessage =>
  scripted(LordMessageType.LORD_SKILL_USE, new ArWriter().u32(targetId).i32(skill), lordObjectId);

// The party's pure rules (Piece 7 M4), as the party windows and handlers compute them:
//
//   CWndParty::OnDraw            _Interface/WndParty.cpp:111-127   the level, the EXP as "%.2f %%" of what it needs
//   CWndPartyInfo::OnDraw        WndParty.cpp:538-563              a member's box colour, the leader's text green
//   CWndPartyInfo::OnDraw        WndParty.cpp:579-588, :679-693    the "-M"/"-H" marks, a name cut to 8 bytes + "..."
//   CDPClient::OnErrorParty      Neuz/DPClient.cpp:4307-4331       FULLPARTY's text by the party level
//   CDPClient::OnSetPartyMode    DPClient.cpp:5054-5177            the mode of each party skill
//   CDPCoreSrvr (the core)       CORESERVER/DPCoreSrvr.cpp:800-803 the EXP an advanced party needs from level 10

/** `MAX_PARTYLEVEL` (`ProjectCmn.h:28`): the last level of the table; from it the advanced party's rule. */
const MAX_PARTYLEVEL = 10;
/** `MAX_PROFESSIONAL` and `MAX_MASTER` (`Resource/defineJob.h`): the master jobs, then the hero jobs. */
const MAX_PROFESSIONAL = 16;
const MAX_MASTER = 24;

/** The party skill each mode belongs to (`PARTY_*_MODE` 0-3 → `ST_LINKATTACK` 5 … `ST_GIFTBOX` 8, `defineSkill.h:8-16`). */
export const PARTY_MODE_SKILL: readonly number[] = [5, 6, 7, 8];

/** The EXP the party needs from `level` to the next: `m_aExpParty[level].Exp` below 10, `((50 + L) * L / 13) * 10` from 10. */
export function partyExpNeed(level: number, table: ReadonlyArray<{ exp: number }>): number {
  if (level >= MAX_PARTYLEVEL) return Math.trunc(((50 + level) * level) / 13) * 10;
  return table[level]?.exp ?? 0;
}

/** `"%.2f %%"` of `(float)m_nExp * 100 / (float)need`, in floats as Neuz divides. */
export function partyExpText(exp: number, level: number, table: ReadonlyArray<{ exp: number }>): string {
  const need = Math.fround(partyExpNeed(level, table));
  return `${Math.fround(Math.fround(exp * 100) / need).toFixed(2)} %`;
}

/** The status box of a member's row: in view by its HP, out of view grey, or black when logged out. */
export function memberBoxColor(member: { inView: boolean; removed: boolean; hp: number; maxHp: number }): number {
  if (!member.inView) return member.removed ? 0xff000000 : 0xff878787;
  if (member.hp === 0) return 0xffff0000;
  // (FLOAT)hp / (FLOAT)max < .1f: the quotient is a float too
  if (member.maxHp > 0 && Math.fround(member.hp / member.maxHp) < Math.fround(0.1)) return 0xffffff00;
  return 0xff0000ff;
}

/** A row's text: the leader's green, the others black. */
export const memberTextColor = (isLeader: boolean): number => (isLeader ? 0xff1fb72d : 0xff000000);

/** A name longer than `bytes` cut to `bytes` and "..." (the names are single-byte in the game's code page). */
export const cutName = (name: string, bytes: number): string => (name.length > bytes ? `${name.slice(0, bytes)}...` : name);

/** The level's mark: "-M" for a master job, "-H" for a hero (`TID_GAME_TOOLTIP_MARK_MASTER`, `_HERO`). */
export function levelMark(job: number): string {
  if (job >= MAX_MASTER) return '-H';
  if (job >= MAX_PROFESSIONAL) return '-M';
  return '';
}

/** ERROR_FULLPARTY's text, by the own party's level. */
export function fullPartyTid(level: number): string {
  if (level >= 1 && level <= 5) return 'TID_GAME_FULLPARTY1';
  if (level >= 6 && level <= 9) return 'TID_GAME_FULLPARTY2';
  return 'TID_GAME_FULLPARTY3';
}

/** `MAX_PTMEMBER_SIZE_SPECIAL` (`_Common/party.h:34`): the members an invite may make. */
const MAX_MEMBERS = 8;

/**
 * `CWndWorld::InviteParty` (`WndWorld.cpp:11237-11266`), the duel's check left out (duels are out of scope): with a party,
 * only its leader invites, else the box TID_DIAG_0007; a full party gives the FULLPARTY3 line; else MEMBERREQUEST.
 */
export function inviteCheck(
  party: { size(): number; isLeader(playerId: number): boolean }, ownPlayerId: number,
): { send: true } | { box: 'TID_DIAG_0007' } | { line: 'TID_GAME_FULLPARTY3' } {
  if (party.size() > 0 && !party.isLeader(ownPlayerId)) return { box: 'TID_DIAG_0007' };
  if (party.size() + 1 > MAX_MEMBERS) return { line: 'TID_GAME_FULLPARTY3' };
  return { send: true };
}

/** What the window's rules read of the party (`PartyState`'s). */
interface PartyLike {
  size(): number;
  isLeader(playerId: number): boolean;
  readonly members: ReadonlyArray<{ playerId: number; removed: boolean }>;
  kind: number;
  expMode: number;
  itemMode: number;
}

/**
 * Leave's target (`CWndParty::OnChildNotify`, `WndParty.cpp:316-347`): the leader with a row selected removes that member
 * (a kick; its own row, a leave); anyone else, or nothing selected, leaves.
 */
export function leaveTarget(party: PartyLike, ownPlayerId: number, selected: number | null): number {
  return selected !== null && party.isLeader(ownPlayerId) ? selected : ownPlayerId;
}

/** Hand Over (`WndParty.cpp:354-385`), the duel's check left out: its line, or the member to send; null with no party. */
export function handOverCheck(party: PartyLike, ownPlayerId: number, selected: number | null): { send: number } | { line: string } | null {
  if (party.size() === 0) return null;
  const member = selected === null ? undefined : party.members.find((m) => m.playerId === selected);
  if (!party.isLeader(ownPlayerId) || member === undefined) return { line: 'TID_GAME_PARTY_ISNOTMASTER' };
  if (member.removed) return { line: 'TID_GAME_MASTER_AWAY' };
  if (member.playerId === ownPlayerId) return { line: 'TID_GAME_PARTY_ALREADYMASTER' };
  return { send: member.playerId };
}

/**
 * The advanced party's name, as the name box's OK checks it (`CWndPartyChangeName::OnChildNotify`,
 * `WndPartyChangeTroup.cpp:84-170`, `__RULE_0615`), in order: trimmed; 4 to 16 bytes; no digit first; letters and digits
 * only (`isalnum`, the English client); no banned word inside (`IsInvalidName`) and every letter allowed
 * (`IsAllowedLetter`, true for an empty set); the default name does nothing; else sent.
 */
export function troupNameCheck(
  name: string, catalog: { invalidNames: readonly string[]; letters: string }, defaultName = 'Advance Party',
): { send: string } | { box: string } | { stay: true } {
  const trimmed = name.trim();
  if (trimmed.length < 4 || trimmed.length > 16) return { box: 'TID_DIAG_RULE_0' };
  if (/^[0-9]/.test(trimmed)) return { box: 'TID_DIAG_0012' };
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return { box: 'TID_DIAG_0013' };
  const lower = trimmed.toLowerCase();
  const banned = catalog.invalidNames.some((word) => word !== '' && lower.includes(word));
  const notAllowed = catalog.letters !== '' && [...trimmed].some((letter) => !catalog.letters.includes(letter));
  if (banned || notAllowed) return { box: 'TID_DIAG_0020' };
  if (trimmed === defaultName) return { stay: true };
  return { send: trimmed };
}

/**
 * A mode radio (`WndParty.cpp:419-466`): a member gets the box TID_DIAG_0008; the leader sends an EXP mode in an advanced
 * party only, and either mode only when it differs from the party's (null: nothing to send).
 */
export function modeChoice(party: PartyLike, ownPlayerId: number, kind: 'item' | 'exp', value: number): { send: true } | { box: 'TID_DIAG_0008' } | null {
  if (!party.isLeader(ownPlayerId)) return { box: 'TID_DIAG_0008' };
  if (kind === 'exp') return party.kind !== 0 && value !== party.expMode ? { send: true } : null;
  return value !== party.itemMode ? { send: true } : null;
}

/**
 * APP_PARTY's own toggle (`CWndMgr::ObjectExecutor`, `WndManager.cpp:2625-2659`): with neither open, the party window and,
 * with 2 members or more, the quick view; with both open, neither; with one open, that one closes.
 */
export function partyToggle(windowOpen: boolean, quickOpen: boolean, size: number): { window: boolean; quick: boolean } {
  if (!windowOpen && !quickOpen) return { window: true, quick: size >= 2 };
  return { window: false, quick: false };
}

/** Call, Blitz and Retreat (`ST_CALL` 1 to `ST_RETREAT` 3): they make no mode icon, so never TID_GAME_NOT_TIME. */
const NO_ICON_SKILLS: ReadonlySet<number> = new Set([1, 2, 3]);

/**
 * A party skill used (`ObjectExecutor`'s SHORTCUT_SKILL with `m_dwType == 2`, `WndManager.cpp:2779-2876`), in order: under
 * 2 members or not advanced nothing, with no message; not the leader the box TID_DIAG_0047; the party level below the
 * skill's TID_DIAG_0019; its mode icon still running TID_GAME_NOT_TIME with its name (no party-skill-up scroll in the
 * browser); else PARTYSKILLUSE. The points check is unsigned and always passes (`int − DWORD`), so it is left out.
 */
export function partySkillCheck(
  party: { size(): number; isLeader(playerId: number): boolean; kind: number; level: number },
  ownPlayerId: number,
  skill: { id: number; name: string; level: number },
  iconRunning: boolean,
): { send: true } | { box: string } | { line: 'TID_GAME_NOT_TIME'; args: [string] } | null {
  if (party.size() < 2 || party.kind === 0) return null;
  if (!party.isLeader(ownPlayerId)) return { box: 'TID_DIAG_0047' };
  if (party.level < skill.level) return { box: 'TID_DIAG_0019' };
  if (iconRunning && !NO_ICON_SKILLS.has(skill.id)) return { line: 'TID_GAME_NOT_TIME', args: [skill.name] };
  return { send: true };
}

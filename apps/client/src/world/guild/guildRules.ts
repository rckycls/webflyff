// The guild's rules (2026-11-10, docs/superpowers/specs/2026-11-10-guild-research.md §2, appendices A and B): the ranks,
// the level table, the rights, the windows' checks, and the member list's sort, each copying Neuz.
//
//   ranks GUD_*                Resource/defineJob.h:146-150        Master 0, Kingpin 1, Captain 2, Supporter 3, Rookie 4
//   most per rank GM_*         _Common/guild.h:32-36, guild.cpp:328-329, :499-514
//   rights PF_*                _Common/guild.h:38-45
//   the level table            Resource/expTable.inc:477-530      `expCompanyTest` (read by _Common/Project.cpp:3408)
//   the name window's checks   _Interface/WndGuildName.cpp:84-149
//   the nickname's             WndGuildName.cpp:221-327
//   the salary's               _Interface/WndGuildTabApp.cpp:513-558
//   the notice's               _Interface/WndGuildTabInfo.cpp:157-188
//   the member list's sort     _Interface/WndGuildTabMember.cpp:32-193, :894-981

import { GuildPower, GuildRank } from '@flyffweb/protocol';
import type { GuildMemberEntry } from '@flyffweb/protocol';
import { jobType } from '../friends/friendRules';

export { GuildPower, GuildRank };

/** The rank names of the Title tab's heads (resdata.inc:5531-6064, its WIDC_STATIC8/9/12/10/11). */
export const RANK_NAMES = ['Master', 'Kingpin', 'Captain', 'Supporter', 'Rookie'] as const;

/** `GM_MASTER`, `GM_KINGPIN`, `GM_CAPTAIN`, `GM_SUPPORTER`; the Rookies' limit is the guild's (`GetMaxMemberLvSize`). */
const MAX_PER_RANK = [1, 5, 10, 20];

/** `expCompanyTest`: per level, the points and penya to reach it and its member limit. */
export const GUILD_TABLE: ReadonlyArray<readonly [pxp: number, penya: number, members: number]> = [
  [0, 0, 30], [24, 5200, 30], [205, 14625, 32], [485, 34666, 32], [1353, 58035, 34], [2338, 100285, 34],
  [4547, 139343, 36], [6788, 208000, 36], [11045, 263250, 38], [15151, 361110, 38], [22183, 432575, 40],
  [28800, 561600, 40], [39340, 649113, 42], [49135, 810727, 42], [63920, 914063, 44], [71608, 1024000, 44],
  [84365, 1064483, 46], [91041, 1148727, 46], [109698, 1238429, 48], [115152, 1300000, 48], [134545, 1443000, 49],
  [156813, 1601730, 50], [182351, 1777920, 51], [211610, 1973491, 52], [245099, 2190574, 53], [283396, 2431537, 54],
  [327152, 2699005, 55], [377106, 2995896, 56], [434090, 3325443, 57], [499049, 3691241, 58], [573046, 4097276, 59],
  [657283, 4547976, 60], [753119, 5048252, 61], [862086, 5603559, 62], [985913, 6219950, 63], [1126550, 6904144, 64],
  [1286198, 7663599, 65], [1467338, 8506594, 66], [1672765, 9442319, 67], [1905631, 10480973, 68],
  [2169488, 11633879, 69], [2468335, 12913606, 70], [2806677, 14334102, 71], [3189588, 15910852, 72],
  [3622778, 17661045, 73], [4112677, 19603760, 74], [4666517, 21760172, 75], [5292439, 24153791, 76],
  [5999599, 26810707, 77], [7075777, 29759885, 80],
];

/** `CGuildTable::GetMaxMemeber( nLevel )`: the member limit at a level (1-50). */
export function maxMembers(level: number): number {
  return GUILD_TABLE[Math.min(Math.max(level, 1), GUILD_TABLE.length) - 1]![2];
}

/** `CGuild::GetMaxMemberLvSize( nMemberLv )`: the most members a rank may hold. */
export function maxOfRank(rank: number, level: number): number {
  return MAX_PER_RANK[rank] ?? maxMembers(level);
}

/** What the rules read of the own guild. */
export interface GuildLike {
  masterId: number;
  level: number;
  logo: number;
  name: string;
  power: readonly number[];
  members: ReadonlyMap<number, GuildMemberEntry>;
}

/** `CGuild::IsMember`, and the member's rank. */
export function rankOf(guild: GuildLike | null, playerId: number): number | null {
  return guild?.members.get(playerId)?.rank ?? null;
}

/** `CGuild::IsMaster`. */
export const isMaster = (guild: GuildLike | null, playerId: number): boolean => guild !== null && guild.masterId === playerId;

/** `m_adwPower[ rank ] & bit` for a member (`IsAuthority`, `guild.h:333`). */
export function hasPower(guild: GuildLike | null, playerId: number, bit: number): boolean {
  const rank = rankOf(guild, playerId);
  return guild !== null && rank !== null && ((guild.power[rank] ?? 0) & bit) !== 0;
}

/**
 * The player menu's "Invite to join guild" (`CWndWorld::ShowMoverMenu`, `WndWorld.cpp:6556-6565`): the viewer in a guild
 * whose rank may invite. Shown whether or not the target has a guild (the server refuses).
 */
export const canInvite = (guild: GuildLike | null, ownPlayerId: number): boolean => hasPower(guild, ownPlayerId, GuildPower.INVITATION);

export type Check = { ok: true; value: string } | { ok: false; box: string };

/** The catalog the name rules read: the banned words (`IsInvalidName`, lower case) and the letters allowed (`IsAllowedLetter`). */
export interface NameCatalog {
  invalidNames: readonly string[];
  letters: string;
}

function namedOk(trimmed: string, catalog: NameCatalog): Check {
  if (/^[0-9]/.test(trimmed)) return { ok: false, box: 'TID_DIAG_0012' };
  // a single-byte char must be a letter or a digit (`isalnum`), or Cyrillic (the English client types no DBCS)
  if (!/^[A-Za-z0-9Ѐ-ӿ]+$/.test(trimmed)) return { ok: false, box: 'TID_DIAG_0013' };
  const lower = trimmed.toLowerCase();
  const banned = catalog.invalidNames.some((word) => word !== '' && lower.includes(word));
  const notAllowed = catalog.letters !== '' && [...trimmed].some((letter) => !catalog.letters.includes(letter));
  if (banned || notAllowed) return { ok: false, box: 'TID_DIAG_0020' };
  return { ok: true, value: trimmed };
}

/**
 * The guild name window's OK (`WndGuildName.cpp:84-149`): trimmed; 3 to 32 bytes (`__RULE_0516` is not defined) else
 * TID_DIAG_0011 (whose English text says "6 to 18"); no digit first; letters and digits only; no banned word.
 */
export function guildNameCheck(typed: string, catalog: NameCatalog): Check {
  const trimmed = typed.trim();
  if (trimmed.length < 3 || trimmed.length > 32) return { ok: false, box: 'TID_DIAG_0011' };
  return namedOk(trimmed, catalog);
}

/**
 * The nickname window's OK (`WndGuildName.cpp:221-327`): trimmed; empty TID_DIAG_0011; 2 to 12 bytes else
 * TID_DIAG_0011_01; then the name's checks.
 */
export function nicknameCheck(typed: string, catalog: NameCatalog): Check {
  const trimmed = typed.trim();
  if (trimmed === '') return { ok: false, box: 'TID_DIAG_0011' };
  if (trimmed.length < 2 || trimmed.length > 12) return { ok: false, box: 'TID_DIAG_0011_01' };
  return namedOk(trimmed, catalog);
}

/** `MAX_BYTE_NOTICE`: the notice is posted under 128 bytes (`strlen < MAX_BYTE_NOTICE`), else TID_GUILD_NOTICE_ERROR. */
export function noticeCheck(typed: string): Check {
  return typed.length < 128 ? { ok: true, value: typed } : { ok: false, box: 'TID_GUILD_NOTICE_ERROR' };
}

/**
 * The salary box's OK (`WndGuildTabApp.cpp:513-558`): every char a digit and the value 0..999999, else the field is
 * cleared and TID_GAME_GUILDONLYNUMBER; an empty field passes and sends 0.
 */
export function payCheck(typed: string): { ok: true; penya: number } | { ok: false; box: string } {
  if (!/^[0-9]*$/.test(typed)) return { ok: false, box: 'TID_GAME_GUILDONLYNUMBER' };
  const penya = typed === '' ? 0 : Number(typed);
  if (penya > 999999) return { ok: false, box: 'TID_GAME_GUILDONLYNUMBER' };
  return { ok: true, penya };
}

/** The Info tab's logo button (`WndGuildTabInfo.cpp:560-582`): at war, a logo already set, guild level under 2. */
export function logoRefusal(guild: GuildLike, atWar: boolean): string | null {
  if (atWar) return 'TID_GAME_GUILDWARERRORLOGO';
  if (guild.logo !== 0) return 'TID_GAME_GUILDSTILLLOGO';
  if (guild.level < 2) return 'TID_GAME_GUILDNOTLEVEL';
  return null;
}

/** The player logos (`CUSTOM_LOGO_MAX - 7`, `WndGuildTabInfo.cpp:229`): 1..20; 21..27 are the GMs'. */
export const PLAYER_LOGOS = 20;
export const CUSTOM_LOGO_MAX = 27;

/** The logo grid (`OnInitialUpdate`, `WndGuildTabInfo.cpp:257-269`): logo k (0-based) at 24 + col * 30, 18 + row * 30. */
export const logoCell = (k: number): { left: number; top: number } => ({ left: 24 + (k % 5) * 30, top: 18 + Math.trunc(k / 5) * 30 });

/** The key of a logo picture (1-based), as the UI stage writes it (`Icon_CloakSLogo%02d.jpg`, `WndWorld.cpp:3667-3677`). */
export const logoKey = (logo: number): string => `ui/logo/icon_cloakslogo${String(logo).padStart(2, '0')}.jpg`;

// --- the member list (`CWndGuildTabMember`) ---

/** One row: the member and its player data. */
export interface MemberRow {
  playerId: number;
  rank: number;
  rankClass: number;
  alias: string;
  name: string;
  job: number;
  level: number;
  online: boolean;
  giveGold: number;
  givePxp: number;
  lose: number;
}

export type MemberSortKey = 'rank' | 'job' | 'level' | 'name' | 'alias';

/** `CString`'s compare, a byte compare. */
const bytes = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The comparisons as `std::sort` reads them (`:32-193`): the "Asce" ones sort downwards, the names are inverted. Each flag
 * TRUE picks the "Asce" one.
 */
function compare(key: MemberSortKey, asce: boolean): (a: MemberRow, b: MemberRow) => number {
  switch (key) {
    // prMemberLevelAsce: rank downwards (Rookie first), class upwards; Desc: Master first, class downwards
    case 'rank': return asce
      ? (a, b) => b.rank - a.rank || a.rankClass - b.rankClass
      : (a, b) => a.rank - b.rank || b.rankClass - a.rankClass;
    case 'job': return asce
      ? (a, b) => jobType(b.job) - jobType(a.job) || b.job - a.job
      : (a, b) => jobType(a.job) - jobType(b.job) || a.job - b.job;
    // prLevelAsce: the job type first, then the level, both downwards
    case 'level': return asce
      ? (a, b) => jobType(b.job) - jobType(a.job) || b.level - a.level
      : (a, b) => jobType(a.job) - jobType(b.job) || a.level - b.level;
    case 'name': return asce ? (a, b) => bytes(b.name, a.name) : (a, b) => bytes(a.name, b.name);
    case 'alias': return asce ? (a, b) => bytes(b.alias, a.alias) : (a, b) => bytes(a.alias, b.alias);
  }
}

/**
 * The member tab's sort (`:204-210`, `:894-981`): each column's flag flips on each press. `OnInitialUpdate` already sorts by
 * rank once (Master first), so the rank flag starts TRUE. Neuz loses the sort on every refresh (`UpdateData` rebuilds in
 * player-id order); here a refresh keeps the last order (`refresh`), a harmless improvement.
 */
export class MemberSort {
  private readonly flags: Record<MemberSortKey, boolean> = { rank: true, job: true, level: true, name: true, alias: true };
  private current: { key: MemberSortKey; asce: boolean } = { key: 'rank', asce: false };

  press(key: MemberSortKey, rows: MemberRow[]): MemberRow[] {
    const asce = this.flags[key];
    this.flags[key] = !asce;
    this.current = { key, asce };
    return this.refresh(rows);
  }

  refresh(rows: MemberRow[]): MemberRow[] {
    if (rows.length <= 1) return rows;
    return rows.sort(compare(this.current.key, this.current.asce));
  }
}

/**
 * The rank icons of a row (`OnDraw`, `:266-337`): the Master one icon, frame 44; the others `class + 1` icons of frame
 * 45-48, 10 px apart from x 22, less 5 for class 1 and 10 for class 2 (`icon_PlayerData.inc`).
 */
export function rankIcons(rank: number, rankClass: number): Array<{ frame: number; left: number }> {
  if (rank === GuildRank.MASTER) return [{ frame: 44, left: 22 }];
  const left = 22 - 5 * Math.min(Math.max(rankClass, 0), 2);
  return Array.from({ length: Math.min(Math.max(rankClass, 0), 2) + 1 }, (_, j) => ({ frame: 44 + rank, left: left + j * 10 }));
}

/** The name column: past 10 bytes cut with "..." (`:411-431`). */
export const memberName = (name: string): string => (name.length > 10 ? `${name.slice(0, 10)}...` : name);

/** The row's text colour (`:254-264`): the chosen row blue, an offline member grey, else black. */
export function memberColor(row: MemberRow, selected: boolean): number {
  if (selected) return 0xff0000ff;
  return row.online ? 0xff000000 : 0xff909090;
}

/** The member menu (`OnRButtonUp`, `:701-722`; ids `MGI_*`, `Resource/defineNeuz.h:309-315`). */
export const MemberMenu = {
  APPELL_UP: 0, APPELL_DOWN: 1, CLASS_UP: 2, CLASS_DOWN: 3, GUILD_LEAVE: 4, NICKNAME: 5, CHG_MASTER: 6,
} as const;

export interface MemberMenuEntry {
  id: number;
  tid: string;
  english: string;
}

/** Every line for every member; the hand-over only for the Master. */
export function memberMenuEntries(master: boolean): MemberMenuEntry[] {
  const entries: MemberMenuEntry[] = [
    { id: MemberMenu.APPELL_UP, tid: 'TID_GAME_GUILD_APPELLATIONUP', english: 'Promote Member' },
    { id: MemberMenu.APPELL_DOWN, tid: 'TID_GAME_GUILD_APPELLATIONDOWN', english: 'Demote Member' },
    { id: MemberMenu.CLASS_UP, tid: 'TID_GAME_GUILD_CLASSUP', english: 'Class Up' },
    { id: MemberMenu.CLASS_DOWN, tid: 'TID_GAME_GUILD_CLASSDOWN', english: 'Class Down' },
    { id: MemberMenu.NICKNAME, tid: 'TID_GAME_GUILD_NICKNAME', english: 'Create Nickname' },
    { id: MemberMenu.GUILD_LEAVE, tid: 'TID_GAME_GUILD_LEAVE', english: 'Leave Guild' },
  ];
  if (master) entries.push({ id: MemberMenu.CHG_MASTER, tid: 'TID_GAME_CHG_MASTER', english: 'Change of Guild Leader.' });
  return entries;
}

/** What a member menu line does (`OnCommand`, `:552-665`). */
export type MemberAction =
  | { box: string }
  | { send: 'memberLevel'; playerId: number; rank: number }
  | { send: 'class'; playerId: number; up: boolean }
  | { send: 'remove'; playerId: number }
  | { send: 'chgMaster'; playerId: number }
  | { open: 'nickname'; playerId: number }
  | null;

/**
 * A member menu line: nothing without a guild or a row; at war every line TID_GAME_GUILDWARERRORMEMBER; Promote sends rank
 * - 1, Demote rank + 1 (no bounds); Class Up/Down (not the own row: `SendGuildClass` skips it); Nickname: the Master at
 * guild level 10+; Leave: the selected member (no confirm); the hand-over: another member, online.
 */
export function memberAction(id: number, guild: GuildLike | null, row: MemberRow | undefined, ownPlayerId: number, atWar: boolean): MemberAction {
  if (guild === null || row === undefined) return null;
  if (atWar) return { box: 'TID_GAME_GUILDWARERRORMEMBER' };
  switch (id) {
    case MemberMenu.APPELL_UP: return { send: 'memberLevel', playerId: row.playerId, rank: row.rank - 1 };
    case MemberMenu.APPELL_DOWN: return { send: 'memberLevel', playerId: row.playerId, rank: row.rank + 1 };
    case MemberMenu.CLASS_UP:
    case MemberMenu.CLASS_DOWN:
      return row.playerId === ownPlayerId ? null : { send: 'class', playerId: row.playerId, up: id === MemberMenu.CLASS_UP };
    case MemberMenu.NICKNAME:
      if (!isMaster(guild, ownPlayerId)) return { box: 'TID_GAME_GUILDONLYMASTER' };
      if (guild.level < 10) return { box: 'TID_GAME_GUILDNOTLEVEL' };
      return { open: 'nickname', playerId: row.playerId };
    case MemberMenu.GUILD_LEAVE: return { send: 'remove', playerId: row.playerId };
    case MemberMenu.CHG_MASTER:
      if (row.playerId === ownPlayerId) return null;
      if (!row.online) return { box: 'TID_GAME_NOTLOGIN' };
      return { send: 'chgMaster', playerId: row.playerId };
    default: return null;
  }
}

/** The member tooltip (`OnMouseWndSurface`, `:772-810`): name, points, penya, and "surrendered" showing `m_nLose`. */
export function memberTip(row: MemberRow, text: (tid: string, english: string) => string): string {
  return `${row.name}\n${text('TID_GAME_TOOLTIP_EXPMERIT', 'Contribution:')} ${row.givePxp}\n`
    + `${text('TID_GAME_TOOLTIP_PENYAMERIT', 'Penya Contribution:')} ${row.giveGold}\n`
    + `${text('TID_GAME_TOOLTIP_GIVEUPNUM', 'Number of times surrendered')} ${row.lose}`;
}

/** The Title tab's check boxes (`WndGuildTabApp.cpp:132-238`): its rows, top to bottom, and their bits. */
export const TITLE_ROWS: ReadonlyArray<{ bit: number; label: string }> = [
  { bit: GuildPower.MEMBERLEVEL, label: 'Title' },
  { bit: GuildPower.LEVEL, label: 'Rank' },
  { bit: GuildPower.INVITATION, label: 'Join' },
  { bit: GuildPower.PENYA, label: 'Penya' },
  { bit: GuildPower.ITEM, label: 'Item' },
];

/** The Permissions tab's (`WndGuildTabPower.cpp:121-160`): the guild house's furniture and upkeep, no Master column. */
export const POWER_ROWS: ReadonlyArray<{ bit: number; label: string }> = [
  { bit: GuildPower.GUILDHOUSE_FURNITURE, label: 'Furniture' },
  { bit: GuildPower.GUILDHOUSE_UPKEEP, label: 'Maintenance Fee' },
];

/** A right toggled in the rights array (a copy). */
export function togglePower(power: readonly number[], rank: number, bit: number): number[] {
  const next = [...power];
  next[rank] = ((next[rank] ?? 0) ^ bit) >>> 0;
  return next;
}

/** `"%.2d/%.2d"` of a rank's count and limit (`WndGuildTabApp.cpp:643-712`). */
export const rankCount = (count: number, limit: number): string => `${String(count).padStart(2, '0')}/${String(limit).padStart(2, '0')}`;

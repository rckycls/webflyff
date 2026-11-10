import type { AddedPlayer } from '@flyffweb/protocol';
import type { WebNameColors } from '@flyffweb/formats';
import { Belli } from '../sim/constants';
import type { Mover } from '../WorldState';

/** What a mover's name tag says. `color` is 0xAARRGGBB, as Neuz's `D3DCOLOR` and `PKSetting.inc` give it. */
export interface NameTag {
  text: string;
  color: number;
  /** How far from the camera the tag is shown, in metres (`fDistLimit`). */
  maxDistance: number;
  /** 2026-11-09: the Master or Hero mark after the name (`legendMark`): its picture's key, or none. */
  mark?: string | null;
  /** 2026-11-10: the guild line above the name (`guildLine`): its text, colour and logo picture's key. */
  guild?: GuildLine;
}

/** The guild line of a player's tag (guild research §5). */
export interface GuildLine {
  text: string;
  color: number;
  /** The logo's picture key (`Icon_CloakSLogoNN.jpg`), or null for a guild with none. */
  logo: string | null;
}

/** What the tag reads of a player's guild: its name and logo (0 none), and whether the player is its master. */
export interface TagGuild {
  name: string;
  logo: number;
  master: boolean;
}

/** `0xFFFFFF99`: the guild line of the guild's master (`MoverRender.cpp:1586-1588`); everyone else's is white. */
const COLOR_GUILD_MASTER = 0xffffff99;
const COLOR_GUILD = 0xffffffff;

/**
 * 2026-11-10: the guild line (`RenderName`, `MoverRender.cpp:1484-1660`): the guild's name, no brackets, white, the
 * master's light yellow; the 24 x 24 logo when it has one. (The Guild Siege's colours are the siege's, not here.)
 */
export function guildLine(guild: TagGuild, logoKey: (logo: number) => string): GuildLine {
  return { text: guild.name, color: guild.master ? COLOR_GUILD_MASTER : COLOR_GUILD, logo: guild.logo === 0 ? null : logoKey(guild.logo) };
}

/**
 * 2026-11-09: the mark after a player's name (`RenderName`, MoverRender.cpp:1495-1563, `__VER >= 10`): a Master's
 * (`GetLegendChar`, the job's `dwJobType` JTYPE_MASTER) at levels 60 to 120, icon_Expert1 to 6 by its ten levels; a
 * Hero's icon_Hero at any level. The job catalog names the type: `JOB_*_MASTER`, `JOB_*_HERO`.
 */
export function legendMark(job: number, level: number, jobs: ReadonlyArray<{ name: string }>): string | null {
  const name = jobs[job]?.name ?? '';
  if (name.endsWith('_HERO')) return 'ui/icon_hero.png';
  if (!name.endsWith('_MASTER') || level < 60 || level > 120) return null;
  return `ui/icon_expert${Math.min(6, Math.floor((level - 60) / 10) + 1)}.png`;
}

// `COLOR_*` (`Source/_Common/Mover.h:34-38`)
const COLOR_GAMEMASTER = 0xff2d7cae;
const COLOR_ADMINISTRATOR = 0xffae2d2d;
const COLOR_NPC = 0xffa0a0ff;
const COLOR_MONSTER = 0xffffffa0;
/** `COLOR_PARTY` (`Mover.h:39`): a party member's name still in the general colour (`MoverRender.cpp:1403-1407`). */
const COLOR_PARTY = 0xff70f070;
/** `0xfffff8dc`, the VIP colour (`MoverRender.cpp:1257-1258`, under `__BB_VIP_TITLES`, on in `Neuz/VersionCommon.h:209`). */
const COLOR_VIP = 0xfffff8dc;
/** The colour of an aggressive monster's name: `0xffff0000` (`MoverRender.cpp:1453`). */
const COLOR_AGGRESSIVE = 0xffff0000;

// `AUTH_*` (`Source/_Common/authorization.h:6-27`) are letters; `RenderName` compares them as numbers.
const AUTH_GAMEMASTER = 0x4c; // 'L'
const AUTH_ADMINISTRATOR = 0x50; // 'P'
const AUTH_GENERAL_VIP = [0x31, 0x32, 0x33]; // '1' to '3': `IsAuthVip` (`__BB_VIP_AUTH_LEVELS`, on in `Neuz/VersionCommon.h:208`)

/** `TRANSPARENT_MODE` (`authorization.h`), a bit of `CMover::m_dwMode`. */
const TRANSPARENT_MODE = 0x00000002;

/** `fDistLimit` of `CWorld::Render` (`World3D.cpp:1276-1278`): 40 m, and 100 m for players and peaceful NPCs. */
const NEAR_LIMIT = 40;
const FAR_LIMIT = 100;
/** The last metres of the limit over which a tag fades out (Neuz cuts it off; the web client fades). */
const FADE_METRES = 10;

/**
 * `CMover::RenderName` (`Source/_Common/MoverRender.cpp:1219`) with `__VER >= 13` and `__HONORABLE_TITLE` (the branch
 * `:1236-1288`), and the distance and transparency tests of its caller `CWorld::Render` (`World3D.cpp:1265-1300`).
 * Null for a transparent mover (`IsMode( TRANSPARENT_MODE )`, `World3D.cpp:1282`), but for the own one (2026-11-10, the
 * owner's request: "I should be able to see my name and icons whatever I am"; Neuz hides the own one too, and draws the
 * own body faint, `MoverRender.cpp:517-531`, which `bodyAlpha` copies).
 * - A player: the name with the honour title in brackets before it (`CMover::GetTitle`, which is
 *   `CTitleManager::GetTitle( m_nHonor )`) and " [Admin]" or " [GM]" after it for those ranks. The colour is the chaotic
 *   one, else the pink (PK-ready) one, else the administrator's, the game master's, the VIP's, else the general one
 *   (`:1248-1261`); a name still in the general colour of a member of the own party, the own one included, is
 *   `COLOR_PARTY` (`g_Party.FindMember( m_idPlayer )`, `:1403-1407`): `inParty` takes the player's database ID.
 * - A monster or NPC: the name, in the NPC colour when peaceful, red when it attacks first, else the monster colour
 *   (`:1445-1457`).
 *
 * `viewer` changes nothing, as in Neuz: `CWorld::Render` picks a colour by the ranks of the viewer and the mover
 * (`World3D.cpp:1283-1298`), but `RenderName` sets a player's colour in every branch and an NPC's is fixed, so it is never used.
 * Not copied, for want of the data: the guild-war colours (`:1238-1245`, they need the guild ids), the structure line above an NPC of `character.inc` (`:1426-1437`) and the invisibility buff
 * (`IsMode`, `Mover.h:1704`).
 */
export function nameTagOf(
  mover: Mover,
  viewer: Mover | undefined,
  colors: WebNameColors,
  honorTitles: ReadonlyMap<number, string>,
  inParty: (playerId: number) => boolean = () => false,
  jobs: ReadonlyArray<{ name: string }> = [],
  /** 2026-11-10: the guild line of a player, or undefined (no guild known for it). */
  guildOf: (mover: Mover) => GuildLine | undefined = () => undefined,
): NameTag | null {
  const player = mover.added.player;
  if (mover.kind === 'player' && player !== undefined) {
    if ((player.mode & TRANSPARENT_MODE) === TRANSPARENT_MODE && !mover.isSelf) return null;
    const mark = legendMark(player.job, player.level, jobs);
    const guild = guildOf(mover);
    return {
      text: playerText(mover.name, player, honorTitles), color: playerColor(player, colors, inParty(player.playerId)), maxDistance: FAR_LIMIT,
      ...(mark !== null ? { mark } : {}), ...(guild !== undefined ? { guild } : {}),
    };
  }
  const { belligerence } = mover.added;
  const peaceful = belligerence === Belli.PEACEFUL; // CMover::IsPeaceful
  const aggressive = (mover.added.npc?.activeAttack ?? 0) !== 0;
  return {
    text: mover.name,
    color: peaceful ? COLOR_NPC : aggressive ? COLOR_AGGRESSIVE : COLOR_MONSTER,
    // `pMover->IsPlayer() || (pMover->IsNPC() && pMover->IsPeaceful())`, and IsNPC is `!m_bPlayer`: a monster counts
    maxDistance: peaceful ? FAR_LIMIT : NEAR_LIMIT,
  };
}

/** `"[title] name"` and the rank after it (`MoverRender.cpp:1263-1288`). */
function playerText(name: string, player: AddedPlayer, honorTitles: ReadonlyMap<number, string>): string {
  const title = honorTitles.get(player.honor);
  let text = title === undefined || title === '' ? name : `[${title}] ${name}`;
  if (player.authorization >= AUTH_ADMINISTRATOR) text += ' [Admin]';
  else if (player.authorization >= AUTH_GAMEMASTER) text += ' [GM]';
  return text;
}

/** `IsChaotic` is `m_dwPKPropensity > 0` and `IsPKPink` is `m_dwPKTime > 0` (`Mover.h:1227-1228`). */
function playerColor(player: AddedPlayer, colors: WebNameColors, inParty: boolean): number {
  const rank = player.authorization;
  if (player.pkPropensity > 0) return colors.chaotic;
  if (player.pkTime > 0) return colors.ready;
  if (rank >= AUTH_ADMINISTRATOR) return COLOR_ADMINISTRATOR;
  if (rank >= AUTH_GAMEMASTER) return COLOR_GAMEMASTER;
  if (AUTH_GENERAL_VIP.includes(rank)) return COLOR_VIP;
  return inParty ? COLOR_PARTY : colors.general;
}

/**
 * How opaque a tag is at `distance` metres from the camera: 1 up to `FADE_METRES` before `maxDistance`, then falling
 * linearly to 0 at `maxDistance` (Neuz draws it whole to the limit and then not at all).
 */
export function tagOpacity(distance: number, maxDistance: number): number {
  return Math.min(1, Math.max(0, (maxDistance - distance) / FADE_METRES));
}

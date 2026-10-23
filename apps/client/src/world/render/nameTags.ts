import type { AddedPlayer } from '@flyffweb/protocol';
import type { WebNameColors } from '@flyffweb/formats';
import type { Mover } from '../WorldState';

/** What a mover's name tag says. `color` is 0xAARRGGBB, as Neuz's `D3DCOLOR` and `PKSetting.inc` give it. */
export interface NameTag {
  text: string;
  color: number;
  /** How far from the camera the tag is shown, in metres (`fDistLimit`). */
  maxDistance: number;
}

// `COLOR_*` (`Source/_Common/Mover.h:34-38`)
const COLOR_GAMEMASTER = 0xff2d7cae;
const COLOR_ADMINISTRATOR = 0xffae2d2d;
const COLOR_NPC = 0xffa0a0ff;
const COLOR_MONSTER = 0xffffffa0;
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
/** `BELLI_PEACEFUL` (`Resource/defineAttribute.h:203`): `CMover::IsPeaceful`. */
const BELLI_PEACEFUL = 1;

/** `fDistLimit` of `CWorld::Render` (`World3D.cpp:1276-1278`): 40 m, and 100 m for players and peaceful NPCs. */
const NEAR_LIMIT = 40;
const FAR_LIMIT = 100;
/** The last metres of the limit over which a tag fades out (Neuz cuts it off; the web client fades). */
const FADE_METRES = 10;

/**
 * `CMover::RenderName` (`Source/_Common/MoverRender.cpp:1219`) with `__VER >= 13` and `__HONORABLE_TITLE` (the branch
 * `:1236-1288`), and the distance and transparency tests of its caller `CWorld::Render` (`World3D.cpp:1265-1300`).
 * Null for a transparent mover (`IsMode( TRANSPARENT_MODE )`, `World3D.cpp:1282`).
 * - A player: the name with the honour title in brackets before it (`CMover::GetTitle`, which is
 *   `CTitleManager::GetTitle( m_nHonor )`) and " [Admin]" or " [GM]" after it for those ranks. The colour is the chaotic
 *   one, else the pink (PK-ready) one, else the administrator's, the game master's, the VIP's, else the general one
 *   (`:1248-1261`).
 * - A monster or NPC: the name, in the NPC colour when peaceful, red when it attacks first, else the monster colour
 *   (`:1445-1457`).
 *
 * `viewer` changes nothing, as in Neuz: `CWorld::Render` picks a colour by the ranks of the viewer and the mover
 * (`World3D.cpp:1283-1298`), but `RenderName` sets a player's colour in every branch and an NPC's is fixed, so it is never used.
 * Not copied, for want of the data: the guild-war and party colours (`:1238-1245`, `:1404-1407`, they need the guild and
 * party ids), the structure line above an NPC of `character.inc` (`:1426-1437`) and the invisibility buff
 * (`IsMode`, `Mover.h:1704`).
 */
export function nameTagOf(
  mover: Mover,
  viewer: Mover | undefined,
  colors: WebNameColors,
  honorTitles: ReadonlyMap<number, string>,
): NameTag | null {
  const player = mover.added.player;
  if (mover.kind === 'player' && player !== undefined) {
    if ((player.mode & TRANSPARENT_MODE) === TRANSPARENT_MODE) return null;
    return { text: playerText(mover.name, player, honorTitles), color: playerColor(player, colors), maxDistance: FAR_LIMIT };
  }
  const { belligerence } = mover.added;
  const peaceful = belligerence === BELLI_PEACEFUL;
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
function playerColor(player: AddedPlayer, colors: WebNameColors): number {
  const rank = player.authorization;
  if (player.pkPropensity > 0) return colors.chaotic;
  if (player.pkTime > 0) return colors.ready;
  if (rank >= AUTH_ADMINISTRATOR) return COLOR_ADMINISTRATOR;
  if (rank >= AUTH_GAMEMASTER) return COLOR_GAMEMASTER;
  if (AUTH_GENERAL_VIP.includes(rank)) return COLOR_VIP;
  return colors.general;
}

/**
 * How opaque a tag is at `distance` metres from the camera: 1 up to `FADE_METRES` before `maxDistance`, then falling
 * linearly to 0 at `maxDistance` (Neuz draws it whole to the limit and then not at all).
 */
export function tagOpacity(distance: number, maxDistance: number): number {
  return Math.min(1, Math.max(0, (maxDistance - distance) / FADE_METRES));
}

/**
 * custom (owner 2026-11-15): Auto Play. Where the farm bot and the auto pots may run, by world id (`Resource/defineWorld.h`).
 * The client is never sent the region flags (RA_TOWN, RA_PK ...), only the world, so the rules are world lists; towns need
 * no check (no monsters, and the bot never attacks players). One place to change: these two sets.
 */

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** The farm bot's "open fields only" (owner 2026-11-15). */
export const FARM_BLOCKED_WORLDS: ReadonlySet<number> = new Set([
  ...range(121, 125), // WI_INSTANCE_OMINOUS .. WI_INSTANCE_RUSTIA_1 (instance dungeons, PartyDungeon.lua)
  ...range(151, 167), // WI_DUNGEON_SECRET_0 .. WI_DUNGEON_SECRET_L (secret rooms; 167 in PartyDungeon.lua)
  200, // WI_DUNGEON_FL_MAS (PartyDungeon.lua)
  202, // WI_WORLD_GUILDWAR (guild siege)
  208, // WI_WORLD_ARENA
  211, // WI_WORLD_QUIZ
  ...range(241, 244), // WI_WORLD_GUILDWAR1TO1_0 .. _L (1:1 guild war)
]);

/** The auto pots' "not in PvP" (owner 2026-11-15). */
export const POTS_BLOCKED_WORLDS: ReadonlySet<number> = new Set([
  202, // WI_WORLD_GUILDWAR
  208, // WI_WORLD_ARENA
  ...range(241, 244), // WI_WORLD_GUILDWAR1TO1_0 .. _L
]);

/** Whether the farm bot may not run in `worldId`, or at all while the own player is in a duel. */
export function farmBlocked(worldId: number, inDuel: boolean): boolean {
  return inDuel || FARM_BLOCKED_WORLDS.has(worldId);
}

/** Whether the auto pots are off in `worldId`, or while the own player is in a duel. */
export function potsBlocked(worldId: number, inDuel: boolean): boolean {
  return inDuel || POTS_BLOCKED_WORLDS.has(worldId);
}

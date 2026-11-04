// The sound, music, world and effect ids that Neuz's code names itself (docs/superpowers/specs/
// 2026-11-02-piece6-m2-sound-research.md §5, §6, §9). The ids that data names (an item's hit sound, a region's track)
// come with the audio catalog instead.

/** `SND_*` (Resource/defineSound.h). */
export const SND_INF_CLICK = 1; // :6
export const SND_INF_TRADE = 4; // :9
export const SND_INF_INVENTORYDROP = 5; // :10
export const SND_INF_GROUNDDROP = 6; // :11
export const SND_INF_GROUNDPICKUP = 7; // :12
export const SND_INF_EQUIPWEAPON = 8; // :13
export const SND_INF_EQUIPARMOR = 9; // :14
export const SND_INF_EQUIPCLOTH = 10; // :15
export const SND_INF_EQUIPACCESSORY = 11; // :16
export const SND_GEN_LEVELUP = 70; // :33
export const SND_GEN_WATER = 71; // :34
export const SND_WALK_LANDSOFT = 1202; // :345

/** `BGM_*` (Resource/defineSound.h). */
export const BGM_TITLE = 1; // :1899
export const BGM_TH_GENERAL = 8; // :1911
export const BGM_EV_START = 19; // :1924, a quest begins (CMover::SetQuest, MoverParam.cpp:3475-3577)
export const BGM_EV_END = 20; // :1925, a quest ends or is removed
export const BGM_IN_BOSS = 21; // :1927
export const BGM_IN_DEATH = 22; // :1928
export const BGM_IN_LEVELUP = 23; // :1929
export const BGM_IN_FITUP = 25; // :1931, a new party and an advanced one (Piece 7 M4, OnAddPartyMember, OnPartyChangeTroup)

/**
 * The worlds where the own death plays no music (CDPClient::OnMoverDeath, DPClient.cpp:2012-2034): WI_WORLD_GUILDWAR,
 * WI_DUNGEON_MUSCLE, WI_DUNGEON_KRRR and WI_DUNGEON_BEAR (Resource/defineWorld.h:57, :71-73).
 */
export const NO_DEATH_MUSIC: ReadonlySet<number> = new Set([202, 210, 220, 230]);

/** The effects `CreateSfx` gives a sound of its own (CreateObj.cpp:82, :180-181; Resource/defineObj.h:152-158). */
export const XI_SOUNDS: ReadonlyMap<number, number> = new Map([
  [62, SND_GEN_LEVELUP], // XI_GEN_CURE01
  [65, SND_GEN_LEVELUP], // XI_GEN_REF01
  [71, SND_GEN_WATER], // XI_GEN_WATERCROWN01
]);

/** The sounds fetched when the catalog is in, ahead of their first play (the plan's ruling 7). */
export const PREFETCHED: readonly number[] = [
  SND_INF_CLICK, SND_INF_TRADE, SND_INF_INVENTORYDROP, SND_INF_GROUNDDROP, SND_INF_GROUNDPICKUP, SND_INF_EQUIPWEAPON,
  SND_INF_EQUIPARMOR, SND_INF_EQUIPCLOTH, SND_INF_EQUIPACCESSORY, SND_WALK_LANDSOFT,
];

/** RANK_BOSS (Resource/defineAttribute.h:162). */
export const RANK_BOSS = 4;

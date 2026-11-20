// 2026-11-17 (view-equip-options): the game options Neuz keeps in `g_Option` beside the three of the messenger
// (friends/messenger.ts), and what each does (docs/2026-11-17-view-equip-options.md):
//
//   m_bTrade        HwOption.cpp:187, neuz.ini "Trade"       a trade request answered BLOCK 3 when off (OnConfirmTrade,
//                                                            DPClient.cpp:2508-2512); /ta /tr (FuncTextCmd.cpp:3764-3775)
//   m_bParty        :189, "Party"                            a party invite answered PARTYMEMBERCANCEL mode 3 when off
//                                                            (OnPartyRequest, DPClient.cpp:4526-4530); /ga /gr (:3800-3811)
//   m_bAutoAttack   :246, "AutoAttack"                       a skill begun, or the target pressed again, starts the
//                                                            auto-attack only when on (DPClient.cpp:3891, WndWorld.cpp:6295,
//                                                            :6912)
//   m_nWindowAlpha  :173, "WindowAlpha"                      255, or 128 with Translucency: the windows' pictures drawn at
//                                                            that alpha (`CWndBase::m_nAlpha`, WndBase.cpp:661-690)
//   m_bBattleBGM    :194, "BattleBGM"                        off: no battle music when the own player attacks
//                                                            (`CMover::PlayCombatMusic`, MoverMove.cpp:31-61)
//   m_bCameraLock   :245, "CameraLock"                       2026-11-20 (mouse-drag): on, W/A/S/D held (the right
//                                                            button not) turn the camera behind the character
//                                                            (WndWorld.cpp:8011-8015); the Video page's, not shown yet
//   m_bZoomLimit    :261, "ZOOMLIMIT"                        2026-11-20: on, the wheel zooms out to 7, else 15
//                                                            (WndWorld.cpp:7389-7399); the Video page's, not shown yet
//   invertCameraUp  (not Neuz's)                             2026-11-20 (phone-camera-invert): the phone's finger drag
//   invertCameraTurn                                         tilts the camera the other way up and down / turns it the
//                                                            other way round (the phone Option window's "Invert
//                                                            Camera"; docs/2026-11-20-phone-camera-invert.md)
//
// Neuz writes them to neuz.ini when it closes (HwOption.cpp:1069-1126); the browser keeps them in its storage at once, one
// set for every character, as neuz.ini is one per client.

/** The options this module keeps. */
export interface GameOptions {
  trade: boolean;
  party: boolean;
  autoAttack: boolean;
  /** `m_nWindowAlpha == 128`. */
  translucent: boolean;
  battleMusic: boolean;
  /** 2026-11-20 (mouse-drag): `m_bCameraLock`. */
  cameraLock: boolean;
  /** 2026-11-20 (mouse-drag): `m_bZoomLimit`. */
  zoomLimit: boolean;
  /** 2026-11-20 (phone-camera-invert): a finger dragged up tilts the camera down (as before 2026-11-20), not up. */
  invertCameraUp: boolean;
  /** 2026-11-20 (phone-camera-invert): a finger dragged right turns the camera left, not right. */
  invertCameraTurn: boolean;
}

/** `CHwOption::Init`'s values (HwOption.cpp:173-261), and the two camera inverts off. */
export const DEFAULT_GAME_OPTIONS: Readonly<GameOptions> = {
  trade: true, party: true, autoAttack: true, translucent: false, battleMusic: false, cameraLock: true, zoomLimit: true,
  invertCameraUp: false, invertCameraTurn: false,
};

/** The alpha of the windows' pictures with Translucency (`CWndBase::m_nAlpha = g_Option.m_nWindowAlpha = 128`). */
export const TRANSLUCENT_ALPHA = 128;

const KEY = 'flyffweb.gameOptions';

export function loadGameOptions(storage: Pick<Storage, 'getItem'> | null): GameOptions {
  const options = { ...DEFAULT_GAME_OPTIONS };
  try {
    const raw = storage?.getItem(KEY);
    if (raw === null || raw === undefined) return options;
    const value = JSON.parse(raw) as Partial<Record<keyof GameOptions, unknown>>;
    for (const key of Object.keys(options) as Array<keyof GameOptions>) {
      if (typeof value[key] === 'boolean') options[key] = value[key];
    }
  } catch { /* storage blocked or not JSON: the defaults */ }
  return options;
}

export function saveGameOptions(storage: Pick<Storage, 'setItem'> | null, options: GameOptions): void {
  try { storage?.setItem(KEY, JSON.stringify(options)); } catch { /* a private window: kept for this visit only */ }
}

/**
 * The client commands of these options (`FuncTextCmd.cpp:3764-3775`, `:3800-3811`): the option they set and the line they
 * put, in its TID's colour; null for another command. (Neuz's /ga line says TID_GAME_STAGEAGREE, "You joined the party.",
 * for what is only the option.)
 */
export function gameOptionCommand(command: string): { option: 'trade' | 'party'; on: boolean; tid: string } | null {
  switch (command) {
    case 'tradeagree': return { option: 'trade', on: true, tid: 'TID_GAME_TRADEAGREE' };
    case 'traderefuse': return { option: 'trade', on: false, tid: 'TID_GAME_TRADEREFUSE' };
    case 'stageagree': return { option: 'party', on: true, tid: 'TID_GAME_STAGEAGREE' };
    case 'stagerefuse': return { option: 'party', on: false, tid: 'TID_GAME_STAGEREFUSE' };
    default: return null;
  }
}

/**
 * `CMover::PlayCombatMusic` (MoverMove.cpp:31-61): the battle track the own player's attack starts, or null for none: with
 * Battle Music on, not in the guild war's world nor the three dungeons, outdoors; Saint Morning's rect, else by x.
 */
export function combatMusicOf(on: boolean, worldId: number, indoor: boolean, x: number, z: number): number | null {
  if (!on) return null;
  if (worldId === WI_WORLD_GUILDWAR || DUNGEONS.has(worldId) || indoor) return null;
  // CRect rectSaintmorning( 7535, 1846, 9283, 3134 ): left <= x < right, top <= z < bottom
  const ix = Math.trunc(x), iz = Math.trunc(z);
  if (ix >= 7535 && ix < 9283 && iz >= 1846 && iz < 3134) return BGM_BA_SAINTMORNING;
  if (x < 4609) return BGM_BA_DARKON;
  if (x < 6309) return BGM_BA_CRISIS;
  if (x < 8138) return BGM_BA_FLARIS;
  return BGM_BA_SAINTMORNING;
}

/** `Resource/defineWorld.h`: WI_WORLD_GUILDWAR, WI_DUNGEON_MUSCLE, WI_DUNGEON_KRRR, WI_DUNGEON_BEAR. */
const WI_WORLD_GUILDWAR = 202;
const DUNGEONS: ReadonlySet<number> = new Set([210, 220, 230]);
/** `Resource/defineSound.h`: the battle tracks. */
const BGM_BA_FLARIS = 15;
const BGM_BA_CRISIS = 16;
const BGM_BA_SAINTMORNING = 50;
const BGM_BA_DARKON = 51;

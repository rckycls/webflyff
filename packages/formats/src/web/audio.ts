// The audio catalog (`data/audio.json`, Piece 6 M2): what Neuz's sound and music players look up by id, read by the
// converter's data stage from `sound.inc`, `default.bgm`, the worlds' `.wld` and `.rgn` files, the props' sound columns
// and `mdlDyna.inc` (docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md). Optional: it is not one of
// GAME_DATA_KEYS, so a client converted before it still logs in, silent.
//
// Keys name files of the asset index: only files the audio stage wrote are listed, so an id whose file is missing from
// the client folder has no entry and plays nothing, as in Neuz.

export const AUDIO_KEY = 'data/audio.json';

/** A world's music: CWorld::m_dwIdMusic and the music fields of m_aRegion (WorldFile.cpp:94-97, :413-553). */
export interface WebWorldMusic {
  /** The `.wld` file's `bgm`: a `BGM_*` id, 0 for none. */
  bgm: number;
  /** The region rows in file order (RI_BEGIN, RI_REVIVAL and RI_STRUCTURE left out). */
  regions: Array<{
    /** `m_rect`: left, top, right, bottom in world x and z. */
    rect: [number, number, number, number];
    music: number;
    direct: boolean;
    /** `m_dwAttribute & RA_INN`. */
    inn: boolean;
  }>;
}

export interface WebAudio {
  /** Sound id → `sound/<web name>.wav` (`sound.inc`), for the files that exist. */
  sounds: Record<number, string>;
  /**
   * 2026-11-09: a WAV Neuz plays by file name, `PLAYSND( "PCSkillCastCheer.wav" )` (dsutil.h:219-222), as the C++ writes
   * the name → its `sound/<web name>.wav`: the raised pet's level-up cheer (Mover.cpp:11158) and its release
   * (`ItemGnCollector.wav`, :11190). Only the files that exist; absent in catalogs converted before.
   */
  named?: Record<string, string>;
  /** Music id → its keys (`default.bgm`). Two ids of one file share them; `mp3` is null without FFmpeg. */
  music: Record<number, { ogg: string; mp3: string | null }>;
  /** World id → its music, for the worlds of World.inc whose folder has a `.wld` or a `.rgn`. */
  worlds: Record<number, WebWorldMusic>;
  /** `XI_*` id → the sound key of its mdlDyna.inc SFX entry's part (`m_szPart`, CreateObj.cpp:328-329). */
  effects: Record<number, string>;
  /** Item id → its sound ids: dwSndAttack1 (hit), dwSndAttack2 (critical), dwSubDefine (on the ground). */
  items: Record<number, { attack1?: number; attack2?: number; drop?: number }>;
  /** Skill id → dwSndAttack1 (the launch, Ctrl.cpp:982-986). */
  skills: Record<number, number>;
  /** Mover id → dwSndIdle1 (a click on the mover, WndWorld.cpp:7063). */
  movers: Record<number, number>;
  /** Character key (character.inc) → its SetMusic id (the NPC dialog, WndDialog.cpp:290-297). */
  npcMusic: Record<string, number>;
}

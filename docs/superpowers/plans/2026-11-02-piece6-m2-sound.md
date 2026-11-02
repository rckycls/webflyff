# Piece 6 M2 — Music and Sound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the browser plays the game's own music and sound effects as Neuz V15 does:
- the title track on the login screen;
- the world's and the regions' tracks, and the death, level-up, NPC and boss tracks;
- the motions' sounds, the footsteps, the hits, the effects, the items and the clicks;
- an Option window with Neuz's two volume sliders.

The audio sends no packet.

**Architecture:**
- **Converter:** a new `audio` stage copies the WAV effects and the Ogg music, and makes an MP3 copy of each track with
  FFmpeg. The data stage writes one optional catalog, `data/audio.json`, from `sound.inc`, `default.bgm`, the worlds'
  `.wld` and `.rgn` files, the props' sound columns and `mdlDyna.inc`.
- **Client:** pure rule classes copy `CWndWorld::Process`'s music choice and `CSoundManager::Play`'s placement. One
  page-wide `GameAudio` plays them: effects through Web Audio, music through `<audio>` routed into Web Audio. The lobby
  and the world screen share it. Every sound trigger of the world goes through one mapping module.
- **Reuse:** the KTX-Software pattern for FFmpeg, the world map's optional-catalog pattern, `hitIndex`'s frame test, and
  the HUD's `WindowFrame`.

**Tech Stack:** TypeScript, the converter's stages, Web Audio and `HTMLAudioElement`, DOM/CSS HUD, Vitest, one Chromium
Playwright spec.

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.3. **Research:**
`docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md`, cited as `[R §n]`. It holds every C++ `file:line`, ID and
fixture used below. Copy the citations from it into the code's doc comments.

## Global Constraints

- **No packet:** playing, changing or failing audio never sends anything.
- **Safari 16 stays supported:** music is chosen by `canPlayType` between Ogg and MP3 [R §11]. Music volume goes through
  a `GainNode`, never `HTMLMediaElement.volume`, which iOS ignores.
- **`data/audio.json` is optional:** it is never added to `GAME_DATA_KEYS`. Without it the game is silent and says so
  once in the overlay.
- **The game never waits for sound.** A refused start, a slow file or a failed file never blocks the login, the entry
  or a rules step.
- **The server never names a file:** packets carry IDs, which are looked up in the catalog. Unknown IDs are ignored.
- **Coordinates:** sounds are placed from FlyFF positions (x east, z north), with Neuz's integer cuts [R §7]. The web
  mirror (`toWebPosition`) is not used for sound.
- **Builders run only:**
  - `npx vitest run` on the files their task names;
  - `npm run typecheck`;
  - in Task 9, `npm run test:e2e:client -- audio.spec.ts` once.

  The owner runs the full suites.
- **Work in** `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, branch `piece6`.
- **FFmpeg** must be installed before Task 3's conversion (see the handoff).

## Rulings made while planning (the owner reviews these with the plan)

1. **The window:**
   - The Start menu gets Neuz's "Option" line, just before Log out (`WndTaskBar.cpp:2638`).
   - It opens a window titled "Option" that holds only the "Sound Option" group of Neuz's game tab: the "BGM" and
     "Sound Effect" sliders, in their own art and at their own spacing [R §10].
   - The Option window's other settings are left out.
   - The spec called this the Sound window. Neuz's V15 has no separate Sound window.
2. **Slider input** copies Neuz:
   - pressing the knob drags it one step per move toward the pointer;
   - a press on the bar moves one step.

   `GetSliderStep` has no limit, but it needs none here: at steps 0 and 10 the 16 px knob covers the bar's end. One
   difference: a focused slider also takes the arrow keys, one step each, kept to 0..10, for keyboards and screen
   readers.
3. **Left and right:** the distance rules are copied exactly:
   - nothing beyond 100 m;
   - integer cuts;
   - full volume up to 4 m, then 4/d;
   - silent beyond 70 m.

   The listener's angle is the camera's heading, as Neuz's default camera lock gives it (`HwOption.cpp:245`). Its sign
   is fixed by one test: a sound on the camera's right is heard on the right. DirectSound's left-handed space cannot be
   checked by ear here.
4. **Volume curves** are Neuz's:
   - effects: `10^(−2.5·(1 − v))`, and nothing plays at 0;
   - music: linear `v` [R §6, §7].

   So at the defaults, effects at 100% are at full gain and music at 50% is at half.
5. **A music file that fails** is remembered as failed for the page and never asked for again. Neuz retries it every
   frame. The result is the same silence, without a download every frame.
6. **Catch-up frames:** frame moves that a motion makes late, after its file arrives (`catchUp`), play no motion sound.
   Only the step's own move does, so a late file never plays a burst.
7. **Late effects:** an effect whose file is not ready within 500 ms of its request is dropped. The next request plays
   it from the cache. The common sounds (click, trade, pick-up, drop, equip, footstep) are fetched when the catalog loads.
8. **A hidden tab** pauses both players, as the spec asks; Neuz does not.
   - The music keeps its logical "playing" state, so the rules do not restart it.
   - Effects asked for while hidden are dropped.
   - Coming back resumes the current track.
9. **Before the first gesture:**
   - a refused `play()` keeps the track logically playing;
   - the first tap or key starts the current track from its start, so nothing queued plays;
   - effects before the gesture are dropped.
10. **The title track** plays whenever the lobby shows the login form: at start, after logging out (`WM_LOGOUT`), and
    after a dropped connection. Entering the world stops it.
11. **PLAYSOUND type 1** (a file name, for Neuz's voice option) is read and ignored.
12. **Click sound:** a pointer press on any HUD or lobby `<button>` plays `SND_INF_CLICK`, as every `CWndButton` press
    does.
    - These stay silent (`data-silent`): the item slots, the ground and nearby item buttons, the attack button and the
      joystick. They stand for things Neuz does not draw as buttons.
    - The NPC dialog's text area clicks too (`WndDialog.cpp:348-353`).
13. **Files copied:** only the WAVs that `sound.inc` or a `mdlDyna.inc` effect names and that exist (§1). The 179
    unnamed WAVs and the 4 unnamed tracks are not copied.
14. **Without FFmpeg:** the audio stage records one failure, so the run exits 1. It still copies the WAVs and Oggs, and
    the catalog gets `mp3: null`. A browser without Ogg then has no music and says so once.
15. **Revival** plays no sound, as in Neuz [R §9], though the spec's list named it.
16. **Not in M2:** the sounds of things FlyffWeb does not have yet [R §6, §9]:
    - projectile and magic hit sounds;
    - quest, party, guild, flying, mini-game and combat music;
    - the messenger;
    - voices.

## Review Focus

1. **No gesture yet, or a refused start:**
   - the login and the world work;
   - the music rules do not ask for the track again each step;
   - the first tap starts only the current track.

   Pinned in Task 6.
2. **An older `dist/assets` without `data/audio.json`, or a missing file:**
   - silence, with one overlay line per file;
   - no request repeated every frame;
   - in particular the two missing tracks, `BGM_DU_INVISIBLE` 70 and `BGM_FI_DARKON3` 124 (DuMuscle).

   Pinned in Tasks 5 and 6.
3. **A crowded town:**
   - other players' footsteps and the idle loops respect the 100 m cut before any download;
   - at most 10 copies of a file play;
   - at most 64 decoded sounds are kept.

   Pinned in Task 6.
4. **A tab hidden for a minute during a fight:** no burst of sounds on return, and the current track resumes. Pinned in
   Tasks 6 and 7.
5. **Travel and logging out mid-sound:**
   - the world's track and sounds stop;
   - the new world's track comes from its own rules;
   - the login form plays the title track.

   Pinned in Task 7.

---

### Task 1: The readers

**Files:**
- Create: `packages/formats/src/inc/soundScript.ts`, `packages/formats/src/world/regions.ts`,
  `packages/formats/src/web/audio.ts`.
- Modify: `packages/formats/src/index.ts`.
- Test: `packages/formats/test/audioReaders.test.ts`.

**Interfaces:**
- Produces:
  - `readIdFileScript(text: string, defines: ReadonlyMap<string, number>, file: string): Map<number, string>`: the
    shared format of `sound.inc` and `default.bgm` [R §2].
    - The last entry of an ID wins.
    - An unknown name and ID 0 are left out.
    - The file name is kept as written.
  - `readRegions(text: string, file: string): RegionRow[]`, with
    `RegionRow = { index: number; attribute: number; music: number; direct: boolean; rect: [number, number, number, number] }`.
    - It copies `LoadRegion`/`ReadRegion`'s token loop, including how it passes over the other keywords and the
      `title`/`desc` blocks.
    - Rows with index 12, 13 and 14 are left out.
    - File order is kept, at most 256 rows.
  - `AUDIO_KEY = 'data/audio.json'` and:
    ```ts
    interface WebAudio {
      sounds: Record<number, string>;                              // sound id → 'sound/<web name>.wav', files that exist
      music: Record<number, { ogg: string; mp3: string | null }>;  // music id → keys; two ids of one file share them
      worlds: Record<number, { bgm: number; regions: Array<{ rect: [number, number, number, number]; music: number; direct: boolean; inn: boolean }> }>;
      effects: Record<number, string>;                             // XI id → sound key (mdlDyna m_szPart)
      items: Record<number, { attack1?: number; attack2?: number; drop?: number }>;  // sound ids; NULL_ID left out
      skills: Record<number, number>;                              // skill id → dwSndAttack1
      movers: Record<number, number>;                              // mover id → dwSndIdle1
      npcMusic: Record<string, number>;                            // character key → SetMusic id
    }
    ```

- [ ] **Step 1: Write the failing tests.** The fixtures are pasted as strings from the real files.
  - **`sound.inc`:** `BGM_NONE ""`, `SND_NONE "InfClick.wav"`, `SND_INF_CLICK "InfClick.wav"`, the 2042 pair of
    `sound.inc:997-998`, and an unknown name. Assert:
    - id 1 → `InfClick.wav`;
    - 0 is absent;
    - 2042 → `NpcWormveduqueAtk1.wav`;
    - the unknown name is absent.
  - **`default.bgm`:** with comments. `BGM_TITLE` → `music\BgmDu1Mystery.ogg`.
  - **`.rgn`:** rows `:748` and `:796` with their `title`/`desc` lines, a `respawn` row between, and a row with index 13.
    Assert:
    - two rows;
    - row 1 is `{ index: 10, attribute: 0x410, music: 2, direct: false, rect: [6870, 3184, 7073, 3285] }`;
    - row 2 has `direct: true` and `rect: [6848, 3172, 7261, 3385]`.
- [ ] **Step 2:** Run `npx vitest run packages/formats/test/audioReaders.test.ts`. Expected: FAIL (the modules are
  missing).
- [ ] **Step 3:** Implement both readers with `ScriptReader`, citing `dsutil.cpp:39-60`, `Music2.cpp:195-213` and
  `WorldFile.cpp:413-553,775-809`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(formats): the sound and music scripts and the region rows`.

### Task 2: The audio stage and FFmpeg

**Files:**
- Create:
  - `tools/convert/src/audio/ffmpeg.ts`;
  - `tools/convert/src/audio/audioSources.ts`;
  - `tools/convert/src/audio/audioStage.ts`.
- Modify:
  - `tools/convert/src/output/keys.ts`;
  - `tools/convert/src/run.ts` (`DEFAULT_STAGES`: `audio` before `data`);
  - `tools/convert/src/cli.ts` (usage text).
- Test: `tools/convert/test/audioStage.test.ts`, `tools/convert/test/ffmpeg.test.ts`.

**Interfaces:**
- Consumes: Task 1's `readIdFileScript`.
- Produces:
  - `soundKeyOf(file: string): string` → `sound/<webName(base name)>`.
  - `musicKeyOf(file: string, ext: 'ogg' | 'mp3'): string` → `music/<webName(stem)>.<ext>`.
  - `audioSources(client: ClientFs, defines, effectParts: Iterable<string>)`, which returns
    `{ sounds: Map<number, string>; music: Map<number, string>; missing: string[] }`:
    - each ID's real path, found case-insensitively under `Sound/` and the client folder;
    - the effect WAVs by name;
    - the names not found.

    The data stage uses it too.
  - `findFfmpeg(candidates?, probe?): Promise<string | null>`. The candidates are tried in this order:
    1. `FFMPEG_BIN`;
    2. `ffmpeg` on the PATH;
    3. `C:\Program Files\ffmpeg\bin\ffmpeg.exe`.

    Each is probed with `-version`, with no shell and a 15 s timeout, as `ktx.ts:46-85` does.
  - `MISSING_FFMPEG_MESSAGE`.
  - `toMp3(ffmpeg: string, oggPath: string): Promise<Uint8Array>`, which runs
    `-nostdin -hide_banner -loglevel error -i <in> -vn -map_metadata -1 -fflags +bitexact -codec:a libmp3lame -b:a 128k -f mp3 <temp file>`.
  - `createAudioStage(options?: { findFfmpeg?; toMp3? }): Stage`, named `audio`. Its report kinds are `sound`, `music`
    and `musicMp3`.
    - It writes each distinct existing WAV and Ogg as is, and each MP3.
    - It gives one warning listing the missing names, with a count and at most the first 10.
    - When FFmpeg is missing it gives one `report.fail('audio', 'FFmpeg', MISSING_FFMPEG_MESSAGE)`, still writes the
      rest, and makes no MP3.

- [ ] **Step 1: Write the failing tests.** Use a `writeFakeClient` holding:
  - 2 WAVs and a `sound.inc` naming a third, missing one;
  - an Ogg and a `default.bgm` naming it in another case, plus a missing track;
  - a fake FFmpeg.

  Assert:
  - the keys `sound/infclick.wav`, `music/bgmth3return.ogg` and `music/bgmth3return.mp3`;
  - one warning naming the missing files;
  - a second ID of the same Ogg writes nothing more;
  - without FFmpeg: one failure, the Ogg written and no MP3;
  - `toMp3`'s exact argument list;
  - `findFfmpeg`'s order with a fake probe.
- [ ] **Step 2:** Run `npx vitest run tools/convert/test/audioStage.test.ts tools/convert/test/ffmpeg.test.ts`.
  Expected: FAIL.
- [ ] **Step 3:** Implement, citing [R §1, §2] in the doc comments. Load the defines and `mdlDyna.inc` as the data and
  effects stages do.
- [ ] **Step 4:** Run the Step 2 command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(convert): the audio stage, with MP3 copies made by FFmpeg`.

### Task 3: The audio catalog

**Files:**
- Create: `tools/convert/src/data/audioCatalog.ts`.
- Modify: `tools/convert/src/data/gameDataStage.ts`. An optional block after the world map's writes `AUDIO_KEY`, in its
  own try.
- Test: `tools/convert/test/audioCatalog.test.ts`; corpus `tools/convert/test/audio.corpus.test.ts`.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:
  - `buildAudio(env: { client; defines; reading; has(key: string): boolean; warn }): WebAudio | null`.
  - It returns null, with one warning, when `sound.inc` is missing.
  - `has` is `writer.pathOf(key) !== null`, so the catalog names only files in the index, from this run or an earlier
    one.
  - **Worlds:** every `World.inc` world whose folder has a `.wld` or `.rgn` gets `{ bgm, regions }`. `inn` is
    `(attribute & 0x80) !== 0`.
  - **Items:** columns 106, 118 and 119 [R §9]. A field is left out when it is `NULL_ID` or 0.
  - **Skills:** column 118, for the skills that have it.
  - **Movers:** column 80, for the 4 that have it.
  - **Effects:** each `mdlDyna.inc` SFX entry with a 4th field whose file was copied.
  - **NPC music:** each character with `SetMusic`.

- [ ] **Step 1: Write the failing tests.**
  - `audioCatalog.test.ts` builds a fake client and props:
    - `worlds[1].regions` equals the Task 1 fixture rows, with `inn: false`;
    - `bgm` is read from a `.wld` with `bgm 6`;
    - an ID whose file is not in `has` is absent;
    - two music IDs of one file share one `ogg` key;
    - an item with `dwSndAttack1 = SND_PC_DMGSWD` gets `attack1: 115`;
    - a missing `sound.inc` gives null and one warning.
  - The corpus test, skipped without `FLYFF_CLIENT`, checks:
    - 40 music IDs;
    - Madrigal has 109 regions, and rows 47, 55, 59 and 96 match [R §4];
    - 217 effects;
    - 33 skills;
    - `sounds[1]` is `sound/infclick.wav`;
    - no warning other than the missing-files one.
- [ ] **Step 2:** Run `npx vitest run tools/convert/test/audioCatalog.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The world list comes from `World.inc` as the data stage already reads it. `.wld` and
  `.rgn` are loose files.
- [ ] **Step 4:** Run the Step 2 command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Convert into this worktree:
  `npm run convert -- --only audio,data --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client"`.
  Expected:
  - exit 0;
  - `dist/assets/index.json` has `data/audio.json`, the `sound/` and `music/` keys, and 36 `.mp3` keys (the 38 files of `default.bgm` less its 2 missing ones).

  Record the counts, times and bytes for the checkpoint. Then run the corpus file once with `FLYFF_CLIENT` set.
- [ ] **Step 6:** Commit: `feat(convert): the audio catalog`.

### Task 4: PLAYSOUND and PLAYMUSIC

**Files:**
- Modify:
  - `packages/protocol/src/world/constants.ts` (`PLAYMUSIC` 0x00d1, `PLAYSOUND` 0x00d2);
  - `packages/protocol/src/world/readers.ts`;
  - `packages/protocol/src/world/types.ts`;
  - `packages/testkit/src/world.ts` (`writePlayMusic(id)`, `writePlaySound(id)`, `writePlaySoundFile(name)`).
- Test: `packages/protocol/test/worldMessages.test.ts`.

**Interfaces:**
- Produces the world messages:
  - `{ type: 'playMusic'; music: number }`;
  - `{ type: 'playSound'; sound: number | null }`. It is null for type 1, whose string is read and dropped.
- [ ] **Step 1: Write the failing tests:**
  - each writer's bytes read back;
  - type 1 reads its string and gives `sound: null`;
  - a body cut short throws the readers' usual bounds error.
- [ ] **Step 2:** Run the test file. Expected: FAIL.
- [ ] **Step 3:** Implement from `DPClient.cpp:605-606,11736-11767` [R §6, §9].
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(protocol): PLAYMUSIC and PLAYSOUND`.

### Task 5: The rules

**Files:**
- Create:
  - `apps/client/src/audio/soundIds.ts` (the IDs of [R §5, §6, §9], each with its `define*.h` line);
  - `apps/client/src/world/sound/musicRules.ts`;
  - `apps/client/src/world/sound/soundRules.ts`.
- Test: `apps/client/test/musicRules.test.ts`, `apps/client/test/soundRules.test.ts`.

**Interfaces:**
- Consumes: `WebAudio` (Task 1).
- Produces:
  - `interface MusicPort { playFile(key: string, loops: number): void; stop(): void; isStopped(): boolean }`. It stands
    for `PlayMusic_`, `StopMusic` and `IsStopMusic`. A key that is playing is not restarted. Loops 0 means forever.
  - `class MusicRules` (`constructor(port: MusicPort, audio: Pick<WebAudio, 'music' | 'worlds'>)`):
    - `play(id, loops = 1)` is `PlayMusic`. It ignores 0, `NULL_ID` and IDs with no file.
    - `title()` is `play(BGM_TITLE, 0)`.
    - `enterWorld(worldId)` is `OnReplace`: `base = 0`, `stop()`, all regions outside.
    - `step(pos: { x: number; y: number; z: number }, landHeight: number)` is block A and the region loop of [R §4].
  - `effectsGain(step: number): number` and `musicGain(step: number): number`, for steps 0..10 [R §6, §7].
  - `placeSound(sound, listener, angleDeg): { x: number; y: number; z: number } | null`. It returns null beyond 100 m.
    The acos argument is kept to −1..1.
  - `audible(local) = hypot(local) <= 70`.
  - `pannerPosition(local)`: the position Web Audio's listener (forward −z, up +y) is given.
  - `listenerAngle(cameraHeading: number): number`: the camera's heading turned into `m_fCurRotx` degrees (ruling 3).
  - `soundAt(sound: ReadonlyArray<[number, number]>, old: number, current: number): number`: `hitIndex`'s test on the
    sound events. It returns the sound ID, or 0.
  - `equipSound(kind1: number, kind2: number, equip: boolean): number` (`MoverEquip.cpp:1013-1041`).
  - `class SoundCopies { take(key): boolean; release(key): void }`, at most 10 per key.

- [ ] **Step 1: Write the failing tests.**
  - **`musicRules.test.ts`**, with a fake port that logs calls and has a settable `isStopped`:
    - the four fixtures of [R §4] in order, each step by step;
    - `title()` asks for `music/bgmdu1mystery.ogg` with loops 0;
    - `enterWorld` stops the track, and the next step picks the world's;
    - Madrigal with no region gives `BGM_TH_GENERAL`;
    - a death jingle cuts the track, and when it ends the base restarts from its start;
    - the same file while playing is not restarted;
    - a region with music 0 lets the track end, then the world's loops;
    - an inn region with the player 2 m up re-enters every step;
    - an unknown ID does nothing.
  - **`soundRules.test.ts`:**
    - `placeSound` at (3, 0, 4) from the origin at angle 0 gives (3, 0, 4);
    - at 100.5 m it gives null;
    - cuts are truncations;
    - `audible` is false at 70.1;
    - `effectsGain(0) === 0`, `effectsGain(10) === 1`, `effectsGain(5) ≈ 10^-1.25`;
    - `musicGain(5) === 0.5`;
    - the 11th `take` fails, and a `release` frees one;
    - `soundAt` fires for a frame-0 sound on `(old −1, current 0)`, on each loop's wrap, and not for a frame skipped
      over;
    - `equipSound` for the four kinds and for unequip;
    - a sound 10 m to the camera's right at heading 0 and at heading π/2 gives `pannerPosition(...).x > 0`.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/musicRules.test.ts apps/client/test/soundRules.test.ts`.
  Expected: FAIL.
- [ ] **Step 3:** Implement, citing [R §3, §4, §7, §8].
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the music and sound rules, copied from WndWorld.cpp, Music2.cpp and dsutil.cpp`.

### Task 6: The page's audio

**Files:**
- Create:
  - `apps/client/src/audio/gameAudio.ts`;
  - `apps/client/src/audio/musicPlayer.ts`;
  - `apps/client/src/audio/effectsPlayer.ts`;
  - `apps/client/src/audio/soundSettings.ts`;
  - `apps/client/src/audio/audioCatalog.ts`.
- Test: `apps/client/test/gameAudio.test.ts` (jsdom, with fake `AudioContext` and media elements),
  `apps/client/test/soundSettings.test.ts`.

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - `loadAudio(store, report): Promise<WebAudio | null>`, as `loadWorldMap` does. Its message is
    `audio.json missing: run npm run convert -- --only audio,data`.
  - `readSoundSettings(storage)` / `writeSoundSettings(storage, s)`, with `s = { effects: number; music: number }` in
    steps.
    - The key is `flyffweb.sound`.
    - The defaults are 10 and 5.
    - Every access is in a try, and a bad value gives the defaults.
  - `class GameAudio`:
    - **Constructor:** `deps: { context(): AudioContext | null; media(): HTMLAudioElement; doc: Document; storage: Storage | null; report(e: Error): void }`.
    - **Members:**
      - `setCatalog(audio: WebAudio | null, store: Pick<AssetStore, 'url'>)`;
      - `music: MusicPort`;
      - `play(id: number, at?: Vec3)`: an effect, 2D without `at`;
      - `setListener(pos: Vec3, angleDeg: number)`;
      - `stopWorld()`: ends the effects now playing and stops the music;
      - `settings`, `setEffects(step)`, `setMusic(step)`;
      - `played`: the test hooks' log;
      - `dispose()`.
    - **Music:**
      - `<audio>` → `MediaElementAudioSourceNode` → `GainNode`;
      - Ogg when `canPlayType('audio/ogg; codecs="vorbis"')` is not empty, else MP3;
      - `loop` for loops 0;
      - `ended` and `error` make it stopped, and an error remembers the key as failed (ruling 5).
    - **Effects:**
      - checked in this order: settings, hidden, catalog, `placeSound`, `audible`, then `SoundCopies`;
      - buffers are fetched once and decoded, at most 64 kept, least recently used dropped first;
      - a file that fails is reported once and never fetched again;
      - the 500 ms limit of ruling 7 applies.
    - **Unlocking:** capture listeners for `pointerdown`, `pointerup`, `touchend`, `keydown` and `click` resume the
      context and start the current track. They are removed once that works.
    - **Visibility:** ruling 8.

- [ ] **Step 1: Write the failing tests:**
  - **Refused start:** with `play()` rejecting `NotAllowedError`, `music.isStopped()` stays false and one track is asked
    for. After a `pointerdown`, `play()` is called once, on the current key only.
  - **Ogg or MP3:** an Ogg-less fake picks the MP3. With `mp3: null` there is one overlay line and no request.
  - **A failed track:** an `error` event reports once, and later `playFile` of that key makes no new element source.
  - **Copies and cache:**
    - 10 copies play and the 11th is dropped;
    - a 65th sound evicts the least recently used;
    - two plays of an uncached key make one fetch.
  - **Distance:** a sound 120 m away makes no fetch.
  - **Hidden tab:** a hidden document suspends the context, drops effects and keeps the music playing logically. Visible
    again, it resumes with no effect played late.
  - **Volume:** `setEffects(0)` plays nothing, and `setMusic(3)` sets the gain to 0.3.
  - **Settings:** they survive a round trip through a fake storage, and a throwing storage gives the defaults.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/gameAudio.test.ts apps/client/test/soundSettings.test.ts`.
  Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the page's audio, Web Audio effects and streamed music`.

### Task 7: Wiring the lobby and the world

**Files:**
- Create:
  - `apps/client/src/world/sound/worldSounds.ts`: every world trigger of [R §6, §9] in one place;
  - `apps/client/src/audio/clickSound.ts`.
- Modify:
  - `apps/client/src/main.ts`: one `GameAudio` for the page, given to `LobbyApp` and `WorldScreen.open`;
  - `lobby/LobbyApp.ts`: the title track per ruling 10, and the click listener;
  - `world/WorldScreen.ts`:
    - the catalog load next to `loadWorldMap`;
    - `MusicRules.step` and `setListener` in each rules step;
    - `enterWorld` on `entered`;
    - the PLAYMUSIC and PLAYSOUND branches in `apply`;
    - `stopWorld()` in `disposeWorld`;
  - `world/render/MoverViews.ts`: the motion sound and the footstep of each live frame move;
  - `world/fx/EffectManager.ts`: an effect's sound when it is played;
  - the buttons of ruling 12, marked `data-silent`;
  - `src/testHooks.ts`: `ClientPlayed` gains `sounds: Array<{ id: number; step: number }>` and
    `music: Array<{ key: string; step: number }>`.
- Test: `apps/client/test/worldSounds.test.ts`, `apps/client/test/clickSound.test.ts`, and new cases in
  `apps/client/test/moverViews.test.ts`.

**Interfaces:**
- Consumes: Tasks 4, 5 and 6.
- Produces:
  - `installClickSound(root: HTMLElement, play: (id: number) => void): () => void`.
  - `class WorldSounds` (`constructor(audio: GameAudio, catalog: WebAudio, data: GameData)`). It has one method per
    trigger:
    - `meleeHit(attackerPos, weaponItemId)`, `critical(...)`;
    - `equip(moverPos, itemId, equip)`;
    - `itemsCreated(slotCount)`, `gold()`, `shop()`, `drop()`;
    - `groundItem(pos, itemId)`, `moverClicked(moverId)`;
    - `effect(xi, pos)`, `skillCast(casterPos, skillId)`;
    - `npcDialog(characterKey)`, `ownDeath(worldId)`, `ownLevelUp()`, `bossAdded(...)`;
    - `serverSound(id)`, `serverMusic(id)`.

    The packet and event handlers call these; nothing else plays.

- [ ] **Step 1: Write the failing tests.**
  - **`worldSounds.test.ts`**, with a fake `GameAudio`:
    - each row of [R §9]'s table gives its ID and position;
    - `ownDeath(202)` plays no jingle, and `ownDeath(1)` plays `BGM_IN_DEATH`;
    - `bossAdded` at 31 m plays nothing, and at 29 m plays `BGM_IN_BOSS`;
    - `itemsCreated(3)` plays 3 pick-ups;
    - an unknown sound ID does nothing.
  - **No doubled sound:** one own melee swing plays its motion's sound once, though the client starts the motion and
    the server's MELEE_ATTACK echoes it.
  - **`clickSound.test.ts`:**
    - `pointerdown` on a `<button>` plays 1;
    - on a `data-silent` button or a plain `div`, nothing;
    - the returned function removes the listener.
  - **MoverViews:**
    - a live frame move across a sound frame plays it once at the mover;
    - a catch-up move plays nothing (ruling 6);
    - a player in `FMOVE` on a hit frame plays 1202, and a monster does not.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** Implement. Each hook calls `WorldSounds` at the C++ site's moment, cited in a comment: the hook-point
  list of [R §12].
- [ ] **Step 4:** Run the three files, `apps/client/test/hud.test.ts`, and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): music and sound in the lobby and the world (Piece 6 M2)`.

### Task 8: The Option window

**Files:**
- Create: `apps/client/src/world/hud/optionWindow.ts`.
- Modify:
  - `hud/taskBar.ts`: `'option'` in `TaskBarWindow`, `WINDOWS` gets `[412, 'option']`, and `MENU` gets
    `{ id: 412, text: 'Option' }` just before Log out;
  - `hud/applets.ts`: `AppId.OPTIONEX = 412`;
  - `WorldScreen.ts`: the window and `openWindow('option')`;
  - `style.css`: `.hud-option*`;
  - `tools/convert/src/ui/uiStage.ts`: `THEME_FILES` gets `WndVolumeBar.tga` (key `0xffff00ff`) and `ButtSpin.tga`;
  - `apps/client/test/hud.test.ts`: the eighth menu line and the taller menu.
- Test: `apps/client/test/optionWindow.test.ts`, `tools/convert/test/uiStage.test.ts`.

**Interfaces:**
- Consumes: `GameAudio.settings`, `setEffects` and `setMusic` (Task 6).
- Produces `class OptionWindow(art: UiArt, audio: Pick<GameAudio, 'settings' | 'setEffects' | 'setMusic'>, doc)`, a
  `WindowFrame` titled "Option".
  - The content box is 234 × 78. The group is drawn at its resource positions less (232, 216):
    - "Sound Option" at (8, 8);
    - "BGM" at (8, 28), with its bar at (116, 28, 110 × 18);
    - "Sound Effect" at (8, 50), with its bar at (116, 50, 110 × 18).
  - The knob, 16 × 16, sits at `bar.left + step · 10`.
  - Each bar is `role="slider"` with `aria-valuemin` 0, `aria-valuemax` 10 and `aria-valuenow`.

- [ ] **Step 1: Write the failing tests.**
  - **`optionWindow.test.ts`** (jsdom):
    - it opens with steps 5 and 10, and the music knob is at `left: 166px`;
    - a press 30 px right of the music knob makes `setMusic(6)`;
    - from 5, a press at the knob, then three moves to the right, gives 6, 7 and 8;
    - at step 10, a press at the bar's right end lands on the knob and keeps 10;
    - ArrowLeft on the focused effects bar gives `setEffects(9)`;
    - the window sends no packet.
  - **`uiStage.test.ts`:** `ui/wndvolumebar.png` and `ui/buttspin.png`.
  - **`hud.test.ts`:** the menu's eighth line reads "Option" and comes before "Log out".
- [ ] **Step 2:** Run `npx vitest run apps/client/test/optionWindow.test.ts apps/client/test/hud.test.ts tools/convert/test/uiStage.test.ts`.
  Expected: FAIL.
- [ ] **Step 3:** Implement. Then convert the two pictures: `npm run convert -- --only ui --client "…\Client"`. Expected:
  exit 0.
- [ ] **Step 4:** Run the Step 2 command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the Option window's sound sliders`.

### Task 9: The browser spec, the docs and the checkpoint

**Files:**
- Create: `apps/client/e2e/audio.spec.ts`, `docs/piece6-m2-checkpoint.md`.
- Modify:
  - `README.md`: Piece 6 M2, and FFmpeg as a prerequisite with its search order;
  - `docs/device-testing.md`: "Piece 6, milestone 2";
  - `docs/hosting.md`: the audio MIME types and Range requests;
  - `docs/conversion-baseline.md`: an "Audio stage" block with its run table, times, files and bytes.
- [ ] **Step 1: Write `audio.spec.ts`** on desktop and phone, with `playGateway` and the test hooks' `played`:
  - the first tap on the login form requests `music/bgmdu1mystery.*`, and no world track is requested before it;
  - entering Flaris at a Flarine spot requests `music/bgmto1flaris.*`;
  - a press on the Start button logs sound 1;
  - opening Start → Option, changing BGM and reloading keep the step;
  - a pushed PLAYSOUND of `SND_INF_TRADE` logs 4;
  - the page sent no packet that it does not send without audio;
  - no `pageerror`.
- [ ] **Step 2:** Run `npm run test:e2e:client -- audio.spec.ts` once, with the port workaround if the owner's server
  holds 5174. Expected: all pass. Fix a failure from its cause.
- [ ] **Step 3: Write the docs.** The device steps cover:
  - the title, Flaris town and field, and Saint Morning tracks;
  - a death and a level-up jingle;
  - an NPC with music (MaFl_Benku);
  - attack, skill, potion, equip, pick-up and shop sounds;
  - the Option window, kept after a reload;
  - a hidden tab;
  - on an iPhone before iOS 18.4, the MP3.
- [ ] **Step 4:** Commit: `test(client): audio in the browser; M2 checklist and docs`.

---

## Owner's checkpoint

From `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, with the owner's `dev:client` stopped:

| What | Command | Time | Pass |
|---|---|---|---|
| All client browser tests | `npm run test:e2e:client` | about 35–45 min | no `failed` line |
| Real-file tests | `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 10 min | no `failed` line |
| Listening | `docs/device-testing.md`, "Piece 6, milestone 2", with `dev:client` started from this folder, on the PC, an Android phone and an iPhone | about 20 min | every "Success:" holds |

# Piece 6 milestone 2 checkpoint: music and sound

Date: 2026-11-02. Branch `piece6`.
- Spec: [Piece 6 design](superpowers/specs/2026-11-02-piece6-design.md) §3.3.
- Plan: [M2 plan](superpowers/plans/2026-11-02-piece6-m2-sound.md).
- Research: [M2 research](superpowers/specs/2026-11-02-piece6-m2-sound-research.md).

The owner tests M2 together with M3. Their checks below are still open.

## What changed

- **Readers** (`packages/formats`):
  - `readIdFileScript` reads `sound.inc` and `default.bgm`, copying `LoadScript` of both players.
  - `readRegions` reads a world's `.rgn` region rows, copying `LoadRegion`/`ReadRegion`.
  - `ItemProp.sndAttack2`, `MoverProp.sndIdle1` and `CharacterDef.music` keep the sound columns Neuz reads.
- **Converter:**
  - A new `audio` stage copies the 1,150 WAVs the scripts name and the 36 Ogg tracks. It makes an MP3 copy of each
    track with FFmpeg; without FFmpeg it records one failure and copies the rest.
  - The data stage writes the optional `data/audio.json`.
  - The UI stage converts the two slider pictures.
- **Protocol:** PLAYMUSIC and PLAYSOUND are read.
- **Client:**
  - `world/sound/musicRules.ts` copies CWndWorld's music: region, then world, then BGM_TH_GENERAL; a direct region
    loops; jingles cut in.
  - `world/sound/soundRules.ts` copies CSoundManager's placement: 100 m, the 4/d fall-off from 4 m, silent beyond 70 m,
    integer cuts, 10 copies of a file, Neuz's volume curves.
  - `world/sound/worldSounds.ts` is every trigger, in one place.
  - `audio/` is the page's audio: Web Audio effects, streamed music through a gain node, the first-gesture start, the
    hidden-tab pause, and the two kept settings.
  - The title track plays on the login form. Every button clicks, except the item slots, the ground items and the web's
    attack and jump buttons.
  - **Start → Option** opens Neuz's Sound Option sliders.
- **Committed with M2 at the owner's request:** the ground-item models work found uncommitted in this worktree
  (193e52a).

## Decisions

The plan's 16 rulings, and those made while building, are in the M2 final report. In short:
- the window is Neuz's Option window with only its sound group;
- left and right follow the camera;
- a failed track is not retried every frame;
- a hidden tab pauses the sound;
- nothing plays or downloads before the first gesture;
- the sounds of things FlyffWeb does not have yet (projectiles, quests, guilds, flying) are left out.

## Tests added

- `packages/formats/test/audioReaders.test.ts` (5), and cases in `gameDataReaders.test.ts` (3).
- `tools/convert/test/audioStage.test.ts` (4), `ffmpeg.test.ts` (3), `audioCatalog.test.ts` (5),
  `audio.corpus.test.ts` (4, on the real client), and a case in `uiStage.test.ts`.
- `packages/protocol/test/worldSound.test.ts` (4).
- `apps/client/test/`:
  - `musicRules.test.ts` (9) and `soundRules.test.ts` (12);
  - `gameAudio.test.ts` (17) and `soundSettings.test.ts` (4);
  - `worldSounds.test.ts` (14) and `clickSound.test.ts` (3);
  - `optionWindow.test.ts` (6);
  - cases in `moverViews.test.ts`, `effectManager.test.ts` and `hud.test.ts`.
- `apps/client/e2e/audio.spec.ts` (3, on desktop and phone).

## Builder's checks

- **Conversion:** `npm run convert -- --only audio,data` on the real client exited 1. The one failure was the missing
  FFmpeg: sound 1,150 ok, music 36 ok, data 14 ok and 82 warnings, as before. The two slider pictures converted with 0
  failures.
- **Corpus:** `audio.corpus.test.ts` passed: 40 music ids, Madrigal's 109 regions as the research has them, 217 effect
  sounds, 33 skills.
- **Unit suite:** `npm test`: 156 files passed, 3,055 tests passed, 8 skipped.
- **Typecheck:** clean.
- **Browser spec:** `npm run test:e2e:client -- audio.spec.ts`: 6 passed.

## Final review

A fresh reviewer checked M2. It found nothing Critical and four Important findings. Each was fixed with a test that failed first. The suite after the fixes: 156 files, 3,060 tests passed, 8 skipped. `audio.spec.ts`: 9 passed, 1 skipped (the keyboard case on the phone).

- **No burst after a stall:** a phone page that was frozen in the background no longer plays the sounds of the second or more it catches up, all at once. Only the last step plays. No effect waits in a context that is not running, and hiding the tab ends the effects that play.
- **Silence for a track that cannot play:** the previous track no longer plays on, as Neuz closes its stream first.
- **The Option window** goes with the world. One left open at logout leaked and swallowed the next world's first Escape.
- **Silent slots:** the task bar's slots and the shop's stock items no longer click, as Neuz's do not.
- **Also hardened:** the world entry no longer waits for `audio.json`.

Nine Minor findings are left for later, listed in the M2 final report.

## Owner checks

- [ ] FFmpeg installed, and `npm run convert -- --only audio,data --client "…\Client"` ends with 0 failed.
- [ ] `npm run test:e2e:client`, the full run: no `failed`.
- [ ] `npm run test:corpus` with `FLYFF_CLIENT` set: no `failed`.
- [ ] `docs/device-testing.md`, "Piece 6, milestone 2", on the PC, an Android phone and an iPhone.

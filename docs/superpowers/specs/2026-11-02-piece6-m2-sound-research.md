# Piece 6 M2 research: music and sound in Neuz V15

Date: 2026-11-02. For the [Piece 6 design](2026-11-02-piece6-design.md) §3.3 and the
[M2 plan](../plans/2026-11-02-piece6-m2-sound.md), which cites this note as `[R §n]`.

C++ paths are relative to `Blouflash VS22 V15/`. FlyffWeb paths are relative to the FlyffWeb repository. `.rgn` and
`*.txt.txt` files are UTF-16LE; their line numbers are those of the decoded text.

## 0. Which code is built

- `Source/Neuz/VersionCommon.h:3` defines `__MAINSERVER`, so `__INTERNALSERVER` (`:6-8`) and its block (`:261-405`) are
  off. `__VER` is 15 (`:4`).
- **Music** is `Source/_Common/Music2.cpp` on the Miles library (`:4,11`). `Music.cpp` is empty in V15: its body sits in
  `#if __VER < 15` (`:23`). So `__USE_SOUND_LIB_FMOD` (`VersionCommon.h:192`) changes nothing.
- **Effects** are DirectSound, `Source/_DirectX/dsutil.cpp`. The live `CSoundManager::Play` is `:250-322`. The copy at
  `:125-235` is commented out.

## 1. Files

| What | Facts |
|---|---|
| `Client/Sound/` | 1,183 `.wav`, 169,614,896 bytes. All mono 16-bit PCM: 1,176 at 44,100 Hz, 4 at 22,050, 2 at 48,000, 1 at 70,000. Browsers decode them as they are. |
| `Client/Client/sound.inc` | A loose file: 1,760 lines, 1,667 entries. 350 entries name a WAV that is not in `Client/Sound/`. 179 WAVs are named by no entry. |
| `Resource/defineSound.h` | The `SND_*` and `BGM_*` values. The converter already has them in its defines (`packages/formats/src/script/defines.ts:137-143`). |
| `Client/Music/` | 40 `.ogg`, 55,150,460 bytes, plus `default.bgm`. |
| `Client/Music/default.bgm` | 42 entries naming 38 files. Missing: `Bgm4DuDarkon.ogg` (BGM_DU_INVISIBLE 70) and `BgmFiDarkon.ogg` (BGM_FI_DARKON3 124). `BgmTh3Return.ogg` is on disk as `Bgmth3Return.ogg`, which only a case-insensitive lookup finds. Not named: `BgmDu4Invisible`, `BgmExtra01`, `BgmExtra02`, `BgmInProfession`. |
| `Client/World/<dir>/<dir>.rgn`, `.wld` | Loose files: the region rows and the world's `bgm`. |

All of them are loose files, read by `CResFile` from disk before the packs (`_Common/File.cpp:273-290`), as the world
map's scripts are.

## 2. Reading the scripts

**`sound.inc` and `default.bgm`** share one format: `<ID> "<file>"` per entry, any whitespace between, `//` and `/* */`
comments (`_Common/scanner.cpp:591-630`).
- **Readers:** `CSoundManager::LoadScript` (`dsutil.cpp:39-60`, called at `Neuz/Neuz.cpp:1566`) and
  `CMusicMng::LoadScript` (`Music2.cpp:195-213`, called at `Neuz.cpp:1565`).
- **The ID** is a define name or a number (`Script.cpp:184-207`, `scanner.cpp:852-899`). An unknown name logs
  "Not Found" and becomes 0 (`Script.cpp:211-219`). ID 0 never plays (`dsutil.cpp:27`, `Music2.cpp:103`).
- **A repeated ID:** the last entry wins (`SetAtGrow`, `dsutil.cpp:54`, `data.h:342-345`). The real files have one case:
  2042 is both `SND_NPC_KERNIDLE1` and `SND_NPC_WORMVEDUQUEATK1` (`defineSound.h:1117-1118`, `sound.inc:997-998`), so
  2042 plays `NpcWormveduqueAtk1.wav`.
- **Paths:** `sound.inc` names are relative to `Sound\` (`path.h:13`, `dsutil.cpp:22-37`). `default.bgm` paths are
  relative to the client folder, `music\BgmTo1Flaris.ogg`.
- **A missing file** is noticed only when it plays: no sound (`dsutil.cpp:353-360`, `Music2.cpp:57-61`).

**Region rows** (`CWorld::LoadRegion`, `_Common/WorldFile.cpp:775-809`, called from `OpenWorld` `:253`). The keywords
are `region`, `region2` and `region3` (`:790`), each read by `ReadRegion` (`:413-553`). Its tokens, in order:
1. the keyword;
2. type (`:424`);
3. index `RI_*` (`:425`);
4–6. position x y z (`:427-429`);
7. `m_dwAttribute`, hex allowed (`:445`);
8. `m_dwIdMusic` (`:446`);
9. `m_bDirectMusic`, which is true only for the value 1 (`:447`);
10–11. the script and sound strings (`:449-450`);
12. the teleport world (`:451`);
13–15. the teleport x y z (`:454-456`);
16–19. **the rectangle: left, top, right, bottom** (`:457-460`);
20–21. the key and the target key (`:461-463`);
22–32. `region3` only: item and condition fields (`:466-476`).

Then come `title 0|1 [{ IDS }]` and `desc 0|1 [{ IDS }]` (`:497-522`).
- **Which rows count:** rows with index `RI_BEGIN` 12, `RI_REVIVAL` 13 or `RI_STRUCTURE` 14 stay out of `m_aRegion`
  (`:538-550`; `Resource/defineObj.h:1984-1986`).
- **The rest keep file order**, at most 256 (`Region.h:65`). Each starts with `m_bInside` false (`WorldFile.cpp:432`).
- **The inn flag:** `RA_INN` is `0x80` (`Resource/define.h:143`).

**World music:** the `.wld` token `bgm <n>` (`WorldFile.cpp:94-97`) sets `m_dwIdMusic`, which defaults to 0
(`World.cpp:96`). `WdMadrigal.wld:13` is `bgm 0`. `DuFlMas.wld:13` is `bgm 6` and `WdKebaras.wld:13` is `bgm 7`. The
others are 0. FlyffWeb's `.wld` reader already reads it (`packages/formats/src/world/wld.ts:35-36,98-99`), but no
manifest keeps it.

## 3. The music player (`Music2.cpp`)

- **`PlayMusic_(file, loops)`** (`:27-74`):
  - It returns at once when the same **file name** is playing (`:35`), so two IDs of one file count as one track.
  - Otherwise it closes the stream and opens the new file from its start (`:49-55`). There is no fade (`:38-46` are
    commented out).
  - A failed open leaves silence (`:57-61`).
  - Loops: 0 plays forever, 1 plays once (`:63-68`). It re-applies the volume (`:71`).
- **`PlayMusic(id, loops = 1)`** (`:101-112`) ignores 0 and `NULL_ID`, and an ID with no file. **`PlayBGM(id)`**
  (`:114-123`) is the same with one loop.
- **`StopMusic()`** (`:130-136`) pauses the stream. Nothing resumes it. Any later play reopens the file, the same file
  too, because a paused stream is not playing.
- **Status:**
  - `IsPlayingMusic()` (`:150-158`) is true only while the stream plays.
  - `IsStopMusic()` (`:160-169`) is its opposite: true when there is no stream, or it ended, was paused, or failed.
- **`SetVolume(v)`** (`:138-143`) is the Miles master level, 0–1, linear (assumed), and applies to music only.
- `LockMusic()` (`:125-128`) and `ProcessFadeMusic()` (`:77-94`) do nothing.
- **Window focus:** losing it does not pause or quieten the music (`Neuz.cpp:1484-1490`; the pause at
  `d3dapp.cpp:593` is commented out).

## 4. Which track plays in the world

`CWndWorld::Process` runs every frame while the player exists (`_Interface/WndWorld.cpp:8003`). It keeps `base`
(`m_dwIdBgmMusic`) and `direct` (`m_bBGM`), both 0 at the start (`:550,573`).

```
// block A (:8013-8048), first each frame
if base != 0:
  if IsStopMusic():                         // nothing playing: ended, paused or failed
    PlayBGM(base)                           // once, from its start
    if !direct: base = 0
else:
  base = world.bgm                          // .wld "bgm"
  if base == 0: base = BGM_TH_GENERAL       // 8, BgmTh1General.ogg
// the region loop (:8562-8689), m_aRegion in file order
for r in regions:
  if r.rect holds (trunc(x), trunc(z)):     // CRect::PtInRect: left <= x < right, top <= z < bottom
    if !r.inside:
      base = r.music; direct = r.direct
      PlayMusic(r.music)                    // nothing for 0; nothing if the same file plays
      if !direct: base = 0
      r.inside = !(r.attribute & RA_INN) || trunc(y) == trunc(landHeight(x, z))   // :8605-8611, :8680
      break                                 // __VER >= 9 (:8681-8683): at most one entry a frame
  else:
    r.inside = false
```

What this means:
- **Changes happen on entry.** Leaving a region changes nothing.
- **A direct region** loops its track.
- **A non-direct region** plays its track once, then the world's track loops.
- **A region with music 0** lets the current track end, then the world's track loops.
- **An inn region** keeps re-entering every frame while the player is off the ground.
- **A new world:** `OnReplace` sets `base = 0` and stops the music before the world loads (`Neuz/DPClient.cpp:2422-2427`).
  It leaves `direct` as it was. The new world's regions all start outside.

**Fixtures** (`Client/World/WdMadrigal/WdMadrigal.rgn`; world 1, `WdMadrigal.wld:13` `bgm 0`, so the default is 8):

| Row (line) | Rectangle (l, t, r, b) | Attribute | Music / direct | Track |
|---|---|---|---|---|
| Central Flarine (`:748`, index 47) | 6870, 3184, 7073, 3285 | `0x410` | 2 / 0 | BgmTo1Flaris.ogg |
| Flarine (`:796`, index 55) | 6848, 3172, 7261, 3385 | `0x0` | 2 / 1 | BgmTo1Flaris.ogg |
| Flaris field (`:868`, index 59) | 6953, 3512, 7255, 3736 | `0x0` | 120 / 1 | BgmFi1Flaris.ogg |
| Saint Morning (`:1324`, index 96) | 8229, 3534, 8604, 3941 | `0x410` | 3 / 1 | BgmTo2Music.ogg |

Expected results:
- **At (6970, 3230), from outside both Flaris rows:** frame 1 enters row 47, which starts BgmTo1Flaris. Frame 2 enters
  row 55, which makes it the looping base. BgmTo1Flaris loops.
- **Entering row 55 at (6900, 3350), then walking into row 47:** row 55 makes Flaris the base. Row 47 then clears it.
  Flaris ends once, then BgmTh1General loops.
- **At (7100, 3638):** BgmFi1Flaris loops.
- **At (8400, 3700):** BgmTo2Music loops.

## 5. Title, entry, logout

- **Title track:** `BGM_TITLE` (1, `defineSound.h:1899`, `default.bgm:1`, `BgmDu1Mystery.ogg`), looping forever.
  - It starts at the start (`Neuz.cpp:1724`) and again on every logout (`WM_LOGOUT`, `:1465-1471`).
  - Server and character select add no music of their own (`WndTitle.cpp`), so the title track plays on.
- **Entering the world:** `CWndMgr::OpenField` stops it (`WndManager.cpp:2151-2153`) when the own player is created.
  The first world frame then picks the world's track (§4).
- **A world change** is silent while it loads (`DPClient.cpp:2426-2427`).

## 6. Music the game plays over the region's

Each is `PlayMusic(id, 1)`, a hard cut unless the same file is playing. When it ends, block A restarts the base track
from its start.

| Trigger | ID | Where |
|---|---|---|
| The own player dies, unless the world is 202, 210, 220 or 230 (`WI_WORLD_GUILDWAR`, `WI_DUNGEON_MUSCLE`, `_KRRR`, `_BEAR`; `defineWorld.h:57,71-73`) or 1:1 guild combat | `BGM_IN_DEATH` 22 | `DPClient.cpp:2012-2034` |
| The own player levels up | `BGM_IN_LEVELUP` 23 | `MoverParam.cpp:1483` (`AddExperience`), `:1728` (`SetExperience`) |
| An NPC dialog opens, for a character with `SetMusic` | its `m_dwMusicId` | `WndDialog.cpp:290-297`; `SetMusic` in `character.inc` (`Project.cpp:2983-2987`) |
| An NPC with `dwClass` `RANK_BOSS` (4, `defineAttribute.h:162`) is added within 30 m (3D length) of the player | `BGM_IN_BOSS` 21 | `DPClient.cpp:1252-1259` |
| The server's PLAYMUSIC: snapshot `0x00d1`, one `u_long` ID | that ID | `DPClient.cpp:605,11736-11742`; sent by the GM `/music` command (`FuncTextCmd.cpp:2138-2146`) and guild combat (`eveschool.cpp:1283-1286`) |

Not in FlyffWeb yet, so not copied:
- quest start and end (`MoverParam.cpp:3470,3509,3574`);
- party, guild and guild-war music (`DPClient.cpp:4471,5317,7708-7712,12713`);
- flying (`MoverEquip.cpp:1803-1818`);
- mini-games and the Rainbow Race;
- the credits;
- skill points and job change (`DPClient.cpp:3403,3638,14694`).

Combat music (`MoverMove.cpp:31-69`) is off unless the `BattleBGM` option is on, and it defaults to off
(`HwOption.cpp:194`).

**Volume:** `m_fBGMVolume`, default 0.5 (`HwOption.cpp:209`), in steps of 0.1. Neuz applies it at start (`Neuz.cpp:282`),
after every track start (`Music2.cpp:71`) and from the slider (§10). 0 plays silently and the rules go on.

## 7. The effects player (`dsutil.cpp`)

- **The macros:**
  - `PLAYSND(id, pos = NULL)` → `g_SoundMng.Play(id, pos)` (`dsutil.h:216-226`).
  - An ID ≤ 0 is silent (`dsutil.cpp:27`). An ID with no file is silent too (`:61-74`).
- **The listener** is the own player's position, with the angle `m_fCurRotx`. `SetListener` runs every world frame
  (`WndWorld.cpp:8498`; `dsutil.cpp:103-124`). The DirectSound listener itself never moves from (0,0,0), facing
  (0,0,−1) (`:609-623`).
  - With camera lock, Neuz's default (`HwOption.cpp:245`), the camera's yaw is `m_fCurRotx + 180`
    (`Camera.cpp:240-246,351`), so the angle follows the view.
  - Without camera lock it is the camera's offset from the player's facing.
- **A positioned sound** (`dsutil.cpp:262-288`):
  - `d = soundPos − listenerPos`; `r = sqrt(dx² + dz²)`.
  - **When `r > 100` it does not play.**
  - `a = acos(dz / r)` (no division when the length is ≤ 1); when `dx < 0`, `a = 2π − a`; `a −= rad(m_fCurRotx)`.
  - The position is `(trunc(sin a · r), trunc(dy), trunc(cos a · r))`, fixed when the sound starts and never moved.
- **Distance:** min 4, max 70 (`:312-313`), the inverse roll-off (gain 4/d from 4 m), muted beyond 70 m in 3D
  (`DSBCAPS_MUTE3DATMAXDISTANCE`, `:383`). There is no Doppler.
- **A sound with no position** plays at full volume, centred (`:289-296`).
- **Copies:** 10 buffers per file (`:383`). An 11th play while 10 are playing is lost (`:1290-1311`). Sounds are never
  stopped early (`Stop` does nothing, `:238-248`).
- **Volume:**
  - `m_nSoundVolume = (int)(−(1 − v) · 5000)` hundredths of a dB (`Neuz.cpp:280`, `WndOptionGame.cpp:249-250`), so the
    gain is `10^(−2.5 · (1 − v))`.
  - At `v = 0` nothing plays (`dsutil.cpp:253`).
  - `m_fEffectVolume` defaults to 1.0 (`HwOption.cpp:208`).

## 8. Motion sounds

- **The data:** `MOTION_ATTR { m_dwAttr, m_nSndID, m_fFrame }`, flag `MA_SOUND` 2 (`Bone.h:105-107,124-130`). FlyffWeb's
  converted motions keep them as `MotionEvents.sound: [frame, soundId][]`
  (`packages/formats/src/web/motionEvents.ts:13-24`).
- **Firing** (`ModelObject.cpp:1588-1705`, `Bone.h:170-177`):
  - Neuz tests **before** the frame moves, with the old and current frame of the last move.
  - The test reads only the attribute of frame `trunc(current)`: `old < frame <= current`, with `m_nSndID > 0`, and not
    while paused.
  - Frames that one move skips over make no sound (the skip loop at `:1603-1610` checks only quakes).
- **A new motion** starts at current 0, old −1 (`Model.h:125-133`), so a frame-0 sound plays on its first move. FlyffWeb
  starts the same way (`apps/client/src/world/render/MoverViews.ts:91`).
- **Looping:** each loop shifts old back (`Model.cpp:23-26`), so frame-0 sounds play on every loop. Idle motions do this.
- **Which motion:** only the current one, never the motion being blended out. No sound plays during the hit pause.
- **Which movers:** every mover the client processes, at its feet.
- **Footsteps** (`CMover::ProcessWalkSound`, `Mover.cpp:3202-3219`, called at `:3822` before the frame move at `:3862`):
  - only for a player not in transparent mode, while moving forward (`OBJSTA_FMOVE`);
  - on the motion's **hit** frames (`IsAttrHit()`, the last move's old/current);
  - always `SND_WALK_LANDSOFT` 1202, at the mover. There is no terrain check.

## 9. The effects FlyffWeb's actions make

"Positioned" sounds use §7. "2D" sounds play at full volume, centred. IDs are `defineSound.h` values.

| Event | Sound | Where in C++ | Positioned |
|---|---|---|---|
| Any `CWndButton` press, on mouse-down: window buttons, close buttons, check boxes, radio buttons, menu lines | `SND_INF_CLICK` 1 | `WndControl.cpp:692-694` | 2D |
| A click in the NPC dialog's text | `SND_INF_CLICK` 1 | `WndDialog.cpp:348-353` | 2D |
| Swing, being hit, dying, jumping (any motion) | the motion's own (§8) | `ModelObject.cpp:1594` | at the mover |
| A melee hit that lands: the attacker's active-hand item's `dwSndAttack1` (an NPC's virtual weapon; unarmed is `II_WEA_HAN_HAND`) | item column 118 | `MoverActEvent.cpp:1671-1691`; `Mover.cpp:2940,2960-2965` | at the attacker |
| A critical hit (`AF_CRITICAL` in DAMAGE): the attacker's weapon `dwSndAttack2` | item column 119 | `DPClient.cpp:1903-1907` | at the attacker |
| An effect is made: its `mdlDyna.inc` SFX entry's 4th field (`m_szPart`), a WAV name; 217 effects have one | that file | `CreateObj.cpp:328-329` (and `:418,517,568`) | at the source |
| `XI_GEN_CURE01` 62 and `XI_GEN_REF01` 65, which potions and food make | `SND_GEN_LEVELUP` 70 | `CreateObj.cpp:180-181`; `defineObj.h:152,155` | at the source |
| `XI_GEN_WATERCROWN01` 71 | `SND_GEN_WATER` 71 | `CreateObj.cpp:82`; `defineObj.h:158` | at the source |
| A skill's effect is made or its projectile fired: the skill's `dwSndAttack1` (33 skills) | skill column 118 | `Ctrl.cpp:982-986`, `:1386-1390` | at the caster |
| Equip: weapon; jewelry; cloth; armour or armour-etc. | 8, 11, 10, 9 | `MoverEquip.cpp:1013-1036` (`IK1_WEAPON` 1, `IK1_GENERAL` 3 + `IK2_JEWELRY` 13, `IK1_ARMOR` 2 + `IK2_CLOTH` 9, `IK1_ARMOR` 2 + `IK2_ARMOR` 7, or any `IK2_ARMORETC` 8) | at the mover, own and others (`DPClient.cpp:2477,2505`) |
| Unequip | `SND_INF_INVENTORYDROP` 5 | `MoverEquip.cpp:1041` | at the mover |
| The own inventory gets items (CREATE_ITEM): once per slot written | `SND_INF_GROUNDPICKUP` 7 | `DPClient.cpp:2148-2156` | at the own player |
| The own gold changes (`DST_GOLD`) | `SND_INF_TRADE` 4 | `MoverParam.cpp:935-950` | 2D |
| Shop: buy confirmed, sell | `SND_INF_TRADE` 4 | `WndShop.cpp:655`, `:232-235` | 2D |
| An inventory item dropped on the world, before any confirm | `SND_INF_GROUNDDROP` 6 | `WndWorld.cpp:7828-7830` | 2D |
| A ground item appears: its `dwSubDefine` (176 items) | item column 106 | `DPClient.cpp:1293-1298` (`__ITEM_DROP_SOUND`) | at the item |
| Clicking a mover: its `dwSndIdle1` (4 movers) | mover column 80 | `WndWorld.cpp:7063` | 2D |
| The server's PLAYSOUND, type 0: snapshot `0x00d2`, `BYTE` type, `u_long` ID. Type 1 (a file name, for the voice option) is not played | that ID | `DPClient.cpp:606,11744-11767`; upgrade results and `SND_PC_CHAOS` | 2D |

No sound:
- window open and close (`SND_INF_OPEN`/`CLOSE` are never played: `WndNeuz.cpp:150`, `WndBase.cpp:341,1594,1612`);
- revival;
- teleport;
- error beeps;
- chat.

The level-up and death sounds are the music of §6. Another player's level-up is silent (`DPClient.cpp:3351`).

Not in FlyffWeb yet, so not copied:
- the victim's `dwSndDmg2` when a projectile or magic effect hits (`CSfx::DamageToTarget`, `SfxObj.cpp:119`);
- the 7 magic projectiles' hit sounds (`Sfx.cpp:2489,2581,2664,2783,3177,3261,3344`);
- the messenger ring.

FlyffWeb has none of those effect classes or windows.

**Data columns** (0-based):
- `propItem.txt`/`propSkill.txt`:
  - 106 `dwSubDefine` (for items);
  - 118 `dwSndAttack1`;
  - 119 `dwSndAttack2`.
- `propMover.txt`: 80 `dwSndIdle1`.

`ItemProp.sndAttack1/2` and the mover sound columns are parsed (`propItem.ts:87-88,170`, `propMover.ts:80-81`), but no
web catalog keeps them.

## 10. The volume sliders

- **Window:** V15 puts them in the Option window's game tab, `APP_OPTEX_GAME12` (`Resource/ResData.inc:20544`), shown by
  `CWndOptionGame` (`WndOption.cpp:44-45,64-66`). The Option window is `APP_OPTIONEX`, titled "Option"
  (`IDS_RESDATA_INC_001290`, `ResData.inc:13196`). The Start menu's "Option" line opens it, just before Log out
  (`WndTaskBar.cpp:2638`).
- **The "Sound Option" group** (`ResData.inc`, the tab's controls):
  - `WIDC_STATIC7` at (240, 224, 336, 240): "Sound Option" (`IDS_RESDATA_INC_005504`).
  - `WIDC_STATIC5` at (240, 244, 342, 264): "BGM" (`005502`); its slider is `WIDC_CUSTOM1` at (348, 244, 458, 262).
  - `WIDC_STATIC13` at (240, 266, 342, 286): "Sound Effect" (`005508`); its slider is `WIDC_CUSTOM2` at
    (348, 266, 458, 284).
- **Art** (`WndOptionGame.cpp:29-52,75-76`):
  - `WndVolumeBar.tga` (key `0xffff00ff`), stretched over the slider's rectangle;
  - `ButtSpin.tga`, 16×16, drawn at `left + step · trunc(width / 11)`, which is 10 px a step for the 110 px bars.
- **Input:**
  - Pressing on the knob starts a drag (`GetSliderStep` returns −1, `:419-447`).
  - A press elsewhere on the bar moves one step toward the press, **without a limit**.
  - Each drag move (`GetRangeSlider`, `:449-468`) moves one step toward the pointer, kept to 0..10.
  - Every change applies at once: music `SetVolume(step · 0.1)` and effects `m_nSoundVolume` (`:249-263,404-415`).
- **Start values:** `trunc(volume · 10)` (`:77-78`). They are saved in `neuz.ini` as `Sound <voice> <effect> <bgm>`
  (`HwOption.cpp:869-874,1102`).

## 11. Browser facts

- **Ogg:** Safari plays Ogg only from iOS and macOS 18.4 (Piece 6 design §2). The client supports Safari 16, so each
  track also needs an MP3.
- **Volume on iOS:** `HTMLMediaElement.volume` cannot be set on iOS. It always reads 1. So music is routed through Web
  Audio: `<audio>` → `MediaElementAudioSourceNode` → `GainNode`. That also streams the file instead of decoding all of it.
  A 3-minute track would be about 60 MB decoded.
- **Starting audio:** an `AudioContext` and `play()` work only after a user gesture. A refusal (`NotAllowedError`) is not
  an error of the file.
- **WAV decoding:** `decodeAudioData` decodes all the shipped WAVs (mono 16-bit PCM). Safari supports the promise form
  and the unprefixed `AudioContext` from version 14.1.
- **Serving:** the dev server's sirv sends `audio/ogg`, `audio/mpeg` and `audio/wav`, and answers Range requests
  (`packages/scene/vite/serveDist.ts:54-76`).

## 12. Where FlyffWeb plugs in

- **Converter:**
  - The `Stage` contract and `DEFAULT_STAGES` are `tools/convert/src/run.ts:15-46`. `--only` uses `matchesOnly`
    (`src/util.ts:6-19`).
  - Loose files: `ClientFs.find`/`list` (`src/ClientFs.ts:92-121`).
  - The KTX-Software pattern for an outside tool is `src/textures/ktx.ts:9-96` and `convertTexture.ts:34-36,189-207`.
  - The optional catalog is written in its own try (`src/data/gameDataStage.ts:546-565`).
  - Index merges keep earlier runs (`src/output/AssetWriter.ts:95-123`).
- **Protocol:**
  - Readers: `WORLD_READERS` (`packages/protocol/src/world/readers.ts:30-82`), `MessageType` (`constants.ts:83-145`).
  - A message with no reader is skipped (`bundle.ts:163-166`). Test writers: `packages/testkit/src/world.ts`.
- **Client:**
  - **Frame moves:** `MoverViews.step` → `moveFrame` → `frameMove`, and the hit test `hitIndex`
    (`render/MoverViews.ts:99-134,251-263,572-604`).
  - **Melee hit:** `ActionMover.ts:1027-1030` → `WorldState.onAttackMelee` (`:662-704`).
  - **Damage:** `WorldState.damage` (`:587-603`).
  - **Effects:** `EffectManager.play` (`fx/EffectManager.ts:227-249`).
  - **Equip:** `WorldState.ts:252-271`, `OwnState.ts:280-292`.
  - **Pick-up:** CREATE_ITEM (`OwnState.ts:259-266`).
  - **Own death and level-up:** `OwnState.ts:305-313,410`.
  - **Shop:** `hud/shopWindow.ts:140-159`.
  - **Drop:** `items/itemActions.ts:33`.
  - **NPC dialog:** `WorldScreen.ts:776-781` → `hud/npcDialog.ts:25`.
  - **Snapshot dispatch:** `WorldScreen.apply` (`:441-497`).
  - **World change:** `WorldScreen.handle` (`:372-427`).
  - **Teardown:** `disposeWorld` (`:1409-1469`), `end` (`:1472-1485`).
  - **Tab visibility:** `onVisibility` (`:1335-1338`).
  - **Rules step:** `WorldScreen.step` (`:1050`). It keeps running in a hidden tab.
  - **Lobby:** `lobby/LobbyApp.ts:56-216`; `main.ts:22-33`.
  - **Test hooks:** `ClientPlayed` (`src/testHooks.ts:37-44`).
- **Buttons:** every HUD and lobby control is a `<button>` (31 places). The click sound can be one delegated listener.

## Uncertain

- **Miles:** loop count 0 is taken to mean forever, a paused stream to report stopped, and the master level to be linear.
- **DirectSound:** the pan curve and the left/right handedness are untested. They cannot be heard beside Neuz here.
- **Packed scripts:** only the loose `.ani` files and `Resource/` copies of the `.inc` files were scanned.

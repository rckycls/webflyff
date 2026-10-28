# Conversion baseline

The numbers of the first full run of the converter over the real `Client/` folder (Task 14). Later runs can be compared against this one to see what a converter change did to time, counts and sizes.

| | |
| --- | --- |
| Date | 2026-10-21 |
| Commit | `5ec764c` (`feat(convert): world manifest and tile conversion`) |
| Command | `npm run convert -- --jobs 8` (from `FlyffWeb/`, into an empty `dist/assets`) |
| Result | exit 0, **0 failures** (`report.json` `failures` is `[]`), 166 warnings |
| Machine | AMD Ryzen 7 5700U (8 cores, 16 logical CPUs), Windows 11, Node 24.19.0, KTX-Software `ktx` v4.4.2 |
| Corpus tests | `npm run test:corpus`: 9 files, 76 tests, all pass, 65 s |

Sizes below are binary (1 MiB = 1,048,576 bytes), to match the console summary, whose "MB" is the same unit.

## Wall time and `--jobs`

| Stage | Time |
| --- | --- |
| textures (5,674 `.ktx2` encodes) | 373.5 s |
| models (skeletons, motions, models) | 33.5 s |
| worlds (manifests and tiles) | 9.2 s |
| **Whole run** | **417 s (6 min 57 s)** |

`--jobs 8` was used: this PC has 16 logical CPUs, and every `ktx` process is multi-threaded itself, so half the logical CPUs as parallel files was the planned starting point. It converted about 15 textures per second at a steady rate and finished in under 7 minutes, so no other value was tried. (The default, CPU count - 1, would be 15 jobs here.)

## Files per kind

Every file the converter writes has its own entry in `index.json` (15,364 entries, 1.28 MiB raw, 210 KiB gzip, 176 KiB brotli).

| Kind | Client input | Output | Count |
| --- | --- | --- | --- |
| textures | `.dds`, `.tga`, `.bmp` of `Model/TextureMid` and `World/TextureMid` | `textures/*.ktx2` | 5,674 |
| skeletons | `Model/*.chr` | `skeletons/*.glb` | 303 (all 303) |
| motions | `Model/*.ani` | `motions/*.glb` | 2,928 (of 2,931; 3 have no skeleton) |
| models | `Model/*.o3d` | `models/*.glb` | 4,192 (of 4,201; 9 are files Neuz itself rejects) |
| worlds | `World/<name>/*.wld` and `*.lnd` | `worlds/<name>/manifest.json` and `worlds/<name>/tiles/<x>_<y>.bin` | 2,267 = 35 manifests + 2,232 tiles |
| **Total** | | | **15,364** |

The collision shapes came later (Piece 3, milestone 2: commit `4bd746c`, 2026-10-23), from the models stage on the same client, so they are not in the total above:

| Kind | Client input | Output | Count |
| --- | --- | --- | --- |
| collision shapes | the collision mesh of each converted `Model/*.o3d` that has one (`CObject3D::m_CollObject`) | `collision/*.bin` (9 floats a triangle, in the model's own space) | 1,144 files, 4.75 MiB (4,983,520 B), 138,304 triangles |

The client has 37 world folders besides `World/TextureMid`. 35 have a `.wld` and were converted. `WdConvert` holds only bitmaps, and `WdLux` holds 25 `.lnd` tiles but no `.wld`, so the converter leaves both out. 2,232 of the 2,257 `.lnd` files in `Client/World` were converted (the 25 left out are `WdLux`'s).

## Input and output bytes per kind

Input is what the converter read from the client; output is what it wrote (from `report.json` `kinds`). No `.tmp` files were left behind.

| Kind | Input | Output | Output / input |
| --- | --- | --- | --- |
| textures | 601.8 MiB (631,042,556 B) | 138.6 MiB (145,378,309 B) | 23.0% |
| skeletons | 1.8 MiB (1,854,438 B) | 1.6 MiB (1,720,152 B) | 92.8% |
| motions | 104.2 MiB (109,298,001 B) | 156.6 MiB (164,197,024 B) | 150.2% |
| models | 155.8 MiB (163,377,410 B) | 155.6 MiB (163,123,532 B) | 99.8% |
| worlds | 522.8 MiB (548,204,054 B) | 518.7 MiB (543,893,632 B) | 99.2% |
| **Total** | **1,386.4 MiB (1,453,776,459 B)** | **971.1 MiB (1,018,312,649 B)** | **70.0%** |

Motions grow by half: a motion `.glb` stores per-frame translation, rotation and scale samplers for every bone track (glTF animation channels), which takes more room than the `.ani` file. Tiles are close to their `.lnd` size because a tile keeps the raw 129 x 129 `f32` height grid and an uncompressed 128 x 128 RGBA light map per layer (see `packages/formats/src/web/tileBin.ts`).

## Warnings by message

All 166 warnings are expected outcomes, ruled on in earlier tasks. Copied from `report.json` (`warnings`), grouped by message type.

| Count | Kind | Message |
| --- | --- | --- |
| 128 | worlds | An object's model is an SFX or billboard model (a `.sfx`, not an `.o3d`), so its objects get no model. 32 distinct models (`obj_clouds01`..`04`, `obj_fire*`, `obj_glowfly*`, `obj_skylight*` and others). Warned once per world and model. |
| 15 | worlds | `skipped N SFX objects (out of scope)`, once per world (472 in `WdMadrigal`, 522 in `DuOminous`). |
| 1 | worlds | `skipped 46 SFX objects (out of scope) and 97 objects with scale (0, 0, 0)` (`DuDreadfulCave`). |
| 7 | models | `Neuz also rejects this file (Object3D.cpp:951)`: the stored model name differs from the file name (`Mvr_PetManaUnicorn01`, `Part_fCloSailor01Hat`..`04Hat`, `Part_mCloKorean01Hat`, `region_Path`). Skipped. |
| 2 | models | `Neuz also rejects this file (Object3D.cpp:959)`: version 0 is older than the oldest the client reads (20), the two old head files `Part_femaleHead.o3d` and `Part_maleHead.o3d`. Skipped. |
| 7 | models | A texture was not converted (it is not in `Model/TextureMid`), so the material names no texture. Five name a real texture file that is missing (`itm_GenFooCola.DDS`, `Item_SysSysEveIpod.dds`, `obj_boxMap01.bmp`, `Obj_DuDkRoPrEgg02.dds`, `obj_volcane_uvwani.dds`), two name a placeholder (`1.PSD` in `Obj_DuDkPrWharf03.o3d`, `2.bmp` in `obj_MaFlStation.o3d`). |
| 3 | motions | `no skeleton`: no `Model/<name>.chr` fits the motion name (`Mvr_BangBig_walk`, `Mvr_DwarpetDust_Walk`, `mvr_RockMuscleBig_walk`). Skipped. |
| 2 | motions | The motion's bone parents differ from its skeleton's (`mvr_Ganesa_groggy`, `Mvr_Gongury_dmgDie`); the skeleton's hierarchy is used. |
| 1 | motions | Fewer bone tracks than the skeleton has bones (`Mvr_InfoPeng_Getup`, which Neuz logs too); the other bones keep their rest pose. |
| 0 | textures, skeletons, index | none |
| **166** | | |

No world warned about an unconverted terrain texture or a layer id missing from `Terrain.inc`.

## Failures

**0.** `report.json` `failures` is empty and the console summary ends with `Total: 15,364 ok, 166 warn, 0 failed`. (The console summary does not print failure messages; always read `report.json`'s `failures` list to confirm.)

## Effects and UI stages (Piece 4, Task 11)

Two stages came after the first full run: effects (every `.sfx` the model index names, and the textures those effects use) and ui (icons, window pieces, the damage-number sheet and its frame lists, and the item icons). They ran on the real client into the existing `dist/assets` (the earlier stages' files stay in `index.json`, as for any `--only` run). The effects stage ran first with the ui stage (commit `fdb7f5d`); the ui stage was run again after the item icons moved to `Client/Item` (the fix `fix(convert): item icons come from Client/Item`, ruling R9), so the ui and data rows below are from that second run and the effects rows from the first.

| | First run (effects, ui, data) | Second run (ui, data) |
| --- | --- | --- |
| Date | 2026-10-24 | 2026-10-24 |
| Commit | `fdb7f5d` `feat(convert): effects and UI art stages`, on top of `fcb90a7` | `fix(convert): item icons come from Client/Item`, on top of `78eb32e` |
| Command | `npm run convert -- --only effects,ui,data --jobs 8` (from `FlyffWeb/`) | `npm run convert -- --only ui,data --jobs 8` |
| Result | exit 0, **0 failures**, 4 warnings from the new stages | exit 0, **0 failures**, 1 warning from the ui stage |
| Machine | the same as above (AMD Ryzen 7 5700U, Windows 11, Node 24.19.0, `ktx` v4.4.2) | the same |

`--only effects,ui,data` runs just those three stages: a comma separates globs, and a stage matches its own name (the textures, models and worlds stages found nothing called that and took 0.1 s between them). The data stage ran again only because it names the new files. The second run's `--only ui,data` leaves the effects stage a 0.2 s look at the model index (no effect is called `ui` or `data`).

| Stage | Time |
| --- | --- |
| effects (604 effect files, 1,461 `.ktx2` encodes; first run) | 47.0 s |
| ui (3,784 PNGs and the sheets catalog; second run) | 8.7 s |
| data (run again, for the effect and icon names; second run) | 5.8 s |
| **Whole run** | **57.5 s** first (effects 47.0 s, ui 1.2 s without the item icons, data 5.6 s); **18.4 s** second |

The 1,461 textures went at about 31 a second, twice the first run's 15 a second: they are small (the folder is mostly 128 x 128 DXT1), where the model and terrain textures are large. The 3,217 item icons are 32 x 32 and go through in about 7.5 s. A full run takes about a minute longer than before (the data stage already ran).

| Kind | Client input | Output | Count |
| --- | --- | --- | --- |
| effects | `SFX/*.sfx` named by the OT_SFX entries of `mdlDyna.inc` | `effects/*.json` | 604 (the 652 entries name 604 distinct files that exist, and 17 entries a file that is missing) |
| effect textures | `SFX/Texture/*.dds` that those effects name, and each frame of a texture animation | `textures/sfx/*.ktx2` | 1,461 (of the folder's 1,979 files; 3 names are missing, see below) |
| mesh parts | the effects' mesh parts (128 in the whole folder) | kept in the effect files, `model` naming the `models/` key | 118 (all linked to a converted model) |
| UI pictures | every picture of `Icon/` (483), 83 pieces of `Theme/Default`, `SFX/DmgEffect.dds` | `ui/*.png` | 567 |
| item icons | every picture of `Item/` (3,215 `.dds` and 2 `.tga`; the folder also holds `items.zip`, not a picture) | `ui/item/*.png` | 3,217 |
| sheets | `SFX/DmgEffect.inc` (28 frames), `Icon/icon_target.inc` (16 frames) | `data/uiSheets.json` | 1 |
| **Total** | | | **5,850** |

| Kind | Input | Output | Output / input |
| --- | --- | --- | --- |
| effects | 1.08 MiB (1,130,392 B) | 2.64 MiB (2,772,772 B) | 245.3% |
| effect textures | 24.68 MiB (25,874,988 B) | 5.98 MiB (6,265,927 B) | 24.2% |
| ui (pictures and sheets) | 4.12 MiB (4,320,496 B) | 0.96 MiB (1,002,058 B) | 23.2% |
| item icons | 7.47 MiB (7,832,246 B) | 4.10 MiB (4,297,747 B) | 54.9% |
| **Total** | **37.34 MiB (39,158,122 B)** | **13.67 MiB (14,338,504 B)** | **36.6%** |

An effect file is two and a half times its `.sfx`: the `.sfx` stores each number in 4 bytes, the JSON writes it in decimal and names its texture keys. It compresses to 15% (below). The item icons are small 16-bit and DXT pictures; as PNG they come to about half.

Warnings (all expected):

| Count | Kind | Message |
| --- | --- | --- |
| 2 | effects | `test.dds` and `test2.dds` are not in `SFX/Texture`; 118 effects name each (placeholders, `sfx_Item*` and others). Their parts get `texture: null`. |
| 1 | effects | `sfx_sklblddswsilent12.dds` is not in `SFX/Texture` (named by `Sfx_SklBldOnehandmaster01`). |
| 1 | ui | 27 JPEG icons (`Icon_CloakSLogo01.jpg` and the rest) are not converted: no JPEG decoder, and no Piece 4 window draws them. None is an item icon. |

Every non-null texture, frame and model key in the 604 effect files is in `index.json` (none dangles). Of the 7 missing texture names counted in the research notes for the whole folder, these 3 are the ones the model index's effects name; the other 4 (`magician_fire_casting.dds`, `magician_wind_casting.dds`, `cure1.bmp`, `sfx_sklmerweasupport07.dds`) are named only by `.sfx` files the index does not name.

Item icons (`ItemProp::szIcon`) are loaded from `Client/Item` (`CItemBase::SetTexture`, `Item.cpp:114`), not from `Client/Icon`, so they have their own key space, `ui/item/<name>.png`: 8 file names (`itm_gengemblad`, `itm_gengemdogtooth`, `itm_gengemflower`, `itm_gengemnecklace`, `itm_gengempoisonbag`, `skill_couple01` to `03`) are in both folders. Of the 4,998 items with an icon, **4,986 icon keys in `data/itemProps.json` resolve** to a written file. The other 12: five quest items (`Leygall`, `Radoram`, `Lemeat`, `Steam Woodlock`, `Steam Tears`: `Itm_SysSysQue*.dds`) whose picture is not in the client, and seven pet eggs (the "cage" items), whose picture Neuz names at run time by the pet's level (`szIcon` with `_00.`, `_01.` or `_02.` for the dot; the three files exist for all seven). None of the 12 is held up by a skipped `.jpg`. Four of the `Item/` files are `X1R5G5B5` DDS, which the DDS reader did not know; it does now.

Compression, measured as for the first run:

| Kind | Files | Raw total | Raw average | gzip total | gzip average | gzip / raw | brotli total | brotli average | brotli / raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Effect files (`.json`) | 604 | 2.64 MiB | 4.5 KiB | 0.40 MiB | 0.7 KiB | 15.2% | 0.38 MiB | 0.6 KiB | 14.3% |
| UI pictures (`.png`) | 567 | 0.95 MiB | 1.7 KiB | 0.92 MiB | 1.7 KiB | 96.6% | 0.92 MiB | 1.7 KiB | 96.9% |
| Item icons (`.png`) | 3,217 | 4.10 MiB | 1.3 KiB | 4.17 MiB | 1.3 KiB | 101.6% | 4.11 MiB | 1.3 KiB | 100.3% |
| Effect textures (`.ktx2`) | 1,461 | 5.98 MiB | 4.2 KiB | 5.58 MiB | 3.9 KiB | 93.4% | 5.50 MiB | 3.9 KiB | 92.1% |

`index.json` is now 22,369 entries and 1.82 MiB raw.

## Data and UI changes in Piece 4, milestone 1

The rest of milestone 1 changed only the data and ui stages. Each change was regenerated with `npm run convert -- --only data` or `--only ui` on the real client, and each run had 0 failures. No texture, model, world or effect file changed.

| Catalog or picture | What it gained | Why |
| --- | --- | --- |
| `data/movers.json` | `atk1`: a monster's attack item (`dwAtk1`), -1 for none. 613 of the 786 movers have one. | The monster's hit spark (`m_dwVirtItem`) |
| `data/itemProps.json` | `packMax` (`dwPackMax`). 1,543 of the 5,277 items stack. | Counts on the task bar only for stackable items, as Neuz |
| `data/texts.json` | `textId`: each text's number from `defineText.h`, for all 2,949 texts | Server messages name a text by its number (DEFINEDTEXT) |
| `data/jobs.json` | `title`: the job's name from `etc.inc` and `etc.txt.txt` ("Vagrant" and the other 31) | The Character window's Job line |
| `ui/wndtaskmenu.png` | `Theme/Default/WndTaskMenu.tga`, the Start menu's picture (192 x 496) | The Start menu in the game's look |

`index.json` is now 22,370 entries. The data stage still gives its 81 expected warnings (movers whose motions or model were not converted), and the whole output still has 0 failures.

**After pulling a version with these changes,** run `npm run convert -- --only ui,data`. It takes about 20 seconds. Then copy `dist/assets` to the VM again. An older catalog still loads, but the new fields read as their defaults: no monster hit sparks, a count on every item, and an empty Job line.

## Data and UI changes in Piece 4, milestone 2

Milestone 2 (skills) changed only the data and ui stages again, each regenerated on the real client with 0 failures.

| Catalog or picture | What it gained | Why |
| --- | --- | --- |
| `data/skills.json` (new) | Every job skill of `propSkill.txt` with its levels from `propSkillAdd.csv`: 164 skills. The 26 `JTYPE_COMMON` rows are left out, as `CProject::LoadSkill` does. The Vagrant has 7: Clean Hit, Flurry, Over Cut and four event buffs (317-320). Each skill's `icon` is `ui/<name>.png` from `Client/Icon`; all 164 resolve. | The skill window, the task bar and using skills |
| `ui/wndqueitmwarning.png` | `Theme/Default/WndQueItmwarning.tga`, the warning box's picture (`APP_QUEITMWARNING`) | The box that asks before skill points are spent |

`index.json` is now 22,372 entries. The data stage gives 82 warnings: the 81 expected before, plus one for Circle Healing (an Assist skill), whose 20 rows in `propSkillAdd.csv` are labelled 1, 1, 2, 2 ... 10, 10. `GetAddSkillProp` takes the rows by place, so the catalog does too. The whole output still has 0 failures.

**After pulling a version with these changes,** run `npm run convert -- --only ui,data` (about 20 seconds), then copy `dist/assets` to the VM again. Without `skills.json`, entering the world stops with a message that the game files are out of date.

## Compression

Measured over every converted file (not a sample) with Node `zlib`: `gzipSync` at the default level and `brotliCompressSync` at quality 5. This is what a static host that compresses on the fly, or a CDN, would send. Average is per file.

| Kind | Files | Raw total | Raw average | gzip total | gzip average | gzip / raw | brotli total | brotli average | brotli / raw |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| World tiles (`.bin`) | 2,232 | 518.5 MiB | 237.9 KiB | 30.8 MiB | 14.1 KiB | 5.9% | 17.0 MiB | 7.8 KiB | 3.3% |
| World manifests (`.json`) | 35 | 0.20 MiB | 5.9 KiB | 0.05 MiB | 1.4 KiB | 23.2% | 0.04 MiB | 1.2 KiB | 20.4% |
| Model `.glb` | 4,192 | 155.6 MiB | 38.0 KiB | 67.2 MiB | 16.4 KiB | 43.2% | 53.1 MiB | 13.0 KiB | 34.1% |
| Motion `.glb` | 2,928 | 156.6 MiB | 54.8 KiB | 64.8 MiB | 22.7 KiB | 41.4% | 60.3 MiB | 21.1 KiB | 38.5% |
| Skeleton `.glb` | 303 | 1.64 MiB | 5.5 KiB | 0.64 MiB | 2.2 KiB | 38.8% | 0.63 MiB | 2.1 KiB | 38.3% |
| All `.glb` | 7,423 | 313.8 MiB | 43.3 KiB | 132.6 MiB | 18.3 KiB | 42.2% | 114.0 MiB | 15.7 KiB | 36.3% |
| Texture `.ktx2` | 5,674 | 138.6 MiB | 25.0 KiB | 136.6 MiB | 24.7 KiB | 98.5% | 136.4 MiB | 24.6 KiB | 98.4% |

What it means for the viewer:

- Tiles compress very well (gzip 5.9%, brotli 3.3%): a typical tile is about 14 KiB over the wire with gzip and 8 KiB with brotli, so the host must compress `.bin` (or the converter should, later).
- `.ktx2` files do not compress further (98.5%): ETC1S (BasisLZ) and UASTC data is already compressed, so serve them as they are.
- `.glb` files compress to about 42% (gzip) or 36% (brotli). Motions are the biggest `.glb` kind; the viewer should load only the few it plays.
- `index.json` itself is 1.28 MiB raw but 210 KiB with gzip, 176 KiB with brotli: it counts toward the 15 MB first-load budget only in its compressed form, and only if the host compresses it.

The script that measured this is a throwaway kept outside the repository.

## Viewer soak test

The memory target of the viewer (global constraints: after a 10-minute loop walk, memory within 10% of its starting level), measured by the end-to-end test `apps/viewer/e2e/soak.spec.ts` (Task 19). The player runs laps at 12 m/s around a closed 600 m square centred on Madrigal's start (2,400 m a lap), so tiles stream in and out the whole time. Memory is what the overlay reports: `gpuBytes + (jsHeapBytes ?? 0)`. The baseline is the sample after the first lap, the final value the sample after the last lap, each taken standing on the same corner 5 s after arriving, after a `gc()`. Since the final-review fixes the test also requires three.js' own counts (`renderer.info`: geometries and textures on the GPU, shader programs) to be the same at the end of the last lap as at the baseline.

| | |
| --- | --- |
| Date | 2026-10-22 (after the final-review fixes) |
| Command | `npm run test:soak` (from `FlyffWeb/`; project `soak`: headless Chromium, SwiftShader software WebGL, 1280 x 720, `--enable-precise-memory-info --js-flags=--expose-gc`) |
| Machine | the converter's (AMD Ryzen 7 5700U, Windows 11, Node 24.19.0); software WebGL ran the viewer at 2.4 to 3.1 fps |
| Result | **passed**: baseline 272.7 MB, final 272.6 MB, **ratio 1.000** (limit 1.10), 3 laps in 656 s, three.js counts equal (729 geometries, 330 textures, 10 programs at every lap), no errors in the overlay |

| Lap | Time | Memory | GPU estimate | JS heap | Tiles loaded | three.js geometries / textures / programs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (baseline) | 242 s | 272.7 MB | 156.3 MB | 116.4 MB | 25 | 729 / 330 / 10 |
| 2 | 449 s | 272.6 MB | 156.3 MB | 116.3 MB | 25 | 729 / 330 / 10 |
| 3 (final) | 656 s | 272.6 MB | 156.3 MB | 116.3 MB | 25 | 729 / 330 / 10 |

(MB here are binary, 1 MiB.) The GPU estimate is the same to the digit at every lap and the loaded tiles are the same 25, so what the viewer adds up for tiles and textures is given back each time, and three.js' own counts agree. The estimate now includes the canvas's drawing buffer, 1280 x 720 x 8 bytes x 4 samples = 28.1 MB, which is all of its rise from the first run's 128.2 MB. The JS heap fell from 168.4 MB to 116.4 MB, because the viewer now lets go of each texture's transcoded levels and each terrain light map once they are on the GPU (and the tile streamer keeps only a tile's heights). The heap is 43% of the total and the GPU estimate 57%; the estimate is what the viewer itself counts (terrain, character and model geometry, textures, drawing buffer), not what the browser's driver really holds. The walk is time-based (`Route.step(dt)`), so slow software frames do not shorten it: the lap lengths are real metres at 12 m/s.

The first run of the test (Task 19, before these fixes): baseline 296.6 MB (GPU 128.2, heap 168.4), final 297.3 MB, ratio 1.002, 3 laps in 653 s.

Do not edit files under `apps/viewer` while the soak runs on the dev server: Vite reloads the page and the test fails with "Execution context was destroyed".

The test checks that it measures what it says: `gc()` exists (`--expose-gc`), `jsHeapBytes` is not null and not the same value at every lap (without `--enable-precise-memory-info` Chromium reports a stale constant: 16,100,000 bytes here while the heap was about 168 MB, which would have left only the GPU bookkeeping to decide the ratio), every leg of 600 m takes at least 90% of 50 s (the player really walked it), and each lap loads more than the 25 tiles around one spot and different tiles at different corners (the streamer really streamed). Each was seen to fail when broken: no `--expose-gc`, no `--enable-precise-memory-info`, and a `walkRoute` that returns at once.

To try the test out quickly: `SOAK_MINUTES=1 SOAK_SIDE=150 npm run test:soak` (two laps of a 150 m square, about 2 minutes). The real run uses neither.

## Reproducing

```
cd FlyffWeb
npm run test:corpus
npm run convert -- --jobs 8
```

Then read `dist/assets/report.json`: `failures` must be `[]`. See "Converting the client" in `README.md`.

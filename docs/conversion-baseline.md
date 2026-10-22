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

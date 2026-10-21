# FlyffWeb

A browser client for FlyFF. Node 24+ and npm 11+. Run `npm install` once in this folder.

The converter's texture stage also needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.3 or newer (`ktx`). It looks for `ktx` in the `KTX_BIN` environment variable, then on the `PATH`, then in `C:\Program Files\KTX-Software\bin\ktx.exe`.

## Layout

npm workspaces: `packages/*`, `tools/*`, `apps/*`.

| Folder | What |
| --- | --- |
| `packages/formats` | `@flyffweb/formats`: `BinaryReader`, `FormatError` and the readers for FlyFF binary formats. Every reader names the C++ function it copies. |
| `tools/convert` | `@flyffweb/convert`: Node converter from the read-only client folder to hashed web assets in `dist/assets`. CLI, client index, atomic writer, report, the texture stage (to `.ktx2`), the model stage (`.o3d` models, `.chr` skeletons and `.ani` motions to `.glb`) and the world stage (each `World/<name>` folder to a `manifest.json` and one `.bin` tile per `.lnd`) are in. |
| `apps/viewer` | `@flyffweb/viewer`: Vite + Three.js viewer. The shell is in (routes `#/character`, `#/world`, `#/compare`, the asset store and texture cache, the measurement overlay and `window.__viewer`) and the character view (`#/character?gender=male&head=…&motion=…&frame=0&paused=1`: player parts re-bound to one skeleton, one looping motion, a dropdown per slot); the world and compare views come later. End-to-end tests (Playwright) are in `apps/viewer/e2e`. Reads the converter output through `/assets/` and the Basis transcoder through `/basis/`. |

## Client folder

Tests that read real game files need the FlyFF client folder. By default it is `../Client` (next to this folder); set `FLYFF_CLIENT` to use another path. It is read-only: nothing here writes into it. Without it, those tests are skipped with "Client/ not found — set FLYFF_CLIENT".

## Scripts

| Script | What |
| --- | --- |
| `npm test` | Unit tests (`vitest run`). Every `*.test.ts` in all workspaces except `*.corpus.test.ts` and `e2e/`. |
| `npm run test:corpus` | Corpus tests (`vitest run --config vitest.corpus.config.ts`). Read every real client file of a format; slow (10 minute timeout) and needs the client folder. |
| `npm run convert -- [options]` | Runs the converter (`tools/convert`). `--help` lists the options. Defaults: client from `FLYFF_CLIENT` or `../Client`, output in `dist/assets`. |
| `npm run dev:viewer` | Copies the Basis transcoder into `dist/basis` (`npm run copy-basis`) and starts the viewer on http://localhost:5173/, also on the network (`--host`, for phones and tablets). Needs a converted `dist/assets`. |
| `npm run build:viewer` | Builds the viewer into `apps/viewer/dist`. `dist/assets` is not copied: a Vite plugin (`apps/viewer/vite.serveDist.ts`) serves it in place, in the dev server and in preview, compressed. |
| `npm run preview:viewer` | Serves that build on http://localhost:4173/ the same way. |
| `npm run test:e2e` | End-to-end tests in Chromium (software WebGL, 1280x720): project `dev` against the dev server (picture tests, baselines in `apps/viewer/e2e/__screenshots__`), project `prod` against a fresh build in preview (tests tagged @prod, such as the 15 MB first-load budget). Starts the servers it needs. Needs a converted `dist/assets` and, once, `npx playwright install chromium`. `-- character` runs one file; `-- --update-snapshots` rewrites the baselines. |
| `npm run test:soak` | The long tests tagged @soak (project `soak`, 15 minutes each) against the dev server. |

## Converting the client

Converts the whole client folder into web assets in `dist/assets` (git-ignored, and the folder the viewer reads):

```
npm run convert
```

It runs three stages in order: textures (to `.ktx2`), models (`.chr` skeletons, `.ani` motions and `.o3d` models to `.glb`), then worlds (a `manifest.json` per world and one `.bin` tile per `.lnd`). The client folder is only read. On the real client this takes about 7 minutes and writes about 970 MiB (15,364 files, plus `index.json` and `report.json`); [docs/conversion-baseline.md](docs/conversion-baseline.md) has the numbers of the first full run. The texture stage needs `ktx` (see the top of this file); without it the texture stage records one failure ("KTX-Software" in `report.json`), converts no texture, and the run exits 1.

Useful options (`npm run convert -- --help` lists all):

```
npm run convert -- --jobs 8                    # files converted in parallel (default: CPU count - 1)
npm run convert -- --only WdMadrigal           # one world; also matches model and texture base names, with * as a wildcard
npm run convert -- --client D:\FlyFF\Client    # another client folder (or set FLYFF_CLIENT)
npm run convert -- --out D:\flyff-assets       # another output folder (never inside the client folder)
```

Every output file is named `<name>.<first 10 hex of sha256>.<ext>` and `index.json` maps each logical key (for example `models/part_mvag01upper.glb`) to its hashed path. A partial run (`--only`) merges into the `index.json` already in the output folder, so it does not wipe the rest. Nothing deletes files an earlier run wrote, so to start clean remove `dist/assets` first.

The exit code is 0 when done, 1 when some files failed (unless `--allow-failures`), 2 for a bad command line or an unusable folder.

### Reading `report.json`

`dist/assets/report.json` is written at the end of every run:

| Field | What |
| --- | --- |
| `totals`, `kinds` | `ok`, `warn`, `failed`, `bytesIn` and `bytesOut`, in total and per kind (`textures`, `skeletons`, `motions`, `models`, `worlds`; `stage` and `index` only appear when something went wrong there). |
| `warnings` | `{ kind, source, message }` for things that are expected and do not stop a file converting: models Neuz itself rejects, objects with an SFX model, a texture that does not exist. |
| `failures` | A file that could not be converted: `{ kind, source, message }`, and for a damaged file also `file`, `offset`, `unit`, `reader` and `cppRef` (the C++ function the reader copies). A bug in the converter itself has a `stack` instead. |

The console summary prints only counts and ends with `Total: N ok, N warn, N failed`; it does not print failure messages, so always check `failures`:

```
node -p "JSON.parse(require('fs').readFileSync('dist/assets/report.json','utf8')).failures.length"
```

A good run prints `0`. Read the warnings to see what was left out and why; the baseline lists the 166 the real client produces.

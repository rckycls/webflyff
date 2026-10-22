# FlyffWeb

A browser client for FlyFF. Node 24+ and npm 11+. Run `npm install` once in this folder.

The converter's texture stage also needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.3 or newer (`ktx`). It looks for `ktx` in the `KTX_BIN` environment variable, then on the `PATH`, then in `C:\Program Files\KTX-Software\bin\ktx.exe`.

## Layout

npm workspaces: `packages/*`, `tools/*`, `apps/*`.

| Folder | What |
| --- | --- |
| `packages/formats` | `@flyffweb/formats`: `BinaryReader`, `FormatError` and the readers for FlyFF binary formats. Every reader names the C++ function it copies. |
| `tools/convert` | `@flyffweb/convert`: Node converter from the read-only client folder to hashed web assets in `dist/assets`. CLI, client index, atomic writer, report, the texture stage (to `.ktx2`), the model stage (`.o3d` models, `.chr` skeletons and `.ani` motions to `.glb`) and the world stage (each `World/<name>` folder to a `manifest.json` and one `.bin` tile per `.lnd`) are in. |
| `apps/viewer` | `@flyffweb/viewer`: Vite + Three.js viewer. The shell is in (routes `#/character`, `#/world`, `#/compare`, the asset store and texture cache, the measurement overlay and `window.__viewer`), the character view (`#/character?gender=male&head=…&motion=…&frame=0&paused=1`: player parts re-bound to one skeleton, one looping motion, a dropdown per slot) and the world view (`#/world?world=wdmadrigal&radius=1&paused=1`: terrain tiles streamed around the player with their objects, instanced per tile, a character walking with WASD / the arrow keys or the on-screen joystick on touch screens, Shift or a full push to run, a chase camera, the client's noon light, sky and fog from the world; `&x=6968&z=3328&yaw=180` starts it at the client coordinates x, z facing yaw degrees, 0 north (higher z), 90 east (higher x)) and the compare page (`#/compare`: the viewer next to your Windows-client screenshots, spots in `src/compare/spots.json`, pictures in `compare/refs/`). [docs/device-testing.md](docs/device-testing.md) tells how to take the screenshots and run the device checklist. End-to-end tests (Playwright) are in `apps/viewer/e2e`. Reads the converter output through `/assets/`; the Basis transcoder that turns `.ktx2` into GPU textures is the one three.js ships, which Vite serves and bundles. |

## Client folder

Tests that read real game files need the FlyFF client folder. By default it is `../Client` (next to this folder); set `FLYFF_CLIENT` to use another path. It is read-only: nothing here writes into it. Without it, those tests are skipped with "Client/ not found — set FLYFF_CLIENT".

## Scripts

| Script | What |
| --- | --- |
| `npm test` | Unit tests (`vitest run`). Every `*.test.ts` in all workspaces except `*.corpus.test.ts` and `e2e/`. Quick: the tests on real client data (whole worlds, real models) are corpus tests. |
| `npm run test:corpus` | Corpus tests (`vitest run --config vitest.corpus.config.ts`). Read every real client file of a format, and run the converter on real client data (all of WdMadrigal, real models); slow (10 minute timeout) and needs the client folder. |
| `npm run typecheck` | `tsc --noEmit` over the four TypeScript projects: `packages/formats`, `tools/convert`, `apps/viewer` (the browser code) and `apps/viewer/tsconfig.node.json` (the viewer's tests and configs). |
| `npm run convert -- [options]` | Runs the converter (`tools/convert`). `--help` lists the options. Defaults: client from `FLYFF_CLIENT` or `../Client`, output in `dist/assets`. |
| `npm run dev:viewer` | Starts the viewer on http://localhost:5173/, also on the network (`--host`, for phones and tablets: a trusted home network only, and stop it after testing, see [docs/device-testing.md](docs/device-testing.md)). Needs a converted `dist/assets`. |
| `npm run build:viewer` | Builds the viewer into `apps/viewer/dist`, for current desktop browsers and Safari 16.0 or newer (iOS / iPadOS 16). `dist/assets` is not copied: a Vite plugin (`apps/viewer/vite.serveDist.ts`) serves it in place, in the dev server and in preview, compressed. |
| `npm run preview:viewer` | Serves that build on http://localhost:4173/ the same way. |
| `npm run test:e2e` | End-to-end tests in Chromium (software WebGL, 1280x720): project `dev` against the dev server (picture tests, baselines in `apps/viewer/e2e/__screenshots__`), project `prod` against a fresh build in preview (tests tagged @prod, such as the 15 MB first-load budget). Starts the servers it needs. Needs a converted `dist/assets` and, once, `npx playwright install chromium`. `-- character` runs one file; `-- --update-snapshots` rewrites the baselines. |
| `npm run test:soak` | The long tests tagged @soak (project `soak`, 20 minutes each) against the dev server: ten minutes of laps around a 600 m square, memory at the end within 110% of the first lap (about 12 minutes; numbers in [docs/conversion-baseline.md](docs/conversion-baseline.md)). |

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
npm run convert -- --client "D:/FlyFF/Client"  # another client folder (or set FLYFF_CLIENT)
npm run convert -- --out "D:/flyff-assets"     # another output folder (never inside the client folder)
```

Write paths with forward slashes (or in quotes): Git Bash drops the backslashes of an unquoted `D:\FlyFF\Client`.

Every output file is named `<name>.<first 10 hex of sha256>.<ext>` and `index.json` maps each logical key (for example `models/part_mvag01upper.glb`) to its hashed path. A partial run (`--only`) merges into the `index.json` already in the output folder, so it does not wipe the rest. Nothing deletes files an earlier run wrote, so to start clean remove `dist/assets` first.

The exit code is 0 when done, 1 when some files failed (unless `--allow-failures`), 2 for a bad command line or an unusable folder.

### Reading `report.json`

`dist/assets/report.json` is written at the end of every run:

| Field | What |
| --- | --- |
| `totals`, `kinds` | `ok`, `warn`, `failed`, `bytesIn` and `bytesOut`, in total and per kind (`textures`, `skeletons`, `motions`, `models`, `worlds`; `stage` and `index` only appear when something went wrong there). |
| `warnings` | `{ kind, source, message }` for things that are expected and are not failures: files skipped on purpose (models Neuz itself rejects, motions no skeleton fits) and things left out of a file that is still converted (objects with an SFX model, a texture that does not exist). |
| `failures` | A file that could not be converted: `{ kind, source, message }`, and for a damaged file also `file`, `offset`, `unit`, `reader` and `cppRef` (the C++ function the reader copies). A bug in the converter itself has a `stack` instead. |

The console summary prints only counts and ends with `Total: N ok, N warn, N failed`; it does not print failure messages, so always check `failures`:

```
node -p "JSON.parse(require('fs').readFileSync('dist/assets/report.json','utf8')).failures.length"
```

A good run prints `0`. Read the warnings to see what was left out and why; the baseline lists the 166 the real client produces.

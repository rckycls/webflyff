# FlyffWeb

A browser client for FlyFF. Node 24+ and npm 11+. Run `npm install` once in this folder.

What is built so far: a converter that turns the game's files into web files, a viewer for them (Piece 1), and a gateway with a login lobby (Piece 2), built so that a browser logs in, picks a server and channel, and lists, creates and deletes characters on your real game servers; the live test (`npm run test:live`) checks it against your servers. Guides for you, the owner: [docs/device-testing.md](docs/device-testing.md) (checklists for your phones and tablets), [docs/hosting.md](docs/hosting.md) (putting the lobby on the internet) and [server-patches/README.md](server-patches/README.md) (the changes the C++ servers need).

The converter's texture stage also needs [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) 4.3 or newer (`ktx`). It looks for `ktx` in the `KTX_BIN` environment variable, then on the `PATH`, then in `C:\Program Files\KTX-Software\bin\ktx.exe`.

## Layout

npm workspaces: `packages/*`, `tools/*`, `apps/*`. `server-patches/` is not a workspace.

| Folder | What |
| --- | --- |
| `packages/formats` | `@flyffweb/formats`: `BinaryReader`, `FormatError` and the readers for FlyFF binary formats. Every reader names the C++ function it copies. |
| `packages/protocol` | `@flyffweb/protocol`: the FlyFF network protocol in TypeScript, for the browser and Node, with no Node-only code. `ar/` is a reader and writer with the layout of the C++ `CAr` class (little-endian numbers, strings as a length plus bytes); `framing/` has CRC32, the frame writer and reader and the protocol-ID packet; `crypto/` has MD5 and AES-128-CBC in plain TypeScript (the password hash and the encrypted password block of CERTIFY; WebCrypto is not available on plain-HTTP pages such as the Wi-Fi test setup); `messages/` has one module per server, `certifier.ts` and `login.ts`, with that server's packets; `text.ts` decodes server text as windows-1252. Every module names the C++ function it copies. |
| `packages/testkit` | `@flyffweb/testkit`: `FakeFlyffServer`, a pretend FlyFF server for tests. It announces a protocol ID, checks the frames it receives and answers. The gateway tests run against it. |
| `tools/capture` | `@flyffweb/capture`: records one Neuz login session, packet by packet, into a test fixture (`npm run capture`). Steps in [tools/capture/README.md](tools/capture/README.md). |
| `tools/convert` | `@flyffweb/convert`: Node converter from the read-only client folder to hashed web assets in `dist/assets`. CLI, client index, atomic writer, report, the texture stage (to `.ktx2`), the model stage (`.o3d` models, `.chr` skeletons and `.ani` motions to `.glb`) and the world stage (each `World/<name>` folder to a `manifest.json` and one `.bin` tile per `.lnd`) are in. |
| `apps/gateway` | `@flyffweb/gateway`: the WebSocket gateway between the browser and the game servers. A browser opens `/connect/<address>:<port>`; the gateway checks the page's origin and the destination against its route table, opens the TCP connection to the server, adds and strips the frame headers, and passes the player's real address to the (patched) certifier. Settings: `apps/gateway/gateway.config.json` (see "Local settings files"). |
| `apps/client` | `@flyffweb/client`: the start of the real game client, a Vite page. Piece 2 adds the lobby: login, server and channel, character list, create and delete, as plain HTML and CSS that works on a phone. Its end-to-end tests (Playwright) are in `apps/client/e2e`; the live test against your real servers is `apps/client/test/lobby.live.test.ts`. |
| `apps/viewer` | `@flyffweb/viewer`: Vite + Three.js viewer. The shell is in (routes `#/character`, `#/world`, `#/compare`, the asset store and texture cache, the measurement overlay and `window.__viewer`), the character view (`#/character?gender=male&head=…&motion=…&frame=0&paused=1`: player parts re-bound to one skeleton, one looping motion, a dropdown per slot) and the world view (`#/world?world=wdmadrigal&radius=1&paused=1`: terrain tiles streamed around the player with their objects, instanced per tile, a character walking with WASD / the arrow keys or the on-screen joystick on touch screens, Shift or a full push to run, a chase camera, the client's noon light, sky and fog from the world; `&x=6968&z=3328&yaw=180` starts it at the client coordinates x, z facing yaw degrees, 0 north (higher z), 90 east (higher x)) and the compare page (`#/compare`: the viewer next to your Windows-client screenshots, spots in `src/compare/spots.json`, pictures in `compare/refs/`). [docs/device-testing.md](docs/device-testing.md) tells how to take the screenshots and run the device checklist. End-to-end tests (Playwright) are in `apps/viewer/e2e`. Reads the converter output through `/assets/`; the Basis transcoder that turns `.ktx2` into GPU textures is the one three.js ships, which Vite serves and bundles. |
| `server-patches` | Patch files for the C++ servers, whose source is not in git: `certifier-client-addr.patch` makes the certifier see each browser player's real address instead of the gateway's, `flood-limiter-gateway.patch` makes the certifier's and login server's connection-flood limiter skip the gateway, and `certifier-lockout.patch` keeps the wrong-password count per address and account. `tests/` holds a small C++ test program for the last two. How to apply, build and put them in service: [server-patches/README.md](server-patches/README.md). |

## Client folder

Tests that read real game files need the FlyFF client folder. By default it is `../Client` (next to this folder); set `FLYFF_CLIENT` to use another path. It is read-only: nothing here writes into it. Without it, those tests are skipped with "Client/ not found — set FLYFF_CLIENT".

## Scripts

| Script | What |
| --- | --- |
| `npm test` | Unit tests (`vitest run`). Every `*.test.ts` in all workspaces except `*.corpus.test.ts`, `*.live.test.ts` and `e2e/`. Quick: the tests on real client data (whole worlds, real models) are corpus tests, and the one that needs your running game servers is the live test. |
| `npm run test:corpus` | Corpus tests (`vitest run --config vitest.corpus.config.ts`). Read every real client file of a format, and run the converter on real client data (all of WdMadrigal, real models); slow (10 minute timeout) and needs the client folder. |
| `npm run typecheck` | `tsc --noEmit` over every TypeScript project: `packages/formats`, `packages/protocol` (and `packages/protocol/tsconfig.test.json` for its tests), `packages/testkit`, `tools/convert`, `tools/capture`, `apps/gateway`, `apps/client` (the browser code) and `apps/client/tsconfig.node.json` (its tests and configs), `apps/viewer` (the browser code) and `apps/viewer/tsconfig.node.json` (the viewer's tests and configs). |
| `npm run convert -- [options]` | Runs the converter (`tools/convert`). `--help` lists the options. Defaults: client from `FLYFF_CLIENT` or `../Client`, output in `dist/assets`. |
| `npm run dev:viewer` | Starts the viewer on http://localhost:5173/, also on the network (`--host`, for phones and tablets: a trusted home network only, and stop it after testing, see [docs/device-testing.md](docs/device-testing.md)). Needs a converted `dist/assets`. |
| `npm run build:viewer` | Builds the viewer into `apps/viewer/dist`, for current desktop browsers and Safari 16.0 or newer (iOS / iPadOS 16). `dist/assets` is not copied: a Vite plugin (`apps/viewer/vite.serveDist.ts`) serves it in place, in the dev server and in preview, compressed. |
| `npm run preview:viewer` | Serves that build on http://localhost:4173/ the same way. |
| `npm run test:e2e` | End-to-end tests in Chromium (software WebGL, 1280x720): project `dev` against the dev server (picture tests, baselines in `apps/viewer/e2e/__screenshots__`), project `prod` against a fresh build in preview (tests tagged @prod, such as the 15 MB first-load budget). Starts the servers it needs. Needs a converted `dist/assets` and, once, `npx playwright install chromium`. `-- character` runs one file; `-- --update-snapshots` rewrites the baselines. |
| `npm run test:soak` | The long tests tagged @soak (project `soak`, 20 minutes each) against the dev server: ten minutes of laps around a 600 m square, memory at the end within 110% of the first lap (about 12 minutes; numbers in [docs/conversion-baseline.md](docs/conversion-baseline.md)). |
| `npm run gateway` | Starts the gateway (`tsx apps/gateway/src/main.ts --config apps/gateway/gateway.config.json`). Needs `apps/gateway/gateway.config.json` (see "Local settings files"). Prints `gateway listening on ws://<host>:<port>`, then one line when a connection opens and one when it closes (time, the player's address, route, close code, bytes; never packet contents), and a `refused <address> <reason>` line, at most once a minute per address and reason, when it turns a connection away ([docs/hosting.md](docs/hosting.md) lists the reasons). `Ctrl` + `C` stops it. |
| `npm run capture -- [options]` | Records one Neuz login session through `tools/capture`, into `packages/protocol/test/fixtures/neuz-login.json` by default. Use a throwaway account: its password is saved in the file. `--help` lists the options; [tools/capture/README.md](tools/capture/README.md) has the steps. |
| `npm run dev:client` | Starts the lobby on http://localhost:5174/, also on the network (`--host`, for phones and tablets: a trusted home network only, and stop it after testing). The page connects to the gateway at `ws://<the host in the address bar>:8090`, so the gateway must be running and the page's address must be in its `allowedOrigins`. |
| `npm run build:client` | Builds the lobby into `apps/client/dist`, for current desktop browsers and Safari 16.0 or newer. The page is `index.html`; its script and style are in `apps/client/dist/client/`, so on the web they are at `/client/...` (`/assets/` is for the converted game files). For a hosted site, set `VITE_GATEWAY_URL` and `VITE_CERTIFIER_ADDRESS` for this command; [docs/hosting.md](docs/hosting.md) shows how. |
| `npm run test:e2e:client` | End-to-end tests of the lobby (Playwright) in Chromium and in WebKit as an iPhone 13, against pretend servers. Starts the client's dev server itself. Needs `npx playwright install chromium webkit` once. |
| `npm run test:live` | The live test: the real gateway and the real login flow against your running game servers and a test account. It logs in, lists the characters, creates one and deletes it, then changes the channel and lists them again. Not part of `npm test`. Needs `apps/client/test/live.config.json` (see "Local settings files"). Wait at least 15 seconds between runs and never loop it: the certifier blocks the test account after a wrong password, and until the new certifier and login server are in place with their `Gateway` lines, the servers' connection limiter never forgets ([docs/device-testing.md](docs/device-testing.md) explains). |

## Running the lobby on your PC

With the game servers running and `apps/gateway/gateway.config.json` in place, start these in two windows, in this folder:

```
npm run gateway
npm run dev:client
```

Open http://localhost:5174/ and log in with a test account. For phones and tablets over Wi-Fi, follow the Piece 2 checklist in [docs/device-testing.md](docs/device-testing.md). To put it on the internet, follow [docs/hosting.md](docs/hosting.md).

## Local settings files

Two files stay on your machine: git ignores them. Each is made by copying a committed example, and each is found by its fixed name.

| Your file (not in git) | Copy it from | What it holds |
| --- | --- | --- |
| `apps/gateway/gateway.config.json` | `apps/gateway/gateway.config.example.json` | What `npm run gateway` needs: where the gateway listens (`listen`), which page addresses may connect (`allowedOrigins`, the exact address the browser shows, for example `http://192.168.1.20:5174`), the proxies it trusts (`trustedProxies`), whether it passes the player's address to the certifier (`sendClientAddr`), and the table of servers it may reach (`routes`, keyed by the address the servers advertise). Optional `limits` override the defaults. |
| `apps/client/test/live.config.json` | `apps/client/test/live.config.example.json` | What `npm run test:live` needs: a throwaway test account, its Bank PIN, and a gateway of its own for the test. It holds a password: never commit it. The `_comment` at the top of the example explains each setting. |

In PowerShell, from this folder:

```
Copy-Item apps\gateway\gateway.config.example.json apps\gateway\gateway.config.json
Copy-Item apps\client\test\live.config.example.json apps\client\test\live.config.json
```

Then open each copy in a text editor and change it as the guides say. The gateway checks its file when it starts and tells you what is wrong with it.

## Converting the client

Converts the whole client folder into web assets in `dist/assets` (git-ignored, and the folder the viewer reads):

```
npm run convert
```

It runs four stages in order: textures (to `.ktx2`), models (`.chr` skeletons, `.ani` motions and `.o3d` models to `.glb`), worlds (a `manifest.json` per world and one `.bin` tile per `.lnd`), then data (the JSON catalogs `data/movers.json`, `items.json`, `npcs.json`, `nameColors.json`, `honorTitles.json` and `worlds.json` (world id to world folder, from `World.inc`), built from the game scripts in the resource packs and naming the models, skeletons and motions the earlier stages converted). The client folder is only read. On the real client this takes about 7 minutes and writes about 970 MiB (15,364 files, plus `index.json` and `report.json`); [docs/conversion-baseline.md](docs/conversion-baseline.md) has the numbers of the first full run. The texture stage needs `ktx` (see the top of this file); without it the texture stage records one failure ("KTX-Software" in `report.json`), converts no texture, and the run exits 1.

Useful options (`npm run convert -- --help` lists all):

```
npm run convert -- --jobs 8                    # files converted in parallel (default: CPU count - 1)
npm run convert -- --only WdMadrigal           # one world; also matches model and texture base names, with * as a wildcard
npm run convert -- --only data                 # just the game-data catalogs (the data stage matches the name "data")
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

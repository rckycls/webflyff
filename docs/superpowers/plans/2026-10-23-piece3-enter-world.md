# Piece 3: Enter the World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the lobby's character list a player enters the world in the browser, sees the map, other players, monsters and NPCs with name tags, and walks with the keys or the joystick while a second browser player sees it (milestone 1). Then buildings, fences and "no walking" ground block movement, bridges and stairs are walkable, and tapping or clicking the ground walks there (milestone 2).

**Architecture:**
- **Shared 3D code:** the viewer's 3D code moves to a new `packages/scene`, with a `WorldStage` (map, sky, light, objects) that both the viewer and the game client use.
- **Protocol:** `packages/protocol` gets the world-entry packets and a bundle reader that uses a table of contents the world server appends to every JOIN and SNAPSHOT packet.
- **Server patches:**
  - `world-snapshot-index.patch` adds that table;
  - `cache-client-addr.patch` makes the cache server take the player's real address from the gateway.
- **Game client:** `apps/client` gets a `WorldSession` (connections), a `WorldState` (the movers in view, moved by rules copied from Neuz's `CActionMover`) and a `WorldScreen` (drawing, name tags, input).
- **Converter:** writes game-data catalogs (movers, items, NPCs, name colours). In milestone 2 it also writes collision shapes.

**Tech Stack:** TypeScript (strict), Three.js r186, Vite 8, Vitest 5, Playwright 1.64, Node 24, `ws` 8; C++ (VS 2022 v143, Win32, MSBuild, `cl.exe`).

**Spec:** `docs/superpowers/specs/2026-10-23-piece3-enter-world-design.md`. Read it first; this plan argues from it. Section numbers below (§) are the spec's.

**Where work happens:**
- `$WEB`: the FlyffWeb worktree on branch `piece3-world` (on this PC `C:/Users/silec/Desktop/FlyFF/Bakbak/FlyffWeb-worktrees/piece3-world`). Every commit goes here.
- `$SERVER`: the server folder (`C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15`), which holds `Source/`, `Output/`, `Program/` and `Client/`. `Source/` isn't tracked by git.
- `$SNAP`: a scratch folder outside both repositories (the session's scratchpad), for snapshots of original C++ files, edit scripts and build output not meant for `Output/`.

## Global Constraints

- **C++ files in `$SERVER/Source` are CP949 with CRLF.**
  - Edit them only with the byte-preserving Node script of the public-launch-limits plan (`docs/superpowers/plans/2026-10-22-public-launch-limits.md`, Task 1 Step 2): read and write as `latin1`; replace exact ASCII anchors that occur exactly once, failing otherwise; insert ASCII-only text with `\r\n` and tab indents.
  - Never re-save them as UTF-8, and never use an editor tool on them.
- **Never write to `$SERVER/Program/`.** Never commit in `$SERVER` (the bakbak-flyff repository). Never switch branches in `$SERVER/FlyffWeb`, and never write into `$SERVER/FlyffWeb/dist`.
- **Commits:** only in `$WEB`, staging explicit paths. Messages are `type(scope): summary`, scopes `scene`, `viewer`, `protocol`, `testkit`, `formats`, `convert`, `client`, `gateway`, `servers`, `docs`. Every message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Every reader, writer and copied rule names the C++ function it copies** (file and line) in a comment, as the existing modules do.
- **Build flags:** only the top of each `VersionCommon.h` and its `__MAINSERVER` section count. `__IAOBJ0622` and `__BS_ADJUST_COLLISION` are **off** (internal-server only); skip their branches.
- **Coordinates:**
  - The movement rules (`apps/client/src/world/sim/`) work in D3D coordinates and FlyFF degrees, exactly as the C++ does.
  - Only drawing converts: web position = `toWebPosition(d3d)` (`[x, y, -z]`), and a model's `rotation.y = angle × π / 180`.
  - Why: the viewer sets `rotation.y = π − heading`, and heading = `π − angle × π / 180`, because D3D's (sin θ, −cos θ) is web (sin θ, +cos θ).
- **Browser → cache bodies** start with `DPID_UNKNOWN` (`BEFORESENDSOLE`), like the login packets. Server → browser bodies start with their type.
- **The client folder:** in `$WEB`, `../Client` doesn't exist. Set `FLYFF_CLIENT="C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client"` for corpus tests and the converter.

**Protocol values (copy exactly):**

| Value | Exact |
|---|---|
| Packet types | `JOIN` 0x0000ff00, `PRE_JOIN` 0x0000ff05, `REPLACE` 0x00ff0f00, `SNAPSHOT` 0xffffff00, `PLAYERMOVED` 0xffffff01, `PLAYERBEHAVIOR` 0xffffff02 (`KEEP_ALIVE` 0x18, `ERROR` 0xfe and `GATEWAY_CLIENT_ADDR` 0xe0 exist already) |
| Message types (u16) | `SETPOSANGLE` 0x000e, `SETPOS` 0x0010, `MOTION` 0x0098, `DESTPOS` 0x00c1, `MOVERSETDESTOBJ` 0x00c2, `DESTANGLE` 0x00c3, `MOVERMOVED` 0x00ca, `MOVERBEHAVIOR` 0x00cb, `MOVERANGLE` 0x00ce, `ADD_OBJ` 0x00f0, `DEL_OBJ` 0x00f1, `REPLACE` 0x00f2, `WORLD_READINFO` 0x9910 |
| Bundle header | type u32, player object ID u32, count i16: 10 bytes; then `count` messages of object ID u32, type u16, fields |
| Table of contents | after the last message: `starts` u32 × count (from byte 10 of the body), `count` u16, marker u32 `0x31434F54` |
| Valid table | marker last; trailer count = header count; `starts[0]` = 0; each start ≥ previous + 6; last start ≤ trailer start − 6 |
| PRE_JOIN | `DPID_UNKNOWN`, type, account (string), player ID (u32), name (string), secret number (i32, always 0) |
| JOIN | `DPID_UNKNOWN`, type, world ID, player ID, auth key, party ID, guild ID, war ID, channel ID (u32 each), slot (u8), name, account, password hash (strings), then the slot's messenger as `CRTMessenger::Serialize` stores it |
| Client DESTPOS | `DPID_UNKNOWN`, `SNAPSHOT`, count u8 = 1, `DESTPOS` u16, position vec3, forward u8 (no object ID: `CDPSrvr::OnSnapshot`) |

**Timing and movement values (copy exactly):**

| Value | Exact |
|---|---|
| Pause after the cache connection opens | 1000 ms |
| PRE_JOIN answer | 15000 ms |
| JOIN answer | 25000 ms |
| Login-server PING | every 10000 ms |
| Rules step | 60 per second (`FRAME_PER_SEC`); at most 60 steps per drawn frame |
| Prediction | 22 steps (`MAX_CORR_SIZE_45`, client) |
| Late move | `delay = floor(offsetMs / 16.6667) − 35`; `delay ≥ 22` sets the mover at once |
| Clock | `start = serverTick + BigInt(rttMs) × 5000n`; `tick(now) = start + BigInt(now − base) × 10000n`; `offsetMs(t)` = the low 32 bits of `tick(now) − t`, as a signed int, divided by 10000 (`tickcount.h`) |
| Ground moves | `delta = (sin θ, 0, −cos θ) × s`, θ = angle in radians. `FMOVE`: s = speed, or speed / 4 with `OBJSTAF_WALK`. `BMOVE`: s = −speed / 5. |
| Turning | `LTURN` +4° per step, `RTURN` −4° per step |
| Name tags | 40 m; 100 m for players and peaceful NPCs; fade over the last 10 m; colours `COLOR_*` (`Source/_Common/Mover.h:34-38`) and `data/nameColors.json` |

**Texts (copy exactly):**

| Where | Text |
|---|---|
| Loading screen | `Entering the world…` |
| No answer | `The server did not answer in time.` |
| Connection lost | `The connection to the game was lost.` |
| Cache connection closed while JOIN is awaited | `The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again.` |
| REPLACE to another world | `Moving to another map isn't supported yet.` |
| Buttons | `Enter` (each character), `Leave` (world screen) |

**Tools on this PC:**
- MSBuild: `/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe`
- x86 compiler environment: `C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars32.bat`
- `ktx` is on the PATH.

**Patch order:** `certifier-client-addr.patch`, `flood-limiter-gateway.patch`, `certifier-lockout.patch`, `world-snapshot-index.patch`, `cache-client-addr.patch`.

## Review Focus

1. **Bundles that arrive while the world is still loading,** including a DEL_OBJ for a mover whose model is still downloading: the model that resolves later is disposed, not added, and nothing leaks. Test in Task 18 (`MoverViews`).
2. **ADD_OBJ for an object ID that's already in view** (the server re-adds movers that come back into range): it replaces the old one, never duplicates it. Movement messages for an unknown object ID are ignored. Tests in Task 15.
3. **A phone tab that goes to the background and comes back:** drawing stops, but KEEP_ALIVE answers come from the connection, not the frame loop. On return the rules run at most 60 steps, not thousands. Tests in Tasks 14 and 16.
4. **Leave, Enter twice, or a connection drop during loading** (before JOIN, before the world has drawn): every timer and connection stops, a later answer is ignored, and the lobby can start again. Tests in Task 16.
5. **A mover whose model, skeleton or motion isn't in the converted files** (a custom monster the client lacks): a placeholder figure with its name tag, and no endless retry. Test in Task 18.

---

## File Structure

```
$WEB/
  packages/scene/                       new: the viewer's reusable 3D code (Task 1), WorldStage and boot (Task 2)
    src/assets/ character/ world/ input/ overlay/    moved from apps/viewer/src
    src/boot.ts                         createRenderer, loadSceneServices
    src/world/WorldStage.ts             map, sky, fog, light, tiles, objects, camera
    src/world/collision.ts              milestone 2: collision shapes per tile (Task 23)
    vite/serveDist.ts                   moved from apps/viewer/vite.serveDist.ts
  packages/protocol/src/
    constants.ts                        new packet and message types, BUNDLE_MARKER
    ar/ArReader.ts                      position(), skipRest()
    messages/login.ts                   PRE_JOIN
    messages/world.ts                   JOIN, keep-alive, moves, DESTPOS, decodeWorldPacket
    bundle.ts                           readBundle
    world/types.ts movement.ts place.ts addObj.ts readers.ts   message readers
  packages/testkit/src/world.ts         encodeBundle and server-side message writers
  packages/formats/src/
    inc/modelIndex.ts                   keeps part and motions
    inc/propMover.ts propItem.ts character.ts strings.ts pkSetting.ts
    web/gameData.ts                     catalog types
    web/collisionBin.ts                 milestone 2
  tools/convert/src/data/gameDataStage.ts
  tools/convert/src/models/collisionFiles.ts      milestone 2
  apps/gateway/src/relay.ts             address packet on cache routes
  apps/client/src/
    net/serverClock.ts
    lobby/LoginFlow.ts                  keeps the cache address, clock and channel; handOver()
    lobby/views/characterView.ts        Enter button
    world/WorldSession.ts               the connections while entering and playing
    world/gameData.ts                   loads the catalogs
    world/sim/                          ActionMover, mover rules, stepper (milestone 2: collision)
    world/WorldState.ts                 the movers in view
    world/render/                       looks, MoverViews, name tags
    world/WorldScreen.ts                the world screen
    world/controls.ts                   keys and joystick to Neuz states (milestone 2: tap to walk)
    testHooks.ts                        window.__client
  apps/client/e2e/world.spec.ts
  apps/client/test/world.live.test.ts
  server-patches/world-snapshot-index.patch, cache-client-addr.patch, tests/
$SERVER/Source/                         (not in git; CP949, CRLF)
  WORLDSERVER/Snapshot.h, Snapshot.cpp, User.cpp
  CACHESERVER/Player.h, DPCacheSrvr.h, DPCacheSrvr.cpp, CacheServer.cpp
```

---

# Milestone 1: in the world

### Task 1: Move the viewer's 3D code into `packages/scene`

**Files:**
- Create: `packages/scene/package.json` (`@flyffweb/scene`, `main`/`types` `src/index.ts`; dependencies `@flyffweb/formats`, `three` `^0.186.1`; devDependencies `@types/three`, `compression`, `@types/compression`, `sirv`), `packages/scene/tsconfig.json` (DOM libs, `include: ["src"]`), `packages/scene/tsconfig.node.json` (node types, `include: ["vite", "test"]`), `packages/scene/src/index.ts`
- Move with `git mv` (contents unchanged except import paths):
  - from `apps/viewer/src` to `packages/scene/src`: `assets/*`, `character/assemble.ts`, `character/parts.ts`, `world/{TerrainTile,terrainGeometry,heightSampler,lighting,objects,tileStreamer,player}.ts`, `input/*`, `overlay/*`;
  - `apps/viewer/vite.serveDist.ts` to `packages/scene/vite/serveDist.ts`;
  - from `apps/viewer/test` to `packages/scene/test`: `assets`, `assemble`, `parts`, `device`, `errorHandlers`, `gpuMemory`, `input`, `objects`, `overlay`, `player`, `streamer`, `terrain` and `serveDist` (`.test.ts` each).
- Modify: every importer in `apps/viewer/src` and `apps/viewer/test`, `apps/viewer/package.json` (add `@flyffweb/scene`), `apps/viewer/vite.config.ts` (import `serveDist` from `@flyffweb/scene/vite/serveDist.ts`), root `package.json` `typecheck` (add `packages/scene` and `packages/scene/tsconfig.node.json`)

**Interfaces:**
- Produces: `@flyffweb/scene` exporting every name the moved files export today (`AssetStore`, `createLoaders`, `loadGltf`, `loadKtx2`, `TextureCache`, `applyTextures`, `assembleCharacter`, `loopMotion`, the `parts.ts` names, `TerrainLighting`, `TileStreamer`, `ObjectPool`, `noonLight`, `d3dColor`, `chaseCamera`, `CHASE_PITCH`, `forwardOf`, `headingOf`, `KeyboardInput`, `Joystick`, `combineIntents`, `Overlay`, the error-handler and GPU-memory functions), with the same signatures.

- [ ] **Step 1: Set up the worktree**

Run `npm install` in `$WEB`. Then convert the client into the worktree's own `dist` (about 7 minutes; run it in the background): `npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client"`.
Expected: `Total: 15,364 ok, 166 warn, 0 failed`, and `node -p "JSON.parse(require('fs').readFileSync('dist/assets/report.json','utf8')).failures.length"` prints `0`.

- [ ] **Step 2: Record the baseline**

Run `npm test`, `npm run typecheck` and `npm run test:e2e` (`npx playwright install chromium` once first).
Expected: all pass. Note the test-file count; the move must keep it.

- [ ] **Step 3: Move the files and fix the imports**

`git mv` as listed. Fix the relative imports in the moved files, and point the viewer's imports at `@flyffweb/scene`.

- [ ] **Step 4: Run everything again**

Run `npm test`, `npm run typecheck` and `npm run test:e2e`, **without** `--update-snapshots`.
Expected: all pass with the same number of test files. The picture baselines in `apps/viewer/e2e/__screenshots__` are untouched (`git status` shows no change there).

- [ ] **Step 5: Commit**

`git add packages/scene apps/viewer package.json package-lock.json` and commit `refactor(scene): the viewer's 3D code moves to packages/scene`.

### Task 2: `WorldStage` and boot helpers; the viewer on top

**Files:**
- Create: `packages/scene/src/boot.ts`, `packages/scene/src/world/WorldStage.ts`
- Modify: `apps/viewer/src/main.ts` (uses `createRenderer`, `loadSceneServices`), `apps/viewer/src/world/WorldView.ts` (uses `WorldStage` for the scene, camera, light, sky, fog, tiles and objects; keeps its own character, input, `walkRoute` and chase camera), `packages/scene/src/index.ts`
- Test: the viewer's e2e pictures and soak (unchanged files)

**Interfaces:**
- Produces:

```ts
// boot.ts (what apps/viewer/src/main.ts does today, minus the router)
export function createRenderer(container: HTMLElement, overlay: Overlay): WebGLRenderer;
export interface SceneServices {
  renderer: WebGLRenderer; store: AssetStore; loaders: { gltf: GLTFLoader; ktx2: KTX2Loader };
  textures: TextureCache; overlay: Overlay;
}
export function loadSceneServices(renderer: WebGLRenderer, overlay: Overlay, assetBase?: string): Promise<SceneServices>;

// WorldStage.ts (what WorldView.ts's start() and frame() do for the map today)
export class WorldStage {
  static open(world: string, services: SceneServices, radius: number): Promise<WorldStage>; // rejects when the manifest can't be had
  readonly manifest: WorldManifest;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  focus(at: Vec3): void;                       // web coordinates: streams tiles around `at`
  heightAt(at: Vec3): number | null;           // web coordinates, as TileStreamer.heightAt
  ready(): Promise<void>;                      // the tiles of the last focus are on screen; never rejects
  setCamera(position: Vec3, target: Vec3): void; // also updates the objects' LOD from `position`
  render(): void;                              // fixes the aspect ratio, then renders
  counts(): { tiles: number; models: number };
  loadedTiles(): string[];
  dispose(): void;
}
```

- [ ] **Step 1: Write `boot.ts` and `WorldStage.ts` by moving code out of `main.ts` and `WorldView.ts`.** No behaviour changes: same lights (intensity π), sky and fog from the manifest, far plane at the fog end, the same `TileStreamer` and `ObjectPool` setup.
- [ ] **Step 2: Rebuild `WorldView.ts` and `main.ts` on them.**
- [ ] **Step 3: Run `npm test`, `npm run typecheck`, `npm run test:e2e` (no `--update-snapshots`) and `npm run test:soak`.** Expected: all pass; no baseline changes; soak memory within 110%.
- [ ] **Step 4: Commit** `refactor(scene): WorldStage and boot helpers, used by the viewer`.

### Task 3: World-entry packets

**Files:**
- Modify: `packages/protocol/src/constants.ts`, `packages/protocol/src/messages/login.ts`, `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/messages/world.ts`
- Test: `packages/protocol/test/login.test.ts`, `packages/protocol/test/world.test.ts`

**Interfaces:**
- Produces:

```ts
// constants.ts
PacketType.{JOIN, PRE_JOIN, REPLACE, SNAPSHOT, PLAYERMOVED, PLAYERBEHAVIOR}   // values: Global Constraints
export const MessageType: { SETPOSANGLE: 0x0e; SETPOS: 0x10; MOTION: 0x98; DESTPOS: 0xc1; MOVERSETDESTOBJ: 0xc2;
  DESTANGLE: 0xc3; MOVERMOVED: 0xca; MOVERBEHAVIOR: 0xcb; MOVERANGLE: 0xce; ADD_OBJ: 0xf0; DEL_OBJ: 0xf1;
  REPLACE: 0xf2; WORLD_READINFO: 0x9910 };
export const BUNDLE_MARKER = 0x31434f54;
export type Vec3 = [number, number, number];

// login.ts
export function encodePreJoin(account: string, playerId: number, name: string): Uint8Array;  // CDPLoginClient::SendPreJoin
// LoginMessage gains | { type: 'preJoin' }                                                  // CDPLoginClient::OnPreJoin

// world.ts
export interface JoinRequest {
  worldId: number; playerId: number; authKey: number; partyId: number; guildId: number; warId: number;
  channelId: number; slot: number; name: string; account: string; passwordHash: string;
  messenger: SlotMessenger | undefined;          // undefined: the empty CRTMessenger
}
export function encodeJoin(j: JoinRequest): Uint8Array;                                      // CDPClient::SendJoin
export function encodeWorldKeepAlive(): Uint8Array;                                          // CDPClient::OnKeepAlive
export interface MoveReport {
  pos: Vec3; delta: Vec3; angle: number; state: number; stateFlag: number; motion: number;
  motionEx: number; loop: number; motionOption: number; tick: bigint;
}
export function encodePlayerMoved(m: MoveReport): Uint8Array;                                // CDPClient::SendPlayerMoved
export function encodePlayerBehavior(m: MoveReport): Uint8Array;                             // CDPClient::SendPlayerBehavior
export function encodeDestPos(pos: Vec3, forward: boolean): Uint8Array;                      // CDPClient::SendSnapshot
export type WorldPacket =
  | { type: 'join'; body: Uint8Array } | { type: 'snapshot'; body: Uint8Array }
  | { type: 'keepAlive' } | { type: 'error'; code: number }
  | { type: 'replace'; worldId: number } | { type: 'unknown'; packetType: number };
export function decodeWorldPacket(body: Uint8Array): WorldPacket;  // CDPClient's ON_MSG table; REPLACE as CDPClient::OnReplace reads it
```

- [ ] **Step 1: Write the failing tests.** Each builds the expected bytes with `ArWriter` in the order of the named C++ function.
  - `encodePreJoin writes CDPLoginClient::SendPreJoin's fields`: `DPID_UNKNOWN, 0xff05, 'webtester', 7, 'Hero', i32 0`.
  - `decodeLoginMessage reads PRE_JOIN`: `u32 0xff05` gives `{ type: 'preJoin' }`.
  - `encodeJoin writes CDPClient::SendJoin's fields`: world 1, player 7, auth key 9, party/guild/war 0, channel 2, slot 1, then name, account, hash, and a messenger of state 0 and one friend `{ id: 5, blocked: 0, state: 1 }`. Also a case with `messenger: undefined` (state 0, no friends).
  - `encodeWorldKeepAlive is DPID_UNKNOWN then KEEP_ALIVE`.
  - `encodePlayerMoved and encodePlayerBehavior write a MoveReport`: vec3, vec3, f32, u32, u32, u32, i32, i32, u32, i64.
  - `encodeDestPos writes the client SNAPSHOT`: `DPID_UNKNOWN, 0xffffff00, u8 1, u16 0x00c1, vec3, u8 1`.
  - `decodeWorldPacket tells the types apart`: JOIN and SNAPSHOT keep the whole body; KEEP_ALIVE, ERROR and REPLACE (with OnReplace's fields) are decoded; another type gives `unknown`.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/world.test.ts packages/protocol/test/login.test.ts`. Expected: FAIL (`encodePreJoin` is not exported).
- [ ] **Step 3: Implement** the constants and the functions above. Every decoder ends with `expectEnd()`, as `login.ts` does.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): world-entry packets (PRE_JOIN, JOIN, moves, DESTPOS)`.

### Task 4: The bundle reader and the table of contents

**Files:**
- Modify: `packages/protocol/src/ar/ArReader.ts`
- Create: `packages/protocol/src/bundle.ts`, `packages/testkit/src/world.ts`
- Modify: `packages/protocol/src/index.ts`, `packages/testkit/src/index.ts`
- Test: `packages/protocol/test/bundle.test.ts`, `packages/protocol/test/ar.test.ts`, `packages/testkit/test/world.test.ts`

**Interfaces:**
- Produces:

```ts
// ArReader
position(): number;   // bytes read so far
skipRest(): void;     // marks the rest as read (a deliberate partial read)

// bundle.ts
export interface MessageHeader { objectId: number; playerObjectId: number }
export type MessageReader<T> = (r: ArReader, header: MessageHeader) => T;   // r covers the message's fields only
export interface BundleMessage<T> { objectId: number; type: number; value: T }
export interface BundleResult<T> {
  playerObjectId: number;
  indexed: boolean;          // a valid table was found
  messages: BundleMessage<T>[];
  skipped: number[];         // types with no reader, in order
  mismatched: number[];      // types whose reader didn't end exactly at the message's end (or ran out)
  stoppedAt: number | null;  // without a table: the type where reading had to stop
}
export function readBundle<T>(body: Uint8Array, readers: ReadonlyMap<number, MessageReader<T>>): BundleResult<T>;

// testkit world.ts
export interface ScriptMessage { objectId: number; type: number; fields: Uint8Array }
export function encodeBundle(packetType: number, playerObjectId: number, messages: readonly ScriptMessage[], options?: { index?: boolean }): Uint8Array; // index defaults to true
```

- **Rules:**
  - **Marker absent:** no table. Messages are read in order, each reader getting an `ArReader` over the rest of the bundle; the next message starts where the reader stopped. A reader that called `skipRest`, or the first type with no reader (`stoppedAt`), ends the bundle. A reader that throws a `ProtocolError` ends the bundle too, with its type in `mismatched` and `stoppedAt`.
  - **Marker present but the table breaks a rule** (Global Constraints), **or a header shorter than 10 bytes:** throws a `ProtocolError`. This is the "broken header or trailer" of §4.

- [ ] **Step 1: Write the failing tests.**
  - `position and skipRest`: after `u32()` the position is 4; after `skipRest()`, `remaining()` is 0 and `expectEnd()` passes.
  - `reads every message of an indexed bundle`: three messages (`0xca` known, `0x99` unknown, `0xf1` known). Two values, `skipped` `[0x99]`, `indexed` true.
  - `a reader that ends early or late is mismatched, and the rest is still read`.
  - `reads an unindexed bundle in order and stops at the first type with no reader`: `stoppedAt` is that type, and the messages before it are kept.
  - `a reader that skips the rest ends an unindexed bundle`.
  - One `throws` test per table rule: a count that differs, a first start other than 0, starts less than 6 apart, a last start less than 6 bytes before the trailer, and a 9-byte body.
  - `encodeBundle writes the table`: two messages with fields of 4 and 0 bytes give exactly `starts` `[0, 10]`, `count` 2, marker `54 4f 43 31` after the messages. Without `index`, it writes no trailer.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/bundle.test.ts packages/protocol/test/ar.test.ts packages/testkit/test/world.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `readBundle`, `position`, `skipRest` and `encodeBundle`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): bundle reader with the world server's table of contents`.

### Task 5: Movement and place messages

**Files:**
- Create: `packages/protocol/src/world/types.ts`, `packages/protocol/src/world/movement.ts`, `packages/protocol/src/world/place.ts`, `packages/protocol/src/world/readers.ts`
- Modify: `packages/protocol/src/index.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/worldMessages.test.ts`, `packages/testkit/test/world.test.ts`

**Interfaces:**
- Consumes: `MessageReader`, `MoveReport`, `MessageType` (Tasks 3, 4).
- Produces:

```ts
// types.ts (AddedMover is filled in by Task 6)
export type WorldMessage =
  | { type: 'addMover'; mover: AddedMover } | { type: 'addOther'; objectType: number } | { type: 'delObj' }
  | { type: 'worldReadInfo'; worldId: number; pos: Vec3 }
  | { type: 'moverMoved'; move: MoveReport } | { type: 'moverBehavior'; move: MoveReport }
  | { type: 'moverAngle'; pos: Vec3; delta: Vec3; angle: number; angleX: number; accPower: number; turnAngle: number; tick: bigint }
  | { type: 'destPos'; pos: Vec3; forward: boolean } | { type: 'destAngle'; angle: number; left: boolean }
  | { type: 'setDestObj'; targetId: number; range: number }
  | { type: 'motion'; message: number }        // an OBJMSG: CDPClient::OnMotion passes it to SendActMsg
  | { type: 'setPos'; pos: Vec3 } | { type: 'setPosAngle'; pos: Vec3; angle: number }
  | { type: 'replace'; worldId: number; pos: Vec3 };
// readers.ts
export const WORLD_READERS: ReadonlyMap<number, MessageReader<WorldMessage>>;  // Task 6 adds ADD_OBJ
// testkit world.ts: one writer per message, the server's side of each reader
export function writeMoverMoved(objectId: number, move: MoveReport): ScriptMessage;   // and writeMoverBehavior, writeMoverAngle,
// writeDestPos, writeDestAngle, writeSetDestObj, writeMotion, writeSetPos, writeSetPosAngle, writeDelObj,
// writeWorldReadInfo(objectId, worldId, pos), writeReplace — same argument order as the WorldMessage fields
```

- **Copies:** `CDPClient::OnMoverMoved` (`Neuz/DPClient.cpp:8574`), `OnMoverBehavior` (`:8653`), `OnMoverAngle` (`:8887`), `OnSetDestPos` (`:3731`, no `objidIAObj`), `OnSetDestAngle` (`:3769`), `OnMoverSetDestObj` (`:8561`), `OnMotion` (`:9951`), `OnSetPos` (`:2215`), `OnSetPosAngle` (`:2275`), `OnRemoveObj` (`:1643`, no fields), `OnWorldReadInfo` (`:18781`) and `OnReplace` (`:2297`, which reads the world ID and position; read every field it reads).

- [ ] **Step 1: Write the failing tests.** One per message: bytes built with `ArWriter` in the handler's order decode to the value, through `readBundle` with `WORLD_READERS`, with nothing `mismatched`. Also `every testkit writer decodes to what it was given` (a round trip for each writer).
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/worldMessages.test.ts packages/testkit/test/world.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the readers, the registry and the writers.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): movement and place messages of the world bundles`.

### Task 6: ADD_OBJ (movers)

**Files:**
- Create: `packages/protocol/src/world/addObj.ts`
- Modify: `packages/protocol/src/world/types.ts`, `packages/protocol/src/world/readers.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/addObj.test.ts`, `packages/testkit/test/world.test.ts`

**Interfaces:**
- Produces:

```ts
export interface WornPart { part: number; itemId: number; flag: number }   // flag: players only (0 for NPCs)
export interface AddedMover {
  // CObj::Serialize and CCtrl::Serialize
  index: number; scale: number; pos: Vec3; angle: number; objectId: number;
  // CMover::Serialize, shared part
  motion: number; isPlayer: boolean; hitPoint: number; state: number; stateFlag: number; belligerence: number; sfxId: number;
  player?: {
    self: boolean; name: string; sex: number; skinSet: number; hairMesh: number; hairColor: number; headMesh: number;
    playerId: number; job: number; level: number; authorization: number; mode: number; stateMode: number;
    pkTime: number; pkValue: number; pkPropensity: number; honor: number;
    worn: WornPart[];                    // others: the METHOD_EXCLUDE_ITEM list. self: from m_aEquipInfo[].dwId, part = array index, flag 0
    title: string;                       // others only ('' for self)
  };
  npc?: { hairMesh: number; hairColor: number; headMesh: number; characterKey: string; worn: WornPart[];
          activeAttack: number; movePattern: number; moveEvent: number; moveEventCount: number; speedFactor: number };
}
// testkit: writeAddPlayer(objectId, p), writeAddSelf(objectId, p), writeAddMonster(objectId, m), writeAddNpc(objectId, n)
```

- **Copy** `CDPClient::OnAddObj` (`Neuz/DPClient.cpp:1053`) and what it calls: `CObj::Serialize` and `CMover::Serialize` (`Source/_Common/ObjSerializeOpt.cpp:18,97`), `CCtrl::Serialize` (`ObjSerialize.cpp:15`), and the buff list (`__BUFF_1107`). Read everything to the end of the message, **except the player's own character**:
  - **How self is known:** the message's object ID equals the bundle's `playerObjectId`; this is when Neuz uses `METHOD_NONE`.
  - **What self reads:** read through the equipment IDs after `m_nRemainGP`. That includes the quest arrays: their element size is `sizeof(QUEST)` from `_Common`, worked out from the struct and written down in a comment with its fields. Then call `skipRest()`.
  - **Non-mover objects:** an object type other than `OT_MOVER` gives `{ type: 'addOther' }` after `skipRest()`.

- [ ] **Step 1: Write the failing tests.** Bytes are built with `ArWriter` in the C++ order:
  - `reads another player`: name `Hero`, 3 worn parts, a title;
  - `reads a monster with buffs`;
  - `reads a human NPC with worn parts and a speed factor`;
  - `reads the player's own character up to its equipment and skips the rest`: with 2 quests and 1 completed quest, followed by 50 bytes of inventory;
  - `an item object is addOther`;
  - `each writer decodes to what it was given`.

  None may be `mismatched`.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/addObj.test.ts packages/testkit/test/world.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): ADD_OBJ for players, monsters and NPCs`.

### Task 7: World-server patch: the table of contents

**Files:**
- Modify (byte-preserving): `$SERVER/Source/WORLDSERVER/Snapshot.h`, `Snapshot.cpp`, `User.cpp`
- Create: `server-patches/world-snapshot-index.patch`, `server-patches/tests/snapshot-test.cpp`, `server-patches/tests/run-snapshot-test.sh`, `server-patches/tests/scan-snapshot-sites.mjs`, `server-patches/tests/stub/` additions
- Modify: `server-patches/README.md`

**Interfaces:**
- Produces: in `Snapshot.h`, a class `CSnapshotCount` replacing `short cb`:
  - it behaves like a `short`: assignment from `int` (assigning 0 also clears the starts, so the existing `cb = 0` lines clear them), conversion to `short`, comparison, and `CAr << cb` writing 2 bytes;
  - its `operator++(int)` records `ar.GetOffset()`, where `ar` is its own `CSnapshot`'s;
  - `int Count() const`, `u_long Start( int i ) const`, `void Clear()`.

  `CSnapshot::AppendIndex( u_long uFirst )` appends the trailer (starts minus `uFirst`, the count as u16, the marker). `CUser::Notify` calls it before `GetBuffer`, with `uFirst` = its existing `uOffset` (14). `SetSnapshot`, `Flush` and `Notify`'s reset clear the starts.

- [ ] **Step 1: Snapshot the originals.** Copy the three files to `$SNAP/orig/Source/WORLDSERVER/`. Record `ls -l --time-style=long-iso "$SERVER"/Program/*.exe "$SERVER"/Output/*/Release/*.exe > "$SNAP/exes-before.txt"`.
- [ ] **Step 2: Write the site scan.** `scan-snapshot-sites.mjs <Source folder>` lists every `m_Snapshot.cb++` in `WORLDSERVER/*.cpp`, and fails if any `m_Snapshot.ar` write in the same function comes before the `cb++` that starts its message. In other words: between the previous message's last write and this `cb++`, nothing is written.
  Run: `node server-patches/tests/scan-snapshot-sites.mjs "$SERVER/Source"`. Expected: `277 sites, 0 problems` (273 in `User.cpp`, 4 in `UserLux.cpp`). Fix the scan, not the source, if it reports a problem that isn't real.
- [ ] **Step 3: Write the failing C++ test**, built like `run-limits-test.sh`, from `Snapshot.h/.cpp` with stub `CAr` and `DPID` headers:
  - `starts are recorded at each cb++`: 3 messages of 6, 10 and 6 bytes give starts 0, 6, 16 relative to byte 14;
  - `the trailer is starts, count, marker`: exact bytes;
  - `SetSnapshot and Flush clear the starts`;
  - `a second bundle after ReelIn has only its own starts`.

  Run `bash server-patches/tests/run-snapshot-test.sh`. Expected: compile error, `CSnapshotCount` undefined.
- [ ] **Step 4: Make the edits** with the byte-preserving script. Anchors: `short	cb;` in `Snapshot.h`; the `SetSnapshot` body in `Snapshot.cpp`; `lpBuf	= m_Snapshot.ar.GetBuffer( &nBufSize );` in `CUser::Notify` (`User.cpp:599`), with the `AppendIndex` call inserted before it.
- [ ] **Step 5: Run the test.** Expected: `PASS`.
- [ ] **Step 6: Build** `"$MSB" "$SERVER/Source/WORLDSERVER/WorldServer.vcxproj" -p:Configuration=Release -p:Platform=Win32 -m` (in the background; it's large). Expected: `Build succeeded.`, `0 Error(s)`, and only `Output/WorldServer/Release/WorldServer.exe` newer than in `exes-before.txt`; no `Program/` line changed.
- [ ] **Step 7: Write the patch** with `diff -u --label a/Source/<f> --label b/Source/<f>` per file. Check from a copy of the originals that `git apply -p1` reproduces `$SERVER/Source` (`cmp` prints nothing).
- [ ] **Step 8: Write the README section** in the existing style: Why, What it changes, Apply, Build, Put in service, Undo. "Put in service" tells the owner that the running `7. World.exe` (3,824,640 bytes, 9 June 2026) matched `Output\WorldServer\Release\WorldServer.exe` before this change, and to swap only if nothing else changed in `Source\WORLDSERVER` or `_Common` since. Also update the patch order line.
- [ ] **Step 9: Commit** `feat(servers): the world server appends a table of contents to its bundles`.

### Task 8: Cache-server patch and gateway: the real address

**Files:**
- Modify (byte-preserving): `$SERVER/Source/CACHESERVER/Player.h`, `DPCacheSrvr.h`, `DPCacheSrvr.cpp`, `CacheServer.cpp`, `CacheServer.vcxproj` and `CacheServer.vcxproj.filters` (the two new files)
- Create (ASCII, CRLF): `$SERVER/Source/CACHESERVER/GatewayAddr.h`, `GatewayAddr.cpp`. They hold the rules, so the test builds them without the network code:
  - `CGatewayList::Add( const char* )` and `IsListed( const char* )`, at most 8 addresses;
  - `BOOL IsDottedIPv4( const char* )`, copied from `certifier-client-addr.patch`;
  - `BOOL AcceptClientAddr( const CGatewayList&, const char* szPeer, BOOL bJoined, const char* szAddr )`.
- Create: `server-patches/cache-client-addr.patch`, and in `server-patches/tests/`: `cache-test.cpp` and `run-cache-test.sh`, built like `run-limits-test.sh` from `GatewayAddr.cpp`
- Modify: `apps/gateway/src/relay.ts:156`, `apps/gateway/src/config.ts` (comment), `server-patches/README.md`
- Test: `apps/gateway/test/relay.test.ts`

**Interfaces:**
- Produces (C++):
  - `CacheServer.cpp`'s `Script` reads up to 8 `Gateway "a.b.c.d"` lines into a global `CGatewayList`.
  - `CDPCacheSrvr::OnGatewayClientAddr` reads the string and calls `AcceptClientAddr`: the connection's socket address must be listed, `CPlayer` must not have joined (a new `BOOL m_bJoined`, set in `OnAddConnection`), and the string must be dotted IPv4 of at most 15 characters. When it's refused, it writes `GATEWAY_CLIENT_ADDR refused from <address>` to the error log.
  - `CPlayer::SetClientAddr( const char* )` stores the address, and `SetAddr` uses it when it's set.
- Produces (gateway): the address packet goes first on `certifier` **and** `cache` routes when `sendClientAddr` is on.

- [ ] **Step 1: Write the failing tests.**
  - Gateway: `sends the client address first on cache routes` and `never on login routes`, against `FakeFlyffServer`, as the certifier tests do. Run `npx vitest run apps/gateway/test/relay.test.ts`. Expected: FAIL on the cache case.
  - C++ (`cache-test.cpp`, run by `bash server-patches/tests/run-cache-test.sh`):
    - `accepts the address from a listed gateway before JOIN`;
    - `refuses it after JOIN`;
    - `refuses it from an unlisted address`;
    - `refuses a bad address` (the certifier test's bad list);
    - `a ninth gateway is not added`.

    Expected: compile error (`GatewayAddr.h` not found).
- [ ] **Step 2: Change `relay.ts:156`** to `route.role === 'certifier' || route.role === 'cache'`. Run the gateway tests. Expected: PASS.
- [ ] **Step 3: Snapshot, edit, test and build the cache server**, as in Task 7 Steps 1 and 4–6 (`CacheServer.vcxproj`; its project writes `Output/CacheServer/Release/CacheServer.exe`). Expected: test `PASS`, `Build succeeded.`, and `Program/` unchanged.
- [ ] **Step 4: Write the patch and its README section.** Include the `CacheServer.ini` line `Gateway "127.0.0.1"` and the note that `6. Cache.exe` (3,348,992 bytes) matched before. Check the whole chain of five patches from the originals, as in Task 7 Step 7.
- [ ] **Step 5: Commit** `feat(servers,gateway): the cache server takes the player's real address from the gateway`.

### Task 9: Game-data readers

**Files:**
- Modify: `packages/formats/src/inc/modelIndex.ts` (keep `part` and `motions`), `packages/formats/src/index.ts`
- Create: `packages/formats/src/inc/strings.ts`, `propMover.ts`, `propItem.ts`, `character.ts`, `pkSetting.ts`
- Test: `packages/formats/test/gameDataReaders.test.ts`, `packages/formats/test/gameData.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
// ModelElem gains:
part: string;                                  // the part text ('' when absent), e.g. 'mvag01upper/fvag01upper'
motions: { id: number; name: string }[];       // the entry's motion list, in file order
export function readStringTable(text: string, file?: string): Map<string, string>;   // CProject::LoadStrings (ProjectCmn.cpp:604)
export interface MoverProp { index: number; name: string; speed: number; ai: number }   // CProject::LoadPropMover (ProjectCmn.cpp:112)
export function readPropMover(text: string, defines: ReadonlyMap<string, number>, strings: ReadonlyMap<string, string>, file?: string): MoverProp[];
export interface ItemProp { id: number; name: string; parts: number }                     // CProject::LoadPropItem (:300)
export function readPropItem(text: string, defines: ReadonlyMap<string, number>, strings: ReadonlyMap<string, string>, file?: string): ItemProp[];
export interface CharacterDef { key: string; name: string }                                // CProject::LoadCharacter (Project.cpp:2886)
export function readCharacterInc(text: string, defines: ReadonlyMap<string, number>, strings: ReadonlyMap<string, string>, file?: string): CharacterDef[];
export interface PkColors { general: number; chaotic: number; ready: number }              // CProject::LoadScriptPK (Project.cpp:4960)
export function readPkSetting(text: string, defines: ReadonlyMap<string, number>, file?: string): PkColors;
```

- [ ] **Step 1: Write the failing tests.**
  - Small hand-written inputs in each file's real syntax: one test per reader. The model index keeps a part with a `/` and a motion list.
  - Corpus tests (`*.corpus.test.ts`) run over the real files in the packs: `propMover.txt` (+ `propMover.txt.txt`), `propItem.txt` (+ `.txt.txt`), `character.inc`, `character-etc.inc`, `character-school.inc` (+ their `.txt.txt`), `mdlDyna.inc` and `PKSetting.inc`. They expect zero errors, every mover index unique, `MI_MALE` and `MI_FEMALE` present with a speed above 0, and the item `II_ARM_M_VAG_UPPER01` present with a part.
- [ ] **Step 2: Run** `npx vitest run packages/formats/test/gameDataReaders.test.ts` (FAIL), then implement each reader as its C++ loader reads it, then run it again (PASS), and run `npm run test:corpus -- gameData` (PASS).
- [ ] **Step 3: Commit** `feat(formats): readers for movers, items, characters, strings and name colours`.

### Task 10: The game-data stage

**Files:**
- Create: `packages/formats/src/web/gameData.ts`, `tools/convert/src/data/gameDataStage.ts`
- Modify: `tools/convert/src/run.ts` (`DEFAULT_STAGES` becomes textures, models, worlds, **data**), `packages/formats/src/index.ts`
- Test: `tools/convert/test/gameDataStage.test.ts`, `tools/convert/test/gameData.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
// gameData.ts: the JSON the stage writes and the client reads
export interface WebMover {
  index: number; name: string; speed: number;
  model: string | null;        // logical key of the body glb (models/mvr_<name>.glb), null for player bodies (assembled from parts)
  skeleton: string | null;     // skeletons/mvr_<name>.glb when the model is animated
  motions: Record<string, string>;   // motion id (decimal) → logical key, via CModelMng::MakeMotionName
}
export interface WebItemModel { id: number; male: string | null; female: string | null }  // CModelMng::MakePartsName per sex
export interface WebNpc { key: string; name: string }
export type WebNameColors = PkColors;
export const GAME_DATA_KEYS: { movers: 'data/movers.json'; items: 'data/items.json'; npcs: 'data/npcs.json'; nameColors: 'data/nameColors.json' };
```

- **Rules:**
  - Keys are made with `webName`, the way the models stage names its outputs. A model, skeleton or motion is kept only when `writer.pathOf(key)` says it was converted; otherwise it's `null` (or left out of `motions`) with a `warn` in the report.
  - `items.json` lists only items that have an `OT_ITEM` model entry with a part.
  - Each file is written once with `writer.write`, so `index.json` lists it.

- [ ] **Step 1: Write the failing tests.**
  - `writes the four catalogs`, with an in-memory pack holding small inputs.
  - `a part with a slash gives the male and female names`: `part_mvag01upper` and `part_fvag01upper`.
  - `an unconverted motion is left out with a warning`.
  - Corpus: `the real client gives MI_MALE with skeleton skeletons/mvr_male.glb, and motion 0 (MTI_STAND) maps to a motions/mvr_male/ key that exists in the index`. The key is built as `MakeMotionName` builds it from `mdlDyna.inc`.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/gameDataStage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the stage.**
- [ ] **Step 4: Run** the unit tests (PASS), then `npm run convert -- --only "data"` against the real client and `npm run test:corpus -- gameData` (PASS). Report the four files' sizes.
- [ ] **Step 5: Commit** `feat(convert): game-data stage (movers, items, NPCs, name colours)`.

### Task 11: The lobby hands over to the world

**Files:**
- Create: `apps/client/src/net/serverClock.ts`
- Modify: `apps/client/src/lobby/LoginFlow.ts` (keeps `CACHE_ADDR`, the `QUERYTICKCOUNT` answer, the selected channel; gains `handOver`), `apps/client/src/lobby/views/characterView.ts` (`Enter` button, `onEnter`), `apps/client/src/lobby/LobbyApp.ts` (an `onEnter` callback given to its constructor)
- Test: `apps/client/test/serverClock.test.ts`, `apps/client/test/loginFlow.test.ts`

**Interfaces:**
- Produces:

```ts
// serverClock.ts (CTickCount, Source/_Network/Misc/Include/tickcount.h; CDPLoginClient::OnQueryTickCount)
export class ServerClock {
  constructor(now: () => number);                        // milliseconds
  start(sentAt: number, serverTick: bigint): void;       // sentAt: the value sent in QUERYTICKCOUNT
  get started(): boolean;
  tick(): bigint;
  offsetMs(t: bigint): number;
}
// LoginFlow
export interface WorldEntry {
  login: PacketChannel;                 // still open; the world session pings it from now on
  cacheTarget: string;                  // `${cacheAddress}:5400`
  account: string; passwordHash: string; authKey: number; channelId: number;
  character: CharacterSummary; messenger: SlotMessenger | undefined;
  clock: ServerClock;
}
handOver(slot: number): WorldEntry | undefined;  // undefined without a character in that slot, a cache address or a started clock.
// The flow stops its PING and timers and forgets the session without closing `login`.
// characterView gains onEnter(character); LobbyApp's constructor gains onEnter: (entry: WorldEntry) => void
```

- [ ] **Step 1: Write the failing tests.**
  - `ServerClock`: `start adds half the round trip`: `sentAt` 1000, `now` 1100, `serverTick` 5n give `tick()` = `5n + 100n × 5000n`. `ticks advance 10000 per ms`. `offsetMs of a tick 250 ms old is 250`.
  - `LoginFlow`:
    - `handOver gives the entry and leaves the login channel open`;
    - `handOver stops the flow's PING`;
    - `handOver is undefined before CACHE_ADDR`;
    - `handOver is undefined for an empty slot`;
    - `a second handOver is undefined` (Enter pressed twice).
- [ ] **Step 2: Run** `npx vitest run apps/client/test/serverClock.test.ts apps/client/test/loginFlow.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS, and the existing lobby tests still pass.
- [ ] **Step 4: Commit** `feat(client): the lobby keeps the cache address and the clock, and hands over to the world`.

### Task 12: Ground movement rules (`ActionMover`)

**Files:**
- Create: `apps/client/src/world/sim/constants.ts`, `apps/client/src/world/sim/ActionMover.ts`
- Test: `apps/client/test/sim/actionMover.test.ts`

**Interfaces:**
- Produces:

```ts
// constants.ts: OBJSTA_*, OBJSTAF_*, OBJMSG_*, MTI_*, ANILOOP_* values Piece 3 uses, copied from their headers
export const ActMsg: { FORWARD; BACKWARD; STAND; STOP; LTURN; RTURN; STOP_TURN; MODE_WALK; MODE_RUN; SITDOWN; STANDUP };
// ActionMover.ts (CActionMover, ground only)
export interface MoverBody { pos: Vec3; angle: number; speed: number }       // speed: CMover::GetSpeed's result
export class ActionMover {
  constructor(body: MoverBody);
  state: number; stateFlag: number; motion: number; delta: Vec3;
  sendActMsg(msg: number, ...params: number[]): boolean;       // ProcessActMsg1 (ActionMoverMsg.cpp:101): true when it returns 1
  step(groundAt?: (x: number, z: number) => number | null): void;   // ProcessState1 then the position update and the terrain height
  presuppose(frames: number): { pos: Vec3; delta: Vec3; angle: number };   // PresupposePos (ActionMover.cpp:355)
  forceSet(m: MoveReport): void;                                // CMover::ActionForceSet (MoverParam.cpp:3321)
  report(tick: bigint): MoveReport;                             // what SendPlayerMoved / SendPlayerBehavior send
}
```

- **Copies:** `ProcessActMsg1` for the messages in `ActMsg` only (others return false); `ProcessState1` for `STAND`, `FMOVE`, `BMOVE`, `LTURN`, `RTURN` and `SIT` (`ActionMoverState.cpp:32-420`); the position and height part of `ProcessCollisionGround` on terrain only (milestone 2 adds the rest); `PresupposePos`.

- [ ] **Step 1: Write the failing tests** (values from Global Constraints, speed 0.1 per step):
  - `runs forward 6 units in 60 steps at angle 90`: from (0, 0, 0), x = 6.0 ± 1e-5, z = 0.
  - `walks at a quarter of the speed`: x = 1.5 after 60 steps.
  - `walks backward at a fifth`: angle 90, `BACKWARD`, x = −1.2 after 60 steps.
  - `turns 4 degrees a step`: `LTURN` 10 steps from 0 gives 40; `RTURN` 10 steps from 40 gives 0.
  - `presuppose matches stepping`: for `FMOVE` at angle 30, `presuppose(22).pos` equals the position after 22 `step()`s.
  - `angle 0 runs toward lower D3D z`.
  - `sendActMsg reports a change once`: `FORWARD` twice gives true, then false.
  - `stands on the ground it is given`: y follows `groundAt`.
  - `forceSet sets position, delta, angle, state and motion`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/sim/actionMover.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): ground movement rules copied from CActionMover`.

### Task 13: Other movers' corrections, walking to a point and following

**Files:**
- Create: `apps/client/src/world/sim/moverRules.ts`
- Test: `apps/client/test/sim/moverRules.test.ts`

**Interfaces:**
- Consumes: `ActionMover`, `ServerClock.offsetMs`.
- Produces:

```ts
export interface SimMover { objectId: number; act: ActionMover; dest: DestState | null; corr: CorrState | null; speedFactor: number }
export function applyMoved(m: SimMover, move: MoveReport, offsetMs: number, behavior: boolean): void;  // CDPClient::OnMoverMoved / OnMoverBehavior (__SYNC_1217)
export function setDestPos(m: SimMover, pos: Vec3, forward: boolean): void;                          // CMover::SetDestPos (MoverMsg.cpp:88)
export function setDestObj(m: SimMover, targetId: number, range: number): void;                     // CMover::SetDestObj (MoverMsg.cpp:47)
export function setDestAngle(m: SimMover, angle: number, left: boolean): void;                       // CMover::SetDestAngle
export function stepMover(m: SimMover, find: (objectId: number) => SimMover | undefined, groundAt?: (x: number, z: number) => number | null): void;
// one step: the correction countdown (m_uRemnantCorrFrm, CMover::Process Mover.cpp:3488), CMover::ProcessMove (MoverMove.cpp:344), then act.step()
```

- [ ] **Step 1: Write the failing tests.** `__SYNC_1217` is on: the correction moves at the mover's own speed, and a backward move corrects in 1 step.
  - `a move 951 ms old is set at once; one 949 ms old is not`: `floor(951 / 16.6667) − 35` = 22 and `floor(949 / 16.6667) − 35` = 21 (Neuz truncates the `float` division).
  - `an on-time move heads for the predicted point at the mover's own speed for the remaining steps, then takes the reported state`: 617 ms old gives `delay` 2, so 20 remaining steps.
  - `a backward move corrects in one step`.
  - `walks to a point and stops there`.
  - `follows an object until within range`.
  - `turns to a destination angle the short or the given way`.
  - `a target that vanished stops following`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/sim/moverRules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): corrections, walking to a point and following, as Neuz moves others`.

### Task 14: The fixed stepper and the controls

**Files:**
- Create: `apps/client/src/world/sim/stepper.ts`, `apps/client/src/world/controls.ts`
- Test: `apps/client/test/sim/stepper.test.ts`, `apps/client/test/controls.test.ts`

**Interfaces:**
- Produces:

```ts
export const STEPS_PER_SECOND = 60;
export const MAX_STEPS_PER_FRAME = 60;
export class FixedStepper { advance(dtSeconds: number): number }   // whole steps due; the remainder carries over; at most MAX_STEPS_PER_FRAME
export interface Desired { move: 'stand' | 'forward' | 'back'; turn: 'none' | 'left' | 'right'; walk: boolean }
export function desiredFrom(intent: MoveIntent): Desired;   // forward > 0 / < 0; turn > 0 right, < 0 left; walk = !intent.run
export function driveOwnMover(act: ActionMover, desired: Desired): { moved: boolean; behavior: boolean };
// sends the ActMsgs whose states differ, in WndWorldControlPlayer.cpp:400-560's order: moved when a move/turn message
// changed the state, behavior when MODE_WALK/MODE_RUN did
```

- [ ] **Step 1: Write the failing tests.**
  - `16.7 ms gives one step and carries the rest`.
  - `a 10-second pause gives at most 60 steps`.
  - `a forward push walks, a full push runs`.
  - `starting to run sends moved and behavior once, holding it sends nothing`.
  - `turning while running sends moved`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/sim/stepper.test.ts apps/client/test/controls.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): fixed 60-step clock and Neuz keyboard states from the keys and joystick`.

### Task 15: `WorldState`: the movers in view

**Files:**
- Create: `apps/client/src/world/WorldState.ts`, `apps/client/src/world/gameData.ts`
- Test: `apps/client/test/worldState.test.ts`

**Interfaces:**
- Consumes: `WorldMessage`, `AddedMover`, the sim (Tasks 12–13), `GameData` types (Task 10).
- Produces:

```ts
// gameData.ts
export interface GameData { movers: Map<number, WebMover>; items: Map<number, WebItemModel>; npcs: Map<string, WebNpc>; nameColors: WebNameColors }
export function loadGameData(store: Pick<AssetStore, 'json'>): Promise<GameData>;
// WorldState.ts
export type MoverKind = 'player' | 'monster' | 'npc';
export interface Mover extends SimMover { kind: MoverKind; isSelf: boolean; added: AddedMover; name: string }
export interface WorldChanges { added: Mover[]; removed: number[] }      // object IDs
export class WorldState {
  constructor(data: GameData, clock: ServerClock, groundAt: (x: number, z: number) => number | null);
  readonly movers: ReadonlyMap<number, Mover>;
  self(): Mover | undefined;
  apply(objectId: number, message: WorldMessage): void;   // a mover message for an unknown ID is ignored
  step(): void;                                           // one stepMover for every mover
  takeChanges(): WorldChanges;                            // since the last call
}
```

- **Rules:**
  - **Kind and name:** a player's name is its own. An NPC's name comes from `npcs` by its character key, and its kind is `npc`. Any other mover is a `monster` named from `movers` by its index.
  - **Speed:** `movers[index].speed × speedFactor`, as `CMover::GetSpeed` without buffs.
  - **Replacement:** an ADD_OBJ for a present ID replaces it, reported as removed and added.
  - **Messages to rules:**
    - `moverMoved` / `moverBehavior` → `applyMoved`;
    - `destPos` → `setDestPos`; `setDestObj` → `setDestObj`; `destAngle` → `setDestAngle`;
    - `moverAngle` sets the angle, as `OnMoverAngle` does on the ground;
    - `setPos` / `setPosAngle` place at once;
    - `motion` passes its message to `act.sendActMsg`, which ignores messages outside `ActMsg`.

- [ ] **Step 1: Write the failing tests.**
  - `adds a player, a monster and an NPC with their names`.
  - `DEL_OBJ removes`.
  - `ADD_OBJ for a present ID replaces it, once`.
  - `moves for an unknown ID are ignored`.
  - `step moves every mover`.
  - `self is the mover whose ID is the bundle's player object ID`.
  - `loadGameData reads the four keys`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/worldState.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): the movers in view, moved by the copied rules`.

### Task 16: `WorldSession`: entering, playing and leaving

**Files:**
- Create: `apps/client/src/world/WorldSession.ts`
- Modify: `apps/client/test/helpers/fakeChannel.ts` (only if it lacks a helper the tests need)
- Test: `apps/client/test/worldSession.test.ts`

**Interfaces:**
- Consumes: `WorldEntry` (Task 11), `readBundle` and `WORLD_READERS` (Tasks 4–6), the encoders (Task 3), `FlowClock` (from `LoginFlow.ts`).
- Produces:

```ts
export type WorldEvent =
  | { type: 'entered'; worldId: number; pos: Vec3; playerObjectId: number; messages: BundleMessage<WorldMessage>[] }
  | { type: 'messages'; messages: BundleMessage<WorldMessage>[] }
  | { type: 'ended'; message: string };
export interface SessionStats { bundles: number; indexed: number; skipped: number; mismatched: number; unknownPackets: number }
export class WorldSession {
  constructor(open: OpenChannel, entry: WorldEntry, emit: (event: WorldEvent) => void, clock?: FlowClock);
  start(): Promise<void>;                 // the §3.2 steps 2-5
  sendMoved(m: MoveReport): void;
  sendBehavior(m: MoveReport): void;
  sendDestPos(pos: Vec3, forward: boolean): void;   // milestone 2
  leave(): void;                          // closes both channels; no event
  readonly stats: SessionStats;
}
```

- **Rules:**
  - **Order:** the cache channel opens; 1000 ms later PRE_JOIN goes out on `entry.login`; JOIN follows its answer.
  - **Timeouts:** 15000 ms for PRE_JOIN and 25000 ms for JOIN.
  - **Answers and pings:** KEEP_ALIVE is answered from the channel callback. The login PING every 10000 ms is taken over from the lobby.
  - **Endings,** each with its §4 text, every connection closed first: either channel closing (the JOIN-wait text while JOIN is awaited), a REPLACE to another world ID, an ERROR, or a bundle `readBundle` throws on.
  - **Console:** a type in `mismatched` or `stoppedAt`, and an unknown top-level packet type, is logged once per session.
  - **Never sent:** MAP_KEY (§3.2).

- [ ] **Step 1: Write the failing tests** (fake channels and clock, as `loginFlow.test.ts`):
  - `waits 1 s after the cache channel opens, then sends PRE_JOIN`.
  - `sends JOIN after PRE_JOIN's answer, with the entry's fields`.
  - `emits entered with the first bundle's WORLD_READINFO`.
  - `answers KEEP_ALIVE without a frame loop`.
  - `PRE_JOIN timeout`, `JOIN timeout`.
  - `the cache channel closing during JOIN gives the wait-a-moment text`.
  - `either channel closing later ends with the lost text`.
  - `REPLACE to another world ends the session`.
  - `a broken table ends with bad data`.
  - `leave during the 1 s pause sends nothing later`.
  - `answers that arrive after leave are ignored`.
  - `stats count indexed, skipped and mismatched`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/worldSession.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): WorldSession enters, keeps alive and leaves`.

### Task 17: Looks and name tags (pure rules)

**Files:**
- Create: `apps/client/src/world/render/looks.ts`, `apps/client/src/world/render/nameTags.ts`
- Test: `apps/client/test/looks.test.ts`, `apps/client/test/nameTags.test.ts`

**Interfaces:**
- Produces:

```ts
// looks.ts
export interface MoverLook { skeleton: string | null; parts: string[]; motion: (motionId: number) => string | null }  // logical keys
export function lookOf(mover: Mover, data: GameData): MoverLook | null;
// null: nothing converted to draw (placeholder). Players follow CMover::UpdateParts (MoverEquip.cpp:279): skin set,
// head mesh, hair mesh, then worn items by part replacing the defaults, through items[id].male / .female.
// Monsters and NPCs: movers[index].model and .skeleton.
// nameTags.ts
export interface NameTag { text: string; color: number; maxDistance: number }        // color as 0xAARRGGBB
export function nameTagOf(mover: Mover, viewer: Mover | undefined, colors: WebNameColors): NameTag | null;
// null when transparent (MODE_TRANSPARENT). CMover::RenderName and its caller CWorld::Render (World3D.cpp:1265-1300):
// title in brackets, " [GM]" / " [Admin]", the PK and authorization colours, 40 m / 100 m
export function tagOpacity(distance: number, maxDistance: number): number;   // 1 up to max − 10 m, then linear to 0 at max
```

- [ ] **Step 1: Write the failing tests.**
  - `a new male vagrant looks like the viewer's default`: skin set 0, head 0, hair 0, no worn items give exactly `models/part_malehead01.glb`, `models/part_malehair01.glb`, `models/part_mvag01upper.glb`, `models/part_mvag01hand.glb`, `models/part_mvag01foot.glb` (`DEFAULT_MALE`).
  - `a worn upper replaces the default upper`; `a female gets the female part`.
  - `a monster uses its model and skeleton`; `an unconverted model gives null`.
  - Name tags:
    - `a player is white-ish general colour from nameColors`;
    - `a GM gets " [GM]" and COLOR_GAMEMASTER`;
    - `a title is in brackets`;
    - `a chaotic player gets the chaotic colour`;
    - `a monster's limit is 40, a peaceful NPC's and a player's 100`;
    - `a transparent mover has no tag`.
  - `tagOpacity`: 1 at 30 of 40, 0.5 at 35, 0 at 40.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/looks.test.ts apps/client/test/nameTags.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): mover looks and name tags, as Neuz builds them`.

### Task 18: The world screen

**Files:**
- Create: `apps/client/src/world/render/MoverViews.ts`, `apps/client/src/world/render/NameTagLayer.ts`, `apps/client/src/world/WorldScreen.ts`, `apps/client/src/testHooks.ts`, `apps/client/e2e/world.spec.ts`, `packages/testkit/src/worldScript.ts` (the pretend cache and world server of §3.1, for e2e and tests)
- Modify: `apps/client/src/main.ts` (the lobby's `onEnter` opens a `WorldScreen`; its end returns to the login form with the message), `apps/client/package.json` (add `@flyffweb/scene`, `@flyffweb/formats`, `three`, devDependencies `@types/three`, `@flyffweb/testkit`), `apps/client/vite.config.ts` (`serveDist` from `@flyffweb/scene/vite/serveDist.ts`, `publicDir: false`, `chunkSizeWarningLimit: 1000`), `apps/client/src/style.css`, `apps/client/playwright.config.ts` (a `world` test also needs `dist/assets`), `packages/scene/src/overlay/Overlay.ts` (a `setMessageCounts(skipped, mismatched)` line), root `package.json` (`test:live:world`: `vitest run --config vitest.live.config.ts world.live`)
- Test: `apps/client/test/moverViews.test.ts` (with a fake loader), `apps/client/e2e/world.spec.ts`

**Interfaces:**
- Consumes: `WorldStage`, `loadSceneServices`, `assembleCharacter`, `loopMotion`, `Joystick`, `KeyboardInput` (Tasks 1–2); `WorldSession`, `WorldState`, `lookOf`, `nameTagOf`, `FixedStepper`, `driveOwnMover` (Tasks 14–17).
- Produces:

```ts
export class MoverViews {
  constructor(scene: Scene, load: (look: MoverLook) => Promise<AssembledCharacter | Object3D>, overlay: Overlay);
  sync(changes: WorldChanges, movers: ReadonlyMap<number, Mover>): void;  // adds and removes; a model that resolves after its mover left is released, not added
  update(movers: ReadonlyMap<number, Mover>, dt: number): void;          // web position, rotation.y = angle in radians, motion by state or motion id
  dispose(): void;
}
export class WorldScreen {
  static open(root: HTMLElement, entry: WorldEntry, open: OpenChannel, onEnd: (message: string | undefined) => void): WorldScreen;
  leave(): void;
}
// window.__client: { ready(): Promise<void>; movers(): { objectId: number; name: string; pos: Vec3 }[]; stats(): SessionStats; pause(): void }

// packages/testkit/src/worldScript.ts
export interface WorldScriptOptions {
  playerObjectId: number; worldId: number; pos: Vec3;
  self: ScriptMessage; others: ScriptMessage[];   // ADD_OBJs for the JOIN bundle
  index?: boolean;                                // default true
}
export function createWorldScript(o: WorldScriptOptions): {
  answer(role: 'login' | 'cache', body: Uint8Array): Uint8Array[];  // PRE_JOIN → PRE_JOIN; JOIN → the JOIN bundle; KEEP_ALIVE → nothing
  later(messages: ScriptMessage[]): Uint8Array;                     // a SNAPSHOT bundle to push afterwards
};
```

- **Screen:**
  - loading screen text `Entering the world…`, then the 3D view with the joystick and a `Leave` button;
  - the overlay shows the session's skipped and mismatched counts;
  - each frame: `FixedStepper.advance` steps of `WorldState.step` and `driveOwnMover`, sending `sendMoved` / `sendBehavior` with `act.report(clock.tick())` built from `presuppose(22)`;
  - `WorldStage.focus` at the own mover; chase camera behind it; `MoverViews.update`; name tags drawn as canvas sprites, sized like Neuz's font and faded with `tagOpacity`.

- [ ] **Step 1: Write the failing tests.**
  - `MoverViews`:
    - `adds a view for an added mover`;
    - `releases a model that resolves after its mover was removed`;
    - `a mover without a look gets the placeholder`;
    - `removing a mover releases its textures`.
  - `world.spec.ts` (Chromium and WebKit, `page.routeWebSocket` playing the certifier, login and cache servers with testkit writers, as `lobby.spec.ts` does):
    - `enters Flaris from the character list`: the loading text, then the `Leave` button;
    - `shows a monster and an NPC with name tags`: a picture baseline after `__client.pause()`, `world-flaris-movers.png`, in Chromium only (as the viewer's pictures are);
    - `walking forward sends PLAYERMOVED`;
    - `Leave returns to the login form`;
    - `a dropped cache connection shows the lost text`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/moverViews.test.ts` and `npm run test:e2e:client -- world`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the unit tests, `npm run test:e2e:client -- world --update-snapshots` once to create the baseline, look at the picture, then run again without the flag. Then run `npm test` and `npm run typecheck`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(client): the world screen`.

### Task 19: The live world test

**Files:**
- Create: `apps/client/test/world.live.test.ts`
- Modify: `apps/client/test/live.config.example.json` (a `world` section and its `_comment` line)

**Interfaces:**
- Consumes: `LoginFlow`, `WorldSession`, `WorldState`, `ActionMover`, `openNodeChannel`, `startGateway` (as `lobby.live.test.ts`).
- Config: `world: { accounts: [{ account, password, bankPin }, { account, password, bankPin }] }`. Each account uses its first character; one without a character gets `WebWalk` plus 3 digits created first and deleted at the end. Connections stay 300 ms apart, as in the lobby live test.

- [ ] **Step 1: Write the test:**
  - `two players enter Flaris and see each other`;
  - `the observer sees the walker stop within 1 m of where the walker says it stands`: the walker runs forward for 3 s using `ActionMover`, `driveOwnMover` and `WorldSession.sendMoved`, then stops;
  - `every bundle had a table and no reader mismatched` (`stats.indexed === stats.bundles`, `stats.mismatched === 0`);
  - `both leave and can enter again`.

  It's skipped with the setup text when `live.config.json` has no `world` section.
- [ ] **Step 2: Run** `npm run test:live:world` without a `world` section. Expected: skipped with the text. It runs for real only at the owner checkpoint (Task 20).
- [ ] **Step 3: Commit** `test(client): live world test with two players`.

### Task 20: Docs and the milestone 1 checkpoint (owner, no subagent)

**Files:**
- Modify: `README.md` (the new packages and stage, `test:live:world`, the world screen), `docs/hosting.md` (§6), `docs/device-testing.md` (a "Piece 3, milestone 1" checklist), `server-patches/README.md` (the order of five patches, if not already done in Tasks 7–8)

- [ ] **Step 1: Write the docs.**
  - **Device checklist:** two devices log in and enter Flaris; each sees the other walk; the monsters wander; NPCs stand in town with names; name tags fade past their distance; the overlay's fps and memory meet §3.5's targets on the weakest device; a 10-minute walk where memory returns to within 10%; Leave; a phone put to sleep shows the lost text.
  - **Hosting:** the new exes and the `CacheServer.ini` line in the server steps; the cache route in the gateway config section; the new messages in the troubleshooting table.
- [ ] **Step 2: Commit** `docs: Piece 3 milestone 1 (README, hosting, device checklist)`.
- [ ] **Step 3: Owner checkpoint.** The owner:
  1. swaps in `7. World.exe` and `6. Cache.exe` from `Output\` and adds the `Gateway "127.0.0.1"` line to `CacheServer.ini`, following `server-patches/README.md`;
  2. adds the second throwaway account to `live.config.json`;
  3. runs `npm run test:live:world` (expected: PASS);
  4. runs the device checklist.

  Record the results, including any targets missed, in `docs/conversion-baseline.md`'s style in `docs/device-testing.md`. Milestone 2 starts only after the owner says milestone 1 works.

---

# Milestone 2: collision and tap to walk

### Task 21: Collision shapes in the converter

**Files:**
- Create: `packages/formats/src/web/collisionBin.ts`, `tools/convert/src/models/collisionFiles.ts`
- Modify: `tools/convert/src/models/modelsStage.ts` (writes `collision/<stem>.bin` for each `.o3d` whose `collision` isn't null), `packages/formats/src/index.ts`
- Test: `packages/formats/test/collisionBin.test.ts`, `tools/convert/test/collision.test.ts`, `tools/convert/test/collision.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
// collisionBin.ts: little-endian: u32 triangle count, then 9 f32 per triangle, in the model's own space (D3D, no handedness flip)
export function encodeCollisionBin(triangles: Float32Array): Uint8Array;
export function decodeCollisionBin(bytes: Uint8Array): Float32Array;
export const collisionKey = (stem: string): string => `collision/${stem}.bin`;
```

- [ ] **Step 1: Write the failing tests.**
  - `round trip of two triangles`.
  - `a model with a collision mesh writes collision/<stem>.bin with its triangles`.
  - `a model without one writes nothing`.
  - Corpus: `every collision mesh of the real models converts, with whole triangles`.
- [ ] **Step 2: Run** `npx vitest run packages/formats/test/collisionBin.test.ts tools/convert/test/collision.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS. Then run the models stage on the real client and `npm run test:corpus -- collision`. Expected: PASS; report the file count and total size.
- [ ] **Step 4: Commit** `feat(convert): collision shapes of the models`.

### Task 22: Collision rules

**Files:**
- Create: `apps/client/src/world/sim/collision.ts`
- Modify: `apps/client/src/world/sim/ActionMover.ts`, `apps/client/src/world/sim/moverRules.ts` and `apps/client/src/world/WorldState.ts`: the terrain-only `groundAt` parameter of `step`, `stepMover` and the `WorldState` constructor becomes a `Ground`. Their tests pass a terrain-only `Ground`.
- Test: `apps/client/test/sim/collision.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CollisionObject { triangles: Float32Array; matrix: Float32Array }  // D3D world matrix of the placed object
export interface Ground {
  terrainHeight(x: number, z: number): number | null;
  landAttr(x: number, z: number): number;            // HATTR_* of the patch, 0 when unknown
  objectsNear(x: number, z: number): readonly CollisionObject[];
}
export function processCollision(out: Vec3, pos: Vec3, dir: Vec3, ground: Ground): boolean;   // CWorld::ProcessCollision with slide (WorldIntersect.cpp:498)
export function overHeight(pos: Vec3, ground: Ground): number;                                 // CWorld::GetOverHeight (WorldIntersect.cpp:407)
export function cameraBound(target: Vec3, camera: Vec3, ground: Ground): Vec3;                 // CWorld::CheckBound (World3D.cpp:1658)
// ActionMover.step(ground?: Ground): ProcessCollisionGround (ActionMoverCollision.cpp:127): knee height 0.4, test vector × 6.5,
// HATTR_NOWALK / HATTR_NOMOVE per axis; HATTR_DIE is not acted on (death is Piece 4)
```

- [ ] **Step 1: Write the failing tests** with hand-made shapes:
  - `a wall stops a mover running into it`;
  - `running along a wall at 45 degrees slides`;
  - `a corner stops both ways`;
  - `a mover walks up a bridge and stands on it`;
  - `a no-walk patch stops movement at its edge on that axis only`;
  - `a mover keeps terrain height where no object is`;
  - `the camera is pulled in front of a wall`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/sim/collision.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS, and Tasks 12–13's tests still pass.
- [ ] **Step 4: Commit** `feat(client): collision rules copied from Neuz`.

### Task 23: Collision in the world screen

**Files:**
- Create: `packages/scene/src/world/collision.ts` (loads `collision/<stem>.bin` for a tile's objects with the tile and frees it with the tile)
- Modify: `packages/scene/src/world/tileStreamer.ts` (exposes `tileData(x, y): WebTile | null`), `packages/scene/src/world/WorldStage.ts` (a `ground(): Ground` in D3D terms), `apps/client/src/world/WorldScreen.ts` (passes `ground()` to `WorldState` and the chase camera)
- Test: `packages/scene/test/collision.test.ts`, `apps/client/e2e/world.spec.ts`

**Interfaces:**
- Consumes: `Ground` (Task 22), `collisionKey` and `decodeCollisionBin` (Task 21).

- [ ] **Step 1: Write the failing tests.**
  - `loads the shapes of a tile's objects and frees them with the tile`.
  - `objectsNear returns the shapes of the tiles around the point`.
  - `landAttr reads the patch`.
  - e2e: `walking into a Flaris wall stops the player`. The script places the player in front of a known building and checks `__client.movers()` after 2 s of `forward`.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/collision.test.ts` and `npm run test:e2e:client -- world`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS. The viewer's e2e and the `world-flaris-movers.png` baseline are unchanged.
- [ ] **Step 4: Commit** `feat(client): collision with buildings, fences and no-walk ground`.

### Task 24: Tap to walk

**Files:**
- Modify: `apps/client/src/world/controls.ts` (`TapToWalk`), `apps/client/src/world/WorldScreen.ts`
- Test: `apps/client/test/controls.test.ts`, `apps/client/e2e/world.spec.ts`

**Interfaces:**
- Produces:

```ts
export class TapToWalk {
  constructor(canvas: HTMLElement, pick: (ndcX: number, ndcY: number) => Vec3 | null);  // D3D point on terrain or an object, or null
  take(): Vec3 | null;   // the newest destination since the last call
  dispose(): void;
}
// WorldScreen: a destination → setDestPos(self, pos, true), WorldSession.sendDestPos(pos, true), a ring marker;
// any key or joystick input → the destination is cleared, as WndWorldControlPlayer.cpp:550 does
```

- [ ] **Step 1: Write the failing tests.**
  - `a tap gives the picked point`; `a drag is not a tap` (moved more than 8 px or held longer than 300 ms); `a tap on a mover gives nothing`.
  - e2e: `clicking the ground sends DESTPOS and the player walks there`; `pressing forward cancels it`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/controls.test.ts` and `npm run test:e2e:client -- world`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run again. Expected: PASS.
- [ ] **Step 4: Commit** `feat(client): tap or click the ground to walk there`.

### Task 25: Docs and the milestone 2 checkpoint (owner, no subagent)

**Files:**
- Modify: `docs/device-testing.md` (a "Piece 3, milestone 2" checklist), `README.md`

- [ ] **Step 1: Write the checklist:** walk into buildings and fences in Flaris (you slide along them); walk over a bridge and up stairs; tap to walk across the square; the joystick cancels a tap; the camera stays out of buildings; a second device watches all of it.
- [ ] **Step 2: Run** `npm test`, `npm run typecheck`, `npm run test:corpus`, `npm run test:e2e`, `npm run test:e2e:client` and the C++ test scripts. Expected: all PASS.
- [ ] **Step 3: Commit** `docs: Piece 3 milestone 2 device checklist`.
- [ ] **Step 4: Owner checkpoint.** The owner runs `npm run test:live:world` and the milestone 2 checklist. Record the results in `docs/device-testing.md` and commit. Nothing is pushed unless the owner asks.

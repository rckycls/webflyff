# FlyFF Web Client — Piece 3: Enter the World — Design Spec

**Date:** 2026-10-23
**Status:** Draft for review
**Builds on:**
- the Piece 2 spec, `docs/superpowers/specs/2026-10-22-piece2-gateway-protocol-design.md`: section 1 (browser-only, the roadmap), section 4 (gateway, lobby) and section 5 (the certifier change, whose point 5 promises the cache-server change made here);
- the public launch limits spec, `docs/superpowers/specs/2026-10-22-public-launch-limits-design.md`;
- the Piece 1 spec, `docs/superpowers/specs/2026-10-16-flyff-web-client-design.md` in the bakbak-flyff repository: the viewer, its targets (section 7) and error rules (section 8).

C++ paths are relative to the server folder (`Blouflash VS22 V15/`), which holds `Source/`, `Program/`, `Output/`, `Client/` and `FlyffWeb/`.

---

## 1. Brief

- **Goal:** from the lobby's character list, a player enters the world in the browser. They see the map around their character, other players, monsters and NPCs with name tags, and walk with the keys or the on-screen joystick. A second browser player sees the movement.
- **Two milestones, one spec and one plan:**
  1. **In the world:** entering and leaving, the map, players, monsters and NPCs, name tags, and walking with the keys or joystick. It ends with a device test on the owner's phones.
  2. **Collision and tap to walk:** buildings, fences and "no walking" ground block movement, characters stand on bridges and stairs, and tapping (or clicking) the ground walks there. It ends with a second device test.
- **Chosen approach: a table of contents on the world server's bundled packets** (section 3.3). Two alternatives were rejected:
  - *Reading every message perfectly, with no world-server change:* about 300 message types, plus the player's own full character data. One mistake scrambles the rest of a packet with nothing to show where, and without a Neuz recording there's nothing to check the readers against.
  - *Reading the known messages and dropping the rest of a packet at the first unknown one:* things get lost silently, such as a monster that never disappears or a player who freezes.
- **Decisions by the owner (2026-10-23):**
  - Piece 3 also covers NPCs, name tags, building collision and tap to walk.
  - It is one piece built in two milestones (above).
  - Approach: the table of contents.
  - **No Neuz recording:** the owner's laptop can't run the servers and Neuz together. The readers are checked against the C++ code, the table of contents and live tests instead (section 5). This also leaves Piece 2's login recording unmade; its tests keep skipping.

---

## 2. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| Build flags | Only the top of each `VersionCommon.h` and its `__MAINSERVER` section count: these builds define `__MAINSERVER`.<br>• Neuz and world server: `__MAP_SECURITY`, `__ENVIRONMENT_EFFECT`, `__S_SERVER_UNIFY`, `__BUFF_1107`, `__SYNC_1217`, `__RT_1025`.<br>• World server only: `__X15`, `__LAYER_1015`.<br>• Defined only in the internal-server section, so **off**: `__IAOBJ0622` and `__BS_ADJUST_COLLISION`. | `Source/Neuz/VersionCommon.h` (sections from line 261), `Source/WORLDSERVER/VersionCommon.h` (sections from line 238) |
| Character select | Neuz connects to the cache server at the address from the login server's CACHE_ADDR, port 5400. One second later (`m_timerConnect`) it sends PRE_JOIN and allows 15 s for the answer. | `Source/_Interface/WndTitle.cpp:1935-1980,2087-2165`, `Source/LOGINSERVER/DPLoginSrvr.cpp:116` |
| Second password at join | Off: `IDS_2ND_PASSWORD` is `"0"` in Neuz and in the login server. So the login server passes PRE_JOIN straight to the core, and the secret number Neuz sends (0) is never read. | `Source/Neuz/WinMain.rc:1837`, `Source/LOGINSERVER/LoginServer.rc:114`, `Source/LOGINSERVER/DPLoginSrvr.cpp:195-250` |
| PRE_JOIN | Sent to the login server: `DPID_UNKNOWN`, type, account, player ID (u32), character name, secret number (i32). The answer is a PRE_JOIN with no fields. Neuz then sends JOIN and allows 25 s for the answer. | `Source/Neuz/DPLoginClient.cpp:187-223` |
| JOIN | Sent on the cache connection: `DPID_UNKNOWN`, type, world ID, player ID, auth key, party ID, guild ID, war ID, channel ID, slot (u8), name, account, password hash, then the slot's messenger (`CRTMessenger::Serialize`). The channel ID (`m_uIdofMulti`) is the picked channel's `dwID`; the password is the MD5 hash. | `Source/Neuz/DPClient.cpp:9089-9131`, `Source/_Interface/WndTitle.cpp:1015`, `Source/Neuz/Neuz.cpp:1189` |
| Cache server | It passes packets it doesn't handle to the player's world server, but only after JOIN; before that they're dropped. The player's address is the connection's socket address (the gateway's, for every browser player). The cache server sends it to the core, which passes it on to the world server. | `Source/CACHESERVER/DPCacheSrvr.cpp:71-149,151-171`, `Source/CACHESERVER/DPClient.cpp:264-274`, `Source/CACHESERVER/Player.h:35`, `Source/CACHESERVER/DPCoreClient.cpp:101-115`, `Source/WORLDSERVER/DPSrvr.cpp:640-682` |
| Keep-alive | The cache server sends KEEP_ALIVE and drops a player who doesn't answer. Neuz answers with an empty KEEP_ALIVE. | `Source/CACHESERVER/Player.cpp:136-166`, `Source/Neuz/DPClient.cpp:961-968` |
| Connections while playing | Neuz keeps the login-server connection, and its pings, open in the world. If the login server drops, Neuz closes the world connection too and says so. Logging out closes everything and returns to the login screen. | `Source/Neuz/DPLoginClient.cpp:56-81`, `Source/_Interface/WndManager.cpp:2071-2127` |
| Clock | The login server's QUERYTICKCOUNT answer starts `g_TickCount`. Movement packets carry it as `__int64`. | `Source/Neuz/DPLoginClient.cpp:104-115`, `Source/_Network/Misc/Include/tickcount.h` |
| Bundles | JOIN and SNAPSHOT both carry: the player's object ID, a count (i16), then that many messages, each an object ID (u32), a type (u16) and fields, with **no length**. Neuz asserts on a type it doesn't know, and the read position is lost for the rest of the packet. Neuz reads nothing after the last counted message. | `Source/Neuz/DPClient.cpp:366-887,897-960` |
| How the world server bundles | `CSnapshot` holds `CAr ar` and `short cb`. Every message is written right after `m_Snapshot.cb++` (277 places: 273 in `User.cpp`, 4 in `UserLux.cpp`), or by `CUser::AddBlock` and `CUser::AddHdr`, each adding one message. Only `CUser::Notify` sends JOIN and SNAPSHOT: it writes `cb` into the header, sends, sets the type to SNAPSHOT and rewinds to the header. | `Source/WORLDSERVER/Snapshot.h`, `Source/WORLDSERVER/Snapshot.cpp:20-26`, `Source/WORLDSERVER/User.cpp:585-607,646-661` |
| The first bundle | `CUser::Open` makes JOIN the type of the first bundle, then adds: the environment setting, WORLD_READINFO (world ID and position), ADD_OBJ of the player itself, the game timer, the task bar, the environment, friends, party name, guilds, events, lord and couple. | `Source/WORLDSERVER/User.cpp:308-349` |
| ADD_OBJ | `CMover::Serialize`, written after the object type and index:<br>• the player's own character (`METHOD_NONE`): stats, quests, skills, inventory, 3 banks, pocket and more;<br>• other players (`METHOD_EXCLUDE_ITEM`): title, worn parts with their item IDs, pet;<br>• NPCs and monsters: hair, head, character key, worn parts, attack and move flags, speed factor;<br>• then, for every mover, its buffs. | `Source/WORLDSERVER/User.cpp:664`, `Source/_Common/ObjSerializeOpt.cpp:97-360` |
| Map security | For each map tile it loads, Neuz sends a key made from the tile's file (MAP_KEY). The world server checks only keys it receives, so not sending any is accepted. | `Source/_Common/worldmng.cpp:713-800` |
| Own movement | Neuz sends PLAYERMOVED when a move or turn state changes, and PLAYERBEHAVIOR for a walk/run switch or a jump. The position it sends is predicted `MAX_CORR_SIZE_45` frames ahead: 22 frames on the client, at 60 frames a second. | `Source/_Interface/WndWorldControlPlayer.cpp:450-560`, `Source/Neuz/DPClient.cpp:10081-10140`, `Source/_AIInterface/ActionMover.h:52-58`, `Source/_Common/timer.h:133` |
| Server trust | The world server ignores a move more than 1000 units from its own copy of the player. Otherwise it accepts it and relays MOVERMOVED to the others. There's no speed or wall check. | `Source/WORLDSERVER/DPSrvr.cpp:12496-12572` |
| Others' movement | Neuz works out how late a move is from the clock (in frames, minus 35). Late by 22 frames or more: the mover is set there at once. Otherwise it is moved to the predicted point over the remaining frames, then continues in the given state. | `Source/Neuz/DPClient.cpp:8561-8719` |
| Tap to walk | The client sends a SNAPSHOT of its own: a count (u8), then DESTPOS with the position and a forward flag; there's no `objidIAObj` in this build. The world server walks the player there and relays SETDESTPOS. | `Source/Neuz/DPClient.cpp:11187-11225`, `Source/WORLDSERVER/DPSrvr.cpp:2226-2300` |
| Speed | The mover's speed, times its speed factor, changed by speed buffs (`DST_SPEED`). | `Source/_Common/MoverParam.cpp:3248-3290` |
| Collision | Neuz tests movement at knee height (0.4) against objects' collision meshes and slides along them (`CWorld::ProcessCollision`, test vector times 6.5). Patches marked `HATTR_NOWALK` or `HATTR_NOMOVE` block. The height comes from objects and terrain (`GetOverHeight`). Models without a collision mesh don't collide. The camera is kept out of objects (`CheckBound`). | `Source/_AIInterface/ActionMoverCollision.cpp:127-390`, `Source/_Common/WorldIntersect.cpp:356-560`, `Source/_Common/ModelObject.h:394`, `Source/_Common/Object3D.h:224`, `Source/_Common/World3D.cpp:1658` |
| Game data | Loaders for: movers (`propMover.txt`), items (`propItem.txt`), NPCs (`character.inc`) and model names with motion lists (`mdlDyna.inc`). Neuz's name tags are drawn by `CMover::RenderName`. The files are in the client's resource packs (`Client/data.res` and others). | `Source/_Common/ProjectCmn.cpp:112,300`, `Source/_Common/Project.cpp:2886`, `Source/_Common/ModelMng.cpp:63,314`, `Source/_Common/MoverRender.cpp:1219` |
| FlyffWeb today | • The gateway already has the route role `cache`, but sends the address packet only on certifier routes.<br>• The converter reads `mdlObj.inc` and `mdlDyna.inc` only for world objects.<br>• The viewer's walking and running speeds are guesses.<br>• `packages/protocol/test/fixtures/` doesn't exist. | `apps/gateway/src/relay.ts:156`, `tools/convert/src/world/convertWorld.ts`, `apps/viewer/src/world/player.ts:8-9` |

---

## 3. Design

### 3.1 Parts

| Part | Runs in | Contents |
|---|---|---|
| `packages/scene` (new) | browser | The viewer's reusable 3D code, moved here without change of behaviour: asset store, loaders and texture cache, map tile streaming and height sampling, world objects, character assembly and motions, lighting, sky and fog, keyboard and joystick, and the measurement overlay with its error handlers. `apps/viewer` keeps its pages (character, world, compare) on top of it, and its picture tests pass unchanged. |
| `packages/protocol` | browser and Node | • `login.ts` gets PRE_JOIN.<br>• New `world.ts`: JOIN, KEEP_ALIVE, PLAYERMOVED, PLAYERBEHAVIOR and the client's DESTPOS SNAPSHOT.<br>• New `bundle.ts`: reads JOIN and SNAPSHOT with the table of contents (section 3.3).<br>• New `world/` folder: one reader per message type of section 3.4.<br>Each module names the C++ function it copies, as before. |
| `packages/formats` | browser and Node | Readers for `propMover.txt`, `propItem.txt` and `character.inc`. `readModelIndex` also keeps motion lists. The `.o3d` reader already returns the collision mesh (`collision`), which the converter now uses. |
| `tools/convert` | Node | • A new **game data** stage writes `data/movers.json`, `data/items.json` and `data/npcs.json` (section 3.5).<br>• In milestone 2, the model stage also writes one `collision/<model>.bin` per model that has a collision mesh.<br>All of them are hashed and listed in `index.json` like the other outputs. |
| `apps/client` | browser | • The character list gets an **Enter** button.<br>• `src/world/` holds:<br>&nbsp;&nbsp;– `WorldSession`: the state machine of the login-server and cache connections while entering and playing, built like `LoginFlow` (injected channels and clock, events, no DOM);<br>&nbsp;&nbsp;– the list of movers in view;<br>&nbsp;&nbsp;– the movement rules (section 3.6), in plain TypeScript with no drawing, testable in Node;<br>&nbsp;&nbsp;– the world screen: loading screen, 3D view, name tags, joystick, **Leave** button, overlay.<br>• The lobby hands its session (channels, account, password hash, auth key, the chosen character and channel, the clock) to `WorldSession`. |
| `apps/gateway` | Node | Sends the address packet on cache routes too (section 3.3). |
| `packages/testkit` | Node | A pretend cache and world server: it answers JOIN and plays scripted bundles, with or without a table of contents. |
| `server-patches/` | — | `cache-client-addr.patch` and `world-snapshot-index.patch`, each with a `README.md` section in the existing style. The C++ test program gets their tests. |

### 3.2 Entering, playing, leaving

1. **Enter.** The player taps **Enter** on a character, and a loading screen opens. The lobby's login-server connection stays open and keeps its 10-second PING.
2. **Cache connection.** The browser opens `<cache address>:5400` through the gateway. The cache address is the one in the login server's CACHE_ADDR, which the lobby now keeps. The gateway sends the address packet first. As Neuz does, the browser waits 1 s after the connection opens.
3. **PRE_JOIN** to the login server: the account, the character's player ID and name, and secret number 0. The answer has 15 s.
4. **JOIN** to the cache server: from the character list entry, the world ID, player ID, party, guild and war IDs, the slot and name; from the session, the auth key, the channel ID, the account and password hash; and the slot's messenger from PLAYER_LIST. The answer has 25 s.
5. **The JOIN bundle** gives the world and position (WORLD_READINFO) and the player's own character (ADD_OBJ). The browser loads the world's manifest, the tiles under the player and the models of the movers in view. Then it shows the world.
   - Bundles that arrive while it loads are applied to the mover list straight away and drawn once the world shows.
   - A character saved in any converted world loads that world.
6. **While playing:**
   - The browser answers every KEEP_ALIVE.
   - It sends no MAP_KEY.
   - A SETPOS of the player (same world) moves them, and the map streams the new area.
   - A move to another world (REPLACE, as a packet or as a message) ends the session with "Moving to another map isn't supported yet."
7. **Leave** closes the cache and login-server connections and returns to the login form, as Neuz does after logging out. The world server saves the character when the cache server reports the closed connection.
8. **Either connection closing** while entering or playing ends the session: "The connection to the game was lost." (or the step's own message, section 4). The player returns to the login form. There's no automatic reconnect (Piece 6).

### 3.3 Server changes and the table of contents

**Cache server (`cache-client-addr.patch`):**
- **Config:** `CacheServer.ini` takes up to 8 `Gateway "a.b.c.d"` lines, read by its `Script` with the certifier's rules for a dotted IPv4 address.
- **Packet:** the certifier's `PACKETTYPE_GATEWAY_CLIENT_ADDR` (`0xE0`, a `CAr` string). The cache server accepts it only when all three hold:
  - the connection's socket address is a listed gateway;
  - the connection hasn't sent JOIN yet;
  - the string parses as a dotted IPv4 address of at most 15 characters.
- Otherwise the packet is ignored with an error-log line.
- **Effect:** the address is kept with that connection's `CPlayer`. `CPlayer::SetAddr` uses it instead of the socket address, so the core server (its GM IP lookup) and the world server (`m_playAccount.lpAddr`) get the player's real address.
- **Order:** the patch goes after the three existing patches, because it needs the packet number that `certifier-client-addr.patch` adds to `MsgHdr.h`.
- **Unpatched cache server:** it drops the packet, because it arrives before JOIN.

**World server (`world-snapshot-index.patch`):**
- **The counter becomes a small class.** `CSnapshot::cb` changes from `short` to a class that behaves like the `short` it replaces (assignment, comparison, writing into `CAr` and into the header). On `++` it also records `ar.GetOffset()` as the start of a new message. None of the 277 places changes.
- **Clearing:** `SetSnapshot`, `Flush` and `CUser::Notify` (after sending) clear the recorded starts together with the count.
- **The trailer.** Before sending, `CUser::Notify` appends, after the last message:

  | Field | Type | Value |
  |---|---|---|
  | starts | u32 × count | each message's start, counted from the first byte after the bundle's count field |
  | count | u16 | the bundle's count again |
  | marker | u32 | `0x31434F54` (the bytes `T`, `O`, `C`, `1`) |

  The trailer is removed again by the existing rewind. A bundle grows by 4 bytes per message plus 6.
- **Neuz** reads only the counted messages and nothing after them in JOIN or SNAPSHOT, so it ignores the trailer. There's no switch: undo means swapping the old `World.exe` back.
- **Site scan:** a script (`server-patches/tests/`) lists every `m_Snapshot.cb++` and fails if any `m_Snapshot.ar` write for that message comes before it.

**How the browser uses it (`bundle.ts`):**
- A bundle's table is valid when:
  - the body ends with the marker;
  - the trailer's count equals the header's;
  - the first start is 0;
  - the starts rise by at least 6 (an object ID and a type);
  - the last start is at least 6 bytes before the trailer.
- Message *i* is the bytes from its start to the next one; the last one ends where the trailer begins.
- **Without a valid table** (the old `World.exe`), messages are read in order until the first unknown type. The rest of the bundle is dropped with a console warning naming that type.

**Gateway:** `sendClientAddr` now covers cache routes as well as certifier routes: the address packet is the first packet on both. Nothing else in the gateway changes.

**Delivery:**
- **Applied and built here:** the patches are applied in `Source/` and saved in `server-patches/`. `CacheServer.vcxproj` and `WorldServer.vcxproj` are built with VS 2022 MSBuild (Release, Win32) into `Output\`; nothing is written to `Program\`.
- **The owner:** confirms that `Source\` matches what is running, swaps in `6. Cache.exe` and `7. World.exe`, adds the `Gateway "127.0.0.1"` line to `CacheServer.ini`, and restarts both servers, following `server-patches/README.md`.

### 3.4 Packets in Piece 3

- **Browser to login server:** PRE_JOIN (new). PING continues.
- **Browser to cache server:** JOIN, KEEP_ALIVE, PLAYERMOVED, PLAYERBEHAVIOR; in milestone 2 also the client SNAPSHOT with DESTPOS.
- **Login server to browser:** PRE_JOIN and ERROR, plus the Piece 2 packets.
- **Cache server to browser:** JOIN and SNAPSHOT (bundles), KEEP_ALIVE, ERROR, REPLACE. Every other packet type is ignored and logged to the console once per type.
- **Messages read inside bundles:**
  - Each reader copies the Neuz handler named in its module and must end exactly at its message's end in the table.
  - ADD_OBJ of the player's own character is read **as far as Piece 3 needs**: position, look, name, level, mode, worn parts. Its reader must not run past the message's end. The rest (inventory, banks, quests, skills) comes with Piece 5.
  - Messages read: ADD_OBJ (movers only; items and controls are skipped), DEL_OBJ, WORLD_READINFO, MOVERMOVED, MOVERBEHAVIOR, MOVERANGLE, DESTPOS, DESTANGLE, MOVERSETDESTOBJ, MOTION, SETPOS, SETPOSANGLE, REPLACE.
  - Every other message is skipped and counted.

### 3.5 What the world screen shows

**Movers in view:**
- The server adds and removes them; the browser shows what it's told.
- **Players** are assembled as in the viewer: body from sex and skin set, head and hair meshes, hair colour, and the worn head, body, hand and foot parts from their item IDs.
- **Monsters** get their own model, motions and the scale the server sends.
- **NPCs** get their model, plus hair, head and worn parts for human NPCs.
- Items on the ground and controls (chests and the like) aren't shown yet.

**Name tags:**
- Above every mover, the player's own included, drawn in the 3D view at head height.
- Text and colours follow `CMover::RenderName`.
- Tags show as far as Neuz shows them (`CWorld::Render`, `Source/_Common/World3D.cpp:1265-1300`): 40 m from the camera for monsters and NPCs that aren't peaceful, 100 m for players and peaceful NPCs. Tags of transparent movers (GM invisibility) aren't drawn. Unlike Neuz's hard cut, they fade out over their last 10 m, so a busy town stays readable on a phone. The distances can be changed at the milestone 1 device test.

**Motions:**
- Standing, walking and running follow each mover's state.
- A MOTION message plays the named motion when that model has it, otherwise the standing one.

**Game data** (the converter's new stage, read from the client's resource packs with the C++ loaders' rules):
- `data/movers.json`: per mover index, the model and skeleton, motion files by motion ID, speed, and English name.
- `data/items.json`: per item ID with a worn model, the part model for each sex, named as `CModelMng::MakeModelName` builds it.
- `data/npcs.json`: per character key, the name and look from `character.inc`.
- `data/nameColors.json`: the player name colours `CMover::RenderName` takes from `PKSetting.inc` (normal, chaotic, PK-ready).

The browser loads models and motions on demand and caches them, as the viewer does.

**Light, sky and fog:** Piece 1's noon light. Day and night from the game timer come later.

**Targets (Piece 1's, pass/fail on the weakest test device):**
- at least 30 fps in Flaris with about 20 monsters and 5 players in view;
- at most about 400 MB of JS heap plus estimated GPU memory;
- after a 10-minute walk, memory within 10% of the start.

If the weakest device misses them, the fixes are a shorter view distance for movers and fewer far-away model details, decided at the milestone 1 device test.

### 3.6 Movement

- **Rules:** copied from `CActionMover` and `CMover` for ground movement: standing; forward and backward; turning left and right; walk and run; walking to a point (`SetDestPos`); following an object to a range (`SetDestObj`). They run in fixed steps, 60 a second as in Neuz, independent of the drawing frame rate. Speeds come from `data/movers.json` and the speed factor that ADD_OBJ sends for NPCs and monsters, combined as `CMover::GetSpeed` does, without buffs. They replace the viewer's guessed speeds.
- **Own movement:**
  - Keys and the joystick produce Neuz's keyboard states: forward, back, turn left or right, stop, walk or run. A gentle joystick push walks and a full push runs.
  - A changed move or turn state sends PLAYERMOVED with the position predicted 22 steps ahead (`PresupposePos`). A walk/run switch sends PLAYERBEHAVIOR. Nothing is sent between changes.
  - Every move carries the shared clock started from the login server.
- **Others:**
  - MOVERMOVED and MOVERBEHAVIOR are handled as in `CDPClient::OnMoverMoved`: late by 22 steps or more, the mover is set at once; otherwise it moves to the predicted point over the remaining steps, then continues in the given state.
  - DESTPOS walks to a point; MOVERSETDESTOBJ follows an object.
  - MOVERANGLE and DESTANGLE turn; SETPOS and SETPOSANGLE place at once.
- **Height:** milestone 1 uses the terrain height, as the viewer does. Milestone 2 adds objects (section 3.7).
- **Not in Piece 3:** jumping (others who jump play the motion in place), flying (others seen flying stay at their last ground position), and speed buffs (others are corrected at their next message).

### 3.7 Milestone 2: collision and tap to walk

**Collision** (copied from `CActionMover::ProcessCollisionGround` and the `CWorld` functions it calls):
- Movement is tested at knee height against the collision meshes of objects in the tiles around the mover, with the slide along surfaces.
- `HATTR_NOWALK` and `HATTR_NOMOVE` patches stop movement at their edge (the tile files already carry the attributes). `HATTR_DIE` isn't acted on: death is Piece 4.
- Height comes from objects and terrain together (`GetOverHeight`), so movers stand on bridges and stairs.
- The same rules apply to every mover the browser moves.
- The chase camera keeps out of objects as `CWorld::CheckBound` does.
- Collision shapes load with their tile's objects and are freed with them.

**Tap to walk:**
- A tap on the ground (a left click on a PC) sets a destination where the pointer ray meets terrain or an object. The player walks there with the walk-to-a-point rules and collision, and a small marker shows the spot.
- The browser sends the client SNAPSHOT with DESTPOS (position, forward flag) when the destination is set, as `CDPClient::SendSnapshot` does.
- A tap on a mover does nothing yet: targeting is Piece 4 and talking is Piece 5.
- Keys or the joystick cancel the destination at once, as in Neuz.

---

## 4. Error handling

**Every ending returns to the login form with a message:**
- The gateway's close codes use the lobby's texts.
- No answer to PRE_JOIN in 15 s or to JOIN in 25 s: "The server did not answer in time."
- An ERROR from the login server or the cache server uses the lobby's error texts.
- The cache connection closing while JOIN is awaited: "The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again." The world server closes both sessions when it finds the character already in the world (`CDPSrvr::OnAddUser`), and sends nothing that says why.
- A REPLACE to another world: "Moving to another map isn't supported yet."
- A connection that closes while playing: "The connection to the game was lost."

**Bad data:**
- **A reader that doesn't end at its table entry:** the message is skipped, the console names its type once per session, and the overlay counts it.
- **Unknown messages:** skipped and counted on the overlay.
- **A broken bundle header or trailer, or a top-level packet a reader rejects:** the session ends with the lobby's "bad data from the server" text (close code 4005's message).

**Missing assets** (Piece 1's rules):
- a broken texture shows a pink checkerboard;
- a missing tile shows flat ground;
- downloads retry three times.

A mover whose model is missing is shown as a simple placeholder figure with its name tag. Errors are listed on the overlay, never as a blank screen.

---

## 5. Testing

- **Unit tests (Vitest):**
  - **Packet readers and writers,** built byte by byte from the named C++ functions (no recording exists): PRE_JOIN, JOIN, KEEP_ALIVE, PLAYERMOVED, PLAYERBEHAVIOR, DESTPOS, and each message of section 3.4.
  - **`bundle.ts`:** a valid table; each broken-table case; no table; a reader that ends early or late.
  - **Movement rules:** against positions worked out by hand from the C++ (a mover walking, running, turning and walking to a point for a number of steps; `PresupposePos`; the late and on-time correction cases).
  - **Collision,** against small hand-made shapes: a wall, a corner, a slope, a bridge, a "no walking" patch.
  - **`WorldSession`,** with fake channels and a fake clock: the enter order, the 1 s pause, both timeouts, each error, KEEP_ALIVE answers, both connections closing, Leave.
- **Corpus tests:** the game-data readers over the real client files, with zero failures and every byte read; every collision mesh of the real models.
- **C++ test program** (`server-patches/tests/`):
  - the table of contents (starts recorded, trailer layout, cleared after sending);
  - the cache server's address rules (listed gateway only, before JOIN only, valid IPv4 only);
  - the site scan.
- **Gateway tests:** the address packet comes first on cache routes, and is never sent with `sendClientAddr` off.
- **Client tests against the pretend world server** (`packages/testkit`): entering, players and monsters appearing, moving and leaving, a skipped unknown message, Leave.
- **Picture tests (Playwright):**
  - a scripted Flaris scene from the pretend server (a player, a monster and an NPC with name tags) gets new baselines;
  - the viewer's existing baselines stay identical after the move to `packages/scene`.
- **Live test** (`npm run test:live:world`, not part of `npm test`): with the servers running and two throwaway accounts in `live.config.json`:
  - both enter Flaris;
  - one walks a fixed route, and the other's session must see it stop within 1 m of where the walker's own session puts it;
  - every bundle during the run must have a valid table and zero reader mismatches;
  - both leave, and both can enter again.
  - **The owner provides a second throwaway account.**
- **Devices:** a Piece 3 section in `docs/device-testing.md` with one checklist per milestone:
  - two devices in Flaris seeing each other, the monsters and the NPCs, with name tags;
  - the overlay's frame rate and memory against section 3.5's targets;
  - a 10-minute walk;
  - for milestone 2, walking into buildings and fences, over a bridge, and tapping to walk across the square.

---

## 6. Docs

- **`server-patches/README.md`:** a section per new patch (why, what changes, apply, build, put in service, undo), the order of all five patches, and the `CacheServer.ini` line.
- **`docs/hosting.md`:**
  - the new exes and the `CacheServer.ini` line in the server steps;
  - cache routes in the gateway config section;
  - the new messages in the troubleshooting table.
- **`docs/device-testing.md`:** the Piece 3 checklists (section 5).
- **`README.md`:** the new packages and stages, `npm run test:live:world`, and the client's world screen.

---

## 7. Done criteria

**Milestone 1:**
1. On a phone over Wi-Fi and on desktop Chrome, a player enters Flaris from the lobby, walks with the joystick or the keys, sees other players, monsters and NPCs with name tags, and leaves. A second browser player sees the movement.
2. Section 3.5's targets are met on the weakest test device.
3. `npm test`, `npm run typecheck`, the corpus tests, the picture tests and the C++ test program pass. The live test passes against the servers with the new exes.

**Milestone 2:**

4. Buildings, fences and "no walking" ground block movement; bridges and stairs are walkable; the camera stays out of buildings; tapping or clicking the ground walks there. All of it is checked on the devices.
5. The same test suites pass, with the collision tests.

**Both:**

6. The two patches are in `server-patches/` and applied in `Source/`. `CacheServer.exe` and `WorldServer.exe` build into `Output\`, and `Program\` is untouched.
7. The docs of section 6 are updated.
8. Everything is committed in `FlyffWeb` on the branch `piece3-world`, started from `origin/main`. Nothing is pushed unless the owner asks.

---

## 8. Out of scope

- Moving to another world while playing, death and revival, targeting and combat, skills and buffs (including their speed changes): Piece 4.
- Chat, inventory, shops, talking to NPCs: Piece 5.
- Items on the ground, chests, weapons in hand, cloaks, masks, pets.
- Jumping, flying, swimming effects.
- Day and night, weather, sound and music.
- Automatic reconnect, and the touch-controls pass: Piece 6.
- A Neuz recording of any session.
- Swapping the exes into `Program\`, which the owner does.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A write site records its start in the wrong place, so one message's boundary is off | The site scan; the C++ test; every reader is checked against its boundary in live traffic, and mismatches name the type. An off boundary shows as mismatches on the messages next to it. |
| The browser moves characters differently from Neuz, and with no Neuz to compare side by side, nobody notices | The rules are copied line by line from the C++ with tests on worked-out positions; the live test compares two browser sessions; the device checklist walks fixed routes. A side-by-side check with Neuz can be added whenever a PC runs both. |
| Phones struggle with many characters in view | The targets are measured at the milestone 1 device test; mover view distance and far-away detail are adjustable. |
| The rebuilt `World.exe` and `Cache.exe` pick up other unsaved changes in `Source/` | The owner confirms `Source/` matches what is running before swapping; the patch files record exactly what Piece 3 changed. |
| The world server trusts the client's position, so a modified browser can move anywhere within 1000 units | Unchanged from Neuz; out of scope here. |
| Phones keep two WebSockets open while playing (login server and cache server) and drop them in the background | Any drop returns to the login form with a message; reconnecting comes with Piece 6. |
| The pretend world server's scripts drift from the real server | The live test runs the real servers with the same readers; the scripts are built with the same writers as the readers' tests. |

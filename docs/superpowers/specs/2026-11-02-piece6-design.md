# FlyFF Web Client — Piece 6: Blocked-Attack Fix, World Map, Sound, Reconnect, App, Performance — Design Spec

**Date:** 2026-11-02
**Status:** Draft for review
**Replaces:** the proposed Piece 6 draft of 2026-11-01 (`2026-11-01-piece6-design.md` and its plan
`plans/2026-11-01-piece6-classic-v15.md`), which the owner never approved. This spec keeps that draft's four features,
adds the owner's 2026-11-02 choices, and adds a bug fix (M0) and performance (M5).
**Builds on:**
- the Piece 5 spec, `2026-10-29-piece5-design.md`: controls, items, chat, NPCs, travel and the minimap, all merged into
  `main` (a84fe29);
- the roadmap in the Piece 1 spec (`Blouflash VS22 V15/docs/superpowers/specs/2026-10-16-flyff-web-client-design.md`):
  §4 "Mobile polish + launch" and the targets in §7.

**Research:** `2026-11-01-piece6-v15-research.md` (cited as `[R §n]`). It is a first survey: each milestone's plan opens
with a task that traces the C++ for that milestone and adds the exact `file:line` facts there. C++ paths are relative to
`Blouflash VS22 V15/`. FlyffWeb paths are relative to the FlyffWeb repository.

---

## 1. Brief

- **Goal:** fix the disconnect the owner found, then finish the roadmap's last client piece:
  - the world map;
  - the game's own music and sound;
  - getting back into the game after a dropped connection;
  - adding the game to a phone's home screen;
  - reaching the roadmap's speed and memory targets on the weakest test device.
- **Six milestones, one spec, one plan per milestone.** Each plan is written just before its milestone starts. Each
  milestone ends with the owner's checkpoint.

  | # | Milestone | What the player gets |
  |---|---|---|
  | M0 | Blocked-attack fix | Attacking a monster behind a fence or wall no longer disconnects. |
  | M1 | World map | The classic V15 world map on M and in the Start menu. |
  | M2 | Music and sound | The game's music by world and region, sound effects, and a Sound window. |
  | M3 | Reconnect | After a dropped connection, one tap logs back in to the same character. |
  | M4 | Installable app | Add to home screen on Android and iPhone, with the game's icon, in landscape. **Skipped by the owner on 2026-11-03.** |
  | M5 | Performance and memory | At least 30 fps and at most about 400 MB on the weakest phone, with no memory leak. |

- **No server change.** Every packet the browser sends is one Neuz sends. The servers in `Program\` and in the owner's
  test VM stay as they are. The gateway's limits stay as they are.
- **Decisions by the owner (2026-11-02):**
  - **Scope:** the 2026-11-01 draft's four features plus performance and memory tuning. The public release stays a
    separate decision of the owner's.
  - **Blocked attack:** when the way to the target is blocked, the character keeps trying, as in Neuz, but asks the
    server at most 10 times a second.
  - **Reconnect:** a one-tap button, no automatic retries.
- **Decisions carried from earlier pieces:**
  - no fullscreen;
  - automated browser tests in Chromium only (desktop and a landscape phone), with iPhone and iPad checked by hand;
  - builders run only the quick checks, and the owner runs the full suites, the live tests and the device checks at each
    checkpoint;
  - no Neuz recording and no Neuz beside the servers.

---

## 2. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| Gateway limit | The relay closes a connection with 4004 after more than 100 packets in one sliding second. The client shows "Too much data was sent." | `apps/gateway/src/config.ts:31`, `apps/gateway/src/relay.ts:107`, `apps/client/src/lobby/errorText.ts:56` |
| Approach after a collision | The own mover's walk to an object has `m_nCorr = -1`. The first collision clears the walk (`ClearDest`), stands the mover and sends PLAYERCORR. | `apps/client/src/world/sim/moverRules.ts:349-378`; C++ `_Common/MoverActEvent.cpp:2017-2037` |
| Re-approach | While auto-attacking, the attack branch runs `UseFocusObj` on every rules step. `CMD_SetMeleeAttack` calls `SetDestObj`, which sends PLAYERSETDESTOBJ whenever the followed object changed, a cleared walk included, and sets `m_nCorr = -1` again. | `apps/client/src/world/combat/attackLoop.ts:100-111`, `:415-431`, `:539-566`; C++ `_Interface/WndWorld.cpp:8513-8537`, `:6197-6266`, `_Common/MoverMsg.cpp:47-84`, `:427-454` |
| The loop | Auto-attack into a wall: one PLAYERSETDESTOBJ and one PLAYERCORR per 60 Hz step, 120 a second. The gateway closes the session after 1.2 s. On open ground: 3 packets in all. | Reproduced 2026-11-02 by `.superpowers/investigation/attackWallTraffic.test.ts` (ignored, in the piece5 worktree) |
| Earlier fix | The 2026-11-01 fix spaced the joystick's steering reports to one per 6 rules steps. It did not touch the attack approach. | `apps/client/src/world/ownMover.ts:23-25`, `:122-134`; `docs/2026-11-01-obstacle-disconnect-investigation.md` |
| Who approaches | `setOwnDestObj` is used by the attack loop and the skill use. Item pick-up sends its own approach. | `combat/attackLoop.ts`, `skills/skillUse.ts`, `items/itemActions.ts` |
| World map | 8 map pictures (WORLD_Flyff, Darkon12, Darkon3, Ricis, Saint, Flaris, Harmonin, Estia), continent buttons from `texMapButton.inc`, continent shapes read from data, a different projection per map, and monster rows placed on a 1280×960 reference picture. | [R §1]: `Neuz/WorldMap.cpp:95-345`, `:1383-1652`, `_Common/Continent.cpp:33-115`, `Client/Theme/Default/texMap*.inc` |
| Teleporter map | Piece 5's NPC teleporter map already sends PACKETTYPE_TELEPORTER and waits for the server's REPLACE. | `apps/client/src/world/hud/teleporterWindow.ts`; [R §1] |
| Music | Music IDs map to files through `Client/Music/default.bgm`. The active V15 player (`Music2.cpp`) does not restart a track that is already playing, and has no fade. Regions choose the music. | [R §2]: `_Common/Music2.cpp:27-122`, `_Interface/WndWorld.cpp:8013-8045`, `:8560-8605`, `_Common/WorldFile.cpp:422-460` |
| Sound | Sound IDs map to WAV files through `Client/Client/sound.inc` and `Resource/defineSound.h`. Motions carry their sounds, which the converted models already keep as `[frame, soundId]`. The server can order music and sounds (PLAYMUSIC, PLAYSOUND). | [R §2]: `_Common/ModelObject.cpp:1594-1689`, `Neuz/DPClient.cpp:11736-11751`; `packages/formats/src/web/motionEvents.ts` |
| Sound options | Neuz starts with effects at 1.0 and music at 0.5, set in tenths. | [R §2]: `_Common/HwOption.cpp:208-209`, `_Interface/WndOption.cpp:436-519` |
| Safari 16 | Safari plays Ogg only from iOS 18.4. The client supports Safari 16. | [R §2] |
| Login | `LoginFlow` holds the account and the password hash until it hands the connections to the world session, then clears the hash. The Bank PIN is needed only to create or delete a character, not to enter. | `apps/client/src/lobby/LoginFlow.ts`; [R §3] |
| Session end | `WorldSession` closes both connections on any ending and emits one `ended` event with the text to show. | `apps/client/src/world/WorldSession.ts:17-24`, `:94` |
| Fullscreen | The client no longer asks for fullscreen. Play taps ask for landscape only, and a refusal is ignored. | `apps/client/src/landscape.ts:10`, `:22` |
| Install | Vite runs with `publicDir: false`, the build's files are under `/client/`, and the converted game files are under `/assets/`. | [R §4]: `apps/client/vite.config.ts` |
| Targets | First load ≤ 15 MB; ≥ 30 fps on phones and tablets in Flaris; ≤ ~400 MB (JS heap plus GPU estimate); after a 10-minute loop, memory within 10% of its start. The viewer passed the leak test (272.7 MB to 272.6 MB). The client with monsters, windows and effects has not been measured on a phone. | Piece 1 spec §7; `docs/conversion-baseline.md:207-224` |

---

## 3. Design

### 3.1 M0 — Blocked-attack fix

**The rule.** When a collision has just ended the own mover's walk to an object, a new walk to the **same** object
waits until 6 rules steps after the last walk request that was sent, then goes out. That is at most 10 a second. Nothing
else changes:
- the walk itself, the collision, the PLAYERCORR and the auto-attack follow Neuz as now;
- a walk to a **different** object goes out at once;
- arriving, swinging, the combo and skills are untouched.

While it waits after a stop at the obstacle, the character stands there. That is the stand Neuz's `OBJMSG_STAND` already gives at each bump. After a slide along it, where the step still moved the character, the walk goes on at full speed without telling the server. When the wait ends, a PLAYERBEHAVIOR says where the character got to; it keeps the server's walk, where a PLAYERCORR cancels it (`DPSrvr.cpp:12872-12915`). The walk then goes out again. An arrival during such a walk sends that PLAYERBEHAVIOR before the swing or the skill. (Owner's choice after the final review, 2026-11-02: full speed when sliding.)
The rule is a browser adaptation, documented next to the copied code. Neuz sends up to 120 a second here, but it talks to
the servers directly, with no gateway limit.

**Where.** In `setOwnDestObj` (`combat/attackLoop.ts:100-111`), the one function the attack and the skill approaches go
through. It needs:
- the step of the last PLAYERSETDESTOBJ sent;
- whether the own mover's last walk ended in a collision, which `onActCorr` already knows.

The plan decides whether the step count lives on the own mover or in a small helper beside `setOwnDestObj`. Either way,
it resets when the target changes, and on leaving the world.

**The other approaches.** The plan's first task checks the same loop in:
- the skill use (a reserved skill and the action slot);
- item pick-up (`items/itemActions.ts`);
- walking to an NPC.

A path that loops gets the same rule. The joystick and tap-to-walk keep the 2026-11-01 fix.

**Safety test.** One unit test file drives every repeatable input into a wall for 5 simulated seconds through the real
classes:
- auto-attack;
- a skill;
- the action slot;
- pick-up;
- the joystick, steady and wobbling;
- tap-to-walk.

It counts the packets each sends, and fails if any one second holds more than 50. That is half the gateway's limit,
leaving room for chat and the rest. The throwaway reproduction becomes its first case. The existing test "a collision does
not stop the auto-attack: it walks up again" (`apps/client/test/attackLoop.test.ts:387-396`) still holds: it now
expects the second PLAYERSETDESTOBJ after the wait.

### 3.2 M1 — World map

**What the player sees.**
- **Opening:**
  - M, or the Start menu, opens the world map.
  - M again, Escape or its close button shuts it. The plan's research task traces the exact keys.
- **The map:**
  - it opens on the map of the continent the player is on. Flaris is map 5, Saint Morning 4, Darkon 1 and 2 map 1,
    Darkon 3 map 2, Ricis 3, Harmonin 6, Estia 7, and the whole world 0 [R §1];
  - the continent buttons switch between the 8 maps.
- **Markers:**
  - the player's arrow is placed and turned by that map's own projection;
  - a switch shows the monsters at their authored places. Hovering one with the mouse, or tapping it on a phone, shows the
    details Neuz's tooltip shows, such as the name, level and drops; the plan confirms the exact fields from the
    tooltip code.
- **Other worlds:** in a world with no map, such as a dungeon, the map does what Neuz does there. It never places a
  dungeon player on Madrigal by coordinates.

**Art and layout.** The game's own pictures and buttons, converted by the UI stage as before.
- On a PC: the composition at its own size.
- On a phone: the whole composition fitted to the safe landscape area with its proportions kept, and tap areas larger
  than the drawn buttons where they are small.
- Labels come from the game's text files.

**Input.** While the map is open, taps, clicks, drags and keys on it go to the map only. Opening, browsing and closing it
send **no** packet: no walk, attack, target or teleport. The NPC teleporter map (`teleporterWindow.ts`) stays a separate
window with its own send and checks. The two share only the projection and art helpers.

**Data.** A converter step reads:
- the continent shapes (`WdMadrigal.wld.cnt`, `Continent.cpp`);
- the per-map projections (`WorldMap.cpp:1383-1498`);
- the monster rows (`texMapMonster_*.inc`).

It writes them to one catalog, `data/worldMap.json`. Map, continent and world IDs are three different numbers, and the
catalog names each.

### 3.3 M2 — Music and sound

**Music.**
- The track comes from the world and the region, through `default.bgm` and the region rows, by the precedence the
  plan's research task traces: region, then world, then default. NPC and event music come in the same way.
- A track already playing is not restarted, as in `Music2.cpp`. There is no fade, because V15's is commented out.
- The login screen plays the title track.

**Sound effects.**
- Effects play for what the game already does:
  - window clicks;
  - steps and attacks, from the motions' own sound events, so they stay timed to the animation;
  - skills, items, death, revival and level-up;
  - the server's PLAYSOUND.
- The plan's research task makes one table naming, for each effect, what triggers it, its sound ID and its file.
- One event never plays a sound twice, for example from both its motion and its packet.
- Sounds far from the player are quieter, following Neuz's sound code as the research task finds it. Until it is
  traced, sounds beyond hearing range simply don't play.

**Sound window.**
- The game's own options art.
- Effects and music sliders in 10% steps, defaulting to 100% and 50% as in Neuz.
- The browser remembers the two numbers, and nothing else.

**Browser rules.**
- Sound starts with the first tap or key, because browsers allow audio only after one. A refusal never blocks the login
  or the game.
- A hidden tab pauses the sound. Coming back plays only what is current, never a backlog of missed effects.
- Travel and logging out stop the world's sounds.

**Files.**
- The converter copies the WAV effects.
- It keeps the original Ogg music and adds an MP3 copy of each track, made offline with FFmpeg, for Safari before iOS
  18.4. The client picks the Ogg file where the browser plays it, and the MP3 elsewhere.
- FFmpeg becomes a documented converter prerequisite, as KTX-Software is. Music is streamed, not downloaded whole
  before it plays. Short effects are decoded once and kept in a bounded cache.

### 3.4 M3 — Reconnect (one-tap)

**When.** The world session ends without the player asking: the connection closed, the gateway refused it, or the
server dropped it. Leave, Log out, closing the page, and a world entry that failed before the world opened are not
reconnect cases.

**What the player sees.** A small box in the game's look:
- the reason, from the existing `errorText`;
- **Reconnect**;
- **Back to login**.

The world stays on screen behind it, frozen. The controls are off, and the shop, NPC dialogue and other open windows
close.

**What one tap does.** A fresh login, step by step, through the existing `LoginFlow` and `WorldSession`:
1. CERTIFY with the kept account and password hash.
2. The same server and channel, if the fresh list still has them.
3. The character list, and the same character, by its player ID, if it is still there.
4. Enter, JOIN and a fresh world snapshot.

Only after the fresh snapshot does the game take input again. The player then stands where the server says, with the
inventory, HP and money the server sends.

**Never:**
- an old key reused;
- a packet replayed: no purchase, sale, chat line, item use, attack or skill;
- a second set of connections or listeners.

A failed attempt shows its reason in the same box, and the player can tap again. There is no automatic retry, so the
server's login limits are never hit by the client on its own.

**The kept login.**
- The account name and the password hash are held in memory while the player is in the world, and for 5 minutes after a
  drop.
- They are cleared on Back to login, on Log out and Leave, when the 5 minutes run out, and when the page closes.
- They are never written to storage, a URL, a log, the test hooks or a cache.
- The plain password is never kept.
- After the 5 minutes, Reconnect becomes Back to login.

**Refusals.**
- A wrong password or a blocked account goes to the login screen with the server's message.
- If the account is already in the game, the box says so. The client never logs the other session out by itself.
- A missing channel or character goes to the lobby step where it is missing.

This is a browser adaptation, not a V15 feature: Neuz has no reconnect.

### 3.5 M4 — Installable app

- **Install:**
  - a web manifest with a fixed app ID, the start address and scope of the hosted client, standalone display, and a
    landscape preference;
  - icons made from the game's own art.
- **Optional:** the page works the same in a normal browser tab. Android's install prompt and iPhone's "Add to Home
  Screen" get short instructions in the device checklist and the hosting guide. The page never forces a prompt.
- **No fullscreen:** the client already requests none (`landscape.ts`). The install keeps it that way. An installed app
  may ask for a landscape lock; a refusal is normal, and the portrait cover stays as the fallback.
- **Offline and updates:**
  - a small service worker, in production builds only, caches the page shell and nothing else: no game files, no music,
    no login or gateway traffic;
  - opened offline, the app shows "A connection is needed to play";
  - a new version waits until the player is out of the world, and never reloads the page during play;
  - the converted game files keep their existing one-year cache headers (`docs/hosting.md`).
- **Hosting guide:** the manifest's and the worker's content types, and the no-cache rule for the worker file.

### 3.6 M5 — Performance and memory

**Targets** (Piece 1 spec §7), measured on the weakest of the owner's four test devices with the client, not the
viewer:

| Target | Pass |
|---|---|
| Frame rate | ≥ 30 fps in Flaris town, standing and running, with the HUD open and monsters and players in view |
| Memory | ≤ ~400 MB, JS heap plus the GPU estimate, as the Stats panel shows |
| Leak | After a scripted 10-minute loop in the world, memory within 10% of its start, and three.js' geometry, texture and program counts back to their start |
| First load | ≤ 15 MB downloaded before the character is on screen, counted compressed |

**Steps.**
1. **Measure.**
   - The owner reads the Stats panel on each device at fixed spots in Flaris; the checklist names them.
   - A client soak test, like the viewer's (`test:soak`), walks a loop in the world against the pretend servers and
     checks the leak target in Chromium.
   - A build check reports the first-load bytes.
2. **Fix what misses**, in order of cost, measuring after each:
   - draw calls (merging or instancing models, name tags and effects);
   - texture sizes on phones;
   - view distance on phones;
   - per-frame allocations (the "later" items of the Piece 4 final review);
   - shadow and effect detail.

   Each fix that changes the look on phones is shown to the owner before it is kept.
3. **Page freezes** (added by the owner on 2026-11-03): the full browser suite has not finished clean on the owner's PC
   since Piece 5. Under SwiftShader, pages freeze for seconds, and `page.screenshot` can hang for its whole 2 minutes:
   9 of the 24 timing-set runs failed with 2 workers, and the same set fails on a84fe29.
   - The suspect is the inventory portrait (`renderPortrait`). Each opening loads the model and reads the pixels back with
     a synchronous `readRenderTargetPixels`, and the console logs "GPU stall due to ReadPixels".
   - The 2-minute screenshot hangs are not explained yet.
   - Find each freeze's cause, fix it where it would also hitch a weak phone, and make the remaining test waits follow
     the frame loop.
   - Done when `npm run test:e2e:client` ends with no `failed` on the owner's PC.
4. **Record** the numbers per device in `docs/conversion-baseline.md`.

---

## 4. Error handling

- **M0:** the safety test guards every repeatable input path. If the gateway still closes a session with 4004, the
  message stays as it is.
- **M1:** a missing map picture or catalog row shows the map without it, with one overlay error. A row that cannot be
  read is reported and skipped, never placed at 0,0.
- **M2:**
  - a sound or track that fails to load or decode is skipped and listed once in the overlay;
  - the game never waits for sound;
  - an unknown sound or music ID from the server is ignored;
  - the server never names a file: IDs are looked up in the catalog.
- **M3:** every attempt has the existing login and entry timeouts. Each failure ends in the box or the login screen,
  never a blank page. Only one attempt runs at a time, and a late reply from an old connection is ignored.
- **M4:** a failed service-worker registration leaves a normal web page. A worker update never takes over a page in the
  world.
- **M5:** a quality setting that cannot be applied leaves the default.

---

## 5. Testing

Each milestone has:
- **unit tests:** readers, converter steps, the session and HUD logic, with Vitest;
- **one or two Chromium browser specs** (desktop and landscape phone) against the pretend servers;
- **the owner's checks** on the VM and the devices.

Builders run `npm test`, `npm run typecheck` and the one spec file their change touches. The owner runs the full
suites, the corpus tests and the live tests at each checkpoint. Each plan lists the commands, where to run them, how long
they take and what "pass" looks like.

| Milestone | Automated | Owner |
|---|---|---|
| M0 | The traffic test from 3.1; the attack-loop tests | Phone and PC: auto-attack a monster across a fence for 30 s and stay connected; then the same with a skill |
| M1 | Catalog readers on fixtures from the C++ (projection corners, Flaris polygon, monster rows); `worldMap.spec.ts`: open, browse, monster details, close, no packets sent | All 8 maps, the arrow in Flaris and Saint Morning, a dungeon, the NPC teleporter still working |
| M2 | Catalog and ID mapping; the music rules (no restart, region precedence); no doubled effect; volume steps saved; `audio.spec.ts`: unlocked by a tap, the right track asked for | Listening on the PC, Android and iPhone: title and town music, attack and skill sounds, the Sound window, the MP3 copy on iOS before 18.4 |
| M3 | Fake-clock tests: one attempt at a time, 5-minute expiry, cleared credentials, no replay, refusals; `recovery.spec.ts`: a cache drop, a login drop, a duplicate account, back in with fresh state | On the VM: stop the gateway mid-game, start it, tap Reconnect; log the same account in elsewhere |
| M4 | A production-build spec: manifest and icons served, the worker only in production, offline shell message, an update that waits | Install, start and rotate on Android and iPhone; the normal tab still works |
| M5 | The client soak test; the first-load byte check | Stats panel readings on all four devices at the named spots |

---

## 6. Docs

- **README:** what Piece 6 adds, and FFmpeg as a converter prerequisite (M2).
- **`docs/device-testing.md`:** a section per milestone, with what the test character needs.
- **`docs/hosting.md`:** the music MIME types (M2), the manifest and worker (M4).
- **`docs/conversion-baseline.md`:** the audio conversion numbers (M2) and the per-device performance numbers (M5).
- **Checkpoints:** a `docs/piece6-mN-checkpoint.md` per milestone, with what passed and what is still open.

---

## 7. Done criteria

- **M0:** the traffic test passes for every input path. The owner stays connected while auto-attacking across a fence
  for 30 s, on the phone and on the PC.
- **M1:** all 8 maps open and switch. The arrow and monster markers match the fixtures. A dungeon behaves as in Neuz.
  The map sends no packet, and the NPC teleporter still works.
- **M2:** the right music for the title, Flaris and a second region, with no restart on the same track. Effects for
  attacks, skills, items, death and level-up, none doubled. The Sound window works and remembers its numbers. Heard on
  the PC, Android and an iPhone.
- **M3:** one tap after a dropped connection puts the same character back with the server's fresh state. Nothing is
  replayed. The login is never stored and is gone after 5 minutes or on leaving. The refusals behave as in 3.4.
- **M4:** the game installs and starts from the home screen on Android and an iPhone, in landscape, with no fullscreen
  request. It still works in a normal tab, and updates wait.
- **M5:** the §7 targets met on the weakest device, with the numbers recorded, or each miss written down with the owner's
  decision.

---

## 8. Out of scope

- Quests and job change, parties and guilds and their chat, player trading and player shops, mail, flying, crafting.
- Blinkwings and scroll travel, and a modern world-map search.
- Automatic reconnect, offline play, keeping the session through a page reload.
- Server or gateway changes, including raising the gateway's packet limit.
- The public launch: VPS hosting and opening to players stay the owner's separate decision.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Another input path floods the gateway in a way not yet found | The M0 traffic test covers every repeatable input; new inputs in later pieces add a case |
| The world map's per-map projections and continent rules are easy to get subtly wrong | M1's first task transcribes them from the C++ into fixtures before any window code |
| iOS before 18.4 plays no Ogg; audio unlock rules differ by browser | MP3 copies chosen by capability; unlock on the first gesture; listening checks on a real iPhone |
| Reconnect races: late replies from the dead connection, a tap during an attempt | One owner object for the attempt, one attempt at a time, old connections' events ignored; fake-clock tests |
| The weakest phone misses 30 fps with the full HUD and effects | M5 measures first, then fixes in order of cost, and shows the owner any change to the look |
| Music and sound add many megabytes | Music streams; effects are small and cached with a bound; the first-load budget is checked in M5 |

---

## 10. Plans

One plan per milestone, written just before the milestone starts, each opening with its C++ trace:

1. `docs/superpowers/plans/2026-11-02-piece6-m0-blocked-attack.md` (first: small, and the owner hit it in play)
2. `docs/superpowers/plans/<date>-piece6-m1-world-map.md`
3. `docs/superpowers/plans/<date>-piece6-m2-sound.md`
4. `docs/superpowers/plans/<date>-piece6-m3-reconnect.md`
5. `docs/superpowers/plans/<date>-piece6-m4-app.md`
6. `docs/superpowers/plans/<date>-piece6-m5-performance.md`

(`<date>` is the day each plan is written.)

The work is on branch `piece6`, in the worktree `FlyffWeb-worktrees/piece6`. The converted `dist/assets` is copied from
the piece5 worktree before the first browser test.

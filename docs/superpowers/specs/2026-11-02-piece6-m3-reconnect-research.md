# Piece 6 M3 research: one-tap reconnect

Date: 2026-11-02. For the [Piece 6 design](2026-11-02-piece6-design.md) §3.4 and the M3 plan, which cites this note as
`[R §n]`. FlyffWeb paths are relative to the repository. `Source/`, `Resource/` and `Program/` are in
`Blouflash VS22 V15/`. No secret was copied here.

**A correction to the spec.** §2 "Login" says the password hash is cleared at the hand-over. Only LoginFlow's own copy is
(`LoginFlow.ts:317-319`, `:536-537`). The `WorldEntry` carries `passwordHash` for the whole world session (§2 below).

## 1. FlyffWeb's lobby and world flow

### `apps/client/src/lobby/LoginFlow.ts`

- **No state enum:** the state is in fields (`:118-146`):
  - `account`, `passwordHash`, `authKey`, `servers`, `characters`, `messengers`, `cacheAddress`, `serverClock`,
    `channelId`, `channelNames`;
  - the `certifier` and `loginServer` channels;
  - `offeredCloseExisting` (after error 103) and `certifierQuiet`;
  - the `timer` and `pingTimer`, and `epoch` (bumped to drop late channels).
- **`login(account, password)`** (`:161-174`) resets, trims and lower-cases the account, hashes the password
  (`prepareCertify`, `:83-93`), keeps the account and hash (`:171-172`) and certifies.
  - `hashPassword` returns a 32-character input as it is (`packages/protocol/src/crypto/password.ts:18-19`).
  - The certifier gets 20 s, the gateway's open included (`:63-65`, `:155-160`, `:349-355`, `:479-485`), then "The
    server did not answer in time."
- **`changeChannel()`** (`:185-206`) closes both channels, waits 1 s (`:72`) and re-sends CERTIFY from the kept account
  and hash (`:197`): an existing "log in again from the hash" path.
- **`closeExistingConnection()`** (`:214-220`): only after 103, sends CLOSE_EXISTING_CONNECTION.
- **`selectChannel(channel)`** (`:228-245`):
  - finds the parent server by `channel.parent` (`:229`);
  - opens the login server and pings every 10 s (`:70`, `:493-507`);
  - sends QUERYTICKCOUNT and GETPLAYERLIST (`:243-244`);
  - **has no timeout**: a list that never comes waits forever.
- **Error 103** (`:395-397`) emits `alreadyConnected` and keeps the certifier open. A certifier close is reported as
  `closed` unless the server list is in (`certifierQuiet`, `:335-345`).
- **`handOver(slot)`** (`:298-321`) returns undefined without a login channel, auth key, channel, character in the slot,
  cache address or started clock (`:301-303`). Otherwise it builds the `WorldEntry` (`:304-316`), detaches the login
  channel and resets (`:318-319`).
- **`WorldEntry`** (`:38-61`): `login`, `cacheTarget`, `account`, `passwordHash`, `authKey`, `channelId`, `serverName`,
  `channelName`, `character` (with `playerId`), `messenger`, `clock`. It has **no parent-server id**, and a channel id is
  unique only under its server (`:130-134`).
- **`dispose()`** is `reset()` (`:324-326`, `:529-541`): it closes everything and clears the account, hash, key, servers
  and channel. `fail()` resets, then emits (`:524-527`). Late events of replaced channels are ignored (`:330-337`,
  `:366-369`).

### `apps/client/src/lobby/LobbyApp.ts`

- **Screens:** `'login' | 'alreadyConnected' | 'servers' | 'characters' | 'create' | 'delete'` (`:14`).
  - On the session screens an error stays (`:21`, `:97-100`). Anywhere else an error or a close shows the login form
    (`:101-105`).
- **`handle()`** (`:76-107`) shows the server list, the characters, and the `alreadyConnected` view ("Disconnect it" →
  `closeExistingConnection`, `:86-95`). Flow events always reach it (`main.ts:50`), so **during a reconnect the lobby would
  draw its screens behind the world unless it has a reconnect mode.**
- **`enter(character)`** (`:189-214`):
  - calls `handOver`, and stays with UNEXPECTED_PROBLEM when it fails;
  - clears the stage and makes a per-entry token (`:39-44`, `:204-205`);
  - calls `onEnter(entry, done)`.
  - `done(message)` acts for the current token only (`:207`): `mount()`, `showLogin(message)` (an alert, `:110-114`,
    `:234-258`; it also starts the title music, `:112`), and the heading's focus.
- **The rest:**
  - `logout()` is `flow.dispose()` and `showLogin()` (`:217-220`).
  - The login and Enter taps ask for the landscape lock (`onPlayTap`, `:52-55`, `:162`, `:190`).
  - Constructor `(root, flow, onEnter, onPlayTap, audio)` (`:56-66`).
  - `apps/client/e2e/lobbyHarness.ts:20-26` copies this wiring.

### `apps/client/src/world/WorldSession.ts`

- **`WorldEvent`** is `entered | transition | messages | ended{message}` (`:20-24`): **an ending carries only its text.**
- **Phases:** `opening | pausing | preJoin | join | playing | transition | over` (`:70`).
- **Timeouts:**
  - 1 s pause after the cache opens (`:43`);
  - PRE_JOIN 15 s (`:45`);
  - JOIN 25 s (`:47`);
  - transition 25 s (`:478`);
  - none while `opening` (`:171-177`).
- **Every ending** closes both channels, then emits once (`:560-576`):

  | Ending | Text | Lines |
  |---|---|---|
  | Login channel closed | `closedText` | `:142-144` |
  | Cache channel closed | `closedText`, or JOIN_CLOSED_TEXT during `join` | `:186-189` |
  | `closedText` | gateway causes (4001, 4003, 4004, 1009, 4005-4009) keep the lobby's text; 4002, 1000 and 1006 are LOST_TEXT "The connection to the game was lost." | `:49`, `:61-64`, `:343-346` |
  | A name the wire cannot carry | UNEXPECTED_PROBLEM | `:165-169` |
  | Cache open refused | `closeText(1006)` | `:174-176` |
  | ERROR from the login or cache server | `errorText(code)` | `:358-360`, `:396-398` |
  | Bad data (JOIN without WORLD_READINFO, transition overflow, bad REPLACE, a packet a decoder refuses) | bad data | `:427-432`, `:455`, `:472-473`, `:527-535` |
  | Timers | TIMEOUT_TEXT | `:537-543` |

- **`leave()`** (`:329-331`) is the player's own ending and emits nothing.
- Late events are ignored once `over` (`:139-144`, `:183-189`). Each attempt needs a new `WorldSession`.

### `apps/client/src/world/WorldScreen.ts`

- **`open()`** (`:290-298`): `onEnd` is called once, with the text, or undefined after Leave or Log out.
- **Constructor** (`:300-349`): the session (`:308`), Leave on the loading screen (`:316-317`), `askBeforeLeaving`
  (`:322`), the test hooks (`:323-347`).
- **`leave()`** (`:352-354`) serves Leave and the Log-out box. `onEvent`: `ended` → `end(message)` (`:391-396`).
- **Endings that are not drops:**
  - a world not converted, NOT_AVAILABLE_TEXT (`:401-405`, `:438-441`);
  - TOO_SLOW_TEXT after 60 s (`:117`, `:453`);
  - a stage failure (`:454-459`);
  - `fail()` → `endingOf()`: no WebGL, files out of date, UNEXPECTED_PROBLEM (`:132-136`, `:1507-1513`).
- **"World shown":** `showWorld` starts the frame loop (`:681`, `:848`), and the first frame resolves `shown` (`:1068`).
- **`end()`** (`:1580-1593`):
  - `session.leave()`, then the gestures and `stopAsking`;
  - `disposeWorld()` (`:1516-1577`): the loop, controls, every window, the stage and the world's sounds;
  - removes the canvas holder and the element, unregisters the hooks, rejects `shown`, and calls `onEnd`.
- The renderer and canvas are the page's (`page3d.ts:1-3`, `:35`, `:66-80`). A resize clears the canvas
  (`packages/scene/src/boot.ts:41-44`), and there is no `preserveDrawingBuffer` (`:28`).
- The box needs `hudArt`, which `disposeWorld` drops (`:1574`). Example box: `hud/logOutBox.ts:53-83`.

### `apps/client/src/lobby/errorText.ts`

- Texts for 100-138 and 1316/1319 (`:13-43`).
- 103 reads "This account is already connected.  Do you want to disconnect it?" (`:15`).
- `closeText` (`:52-72`): 4004 "Too much data was sent. Disconnected." (`:56`), 4008 "…Wait a minute and try again."
  (`:62`); an unknown code reads "Cannot reach the game gateway." (`:71`).

## 2. The password hash

- **Where it comes from:** the plain password is only in the form's input (`lobby/views/loginView.ts:18-19`, `:34`; "The
  password is never kept", `:5`), passed through `LobbyApp.login` (`:161-167`) to `LoginFlow.login`. The hash is a
  salted MD5 (`LoginFlow.ts:83-87`; `password.ts:18-21`).
- **Where it is held**, in memory only:
  - `LoginFlow.passwordHash` (`:119`, `:172`; cleared by `reset`, `:537`);
  - `WorldEntry.passwordHash` (`:44`, `:308`);
  - `WorldScreen.entry` (`:302`);
  - `WorldSession.entry` (`:134`);
  - **`WorldSession.joinPacket`**, the JOIN's bytes, which hold it and are never cleared (`:118`, `:161-164`).

  A JS string cannot be wiped: clearing it means dropping every reference.
- **On the wire:** CERTIFY's AES has a fixed key, so it is as good as the hash (`password.ts:27-37`). The hash also goes
  in GETPLAYERLIST (`LoginFlow.ts:244`), CREATE (`:263`), DEL (`:286`), CLOSE_EXISTING (`:219`) and JOIN
  (`WorldSession.ts:161-164`).
- **No leak was found:**
  - the test hooks expose movers, own, stats, camera, pause, step, played and `screenOf` (`testHooks.ts:56-80`), and the
    lobby harness only `lobbyDones` (`e2e/lobbyHarness.ts:15-16`);
  - the client logs only types and error messages;
  - the gateway logs address, route, close code and bytes (`apps/gateway/src/server.ts:125-128`, `refusalLog.ts:43-55`);
  - localStorage holds only the audio settings (`main.ts:36`);
  - the URL is `/connect/<addr>:<port>` (`net/webSocketChannel.ts:10`).

## 3. The servers' rules

- **A second login of an account in the game:**
  - The certifier checks the lockout, then the password (`Source/CERTIFIER/DBManager.cpp:214-231`, `:248-266`), then
    asks the account server (`:202-210`).
  - `AddAccount` (`Source/AccountServer/account.cpp:169-211`) answers ACCOUNT_DUPLIACTE for an account that is present:
    a routed (in-game) one always, an un-routed one only if it pinged in the last 2 minutes (else the stale entry is
    replaced, `:199-207`).
  - The certifier sends ERROR 103 (`Source/CERTIFIER/dpaccountclient.cpp:161-163`) and does not close (`DPCertifier.cpp:283-289`).
  - **The old session stays** unless the client sends CLOSE_EXISTING_CONNECTION (`DPCertifier.cpp:424-441` → … →
    `Source/LOGINSERVER/DPDatabaseClient.cpp:107-129`).
  - The certifier closes an unfinished connection 10-20 s later (`certifier.cpp:176`, `:268-275`; `user.cpp:78-105`).
- **Other kicks, each of the own session only:**
  - a GETPLAYERLIST of an account already connected destroys both connections (`Source/LOGINSERVER/DPLoginSrvr.cpp:179-188`);
  - a PRE_JOIN for a player id the core still holds removes the old one and answers f=0 (`Source/CORESERVER/dploginsrvr.cpp:99-129`;
    `Source/LOGINSERVER/DPCoreClient.cpp:102-109`);
  - a JOIN of a character still in the world destroys both (`Source/WORLDSERVER/DPSrvr.cpp:659-667`): JOIN_CLOSED_TEXT.
- **When the old session's socket closes:**
  - **Login connection:** removed at once. The account is free within about a second (`Source/LOGINSERVER/User.cpp:135-163`,
    `Source/AccountServer/account.cpp:238-275`).
  - **Cache connection:** LEAVE to the world server (`Source/CACHESERVER/DPCacheSrvr.cpp:177-197`). In a safe zone, for a
    GM or with no world, the character goes at once. Elsewhere it is removed after `TIMEWAIT_CLOSE` = 10 s, and login is
    prevented for 15 s (`Source/WORLDSERVER/User.cpp:3916-3948`; `Source/_Common/DefineCommon.h:20`;
    `Source/databaseserver/dptrans.cpp:1302-1315`).
  - **Meanwhile the database drops a JOIN with no answer** (`__INVALID_LOGIN_0320`/`_0612`,
    `Source/_Database/DbManagerJoin.cpp:336-347`): the client meets its 25 s JOIN timeout.
- **A socket that never reaches the servers** (the browser lost its network):
  - The gateway pings every 30 s and ends a socket after 60 s without a pong (`apps/gateway/src/config.ts:37-38`;
    `relay.ts:130-138`).
  - Meanwhile the gateway itself keeps the login and cache connections alive (`relay.ts:165-169`, `:185-190`), so the
    ghost stays in the game for 60-90 s.
  - **A reconnect in that window gets 103 for the player's own ghost.** The live test treats a 103 right after a session
    as "try again soon" (`apps/client/test/world.live.test.ts:181-187`, `:260-265`).
- **The gateway:**
  - A refusal (4004) closes that connection only; WorldSession closes the other (`relay.ts:144-155`, `:217-238`).
  - A stopped gateway ends every socket (`server.ts:167-175`): the browser sees 1006, LOST_TEXT.
- **The auth key:**
  - Made in `AddAccount` (`account.cpp:182-191`). It is good for one GETPLAYERLIST (which routes the account and closes
    the certifier) and one JOIN (`Source/AccountServer/dpdbsrvr.cpp:131-145`, `:162-165`).
  - It ends when the certifier closes before routing, when the login connection ends, or on close-existing.
  - **An old key can never be used again.**
- **Limits:**
  - **Lockout:** per address and account, 1 wrong password blocks 15 s (134) and 3 block 15 minutes (135)
    (`server-patches/README.md:60-80`; `Source/CERTIFIER/AccountMgr.cpp:49-99`).
  - **Server flood limiter:** 50 connections under 200 ms apart cut an address for 10 minutes (`Source/_Network/Misc/Src/dos2.cpp:47`,
    `:76-119`). The gateway is exempt by its `Gateway` line. This PC's `Program/*.ini` have none; the VM's has
    (`docs/servers-in-a-vm.md:62`).
  - **Gateway** (`apps/gateway/src/config.ts:29-40`):
    - 100 packets a second (4004);
    - 32 connections per address (4007);
    - 60 new connections a minute per address (4008);
    - 1000 in all (4009);
    - 10 s to connect (4001).

    Each reconnect tap opens 3 connections: certifier, login and cache.

## 4. Neuz on a drop

- **Cache drop:** logged to `network.log` only (`Source/Neuz/Network.cpp:84-129`). Its box is commented out
  (`DPClient.cpp:287-289`).
- **Login drop:** "Disconnected from the server." (`TID_DIAG_0023`, `Source/Neuz/DPLoginClient.cpp:65-82`). Its OK
  posts WM_LOGOUT (`WndMessageBox.cpp:325-341`), which opens the login screen with the title music
  (`Neuz.cpp:1465-1471`).
- **103 at the certifier:** the close-existing window (`DPCertified.cpp:296-313`).
- **Neuz has no reconnect.**
- **FlyffWeb today:** any ending tears the world down and shows the login form with the reason (`WorldScreen.ts:1580-1593` →
  `LobbyApp.ts:206-213`). This is tested at `apps/client/e2e/world.spec.ts:779-788` (cache 4002 → "The connection to the
  game was lost."), which M3 changes.

## 5. Tests to extend

- **`apps/client/e2e/worldHarness.ts`:**
  - `playGateway(page, world, { certify?, listed? })` (`:171-221`) records `sent` and the connections closed. It answers
    each CERTIFY with the server list (or `certify(n)` for the n-th), each GETPLAYERLIST with the cache address and the
    list, and PRE_JOIN/JOIN from the world script.
  - `closeCache(code)` closes the latest cache socket (`:165-166`, `:194`). There is no `closeLogin`.
  - The world script answers each JOIN with the same bundle (`packages/testkit/src/worldScript.ts:76-117`).
- **`lobby.spec.ts`:**
  - its own `playGateway` with a `close` callback (`:80-103`);
  - change-channel re-CERTIFY checked against `encodeCertify(account, HASH)` (`:357-385`);
  - stale `done` (`:420-455`);
  - 103 and Disconnect it (`:477-496`);
  - 4001 (`:498-505`);
  - a wrong password (`:507-516`).
- **`world.spec.ts`:** Leave (`:206-223`), Log out (`:722-749`), beforeunload (`:754-777`), drop (`:779-788`).
- **Unit tests:**
  - `apps/client/test/loginFlow.test.ts`: helpers `start`, `atServerList`, `atCharacterList` (`:21-47`); 103
    (`:174-236`); change channel with the fake clock (`:507-650`); hand-over (`:677-`).
  - `apps/client/test/worldSession.test.ts`: `setup` (`:72-100`); `started`, `atPreJoin`, `atJoin`, `playing`
    (`:103-129`); timeouts, endings, leaving (`:440-`).
  - `apps/client/test/helpers/fakeChannel.ts`: `drop(code)`, `close()` (`onClose(1000)`), and `fakeClock` with
    `advance`/`pending`.
- There are no LobbyApp or WorldScreen unit tests.
- **Ports:** the Playwright config uses port 5174 with `reuseExistingServer: false` (`apps/client/playwright.config.ts:17`,
  `:36-44`).

## Open questions (decided in the plan)

1. **What counts as a drop:**
   - a cause on `ended`, or WorldScreen's "world shown";
   - endings during a REPLACE transition, server ERRORs while playing, bad data, timeouts;
   - NOT_AVAILABLE would loop.
2. **103 during a reconnect,** often the player's own ghost for 60-90 s:
   - the box's text;
   - a "Disconnect it" the player taps;
   - disposing the flow.
3. **Where the kept login lives:**
   - a new owner with the 5-minute clock and the parent server id;
   - dropping every hash reference, including `joinPacket`.
4. **CERTIFY from the hash:** `login(account, hash)`, or an explicit method.
5. **Where each refusal lands:**
   - the login form: wrong password, blocked account;
   - the box: gateway and timeout codes, 108, 109, 136, 137;
   - the server list: a channel offline, full or missing;
   - the character list: a character missing.
6. **Timeouts:** the character list and the cache open have none.
7. **The frozen world:** the canvas (a resize clears it), the HUD art for the box, `askBeforeLeaving`, the music, the test
   hooks.
8. **The new attempt's loading:** what stays on screen, and what Leave does there.
9. **The 5 minutes:** an attempt in flight at 5:00; the box after it.
10. **The servers' waits:** within about 15 s of a drop outside a safe zone, an attempt meets JOIN_CLOSED or a silent JOIN.
11. **The tap itself:** the landscape lock; one attempt at a time; Back to login cancels.
12. **Browser tests:**
    - `closeLogin`, and a certify, list and world per attempt;
    - `world.spec.ts:779-788` rewritten;
    - `lobbyHarness.ts`.
13. **Local servers:** this PC's ini files have no Gateway lines.

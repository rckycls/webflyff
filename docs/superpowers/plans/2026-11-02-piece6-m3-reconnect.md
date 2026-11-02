# Piece 6 M3 — One-Tap Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** when the world session drops on its own, the world freezes behind a box in the game's look. The box shows
the reason, **Reconnect** and **Back to login**. One tap logs the same account back in to the same channel and
character, with a fresh login and a fresh world.

**Architecture:**
- **`LoginFlow`** gains a login from the kept hash and the server id of the hand-over.
- **A pure `Reconnect` state machine** (`lobby/reconnect.ts`) drives one attempt at a time through the flow's events,
  with a `KeptLogin` that forgets itself after 5 minutes.
- **`WorldScreen`** tells a drop (a session ending after the world was shown) from its other endings: it freezes, shows
  a `DropBox`, and hands a `DroppedWorld` to the lobby.
- **`LobbyApp`** runs the `Reconnect` while one is open, and enters the new world through its usual `enter`.

**Tech Stack:** TypeScript, the existing LoginFlow, WorldSession and HUD frame, Vitest with the fake channels and clock,
one Chromium Playwright spec.

**Spec:** `docs/superpowers/specs/2026-11-02-piece6-design.md` §3.4, §4 (M3), §5, §7. **Research:**
`docs/superpowers/specs/2026-11-02-piece6-m3-reconnect-research.md`, cited as `[R §n]`. This is a browser adaptation:
Neuz has no reconnect [R §4].

## Global Constraints

- **Nothing is replayed:** an attempt sends only what a login sends:
  - CERTIFY;
  - GETPLAYERLIST and QUERYTICKCOUNT;
  - PRE_JOIN and JOIN.

  The old auth key is never used, and no gameplay packet goes out.
- **No automatic retry:** every attempt comes from a tap. Only one attempt runs at a time.
- **The kept login:**
  - It is the account, the password hash, the server id, the channel id and the player id. It is never the plain
    password.
  - It lives in memory only: no storage, no URL, no log, no test hook.
  - It is dropped on Back to login, Log out, Leave, after 5 minutes, and when the page closes. Dropping it means every
    reference, including the JOIN bytes `WorldSession` keeps [R §2].
- **No duplicate kick:** the client never sends CLOSE_EXISTING_CONNECTION by itself [R §3].
- **No server change**, and the gateway's limits stay as they are.
- **Builders run only:**
  - `npx vitest run` on the task's files;
  - `npm run typecheck`;
  - in Task 5, `npm run test:e2e:client -- recovery.spec.ts world.spec.ts` once.
- **Work in** `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, branch `piece6`.

## Rulings made while planning (the owner reviews these with the plan)

The owner asked for M3 to be built straight after M2, so these rulings stand until the owner's review.

1. **What a drop is:** any `WorldSession` ending after the world was first shown, during play or a world change [R §1].
   - That covers a closed connection, a gateway refusal, a server ERROR, a timeout and bad data.
   - Not drops: Leave, Log out, closing the page, any ending before the first world was shown, and the world screen's own
     endings (a world not converted, too slow, no WebGL, files out of date). These keep today's way back to the login
     form.
2. **The frozen world:**
   - the rules stop;
   - the controls let go and stay off;
   - every window closes;
   - the world's sounds stop;
   - the last picture keeps being drawn, with no step.

   Closing the page no longer asks first: there is nothing left to lose.
3. **The box** is a `WindowFrame` in the game's look, like the Log-out box, titled with the game's "Disconnected" text
   (`TID_DIAG_0023`'s "Disconnected from the server." [R §4]).
   - It holds the reason (`errorText`/`closeText`), **Reconnect** and **Back to login**.
   - While an attempt runs, it reads "Reconnecting…" and Reconnect is greyed.
4. **From the hand-over:** when the fresh character list has the character, the old frozen world is closed, and the
   ordinary "Entering the world…" screen of the new entry takes over. Input comes back with the fresh JOIN. Keeping the
   frozen world behind the new loading screen is not worth a second renderer.
5. **Error 103** (the account is still in the game) keeps the box. Its text reads "This account is still in the game.
   Wait a minute, then tap Reconnect." Most often it is the player's own dropped session, which the gateway keeps alive
   for 60 to 90 s [R §3]. The flow is closed. The box offers no Disconnect: the player can use the lobby's after Back to
   login.
6. **Where the other refusals go** [R §1, §3]:
   - a wrong password, a blocked or locked-out account (119-125, 132, 134, 135): the login form, with the server's
     message;
   - the channel missing, offline or full in the fresh list: the server list, with "The channel is not available.";
   - the character missing from the fresh list: the character list, with "The character is no longer on this
     account.";
   - anything else (a closed connection, a gateway refusal, a timeout, other ERRORs): the box, with its reason, ready for
     another tap.
7. **Timeouts:** the character-list step gets the certifier's 20 s, as it has none [R §1]. Every other step keeps its
   existing timeout.
8. **The 5 minutes** start at the drop. An attempt still running at 5:00 finishes. After that the box offers only Back
   to login, and reads "The saved login has expired."
9. **The tap** asks for the landscape lock, as the login and Enter taps do.
10. **The server id:** `WorldEntry` gains `serverId`, the channel's parent, because a channel id is unique only within
    its server [R §1].

## Review Focus

1. **A tap while an attempt runs, and Back to login during one:**
   - one attempt at a time;
   - Back to login closes the attempt's connections, and no late event of it reaches the lobby or the new world.

   Pinned in Tasks 2 and 4.
2. **The 103 of the player's own ghost:** the box says to wait, nothing is kicked, and a later tap works. Pinned in
   Tasks 2 and 5.
3. **The hash after Back to login or the 5 minutes:**
   - no reachable reference remains: the kept login, the frozen world's entry and session, the flow;
   - the test hooks never expose it.

   Pinned in Tasks 2 and 3.
4. **A drop during a world change** (the loading screen of a REPLACE): the box shows over it, and a reconnect enters the
   world the server says. Pinned in Task 3.
5. **No replay:** after a reconnect, the packets sent are the login's, with no chat, buy, use, attack or skill of
   before. The fresh JOIN's numbers replace the old ones. Pinned in Task 5.

---

### Task 1: The login from the kept hash

**Files:**
- Modify: `apps/client/src/lobby/LoginFlow.ts`.
- Test: `apps/client/test/loginFlow.test.ts`.

**Interfaces:**
- Produces:
  - `relogin(account: string, passwordHash: string): void`. It resets the flow, keeps the two and certifies, as `login`
    does after hashing. The hash is never hashed again.
  - `WorldEntry.serverId: number`: the parent server of the channel handed over.
  - A 20 s timeout on the login-server step, from `selectChannel` to the character list. It fails with the existing
    TIMEOUT text.
- [ ] **Step 1: Write the failing tests:**
  - `relogin` sends CERTIFY equal to `encodeCertify(account, HASH)` and keeps no plain password;
  - `handOver` gives the `serverId` of the channel's parent;
  - a character list that never comes fails at 20 s with the timeout text and closes both channels;
  - a reset after `relogin` clears the hash.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/loginFlow.test.ts`. Expected: the new cases fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the login flow logs in again from the kept hash`.

### Task 2: The kept login and the reconnect

**Files:**
- Create: `apps/client/src/lobby/reconnect.ts`.
- Test: `apps/client/test/reconnect.test.ts` (fake flow events, the fake clock of `test/helpers/fakeChannel.ts`).

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `KeptLogin`:
    - `{ account; passwordHash; serverId; channelId; playerId }`;
    - `class KeptLoginHold { constructor(login: KeptLogin, clock: FlowClock, onExpire: () => void); get(): KeptLogin | null; clear(): void }`.
  - `interface ReconnectOut`:
    - `box(state: { text: string; canReconnect: boolean; busy: boolean }): void`;
    - `enter(character: CharacterSummary): void`;
    - `toLogin(message?: string): void`, `toServers(message: string): void`, `toCharacters(message: string): void`.
  - `class Reconnect`:
    - `constructor(flow: Pick<LoginFlow, 'relogin' | 'selectChannel' | 'dispose'>, hold: KeptLoginHold, out: ReconnectOut, message: string)`;
    - `tap(): void`;
    - `handle(event: LobbyEvent): boolean`;
    - `back(): void`.
- [ ] **Step 1: Write the failing tests.**
  - **The happy path:** `tap()`, then the server list with the channel, then the characters with the player id, gives
    `relogin`, `selectChannel(that channel)` and `enter(that character)`, in that order. Nothing else is called.
  - **One at a time:** a second `tap()` while running does nothing, and the box reads busy.
  - **Each refusal of ruling 6** lands where the ruling says. 103 keeps the box with ruling 5's text, disposes the flow
    and calls no CLOSE.
  - **Back to login:** during an attempt it disposes the flow and clears the hold. A later flow event is not taken
    (`handle` returns false).
  - **The 5 minutes:**
    - after them, `get()` is null and the box offers only Back to login;
    - an attempt running at 5:00 finishes;
    - the box text of ruling 8.
  - **The clock:** no timer of the hold is left after `clear()`.
- [ ] **Step 2:** Run `npx vitest run apps/client/test/reconnect.test.ts`. Expected: FAIL (the module is missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): the reconnect, one tap at a time, with a login kept for 5 minutes`.

### Task 3: The drop in the world screen

**Files:**
- Create: `apps/client/src/world/hud/dropBox.ts`.
- Modify:
  - `apps/client/src/world/WorldScreen.ts`: the drop path;
  - `apps/client/src/style.css`.
- Test: `apps/client/test/dropBox.test.ts` (jsdom).

**Interfaces:**
- Consumes: Task 2's `ReconnectOut.box` state.
- Produces:
  - `class DropBox(art, doc)`:
    - `element`;
    - `show(state: { text; canReconnect; busy }): void`;
    - `onReconnect`, `onBack`;
    - `dispose()`.
  - `interface DroppedWorld`:
    - `message: string`;
    - `kept: KeptLogin`;
    - `box(state): void`;
    - `onReconnect: () => void`, `onBack: () => void`, set by the lobby;
    - `close(): void`: ends the frozen world without `onEnd`.
  - `WorldScreen.open(root, entry, open, onEnd, audio, onDrop?: (drop: DroppedWorld) => void)`.
- [ ] **Step 1: Write the failing tests:**
  - **`dropBox.test.ts`:**
    - the text and the two buttons;
    - `busy` greys Reconnect and shows "Reconnecting…";
    - `canReconnect: false` hides Reconnect;
    - each button calls its callback once;
    - Escape does not close the box.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** `DropBox`, and in `WorldScreen`:
  - a session `ended` after the first shown frame, with `onDrop` given, freezes the world (ruling 2) and shows the box;
  - it builds the `KeptLogin` from the entry, then drops `this.entry`'s hash and the session;
  - it calls `onDrop`;
  - `close()` runs `end` without `onEnd`.

  Every other ending is as today.
- [ ] **Step 4:** Run the test file and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): a dropped world freezes behind the reconnect box`.

### Task 4: The lobby runs it

**Files:**
- Modify:
  - `apps/client/src/lobby/LobbyApp.ts`: `onEnter` gives an `onDrop`, and while a `Reconnect` is open `handle` gives it the
    flow's events first;
  - `apps/client/src/main.ts`;
  - `apps/client/e2e/lobbyHarness.ts`.
- Test: `apps/client/test/lobbyReconnect.test.ts` (jsdom, with a fake flow and a fake dropped world).

**Interfaces:**
- Consumes: Tasks 1-3.
- [ ] **Step 1: Write the failing tests:**
  - **The full path:** a drop opens a `Reconnect`; Reconnect taps `relogin`; the fresh list and characters lead to
    `close()` of the old world and `onEnter` with the new entry.
  - **Back to login:** `close()`, then the login form, with the account field kept.
  - **No lobby screen behind:** the flow's events during the attempt draw no lobby screen.
  - **Each refusal route of ruling 6.**
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it, `apps/client/test/loginFlow.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(client): one tap reconnects to the same character (Piece 6 M3)`.

### Task 5: The browser spec, the docs and the checkpoint

**Files:**
- Create: `apps/client/e2e/recovery.spec.ts`, `docs/piece6-m3-checkpoint.md`.
- Modify:
  - `apps/client/e2e/worldHarness.ts`: `closeLogin(code)`; a world script per JOIN (`world` may be a function of the
    JOIN's count);
  - `apps/client/e2e/world.spec.ts`: the drop case of `:779-788` now shows the box;
  - `docs/device-testing.md`: "Piece 6, milestone 3", and one test table for milestones 2 and 3;
  - `README.md`.
- [ ] **Step 1: Write `recovery.spec.ts`** on desktop and phone:
  - **A cache drop (4002):**
    - the box shows "The connection to the game was lost." over the world;
    - nothing more is sent while it shows;
    - Reconnect sends a second CERTIFY equal to the first, GETPLAYERLIST, PRE_JOIN and JOIN;
    - the world comes back with the second JOIN's HP;
    - no chat line said before the drop is sent again.
  - **A login drop:** the same, from `closeLogin`.
  - **103 on the reconnect:** the box says to wait; a later tap, answered normally, enters.
  - **Back to login:** the login form, with the account kept.
  - **A drop before the world was shown:** the login form as before, with no box.
  - No `pageerror`.
- [ ] **Step 2:** Run `npm run test:e2e:client -- recovery.spec.ts world.spec.ts` once, with the port workaround if
  5174 is held. Expected: all pass.
- [ ] **Step 3: Write the docs.** The device steps run on the VM:
  - stop the gateway mid-game, start it, wait 15 s, tap Reconnect;
  - log the same account in elsewhere, then tap Reconnect, and see the box's text;
  - wait out the 5 minutes;
  - Back to login.

  Then one table of the test commands for milestones 2 and 3.
- [ ] **Step 4:** Commit: `test(client): reconnect in the browser; M3 checklist and docs`.

---

## Owner's checkpoint (milestones 2 and 3 together)

From `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6`, with the owner's `dev:client` stopped:

| What | Command | Time | Pass |
|---|---|---|---|
| FFmpeg, then the MP3s | `winget install --id Gyan.FFmpeg -e`, a new PowerShell, then `npm run convert -- --only audio,data --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client"` | about 5 min | `0 failed` |
| All client browser tests | `npm run test:e2e:client` | about 40-50 min | no `failed` line |
| Real-file tests | `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 10 min | no `failed` line |
| Listening and reconnecting | `docs/device-testing.md`, "Piece 6, milestone 2" and "milestone 3" | about 40 min | every "Success:" holds |

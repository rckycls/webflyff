# Controls and cursors (2026-11-11)

The owner's four requests, on branch `controls-cursors` (from main 4088fa1). Desktop changes; the phone works as before,
except that its chat no longer stops a tap-walk (change 2).

## 1. Auto-walk: double W

**What it does.** Press W twice quickly: the character keeps walking forward with no key held. A and D still turn, and the
camera still works. It stops on:
- a press of W or S;
- a click on the ground (the character walks to that point and stops there);
- a press on a monster, an NPC or a player, or an attack or skill that starts;
- sitting, death, a take-off, a world change, and the page losing focus or being hidden.

**Neuz has this.** It is `g_WndMng.m_bAutoRun` in `CWndWorld::ControlGround`
(`Source/_Interface/WndWorldControlPlayer.cpp:157-193`). The rules are:
- W pressed again within **200 ms** of its let-go locks the walk. The three timers are `Set( 200 )` in `WndWorld.cpp:624-626`.
- S stops it (:157-160).
- A later W stops it (:176-177). A second press held 200 ms or more is just a normal walk.
- A take-off stops it (`MoverEquip.cpp:1820`), and so does entering the world (`WndManager.cpp:2142`).

**Deliberate differences.**
- The presses are read from the key events with their own times, not once a frame. A quick press between two slow
  frames still counts.
- Neuz keeps walking through the other stops above: a click walks there and then walks on, an attack is cleared every
  frame, and a dead player walks off after the revive. The browser stops instead, as the brief asked.

**Files.** `apps/client/src/world/autoRun.ts` (new); `WorldScreen.ts` (`autoRun`, the ground step, `stopOwnMover`,
`stepFlight`, the press handler); `combat/attackLoop.ts` (`commanding`).

## 2. Windows, the chat and the map no longer stop movement

**What stopped it.** Two things:
- **The chat.** Focusing it called `stopOwnMover`. That ended a walk to a clicked point, and in the air it sent a ground STAND.
- **The world map.** Opening it let go of every held key, and while it was open it held every key. So a walk with W held
  stopped, and W, A, S and D did nothing.

The bag, the other windows and the Start menu did not stop a click-walk or a flight (checked in the browser).

**Now:**
- **The chat** lets go of the held keys only (`letGoOfKeys`). Neuz does the same: it clears W, A, S, D, Q and E while the
  chat has focus, and nothing else (`WndWorldControlPlayer.cpp:142-150`). A walk to a clicked point, the auto-walk and a
  flight go on. The phone's chat does the same, and also lets go of the joystick.
- **The map** passes W, A, S, D, Space and X on to the game (`MAP_PASSED_KEYS`), and opening it keeps those keys held
  (`releaseForMap`, `KeyboardInput.releaseExcept`). Neuz's map takes only the left press (`Neuz/Neuz.cpp:1246-1250`). Every
  other key is still held by the map, and M and Escape still close it.
- **Modal boxes** still hold every key, as Neuz's modal windows do (`Neuz.cpp:1253`). They do not stop the auto-walk, a
  click-walk or a flight.

This changes the old rule of Piece 6 M1 ("the map holds every key"). `worldMap.spec.ts` and `worldMap.test.ts` now test the
new rule.

## 3. Flight keys reversed

W now climbs (nose up) and S dives (nose down). Neuz has W dive (`bUp` sends OBJMSG_LOOKDOWN) and S climb
(`ControlFlying`, `WndWorldControlPlayer.cpp:847-861`).

A and D are unchanged: they turn the same way as on the ground, so "reversed" could only mean W and S. The phone's stick is
unchanged (forward dives), as the owner set it. The mouse right-drag is unchanged too.

**Files.** `controls.ts` (`flightKeys`); `WorldScreen.stepFlight`; `flightControl.ts` (doc comments); `flight.spec.ts`
(`climb` holds W now).

## 4. The V15 cursors

**The files.** Neuz loads 15 static cursors from `Client/Cursor` (`Neuz.cpp:284-299`; ids in `Neuz.h:7-25`). None is
animated. Each is a 32x32 picture with a 1-bit mask, and the hotspot is read from the file. The converter now makes all of
them into `ui/<name>.png` (`uiStage.ts`, `CURSOR_FILES`).

**The rules** (`apps/client/src/world/hud/cursors.ts` and the end of `style.css`):

| Where | Cursor | Neuz |
|---|---|---|
| Any window, button or control | CUR_BASE (`curBase`) | `WndBase.cpp:2270-2273` |
| An edit box, unless read-only | CUR_EDIT (`edit`) | `WndEditCtrl.cpp:1333-1342` |
| A window's edge | the resize cursors (`hori`, `resize_h`, `cur00001`, `cur00002`) | `WndNeuz.cpp:680-730` |
| The NPC dialog's answers and keys | CUR_SELECT | `WndDialog.cpp:161-232` |
| The NPC dialog's context words | CUR_HELP | `WndDialog.cpp:161-232` |
| The bag in upgrade mode | CUR_HAMMER (`anvil`, already there) | `WndField.cpp:2811-2829` |
| A monster in the world | CUR_ATTACK | `WndWorld.cpp:2588-2589` |
| An NPC (peaceful, not a player) | CUR_NPC | `WndWorld.cpp:2581-2585` |
| Another player | CUR_BASE | players are peaceful (`propMover.txt`) |
| A dropped item | CUR_GETITEM | `WndWorld.cpp:2592-2593` |
| The ground, with your own shop up, the shop window open, or Jewel Setting open | CUR_NO | `WndWorld.cpp:2629-2652` |
| The ground otherwise | CUR_BASE | |
| While the world first loads | CUR_DELAY | Neuz shows it as the game starts, `Neuz.cpp:1563` |

The cursors show on a computer only (`@media (hover: hover) and (pointer: fine)`). A phone shows none. If a picture is
missing, the browser's own cursor shows.

**Deliberate differences.**
- The mover under the mouse is picked as the mouse moves, and again every 10th frame while it rests. Neuz highlights every
  frame.
- CUR_CAMERA is not used. It is Neuz's middle-button camera; the browser turns the camera with the right button, as Neuz's
  default interface does, and that keeps the normal cursor.
- CUR_CONTROL is not used: the browser has no world controls (chests, levers).
- No hourglass on a teleport, as in Neuz. It shows only while the world first loads.
- The lobby and log-in screens keep the browser's cursor. Only the game world uses the V15 cursors.

## The convert the main folder needs

The cursor pictures (UI only; this does not touch `itemProps.json`):

```
npm run convert -- --only "anvil,curAttack,curBase,curCamera,curControl,curDelay,edit,curGetItem,curHelp,curNo,curNPC,curSelect,hori,resize_h,cur00001,cur00002"
```

It should end with `ui: 16 ok, 0 warn, 0 failed`. In this worktree it did.

## Checks

- `npm run typecheck`: clean.
- `npx vitest run`: 4331 passed, 9 skipped, 5 failed. The 5 are main's known ones (3 in `looks.test.ts`, 2 in
  `inventoryWindow.test.ts`). New tests: `autoRun.test.ts`, `cursors.test.ts`; extra cases in
  `controls.test.ts` (`flightKeys`) and `worldMap.test.ts`.
- e2e (`E2E_CLIENT_PORT=5190`, Chromium):
  - `controlsCursors.spec.ts` (new): 6 passed (5 desktop, 1 phone).
  - `controls.spec.ts`, `flight.spec.ts`, `navigation.spec.ts`, `worldMap.spec.ts`, desktop and phone: 25 passed in one run,
    with one failure: `flight.spec.ts:277` ("land: the broom used again", desktop). Under load the flier goes farther
    before it lands and comes down on a roof (2.9 m over the terrain). It passed 3 out of 3 alone.

**For the owner** (desktop and phone; all should pass):

```
npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone controlsCursors controls.spec flight.spec navigation.spec worldMap.spec
```

**By hand on a PC:**
- Press W twice quickly: the character walks on by itself. Press I, M and Enter: it keeps walking. Press S: it stops.
- While flying, W climbs and S dives.
- The mouse shows the sword over a monster, the speech cursor over an NPC, and the V15 arrow elsewhere.

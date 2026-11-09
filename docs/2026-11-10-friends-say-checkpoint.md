# Friend window and `/say`: checkpoint (2026-11-10)

Branch `friends-say` (worktree `FlyffWeb-worktrees/friends-say`), from main f7f40be. Research:
`docs/superpowers/specs/2026-11-10-friends-say-research.md`. Not merged, not pushed.

## Built

- **Protocol** (`packages/protocol/src/world/friends.ts`): every messenger packet both ways, as Neuz reads and writes
  them. The snapshots ADDFRIENDGAMEJOIN (the list at log-in), ADDFRIEND, ADDFRIENDREQEST, ADDFRIENDCANCEL,
  REMOVEFRIEND and ADDFRIENDERROR. The core's ADDFRIENDJOIN, ADDFRIENDLOGOUT, GETFRIENDSTATE, SETFRIENDSTATE,
  ONEFRIEMDSTATE, FRIENDINTERCEPTSTATE, FRIENDNOINTERCEPT, ADDFRIENDNAMENOTFOUND and REMOVEFRIENDSTATE, and **SAY**. The
  client's ADDFRIEND, ADDFRIENDREQEST, ADDFRIENDNAMEREQEST, ADDFRIENDCANCEL, GETFRIENDSTATE, SETFRIENDSTATE,
  FRIENDINTERCEPTSTATE and REMOVEFRIEND. Testkit writers in `packages/testkit/src/friends.ts`.
- **Friend list** (`apps/client/src/world/friends/messenger.ts`): `CRTMessenger` and what each handler does. It is the
  screen's, so a world change keeps it. GETFRIENDSTATE goes out when the list comes, when a friend is added and when the
  window opens.
- **Messenger window** (`hud/friends/messengerWindow.ts`), `CWndMessengerEx`, 352 x 368 "Messenger". Owner change
  (2026-11-10): it opens centred above the task bar (Neuz: bottom right), and on a phone at the phones' 0.7 size like
  the other windows (it was fitted to the whole screen):
  - the own 32 px state icon, the name, "(state)", and the server and channel names;
  - the state menu (Online, AFK, Addict Mode, Eating, Resting / Vending, Moving, Offline), which sends SETFRIENDSTATE;
  - the five column heads, sorting as the C++ comparisons do (each press flips its own direction);
  - the tabs Friend, Guild and Mentor-Pupil; the + button (Add Friend).
  - The Friend tab's rows (`CWndFriendCtrlEx`): the channel, state and job icons from `icon_PlayerData`, the level, and
    the name (blue when selected, red when blocked, cut after 10 letters); the job's name as a tooltip; a scroll bar.
    Click selects. A double click opens the Message window, or says "not connected" or "blocked". A right click opens the
    menu: Message, Block/Unblock, Delete, Move (game masters: `/teleport "name"`), Invite to join party, Send a memo
    (greyed), House Entry Permissions (greyed).
- **Opening**: Start → Messenger (after Chatting) and **E** (`APP_MESSENGER_EX`).
- **Add Friend** (`CWndAddFriend`): the name's checks (too long, oneself, guild siege), then ADDFRIENDNAMEREQEST and the
  "You have asked..." line. **"Add to my list"** in a player's menu is no longer greyed: a friend already gets the box,
  else ADDFRIENDREQEST.
- **Request** (`CWndFriendConFirm`): "%s wants to be your friend. Do you accept?". Yes sends ADDFRIEND with the asker's
  and one's own sex and job; No sends ADDFRIENDCANCEL. With `/mr` on, or a Confirm already open, it answers BLOCK 2 or 6
  instead. The answers give the lines and boxes (refused, already a friend, not connected, does not exist), and BLOCK 1,
  2 and 6 their lines.
- **`/say`**: the chat sends it as typed (the server's command); the answer **SAY** is now read (`OnSay`):
  - one's own line goes into the **Message window** for that name (`CWndMessage`, "Message - name", resizable, Enter or
    Send sends `/say "name" text`; own name red, the other's blue);
  - another's line goes into its open window; with none, it goes into an **instant message** at the bottom right (gone
    after 10 s, a press opens the window with the line) and a yellow `[name] text` line;
  - "not connected" when the core says so;
  - a blocked friend's line is dropped, and one's own to it says so and stops that window's sending.
- **Whispers**: a blocked friend's whisper is dropped. With `/wr` on, another's whisper is answered with BLOCK 1 and not
  shown. `/r` was already there.
- **Client commands** `/wa /wr /ma /mr /ca /cr`: they set the three options and put their lines. The options are kept in
  the browser's storage (Neuz: neuz.ini). A friend's log-in shows the instant message "{name}has logged into the game."
  while `/ca` is on.
- **Auto-absent**: a key or a press sends Online again while the own state is auto-absent.
- **Pictures**: 11 theme files added to the UI stage (`ButtMsgRight`, `ButtMessAdd`, `ButtMessNote`, the five
  `ButtMessenger*` heads, `WndMail`, `ButtSend`, `WndInstantMsg`), converted into this worktree's `dist/assets` only.

## Left out, and why

- **Guild and Mentor-Pupil tabs**: drawn, but their lists stay empty. The browser keeps no guild or campus member list
  (no guild window, no campus packets). The campus points line is left blank for the same reason.
- **Memos** (the note button, "Send a memo", `CWndMessengerNote` / `CWndMessageNote`): need the tag packets and their
  windows. The button and the entry are greyed.
- **Mail icon** (`MODE_MAILBOX` flashing): the browser has no post.
- **House Entry Permissions**: no housing in the browser; the entry is greyed.
- **The tab remembered across sessions** (`SerializeRegInfo`): the window opens on Friend.
- **Gateway / servers**: nothing was missing. Every packet above passes the gateway unchanged. As in Neuz, the channel in
  the friends' state packets is dropped: the channel icon comes from the player data's log-in (UPDATE_PLAYER_DATA /
  QUERY_PLAYER_DATA).

## Device checklist entry

> **Messenger and /say** (desktop and landscape phone).
> 1. Log in with a character that has friends. Press E (desktop) or Start → Messenger. The window opens in the middle
>    of the screen (smaller on the phone), titled "Messenger", with your name, "(Online)" and the server and channel names. Online friends are listed
>    first with a channel and state icon, their level, job icons and name.
> 2. Press each column head twice; the order flips.
> 3. Right-click (long-press on the phone) a friend: Message, Block, Delete, Invite to join party. Block turns the name
>    red; Unblock turns it back.
> 4. Double-click an online friend; type a line and press Enter. The friend gets a pop-up at the bottom right; clicking it
>    opens the same window on their side. Their answer appears in blue in your window.
> 5. Type `/say FriendName hello` in the chat: the Message window opens with your line.
> 6. Press + and add a name; the other player gets "... wants to be your friend. Do you accept?"; Yes adds both.
> 7. Have a friend log in: a pop-up says "Namehas logged into the game."
> 8. Type `/wr`, then have someone whisper you: nothing shows, and they are told you refuse whispers. `/wa` turns it back.
> 9. Phone: the Messenger opens in the middle at about two thirds of its desktop size; the texts are 14 px; closing it
>    brings back the joystick.

## Main folder: convert command

The main folder needs only the new UI pictures (this does not touch `itemProps.json`):

```
npm run convert -- --only "ButtMsgRight*,ButtMessAdd*,ButtMessNote*,ButtMessenger*,WndMail*,ButtSend*,WndInstantMsg*"
```

## Tests

- New: `packages/protocol/test/friends.test.ts`, `apps/client/test/friends.test.ts`, `apps/client/test/friendHud.test.ts`,
  `apps/client/e2e/friends.spec.ts`. Updated for the Start menu's twelfth line and the enabled "Add to my list":
  `apps/client/test/hud.test.ts`, `apps/client/test/playerMenu.test.ts`.
- `npm run typecheck`: clean.
- `npx vitest run`: 4091 passed, 9 skipped, 5 failed. The 5 are the old ones on main: `looks.test.ts` (3, heldModels)
  and `inventoryWindow.test.ts` (2).
- Playwright, Chromium, desktop and landscape phone (`friends.spec.ts`, `talking.spec.ts`, `party.spec.ts`): 27 passed,
  1 skipped (talking's desktop-chat test skips on the phone, as before). Run on port 5178 with a config of the
  worktree's own (`.superpowers/`, not committed).

### For the owner: the full suites

```
npx vitest run
```
Pass: only the 5 old failures above.

```
npx playwright test -c apps/client/playwright.config.ts friends.spec.ts talking.spec.ts party.spec.ts --project chromium --project phone
```
Pass: 27 passed, 1 skipped. (Set `E2E_CLIENT_PORT` to another port if your dev server holds 5174.)

```
npm run test:e2e:client
```
Pass: no new failure (the old `travel-items.spec.ts` "the Scroll of Return ..." may still fail, as on main).

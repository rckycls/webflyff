# The desktop chat: checkpoint (2026-11-09)

The owner's request: "fix the chat on desktop view. research the old client and online on how the original chat works
and make the changes from it."

Branch `chat-desktop` in `FlyffWeb-worktrees/chat-desktop`, from local main `386a418`. Nothing is merged or pushed. The
research is [superpowers/specs/2026-11-09-chat-desktop-research.md](superpowers/specs/2026-11-09-chat-desktop-research.md):
Neuz's `CWndChat` read from the C++ and `resdata.inc`, plus what the web has on the classic chat.

## What the desktop chat is now

On the desktop (anything but a phone-sized touch screen, `(max-width: 1000px) and (pointer: coarse)`, chosen when the
world opens) the chat is Neuz V15's chat window. The phone keeps its own chat as it was.

- **The window**: 528 x 128 at the bottom left, on the task bar; the see-through WndTile300-311 frame, no title bar; the
  peach WndChatEdit strip under the line, with its speech-bubble mark; the line's words black on its white field.
- **Moving and resizing**: a press on any free part (the messages too) moves it; the edges and corners drag in 16 px
  steps, down to 464 x 48, and the controls follow (`OnSize`); the move lock (the small lock) keeps it still.
- **Tabs**: Chat, Whisper, Shout, Party, Guild, the client's own pictures. Party is enabled only in a party, Guild only in
  a guild. A tab puts "", "/w ", "/s ", "/p " or "/g " in the line and gives it the focus; an empty line that takes the
  focus gets its tab's prefix ("/w <last name whispered> " on Whisper).
- **What a tab shows**: its filter (Chat: everything; the others: General and their own kind) plus the system lines. The
  lines are kept apart from the tabs, so a tab chosen later shows what came before.
- **Option**: the "Chatting Filter" window: this tab's five checks, its own disabled; a check changes what the tab shows.
- **System**: shows or hides the System window beside the chat (right of it if it fits). It gets the game lines (the
  client's messages, quest lines, "Whisper unavailable" ...) and the chat lines this tab hides, never a shout. Right-click:
  "Hide".
- **Lock**: on, the line keeps the focus after Enter, for the next line; off (the default), the focus goes back to the
  world.
- **Help** and **Close**: Close closes the chat; Enter opens it again where it was (see "Left out").
- **The line**: Enter sends; no Send button. Arrow Up/Down bring back sent lines; "/" shows the command list (both as
  before). "/r " becomes "/whisper <the last one who whispered to you> ".
- **The messages**: written as Neuz writes them, each in its own colour: "Rocky : hi" white, "-> [Rocky] hi" and
  "<- [Rocky] hi" yellow, "[Rocky] hi" for shout (the server's colour, pink), party (green) and guild (light pink),
  announcements light yellow. A right-click on a line puts "/whisper <its sender> " in the line. 1000 lines, then the first
  500 go. 300 s after the chat was last used the words go invisible; a new line (not a yellow one) or a click brings them
  back.

## The differences fixed

Numbers are the research note's §9 table.

1. The CSS look: now Neuz's frame, strip and picture buttons.
2. Fixed to the task bar's left half: now a 528 x 128 window that moves and resizes.
3. Seven text tabs: now Neuz's five; Party and Guild enabled only when in one.
4. A tab showed only its own channel: now its prefix and its filter.
5. Filter disabled: now the filter window.
6. Lock disabled: now Neuz's Lock (keep typing).
7. System as a tab: now the System window.
8. A minimise button: gone; the move lock, Help and Close are there.
9. A Send button: gone; Enter sends.
10. "[nearby] Webby: text": now Neuz's line formats.
11. CSS colours per channel: now each line's own colour.
12. Shadowed text: now plain.
13. 150 lines: now 1000, then 500 go.
14. No fade: now the 300 s fade.
15. Right-click: now whispers the sender.
16. "/r ": now answers the last whisperer.
17. The line kept the focus after Enter: now it goes back to the world unless Lock is on.
18. The line's send errors: now red lines in the chat.
19. The macro mark: now drawn while the line holds words.

Also: a GM chat line (OnGMChat) is now an announcement, as Neuz has it, on both devices.

## Left out, and why

- **The anti-spam rules and the 120-byte cut** (§4, #20): they are `ParsingChat`'s, not the window's, and would change the
  phone too. A follow-up for both.
- **Instant help** (§7, #21): a "[Help]" tip every 2 minutes needs a new converted catalog (`Client/Client/instantHelp.inc`),
  and its first tip sends players to Gala's support address.
- **Dragging the macro mark to the task bar**: the task bar does not run chat shortcuts yet (they show as a greyed slot).
- **Help**: the web has no help window; the button shows its tooltip, "Chatting Window", and does nothing.
- **Enter on a closed chat**: in Neuz Enter does nothing until the Start menu's Chatting opens the chat again. The
  web's Start menu has no Chatting line, and adding one changes the menu's fixed size (five of its tests), so here Enter
  opens a closed chat. A follow-up can add the line.
- **Escape**: in Neuz, Escape closes the top window, which can be the chat, and with it closed Enter does nothing. Here
  Escape leaves the line, and then works as before (target, windows, the Start menu); the chat is never closed by it.
- **A press on the messages also acting on the world under them** (`CWndChat::OnLButtonDown`): left out; the press moves
  the chat, as in Neuz.
- **Saving** the Lock, the filters and the chat's place between sessions (Neuz's `regInfo.dat` and `neuz.ini`): not
  done; each session starts with Neuz's defaults.
- **The whisper replies' texts** ("Whisper unavailable: ...") stay the web's; Neuz uses `TID_GAME_MSGNOTEXIST` and
  `TID_GAME_MSGNOTTRANSELF`. They now go to the System window on the desktop.
- **The Korean and Chinese IME mark** (`WIDC_STATIC1`): not for an English client.

## Files

- `apps/client/src/world/hud/chatRules.ts` (new): the rules (line formats and colours, tabs and filters, the System
  window's share, prefixes, "/r ", the right-click's name, the layout, the strip).
- `apps/client/src/world/hud/neuzChat.ts` (new): the chat window, the System window and the filter window.
- `apps/client/src/world/hud/chatInput.ts` (new): the history and the command list, taken out of `chatWindow.ts`
  unchanged, for both chats.
- `frame.ts`: windows with no caption, another tile set, edges that drag (`resizeDirection`, `resizeRect`), and the open
  windows refit when the task bar sets its room. `resWindow.ts`: the scroll bar is a function the chat uses too.
  `radio.ts`: `sixFrameButton`. `style.css`: the chat's rules. `WorldScreen.ts`: the desktop gets `NeuzChat`.
- `tools/convert/src/ui/uiStage.ts`: the chat's 25 pictures.
- Tests: `test/chatRules.test.ts`, `test/frameNoCaption.test.ts`, `test/neuzChat.test.ts` (new); `e2e/talking.spec.ts`
  (desktop branches and a new desktop test); `e2e/party.spec.ts`, `travel.spec.ts`, `quests.spec.ts`, `world.spec.ts`
  (their chat locators on the desktop).

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run`: 3893 passed, 9 skipped, 5 failed. The 5 fail on main `386a418` too (checked in the `ui-fixes`
  worktree, which is at main): `looks.test.ts` "a weapon goes to the right hand ...", "a shield goes to the shield grip",
  "a knuckle goes to the right forearm ..." (heldModels gained a field), and `inventoryWindow.test.ts` "keeps desktop
  double click working after single-click inspection", "a ride shows Use on the phone ...". Not touched here.
- E2E (Chromium, port 5177, desktop and phone): `talking`, `party`, `travel` and `quests` pass on both (40 passed;
  the desktop chat test skips on the phone). `travel-items.spec.ts` "the Scroll of Return ..." fails on both, and on main
  too (checked in the `ui-fixes` worktree): a strict-mode clash on `.hud-message`, not the chat. `world.spec.ts` was
  changed (one locator) but not run here.

## For the owner

**Convert in the main folder** (only the chat's pictures; it does not touch `data/`, so your high-rate `itemProps.json`
stays):

```bash
npm run convert -- --only "WndTile3*,WndChatEdit*,ButtChat*,ButtWndLock*,wndButtMacroChat*"
```

Pass: "ui: 25 ok, 0 warn, 0 failed".

**The full suites** (from the FlyffWeb folder; your `dev:client` on 5174 can stay up):

```powershell
$env:E2E_CLIENT_PORT = '5177'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone
```

Pass: every test passes or is skipped (the desktop-only chat test skips on the phone), except `travel-items.spec.ts`'s
Scroll of Return test, which fails on main already.

**By eye**, on the PC: the chat at the bottom left looks like the old client's; drag an edge, drag the messages, try
each tab, Lock, Option, System, a right-click on a name, and "/r ".

# The desktop chat: checkpoint (2026-11-09)

The owner's request: "fix the chat on desktop view. research the old client and online on how the original chat works
and make the changes from it." Then, on the first pass's list of what was left out: "I think what you left out is an
important essence of the chat. Please do that."

Branch `chat-desktop` in `FlyffWeb-worktrees/chat-desktop`, from local main `386a418`. Nothing is merged or pushed. The
research is [superpowers/specs/2026-11-09-chat-desktop-research.md](superpowers/specs/2026-11-09-chat-desktop-research.md):
Neuz's `CWndChat` read from the C++ and `resdata.inc`, plus what the web has on the classic chat.

## What the desktop chat is now

On the desktop (anything but a phone-sized touch screen, `(max-width: 1000px) and (pointer: coarse)`, chosen when the
world opens) the chat is Neuz V15's chat window. The phone keeps its own chat window; what Neuz does when a line is sent
(below, "Sending") now holds on both.

- **The window**: 528 x 128 at the bottom left, on the task bar; the see-through WndTile300-311 frame, no title bar; the
  peach WndChatEdit strip under the line, with its speech-bubble mark; the line's words black on its white field.
- **Moving and resizing**: a press on any free part (the messages too) moves it; the edges and corners drag in 16 px
  steps, down to 464 x 48, and the controls follow (`OnSize`); the move lock (the small lock) keeps it still. A press on
  the messages also goes to the world under them (it walks there, picks, or a right drag turns the camera), as Neuz hands
  it on.
- **Tabs**: Chat, Whisper, Shout, Party, Guild, the client's own pictures. Party is enabled only in a party, Guild only in
  a guild. A tab puts "", "/w ", "/s ", "/p " or "/g " in the line and gives it the focus; an empty line that takes the
  focus gets its tab's prefix ("/w <last name whispered> " on Whisper).
- **What a tab shows**: its filter (Chat: everything; the others: General and their own kind) plus the system lines. The
  lines are kept apart from the tabs, so a tab chosen later shows what came before.
- **Option**: the "Chatting Filter" window: this tab's five checks, its own disabled; a check changes what the tab shows.
- **System**: shows or hides the System window beside the chat (right of it if it fits). It gets the game lines (the
  client's messages, quest lines, whisper replies ...) and the chat lines this tab hides, never a shout. Right-click:
  "Hide".
- **Lock**: on, the line keeps the focus after Enter, for the next line; off (the default), the focus goes back to the
  world.
- **Help**: the "Fast Help" window with help.inc's chat text. **Close** closes the chat; Enter (2026-11-10, the
  owner's: in Neuz it does nothing then) or the Start menu's new **Chatting** line opens it again where it was.
- **Escape and F1-F9**: they are the game's even while the line is typed in. Escape clears the target, else closes the
  window on top, which is the chat while you type in it (and, with nothing else open, the chat). F1-F9 use the task bar.
- **The macro mark**: while the line holds words, drag the speech bubble to the task bar: a chat shortcut (its picture
  icon_MacroChat, its line as its name; ten at most, "You can only place 10 sentences here."). Its slot or F-key sends
  the line as if typed.
- **The line**: Enter sends; no Send button. Arrow Up/Down bring back sent lines; "/" shows the command list (both as
  before). "/r " becomes "/whisper <the last one who whispered to you> ".
- **The messages**: written as Neuz writes them, each in its own colour: "Rocky : hi" white, "-> [Rocky] hi" and
  "<- [Rocky] hi" yellow, "[Rocky] hi" for shout (the server's colour, pink), party (green) and guild (light pink),
  announcements light yellow. A right-click on a line puts "/whisper <its sender> " in the line. 1000 lines, then the first
  500 go. 300 s after the chat was last used the words go invisible; a new line (not a yellow one) or a click brings them
  back.
- **Kept for the next time** (in the browser): the chat's place and size once moved or resized, Lock, each tab's filter.

### Sending (both chats)

As Neuz's `ParsingChat` and the commands' client halves:

- a line is cut at 120 bytes and its outer quotes taken off;
- the word filter (Filter_ENG.inc) turns rude words to asterisks in plain lines, shouts, party and guild chat;
- shout, party and guild chat go as "/s text", "/p text", "/g text" whatever was typed (the phone's Party view too, which
  sent "/partychat"); party chat out of a party: "Unable to use the party chat function.";
- the anti-spam: the same line within 2 s, a line within 0.7 s of the last, a 5th such line or a 2nd within 1 s
  (a 3-minute block, "Currently your chat has been blocked.(Remaining: m minute s second)"); the same shout within 3 s;
  chat shortcuts 3 s apart. A game master skips it;
- whisper replies use Neuz's texts ("X does not exist.", "You cannot send a PM to yourself, silly.", "That player is not
  connected."). A GM chat line is an announcement.

## The differences fixed

All 28 rows of the research note's §9 table: the look, place, move and resize, tabs and their prefixes, filters and the
filter window, Lock, the System window, Help and Close, no Send button, Neuz's line formats and colours, plain text, the
1000-line text, the fade, the right-click whisper, "/r ", the focus after Enter, red lines for send errors, the macro
mark and chat shortcuts, the anti-spam and the 120-byte cut, the commands' short names and the word filter, Escape and
F1-F9, the mouse handed to the world, the Fast Help window, the whisper replies, and the settings kept. Row 21 (instant
help) needs nothing: this client's tips are all commented out, so V15 shows none.

## Not done, and why

- **The Korean and Chinese IME mark** (`WIDC_STATIC1`): Neuz draws it for those languages only; an English client shows
  nothing there.
- **The shout limit** (`m_nShoutLimitCount`): it comes from Neuz's command line, 0 as the launcher starts it: no limit.
- **The "#l" code-page marks** in a line: a Korean IME's.
- **Help's lookup**: V15 looks up "Chatting Window" exactly and help.inc says "Chatting window", so its window opens
  empty. Here the case is not minded and the window shows the chat's help text.
- **The phone's chat window** keeps its own look and tabs (the owner's request was the desktop view); only the sending
  rules above changed on it.
- Small approximations: the word filter keeps the spaces as typed (Neuz rebuilds them, one between words); the chat
  shortcut flag lasts one line (Neuz's lasts until the next plain line); the settings are kept per browser, not per PC
  folder.

## Files

- `apps/client/src/world/hud/neuzChat.ts` (new): the chat window, the System window, the filter and Fast Help windows.
- `apps/client/src/world/hud/chatRules.ts` (new): line formats and colours, tabs and filters, the System window's share,
  prefixes, "/r ", the right-click's name, the layout, the strip.
- `apps/client/src/world/hud/chatSend.ts` (new): `ParsingChat` and the commands' client halves, the word filter.
- `apps/client/src/world/hud/chatSettings.ts` (new): what is kept for the next time.
- `apps/client/src/world/hud/chatInput.ts` (new): the history and the command list, taken out of `chatWindow.ts`.
- `chatWindow.ts` (the phone's): sends through `chatSend.ts`. `frame.ts`: windows with no caption, another tile set,
  edges that drag, controls before the edges, `onPlaced`, a public `raise`; the open windows refit when the task bar sets
  its room. `resWindow.ts`: `textScrollBar`. `radio.ts`: `sixFrameButton`. `taskBar.ts` / `taskBarEdits.ts`: chat
  shortcuts (carried, drawn, capped at ten), the Start menu's Chatting line, F1-F9 from the chat's line. `gameData.ts`:
  the optional `data/chat.json`. `WorldScreen.ts`: the desktop chat, its wiring, chat shortcuts used, whisper replies.
  `style.css`: the chat's rules.
- Converter: `tools/convert/src/data/chatCatalog.ts` (new, the `chat` stage: `data/chat.json`, the word filter and
  help.inc), `uiStage.ts` (the chat's 25 pictures), `run.ts`. Formats: `CHAT_KEY`, `WebChat`.
- Tests (new): `test/chatRules.test.ts`, `test/chatSend.test.ts`, `test/frameNoCaption.test.ts`, `test/neuzChat.test.ts`,
  `tools/convert/test/chatCatalog.test.ts`. Changed: `test/chatWindow.test.ts` (Neuz's short names, "/p" for the Party
  view), `test/hud.test.ts` (the 11-line Start menu, chat shortcuts), the converter's stage-order tests.
- E2E: `talking.spec.ts` (desktop branches; the desktop chat test), `party.spec.ts` ("/p text"), `travel.spec.ts`,
  `quests.spec.ts`, `world.spec.ts`, `fight.spec.ts`, `audio.spec.ts` (on the desktop a first Escape closes the chat).

## Checks run here

- `npm run typecheck`: clean.
- `npx vitest run`: 3911 passed, 9 skipped, 5 failed. The 5 fail on main `386a418` too (checked in the `ui-fixes`
  worktree, which is at main): `looks.test.ts` "a weapon goes to the right hand ...", "a shield goes to the shield grip",
  "a knuckle goes to the right forearm ...", and `inventoryWindow.test.ts` "keeps desktop double click working after
  single-click inspection", "a ride shows Use on the phone ...". Not touched here.
- E2E (Chromium, port 5177): `talking`, `party`, `travel.spec` and `quests` on desktop and phone pass. In one run with 4
  workers while the unit tests ran too, 5 of them timed out; each passed when run again alone. The three tests changed
  for Escape (`fight.spec.ts` the own death, `world.spec.ts` the status window, `audio.spec.ts` the Option window at
  logout) pass on the desktop. `travel-items.spec.ts` "the Scroll of Return ..." fails on main already (a strict-mode
  clash on `.hud-message`); the rest of the suites were not run here.

## For the owner

**Convert in the main folder** (the chat's pictures and its catalog; it does not touch `data/itemProps.json`, so your
high-rate values stay):

```bash
npm run convert -- --only "chat,WndTile3*,WndChatEdit*,ButtChat*,ButtWndLock*,wndButtMacroChat*"
```

Pass: "ui: 25 ok" and "data: 1 ok", 0 failed.

**The full suites** (from the FlyffWeb folder; your `dev:client` on 5174 can stay up):

```powershell
$env:E2E_CLIENT_PORT = '5177'; npx playwright test -c apps/client/playwright.config.ts --project=chromium --project=phone
```

Pass: every test passes or is skipped (the desktop-only chat test skips on the phone), except `travel-items.spec.ts`'s
Scroll of Return test, which fails on main already.

**By eye**, on the PC: the chat at the bottom left looks like the old client's; drag an edge, drag the messages, try each
tab, Lock, Option, System, Help, a right-click on a name, "/r ", the bubble dragged to the task bar and its F-key, Escape
(the chat closes; Enter or the Start menu's Chatting brings it back), and a reload (the chat where you left it).

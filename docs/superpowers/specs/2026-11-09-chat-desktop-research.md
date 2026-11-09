# The desktop chat: Neuz V15 research (2026-11-09)

The owner's request: "fix the chat on desktop view. research the old client and online on how the original chat works
and make the changes from it."

This note says how Neuz V15's chat window looks and behaves, and lists every way the web client's desktop chat differs
from it. The commands, the `/` list and the history are in `2026-11-05-ui-fixes-research-chat-tickets-wings.md` §A and
are not repeated here.

Sources:

- `Source/_Interface/WndCommunication.cpp` and `.h` (`CWndChat`, `CWndEditChat`, `CWndMacroChat`, `CWndTextChat`,
  `CWndChatLog`), `WndChatFilter.cpp`, `WndManager.cpp` (`PutString`, `ParsingChat`), `Neuz/DPClient.cpp` (how each line
  is written), `WndBase.cpp` (moving and resizing), `WndNeuz.cpp` (the frame), `ITheme.cpp` (the buttons),
  `_Common/HwOption.cpp` (the filters' defaults), `Neuz/Neuz.cpp` (Enter). All CP949: read them with
  `iconv -f cp949 -t utf-8 -c`; the line numbers stay the same.
- `Resource/resdata.inc` (plain ASCII), `Resource/WndStyle.h`, `Resource/resData.txt.txt` (English titles and tooltips),
  `Resource/textClient.inc` and `textClient.txt.txt` (UTF-16: the colours and texts of the TIDs).
- `Client/Theme/Default`: the pictures.
- Online: §8.

## 1. The window

`APP_COMMUNICATION_CHAT "WndTile308.tga" 1 528 128 0x410040 26` (`resdata.inc:21603`).

- **Size** 528 x 128. **Style** 0x410040 = `WBS_SOUND | WBS_MOVE | WBS_THICKFRAME` (`WndStyle.h`), and `Initialize` adds
  `WBS_KEY | WBS_THICKFRAME` (`WndCommunication.cpp:558`). There is **no `WBS_CAPTION`**: no title bar, no title.
- **Frame**: tiled from "WndTile308.tga". `CWndNeuz::AdditionalSkinTexture` drops the name's last 6 characters and adds
  `00` to `11` (`WndNeuz.cpp:276-278`), so the frame is **WndTile300 to WndTile311**, not the WndTile00-11 of the other
  windows. These tiles are a see-through grey-violet. The window draws no background of its own
  (`OnEraseBkgnd` returns TRUE, `:1287-1290`).
- **Client area**: the window less 4 left, 4 top, 6 right, 6 bottom (`SetWndRect`, `:1001-1016`), not the 18 px caption
  and 4/4/8/10 of the captioned windows.
- **Where**: at the left edge, its bottom on the task bar's top (`x = 0`, `y = layout bottom - height`,
  `:445-452`). Neuz opens it when the world opens (`WndManager.cpp:2176`).
- **Resize** (`WBS_THICKFRAME`): a press within 6 px of an edge or corner (`GetResizeDir`, `WndBase.cpp:1967-2001`)
  drags that edge; the drag moves in **16 px steps** (`:1196-1198`); an edge within 10 px of the screen's (above the task
  bar) goes onto it (`:1215-1229`); the least size is **464 x 48** (`AdjustMinRect( 16 * 29, 16 * 3 )`, `:1004`). The
  cursor shows the resize arrows over those 6 px (`CWndNeuz::OnSetCursor`, `WndNeuz.cpp:680-700`).
- **Move** (`WBS_MOVE`, no caption): `IsPickupSpace` is the whole window (`WndBase.cpp:2003-2023`), so a press anywhere
  the controls leave free drags the window, **the message area too**: `CWndTextChat::IsPickupSpace` returns FALSE
  (`WndCommunication.cpp:145-148`), so a press on the text goes to the window. Moving clings to the screen's edges as
  every window does.
- **Move lock** (`WIDC_MOVELOCK`, "ButtWndLock.tga"): checked, the window loses `WBS_MOVE` and stays put (`:678-689`).
- **Close** (`WIDC_CLOSE`, "ButtWndExit.tga"): closes the chat (`WTBID_CLOSE`, `:624-626`). While it is closed, Enter does
  nothing (`Neuz.cpp:1325-1339` needs the applet); the Start menu's Chatting applet opens it again.
- **Help** (`WIDC_HELP`, "ButtWndHelp.tga"): the window's help (`WTBID_HELP`), help key "Chatting Window"
  (`IDS_RESDATA_INC_002645`).
- The Lock check is saved with the window's place (`SerializeRegInfo`, `:592-612`).

## 2. The controls and where they go

`CWndChat::OnSize` (`:1017-1121`) lays everything out from the client area's size, every time it changes. With the
client area `w` x `h` (518 x 118 at the default size):

| Control | Picture | Where (client area) |
| --- | --- | --- |
| `WIDC_TEXT` the messages (`CWndTextChat`, `WBS_VSCROLL`) | | 0, 0 to `w`, `h - 39` (`:1025-1032`) |
| `WIDC_RADIO1` Chat | ButtChatChat.BMP | left 0, top `h - 38` (`:1072-1076`) |
| `WIDC_RADIO2` Whisper | ButtChatWhisper.BMP | left 50 |
| `WIDC_RADIO3` Shout | ButtChatShout.BMP | left 100 |
| `WIDC_RADIO4` Party | ButtChatTroupe.BMP | left 150 |
| `WIDC_RADIO5` Guild | ButtChatGuild.BMP | left 200 |
| `WIDC_CHECK1` Lock | ButtChatLock.bmp | left `w - 200`, top `h - 38` (`:1086-1087`) |
| `WIDC_BUTTON1` Option (the filter) | ButtChatFilter.BMP | left `w - 150` |
| `WIDC_CHECK3` System | ButtChatSystem.bmp | left `w - 100` |
| `WIDC_MOVELOCK` | ButtWndLock.tga | left `w - 49`, top `h - 37` (`:1099-1104`) |
| `WIDC_HELP` | ButtWndHelp.tga | left `w - 32`, top `h - 37` |
| `WIDC_CLOSE` | ButtWndExit.tga | left `w - 15`, top `h - 37` |
| `WIDC_MACRO_CHAT` | wndButtMacroChat.bmp | left 1, top `h - 19`, 19 x 19 (`:311-314`, `:1049-1053`) |
| `WIDC_EDIT` the line | | left 30, top `h - 18`, right `w - 20`, bottom `h` (`:306-309`, `:1041-1047`) |

- The tab and check buttons are 45 x 17 (resdata's rects). Their pictures hold six frames side by side (276 x 17: six of
  46), the word in the picture; `CTheme::RenderWndButtonRadio` / `Check` draw the frame and then the title at x = 48,
  outside the button, so no title shows (`ITheme.cpp:1533-1575`). The frames: 0 lit, 1 at rest, 2 checked and lit, 3
  checked, 4 disabled, 5 disabled and checked (`RenderWndButton_6Texture`, `:1418-1531`). ButtWndLock.tga is six frames of
  15 x 14. ButtChatFilter.BMP is a plain button, four frames of 44 x 16 (lit, rest, pressed, disabled).
- **The strip under the line** (`AdditionalSkinTexture`, `:1294-1312`) is painted into the frame: WndChatEdit00_1.tga
  (128 x 47, `__VER >= 11`, `:419`) at the window's bottom left, then WndChatEdit01.tga (16 x 47) every 16 px, with
  WndChatEdit02.tga (32 x 47) at the next-to-last place and nothing at the last (`(width - 128) / 16` places). It is the
  peach band behind the tabs and the white rounded field behind the line, with a speech-bubble mark at its left end.
- `WIDC_HEAD` (the old head field) is hidden and disabled at V15 (`:315-319`). `WIDC_STATIC1` shows the Korean and Chinese
  IME state only (`:218-276`).
- The macro button draws wndButtMacroChat.bmp only while the line holds words (`:93-99`). Dragged, it carries the line as
  a chat shortcut (`SHORTCUT_CHAT`) to the task bar (`:100-128`).
- The tooltips (`resData.txt.txt`): Chat "Send normal messages.", Whisper "Send whispering messages.", Shout "Send
  shouting messages.", Party "Send messages to party members.", Guild "Sending messages to guild members.", Option
  "Filter function which allows you to filter the chatting.", Lock "Allows you to chat constantly without pressing Enter
  after every message.", System "Show the window for inputted message of system."

## 3. The tabs and the filters

- A tab is a radio: one is checked (`:393-402`). **Party is disabled out of a party, Guild out of a guild**, checked every
  frame (`OnDraw`, `:212-216`).
- **Choosing a tab** (`:690-719`): Chat empties the line; Whisper puts "/w ", Shout "/s ", Party "/p ", Guild "/g " in it;
  the line takes the focus; the messages are filled again with what this tab shows (`SetChannel`, `:518-544`), scrolled
  to the end.
- **The line taking the focus while empty** (`CWndEditChat::OnSetFocus`, `:30-71`) gets the tab's prefix too: Whisper
  "/w " or "/w <the last name whispered> ".
- **What a tab shows** (`SetChannel`; `PutString`, `WndManager.cpp:4027-4174`): a line of style General, Whisper, Shout,
  Party or Guild when the tab's filter has that style; system, help and game lines by `m_dwChatFilterEtc`, the same for
  every tab. The defaults (`HwOption.cpp:222-227`):
  - Chat: General, Whisper, Shout, Party, Guild.
  - Whisper: General, Whisper. Shout: General, Shout. Party: General, Party. Guild: General, Guild.
  - Every tab: help and system lines in the chat (`CHATSTY_HELP_CHAT | CHATSTY_SYSTEM_CHAT`); game lines (the client's own
    messages, `PutString`'s default style) go to the screen's message list, not the chat (`CHATSTY_GAME_CLIENT`). At V15
    this is fixed: neuz.ini's value is ignored (`HwOption.cpp:926-933`).
- **The filter window** (`WIDC_BUTTON1` "Option"; `CWndChatFilter`, `WndChatFilter.cpp`): `APP_CHAT_FILTER`
  "WndTile08.tga" 288 x 272, modal, centred (`:44-58`, `:124-128`). At V15 it shows the group box "Chatting Channel" and
  five checks, General, Whisper, Shout, Party, Guild (ButtCheck.bmp), set from this tab's filter; this tab's own check is
  disabled (`:105-109`); the rest of the window (the old message radios) is cut off (`SetWndRect` 130 px shorter, `:46-51`).
  A click changes this tab's filter and fills the messages again (`:162-248`). The filters are saved in neuz.ini.
- Lines are kept apart from the tabs (`m_aChatString`, up to 500, then the oldest 250 go, `WndManager.cpp:4121-4134`), so
  a tab chosen later shows what came before.

## 4. The line

- **Enter on the world** gives the line the focus (`Neuz.cpp:1325-1339`), with the tab's prefix if it is empty.
- **Enter in the line** sends it (`ParsingChat`) and empties it (`:758-873`). Then, **unless Lock is checked, the focus
  goes back to the world** (`:848-872`); with Lock the line keeps it, for the next line.
- An empty line sent does nothing but give the focus back (`ParsingChat` ignores it).
- After a "/w name ..." or "/whisper name ..." line, `m_strCharName` is that name (`:834-845`), for the Whisper tab.
- **"/r "** typed (also "/R ") becomes "/whisper <the last one who whispered to you> " (`Process`, `:502-513`;
  `m_szWhisperName` is set by `OnWhisper`, `DPClient.cpp:11904-11905`).
- **Right-click a line** (`OnRButtonDown`, `:1159-1258`): if the line is someone's ("Name : ...", "<- [Name] ...",
  "-> [Name] ...", "[Name] ..."), and not your own name and not the "[Notice]" of an announcement, the line becomes
  "/whisper Name " and takes the focus.
- Arrow Up brings back the last 20 lines sent (§A of the 2026-11-05 note). The `/` list (`CWndCommand`) is §A too.
- The line holds 120 bytes once sent (`SetStrNull( string, 120 )`, `WndManager.cpp:3831`).
- **Anti-spam** for plain lines (`__BAN_CHATTING_SYSTEM` is on, `Neuz/VersionCommon.h:238`; `ParsingChat`,
  `WndManager.cpp:3854-3973`; a game master skips it):
  - the same line again within 2 s (`m_timerDobe`, `:1019`) is not sent: "Unable to enter the same sentence twice in a
    row." in red (`TID_GAME_CHATSAMETEXT`, `:3965-3972`);
  - a line within 0.7 s of the last is not sent ("The last message could not be transmitted due to chat spam
    limitations.", red); the 5th such line blocks the chat for 3 minutes (`WndManager.h:255-256`); a line 0.7 to 1 s after
    the last is sent, but the 2nd such line blocks too; while blocked, "Currently your chat has been blocked.(Remaining:
    %d minute %d second)". The counters start again on entering the world (`:2149-2150`). Shouts have the same rules in
    their command (`FuncTextCmd.cpp:1900-1990`).

## 5. The messages

- **How each line is written** (`DPClient.cpp`):
  - General: `"%s : %s"` name and text, white 0xffffffff (`OnChat`, `:1489-1491`).
  - Whisper: `"-> [%s] %s"` to whom, for your own; `"<- [%s] %s"` from whom (`OnWhisper`, `:11890-11908`), yellow
    0xffffff00.
  - Shout: `"[%s] %s"`, the colour the server sends (0xffff99cc by default; `OnShout`, `:11694-11730`). Shouts are shown
    only with the Shout option on (`m_bShout`, on by default).
  - Party: `"[%s] %s"`, 0xff99cc00 (`OnPartyChat`, `:5865-5867`).
  - Guild: `"[%s] %s"`, `TID_GUILD_CHAT`'s colour 0xffffbaff (`OnGuildChat`, `:12862-12866`).
  - An announcement: `TID_ADMIN_ANNOUNCE` "%s", 0xffffff99 (`OnSystem`, `:12145-12152`).
  - "That player is not connected." (`TID_GAME_NOTLOGIN`, white) when a whisper finds no one (`:11880-11885`).
  - A defined text: its TID's text and colour (`PutDefinedString`, `WndManager.cpp:4001-4012`), a game line.
- **The text area** (`CWndText`): the theme's 9-point font, 2 px between lines (`m_nLineSpace = 2`, `:405`), a scroll bar
  on the right. A new line keeps the view at the end only if it was at the end (`PutString`, `:981-994`). Past 1000
  lines the first 500 go (`:987-992`).
- **Fading**: 300 s after the last thing done in the chat, the messages' text goes invisible (`Process`, `:495-500`;
  `m_timerInputTimeOut`, `:454`). A new line (any but the yellow help lines) or any press on the chat's controls shows it
  again (`:616-620`, `:973-979`).

## 6. The System window

`APP_CHAT_LOG "WndTile308.tga" 1 240 128 0x410000` (`resdata.inc:4946`), `CWndChatLog` (`WndCommunication.cpp:1317-1515`).

- Made with the chat, hidden; **the System check shows or hides it** (`:456-489`, `:645-676`). Shown, it stands beside the
  chat: at the chat's right edge if it fits on the screen, else at its left; its top on the chat's top.
- The same see-through frame, no caption, resizable (`WBS_THICKFRAME`, least 272 x 48: `:1504`, so it opens 272 wide),
  movable. Its text fills the client area (`:1440-1454`).
- **What it gets** (`PutString`, `WndManager.cpp:4166-4172`): every line the chat's tab does not show, except shouts and
  the lines said by someone nearby (their bubbles), plus every system, help and game line. 1000 lines, then 500 go.
- Right-click: a menu with "Hide" (`TID_GAME_GUIDE_HIDE`), which hides it and unchecks System (`:1384-1412`,
  `:1471-1483`).
- Hiding all the windows hides it too (`WndManager.cpp:7746-7748`).

## 7. Things the chat does that are not the window

- **Instant help**: every 2 minutes, with the option on (it is by default, `HwOption.cpp:177`), a yellow "[Help] <tip>"
  line from `Client/Client/instantHelp.inc` (`OnDraw`, `:183-198`).
- The speech bubbles of lines said nearby (`g_DialogMsg`, `WndManager.cpp:4155-4163`): the web client has them already.

## 8. Online sources

Online writing on the classic (pre-V19) chat is thin. What was found agrees with the C++ above, with two conflicts:

- **Look and place**: bottom left, on the task bar, a see-through dark message area, a peach strip with blue rounded
  tabs, orange Lock / Filter / SYSTEM, a pale line. The GALA Lab guide's picture
  (https://www.en-galalab.flyff.com/user-interface, image
  https://static.wixstatic.com/media/415671_a285de64a35c498ba0c730adf824daa5~mv2.png); a 2009 game-play video
  (https://www.youtube.com/watch?v=marpTGfXQzs) with pink "[Name]" shouts; an old screenshot with "Name : text" lines
  (https://miro.medium.com/v2/resize:fit:1100/1*NWyZ-OZM_IMpIEpLFAcNLw.jpeg, from
  https://medium.com/usability-testing/usability-and-flight-53e2fdeabcc5). The gold chat on the gpotato.com.br wiki
  (Messagebox.png) is V19's interface, not V15's.
- **Tabs**: Chat, Whisper, Shout, Troupe, Guild in the GALA picture (an older picture: V15's ButtChatTroupe.BMP says
  "Party"); /w, /s, /p, /g; each tab has its own filter ("Select each tab and click the filter button", gpotato wiki).
- **Filter**: "select what kind of messages show up in your chat box" (GALA Lab;
  https://flyff-wiki.gpotato.com.br/wiki/New_Pang_Tutorial). **System**: "a small window to show you recent whispers,
  PMs, and official ingame messages" (GALA Lab); "All the messages except for chat are displayed in the System Window"
  (gpotato wiki).
- **Right-click a name in the chat to whisper** (New_Pang_Tutorial). **Enter** "Activates the Chat Box and enters any
  text you have typed" (https://flyff-wiki.gpotato.com.br/wiki/Hot_Key.html).
- **Colours** (GALA Lab): whisper yellow, shout purple-pink, party green, guild light pink.
- **Conflicts**, where the C++ wins: GALA Lab says Lock stops the chat from moving (in V15 that is the separate move lock;
  Lock keeps the line open after Enter, `:848-872`); the gpotato hot-key page says the Down arrow brings back old lines
  (V15 uses Up, `:741`).

Nothing was found online on the resizing, the fading, the macro mark or the anti-spam; those rest on the C++ alone.

## 9. Today's desktop chat, and how it differs

Today's chat (`apps/client/src/world/hud/chatWindow.ts`, the `.hud-chat` rules of `style.css`) is one element for phone
and desktop. On the desktop it is a strip fixed above the task bar's left half: a 100 px dark log, a peach gradient bar of
text buttons, a pale green form with a Send button.

| # | Today (desktop) | Neuz V15 |
| --- | --- | --- |
| 1 | CSS look: dark striped log, peach gradient bar, grey text buttons, pale green form | the WndTile300-311 frame, the WndChatEdit strip, picture buttons (§1, §2) |
| 2 | Fixed to the task bar's left, half its width, 100 px log; cannot move or resize | 528 x 128 at the bottom left; moved by any free part; resized from its edges in 16 px steps, least 464 x 48 (§1) |
| 3 | 7 text tabs: Chat, Whisper, Shout, Party, Guild, System, Announcement | 5 picture tabs; Party disabled out of a party, Guild out of a guild (§3) |
| 4 | A tab shows only its own channel; the Party tab sends to the party | A tab puts its prefix in the line and shows its filter: General and its channel by default, with system and help lines (§3) |
| 5 | Filter: disabled | Option opens the filter window: this tab's five checks (§3) |
| 6 | Lock: disabled ("Chat is fixed above the taskbar") | Lock keeps the line's focus after Enter (§4) |
| 7 | System: a tab | System shows or hides the System window beside the chat (§6) |
| 8 | A "−" minimise button | No minimise; the move lock, Help and Close (§1, §2) |
| 9 | A Send button | None: Enter sends (§4) |
| 10 | Lines "[nearby] Webby: text", "[whisper] A → B: text", "[shout] ..." | "Webby : text", "-> [B] text" / "<- [A] text", "[Webby] text" (§5) |
| 11 | Colours by CSS per channel: whisper green, shout pink, party lime, guild cyan, system light orange | each line's own colour: white, whisper yellow, shout the server's, party 0xff99cc00, guild 0xffffbaff, announcement 0xffffff99 (§5) |
| 12 | Text with a black shadow | plain text in the line's colour |
| 13 | 150 lines kept | 1000, then the first 500 go (§5) |
| 14 | Never fades | the text goes invisible 300 s after the last use (§5) |
| 15 | Right-click: nothing | whisper the line's sender (§4) |
| 16 | "/r ": nothing | becomes "/whisper <last whisperer> " (§4) |
| 17 | After Enter the line keeps the focus | the focus goes back to the world unless Lock is checked (§4) |
| 18 | The line's errors in a feedback row under the line | as red lines in the chat (`PutString( ..., 0xffff0000 )`) |
| 19 | No macro mark | the macro picture over the line's left end while it holds words; dragged to the task bar (§2) |
| 20 | Same line twice, or lines fast: sent | the anti-spam rules: refused, red lines, a 3-minute block (§4) |
| 21 | No instant help | a "[Help]" tip every 2 minutes (§7) |

Things that already match: Enter on the world opens the line; Escape leaves it; the keys typed never reach the game; the
`/` list, the history and the commands (2026-11-05); the speech bubbles; a press on the world takes the focus from the
line.

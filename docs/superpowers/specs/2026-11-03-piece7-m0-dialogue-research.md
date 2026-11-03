# Piece 7 M0 research — the NPC menu and the classic dialogue

**Date:** 2026-11-03. **For:** `2026-11-03-piece7-design.md` §3.1 and the plan
`plans/2026-11-03-piece7-m0-classic-dialogue.md`. C++ paths are relative to `Blouflash VS22 V15/`; FlyffWeb paths to the
repository. V15 build flags (`Source/Neuz/VersionCommon.h`): `__VER 15`, `__IMPROVE_QUEST_INTERFACE` (:201),
`__TELEPORTER` (:206), `__TRADESYS` (:38), `__JEFF_11_4` (:99) on; `__IMPROVE_MAP_SYSTEM` and `__VCINEMASCOPE` off.

## 1. Clicking an NPC (`_Interface/WndWorld.cpp`)

- Left button down (6712-7113): the NPC's `dwSndIdle1` plays (7063). A peaceful mover, not flying, not a player, goes to
  `ShowMoverMenu` (7065-7078). Clicking it again runs `ShowMoverMenu` again. Right-click never opens an NPC menu
  (7115-7200).
- `ShowMoverMenu` (6517-6710):
  - **In range** is `distSq < 20 * 20` (6520-6523): `ClearDest()`; the entries of `m_abMoverMenu` are counted, stopping at
    two; `nMenu` is the first.
  - **More than one:** every set entry in **ascending MMI number** (not `AddMenu` order), text `TID_MMI_DIALOG + i`
    (6649-6684). MMI_GUILDBANKING only with a guild and `ENABLE_GUILD_INVENTORY`; MMI_ARENA_ENTER only if not a base
    job. The menu goes to `(rect.right, rect.top)` of `GetBoundRect` (6693-6699, 2661-2701), the projected model box.
  - **One (or none):** `OnCommand( nMenu )` at once, no menu (6688). With none, `nMenu` is 0: Dialog.
  - **Out of range:** `SetDestObj( pTarget )` walks there (6707-6708), arrival range 0. **Nothing opens on arrival**
    (`_Common/MoverMove.cpp:256-259`): the player clicks again.
- MMI ids: `Resource/defineNeuz.h:92-305` (`MAX_MOVER_MENU` 170). Text `TID_MMI_DIALOG (7000) + i`. Ordinary entries:
  0 DIALOG "Dialog", 1 QUEST, 2 TRADE "Trade", 8 MARKING, 9 BANKING "Deposit", 14 REPAIR, 15 GUILDBANKING, 16-18 the
  guild rankings, 19 UPGRADE, 23 PIERCING, 25 POST, 74 NPC_BUFF, 80 ARENA_ENTER, 137 QUIZ_ENTRANCE, 146 TELEPORTER
  "Teleport".
- `OnCommand`: MMI_DIALOG (5163-5177) refused within 3000 ms of `m_dwDropTime` (set on an item drop,
  `Neuz/DPClient.cpp:9391`) or with a vendor window open; then `SendScriptDialogReq( id, NULL, 0, 0, 0, 0 )` and
  `CWndDialog` as `APP_DIALOG_EX`. MMI_TRADE → `SendOpenShopWnd` (5373). MMI_TELEPORTER → the world map's teleporter mode
  (5949-5969). MMI_QUEST has no case (falls to `CWndDialogEvent`, 5972-5985).
- `CWndMenu` (`_Interface/WndControl.cpp:3337-3630`): no theme pictures. Frame fill ARGB(255,226,198,181), client area
  (the window less 3 px) white. Items 20 px tall on a 22 px pitch from (2, 2), all as wide as the widest text + 60; menu
  height `10 + count * 22`. Text at (24, 4) in black; hover fill ARGB(155,200,200,200) with a round-rect outline
  ARGB(255,240,240,240) (408-540). Font: Verdana 9 (English slot 0). `SND_INF_CLICK` on press (694).
- The menu closes on focus loss (an item click, a click elsewhere, 3536-3543), on the player moving (8072), and on a
  second Escape (the first clears the target; `WndManager.cpp:3335-3391`).

## 2. The dialogue window (`Resource/resdata.inc:13842-13894`)

- `APP_DIALOG_EX "WndDialogEx.tga" 0 512 320 0x2410000` (caption, sound, move); `Initialize` adds `WBS_MODAL`
  (`WndDialog.cpp:334`). Title "Conversation" (`IDS_RESDATA_INC_005254`). Caption close button `ButtWndExit.tga`.
  Client origin (4, 22), as every captioned window. Placed centred horizontally, **y = 10** (`WndDialog.cpp:313-320`).
- Controls, client coordinates:

  | Control | Rect (l,t,r,b) | What |
  |---|---|---|
  | WIDC_CUSTOM1 | 218,38,486,206 (268 × 168) | text; the quest lists; a vertical scroll bar |
  | WIDC_CUSTOM2 | 214,216,492,276 | key buttons |
  | WIDC_CUSTOM3 | 6,22,206,262 (200 × 240) | NPC picture |
  | WIDC_BUTTON1 | 458,176,482,200 | next page, `wndButtEnter.bmp` (96 × 24, four 24 × 24 frames) |
  | WIDC_GROUP_BOX_TITLE | 222,12,482,32 | title "Dialog" (`TID_GAME_DIALOG`), ARGB(255,128,0,64), centred, drawn at x and x+1 |

- Pictures (all in `Client/Theme/Default`): `WndDialogEx.tga` 512 × 320; `QuestUiPaperGreen/Red/Gray/Yellow.tga`
  17 × 17, colour key **white** (`WndDialog.cpp:254-257`); `ButtYes/No/Cancel/Ok.tga` 288 × 20 (four 72 × 20 frames:
  hover, normal, pressed, disabled).
- NPC picture: `Client/Char/*.tga`, 79 files (~14.9 MB), 200 × 240, colour key magenta, from
  `MakePath( "char\\", m_szChar )` (`WndDialog.cpp:294`). `m_szChar` comes from `SetImage( IDS_CHARACTER_INC_… )`, e.g.
  MaFl_Juria → `char_Juria.tga` (`Resource/character.inc:469-491`; `_Common/Project.cpp:2995-3021`).
- Opening destroys the inventory (`WndDialog.cpp:280-285`) and plays `m_dwMusicId` (`:295-296`; only MaFl_Benku has
  one in `character.inc`).

## 3. Dialogue behaviour (`_Interface/WndDialog.cpp`)

- **Say** (423-453): the text starts with two spaces; with a quest id it is prefixed with
  `#b#cff5050f0<quest title>#nb#nc\n  `. Every literal two-character `\n` becomes a newline and two spaces. **One Say
  is one page**; pages are never split by height (the text area scrolls).
- **Markup** (`_Common/EditString.cpp:307-447`): `#cAARRGGBB` (lowercase hex only), `#nc`, `#b`/`#nb`, `#u`/`#nu`,
  `#s`/`#ns`, `#lNNNN`/`#nl` (codepage, no visible effect), any other `#x` kept as it is. Default colour black; line
  advance font height + 6; wrap at 268 px, breaking after one of ` +-*^/%=;(),':{}.`.
- **Links** (`ParsingString`, 455-562): `[word][key]` shows `word` in bold and sends `key` when clicked; `[word][]`
  sends `word`. Hovered: ARGB(255,16,16,255) and underlined. Example `Resource/WorldDialog.txt:183`:
  `[Yes][Yes_Enter] / [No][No_Enter]`.
- **EndSay** (563-577) shows page 0 and rebuilds the buttons. Every ADDKEY, ADDANSWER and REMOVEKEY ends with it.
  **BeginText** (578-594) clears the pages, links and answers.
- **Key buttons** (`AddKeyButton` 689-709: ignored when the word exists; `RemoveKeyButton` 721-740: by key;
  `RemoveAllKeyButton` 710-720: also empties both quest lists; at most 32). Layout (`MakeKeyButton` 755-805) in
  CUSTOM2: width = text width + 16, rows of font height + 6, a new row when the next would pass the right edge; the
  first "New Quest" or "Quests in Progress" button always starts a new row. Colours: normal ARGB(255,80,80,80), selected
  ARGB(255,128,0,255), hover ARGB(255,16,16,255) underlined. Tooltip "Ask about %s" (`TID_GAME_ABOUTQUESTION`).
- **Answers** (`MakeAnswerButton` 808-900), **on the last page only**: `__YES__`, `__NO__`, `__CANCEL__`, `__OK__` are
  picture buttons (ButtYes/No/Cancel/Ok, 72 × 20) at y = CUSTOM1.bottom − 20, from
  x = CUSTOM1.left + CUSTOM1.width / 2 − 90 × count / 2, 90 px apart. Other answers are text links on the line after the
  text.
- **Next page**: WIDC_BUTTON1 is shown only when there are pages and this is not the last (`UpdateButtonEnable`,
  902-913). Clicking the text does not turn the page.
- **Pressing** (`OnLButtonUp` 348-419, `OnChildNotify` 916-990): every press first waits for the 1 s timer
  `RunScript` set. A key: it becomes selected and the title becomes its word; "New Quest" or "Quests in Progress" with
  entries shows that list instead of sending; otherwise `BeginText` and `RunScript( key, param, quest )`. An answer or a
  link: `BeginText` and `RunScript`. A quest list row: hides the list and sends its key, param and quest id; a
  `QUEST_NEXT_LEVEL` row sends nothing.
- **RunScript** (234-240): `SendScriptDialogReq( npcId, key, param, quest, npcId, playerId )`, then the 1 s timer.
- **Quest lists** (993-1080): `NEWQUEST`/`CURRQUEST` first make the "New Quest" / "Quests in Progress" key (word = key,
  params 0). Rows are de-duplicated by text, drawn as `[#bmin#nb~#bmax#nb ] #btitle#nb` from the **client's** quest props
  (`m_nBeginCondLevelMin/Max`; no row text without them), key `QUEST_NEXT_LEVEL` makes a row invalid (grey
  ARGB(255,170,170,170), red icon). Icons: new list green (valid) or red (invalid); current list yellow when
  `__IsEndQuestCondition` (the quest is ready to hand in), else grey. Row colours: ARGB(255,64,64,64), hover
  ARGB(255,255,128,0), selected red. Empty lists say "No New Quests" / "No Quests in Progress". The server sends each
  quest's title as the word (`_Common/ScriptHelper.cpp:465-496`).
- **Closing:** the caption's close button; FUNCTYPE_EXIT; the NPC gone (`Process`, 58-63); the player moving or not
  standing (`WndWorld.cpp:8052-8081`); Escape; the vendor window opening (`WndVendor.cpp:67-68`). No packet on close.
- While it is open, item drops are refused (`DPClient.cpp:9378-9382`).

## 4. Network

- **Request** `PACKETTYPE_SCRIPTDLG` 0x00ff00b0 (`Neuz/DPClient.cpp:9647-9654`): `u32 objid`, string key (i32 length +
  bytes; empty for the opening), `i32 nGlobal1 = param`, `i32 nGlobal2 = quest`, `i32 nGlobal3 = npcId` (0 when
  opening), `i32 nGlobal4 = playerId` (0 when opening). The server throttles at 400 ms, ignores requests beyond
  `MAX_LEN_MOVER_MENU` (squared 1024), and turns an empty key into `#init` (`WORLDSERVER/DPSrvr.cpp:11122-11193`).
- **Reply** SNAPSHOTTYPE_RUNSCRIPTFUNC 0x0024 to the player's object: `u16 function` + fields
  (`Neuz/DPClient.cpp:14265-14476`, values `_Network/MsgHdr.h:1416-1438`):

  | Function | Fields | Neuz | Sent by V15? |
  |---|---|---|---|
  | 0x10 ADDKEY | str word, str key, u32 param, u32 quest | AddKeyButton | yes |
  | 0x11 REMOVEKEY | str key | RemoveKeyButton | yes |
  | 0x12 SAY | str text, u32 quest | Say | yes |
  | 0x13 ADDANSWER | str word, str key, u32 param, u32 quest | AddAnswerButton | yes |
  | 0x14 SETMARK, 0x15 GOMARK | — | MakeKeyButton | no |
  | 0x16 EXIT | — | close | yes |
  | 0x17 ENDSAY, 0x18 CREATEGUILD | — | nothing | no |
  | 0x19 DESTROYGUILD | — | nothing | yes |
  | 0x1a INITSTAT | u32 gp | all four stats 15, `m_nRemainGP = gp` | yes |
  | 0x1b SETNAVIGATOR | u32 world, 3 × f32 | navigator target | no |
  | 0x1c REMOVENAVIGATOR | — | clears it | no |
  | 0x1d REMOVEALLKEY | — | RemoveAllKeyButton | yes |
  | 0x1e SAYQUEST | (no client case) | — | no |
  | 0x20-0x23 INITSTR/STA/DEX/INT | u32 gp | that stat 15, `m_nRemainGP = gp` | yes |
  | 0x24 QUERYSETPLAYERNAME | — | rename window | yes |
  | 0x25 QUERYSETGUILDNAME | — | guild name window | no |
  | 0x26 NEWQUEST, 0x27 CURRQUEST | str word, str key, u32 param, u32 quest | the quest lists | yes |

- A typical opening (MaFl_Juria): REMOVEALLKEY; ADDKEY "Introduction", "Farewell"; NEWQUEST / CURRQUEST rows; then
  quest pages (SAY + `__OK__`, or up to 5 SAYs + `__YES__`/`__NO__`) or one SAY (`ScriptHelper.cpp:523-660`).

## 5. Today's web client (what M0 replaces)

- `apps/client/src/world/hud/npcDialog.ts` (93 lines): one 140 × 120 box next to the NPC with the menu, the text and the
  keys; quest SAYs show "Quest progression is not available yet."; 450 ms request throttle; closes on an outside
  press. Test `apps/client/test/npcDialog.test.ts`; CSS `apps/client/src/style.css:1551-1555`, `:1570`, `:1707-1715`.
- `packages/protocol/src/world/npc.ts`: `encodeNpcDialog(npcId, key, param = 0, quest = 0, playerId = 0)` never sends
  an empty key and always puts `npcId` in nGlobal3; `WorldSession.sendNpcDialog` passes no player id. `readNpcScript`
  throws on 0x1a-0x1c, 0x1e and 0x20-0x25 (counted as `mismatched`), and reads NEWQUEST/CURRQUEST as `unsupported`.
- `WorldScreen.ts:872-888`: an NPC press opens the box within 32 m (`canTalk`, squared 1024) or says "Move closer to
  speak with this NPC."; no walk-up; the NPC music plays at the press (`sounds.npcDialog`). No 3 s drop guard exists.
- `WebNpc` (`packages/formats/src/web/gameData.ts:151-164`) has no picture; `readCharacterInc` reads and drops
  `SetImage` (`packages/formats/src/inc/character.ts:48`, `:184-194`). The UI stage converts theme pieces from the list
  `THEME_FILES` (`tools/convert/src/ui/uiStage.ts:67-160`) and whole folders from `PICTURE_FOLDERS` (`:52-55`); ButtOk,
  ButtCancel, ButtYes, ButtNo and WndEditTile200-208 are already listed.
- Reusable: `WindowFrame` (`hud/frame.ts`, `texture`, `fitWhole`, `mobileScale`), `ModalBackdrop` (`hud/modal.ts`),
  `pictureButton` and `place` (`hud/button.ts`), the GetBoundRect port `focusRect` (`render/TargetMarks.ts:77-98`, used
  at `WorldScreen.ts:1263-1268`), `setOwnDestObj` (`combat/attackLoop.ts:110`, wrapped by `AttackLoop.setDestObj`,
  :606-612), `WorldSounds.npcDialog` and `moverClicked`, the e2e harness `apps/client/e2e/worldHarness.ts`
  (`playGateway`, `enterFlaris`, `tapMover`, `sentOf`, `NPC_ID`, `SELF_ID`).
- Tests that use today's box: `talking.spec.ts:23` (`.hud-npc`, `[data-npc-action]`, width ≤ 140,
  `.npc-dialog-text`), `navigation.spec.ts:41` (`[data-npc-action=teleport]`).

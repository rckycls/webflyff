# Piece 7, milestone 4: checkpoint

Full parties, built in the worktree `FlyffWeb-worktrees/piece7-m4` on its own branch (`piece7-m4`). Nothing is merged or pushed. The plan is [docs/superpowers/plans/2026-11-04-piece7-m4-parties.md](superpowers/plans/2026-11-04-piece7-m4-parties.md). The research it cites is [docs/superpowers/specs/2026-11-04-piece7-m4-parties-research.md](superpowers/specs/2026-11-04-piece7-m4-parties-research.md).

## What was built

- **Task 1** (7eba552..ddb523f): the protocol: the party messages, the player data and the core's direct packets.
- **Task 2** (ddb523f..5e07c09): the protocol: the party packets the client sends.
- **Task 3** (5e07c09..778d47a): the converter: the party catalog (`data/party.json`), the party EXP table and the party pictures.
- **Task 4** (778d47a..335e7d2): the party state (`g_Party`), the player data and the party rules.
- **Task 5** (335e7d2..ff0700c): the message box and the radio button.
- **Task 6** (ff0700c..09fef92): the player's menu, the invite checks and the invite box.
- **Task 7** (09fef92..e0d32ab): the party window and its member list.
- **Task 8** (e0d32ab..cbc55d0): the party window's buttons, modes and boxes.
- **Task 9** (cbc55d0..ea268ab): the quick view and the P key.
- **Task 10** (ea268ab..933b855): party chat, the party's green names and the HP bars over members.
- **Task 11** (933b855..8971b36): the party on the Navigator and the world map.
- **Task 12** (8971b36..9077450): Part A in the world, the testkit's party writers, and `party.spec.ts`.
- **Task 13** (9077450..0ee34b2): the party skills on the Skill tab and the task bar, and the mode icons.
- **Task 14** (0ee34b2..a3d49d3): the party skills' effects, the party music, and Part B in the world.
- **Task 15**: this note, the device checklist ([device-testing.md](device-testing.md), "Piece 7, milestone 4: parties") and the README line.

Then `main` (Piece 7 M3) was merged into the branch (b5a092e): M3's message box and its `whileTrue` effect option stand, and the party uses them. A fresh reviewer read the whole branch; its four Important findings were fixed in one pass (listed below), and its minor ones are listed at the end, not fixed.

No server or gateway change: every packet is Neuz's, byte for byte. Custom server features (`__BB_*`) are left out.

## Your commands, and what "pass" means

In PowerShell in the piece7-m4 folder, with your own `npm run dev:client` stopped first:

| Command | How long | Pass |
| --- | --- | --- |
| `npm test` | about 2 minutes | `Tests … passed`, no `failed`. |
| `npm run typecheck` | about 1 minute | no `error`. |
| `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 5 minutes | `… passed`, no `failed`. |
| `npm run test:e2e:client` | about 10 minutes | `… passed` (a few `skipped`), no `failed`; `party.spec.ts` is new (8 tests, chromium and phone). |

The game files need one conversion, run in the piece7-m4 folder. It adds the party window's pictures, the HP bars' and the map arrow's, M3's cast gauge (this branch has M3 in it), and the data (`data/party.json` among it). In the main folder, merge `itemProps.json` with your high-rate gear values instead of overwriting it, as M3's note says:

```
npm run convert -- --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client" --only "GauAccelBG*,GauAccelInner*,ButtLeave*,ButtChange*,ButtTransper*,ButtRadio*,GauFillSmall*,ImgMapArrowParty*,GauPartyHp*,data"
```

Then the device checks: [device-testing.md](device-testing.md), "Piece 7, milestone 4: parties".

## The plan's decisions

The plan's "Decisions this plan makes" (1-19) stand as written: the party lives on the world screen and survives a world change; the player's menu lists Neuz's entries with only the invite enabled; a phone opens it with a second tap; the log-in lines are Neuz's; invites are always shown; the quick view lights only the clicked member; on a phone the party window is full screen and the quick view sits under the status window, the buff row beside it; party chat's bubble is the ordinary one; a guild member shows as a party dot; the HP bars use the plain picture; the map arrows turn as Neuz's; Resting's auto-sit is not copied; the FULLPARTY texts keep their wrong counts; the party catalog is optional; the invite box has no timeout.

## The calls I made (the rulings)

Each is a decision I made where the plan or the C++ left a choice. Each says what it costs if it is wrong.

- **Task 1:** the direct ERRORPARTY is PacketType.ERRORPARTY, not ERRORPARTY_PACKET — PacketType already keeps it apart from MessageType.ERRORPARTY, as JOIN and REPLACE are — cost if wrong: one rename.
- **Task 1:** the party ChatMessage gains speakerId (OnPartyChat's object id) — Task 10/12's bubble needs the speaker, which readSocial used to drop — cost if wrong: an unused optional field.
- **Task 2:** WorldSession.sendAddPartyMember(leader, member) instead of (request) — the same two sides as the encoder; Task 6's onYes passes request.leader and request.member — cost if wrong: one call site.
- **Task 2:** WorldPacket kinds partyMemberRequest, partyMemberCancel, addPartyMember, removePartyMember, changeTroup, partyLeaderChange, partyItemModeChange, partyExpModeChange, partySkillUse, blockRequest, queryPlayerData — names that cannot be mistaken for the received messages' WorldMessage types — cost if wrong: renames in the testkit scripts.
- **Task 3:** readPartyExpTable(text, file) is its own reader, not a block parameter of readExpTable — expParty's rows are `exp point`, expCharacter's four 64-bit columns — cost if wrong: none (two small readers).
- **Task 3:** ItemProp keeps two more columns, skillTime (dwSkillTime) and exp (dwExp) — the party skills' mode length and cost; readPropItem's full-object test gained them — cost if wrong: two unused fields on items.
- **Task 3:** the client loads data/party.json with its own loader (world/party/partyCatalog.ts loadParty), as the quests' loadQuests, not through gameData.ts; Task 12 calls it beside loadQuests — the quests catalog, also optional, set the pattern — cost if wrong: a move.
- **Task 3:** buildParty takes iconKey(file) instead of the ClientFs — its unit test needs no files on disk — cost if wrong: none.
- **Task 3:** loadParty was written before its test (it copies loadQuests line for line); the test checks the three cases — cost if wrong: none found.
- **Task 4:** PartyContext has two more methods than the plan's, skillName(skill) and defaultName() — the mode lines name the skill (the catalog's) and PARTYCHANGENAME compares with TID_GAME_PARTY_NAME's text — cost if wrong: none.
- **Task 4:** PARTYMEMBER with an unchanged size prints no line, and a refusal (PARTYREQESTCANCEL 0, 1, 3) for an invitee out of view prints none — Neuz formats an empty string for both and PutString's handling of it is not confirmed — cost if wrong: an empty chat line missing.
- **Task 4:** ADDPARTYCHANGELEADER for a player not in the party changes nothing — Neuz swaps slot 0 with index -1 (undefined) — cost if wrong: none.
- **Task 4:** the member box's 10 % test rounds the quotient to a float ((FLOAT)hp / (FLOAT)max < .1f), so exactly 10 % is blue — found by the test — cost if wrong: one HP point's colour.
- **Task 5:** radioButton takes a fifth parameter, press — the party window's radios must act on a click — cost if wrong: none.
- **Task 5:** the two modules were written before their RED run; it was run with them moved aside (RED = missing modules), as M2's buff list — cost if wrong: none found.
- **Task 6:** a right press is picked at its let-go, and only when it is let go where it went down (OnRButtonUp's point == m_ptMouseSpot, the highlighted object then); the old test that a right press picks nothing now checks that it makes no tap — a camera drag with the right button still picks nothing — cost if wrong: none.
- **Task 6:** WorldPress.alt is a required field; the four whole-press expectations in controls.test.ts gained alt: false — cost if wrong: none.
- **Task 6:** moverMenu.ts exports menuLabel(id, texts, fallback), the NPC menu's label rule, for the player menu; the campus entry uses TID_GAME_MENU_CAMPUS_INVITATION — cost if wrong: none.
- **Task 7:** the tab control (resdata 10,118-448,266) is cut at the 436 px client area's edge, 426 px wide; its tab strip is drawn at its bottom (TAB_TILE_HEIGHT 20) — how Neuz clips it is not confirmed — cost if wrong: a few pixels.
- **Task 7:** on a phone the party window is fitted whole (fitWhole, mobileScale 1), as the Character window, rather than the inventory's hand-built panel — Decisions 10's "full-screen panel" in the cheaper form — cost if wrong: a phone layout pass.
- **Task 7:** the EXP text is left empty below level 10 without the party catalog (no expParty rows) — the catalog is optional — cost if wrong: none.
- **Task 7:** PartyWindow.ignoreClicks (the screen sets it while auto-attacking) stands for OnLButtonDown's m_bAutoAttack / m_nExecute check — cost if wrong: none.
- **Task 8:** the name "Advance Party" gets the box TID_DIAG_0013 (its space), not a silent stay — Neuz's rules run in order and the equality test comes last; the plan's test expected the stay. The stay branch is kept for a default name the rules would pass — cost if wrong: none (the research says it cannot match).
- **Task 8:** PartyWindow's callbacks are onLeave(leaveId, kick), onHandOver, onChangeTroup, onQuick, onItemMode, onExpMode, onLine(tid), onBox(tid); PartyBoxes takes the name rule as a function and has onLeaveYes, onName, onBox — the screen (Task 12) joins them — cost if wrong: none.
- **Task 8:** the troup and name boxes are centred on the screen, not opened at the right edge and centred on their parent — cost if wrong: their place.
- **Task 8:** a hand-over with a selected id no longer in the party gives TID_GAME_PARTY_ISNOTMASTER (Neuz's row index is always valid; update() drops such a selection anyway) — cost if wrong: none.
- **Task 9:** the Start menu's Party line stands before Option — Neuz has it in the Communication submenu, the browser's menu is flat; the menu tests that counted nine lines now count ten (296 px tall, Party's hotkey P) — cost if wrong: the line's place.
- **Task 9:** WindowFrame gains setHeight(height) (SetWndRect), which the quick view calls as SetActiveMember changes its height — cost if wrong: none (frame.ts, one method).
- **Task 9:** the quick view's small button is placed at (114, height − 50) in the client area — Neuz's coordinate space for it is not confirmed — cost if wrong: its place.
- **Task 10:** a typed line starting with '/' in the Party view goes out as typed (nearby), not wrapped in /partychat — Neuz's party channel only prefills "/p " in the edit, so a command the player types replaces it; the existing slash-alias test needs commands untouched — cost if wrong: a "/s" typed in the Party view shouts instead of going to the party (one condition).
- **Task 10:** PartyHpBars.update takes (camera, members, ownObjectId, width, height), not (camera, members, heightPx) — the x position needs the view's width as ChargeGauge's does, and the own-player skip the test names needs the own id — cost if wrong: a signature change at the one WorldScreen call.
- **Task 10:** NameTagLayer.recolor only redraws movers that already have a tag (a changed text or colour is redrawn, a tag tagOf now refuses is dropped); it never adds tags sync did not — keeps recolor to the party's colour change — cost if wrong: a mover whose tag appears only after a recolor (none today) stays untagged until it re-enters view.
- **Task 10:** the HP bar's left is trunc(projected x) made even, minus 42, as ChargeGauge does; Neuz makes even trunc(x − 40) − 2 — the same pixel for every on-screen x ≥ 40 — cost if wrong: a 1 px shift at the screen's left edge.
- **Task 11:** a member in view is marked at its mover's position when the map is drawn, not at a slot position the Navigator writes each paint (WndField.cpp:9396-9402) — the same point without the Navigator writing into the party model — cost if wrong: none visible while the Navigator is open; with it closed Neuz's mark would freeze at the last paint, the browser's keeps moving.
- **Task 11:** WorldMap.update(view, party) keeps the last party list when called without one (its own redraws on a resize or a map button) — the window redraws itself between WorldScreen frames — cost if wrong: none; a caller that wants no marks passes [].
- **Task 12:** the windows' glue lives in a new party/partyHud.ts (PartyHud: the window, quick view, boxes, invite box, message box; handle(events), toggle(), update(view, busy)), unit-tested in partyHud.test.ts; WorldScreen only routes messages, presses and frames to it — keeps WorldScreen's change small and the event routing testable without a browser — cost if wrong: a move.
- **Task 12:** party lines go to the HUD's lines (hud.messages), as the port's PutString does for the skill texts (say()); Neuz's PutString also copies a system line to the chat window when its filter says so — cost if wrong: the party lines missing from the chat's System view.
- **Task 12:** the party's events wait in a queue while no windows exist (the JOIN bundle and a world change are applied before the HUD is built) and are handled when the windows come — else the log-in lines and boxes would be lost — cost if wrong: none.
- **Task 12:** WorldPress gains touch (a finger's press); a phone's tap on the selected player opens its menu (plan Decisions 5) — the screen could not tell a finger from a mouse; 4 controls-test assertions gained touch: false — cost if wrong: none.
- **Task 12:** the e2e uses the harness's Webby, player 500 (the character list's), not the brief's 70001 — the list, the JOIN and every sender use the listed id — cost if wrong: none.
- **Task 12:** Lead in the e2e is a level-1 vagrant with 80 HP (its exact max), not level 20 — "full HP" needs hitPoint equal to the computed max, and the member list does not cap a width over 110 — cost if wrong: none.
- **Task 12:** the party window opens centred (the phone's is the full-screen panel); the quick view opens under the status window (its bottom, 112 px before it has a size); the HP bars skip only the own player and movers off screen, not transparent ones — Neuz's default window places are not in the research — cost if wrong: where they open.
- **Task 12:** the e2e spec and the testkit writers were written after the wiring, so the spec's RED run was not seen; the wiring's unit tests (partyHud, moverByPlayerId, the touch press) and the writers' round-trip test were seen RED or written against the readers — cost if wrong: a spec that would have passed without the wiring (none of its checks can: each needs a packet or a window the wiring adds).
- **Task 13:** PartySkillTab.onDrag is (skill, event) and the task bar gains carryPartySkill(skill, event) with a Carried kind 'partySkills' — the bar's drag starts from the press, as carrySkill's does — cost if wrong: none.
- **Task 13:** a party skill drops on the item row only; the applet row takes no drop in the port at all (taskBarEdits' existing `target === 'applet'` return), so "may be dropped on the applet row" is tested as a type-2 applet shortcut shown and kept — cost if wrong: a player cannot put a party skill on the applet row from the browser (none can put anything there).
- **Task 13:** the dropped shortcut has m_dwData 1, as the bar's SetShortcut writes for every item-slot drop (the job-skill drop test shows the same); the test's first expectation of 0 was wrong — cost if wrong: none (the server stores what it is sent).
- **Task 13:** the skill use and the mode icons live in PartyHud (useSkill, updateIcons, modeIcons on world.nowMs()); the icon row sits at calc(50% − 100px), 10 px down, so it needs no width; TID_GAME_NOT_TIME in its own colour — cost if wrong: a move, or the line's colour.
- **Task 13:** the task bar's catalogs are one object made once (the game data spread with partySkills), passed each frame — no object a frame — cost if wrong: none.
- **Task 13:** PartyHud's party-skill test was written after useSkill (the brief's five tests were all seen RED first) — cost if wrong: none found; it exercises the rule's four outcomes through the hud.
- **Task 14:** EffectRequest.angle already existed (Piece 7 M2), so the plan's effectManager test for a heading kept while following passed on its first run; it stays as a pin. The effect manager gains three options instead: lift (Blitz's mark at the target's height less 0.7 × scale, CSfxTroBlitz::Render), then (Resting's first effect makes its second at the mover, CSfxTroStretching01) and loopWhile (Resting's second loops while its mover sits and the mode is on, CSfxTroStretching02) — the plan's interface had no way to chain or stop an effect — cost if wrong: three optional fields.
- **Task 14:** a mode event is told from a message by having no `type` — REMOVEQUEST's message has a `kind` field of its own — cost if wrong: none.
- **Task 14:** the party effects are recorded in the test hook's played effects (as the fight's), and use the model's top from the mover views (placeOf's head less its foot, over the scale) for Call's and Blitz's heights; CSfxTroStretching's turn to −angle is left out (a ring) — cost if wrong: an effect at the wrong height while a model loads (0 then).
- **Task 14:** BGM_IN_FITUP moves to audio/soundIds.ts and partyState imports it (the plan named that file); the music event already reached the sounds in Task 12 — cost if wrong: none.
- **Merge:** main (M3, f304689) merged into piece7-m4 as one merge commit, not a rebase of the 16 commits — one resolution instead of seven conflict stops, and the owner squashes a milestone into main anyway — cost if wrong: a merge commit in the branch's history.
- **Merge:** M3's MessageBox (OK and OK/Cancel, open(text, buttons, onOk)) replaces M4's Task 5 box and its tests; the party's boxes open it with 'ok'; M4's Enter-closes is dropped (M3's box has none; adding it would also make Enter accept the Scroll of Return's question) — cost if wrong: Enter does not close a party refusal's box.
- **Merge:** M3's EffectRequest.whileTrue is M4's loopWhile; M4's is dropped (and its test), Resting's loop uses whileTrue; lift and then stay — cost if wrong: none.
- **Final:** a held F-key repeats PARTYSKILLUSE at the key-repeat rate — stands: Neuz's key table and Piece 4's choice, well under the gateway's 100 a second — cost if wrong: a held Call or Blitz replays its effects for each member.
- **Final:** UPDATE_PLAYER_DATA or LOGOUT for an unknown id sends one QUERY_PLAYER_DATA each — stands: Neuz's GetPlayerData default, once per id, never per frame — cost if wrong: a short burst of queries at log-in with many friends or guild members.
- **Final:** M3's box and the party's box can be open at once — stands: Neuz's CReturnScrollMsgBox is a window of its own too — cost if wrong: two boxes stacked.
- **Final:** the party window, the quick view and an open invite box close at a world change — stands as every window of the port does; the invite goes unanswered (no packet), so the inviter can invite again — cost if wrong: an invite lost at a teleport (Neuz would keep the box).
- **Final:** a double click on a radio before the echo sends twice — stands: Neuz does the same — cost if wrong: one extra packet.
- **Final:** Resting's auto-sit, the duel checks, the guild dot, the debuff HP picture and the invite timeout stay out — the plan's Decisions 4, 12, 13, 15 and 19 — cost if wrong: as those decisions say.
- **Final:** the party's join and leave lines stay on the HUD only (ruling 64) — the port's PutString convention, which the reviewer agrees with — cost if wrong: the lines missing from the chat's System view.

## The final review's fixes

- PartyHud.dispose removed its elements without closing them: an open party box left its window key hold for the rest of the page (the keyboard dead after a world change or a reconnect), and open windows stayed in the Escape order; dispose now dismisses the invite (no answer sent), closes the windows and boxes and disposes the box — 'dispose with the message box and the invite box open: no key held after it, nothing sent' RED→GREEN (seen red against the old dispose), client suite 544/544.
- modalChanged did not count the party's message box, so a key held as it opened kept walking and the joystick stayed — party.spec case 4's member radio (TID_DIAG_0008 holds the world until OK) RED→GREEN (seen red with the line reverted), suite 544/544.
- the member list made every row again on any HP step, so a click on a row in a fight was lost or cleared the target; rows are now made again only when the members change, and updated in place — 'a row press survives a rebuild between pointerdown and pointerup' RED→GREEN, suite 544/544.
- the party skills' mode icons lived on the per-world PartyHud, so a world change lost the icon and the leader's TID_GAME_NOT_TIME guard (the server spends the points again); the icons are now the screen's, passed to each PartyHud — 'the mode icons are the screen's: the next world's windows keep the icon and its guard on the points' RED→GREEN (seen red with per-window icons), suite 544/544.

## Deferred minors (the review's, not fixed)

- a member's world-map arrow jumps to its last PARTYMAPINFO position (or the map's corner for a party formed in view) for up to 10 s when it leaves view; ruling 60 is wrong on its cost (fix: write the slot's position from the mover each frame).
- per-frame work: PartyQuick writes all 8 rows each frame, MemberList runs JSON.stringify each frame, PartyBuffRow allocates each frame, party.members slices on each read, moverByPlayerId scans every mover about 25 times a frame (fix: compare-then-write, a player-id index).
- the party window's HP fill has no cap at 110 px (a geared member entering view at full HP); the quick view and the overhead bars cap theirs.
- HP bars are drawn over invisible or transparent party members (ruling 69); RenderHP skips them, nameTagOf already has the check.
- Precision's effect plays on the leader even when the leader's target (the envelope's object) is out of view; Neuz returns early (DPClient.cpp:5500-5503).
- text sizes on phones: the party window keeps 11-12 px at scale 1 and gets 14 px in 12 px columns when scaled; the quick view's names are cut early (ruling 42) — for the owner's device check.
- no English fallback when a party TID is missing (line() and box() say nothing); the converted texts have them all.
- EffectManager.step allocates its follow-up list each tick, and a `then` effect plays when its followed mover is gone (whileTrue drops it a tick later).
- the research note's §3.1 says InitParty resets the modes; party.cpp:75-95 does not (the code is right).

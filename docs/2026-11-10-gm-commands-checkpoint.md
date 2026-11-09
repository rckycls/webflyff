# GM commands and GM names: checkpoint (2026-11-10)

Branch `gm-commands` (worktree `FlyffWeb-worktrees/gm-commands`), from local main f7f40be. Not merged, not pushed.
Research: `docs/superpowers/specs/2026-11-10-gm-commands-research.md`.

## What was wrong, in short

- The web ignored the server's "mode changed" message. /invisible, /undying, /freeze and the rest worked on the server
  but nothing changed on screen. A GM keeps those modes across log-ins, so a GM who once went invisible came back
  invisible: no name, no icon, no sign why. That was the owner's missing name.
- The server's text answers (`AddText`) were read without their first byte and dropped.
- /count, /ip, /system, /skilllevel and /disguise answers had no reader.
- Invisible GMs were drawn, whole and clickable, for everyone.
- A few commands need Neuz's client half (/skilllevel, /ip, ...); the web sent them raw.

## What changed

- Your own name and marks always show over your head, whatever your authority, even while invisible (the owner's
  request; Neuz hides the own name while invisible). While invisible your own body is drawn faint, as Neuz does.
- Another GM sees an invisible GM faint, with no name. A normal player sees nothing of an invisible GM and cannot click it.
  As before: a normal player gets no target bar on a GM and never sees a GM on the minimap.
- The GM's own state line after a mode change ("InvisibleStatus", "Undying1Status", "Normal") in the System window.
- A frozen player (/freeze) cannot move, click or attack until /nofreeze, as Neuz's own checks.
- New readers: mode change, server text, player count, IP, system notice, skill level, disguise.

## The commands (English V15 set, 111)

"Works" = sent as Neuz sends it (or run here), refused silently below its authority, and its answer is shown. Not every
one was tried against the real server: see the checklist.

| Status | Commands |
|---|---|
| Works | whisper, say, position, shout, partychat, GuildChat, PartyInvite, teleport, invisible, noinvisible, summon, count, out, talk, notalk, ip, Mute, GuildRanking, system, undying, undying2, noundying, onekill, noonekill, aroundkill, stat, level, InitSkillExp, skilllevel (skill window open, a skill chosen), skilllevelAll, BeginQuest, EndQuest, RemoveQuest, RemoveAllQuest, RemoveCompleteQuest, changejob, freeze, nofreeze, PartyLevel, indirect (with words), createnpc, EVENTLIST, EVENTINFO, rmvnpc, disguise, noDisguise, jobname, getgold, createitem (with words), createitem2, QuestState, loadscript, ReloadConstant, petlevel, petexp, Pet, makepetfeed, Lua, RefineAccessory, RefineCollector, GenRandomOption, InitializeRandomOption, SetRandomOption, SetPetName, ClearPetName, RemoveBuff, HonorTitleSet |
| Works, part not shown | Time (the "Madrigal Time" line: the web has no game clock); FallRain, StopRain (no rain reader); PvpParam (fame not refreshed on screen); PKParam (PK values refresh when the player comes in view again); gamesetting (its red rate lines); ctd (the duel zone); GCIn, GCOpen, GCClose, GCNext, GC1TO1OPEN/CLOSE/NEXT (their error lines show; no guild siege in the web); GuildInvite, GuildStat, createguild, CampusInvite, Propose, Refuse, Couple, Decouple, ClearPropose, NextCoupleLevel (the server acts; no guild, campus or couple windows in the web) |
| Does nothing in Neuz either | FallSnow, StopSnow (the core ignores them in V15) |
| Left out | ResistItem, Piercing (they need Neuz's upgrade and piercing windows); createitem and indirect with no words (they open Neuz's item and NPC-talk windows); destroyguild (no guilds); tradeagree/refuse, whisperagree/refuse, messengeragree/refuse, stageagree/refuse, connectagree/refuse, shoutagree/refuse, ignore, unignore, ignorelist (their options and the block list are not in the web). All send nothing, so none reach other players' chat. |

Korean-only commands (`open` and after: music, sound, gmitem, userlist, InvenClear, ...) do not exist in an English Neuz
and are not offered. The owner's custom parts are left out: `__BB_VIP_AUTH_LEVELS`, `__BB_STAFF_MODERATOR_AUTH` and its
command gate, `__BB_VIP_TITLES`. No owner-made GM command was found in the table.

## Owner checklist (two browsers: the admin and a normal account)

As the admin (Poreotix):
1. Log in. Your name reads "Poreotix [Admin]" in dark red, with your Master/Hero icon if you have one. If your body is
   faint, you are invisible: type `/noinv`, the System window says "Normal" and your body is whole.
2. `/inv`: "InvisibleStatus", body faint, name still there. `/ud`: "Undying1InvisibleStatus". `/noud`, `/noinv`.
3. `/count`: a green "Players online: N" and "[World CCU] N" in the chat.
4. `/te 1 6968 3328` (Flaris), `/te <name>`, `/su <name>`.
5. `/ci 2800 5`: items in the bag. `/gg 100000`: penya. `/ci` alone: nothing (Neuz opens its item window here).
6. Open the skill window (K), click a skill, `/slv 3`: "Skill level of ... has increased to 3." Without a chosen skill:
   "Please select from the skills in your skill window." in red.
7. Click the other account, `/ip`: "[IP] name : address" in blue.
8. `/sys Hello`: a caption and a chat line on both browsers.
9. `/dis 21`: you look like an Aibatt. `/nodis`: back.
10. `/jn`: four red lines. `/pos`: your position in the System window.
11. `/fr <other name>`: the other account cannot walk, click or attack. `/nofr <other name>`.

As the normal account:
1. `/te 1 6968 3328`, `/inv`, `/ci 2800`: nothing happens, nothing is said, and the admin's browser shows nothing either.
2. Your own name shows as usual.
3. The admin, visible: "Poreotix [Admin]" over the head. Clicking them gives no target bar. They are not on the minimap.
4. The admin types `/inv`: they vanish (no body, no name), you cannot click them. `/noinv`: back with their name.

## Tests run here

- `npm run typecheck`: clean.
- `npx vitest run`: 4095 passed, 5 failed, all old (the same on main before this work): `inventoryWindow.test.ts` ×2
  ("keeps desktop double click working after single-click inspection", "a ride shows Use on the phone ..."),
  `looks.test.ts` ×3 (heldModels: weapon, shield, knuckle/bow/yoyo). `neuzChat.test.ts` "keeps 1000 lines" and
  `gameDataStage.test.ts` failed once on main under load and passed in this run.
- Playwright, Chromium, port 5179: `e2e/gmCommands.spec.ts` (2 tests, desktop and landscape phone: 4 runs) and
  `e2e/talking.spec.ts` (3 runs: 2 on the desktop, 1 on the phone): all passed. Config:
  `.superpowers/playwright.gm.config.ts` (not committed; `.superpowers/` is ignored).

## For the owner to run

The full suites (not run here). Keep your `npm run dev:client` on 5174 and give the tests another port:

```powershell
$env:E2E_CLIENT_PORT='5179'; npm run test:e2e:client
```

Pass: everything passes except the known `travel-items.spec.ts` "the Scroll of Return ..." failure on main.

```powershell
npm run test:corpus
```

Pass: as on main (no converter change here).

## Convert

None. No new pictures or data: the main folder needs no convert for this branch.

## Merging

- `friends-say` changes `chatCommands.ts` and `chatCommandTable.ts`. Here `chatCommands.ts` gets one import and one branch
  in `lineAction` (the TCM_BOTH client halves, `CLIENT_HALVES`); `chatCommandTable.ts` is untouched.
- `neuzChat.ts`, `chatWindow.ts`: `onClientCommand` gets a third argument (the typed line), `append` a sixth (a chat
  style). `chatSend.ts`: the client outcome carries the line.
- `WorldScreen.ts` changes in several places (the message loop, the client commands, the mover views' options, the
  frame); `buffs-premium` and `ui-fixes-2026-11-05` touch it too.

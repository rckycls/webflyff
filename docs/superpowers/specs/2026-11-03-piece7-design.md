# FlyFF Web Client — Piece 7: Classic Dialogue, Quests, Job Change, Travel Items, Parties, Flying, Closed Beta — Design Spec

**Date:** 2026-11-03
**Status:** Draft for review
**Builds on:**
- the Piece 6 spec, `2026-11-02-piece6-design.md`: the blocked-attack fix, the world map, sound, reconnect and
  performance, all on branch `piece6`;
- the Piece 5 spec, `2026-10-29-piece5-design.md`: controls, items, chat, NPC dialogue and shops, travel and the
  minimap, merged into `main` (a84fe29);
- the roadmap in the Piece 1 spec (`Blouflash VS22 V15/docs/superpowers/specs/2026-10-16-flyff-web-client-design.md`):
  §1's Release 1 ("a player on a phone can log in, create a character and level through the starting area while Windows
  players are on the same server") and §4's "release".

**Research:** none yet. Each milestone's plan opens with a task that traces the C++ for that milestone and writes the
exact `file:line` facts into a research note next to this spec. C++ paths are relative to `Blouflash VS22 V15/`.
FlyffWeb paths are relative to the FlyffWeb repository.

---

## 1. Brief

- **Goal:** a closed beta for invited testers. On a phone, next to Windows players on the same servers, a tester can:
  - level from 1 to past 20 on the Flaris side;
  - take and hand in ordinary NPC quests, and change job at 15;
  - fight with every first job's weapons;
  - travel with Blinkwings and the Scroll of Return;
  - play in a party, an advanced party included;
  - fly from level 20.
- **Before Piece 7 starts:** Piece 6 is finished. M5 part B (`plans/2026-11-03-piece6-m5b-fixes.md`) is built, the
  owner takes one round of phone readings, and `piece6` is merged into `main`. Piece 7 branches from that `main`.
- **Seven milestones, one spec, one plan per milestone.** Each plan is written just before its milestone starts. Each
  milestone ends with the owner's checkpoint. The order follows what a tester meets while levelling.

  | # | Milestone | What the player gets |
  |---|---|---|
  | M0 | Classic NPC dialogue | The V15 NPC menu and dialogue window, in place of today's small box. |
  | M1 | Quests | Ordinary NPC quests taken, tracked and handed in; the quest window and the tracker. |
  | M2 | Job change and the new jobs' attacks | The four job change chains; swords, axes, sticks, knuckles, yoyos, bows, wands and staffs; first-job skills, friendly targets. |
  | M3 | Blinkwings and scrolls | Town and place Blinkwings, and the Scroll of Return. |
  | M4 | Full parties | Parties, the party windows, shared EXP, party chat, the advanced party and the party skills. |
  | M5 | Flying | Boards and brooms from level 20, on the PC and on phones. |
  | M6 | Closed-beta launch | Merged, hosted, a sign-up link, a Beta label, and the owner's live and device checks. |

- **No server change.** Every packet the browser sends is one Neuz sends. The servers and the gateway's limits stay as
  they are.
- **Decisions by the owner (2026-11-03):**
  - **Audience:** a closed beta for invited testers. Launch prep stays light; rough edges are acceptable.
  - **Performance:** Piece 6's M5 part B is finished, read on the phones and merged before Piece 7.
  - **Quests:** quests in general, so any ordinary NPC quest works. Checked on the job change chains and a few Flaris
    quests. Party and guild quests are left out.
  - **Parties:** full parties: party skills, party levels and the advanced party included.
  - **Dialogue:** the NPC dialogue that was built earlier is redone to match the classic V15 dialogue, and carries the
    quests.
  - **Travel and flight:** Blinkwings and scrolls, and flying, are in. Player trade is not.
  - **Order:** the levelling path, M0 to M6 as above.
  - **Phone flight controls:** the joystick turns (left, right) and climbs or dives (up, down); the Jump button becomes
    Accelerate while held; a Turbo and a Land button are added; the Attack button stays where it is.
  - **Custom server features are not part of the web client's scope** (the `__BB_*` features of `CUSTOM_FEATURES.md`
    and the 2026-11-02 server specs).
- **Decisions carried from earlier pieces:**
  - no fullscreen;
  - automated browser tests in Chromium only (desktop and a landscape phone), with iPhone and iPad checked by hand;
  - builders run only the quick checks, and the owner runs the full suites, the live tests and the device checks at each
    checkpoint;
  - no Neuz recording and no Neuz beside the servers;
  - phone windows: about half their PC size with readable text, and full-screen panels for the big windows, as the
    inventory.

---

## 2. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| Today's NPC box | One 140×120 frame next to the NPC holds the menu buttons (Dialog, Trade, Teleporter) and the dialogue text and keys together. Quest actions show "Quest progression is not available yet."; anything else unknown shows "This NPC action is not available yet." | `apps/client/src/world/hud/npcDialog.ts:7-60`, `:66`, `:79` |
| Today's dialogue messages | `SendScriptDialogReq` is sent with the object, the key and four script values. `OnRunScriptFunc` is read for presentation only; quest actions never run. | `packages/protocol/src/world/npc.ts:20-25` |
| Neuz's NPC click | With more than one menu entry, the mover menu opens at the NPC's top right with the entries of `character.inc`, named `TID_MMI_DIALOG + i`; with one entry, it runs at once. | `_Interface/WndWorld.cpp:6640-6700` |
| Neuz's Dialog entry | Refused within 3 s of an item drop or while a shop is open. Sends `SendScriptDialogReq( id, NULL, 0, 0, 0, 0 )` and opens `CWndDialog` as `APP_DIALOG_EX`. | `_Interface/WndWorld.cpp:5163-5177` |
| The V15 dialogue window | `APP_DIALOG_EX`, 512×320, `WndDialogEx.tga`: the NPC picture (6,22)-(206,262), the text (218,38)-(486,206) with a scroll bar, the key buttons (214,216)-(492,276), the Enter button. Four quest-list icons (`QuestUiPaperGreen/Red/Gray/Yellow.tga`). The picture is `char\<m_szChar>`; the NPC's music plays; the inventory closes. | `Resource/resdata.inc:13842`; `_Interface/WndDialog.cpp:242-330` |
| Dialogue functions | `Say` and the page split (`ParsingString`), `EndSay`, key buttons, answer buttons, the new and current quest lists. | `_Interface/WndDialog.cpp:423-1080` |
| Quest list thrown away | The own character's quests in ADD_OBJ (12 bytes each) are skipped. | `packages/protocol/src/world/addObj.ts:21`, `:181` |
| Quest messages | SETQUEST, REMOVEQUEST, QUEST_TEXT_TIME, QUESTHELPER_NPCPOS, QUEST_CHECKED. | `Neuz/DPClient.cpp:517`, `:652`, `:673`, `:816`, `:860` |
| Quest windows | `CWndQuest` and `CWndQuestDetail` (2,530 lines), `CWndQuestQuickInfo` (376 lines). | `_Interface/WndQuest.cpp`, `_Interface/WndQuestQuickInfo.cpp` |
| Job change quests | Four chains of four: `QUEST_VOCMER_*` 151-154, `QUEST_VOCASS_*` 155-158, `QUEST_VOCMAG_*` 159-162, `QUEST_VOCACR_*` 53-56 (`BFTRN`, `TRN1`-`TRN3`). | `Resource/definequest.h:164-182` |
| Job change messages | SET_JOB_SKILL for the own character, SET_NEAR_JOB_SKILL for others. | `Neuz/DPClient.cpp:613-614` |
| Wand and bow | The web client skips both: a press with a wand or a bow in the hand does not attack. Neuz sends `SendMagicAttack` (with `nMagicPower`) and `SendRangeAttack` (with the arrow's item ID); others' attacks arrive as MAGIC_ATTACK and RANGE_ATTACK. | `apps/client/src/world/combat/attackLoop.ts:574-581`; `Neuz/DPClient.cpp:600-601`, `:9841`, `:9848` |
| Blinkwings | `IK3_BLINKWING` (to a place) and `IK3_TOWNBLINKWING` (to the revival point; the Escape Blinkwing forced, chaotic players to the chaotic one). Neuz refuses Blinkwings in Kebaras, the guild war map and the house. | `Resource/defineItemkind.h:120`, `:122`; `_Common/MoverSkill.cpp:1790-1830`; `Neuz/DPClient.cpp:10386-10405` |
| Scroll of Return | `II_SYS_SYS_SCR_RETURN` opens `CReturnScrollMsgBox`; the choice goes out with `SendReturnScroll`, and RETURNSCORLL answers. | `Neuz/DPClient.cpp:10410-10421`, `:15770`, `:671` |
| Party messages | ADDPARTYCHANGELEADER, ADDPARTYNAME, ERRORPARTY, PARTYCHANGEEXPMODE, PARTYCHANGEITEMMODE, PARTYCHANGENAME, PARTYCHANGETROUP, PARTYCHAT, PARTYEXP, PARTYMAPINFO, PARTYMEMBER, PARTYMEMBERJOB, PARTYMEMBERLEVEL, PARTYREQEST, PARTYREQESTCANCEL, PARTYSKILL_BLITZ/CALL/RETREAT/SPHERECIRCLE, SETPARTYMODE, SET_PARTY_MEMBER_PARAM; sent: `SendPartyMemberRequest`, `SendAddPartyMember`, `SendPartyMemberCancle`, `SendRemovePartyMember`, `SendPartyChangeLeader`, `SendChangePartyName`, `SendPartySkillUse`. | `Neuz/DPClient.cpp` |
| Party windows | `WndParty` (1,022 lines), `WndPartyQuick` (351), `WndPartyConfirm`, `WndPartyChangeTroup`. | `_Interface/WndParty*.cpp` |
| Flying | Riding items `IK2_RIDING`: boards `IK3_BOARD`, brooms `IK3_STICK`. Sent: `SendPlayerMoved2`, `SendPlayerBehavior2`, `SendPlayerCorr2`, `SendPlayerAngle`. Received: MOVERMOVED2, MOVERBEHAVIOR2, MOVERCORR2, MOVERANGLE, DESTANGLE, SETFUEL, MELEE_ATTACK2. | `Resource/defineItemkind.h:38`, `:115-116`; `Neuz/DPClient.cpp` |
| Gateway limit | More than 100 packets in one sliding second closes the connection with 4004. | `apps/gateway/src/config.ts:31`, `apps/gateway/src/relay.ts:107` |
| Sign-up | FlyffPortal (Laravel) already has account registration. An in-client register page exists only as uncommitted work in `FlyffWeb-worktrees/register-page`. | `Blouflash VS22 V15/FlyffPortal/routes/web.php`, `app/Http/Controllers/Auth/RegisteredAccountController.php` |

---

## 3. Design

### 3.1 M0 — Classic NPC dialogue

Today's box (`npcDialog.ts`) is removed and replaced by Neuz's two pieces.

- **The mover menu.** Clicking an NPC in range does what `WndWorld.cpp:6640-6700` does:
  - one menu entry runs at once (for most NPCs, Dialog);
  - more than one opens the classic pop-up menu at the NPC's top right, with the entries of `character.inc` named
    `TID_MMI_DIALOG + i`, in Neuz's order;
  - entries the web client cannot do yet are shown greyed;
  - Shop and Teleporter move into this menu and behave as today.
- **The dialogue window** (`APP_DIALOG_EX`, 512×320, `WndDialogEx.tga`, the rectangles in §2):
  - the NPC's picture on the left, from `char\<m_szChar>` (the converter adds these pictures to its UI stage);
  - the text area with a scroll bar; long text in pages, the Enter button or a tap moves on;
  - the key buttons once the NPC has finished speaking (`EndSay`), and the answer buttons;
  - the four quest lists with their paper icons: new (green), not yet (red), current (grey), ready to hand in (yellow);
  - opening it closes the inventory and plays the NPC's music, as `WndDialog.cpp:242-330` does;
  - it closes when the NPC is out of range or gone, and on the close button.
- **Guards:** Neuz's 3 s after a drop, and no dialogue while a shop is open.
- **The server's dialogue functions** are all shown: say, add and remove a key, the answers, the quest lists, end. Every
  button sends `SendScriptDialogReq` with the values Neuz sends. M0 shows the quest lists and sends their requests; the
  quest state itself is M1's.
- **Phones:** the window at the largest size the screen allows, centred; at full size on a 390-px-tall landscape phone,
  a little smaller on 342 px. Text stays readable by Piece 5's rule, and the buttons are big enough to tap.

### 3.2 M1 — Quests

- **Catalog** (converter, data stage): `data/quests.json` from the quest files Neuz loads, without the party and guild
  quests. Per quest: its name, category, level range, start and end NPC, steps (talk, kill N, collect N, visit), rewards
  (EXP, penya, items) and descriptions from the game's text tables. `QuestDestination.txt` gives the places to show.
- **State:** the own quests from ADD_OBJ (active, completed, checked), kept current by SETQUEST, REMOVEQUEST,
  QUEST_CHECKED, QUEST_TEXT_TIME and QUESTHELPER_NPCPOS. Kill and item counts follow the server.
- **Dialogue:** M0's quest lists come alive. Taking, refusing and handing in go through the dialogue as in Neuz. The
  server decides; the client shows.
- **Windows** in the V15 look:
  - the quest window (Q, Start → Quest): current and completed quests in their category tree; the detail with the
    description, each step and its count, and the rewards; abandoning with a confirmation and Neuz's packet; the check box
    that puts a quest on the tracker;
  - the tracker (`CWndQuestQuickInfo`): the checked quests and their counts on screen;
  - the quest helper: the target NPC's position on the Navigator;
  - the chat lines Neuz prints for progress, completion and rewards.
- **Phones:** the quest window as a full-screen panel, like the inventory. The tracker stays compact and clear of the
  joystick, the task bar and the shortcuts.

### 3.3 M2 — Job change and the new jobs' attacks

- **The change:** at the end of a chain the server sends SET_JOB_SKILL. The job, the skill list, and the Character and
  Skill windows update. Others' changes arrive as SET_NEAR_JOB_SKILL. Any effect or message Neuz shows at the change is
  copied.
- **First-job weapons:** swords and axes (Mercenary), sticks and knuckles (Assist), yoyos and bows (Acrobat), wands and
  staffs (Magician). Each with the attack motions, combo and reach Neuz picks for it.
- **Wands:** holding the attack button charges, with the charge effect per level; letting go fires the magic missile
  with `SendMagicAttack` and the charge level. The missile flies and the hit shows when it lands. No auto-attack with a
  wand. On phones the attack button is held the same way.
- **Bows:** arrows in the arrow slot; with none, Neuz's refusal. The shot sends `SendRangeAttack` with the arrow's item;
  the arrow flies to the target; the server takes the arrow off. Any charging V15 has for bows is copied.
- **Others:** MAGIC_ATTACK and RANGE_ATTACK shown with their missiles and arrows.
- **First-job skills:** the existing skill system carries the new trees. New: a friendly target for Assist's heals and
  buffs, yourself or another player selected without attacking. Skills that fire a missile use the wand's missile.

### 3.4 M3 — Blinkwings and scrolls

- **Town Blinkwing** (`IK3_TOWNBLINKWING`): to the revival point the server picks; the Escape Blinkwing is forced;
  chaotic players go to the chaotic point.
- **Place Blinkwings** (`IK3_BLINKWING`): to the item's place, another world included, through Piece 5's world change.
- **Scroll of Return** (`II_SYS_SYS_SCR_RETURN`): its classic choice box; the choice goes out with `SendReturnScroll`,
  and the client follows the server's answer.
- **Use:** from the inventory or the task bar, with Neuz's casting motion, cancelled when Neuz cancels it. The level limit
  and the refusals of `DPClient.cpp:10386-10405` show Neuz's messages. Another world goes through the loading screen; the
  same world moves the character and eases the camera.

### 3.5 M4 — Full parties

- **Forming:** invite a selected player from the player's mover menu; the classic invite box (`WndPartyConfirm`) to
  accept or decline, cancelled when the inviter withdraws or it times out; leave, kick (leader) and hand over the lead.
  Every ERRORPARTY shows Neuz's message.
- **Party window** (P, Start → Party, `WndParty`): members with name, level, job, HP and the leader's mark, far members
  greyed; the party's level and points; the leader's EXP and item modes; the advanced party once the party level
  allows it, with its name (`WndPartyChangeTroup`).
- **Party skills** (the skills tab and the task bar): Link Attack, Fortune Circle, Stretching, Gift Box and the others as
  modes, with their screen effects and the server's points; Call, Blitz, Retreat and Sphere Circle with their markers and
  effects for every member.
- **Quick view** (`WndPartyQuick`): members' HP under the status window; a tap selects a member as M2's friendly target.
- **Map and chat:** members on the Navigator and the world map (PARTYMAPINFO); a party chat channel with Neuz's prefix.
- **Phones:** the party window as a full-screen panel; the quick view compact under the status window; a readable invite
  box.
- **Not included:** party duels.

### 3.6 M5 — Flying

- **Take-off and landing:** a board or broom used from the inventory or the task bar, from its level limit (20). The
  character mounts it with Neuz's motion and model. Neuz's refusals (indoors, maps without flight, the level) with its
  messages. Landing as in Neuz.
- **Flight:** Neuz's rules for speed, acceleration, turning, climbing and diving, the turbo and its fuel (SETFUEL), and
  collisions with the ground and objects. Neuz's flight camera. On the PC, Neuz's flight keys, traced in M5's research.
- **Phones** (owner's choice): the joystick turns and climbs or dives; Jump becomes Accelerate while held; Turbo and Land
  buttons; Attack stays.
- **In the air:** attacks where Neuz allows them (MELEE_ATTACK2), flying monsters included.
- **Network:** Neuz's flight messages, within the gateway's limit; Piece 6's traffic test gains the flight paths. Others
  seen flying with their board or broom and flight motions.

### 3.7 M6 — Closed-beta launch

- **Merge and push:** `piece7` into `main`, then pushed to rckycls/webflyff, when the owner says so.
- **Hosting** (`docs/hosting.md`): on the VPS, from the provider's own Windows image, never the test VM. The gateway
  behind Caddy with TLS; the client built with the public gateway and certifier addresses; the game files cached and
  compressed.
- **Sign-up:** a "Create account" link on the login screen to FlyffPortal's register page, its address set at build time
  (`VITE_SIGNUP_URL`). Who gets in is decided by who receives the addresses; the client adds no invite codes. The
  uncommitted register page is not used.
- **Beta label:** a small "Beta" mark and the build version on the login screen, so reports name the build.
- **Owner's checks:** one live session on the hosted servers with browser players and a Windows player (Flaris, a quest,
  a party); the full device checklist on the iPhone, iPad, Android phone and tablet.

---

## 4. Error handling

- The server decides; the client shows its answer. Every refusal shows Neuz's own message.
- A dialogue function, quest message or party message the client does not know is logged once and skipped. It never
  ends the session.
- A malformed message is handled as the existing readers handle one.
- **M0:** an NPC with no picture shows the window without it. A dialogue for an NPC that is gone closes.
- **M1:** a quest missing from the catalog is still listed by its ID with its counts. A catalog row that cannot be read
  is reported by the converter and skipped.
- **M2:** a missing missile or arrow effect shows the hit without the flight. A bow without arrows never sends.
- **M3:** a world change that fails ends as Piece 5's failures do: a message and a clean return, never a half-loaded
  world.
- **M4:** an invite to a player who is gone or already in a party shows ERRORPARTY's message.
- **M5:** a flight correction from the server always wins. A lost connection in the air ends as Piece 6's reconnect
  does.
- **M6:** a missing `VITE_SIGNUP_URL` hides the link instead of linking nowhere.

---

## 5. Testing

Each milestone has:
- **unit tests:** readers, converter steps, the state and HUD logic, with Vitest;
- **one or two Chromium browser specs** (desktop and landscape phone) against the pretend servers;
- **the owner's checks** on the VM and the devices.

Builders run `npm test`, `npm run typecheck` and the one spec file their change touches. The owner runs the full
suites, the corpus tests and the live tests at each checkpoint. Each plan lists the commands, where to run them, how
long they take and what "pass" looks like. Each checklist says what the test characters need (level, job, items,
penya), which the owner sets with GM commands or the database.

| Milestone | Automated | Owner |
|---|---|---|
| M0 | Every dialogue function from the world server's code; `dialogue.spec.ts`: talk to a Flaris NPC, pages, a key, close; the menu with one and with several entries | PC and phone: three Flaris NPCs, the pages, the keys, a shop and the teleporter from the menu |
| M1 | Quest readers and state; the catalog over the real quest files (corpus); `quests.spec.ts`: take a quest, a kill counted, hand it in | The Mercenary chain up to the change; two Flaris starter quests; the tracker and the quest window on the phone |
| M2 | The job change message; the charge rules; the bytes of the wand and bow attacks; `jobs.spec.ts`: the change updates the windows, a wand charge and release, a bow with and without arrows, another player's magic attack | One character finishes the Mercenary chain and changes; one character of each other job at 15 (GM) tries its weapon and two skills |
| M3 | The refusals and the bytes; `travel-items.spec.ts`: a town Blinkwing with the server's move, the Scroll of Return box, a refusal | Buy a Blinkwing in a Flaris shop, use it from the task bar; one to another world |
| M4 | Every party message and the bytes sent; `party.spec.ts`: an invite accepted, members' HP, party chat, a mode changed, a party skill mode on | Two browser accounts form a party, kill and share EXP, chat, hand over the lead; with the party level raised (GM or database), the advanced party and two party skills |
| M5 | The flight rules against the C++ numbers; the traffic test with flight; `flight.spec.ts`: take off, fly, turn, land, another player flying | PC and phone: a level-20 character with a board flies around Flaris' outskirts, hits a monster from the air and lands |
| M6 | A production build with `VITE_SIGNUP_URL` set and unset; the Beta label | The hosted live session with a Windows player; the full device checklist on all four devices |

---

## 6. Docs

- **README:** what Piece 7 adds, and the new build setting `VITE_SIGNUP_URL` (M6).
- **`docs/device-testing.md`:** a section per milestone, with what the test characters need.
- **`docs/hosting.md`:** the sign-up link and the beta build (M6).
- **Checkpoints:** a `docs/piece7-mN-checkpoint.md` per milestone, with what passed and what is still open.

---

## 7. Done criteria

- **M0:** every Flaris NPC opens the menu or the dialogue as Neuz does; the dialogue window matches the V15 layout on the
  PC and fits a landscape phone; Shop and Teleporter still work; the old box is gone.
- **M1:** an ordinary NPC quest can be taken, followed in the quest window and the tracker, and handed in, with the
  server's rewards shown; the Mercenary chain runs to the point of the change.
- **M2:** each of the four chains can end in its job change; each first job attacks with its weapons; Assist can heal and
  buff another player; others' wand and bow attacks are seen.
- **M3:** the town and place Blinkwings and the Scroll of Return work from the inventory and the task bar, another world
  included, and refuse where Neuz refuses.
- **M4:** two or more browser players can form a party, share EXP, chat, become an advanced party and use its skills. A
  mixed party with a Windows player is part of M6's live session.
- **M5:** a level-20 character takes off, flies, fights and lands on the PC and on a phone, within the gateway's limit,
  and others see it flying.
- **M6:** invited testers can sign up through FlyffPortal, log in to the hosted servers in a phone browser, and play
  Piece 7's features next to Windows players.

---

## 8. Out of scope

- The owner's custom server features (`CUSTOM_FEATURES.md`) and the 2026-11-02 server specs.
- Player trade, player shops, guilds, mail and the messenger.
- Crafting, upgrading and piercing; housing; emotes.
- Party and guild quests; party duels.
- The installable app (Piece 6 M4, skipped) and automatic reconnect.
- An open public launch and invite codes.
- Server or gateway changes, including raising the gateway's packet limit.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The dialogue functions and the quest rules are spread over the world server's scripts and Neuz's windows | M0 and M1 each open with a C++ trace into a research note; tests take their cases from it |
| Quest data in several resource files with Korean comments and V15-only fields | The catalog is checked by a corpus test over the real files; unreadable rows are reported, not guessed |
| A new input path (wand charge, flight steering, party skills) floods the gateway | Piece 6's traffic test gains each new path; sending stays at or below Neuz's rate |
| Flight physics and camera are easy to get subtly wrong | M5's research transcribes the C++ numbers into fixtures before any flight code |
| The advanced party and party skills need a high party level to test | The checklist names the GM commands or database steps that set it |
| Hosting on a new VPS surfaces settings the VM never needed | M6 follows `docs/hosting.md` step by step, and any missing step is added to the guide |
| Seven milestones take long | Each checkpoint leaves a playable build, and each plan is sized from its own research |

---

## 10. Plans

One plan per milestone, written just before the milestone starts, each opening with its C++ trace:

1. `docs/superpowers/plans/<date>-piece7-m0-classic-dialogue.md`
2. `docs/superpowers/plans/<date>-piece7-m1-quests.md`
3. `docs/superpowers/plans/<date>-piece7-m2-jobs.md`
4. `docs/superpowers/plans/<date>-piece7-m3-travel-items.md`
5. `docs/superpowers/plans/<date>-piece7-m4-parties.md`
6. `docs/superpowers/plans/<date>-piece7-m5-flying.md`
7. `docs/superpowers/plans/<date>-piece7-m6-beta-launch.md`

(`<date>` is the day each plan is written.)

The work is on branch `piece7`, cut from `main` after Piece 6's merge, in the worktree `FlyffWeb-worktrees/piece7`. The
converted `dist/assets` is copied from the piece6 worktree before the first browser test.

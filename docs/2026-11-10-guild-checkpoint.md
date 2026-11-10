# Guild: checkpoint (2026-11-10)

Branch `guild` (worktree `FlyffWeb-worktrees/guild`, cut from main c6e71e2). Not merged, not pushed.
Research: [docs/superpowers/specs/2026-11-10-guild-research.md](superpowers/specs/2026-11-10-guild-research.md) and its five
appendices. No server or gateway change is needed.

## What was built

- **Packets** (`packages/protocol/src/world/guild.ts`): every core guild packet both ways and the world's guild
  snapshots (the invite, the guild set on a mover, created, disbanded, the whole guild, every guild with the ranking, logo,
  contribution, notice, rights, salary, payout, the war id); ADD_OBJ keeps a player's guild, war and guild-cloak ids; the
  guild chat keeps its speaker. Testkit writers for all of them (`packages/testkit/src/guild.ts`).
- **The guild book** (`apps/client/src/world/guild/guildBook.ts`): Neuz's `g_GuildMng` and the own guild, each
  `CDPClient::On*` handler copied, with their chat lines (joined, left, a member joined/left, new master, level up, notice,
  rights, salary, rename, name taken, created, disbanded). One QUERY_PLAYER_DATA2 for the members after GUILD, as `OnGuild`.
- **The guild window** (`hud/guild/guildWindow.ts`), APP_GUILD 448 x 368, centred, from Start → Guild (a 14th menu line
  after Party), the G key and applet shortcuts; it opens without a guild too, as Neuz's. Its five tabs as resdata.inc lays
  them out:
  - Information: name, master, points, fund, level, members "n / limit", logo, notice; Setup Guild Name (once, while the
    name is empty), Setup Notice, Setup Logo, Disband Guild, master only (silent for others, as Neuz).
  - Member: the owner-drawn list (rank icons with the class, job icons, level, name, nickname; offline grey), sortable by
    its five heads; the member menu (Promote, Demote, Class Up, Class Down, Create Nickname, Leave Guild, and for the master
    Change of Guild Leader) with Neuz's checks; the tooltip with the member's contribution.
  - Title: the members per rank against their limits, the rights grid (Title, Rank, Join, Penya, Item), the salaries and
    their Setup buttons, Apply Settings.
  - Guild Duel: enemy guild, its logo, won, lost, given up, time left.
  - Permissions: the guild house's two rights (furniture, maintenance fee), OK.
- **The small windows** (`hud/guild/guildDialogs.ts`): the invite (YES / NO, centred 70 px down), the guild name (also the
  rename scroll II_SYS_SYS_SCR_GCHANAM and the server's forced rename: QUERYSETGUILDNAME), the nickname, the notice
  (multi-line), the logo (20 logos), the disband confirm, the salary. Each with Neuz's checks and texts.
- **In the world**: "Invite to join guild" in the player menu for a viewer whose rank may invite; the guild name above
  heads (white, the master's light yellow) with the 24 x 24 logo left of it; the guild chat's bubble over the speaker; the
  phone chat's Guild view sends `/g` and is off outside a guild (the desktop chat's Guild tab follows a join or leave);
  the Messenger's Guild tab lists the members (channel, state, level, job, name; sorted; a double click opens a message).
- **Pictures**: 17 guild buttons added to the UI stage; the 27 logos (`Icon_CloakSLogo01..27.jpg`, JPEGs the converter
  cannot decode) are copied as they are to `ui/logo/` and drawn by the browser.
- **The phone**: the guild window is fitted to the screen (as the party and character windows), every text 14 px, the
  picture buttons shown as short words, the member list scrolls by touch, a tap on a member opens its menu (no right
  click), the text fields are 16 px with Done/Enter on the phone keyboard, the joystick and shortcuts hide while it is open.
- **Tests**: protocol (`packages/protocol/test/guild.test.ts`), the book and rules (`apps/client/test/guildBook.test.ts`),
  the windows (`apps/client/test/guildHud.test.ts`), the player menu, the Start menu; e2e `apps/client/e2e/guild.spec.ts`
  (2 tests, desktop and phone).

Small, knowing changes from Neuz (each noted in the code): the member list keeps its sort on a refresh and its selection
by player (Neuz loses both); the Title and Permissions tabs share one rights array (Neuz keeps two that overwrite each
other); the nickname is compared with the target's (Neuz compares with the master's); the guild bubble uses the browser's
one chat bubble (not `texDialogBoxGuild`); the Guild Duel tab's three buttons are disabled until the war milestone.

## What is left, and why

| Piece | Why not here | Short plan |
|---|---|---|
| Guild bank, contribution, guild cloak | The contribute window (`CWndGuildMerit`) and the cloak button open only from the guild bank window, a system of its own (item grid, put/take with PF_PENYA/PF_ITEM, penya, log). Medium. | Next milestone: GUILD_BANK_WND / PUT / GET snapshots and senders, `CWndGuildBank` (WndGuildBank.tga) with the bag's drag (desktop) and tap (phone), the NPC menu's "Guild Warehouse", `CWndGuildMerit` (gems, penya), the cloak button, the bank log. |
| Guild war (guild duel) | Medium: 5 dialogs (declare, request, peace, peace confirm, give up), 8 core packets, the war mark over enemies, start/kill/end lines. | Next after the bank: the War tab's buttons, `DPClientGuildWar.cpp`'s handlers, `XI_GEN_PVP_FLAG01` on enemies. |
| Guild ranking windows | Small-medium; the ranking data already arrives with ALL_GUILDS. | 3 windows from the bank NPCs' menu (MMI_RANK_GUILD / WAR / INFO). |
| Guild Siege, 1:1 Guild Siege | Large: a dozen windows, a HUD, a map, a state machine. | Their own piece each. |
| Guild house | Large: its world, furniture placement, teleporter, upkeep. | Its own piece. |
| Guild quests | Off on this server (`WORMON` commented out). | Skip. |
| Guild votes | Not compiled for the main server (`__GUILDVOTE`). | Skip. |
| Guild member's minimap dot, the guild cloak's tooltip line | Small; not asked. | The dot is `partyMarks.ts`' sprite 3; the tooltip needs the item's `m_idGuild` (read and dropped in `own.ts:200`). |

The guild-name-change item window (asked about): **added** (the rename scroll opens the guild's name window).

## In-game checklist for the owner (PC, then a phone)

Two characters, A (level 40+, quest 142 "Create a guild" done, 3,000,000 penya) and B, plus a third C for the party of 3.

1. A, B and C in a party with A the leader, at Helena (Saint Morning): her dialogue creates the guild. Everyone sees
   "A has formed the guild ''." A and B see "You have joined the ... guild." (music plays).
2. A: G (or Start → Guild): the window opens on Information. Setup Guild Name → type a name → OK. Everyone sees the
   rename line; the name shows above A's, B's and C's heads (A's in light yellow).
3. A: Setup Notice → type → Open Notice. Members see "A new Guild Notice has been posted...". The Information tab shows it.
4. A: Member tab → right click B (phone: tap B) → Promote Member: B's rank icon changes. Class Up: an extra icon.
5. A: Title tab → tick Kingpin's Join → Apply Settings: "Authority for each title has been changed." B (Kingpin now) can
   right click (tap twice) a player outside the guild: "Invite to join guild" is in the menu.
6. A third player D: B invites D; D sees the invite window with the guild's name → YES; everyone sees "D has joined the
   guild."; NO sends nothing (as Neuz).
7. Guild chat: on the PC the chat's Guild tab, on the phone the chat's Guild view; a line shows as "[name] text" for every
   member, and a bubble over the speaker.
8. Messenger (E) → Guild tab: the members, online ones with their channel.
9. A: Member tab → right click D → Leave Guild (kicks D): "D has left the guild."; D sees "You are no longer a member...".
10. A: guild level 2+ (contribution comes with the bank milestone; or set by GM): Setup Logo → pick one → OK: the logo
    shows left of the guild name above heads.
11. On the phone: steps 2-9 by taps; every text readable (14 px or more), the keyboard opens for the name/notice/nickname
    fields, the member list scrolls with a finger.
12. A: Disband Guild → Yes: members see "You are no longer a member..." and the guild line goes from every head.

## Commands

The owner's main folder needs a UI-only convert (it adds 17 theme pictures and the 27 logos; it does not touch
`itemProps.json`):

```
npm run convert -- --only "ButtName*,ButtNotice*,ButtSetlogo*,ButtDismiss*,ButtGuildMemberTab*,ButtPay*,ButtGuildWar*,ButtGuildDuel*,ButtPeace*,ButtGiveUp*,Icon_CloakSLogo*"
```

The full suites are the owner's:

- `npm run typecheck`: clean.
- `npx vitest run`: all pass but the 5 old failures of main (`looks.test.ts` x3 heldModels, `inventoryWindow.test.ts` x2).
- `npm run test:e2e:client`: `guild.spec.ts` passes on `chromium` and `phone`. The Start menu now has 14 lines (384 px);
  `hud.test.ts` was updated. `landscape.spec.ts` "on a touch phone all nine Start menu entries fit ..." was already failing
  on main (it expects 9 lines; main has 13, each under its 22 px floor) and fails the same way here (14): an old failure.
- `npm run test:corpus`: `uiStage.corpus.test.ts` now expects the 27 logos copied and no JPEG warning (it was one warning).

Builder's runs on this branch: `npm run typecheck` clean; `npx vitest run` 4201 passed, 5 failed (the 5 old ones above),
9 skipped; `guild.spec.ts` 4/4 on port 5183 (desktop and phone).

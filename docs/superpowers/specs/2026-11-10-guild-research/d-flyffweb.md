# D. FlyffWeb map for the guild system

Research only (2026-11-10). Repo: `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\guild` (branch `guild`, at
`c6e71e2 Merge branch 'personal-shop'`, clean). All paths below are relative to that root unless they start with
`Source/` (= `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Source`, the C++).

The worktree's `dist/assets` is a real folder (not a junction; 743 files in `ui/`), so `--out` into it is safe.

---------------------------------------------------------------------------------------------------------------------

## 0. One-paragraph summary

Almost nothing of the guild exists. The protocol reads the guild fields of ADD_OBJ and drops them; the login character
list keeps `guildId` (it goes back in JOIN and enables the desktop chat's Guild tab once, at world entry). Guild chat
already works both ways as plain text: the chat sends `/g text` as an ordinary CHAT packet, and the core's direct packet
`0xffffff39` is read as `{type:'guild'}` and printed `[name] text` in `0xffffbaff`. The Messenger draws an empty Guild tab.
The player menu has no "Invite to join guild" entry at all; the NPC menu filters out MMI_GUILDBANKING. The applet table has
APP_GUILD (323, G) but the task bar's `WINDOWS`/`MENU` do not. No guild window, no guild packets, no name-tag guild line,
no logo pictures (the converter skips the 27 `Icon_CloakSLogo*.jpg`: no JPEG decoder), no cloak texture swap (and Neuz's
release build does not swap either: see §1.7).

---------------------------------------------------------------------------------------------------------------------

## 1. What guild-related code exists today

### 1.1 ADD_OBJ (protocol) - guild fields read and dropped

`packages/protocol/src/world/addObj.ts`, `readPlayer` (shared by the own character and others):

| line | field | today |
| --- | --- | --- |
| 109-112 | `if (r.u8() === 1) { r.u32() /* m_idGuild */; r.u32() /* m_idWar */ }` | dropped (note: exactly 1, as the C++ `if( u1 == 1 )`) |
| 113 | `r.u32(); // m_idGuildCloak` | dropped (always present) |
| 134 | `r.i32(); // m_nGuildCombatState` | dropped |

- The own character goes through the same `readPlayer` (`self` true), so the own `m_idGuild` is also dropped here; the
  own branch then reads `readOwnEquipment` / `readOwnAfterEquipment` (addObj.ts:142-145).
- `packages/protocol/src/world/own.ts:200` `r.u32(); // m_idGuild` is the **item's** guild id (`CItemElem::m_idGuild`, a
  guild cloak's owner guild) inside `readInventoryItem`, not the mover's. Also dropped. `items.ts:45` same for another item
  reader ("guild id").
- Type: `packages/protocol/src/world/types.ts:460-530` `interface AddedPlayer` has no guild field; its doc comment
  (:461-463) says "the guild and party ... are read past, not kept".
- C++ reference for the write side: `Source/_Common/ObjSerializeOpt.cpp:140` (`ar << m_idGuildCloak`) and :451 (read).

To keep them: add e.g. `guildId?: number; warId?: number; guildCloak?: number; guildCombatState?` to `AddedPlayer`, set
them in `readPlayer`, and update **both writers** that build ADD_OBJ bytes:
- `packages/testkit/src/world.ts:640-656` `playerStart`: `.u8(0) // m_idGuild > 0 is false`, `.u32(0) // m_idGuildCloak`,
  `w.i32(0); // m_nGuildCombatState` -> write from `p.guildId` etc.
- `packages/protocol/test/addObj.test.ts:85-102` has its own writer (`if (guild) w.u8(1).u32(42).u32(3); else w.u8(0);`
  `w.u32(42); // m_idGuildCloak`, `w.i32(0); // m_nGuildCombatState`) - a test that already writes a guild of 42, war 3.
- The C++ world server writes the flag as `m_idGuild > 0` (testkit comment): a value of 1, so `=== 1` is right.

### 1.2 Login / JOIN - the only kept guild id

- `packages/protocol/src/messages/login.ts:86` `guildId: number;` in the PLAYER_LIST character, read at :137
  (`const guildId = r.u32();`), returned :156.
- `packages/protocol/src/messages/world.ts:30` `guildId` in the JOIN fields; encoded at :52
  (`.u32(j.partyId).u32(j.guildId)`; C++ `CDPClient::SendJoin`, DPClient.cpp:9089).
- `apps/client/src/world/WorldSession.ts:310` JOIN built from `character.guildId` (the lobby's PLAYER_LIST).
- `apps/client/src/world/WorldScreen.ts:1754-1756`: `this.chatWindow.setGuild(this.entry.character.guildId !== 0)` once at
  HUD build (desktop chat only). Nothing updates it later (a join/leave in play leaves the tab as it was).
- Tests: `apps/client/test/worldSession.test.ts:33, :250` (guildId 12 passed through), `packages/protocol/test/world.test.ts:11, :114`,
  `packages/protocol/test/login.test.ts:42`.

### 1.3 Guild chat - works today as text

Sending:
- `apps/client/src/world/hud/chatCommandTable.ts:28` `['GuildChat', 'g', 'F', 'B', '<text>', 'Guild chat']` (TCM_BOTH).
- `apps/client/src/world/hud/chatSend.ts:16` (header: `TextCmd_GuildChat (client) FuncTextCmd.cpp:1172-1183 "/g text",
  filtered`), :119 `const GUILD = 'GuildChat';`, :234 `if (command === GUILD) return { send: `/g ${wordChange(args, this.filter)}`, notes: [] };`
  - no "in a guild" check on the client (Neuz's client half has none either per the header; party has one: :231-232).
- The outcome's `send` goes out as **plain chat** (`encodeChat('nearby', ...)`, CHAT 0x00ff0000):
  desktop `apps/client/src/world/hud/neuzChat.ts:651`, phone `apps/client/src/world/hud/chatWindow.ts:155`; the world
  server's `/g` handler routes it. (`packages/protocol/src/world/chat.ts:36` also has a `channel === 'guild'` ->
  `/GuildChat text` path in `encodeChat`, used by nothing in the HUD now; `WorldSession.sendChat` at WorldSession.ts:196.)
- Desktop chat tabs: `apps/client/src/world/hud/chatRules.ts:23` `CHATSTY.GUILD: 0x0010`, :50 the Guild tab
  (`ButtChatGuild.BMP`, prefix `/g `, tooltip "Sending messages to guild members."), :59 its default filter;
  `neuzChat.ts:111` the filter window's Guild check; `neuzChat.ts:529-530` `setGuild(inGuild)` enables tab 4.
  `tools/convert/src/ui/uiStage.ts:221` converts `ButtChatGuild.BMP`.
- Phone chat (`chatWindow.ts:74`) has a Guild view button, but **no `setGuild`** and no `/g ` prefix: only the Party
  view adds `/p ` (chatWindow.ts:119). A line typed in the phone's Guild view goes as nearby chat unless typed `/g ...`.
  (Gap to fix with the guild work.)

Receiving:
- `packages/protocol/src/messages/world.ts:361-362`: direct packet `0xffffff39` -> `readSocial(r, 'guild')`
  (`packages/protocol/src/world/chat.ts:45-49`: `speakerId u32`, `sender string(32)`, `text string(1024)`).
  Note `0xffffff39` is a core packet id written as a literal here (no `PacketType` name).
- `apps/client/src/world/WorldSession.ts:598-602`: 'guild' handed on as a message of type `0xffffff39` with
  `objectId NULL_ID` while playing.
- `apps/client/src/world/WorldScreen.ts:891-899`: `value.type === 'guild'` -> `this.chatWindow?.append('guild', value.sender, value.text)`.
- `chatRules.ts:86-87, :105-106`: `[sender] text` in `GUILD_COLOR = 0xffffbaff` (TID_GUILD_CHAT's colour,
  textClient.inc:4712; `OnGuildChat` DPClient.cpp:12866), style CHATSTY.GUILD. Phone CSS `style.css:1943`
  `.chat-transcript [data-channel=guild] { color: #94e9ed; }`.
- Tests already covering it: `packages/protocol/test/worldChat.test.ts:40-48`, `apps/client/test/chatRules.test.ts:20-27, :45-49`,
  `apps/client/test/chatWindow.test.ts:32-56`, `apps/client/test/chatSend.test.ts:107`, `apps/client/test/neuzChat.test.ts:48-69`,
  e2e `apps/client/e2e/talking.spec.ts:211-213` (Guild radio disabled outside a guild).

### 1.4 Name tags above heads - no guild line

- `apps/client/src/world/render/nameTags.ts:73-99` `nameTagOf(mover, viewer, colors, honorTitles, inParty, jobs)` returns
  one `{ text, color, maxDistance, mark? }`. The comment at :70 lists what is not copied: "the guild-war colours
  (`:1238-1245`, they need the guild ids)". No guild name line, no logo.
- `apps/client/src/world/render/NameTagLayer.ts` draws **one line** per tag on a canvas sprite (`add`, :132-189:
  12 px Verdana, 2 px outline rgb(60,60,60), text top 20 px above the head point, 3 px left of centred; an optional
  25 x 25 mark (Master/Hero icon) after the name, loaded from `url(key)`). `recolor()` (:82-95) redraws a tag whose
  text/colour/mark changed. Hook for tests: `window.__client.tags()` (`apps/client/src/testHooks.ts:108`) and
  `NameTagLayer.textOf`.
- Called from `WorldScreen.ts:2039` (sync on adds) and `WorldScreen.ts:3374-3377` `recolorTags()` (party change, mode change,
  pet name). Recolor after a guild change would call `recolorTags()`.
- What Neuz draws (`Source/_Common/MoverRender.cpp:1590-1660`, `RenderName`): the **guild name** (`pGuild->m_szGuild`)
  as its own line above the player's name (`pFont->DrawText(... dwColor, pGuild->m_szGuild)`), and if `m_dwLogo != 0`
  the logo picture `pWndWorld->m_pTextureLogo[logo-1]` (`Icon_CloakSLogo%02d.jpg`, loaded in
  `Source/_Interface/WndWorld.cpp:3669-3677` from DIR_ICON) left of the wider of the two texts; guild-siege best/winner
  marks after it. So the tag would need a second text line (and an optional logo picture left of it): `NameTag` would
  grow e.g. `guild?: { name, color, logo? }`, and `NameTagLayer.add` lays two lines.

### 1.5 Player right-click menu - no guild entry

`apps/client/src/world/party/playerMenu.ts`:
- Header :4-12 lists Neuz's entries; :7 `MMI_INVITE_COMPANY 7 Invite to join guild in a guild that may invite
  (:6556-6565): no guild here`.
- `ENTRIES` :30-33 = Trade 2, Add to my list 5, Invite to join party 6, Follow 12, View equipment 24, Cheer 31,
  Request Mentor-Pupil Bond 151. **MMI 7 is not in the list at all** (not even greyed).
- `playerMenuEntries(texts, vendor)` :39-45: label `menuLabel(id, texts, english)` (TID_MMI_DIALOG + id = text 7000+id,
  `hud/moverMenu.ts:52-61`); `enabled` only for 6, 5, 2.
- The press: `WorldScreen.ts:3184-3197` `pressPlayer(id)` (focus, 20 m reach, `moverMenu.open(playerMenuEntries(...), at,
  (entry) => this.choosePlayerEntry(id, entry))`); `WorldScreen.ts:3199-3214` `choosePlayerEntry` dispatches MMI_TRADE to
  `tradeHud.requestTrade(id)`, MMI_ADD_MESSENGER to `friendHud.addFromMenu(playerId, name)`, MMI_INVITE_PARTY to
  `inviteToParty(playerId)`. A guild invite goes here: `if (entry === MMI_INVITE_COMPANY && player) this.guildHud?.invite(...)`.
- How the menu opens: desktop right click (`WorldScreen.ts:1790-1795`, the TapToWalk right-press callback) or Alt+click;
  **phone: a tap on a player that is already the focus** (`WorldScreen.ts:1787-1788`:
  `press.alt || (press.touch && this.focus?.targetId === press.mover)`), i.e. tap once to select, tap again for the menu.
- Unit test to update: `apps/client/test/playerMenu.test.ts:34-42` (exact entry list).
- NPC menu: `apps/client/src/world/hud/moverMenu.ts:23` `MMI.GUILDBANKING: 15`; :69-70 filters it out ("the browser has
  no guild"); tests `apps/client/test/moverMenu.test.ts:9-14`, e2e `dialogue.spec.ts:36`.

### 1.6 Messenger - Guild tab drawn, empty

`apps/client/src/world/hud/friends/messengerWindow.ts`:
- :14 "The Guild and Mentor-Pupil tabs are drawn, but their lists stay empty: the browser keeps no guild or campus member list."
- :49-52 `TAB_TITLES` = `TID_APP_COMMUNITY_FRIEND` Friend, `TID_APP_COMPANY` Guild, `TID_APP_COMMUNITY_CAMPUS` Mentor-Pupil.
- :150-176 the tab control: `friendPanel` (the list `.hud-messenger-list` + `textScrollBar`) and two `empty()` panels
  (`this.panels = [friendPanel, empty(), empty()]`, :174). A Guild list would replace panel 1 with a list like the
  Friend one (Neuz: `CWndGuildCtrlEx`, WndMessengerCtrl.cpp, the guild members with channel/state/level/job/name).
- :186-213 `showTab(tab)` (tab strip from `WndTabTile*.bmp`); :216-232 `update(view)`: server/channel shown on Friend and
  Guild tabs (:224-227), rows only for the Friend tab; `MessengerView.rows` (:56-67) is the friend rows only.
- :138-139 the column heads sort only on tab 0 (`if (this.tab === 0) this.onSort(key)`).
- Row drawing to reuse: `rowElement` :243-286 (channel icon x20, state x76, level x127, job type x174, job x194, name
  x226, 20 px pitch from y 3) with `friendRules.ts` helpers `channelFrame`, `stateFrame`, `jobFrames`, `nameText`,
  `nameColor` (`apps/client/src/world/friends/friendRules.ts`).
- Owner: `apps/client/src/world/friends/friendHud.ts` (`FriendHud`, built at WorldScreen.ts:1634-1665); the list itself
  `apps/client/src/world/friends/messenger.ts` (`Messenger`, the screen's, survives world changes, `apply(value, ownPlayerId)`
  returns `FriendEvent`s, WorldScreen.ts:829-833).
- e2e asserts the three tab titles: `apps/client/e2e/friends.spec.ts:74`.
- Other guild mentions in friends: `friendRules.ts:210-218` `WI_WORLD_GUILDWAR = 202` and the add-friend refusal
  `TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD` (test `friends.test.ts:147`).

### 1.7 Models: the cloak slot, and texture swaps

- `apps/client/src/world/render/looks.ts:49-52` `Parts.CLOAK: 8`, `CLOAK2: 30`; :63-68 `OVERCOATS` includes
  `[Parts.CLOAK, Parts.CLOAK2]` (a fashion cloak hides the cloak). `humanLook` :166-194 puts every worn, non-expired
  item's model in its slot (`equippedBy` :122-131 from `WornPart`s: ADD_OBJ's `worn` for others; the own character from
  the lobby's PLAYER_LIST equipment, `types.ts` comment at `equipmentObjectIds`). **The cloak is drawn as an ordinary part
  with its own texture.**
- Texture swap support exists only as a whole-model "texture set": `MoverLook.textureEx` (looks.ts:35-39, :317) ->
  `apps/client/src/world/render/moverModels.ts:87, :97-121` `useTextureSet(scenes, set, store, report)`, which rewrites
  each material's `userData.texture` key (`textures/<x>.ktx2` -> `textureExKey(key, set)`) before textures load. A
  per-part swap (only the cloak part's material) could follow the same pattern on `loaded.find(part => partSlot(part.key)
  === 'cloak')` before `assembleCharacter`.
- **Neuz's live build draws no guild texture on the cloak:** `Source/_Common/GuildRender.cpp:37-41`
  `CGuildTexture::LoadGuildTexture` starts with `#ifndef _DEBUG return NULL; #endif`; the texture would be
  `CT%06d.jpg` from DIR_LOGO (:62-66). `m_pCloakTexture` is set from it (`MoverEquip.cpp:1841, :1915, :2003`) and used for
  PARTS_CLOAK only (`ModelObject.cpp:1186-1189`, `MoverRender.cpp:346 SetExtTexture`). Release Neuz -> NULL -> the
  cloak's own texture. So a faithful port needs **no** cloak texture swap; keeping `m_idGuildCloak` is only for the
  item tooltip / vendor checks.
- Item side: `apps/client/src/world/vendor/vendorRules.ts:76, :86-87` `isGuildCloak(kind3, guildId)` (IK3_CLOAK 24 and a
  guild) exists but is unused because the browser keeps no guild; `apps/client/src/world/items/itemTooltip.ts:17` lists
  "the guild cloak's guild name" as not drawn (it needs the item's `m_idGuild`, dropped at own.ts:200, and the guild name).

### 1.8 Task bar: Start menu and applets

`apps/client/src/world/hud/taskBar.ts`:
- :58-59 `type TaskBarWindow = 'character' | ... | 'messenger' | 'vendor'` - add `'guild'`.
- :60-70 local consts (`APP_QUEST_EX_LIST = 859`, `APP_PARTY = 195`, `APP_MESSENGER_EX = 302`, `APP_VENDOR_REVISION = 591`);
  add `const APP_GUILD = 323` (`Resource/ResData.h`).
- :76-89 `WINDOWS: Map<appId, TaskBarWindow>` - what an applet opens (Start menu line, a task-bar slot, the hotkey).
  Adding `[APP_GUILD, 'guild']` also makes the **G hotkey** work automatically (`HOTKEYS` :95-99 are built from
  `WINDOWS` x `APPLETS[id].hotkey`).
- :106-131 `MENU` lines in order; a line is enabled when `WINDOWS.has(id)` (:415). Neuz puts APP_GUILD ("Guild",
  `TID_APP_COMPANY`) in the Community submenu right after APP_PARTY (`Source/_Interface/WndTaskBar.cpp:2670-2671`); the
  browser's menu is flat, so `{ id: APP_GUILD, text: 'Guild' }` after `{ id: APP_PARTY, text: 'Party' }`.
- :941-947 `execute(id)` -> `this.actions.open(window)`; `WorldScreen.ts:2767-2798` `openWindow(window)` is the switch:
  add `if (window === 'guild') { this.guildHud?.toggle(); return; }` (the messenger/vendor lines :2779-2783 are the model).
- `apps/client/src/world/hud/applets.ts:63` `[323, applet('APP_GUILD', 'Icon_Troupe.dds', 'TID_TIP_COMPANY', 'G')]`
  already registered (icon, tooltip, hotkey G; C++ `FuncApplet.cpp:245` `AppMain_WndGuild`).
- Tests to update: `apps/client/test/hud.test.ts:899-915` (the 13 Start-menu labels and the 362 px menu height:
  `taskMenu.ts:73-74` height = 50 + 22 x lines + 26, so 14 lines = 384 px; the comment at :36 says the picture's stripes
  line up with an even number of rows, and 14 is even), :1347-1360 (menu scale / room above the bar uses 362),
  :1059 (the "dead flags" APP_GUILD_VOTE stays unregistered).

### 1.9 Character window - no guild line (none in V15 either)

`apps/client/src/world/hud/characterWindow.ts:101-107` `BASE_ROWS` = name, job, level, server, channel. V15's
`CWndCharInfo::OnDraw` has the same five (`Source/_Interface/WndField.cpp:3172-3178`); the commented-out
`TID_GAME_CHARACTER_03` line (:3175) is "Job Level", not a guild. So **nothing to add** there for V15 fidelity; the guild
info belongs to the Guild window (APP_GUILD, `CWndGuild` info tab).

### 1.10 Other guild mentions (for awareness)

- `apps/client/src/world/gmCommands.ts:119-122`: `destroyguild` (TCM_CLIENT, `chatCommandTable.ts:90`) does nothing
  ("no guilds in the web"). `createguild` /cg (:89, server), `GuildStat` /gstat, `GuildInvite` /guildinvite (:30, server),
  `GuildRanking` (:59), the siege commands (:91-94, :119-121) are in the table and go to the server as typed.
- NPC dialogue: `packages/protocol/src/world/npc.ts:35, :82` `queryName of 'guild'` (QUERYSETGUILDNAME 0x25);
  `WorldScreen.ts:3527-3528` reports "the guild name window is not in the browser". `npc.ts:60` CREATEGUILD and
  QUERYSETGUILDNAME script actions read and ignored.
- Quests: `apps/client/src/world/quests/questLines.ts:29-42` QUEST_CREGUILD 142 (no "Quest Complete!");
  `packages/formats/src/inc/propQuest.ts:243` guild end condition marked unsupported; `questRules.ts:15`.
- `apps/client/src/world/party/partyMarks.ts:11`: the guild member's minimap/indicator dot (sprite 3) left out for want of
  guild data.
- `apps/client/src/world/hud/statusWindow.ts:185`: guild-house rest bar, 0.
- Guild war world 202: `items/travelItems.ts:17-19, :91`, `friends/friendRules.ts:210-218`, `sound/worldSounds.ts:136`,
  `audio/soundIds.ts:35`, `hud/messageBox.ts:2-3`.
- `apps/client/src/world/trade/tradeHud.ts:218`, `vendor/personalShop.ts:69`: guild bank listed among windows that would
  close a trade/shop (no guild bank exists).
- `packages/testkit/src/worldScript.ts:70`: JOIN bundle note - the guild messages of `CUser::Open` are not scripted.

---------------------------------------------------------------------------------------------------------------------

## 2. How a feature is wired end to end (trade as the model)

The layers, each a file of its own (trade / friends / vendor all follow it):

```
packages/protocol/src/world/trade.ts        packet ids, message types, readers, encoders, request decoders
packages/protocol/src/world/readers.ts      WORLD_READERS: snapshot type -> reader (spread TRADE_READERS)
packages/protocol/src/world/types.ts        WorldMessage union (| TradeMessage)
packages/protocol/src/messages/world.ts     direct (non-snapshot) packets + the pretend servers' request decoding
packages/protocol/src/index.ts              export * from './world/trade' (:67; friends :53, vendor :62)
packages/testkit/src/trade.ts (+ index.ts)  writers of the server's messages for unit + e2e tests
apps/client/src/world/WorldSession.ts       sendX() wrappers over encoders; direct packets -> 'messages' events
apps/client/src/world/trade/tradeState.ts   pure rules: apply(objectId, message, ctx) -> TradeEvent[]
apps/client/src/world/trade/tradeHud.ts     windows + rules + session; a `TradeHudScreen` interface of callbacks
apps/client/src/world/hud/trade/tradeWindows.ts   the windows (ResWindow layouts copied from resdata.inc)
apps/client/src/world/WorldScreen.ts        construct, route messages, append elements, modals, menu entry, reset
apps/client/src/style.css                   desktop look + the phone block
tools/convert/src/ui/uiStage.ts             THEME_FILES += the window pictures
```

### 2.1 Protocol: two kinds of server messages

1. **Snapshot messages** (inside a JOIN/SNAPSHOT bundle; `SNAPSHOTTYPE_*`, a WORD type, an object id per message):
   - ids: `TradeMessageType` (`trade.ts:38-52`); union `TradeMessage` (:62-75); readers (:77-94); table
     `TRADE_READERS` (:97-110); `isTradeMessage` (:113-119).
   - registered in `packages/protocol/src/world/readers.ts:54, :216-217` (`...TRADE_READERS` in the `WORLD_READERS` Map;
     friends :153-159 and vendor :160-167 list their entries one by one).
   - union: `packages/protocol/src/world/types.ts:16-19`
     `export type WorldMessage = ChatMessage | NpcMessage | ... | FriendMessage | TradeMessage | VendorMessage | {...}`.
   - The bundle reader (`packages/protocol/src/bundle.ts` `readBundle`) skips a type with no reader thanks to the
     server's `server-patches/world-snapshot-index.patch` (a table of contents per bundle); unknown types count in
     `WorldSession.stats.skipped`. So today's guild snapshots are skipped silently (not fatal).
2. **Direct packets** (a whole packet with a u32 `PACKETTYPE_*`, mostly from the core server: friends, party, chat):
   - read in `decodeWorldPacket` (`packages/protocol/src/messages/world.ts:353-423`): explicit `case`s (guild chat
     `0xffffff39` :361-362, ERRORPARTY, LOGOUT, BLOCK, GETPLAYERCOUNT ...) and in `default:` (:416-421) the friends'
     `readFriendPacket(packetType, r)` (`world/friends.ts:136-172`; type `FriendDirectMessage` :95; `friendPacketTypeOf`
     :175-187 maps a value back to its packet id).
   - result type `WorldPacket` (`messages/world.ts:249-336`; `| FriendDirectMessage` :330).
   - `WorldSession.onCachePacket` (`apps/client/src/world/WorldSession.ts:588-664`) turns them into the same
     `'messages'` event as snapshots: `this.notify({ type: 'messages', messages: [{ objectId: NULL_ID, type: <id>, value }] })`
     (friends :623-636). **Only while `phase === 'playing'`**: a direct packet during `join` or a world `transition` is
     dropped (phase set at :685 / :708). Check that the guild's login-time packets arrive after the JOIN bundle.
   - A new direct type needs: a reader in the feature's module, its `case` list in `onCachePacket`, and a
     `xxxPacketTypeOf` (or a literal) for the notify's `type`. An undeclared one lands in `case 'unknown'` (:660-663, a
     console warning once).
3. **The browser's own packets**: `encodeX` functions using `clientPacket(type)` (`packages/protocol/src/world/packet.ts:9-11`:
   DPID_UNKNOWN then the u32 type) + `ArWriter` (`.u8 .u16 .i16 .u32 .i32 .f32 .vec3 .string(s)`). For the pretend servers
   each feature has a `XRequestPacket` union + `readXRequestPacket(packetType, r)` (`trade.ts:155-191`), chained in
   `decodeClientPacket` (`messages/world.ts:431-`; its `default:` :659-671) and added to the union (`messages/world.ts:332-335`).
   Without it testkit's `script.on('guildXxx', ...)` cannot match. Chat-style commands (`/g`, `/guildinvite`,
   `/createguild`) are plain CHAT `0x00ff0000` (`encodeChat`, `world/chat.ts:33-39`).
- The gateway relays everything (`apps/gateway/src/relay.ts:39-55` only refuses the browser sending
  GATEWAY_CLIENT_ADDR), so no gateway change is needed for new guild packets.

### 2.2 WorldSession: sending

`apps/client/src/world/WorldSession.ts:123-259`: one line per packet, always `this.playingCache()?.send(bytes)` (nothing
goes out outside the playing phase). Those with the own player id use `this.ownPlayerId()` (:260,
`entry.character.playerId`), e.g. `sendAddFriendRequest(targetId)` (:236). Trade: :246-257. The vendor took a shortcut:
`sendVendor(bytes: Uint8Array)` (:259), the feature calling the encoders itself (`WorldScreen.ts:3220-3221`
`const send = (bytes: () => Uint8Array) => session.sendVendor(bytes())`). For the guild either style works; the generic
one keeps WorldSession small (`sendGuild(bytes)`).

### 2.3 WorldScreen: routing and building

- **Screen-level state** (survives world changes): `WorldScreen.ts:476-492`: `party`, `messenger = new Messenger()`,
  `friendEvents: FriendEvent[]` (events queued while the HUD is not built), `friendHud`, `tradeHud`. A guild model (the
  own guild, its members, the names/logos of other guilds seen) belongs here, like `messenger`.
- **Routing** in `apply(messages, joining)` (`WorldScreen.ts:819-...`), in order:
  - :822-828 `playerData.apply`, `party.apply` -> events to `partyHud`;
  - :829-833 `messenger.apply(value, ownPlayerId)` -> `friendEvents` -> `friendHud.handle(...)` once it exists;
  - :835 `say` -> `friendHud.onSay`; :837 `if (isTradeMessage(value)) { this.tradeHud?.handle(objectId, value); continue; }`;
    :838 `block` -> `tradeHud.onBlock`;
  - :878 `VENDOR_MESSAGES.has(value.type)` (set at `WorldScreen.ts:225`) -> `personalShop.apply(objectId, value)`;
  - :891-899 chat kinds -> `chatWindow.append(...)`;
  - :948-951 `definedText` -> `chatWindow.append('system', '', text, undefined, color)`;
  - :971-974 `delObj` of a mover in view -> `attackLoop.onRemoved`, `tradeHud.removed(objectId)`;
  - movers' ADD_OBJ goes to `WorldState` (`world.apply`), name tags via `tags.sync` (:2039).
  Guild pattern: `for (const event of this.guild.apply(value, ...)) this.guildEvents.push(event)` beside the messenger's,
  then `guildHud.handle(...)`; plus `recolorTags()` when a tag's guild changes.
- **Building** (inside `showWorld(sheets)`, `WorldScreen.ts:1166-...`; the social HUDs at :1615-1700):
  `new FriendHud(this.hudArt!, this.data!.texts, { session: {...closures over session...}, say: (text, color) =>
  this.hud?.messages.add(text, color), ownName, ownPlayerId, worldId, ... }, this.messenger, this.friendOptions, doc)`
  (:1634-1665); `new TradeHud(this.hudArt!, this.data!.texts, { session: {...}, ownObjectId, nameOf, say, box: (text) =>
  this.messageBox?.open(text, 'ok', () => {}), openInventory, ... }, doc)` (:1666-1695).
- **Modals** so the screen knows input is held: `WorldScreen.ts:1730-1735` (`friendHud.messageBox.modal,
  tradeHud.gold.window.modal!`, each `modal.onChange = () => this.modalChanged()`).
- **Elements**: `this.hud!.element.append(..., ...friendHud.elements, ...tradeHud.elements, ...)` (:1736-1748).
- **Menu entry**: `choosePlayerEntry` (:3199-3214), §1.5. **Start menu / hotkey**: `openWindow` (:2767-2798), §1.8.
- **Per frame**: `this.friendHud?.update()` (:2735), beside `chatWindow.setParty(this.party.size() > 0)` (:2727): the
  place for `chatWindow.setGuild(inGuild)` on change.
- **Teardown** on leaving a world: `WorldScreen.ts:3735-3755` (`friendHud.dispose(); friendHud = undefined;
  tradeHud.reset(); ...`).
- **Client-side chat commands**: `chatWindow.onClientCommand` (:1575-1597): friends intercept first
  (`friendHud.clientCommand(command)`), else `runClientHalf` (`apps/client/src/world/gmCommands.ts`), where `destroyguild`
  (TCM_CLIENT) does nothing today (gmCommands.ts:118-122).

### 2.4 Windows: frame.ts and resWindow.ts (layouts are hand-copied, not read from converted data)

- `apps/client/src/world/hud/frame.ts` `WindowFrame(title, art, layout, doc)` (:198-...): Neuz's frame (12 tiles
  `WndTile00-11.tga`, or one `texture` picture), title bar (drag), close button, Escape stack, `body` = client area (4 px in,
  22 px down). `FrameLayout` (:37-73): `width, height, mobileScale? (default 0.7), fitWhole?, texture?, closeButton?,
  caption?, tiles?, insets?, resize?`. `open('center' | {x,y})`, `close()`, `onClose`, `isOpen`, `setTitle`.
  Phone scaling in `fit()` (:457-...): `matchMedia('(max-width: 1000px) and (pointer: coarse)')` -> `transform:
  scale(mobileScale)` and attribute `data-mobile-window`; `fitWhole` scales further down to fit the layer.
- `apps/client/src/world/hud/resWindow.ts` `ResWindow(layout: ResLayout, art, doc)` (:101-...): a window from a
  **TypeScript copy** of its resdata.inc entry. `ResLayout` (:62-73) = `{ title, width, height, texture?, modal?,
  controls, frame? }`; `ResControl` (:39-60) kinds `static | text | button | edit | combo | custom | list`, each with `id`
  (its WIDC_* name) and `rect: [left, top, right, bottom]` as resdata.inc writes it. API: `control(id)`, `button(id)`,
  `input(id)`, `setText`, `setContent`, `setChoices`, `open`, `close`, `onClose`, `element` (modal backdrop or frame).
  Its frame defaults to `mobileScale: 1, fitWhole: true` (:111).
  - **No converted resdata.inc exists**: tools/convert emits no window layouts. Each window file carries its layout as a
    constant with the resdata.inc lines in a comment: `hud/trade/tradeWindows.ts:35-83` (`TRADE`, `CONFIRM_TRADE`,
    `TRADE_CONFIRM`, `TRADE_GOLD`), `hud/vendor/vendorLayouts.ts:17-...`. Titles are `Resource/resData.txt.txt`'s English
    typed in ('Trade', 'Messenger').
  - Picture buttons: `pictureButton(doc, art, 'ButtOk.tga', rect, quarter, onPress)` (`hud/button.ts`), 4 states side by
    side (`quarter` 72 for ButtOk/ButtCancel/ButtYes/ButtNo).
  - Tab strips: `hud/tiles.ts` `tabStripTiles`, `chosenTabTiles`, `TAB_TILE`, `TAB_TILE_HEIGHT` (used by
    `messengerWindow.ts:186-213`, `party/partyWindow.ts`); edit tiles `editTiles(doc, art, cols, rows, tile?)`.
  - Scroll bars: `textScrollBar(doc, art, element, rect)` (`resWindow.ts:341`).
- The guild's resdata.inc entries to copy (`C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Resource\resdata.inc`,
  ASCII): `APP_GUILD` :5243 ("WndTile07.tga" tiled, 448 x 368, the tab host), `APP_GUILD_TABINFO` :5060,
  `APP_GUILD_TABMEMBER` :5264 / `APP_GUILD_TABMEMBER_EX` :14892, `APP_GUILD_TABAPPELLATION` :5531, `APP_GUILD_TAPPOWER`
  :4463, `APP_GUILD_TABGUILDWAR` :7355, `APP_GUILD_NOTICE` :3254, `APP_GUILD_SETLOGO` :3302, `APP_GUILD_INVATE` :6944,
  `APP_GUILD_LEAVE` :6896, `APP_GUILD_DISMISS` :6065, `APP_GUILD_NICKNAME` :7550, `APP_GUILDNAME` :7502,
  `APP_GUILD_MERIT` :7133, `APP_GUILD_PAYCONFIRM` :7001, `APP_GUILD_BANK` :7058, `APP_COMPANY_INVITE` :25107 (the invite
  confirm, "WndTile08.tga" 288 x 128), `APP_COMPANY_NAME` :25155, `APP_COMPANY_DESTROY` :25911, `APP_COMPANY` :26643,
  `APP_RANK_GUILD` :10244, the war boxes :10265-10925. (Which ones V15 Neuz actually opens is the C++ research's call.)

### 2.5 Text fields (desktop and phone)

- ResWindow `edit` control -> `<input type=text autocomplete=off spellcheck=false maxLength>` with keydown/keyup
  `stopPropagation()` so the game hears no keys (`resWindow.ts:316-327`); get it with `window.input('WIDC_EDIT')`.
- Hand-built: `AddFriendWindow` (`hud/friends/friendWindows.ts:52-86`): an input in a tiled box, Enter = OK, focused on open.
- The game's key handlers skip typing targets anyway (`hud/taskBar.ts:1097` `typing(event.target)`).
- Phone keyboard: numbers `input.inputMode = 'numeric'; input.pattern = '[0-9]*'; input.enterKeyHint = 'done'`
  (`hud/trade/tradeWindows.ts:330-332`, `hud/vendor/vendorWindows.ts:397-400`); text `enterKeyHint = 'done' | 'send'`
  (`vendorWindows.ts:136, :681`). **16 px** font on a coarse pointer so the page does not zoom on focus:
  `style.css:2530` `@media (pointer: coarse) { .hud-res-edit input { font-size: 16px; } }`, :2344 (message box input),
  `.vendor-phone-head input`, `.hud-trade-gold .hud-res-edit input` (:2787).
- A one-field question: `MessageBox.prompt(text, { input: { maxLength } }, ({ value }) => ..., onCancel)`
  (`hud/messageBox.ts:118-142`), already used by the rename and friend-summon items.

### 2.6 Confirm boxes (yes/no)

- Generic: `MessageBox` (`hud/messageBox.ts`, `CWndMessageBox` 256 x 144 `WndMessagebox.tga`, modal, phone scale 1):
  `open(text, 'ok' | 'okCancel', onOk, onCancel?)`, `prompt(...)`, `isOpen`, `close()`. The screen's is `this.messageBox`
  (`WorldScreen.ts:1267`); FriendHud and PartyHud own their own `messageBox` (listed as modals).
- Neuz-layout Yes/No windows: `hud/party/partyConfirm.ts` (`CWndPartyConfirm`, 288 x 128 "WndTile08.tga", text box, Yes /
  No, centred across and 70 px from the top: the closest twin of a guild invite confirm), `hud/friends/friendWindows.ts:89-127`
  `FriendConfirm`, `hud/trade/tradeWindows.ts` `ConfirmTradeWindow` / `TradeConfirmWindow` (ResWindow-based, with
  `onOk/onCancel/onYes/onNo/onClosed`). Item confirms: `apps/client/src/world/items/confirmBoxes.ts` (`ConfirmBoxes`, `boxOf(tid)`).

### 2.7 Chat lines and system messages (with colours)

- Game lines (`g_WndMng.PutString` -> `CClientMsg`, the fading lines above the task bar): `this.hud.messages.add(text,
  argb)` (`hud/messages.ts:111-121`); features get it as `say: (text, color) => this.hud?.messages.add(text, color)`, the
  colour usually the TID's own `texts.get(tid).color`.
- Chat window lines: `chatWindow.append(channel, sender, text, recipient?, color?, style?)` (`hud/neuzChat.ts:556-565`
  desktop, `hud/chatWindow.ts:179-184` phone). `'system'` with sender '' is a game line (desktop: shown in the System
  window `CWndChatLog`; `chatRules.ts:109-111` CHATSTY.GAME), `'announcement'` is CHATSTY.SYSTEM in `0xffffff99`,
  `'guild'` is `[sender] text` in `0xffffbaff`.
- Feature helper pattern: `TradeHud.line(tid, args?, colorTid?)` (`trade/tradeHud.ts:142-151`) =
  `screen.say(formatText(text, args), texts.get(colorTid ?? tid).color)`; `box` events -> `screen.box(text)`.

### 2.8 textClient TID strings

- `this.data.texts: Texts = ReadonlyMap<string, ClientText>` (`apps/client/src/world/gameData.ts:33-38`, built :170-172 from
  `data/texts.json`, which holds **every** text of textClient.inc: `tools/convert/src/data/gameDataStage.ts:13, :483, :615`).
  `ClientText = { id, text, color (0xAARRGGBB), textId? }`.
- Lookup: `texts.get('TID_GAME_X')?.text ?? 'English fallback'`; colour `texts.get(tid)?.color`.
- printf args: `formatText(format, args)` (`hud/format.ts:10-40`: %s %d %u %x %c %f, widths, precision).
- By number (the server's DEFINEDTEXT, menu ids): `textNumbered` (`hud/messages.ts:30-38`), `formatDefinedText`; menu
  labels `menuLabel(id, texts, fallback)` = text number 7000 + MMI id (`hud/moverMenu.ts:58-61`).
- Unit tests build a small `Texts` map by hand (`apps/client/test/tradeHud.test.ts:12-23`).

---------------------------------------------------------------------------------------------------------------------

## 3. The phone

### 3.1 How phone vs desktop is decided

No flag: a media query, read when a window is built or fitted.
- **The phone rule** `(max-width: 1000px) and (pointer: coarse)`, in TS as `doc.defaultView?.matchMedia?.(...)`:
  `hud/frame.ts:458` (window scale), `hud/vendor/vendorWindows.ts:49-50` (`export const isPhone = (doc) => ...`, the
  reusable helper), `hud/buffStatus.ts:137`, `hud/dialogue/dialogWindow.ts:59`, `hud/party/partyWindow.ts:112`,
  `hud/characterWindow.ts:185`, `hud/skillWindow.ts:275`, `render/VendorSignLayer.ts:23`, `WorldScreen.ts:1211, :1555`.
  In CSS: `@media (max-width: 1000px) and (pointer: coarse) { ... }` blocks (style.css:852, 1404, 1571, ... 2714, 2743, 2870).
- Plain `(pointer: coarse)` = any touch device (16 px inputs, bigger targets): `chatWindow.ts:168`, `taskBar.ts:812, :964`,
  style.css:2344, :2530.
- The plan's rule (`docs/superpowers/plans/2026-11-03-piece7-m0-classic-dialogue.md:29`): "phone window text stays at
  least 14 px" (checked as computed `font-size`, so a 0.7-scaled window still passes with 14 px CSS text). The phone is
  played landscape (Playwright `phone` = Pixel 7 landscape); upright shows a cover.

### 3.2 Messenger on the phone (the cheapest recipe)

- Same DOM as the desktop; `WindowFrame`'s default `mobileScale 0.7` (owner 2026-11-10: "the phones' smaller size, as the
  other windows", `messengerWindow.ts:104-107`); centred above the task bar (`friendHud.ts:171`, `layoutBottomOf`).
- CSS `style.css:2714-2719`:
  - joystick/attack/jump/tools hidden while it is open:
    `.world:has(.hud-messenger:not([hidden])) :is(.hud-mobile-tools, .joystick, .hud-jump, .hud-attack) { visibility: hidden; }`;
  - every text, its inputs/textarea and the tab titles `font-size: 14px` (desktop 12 px Verdana, :2685).
- Tabs: `button.hud-messenger-tab` (`aria-pressed`, `data-tab`) over the tab-strip tiles; the list `.hud-messenger-list`
  scrolls natively (`overflow: hidden auto`, scrollbar hidden, a drawn `textScrollBar` beside), rows snapped to 20 px
  (`messengerWindow.ts:157-162`).
- Right click = the browser's `contextmenu` event (`messengerWindow.ts:168`), which a long press fires on a phone; the
  menu is a `MoverMenu` with its own class `hud-friend-menu` (`friendHud.ts:108-119`; CSS `style.css:659-675`).
  Playwright drives it with `click({ button: 'right' })` in both projects (`e2e/friends.spec.ts:84`).

### 3.3 Trade on the phone (a panel beside the bag)

- `style.css:2741-2788`: `.hud-trade` becomes a panel at the left (`left: 8px; top: 8px; transform: none; width:
  calc(100% - var(--bag-window-width, 60%) - 28px); height: calc(100% - var(--hud-taskbar-height, 48px) - 16px)`), its
  frame picture hidden, a CSS title bar, the body a CSS grid (`grid-template-columns: repeat(6, 1fr)`), the parts placed
  by `[data-control=...]` / `[data-trade=...]` attributes the TS sets (`tradeWindows.ts:118-122`).
- Picture buttons become word buttons: `.hud-picture-button::after { content: attr(aria-label); }`, 34 px tall, 14 px text.
- The request and final boxes `z-index: 70` over the bag (60). The number field 16 px with the numeric keyboard.
- Taps replace drags: `inventoryWindow.trade = { active, tapItem, tapPenya }` (`WorldScreen.ts:1697-1699`,
  `hud/inventoryWindow.ts:58, :199`). `--bag-window-width` is set by the bag (`inventoryWindow.ts:105-108`),
  `--hud-taskbar-height` by the task bar (`taskBar.ts:840`).

### 3.4 Personal shop on the phone (a separate DOM)

- `hud/vendor/vendorWindows.ts:88-140`: `this.phone = isPhone(doc)`; the desktop builds the `ResWindow`; the phone a plain
  `WindowFrame` whose body gets class `vendor-phone` and flex children (`vendor-phone-head` with labelled inputs,
  `vendor-phone-buttons` of `textButton(...)` word buttons, `vendor-phone-slots` a scrolling column of 40 px
  `vendor-phone-row`s with an `is-chosen` state); the keypads become `vendor-sheet`s of number inputs with Min/Max.
- CSS `style.css:2828-2878`: rows, inputs and buttons (min-height 36-40 px, inputs 16 px), and in the phone block the panel
  placement `.hud-vendor[data-mobile-window] { left: 12px; top: 8px; transform: none; height: calc(100% - taskbar - 16px);
  width: calc(100% - var(--bag-window-width) - 36px) }`, the chat room a panel at the right over the bag (z 61).

### 3.5 Party window on the phone (closest in kind to the guild window)

`hud/party/partyWindow.ts:111-115`: on a phone `{ mobileScale: 1, fitWhole: true }` (the whole window fitted to the screen,
as the Character window), same DOM; CSS `style.css:2083-2086` hides the joystick and sets 12 px (an older window, before
the 14 px rule was enforced: do not copy that size).

### 3.6 Recipe for the guild windows

1. Build the desktop window from its resdata.inc copy (ResWindow, or WindowFrame + hand-placed parts like the Messenger).
   Give the frame a class (`hud-guild`, `hud-guild-invite` ...) and the parts `data-control` / `data-*` names (CSS and
   e2e hooks).
2. Phone choice:
   - a **list-and-tabs window** (the Guild window, its member list): same DOM, either `mobileScale 0.7` + a 14 px font
     override (Messenger) or `{ mobileScale: 1, fitWhole: true }` (Party). Member list = native scroll
     (`overflow-y: auto`), rows >= 20 px, text >= 14 px; tabs as `<button aria-pressed>`.
   - a **form-like window** with several inputs: a separate phone DOM as `vendorWindows.ts` (`isPhone(doc)`), a flex
     column, word buttons >= 34 px tall.
3. CSS in `style.css` (append after the personal shop's block, ~:2879):
   - desktop: `font: 12px/16px Verdana, Arial, sans-serif`, absolute parts;
   - phone: `@media (max-width: 1000px) and (pointer: coarse) { .world:has(.hud-guild:not([hidden])) :is(.hud-mobile-tools,
     .joystick, .hud-jump, .hud-attack) { visibility: hidden; } .hud-guild, .hud-guild :is(button, textarea) { font-size:
     14px; } .hud-guild input { font-size: 16px; } }`;
   - small picture buttons as words: `.hud-guild .hud-picture-button::after { content: attr(aria-label); }`.
4. Member right-click menus: a `contextmenu` listener (= long press on a phone) and a `MoverMenu` with its own class
   (copy `friendHud.ts:108-119, :212-230`).
5. Text entry (guild name, notice, nickname): ResWindow `edit` or `MessageBox.prompt`; on a phone 16 px, `enterKeyHint`,
   Enter and OK both submit.
6. e2e per phone run: inside the viewport, every text `getComputedStyle(el).fontSize >= 14` (`e2e/friends.spec.ts:111-114`,
   `e2e/trade.spec.ts:214-229`), joystick hidden.

---------------------------------------------------------------------------------------------------------------------

## 4. Tests

### 4.1 Unit tests (vitest)

- Root `vitest.config.ts`: `include: ['**/*.test.ts']`, excluding `*.corpus.test.ts`, `*.live.test.ts`, `e2e/`,
  `node_modules`, `dist`; `environment: 'node'`. DOM tests start with `// @vitest-environment jsdom`
  (`apps/client/test/tradeHud.test.ts:1`).
- Places: `packages/protocol/test/<feature>.test.ts` (`trade.test.ts`, `friends.test.ts`, `vendor.test.ts`, `addObj.test.ts`,
  `worldChat.test.ts`), `packages/testkit/test/*.test.ts`, `apps/client/test/<feature>.test.ts` (flat, 152 files:
  `trade.test.ts` rules, `tradeHud.test.ts` windows wired, `friends.test.ts`, `friendHud.test.ts`, `personalShop.test.ts`,
  `playerMenu.test.ts`, `hud.test.ts` task bar/Start menu, `chat*.test.ts`, `neuzChat.test.ts`).
- Protocol tests import the source and the testkit writers and go through the real bundle reader
  (`packages/protocol/test/trade.test.ts:3-16`):
  ```ts
  import { WORLD_READERS, readBundle, decodeWorldPacket, encodeX } from '../src/index';
  import { encodeBundle, writeX } from '@flyffweb/testkit';
  const result = readBundle(encodeBundle(0xffffff00, SELF, [writeX(OTHER, ...)]), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  ```
  The browser's packets: `decodeWorldPacket(encodeX(...))` gives the `XRequestPacket` value; direct packets:
  `decodeWorldPacket(directX(...))`.
- Client HUD tests fake the session and the screen with recorder closures and a small `Texts` map, then drive
  `hud.handle(...)` and click elements (`tradeHud.test.ts:26-60`).
- Quick runs: `npx vitest run packages/protocol/test/guild.test.ts apps/client/test/guild*.test.ts`; full `npx vitest run`
  (known failures on main: 5, `looks.test.ts` x3 heldModels and `inventoryWindow.test.ts` x2); `npm run typecheck`.

### 4.2 Testkit (pretend servers and writers)

- `packages/testkit/src/index.ts` re-exports all; one file per feature (`trade.ts`, `friends.ts`, `vendor.ts`) plus
  `world.ts` (ADD_OBJ writers `writeAddSelf / writeAddPlayer / writeAddNpc / writeAddMonster`, `encodeBundle`,
  `writeItemContainer`, the party writers, `directBlock` :979 ...), `newVagrant.ts` (`newVagrantOwn()`), `worldScript.ts`,
  `fakeFlyffServer.ts`.
- Snapshot writer shape (`trade.ts:9-10`): `({ objectId, type, fields: w.toBytes() })` as a `ScriptMessage` (the field
  order = the server's `CUser::AddX` = the reader's).
- Direct packet writer shape (`friends.ts:35-67`): `new ArWriter().u32(FriendPacket.X).u32(...).toBytes()`, a whole packet
  for `gateway.pushCache(...)`.
- `createWorldScript({ playerObjectId, worldId, pos, self: writeAddSelf(...), others: [writeAddPlayer(...)] })`
  (`worldScript.ts:10-112`) answers PRE_JOIN and JOIN; `script.later([...messages])` = a SNAPSHOT bundle to push;
  `script.on('<WorldPacket type>', (p) => [replies], { until? })` = auto-replies to the browser's packets (needs the
  request decoder of §2.1.3). Its JOIN bundle leaves out CUser::Open's guild messages (:70).
- When `AddedPlayer` gets guild fields, update `playerStart` (`world.ts:640-656`) to write them.

### 4.3 End-to-end (Playwright, Chromium only)

- `apps/client/playwright.config.ts`: dev server `npm run dev:client -- --port ${E2E_CLIENT_PORT ?? 5174} --strictPort`
  with `VITE_GATEWAY_URL: 'ws://127.0.0.1:9'`, `GATEWAY_PROXY: ''`; projects `chromium` (Desktop Chrome) and `phone`
  (Pixel 7 landscape, touch), both `grepInvert` `@picture|@soak|@prod|@perf`; `workers: 4`, timeout 30 s (feature specs
  `test.setTimeout(120_000)`). The dev server serves the worktree's `dist/assets`.
- The pretend gateway lives in the page: `playGateway(page, script)` (`e2e/worldHarness.ts:206-256`) routes the WebSocket
  (`page.routeWebSocket(/\/connect\//, ...)`) and plays certifier, login and cache from the script; it returns
  `Gateway { sent, pushCache(bytes), closeCache, closeLogin }`.
- Helpers (`e2e/worldHarness.ts`): `enterFlaris(page)` (log in, channel, Enter Webby, `window.__client.ready()`), `SELF_ID`
  9000, `SELF_PLAYER`, `self`, `BASE`, `MADRIGAL`, `SQUARE`, `MI_MALE`, `groundAt`, `sentOf(gateway, type)` (the cache
  packets of a type; body = DPID_UNKNOWN + type + fields), `targetsOf`, `tapMover(page, id)`, `tapWorld`,
  `recordHudTexts(page)` + `hudTexts(page)` (every game line and caption added), `logOut`. Webby is player 500.
  `window.__client` (`src/testHooks.ts`): `movers()`, `own()`, `screenOf(id)`, `tags()` (name tag texts: the hook for a
  guild line), `ready()`.
- Example `apps/client/e2e/trade.spec.ts`: `scriptOf()` (:34-45, the own bag via `newVagrantOwn()`, Lead as
  `writeAddPlayer(LEAD_ID, lead)`), `isPhone = () => test.info().project.use.hasTouch === true` (:47),
  `openLeadMenu(page, gateway)` (:58-69: phone tap, wait for SETTARGET, tap again; desktop right click at `screenOf`),
  the entry `.hud-mover-menu [data-menu-entry="2"]`, server messages `gateway.pushCache(script.later([writeTrade(...)]))`,
  direct ones `gateway.pushCache(directBlock(3, 'Lead'))` (:240), sent bytes `sentOf(gateway, TradePacket.CONFIRMTRADE)`
  (:96-97), the phone layout checks (:209-229). Also `friends.spec.ts` (Start -> Messenger with
  `getByRole('button', { name: 'Start', exact: true })` and `getByRole('menuitem', { name: 'Messenger', exact: true })`,
  :35-39) and `personalShop.spec.ts`.
- Own e2e port for this worktree: **already in place**:
  `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\guild\.superpowers\playwright.guild.config.ts` (imports `./port`,
  then re-exports the client config with `testDir: ../apps/client/e2e`) and `.superpowers/port.ts`
  (`process.env.E2E_CLIENT_PORT = '5183'`). `.superpowers/` is in `.gitignore`. Ports in use elsewhere: owner 5174,
  friends 5178, gm 5179, trade 5180, shop 5181, topright 5182.
  Run: `npx playwright test -c .superpowers/playwright.guild.config.ts guild.spec.ts --project chromium --project phone`.
  (Memory rules: builders run only quick tests, the full suites go to the owner with commands and pass criteria; never
  `git worktree remove --force` on a worktree holding junctions.)

---------------------------------------------------------------------------------------------------------------------

## 5. The converter's UI stage: adding a picture

- `tools/convert/src/ui/uiStage.ts`. Everything in `Client/Icon`, `Client/Item`, `Client/Char` (dds/tga/bmp) is converted
  without listing; **Theme pictures must be listed** in `THEME_FILES` (:71-245). Add a commented group at its end (after
  the personal shop's, :236-244), e.g.
  ```ts
  // 2026-11-xx, the guild (docs/superpowers/specs/...): APP_GUILD's member tab heads (resdata.inc:5264-...) ...
  'ButtGuildMemberTabAlias.bmp', 'ButtGuildMemberTabChar.bmp', 'ButtGuildMemberTabJob.bmp',
  'ButtGuildMemberTabLevel.bmp', 'ButtGuildMemberTabMLevel.bmp', 'ButtSetlogo.BMP', 'ButtGuildWar.BMP',
  ```
  Guild-ish files in `Client/Theme/Default`: ButtChatGuild.BMP (already listed), ButtCloak.BMP, ButtGuildDuel.bmp,
  ButtGuildMemberTab{Alias,Char,Job,Level,MLevel}.bmp, ButtGuildWar.BMP, ButtGuildhouse{authority,cargo,locker,teleport,
  tex}.bmp, ButtSetlogo.BMP, GuildHouseMain.tga, TexGuildCombatBest.bmp, TexGuildCombatWinner.bmp, WndGuildBank.tga,
  WndGuildCombatCape.tga, texDialogBoxGuild.bmp/.inc. Icons (automatic): Icon_Company.DDS, Icon_GuildTitle.dds,
  Icon_Troupe.dds (APP_GUILD's applet icon, already in `ui/icon_troupe.png`). The frame tiles WndTile00-11.tga for the
  "WndTile07/08.tga" windows, ButtOk/Cancel/Yes/No, WndEditTile*, WndTabTile* are converted already.
- Colour key: magenta 0xffff00ff for every theme/icon picture (`applyColorKey`, :263-...).
- Output key: `ui/<webName(stem)>.png` (`tools/convert/src/output/keys.ts:20` `iconKeyOf`; `webName` lowercases and maps
  `[^a-z0-9._-]` to '-', `packages/formats/src/web/webName.ts:6-8`), hashed on disk (`dist/assets/ui/wndtrade.0ec3c61a09.png`)
  and listed in `dist/assets/index.json` (`{"version":1,"files":{"ui/wndtrade.png":"ui/wndtrade.0ec3c61a09.png", ...}}`).
- Command for this worktree. The default `--client` is `<worktree>/../Client` (`tools/convert/src/cli.ts:92`), which does
  not exist under FlyffWeb-worktrees, so name it (as the personal shop did, `FlyffWeb-worktrees/personal-shop-convert.log`):
  ```
  npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" --out "C:/Users/silec/Desktop/FlyFF/Bakbak/FlyffWeb-worktrees/guild/dist/assets" --only "ButtGuild*,ButtSetlogo*"
  ```
  `--only` = comma-separated globs on the picture's file name (`ui` = the whole stage, `data` = the catalogs; it leaves
  `itemProps.json` alone unless `data` matches). The owner's main folder later needs the same `--only` list (put it in the
  checkpoint, as every feature did).
- Client side: `themeUrl(art, 'ButtGuildWar.BMP')` -> CSS `url("<hashed url>")` (`apps/client/src/world/hud/art.ts:23-30`;
  `themeKey(file)` = `ui/<webName(file without extension)>.png`; `art.url(key)` is the asset store's, '' when missing).
  An `<img>` takes `art.url(themeKey(name))`; the name tag layer takes `services.store.url(key)` (`WorldScreen.ts:1030`).
- **JPEG gap (the guild logos):** the 27 `Client/Icon/Icon_CloakSLogo01..27.jpg` (what Neuz draws left of the guild name
  and in the guild and ranking windows: `Source/_Interface/WndWorld.cpp:3669-3677`, loaded with colour key
  `D3DCOLOR_XRGB(0,0,0)`, so black is transparent) are **not converted**: `uiStage.ts:48` `JPEG = /\.jpe?g$/i` and
  :458-466 only warn "JPEG icons not converted (no decoder reads JPEG ...)"; `decodeImage` (`@flyffweb/formats`) reads
  dds/tga/bmp, and the converter's only image dependency is `pngjs` (`tools/convert/package.json:6-10`). Options: a pure-JS
  decoder (e.g. `jpeg-js`: a new dependency, the owner's call) then `applyColorKey(image, 0xff000000)` and `encodePng`; or
  write the `.jpg` bytes unchanged under their own key and key out black in the browser (a canvas). Either way the name tag
  needs the logo left of the guild line (§1.4).

---------------------------------------------------------------------------------------------------------------------

## 6. A build order for the guild (suggested)

1. Protocol `packages/protocol/src/world/guild.ts`: the guild snapshots (readers + `GUILD_READERS`), the core's direct
   packets (`readGuildPacket` + `guildPacketTypeOf`), the encoders and `readGuildRequestPacket`; wire into `readers.ts`,
   `types.ts` (WorldMessage), `messages/world.ts` (direct `default:`, client `default:`, both unions), `index.ts`. Keep
   `guildId / warId / guildCloak` in `AddedPlayer` (addObj.ts:109-113) and the item's `m_idGuild` if the tooltip needs it.
2. Testkit `packages/testkit/src/guild.ts` (+ index) and `playerStart` writing the guild fields; protocol test.
3. Client model `apps/client/src/world/guild/guildBook.ts` (the screen's, like `Messenger`) + rules; HUD
   `apps/client/src/world/guild/guildHud.ts` (a `GuildHudScreen` interface like `TradeHudScreen`); windows in
   `apps/client/src/world/hud/guild/`.
4. WorldScreen: state field, `apply` routing, construction in `showWorld`, modals, elements, `openWindow('guild')`,
   `choosePlayerEntry` MMI 7, `setGuild` on change, `recolorTags()`, teardown. WorldSession: `case` list for the direct
   types + `sendGuild`.
5. Task bar: `APP_GUILD` in `WINDOWS` and `MENU` (G hotkey follows); player menu MMI 7 entry; Messenger Guild tab rows;
   name tag guild line (+ logo once converted); phone chat's Guild view `/g ` prefix and `setGuild`.
6. CSS desktop + phone; THEME_FILES + convert; unit tests; `e2e/guild.spec.ts` on port 5183.

# Farm bot, auto pots, auto skill: research (2026-11-15)

Branch `farm-bot-plan`, off FlyffWeb main 1ca4341. Plan only, nothing built.

**This is a custom feature.** The project normally copies V15 exactly. Stock V15 has no farm bot, no auto potion, no
auto buff, no "target the nearest monster" and no macro. The owner chose to add them. Everything below that says
"custom" is new; everything that says "V15" already exists in Neuz and is reused.

Paths: `Source\` = the outer repo's V15 source (`Blouflash VS22 V15\Source`), `W\` = `apps/client/src/world/` in
FlyffWeb.

## 1. What stock V15 has (reused, not custom)

### Auto attack (V15)
- Click a selected monster again (option AutoAttack), double-click, or Ctrl+click: Neuz re-issues the melee/range
  attack every frame until the target dies or stops being attackable (`Source\_Interface\WndWorld.cpp:6898-6915,
  7255-7266, 8521-8533`). Wands never turn on auto attack.
- A monster clicked while attacking is queued as the next target; on the kill Neuz focuses it but turns auto attack
  **off** (`WndWorld.cpp:6395-6425`).
- FlyffWeb copy: `W\combat\attackLoop.ts` (`AttackLoop`, built in `W\WorldScreen.ts:1619-1634`).
  - Start: `onMoverPressed(id, now, double)` (408) or `attackButton()` (507); bow/wand hold: `attackButtonDown/Up`
    (517/529).
  - Each rules step: `step()` (677) → `useFocusObj` (946) → `cmdSetMeleeAttack` (971) → PLAYERSETDESTOBJ.
  - Stops: `stop('move'|'ground'|'died'|'target')` (583), `escape()` (558), `onRemoved` (639), `onMoverDeath` (657).
  - After our kill `loseTarget(true)` (866) moves focus to `focus.next` and sets auto off. **A bot must re-engage
    after every kill.**
  - Helpers: `attackAble()` (132), `autoAttack` (339), `canAttackFocus` (384), `walkTo(id)` (606), `followTo(id)` (618).

### Targeting (V15)
- **No select-nearest in V15.** Tab on the ground only cycles enemy-guild players in the guild-war map (20 m, max 5)
  (`WndWorld.cpp:7664-7691`; `World3D.cpp:597-603, 806-829`). Tab in flight cycles flying monsters in a 15° cone
  (`WndWorldControlPlayer.cpp:774-793`).
- FlyffWeb: Tab on the ground does nothing (`W\WorldScreen.ts:3535`); flight Tab is `nextFlyTarget`
  (`attackLoop.ts:744-763`), a good template for a "nearest attackable" search.
- Movers: `WorldState.movers` / `self()` (`W\WorldState.ts:415-430`). `Mover` has `kind`, `name`, `level`, `hp`,
  `maxHp`, `added.npc.activeAttack` (aggressive), `dest?.targetId`, `act.hitId`, `radius` (76-145). Monster catalog:
  `data.movers.get(added.index)` → level, rank, belligerence, killable, expValue
  (`packages/formats/src/web/gameData.ts:10-48`).
- No exported distance helper (`inRangeObj` is private, `attackLoop.ts:158`).
- "Someone else is fighting this monster" is not tracked (`m_idAttacker` is dropped, `WorldState.ts:689, 1593`). It can
  be inferred from `mover.dest.targetId`, `act.hitId` and the `hit`/`swing` combat events (196-235).

### Action Slot (V15)
- 5 skills (`MAX_SLOT_QUEUE 5`, `Source\_Common\ProjectCmn.h:907`), fired by the **C** key on key-up
  (`WndWorld.cpp:7718-7735`) or the bar icon. Combo order rules in `CheckAddSkill` (`WndTaskBar.cpp:1665-1783`);
  skills with a cooldown are refused in the slot (1818-1827).
- **The server runs the chain.** The client uploads the queue (PACKETTYPE_SKILLTASKBAR) and sends the first skill as
  USESKILL `SUT_QUEUESTART`; the server sends each next skill after the previous one ends
  (`Source\_Interface\UserTaskBar.cpp:198-237`), charging action points 6/8/11/30 for slots 2-5. Magic: the whole
  cast time ×0.7 is paid once at the start (`MoverSkill.cpp:149, 240-254`).
- Action points: cap 100; +1 on the 2nd melee hit, +2 every 3 s (`MoverActEvent.cpp:1665`, `Mover.cpp:3417-3453`).
- Ends: SNAPSHOTTYPE_ENDSKILLQUEUE (not enough AP, empty slot, past slot 5) or CLEAR_USESKILL.
- FlyffWeb copy: `W\skills\skillUse.ts` `useActionSlot()` (241), `useSlot(skillIndex)` (236); states `pending`
  (2 s timeout), `reserved`, `commanding`, `execute` 0/1/2 (88-211). Results: `WorldState.onUseSkill` (391),
  CLEAR_USESKILL (356).
- **Skill cooldowns are not tracked in FlyffWeb** (left to the server, `skillUse.ts:528`). The data is there:
  `skill.levels[lv-1].cooldown`, `reqMp`, `reqFp`, `castingTime` (`gameData.ts:404, 436`).

### Task bar slots and item cooldowns (V15)
- F1-F9, 9 slots × 8 pages (`ProjectCmn.h:906-912`). FlyffWeb: `W\hud\taskBar.ts` `useItemSlot` (1514-1534) →
  `WorldScreen.useShortcut` (5186-5196) → `itemUse.use(id)`. Phone quick slots: bar 8 slots 0-6 (254-256).
- Cooldown groups (`Source\_Common\CooltimeMgr.cpp:19-43`): 1 food (IK2_FOOD), 2 pills (IK3_PILL), 3 IK2_SKILL. Only
  when `dwSkillReady > 0` (propItem column 77).
- **Potions, MP refreshers and FP drinks have no cooldown** (the IK2_POTION line is commented out). Food 1500-2500 ms,
  lollipop 2500 ms, pills 10000 ms.
- Heal cap: when the stat is already at or above the item's `dwAbilityMin` (column 31), the item heals only 30% and the
  server says TID_GAME_LIMITHP/MP/FP (`MoverSkill.cpp:3087-3122`).
- FlyffWeb: `cooldownGroup` (`W\items\premiumItems.ts:118-161`), `ItemUse.cooldownLeft/cooldownDone`
  (`W\items\itemUse.ts:204-214`), refusal TID_GAME_ATTENTIONCOOLTIME (`premiumItems.ts:185`), timer starts on
  UPDATE_ITEM param 8 (`WorldScreen.ts:1196-1198`).

### Pick-up pets (V15)
- IK3_PET pets loot on the server (`Source\_AIInterface\AIPet.cpp`): every 16 ticks, items within 15 m, owner within
  32 m and not flying, normal ownership rules, stop when the bag is full (`MoverActEvent.cpp:2241-2251`). Small V15 bug:
  it picks the last item found, not the nearest (AIPet.cpp:144).
- System pets (IK3_EGG) do not loot. FlyffWeb only sends DOUSEITEM for the pet; looting is all server-side.

### Drops and pickup (V15)
- Drops belong to the killer and their party for **7 s**, then anyone (`MoverActEvent.cpp:2193-2238`). Giants
  (RANK_SUPER) and some event bosses drop unowned items. Quest drops are locked to one player (`m_idHolder`). Ground
  items vanish after 3 minutes (`Item.cpp:553-554`).
- No pickup packet: the client sends PLAYERSETDESTOBJ to the item; the server picks it up on arrival. Not while flying.
  Bag full: TID_GAME_LACKSPACE (626) via DEFINEDTEXT; success TID_GAME_REAPITEM (628).
- FlyffWeb: `ItemActions.pick(id, now)` / `pickNearby(now)` (5 m, 6 s each) (`W\items\itemActions.ts:35-61`).
- The client is never told a drop's owner: FlyffWeb's `GroundItem` has no owner field (only `CAIEgg::m_idOwner` for
  pets, `W\WorldState.ts:136`). A bot can only guess "mine" from where and when the item appeared.

## 2. What is custom (new)
- Choosing the next monster by itself (nearest in a radius), and re-engaging after every kill.
- Walking to its own drops after a kill (V15 players click each drop; only pets loot by themselves).
- Using potions/food by HP/MP/FP thresholds.
- Firing the Action Slot or skills by itself, and recasting buffs.
- A window to set it up, an on-screen "running" badge, stop rules, a battery-saver screen, Wake Lock.

## 3. How the server sees it
- **The server cannot tell a bot from a player.** The bot sends the same packets a player sends by hand: SETTARGET,
  PLAYERSETDESTOBJ, MELEE_ATTACK, USESKILL, DOUSEITEM. The packet rate is the same as clicking quickly.
- V15 has no bot, macro, AFK or packet-rate check. GameGuard is compiled out (`NO_GAMEGUARD`). The cache server's
  60 s KEEP_ALIVE is answered by FlyffWeb already (it would drop a frozen tab).
- **Rules in the client are not enforcement.** FlyffWeb is public JavaScript (the webflyff repo is public); a player
  can already script it in the browser console, and could remove any "not here" rule. A built-in bot mostly levels
  the field for honest players. Real enforcement (who may bot, where) would need a server change.
- Server load: a bot is one more player attacking at normal speed. The real cost is more players online for longer,
  so more monsters killed and more drops (economy), not CPU.

### Server holes found on the way (not part of this feature)
These exist today for anyone with a modified client. Listed for the server-holes work, not fixed here:
- PACKETTYPE_SEND_TO_SERVER_AP (0x0f33) lets the client set its own action points to any value
  (`Source\WORLDSERVER\DPSrvr.cpp:10773-10786`).
- MELEE_ATTACK: the server uses the client's hit flags when `LOWORD(nParam3)` is nonzero
  (`Source\_AIInterface\ActionMoverMsg.cpp:689-697`); no range check for player melee.
- PLAYERSETDESTOBJ `fRange` is never clamped (`Obj.cpp:794-817`), so pickup from far away is possible.
- No speed-hack check: PLAYERMOVED only rejects jumps over 1000 units (`DPSrvr.cpp:11474-11479`).
- MP refreshers and FP drinks have no server cooldown (by V15 data; potions are V15-uncapped on purpose).

## 4. Zones
- Region flags (`Resource\define.h:136-159`): RA_SAFETY 0x10, RA_FIGHT 0x40, RA_TOWN 0x400, RA_PK 0x1000,
  RA_DANGER 0x4000, RA_PENALTY_PK 0x400000. The server combines the .rgn rectangles you stand in
  (`Mover.cpp:2678-2711`). **Region flags are never sent to the client**; only `/ctd` duel zones arrive at run time
  (SNAPSHOTTYPE_ADDREGION).
- FlyffWeb has **no town/safe/PvP zone API**; its region data keeps only the inn attribute
  (`packages/formats/src/world/regions.ts:20`). Town detection would need the converter to keep the region flags.
- World IDs (`Resource\defineWorld.h`): guild siege 202, Arena 208, Quiz 211, 1:1 guild war 241-244, instance
  dungeons 121-125, secret rooms 151-167; instance list in `Resource\PartyDungeon.lua`. FlyffWeb: `isArena`
  (`W\combat\arena.ts:25`), duel `inFightRegion` (`W\duel\duelBook.ts:103`); `WorldScreen.worldId` is private.
- Towns, the siege map, the Arena and the Quiz map have no monsters to farm, and the bot never attacks players. So a
  world-ID block list covers the abuse cases without converting region flags.

## 5. Stop signals available in FlyffWeb
- No event bus. Hubs: `WorldScreen.apply` (every message, 1059-1361) and `play(changes)` (combat and own events every
  step, 3089).
- Death: OwnEvent `died` / `revived` (`W\OwnState.ts:787-795`).
- World change: session `transition`/`entered` (`W\WorldSession.ts:54-58`, `WorldScreen.ts:957-989`); same-world
  teleport is REPLACE (1301). Disconnect: `drop`/`end` (5543, 5570).
- A player hits us: SNAPSHOTTYPE_DAMAGE / `hit` event with `victimId === self` and a player attacker. Duel start:
  DUELSTART.
- GM talk: whisper `{sender, fromId}` (1213-1263), gmChat (1206), serverText (1278), definedText (1296); a visible
  player's GM level is `m_dwAuthorization` in the spawn data (`W\authorization.ts:14`). PACKETTYPE_SAY has no GM flag,
  so a GM whisper from out of sight cannot be told from a player's: the bot stops on **any** whisper.
- Bag full: only TID_GAME_LACKSPACE text; bag has 42 positions (`W\trade\itemContainer.ts:16`), `containerIsFull`
  (56); no free-slot helper.
- Own HP/MP/FP: `OwnState.hp/mp/fp` (194-196), `maxHp()/maxMp()/maxFp()` (596-606). Buffs: `self().buffs.list/has`
  (`W\buffs.ts:49, 76`).

## 6. Browsers: what AFK can mean
- **Desktop.** The game rules run from a worker clock (`W\simulation.worker.ts`, `W\simulationClock.ts`), so they
  keep stepping in a background tab; only drawing stops (`WorldScreen.ts:2721`). Chrome slows main-page timers in
  hidden tabs, but the worker's pulses still arrive. On `visibilitychange`/blur FlyffWeb clears the walk and keys
  (`stopOwnMover`, 5149-5154, 5307-5316); auto attack survives. The browser can still freeze or discard a tab
  (memory saver, sleep). So a desktop bot works in a background tab, but not when the PC sleeps.
- **iPhone (Safari).** Switching apps or locking the screen suspends the page within seconds. The WebSocket then
  misses pings; the gateway closes it after about 60 s (`apps/gateway/src/config.ts:38`) and the character logs out.
  **There is no way around this in a web page.** Phone farming works only with the game in front and the screen on.
- **Wake Lock** (`navigator.wakeLock.request('screen')`): iOS Safari 16.4+, Chrome, Edge. It keeps the screen on while
  the page is visible and is released when the page hides, so it must be re-requested on `visibilitychange`. On iOS
  home-screen web apps it only works from iOS 18.4. FlyffWeb has no Wake Lock code today.
- Battery: FlyffWeb draws WebGL at 60 fps. A phone left farming for an hour gets hot and drains. A dark battery-saver
  screen that stops drawing while the rules keep running saves most of it.
- **Server-side farming** (the character keeps farming after the page closes) would need the World server to keep a
  logged-out character alive with its own AI. V15 logs the character out when the socket closes. Large C++ work;
  not recommended for now.

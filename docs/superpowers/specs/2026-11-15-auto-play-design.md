# Auto Play (farm bot, auto pots, auto skill): design (2026-11-15)

Research: `docs/superpowers/2026-11-15-farm-bot-research.md`. Branch `farm-bot-plan`, off FlyffWeb main 1ca4341.
Paths: `W\` = `apps/client/src/world/`.

**This is a custom feature, chosen by the owner.** Stock V15 has no farm bot, no auto potion, no auto buff and no
"target the nearest monster". The feature is built on top of the V15 parts FlyffWeb already copies (auto attack,
Action Slot, task bar items, item cooldowns, pickup), so it sends only the packets a player sends by hand.

## 1. Why

Players, most of all on iPhone in landscape, want to level and farm without clicking every monster and every
potion. The owner wants one built-in "Auto Play" with three parts:
- **Farm bot**: finds monsters near where it was started, kills them, picks up its drops.
- **Auto pots**: uses HP/MP/FP items when a gauge falls below a set level.
- **Auto skill**: fires the V15 Action Slot and a few cooldown skills, and keeps self-buffs up.

## 2. Owner decisions (2026-11-15)

| Question | Answer |
|---|---|
| AFK (nobody watching)? | **Allowed.** Desktop keeps farming in a background tab; phone needs the game open and the screen on (Wake Lock + battery-saver screen). |
| Who can use it? | **Everyone, free.** No item, no server change. |
| Where? | **Open fields only.** Blocked in the Arena, guild siege map, 1:1 guild war, Quiz, instance dungeons and secret rooms, and during a duel. |
| Loot? | **Yes, its own drops** (its own or its party's); pick-up pets still work; stops looting when the bag is full. |
| Attack skills? | **Action Slot + ready skills**: the V15 Action Slot, plus up to 4 cooldown skills from a short list when ready. |
| Buffs? | **Yes, a buff list**: up to 8 self-buff skills or buff items, recast when missing or under 10 s, between fights only. |
| Auto pots without the bot? | **Yes, but not in PvP**: off in the Arena, siege map, 1:1 guild war and duels. |
| Window and start/stop? | **Start menu + AUTO button**: one "Auto Play" window with 3 tabs (Farm, Potions, Skills) as a 19th Start menu line (phone menu 10+9), and an AUTO button on screen. |

## 3. Goals, non-goals, anti-goals

**Goals**
- A player sets it up once per character and starts it with one tap.
- It runs for hours on desktop (also in a background tab) and on a phone with the game open.
- It stops safely, and says why, on anything a person should look at.
- Auto pots also help players who fight by hand, outside PvP.

**Non-goals (version 1)**
- Farming with the phone locked or the page closed (needs a server-side bot, section 5).
- Pathfinding. FlyffWeb walks in straight lines; the bot gives up on targets it cannot reach.
- Flying farming, giants and bosses, party-leader "follow me" modes, auto revive, auto selling, auto repair.
- A level range filter or a monster name list (possible later).
- Real enforcement of who or where (needs a server change, section 6.13).

**Anti-goals (a failure even if it works)**
- Attacking a player, or anything a player could not do by hand.
- Packets faster than V15 manual play, or packets V15 never sends.
- Taking another player's monster (kill stealing) or another player's drops.
- Running in PvP worlds or during a duel.
- Silent stops: the player must always see why it stopped.
- A frozen or broken game when it is off: with Auto Play off, nothing changes for players.

## 4. Constraints (from the research)
- The server cannot tell bot packets from a player's. Client rules are honesty rules, not enforcement: FlyffWeb is
  public code.
- V15 potions, MP refreshers and FP drinks have no cooldown; food 1.5-2.5 s, pills 10 s. Above an item's
  `dwAbilityMin` the server heals only 30%. So the bot paces potions itself.
- After every kill V15 (and FlyffWeb) turns auto attack off and focuses the queued target, so the bot re-engages
  each time.
- No pathfinding; no zone flags on the client (only world IDs, the Arena and duel helpers); no skill cooldown
  tracking on the client; no event bus.
- iPhone suspends the page when hidden or locked; the gateway drops the socket after about 60 s.
- Desktop rules keep stepping in a hidden tab (worker clock); `visibilitychange` clears walks and keys.

## 5. Approaches

| | Approach | Trade-offs | Verdict |
|---|---|---|---|
| A | **A client-side Auto Play controller** in FlyffWeb, stepping with the game rules and calling the existing attack loop, skill use, item use and pickup | Reuses the V15 paths, so packets are the same as a player's; works on desktop and phone; no server change. Stops when the page stops (iPhone locked). | **Picked** |
| B | A server-side bot: the World server keeps the character fighting with its own AI | The only way to farm with the phone locked or the page closed. Large C++ and database work; V15 logs the character out when the socket closes; harder to stop safely; more server CPU. | Rejected for now |
| C | An outside tool (browser extension or user script) | No phone support, no in-game window, nothing the owner controls. | Rejected |

Skills: the owner picked "Action Slot + ready skills" over "Action Slot only" (misses cooldown skills, which V15 keeps
out of the Action Slot) and "a new list only" (more setup, ignores the V15 combo rules).

## 6. Design

### 6.1 Parts

New folder `W\autoplay\`. Pure rules (no DOM, unit-tested) and one controller.

| File | What it does |
|---|---|
| `settings.ts` | The settings type, defaults, load/save per character (`flyffweb.autoPlay.<playerId>` in localStorage, try/catch, versioned). |
| `zones.ts` | `farmBlocked(worldId, duel)` and `potsBlocked(worldId, duel)`: the world-ID block lists. |
| `targets.ts` | `pickTarget(...)`: the next monster (6.3). |
| `potions.ts` | `pickPotion(...)`: which item to use now, if any (6.6). |
| `skillTimers.ts` | Client cooldown timers for the listed skills, from `skill.levels[lv-1].cooldown`, started when the server confirms the skill. |
| `buffs.ts` | `pickBuff(...)`: the buff entry to recast now, if any (6.7). |
| `stopRules.ts` | Turns game events into a stop reason (6.8). |
| `stats.ts` | Kills, EXP gained, items picked, potions used, time running. |
| `controller.ts` | `AutoPlay`: the state machine, stepped once per rules step from `WorldScreen.simulate`. Holds the farm bot and the auto pots. |

UI in `W\hud\autoPlay\`: `autoPlayWindow.ts` (3 tabs), `autoButton.ts`, `saverScreen.ts`. Wake Lock in
`W\wakeLock.ts`.

The controller gets narrow hooks from `WorldScreen` (own state, movers, attack loop, skill use, item use, item actions,
world id, duel state, now) so the rules can be tested with fakes. `WorldScreen.apply` and `play(changes)` forward
the events it needs (6.8); no general event bus is added.

### 6.2 States

Auto pots and the farm bot are separate switches.
- **Auto pots**: on or off (the Potions tab switch). Works whenever the player is alive and not in a pots-blocked
  place, with or without the farm bot.
- **Farm bot**: `off` → `running` → `stopped(reason)` → `off` (when the player looks at the reason or starts again).
  While running it is in one of: `seeking` (no target), `fighting`, `looting`, `buffing`, `returning` (walking back
  to the anchor).

Each rules step, in this order: stop rules → auto pots → (farm bot only) buffs between fights → loot → choose a
target → fight. At most **one** new command per step to the attack loop, skill use or item use, and potions on top
(6.6).

### 6.3 Choosing a target
- **Anchor**: the player's position when Start is pressed. The radius (default 15 m, 5-30 m in 5 m steps) is around
  the anchor, not the player.
- Candidates: movers that are monsters, alive, `attackAble()`, on the ground, inside the radius, not in the skip list.
- **Always skipped**: bosses, mid-bosses and giants (`rank` RANK_BOSS 4, RANK_MIDBOSS 5, RANK_SUPER 7) unless they hit
  us first; monsters another player is fighting: their `dest.targetId` is a player who is not us or our party, or a
  `hit` from such a player in the last 10 s, or less than full HP without any hit from us or our party.
- **Order**: a monster hitting us now comes first (even outside the radius, and even when it is a boss or another
  player is fighting it: fighting back is self-defence, not kill stealing); then the nearest to the player.
- **Stuck**: a target we have not hit within 10 s of choosing it (no own swing or hit on it, and the distance has not
  shrunk) goes on the skip list for 60 s. Three such targets in a row: walk back to the anchor.
- **No target**: check again every 500 ms; if the player is more than 3 m from the anchor, walk back.
- **Leash**: farther than radius + 5 m from the anchor and not hit by a monster: walk back before choosing.

### 6.4 Fighting and skills
- Engage with the attack loop the same way a double click does (`onMoverPressed(id, now, true)`), so V15's walk-up,
  auto attack and combo run unchanged. After each kill the controller chooses again (6.3).
- **Action Slot** (switch "Use Action Slot", on by default): when the task bar's Action Slot has skills, the target
  is alive and no chain is running (`skillUse.execute === 0`, nothing pending), call `skillUse.useActionSlot()`. The
  server runs the chain and charges action points; auto attack fills the gaps. Wait 1 s after a chain ends
  (ENDSKILLQUEUE) or fails (CLEAR_USESKILL) before firing again.
- **Ready skills** (up to 4, list order): a listed skill whose client timer is done and whose MP/FP cost the player
  has is cast on the target (`skillUse.useSlot`) before the next Action Slot. The timer starts when the server
  confirms the skill (`WorldState.onUseSkill`); a refused skill (CLEAR_USESKILL, TID_GAME_SKILLWAITTIME) waits 3 s.
- **Wand**: V15 never turns on auto attack for a wand. With a wand the bot **holds** the attack button
  (`attackButtonDown` once, `attackButtonUp` when it stops or switches target), which gives V15's automatic
  full-charge shot every 1.8 s and the +1 action point per charged shot. A press and release each step would shoot at
  charge 0 (weak, no action points). Never press while an Action Slot chain runs: a press sends ENDSKILLQUEUE
  (`skills.worldPressed`).

### 6.5 Looting (switch "Pick up drops", on by default)
- The client is never told who owns a drop (the server keeps `m_idOwn`, `m_dwDropTime` and `m_idHolder` to itself;
  FlyffWeb's `GroundItem` has no owner). So the bot loots **the items that appear within 5 m of our kill point in the
  3 s after our kill**: those are ours (or our party's) by the V15 rule. Older items lying around are left alone.
- After a kill, and when no monster is hitting us, walk to those items one by one with `ItemActions.pick(id, now)`.
- A refusal (TID_GAME_PRIORITYITEMPER, someone else's) or no pickup within 6 s (as `pickNearby`) puts the item on a
  skip list. Never loot during a fight.
- Bag full (`containerIsFull` or TID_GAME_LACKSPACE): looting stops, fighting goes on, the AUTO button shows
  "Bag full". It looks again when the bag changes.

### 6.6 Auto pots
- Three rows: **HP, MP, FP**. Each row: one item (dragged from the bag or the task bar), "Use below" (default HP
  50%, MP 30%, FP 30%; 10-90% in 5% steps), on/off.
- The row's item is stored by **item index**, not object id: any stack of that item in the bag is used, so a new
  stack keeps working. The row shows how many are left. Food and pills are allowed (their V15 cooldown is
  respected via `ItemUse.cooldownLeft`).
- When the gauge is below the level: use the item through `itemUse.use(objectId, 'bar')` (all of Neuz's refusals
  still apply). Then wait until the gauge changes or 800 ms pass, whichever is first, before that row may use
  again; never more than one item per row per 500 ms.
- Off while dead, during a duel, in the Arena (208), on the siege map (202) and in 1:1 guild war (241-244). Open-world
  PK (another player attacks us in a field) is not blocked: pots keep working.
- The farm bot does not require potions. It stops when HP < 20% and the HP row has no item left (6.8).

### 6.7 Buffs
- Up to 8 entries: own buff skills (dragged from the skill window) or buff items (from the bag). Stored by skill or
  item index.
- Recast an entry when its buff is missing from `self().buffs` or has under 10 s left, only when: not fighting (no
  target, no monster hitting us), standing still, and MP/FP enough for a skill. One entry per step, in list order.
- A buff already on us from anyone (for example a party assist) counts as present.
- Skills on oneself are aimed at the own mover by `skillUse` already (`dwExeTarget`).

### 6.8 Stop rules

| Event | Farm bot | Auto pots |
|---|---|---|
| We die | Stop: "you died". No auto revive. | Pause until revived |
| HP < 20% and no HP item left | Stop: "low HP, no potions" | — |
| A player hits us (DAMAGE from a player) | Stop: "attacked by <name>" | Keep on (outside PvP worlds) |
| Any whisper; normal chat from a GM in view (`m_dwAuthorization` GM level) | Stop: "message from <name>" | Keep on |
| A duel starts | Stop: "duel" | Off during the duel |
| World change, teleport (REPLACE), disconnect, log out | Stop: "left the area" | Stays on |
| Enter a blocked world | Stop: "not allowed here" (Start is greyed there) | Off in pots-blocked worlds |
| The player moves, clicks the ground or picks a target by hand | Stop: "you took control" | Keep on |
| The player starts flying | Stop: "flying" | Keep on |
| "Stop after" time reached (off by default; 1-12 h) | Stop: "time limit" | Keep on |
| Bag full | Looting stops, fighting goes on | — |

A whisper cannot be told apart from a GM's when the GM is out of sight (PACKETTYPE_SAY has no GM flag), so **any**
whisper stops the bot. A player can stop someone's bot this way; that is harmless and GMs can rely on it to check.

Server-wide messages do **not** stop it: GM chat announcements (`OnGMChat` → `AddGMChat`, sent to all), `/system`
notices, shouts and captions go to every player, so they would stop every bot on the server at once. A GM who
teleports or summons a player stops it through REPLACE / world change.

On every stop: a chat line in the system colour ("Auto Play stopped: you died."), the AUTO button shows the reason, a
short V15 alert sound if sound is on, and on desktop the page title becomes "(!) Stopped - <title>" until the tab is
seen again.

### 6.9 Zones
- Farm bot blocked in: Arena 208, guild siege 202, Quiz 211, 1:1 guild war 241-244, instance dungeons 121-125, secret
  rooms 151-167, and other `PartyDungeon.lua` worlds; and during a duel (`duelBook`).
- Auto pots blocked in: 208, 202, 241-244, and during a duel.
- Towns are not checked: they have no monsters, and the bot never attacks players.
- The lists live in `zones.ts` with the defineWorld.h names, so the owner can change them in one place.

### 6.10 AFK: background tab, Wake Lock, battery saver
- **Desktop background tab**: the rules keep stepping from the worker clock, so the controller keeps going. The
  controller re-issues its walk/attack each step, so `stopOwnMover` on `visibilitychange`/blur does not stop it.
  If the browser freezes the page, nothing can run; the stop is seen at the next visit.
- **Wake Lock**: requested when the farm bot starts, released when it stops, requested again on
  `visibilitychange` → visible. No error when the browser lacks it.
- **Phone tip**: on the first start on a phone, one line: "Keep the game open and the screen on. Locking the phone
  stops Auto Play."
- **Battery saver screen**: a black screen with dim text: "Auto Play running", time, monsters killed, EXP gained,
  items picked, potions used, HP/MP/FP bars, and the last event. While it shows, 3D drawing stops; the rules keep
  running. It opens from a button on the AUTO button's panel, and by itself on a phone after 2 minutes with no touch
  while the farm bot runs. A tap anywhere closes it. It closes by itself on a stop, showing the reason.

### 6.11 Window and controls
- **Start menu**: an "Auto Play" line between "Siege Ranking" and "Option". 19 lines: desktop one column; phone two
  columns 10 + 9. The builder checks the phone menu still fits above the task bar at 800x350.
- **Auto Play window** (custom, V15 look with `WindowFrame` and the V15 tab, button and check-box art):
  - Farm tab: Radius [-] 15 m [+]; Pick up drops [x]; Stop after [-] off [+]; Start / Stop button; status line
    (state, kills, time).
  - Potions tab: Auto pots [x]; three rows HP/MP/FP: item slot (count), Use below [-] 50% [+], on [x].
  - Skills tab: Use Action Slot [x]; Ready skills: 4 slots; Buffs: 8 slots. Each slot takes a drop and has a clear
    button.
  - Numbers use [-]/[+] buttons, not typing, so the phone needs no keyboard.
- **Phone**: the same window in the compact V15 phone look (`@media (max-width: 1000px) and (pointer: coarse)`),
  centred, tabs at the top.
- **AUTO button**: phone above the Attack button; desktop at the right end above the task bar. Grey "AUTO" when
  off, gold and pulsing while running, a small "!" after a stop. Tap/click: start or stop the farm bot with the saved
  settings. Long press / right-click: open the window. A drop on the button is not needed.
- **Chat lines** (custom English texts; V15 has none for this): "Auto Play started.", "Auto Play stopped: <reason>.",
  "Auto pots: no <HP|MP|FP> items left."
- No hotkey in version 1 (V15 uses most keys).

### 6.12 Settings
Per character, because skills and items differ by job:

```ts
interface AutoPlaySettings {
  version: 1;
  farm: { radius: number; loot: boolean; stopAfterMin: number /* 0 = off */ };
  pots: { enabled: boolean; rows: Record<'hp' | 'mp' | 'fp', { itemIndex: number; below: number; on: boolean }> };
  skills: { actionSlot: boolean; ready: number[] /* skill index, max 4 */;
            buffs: Array<{ kind: 'skill' | 'item'; index: number }> /* max 8 */ };
}
```

Key `flyffweb.autoPlay.<playerId>`. Bad or missing data → defaults. Items and skills the character no longer has are
shown greyed and skipped.

### 6.13 Server
**No server change is needed** for these choices. If the owner later wants real enforcement, each would be an
outer-repo patch in `patches/`:
- a premium "Auto Play" item: new item in `propItem.txt`/`spec_item`, and a World server check (hard to define: the
  packets are the same as manual play);
- server-checked zones: none possible for the same reason.

The trust holes found in the research (client-set action points, client hit flags, unclamped pickup range, no speed
check) exist today without this feature; they belong to the server-holes work.

### 6.14 Owner's rules text
The owner may want a line in the game rules: "Auto Play is allowed in open fields. GMs may whisper you to check;
a whisper stops Auto Play." (The owner's wording.)

## 7. Calls made by the designer (not asked of the owner)
- Loot only the items that appear near our kill within 3 s; never strangers' leftovers after 7 s.
- Only messages sent to this player stop the bot (any whisper, a GM talking in view), not server-wide broadcasts.
- A monster hitting us is fought back, even a boss or one another player is fighting.
- Wand users hold the attack button for full-charge shots.
- Bosses, mid-bosses and giants are never chosen; no level filter in version 1.
- Any manual move or target click stops the farm bot (stop, not pause).
- Auto pots keep working in open-world PK.
- Bag full: looting stops, fighting goes on.
- Settings are per character.

## 8. Left to the builder
- Exact pixel places of the AUTO button and the window size; the V15 art pieces for tabs, check boxes and [-]/[+].
- How `WorldScreen` exposes the hooks (a small interface object is preferred over making fields public).
- The V15 alert sound to use.
- Whether "less than full HP without a hit from us" misfires on monsters that regenerate; drop it if it does.
- The exact buff key for items vs skills in `W\buffs.ts`.

## 9. Checks
- Unit tests for every pure file in `W\autoplay\` and for the controller with fake hooks (target choice, kill-steal
  skip, stuck skip, leash, potion pacing, blocked worlds, every stop rule, settings load/save).
- Both client typechecks, `npx vitest run apps/client`, `npm run check:public-build`.
- One e2e spec for the owner to run (`apps/client/e2e/autoPlay.spec.ts`), desktop and phone projects.
- The owner's live checks: 30 minutes on desktop in a background tab; 30 minutes on an iPhone with the battery-saver
  screen; a GM whisper stops it; a player attack stops it; a duel request and start stop it.

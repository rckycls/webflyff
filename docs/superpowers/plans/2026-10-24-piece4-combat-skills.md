# Piece 4: Combat and Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vagrant levels from 1 to 15 in Flaris in the browser:
- **Milestone 1:** select and attack monsters, with damage numbers and hit effects; be hit back; die and revive at the
  lodestar; level up and spend stat points; with the weapon in the hand, Neuz's on-screen windows, and landscape for the
  whole game.
- **Milestone 2:** raise and use the Vagrant skills, from the task bar and the action slot, with their real effects.

**Architecture:**
- **Protocol:** `packages/protocol` gets readers for the combat, stats, task-bar and skill messages, writers for the
  packets Neuz sends to fight, revive, apply stats and use skills, and the rest of the own ADD_OBJ (numbers, skills,
  inventory).
- **Converter:** `tools/convert` gets new game-data catalogs (items, jobs, EXP, texts, effects, skills), the motions' hit
  frames, the models' bounding boxes and hand grips, an effects stage (`.sfx` to a web format, plus their textures) and a
  UI stage (theme art, icons, the damage-number sheet as PNG).
- **Scene:** `packages/scene` gets an effect player that copies Neuz's `CSfxModel`, and weapons attached to hands.
- **Client:** `apps/client` gets:
  - Neuz's combat rules: box picking, the attack loop and combo, damage, death and the formulas for the numbers;
  - the own character's numbers;
  - the on-screen windows in Neuz's look (status, target bar, task bar, Character, revive and later skill tree), built
    as HTML/CSS;
  - the landscape cover;
  - in milestone 2, the skill rules and skill use.
- **No C++ and no gateway change.**

**Tech Stack:** TypeScript (strict), Three.js r186, Vite 8, Vitest 5, Playwright 1.64, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-24-piece4-combat-skills-design.md`. Read it first; this plan argues from it.
Section numbers (§) are the spec's. The C++ facts are in `docs/superpowers/specs/2026-10-24-piece4-research/`, cited as
`[combat §2.2]` and so on. Every task reads the sections it cites before writing code.

**Where work happens:**
- `$WEB`: the FlyffWeb worktree on branch `piece4-combat` (on this PC
  `C:/Users/silec/Desktop/FlyFF/Bakbak/FlyffWeb-worktrees/piece4-combat`). Every commit goes here.
- `$SERVER`: the server folder (`C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15`), with `Source/`, `Resource/`,
  `Client/`, `Program/`. It's read only.
- **Setup before Task 1:**
  1. Run `npm ci` in `$WEB`.
  2. Copy `dist/assets` from `FlyffWeb-worktrees/piece3-world/dist/assets` (git-ignored, about 1 GB) or run
     `npm run convert`.
  3. Set `FLYFF_CLIENT="$SERVER/Client"` for corpus tests and the converter.

## Global Constraints

- **No change to the C++ servers, `$SERVER/Source`, `$SERVER/Program/` or the gateway** (§1, §7.9). Never commit in
  `$SERVER`. Never switch branches in `$SERVER/FlyffWeb`.
- **Commits:** only in `$WEB`, staging explicit paths. Messages are `type(scope): summary`, with scopes `scene`,
  `protocol`, `testkit`, `formats`, `convert`, `client`, `docs`. Every message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nothing is pushed.
- **Every reader, writer, formula and copied rule names the C++ function it copies** (file and line) in a comment, as the
  existing modules do. Where a research note and the C++ disagree, the C++ wins: note it in the commit message.
- **Build flags:** `__VER` is 15. Only the top of each `VersionCommon.h` and its `__MAINSERVER` section count
  ([combat §0], [effects conventions]).
- **Coordinates and angles:** as Piece 3. The rules work in D3D coordinates and FlyFF degrees; only drawing converts
  (`toWebPosition`).
- **Floats:** formulas that the C++ computes in `float` use `Math.fround` after every operation, and `(int)` casts are
  `Math.trunc`.
- **Time:** the rules step 60 times a second (Piece 3's `FixedStepper`). Effects and damage numbers step on the same
  ticks.
- **Texts shown to the player** come from the converted texts catalog (`TID_*`), never typed into code, except the five
  of the table below.
- **Look:** the windows copy Neuz's layout and art (§3.9). The owner's screenshots are the reference (the brainstorming
  notes describe them).
- **Landscape:** every new screen is laid out for a screen wider than tall (§3.10).

**Protocol values (copy exactly; all are in `Source/_Network/MsgHdr.h`):**

| Value | Exact |
|---|---|
| New message types (u16) | M1: `MELEE_ATTACK` 0x00e0, `DAMAGE` 0x0013, `MOVERDEATH` 0x00c7, `SETPOINTPARAM` 0x001e, `SETEXPERIENCE` 0x0012, `SETLEVEL` 0x0011, `SET_GROWTH_LEARNING_POINT` 0x00a6, `SETSTATE` 0x006a, `CORRREQ` 0x0041, `REVIVAL` 0x00a1, `REVIVAL_TO_LODESTAR` 0x00a2, `DEFINEDTEXT` 0x0095, `DEFINEDTEXT1` 0x0094, `QUERYGETDESTOBJ` 0x0049, `MONSTERPROP` 0x004e, `TASKBAR` 0x0097. M2: `USESKILL` 0x0019, `CLEAR_USESKILL` 0x001a, `DOUSESKILLPOINT` 0x007d, `INITSKILLPOINT` 0x007c, `SETACTIONPOINT` 0x00c5, `ENDSKILLQUEUE` 0x00e5, `CREATESFXOBJ` 0x000f |
| New packet types (u32) | M1: `SETTARGET` 0x00ff0023, `PLAYERSETDESTOBJ` 0xffffff07, `MELEE_ATTACK` 0x00ff0010, `GETDESTOBJ` 0xffffff73, `REVIVAL_TO_LODESTAR` 0x00ff00c1, `MODIFY_STATUS` 0xf000f501. M2: `USESKILL` 0x00ff0020, `DOUSESKILLPOINT` 0x000f0003, `ADDITEMTASKBAR` 0xffffff0c, `REMOVEITEMTASKBAR` 0xffffff0d, `SKILLTASKBAR` 0xffffff0e, `ENDSKILLQUEUE` 0x00ff00d5 |
| Field layouts | §3.2's tables |
| `AF_*` flags (`_AIInterface/ActionMover.h:27-44`) | GENERIC 0x1, MISS 0x2, MAGIC 0x8, MELEESKILL 0x10, MAGICSKILL 0x20, CRITICAL1 0x40, CRITICAL2 0x80, PUSH 0x100, PARRY 0x200, RESIST 0x400, STUN 0x800, BLOCKING 0x1000, FORCE 0x2000, RANGE 0x4000, FLYING 0x10000000 |
| `DST_*` | HP 38, MP 39, FP 40 |
| MELEE_ATTACK (sent) | atkMsg `OBJMSG_ATK1..4` = 29..32, target, p2 = 0, p3 = 0x00010000, attackSpeed = the held item's `fAttackSpeed` as f32 |
| SETTARGET `clear` | 1 = release the old target, 2 = focus (also with `NULL_ID` 0xffffffff to clear) |

**Combat values (copy exactly):**

| Value | Exact |
|---|---|
| `OBJMSG` | STOP 6, MODE_COMBAT 18, MODE_WALK 20, MODE_RUN 21, ATK1..4 29..32, MELEESKILL 37, DIE 40, DAMAGE 41, DAMAGE_FORCE 42 (enum order, `_Common/MoverMsg.h:105-166`; check against the C++) |
| `OBJSTA` | ATK1..4 0x00010000..0x00040000, ATK_MELEESKILL 0x00090000, ATK_ALL 0x00FF0000, DMG 0x01000000, DMG_FLY 0x02000000, DEAD 0x08000000, DISAPPEAR 0x09000000, DIE_ALL 0x08000000, DMG_ALL 0x0F000000; `OBJSTAF_COMBAT` 0x00000001 |
| `MTI` | STAND 0, WALK 3, RUN 5, DMG1 6, DMG2 7, DIE1 8, DMGFLY 11, ATK1..4 23..26, LEVELUP 198, VAG skills 1000, 1001, 1002 |
| Combo | ATK1 → ATK2 needs level ≥ 2, ATK2 → ATK3 ≥ 8, ATK3 → ATK4 ≥ 12, after ATK4 a new ATK1 (`ActionMoverState.cpp:804-807`) |
| Weapon motion offset (`OBJSTAF_COMBAT` set, no `MOP_FIXED`) | bare hand and one-handed sword +200, two-handed +800, axe +500, staff `+MTI_STAND_05`, stick +400, knuckle +700, dual +900 ([combat §2.4]); monsters (`IK3_VIRTUAL`) none |
| Hit pause | 5 ticks after a player's melee hit, 4 after a melee-skill hit; none for monsters |
| Arrival range | `IsRangeObj`: R = 0.8·r(target) + 0.8·r(walker) + range (range 0 → 1.0), in range when the 3D distance² < R². r = (|Δx| + |Δy| + |Δz|) / 6 · scale of the model box. `AR_SHORT` 2.0, `AR_LONG` 3.0, `AR_FAR` 4.0, `AR_RANGE` 10.0, `AR_WAND` 15.0, `AR_HRANGE` 6.0 |
| Hold-to-attack | 500 ms on a newly selected target (`m_timerFocusAttack`) |
| Attack speed | `A = trunc(job.fAttackSpeed + item.fAttackSpeed · (4·DEX + level/8) − 3)`, A ≥ 187.5 → 187; `s = (50 / (200 − A)) / 2 + PLUS[clamp(trunc(A/10), 0, 17)]`, clamped to [0.1, 2.0]; PLUS = 0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.56, 0.64, 0.72, 0.80, 0.88, 0.96, 1.04, 1.12, 1.20, 1.30, 1.38, 1.50; shown as `trunc(trunc(s·100)/2)`% (`MoverAttack.cpp:72-200`) |
| Damage number | glyph `d + a·14` (a = 0 own player hurt, 1 otherwise); 25 px glyphs, 12.5 px advance; ticks 1-8 rise 10 px/tick, 9-18 shake ±3 px, 19-34 hold, 35-50 rise 2 px/tick with alpha 75 − 2n and scale (3 + 0.05n)/4, then gone ([effects §5]) |
| Effect positions | hit spark at victim + forward(attacker angle) · 1 + (0, 1, 0); critical `XI_HIT_CRITICAL01` at +1.5 y scale 3; miss, parry, block at +1.5 y scale 2; level up follows the mover; Vagrant skill (`CSfxFixed`) at caster + forward · 1.3 + (0, 1, 0); `CSfx` draws at +0.2 y, `CSfxGenNormalDmg01` and `CSfxFixed` at +0 ([effects §2.2, §3.2]) |
| Revive | the server sets HP/MP/FP to 20% and sends SETPOS on the same map |
| Skill timeout | a USESKILL or DOUSESKILLPOINT with no answer in 2000 ms is cleared (§3.11) |

**Reference numbers** (Vagrant, Lv 1, STR/STA/DEX/INT 15, computed with `Math.fround` per step; the level 1 values match
`BASE_VALUE_TBL`):

| Case | Exact |
|---|---|
| Max HP / MP / FP | Lv 1: 230 / 63 / 32; Lv 2: 230 / 63 / 32; Lv 8: 240 / 67 / 36; Lv 15: 265 / 71 / 40; Lv 15 STA 45: HP 581, FP 103; Lv 15 INT 20: MP 85 |
| Attack speed | fists (0.07), Lv 1, DEX 15: A 76, s = `Math.fround(0.8416128754615784)`, shown 42%; Wooden Sword (0.085), Lv 1, DEX 15: A 77, s = `Math.fround(0.8432520031929016)`, 42%; Wooden Sword, Lv 15, DEX 45: A 87, s = `Math.fround(0.9412389993667603)`, 47% |
| Naked ATK / DEF / Critical ([stats §9]) | Lv 1: 8 / 0 / 1%; Lv 8: 15 / 5 / 1%; Lv 15: 23 / 10 / 1% |
| Starter items (`propItem.txt`) | `II_WEA_SWO_WOODEN`: `HD_ONE`, `PARTS_RWEAPON`, ability 3-4, `WT_MELEE_SWD`, `fAttackSpeed` 0.085, `AR_SHORT`, `dwSfxObj3` `XI_HIT_SWORD01`. `II_WEA_HAN_HAND`: ability 1-2, `WT_MELEE_STAFF`, 0.07. Suit 8-10, gauntlet 5-7, boots 4-5 (defence) |
| EXP needed (`ExpTable.inc`, row L+1) | Lv 1 14, Lv 2 20, Lv 3 36, Lv 4 90, Lv 5 152, Lv 14 1928; +2 stat points per level 2-15 |
| Aibatt (`MI_AIBATT1`) | level 1, `dwAddHp` 120, `nExpValue` 2 |

**Texts not from the catalogs (copy exactly):**

| Where | Text |
|---|---|
| Cover, touch device | Turn your device sideways to play. |
| Cover, PC | Make the window wider to play. |
| Start menu | Character, Skills (M2), Status, Log out |
| Attack button label (for screen readers) | Attack |
| Revive window | the `TID_*` texts of `CWndRevival` ([combat §5.2]); "Revive here" greyed |

## Review Focus

1. **The target dies, leaves view or turns peaceful in the middle of an approach or a swing.** The loop stops at once,
   the focus clears, no packet is sent for the gone target, and nothing throws. *Test: Task 19 "a DEL_OBJ mid-approach
   stops the loop".*
2. **Taps that repeat fast:** a double tap on the monster, the attack button pressed many times, or a held key. Only
   one PLAYERSETDESTOBJ per approach and one MELEE_ATTACK per swing go out. *Test: Task 19 "pressing attack ten times
   sends one approach".*
3. **Messages about movers that aren't (or are no longer) in view,** or that arrive in the same bundle as the mover's
   ADD_OBJ or after its DEL_OBJ. They're ignored, or applied in bundle order, with no ghost movers. *Test: Task 20
   "DAMAGE after DEL_OBJ is ignored".*
4. **One kill that passes two levels** (SETEXPERIENCE jumps from 3 to 5). HP/MP/FP refill to the new max; the
   level-up motion, effect and caption play once; the stat points come from SET_GROWTH_LEARNING_POINT. *Test: Task 18
   "a two-level jump plays one level up".*
5. **The phone is turned upright during a fight.** The cover shows, the fight goes on (auto-attack, server messages,
   numbers are still applied), and turning back shows the same state. *Test: Task 25 "turning upright mid-fight keeps
   attacking".*

---

## File structure

| Path | Responsibility |
|---|---|
| `packages/protocol/src/world/combat.ts` | readers of the M1 combat, number and text messages |
| `packages/protocol/src/world/own.ts` | the own character's part of ADD_OBJ after the equipment IDs: skills, the fields up to the inventory, the inventory |
| `packages/protocol/src/world/taskBar.ts` | the TASKBAR reader, the `Shortcut` type, and (M2) its edit writers |
| `packages/protocol/src/world/skills.ts` | (M2) readers of the skill messages |
| `packages/protocol/src/messages/world.ts` | + the writers of the browser's new packets |
| `packages/testkit/src/world.ts` | + a writer per new message, and `writeAddSelf` with the own data |
| `packages/formats/src/inc/propJob.ts`, `expTable.ts`, `textClient.ts`, `texturePack.ts`, `propSkillAdd.ts` (M2) | new game-table readers |
| `packages/formats/src/inc/propItem.ts`, `propMover.ts` | + the kept columns |
| `packages/formats/src/sfx/sfx.ts` | the `.sfx` reader |
| `packages/formats/src/web/gameData.ts`, `web/effect.ts`, `web/ui.ts` | the web types of the new catalogs, effect files and UI sheets |
| `tools/convert/src/data/gameDataStage.ts` | + itemProps, jobs, exp, texts, effects index, (M2) skills |
| `tools/convert/src/models/*` | + motion events, model boxes, skeleton grips |
| `tools/convert/src/effects/effectsStage.ts` | `.sfx` → `effects/*.json`, sfx textures → `textures/sfx/*.ktx2` |
| `tools/convert/src/ui/uiStage.ts` | theme art, icons and the damage-number sheet → `ui/*.png`, `data/uiSheets.json` |
| `packages/scene/src/effects/` | `EffectModel.ts` (Neuz's stepping, pure), `EffectRenderer.ts` (Three objects) |
| `packages/scene/src/character/held.ts` | weapons and shields attached to hands |
| `apps/client/src/world/sim/params.ts` | the formulas: max HP/MP/FP, EXP percent, attack speed, ATK, DEF, Critical |
| `apps/client/src/world/sim/ActionMover.ts`, `sim/constants.ts` | + attack, damage, death and skill states |
| `apps/client/src/world/combat/focus.ts` | selection, SETTARGET, box picking |
| `apps/client/src/world/combat/attackLoop.ts` | the own auto-attack |
| `apps/client/src/world/OwnState.ts` | the own character's numbers, stats, points, skills, inventory counts, task bar |
| `apps/client/src/world/WorldState.ts` | + applying the combat messages, `CombatEvent`s |
| `apps/client/src/world/fx/EffectManager.ts`, `render/DamageNumbers.ts`, `render/TargetMarks.ts` | effects by `XI_*`, numbers, corners |
| `apps/client/src/world/hud/` | `frame.ts` (Neuz window frame, drag, close), `statusWindow.ts`, `targetBar.ts`, `taskBar.ts`, `attackButton.ts`, `messages.ts`, `reviveWindow.ts`, `characterWindow.ts`, (M2) `skillWindow.ts` |
| `apps/client/src/landscape.ts` | the cover screen, full screen and orientation lock |
| `apps/client/src/world/skills/` (M2) | `skillRules.ts` (pure rules), `skillUse.ts` (using skills, the action slot) |
| `apps/client/e2e/fight.spec.ts`, `skills.spec.ts` | pretend-server browser tests |
| `apps/client/test/world.live.test.ts` | + the fight and skill legs |

---

# Milestone 1: fight and level

### Task 1: Combat message readers

**Files:**
- Create: `packages/protocol/src/world/combat.ts`
- Modify: `packages/protocol/src/constants.ts`, `world/types.ts`, `world/readers.ts`, `index.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/combatMessages.test.ts`, `packages/testkit/test/world.test.ts`

**Interfaces:**
- Consumes: `MessageReader`, `readBundle`, `ArReader` (Piece 3).
- Produces:

```ts
// constants.ts
export const AttackFlag = { GENERIC: 0x1, MISS: 0x2, /* … every AF_* of the values table */ FLYING: 0x10000000 } as const;
export const DstParam = { HP: 38, MP: 39, FP: 40 } as const;
// types.ts: WorldMessage gains
| { type: 'meleeAttack'; message: number; targetId: number; param2: number; param3: number }
| { type: 'damage'; attackerId: number; hit: number; flags: number; fly: { pos: Vec3; angle: number } | null }
| { type: 'moverDeath'; attackerId: number; message: number }
| { type: 'setPointParam'; param: number; value: number }
| { type: 'setExperience'; exp: bigint; level: number; skillLevel: number; skillPoint: number; deathExp: bigint; deathLevel: number }
| { type: 'setLevel'; level: number }
| { type: 'setGrowthLearningPoint'; remainGP: number }
| { type: 'setState'; str: number; sta: number; dex: number; int: number; remainGP: number }
| { type: 'corrReq'; pos: Vec3; attackerId: number }
| { type: 'revival' } | { type: 'revivalToLodestar' }
| { type: 'definedText'; textId: number; args: string }      // DEFINEDTEXT1 reads as args ''
| { type: 'queryGetDestObj'; fromId: number }
| { type: 'monsterProp'; rates: MonsterRate[]; removed: string[] }
export interface MonsterRate { name: string; hitPoint: number; attackPower: number; defence: number; exp: number; itemDrop: number; penya: number }  // percent
// testkit world.ts: writeMeleeAttack, writeDamage, writeMoverDeath, writeSetPointParam, writeSetExperience, writeSetLevel,
// writeSetGrowthLearningPoint, writeSetState, writeCorrReq, writeRevival, writeRevivalToLodestar, writeDefinedText(objectId, textId, args?)
// (args undefined writes DEFINEDTEXT1), writeQueryGetDestObj, writeMonsterProp: (objectId, …fields in WorldMessage order): ScriptMessage
```

- **Copies:** `CDPClient::OnMeleeAttack` (`Neuz/DPClient.cpp:3802`), `OnDamage` (`:1758`), `OnMoverDeath` (`:1936`), `OnSetPointParam` (`:3303`), `OnSetExperience` (`:3376`), `OnSetLevel` (`:3339`), `OnSetGrowthLearningPoint` (`:3531`), `OnSetState` (`:13514`), `OnCorrReq` (`:10015`), `OnRevival` (`:3450`), `OnRevivalLodestar` (`:3484`), `OnDefinedText` (`:4117`) / `OnDefinedText1` (`:4230`), `OnQueryGetDestObj` (`:8985`), `OnMonsterProp` (`:6630`); the writers mirror `CUser::Add*` / `CUserMng::Add*` ([combat §3.2], [stats §2.2]).

- [ ] **Step 1: Write the failing tests.** One per message: bytes built with `ArWriter` in the handler's order decode to the value through `readBundle` with `WORLD_READERS`, with nothing `mismatched`. Also:
  - DAMAGE with `AF_FLYING` reads the position and angle, and without it `fly` is null;
  - SETEXPERIENCE's -1 / 0xffff defaults come through as `-1n` / `0xffff`;
  - MONSTERPROP with two rates and one removed name;
  - `every testkit writer decodes to what it was given`.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/combatMessages.test.ts packages/testkit/test/world.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the constants, the readers, their `WORLD_READERS` entries and the testkit writers.
- [ ] **Step 4: Run** the same command. Expected: PASS. Then `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): combat, number and text messages of the world bundles`.

### Task 2: The browser's fight packets

**Files:**
- Modify: `packages/protocol/src/messages/world.ts`, `packages/protocol/src/constants.ts`
- Test: `packages/protocol/test/worldPackets.test.ts` (create)

**Interfaces:**
- Produces:

```ts
export function encodeSetTarget(targetId: number, clear: 1 | 2): Uint8Array;
export function encodePlayerSetDestObj(targetId: number, range: number): Uint8Array;
export function encodeMeleeAttack(message: number, targetId: number, attackSpeed: number): Uint8Array; // p2 0, p3 0x00010000
export function encodeGetDestObj(fromId: number, destId: number): Uint8Array;
export function encodeRevivalToLodestar(): Uint8Array;
export function encodeModifyStatus(counts: { str: number; sta: number; dex: number; int: number }): Uint8Array;
// WorldPacket (decodeWorldPacket) gains one kind per packet, with the same field names, for the pretend server
```

- **Copies:** `CDPClient::SendSetTarget` (`Neuz/DPClient.cpp:9886`), `SendPlayerDestObj` (`:10923`), `SendMeleeAttack` (`:9819`), `SendGetDestObj`, `SendHdr` (`:11253`), `SendModifyStatus` (`:16652`).

- [ ] **Step 1: Write the failing tests.**
  - Each encoder's bytes start with `DPID_UNKNOWN` and its type, then the fields of the values table.
  - `encodeMeleeAttack(29, 7, 0.085)` ends with the four bytes of `Math.fround(0.085)` (`0x3dae147b`, little-endian).
  - `decodeWorldPacket` round-trips each.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/worldPackets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the encoders and the decoder kinds.
- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): the packets Neuz sends to fight, revive and apply stats`.

### Task 3: The own character's numbers and skills in ADD_OBJ

**Files:**
- Create: `packages/protocol/src/world/own.ts`
- Modify: `packages/protocol/src/world/addObj.ts`, `world/types.ts`, `packages/testkit/src/world.ts` (`writeAddSelf`)
- Test: `packages/protocol/test/addObj.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SkillSlot { skill: number; level: number }   // skill NULL_ID (0xffffffff) for an empty slot
export interface OwnCharacter {
  str: number; sta: number; dex: number; int: number;
  manaPoint: number; fatiguePoint: number;
  exp: bigint; skillLevel: number; skillPoint: number; deathExp: bigint; deathLevel: number;
  remainGP: number;
  skills: SkillSlot[];                       // always 45
  inventory: InventoryItem[] | null;         // Task 4; null until then, and when its read fails
}
// AddedPlayer gains: own: OwnCharacter | null   (null for another player)
```

- **Copies:** `CMover::Serialize`, the METHOD_NONE load (`_Common/ObjSerializeOpt.cpp:509-570`): `[stats §2.1]`, `[skills §2.1]`. `readOwnEquipment` keeps what it reads today and returns the new fields too. The base stats are the player part's `m_nStr..m_nInt` (`:436-439`).
- After the 45 skill pairs, this task's reader stops (`skipRest`) as today. Task 4 continues.

- [ ] **Step 1: Write the failing tests.**
  - `the own ADD_OBJ keeps the numbers and skills`: a `writeAddSelf` with 15/15/15/15, MP 63, FP 32, EXP 0n, skill points 0 and remainGP 0 reads back exactly. Its skills (slots 0-2 = skill IDs 1, 2, 3 at levels 0, 1, 2; slots 3-6 = the four `SI_GEN_EVE_*` IDs at level 0; the rest `NULL_ID` at 0) read back slot by slot.
  - Another player's ADD_OBJ has `own === null`, and its bytes still end on the boundary.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/addObj.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `OwnCharacter`, the reader and the writer.
- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): the own character's numbers and skill array from ADD_OBJ`.

### Task 4: The own inventory in ADD_OBJ

**Files:**
- Modify: `packages/protocol/src/world/own.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/addObj.test.ts`

**Interfaces:**
- Produces: `export interface InventoryItem { objectId: number; itemId: number; count: number }`, filled into `OwnCharacter.inventory`.
- **Copies:**
  - **The fields between the skill array and the inventory** (`_Common/ObjSerializeOpt.cpp:569-600`, [skills §2.1]: the cheer point and tick, `m_nSlot`, the bank gold and player IDs, `m_nPlusMaxHitPoint`, the attack and defence resists, the angel EXP and level, …). The task lists every one, with its line, in the reader's comments.
  - **The inventory:** `CItemContainer<CItemElem>::Serialize` and `CItemElem::Serialize` (`_Common/Item.cpp`, `_Common/ItemElem*.cpp`), with every `__VER >= 15` branch.
- A read that would run past the message boundary, or ends off it, throws inside a `try`. The reader then returns `inventory: null` and the rest of `OwnCharacter`, and the bundle counts one mismatch, as Piece 3's readers do (§4).

- [ ] **Step 1: Write the failing tests.**
  - `the own inventory is read`: a `writeAddSelf` with the `BASE_VALUE_TBL` inventory reads back with nothing mismatched. That inventory is object 0 item 502 count 1, object 1 item 2801 count 1, object 2 item 4805 count 5, object 42 item 506, object 43 item 510, object 44 item 21, object 45 item 2800 count 3 (male).
  - `a broken inventory still gives the numbers`: bytes cut in the middle of an item give `inventory: null`, the numbers of Task 3, and one mismatch.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/addObj.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the reader and extend `writeAddSelf` to write an inventory.
- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): the own inventory's items and counts from ADD_OBJ`.

### Task 5: The task bar message

**Files:**
- Create: `packages/protocol/src/world/taskBar.ts`
- Modify: `world/types.ts`, `world/readers.ts`, `constants.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/taskBar.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Shortcut { kind: number; id: number; type: number; index: number; userId: number; data: number; text: string }
// kind = m_dwShortcut: 0 NONE, 1 ETC, 2 APPLET, 3 MOTION, 4 SCRIPT, 5 ITEM, 6 SKILL, 7 OBJECT, 8 CHAT, 9 SKILLFUN, 10 EMOTICON, 11 LORDSKILL
export const ShortcutKind = { NONE: 0, APPLET: 2, ITEM: 5, SKILL: 6, CHAT: 8 /* … all of them */ } as const;
export interface TaskBar {
  applets: Array<{ slot: number; shortcut: Shortcut }>;            // slot 0..17
  items: Array<{ bar: number; slot: number; shortcut: Shortcut }>; // bar 0..7, slot 0..8
  queue: Shortcut[];                                               // the action slot, entries 0..n-1
  actionPoint: number;
}
// WorldMessage gains | { type: 'taskBar'; taskBar: TaskBar }; testkit: writeTaskBar(objectId, taskBar)
```

- **Copies:** `CUserTaskBar::Serialize` (`_Interface/UserTaskBar.cpp:63-125`), `CWndTaskBar::Serialize` (`_Interface/WndTaskBar.cpp:315-400`): [skills §5.2]. The text is present only for kind 8.

- [ ] **Step 1: Write the failing tests.**
  - `the new character's task bar`: the bar `BASE_VALUE_TBL` describes reads back (its fields per entry: slot, kind, id, type, index, userId, data).
    - Applets (kind 2): 400, 398, 2010, 581 in slots 0-3, and a motion (kind 3) 25 in slot 4.
    - Items, all bar 0: slot 0 an item (kind 5) object 45, slot 1 an item object 1, slots 2 and 8 motions (kind 3) 3 and 2.
    - An empty queue. Action point 0.
  - A chat shortcut carries its text.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/taskBar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the reader, the type and the writer.
- [ ] **Step 4: Run** the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): the task bar of the JOIN bundle`.

### Task 6: Game-table readers

**Files:**
- Create: `packages/formats/src/inc/propJob.ts`, `inc/expTable.ts`, `inc/textClient.ts`, `inc/texturePack.ts`
- Modify: `packages/formats/src/inc/propItem.ts`, `inc/propMover.ts`, `packages/formats/src/index.ts`
- Test: `packages/formats/test/gameTables.test.ts` (create), `packages/formats/test/gameData.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JobProp { name: string; attackSpeed: number; factorMaxHP: number; factorMaxMP: number; factorMaxFP: number;
  factorDef: number; factorHPRecovery: number; factorMPRecovery: number; factorFPRecovery: number; meleeSWD: number;
  meleeAXE: number; meleeSTAFF: number; meleeSTICK: number; meleeKNUCKLE: number; magicWAND: number; blocking: number;
  meleeYOYO: number; critical: number }                                   // the 17 floats, f32
export function readPropJob(text: string, file: string): JobProp[];        // index = JOB_*
export interface ExpRow { exp1: bigint; exp2: bigint; lpPoint: number; limitExp: bigint }
export function readExpTable(text: string, file: string): ExpRow[];        // the expCharacter block; index = level
export interface TextEntry { id: string; text: string; color: number }     // TID name, ARGB
export function readTextClient(inc: string, strings: ReadonlyMap<string, string>, file: string): Map<string, TextEntry>;
export interface PackFrame { x: number; y: number; w: number; h: number }
export function readTexturePack(text: string, file: string): { texture: string; frames: PackFrame[] }; // CTexturePack::LoadScript
// propItem: ItemProp keeps more columns: kind1/kind2/kind3, handed, parts, abilityMin, abilityMax, weaponType,
//   attackSpeed (number) and attackSpeedText (the token as written), attackRange, destParams [3], adjParams [3],
//   sfxObj3, sfxObj5, sndAttack1, icon (szIcon), plus the string columns after dwSndAttack2
// propMover: MoverProp keeps level, addHp, expValue, rank (dwClass), belligerence, killable (bKillable), hideLevel, element
```

- **Copies:** `CProject::LoadPropJob` (`_Common/Project.cpp:4808-4838`), the `expCharacter` loader (`Project.cpp:3262-3290`), `CProject::LoadPropItem` (`_Common/ProjectCmn.cpp:300-487`, the columns after `dwSndAttack2`), `CProject::LoadPropMover`, the `textClient.inc` loader (`Project.cpp`, the text table), `CTexturePack::LoadScript` (`_Common/2DRender.cpp:1559-1766`).

- [ ] **Step 1: Write the failing tests.**
  - Unit tests on small hand-made texts for each reader.
  - Corpus tests (`FLYFF_CLIENT`):
    - the Vagrant row of `propJob.inc` is 75.0, 0.9, 0.3, 0.3, 1.0, 1.2, 0.5, 0.5, 4.5, 5.5, 0.8, 3.0, 5.0, 6.0, 0.2, 4.2, 1.0;
    - `ExpTable.inc` row 2 is 14 EXP with 2 points, row 16 is 2340;
    - the Wooden Sword's and the fists' columns are the reference table's, and `attackSpeedText` is `0.085`;
    - `MI_AIBATT1` is level 1, 120 HP, 2 EXP;
    - `TID_GAME_DEATH` has a text and the colour `0xff00ffff`;
    - `DmgEffect.inc` gives 28 frames, frame 0 at (0, 0, 50, 50) and frame 14 at (0, 128, 50, 50);
    - `icon_target.inc` gives its corner cells.
- [ ] **Step 2: Run** `npx vitest run packages/formats/test/gameTables.test.ts` and `npm run test:corpus -- gameData`. Expected: FAIL.
- [ ] **Step 3: Implement** the readers and the extra columns.
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(formats): job, EXP, text and texture-pack tables, more item and mover columns`.

### Task 7: The new game-data catalogs

**Files:**
- Modify: `packages/formats/src/web/gameData.ts`, `tools/convert/src/data/gameDataStage.ts`, `apps/client/src/world/gameData.ts`
- Test: `tools/convert/test/gameDataStage.test.ts`, `tools/convert/test/gameData.corpus.test.ts`, `apps/client/test/gameData.test.ts` (create if absent)

**Interfaces:**
- Consumes: Task 6's readers; `readModelIndex` (OT_SFX and OT_ITEM entries).
- Produces (each a logical key under `data/`, content-hashed like the others):

```ts
// WebMover gains: level, addHp, expValue, rank, belligerence, killable, hideLevel, element
export interface WebItemProp { id: number; name: string; kind1: number; kind2: number; kind3: number; handed: number;
  part: number; abilityMin: number; abilityMax: number; weaponType: number; attackSpeed: number /* f32 of the token */;
  attackRange: number; destParams: number[]; adjParams: number[]; sfxHit: number /* dwSfxObj3, XI id or -1 */;
  model: string | null /* models/<item>.glb for a held item (OT_ITEM entry without parts), else null */;
  icon: string | null /* ui/<icon>.png */ }
// data/itemProps.json: WebItemProp[]   data/jobs.json: JobProp[]   data/exp.json: { exp1: string; lpPoint: number; limitExp: string }[]
// data/texts.json: Record<TID name, { text: string; color: number }>   (every TID; small enough)
// data/effectsIndex.json: Record<XI id as string, { effect: string /* effects/<name>.json */; scale: number }>
// client: GameData gains itemProps: Map<number, WebItemProp>, jobs: JobProp[], exp: ExpRow[] (bigints parsed back),
//         texts: Texts, effects: Map<number, { effect: string; scale: number }>
export type Texts = ReadonlyMap<string, TextEntry>;   // apps/client/src/world/gameData.ts
```

- The effects index points at Task 11's keys (`effects/<webName>.json`). The data stage runs after the effects and UI stages (Task 11 sets the order).
- `loadGameData` throws `GameDataMissingError` for a missing new catalog, as today, which is what makes "The game files on the server are out of date." show.

- [ ] **Step 1: Write the failing tests.**
  - The stage on a small fake client writes the five catalogs.
  - Corpus: the Wooden Sword's `WebItemProp` has `attackSpeed === Math.fround(0.085)`, `sfxHit` = the value of `XI_HIT_SWORD01` and a model key; `XI_GEN_LEVEL_UP01` (42) points at `effects/sfx_genlevelup01.json`.
  - Client: `loadGameData` reads them, and throws for a missing one.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/gameDataStage.test.ts apps/client/test/gameData.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the catalogs, their web types and the loader.
- [ ] **Step 4: Run** the same commands and `npm run test:corpus -- gameData`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(convert): item, job, EXP, text and effect catalogs`.

### Task 8: Hit frames in the converted motions

**Files:**
- Modify: `tools/convert/src/models/motionGlb.ts`, `models/modelsStage.ts`, `apps/client/src/world/render/moverModels.ts` (or wherever `LoopedMotion` lives)
- Test: `tools/convert/test/models.test.ts`, `tools/convert/test/models.corpus.test.ts`, `apps/client/test/moverViews.test.ts`

**Interfaces:**
- Produces: each motion GLB's animation has `extras.events = { hit: number[]; sound: Array<[frame: number, sound: number]>; quake: number[]; frames: number; perSlerp: number }` from `readAni`'s `frameAttributes` (0-based frames, `MA_HIT` 1, `MA_SOUND` 2, `MA_QUAKE` 4). On the client, `LoopedMotion` (or the loaded clip) exposes `events` with the same shape.
- **Copies:** `CMotion::IsAttrHit` (`_Common/Bone.h:162-169`): a hit fires when `old < frame <= current`.

- [ ] **Step 1: Write the failing tests.**
  - Unit: a motion with one hit at 12 writes `{ hit: [12] }`.
  - Corpus: `Mvr_male_AtkAtk1-01` to `Atk4-01` have hits 12 / 11 / 10 / 8 and 17 frames; `Mvr_AiBatt_atk1` hit 21 of 52; `Mvr_male_SklVagBrandish` hits 7, 23, 39 of 61 ([combat §2.5], [skills §1.6]).
  - Client: the loaded clip carries them.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/models.test.ts apps/client/test/moverViews.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands and `npm run test:corpus -- models`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(convert): motions carry their hit, sound and quake frames`.

### Task 9: Model boxes and hand grips

**Files:**
- Modify: `tools/convert/src/models/modelGlb.ts`, `models/skeletonGlb.ts`, `packages/scene/src/character/assemble.ts`
- Test: `tools/convert/test/models.test.ts`, `packages/scene/test/assemble.test.ts`

**Interfaces:**
- Produces:
  - Each model GLB's scene has `extras.bbMin` / `extras.bbMax`: the union of the `.o3d` objects' `bbMin` / `bbMax`, in D3D coordinates, as `CModelObject` unions them (`_Common/ModelObject.cpp:735-744`).
  - Each skeleton GLB's scene has `extras.grips = { rHand: number; lHand: number; localRH: number[16]; localLH: number[16]; localShield: number[16]; localKnuckle: number[16] }` from `readChr`.
  - `AssembledCharacter` gains `box(): { min: Vec3; max: Vec3 }` (D3D, the union of the loaded parts and the held item) and `grips` (null for a mover without a skeleton).

- [ ] **Step 1: Write the failing tests.**
  - A two-object model writes the union box.
  - `mvr_male`'s skeleton carries its hand indices and `localRH`.
  - Assembling the male body with a part grows the box.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/models.test.ts packages/scene/test/assemble.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(convert): model boxes and skeleton hand grips`.

### Task 10: The `.sfx` reader

**Files:**
- Create: `packages/formats/src/sfx/sfx.ts`
- Modify: `packages/formats/src/index.ts`
- Test: `packages/formats/test/sfx.test.ts`, `packages/formats/test/sfx.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SfxKey { frame: number; pos: Vec3; posRotate: Vec3; scale: Vec3; rotate: Vec3; alpha: number }
export interface SfxParticle { create: number; createNum: number; appear: number; keep: number; disappear: number;
  startPosVar: number; startPosVarY: number; yLow: number; yHigh: number; xzLow: number; xzHigh: number;
  accel: Vec3; scale: Vec3; scaleSpeed: Vec3; rotationLow: Vec3; rotationHigh: Vec3; repeatScal: boolean; repeat: boolean;
  scaleSpeedLow: Vec3; scaleSpeedHigh: Vec3; scaleEnd: Vec3 }
export interface SfxPart { type: 1 | 2 | 3 | 4; texture: string; texFrame: number; texLoop: number; using: boolean;
  billType: 1 | 2 | 3 | 4; alphaType: 1 | 2; keys: SfxKey[]; particle: SfxParticle | null; points: number /* CUSTOMMESH */ }
export interface SfxFile { version: 'old' | '0.1' | '0.2' | '0.3'; parts: SfxPart[] }
export function readSfx(bytes: Uint8Array, file: string): SfxFile;
```

- **Copies:** `CSfxBase::Load` (`_Common/sfxbase.cpp:1719-1799`) and every part's `Load`, `Load2`, `Load3` and `OldLoad`, in the four version branches ([effects §1.2-1.3]). Keys are sorted on insert, and a duplicated frame keeps the last one (`AdjustKeyFrame`). The v0.2+ name label is skipped, not decoded.

- [ ] **Step 1: Write the failing tests.**
  - Unit: hand-built files of each version and part type read back field by field, and an unsorted file with a duplicate frame.
  - Corpus `every .sfx in Client/SFX reads with no bytes left`: 731 files; versions 37 old, 75 v0.1, 421 v0.2, 198 v0.3; 4458 parts.
  - `sfx_GenLevelUp01` has 9 parts, with a last key at 410.
- [ ] **Step 2: Run** `npx vitest run packages/formats/test/sfx.test.ts` and `npm run test:corpus -- sfx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(formats): the .sfx effect file reader`.

### Task 11: The effects and UI stages

**Files:**
- Create: `tools/convert/src/effects/effectsStage.ts`, `tools/convert/src/ui/uiStage.ts`, `packages/formats/src/web/effect.ts`, `packages/formats/src/web/ui.ts`
- Modify: `tools/convert/src/run.ts` (stage order: textures, models, effects, ui, worlds, data), `tools/convert/src/textures/convertTexture.ts` (the `textures/sfx/` key space), `tools/convert/src/cli.ts` (`--only` stage names)
- Test: `tools/convert/test/effectsStage.test.ts`, `tools/convert/test/uiStage.test.ts`, the corpus counterparts

**Interfaces:**
- Produces:

```ts
// web/effect.ts: effects/<webName>.json is a WebEffect: the SfxFile's parts with `texture` replaced by the logical key
// `textures/sfx/<webName>.ktx2` (or null for an empty name), texture-animation frames expanded to their keys
// (GetTextureName, sfxbase.cpp:21-33), and mesh parts kept with `model` = the models/ key of the .o3d
export interface WebEffect { parts: WebEffectPart[] }
// web/ui.ts: data/uiSheets.json
export interface WebUiSheets { damageDigits: { image: string; frames: PackFrame[] }; targetCorners: { image: string; frames: PackFrame[] } }
// ui/<webName>.png: every file of Client/Icon, the Theme/Default files the windows use (WndTile*, title bar, buttons,
// GauEmptyNormal.bmp, LvUp/LvUp2/LvDn/LvDn2.bmp, ButtChar*.bmp/tga, WndNewCharacter01.tga), and SFX/DmgEffect.dds;
// colour key 0xff00ff -> alpha 0
```

- Every `.sfx` that `mdlDyna.inc` names becomes an effect file. Every texture those effects reference, and every frame of an animated one, goes to KTX2 with the existing texture code. The report counts written, skipped (a missing texture) and failed, and counts mesh parts.
- The theme file list is fixed in `uiStage.ts`. Task 22 (the windows) extends it if it needs more, and says why in its commit.

- [ ] **Step 1: Write the failing tests.**
  - Unit, on a fake client: one effect with an animated texture writes its JSON and its frame textures; a missing texture is reported, not fatal; a BMP with magenta becomes transparent PNG.
  - Corpus: the M1 set and the three Vagrant effects of [effects §4] are all written; `sfx_HitSword01` has 4 parts; `DmgEffect` gives 28 frames.
- [ ] **Step 2: Run** `npx vitest run tools/convert/test/effectsStage.test.ts tools/convert/test/uiStage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both stages.
- [ ] **Step 4: Run** the same commands, `npm run test:corpus -- effects ui`, then `npm run convert -- --only effects,ui,data` on the real client. Expected: PASS, and the report shows no failure. Record the new stages' times and sizes in `docs/conversion-baseline.md`.
- [ ] **Step 5: Commit** `feat(convert): effects and UI art stages`.

### Task 12: The effect player (stepping)

**Files:**
- Create: `packages/scene/src/effects/EffectModel.ts`
- Test: `packages/scene/test/effectModel.test.ts`

**Interfaces:**
- Consumes: `WebEffect` (Task 11).
- Produces:

```ts
export interface EffectRandom { next(): number }          // [0, 1); the game uses (rand()%50000)/50000
export class EffectModel {
  constructor(effect: WebEffect, random: EffectRandom);
  /** One 60 Hz tick (CSfxModel::Process). Returns true when the effect is over. */
  step(): boolean;
  readonly frame: number;
  /** What to draw this tick: one entry per visible quad, cone or particle, in part order. */
  drawList(angleY: number, scale: Vec3): EffectDraw[];
}
export type EffectDraw =
  | { kind: 'quad'; part: number; texture: string | null; billType: 1 | 2 | 3 | 4; matrix: number[]; alpha: number; additive: boolean }
  | { kind: 'cone'; part: number; texture: string | null; billType: 1 | 2 | 3 | 4; matrix: number[]; top: number; bottom: number; height: number; uv: Vec3; points: number; alpha: number; additive: boolean };
```

- **Copies:** `CSfxModel::Process` (`_Common/sfxbase.cpp:2699-2975`), `CSfxPartBill::Render` (`:314-418`), `CSfxPartCustomMesh::Render` (`:1303-1442`), `RenderParticles` (`:2507-2697`), `GetPrevKey` / `GetNextKey` (`:107-143`): [effects §2.3-2.8].
  - The frame advances before use.
  - Integer alpha interpolation.
  - A part is drawn only between its first and last key.
  - Three randoms shared per tick, one angle per particle.
  - The `repeat` sustain jump at 65% back to 60%.
  - The end-of-life rule.
  - The `repeatScal` ping-pong.
  - The burst-at-frame-0 quirk.
  - Mesh parts are ignored (§3.7).

  Matrices are D3D row-vector order. The renderer converts them.

- [ ] **Step 1: Write the failing tests.**
  - Key interpolation at a key, between keys, before the first and after the last.
  - A texture-animated part's frame index at ticks 0-10.
  - A burst particle part emits `createNum` once.
  - A continuous emitter's particles age, fade in over `appear` and out after `keep`, and die at `disappear`.
  - With a fixed random, two particles of one tick share height and speed.
  - `repeat` jumps back.
  - `sfx_GenLevelUp01` (loaded from the converted corpus file when `FLYFF_CLIENT` is set, else a fixture) ends at tick 410.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/effectModel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(scene): effect stepping copied from CSfxModel`.

### Task 13: The effect renderer and manager

**Files:**
- Create: `packages/scene/src/effects/EffectRenderer.ts`, `apps/client/src/world/fx/EffectManager.ts`
- Test: `packages/scene/test/effectRenderer.test.ts`, `apps/client/test/effectManager.test.ts`

**Interfaces:**
- Consumes: `EffectModel` (Task 12), `GameData.effects` (Task 7), `AssetStore`.
- Produces:

```ts
// scene: draws an EffectModel's drawList: pooled quads and cones, additive (ONE, ONE scaled by alpha) or alpha blending,
// depth test on, depth write off, after opaque objects, sorted far to near; texture colour only (no tint)
export class EffectRenderer { constructor(scene: Scene, textures: (key: string) => Texture | null); draw(list: EffectDraw[], at: Vec3, camera: Camera): void; dispose(): void }
// client
export interface EffectRequest { xi: number; pos: Vec3; followId?: number; fixed?: boolean; angle?: number; scale?: number }
export class EffectManager {
  constructor(data: GameData, load: (key: string) => Promise<WebEffect>, renderer: EffectRenderer, random: EffectRandom);
  play(request: EffectRequest): void;     // unknown XI or missing file: skipped, error reported once
  step(find: (objectId: number) => { pos: Vec3 } | undefined): void;   // 60 Hz
  draw(camera: Camera): void;
  count(): number;
}
```

- **Copies:** `CreateSfx` (`_Common/CreateObj.cpp:33-377`); `CSfx::SetSfx`, `Process` and `Render` (`_Common/SfxObj.cpp:77-260`); `CSfxGenNormalDmg01` and `CSfxFixed` (`_Common/Sfx.cpp`): [effects §2.2, §3]. The rules:
  - follow `followId`, else stay put;
  - +0.01 m at creation;
  - +0.2 m when drawn, except the two classes above;
  - the scale is the index entry's;
  - the heading is `-angle`.

- [ ] **Step 1: Write the failing tests.**
  - Manager: `play` of `XI_GEN_LEVEL_UP01` with a follow ID moves with the mover; `XI_HIT_SWORD01` stays put; an effect ends and is dropped; an unknown XI is skipped with one error.
  - Renderer: a GLOW quad gets additive blending and `depthWrite` false.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/effectRenderer.test.ts apps/client/test/effectManager.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): effects by XI id, followed or fixed as Neuz plays them`.

### Task 14: Weapons in the hand

**Files:**
- Create: `packages/scene/src/character/held.ts`
- Modify: `apps/client/src/world/render/looks.ts`, `render/MoverViews.ts`, `apps/client/src/world/WorldScreen.ts` (the own equipment from the lobby entry)
- Test: `packages/scene/test/held.test.ts`, `apps/client/test/looks.test.ts`

**Interfaces:**
- Consumes: `WebItemProp.model` (Task 7), `AssembledCharacter.grips` (Task 9), `WornPart` (Piece 3), the lobby's `equipment` item IDs.
- Produces: `attachHeld(character: AssembledCharacter, item: Object3D, slot: 'right' | 'left' | 'shield'): void`. `MoverLook` gains `held: { right: number | null; left: number | null }` (item IDs). Own: from the entry's equipment, each item's slot from `dwParts` (`PARTS_RWEAPON`, `PARTS_LWEAPON`, `PARTS_SHIELD`). Others: from their worn parts.
- **Copies:** how `CModelObject` renders a weapon part at the hand bone with `m_mLocalRH`, `m_mLocalShield`, `m_mLocalLH` (`_Common/ModelObject.cpp`, `GetHandPos`, `CMover::UpdateParts` in `_Common/MoverEquip.cpp`). The task finds the exact lines and composes the matrices the same way.

- [ ] **Step 1: Write the failing tests.**
  - `the Wooden Sword sits at the right hand`: a male body with the sword. The sword's world origin equals the right-hand bone's world matrix times `localRH`, within 1e-4.
  - A shield goes to the shield grip.
  - The own look takes item 21 into `held.right`.
- [ ] **Step 2: Run** `npx vitest run packages/scene/test/held.test.ts apps/client/test/looks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): equipped weapons and shields in the hand`.

### Task 15: The formulas

**Files:**
- Create: `apps/client/src/world/sim/params.ts`
- Test: `apps/client/test/params.test.ts`

**Interfaces:**
- Consumes: `JobProp`, `WebItemProp`, the exp catalog (Task 7).
- Produces:

```ts
export interface Stats { str: number; sta: number; dex: number; int: number }
export interface Equipped { weapon: WebItemProp | null /* null = fists row */; armour: WebItemProp[] }
export function maxHitPoint(job: JobProp, level: number, s: Stats): number;
export function maxManaPoint(job: JobProp, level: number, s: Stats): number;
export function maxFatiguePoint(job: JobProp, level: number, s: Stats): number;
export function monsterMaxHitPoint(addHp: number, ratePercent: number): number;     // MONSTERPROP percent, 100 when none
export function expNeeded(exp: readonly ExpRow[], level: number): bigint;           // GetMaxExp1
export function expPercentText(exp: bigint, needed: bigint): string;                // "%.2f%%", capped at 99.99
export function attackSpeed(job: JobProp, weaponSpeed: number, level: number, dex: number): { a: number; speed: number; shown: number };
export function attackShown(job: JobProp, level: number, s: Stats, eq: Equipped): number;   // RenderATK
export function defenceShown(job: JobProp, level: number, s: Stats, eq: Equipped): number;  // GetShowDefense
export function criticalShown(job: JobProp, s: Stats): number;                              // GetCriticalProb
```

- **Copies:** `GetMaxOriginHitPoint` / `ManaPoint` / `FatiguePoint` (`_Common/MoverParam.cpp:2788-2937`), `GetExpPercent` and the window's EXP text ([stats §5.1]), `GetAttackSpeed` (`_Common/MoverAttack.cpp:159-200`), `GetHitMinMax` / `GetWeaponATK` (`:374-480`) with the held weapon's branch, `RenderATK` (`_Interface/WndField.cpp:4057-4110`), `CalcDefenseCore` (`MoverAttack.cpp:576-600`) with `GetDefenseByItem` (`:217-224`, armour abilities via `UpdateParam`), `GetCriticalProb` (`:612-650`): [stats §1.2, §3.3]. Item destination params are added through `GetParam` where the C++ does.

- [ ] **Step 1: Write the failing tests** with the reference table's numbers:
  - max HP/MP/FP at levels 1, 2, 8, 15, plus the STA 45 and INT 20 cases;
  - the three attack-speed cases (`a`, `speed` with `toBe(Math.fround(…))`, `shown`);
  - naked ATK/DEF/Critical at levels 1, 8, 15;
  - `expPercentText(7n, 14n)` is `"50.00%"`, and `expPercentText(13999n, 14000n)` is `"99.99%"`;
  - `monsterMaxHitPoint(120, 100)` is 120.
  - ATK and DEF with the starter equipment: the values the task works out by hand from the cited C++, with the working in the test's comment.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/params.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): Neuz's formulas for HP, MP, FP, EXP, attack speed, ATK, DEF and critical`.

### Task 16: Attack, damage and death states in `ActionMover`

**Files:**
- Modify: `apps/client/src/world/sim/ActionMover.ts`, `sim/constants.ts`, `render/MoverViews.ts` (motion offsets, hit-frame callbacks, pauses)
- Test: `apps/client/test/actionMover.test.ts`, `apps/client/test/moverViews.test.ts`

**Interfaces:**
- Consumes: motion `events` (Task 8), `attackSpeed` (Task 15).
- Produces:
  - `ActionMover.sendActMsg` handles `ATK1..4`, `DIE` (with `DAMAGE` / `DAMAGE_FORCE` / 0) and `MODE_COMBAT`, as `ProcessActMsg1` does.
  - States and flags: `OBJSTA_ATK1..4`, `OBJSTA_DMG`, `OBJSTA_DMG_FLY`, `OBJSTA_DEAD`, `OBJSTAF_COMBAT`.
  - Hooks:
    - `onHit(hitIndex: number): void` (called when a hit frame passes);
    - `onAttackEnd(state: number): void`;
    - `setDamaged(): void` (`SetDamagedMotion`);
    - `pause(ticks: number): void`;
    - `aniSpeed: number`;
    - a queue of busy MELEE_ATTACKs replayed at the end of an attack.
  - The motion ID with the weapon offset: `motionFor(mti, held weapon kind, stateFlag)`.
- **Copies:**
  - `ProcessActMsg1` ATK1..4 and DIE (`_AIInterface/ActionMoverMsg.cpp:596-704, 842-1003`);
  - `_ProcessStateAttack` (`ActionMoverState.cpp:800-850, 1080-1100`);
  - `SetDamagedMotion` (`MoverAttack.cpp:2016-2064`);
  - the dead state (`ActionMoverState.cpp:531-581`);
  - `CMover::SetMotion` offsets (`Mover.cpp:4817-4977`);
  - `ProcessAniSpeed` (`Mover.cpp:3084-3143`);
  - `CAction::OnEndAttackState` (`_AIInterface/Action.cpp:56-135`).

  [combat §2.4-2.6, §4, §5.1].

- [ ] **Step 1: Write the failing tests.**
  - ATK1 sets `OBJSTA_ATK1`, the combat flag and motion 223 for a one-handed sword.
  - On the 17-frame ATK1 at the fists' speed `Math.fround(0.8416128754615784)` (0.5 frames per tick times the speed), the hit fires on tick 29 and the swing ends on tick 39 ([combat §2.5]).
  - With the 5-tick hit pause, it ends on tick 44.
  - A busy mover queues a second ATK and plays it at the end.
  - `setDamaged` is refused while attacking.
  - DIE holds `MTI_DIE1` on its last frame, and `DAMAGE_FORCE` plays the flight.
  - A monster keeps animation speed 1.0.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/actionMover.test.ts apps/client/test/moverViews.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): attack, damage and death states copied from CActionMover`.

### Task 17: Box picking and the focus

**Files:**
- Create: `apps/client/src/world/combat/focus.ts`
- Modify: `apps/client/src/world/render/picking.ts`, `apps/client/src/world/ownMover.ts` (`pickOnStage`), `apps/client/src/world/WorldSession.ts` (`sendSetTarget`)
- Test: `apps/client/test/focus.test.ts`, `apps/client/test/pick.test.ts`

**Interfaces:**
- Consumes: `AssembledCharacter.box()` (Task 9), `encodeSetTarget` (Task 2).
- Produces:

```ts
export function pickMover(orig: Vec3, dir: Vec3, candidates: Array<{ objectId: number; box: { min: Vec3; max: Vec3 }; world: number[] /* D3D world matrix */; dead: boolean; isPlayer: boolean }>, farPlane: number): number | null;
export class Focus {
  constructor(session: Pick<WorldSession, 'sendSetTarget'>);
  readonly targetId: number | null;
  select(objectId: number | null): void;     // SetObjFocus: releases the old with 1, focuses with 2, or clears
  next: number | null;                       // m_pNextTargetObj
  onRemoved(objectId: number): void;         // DEL_OBJ or death: clears, takes `next`
}
// WorldSession gains sendSetTarget(targetId: number, clear: 1 | 2): void, and sendDestObj, sendMeleeAttack,
// sendGetDestObj, sendRevivalToLodestar, sendModifyStatus with Task 2's arguments
```

- **Copies:** `CWorld::PickObject_Fast` (`_Common/World3D.cpp:2655-2733`), `CObj::Pick` / `CModel::IntersectBB` (`_Common/Obj.cpp:752-762`, `_Common/Model.cpp:104-144`), `CWndWorld::PickObj` / `SelectObj` (`_Interface/WndWorld.cpp:6299-6386`), `CWorld::SetObjFocus` (`_Common/World.cpp:253-359`): [combat §1].

- [ ] **Step 1: Write the failing tests.**
  - Two boxes on the ray: the nearer **by origin** wins, even when the farther one's box is hit nearer.
  - A dead monster is skipped, a dead player isn't.
  - A rotated, scaled box is hit by its oriented faces.
  - The focus sends `(old, 1)` then `(new, 2)`, and clearing sends `(0xffffffff, 2)`.
  - `onRemoved` of the target takes `next`.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/focus.test.ts apps/client/test/pick.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** A tap or click that picks a mover selects it. One that picks none walks there (Piece 3).
- [ ] **Step 4: Run** the same commands and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): box picking and the focus with SETTARGET`.

### Task 18: The own character's state

**Files:**
- Create: `apps/client/src/world/OwnState.ts`
- Test: `apps/client/test/ownState.test.ts`

**Interfaces:**
- Consumes: `OwnCharacter` (Tasks 3-4), `TaskBar` (Task 5), the formulas (Task 15), the combat messages (Task 1).
- Produces:

```ts
export class OwnState {
  constructor(data: GameData, added: AddedMover, equipment: number[] /* lobby item IDs */);
  readonly level: number; readonly job: number; stats: Stats; remainGP: number;
  hp: number; mp: number; fp: number; exp: bigint; skillPoint: number; skills: SkillSlot[];
  inventory: Map<number, InventoryItem> | null; taskBar: TaskBar | null; equipped: Equipped;
  maxHp(): number; maxMp(): number; maxFp(): number; expText(): string; attackSpeed(): number /* the held weapon's fAttackSpeed */;
  /** Applies one own message; returns what the screen should play. */
  apply(message: WorldMessage): OwnEvent[];
}
export type OwnEvent = { kind: 'levelUp'; from: number; to: number } | { kind: 'patternUp'; level: 2 | 8 | 12 } | { kind: 'refilled' } | { kind: 'statsChanged' } | { kind: 'died' } | { kind: 'revived' };
```

- **Copies:** `CMover::SetExperience` (`_Common/MoverParam.cpp:1709-1900`), `OnSetExperience` (`Neuz/DPClient.cpp:3376-3430`), `OnSetState` (`:13514-13524`, which shows full bars), `OnSetGrowthLearningPoint`, `OnRevivalLodestar` (`:3484-3513`): [stats §2.2, §4.2]. The level-up refill uses the formulas. A Vagrant at 15 keeps EXP at 0.

- [ ] **Step 1: Write the failing tests.**
  - The new character's state: 230/63/32 max, EXP text `"0.00%"`, attack speed `Math.fround(0.085)`.
  - SETEXPERIENCE to level 2 gives one `levelUp`, a `patternUp` 2 and a refill to 230/63/32.
  - `a two-level jump plays one level up` (Review Focus 4): 3 → 5 gives one `levelUp` from 3 to 5 and a refill to level 5's max (234/65/34).
  - SETSTATE sets the stats and refills.
  - SETPOINTPARAM HP clamps to the max.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/ownState.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the own character's numbers, points, inventory counts and task bar`.

### Task 19: The own attack loop

**Files:**
- Create: `apps/client/src/world/combat/attackLoop.ts`
- Modify: `apps/client/src/world/ownMover.ts`, `apps/client/src/world/controls.ts`
- Test: `apps/client/test/attackLoop.test.ts`, `apps/client/test/controls.test.ts`

**Interfaces:**
- Consumes: `Focus` (Task 17), `ActionMover` states (Task 16), `OwnState.attackSpeed()` (Task 18), Piece 3's `setDestObj`, `stepMover` and `IsRangeObj` radius.
- Produces:

```ts
export class AttackLoop {
  constructor(session: Pick<WorldSession, 'sendDestObj' | 'sendMeleeAttack' | 'sendGetDestObj' | 'sendBehavior'>, focus: Focus, own: () => OwnState);
  readonly autoAttack: boolean;
  /** A tap or click on a mover: the first selects, the second (or a double click) attacks. */
  onMoverPressed(objectId: number, now: number, double: boolean): void;
  onMoverHeld(objectId: number, heldMs: number): void;   // 500 ms on a newly selected target attacks
  attackButton(): void;                                   // touch: attacks the selected target
  /** Movement input, a ground tap, death, or the target gone: as Neuz stops it. */
  stop(reason: 'move' | 'ground' | 'died' | 'target'): void;
  /** One rules step for the own mover: approach, swing, combo. */
  step(own: Mover, find: (id: number) => Mover | undefined): void;
  onQueryGetDestObj(fromId: number): void;
}
// controls: X toggles the walk flag and sends PLAYERBEHAVIOR; Shift no longer changes the gait (§1)
```

- **Copies:**
  - `CWndWorld::Process`'s attack branch (`_Interface/WndWorld.cpp:8500-8561`);
  - `UseFocusObj` (`:6197-6266`);
  - `IsAttackAble` / `IsAttackAbleNPC` (`_Common/Mover.cpp:6469-6626`);
  - `CMD_SetMeleeAttack` (`_Common/MoverMsg.cpp:427-454`);
  - `SetDestObj` (`:47-84`);
  - `ProcessMoveArrival` (`_Common/MoverMove.cpp:73-262`);
  - `DoAttackMelee` (`_Common/MoverSkill.cpp:3436-3488`);
  - the combo in `_ProcessStateAttack` (`ActionMoverState.cpp:804-841`);
  - the stop rules ([combat §2.6]);
  - the walk toggle (`_Interface/WndWorldControlPlayer.cpp:515-545`).

- [ ] **Step 1: Write the failing tests** (fake session and clock):
  - Tap once: only selects. Tap again: PLAYERSETDESTOBJ(target, 0), the walk, then on arrival MELEE_ATTACK(29, target, 0.085).
  - At level 1 the next swing restarts with PLAYERSETDESTOBJ. At level 2 the end of ATK1 sends ATK2 (30) with no PLAYERSETDESTOBJ. At level 12 the chain reaches ATK4, then ATK1 again.
  - Holding 500 ms on a new target attacks.
  - A movement key stops it.
  - `a DEL_OBJ mid-approach stops the loop` (Review Focus 1): no MELEE_ATTACK after the DEL_OBJ, and the focus is null.
  - `pressing attack ten times sends one approach` (Review Focus 2).
  - A peaceful NPC is never attacked.
  - QUERYGETDESTOBJ is answered while a target is set.
  - Controls: X toggles walk and sends one PLAYERBEHAVIOR; Shift with W runs as W does.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/attackLoop.test.ts apps/client/test/controls.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the own auto-attack loop and combo, and X toggles walking`.

### Task 20: Applying combat messages to the world

**Files:**
- Modify: `apps/client/src/world/WorldState.ts`, `apps/client/src/world/WorldSession.ts` (routing own messages to `OwnState`)
- Test: `apps/client/test/worldState.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 15, 16, 18.
- Produces:

```ts
// WorldChanges gains combat: CombatEvent[] and own: OwnEvent[]
export type CombatEvent =
  | { kind: 'hit'; victimId: number; attackerId: number; hit: number; flags: number }       // from DAMAGE
  | { kind: 'death'; victimId: number; attackerId: number; lastHp: number }
  | { kind: 'swing'; attackerId: number; targetId: number }                                   // another mover's MELEE_ATTACK
  | { kind: 'attackerHit'; attackerId: number; victimId: number; weapon: number | null }      // an attack's hit frame (spark, flinch)
  | { kind: 'levelUp'; moverId: number }                                                     // SETLEVEL of another player
  | { kind: 'text'; textId: number; args: string }
  | { kind: 'spawned'; moverId: number };                                                    // a monster added within 32 m
// Mover gains hp: number, level: number, maxHp: number (monsters: dwAddHp × MONSTERPROP rate)
```

- **Copies:** `OnDamage` (`Neuz/DPClient.cpp:1758-1934`: HP minus damage, at least 1, the flying hit), `OnMoverDeath` (`:1936-2090`), `OnMeleeAttack` (`:3802-3815`), `OnCorrReq` (`:10015`), `OnSetLevel` (`:3339`), `OnMonsterProp` (`:6630`), `OnDamageMsgC` for the attacker's hit frame (`_AIInterface/ActionMoverDmg.cpp:54-122`), the spawn rule (`DPClient.cpp:1136-1138, 1226`).

- [ ] **Step 1: Write the failing tests.**
  - DAMAGE lowers HP and emits `hit`, and the following SETPOINTPARAM sets it.
  - MOVERDEATH emits `death` with the last HP and sets the dead state.
  - `DAMAGE after DEL_OBJ is ignored` (Review Focus 3).
  - A DAMAGE in the same bundle after the mover's ADD_OBJ applies.
  - Another mover's MELEE_ATTACK plays its swing facing the target.
  - MONSTERPROP 150% sets the Aibatt's max HP to 180.
  - A monster added 20 m away emits `spawned`, and one 40 m away doesn't.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/worldState.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): damage, death, swings and levels applied to the movers in view`.

### Task 21: Damage numbers, target corners and hit effects on screen

**Files:**
- Create: `apps/client/src/world/render/DamageNumbers.ts`, `render/TargetMarks.ts`
- Modify: `apps/client/src/world/WorldScreen.ts` (wiring `CombatEvent`s and `OwnEvent`s to effects, numbers and motions)
- Test: `apps/client/test/damageNumbers.test.ts`, `apps/client/test/targetMarks.test.ts`

**Interfaces:**
- Consumes: `WebUiSheets` (Task 11), `EffectManager` (Task 13), the events (Task 20).
- Produces:
  - `DamageNumbers.add(worldPos: Vec3, value: number, ownHurt: boolean): void`, `step(): void`, `draw(project: (p: Vec3) => { x: number; y: number } | null): void` (DOM layer, like `NameTagLayer`).
  - `TargetMarks.show(rect: { left; top; right; bottom } | null, attacking: boolean): void`.
  - `WorldScreen` plays:
    - the flag order of [combat §4.1] (block, parry, resist, miss, critical, number) for `hit` events where the own player is a party;
    - the hit spark and flinch for `attackerHit`;
    - the death number;
    - `XI_GEN_LEVEL_UP01` and `MTI_LEVELUP` for level ups;
    - `XI_GEN_MONSTER_SPAWN01` for `spawned`.
- **Copies:** `CDamageNum::Process` / `Render` (`_Common/2DRender.cpp:1855-2002`), `CWndWorld::RenderFocusObj` / `GetBoundRect` (`_Interface/WndWorld.cpp:2661-2714, 3080-3165`).

- [ ] **Step 1: Write the failing tests.**
  - Number `123` for the own player uses glyphs 1, 2, 3. For a monster it uses 15, 16, 17, advanced 12.5 px, centred.
  - The y path over 50 ticks matches the values table, and the number is gone at tick 51.
  - A point behind the camera isn't drawn and doesn't age.
  - The corners sit 32 px outside the rect: white cells when selected, red when attacking.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/damageNumbers.test.ts apps/client/test/targetMarks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and wire the events in `WorldScreen`.
- [ ] **Step 4: Run** the same commands and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): damage numbers, target corners and hit, critical, miss and level-up effects`.

### Task 22: The window frame, status window, target bar and server messages

**Files:**
- Create: `apps/client/src/world/hud/frame.ts`, `hud/statusWindow.ts`, `hud/targetBar.ts`, `hud/messages.ts`
- Modify: `apps/client/src/style.css`, `apps/client/src/world/WorldScreen.ts`, `tools/convert/src/ui/uiStage.ts` (only if more theme files are needed)
- Test: `apps/client/test/hud.test.ts` (create; jsdom like the lobby views' tests)

**Interfaces:**
- Consumes: `OwnState` (Task 18), the movers (Task 20), texts and UI art (Tasks 7, 11).
- Produces:

```ts
export interface UiArt { url(key: string): string /* AssetStore URL of a ui/*.png */; sheets: WebUiSheets }
export function formatDefinedText(texts: Texts, textId: number, args: string): { text: string; color: number };  // OnDefinedText: the TID's text with the string's tokens
export class WindowFrame { constructor(title: string, art: UiArt); readonly element: HTMLElement; open(at: { x: number; y: number }): void; close(): void; onClose?: () => void }  // drag by title (pointer events), close button, Escape
export class StatusWindow { constructor(art: UiArt); update(own: OwnState, name: string): void; setPortrait(canvas: HTMLCanvasElement): void; toggle(): void }
export class TargetBar { update(target: Mover | null, ownLevel: number, texts: Texts): void }
export class MessageLines { add(text: string, color: number): void; step(nowMs: number): void }   // a few lines that fade
export class Caption { show(text: string): void }                                                // the level-up caption
```

- **Copies:**
  - the status window (`CWndStatus`, `_Interface/WndField.cpp:10299-10631`: bars and texts, [combat §4.3], [stats §5.1]);
  - the target bar (`CWndWorld::RenderSelectObj`, `WndWorld.cpp:2716-2931`: text `"%s <Lvl %d>"`, colours, level arrows, shown for non-peaceful movers and players);
  - the window frame from the theme art (`CWndBase`'s tiles; the task finds which files and how they tile).
- The portrait is a small Three.js render of the own head, made on entering (and when the look changes), not every frame.

- [ ] **Step 1: Write the failing tests.**
  - The status window shows `230 / 230`, `63 / 63`, `32 / 32` and `0.00%` for the new character, with the HP bar's width at `trunc(width × hp / max)`.
  - The target bar shows `Aibatt <Lvl 1>` in `0xffffffa0`, and an aggressive monster in red.
  - The level arrows: a monster 6 levels up shows `LvUp2`.
  - No bar for a peaceful NPC.
  - A frame drags by its title and closes with Escape.
  - Message lines fade and drop after their time.
  - `formatDefinedText` of `TID_GAME_PRIORITYMOB` gives its text and colour. A text with `%s` tokens takes them from the string, as `OnDefinedText` does (`Neuz/DPClient.cpp:4117-4228`).
  - The world's `text` events go to the message lines.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/hud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, laid out like the owner's screenshots: status top left, target bar top centre.
- [ ] **Step 4: Run** the same command and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the status window, target bar, server messages and window frame in Neuz's look`.

### Task 23: The task bar, attack button and keys

**Files:**
- Create: `apps/client/src/world/hud/taskBar.ts`, `hud/attackButton.ts`
- Modify: `apps/client/src/world/WorldScreen.ts` (Start menu, "Log out" replacing Leave), `apps/client/src/style.css`, the e2e tests that click Leave (`apps/client/e2e/world.spec.ts`)
- Test: `apps/client/test/hud.test.ts`

**Interfaces:**
- Consumes: `OwnState.taskBar`, `.inventory`, `GameData.itemProps` (icons), `AttackLoop.attackButton` (Task 19).
- Produces:

```ts
export class TaskBar {
  constructor(art: UiArt, actions: { open(window: 'character' | 'status' | 'skills'): void; logOut(): void; useSlot(bar: number, slot: number): void; useActionSlot(): void });
  update(own: OwnState, data: GameData): void;  // item shortcuts: the item's icon and count, greyed (Piece 5); skill: its icon (usable from M2);
                                                // applets: their icon; every other kind (motion, chat, ...): a plain greyed slot
  readonly bar: number;                          // keys 1-8 and the arrows switch it
}
export class AttackButton { constructor(onPress: () => void); update(enabled: boolean): void }   // touch devices only
// keys: H Character window, T status window, F1-F9 the current bar's slots, 1-8 the bar, C the action slot (M2), Escape closes the top window
```

- **Copies:**
  - `CWndTaskBar` (`_Interface/WndTaskBar.cpp`): the layout, the applet count by width (5 / 10 / 18), the slots, the bar number, keys F1-F9 and 1-8.
  - `CWndMgr::AddAllApplet` (`_Interface/FuncApplet.cpp:178-260`): the applet ID → icon file and hotkey table, copied as a constant. An applet whose window exists in Piece 4 opens it; the rest do nothing.

  [skills §5.1, §5.5-5.6].

- [ ] **Step 1: Write the failing tests.**
  - The new character's bar shows the lollipop (count 3) and the biscuit (count 1) greyed in slots 0-1, plain greyed slots for the motions in slots 2 and 8, and the four applets' icons.
  - Key 2 switches to bar 2.
  - The Start menu's "Log out" leaves as Leave did.
  - The attack button is disabled with no target and enabled with an Aibatt selected.
  - With `inventory: null` the item slots are plain greyed slots.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/hud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update the e2e tests' Leave clicks to the Start menu.
- [ ] **Step 4: Run** the same command, `npm test` and `npm run test:e2e:client`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the task bar, Start menu, attack button and keys`.

### Task 24: The revive window and the Character window

**Files:**
- Create: `apps/client/src/world/hud/reviveWindow.ts`, `hud/characterWindow.ts`
- Modify: `apps/client/src/world/WorldScreen.ts`
- Test: `apps/client/test/hud.test.ts`

**Interfaces:**
- Consumes: `OwnState`, the formulas, `WorldSession.sendRevivalToLodestar`, `sendModifyStatus` (Tasks 15, 17, 18).
- Produces:
  - `ReviveWindow.open(): void`. **Lodestar** sends REVIVAL_TO_LODESTAR and closes. **Revive here** is greyed.
  - `CharacterWindow.update(own, entry)`: counters per stat; **+** and **−**; the preview; **Apply** → confirm → `sendModifyStatus`; **Reset**.
- **Copies:**
  - `CWndRevival` (`_Interface/WndField.cpp:12147-12345`);
  - `CWndCharInfo::OnDraw`, `OnChildNotify`, `Process` and `GetVirtual*` (`WndField.cpp:3012-4056`);
  - `CWndStateConfirm` (`:4395-4560`): [stats §3.2-3.4].

  The labels and confirm text come from the texts catalog (`TID_GAME_CHARSTATUS_APPLY_Q`, `TID_DIAG_0082`).

- [ ] **Step 1: Write the failing tests.**
  - The death event opens the revive window, shows `TID_GAME_DEATH` as a server message and stops auto-attack. Lodestar sends one REVIVAL_TO_LODESTAR.
  - With 4 points: + on STR twice and STA twice makes Stat Points 0 and disables every +; the preview's ATK differs, drawn red.
  - Apply → Yes sends MODIFY_STATUS(2, 2, 0, 0) and zeroes the counters; No keeps them.
  - SETSTATE updates the shown stats.
  - Server, Channel and Name come from the lobby entry.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/hud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the revive window and the Character window with stat points`.

### Task 25: Landscape

**Files:**
- Create: `apps/client/src/landscape.ts`
- Modify: `apps/client/src/main.ts`, `apps/client/src/lobby/LobbyApp.ts` (the first login tap), `apps/client/src/style.css` (landscape layouts of every lobby view and the world)
- Test: `apps/client/test/landscape.test.ts`, `apps/client/e2e/landscape.spec.ts` (create)

**Interfaces:**
- Produces: `installLandscape(root: HTMLElement, isTouch: () => boolean): { requestLock(): Promise<void>; dispose(): void }`.
  - The cover shows while `innerHeight > innerWidth`, with the exact texts of the texts table.
  - `requestLock` calls `requestFullscreen` and then `screen.orientation.lock('landscape')`, and swallows refusals.
  - Nothing behind the cover is paused.

- [ ] **Step 1: Write the failing tests.**
  - Unit: the cover toggles with the size; a lock that rejects doesn't throw; the touch text is used when `isTouch()`.
  - e2e (Chromium, a 390×844 viewport, then 844×390): the cover shows over the login form, then hides.
  - `turning upright mid-fight keeps attacking` (Review Focus 5): with the pretend server sending DAMAGE while the viewport is upright, turning back shows the target's lowered HP and the loop still running.
  - Every lobby view and the world fit 844×390 with no scroll.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/landscape.test.ts` and `npm run test:e2e:client -- landscape`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the lobby's landscape layouts.
- [ ] **Step 4: Run** the same commands and the whole `npm run test:e2e:client`. Expected: PASS. Update the lobby picture baselines.
- [ ] **Step 5: Commit** `feat(client): landscape for the whole game`.

### Task 26: Fighting against the pretend server

**Files:**
- Create: `apps/client/e2e/fight.spec.ts`
- Modify: `packages/testkit/src/worldScript.ts` (a script can answer a client packet with messages), `apps/client/e2e/world.spec.ts` (the Flaris baseline)
- Test: the spec itself

**Interfaces:**
- Consumes: every M1 task. The testkit writers (Tasks 1, 3-5).
- Produces: `WorldScript` gains `on(packet: WorldPacket['type'], reply: (p: WorldPacket) => ScriptMessage[]): void`.

- [ ] **Step 1: Write the tests** (Chromium and WebKit):
  - Enter with the new character and an Aibatt 5 m away. Tap it twice, and the script answers MELEE_ATTACK with DAMAGE(10), then a critical (flags 0xC1), then a miss (0x2). The screen shows the numbers and effects (via `testHooks` counts), and the target bar's HP drops.
  - A kill sends SETEXPERIENCE level 2 and MOVERDEATH: the death motion, the level-up effect and caption, the status bar at the new max.
  - A monster's MELEE_ATTACK and DAMAGE on the player: its swing and an own-hurt number.
  - Own death: the revive window opens; Lodestar sends REVIVAL_TO_LODESTAR; the script's SETPOINTPARAM and SETPOS put the player at the lodestar.
  - Stat points: Apply sends MODIFY_STATUS, and SETSTATE updates the window.
  - Pictures: a fight scene with the status window, target bar, corners, one number and one effect, and the Character window. Replace Piece 3's Flaris baseline (§5).
- [ ] **Step 2: Run** `npm run test:e2e:client -- fight`. Expected: PASS after the fixes this run turns up. A failing assertion that shows a bug in an earlier task is fixed in that task's files, with its own commit.
- [ ] **Step 3: Commit** `test(client): fighting, dying, levelling and stats against the pretend world server`.

### Task 27: The live fight test

**Files:**
- Modify: `apps/client/test/world.live.test.ts`, `apps/client/test/helpers/*` as needed, `apps/client/test/live.config.example.json` (its comment)
- Test: the live test itself (run by the owner in the VM)

**Interfaces:**
- Consumes: the session's new senders, `OwnState`, `AttackLoop` (Tasks 17-20).
- Produces, as a new leg of `world.live.test.ts`, run after the existing legs:
  - The first account checks that its inventory was read: the starter food's item IDs 2800 and 2801 with counts.
  - It sends DESTPOS to an Aibatt spot outside Flaris's gate (the task reads the respawn region from `Resource/World/WdMadrigal`) and waits for arrival.
  - It selects the nearest `MI_AIBATT*` and attacks with `AttackLoop` until MOVERDEATH, at most 60 s.
- **Fails** on:
  - any `TID_GAME_MODIFY_ATTACK_SPEED` or `TID_GAME_PRIORITYMOB` text (retry another Aibatt once for the latter);
  - no DAMAGE within 3 s of a swing;
  - EXP not rising after the kill;
  - any bundle mismatch.

- [ ] **Step 1: Write the leg** and its config comment.
- [ ] **Step 2: Run** `npx vitest run --config vitest.live.config.ts world.live -t "fight"` with no `live.config.json`. Expected: SKIPPED with the config message. The real run needs the servers, so it's the owner's in Task 28.
- [ ] **Step 3: Commit** `test(client): a live kill of an Aibatt on the real servers`.

### Task 28: Docs and the milestone 1 checkpoint (owner, no subagent)

**Files:**
- Modify: `README.md`, `docs/device-testing.md` (a "Piece 4, milestone 1" checklist; landscape for every checklist), `docs/conversion-baseline.md`, `docs/servers-in-a-vm.md` (copying `dist/assets` again)

- [ ] **Step 1: Write the docs.** The device checklist covers:
  - select and attack; the combo at levels 1, 2 and 8; numbers, critical and miss effects;
  - being hit; dying and the lodestar; level up with its effect; Apply on stat points;
  - the sword in the hand; the turn-sideways cover;
  - the fps in a fight with 5+ monsters, against 30 fps.
- [ ] **Step 2: Run** every suite: `npm test`, `npm run typecheck`, `npm run test:corpus`, `npm run test:e2e`, `npm run test:e2e:client`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: Piece 4 milestone 1 (README, device checklist, baseline)`.
- [ ] **Step 4: Owner checkpoint.** The owner copies the FlyffWeb folder (with the new `dist/assets`) into the VM, runs `npm run test:live:world` there (expected: PASS), and runs the device checklist. Milestone 2 starts only after the owner says milestone 1 works.

---

# Milestone 2: skills

### Task 29: Skill messages and packets

**Files:**
- Create: `packages/protocol/src/world/skills.ts`
- Modify: `world/types.ts`, `world/readers.ts`, `world/taskBar.ts` (edit writers), `messages/world.ts`, `constants.ts`, `packages/testkit/src/world.ts`
- Test: `packages/protocol/test/skillMessages.test.ts`, `packages/protocol/test/worldPackets.test.ts`

**Interfaces:**
- Produces:

```ts
| { type: 'useSkill'; skill: number; level: number; targetId: number; useType: number; castingTime: number }
| { type: 'clearUseSkill' } | { type: 'doUseSkillPoint'; skills: SkillSlot[]; skillPoint: number }
| { type: 'initSkillPoint'; skillPoint: number } | { type: 'setActionPoint'; actionPoint: number } | { type: 'endSkillQueue' }
| { type: 'createSfxObj'; sfxId: number; pos: Vec3; flag: number }
export function encodeUseSkill(index: number, targetId: number, useType: 0 | 1, control?: boolean): Uint8Array;   // wType 0
export function encodeDoUseSkillPoint(skills: SkillSlot[]): Uint8Array;                                         // 45 pairs
export function encodeAddItemTaskBar(bar: number, slot: number, s: Shortcut): Uint8Array;
export function encodeRemoveItemTaskBar(bar: number, slot: number): Uint8Array;
export function encodeSkillTaskBar(queue: (Shortcut | null)[]): Uint8Array;   // always 5 entries; null = empty shortcut
export function encodeEndSkillQueue(): Uint8Array;
// testkit: writeUseSkill, writeClearUseSkill, writeDoUseSkillPoint, writeInitSkillPoint, writeSetActionPoint, writeEndSkillQueue, writeCreateSfxObj
```

- **Copies:** [skills §2.2, §3.2, §4.2, §4.5-4.6, §5.3], `CDPClient::SendUseSkill` (`Neuz/DPClient.cpp:9855`), `SendDoUseSkillPoint` (`:9710`), `SendSkillTaskBar` (`:10972`), the item task-bar senders (`:11014`), `OnCreateSfxObj` (`:4038`).

- [ ] **Step 1: Write the failing tests.**
  - Each reader decodes its bytes.
  - `encodeUseSkill(0, 7, 0)` is 24 bytes.
  - `encodeSkillTaskBar` always writes count 5.
  - Every testkit writer round-trips.
- [ ] **Step 2: Run** `npx vitest run packages/protocol/test/skillMessages.test.ts packages/protocol/test/worldPackets.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): skill messages and the packets that use skills and edit the task bar`.

### Task 30: The skills catalog

**Files:**
- Create: `packages/formats/src/inc/propSkillAdd.ts`
- Modify: `packages/formats/src/inc/propItem.ts` (read `propSkill.txt` with the same columns), `web/gameData.ts`, `tools/convert/src/data/gameDataStage.ts`, `apps/client/src/world/gameData.ts`
- Test: `packages/formats/test/gameTables.test.ts`, `tools/convert/test/gameData.corpus.test.ts`

**Interfaces:**
- Produces:

```ts
export interface WebSkill { id: number; name: string; description: string; jobType: number; job: number; handed: number;
  attackRange: number; reqLevel: number; reqSkills: Array<{ skill: number; level: number }>; useMotion: number;
  sfxHit: number; exeTarget: number; useChance: number; skillType: number; evildoing: number; maxLevel: number;
  comboStyle: number; icon: string | null; levels: Array<{ reqMp: number; reqFp: number; cooldown: number; skillCount: number }> }
// data/skills.json: WebSkill[] (every job skill, JTYPE_COMMON rows left out); GameData.skills: Map<number, WebSkill>
```

- **Copies:** `CProject::LoadSkill` (`_Common/Project.cpp:364-399`), `LoadPropAddSkill` (`:2522-2611`), [skills §1.1-1.7].

- [ ] **Step 1: Write the failing tests.**
  - Corpus: Clean Hit is level 3, no prerequisite, max 10, `CT_STEP`, `XI_SKILL_VAG_ONE_CLEANHIT01`, motion 1000, `AR_SHORT`, with FP 5 at levels 1-4 and 8 at 5-8.
  - Flurry needs Clean Hit 3 and is `CT_CIRCLE`.
  - Over Cut needs Flurry 3 and is `CT_FINISH`.
  - No `SI_GEN_*` row is in the list.
- [ ] **Step 2: Run** `npx vitest run packages/formats/test/gameTables.test.ts` and `npm run test:corpus -- gameData`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands. Expected: PASS.
- [ ] **Step 5: Commit** `feat(convert): the skills catalog`.

### Task 31: The skill rules

**Files:**
- Create: `apps/client/src/world/skills/skillRules.ts`
- Test: `apps/client/test/skillRules.test.ts`

**Interfaces:**
- Produces:

```ts
export function checkSkill(skill: WebSkill, level: number, levels: (skillId: number) => number): boolean;          // CMover::CheckSkill
export class SkillPlan {       // CWndSkillTreeEx's local copy
  constructor(skills: SkillSlot[], skillPoint: number, catalog: Map<number, WebSkill>, characterLevel: number);
  plus(index: number): boolean; minus(index: number): boolean; reset(): void;
  readonly points: number; readonly changed: boolean; result(): SkillSlot[];   // the player's skill IDs with the new levels
}
export function canPlaceOnBar(skill: WebSkill, level: number): boolean;                                           // CT_STEP / CT_GENERAL, level > 0
export function canPlaceInQueue(queue: (WebSkill | null)[], at: number, skill: WebSkill, level: number): boolean;  // CheckAddSkill
```

- **Copies:** `CMover::CheckSkill` (`_Common/MoverParam.cpp:117-156`), `CWndSkillTreeEx` (`_Interface/WndField.cpp:6531-6703, 8057-8117`), `CWndTaskBar::SetSkillQueue` / `CheckAddSkill` (`_Interface/WndTaskBar.cpp:1668-1872`), the bar rule (`:1962-2041`): [skills §3.1, §4.11, §5.4].

- [ ] **Step 1: Write the failing tests.**
  - At character level 2, Clean Hit can't be raised. At 3 it can.
  - Flurry needs Clean Hit at 3. Lowering Clean Hit below 3 in the plan resets a planned Flurry (refund).
  - The plan can't go above 10 or below the player's level.
  - `result()` keeps the player's skill IDs.
  - Only Clean Hit passes `canPlaceOnBar`.
  - The queue: Clean Hit first, Flurry twice, Over Cut last; nothing after Over Cut; Flurry not first.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/skillRules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): skill, skill-point and placement rules`.

### Task 32: Using skills

**Files:**
- Create: `apps/client/src/world/skills/skillUse.ts`
- Modify: `apps/client/src/world/sim/ActionMover.ts` (the melee-skill state), `WorldState.ts`, `OwnState.ts`, `WorldSession.ts` (senders), `combat/attackLoop.ts` (auto-attack after a skill)
- Test: `apps/client/test/skillUse.test.ts`, `apps/client/test/actionMover.test.ts`

**Interfaces:**
- Consumes: Tasks 29-31; `Focus`; the motion events.
- Produces:

```ts
export class SkillUse {
  constructor(session: Pick<WorldSession, 'sendUseSkill' | 'sendEndSkillQueue' | 'sendDestObj'>, focus: Focus, own: () => OwnState, now: () => number);
  useSlot(skillIndex: number): void;          // UseSkillShortCut: approach, then USESKILL (SUT_NORMAL)
  useActionSlot(): void;                      // UseSkillQueue: USESKILL of queue[0] (SUT_QUEUESTART)
  groundTapped(): void;                       // ENDSKILLQUEUE while the chain runs
  step(own: Mover, find: (id: number) => Mover | undefined): void;
  onMessage(message: WorldMessage): void;     // USESKILL (own), CLEAR_USESKILL, ENDSKILLQUEUE, SETACTIONPOINT, DOUSESKILLPOINT
  readonly pending: boolean;                  // REQ_USESKILL; cleared by USESKILL, CLEAR_USESKILL or 2000 ms with no answer
}
// WorldSession gains sendUseSkill, sendDoUseSkillPoint, sendAddItemTaskBar, sendRemoveItemTaskBar, sendSkillTaskBar,
// sendEndSkillQueue (Task 29's arguments). OwnState applies DOUSESKILLPOINT (the levels and points), INITSKILLPOINT
// (every non-master/hero level to 0, the points), SETACTIONPOINT and the TASKBAR resent after a reset.
// CREATESFXOBJ plays its XI effect through EffectManager at the given position (absolute when x, y, z aren't all 0,
// else on the message's mover), as OnCreateSfxObj (Neuz/DPClient.cpp:4038-4067).
// ActionMover: MELEESKILL (OBJMSG 37): OBJSTA_ATK_MELEESKILL, motion with MOP_FIXED, ends at 65% of the frames,
// onHit per hit frame with a 4-tick pause; WorldState: USESKILL of any mover starts it; CombatEvent gains
// { kind: 'skillHit'; casterId; targetId; skill } for the effect (CSfxFixed at 1.3 m) and the flinch
```

- **Copies:**
  - `CWndMgr::UseSkillShortCut` (`_Interface/WndManager.cpp:6820-6864`);
  - `CMD_SetUseSkill` (`_Common/MoverMsg.cpp:172-423`);
  - the USESKILL branch of `ProcessMoveArrival` (`_Common/MoverMove.cpp:73-184`: line of sight, the 1 s throttle);
  - `CWndTaskBar::UseSkillQueue` (`_Interface/WndTaskBar.cpp:2214-2272`);
  - `OnUseSkill` (`Neuz/DPClient.cpp:3894-3950`);
  - `DoUseSkill` client branch (`_Common/MoverSkill.cpp:287-1063`);
  - `ProcessStateMeleeSkill` (`_AIInterface/ActionMoverState.cpp:593-679`);
  - `OnMeleeSkill` / `CreateSkillSfx` (`_Common/MoverActEvent.cpp:72-164`, `_Common/Ctrl.cpp:878-997`).

  [skills §4].

- [ ] **Step 1: Write the failing tests.**
  - A bar slot's Clean Hit with an Aibatt 5 m away: PLAYERSETDESTOBJ(target, 2.0), then on arrival USESKILL(index 0, target, 0). No motion until the server's USESKILL. Then motion 1000 with `MOP_FIXED` and a hit at frame 27 emitting `skillHit`.
  - Flurry's three hit frames give three `skillHit`s.
  - CLEAR_USESKILL clears `pending`.
  - No answer for 2000 ms clears `pending`.
  - The action slot sends `SUT_QUEUESTART`, and ENDSKILLQUEUE ends it.
  - A ground tap while running sends ENDSKILLQUEUE.
  - The skill's motion ends at 65% of 51 frames.
  - INITSKILLPOINT sets the three levels to 0 and the points to the value.
  - CREATESFXOBJ with a zero position plays on the message's mover.
- [ ] **Step 2: Run** `npx vitest run apps/client/test/skillUse.test.ts apps/client/test/actionMover.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, with the skill effect played at caster + forward · 1.3 + (0, 1, 0), fixed, angle `-caster angle`.
- [ ] **Step 4: Run** the same commands and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): using skills from the bar and the action slot`.

### Task 33: The skill tree window and task-bar editing

**Files:**
- Create: `apps/client/src/world/hud/skillWindow.ts`
- Modify: `apps/client/src/world/hud/taskBar.ts`, `apps/client/src/world/WorldScreen.ts`, `apps/client/src/style.css`
- Test: `apps/client/test/hud.test.ts`

**Interfaces:**
- Consumes: `SkillPlan`, the placement rules (Task 31), `SkillUse` (Task 32), `WorldSession.sendDoUseSkillPoint`, `sendAddItemTaskBar`, `sendRemoveItemTaskBar`, `sendSkillTaskBar`.
- Produces:
  - **`SkillWindow`** (opened with K, from the Start menu, or from its applet):
    - the Vagrant's three skills with arrows, icons and level digits;
    - a tooltip per skill;
    - **+**, **−**, **Reset** and **Finish**; Finish and closing with changes confirm, then send DOUSESKILLPOINT.
  - **Task bar editing:**
    - drag (mouse) or tap a skill, then a slot (touch), to place it;
    - drag off, or a long press then remove, to take it off;
    - each edit sends the matching packet: the action slot always all 5.
  - **Keys:** F1-F9 use the slot, and C uses the action slot.
- **Copies:** `CWndSkillTreeEx` (`_Interface/WndField.cpp:6649-8393`, [skills §3.1]), `PutToolTip_Skill` (`_Interface/WndManager.cpp:4175-4291`), `CWndTaskBar::OnDropIcon` / `RemoveSkillQueue` (`_Interface/WndTaskBar.cpp:1446-2093`).

- [ ] **Step 1: Write the failing tests.**
  - With 4 points at level 5: + Clean Hit to 3, then + Flurry to 1, and Finish → Yes sends one DOUSESKILLPOINT with levels 3 and 1 and the player's IDs.
  - Closing with changes asks first.
  - Dropping Flurry on a bar slot is refused.
  - Dropping Clean Hit sends ADDITEMTASKBAR(0, 3, the skill shortcut of `[skills §5.1]`).
  - Building the action slot Clean Hit, Flurry, Over Cut sends SKILLTASKBAR with 5 entries.
  - The tooltip shows "FP : 5".
- [ ] **Step 2: Run** `npx vitest run apps/client/test/hud.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(client): the skill tree window and editing the task bar`.

### Task 34: Skills against the pretend server, and the live skill leg

**Files:**
- Create: `apps/client/e2e/skills.spec.ts`
- Modify: `apps/client/test/world.live.test.ts`, `apps/client/test/live.config.example.json`

- [ ] **Step 1: Write the e2e tests** (Chromium and WebKit):
  - **Skill points:** a level-5 character with 4 points raises Clean Hit; the script answers DOUSESKILLPOINT.
  - **The bar:** Clean Hit is put on the bar, and the script sees ADDITEMTASKBAR. Pressing it with an Aibatt selected: the script answers USESKILL and DAMAGE, and the skill's effect plays (via `testHooks`).
  - **The action slot:** Clean Hit, Flurry, Over Cut; C starts it; the script drives the chain with USESKILL `SUT_QUEUEING` and ends with ENDSKILLQUEUE.
  - **A refusal:** "Not enough FP." (DEFINEDTEXT1 `TID_GAME_REQFP`) shows as a server message.
  - **Another player's skill:** its USESKILL plays the motion and effect on them.
- [ ] **Step 2: Write the live leg.** The first account, which must be level 3 or higher with a skill point (the config comment says so):
  1. spends a point on Clean Hit;
  2. puts it on bar 0, slot 3;
  3. uses it on an Aibatt;
  4. expects DOUSESKILLPOINT, USESKILL and a DAMAGE with `AF_MELEESKILL`.

  It skips with a clear message when the character is below level 3.
- [ ] **Step 3: Run** `npm run test:e2e:client -- skills` and `npx vitest run --config vitest.live.config.ts world.live -t "skill"` (expected: SKIPPED without a config). Expected: PASS after the fixes this run turns up, each in its task's files with its own commit.
- [ ] **Step 4: Commit** `test(client): skills against the pretend world server, and a live skill leg`.

### Task 35: Docs and the milestone 2 checkpoint (owner, no subagent)

**Files:**
- Modify: `README.md`, `docs/device-testing.md` (a "Piece 4, milestone 2" checklist), `docs/conversion-baseline.md`

- [ ] **Step 1: Write the docs.** The checklist covers:
  - raising Clean Hit at level 3, putting it on the bar and using it, with the effect;
  - the action slot's full chain at level 10, with each effect;
  - another player's skills, seen from the second device;
  - a refusal (not enough FP).
- [ ] **Step 2: Run** every suite: `npm test`, `npm run typecheck`, `npm run test:corpus`, `npm run test:e2e`, `npm run test:e2e:client`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: Piece 4 milestone 2 (README, device checklist, baseline)`.
- [ ] **Step 4: Owner checkpoint.** The owner copies FlyffWeb into the VM again, runs `npm run test:live:world` with a level-3+ test character (expected: PASS), and runs the device checklist.

# FlyFF Web Client — Piece 4: Combat and Skills — Design Spec

**Date:** 2026-10-24
**Status:** Draft for review
**Builds on:**
- the Piece 3 spec, `docs/superpowers/specs/2026-10-23-piece3-enter-world-design.md`: the world session, the table of
  contents on the world server's bundles (section 3.3), movement and collision (sections 3.6-3.7);
- the Piece 2 spec, `docs/superpowers/specs/2026-10-22-piece2-gateway-protocol-design.md`: browser-only, and the roadmap
  (section 1);
- the Piece 1 spec, `docs/superpowers/specs/2026-10-16-flyff-web-client-design.md` in the bakbak-flyff repository: the
  roadmap (section 4, "Combat + skills") and the viewer's targets (section 7).

**Research notes:** `docs/superpowers/specs/2026-10-24-piece4-research/` (combat, stats, effects, skills). They hold the
C++ facts with `file:line`; this spec cites them as `[combat §2.2]` and so on.

C++ paths are relative to the server folder (`Blouflash VS22 V15/`), which holds `Source/`, `Resource/`, `Client/` and
`Program/`.

---

## 1. Brief

- **Goal:** a Vagrant levels from 1 to 15 in Flaris in the browser:
  - select and attack monsters, see the damage, and be hit back;
  - die, and come back at the lodestar;
  - gain EXP, level up, spend stat points;
  - in milestone 2, use the Vagrant skills with their real effects.

  Everything looks like the Windows client (Neuz) and plays by its rules, on a phone held sideways and on a PC.
- **Two milestones, one spec and one plan.** Each ends with a phone test.
  1. **Fight and level:**
     - selecting and attacking, damage numbers and hit effects, monsters fighting back;
     - the status window (HP/MP/FP/EXP), the target bar, the task bar;
     - death and the lodestar revive, level up, the Character window with stat points;
     - the weapon in the hand, and landscape for the whole game.
  2. **Skills:** the skill tree window and skill points, skills on the task bar, the action slot, and the Vagrant
     skills with their effects.
- **No server change.** Piece 3's table of contents lets the browser skip any message it doesn't read, and every packet
  the browser sends in Piece 4 is one Neuz sends. The servers in `Program\` (and in the owner's test VM) stay as they are.
- **Decisions by the owner (2026-10-24):**
  - **Scope:** a Vagrant, levels 1-15.
    - Job change is an NPC quest on this server: the client's direct request is commented out in
      `WORLDSERVER/DPSrvr.cpp:2480`.
    - A Vagrant's EXP stops at level 15.
    - So job skills come with the quest system, in a later piece.
    - Skills are read from the game's skill data generically, but only the Vagrant skills are promised and tested.
  - **Windows:** the Character window (stats) is in Piece 4. The minimap and navigation go to Piece 5, the world map to
    Piece 6.
  - **Other maps:** moving to another map while playing goes to Piece 5, with NPC dialogue. Reviving in Flaris stays on
    the same map (section 2).
  - **Attacking:**
    - **Phone:** tap a monster to select it; tap it again, or press an attack button, to attack.
    - **PC:** as Neuz, click to select and click the selected monster again (or double-click) to attack.
  - **Keyboard:** W runs, and **X toggles walking and running**, as Neuz (`Neuz/NeuzMsgProc.cpp:181`,
    `_Interface/WndWorldControlPlayer.cpp:524-545`). Shift no longer changes the gait. This replaces Piece 3's
    "walk unless Shift" (Piece 3 Ruling 25). The joystick is unchanged: a part push walks, a full push runs.
  - **Look:** the owner's screenshots of Neuz on their own V15 server are the reference: the status window top left,
    the target bar top centre, the task bar along the bottom, the Character window and the skill tree window. The
    windows are rebuilt in HTML/CSS with the game's own frames, gauges and icons, sized for touch.
  - **Weapon in hand:** yes, in milestone 1, for the player and for everyone in view. Changing equipment stays in
    Piece 5.
  - **Food on the task bar:** shown, but using items stays in Piece 5. Healing in Piece 4 is the server's own
    regeneration.
  - **Landscape always,** the whole game from the login form to the world (section 3.10).
  - **Milestones:** fight first, then skills.

---

## 2. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| A new Vagrant | The `BASE_VALUE_TBL` rows (one per sex) in `Database.sql` (lines 2741-2742):<br>• **equipped:** `II_WEA_SWO_WOODEN` (one-handed sword), `VAG_SUIT01`, `VAG_GAUNTLET01`, `VAG_BOOTS01`;<br>• **inventory:** lollipop and biscuit food, 5 town blink wings;<br>• **skills:** 1-3 in the skill array;<br>• **task bar:** food in slots 0-1, skill shortcuts in slots 2 and 8;<br>• **stats:** level 1, STR/STA/DEX/INT 15, HP 230, MP 63, FP 32. | `Database.sql` |
| Selecting | A click picks with `PickObject_Fast`, the nearest mover *by origin distance* whose oriented bounding box the ray hits. A quick click only selects. Clicking the selected monster again (or a double click) turns on auto-attack. Holding the button 500 ms on a new target also attacks. Each focus change sends SETTARGET. | [combat §1] |
| Attacking | Neuz sends PLAYERSETDESTOBJ (target, range 0), walks into range (`IsRangeObj`, 0.8 x both radii + 1 m), then MELEE_ATTACK with the weapon's `fAttackSpeed` float. The server drops an attack whose float differs from its own weapon's, and checks no range, facing or timing. The server walks its copy of the player too. | [combat §2.2-2.3], `WORLDSERVER/DPSrvr.cpp:2019-2066` |
| Combo | ATK1, then ATK2 from level 2, ATK3 from level 8, ATK4 from level 12, chained at the end of each swing while auto-attacking. The swing speed comes from the job's and the weapon's attack speed and DEX. A player's hit pauses its animation for 5 ticks. | [combat §2.4-2.5] |
| Damage | The server decides hits on its own copy of the animation, then sends DAMAGE (attacker, damage, flags) and SETPOINTPARAM (new HP) to everyone in view. A kill sends no DAMAGE: EXP and level messages, then MOVERDEATH, then SETPOINTPARAM(0). The monster is removed by DEL_OBJ about 4 s later. Neuz shows a number only when the own player hits or is hit. | [combat §3.2-3.3, §4.1] |
| Monsters attacking | MELEE_ATTACK (from the monster) to everyone in view, then DAMAGE and SETPOINTPARAM at the monster's hit frame. | [combat §3.3] |
| Death and revive | On death Neuz opens the revive window. **Lodestar** sends REVIVAL_TO_LODESTAR (no fields). In Flaris the server answers with REVIVAL_TO_LODESTAR, SETPOINTPARAM x3 (20% HP/MP/FP), then **SETPOS** on the same map, not REPLACE. No EXP is lost below level 21. | [combat §5], `_Common/World.cpp:1589-1604`, `Resource/DiePenalty.inc` |
| Numbers | The server sends current HP (all movers), MP and FP (own), base stats, level, EXP, stat and skill points. Neuz works out max HP/MP/FP, the EXP needed, ATK, DEF, Critical and attack speed itself, and refills HP/MP/FP on level up **with no message**, so the browser's formulas must match the server's. | [stats §1-2, §4] |
| Stat points | Batched in v15: local counters, **Apply**, a confirm box, then MODIFY_STATUS (four i32). The server answers with SETSTATE (absolute values) or silently drops a bad request. +2 stat points and +2 skill points per level from 2 to 15. | [stats §3.4, §4.1] |
| Effects | `.sfx` files (731, all loose in `Client/SFX`, all parsed without error by a test parser) hold billboard, particle, mesh and procedural-cone parts with 54-byte key frames, played at one frame per 60 Hz tick, mostly additive. A hit plays the weapon's `dwSfxObj3` effect 1 m beyond the victim, a critical `XI_HIT_CRITICAL01`, a miss `XI_HIT_MISS01`, a level up `XI_GEN_LEVEL_UP01` (6.8 s). There is no death effect in this data. | [effects §1-3] |
| Damage numbers | Glyphs from `Client/SFX/DmgEffect.dds` (`.inc`): one colour set when the own player is hurt, another for everyone else. They rise 80 px, shake, hold and fade, for about 50 ticks. | [effects §5], [combat §4.2] |
| Target marks | Four screen-space corners from `Client/Icon/icon_target.dds`: white when selected, red when attacking. The target bar is 200 px at the top centre, showing name, level, level-difference arrow and HP. | [effects §6], [combat §6] |
| Vagrant skills | Clean Hit (level 3), Flurry (level 5, needs Clean Hit 3), Over Cut (level 10, needs Flurry 3):<br>• max level 10, 1 skill point per level;<br>• FP only, no cooldown, no cast time, 2 m range, one-handed weapon;<br>• each hit frame of the motion makes one DAMAGE (Flurry: 3);<br>• the effect stays 1.3 m in front of the caster. | [skills §1], [effects §3.2] |
| Using a skill | The client walks to the target and sends USESKILL (skill-array index, target, use type). It doesn't start the motion: the server's USESKILL broadcast (caster included) does. The server refuses with CLEAR_USESKILL, or stays silent on some errors. | [skills §4] |
| Task bar | TASKBAR in the JOIN bundle: 18 applet slots, 8 bars of 9 slots (F1-F9), and the 5-slot action slot (key C). Edits are ADD/REMOVEITEMTASKBAR and SKILLTASKBAR, with no reply. Only `CT_STEP`/`CT_GENERAL` skills may sit on a bar, so of the Vagrant skills only Clean Hit can. The action slot chains Clean Hit → Flurry → Over Cut, and the server drives the chain with action points. | [skills §4.11, §5] |
| Today's browser | Reads ADD_OBJ, movement, SETPOS, REPLACE, DEL_OBJ and a few more ([combat §7]). It stops reading the own ADD_OBJ after the equipment IDs. It has no reader for any Piece 4 message, no `.sfx` reader, no hit frames in converted motions, no weapon models, and no UI art. | [combat §7], [effects §7], [skills §7], [stats §7] |

---

## 3. Design

### 3.1 Parts

| Package | Piece 4 adds |
|---|---|
| `packages/protocol` | the readers and writers of section 3.2; the rest of the own ADD_OBJ (MP, FP, EXP, skill points, stat points, base stats, the 45-slot skill array) |
| `packages/formats` | an `.sfx` reader; readers for `propJob.inc`, `ExpTable.inc`, `propSkill.txt` (with the item column list) and `propSkillAdd.csv`, `textClient.inc`, `DmgEffect.inc` and `icon_target.inc`; the extra `propMover` and `propItem` columns; web formats for effects and the new catalogs |
| `tools/convert` | the new data, effect, UI and weapon stages of section 3.3; hit, sound and quake frames in the converted motions; model bounding boxes |
| `packages/scene` | the effect player (section 3.7); weapons attached to hands (section 3.8) |
| `apps/client` | the combat rules and state (sections 3.4-3.6), the on-screen windows and controls (section 3.9), landscape (section 3.10), skills (section 3.11) |
| `packages/testkit` | pretend-world-server scripts for fighting, dying, levelling, stats and skills |
| `docs` | section 6 |

The gateway and the C++ servers are unchanged.

### 3.2 Packets in Piece 4

All server messages arrive inside JOIN/SNAPSHOT bundles, as Piece 3 reads them: object ID u32, type u16, fields. Each
reader is checked against the table-of-contents boundary, like Piece 3's. Field layouts are in the research notes as
cited.

**Server to browser:**

| Message | Type | Fields | M | Notes |
|---|---|---|---|---|
| MELEE_ATTACK | 0x00e0 | atkMsg u32, target u32, p2 i32, p3 i32 | 1 | another mover's swing ([combat §3.2]) |
| DAMAGE | 0x0013 | attacker u32, damage u32, flags u32, [pos vec3, angle f32 if `AF_FLYING`] | 1 | flags `AF_*` ([combat §3.2]) |
| MOVERDEATH | 0x00c7 | attacker u32, msg u32 | 1 | |
| SETPOINTPARAM | 0x001e | dst i32 (38 HP, 39 MP, 40 FP), value i32 | 1 | absolute |
| SETEXPERIENCE | 0x0012 | exp i64, level u16, skillLevel i32, skillPoint i32, deathExp i64, deathLevel u16 | 1 | own only |
| SETLEVEL | 0x0011 | level u16 | 1 | others only |
| SET_GROWTH_LEARNING_POINT | 0x00a6 | remainGP i32, 0 i32 | 1 | own stat points |
| SETSTATE | 0x006a | str, sta, dex, int, 0, remainGP (i32 each) | 1 | answer to MODIFY_STATUS |
| CORRREQ | 0x0041 | pos vec3, attacker u32 | 1 | a monster's position on the first hit |
| REVIVAL / REVIVAL_TO_LODESTAR | 0x00a1 / 0x00a2 | none | 1 | |
| DEFINEDTEXT / DEFINEDTEXT1 | 0x0095 / 0x0094 | text ID i32 (+ string) | 1 | server messages (section 3.9) |
| QUERYGETDESTOBJ | 0x0049 | from u32 | 1 | answered with GETDESTOBJ |
| MONSTERPROP | 0x004e | per-monster rates ([stats §2.2]) | 1 | scales a monster's max HP |
| TASKBAR | 0x0097 | applets, item bars, action slot, action points ([skills §5.2]) | 1 | M1 shows it, M2 edits it |
| USESKILL | 0x0019 | skill u32, level u32, target u32, useType i32, castTime i32 | 2 | everyone's skills, the caster's included |
| CLEAR_USESKILL | 0x001a | none | 2 | own skill refused |
| DOUSESKILLPOINT | 0x007d | 45 x (skill u32, level u32), skillPoint i32 | 2 | answer to a skill-point spend |
| INITSKILLPOINT | 0x007c | skillPoint i32 | 2 | skill reset (scroll or GM) |
| SETACTIONPOINT | 0x00c5 | actionPoint i32 | 2 | |
| ENDSKILLQUEUE | 0x00e5 | none | 2 | the action slot's chain ended |
| CREATESFXOBJ | 0x000f | sfx u32, x/y/z f32, flag i32 | 2 | effects the server places |

**Browser to server** (each with the u32 `DPID_UNKNOWN` + u32 type head, as Piece 3 writes):

| Packet | Type | Fields | M |
|---|---|---|---|
| SETTARGET | 0x00ff0023 | target u32, clear u8 (1 release, 2 focus) | 1 |
| PLAYERSETDESTOBJ | 0xffffff07 | target u32, range f32 | 1 |
| MELEE_ATTACK | 0x00ff0010 | atkMsg u32 (29-32), target u32, 0 i32, 0x00010000 i32, attackSpeed f32 | 1 |
| GETDESTOBJ | 0xffffff73 | from u32, dest u32 | 1 |
| REVIVAL_TO_LODESTAR | 0x00ff00c1 | none | 1 |
| MODIFY_STATUS | 0xf000f501 | str, sta, dex, int (i32 each) | 1 |
| PLAYERBEHAVIOR | (Piece 3) | | 1 (the X toggle) |
| USESKILL | 0x00ff0020 | type u16 (0), index u16, target u32, useType i32, control i32 | 2 |
| DOUSESKILLPOINT | 0x000f0003 | 45 x (skill u32, level u32) | 2 |
| ADDITEMTASKBAR / REMOVEITEMTASKBAR | 0xffffff0c / 0xffffff0d | bar u8, slot u8 (+ 6 x u32 shortcut) | 2 |
| SKILLTASKBAR | 0xffffff0e | count i32 (5), 5 x (index u8, 6 x u32) | 2 |
| ENDSKILLQUEUE | 0x00ff00d5 | none | 2 |

**The own ADD_OBJ** (METHOD_NONE): the reader keeps the base stats, MP, FP, EXP, death EXP and level, skill level and
points, stat points, and the 45 skill pairs after the equipment IDs ([stats §2.1], [skills §2.1]). It also reads on to the
**inventory container**, keeping each item's object ID, item ID and count. A task-bar item shortcut names an inventory
object ID ([skills §5.1]), so this is what lets the bar show the food's icon and count. The fields between the skill array
and the inventory, and the layout of `CItemContainer` / `CItemElem::Serialize`, are copied from the C++ by the task that
writes the reader. The banks, pet, pocket and the rest stay skipped. If the inventory read fails its boundary check, the
rest of the own data is still used, and item shortcuts fall back to a plain greyed slot. The inventory window and using
items stay with Piece 5.

**The own equipment's item IDs** come from the lobby's PLAYER_LIST (`equipment`, already decoded in Piece 2), because
the own ADD_OBJ gives inventory positions, not item IDs ([combat open question 1]). Each item's slot comes from its
`dwParts`. The list is fixed for the session in Piece 4, since equipping is Piece 5. Other players' worn items come from
their ADD_OBJ, as in Piece 3.

### 3.3 Game data and converted files

New or extended catalogs from the data stage (`dist/assets/data/`). All come from `Resource/` or the client packs, as
today.

| Catalog | Content | From |
|---|---|---|
| movers | + level, `dwAddHp`, `nExpValue`, class (rank), belligerence (aggressive), killable, `dwHideLevel`, element, attack range | `propMover.txt` |
| items | + weapons and shields: `dwHanded`, `dwWeaponType`, `dwAbilityMin/Max`, `fAttackSpeed` (kept exactly as written, sent as f32), `dwAttackRange`, `dwSfxObj3`, `dwSfxObj5`, the destination params; armour: its defence (`dwAbilityMin/Max`) and destination params; icon file names | `propItem.txt` |
| jobs | the 17 factors per job | `propJob.inc` |
| exp | `nExp1`, `dwLPPoint`, `nLimitExp` per level | `ExpTable.inc` |
| skills (M2) | per skill: the client columns of [skills §1.7], and its per-level rows | `propSkill.txt`, `propSkillAdd.csv` |
| texts | the `TID_*` texts Piece 4 shows (server messages, window labels, tooltips), with their colours | `textClient.inc`, `textClient.txt.txt`, `defineText.h` |
| effects index | `XI_*` ID → effect file, scale, sound name | `mdlDyna.inc` OT_SFX entries |

Converted files:
- **Motions:** each converted motion carries its hit, sound and quake frames (the `.ani` frame attributes that `readAni`
  already parses).
- **Models:** each mover model carries its bounding box: the union of its parts, a held weapon included, as Neuz unions
  them ([combat §1.3]). Picking (section 3.4) and the arrival range need it.
- **Weapons and shields:** their `.o3d` models become GLB in the existing models stage.
- **Effects:**
  - Every `.sfx` file that `mdlDyna.inc` names becomes a web effect file, with every field and the version rules of
    [effects §1.2-1.3].
  - `Client/SFX/Texture/` becomes KTX2 under its own key space.
  - Mesh parts (128 parts in 72 files, none of them used in Piece 4) are converted. The player skips them and counts
    them in the report (section 3.7).
- **UI art,** as PNG with the colour key `0xff00ff` made transparent:
  - the window frames and buttons Piece 4's windows use, from `Client/Theme/Default`;
  - the gauges `GauEmptyNormal.bmp`, `LvUp/LvUp2/LvDn/LvDn2.bmp`;
  - `DmgEffect.dds` and its glyph rectangles;
  - `icon_target.dds` and its cells;
  - skill and item icons, `icon_ActionSkill.dds` and `icon_IconSkillLevel.tga` from `Client/Icon`.
- **The report** (`report.json`) counts what each new stage wrote, skipped and failed, as the existing stages do.

### 3.4 Selecting and attacking

The rules are copied from the named C++ functions, as in Piece 3.

- **Picking:** `PickObject_Fast` replaces Piece 3's mesh ray-cast for movers ([combat §1.3]):
  - the candidates are the movers drawn this frame, minus the own player and dead non-players;
  - each is tested by its oriented, scaled bounding box;
  - the nearest by origin distance whose box is hit wins.

  A tap or click that hits no mover walks there, as in Piece 3.
- **Selecting:** `SetObjFocus` sends SETTARGET (the old target released with 1, the new one focused with 2, or a cleared
  focus). A tap or click on bare ground doesn't clear the focus.
- **Starting an attack:**
  - **PC:** a second click on the selected mover, a double click, or holding the button 500 ms on a new target
    (`m_timerFocusAttack`).
  - **Touch:** a second tap on the selected mover, or the attack button.
  - **Both:** this sets auto-attack (`m_bAutoAttack`) only for a target that `IsAttackAble` accepts. A peaceful NPC
    can't be attacked; tapping it does nothing yet (dialogue is Piece 5).
- **The attack loop** (`CMD_SetMeleeAttack`, `ProcessMoveArrival`, `DoAttackMelee`, `_ProcessStateAttack`):
  1. **Approach:** PLAYERSETDESTOBJ is sent, and the player walks to the target with Piece 3's movement and collision
     until `IsRangeObj` says it's in range. Radii come from the bounding boxes.
  2. **Swing:** ATK1 starts locally, and MELEE_ATTACK is sent with `fAttackSpeed` of the held item (the fists'
     `II_WEA_HAN_HAND` row when nothing is held).
  3. **Combo:** at the end of each swing the next combo step starts by level, while auto-attack is on and the target is
     valid; after the last step the loop starts again with PLAYERSETDESTOBJ.
  4. **Speed and motions:**
     - The animation speed is `GetAttackSpeed()`.
     - The hit frame pauses the model for 5 ticks.
     - Motions use the weapon offset (+200 one-handed and so on) once `OBJSTAF_COMBAT` is set ([combat §2.4]).
- **What stops it,** as Neuz:
  - a movement key or the joystick;
  - a tap or click on the ground;
  - the target dying, leaving view or becoming unattackable;
  - the player dying;
  - selecting another target, which is queued as the next one.
- **Others' attacks:** a MELEE_ATTACK from another mover plays its ATK motion facing the target. A mover that is still
  busy queues it for the end of its current animation, as Neuz does. QUERYGETDESTOBJ is answered with GETDESTOBJ while the
  player has a target.
- **Keyboard gait:** X toggles `OBJSTAF_WALK` and sends PLAYERBEHAVIOR, as Neuz. W and S move at the toggled gait.

### 3.5 Being hit, dying, reviving

- **DAMAGE** (`OnDamage`):
  1. The victim's HP drops by the damage, never below 1; the SETPOINTPARAM that follows is absolute.
  2. A flying hit (`AF_FLYING`) sets the position and angle and plays the knock-back flight.
  3. If the own player is the victim or the attacker, the flag order of [combat §4.1] picks what is shown: blocking,
     parry, resist, miss, critical, number.
  4. The hit spark (the attacker weapon's `dwSfxObj3`), the flinch (`SetDamagedMotion`, not while the victim attacks or
     jumps), the spark flash on the model and the NPC shake (`m_nDmgCnt`) come from the attacker's hit frame, as Neuz
     ([combat §2.5], [effects §6]).
- **MOVERDEATH:**
  - HP is set to 0.
  - A final number shows the last known HP if the own player is involved.
  - The death motion `MTI_DIE1` is held on its last frame, or the knock-back flight for a forced kill.
  - The focus is cleared, and a queued next target becomes the focus.
  - The body stays until DEL_OBJ.
- **The own death:**
  - auto-attack stops, and the chat line `TID_GAME_DEATH` shows as a server message (section 3.9);
  - the revive window opens: **Lodestar** sends REVIVAL_TO_LODESTAR, and **Revive here** shows greyed out (it needs a
    resurrection scroll, Piece 5);
  - the server's answer is applied as it arrives: REVIVAL_TO_LODESTAR clears the state, SETPOINTPARAM sets HP/MP/FP,
    and SETPOS moves the player (Piece 3 already handles a same-map SETPOS);
  - a cross-world REPLACE still ends the session with Piece 3's message.

### 3.6 Numbers: HP, MP, FP, EXP, level up, stats

- **State:**
  - The own character's current values come from the own ADD_OBJ and the update messages of section 3.2.
  - Others keep HP and level (from ADD_OBJ and SETLEVEL).
  - Max values are computed with the C++ float formulas, `Math.fround` after every step, from the jobs and exp
    catalogs: max HP/MP/FP [stats §1.2], the EXP needed (`GetMaxExp1`) and the EXP percent.
  - A monster's max HP is `dwAddHp` times the MONSTERPROP rate for its name (1.0 when none).
- **Level up** (SETEXPERIENCE with a higher level), as `CMover::SetExperience`:
  - `MTI_LEVELUP` if standing, and the `XI_GEN_LEVEL_UP01` effect on the player;
  - the level-up caption, plus the "new attack pattern" line at levels 2, 8 and 12;
  - HP, MP and FP set to the new max.
  - Other players' SETLEVEL plays the same motion and effect on them.
  - At level 15 a Vagrant's EXP stays at 0%, as the server keeps it.
- **The Character window** (`CWndCharInfo`, laid out as [stats §3.2]):
  - **Base:** Name, Job, Level, Server, Channel.
  - **Detail:** ATK, DEF, Critical, A.Speed, computed as [stats §3.3] with the equipped items' abilities and
    destination params: the Wooden Sword's attack, the armour's defence. Refining and other item bonuses come with
    Piece 5.
  - **Stats:** STR, STA, DEX and INT with **+** and **−**, Stat Points, **Apply** and **Reset**, batched as Neuz
    ([stats §3.4]).
  - While points are being placed, the window previews the new values.
  - **Apply** asks for confirmation, then sends MODIFY_STATUS.
  - SETSTATE updates the stats, and Neuz's display of full bars is copied.
  - It opens with **H**, from the task bar's applet, or from the Start menu.

### 3.7 Effects and damage numbers

- **The effect player** (`packages/scene`) re-implements `CSfxModel` ([effects §2]):
  - **Timing:** a fixed 60 Hz tick with an accumulator.
  - **Key frames:** previous and next key interpolation, with integer alpha.
  - **Quads:** camera-facing, flat and "normal" quads, with texture animation.
  - **The procedural cone** (CUSTOMMESH).
  - **Particles:** emitted by Neuz's rule, with the three randoms shared per tick.
  - **Sustain:** the sustain loop (`repeat`).
  - **End of life:** an effect ends when its last non-particle key has passed and all particles are dead.
  - **Blending:** additive (GLOW) or alpha (BLEND), depth test on, depth write off, drawn after opaque objects and
    sorted far to near.
  - **Mesh parts** aren't drawn in Piece 4.
- **The effect manager** creates effects by `XI_*` ID with the rules of [effects §2.2 and §3]:
  - follow the source or destination mover's position, or stay fixed (`CSfxFixed`);
  - the +0.01 and +0.2 m offsets, and the heading;
  - the entry's scale.

  Piece 4's effects:
  - the weapon hit sparks;
  - `XI_HIT_CRITICAL01`, `XI_HIT_MISS01`, `XI_HIT_PARRY01`, `XI_HIT_HITBLOCK01`;
  - `XI_GEN_LEVEL_UP01`;
  - `XI_GEN_MONSTER_SPAWN01` (for a monster that appears within 32 m);
  - in milestone 2, the three Vagrant skill effects and CREATESFXOBJ.
- **Damage numbers:** a screen-space layer, like Piece 3's name tags. The glyphs come from the converted
  `DmgEffect.dds`, the colour set from whether the own player is the victim, and the motion and timing from
  [effects §5]. Several numbers at one place overlap, as in Neuz.
- **The target corners:** four corner images around the target's projected bounding box, white when selected and red
  while attacking ([effects §6]).

### 3.8 Weapons in hand

- The right-hand and left-hand items (weapon, shield) of every player in view are drawn attached to the skeleton's
  hand points, as Neuz attaches them. The task finds the exact attachment in the C++ (`CModelObject` hand parts and
  `GetHandPos`) and the converted skeletons.
- The held item also feeds the attack: `fAttackSpeed` for MELEE_ATTACK, `dwSfxObj3` for the hit spark, and the weapon
  offset of the motions.
- Monsters' "weapons" (`IK3_VIRTUAL`) are not drawn.

### 3.9 On-screen windows and controls

Rebuilt as HTML/CSS over the 3D view, with the converted UI art, laid out like the owner's screenshots and sized for
touch. Text uses the game's texts catalog.

| Element | Where | Content |
|---|---|---|
| Status window | top left | portrait, name and level, HP/MP/FP bars with "value / max", EXP bar with `%.2f%%` capped at 99.99 ([combat §4.3], [stats §5.1]). Toggled with **T**. The portrait is a small render of the character's head, drawn on entering and when the look changes, not every frame. |
| Target bar | top centre | `name <Lvl N>`, coloured as Neuz (aggressive monsters red), the level-difference arrow, the HP bar with "value / max". Shown for non-peaceful movers and players. |
| Target corners | around the target | section 3.7 |
| Task bar | bottom, full width | Start (menu of Piece 4's windows and **Log out**, which replaces Piece 3's Leave button), the applet row (as many slots as fit the width, as Neuz's 5/10/18), the F1-F9 slots of the current bar with item counts, the bar arrows and number (keys 1-8 switch bars), and the action slot with its button (key C). Food and other item shortcuts show their icon, greyed. Skill slots work from milestone 2. |
| Attack button | right side, above the task bar | touch screens only; enabled while an attackable target is selected |
| Joystick | left side, above the task bar | Piece 3's |
| Revive window | centre | section 3.5 |
| Character window | Neuz's place, draggable | section 3.6 |
| Server messages | above the task bar | DEFINEDTEXT texts and Piece 4's own lines (level up, death, "new attack pattern"), a few lines that fade, in the text's colour. The chat window is Piece 5. |
| Level-up caption | centre | `TID_GAME_LEVELUP_CAPTION`, large, fading |
| Overlay | top left, under the status window | Piece 3's overlay, unchanged |

Windows open at Neuz's positions scaled to the screen. They can be dragged by their title bar on both mouse and touch,
and closed with their close button or Escape. More than one can be open.

### 3.10 Landscape

- The whole client (login, server and channel, character list, create, world) is laid out for a screen wider than tall.
- **When the page is taller than wide,** a "Turn your device sideways" screen covers everything ("Make the window wider"
  on a PC) until it's wide again. Nothing behind it is paused or closed.
- **On browsers that allow it (Android Chrome),** the first tap that logs in or enters the world requests full screen and
  `screen.orientation.lock('landscape')`. A refusal is ignored: the cover screen still applies. iOS Safari allows neither,
  so the cover screen does the job there. A locked install comes with the installable app in Piece 6.
- The device checklists are run in landscape.

### 3.11 Milestone 2: skills, the task bar and the action slot

- **Skill state:** the 45-slot skill array from the own ADD_OBJ, the skill points from it and from SETEXPERIENCE,
  DOUSESKILLPOINT and INITSKILLPOINT, and the skills catalog.
- **The skill tree window** (`CWndSkillTreeEx`, opened with **K**):
  - the Vagrant's three skills with their arrows, icons and level digits;
  - each skill's tooltip: name, level, FP, prerequisites, character level, description;
  - the skill points left;
  - **+**, **−**, **Reset** and **Finish** on a local copy, by the rules of [skills §3.1]: level, prerequisites, max
    level, and refunds for dependants;
  - **Finish** (and closing with changes) asks for confirmation, then sends DOUSESKILLPOINT with the player's own skill
    IDs and the edited levels. The browser enforces the rules the server doesn't check.
- **The task bar:**
  - TASKBAR fills it.
  - A skill can be placed on a bar slot by dragging (mouse) or by tapping the skill and then a slot (touch). Removing is
    by dragging it off, or by a long press and then remove (touch).
  - Each change sends ADDITEMTASKBAR / REMOVEITEMTASKBAR, or SKILLTASKBAR for the action slot (always all 5 entries).
  - The placement rules of [skills §4.11, §5.4] apply: only Clean Hit on a bar; the action slot takes Clean Hit first,
    then Flurry (repeatable), then Over Cut last.
- **Using a skill** (`UseSkillShortCut`, `CMD_SetUseSkill`, `ProcessMoveArrival`):
  - Pressing a bar slot (tap, click or F-key) walks to the target, then sends USESKILL with the skill's array index and
    `SUT_NORMAL`. The line-of-sight test and the 1 s repeat throttle come from Neuz.
  - The action slot's button or **C** sends USESKILL for the first entry with `SUT_QUEUESTART`; the server drives the
    rest. SETACTIONPOINT and ENDSKILLQUEUE update the action slot.
  - Tapping or clicking the ground while the chain runs sends ENDSKILLQUEUE.
- **Playing skills,** for the player and for others (`OnUseSkill`, `ProcessStateMeleeSkill`):
  - USESKILL starts the skill motion (`MOP_FIXED`, no weapon offset), which ends at 65% of its frames.
  - Each hit frame pauses the model 4 ticks and places the skill's effect 1.3 m in front of the caster (`CSfxFixed`),
    and makes the victim flinch.
  - The numbers come from the server's DAMAGE messages, one per hit frame.
  - CLEAR_USESKILL clears a refused request, and the server's text explains it.
  - The browser never waits forever on a silent refusal ([skills open questions]): a request with no USESKILL answer
    within 2 s is cleared.

---

## 4. Error handling

| Situation | What the player sees |
|---|---|
| The server refuses an attack or a skill and says why (DEFINEDTEXT: "Please wait a moment before attacking again.", "You cannot attack a monster that is fighting against another player.", "Not enough FP.", "You need to equip the correct weapon or item to use that skill.", "Please wait.") | the server's text as a server message (section 3.9); the attack or skill stops |
| An attack's speed float is refused (`TID_GAME_MODIFY_ATTACK_SPEED`) | the same text; this is a converter or data bug, which the live test is there to catch (section 5) |
| A skill or skill-point request gets no answer within 2 s | the request is dropped, and the player can try again; nothing is shown |
| MODIFY_STATUS gets no SETSTATE (a request the server drops silently) | the counters stay for the player to change; nothing is shown |
| A DAMAGE or MOVERDEATH for a mover not in view | ignored, as Neuz does |
| The own ADD_OBJ's inventory part doesn't end on its boundary | the rest of the own data is used; item shortcuts show a plain greyed slot; the overlay counts the mismatch as Piece 3 does |
| A converted effect, icon or glyph sheet is missing | the effect is skipped, or a plain placeholder icon is shown, and the overlay's `errors:` line names it |
| An effect file has mesh parts (not drawn in Piece 4) | those parts are skipped, and the converter's report counts them |
| The page is taller than wide | the turn-sideways screen (section 3.10) |
| Full screen or the orientation lock is refused | ignored; the turn-sideways screen still applies |
| Everything from Piece 3 (timeouts, lost connections, another map) | unchanged |

---

## 5. Testing

- **Unit tests (Vitest):**
  - **Packet readers and writers** of section 3.2, byte by byte from the named C++ functions, and the extended own
    ADD_OBJ against a byte layout built from `CMover::Serialize`.
  - **Numbers,** against values worked out from the C++ float formulas:
    - max HP/MP/FP at several levels and stats (the new character's 230/63/32 included);
    - ATK, DEF, Critical and A.Speed with the starter equipment and with fists;
    - the EXP percent at the table's levels;
    - the attack speed of the worked example in [combat §2.5].
  - **The attack loop and combo,** with a fake clock and fake connection: the packets in order, the combo by level, the
    stop rules, the hit pause, and `PickObject_Fast` against hand-made boxes.
  - **The effect player,** with a fixed random source: key interpolation, texture frames, particle emission and life,
    the end-of-life rule, the sustain loop.
  - **Stat points and skill points:** the window rules of [stats §3.4] and [skills §3.1], the placement rules of
    [skills §4.11].
- **Corpus tests:**
  - every `.sfx` file parses with no bytes left over;
  - the new catalogs read the real files with zero failures;
  - every converted motion's hit frames match `readAni`;
  - the Vagrant skills' and Aibatt's frames match [skills §1.6] and [combat §2.5].
- **Client tests against the pretend world server** (`packages/testkit`), in Chromium and WebKit:
  - select, attack, a hit with a number, a critical and a miss, a kill with EXP, a level up with the effect;
  - a monster's hit, death and the lodestar revive;
  - a stat point applied;
  - in milestone 2, the skill window, a skill on the bar, a skill used with its effect, and the action slot's chain.
- **Picture tests (Playwright):** a scripted fight in Flaris (the status window, target bar, corners, a damage number
  and a hit effect) and the Character window get baselines. Piece 3's Flaris scene baseline is replaced, because the
  windows now cover part of it. The viewer's baselines stay identical.
- **Live test** (`npm run test:live:world`, extended; it runs in the owner's VM):
  - one account walks out of Flaris to the Aibatts, selects the nearest and attacks until it dies;
  - no attack may be refused, a DAMAGE must arrive for every swing that hits, and the EXP must rise;
  - the own inventory's food (the item IDs and counts behind the task bar's item shortcuts) must be read;
  - every bundle still has a valid table of contents and zero reader mismatches.
  - In milestone 2: a skill point is spent on Clean Hit, it's put on the bar, and it's used on an Aibatt, with its
    USESKILL and DAMAGE.
  - The test characters must be level 3 or higher for Clean Hit. The live config's comment says so.
- **Devices:** a Piece 4 section in `docs/device-testing.md` with one landscape checklist per milestone:
  - **Milestone 1:**
    - select and attack, the combo at levels 1, 2 and 8, numbers and effects;
    - being hit, dying and reviving, levelling up, applying stat points;
    - the turn-sideways screen;
    - the frame rate in a fight with several monsters, against Piece 3's 30 fps target.
  - **Milestone 2:** raising Clean Hit, putting it on the bar, using it, the action slot's full chain at level 10,
    and the effects.

---

## 6. Docs

- `README.md`: Piece 4, the new stages and catalogs, the new file counts.
- `docs/device-testing.md`: the Piece 4 checklists (section 5), and landscape for all checklists from now on.
- `docs/conversion-baseline.md`: the new stages' timings and sizes.
- `apps/client/test/live.config.example.json`: the comment on the fight and skill legs.

---

## 7. Done criteria

**Milestone 1:**
1. A Vagrant selects, attacks and kills an Aibatt on the real servers. The swing, combo, hit sparks, numbers, flinch,
   death and EXP are as in section 3.4-3.6, on a phone in landscape and on a PC.
2. Monsters hit back, the player can die and revive at the lodestar, level up, and apply stat points, and others see the
   swings, deaths and level-up effects.
3. The status window, target bar, corners, task bar, attack button, Character window and server messages look like the
   owner's screenshots.
4. The whole game is landscape-only, as in section 3.10.
5. The unit, corpus, pretend-server and picture tests pass, and the live fight test passes in the VM.
6. The milestone 1 device checklist passes.

**Milestone 2:**
7. The skill tree window raises the Vagrant skills. Clean Hit works from the bar, and the action slot chains Clean Hit,
   Flurry and Over Cut on the real servers, with their effects for the player and others.
8. The tests of section 5 for milestone 2 pass, and the milestone 2 device checklist passes.

**Both:**
9. No change to the C++ servers or the gateway.
10. The docs of section 6 are updated.
11. Everything is committed in `FlyffWeb` on the branch `piece4-combat`, started from `origin/main`. Nothing is pushed
    unless the owner asks.

---

## 8. Out of scope

- Items: using food and potions, the inventory, equipping, drops on the ground, shops: Piece 5.
- Chat, NPC dialogue, moving to another map, the minimap and navigation: Piece 5.
- The world map, sound and music, the installable app and its orientation lock: Piece 6.
- Buffs and their icons and speed changes, job skills, job change, quests: later pieces.
- Fighting other players (PK and duels), and the guild-war and event rules.
- Wands, bows, yoyos and their projectiles. Weapons other than one-handed melee are drawn, but their attacks aren't
  promised.
- Mesh parts of effects, sounds named by effects, and the sword trail (`MOP_SWDFORCE`).
- Sitting and its faster regeneration.
- Effects placed in the world maps (`OT_SFX` in `.lnd`).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The attack-speed float doesn't match the server's, so every attack is refused | `fAttackSpeed` is kept exactly as written and sent as `Math.fround`; a unit test checks the starter sword's bytes; the live test fails on any refusal |
| The max HP/MP/FP formulas differ from the server's by one at a boundary, so bars show a wrong max after a level up | the C++ float formulas with `Math.fround` per step, tested against worked values; SETPOINTPARAM corrects the current value at the next change |
| Effects look different from Neuz (blending, mips, 1-bit alpha), with no side-by-side check possible | the C++ render state is copied; the owner's screenshots are the reference; the device checklist looks at each effect |
| Effects and particles cost too much on phones | the fight frame-rate check in the device checklist; the effect count stays small (a few per hit); far effects can be culled |
| Picking by box selects a different mover than the finger meant on a crowded phone screen | Neuz's rule is kept; the target bar shows what was picked; the checklist tries a crowd |
| The server drives the action slot's chain, and a browser mistake leaves it stuck | ENDSKILLQUEUE, CLEAR_USESKILL and the 2 s timeout reset it; the pretend-server tests cover each path |
| The inventory layout (`CItemElem::Serialize`, many fields) is misread, with no recording to check it against | the reader is built field by field from the C++; the table of contents bounds it and names a mismatch; the live test checks that the starter food's item IDs and counts are read; a failure only greys the item slots (section 4) |
| Some new characters' data differs from `BASE_VALUE_TBL` (an old character, a GM edit) | everything is read from the messages and catalogs, not assumed; the starter values are only test data |
| iOS can't lock landscape | the turn-sideways screen; the installable app in Piece 6 |

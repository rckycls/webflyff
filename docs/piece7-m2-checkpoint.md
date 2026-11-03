# Piece 7, milestone 2: checkpoint

The first jobs and their weapons, built in the worktree `FlyffWeb-worktrees/piece7-m2` on its own branch. Nothing is merged or pushed. The plan is [docs/superpowers/plans/2026-11-03-piece7-m2-jobs.md](superpowers/plans/2026-11-03-piece7-m2-jobs.md). The research it cites is [docs/superpowers/specs/2026-11-03-piece7-m2-jobs-research.md](superpowers/specs/2026-11-03-piece7-m2-jobs-research.md).

## What was built

- **Task 1** (438739a..839d0c6): the protocol: the job change, the ranged attacks and the hit reports.
- **Task 2** (a17fb56..680ace6): the formats and the converter: the missiles, the bullets, the skills' times and parameters, the gauge and the job panels.
- **Task 3** (680ace6..ad06924): the job change in the own numbers and the world.
- **Task 4** (ad06924..5b1d5f9): the Skill window for every first job.
- **Task 5** (5b1d5f9..7e0020c): the action mover: the wand's and the bow's shots, the kept magic attacks.
- **Task 6** (7e0020c..6ffa733): the missiles (the wand's and the arrow) and the own hit reports.
- **Task 7** (6ffa733..215903e): the effects' mesh parts and the missiles' drawing.
- **Task 8** (346c63f..f465b38): the wand's charge and shot, the bow's arrows, the charge gauge.
- **Task 9** (f465b38..e1eb8b5): the yoyo: 6 m, the sight test, two swings, the thrown yoyo.
- **Task 10** (e1eb8b5..f7e4744): Part A in the world and the screen, and jobs.spec.ts.
- **Task 11** (f7e4744..bd8c7cd): magic casting for every player.
- **Task 12** (bd8c7cd..cf5213e): the skill missiles and their reports; the arrows a bow skill needs.
- **Task 13** (cf5213e..b0e03cd): the skill effects; Snitch from behind; Blinkpool refused.
- **Task 14** (b0e03cd..d9e95be): the buffs: their messages, their list, the own buff layer, DST_SPEED.
- **Task 15** (d9e95be..0ab0547): the buff icons, and Part B in the world.
- **Task 16**: this note, the device checklist ([device-testing.md](device-testing.md), "Piece 7, milestone 2") and the README line.

The job change through the Mercenary quest chain is milestone 1's. M1 is on local main as 438739a, and this branch is rebased onto it (2026-11-04). The conflicts were all additions on both sides, and both were kept: the client packet ids (constants.ts), the own events (quests and the job change, OwnState.ts), the own sounds (worldSounds.ts and its test), the own-state tests, the README line and the device checklist (M1's section, then M2's).

## Your commands, and what "pass" means

In PowerShell in the piece7-m2 folder, with your own `npm run dev:client` stopped first:

| Command | How long | Pass |
| --- | --- | --- |
| `npm test` | about 2 minutes | `Tests … passed`, no `failed`. |
| `npm run typecheck` | about 1 minute | no `error`. |
| `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 5 minutes | `… passed`, no `failed`. |
| `npm run test:e2e:client` | about 10 minutes | `… passed` (a few `skipped`), no `failed`; `jobs.spec.ts` is new (12 tests, chromium and phone). |

The game files need one conversion, run in the piece7-m2 folder. It covers M2's gauge and job panels, M1's quest window pictures (this branch is on top of M1), and the data:

```
npm run convert -- --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client" --only "GauMagCharge*,Back_*,ButtRemoveQuest*,ButtClose*,ButtCheck*,ButtDestination*,buttTree*,data"
```

Then the device checks: [device-testing.md](device-testing.md), "Piece 7, milestone 2: jobs and their weapons".

## The calls I made (the rulings)

Each is a decision I made where the plan or the C++ left a choice. Each says what it costs if it is wrong.

- **Task 5:** the magic queue is drained through a world-set hook (doKeptMagicAttack) with keepMagicAttack, not a magicAttack() on the mover — the C++ drains it with CMover::DoAttackMagic/DoAttackRange (sight test, packets), which belong to the world. Cost if wrong: one rename.
- **Task 5:** no actParam on the action mover; the shot's power and server id live on the world's Mover (Task 10) — SetActParam is CMover's, not CActionMover's. Cost if wrong: a field moved.
- **Task 6:** MissileView carries loopFrame (20 for the wand, null for the arrow: at the model's end) instead of frame — the frame is the drawn model's to step (EffectModel), the rule is the class's. Cost if wrong: one field.
- **Task 6:** Missiles takes a second callback struck(targetId, shake) for the target's dwSndDmg2 and SetDmgCnt(10) — the plan's step() returns only hit effects. Cost if wrong: an extra parameter.
- **Task 6:** the cosine of facingOf is kept in [-1,1] — a float a hair over 1 would give NaN rotation where Neuz's acosf would. Cost if wrong: none seen.
- **Task 6:** the wand's report is sent and the missile dropped the tick after arrival; its hit model plays as an ordinary effect from the arrival tick — Neuz keeps the object until the model ends, which changes no packet. Cost if wrong: a later SFX_CLEAR timing for a source gone between arrival and report (same packets).
- **Task 7:** EffectManager.stepMissiles(views) per tick and the missiles drawn inside draw(camera), in place of a drawMissiles(views) per frame — the flight models must step at the 60 Hz tick, as CSfx::Process does. Cost if wrong: a rename.
- **Task 7:** the renderer draws an effect mesh part's model through a provider of (geometry, texture key) pairs given by its owner (Task 10 wires the GLB load) — the scene package's renderer has no loader of its own. Cost if wrong: none.
- **Task 7:** an old effectModel test expected mesh parts never drawn; it now gives its mesh part no model (still not drawn, still keeps the effect alive) — the task's purpose is to draw mesh parts. Cost if wrong: none.
- **Task 8:** the bow's charge on an already-focused target is replaced by the next step's level-0 shot — Neuz's frame order (the press turns auto-attack on, and CWndWorld's bow auto-attack sends CMD_SetRangeAttack( id, 0 ) while the button is up). Cost if wrong: charged bow shots need a press on a new target, a one-line change in useFocusObj.
- **Task 8:** no MODE_RUN switch for CMD_SetMagicAttack/CMD_SetRangeAttack — the C++ commands set none (MoverMsg.cpp:475-522). Cost if wrong: the own walk to range is at walking speed.
- **Task 8:** the attack ranges table moved into attackLoop as attackRangeOf; skillUse keeps its own copy — M1 also edits skillUse, a smaller diff there. Cost if wrong: two copies of a 7-row table.
- **Task 8:** the shot's power and sfx id live on the world's Mover (`shot?`) — the hooks of every mover read it when the missile leaves. Cost if wrong: a field on Mover.
- **Task 8:** `onReleased(now?)` and `step(skillBranch, now?)` take an optional now; the loop's hooks (onText, ground, shots) are properties — existing callers and tests stay as they are. Cost if wrong: none at run time.
- **Task 8:** ChargeGauge is a DOM layer `constructor(art: UiArt, doc: Document)`, not a scene object `(art, scene)` — the theme pictures are URLs and Neuz draws the gauge in 2D at pixel places. Cost if wrong: a swap to a sprite.
- **Task 9:** the quake-frame test is a world test (worldState.test.ts), not an attack-loop one — the throw is the world's for every player, the own included. Cost if wrong: none.
- **Task 9:** MoverViews answers isAttrQuake from the motion's quake frames (a quake passed while the file loads is not kept, unlike a hit) — the throw is drawing only. Cost if wrong: a yoyo thrown late or not at all on the first swing after a file loads.
- **Task 9:** the C++ `break` when the quake's target is gone or the yoyo has no dwSfxObj2 (which also skips that step's hit test) is not copied — no yoyo motion has its quake and hit on one frame (6-7 vs 17). Cost if wrong: one hit in a thousand-to-one case.
- **Task 9:** WorldState takes `missiles` and `handOf` as settable properties, not constructor params — the same as the loop's hooks (Task 8). Cost if wrong: none.
- **Task 9:** with no hand position from the model, the yoyo leaves from and returns to the thrower + 1 m (`vPosSrc`, :1058) — the screen gives the real hand in Task 10 if the model has the bone. Cost if wrong: the yoyo leaves from the chest.
- **Task 9:** the held yoyo's hiding while thrown (`SetEffect( XE_HIDE )`) is not done — drawing of hand-linked effects is out (Decisions 6). Cost if wrong: two yoyos show during a throw.
- **Task 10:** the research's "II_WEA_WAN_SEAL :739", ":195" and ":1962" are propItem.txt lines, not ids; the ids are 231, 431 and 2028 (defineItem.h:130, :222, :877) — the e2e found it; the unit fixtures now use the real ids. Cost if wrong: none.
- **Task 10:** a monster's ranged shot plays MTI_ATK1 — the converter keeps no dwUseMotion. Cost if wrong: a ranged monster may show another attack motion than Neuz's.
- **Task 10:** a monster's RANGE_ATTACK with dwItemID 0 or NULL_ID is refused — on the client a monster has no m_dwVirtItem (GetActiveHandItemProp is NULL). Cost if wrong: such a shot is not drawn.
- **Task 10:** the missile class comes from CreateSfx's switch (the wand class for XI_FIR_WAND01, XI_ITEM_WAND_ATK1 and six XI_NPC_RAN_*; the arrow class for XI_ITEM_RANGE_ATK1-4); any other XI is a plain CSfx in Neuz, which never reaches its target, and is not made. Cost if wrong: an odd monster missile is not drawn.
- **Task 10:** MAGIC_ATTACK, RANGE_ATTACK and CREATESFXALLOW about the own mover are ignored — the own shots and arrows are the attack loop's and its hit frame's; an echo would double them. Cost if wrong: none seen.
- **Task 10:** left out: the caster's flash at OnAttackMagic, the target's dwSndDmg2 on a missile's hit — drawing and sound polish. Cost if wrong: a missing flash and sound.
- **Task 10:** the effects' mesh models draw lod0 still — the .o3d frames are not converted for effects. Cost if wrong: an animated flight model stands still.
- **Task 10:** the hand positions come from the model's grips as last drawn (MoverViews.handAt), a frame late; with no model, the mover + 1 m. Cost if wrong: a missile leaves a few cm off.
- **Task 10:** the e2e's "a missile effect exists while in flight" is not asserted — the test hooks list no missiles; the test checks the shot's state and that nothing is sent. Cost if wrong: a missile drawn nowhere would pass it.
- **Task 10:** two fixes the e2e found: the Attack button's press is no more let go by the screen's per-step let-go of the canvas (attackLoop.attackButtonHeld); the gauge's layer has the pictures' size (it was an empty box). Cost if wrong: none.
- **Task 10:** the testkit's own ADD_OBJ now writes m_apIndex with the worn objects in the part slots, as the server's container has them (it wrote a fresh one, which a DOEQUIP then read as nothing worn: the e2e's bow lost its hand) — every other spec passes no worn ids, so their bytes are the same. Cost if wrong: none.
- **Task 10:** the e2e ran chromium and phone, 8/8 (jobs.spec.ts) — the full suites are the owner's.
- **Task 11:** the cast's cyan is the views' own at each step of CASTING1/2 (MoverViews.step), not a 'tint' event a tick — events a tick per caster would crowd the combat events out; 'tint' carries the shot's white flash. Cost if wrong: none (the same light).
- **Task 11:** Water Ball's every-4th-tick shots read the mover's own count (m_nCount), not g_nProcessCnt — the same rate, another phase. Cost if wrong: its later shots a tick or three apart from Neuz's.
- **Task 11:** a fire casting effect turns 180 - the caster's angle as the cast began; Neuz turns it with the caster each frame. Cost if wrong: a caster turning mid-cast leaves its effect facing the old way.
- **Task 11:** another player's casting speed is 1 (its DST_SPELL_RATE is not known); the own one's from its item adjustments. Cost if wrong: another fast caster's motion plays slower.
- **Task 11:** MAGICSKILL's end clears the skill in use (OnActEndMagicSkill's ClearActParam); MVRF_NOATTACK and the disguise's MTI_ATK1 are left out (buffs). Cost if wrong: none for M2's skills.
- **Task 11:** the cast effect plays for every skill with a dwSfxObj, KT_SKILL ones included, as DoUseSkill does. Cost if wrong: none.
- **Task 11:** a shot skill's OnMagicSkill only flashes until Task 12's ShootSkill. Cost if wrong: none at the end of Part B.
- **Task 11:** the views' cast tint has no test of its own (its colour and direction are the sparks' and combatEffects' tests). Cost if wrong: a cast not lit cyan.
- **Task 12:** one homing routine with a table of rules covers CSfxShoot, the two winds, the straight four and the wave; the bow skills fly the arrow's rules; Hot Air has its own — as the plan says. Cost if wrong: none.
- **Task 12:** left out of the drawing: the wave's 8 after-images, Arrow Rain's 100 falling arrows (its hit effect 557 plays once), the trails; Junk Bow's three arrows are drawn. Cost if wrong: thinner skill drawing.
- **Task 12:** the winds start at the caster's feet with the launch's 0.01 lift, the straight four at the caster + 1 m + 0.01 (Neuz puts them at the exact point on frame 0). Cost if wrong: a centimetre.
- **Task 12:** a winds' and the straight four's hit model plays where they aim (the feet, the target + 0.3 m, scale 2); CSfxShoot's at the missile. Cost if wrong: none seen.
- **Task 12:** a bow skill without arrows is refused in CMD_SetUseSkill with "Equip arrows first." (TID_TIP_NEEDSSKILLITEM for another bullet skill). Cost if wrong: none.
- **Task 12:** Strong Wind's push sets the target's m_vDeltaE to AngleToVectorXZ( angle, 0.4 ), the rules' fade doing the rest; the monsters' rank is the catalog's `rank`. Cost if wrong: a push of another length.
- **Task 13:** Piece 4's test "nothing for a skill that is no melee attack" was changed: CreateSkillSfx plays such a skill's dwSfxObj3 on its target (Ctrl.cpp:962-970). Cost if wrong: none.
- **Task 13:** a skill's lasting effect (dwSfxObj4) always plays for its seconds; Neuz skips it while the buff is already on (HasBuff), which the buffs' messages of Task 14 would tell. Cost if wrong: a refreshed buff shows its effect twice.
- **Task 13:** a yoyo skill's thrown yoyo (CreateYoyoSkill) is not drawn — drawing only; the skill's hit effect plays at the target + 1 m. Cost if wrong: no yoyo flies on a yoyo skill.
- **Task 13:** Blinkpool is refused in CMD_SetUseSkill with the web's own red line "Blinkpool is not in the browser yet." (plan Decisions 8). Cost if wrong: none.
- **Task 13:** the skillHit event carries the skill's level (for its time). Cost if wrong: none.
- **Task 14:** SETDESTPARAM's chg (a value the parameter is set to) is left out; the adj is added and RESETDESTPARAM's taken off; DST_CHRSTATE is bits. Cost if wrong: a buff that sets rather than adds shows the wrong number.
- **Task 14:** another mover's ADD_OBJ buffs are kept (its icons) but change none of its numbers here (its speed included): the browser keeps no other mover's parameters. Cost if wrong: another player under Quick Step is drawn at walking pace until the server corrects it.
- **Task 14:** the buffs' clock is the world's own steps (60 a second), not the page's. Cost if wrong: none (times are relative).
- **Task 14:** RemoveCommonBuffs drops the BUFF_ITEM and BUFF_SKILL buffs, keeps the rest. Cost if wrong: an odd buff kind outlives a death.
- **Task 14:** MoverBuffs was written straight after its test file (the red was the missing module). Cost if wrong: none.
- **Task 15:** the target bar's buffs are tested in buffStatus.test.ts with the own ones (one file, not targetBuffs.test.ts). Cost if wrong: none.
- **Task 15:** the buff tooltip is the icon's title, with plain names for the first jobs' parameters (the catalog's TID_TOOLTIP_DST_* are not converted); a harmful buff is tinted with a CSS filter near (255, 120, 255); the window's vertical layout (a double click) is left out. Cost if wrong: a plainer tooltip.
- **Task 15:** the e2e of Part B is two tests: a server buff (SETSKILLSTATE + SETDESTPARAM STA 2: the icon and the Character window's STA) and another player's Boomerang cast with nothing sent; the plan's Assist heal flow (a USESKILL answer) is left to the device checklist. Cost if wrong: the own heal flow is checked by hand only.
- **Task 15:** the e2e ran 12/12 on chromium and phone through the 5175 config.

## The final review

A fresh reviewer read the whole branch (4517c3a..b86ca33, before the rebase onto M1; the same work is now the rebased commits above). It found no Critical issues, three Important ones and five Minor ones. It checked the plan's five Review Focus items against the code, and all five hold.

**Fixed, each with a test that failed first:**
- **The own buff stats after a world change.** A new world starts the buff layer empty. A buff's end (RESETDESTPARAM) took STA, HP or speed below the server's value until the next entry. A reset now takes off only what the layer holds.
- **The buff box blocked the world under it.** Taps on monsters or the ground inside its box did nothing. Only the icons take the pointer now.
- **The Attack button's hold could stick** when the button went disabled under the finger (its target died). The joystick then stopped answering, or the wand kept shooting by itself. A let-go anywhere on the page ends the press now, and so does a press on the world.
- **The buff icons were remade every frame.** Their tooltips never showed, and phones did the work 60 times a second. They are changed in place now. (The reviewer graded this Minor; I graded it Important, by its effect.)

**Left for later (Minor):**
- **Missiles in the air at a world change.** The browser drops them and sends no SFX_CLEAR (the plan asked for none). Neuz clears them, and the server keeps only 32 ids, so ids left over could in time erase live ones. A REPLACE within the same world keeps missiles flying, where Neuz drops them.
- **Strong Wind's push angle.** It comes from the arrival step; Neuz keeps the step before's. The local push also truncates the angle and does not check a knocked-back target.
- **A model that fails to load.** With only a placeholder, a wand or bow tap still sends MAGIC_ATTACK or RANGE_ATTACK, but no missile and no SFX_ID follow. The melee path guards against this.
- **The last arrow.** When the stack runs out, the arrow slot still points at its old object id. Neuz takes it off first. Nothing reads it wrong today.

**Calls about the review:**
- I graded the buff icons Important, as above.
- The reviewer declined to judge some items. I left them as they are:
  - Safari's pointer events on a disabled button. The page-level let-go covers it now.
  - Drawing fidelity: checked with the device checklist.
  - The sight test's search radius: Piece 4's, unchanged.
  - Arrows outside 112-115: the Task 10 ruling.
  - The rulings of Tasks 9-14, and Decisions 9 and 13.

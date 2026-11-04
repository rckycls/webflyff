# Piece 7, milestone 5: flying — checkpoint

Branch `piece7-m5` in `FlyffWeb-worktrees/piece7`, from main `f304689` (M3). Research:
[docs/superpowers/specs/2026-11-04-piece7-m5-flying-research.md](superpowers/specs/2026-11-04-piece7-m5-flying-research.md).
Plan: [docs/superpowers/plans/2026-11-04-piece7-m5-flying.md](superpowers/plans/2026-11-04-piece7-m5-flying.md) (13 tasks,
12 Decisions), built inline task by task with a test written first for each.

## What changed

- **Protocol** (`packages/protocol`): PLAYERMOVED2, PLAYERBEHAVIOR2, PLAYERCORR2 (Neuz's turn angle in the pitch slot),
  PLAYERANGLE and MELEE_ATTACK2 sent; MOVERMOVED2, MOVERBEHAVIOR2, MOVERCORR2, SETFUEL, MELEE_ATTACK2 and SENDACTMSG read;
  ADD_OBJ keeps the fuel; DOUSEITEM and DOEQUIP carry the part and the ride's exact `fFlightSpeed` (-1 without one).
- **Converter**: `itemProps.json` gains `flight` on each ride (speed with its written text, turn, pitch, level limit,
  fuel maxima, stand motion); the data stage writes the optional `data/worldNoFly.json` from each world's `.wld`.
- **Rules** (`apps/client/src/world/sim`): `flight.ts` (ProcessActMsg2, ProcessState2, ProcessFlyMove with tracking,
  PresupposePos2), `flightCollision.ts` (ProcessCollisionFly with the objects' reflection, NOFLY, the 200 ceiling, the
  85 floor over cloud and GetFullHeight; ForcedSet2, HalfForceSet, the ghost's chase), and `ActionMover` flying (MODE_FLY,
  MODE_GROUND, the air swing and wand shot, flying monsters along their pitch without gravity); the rules take the
  others' flight reports with the air correction.
- **The world**: DOEQUIP of a ride flies or lands a mover; a flier's ADD_OBJ enters flying; SETFUEL, SENDACTMSG,
  MELEE_ATTACK2, SETPOS's ACC_STOP; the world's fly flag from `worldNoFly`; the ground knows water and the world's size.
- **Items**: rides used from the bag and the bar (flight level, the world's and the land's flight, the disguise), landing
  through the worn ride (refused over NOFLY, NOWALK and NOMOVE land, or sitting), the Accelor Fuel only in the air.
- **Controls**: `FlightControl` (ControlFlying: Space, X, W, S, A, D, the right drag; PLAYERMOVED2 with 37 frames, the
  angle at most every 30th step, PLAYERCORR2), the phone's stick and Accelerate/Turbo/Land, the air attack (Insert, the
  left button, the phone's Attack), Tab's targets and Z's tracking.
- **Drawing**: the flight camera (heading, pitch to 80, a tenth a step, the turbo's 90-degree view and 2 m), the ride
  model under the flier (a broom at the root bone), the pitch, the flight motions, the turbo gauge with the speed, and the
  flight music (BGM_TH_FLYING, then BGM_EV_LIGHTWING).

## Decisions (the plan's)

1. Neuz's LOOKUP bug (SetTurnState) is not copied: LOOKUP sets the look bits as LOOKDOWN does.
2. The other quirks are copied: Space let go in a turn keeps the thrust; PLAYERCORR2's pitch slot holds the turn angle;
   PresupposePos2's 1-degree look and x1.5 turbo.
3. The PC's keys are Neuz's; the arrows turn the camera; the right drag steers in flight.
4. The phone: the stick dives, climbs and turns; Accelerate held; Turbo toggles; Land uses the worn ride; Attack stays.
5. A click or tap selects a flying monster in the air (Neuz needs Tab).
6. Flying monsters are stepped by Neuz's rules for OBJTYPE_FLYING; their figure-8 is left out.
7. The turbo gauge copies RenderTurboGauge; the speed is a plain number (the digital font is not converted).
8. The flight camera copies CBackCamera in flight; the roll is off; a landing keeps the heading.
9. Others' drawn movement keeps the browser's interpolation and adds the pitch.
10. The Accelor Fuel is usable in the air only.
11. `data/worldNoFly.json` is an optional catalog.
12. DOUSEITEM and DOEQUIP always carry the f32 `fFlightSpeed` (-1 without one).

## Rulings (from the ledger, in order)

- - T3→T4/T5: FlightState is a plain interface the tests build directly. Ruling: Task 5 makes ActionMover's state satisfy it (its own field names map onto it, or a view object), whichever the ActionMover's fields allow — cost: none.
- Task 1: Ruling: encodeUseItem gains `part` (and fFlightSpeed) — a ride is used with part 13 (DPClient.cpp:10860-10866); the M3 travel decode test gains flightSpeed -1 — cost if wrong: one signature
- Task 2: Ruling: worldNoFly.json is written only when some world's .wld is in the client, and a World.inc failure is left to the worlds catalog — keeps one failure per bad file, and the fixture's ok counts — cost if wrong: a client with no .wld gets no catalog (every world flies, the .wld default)
- Task 3: Ruling: flightActMsg takes a fourth parameter, TURNMOVE's distance (Neuz reads m_fDistance from the mover; p3 is m_uRemnantCorrFrm) — cost if wrong: one signature
- Task 3: Ruling: flyMove also returns `turned` (tracking turned, so the caller queues PLAYERANGLE, ActionMoverState2.cpp:333-334) — the brief's return had no way to say it — cost if wrong: one field
- Task 3: Ruling: a message flightActMsg does not handle returns 0 (Neuz's switch falls to `return 1`); ATK1, ATK_MAGIC1, MODE_GROUND, DAMAGE and DIE come in Tasks 5 and 11 — cost if wrong: a stray PLAYERMOVED2 avoided
- Task 3: Ruling: presupposeFlight leaves out Neuz's ClipX/ClipZ (the FlightState has no world); the live move clips (Task 4) — cost if wrong: a prediction past the world's edge by up to 37 ticks
- Task 4: Ruling: Ground (packages/scene) gains optional waterTexture(x, z) and extent, which tileLand gives from the tiles' water bytes and the manifest — the 85 floor needs WTYPE_CLOUD and ClipX/ClipZ the world's size, neither of which Ground had — cost if wrong: two optional members. Task 12 must add both to WorldScreen's Ground proxy (it forwards each member by hand).
- Task 4: Ruling: approachFlight returns the frames left (it checks remnant > 0 itself) — the brief's void left the decrement to every caller — cost if wrong: one return value
- Task 4: Ruling: GetFullHeight's nearest box uses the box entry point (touchAabbLine, the IsTouchAABB_Line intersect), with the mesh bounds standing in for the box as elsewhere — cost if wrong: over overlapping objects the floor may be a different object's
- Task 5: Ruling: the old test "a flier is placed but not stepped" now reads "a flier whose ride is not known is placed but not stepped" (a FLY mover without a known ride prop still is not stepped), and the flying monster test now expects it to run on level; "MOVERANGLE changes nothing on the ground" stands as it was — cost if wrong: none (behaviour the plan asked for)
- Task 5: Ruling: a flier's ADD_OBJ sets the ride only (setRide), not modeFly: ClearState would wipe the snapshot's state — cost if wrong: a flier added mid-turn keeps its turn
- Task 5: Ruling: MOVERANGLE with no kept action fills the action's other fields from the mover's own report (Neuz's are the zeroed memory, which EnforcedGhostCorr would then force-set as a ground action with motion 0) — cost if wrong: a flier's motion is not reset to 0 for a tick
- Task 5: Ruling: FlightState gains an optional playMotion hook so a flier's motion goes through ActionMover.setMotion (motionSets for the model) — cost if wrong: one optional member
- Task 5: Ruling: a flier's DIE is ProcessActMsg2's (stand, no turn, DEAD, no x/z move, MTI_DIE1); ATK1, ATK_MAGIC1 and DAMAGE in the air stay Task 11's; HATTR_DIE (died) is reported but not acted on, as on the ground — cost if wrong: a flier over DIE land waits for the server's death
- Task 5: Ruling: WorldState.worldFly (default true) is the world's fly flag; Task 12 sets it from noFlyWorlds on entering a world — cost if wrong: every world flies until wired
- Task 6: Ruling: itemActions.ts is left as it is: its equip() already refuses part 13, and every ride goes through ItemUse (use, and the new land for the equipment cell) — cost if wrong: none
- Task 6: Ruling: the worn ride's equipment cell and the phone's Unequip call a new optional InventoryActions.land(id) → ItemUse.land (landRefusal, then DOEQUIP part 13 with the float); Task 12 wires land — cost if wrong: one optional action
- Task 6: Ruling: II_RID_RID_STI_MAGIC01 (26514) flies at any level, as Neuz's __NOLIMIT_RIDE_ITEM (defined in VersionCommon.h:78) — cost if wrong: one item id
- Task 6: Ruling: UseCheck gains optional level, worldFly, landAttr, disguised and sitting for the ride; Task 12 fills them in the world screen's check() — cost if wrong: defaults (own level, flight allowed, plain land) until wired
- Task 7: Ruling: FlightControl leaves Z, Tab and the attack (trackToggle, nextTarget, attack) to the air combat (Task 11) and the wiring (Task 12); it adds postAngle() for tracking's PLAYERANGLE — cost if wrong: none (Task 11's interface names them)
- Task 7: Ruling: CameraControls gains a public steer hook (a right mouse drag in flight, no 8 px threshold, touch never); KeyboardInput gains held/takePressed — cost if wrong: one hook
- Task 7: Ruling: the budget test switches keys every 10 steps (6 a second) with the mouse moving every step: an every-step W/S flip is past any hand and would send 60 PLAYERMOVED2 a second in Neuz too — cost if wrong: a scripted flip could pass 50/s
- Task 8: Ruling: flightStick takes an optional previous stick for the AXIS_OFF hysteresis (the walk's axis() needs the last frame) — cost if wrong: one parameter
- Task 8: Ruling: FlightButtons is three AttackButtons (the touch rule, held let-go, disabled state) in a .hud-flight group; attackButton.ts unchanged — cost if wrong: none
- Task 9: Ruling: followFlight returns the field of view in degrees (three's PerspectiveCamera.fov); player.ts is unchanged and Task 12 sets stage.camera.fov from it — cost if wrong: one wiring line
- Task 9: Ruling: the field of view steps once a rules step (Neuz's Projection runs once a drawn frame) — cost if wrong: the turbo's widening takes 10 steps at any frame rate
- Task 9: Ruling: entering flight, the offset starts from the ground camera's last place (else straight at its target) and eases from there — cost if wrong: none visible
- Task 10: Ruling: motionFor needed no change: a flight motion is set with MOP_FIXED, which motionFor already plays as it is — cost if wrong: none
- Task 10: Ruling: the turbo's white bar shows on even frames and the picture on odd ones, as RenderTurboGauge's `g_nRenderCnt & 1` draws the picture (the brief said odd for white) — cost if wrong: the flicker's phase
- Task 10: Ruling: a wing ride (IK3_WING, on the spine bones) is drawn at the feet like any non-stick ride; the views take loadRide as an option (Task 12 wires the asset store) — cost if wrong: wings sit low
- Task 10: Ruling: the pitch of others is followed an eighth a step (Decision 9's "adds the pitch" to the browser's interpolation); the own mover's is taken as it is — cost if wrong: none visible
- Task 11: Ruling: ATK1 and ATK_MAGIC1 in the air live in ActionMover.processActMsg2 (they need the mover lookup and the attack-state hooks), not flight.ts; the flight.test.ts cases are covered by attackLoop.test.ts's (motion FATK1, the ATK1 state) — cost if wrong: none
- Task 11: Ruling: tracking's target angles use getDegree (yaw, folded to ±180) and getDegreeX (pitch) for Neuz's xGetDegree — cost if wrong: the turn's direction near ±180 only
- Task 11: Ruling: the Tab list is the attackable flying movers within 15 degrees of the camera's forward, nearest first (Neuz builds m_aFlyTarget in its render order) — cost if wrong: the cycle's order
- Task 11: Ruling: AttackLoop.attackHeld (Insert, the phone's Attack held) and the left button drive the air attack; Task 12 wires Insert, Tab, Z and the phone's button — cost if wrong: none
- Task 12: Ruling: flight.spec.ts is written and run by a subagent (one file, the e2e harness's long read), the wiring by me — my context was the constraint late in a 13-task inline run — cost if wrong: one subagent's tokens
- Task 12: Ruling: the flight music plays for any player's take-off this client sees (CMover::EquipItem's IsPlayer(), not only the own), as Neuz does — cost if wrong: music at another's take-off
- Final: Ruling: the reviewer's "Declined to judge" list (blocked-target text repeating each step, CBackCamera's tracking mode, the charged release in flight, the landing camera snap, a dead flier's drift, the gauge's stretched inner picture, TURBO kept across landing, g_nItemDelay, the out-of-scope wings/boards/Ladolf/patterns) stands as is: each is faithful to Neuz, outside Decision 8, or out of the plan's scope — cost if wrong: small visual or timing differences

## Notes

- Task 2: note: the corpus "writes every catalog without a failure" test (stale on main, ok 15 vs 12) now reads ok 16 vs 12; failures [] still holds. Converted in the worktree: 82 rides, 46 worlds without flight.
- Task 2: fix (in Task 3): the client typecheck failed on two GameData fixtures without noFlyWorlds (hud.test.ts, helpers/movers.ts); Task 2 had run its tests but not the typecheck. Fixed in its own commit; typecheck 0, suite 194 files / 3477 passed.
- Task 8: note: the full suite had one timeout (gameDataStage "skills: a table that cannot be read", 5.8 s under load); the file passes alone (43/43). Not touched by Task 8.
- Task 11: note: "no skill in the air" passed before any change: SkillUse.cmdSetUseSkill already refused a FLY mover (an earlier piece); the test pins it
- Task 12: fix: flight.spec.ts found three app bugs, each fixed with a failing unit test first: (1) a worn ride's use ran M3's cast checks (the broom's castMs 2500 said TID_PK_FLIGHT_NOUSE) — itemUse.test "a worn ride lands" with castMs RED→GREEN; (2) an own ADD_OBJ with FLY found no ride (the wire's own worn list is empty) — worldState.test "an own ADD_OBJ with FLY and a ride enters flying" with the own equipment slot RED→GREEN; (3) a flier set down with no vertical speed hung in the air (stepFly kept m_bGround) — worldState.test "a flier set down from a hover falls" RED→GREEN. Also the own's PLAYERBEHAVIOR2 on entering flying went unsent (the first changes were taken before FlightControl existed): now sent on the first flying step not begun by a take-off — e2e "entering on a ride" RED→GREEN. Suite 199 files / 3545 passed; flight.spec 15 passed, 5 skipped (per-project).
- Final: review returned 0 Critical, 6 Important, 14 Minor. Re-graded by effect: Minor 1 (keys pressed on the ground fire at take-off), 2 (Tab moves the focus and can swallow the flight keys), 3 (arrows do nothing in flight though the docs promise it), 4 (a hit flier plays the ground flinch), 6 (phone labels under the 14 px constraint) and 9 (flight buttons leak listeners each world change) are raised to Important; they enter the fix pass with I1-I6.
- Final: minor (deferred): a queued PLAYERANGLE can follow a PLAYERMOVED2 (Neuz's SendPlayerMoved2 clears it, DPClient.cpp:10152)
- Final: minor (deferred): the disguise refusal (TID_QUEST_DISQUISE_NOTFLY) is never live: useCheck().disguised is false (needs the IK3_TEXT_DISGUISE buff lookup)
- Final: minor (deferred): no client refusal to mount off the ground (m_bGround == 0, WndField.cpp:2400-2405): the server's cast runs, then refuses
- Final: minor (deferred): SENDACTMSG applied only when its fly matches the mover's FLY (Neuz dispatches by bFly regardless)
- Final: minor (deferred): another's MELEE_ATTACK2 while busy is not queued (DPClient.cpp:3833-3836)
- Final: minor (deferred): Neuz's in-flight OBJMSG_STOP/ASTOP (ClearDest, ACC_STOP, reset MOVE) is not copied
- Final: minor (deferred): dead code FlightStep.stood and FlightControl.collided
- Final: minor (deferred): stale comments (WorldState.ts says fliers are never stepped; releaser's doc above loadRideModel; GROUND_FOV between imports)
- Final: fixed I1 another finger's let-go released a held phone button — attackButton.test "another finger's let-go does not release a held button" RED→GREEN; flight.spec phone: Accelerate survives the Turbo tap (passes)
- Final: fixed I2 the flight music for others' take-offs — worldSounds.test "another player's take-off plays nothing" RED→GREEN
- Final: fixed I3 others landed locally on NOFLY land — worldState.test "another flier crossing NOFLY land is not landed here" RED→GREEN
- Final: fixed I4 mounting/landing kept the destination (a landed other snapped back up) — worldState.test "a landing clears the destination" RED→GREEN
- Final: fixed I5 presses in the air ran the ground handlers — attackLoop.test "selects a flying monster only, and walks nowhere" RED→GREEN; the NPC menu's guard in WorldScreen has no unit test (the e2e world has no NPC beside the flier)
- Final: fixed I6 the ride model leaked — moverViews.test "a flier shows its ride's model and drops it on landing" (release called) RED→GREEN
- Final: fixed M1 (raised) keys pressed on the ground fired at take-off, and M2 (raised) Tab moved the focus — input.test "forgets the presses no one took, and prevents the default of the keys asked" RED→GREEN
- Final: fixed M3 (raised) the arrows did nothing in flight — backCamera.test "rotate() swings it round the flier" RED→GREEN
- Final: fixed M4 (raised) a hit flier played the ground flinch — worldState.test "a hit flier plays its ride's flinch" RED→GREEN
- Final: fixed M6 (raised) phone flight labels 11 px — flight.spec phone: each label's ::after is 14 px or more (passes); visible text Go / Turbo / Land, the aria-labels unchanged
- Final: fixed M9 (raised) the flight buttons and gauge were not disposed with the world, and the flight fields not reset — no unit test (disposeWorld has none); typecheck and the suites cover the change

## Evidence

Run in the piece7 worktree on 2026-11-04, after the final review's fix pass (`0575868`):

- `npm run typecheck`: exit 0.
- `npx vitest run`: 199 files, 3553 passed, 8 skipped, 0 failed. (One earlier full run had a 5 s timeout in
  `gameDataStage.test.ts` under load; that file passes alone, 43/43, and the later full runs passed.)
- `npx playwright test -c .superpowers/sdd/e2e-5175.config.ts --project=chromium --project=phone apps/client/e2e/flight.spec.ts`:
  15 passed, 5 skipped (the PC's keys on the phone, the flight buttons on the PC), 0 failed, 1.1 min.
- The game-data corpus test with the real client: 23 passed, 2 failed, the two known stale ones that fail on main too
  ("writes every catalog without a failure", now ok 16 against an expected 12; "skills: the levels are the rows …").
  The new "the rides and the worlds" passes.
- `npm run convert -- --only data` in the worktree: 16 ok, 82 warn, 0 failed; 82 rides keep their flight columns, and 46
  worlds have no flight.
- `flight.spec.ts` found three app bugs and a missing PLAYERBEHAVIOR2; a fresh final review (opus) found no Critical, six
  Important and fourteen Minor issues, six of which were raised to Important by their effect. Every one of the twelve was
  fixed with a failing test first, but for the world's disposal, which has no unit test (see the notes).
- Not run here: the whole e2e suite and the whole corpus suite (yours, in the checklist), and any real device.

## The owner's commands

In PowerShell, in the piece7 folder, with your own `npm run dev:client` stopped first: the tests of the device
checklist's milestone 5 section ([device-testing.md](device-testing.md)), and its steps on the PC and a phone.

**Convert** (the new catalogs; the ride models are already in the converted assets):

```
npm run convert -- --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client" --only "data"
```

Main's `dist/assets/data/itemProps.json` holds your high-rate gear values: when this milestone's assets go into main,
merge `itemProps.json` (add each ride's `flight`) rather than overwrite it, and add `data/worldNoFly.json`.

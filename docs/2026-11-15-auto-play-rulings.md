# Auto Play: builder's rulings and deferred minors (2026-11-15)

Branch `auto-play`. Every decision the builder made where the plan or spec left one open, with what it costs if wrong, and the final review's minor findings left for later. Copied from the build ledger.

## Rulings

-   only `hitBy` (hits on us). Ruling: add `{ kind: 'hit'; attackerId: number; victimId: number }` (all hits seen) to
- Task 1: Ruling: stopAfterMin rounds to whole hours (60-720), not any minute — spec says 1-12 h — cost if wrong: none
- Task 2: Ruling: WI_DUNGEON_FL_MAS 200 added to the farm block list — PartyDungeon.lua lists it (plan: every PartyDungeon.lua world) — cost if wrong: no farming in that dungeon
- Task 4: Ruling: AutoPlayHooks gets save(s) — the controller has no store or player id; WorldScreen saves via saveSettings — cost if wrong: none
- Task 4: Ruling: hooks.now() is the rules clock (world.nowMs()), not ServerClock (private) — pacing needs steps-consistent time — cost if wrong: none
- Task 4: Ruling: a refused item use is still paced — stops a refusal line every step — cost if wrong: retry after 800 ms
- Task 5: Ruling: slots are filled by tapping the slot and picking from a list (as the phone Action Slot window), not by drag and drop — one way for desktop and phone, owner-approved pattern — cost if wrong: desktop players cannot drag (could be added later)
- Task 5: Ruling: tabs sit under the pages (Neuz CWndTabCtrl via hud/guildCombat/tabs.ts), not at the top — V15 look — cost if wrong: none
- Task 5: Ruling: phone menu recount (10+9, 296 px) done here, not in Task 15 — the 19th line changes both at once — cost if wrong: none
- Task 5: Ruling: potion choices = kind2 11/12/14 or kind3 59 (isPotionProp) — the spec lists potions, refreshers, food, pills — cost if wrong: an odd consumable missing from the list
- Task 6: Ruling: EXP comes as its own event {kind:'exp', gained} (WorldScreen forwards own EXP increases), not on 'kill' — a kill packet carries no EXP — cost if wrong: none
- Task 6: Ruling: AutoPlayStats(started) takes the start time; potions counted by potionUsed() from the controller — cost if wrong: none
- Task 6: Ruling: stats test lives in autoPlayStopRules.test.ts, not a separate autoPlayStats.test.ts — cost if wrong: none
- Task 7: Ruling: OthersFighting.busy(m, now, us, party, isPlayer) keeps every hit itself (no ourHits parameter) and needs isPlayer to tell a player's id — a monster's own hits must not count — cost if wrong: none
- Task 7: Ruling: distances on the ground (x, z) — FlyFF farming is on the ground — cost if wrong: none
- Task 8: Ruling: hooks take TargetMover (structural) not Mover — tests use plain objects; WorldScreen casts to Mover for rankOf/attackable — cost if wrong: none
- Task 8: Ruling: added hooks isPlayer(id) and itemThere(id); lootingId getter — needed by OthersFighting and loot give-up — cost if wrong: none
- Task 8: Ruling: start() refuses while flying ('flying') or dead, as well as in blocked worlds — spec 6.8 — cost if wrong: none
- Task 8: Ruling: the commit after Task 8 does not typecheck WorldScreen (its hooks land in Task 9's commit, the next one) — cost if wrong: one intermediate commit fails tsc
- Task 9: Ruling: no unit test builds WorldScreen (only e2e does), so the wiring is covered by the e2e spec (Task 19) and the owner's live checks; the controller tests cover each reaction, plus a RF5 test (walk re-sent each second; passed at once, it pins Task 8's behaviour) — cost if wrong: a wiring slip shows only in e2e
- Task 9: Ruling: duel 'confirm' (a request) and 'count' (start) both stop the farm bot — spec section 9 checks a request and a start — cost if wrong: a duel request stops a bot (harmless, like a whisper)
- Task 9: Ruling: player hits come from 'hit' (SNAPSHOTTYPE_DAMAGE, any damage incl. skills), not 'skillHit' (would stop on a stranger's buff) — cost if wrong: none
- Task 9: Ruling: pickup lines by number (626/628/656), the text id definedText carries — cost if wrong: none
- Task 10: Ruling: the window opens on the Farm tab now (was Potions in M1) — the main feature first — cost if wrong: one tap
- Task 11: Ruling: the title flash lives in autoButton.ts (flashStoppedTitle) so it is unit-tested; WorldScreen calls it — cost if wrong: none
- Task 11: Ruling: the alert is WorldSounds.infOpen (SND_INF_OPEN), which follows the sound settings — no V15 alert sound exists for this — cost if wrong: a different sound
- Task 12: Ruling: buff entries of kind 'skill' hold the skill slot index (as the Action Slot); buffOf maps it to the skill id CBuffMgr keys buffs by — cost if wrong: none
- Task 12: Ruling: both test groups in autoPlaySkills.test.ts (not two files) — cost if wrong: none
- Task 13: Ruling: one cast gate for skills, the Action Slot and buffs — after a cast wait for the server's answer (skillOk, refusal, chain end) plus 1 s, or 5 s with no answer — avoids double casts — cost if wrong: a slower re-cast when the server is silent
- Task 13: Ruling: after a buff cast the bot stands (phase buffing) until it is answered — a move would cancel a cast — cost if wrong: up to 5 s idle
- Task 13: Ruling: buffs come after looting between fights (plan order said before) — loot first lets drops not vanish — cost if wrong: none
- Task 13: Ruling: a refusal without a skill (CLEAR_USESKILL, TID_GAME_SKILLWAITTIME 964) is charged to the bot's last own skill — cost if wrong: a 3 s wait on the wrong skill
- Task 14: Ruling: buff items = not worn (part < 0) with an effect that is not an HP/MP/FP heal (isBuffItemProp) — the catalog has no buff flag — cost if wrong: an odd item listed or missing
- Task 15: Ruling: the phone AUTO button sits above quick slot 3 (the slot straight over Attack), in Attack's column — directly above Attack is that slot — cost if wrong: a CSS move after the owner's device look
- Task 15: Ruling: the menu recount was Task 5's; the one e2e run of landscape.spec.ts is done with Task 19's e2e setup — cost if wrong: none
- Task 16: Ruling: the controller asks keepAwake(on) on start and stop; WorldScreen owns ScreenAwake and the once-a-page phone tip — the tip is per page, the controller per world — cost if wrong: none
- Task 17: Ruling: the saver opens from a 'Battery saver' button on the Farm tab (shown while running), not from an AUTO button panel (the button has none) — cost if wrong: none
- Task 17: Ruling: while the saver shows, the render loop is set to null and set back on close; the saver's text is redrawn from the rules step once a second — rules run from the worker clock — cost if wrong: none
- Task 18: Ruling: the hidden-tab test lives in autoPlayController.test.ts (the fake world is there; no autoPlayWiring.test.ts exists); it passed at once and pins Tasks 8 and 17 — cost if wrong: none
- Task 19: Ruling: the e2e spec checks the window, the bot engaging by itself, a whisper stop, the AUTO button, the saver and the phone long press; potion use and looting stay unit-tested (the testkit has no ground-item writer and the e2e Vagrant has no potions) — cost if wrong: those two are seen only in the owner's live checks
- Task 19: Ruling: dropped the 'less than full HP with no hit seen' kill-steal skip (spec section 8 allowed it): the client's monster max HP is an estimate; spec 6.3 notes it — cost if wrong: the bot may join a monster a player damaged and left more than 10 s ago

## Final review

- Final review: fresh reviewer (opus), verdict 'With fixes', 0 critical, 5 important, 9 minor
- Final: fixed screen-on lock kept after log out — 'dispose (log out, a world gone) lets the screen sleep again' RED→GREEN; WorldScreen disposeWorld + teardown call dispose and release; suite 2960/2960
- Final: fixed stuck target still chased by V15 auto attack — 'a stuck target is let go ... and so before walking home' RED→GREEN, new hook disengage (attackLoop.stop('ground'), focus cleared, dest cleared); suite 2960/2960
- Final: fixed wand hold dropping an unsent skill — 'a wand is not held again while a fired Action Slot waits for its answer' RED→GREEN; chainBusy adds reserved/commanding; suite 2960/2960
- Final: fixed buff item stall and stack drain — 'a buff item is used once ... skipped with a line' and 'a buff item whose buff shows ...' and 'pickBuff: BUFF_ITEM2' RED→GREEN; suite 2960/2960
- Final: fixed skill slot 0 lost on reload — 'a ready skill or a buff skill in job-skill slot 0 is kept' RED→GREEN; suite 2960/2960
- Final: fixed (re-graded from the reviewer's recommendation to Important: a throw would stop every rules step while running) — 'an error inside Auto Play stops it (error)' RED→GREEN; onError reports once; suite 2960/2960

## Deferred minors

- OthersFighting.hits and hittingUs grow while Auto Play is off (pruned only while running)
- autoPlayChanges computes the party and a ground-item Set on every play(), even when off
- ScreenAwake hold-release-hold race can keep a stale sentinel
- a loot walk cleared by stopOwnMover (tab hidden) is not re-sent; the item is skipped after 6 s
- letGoWand fires one last wand shot on each stop and before each cast
- the saver's pointerdown/keydown listeners are added per world load and never removed
- a pet's TID_GAME_REAPITEM while the bot loots counts as the bot's pick
- the kill count includes party kills in view
- fight() scans all movers to find its target (movers.get would do); no WorldScreen-level test for manual control vs the bot's own engage

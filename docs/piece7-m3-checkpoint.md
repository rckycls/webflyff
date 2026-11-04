# Piece 7 M3 checkpoint: Blinkwings and scrolls

The branch is `piece7-m3`, cut from main b9a7da7, in `FlyffWeb-worktrees/piece7`. The plan is
`docs/superpowers/plans/2026-11-04-piece7-m3-blinkwings-scrolls.md` and the research is
`docs/superpowers/specs/2026-11-04-piece7-m3-travel-research.md`. Execution was Native, task by task.

## What changed

- **Protocol** (`packages/protocol`):
  - **Client packets:** `PacketType.DOUSEITEM`, `STATEMODE` (the cast's cancel: `u32 4, u8 2`) and `RETURNSCROLL`
    (`i32` −1 to 2).
  - **Snapshots read:** `MessageType.STATEMODE` 0x00df (`mode, flag, the item's prop id with ON`) and `RETURNSCORLL`
    0x00ad (no body).
  - **ADD_OBJ:** a casting mover's item is read as `useItemId`.
  - **Pretend servers:** the client packets are decoded for them.
  - **Testkit writers:** `writeStateMode`, `writeReturnScrollAck`, `writeUpdateItem`.
- **Catalog:**
  - `data/itemProps.json` gains `castMs` (`dwSkillReadyType`) and, beside it, `sfxReady` (`dwSfxObj`).
  - `GauAccelBG.TGA`, `GauAccelInner.TGA` and `ButtRadio.bmp` are converted.
- **Client** (`apps/client`):
  - **`items/travelItems.ts`:** Neuz's refusals in `SendDoUseItem`'s order (casting, standing, flying; Kebaras and the
    house, "You cannot use a blinkwing at %s."; the guild war's box; the Scroll's buff), and the gauge's fill.
  - **`WorldState`:** each mover's `stateMode` and `cast`; an `itemCast` event on STATEMODE ON or for a mover met
    mid-cast.
  - **`EffectManager`:** `whileTrue`, the `CSfxReady` that lasts while its caster casts.
  - **`items/itemCast.ts`:** the own cast's one cancel. A walk forward or back, a jump, a ground tap, a hit, or ON while
    not standing sends it. A skill or an attack command during the cast sends it and is refused (`SkillUse`,
    `AttackLoop`).
  - **`render/CastGauge.ts`:** `CMover::RenderCasting` over the own head.
  - **`hud/messageBox.ts`:** `CWndMessageBox` with OK or OK and Cancel.
  - **`hud/selectVillageWindow.ts`:** `CWndSelectVillage`, the radios drawn from `ButtRadio.bmp`.
  - **`items/returnScroll.ts`:** the box, the village window, RETURNSCROLL, and the answer's use again.
  - **`hud/buffStatus.ts`:** item buffs with their item's icon; the Scroll's always blinks, and its double-click (two
    taps on a phone) goes back.
  - **`ItemUse` and the inventory:** the travel items through the refusals, from the bag (PC double-click, phone
    **Use**) and the task bar. With the shop window open, a use from the bag is refused.
  - **`WorldScreen`:** the wiring.
- **Browser spec** `travel-items.spec.ts`:
  - a Town Blinkwing with the cast and a SETPOS 1,500 m away;
  - a Blinkwing of Volcan to world 203;
  - the cancel;
  - the not-standing refusal (PC);
  - the Scroll of Return's whole flow, with the phone's window size checks.

## Decisions (the plan's)

1. **No casting motion:** the stand pose, the ready effect and the own gauge.
2. **The own gauge** starts when STATEMODE ON arrives. A mover met mid-cast gets the effect and no gauge.
3. **One cancel per cast.**
4. **The cast's guard** sits in the command paths, never in a per-frame check (such as the Attack button's enabling).
5. **Item buff icons**, with the Scroll's blink and its double-click back.
6. **The shop window** refuses use from the bag; the task bar does not check.
7. **The level limit** is the server's, after the cast.
8. **Travel itself** is Piece 5's REPLACE and Piece 6's SETPOS with the camera ease.
9. **The Escape Blinkwing from the bag** goes the Town Blinkwing's way. The Escape motion is out of scope, and so is
   flying (M5).

## Rulings made while building

Each says what it costs if wrong.

**Pre-flight:**
- Tasks 3, 4, 5 and 8 use the protocol's `STATE_BASEMOTION_MODE` and `StateModeFlag` instead of a literal 4. Cost: none.

**Task 1:**
- `AddedPlayer.useItemId` is optional, set only when it is not 0. A required field would change eight hand-built
  fixtures. Cost: none.

**Task 2:**
- `levelLimit` (`dwLimitLevel1`) is left out of the catalog. Gear uses that column too, and nothing in M3 reads it,
  because the level check is the server's. Cost: a later tooltip adds it.
- `sfxReady` is exported only beside `castMs`, because Neuz makes the ready effect only at STATEMODE ON. Cost: none.
- The plan named `packages/formats/test/propItem.test.ts`, which does not exist. The converter's tests and the corpus
  test cover the field instead. Cost: none.

**Task 5:**
- `ItemCast.interrupt` also re-arms its one cancel whenever it finds no cast. Cost: none.

**Task 6:**
- No `style.css` rule for the gauge: it styles itself inline, as `ChargeGauge` does. Cost: none.

**Task 7:**
- `MessageBox` takes no texts; the caller passes the text. Cost: none.
- Item buffs show in the buff window after the skill buffs. Neuz's `CWndBuffStatus` shows skill buffs only and draws
  item buffs in the world's own row. BUFF_EQUIP is left out, because its value is not defined in this source. Cost:
  the item icons sit elsewhere than in Neuz.
- The village window is modal, like the box before it. Cost: the player cannot move while choosing.
- `ReturnScroll.begin` also does nothing while the village window is open. Cost: none.

**Task 8:**
- `ItemUse` takes one options object, and the session sender does not gain `sendReturnScroll`. Cost: none.
- "a refusal: not standing" runs on the PC only; the phone's cancel is tested with the Jump button. Cost: no phone
  browser test of that refusal.
- The village window keeps `mobileScale` 1, and a phone rule sets its text to 14 px. Cost: none.

## Final review

A fresh Opus reviewer read the whole branch against the C++. It found 0 Critical issues, 1 Important and 7 Minor, and
all five Review Focus items hold. The fix pass:

- **Fixed: the own buffs at a world change (Important 1).** A REPLACE dropped every own buff, and with it the Scroll of
  Return's icon and its way back.
  - The own buffs are now kept at the transition and added to the new world's own mover, with the time each had left.
  - Test: `travel-items.spec.ts` "a Blinkwing of Volcan to another world" now checks the Scroll's icon after the
    REPLACE. It failed first, then passed.
- **Fixed: the message box on a phone (Minor 4, graded Important).** At the 0.7 scale the Scroll's question was 9.8 px,
  its last line cut, and OK and Cancel about 50×14 px.
  - `MessageBox` now keeps its own size on a phone, with a 14 px phone rule.
  - Test: the phone run of the Scroll test checks the box is 256 px wide, inside the screen, with 14 px text. It failed
    first, then passed.

**Rulings from the review:**
- **The relog half of Important 1 is a known gap.** The own ADD_OBJ's buffs come after the three banks, the pockets, the
  pet, the titles and the campus, and the own reader skips all of those (`own.ts` `readOwnAfterEquipment`, M2 Decision
  9). Reading them is a protocol task of its own. After a relog within the Scroll's 4 hours, its icon and its way back
  are missing, and a second Scroll is refused only by the server.
- **The BUFF_EQUIP reason is corrected.** It is defined (`#define BUFF_EQUIP 4`, `_Common/SkillInfluence.h:8`, gift-box
  equipment). It stays out because no M3 item gives one. Cost: such a buff shows no icon.

**Deferred minors:**
- **The shop-open refusal line never shows.** The inventory blocks the use first in shop mode; nothing is sent, which is
  correct.
- **A phone double-tap on the Scroll's icon may send RETURNSCROLL −1 twice,** if Android also fires `dblclick`. The
  second gets "You cannot use it during skill motion."
- **The standing check is stricter than Neuz's.** Neuz's `IsState( OBJSTA_STAND )` is a bit test, so walking backward is
  sent by Neuz and refused in the browser.
- **The village window's title stays 12 px on a phone** and is cut.
- **`ItemCast` re-arms on the `itemCast` event,** which a hidden page's overflow can drop. The own cast object would be a
  sturdier key.
- **Small gaps:**
  - LIMITED_USE also applies to the answer's use, where Neuz checks it only when it asks;
  - `sayRefusal` has no English fallback;
  - `useCheck` uses the literals 0 and 10469.

## Evidence

- **Unit tests** (`npm test`): 191 files, 3,441 passed, 8 skipped, after the fix pass too.
- **Typecheck** (`npm run typecheck`): exit 0.
- **Browser specs**, through the 5175 config on chromium and phone:
  - `travel-items.spec.ts`: 9 passed, 1 skipped (the phone's not-standing refusal), after the fix pass too.
  - `items.spec.ts`: 6 passed.
- **Corpus:**
  - The two M3 tests pass: the travel items' cast and ready effect (4805 `castMs` 10000, `sfxReady` 118; 10469
    `castMs` 4000), and the three pictures (112×16, 112×16, 84×14).
  - Two older tests fail on main b9a7da7 too, so they are not M3's: "writes every catalog without a failure" (it
    expects 12 catalogs; 15 are written since M1's quests and Piece 6) and "skills: the levels are the rows …" (M2's new
    level fields).
- **Convert:** 18 ok, 82 warn, 0 failed.

## For you, the owner

- **The device checklist:** `docs/device-testing.md`, "Piece 7, milestone 3".
- **The full runs:**
  - `npm test`
  - `npm run typecheck`
  - `npm run test:corpus` (with `FLYFF_CLIENT` set)
  - `npm run test:e2e:client`
- **The convert command** for another folder's `dist/assets`:
  `npm run convert -- --client "C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15/Client" --only "GauAccelBG*,GauAccelInner*,ButtRadio*,data"`

  In the main folder, merge `itemProps.json` with your high-rate gear values instead of overwriting it.

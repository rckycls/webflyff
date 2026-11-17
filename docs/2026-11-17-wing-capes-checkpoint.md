# Wing capes checkpoint, 2026-11-17

A custom item of this server. Branch `wing-capes` in `FlyffWeb-worktrees/vip-donate`, cut from local main bb191ae.
Not merged, not pushed. The server data is on the outer repo's branch `wing-capes` (`Blouflash-worktrees/vip-donate`).

## What it is

The server's 11 flying wings copied as cape-slot items (`IK3_CLOAK`, `PARTS_CLOAK`), for looks and stats only (no flight).

| ID | Define | Name | Wings |
|---|---|---|---|
| 20250 | `II_ARM_S_CLO_WING_FEATHER01` | Elegant White Wings Cape | RidRidWinFeather01 |
| 20251 | `II_ARM_S_CLO_WING_FEATHER02` | Elegant Black Wings Cape | RidRidWinFeather02 |
| 20252 | `II_ARM_S_CLO_WING_ANGEL01` | Angelic Wings Cape | RidRidWinAngel01 |
| 20253 | `II_ARM_S_CLO_WING_PROPHET01` | Divine Prophet Wings Cape | RidRidWinProphet01 |
| 20254 | `II_ARM_S_CLO_WING_ANGEL02` | White Angel's Wings Cape | RidRidWinAngel02 |
| 20255 | `II_ARM_S_CLO_WING_PROPHET02` | White Prophet's Wings Cape | RidRidWinProphet02 |
| 20256 | `II_ARM_S_CLO_WING_BUTTERFLY01` | Crimson Butterfly Wings Cape | RidRidButterPeaCock01 |
| 20257 | `II_ARM_S_CLO_WING_BUTTERFLY02` | Alabaster Butterfly Wings Cape | RidRidButterBuJun01 |
| 20258 | `II_ARM_S_CLO_WING_BUTTERFLY03` | Indigo Butterfly Wings Cape | RidRidButterMolPo01 |
| 20259 | `II_ARM_S_CLO_WING_BUTTERFLY04` | Translucent Butterfly Wings Cape | RidRidButterTrans01 |
| 20260 | `II_ARM_S_CLO_WING_BUTTERFLY05` | Translucent Dragonfly Wings Cape | RidRidDragonfly01 |

Owner's answers (2026-11-17): all stats +10 each (the Cloak of the Monkey's row: `DST_STAT_ALLUP` 10, defence 5,
level 1); GM only for now (`/ci`); tradeable and permanent; hidden while flying.

## How the client knows one

- The capes are only in the server's `Resource`, not in the client packs the converter reads. The gear sync
  (`tools/sync_resource_gear_catalog.ts`) now also **adds** the gear rows only `Resource` has, built as the data stage builds
  an item (`webItemPropOf`, exported from `tools/convert/src/data/gameDataStage.ts`; the stage's output is unchanged,
  checked byte for byte). Names come from `Resource/propItem.txt.txt`, models from `Resource/mdlDyna.inc`.
  `FLYFF_RESOURCE` points it at another Resource folder (a worktree's).
- A wing cape is an `IK3_CLOAK` whose item entry has a model of its own (`isWingCape`, `looks.ts`): every other cloak's
  entry names a worn part, so it has none.

## Drawing

- `looks.ts`: the cape worn in `PARTS_CLOAK` (not expired, not under a fashion cloak, not hidden) goes to `held.back`;
  the cloak slot shows no cloth. `heldModels` hangs it in a new slot, `back`.
- `packages/scene` `attachHeld(..., 'back')`: where Neuz puts a flier's wings (`MoverRender.cpp:610-646`): turned as
  Spine2, at the Neck. It adds nothing to the body's box (the name tag stays put).
- `moverModels.ts` `wingCape`: the wings keep their own skeleton and load their `_stand` and `_walk` motions, posed at the
  stand's first frame for pictures drawn once.
- `wingCapes.ts`: `playWing` (stand while still, walk while walking or running, blended), and the fit table.
- `MoverViews`: every frame the wings flap; while the wearer flies (`OBJSTAF_FLY`) they are hidden.
- Everywhere held items are drawn gets it: own character, other players (both bodies), the bag's preview, character select
  (flapping too), the beauty shop. Tooltips are the normal cloak tooltip (name, stats, description, icon).

## Fit (`wingCapes.ts`, `FITS`)

Tuned from close-ups of every cape on both bodies, from behind and the side, standing and at two running frames. The
flier's place left the butterfly tails on the floor and the prophet feathers across the legs. Now, in the wings' units:

| Wings | back | up | scale |
|---|---|---|---|
| Feather 01/02 | 0.1 | -0.18 | 0.9 |
| Angel 01/02 | 0.11 | -0.18 | 0.85 |
| Prophet 01/02 | 0.14 | -0.14 | 0.55 |
| Butterfly 01-04 | 0.08 | -0.16 | 0.58 |
| Dragonfly | 0.06 | -0.16 | 0.8 |

2026-11-18 (branch `wing-capes-lower`): the owner found them "way too high, almost at the back of the neck". The table
above is the lowered fit: the wing roots sit 0.14 to 0.18 below the Neck (the Neck is 0.205 above Spine2), on the shoulder
blades; the bigger wings sit further off the back and smaller, so their lower parts stay off the legs. Before, every
family was raised 0.04 to 0.3 above the Neck. No convert or gear sync is needed for this change.

The same for men and women. The tuning page was temporary and is not in the repo (the session notes folder has a copy).

## Checks

- `npm run typecheck`: passes.
- Unit tests: `looks.test.ts`, `wingCapes.test.ts` (new), `packages/scene/test/held.test.ts`, `moverViews.test.ts`,
  `gameDataStage.test.ts`: pass.
- e2e on `chromium` and `phone` (`E2E_CLIENT_PORT=5181`): `wingCapes.spec.ts` (new), `items`, `travel-items`, `lobby`,
  `flight`: 71 passed, 7 skipped (the keyboard-only tests on the phone, the phone-only tests on the desktop).
- `wingCapes.spec.ts` needs the gear-synced catalog; without the capes in `data/itemProps.json` it skips itself.

## After a merge (owner's FlyffWeb main)

```
npm run convert -- --only data
npx tsx tools/sync_resource_gear_catalog.ts
```
The second line must run after the first: it is what adds the 11 capes (it prints "Added 11 gear items only Resource has").
No model, texture or UI convert: the wing models, motions and icons are converted already.

# Ground mount prototype checkpoint, 2026-11-18

A custom feature of this server (the owner: mounts "like in MU, a fenrir"). It uses only FlyFF's own assets and our own
name, the **Grey Wolf Mount**. Branch `ground-mount` in `FlyffWeb-worktrees/guild-siege`, cut from local main bb191ae.
Not merged, not pushed. The server side is the outer repo's branch `ground-mount` (`Blouflash-worktrees/server-security-2`,
`docs/2026-11-18-ground-mount-deploy.md`: rules, patch, exe, VPS steps, VM tests).

## Rules (the owner's answers, 2026-11-18)

- **Creature:** FlyFF's Lawolf (`mvr_lawolf`), at 1.5 times its size.
- **Speed:** +50% (the item buff's DST_SPEED; the server's move check counts it).
- **On and off:** item 20270, permanent, from the bag or the task bar. Getting on takes a 1 s cast (the cast bar a ride
  has); getting off is at once, even while running. 5 s before getting on again (the server says "You can ride again in
  N s.").
- **Thrown off:** attacking or using a skill. Being hit is not.
- **Where:** where flying is allowed (not in dungeons, instances, Guild Siege or Arena). Also off on death, a shop,
  taking off on a ride, or a teleport into a world that does not fly. The server decides all of this; the client only
  draws.

## How the client knows

- **Mounted:** the player has the item's buff (`BUFF_ITEM` 20270), from SETSKILLSTATE, REMOVESKILLINFLUENCE and the
  ADD_OBJ buffs. This works for the own player and for every player in view. `isGroundMounted` (`mount/groundMount.ts`)
  also needs it alive, on the ground, and not swinging or casting. A swing or cast of one's own shows the rider off at
  once, before the server's removal arrives.
- **The item:** it is in no client pack, so the converter never makes it. `withGroundMount` adds `GROUND_MOUNT_PROP` to
  `data.itemProps` (`gameData.ts`). It shows the name, the description, the Baby Lawolf's icon, a 1 s cast and a stack of
  1. **No convert is needed.**
- **Speed:**
  - Own player: the server's SETDESTPARAM and profile speed, as for any speed buff.
  - Other players: `WorldState` gives a mounted player 1.5 times its table run (`syncMountSpeed`). FlyffWeb otherwise
    leaves other players' buffs out of their run, so without this a mounted player would lag and jump.
- **Use:** `useRefusal` keeps a ride's cast refusals for getting on (casting, not standing, flying). Getting off skips
  them (`UseCheck.mounted`).

## Drawing (`render/MoverViews.ts`, `render/moverModels.ts`)

- **The wolf:** `loadMountModel` assembles the Lawolf on its skeleton, a new one per rider, with its stand, idle1 and walk
  motions (`loopMotion`). `syncMount` adds it to the player's holder, as a flier's board is added. `drawMount` plays:
  - stand while still;
  - idle1 once after 8 s still;
  - walk while moving, sped up with the run (`wolfTimeScale`: the stride grows with the scale), slower walking or
    backing.
- **The rider:** V15's sitting-astride ride pose, the `-c` set of the Wooden Rocking Horse and the hoverbikes:
  - `genfstand1-c` (MTI 91) still;
  - `genfrunning1-c` (98) moving;
  - `genfdmg1-c` (100) when hit.

  `playRider` plays only what is drawn. The rules keep their own motion and frames, so nothing else changes.
- **Fit:** round 2 below replaced the first fit (wolf scale 1.5, rider fixed 0.9 up and 0.12 toward the tail).
- **Others:** every player of the two bodies with the buff is drawn the same way, on the desktop and on the phone.
  An invisible GM's wolf fades with its body (`fade` covers the holder). A disguised player is not drawn on a wolf.

## Round 2: the rider's seat and movement (branch `mount-feel`, 2026-11-18)

The owner found the first version's rider "very stiff and awkward". There were three causes:

- The wolf's walk carries its body 0.57 forward of its stand (its root bone, `Bip01`, at 0 against the stand's
  -0.382, times the scale). At each start the wolf slid forward from under the rider, who ran sitting on its hips; at
  each stop it slid back.
- The rider was fixed in the holder: no bob or rocking with the wolf, and the pair snapped round at each turn.
- The `-c` pose holds the knees together (a hoverbike's seat), so the legs sank into the wolf's back.

All of round 2 is drawing only (`mount/mountRig.ts`, the numbers in `MOUNT_FITS` and `MOUNT_FEEL` in
`mount/groundMount.ts`, `seatMount` in `render/MoverViews.ts`):

- **The wolf stays put** (`holdWolf`): it is drawn back by as far as its walk carries its root bone forward, and 0.26
  further, so the saddle is over the mover's place standing and running alike.
- **The saddle follows the wolf's back** (`saddleOf`): 30% of the way from its back bone (`Bip01 Spine1`) to its
  shoulders (`Bip01 Neck`), plus 0.25 up, eased over 0.04 s. The rider rises and dips with the wolf's steps.
- **The legs straddle** (`straddle`): after the motion's frame, each thigh is lowered 45°, turned out 10° and swung out
  30°, and each shin is turned back 50°, so the legs go down both flanks. A bone the motion did not write again is put
  back first, so the turns never add up. Getting off gives the motion's pose back.
- **Leaning** (`seatRider`, about the hips): 10° forward running, 4° walking, 4° back stepping back. The rider also takes
  40% of the back's rocking: the tilt from the wolf's hips to its shoulders, against its average of the last 0.8 s.
- **Turning:** the pair turns toward the facing over 0.1 s instead of at once. It banks into the turn, 0.03° per degree
  a second, at most 9°, and the rider leans 60% further.
- **Galloping:** the wolf's walk keeps its back level, so at a run (the walk played 1.2 to 2 times as fast, and more)
  the wolf rocks 3.5° nose down and up and lifts 0.06 once each stride, in time with the walk.
- **Getting on:** the wolf grows from half its size and the rider rises onto it over 0.3 s.
- **Name tag:** over the seated head (the rider's raise less 0.45).

Pictures and a film are in the notes folder (`ground-mount/round2`). Checks:

- typecheck: passes;
- `mountFeel.test.ts` (new, 13 tests) and `groundMount.test.ts`: pass;
- `groundMount.spec.ts` on `chromium` and `phone`: 2 passed.

## Controls

V15 style: the item in the bag (double-click on the PC, tap then Use on the phone), or on the task bar (F1-F9, or a tap
on the phone's slot). No new key and no new button.

## Checks

- `npm run typecheck`: passes.
- Unit tests:
  - `groundMount.test.ts` (new);
  - `worldState.test.ts` (another player's run with the mount);
  - `travelItems.test.ts` (getting off has no refusal);
  - `gameData.test.ts` (the catalog now always has item 20270);
  - `moverViews.test.ts`, `itemUse.test.ts`.

  234 passed.
- e2e on `chromium` and `phone` (`E2E_CLIENT_PORT=5191`): `groundMount.spec.ts` (new), `travel-items` and `flight`:
  26 passed, 6 skipped (the usual keyboard-only and phone-only splits), 0 failed. This was run with the 40 newer asset
  files of main's `dist/assets` copied in for the run (then removed). With the worktree's older assets, `travel-items`
  and `flight` fail only their "no errors" check, on 25 missing UI pictures. The new spec covers:
  - the bag's use, DOUSEITEM, the server's cast and buff;
  - the wolf drawn under both riders, the other rider's run at 1.5 times;
  - getting off while running, the wolf gone;
  - pictures `mounted-standing`, `mounted-running`, `dismounted`.
- Testkit: `writeRemoveSkillInfluence` added.

## After a merge (owner's FlyffWeb main)

Nothing to convert. Deploy FlyffWeb with the server's World exe and four Resource files (outer doc).

## What a nicer version would need

- **A real riding pose:** a new rider motion (legs bent round a body), made in a 3D tool and converted like the others.
  For now the hoverbike pose's legs are bent astride in code (round 2).
- **A run motion for the wolf:** for now the walk is sped up, with a gallop's rock and lift added in code (round 2).
- **Its own look:** a mount model of its own, or the wolf re-coloured (a texture set).
- **More mounts:** a table of creature, scale and seat per item (`MOUNT_FITS` by item), and the same server code keyed by
  an item list or an IK3 of its own.
- **Neuz-style polish:** a summon effect when mounting, a mount slot or window, a sound for the wolf's steps.

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
- **Fit:** the rider is raised onto the wolf's back (`MOUNT_FITS`): wolf scale 1.5, rider up 0.9, 0.12 toward the tail,
  the same for men and women. It was tuned from close-ups from the side and from behind, standing and running. The hands
  rest on the mane and the legs go down the flanks; the legs pass into the fur a little. The name tag goes up by half the
  seat.
- **Others:** every player of the two bodies with the buff is drawn the same way, on the desktop and on the phone.
  An invisible GM's wolf fades with its body (`fade` covers the holder). A disguised player is not drawn on a wolf.

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
  The ride pose is a hoverbike's, so the legs pass a little into the fur.
- **A run motion for the wolf:** the walk sped up stands in for it now.
- **Its own look:** a mount model of its own, or the wolf re-coloured (a texture set).
- **More mounts:** a table of creature, scale and seat per item (`MOUNT_FITS` by item), and the same server code keyed by
  an item list or an IK3 of its own.
- **Neuz-style polish:** a summon effect when mounting, a mount slot or window, a sound for the wolf's steps.

# Pre-registration lock (2026-11-15)

Anyone can sign up on the website. While the lock is on, only the accounts you list can log in to the game. Everyone
else sees this in the login error box, on desktop and on phone:

> Pre-registration only: the server isn't open yet.

Signing up stays open. The admin panel login is not touched. GM accounts get in only if you list them too.

## How it works

- **Where it checks.** In the gateway, which every browser login passes through. When a CERTIFY packet (the login)
  names an account that is not on the list, the gateway does not pass it to the Certifier. It sends the message
  above back as the Certifier's own error-text packet and closes the connection with code 4010. A changed client
  cannot get past it, because the check runs on the server.
- **Why the gateway is enough.** The login server and the cache server take nothing without the auth key the
  Certifier hands out after a good login. An account the gateway stops never gets one.
- **Native Neuz cannot go around it.** `deploy\5-Firewall.ps1` already blocks the Certifier's port 23000 from the
  internet, along with 28000, 5400, 3000-3999 and the rest. Only programs on the server itself, such as the gateway,
  can reach them. So I left the Certifier as it is: no C++ change, no rebuild. `Check-Server.ps1 -FromOutside` tests
  that these ports stay closed.
- **No restart.** The gateway reads the file again a second or two after you save it.
- **Players already in the game** when you switch the lock on stay in until they log out.

## On the rented server: the file

The file is **`C:\flyff-web\.env`**, next to `deploy.json`. No deploy or update script ever writes or copies over
it. Without the file, the lock is off.

1. Open PowerShell **as administrator** (only administrators can write in `C:\flyff-web`).
2. Run `notepad C:\flyff-web\.env`. If it asks "Do you want to create a new file?", click **Yes**.
3. Write these two lines, with your own account names:

   ```
   PREREG_ONLY=true
   PREREG_ALLOWED_ACCOUNTS=youraccount, friend1, friend2
   ```

4. Save with `Ctrl` + `S` and close Notepad.

Rules:
- Account names go after `PREREG_ALLOWED_ACCOUNTS=`, split by commas. Capitals and spaces do not matter
  (`Alice`, `alice` and ` ALICE ` are the same).
- `PREREG_ONLY=true` with an empty list lets **nobody** in.
- `PREREG_ONLY=false`, no `PREREG_ONLY` line, or no file at all lets **everyone** in.
- A typo such as `PREREG_ONLY=ture` keeps the lock **on**. The gateway log says so.
- Lines starting with `#` are comments. `FlyffWeb\apps\gateway\.env.example` is a full example.

## Add a name

1. `notepad C:\flyff-web\.env` (PowerShell as administrator).
2. Add the name to the end of the `PREREG_ALLOWED_ACCOUNTS=` line, after a comma.
3. Save. The player can log in a second or two later. Nothing needs a restart.

To check what the gateway now uses:

```
Select-String -Path C:\flyff-logs\gateway.log -Pattern 'prereg' | Select-Object -Last 3
```

The last `prereg:` line lists the names it took, for example
`prereg: on, 3 account(s) may log in: youraccount, friend1, friend2 (C:\flyff-web\.env)`.

## Switch it off at launch

In `C:\flyff-web\.env`, change `PREREG_ONLY=true` to `PREREG_ONLY=false` and save. Or delete the file. Everyone can
log in a second or two later, with no restart. The gateway log shows `prereg: off, everyone may log in`.

## Refused attempts in the log

Each refused login writes one line to `C:\flyff-logs\gateway.log`, with the time (UTC, like the rest of the log),
the player's address and the account name:

```
2026-11-15T10:42:07.512Z prereg-refused 203.0.113.9 account=stranger
2026-11-15T10:42:07.513Z close 203.0.113.9 172.31.238.55:23000 code=4010 up=0 down=0
```

To list them all: `Select-String -Path C:\flyff-logs\gateway.log -Pattern 'prereg-refused'`

## Server update (once, for this change)

This needs one step more than a normal site update: the new deploy scripts must be copied in **before** you run
`Update-FlyffWeb`. The new `Update-FlyffWeb` tells the gateway service where the file is
(`nssm set flyff-gateway AppParameters ... --env C:\flyff-web\.env`). An old one would leave the lock off.

1. **On your PC**, once both branches are merged into their `main` (FlyffWeb `prereg-login`, server repo
   `prereg-login`), in the server repo's `deploy` folder:

   ```
   powershell -ExecutionPolicy Bypass -File .\0-Make-Package.ps1 -FlyffWebOnly -NoAssets
   ```

2. Copy the `FlyffWeb-update-<date>.zip` to the server and unpack it into `C:\FlyFF-update`:

   ```
   mkdir C:\FlyFF-update
   tar -xf <the zip> -C C:\FlyFF-update
   ```

3. **On the server**, in PowerShell as administrator, copy the new deploy scripts in first:

   ```
   robocopy C:\FlyFF-update\deploy C:\FlyFF\deploy /E
   ```

4. Write `C:\flyff-web\.env` now (see above) if you want the lock on from the first minute. You can also do it later.
5. Run the update. Players lose the game for a minute or two:

   ```
   C:\FlyFF\deploy\run.bat Update-FlyffWeb -From C:\FlyFF-update\FlyffWeb
   ```

   Near the end it prints `pre-registration lock, the gateway says: prereg: on, ...` (or `off`).
6. Delete `C:\FlyFF-update`.

From now on `Check-Server.bat` also prints the lock's state. The game servers, the database and the firewall do not
change.

## Test it in the VM first

In the VM the gateway runs with `npm run gateway` ([servers-in-a-vm.md](servers-in-a-vm.md), part 4). There the file
is **`apps\gateway\.env`** in the VM's FlyffWeb folder, because `npm run gateway` now passes `--env apps/gateway/.env`.

1. Copy this branch's FlyffWeb into the VM as usual (keep your `gateway.config.json`) and run `npm ci`.
2. In the VM, `notepad C:\FlyFF\FlyffWeb\apps\gateway\.env`:

   ```
   PREREG_ONLY=true
   PREREG_ALLOWED_ACCOUNTS=<your test account>
   ```

3. Start the gateway: `npm run gateway`. Its first line must be
   `prereg: on, 1 account(s) may log in: <your test account> (apps/gateway/.env)`.
4. On your PC: `$env:GATEWAY_PROXY = 'ws://<VM-IP>:8090'; npm run dev:client`, then open `http://localhost:5174/play`.
5. Check these:

   | Do | Pass when |
   | --- | --- |
   | Log in with an account **not** on the list (sign one up if you need one) | The login error box says "Pre-registration only: the server isn't open yet." The gateway window prints `prereg-refused <address> account=<name>`. |
   | Log in with the listed account, written in capitals | You get the server list and can enter the world. |
   | Add the first account to the list and save, with the gateway still running | Within 2 seconds the gateway window prints the new list. That account can now log in. |
   | Do the first row on a phone (`http://<PC-IP>:5174/play`, landscape) | The same message, in the phone's login box. |
   | Set `PREREG_ONLY=false` and save | The window prints `prereg: off, everyone may log in`. Any account can log in. |
   | Delete the file | The window prints `prereg: off, everyone may log in (no file at ...)`. |

6. Sign-up (`http://localhost:5174/sign-up`) works the whole time.

## What changed (for the record)

- FlyffWeb, branch `prereg-login`:
  - `apps/gateway/src/prereg.ts`: reads and re-reads the file.
  - `relay.ts`: the refusal.
  - `server.ts`: the `prereg-refused` log line.
  - `main.ts`: the `--env` option.
  - `apps/gateway/.env.example`.
  - The root `npm run gateway` passes `--env apps/gateway/.env`.
  - `.gitignore` ignores every `.env`, so a test file can never go into a package.
  - `packages/protocol`: close code 4010 `PREREG_ONLY`, the message text and `encodeErrorString`.
  - `apps/client`: the message for close code 4010, in case the text packet does not arrive.
  - `docs/hosting.md`: step 6's gateway service line.
- Server repo, branch `prereg-login` (`deploy/` only):
  - `Common.ps1`: `$PreregFile`, `Get-GatewayParameters`, `Get-PreregStatus`.
  - `4-Setup-FlyffWeb.ps1` and `Update-FlyffWeb.ps1` set the gateway's command line. `Update-FlyffWeb` also never
    copies a `.env` and prints the lock's state.
  - `Check-Server.ps1` prints the lock's state.
  - `0-Make-Package.ps1`'s `PACKAGE.txt` now copies the scripts in before the update.
  - `README.md`.

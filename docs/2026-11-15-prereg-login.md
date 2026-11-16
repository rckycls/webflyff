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

## Sign-up cap and the VIP list (added 2026-11-17)

This is for the free month of VIP for pre-registration accounts: it stops one person from making a pile of accounts.

**The cap.** While `PREREG_ONLY=true`, one internet connection (IP) may make at most **3 accounts in all**. One
browser may make at most 3 too. The next try gets this on the sign-up page:

> This internet connection or browser already has 3 accounts, the most allowed during pre-registration.

- The count survives restarts. Accounts made before this update do not count.
- To change the number, add `PREREG_MAX_ACCOUNTS_PER_IP=5` (or any number) to `C:\flyff-web\.env`. `0` means no cap.
  It takes effect at the next sign-up, with no restart.
- With `PREREG_ONLY=false` (at launch) there is no cap. The old limit of 3 accounts per IP per hour still applies.
- The browser is counted with a cookie (`fw_id`) the site gives with the sign-up form.

**What it cannot stop.** A website cannot see a MAC address. Someone who switches to another network (or turns
airplane mode on and off on mobile data, which often gives a new IP) *and* clears their cookies or uses a private
window can still make more accounts. That is why the VIP list below marks only one account per IP and per browser.
Check it by eye before you hand out VIP.

**Every account made is recorded** in `C:\flyff-web\signups.jsonl`, one line each: the time (UTC), the account,
the IP, the browser ID, and whether pre-registration was on. The web service adds to it; nothing else writes it.
Keep it, and copy it to your PC now and then: the cap counts from it.

**The VIP list.** On the server, run:

```
C:\FlyFF\deploy\run.bat Prereg-List
```

It writes `prereg-list-<date>.csv` to your desktop. Open it in Excel or Google Sheets. One row per account made
during pre-registration, oldest first:

| Column | Means |
| --- | --- |
| `signed_up_utc` | When (UTC) |
| `account`, `ip` | The account and the IP it signed up from |
| `browser` | The first 8 letters of its browser ID (empty: the browser sent no cookie) |
| `accounts_on_ip`, `accounts_on_browser` | How many pre-registration accounts that IP and that browser made |
| `first_on_ip`, `first_on_browser` | Whether it was the first of its IP, and of its browser |
| `vip` | `yes` when it was the first of its IP and of its browser: one per connection and per browser |

Families and internet cafes share one IP, so a `no` is not always a cheat. Look at those rows yourself.

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

### Update for the sign-up cap (2026-11-17)

The same steps, after merging FlyffWeb `prereg-signup-cap` and server repo `prereg-signup-cap`: make the package,
unpack it, **copy the deploy scripts in first** (`robocopy C:\FlyFF-update\deploy C:\FlyFF\deploy /E`), then
`run.bat Update-FlyffWeb -From C:\FlyFF-update\FlyffWeb`. The new `Update-FlyffWeb` also gives the web service its
`--env C:\flyff-web\.env --signups C:\flyff-web\signups.jsonl`. Near the end it prints two more lines from the web
service:

- `prereg: on, at most 3 account(s) per IP and per browser (C:\flyff-web\.env)`
- `signups: 0 kept in C:\flyff-web\signups.jsonl, 0 of them during pre-registration`

Nothing else to write: no SQL, no new setting. The `.env` you already have keeps working, and the cap is 3 unless
you add `PREREG_MAX_ACCOUNTS_PER_IP`.

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

**The sign-up cap.** Run the web service the way you do for the admin panel tests (`npm run web`, with its
`web.config.json`). It reads the same `apps\gateway\.env` and keeps the sign-ups in `apps\web\signups.jsonl`. Its
first lines must be `signups: ... kept in apps/web/signups.jsonl ...` and
`prereg: on, at most 2 account(s) per IP and per browser`, once the `.env` has `PREREG_ONLY=true` and
`PREREG_MAX_ACCOUNTS_PER_IP=2` (2, so you need fewer accounts). Then:

| Do | Pass when |
| --- | --- |
| Sign up 2 accounts | Both are made. |
| Sign up a 3rd | The page says "This internet connection or browser already has 2 accounts, the most allowed during pre-registration." No account is made. The web window prints `signup <address> <name> prereg_limit:ip`. |
| Stop and start `npm run web`, sign up again | Still refused. At its start it printed `signups: 2 kept ...`. |
| Set `PREREG_ONLY=false`, save, sign up again | Made, with no restart (the hourly limit of 3 accounts per IP still applies). |
| `npm run prereg:list -- apps\web\signups.jsonl prereg-list.csv` | `prereg-list.csv` lists the 2 pre-registration accounts. The first has `vip` = `yes`, the second `no`. |

On your PC and in the VM, every device reaches the web service through your PC, so they all count as one IP. Other
IPs and the per-browser count can only be seen on the real site. There, a phone on mobile data with its Wi-Fi off is
another IP and another browser.

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
- FlyffWeb, branch `prereg-signup-cap` (2026-11-17):
  - `packages/protocol/src/web/prereg.ts`: the `.env` reader, moved here from the gateway so the web service shares
    it, with `PREREG_MAX_ACCOUNTS_PER_IP` (default 3).
  - `apps/web/src/signUpBook.ts`: the sign-ups file, the counts by IP and browser, and the `.env` read at each sign-up.
  - `signUpHandler.ts`: `429 {error:'prereg_limit', max}`.
  - `server.ts`: the `fw_id` cookie with each form ticket (HttpOnly, SameSite=Strict, Secure, path `/api/sign-up`,
    400 days).
  - `main.ts`: `--env`, `--signups`.
  - `preregList.ts` and `scripts/preregList.ts`: the CSV (`npm run prereg:list`).
  - `apps/client/src/site`: the sign-up page's message.
  - `npm run web` passes `--env apps/gateway/.env --signups apps/web/signups.jsonl`.
  - `hosting.md` step 6b.
- Server repo, branch `prereg-signup-cap` (`deploy/` only):
  - `Common.ps1`: `$SignUpsFile`, `Get-WebParameters`, `Get-PreregStatus` for either log.
  - `4-Setup` and `Update-FlyffWeb` set the web service's command line, and `Update-FlyffWeb` prints its lines.
  - `Check-Server` prints the cap and the number of sign-ups.
  - New `Prereg-List.ps1`.
  - `README.md`.

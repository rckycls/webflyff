# Admin panel: design (2026-11-15)

A private control panel for the owner (the superadmin) of the FlyFF V15 server and its FlyffWeb site, at
`https://admin.osflyff.online`. Approved by the owner section by section on 2026-11-14/15.

## 1. Why

The closed beta is live at https://osflyff.online. Today the owner does admin work by Remote Desktop into the VPS,
SQL scripts such as `BB_MakePoreotixAdmin.ps1/.sql`, and GM commands in the game. The owner wants one page for the
basic jobs ("do the basic cruds first for accounts, characters, server status, send item"). It has one user, the
owner. It is used now and then, mostly on a desktop, sometimes on the owner's phone.

## 2. Goals, non-goals, anti-goals

**Goals (version 1)**
- Accounts: find, view, create, reset password, change email, set GM level, ban until a date or forever, unban.
- Characters: find, view; while the game servers are stopped, rename, set penya, move to Flarine, delete, undo a delete.
- Server status: the 7 game servers, the gateway, the web service, SQL Server; players online now and who they are.
- Send items and penya to a character the game's own way; see and cancel sends not yet delivered.
- An audit log of every change and every login, readable in the panel.

**Non-goals (version 1)**
- Viewing a character's inventory (stored packed; later).
- Starting or stopping the game servers or Windows services from the page.
- Anything that must reach a player who is online now: kick, server notices, teleport. The game servers have no outside
  way in for these; the owner keeps using GM commands in the game.
- More than one admin, or roles.
- Site news, beta keys, trade or economy logs.
- Hard-deleting an account (guilds, mail and logs point at it). "Ban forever" stands in for it.

**Anti-goals (a failure even if it works)**
- The public site gains rights or reach: sign-up keeps its own SQL login `flyffweb_site` with its 2 procedures, and the
  public port never answers a panel request.
- Any SQL built from text, or a SQL login with table rights or `sa`.
- A change with no audit row.
- An edit that the Database server's memory can silently undo (section 4.3).
- A new port open in the firewall, or a new way into the game servers.

## 3. Decisions

| Decision | The owner's choice | Considered |
| --- | --- | --- |
| Scope | Basic CRUD first: accounts, characters, status, send item | Logs, news, keys: later |
| Login | Panel-only name + password + 6-digit authenticator code, from anywhere | + IP allowlist (lock-out risk); not on the internet at all (no phone) |
| Where it is built | **Inside the site's web service** (`apps/web`) | A separate admin service (recommended, not picked); the webshop's Laravel admin (dropped: PHP is not on the VPS) |
| Address | **`admin.osflyff.online`** | `osflyff.online/admin` (shares the game page's origin) |
| Character edits | **Only while the servers are stopped**; a later piece changes the Database server so they work while it runs | Maintenance-only forever |

Why the subdomain matters with approach B: the game page runs with `'unsafe-eval'` in its CSP. On the same origin, a
script bug there could call the panel with the owner's cookie. A different host gives the panel its own origin and
cookie.

## 4. Facts the design rests on (from the source)

### 4.1 What the game reads fresh at every login (safe to change while the servers run)
- **Ban:** the Certifier calls `ACCOUNT_DBF.dbo.LOGIN_STR` at each login (`Source/CERTIFIER/DBManager.cpp:106`). It
  answers `fError = '9'` ("Block") when `ACCOUNT_TBL_DETAIL.BlockTime >= today` (`char(8)`, `yyyymmdd`). New accounts
  get `BlockTime = yesterday` (`usp_CreateNewAccount`). A ban bites at the next login. A player online keeps playing.
- **Password:** `ACCOUNT_TBL.password`, the form `hashPassword` in `packages/protocol/src/crypto/password.ts` makes. It
  is checked by `LOGIN_STR`.
- **GM level:** `ACCOUNT_TBL_DETAIL.m_chLoginAuthority` and `CHARACTER_01_DBF.dbo.CHARACTER_TBL.m_chAuthority` of
  every character of the account, as `BB_MakePoreotixAdmin.sql` does (outer repo). Letters
  (`Source/_Common/authorization.h`): F player, J helper, L GM 1, M GM 2, N GM 3, O operator, P administrator. The
  character's authority is taken from the database even when the Database server has it in memory
  (`CMover::Copy`, `Source/_Network/Objects/Obj.cpp:721`, copies `m_dwAuthorization` outside the `bAll` part).
- **Item and penya sends:** a row in `CHARACTER_01_DBF.dbo.ITEM_SEND_TBL` (`m_idPlayer char(7)`, `serverindex '01'`,
  `Item_Name` = the item id as text or `'penya'`, `Item_count`, `m_nAbilityOption` = upgrade level, `ItemFlag 0`). The
  Database server hands it over when the character enters the world (`DbManagerJoin.cpp:401` `SendItemtoCharacter`;
  `CHARACTER_STR 'S4'` reads rows with `ItemFlag = 0`; it sets `ProvideDt` and `ItemFlag = 1`). `GetSendItem`
  (`DbManager.cpp:1374`) takes a number as an item id, else a name, and `'penya'` as gold. FlyffWebShop's
  `ItemDeliveryService.php` writes the same table (reference only).

### 4.2 Online
- A character is in the game when `CHARACTER_TBL.MultiServer > 0` (`usp_WebOnlineCount` uses this). The flag is
  cleared only when the World server starts: it calls `uspInitMultiServer` through the Database server
  (`WORLDSERVER/ThreadMng.cpp:254`, `_Database/DbManager.cpp:7485`). `deploy/Stop-Servers.ps1` ends the servers by
  force when they do not close. So after a stop, everyone who was online still has `MultiServer > 0` until the next
  start. While the servers are stopped, the flag means nothing.

### 4.3 The Database server's memory (why character edits wait for stopped servers)
`3. Database.exe` keeps the characters of up to 5000 accounts in memory once they have logged in
(`Source/_Database/AccountCacheMgr.cpp`, `MAX_CACHE_ALLOC`). When such a character enters the game again, it keeps
its name, penya, position, job, inventory and bank from memory, not from the database
(`DbManagerJoin.cpp:339-392`: `CMover::Copy(&mover, FALSE)` on a cache hit). The next save writes them back. So a
direct SQL change to those fields is lost while the Database server runs. The memory is gone when it stops.
**Rule:** rename, set penya, move, delete and undo-delete run only while the Database server and the World server
are both stopped (none of the Database ports `7000`, `24000`, `7200` and not the World port answers). Then nobody can
be in the game, so `MultiServer` is ignored (4.2). The procedures cannot see ports, so the service checks the ports
right before each such call and logs what it saw.

### 4.4 Character delete
The game marks a deleted character `isblock = 'D'` with an `End_Time` (the game's own delete is in
`Source/_Database/DbManager.cpp`, around line 276-313, `CHARACTER_STR 'D1'`). `CHARACTER_DELETE_STR` removes
`'D'` rows older than 7 days. Undo = back to `isblock = 'F'`, only within those 7 days and only if no live character
of the account holds the same `playerslot`.

### 4.5 The live server and deploy
- The web service (`apps/web`, NSSM service `flyffweb-site`) listens on `127.0.0.1:8091` behind Caddy's `/api/*`. Its
  settings are `C:\flyff-web\web.config.json`, readable only by SYSTEM and Administrators.
- The outer repo's `deploy/2-Setup-Database.ps1` runs `apps/web/sql/Install-WebLogin.ps1` with a random password kept in
  `deploy.json` (`webSqlPassword`); `deploy/4-Setup-FlyffWeb.ps1` writes `web.config.json`.
- `deploy/Common.ps1` `Get-Caddyfile` cuts the Caddyfile from `docs/hosting.md` step 8 and **requires exactly one
  site line** in that block. The admin site block must be a separate code block, and `Get-Caddyfile` must learn to
  add it.
- Server ports: `deploy/Common.ps1` server list (Account 12000, Certifier 23000, Database 7000/24000/7200, Core
  4000-4002, Login 28000, Cache 5400 or `CacheServer.ini`'s Port, World 3000 + key). Gateway `127.0.0.1:8090`.
- The server security review (`docs/server-security-review-2026-11-11.md`, outer repo) still has H6-H10 and H19 open,
  all in the World server. The panel never talks to the game servers, so it neither touches nor widens them.

## 5. Design

### 5.1 Where it runs
- **Same process, second listener.** When `web.config.json` has an `admin` section, `apps/web/src/main.ts` also starts a
  second HTTP server on `127.0.0.1:8092`. It serves only the panel: its page, its script and style, and its `/api/...`
  routes. Without the section nothing listens on 8092. The public server on 8091 is unchanged and has no admin routes.
- **Its own SQL login.** The panel uses its own pools, logged in as `flyffweb_admin`. Sign-up keeps `flyffweb_site`.
- **Caddy.** A new site block `admin.osflyff.online` (in production, `admin.` + the site domain) passes everything to
  `127.0.0.1:8092`. It has its own headers:
  - `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
    connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`;
  - HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`;
  - `Cache-Control: no-store` on API answers;
  - a request body limit of 16 KB.

  The 8092 server sends the same headers (except HSTS) and enforces the same body limit itself. The panel stays safe
  without Caddy, as in the VM.
- **DNS.** One A record, `admin`, pointing to the VPS. Caddy gets the certificate by itself over 443, which is already
  open.
- **The page.** Plain HTML, CSS and a small TypeScript bundle in `apps/web` (for example `apps/web/admin/`), built
  separately from `apps/client`. It loads nothing from the game. Every value is shown with `textContent`, never
  `innerHTML`. Layout is desktop-first and works at phone width.

### 5.2 Settings
- `web.config.json` gains:
  ```json
  "admin": {
    "listen": { "host": "127.0.0.1", "port": 8092 },
    "origin": "https://admin.osflyff.online",
    "sql": { "user": "flyffweb_admin", "password": "..." },
    "credentialsFile": "C:\\flyff-web\\admin-login.json"
  }
  ```
  Optional: `sessionIdleMinutes` (30), `sessionMaxHours` (12), the servers to probe as host and port each (defaults
  `127.0.0.1` and the ports in 4.5), and the converted game data folder for the item list. The SQL host, port and
  database names come from the existing `sql` section.
- **The panel never takes the site down.** A bad value in the `admin` section, or a missing or bad `admin-login.json`,
  leaves port 8092 closed and writes one loud log line naming the problem. Sign-up and the status keep running. The
  rest of `web.config.json` is checked as today.
- `admin.origin` must be `https://...`. The one exception is test runs: `http://127.0.0.1:<port>` or
  `http://localhost:<port>`, and only when `admin.listen.host` is `127.0.0.1`.
- **`admin-login.json`** holds the one admin: `user`, `passwordHash` (scrypt from `node:crypto`, with its salt and
  cost) and `totpSecret` (160 bits, base32). It is a separate file, so `4-Setup-FlyffWeb.ps1` can rewrite
  `web.config.json` without wiping the owner's login. It sits in `C:\flyff-web`, which only SYSTEM and Administrators
  can read.
- **`npm run admin:setup -- --file <path>`** is a `tsx` script the owner runs on the VPS:
  - it asks for the name and the password twice, and makes a new authenticator key;
  - it prints the key as base32 and as an `otpauth://` link, so it can be typed into any authenticator app;
  - it asks for one current code to prove the app has the key, then writes the file;
  - running it again sets a new password and a new key; the old app entry stops working.

  The service reads the file at start; a restart picks up a change.

### 5.3 Login and sessions
- **The form:** name, password and 6-digit code, posted to `/api/login`. Any mistake gives the same answer ("wrong
  name, password or code"). Comparisons are constant-time.
- **Codes:** TOTP per RFC 6238 (SHA-1, 30 s, 6 digits), built on `node:crypto` with no new dependency. It accepts the
  step before and after. A step that was used once is refused after that.
- **Limits:**
  - 5 failures from one address in 15 minutes: that address is refused for 15 minutes;
  - 20 failures in any hour from everywhere: login closes for everyone for 1 hour.

  Every failure is a log line and an audit row. The client address comes from `resolveClientAddress` with
  `trustedProxies`, as sign-up does.
- **Sessions:**
  - 32 random bytes, kept only in memory, so a restart logs everyone out;
  - cookie `__Host-admin`, with `Secure; HttpOnly; SameSite=Strict; Path=/`;
  - ends after 30 minutes idle or 12 hours, or at Logout. It is not tied to the IP (phones change IP).
- **Forged requests:**
  - `GET` never changes anything;
  - every change is a `POST` with a JSON body (`Content-Type: application/json` required);
  - its `Origin` must equal `admin.origin`;
  - it must carry the header `X-Admin-Token` equal to the session's CSRF token, which the page gets from
    `GET /api/session`.
- **The front page** shows the last 10 logins and failed logins (time, IP) from the audit log.

### 5.4 Database
- **Install script.** A new `apps/web/sql/admin-login.sql` and `Install-AdminLogin.ps1`, modelled on
  `web-login.sql` / `Install-WebLogin.ps1`. It makes:
  - the login `flyffweb_admin` (password policy on), with users in `ACCOUNT_DBF` and `CHARACTER_01_DBF`;
  - the panel's procedures, named `usp_Admin*`;
  - the table `ACCOUNT_DBF.dbo.WEB_ADMIN_LOG`, so the 04:00 backup covers it;
  - `GRANT EXECUTE` on those procedures only: no table rights, no other database.

  It can be run again.
- **Procedures.**
  - Each does one job, takes typed parameters, checks its own rules (for example "character offline", "slot free") and
    returns a result code plus the values before and after.
  - Each touches one database (no cross-database ownership chaining), so a job that spans both (GM level) is two calls,
    each logged.
  - The service only calls procedures, with typed `mssql` parameters.
  - The builder fixes the exact list: search, get, create, password, email, authority, ban; character search, get,
    rename, penya, move, delete, undelete; online list; send, list sends, cancel send; log begin, log end, log read.
- **The audit log: log first, then act, then finish.**
  - `usp_AdminLogBegin` gets the admin, the address, the action, the target and the details before the change, and
    returns an id. Then the action runs. Then `usp_AdminLogEnd(id, result, details after)` closes the row.
  - A row left "started" means the service stopped halfway; the log page shows it.
  - Logins and failed logins get rows too.
  - The panel never edits or deletes log rows.
  - Never logged: a password, a code, the TOTP key or a session id (a reset logs "password changed").

### 5.5 Pages
```
admin.osflyff.online
[Status] [Accounts] [Characters] [Send] [Log]          Poreotix · Logout
Find: [ account, email or character name ]  [Find]
```
- **Status** (refreshes every 30 s):
  - each of the 7 servers up or down, by port probe;
  - the gateway and SQL Server (a query works); the web service is the page itself;
  - players online now, and a list: name, level, job, map, account;
  - a line saying "Servers running: character edits locked" or "Database and World stopped: character edits open";
  - while the World server is stopped, the online list says the flags are stale instead of listing names.
- **Accounts:**
  - Search by account (prefix), email or character name, at most 50 results.
  - The account view shows its fields, GM level by name, ban state and its characters.
  - Create: the same checks as sign-up (`checkSignUp`), except that reserved names are allowed.
  - Reset password, change email, set GM level (asks to confirm).
  - Ban until a date (shown and sent as `yyyy-mm-dd`, stored `yyyymmdd`) or forever (`99991231`, asks to confirm), with
    a reason that is written to the audit log. Unban sets `BlockTime` to yesterday, as a new account has.
- **Characters:**
  - Search by name or account; the view shows level, job, penya, map and position, created, play time, online.
  - Edits are refused while the Database or World server runs (4.3); the page says why:
    - rename, with the game's name rules (`validateCharacterName`, `apps/client/src/lobby/validation.ts`, moved to
      `packages/protocol` so both use one copy) and a free name;
    - set penya, from 0 to the game's limit;
    - move to Flarine: world 1 at the game's own Flarine spot, found by the builder;
    - delete the game's way, and undo within 7 days if the slot is free (4.4).
- **Send:**
  - Pick a character, then an item searched by name in the game's item list. The list comes from FlyffWeb's converted
    data (`dist/assets/data/itemProps.*.json` via `index.json`), which the VPS already has.
  - Count from 1 to the item's stack size. Upgrade `+0` up to the game's maximum, only for items that can be upgraded.
  - Penya from 1 up to a cap: the character's penya, plus pending penya sends, plus this amount, must stay within the
    game's gold limit.
  - Sends work while the servers run. They arrive when the character next enters the game.
  - A list of all sends not yet delivered (`ItemFlag = 0`), each showing whether the panel or the game made it. The
    game writes rows too (`uspProvideItemToCharacter`, `Database.sql:4793`; `GUILD_STR 'U7'` sends penya to guild
    members). The panel marks its own rows with `ItemBillingNo = 'ADMIN' + the audit id`. **Cancel works only on the
    panel's own rows**, and only while the character is not in the game: cancelling a game row would destroy a
    player's items. The builder checks that the delivery path ignores `ItemBillingNo`.
- **Log:** newest first, 50 per page, filtered by account, character or action.

### 5.6 Attacks and the kill switch
- **Stolen password:** the code is still needed. **Guessing:** the limits (5.3). **Forged clicks:** SameSite, Origin
  and token. **Injected script:** the CSP and `textContent`. **SQL injection:** procedures with typed parameters only.
- **A panel bug:** `flyffweb_admin` can run only the panel's procedures.
- **A public-site bug:** it cannot reach the panel, which has a different port, a different host and its own SQL login.
- **Kill switch:** remove `admin` from `web.config.json` and run `nssm restart flyffweb-site`. On a server set up by
  the deploy scripts, also set `adminPanel` to `false` in `deploy.json`, so the next setup run does not turn it back on.
  The panel and every session are gone; sign-up and the game carry on. Running `admin:setup` again replaces the
  password and the key.
- The Windows account the site service runs as is unchanged. Checking it is a follow-up, not part of this piece.

### 5.7 Deploy
- **FlyffWeb `docs/hosting.md`:** a new step 8b. It has the admin Caddy block in its own code block, the DNS record,
  `Install-AdminLogin.ps1`, `admin:setup` and the restarts. Step 8's block keeps exactly one site line.
- **The outer repo's `deploy/`, in its own worktree and branch:**
  - `deploy.json` gains `adminPanel` (`true` / `false`, default `false`);
  - `2-Setup-Database.ps1` runs `Install-AdminLogin.ps1` with a random `adminSqlPassword` kept in `deploy.json`;
  - `4-Setup-FlyffWeb.ps1` writes the `admin` section only when `adminPanel` is `true`, and says if
    `admin-login.json` is still missing (the panel then stays closed until `admin:setup` runs);
  - `Get-Caddyfile` adds the step 8b block with `admin.<domain>`;
  - `Check-Server.ps1` checks port 8092;
  - `admin:setup` stays a manual step for the owner.
- **The live server now:** the owner adds the DNS record, pulls the update, runs `Install-AdminLogin.ps1` and
  `admin:setup`, adds the Caddy block, then restarts `flyffweb-site` and Caddy. The deploy doc lists these with what
  success looks like.
- **Order:** the Hyper-V VM first, then the VPS.

### 5.8 Testing
- **Unit tests (vitest), run by the builder:**
  - settings checks, scrypt, TOTP against RFC 6238's test vectors, the login limits, session expiry;
  - the CSRF checks (Origin, token, content type);
  - each handler against a fake store;
  - the send caps and the name rules.
- **SQL:** the owner runs `Install-AdminLogin.ps1` and a check script in the VM, then the live server.
- **In the VM:** the web service runs in the VM with `admin.origin` `http://127.0.0.1:8092`, and the owner opens it in a
  browser inside the VM. Running it on the PC also works: the SQL host and the probe hosts are then the VM's address.
- **Browser:** a small Playwright check in Chromium (desktop + phone width) of login and one search against a fake
  store. Full runs go to the owner with commands and pass criteria.

## 6. Calls made after the builder check (not the owner's; the owner can overrule)
- Character edits need the Database **and** World servers stopped, and then the stale `MultiServer` flag is ignored
  (4.2, 4.3).
- The panel never stops the site: bad panel settings only keep 8092 closed (5.2). `deploy.json`'s `adminPanel` flag
  keeps the kill switch from being undone by a setup run (5.6, 5.7).
- Cancel only touches the panel's own sends; game-made sends are shown but not cancellable (5.5).
- VM tests use `http://127.0.0.1:8092` in a browser in the VM. The service sends the security headers itself
  (5.1, 5.2, 5.8).

## 7. Left to the builder
- The exact procedure list, names and result codes.
- How the panel's script is bundled.
- Whether a terminal QR code is possible without a new dependency.
- The Flarine spot, the game's gold limit and its upgrade limit.
- The exact statement the game uses to delete a character.
- How the item list is loaded and cached.

## 8. Later pieces (not version 1)
- **Database server:** a way for the panel to make it forget one account (for example a table it polls), so character
  edits work while it runs. It needs a C++ change, a rebuild and a VM test. The owner wants this later.
- Inventory view; kick and server notices; start and stop servers; more admins and roles; economy logs; news; beta keys.
- Check which Windows account `flyffweb-site` runs as, and lower it if it is LocalSystem.

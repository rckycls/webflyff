# FlyffWeb website: home page, sign-up and the game at /play — Design Spec

Date: 2026-11-11. Status: approved in conversation by the owner; this written spec awaits their review.

## 1. Brief

- **Goal:** FlyffWeb becomes the whole website as well as the game. One address serves a home page at `/`, account
  creation at `/sign-up` and the game at `/play`. FlyffPortal (the Laravel portal next to the servers) is being deleted by
  the owner; nothing of it is kept but the account rules recorded in §2.
- **Audience:** the closed beta's testers, on PC, phone and tablet browsers. The "closed" part is who the owner shares the
  link with: sign-up is open to anyone who has it.
- **Owner's decisions (2026-11-10/11):**
  - Scope is the front door only: home, sign-up, the game. No login or account pages, rankings or shop.
  - FlyffWeb is the all-in-one site; FlyffPortal goes.
  - Sign-up is open, rate-limited, with no third-party captcha and no invite codes.
  - A new small web service creates accounts; the gateway is not where the database login lives.
  - The home page shows news posts, the server status, and an about section with screenshots and devices.
  - Security: the owner asked for a review against hacking, glitching and spamming. §3.7 is the result, approved as
    written, including the one gateway change (§3.5).
- **Constraints kept:** the game servers are not changed by this work (a certifier patch is recommended separately,
  §8). No custom server features (`__BB_*`). Playwright in Chromium only, desktop and landscape phone. Phone text at
  least 14 px.

## 2. Facts found in the code

- **The client is one page today.** `apps/client/index.html` loads `src/main.ts`, which builds the lobby and then the
  world (`main.ts`). There is no router. The Vite config (`apps/client/vite.config.ts`) has `root` = `apps/client`,
  `publicDir: false`, `assetsDir: 'client'` (the build's own files go under `/client/`, because `/assets/` is the
  converter's) and `serveDist` for `dist/assets`. The dev server holds port 5174.
- **The hosting guide sends every unknown path to the game.** `docs/hosting.md` step 8: `handle { root * …/apps/client/dist;
  try_files {path} /index.html; file_server }`; `/connect/*` goes to the gateway (127.0.0.1:8090); `/assets/*` to
  `FlyffWeb/dist` with `report.json` refused.
- **How accounts are made.** `usp_CreateNewAccount @account varchar(32), @pw varchar(32), @cash int = 0, @email
  varchar(100) = ''` (`Database.sql`, `CreateAcc.sql` in the server folder) inserts `ACCOUNT_TBL` (isuse 'T'),
  `ACCOUNT_TBL_DETAIL` (gamecode 'A000', `m_chLoginAuthority` 'F', email) and `AccountPlay`, and selects `1` (made), `0`
  (name taken) or `-1` (error, rolled back). FlyffPortal's rules were: name `alpha_dash` 4–32; email optional, ≤ 100;
  password ≥ 6 with letters and numbers, confirmed.
- **The password the game checks.** The certifier's `LOGIN_STR` compares `ACCOUNT_TBL.password = @ipassword`
  (`Database.sql`), and `@ipassword` is what the client sent (`CERTIFIER/DBManager.cpp:98-112`). Neuz and FlyffWeb send
  `md5("kikugalanet" + password)` as 32 lowercase hex digits (`packages/protocol/src/crypto/password.ts`,
  `hashPassword`; `NEUZ_PHASH` in `Source/_Common/ServerCommon.h:9`). An input of exactly 32 characters is taken as a hash
  already and sent unchanged (`hashPassword`, copying `CNeuzApp::HashMD5`). FlyffPortal stored plain `md5(password)`, so
  its accounts cannot log in to the game.
- **Account names at login.** The certifier refuses an empty name or a `'` in name or password
  (`CERTIFIER/dpcertifier.cpp:378`), refuses a name that is not 1–32 printable ASCII without spaces
  (`AccountMgr.cpp:31-46`, `dpcertifier.cpp:385`), and lower-cases the name (`dpcertifier.cpp:406`). It counts wrong
  passwords per address and account (`AccountMgr.cpp:47-90`, the public-launch-limits certifier patch).
- **A hole in the certifier.** `OnCloseExistingConnection` (`CERTIFIER/dpcertifier.cpp:423-440`, packet
  `CLOSE_EXISTING_CONNECTION` 0x16) copies the account and password from the packet with no check, and
  `CloseExistingConnection` (`DBManager.cpp:304-324`) builds `LOGIN_STR '%s', '%s', '%s'` from them with `wsprintf`
  (`DBManager.cpp:111`). A `'` in either runs SQL of the sender's choosing on `ACCOUNT_DBF`. The values are capped at
  `MAX_ACCOUNT`/`MAX_PASSWORD` 42 (`_Network/CmnHdr.h:484-485`), which keeps the 128-byte query buffer from overflowing
  on this (non-Taiwan) path, but leaves room for a harmful statement. Anyone can send the packet through the gateway.
- **What the browser sends the certifier.** Only CERTIFY, CLOSE_EXISTING_CONNECTION, KEEP_ALIVE and ERROR
  (`apps/client/src/lobby/LoginFlow.ts`; encoders in `packages/protocol/src/messages/certifier.ts`). The gateway already
  inspects browser packets: it refuses non-binary messages, oversized ones and the gateway-only `GATEWAY_CLIENT_ADDR`
  with `CloseCode.FORBIDDEN_PACKET` (`apps/gateway/src/relay.ts:38-48`, `:216-226`).
- **Players online.** `CHARACTER_TBL.MultiServer` (`Database.sql`) is non-zero while the character is in a world; the
  database server sets it (`uspChangeMultiServer`) and clears a server's on start (`uspInitMultiServer`).
- **Test hooks.** `window.__client` is installed only with `import.meta.env.DEV` or `VITE_TEST_HOOKS=1` (`main.ts`).
- **Existing limits.** The gateway caps connections in all and per address, new connections per address per minute and
  the packet rate and size (`docs/superpowers/specs/2026-10-22-public-launch-limits-design.md`).

## 3. Design

### 3.1 Pages and addresses

| Address | Page | Loads the game's code |
| --- | --- | --- |
| `/` | Home (§3.2) | No |
| `/sign-up` | Sign-up (§3.3) | No |
| `/play` | The game: today's page, moved unchanged | Yes |
| anything else | "Page not found", with a link home; HTTP status 404 | No |

- **One build, three entry pages.** `apps/client` becomes a Vite multi-page build: `index.html` (home),
  `sign-up/index.html` and `play/index.html` (today's `index.html`, which keeps `src/main.ts`). The 404 page is
  `404.html`. Home and sign-up have their own small entry scripts under `apps/client/src/site/`; they must not import
  three.js, the scene package or the world code. A unit test checks the built home and sign-up bundles stay small (no
  three.js).
- **The look.** The game's classic lobby look: its colours, fonts and a few theme pictures from `dist/assets`, sharing
  CSS with `lobby.css` where it fits. Home and sign-up work in portrait and landscape at any size; the landscape cover
  and lock stay on `/play` only.
- **Old links.** A bookmark of `/` now lands on the home page, whose Play button goes to `/play`.
- **Dev server.** `npm run dev:client` still serves everything on 5174: `/`, `/sign-up`, `/play` (with or without the
  trailing slash) and the `/api` calls proxied to the web service when it runs (§3.4).

### 3.2 Home page

- **Top:** the FlyFF logo picture, a "Closed Beta" label, and two buttons: **Play** (`/play`) and **Sign up** (`/sign-up`).
- **Server status:** "Checking…", then "Online · N players" or "Offline", from `GET /api/status` (§3.4), refreshed
  every 60 s while the page is visible. If the web service cannot be reached: "Status unavailable" (the buttons still
  work).
- **News:** the five newest posts. Each post is a Markdown file `apps/client/content/news/YYYY-MM-DD-slug.md` whose first
  line is `# Title`; the date comes from the file name. A Vite plugin turns them into HTML at build time with raw HTML
  escaped and only `http:`/`https:` links kept. A new post shows after the next build.
- **About:** a short text (in `apps/client/content/about.md`), up to six screenshots
  (`apps/client/content/screenshots/*.webp`, shown with a placeholder until the owner adds them), and the supported
  devices: Windows/Mac PC browsers, Android phones and tablets, iPhone and iPad.

### 3.3 Sign-up page

- **Fields:** account name, password, confirm password, email (optional), and a hidden trap field (§3.4).
- **Rules, checked in the browser first and again by the server** (one shared module, `packages/protocol/src/web/signUp.ts`,
  next to `hashPassword`, so both sides use the same code):
  - **Name:** 4–32 characters, `a-z 0-9 _ -` only; upper-case letters are turned to lower-case (the certifier
    lower-cases names at login); not a reserved name (§3.4).
  - **Password:** 8–31 printable ASCII characters (space to `~`), at least one letter and one digit, not equal to the
    name (any case), and the confirmation matches. Exactly 32 characters can never be chosen (the login would send it
    unhashed, §2).
  - **Email:** empty, or a simple `x@y.z` shape, at most 100 characters.
- **On success:** "Account created" and a **Play now** button. The new name is put in `sessionStorage`
  (`flyffweb.signUpAccount`); the `/play` login form reads it once, fills the name and clears it. The name never goes
  into the address.
- **Messages** for each server answer: name taken; invalid field (named); too many tries from this network; sign-ups
  paused; server error. Text at least 14 px on phones; inputs 16 px (no zoom on focus).
- **A line under the password:** "Use a password you don't use anywhere else."

### 3.4 The web service (`apps/web`)

A new TypeScript Node app, built and run like the gateway, listening on `127.0.0.1:8091` only. Caddy passes `/api/*`
to it. It is the only FlyffWeb part that talks to SQL Server.

- **`GET /api/sign-up/ticket`** → `{ ticket }`. The ticket is `issuedAtMs.nonce.hmac` (HMAC-SHA256 with the settings
  file's secret). The page fetches one on load.
- **`POST /api/sign-up`** with `{ account, password, email, website, ticket }` (`website` is the trap field):
  1. Refuse unless `Content-Type: application/json` (415), the body is at most 1 KB (413), and `Origin` is the site's
     own address from the settings (403). Unknown fields are ignored.
  2. Count the attempt against the address's limit (20 an hour → 429 `too_many`).
  3. Check the ticket: valid HMAC, age 3 s to 30 min, nonce not used before (kept in memory until it expires);
     otherwise 400 `ticket` (the page fetches a new ticket and asks the player to try again).
  4. A filled trap field: answer 201 as if created, create nothing, log it as a bot.
  5. Check the rules (§3.3) and the reserved names → 400 `invalid` with the field.
  6. Check the address's created limit (3 an hour) and the site-wide one (60 an hour) → 429 `too_many` / `paused`.
  7. `EXEC dbo.usp_CreateNewAccount @account, @pw, 0, @email` with typed parameters, where `@pw` =
     `hashPassword(password)`. `1` → 201; `0` → 409 `taken`; `-1` or a database error → 500 `server`.
- **`GET /api/status`** → `{ online, players, checkedAt }`. `online`: the certifier and login-server ports (from the
  settings) accept a TCP connection within 1 s. `players`: `EXEC dbo.usp_WebOnlineCount` (new, §3.6: the count of
  `CHARACTER_TBL` rows with `MultiServer > 0`), or `null` on a database error. The answer is kept for 30 s and shared
  by every visitor.
- **Client address:** the last hop of `X-Forwarded-For` when the request comes from a trusted proxy (Caddy on
  127.0.0.1), as the gateway reads it (`apps/gateway/src/clientAddress.ts`, reused).
- **Reserved names** (settings, extendable): exact `admin`, `administrator`, `gamemaster`, `staff`, `support`,
  `moderator`, `system`, `owner`, `root`, `server`; any name starting with `gm` or `admin`.
- **Limits** (settings, these defaults): attempts 20/hour/address, created 3/hour/address, created 60/hour in all,
  tickets 60/hour/address. Kept in memory; a restart clears them.
- **Logs:** one line per attempt: time, address, account, result (`created`, `taken`, `invalid:<field>`, `too_many`,
  `paused`, `ticket`, `bot`, `error`). Never the password, the email or the ticket.
- **Settings file** (`web.config.json`, the example `apps/web/web.config.example.json` in the repo; the real one outside
  the repo and the served folders): listen address, site origin, SQL Server host/port/user/password and database names,
  the ticket secret, certifier and login addresses, limits, reserved names. A bad or missing value stops the service at
  start, naming it, as the gateway does.
- **Library:** `mssql` (tedious) for SQL Server; Node's own `http` and `crypto` otherwise.

### 3.5 Gateway: an allow-list for the certifier route

The one gateway change, approved by the owner to close the §2 hole without waiting for a certifier rebuild.

- On a `certifier` route, each browser packet's type must be CERTIFY, CLOSE_EXISTING_CONNECTION, KEEP_ALIVE or ERROR;
  any other ends the connection with `CloseCode.FORBIDDEN_PACKET` and a refusal-log line.
- CERTIFY: its account string must be 1–32 printable ASCII characters with no space and no `'`.
- CLOSE_EXISTING_CONNECTION: the same account rule, and the password must be exactly 32 lowercase hex digits (what
  `hashPassword` gives). A packet that does not parse is refused the same way.
- Login-server and cache routes are unchanged.

### 3.6 Hosting (`docs/hosting.md`)

- **Caddy:**
  - `/api/*` → `reverse_proxy 127.0.0.1:8091`, with `request_body { max_size 4KB }`.
  - The site's pages: `try_files {path} {path}/index.html` then the 404 page with status 404 (no more fallback to the
    game).
  - Headers on every response (§3.7).
  - HTTP is redirected to HTTPS (Caddy's default) and HSTS is set.
- **The web service as a Windows service** through NSSM ("FlyffWeb Site"), with its log folder, as for the gateway. Its
  settings file sits in a folder only that service's account and administrators can read.
- **SQL:** `apps/web/sql/web-login.sql`, run once by the owner in the VM (the PowerShell way, as
  `BB_MakePoreotixAdmin.ps1` does, since the VM has no Management Studio). It creates:
  - `CHARACTER_01_DBF.dbo.usp_WebOnlineCount` (`SELECT COUNT(*) FROM CHARACTER_TBL WHERE MultiServer > 0`);
  - a SQL login `flyffweb_site` with a password the owner chooses, mapped to a user in `ACCOUNT_DBF` and
    `CHARACTER_01_DBF` with EXECUTE on `usp_CreateNewAccount` and `usp_WebOnlineCount` only. No table rights, no other
    database, not `sa`.
- **The outside check** (step 9) also confirms 8091 and 1433 are closed from the internet, and that the headers are
  present.
- **Build:** `npm run build:client` builds the three pages and the 404 page; `npm run build:web` (new) builds the
  service.

### 3.7 Security

| Threat | Defence |
| --- | --- |
| Eavesdropping, downgrade | HTTPS only; HTTP redirected; HSTS one year. |
| Reaching internal services | Only 443 is open. Gateway 8090, web service 8091, game servers and SQL Server 1433 listen on the machine or are firewalled; the outside check confirms. |
| Script injection (XSS) | Pages show outside data as text only (`textContent`); news is HTML made at build time with raw HTML escaped; a Content-Security-Policy as a backstop. |
| Clickjacking | `frame-ancestors 'none'`. |
| Cross-site requests (CSRF) | No cookies or sessions; the API takes only JSON from its own `Origin` and sends no CORS headers. |
| SQL injection | The web service uses typed parameters only. The certifier hole is closed at the gateway (§3.5); the certifier patch is recommended (§8). |
| Sign-up spam and bots | Per-address and site-wide limits, the trap field, the signed form ticket with a minimum fill time, strict input. |
| Staff impersonation | Reserved names. |
| Getting GM rights or cash by signing up | Impossible: the procedure sets authority 'F' and the service always passes cash 0; extra fields are ignored (tested). |
| Password guessing at /play | The certifier's wrong-password count and the gateway's limits (existing). |
| Leaked password hashes | The stored md5 works as the password (a FlyFF limit). The database stays private, the service's SQL login has no table rights, passwords need 8+ characters, and the page asks for a unique password. |
| Leaked secrets | The settings file lives outside the repo and the served folders, readable only by the service; logs never hold passwords. |
| Floods | `/api/status` cached 30 s; the web service is separate from the gateway (a crash or flood there leaves the game up; NSSM restarts it); Caddy body limits and timeouts. A free Cloudflare proxy is an option for later. |
| Cheating with a changed client ("glitching") | The browser is in the player's hands: every rule that matters is decided by the servers, and client-side checks are for convenience only. A build check fails if a public build contains the test hooks. The gateway's packet-rate and size limits stay. |

**Headers** (Caddy, every response):

- `Strict-Transport-Security: max-age=31536000`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://{host}; worker-src 'self' blob:;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`

The exact CSP is settled by running the game under it (§5); any source the game needs is added with the reason written
next to it in `docs/hosting.md`.

## 4. Error handling

- **Pages:** every API failure shows a message and leaves the page usable. Sign-up keeps what was typed (not the
  passwords) after an error. A ticket refused for age or reuse is renewed and the player asked to send again.
- **Web service:** never throws into a request; a database failure answers 500 `server` and logs `error` with the
  database's message (no secrets). A status probe that fails answers `online: false`.
- **Gateway filter:** a refused packet ends only that connection, with `FORBIDDEN_PACKET` and a refusal-log line naming
  the reason (`type`, `account`, `password`).

## 5. Testing

- **Unit (vitest):**
  - the shared rules: every accepted and refused name and password (quotes, spaces, non-ASCII, 3/4/32/33 characters for
    names, 7/8/31/32 for passwords, password equal to the name, reserved names);
  - the password stored is `hashPassword(password)` and equals what the login sends;
  - the ticket (signature, 3 s, 30 min, reuse), the trap field, each limit and its window, `Origin`/content-type/size
    refusals, extra fields such as `cash` or `authority` ignored;
  - sign-up against a fake database answering 1, 0, -1 and throwing; status with ports up/down and the database failing,
    and its 30 s sharing;
  - the gateway filter: each allowed type passes; another type, a bad account, a bad password and a short packet are
    refused;
  - the home and sign-up bundles do not contain three.js; a public build without `VITE_TEST_HOOKS` has no `__client`.
- **End-to-end (Playwright, Chromium, desktop and landscape phone; plus a portrait phone run for home and sign-up):**
  - home: news, status (API mocked: online, offline, unreachable), buttons;
  - sign-up: success → Play now → the login form filled; each error message;
  - every existing game spec moved to `/play` and passing;
  - the headers of §3.7 served by a test server, with the game logging in and entering the world under the CSP.
- **Owner's checks (live, in the VM):** create an account at `/sign-up` and log in with it at `/play`; a 4th sign-up in an
  hour is refused; a hand-crafted CLOSE_EXISTING_CONNECTION with a `'` is refused by the gateway (a testkit script is
  provided); the headers and closed ports from outside.

## 6. Docs

- **README:** the site's three pages and the web service.
- **`docs/hosting.md`:** §3.6: Caddy, the second service, the SQL script, the outside checks.
- **`apps/web/README.md`:** settings, logs, limits, how to add a news post and screenshots.
- **Device checklist:** home and sign-up on each device, portrait and landscape.

## 7. Done criteria

- `/`, `/sign-up` and `/play` work in the dev server and in a production build; unknown paths get the 404 page.
- An account made at `/sign-up` logs in at `/play` on the owner's servers.
- The limits, trap, ticket and reserved names refuse as specified; the gateway refuses the forbidden certifier packets.
- `npm run typecheck` clean; unit tests pass (main's known failures excepted, named); the e2e specs pass on both
  projects.
- The hosting guide covers the new parts, and the owner's live checks pass.

## 8. Out of scope

- Login and account pages, password change or reset, email checks, invite codes, captcha, rankings, the web shop.
- **The certifier patch** (recommended, separate): in `CDPCertifier::OnCloseExistingConnection` refuse an empty name, a
  `'` in name or password, a name failing `CAccountMgr::IsAccountName`, and a password that is not 32 hex digits, as
  `OnCertify` does (`dpcertifier.cpp:378-386`); then rebuild Certifier. Until then the gateway filter is the guard, and
  the certifier port must stay closed to the internet.
- A wider review of server-side exploits (item duplication, packet abuse in the world server).
- Resetting the passwords of accounts FlyffPortal made (they cannot log in; the owner fixes them by hand if any exist).
- Piece 7 M6's hosting and live session (still needed); its `VITE_SIGNUP_URL` link is replaced by `/sign-up`.

## 9. Risks

| Risk | Answer |
| --- | --- |
| The CSP breaks part of the game on a browser not tested automatically (iOS Safari) | The device checklist covers the game under the headers on iPhone and iPad; a needed source is added with its reason. |
| `MultiServer` stays set after a crash, so the player count is too high | The database server clears it when it starts (`uspInitMultiServer`), so a wrong count lasts only until the servers restart. |
| In-memory limits reset on restart | Acceptable for a beta; the site-wide cap still bounds a burst. |
| A wrong trusted-proxy setting makes every visitor share Caddy's address | The same rule and tests as the gateway's client address; the settings check refuses a missing value. |
| Moving the game to `/play` breaks the e2e specs or the owner's bookmarks | The specs' base address changes in one place; home's Play button covers bookmarks. |

## 10. Plans

One implementation plan, `docs/superpowers/plans/2026-11-11-website.md`, in three parts:

1. Pages: the multi-page build, home, sign-up (against a mocked API), `/play`, the 404 page, the shared rules.
2. The web service: sign-up, ticket, limits, status, settings, logs, the SQL script.
3. Security and hosting: the gateway allow-list, the headers and CSP tested with the game, the hosting guide.

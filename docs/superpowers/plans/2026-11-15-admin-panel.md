# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private superadmin panel at `admin.osflyff.online` for accounts, characters, server status, item and penya
sends, and an audit log, served by the existing web service on a second loopback port.

**Architecture:** `apps/web/src/main.ts` starts a second `node:http` server on `127.0.0.1:8092` when `web.config.json`
has a good `admin` section. It serves a plain-JS page from `apps/web/admin/` and `POST /api/<action>` routes. Every
change goes through `runAudited` (log row first, then the action, then the result). The database is reached only
through `usp_Admin*` procedures as the SQL login `flyffweb_admin`. Character edits are refused unless the Database and
World servers' ports are all closed.

**Tech Stack:** TypeScript on Node 24 with `tsx`, `node:http`, `node:crypto` (scrypt, HMAC-SHA1), `mssql`; vitest;
Playwright (Chromium); T-SQL for SQL Server 2022 Express; Windows PowerShell 5.1; Caddy.

**Spec:** `docs/superpowers/specs/2026-11-15-admin-panel-design.md` (read it first; section numbers below are its).

## Global Constraints

- No new npm dependency. Crypto comes from `node:crypto`, HTTP from `node:http`, SQL from the existing `mssql`.
- The public server (`apps/web/src/server.ts`, port 8091) gains no route and no behaviour change. Sign-up keeps
  `flyffweb_site`.
- Only `usp_Admin*` procedures (plus `GRANT EXECUTE` on the existing `usp_CreateNewAccount`), with typed `mssql`
  parameters. No SQL text built in TypeScript. No dynamic SQL (`EXEC(`, `sp_executesql`) in the admin procedures.
- The panel never takes the site down. A bad `admin` section, a bad `admin-login.json` or an 8092 listen error only
  logs `admin: panel off: <reason>` and leaves 8092 closed.
- Never logged or stored in the audit log: a password, a password hash, a TOTP code, the TOTP secret, a session id or
  a CSRF token.
- The panel page puts every value in the DOM with `textContent` or `value`, never `innerHTML`, and loads nothing from
  `apps/client`.
- Answers: JSON, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Errors are `{ error: <code> }` plus an
  optional `field`/`message`, with these codes:
  - `invalid` 400; `session` 401; `forbidden` 403; `not_found` 404;
  - `taken`, `refused` and `repeat` 409; `size` 413; `type` 415;
  - `locked` 423; `too_many` 429; `server` 500.
- Constants:
  - session idle 30 min, max 12 h;
  - login limits: 5 failures per address in 15 min (that address then waits 15 min), and 20 failures in any hour
    from everywhere (login closed 1 h);
  - body limit 16 KB; search results at most 50; log pages of 50; recent logins 10;
  - `MAX_PANEL_GOLD = 2_000_000_000`;
  - upgrade 0-10, for `kind1` 1 (weapon) or 2 (armour) only;
  - ban forever `'99991231'`;
  - Flarine: world `1`, `(6971.984, 100.0, 3336.884)` (`WORLDSERVER/DPDatabaseClient.cpp:1013`);
  - server index `'01'`.
- Game servers to probe (spec 4.5), host `127.0.0.1` by default:
  - Account `[12000]`, Certifier `[23000]`, Database `[7000, 24000, 7200]`;
  - Core `[4000, 4001, 4002]`, Login `[28000]`, Cache `[5400]`, World `[3101]`;
  - gateway `127.0.0.1:8090`.
- Authority letters and names: `F` Player, `J` Helper, `L` GM 1, `M` GM 2, `N` GM 3, `O` Operator, `P` Admin.
- Builders run only the quick tests named in each task (`npx vitest run <files>`). Full suites and Playwright runs
  go to the owner as commands with pass criteria.
- Commits: Conventional Commits, scope `admin` (for example `feat(admin): ...`), each ending with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work happens on branch `admin-panel` in
  `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\admin-panel`. Never in either main folder.

## Review Focus

1. **Case and spaces in names.**
   - The owner's account is `Poreotix`, while sign-up stores names lower-case. Input is trimmed, and lookups are
     case-insensitive, as SQL Server's collation is.
   - Every write targets the name as stored.
   - Pinned in Task 12 (`accounts.get` with `' POREOTIX '`).
2. **A double click on a write**, for example Send or Ban. It must not act twice.
   - Every write carries a `requestId`, and a repeat in the same session answers 409 `repeat`.
   - Pinned in Task 7 (server) and Task 18 (browser check).
3. **The session ends mid-task** (idle, or the service restarted).
   - The next call answers 401 `session`. The page shows the login box and keeps the tab's inputs.
   - Pinned in Task 7 and Task 18.
4. **Text that looks like code.**
   - An email such as `<img src=x onerror=alert(1)>` shows as text.
   - A search for `a_` or `a%` matches those characters literally, not as SQL wildcards.
   - Pinned in Task 18 (page) and Task 8 (`admin-check.sql`).
5. **Dates and the VPS clock.**
   - "Unban" and "today" are worked out by SQL Server's `GETDATE()`, not by Node.
   - A ban date in the past is refused with 400 `invalid`, field `until`.
   - Pinned in Task 12.

---

## Milestone 1: Groundwork

### Task 1: The character name rules move to `packages/protocol`

**Files:**
- Create: `packages/protocol/src/web/characterName.ts`
- Modify: `packages/protocol/src/index.ts` (export), `apps/client/src/lobby/validation.ts` (re-export from protocol,
  keep the client's imports working)
- Test: `packages/protocol/test/characterName.test.ts`

**Interfaces:**
- Produces: `validateCharacterName(name: string): string | undefined`, the same messages and order as today's
  `apps/client/src/lobby/validation.ts:10`.

- [ ] **Step 1: Write the failing test**, `characterName.test.ts`:
  - `validateCharacterName('')` is `'Enter name.'`;
  - `'abc'` and `'a'.repeat(17)` are `'Character Name must be 4 to 16 characters long.'`;
  - `'1abc'` is `'The name cannot start with a number.'`;
  - `'ab cd'` and `'abc!'` are `'You cannot use special characters or spaces in a name.'`;
  - `' Hero1 '` is `undefined`.
- [ ] **Step 2:** Run `npx vitest run packages/protocol/test/characterName.test.ts`. It fails: the module is missing.
- [ ] **Step 3:** Move the function's body to `characterName.ts`, export it from the protocol index, and make
  `validation.ts` do `export { validateCharacterName } from '@flyffweb/protocol'`.
- [ ] **Step 4:** Run `npx vitest run packages/protocol/test/characterName.test.ts apps/client/test`. It passes (the
  client's existing failures noted in sibling notes, inventoryWindow and looks, are unchanged).
- [ ] **Step 5: Commit** `refactor(admin): character name rules move to the protocol package`.

### Task 2: The `admin` settings

**Files:**
- Create: `apps/web/src/admin/config.ts`
- Modify: `apps/web/src/config.ts` (`WebConfig` gains two fields; `parseWebConfig` calls `parseAdminConfig`),
  `apps/web/web.config.example.json` (an `admin` section as in spec 5.2)
- Test: `apps/web/test/adminConfig.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ServerName = 'Account' | 'Certifier' | 'Database' | 'Core' | 'Login' | 'Cache' | 'World';
  export interface GameServer { name: ServerName; host: string; ports: number[] }
  export const DEFAULT_PORTS: Record<ServerName, number[]>; // the Global Constraints list
  export interface AdminConfig {
    listen: HostPort; origin: string; sql: { user: string; password: string }; credentialsFile: string;
    sessionIdleMinutes: number; sessionMaxHours: number;
    servers: GameServer[]; gateway: HostPort; assetsDir: string;
  }
  export function parseAdminConfig(value: unknown): AdminConfig; // throws Error naming the key, like config.ts
  // WebConfig gains: admin: AdminConfig | undefined; adminProblem: string | undefined
  ```
- Optional keys and defaults:
  - `sessionIdleMinutes` 30 (1-240), `sessionMaxHours` 12 (1-24);
  - `serverHost` `'127.0.0.1'`, applied to all 7 servers;
  - `ports`: a partial `Record<ServerName, number[]>` that replaces single entries;
  - `gateway` `{127.0.0.1, 8090}`;
  - `assetsDir` `'dist/assets'`.

- [ ] **Step 1: Write the failing tests:**
  - the example file's `admin` section parses to `listen {127.0.0.1, 8092}`, origin `https://admin.play.example.com`,
    the 7 default servers and `assetsDir 'dist/assets'`;
  - `parseWebConfig` of a config without `admin` gives `admin === undefined && adminProblem === undefined`;
  - with `admin.listen.host '0.0.0.0'`, `parseWebConfig` does not throw: `admin` is `undefined` and `adminProblem`
    contains `admin.listen.host`;
  - origin `'http://admin.example.com'` gives a problem naming `admin.origin`;
  - origin `'http://127.0.0.1:8092'` is accepted only with listen host `127.0.0.1`;
  - origin `'https://admin.example.com/'` (trailing slash) is refused;
  - `ports: { World: [3102] }` replaces only World's ports;
  - an unknown key `admin.foo` is refused.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminConfig.test.ts apps/web/test/config.test.ts`. The new tests
  fail.
- [ ] **Step 3:** Implement `parseAdminConfig`, reusing the helpers' style of `config.ts`: `object`, `text`,
  `integer`, the dotted-IPv4 check, and `origin` with the test-run exception in spec 5.2. `listen.host` must be
  `127.0.0.1`.
- [ ] **Step 4:** Run the same command. All pass, the old `config.test.ts` included.
- [ ] **Step 5: Commit** `feat(admin): the admin settings, which never stop the site`.

### Task 3: Passwords, TOTP and the login file

**Files:**
- Create: `apps/web/src/admin/password.ts`, `apps/web/src/admin/totp.ts`, `apps/web/src/admin/credentials.ts`
- Test: `apps/web/test/adminCrypto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // password.ts: scrypt N=16384 r=8 p=1, 32-byte random salt, 64-byte key; text form `scrypt$16384$8$1$<saltB64>$<keyB64>`
  export function hashAdminPassword(password: string, salt?: Buffer): string;
  export function verifyAdminPassword(password: string, stored: string): boolean; // timingSafeEqual; false on a bad form
  // totp.ts: RFC 4648 base32 (A-Z2-7, no padding), RFC 6238 HMAC-SHA1, 30 s steps
  export function base32Encode(bytes: Uint8Array): string;
  export function base32Decode(text: string): Buffer; // ignores spaces and case; throws on other characters
  export function newTotpSecret(): string; // 20 random bytes, base32
  export function totpStep(nowMs: number): number; // Math.floor(nowMs / 30000)
  export function totpCode(secret: string, step: number, digits?: number): string; // digits default 6, zero-padded
  export function matchTotp(secret: string, code: string, nowMs: number): number | undefined; // the matching step of step-1..step+1
  export function otpauthUrl(secret: string, user: string): string; // otpauth://totp/osflyff%20admin:<user>?secret=..&issuer=osflyff%20admin
  // credentials.ts
  export interface AdminCredentials { user: string; passwordHash: string; totpSecret: string }
  export function parseCredentials(json: unknown): AdminCredentials; // throws naming the key; user 1-32 printable ASCII
  export function readCredentials(path: string): AdminCredentials;
  ```

- [ ] **Step 1: Write the failing tests.**
  - The RFC 6238 SHA-1 vectors use the secret `base32Encode(Buffer.from('12345678901234567890'))`, which is
    `'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'`. `totpCode(secret, totpStep(t * 1000), 8)` must give:
    - t=59: `'94287082'`;
    - t=1111111109: `'07081804'`;
    - t=1111111111: `'14050471'`;
    - t=1234567890: `'89005924'`;
    - t=2000000000: `'69279037'`.
  - `matchTotp` accepts the codes of the step before and after, and refuses 2 steps away and codes that are not 6
    digits.
  - `verifyAdminPassword(p, hashAdminPassword(p))` is true; a wrong password and `'garbage'` are false.
  - `base32Decode(base32Encode(x))` round-trips 0-40 random bytes.
  - `parseCredentials` refuses a missing `totpSecret` with a message naming it.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminCrypto.test.ts`. It fails.
- [ ] **Step 3:** Implement the three files with `node:crypto` (`scryptSync`, `createHmac('sha1')`, `randomBytes`,
  `timingSafeEqual`).
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): scrypt passwords, TOTP codes and the admin login file`.

### Task 4: `npm run admin:setup`

**Files:**
- Create: `apps/web/scripts/adminSetup.ts`
- Modify: root `package.json` (script `"admin:setup": "tsx apps/web/scripts/adminSetup.ts"`)
- Test: `apps/web/test/adminSetup.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces: `buildCredentials(user: string, password: string, secret: string): AdminCredentials` and
  `checkSetupPassword(password: string): string | undefined`, a message when it is under 12 characters.

- [ ] **Step 1: Write the failing tests:**
  - `buildCredentials('Poreotix', 'a long password!', s)` parses with `parseCredentials`;
  - its hash verifies;
  - `checkSetupPassword('short')` is a message, and a password of 12 characters or more gives `undefined`.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminSetup.test.ts`. It fails.
- [ ] **Step 3:** Implement the script.
  - It takes `--file <path>` (required) and asks with `node:readline`: the name, the password twice (without echo,
    `muted` output), then shows the base32 key in groups of 4 and the `otpauthUrl`.
  - It asks for a current code and refuses to write until `matchTotp` matches, with 3 tries.
  - It writes the JSON with `fs.writeFileSync`. Exit codes: 0 written, 1 refused, 2 bad command line.
  - It prints a reminder to run `nssm restart flyffweb-site`.
  - If a QR code needs a dependency, skip it (spec 7).
- [ ] **Step 4:** Run the test. It passes. By hand: `npm run admin:setup -- --file %TEMP%\admin-login.json` asks the
  questions in order.
- [ ] **Step 5: Commit** `feat(admin): admin:setup writes the owner's panel login`.

## Milestone 2: Login, sessions and the 8092 server

### Task 5: The login guard

**Files:**
- Create: `apps/web/src/admin/loginGuard.ts`
- Test: `apps/web/test/loginGuard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GuardVerdict = 'ok' | 'address_wait' | 'closed';
  export class LoginGuard {
    constructor(now: () => number);
    check(address: string): GuardVerdict;
    fail(address: string): void;
    succeed(address: string): void; // forgets that address's failures
  }
  ```
- The rules are the Global Constraints' login limits. "Closed" lasts 1 h from the 20th failure in the last hour.

- [ ] **Step 1: Write the failing tests** with a settable clock:
  - 4 failures leave the verdict `ok`, and the 5th makes it `address_wait` for that address only;
  - the address is `ok` again 15 min after its 5th failure;
  - 20 failures spread over 4 addresses inside an hour make every address `closed`;
  - the login is still `closed` at 59 min and `ok` at 61 min;
  - `succeed` clears that address's failures.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/loginGuard.test.ts`. It fails.
- [ ] **Step 3:** Implement it with timestamp lists swept like `HourlyLimit` does.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): login guard, per address and site-wide`.

### Task 6: Sessions

**Files:**
- Create: `apps/web/src/admin/sessions.ts`
- Test: `apps/web/test/adminSessions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AdminSession { id: string; csrf: string; user: string; createdAt: number; lastSeen: number; requestIds: string[] }
  export class SessionBook {
    constructor(now: () => number, idleMs: number, maxMs: number);
    create(user: string): AdminSession; // id and csrf: 32 random bytes each, base64url
    get(id: string | undefined): AdminSession | undefined; // refreshes lastSeen; an expired one is deleted
    destroy(id: string): void;
    /** false when `requestId` was already used in this session; the last 50 are kept */
    claimRequest(session: AdminSession, requestId: string): boolean;
  }
  ```

- [ ] **Step 1: Write the failing tests:**
  - `get` works at 29 min idle and is `undefined` at 31 min;
  - a session in use every 10 min ends at 12 h;
  - `destroy` ends it;
  - `claimRequest` is true then false for the same id;
  - ids and csrf tokens differ between sessions.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminSessions.test.ts`. It fails.
- [ ] **Step 3:** Implement it, kept in memory only.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): in-memory sessions with CSRF tokens and request ids`.

### Task 7: The admin server, login and logout, and the start in `main.ts`

**Files:**
- Create: `apps/web/src/admin/adminServer.ts`, `apps/web/src/admin/adminStore.ts` (the interface only, all of it, so
  Tasks 9-15 share it), `apps/web/admin/index.html` (a placeholder until Task 16)
- Create: `apps/web/test/support/memoryAdminStore.ts` (an in-memory `AdminStore` for the tests and the demo)
- Modify: `apps/web/src/main.ts`
- Test: `apps/web/test/adminServer.test.ts`

**Interfaces:**
- Produces in `adminStore.ts`:
  ```ts
  export type Authority = 'F' | 'J' | 'L' | 'M' | 'N' | 'O' | 'P';
  export type LogResult = 'ok' | 'failed' | 'refused';
  export interface LogEntry { admin: string; address: string; action: string; account?: string; characterName?: string; before: string }
  export interface LogRow extends Required<LogEntry> { id: number; at: string; result: LogResult | 'started'; after: string }
  export interface LogFilter { beforeId?: number; account?: string; characterName?: string; action?: string }
  export interface AccountRow { account: string; email: string | null; authority: string; blockTime: string | null; created: string }
  export interface CharacterRow { idPlayer: string; name: string; account: string; level: number; job: number; slot: number; deleted: boolean; online: boolean; worldId: number }
  export interface CharacterDetail extends CharacterRow { gold: number; x: number; y: number; z: number; created: string | null; playTimeSeconds: number; deletedAt: string | null; inGuild: boolean }
  export interface PendingSend { no: number; item: string; count: number; upgrade: number; received: string; byPanel: boolean }
  export interface AdminStore {
    logBegin(entry: LogEntry): Promise<number>;
    logEnd(id: number, result: LogResult, after: string): Promise<void>;
    logRead(filter: LogFilter): Promise<LogRow[]>;        // 50, newest first
    recentLogins(): Promise<LogRow[]>;                     // the last 10 'login' and 'login_failed' rows
    searchAccounts(q: { account?: string; email?: string }): Promise<AccountRow[]>; // prefix / exact email, 50
    getAccount(account: string): Promise<AccountRow | undefined>; // case-insensitive, returns the stored name
    createAccount(account: string, passwordHash: string, email: string): Promise<number>; // usp_CreateNewAccount: 1, 0 taken, -1
    setPassword(account: string, passwordHash: string): Promise<boolean>;
    setEmail(account: string, email: string): Promise<boolean>;
    setLoginAuthority(account: string, authority: Authority): Promise<boolean>;
    setCharacterAuthority(account: string, authority: Authority): Promise<number>; // characters changed
    setBlockTime(account: string, blockTime: string | null): Promise<boolean>; // null = yesterday by SQL's GETDATE()
    searchCharacters(q: { name?: string; account?: string }): Promise<CharacterRow[]>;
    getCharacter(idPlayer: string): Promise<CharacterDetail | undefined>;
    onlineCharacters(): Promise<CharacterRow[]>;
    renameCharacter(idPlayer: string, name: string): Promise<'ok' | 'taken' | 'missing'>;
    setGold(idPlayer: string, gold: number): Promise<boolean>;
    moveCharacter(idPlayer: string, worldId: number, x: number, y: number, z: number): Promise<boolean>;
    deleteCharacter(idPlayer: string): Promise<'ok' | 'guild' | 'missing'>;
    undeleteCharacter(idPlayer: string): Promise<'ok' | 'slot_taken' | 'too_old' | 'missing'>;
    sendItem(idPlayer: string, item: string, count: number, upgrade: number, billingNo: string): Promise<number>;
    pendingSends(idPlayer: string): Promise<PendingSend[]>;
    cancelSend(idPlayer: string, no: number): Promise<boolean>; // only ItemFlag 0 rows with ItemBillingNo LIKE 'ADMIN%'
    sqlAlive(): Promise<boolean>;
  }
  ```
- Produces in `adminServer.ts`:
  ```ts
  export interface AdminContext { session: AdminSession; address: string }
  export type ActionHandler = (body: Record<string, unknown>, ctx: AdminContext, deps: AdminDeps) => Promise<HttpAnswer>;
  export interface AdminDeps {
    config: WebConfig & { admin: AdminConfig }; credentials: AdminCredentials; store: AdminStore;
    sessions: SessionBook; guard: LoginGuard; log: Logger; now: () => number;
    probe: (host: string, port: number) => Promise<boolean>; catalog: CatalogItem[];
    actions: Record<string, ActionHandler>; // filled by Tasks 10-14; empty here
  }
  export function createAdminServer(deps: AdminDeps): Server;
  ```
  (`HttpAnswer` comes from `signUpHandler.ts`. `CatalogItem` is a type-only import from Task 14; declare it here
  first if Task 14 is not done yet.)
- **Routes:**
  - `GET /`, `GET /panel.css`, `GET /panel.js` and `GET /js/<name>.js`, from a fixed list of files in `apps/web/admin/`
    read at start; any other path is 404;
  - `GET /api/session` gives `{ user, csrf }`, or 401 `session`;
  - `POST /api/login` takes `{ user, password, code }`;
  - `POST /api/logout`;
  - `POST /api/<action>` for names in `deps.actions`.
- **Headers on every answer:** the CSP of spec 5.1, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex`, `X-Content-Type-Options: nosniff`.
- **Every `POST`:**
  - `Content-Type: application/json` (415 otherwise);
  - at most 16 KB, read the way `server.ts`'s `readBody` reads (413 otherwise);
  - `Origin === admin.origin` (403 otherwise);
  - for everything but login: a live session from the cookie (401 otherwise), `X-Admin-Token === session.csrf` (403
    otherwise);
  - for names other than ones starting `status`, `accounts.search`, `accounts.get`, `characters.search`,
    `characters.get`, `items.`, `sends.list` and `log.`: a string `requestId` (1-64 characters) that
    `claimRequest` accepts (409 `repeat` otherwise).
- **Login:**
  - `guard.check` first: 429 `too_many` when it isn't `ok`;
  - then the name (constant-time), `verifyAdminPassword`, and `matchTotp`, whose step must be greater than the last
    used step;
  - any failure gives 400 `{ error: 'wrong' }`, `guard.fail` and an audit row `login_failed` with result `refused`;
  - success sets the cookie `__Host-admin=<id>; Secure; HttpOnly; SameSite=Strict; Path=/`, writes an audit row
    `login` with result `ok`, and answers `{ user, csrf }`;
  - with an `http://127.0.0.1`/`localhost` origin the cookie is the same (Chromium allows `Secure` on loopback).
- **main.ts:**
  - `adminProblem` set: warn `admin: panel off: <problem>`;
  - otherwise read the credentials (on an error, warn and stay off), build the store (Task 9) and the catalog
    (Task 14), then listen;
  - on a listen error warn and stay off, without exiting;
  - SIGINT/SIGTERM close both servers.
- **The fake store:** case-insensitive account lookup, keeps rows in arrays, and records calls in `calls: string[]`.

- [ ] **Step 1: Write the failing tests**, starting the server as `server.test.ts` does, on port 0 with a fake clock.
  - **Login:** a good login gives 200, a `Set-Cookie` with `__Host-admin=`, `HttpOnly`, `Secure` and
    `SameSite=Strict`, and an audit row `login` `ok`.
  - **Wrong logins:**
    - a wrong code gives 400 `wrong` and a `login_failed` row whose `before` holds neither the password nor the code;
    - the same code used twice: the second gives 400 `wrong`;
    - the 6th wrong login from one address gives 429 `too_many`.
  - **Request checks:**
    - `POST /api/logout` with the wrong `Origin` gives 403; without the token, 403; with
      `Content-Type: text/plain`, 415; with a 17 KB body, 413;
    - an unknown cookie (a restart) gives 401 `session`;
    - `GET /etc/passwd` and `GET /js/../server.ts` give 404;
    - every answer carries the CSP header.
  - **Request ids:** with a test action `test.write` in `deps.actions`, two posts with the same `requestId` give 200
    then 409 `repeat`.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminServer.test.ts`. It fails.
- [ ] **Step 3:** Implement `adminServer.ts`, `adminStore.ts`, `memoryAdminStore.ts` and the `main.ts` wiring.
- [ ] **Step 4:** Run `npx vitest run apps/web/test`. All pass (the public `server.test.ts` unchanged).
- [ ] **Step 5: Commit** `feat(admin): the panel's own server on 8092, login and sessions`.

## Milestone 3: The database

### Task 8: `admin-login.sql`, `Install-AdminLogin.ps1` and `admin-check.sql`

**Files:**
- Create: `apps/web/sql/admin-login.sql`, `apps/web/sql/Install-AdminLogin.ps1`, `apps/web/sql/admin-check.sql`
- Test: `apps/web/test/adminSql.test.ts` (a static check of the SQL text)

**Interfaces:**
- Produces the table, in `ACCOUNT_DBF`:
  ```sql
  CREATE TABLE dbo.WEB_ADMIN_LOG (
    id int IDENTITY(1,1) PRIMARY KEY, at datetime2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    admin varchar(32) NOT NULL, address varchar(45) NOT NULL, action varchar(32) NOT NULL,
    account varchar(32) NULL, characterName varchar(32) NULL,
    result varchar(8) NOT NULL DEFAULT 'started', before nvarchar(2000) NOT NULL DEFAULT N'',
    after nvarchar(2000) NOT NULL DEFAULT N'', endedAt datetime2(0) NULL)
  ```
- The procedures, one per `AdminStore` method, each in the database it touches:
  - `ACCOUNT_DBF`: `usp_AdminLogBegin`, `usp_AdminLogEnd` (updates only `result = 'started'` rows),
    `usp_AdminLogRead`, `usp_AdminRecentLogins`, `usp_AdminAccountSearch`, `usp_AdminAccountGet`,
    `usp_AdminSetPassword`, `usp_AdminSetEmail`, `usp_AdminSetLoginAuthority`, `usp_AdminSetBlockTime`;
  - `CHARACTER_01_DBF`: `usp_AdminSetCharacterAuthority`, `usp_AdminCharacterSearch`, `usp_AdminCharacterGet`,
    `usp_AdminOnlineList`, `usp_AdminCharacterRename`, `usp_AdminCharacterSetGold`, `usp_AdminCharacterMove`,
    `usp_AdminCharacterDelete`, `usp_AdminCharacterUndelete`, `usp_AdminItemSend`, `usp_AdminItemSendList`,
    `usp_AdminItemSendCancel`.
  Plus `GRANT EXECUTE ON OBJECT::dbo.usp_CreateNewAccount`.
- **Rules inside the procedures:**
  - Every procedure uses `serverindex = '01'`.
  - Prefix searches escape `[`, `%` and `_` before `LIKE @q + '%'`.
  - `usp_AdminSetLoginAuthority` / `usp_AdminSetCharacterAuthority` refuse letters outside `FJLMNOP`.
  - `usp_AdminSetBlockTime @blockTime char(8) NULL`: NULL becomes `CONVERT(CHAR(8), GETDATE()-1, 112)`; otherwise it
    must be `'99991231'` or today or later.
  - Delete copies `CHARACTER_STR 'D1'` (`Database.sql:10094-10170`):
    - it refuses (`'guild'`) when the character is in `GUILD_MEMBER_TBL`;
    - otherwise it sets `isblock = 'D'`, `End_Time = yyyymmddhhmi`, `BlockTime = yyyymmdd`, and `MESSENGER_TBL`
      `State = 'D'` both ways.
  - Undelete:
    - `'too_old'` when `End_Time` is more than 7 days old;
    - `'slot_taken'` when a character of the same account and `playerslot` has `isblock = 'F'`;
    - otherwise `isblock = 'F'` and `End_Time = NULL`;
    - friends marked `'D'` stay deleted.
  - Rename fails `'taken'` when any other row has the same `m_szName`.
  - Item send inserts the columns FlyffWebShop's `ItemDeliveryService.php` fills, with `ItemFlag 0`,
    `ReceiveDt GETDATE()`, `idSender '0000000'` and `ItemBillingNo = @billingNo`.
  - Online = `MultiServer > 0`.
- **The install script:** like `Install-WebLogin.ps1`. Login `flyffweb_admin` with `CHECK_POLICY = ON`, users in both
  databases, `GRANT EXECUTE` on each procedure only. It can be run again (`CREATE` stub, then `ALTER`). It ends by
  logging in as `flyffweb_admin` and running `usp_AdminOnlineList`.
- **`admin-check.sql`:** the owner runs it in the VM as `flyffweb_admin`. Each line prints `PASS` or `FAIL`:
  - `SELECT` on `ACCOUNT_TBL` is denied;
  - a search for `'a_'` returns only names that start with `a_`;
  - `usp_AdminSetBlockTime` with yesterday's date is refused;
  - `usp_AdminLogEnd` on an ended row changes nothing.

- [ ] **Step 1: Write the failing static test** (`adminSql.test.ts` reads `admin-login.sql`):
  - every `CREATE`/`ALTER PROCEDURE` name starts with `usp_Admin`;
  - every `GRANT` matches `GRANT EXECUTE ON OBJECT::dbo\.(usp_Admin\w+|usp_CreateNewAccount) TO \[flyffweb_admin\]`;
  - no `GRANT (SELECT|INSERT|UPDATE|DELETE|ALTER|CONTROL)`;
  - no `EXEC\s*\(` and no `sp_executesql`;
  - each of the 22 names above appears.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminSql.test.ts`. It fails.
- [ ] **Step 3:** Write the three files.
- [ ] **Step 4:** Run the test. It passes. Check the PowerShell parses: run
  `powershell -NoProfile -Command "$e=$null; [void][Management.Automation.Language.Parser]::ParseFile('apps/web/sql/Install-AdminLogin.ps1',[ref]$null,[ref]$e); $e.Count"`,
  which prints `0`.
- [ ] **Step 5: Commit** `feat(admin): the admin SQL login, its procedures and the audit table`.

### Task 9: `sqlAdminStore.ts`

**Files:**
- Create: `apps/web/src/admin/sqlAdminStore.ts`
- Modify: `apps/web/src/sqlAccountStore.ts` (export its `lazyPool` and `firstValue` for reuse; no behaviour change)

**Interfaces:**
- Consumes: the `AdminStore` interface (Task 7), the procedures (Task 8).
- Produces: `sqlAdminStore(sql: WebConfig['sql'], login: AdminConfig['sql']): AdminStore & { close(): Promise<void> }`.
  It has two lazy pools logged in as `flyffweb_admin`. Every call is `.input(name, sql.<Type>(size), value)`, then
  `.execute('dbo.usp_Admin...')`.

- [ ] **Step 1:** Write the store, one method per procedure. The types must match the columns: `VarChar(32)` names,
  `Char(7)` ids, `Char(8)` dates, `NVarChar(2000)` details, `Int`, `Real`.
- [ ] **Step 2:** Run `npx tsc -p apps/web --noEmit`. There are no errors. The store is checked by the owner's VM
  run, as `sqlAccountStore` is.
- [ ] **Step 3: Commit** `feat(admin): the SQL Server admin store`.

## Milestone 4: The actions

### Task 10: The audit runner and the log actions

**Files:**
- Create: `apps/web/src/admin/audit.ts`, `apps/web/src/admin/actions/log.ts`
- Test: `apps/web/test/adminAudit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AuditPlan { action: string; account?: string; characterName?: string; before: unknown }
  export interface AuditOutcome { answer: HttpAnswer; result: LogResult; after: unknown }
  export function runAudited(deps: AdminDeps, ctx: AdminContext, plan: AuditPlan, act: (auditId: number) => Promise<AuditOutcome>): Promise<HttpAnswer>;
  export const LOG_ACTIONS: Record<'log.read' | 'log.logins', ActionHandler>;
  ```
- **`runAudited`:**
  - It writes `before`/`after` as JSON cut to 2000 characters.
  - When `logBegin` throws, `act` is not called and the answer is 500 `server`.
  - When `act` throws, `logEnd(id, 'failed', {message})` and 500.
  - When `logEnd` throws, it warns but still returns `act`'s answer.
- **`log.read`** takes `{ beforeId?, account?, characterName?, action? }` and gives `{ rows }`. **`log.logins`** gives
  `{ rows }`.

- [ ] **Step 1: Write the failing tests** with the memory store:
  - a good action leaves one row that goes `started` then `ok`, with `before`/`after`;
  - an action that throws leaves `failed`;
  - a store whose `logBegin` throws gives 500, and the action was never called (check `calls`);
  - `before` over 2000 characters is cut;
  - `log.read` with `account` filters.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminAudit.test.ts`. It fails.
- [ ] **Step 3:** Implement both files and register `LOG_ACTIONS` in `main.ts`'s `actions`.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): every change logged first, and the log actions`.

### Task 11: Server state and `status`

**Files:**
- Create: `apps/web/src/admin/serverState.ts`, `apps/web/src/admin/actions/status.ts`
- Test: `apps/web/test/adminStatus.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ServerState { name: ServerName; ports: number[]; up: 'up' | 'down' | 'partial' }
  export function readServers(deps: AdminDeps): Promise<ServerState[]>; // probes all ports at once, PROBE_TIMEOUT_MS from status.ts
  export function characterEditsOpen(deps: AdminDeps): Promise<{ open: boolean; seen: string }>; // open when every Database and World port is closed; seen e.g. "Database down, World down"
  export const STATUS_ACTIONS: Record<'status', ActionHandler>;
  ```
- **`status` answers** `{ servers, gateway: boolean, sql: boolean, players: number | null, online: CharacterRow[] | null,
  stale: boolean, charactersOpen: boolean }`:
  - `stale` is true and `online` is null when World is not `up`;
  - `players` is null when SQL is down.

- [ ] **Step 1: Write the failing tests** with a fake `probe` that answers from a set of open ports:
  - all open: every server is `up`, and `charactersOpen` is false;
  - only 7000 closed: Database is `partial`, and edits are still locked;
  - all Database and World ports closed: `charactersOpen` is true, `stale` is true and `online` is null;
  - `sqlAlive` false: `sql` false and `players` null, with no throw.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminStatus.test.ts`. It fails.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): server status and the character edit lock`.

### Task 12: Account actions

**Files:**
- Create: `apps/web/src/admin/actions/accounts.ts`
- Test: `apps/web/test/adminAccounts.test.ts`

**Interfaces:**
- Produces `ACCOUNT_ACTIONS`:
  - `accounts.search`: `{ account?, email?, characterName? }` gives `{ rows: AccountRow[] }`. A character name searches
    characters, then gets their accounts.
  - `accounts.get`: `{ account }` gives `{ account: AccountRow, characters: CharacterRow[] }`, or 404.
  - `accounts.create`: `{ account, password, email }`. It uses `checkSignUp` with empty reserved names and
    `hashPassword`. 409 `taken` on 0.
  - `accounts.password`: `{ account, password }`, with sign-up's password rule.
  - `accounts.email`: `{ account, email }`.
  - `accounts.authority`: `{ account, authority: Authority }`. It calls `setLoginAuthority`, then
    `setCharacterAuthority`; one audit row with both results.
  - `accounts.ban`: `{ account, until: 'yyyy-mm-dd' | 'forever', reason: string (1-200) }`.
  - `accounts.unban`: `{ account }`. It calls `setBlockTime(account, null)`.
- **Every write:**
  - it trims the name and gets the account first (404 if missing);
  - it targets `row.account` as stored;
  - it runs through `runAudited` with `account` set and `before` the row (never the password or its hash). A ban's
    `reason` goes in `after`.
- A ban date before today is 400 `invalid` with `field: 'until'`. "Today" here is Node's local date, as a quick check
  for the form: the procedure checks again with `GETDATE()`.

- [ ] **Step 1: Write the failing tests:**
  - `accounts.get` with `' POREOTIX '` finds `Poreotix`, and a later `accounts.ban` writes to `Poreotix`;
  - `accounts.authority` with `'X'` gives 400;
  - with `'P'` both store calls happen, and there is one `ok` row;
  - `accounts.ban` with `forever` stores `'99991231'`;
  - with a past date: 400 and the field `until`;
  - `accounts.unban` passes `null`;
  - `accounts.password`'s audit row contains neither the password nor its hash;
  - `accounts.create` of a reserved name such as `admin1` passes, while `checkSignUp`'s other rules still apply;
  - a missing account gives 404, with no change and no `ok` row.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminAccounts.test.ts`. It fails.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): account search, create, password, email, GM level and bans`.

### Task 13: Character actions

**Files:**
- Create: `apps/web/src/admin/actions/characters.ts`
- Test: `apps/web/test/adminCharacters.test.ts`

**Interfaces:**
- Consumes: `characterEditsOpen` (Task 11), `validateCharacterName` (Task 1).
- Produces `CHARACTER_ACTIONS`:
  - `characters.search`: `{ name?, account? }` gives `{ rows }`.
  - `characters.get`: `{ idPlayer }` gives `{ character: CharacterDetail, pending: PendingSend[] }`.
  - `characters.rename`: `{ idPlayer, name }`.
  - `characters.gold`: `{ idPlayer, gold: 0..MAX_PANEL_GOLD }`.
  - `characters.move`: `{ idPlayer }`. It moves to Flarine: world 1, (6971.984, 100.0, 3336.884).
  - `characters.delete` and `characters.undelete`: `{ idPlayer }`.
- **Each write:**
  - it calls `characterEditsOpen` first; if it is closed, 423 `locked` with `message: seen`, plus an audit row with
    result `refused`;
  - then `runAudited` with `characterName` and `account` set.
- `'guild'` gives 409 `refused` with the message "Remove the character from its guild in the game first".
  `'slot_taken'` and `'too_old'` give 409 `refused`.

- [ ] **Step 1: Write the failing tests:**
  - with servers up, `characters.rename` gives 423, a `refused` row, and the store's rename is never called;
  - with servers down, a good rename gives 200;
  - `'1abc'` gives 400 with the name message; a taken name gives 409 `taken`;
  - `characters.gold` with `2_000_000_001` gives 400;
  - `characters.move` stores world 1 and the Flarine spot;
  - delete of a guild member gives 409 `refused`;
  - undelete with a taken slot gives 409 `refused`.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminCharacters.test.ts`. It fails.
- [ ] **Step 3:** Implement and register.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): character search and offline-only edits`.

### Task 14: The item list and sends

**Files:**
- Create: `apps/web/src/admin/itemCatalog.ts`, `apps/web/src/admin/actions/sends.ts`
- Test: `apps/web/test/adminSends.test.ts`, with a small fixture `apps/web/test/fixtures/assets/index.json` plus one
  `data/itemProps.<hash>.json`

**Interfaces:**
- Produces:
  ```ts
  export interface CatalogItem { id: number; name: string; packMax: number; upgradable: boolean } // upgradable: kind1 1 or 2
  export function loadItemCatalog(assetsDir: string): CatalogItem[]; // index.json `files['data/itemProps.json']`; skips empty names; [] plus a warning when missing
  export function searchItems(items: CatalogItem[], query: string, limit?: number): CatalogItem[]; // default 30; an all-digit query matches the id first, then case-insensitive substring of the name
  export const SEND_ACTIONS: Record<'items.search' | 'sends.list' | 'sends.item' | 'sends.penya' | 'sends.cancel', ActionHandler>;
  ```
- **`sends.item`:** `{ idPlayer, itemId, count, upgrade }`.
  - The item must be in the catalog.
  - `count` is 1 to `packMax`; `upgrade` is 0 to 10, and only 0 when the item can't be upgraded.
  - `Item_Name = String(itemId)`, `billingNo = 'ADMIN' + auditId`.
- **`sends.penya`:** `{ idPlayer, amount }`. It needs `gold + pending penya + amount <= MAX_PANEL_GOLD`, where pending
  penya are the `pendingSends` rows with item `'penya'`. Then it sends `Item_Name 'penya'`, count = amount, upgrade 0.
- **`sends.cancel`:** `{ idPlayer, no }`.
  - It refuses (409 `refused`) when the row isn't `byPanel`.
  - It refuses when the character is `online` while `characterEditsOpen` is false (online flags are only true while
    the World runs).
- Sends work while the servers run.

- [ ] **Step 1: Write the failing tests:**
  - `searchItems` with `'500'` puts id 500 first, and `'cap'` matches case-insensitively;
  - a count above `packMax` gives 400;
  - an upgrade of 3 on a non-upgradable item gives 400;
  - a good send stores `billingNo` `'ADMIN<id>'` equal to its audit row id;
  - penya with gold 1,999,999,000 and a pending 500 refuses an amount of 600 and accepts 500;
  - cancel of a game row gives 409, and of a panel row gives 200;
  - `loadItemCatalog` on a missing folder gives `[]` and does not throw.
- [ ] **Step 2:** Run `npx vitest run apps/web/test/adminSends.test.ts`. It fails.
- [ ] **Step 3:** Implement and register. `main.ts` loads the catalog once at start.
- [ ] **Step 4:** Run it again. It passes.
- [ ] **Step 5: Commit** `feat(admin): item search, item and penya sends, cancel of panel sends`.

## Milestone 5: The page

The page is plain ES modules in `apps/web/admin/`, with no build. Shared helpers live in `js/ui.js`:
- `el(tag, props, ...children)` sets text with `textContent`;
- `api(name, body)` posts JSON with `X-Admin-Token`, adds a `crypto.randomUUID()` `requestId` to writes, and on 401
  shows the login box;
- `confirmBox(text)`.

The layout follows spec 5.5's sketch, desktop-first, and from 600 px down the tabs wrap and tables scroll inside their
box. Each tab keeps its inputs when the login box comes and goes.

### Task 15: Page shell, login box and the Status tab

**Files:**
- Create: `apps/web/admin/index.html`, `apps/web/admin/panel.css`, `apps/web/admin/panel.js`,
  `apps/web/admin/js/ui.js`, `apps/web/admin/js/status.js`, `apps/web/admin/js/log.js` (the front page's recent
  logins come from `log.logins`)
- Modify: the static file list in `adminServer.ts`

- [ ] **Step 1:** Write the files.
  - The front page shows the Status tab and, under it, "Recent logins" (time, IP, ok or failed).
  - Status refreshes every 30 s while the tab is shown.
  - The lock line: "Servers running: character edits locked" / "Database and World stopped: character edits open".
  - The login box (name, password, code) submits once and shows "Wrong name, password or code" / "Too many tries,
    wait".
- [ ] **Step 2:** Check by hand. Run the demo from Task 19 if it is done, or the dev config. The page loads with no
  console error and no CSP report.
- [ ] **Step 3: Commit** `feat(admin): panel page, login box and status`.

### Task 16: Accounts and Characters tabs

**Files:**
- Create: `apps/web/admin/js/accounts.js`, `apps/web/admin/js/characters.js`

- [ ] **Step 1:** Write the tabs.
  - **Accounts:** a search box (account, email or character name) and a result table. A clicked account shows its
    view with the forms: password, email, GM level (select by name), ban (date or forever, plus reason), unban,
    create.
  - GM level and "ban forever" ask to confirm.
  - **Characters:** search and view. The edit buttons are disabled, with the lock line's text, while `charactersOpen`
    is false.
  - Each write button is disabled until its request answers.
- [ ] **Step 2:** Check by hand against the demo: search, open, ban, unban.
- [ ] **Step 3: Commit** `feat(admin): accounts and characters tabs`.

### Task 17: Send and Log tabs

**Files:**
- Create: `apps/web/admin/js/send.js`; finish `apps/web/admin/js/log.js`

- [ ] **Step 1:** Write the tabs.
  - **Send:** pick a character (search), search items (it calls `items.search` as you type, after 250 ms), then count
    and upgrade (hidden when the item can't be upgraded), or penya.
  - Under it, the pending list with "panel" or "game" and Cancel on panel rows only.
  - **Log:** filters for account, character and action, 50 rows, and "Older" for the next page; rows still `started`
    are marked.
- [ ] **Step 2:** Check by hand against the demo: one item send, one penya send, cancel.
- [ ] **Step 3: Commit** `feat(admin): send and log tabs`.

### Task 18: Demo server and the Playwright check

**Files:**
- Create: `apps/web/scripts/adminDemo.ts`
  - it starts `createAdminServer` on `127.0.0.1:8099` with origin `http://127.0.0.1:8099`;
  - it uses `memoryAdminStore` seeded with accounts `Poreotix` and `tester1`, and the latter's email is
    `<img src=x onerror=alert(1)>`;
  - plus 2 characters, the fixture catalog, a fixed TOTP secret and password `demo-password-1`, and a probe that
    reports every port closed.
- Create: `apps/web/playwright.config.ts` (projects `chromium`: Desktop Chrome; `phone`: Pixel 7 landscape;
  `webServer` runs the demo), `apps/web/e2e/admin.spec.ts`
- Modify: root `package.json` (`"admin:demo": "tsx apps/web/scripts/adminDemo.ts"`,
  `"test:e2e:admin": "playwright test -c apps/web/playwright.config.ts"`)

- [ ] **Step 1: Write the spec**, `admin.spec.ts`. The code is worked out in the test with `totpCode` from
  `../src/admin/totp`.
  - Log in, and the Status tab shows 7 servers.
  - Search `POREOTIX`, open it, and ban until a future date. The view shows the date, and the Log tab has the row.
  - `tester1`'s email shows as the literal text `<img src=x onerror=alert(1)>`, and no `img` element is in the view.
  - Double-click "Send" on an item send: the pending list gains exactly one row.
  - Clear the cookies, then click Find: the login box shows, and after logging in the search box still holds its
    text.
- [ ] **Step 2:** Run `npm run test:e2e:admin` once. All pass on both projects.
- [ ] **Step 3: Commit** `test(admin): demo server and the panel's browser check`.

## Milestone 6: Hosting and deploy

### Task 19: Hosting docs, the owner's deploy steps and the README

**Files:**
- Modify: `docs/hosting.md`. Add a new "Step 8b. The admin panel" after step 8. Step 8's Caddyfile block keeps exactly
  one site line. 8b has its own code block:
  ```
  admin.play.example.com {
  	header {
  		Strict-Transport-Security "max-age=31536000"
  		X-Content-Type-Options nosniff
  		X-Frame-Options DENY
  		Referrer-Policy no-referrer
  		X-Robots-Tag noindex
  		Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
  		-Server
  	}
  	request_body {
  		max_size 16KB
  	}
  	reverse_proxy 127.0.0.1:8092
  }
  ```
  It also covers the DNS A record `admin`, `Install-AdminLogin.ps1`, `npm run admin:setup -- --file
  C:\flyff-web\admin-login.json`, the `admin` section, and `nssm restart flyffweb-site` + `nssm restart flyff-caddy`,
  with what success looks like for each.
- Create: `docs/admin-panel-deploy.md`, the owner's steps.
  - **VM first:** `Install-AdminLogin.ps1`, `admin-check.sql` (every line `PASS`), `admin:setup`, an `admin` section
    with origin `http://127.0.0.1:8092`, restart, and a log-in from a browser in the VM.
  - **Then the VPS:** the DNS record, then `deploy\Update-FlyffWeb.ps1 -FlyffWebOnly` (or a pull),
    `Install-AdminLogin.ps1`, `admin:setup`, then the Caddy block and the restarts.
  - **Pass criteria:** `https://admin.osflyff.online` shows the login; a wrong code is refused; the Status tab shows 7
    servers.
  - **The kill switch** (spec 5.6).
- Modify: `apps/web/README.md` (the admin section, the settings, `admin:setup`, `admin:demo`, `test:e2e:admin`).

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Check the block count with `node -e` (or by reading). Step 8's block has one site line, and 8b's
  block starts with `admin.play.example.com {`.
- [ ] **Step 3: Commit** `docs(admin): hosting step 8b and the owner's deploy steps`.

### Task 20: The server repo's deploy scripts (outer repo, its own worktree)

**Where:** a new worktree of the outer repo at `C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash-worktrees\admin-panel-deploy`,
branch `admin-panel-deploy`, made from the outer `main`. Never edit, stash or switch branches in the outer main folder:
it holds the owner's uncommitted work.

**Files:**
- `deploy/Common.ps1`:
  - `Get-Caddyfile` also cuts the 8b block (the regex `(?s)```\r?\n(admin\.play\.example\.com \{.*?)\r?\n````), puts
    `admin.<domain>` in, and appends it;
  - this happens only when the settings say `adminPanel` is `$true`;
  - the one-site-line check stays for step 8's block.
- `deploy/2-Setup-Database.ps1`: run `apps\web\sql\Install-AdminLogin.ps1` the way `Install-WebLogin.ps1` is run (the
  `Read-Host` shadow), with a random `adminSqlPassword` kept in `deploy.json`. It drops a stale `flyffweb_admin` user
  as it does for `flyffweb_site`.
- `deploy/4-Setup-FlyffWeb.ps1`:
  - when `adminPanel` is true, it writes the `admin` section: listen `127.0.0.1:8092`, origin
    `https://admin.<domain>`, `flyffweb_admin` and its password, `credentialsFile C:\flyff-web\admin-login.json`;
  - it says "run npm run admin:setup" when that file is missing.
- `deploy/Check-Server.ps1`: when `adminPanel` is true, port 8092 answers locally and `https://admin.<domain>` answers.
- `deploy/README.md`: the `adminPanel` setting, the steps, and the kill switch.

- [ ] **Step 1:** Make the changes. `adminPanel` defaults to `$false` when missing from `deploy.json`.
- [ ] **Step 2:** Run the parse check on every changed `.ps1` (the Task 8 one-liner). It prints `0`. Run
  `run.bat 4-Setup-FlyffWeb -DryRun` (or the scripts' existing dry-run switch). It lists the admin steps with
  `adminPanel` true and none with it false.
- [ ] **Step 3: Commit** on `admin-panel-deploy`: `feat(deploy): the admin panel, behind deploy.json's adminPanel`.

## After the last task

- [ ] Run `npx vitest run apps/web packages/protocol/test/characterName.test.ts`. All pass.
- [ ] Hand the owner:
  - the commands `npm test`, `npm run test:e2e:admin` and `npm run test:e2e:client` (the last two are the full browser
    runs);
  - `docs/admin-panel-deploy.md` (the VM steps first);
  - both branch names: FlyffWeb `refs/heads/admin-panel`, and the server repo `refs/heads/admin-panel-deploy`.
- [ ] Nothing is merged or pushed until the owner says so.

# FlyFF Web — Public launch limits — Design Spec

**Date:** 2026-10-22
**Status:** Draft for review
**Builds on:** the Piece 2 spec, `docs/superpowers/specs/2026-10-22-piece2-gateway-protocol-design.md` (section 4.2, the gateway's behaviour; section 5, the certifier change).

C++ paths are relative to the server folder (`Blouflash VS22 V15/`), which holds `Source/`, `Program/`, `Output/` and `FlyffWeb/`.

---

## 1. Brief

- **Goal:** make the servers and the gateway safe for many browser players who all reach the servers from the gateway's one address, before the game's address is announced to the public.
- **Three problems:**
  1. The servers' flood limiter (certifier and login server) counts every browser player as one address, so a busy server cuts off every browser player at once.
  2. The gateway has no limit on how fast one address opens connections and no limit on the total, so one client can churn connections.
  3. The certifier's wrong-password memory holds 3 addresses per login thread, so on a busy server a guesser's count is forgotten within seconds.
- **Chosen approach:** the servers skip their flood limiter for the listed gateway address, and the gateway limits each real player address instead. Two alternatives were rejected:
  - *Turning the limiter off:* Neuz on the home network, and any game port opened by mistake, would have no flood protection at all.
  - *Rewriting the limiter with a higher limit for the gateway:* more C++ code, and crossing the higher limit still cuts off everyone at once.
- **Decisions by the owner (2026-10-22):**
  - Approach as above.
  - The wrong-password count is kept **per address and account** (section 3.2), knowing that this lets one address try a few passwords on every account (section 8).
  - Expected players online at once: not known yet. The gateway's total cap is 1000 connections, changeable in its config.
  - Where players play from: not known yet. Shared addresses (internet cafés, mobile carriers) are assumed to be common, so the per-address limits are generous.

---

## 2. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| Flood limiter rule | `CDos2::IsOver` keeps a count per address. A connection that arrives less than 200 ms after the start of the address's current burst adds 1; a later one starts a new burst, but the count is never reduced. At 50 the address is blocked: the first refused connection shuts down every open connection from that address (`ShutdownAddr`), later ones are closed at once. A global timer frees blocked addresses every 10 minutes, so a block lasts up to 10 minutes. | `Source/_Network/Misc/Src/dos2.cpp:37-96`, `Source/_Network/Net/Src/serversock.cpp:331-355,578-620` |
| Where it is on | `__DOS1101` is defined only for the certifier and the login server. The cache server compiles `dos2.cpp` but doesn't define `__DOS1101`, so it never calls it. No other server compiles it. | `Source/CERTIFIER/VersionCommon.h:19`, `Source/LOGINSERVER/VersionCommon.h:16`, `Source/CACHESERVER/CacheServer.vcxproj` |
| When it runs | In the listen thread, right after `WSAAccept` and before any packet is read. The player's real address arrives later, in the gateway's first packet (`0xE0`), and only the certifier reads that packet. So the limiter can't count real player addresses. | `Source/_Network/Net/Src/serversock.cpp:597-620` |
| Config reading order | Both servers read their `.ini` file (`Script`) before `StartServer` creates the listen thread. | `Source/CERTIFIER/certifier.cpp:150-171`, `Source/LOGINSERVER/LoginServer.cpp:110,157` |
| Certifier `Gateway` lines | `Certifier.ini` takes up to 8 `Gateway "a.b.c.d"` lines (`CDPCertifier::AddGateway`, checked by `IsDottedIPv4`). They come from `certifier-client-addr.patch`. | `server-patches/certifier-client-addr.patch` |
| Login server config | `LoginServer.ini` has no `Gateway` line today; its parser ignores unknown words. | `Source/LOGINSERVER/LoginServer.cpp:228-290` |
| Lockout memory | One `CAccountMgr` per DB worker thread; there are 8 (`DEFAULT_DB_WORKER_THREAD_NUM`). `PostQ` picks the thread from a hash of the lower-cased account name, so one account always goes to the same thread. Each `CAccountMgr` keeps the 3 most recently seen addresses (`m_cache.size() < 3`); `SetError` changes the entry `Check` just moved to the front. | `Source/CERTIFIER/AccountMgr.cpp:34-95`, `Source/CERTIFIER/DBManager.h:13`, `Source/CERTIFIER/DBManager.cpp:326-365,412-418`, `Source/CERTIFIER/DPCertifier.cpp` (`OnCertify`, `_tcslwr`) |
| Lockout rules | 3 or more wrong passwords: blocked while the last one is at most 15 minutes old. 1 or 2: blocked while the last one is at most 15 seconds old (every language but Korean). A good login sets the count to 0. A blocked attempt doesn't reach the database and doesn't change the count. | `Source/CERTIFIER/AccountMgr.cpp:44-58`, `Source/CERTIFIER/DBManager.cpp:214-278` |
| Who counts | Only `Certify` (in `DbWorkerThread`) counts wrong passwords. It is the worker this build uses: language 1, so `bGPAuth` is false. `Certify2` and `Certify_Japan` only clear the count. | `Source/CERTIFIER/DBManager.cpp:60-84,476-506,778-796` |
| Many tries per connection | After a wrong password the certifier answers with an error and keeps the connection open; `OnCertify` accepts another CERTIFY on the same connection. The gateway allows 100 packets a second per connection. | `Source/CERTIFIER/DPCertifier.cpp` (`SendError`, `OnCertify`), `apps/gateway/src/config.ts` |
| Gateway today | Limits: 8 open connections per address (4007), 100 packets a second and 16 KB per packet per connection (4004). No limit on new connections per minute, no total cap. Refused upgrades (403 origin, 404 path, 400 address) are not logged; 4003 and 4007 refusals get one `close … up=0 down=0` line each. | `apps/gateway/src/server.ts`, `apps/gateway/src/limits.ts` |
| Client connections | A login opens 2 connections (certifier, then login server); a channel change opens 2 more. | `apps/client/src/lobby/LoginFlow.ts:191,269` |

---

## 3. Design

### 3.1 The flood limiter skips the gateway (`flood-limiter-gateway.patch`)

- **Shared code (`dos2.h`, `dos2.cpp`):**
  - New `static BOOL CDos2::AddExempt( const char* lpszAddr )`. It takes a dotted IPv4 address (digits and exactly three dots, 7 to 15 characters, accepted by `inet_addr`) and adds it to a list of at most 8. It returns FALSE, and adds nothing, for anything else or a ninth address.
  - `IsOver` returns 0 straight away for a listed address: it is never counted, never blocked and never shut down.
  - The list is static storage. It is written only while the `.ini` file is read, before the listen thread exists, and only read afterwards, so it needs no lock.
- **Certifier (`DPCertifier.cpp`):** `AddGateway`, after it has accepted an address, also calls `CDos2::AddExempt` with it. The existing `Gateway` lines in `Certifier.ini` therefore mean both "may send a player's address" and "skips the flood limiter". No new setting.
- **Login server (`LoginServer.cpp`):** `Script` reads `Gateway "a.b.c.d"` lines and calls `CDos2::AddExempt`. An address it can't take is written to the error log as `Gateway <address> not added` and ignored.
- **Unchanged:** every address that isn't listed is handled exactly as today. With no `Gateway` line, both servers behave as today. The cache server compiles the changed file but still never uses it.
- **Security:** a listed address can open connections as fast as it likes. Only addresses of the machine itself belong in the list (`127.0.0.1`, or the machine's own `ipconfig` address), the same rule `server-patches/README.md` already gives for `Certifier.ini`. On the hosted machine the game ports are closed to the internet, so only programs on the machine connect from `127.0.0.1`.

### 3.2 The wrong-password count per address and account (`certifier-lockout.patch`)

- **What is counted:** one count per pair of player address and account name. The account name is the lower-cased one `OnCertify` already makes. Since one account always goes to the same DB worker thread, each thread's `CAccountMgr` holds every count for its accounts, and no lock is added.
- **Interface (`AccountMgr.h`, `AccountMgr.cpp`):**
  - `Check( DWORD dwIP, const char* lpszAccount )` replaces `Check( DWORD dwIP )`. It returns the same three results as today, by the same rules and numbers (section 2).
  - `SetError( int nError )` keeps its signature and acts on the pair of the last `Check`, as today it acts on the entry `Check` just touched. `nError > 0` adds 1 and records the time; `0` forgets the pair.
  - The 3-entry list becomes a `map` keyed by address and account. A pair with no wrong password isn't stored at all; it reads as "no errors", as today.
- **How long a count is kept:** until a good login from that address to that account, or 24 hours after the last wrong password. As in today's code when an entry isn't pushed out, the count doesn't drop when a 15-minute block ends: the next wrong password blocks for 15 minutes again.
- **Memory cap:** at most 20,000 pairs per thread, 160,000 in all (a few MB). Before a new pair is added to a full map, pairs whose last wrong password is more than 24 hours old are removed; if it is still full, the pair with the oldest last wrong password is removed.
- **Callers (`DBManager.cpp`):** `Certify`, `Certify2` and `Certify_Japan` pass the account name to `Check`. Their `SetError` lines stay as they are.
- **Behaviour that changes on purpose:**
  - Other players' logins no longer push a count out.
  - A wrong password on one account no longer blocks a different account from the same address, even when both accounts land on the same thread.
- **Account names the count can't tell apart are refused (added after the final review).** `LOGIN_STR` takes `VARCHAR(32)` and compares with trailing spaces ignored, and its collation may take other characters as equal. So `acc1`, `acc1 ` and a padded name over 32 characters all reach account `acc1`, each with a count of its own, which would allow unlimited guessing. `OnCertify` therefore closes the connection, as for an apostrophe, unless `CAccountMgr::IsAccountName` accepts the name: 1 to 32 characters, each printable ASCII other than a space. The lobby refuses the same names before sending. Portal-registered names (4 to 32 letters, digits, dashes and underscores) are not affected. This adds `DPCertifier.cpp` to `certifier-lockout.patch`.

### 3.3 Gateway limits

**Limits** (the `limits` part of `gateway.config.json`; each is a whole number of at least 1, as the existing limits are):

| Limit | Default | Close code | What the player sees |
|---|---|---|---|
| `maxConnections`: open connections in all (new) | 1000 | 4009 `GATEWAY_FULL` (new) | "The game is full right now. Try again in a few minutes." |
| `maxConnectionsPerAddress`: open connections per address | 32 (was 8) | 4007 `TOO_MANY_CONNECTIONS` | "Too many connections from your network." |
| `maxNewConnectionsPerAddressPerMinute`: new connections per address in any 60 seconds (new) | 60 | 4008 `TOO_MANY_NEW_CONNECTIONS` (new) | "Too many connection attempts from your network. Wait a minute and try again." |

- **Order, after the WebSocket opens:**
  1. The route (4003, as today).
  2. The total (4009).
  3. Open connections of the address (4007).
  4. New connections of the address in the last 60 seconds (4008).
- **What is counted:** only a connection that passes all four checks takes a slot of the total and of its address (given back when its relay ends), and is recorded in its address's 60-second window. A refused connection is not counted, so a player who retries is not pushed further back, and it never opens a TCP connection to a server.
- **Memory:** an address is forgotten once its newest recorded connection is 60 seconds old. The forgotten addresses are swept out at most once every 60 seconds, during a check.
- **Parts:**
  - `apps/gateway/src/limits.ts`: `RateWindow` gets an optional window length (default 1000 ms, for the packet rate). New `AddressRate`, a 60-second window per address with the sweep above. The total is a plain count in `server.ts`; the open connections per address stay `AddressCounter`.
  - `apps/gateway/src/refusalLog.ts` (new): the throttled refusal log, below.
  - `apps/gateway/src/server.ts`: the new checks and the refusal log. The player's address is worked out before the origin check, so 403 and 404 refusals can name it.
  - `apps/gateway/src/config.ts`: the new limits and defaults in `DEFAULT_LIMITS`.
  - `packages/protocol/src/gatewayCloseCodes.ts`: `TOO_MANY_NEW_CONNECTIONS: 4008`, `GATEWAY_FULL: 4009`.

**Refusal log.** Every refused connection goes through it: 403, 404, 400 before the upgrade, and 4003, 4007, 4008, 4009 after it. It replaces today's `close … up=0 down=0` lines for 4003 and 4007. Normal connections keep their `open …` and `close …` lines.

- **Time is cut into one-minute periods.** In each period:
  - The first refusal of an address for a reason is logged at once: `refused <address> <reason>`.
  - Further refusals of the same address and reason are counted. When the period ends, each such pair gets one line: `refused <address> <reason> x<n> more in the last minute`.
  - At most 50 address-and-reason pairs are named. Refusals beyond those are summed, and at the end of the period they become one line: `refused <n> more connections from other addresses in the last minute`.
  - A quiet period writes nothing.
- **Reasons:**

  | Reason | Refusal |
  |---|---|
  | `origin` | 403: `Origin` missing or not in `allowedOrigins` |
  | `path` | 404: not `/connect/<address>:<port>` |
  | `address` | 400: the player's address can't be told |
  | `route` | 4003 |
  | `per-address` | 4007 |
  | `rate` | 4008 |
  | `full` | 4009 |

- **The address shown** is the player's address when it can be told, otherwise the direct peer's address in plain IPv4, otherwise `unknown`. Nothing the browser sent is written: not the origin, not the path.
- **The period timer** doesn't keep the process alive. On `close()` the gateway writes the pending summary lines and stops the timer.

### 3.4 Lobby client

`apps/client/src/lobby/errorText.ts` gets the texts for 4008 and 4009 from the table in section 3.3.

---

## 4. Error handling

- **Servers:** a bad or ninth `Gateway` line is written to the error log and ignored; the server still starts. A full lockout map removes old pairs, as in section 3.2.
- **Gateway:** a bad value for a new limit stops the gateway at start, naming it (for example `limits.maxConnections must be a whole number from 1 to 9007199254740991`), as for the existing limits. The refusal log never throws into a request handler.

---

## 5. Testing

- **C++ test program** (`server-patches/tests/`, new):
  - Built with the VS 2022 compiler (`cl.exe`, x86) from the patched `dos2.cpp` and `AccountMgr.cpp`, with small stand-ins for what they include from the servers and a test clock in place of `GetTickCount` and `time`.
  - **Flood limiter:**
    - A listed address is never refused, even after 1,000 connections 0 ms apart.
    - An unlisted address is still refused from its 50th rapid connection, exactly as today: -1 first, then 1.
    - `AddExempt` refuses a bad address and a ninth one.
  - **Lockout:**
    - One wrong password blocks that account from that address for 15 seconds, and only that pair. The same account from another address, and another account from the same address, can log in.
    - Three wrong passwords block for 15 minutes; after that, the next wrong password blocks for 15 minutes again.
    - A good login clears the count.
    - A count is forgotten 24 hours after the last wrong password.
    - A full map removes the oldest pair first.
  - A Git Bash script builds it and runs it; it prints `PASS` or the failed check.
- **Gateway unit tests (vitest), with a fake clock:**
  - `AddressRate`: the 60-second window, refused calls not counted, the sweep forgetting old addresses.
  - `RefusalLog`:
    - the first line at once;
    - the repeat summary at the period's end;
    - the 50-pair cap and the overflow line;
    - nothing in a quiet period;
    - pending lines written by `close()`.
  - `parseConfig`: the new limits, their defaults, bad values refused.
- **Gateway server tests** against `FakeFlyffServer`, with small limits:
  - 4009 at the total cap, 4008 at the per-minute limit, 4007 as before;
  - the order of the checks;
  - that a refused connection never reaches the server;
  - the refusal lines for 403, 404, 400, 4003, 4007, 4008 and 4009;
  - a slot given back when a relay ends.
- **Client:** the texts for 4008 and 4009.
- **Whole repository:** `npm test` and `npm run typecheck` pass.
- **Builds:**
  - MSBuild, Release, Win32: `Certifier.vcxproj`, `LoginServer.vcxproj`, and `CacheServer.vcxproj` (only to show the shared file still builds there).
  - The exes land in `Output\…\Release`; nothing is written to `Program\`.
- **Patches:** each new patch applies with `git apply --check` to the files it was made from, in order after `certifier-client-addr.patch`, and is applied in `Source\` on this PC.
- **Not tested here:** the new exes against the running servers. The owner swaps them in following `server-patches/README.md`, and its check steps say what to look for.

---

## 6. Docs

- **`docs/hosting.md`:**
  - Step 4 also covers the new certifier exe, the login server's exe, and the `Gateway "127.0.0.1"` line in `LoginServer.ini`.
  - "Known limit before a public launch" is rewritten to cover:
    - what is now fixed;
    - what isn't: a flood from thousands of different addresses, which needs an outside service, and players on one shared address sharing the limits;
    - when the address may be announced: once the new exes and `Gateway` lines are in place and step 9's checks pass.
  - The limits text and the troubleshooting table get the new messages, the raised per-address limit and the `refused` log lines.
- **`server-patches/README.md`:** a section per new patch (why, what changes, apply, build, put in service, undo), in the existing style, and the order to apply the three patches in.
- **Smaller updates where the old limiter is described:**
  - `README.md`: the `server-patches` row and the `npm run test:live` row;
  - `docs/device-testing.md`;
  - `apps/client/test/lobby.live.test.ts` (its comment) and `apps/client/test/live.config.example.json` (its `_comment`).

  They say the limiter no longer counts the gateway once the new exes and lines are in place, and still does until then.

---

## 7. Done criteria

1. This spec and its plan are approved by the owner.
2. `flood-limiter-gateway.patch` and `certifier-lockout.patch` are in `server-patches/` and applied in `Source\` on this PC.
3. The certifier and the login server build with VS 2022 MSBuild into `Output\`. The cache server also builds. `Program\` is untouched.
4. The C++ test program passes.
5. `npm test` and `npm run typecheck` pass, with the new gateway, protocol and client tests.
6. The docs in section 6 are updated.
7. Everything is committed in `FlyffWeb` on the branch `public-launch-limits`, started from `piece2-gateway`. Nothing is pushed unless the owner asks.

---

## 8. Out of scope

- A flood from many different addresses at once (a DDoS). The total cap only bounds open connections; stopping such a flood needs a service in front of the machine, such as Cloudflare.
- The flood limiter's count that never goes down, for addresses that aren't listed (Neuz on the home network). It is unchanged.
- A wrong-password count shared by all accounts of an address. The owner chose per address and account.
- The cache and world servers, which have no address-based limits.
- Swapping the exes into `Program\`, and a live check against the running servers.

---

## 9. Risks

- **Trying many accounts from one address (accepted by the owner):** with the count per address and account, one address can try 3 passwords on every account, at a speed limited only by the gateway's limits and the database. A possible follow-up is an address-wide ceiling (for example, 20 wrong passwords from one address on any accounts within 15 minutes blocks that address).
- **Shared addresses share the gateway's limits:** 32 open connections and 60 new ones a minute for everyone behind one café or carrier address. Both are one config line each.
- **Wrong `trustedProxies`:** if the gateway doesn't believe Caddy's `X-Forwarded-For`, every player looks like `127.0.0.1` and the per-address limits apply to everyone together. Hosting step 9.3 already checks this.
- **A wrong `Gateway` line** lets that address skip the flood limiter and, on the certifier, claim any player's address. The docs keep the rule: only addresses of the machine itself.
- **Old exes:** until the new exes are in place, the old limiter still cuts off every browser player at once on a busy server. The hosting guide says not to announce the address before then.

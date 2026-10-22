# Public Launch Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the certifier, the login server and the gateway safe for many browser players who share the gateway's address: the servers' flood limiter skips the gateway, the gateway limits each real address and logs refusals without flooding, and the certifier's wrong-password count is kept per address and account.

**Architecture:**
- Two C++ patches, made in `$SERVER/Source` with a byte-preserving script and saved in `server-patches/`, applied after the existing `certifier-client-addr.patch`:
  - `flood-limiter-gateway.patch`: `CDos2` gets a skip list; the certifier's `Gateway` lines and a new `LoginServer.ini` `Gateway` line fill it.
  - `certifier-lockout.patch`: `CAccountMgr` keeps a map keyed by address and account instead of a 3-entry list.
- A small C++ test program, built with `cl.exe`, tests both patches with stand-in headers and a test clock.
- The gateway gets a total cap, a per-address 60-second window and a throttled refusal log, with two new close codes and lobby texts.

**Tech Stack:** C++ (VS 2022 v143, Win32, MSBuild, `cl.exe`), Node 24, TypeScript (strict), Vitest, `ws` 8.

**Spec:** `docs/superpowers/specs/2026-10-22-public-launch-limits-design.md`. Read it first; this plan argues from it.

**Where work happens:**
- `$WEB`: the FlyffWeb worktree on branch `public-launch-limits` (on this PC `C:/Users/silec/Desktop/FlyFF/Bakbak/FlyffWeb-worktrees/public-launch-limits`). Every commit goes here.
- `$SERVER`: the server folder (`C:/Users/silec/Desktop/FlyFF/Bakbak/Blouflash VS22 V15`), which holds `Source/`, `Output/` and `Program/`. `Source/` isn't tracked by git.
- `$SNAP`: a scratch folder outside both repositories (on this PC, the session's scratchpad), for the snapshot of the original C++ files, the edit script and build output that isn't meant for `Output/`.

## Global Constraints

- **C++ files in `$SERVER/Source` are CP949 with CRLF.**
  - Edit them only with a byte-preserving Node script: read and write as `latin1`, replace exact ASCII anchor strings that occur exactly once (fail otherwise), insert ASCII-only text with `\r\n` line ends, indent with tabs like the code around it.
  - Never re-save them as UTF-8, and never use an editor tool on them.
- **Never write to `$SERVER/Program/`.** Never commit in `$SERVER` (the bakbak-flyff repository). Never switch branches in `$SERVER/FlyffWeb`.
- **Commits:** only in `$WEB`, staging explicit paths. Messages are `type(scope): summary` with scopes `servers`, `gateway`, `protocol`, `client`, `docs`. Every message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Server values (copy exactly):**

| Value | Exact |
|---|---|
| Skip-list size (`MAX_EXEMPT`) | 8 |
| Dotted IPv4 rule | 7 to 15 characters, only digits and dots, exactly 3 dots, `inet_addr` not `INADDR_NONE` |
| Login server error line | `Gateway <address> not added` |
| Short block | 1 or 2 wrong passwords, last one at most 15 s ago (`nSec <= 15`), every language but `LANG_KOR` |
| Long block | 3 or more wrong passwords, last one at most 15 min ago (`nSec <= 15 * 60`) |
| Count forgotten | more than 24 h (`86400` s) after the last wrong password, or on a good login |
| Pairs per thread (`MAX_ACCOUNT_CACHE`) | 20000 |

- **Gateway values (copy exactly):**

| Value | Exact |
|---|---|
| `maxConnections` | 1000 |
| `maxConnectionsPerAddress` | 32 |
| `maxNewConnectionsPerAddressPerMinute` | 60, over a sliding 60000 ms window |
| `TOO_MANY_NEW_CONNECTIONS` | 4008, "Too many connection attempts from your network. Wait a minute and try again." |
| `GATEWAY_FULL` | 4009, "The game is full right now. Try again in a few minutes." |
| Refusal log period | 60000 ms |
| Named pairs per period | 50 |
| First line | `refused <address> <reason>` |
| Repeat line | `refused <address> <reason> x<n> more in the last minute` |
| Overflow line | `refused <n> more connections from other addresses in the last minute` |
| Reasons | `origin` (403), `path` (404), `address` (400), `route` (4003), `per-address` (4007), `rate` (4008), `full` (4009) |
| Unknown address | `unknown` |

- **Tools on this PC:**
  - MSBuild: `/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe`
  - x86 compiler environment: `C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars32.bat`
- **Patch order:** `certifier-client-addr.patch`, then `flood-limiter-gateway.patch`, then `certifier-lockout.patch`.

## Review Focus

1. **Refusals from many addresses in one minute** must not grow memory or the log: past 50 named pairs, refusals only add to one overflow count. Test in Task 5.
2. **A request whose address can't be read at all** (no peer address, or an IPv6 one) is logged as `unknown` and never throws. Test in Task 6 (`shownAddress`).
3. **A relay that fails to start** (the 1011 path) gives back its total and per-address slots, so the cap can't fill up with ghosts. Test in Task 6.
4. **A server that is down** (4001) gives back the total slot each time, so retries get 4001 again and never 4009. Test in Task 6.
5. **Closing the gateway** writes the pending repeat lines and stops the period timer; nothing is logged after that, and the timer never keeps Node running. Tests in Tasks 5 and 6.

---

## File Structure

```
$SERVER/Source/                         (not in git; CP949, CRLF)
  _Network/Misc/Include/dos2.h          modify: skip list
  _Network/Misc/Src/dos2.cpp            modify: skip list
  CERTIFIER/DPCertifier.cpp             modify: AddGateway fills the skip list
  LOGINSERVER/LoginServer.cpp           modify: Gateway lines in LoginServer.ini
  CERTIFIER/AccountMgr.h, AccountMgr.cpp  modify: map per address and account
  CERTIFIER/DBManager.cpp               modify: Check gets the account name

$WEB/
  server-patches/
    flood-limiter-gateway.patch         create
    certifier-lockout.patch             create
    README.md                           modify: two new sections, order
    tests/limits-test.cpp               create: the C++ test program
    tests/stub/stdafx.h                 create: stand-in for the servers' stdafx.h, test clock
    tests/stub/Resource/lang.h          create: stand-in for Resource/lang.h
    tests/run-limits-test.sh            create: copies, builds and runs the test program
  packages/protocol/src/gatewayCloseCodes.ts   modify: 4008, 4009
  apps/gateway/src/config.ts            modify: new limits and defaults
  apps/gateway/src/limits.ts            modify: RateWindow window length, AddressRate
  apps/gateway/src/refusalLog.ts        create: throttled refusal log
  apps/gateway/src/clientAddress.ts     modify: shownAddress
  apps/gateway/src/server.ts            modify: checks, refusal log
  apps/client/src/lobby/errorText.ts    modify: two texts
  apps/client/src/net/PacketChannel.ts  modify: comment, codes 4001-4009
  docs/hosting.md, docs/device-testing.md, README.md   modify
  apps/client/test/lobby.live.test.ts, apps/client/test/live.config.example.json   modify: comments
```

---

### Task 1: C++ test program and the flood limiter's skip list

**Files:**
- Modify: `$SERVER/Source/_Network/Misc/Include/dos2.h`, `$SERVER/Source/_Network/Misc/Src/dos2.cpp`
- Create: `$WEB/server-patches/tests/limits-test.cpp`, `tests/stub/stdafx.h`, `tests/stub/Resource/lang.h`, `tests/run-limits-test.sh`

**Interfaces:**
- Produces:
  - In `dos2.h`: `#define MAX_EXEMPT 8`, and in `class CDos2`:
    - `public: static BOOL AddExempt( const char* lpszAddr );`: adds a dotted IPv4 address (Global Constraints rule) to the skip list. FALSE, nothing added, for a bad address or when 8 are listed.
    - `private: static BOOL IsExempt( u_long addr ); static u_long s_aExempt[MAX_EXEMPT]; static int s_nExempt;`
  - `IsOver` starts with `if( IsExempt( addr ) ) return 0;`.
  - `run-limits-test.sh`:
    - reads `SOURCE` (default: `<script dir>/../../../Source`) and `VCVARS` (default: the Global Constraints path);
    - builds in `${BUILD:-$TEMP/flyffweb-limits-test}`: `src/` gets `stub/stdafx.h`, `limits-test.cpp`, and from `$SOURCE`: `dos2.h`, `dos2.cpp`, `MEMPOOLER.H` (as `mempooler.h`), `CERTIFIER/AccountMgr.h`, `CERTIFIER/AccountMgr.cpp`; `Resource/lang.h` gets `stub/Resource/lang.h` (so `..\Resource\lang.h` from `src/` finds it);
    - writes a `build.bat` that calls `vcvars32.bat` and then `cl /nologo /EHsc /W3 /Fe:limits-test.exe limits-test.cpp dos2.cpp AccountMgr.cpp ws2_32.lib`, runs it with `cmd //c`, then runs `limits-test.exe`, and exits with its code.
  - `stub/stdafx.h`:
    - includes `<winsock2.h>`, `<windows.h>`, `<assert.h>`, `<ctime>`, `<list>`, `<map>`, `<string>`, `using namespace std;`
    - defines `ASSERT(x)`, `SAFE_DELETE(p)`, `safe_delete(p)`, `MIN(x)`, `SEC(x)` as in `Source/_Common` (`MIN(x)` is `(1000*60*((int)x))`), and `inline void Error( const char*, ... ) {}`
    - declares `DWORD TestTickCount( void ); time_t TestTime( void );`
    - defines a stand-in `class CTimer` with `Set( float fInterval, BOOL = FALSE )`, `Reset()` and `BOOL IsTimeOut()`, all on `TestTickCount()`
    - only then: `#define GetTickCount TestTickCount` and `#define time( p ) TestTime()`
  - `stub/Resource/lang.h`: `#define LANG_KOR 0`, `int GetLanguage( void );`
  - `limits-test.cpp`:
    - globals `DWORD g_dwTestTick; time_t g_tTestTime; int g_nTestLanguage = 1;` and the three functions on them;
    - a `CHECK( cond, name )` macro that prints `FAIL <name> (line <n>)` and counts failures;
    - `main` runs every test function and prints `PASS` and returns 0 only when nothing failed.

- [ ] **Step 1: Snapshot the files both patches change, and the ones the first patch changed**

Copy these 12 files from `$SERVER/Source/<f>` to `$SNAP/orig/Source/<f>`, keeping the folders: `_Network/MsgHdr.h`, `_Network/Misc/Include/dos2.h`, `_Network/Misc/Src/dos2.cpp`, `CERTIFIER/user.h`, `CERTIFIER/user.cpp`, `CERTIFIER/DPCertifier.h`, `CERTIFIER/DPCertifier.cpp`, `CERTIFIER/DBManager.cpp`, `CERTIFIER/certifier.cpp`, `CERTIFIER/AccountMgr.h`, `CERTIFIER/AccountMgr.cpp`, `LOGINSERVER/LoginServer.cpp`.

Check: `git apply -R --check -p1 "$WEB/server-patches/certifier-client-addr.patch"`, run from `$SNAP/orig`. Expected: exit 0, which proves the snapshot is the state after the first patch.

- [ ] **Step 2: Write the byte-preserving edit script**

Write `$SNAP/edit-bytes.mjs` as the Global Constraints describe. Interface: `node edit-bytes.mjs <file> <edits.json>`, where `edits.json` is `[{ "find": "...", "replace": "..." }]` written with `\n`. The script turns `\n` into `\r\n` in both strings and fails, changing nothing, when any `find` doesn't occur exactly once. Check it on a copy: one edit applied to a copy of `dos2.cpp` changes only that line (`cmp -l` lists only the new bytes).

- [ ] **Step 3: Write the test program, the stubs and the script, with the flood limiter tests**

`limits-test.cpp` flood limiter tests (the address constants are `inet_addr("127.0.0.1")` and `inet_addr("203.0.113.5")`):

```cpp
static void TestExemptAddressIsNeverRefused()
{
	CHECK( CDos2::AddExempt( "127.0.0.1" ) == TRUE, "AddExempt 127.0.0.1" );
	CDos2 dos;
	int nNotZero = 0;
	for( int i = 0; i < 1000; i++ )		// 1,000 connections, 0 ms apart
		if( dos.IsOver( LOOPBACK ) != 0 ) nNotZero++;
	CHECK( nNotZero == 0, "a listed address is never refused" );
}

static void TestUnlistedAddressIsBlockedAsToday()
{
	CDos2 dos;
	for( int i = 1; i <= 50; i++ )
		CHECK( dos.IsOver( OTHER ) == 0, "connections 1-50 pass" );
	CHECK( dos.IsOver( OTHER ) == -1, "the 51st shuts the address down" );
	CHECK( dos.IsOver( OTHER ) == 1, "later ones are closed" );
	g_dwTestTick += MIN( 10 ) + 1;		// the 10-minute release timer fires
	CHECK( dos.IsOver( OTHER ) == 0, "released after the timer" );
}

static void TestAddExemptRefusesBadAddresses()
{
	const char* bad[] = { "", "127.0.0", "127.0.0.1.5", "1.2.3.a", " 127.0.0.1", "127.0.0.1x", "256.1.1.1", "255.255.255.255", "1234567890123456" };
	for( int i = 0; i < sizeof(bad) / sizeof(bad[0]); i++ )
		CHECK( CDos2::AddExempt( bad[i] ) == FALSE, bad[i] );
	// 127.0.0.1 is already listed; 7 more fill the list, the ninth is refused.
	char sz[16];
	for( int i = 1; i <= 7; i++ ) { wsprintf( sz, "10.0.0.%d", i ); CHECK( CDos2::AddExempt( sz ) == TRUE, sz ); }
	CHECK( CDos2::AddExempt( "10.0.0.8" ) == FALSE, "a ninth address" );
	CDos2 dos;		// and a refused address is counted like any other
	for( int i = 1; i <= 50; i++ ) dos.IsOver( inet_addr( "10.0.0.8" ) );
	CHECK( dos.IsOver( inet_addr( "10.0.0.8" ) ) == -1, "a refused address is not skipped" );
}
```

`main` runs them in this order (the skip list is static, so `TestAddExemptRefusesBadAddresses` comes last).

- [ ] **Step 4: Run it and check it fails**

Run: `SOURCE="$SERVER/Source" BUILD="$SNAP/limits-test" bash "$WEB/server-patches/tests/run-limits-test.sh"`
Expected: the compiler fails with `'AddExempt': is not a member of 'CDos2'`.

- [ ] **Step 5: Add the skip list to `dos2.h` and `dos2.cpp` with the edit script**

Anchors:
- `dos2.h`: the `#define	MAX_HIT		50` line (add `MAX_EXEMPT` after it); `	int		IsOver( u_long addr );` (add `AddExempt` after it); `	void	Release( void );` (add the private statics and `IsExempt` after it).
- `dos2.cpp`: the `#include "dos2.h"` line (define `s_aExempt` and `s_nExempt` after it, then the dotted IPv4 check, `AddExempt` and `IsExempt`); `int CDos2::IsOver( u_long addr )\n{\n` (insert the `IsExempt` line after it).

Comment `AddExempt` in one line: "the addresses of WebSocket gateways (ini 'Gateway' lines): never counted, never refused."

- [ ] **Step 6: Run the test program**

Run: the Step 4 command.
Expected: `PASS`, exit 0.

- [ ] **Step 7: Commit (FlyffWeb only)**

```bash
git add server-patches/tests
git commit -m "test(servers): C++ test program for the flood limiter's gateway skip list"
```

---

### Task 2: Wrong-password count per address and account

**Files:**
- Modify: `$SERVER/Source/CERTIFIER/AccountMgr.h`, `AccountMgr.cpp`, `DBManager.cpp`
- Test: `$WEB/server-patches/tests/limits-test.cpp`

**Interfaces:**
- Consumes: the test program from Task 1 (`g_tTestTime`, `g_nTestLanguage`, `CHECK`).
- Produces in `AccountMgr.h`:
  - `struct ACCOUNT_CACHE { int m_nError; time_t m_tmError; };` (`m_dwIP` is gone; the key holds it)
  - `typedef pair< DWORD, string > ACCOUNT_KEY;`
  - `const int MAX_ACCOUNT_CACHE = 20000;` and `const long ACCOUNT_CACHE_KEEP = 24 * 60 * 60;`
  - `class CAccountMgr`:
    - `public: ACCOUNT_CHECK Check( DWORD dwIP, const char* lpszAccount ); void SetError( int nError );`
    - `private: map< ACCOUNT_KEY, ACCOUNT_CACHE > m_cache; ACCOUNT_KEY m_lastKey; void MakeRoom( time_t tmCur );`
  - `AccountMgr.h` includes `<map>` and `<string>`.
- Rules (spec section 3.2):
  - `Check` remembers its pair in `m_lastKey`. It forgets the pair first when its last wrong password is more than `ACCOUNT_CACHE_KEEP` seconds old. Then it applies the short and long block rules from Global Constraints. It never adds a pair.
  - `SetError( n > 0 )` adds 1 to the pair of the last `Check` and records `time( NULL )`. When the pair is new and the map holds `MAX_ACCOUNT_CACHE` pairs, it calls `MakeRoom` first.
  - `MakeRoom` removes every pair older than `ACCOUNT_CACHE_KEEP`. If none was old, it removes the pair with the oldest `m_tmError`.
  - `SetError( 0 )` erases the pair.
- `DBManager.cpp`: the three `Check` calls get the account name:
  - `accountMgr.Check( pData->dwIP, pData->AccountInfo.szAccount )`
  - `mgr.Check( pov->dwIP, pov->AccountInfo.szAccount )`, twice

- [ ] **Step 1: Write the failing lockout tests**

Add these to `limits-test.cpp`, each starting from `g_tTestTime = 1000000` and a fresh `CAccountMgr mgr;` (`A`, `B` are two addresses; `"acc1"`, `"acc2"` two accounts). The helper `Wrong( mgr, ip, acc )` is `mgr.Check( ip, acc ); mgr.SetError( 1 );`:

- `TestOneWrongBlocksOnlyThatPair`:
  - after `Wrong( A, "acc1" )` and +10 s: `Check( A, "acc1" ) == CHECK_1TIMES_ERROR`, `Check( B, "acc1" ) == CHECK_OK`, `Check( A, "acc2" ) == CHECK_OK`;
  - at +16 s: `Check( A, "acc1" ) == CHECK_OK`.
- `TestThreeWrongBlockFifteenMinutesAndAgain`:
  - `Wrong` at t, t+16, t+32;
  - at t+33: `CHECK_3TIMES_ERROR`; at t+32+900: `CHECK_3TIMES_ERROR`; at t+32+901: `CHECK_OK`;
  - then `SetError( 1 )`; `Check` at the same time: `CHECK_3TIMES_ERROR`.
- `TestGoodLoginClears`:
  - 3 wrong, then at +901 s after the last one: `Check` is `CHECK_OK`;
  - `SetError( 0 )`; then `Wrong` once; `Check`: `CHECK_1TIMES_ERROR`, not `CHECK_3TIMES_ERROR`.
- `TestForgottenAfterOneDay`:
  - 3 wrong for `(A, "acc1")` at t, and 3 wrong for `(B, "acc1")` at t;
  - at t+86400, `Wrong( A, "acc1" )`, then `Check`: `CHECK_3TIMES_ERROR` (still kept);
  - at t+86401, `Wrong( B, "acc1" )`, then `Check`: `CHECK_1TIMES_ERROR` (forgotten, started over).
- `TestKoreanHasNoShortBlock`: with `g_nTestLanguage = 0`, after `Wrong( A, "acc1" )`: `Check == CHECK_OK`. Set `g_nTestLanguage = 1` again.
- `TestFullMapDropsTheOldestFirst`:
  - 3 wrong for `(A, "first")` at t and for `(A, "second")` at t+1;
  - then one `Wrong` at t+2 for each of 19,998 accounts `"n<i>"`: the map is full;
  - at t+60, `Wrong( A, "new" )`;
  - then `Check( A, "first" ) == CHECK_OK` (dropped) and `Check( A, "second" ) == CHECK_3TIMES_ERROR` (kept).
- `TestFullMapDropsExpiredPairsFirst`:
  - fill as above, and give `(A, "late")` 3 wrong at t+3600;
  - at t+86400+3, `Wrong( A, "new" )`;
  - then `Check( A, "late" )` is `CHECK_OK` (its block is long over), and one more `SetError( 1 )` right after it makes the next `Check` `CHECK_3TIMES_ERROR`: the count was kept while the expired pairs were dropped.

- [ ] **Step 2: Run them and check they fail**

Run: the Task 1 Step 4 command.
Expected: the compiler fails on `Check`: it takes 2 arguments only after the change.

- [ ] **Step 3: Change `AccountMgr.h`, `AccountMgr.cpp` and the three calls in `DBManager.cpp` with the edit script**

Replace the struct, the class and the bodies of `Check` and `SetError` as in the Interfaces. Leave the destructor empty: the map frees itself. Leave the commented-out `main` at the end of `AccountMgr.cpp` as it is.

- [ ] **Step 4: Run the test program and check the call sites**

Run: the Task 1 Step 4 command.
Expected: `PASS`.

Run: `grep -c "Check( p[a-zA-Z]*->dwIP, p[a-zA-Z]*->AccountInfo.szAccount )" "$SERVER/Source/CERTIFIER/DBManager.cpp"`
Expected: `3`.

- [ ] **Step 5: Commit (FlyffWeb only)**

```bash
git add server-patches/tests/limits-test.cpp
git commit -m "test(servers): wrong-password count per address and account, kept a day"
```

---

### Task 3: Server hooks, builds, patch files and their README

**Files:**
- Modify: `$SERVER/Source/CERTIFIER/DPCertifier.cpp`, `$SERVER/Source/LOGINSERVER/LoginServer.cpp`
- Create: `$WEB/server-patches/flood-limiter-gateway.patch`, `certifier-lockout.patch`
- Modify: `$WEB/server-patches/README.md`

**Interfaces:**
- Consumes: `CDos2::AddExempt` (Task 1), the changed `CAccountMgr` (Task 2).
- Produces:
  - `DPCertifier.cpp`: `#include "dos2.h"` inside `#ifdef __DOS1101` after `#include "user.h"`. In `AddGateway`, after `m_nGateway++;`: `CDos2::AddExempt( lpszAddr );` inside `#ifdef __DOS1101`. It is only reached for an address `AddGateway` accepted.
  - `LoginServer.cpp`:
    - `#include "dos2.h"` inside `#ifdef __DOS1101` after `#include "user.h"`;
    - in `Script`, before `else if( s.Token == "NPROTECT" )`, inside `#ifdef __DOS1101`: `else if( s.Token == "Gateway" ) { s.GetToken(); if( !CDos2::AddExempt( s.Token ) ) Error( "Gateway %s not added", (LPCTSTR)s.Token ); }`.

- [ ] **Step 1: Make the two hooks with the edit script**

Anchors:
- `DPCertifier.cpp`: `#include "user.h"\n` (the first one, near the top) and `	lstrcpy( m_aszGateway[m_nGateway], lpszAddr );\n	m_nGateway++;\n`.
- `LoginServer.cpp`: `#include "user.h"\n` and `			else if( s.Token == "NPROTECT" )\n`.

Check: `grep -c "CDos2::AddExempt" "$SERVER/Source/CERTIFIER/DPCertifier.cpp" "$SERVER/Source/LOGINSERVER/LoginServer.cpp"`. Expected: 1 each.

- [ ] **Step 2: Note the exes before building**

Run: `ls -l --time-style=long-iso "$SERVER"/Program/*.exe "$SERVER"/Output/*/Release/*.exe > "$SNAP/exes-before.txt"`
Keep this for Step 4 and for the README facts. Before this rebuild, `Program/5. Login.exe` and `Output/LoginServer/Release/LoginServer.exe` were both 3,380,224 bytes, dated 2026-06-09 18:55.

- [ ] **Step 3: Build**

Run, one after the other, in the background (each takes minutes):
```bash
MSB="/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe"
"$MSB" "$SERVER/Source/CERTIFIER/Certifier.vcxproj" -p:Configuration=Release -p:Platform=Win32 -m
"$MSB" "$SERVER/Source/LOGINSERVER/LoginServer.vcxproj" -p:Configuration=Release -p:Platform=Win32 -m
"$MSB" "$SERVER/Source/CACHESERVER/CacheServer.vcxproj" -p:Configuration=Release -p:Platform=Win32 -m "-p:OutDir=<$SNAP as a Windows path>\cache-build\\" "-p:IntDir=<$SNAP as a Windows path>\cache-build\obj\\"
```
Expected: each ends with `Build succeeded.` and `0 Error(s)`. The cache server's exe lands in `$SNAP`, so `Output/CacheServer` keeps the exe that matches `Program/6. Cache.exe`. Report any error that isn't caused by our edits; don't fix unrelated build problems.

- [ ] **Step 4: Check what the builds wrote**

Run: `ls -l --time-style=long-iso "$SERVER"/Program/*.exe "$SERVER"/Output/*/Release/*.exe` and compare with `$SNAP/exes-before.txt`.
Expected: only `Output/Certifier/Release/Certifier.exe` and `Output/LoginServer/Release/LoginServer.exe` have a new time. Every `Program/` line is unchanged.

- [ ] **Step 5: Write the two patch files**

For each file, run `diff -u --label a/Source/<f> --label b/Source/<f> "$SNAP/orig/Source/<f>" "$SERVER/Source/<f>"` and concatenate, in this order:
- `flood-limiter-gateway.patch`: `_Network/Misc/Include/dos2.h`, `_Network/Misc/Src/dos2.cpp`, `CERTIFIER/DPCertifier.cpp`, `LOGINSERVER/LoginServer.cpp`
- `certifier-lockout.patch`: `CERTIFIER/AccountMgr.h`, `CERTIFIER/AccountMgr.cpp`, `CERTIFIER/DBManager.cpp`

- [ ] **Step 6: Check the whole chain from the original files**

1. Copy `$SNAP/orig/Source` to `$SNAP/chain/Source`.
2. From `$SNAP/chain`, run `git apply -R -p1` with `certifier-client-addr.patch`: that gives the original files.
3. Run `git apply -p1` with the three patches, in the Global Constraints order.
4. Run `cmp` for each of the 12 files against `$SERVER/Source/<f>`.

Expected: every `git apply` exits 0, and `cmp` prints nothing.

- [ ] **Step 7: Write the README sections**

In `server-patches/README.md`, in the existing style (Why, What it changes, Apply it, Build it, Put it in service, Undo):
- **Change the opening line.** It now says there are three patches, and gives the order they must be applied in.
- **`flood-limiter-gateway.patch`:**
  - Why: the limiter rule and the shared address (spec section 2).
  - What it changes, including:
    - the `LoginServer.ini` line `Gateway "127.0.0.1"` and its error line;
    - that the certifier's existing `Gateway` lines now also skip the limiter;
    - the same "only addresses of this machine" warning the certifier section gives.
- **`certifier-lockout.patch`:** the per address and account rule, the 15 s, 15 min and 24 h numbers, the 20,000 cap. Say plainly that one address can try 3 passwords on every account; the owner chose this.
- **Build:** both MSBuild commands. The new `Output/Certifier/Release/Certifier.exe` now includes all three certifier changes, so one swap covers them.
- **Put the login server in service:**
  - The Step 2 fact: before this rebuild, `Program\5. Login.exe` matched `Output\LoginServer\Release\LoginServer.exe` (3,380,224 bytes, 9 June 2026), so it was built from this `Source\`.
  - Stop it; back up `Program\5. Login.exe` as `Program\5. Login.exe.before-gateway`; copy the new exe over it, keeping the name.
  - Add `Gateway "127.0.0.1"` on a new line at the end of `Program\LoginServer.ini`, pressing Enter after the last line first.
  - Start it, and confirm Neuz still logs in and reaches the character list.
  - Then check the error log: there must be no `Gateway … not added` line.
- **Undo:** for each exe.

- [ ] **Step 8: Commit (FlyffWeb only)**

```bash
git add server-patches/flood-limiter-gateway.patch server-patches/certifier-lockout.patch server-patches/README.md
git commit -m "feat(servers): flood limiter skips the gateway, lockout per address and account (patches + notes)"
```

---

### Task 4: New limits, close codes and lobby texts

**Files:**
- Modify: `packages/protocol/src/gatewayCloseCodes.ts`, `apps/gateway/src/config.ts`, `apps/gateway/src/limits.ts`, `apps/client/src/lobby/errorText.ts`, `apps/client/src/net/PacketChannel.ts` (comment: the gateway's own codes are 4001-4009)
- Test: `packages/protocol/test/gatewayCloseCodes.test.ts`, `apps/gateway/test/config.test.ts`, `apps/gateway/test/limits.test.ts`, `apps/client/test/errorText.test.ts`

**Interfaces:**
- Produces:
  - `CloseCode.TOO_MANY_NEW_CONNECTIONS = 4008`, `CloseCode.GATEWAY_FULL = 4009`, each with a one-line doc comment like the others.
  - `Limits` gains `maxConnections: number` and `maxNewConnectionsPerAddressPerMinute: number`. `DEFAULT_LIMITS` holds the Global Constraints values, and `maxConnectionsPerAddress` becomes 32.
  - `RateWindow`:
    - `constructor(maxPerWindow: number, now = () => performance.now(), windowMs = 1000)`; existing callers are unchanged.
    - `isIdle(): boolean`: true when no recorded call is still inside the window.
  - `class AddressRate`:
    - `constructor(maxPerWindow: number, windowMs: number, now?: () => number)`
    - `allow(address: string): boolean`: one `RateWindow` per address.
    - `get size(): number`: how many addresses it remembers.
    - Sweep: at most once per `windowMs`, at the start of `allow`, it deletes every address whose window `isIdle()`.

- [ ] **Step 1: Write the failing tests**

- **`gatewayCloseCodes.test.ts`:** the expected object gains `TOO_MANY_NEW_CONNECTIONS: 4008, GATEWAY_FULL: 4009`.
- **`config.test.ts`:**
  - the defaults test expects `maxConnections: 1000`, `maxConnectionsPerAddress: 32`, `maxNewConnectionsPerAddressPerMinute: 60`;
  - a new test: `parseConfig` with `limits: { maxConnections: 5, maxNewConnectionsPerAddressPerMinute: 2 }` keeps them;
  - `limits: { maxConnections: 0 }` throws `limits.maxConnections must be a whole number from 1 to 9007199254740991`.
- **`errorText.test.ts`:** `closeText(4008)` and `closeText(4009)` are the Global Constraints texts.
- **`limits.test.ts`:**
  - `RateWindow(2, () => now, 60000)` allows 2 at t=0, refuses at t=59999, allows at t=60000.
  - `RateWindow.isIdle()` is true before any call, false at t=0 after one, false at t=59999, and true at t=60000.
  - `AddressRate(2, 60000, () => now)` allows 2 for `'a'` and refuses the third, while `'b'` is still allowed. A refused call doesn't push back the next allowed one, as for `RateWindow`.
  - `AddressRate` forgets idle addresses:
    - `allow('a')` at 0 and `allow('b')` at 30000 give `size` 2;
    - `allow('c')` at 60000 gives `size` 2 (`'a'` swept, `'b'` and `'c'` kept);
    - `allow('d')` at 90000 gives `size` 3 (no sweep within 60000 ms of the last);
    - `allow('e')` at 120000 gives `size` 3 (`'b'` swept, while `'c'`, `'d'` and `'e'` stay).

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run packages/protocol/test/gatewayCloseCodes.test.ts apps/gateway/test/config.test.ts apps/gateway/test/limits.test.ts apps/client/test/errorText.test.ts`
Expected: FAIL (missing codes, defaults, `AddressRate`).

- [ ] **Step 3: Implement the codes, limits, `RateWindow` change, `AddressRate` and texts**

- [ ] **Step 4: Run the tests**

Run: the Step 2 command, then `npm run typecheck`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/gatewayCloseCodes.ts packages/protocol/test/gatewayCloseCodes.test.ts apps/gateway/src/config.ts apps/gateway/src/limits.ts apps/gateway/test/config.test.ts apps/gateway/test/limits.test.ts apps/client/src/lobby/errorText.ts apps/client/src/net/PacketChannel.ts apps/client/test/errorText.test.ts
git commit -m "feat(gateway): total cap, new connections per address per minute, close codes 4008 and 4009"
```

---

### Task 5: Throttled refusal log

**Files:**
- Create: `apps/gateway/src/refusalLog.ts`
- Test: `apps/gateway/test/refusalLog.test.ts`

**Interfaces:**
- Consumes: `Logger` from `apps/gateway/src/log.ts`.
- Produces:
  - `type RefusalReason = 'origin' | 'path' | 'address' | 'route' | 'per-address' | 'rate' | 'full'`
  - `class RefusalLog`:
    - `constructor(log: Logger, options?: { periodMs?: number; maxNamed?: number })`, with defaults 60000 and 50. It starts a `setInterval(flush, periodMs)` and calls `unref()` on it.
    - `refused(address: string, reason: RefusalReason): void`:
      - writes the first line at once when the pair is new in this period and fewer than `maxNamed` pairs are named;
      - otherwise counts a repeat for a named pair, or adds to the overflow;
      - does nothing after `close()`.
    - `flush(): void`: writes the repeat lines (in the order the pairs were first refused), then the overflow line, and starts a new period.
    - `close(): void`: `flush()`, then `clearInterval`. Calling it twice is safe.
  - Only named pairs are stored; overflow refusals are a single number.

- [ ] **Step 1: Write the failing tests** (with `vi.useFakeTimers()`, and a logger that pushes lines)

- `writes the first refusal of a pair at once`:
  - `refused('203.0.113.5', 'rate')` gives the lines `['refused 203.0.113.5 rate']`;
  - a second `refused` for the same pair adds no line;
  - a different reason or address does add a line.
- `writes one repeat line per pair when the period ends`:
  - 3 refusals of `('1.2.3.4', 'origin')`, then `vi.advanceTimersByTime(60000)`;
  - the last line is `refused 1.2.3.4 origin x2 more in the last minute`.
- `starts over in the next period`: after the period ends, `refused('1.2.3.4', 'origin')` writes `refused 1.2.3.4 origin` again.
- `writes nothing for a quiet period`: advancing 180000 ms with no refusals adds no line.
- `names at most maxNamed pairs and sums the rest` (Review Focus 1):
  - with `maxNamed: 2`: refusals for addresses `a`, `b`, `c`, `c`, `d` (reason `full`) write 2 first lines;
  - when the period ends, the lines are `refused 3 more connections from other addresses in the last minute` (and no repeat lines, since `a` and `b` had none);
  - after the end, `refused('c', 'full')` is written at once.
- `close writes what is pending, then nothing more` (Review Focus 5):
  - 2 refusals of one pair, then `close()`: the last line is the `x1 more` line;
  - a later `refused` and `vi.advanceTimersByTime(60000)` add nothing;
  - `close()` again adds nothing.
- `does not keep Node running`: spy on `setInterval` and check that the returned timer's `hasRef()` is false.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run apps/gateway/test/refusalLog.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `RefusalLog`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run apps/gateway/test/refusalLog.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/refusalLog.ts apps/gateway/test/refusalLog.test.ts
git commit -m "feat(gateway): refusal log with one line per address and reason a minute"
```

---

### Task 6: Gateway server: the new checks and the refusal log

**Files:**
- Modify: `apps/gateway/src/server.ts`, `apps/gateway/src/clientAddress.ts`
- Test: `apps/gateway/test/server.test.ts`, `apps/gateway/test/clientAddress.test.ts`

**Interfaces:**
- Consumes: `AddressRate`, `AddressCounter`, the new limits and codes (Task 4); `RefusalLog` (Task 5).
- Produces:
  - `shownAddress(resolved: string | undefined, remote: string | undefined): string` in `clientAddress.ts`. It returns `resolved`, else `normalizeIPv4(remote)`, else `'unknown'`.
  - `startGateway` behaviour:
    - **On upgrade:** resolve the address first. A 403 is logged with reason `origin`, a 404 with `path` and a 400 with `address`, each with `shownAddress(address, request.socket.remoteAddress)`.
    - **On connection, in order:** route (4003, `route`); `open >= maxConnections` (4009, `full`); `counter.acquire` (4007, `per-address`); `rate.allow` (4008, `rate`, which first releases the per-address slot). Only then `open++`.
    - **Giving slots back:** `open--` and `counter.release` when the relay ends, and also on the 1011 path.
    - **`close()`:** calls `refusals.close()` after every relay is done.
    - The `close … up=0 down=0` lines for 4003 and 4007 are gone. The doc comment of `startGateway` describes the new checks and log lines.

- [ ] **Step 1: Update the existing tests and write the failing new ones**

**Existing tests to update** (in `server.test.ts`):
- The 403, 404 and 400 tests expect `['refused 127.0.0.1 origin']`, `['refused 127.0.0.1 path']` and `['refused 127.0.0.1 address']` instead of `[]`.
- The 4003 tests expect `['refused 127.0.0.1 route']`.
- The "logs a route … as it was asked for" test becomes "never writes the route a browser asked for": no line contains `Some-Host`.
- The 4007 test expects `refused 127.0.0.1 per-address` in place of its `close … code=4007` line.

**New tests:**
- `closes with 4009 at maxConnections, before any per-address check`: with `maxConnections: 2, maxConnectionsPerAddress: 1` and `trustedProxies: ['127.0.0.1']`:
  - browsers from `X-Forwarded-For` `10.0.0.1` and `10.0.0.2` open;
  - a third from `10.0.0.1` closes with 4009, not 4007;
  - `t.fake.connections` is 2, and the logs hold `refused 10.0.0.1 full`.
- `closes with 4008 over maxNewConnectionsPerAddressPerMinute, per address`: with the limit set to 2 and trusted forwarding:
  - two browsers from `10.0.0.1` open and close (wait for their close lines);
  - a third from `10.0.0.1` closes with 4008, while one from `10.0.0.2` opens;
  - the logs hold `refused 10.0.0.1 rate`, and `t.fake.connections` is 3.
- `does not count a connection refused with 4007 against the per-minute limit`: with `maxConnectionsPerAddress: 1` and a per-minute limit of 2:
  - open one browser; a second gets 4007;
  - close the first and wait for its close line;
  - a third opens.
- `gives the total slot back when a relay ends, and when the server is down` (Review Focus 4): with `maxConnections: 1`:
  - open and close a browser, then a second one opens;
  - in a second setup, the login route points at a closed port (add `loginPort` to `SetupOptions`, default `fake.port`; get a closed port by listening on port 0 with `net.createServer()` and closing it again): two browsers in a row each close with 4001, and neither gets 4009.
- `gives the slots back when the relay cannot start` (Review Focus 3): extend the existing 1011 test with `maxConnections: 1, maxConnectionsPerAddress: 1`; after the 1011, the next browser opens.
- `writes the repeat lines when the gateway closes` (Review Focus 5):
  - two upgrades with `Origin: http://evil.test` give `['refused 127.0.0.1 origin']`;
  - after `t.gateway.close()`, the logs end with `refused 127.0.0.1 origin x1 more in the last minute`;
  - no line contains `evil`.
- `never writes the path a browser asked for`: an upgrade to `/nope-SECRET` gets 404, and no line contains `SECRET`.

**`clientAddress.test.ts`** (Review Focus 2):
- `shownAddress('10.0.0.7', '127.0.0.1')` is `'10.0.0.7'`;
- `shownAddress(undefined, '::ffff:127.0.0.1')` is `'127.0.0.1'`;
- `shownAddress(undefined, '::1')` is `'unknown'`;
- `shownAddress(undefined, undefined)` is `'unknown'`.

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run apps/gateway`
Expected: FAIL in `server.test.ts` and `clientAddress.test.ts`.

- [ ] **Step 3: Implement `shownAddress` and the `server.ts` changes**

- [ ] **Step 4: Run all tests and the typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS: every test file passes; the 7 skipped tests stay skipped.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/server.ts apps/gateway/src/clientAddress.ts apps/gateway/test/server.test.ts apps/gateway/test/clientAddress.test.ts
git commit -m "feat(gateway): check the total and per-minute limits, log every refusal through the refusal log"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/hosting.md`, `docs/device-testing.md`, `README.md`, `apps/client/test/lobby.live.test.ts` (comment lines 7-16 only), `apps/client/test/live.config.example.json` (`_comment` only)

**Interfaces:**
- Consumes: the facts and numbers in Global Constraints and in `server-patches/README.md` (Task 3).

- [ ] **Step 1: `docs/hosting.md`**

- **Step 4:**
  - Its title becomes "The certifier and the login server".
  - The certifier exe now holds three changes.
  - Add the login server's swap and its `Gateway "127.0.0.1"` line in `Program\LoginServer.ini` (press Enter after the last line first).
  - Both point to `server-patches/README.md`.
  - **Success check:** two phones log in one after the other at once. Neither the certifier's nor the login server's error log shows `GATEWAY_CLIENT_ADDR refused` or `Gateway … not added`.
- **Step 6:** the log paragraph adds the `refused <address> <reason>` lines, the repeat and overflow lines, and the seven reasons with a few words each.
- **"Known limit before a public launch"** becomes "Before a public launch" (fix both links to it). It covers:
  - what is fixed (each of the three problems, one line);
  - when the address may be announced: the new exes and both `Gateway` lines are in place, and step 9 passes;
  - what is still not covered: a flood from thousands of addresses, which needs an outside service such as Cloudflare in front of the machine; and that everyone behind one shared address shares the 32 open and 60 new-per-minute connections;
  - what the old exes still do, in one sentence, for the time before the swap.
- **"Two smaller limits":**
  - It now lists the three gateway limits with their config names and messages.
  - The lockout is per address and account, including the risk the owner accepted, in one sentence.
- **Troubleshooting:**
  - rows for the 4008 and 4009 messages;
  - the "Too many connections" row says 32;
  - the "Everyone disconnected at once" row says it only happens with the old exes or without the `Gateway` line in `LoginServer.ini`;
  - a row for `Gateway … not added` in the login server's error log.

- [ ] **Step 2: The smaller docs**

- `README.md`:
  - line 5 and the `server-patches` row now speak of three patches;
  - the `npm run test:live` row says the limiter applies until the new exes and `Gateway` lines are in place.
- `docs/device-testing.md`: lines 161 and 261, the same way.
- `lobby.live.test.ts` comment and `live.config.example.json` `_comment`:
  - (1) the lockout is per address and account;
  - (2) the limiter counts this PC's connections only until the new exes and `Gateway` lines are in place, so the 300 ms spacing stays.
  - The code stays as it is.

- [ ] **Step 3: Check the docs against the code**

Run: `grep -n "maxConnectionsPerAddress\|4008\|4009\|refused" docs/hosting.md`
Expected: the numbers match `DEFAULT_LIMITS` and `CloseCode`, and the line formats match Global Constraints.

Run: `npm test`
Expected: PASS. This also checks that the `live.config.example.json` change didn't break any test that reads it.

- [ ] **Step 4: Commit**

```bash
git add docs/hosting.md docs/device-testing.md README.md apps/client/test/lobby.live.test.ts apps/client/test/live.config.example.json
git commit -m "docs: public launch limits in the hosting guide, README, device checklist and live test notes"
```

---

### Task 8: Final check

- [ ] **Step 1: Everything passes once more, from clean state**

Run: `SOURCE="$SERVER/Source" BUILD="$SNAP/limits-test-final" bash server-patches/tests/run-limits-test.sh && npm test && npm run typecheck`
Expected: `PASS`, then every test file passes, then no type errors.

- [ ] **Step 2: Nothing outside the plan changed**

Run: `git -C "$SERVER" status --short`
Expected: the same lines as at the start of the work. The owner's own changes are still there, nothing new appears (`Source/` and `Output/` are ignored), and no `Program/` exe changed beyond what was already listed.

Run: `git -C "$SERVER/FlyffWeb" status --short --branch`
Expected: `## piece2-gateway`, clean.

Run: `git -C "$WEB" status --short`
Expected: clean.

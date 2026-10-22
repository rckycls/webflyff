# Server patches

The server source (`Source\`) isn't kept in git, so changes FlyffWeb needs in the C++ servers are saved here as patch files. You can re-apply them to a fresh copy of `Source\` at any time.

There are four. Apply them **in this order**, because the second one builds on the first:

| # | Patch | Servers it changes | In short |
| --- | --- | --- | --- |
| 1 | `certifier-client-addr.patch` | certifier | The certifier sees each browser player's real address. |
| 2 | `flood-limiter-gateway.patch` | certifier, login server | The servers' connection-flood limiter no longer counts the gateway. |
| 3 | `certifier-lockout.patch` | certifier | The wrong-password count is kept per address and account, and isn't forgotten. |
| 4 | `world-snapshot-index.patch` | world server | The world server adds a table of contents to the packets it bundles messages in, so the browser can skip the messages it doesn't read. |

**On this PC all four are already applied in `Source\`.** The steps for applying them are only for a fresh copy of `Source\`.

## 1. certifier-client-addr.patch: the certifier sees each browser player's real address

### Why

Browser players don't connect to the certifier directly. They go through the FlyffWeb gateway, so the certifier sees every browser player at the gateway's address (for example `127.0.0.1`). Without this change, that causes two problems:

- **Lockout.** After a wrong password, the certifier blocks the address for 15 seconds, or 15 minutes after three wrong passwords. One player's typo would block every browser player.
- **IP bans.** The account server checks the address against `IPCut.ini`. Banning one browser player's address would do nothing, and banning the gateway's address would ban everyone.

### What it changes

- The gateway sends the player's real address as the first packet on each certifier connection.
- The certifier accepts that packet only when all three of these hold:
  - it comes from an address listed with `Gateway` in `Certifier.ini`;
  - it arrives before the login packet (CERTIFY) on that connection;
  - it's a valid IPv4 address.
- Anything else is ignored and logged as `GATEWAY_CLIENT_ADDR refused from <address>`. The log is a file named like `error_20261022.txt` in the certifier's folder.
- The address is kept until that connection closes. The password lockout, the `IPCut.ini` check and the login database call all use it. When no address was sent, they use the connection's own address, as before.
- **Neuz players aren't affected.** Neuz never sends this packet, so they keep using their connection's address.
- **With no `Gateway` line, the feature is off.** No address is ever accepted, and logins work as before. There's one small difference from the old exe: if a `0xE0` packet arrives anyway, the new exe writes a `GATEWAY_CLIENT_ADDR refused from <address>` line to the error log. The old exe ignored it without a log line.
- **The old certifier ignores the packet,** so the gateway works with either exe. Browser players just share one address until the new exe is in place.

Files changed: `Source\_Network\MsgHdr.h` (one new packet number, `0xE0`), and `user.h`, `user.cpp`, `DPCertifier.h`, `DPCertifier.cpp`, `DBManager.cpp` and `certifier.cpp` in `Source\CERTIFIER\`.

## 2. flood-limiter-gateway.patch: the flood limiter doesn't count the gateway

### Why

The certifier and the login server have a built-in connection-flood limiter. It counts the connections from **one address** that arrive less than 200 milliseconds apart, and the count never goes down. At 50, it cuts every open connection from that address and refuses it for up to 10 minutes.

All browser players reach these servers from the gateway's address. To the limiter they are one very busy player, so a busy server would cut off every browser player at once. The limiter can't count the real players instead: it runs the moment a connection arrives, before the gateway has sent the player's address.

### What it changes

- The limiter gets a short list of addresses it skips: a connection from a listed address is never counted, never refused and never cut. Every other address is handled exactly as before.
- **Certifier:** each `Gateway` line in `Certifier.ini` (patch 1) also puts that address on the list. Nothing new to set.
- **Login server:** `LoginServer.ini` now takes the same line, `Gateway "127.0.0.1"`, up to 8 of them. An address it can't take is written to the login server's error log as `Gateway <address> not added` and skipped.
- **The gateway does the counting instead,** per real player: new connections per minute, open connections per address, and a total (see the hosting guide).
- **With no `Gateway` line, nothing changes:** both servers limit every address as before.
- **Only ever list an address that belongs to this PC,** the same rule as for `Certifier.ini` below. A listed address can open connections as fast as it likes.

Files changed: `Source\_Network\Misc\Include\dos2.h` and `Source\_Network\Misc\Src\dos2.cpp` (the limiter, shared by the certifier, the login server and the cache server), `Source\CERTIFIER\DPCertifier.cpp` and `Source\LOGINSERVER\LoginServer.cpp`. The cache server compiles the limiter but never uses it, so it behaves as before.

## 3. certifier-lockout.patch: the wrong-password count per address and account

### Why

The certifier remembers wrong passwords in 8 login threads (the account name decides which), and each thread remembers only the last 3 addresses. With the real player addresses of patch 1, on a busy server other players' logins push a guesser's count out within seconds, so the lockout stops working.

### What it changes

- The count is kept per **player address and account name**. The rules stay the same:
  - one wrong password blocks that account from that address for 15 seconds;
  - three or more block it for 15 minutes after the last wrong one, and after that each further wrong password blocks it for 15 minutes again;
  - a good login clears the count.
- **The count isn't pushed out by other logins any more.** It's kept until a good login, or for 24 hours after the last wrong password.
- **A memory cap:** at most 20,000 counts per login thread, 160,000 in all. When it's full, counts older than 24 hours go first, then the oldest one.
- **Account names the count can't tell apart are refused.** The database treats `acc1`, `acc1 ` (with a space at the end) and a name cut off after 32 characters as the same account, so each spelling would get a count of its own and allow 3 more tries. The certifier now closes the connection, as it already does for a name with an apostrophe, when the account name:
  - is longer than 32 characters;
  - has a space anywhere in it;
  - has a control character or anything outside plain ASCII (letters, digits and punctuation).

  No real account is affected. The portal registers 4 to 32 letters, digits, dashes and underscores, and the browser client trims the name and says "Login details incorrect." for such names without sending them.
- **What you chose:** someone else's typos never block a player, even on a shared address. The other side of that: one address can try 3 passwords on **every** account. The gateway's limits hardly slow that down, because one connection can send many tries a second; the database is the real limit.

Files changed: `AccountMgr.h`, `AccountMgr.cpp`, `DBManager.cpp` and `DPCertifier.cpp` in `Source\CERTIFIER\`.

## 4. world-snapshot-index.patch: a table of contents in the world server's bundles

### Why

The world server sends most of the game to each player in bundles: a JOIN packet when the player enters the world, then SNAPSHOT packets many times a second. A bundle is a count followed by that many messages, one after another (someone moved, a monster appeared, an item changed, and so on). A message doesn't say how long it is, so to find where the next one starts, the reader has to know every message type there is. Neuz knows them all.

The browser client reads only the messages it needs so far (players and monsters appearing, moving and leaving). At the first message it doesn't read, it can't find the next one, so it would have to drop the rest of the bundle, including messages it does read.

### What it changes

- **After the last message of each bundle, the world server adds a table of contents:** where each message starts, the count again, and a marker (the 4 bytes `TOC1`). With it, the browser skips any message it doesn't read and goes on with the next one.
- **A bundle grows by 4 bytes per message, plus 6.**
- **Neuz isn't affected.** It reads only the counted messages and nothing after them, so it never reads the table.
- **There's no setting and no switch.** Every bundle gets the table. To stop it, put the old exe back (see "Undo").
- **The browser works with either exe.** With the old exe it reads each bundle in order, and drops the rest of a bundle from the first message it doesn't read.
- **None of the 277 places in the world server that add a message changes.** The message counter (`CSnapshot::cb`, a `short`) becomes a small class that behaves like that `short` and also notes where each message starts. `CUser::Notify` adds the table just before it sends the bundle. The existing rewind after sending removes the table again, together with the messages.

Files changed: `Snapshot.h`, `Snapshot.cpp` and `User.cpp` in `Source\WORLDSERVER\`.

## Apply them (only for a fresh copy of Source)

**On this PC they're already in `Source\`.** Skip to "Build".

Open Git Bash in the server folder (`Blouflash VS22 V15`, the folder that holds `Source`, `Program` and `FlyffWeb`).

1. **Find out which are already in.** Run these checks in this order. A check that prints nothing means that patch is in; one that prints errors means it isn't.

   ```
   git apply -R --check -p1 FlyffWeb/server-patches/certifier-lockout.patch
   git apply -R --check -p1 FlyffWeb/server-patches/flood-limiter-gateway.patch
   ```

   - If the second check prints nothing, patches 2 **and** 1 are in: patch 2 builds on patch 1, and once patch 2 is in, patch 1's own check prints errors even though patch 1 is there. Don't run it.
   - Only if the second check printed errors, check patch 1:

     ```
     git apply -R --check -p1 FlyffWeb/server-patches/certifier-client-addr.patch
     ```

   - Patch 4 changes other files than the first three, so check it on its own:

     ```
     git apply -R --check -p1 FlyffWeb/server-patches/world-snapshot-index.patch
     ```

2. **Apply the ones that aren't in,** in the order of the table at the top (1, then 2, then 3, then 4). For example, for patch 1:

   ```
   git apply -p1 FlyffWeb/server-patches/certifier-client-addr.patch
   ```

   If this prints nothing, or only warnings about "trailing whitespace" (normal), it worked. If it says "patch does not apply", the files in `Source\` differ from the ones the patch was made against, and nothing was changed.

To remove them from `Source\` again, run the same command with `-R`, in the reverse order (patch 4 first).

## Build

In Git Bash, from the `FlyffWeb` folder, build the certifier, the login server and the world server:

```
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/CERTIFIER/Certifier.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/LOGINSERVER/LoginServer.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/WORLDSERVER/WorldServer.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
```

Each should end with `Build succeeded.` The new exes are `Output\Certifier\Release\Certifier.exe` (all three certifier changes in one exe), `Output\LoginServer\Release\LoginServer.exe` and `Output\WorldServer\Release\WorldServer.exe`. The build never writes into `Program\`. The world server's build takes the longest.

**Test programs (optional).** Run them in Git Bash from the `FlyffWeb` folder:

- `bash server-patches/tests/run-limits-test.sh` builds a small program that checks the flood limiter's list and the wrong-password rules, and prints `PASS`.
- `bash server-patches/tests/run-snapshot-test.sh` builds a small program that checks the table of contents (where each message starts, the bytes of the table, and that a new bundle starts with an empty table), and prints `PASS`.
- `node server-patches/tests/scan-snapshot-sites.mjs ../Source` lists the 277 places in the world server that add a message to a bundle (3 of them are in commented-out code), checks that none of them writes anything before it counts its message (otherwise the table would point at the wrong byte), and ends with `277 sites, 0 problems`. Run it again after any change to `Source\WORLDSERVER`: a new message written the usual way is fine, and a problem is printed with its file and line.

## Put them in service

**Before you swap an exe,** confirm that `Source\` matches the server that's running now. A new exe is built from everything in its project and the shared code it uses, not only from these patches.

- **On this PC, all three matched before these changes:**
  - Before patch 1, `Program\2. Certifier.exe` (3,414,528 bytes, dated 9 June 2026) had the same size and date as the build in `Output\Certifier\Release\`.
  - Before patch 2, `Program\5. Login.exe` (3,380,224 bytes, dated 9 June 2026) had the same size and date as `Output\LoginServer\Release\LoginServer.exe`.
  - Before patch 4, `Program\7. World.exe` (3,824,640 bytes, dated 9 June 2026) had the same size and date as `Output\WorldServer\Release\WorldServer.exe`.

  That means the running exes were built from this `Source\` folder.
- **But one world-server file changed after that build.** `Source\WORLDSERVER\DPSrvr.cpp` was saved on 9 June 2026 at 19:38, 40 minutes after the running `7. World.exe` was built (18:58). The new `WorldServer.exe` has that later change too, whatever it was. (`CUSTOM_FEATURES.md`, saved a minute later, lists that day's work, mostly the Dungeon UI.) Before you swap the world server, make sure that change is one you want live.
- **Swap only if nothing else changed since.** If you've changed certifier, login-server or world-server code in `Source\` since then (for the world server, that includes `Source\WORLDSERVER` and `Source\_Common`), or copied in code from somewhere else, the new exe would include those changes too. If you're not sure, ask before swapping.

### The certifier

1. Stop the certifier (`Program\2. Certifier.exe`).
2. Back up `Program\2. Certifier.exe`. For example, copy it to `Program\2. Certifier.exe.before-gateway`. (If that backup already exists from an earlier swap, keep the old one.)
3. Copy `Output\Certifier\Release\Certifier.exe` over `Program\2. Certifier.exe`, keeping the name `2. Certifier.exe`.
4. Open `Program\Certifier.ini` in a text editor. If it has no `Gateway` line yet, go to the very end and add this on a new line of its own, then save:

   ```
   Gateway "127.0.0.1"
   ```

   - **Press Enter after `HEARTBEAT` first.** The file's last line, `HEARTBEAT`, has no line break after it, so the cursor may land right after it. If you type straight after it, you get `HEARTBEATGateway "127.0.0.1"`, which quietly turns off both settings.
   - **`127.0.0.1` is the normal setting.** It's right when the gateway runs on this same PC and connects to the certifier at `127.0.0.1`.
   - **Only ever list an address that belongs to this PC:** `127.0.0.1`, or this PC's own address as shown by `ipconfig` (the "IPv4 Address" lines). **Never add an address you don't recognise,** even if it shows up in a `GATEWAY_CLIENT_ADDR refused from <address>` log line. Anyone who can reach the certifier can send that packet and cause that log line. A listed address can claim to be any player's address and skips the flood limiter. That would let a stranger get around the wrong-password lockout, which allows unlimited password guessing, get around `IPCut.ini` bans and other address checks, and flood the certifier.
   - **When to add a second line.** Each time a browser player logs in, the log may show `refused from` followed by this PC's own `ipconfig` address. That means the gateway connects through that address instead of `127.0.0.1`. Those players can still log in, but they all share one address. In that case, add a second line with that address: `Gateway "<that address>"`. Up to 8 `Gateway` lines are allowed.
5. Start the certifier.
6. Confirm Neuz can still log in: log in with Neuz and reach the server list.

### The login server

1. Stop the login server (`Program\5. Login.exe`).
2. Back up `Program\5. Login.exe`. For example, copy it to `Program\5. Login.exe.before-gateway`.
3. Copy `Output\LoginServer\Release\LoginServer.exe` over `Program\5. Login.exe`, keeping the name `5. Login.exe`.
4. Open `Program\LoginServer.ini` in a text editor. Go to the very end and add this on a new line of its own, then save:

   ```
   Gateway "127.0.0.1"
   ```

   - **Press Enter after the last line first.** The file ends with `//NPROTECT` and no line break. If you type straight after it, the line becomes part of that comment and is quietly ignored.
   - Use the same address or addresses as the `Gateway` lines in `Certifier.ini`, and the same rule: only addresses of this PC.
5. Start the login server.
6. Confirm Neuz can still log in: log in with Neuz, pick a server and reach the character list.
7. Look in the error log, a file named like `error_20261022.txt` in the `Program` folder (the servers that run from that folder share it). There must be no `Gateway … not added` line. If there is, the address in that line was mistyped, or there are more than 8 `Gateway` lines. Both the certifier and the login server write this line, so look at the address it names in both `Certifier.ini` and `LoginServer.ini`, fix it, and restart that server.

### The world server

Read the two points about the world server under "Put them in service" first.

1. Stop the world server (`Program\7. World.exe`). Everyone in the game is disconnected, so pick a quiet moment.
2. Back up `Program\7. World.exe`. For example, copy it to `Program\7. World.exe.before-toc`. (If that backup already exists from an earlier swap, keep the old one.)
3. Copy `Output\WorldServer\Release\WorldServer.exe` over `Program\7. World.exe`, keeping the name `7. World.exe`.
4. Start the world server. There's nothing to set: no `.ini` line.
5. Confirm Neuz still plays as before: log in with Neuz, enter the world, walk around, and watch other players and monsters move. If Neuz can't enter the world after the restart, stop all the servers and start them again in their usual order (`1. Account.exe` to `7. World.exe`).

## Undo

Stop the server, copy its backup back (`Program\2. Certifier.exe.before-gateway` to `Program\2. Certifier.exe`, `Program\5. Login.exe.before-gateway` to `Program\5. Login.exe`, or `Program\7. World.exe.before-toc` to `Program\7. World.exe`), and start it again. The old exes ignore the `Gateway` lines, so they can stay in the `.ini` files. The world server has no setting, so nothing else needs undoing: the browser reads the old exe's bundles without the table.

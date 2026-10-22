# Server patches

The server source (`Source\`) isn't kept in git, so changes FlyffWeb needs in the C++ servers are saved here as patch files. You can re-apply them to a fresh copy of `Source\` at any time.

There are three. Apply them **in this order**, because the second one builds on the first:

| # | Patch | Servers it changes | In short |
| --- | --- | --- | --- |
| 1 | `certifier-client-addr.patch` | certifier | The certifier sees each browser player's real address. |
| 2 | `flood-limiter-gateway.patch` | certifier, login server | The servers' connection-flood limiter no longer counts the gateway. |
| 3 | `certifier-lockout.patch` | certifier | The wrong-password count is kept per address and account, and isn't forgotten. |

**On this PC all three are already applied in `Source\`.** The steps for applying them are only for a fresh copy of `Source\`.

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
- **What you chose:** someone else's typos never block a player, even on a shared address. The other side of that: one address can try 3 passwords on **every** account. The gateway's limits slow that down, but don't stop it.

Files changed: `AccountMgr.h`, `AccountMgr.cpp` and `DBManager.cpp` in `Source\CERTIFIER\`.

## Apply them (only for a fresh copy of Source)

**On this PC they're already in `Source\`.** Skip to "Build".

Open Git Bash in the server folder (`Blouflash VS22 V15`, the folder that holds `Source`, `Program` and `FlyffWeb`). Do these steps for each patch, in the order of the table at the top.

1. Check whether it's already applied (here for patch 1; use each patch's own name):

   ```
   git apply -R --check -p1 FlyffWeb/server-patches/certifier-client-addr.patch
   ```

   If this prints nothing, it's already applied: go on to the next patch. If it prints errors, go on to step 2.

2. Apply it:

   ```
   git apply -p1 FlyffWeb/server-patches/certifier-client-addr.patch
   ```

   If this prints nothing, it worked. One warning about "trailing whitespace" is normal for patch 1. If it says "patch does not apply", the files in `Source\` differ from the ones the patch was made against, and nothing was changed.

To remove them from `Source\` again, run the same command with `-R`, in the reverse order (patch 3 first).

## Build

In Git Bash, from the `FlyffWeb` folder, build the certifier and the login server:

```
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/CERTIFIER/Certifier.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/LOGINSERVER/LoginServer.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
```

Each should end with `Build succeeded.` The new exes are `Output\Certifier\Release\Certifier.exe` (all three certifier changes in one exe) and `Output\LoginServer\Release\LoginServer.exe`. The build never writes into `Program\`.

**Test program (optional).** `tests\run-limits-test.sh` builds a small program that checks the flood limiter's list and the wrong-password rules, and prints `PASS`. Run it in Git Bash from the `FlyffWeb` folder: `bash server-patches/tests/run-limits-test.sh`.

## Put them in service

**Before you swap an exe,** confirm that `Source\` matches the server that's running now. A new exe is built from everything in its project and the shared code it uses, not only from these patches.

- **On this PC, both matched before these changes:**
  - Before patch 1, `Program\2. Certifier.exe` (3,414,528 bytes, dated 9 June 2026) had the same size and date as the build in `Output\Certifier\Release\`.
  - Before patch 2, `Program\5. Login.exe` (3,380,224 bytes, dated 9 June 2026) had the same size and date as `Output\LoginServer\Release\LoginServer.exe`.

  That means the running exes were built from this `Source\` folder.
- **Swap only if nothing else changed since.** If you've changed certifier or login-server code in `Source\` since then, or copied in code from somewhere else, the new exe would include those changes too. If you're not sure, ask before swapping.

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
7. Look in the error log, a file named like `error_20261022.txt` in the `Program` folder (the servers that run from that folder share it). There must be no `Gateway … not added` line. If there is, the address in that line was mistyped: fix it in `LoginServer.ini` and restart the login server.

## Undo

Stop the server, copy its backup back (`Program\2. Certifier.exe.before-gateway` to `Program\2. Certifier.exe`, or `Program\5. Login.exe.before-gateway` to `Program\5. Login.exe`), and start it again. The old exes ignore the `Gateway` lines, so they can stay in the `.ini` files.

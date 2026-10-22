# Server patches

The server source (`Source\`) isn't kept in git, so changes FlyffWeb needs in the C++ servers are saved here as patch files. You can re-apply them to a fresh copy of `Source\` at any time.

## certifier-client-addr.patch: the certifier sees each browser player's real address

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

### Apply it (only for a fresh copy of Source)

**On this PC the change is already in `Source\`.** Skip to "Build it".

Open Git Bash in the server folder (`Blouflash VS22 V15`, the folder that holds `Source`, `Program` and `FlyffWeb`).

1. Check whether it's already applied:

   ```
   git apply -R --check -p1 FlyffWeb/server-patches/certifier-client-addr.patch
   ```

   If this prints nothing, it's already applied: skip to "Build it". If it prints errors, go on to step 2.

2. Apply it:

   ```
   git apply -p1 FlyffWeb/server-patches/certifier-client-addr.patch
   ```

   If this prints nothing, it worked. One warning about "trailing whitespace" is normal. If it says "patch does not apply", the files in `Source\` differ from the ones the patch was made against, and nothing was changed.

To remove the change from `Source\` again, run the same command with `-R`: `git apply -R -p1 FlyffWeb/server-patches/certifier-client-addr.patch`.

### Build it

In Git Bash, from the `FlyffWeb` folder:

```
"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/CERTIFIER/Certifier.vcxproj -p:Configuration=Release -p:Platform=Win32 -m
```

It should end with `Build succeeded.` The new exe is `Output\Certifier\Release\Certifier.exe`. The build never writes into `Program\`.

### Put it in service

**Before you swap the exe,** confirm that `Source\` matches the certifier that's running now. The new exe is built from everything in `Source\CERTIFIER\` and the shared code it uses, not only from this patch. The patch itself changed only the files listed above.

- **On this PC, it matched before this change.** Before this rebuild, `Program\2. Certifier.exe` (3,414,528 bytes, dated 9 June 2026) had the same size and date as the build in `Output\Certifier\Release\`. That means the running exe was built from this `Source\` folder.
- **Swap it only if nothing else changed since.** If you've changed certifier code in `Source\` since then, or copied in code from somewhere else, the new exe would include those changes too. If you're not sure, ask before swapping.

1. Stop the certifier (`Program\2. Certifier.exe`).
2. Back up `Program\2. Certifier.exe`. For example, copy it to `Program\2. Certifier.exe.before-gateway`.
3. Copy `Output\Certifier\Release\Certifier.exe` over `Program\2. Certifier.exe`, keeping the name `2. Certifier.exe`.
4. Open `Program\Certifier.ini` in a text editor. Go to the very end and add this on a new line of its own, then save:

   ```
   Gateway "127.0.0.1"
   ```

   - **Press Enter after `HEARTBEAT` first.** The file's last line, `HEARTBEAT`, has no line break after it, so the cursor may land right after it. If you type straight after it, you get `HEARTBEATGateway "127.0.0.1"`, which quietly turns off both settings.
   - **`127.0.0.1` is the normal setting.** It's right when the gateway runs on this same PC and connects to the certifier at `127.0.0.1`.
   - **Only ever list an address that belongs to this PC:** `127.0.0.1`, or this PC's own address as shown by `ipconfig` (the "IPv4 Address" lines). **Never add an address you don't recognise,** even if it shows up in a `GATEWAY_CLIENT_ADDR refused from <address>` log line. Anyone who can reach the certifier can send that packet and cause that log line. A listed address can claim to be any player's address. That would let a stranger get around the wrong-password lockout, which allows unlimited password guessing, and get around `IPCut.ini` bans and other address checks.
   - **When to add a second line.** Each time a browser player logs in, the log may show `refused from` followed by this PC's own `ipconfig` address. That means the gateway connects through that address instead of `127.0.0.1`. Those players can still log in, but they all share one address. In that case, add a second line with that address: `Gateway "<that address>"`. Up to 8 `Gateway` lines are allowed.
5. Start the certifier.
6. Confirm Neuz can still log in: log in with Neuz and reach the server list.

### Undo

Stop the certifier, copy `Program\2. Certifier.exe.before-gateway` back to `Program\2. Certifier.exe`, and start it again. The old exe ignores the `Gateway` line, so it can stay in `Certifier.ini`.

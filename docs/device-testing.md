# Device testing and comparison with the Windows client

For the owner. This file has a part per piece:
- Piece 1, the viewer, first;
- [Piece 2: lobby](#piece-2-lobby), the login, channel and character screens;
- [Piece 3, milestone 1: the world](#piece-3-milestone-1-the-world);
- [Piece 3, milestone 2: collision and tap to walk](#piece-3-milestone-2-collision-and-tap-to-walk);
- [Piece 4, milestone 1: fighting and levelling](#piece-4-milestone-1-fighting-and-levelling);
- [Piece 4, milestone 2: skills](#piece-4-milestone-2-skills);
- [Piece 5, milestone 1: controls and layout](piece5-m1-checkpoint.md), accepted;
- [Piece 5, milestone 2: items](piece5-m2-checkpoint.md), awaiting owner checks.

From Piece 4 on, the game is played sideways: hold phones and tablets in landscape for every checklist in the client parts. See [Hold every device sideways](#hold-every-device-sideways).

Piece 1 has three jobs, none of which the automated tests can do for you:

1. [Take reference screenshots](#1-reference-screenshots-from-the-windows-client) in the Windows client and compare them with the viewer on the compare page.
2. [Run the viewer on your four devices](#2-run-the-viewer-on-your-devices) and fill in the results table.
3. Judge pass or fail on the weakest device against the [targets](#3-pass-and-fail).

The automated side is already there: `npm run test:e2e` (pictures, walking without missing ground, the 15 MB first-load budget) and `npm run test:soak` (the 10-minute walk, about 12 minutes). This file is for what only a person with the real devices and the real client can see.

## 0. Start the viewer

On the PC, in `FlyffWeb/`:

```
npm run dev:viewer
```

It needs the converted assets in `dist/assets` (`npm run convert`, about 7 minutes, once). It prints a `Local:` address for this PC (`http://localhost:5173/`) and one or more `Network:` addresses for other devices.

The server answers anyone on your network (`--host`), and it serves everything in `dist/assets`, including `report.json` with the folder paths of this PC. Run it on a trusted home network only, and stop it (`Ctrl` + `C`) when you are done testing.

## 1. Reference screenshots from the Windows client

The compare page is `http://localhost:5173/#/compare`. It lists four spots. Opening one shows the viewer standing on that spot next to your screenshot of the same view in the Windows client (one above the other on a narrow screen). A spot without a screenshot says `no screenshot yet: put apps/viewer/compare/refs/<spot>.png here`. The screenshots load only on the dev server (`npm run dev:viewer`), not on a production build in `npm run preview:viewer`.

### How to take each screenshot

- Same shape as the viewer's frame: run the client **windowed at 16:9** (for example 1280 x 720) and keep the **default camera distance**. Crop to the 3D view only (Windows Snipping Tool, `Win` + `Shift` + `S`), with no UI windows in the picture.
- The character stands still. Stand clear of NPCs, monsters and other players if you can: the viewer has none (out of scope: NPCs and monsters, effects, water animation, weather, sound, UI).
- **Time of day: noon.** The viewer's light is fixed at the client's noon light. If your server lets you set the game time, set it to 12:00; otherwise note the time of day, because shading will differ at other hours.
- Save each picture as a **PNG** named after the spot, in `apps/viewer/compare/refs/`:

| Spot | File | In the Windows client |
| --- | --- | --- |
| `character-male-default` | `compare/refs/character-male-default.png` | A new vagrant with no equipment, standing still, the whole body in view from the front (the character-select screen, or in the world with the camera turned to face the character). |
| `world-start` | `compare/refs/world-start.png` | Madrigal at the start the viewer uses: the world file's camera position, **x 5064, z 4096** (a ravine about 2 km west of Flaris), facing a little east of north (about 11 degrees from north). |
| `flaris-plaza` | `compare/refs/flaris-plaza.png` | Flaris town square: stand at **x 6968, z 3328** and face **south**. |
| `flaris-plaza-east` | `compare/refs/flaris-plaza-east.png` | The same place, facing **east**. |

The numbers are the client's own world coordinates, the ones the mini-map and the server tools show. Directions are fixed by them: **south is towards lower z, east is towards higher x** (north is higher z). If you are unsure which way you face, walk a few steps and watch the coordinates: south must lower z, east must raise x. Then step back to the spot.

`world-start` is the one that depends on how you get to the spot (teleport with your GM tools). If the client will not give you exactly x 5064, z 4096, a few metres either way is fine, because the comparison is by eye.

### What to look at

Compare by eye, spot by spot:

- ground textures and where they blend, fog distance and colour, sky colour;
- where buildings, trees and fences stand, and that none is missing or floating;
- light and shade (see below);
- the character: pose, size on screen, the camera's height and distance behind it.

**One known point to watch: the sun.** The client lights terrain and models with the sun direction it uses at noon, and the viewer copies that exactly (ruling R50; the code and the C++ it follows are in `packages/scene/src/world/lighting.ts`). The client's noon sun is the D3D light `Direction = (0, +0.707, -0.707)`. A D3D `Direction` is the way the light travels, so this light travels **upward** (and toward -z). The vector D3D lights a surface with, from the surface toward the light, is `L = -Direction = (0, -0.707, +0.707)`, which points **down**, and the viewer uses exactly that (in its own frame, where z is negated: `(0, -0.707, -0.707)` toward the sun). So at noon the client lights surfaces from below and from the north: a face reacts to the sun only when its normal points more toward north than up (in D3D numbers, `n.z > n.y`). That is north-facing walls (facing higher z) and undersides. Flat ground (normal up) and east-, west- and south-facing walls get the ambient light alone. The `flaris-plaza` spot faces south, so the walls in front of you there face north: those are the ones the sun lights. (In `flaris-plaza-east` you look at west-facing walls, which stay at the ambient light.) If shading in the comparison looks **inverted** (faces that are bright in the client are dark in the viewer, or the other way round), say so: the sun direction is the first thing to check. "Flip" then means switching to the lit-from-above convention that the client's own continent branch (`__BS_CHANGING_ENVIR`, World3D.cpp:1822-1824) uses, `SetDir(-(0, 0.707, 0.707))`, i.e. `L = (0, +0.707, +0.707)`. In the viewer that is two small edits: the sign of the y component of `towardSun` in `lighting.ts`, and the expectation that pins it, `light.sunDirection[1]` in `packages/scene/test/player.test.ts` (line 152).

### After you approve the comparisons

The pictures the viewer is checked against are the Playwright baselines in `apps/viewer/e2e/__screenshots__/`. They exist for all four spots (`character.spec.ts/character-male-default.png`, `world.spec.ts/world-flaris-start.png` for `world-start`, `world-flaris-plaza.png`, `world-flaris-plaza-east.png`), but they were rendered by the viewer itself, not approved by anyone. Once you are happy with the comparisons, make them the approved baselines. Run this in `FlyffWeb/`:

```
npx playwright test -c apps/viewer/playwright.config.ts --project=dev --update-snapshots
```

It rewrites only the baselines whose pictures changed; the others stay as they are. Then commit the changed pictures (and your `compare/refs/*.png`).

## 2. Run the viewer on your devices

Devices to test: **iPhone**, **Android phone**, **iPad**, **Android tablet**. Browsers: Safari on the iPhone and iPad (iOS / iPadOS 16 or newer), Chrome on the Android devices. Test the desktop browsers (Chrome, Edge, Firefox, Safari) as well, on whatever you have.

### Connect

1. Put the device on the **same Wi-Fi** as the PC (not a guest network: those often keep devices apart).
2. Find the PC's address. In a Command Prompt run `ipconfig` and read the **IPv4 Address** of the adapter you use for the Wi-Fi or the cable, for example `192.168.1.20`. Ignore adapters named `vEthernet`, WSL, Docker, VPN or Bluetooth: those are internal. (The `Network:` lines that `npm run dev:viewer` prints are the same addresses.)
3. On the device, open `http://<that address>:5173`, for example `http://192.168.1.20:5173`.
4. **Windows Firewall** may ask, the first time, whether to let *Node.js JavaScript Runtime* talk on the network. Allow it on **Private networks** only. If the device cannot connect and you clicked Cancel earlier, open Windows Security > Firewall & network protection > Allow an app through firewall, and tick *Node.js JavaScript Runtime* for Private. Also check that Windows calls your Wi-Fi network *Private*, not *Public*.

A phone has no console: **anything that goes wrong shows in the overlay** at the top left of the screen (the `errors:` lines). If the page stays dark, read the overlay first.

### Label the device (once per device)

Tap **set device name** in the overlay and type a name such as `iPhone 13 Safari`. The browser remembers it, and the overlay shows it from then on, so a screenshot of the overlay says which device it is.

### Measure

On each device:

1. Open `#/character` and check that the character animates (a dropdown per slot changes its parts).
2. Open the Flaris plaza: `http://<address>:5173/#/world?world=wdmadrigal&x=6968&z=3328&yaw=180`. Stand still for **1 minute** and read `fps` in the overlay.
3. Walk around Flaris and out of town for a few minutes: the joystick on a touch screen (a full push runs), or `WASD` / the arrow keys with `Shift` to run. Watch the ground: **any gap or hole in the terrain** counts. Note the highest `gpu (est)` you see and the highest `heap` (see "Memory in Chrome" below for how far the heap number can be trusted): together they are the peak memory.
4. Look at the `errors:` lines at the end.

Fill in one row per device:

| Device | Browser | fps in Flaris after 1 minute standing | Peak memory shown (MB), as heap + gpu | Ground gaps seen (yes / no) | Errors in the overlay |
| --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | |
| Android phone | Chrome | | | | |
| iPad | Safari | | | | |
| Android tablet | Chrome | | | | |
| PC (built-in graphics) | Chrome | | | | |

**Memory in Chrome and Edge: the heap number is a lower bound.** Unless Chrome is started with `--enable-precise-memory-info`, it reports `usedJSHeapSize` coarsely and can hold it at a stale value (in plain Chromium it sat at a fixed value, 10,000,000 bytes in one run and 16,100,000 in another, while the heap was really about 168 MB). The automated soak test starts its Chromium with that flag; **Chrome on Android cannot be started with it**, so the `heap` in the overlay of an Android phone or tablet, and of any desktop Chrome or Edge you did not start that way, can be too low and can sit still. If it never changes while you walk (typically 9.5 or 15.4 MB), it is the stale value. Treat it as a lower bound, and get a real figure like this:

- **Desktop Chrome or Edge:** press `Shift` + `Esc` for the browser's Task manager and read the viewer tab's *JavaScript memory* column (right-click the header to add it), or open DevTools (`F12`) > More tools > *Performance monitor* and read *JS heap size*. Or close every Chrome window and start it with the flag: `chrome.exe --enable-precise-memory-info http://localhost:5173/` (Edge: `msedge.exe`), after which the overlay's `heap` is exact.
- **Android phone or tablet:** turn on USB debugging, plug it into the PC, open `chrome://inspect/#devices` in desktop Chrome, click *inspect* under the viewer's tab, and use *Performance monitor* (*JS heap size*) or the *Memory* panel there, with the viewer running on the device.

The `gpu (est)` number is the same on every browser and does not depend on any flag: it is the number to compare devices by, and to use for the 10% check. Add the real heap to it when you have one. It adds up the textures and geometry the viewer has uploaded and the canvas's own drawing buffer (colour and depth for every pixel, times the antialiasing samples), so it is higher on a screen with more pixels. The viewer lets go of its copy of a texture once it is on the GPU, so if the overlay ever says the WebGL context was lost, reload the page.

**Memory in Safari and Firefox.** Only Chrome and Edge report the JS heap. Safari and Firefox show `heap n/a`, so for them the peak memory is the `gpu (est)` number alone: write it down as such. (That number is an estimate the viewer adds up itself, and the real total on those browsers is larger. A device that is near the limit on the estimate alone is a fail.)

**The 10-minute walk, by hand, on the weakest device.** The automated soak test does this on the PC. On the weakest device, note `gpu (est)` (and the real heap, if you can get one, see above) after the first minute, walk a closed loop around the same few streets for 10 minutes, and note them again. Write both sets of numbers under the table. The `gpu (est)` figures alone are enough to compare: a heap read from the stale value would make the check meaningless.

## 3. Pass and fail

Judged on the **weakest** test device, against the project's targets:

| Target | How it is checked |
| --- | --- |
| First load at most 15 MB until the character is on screen | automated: `npm run test:e2e` (the `prod` project) |
| No missing ground while running | the table's "ground gaps" column, plus the automated 1,200 m run |
| At least 30 fps on phones and tablets in Flaris | the table, on the four devices |
| At least 60 fps on a PC with built-in graphics | the table, PC row |
| At most about 400 MB of JS heap plus estimated GPU memory | the table's peak memory: the real heap (see "Memory in Chrome and Edge") plus the GPU estimate; Safari and Firefox: the GPU estimate alone |
| After a 10-minute loop walk, memory within 10% of its starting level | automated: `npm run test:soak` (numbers in [conversion-baseline.md](conversion-baseline.md)); by hand on the weakest device, from the two numbers under the table |

Any `errors:` line in the overlay that you cannot explain is a fail too: send a photo of the overlay.

# Piece 2: lobby

For the owner. The lobby is the first real page of the browser client: log in, pick a server and channel, see your characters, create one and delete one. This part of the file checks it on your four devices, over your Wi-Fi, with the PC running the game servers, the gateway and the client.

The automated side is `npm test` (including the gateway tests) and `npm run test:e2e:client` (the lobby in Chromium, against pretend servers; until Piece 4 also in WebKit, Safari's engine). What they cannot tell you is whether a real phone, over real Wi-Fi, gets through your real servers. That is this checklist.

To put the lobby on the internet instead, see [hosting.md](hosting.md).

## Run the live test first

Before you take a phone out, run the live test on the PC. It starts its own gateway and drives the real login flow against your real servers with a test account. If the servers, the gateway or the login flow are broken, it says so with the usual cause, without a phone's Wi-Fi getting in the way, and a phone test would only show you the same failure.

1. Start the game servers (the 7 programs in `Program\`).
2. In `FlyffWeb/`, in PowerShell (in Git Bash use `cp` and forward slashes instead of `Copy-Item`), make your local settings file. Git ignores it, so your test account's password never gets committed:

   ```
   Copy-Item apps\client\test\live.config.example.json apps\client\test\live.config.json
   notepad apps\client\test\live.config.json
   ```

3. Fill in `account`, `password` and `bankPin`: a **throwaway test account** with at least one empty character slot. The test creates a character named `WebTest` and three digits with that Bank PIN, deletes it, then changes the channel and lists the characters again. The long `_comment` at the top of the file explains every setting. Leave the others as they are, except:
   - `certifierPatched`: set to `true` only when the rebuilt `Certifier.exe` is running and `Certifier.ini` has the `Gateway "127.0.0.1"` line (see [server-patches/README.md](../server-patches/README.md)). That switches on the check that one player's wrong password does not block another player.
   - `bannedTestAddress`: leave `null`, unless you added an address to `Program\IPCut.ini` and restarted the account server.
4. Run it:

   ```
   npm run test:live
   ```

   Success: it ends with a line like `Tests  3 passed | 2 skipped (5)` and no `failed`. Tests for settings you left off show as `skipped`; that is fine. With both settings on, all 5 pass. A failure prints what it expected and what happened, with a hint about the usual cause.

The test uses port 8091 for its own gateway, so it does not matter whether `npm run gateway` is running. Wait at least **15 seconds between runs**, and do not run it in a loop: it sends a wrong password on purpose, and, until the new certifier and login server are in place with their `Gateway` lines ([server-patches/README.md](../server-patches/README.md)), the servers' connection limiter never forgets (see "When something goes wrong" below).

## Start the gateway and the client

On the PC, in `FlyffWeb/`.

1. **Find the PC's Wi-Fi address.** In a Command Prompt run `ipconfig` and read the **IPv4 Address** of the Wi-Fi adapter, as in "Connect" in the Piece 1 part above. The phone will open `http://<that address>:5174`.

2. **Make the gateway's settings file** (git ignores it):

   ```
   Copy-Item apps\gateway\gateway.config.example.json apps\gateway\gateway.config.json
   notepad apps\gateway\gateway.config.json
   ```

   The example already lists `http://localhost:5174` and `http://192.168.100.159:5174` (the PC's Wi-Fi address when the file was written) under `allowedOrigins`. **The address you will type on the phone must be in that list, exactly:** `http://`, the PC's address, `:5174`, and no slash at the end. If the PC's address is now different, change the second entry to it, for example:

   ```
   "allowedOrigins": ["http://localhost:5174", "http://192.168.1.20:5174"],
   ```

   The gateway refuses a page that is not listed. Home routers sometimes give the PC a new address after a restart: if the phone stops working one day, check this first.

3. **Start the gateway,** in one PowerShell window:

   ```
   npm run gateway
   ```

   Success: it prints `gateway listening on ws://0.0.0.0:8090` and stays running. It prints a line for every connection (`open ...` and `close ...`), with the device's address; you will use that below. A mistake in the settings file makes it print `gateway: cannot use ...` with the reason and stop.

4. **Start the client,** in a second PowerShell window:

   ```
   npm run dev:client
   ```

   Success: it prints a `Local:` address (`http://localhost:5174/`) and one or more `Network:` addresses. The `Network:` address that matches your Wi-Fi address is the one for the phone.

5. **Try it on the PC first.** Open `http://localhost:5174` in a browser on the PC. You should see **FlyFF**, with a **Log in** form. Log in with a test account: you should reach "Choose a channel". If that fails, fix it here, not on a phone (see "When something goes wrong").

6. **Windows Firewall** may ask, once for each program, whether to let *Node.js JavaScript Runtime* talk on the network. Allow it on **Private networks** only, as in "Connect" above. The gateway (port 8090) and the client (port 5174) both need to be reachable from the phone.

The page finds the gateway by itself: it connects to `ws://<the address in the browser's address bar>:8090`. Nothing to set on the phone.

Both programs answer anyone on your network. Use a trusted home network, use throwaway test accounts (this test setup uses plain `http`, so the password hash travels unencrypted over your Wi-Fi), and stop both windows with `Ctrl` + `C` when you are done.

## Steps on each device

Devices to test: **iPhone**, **Android phone**, **iPad**, **Android tablet**. Browsers: Safari on the iPhone and iPad (iOS / iPadOS 16 or newer), Chrome on the Android devices. Do the PC with Chrome as well, as a reference.

Put the device on the **same Wi-Fi** as the PC (not a guest network), and open `http://<PC Wi-Fi address>:5174`. You should see **FlyFF** and a **Log in** form with Account and Password. A phone has no console: anything that goes wrong shows as a red message on the page. The gateway window shows what the gateway saw.

Do these in order on each device, and write the result in the table below:

1. **Layout.** The page fits the screen width with no sideways scrolling; you can read every label and tap every button. Turn the device sideways and back once.
2. **Log in** with a test account. Success: the heading **Choose a channel**, the server's name, and its channels, each with its player count. A channel marked **Offline** or **Full** cannot be picked.
3. **Pick a channel** that is not Offline or Full. Success: the heading **Your characters**, with three slots; each shows a character (name, level, job) or **Empty — Create**.
4. **Create a character.** Tap **Empty — Create** on an empty slot. Type a name of 4 to 16 letters and digits, starting with a letter (for example `PhoneTest1`; use a different name on each device). Pick Male or Female, change Hair and Head with the + and − buttons, type a Bank PIN of 4 digits (not `0000`) twice, and tap **Create**. Success: back at **Your characters**, with the new character in the slot, under the name you typed.
5. **Delete it.** Tap **Delete** beside it, type its Bank PIN, and tap **Delete**. Success: the slot says **Empty — Create** again.
6. **Stay a while.** Wait **3 minutes** on **Your characters** without tapping anything, with the screen kept on (set the auto-lock to 5 minutes or more for this step; a device that sleeps drops its connection, which is a different test). Then create a character as in step 4, and delete it again as in step 5. Success: both still work. The login server drops a connection that stays silent for 90 seconds, so this checks that the page keeps it alive.
7. **Change channel.** On **Your characters**, tap **Change channel**. Success: the login form shows "Logging in…" for a moment, then **Choose a channel** appears. Pick a channel again: **Your characters**, with the same characters as before.
8. **Wrong password, once.** Tap **Log out**, then log in with the right account and a **wrong** password. Success: you stay on the login form and a red message appears, for example "Login details incorrect.  Please try again." Then **wait 15 seconds** and log in with the right password: it must work. Do not try more than one wrong password in a row: three wrong passwords block that address for 15 minutes.
   - With the old certifier, the 15 seconds block **every** browser device (they all look like one address to it), so do this step on one device at a time.
   - With the rebuilt certifier, only this device is blocked. To check that: during the 15 seconds after a wrong password on one device, log in on another device with the right password. It must work.
9. **Two devices at the same time.** Use two devices and two different test accounts, one each. Log in on both at the same time, pick a channel on both, and get both to **Your characters**; then create a character on one while the other stays open. Success: both work, and the gateway window shows an `open` line for each device with **its own address** (for example `open 192.168.1.31 172.31.238.55:23000` and `open 192.168.1.47 172.31.238.55:23000`).
   - Optional: log in with the **same** account on both. The second device may show **Already connected** with **Disconnect it** and **Cancel**. That is the server's own question, not a fault. Tap **Disconnect it**, then log in again.

## Results

Fill in one row per device, `pass` or `fail`. The last column is for anything odd you saw, and for the exact text of a red message.

| Device | Browser | 1. Layout | 2. Log in, channels | 3. Characters | 4. Create | 5. Delete | 6. Stay a while | 7. Change channel | 8. Wrong password | 9. Two at once | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | | | |
| Android phone | Chrome | | | | | | | | | | |
| iPad | Safari | | | | | | | | | | |
| Android tablet | Chrome | | | | | | | | | | |
| PC | Chrome | | | | | | | | | | |

## Pass and fail

The lobby passes when **every cell is `pass` on every one of the four devices**. A step fails when:

- it does not end as the step says;
- the page stays on a progress message ("Logging in…", "Loading the characters…") for more than about 30 seconds;
- a red message appears that you cannot explain with this page: send a photo of the screen and of the gateway window;
- part of the page cannot be read or tapped.

## When something goes wrong

| What you see | What it means and what to do |
| --- | --- |
| The page does not open at all on the device | The device is not on the same Wi-Fi, the Wi-Fi keeps devices apart (guest network), or Windows Firewall blocks Node.js: see "Connect" in the Piece 1 part above. Check that `npm run dev:client` is running. |
| **"Cannot reach the game gateway."** when you log in | The page cannot talk to the gateway. Check, in this order: (1) `npm run gateway` is running and printed `gateway listening`; (2) the address in the phone's address bar, `http://<address>:5174`, is **exactly** in `allowedOrigins` in `apps/gateway/gateway.config.json` (then restart the gateway: it reads the file once, when it starts); (3) Windows Firewall lets Node.js through on Private networks, for port 8090 as well. A clue: when you tap **Log in** the gateway window should print an `open` line. If it prints `refused <address> origin`, the address in the address bar is not in `allowedOrigins`. If it prints nothing at all, the request never got in: the firewall or the address is wrong. |
| **"This server address is not allowed."** | The address the servers hand out is not a key under `routes` in the gateway settings. The example has the three routes for `172.31.238.55`; change them if your servers advertise another address. |
| **"The game server is not reachable. Try again later."** | The gateway is running but cannot reach the certifier or the login server. Are the game servers running? The gateway window shows `close ... code=4001` for it. |
| **"Too many connections from your network."** | The gateway allows 32 open connections from one address. Close other tabs of the page on that device, wait a few seconds, and reload. |
| **"Too many connection attempts from your network. Wait a minute and try again."** | The gateway allows 60 new connections from one address in a minute; a login uses 2. Wait a minute. The gateway window shows `refused <address> rate`. |
| **"The game is full right now. Try again in a few minutes."** | The gateway already has 1000 open connections. On a test PC this should never happen: look at the gateway window for `refused … full` lines and for a program opening connections over and over. |
| **"Wrong Password. Cannot log into account for 15 seconds."** | The certifier's lockout after a wrong password: wait 15 seconds. After three wrong passwords in a row it is 15 minutes, with "Wrong Passwords 3 times. Cannot log into account for 15 minutes." |
| **"Already connected"** | The account is logged in somewhere else, or its last session is still closing (this can also follow **Change channel**, if the servers are slow to let go of the old session). Tap **Disconnect it** and log in again, or use another test account. |
| **Every login fails at once, on every device, and it lasts about 10 minutes** | The game servers' own connection-flood limiter (in the certifier and the login server). It counts connections from one address that come less than 200 milliseconds apart, and never forgets them. After 50, it cuts every connection from that address and refuses it for about 10 minutes. Until the new certifier and login server are in place with their `Gateway` lines ([server-patches/README.md](../server-patches/README.md)), all browser players count as the gateway's one address, so repeated quick logins, and repeated `npm run test:live` runs, add up. **Wait about 10 minutes**, or restart the certifier and the login server. See [hosting.md](hosting.md#before-a-public-launch). |

# Piece 3, milestone 1: the world

For the owner. **Enter** on a character now opens the 3D world where the character was saved: the other players, the monsters and the NPCs around it, each with a name tag, moving by the Windows client's own rules. This part checks it on your four devices, two at a time, over your Wi-Fi, with the PC running the game servers, the gateway and the client.

The automated side is `npm test`, `npm run test:e2e:client` (the world against pretend servers, in Chromium; until Piece 4 also in WebKit) and the live world test below. None of it needs Neuz, and nothing here asks you to run Neuz next to the servers.

## Before you start

**Servers in a Hyper-V virtual machine?** Set the VM up with [servers-in-a-vm.md](servers-in-a-vm.md) first. Then everything below that touches the servers happens in the VM (the server swap, the gateway and the live world test), and the client on your PC is started with `GATEWAY_PROXY` set to the VM's gateway address, as that guide's step 6 says. The phones then talk only to your PC.

1. **Put the new world and cache servers in service**, and add the `Gateway "127.0.0.1"` line to `Program\CacheServer.ini`: follow "Put them in service" in [server-patches/README.md](../server-patches/README.md) (read its note about the world server first). With the old world server the browser still enters the world, but it reads only part of what that server sends: other players, monsters and NPCs can be missing or stand still, and this checklist would fail for that reason alone. The overlay tells you which world server is running (step 1 below).
2. **The game files.** `dist/assets` must hold a conversion made with this version (it adds `data/worlds.json` and new fields in the other catalogs). If you are not sure, run `npm run convert -- --only data` in `FlyffWeb/` (a few seconds; the full `npm run convert` is only needed when the `Client` folder changed).
3. **Two throwaway test accounts,** each with a character, or with an empty slot (the live test then makes a character and deletes it at the end). Use characters saved in Flaris; a new character starts there.

## Run the live world test first

As for the lobby: if the servers, the patches or the world session are broken, the PC shows it here, with no phone in the way.

1. Start the game servers (the 7 programs in `Program\`).
2. Open `apps\client\test\live.config.json` (made in the Piece 2 part above) and add the `world` section with the two accounts, as the `_comment` at the top of `live.config.example.json` explains.
3. Run it:

   ```
   npm run test:live:world
   ```

   Success: no `failed`. It checks that both players enter Flaris and see each other, that the one who runs and stops is seen standing within 1 metre of where it says it stands, that every packet from the world server had its table of contents and no message was misread, and that both can leave and enter again.

The same care as for `npm run test:live` applies: wait at least 15 seconds between runs, and never run it in a loop.

## Start the gateway and the client

As in the Piece 2 part ("Start the gateway and the client"): `npm run gateway` in one window, `npm run dev:client` in another, and the phone's address in `allowedOrigins` (with the gateway in a VM and `GATEWAY_PROXY`, only `http://localhost:5174`: see [servers-in-a-vm.md](servers-in-a-vm.md)). Then, on the PC first, open `http://localhost:5174`, log in, pick a channel and tap **Enter** on a character: after "Entering the world…" (which has a **Leave** button too, to give up) you should see the character from behind, in the world, with the **Leave** button at the top right and the overlay at the top left. If that fails, fix it on the PC, not on a phone (see "When something goes wrong" below).

**Moving:** on a touch screen, the joystick at the bottom left (a push walks, a full push runs); on a keyboard, `W` / `S` or the up and down arrows walk forward and back, `A` / `D` or the left and right arrows turn, and holding `Shift` runs. (Since Piece 4, as in the Windows client: the keys run, and `X` toggles between walking and running; `Shift` no longer changes the pace. Where the steps below say Shift, use `X`.)

## Steps, two devices at a time

Pair the devices (for example the iPhone with the Android tablet, then the iPad with the Android phone), one test account each. Do these in order and write the result in the table below. Read the overlay as in "Measure" in the Piece 1 part (`fps`, `heap`, `gpu (est)` and `errors:`), plus one new line, `bundles N   indexed N   messages skipped N   mismatched N`: the packets the world server sent, how many of them had their table of contents, and the messages in them the browser skipped (it doesn't use them yet; this number grows, and that is normal) or misread.

1. **Enter.** Log in on both devices, pick the same channel, and tap **Enter** on a character saved in Flaris. Success: both show the world within about 30 seconds of tapping **Enter** (the first time on a device takes longest), `indexed` is the same number as `bundles` (so the new world server is running), and `mismatched` is 0.
2. **See each other.** Walk the two characters close to each other. Success: each device shows the other player, with its name above it. Walk one of them in a circle: the other device shows it walking the same way, without jumping from place to place, and it stops where it stopped on its own device.
3. **Monsters.** Walk out of town, through the gate, to where the monsters are. Success: monsters stand, wander about and turn, each with a name tag, and their legs move as they walk.
4. **NPCs.** In town, find a few shopkeepers. Success: they stand in their places, dressed, with their names above them.
5. **Name tags fade.** Walk away from a monster: its tag fades and is gone at about 40 metres from the camera. A player's or a shopkeeper's tag lasts to about 100 metres. Success: tags fade instead of popping, and they are readable up close.
6. **Speed and memory.** At the edge of town near the gate, with about 20 monsters and the other player in view, stand still for 1 minute and read `fps`; then walk for a few minutes and note the highest `heap` and `gpu (est)`.
7. **The 10-minute walk** (on the weakest device): note `gpu (est)` (and the real heap, if you have one, as in the Piece 1 part) after the first minute, walk a closed loop around the same few streets for 10 minutes, and note them again.
8. **Leave.** Tap **Leave**. Success: back at the **Log in** form, and on the other device the character disappears.
9. **Sleep.** Enter again, then put the phone to sleep (press its power button) for about 3 minutes and wake it. (Not less: the cache server and the gateway each notice a connection that has gone quiet only after about a minute, so a shorter sleep may not end it.) Success: the page shows "The connection to the game was lost." and the **Log in** form, and logging in again works (if it says "The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again.", wait a moment and try again).

## Results

| Device | Browser | 1. Enter | 2. See each other | 3. Monsters | 4. NPCs | 5. Name tags | 6. fps after 1 minute | 6. Peak memory (MB), heap + gpu | 8. Leave | 9. Sleep | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | | | |
| Android phone | Chrome | | | | | | | | | | |
| iPad | Safari | | | | | | | | | | |
| Android tablet | Chrome | | | | | | | | | | |
| PC | Chrome | | | | | | | | | | |

Under the table, write the two sets of numbers from step 7 and which device it was.

## Pass and fail

Milestone 1 passes when every cell of steps 1-5, 8 and 9 is `pass` on every device, and the weakest device meets these targets:

| Target | How it is checked |
| --- | --- |
| At least 30 fps in Flaris with about 20 monsters and 5 players in view | step 6 (with two players here: note how many movers were in view) |
| At most about 400 MB of JS heap plus estimated GPU memory | step 6, read as in the Piece 1 part |
| After a 10-minute walk, memory within 10% of its starting level | step 7 |

If the weakest device misses a target, write down by how much: the fixes (a shorter view distance for movers, fewer far-away details) are chosen from these numbers. Any `errors:` line in the overlay, or a `mismatched` number above 0, that you cannot explain is a fail too: send a photo of the overlay.

## When something goes wrong in the world

| What you see | What it means and what to do |
| --- | --- |
| "Entering the world…" for a long time, then "The server did not answer in time." | The login server or the cache server did not answer. Are all 7 servers running? Is there a `cache` route (port 5400) in `apps/gateway/gateway.config.json`? The gateway window shows an `open` line for `…:5400` when the browser reaches the cache server. |
| "The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again." | The world server refused the character, usually because its last session (a closed tab, a phone that slept) is still being closed. Wait a moment and log in again. |
| "The connection to the game was lost." | A connection closed while playing. Expected after sleep (step 9); otherwise look in the gateway window for `close` lines, and check that the servers are still running. |
| "Moving to another map isn't supported yet." | The character went through a portal or was moved to another map. Only one map per session works so far. Log in again. |
| "This map isn't available in the browser yet." | The character is saved on a map that was not converted, or `dist/assets` is older than this version: run `npm run convert -- --only data` (see "Before you start"). |
| "The game files on the server are out of date." | `dist/assets` was converted by an older version and lacks the game data this one reads. Run `npm run convert -- --only data` in `FlyffWeb/` (a few seconds) and enter again. |
| "The game files took too long to load. Check the connection and try again." | The map and the characters around the player did not arrive within a minute. Check the device's Wi-Fi and try again; the second try is quicker. If it happens on the PC too, check that `npm run dev:client` is still running. |
| "This browser can't show the 3D world (WebGL is off or not supported)." | The browser has no WebGL 2, which the 3D world needs. Update the browser (on iPhone and iPad: iOS / iPadOS 16 or newer). In Chrome on a PC, turn on "Use graphics acceleration when available" in Settings → System and restart Chrome. |
| Other players or monsters are missing, or stand still, and on the overlay `indexed` stays at 0 while `bundles` grows | The old world server is still running (see "Before you start"). With the new one, `indexed` equals `bundles`. |
| A plain stand-in figure instead of a character or monster | Its model was not converted, or failed to load: the overlay's `errors:` line names it. Send a photo. |
| The other player jumps from place to place, or stops somewhere other than where it stopped on its own device | Write down what each device showed: that is what the movement rules of this milestone are checked for. |

# Piece 3, milestone 2: collision and tap to walk

For the owner. Milestone 2 adds the Windows client's collision: buildings, fences and steep slopes stop you, you slide along walls, bridges and stairs carry you, and the camera stays out of walls. It also adds tap (or click) to walk. You chose to test milestones 1 and 2 together, so do this part at the same sitting, right after the milestone 1 steps above, with the same two devices and accounts.

The automated side: `npm test` (the collision rules against hand-made walls, corners, bridges, stairs and slopes, the camera easing back out from a wall, and the picking), `npm run test:e2e:client` (walking into a Flaris wall, the camera kept out of a Flaris house, tapping the ground, cancelling a tap, the correction sent after bumping into a wall, and another player's correction arriving) and the corpus tests (every collision shape of the real models, and movers crossing Madrigal's real bridges). What they cannot tell you is how it feels on a real phone. That is this checklist.

**Before you start:** the converted game files must include the collision shapes and the new world manifests. If `dist/assets` was converted before this milestone, run `npm run convert` once (about 7 minutes). If it was converted during this milestone, before this version, `npm run convert -- --only data` is enough (a few seconds): it marks the flying monsters, such as the Mothbees.

**Tapping:** on a touch screen, tap the ground once (a quick tap; a drag turns nothing into a walk). On a PC, click the ground with the left mouse button. A small ring marks the spot.

## Steps, two devices at a time

Device A walks; device B watches the same character. Swap roles for the second pair of devices.

1. **Walls.** On A, walk straight into a building in Flaris. Success: the character stops at the wall instead of walking into it. Walk into it at an angle: it slides along the wall. B sees the same: the character stops at the wall, not inside it.
2. **Fences and corners.** Walk into a fence, and into the inside corner of two walls. Success: it stops, and in the corner it stops both ways.
3. **Bridges and stairs.** Walk over a bridge and up a flight of steps, in or around Flaris. Success: the character walks on top of them, not through them, and comes down the other side. B sees it at the same height.
4. **Steep slopes.** Walking (the keys without Shift, or the joystick pushed only part of the way), try to go up a steep hillside or cliff. Success: you can't climb it; on very steep ground the character slides back down. Running (Shift, or the joystick pushed all the way), the character can still work its way up a steep slope slowly, as in the Windows client: that is not a fail.
5. **The camera.** Walk along a building with the camera behind you, and turn so a wall comes between the camera and the character. Success: the camera moves in front of the wall instead of showing the inside of the building. Some trees and fences, and most lamps, are see-through for the camera, as in the Windows client: it stays where it is behind those, while the other trees and fences stop it as a wall does. When the wall is out of the way again the camera glides back out over a moment, rather than jumping.
6. **Tap to walk.** Tap a spot on the ground across the square. Success: the ring appears there, the character walks (or runs, if it was running) to it and stops on the ring, and the ring goes. B sees the character walk there and stop at the same spot.
7. **Tap behind a wall.** Tap a spot behind a building, so the straight path runs into it. Success: the character walks until it reaches the wall and stops there; B sees it stop there too, not run on the spot.
8. **Cancel a tap.** Tap a far spot, and while the character walks there turn with the joystick (or press a turn key, A or D). Success: the walk stops at once and the ring goes. Going straight forward at the pace the walk already has does not cancel it, as in the Windows client: a walk to a tapped spot goes at the pace of your last move (before your first move, at the pace the character was saved with, normally running), so while it runs there Shift+W or the joystick pushed all the way up leaves it alone, and while it walks there W alone or a part push does. W alone while it runs there changes the pace to walking, and a change of pace does cancel it: the walk stops and the ring goes, which is right too.
9. **Taps that do nothing.** Tap another player, a monster or a shopkeeper. Success: nothing happens (choosing a target comes with Piece 4; since Piece 4 the tap selects it, see the Piece 4 part). Tap the trunk of a tree or a fence: the character walks to the ground behind it, as in the Windows client, where only some objects can be tapped.

## Results

| Device | Browser | 1. Walls | 2. Fences, corners | 3. Bridges, stairs | 4. Slopes | 5. Camera | 6. Tap to walk | 7. Tap behind a wall | 8. Cancel | 9. Taps that do nothing | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | | | |
| Android phone | Chrome | | | | | | | | | | |
| iPad | Safari | | | | | | | | | | |
| Android tablet | Chrome | | | | | | | | | | |
| PC | Chrome | | | | | | | | | | |

## Pass and fail

Milestone 2 passes when every cell is `pass` on every device and milestone 1's checklist above passed at the same sitting. Also note, on the weakest device, the overlay's `fps` in Flaris again: collision adds work every step, and the 30 fps target still applies.

## When something goes wrong in milestone 2

| What you see | What it means and what to do |
| --- | --- |
| The character walks through every building | The converted files have no collision shapes: run `npm run convert` (see "Before you start" above), then reload the page. |
| It stops in front of something that isn't there, or walks through a wall it should hit | Write down where (the nearest landmark) and take a photo: that is what this milestone checks. |
| A tap does nothing on the ground | The tap was a drag (the finger moved more than a few pixels or stayed down longer than a third of a second), or it landed on a player, monster or NPC. Tap again, quickly. |
| On B, the character keeps running on into a wall or a house after A stopped there | B moves its copy of the character by the same rules, so it stops at the same wall by itself. Where A had told the server just before that it would be further on, A's browser sends a correction as it bumps, the server passes it on, and B puts the character back where A stopped: on a slow connection B may show it a step or two into the wall for a moment first, which is expected. If it stays inside, or runs on, the correction did not arrive or was not applied: write down what each device showed. |
| The Mothbees and other flying monsters walk on the ground or stand stuck against walls | The game data was converted before this version: run `npm run convert -- --only data` (a few seconds) and reload the page. Flying monsters stay where the server last put them; their flying comes with a later piece. |

# Piece 4, milestone 1: fighting and levelling

For the owner. Milestone 1 of Piece 4 lets a Vagrant fight in Flaris, as in the Windows client:
- select a monster and attack it, with the combo of your level;
- damage numbers, hit sparks, critical and miss banners, and monsters that hit back;
- the status window (HP, MP, FP and EXP), the target bar and the corners around the target;
- the task bar with the Start menu, and the attack button on touch screens;
- dying, the revive window and the lodestar;
- levelling up, and the Character window with stat points;
- the sword in the hand;
- the whole game held sideways (landscape).

Skills come in milestone 2. Do this checklist on your four devices, two at a time, as for Piece 3.

The automated side:
- `npm test` covers the formulas, the fight rules, the windows and the landscape cover.
- `npm run test:e2e:client` plays whole fights against a pretend server (`fight.spec.ts`), in Chromium as a desktop and as a landscape Android phone.
- The live world test below now also kills an Aibatt on your real servers.

None of it needs Neuz, and nothing here asks you to run Neuz next to the servers.

## Hold every device sideways

From this piece on, the whole game is landscape, from the **Log in** form to the world. While a phone or tablet is held upright, a cover says "Turn your device sideways to play." On a PC whose window is taller than it is wide, the cover says "Make the window wider to play."
- On Android, the first **Log in** or **Enter** tap also puts Chrome in full screen and locks it sideways.
- iPhones and iPads can't be locked by a web page, so turn them by hand.

Use this way of holding the devices for the earlier checklists in this file too.

## Before you start

1. **The game files.** `dist/assets` must hold a conversion made with this version. It adds:
   - the effects and the window pictures;
   - new fields in the catalogs: the monsters' weapons, which items stack, the texts' numbers and the job names.

   If you are not sure, run `npm run convert -- --only effects,ui,data` in `FlyffWeb/`, which takes about a minute.
2. **The VM.** Copy the FlyffWeb folder into the VM again, with its new `dist/assets`. See [servers-in-a-vm.md](servers-in-a-vm.md), step 4. The servers themselves are unchanged: Piece 4 needs no new server program.
3. **Two throwaway test accounts,** as for Piece 3.
   - The first account's character must be **new or low level** (a Vagrant under level 15).
   - It must still carry its starter food.
   - It must stand at Flaris's lodestar, where a new character starts.
   - The live test walks it out of the north gate to fight. A new character fits every point.

## Run the live world test first

In the VM, as in the Piece 3 part:

```
npm run test:live:world
```

Success: no `failed`. Besides the Piece 3 checks, the first account now:
1. checks its inventory (the starter lollipops and biscuit);
2. walks out of the north gate and over the bridge;
3. picks the nearest small Aibatt and kills it;
4. checks that the server counted the kill, and prints the EXP it gave (a server-wide EXP rate or an EXP event changes that number, which is fine);
5. walks back to the lodestar.

It fails if a swing gets no damage back within 3 seconds, or if the server says "Please wait a moment before attacking again." (the attack speed). If the server says the monster is fighting another player, it tries one other Aibatt first. Its message then says what it saw. If it stops with the character still outside the town, the message says so. Walk the character back to the lodestar in the browser before the next run. A character that died is put back at the lodestar by the server when the test logs out.

Wait at least 15 seconds between runs, and never run it in a loop.

## Start the gateway and the client

As in the Piece 3 part: the gateway in the VM, and `npm run dev:client` on your PC with `GATEWAY_PROXY` set to the VM's gateway address (see [servers-in-a-vm.md](servers-in-a-vm.md), step 6). The gateway's `allowedOrigins` then needs only `http://localhost:5174`.

**Fighting:**
- **On a touch screen:** tap a monster to select it. Its name and HP show in the target bar, top centre, and corners appear around it. Tap it again, or press the attack button at the bottom right, to attack.
- **With a mouse:** click to select. Then click the selected monster again, double-click it, or hold the button down on it for half a second, to attack. Holding attacks only while you hold, as in the Windows client.
- The character walks up and swings again and again until the monster dies, or until you move or tap the ground.

**Keys:**

| Key | What it does |
| --- | --- |
| `W`, `S`, `A`, `D` | Move and turn |
| Arrow keys (from Piece 5) | Rotate the camera, in the same reversed direction as dragging |
| `X` | Toggles walking and running. `Shift` no longer changes the pace. |
| `H` | Character window |
| `T` | Status window |
| `F1`-`F9` | The slots of the current bar |
| `1`-`8` | Choose the bar |
| `Escape` | 1. Clears the target. 2. With no target, closes the top window. 3. With nothing to close, opens the Start menu. 4. When you are dead, opens the revive window. |

## Steps, two devices at a time

Pair the devices as before, one test account each. Read the overlay as in the Piece 3 part. Its `errors:` line must stay empty, and `mismatched` must stay 0.

**Browsers.** The automated tests run only in Chromium, the engine of Chrome and Edge. So your iPhone and iPad are the only check for them:
- **iPhone and iPad:** use any browser. Safari, Chrome and Firefox there all run on Safari's engine and behave the same.
- **Android:** use Chrome.
- **PC:** use Chrome. Then do steps 2, 4 and 8 once more in **Firefox** and write the result in the Notes column of the PC row.

1. **Sideways.** On the phones and tablets, start upright. Success: the cover asks you to turn the device, and nothing of the game shows behind it. Turn it: the **Log in** form shows and fits the screen with no scrolling. On Android, the first **Log in** tap goes full screen. Enter the world, then turn the phone upright and back in the middle of a fight. Success: the fight goes on behind the cover, and after you turn back the target's HP shows what happened meanwhile.
2. **The windows.** Success:
   - The status window sits top left, with the character's face, name and level, the HP, MP and FP bars with "value / max", and the EXP bar with a percent.
   - The task bar runs along the bottom. Its first slots show the lollipop and biscuit icons with their counts, greyed: food comes in Piece 5.
   - The Start menu (bottom left) opens with lines big enough for a finger.
   - Tapping each line opens its window: **Character**, **Status**, and **Log out**, which asks first.
3. **The sword in the hand.** Success: your character holds its wooden sword in the right hand. The other device shows the sword in the same hand, moving with the arm as the character runs and fights.
4. **Select and attack.** Walk out of the north gate to the Aibatts. Tap (or click) one. Success:
   - The target bar shows "Aibatt <Lvl 1>" and its HP as "value / max", and white corners appear around it.
   - Tap it again, or press the attack button. The corners turn red, the character runs up to it and swings, and each blow shows a number over the Aibatt and a spark.
   - The other device sees the same swing and the same Aibatt flinching.
5. **The combo.** At level 1, every swing is the same single blow. Watch for the change after you level up:
   - At level 2 the character chains two blows.
   - At level 8, three.
   - When the level reaches 2 and 8, the messages above the task bar say "You are learning new attack patterns!".
6. **Critical and miss.** Keep fighting for a while. Success: now and then a red "critical" banner shows with a bigger number, and a "miss" banner where a blow missed.
7. **Being hit.** Let an aggressive monster attack you, or stand still while an Aibatt you hit hits back. Success: its swing, a number over your character in the other colour, your HP bar going down, and your character flinching.
8. **Level up.** Kill Aibatts until the EXP bar is full. Success:
   - a column of light around the character;
   - "Congratulations! Level up!" across the middle of the screen;
   - the new level in the status window;
   - HP, MP and FP refilled to the new maximum;
   - a line in the messages.
   - The other device sees the light too.
9. **Stat points.**
   - Press `H`, or use **Character** in the Start menu. Success: the Character window shows your name, "Vagrant", your level, the server and the channel, your ATK, DEF, critical and attack speed, STR, STA, DEX and INT, and the Stat Points left (2 for each level since level 1).
   - Press **+** next to STR twice. Success: the counts show, the numbers that would change turn red, and **Apply** and **Reset** light up. **Reset** clears the counts.
   - Place the points again and press **Apply**, then **Yes**. Success: the stats go up, and the Stat Points go down.
   - On a phone, the window may be taller than the space above the task bar. Then it scrolls: drag inside it to reach **Apply**.
10. **Dying and the lodestar.** Let monsters kill your character. A group of aggressive ones works, or a strong monster further out. Success:
    - the death motion, the message "Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.", and the revive window in the middle of the screen;
    - **Revive here** is greyed out, and the rest of the screen takes no taps.
    - **Lodestar** takes the character back to Flaris's lodestar, alive, with part of its HP.
    - The other device sees it disappear and come back at the lodestar.
11. **Speed in a fight.** On the weakest device, fight with at least 5 monsters in view, for example at the Aibatt field. Read `fps` on the overlay for a minute.
12. **Log out.** In a fight, use **Log out** in the Start menu. Success: it says "You cannot quit during combat." Out of the fight, wait about 10 seconds, then try again. Success: a box asks first, **OK** goes back to the **Log in** form, and on the other device the character disappears.

## Results

| Device | Browser | 1. Sideways | 2. Windows | 3. Sword | 4. Select, attack | 5. Combo | 6. Critical, miss | 7. Being hit | 8. Level up | 9. Stat points | 10. Dying | 11. fps in a fight | 12. Log out | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | | | | | | |
| Android phone | Chrome | | | | | | | | | | | | | |
| iPad | Safari | | | | | | | | | | | | | |
| Android tablet | Chrome | | | | | | | | | | | | | |
| PC | Chrome | | | | | | | | | | | | | |

## Pass and fail

Milestone 1 passes when:
- `npm run test:live:world` passed in the VM;
- every cell of steps 1-10 and 12 is `pass` on every device;
- the weakest device keeps **at least 30 fps** in step 11.

If it misses, write down by how much. Any `errors:` line you cannot explain is a fail too, and so is a `mismatched` number above 0: send a photo of the overlay. Milestone 2 (skills) starts after you say milestone 1 works.

**Look closely at these,** because the tests can't judge them:
- the critical banner's edges: they should be crisp, as in the Windows client, not blurred;
- whether a character turned the wrong way swings the right way;
- on an iPhone or iPad: that the world redraws after you turn the device, and that dragging inside a tall window scrolls it;
- that the attack button and the joystick are easy to reach. A window open over the joystick hides it until you move or close the window.

## When something goes wrong in a fight

| What you see | What it means and what to do |
| --- | --- |
| Tapping a monster walks to it instead of selecting it | The tap missed the monster's outline, for example on a giant's far corner. Tap the middle of it. |
| The character swings but no number shows, and the overlay counts nothing | The server answered nothing. Run the live world test: "no DAMAGE within 3 s" there says the same. Check that the world server in the VM is the patched one (Piece 3). |
| "Please wait a moment before attacking again." in the messages | The server thinks the browser swings faster than the character can. Send a photo of the Character window (its attack speed) and the messages. |
| "You cannot attack a monster that is fighting against another player." | Normal when another player hit that monster first: pick another. |
| The Job line in the Character window is empty, or the counts show on a sword in the task bar | `dist/assets` is older than this version: run `npm run convert -- --only data` (see "Before you start") and copy it to the VM again. |
| No sparks, banners or level-up light, but the fight works | The effects were not converted: run `npm run convert -- --only effects,ui,data`. The overlay's `errors:` line names a missing effect. |
| The task bar, Start menu or windows are plain grey boxes | The window pictures were not converted: as above. |
| The cover stays up although the device is sideways | The page is still taller than wide, for example a split screen or a small browser window. Make it wider, or turn off the split screen. |

# Piece 4, milestone 2: skills

For the owner. Milestone 2 gives the Vagrant its skills, as in the Windows client:
- the skill window (`K`, or **Skills** in the Start menu), to spend skill points on Clean Hit, Flurry and Over Cut;
- skills on the task bar and in the action slot, placed with the mouse or a finger;
- using a skill from its slot, and the action slot's chain of skills with `C`, each with its motion and effect, which the other device sees too.

It also brings the two things you asked for after milestone 1:
- **phones reach the game through your PC.** The client on your PC passes the game connection on to the VM, so a phone needs only your PC's address, whatever it is that day;
- **closing the page asks first** while you are in the world.

The automated side:
- `npm test` covers the skill rules, the skill window and the task bar's edits.
- `npm run test:e2e:client` now also plays skills against a pretend server (`skills.spec.ts`), in Chromium as a desktop and as a landscape Android phone.
- The live world test below also uses a skill on your real servers.

None of it needs Neuz.

## Before you start

1. **The game files.** `dist/assets` must hold a conversion made with this version. It adds the skills catalog and the warning box's picture. On your PC the piece4-combat folder already has it. Elsewhere, run this in PowerShell in that folder (about 20 seconds):

   ```
   npm run convert -- --only ui,data --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client"
   ```

   The `--client` part is needed: without it, the converter looks for the game's `Client` folder next to the piece4-combat folder, where there is none, and stops with "client folder not found".
2. **The VM.** Copy the FlyffWeb folder into the VM again, with its new `dist/assets`, as in [servers-in-a-vm.md](servers-in-a-vm.md), step 4:
   - keep your two settings files, `apps\client\test\live.config.json` and `apps\gateway\gateway.config.json`;
   - run `npm ci` again afterwards.
   
   Without the new `dist/assets`, entering the world says "The game files on the server are out of date."
3. **The client on your PC** starts differently now. Stop the old one with `Ctrl` + `C`, then, in PowerShell in the piece4-combat folder:

   ```
   $env:GATEWAY_PROXY = 'ws://<VM-IP>:8090'; npm run dev:client
   ```

   After you stop it, run `Remove-Item Env:GATEWAY_PROXY`. If that window still has the old `VITE_GATEWAY_URL` from milestone 1, the client refuses to start and says so: run `Remove-Item Env:VITE_GATEWAY_URL` and start it again. Details are in [servers-in-a-vm.md](servers-in-a-vm.md), step 6.
4. **The characters.**
   - The live test's first account: a Vagrant of level 1 to 14, standing at Flaris's lodestar, still carrying its starter food. The skill part needs level 3 or higher: with a lower level it is skipped with one sentence, and the rest still runs.
   - For the steps below you need level 3 for Clean Hit, level 5 for Flurry and level 10 for Over Cut. Levelling up takes playing time: Aibatts give less as you rise, so move on to stronger monsters. Steps that need Flurry or Over Cut can wait until your character gets there (see "Pass and fail").

## Run the live world test first

In the VM:

```
npm run test:live:world
```

Success: no `failed`, **and no line saying `Live world test skipped`**. That line means nothing was tested, most often because `appsclient	estlive.config.json` doesn't exist yet: make it from `live.config.example.json` and put your two test accounts in its `world` section, as [servers-in-a-vm.md](servers-in-a-vm.md), step 5, says. Besides the milestone 1 checks, when the first account's character is level 3 or higher it now:
1. spends a skill point on Clean Hit, if it has one left (otherwise it says it skipped that);
2. puts Clean Hit on the first bar's slot `F4`, replacing whatever was there;
3. walks out to a small Aibatt and uses Clean Hit on it;
4. checks that the server answered: the new skill level, the skill's use, and its damage.

As before, if it stops with the character outside the town, the message says so: walk the character back to the lodestar in the browser before the next run. Wait at least 15 seconds between runs.

## Start the gateway and the client

The gateway in the VM as before (`npm run gateway`), and the client on your PC as in "Before you start", item 3. Open `http://localhost:5174` on your PC and `http://<PC-IP>:5174` on phones and tablets, with the address, not the PC's name.

**New keys** (the milestone 1 keys still work):

| Key | What it does |
| --- | --- |
| `K` | Opens and closes the skill window. With points placed and not finished, closing asks first. |
| `F1`-`F9` | Use the slot's skill on the current bar. From Piece 4 a slot's skill is used and items are used from Piece 5: a slot that holds an item (the starter food) is greyed and does nothing when pressed or tapped |
| `C` | Starts the action slot's chain |
| `Escape` | Also closes the skill window, without asking |

**Placing skills:**
- **With a mouse:** drag a skill from the skill window onto a slot of the bar, or onto the action slot (the row of small slots next to the bar). Double-clicking a skill adds it to the action slot. To take one off, drag it off the bar, or right-click it.
- **With a finger:** tap a skill in the window, then tap a slot. To take one off, hold your finger on the slot until a **Remove** line shows, then tap it.

## Steps, two devices at a time

As in milestone 1: pair the devices, one test account each, and keep an eye on the overlay. Its `errors:` line must stay empty, and `mismatched` must stay 0. Browsers as in milestone 1: any browser on iPhone and iPad, Chrome on Android, and Chrome on the PC. Then do steps 3, 4 and 10 once more in **Firefox** and write the result in the Notes column of the PC row.

1. **The phone reaches the game.** On a phone, log in and enter the world. Success: no "Cannot reach the game gateway.", which is what milestone 1 showed.
2. **The skill window.** Press `K`, or tap **Start**, then **Skills**. Success:
   - the window shows Clean Hit, Flurry and Over Cut with their icons, their levels and your Skill Points;
   - holding the pointer on a skill, or tapping it, shows its name, its level and what it costs (Clean Hit: "FP : 5");
   - for a skill you can't raise yet, the tooltip shows in red what it still needs (the character's level, or the skill before it);
   - on a phone, the window may be cut off above the task bar: drag inside it to scroll.
3. **Spending a point** (level 3 or higher). Choose Clean Hit and press **+**. Success: its level and the points change in the window only, and **Reset** puts them back. Press **+** again, then **Finish**. A box with a warning picture asks first; press **Yes**. Success: Clean Hit's level rises and the Skill Points go down. Also check:
   - with points placed but not finished, closing the window asks first;
   - `Escape` closes it without asking;
   - on a phone, **+** and **−** are easy to hit with a finger.
4. **Clean Hit on the bar.** Put Clean Hit on slot `F4` (see "Placing skills"). Success: its icon shows on the slot. Log out and in again. Success: it is still there, because the server keeps the bar.
5. **Using Clean Hit.** Select an Aibatt, then press `F4` or tap the slot. Success:
   - the character walks up to it and swings with the skill's own motion;
   - the skill's effect shows in front of the character, then the damage number;
   - your FP goes down by 5;
   - the other device sees the same swing and the effect.

   On a touch screen, a second tap within about a second of the first is ignored when the character arrives. The Windows client does the same.
6. **A slot is used, not replaced.** On a phone, select an Aibatt, tap a skill in the window, press **+** or **Finish**, then tap the slot that holds Clean Hit (step 4). Success: Clean Hit is used, as in step 5, and the slot still holds Clean Hit: the skill you tapped in the window did not replace it. A slot that holds an item (the starter food) does nothing when you tap it, because items are used from Piece 5: that is not a fail. Then tap the ground just above the bar. Success: the character walks there, and no slot is pressed.
7. **The action slot's chain.** Flurry needs level 5 and Clean Hit at level 3; Over Cut needs level 10 and Flurry at level 3. Put Clean Hit, then Flurry, then Over Cut in the action slot. Success:
   - Flurry can't go first, and nothing goes after Over Cut;
   - with an Aibatt selected, `C` (or the action slot's button) plays the skills one after another, each with its effect;
   - a click or tap in the world during the chain stops it.
8. **Not enough FP.** Use skills until your FP runs out. Success: "Not enough FP." shows in the messages, the character plays nothing for that skill, and the game goes on.
9. **Taking skills off.** Take Clean Hit off the bar and a skill out of the action slot (see "Placing skills"). Success: the slots are empty, and they stay empty after you log in again.
10. **Closing the page asks first.**
    - **PC**, in the world: close the tab. Success: the browser asks whether to leave ("Leave site?" in Chrome). **Cancel** keeps you in the game. After **Log out**, closing the tab doesn't ask.
    - **Android**: reloading the page in the world asks. Closing the tab from the tab list, or swiping Chrome away, doesn't. That is how Android works, not a fault.
    - **iPhone and iPad**: no question at all. Safari doesn't allow it, so write "n/a".

## Results

| Device | Browser | 1. Phone reaches the game | 2. Skill window | 3. Spending | 4. On the bar | 5. Clean Hit | 6. Used, not replaced | 7. Chain | 8. Not enough FP | 9. Taking off | 10. Closing asks | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | | | | |
| Android phone | Chrome | | | | | | | | | | | |
| iPad | Safari | | | | | | | | | | | |
| Android tablet | Chrome | | | | | | | | | | | |
| PC | Chrome | | | | | | | | | | | |

(Step 1 is for the phones and tablets: write "n/a" for the PC.)

## Pass and fail

Milestone 2 passes when:
- `npm run test:live:world` passed in the VM, with the skill part run, not skipped (a character of level 3 or higher);
- every cell of steps 1-6 and 8-10 is `pass` on every device (or "n/a" where the step says so);
- step 7 passes with Clean Hit and Flurry. Over Cut can be checked later, when a character reaches level 10;
- the full tests below pass.

Any `errors:` line you cannot explain is a fail too, and so is a `mismatched` number above 0: send a photo of the overlay.

**Look closely at these,** because the tests can't judge them:
- the skill effects: in front of the character, facing the monster, as in the Windows client;
- the skill window's look next to the Windows client's;
- on an iPhone or iPad: that holding a finger on a slot shows the **Remove** line, and no copy or select bubble.

## The full tests (yours to run)

From milestone 2 on, the builders run only the quick checks. The long test runs are yours, on your PC, in PowerShell in the piece4-combat folder. Run them one at a time, while you don't use the PC for anything heavy.

| Command | How long | Success |
| --- | --- | --- |
| `npm test` | about 2 minutes | It ends with `Test Files … passed` and no `failed`. |
| `npm run typecheck` | about 1 minute | No lines with `error`. |
| `npm run test:e2e:client` | about 30 minutes | Stop your own `npm run dev:client` first: this test starts its own client on the same port (5174). It ends with `… passed`, maybe a few `skipped`, and no `failed`. |
| `npm run test:e2e` | about 5 minutes | The viewer's tests. No `failed`. |
| `$env:FLYFF_CLIENT = 'C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client'; npm run test:corpus` | about 10 minutes | The tests that read the real game files. No `failed`. Run `Remove-Item Env:FLYFF_CLIENT` afterwards. |

If one fails, send me the lines from the first `failed` (or `error`) down to the end, or a photo of them.

## When something goes wrong with skills

| What you see | What it means and what to do |
| --- | --- |
| "The game files on the server are out of date." when you enter | `dist/assets` has no skills catalog: run `npm run convert -- --only ui,data --client "C:\Users\silec\Desktop\FlyFF\Bakbak\Blouflash VS22 V15\Client"` in the piece4-combat folder, and copy `dist/assets` to the VM again. |
| The skill window has no icons, or its box no picture, and the overlay's `errors:` line names a picture | The pictures were not converted: as above. |
| Pressing a skill's slot does nothing | Is the skill at level 0? Spend a point on it first. A skill whose FP you don't have says "Not enough FP.". A slot that holds an item does nothing until Piece 5. |
| **+** stays greyed | You have no Skill Points, the skill is at its top level, or its condition isn't met. The skill's tooltip shows the unmet condition in red: the character's level, or the skill it needs first. |
| A phone says "Cannot reach the game gateway." | The client was not started with `GATEWAY_PROXY` ("Before you start", item 3), or the page was opened with the PC's name instead of its address. See [servers-in-a-vm.md](servers-in-a-vm.md), "When something goes wrong". |
| The client doesn't start and prints `Error: GATEWAY_PROXY …` | That line says what is wrong: usually `VITE_GATEWAY_URL` is still set in that window (`Remove-Item Env:VITE_GATEWAY_URL`). |

## Piece 5 M4 — classic V15 navigation and travel

Run on PC and on iPhone/Android landscape:

- Navigator opens at the top right; N and Start > Navigator toggle it. The original square map, title, zoom buttons and marker art are visible.
- Zoom remains centered on the player. NPC/player/monster filter toggles affect known markers. Rotating the camera turns the viewing arrow.
- Tapping Navigator places a temporary navigation mark and does not walk or attack. Joystick and camera controls still work outside it.
- Indoor worlds show native Navigator dungeon fog. Return to an outdoor map restores terrain artwork and markers.
- Click a nearby resource teleporter, choose Teleporter, and select a native map marker. Verify the server moves the character; a refused request must not move the client locally. Leaving NPC range prevents stale selections.
- Travel to another supported world and back without reconnecting. Verify one HUD/taskbar, retained chat history, authoritative inventory, working controls and no old-world NPCs or duplicate input handlers.
- Confirm mobile toolbar buttons leave room for Navigator and the teleporter selector fits above the taskbar. Chat remains aligned while typing and after sending.

Record device/browser, destination, pass/fail, and any screenshot for each failure. The general M-key world map remains a later piece.

## Mobile UI audit follow-up — 2026-11-02

Automated findings, fixes and exact evidence are in [the mobile UI audit](2026-11-01-mobile-ui-audit.md). Physical checks remain open:

- [ ] Confirm passive chat lets the joystick start, Chat enables scrolling, and Send/outside touch releases keyboard focus.
- [ ] Confirm typing does not hide touch controls or shrink the Start menu; login never requests fullscreen.
- [ ] Check Jump/Attack below Navigator and above the composer with actual safe-area insets; test second-finger Jump while steering.
- [ ] Rotate with Character/Skill open; check centering, close buttons, Bag/Shop footers and item/drop/shop quantity controls above the taskbar.
- [ ] Repeat on Android Chrome and iPhone Safari, including the real software keyboard. Record device/OS/browser versions and failures.

## Piece 6, milestone 0: a target behind a wall

Before this fix, auto-attacking a monster on the other side of a fence or wall disconnected you with "Too much data was sent." after about a second. The character now keeps nudging at the obstacle, as in the Windows client, but asks the server at most 10 times a second.

**What the test character needs:** any character that can attack. For step 3, a Vagrant of level 3 or higher with Clean Hit on the bar.

**Start the client** from the piece6 folder, with the gateway running in the VM as before. In PowerShell on the PC (put in the VM's address; it was 192.168.100.141 last time):

```
cd C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece6
$env:GATEWAY_PROXY = 'ws://<VM-IP>:8090'
npm run dev:client
```

Open `http://localhost:5174` on the PC and `http://<PC-IP>:5174` on the phone.

**Steps**, on the phone and on the PC:

1. **Auto-attack across an obstacle.** Find a monster on the other side of a fence, a wall or a building corner, so that walking straight at it runs into the obstacle. Select it, then press the attack button (phone) or click it again (PC). Success: the character walks into the obstacle and keeps nudging at it; after 30 seconds you are still in the game, and "Too much data was sent." never shows.
2. **Around the obstacle.** With the auto-attack still on, walk around the obstacle with the joystick or the keys, then select the monster and attack again. Success: once the way is clear, the character reaches the monster and fights it.
3. **A skill across an obstacle.** Tap the ground first, to turn the auto-attack off. Select a monster behind the obstacle again and use Clean Hit from the bar. Success: the character bumps into the obstacle once and stops, and you stay in the game. (If the monster is close enough for the skill's reach through the obstacle, "This action has been blocked by an obstacle.." shows instead: that is the Windows client's rule too, and also a pass.)
4. **A skill during the auto-attack.** Turn the auto-attack on again against the monster behind the obstacle and, while the character nudges at it, use Clean Hit. Success: within a moment the skill walks up (or shows the "blocked by an obstacle" line), and then the character goes back to nudging. It must not stand still with nothing happening.
5. **Sliding past the end of an obstacle.** Stand so that a monster is diagonally past the end of a fence or a building corner, so that the straight line to it scrapes along the obstacle. Turn the auto-attack on. Success: the character slides along the obstacle at about normal walking speed, rounds its end and attacks, and you stay in the game. Write in Notes roughly how many seconds it took.

## Results

| Device | Browser | 1. Auto-attack across | 2. Around it | 3. Skill across | 4. Skill during auto-attack | 5. Sliding past | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Phone | | | | | | | |
| PC | Chrome | | | | | | |

## Pass and fail

Milestone 0 passes when every cell above is `pass`, and the browser tests below pass. If you are disconnected, write down the message and how long it took, and send a photo of the overlay.

**The browser tests (yours to run),** on the PC in PowerShell in the piece6 folder, with your own `npm run dev:client` stopped first (the tests start their own on port 5174):

| Command | How long | Success |
| --- | --- | --- |
| `npm run test:e2e:client -- fight.spec.ts skills.spec.ts` | about 15-25 minutes | It ends with `… passed`, maybe a few `skipped`, and no `failed`. |

If it fails, send me the lines from the first `failed` down to the end.

# Device testing and comparison with the Windows client

For the owner. This file has two parts. The first is Piece 1, the viewer. The second, at the end, is [Piece 2: lobby](#piece-2-lobby), the login, channel and character screens.

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

The automated side is `npm test` (including the gateway tests) and `npm run test:e2e:client` (the lobby in Chromium and in WebKit as an iPhone, against pretend servers). What they cannot tell you is whether a real phone, over real Wi-Fi, gets through your real servers. That is this checklist.

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

The automated side is `npm test`, `npm run test:e2e:client` (the world against pretend servers, in Chromium and WebKit) and the live world test below. None of it needs Neuz, and nothing here asks you to run Neuz next to the servers.

## Before you start

**Servers in a Hyper-V virtual machine?** Set the VM up with [servers-in-a-vm.md](servers-in-a-vm.md) first. Then everything below that touches the servers happens in the VM (the server swap, the gateway and the live world test), and the client on your PC is started with the VM's gateway address, as that guide's step 6 says.

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

As in the Piece 2 part ("Start the gateway and the client"): `npm run gateway` in one window, `npm run dev:client` in another, and the phone's address in `allowedOrigins`. Then, on the PC first, open `http://localhost:5174`, log in, pick a channel and tap **Enter** on a character: after "Entering the world…" (which has a **Leave** button too, to give up) you should see the character from behind, in the world, with the **Leave** button at the top right and the overlay at the top left. If that fails, fix it on the PC, not on a phone (see "When something goes wrong" below).

**Moving:** on a touch screen, the joystick at the bottom left (a push walks, a full push runs); on a keyboard, `W` / `S` or the up and down arrows walk forward and back, `A` / `D` or the left and right arrows turn, and holding `Shift` runs.

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
9. **Taps that do nothing.** Tap another player, a monster or a shopkeeper. Success: nothing happens (choosing a target comes with Piece 4). Tap the trunk of a tree or a fence: the character walks to the ground behind it, as in the Windows client, where only some objects can be tapped.

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

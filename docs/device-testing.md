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

**One known point to watch: the sun.** The client lights terrain and models with the sun direction it uses at noon, and the viewer copies that exactly (ruling R50; the code and the C++ it follows are in `apps/viewer/src/world/lighting.ts`). The client's noon sun is the D3D light `Direction = (0, +0.707, -0.707)`. A D3D `Direction` is the way the light travels, so this light travels **upward** (and toward -z). The vector D3D lights a surface with, from the surface toward the light, is `L = -Direction = (0, -0.707, +0.707)`, which points **down**, and the viewer uses exactly that (in its own frame, where z is negated: `(0, -0.707, -0.707)` toward the sun). So at noon the client lights surfaces from below and from the north: a face reacts to the sun only when its normal points more toward north than up (in D3D numbers, `n.z > n.y`). That is north-facing walls (facing higher z) and undersides. Flat ground (normal up) and east-, west- and south-facing walls get the ambient light alone. The `flaris-plaza` spot faces south, so the walls in front of you there face north: those are the ones the sun lights. (In `flaris-plaza-east` you look at west-facing walls, which stay at the ambient light.) If shading in the comparison looks **inverted** (faces that are bright in the client are dark in the viewer, or the other way round), say so: the sun direction is the first thing to check. "Flip" then means switching to the lit-from-above convention that the client's own continent branch (`__BS_CHANGING_ENVIR`, World3D.cpp:1822-1824) uses, `SetDir(-(0, 0.707, 0.707))`, i.e. `L = (0, +0.707, +0.707)`. In the viewer that is two small edits: the sign of the y component of `towardSun` in `lighting.ts`, and the expectation that pins it, `light.sunDirection[1]` in `apps/viewer/test/player.test.ts` (line 152).

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

3. Fill in `account`, `password` and `bankPin`: a **throwaway test account** with at least one empty character slot. The test creates a character named `WebTest` and three digits with that Bank PIN, then deletes it. The long `_comment` at the top of the file explains every setting. Leave the others as they are, except:
   - `certifierPatched`: set to `true` only when the rebuilt `Certifier.exe` is running and `Certifier.ini` has the `Gateway "127.0.0.1"` line (see [server-patches/README.md](../server-patches/README.md)). That switches on the check that one player's wrong password does not block another player.
   - `bannedTestAddress`: leave `null`, unless you added an address to `Program\IPCut.ini` and restarted the account server.
4. Run it:

   ```
   npm run test:live
   ```

   Success: it ends with a line like `Tests  3 passed | 2 skipped (5)` and no `failed`. Tests for settings you left off show as `skipped`; that is fine. With both settings on, all 5 pass. A failure prints what it expected and what happened, with a hint about the usual cause.

The test uses port 8091 for its own gateway, so it does not matter whether `npm run gateway` is running. Wait at least **15 seconds between runs**, and do not run it in a loop: it sends a wrong password on purpose, and the servers' connection limiter never forgets (see "When something goes wrong" below).

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
6. **Wrong password, once.** Tap **Log out**, then log in with the right account and a **wrong** password. Success: you stay on the login form and a red message appears, for example "Login details incorrect.  Please try again." Then **wait 15 seconds** and log in with the right password: it must work. Do not try more than one wrong password in a row: three wrong passwords block that address for 15 minutes.
   - With the old certifier, the 15 seconds block **every** browser device (they all look like one address to it), so do this step on one device at a time.
   - With the rebuilt certifier, only this device is blocked. To check that: during the 15 seconds after a wrong password on one device, log in on another device with the right password. It must work.
7. **Two devices at the same time.** Use two devices and two different test accounts, one each. Log in on both at the same time, pick a channel on both, and get both to **Your characters**; then create a character on one while the other stays open. Success: both work, and the gateway window shows an `open` line for each device with **its own address** (for example `open 192.168.1.31 172.31.238.55:23000` and `open 192.168.1.47 172.31.238.55:23000`).
   - Optional: log in with the **same** account on both. The second device may show **Already connected** with **Disconnect it** and **Cancel**. That is the server's own question, not a fault. Tap **Disconnect it**, then log in again.

## Results

Fill in one row per device, `pass` or `fail`. The last column is for anything odd you saw, and for the exact text of a red message.

| Device | Browser | 1. Layout | 2. Log in, channels | 3. Characters | 4. Create | 5. Delete | 6. Wrong password | 7. Two at once | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | | | | |
| Android phone | Chrome | | | | | | | | |
| iPad | Safari | | | | | | | | |
| Android tablet | Chrome | | | | | | | | |
| PC | Chrome | | | | | | | | |

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
| **"Cannot reach the game gateway."** when you log in | The page cannot talk to the gateway. Check, in this order: (1) `npm run gateway` is running and printed `gateway listening`; (2) the address in the phone's address bar, `http://<address>:5174`, is **exactly** in `allowedOrigins` in `apps/gateway/gateway.config.json` (then restart the gateway: it reads the file once, when it starts); (3) Windows Firewall lets Node.js through on Private networks, for port 8090 as well. A clue: when you tap **Log in** the gateway window should print an `open` line. If it prints nothing, the request never got in: the origin, the firewall or the address is wrong. |
| **"This server address is not allowed."** | The address the servers hand out is not a key under `routes` in the gateway settings. The example has the three routes for `172.31.238.55`; change them if your servers advertise another address. |
| **"The game server is not reachable. Try again later."** | The gateway is running but cannot reach the certifier or the login server. Are the game servers running? The gateway window shows `close ... code=4001` for it. |
| **"Too many connections from your network."** | The gateway allows 8 open connections from one address. Close other tabs of the page on that device, wait a few seconds, and reload. |
| **"Wrong Password. Cannot log into account for 15 seconds."** | The certifier's lockout after a wrong password: wait 15 seconds. After three wrong passwords in a row it is 15 minutes, with "Wrong Passwords 3 times. Cannot log into account for 15 minutes." |
| **"Already connected"** | The account is logged in somewhere else, or its last session is still closing. Tap **Disconnect it** and log in again, or use another test account. |
| **Every login fails at once, on every device, and it lasts about 10 minutes** | The game servers' own connection-flood limiter (in the certifier and the login server). It counts connections from one address that come less than 200 milliseconds apart, and never forgets them. After 50, it cuts every connection from that address and refuses it for about 10 minutes. With the gateway, all browser players share the gateway's address. Repeated quick logins, and repeated `npm run test:live` runs, add up. **Wait about 10 minutes**, or restart the certifier and the login server. This is a known limit that must be fixed in the servers before a public launch: see [hosting.md](hosting.md#known-limit-before-a-public-launch). |

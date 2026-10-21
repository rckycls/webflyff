# Device testing and comparison with the Windows client

For the owner. Three jobs, none of which the automated tests can do for you:

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

## 1. Reference screenshots from the Windows client

The compare page is `http://localhost:5173/#/compare`. It lists four spots. Opening one shows the viewer standing on that spot next to your screenshot of the same view in the Windows client (one above the other on a narrow screen). A spot without a screenshot says `no screenshot yet: put apps/viewer/compare/refs/<spot>.png here`.

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

**One known point to watch: the sun.** The client lights terrain and models with the sun direction it uses at noon, and the viewer copies that exactly (ruling R50; the code and the C++ it follows are in `apps/viewer/src/world/lighting.ts`). The client's noon sun is the D3D light `Direction = (0, +0.707, -0.707)`, which shines downward; the vector D3D lights a surface with is `L = -Direction = (0, -0.707, +0.707)`, pointing down, and the viewer uses exactly that (in its own frame, where z is negated: `(0, -0.707, -0.707)` toward the sun). So at noon the sun is below the horizon for the lighting: flat ground gets the ambient light alone and only slopes and walls react to the sun. If shading in the comparison looks **inverted** (faces that are bright in the client are dark in the viewer, or the other way round), say so: the sun direction is the first thing to check. "Flip" then means switching to the lit-from-above convention that the client's own continent branch (`__BS_CHANGING_ENVIR`, World3D.cpp:1822-1824) uses, `SetDir(-(0, 0.707, 0.707))`, i.e. `L = (0, +0.707, +0.707)`: in `lighting.ts` that is the sign of the y component of `towardSun`, a one-line change.

### After you approve the comparisons

The pictures the viewer is checked against are the Playwright baselines in `apps/viewer/e2e/__screenshots__/`. They exist for all four spots (`character.spec.ts/character-male-default.png`, `world.spec.ts/world-flaris-start.png` for `world-start`, `world-flaris-plaza.png`, `world-flaris-plaza-east.png`), but they were rendered by the viewer itself, not approved by anyone. Once you are happy with the comparisons, make them the approved baselines:

```
npx playwright test -c apps/viewer/playwright.config.ts --project=dev --update-snapshots
```

and commit the changed pictures (and your `compare/refs/*.png`).

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

The `gpu (est)` number is the same on every browser and does not depend on any flag: it is the number to compare devices by, and to use for the 10% check. Add the real heap to it when you have one.

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

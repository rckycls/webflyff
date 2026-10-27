# Running the servers in a Hyper-V virtual machine

For the owner. This guide moves the game servers and the gateway into a Hyper-V virtual machine (VM), while the web client keeps running on your PC. Phones and tablets load the page from your PC and play through your PC too: the client forwards the game connection to the gateway in the VM.

```
phone or PC browser --page and game (port 5174)----> your PC: npm run dev:client (and dist/assets)
                                                     your PC --game (port 8090)----> the VM: the gateway --> the 7 game servers (all at 127.0.0.1)
```

A phone talks only to your PC, which it already reaches (the page loads from it). The gateway always sees one page address, `http://localhost:5174`, whichever address the phone used, so a new address for your PC breaks nothing.

**Nothing needs rebuilding.** The servers are ordinary Windows programs and run in a Windows VM as they are. You rebuild only after changing their code in `Source\`.

**Everything that talks to the servers runs in the VM:** the 7 servers, the gateway and the live tests. The servers' own settings files point at each other as `127.0.0.1` ("this same machine"), and the gateway connects to them the same way, so all of that stays as it is.

A VM on the same laptop still uses the laptop's processor and memory, so it does not make the laptop run cooler. On another, stronger PC it does help.

Names used below:

| In this guide | Means |
| --- | --- |
| `<VM-IP>` | The VM's address on your Wi-Fi network (step 2), for example `192.168.1.50`. |
| `<PC-IP>` | Your PC's Wi-Fi address (`ipconfig` on the PC, the **IPv4 Address** of the Wi-Fi adapter), for example `192.168.1.20`. |

## 1. Make the VM

Hyper-V comes with Windows 10 and 11 Pro; once it is turned on, **Hyper-V Manager** is in the Start menu. The sizes below fit a laptop with 16 GB of memory and about 90 GB of free disk space.

1. **Get Windows Server from Microsoft.** Download the free evaluation of Windows Server 2019 from the [Microsoft Evaluation Center](https://www.microsoft.com/en-us/evalcenter/download-windows-server-2019): under **English (United States)**, **ISO downloads**, **64-bit edition**. It asks for your name and email, then downloads one file of about 5 GB. The evaluation runs for 180 days, enough for testing; a VPS later comes with its own Windows licence. Don't use a copy of Windows from a torrent or another site: this VM will hold your game database and your accounts' passwords.
2. **Make the network switch.** The VM needs its own address on your Wi-Fi network, not a private one behind your PC, so that it keeps an address you can fix (step 2) and your PC reaches it the same way every time. In **Hyper-V Manager**, open **Virtual Switch Manager**, choose **New virtual network switch**, **External**, and pick your PC's Wi-Fi adapter (or its network cable, which is more reliable). Keep **Allow management operating system to share this network adapter** ticked, so your PC stays online. Your PC's internet can drop for a few seconds while the switch is made.
3. **Create the VM:** **Action > New > Virtual Machine**, then:
   - **Name:** `FlyFF-Server`.
   - **Generation:** **Generation 2**.
   - **Memory:** `4096` MB, with **Use Dynamic Memory for this virtual machine** unticked. That is enough for SQL Server and the 7 servers, and leaves the rest to your PC.
   - **Networking:** the switch from item 2.
   - **Hard disk:** **Create a virtual hard disk** of `40` GB. The file starts small and grows only as Windows fills it.
   - **Installation options:** **Install an operating system from a bootable image file**, and pick the file from item 1.
   - **Finish.**

   A VM you made before needs only its network: in its **Settings**, set its **Network Adapter** to the switch from item 2.
4. **Two settings before the first start,** in the VM's **Settings**: **Processor**, `4` virtual processors; **Checkpoints**, untick **Use automatic checkpoints** (otherwise every start of the VM keeps another copy of its changes, which fills the 40 GB).
5. **Install Windows.**
   - Select the VM, **Connect**, then **Start**, and press a key as soon as it says "Press any key to boot from CD or DVD". If you miss it and get a screen saying no operating system was loaded, use **Action > Reset** and press a key in time.
   - Choose **Windows Server 2019 Standard Evaluation (Desktop Experience)**. The one without "(Desktop Experience)" has no desktop, only a command line.
   - Choose **Custom: Install Windows only**, pick the disk, **Next**.
   - Choose the Administrator password yourself and keep it safe. To sign in, use the **Ctrl+Alt+Del** button on the VM window's toolbar: the keys on your keyboard go to your PC.
6. **Activate and update.** The evaluation must activate over the internet within 10 days, or it starts shutting itself down. It does that by itself once it is online; check it in **Settings > Update & Security > Activation**. Then run **Windows Update** once (**Settings > Update & Security > Windows Update**).
7. **Take a checkpoint** of the fresh Windows: **Action > Checkpoint**, and rename it "Clean install" in the **Checkpoints** list. Applying it later takes the VM back to this moment.

## 2. The VM's network

1. Start the VM and run `ipconfig` in it. The **IPv4 Address** is `<VM-IP>`: it must start like your PC's address (for example both `192.168.1.…`). If it starts with `172.` it is still on the private "Default Switch": set its **Network Adapter** to the switch from step 1 in its **Settings**.
2. In the VM, set the network to **Private** (Settings > Network & internet > the network > Private network), so Windows lets your PC in.
3. **Keep the address fixed.** If the router gives the VM a different address later, everything below that uses `<VM-IP>` must change too. Most routers can reserve an address for a device ("DHCP reservation"); do that for the VM if you can.

## 3. The game servers in the VM

1. **Copy two folders into the VM, side by side,** for example to `C:\FlyFF\Program` and `C:\FlyFF\Resource`: your `Program` and `Resource` folders. The world and database servers look for `..\Resource` next to `Program`.
2. **Install the Microsoft Visual C++ Redistributable for Visual Studio 2015-2022, x86** (the 32-bit one, from Microsoft's site). The servers are 32-bit programs and use it. The DirectX file the world server needs, `d3dx9_43.dll`, is already in `Program`.
3. **The database.** Install SQL Server (Express is enough, as on your PC) and restore your game databases into it: in SQL Server Management Studio on your PC, back up each database (right-click the database > Tasks > Back Up), copy the `.bak` files into the VM, and restore them there (right-click Databases > Restore Database). Restore the database logins the servers use too.
4. **The three database connections.** The servers connect to SQL Server through ODBC data sources with fixed names: `login`, `character01` and `log01` (the `DSN_NAME_…` lines in `AccountServer.ini` and `DatabaseServer.ini`; the certifier uses `login` too). Create them in the VM as **System DSN** with the **32-bit** ODBC tool, `C:\Windows\SysWOW64\odbcad32.exe`. The ordinary "ODBC Data Sources" in the Start menu is the 64-bit one, and 32-bit programs never see what it makes. Give each the same driver, server and default database as on your current setup. On your current PC, open the same 32-bit tool to see them.
5. **The new world and cache servers.** Do the swap from [server-patches/README.md](../server-patches/README.md) ("Put them in service": the world server and the cache server) in the VM's `Program` folder: copy the new `WorldServer.exe` and `CacheServer.exe` from `Output\` on your PC into it, and add the `Gateway "127.0.0.1"` line to the VM's `CacheServer.ini`. `127.0.0.1` is right, because the gateway runs in the VM too.
6. **Start the servers** in their usual order, `1. Account.exe` to `7. World.exe`. Then look in the error log in `Program` (a file named like `error_20261023.txt`): a line about a failed connection to the database means a data source from item 4 is missing or wrong.

## 4. The gateway in the VM

1. **Install Node.js** v24 or newer (the LTS version) in the VM, from nodejs.org.
2. **Copy the FlyffWeb folder into the VM,** for example to `C:\FlyFF\FlyffWeb`. Use the folder of the piece you are testing. On your PC that is `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece4-combat` for Piece 4, and `...\piece3-world` for Piece 3.
   - Leave out its `node_modules` folder; the next step makes it again.
   - Keep `dist\assets` (about 1 GB): the live world test reads it.
   - **Copy it again after every update of the code, with `dist\assets` too.** Piece 4 changed the game data (new fields in the catalogs) and added the effects and the window pictures. An old `dist\assets` makes the live test fail with "out of date".
   - **Keep your two settings files when you copy a newer version over the old one:** `apps\client\test\live.config.json` and `apps\gateway\gateway.config.json` exist only in the VM's copy. Copy them aside first and put them back afterwards, or copy the new folder over the old one without deleting it first.
   - After copying a new version, run `npm ci` again (next step).
3. **Install the packages,** in PowerShell in the VM:

   ```
   cd C:\FlyFF\FlyffWeb
   npm ci
   ```

4. **The gateway's settings.** Make the file from the example and open it:

   ```
   Copy-Item apps\gateway\gateway.config.example.json apps\gateway\gateway.config.json
   notepad apps\gateway\gateway.config.json
   ```

   - Keep `"listen": { "host": "0.0.0.0", "port": 8090 }`, so your PC can reach it.
   - Set `"allowedOrigins": ["http://localhost:5174"]`, the only page address the gateway will see: your PC's client forwards the game connection (step 6) and always gives that as its origin, whatever address the browser or phone used for the page. The example already lists it first. Any other address in the list does no harm, so you can leave it. The gateway refuses a page whose address is not listed exactly.
   - Keep the three `routes` to `127.0.0.1`.
5. **Let your PC in.** In PowerShell **as administrator** in the VM:

   ```
   New-NetFirewallRule -DisplayName "FlyffWeb gateway" -Direction Inbound -Protocol TCP -LocalPort 8090 -Action Allow -Profile Private
   ```

6. **Start it:** `npm run gateway`. Success: it prints `gateway listening on ws://0.0.0.0:8090` and stays running, with one line for each connection.

## 5. The live tests run in the VM

The live tests start their own gateway and expect the servers on the same machine, so run them in the VM, in `C:\FlyFF\FlyffWeb`: make `apps\client\test\live.config.json` from `live.config.example.json` as the checklists in [device-testing.md](device-testing.md) say (for this milestone, the `world` section with two throwaway accounts), then `npm run test:live:world`. Its own gateway uses port 8091 inside the VM, so it does not clash with the one from step 4.

From Piece 4 on, the world test also fights. Its first account walks out of Flaris's north gate and kills a small Aibatt, so that account's character must meet three conditions:
- new or low level (a Vagrant under level 15);
- still carrying its starter food;
- standing at Flaris's lodestar.

A new character fits all three. The checklist in [device-testing.md](device-testing.md) ("Piece 4, milestone 1") says what to do when a run stops with the character outside the town.

## 6. The client on your PC

On your PC, in PowerShell, in the FlyffWeb folder of the piece you are testing (`C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece4-combat` for Piece 4), tell the client where the gateway is, start it, and clear the setting again when you stop it:

```
$env:GATEWAY_PROXY = 'ws://<VM-IP>:8090'; npm run dev:client
Remove-Item Env:GATEWAY_PROXY
```

(Run the second line after you stop the client with `Ctrl` + `C`: the setting stays in that window otherwise.) Without it, the page looks for the gateway on your PC, where there is none, and says "Cannot reach the game gateway."

`GATEWAY_PROXY` is the only setting to use for this. `VITE_GATEWAY_URL` must not be set at the same time: the client then refuses to start and says so. An old PowerShell window may still have it; `Remove-Item Env:VITE_GATEWAY_URL` clears it. If `GATEWAY_PROXY` is not of the form `ws://<VM-IP>:8090`, the client refuses to start and says so too.

Then open `http://localhost:5174` on your PC, and `http://<PC-IP>:5174` on phones and tablets (the address, not the PC's name), as the checklists in [device-testing.md](device-testing.md) say. The page and the game connection both come from your PC. Your PC passes the game connection on to the VM, and only for a page that was opened from this client: any other page on your network is turned away before it reaches the gateway. So the VM's gateway window shows your PC's address for every device, phones included.

## When something goes wrong

| What you see | What it means and what to do |
| --- | --- |
| "Cannot reach the game gateway." on every device | Check, in this order: the client was started with `GATEWAY_PROXY` and the right `<VM-IP>` (step 6); the gateway is running in the VM (step 4); the VM's firewall rule for port 8090 exists and the VM's network is Private (steps 2 and 4). The client's window prints `ws proxy error` when your PC cannot reach the VM. In the VM's gateway window, a `refused <address> origin` line means `"http://localhost:5174"` is not in `allowedOrigins` (fix it and restart the gateway). No line at all means the connection never reached the VM. |
| The client does not start and prints `error when starting dev server:` with a line starting `Error: GATEWAY_PROXY …` | That line says what is wrong: the setting is not of the form `ws://<VM-IP>:8090`, or `VITE_GATEWAY_URL` is set too (step 6). |
| It works on the PC but "Cannot reach the game gateway." on a phone | A phone takes the same way as the PC's own browser: the page and the game both come from your PC. Open the page as `http://<PC-IP>:5174`, with the address and not the PC's name (the client turns away a game connection from a page opened by name), and reload it after restarting the client. If the page itself does not open, see "When something goes wrong" in [device-testing.md](device-testing.md). |
| It worked yesterday, not today | The VM got a new address from the router. Check `ipconfig` in the VM and restart the client with the new `<VM-IP>`. A DHCP reservation (step 2) stops this. Your PC's own address does not matter any more. |
| The servers' error log says they cannot connect to the database | A data source is missing, misspelt or made with the 64-bit tool (step 3, item 4), or SQL Server is not running in the VM. |
| "The game server is not reachable. Try again later." | The gateway in the VM cannot reach a server: are all 7 running in the VM? |
| The VM's error log has `GATEWAY_CLIENT_ADDR refused from <address>` | The gateway reached that server through an address other than `127.0.0.1`. That should not happen with the routes above; check that the routes in the VM's `gateway.config.json` say `127.0.0.1`. |

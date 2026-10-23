# Running the servers in a Hyper-V virtual machine

For the owner. This guide moves the game servers and the gateway into a Hyper-V virtual machine (VM), while the web client keeps running on your PC. Phones and tablets load the page from your PC and play through the gateway in the VM:

```
phone or PC browser --page (port 5174)----> your PC: npm run dev:client (and dist/assets)
                    --game (port 8090)----> the VM: the gateway --> the 7 game servers (all at 127.0.0.1)
```

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
2. **Make the network switch.** Phones must reach the VM directly, so the VM needs its own address on your Wi-Fi network, not a private one behind your PC. In **Hyper-V Manager**, open **Virtual Switch Manager**, choose **New virtual network switch**, **External**, and pick your PC's Wi-Fi adapter (or its network cable, which is more reliable). Keep **Allow management operating system to share this network adapter** ticked, so your PC stays online. Your PC's internet can drop for a few seconds while the switch is made.
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
2. In the VM, set the network to **Private** (Settings > Network & internet > the network > Private network), so Windows lets your devices in.
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
2. **Copy the FlyffWeb folder into the VM,** for example to `C:\FlyFF\FlyffWeb`: the folder with this milestone (on your PC, `C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece3-world`). Leave out its `node_modules` folder; the next step makes it again. Keep `dist\assets` (about 1 GB): the live world test reads it. Copy it again after every update of the code.
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

   - Keep `"listen": { "host": "0.0.0.0", "port": 8090 }`, so your devices can reach it.
   - Set `allowedOrigins` to the addresses of the **page**, which comes from your PC, not from the VM: `"allowedOrigins": ["http://localhost:5174", "http://<PC-IP>:5174"]`. The gateway refuses a page whose address is not listed exactly.
   - Keep the three `routes` to `127.0.0.1`.
5. **Let your devices in.** In PowerShell **as administrator** in the VM:

   ```
   New-NetFirewallRule -DisplayName "FlyffWeb gateway" -Direction Inbound -Protocol TCP -LocalPort 8090 -Action Allow -Profile Private
   ```

6. **Start it:** `npm run gateway`. Success: it prints `gateway listening on ws://0.0.0.0:8090` and stays running, with one line for each connection.

## 5. The live tests run in the VM

The live tests start their own gateway and expect the servers on the same machine, so run them in the VM, in `C:\FlyFF\FlyffWeb`: make `apps\client\test\live.config.json` from `live.config.example.json` as the checklists in [device-testing.md](device-testing.md) say (for this milestone, the `world` section with two throwaway accounts), then `npm run test:live:world`. Its own gateway uses port 8091 inside the VM, so it does not clash with the one from step 4.

## 6. The client on your PC

On your PC, in PowerShell, in the FlyffWeb folder (`C:\Users\silec\Desktop\FlyFF\Bakbak\FlyffWeb-worktrees\piece3-world`), tell the client where the gateway is, start it, and clear the setting again when you stop it:

```
$env:VITE_GATEWAY_URL = 'ws://<VM-IP>:8090'; npm run dev:client
Remove-Item Env:VITE_GATEWAY_URL
```

(Run the second line after you stop the client with `Ctrl` + `C`: the setting stays in that window otherwise.) Without it, the page looks for the gateway on your PC, where there is none, and says "Cannot reach the game gateway."

Then open `http://localhost:5174` on your PC, and `http://<PC-IP>:5174` on phones and tablets, as the checklists in [device-testing.md](device-testing.md) say. The page comes from your PC; the game connection goes straight to the VM.

## When something goes wrong

| What you see | What it means and what to do |
| --- | --- |
| "Cannot reach the game gateway." on every device | Check, in this order: the client was started with `VITE_GATEWAY_URL` and the right `<VM-IP>` (step 6); the gateway is running in the VM (step 4); the VM's firewall rule for port 8090 exists and the VM's network is Private (steps 2 and 4). In the VM's gateway window, a `refused <address> origin` line means the page's address is not in `allowedOrigins`. No line at all means the connection never reached the VM. |
| It works on the PC but "Cannot reach the game gateway." on a phone | The phone cannot reach the VM: it is on a guest Wi-Fi that keeps devices apart, or the VM is still on Hyper-V's private "Default Switch" (steps 1 and 2). Check that `<VM-IP>` starts like your PC's address. |
| It worked yesterday, not today | The VM or your PC got a new address from the router. Check `ipconfig` on both; restart the client with the new `<VM-IP>`, or change `allowedOrigins` in the VM and restart the gateway. A DHCP reservation (step 2) stops this. |
| The servers' error log says they cannot connect to the database | A data source is missing, misspelt or made with the 64-bit tool (step 3, item 4), or SQL Server is not running in the VM. |
| "The game server is not reachable. Try again later." | The gateway in the VM cannot reach a server: are all 7 running in the VM? |
| The VM's error log has `GATEWAY_CLIENT_ADDR refused from <address>` | The gateway reached that server through an address other than `127.0.0.1`. That should not happen with the routes above; check that the routes in the VM's `gateway.config.json` say `127.0.0.1`. |

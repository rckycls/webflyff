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
| `<VM-IP>` | The VM's address on your Wi-Fi network (step 1), for example `192.168.1.50`. |
| `<PC-IP>` | Your PC's Wi-Fi address (`ipconfig` on the PC, the **IPv4 Address** of the Wi-Fi adapter), for example `192.168.1.20`. |

## 1. The VM's network

Phones must reach the VM directly, so the VM needs its own address on your Wi-Fi network, not a private one behind your PC.

1. In **Hyper-V Manager**, open **Virtual Switch Manager**, choose **New virtual network switch**, **External**, and pick your PC's Wi-Fi adapter (or its network cable, which is more reliable). Keep **Allow management operating system to share this network adapter** ticked, so your PC stays online.
2. In the VM's **Settings**, set its **Network Adapter** to that switch.
3. Start the VM and run `ipconfig` in it. The **IPv4 Address** is `<VM-IP>`: it must start like your PC's address (for example both `192.168.1.…`). If it starts with `172.` it is still on the private "Default Switch".
4. In the VM, set the network to **Private** (Settings > Network & internet > the network > Private network), so Windows lets your devices in.
5. **Keep the address fixed.** If the router gives the VM a different address later, everything below that uses `<VM-IP>` must change too. Most routers can reserve an address for a device ("DHCP reservation"); do that for the VM if you can.

## 2. The game servers in the VM

1. **Copy two folders into the VM, side by side,** for example to `C:\FlyFF\Program` and `C:\FlyFF\Resource`: your `Program` and `Resource` folders. The world and database servers look for `..\Resource` next to `Program`.
2. **Install the Microsoft Visual C++ Redistributable for Visual Studio 2015-2022, x86** (the 32-bit one, from Microsoft's site). The servers are 32-bit programs and use it. The DirectX file the world server needs, `d3dx9_43.dll`, is already in `Program`.
3. **The database.** Install SQL Server (Express is enough, as on your PC) and restore your game databases into it: in SQL Server Management Studio on your PC, back up each database (right-click the database > Tasks > Back Up), copy the `.bak` files into the VM, and restore them there (right-click Databases > Restore Database). Restore the database logins the servers use too.
4. **The three database connections.** The servers connect to SQL Server through ODBC data sources with fixed names: `login`, `character01` and `log01` (the `DSN_NAME_…` lines in `AccountServer.ini` and `DatabaseServer.ini`; the certifier uses `login` too). Create them in the VM as **System DSN** with the **32-bit** ODBC tool, `C:\Windows\SysWOW64\odbcad32.exe`. The ordinary "ODBC Data Sources" in the Start menu is the 64-bit one, and 32-bit programs never see what it makes. Give each the same driver, server and default database as on your current setup. On your current PC, open the same 32-bit tool to see them.
5. **The new world and cache servers.** Do the swap from [server-patches/README.md](../server-patches/README.md) ("Put them in service": the world server and the cache server) in the VM's `Program` folder: copy the new `WorldServer.exe` and `CacheServer.exe` from `Output\` on your PC into it, and add the `Gateway "127.0.0.1"` line to the VM's `CacheServer.ini`. `127.0.0.1` is right, because the gateway runs in the VM too.
6. **Start the servers** in their usual order, `1. Account.exe` to `7. World.exe`. Then look in the error log in `Program` (a file named like `error_20261023.txt`): a line about a failed connection to the database means a data source from step 4 is missing or wrong.

## 3. The gateway in the VM

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

## 4. The live tests run in the VM

The live tests start their own gateway and expect the servers on the same machine, so run them in the VM, in `C:\FlyFF\FlyffWeb`: make `apps\client\test\live.config.json` from `live.config.example.json` as the checklists in [device-testing.md](device-testing.md) say (for this milestone, the `world` section with two throwaway accounts), then `npm run test:live:world`. Its own gateway uses port 8091 inside the VM, so it does not clash with the one from step 3.

## 5. The client on your PC

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
| "Cannot reach the game gateway." on every device | Check, in this order: the client was started with `VITE_GATEWAY_URL` and the right `<VM-IP>` (step 5); the gateway is running in the VM (step 3); the VM's firewall rule for port 8090 exists and the VM's network is Private (steps 1 and 3). In the VM's gateway window, a `refused <address> origin` line means the page's address is not in `allowedOrigins`. No line at all means the connection never reached the VM. |
| It works on the PC but "Cannot reach the game gateway." on a phone | The phone cannot reach the VM: it is on a guest Wi-Fi that keeps devices apart, or the VM is still on Hyper-V's private "Default Switch" (step 1). Check that `<VM-IP>` starts like your PC's address. |
| It worked yesterday, not today | The VM or your PC got a new address from the router. Check `ipconfig` on both; restart the client with the new `<VM-IP>`, or change `allowedOrigins` in the VM and restart the gateway. A DHCP reservation (step 1) stops this. |
| The servers' error log says they cannot connect to the database | A data source is missing, misspelt or made with the 64-bit tool (step 2, item 4), or SQL Server is not running in the VM. |
| "The game server is not reachable. Try again later." | The gateway in the VM cannot reach a server: are all 7 running in the VM? |
| The VM's error log has `GATEWAY_CLIENT_ADDR refused from <address>` | The gateway reached that server through an address other than `127.0.0.1`. That should not happen with the routes above; check that the routes in the VM's `gateway.config.json` say `127.0.0.1`. |

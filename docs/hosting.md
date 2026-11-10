# Hosting guide: putting the client on the internet

For the owner. This guide puts the browser client on a real web address, for example `https://play.example.com`, so a player can open it on a phone from anywhere. It is written ahead of time: no hosted machine exists yet, so **no step here has been carried out on a real machine**. Where something does not behave the way this guide says, write down what you saw and what you expected, and ask Claude.

Read [Before a public launch](#before-a-public-launch) before you tell anyone the address.

## How the parts fit

```
phone --https (port 443)--> Caddy --+--> the site's pages and the game files (read from disk)
                                     |     /  home   /sign-up/  sign-up   /play/  the game
                                     |
                                     +--> /connect/...  --> the gateway (127.0.0.1:8090) --> the servers
                                     |                      (certifier 23000, login 28000, cache 5400)
                                     |
                                     +--> /api/...      --> the web service (127.0.0.1:8091) --> SQL Server
                                                            (makes accounts, tells the server status)
```

- **Caddy** is a small web server. It holds the HTTPS certificate (it gets one from Let's Encrypt by itself), serves the site's pages and the game's files, passes everything under `/connect/` on to the gateway and everything under `/api/` on to the web service, and adds the security headers to every answer.
- **The site** has three pages: the home page at `/` (news, the server status, a **Play** button), account creation at `/sign-up/`, and the game at `/play/`. Any other address gets a "Page not found" page.
- **The web service** (`apps/web`) makes accounts for the sign-up page and tells the home page whether the game is online. It is the only part that talks to SQL Server, with a login that may run two procedures and nothing else (step 6b). It only listens on this machine (`127.0.0.1`).
- **The gateway** turns the browser's WebSocket into the plain connection the game servers expect. It only listens on this machine (`127.0.0.1`), so the internet can reach it only through Caddy.
- **The game servers** (the 7 programs in `Program\`) stay as they are. Their ports are **closed** to the internet: only the gateway, on the same machine, talks to them.

Players use only the browser client. Neuz (the Windows client) is not part of a hosted setup.

## What you need

- A Windows machine that runs the 7 game servers, with a public IPv4 address, and the ability to open one port (443) to the internet. If the machine sits behind a home router, you need to be able to set up a port forward on it.
- A domain name you control, with a **sub-domain just for the game**, for example `play.example.com`.
- [Node.js](https://nodejs.org/) v24 or higher (the LTS version), with npm 11 or higher (it comes with Node).
- The `FlyffWeb` folder on that machine, **inside the server folder** (next to `Program` and `Client`), the same way it is on your PC.
- Two small free programs you download in the steps below: **Caddy** and **NSSM** (it runs a program as a Windows service, so it starts with Windows and restarts if it stops).

### Names used below

Replace these in every command and file before you run it:

| In this guide | Means |
| --- | --- |
| `play.example.com` | Your site address. |
| `172.31.238.55` | The address the servers hand out to players (`NEUZ_IPSET`), see step 3. |
| `C:\caddy` | The folder where you put Caddy and its `Caddyfile`. |
| `C:\flyff-logs` | The folder for the log files of the two services. |
| `$FlyffWeb` | The `FlyffWeb` folder. |

Open **PowerShell** (not Command Prompt), and set `$FlyffWeb` once. The commands below use it. Use your own path:

```
$FlyffWeb = 'D:\FlyFF\Blouflash VS22 V15\FlyffWeb'
```

If you close the window, open a new one and run that line again. You should see nothing printed. Check it with `Test-Path "$FlyffWeb\package.json"`, which must print `True`.

Steps 6 to 8 (and "Updating later") need PowerShell **as administrator** (right-click PowerShell, "Run as administrator"). **An administrator window is a new window, so set `$FlyffWeb` again in it** with the line above before you use it.

## Step 1. Point the name at the machine (DNS)

At the company where you bought the domain (the registrar, or wherever its DNS is managed):

1. Add an **A record**: name `play`, value the machine's public **IPv4** address.
2. Make sure there is **no AAAA record** for `play`. Delete one if the registrar created it by itself.

Why only IPv4: the certifier stores players' addresses in IPv4 form and cannot take an IPv6 one. A phone on an IPv6-only mobile network still reaches the site, because its carrier translates for it.

Success: after a few minutes (sometimes up to an hour), this prints your machine's public address and no IPv6 address (a long one with colons in it):

```
nslookup play.example.com
```

## Step 2. Install Node.js

Install the LTS version of Node.js from nodejs.org. It must be v24 or higher. The installer's defaults are fine; it puts Node in `C:\Program Files\nodejs`. Open a **new** PowerShell window, set `$FlyffWeb` again, and check:

```
node --version
npm --version
```

Success: Node prints `v24` or a higher number (for example `v24.19.0`), and npm prints `11` or a higher number (for example `11.17.0`).

## Step 3. Build

In PowerShell:

```
cd $FlyffWeb
npm ci
```

Success: after a minute or two it ends with a line that starts with `added` and mentions packages, and there are no red `npm error` lines. (Use `npm ci`, not `npm install`: it installs exactly what `package-lock.json` says. Do not add `--omit=dev`: the gateway needs a tool that is listed as a development one.)

### 3a. The game files

```
npm run convert
```

This turns the game's `Client` folder into web files in `$FlyffWeb\dist\assets`. It takes about 7 minutes, writes about 970 MiB and needs KTX-Software (see the top of [README.md](../README.md#flyffweb)). If the `Client` folder is not next to `FlyffWeb`, add `-- --client "D:/path/to/Client"`.

The world (Piece 3) reads these files: without them a player can log in, but **Enter** fails. The Caddyfile in step 8 serves the folder at `/assets/`. Run this again whenever the game's `Client` folder changes, so the browser sees the same game data as the servers.

Success: `Total: N ok, N warn, 0 failed` at the end.

### 3b. The client, built for the internet

The client has to be told where the gateway is. On your PC's Wi-Fi it works that out from the page's own address (`ws://<same host>:8090`), which is wrong behind HTTPS, so for the hosted build you set two **environment variables** for the one build command:

| Variable | Value | Why |
| --- | --- | --- |
| `VITE_GATEWAY_URL` | `wss://play.example.com` | Where the browser opens its WebSocket. `wss` (not `ws`) because the page is HTTPS, and no port, because Caddy answers on 443 and passes `/connect/` on to the gateway. |
| `VITE_CERTIFIER_ADDRESS` | `172.31.238.55:23000` | The certifier's address as the servers advertise it: `NEUZ_IPSET`, then `:23000`. It must be one of the keys in `routes` in the gateway's config (step 5). |

**What is `NEUZ_IPSET`?** It is a line in `Source\_Common\ServerCommon.h`. On the test build (`NEUZ_TEST` is `TRUE`, as on your PC) it is `172.31.238.55`. On the live build it is the text `"LIVE IP HERE"`, a placeholder for the address you choose. The servers hand that address out to the client, and the gateway never connects to it: it is only a **name** that the gateway's config maps to `127.0.0.1`. So any IPv4 address will do, and `172.31.238.55` is as good as any. What matters is that the same value is used in all three places: the servers' build, `VITE_CERTIFIER_ADDRESS` and the route names in step 5. The examples in this guide use `172.31.238.55`; use your own value if it differs.

Build, with both variables set for this command only (PowerShell):

```
cd $FlyffWeb
$env:VITE_GATEWAY_URL = 'wss://play.example.com'; $env:VITE_CERTIFIER_ADDRESS = '172.31.238.55:23000'; npm run build:client
Remove-Item Env:VITE_GATEWAY_URL, Env:VITE_CERTIFIER_ADDRESS
```

The last line clears them again. Do not skip it: the variables stay set in that window, and a later `npm run dev:client` there would use the hosted address instead of your PC's.

(Command Prompt: `set "VITE_GATEWAY_URL=wss://play.example.com" && set "VITE_CERTIFIER_ADDRESS=172.31.238.55:23000" && npm run build:client`, and close the window afterwards.)

Success: it ends with `built in` and a time, and `$FlyffWeb\apps\client\dist` holds `index.html` (home), `sign-up\index.html`, `play\index.html` (the game), `404.html` and a folder `client` with the pages' `.js` and `.css` files. Check that the address is inside the build:

```
Select-String -Path "$FlyffWeb\apps\client\dist\client\*.js" -Pattern 'wss://play.example.com' -SimpleMatch -List | Select-Object Filename
```

It must print the `.js` file's name. Nothing printed means the variable was not set: build again.

Where the files go: the client's own files are under `apps\client\dist\client\` (so on the web they are at `/client/...`), because `/assets/` is reserved for the converted game files in `dist\assets`.

You must **build again whenever the domain or `NEUZ_IPSET` changes**, after every update of the client's code, and after a new news post or screenshot (see [apps/web/README.md](../apps/web/README.md#news-and-screenshots)).

**Before every deploy, check the build** (it makes its own build in a temporary folder, so it does not touch `apps\client\dist`):

```
npm run check:public-build
```

Success: it ends with `check:public-build: ok (no test hooks; home and sign-up load no game code)`. Anything else names what is wrong in the code: test hooks that a public build would keep, or a home or sign-up page that loads the game's code. Do not put such a build on the internet; ask Claude.

Then check the build you made above has no test hooks either (they are only for the automated tests, and a window where `VITE_TEST_HOOKS` was set would build them in):

```
Select-String -Path "$FlyffWeb\apps\client\dist\client\*.js" -Pattern '__client' -SimpleMatch -List | Select-Object Filename
```

Success: it prints nothing. A file name printed means that build has the test hooks: open a new PowerShell window and build again.

## Step 4. The new servers: certifier, login, world and cache

Without this step the site works, but the servers treat every browser player as one player, because they all arrive from the gateway's address, and the browser reads only part of the world:

- one player's typo in a password blocks everyone for 15 seconds (three typos: 15 minutes), and `IPCut.ini` bans cannot single anyone out;
- on a busy server, the connection-flood limiter cuts off every browser player at once (see [Before a public launch](#before-a-public-launch));
- the world server's packets have no table of contents, so the browser drops the rest of a packet at the first message it doesn't read: players still enter the world and can walk, but other players and monsters can be missing, stand still or stay on screen after they have gone (the overlay's `indexed` number stays at 0);
- the cache server, the core server and the world server record every browser player at the gateway's address.

Follow **[server-patches/README.md](../server-patches/README.md)**. Build the new `Certifier.exe`, `LoginServer.exe`, `WorldServer.exe` and `CacheServer.exe` on your PC, where Visual Studio is; the new certifier holds all three certifier changes, so one swap covers them. Then, on the hosted machine (back up each old exe first, as that README says):

1. **The certifier:** stop it, copy the new file over `Program\2. Certifier.exe` **keeping that name**, and add this line at the end of `Program\Certifier.ini`:

   ```
   Gateway "127.0.0.1"
   ```

   Press Enter after `HEARTBEAT` first, as that README explains. Then start the certifier again.
2. **The login server:** stop it, copy the new file over `Program\5. Login.exe` **keeping that name**, and add the same `Gateway "127.0.0.1"` line at the end of `Program\LoginServer.ini`. Press Enter after the last line, `//NPROTECT`, first: a line typed straight after it becomes part of that comment and is ignored. Then start the login server again.
3. **The world server:** stop it (everyone in the game is disconnected), copy the new file over `Program\7. World.exe` **keeping that name**, and start it again. It has no setting. Read that README's note about the world server first: the new exe also holds a later change to `DPSrvr.cpp`.
4. **The cache server:** stop it (everyone in the game is disconnected), copy the new file over `Program\6. Cache.exe` **keeping that name**, and add the same `Gateway "127.0.0.1"` line at the end of `Program\CacheServer.ini`. Press Enter after the last line, `Port "5400"`, first. Then start the cache server again.

Success:

- Type a wrong password for a test account on a phone on Wi-Fi. Then, at once, log in to **the same account** on a second phone on mobile data (Wi-Fi off). It must reach the server list. (If the certifier still saw every browser player at the gateway's address, the second phone would get "Cannot log into account for 15 seconds".)
- Enter the world on a phone: on the overlay's line `bundles N   indexed N   messages skipped N   mismatched N`, `indexed` is the same number as `bundles` (every packet had its table of contents, so the new world server is the one running), `mismatched` stays at 0 (`skipped` counts the messages the browser doesn't use yet and grows; that is normal), and other players and monsters move.
- The error log in `Program` (a file named like `error_20261022.txt`) has no `GATEWAY_CLIENT_ADDR refused` line and no `Gateway … not added` line, also after a browser player has entered the world.

## Step 5. The gateway: config and first run

Make the config from the example (it is not in git on purpose, because it is specific to this machine):

```
Copy-Item "$FlyffWeb\apps\gateway\gateway.config.example.json" "$FlyffWeb\apps\gateway\gateway.config.json"
notepad "$FlyffWeb\apps\gateway\gateway.config.json"
```

Replace everything in the file with this, using your own address in `allowedOrigins` and your own `NEUZ_IPSET` in the three route names:

```json
{
  "listen": { "host": "127.0.0.1", "port": 8090 },
  "allowedOrigins": ["https://play.example.com"],
  "trustedProxies": ["127.0.0.1"],
  "sendClientAddr": true,
  "routes": {
    "172.31.238.55:23000": { "host": "127.0.0.1", "port": 23000, "role": "certifier" },
    "172.31.238.55:28000": { "host": "127.0.0.1", "port": 28000, "role": "login" },
    "172.31.238.55:5400":  { "host": "127.0.0.1", "port": 5400,  "role": "cache" }
  }
}
```

What each line does:

- `listen.host` is `127.0.0.1`: only programs on this machine can reach the gateway, and the one that does is Caddy. (The example file says `0.0.0.0` so that phones on your Wi-Fi can reach it; do **not** use that when hosting.)
- `allowedOrigins` is the page address players load, exactly: `https://`, the name, **no** slash at the end, no port. A browser from any other page is refused. This is the line to check first when the lobby says it cannot reach the gateway.
- `trustedProxies` is `127.0.0.1`, which is Caddy. The gateway believes the player's address only when it comes from a listed proxy. Never put anything else there.
- `sendClientAddr` is `true`: the gateway tells the (patched) certifier each player's real address. The old certifier ignores it, so this is safe to leave on.
- `routes` maps each address the servers advertise to where the server really listens. The names (before the colon) are your `NEUZ_IPSET`. The `cache` route (port 5400) is the one a player uses from **Enter** on: the whole game goes through it. With `sendClientAddr` on, the gateway sends the player's address on it too, for the new cache server.

The file must be valid JSON: straight double quotes, commas between entries, no comments.

Now start it by hand once:

```
cd $FlyffWeb
npm run gateway
```

Success: it prints `gateway listening on ws://127.0.0.1:8090` and stays running. If the config has a mistake it prints `gateway: cannot use ...` with the reason, and stops. If it says it cannot listen, another program already uses port 8090.

Stop it with `Ctrl` + `C`. The next step runs it as a service instead.

## Step 6. The gateway as a Windows service

1. Download NSSM from [nssm.cc/download](https://nssm.cc/download), unzip it, and copy `win64\nssm.exe` to `C:\Windows\System32`. Open a new administrator PowerShell. **In this new window, set `$FlyffWeb` again** (the `$FlyffWeb = '...'` line from "Names used below"), and check it with `Test-Path "$FlyffWeb\package.json"`, which must print `True`. Without it, the `AppDirectory` line below gets an empty value and the service cannot find its files. Then run `nssm` on its own: it prints a few lines that start with `NSSM: The non-sucking service manager`, with its version.
2. Check where `node.exe` is. This must print `C:\Program Files\nodejs\node.exe`; if it prints another path, use that path in the first `nssm` line below:

```
(Get-Command node).Source
```

3. Create the log folder, then install the service:

```
New-Item -ItemType Directory -Force C:\flyff-logs
nssm install flyff-gateway "C:\Program Files\nodejs\node.exe"
nssm set flyff-gateway AppParameters "--import tsx apps\gateway\src\main.ts --config apps\gateway\gateway.config.json"
nssm set flyff-gateway AppDirectory "$FlyffWeb"
nssm set flyff-gateway AppStdout C:\flyff-logs\gateway.log
nssm set flyff-gateway AppStderr C:\flyff-logs\gateway.log
nssm set flyff-gateway AppRotateFiles 1
nssm set flyff-gateway AppRotateOnline 1
nssm set flyff-gateway AppRotateBytes 10000000
nssm start flyff-gateway
```

4. Check it:

```
nssm status flyff-gateway
Get-Content C:\flyff-logs\gateway.log
Test-NetConnection 127.0.0.1 -Port 8090
nssm get flyff-gateway AppDirectory
```

Success: `SERVICE_RUNNING`; the log's last line is `gateway listening on ws://127.0.0.1:8090`; `TcpTestSucceeded : True`; and the last command prints your `FlyffWeb` folder. If it prints something else (for example `C:\Program Files\nodejs`, or nothing), the service will not find its files: set `$FlyffWeb`, run the `AppDirectory` line again, and `nssm restart flyff-gateway`.

From now on the gateway starts with Windows and NSSM starts it again if it stops. After a change to `gateway.config.json`, run `nssm restart flyff-gateway`. To update the code, follow [Updating later](#updating-later): the service has to be stopped first.

The log has one line when a connection opens and one when it closes, with the time, the **player's** address, the server route, the bytes each way and a close code. It never holds a packet's contents (those contain password hashes).

Refused connections get `refused` lines instead, at most one per address and reason each minute, so that a flood cannot fill the log:

- `refused 203.0.113.5 rate`: the first refusal of that address, for that reason, in the current minute.
- `refused 203.0.113.5 rate x37 more in the last minute`: at the end of the minute, how many more there were.
- `refused 412 more connections from other addresses in the last minute`: past 50 addresses in one minute, the rest are only counted.

| Reason | Why the connection was refused |
| --- | --- |
| `origin` | The page address is not in `allowedOrigins`, or the browser sent none. The first thing to look for when the lobby says it cannot reach the gateway. |
| `path` | It did not ask for `/connect/<address>:<port>`. Not the lobby: usually a program scanning the internet. |
| `address` | The player's address could not be told (check `trustedProxies`). The line shows Caddy's address instead. |
| `route` | It asked for a server address that is not in `routes`. |
| `per-address` | That address already has 32 open connections. |
| `rate` | That address opened 60 connections in the last minute. |
| `full` | The gateway already has 1000 open connections. |

A `refused` line never holds what the browser sent, such as its page address or path: only the address and the reason.

The gateway also guards the certifier: on a certifier route it lets through only the four packets the browser sends (log in, close an old session, keep alive, error reply), with an account name of 1 to 32 plain characters and no `'`, and a password hash of 32 hex digits. Anything else ends that connection (code 4006) with a line `forbidden <address> <route> <reason>`, the reason being `type`, `account`, `password` or `malformed`. This closes a hole in the certifier that would let a crafted packet run SQL on `ACCOUNT_DBF`. The lobby never sends such a packet, so a `forbidden` line means someone tried. Step 9.7 checks it.

## Step 6b. The web service: sign-up and server status

The sign-up page makes accounts through this service, and the home page asks it whether the game is online. Its settings, logs and limits are in [apps/web/README.md](../apps/web/README.md).

1. **The database login.** The service logs in to SQL Server as `flyffweb_site`, a login that may run `usp_CreateNewAccount` and `usp_WebOnlineCount` and nothing else. Make it once, on the machine where SQL Server runs, in PowerShell (administrator):

```
cd "$FlyffWeb\apps\web\sql"
powershell -ExecutionPolicy Bypass -File .\Install-WebLogin.ps1
```

It asks twice for the new login's password: choose a long one (at least 12 characters) that you use nowhere else, and keep it for the next part. Options: `-Server .\SQLEXPRESS` if it cannot find the instance, `-User sa` to make the login with a SQL login instead of your Windows one, `-TcpPort 1433` if SQL Server listens on another TCP port.

Success: it ends with `Check passed: flyffweb_site logged in on 127.0.0.1,1433 and sees N player(s) online.` If it warns that SQL Server takes Windows logins only, turn on "SQL Server and Windows Authentication mode" and restart SQL Server; if the TCP check fails, turn on TCP/IP for the instance (SQL Server Configuration Manager) and run it again with the right `-TcpPort`. Running it again only sets the password anew.

2. **The settings file.** It holds the database password and the ticket secret, so it lives **outside** `FlyffWeb` and outside every folder Caddy serves, in a folder only administrators and the services (SYSTEM) can read:

```
New-Item -ItemType Directory -Force C:\flyff-web
Copy-Item "$FlyffWeb\apps\web\web.config.example.json" C:\flyff-web\web.config.json
icacls C:\flyff-web /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"
notepad C:\flyff-web\web.config.json
```

In Notepad set:

| Setting | Value |
| --- | --- |
| `siteOrigin` | `https://play.example.com`, exactly as the address bar shows it, no slash at the end. Only this page may send a sign-up. |
| `sql.password` | The password you gave `Install-WebLogin.ps1`. |
| `sql.port` | The `-TcpPort` you used (1433 by default). |
| `ticketSecret` | 32 or more random characters. Make them with `-join ((48..57)+(65..90)+(97..122) \| Get-Random -Count 48 \| ForEach-Object {[char]$_})` and paste the result. |
| `servers` | The certifier's and the login server's real ports on this machine (23000 and 28000): the home page says **Online** when both answer. |

`listen` stays `127.0.0.1` port `8091`, and `trustedProxies` stays `["127.0.0.1"]` (Caddy). Check `icacls C:\flyff-web` afterwards: it must list only `NT AUTHORITY\SYSTEM` and `BUILTIN\Administrators`.

3. **A first run by hand:**

```
cd $FlyffWeb
npx tsx apps/web/src/main.ts --config C:\flyff-web\web.config.json
```

Success: it prints a line ending in `listening 127.0.0.1:8091` and stays running. A mistake in the settings prints `web: cannot use ...` with the setting's name, and stops. Stop it with `Ctrl` + `C`.

4. **As a Windows service** (administrator PowerShell, with `$FlyffWeb` set):

```
nssm install flyffweb-site "C:\Program Files\nodejs\node.exe"
nssm set flyffweb-site DisplayName "FlyffWeb Site"
nssm set flyffweb-site AppParameters "--import tsx apps\web\src\main.ts --config C:\flyff-web\web.config.json"
nssm set flyffweb-site AppDirectory "$FlyffWeb"
nssm set flyffweb-site AppStdout C:\flyff-logs\web.log
nssm set flyffweb-site AppStderr C:\flyff-logs\web.log
nssm set flyffweb-site AppRotateFiles 1
nssm set flyffweb-site AppRotateOnline 1
nssm set flyffweb-site AppRotateBytes 10000000
nssm start flyffweb-site
nssm status flyffweb-site
curl.exe -s http://127.0.0.1:8091/api/status
```

Success: `SERVICE_RUNNING`, and the last line prints something like `{"online":true,"players":0,"checkedAt":"2026-..."}`. `"players":null` means the database did not answer: read `C:\flyff-logs\web.log`. After a change to the settings file, run `nssm restart flyffweb-site`.

If the web service stops, the game keeps working: only sign-up and the home page's status are missing ("Status unavailable"), and NSSM starts it again.

## Step 7. Open port 443

Do this before Caddy starts, because Let's Encrypt must reach port 443 to give out the certificate.

**Windows Firewall** (administrator PowerShell):

```
New-NetFirewallRule -DisplayName "FlyffWeb HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

Optionally also port 80, only so that `http://play.example.com` redirects to HTTPS (Caddy does the redirect, and nothing else is served on 80). Caddy gets its certificate over 443 either way:

```
New-NetFirewallRule -DisplayName "FlyffWeb HTTP redirect" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

**Close the game servers' ports.** Windows blocks incoming connections by default, but when a program first runs, Windows may have asked "allow this app?" and an answer of Allow created a rule that opens its ports. For the servers that would put **23000, 28000, 5400** (and the servers' other ports) on the internet.

First, make sure the firewall is switched on for all three kinds of network:

```
Get-NetFirewallProfile | Format-Table Name, Enabled
```

Success: three rows, `Domain`, `Private` and `Public`, each with `Enabled` showing `True`. If one shows `False`, switch it on: `Set-NetFirewallProfile -Profile Domain,Private,Public -Enabled True`.

Then take a quick look for stray rules:

```
Get-NetFirewallApplicationFilter | Where-Object { $_.Program -like '*\Program\*' } | Get-NetFirewallRule | Format-Table DisplayName, Enabled, Direction, Action -AutoSize
Get-NetFirewallPortFilter | Where-Object { @($_.LocalPort) | Where-Object { $_ -in '23000','28000','5400' } } | Get-NetFirewallRule | Format-Table DisplayName, Enabled, Direction, Action -AutoSize
```

Success: both print nothing. If a rule shows up with `Enabled True`, `Direction Inbound`, `Action Allow`, disable it with `Disable-NetFirewallRule -DisplayName "<the name shown>"`. (The first command looks for rules for any program in a folder called `Program`; if your servers are somewhere else, change the `*\Program\*` part.) This is only a quick look: it does not see a rule that opens a whole range of ports, such as `20000-30000`. **The real check is step 9.4, from outside.**

The gateway still reaches the servers, because connections from the machine to itself (`127.0.0.1`) are not filtered by the firewall.

**The router.** If the machine is behind a home router, forward **TCP 443** (and 80 if you opened it) to the machine's address on your network. Forward nothing else: not 23000, 28000, 5400, 8090 (the gateway), 8091 (the web service) or 1433 (SQL Server).

## Step 8. Caddy

1. Download Caddy for Windows from [caddyserver.com/download](https://caddyserver.com/download) (platform Windows, amd64). Make the folder `C:\caddy`, put the downloaded file there, and rename it to `caddy.exe`. Check it: `C:\caddy\caddy.exe version` prints a version.
2. Create the config file. Notepad asks whether to create a new file: answer Yes.

```
notepad C:\caddy\Caddyfile
```

Paste this, with your own site address and your own `FlyffWeb` path. In a Caddyfile on Windows, write the path with **forward slashes**, and put it in quotes when it has spaces:

```
(site-headers) {
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://{host}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
	}
}

play.example.com {
	import site-headers
	encode zstd gzip {
		match {
			header Content-Type text/*
			header Content-Type application/json*
			header Content-Type application/javascript*
			header Content-Type image/svg+xml*
			header Content-Type application/wasm*
			header Content-Type application/octet-stream*
			header Content-Type model/gltf-binary*
		}
	}
	handle /connect/* {
		reverse_proxy 127.0.0.1:8090
	}
	handle /api/* {
		request_body {
			max_size 4KB
		}
		reverse_proxy 127.0.0.1:8091
	}
	handle /assets/* {
		respond /assets/report.json 404
		@fingerprinted path_regexp fingerprinted \.[0-9a-f]{10}\.[a-z0-9]+$
		header @fingerprinted Cache-Control "public, max-age=31536000, immutable"
		root * "D:/FlyFF/Blouflash VS22 V15/FlyffWeb/dist"
		file_server
	}
	handle {
		root * "D:/FlyFF/Blouflash VS22 V15/FlyffWeb/apps/client/dist"
		try_files {path} {path}/index.html
		file_server
	}
	handle_errors 404 {
		import site-headers
		root * "D:/FlyFF/Blouflash VS22 V15/FlyffWeb/apps/client/dist"
		rewrite * /404.html
		file_server {
			status 404
		}
	}
}
```

What it does:

- Sound and music (Piece 6, milestone 2) are plain files of `dist\assets`: `.wav` effects, `.ogg` music and `.mp3` copies, served as `audio/wav`, `audio/ogg` and `audio/mpeg`. Caddy's `file_server` sends those types and answers the Range requests a browser streams music with. They are already compressed, or small, so `encode` leaves them alone. They add about 240 MB to `dist\assets`, fetched only as each sound first plays.
- `encode zstd gzip` compresses the types its `match` lists. Caddy's own list leaves out `application/octet-stream` and `model/gltf-binary`, which are the map tiles and collision files (`.bin`) and the models (`.glb`): about 16 MB a first entry into a world that compress to a fraction of that (a tile to 3-6 %). The list above is Caddy's usual text types plus those two. Fingerprinted game files are cached for one year as immutable; the mutable asset index and reports do not get this policy. New conversions produce new fingerprinted URLs.

- `/connect/*` goes to the gateway. Caddy passes WebSocket connections through by itself and adds the player's address in the `X-Forwarded-For` header, which is what the gateway reads (because of `trustedProxies`).
- `/assets/*` is read from `FlyffWeb\dist`, so `/assets/x` is the file `FlyffWeb\dist\assets\x`: where `npm run convert` writes.
- The `respond /assets/report.json 404` line keeps one file private. `npm run convert` leaves a `report.json` in that folder, and it holds the folder paths of the computer that did the converting. Everything else in `dist\assets` is meant to be public, so only this file is blocked: a visitor who asks for it gets "not found". The line sits inside the `/assets/*` block, before `file_server`, so it takes effect before the file is served. Step 9 checks it.
- `/api/*` goes to the web service (step 6b), with bodies of at most 4 KB (a sign-up is a few hundred bytes; the service itself takes at most 1 KB).
- Everything else is read from `FlyffWeb\apps\client\dist`: the home page, `/sign-up/`, the game at `/play/`, and their files under `/client/`. `/play` and `/sign-up` without the slash find their page too (`try_files {path} {path}/index.html`). A path with no page or file behind it gets the "Page not found" page, `404.html`, with the status 404 (`handle_errors 404`; it needs Caddy 2.8 or newer). Old bookmarks of the game at `/` now land on the home page, whose **Play** button leads to `/play/`.
- `(site-headers)` is the set of security headers every answer gets, error pages included (`import site-headers`). They are the same as `apps/client/siteHeaders.ts`, which the automated tests run the game under; a test checks this guide carries them word for word:
  - `Strict-Transport-Security`: browsers use only HTTPS for the site for a year (Caddy already sends `http://` to `https://`).
  - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`: no guessing of file types, no full addresses sent to other sites, no camera, microphone or location.
  - `Content-Security-Policy`: the pages may run only the site's own scripts (no inline script), connect only to the site and its gateway (`wss://{host}`, which Caddy fills in with the site's name), and cannot be shown inside another site's frame. Two sources the game needs: `'wasm-unsafe-eval'` for the texture decoder, which is WebAssembly, and `'unsafe-eval'` because that decoder's glue code builds functions from strings in its worker; without it no world loads. `'unsafe-inline'` in `style-src` is for the inline styles the pages and the game set.

Save it as **`Caddyfile` with no `.txt` at the end**: `dir C:\caddy` must list `Caddyfile`, not `Caddyfile.txt`.

3. Check it, then run it by hand once (administrator PowerShell):

```
C:\caddy\caddy.exe validate --config C:\caddy\Caddyfile
C:\caddy\caddy.exe run --config C:\caddy\Caddyfile
```

Success: `Valid configuration`; then Caddy's log shows it getting a certificate for `play.example.com` (a line containing `certificate obtained successfully`) within a minute or so and stays running. Stop it with `Ctrl` + `C`.

4. Install it as a service:

```
nssm install flyff-caddy C:\caddy\caddy.exe
nssm set flyff-caddy AppParameters "run --config C:\caddy\Caddyfile"
nssm set flyff-caddy AppDirectory C:\caddy
nssm set flyff-caddy AppStderr C:\flyff-logs\caddy.log
nssm set flyff-caddy AppRotateFiles 1
nssm set flyff-caddy AppRotateOnline 1
nssm set flyff-caddy AppRotateBytes 10000000
nssm start flyff-caddy
nssm status flyff-caddy
```

Success: `SERVICE_RUNNING`.

## Step 9. Check it from outside

1. On a phone **on mobile data** (Wi-Fi off), open `https://play.example.com`. You should see the home page (the game's art, **Play**, the news, and the status **Online · N players**), with the padlock showing a valid certificate. Open `https://play.example.com/no-such-page`: it shows "Page not found".
2. Tap **Sign up**, make a new account, and tap **Play now**: the login form at `/play/` has the new name filled in. Log in with it, pick a channel, and look at the character list. Then tap **Enter** on a character: after "Entering the world…" the world opens around the character, with a **Leave** button.
3. On the machine, look at the end of the gateway's log:

```
Get-Content C:\flyff-logs\gateway.log -Tail 6
```

Success: lines like `2026-...Z open 203.0.113.5 172.31.238.55:23000` (and, after **Enter**, one for `172.31.238.55:5400`), where the address after `open` is the **phone's** public address. If every line shows `127.0.0.1`, the gateway does not know the players' real addresses: check `trustedProxies` and that Caddy sits in front.

4. From a computer on **another network** (for example a laptop on the phone's hotspot), check the closed ports. Each of these takes about 20 seconds to give up:

```
Test-NetConnection play.example.com -Port 443
Test-NetConnection play.example.com -Port 23000
Test-NetConnection play.example.com -Port 28000
Test-NetConnection play.example.com -Port 5400
Test-NetConnection play.example.com -Port 8090
Test-NetConnection play.example.com -Port 8091
Test-NetConnection play.example.com -Port 1433
```

Success: `TcpTestSucceeded : True` for 443 and `False` for all the others (the servers, the gateway, the web service and SQL Server).

5. Check that the one private file is not served. (This works from any computer. `curl.exe` comes with Windows.)

```
curl.exe -s -o NUL -w "%{http_code}" https://play.example.com/assets/report.json
```

Success: it prints `404`. Any other number, `200` especially, means the `respond /assets/report.json 404` line is missing or in the wrong place in the Caddyfile.

6. Check that the models and map tiles are sent compressed. Open `dist\assets\index.json` in Notepad, search for `models/`, and copy the path after it (it looks like `models/obj_mamaprbox04.0123456789.glb`). Then, with that path:

```
curl.exe -s -o NUL -D - -H "Accept-Encoding: zstd, gzip" https://play.example.com/assets/models/obj_mamaprbox04.0123456789.glb
```

Success: among the lines it prints is `Content-Encoding: zstd` (or `gzip`). Without that line, the `match` block of `encode` is missing from the Caddyfile, and every first entry into a world downloads several times the bytes it needs.

7. Check the security headers, the 404 page and the web service through Caddy (any computer):

```
curl.exe -s -o NUL -D - https://play.example.com/
curl.exe -s -o NUL -w "%{http_code}" https://play.example.com/no-such-page
curl.exe -s https://play.example.com/api/status
```

Success: the first prints, among its lines, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Content-Security-Policy` (with `wss://play.example.com` in it, not `{host}`); the second prints `404`; the third prints `{"online":true,"players":...}`. Then check that the gateway refuses the certifier packet that could run SQL. On the machine, in `$FlyffWeb`, with your own route key and site address:

```
npx tsx apps/gateway/scripts/sendBadClose.ts ws://127.0.0.1:8090 172.31.238.55:23000 https://play.example.com
```

Success: it prints `refused (4006)`, and the gateway log gets a line `forbidden 127.0.0.1 172.31.238.55:23000 account`.

## Updating later

After a new version of the code (a `git pull` in `FlyffWeb`, or a copied-in folder). **Stop the gateway and the web service first.** Both run from the `node_modules` folder, and `npm ci` deletes that folder first; Windows does not let it delete files that a running program is using, so `npm ci` fails and can leave the folder half-removed. While the gateway is stopped, players see "Cannot reach the game gateway.", so pick a quiet time. It takes a minute or two.

Open PowerShell **as administrator**, set `$FlyffWeb` again in it (the line from "Names used below"), then:

```
nssm stop flyff-gateway
nssm stop flyffweb-site
nssm status flyff-gateway
nssm status flyffweb-site
cd $FlyffWeb
npm ci
npm run check:public-build
$env:VITE_GATEWAY_URL = 'wss://play.example.com'; $env:VITE_CERTIFIER_ADDRESS = '172.31.238.55:23000'; npm run build:client
Remove-Item Env:VITE_GATEWAY_URL, Env:VITE_CERTIFIER_ADDRESS
nssm start flyff-gateway
nssm start flyffweb-site
nssm status flyff-gateway
nssm status flyffweb-site
```

Success: the first two `nssm status` say `SERVICE_STOPPED` (if one says anything else, wait a few seconds and ask again before you go on), `npm ci` and the build end without red `npm error` lines, the check ends with `check:public-build: ok`, and the last two `nssm status` say `SERVICE_RUNNING`. If you also changed `gateway.config.json` or the web service's settings, the start picks them up.

Caddy reads the new client files from disk straight away; it needs no restart. A phone that had the page open should reload it. (If you ever start the gateway by hand with `npm run gateway` instead, stop it with `Ctrl` + `C` before `npm ci` for the same reason.)

## Before a public launch

All browser players reach the servers from the gateway's address. Once the new certifier and login server are in place with their `Gateway` lines (step 4), the servers and the gateway handle that:

- **The servers' connection-flood limiter no longer counts the gateway.** It counts connections from one address that arrive less than 200 milliseconds apart, never forgets them, and at 50 cuts every connection from that address for up to 10 minutes. The certifier and the login server now skip it for the address in their `Gateway` lines. Before, all browser players counted as one address, and a busy server cut them all off at once.
- **The gateway limits each player instead,** by their real address: at most 60 new connections a minute and 32 open ones per address, and 1000 open connections in all. See [Limits players can meet](#limits-players-can-meet).
- **The wrong-password lockout keeps working on a busy server.** The certifier remembers every address and account that typed a wrong password, for 24 hours, instead of only the last 3 addresses in each login thread.

**Announce the address only when** the four new exes and the three `Gateway` lines are in place (step 4) and step 9's checks pass.

**What is still not covered:**

- **A few addresses can fill the gateway.** The total cap is 1000 open connections, and one address may hold 32, so about 32 addresses (32 × 32 = 1024) that each open 32 connections and keep them open fill it. After that every new player gets "The game is full right now". Such connections cost the attacker little: the servers keep a connection that sends a keep-alive now and then. This is the price of the generous per-address limit. If it happens, the gateway log shows many `open` lines from a few addresses and then `refused … full` lines. You can lower `maxConnectionsPerAddress` (8 or 16 still covers a family or a small café), raise `maxConnections` if the machine has room, or both (see [Limits players can meet](#limits-players-can-meet)).
- **A flood from thousands of addresses at once** (a DDoS). The gateway's limits work per address, and its total cap only stops new connections once 1000 are open, which keeps real players out too. Stopping such a flood needs a service in front of the machine, such as Cloudflare.
- **Players behind one shared address share its limits.** An internet café, or a mobile carrier that puts many players behind one address, gives them 32 open and 60 new connections a minute between them. If that becomes a problem, raise `maxConnectionsPerAddress` and `maxNewConnectionsPerAddressPerMinute` (see [Limits players can meet](#limits-players-can-meet)).
- **Password guessing across accounts.** You chose to count wrong passwords per address and account, so nobody is blocked by someone else's typos. The other side: one address can try 3 passwords on every account. The gateway's limits hardly slow that down, because one connection can send many tries a second; the database is the real limit.

**Until step 4 is done,** the old limiter still counts every browser player as one. A busy server cuts them all off at the same moment, and nobody can log in for about 10 minutes; in the gateway log, many connections close at once, usually with code `4002` ("server closed") or `4001` ("server unreachable"). With a few test devices this is fine, because quick, separate logins do not reach 50. But repeated quick logins and live-test runs add up, because the count never goes down: if all logins suddenly fail for about 10 minutes, wait it out, or restart the certifier and the login server to clear it. Do not run `npm run test:live` in a loop.

### Limits players can meet

| Limit | Setting (`limits` in `gateway.config.json`) | Default | What the player sees |
| --- | --- | --- | --- |
| Open connections per address | `maxConnectionsPerAddress` | 32 | "Too many connections from your network." |
| New connections per address in a minute | `maxNewConnectionsPerAddressPerMinute` | 60 | "Too many connection attempts from your network. Wait a minute and try again." |
| Open connections in all | `maxConnections` | 1000 | "The game is full right now. Try again in a few minutes." |

A login uses 2 connections (the certifier, then the login server), a channel change 2 more, and entering the world 1 more (the cache server; the login-server connection stays open while playing), so one player stays far below these. Players on one shared network (a family on one Wi-Fi, a café, a mobile carrier that shares addresses) share the per-address limits.

**To change a limit,** add a `limits` part to `gateway.config.json`, at the same level as `routes`, with only the limits you change. For example (the `...` stands for your routes, which stay as they are; note the comma after the `routes` part):

```json
  "routes": {
    ...
  },
  "limits": { "maxConnectionsPerAddress": 16, "maxConnections": 2000 }
}
```

Then run `nssm restart flyff-gateway`. A misspelt limit name stops the gateway with a message that names it. A limit written outside the `limits` part is ignored without a word, so check that it sits inside.

**The certifier's password lockout:** one wrong password blocks that account from that address for 15 seconds, and three for 15 minutes. After that, each further wrong password blocks it for 15 minutes again, until a good login, or until 24 hours pass without a wrong password. With the old certifier, all browser players share one address and so one lockout. The new certifier also refuses account names longer than 32 characters or with a space in them. No real account has one, and the lobby says "Login details incorrect." for them.

## Bandwidth

The game files are served from this machine, over this machine's internet connection. A player downloads many megabytes the first time they enter the world (the target is at most 15 MB until the character is on screen), more as they walk into new areas and meet new monsters, and every player does that over your upload speed. The lobby itself is a few kilobytes and uses none of these files.

When the machine's upload becomes the limit, move `/assets/` to a CDN (a service that serves files from servers close to the player): upload `dist\assets` there, and send `/assets/*` to it instead of to the `file_server` in the Caddyfile. The CDN must compress the `.json`, `.bin` and `.glb` files too, as the Caddyfile above does and the viewer's server does (`packages/scene/vite/serveDist.ts`).

## Background tabs and session lifetime

The gateway sends the login server's PING every 10 seconds and answers the cache server's KEEP_ALIVE challenge itself. These transport heartbeats continue when a tab's JavaScript timers are throttled or paused. This change needs the updated gateway process restarted using [Updating later](#updating-later); a client refresh alone does not update the gateway.

There is no logout timer based on tab focus. Closing the browser WebSocket destroys its TCP connection and cancels its heartbeat timers. Explicit logout, server shutdown and broken/unresponsive connections still end sessions. Browsers can discard background tabs or suspend network activity, so an unfocused tab cannot be guaranteed to survive every browser/OS action indefinitely. See [Chrome's page lifecycle documentation](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

## Troubleshooting

| What you see | Likely cause and fix |
| --- | --- |
| The browser says the site is not secure, or cannot be reached | The name does not point at the machine yet (step 1), port 443 is not open or not forwarded (step 7), or Caddy is not running (`nssm status flyff-caddy`). Read `C:\flyff-logs\caddy.log`: if Caddy failed to get a certificate it says why, and it tries again by itself. Let's Encrypt pauses a name for a while after several failed tries. |
| The page loads, but login says "Cannot reach the game gateway." | The gateway is not running (`nssm status flyff-gateway`), or `allowedOrigins` does not match the page address exactly (`https://play.example.com`, no slash at the end), or the client was built without `VITE_GATEWAY_URL` (check with the `Select-String` command in step 3b). After fixing the config, `nssm restart flyff-gateway`. |
| "This server address is not allowed." | `VITE_CERTIFIER_ADDRESS`, or the address the servers hand out, is not a key in `routes`. They must match exactly, port included. |
| "The game server is not reachable. Try again later." | The gateway is running but cannot connect to the certifier or the login server: are the servers running? Do `routes` point at the ports they listen on? |
| "Too many connections from your network." | 32 open connections from one address, see [Limits players can meet](#limits-players-can-meet). Wait a moment, or close other tabs. The gateway log shows `refused <address> per-address`. |
| "Too many connection attempts from your network. Wait a minute and try again." | 60 new connections from one address in a minute. Wait a minute. If a whole café or carrier shares the address, raise `limits.maxNewConnectionsPerAddressPerMinute`. The gateway log shows `refused <address> rate`. |
| "The game is full right now. Try again in a few minutes." | The gateway has 1000 open connections (`limits.maxConnections`). The gateway log shows `refused <address> full`. If the `open` lines before it come from many different addresses, you have many players: raise the limit if the machine has room. If they come from a few addresses again and again, someone is holding connections to fill the gateway: lower `maxConnectionsPerAddress`, see [Before a public launch](#before-a-public-launch). |
| "Wrong Password. Cannot log into account for 15 seconds." | The lockout, see above. Wait. |
| **Enter** stays on "Entering the world…", then "The server did not answer in time." | The login server did not answer the browser's request to enter (15 seconds), or the cache server did not answer (25 seconds). Are the cache server (`6. Cache.exe`), the core server and the world server running? Does `routes` have the `cache` route (step 5)? The gateway log shows an `open` line for `…:5400` when the browser reaches the cache server. |
| "The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again." | The world server refused the character, usually because it is still in the game from a session that has just ended (a closed tab, a phone that slept), and it says nothing about why. The server lets the old session go after a short while. Wait a moment, log in again and tap **Enter**. |
| "The connection to the game was lost." | A connection closed while playing: the phone slept or lost its network, the gateway was restarted, or a server stopped. Log in again. There is no automatic reconnect yet. |
| "Moving to another map isn't supported yet." | The character walked through a portal or was moved to another map by the server. Only one map per session works so far. Log in again. |
| "This map isn't available in the browser yet." | The character is saved on a map that was not converted, or the game files on the server are older than the game data (`npm run convert` again, step 3a). |
| "The game files on the server are out of date." | `dist\assets` was converted by an older version of FlyffWeb and lacks the game data this one reads (such as `data/worlds.json`). In `$FlyffWeb`, run `npm run convert -- --only data` (a few seconds), then enter again. |
| "The game files took too long to load. Check the connection and try again." | The map and the characters around the player did not arrive within a minute. On a slow phone connection, try again (the second time is quicker: the browser keeps what it already downloaded). If it happens on every device, check the machine's upload (see [Bandwidth](#bandwidth)) and that Caddy serves `/assets/`. |
| "This browser can't show the 3D world (WebGL is off or not supported)." | The browser has no WebGL 2, which the 3D world needs. Update the browser (on iPhone and iPad: iOS / iPadOS 16 or newer). In Chrome on a PC, turn on "Use graphics acceleration when available" in Settings → System and restart Chrome. Logging in and the character list work without it. |
| Other players and monsters are missing or stand still, and on the overlay `indexed` stays at 0 while `bundles` grows | The old world server is running: its packets have no table of contents (step 4). With the new one, `indexed` equals `bundles`; a `skipped` number that grows is then normal. |
| The error log in `Program` has `GATEWAY_CLIENT_ADDR refused from ...` after a player entered the world | The new cache server does not list the address the gateway connects from in `CacheServer.ini`: as for the certifier, read the "When to add a second line" note in [server-patches/README.md](../server-patches/README.md). |
| Everyone disconnected at once, nobody can log in for about 10 minutes | The servers' connection-flood limiter: the old certifier or login server is still running, or `Certifier.ini` or `LoginServer.ini` has no `Gateway` line. See step 4 and [Before a public launch](#before-a-public-launch). |
| The error log in `Program` has `Gateway … not added` | A `Gateway` line in `Certifier.ini` or `LoginServer.ini` (both servers write this line) is not a plain IPv4 address (a typo, say), or there are more than 8 of them. Find the address the line names in those two files, fix it, and restart that server. |
| Every line in the gateway log shows `127.0.0.1` | `trustedProxies` does not list `127.0.0.1`, or Caddy is not the one passing the connection. |
| The home page says "Status unavailable" | The web service is not running (`nssm status flyffweb-site`), or Caddy has no `handle /api/*` block. Read `C:\flyff-logs\web.log`. The game itself still works. |
| The home page says "Online" without a number of players | The web service cannot read the count from SQL Server (it waits 2 seconds). Check `sql` in `C:\flyff-web\web.config.json` and run `Install-WebLogin.ps1` again; its check says what fails. |
| Sign-up always says "Something went wrong. Please try again later." | Read `C:\flyff-logs\web.log`. `forbidden` on every line: `siteOrigin` in the settings is not the page address exactly (`https://play.example.com`, no slash at the end). `error` lines: the database refused, and a `signup database error:` line says why (a wrong `sql.password`, a missing `usp_CreateNewAccount`). Fix it, then `nssm restart flyffweb-site`. |
| Sign-up says "Too many sign-ups from your network." or "Sign-ups are paused for a few minutes." | The limits: 3 accounts an hour from one address, 60 an hour in all, 20 tries an hour from one address. They clear by themselves within the hour, or at once with `nssm restart flyffweb-site`. See [apps/web/README.md](../apps/web/README.md#limits). |
| An account made at sign-up cannot log in | Look for its `created` line in `C:\flyff-logs\web.log`. Names are stored in lower case, as the game's login reads them. An account made by the old FlyffPortal cannot log in at all (it stored its password another way): make a new one. |
| A `forbidden <address> <route> <reason>` line in the gateway log | The gateway refused a certifier packet the lobby never sends: someone tried the certifier hole the gateway closes (step 6). Nothing reached the certifier. |
| The certifier's error log has `GATEWAY_CLIENT_ADDR refused from ...` | The patched certifier does not list the address the gateway connects from. Read the "When to add a second line" note in [server-patches/README.md](../server-patches/README.md). Never add an address you do not recognise. |

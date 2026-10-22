# Hosting guide: putting the lobby on the internet

For the owner. This guide puts the browser client on a real web address, for example `https://play.example.com`, so a player can open it on a phone from anywhere. It is written ahead of time: no hosted machine exists yet, so **no step here has been carried out on a real machine**. Where something does not behave the way this guide says, write down what you saw and what you expected, and ask Claude.

Read [Before a public launch](#before-a-public-launch) before you tell anyone the address.

## How the parts fit

```
phone --https (port 443)--> Caddy --+--> the built client and the game files (read from disk)
                                     |
                                     +--> /connect/...  --> the gateway (127.0.0.1:8090) --> the servers
                                                            (certifier 23000, login 28000, cache 5400)
```

- **Caddy** is a small web server. It holds the HTTPS certificate (it gets one from Let's Encrypt by itself), serves the client's files, and passes everything under `/connect/` on to the gateway.
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

The lobby itself does **not** use these files yet: the first thing that does is the world in Piece 3. You can skip this step now and run it later; the Caddyfile in step 8 already serves the folder.

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

Success: it ends with `built in` and a time, and `$FlyffWeb\apps\client\dist` holds `index.html` and a folder `client` with one `.js` and one `.css` file. Check that the address is inside the build:

```
Select-String -Path "$FlyffWeb\apps\client\dist\client\*.js" -Pattern 'wss://play.example.com' -SimpleMatch -List | Select-Object Filename
```

It must print the `.js` file's name. Nothing printed means the variable was not set: build again.

Where the files go: the client's own files are under `apps\client\dist\client\` (so on the web they are at `/client/...`), because `/assets/` is reserved for the converted game files in `dist\assets`.

You must **build again whenever the domain or `NEUZ_IPSET` changes**, and after every update of the client's code.

## Step 4. The certifier and the login server

Without this step the site works, but the servers treat every browser player as one player, because they all arrive from the gateway's address:

- one player's typo in a password blocks everyone for 15 seconds (three typos: 15 minutes), and `IPCut.ini` bans cannot single anyone out;
- on a busy server, the connection-flood limiter cuts off every browser player at once (see [Before a public launch](#before-a-public-launch)).

Follow **[server-patches/README.md](../server-patches/README.md)**. Build the new `Certifier.exe` and `LoginServer.exe` on your PC, where Visual Studio is; the new certifier holds all three certifier changes, so one swap covers them. Then, on the hosted machine (back up each old exe first, as that README says):

1. **The certifier:** stop it, copy the new file over `Program\2. Certifier.exe` **keeping that name**, and add this line at the end of `Program\Certifier.ini`:

   ```
   Gateway "127.0.0.1"
   ```

   Press Enter after `HEARTBEAT` first, as that README explains. Then start the certifier again.
2. **The login server:** stop it, copy the new file over `Program\5. Login.exe` **keeping that name**, and add the same `Gateway "127.0.0.1"` line at the end of `Program\LoginServer.ini`. Press Enter after the last line, `//NPROTECT`, first: a line typed straight after it becomes part of that comment and is ignored. Then start the login server again.

Success:

- Type a wrong password for a test account on a phone on Wi-Fi. Then, at once, log in to **the same account** on a second phone on mobile data (Wi-Fi off). It must reach the server list. (If the certifier still saw every browser player at the gateway's address, the second phone would get "Cannot log into account for 15 seconds".)
- The error log in `Program` (a file named like `error_20261022.txt`) has no `GATEWAY_CLIENT_ADDR refused` line and no `Gateway … not added` line.

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
- `routes` maps each address the servers advertise to where the server really listens. The names (before the colon) are your `NEUZ_IPSET`.

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

**The router.** If the machine is behind a home router, forward **TCP 443** (and 80 if you opened it) to the machine's address on your network. Forward nothing else: not 23000, 28000, 5400 or 8090.

## Step 8. Caddy

1. Download Caddy for Windows from [caddyserver.com/download](https://caddyserver.com/download) (platform Windows, amd64). Make the folder `C:\caddy`, put the downloaded file there, and rename it to `caddy.exe`. Check it: `C:\caddy\caddy.exe version` prints a version.
2. Create the config file. Notepad asks whether to create a new file: answer Yes.

```
notepad C:\caddy\Caddyfile
```

Paste this, with your own site address and your own `FlyffWeb` path. In a Caddyfile on Windows, write the path with **forward slashes**, and put it in quotes when it has spaces:

```
play.example.com {
	handle /connect/* {
		reverse_proxy 127.0.0.1:8090
	}
	handle /assets/* {
		respond /assets/report.json 404
		root * "D:/FlyFF/Blouflash VS22 V15/FlyffWeb/dist"
		file_server
	}
	handle {
		root * "D:/FlyFF/Blouflash VS22 V15/FlyffWeb/apps/client/dist"
		try_files {path} /index.html
		file_server
	}
}
```

What it does:

- `/connect/*` goes to the gateway. Caddy passes WebSocket connections through by itself and adds the player's address in the `X-Forwarded-For` header, which is what the gateway reads (because of `trustedProxies`).
- `/assets/*` is read from `FlyffWeb\dist`, so `/assets/x` is the file `FlyffWeb\dist\assets\x`: where `npm run convert` writes.
- The `respond /assets/report.json 404` line keeps one file private. `npm run convert` leaves a `report.json` in that folder, and it holds the folder paths of the computer that did the converting. Everything else in `dist\assets` is meant to be public, so only this file is blocked: a visitor who asks for it gets "not found". The line sits inside the `/assets/*` block, before `file_server`, so it takes effect before the file is served. Step 9 checks it.
- Everything else is read from `FlyffWeb\apps\client\dist`: the lobby page, and its files under `/client/`. A path with no file behind it gets `index.html`.

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

1. On a phone **on mobile data** (Wi-Fi off), open `https://play.example.com`. You should see the **FlyFF** heading and a **Log in** form, with the padlock showing a valid certificate.
2. Log in with a test account, pick a channel, and look at the character list.
3. On the machine, look at the end of the gateway's log:

```
Get-Content C:\flyff-logs\gateway.log -Tail 6
```

Success: lines like `2026-...Z open 203.0.113.5 172.31.238.55:23000`, where the address after `open` is the **phone's** public address. If every line shows `127.0.0.1`, the gateway does not know the players' real addresses: check `trustedProxies` and that Caddy sits in front.

4. From a computer on **another network** (for example a laptop on the phone's hotspot), check the closed ports. Each of these takes about 20 seconds to give up:

```
Test-NetConnection play.example.com -Port 443
Test-NetConnection play.example.com -Port 23000
Test-NetConnection play.example.com -Port 28000
Test-NetConnection play.example.com -Port 5400
```

Success: `TcpTestSucceeded : True` for 443 and `False` for the other three.

5. Check that the one private file is not served. (This works from any computer. `curl.exe` comes with Windows.)

```
curl.exe -s -o NUL -w "%{http_code}" https://play.example.com/assets/report.json
```

Success: it prints `404`. Any other number, `200` especially, means the `respond /assets/report.json 404` line is missing or in the wrong place in the Caddyfile.

## Updating later

After a new version of the code (a `git pull` in `FlyffWeb`, or a copied-in folder). **Stop the gateway first.** The service runs from the `node_modules` folder, and `npm ci` deletes that folder first; Windows does not let it delete files that a running program is using, so `npm ci` fails and can leave the folder half-removed. While the gateway is stopped, players see "Cannot reach the game gateway.", so pick a quiet time. It takes a minute or two.

Open PowerShell **as administrator**, set `$FlyffWeb` again in it (the line from "Names used below"), then:

```
nssm stop flyff-gateway
nssm status flyff-gateway
cd $FlyffWeb
npm ci
$env:VITE_GATEWAY_URL = 'wss://play.example.com'; $env:VITE_CERTIFIER_ADDRESS = '172.31.238.55:23000'; npm run build:client
Remove-Item Env:VITE_GATEWAY_URL, Env:VITE_CERTIFIER_ADDRESS
nssm start flyff-gateway
nssm status flyff-gateway
```

Success: the first `nssm status` says `SERVICE_STOPPED` (if it says anything else, wait a few seconds and ask again before you go on), `npm ci` and the build end without red `npm error` lines, and the last `nssm status` says `SERVICE_RUNNING`. If you also changed `gateway.config.json`, the start picks it up.

Caddy reads the new client files from disk straight away; it needs no restart. A phone that had the page open should reload it. (If you ever start the gateway by hand with `npm run gateway` instead, stop it with `Ctrl` + `C` before `npm ci` for the same reason.)

## Before a public launch

All browser players reach the servers from the gateway's address. Once the new certifier and login server are in place with their `Gateway` lines (step 4), the servers and the gateway handle that:

- **The servers' connection-flood limiter no longer counts the gateway.** It counts connections from one address that arrive less than 200 milliseconds apart, never forgets them, and at 50 cuts every connection from that address for up to 10 minutes. The certifier and the login server now skip it for the address in their `Gateway` lines. Before, all browser players counted as one address, and a busy server cut them all off at once.
- **The gateway limits each player instead,** by their real address: at most 60 new connections a minute and 32 open ones per address, and 1000 open connections in all. See [Limits players can meet](#limits-players-can-meet).
- **The wrong-password lockout keeps working on a busy server.** The certifier remembers every address and account that typed a wrong password, for 24 hours, instead of only the last 3 addresses in each login thread.

**Announce the address only when** both new exes and both `Gateway` lines are in place (step 4) and step 9's checks pass.

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

A login uses 2 connections (the certifier, then the login server) and a channel change 2 more, so one player stays far below these. Players on one shared network (a family on one Wi-Fi, a café, a mobile carrier that shares addresses) share the per-address limits.

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

The game files are served from this machine, over this machine's internet connection. A player downloads many megabytes the first time they enter the world (the target is at most 15 MB until the character is on screen), and every player does that over your upload speed. The lobby of Piece 2 is a few kilobytes and uses none of these files.

When the machine's upload becomes the limit, move `/assets/` to a CDN (a service that serves files from servers close to the player): upload `dist\assets` there, and send `/assets/*` to it instead of to the `file_server` in the Caddyfile. Also worth doing then: compress the `.json`, `.bin` and `.glb` files, as the viewer's server does (`apps/viewer/vite.serveDist.ts`).

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
| Everyone disconnected at once, nobody can log in for about 10 minutes | The servers' connection-flood limiter: the old certifier or login server is still running, or `Certifier.ini` or `LoginServer.ini` has no `Gateway` line. See step 4 and [Before a public launch](#before-a-public-launch). |
| The error log in `Program` has `Gateway … not added` | A `Gateway` line in `Certifier.ini` or `LoginServer.ini` (both servers write this line) is not a plain IPv4 address (a typo, say), or there are more than 8 of them. Find the address the line names in those two files, fix it, and restart that server. |
| Every line in the gateway log shows `127.0.0.1` | `trustedProxies` does not list `127.0.0.1`, or Caddy is not the one passing the connection. |
| The certifier's error log has `GATEWAY_CLIENT_ADDR refused from ...` | The patched certifier does not list the address the gateway connects from. Read the "When to add a second line" note in [server-patches/README.md](../server-patches/README.md). Never add an address you do not recognise. |

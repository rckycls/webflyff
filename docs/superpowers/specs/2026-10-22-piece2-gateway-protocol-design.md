# FlyFF Web Client — Piece 2: Gateway + Protocol — Design Spec

**Date:** 2026-10-22
**Status:** Draft for review
**Builds on:** the Piece 1 spec, `docs/superpowers/specs/2026-10-16-flyff-web-client-design.md` in the bakbak-flyff repository. Section 1 below changes two of its decisions.

C++ paths are relative to the server folder (`Blouflash VS22 V15/`), which holds `Source/`, `Program/` and `Client/`.

---

## 1. Changes to the overall plan

### Browser-only (decided 2026-10-22)
This replaces two Piece 1 assumptions: that browser and Windows players share the servers, and that the Windows client (Neuz) stays.
- **Players use only the browser client.** Neuz.exe stays on the development PC as a tool: for the one packet recording in Piece 2 and for side-by-side checks in later pieces. Its C++ source stays the reference for behaviour.
- **Each custom feature is built once,** in the web client and the server.
- **The hosted machine opens only port 443.** The game servers' ports (23000, 28000, 5400) are reachable only by the gateway on the same machine.
- **No players need moving,** because no hosted server exists yet.
- **The C++ servers are no longer strictly unchanged.** Piece 2 changes the certifier (section 5).

### Roadmap
- **Pieces 1–6 keep their content.** Checks that used a Windows player now use a second browser player, for example "a second browser player sees the movement" in Piece 3. Piece 3 also gets the cache-server address change (section 5.5).
- **New: Pieces 7 and up.** These cover the systems outside the core loop, each with its own spec: quests, parties, guilds, trade, 3v3, housing, crafting and others.
- **Release 1 is done when** a player on a phone can log in, create a character and level through the starting area, with other browser players on the same server.
- **Open decision, due before Piece 6:** launch with the core loop only, or wait for some of Pieces 7 and up.

---

## 2. Brief

- **Goal:** a WebSocket gateway in front of the servers, plus a TypeScript protocol library. A plain lobby page logs in, shows servers and channels, lists characters, and creates and deletes a character.
- **Where it runs:** the gateway is built and tested on the development PC, next to the servers. Phones and tablets test over Wi-Fi. A hosting guide for a future Windows machine is written but not carried out (section 8).
- **Shared address:** every player reaches the servers from the gateway's address, so Piece 2 changes the certifier to see each player's real address.
- **Chosen approach: a packet-aware gateway in Node/TypeScript.** Two alternatives were rejected:
  - *A plain byte relay:* it can't pass the real address safely, because any browser could forge it. The fix would have to go into the network library shared by all 7 servers.
  - *A C++ gateway:* it builds only on Windows and shares no code with the browser.

---

## 3. Facts found in the code

| Area | Finding | Where |
|---|---|---|
| Connection chain | Certifier, then login server, then cache server. Neuz connects to the certifier at `NEUZ_IPSET`. The certifier's server list and the login server's cache address also hand out `NEUZ_IPSET`. | `Source/_Common/ServerCommon.h:7`, `Source/AccountServer/AccountServer.cpp:273-279`, `Source/LOGINSERVER/LoginServer.cpp:252-276` |
| Ports | Certifier 23000, login 28000, cache 5400. | `Source/_Network/MsgHdr.h:1440-1449` |
| Framing, client to server | A 13-byte header: `'^'`, `~(CRC32(length) ^ protocolId)`, the length, `~(CRC32(data) ^ protocolId)`. There's no packet counter: neither `__PACKET_REPLAY_W` nor `__PACKET_REPLAY_R` is defined. | `Source/_Network/Net/Src/buffer.cpp:146-174`, `Source/_Network/Net/Include/buffer.h:13-17` |
| Framing, server to client | A 5-byte header: `'^'`, then the length. The recording confirms it. | `Source/_Network/Net/Include/buffer.h:13`, `Source/_Network/Net/Src/dpsock.cpp` |
| Protocol ID | The server's first packet has 8 data bytes: `0x00000000`, then the ID. | `Source/_Network/Net/Src/dpsock.cpp:727-735` |
| Password | The hash is `md5("kikugalanet" + password)`, written as 32 hex characters (`NEUZ_PHASH`). CERTIFY carries it encrypted:<br>• AES-128-CBC (Rijndael with a 16-byte block)<br>• key `"dldhsvmflvm"`, zero-padded to 16 bytes<br>• zero IV, reset for every message<br>• over a 672-byte (16 × `MAX_PASSWORD`) zero-padded buffer<br>GETPLAYERLIST and CREATE_PLAYER carry the hash unencrypted. | `Source/Neuz/Neuz.cpp:1148-1158`, `Source/Neuz/DPCertified.cpp:122-165`, `Source/_Common/Rijndael.cpp:936-942`, `Source/_Network/CmnHdr.h:485` |
| Protocol version | `"20100412"` (`NEUZ_MSGVR`). | `Source/_Common/ServerCommon.h:10` |
| Build flags | • Client and servers: `__VER 15`, `__CRC`, `__PROTOCOL0910`, `__PROTOCOL1021`.<br>• Client and certifier: `__ENCRYPT_PASSWORD`, `__GPAUTH_01`, `__GPAUTH_02`, `__EUROPE_0514`, `__TWN_LOGIN0816`.<br>• Client only: `__2ND_PASSWORD_SYSTEM`, `__RT_1025`.<br>• `__SECURITY_0628`, which would add the resource version to CERTIFY, is defined only in the certifier's internal-server section. These builds define `__MAINSERVER`, so CERTIFY carries no resource version.<br>• The client, certifier and login server are built with language 1 (English), so the German, French, Thai and Taiwanese fields stay switched off. The client's code page is 1252. | `Source/Neuz/VersionCommon.h`, `Source/CERTIFIER/VersionCommon.h`, `IDS_LANG` / `IDS_CODEPAGE` in `Source/CERTIFIER/certifier.rc` and `Source/Neuz/WinMain.rc` |
| Packet prefix | Packets the client sends to the login server are built with `BEFORESENDSOLE`, so they start with a 4-byte `DPID_UNKNOWN` (`0xFFFFFFFF`) before the packet type. Certifier packets and every server reply start with the type. | `Source/_Network/Net/Include/dpmng.h:27-36`, `Source/Neuz/DPLoginClient.cpp` |
| How the servers use the player's address | The certifier keys its lockout on the socket address: one wrong password blocks for 15 s, three block for 15 min. It passes the same address on to:<br>• the account server, for the `IPCut.ini` ban ranges and, when the `TEST` line is removed from `AccountServer.ini`, the `pmttd.ini` permitted addresses;<br>• the `LOGIN_STR` procedure, which uses it only for its PC-café check (`USP_PCZoneIP_Check`) and doesn't store it. | `Source/CERTIFIER/AccountMgr.cpp:35-83`, `Source/CERTIFIER/DPCertifier.cpp:300`, `Source/CERTIFIER/DBManager.cpp:103-111,197-210`, `Source/AccountServer/dpsrvr.cpp:134-153`, `Database.sql:1030` |
| GM IP lookup | The core server takes the player's address from the cache server's own connection. | `Source/CORESERVER/DPCacheSrvr.cpp:222` |
| Unknown packets | The certifier ignores packet types it has no handler for. | `Source/CERTIFIER/DPCertifier.cpp:85-102` |
| Server source | `Source/` isn't tracked by git (bakbak-flyff's `.gitignore`). Visual Studio 2022 is installed on the development PC. | — |

---

## 4. Design

### 4.1 Parts

| Part | Runs in | Contents |
|---|---|---|
| `packages/protocol` | browser and Node | `ar/`: reader and writer with the same layout as C++ `CAr` (little-endian; strings as a 32-bit length plus bytes). `framing/`: CRC32, the client frame writer, the server frame reader, protocol-ID detection. `crypto/`: MD5 and AES-128-CBC in plain TypeScript, because WebCrypto is unavailable on plain-HTTP pages such as the Wi-Fi test setup. `packetTypes.ts`: numbers copied from `MsgHdr.h`. `messages/`: one module per packet (section 4.5). `text.ts`: decoding through `TextDecoder('windows-1252')`, the client's code page. No Node-only APIs anywhere. |
| `apps/gateway` | Node | HTTP server with WebSocket upgrade and origin check, route table, one WebSocket paired with one TCP connection, limits, real-address handling, connection log, config loading. `gateway.config.example.json` is committed; `gateway.config.json` stays local. |
| `apps/client` | browser (Vite) | The start of the real game client. Piece 2 adds the lobby: login, server and channel, character list, a create form, delete with confirmation. Plain HTML and CSS, usable on a phone. `src/net/` holds the WebSocket connection wrapper and the login flow. Piece 3 adds the world here, reusing code from the viewer, which stays as a developer tool. |
| `tools/capture` | Node, development only | A recording relay for one Neuz session. It writes each packet with its direction, type and body as hex into `packages/protocol/test/fixtures/`. |
| `server-patches/` | — | `certifier-client-addr.patch` and a `README.md` explaining how to apply and build it (section 5). |

### 4.2 Gateway behaviour

- **Connecting:**
  - The browser opens a WebSocket at `/connect/<address>:<port>`, using the address and port the servers hand out.
  - An origin missing from `allowedOrigins` gets HTTP 403 before the upgrade.
  - The gateway listens on IPv4 only.
- **Route table:** each entry maps an advertised `address:port` to where the server really listens, plus a role: `certifier`, `login` or `cache`. For example, `172.31.238.55:23000` maps to `127.0.0.1:23000` with the role `certifier`. Anything else is closed with code 4003.
- **Opening the connection:**
  - The gateway opens the TCP connection when the WebSocket opens. If it can't within 10 s, it closes with 4001.
  - The gateway reads the protocol-ID packet itself and never forwards it.
  - Browser packets that arrive earlier are held, up to 4 of them, and sent once the ID is known.
- **Real address:** on certifier routes, with `sendClientAddr` on, the client-address packet (section 5) is the first packet sent.
- **Relaying:**
  - Each WebSocket message from the browser is one packet body. The gateway adds the 13-byte header and sends it.
  - Each frame from the server becomes one WebSocket message carrying just the body.
- **Limits:**
  - A browser that sends a client-address packet itself is closed with 4006.
  - A browser packet over 16 KB, or more than 100 packets a second, is closed with 4004.
  - A ninth connection from one address is closed with 4007.
  - A broken server frame is closed with 4005. That means the `'^'` marker is missing or the length is over 1 MB.
- **Keep-alive and closing:**
  - The gateway pings the WebSocket every 30 s. With no answer within 60 s, it closes both sides.
  - When either side closes, the gateway closes the other. A server-side close reaches the browser as 4002.
- **Real address source:**
  - Normally the socket's peer address. An IPv4-mapped IPv6 form (`::ffff:a.b.c.d`) is unwrapped.
  - `X-Forwarded-For` is used, taking its last entry, only when the direct peer is listed in `trustedProxies`.
- **Logging:** one line when a connection opens and one when it closes, with the time, real address, route, bytes each way and close code. Packet contents are never logged, because they contain password hashes.

### 4.3 Browser ↔ gateway contract

- **Messages:** binary WebSocket messages only. Each carries one complete packet body, exactly as `CAr` holds it. Certifier packets and server replies start with the 4-byte packet type; packets the client sends to the login server start with `DPID_UNKNOWN`, then the type. The browser never sees framing or checksums.
- **Close codes:** each one maps to a plain message in the lobby (section 6).

| Code | Meaning |
|---|---|
| 4001 | Server unreachable |
| 4002 | Server closed the connection |
| 4003 | Destination not allowed |
| 4004 | Packet too big or too frequent |
| 4005 | Bad data from the server |
| 4006 | Forbidden packet from the browser |
| 4007 | Too many connections from this address |

### 4.4 Lobby flow

1. **Log in.**
   - The lobby connects to the certifier at the configured address and sends CERTIFY: version, account (trimmed, lower case), and the encrypted password block.
   - It answers KEEP_ALIVE for as long as the connection is open.
   - With no reply within 20 s, it shows a timeout.
2. **Pick a channel.**
   - SRVR_LIST supplies the auth key and the list of servers and their channels. A parent of `NULL_ID` marks a server; the others are its channels.
   - Disabled channels are shown but can't be picked. So are full ones: the count has reached the maximum.
   - ERROR or ERROR_STRING ends the login with a message.
   - For an already-logged-in account, the lobby offers "close the other connection" (CLOSE_EXISTING_CONNECTION), as Neuz does.
3. **Character list.**
   - The lobby connects to port 28000 at the address of the channel's parent server, as Neuz does. It sends QUERYTICKCOUNT, then GETPLAYERLIST: version, auth key, account, password hash, channel ID.
   - The answer is PLAYER_LIST. The lobby checks that its auth key matches and shows up to 3 slots with name, level and job.
   - It closes the certifier connection at the point Neuz does; the recording shows when that is.
4. **Create.**
   - CREATE_PLAYER sends the slot, a name, face, costume, skin set, hair, hair colour, sex, job (vagrant), head mesh and the 4-digit second password.
   - Choices use the same ranges as Neuz's create screen, shown as simple pickers.
   - Names follow the create screen's C++ rules; Piece 2 additionally accepts ASCII only.
   - The answer is a new PLAYER_LIST, or an ERROR such as "name taken".
5. **Delete.**
   - DEL_PLAYER sends the second password as the delete key, built the way `GetDeleteKey` builds it, and the auth key.
   - The answer is a new PLAYER_LIST or an ERROR.

### 4.5 Packets in Piece 2

- **Browser to server:** CERTIFY, KEEP_ALIVE, CLOSE_EXISTING_CONNECTION, ERROR (Neuz's reply to ERROR_STRING), GETPLAYERLIST, CREATE_PLAYER, DEL_PLAYER. PING and QUERYTICKCOUNT are added if the recording shows Neuz sending them before character select.
- **Server to browser:** SRVR_LIST, ERROR, ERROR_STRING, KEEP_ALIVE, PLAYER_LIST, CACHE_ADDR, QUERYTICKCOUNT, PING, ONE_HOUR_NOTIFY, LOGIN_PROTECT_NUMPAD, LOGIN_PROTECT_CERT.
- **Unknown packet types** are ignored, as Neuz does, and logged to the browser console.
- **Each module copies its layout from the named C++ function,** including the build-flag branches listed in section 3.

---

## 5. Certifier change

1. **Packet:** `PACKETTYPE_GATEWAY_CLIENT_ADDR`, numbered with a value unused anywhere in `MsgHdr.h`; the plan picks it and checks it. Its body is a `CAr` string holding a dotted IPv4 address of at most 15 characters.
2. **Config:** `Certifier.ini` gets a `Gateway "127.0.0.1"` line, which can be repeated. With no `Gateway` line the feature is off and the packet is always ignored.
3. **Behaviour:**
   - The packet is accepted only when all three hold:
     - the connection's socket address is a listed gateway;
     - it arrives before CERTIFY on that connection;
     - it parses as IPv4.
   - Otherwise it's ignored, with a log line.
   - The address is stored for that connection and removed when the connection closes.
   - A new `GetClientAddr(dpid)` returns the stored address, falling back to the socket address. It replaces the address lookups at `DPCertifier.cpp:300` (the lockout) and `DBManager.cpp:103, 197, 490, 537, 836`, covering both the number and the text forms.
4. **Delivery:**
   - The change is applied to `Source/CERTIFIER` and `Source/_Network/MsgHdr.h`, and saved as `server-patches/certifier-client-addr.patch` because `Source/` isn't tracked.
   - It's built with VS 2022's MSBuild into a separate output folder, never into `Program/`.
   - The owner swaps in the new `Certifier.exe`, adds the `Gateway` line and restarts the certifier.
   - Until then, today's certifier ignores the packet, so nothing breaks.
5. **Cache server:** the same pattern is added in Piece 3, when browsers first connect to it. That fixes the GM IP lookup.

---

## 6. Error handling in the lobby

- **Gateway close codes** (section 4.3) and **server error codes** each get a short English message. The server error codes are the ones Neuz handles in `CDPCertified::OnError` and `CDPLoginClient::OnError`: wrong password, banned, already logged in, name taken, and so on. Unknown codes show their number.
- **On any error,** the lobby returns to the screen where the player can retry, normally the login form. It doesn't reconnect automatically in Piece 2.
- **The certify timeout** is 20 s, the same as Neuz.

---

## 7. Testing

- **Recording.**
  - The owner runs Neuz once through `tools/capture` with a throwaway test account. The session logs in, picks a channel, lists characters, creates one and deletes one.
  - The fixtures are committed, and the README names the throwaway account.
  - Every packet module must decode its recorded packet, consuming exactly all of its bytes. Packets the client sends must re-encode to the same bytes, which also proves the password encryption.
- **Unit tests (Vitest):**
  - `ar` round trips.
  - CRC32 against known values.
  - MD5 against RFC 1321 test vectors.
  - AES-128 against FIPS-197 test vectors and CBC against SP 800-38A test vectors.
  - Framing against the recorded frames.
- **Gateway tests:**
  - These run the gateway against a fake FlyFF server inside the test, using the same framing code.
  - Covered: origin and route refusal, the protocol ID being swallowed and held packets being released, the real address arriving first, forged-packet closing, size, rate and per-address limits, close passing through, and the ping timeout.
- **Live test:**
  - `npm run test:live` isn't part of `npm test`. It needs the servers running and reads an untracked `live.config.json` holding a test account.
  - Through the gateway it logs in, lists characters, creates `WebTest<n>` and deletes it.
  - With the rebuilt certifier, it also checks:
    - a wrong password from simulated address A doesn't block address B. With one shared address, B would get the 15-second block;
    - optionally, an address listed in `IPCut.ini` is refused while others get in.
  - It uses a trusted-proxy setup so it can simulate several addresses.
- **Devices:** a Piece 2 section in `docs/device-testing.md` covers the lobby on the 4 test devices over Wi-Fi, with two devices logged in at the same time.

---

## 8. Hosting guide (written now, carried out when a machine exists)

`docs/hosting.md` covers a Windows machine running the 7 servers:
- **Gateway:** Node LTS, with the gateway running as a Windows service.
- **Caddy, also a Windows service:**
  - Serves the built client and the converted game files.
  - Passes `/connect/` on to the gateway.
  - Gets its certificate from Let's Encrypt.
- **Domain:** an IPv4 record only, because the certifier stores IPv4 addresses. IPv6-only phone networks still reach it through their carrier's translation.
- **Firewall:** only 443 open. Port 80 is optional and only redirects to HTTPS. Ports 23000, 28000 and 5400 are closed.
- **Gateway config:** `allowedOrigins` holds the site's address, `trustedProxies` holds `127.0.0.1` (Caddy), and the route table is keyed by the hosted build's `NEUZ_IPSET`.

---

## 9. Done criteria for Piece 2

1. On a phone over Wi-Fi and on desktop Chrome, the lobby logs in, shows servers and channels, and lists, creates and deletes characters.
2. All recorded-packet tests, unit tests and gateway tests pass.
3. The rebuilt certifier applies its lockout, and the account server its `IPCut.ini` bans, per real player address.
4. A wrong password, an unreachable server and a banned account each show a clear message.
5. `docs/hosting.md` is written.

## 10. Out of scope

Entering the world, the cache-server connection, the second-password number pad at character select, automatic reconnects, deploying to a hosted machine, and non-ASCII character names.

## 11. Risks

| Risk | Mitigation |
|---|---|
| The recorder can't sit where Neuz connects (`NEUZ_IPSET`, port 23000) while the servers use the same ports | The plan's first task tries it. Fallback: Wireshark with Npcap loopback capture, plus a small converter to the fixture format. |
| PLAYER_LIST (the character list) carries full character data and is long | Its decoder is driven by the recording and must consume every byte. |
| The rebuilt `Certifier.exe` also picks up any other uncommitted changes in `Source/` | The owner confirms `Source/` matches what's running before swapping the exe. The patch file records exactly what Piece 2 changed. |
| Phones drop WebSockets when the browser goes to the background | Piece 2 returns to the login form. Reconnecting comes with Piece 6. |
| The password hash works like a password for the login server and travels unencrypted inside the packets | `wss://` protects it on the internet; the gateway talks to the servers only on the same machine; the gateway never logs packet contents. |
| The salt and AES key are visible in the browser code | They're already inside Neuz.exe today; nothing new is exposed. |

# Piece 2: Gateway + Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A WebSocket gateway in front of the FlyFF servers, a TypeScript protocol library, and a lobby page that logs in, lists characters, and creates and deletes a character from a phone.

**Architecture:**
- `packages/protocol` holds everything about bytes: `CAr` read/write, framing, crypto and one encoder or decoder per packet. It has no Node-only APIs.
- `apps/gateway` (Node) pairs each WebSocket with one TCP connection. It does the FlyFF framing, adds the player's real address on certifier connections, and enforces limits.
- `apps/client` (Vite) is the lobby. A small `LoginFlow` state machine drives the packets, and plain DOM views show them.
- A recording of one real Neuz login (`tools/capture`) is the test data the packet code must match.
- A small C++ change lets the certifier accept the real address from the gateway.

**Tech stack:** Node 24, npm workspaces, TypeScript (strict), Vitest, `ws` 8, Vite 8, Playwright, MSBuild (VS 2022 Professional) for the certifier.

**Spec:** `docs/superpowers/specs/2026-10-22-piece2-gateway-protocol-design.md`. Read it first; this plan argues from it.

**Where work happens:**
- All TypeScript work is in this repository (FlyffWeb, webflyff on GitHub), on branch `piece2-gateway`.
- The C++ change is made in the server folder next to this repository (`../Source`, not tracked by git) and saved here as a patch file.
- Paths below starting with `../` are relative to FlyffWeb.

## Global Constraints

- **No Node-only APIs in `packages/protocol/src`:** no `Buffer`, no `node:` imports. Its tsconfig sets `"types": []` to enforce this.
- **Byte order:** little-endian for every number. A string is an `i32` byte count followed by the bytes, with no terminator (`CAr::WriteString`).
- **Text:**
  - Text from servers is decoded with `new TextDecoder('windows-1252')`, the client's code page from `IDS_CODEPAGE` 1252.
  - Text we send is ASCII only (0x20–0x7E); anything else throws a `ProtocolError`.
- **Constants (copy exactly):**

| Constant | Value |
|---|---|
| Protocol version | `'20100412'` |
| Password salt | `'kikugalanet'` |
| Certify AES key | `'dldhsvmflvm'`, zero-padded to 16 bytes, zero IV |
| Certify block | 672 bytes |
| `DPID_UNKNOWN` | `0xFFFFFFFF` |
| `NULL_ID` | `0xFFFFFFFF` |
| Ports | certifier 23000, login 28000, cache 5400 |
| Advertised server address | `172.31.238.55` |
| `PACKETTYPE_GATEWAY_CLIENT_ADDR` | `0x000000E0` (checked unused in `MsgHdr.h`) |
| Character slots | 3 |
| Bank PIN | 4 digits |

- **Gateway close codes:** 4001 server unreachable, 4002 server closed, 4003 not allowed, 4004 too big or too frequent, 4005 bad server data, 4006 forbidden packet, 4007 too many connections.
- **Gateway limits:**

| Limit | Value |
|---|---|
| Browser packet size | 16384 bytes |
| Browser packets per second | 100 |
| Connections per address | 8 |
| Server body size | 1048576 bytes |
| TCP connect timeout | 10000 ms |
| Ping interval / pong timeout | 30000 ms / 60000 ms |
| Packets held before the protocol ID | 4 |

- **Certify reply timeout:** 20000 ms.
- **Never committed:**
  - `apps/gateway/gateway.config.json` and `apps/client/test/live.config.json`;
  - packet contents in logs.
- **Recorded fixtures use a throwaway account only.**
- **C++ files in `../Source` are CP949.** Edit them only with a byte-preserving script: read and write as `latin1`, insert ASCII-only text. Never re-save them as UTF-8. Keep CRLF line endings.
- **Commit messages:** `type(scope): summary` with scopes `protocol`, `gateway`, `capture`, `client`, `certifier`, `docs`. Every message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Stage explicit paths only.**

## Review Focus

1. **TCP splits and merges frames anywhere,** even inside a 13-byte header. Every frame reader must give the same bodies whether bytes arrive one at a time or all in one chunk. Tests are in Task 2.
2. **A browser can send before the server's protocol ID arrives.** Up to 4 packets are held and then sent in order; a fifth closes with 4004. Tests are in Task 8.
3. **The server can close in the middle of a frame.** The gateway closes the WebSocket with 4002 and doesn't throw. Tests are in Task 8.
4. **Account names typed with capitals or spaces** must be trimmed and lower-cased before CERTIFY and before comparing the server's account echo. Neuz does this, and a mismatch is a hard failure. Tests are in Task 11.
5. **A phone that sleeps leaves a dead WebSocket.** The ping timeout must close the TCP side too, so the certifier and login server don't keep the session. Tests are in Task 9.

---

## File Structure

```
FlyffWeb/
  package.json                      (modify: scripts, typecheck)
  vitest.config.ts                  (modify: exclude *.live.test.ts)
  vitest.live.config.ts             (create)
  .gitignore                        (modify)
  .gitattributes                    (create: patch files are binary)
  packages/protocol/                (create)
    package.json, tsconfig.json, tsconfig.test.json
    src/index.ts                    re-exports everything below
    src/errors.ts                   ProtocolError
    src/hex.ts                      hexToBytes, bytesToHex
    src/text.ts                     decodeText, encodeAscii
    src/ar/ArReader.ts, src/ar/ArWriter.ts
    src/framing/crc32.ts, clientFrame.ts, serverFrame.ts, protocolId.ts
    src/crypto/md5.ts, aes128.ts, password.ts
    src/constants.ts                PacketType, ports, version, DPID_UNKNOWN, NULL_ID
    src/gatewayCloseCodes.ts        CloseCode
    src/recording.ts                Recording types + parseRecording
    src/messages/certifier.ts, src/messages/login.ts
    test/*.test.ts, test/helpers/*.ts, test/fixtures/neuz-login.json, test/fixtures/README.md
  packages/testkit/                 (create; Node-only test helpers)
    package.json, tsconfig.json, src/index.ts, src/fakeFlyffServer.ts
  tools/capture/                    (create)
    package.json, tsconfig.json, README.md, src/capture.ts, src/cli.ts, test/capture.test.ts
  apps/gateway/                     (create)
    package.json, tsconfig.json, gateway.config.example.json
    src/config.ts, clientAddress.ts, relay.ts, limits.ts, server.ts, log.ts, main.ts
    test/*.test.ts, test/helpers/wsClient.ts
  apps/client/                      (create)
    package.json, tsconfig.json, vite.config.ts, index.html, playwright.config.ts
    src/main.ts, src/config.ts, src/style.css
    src/net/PacketChannel.ts, src/net/webSocketChannel.ts
    src/lobby/LoginFlow.ts, errorText.ts, validation.ts, appearance.ts, LobbyApp.ts
    src/lobby/views/*.ts
    test/*.test.ts, test/helpers/fakeChannel.ts, test/helpers/nodeChannel.ts
    test/lobby.live.test.ts, test/live.config.example.json, e2e/lobby.spec.ts
  server-patches/                   (create)
    certifier-client-addr.patch, README.md
  docs/hosting.md                   (create)
  docs/device-testing.md            (modify: Piece 2 section)
  README.md                         (modify)
```

---

### Task 1: Protocol package with binary reader, writer and text

**Files:**
- Create:
  - `packages/protocol/package.json`, `tsconfig.json`, `tsconfig.test.json`
  - `packages/protocol/src/index.ts`, `errors.ts`, `hex.ts`, `text.ts`, `ar/ArReader.ts`, `ar/ArWriter.ts`
- Modify: `package.json` (root): add both protocol tsconfigs to `typecheck`.
- Test: `packages/protocol/test/ar.test.ts`, `text.test.ts`

**Interfaces:**
- Produces:
  - `class ProtocolError extends Error { constructor(message: string, readonly offset?: number) }`
  - `hexToBytes(hex: string): Uint8Array`, `bytesToHex(bytes: Uint8Array): string` (lowercase, no separators)
  - `decodeText(bytes: Uint8Array): string` (windows-1252); `encodeAscii(text: string): Uint8Array` (throws `ProtocolError` outside 0x20–0x7E)
  - `class ArReader`:
    - `constructor(bytes: Uint8Array)`
    - `offset: number`, `remaining(): number`
    - `u8()`, `u16()`, `u32()`, `i32()`, `f32()` (all `number`), `i64(): bigint`
    - `bytes(n): Uint8Array`
    - `string(bufSize: number): string`: copies `CAr::ReadString(lpsz, nBufSize)`, throwing when the length is `< 0` or `> bufSize - 1`
    - `vec3(): [number, number, number]`
    - `expectEnd(): void`
    - Every overrun throws `ProtocolError` with the offset.
  - `class ArWriter`:
    - `u8`, `u16`, `u32`, `i32`, `f32`, `i64(bigint)`, `bytes(Uint8Array)`, `string(text)` (ASCII via `encodeAscii`), `vec3` — all return `this`
    - `toBytes(): Uint8Array`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/protocol/test/ar.test.ts
import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, ProtocolError, bytesToHex } from '../src';

describe('ArWriter / ArReader', () => {
  it('writes CAr strings as i32 length + bytes, little-endian', () => {
    const bytes = new ArWriter().u32(0xfc).string('20100412').toBytes();
    expect(bytesToHex(bytes)).toBe('fc000000' + '08000000' + '3230313030343132');
  });
  it('round-trips every type', () => {
    const w = new ArWriter().u8(0xab).u16(0xbeef).u32(0xffffffff).i32(-2).f32(1.5).i64(-5n).vec3([1, 2, 3]).string('Hi');
    const r = new ArReader(w.toBytes());
    expect([r.u8(), r.u16(), r.u32(), r.i32(), r.f32(), r.i64()]).toEqual([0xab, 0xbeef, 0xffffffff, -2, 1.5, -5n]);
    expect(r.vec3()).toEqual([1, 2, 3]);
    expect(r.string(16)).toBe('Hi');
    expect(() => r.expectEnd()).not.toThrow();
  });
  it('rejects a string longer than the C++ buffer allows', () => {
    const r = new ArReader(new ArWriter().string('abcdefghijklmnop').toBytes()); // 16 bytes
    expect(() => r.string(16)).toThrow(ProtocolError); // CAr allows bufSize - 1 = 15
  });
  it('throws on overrun and on leftover bytes', () => {
    expect(() => new ArReader(new Uint8Array(3)).u32()).toThrow(/offset 0/);
    const r = new ArReader(new Uint8Array(5)); r.u32();
    expect(() => r.expectEnd()).toThrow(ProtocolError);
  });
});
```

```ts
// packages/protocol/test/text.test.ts
import { expect, it } from 'vitest';
import { decodeText, encodeAscii, ProtocolError } from '../src';

it('decodes server text as windows-1252', () => {
  expect(decodeText(new Uint8Array([0x46, 0x6c, 0x79, 0xe9, 0x80]))).toBe('Flyé€');
});
it('encodes printable ASCII only', () => {
  expect(Array.from(encodeAscii('Ab 1~'))).toEqual([0x41, 0x62, 0x20, 0x31, 0x7e]);
  expect(() => encodeAscii('é')).toThrow(ProtocolError);
  expect(() => encodeAscii('a\nb')).toThrow(ProtocolError);
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run packages/protocol`
Expected: FAIL, because `../src` doesn't exist.

- [ ] **Step 3: Implement the package**

- `package.json`: name `@flyffweb/protocol`, `"type": "module"`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, no dependencies.
- `tsconfig.json`: extends `../../tsconfig.base.json` with `"compilerOptions": { "lib": ["ES2023", "DOM"], "types": [] }` and `"include": ["src"]`.
- `tsconfig.test.json`: extends the base and includes `src` and `test`.
- The reader and writer use `DataView`. The writer grows a `Uint8Array` by doubling.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS, and the typecheck exits with 0.

- [ ] **Step 5: Commit**

```bash
git add package.json packages/protocol
git commit -m "feat(protocol): CAr reader and writer, windows-1252 text, hex helpers"
```

---

### Task 2: CRC32 and frame codecs

**Files:**
- Create: `packages/protocol/src/framing/crc32.ts`, `clientFrame.ts`, `serverFrame.ts`, `protocolId.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/framing.test.ts`

**Interfaces:**
- Consumes: `ProtocolError`, `ArReader` (Task 1).
- Produces:
  - `crc32(bytes: Uint8Array): number`: unsigned, standard reflected CRC-32. It matches Crypto++ `CRC32` as used in `Source/_Network/Net/Src/buffer.cpp:146-174`.
  - Client frames:
    - `CLIENT_HEADER_SIZE = 13`
    - `encodeClientFrame(body: Uint8Array, protocolId: number): Uint8Array`
    - `class ClientFrameReader { constructor(protocolId: number); push(chunk: Uint8Array): Uint8Array[] }`. It throws `ProtocolError` on a missing `'^'` or a checksum mismatch.
  - Server frames:
    - `SERVER_HEADER_SIZE = 5`
    - `encodeServerFrame(body: Uint8Array): Uint8Array`
    - `class ServerFrameReader { constructor(maxBodyBytes = 1048576); push(chunk: Uint8Array): Uint8Array[] }`. It throws on a missing `'^'` or an oversized body.
  - Protocol ID:
    - `readProtocolId(body: Uint8Array): number | undefined`: the ID when the body is 8 bytes and its first `u32` is 0.
    - `encodeProtocolIdBody(protocolId: number): Uint8Array`

The client header is `'^'` (0x5E), `~(crc32(le32(length)) ^ protocolId)`, `le32(length)`, `~(crc32(body) ^ protocolId)`, all `>>> 0`. The server header is `'^'`, `le32(length)`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/protocol/test/framing.test.ts
import { describe, expect, it } from 'vitest';
import {
  ClientFrameReader, ServerFrameReader, ProtocolError, bytesToHex, crc32, encodeClientFrame,
  encodeProtocolIdBody, encodeServerFrame, hexToBytes, readProtocolId,
} from '../src';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check value', () => expect(crc32(ascii('123456789'))).toBe(0xcbf43926));
});

describe('client frames', () => {
  const keepAlive = new Uint8Array([0x18, 0, 0, 0]);
  it('encodes the 13-byte header (value computed with node:zlib crc32)', () => {
    expect(bytesToHex(encodeClientFrame(keepAlive, 0x12345678))).toBe('5ecce1ed4304000000eb09225918000000');
  });
  it('reads frames split at every byte and merged into one chunk', () => {
    const a = encodeClientFrame(keepAlive, 7), b = encodeClientFrame(ascii('hello'), 7);
    const all = new Uint8Array([...a, ...b]);
    const r1 = new ClientFrameReader(7);
    const split = [...all].flatMap((byte) => r1.push(new Uint8Array([byte])));
    expect(split.map(bytesToHex)).toEqual([bytesToHex(keepAlive), bytesToHex(ascii('hello'))]);
    expect(new ClientFrameReader(7).push(all)).toHaveLength(2);
  });
  it('rejects a wrong protocol ID and a missing marker', () => {
    expect(() => new ClientFrameReader(8).push(encodeClientFrame(keepAlive, 7))).toThrow(ProtocolError);
    expect(() => new ClientFrameReader(7).push(new Uint8Array(13))).toThrow(ProtocolError);
  });
});

describe('server frames', () => {
  it('encodes and reads the 5-byte header across chunk boundaries', () => {
    const f = encodeServerFrame(ascii('abc'));
    expect(bytesToHex(f)).toBe('5e03000000616263');
    const r = new ServerFrameReader();
    expect(r.push(f.subarray(0, 2))).toEqual([]);
    expect(r.push(f.subarray(2)).map(bytesToHex)).toEqual(['616263']);
  });
  it('rejects oversized bodies', () => {
    expect(() => new ServerFrameReader(2).push(encodeServerFrame(ascii('abc')))).toThrow(ProtocolError);
  });
});

describe('protocol ID', () => {
  it('recognises the 8-byte ID body only', () => {
    expect(readProtocolId(encodeProtocolIdBody(0xdeadbeef))).toBe(0xdeadbeef);
    expect(bytesToHex(encodeProtocolIdBody(1))).toBe('0000000001000000');
    expect(readProtocolId(hexToBytes('1800000000000000'))).toBeUndefined();
    expect(readProtocolId(hexToBytes('00000000'))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run packages/protocol/test/framing.test.ts`
Expected: FAIL, because the exports are missing.

- [ ] **Step 3: Implement the four files and export them from `src/index.ts`**

`crc32` uses a lazily built table for polynomial `0xEDB88320`. The readers keep a pending `Uint8Array` and return every complete body each time `push` is called.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): CRC32 and FlyFF client/server frame codecs"
```

---

### Task 3: Test kit fake server and the capture relay

**Files:**
- Create:
  - `packages/testkit/package.json` (`@flyffweb/testkit`, depends on `@flyffweb/protocol`), `tsconfig.json`, `src/index.ts`, `src/fakeFlyffServer.ts`
  - `packages/protocol/src/recording.ts` (exported from the index)
  - `tools/capture/package.json` (`@flyffweb/capture`), `tsconfig.json`, `src/capture.ts`, `src/cli.ts`, `README.md`
- Modify: root `package.json` with a `capture` script (`tsx tools/capture/src/cli.ts`) and typecheck entries for `packages/testkit` and `tools/capture`.
- Test: `tools/capture/test/capture.test.ts`

**Interfaces:**
- Consumes: frame codecs and `readProtocolId` (Task 2), `bytesToHex` (Task 1).
- Produces:
  - Recording types:
    - `interface RecordedPacket { port: number; connection: number; direction: 'c2s' | 's2c'; hex: string }`
    - `interface Recording { account: string; password: string; bankPin: string; packets: RecordedPacket[] }`
    - `parseRecording(json: unknown): Recording` throws `ProtocolError` on a wrong shape.
  - Fake server: `startFakeFlyffServer(opts?: { protocolId?: number; onBody?: (body: Uint8Array, reply: (body: Uint8Array) => void) => void }): Promise<FakeFlyffServer>`, where `FakeFlyffServer` has:
    - `port: number`, `protocolId: number`
    - `received: Uint8Array[]`: client bodies in arrival order, across connections
    - `connections: number`, `crcErrors: number`
    - `send(body)`: to the newest connection
    - `dropClients()`: destroys all sockets
    - `waitForBodies(n): Promise<void>`
    - `close(): Promise<void>`
    - On accept it sends `encodeServerFrame(encodeProtocolIdBody(protocolId))`. A client frame with a bad checksum counts in `crcErrors` and destroys that socket.
  - Capture:
    - `startCapture(opts: { listenHost: string; targetHost: string; routes: { listenPort: number; targetPort: number }[]; meta: { account: string; password: string; bankPin: string } }): Promise<CaptureHandle>`
    - `CaptureHandle { listenPorts: number[]; recording(): Recording; close(): Promise<void> }`
    - Each accepted connection gets a number (1, 2, …) and opens TCP to `targetHost:targetPort`.
    - Server bytes go through `ServerFrameReader`. The first body sets the protocol ID, and client bytes are buffered until it's known; after that they go through `ClientFrameReader`.
    - Every body is appended in arrival order, with `port` set to `targetPort`.
- CLI:

  ```
  npm run capture -- --listen 172.31.238.55 --target 127.0.0.1 --ports 23000,28000 --account <a> --password <p> --pin <pin> --out packages/protocol/test/fixtures/neuz-login.json
  ```

  It writes the file after every connection closes and on Ctrl+C.

- [ ] **Step 1: Write the failing test**

```ts
// tools/capture/test/capture.test.ts
import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { bytesToHex, encodeClientFrame, ServerFrameReader, readProtocolId } from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServer } from '@flyffweb/testkit';
import { startCapture, type CaptureHandle } from '../src/capture';

let server: FakeFlyffServer | undefined; let capture: CaptureHandle | undefined;
afterEach(async () => { await capture?.close(); await server?.close(); });

it('records the protocol ID, client bodies and server bodies in order', async () => {
  server = await startFakeFlyffServer({ protocolId: 0x1234, onBody: (_b, reply) => reply(new Uint8Array([0xfd, 0, 0, 0])) });
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', routes: [{ listenPort: 0, targetPort: server.port }],
    meta: { account: 'acc', password: 'pw', bankPin: '1234' },
  });
  const sock = net.connect(capture.listenPorts[0]!, '127.0.0.1');
  const reader = new ServerFrameReader();
  const bodies: Uint8Array[] = [];
  sock.on('data', (d) => bodies.push(...reader.push(new Uint8Array(d))));
  await expect.poll(() => bodies.length).toBe(1);
  sock.write(encodeClientFrame(new Uint8Array([0xfc, 0, 0, 0]), readProtocolId(bodies[0]!)!));
  await expect.poll(() => bodies.length).toBe(2);
  sock.destroy();
  const rec = capture.recording();
  expect(rec.account).toBe('acc');
  expect(rec.packets.map((p) => [p.connection, p.direction, p.hex, p.port])).toEqual([
    [1, 's2c', '0000000034120000', server.port],
    [1, 'c2s', 'fc000000', server.port],
    [1, 's2c', 'fd000000', server.port],
  ]);
  expect(server.crcErrors).toBe(0);
  expect(bytesToHex(server.received[0]!)).toBe('fc000000');
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `npx vitest run tools/capture`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement the test kit, the recording types, the capture relay and the CLI**

Then run `npm install` so the new workspaces link.

`tools/capture/README.md` gives the owner these steps:
1. **Make the address local.** Neuz connects to `172.31.238.55` (compiled in as `NEUZ_IPSET`). Skip this step if this PC already answers on that address, which it does when Neuz normally reaches your local servers. Otherwise run, as administrator:

   ```
   netsh interface ipv4 add address "vEthernet (Default Switch)" 172.31.238.55 255.255.255.255
   ```

2. **Start the servers,** then run the capture command above with a throwaway account, its password and its 4-digit Bank PIN. The servers listen on all addresses, so the capture can take `172.31.238.55` on ports 23000 and 28000 for itself.
3. **Run Neuz and do one session:**
   - log in;
   - pick the first channel;
   - create a character in an empty slot (name `WebCapture1`) with that Bank PIN;
   - delete it with the same Bank PIN;
   - close Neuz at the character list. Don't enter the world.
4. **Press Ctrl+C** in the capture window. Then remove the address again, as administrator:

   ```
   netsh interface ipv4 delete address "vEthernet (Default Switch)" 172.31.238.55
   ```

   Skip this if you didn't add it.
5. **Fallback, only if step 2 fails with `EADDRINUSE`:** install Wireshark with Npcap, capture on the loopback adapter with filter `tcp port 23000 or tcp port 28000`, and send the `.pcapng` to Claude to convert.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tools/capture packages && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json packages/testkit packages/protocol/src tools/capture
git commit -m "feat(capture): recording relay for a Neuz login, fake FlyFF server test kit"
```

---

### Task 4: Record one Neuz session (owner checkpoint, no subagent)

The controller runs this task with the owner. It produces the test data that Tasks 6 and 7 must match.

**Files:**
- Create: `packages/protocol/test/fixtures/neuz-login.json` (written by the capture tool), `packages/protocol/test/fixtures/README.md`

- [ ] **Step 1: Ask the owner to follow `tools/capture/README.md` steps 1–4**

They send back the path of the written file. The account must be a throwaway; its password and Bank PIN end up in the fixture.

- [ ] **Step 2: Check the recording has what later tasks need**

Run: `node -e "const r=require('./packages/protocol/test/fixtures/neuz-login.json');const t=(p)=>{const b=Buffer.from(p.hex,'hex');return b.length>=8&&b.readUInt32LE(0)===0xffffffff?b.readUInt32LE(4):b.readUInt32LE(0)};console.log(r.packets.map(p=>p.port+' '+p.connection+' '+p.direction+' 0x'+t(p).toString(16)).join('\n'))"`

Expected:
- port 23000, c2s: `0xfc`;
- port 23000, s2c: `0xfd`;
- port 28000, c2s: `0x0b` and `0xf6`, then later `0xf4` and `0xf5`;
- port 28000, s2c: `0xf3` at least three times (before create, after create, after delete).

If anything is missing, ask the owner to repeat the session.

- [ ] **Step 3: Write `fixtures/README.md`**

It records:
- that the account is a throwaway, and the date;
- the packet-type sequence from Step 2;
- when Neuz closed the certifier connection, relative to the first `0xf3`. Task 11's `LoginFlow` follows this;
- any client packet type not in this list: `0xfc, 0x18, 0x16, 0xfe, 0x0b, 0xf6, 0xf4, 0xf5, 0x14`. Each one found becomes an encoder in Task 7.

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/test/fixtures
git commit -m "test(protocol): recorded Neuz login, character create and delete"
```

---

### Task 5: MD5, AES-128-CBC and password helpers

**Files:**
- Create: `packages/protocol/src/crypto/md5.ts`, `aes128.ts`, `password.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/crypto.test.ts`

**Interfaces:**
- Consumes: `encodeAscii`, `hexToBytes` (Task 1).
- Produces:
  - `md5Hex(bytes: Uint8Array): string`: lowercase, as `md5()` in `Source/_Network/tools.cpp` (`%02x`).
  - `aes128CbcEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Uint8Array` and `aes128CbcDecrypt(...)`. No padding; a length that isn't a multiple of 16 throws `ProtocolError`.
  - Constants: `PASSWORD_SALT = 'kikugalanet'`, `CERTIFY_KEY_TEXT = 'dldhsvmflvm'`, `CERTIFY_BLOCK_BYTES = 672`.
  - `hashPassword(plain: string): string`: returns `plain` unchanged when it's 32 characters long, otherwise `md5Hex(encodeAscii(PASSWORD_SALT + plain))`. This copies `CNeuzApp::HashMD5`.
  - `encryptCertifyPassword(hash: string): Uint8Array`: 672 bytes. The plaintext is the hash's ASCII followed by zeros; the key is `CERTIFY_KEY_TEXT` zero-padded to 16 bytes; the IV is zeros.
  - `deleteKey(secondPassword: string): string`, which is `hashPassword(secondPassword)` (`CNeuzApp::GetDeleteKey`).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/protocol/test/crypto.test.ts
import { expect, it } from 'vitest';
import {
  aes128CbcDecrypt, aes128CbcEncrypt, bytesToHex, deleteKey, encryptCertifyPassword, hashPassword, hexToBytes, md5Hex,
} from '../src';

const ascii = (s: string) => new TextEncoder().encode(s);

it('md5 matches RFC 1321', () => {
  expect(md5Hex(ascii(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  expect(md5Hex(ascii('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  expect(md5Hex(ascii('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))
    .toBe('57edf4a22be3c955ac49da2e2107b67a');
});
it('AES-128 matches FIPS-197 C.1 and SP 800-38A F.2.1/F.2.2', () => {
  const zero = new Uint8Array(16);
  expect(bytesToHex(aes128CbcEncrypt(hexToBytes('000102030405060708090a0b0c0d0e0f'), zero,
    hexToBytes('00112233445566778899aabbccddeeff')))).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  const key = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c'), iv = hexToBytes('000102030405060708090a0b0c0d0e0f');
  const plain = hexToBytes('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51');
  const cipher = '7649abac8119b246cee98e9b12e9197d5086cb9b507219ee95db113a917678b2';
  expect(bytesToHex(aes128CbcEncrypt(key, iv, plain))).toBe(cipher);
  expect(bytesToHex(aes128CbcDecrypt(key, iv, hexToBytes(cipher)))).toBe(bytesToHex(plain));
});
it('hashes passwords like CNeuzApp::HashMD5 (values from node:crypto)', () => {
  expect(hashPassword('password1')).toBe('3b5ffae22d7c5fb42e78138211ea4bf1');
  expect(hashPassword('3b5ffae22d7c5fb42e78138211ea4bf1')).toBe('3b5ffae22d7c5fb42e78138211ea4bf1');
  expect(deleteKey('1234')).toBe('cbad55c0bf841aef57382b0d33440620');
});
it('encrypts the 672-byte certify block (value from node:crypto aes-128-cbc)', () => {
  const block = encryptCertifyPassword(hashPassword('password1'));
  expect(block).toHaveLength(672);
  expect(bytesToHex(block.subarray(0, 32))).toBe('5c0d542c1a00daad4338c67e374bf216a0e246238b59e0d655db88e045bdaf3d');
  expect(bytesToHex(block.subarray(656))).toBe('1150145739c2460d436a114f498b0052');
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run packages/protocol/test/crypto.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the three files**

Write a table-based AES with an inverse cipher for decryption, following FIPS-197, plus MD5 from RFC 1321. WebCrypto isn't used, because pages served over plain HTTP on Wi-Fi don't have it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): MD5, AES-128-CBC and FlyFF password hashing and certify block"
```

---

### Task 6: Packet constants and certifier messages

**Files:**
- Create: `packages/protocol/src/constants.ts`, `src/messages/certifier.ts`, `test/helpers/fixtures.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/certifier.test.ts`

**Interfaces:**
- Consumes: `ArReader`, `ArWriter`, `decodeText` (Task 1); `encryptCertifyPassword` (Task 5); `parseRecording`, `readProtocolId`, `hexToBytes`.
- Produces:
  - `PacketType`:

    ```
    QUERYTICKCOUNT: 0x0b, PING: 0x14, CLOSE_EXISTING_CONNECTION: 0x16, ONE_HOUR_NOTIFY: 0x17,
    KEEP_ALIVE: 0x18, GATEWAY_CLIENT_ADDR: 0xe0, CACHE_ADDR: 0xf2, PLAYER_LIST: 0xf3,
    CREATE_PLAYER: 0xf4, DEL_PLAYER: 0xf5, GETPLAYERLIST: 0xf6, CERTIFY: 0xfc, SRVR_LIST: 0xfd,
    ERROR: 0xfe, ERROR_STRING: 0x70000003, LOGIN_PROTECT_NUMPAD: 0x88100200,
    LOGIN_PROTECT_CERT: 0x88100201
    ```

    It's an `as const` object.
  - Other constants: `PROTOCOL_VERSION`, `DPID_UNKNOWN`, `NULL_ID`, `Port = { CERTIFIER: 23000, LOGIN: 28000, CACHE: 5400 }`, `MAX_CHARACTER_SLOTS = 3`.
  - Encoders:
    - `encodeCertify(account: string, passwordHash: string): Uint8Array`: type, `string(PROTOCOL_VERSION)`, `string(account)`, `bytes(encryptCertifyPassword(hash))`
    - `encodeKeepAlive()`: type only
    - `encodeErrorReply()`: `PacketType.ERROR` only, which Neuz sends after ERROR_STRING
    - `encodeCloseExistingConnection(account, passwordHash)`: type, `string(account)`, `string(hash)`
    - `encodeGatewayClientAddr(address: string)`: type, `string(address)`
  - `interface ServerEntry { parent: number; id: number; name: string; address: string; adult: number; playerCount: number; enabled: number; maxPlayers: number }`
  - `type CertifierMessage =`
    - `{ type: 'serverList'; authKey: number; accountFlag: number; account: string; servers: ServerEntry[] }`
    - `| { type: 'error'; code: number }`
    - `| { type: 'errorString'; text: string }`
    - `| { type: 'keepAlive' }`
    - `| { type: 'unknown'; packetType: number }`
  - `decodeCertifierMessage(body: Uint8Array): CertifierMessage` calls `expectEnd()` on every known type. The SRVR_LIST layout, from `CDPCertifier::SendServerList` with only `__GPAUTH_01` and `__EUROPE_0514` active for English, is:
    - `u32` authKey, `u8` accountFlag, `string(42)` account echo;
    - `u32` count, then for each entry:
      - `u32` parent, `u32` id
      - `string(36)` name, `string(16)` address
      - `i32` adult, `i32` playerCount, `i32` enabled, `i32` maxPlayers
  - ERROR is an `i32` code. ERROR_STRING is a `string(256)`.
  - Test helper `test/helpers/fixtures.ts`:
    - `loadRecording(): Recording`
    - `packetsFor(rec, port, direction): RecordedPacket[]`, without the protocol-ID bodies
    - `typeOf(body): number`, which reads the `u32` at offset 4 when offset 0 is `DPID_UNKNOWN`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/protocol/test/certifier.test.ts
import { describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, PacketType, aes128CbcDecrypt, bytesToHex, decodeCertifierMessage, encodeCertify,
  encodeKeepAlive, hashPassword, hexToBytes,
} from '../src';
import { loadRecording, packetsFor, typeOf } from './helpers/fixtures';

const serverList = () => new ArWriter().u32(PacketType.SRVR_LIST).u32(0x01020304).u8(0).string('webtester')
  .u32(2)
  .u32(0xffffffff).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0)
  .u32(1).u32(1).string('Channel 1').string('').i32(1).i32(12).i32(1).i32(500).toBytes();

describe('certifier messages', () => {
  it('decodes SRVR_LIST in the CDPCertifier::SendServerList order', () => {
    const m = decodeCertifierMessage(serverList());
    expect(m).toEqual({
      type: 'serverList', authKey: 0x01020304, accountFlag: 0, account: 'webtester', servers: [
        { parent: 0xffffffff, id: 1, name: 'FlyFF', address: '172.31.238.55', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 0 },
        { parent: 1, id: 1, name: 'Channel 1', address: '', adult: 1, playerCount: 12, enabled: 1, maxPlayers: 500 },
      ],
    });
  });
  it('decodes ERROR, ERROR_STRING, KEEP_ALIVE and reports unknown types', () => {
    expect(decodeCertifierMessage(new ArWriter().u32(PacketType.ERROR).i32(120).toBytes())).toEqual({ type: 'error', code: 120 });
    expect(decodeCertifierMessage(new ArWriter().u32(PacketType.ERROR_STRING).string('x').toBytes())).toEqual({ type: 'errorString', text: 'x' });
    expect(decodeCertifierMessage(encodeKeepAlive())).toEqual({ type: 'keepAlive' });
    expect(decodeCertifierMessage(hexToBytes('99000000'))).toEqual({ type: 'unknown', packetType: 0x99 });
  });
  it('rejects trailing bytes on a known type', () => {
    expect(() => decodeCertifierMessage(new Uint8Array([...serverList(), 0]))).toThrow();
  });
  it('encodes CERTIFY as type, version, account, 672-byte block', () => {
    const r = new ArReader(encodeCertify('webtester', hashPassword('password1')));
    expect(r.u32()).toBe(PacketType.CERTIFY);
    expect(r.string(32)).toBe('20100412');
    expect(r.string(42)).toBe('webtester');
    expect(bytesToHex(r.bytes(672).subarray(0, 16))).toBe('5c0d542c1a00daad4338c67e374bf216');
    r.expectEnd();
  });
});

describe('recorded Neuz session, certifier port', () => {
  const rec = loadRecording();
  it('decodes every server body to a known message', () => {
    for (const p of packetsFor(rec, 23000, 's2c')) {
      expect(decodeCertifierMessage(hexToBytes(p.hex)).type).not.toBe('unknown');
    }
  });
  it('re-encodes CERTIFY: same fields, block decrypts to the same password hash', () => {
    const recorded = hexToBytes(packetsFor(rec, 23000, 'c2s').find((p) => typeOf(hexToBytes(p.hex)) === PacketType.CERTIFY)!.hex);
    const ours = encodeCertify(rec.account, hashPassword(rec.password));
    expect(bytesToHex(recorded.subarray(0, recorded.length - 672))).toBe(bytesToHex(ours.subarray(0, ours.length - 672)));
    const key = new Uint8Array(16); key.set(new TextEncoder().encode('dldhsvmflvm'));
    const plain = aes128CbcDecrypt(key, new Uint8Array(16), recorded.subarray(recorded.length - 672));
    expect(new TextDecoder().decode(plain.subarray(0, plain.indexOf(0)))).toBe(hashPassword(rec.password));
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run packages/protocol/test/certifier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `constants.ts`, `messages/certifier.ts` and the fixture helper**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS. If the recorded tests fail, the C++ layout or a build flag was read wrong:
1. compare against `CDPCertifier::SendServerList` and `CDPCertified::SendCertify`;
2. fix the decoder;
3. note the finding in `test/fixtures/README.md`.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): packet constants, CERTIFY and server-list messages, checked against the recording"
```

---

### Task 7: Login-server messages

**Files:**
- Create: `packages/protocol/src/messages/login.ts`, `test/helpers/clientDecoders.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/test/login.test.ts`

**Interfaces:**
- Consumes: Task 6 constants, `deleteKey` (Task 5), the fixture helpers.
- Produces. Every client encoder starts with `u32(DPID_UNKNOWN)`, then the type (`BEFORESENDSOLE`):
  - `encodeQueryTickCount(timeMs: number)`: `u32(timeMs >>> 0)`
  - `encodeGetPlayerList(authKey: number, account: string, passwordHash: string, channelId: number)`: `string(PROTOCOL_VERSION)`, `u32 authKey`, `string account`, `string hash`, `u32 channelId`
  - `interface NewCharacter { slot: number; name: string; face: number; costume: number; skinSet: number; hairMesh: number; hairColor: number; sex: number; job: number; headMesh: number; bankPin: number }`
  - `encodeCreatePlayer(account: string, passwordHash: string, c: NewCharacter, authKey: number)`: `string account`, `string hash`, `u8 slot`, `string name`, `u8` face, costume, skinSet, hairMesh, `u32 hairColor`, `u8` sex, job, headMesh, `i32 bankPin`, `u32 authKey`
  - `encodeDeletePlayer(account: string, passwordHash: string, key: string, playerId: number, authKey: number, friendIds: number[])`: `string account`, `string hash`, `string key`, `u32 playerId`, `u32 authKey`, `u32 friendIds.length`, then a `u32` per ID
  - `interface CharacterSummary`:

    ```
    slot, blocked, worldId, index: number; name: string; position: [number, number, number];
    playerId, partyId, guildId, warId, skinSet, hairMesh, hairColor, headMesh, sex, job,
    level, jobLevel, str, sta, dex, int, mode: number; equipment: number[]
    ```

  - `interface SlotMessenger { slot: number; state: number; friends: { id: number; blocked: number; state: number }[] }`
  - `type LoginMessage =`
    - `{ type: 'playerList'; authKey: number; characters: CharacterSummary[]; messengers: SlotMessenger[] }`
    - `| { type: 'error'; code: number }`
    - `| { type: 'cacheAddr'; address: string }`
    - `| { type: 'queryTickCount'; sentAt: number; tickCount: bigint }`
    - `| { type: 'ping'; sentAt: number }`
    - `| { type: 'oneHourNotify' }`
    - `| { type: 'loginNumPad'; numPadId: number }`
    - `| { type: 'loginProtect'; ok: boolean; numPadId: number }`
    - `| { type: 'unknown'; packetType: number }`
  - `decodeLoginMessage(body: Uint8Array): LoginMessage` calls `expectEnd()` on known types. The PLAYER_LIST layout follows `CDPLoginClient::OnPlayerList`:
    - `u32 authKey`, `i32 count`.
    - Each character:
      - `i32 slot`, `i32 blocked`, `u32 worldId`, `u32 index`
      - `string(64) name`, `vec3 position`
      - `u32` playerId, partyId, guildId, warId, skinSet, hairMesh, hairColor, headMesh
      - `u8 sex`, `i32 job`, `i32 level`, `u32 jobLevel`
      - `i32` str, sta, dex, int
      - `u32 mode`, `i32 equipCount`, then a `u32` item ID per equipped item
    - Then the messengers (`CRTMessenger::Serialize`):
      - `i32 messengerCount`
      - Each messenger: `u8 slot`, `u32 state`, `i32 friendCount`
      - Each friend: `u32 id`, `i32 blocked`, `u32 state`
  - The other replies:
    - CACHE_ADDR: `string(16)`
    - QUERYTICKCOUNT: `u32`, `i64`
    - PING: `u32`
    - ERROR: `i32`
    - ONE_HOUR_NOTIFY: no body
    - NUMPAD: `u32`
    - CERT: `i32` ok, `u32` id
  - Test helper `clientDecoders.ts`: `decodeCreatePlayer(body)` returns `{ account, hash, character: NewCharacter, authKey }`; `decodeDeletePlayer(body)` returns `{ account, hash, key, playerId, authKey, friendIds }`. Each reads the fields in encoder order and calls `expectEnd()`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/protocol/test/login.test.ts
import { describe, expect, it } from 'vitest';
import {
  ArWriter, PacketType, bytesToHex, decodeCertifierMessage, decodeLoginMessage, deleteKey, encodeCreatePlayer,
  encodeDeletePlayer, encodeGetPlayerList, hashPassword, hexToBytes, type NewCharacter,
} from '../src';
import { decodeCreatePlayer, decodeDeletePlayer } from './helpers/clientDecoders';
import { loadRecording, packetsFor, typeOf } from './helpers/fixtures';

const oneCharacterList = () => new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(1)
  .i32(0).i32(1).u32(1).u32(11).string('Webby').vec3([6968, 100, 3328])
  .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0xff907b6d).u32(1).u8(0).i32(0).i32(15).u32(0)
  .i32(15).i32(15).i32(15).i32(15).u32(0).i32(2).u32(502).u32(503)
  .i32(1).u8(0).u32(0).i32(1).u32(900).i32(0).u32(1).toBytes();

describe('login messages', () => {
  it('starts client packets with DPID_UNKNOWN, then the type', () => {
    expect(bytesToHex(encodeGetPlayerList(7, 'webtester', 'h', 1)).slice(0, 16)).toBe('fffffffff6000000');
  });
  it('decodes PLAYER_LIST in the CDPLoginClient::OnPlayerList order', () => {
    const m = decodeLoginMessage(oneCharacterList());
    if (m.type !== 'playerList') throw new Error(m.type);
    expect(m.authKey).toBe(7);
    expect(m.characters[0]).toMatchObject({ slot: 0, name: 'Webby', position: [6968, 100, 3328], playerId: 500, level: 15, equipment: [502, 503] });
    expect(m.messengers).toEqual([{ slot: 0, state: 0, friends: [{ id: 900, blocked: 0, state: 1 }] }]);
  });
  it('round-trips CREATE_PLAYER and DEL_PLAYER field order', () => {
    const c: NewCharacter = { slot: 2, name: 'WebTest1', face: 0, costume: 0, skinSet: 0, hairMesh: 3, hairColor: 0xff966455, sex: 1, job: 0, headMesh: 4, bankPin: 1234 };
    expect(decodeCreatePlayer(encodeCreatePlayer('webtester', 'h', c, 7))).toEqual({ account: 'webtester', hash: 'h', character: c, authKey: 7 });
    expect(decodeDeletePlayer(encodeDeletePlayer('webtester', 'h', deleteKey('1234'), 500, 7, [900])))
      .toEqual({ account: 'webtester', hash: 'h', key: 'cbad55c0bf841aef57382b0d33440620', playerId: 500, authKey: 7, friendIds: [900] });
  });
});

describe('recorded Neuz session, login port', () => {
  const rec = loadRecording();
  const c2s = packetsFor(rec, 28000, 'c2s').map((p) => hexToBytes(p.hex));
  const authKey = (() => {
    const m = decodeCertifierMessage(hexToBytes(packetsFor(rec, 23000, 's2c').find((p) => typeOf(hexToBytes(p.hex)) === PacketType.SRVR_LIST)!.hex));
    if (m.type !== 'serverList') throw new Error(m.type); return m.authKey;
  })();
  it('decodes every server body to a known message', () => {
    for (const p of packetsFor(rec, 28000, 's2c')) expect(decodeLoginMessage(hexToBytes(p.hex)).type).not.toBe('unknown');
  });
  it('re-encodes GETPLAYERLIST byte for byte', () => {
    const body = c2s.find((b) => typeOf(b) === PacketType.GETPLAYERLIST)!;
    const channelId = new DataView(body.buffer, body.byteOffset).getUint32(body.length - 4, true);
    expect(bytesToHex(encodeGetPlayerList(authKey, rec.account, hashPassword(rec.password), channelId))).toBe(bytesToHex(body));
  });
  it('re-encodes CREATE_PLAYER and DEL_PLAYER byte for byte', () => {
    const create = c2s.find((b) => typeOf(b) === PacketType.CREATE_PLAYER)!;
    const d = decodeCreatePlayer(create);
    expect(d.character.bankPin).toBe(Number(rec.bankPin));
    expect(bytesToHex(encodeCreatePlayer(d.account, d.hash, d.character, d.authKey))).toBe(bytesToHex(create));
    const del = c2s.find((b) => typeOf(b) === PacketType.DEL_PLAYER)!;
    const x = decodeDeletePlayer(del);
    expect(x.key).toBe(deleteKey(rec.bankPin));
    expect(bytesToHex(encodeDeletePlayer(x.account, x.hash, x.key, x.playerId, x.authKey, x.friendIds))).toBe(bytesToHex(del));
  });
  it('contains only client packet types the lobby knows', () => {
    const known = new Set<number>([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST, PacketType.CREATE_PLAYER, PacketType.DEL_PLAYER, PacketType.PING, PacketType.KEEP_ALIVE]);
    expect(c2s.map(typeOf).filter((t) => !known.has(t))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run packages/protocol/test/login.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `messages/login.ts` and `clientDecoders.ts`**

If the recording holds a client type outside the known set, add an encoder for it here, copied from its `CDPLoginClient::Send…` function, and add it to the set.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/protocol && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): login-server messages, character list, create and delete, checked against the recording"
```

---

### Task 8: Gateway relay core

**Files:**
- Create:
  - `packages/protocol/src/gatewayCloseCodes.ts` (exported)
  - `apps/gateway/package.json` (`@flyffweb/gateway`; deps `@flyffweb/protocol`, `ws@^8.18.3`; devDeps `@types/ws@^8.18.1`, `@flyffweb/testkit`)
  - `apps/gateway/tsconfig.json`
  - `apps/gateway/src/config.ts`, `clientAddress.ts`, `relay.ts`, `log.ts`
  - `apps/gateway/test/helpers/wsClient.ts`
- Modify: root `package.json` typecheck.
- Test: `apps/gateway/test/config.test.ts`, `clientAddress.test.ts`, `relay.test.ts`

**Interfaces:**
- Consumes: frame codecs and `readProtocolId` (Task 2), `encodeGatewayClientAddr` and `PacketType` (Task 6), `startFakeFlyffServer` (Task 3).
- Produces:
  - `CloseCode = { SERVER_UNREACHABLE: 4001, SERVER_CLOSED: 4002, NOT_ALLOWED: 4003, LIMIT: 4004, BAD_SERVER_DATA: 4005, FORBIDDEN_PACKET: 4006, TOO_MANY_CONNECTIONS: 4007 } as const`
  - `interface RouteTarget { host: string; port: number; role: 'certifier' | 'login' | 'cache' }`
  - `interface Limits { maxPacketBytes; maxPacketsPerSecond; maxConnectionsPerAddress; maxServerBodyBytes; connectTimeoutMs; pingIntervalMs; pongTimeoutMs; maxHeldPackets }`, all `number`
  - `DEFAULT_LIMITS: Limits` with the Global Constraints values
  - `interface GatewayConfig { listen: { host: string; port: number }; allowedOrigins: string[]; trustedProxies: string[]; routes: Record<string, RouteTarget>; sendClientAddr: boolean; limits: Limits }`
  - `parseConfig(json: unknown): GatewayConfig`: missing `limits` fields take the defaults. A wrong shape throws an `Error` naming the field path (for example `routes["x"].port`). `listen.host` must be a dotted IPv4 address, because the gateway listens on IPv4 only (spec §4.2).
  - `normalizeIPv4(address: string | undefined): string | undefined`: strips `::ffff:` and accepts only dotted IPv4.
  - `resolveClientAddress(remote: string | undefined, forwardedFor: string | string[] | undefined, trustedProxies: string[]): string | undefined`: uses the last `X-Forwarded-For` entry only when the normalized `remote` is in `trustedProxies`.
  - `interface Logger { info(line: string): void }`, `consoleLogger: Logger`
  - `interface RelayOptions { route: RouteTarget; routeKey: string; clientAddress: string; sendClientAddr: boolean; limits: Limits; log: Logger }`
  - `interface RelayResult { closeCode: number; bytesUp: number; bytesDown: number }`
  - `startRelay(ws: WebSocket /* from 'ws' */, opts: RelayOptions): { done: Promise<RelayResult> }`. Behaviour as in spec §4.2, minus the rate and ping parts, which come in Task 9:
    - connect timeout gives 4001;
    - the protocol-ID body is swallowed;
    - on certifier routes with `sendClientAddr`, the client-address frame goes first;
    - up to `maxHeldPackets` are held, and one more gives 4004;
    - a packet larger than `maxPacketBytes` gives 4004;
    - a body whose `u32` at offset 0 or 4 is `GATEWAY_CLIENT_ADDR` gives 4006;
    - a text (non-binary) message gives 4006;
    - a broken server frame or a first body that isn't a protocol ID gives 4005;
    - the TCP side ending gives 4002;
    - a WebSocket close destroys the TCP socket.
  - Test helper `wsClient.ts`: `relayHarness(opts: Omit<RelayOptions, 'log'>)` returns `{ client: WebSocket; messages: Uint8Array[]; closed: Promise<{ code: number }>; result: Promise<RelayResult>; logs: string[]; close(): Promise<void> }`. It starts a `WebSocketServer` on port 0 that calls `startRelay` for each connection, then connects a client.

- [ ] **Step 1: Write the failing tests**

`config.test.ts`:
- `parseConfig(example)` fills in `DEFAULT_LIMITS`;
- a missing `routes` throws `/routes/`;
- `listen.host: '::'` throws `/listen.host/`;
- a route port of `"x"` throws `/routes\["172.31.238.55:23000"\].port/`.

`clientAddress.test.ts`:
- `normalizeIPv4('::ffff:10.0.0.5')` is `'10.0.0.5'`, and `normalizeIPv4('::1')` is `undefined`;
- `resolveClientAddress('127.0.0.1', '1.2.3.4, 10.0.0.9', ['127.0.0.1'])` is `'10.0.0.9'`;
- the same call from an untrusted `'192.168.1.2'` returns `'192.168.1.2'`;
- a forwarded `'::1'` from a trusted proxy returns `undefined`.

`relay.test.ts`: each case uses `startFakeFlyffServer` and `relayHarness`.

```ts
it('sends the client address first on certifier routes, then relays both ways', async () => {
  const server = await startFakeFlyffServer({ onBody: (b, reply) => { if (b[0] === 0xfc) reply(new Uint8Array([0xfd, 0, 0, 0])); } });
  const h = await relayHarness({ route: { host: '127.0.0.1', port: server.port, role: 'certifier' }, routeKey: 'k', clientAddress: '10.0.0.9', sendClientAddr: true, limits: DEFAULT_LIMITS });
  h.client.send(new Uint8Array([0xfc, 0, 0, 0]));          // may arrive before the protocol ID: must be held
  await server.waitForBodies(2);
  expect(bytesToHex(server.received[0]!)).toBe(bytesToHex(encodeGatewayClientAddr('10.0.0.9')));
  expect(bytesToHex(server.received[1]!)).toBe('fc000000');
  await expect.poll(() => h.messages.map(bytesToHex)).toEqual(['fd000000']); // protocol-ID body never forwarded
  expect(server.crcErrors).toBe(0);
});
```

Further cases, each asserting the close code:
- **No client address:** a `login` route, or `sendClientAddr: false`, sends no client-address body.
- **Forged packet:** sending `encodeGatewayClientAddr('1.1.1.1')`, or the same after a `DPID_UNKNOWN` prefix, closes with 4006.
- **Too big:** a 16385-byte message closes with 4004.
- **Too many held:** with the fake server's protocol-ID send delayed (`startFakeFlyffServer({ protocolId, delayIdMs: 200 })`, an option added to the test kit in this task), five early messages close with 4004.
- **Unreachable:** routing to a closed port closes with 4001 within `connectTimeoutMs`.
- **Server leaves:** `server.dropClients()` closes with 4002. So does a server that writes `5e0a000000ab` (half a frame) and then drops.
- **Bad server data:** a server whose first body isn't a protocol ID closes with 4005.
- **Stats:** `result` resolves with `bytesUp` and `bytesDown` equal to the body bytes relayed.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run apps/gateway`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write `config.ts`, `clientAddress.ts`, `log.ts` and `relay.ts`, add the `delayIdMs` option to the test kit, then run `npm install`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run apps/gateway packages tools && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json packages apps/gateway
git commit -m "feat(gateway): WebSocket-to-TCP relay with FlyFF framing and real-address injection"
```

---

### Task 9: Gateway server: origins, limits, keep-alive, logging and CLI

**Files:**
- Create: `apps/gateway/src/limits.ts`, `server.ts`, `main.ts`, `apps/gateway/gateway.config.example.json`
- Modify:
  - `apps/gateway/src/relay.ts`: rate limit and ping hooks
  - root `package.json`: script `"gateway": "tsx apps/gateway/src/main.ts --config apps/gateway/gateway.config.json"`
  - `.gitignore`: `apps/gateway/gateway.config.json`
- Test: `apps/gateway/test/limits.test.ts`, `server.test.ts`

**Interfaces:**
- Consumes: everything in Task 8.
- Produces:
  - `class RateWindow { constructor(maxPerSecond: number, now?: () => number); allow(): boolean }`: a sliding one-second window.
  - `class AddressCounter { constructor(max: number); acquire(address: string): boolean; release(address: string): void }`
  - `startGateway(config: GatewayConfig, log?: Logger): Promise<{ port: number; close(): Promise<void> }>`:
    - an `http` server with `WebSocketServer({ noServer: true })`;
    - on upgrade:
      - the path must match `/connect/<address>:<port>` (URI-decoded);
      - a missing or unlisted `Origin` gets HTTP 403 with no upgrade;
      - an unresolvable client address gets HTTP 400;
      - otherwise the upgrade is accepted; an unknown route then closes with 4003 and the per-address limit with 4007;
      - otherwise `startRelay` runs.
    - Logs `open <address> <routeKey>` and `close <address> <routeKey> code=<c> up=<n> down=<n>`.
  - Relay additions:
    - more than `maxPacketsPerSecond` browser messages close with 4004;
    - every `pingIntervalMs` the relay pings, and no pong within `pongTimeoutMs` calls `ws.terminate()` and destroys the TCP socket.
  - `main.ts`: `--config <path>`, then `parseConfig(JSON.parse(readFileSync))`, `startGateway`, and prints `gateway listening on ws://<host>:<port>`.
  - `gateway.config.example.json`:

    ```json
    {
      "listen": { "host": "0.0.0.0", "port": 8090 },
      "allowedOrigins": ["http://localhost:5174", "http://192.168.100.159:5174"],
      "trustedProxies": [],
      "sendClientAddr": true,
      "routes": {
        "172.31.238.55:23000": { "host": "127.0.0.1", "port": 23000, "role": "certifier" },
        "172.31.238.55:28000": { "host": "127.0.0.1", "port": 28000, "role": "login" },
        "172.31.238.55:5400":  { "host": "127.0.0.1", "port": 5400,  "role": "cache" }
      }
    }
    ```

- [ ] **Step 1: Write the failing tests**

`limits.test.ts`:
- `RateWindow(3, fakeNow)` allows 3 calls at t=0 and refuses the fourth, then allows again at t=1001;
- `AddressCounter(2)` refuses a third `acquire('a')`, allows `'b'`, and allows `'a'` again after `release('a')`.

`server.test.ts` uses a fake server and `startGateway` with `listen.port: 0` and short limits. The cases:
- **Origin:** a client without an `Origin` header, or with `Origin: http://evil.test`, gets an `unexpected-response` with status 403.
- **Unknown route:** `/connect/9.9.9.9:23000` closes with 4003.
- **Per-address limit:** with `maxConnectionsPerAddress: 2`, a third client from the same address closes with 4007.
- **Rate:** with `maxPacketsPerSecond: 5`, sending 6 messages at once closes with 4004.
- **Dead client (Review Focus 5):** with `pingIntervalMs: 50` and `pongTimeoutMs: 150`, a client created with `{ autoPong: false }` is terminated. The fake server then sees its connection end: assert with a `connectionsClosed` counter added to the test kit.
- **Forwarded address:** with `trustedProxies: ['127.0.0.1']` and the header `X-Forwarded-For: 10.0.0.7`, the fake certifier's first body is `encodeGatewayClientAddr('10.0.0.7')`.
- **Logs:** after relaying a body containing the ASCII `SECRETHASH`, no line in the captured logs contains `SECRETHASH` or its hex. The `close` line contains `code=` and `up=`.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run apps/gateway`
Expected: FAIL.

- [ ] **Step 3: Implement `limits.ts`, `server.ts`, `main.ts`, the relay additions and the example config**

- [ ] **Step 4: Run the tests and a manual start**

Run: `npx vitest run apps/gateway && npm run typecheck`
Expected: PASS.

Run: `cp apps/gateway/gateway.config.example.json apps/gateway/gateway.config.json && timeout 3 npm run gateway`
Expected: it prints `gateway listening on ws://0.0.0.0:8090`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json apps/gateway packages/testkit
git commit -m "feat(gateway): origin check, per-address and rate limits, keep-alive, connection log, CLI"
```

---

### Task 10: Certifier client-address change (C++)

**Files** (in the server folder, untracked, CP949):
- Modify: `../Source/_Network/MsgHdr.h`
- Modify: `../Source/CERTIFIER/user.h`, `user.cpp`, `DPCertifier.h`, `DPCertifier.cpp`, `DBManager.cpp`, `certifier.cpp`
- Create (in FlyffWeb): `server-patches/certifier-client-addr.patch`, `server-patches/README.md`, `.gitattributes`

**Interfaces:**
- Consumes: packet number `0xE0` and the body layout `u32 type, CAr string address` (Task 6's `encodeGatewayClientAddr`).
- Produces in the certifier:
  - `#define PACKETTYPE_GATEWAY_CLIENT_ADDR (DWORD)0x000000e0`, placed after `PACKETTYPE_PLAYERID` in `MsgHdr.h`
  - `CUser::SetClientAddr(const char*)`, `const char* CUser::GetClientAddr()`, backed by `char m_szClientAddr[16]`, which the `CUser` constructor empties
  - `CDPCertifier`:
    - `AddGateway(const char* lpszAddr)`, storing up to 8 entries in `char m_aszGateway[8][16]` and `int m_nGateway`
    - `BOOL IsGateway(DPID)`
    - `void GetClientAddr(DPID, LPSTR)` and `DWORD GetClientAddr(DPID)`. Both use the stored address when it's set, otherwise `GetPlayerAddr`, and both lock `CUserMng::GetInstance()->m_AddRemoveLock`. The `DWORD` form returns `inet_addr(stored)`.
    - `OnGatewayClientAddr(CAr&, DPID, LPBYTE, u_long)`, registered with `ON_MSG`. It reads `ReadString(buf, 16)` and accepts the address only when:
      - `IsGateway(dpid)`;
      - the user exists and `GetAccount()[0] == '\0'`, meaning CERTIFY hasn't arrived yet;
      - `inet_addr(buf) != INADDR_NONE`.
    - Otherwise it calls `Error( "GATEWAY_CLIENT_ADDR refused from %s", peerAddr )` and returns.
  - `certifier.cpp` `Script()`: `else if( s.Token == "Gateway" ) { s.GetToken(); g_dpCertifier.AddGateway( s.Token ); }`
  - Six call sites switch from `GetPlayerAddr` to `GetClientAddr`: `DPCertifier.cpp:300` (the `DWORD` form for the lockout) and `DBManager.cpp` lines 103, 197, 490, 537, 836 (the string form).

- [ ] **Step 1: Snapshot the originals**

Run: `mkdir -p "$TEMP/certifier-orig" && for f in _Network/MsgHdr.h CERTIFIER/user.h CERTIFIER/user.cpp CERTIFIER/DPCertifier.h CERTIFIER/DPCertifier.cpp CERTIFIER/DBManager.cpp CERTIFIER/certifier.cpp; do mkdir -p "$TEMP/certifier-orig/$(dirname $f)"; cp "../Source/$f" "$TEMP/certifier-orig/$f"; done`

Expected: 7 files copied.

- [ ] **Step 2: Apply the edits with a byte-preserving Node script**

Write a scratch script, outside both repositories, that reads each file as `latin1`, replaces exact anchor strings with `replace` and an exactly-once check, keeps `\r\n`, and writes back as `latin1`. Anchors to use:
- the `PACKETTYPE_PLAYERID` line;
- the `class CUser` private section;
- the `ON_MSG( PACKETTYPE_ERROR, &CDPCertifier::OnError );` line;
- `pData->dwIP         = GetPlayerAddr( dpid );`;
- `g_dpCertifier.GetPlayerAddr(`, expected 5 times;
- the `else if( s.Token == "HEARTBEAT" )` block.

Verify with `grep -c "GetClientAddr" ../Source/CERTIFIER/DBManager.cpp`. Expected: 5.

- [ ] **Step 3: Build**

Run: `"/c/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe" ../Source/CERTIFIER/Certifier.vcxproj -p:Configuration=Release -p:Platform=Win32 -m`

Expected: `Build succeeded.` and a fresh `.exe` in `../Output/Certifier/Release/`. The build never writes to `../Program/`.

If the project doesn't build on its own, because it depends on other projects in the solution, build `../Source/all/all.sln` with `-t:Certifier` instead. Report any error that isn't caused by our edit; don't fix unrelated build problems.

- [ ] **Step 4: Write the patch and README**

1. Create `.gitattributes` with `server-patches/*.patch binary`.
2. Generate the patch, one file at a time, with `diff -u --label a/Source/<f> --label b/Source/<f> "$TEMP/certifier-orig/<f>" "../Source/<f>"`. Concatenate the results into `server-patches/certifier-client-addr.patch`.
3. Check it applies cleanly to the originals:

   ```
   rm -rf "$TEMP/apply-check" && mkdir -p "$TEMP/apply-check" && cp -r "$TEMP/certifier-orig" "$TEMP/apply-check/Source"
   ```

   Then, from `$TEMP/apply-check`, run `git apply --check -p1 <FlyffWeb path>/server-patches/certifier-client-addr.patch`. Expected: exit 0.

`server-patches/README.md` explains:
- what the patch changes (spec §5);
- how to apply it: `git apply -p1 server-patches/certifier-client-addr.patch`, run from the server folder;
- how to build it (the Step 3 command).

It also gives the owner these steps:
1. Stop the certifier.
2. Back up `Program/2. Certifier.exe`.
3. Copy the new exe over it.
4. Add `Gateway "127.0.0.1"` to `Program/Certifier.ini`.
5. Start the certifier.
6. Confirm Neuz can still log in.

- [ ] **Step 5: Commit (FlyffWeb only)**

```bash
git add .gitattributes server-patches
git commit -m "feat(certifier): accept the player's real address from the gateway (patch + build notes)"
```

- [ ] **Step 6: Owner checkpoint**

The owner swaps the exe and does steps 1–6 of the README. Task 13 relies on this.

---

### Task 11: Client app, packet channel and `LoginFlow`

**Files:**
- Create:
  - `apps/client/package.json` (`@flyffweb/client`; deps `@flyffweb/protocol`; devDeps `vite@^8.3.4`, `@playwright/test@^1.64.1`, `ws@^8.18.3`, `@types/ws@^8.18.1`)
  - `apps/client/tsconfig.json`: like `apps/viewer`, plus `"types": ["vite/client", "node"]`, and including `src` and `test`
  - `apps/client/src/config.ts`, `src/net/PacketChannel.ts`, `src/net/webSocketChannel.ts`
  - `apps/client/src/lobby/LoginFlow.ts`, `errorText.ts`, `validation.ts`, `appearance.ts`
  - `apps/client/test/helpers/fakeChannel.ts`
- Modify: root `package.json` typecheck.
- Test: `apps/client/test/loginFlow.test.ts`, `validation.test.ts`, `errorText.test.ts`

**Interfaces:**
- Consumes: all of `@flyffweb/protocol` (Tasks 1–8).
- Produces:
  - `interface PacketChannel { send(body: Uint8Array): void; close(): void; onPacket: (body: Uint8Array) => void; onClose: (code: number) => void }`
  - `type OpenChannel = (target: string) => Promise<PacketChannel>`. It rejects only when the gateway itself can't be reached, which the flow reports as code 1006.
  - `openWebSocketChannel(gatewayUrl: string): OpenChannel`: `new WebSocket(`${gatewayUrl}/connect/${target}`)` with `binaryType 'arraybuffer'`.
  - `clientConfig = { gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? `ws://${location.hostname}:8090`, certifierAddress: import.meta.env.VITE_CERTIFIER_ADDRESS ?? '172.31.238.55:23000' }`
  - `errorText(code: number): string`. The table copies `Resource/textClient.txt.txt`:

| Code | Text |
|---|---|
| 100 | That ID is already in use. |
| 103 | This account is already connected.  Do you want to disconnect it? |
| 105 | The slot is in use. |
| 107 | Old version of client. |
| 108 | Server capacity has been reached. |
| 109 | Service currently unavailable. Please check flyff web site for details. |
| 111 | Character name is not allowed. |
| 119 | This account is banned. Contact FlyFF Support for assistance. |
| 120, 121 | Login details incorrect.  Please try again. |
| 122 | Account verification required. Please visit the Flyff website. |
| 123 | Sorry. Children below 12 years of age are not permitted to play FlyFF. |
| 124 | The permission of a parent or guardian is required for players under 13 years old. |
| 125 | Unable to connect to the game. Account may have been terminated by user. |
| 126 | No information about charging |
| 127 | DB Error |
| 128 | Your time is up. |
| 129, 130 | Other DB Error |
| 131 | You cannot connect after 22:00. |
| 132 | You cannot connect from outside the service for flyff. |
| 133 | Your character is being checked at the moment. Please log in after a while. |
| 134 | Wrong Password. Cannot log into account for 15 seconds. |
| 135 | Wrong Passwords 3 times. Cannot log into account for 15 minutes. |
| 136 | Server Verification Error |
| 137 | Session is over. Please try again. |
| 138 | Version mismatch.  Try to patch again. |
| 1316 (`ERROR_USER_EXISTS`, winerror.h) | That character name is already in use. |
| 1319 (`ERROR_NO_SUCH_GROUP`, winerror.h) | Oops. Try again. |
| anything else | `Error <code>` |

  - `closeText(code: number): string`:

| Code | Text |
|---|---|
| 4001 | The game server is not reachable. Try again later. |
| 4002 | Disconnected from the server. |
| 4003 | This server address is not allowed. |
| 4004 | Too much data was sent. Disconnected. |
| 4005 | The server sent data the game could not read. |
| 4006 | Disconnected: the game sent a forbidden packet. |
| 4007 | Too many connections from your network. |
| anything else | Cannot reach the game gateway. |

  - `validateCharacterName(name: string): string | undefined`. It copies `IsValidPlayerName` for English and checks the trimmed name in this order:
    1. empty: `'Enter name.'`
    2. length outside 4–16: `'Character Name must be 4 to 16 characters long.'`
    3. first character a digit: `'The name cannot start with a number.'`
    4. any character outside `[A-Za-z0-9]`: `'You cannot use special characters or spaces in a name.'`
  - `validateBankPin(pin: string, confirm: string): string | undefined`. The checks, in order:
    1. empty: `'Enter the Bank PIN to continue.'`
    2. not `/^\d{4}$/`: `'The Bank PIN should be a 4 digit number.'`
    3. `'0000'`: `'Invalid Bank PIN.'`
    4. empty confirm: `'Confirm Bank PIN.'`
    5. mismatch: `'Bank PINs do not match.'`
  - Appearance, from `Resource/defineNeuz.h` and `Source/_Common/MoverEquip.cpp:43-67`:
    - `HAIR_MESH_COUNT = 5`, `HEAD_MESH_COUNT = 5`, `Sex = { MALE: 0, FEMALE: 1 }`, `JOB_VAGRANT = 0`
    - `hairColorFor(sex: number, hairMesh: number): number` returns `(0xff000000 | r << 16 | g << 8 | b) >>> 0`
    - male RGB: `[144,99,101],[100,107,125],[158,119,109],[199,156,100],[100,123,117]`
    - female RGB: `[250,250,90],[250,250,90],[147,118,103],[150,100,85],[213,130,100]`
  - `type LobbyEvent =`
    - `{ type: 'serverList'; servers: ServerEntry[] }`
    - `| { type: 'characters'; characters: CharacterSummary[] }`
    - `| { type: 'alreadyConnected' }`
    - `| { type: 'error'; message: string }`
    - `| { type: 'closed'; message: string }`
  - `class LoginFlow`:
    - `constructor(open: OpenChannel, certifierAddress: string, emit: (e: LobbyEvent) => void, clock?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; now(): number })`
    - `login(account: string, password: string): Promise<void>`:
      - trims and lower-cases the account;
      - opens the certifier channel and sends `encodeCertify`;
      - starts a 20000 ms timer that emits `{ type: 'error', message: 'The server did not answer in time.' }` and closes.
    - `closeExistingConnection(): void`
    - `selectChannel(channel: ServerEntry): Promise<void>`:
      - target is `${parent.address}:28000`, where `parent` has `id === channel.parent` and `parent === NULL_ID`;
      - sends `encodeQueryTickCount(clock.now())`, then `encodeGetPlayerList(authKey, account, hash, channel.id)`.
    - `createCharacter(c: NewCharacter): void`
    - `deleteCharacter(slot: number, bankPin: string): void`: sends `encodeDeletePlayer` with `deleteKey(bankPin)`, the character's `playerId`, and `friendIds` from that slot's messenger (an empty list if there is none).
    - `dispose(): void`
    - Rules:
      - The certifier's KEEP_ALIVE is answered with `encodeKeepAlive()`.
      - SRVR_LIST with `account !== typed account` emits the error `'Server Verification Error'`.
      - ERROR 103 emits `alreadyConnected`. Other ERRORs emit `errorText(code)`.
      - ERROR_STRING sends `encodeErrorReply()` and emits its text.
      - PLAYER_LIST with an auth key other than the stored one emits `'Server Verification Error'`. Otherwise it emits `characters` and closes the certifier channel; follow the timing recorded in Task 4's fixture README if it differs.
      - A channel closing that the flow didn't close itself emits `{ type: 'closed', message: closeText(code) }`.
      - An `unknown` message is ignored with `console.warn('unknown packet 0x…')`, as Neuz ignores types it has no handler for.
  - Test helpers in `test/helpers/fakeChannel.ts`:
    - `fakeChannels()` returns `{ open: OpenChannel; channel(target): FakeChannel }`, where `FakeChannel` has `sent: Uint8Array[]`, `closed: boolean`, `push(body)` (delivers a server body) and `drop(code)` (fires `onClose`);
    - `fakeClock(now)` returns a clock whose `advance(ms)` runs due timers;
    - `serverListFor(account, authKey)`: SRVR_LIST with parent `FlyFF` (id 1, `NULL_ID`, `172.31.238.55`) and `Channel 1` (id 1, parent 1, enabled, max 500);
    - `playerListFor(authKey)`: one character in slot 0, playerId 500, with a slot-0 messenger holding friend 900;
    - `typeOfClientBody(body)`: the `u32` after `DPID_UNKNOWN`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/client/test/loginFlow.test.ts (excerpt; fakeChannel records sent bodies and lets the test push server bodies)
it('trims and lower-cases the account, answers keep-alive, then lists characters on the parent server address', async () => {
  const net = fakeChannels();               // { open, channel(target), sentTypes(target) }
  const events: LobbyEvent[] = [];
  const flow = new LoginFlow(net.open, '172.31.238.55:23000', (e) => events.push(e), fakeClock(1000));
  await flow.login('  WebTester ', 'password1');
  const cert = net.channel('172.31.238.55:23000');
  expect(new ArReader(cert.sent[0]!).u32()).toBe(PacketType.CERTIFY);
  expect(bytesToHex(cert.sent[0]!)).toBe(bytesToHex(encodeCertify('webtester', hashPassword('password1'))));
  cert.push(encodeKeepAlive());
  expect(bytesToHex(cert.sent[1]!)).toBe(bytesToHex(encodeKeepAlive()));
  cert.push(serverListFor('webtester', 7));  // test helper: parent FlyFF @ 172.31.238.55 id 1, channel id 1
  const list = events.find((e) => e.type === 'serverList')!;
  await flow.selectChannel((list as Extract<LobbyEvent, { type: 'serverList' }>).servers[1]!);
  const login = net.channel('172.31.238.55:28000');
  expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST]);
  expect(bytesToHex(login.sent[1]!)).toBe(bytesToHex(encodeGetPlayerList(7, 'webtester', hashPassword('password1'), 1)));
  login.push(playerListFor(7));
  expect(events.at(-1)).toMatchObject({ type: 'characters' });
  expect(cert.closed).toBe(true);
});
```

The other cases, one `it` each:
- the account echo mismatch;
- the 20 s timeout, with the fake clock advanced to 20000 ms;
- ERROR 120, which gives `'Login details incorrect.  Please try again.'`;
- ERROR 103, which gives `alreadyConnected`, after which `closeExistingConnection()` sends `encodeCloseExistingConnection`;
- ERROR_STRING, which gets a reply;
- a wrong auth key on PLAYER_LIST;
- `deleteCharacter`, which sends `encodeDeletePlayer('webtester', hash, deleteKey('1234'), 500, 7, [900])`;
- a channel closing with 4002, which gives `closed` with `'Disconnected from the server.'`;
- `open` rejecting, which gives `closed` with `'Cannot reach the game gateway.'`.

`validation.test.ts`:
- `'Webby'` passes;
- `'abc'` fails on length;
- `'1abc'` fails on the leading digit;
- `'we by'` and `'wébé'` fail on characters;
- a 17-character name fails on length;
- the PIN cases are `''`, `'12a4'`, `'0000'`, `('1234','')` and `('1234','1235')`;
- `hairColorFor(0, 0) === 0xff906365` and `hairColorFor(1, 4) === 0xffd58264`.

`errorText.test.ts`:
- `errorText(135)`, `errorText(1316)` and `errorText(999) === 'Error 999'`;
- `closeText(4007)` and `closeText(1006)`.

- [ ] **Step 2: Run the tests and check they fail**

Run: `npx vitest run apps/client`
Expected: FAIL.

- [ ] **Step 3: Implement the files and run `npm install`**

- [ ] **Step 4: Run the tests**

Run: `npx vitest run apps/client && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json apps/client
git commit -m "feat(client): packet channel, LoginFlow, error texts, name and Bank PIN rules"
```

---

### Task 12: Lobby screens and a browser smoke test

**Files:**
- Create:
  - `apps/client/index.html`, `vite.config.ts`, `playwright.config.ts`
  - `apps/client/src/main.ts`, `src/style.css`, `src/lobby/LobbyApp.ts`
  - `apps/client/src/lobby/views/loginView.ts`, `serverView.ts`, `characterView.ts`, `createView.ts`, `deleteView.ts`, `messageView.ts`
  - `apps/client/e2e/lobby.spec.ts`
- Modify: root `package.json` with these scripts:

  ```
  "dev:client": "vite --config apps/client/vite.config.ts --host",
  "build:client": "vite build --config apps/client/vite.config.ts",
  "test:e2e:client": "playwright test -c apps/client/playwright.config.ts"
  ```

**Interfaces:**
- Consumes: `LoginFlow`, `LobbyEvent`, validation, appearance, `errorText` and `closeText` (Task 11); `clientConfig`.
- Produces:
  - `class LobbyApp { constructor(root: HTMLElement, flow: LoginFlow) }`. It renders one view at a time:
    - **login:** account and password fields, a "Log in" button;
    - **servers:** each server with its channels; disabled or full channels (`playerCount >= maxPlayers` when `maxPlayers > 0`) are shown with `aria-disabled="true"`;
    - **characters:** 3 slots, each either name, level and job number, or "Empty — Create";
    - **create:** a name field, a sex toggle, hair 1–5 and head 1–5 steppers, Bank PIN and confirm fields. Validation runs before `flow.createCharacter`. The defaults are face 0, costume 0, skin set 0, job vagrant, and `hairColorFor(sex, hair)`;
    - **delete:** the character name and a Bank PIN field.
  - `messageView` shows errors in an element with `role="alert"`. "Already connected" shows the 103 text with "Disconnect it" (`flow.closeExistingConnection()`) and "Cancel" buttons.
  - Layout: one column, at least 44 px touch targets, `font-size: 16px` inputs (stops iOS zoom), light and dark via `prefers-color-scheme`.
  - Vite: `root` is `apps/client`, `server.port: 5174`, `server.host: true`, and the same `build.target` as the viewer, `['chrome111', 'edge111', 'firefox114', 'safari16']`.

- [ ] **Step 1: Write the failing smoke test**

```ts
// apps/client/e2e/lobby.spec.ts
import { expect, test } from '@playwright/test';

test('shows the login form and reports an unreachable gateway', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Cannot reach the game gateway.');
});
```

`playwright.config.ts`:
- `webServer` runs `npm run dev:client` at `http://localhost:5174`, with `env: { VITE_GATEWAY_URL: 'ws://127.0.0.1:9' }`. Port 9 is closed.
- One `chromium` project and one `webkit` project with the `iPhone 13` device.

- [ ] **Step 2: Run it and check it fails**

Run: `npm run test:e2e:client`
Expected: FAIL, because there's no page yet.

- [ ] **Step 3: Implement the views, `LobbyApp`, `main.ts`, the HTML, the CSS and the Vite config**

If the WebKit browser isn't installed, run `npx playwright install webkit`.

- [ ] **Step 4: Run the smoke test, the build and the typecheck**

Run: `npm run test:e2e:client && npm run build:client && npm run typecheck`
Expected: PASS, and the build writes `apps/client/dist`. Add `apps/client/dist` to `.gitignore` if the root `dist/` rule doesn't already cover it.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json apps/client
git commit -m "feat(client): lobby screens for login, servers, characters, create and delete"
```

---

### Task 13: Live test against the servers

**Files:**
- Create:
  - `vitest.live.config.ts` (include `**/*.live.test.ts`, timeout 60000)
  - `apps/client/test/lobby.live.test.ts`
  - `apps/client/test/helpers/nodeChannel.ts`
  - `apps/client/test/live.config.example.json`
- Modify:
  - `vitest.config.ts`: add `'**/*.live.test.ts'` to `exclude`
  - root `package.json`: `"test:live": "vitest run --config vitest.live.config.ts"`
  - `.gitignore`: `apps/client/test/live.config.json`

**Interfaces:**
- Consumes: `startGateway` and `parseConfig` (Tasks 8–9); `LoginFlow` and `closeText` (Task 11).
- Produces:
  - `openNodeChannel(gatewayUrl: string, opts: { origin: string; forwardedFor?: string }): OpenChannel`: a `ws` client that sends the `Origin` and `X-Forwarded-For` headers.
  - Live config: `{ gateway: <GatewayConfig JSON>, certifierAddress, account, password, bankPin, certifierPatched: boolean, bannedTestAddress: string | null }`.
  - The example uses:
    - `listen.port` 8091;
    - `trustedProxies ["127.0.0.1"]`;
    - `allowedOrigins ["http://live.test"]`;
    - the routes from Task 9.

- [ ] **Step 1: Write the live tests**

These are the five tests. Each starts the gateway from the config in `beforeAll`.

1. **`logs in, lists, creates and deletes a character`:**
   - login, then `serverList`;
   - pick the first channel that's enabled and not full;
   - a `characters` event arrives;
   - create `WebTest` + 3 random digits in the first empty slot. Fail with a clear message if all 3 slots are used;
   - a new `characters` event contains that name;
   - `deleteCharacter(slot, bankPin)`;
   - the name is gone.
2. **`a wrong password shows the login error`:** expect `errorText(120)`.
3. **`a wrong password from one address does not block another`** (skipped unless `certifierPatched`):
   - address A (`forwardedFor: '10.0.0.1'`) logs in with a wrong password and gets `errorText(120)`;
   - straight after, address B (`'10.0.0.2'`) logs in with the right password and gets `serverList`.
   - With one shared address, B would have received `errorText(134)`.
4. **`a banned address is refused`** (skipped unless `bannedTestAddress`): login from that address gives `errorText(132)`.
5. **`an unreachable server is reported`:** add a route `172.31.238.55:23999` to `127.0.0.1:23999`, which is closed. Opening it gives `closed` with `closeText(4001)`.

- [ ] **Step 2: Check `npm test` stays offline**

Run: `npm test`
Expected: PASS, and no live test runs.

- [ ] **Step 3: Owner checkpoint: run the live test**

With the servers running and the rebuilt certifier in place (Task 10), copy the example to `apps/client/test/live.config.json`, fill in the test account, and set `certifierPatched: true`.

Optionally:
1. add `10.0.0.99` to `Program/IPCut.ini`;
2. restart the account server;
3. set `bannedTestAddress: "10.0.0.99"`.

Run: `npm run test:live`
Expected: all enabled tests pass. Copy the output into the task report.

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json vitest.config.ts vitest.live.config.ts apps/client/test
git commit -m "test(client): live login, character create/delete and per-address lockout through the gateway"
```

---

### Task 14: Hosting guide, device checklist and README

**Files:**
- Create: `docs/hosting.md`
- Modify: `docs/device-testing.md` (new "Piece 2: lobby" section), `README.md`

**Interfaces:**
- Consumes: script names (Tasks 3, 9, 12, 13), config files (Tasks 9, 13), `server-patches/README.md` (Task 10).

- [ ] **Step 1: Write `docs/hosting.md`**

Follow spec §8. It covers:
- **Prerequisites:** a Windows machine running the 7 servers, a domain with an IPv4 record only, and Node LTS.
- **Build:** `npm ci`, `npm run convert` and `npm run build:client`.
- **Gateway config:**
  - `listen.host: 127.0.0.1`;
  - `allowedOrigins: ["https://play.<domain>"]`;
  - `trustedProxies: ["127.0.0.1"]`;
  - routes keyed by the hosted build's `NEUZ_IPSET`.
- **Gateway as a Windows service:** with NSSM, `nssm install flyff-gateway "C:\Program Files\nodejs\node.exe" …`.
- **Caddy as a Windows service,** with this `Caddyfile`:

  ```
  play.<domain> {
    handle /connect/* { reverse_proxy 127.0.0.1:8090 }
    handle /assets/*  { root * <FlyffWeb>/dist; file_server }
    handle            { root * <FlyffWeb>/apps/client/dist; try_files {path} /index.html; file_server }
  }
  ```

- **Firewall:** 443 open, 80 optional (redirect only), and 23000, 28000 and 5400 closed.
- **Certifier:** apply the patch and add `Gateway "127.0.0.1"` (link to `server-patches/README.md`).
- **Bandwidth:** game files are served from this machine; move `/assets/` to a CDN when needed.

- [ ] **Step 2: Add the Piece 2 section to `docs/device-testing.md`**

It covers the 4 devices on the same Wi-Fi, with `npm run gateway` and `npm run dev:client` running on the PC. The page is at `http://<PC Wi-Fi IP>:5174`, and that origin must be in `allowedOrigins`. For each device:
- log in;
- pick a channel;
- create and delete a character;
- try a wrong password;
- log in on two devices at the same time.

Each device gets a pass/fail row.

- [ ] **Step 3: Update `README.md`**

Add:
- the new packages and apps;
- the scripts `gateway`, `capture`, `dev:client`, `build:client`, `test:e2e:client`, `test:live`;
- the two local config files and their examples;
- a link to `server-patches/README.md`.

- [ ] **Step 4: Verify everything together**

Run: `npm test && npm run typecheck && npm run test:e2e:client`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docs/hosting.md docs/device-testing.md README.md
git commit -m "docs: hosting guide, Piece 2 device checklist, README for gateway and lobby"
```

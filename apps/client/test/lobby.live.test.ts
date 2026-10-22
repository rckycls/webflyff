// The live test: the real gateway, started inside this process, and the real LoginFlow, driven against the game
// servers running on this PC. It is not part of `npm test`; run it with `npm run test:live`.
//
// Before the first run copy live.config.example.json to live.config.json (same folder, git ignores it) and fill in a
// TEST account. The servers must be running.
//
// Two limits of the servers can lock you out if you run this too often:
//  - The certifier blocks an address for 15 seconds after one wrong password and for 15 minutes after three in a row
//    (a good login clears the count). One run sends a wrong password from this PC and, with the rebuilt certifier,
//    one from the simulated address 10.0.0.1. Run again within 15 seconds and the first login is refused with
//    "Wrong Password. Cannot log into account for 15 seconds".
//  - The servers' accept limiter counts connections from one address that arrive less than 200 ms apart. After 50 of
//    them it cuts every connection from that address (here: this PC, the gateway's address) for about 10 minutes,
//    and the count never decays. So every connection below waits until 300 ms after the one before, and every flow
//    ends, with its connections closed, before the next starts. Keep it that way, and do not loop the test.
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, onTestFailed } from 'vitest';
import { CloseCode, MAX_CHARACTER_SLOTS, NULL_ID } from '@flyffweb/protocol';
import type { ServerEntry } from '@flyffweb/protocol';
import { normalizeIPv4 } from '@flyffweb/gateway/src/clientAddress';
import { parseConfig } from '@flyffweb/gateway/src/config';
import type { GatewayConfig } from '@flyffweb/gateway/src/config';
import { startGateway } from '@flyffweb/gateway/src/server';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { JOB_VAGRANT, Sex, hairColorFor } from '../src/lobby/appearance';
import { closeText, errorText } from '../src/lobby/errorText';
import { LoginFlow } from '../src/lobby/LoginFlow';
import type { LobbyEvent } from '../src/lobby/LoginFlow';
import { validateBankPin } from '../src/lobby/validation';
import type { OpenChannel, PacketChannel } from '../src/net/PacketChannel';
import { openNodeChannel } from './helpers/nodeChannel';

// ---- The config ------------------------------------------------------------------------------------------------

interface LiveConfig {
  gateway: GatewayConfig;
  /** The certifier's advertised `address:port`, a key of `gateway.routes`. */
  certifierAddress: string;
  account: string;
  password: string;
  /** The 4-digit Bank PIN for the character the test creates and deletes. */
  bankPin: string;
  /** True when the rebuilt certifier (Task 10) runs with a `Gateway` line, so it tells the simulated addresses apart. */
  certifierPatched: boolean;
  /** An address listed in `IPCut.ini`, or `null`. */
  bannedTestAddress: string | null;
}

const CONFIG_PATH = fileURLToPath(new URL('./live.config.json', import.meta.url));

const HOW_TO_SET_UP =
  'Copy apps/client/test/live.config.example.json to apps/client/test/live.config.json, fill in a test account, '
  + 'start the game servers and run `npm run test:live` again. The comment at the top of the example explains the settings.';

/** Checks the contents of a `live.config.json` (anything it holds besides these fields, `_comment` included, is ignored). */
function parseLiveConfig(json: unknown): LiveConfig {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('the file must hold a JSON object');
  const root = json as Record<string, unknown>;
  const text = (name: string): string => {
    const value = root[name];
    if (typeof value !== 'string' || value === '') throw new Error(`${name} must be a non-empty string`);
    return value;
  };

  let gatewayConfig: GatewayConfig;
  try {
    gatewayConfig = parseConfig(root.gateway);
  } catch (error) {
    throw new Error(`gateway: ${(error as Error).message}`);
  }
  const certifierAddress = text('certifierAddress');
  const certifierRoute = Object.hasOwn(gatewayConfig.routes, certifierAddress) ? gatewayConfig.routes[certifierAddress] : undefined;
  if (certifierRoute?.role !== 'certifier') throw new Error(`certifierAddress ${certifierAddress} must be a route of gateway.routes with the role "certifier"`);
  if (gatewayConfig.allowedOrigins.length === 0) throw new Error('gateway.allowedOrigins must hold an origin for the test to connect as');

  const bankPin = text('bankPin');
  const pinProblem = validateBankPin(bankPin, bankPin);
  if (pinProblem !== undefined) throw new Error(`bankPin: ${pinProblem}`);

  if (typeof root.certifierPatched !== 'boolean') throw new Error('certifierPatched must be true or false');
  const banned = root.bannedTestAddress ?? null;
  if (banned !== null && (typeof banned !== 'string' || normalizeIPv4(banned) !== banned)) {
    throw new Error('bannedTestAddress must be a dotted IPv4 address, or null');
  }
  if ((root.certifierPatched || banned !== null) && !gatewayConfig.trustedProxies.includes('127.0.0.1')) {
    throw new Error('gateway.trustedProxies must list "127.0.0.1": the test plays other addresses with X-Forwarded-For');
  }

  return { gateway: gatewayConfig, certifierAddress, account: text('account'), password: text('password'), bankPin, certifierPatched: root.certifierPatched, bannedTestAddress: banned };
}

function loadConfig(): LiveConfig {
  let source: string;
  try {
    source = readFileSync(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Live test: ${CONFIG_PATH} does not exist. ${HOW_TO_SET_UP}`);
    }
    throw error;
  }
  try {
    return parseLiveConfig(JSON.parse(source));
  } catch (error) {
    throw new Error(`Live test: cannot use ${CONFIG_PATH}: ${(error as Error).message}`);
  }
}

// Read while the file is collected: the skipped tests below depend on it, and a missing file stops the run here, at once.
const config = loadConfig();

// ---- Timing and addresses --------------------------------------------------------------------------------------

/** The accept limiter counts arrivals less than 200 ms apart; stay well clear of that. */
const CONNECT_GAP_MS = 300;
/** How long a flow gets for an answer that needs the database. The certifier's own timeout (20 s) fires first and ends the login with an error. */
const LOGIN_WAIT_MS = 25000;
const WAIT_MS = 15000;
/** Closed on purpose: nothing listens here, so the gateway cannot connect and ends the connection with 4001. */
const UNREACHABLE_ROUTE = '172.31.238.55:23999';
const ADDRESS_A = '10.0.0.1';
const ADDRESS_B = '10.0.0.2';

let lastConnectAt = 0;

/** Resolves once at least `CONNECT_GAP_MS` have passed since the previous connection was started. */
async function waitForConnectGap(): Promise<void> {
  const wait = lastConnectAt + CONNECT_GAP_MS - Date.now();
  lastConnectAt = Date.now() + Math.max(0, wait); // takes the slot at once, so two callers cannot share one
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** A bare connection to the certifier's real address, so that servers which are not running are reported as such and not as a failed login. */
function checkReachable(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const fail = (why: string): void => {
      socket.destroy();
      reject(new Error(
        `Live test: the certifier is not reachable at ${host}:${port} (${why}). Start the game servers (the certifier and `
        + 'the others in Program\\), check the routes in live.config.json, and run `npm run test:live` again.',
      ));
    };
    socket.setTimeout(3000, () => fail('no answer within 3 s'));
    socket.once('error', (error) => fail(error.message));
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
  });
}

// ---- Driving a LoginFlow ---------------------------------------------------------------------------------------

/** Why an event the test waited for did not come: what came instead, and what usually causes it. */
function explain(event: LobbyEvent): string {
  const said = 'message' in event ? `${event.type} ("${event.message}")` : event.type;
  let hint = '';
  if (event.type === 'alreadyConnected') {
    hint = 'The test account is logged in somewhere else (a game client, or a session that is still closing). Log it out and run again.';
  } else if (event.type === 'closed' && event.message === closeText(CloseCode.SERVER_UNREACHABLE)) {
    hint = 'The gateway could not connect to the server. Is it running, and do the routes in live.config.json point at where it listens?';
  } else if (event.type === 'error' && (event.message === errorText(134) || event.message === errorText(135))) {
    hint = 'The certifier blocks this address after an earlier wrong password (15 seconds, or 15 minutes after three in a row): wait and run again. '
      + 'If it happened in the per-address test, the certifier is not telling the simulated addresses apart: is the rebuilt Certifier.exe running, '
      + 'with a Gateway "127.0.0.1" line in Certifier.ini?';
  } else if (event.type === 'error' && event.message === errorText(120)) {
    hint = 'Check account and password in live.config.json. (A wrong password also blocks this address for 15 seconds.)';
  }
  return hint === '' ? said : `${said}\n${hint}`;
}

/** One `LoginFlow` on its own connections to the gateway, with its events queued for the test to take one by one. */
class Session {
  readonly flow: LoginFlow;
  private readonly queue: LobbyEvent[] = [];
  private waiting: ((event: LobbyEvent) => void) | undefined;
  /** One per connection the flow opened; settles when that connection has really closed. */
  private readonly ended: Promise<void>[] = [];

  constructor(certifierAddress: string, forwardedFor?: string) {
    const open = openNodeChannel(`ws://127.0.0.1:${gateway.port}`, { origin: config.gateway.allowedOrigins[0]!, forwardedFor });
    this.flow = new LoginFlow(async (target) => this.watch(await this.openAfterGap(open, target)), certifierAddress, (event) => this.onEvent(event));
  }

  /** Takes the next event, in order, and fails with what happened instead unless it is a `type` event. */
  async expect<T extends LobbyEvent['type']>(type: T, timeoutMs = WAIT_MS): Promise<Extract<LobbyEvent, { type: T }>> {
    const event = await this.take(`a ${type} event`, timeoutMs);
    if (event.type !== type) throw new Error(`expected a ${type} event, but the flow reported ${explain(event)}`);
    return event as Extract<LobbyEvent, { type: T }>;
  }

  /** Takes the next event, which must be an `error` or `closed` event with exactly this message. */
  async expectMessage(type: 'error' | 'closed', message: string, timeoutMs = LOGIN_WAIT_MS): Promise<void> {
    const event = await this.take(`the ${type} "${message}"`, timeoutMs);
    if (!('message' in event) || event.type !== type || event.message !== message) {
      throw new Error(`expected the ${type} "${message}", but the flow reported ${explain(event)}`);
    }
  }

  /** Ends the flow and waits until every connection it opened has closed, so the next flow starts clean. */
  async end(): Promise<void> {
    this.flow.dispose();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000); // the gateway's own close at the end of the run cuts whatever is left
      void Promise.all(this.ended).then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private take(wanted: string, timeoutMs: number): Promise<LobbyEvent> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        reject(new Error(`expected ${wanted}, but the flow said nothing for ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiting = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
    });
  }

  private onEvent(event: LobbyEvent): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    if (waiting !== undefined) waiting(event);
    else this.queue.push(event);
  }

  private async openAfterGap(open: OpenChannel, target: string): Promise<PacketChannel> {
    await waitForConnectGap();
    try {
      return await open(target);
    } catch (error) {
      // The flow reports only "cannot reach the gateway"; the reason is here.
      console.error(`live test: could not open ${target} through the gateway: ${(error as Error).message}`);
      throw error;
    }
  }

  /** The same channel, remembering when it closes. */
  private watch(channel: PacketChannel): PacketChannel {
    let closed!: () => void;
    this.ended.push(new Promise<void>((resolve) => { closed = resolve; }));
    const watched: PacketChannel = {
      send: (body) => channel.send(body),
      close: () => channel.close(),
      onPacket: () => {},
      onClose: () => {},
    };
    channel.onPacket = (body) => watched.onPacket(body);
    channel.onClose = (code) => {
      closed();
      watched.onClose(code);
    };
    return watched;
  }
}

// ---- Setup and cleanup -----------------------------------------------------------------------------------------

let gateway: Gateway;
const gatewayLog: string[] = [];
const sessions: Session[] = [];

function session(certifierAddress = config.certifierAddress, forwardedFor?: string): Session {
  const s = new Session(certifierAddress, forwardedFor);
  sessions.push(s);
  return s;
}

beforeAll(async () => {
  const certifier = config.gateway.routes[config.certifierAddress]!;
  await checkReachable(certifier.host, certifier.port);
  lastConnectAt = Date.now();
  try {
    gateway = await startGateway(
      {
        ...config.gateway,
        routes: { ...config.gateway.routes, [UNREACHABLE_ROUTE]: { host: '127.0.0.1', port: 23999, role: 'login' } },
      },
      { info: (line) => { gatewayLog.push(line); } },
    );
  } catch (error) {
    const { host, port } = config.gateway.listen;
    throw new Error(`Live test: the gateway cannot listen on ${host}:${port}: ${(error as Error).message}. Is the port taken? Change gateway.listen.port in live.config.json.`);
  }
});

beforeEach(() => {
  onTestFailed(() => {
    // What the gateway saw (addresses, routes, close codes; never packet contents) often explains a failure. A
    // connection's close line is written after the test that opened it has ended, so the last one is not in yet.
    console.error(`Gateway log so far:\n${gatewayLog.join('\n')}`);
  });
});

afterEach(async () => {
  for (const s of sessions.splice(0)) await s.end();
});

afterAll(async () => {
  await gateway?.close();
});

// ---- The tests -------------------------------------------------------------------------------------------------

it('logs in, lists, creates and deletes a character, then changes the channel', async () => {
  const s = session();
  await s.flow.login(config.account, config.password);
  const { servers } = await s.expect('serverList', LOGIN_WAIT_MS);

  // The first channel (an entry with a parent server) that is enabled and not full, as the lobby offers it.
  const isOpenChannel = (e: ServerEntry): boolean =>
    e.parent !== NULL_ID && e.enabled !== 0 && !(e.maxPlayers > 0 && e.playerCount >= e.maxPlayers);
  const channel = servers.find(isOpenChannel);
  if (channel === undefined) throw new Error(`the server list has no channel that is enabled and not full (${servers.length} entries)`);

  await s.flow.selectChannel(channel);
  const { characters } = await s.expect('characters');
  const slot = Array.from({ length: MAX_CHARACTER_SLOTS }, (_, i) => i).find((i) => !characters.some((c) => c.slot === i));
  if (slot === undefined) {
    throw new Error(`All ${MAX_CHARACTER_SLOTS} character slots of the test account are in use. Delete one by hand (or use another test account) and run again.`);
  }

  const name = `WebTest${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  s.flow.createCharacter({
    slot,
    name,
    face: 0,
    costume: 0,
    skinSet: 0,
    hairMesh: 0,
    hairColor: hairColorFor(Sex.MALE, 0),
    sex: Sex.MALE,
    job: JOB_VAGRANT,
    headMesh: 0,
    bankPin: Number(config.bankPin),
  });
  const created = await s.expect('characters');
  expect(created.characters.map((c) => c.name)).toContain(name);
  const createdSlot = created.characters.find((c) => c.name === name)!.slot;

  try {
    s.flow.deleteCharacter(createdSlot, config.bankPin);
    const afterDelete = await s.expect('characters');
    expect(afterDelete.characters.map((c) => c.name)).not.toContain(name);
  } catch (error) {
    throw new Error(`Deleting ${name} (slot ${createdSlot}) failed, so it may still be on the test account; delete it by hand. ${(error as Error).message}`, { cause: error });
  }

  // Change channel, as Neuz's Back button does it: the login-server connection closes, which ends the login on the
  // servers, so the flow waits a second and logs in again for a new server list and auth key. Its two connections
  // (certifier, then login server) keep the same spacing as every other one.
  try {
    s.flow.changeChannel();
    const again = await s.expect('serverList', LOGIN_WAIT_MS);
    const next = again.servers.find(isOpenChannel);
    if (next === undefined) throw new Error(`the new server list has no channel that is enabled and not full (${again.servers.length} entries)`);
    await s.flow.selectChannel(next);
    const listed = await s.expect('characters');
    expect(listed.characters.map((c) => `${c.slot}:${c.name}`)).toEqual(characters.map((c) => `${c.slot}:${c.name}`));
  } catch (error) {
    throw new Error(
      `Change channel failed (logging in, creating and deleting worked). An "alreadyConnected" here means the servers `
      + `still held the login a second after its connection closed. ${(error as Error).message}`,
      { cause: error },
    );
  }
}, 120000); // two logins: the waits above add up to more than the usual 60 s when a server is slow

it('a wrong password shows the login error', async () => {
  const s = session();
  await s.flow.login(config.account, `${config.password}-wrong`);
  await s.expectMessage('error', errorText(120));
});

it.skipIf(!config.certifierPatched)('a wrong password from one address does not block another', async () => {
  const a = session(config.certifierAddress, ADDRESS_A);
  await a.flow.login(config.account, `${config.password}-wrong`);
  await a.expectMessage('error', errorText(120));
  await a.end();

  // With one address shared, this login would be refused with errorText(134).
  const b = session(config.certifierAddress, ADDRESS_B);
  await b.flow.login(config.account, config.password);
  await b.expect('serverList', LOGIN_WAIT_MS);
});

it.skipIf(!config.certifierPatched || config.bannedTestAddress === null)('a banned address is refused', async () => {
  const s = session(config.certifierAddress, config.bannedTestAddress!);
  await s.flow.login(config.account, config.password);
  await s.expectMessage('error', errorText(132));
});

it('an unreachable server is reported', async () => {
  const s = session(UNREACHABLE_ROUTE);
  await s.flow.login(config.account, config.password);
  await s.expectMessage('closed', closeText(CloseCode.SERVER_UNREACHABLE), WAIT_MS);
});

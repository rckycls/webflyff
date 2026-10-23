// The live test: the real gateway, started inside this process, and the real LoginFlow, driven against the game
// servers running on this PC. It is not part of `npm test`; run it with `npm run test:live`.
//
// Before the first run copy live.config.example.json to live.config.json (same folder, git ignores it) and fill in a
// TEST account. The servers must be running.
//
// Two limits of the servers can lock you out if you run this too often:
//  - The certifier blocks the test account from an address for 15 seconds after one wrong password and for 15 minutes
//    after three in a row (a good login clears the count; the rebuilt certifier counts per address and account). One
//    run sends a wrong password from this PC and, with the rebuilt certifier, one from the simulated address
//    10.0.0.1. Run again within 15 seconds and the first login is refused with
//    "Wrong Password. Cannot log into account for 15 seconds".
//  - The servers' accept limiter, which helpers/connectGap.ts explains: every connection below waits until 300 ms after
//    the one before, and every flow ends, with its connections closed, before the next starts. Keep it that way, and
//    do not loop the test.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { CloseCode, MAX_CHARACTER_SLOTS } from '@flyffweb/protocol';
import { normalizeIPv4 } from '@flyffweb/gateway/src/clientAddress';
import type { Gateway } from '@flyffweb/gateway/src/server';
import { closeText, errorText } from '../src/lobby/errorText';
import { checkReachable } from './helpers/connectGap';
import { CONFIG_PATH, loadConfigFile, parseGatewaySettings, requireBankPin, requireText } from './helpers/liveConfig';
import type { GatewaySettings } from './helpers/liveConfig';
import { printGatewayLogOnFailure, startLiveGateway } from './helpers/liveGateway';
import { Link } from './helpers/liveLink';
import { LOGIN_WAIT_MS, LiveLobby, WAIT_MS, isOpenChannel, newVagrant } from './helpers/liveLobby';

// ---- The config ------------------------------------------------------------------------------------------------

interface LiveConfig extends GatewaySettings {
  account: string;
  password: string;
  /** The 4-digit Bank PIN for the character the test creates and deletes. */
  bankPin: string;
  /** True when the rebuilt certifier (Task 10) runs with a `Gateway` line, so it tells the simulated addresses apart. */
  certifierPatched: boolean;
  /** An address listed in `IPCut.ini`, or `null`. */
  bannedTestAddress: string | null;
}

const HOW_TO_SET_UP =
  'Copy apps/client/test/live.config.example.json to apps/client/test/live.config.json, fill in a test account, '
  + 'start the game servers and run `npm run test:live` again. The comment at the top of the example explains the settings.';

/** Checks the contents of a `live.config.json` (anything it holds besides these fields, `_comment` included, is ignored). */
function parseLiveConfig(root: Record<string, unknown>): LiveConfig {
  const { gateway, certifierAddress } = parseGatewaySettings(root);
  const bankPin = requireBankPin(root);

  if (typeof root.certifierPatched !== 'boolean') throw new Error('certifierPatched must be true or false');
  const banned = root.bannedTestAddress ?? null;
  if (banned !== null && (typeof banned !== 'string' || normalizeIPv4(banned) !== banned)) {
    throw new Error('bannedTestAddress must be a dotted IPv4 address, or null');
  }
  if ((root.certifierPatched || banned !== null) && !gateway.trustedProxies.includes('127.0.0.1')) {
    throw new Error('gateway.trustedProxies must list "127.0.0.1": the test plays other addresses with X-Forwarded-For');
  }

  return {
    gateway, certifierAddress, account: requireText(root, 'account'), password: requireText(root, 'password'), bankPin,
    certifierPatched: root.certifierPatched, bannedTestAddress: banned,
  };
}

function loadConfig(): LiveConfig {
  const loaded = loadConfigFile('Live test', parseLiveConfig);
  if (loaded === undefined) throw new Error(`Live test: ${CONFIG_PATH} does not exist. ${HOW_TO_SET_UP}`);
  return loaded;
}

// Read while the file is collected: the skipped tests below depend on it, and a missing file stops the run here, at once.
const config = loadConfig();

// ---- Addresses -------------------------------------------------------------------------------------------------

/** Closed on purpose: nothing listens here, so the gateway cannot connect and ends the connection with 4001. */
const UNREACHABLE_ROUTE = '172.31.238.55:23999';
const ADDRESS_A = '10.0.0.1';
const ADDRESS_B = '10.0.0.2';

// ---- Setup and cleanup -----------------------------------------------------------------------------------------

let gateway: Gateway;
let gatewayLog: string[];
const sessions: LiveLobby[] = [];

function session(certifierAddress = config.certifierAddress, forwardedFor?: string): LiveLobby {
  const s = new LiveLobby(new Link(gateway.port, config.gateway.allowedOrigins[0]!, forwardedFor), certifierAddress);
  sessions.push(s);
  return s;
}

beforeAll(async () => {
  const certifier = config.gateway.routes[config.certifierAddress]!;
  await checkReachable('Live test', certifier.host, certifier.port, 'npm run test:live');
  ({ gateway, log: gatewayLog } = await startLiveGateway('Live test', {
    ...config.gateway,
    routes: { ...config.gateway.routes, [UNREACHABLE_ROUTE]: { host: '127.0.0.1', port: 23999, role: 'login' } },
  }));
});

beforeEach(() => {
  printGatewayLogOnFailure(gatewayLog);
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

  const channel = servers.find(isOpenChannel);
  if (channel === undefined) throw new Error(`the server list has no channel that is enabled and not full (${servers.length} entries)`);

  await s.flow.selectChannel(channel);
  const { characters } = await s.expect('characters');
  const slot = Array.from({ length: MAX_CHARACTER_SLOTS }, (_, i) => i).find((i) => !characters.some((c) => c.slot === i));
  if (slot === undefined) {
    throw new Error(`All ${MAX_CHARACTER_SLOTS} character slots of the test account are in use. Delete one by hand (or use another test account) and run again.`);
  }

  const name = `WebTest${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  s.flow.createCharacter(newVagrant(slot, name, config.bankPin));
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

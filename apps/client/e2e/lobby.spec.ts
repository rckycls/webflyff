import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ArWriter, NULL_ID, PacketType, Port, bytesToHex, deleteKey, encodeCertify, encodeCreatePlayer, encodeDeletePlayer,
  hashPassword,
} from '@flyffweb/protocol';
import { hairColorFor } from '../src/lobby/appearance';

test('shows the login form and reports an unreachable gateway', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Cannot reach the game gateway.');
});

// The tests below play the gateway and the servers behind it: each WebSocket the page opens is answered by a script
// that sends the packets a server would, so the screens are checked with real packets through the real flow.

const AUTH_KEY = 7;
const HASH = hashPassword('password1');

interface ServerRow {
  parent: number;
  id: number;
  name: string;
  playerCount: number;
  enabled: number;
  maxPlayers: number;
}

const FLYFF: ServerRow = { parent: NULL_ID, id: 1, name: 'FlyFF', playerCount: 0, enabled: 1, maxPlayers: 0 };
const OPEN_CHANNEL: ServerRow = { parent: 1, id: 1, name: 'Channel 1', playerCount: 12, enabled: 1, maxPlayers: 500 };
const OFFLINE_CHANNEL: ServerRow = { parent: 1, id: 2, name: 'Channel 2', playerCount: 0, enabled: 0, maxPlayers: 500 };
const FULL_CHANNEL: ServerRow = { parent: 1, id: 3, name: 'Channel 3', playerCount: 500, enabled: 1, maxPlayers: 500 };

function serverList(rows: ServerRow[]): Buffer {
  const w = new ArWriter().u32(PacketType.SRVR_LIST).u32(AUTH_KEY).u8(0).string('webtester').u32(rows.length);
  for (const r of rows) {
    w.u32(r.parent).u32(r.id).string(r.name).string(r.parent === NULL_ID ? '172.31.238.55' : '').i32(0).i32(r.playerCount)
      .i32(r.enabled).i32(r.maxPlayers);
  }
  return Buffer.from(w.toBytes());
}

interface CharacterRow {
  slot: number;
  name: string;
  level: number;
  playerId: number;
}

function playerList(characters: CharacterRow[]): Buffer {
  const w = new ArWriter().u32(PacketType.PLAYER_LIST).u32(AUTH_KEY).i32(characters.length);
  for (const c of characters) {
    w.i32(c.slot).i32(0).u32(1).u32(11).string(c.name).vec3([6968, 100, 3328])
      .u32(c.playerId).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0xff907b6d).u32(1).u8(0).i32(0).i32(c.level).u32(0)
      .i32(15).i32(15).i32(15).i32(15).u32(0).i32(0);
  }
  return Buffer.from(w.i32(0).toBytes());
}

const errorPacket = (code: number): Buffer => Buffer.from(new ArWriter().u32(PacketType.ERROR).i32(code).toBytes());

const WEBBY: CharacterRow = { slot: 0, name: 'Webby', level: 15, playerId: 500 };

/** A packet the page sent: the port it went to, the connection it came on (1, 2, ... in the order opened), its type and its whole body. */
interface Sent {
  port: number;
  connection: number;
  type: number;
  body: Buffer;
}

type Reply = (packet: Buffer) => void;
/** Answers a packet the page sent: `reply` sends a packet back, `close` ends the connection the way the gateway does, with a close code. */
type Respond = (sent: Sent, reply: Reply, close: (code: number) => void) => void;

/** Plays the gateway: `certifier` and `login` answer what the page sends to each server. Returns everything the page has sent so far, in order. */
async function playGateway(page: Page, servers: { certifier?: Respond; login?: Respond }): Promise<Sent[]> {
  const sent: Sent[] = [];
  let connections = 0;
  await page.routeWebSocket(/\/connect\//, (ws) => {
    const port = Number(new URL(ws.url()).pathname.split(':').pop());
    const connection = ++connections;
    const respond = port === Port.LOGIN ? servers.login : servers.certifier;
    ws.onMessage((message) => {
      const body = Buffer.from(message as Buffer);
      // Packets to the login server start with DPID_UNKNOWN; the certifier's start with the type.
      const entry = { port, connection, type: body.readUInt32LE(port === Port.LOGIN ? 4 : 0), body };
      sent.push(entry);
      respond?.(entry, (packet) => ws.send(packet), (code) => void ws.close({ code }));
    });
  });
  return sent;
}

/** A certifier that accepts the login and lists `rows`. */
const listing = (rows: ServerRow[]): Respond => ({ type }, reply) => {
  if (type === PacketType.CERTIFY) reply(serverList(rows));
};

async function logIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Account').fill(' WebTester ');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * Every control is a comfortable touch target, no input is small enough to make iOS zoom in, and nothing makes the
 * page scroll sideways.
 */
async function expectPhoneFriendly(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    for (const control of document.querySelectorAll<HTMLElement>('button, input')) {
      const box = control.getBoundingClientRect();
      if (box.height < 44 || box.width < 44) found.push(`${control.tagName} ${control.textContent ?? ''} is ${box.width}x${box.height}`);
      if (control instanceof HTMLInputElement && control.type !== 'radio' && parseFloat(getComputedStyle(control).fontSize) < 16) {
        found.push(`input ${control.name} has a font smaller than 16px`);
      }
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push('the page scrolls sideways');
    return found;
  });
  expect(problems).toEqual([]);
}

test.describe('the lobby against scripted servers', () => {
  test('lists servers and channels; an offline or a full channel cannot be picked', async ({ page }) => {
    await playGateway(page, { certifier: listing([FLYFF, OPEN_CHANNEL, OFFLINE_CHANNEL, FULL_CHANNEL]) });
    await logIn(page);
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'FlyFF', level: 3 })).toBeVisible();
    await expectPhoneFriendly(page);

    const open = page.getByRole('button', { name: /Channel 1/ });
    const offline = page.getByRole('button', { name: /Channel 2/ });
    const full = page.getByRole('button', { name: /Channel 3/ });
    await expect(open).toContainText('12 / 500');
    await expect(open).not.toHaveAttribute('aria-disabled', 'true');
    await expect(offline).toHaveAttribute('aria-disabled', 'true');
    await expect(offline).toContainText('Offline');
    await expect(full).toHaveAttribute('aria-disabled', 'true');
    await expect(full).toContainText('Full');

    // Tapping them does nothing. Picking a channel sets the status line at once, before anything is sent, so an empty
    // status line right after the taps shows they were not taken as picks.
    // (`force`: Playwright would wait for an `aria-disabled` button to become enabled, which is what a tap does not do.)
    await offline.click({ force: true });
    await full.click({ force: true });
    await expect(page.getByRole('status')).toBeEmpty();
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
  });

  test('takes one tap on a channel, and frees the channels again if the server refuses', async ({ page }) => {
    const waiting: Reply[] = [];
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL, { ...OPEN_CHANNEL, id: 4, name: 'Channel 4' }]),
      // The login server answers only when the test says so.
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) waiting.push(reply);
      },
    });
    await logIn(page);
    const channel1 = page.getByRole('button', { name: /Channel 1/ });
    const channel4 = page.getByRole('button', { name: /Channel 4/ });
    await channel1.dblclick();
    await expect(page.getByRole('status')).toHaveText('Loading the characters…');
    // While the answer is awaited no channel can be picked: the second tap was dropped and the others are quiet too.
    await expect(channel1).toHaveAttribute('aria-disabled', 'true');
    await expect(channel4).toHaveAttribute('aria-disabled', 'true');
    await channel4.click({ force: true });
    await expect.poll(() => waiting.length).toBe(1);

    // "Server capacity has been reached": the message is shown, the status line is empty, the channels can be tried again.
    waiting[0]!(errorPacket(108));
    await expect(page.getByRole('alert')).toHaveText('Server capacity has been reached.');
    await expect(page.getByRole('status')).toBeEmpty();
    await expect(channel1).not.toHaveAttribute('aria-disabled', 'true');
    await expect(channel4).not.toHaveAttribute('aria-disabled', 'true');

    await channel4.click();
    await expect.poll(() => waiting.length).toBe(2);
    waiting[1]!(playerList([WEBBY]));
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();
    // Two picks in all (channel 1, then channel 4), so two requests: the double tap and the taps while waiting added none.
    expect(sent.filter((s) => s.type === PacketType.GETPLAYERLIST)).toHaveLength(2);
  });

  test('shows text from the server as text, not as markup', async ({ page }) => {
    const markup = "<img src=x onerror=pwned=1>";
    await playGateway(page, {
      certifier: listing([{ ...FLYFF, name: '<i>Fly</i>FF' }, { ...OPEN_CHANNEL, name: markup }]),
    });
    await logIn(page);
    await expect(page.getByRole('heading', { name: '<i>Fly</i>FF' })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(markup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
    await expect(page.locator('main i, main img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });

  test('shows the three slots, and creates a character with the chosen look', async ({ page }) => {
    let created = false;
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) reply(playerList([WEBBY]));
        // The first attempt meets a name already in use; the second is accepted.
        if (type === PacketType.CREATE_PLAYER) {
          if (!created) {
            created = true;
            reply(errorPacket(1316));
          } else reply(playerList([WEBBY, { slot: 1, name: 'WebTest1', level: 1, playerId: 501 }]));
        }
      },
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();

    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeFocused();
    await expect(page.getByRole('listitem').filter({ hasText: 'Webby' })).toContainText('Level 15 · Job 0');
    await expect(page.getByRole('button', { name: 'Empty — Create' })).toHaveCount(2);
    await expectPhoneFriendly(page);

    await page.getByRole('button', { name: 'Empty — Create' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create a character in slot 2' })).toBeVisible();
    await expectPhoneFriendly(page);

    // Each rule is checked before anything is sent.
    const create = page.getByRole('button', { name: 'Create', exact: true });
    await create.click();
    await expect(page.getByRole('alert')).toHaveText('Enter name.');
    // A submit that is sent disables the button at once; it is still enabled, so nothing was sent.
    await expect(create).toBeEnabled();
    await page.getByLabel('Name').fill('WebTest1');
    await page.getByLabel('Bank PIN', { exact: true }).fill('12');
    await create.click();
    await expect(page.getByRole('alert')).toHaveText('The Bank PIN should be a 4 digit number.');
    await expect(create).toBeEnabled();
    await page.getByLabel('Bank PIN', { exact: true }).fill('1234');
    await page.getByLabel('Confirm Bank PIN').fill('1235');
    await create.click();
    await expect(page.getByRole('alert')).toHaveText('Bank PINs do not match.');
    await expect(create).toBeEnabled();

    // Female, hair 2, head 5 (one step back from 1 wraps around).
    await page.getByRole('radio', { name: 'Female' }).check();
    await page.getByRole('button', { name: 'Next hair' }).click();
    await page.getByRole('button', { name: 'Previous head' }).click();
    await expect(page.getByRole('group', { name: 'Hair' })).toContainText('2 / 5');
    await expect(page.getByRole('group', { name: 'Head' })).toContainText('5 / 5');
    await page.getByLabel('Confirm Bank PIN').fill('1234');
    await create.click();

    // The name is taken: the message is shown and the form still holds what was typed.
    await expect(page.getByRole('alert')).toHaveText('That character name is already in use.');
    await expect(page.getByLabel('Name')).toHaveValue('WebTest1');
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'WebTest1' })).toContainText('Level 1');
    await expect(page.getByRole('button', { name: 'Empty — Create' })).toHaveCount(1);

    const expected = encodeCreatePlayer('webtester', HASH, {
      slot: 1, name: 'WebTest1', face: 0, costume: 0, skinSet: 0, hairMesh: 1, hairColor: hairColorFor(1, 1), sex: 1, job: 0, headMesh: 4, bankPin: 1234,
    }, AUTH_KEY);
    const packets = sent.filter((s) => s.type === PacketType.CREATE_PLAYER);
    expect(packets).toHaveLength(2);
    // The login server's packets start with DPID_UNKNOWN, which the encoder writes too.
    expect(bytesToHex(new Uint8Array(packets[1]!.body))).toBe(bytesToHex(expected));
  });

  test('deletes a character after the Bank PIN is typed', async ({ page }) => {
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) reply(playerList([WEBBY]));
        if (type === PacketType.DEL_PLAYER) reply(playerList([]));
      },
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await page.getByRole('button', { name: 'Delete Webby' }).click();
    await expect(page.getByRole('heading', { name: 'Delete a character' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Delete Webby, level 15?');
    await expectPhoneFriendly(page);

    const pin = page.getByLabel('Bank PIN');
    const confirm = page.getByRole('button', { name: 'Delete', exact: true });
    await pin.fill('abcd');
    await confirm.click();
    await expect(page.getByRole('alert')).toHaveText('The Bank PIN should be a 4 digit number.');
    // A submit that is sent disables the button at once; it is still enabled, so nothing was sent.
    await expect(confirm).toBeEnabled();

    await pin.fill('1234');
    await confirm.click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Empty — Create' })).toHaveCount(3);
    const packet = sent.find((s) => s.type === PacketType.DEL_PLAYER)!;
    expect(bytesToHex(new Uint8Array(packet.body))).toBe(
      bytesToHex(encodeDeletePlayer('webtester', HASH, deleteKey('1234'), 500, AUTH_KEY, [])),
    );
  });

  test('changes the channel by logging in again, as the game does', async ({ page }) => {
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL, { ...OPEN_CHANNEL, id: 4, name: 'Channel 4' }]),
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) reply(playerList([WEBBY]));
      },
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();

    // The login server forgets the login when its connection closes, so the lobby logs in again for a new server
    // list, showing the login form busy meanwhile, as the game's Back button does.
    await page.getByRole('button', { name: 'Change channel' }).click();
    await expect(page.getByRole('status')).toHaveText('Logging in…');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await page.getByRole('button', { name: /Channel 4/ }).click();
    await expect(page.getByRole('heading', { name: 'Your characters' })).toBeVisible();

    const certifies = sent.filter((s) => s.type === PacketType.CERTIFY);
    expect(certifies).toHaveLength(2);
    expect(certifies[1]!.connection).not.toBe(certifies[0]!.connection);
    expect(bytesToHex(new Uint8Array(certifies[1]!.body))).toBe(bytesToHex(encodeCertify('webtester', HASH)));
    // One character list per login, each on its own connection: channel 1, then channel 4.
    const lists = sent.filter((s) => s.type === PacketType.GETPLAYERLIST);
    expect(lists.map((s) => s.body.readUInt32LE(s.body.length - 4))).toEqual([1, 4]);
    expect(lists[1]!.connection).not.toBe(lists[0]!.connection);
  });

  test('offers to disconnect an account that is logged in elsewhere', async ({ page }) => {
    const sent = await playGateway(page, {
      certifier: ({ type }, reply) => {
        if (type === PacketType.CERTIFY) reply(errorPacket(103));
      },
    });
    await logIn(page);
    await expect(page.getByRole('heading', { name: 'Already connected' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('This account is already connected.');
    await expectPhoneFriendly(page);

    await page.getByRole('button', { name: 'Disconnect it' }).click();
    await expect.poll(() => sent.some((s) => s.type === PacketType.CLOSE_EXISTING_CONNECTION)).toBe(true);
    // Back at the login form with the account kept, to log in again.
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expect(page.getByLabel('Account')).toHaveValue('WebTester');
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByRole('status')).toContainText('Log in again');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('says why a connection ended and returns to the login form', async ({ page }) => {
    await playGateway(page, { certifier: (_sent, _reply, close) => close(4001) });
    await logIn(page);
    await expect(page.getByRole('alert')).toHaveText('The game server is not reachable. Try again later.');
    await expect(page.getByLabel('Account')).toHaveValue('WebTester');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await expectPhoneFriendly(page);
  });

  test('a wrong password message from the server returns to the login form', async ({ page }) => {
    await playGateway(page, {
      certifier: ({ type }, reply) => {
        if (type === PacketType.CERTIFY) reply(errorPacket(120));
      },
    });
    await logIn(page);
    await expect(page.getByRole('alert')).toHaveText('Login details incorrect. Please try again.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ArWriter, NULL_ID, PacketType, Port, bytesToHex, deleteKey, encodeCertify, encodeCreatePlayer, encodeDeletePlayer,
  hashPassword,
} from '@flyffweb/protocol';
import { hairColorFor } from '../src/lobby/appearance';

test('shows the login form and reports an unreachable gateway', async ({ page }) => {
  await page.goto('/play/');
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
  /** The block flag: 1 (the default) may be played, 0 is blocked (`_Database/DbManager.cpp:571-579`). */
  blocked?: number;
  /** The equipment's item ids; none by default. */
  equipment?: number[];
}

function playerList(characters: CharacterRow[]): Buffer {
  const w = new ArWriter().u32(PacketType.PLAYER_LIST).u32(AUTH_KEY).i32(characters.length);
  for (const c of characters) {
    const equipment = c.equipment ?? [];
    w.i32(c.slot).i32(c.blocked ?? 1).u32(1).u32(11).string(c.name).vec3([6968, 100, 3328])
      .u32(c.playerId).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0xff907b6d).u32(1).u8(0).i32(0).i32(c.level).u32(0)
      .i32(15).i32(15).i32(15).i32(15).u32(0).i32(equipment.length);
    for (const id of equipment) w.u32(id);
  }
  return Buffer.from(w.i32(0).toBytes());
}

const errorPacket = (code: number): Buffer => Buffer.from(new ArWriter().u32(PacketType.ERROR).i32(code).toBytes());
const cacheAddr = (address: string): Buffer => Buffer.from(new ArWriter().u32(PacketType.CACHE_ADDR).string(address).toBytes());
const tickCount = (sentAt: number, tick: bigint): Buffer => Buffer.from(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(sentAt).i64(tick).toBytes());

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

/**
 * Plays the gateway: `certifier` and `login` answer what the page sends to each server. Returns everything the page has
 * sent so far, in order. The connections the page closes are added to `closed`, by the number they were opened as.
 */
async function playGateway(page: Page, servers: { certifier?: Respond; login?: Respond }, closed: number[] = []): Promise<Sent[]> {
  const sent: Sent[] = [];
  let connections = 0;
  await page.routeWebSocket(/\/connect\//, (ws) => {
    const port = Number(new URL(ws.url()).pathname.split(':').pop());
    const connection = ++connections;
    const respond = port === Port.LOGIN ? servers.login : servers.certifier;
    ws.onClose(() => closed.push(connection));
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

/**
 * A login server as the real one answers (`CDPLoginSrvr`): the clock for QUERYTICKCOUNT, then for GETPLAYERLIST the
 * cache address and the characters.
 */
const enterable = (characters: CharacterRow[]): Respond => ({ type, body }, reply) => {
  if (type === PacketType.QUERYTICKCOUNT) reply(tickCount(body.readUInt32LE(8), 123456789n));
  if (type === PacketType.GETPLAYERLIST) {
    reply(cacheAddr('172.31.238.55'));
    reply(playerList(characters));
  }
};

async function logIn(page: Page, path = '/play/'): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Account').fill(' WebTester ');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * Classic compact controls stay usable, no input is small enough to make iOS zoom in, and nothing makes the
 * page scroll sideways. With a mouse, V15's own sizes stand (its edits are 20 px high, in 12 px text); on a touch screen
 * every control is at least 28 px high (an input 24) and every input's text 16 px.
 */
async function expectPhoneFriendly(page: Page): Promise<void> {
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const coarse = matchMedia('(pointer: coarse)').matches;
    for (const control of document.querySelectorAll<HTMLElement>('button, input')) {
      const box = control.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue; // a hidden control
      if (control.closest('[inert]') !== null) continue; // a window under a modal one
      const minimum = coarse ? (control instanceof HTMLInputElement ? 24 : 28) : 20;
      if (box.height < minimum || box.width < 28) found.push(`${control.tagName} ${control.textContent ?? ''} is ${box.width}x${box.height}`);
      if (coarse && control instanceof HTMLInputElement && control.type !== 'radio' && parseFloat(getComputedStyle(control).fontSize) < 16) {
        found.push(`input ${control.name} has a font smaller than 16px`);
      }
    }
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push('the page scrolls sideways');
    return found;
  });
  expect(problems).toEqual([]);
}

/** The window's buttons and edits that are off the screen or under something else, by name; [] when all can be pressed. */
async function unreachable(page: Page, window: string): Promise<string[]> {
  return page.locator(`${window} :is(button, input):visible`).evaluateAll((controls) => controls.flatMap((control) => {
    if (control.closest('[inert]') !== null) return [];
    const b = control.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight || !control.contains(hit)
      ? [control.getAttribute('aria-label') ?? control.getAttribute('name') ?? control.textContent] : [];
  }));
}

/** The landscape phone sizes the windows must fit whole: the smallest, the owner's 750 x 342, the Pixel 7's. */
const PHONE_SIZES = [{ width: 568, height: 320 }, { width: 750, height: 342 }, { width: 844, height: 390 }];

/** Math.random gives 0 from the start: the New Character window opens with hair style 1 and face 1. */
const NO_RANDOM = (): void => { Math.random = () => 0; };

test('classic lobby artwork, previews and bounds', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(NO_RANDOM);
  await playGateway(page, {
    certifier: listing([FLYFF, OPEN_CHANNEL]),
    login: enterable([WEBBY, { slot: 2, name: 'Thirdly', level: 61, playerId: 502, equipment: [504, 508, 512, 21] }]),
  });
  await page.goto('/play/');
  await expect.poll(() => page.locator('#app').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('screen.');
  await page.screenshot({ path: info.outputPath('login.png') });
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('servers.png') });
  await page.getByRole('button', { name: 'Next' }).click();
  // the two characters drawn in 3D, from the theme's art
  await expect(page.locator('.cs-portrait canvas')).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('#app')).toHaveClass(/lobby-skinned/);
  await expect.poll(() => page.locator('.cc-ok, .cs-accept').first().evaluate(el => getComputedStyle(el).backgroundImage)).toContain('buttaccept.');
  // the selected character stands, the other sits: both are drawn (a canvas with pixels)
  await expect.poll(() => page.locator('.cs-portrait canvas').evaluateAll((canvases) => canvases.map((c) => (c as HTMLCanvasElement).width > 0)))
    .toEqual([true, true]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('characters.png') });
  const phone = info.project.name === 'phone';
  const sizes = phone ? PHONE_SIZES : [page.viewportSize()!];
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await unreachable(page, '.select-char'), `select at ${size.width}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`characters-${size.width}.png`) });
  }

  // New Character, with its preview
  await page.getByRole('button', { name: 'Select slot 2, Available' }).click();
  await page.getByRole('button', { name: 'Create in slot 2' }).click();
  await expect(page.getByRole('heading', { name: 'New Character' })).toBeVisible();
  await expect(page.locator('.cc-preview canvas')).toHaveCount(1, { timeout: 60_000 });
  await expect.poll(() => page.locator('.cc-male').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('buttmale.');
  await page.waitForTimeout(1500);
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await unreachable(page, '.create-char'), `create at ${size.width}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`create-${size.width}.png`) });
  }
  // a message does not cover the window's controls
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter name.');
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await unreachable(page, '.create-char'), `create with a message at ${size.width}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`create-message-${size.width}.png`) });
  }
  await page.getByRole('button', { name: 'Cancel' }).click();
  // back on the select window with the empty slot still selected, as m_nSelectCharacter keeps it
  await expect(page.getByRole('button', { name: 'Select slot 2, Available' })).toHaveAttribute('aria-pressed', 'true');

  // Delete Character, over the select window
  await page.getByRole('button', { name: 'Select Webby' }).click();
  await page.getByRole('button', { name: 'Delete Webby' }).click();
  await expect(page.getByRole('dialog', { name: 'Delete Character' })).toBeVisible();
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(await unreachable(page, '.delete-char'), `delete at ${size.width}`).toEqual([]);
    await page.screenshot({ path: info.outputPath(`delete-${size.width}.png`) });
  }
});

test.describe('the lobby against scripted servers', () => {
  test('lists servers and channels; an offline or a full channel cannot be picked', async ({ page }) => {
    await playGateway(page, { certifier: listing([FLYFF, OPEN_CHANNEL, OFFLINE_CHANNEL, FULL_CHANNEL]) });
    await logIn(page);
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'FlyFF', exact: true })).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();
    // Two picks in all (channel 1, then channel 4), so two requests: the double tap and the taps while waiting added none.
    expect(sent.filter((s) => s.type === PacketType.GETPLAYERLIST)).toHaveLength(2);
  });

  test('shows text from the server as text, not as markup', async ({ page }) => {
    const markup = "<img src=x onerror=pwned=1>";
    await playGateway(page, {
      certifier: listing([{ ...FLYFF, name: '<i>Fly</i>FF' }, { ...OPEN_CHANNEL, name: markup }]),
    });
    await logIn(page);
    await expect(page.getByRole('button', { name: '<i>Fly</i>FF', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(markup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
    await expect(page.locator('main i, main img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });

  test('selects as V15 does: three slots, the buttons by the selection, the arrows and the tooltip', async ({ page }, info) => {
    await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: enterable([WEBBY, { slot: 2, name: 'Thirdly', level: 61, playerId: 502 }]),
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeFocused();
    await expectPhoneFriendly(page);

    // the first slot selected: its name in blue; Create off, Delete and Accept on
    const webby = page.getByRole('button', { name: 'Select Webby' });
    const empty = page.getByRole('button', { name: 'Select slot 2, Available' });
    const third = page.getByRole('button', { name: 'Select Thirdly' });
    await expect(webby).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cs-name.selected')).toHaveText('Webby');
    await expect(page.locator('.cs-name')).toHaveText(['Webby', 'Available', 'Thirdly']);
    await expect(page.getByRole('button', { name: 'Create' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Webby' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Enter Webby' })).toBeEnabled();
    // the stats are in the tooltip, for a screen reader in the slot's description
    await expect(webby).toHaveAccessibleDescription(/SEX: Male, Level : 15, Strength : 15, Stamina : 15, Dexterity : 15, Intelligence : 15/);

    // an empty slot: Create on, the others off
    await empty.click();
    await expect(empty).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Create in slot 2' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeDisabled();

    // Right and Left move the selection, wrapping round
    await page.keyboard.press('ArrowRight');
    await expect(third).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(webby).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(third).toHaveAttribute('aria-pressed', 'true');

    if (info.project.name !== 'phone') {
      // a mouse over a character shows its tooltip, as PutToolTip_Character writes it
      await webby.hover();
      const tip = page.locator('.cs-tip');
      await expect(tip).toBeVisible();
      await expect(tip.locator('.cs-tip-line')).toHaveText([
        'Webby', 'SEX: Male', 'Level : 15', 'Strength : 15', 'Stamina : 15', 'Dexterity : 15', 'Intelligence : 15', /^Job : /,
      ]);
      await page.mouse.move(2, 2);
      await expect(tip).toBeHidden();
    }
  });

  test('refuses a blocked character, and selects the first usable one', async ({ page }) => {
    await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: enterable([{ ...WEBBY, blocked: 0 }, { slot: 2, name: 'Thirdly', level: 61, playerId: 502 }]),
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    // slot 1 is blocked: the selection moves to the first character that may be played (OnPlayerList)
    await expect(page.getByRole('button', { name: 'Select Thirdly' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Select Webby' }).click();
    await expect(page.getByRole('alert')).toHaveText('You cannot use this character.');
    await expect(page.getByRole('button', { name: 'Select Thirdly' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Select Webby' })).toHaveAccessibleDescription(/^Webby, Connet Cut, SEX: Male/);
  });

  test('creates a character in V15\'s New Character window', async ({ page }) => {
    await page.addInitScript(NO_RANDOM);
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
    await page.getByRole('button', { name: 'Select slot 2, Available' }).click();
    const nameRules = page.waitForResponse(/\/data\/party\.[0-9a-f]+\.json$/);
    await page.getByRole('button', { name: 'Create in slot 2' }).click();
    await expect(page.getByRole('heading', { name: 'New Character' })).toBeVisible();
    await nameRules;
    await expectPhoneFriendly(page);

    // V15's opening look: a woman (Math.random is 0 here: hair style 1, face 1); the hair colour buttons are off
    const form = page.locator('.create-char');
    await expect(page.getByRole('button', { name: 'Female' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Male', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(form).toHaveAttribute('data-hair', '0');
    await expect(form).toHaveAttribute('data-face', '0');
    await expect(page.getByRole('button', { name: 'Previous hair color' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next hair color' })).toBeDisabled();
    await expect(form).toContainText('Character PIN is the same as your Bank PIN.');

    // Each rule is checked before anything is sent, in V15's order.
    const ok = page.getByRole('button', { name: 'OK' });
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Enter name.');
    // A submit that is sent disables the button at once; it is still enabled, so nothing was sent.
    await expect(ok).toBeEnabled();
    await page.getByLabel('Character Name').fill('abc');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Character Name must be 4 to 16 characters long.');
    await page.getByLabel('Character Name').fill('9Webs');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('The name cannot start with a number.');
    await page.getByLabel('Character Name').fill('Web Test');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('You cannot use special characters or spaces in a name.');
    // InvalidName_ENG.inc holds "GM"
    await page.getByLabel('Character Name').fill('TheGMkid');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Character name is not allowed.');
    await page.getByLabel('Character Name').fill('WebTest1');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Enter the Bank PIN to continue.');
    // the PIN edits keep digits only
    await page.getByLabel('Bank PIN', { exact: true }).fill('1a2');
    await expect(page.getByLabel('Bank PIN', { exact: true })).toHaveValue('12');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('The Bank PIN should be a 4 digit number.');
    await page.getByLabel('Bank PIN', { exact: true }).fill('0000');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Invalid Bank PIN.');
    await page.getByLabel('Bank PIN', { exact: true }).fill('1234');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Confirm Bank PIN.');
    await page.getByLabel('Confirm Bank PIN').fill('1235');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Bank PINs do not match.');
    await expect(ok).toBeEnabled();

    // Male, hair style 2, face 5 (one step back from 1 wraps round); the preview follows
    await page.getByRole('button', { name: 'Male', exact: true }).click();
    await page.getByRole('button', { name: 'Next hair style' }).click();
    await page.getByRole('button', { name: 'Previous face' }).click();
    await expect(page.getByRole('button', { name: 'Male', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Hair Style' })).toContainText('Hair style 2 of 5');
    await expect(page.getByRole('group', { name: 'Face' })).toContainText('Face 5 of 5');
    await expect(page.locator('.cc-preview canvas')).toHaveCount(1, { timeout: 60_000 });
    await page.getByLabel('Confirm Bank PIN').fill('1234');
    await ok.click();

    // The name is taken: the message is shown, the window still holds what was typed, OK and Cancel are on again.
    await expect(page.getByRole('alert')).toHaveText('That character name is already in use.');
    await expect(page.getByLabel('Character Name')).toHaveValue('WebTest1');
    await expect(ok).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    await ok.click();
    // back on Select Character, the new character in its slot and still selected
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select WebTest1' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Enter WebTest1' })).toBeEnabled();

    const expected = encodeCreatePlayer('webtester', HASH, {
      slot: 1, name: 'WebTest1', face: 0, costume: 0, skinSet: 0, hairMesh: 1, hairColor: hairColorFor(0, 1), sex: 0, job: 0, headMesh: 4, bankPin: 1234,
    }, AUTH_KEY);
    const packets = sent.filter((s) => s.type === PacketType.CREATE_PLAYER);
    expect(packets).toHaveLength(2);
    // The login server's packets start with DPID_UNKNOWN, which the encoder writes too.
    expect(bytesToHex(new Uint8Array(packets[1]!.body))).toBe(bytesToHex(expected));
  });

  test('Cancel on New Character goes back to Select Character', async ({ page }) => {
    await playGateway(page, { certifier: listing([FLYFF, OPEN_CHANNEL]), login: enterable([WEBBY]) });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await page.getByRole('button', { name: 'Select slot 3, Available' }).click();
    await page.getByRole('button', { name: 'Create in slot 3' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select slot 3, Available' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('deletes a character in V15\'s Delete Character window, over Select Character', async ({ page }) => {
    let refused = false;
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) reply(playerList([WEBBY]));
        // the first try is refused (the server's "wrong number"), the second deletes
        if (type === PacketType.DEL_PLAYER) {
          if (!refused) {
            refused = true;
            reply(errorPacket(1319));
          } else reply(playerList([]));
        }
      },
    });
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await page.getByRole('button', { name: 'Delete Webby' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Character' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Enter this character's bank PIN");
    await expect(dialog).toContainText('(0000 if you never set one)');
    // the select window stays behind it, out of reach
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeAttached();
    await expect(page.locator('.cs-slots')).toHaveAttribute('inert', '');
    await expectPhoneFriendly(page);

    // Cancel closes it; the select window is as it was
    await dialog.getByRole('button', { name: 'CANCEL' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select Webby' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Delete Webby' }).click();
    const password = dialog.getByLabel('Bank PIN');
    const ok = dialog.getByRole('button', { name: 'OK' });
    // V15's LANG_ENG rule: nothing typed is "Please Re-enter SSN." (sic), and nothing is sent
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Please Re-enter SSN.');
    await expect(ok).toBeEnabled();

    // any password goes; the server's refusal (a wrong bank PIN, 2026-11-17) keeps the window, with OK and CANCEL on again
    await password.fill('wrong one');
    await ok.click();
    await expect(page.getByRole('alert')).toHaveText('Wrong bank PIN.');
    await expect(dialog).toBeVisible();
    await expect(ok).toBeEnabled();
    await password.fill('my pass 12');
    await ok.click();
    // the new list: the window has gone and the emptied slot is still selected
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select slot 1, Available' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cs-name')).toHaveText(['Available', 'Available', 'Available']);
    await expect(page.getByRole('button', { name: 'Create in slot 1' })).toBeEnabled();
    const packets = sent.filter((s) => s.type === PacketType.DEL_PLAYER);
    expect(packets).toHaveLength(2);
    expect(bytesToHex(new Uint8Array(packets[1]!.body))).toBe(
      bytesToHex(encodeDeletePlayer('webtester', HASH, deleteKey('my pass 12'), 500, AUTH_KEY, [])),
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
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();

    // V15's Back: the login server forgets the login when its connection closes, so the lobby logs in again for a new
    // server list, showing the login form busy meanwhile, as the game does.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('status')).toHaveText('Logging in…');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Choose a channel' })).toBeVisible();
    await page.getByRole('button', { name: /Channel 4/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();

    const certifies = sent.filter((s) => s.type === PacketType.CERTIFY);
    expect(certifies).toHaveLength(2);
    expect(certifies[1]!.connection).not.toBe(certifies[0]!.connection);
    expect(bytesToHex(new Uint8Array(certifies[1]!.body))).toBe(bytesToHex(encodeCertify('webtester', HASH)));
    // One character list per login, each on its own connection: channel 1, then channel 4.
    const lists = sent.filter((s) => s.type === PacketType.GETPLAYERLIST);
    expect(lists.map((s) => s.body.readUInt32LE(s.body.length - 4))).toEqual([1, 4]);
    expect(lists[1]!.connection).not.toBe(lists[0]!.connection);
  });

  test('Accept hands the selected character over to the world', async ({ page }) => {
    const closed: number[] = [];
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      login: enterable([WEBBY, { slot: 2, name: 'Third', level: 40, playerId: 502 }]),
    }, closed);
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();

    // V15's one Accept follows the selected character.
    const enter = page.getByRole('button', { name: /^Enter/ });
    await expect(enter).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Enter Webby' })).toHaveText('Accept');
    await page.getByRole('button', { name: 'Select Third' }).click();
    await expect(page.getByRole('button', { name: 'Enter Third' })).toHaveText('Accept');
    await expectPhoneFriendly(page);

    // The lobby's screens go and the world screen takes over, with the login-server connection still open: the world
    // session pings it and sends PRE_JOIN on it (world.spec.ts enters the world). Enter is the window's default button.
    await page.keyboard.press('Enter');
    await expect(page.getByText('Entering the world…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Enter/ })).toHaveCount(0);
    const loginConnection = sent.find((s) => s.port === Port.LOGIN)!.connection;
    expect(closed).not.toContain(loginConnection);
    // left before the test ends, so that the page does not close on the world screen while its files still load
    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  // This runs on a test page (e2e/lobbyHarness.html: the lobby as main.ts wires it, with a stand-in world that keeps every
  // `done` the lobby gives), so the `done` of an earlier entry can be called late, which no real world screen would do on purpose.
  test('a done left over from an earlier entry does not touch a later world', async ({ page }) => {
    await playGateway(page, { certifier: listing([FLYFF, OPEN_CHANNEL]), login: enterable([WEBBY]) });
    const callDone = (entry: number, message: string) => page.evaluate(
      ([i, m]) => (globalThis as unknown as { lobbyDones: ((message?: string) => void)[] }).lobbyDones[i!]!(m),
      [entry, message] as const,
    );
    const enterTheWorld = async () => {
      await page.getByRole('button', { name: /Channel 1/ }).click();
      await page.getByRole('button', { name: 'Enter Webby' }).click();
      await expect(page.locator('#world')).toHaveText('In the world as Webby');
    };

    await logIn(page, '/e2e/lobbyHarness.html');
    await enterTheWorld();
    await callDone(0, 'The first world is over.');
    await expect(page.getByRole('alert')).toHaveText('The first world is over.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();

    // Another entry. The first one's done is called again, late: the second world stays, and the page is not touched.
    await page.getByLabel('Password').fill('password1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await enterTheWorld();
    await callDone(0, 'The first world again.');
    await expect(page.locator('#world')).toHaveText('In the world as Webby');
    await expect(page.getByRole('button', { name: 'Log in' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);

    // The second entry's own done brings the lobby back, once: a repeat, or the first one's again, changes nothing.
    await callDone(1, 'The second world is over.');
    await expect(page.getByRole('alert')).toHaveText('The second world is over.');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeEnabled();
    await callDone(1, 'Twice.');
    await callDone(0, 'The first world, a third time.');
    await expect(page.getByRole('alert')).toHaveText('The second world is over.');
    await expect(page.locator('#world')).toHaveCount(0);
  });

  test('stays on the characters when the login server has not given what the world needs', async ({ page }) => {
    const closed: number[] = [];
    const sent = await playGateway(page, {
      certifier: listing([FLYFF, OPEN_CHANNEL]),
      // The characters, but no CACHE_ADDR and no answer to QUERYTICKCOUNT.
      login: ({ type }, reply) => {
        if (type === PacketType.GETPLAYERLIST) reply(playerList([WEBBY]));
      },
    }, closed);
    await logIn(page);
    await page.getByRole('button', { name: /Channel 1/ }).click();
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();
    await page.getByRole('button', { name: 'Enter Webby' }).click();
    await expect(page.getByRole('alert')).toHaveText('Something went wrong. Please try again.');
    await expect(page.getByRole('heading', { name: 'Select Character' })).toBeVisible();
    // Nothing was given up: the login-server connection is open, and the characters can still be used (Accept is on again).
    expect(closed).not.toContain(sent.find((s) => s.port === Port.LOGIN)!.connection);
    await expect(page.getByRole('button', { name: 'Delete Webby' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Enter Webby' })).toBeEnabled();
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

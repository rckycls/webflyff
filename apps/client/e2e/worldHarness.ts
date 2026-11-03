// What the world's browser tests share (world.spec.ts, landscape.spec.ts, and the fights of later tasks), as
// lobbyHarness.ts is the lobby's test page: Flaris on the converted dist/assets, Webby on its square with an Aibatt and
// Julia, the gateway played by scripts (the certifier, the login server, and the cache server with the world server
// behind it, `createWorldScript`), entering the world, tapping it, and reading the packets the page sent.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MAP_SIZE, decodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WorldManifest } from '@flyffweb/formats';
import { ArReader, ArWriter, NULL_ID, PacketType, Port } from '@flyffweb/protocol';
import type { AddedMover, AddedNpc, AddedPlayer, Vec3 } from '@flyffweb/protocol';
import { sampleHeight } from '@flyffweb/scene';
import { createWorldScript, writeAddMonster, writeAddNpc, writeAddPlayer, writeAddSelf } from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import type {} from '../src/testHooks'; // window.__client
import { Belli } from '../src/world/sim/constants';

export const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/assets');

/**
 * A wait on the frame loop (a key, a tap or a move a rules step takes and sends, the camera, what a frame plays or draws,
 * a screenshot): 60 s, since Chromium draws with SwiftShader on the CPU and the other files' worlds drawn beside it starve
 * the frames (ruling R28). The waits on what the page does as a press or a message comes keep the default.
 */
export const ON_FRAMES = { timeout: 60_000 };

/** `WI_WORLD_MADRIGAL` (`Resource/defineWorld.h`): Flaris is in Madrigal. */
export const MADRIGAL = 1;
/** `MI_MALE`, `MI_FEMALE` (`Resource/defineObj.h:954-955`) and the Aibatt (`MI_AIBATT2`, propMover.txt). */
export const MI_MALE = 11;
export const MI_FEMALE = 12;
export const MI_AIBATT = 21;
/** `OBJSTA_STAND` (`MoverMsg.h`), `OBJSTA_FMOVE`, `OBJSTA_MOVE_ALL`. */
export const OBJSTA_STAND = 0x01;
export const OBJSTA_FMOVE = 0x04;
export const OBJSTA_MOVE_ALL = 0xff;
/** `MTI_STAND`, `MTI_RUN` (`Resource/defineNeuz.h`) and `ANILOOP_LOOP` (`_Common/Obj.h:28`). */
export const MTI_STAND = 0;
export const MTI_RUN = 5;
export const ANILOOP_LOOP = 0x04;
/** `OBJSTAF_WALK` (`MoverMsg.h:97`). */
export const OBJSTAF_WALK = 0x02;
/** `OBJMSG_ATK1`, `OBJMSG_DAMAGE` (`MoverMsg.h`, the `OBJMSG` enum from 0), and `DST_HP` (`Resource/defineAttribute.h`). */
export const OBJMSG_ATK1 = 29;
export const OBJMSG_DAMAGE = 41;
export const DST_HP = 38;
/** `MAX_HUMAN_PARTS` (`Resource/defineNeuz.h:62`): the own character's equipment object IDs. */
export const MAX_HUMAN_PARTS = 31;
/** The vagrant's clothes (jobItem.inc): `II_ARM_M_VAG_SUIT01`, `_GAUNTLET01`, `_BOOTS01`, and the women's 504, 508, 512. */
export const MALE_VAGRANT = [502, 506, 510];
export const FEMALE_VAGRANT = [{ part: 2, itemId: 504, flag: 0 }, { part: 4, itemId: 508, flag: 0 }, { part: 5, itemId: 512, flag: 0 }];

/** A file of the converted game files; they must be there (`npm run convert`). */
export function readAsset<T>(file: string): T {
  if (!existsSync(path.join(ASSETS, 'index.json'))) throw new Error(`${ASSETS}/index.json is missing: run \`npm run convert\` first`);
  return JSON.parse(readFileSync(path.join(ASSETS, file), 'utf8')) as T;
}

/** The terrain height at client (D3D) x, z of Madrigal, as `CLandscape::GetHeight` gives it: where a server stands a mover. */
export function groundAt(x: number, z: number): number {
  const index = readAsset<AssetIndex>('index.json');
  const manifest = readAsset<WorldManifest>(index.files['worlds/wdmadrigal/manifest.json']!);
  const side = MAP_SIZE * manifest.mpu;
  const tx = Math.floor(x / side);
  const tz = Math.floor(z / side);
  const file = path.join(ASSETS, manifest.tiles[`${tx}_${tz}`]!);
  const tile = decodeTileBin(new Uint8Array(readFileSync(file)), file);
  return sampleHeight(tile, x - tx * side, z - tz * side, manifest.mpu);
}

/** Flaris' town square, as the viewer's pictures stand there (client 6968, 3328), facing south (angle 0: D3D -z). */
export const SQUARE: Vec3 = [6968, groundAt(6968, 3328), 3328];
/** 6 m ahead of the player (south), 2.5 m to either side, facing it. */
export const MONSTER_AT: Vec3 = [6965.5, groundAt(6965.5, 3322), 3322];
export const NPC_AT: Vec3 = [6970.5, groundAt(6970.5, 3322), 3322];

export const SELF_ID = 9000;
export const MONSTER_ID = 9001;
export const NPC_ID = 9002;

export const BASE = { scale: 1, motion: 0, hitPoint: 100, state: OBJSTA_STAND, stateFlag: 0, belligerence: 0, sfxId: 0 };

/** Webby with no numbers (`own` null), so with STA and DEX 0 on the wire too. */
export const SELF_PLAYER: AddedPlayer = {
  self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0xff907b6d, headMesh: 0, playerId: 500, job: 0,
  sta: 0, dex: 0, level: 15, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1,
  worn: [], equipmentObjectIds: Array.from({ length: MAX_HUMAN_PARTS }, () => NULL_ID), own: null, shopTitle: '',
};
export const NPC_PART: AddedNpc = {
  hairMesh: 0, hairColor: 0, headMesh: 0, characterKey: '', worn: [], activeAttack: 0, movePattern: 0, moveEvent: 0,
  moveEventCount: 0, speedFactor: 1,
};
export const self: AddedMover = { ...BASE, index: MI_MALE, pos: SQUARE, angle: 0, objectId: SELF_ID, isPlayer: true, player: SELF_PLAYER };
export const aibatt: AddedMover = { ...BASE, index: MI_AIBATT, pos: MONSTER_AT, angle: 180, objectId: MONSTER_ID, isPlayer: false, npc: NPC_PART };
export const julia: AddedMover = {
  ...BASE, index: MI_FEMALE, pos: NPC_AT, angle: 180, objectId: NPC_ID, isPlayer: false, belligerence: Belli.PEACEFUL,
  npc: { ...NPC_PART, characterKey: 'MaFl_Juria', hairMesh: 2, hairColor: 0xff8a5a3c, worn: FEMALE_VAGRANT },
};

/** Webby on the square, with the Aibatt and Julia in view. */
export const flaris = createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
  self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, aibatt), writeAddNpc(NPC_ID, julia)],
});

const groundPoint = (x: number, z: number): Vec3 => [x, groundAt(x, z), z];
/** A crowd by the square, in view of Webby (the soak's and the frame-rate check's, Piece 6 M5): six Aibatts in a row ... */
export const CROWD_MONSTERS: AddedMover[] = [9101, 9102, 9103, 9104, 9105, 9106].map((objectId, i) => ({
  ...aibatt, objectId, pos: groundPoint(SQUARE[0] - 6 + 2.5 * i, SQUARE[2] - 6),
}));
/** ... and three vagrant players beside it. */
export const CROWD_PLAYERS: AddedMover[] = [0, 1, 2].map((i) => ({
  ...BASE, index: MI_MALE, pos: groundPoint(SQUARE[0] + 3 + 2 * i, SQUARE[2]), angle: 0, objectId: 9201 + i, isPlayer: true,
  player: {
    ...SELF_PLAYER, self: false, name: `Soaker${i + 1}`, playerId: 601 + i, equipmentObjectIds: [],
    worn: MALE_VAGRANT.map((itemId, part) => ({ part: [2, 4, 5][part]!, itemId, flag: 0 })),
  },
}));

/** Webby on the square with the crowd. */
export function crowdScript(): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, self),
    others: [...CROWD_MONSTERS.map((m) => writeAddMonster(m.objectId, m)), ...CROWD_PLAYERS.map((p) => writeAddPlayer(p.objectId, p))],
  });
}

// The lobby's side, as lobby.spec.ts scripts it: a server list, the clock, the cache address and the characters.
export const AUTH_KEY = 7;

/** A channel of the server list: its id, name, players and whether it is up (of 500 players at most). */
export interface Channel {
  id: number;
  name: string;
  players: number;
  enabled: boolean;
}

/** FlyFF with `channels` (Channel 1 alone unless others are given). */
export function serverList(channels: readonly Channel[] = [{ id: 1, name: 'Channel 1', players: 12, enabled: true }]): Buffer {
  const w = new ArWriter().u32(PacketType.SRVR_LIST).u32(AUTH_KEY).u8(0).string('webtester').u32(1 + channels.length);
  w.u32(NULL_ID).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0);
  for (const c of channels) w.u32(1).u32(c.id).string(c.name).string('').i32(0).i32(c.players).i32(c.enabled ? 1 : 0).i32(500);
  return Buffer.from(w.toBytes());
}

/** An ERROR packet of the certifier or the login server, with its code (`ERROR_*`). */
export const errorPacket = (code: number): Buffer => Buffer.from(new ArWriter().u32(PacketType.ERROR).i32(code).toBytes());

/**
 * What the character list says of Webby that the world reads: its level, and the item IDs it wears, which dress and arm
 * the own character (the lobby's equipment, `OwnState`).
 */
export interface Listed {
  level: number;
  equipment: readonly number[];
}

/** Webby as the world tests list it: level 15, in the vagrant's clothes, with nothing in the hands. */
export const LISTED_WEBBY: Listed = { level: 15, equipment: MALE_VAGRANT };

/** Webby in Madrigal on Flaris' square, dressed as `listed` says (`CDPLoginClient::OnPlayerList`'s order). */
export function playerList(listed: Listed = LISTED_WEBBY): Buffer {
  const w = new ArWriter().u32(PacketType.PLAYER_LIST).u32(AUTH_KEY).i32(1);
  w.i32(0).i32(0).u32(MADRIGAL).u32(MI_MALE).string('Webby').vec3(SQUARE)
    .u32(500).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0xff907b6d).u32(0).u8(0).i32(0).i32(listed.level).u32(0)
    .i32(15).i32(15).i32(15).i32(15).u32(0).i32(listed.equipment.length);
  for (const id of listed.equipment) w.u32(id);
  return Buffer.from(w.i32(0).toBytes());
}

/** A packet the page sent: the port it went to, the connection it came on, its type and its whole body. */
export interface Sent {
  port: number;
  connection: number;
  type: number;
  body: Buffer;
}

export interface Gateway {
  sent: Sent[];
  /** The connections the page closed, by the number they were opened as. */
  closed: number[];
  /** Ends the cache connection the way the gateway does, with a close code. */
  closeCache(code: number): Promise<void>;
  /** Ends the latest login-server connection the same way (Piece 6 M3). */
  closeLogin(code: number): Promise<void>;
  /** Sends a packet to the page on the cache connection, as the world server does between the page's packets. */
  pushCache(packet: Uint8Array): void;
}

export interface GatewayOptions {
  /** The certifier's answer to the page's `n`-th CERTIFY (1, 2, ...): the server list (`serverList()`) unless said. */
  certify?: (n: number) => Uint8Array;
  /** Webby's level and equipment in the character list: `LISTED_WEBBY` unless said. */
  listed?: Listed;
}

/**
 * Plays the gateway and the four servers behind it: the certifier, the login server and the cache server with Flaris
 * (`world`: Webby on the square, with the Aibatt and Julia, unless another script is given).
 */
export async function playGateway(
  page: Page, world: WorldScript | ((entry: number) => WorldScript) = flaris, options: GatewayOptions = {},
): Promise<Gateway> {
  // a script per entry (the n-th login connection's and its cache connection's), so a reconnect gets a fresh world
  let entries = 0;
  let script = typeof world === 'function' ? world(1) : world;
  const gateway: Gateway = {
    sent: [], closed: [], closeCache: async () => {}, closeLogin: async () => {}, pushCache: () => {
      throw new Error('no cache connection yet');
    },
  };
  let connections = 0;
  let certifies = 0;
  await page.routeWebSocket(/\/connect\//, (ws) => {
    const port = Number(new URL(ws.url()).pathname.split(':').pop());
    const connection = ++connections;
    if (port === Port.CACHE) {
      gateway.closeCache = (code) => ws.close({ code });
      gateway.pushCache = (packet) => ws.send(Buffer.from(packet));
    }
    if (port === Port.LOGIN) {
      entries++;
      if (typeof world === 'function') script = world(entries);
      gateway.closeLogin = (code) => ws.close({ code });
    }
    ws.onClose(() => gateway.closed.push(connection));
    ws.onMessage((message) => {
      const body = Buffer.from(message as Buffer);
      // Packets to the certifier start with the type; to the login and cache servers with DPID_UNKNOWN.
      const type = body.readUInt32LE(port === Port.CERTIFIER ? 0 : 4);
      gateway.sent.push({ port, connection, type, body });
      const reply = (packet: Uint8Array) => ws.send(Buffer.from(packet));
      if (port === Port.CERTIFIER) {
        if (type === PacketType.CERTIFY) reply(options.certify?.(++certifies) ?? serverList());
      } else if (port === Port.LOGIN) {
        if (type === PacketType.QUERYTICKCOUNT) {
          reply(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(body.readUInt32LE(8)).i64(123456789n).toBytes());
        }
        if (type === PacketType.GETPLAYERLIST) {
          reply(new ArWriter().u32(PacketType.CACHE_ADDR).string('172.31.238.55').toBytes());
          reply(playerList(options.listed));
        }
        script.answer('login', body).forEach(reply);
      } else {
        script.answer('cache', body).forEach(reply);
      }
    });
  });
  return gateway;
}

/** Fills in the login form and taps Log in. */
export async function logIn(page: Page): Promise<void> {
  await page.getByLabel('Account').fill('webtester');
  await page.getByLabel('Password').fill('password1');
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** Logs in, picks Channel 1 and taps Enter on Webby. */
export async function tapEnter(page: Page): Promise<void> {
  await page.goto('/');
  await logIn(page);
  await page.getByRole('button', { name: /Channel 1/ }).click();
  await page.getByRole('button', { name: 'Enter Webby' }).click();
}

/** Logs in, picks Channel 1 and taps Enter on Webby; resolves on the loading screen. */
export async function startEntering(page: Page): Promise<void> {
  await tapEnter(page);
  await expect(page.getByText('Entering the world…')).toBeVisible();
}

/** Logs in, picks Channel 1 and enters with Webby; resolves once the world is on screen, with its task bar. */
export async function enterFlaris(page: Page): Promise<void> {
  await startEntering(page);
  await page.evaluate(() => window.__client!.ready());
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
}

/**
 * Leaves the world as Piece 4's player does: the task bar's Start button, the menu's Log out, and OK in the box that asks
 * first (CWndLogOut, spec §3.9).
 */
export async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page.getByText('Do you want to disconnect?')).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
}

/** The packets of `type` the page sent on the cache connection so far. */
export const sentOf = (gateway: Gateway, type: number): Sent[] =>
  gateway.sent.filter((s) => s.port === Port.CACHE && s.type === type);

/** The PLAYERMOVED packets the page sent so far. */
export const movesOf = (gateway: Gateway): Sent[] => sentOf(gateway, PacketType.PLAYERMOVED);

/**
 * The client SNAPSHOTs the page sent so far, as `CDPClient::SendSnapshot` writes one with a DESTPOS: after DPID_UNKNOWN
 * and the type, the count (1), the message type, the position and the forward flag.
 */
export function destPosOf(gateway: Gateway): { count: number; type: number; pos: Vec3; forward: number }[] {
  return sentOf(gateway, PacketType.SNAPSHOT).map(({ body }) => {
    const r = new ArReader(new Uint8Array(body));
    r.u32();
    r.u32();
    return { count: r.u8(), type: r.u16(), pos: r.vec3(), forward: r.u8() };
  });
}

/** The SETTARGETs the page sent so far (`CDPClient::SendSetTarget`): after DPID_UNKNOWN and the type, the target and `bClear`. */
export const targetsOf = (gateway: Gateway): Array<[number, number]> =>
  sentOf(gateway, PacketType.SETTARGET).map(({ body }) => [body.readUInt32LE(8), body.readUInt8(12)]);

/**
 * The state in a PLAYERMOVED (`CDPClient::SendPlayerMoved`) or a PLAYERCORR (`SendPlayerCorr`, the same fields): after
 * DPID_UNKNOWN, the type, the position, the delta and the angle.
 */
export const movedState = (moved: Sent): number => moved.body.readUInt32LE(4 + 4 + 12 + 12 + 4);
/** The state flag in a PLAYERMOVED or a PLAYERBEHAVIOR, after the state. */
export const movedStateFlag = (moved: Sent): number => moved.body.readUInt32LE(4 + 4 + 12 + 12 + 4 + 4);

/** Where the rules have Webby (D3D). */
export async function ownAt(page: Page): Promise<Vec3> {
  return (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === SELF_ID)!.pos;
}

/** The HP of the mover `objectId` in view (`m_nHitPoint`), or undefined. */
export async function hpOf(page: Page, objectId: number): Promise<number | undefined> {
  return (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId)?.hp;
}

export const distanceXZ = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Taps the world's drawing at `x`, `y` (shares of its width and height): with a finger in the phone project (a Pixel 7,
 * touch pointer events), with the mouse on the desktop.
 */
export async function tapWorld(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.world-view canvas').boundingBox())!;
  const at = { x: box.x + box.width * x, y: box.y + box.height * y };
  if (test.info().project.use.hasTouch === true) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

/** Taps the mover `objectId` where it is drawn (`screenOf`: the middle of its box). */
export async function tapMover(page: Page, objectId: number): Promise<void> {
  const at = await page.evaluate((id) => window.__client!.screenOf(id), objectId);
  expect(at).not.toBeNull();
  await tapWorld(page, at![0], at![1]);
}

/** The texts the HUD adds as lines (`.hud-messages`, CClientMsg) and captions (`.hud-caption`, CCaption). */
export interface HudTexts {
  lines: string[];
  captions: string[];
}
type WithHudTexts = typeof globalThis & { hudTexts?: HudTexts };

/**
 * Keeps, from now on, the text of each line and caption as the HUD adds it (`hudTexts`). Both fade by the clock (a line
 * 3 s after the last one came, `hud/messages.ts`; a caption after its 5 s hold), not by the rules, so a check of the DOM
 * made later can find them gone; this one cannot.
 */
export async function recordHudTexts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const texts: HudTexts = { lines: [], captions: [] };
    (globalThis as WithHudTexts).hudTexts = texts;
    const watch = (selector: string, into: string[]): void => {
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) into.push(node.textContent ?? '');
      }).observe(document.querySelector(selector)!, { childList: true });
    };
    watch('.hud-messages', texts.lines);
    watch('.hud-caption', texts.captions);
  });
}

/** The lines and captions `recordHudTexts` kept since it was called, in the order the HUD added them; undefined before. */
export const hudTexts = (page: Page): Promise<HudTexts | undefined> =>
  page.evaluate(() => (globalThis as WithHudTexts).hudTexts);

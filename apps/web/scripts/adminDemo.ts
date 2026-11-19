// `npm run admin:demo`: the admin panel on http://127.0.0.1:8099 with made-up accounts and characters kept in memory,
// no SQL Server and no game servers. For trying the page and for the browser check (apps/web/e2e/admin.spec.ts).
//
//   --port 8099      the port
//   --running        act as if every game server runs (character edits locked); by default they are all stopped
//   --assets <dir>   a converted assets folder for the item list (default: the test fixture's five items)
//   --site-port 8098 also serve the site's Support / VIP API there (players tester1 / demo-password-1 and
//                    tester2 / demo-password-2), on the same VIP rows as the panel's VIP tab. Then run the client with
//                    WEB_API=http://127.0.0.1:8098 and open /vip/ (see apps/web/README.md, Support / VIP)
//   --site-origin    the site's address the API takes POSTs from (default http://localhost:5174)
//
// Log in as Poreotix / demo-password-1 with the code it prints (it changes every 30 seconds).

import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hashPassword, PREREG_OFF } from '@flyffweb/protocol';
import { ADMIN_ACTIONS } from '../src/admin/actions';
import { createAdminServer } from '../src/admin/adminServer';
import { loadItemCatalog } from '../src/admin/itemCatalog';
import { LoginGuard } from '../src/admin/loginGuard';
import { PageCache } from '../src/admin/pageCache';
import { hashAdminPassword } from '../src/admin/password';
import { SessionBook } from '../src/admin/sessions';
import { totpCode, totpStep } from '../src/admin/totp';
import { HourlyLimit } from '../src/hourlyLimit';
import { deliverOne } from '../src/codes/codeDelivery';
import { newKey } from '../src/codes/codeKeys';
import { CODE_FAILS_PER_ADDRESS_HOUR, CODE_FAILS_PER_HOUR, CODE_REDEEMS_PER_HOUR, codeRoutes } from '../src/codes/siteCodes';
import { RefusalLog } from '../src/refusalLog';
import { createWebServer } from '../src/server';
import { SiegeCache } from '../src/siege';
import { SignUpBook } from '../src/signUpBook';
import { StatusCache } from '../src/status';
import { TicketBook } from '../src/ticket';
import { siteVipRoutes } from '../src/vip/siteVip';
import { LOGIN_FAILS_PER_HOUR, LOGINS_PER_HOUR, PLAYER_SESSION_IDLE_MS, PLAYER_SESSION_MAX_MS, REQUESTS_PER_HOUR } from '../src/vip/startVip';
import { VipFiles } from '../src/vip/vipFiles';
import { testConfig } from '../test/support/adminDeps';
import { MemoryAdminStore, memoryAccount, memoryCharacter } from '../test/support/memoryAdminStore';
import { MemoryCodeStore } from '../test/support/memoryCodeStore';
import { MemoryVipStore, siteView } from '../test/support/memoryVipStore';
import { PNG_BASE64 } from '../test/support/vipPictures';
import { DEMO_PASSWORD, DEMO_SECRET, DEMO_USER } from './adminDemoLogin';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8099' }, running: { type: 'boolean', default: false }, assets: { type: 'string' },
    'site-port': { type: 'string' }, 'site-origin': { type: 'string', default: 'http://localhost:5174' },
  },
});
const port = Number(values.port);
const origin = `http://127.0.0.1:${port}`;
const assets = values.assets ?? fileURLToPath(new URL('../test/fixtures/assets', import.meta.url));

const now = () => Date.now();
// 2026-11-17: 30 more players, so that the lists have pages (VIP 1-4 and a GM among them). Their names start with
// "player" and "Walker", which no e2e search for Poreotix, tester, Alt or Hero also finds.
const VIP_LETTERS = ['A', 'B', 'C', 'E'];
const players = Array.from({ length: 30 }, (_, i) => `player${String(i + 1).padStart(2, '0')}`);
const store = new MemoryAdminStore({
  accounts: [
    memoryAccount('Poreotix', { email: 'owner@example.com', authority: 'P' }),
    memoryAccount('tester1', { email: '<img src=x onerror=alert(1)>' }),
    memoryAccount('tester2'),
    ...players.map((name, i) => memoryAccount(name, { email: `${name}@example.com`, authority: i % 7 === 3 ? VIP_LETTERS[(i / 7) | 0]! : i === 12 ? 'L' : 'F' })),
  ],
  characters: [
    memoryCharacter('0000001', 'Hero', 'Poreotix', { level: 60, gold: 1_500_000 }),
    memoryCharacter('0000002', 'Alt', 'tester1', { slot: 0 }),
    memoryCharacter('0000003', 'Busy', 'tester2', { online: true, level: 33 }),
    ...players.map((name, i) => memoryCharacter(String(i + 10).padStart(7, '0'), `Walker${String(i + 1).padStart(2, '0')}`, name, {
      level: 1 + ((i * 7) % 120), job: i % 9, online: i % 5 === 0, authority: i === 20 ? 'B' : 'F',
    })),
  ],
}, now);

// Support / VIP: two requests waiting (tester1's with a reference that holds markup, to show it stays text), one QR
const vipStore = new MemoryVipStore([
  { account: 'tester1', passwordHash: hashPassword('demo-password-1') },
  { account: 'tester2', passwordHash: hashPassword('demo-password-2') },
  // the browser check's players (apps/web/e2e/vip.spec.ts), so that its runs stay under each account's limits
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ account: `e2e${n}`, passwordHash: hashPassword('demo-password-e2e') })),
], now);
const vipFiles = new VipFiles(mkdtempSync(path.join(os.tmpdir(), 'flyffweb-admin-demo-vip-')));
const picture = Buffer.from(PNG_BASE64, 'base64');
for (const [account, level, reference, currency] of [['tester1', 2, 'GC-1001-2002', 'PHP'], ['tester2', 4, 'MAYA 7788 9900', 'USD']] as const) {
  await vipStore.addRequest({
    account, level, currency, reference, referenceKey: reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    receiptFile: await vipFiles.save('receipts', picture, 'png'), address: '203.0.113.5', maxPending: 3,
  });
}
await vipStore.addQr({ label: 'GCash', accountName: 'R. C.', note: 'Send the exact amount.', imageFile: await vipFiles.save('qr', picture, 'png'), on: true, order: 1 });

// 2026-11-20 (redeem codes): an everyone VIP 2 code with an item, and a batch of 3 one-use item codes
const codeStore = new MemoryCodeStore(vipStore, [
  { account: 'tester1', idPlayer: '0000002', name: 'Alt' }, { account: 'tester2', idPlayer: '0000003', name: 'Busy' },
], now);
const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();
await codeStore.add({
  label: 'Discord launch', kind: 'E', vipLevel: 2, vipDays: 7, maxUses: 100, expiresAt: inAWeek, items: [{ itemId: 21, count: 1 }],
  keys: ['WELCOME2026'], accounts: [], admin: 'Poreotix',
});
await codeStore.add({
  label: 'Stream winners', kind: 'K', vipLevel: 0, vipDays: 0, maxUses: null, expiresAt: inAWeek, items: [{ itemId: 21, count: 1 }],
  keys: [newKey(), newKey(), newKey()], accounts: [], admin: 'Poreotix',
});

const log = { info: (line: string) => console.log(line), warn: (line: string) => console.warn(line) };
const config = { ...testConfig, admin: { ...testConfig.admin, origin, listen: { host: '127.0.0.1', port } } };
const server = createAdminServer({
  config,
  credentials: { user: DEMO_USER, passwordHash: hashAdminPassword(DEMO_PASSWORD), totpSecret: DEMO_SECRET },
  store,
  sessions: new SessionBook(now, 30 * 60_000, 12 * 3_600_000),
  guard: new LoginGuard(now),
  log,
  now,
  probe: async () => (values.running === true ? 'open' : 'closed'),
  catalog: loadItemCatalog(assets, (line) => console.warn(line)),
  actions: ADMIN_ACTIONS,
  pages: new PageCache(now),
  vip: { store: vipStore, files: vipFiles, codes: codeStore },
});

server.listen(port, '127.0.0.1', () => {
  const at = (server.address() as AddressInfo).port;
  console.log(`admin demo on http://127.0.0.1:${at} — log in as ${DEMO_USER} / ${DEMO_PASSWORD}`);
  const show = () => console.log(`code now: ${totpCode(DEMO_SECRET, totpStep(Date.now()))}`);
  show();
  setInterval(show, 30_000);
});

if (values['site-port'] !== undefined) {
  const siteConfig = { ...testConfig, siteOrigin: values['site-origin']! };
  const accounts = {
    create: async () => 1, onlineCount: async () => 0, siegeRanking: async () => [],
    siegeWeekly: async () => ({ champion: null, mvp: null, endedAt: null, expiresAt: null }),
  };
  const site = createWebServer({
    config: siteConfig, store: accounts, log, refusals: new RefusalLog(log),
    tickets: new TicketBook(siteConfig.ticketSecret, now), attempts: new HourlyLimit(20, now), createdByAddress: new HourlyLimit(3, now),
    createdInAll: new HourlyLimit(60, now), ticketsByAddress: new HourlyLimit(60, now), siege: new SiegeCache(accounts, now),
    status: new StatusCache(async () => ({ online: true, players: 0, checkedAt: new Date().toISOString() }), now),
    signUps: new SignUpBook(undefined, log), prereg: () => PREREG_OFF,
    vip: siteVipRoutes({
      config: siteConfig, vip: { uploadsDir: '', maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 }, store: siteView(vipStore), files: vipFiles, log,
      sessions: new SessionBook(now, PLAYER_SESSION_IDLE_MS, PLAYER_SESSION_MAX_MS),
      loginFailsByAddress: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now), loginFailsByAccount: new HourlyLimit(LOGIN_FAILS_PER_HOUR, now),
      loginsByAccount: new HourlyLimit(LOGINS_PER_HOUR, now),
      requestsByAccount: new HourlyLimit(REQUESTS_PER_HOUR, now),
      // 2026-11-20 (redeem codes): the game's Redeem Code window, on the same codes as the panel's Codes view
      codes: codeRoutes({
        store: codeStore, log, failsByAccount: new HourlyLimit(CODE_FAILS_PER_HOUR, now),
        failsByAddress: new HourlyLimit(CODE_FAILS_PER_ADDRESS_HOUR, now), redeemsByAccount: new HourlyLimit(CODE_REDEEMS_PER_HOUR, now),
        deliver: (useId) => deliverOne({ admin: codeStore, mail: codeStore }, log, useId),
      }),
    }),
  });
  site.listen(Number(values['site-port']), '127.0.0.1', () => {
    console.log(`site Support / VIP API on http://127.0.0.1:${(site.address() as AddressInfo).port} for ${siteConfig.siteOrigin} — players tester1 / demo-password-1, tester2 / demo-password-2`);
  });
}

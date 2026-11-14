// `npm run admin:demo`: the admin panel on http://127.0.0.1:8099 with made-up accounts and characters kept in memory,
// no SQL Server and no game servers. For trying the page and for the browser check (apps/web/e2e/admin.spec.ts).
//
//   --port 8099      the port
//   --running        act as if every game server runs (character edits locked); by default they are all stopped
//   --assets <dir>   a converted assets folder for the item list (default: the test fixture's five items)
//
// Log in as Poreotix / demo-password-1 with the code it prints (it changes every 30 seconds).

import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ADMIN_ACTIONS } from '../src/admin/actions';
import { createAdminServer } from '../src/admin/adminServer';
import { loadItemCatalog } from '../src/admin/itemCatalog';
import { LoginGuard } from '../src/admin/loginGuard';
import { hashAdminPassword } from '../src/admin/password';
import { SessionBook } from '../src/admin/sessions';
import { totpCode, totpStep } from '../src/admin/totp';
import { testConfig } from '../test/support/adminDeps';
import { MemoryAdminStore, memoryAccount, memoryCharacter } from '../test/support/memoryAdminStore';
import { DEMO_PASSWORD, DEMO_SECRET, DEMO_USER } from './adminDemoLogin';

const { values } = parseArgs({ options: { port: { type: 'string', default: '8099' }, running: { type: 'boolean', default: false }, assets: { type: 'string' } } });
const port = Number(values.port);
const origin = `http://127.0.0.1:${port}`;
const assets = values.assets ?? fileURLToPath(new URL('../test/fixtures/assets', import.meta.url));

const now = () => Date.now();
const store = new MemoryAdminStore({
  accounts: [
    memoryAccount('Poreotix', { email: 'owner@example.com', authority: 'P' }),
    memoryAccount('tester1', { email: '<img src=x onerror=alert(1)>' }),
    memoryAccount('tester2'),
  ],
  characters: [
    memoryCharacter('0000001', 'Hero', 'Poreotix', { level: 60, gold: 1_500_000 }),
    memoryCharacter('0000002', 'Alt', 'tester1', { slot: 0 }),
    memoryCharacter('0000003', 'Busy', 'tester2', { online: true, level: 33 }),
  ],
}, now);

const config = { ...testConfig, admin: { ...testConfig.admin, origin, listen: { host: '127.0.0.1', port } } };
const server = createAdminServer({
  config,
  credentials: { user: DEMO_USER, passwordHash: hashAdminPassword(DEMO_PASSWORD), totpSecret: DEMO_SECRET },
  store,
  sessions: new SessionBook(now, 30 * 60_000, 12 * 3_600_000),
  guard: new LoginGuard(now),
  log: { info: (line) => console.log(line), warn: (line) => console.warn(line) },
  now,
  probe: async () => (values.running === true ? 'open' : 'closed'),
  catalog: loadItemCatalog(assets, (line) => console.warn(line)),
  actions: ADMIN_ACTIONS,
});

server.listen(port, '127.0.0.1', () => {
  const at = (server.address() as AddressInfo).port;
  console.log(`admin demo on http://127.0.0.1:${at} — log in as ${DEMO_USER} / ${DEMO_PASSWORD}`);
  const show = () => console.log(`code now: ${totpCode(DEMO_SECRET, totpStep(Date.now()))}`);
  show();
  setInterval(show, 30_000);
});

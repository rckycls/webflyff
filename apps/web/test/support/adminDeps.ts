// AdminDeps for the tests: the example settings with an admin section, a known login (password + the RFC 6238 key),
// a settable clock, the memory store, and a probe that answers from a set of open ports.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AdminConfig } from '../../src/admin/config';
import type { AdminCredentials } from '../../src/admin/credentials';
import type { CatalogItem } from '../../src/admin/itemCatalog';
import { LoginGuard } from '../../src/admin/loginGuard';
import { PageCache } from '../../src/admin/pageCache';
import { hashAdminPassword } from '../../src/admin/password';
import { SessionBook } from '../../src/admin/sessions';
import type { AdminSession } from '../../src/admin/sessions';
import { totpCode, totpStep } from '../../src/admin/totp';
import type { ActionHandler, AdminContext, AdminDeps } from '../../src/admin/adminServer';
import { parseWebConfig } from '../../src/config';
import type { WebConfig } from '../../src/config';
import { MemoryAdminStore } from './memoryAdminStore';

export const TEST_PASSWORD = 'a long password!';
/** base32 of "12345678901234567890", RFC 6238's key. */
export const TEST_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const PASSWORD_HASH = hashAdminPassword(TEST_PASSWORD);

const example = JSON.parse(readFileSync(fileURLToPath(new URL('../../web.config.example.json', import.meta.url)), 'utf8'));
export const testConfig = parseWebConfig({ ...example, ticketSecret: 'k'.repeat(40) }) as WebConfig & { admin: AdminConfig };

/** Every port of the 7 game servers and the gateway: "everything is running". */
export function allPorts(config: AdminConfig = testConfig.admin): Set<number> {
  return new Set([...config.servers.flatMap((s) => s.ports), config.gateway.port]);
}

export interface TestDeps extends AdminDeps {
  store: MemoryAdminStore;
  openPorts: Set<number>;
  lines: string[];
  setNow(ms: number): void;
  code(offsetSteps?: number): string;
}

/** `openPorts` answer, `unknownPorts` give no clear answer (a timeout), every other port refuses. */
export function testDeps(options: {
  store?: MemoryAdminStore; actions?: Record<string, ActionHandler>; catalog?: CatalogItem[]; openPorts?: Set<number>; unknownPorts?: Set<number>;
} = {}): TestDeps {
  let now = 1_763_000_000_000;
  const clock = () => now;
  const credentials: AdminCredentials = { user: 'Poreotix', passwordHash: PASSWORD_HASH, totpSecret: TEST_SECRET };
  const lines: string[] = [];
  const openPorts = options.openPorts ?? allPorts();
  return {
    config: testConfig,
    credentials,
    store: options.store ?? new MemoryAdminStore({}, clock),
    sessions: new SessionBook(clock, testConfig.admin.sessionIdleMinutes * 60_000, testConfig.admin.sessionMaxHours * 3_600_000),
    guard: new LoginGuard(clock),
    log: { info: (line) => lines.push(line), warn: (line) => lines.push(line) },
    now: clock,
    probe: async (_host, port) => (options.unknownPorts?.has(port) ? 'unknown' : openPorts.has(port) ? 'open' : 'closed'),
    catalog: options.catalog ?? [],
    actions: options.actions ?? {},
    pages: new PageCache(clock),
    openPorts,
    lines,
    setNow: (ms) => { now = ms; },
    code: (offsetSteps = 0) => totpCode(TEST_SECRET, totpStep(now) + offsetSteps),
  };
}

/** A logged-in context, for calling action handlers directly. */
export function testContext(deps: AdminDeps, address = '198.51.100.7'): AdminContext {
  const session: AdminSession = deps.sessions.create(deps.credentials.user);
  return { session, address };
}

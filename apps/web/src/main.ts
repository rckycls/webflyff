import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { parseArgs } from 'node:util';
import { ADMIN_ACTIONS } from './admin/actions';
import { loadItemCatalog } from './admin/itemCatalog';
import { sqlAdminStore } from './admin/sqlAdminStore';
import { startAdmin } from './admin/startAdmin';
import { parseWebConfig, type WebConfig } from './config';
import { HourlyLimit } from './hourlyLimit';
import { consoleLogger } from './log';
import { RefusalLog } from './refusalLog';
import { createWebServer } from './server';
import { SiegeCache } from './siege';
import { PreregSettings, SignUpBook } from './signUpBook';
import { sqlAccountStore } from './sqlAccountStore';
import { loadStatus, StatusCache } from './status';
import { TicketBook } from './ticket';

const USAGE = [
  'Usage: npm run web',
  '       tsx apps/web/src/main.ts --config <path to a web.config.json> [--env <.env>] [--signups <signups.jsonl>]',
  '',
  'Needs a web.config.json, which stays out of git and out of the served folders: copy web.config.example.json and set',
  'the site origin, the SQL login and the ticket secret (apps/web/README.md). Exit code: 0 stopped, 1 could not start,',
  '2 bad command line.',
  '--env: the pre-registration settings (apps/gateway/.env.example). --signups: where every account made is kept, one',
  'line each (time, account, IP, browser), for the pre-registration cap and the VIP list (docs/2026-11-15-prereg-login.md).',
].join('\n');

function fail(message: string, exitCode: number): never {
  console.error(message);
  process.exit(exitCode);
}

let configPath: string | undefined;
let envPath: string | undefined;
let signUpsPath: string | undefined;
try {
  ({ config: configPath, env: envPath, signups: signUpsPath } = parseArgs({
    options: { config: { type: 'string' }, env: { type: 'string' }, signups: { type: 'string' } },
  }).values);
} catch (error) {
  fail(`${(error as Error).message}\n\n${USAGE}`, 2);
}
if (configPath === undefined) fail(USAGE, 2);

let config: WebConfig;
try {
  config = parseWebConfig(JSON.parse(readFileSync(configPath, 'utf8')));
} catch (error) {
  fail(`web: cannot use ${configPath}: ${(error as Error).message}`, 1);
}

let signUps: SignUpBook;
try {
  signUps = SignUpBook.open(signUpsPath, consoleLogger);
} catch (error) {
  fail(`web: cannot read ${signUpsPath}: ${(error as Error).message}`, 1);
}
const prereg = new PreregSettings(envPath, consoleLogger);
prereg.rule(); // its state in the log from the start

const clock = () => Date.now();
const store = sqlAccountStore(config.sql);
const server = createWebServer({
  config,
  store,
  log: consoleLogger,
  refusals: new RefusalLog(consoleLogger),
  tickets: new TicketBook(config.ticketSecret, clock),
  attempts: new HourlyLimit(config.limits.attemptsPerHour, clock),
  createdByAddress: new HourlyLimit(config.limits.createdPerHourPerAddress, clock),
  createdInAll: new HourlyLimit(config.limits.createdPerHour, clock),
  ticketsByAddress: new HourlyLimit(config.limits.ticketsPerHourPerAddress, clock),
  signUps,
  prereg: () => prereg.rule(),
  status: new StatusCache(() => loadStatus(config, store), clock),
  siege: new SiegeCache(store, clock),
});

server.once('error', (error: Error) => fail(`web: cannot listen on ${config.listen.host}:${config.listen.port}: ${error.message}`, 1));
server.listen(config.listen.port, config.listen.host, () => {
  consoleLogger.info(`listening ${config.listen.host}:${config.listen.port}`);
});

// The admin panel on its own port, when web.config.json has a good admin section. It never stops the site: any problem
// only writes "admin: panel off: ..." (admin/startAdmin.ts).
let adminStore: ReturnType<typeof sqlAdminStore> | undefined;
let adminServer: Server | undefined;
void startAdmin(config, consoleLogger, () => {
  adminStore = sqlAdminStore(config.sql, config.admin!.sql);
  return adminStore;
}, config.admin === undefined ? [] : loadItemCatalog(config.admin.assetsDir, (line) => consoleLogger.warn(line)), ADMIN_ACTIONS)
  .then((started) => { adminServer = started; });

const stop = (): void => {
  server.close();
  server.closeAllConnections();
  adminServer?.close();
  adminServer?.closeAllConnections();
  void Promise.all([store.close(), adminStore?.close()]).finally(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

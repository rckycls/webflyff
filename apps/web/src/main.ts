import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseWebConfig, type WebConfig } from './config';
import { HourlyLimit } from './hourlyLimit';
import { consoleLogger } from './log';
import { createWebServer } from './server';
import { sqlAccountStore } from './sqlAccountStore';
import { loadStatus, StatusCache } from './status';
import { TicketBook } from './ticket';

const USAGE = [
  'Usage: npm run web',
  '       tsx apps/web/src/main.ts --config <path to a web.config.json>',
  '',
  'Needs a web.config.json, which stays out of git and out of the served folders: copy web.config.example.json and set',
  'the site origin, the SQL login and the ticket secret (apps/web/README.md). Exit code: 0 stopped, 1 could not start,',
  '2 bad command line.',
].join('\n');

function fail(message: string, exitCode: number): never {
  console.error(message);
  process.exit(exitCode);
}

let configPath: string | undefined;
try {
  configPath = parseArgs({ options: { config: { type: 'string' } } }).values.config;
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

const clock = () => Date.now();
const store = sqlAccountStore(config.sql);
const server = createWebServer({
  config,
  store,
  log: consoleLogger,
  tickets: new TicketBook(config.ticketSecret, clock),
  attempts: new HourlyLimit(config.limits.attemptsPerHour, clock),
  createdByAddress: new HourlyLimit(config.limits.createdPerHourPerAddress, clock),
  createdInAll: new HourlyLimit(config.limits.createdPerHour, clock),
  ticketsByAddress: new HourlyLimit(config.limits.ticketsPerHourPerAddress, clock),
  status: new StatusCache(() => loadStatus(config, store), clock),
});

server.once('error', (error: Error) => fail(`web: cannot listen on ${config.listen.host}:${config.listen.port}: ${error.message}`, 1));
server.listen(config.listen.port, config.listen.host, () => {
  consoleLogger.info(`listening ${config.listen.host}:${config.listen.port}`);
});

const stop = (): void => {
  server.close();
  server.closeAllConnections();
  void store.close().finally(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

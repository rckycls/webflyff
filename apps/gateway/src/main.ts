import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseConfig, type GatewayConfig } from './config';
import { consoleLogger } from './log';
import { PreregLock } from './prereg';
import { startGateway } from './server';

const USAGE = [
  'Usage: npm run gateway',
  '       tsx apps/gateway/src/main.ts --config <path to a gateway.config.json> [--env <path to a .env>]',
  '',
  'Needs apps/gateway/gateway.config.json, which stays out of git: copy gateway.config.example.json there',
  'and set the allowed origins and routes. Exit code: 0 stopped, 1 could not start, 2 bad command line.',
  '--env names the pre-registration lock\'s file (apps/gateway/.env.example shows it); no such file: the lock is off.',
].join('\n');

function fail(message: string, exitCode: number): never {
  console.error(message);
  process.exit(exitCode);
}

let configPath: string | undefined;
let envPath: string | undefined;
try {
  ({ config: configPath, env: envPath } = parseArgs({ options: { config: { type: 'string' }, env: { type: 'string' } } }).values);
} catch (error) {
  fail(`${(error as Error).message}\n\n${USAGE}`, 2);
}
if (configPath === undefined) fail(USAGE, 2);

let config: GatewayConfig;
try {
  config = parseConfig(JSON.parse(readFileSync(configPath, 'utf8')));
} catch (error) {
  fail(`gateway: cannot use ${configPath}: ${(error as Error).message}`, 1);
}

// The pre-registration lock (docs/2026-11-15-prereg-login.md): read now and again whenever the file changes
const lock = envPath === undefined ? undefined : new PreregLock(envPath, consoleLogger);
if (lock === undefined) consoleLogger.info('prereg: off, everyone may log in (no --env file given)');

const gateway = await startGateway(config, consoleLogger, lock === undefined ? {} : { allowAccount: (account) => lock.allows(account) })
  .catch((error: Error) => fail(`gateway: cannot listen on ${config.listen.host}:${config.listen.port}: ${error.message}`, 1));
console.log(`gateway listening on ws://${config.listen.host}:${gateway.port}`);

const stop = (): void => {
  lock?.close();
  void gateway.close().then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

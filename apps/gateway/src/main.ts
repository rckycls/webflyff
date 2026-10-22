import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseConfig, type GatewayConfig } from './config';
import { startGateway } from './server';

const USAGE = [
  'Usage: npm run gateway',
  '       tsx apps/gateway/src/main.ts --config <path to a gateway.config.json>',
  '',
  'Needs apps/gateway/gateway.config.json, which stays out of git: copy gateway.config.example.json there',
  'and set the allowed origins and routes. Exit code: 0 stopped, 1 could not start, 2 bad command line.',
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

let config: GatewayConfig;
try {
  config = parseConfig(JSON.parse(readFileSync(configPath, 'utf8')));
} catch (error) {
  fail(`gateway: cannot use ${configPath}: ${(error as Error).message}`, 1);
}

const gateway = await startGateway(config).catch((error: Error) =>
  fail(`gateway: cannot listen on ${config.listen.host}:${config.listen.port}: ${error.message}`, 1),
);
console.log(`gateway listening on ws://${config.listen.host}:${gateway.port}`);

const stop = (): void => {
  void gateway.close().then(() => process.exit(0));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

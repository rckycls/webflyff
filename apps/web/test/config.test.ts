import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RESERVED_NAMES } from '@flyffweb/protocol';
import { expect, it } from 'vitest';
import { DEFAULT_WEB_LIMITS, parseWebConfig } from '../src/config';

const examplePath = fileURLToPath(new URL('../web.config.example.json', import.meta.url));
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const example = readJson(examplePath);

/** A copy of `json` with the dotted `key` set to `value`. */
function withValue(json: Record<string, unknown>, key: string, value: unknown): Record<string, unknown> {
  const copy = structuredClone(json);
  const parts = key.split('.');
  let at: Record<string, unknown> = copy;
  for (const part of parts.slice(0, -1)) at = at[part] as Record<string, unknown>;
  at[parts.at(-1)!] = value;
  return copy;
}

it('reads the example file', () => {
  const config = parseWebConfig(example);
  expect(config.listen).toEqual({ host: '127.0.0.1', port: 8091 });
  expect(config.trustedProxies).toEqual(['127.0.0.1']);
  expect(config.servers.certifier.port).toBeGreaterThan(0);
});

it('fills the default limits and reserved names', () => {
  const config = parseWebConfig(example);
  expect(DEFAULT_WEB_LIMITS).toEqual({ attemptsPerHour: 20, createdPerHourPerAddress: 3, createdPerHour: 60, ticketsPerHourPerAddress: 60 });
  expect(config.limits).toEqual(DEFAULT_WEB_LIMITS);
  expect(config.reservedNames).toEqual(DEFAULT_RESERVED_NAMES);
});

it('takes limits and reserved names from the file', () => {
  const json = { ...example, limits: { createdPerHour: 10 }, reservedNames: { exact: ['Boss'], prefixes: ['mod'] } };
  const config = parseWebConfig(json);
  expect(config.limits).toEqual({ ...DEFAULT_WEB_LIMITS, createdPerHour: 10 });
  expect(config.reservedNames).toEqual({ exact: ['boss'], prefixes: ['mod'] });
});

it.each([
  ['listen.port', 0], ['listen.host', 'localhost'], ['siteOrigin', 'not a url'], ['siteOrigin', 'https://play.example.com/'],
  ['siteOrigin', 'ftp://play.example.com'], ['ticketSecret', 'short'], ['sql.password', ''], ['sql.port', 70000],
  ['sql.trustServerCertificate', 'yes'], ['trustedProxies', ['::1']], ['servers.login.port', -1], ['limits.createdPerHour', 0],
  ['limits.unknownLimit', 5], ['reservedNames.exact', 'admin'],
])('refuses a bad %s (%j)', (key, value) => {
  const json = key.startsWith('limits.') || key.startsWith('reservedNames.')
    ? withValue({ ...example, limits: {}, reservedNames: { exact: [], prefixes: [] } }, key, value)
    : withValue(example, key, value);
  expect(() => parseWebConfig(json)).toThrow(key);
});

it('refuses a missing file section', () => {
  const { sql: _sql, ...rest } = example;
  expect(() => parseWebConfig(rest)).toThrow('sql');
});

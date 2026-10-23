// Reading live.config.json, which both live tests use (see live.config.example.json for what is in it).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseConfig } from '@flyffweb/gateway/src/config';
import type { GatewayConfig } from '@flyffweb/gateway/src/config';
import { validateBankPin } from '../../src/lobby/validation';

export const CONFIG_PATH = fileURLToPath(new URL('../live.config.json', import.meta.url));

/**
 * Reads live.config.json and hands its JSON object to `parse` (anything it holds besides the fields `parse` reads,
 * `_comment` included, is ignored). `undefined` when the file does not exist. Every other problem, in the JSON or in
 * `parse` (which throws with what is wrong), stops with `${label}: cannot use <file>: <what>`.
 */
export function loadConfigFile<T>(label: string, parse: (root: Record<string, unknown>) => T): T | undefined {
  let source: string;
  try {
    source = readFileSync(CONFIG_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const json: unknown = JSON.parse(source);
    if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('the file must hold a JSON object');
    return parse(json as Record<string, unknown>);
  } catch (error) {
    throw new Error(`${label}: cannot use ${CONFIG_PATH}: ${(error as Error).message}`);
  }
}

/** A string field that must not be empty; `where` is the path to the object (`world.accounts[0].`) for the message. */
export function requireText(item: Record<string, unknown>, name: string, where = ''): string {
  const value = item[name];
  if (typeof value !== 'string' || value === '') throw new Error(`${where}${name} must be a non-empty string`);
  return value;
}

/** The `bankPin` field: text of the create screen's 4 digits. */
export function requireBankPin(item: Record<string, unknown>, where = ''): string {
  const bankPin = requireText(item, 'bankPin', where);
  const problem = validateBankPin(bankPin, bankPin);
  if (problem !== undefined) throw new Error(`${where}bankPin: ${problem}`);
  return bankPin;
}

/** What both tests need to reach the servers: the in-process gateway's settings and the certifier's advertised address. */
export interface GatewaySettings {
  gateway: GatewayConfig;
  /** The certifier's advertised `address:port`, a key of `gateway.routes`. */
  certifierAddress: string;
}

/** The `gateway` and `certifierAddress` fields. */
export function parseGatewaySettings(root: Record<string, unknown>): GatewaySettings {
  let gateway: GatewayConfig;
  try {
    gateway = parseConfig(root.gateway);
  } catch (error) {
    throw new Error(`gateway: ${(error as Error).message}`);
  }
  const certifierAddress = requireText(root, 'certifierAddress');
  const certifierRoute = Object.hasOwn(gateway.routes, certifierAddress) ? gateway.routes[certifierAddress] : undefined;
  if (certifierRoute?.role !== 'certifier') throw new Error(`certifierAddress ${certifierAddress} must be a route of gateway.routes with the role "certifier"`);
  if (gateway.allowedOrigins.length === 0) throw new Error('gateway.allowedOrigins must hold an origin for the test to connect as');
  return { gateway, certifierAddress };
}

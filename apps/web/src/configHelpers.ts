// The settings checks shared by web.config.json's parts (config.ts, admin/config.ts). Each throws an Error naming the
// key, so a bad value stops the service at start (or, for the admin part, keeps the panel off) with a clear reason.

import { normalizeIPv4 } from '@flyffweb/protocol';

export interface HostPort { host: string; port: number }

export type JsonObject = Record<string, unknown>;

export function object(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as JsonObject;
}

export function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

export function integer(value: unknown, path: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${path} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

export function ipv4(value: unknown, path: string): string {
  if (typeof value !== 'string' || normalizeIPv4(value) !== value) throw new Error(`${path} must be a dotted IPv4 address`);
  return value;
}

export function list<T>(value: unknown, path: string, entry: (item: unknown, itemPath: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be a list`);
  return value.map((item, i) => entry(item, `${path}[${i}]`));
}

export function hostPort(value: unknown, path: string): HostPort {
  const at = object(value, path);
  return { host: text(at.host, `${path}.host`), port: integer(at.port, `${path}.port`, 1, 65535) };
}

/** Throws for a key of `given` that is not in `known`, naming it as `${path}.${key}`. */
export function onlyKeys(given: JsonObject, known: readonly string[], path: string): void {
  for (const key of Object.keys(given)) if (!known.includes(key)) throw new Error(`${path}.${key} is not a setting`);
}

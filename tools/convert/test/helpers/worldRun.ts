// What the worlds-stage tests read back from a run: the report and the files the writer wrote. Shared by the unit
// tests on a hand-made client (world.test.ts) and the corpus tests on real worlds (world.corpus.test.ts).

import fs from 'node:fs/promises';
import path from 'node:path';
import { expect } from 'vitest';
import { decodeTileBin } from '@flyffweb/formats';
import type { WebTile, WorldManifest } from '@flyffweb/formats';
import type { AssetWriter } from '../../src/output/AssetWriter';

export interface ReportJson {
  kinds: Record<string, { ok: number; warn: number; failed: number; bytesIn: number; bytesOut: number }>;
  warnings: { kind: string; source: string; message: string }[];
  failures: { kind: string; source: string; message: string }[];
}

export interface Run {
  writer: AssetWriter;
  report: ReportJson;
  out: string;
}

export async function manifestOf(run: Run, web: string): Promise<WorldManifest> {
  const hashed = run.writer.pathOf(`worlds/${web}/manifest.json`);
  expect(hashed, `manifest of ${web}`).toBeDefined();
  return JSON.parse(await fs.readFile(path.join(run.out, ...hashed!.split('/')), 'utf8')) as WorldManifest;
}

export async function tileOf(run: Run, manifest: WorldManifest, key: string): Promise<WebTile> {
  const hashed = manifest.tiles[key];
  expect(hashed, `tile ${key}`).toBeDefined();
  return decodeTileBin(new Uint8Array(await fs.readFile(path.join(run.out, ...hashed!.split('/')))), key);
}

export const bytesOf = (...values: number[]): Uint8Array => Uint8Array.from(values);

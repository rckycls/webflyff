import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FormatError } from '@flyffweb/formats';
import { writeAtomic } from './atomicWrite';

interface Counts {
  ok: number;
  warn: number;
  failed: number;
  bytesIn: number;
  bytesOut: number;
}

/** One entry of `failures` in report.json. FormatError details are copied field for field. */
interface Failure {
  kind: string;
  source: string;
  message: string;
  error?: string;
  file?: string;
  offset?: number;
  unit?: string;
  line?: number;
  reader?: string;
  cppRef?: string;
  stack?: string;
}

interface Warning {
  kind: string;
  source: string;
  message: string;
}

const emptyCounts = (): Counts => ({ ok: 0, warn: 0, failed: 0, bytesIn: 0, bytesOut: 0 });

const count = (n: number): string => n.toLocaleString('en-US');

function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(2)} ${units[unit]}`;
}

function describeFailure(kind: string, source: string, err: unknown): Failure {
  if (err instanceof FormatError) {
    return {
      kind,
      source,
      message: err.message,
      error: err.name,
      file: err.file,
      offset: err.offset,
      unit: err.unit,
      ...(err.line === undefined ? {} : { line: err.line }),
      reader: err.reader,
      cppRef: err.cppRef,
    };
  }
  if (err instanceof Error) {
    // No file context of its own (an encoder RangeError, say): the source path says which file it was.
    const stack = err.stack === undefined ? {} : { stack: err.stack };
    return { kind, source, message: err.message, error: err.name, ...stack };
  }
  return { kind, source, message: String(err) };
}

/**
 * What a converter run did, per kind of work (`textures`, `models`, `worlds`, `stage`): counts of ok, warn and
 * failed files, the bytes read and written, and the details of every warning and failure for `report.json`.
 */
export class Report {
  private readonly kinds = new Map<string, Counts>();
  private readonly failures: Failure[] = [];
  private readonly warnings: Warning[] = [];

  private counts(kind: string): Counts {
    let counts = this.kinds.get(kind);
    if (counts === undefined) {
      counts = emptyCounts();
      this.kinds.set(kind, counts);
    }
    return counts;
  }

  ok(kind: string, source: string, bytesIn: number, bytesOut: number): void {
    const counts = this.counts(kind);
    counts.ok++;
    counts.bytesIn += bytesIn;
    counts.bytesOut += bytesOut;
  }

  fail(kind: string, source: string, err: unknown): void {
    this.counts(kind).failed++;
    this.failures.push(describeFailure(kind, source, err));
  }

  warn(kind: string, source: string, message: string): void {
    this.counts(kind).warn++;
    this.warnings.push({ kind, source, message });
  }

  get failed(): number {
    return this.failures.length;
  }

  private totals(): Counts {
    const totals = emptyCounts();
    for (const counts of this.kinds.values()) {
      totals.ok += counts.ok;
      totals.warn += counts.warn;
      totals.failed += counts.failed;
      totals.bytesIn += counts.bytesIn;
      totals.bytesOut += counts.bytesOut;
    }
    return totals;
  }

  /** One line per kind, the bytes read and written, and a last line that ends in "N failed". */
  summary(): string {
    const lines = [...this.kinds].map(
      ([kind, c]) => `${kind}: ${count(c.ok)} ok, ${count(c.warn)} warn, ${count(c.failed)} failed`,
    );
    const total = this.totals();
    lines.push(`Bytes: ${formatBytes(total.bytesIn)} in, ${formatBytes(total.bytesOut)} out`);
    lines.push(`Total: ${count(total.ok)} ok, ${count(total.warn)} warn, ${count(total.failed)} failed`);
    return lines.join('\n');
  }

  /** Writes `<outDir>/report.json` (through a temp file, like every other output). */
  async write(outDir: string): Promise<void> {
    const json = {
      version: 1,
      totals: this.totals(),
      kinds: Object.fromEntries(this.kinds),
      warnings: this.warnings,
      failures: this.failures,
    };
    await writeAtomic(fs, path.join(outDir, 'report.json'), `${JSON.stringify(json, null, 2)}\n`);
  }
}

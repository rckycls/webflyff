// The bots' log: one line an event, stamped in the server's time (Philippine time, UTC+8), appended to a file that is
// cut to its newer part once it passes its cap, so it never fills the disk.
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

export type Log = (line: string) => void;

export interface LogOptions {
  /** Also print the line (the service's own console log). */
  echo?: boolean;
  maxBytes?: number;
  keepBytes?: number;
  now?: () => Date;
}

const PH_OFFSET_MS = 8 * 3600_000;

/** `2026-11-20 16:00:00` for 08:00 UTC. */
export function stamp(date: Date): string {
  return new Date(date.getTime() + PH_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

export function fileLog(file: string, opts: LogOptions = {}): Log {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const keepBytes = opts.keepBytes ?? 5 * 1024 * 1024;
  const now = opts.now ?? (() => new Date());
  return (line) => {
    const text = `${stamp(now())} ${line}\n`;
    if (opts.echo !== false) process.stdout.write(text);
    try {
      appendFileSync(file, text, 'utf8');
      if (existsSync(file) && statSync(file).size > maxBytes) {
        const all = readFileSync(file, 'utf8');
        let rest = all.slice(all.length - keepBytes);
        const cut = rest.indexOf('\n');
        if (cut >= 0) rest = rest.slice(cut + 1);
        writeFileSync(file, rest, 'utf8');
      }
    } catch (error) {
      process.stderr.write(`town bots: the log file ${file} could not be written: ${(error as Error).message}\n`);
    }
  };
}

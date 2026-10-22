import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startCapture, type CaptureHandle, type CaptureRoute } from './capture';

/** This file is FlyffWeb/tools/capture/src/cli.ts, so FlyffWeb is three levels up. */
const FLYFFWEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const DEFAULT_LISTEN = '172.31.238.55';
const DEFAULT_TARGET = '127.0.0.1';
const DEFAULT_PORTS = '23000,28000';
const DEFAULT_OUT = path.join(FLYFFWEB_ROOT, 'packages', 'protocol', 'test', 'fixtures', 'neuz-login.json');

export const USAGE = [
  'Usage: npm run capture -- --account <name> --password <password> --pin <4 digits> [options]',
  '',
  'Relays Neuz to the real servers and records every packet, for test fixtures. Use a throwaway account:',
  'its password is written into the recording. Press Ctrl+C when the session is done.',
  'See tools/capture/README.md for the full steps.',
  '',
  'Options:',
  `  --listen <host>       Address to listen on, the one Neuz connects to (default: ${DEFAULT_LISTEN})`,
  `  --target <host>       Address of the real servers (default: ${DEFAULT_TARGET})`,
  `  --ports <list>        Server ports, comma separated; each is listened on and forwarded to unchanged`,
  `                        (default: ${DEFAULT_PORTS}, certifier and login)`,
  '  --account <name>      The throwaway account',
  '  --password <text>     Its password',
  '  --pin <digits>        Its 4-digit Bank PIN',
  '  --out <file>          Recording to write (default: packages/protocol/test/fixtures/neuz-login.json)',
  '  -h, --help            Show this help',
  '',
  'The recording is written after every connection closes and on Ctrl+C.',
  'Exit code: 0 done, 1 could not start or write, 2 bad command line.',
].join('\n');

export interface CliOptions {
  listen: string;
  target: string;
  routes: CaptureRoute[];
  account: string;
  password: string;
  bankPin: string;
  out: string;
}

export type ParsedCli =
  | { kind: 'help' }
  | { kind: 'run'; options: CliOptions }
  | { kind: 'error'; message: string };

/** Reads the command line. A relative `--out` resolves against the current folder. */
export function parseCli(argv: string[]): ParsedCli {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        listen: { type: 'string' },
        target: { type: 'string' },
        ports: { type: 'string' },
        account: { type: 'string' },
        password: { type: 'string' },
        pin: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  if (values.help) return { kind: 'help' };

  for (const name of ['listen', 'target', 'ports', 'out'] as const) {
    if (values[name] === '') return { kind: 'error', message: `--${name} needs a value` };
  }
  for (const name of ['account', 'password', 'pin'] as const) {
    if (!values[name]) return { kind: 'error', message: `--${name} is required` };
  }
  if (!/^\d{4}$/.test(values.pin!)) return { kind: 'error', message: '--pin must be exactly 4 digits' };

  const ports = (values.ports ?? DEFAULT_PORTS).split(',').map((text) => text.trim());
  const routes: CaptureRoute[] = [];
  for (const text of ports) {
    const port = /^\d{1,5}$/.test(text) ? Number(text) : 0;
    if (port < 1 || port > 65535) {
      const message = `--ports must be port numbers from 1 to 65535 separated by commas, got "${values.ports}"`;
      return { kind: 'error', message };
    }
    if (routes.some((route) => route.listenPort === port)) {
      return { kind: 'error', message: `--ports lists port ${port} twice` };
    }
    routes.push({ listenPort: port, targetPort: port });
  }

  return {
    kind: 'run',
    options: {
      listen: values.listen ?? DEFAULT_LISTEN,
      target: values.target ?? DEFAULT_TARGET,
      routes,
      account: values.account!,
      password: values.password!,
      bankPin: values.pin!,
      out: path.resolve(values.out ?? DEFAULT_OUT),
    },
  };
}

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

const consoleIo: CliIo = { stdout: (text) => console.log(text), stderr: (text) => console.error(text) };

/** What to tell the owner when the relay cannot listen: the two failures the README has an answer for. */
function startFailure(error: unknown, listen: string): string {
  const message = error instanceof Error ? error.message : String(error);
  switch ((error as NodeJS.ErrnoException).code) {
    case 'EADDRNOTAVAIL':
      return `${message}\nThis PC does not answer on ${listen}. Add the address first (README step 1).`;
    case 'EADDRINUSE':
      return `${message}\nSomething else is listening there. See the Wireshark fallback (README step 5).`;
    default:
      return message;
  }
}

/**
 * Runs the capture until `stop` is aborted (Ctrl+C), then closes it and returns the exit code. The recording
 * is written whenever a connection closes and once more at the end, so closing the window loses little. A
 * session that recorded nothing never overwrites an existing file.
 */
export async function main(argv: string[], io: CliIo, stop: AbortSignal): Promise<number> {
  const parsed = parseCli(argv);
  if (parsed.kind === 'help') {
    io.stdout(USAGE);
    return 0;
  }
  if (parsed.kind === 'error') {
    io.stderr(`capture: ${parsed.message}\n\n${USAGE}`);
    return 2;
  }
  const { listen, target, routes, account, password, bankPin, out } = parsed.options;

  let capture: CaptureHandle | undefined;
  let stopping = false;
  let writeFailed = false;
  const save = (): void => {
    const recording = capture?.recording();
    if (!recording || recording.packets.length === 0) return;
    try {
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(recording, null, 2)}\n`);
      writeFailed = false;
      io.stdout(`saved ${recording.packets.length} packets to ${out}`);
    } catch (error) {
      writeFailed = true;
      io.stderr(`capture: could not write ${out}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  try {
    capture = await startCapture({
      listenHost: listen,
      targetHost: target,
      routes,
      meta: { account, password, bankPin },
      onConnectionClosed: () => { if (!stopping) save(); }, // the final save below covers what the shutdown closes
      log: io.stdout,
    });
  } catch (error) {
    io.stderr(`capture: ${startFailure(error, listen)}`);
    return 1;
  }
  io.stdout('ready: start Neuz now, and press Ctrl+C here when the session is done');

  if (!stop.aborted) {
    await new Promise<void>((resolve) => stop.addEventListener('abort', () => resolve(), { once: true }));
  }
  stopping = true;
  await capture.close();
  save();
  if (capture.recording().packets.length === 0) io.stdout('nothing was recorded, so no file was written');
  return writeFailed ? 1 : 0;
}

/** True when this file was started as the script (`tsx tools/capture/src/cli.ts`), not imported by a test. */
function isEntryPoint(): boolean {
  try {
    const script = process.argv[1];
    return script !== undefined && realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const stop = new AbortController();
  // Ctrl+C, Ctrl+Break, and closing the console window.
  for (const signal of ['SIGINT', 'SIGBREAK', 'SIGHUP'] as const) process.on(signal, () => stop.abort());
  process.exitCode = await main(process.argv.slice(2), consoleIo, stop.signal);
}

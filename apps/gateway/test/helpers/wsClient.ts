import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from '../../src/log';
import { startRelay, type RelayOptions, type RelayResult } from '../../src/relay';

export interface RelayHarness {
  /** A browser, already connected: its end of the WebSocket the relay serves. */
  client: WebSocket;
  /** Binary messages the browser has received so far, in order. */
  messages: Uint8Array[];
  /** Resolves with the close code once the browser's WebSocket is closed. */
  closed: Promise<{ code: number }>;
  /** Resolves when the relay is done with the connection. */
  result: Promise<RelayResult>;
  /** What the relay wrote to its logger. */
  logs: string[];
  /** Closes the browser, the WebSocket server and, through the relay, the TCP side. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * Runs `startRelay` for one WebSocket connection: a `WebSocketServer` on a free loopback port hands every
 * connection to the relay, and a browser-side `WebSocket` connects to it and is returned ready to use.
 */
export async function relayHarness(opts: Omit<RelayOptions, 'log'>): Promise<RelayHarness> {
  const logs: string[] = [];
  const log: Logger = { info: (line) => { logs.push(line); } };
  let relayDone!: (result: RelayResult) => void;
  const result = new Promise<RelayResult>((resolve) => { relayDone = resolve; });

  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  wss.on('connection', (ws) => {
    void startRelay(ws, { ...opts, log }).done.then(relayDone);
  });
  await once(wss, 'listening');

  const client = new WebSocket(`ws://127.0.0.1:${(wss.address() as AddressInfo).port}`);
  const messages: Uint8Array[] = [];
  client.on('message', (data: Buffer) => messages.push(new Uint8Array(data)));
  client.on('error', () => {}); // a failed handshake is reported through the rejected `once` below
  const closed = new Promise<{ code: number }>((resolve) => client.once('close', (code) => resolve({ code })));
  const stopServer = (): Promise<void> => {
    for (const connection of wss.clients) connection.terminate();
    return new Promise((resolve) => wss.close(() => resolve()));
  };
  try {
    await once(client, 'open');
  } catch (error) {
    await stopServer();
    throw error;
  }

  let closing: Promise<void> | undefined;
  return {
    client,
    messages,
    closed,
    result,
    logs,
    close() {
      closing ??= (async () => {
        client.terminate();
        await stopServer();
        await result; // the relay has destroyed its TCP socket by now
      })();
      return closing;
    },
  };
}

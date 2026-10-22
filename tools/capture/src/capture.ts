import net from 'node:net';
import {
  ClientFrameReader,
  ServerFrameReader,
  bytesToHex,
  readProtocolId,
  type RecordedPacket,
  type Recording,
} from '@flyffweb/protocol';

export interface CaptureRoute {
  /** The port to listen on; 0 lets the OS pick one (see `CaptureHandle.listenPorts`). */
  listenPort: number;
  /** The server's port. Recorded packets carry this one, so a fixture says which server a packet belongs to. */
  targetPort: number;
}

export interface CaptureOptions {
  listenHost: string;
  targetHost: string;
  routes: CaptureRoute[];
  /** The throwaway account the session is made with; copied into the recording. */
  meta: { account: string; password: string; bankPin: string };
  /** Called once per connection, after both of its sockets are closed. */
  onConnectionClosed?: (connection: number) => void;
  /** Progress and problems in plain words. Never packet contents. */
  log?: (message: string) => void;
}

export interface CaptureHandle {
  /** The ports actually listening, in the order of `routes`. */
  listenPorts: number[];
  /** A snapshot of everything recorded so far. */
  recording(): Recording;
  /** Stops listening, closes every connection and resolves when all of them are gone. Safe to call twice. */
  close(): Promise<void>;
}

function listen(server: net.Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  // The callback also fires, with an error, for a server that never started listening; either way it is done.
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * A TCP relay that records what crosses it. Every connection accepted on a `listenPort` is passed on, byte for
 * byte, to `targetHost:targetPort`, and every FlyFF body in either direction is appended to the recording in
 * arrival order. The relay is transparent: a stream the recorder cannot parse is still relayed, and recording
 * just stops for that direction.
 *
 * Server bytes go through `ServerFrameReader`. The first body is the protocol ID (`readProtocolId`), which the
 * client frames' checksums need, so client bytes are held back from the parser until it is known and then
 * parsed in order; they are forwarded to the server at once.
 */
export async function startCapture(options: CaptureOptions): Promise<CaptureHandle> {
  const { listenHost, targetHost, meta } = options;
  const log = options.log ?? (() => {});
  const packets: RecordedPacket[] = [];
  const live = new Set<net.Socket>();
  let lastConnection = 0;

  function relay(client: net.Socket, targetPort: number): void {
    const connection = ++lastConnection;
    const tag = `connection ${connection} (port ${targetPort})`;
    // Half-closes are passed on, so a last server reply still reaches a client that has finished sending.
    const upstream = net.connect({ host: targetHost, port: targetPort, allowHalfOpen: true });
    const sockets = [client, upstream];
    for (const socket of sockets) live.add(socket);
    log(`${tag}: client connected, relaying to ${targetHost}:${targetPort}`);

    let socketsOpen = sockets.length;
    for (const socket of sockets) {
      const other = socket === client ? upstream : client;
      socket.on('end', () => other.end());
      socket.on('error', (error) => {
        log(`${tag}: ${socket === client ? 'client' : 'server'} socket error: ${error.message}`);
        other.destroy();
      });
      socket.on('close', () => {
        live.delete(socket);
        other.destroy();
        if (--socketsOpen === 0) {
          log(`${tag}: closed`);
          options.onConnectionClosed?.(connection);
        }
      });
    }

    const record = (direction: 'c2s' | 's2c', body: Uint8Array): void => {
      packets.push({ port: targetPort, connection, direction, hex: bytesToHex(body) });
    };

    // Client side: held until the protocol ID is known, then parsed.
    let held: Uint8Array[] | undefined = [];
    let clientReader: ClientFrameReader | undefined;
    let clientFailed = false;
    const parseClient = (chunk: Uint8Array): void => {
      if (!clientReader || clientFailed) return;
      try {
        for (const body of clientReader.push(chunk)) record('c2s', body);
      } catch (error) {
        clientFailed = true;
        log(`${tag}: stopped recording client packets: ${(error as Error).message}`);
      }
    };

    // Server side: the first body is the protocol ID.
    const serverReader = new ServerFrameReader();
    let serverFailed = false;
    let firstBody = true;
    const onFirstBody = (body: Uint8Array): void => {
      const protocolId = readProtocolId(body);
      const pending = held ?? [];
      held = undefined;
      if (protocolId === undefined) {
        clientFailed = true;
        log(`${tag}: the first server packet is not a protocol ID, so client packets cannot be recorded`);
        return;
      }
      clientReader = new ClientFrameReader(protocolId);
      for (const chunk of pending) parseClient(chunk);
    };

    client.on('data', (chunk: Buffer) => {
      upstream.write(chunk);
      if (held) held.push(new Uint8Array(chunk));
      else parseClient(chunk);
    });
    upstream.on('data', (chunk: Buffer) => {
      client.write(chunk);
      if (serverFailed) return;
      try {
        for (const body of serverReader.push(chunk)) {
          record('s2c', body);
          if (firstBody) {
            firstBody = false;
            onFirstBody(body);
          }
        }
      } catch (error) {
        serverFailed = true;
        log(`${tag}: stopped recording server packets: ${(error as Error).message}`);
      }
    });
  }

  const servers = options.routes.map((route) => {
    const server = net.createServer({ allowHalfOpen: true }, (client) => relay(client, route.targetPort));
    return { server, route };
  });
  const results = await Promise.allSettled(
    servers.map(({ server, route }) => listen(server, route.listenPort, listenHost)),
  );
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) {
    await Promise.all(servers.map(({ server }) => closeServer(server)));
    throw failed.reason;
  }
  const listenPorts = results.map((result) => (result as PromiseFulfilledResult<number>).value);
  for (const [i, { route }] of servers.entries()) {
    log(`listening on ${listenHost}:${listenPorts[i]}, relaying to ${targetHost}:${route.targetPort}`);
  }

  let closing: Promise<void> | undefined;
  return {
    listenPorts,
    recording: () => ({ ...meta, packets: [...packets] }),
    close() {
      closing ??= (async () => {
        const stopped = servers.map(({ server }) => closeServer(server));
        const gone = [...live].map(
          (socket) =>
            new Promise<void>((resolve) => {
              if (socket.closed) resolve();
              else socket.once('close', () => resolve());
            }),
        );
        for (const socket of live) socket.destroy();
        await Promise.all([...stopped, ...gone]);
      })();
      return closing;
    },
  };
}

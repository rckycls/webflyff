import net from 'node:net';
import { ClientFrameReader, ProtocolError, encodeProtocolIdBody, encodeServerFrame } from '@flyffweb/protocol';

/** Any number will do; it only has to be the one the fake server and its test client agree on. */
const DEFAULT_PROTOCOL_ID = 0x0badc0de;

export interface FakeFlyffServerOptions {
  /** The protocol ID the server announces and checks client checksums with. Default: an arbitrary fixed number. */
  protocolId?: number;
  /**
   * Waits this many milliseconds after accepting a connection before sending the protocol-ID frame (default: none),
   * to test clients that talk before the ID arrives. Client frames are read and checked meanwhile.
   */
  delayIdMs?: number;
  /** Called for every client body that passed its checksums. `reply` sends a body back on that same connection. */
  onBody?: (body: Uint8Array, reply: (body: Uint8Array) => void) => void;
}

export interface FakeFlyffServer {
  /** The loopback port the server listens on (the OS picked it). */
  readonly port: number;
  readonly protocolId: number;
  /** Client bodies in arrival order, across all connections. */
  readonly received: Uint8Array[];
  /** Connections accepted so far. */
  readonly connections: number;
  /** Client frames refused for a bad marker or checksum so far. The offending connection is destroyed. */
  readonly crcErrors: number;
  /** Sends a body to the newest connection that is still open. Throws when no client is connected. */
  send(body: Uint8Array): void;
  /** Destroys every open connection. The server keeps listening. */
  dropClients(): void;
  /** Resolves once `received` holds at least `n` bodies. */
  waitForBodies(n: number): Promise<void>;
  /** Stops listening, destroys every connection and resolves when all of them are gone. Safe to call twice. */
  close(): Promise<void>;
}

/**
 * A stand-in for a FlyFF server on 127.0.0.1, for tests. On accept it sends the protocol-ID body, the way the
 * real servers do (after `delayIdMs`, if set). It reads client frames, checks their checksums against the
 * protocol ID and hands the bodies to `onBody`.
 */
export async function startFakeFlyffServer(options: FakeFlyffServerOptions = {}): Promise<FakeFlyffServer> {
  const protocolId = options.protocolId ?? DEFAULT_PROTOCOL_ID;
  const received: Uint8Array[] = [];
  const open: net.Socket[] = []; // in accept order, so the last one is the newest
  const waiters: { n: number; resolve: () => void }[] = [];
  let connections = 0;
  let crcErrors = 0;

  const notifyWaiters = (): void => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (received.length >= waiters[i]!.n) waiters.splice(i, 1)[0]!.resolve();
    }
  };

  const server = net.createServer((socket) => {
    connections++;
    open.push(socket);
    socket.on('close', () => {
      const at = open.indexOf(socket);
      if (at >= 0) open.splice(at, 1);
    });
    socket.on('error', () => socket.destroy()); // a client that resets is not a test failure
    const reader = new ClientFrameReader(protocolId);
    const reply = (body: Uint8Array): void => {
      if (!socket.destroyed) socket.write(encodeServerFrame(body));
    };
    const sendProtocolId = (): void => {
      if (!socket.destroyed) socket.write(encodeServerFrame(encodeProtocolIdBody(protocolId)));
    };
    if (options.delayIdMs) {
      const timer = setTimeout(sendProtocolId, options.delayIdMs);
      socket.on('close', () => clearTimeout(timer));
    } else {
      sendProtocolId();
    }
    socket.on('data', (chunk: Buffer) => {
      let bodies: Uint8Array[];
      try {
        bodies = reader.push(chunk);
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        crcErrors++;
        socket.destroy();
        return;
      }
      for (const body of bodies) {
        received.push(body);
        options.onBody?.(body, reply);
      }
      notifyWaiters();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const port = (server.address() as net.AddressInfo).port;

  let closing: Promise<void> | undefined;
  return {
    port,
    protocolId,
    received,
    get connections() { return connections; },
    get crcErrors() { return crcErrors; },
    send(body) {
      const newest = open[open.length - 1];
      if (!newest) throw new Error('no client is connected to the fake server');
      newest.write(encodeServerFrame(body));
    },
    dropClients() {
      for (const socket of [...open]) socket.destroy();
    },
    waitForBodies(n) {
      if (received.length >= n) return Promise.resolve();
      return new Promise((resolve) => waiters.push({ n, resolve }));
    },
    close() {
      closing ??= new Promise<void>((resolve) => {
        server.close(() => resolve()); // calls back once every connection is gone
        for (const socket of [...open]) socket.destroy();
      });
      return closing;
    },
  };
}

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { CloseCode } from '@flyffweb/protocol';
import { resolveClientAddress, shownAddress } from './clientAddress';
import type { GatewayConfig } from './config';
import { AddressCounter, AddressRate } from './limits';
import { consoleLogger, type Logger } from './log';
import { RefusalLog, type RefusalReason } from './refusalLog';
import { startRelay } from './relay';

/** The window of `maxNewConnectionsPerAddressPerMinute`. */
const NEW_CONNECTIONS_WINDOW_MS = 60000;

export interface Gateway {
  /** The port the gateway listens on; the one the system picked when the config asked for 0. */
  port: number;
  /**
   * Stops listening, cuts every open connection, TCP side included, and resolves once all of them are gone.
   * Browsers see a connection that broke (1006), not a close. Safe to call twice.
   */
  close(): Promise<void>;
}

/**
 * What a browser asks for: `/connect/<address>:<port>` of the server it wants, as the servers advertise it. The
 * address may only be letters, digits, dots and hyphens (the servers hand out dotted IPv4): the route is written into
 * the log as the browser asked for it, so it must not be able to hold a space or a line break.
 */
const CONNECT_PATH = /^\/connect\/([A-Za-z0-9.-]{1,253}:\d{1,5})$/;

/** The `address:port` a request URL names (URI-decoded; a query string is ignored), or `undefined` for any other URL. */
function requestedRoute(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(url.split('?', 1)[0]!);
  } catch {
    return undefined; // not valid percent-encoding
  }
  return CONNECT_PATH.exec(path)?.[1];
}

/** Answers an upgrade request with an HTTP error and hangs up, so the connection never becomes a WebSocket. */
function refuse(socket: Duplex, status: 400 | 403 | 404): void {
  socket.on('error', () => {}); // the browser may be gone already; nothing is left to tell
  socket.once('finish', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

const closeLine = (address: string, routeKey: string, code: number, up: number, down: number): string =>
  `close ${address} ${routeKey} code=${code} up=${up} down=${down}`;

/**
 * Starts the gateway: an HTTP server whose WebSocket upgrades are relayed to FlyFF servers (spec section 4.2).
 *
 * An upgrade request is refused before the upgrade when its `Origin` is missing or not in `allowedOrigins` (403),
 * when the path is not `/connect/<address>:<port>` (404) or when the player's address cannot be told (400). Past
 * that the WebSocket opens, and is closed again, in this order of checks, with:
 * - 4003 when `<address>:<port>` is not in the route table;
 * - 4009 when the gateway already has `maxConnections` open connections;
 * - 4007 when the player's address already has `maxConnectionsPerAddress` of them;
 * - 4008 when the player's address has made `maxNewConnectionsPerAddressPerMinute` in the last 60 seconds.
 * Anything else is relayed (`startRelay`), and only such a connection counts towards those limits: a refused one
 * never reaches a server.
 *
 * Writes to `log` one line when a relay starts, `open <address> <routeKey>`, and one when it ends,
 * `close <address> <routeKey> code=<code> up=<bytes> down=<bytes>`. Every refusal goes to a `RefusalLog`, which
 * writes `refused <address> <reason>` once per address and reason a minute and sums the rest. Nothing a packet
 * holds is ever logged, because the password hash is in those, and nothing else a browser sent either: not its
 * origin, path or route.
 */
export async function startGateway(config: GatewayConfig, log: Logger = consoleLogger): Promise<Gateway> {
  const { limits } = config;
  const counter = new AddressCounter(limits.maxConnectionsPerAddress);
  const rate = new AddressRate(limits.maxNewConnectionsPerAddressPerMinute, NEW_CONNECTIONS_WINDOW_MS);
  const refusals = new RefusalLog(log);
  /** Connections that passed every check, until their relay is over. */
  let open = 0;
  // One byte of room over the largest packet: a packet that is one byte too big reaches the relay, which answers it
  // with 4004; anything longer is cut by `ws` itself, which closes with 1009.
  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.maxPacketBytes + 1 });
  /** Every relay, from its start until its close line is written and its slot given back. */
  const relays = new Set<Promise<void>>();

  const server = http.createServer((_request, response) => {
    response.writeHead(404, { Connection: 'close', 'Content-Length': 0 }).end();
  });

  const onConnection = (ws: WebSocket, routeKey: string, address: string): void => {
    ws.on('error', () => {}); // `ws` closes the connection after an error by itself; this keeps it from throwing
    const refuseWith = (code: number, reason: RefusalReason): void => {
      refusals.refused(address, reason);
      ws.close(code);
    };
    if (!Object.hasOwn(config.routes, routeKey)) return refuseWith(CloseCode.NOT_ALLOWED, 'route');
    if (open >= limits.maxConnections) return refuseWith(CloseCode.GATEWAY_FULL, 'full');
    if (!counter.acquire(address)) return refuseWith(CloseCode.TOO_MANY_CONNECTIONS, 'per-address');
    if (!rate.allow(address)) {
      counter.release(address);
      return refuseWith(CloseCode.TOO_MANY_NEW_CONNECTIONS, 'rate');
    }
    open++;
    const giveBack = (): void => {
      open--;
      counter.release(address);
    };

    let relay: ReturnType<typeof startRelay>;
    try {
      relay = startRelay(ws, {
        route: config.routes[routeKey]!,
        clientAddress: address,
        sendClientAddr: config.sendClientAddr,
        limits,
      });
    } catch (error) {
      // Not a case a browser can cause, but it must not leave the slots taken or throw out of the upgrade listener.
      giveBack();
      console.error(`gateway: could not start a relay for ${address} ${routeKey}: ${(error as Error).message}`);
      ws.close(1011); // internal error
      return;
    }
    log.info(`open ${address} ${routeKey}`);
    const life = relay.done.then((result) => {
      giveBack();
      log.info(closeLine(address, routeKey, result.closeCode, result.bytesUp, result.bytesDown));
      relays.delete(life);
    });
    relays.add(life);
  };

  server.on('upgrade', (request, socket, head) => {
    // Worked out first, so that a refusal before the upgrade can name it too.
    const address = resolveClientAddress(request.socket.remoteAddress, request.headers['x-forwarded-for'], config.trustedProxies);
    const refuseUpgrade = (status: 400 | 403 | 404, reason: RefusalReason): void => {
      refusals.refused(shownAddress(address, request.socket.remoteAddress), reason);
      refuse(socket, status);
    };
    const origin = request.headers.origin;
    if (origin === undefined || !config.allowedOrigins.includes(origin)) return refuseUpgrade(403, 'origin');
    const routeKey = requestedRoute(request.url);
    if (routeKey === undefined) return refuseUpgrade(404, 'path');
    if (address === undefined) return refuseUpgrade(400, 'address');
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, routeKey, address));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.listen.port, config.listen.host, () => {
        server.off('error', reject);
        // Once listening, an error (an accept that fails for lack of file handles, say) is no reason to stop serving.
        server.on('error', (error) => console.error(`gateway: server error: ${error.message}`));
        resolve();
      });
    });
  } catch (error) {
    refusals.close(); // its period timer would outlive a gateway that never started
    throw error;
  }

  let closing: Promise<void> | undefined;
  return {
    port: (server.address() as AddressInfo).port,
    close() {
      closing ??= (async () => {
        const stopped = new Promise<void>((resolve) => server.close(() => resolve())); // calls back once every connection is gone
        server.closeAllConnections(); // requests that are not upgrades, idle ones included
        for (const ws of wss.clients) ws.terminate(); // each one ends its relay, which destroys the TCP side
        wss.close();
        await Promise.all(relays);
        await stopped;
        refusals.close(); // writes the repeat lines still pending
      })();
      return closing;
    },
  };
}

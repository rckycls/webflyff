import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { CloseCode } from '@flyffweb/protocol';
import { resolveClientAddress } from './clientAddress';
import type { GatewayConfig } from './config';
import { AddressCounter } from './limits';
import { consoleLogger, type Logger } from './log';
import { startRelay } from './relay';

export interface Gateway {
  /** The port the gateway listens on; the one the system picked when the config asked for 0. */
  port: number;
  /**
   * Stops listening, cuts every open connection, TCP side included, and resolves once all of them are gone.
   * Browsers see a connection that broke (1006), not a close. Safe to call twice.
   */
  close(): Promise<void>;
}

/** What a browser asks for: `/connect/<address>:<port>` of the server it wants, as the servers advertise it. */
const CONNECT_PATH = /^\/connect\/([^/]+:\d{1,5})$/;

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

/**
 * Starts the gateway: an HTTP server whose WebSocket upgrades are relayed to FlyFF servers (spec section 4.2).
 *
 * An upgrade request is refused before the upgrade when its `Origin` is missing or not in `allowedOrigins` (403),
 * when the path is not `/connect/<address>:<port>` (404) or when the player's address cannot be told (400). Past
 * that the WebSocket opens, and is closed again with 4003 when `<address>:<port>` is not in the route table and
 * with 4007 when the player's address already has `maxConnectionsPerAddress` connections. Anything else is
 * relayed (`startRelay`).
 *
 * Writes to `log` one line when a relay starts, `open <address> <routeKey>`, and one when it ends,
 * `close <address> <routeKey> code=<code> up=<bytes> down=<bytes>`. Connections that are refused or closed for their
 * route or address are not logged. Nothing a packet holds is ever logged: the password hash is in those.
 */
export async function startGateway(config: GatewayConfig, log: Logger = consoleLogger): Promise<Gateway> {
  const { limits } = config;
  const counter = new AddressCounter(limits.maxConnectionsPerAddress);
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
    if (!Object.hasOwn(config.routes, routeKey)) {
      ws.close(CloseCode.NOT_ALLOWED);
      return;
    }
    if (!counter.acquire(address)) {
      ws.close(CloseCode.TOO_MANY_CONNECTIONS);
      return;
    }
    log.info(`open ${address} ${routeKey}`);
    const relay = startRelay(ws, {
      route: config.routes[routeKey]!,
      clientAddress: address,
      sendClientAddr: config.sendClientAddr,
      limits,
    });
    const life = relay.done.then((result) => {
      counter.release(address);
      log.info(`close ${address} ${routeKey} code=${result.closeCode} up=${result.bytesUp} down=${result.bytesDown}`);
      relays.delete(life);
    });
    relays.add(life);
  };

  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    if (origin === undefined || !config.allowedOrigins.includes(origin)) return refuse(socket, 403);
    const routeKey = requestedRoute(request.url);
    if (routeKey === undefined) return refuse(socket, 404);
    const address = resolveClientAddress(request.socket.remoteAddress, request.headers['x-forwarded-for'], config.trustedProxies);
    if (address === undefined) return refuse(socket, 400);
    wss.handleUpgrade(request, socket, head, (ws) => onConnection(ws, routeKey, address));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.listen.port, config.listen.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

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
      })();
      return closing;
    },
  };
}

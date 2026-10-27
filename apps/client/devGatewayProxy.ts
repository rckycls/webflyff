// Node side of the dev server's gateway forwarding (`GATEWAY_PROXY`), kept apart from vite.config.ts so a unit test can
// call it without a browser. Nothing here reaches the page: the page only sees an empty `VITE_GATEWAY_URL` (src/config.ts).
import type { ProxyOptions } from 'vite';

/** The gateway's WebSocket path (`/connect/<address>:<port>`, see src/net/webSocketChannel.ts). */
const CONNECT_PREFIX = '/connect/';

/** What `vite.config.ts` takes from `GATEWAY_PROXY`. */
export interface DevGatewayProxy {
  /** For `server.proxy`: the `/connect/` upgrades go to the gateway. */
  proxy: Record<string, ProxyOptions>;
  /** For `define`: the page is told `VITE_GATEWAY_URL` is empty, which src/config.ts reads as "my own address". */
  define: Record<string, string>;
}

// ws:// or wss://, a host name, IPv4 address or [IPv6 address], and a port. The port is required and read from the text,
// not from `new URL`, which drops a default port (wss://host:443) and so could not tell it from a missing one.
const GATEWAY_PROXY_FORM = /^(wss?):\/\/([a-z0-9.-]+|\[[0-9a-f:.]+\]):(\d{1,5})\/?$/i;

/**
 * Phones reach the gateway only through the PC's dev server (docs/servers-in-a-vm.md): the page is served by this dev
 * server, and the gateway sits in a VM that a phone may not reach, and that admits only the page addresses in its
 * `allowedOrigins`. With `GATEWAY_PROXY` set to the gateway's address (`ws://192.168.100.141:8090`), the dev server
 * forwards the WebSocket upgrades under `/connect/` there and the page connects to the dev server itself. Without it,
 * nothing changes (the e2e tests use a closed gateway address and fake the gateway in the page).
 *
 * `devPort` is the dev server's port, the one `server.port` uses: forwarded upgrades carry `Origin: http://localhost:<port>`,
 * so the gateway lists that one entry whatever address the phone used for the page.
 *
 * Returns nothing when `GATEWAY_PROXY` is not set. Throws a plain sentence when it is set wrongly, or together with
 * `VITE_GATEWAY_URL`, which would send the page past the dev server to the gateway.
 */
export function devGatewayProxy(env: Readonly<Record<string, string | undefined>>, devPort: number): DevGatewayProxy | undefined {
  const setting = env.GATEWAY_PROXY?.trim();
  // A shell that sets a variable to nothing is, for this, one that does not set it.
  if (setting === undefined || setting === '') return undefined;
  if (env.VITE_GATEWAY_URL !== undefined && env.VITE_GATEWAY_URL !== '') {
    throw new Error('GATEWAY_PROXY and VITE_GATEWAY_URL are both set: set only GATEWAY_PROXY for a gateway in the VM (in PowerShell, Remove-Item Env:VITE_GATEWAY_URL clears the other).');
  }
  const form = GATEWAY_PROXY_FORM.exec(setting);
  const port = form === null ? 0 : Number(form[3]);
  if (form === null || port < 1 || port > 65535) {
    throw new Error(`GATEWAY_PROXY must look like ws://192.168.100.141:8090 (ws:// or wss://, the gateway's address, a colon and its port), but it is "${setting}".`);
  }
  return {
    proxy: {
      [CONNECT_PREFIX]: {
        target: `${form[1]!.toLowerCase()}://${form[2]!.toLowerCase()}:${port}`,
        ws: true,
        // The Host header of a gateway behind a TLS front (wss://) must be its own.
        changeOrigin: true,
        // Lower case on purpose: the proxy merges these over the request's own headers, which are lower case, and an
        // `Origin` spelt otherwise would travel next to the page's own instead of replacing it.
        headers: { origin: `http://localhost:${devPort}` },
        // Called for the upgrade before it is forwarded; `false` ends it with a 404 and the gateway never sees it.
        bypass: (request) => (isSamePageUpgrade(request.headers.origin, request.headers.host) ? undefined : false),
      },
    },
    define: { 'import.meta.env.VITE_GATEWAY_URL': '""' },
  };
}

// What Vite itself lets through for the page, with its default `allowedHosts`: localhost, *.localhost and IP addresses.
const ADDRESS_HOST = /^(localhost|[a-z0-9-]+\.localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d+)?$/i;

/**
 * The dev server stands in for the gateway's origin check (apps/gateway/src/server.ts refuses an upgrade whose Origin is
 * not in `allowedOrigins`): forwarding happens only for a page that came from this dev server, whose `Origin` is
 * `http://` plus the `Host` the browser used to reach it. A page from anywhere else on the network, or a client that
 * sends no `Origin`, gets nothing. The host must also be an address or `localhost`, as Vite requires for the page itself:
 * otherwise a page of someone else's, at a name they point at this PC, would be "the same page" (DNS rebinding).
 */
export function isSamePageUpgrade(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || host === undefined) return false;
  return origin === `http://${host}` && ADDRESS_HOST.test(host);
}

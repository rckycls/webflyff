// Browser code: it reads the page's own address, so it must not be imported by anything that runs in Node.

/** The three cases of `VITE_GATEWAY_URL`: not set, a value, or empty (see `clientConfig.gatewayUrl`). */
function gatewayUrlFor(setting: string | undefined): string {
  if (setting === undefined) return `ws://${location.hostname}:8090`;
  if (setting === '') return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return setting;
}

export const clientConfig = {
  /**
   * The gateway's WebSocket address. Not set: the machine that served the page, on the gateway's default port. A value:
   * that address. Empty: the page's own address, `ws://` plus the host and port in the address bar (`wss://` when the page
   * is `https:`), for a page and a `/connect/` served from one host: the dev server when `GATEWAY_PROXY` is set (it
   * forwards `/connect/` to the gateway, docs/servers-in-a-vm.md), or a hosted site that does the same.
   */
  gatewayUrl: gatewayUrlFor(import.meta.env.VITE_GATEWAY_URL),
  /** The certifier address the servers advertise (`NEUZ_IPSET`:23000); the gateway's route table is keyed by it. */
  certifierAddress: import.meta.env.VITE_CERTIFIER_ADDRESS ?? '172.31.238.55:23000',
};

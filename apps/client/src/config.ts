// Browser code: it reads the page's own address, so it must not be imported by anything that runs in Node.
export const clientConfig = {
  /** The gateway's WebSocket address. The default is the machine that served the page, on the gateway's default port. */
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL ?? `ws://${location.hostname}:8090`,
  /** The certifier address the servers advertise (`NEUZ_IPSET`:23000); the gateway's route table is keyed by it. */
  certifierAddress: import.meta.env.VITE_CERTIFIER_ADDRESS ?? '172.31.238.55:23000',
};

// Octets are written without leading zeros: a C library may read "010" as octal, and this text ends up in a packet.
const DOTTED_IPV4 = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;
const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/**
 * The address as plain dotted IPv4, or `undefined` for anything else. An IPv4-mapped IPv6 address
 * (`::ffff:a.b.c.d`) is unwrapped, which is how a dual-stack socket reports an IPv4 peer. The gateway listens on
 * IPv4 only, so any other IPv6 form has no meaning here.
 */
export function normalizeIPv4(address: string | undefined): string | undefined {
  if (address === undefined) return undefined;
  const plain = IPV4_MAPPED_PREFIX.test(address) ? address.slice('::ffff:'.length) : address;
  if (!DOTTED_IPV4.test(plain)) return undefined;
  return plain.split('.').every((octet) => Number(octet) <= 255) ? plain : undefined;
}

/**
 * The address of the player behind a connection: the socket's peer. When that peer is one of `trustedProxies`
 * (compared as plain IPv4) and sent an `X-Forwarded-For` header, the last entry of the header is used instead,
 * because that is the one the proxy itself appended; earlier entries come from the client and can be made up.
 * `undefined` when the address that would be used is not a dotted IPv4 address.
 */
export function resolveClientAddress(
  remote: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxies: string[],
): string | undefined {
  const peer = normalizeIPv4(remote);
  if (peer === undefined || !trustedProxies.includes(peer)) return peer;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  if (header === undefined) return peer;
  return normalizeIPv4(header.split(',').at(-1)!.trim());
}

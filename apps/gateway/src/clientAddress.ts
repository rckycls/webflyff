import { normalizeIPv4 } from '@flyffweb/protocol';

// normalizeIPv4 and resolveClientAddress moved to the protocol package for the web service (apps/web), which reads the
// address the same way.
export { normalizeIPv4, resolveClientAddress } from '@flyffweb/protocol';

/**
 * The address a log line names for a connection: the player's (`resolved`, from `resolveClientAddress`) when it could
 * be told, otherwise the direct peer's in plain IPv4, otherwise `unknown`. Never anything else the browser sent.
 */
export function shownAddress(resolved: string | undefined, remote: string | undefined): string {
  return resolved ?? normalizeIPv4(remote) ?? 'unknown';
}

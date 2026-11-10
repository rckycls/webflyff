// The owner's live check of the certifier allow-list (website spec §3.5, §5): sends the gateway the close-existing
// packet whose `'` would run SQL in the certifier, and reports whether the gateway refused it.
//
//   npx tsx apps/gateway/scripts/sendBadClose.ts <gateway URL> <certifier route key> [origin]
//   npx tsx apps/gateway/scripts/sendBadClose.ts ws://127.0.0.1:8090 172.31.238.55:23000 http://localhost:5174
//
// The origin must be one of the gateway's `allowedOrigins` (default http://localhost:5174, as in the example settings).
// Prints `refused (4006)` and exits 0 when the gateway closes with 4006; otherwise prints what happened and exits 1.

import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { CloseCode, encodeCloseExistingConnection } from '@flyffweb/protocol';

export type BadCloseOutcome = { closed: number } | { refusedUpgrade: number } | { error: string };

/** Opens `<gatewayUrl>/connect/<routeKey>`, sends the packet, and tells how the connection ended. */
export function sendBadClose(gatewayUrl: string, routeKey: string, origin: string, timeoutMs = 10_000): Promise<BadCloseOutcome> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${gatewayUrl.replace(/\/+$/, '')}/connect/${routeKey}`, { origin });
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ error: `the connection stayed open for ${timeoutMs / 1000} s after the packet` });
    }, timeoutMs);
    const end = (outcome: BadCloseOutcome) => {
      clearTimeout(timer);
      resolve(outcome);
    };
    ws.on('open', () => ws.send(encodeCloseExistingConnection("x'--", 'a'.repeat(32))));
    ws.on('unexpected-response', (_request, response) => end({ refusedUpgrade: response.statusCode ?? 0 }));
    ws.on('close', (code) => end({ closed: code }));
    ws.on('error', (error) => end({ error: error.message }));
  });
}

async function main(argv: string[]): Promise<number> {
  const [gatewayUrl, routeKey, origin = 'http://localhost:5174'] = argv;
  if (gatewayUrl === undefined || routeKey === undefined) {
    console.error('Usage: npx tsx apps/gateway/scripts/sendBadClose.ts <gateway URL> <certifier route key> [origin]');
    return 2;
  }
  const outcome = await sendBadClose(gatewayUrl, routeKey, origin);
  if ('closed' in outcome && outcome.closed === CloseCode.FORBIDDEN_PACKET) {
    console.log(`refused (${CloseCode.FORBIDDEN_PACKET})`);
    return 0;
  }
  if ('closed' in outcome) console.log(`not refused: the gateway closed with ${outcome.closed}, not ${CloseCode.FORBIDDEN_PACKET}`);
  else if ('refusedUpgrade' in outcome) {
    console.log(`the gateway refused the connection itself (HTTP ${outcome.refusedUpgrade}): pass one of its allowedOrigins as the third argument`);
  } else console.log(`could not check: ${outcome.error}`);
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

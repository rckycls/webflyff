// What the live tests (lobby.live.test.ts, world.live.test.ts) share about connecting to the game servers.
//
// The servers' connection-flood limiter is why every connection waits for the one before. Until the certifier and the
// login server are rebuilt with flood-limiter-gateway.patch and list this PC in a `Gateway` line
// (server-patches/README.md), their accept limiter counts connections from one address that arrive less than 200 ms
// apart. After 50 of them it cuts every connection from that address (here: this PC, the gateway's address) for about
// 10 minutes, and the count never decays. So every connection waits until 300 ms after the one before, the tests end
// every flow, with its connections closed, before the next starts where they can, and none of them may be looped.
import { connect } from 'node:net';

/** The accept limiter counts arrivals less than 200 ms apart; stay well clear of that. */
export const CONNECT_GAP_MS = 300;

let lastConnectAt = 0;

/** Resolves once at least `CONNECT_GAP_MS` have passed since the previous connection was started, by anyone in this process. */
export async function waitForConnectGap(): Promise<void> {
  const wait = lastConnectAt + CONNECT_GAP_MS - Date.now();
  lastConnectAt = Date.now() + Math.max(0, wait); // takes the slot at once, so two callers cannot share one
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/**
 * A bare connection to the certifier's real address, so that servers which are not running are reported as such and not
 * as a failed login. It counts as a connection for `waitForConnectGap`. `label` starts the message ("Live test"),
 * `command` is what to run again.
 */
export function checkReachable(label: string, host: string, port: number, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const fail = (why: string): void => {
      socket.destroy();
      reject(new Error(
        `${label}: the certifier is not reachable at ${host}:${port} (${why}). Start the game servers (the certifier and `
        + `the others in Program\\), check the routes in live.config.json, and run \`${command}\` again.`,
      ));
    };
    socket.setTimeout(3000, () => fail('no answer within 3 s'));
    socket.once('error', (error) => fail(error.message));
    socket.once('connect', () => {
      socket.destroy();
      lastConnectAt = Date.now();
      resolve();
    });
  });
}

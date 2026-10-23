import { onTestFailed } from 'vitest';
import type { GatewayConfig } from '@flyffweb/gateway/src/config';
import { startGateway } from '@flyffweb/gateway/src/server';
import type { Gateway } from '@flyffweb/gateway/src/server';

/** The gateway a live test runs inside its own process, and what it logged (the addresses, routes and close codes; never packet contents). */
export interface LiveGateway {
  gateway: Gateway;
  log: string[];
}

/** Starts the gateway; `label` starts the message of a port that is taken ("Live test"). */
export async function startLiveGateway(label: string, config: GatewayConfig): Promise<LiveGateway> {
  const log: string[] = [];
  try {
    return { gateway: await startGateway(config, { info: (line) => { log.push(line); } }), log };
  } catch (error) {
    const { host, port } = config.listen;
    throw new Error(`${label}: the gateway cannot listen on ${host}:${port}: ${(error as Error).message}. Is the port taken? Change gateway.listen.port in live.config.json.`);
  }
}

/** Call from `beforeEach`: what the gateway saw often explains a failure. A connection's close line is written after the test that opened it has ended, so the last one is not in yet. */
export function printGatewayLogOnFailure(log: readonly string[]): void {
  onTestFailed(() => {
    console.error(`Gateway log so far:\n${log.join('\n')}`);
  });
}

// What the gateway lets one connection send, for the tests of inputs a player can repeat (Piece 6 spec §3.1).

/**
 * The most packets one repeatable input may send in any one second: half of the gateway's limit, which closes a
 * connection after more than 100 packets in a sliding second (`apps/gateway/src/config.ts:31`, `relay.ts:107`), so that
 * chat and the rest still fit.
 */
export const TRAFFIC_BUDGET = 50;

/**
 * The most packets sent within any 60 consecutive rules steps (one second at 60 Hz); `stepsOfPackets` holds the rules
 * step at which each packet was sent. 0 for none.
 */
export function busiestSecond(stepsOfPackets: readonly number[]): number {
  let most = 0;
  for (const step of stepsOfPackets) {
    const inSecond = stepsOfPackets.filter((at) => at > step - 60 && at <= step).length;
    if (inSecond > most) most = inSecond;
  }
  return most;
}

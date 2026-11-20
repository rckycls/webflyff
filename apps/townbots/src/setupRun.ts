// The setup run: each bot in turn logs in (its character made if it has none), gets its level and job by the GM line
// (`setupCommands`) unless it has them already, and logs out. The accounts are GM for this run only (the install script
// sets that and puts it back). Returns the names that failed.
import type { BotBody } from './body';
import type { Log } from './log';
import type { TownBotsSettings } from './settings';
import { setupCommands } from './setup';

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** After entering, the JOIN's numbers are in; a moment for the rest (ms). */
const SETTLE_MS = 3_000;
const LINE_GAP_MS = 1_500;
const LEVEL_WAIT_MS = 15_000;

export async function runSetup(
  settings: TownBotsSettings, bodyFor: (index: number) => BotBody, jobTitle: (job: number) => string, log: Log,
): Promise<string[]> {
  const failed: string[] = [];
  for (let i = 0; i < settings.bots.length; i++) {
    const spec = settings.bots[i]!;
    const body = bodyFor(i);
    try {
      await body.enter({ create: true });
      await sleep(SETTLE_MS);
      const own = body.own();
      if (own === undefined) throw new Error('its own numbers did not come');
      if (own.level === spec.level && own.job === spec.job) {
        log(`setup ${spec.name}: level ${spec.level}, job ${spec.job} already`);
      } else {
        for (const line of setupCommands(spec, jobTitle, settings.setup.skillLines)) {
          body.session?.sendChat('nearby', line);
          await sleep(LINE_GAP_MS);
        }
        const deadline = Date.now() + LEVEL_WAIT_MS;
        while (Date.now() < deadline && !(body.own()?.level === spec.level && body.own()?.job === spec.job)) await sleep(500);
        const now = body.own();
        if (now?.level !== spec.level || now.job !== spec.job) throw new Error(`still level ${now?.level} job ${now?.job} (is the account GM for the setup?)`);
        log(`setup ${spec.name}: level ${spec.level}, job ${spec.job} set`);
      }
    } catch (error) {
      failed.push(spec.name);
      log(`setup ${spec.name} (${spec.account}) failed: ${(error as Error).message}`);
    } finally {
      await body.leave();
      await sleep(2_000);
    }
  }
  return failed;
}

// The bots' loop: logins through the scheduler (one at a time, a few seconds apart, waiting longer after each failure),
// and the world screen's frame loop without a screen: the rules steps owed by the real clock (`FixedStepper`, 60 a
// second) for every bot in the world. A bot that throws is logged (once a minute at most) and the others go on.
import { FixedStepper } from '@flyffweb/client/src/world/sim/stepper';
import { LoginScheduler } from './scheduler';

export interface BotHandle {
  readonly name: string;
  enter(): Promise<void>;
  leave(): Promise<void>;
  playing(): boolean;
  frame(): void;
  step(): void;
  /** Set by the runner: the bot's session ended while it was in the world. */
  onEnded: ((message: string) => void) | undefined;
}

export interface RunnerDeps {
  now(): number;
  log(line: string): void;
}

const PUMP_MS = 250;
const LOOP_MS = 8;
const ERROR_EVERY_MS = 60_000;

export class Runner {
  private readonly scheduler: LoginScheduler;
  private readonly byName = new Map<string, BotHandle>();
  private readonly entering = new Set<string>();
  private readonly lastError = new Map<string, number>();
  private readonly stepper = new FixedStepper();
  private pumpTimer: ReturnType<typeof setInterval> | undefined;
  private loopTimer: ReturnType<typeof setInterval> | undefined;
  private last = performance.now();
  private stopping = false;

  constructor(private readonly handles: readonly BotHandle[], private readonly deps: RunnerDeps) {
    this.scheduler = new LoginScheduler(deps.now);
    for (const handle of handles) {
      this.byName.set(handle.name, handle);
      this.scheduler.add(handle.name);
      handle.onEnded = (message) => {
        if (this.stopping) return;
        deps.log(`${handle.name} left the world: ${message}`);
        this.scheduler.ended(handle.name);
      };
    }
  }

  /** Starts the logins and the rules loop. */
  start(): void {
    this.pumpTimer = setInterval(() => void this.pump(), PUMP_MS);
    this.last = performance.now();
    this.loopTimer = setInterval(() => this.loop(), LOOP_MS);
  }

  /** Hands out the next login, if one is due. Resolves once that login settled (tests await it; the timer does not). */
  async pump(): Promise<void> {
    if (this.stopping) return;
    const name = this.scheduler.next();
    if (name === undefined) return;
    const handle = this.byName.get(name)!;
    this.entering.add(name);
    try {
      await handle.enter();
      if (this.stopping) return;
      this.scheduler.entered(name);
      this.deps.log(`${name} entered`);
    } catch (error) {
      this.deps.log(`${name} could not enter: ${(error as Error).message}`);
      this.scheduler.failed(name);
    } finally {
      this.entering.delete(name);
    }
  }

  /** Stops logging in and stepping, and leaves every bot (both connections closed). */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pumpTimer !== undefined) clearInterval(this.pumpTimer);
    if (this.loopTimer !== undefined) clearInterval(this.loopTimer);
    await Promise.all(this.handles.map((handle) => handle.leave().catch((error: Error) => this.deps.log(`${handle.name} leave: ${error.message}`))));
  }

  private loop(): void {
    const now = performance.now();
    const steps = this.stepper.advance((now - this.last) / 1000);
    this.last = now;
    for (const handle of this.handles) if (handle.playing()) this.guard(handle, () => handle.frame());
    for (let i = 0; i < steps; i++) {
      for (const handle of this.handles) if (handle.playing()) this.guard(handle, () => handle.step());
    }
  }

  private guard(handle: BotHandle, run: () => void): void {
    try {
      run();
    } catch (error) {
      const now = this.deps.now();
      if (now - (this.lastError.get(handle.name) ?? -Infinity) >= ERROR_EVERY_MS) {
        this.lastError.set(handle.name, now);
        this.deps.log(`${handle.name}: a step failed: ${(error as Error).stack ?? (error as Error).message}`);
      }
    }
  }
}

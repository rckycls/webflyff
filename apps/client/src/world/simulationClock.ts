import { FixedStepper } from './sim/stepper';

interface PulseSource { addEventListener(type: 'message', listener: () => void): void; terminate(): void }

/** Gameplay time is independent of requestAnimationFrame, which stops in hidden tabs. */
export class SimulationClock {
  private readonly worker: PulseSource;
  private readonly stepper = new FixedStepper();
  constructor(tick: (steps: number, now: number) => void, paused: () => boolean,
    factory: () => PulseSource = () => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }),
    now: () => number = () => performance.now()) {
    let last = now();
    this.worker = factory();
    this.worker.addEventListener('message', () => {
      const time = now(), dt = (time - last) / 1000; last = time;
      if (paused()) return;
      const steps = this.stepper.advance(dt);
      if (steps > 0) tick(steps, time);
    });
  }
  dispose(): void { this.worker.terminate(); }
}

import { expect, it, vi } from 'vitest';
import { SimulationClock } from '../src/world/simulationClock';

it('advances simulation without render callbacks, respects manual pause and terminates its worker', () => {
  let now = 0, paused = false;
  const worker = { onmessage: null as (() => void) | null, terminate: vi.fn() };
  const tick = vi.fn();
  const clock = new SimulationClock(tick, () => paused, () => ({
    addEventListener: (_type, listener) => { worker.onmessage = listener; }, terminate: worker.terminate,
  }), () => now);
  now = 100; worker.onmessage!(); expect(tick).toHaveBeenLastCalledWith(6, 100);
  paused = true; now = 300; worker.onmessage!(); expect(tick).toHaveBeenCalledTimes(1);
  paused = false; now = 400; worker.onmessage!(); expect(tick).toHaveBeenLastCalledWith(6, 400);
  clock.dispose(); expect(worker.terminate).toHaveBeenCalledOnce();
});

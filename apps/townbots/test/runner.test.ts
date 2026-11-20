import { describe, expect, it } from 'vitest';
import { LoginScheduler } from '../src/scheduler';

const SEC = 1000;
const MIN = 60 * SEC;

/** Runs the scheduler from `from` to `to` in 250 ms ticks and returns [time, bot] of every login it hands out. */
function logins(s: LoginScheduler, clock: { t: number }, from: number, to: number, onLogin: (bot: string) => void = () => {}): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  for (clock.t = from; clock.t <= to; clock.t += 250) {
    const bot = s.next();
    if (bot !== undefined) {
      out.push([clock.t, bot]);
      onLogin(bot);
    }
  }
  return out;
}

describe('LoginScheduler', () => {
  it('reconnects are staggered and back off', () => {
    const clock = { t: 0 };
    const s = new LoginScheduler(() => clock.t);
    const bots = Array.from({ length: 30 }, (_, i) => `b${i}`);
    for (const bot of bots) s.add(bot);
    // the first logins: one every 5 s
    const first = logins(s, clock, 0, 200 * SEC, (bot) => s.entered(bot));
    expect(first).toHaveLength(30);
    for (let i = 1; i < first.length; i++) expect(first[i]![0] - first[i - 1]![0]).toBeGreaterThanOrEqual(5 * SEC);

    // the World server restarts: every session ends at once, after 10 minutes in the world
    const restart = 10 * MIN;
    clock.t = restart;
    for (const bot of bots) s.ended(bot);
    const again = logins(s, clock, restart, restart + 400 * SEC, (bot) => { if (bot !== 'b0') s.entered(bot); else s.failed(bot); });
    // nobody before the first wait of 30 s, then one every 5 s at most
    expect(again[0]![0] - restart).toBeGreaterThanOrEqual(30 * SEC);
    for (let i = 1; i < again.length; i++) expect(again[i]![0] - again[i - 1]![0]).toBeGreaterThanOrEqual(5 * SEC);
    // b0 keeps failing: its waits grow 30 s, 60 s, 120 s ...
    const b0 = again.filter(([, bot]) => bot === 'b0').map(([t]) => t);
    expect(b0.length).toBeGreaterThanOrEqual(3);
    expect(b0[1]! - b0[0]!).toBeGreaterThanOrEqual(60 * SEC);
    expect(b0[2]! - b0[1]!).toBeGreaterThanOrEqual(120 * SEC);
  });

  it('caps the wait at 10 minutes', () => {
    const clock = { t: 0 };
    const s = new LoginScheduler(() => clock.t);
    s.add('b0');
    let last = 0;
    let gap = 0;
    for (let i = 0; i < 12; i++) {
      const got = logins(s, clock, last, last + 20 * MIN);
      expect(got).toHaveLength(1);
      gap = got[0]![0] - last;
      last = got[0]![0];
      clock.t = last;
      s.failed('b0');
    }
    expect(gap).toBeLessThanOrEqual(10 * MIN + SEC);
  });

  it('forgets the waits of a bot that stayed in the world half an hour', () => {
    const clock = { t: 0 };
    const s = new LoginScheduler(() => clock.t);
    s.add('b0');
    logins(s, clock, 0, 0);
    clock.t = 0;
    s.failed('b0');
    const second = logins(s, clock, 0, 5 * MIN);
    clock.t = second[0]![0];
    s.entered('b0');
    clock.t = second[0]![0] + 31 * MIN;
    s.ended('b0');
    const back = logins(s, clock, clock.t, clock.t + 5 * MIN);
    expect(back[0]![0] - (second[0]![0] + 31 * MIN)).toBeLessThan(31 * SEC);
  });

  it('never hands out a bot that is already logging in or in the world', () => {
    const clock = { t: 0 };
    const s = new LoginScheduler(() => clock.t);
    s.add('b0');
    expect(logins(s, clock, 0, 10 * MIN)).toHaveLength(1);
  });
});

describe('Runner', () => {
  function handle(name: string, calls: string[], fail = false) {
    let playing = false;
    return {
      name,
      enter: async () => { calls.push(`enter ${name}`); if (fail) throw new Error('refused'); playing = true; },
      leave: async () => { calls.push(`leave ${name}`); playing = false; },
      playing: () => playing,
      frame: () => {},
      step: () => {},
      onEnded: undefined as ((message: string) => void) | undefined,
    };
  }

  it('logs bots in through the scheduler, and stop() leaves every one', async () => {
    const { Runner } = await import('../src/runner');
    const calls: string[] = [];
    const clock = { t: 0 };
    const handles = [handle('a', calls), handle('b', calls), handle('c', calls, true)];
    const runner = new Runner(handles, { now: () => clock.t, log: () => {} });
    for (clock.t = 0; clock.t <= 20 * SEC; clock.t += 250) await runner.pump();
    expect(calls.filter((c) => c.startsWith('enter'))).toEqual(['enter a', 'enter b', 'enter c']);
    await runner.stop();
    expect(calls.filter((c) => c.startsWith('leave')).sort()).toEqual(['leave a', 'leave b', 'leave c']);
  });

  it('puts a bot whose session ended back in the queue', async () => {
    const { Runner } = await import('../src/runner');
    const calls: string[] = [];
    const clock = { t: 0 };
    const a = handle('a', calls);
    const runner = new Runner([a], { now: () => clock.t, log: () => {} });
    await runner.pump();
    a.onEnded?.('The connection to the game was lost.');
    for (clock.t = 0; clock.t <= 40 * SEC; clock.t += 250) await runner.pump();
    expect(calls.filter((c) => c.startsWith('enter'))).toEqual(['enter a', 'enter a']);
  });
});

import { describe, expect, it } from 'vitest';
import { AUTO_RUN_MS, AutoRun, AutoRunKeys, autoRunStops } from '../src/world/autoRun';

/** W pressed at `down` and let go at `up` (ms). */
function tap(rule: AutoRun, down: number, up: number): void {
  rule.forwardDown(down);
  rule.forwardUp(up);
}

describe('AutoRun (CWndWorld::ControlGround, WndWorldControlPlayer.cpp:157-193)', () => {
  it('uses the three 200 ms timers of CWndWorld (WndWorld.cpp:624-626)', () => {
    expect(AUTO_RUN_MS).toBe(200);
  });

  it('a second W within 200 ms of the first one let go locks the walk forward', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    expect(rule.on).toBe(false);
    tap(rule, 1200, 1260);
    expect(rule.on).toBe(true);
  });

  it('the first press may be held as long as it likes; only the gap counts', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 3000);
    tap(rule, 3150, 3200);
    expect(rule.on).toBe(true);
  });

  it('a gap of 200 ms or more is two single presses', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    tap(rule, 1280, 1330);
    expect(rule.on).toBe(false);
  });

  it('a second press held 200 ms or more is a plain walk: the lock is off as it is let go', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    rule.forwardDown(1150);
    expect(rule.on).toBe(true);
    rule.forwardUp(1350);
    expect(rule.on).toBe(false);
  });

  it('a later W press stops it (m_timerAutoRunBlock out)', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    tap(rule, 1150, 1200);
    rule.forwardDown(5000);
    expect(rule.on).toBe(false);
  });

  it('a quick third press keeps it on (m_nDubleUp 2 again)', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    tap(rule, 1150, 1200);
    tap(rule, 1300, 1340);
    expect(rule.on).toBe(true);
  });

  it('S stops it (bDown, :157-160)', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    tap(rule, 1150, 1200);
    rule.backDown();
    expect(rule.on).toBe(false);
  });

  it('stop() stops it, and a fresh double press locks again', () => {
    const rule = new AutoRun();
    tap(rule, 1000, 1080);
    tap(rule, 1150, 1200);
    rule.stop();
    expect(rule.on).toBe(false);
    tap(rule, 4000, 4050);
    tap(rule, 4100, 4150);
    expect(rule.on).toBe(true);
  });
});

describe('autoRunStops', () => {
  const none = {
    dead: false, sitting: false, flying: false, tapped: false, attacking: false,
  };
  it('goes on with nothing that stops it', () => {
    expect(autoRunStops(none)).toBe(false);
  });
  it('stops for a death, sitting, a take-off, a click-to-move and an attack', () => {
    for (const key of Object.keys(none) as Array<keyof typeof none>) {
      expect(autoRunStops({ ...none, [key]: true })).toBe(true);
    }
  });
});

describe('AutoRunKeys', () => {
  function make() {
    const listeners = new Map<string, (event: unknown) => void>();
    const target = {
      addEventListener: (type: string, listener: (event: unknown) => void) => void listeners.set(type, listener),
      removeEventListener: (type: string) => void listeners.delete(type),
    };
    const keys = new AutoRunKeys(target as unknown as EventTarget);
    const send = (type: string, code: string, timeStamp: number, extra: object = {}): void =>
      listeners.get(type)!({ code, timeStamp, repeat: false, target: null, ...extra });
    return { keys, send, listeners };
  }

  it('reads W and S by their place, with the events\' times', () => {
    const { keys, send } = make();
    send('keydown', 'KeyW', 100); send('keyup', 'KeyW', 160);
    send('keydown', 'KeyW', 250); send('keyup', 'KeyW', 300);
    expect(keys.on).toBe(true);
    send('keydown', 'KeyS', 900);
    expect(keys.on).toBe(false);
  });

  it('ignores the key\'s repeat and keys typed in a field', () => {
    const { keys, send } = make();
    send('keydown', 'KeyW', 100); send('keyup', 'KeyW', 160);
    send('keydown', 'KeyW', 250, { repeat: true });
    expect(keys.on).toBe(false);
    send('keydown', 'KeyW', 260, { target: { tagName: 'INPUT' } });
    expect(keys.on).toBe(false);
  });

  it('a window\'s key hold or a blur does not stop it; dispose removes its listeners', () => {
    const { keys, send, listeners } = make();
    send('keydown', 'KeyW', 100); send('keyup', 'KeyW', 160);
    send('keydown', 'KeyW', 250); send('keyup', 'KeyW', 300);
    expect(listeners.has('blur')).toBe(false);
    expect(keys.on).toBe(true);
    keys.dispose();
    expect(listeners.size).toBe(0);
  });
});

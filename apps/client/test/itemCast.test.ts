import { describe, expect, it } from 'vitest';
import { ItemCast } from '../src/world/items/itemCast';
import type { Mover } from '../src/world/WorldState';

function rig(stateMode: number) {
  const own = { stateMode } as Mover;
  let cancels = 0;
  const cast = new ItemCast(() => own, { sendStateModeCancel: () => void cancels++ });
  return { own, cast, cancels: () => cancels };
}

describe('ItemCast: the own cast and its cancel (SendStateModeCancel, DPClient.cpp:9736-9742; Piece 7 M3)', () => {
  it('interrupt sends one cancel a cast', () => {
    const r = rig(4);
    expect(r.cast.casting).toBe(true);
    expect(r.cast.interrupt()).toBe(true);
    expect(r.cast.interrupt()).toBe(true);
    expect(r.cast.interrupt()).toBe(true);
    expect(r.cancels()).toBe(1);
  });

  it('a new cast re-arms it', () => {
    const r = rig(4);
    r.cast.interrupt();
    r.cast.started();
    r.cast.interrupt();
    expect(r.cancels()).toBe(2);
  });

  it('a cast that ended and began again re-arms it too', () => {
    const r = rig(4);
    r.cast.interrupt();
    r.own.stateMode = 0; // the server's CANCEL
    expect(r.cast.interrupt()).toBe(false);
    r.own.stateMode = 4; // the next ON
    r.cast.interrupt();
    expect(r.cancels()).toBe(2);
  });

  it('not casting, interrupt sends nothing and returns false', () => {
    const r = rig(0x20); // another mode bit
    expect(r.cast.casting).toBe(false);
    expect(r.cast.interrupt()).toBe(false);
    expect(r.cancels()).toBe(0);
    const none = new ItemCast(() => undefined, { sendStateModeCancel: () => { throw new Error('sent'); } });
    expect(none.interrupt()).toBe(false);
  });
});

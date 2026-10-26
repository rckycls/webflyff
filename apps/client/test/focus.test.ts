import { describe, expect, it } from 'vitest';
import { NULL_ID } from '@flyffweb/protocol';
import { Focus } from '../src/world/combat/focus';

type Sent = Array<[number, 1 | 2]>;

/** A focus over a session that records the SETTARGETs it is asked to send. */
function rig(isLive?: (objectId: number) => boolean) {
  const sent: Sent = [];
  const session = { sendSetTarget: (targetId: number, clear: 1 | 2): void => void sent.push([targetId, clear]) };
  return { focus: new Focus(session, isLive), sent };
}

describe('Focus (CWorld::SetObjFocus, World.cpp:253-359)', () => {
  it('focusing a mover sends SETTARGET with 2', () => {
    const { focus, sent } = rig();
    expect(focus.targetId).toBeNull();
    focus.select(7);
    expect(focus.targetId).toBe(7);
    expect(sent).toEqual([[7, 2]]);
  });

  it('moving the focus releases the old target with 1, then focuses the new one with 2', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.select(9);
    expect(focus.targetId).toBe(9);
    expect(sent).toEqual([[7, 2], [7, 1], [9, 2]]);
  });

  it('selecting the mover already focused sends nothing', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.select(7);
    expect(sent).toEqual([[7, 2]]);
    expect(focus.targetId).toBe(7);
  });

  it('clearing releases the old target with 1, then sends NULL_ID with 2', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.select(null);
    expect(focus.targetId).toBeNull();
    expect(NULL_ID).toBe(0xffffffff);
    expect(sent).toEqual([[7, 2], [7, 1], [0xffffffff, 2]]);
  });

  it('clearing with nothing focused sends nothing', () => {
    const { focus, sent } = rig();
    focus.select(null);
    expect(sent).toEqual([]);
    focus.select(7);
    focus.select(null);
    sent.length = 0;
    focus.select(null);
    expect(sent).toEqual([]);
  });

  it('does not release a target that is no longer live (IsLive), but still sends the new focus or the clear', () => {
    let live = true;
    const { focus, sent } = rig(() => live);
    focus.select(7);
    live = false;
    focus.select(9);
    expect(sent).toEqual([[7, 2], [9, 2]]);
    focus.select(null);
    expect(sent).toEqual([[7, 2], [9, 2], [0xffffffff, 2]]);
  });

  it('asks the liveness of the target that was focused', () => {
    const asked: number[] = [];
    const { focus } = rig((id) => {
      asked.push(id);
      return true;
    });
    focus.select(7);
    expect(asked).toEqual([]);
    focus.select(9);
    expect(asked).toEqual([7]);
  });

  it('clearing drops the queued next target, and moving the focus keeps it', () => {
    const { focus } = rig();
    focus.select(7);
    focus.next = 9;
    focus.select(8);
    expect(focus.next).toBe(9);
    focus.select(null);
    expect(focus.next).toBeNull();
  });

  it('onRemoved of the target clears the focus and takes the next target', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.next = 9;
    sent.length = 0;
    focus.onRemoved(7);
    expect(focus.targetId).toBe(9);
    expect(focus.next).toBeNull();
    // SetObjFocus( NULL ), then SetNextTarget's SetObjFocus( next )
    expect(sent).toEqual([[7, 1], [0xffffffff, 2], [9, 2]]);
  });

  it('onRemoved of the target with no next target just clears', () => {
    const { focus, sent } = rig();
    focus.select(7);
    sent.length = 0;
    focus.onRemoved(7);
    expect(focus.targetId).toBeNull();
    expect(sent).toEqual([[7, 1], [0xffffffff, 2]]);
  });

  it('onRemoved for a DEL_OBJ clears the focus and drops the next target (CWorld::Process, World.cpp:892-893)', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.next = 9;
    sent.length = 0;
    focus.onRemoved(7, false);
    expect(focus.targetId).toBeNull();
    expect(focus.next).toBeNull();
    expect(sent).toEqual([[7, 1], [0xffffffff, 2]]);
  });

  it('onRemoved of another mover leaves the focus, and drops it from the next target', () => {
    const { focus, sent } = rig();
    focus.select(7);
    focus.next = 9;
    sent.length = 0;
    focus.onRemoved(5);
    expect(focus.targetId).toBe(7);
    expect(focus.next).toBe(9);
    focus.onRemoved(9);
    expect(focus.targetId).toBe(7);
    expect(focus.next).toBeNull();
    expect(sent).toEqual([]);
  });

  it('onRemoved with nothing focused does nothing', () => {
    const { focus, sent } = rig();
    focus.onRemoved(7);
    focus.onRemoved(7, false);
    expect(focus.targetId).toBeNull();
    expect(sent).toEqual([]);
  });
});

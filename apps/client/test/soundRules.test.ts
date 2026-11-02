import { describe, expect, it } from 'vitest';
import {
  SoundCopies, audible, effectsGain, equipSound, listenerAngle, musicGain, pannerPosition, placeSound, soundAt,
} from '../src/world/sound/soundRules';

const O = { x: 0, y: 0, z: 0 };

describe('placeSound (CSoundManager::Play, dsutil.cpp:262-288)', () => {
  it('places a sound by its bearing from north less the listener\'s angle, cut to whole metres', () => {
    expect(placeSound({ x: 0, y: 0, z: 10 }, O, 0)).toEqual({ x: 0, y: 0, z: 10 });
    expect(placeSound({ x: 10, y: 0, z: 0 }, O, 0)).toEqual({ x: 10, y: 0, z: 0 });
    expect(placeSound({ x: -10, y: 0, z: 0 }, O, 0)).toEqual({ x: -10, y: 0, z: 0 });
    expect(placeSound({ x: 0, y: 0, z: 10 }, O, 90)).toEqual({ x: -10, y: 0, z: 0 });
    expect(placeSound({ x: 3.9, y: 2.7, z: 0 }, O, 0)).toEqual({ x: 3, y: 2, z: 0 });
    expect(placeSound({ x: 0.5, y: 0, z: 0.5 }, O, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('plays nothing more than 100 m away across the ground, whatever the height', () => {
    expect(placeSound({ x: 100.5, y: 0, z: 0 }, O, 0)).toBeNull();
    expect(placeSound({ x: 99, y: 500, z: 0 }, O, 0)).not.toBeNull();
  });

  it('is silent beyond 70 m (DSBCAPS_MUTE3DATMAXDISTANCE, :383)', () => {
    expect(audible({ x: 70, y: 0, z: 0 })).toBe(true);
    expect(audible({ x: 0, y: 70.1, z: 0 })).toBe(false);
  });
});

describe('the listener: a sound on the camera\'s right is heard on the right', () => {
  // FlyFF positions: the camera behind the player, looking north, then east
  for (const [camera, right] of [
    [{ x: 0, y: 5, z: -5 }, { x: 10, y: 0, z: 0 }],
    [{ x: -5, y: 5, z: 0 }, { x: 0, y: 0, z: -10 }],
  ] as const) {
    it(`looking from (${camera.x}, ${camera.z})`, () => {
      const angle = listenerAngle(camera, O);
      expect(pannerPosition(placeSound(right, O, angle)!).x).toBeGreaterThan(0);
      const ahead = { x: -camera.x * 2, y: 0, z: -camera.z * 2 };
      expect(pannerPosition(placeSound(ahead, O, angle)!).z).toBeLessThan(0); // Web Audio's front is -z
    });
  }
});

describe('the volume steps (WndOptionGame.cpp:249-250, Music2.cpp:138-143)', () => {
  it('effects in hundredths of a dB, nothing at 0', () => {
    expect(effectsGain(0)).toBe(0);
    expect(effectsGain(10)).toBe(1);
    expect(effectsGain(5)).toBeCloseTo(10 ** -1.25, 6);
  });

  it('music on the linear master level', () => {
    expect(musicGain(5)).toBe(0.5);
    expect(musicGain(0)).toBe(0);
    expect(musicGain(3)).toBeCloseTo(0.3, 6);
  });
});

describe('SoundCopies (CSound::GetFreeBufferIndex, dsutil.cpp:1290-1311)', () => {
  it('plays at most 10 copies of a file', () => {
    const copies = new SoundCopies();
    for (let i = 0; i < 10; i++) expect(copies.take('sound/a.wav')).toBe(true);
    expect(copies.take('sound/a.wav')).toBe(false);
    expect(copies.take('sound/b.wav')).toBe(true);
    copies.release('sound/a.wav');
    expect(copies.take('sound/a.wav')).toBe(true);
  });
});

describe('soundAt (CModelObject::IsAttrSound, Bone.h:170-177)', () => {
  const events: Array<[number, number]> = [[0, 101], [8, 140]];
  it('fires a frame-0 sound on a motion\'s first move, and on each loop', () => {
    expect(soundAt(events, -1, 0)).toBe(101);
    expect(soundAt(events, -0.5, 0)).toBe(101); // the wrap shifts old back by the frame count
  });
  it('fires when the frame is crossed, in the attribute of the current frame', () => {
    expect(soundAt(events, 7.5, 8)).toBe(140);
    expect(soundAt(events, 7.5, 8.5)).toBe(140);
    expect(soundAt(events, 8, 8.5)).toBe(0);
  });
  it('misses a frame one move jumps over, as Neuz does', () => {
    expect(soundAt(events, 7.5, 9)).toBe(0);
  });
});

describe('equipSound (CMover::DoEquip, MoverEquip.cpp:1013-1041)', () => {
  it('by the item kind, and the inventory drop for any unequip', () => {
    expect(equipSound(1, 2, true)).toBe(8); // IK1_WEAPON
    expect(equipSound(3, 13, true)).toBe(11); // IK1_GENERAL + IK2_JEWELRY
    expect(equipSound(2, 9, true)).toBe(10); // IK1_ARMOR + IK2_CLOTH
    expect(equipSound(2, 7, true)).toBe(9); // IK1_ARMOR + IK2_ARMOR
    expect(equipSound(3, 8, true)).toBe(9); // any IK2_ARMORETC
    expect(equipSound(3, 1, true)).toBe(0);
    expect(equipSound(1, 2, false)).toBe(5);
  });
});

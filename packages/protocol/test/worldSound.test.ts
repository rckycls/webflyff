import { describe, expect, it } from 'vitest';
import { ArWriter, MessageType, PacketType, WORLD_READERS, readBundle } from '../src';
import { encodeBundle, writePlayMusic, writePlaySound, writePlaySoundFile } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';

const PLAYER = 0x1234;

function read(message: ScriptMessage) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, [message]), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  return result;
}

describe('the server\'s music and sound (CDPClient::OnPlayMusic, OnPlaySound, DPClient.cpp:11736-11767)', () => {
  it('PLAYMUSIC is the music id', () => {
    const result = read(writePlayMusic(23));
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'playMusic', music: 23 }]);
  });

  it('PLAYSOUND of type 0 is the sound id', () => {
    const result = read(writePlaySound(14));
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'playSound', sound: 14 }]);
  });

  it('PLAYSOUND of type 1 reads its file name and plays no id: the server never names a file', () => {
    const result = read(writePlaySoundFile('Chaos.wav'));
    expect(result.mismatched).toEqual([]);
    expect(result.messages.map((m) => m.value)).toEqual([{ type: 'playSound', sound: null }]);
  });

  it('drops a PLAYSOUND cut short', () => {
    const fields = new ArWriter().u8(0).u16(7).toBytes();
    const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, [{ objectId: -1, type: MessageType.PLAYSOUND, fields }]), WORLD_READERS);
    expect(result.mismatched).toEqual([MessageType.PLAYSOUND]);
    expect(result.messages).toEqual([]);
  });
});

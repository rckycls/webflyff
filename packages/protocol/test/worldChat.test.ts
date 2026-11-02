import { expect, it } from 'vitest';
import { ArReader, ArWriter, WORLD_READERS, decodeWorldPacket, readBundle } from '../src/index';
import { encodeBundle } from '@flyffweb/testkit';
import { encodeChat, readChat, readShout, readWhisper, readReturnSay } from '../src/world/chat';

it('writes the native chat packet and server commands with Windows-1252 text', () => {
  for (const [channel, text] of [['nearby', 'café'], ['whisper', '/whisper Rocky café'], ['shout', '/shout café']] as const) {
    const r = new ArReader(encodeChat(channel, 'café', 'Rocky'));
    expect(r.u32()).toBe(0xffffffff); expect(r.u32()).toBe(0xff0000);
    expect(r.string(1023)).toBe(text); r.expectEnd();
  }
  expect(() => encodeChat('whisper', 'hello', '')).toThrow();
  expect(() => encodeChat('nearby', '🙂')).toThrow();
  expect(() => encodeChat('shout', 'x'.repeat(260))).toThrow();
  expect(() => encodeChat('nearby', 'a\nb')).toThrow();
});
it('isolates malformed optional chat and unsupported NPC replies from the next indexed message', () => {
  const bytes = encodeBundle(0xffffff00, 9, [
    { objectId: 9, type: 1, fields: new ArWriter().i32(1024).toBytes() },
    { objectId: 7, type: 0x24, fields: new ArWriter().u16(0xffff).toBytes() },
    { objectId: 9, type: 1, fields: new ArWriter().string('Still playing').toBytes() },
  ]);
  const result = readBundle(bytes, WORLD_READERS);
  expect(result.mismatched).toEqual([1, 0x24]);
  expect(result.messages.map((entry) => entry.value)).toEqual([{ type: 'chat', text: 'Still playing' }]);
});
it('reads nearby, shout, whisper and refusal with bounded strings', () => {
  expect(readChat(new ArReader(new ArWriter().string('hello').toBytes()))).toEqual({ type: 'chat', text: 'hello' });
  const shout = new ArWriter().u32(3).string('Rocky').string('hello').u32(0xffff99cc).toBytes();
  expect(readShout(new ArReader(shout))).toMatchObject({ type: 'shout', sender: 'Rocky', text: 'hello' });
  const whisper = new ArWriter().string('Rocky').string('Webby').string('hi').u32(1).u32(2).i32(0).toBytes();
  expect(readWhisper(new ArReader(whisper))).toMatchObject({ type: 'whisper', sender: 'Rocky', recipient: 'Webby', text: 'hi' });
  expect(decodeWorldPacket(new ArWriter().u32(0xff00d4).bytes(whisper).toBytes())).toMatchObject({ type: 'whisper', text: 'hi' });
  expect(readReturnSay(new ArReader(new ArWriter().i32(3).string('Missing').toBytes()))).toEqual({ type: 'chatReturn', flag: 3, text: 'Missing' });
  expect(() => readChat(new ArReader(new ArWriter().i32(1024).toBytes()))).toThrow();
  expect(() => readWhisper(new ArReader(whisper.slice(0, -1)))).toThrow();
  for (const type of [1, 0xd0, 0xa9]) expect(WORLD_READERS.has(type)).toBe(true);
});

it('reads native party, guild, GM and announcement routes and sends social commands', () => {
  const party = WORLD_READERS.get(0x69)!(new ArReader(new ArWriter().u32(1).string('Party').string('hello').toBytes()), { objectId: 1, playerObjectId: 1 });
  expect(party).toMatchObject({ type: 'party', sender: 'Party', text: 'hello' });
  expect(decodeWorldPacket(new ArWriter().u32(0xffffff39).u32(1).string('Guild').string('hello').toBytes())).toMatchObject({ type: 'guild', sender: 'Guild' });
  expect(decodeWorldPacket(new ArWriter().u32(0xff00ed).string('GM').string('Player').string('notice').toBytes())).toMatchObject({ type: 'system', sender: 'GM', text: 'notice' });
  expect(WORLD_READERS.get(0xa0)!(new ArReader(new ArWriter().string('event').toBytes()), { objectId: 1, playerObjectId: 1 })).toMatchObject({ type: 'announcement', text: 'event' });
  expect(() => WORLD_READERS.get(0x4f)!(new ArReader(new ArWriter().i32(1025).toBytes()), { objectId: 1, playerObjectId: 1 })).toThrow();
  for (const [channel, command] of [['party', '/partychat hello'], ['guild', '/GuildChat hello']] as const) {
    const r = new ArReader(encodeChat(channel, 'hello')); r.bytes(8); expect(r.string(1024)).toBe(command); r.expectEnd();
  }
});

import { beforeAll, describe, expect, it } from 'vitest';
import {
  ArReader, ArWriter, DPID_UNKNOWN, PacketType, Port, bytesToHex, decodeCertifierMessage, decodeLoginMessage,
  deleteKey, encodeCreatePlayer, encodeDeletePlayer, encodeGetPlayerList, encodeQueryTickCount, hashPassword,
  hexToBytes, PROTOCOL_VERSION,
} from '../src';
import type { NewCharacter, Recording } from '../src';
import { decodeCreatePlayer, decodeDeletePlayer } from './helpers/clientDecoders';
import { hasRecording, loadRecording, packetsFor, typeOf } from './helpers/fixtures';

const oneCharacterList = () => new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(1)
  .i32(0).i32(1).u32(1).u32(11).string('Webby').vec3([6968, 100, 3328])
  .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0xff907b6d).u32(1).u8(0).i32(0).i32(15).u32(0)
  .i32(15).i32(15).i32(15).i32(15).u32(0).i32(2).u32(502).u32(503)
  .i32(1).u8(0).u32(0).i32(1).u32(900).i32(0).u32(1).toBytes();

describe('login messages', () => {
  it('starts client packets with DPID_UNKNOWN, then the type', () => {
    expect(bytesToHex(encodeGetPlayerList(7, 'webtester', 'h', 1)).slice(0, 16)).toBe('fffffffff6000000');
  });
  it('decodes PLAYER_LIST in the CDPLoginClient::OnPlayerList order', () => {
    const m = decodeLoginMessage(oneCharacterList());
    if (m.type !== 'playerList') throw new Error(m.type);
    expect(m.authKey).toBe(7);
    expect(m.characters[0]).toMatchObject({ slot: 0, name: 'Webby', position: [6968, 100, 3328], playerId: 500, level: 15, equipment: [502, 503] });
    expect(m.messengers).toEqual([{ slot: 0, state: 0, friends: [{ id: 900, blocked: 0, state: 1 }] }]);
  });
  it('round-trips CREATE_PLAYER and DEL_PLAYER field order', () => {
    const c: NewCharacter = { slot: 2, name: 'WebTest1', face: 0, costume: 0, skinSet: 0, hairMesh: 3, hairColor: 0xff966455, sex: 1, job: 0, headMesh: 4, bankPin: 1234 };
    expect(decodeCreatePlayer(encodeCreatePlayer('webtester', 'h', c, 7))).toEqual({ account: 'webtester', hash: 'h', character: c, authKey: 7 });
    expect(decodeDeletePlayer(encodeDeletePlayer('webtester', 'h', deleteKey('1234'), 500, 7, [900])))
      .toEqual({ account: 'webtester', hash: 'h', key: 'cbad55c0bf841aef57382b0d33440620', playerId: 500, authKey: 7, friendIds: [900] });
  });
});

describe('login message decoding', () => {
  it('reads every field of every character, and a list of none', () => {
    const m = decodeLoginMessage(oneCharacterList());
    if (m.type !== 'playerList') throw new Error(m.type);
    expect(m.characters).toEqual([{
      slot: 0, blocked: 1, worldId: 1, index: 11, name: 'Webby', position: [6968, 100, 3328],
      playerId: 500, partyId: 0, guildId: 0, warId: 0, skinSet: 0, hairMesh: 2, hairColor: 0xff907b6d, headMesh: 1,
      sex: 0, job: 0, level: 15, jobLevel: 0, str: 15, sta: 15, dex: 15, int: 15, mode: 0, equipment: [502, 503],
    }]);
    const empty = new ArWriter().u32(PacketType.PLAYER_LIST).u32(9).i32(0).i32(0).toBytes();
    expect(decodeLoginMessage(empty)).toEqual({ type: 'playerList', authKey: 9, characters: [], messengers: [] });
  });
  it('keeps unsigned fields unsigned and signed ones signed', () => {
    const body = new ArWriter().u32(PacketType.PLAYER_LIST).u32(0xfffffffe).i32(1)
      .i32(2).i32(-1).u32(0xffffffff).u32(0xfffffffd).string('Edge').vec3([-1.5, 0, 2.25])
      .u32(0xfffffffc).u32(0xffffffff).u32(0xffffffff).u32(0xffffffff).u32(0).u32(0).u32(0xff966455).u32(0).u8(255)
      .i32(-3).i32(-4).u32(0xfffffff0).i32(-5).i32(-6).i32(-7).i32(-8).u32(0x80000000).i32(0)
      .i32(1).u8(2).u32(0xfffffff1).i32(1).u32(0xfffffff2).i32(-1).u32(0xfffffff3).toBytes();
    const m = decodeLoginMessage(body);
    if (m.type !== 'playerList') throw new Error(m.type);
    expect(m.authKey).toBe(0xfffffffe);
    expect(m.characters[0]).toMatchObject({
      slot: 2, blocked: -1, worldId: 0xffffffff, index: 0xfffffffd, position: [-1.5, 0, 2.25], playerId: 0xfffffffc,
      partyId: 0xffffffff, hairColor: 0xff966455, sex: 255, job: -3, level: -4, jobLevel: 0xfffffff0,
      str: -5, sta: -6, dex: -7, int: -8, mode: 0x80000000, equipment: [],
    });
    expect(m.messengers).toEqual([{ slot: 2, state: 0xfffffff1, friends: [{ id: 0xfffffff2, blocked: -1, state: 0xfffffff3 }] }]);
  });
  it('decodes the other replies', () => {
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.ERROR).i32(133).toBytes())).toEqual({ type: 'error', code: 133 });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.CACHE_ADDR).string('172.31.238.55').toBytes()))
      .toEqual({ type: 'cacheAddr', address: '172.31.238.55' });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(1234).i64(-5n).toBytes()))
      .toEqual({ type: 'queryTickCount', sentAt: 1234, tickCount: -5n });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(0xfffffffe).i64(0x7fffffffffffffffn).toBytes()))
      .toEqual({ type: 'queryTickCount', sentAt: 0xfffffffe, tickCount: 0x7fffffffffffffffn });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.PING).u32(99).toBytes())).toEqual({ type: 'ping', sentAt: 99 });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.ONE_HOUR_NOTIFY).toBytes())).toEqual({ type: 'oneHourNotify' });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.LOGIN_PROTECT_NUMPAD).u32(31).toBytes()))
      .toEqual({ type: 'loginNumPad', numPadId: 31 });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.LOGIN_PROTECT_CERT).i32(1).u32(32).toBytes()))
      .toEqual({ type: 'loginProtect', ok: true, numPadId: 32 });
    expect(decodeLoginMessage(new ArWriter().u32(PacketType.LOGIN_PROTECT_CERT).i32(0).u32(33).toBytes()))
      .toEqual({ type: 'loginProtect', ok: false, numPadId: 33 });
  });
  it('reports a type it does not know instead of throwing', () => {
    expect(decodeLoginMessage(hexToBytes('99000000aabbcc'))).toEqual({ type: 'unknown', packetType: 0x99 });
  });
  it('rejects trailing bytes on every known type', () => {
    const bodies = [
      oneCharacterList(),
      new ArWriter().u32(PacketType.ERROR).i32(1).toBytes(),
      new ArWriter().u32(PacketType.CACHE_ADDR).string('1.2.3.4').toBytes(),
      new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(1).i64(2n).toBytes(),
      new ArWriter().u32(PacketType.PING).u32(1).toBytes(),
      new ArWriter().u32(PacketType.ONE_HOUR_NOTIFY).toBytes(),
      new ArWriter().u32(PacketType.LOGIN_PROTECT_NUMPAD).u32(1).toBytes(),
      new ArWriter().u32(PacketType.LOGIN_PROTECT_CERT).i32(1).u32(1).toBytes(),
    ];
    for (const body of bodies) {
      expect(() => decodeLoginMessage(body)).not.toThrow();
      expect(() => decodeLoginMessage(new Uint8Array([...body, 0]))).toThrow();
    }
  });
  it('rejects a body cut short, anywhere', () => {
    const full = oneCharacterList();
    for (let length = 0; length < full.length; length++) {
      expect(() => decodeLoginMessage(full.subarray(0, length)), `cut at ${length}`).toThrow();
    }
  });
  it('rejects counts the body cannot hold', () => {
    const lyingCharacters = new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(0x7fffffff).toBytes();
    expect(() => decodeLoginMessage(lyingCharacters)).toThrow();
    const lyingEquipment = new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(1)
      .i32(0).i32(1).u32(1).u32(11).string('Webby').vec3([0, 0, 0])
      .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0).u32(1).u8(0).i32(0).i32(15).u32(0)
      .i32(15).i32(15).i32(15).i32(15).u32(0).i32(0x7fffffff).toBytes();
    expect(() => decodeLoginMessage(lyingEquipment)).toThrow();
    const lyingMessengers = new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(0).i32(1).u8(0).u32(0).i32(0x7fffffff).toBytes();
    expect(() => decodeLoginMessage(lyingMessengers)).toThrow();
  });
  it('rejects a name or an address longer than its C++ buffer', () => {
    const named = (name: string) => new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(1)
      .i32(0).i32(1).u32(1).u32(11).string(name).vec3([0, 0, 0])
      .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0).u32(1).u8(0).i32(0).i32(15).u32(0)
      .i32(15).i32(15).i32(15).i32(15).u32(0).i32(0).i32(0).toBytes();
    expect(() => decodeLoginMessage(named('n'.repeat(63)))).not.toThrow();
    expect(() => decodeLoginMessage(named('n'.repeat(64)))).toThrow();
    expect(() => decodeLoginMessage(new ArWriter().u32(PacketType.CACHE_ADDR).string('1'.repeat(15)).toBytes())).not.toThrow();
    expect(() => decodeLoginMessage(new ArWriter().u32(PacketType.CACHE_ADDR).string('1'.repeat(16)).toBytes())).toThrow();
  });
});

describe('login encoders', () => {
  it('writes QUERYTICKCOUNT as the prefix, the type and the time', () => {
    expect(bytesToHex(encodeQueryTickCount(5))).toBe('ffffffff0b00000005000000');
    expect(bytesToHex(encodeQueryTickCount(0x1_0000_0005))).toBe('ffffffff0b00000005000000');
    expect(bytesToHex(encodeQueryTickCount(-1))).toBe('ffffffff0b000000ffffffff');
  });
  it('writes GETPLAYERLIST as version, auth key, account, hash, channel', () => {
    const r = new ArReader(encodeGetPlayerList(0xfffffff0, 'webtester', hashPassword('password1'), 3));
    expect(r.u32()).toBe(DPID_UNKNOWN);
    expect(r.u32()).toBe(PacketType.GETPLAYERLIST);
    expect(r.string(32)).toBe(PROTOCOL_VERSION);
    expect(r.u32()).toBe(0xfffffff0);
    expect(r.string(42)).toBe('webtester');
    expect(r.string(33)).toBe(hashPassword('password1'));
    expect(r.u32()).toBe(3);
    r.expectEnd();
  });
  it('writes CREATE_PLAYER with one byte per small field and the hair colour as an unsigned word', () => {
    const c: NewCharacter = { slot: 1, name: 'Ab', face: 2, costume: 3, skinSet: 4, hairMesh: 5, hairColor: 0xff966455, sex: 1, job: 0, headMesh: 6, bankPin: 1234 };
    expect(bytesToHex(encodeCreatePlayer('a', 'h', c, 7))).toBe([
      'ffffffff', 'f4000000', '01000000', '61', '01000000', '68', '01', '02000000', '4162', '02', '03', '04', '05',
      '556496ff', '01', '00', '06', 'd2040000', '07000000',
    ].join(''));
  });
  it('writes DEL_PLAYER with the friend count before the friend IDs', () => {
    const hex = bytesToHex(encodeDeletePlayer('a', 'h', 'k', 500, 7, [900, 901]));
    expect(hex).toBe([
      'ffffffff', 'f5000000', '01000000', '61', '01000000', '68', '01000000', '6b', 'f4010000', '07000000',
      '02000000', '84030000', '85030000',
    ].join(''));
    expect(bytesToHex(encodeDeletePlayer('a', 'h', 'k', 500, 7, []))).toBe(hex.slice(0, 62) + '00000000');
  });
  it('refuses a non-ASCII account or character name', () => {
    const c: NewCharacter = { slot: 0, name: 'Wébby', face: 0, costume: 0, skinSet: 0, hairMesh: 0, hairColor: 0, sex: 0, job: 0, headMesh: 0, bankPin: 0 };
    expect(() => encodeGetPlayerList(1, 'wébtester', 'h', 1)).toThrow();
    expect(() => encodeCreatePlayer('webtester', 'h', c, 1)).toThrow();
  });
});

// Needs test/fixtures/neuz-login.json, which the owner records from a real Neuz login. Without it the block is
// skipped (reported as skipped, not as a failure). Once the file exists, the first tests fail loudly if a list is
// empty or a packet the later tests re-encode is missing, so nothing here can pass because it compared nothing.
describe.skipIf(!hasRecording())('recorded Neuz session, login port', () => {
  let rec: Recording;
  let c2s: Uint8Array[];
  let s2c: Uint8Array[];
  let authKey: number;
  const bodyOfType = (type: number, name: string): Uint8Array => {
    const body = c2s.find((b) => typeOf(b) === type);
    if (body === undefined) throw new Error(`the recording has no ${name} packet from the client on the login port`);
    return body;
  };
  beforeAll(() => {
    rec = loadRecording();
    c2s = packetsFor(rec, Port.LOGIN, 'c2s').map((p) => hexToBytes(p.hex));
    s2c = packetsFor(rec, Port.LOGIN, 's2c').map((p) => hexToBytes(p.hex));
    const listPacket = packetsFor(rec, Port.CERTIFIER, 's2c').find((p) => typeOf(hexToBytes(p.hex)) === PacketType.SRVR_LIST);
    if (listPacket === undefined) throw new Error('the recording has no SRVR_LIST packet on the certifier port');
    const m = decodeCertifierMessage(hexToBytes(listPacket.hex));
    if (m.type !== 'serverList') throw new Error(m.type);
    authKey = m.authKey;
  });
  it('holds login-port packets in both directions, with the ones the later tests re-encode', () => {
    expect(c2s.length).toBeGreaterThan(0);
    expect(s2c.length).toBeGreaterThan(0);
    // bodyOfType throws a message naming the missing packet.
    bodyOfType(PacketType.GETPLAYERLIST, 'GETPLAYERLIST');
    bodyOfType(PacketType.CREATE_PLAYER, 'CREATE_PLAYER');
    bodyOfType(PacketType.DEL_PLAYER, 'DEL_PLAYER');
  });
  it('decodes every server body to a known message', () => {
    for (const body of s2c) expect(decodeLoginMessage(body).type).not.toBe('unknown');
  });
  it('re-encodes GETPLAYERLIST byte for byte', () => {
    const body = bodyOfType(PacketType.GETPLAYERLIST, 'GETPLAYERLIST');
    const channelId = new DataView(body.buffer, body.byteOffset).getUint32(body.length - 4, true);
    expect(bytesToHex(encodeGetPlayerList(authKey, rec.account, hashPassword(rec.password), channelId))).toBe(bytesToHex(body));
  });
  it('re-encodes CREATE_PLAYER and DEL_PLAYER byte for byte', () => {
    const create = bodyOfType(PacketType.CREATE_PLAYER, 'CREATE_PLAYER');
    const d = decodeCreatePlayer(create);
    expect(d.character.bankPin).toBe(Number(rec.bankPin));
    expect(bytesToHex(encodeCreatePlayer(d.account, d.hash, d.character, d.authKey))).toBe(bytesToHex(create));
    const del = bodyOfType(PacketType.DEL_PLAYER, 'DEL_PLAYER');
    const x = decodeDeletePlayer(del);
    expect(x.key).toBe(deleteKey(rec.bankPin));
    expect(bytesToHex(encodeDeletePlayer(x.account, x.hash, x.key, x.playerId, x.authKey, x.friendIds))).toBe(bytesToHex(del));
  });
  it('contains only client packet types the lobby knows', () => {
    const known = new Set<number>([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST, PacketType.CREATE_PLAYER, PacketType.DEL_PLAYER, PacketType.PING, PacketType.KEEP_ALIVE]);
    expect(c2s.length).toBeGreaterThan(0);
    expect(c2s.map(typeOf).filter((t) => !known.has(t))).toEqual([]);
  });
});

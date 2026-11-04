// Piece 7 M4: the party's writers read back by the browser's readers, message for message.
import { expect, it } from 'vitest';
import { MessageType, PacketType, WORLD_READERS, decodeWorldPacket, readBundle } from '@flyffweb/protocol';
import type { PartyBlock, Vec3, WorldMessage } from '@flyffweb/protocol';
import {
  directBlock, directErrorParty, directLogout, directUpdatePlayerData, encodeBundle, writeErrorParty, writeMyPartyName,
  writePartyChangeLeader, writePartyChangeName, writePartyChangeTroup, writePartyChat, writePartyExp, writePartyExpMode,
  writePartyItemMode, writePartyMapInfo, writePartyMember, writePartyRequest, writePartyRequestCancel, writePartySkillBlitz,
  writePartySkillCall, writePartySkillRetreat, writePartySkillSphereCircle, writeQueryPlayerData, writeSetPartyMemberParam,
  writeSetPartyMode,
} from '../src';
import type { ScriptMessage } from '../src';

const pos: Vec3 = [6968.5, 100.25, 3328.5];
const block = (kind: number, name: string): PartyBlock => ({
  partyId: 3, kind, level: 10, exp: 55, point: 7, expMode: 1, itemMode: 2, duelPartyId: 0, modeTime: [0, 1, 0, 0, 0], name,
  members: [{ playerId: 70002, removed: false }, { playerId: 500, removed: true }],
});
const record = { job: 1, level: 20, sex: 1, version: 4, login: 1 };
const leader = { id: 70002, level: 20, job: 1, sex: 0 };
const member = { id: 500, level: 15, job: 0, sex: 1 };

it('each party writer reads back as the readers read it', () => {
  const cases: Array<[ScriptMessage, WorldMessage]> = [
    [writePartyMember(1, 500, 'Lead', 'Webby', block(0, '')), { type: 'partyMember', playerId: 500, leaderName: 'Lead', memberName: 'Webby', party: block(0, '') }],
    [writePartyMember(1, 500, 'Lead', '', block(1, 'Winners')), { type: 'partyMember', playerId: 500, leaderName: 'Lead', memberName: '', party: block(1, 'Winners') }],
    [writePartyMember(1, 500, '', '', null), { type: 'partyMember', playerId: 500, leaderName: '', memberName: '', party: null }],
    [writePartyRequest(1, leader, member, 'Lead'), { type: 'partyRequest', leader, member, leaderName: 'Lead', troup: 0 }],
    [writePartyRequestCancel(1, 70002, 500, 2), { type: 'partyRequestCancel', leaderId: 70002, memberId: 500, mode: 2 }],
    [writePartyExp(1, 40, 3, 9), { type: 'partyExp', exp: 40, level: 3, point: 9 }],
    [writePartyChangeLeader(1, 500), { type: 'partyChangeLeader', leaderId: 500 }],
    [writePartyChangeTroup(1, 'Winners'), { type: 'partyChangeTroup', name: 'Winners' }],
    [writePartyChangeName(1, 'Others'), { type: 'partyChangeName', name: 'Others' }],
    [writeMyPartyName(1, 'Mine'), { type: 'myPartyName', name: 'Mine' }],
    [writePartyItemMode(1, 3), { type: 'partyItemMode', mode: 3 }],
    [writePartyExpMode(1, 1), { type: 'partyExpMode', mode: 1 }],
    [writeSetPartyMode(1, 2, 60, true, 4), { type: 'setPartyMode', mode: 2, skillTime: 60, on: true, point: 4 }],
    [writeSetPartyMode(1, 2, 0, false), { type: 'setPartyMode', mode: 2, skillTime: 0, on: false, point: null }],
    [writeSetPartyMemberParam(1, 70002, 0, 1), { type: 'setPartyMemberParam', playerId: 70002, param: 0, value: 1 }],
    [writePartyMapInfo(1, 2, pos), { type: 'partyMapInfo', index: 2, pos }],
    [writePartyChat(1, 9300, 'Lead', 'hi team'), { type: 'party', sender: 'Lead', text: 'hi team', speakerId: 9300 }],
    [writePartySkillCall(1, pos), { type: 'partySkillCall', pos }],
    [writePartySkillBlitz(1, 9001), { type: 'partySkillBlitz', targetId: 9001 }],
    [writePartySkillRetreat(1), { type: 'partySkillRetreat' }],
    [writePartySkillSphereCircle(1), { type: 'partySkillSphereCircle' }],
    [writeErrorParty(1, 207, 3), { type: 'errorParty', code: 207, skill: 3 }],
    [writeErrorParty(1, 200), { type: 'errorParty', code: 200, skill: null }],
    [writeQueryPlayerData(1, 70003, 'Faraway', record), { type: 'playerData', playerId: 70003, name: 'Faraway', data: record }],
  ];
  for (const [message, expected] of cases) {
    const result = readBundle(encodeBundle(PacketType.SNAPSHOT, 1, [message]), WORLD_READERS);
    expect(result.mismatched, expected.type).toEqual([]);
    expect(result.messages.map((m) => m.value), expected.type).toEqual([expected]);
  }
  expect(writePartyMember(1, 0, '', '', null).type).toBe(MessageType.PARTYMEMBER);
});

it('the direct packets decode as the session reads them', () => {
  expect(decodeWorldPacket(directErrorParty(204))).toEqual({ type: 'errorParty', code: 204, skill: null });
  expect(decodeWorldPacket(directUpdatePlayerData(70003, record))).toEqual({ type: 'updatePlayerData', playerId: 70003, data: record });
  expect(decodeWorldPacket(directLogout(70003))).toEqual({ type: 'playerLogout', playerId: 70003 });
  expect(decodeWorldPacket(directBlock(7, 'Webby'))).toEqual({ type: 'block', gu: 7, name: 'Webby' });
});

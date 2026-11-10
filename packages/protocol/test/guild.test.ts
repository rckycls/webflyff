// 2026-11-10: the guild's packets (guild research §4, appendix B), read as Neuz's handlers read them and written as its
// senders write them.
import { describe, expect, it } from 'vitest';
import {
  GuildPacket, NULL_ID, WORLD_READERS, decodeWorldPacket, encodeAddGuildMember, encodeChgMaster, encodeDestroyGuild,
  encodeGuildAuthority, encodeGuildClass, encodeGuildContribution, encodeGuildInvite, encodeGuildLogo,
  encodeGuildMemberLevel, encodeGuildNickname, encodeGuildNotice, encodeGuildPenya, encodeGuildSetName,
  encodeQueryPlayerData2, encodeQuerySetGuildName, encodeRemoveGuildMember, guildPacketTypeOf, isGuildMessage, readBundle,
} from '../src/index';
import type { AddedMover, AddedPlayer, GuildDirectMessage } from '../src/index';
import {
  writeAddPlayer, directAddGuildMember, directChgMaster, directGuild, directGuildClass, directGuildError, directGuildMemberLevel,
  directGuildMemberLogin, directGuildNickname, directGuildSetName, directRemoveGuildMember, encodeBundle, guildMember,
  guildWhole, writeAllGuilds, writeCreateGuild, writeDestroyGuild, writeGuild, writeGuildAuthority, writeGuildContribution,
  writeGuildInvite, writeGuildLogo, writeGuildNotice, writeGuildPenya, writeGuildRealPenya, writeSetGuild, writeSetWar,
} from '@flyffweb/testkit';

const SELF = 9;
const OTHER = 40;
const GUILD = 77;

const whole = guildWhole(GUILD, 500, 'Bakers', [
  guildMember(500, 0),
  guildMember(70002, 4, { giveGold: 1200, givePxp: 30, rankClass: 2, alias: 'Lead' }),
], { level: 4, logo: 7, gold: 99_000, notice: 'Hello\nall', power: [0xff, 0x05, 0, 0, 0x04], penya: [0, 10, 0, 0, 0] });

describe('the guild snapshots', () => {
  it('reads every guild snapshot of a bundle', () => {
    const bundle = encodeBundle(0xffffff00, SELF, [
      writeGuildInvite(SELF, GUILD, 70002),
      writeSetGuild(OTHER, GUILD),
      writeCreateGuild(500, GUILD, 'Webby', ''),
      writeDestroyGuild('Webby', GUILD),
      writeGuild(SELF, whole),
      writeAllGuilds(SELF, [whole, { ...whole, guildId: 78, name: 'Others', logo: 0 }], [[
        { logo: 7, name: 'Bakers', master: 'Webby', win: 3, lose: 1, surrender: 0, averageLevel: 61.5, winPoint: 9 },
      ]], 4),
      writeGuildLogo(GUILD, 12),
      writeGuildContribution(SELF, { guildId: GUILD, playerId: 500, pxpCount: 30, penya: 1000, guildPxpCount: 40, guildPenya: 5000, guildLevel: 2 }),
      writeGuildNotice(SELF, GUILD, 'New notice'),
      writeGuildAuthority(SELF, [0xff, 1, 2, 3, 4]),
      writeGuildPenya(SELF, 3, 250),
      writeGuildRealPenya(SELF, 400, 4),
      writeSetWar(OTHER, 6),
    ]);
    const result = readBundle(bundle, WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    const values = result.messages.map((m) => m.value);
    expect(values.every(isGuildMessage)).toBe(true);
    expect(values[0]).toEqual({ type: 'guildInvite', guildId: GUILD, inviterId: 70002 });
    expect(result.messages[1]).toMatchObject({ objectId: OTHER, value: { type: 'setGuild', guildId: GUILD } });
    expect(values[2]).toEqual({ type: 'createGuild', masterId: 500, guildId: GUILD, masterName: 'Webby', name: '' });
    expect(values[3]).toEqual({ type: 'destroyGuild', masterName: 'Webby', guildId: GUILD });
    expect(values[4]).toEqual({ type: 'guildWhole', guild: whole });
    expect(values[5]).toMatchObject({
      type: 'allGuilds', lastId: 78,
      guilds: [{ guildId: GUILD, name: 'Bakers', logo: 7, level: 4 }, { guildId: 78, name: 'Others' }],
      ranking: { version: 4, lists: [[{ logo: 7, name: 'Bakers', master: 'Webby', win: 3, averageLevel: 61.5, winPoint: 9 }], [], [], [], [], [], [], []] },
    });
    expect(values[6]).toEqual({ type: 'guildLogo', guildId: GUILD, logo: 12 });
    expect(values[7]).toEqual({ type: 'guildContribution', info: { guildId: GUILD, playerId: 500, pxpCount: 30, penya: 1000, guildPxpCount: 40, guildPenya: 5000, guildLevel: 2 } });
    expect(values[8]).toEqual({ type: 'guildNotice', guildId: GUILD, notice: 'New notice' });
    expect(values[9]).toEqual({ type: 'guildAuthority', power: [0xff, 1, 2, 3, 4] });
    expect(values[10]).toEqual({ type: 'guildPenya', rank: 3, penya: 250 });
    expect(values[11]).toEqual({ type: 'guildRealPenya', gold: 400, rank: 4 });
    expect(values[12]).toEqual({ type: 'setWar', warId: 6 });
  });
});

describe('the core guild packets', () => {
  it('reads each direct guild packet whole, and names its type back', () => {
    const cases: Array<[Uint8Array, GuildDirectMessage]> = [
      [directGuild(whole), { type: 'guildWhole', guild: whole, direct: true }],
      [directAddGuildMember(70003, GUILD, 'Tess'), { type: 'guildMemberAdded', playerId: 70003, multiNo: 100, guildId: GUILD, name: 'Tess' }],
      [directRemoveGuildMember(70003, GUILD), { type: 'guildMemberRemoved', playerId: 70003, guildId: GUILD }],
      [directGuildMemberLevel(70002, 3), { type: 'guildMemberLevel', playerId: 70002, rank: 3 }],
      [directGuildClass(70002, 1), { type: 'guildClass', playerId: 70002, rankClass: 1 }],
      [directChgMaster(500, 70002), { type: 'guildMasterChanged', oldMasterId: 500, newMasterId: 70002 }],
      [directGuildNickname(70002, 'Boss'), { type: 'guildNickname', playerId: 70002, alias: 'Boss' }],
      [directGuildMemberLogin(true, 70002), { type: 'guildMemberLogin', login: 1, playerId: 70002, multiNo: 100 }],
      [directGuildSetName(GUILD, 'Bakery'), { type: 'guildSetName', guildId: GUILD, name: 'Bakery' }],
      [directGuildError(1), { type: 'guildError', error: 1 }],
    ];
    for (const [bytes, expected] of cases) {
      const value = decodeWorldPacket(bytes);
      expect(value).toEqual(expected);
      expect(guildPacketTypeOf(value as GuildDirectMessage)).toBe(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true));
    }
  });
});

describe('the guild packets the browser sends', () => {
  const body = (bytes: Uint8Array): number[] => [...bytes.subarray(8)];
  const typeOf = (bytes: Uint8Array): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);

  it('writes each as its Neuz sender', () => {
    expect(typeOf(encodeGuildInvite(9300))).toBe(GuildPacket.GUILD_INVITE);
    expect(body(encodeGuildInvite(9300))).toEqual([0x54, 0x24, 0, 0]);
    // GUILD_MEMBER_INFO raw: the id, nMultiNo 100, three pad bytes
    expect(body(encodeAddGuildMember(70002, 500))).toEqual([0x72, 0x11, 1, 0, 0xf4, 1, 0, 0, 100, 0, 0, 0]);
    // the flag first
    expect(body(encodeGuildClass(500, 70002, true))).toEqual([1, 0xf4, 1, 0, 0, 0x72, 0x11, 1, 0]);
    expect(body(encodeGuildNotice('a\nb'))).toEqual([3, 0, 0, 0, 0x61, 0x0a, 0x62]);
    expect(body(encodeGuildContribution(0, 5000, 0))).toEqual([0, 0x88, 0x13, 0, 0, 0]);
    expect(() => encodeGuildSetName(500, GUILD, 'x'.repeat(48))).toThrow(RangeError);
    expect(() => encodeGuildNickname(500, 1, 'a\nb')).toThrow(RangeError);
  });

  it('reads each back for the pretend servers', () => {
    expect(decodeWorldPacket(encodeGuildInvite(9300))).toEqual({ type: 'guildInviteRequest', targetObjectId: 9300 });
    expect(decodeWorldPacket(encodeAddGuildMember(70002, 500))).toEqual({ type: 'addGuildMemberRequest', inviterId: 70002, ownId: 500, multiNo: 100 });
    expect(decodeWorldPacket(encodeRemoveGuildMember(500, 70002))).toEqual({ type: 'removeGuildMemberRequest', ownId: 500, playerId: 70002 });
    expect(decodeWorldPacket(encodeDestroyGuild(500))).toEqual({ type: 'destroyGuildRequest', ownId: 500 });
    expect(decodeWorldPacket(encodeGuildMemberLevel(500, 70002, 3))).toEqual({ type: 'guildMemberLevelRequest', ownId: 500, playerId: 70002, rank: 3 });
    expect(decodeWorldPacket(encodeGuildClass(500, 70002, false))).toEqual({ type: 'guildClassRequest', up: false, ownId: 500, playerId: 70002 });
    expect(decodeWorldPacket(encodeGuildNickname(500, 70002, 'Boss'))).toEqual({ type: 'guildNicknameRequest', ownId: 500, playerId: 70002, nickname: 'Boss' });
    expect(decodeWorldPacket(encodeChgMaster(500, 70002))).toEqual({ type: 'chgMasterRequest', ownId: 500, newMasterId: 70002 });
    expect(decodeWorldPacket(encodeGuildAuthority(500, GUILD, [0xff, 5, 0, 0, 4]))).toEqual({ type: 'guildAuthorityRequest', ownId: 500, guildId: GUILD, power: [0xff, 5, 0, 0, 4] });
    expect(decodeWorldPacket(encodeGuildPenya(500, GUILD, 2, 900))).toEqual({ type: 'guildPenyaRequest', ownId: 500, guildId: GUILD, rank: 2, penya: 900 });
    expect(decodeWorldPacket(encodeGuildSetName(500, GUILD, 'Bakers'))).toEqual({ type: 'guildSetNameRequest', ownId: 500, guildId: GUILD, name: 'Bakers' });
    expect(decodeWorldPacket(encodeQuerySetGuildName(14, 'Bakery'))).toEqual({ type: 'querySetGuildNameRequest', itemObjectId: 14, name: 'Bakery' });
    expect(decodeWorldPacket(encodeGuildLogo(12))).toEqual({ type: 'guildLogoRequest', logo: 12 });
    expect(decodeWorldPacket(encodeGuildContribution(0, 5000, 1))).toEqual({ type: 'guildContributionRequest', pxpCount: 0, gold: 5000, itemFlag: 1 });
    expect(decodeWorldPacket(encodeGuildNotice('Hi'))).toEqual({ type: 'guildNoticeRequest', notice: 'Hi' });
    expect(decodeWorldPacket(encodeQueryPlayerData2([{ playerId: 500, version: 3 }, { playerId: 70002, version: 0 }])))
      .toEqual({ type: 'queryPlayerData2Request', players: [{ playerId: 500, version: 3 }, { playerId: 70002, version: 0 }] });
  });
});

describe('ADD_OBJ keeps the guild (ObjSerializeOpt.cpp:136-140)', () => {
  const player: AddedPlayer = {
    self: false, name: 'Lead', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 70002, job: 0, sta: 15,
    dex: 15, level: 1, authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
    equipmentObjectIds: [], shopTitle: '', own: null,
  };
  const mover = (p: AddedPlayer): AddedMover => ({
    index: 11, scale: 1, pos: [6970, 100, 3330], angle: 0, objectId: OTHER, motion: 0, isPlayer: true, hitPoint: 230,
    state: 1, stateFlag: 0, belligerence: 0, sfxId: NULL_ID, player: p,
  });
  const read = (p: AddedPlayer) => {
    const result = readBundle(encodeBundle(0xffffff00, SELF, [writeAddPlayer(OTHER, mover(p))]), WORLD_READERS);
    expect(result.mismatched).toEqual([]);
    const value = result.messages[0]!.value;
    return value.type === 'addMover' ? value.mover.player : undefined;
  };

  it('reads the guild, the war and the guild cloak of another player', () => {
    expect(read({ ...player, guildId: GUILD, warId: 3, guildCloak: GUILD })).toMatchObject({ guildId: GUILD, warId: 3, guildCloak: GUILD });
  });

  it('leaves the keys out for a player with no guild', () => {
    const kept = read(player)!;
    expect('guildId' in kept || 'warId' in kept || 'guildCloak' in kept).toBe(false);
  });
});

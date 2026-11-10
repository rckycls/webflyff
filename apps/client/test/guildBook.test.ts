// 2026-11-10: the guild model and rules (guild research §2, appendix B §2-4), as Neuz's handlers and windows run them.
import { describe, expect, it } from 'vitest';
import type { GuildWhole } from '@flyffweb/protocol';
import { GuildBook } from '../src/world/guild/guildBook';
import type { GuildContext, GuildEvent } from '../src/world/guild/guildBook';
import {
  MemberMenu, MemberSort, canInvite, guildNameCheck, logoCell, logoRefusal, maxMembers, maxOfRank, memberAction,
  memberMenuEntries, nicknameCheck, noticeCheck, payCheck, rankIcons, togglePower,
} from '../src/world/guild/guildRules';
import type { MemberRow } from '../src/world/guild/guildRules';

const OWN_OBJECT = 9000;
const OWN = 500;
const LEAD = 70002;
const LEAD_OBJECT = 9300;
const GUILD = 77;

function contextOf(): GuildContext & { guilds: Map<number, number>; wars: Map<number, number> } {
  const guilds = new Map<number, number>([[OWN_OBJECT, 0], [LEAD_OBJECT, 0]]);
  const wars = new Map<number, number>();
  return {
    guilds, wars, ownObjectId: OWN_OBJECT, ownPlayerId: OWN,
    moverGuild: (id) => guilds.get(id),
    setMoverGuild: (id, guildId) => { guilds.set(id, guildId); },
    setMoverWar: (id, warId) => { wars.set(id, warId); },
    playerInView: (playerId) => (playerId === LEAD ? { objectId: LEAD_OBJECT, name: 'Lead' } : playerId === OWN ? { objectId: OWN_OBJECT, name: 'Webby' } : undefined),
    playerName: (playerId) => (playerId === LEAD ? 'Lead' : ''),
  };
}

const whole = (extra: Partial<GuildWhole> = {}): GuildWhole => ({
  guildId: GUILD, masterId: OWN, level: 1, name: 'Bakers', logo: 0, gold: 0, win: 0, lose: 0, surrender: 0,
  power: [0xff, 0, 0, 0, 0], penya: [0, 0, 0, 0, 0], notice: '', contributionPxp: 0, enemyGuildId: 0,
  members: [{ playerId: OWN, pay: 0, giveGold: 0, givePxp: 0, win: 0, lose: 0, rank: 0, selectedVote: 0, surrender: 0, rankClass: 0, alias: '' }],
  votes: [], quests: [], ...extra,
});
const lines = (events: GuildEvent[]): string[] => events.flatMap((e) => (e.kind === 'line' ? [e.tid] : []));

describe('the guild book', () => {
  it('creates a guild with the master alone, names the master mover, and says so to everyone', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    const events = book.apply(-1, { type: 'createGuild', masterId: LEAD, guildId: GUILD, masterName: 'Lead', name: '' }, ctx);
    expect(lines(events)).toEqual(['TID_GAME_COMCREATE']);
    expect(events[0]).toMatchObject({ args: ['Lead', ''] });
    expect(book.guild(GUILD)).toMatchObject({ masterId: LEAD, level: 1, power: [0xff, 0, 0, 0, 0] });
    expect(ctx.guilds.get(LEAD_OBJECT)).toBe(GUILD);
  });

  it('joins at log-in: ALL_GUILDS, then GUILD, and asks the members\' data', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    book.setOwn(GUILD, 0);
    book.apply(-1, { type: 'allGuilds', lastId: GUILD, guilds: [{ ...whole(), guildId: GUILD }], ranking: { version: 1, lists: [] } }, ctx);
    expect(book.own(OWN)).toBeNull(); // the short form has no members yet
    const events = book.apply(OWN_OBJECT, { type: 'guildWhole', guild: whole() }, ctx);
    expect(events).toContainEqual({ kind: 'queryMembers', playerIds: [OWN] });
    expect(book.own(OWN)?.name).toBe('Bakers');
  });

  it('a new member: the guild is whole first, then SET_GUILD plays the join', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    book.apply(-1, { type: 'guildWhole', guild: whole({ masterId: LEAD, members: [{ ...whole().members[0]!, playerId: LEAD }, { ...whole().members[0]!, playerId: OWN, rank: 4 }] }), direct: true }, ctx);
    const joined = book.apply(OWN_OBJECT, { type: 'setGuild', guildId: GUILD }, ctx);
    expect(joined.map((e) => e.kind)).toEqual(['tags', 'joined', 'line', 'changed']);
    expect(lines(joined)).toEqual(['TID_GAME_COMACCEPT']);
    expect(book.ownGuild).toBe(GUILD);
    expect(canInvite(book.own(OWN), OWN)).toBe(false);
    const left = book.apply(OWN_OBJECT, { type: 'setGuild', guildId: 0 }, ctx);
    expect(lines(left)).toEqual(['TID_GAME_COMLEAVE']);
    expect(left.some((e) => e.kind === 'left')).toBe(true);
    expect(book.own(OWN)).toBeNull();
  });

  it('members come and go, ranks and classes change, the master hands over', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    book.setOwn(GUILD, 0);
    book.apply(OWN_OBJECT, { type: 'guildWhole', guild: whole() }, ctx);
    expect(lines(book.apply(-1, { type: 'guildMemberAdded', playerId: LEAD, multiNo: 100, guildId: GUILD, name: 'Lead' }, ctx))).toEqual(['TID_GAME_COMACCEPTWELCOME']);
    expect(book.own(OWN)!.members.get(LEAD)!.rank).toBe(4);
    book.apply(-1, { type: 'guildClass', playerId: LEAD, rankClass: 2 }, ctx);
    // the promote line is never shown (OnGuildMemberLv); the class goes back to 0
    expect(lines(book.apply(-1, { type: 'guildMemberLevel', playerId: LEAD, rank: 3 }, ctx))).toEqual([]);
    expect(book.own(OWN)!.members.get(LEAD)).toMatchObject({ rank: 3, rankClass: 0 });
    expect(lines(book.apply(-1, { type: 'guildMasterChanged', oldMasterId: OWN, newMasterId: LEAD }, ctx))).toEqual(['TID_GAME_CHANGE_GUILDMASTER']);
    expect(book.own(OWN)).toMatchObject({ masterId: LEAD });
    expect(book.own(OWN)!.members.get(OWN)!.rank).toBe(4);
    expect(lines(book.apply(-1, { type: 'guildMemberRemoved', playerId: LEAD, guildId: GUILD }, ctx))).toEqual(['TID_GAME_COMLEAVEBYE']);
  });

  it('the notice, rights, salary, logo, name and contribution', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    book.setOwn(GUILD, 0);
    book.apply(OWN_OBJECT, { type: 'guildWhole', guild: whole() }, ctx);
    expect(lines(book.apply(-1, { type: 'guildNotice', guildId: GUILD, notice: 'Hi' }, ctx))).toEqual(['TID_GAME_GUILDNOTICEUPDATE']);
    expect(lines(book.apply(-1, { type: 'guildAuthority', power: [0xff, 4, 0, 0, 0] }, ctx))).toEqual(['TID_GAME_GUILDCHGWARRANT']);
    expect(lines(book.apply(-1, { type: 'guildPenya', rank: 0, penya: 500 }, ctx))).toEqual(['TID_GAME_GUILDCHGPAY']);
    expect(book.apply(-1, { type: 'guildRealPenya', gold: 10, rank: 0 }, ctx)[0]).toMatchObject({ tid: 'TID_GAME_GUILD_PAYTAKE', args: [500] });
    book.apply(-1, { type: 'guildLogo', guildId: GUILD, logo: 5 }, ctx);
    expect(book.apply(-1, { type: 'guildSetName', guildId: GUILD, name: 'Bakery' }, ctx)[0]).toMatchObject({ args: ['Bakers', 'Bakery'] });
    expect(lines(book.apply(-1, { type: 'guildContribution', info: { guildId: GUILD, playerId: OWN, pxpCount: 30, penya: 5200, guildPxpCount: 6, guildPenya: 0, guildLevel: 2 } }, ctx))).toEqual(['TID_GAME_GUILDLEVELUP']);
    expect(book.own(OWN)).toMatchObject({ notice: 'Hi', power: [0xff, 4, 0, 0, 0], logo: 5, name: 'Bakery', level: 2, contributionPxp: 6 });
    expect(book.own(OWN)!.members.get(OWN)).toMatchObject({ givePxp: 30, giveGold: 5200 });
  });

  it('the invite window opens only for a guild it knows; a disband speaks only to its members', () => {
    const book = new GuildBook();
    const ctx = contextOf();
    expect(book.apply(OWN_OBJECT, { type: 'guildInvite', guildId: GUILD, inviterId: LEAD }, ctx)).toEqual([]);
    book.apply(-1, { type: 'createGuild', masterId: LEAD, guildId: GUILD, masterName: 'Lead', name: 'Bakers' }, ctx);
    expect(book.apply(OWN_OBJECT, { type: 'guildInvite', guildId: GUILD, inviterId: LEAD }, ctx)).toEqual([{ kind: 'invite', guildId: GUILD, guildName: 'Bakers', inviterId: LEAD }]);
    expect(lines(book.apply(-1, { type: 'destroyGuild', masterName: 'Lead', guildId: GUILD }, ctx))).toEqual([]);
    expect(book.guild(GUILD)).toBeUndefined();
  });
});

describe('the guild rules', () => {
  it('the level table and the rank limits', () => {
    expect([maxMembers(1), maxMembers(3), maxMembers(20), maxMembers(50)]).toEqual([30, 32, 48, 80]);
    expect([0, 1, 2, 3, 4].map((rank) => maxOfRank(rank, 3))).toEqual([1, 5, 10, 20, 32]);
  });

  it('the name, nickname, notice and salary checks', () => {
    const catalog = { invalidNames: ['gm'], letters: '' };
    expect(guildNameCheck('  Bakers ', catalog)).toEqual({ ok: true, value: 'Bakers' });
    expect(guildNameCheck('ab', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0011' });
    expect(guildNameCheck('1Bakers', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0012' });
    expect(guildNameCheck('Bak ers', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0013' });
    expect(guildNameCheck('TheGMs', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0020' });
    expect(nicknameCheck('', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0011' });
    expect(nicknameCheck('a', catalog)).toEqual({ ok: false, box: 'TID_DIAG_0011_01' });
    expect(nicknameCheck('Boss', catalog)).toEqual({ ok: true, value: 'Boss' });
    expect(noticeCheck('x'.repeat(128))).toEqual({ ok: false, box: 'TID_GUILD_NOTICE_ERROR' });
    expect(payCheck('')).toEqual({ ok: true, penya: 0 });
    expect(payCheck('1000000')).toEqual({ ok: false, box: 'TID_GAME_GUILDONLYNUMBER' });
    expect(payCheck('12a')).toEqual({ ok: false, box: 'TID_GAME_GUILDONLYNUMBER' });
  });

  it('the logo button, grid and the rights', () => {
    const guild = { masterId: OWN, level: 1, logo: 0, name: 'Bakers', power: [0xff, 4, 0, 0, 0], members: new Map() };
    expect(logoRefusal(guild, true)).toBe('TID_GAME_GUILDWARERRORLOGO');
    expect(logoRefusal(guild, false)).toBe('TID_GAME_GUILDNOTLEVEL');
    expect(logoRefusal({ ...guild, level: 2, logo: 3 }, false)).toBe('TID_GAME_GUILDSTILLLOGO');
    expect(logoRefusal({ ...guild, level: 2 }, false)).toBeNull();
    expect([logoCell(0), logoCell(6), logoCell(19)]).toEqual([{ left: 24, top: 18 }, { left: 54, top: 48 }, { left: 144, top: 108 }]);
    expect(togglePower([0xff, 4, 0, 0, 0], 1, 4)).toEqual([0xff, 0, 0, 0, 0]);
  });

  it('the member list: rank icons, the sort and the menu', () => {
    expect(rankIcons(0, 0)).toEqual([{ frame: 44, left: 22 }]);
    expect(rankIcons(4, 2)).toEqual([{ frame: 48, left: 12 }, { frame: 48, left: 22 }, { frame: 48, left: 32 }]);
    const row = (playerId: number, rank: number, name: string, online = true): MemberRow => ({
      playerId, rank, rankClass: 0, alias: '', name, job: 1, level: 20, online, giveGold: 0, givePxp: 0, lose: 0,
    });
    const sort = new MemberSort();
    const rows = [row(3, 4, 'Cara'), row(1, 0, 'Abe'), row(2, 2, 'Bo')];
    expect(sort.refresh(rows).map((r) => r.rank)).toEqual([0, 2, 4]);
    expect(sort.press('rank', rows).map((r) => r.rank)).toEqual([4, 2, 0]);
    expect(sort.press('name', rows).map((r) => r.name)).toEqual(['Cara', 'Bo', 'Abe']);
    expect(memberMenuEntries(false).map((e) => e.id)).toEqual([0, 1, 2, 3, 5, 4]);
    expect(memberMenuEntries(true).at(-1)!.id).toBe(MemberMenu.CHG_MASTER);
    const guild = { masterId: OWN, level: 1, logo: 0, name: 'Bakers', power: [0xff, 0, 0, 0, 0], members: new Map() };
    expect(memberAction(MemberMenu.APPELL_UP, guild, row(LEAD, 4, 'Lead'), OWN, false)).toEqual({ send: 'memberLevel', playerId: LEAD, rank: 3 });
    expect(memberAction(MemberMenu.APPELL_UP, guild, row(LEAD, 4, 'Lead'), OWN, true)).toEqual({ box: 'TID_GAME_GUILDWARERRORMEMBER' });
    expect(memberAction(MemberMenu.CLASS_UP, guild, row(OWN, 0, 'Webby'), OWN, false)).toBeNull();
    expect(memberAction(MemberMenu.NICKNAME, guild, row(LEAD, 4, 'Lead'), OWN, false)).toEqual({ box: 'TID_GAME_GUILDNOTLEVEL' });
    expect(memberAction(MemberMenu.GUILD_LEAVE, guild, row(LEAD, 4, 'Lead'), OWN, false)).toEqual({ send: 'remove', playerId: LEAD });
    expect(memberAction(MemberMenu.CHG_MASTER, guild, row(LEAD, 4, 'Lead', false), OWN, false)).toEqual({ box: 'TID_GAME_NOTLOGIN' });
  });
});

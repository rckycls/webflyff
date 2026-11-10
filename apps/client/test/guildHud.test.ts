// @vitest-environment jsdom
// 2026-11-10: the guild's windows joined to the guild book and the session (guild/guildHud.ts; guild research §2-§3,
// appendix A): the Information tab's buttons, the name, nickname, salary, logo and disband windows, the invite window.

import { afterEach, describe, expect, it } from 'vitest';
import { ArReader, GuildPacket } from '@flyffweb/protocol';
import type { GuildWhole } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { GuildBook } from '../src/world/guild/guildBook';
import type { GuildContext } from '../src/world/guild/guildBook';
import { GuildHud } from '../src/world/guild/guildHud';
import type { PlayerData } from '../src/world/party/playerData';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const OWN = 500, LEAD = 70002, GUILD = 77, OWN_OBJECT = 9000;
const texts = new Map([
  ['TID_GAME_GUILDNOTCHGNAME', { text: 'The guild name can only be changed once.', color: 0xffffffff, textId: 1 }],
  ['TID_DIAG_0011', { text: 'The name must be 6 to 18 characters long.', color: 0xffffffff, textId: 2 }],
  ['TID_GAME_GUILDONLYNUMBER', { text: 'Please enter the number.', color: 0xffffffff, textId: 3 }],
  ['TID_GAME_GUILDNOTLEVEL', { text: 'Guild level is too low.', color: 0xffffffff, textId: 4 }],
  ['TID_GAME_COMACCEPT', { text: 'You have joined the %s guild.', color: 0xffccffcc, textId: 5 }],
]) as unknown as Texts;

const made: GuildHud[] = [];
afterEach(() => {
  for (const hud of made.splice(0)) hud.dispose();
  document.body.replaceChildren();
});

const whole = (extra: Partial<GuildWhole> = {}): GuildWhole => ({
  guildId: GUILD, masterId: OWN, level: 1, name: '', logo: 0, gold: 0, win: 0, lose: 0, surrender: 0,
  power: [0xff, 0, 0, 0, 0], penya: [0, 0, 0, 0, 0], notice: '', contributionPxp: 0, enemyGuildId: 0,
  members: [OWN, LEAD].map((playerId, i) => ({ playerId, pay: 0, giveGold: 0, givePxp: 0, win: 0, lose: 0, rank: i === 0 ? 0 : 4, selectedVote: 0, surrender: 0, rankClass: 0, alias: '' })),
  votes: [], quests: [], ...extra,
});

function setup(guild: GuildWhole | null, ownId = OWN) {
  const sent: Uint8Array[] = [];
  const lines: string[] = [];
  const music: number[] = [];
  const chatGuild: boolean[] = [];
  const book = new GuildBook();
  const ctx: GuildContext = {
    ownObjectId: OWN_OBJECT, ownPlayerId: ownId, moverGuild: () => 0, setMoverGuild: () => {}, setMoverWar: () => {},
    playerInView: () => undefined, playerName: () => '',
  };
  if (guild !== null) {
    book.setOwn(GUILD, 0);
    book.apply(OWN_OBJECT, { type: 'guildWhole', guild }, ctx);
  }
  const data = (playerId: number): PlayerData => ({ name: playerId === OWN ? 'Webby' : 'Lead', job: 1, level: 20, sex: 0, version: 1, login: 1 });
  const hud = new GuildHud(art, texts, {
    send: (bytes) => { sent.push(bytes); }, ownPlayerId: () => ownId, say: (text) => { lines.push(text); },
    playerData: data, playerVersion: () => 0, recolorTags: () => {}, setChatGuild: (inGuild) => { chatGuild.push(inGuild); },
    playMusic: (id) => { music.push(id); }, nameCatalog: () => ({ invalidNames: [], letters: '' }), openMessage: () => {},
    now: () => 0,
  }, book, () => '');
  document.body.append(...hud.elements);
  made.push(hud);
  const typeOf = (bytes: Uint8Array): number => new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  const sentOf = (type: number) => sent.filter((bytes) => typeOf(bytes) === type);
  return { hud, book, ctx, sent, sentOf, lines, music, chatGuild };
}

const box = (): string => document.querySelector('.hud-message:not([hidden]) .hud-message-text')?.textContent ?? '';
const click = (selector: string): void => { document.querySelector<HTMLElement>(selector)!.click(); };

describe('the guild window\'s Information tab', () => {
  it('the master names a nameless guild once: the checks, then GUILD_SETNAME', () => {
    const { hud, sentOf } = setup(whole());
    hud.toggle();
    expect(hud.window.isOpen).toBe(true);
    click('.hud-guild-page[data-page="info"] [data-control="WIDC_BUTTON4"]');
    expect(hud.nameWindow.isOpen).toBe(true);
    hud.nameWindow.value = 'ab';
    click('.hud-guild-name [data-control="WIDC_OK"]');
    expect(box()).toBe('The name must be 6 to 18 characters long.');
    expect(hud.nameWindow.isOpen).toBe(true);
    hud.nameWindow.value = 'Bakers';
    click('.hud-guild-name [data-control="WIDC_OK"]');
    expect(hud.nameWindow.isOpen).toBe(false);
    expect(sentOf(GuildPacket.GUILD_SETNAME)).toHaveLength(1);
  });

  it('a named guild refuses a second name; a non-master\'s presses do nothing', () => {
    const named = setup(whole({ name: 'Bakers' }));
    named.hud.toggle();
    click('.hud-guild-page[data-page="info"] [data-control="WIDC_BUTTON4"]');
    expect(box()).toBe('The guild name can only be changed once.');
    named.hud.dispose();
    document.body.replaceChildren();
    const member = setup(whole(), LEAD);
    member.hud.toggle();
    for (const id of ['WIDC_BUTTON4', 'WIDC_BUTTON1', 'WIDC_BUTTON2', 'WIDC_BUTTON3']) click(`.hud-guild-page[data-page="info"] [data-control="${id}"]`);
    expect([member.hud.nameWindow.isOpen, member.hud.notice.isOpen, member.hud.logo.isOpen, member.hud.disband.isOpen]).toEqual([false, false, false, false]);
    expect(member.sent).toEqual([]);
  });

  it('the logo needs guild level 2; then the 20 logos, one chosen: NW_GUILDLOGO', () => {
    const low = setup(whole());
    low.hud.toggle();
    click('.hud-guild-page[data-page="info"] [data-control="WIDC_BUTTON2"]');
    expect(box()).toBe('Guild level is too low.');
    low.hud.dispose();
    document.body.replaceChildren();
    const { hud, sentOf } = setup(whole({ level: 2 }));
    hud.toggle();
    click('.hud-guild-page[data-page="info"] [data-control="WIDC_BUTTON2"]');
    expect(document.querySelectorAll('.hud-guild-logo-cell')).toHaveLength(20);
    click('.hud-guild-logo-cell[data-logo="7"]');
    click('.hud-guild-logo [data-control="WIDC_OK"]');
    const [logo] = sentOf(GuildPacket.NW_GUILDLOGO);
    expect(new ArReader(logo!.subarray(8)).u32()).toBe(7);
  });

  it('the rename scroll: the name window with the scroll\'s object id, OK: QUERYSETGUILDNAME ( id, name )', () => {
    const { hud, sentOf } = setup(whole({ name: 'Bakers' }));
    hud.openRename(14);
    expect(hud.nameWindow.isOpen).toBe(true);
    expect(hud.nameWindow.value).toBe('Bakers');
    hud.nameWindow.value = 'Bakery';
    click('.hud-guild-name [data-control="WIDC_OK"]');
    const r = new ArReader(sentOf(GuildPacket.QUERYSETGUILDNAME)[0]!.subarray(8));
    expect([r.u8(), r.string(48)]).toEqual([14, 'Bakery']);
    expect(sentOf(GuildPacket.GUILD_SETNAME)).toEqual([]);
  });

  it('disband: the confirm window, YES: DESTROY_GUILD with the own id', () => {
    const { hud, sentOf } = setup(whole({ name: 'Bakers' }));
    hud.toggle();
    click('.hud-guild-page[data-page="info"] [data-control="WIDC_BUTTON3"]');
    expect(hud.disband.isOpen).toBe(true);
    click('.hud-guild-disband [data-control="WIDC_YES"]');
    expect(new ArReader(sentOf(GuildPacket.DESTROY_GUILD)[0]!.subarray(8)).u32()).toBe(OWN);
  });
});

describe('the Title tab\'s salary and the member menu\'s nickname', () => {
  it('the salary: digits only, under a million: GUILD_PENYA ( rank, penya )', () => {
    const { hud, sentOf } = setup(whole({ name: 'Bakers' }));
    hud.toggle();
    hud.window.showTab(2);
    hud.update();
    click('.hud-guild-page[data-page="title"] [data-control="WIDC_BUTTON3"]');
    expect(hud.payWindow.isOpen).toBe(true);
    hud.payWindow.value = '12a';
    click('.hud-guild-pay [data-control="WIDC_YES"]');
    expect(box()).toBe('Please enter the number.');
    expect(hud.payWindow.value).toBe('');
    hud.payWindow.value = '1500';
    click('.hud-guild-pay [data-control="WIDC_YES"]');
    const r = new ArReader(sentOf(GuildPacket.GUILD_PENYA)[0]!.subarray(8));
    expect([r.u32(), r.u32(), r.u32(), r.u32()]).toEqual([OWN, GUILD, 2, 1500]);
  });

  it('the nickname needs guild level 10', () => {
    const { hud } = setup(whole({ name: 'Bakers' }));
    hud.toggle();
    hud.window.showTab(1);
    hud.update();
    const row = document.querySelectorAll<HTMLElement>('.hud-guild-member')[1]!;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    const nickname = [...document.querySelectorAll<HTMLButtonElement>('.hud-guild-menu button')].find((b) => b.textContent === 'Create Nickname')!;
    nickname.click();
    expect(box()).toBe('Guild level is too low.');
  });
});

describe('the invite window and the join', () => {
  it('YES sends ADD_GUILD_MEMBER; the join plays the music and enables the chat\'s Guild', () => {
    const { hud, book, ctx, sentOf, music, chatGuild, lines } = setup(null);
    book.apply(-1, { type: 'createGuild', masterId: LEAD, guildId: GUILD, masterName: 'Lead', name: 'Bakers' }, ctx);
    hud.handle(book.apply(OWN_OBJECT, { type: 'guildInvite', guildId: GUILD, inviterId: LEAD }, ctx));
    expect(hud.invite.isOpen).toBe(true);
    expect(document.querySelector('.hud-guild-invite [data-control="WIDC_STATIC3"]')!.textContent).toBe('Bakers');
    click('.hud-guild-invite [data-control="WIDC_OK"]');
    const r = new ArReader(sentOf(GuildPacket.ADD_GUILD_MEMBER)[0]!.subarray(8));
    expect([r.u32(), r.u32(), r.u8()]).toEqual([LEAD, OWN, 100]);
    book.apply(-1, { type: 'guildMemberAdded', playerId: OWN, multiNo: 100, guildId: GUILD, name: 'Webby' }, ctx);
    hud.handle(book.apply(OWN_OBJECT, { type: 'setGuild', guildId: GUILD }, ctx));
    expect(music).toEqual([26]);
    expect(chatGuild).toEqual([true]);
    expect(lines).toContain('You have joined the Bakers guild.');
  });
});

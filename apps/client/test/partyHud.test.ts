// @vitest-environment jsdom
// The party's windows joined to the party's events and the session (Piece 7 M4, Task 12).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { WebParty } from '@flyffweb/formats';
import type { MessageOf } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { MoverBuffs } from '../src/world/buffs';
import { PartyHud } from '../src/world/party/partyHud';
import type { PartyHudSession } from '../src/world/party/partyHud';
import { PartyState } from '../src/world/party/partyState';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const texts = new Map([
  ['TID_GAME_PARTYCREATE', { text: 'Party has been created.', color: 0xff00ff00 }],
  ['TID_GAME_PARTYJOIN', { text: '%s has joined the party.', color: 0xff112233 }],
  ['TID_DIAG_0072', { text: '%s invites you to join the party. Do you accept?', color: 0xffffffff }],
  ['TID_DIAG_0007', { text: 'Unable to invite player.', color: 0xffffffff }],
  ['TID_GAME_NOT_TIME', { text: 'You are still using the %s party skill. Try again later.', color: 0xffff0000 }],
]) as unknown as Texts;
const WEBBY = 500;
const LEAD = 70002;

function session(): Record<keyof PartyHudSession, Mock> {
  return {
    sendPartyMemberCancel: vi.fn(), sendAddPartyMember: vi.fn(), sendRemovePartyMember: vi.fn(), sendChangeTroup: vi.fn(),
    sendPartyChangeLeader: vi.fn(), sendPartyItemMode: vi.fn(), sendPartyExpMode: vi.fn(), sendBlock: vi.fn(), sendPartySkillUse: vi.fn(),
  };
}

/** Each test's huds, disposed after it: a box left open would hold the window's keys for the next test. */
const huds: PartyHud[] = [];

function make(catalog: WebParty | null = null, icons = new MoverBuffs()) {
  const party = new PartyState({ ownPlayerId: () => WEBBY, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => 'Advance Party' });
  const s = session();
  const say = vi.fn();
  const music = vi.fn();
  const recolor = vi.fn();
  const hud = new PartyHud(art, texts, () => catalog, {
    session: s, say, music, recolor, target: vi.fn(), quickAt: () => ({ x: 0, y: 112 }),
    ownPlayerId: () => WEBBY, now: () => 0, carryPartySkill: vi.fn(),
  }, party, icons, document);
  document.body.append(...hud.elements);
  huds.push(hud);
  return { hud, party, s, say, music, recolor, icons };
}

const request: MessageOf<'partyRequest'> = {
  type: 'partyRequest', leader: { id: LEAD, level: 20, job: 1, sex: 0 }, member: { id: WEBBY, level: 15, job: 0, sex: 0 }, leaderName: 'Lead', troup: 0,
};

afterEach(() => {
  for (const hud of huds.splice(0)) hud.dispose();
  document.body.replaceChildren();
});

describe('PartyHud', () => {
  it('a line in its TID colour, or the colour the event forces, its %s filled', () => {
    const { hud, say } = make();
    hud.handle([
      { kind: 'line', tid: 'TID_GAME_PARTYCREATE', args: [], color: null },
      { kind: 'line', tid: 'TID_GAME_PARTYJOIN', args: ['Lead'], color: 0xff99cc00 },
      { kind: 'line', tid: 'TID_NOT_IN_THE_FILES', args: [], color: null },
    ]);
    expect(say.mock.calls).toEqual([['Party has been created.', 0xff00ff00], ['Lead has joined the party.', 0xff99cc00]]);
  });

  it('an invite opens the box; Yes sends ADDPARTYMEMBER with its values; a second invite meanwhile sends BLOCK', () => {
    const { hud, s } = make();
    hud.handle([{ kind: 'invited', request }]);
    expect(document.body.textContent).toContain('Lead invites you to join the party. Do you accept?');
    hud.handle([{ kind: 'invited', request: { ...request, leaderName: 'Other' } }]);
    expect(s.sendBlock.mock.calls).toEqual([['Other']]);
    document.querySelector<HTMLButtonElement>('.hud-party-confirm [data-button="yes"], .hud-party-confirm button[aria-label="Yes"]')!.click();
    expect(s.sendAddPartyMember.mock.calls).toEqual([[request.leader, request.member]]);
    // No on the next one sends MEMBERREQUESTCANCLE mode 0
    hud.handle([{ kind: 'invited', request }]);
    document.querySelector<HTMLButtonElement>('.hud-party-confirm [data-button="no"], .hud-party-confirm button[aria-label="No"]')!.click();
    expect(s.sendPartyMemberCancel.mock.calls).toEqual([[LEAD, WEBBY, 0]]);
  });

  it('a box, the music and a change of members reach the screen', () => {
    const { hud, music, recolor } = make();
    hud.handle([{ kind: 'box', tid: 'TID_DIAG_0007' }, { kind: 'music', id: 25 }, { kind: 'changed' }]);
    expect(document.body.textContent).toContain('Unable to invite player.');
    expect(music.mock.calls).toEqual([[25]]);
    expect(recolor).toHaveBeenCalledTimes(1);
  });

  it('P: the window, and with 2 members the quick view; again, both close', () => {
    const { hud, party } = make();
    party.apply({
      type: 'partyMember', playerId: WEBBY, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: '',
        members: [{ playerId: LEAD, removed: false }, { playerId: WEBBY, removed: false }],
      },
    });
    hud.toggle();
    expect([hud.window.frame.isOpen, hud.quick.frame.isOpen]).toEqual([true, true]);
    hud.toggle();
    expect([hud.window.frame.isOpen, hud.quick.frame.isOpen]).toEqual([false, false]);
  });

  it('a party skill: the rule, then PARTYSKILLUSE; while its mode icon runs, TID_GAME_NOT_TIME; the icons cleared, again', () => {
    const catalog: WebParty = {
      skills: [{ id: 5, name: 'Linked Attack', description: '', icon: null, level: 20, points: 1, skillTime: 20000, sfx: null, sfx2: null }],
      exp: [], invalidNames: [], letters: '',
    };
    const { hud, party, s, say } = make(catalog);
    hud.useSkill(5);
    expect(s.sendPartySkillUse).not.toHaveBeenCalled(); // no party: nothing
    party.apply({
      type: 'partyMember', playerId: WEBBY, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind: 1, level: 20, exp: 0, point: 5, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: 'Winners',
        members: [{ playerId: WEBBY, removed: false }, { playerId: LEAD, removed: false }],
      },
    });
    hud.useSkill(5);
    expect(s.sendPartySkillUse.mock.calls).toEqual([[5]]);
    hud.handle([{ kind: 'modeOn', mode: 0, skill: 5, skillTime: 20000 }]);
    hud.useSkill(5);
    expect(s.sendPartySkillUse).toHaveBeenCalledTimes(1);
    expect(say.mock.calls.at(-1)).toEqual(['You are still using the Linked Attack party skill. Try again later.', 0xffff0000]);
    hud.handle([{ kind: 'iconsCleared' }]);
    hud.useSkill(5);
    expect(s.sendPartySkillUse).toHaveBeenCalledTimes(2);
    // a skill the catalog has not: nothing
    hud.useSkill(9);
    expect(s.sendPartySkillUse).toHaveBeenCalledTimes(2);
  });
});

describe('PartyHud: its windows go with the world, the party stays (final review)', () => {
  it('dispose with the message box and the invite box open: no key held after it, nothing sent', () => {
    const { hud, s } = make();
    hud.handle([{ kind: 'box', tid: 'TID_DIAG_0007' }, { kind: 'invited', request }]);
    expect(hud.messageBox.isOpen && hud.confirm.isOpen).toBe(true);
    hud.dispose();
    const key = vi.fn();
    window.addEventListener('keydown', key);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    window.removeEventListener('keydown', key);
    expect(key).toHaveBeenCalledTimes(1);
    expect([hud.window.frame.isOpen, hud.quick.frame.isOpen, hud.confirm.isOpen, hud.messageBox.isOpen]).toEqual([false, false, false, false]);
    expect(s.sendPartyMemberCancel).not.toHaveBeenCalled();
    expect(s.sendAddPartyMember).not.toHaveBeenCalled();
  });

  it("the mode icons are the screen's: the next world's windows keep the icon and its guard on the points", () => {
    const catalog: WebParty = {
      skills: [{ id: 6, name: 'Lucky Drop', description: '', icon: null, level: 25, points: 5, skillTime: 300000, sfx: null, sfx2: null }],
      exp: [], invalidNames: [], letters: '',
    };
    const first = make(catalog);
    first.hud.handle([{ kind: 'modeOn', mode: 1, skill: 6, skillTime: 300000 }]);
    first.hud.dispose();
    const next = make(catalog, first.icons);
    next.party.apply({
      type: 'partyMember', playerId: WEBBY, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind: 1, level: 30, exp: 0, point: 50, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 1, 0, 0, 0], name: 'Winners',
        members: [{ playerId: WEBBY, removed: false }, { playerId: LEAD, removed: false }],
      },
    });
    next.hud.useSkill(6);
    expect(next.s.sendPartySkillUse).not.toHaveBeenCalled();
    expect(next.say.mock.calls.at(-1)?.[0]).toBe('You are still using the Lucky Drop party skill. Try again later.');
  });
});

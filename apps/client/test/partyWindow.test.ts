// @vitest-environment jsdom
// The party window's upper half and its member list (Piece 7 M4, [R §7.2]): `CWndParty::OnDraw` and `CWndPartyInfo`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageOf, PartyBlock } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { MemberList, memberRows } from '../src/world/hud/party/memberList';
import type { MemberRow, MemberView, PartyView } from '../src/world/hud/party/memberList';
import { PartyWindow } from '../src/world/hud/party/partyWindow';
import { PartyState } from '../src/world/party/partyState';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const WEBBY = 70001;
const LEAD = 70002;
const FAR = 70003;
const EXP = [0, 200, 200, 250, 300, 350, 400, 450, 500, 500].map((exp) => ({ exp, point: 15 }));
const TEXTS: Texts = new Map([
  ['TID_GAME_LEADER', { id: 'TID_GAME_LEADER', text: 'L', color: 0 }],
  ['TID_GAME_MEMBER', { id: 'TID_GAME_MEMBER', text: 'M', color: 0 }],
]);

function party(members: number[], over: Partial<PartyBlock> = {}): PartyState {
  const state = new PartyState({
    ownPlayerId: () => WEBBY, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => 'Advance Party',
  });
  state.apply(member(members, over));
  return state;
}
function member(members: number[], over: Partial<PartyBlock> = {}): MessageOf<'partyMember'> {
  return {
    type: 'partyMember', playerId: members.at(-1) ?? 0, leaderName: '', memberName: '',
    party: members.length === 0 ? null : {
      partyId: 1, kind: 0, level: 3, exp: 120, point: 15, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0],
      name: '', members: members.map((playerId) => ({ playerId, removed: false })), ...over,
    },
  };
}
const VIEWS: Record<number, MemberView> = {
  [WEBBY]: { playerId: WEBBY, inView: true, removed: false, level: 15, job: 4, jobName: 'Magician', name: 'Webby', hp: 230, maxHp: 230 },
  [LEAD]: { playerId: LEAD, inView: true, removed: false, level: 20, job: 1, jobName: 'Mercenary', name: 'Leadingtheway', hp: 115, maxHp: 230 },
  [FAR]: { playerId: FAR, inView: false, removed: false, level: 17, job: 16, jobName: 'Knight', name: 'Far', hp: 0, maxHp: 0 },
};
const view = (state: PartyState): PartyView => ({
  party: state, ownPlayerId: WEBBY, members: state.members.map((m) => VIEWS[m.playerId]!), exp: EXP,
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('the member rows ([R §7.2])', () => {
  it('a row per member in slot order: the box colour, the leader green with "L", the job\'s name, the cut name, the HP bar in view only', () => {
    expect(memberRows(view(party([WEBBY, LEAD, FAR])), null, TEXTS)).toEqual([
      { playerId: WEBBY, y: 10, selected: false, box: 0xff0000ff, text: 0xff1fb72d, level: '15', mark: 'L', job: 'Magician', name: 'Webby', hpWidth: 110 },
      { playerId: LEAD, y: 25, selected: false, box: 0xff0000ff, text: 0xff000000, level: '20', mark: 'M', job: 'Mercenary', name: 'Leadingt...', hpWidth: 55 },
      { playerId: FAR, y: 40, selected: false, box: 0xff878787, text: 0xff000000, level: '17-M', mark: 'M', job: 'Knight', name: 'Far', hpWidth: 0 },
    ]);
  });
});

describe('PartyWindow ([R §7.2])', () => {
  function open(state: PartyState) {
    const window = new PartyWindow(art, TEXTS);
    document.body.append(window.frame.element);
    window.frame.open({ x: 0, y: 0 });
    window.update(view(state));
    return window;
  }
  const value = (window: PartyWindow, key: string) =>
    window.frame.element.querySelector(`[data-value="${key}"]`)!.textContent;

  it('the upper half: "Party" or the party\'s name, the level, the EXP text, the points', () => {
    const normal = open(party([WEBBY, LEAD]));
    expect(['name', 'level', 'exp', 'point'].map((key) => value(normal, key))).toEqual(['Party', '3', '48.00 %', '15']);
    document.body.replaceChildren();
    expect(value(open(party([WEBBY, LEAD], { kind: 1, level: 10, exp: 46, name: 'Webbies' })), 'name')).toBe('Webbies');
    document.body.replaceChildren();
    expect(value(open(party([WEBBY, LEAD], { kind: 1, level: 10 })), 'name')).toBe('Advance Party');
  });

  it('draws a row per member, the HP bar as wide as the row says', () => {
    const window = open(party([WEBBY, LEAD, FAR]));
    const rows = [...window.frame.element.querySelectorAll<HTMLElement>('.hud-party-row')];
    expect(rows.map((row) => row.dataset.player)).toEqual([String(WEBBY), String(LEAD), String(FAR)]);
    expect(rows[1]!.textContent).toContain('Leadingt...');
    expect(rows[1]!.querySelector<HTMLElement>('.hud-party-hp-fill')!.style.width).toBe('55px');
  });

  it('a click selects a row; another member in view becomes the target, the own row clears it, a far member leaves it', () => {
    const state = party([WEBBY, LEAD, FAR]);
    const window = open(state);
    const target = vi.fn();
    window.onTarget = target;
    const row = (id: number) => window.frame.element.querySelector<HTMLElement>(`.hud-party-row[data-player="${id}"]`)!;
    row(LEAD).click();
    expect([window.selected, target.mock.calls]).toEqual([LEAD, [[LEAD]]]);
    row(WEBBY).click();
    expect([window.selected, target.mock.calls.at(-1)]).toEqual([WEBBY, [null]]);
    row(FAR).click();
    expect([window.selected, target.mock.calls.length]).toEqual([FAR, 2]);
    window.frame.element.querySelector<HTMLElement>('.hud-party-members')!.click();
    expect([window.selected, target.mock.calls.at(-1)]).toEqual([null, [null]]);
    // ignored during the auto-attack (m_bAutoAttack, WndParty.cpp:785-789)
    window.ignoreClicks = true;
    row(LEAD).click();
    expect([window.selected, target.mock.calls.length]).toEqual([null, 3]);
  });

  it('the rows follow a leave and the end of the party; the selection goes with its member', () => {
    const state = party([WEBBY, LEAD, FAR]);
    const window = open(state);
    window.frame.element.querySelector<HTMLElement>(`.hud-party-row[data-player="${FAR}"]`)!.click();
    state.apply({ type: 'partyChangeLeader', leaderId: FAR });
    window.update(view(state));
    expect([window.selected, window.frame.element.querySelectorAll('.hud-party-row')[0]!.getAttribute('data-player')]).toEqual([FAR, String(FAR)]);
    state.apply(member([FAR, WEBBY]));
    window.update(view(state));
    expect(window.frame.element.querySelectorAll('.hud-party-row')).toHaveLength(2);
    state.apply(member([WEBBY, LEAD]));
    window.update(view(state));
    expect(window.selected).toBeNull();
    state.apply(member([]));
    window.update(view(state));
    expect(window.frame.element.querySelectorAll('.hud-party-row')).toHaveLength(0);
  });
});

describe('PartyWindow: the buttons and the modes ([R §6], Task 8)', () => {
  function open(state: PartyState) {
    const window = new PartyWindow(art, TEXTS);
    document.body.append(window.frame.element);
    window.frame.open({ x: 0, y: 0 });
    window.update(view(state));
    return window;
  }
  const button = (window: PartyWindow, name: string) =>
    window.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;
  const radio = (window: PartyWindow, name: string) =>
    window.frame.element.querySelector<HTMLButtonElement>(`[data-radio="${name}"]`)!;

  it('Leave, Hand Over and the quick button need 2 members; Change a leader at level 10', () => {
    const lone = open(party([WEBBY], { level: 1 }));
    expect(['leave', 'handOver', 'quick', 'change'].map((name) => button(lone, name).disabled)).toEqual([true, true, true, true]);
    document.body.replaceChildren();
    const leader = open(party([WEBBY, LEAD], { level: 10 }));
    expect(['leave', 'handOver', 'quick', 'change'].map((name) => button(leader, name).disabled)).toEqual([false, false, false, false]);
    document.body.replaceChildren();
    const member = open(party([LEAD, WEBBY], { level: 10 }));
    expect(button(member, 'change').disabled).toBe(true);
    // __PARTY_DEBUG_0129: Leave also under 2 members with a party level above 1
    document.body.replaceChildren();
    expect(button(open(party([WEBBY], { level: 2 })), 'leave').disabled).toBe(false);
  });

  it('the buttons call their callbacks with the rules\' answers, and clear the selection', () => {
    const window = open(party([WEBBY, LEAD], { level: 10 }));
    const calls: unknown[] = [];
    window.onLeave = (id, kick) => calls.push(['leave', id, kick]);
    window.onHandOver = (id) => calls.push(['handOver', id]);
    window.onLine = (tid) => calls.push(['line', tid]);
    window.onChangeTroup = () => calls.push(['change']);
    window.onQuick = () => calls.push(['quick']);
    button(window, 'handOver').click();
    window.frame.element.querySelector<HTMLElement>(`.hud-party-row[data-player="${LEAD}"]`)!.click();
    button(window, 'leave').click();
    expect(window.selected).toBeNull();
    window.frame.element.querySelector<HTMLElement>(`.hud-party-row[data-player="${LEAD}"]`)!.click();
    button(window, 'handOver').click();
    button(window, 'change').click();
    button(window, 'quick').click();
    expect(calls).toEqual([
      ['line', 'TID_GAME_PARTY_ISNOTMASTER'], ['leave', LEAD, true], ['handOver', LEAD], ['change'], ['quick'],
    ]);
  });

  it('the radios show the party\'s modes and send through modeChoice; a member gets the box', () => {
    const state = party([WEBBY, LEAD], { kind: 1, level: 10, itemMode: 1, expMode: 0 });
    const window = open(state);
    const calls: unknown[] = [];
    window.onItemMode = (mode) => calls.push(['item', mode]);
    window.onExpMode = (mode) => calls.push(['exp', mode]);
    window.onBox = (tid) => calls.push(['box', tid]);
    expect(['item0', 'item1', 'item2', 'item3', 'exp0', 'exp1'].map((name) => radio(window, name).getAttribute('aria-checked')))
      .toEqual(['false', 'true', 'false', 'false', 'true', 'false']);
    radio(window, 'item1').click();
    radio(window, 'item3').click();
    radio(window, 'exp1').click();
    // not echoed yet: the radios still show the party's modes
    window.update(view(state));
    expect(radio(window, 'item3').getAttribute('aria-checked')).toBe('false');
    document.body.replaceChildren();
    const member = open(party([LEAD, WEBBY], { kind: 1 }));
    member.onBox = (tid) => calls.push(['box', tid]);
    radio(member, 'item2').click();
    expect(calls).toEqual([['item', 3], ['exp', 1], ['box', 'TID_DIAG_0008']]);
  });
});

describe('MemberList: rows kept while their members stay (final review)', () => {
  const row = (playerId: number, i: number, hpWidth: number, selected = false): MemberRow => ({
    playerId, y: 10 + 15 * i, selected, box: 0xff0000ff, text: 0xff000000, level: '15', mark: i === 0 ? 'L' : 'M', job: 'Vagrant',
    name: `P${playerId}`, hpWidth,
  });

  it('a row press survives a rebuild between pointerdown and pointerup: an HP step updates the row in place', () => {
    const list = new MemberList(art);
    document.body.append(list.element);
    const pressed = vi.fn();
    list.onPress = pressed;
    list.update([row(1, 0, 110), row(2, 1, 110)]);
    const second = list.element.querySelector<HTMLElement>('.hud-party-row[data-player="2"]')!;
    // the HP of a member in a fight changes between the press and its let-go
    list.update([row(1, 0, 109), row(2, 1, 100, true)]);
    expect(second.isConnected).toBe(true);
    expect(second.querySelector<HTMLElement>('.hud-party-hp-fill')!.style.width).toBe('100px');
    expect(second.querySelector<HTMLElement>('.hud-party-selected')!.hidden).toBe(false);
    second.click();
    expect(pressed.mock.calls).toEqual([[2]]);
    // another member set: rows made again, in the new order
    list.update([row(2, 0, 100), row(3, 1, 50)]);
    expect([...list.element.querySelectorAll<HTMLElement>('.hud-party-row')].map((r) => r.dataset.player)).toEqual(['2', '3']);
    expect(list.element.querySelector<HTMLElement>('.hud-party-row[data-player="2"] [data-column="mark"]')!.textContent).toBe('L');
  });
});

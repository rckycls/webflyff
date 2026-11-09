// 2026-11-10: the friend list and the Friend tab's rules (friends-say research §3, §4, §7).
import { describe, expect, it } from 'vitest';
import { FRS, Messenger, loadFriendOptions, optionCommand, saveFriendOptions } from '../src/world/friends/messenger';
import {
  FriendMenu, FriendSort, addFriendCheck, channelFrame, doubleClickAction, friendMenuEntries, friendRows, jobFrames, jobType,
  nameColor, nameText, ownStateFrame, playerDataFrame, sayAction, sayLine, stateFrame, whisperCheck,
} from '../src/world/friends/friendRules';
import type { FriendRow } from '../src/world/friends/friendRules';

const OWN = 500;

describe('Messenger (CRTMessenger and the handlers)', () => {
  it('takes the list at log-in and asks the states when it has friends', () => {
    const m = new Messenger();
    expect(m.apply({ type: 'friendList', state: 3, friends: [] }, OWN)).toEqual([{ kind: 'changed' }]);
    const events = m.apply({ type: 'friendList', state: 0, friends: [{ playerId: 7, blocked: false, state: 1 }, { playerId: 5, blocked: true, state: 1 }] }, OWN);
    expect(events).toEqual([{ kind: 'askStates' }, { kind: 'changed' }]);
    expect(m.connected).toBe(true);
    expect(m.entries().map(([id]) => id)).toEqual([5, 7]);
  });

  it('follows adds, removals, log-ins, log-outs, blocks and states', () => {
    const m = new Messenger();
    m.apply({ type: 'friendList', state: 0, friends: [{ playerId: 7, blocked: false, state: 1 }] }, OWN);
    expect(m.apply({ type: 'friendAdded', playerId: 8, name: 'Eight' }, OWN)).toEqual([{ kind: 'askStates' }, { kind: 'changed' }]);
    expect(m.get(8)).toEqual({ blocked: false, state: 0 });
    expect(m.apply({ type: 'friendJoin', playerId: 7, state: 0, channel: 1 }, OWN)).toEqual([{ kind: 'joined', playerId: 7 }, { kind: 'changed' }]);
    expect(m.apply({ type: 'friendJoin', playerId: 99, state: 0, channel: 1 }, OWN)).toEqual([]);
    m.apply({ type: 'friendLogout', playerId: 7 }, OWN);
    expect(m.get(7)?.state).toBe(FRS.OFFLINE);
    // FRIENDINTERCEPTSTATE: oneself blocked 8; then 7 blocked oneself, so 7 shows offline
    m.apply({ type: 'friendState', playerId: 7, state: 0, one: true }, OWN);
    m.apply({ type: 'friendIntercept', playerId: OWN, friendId: 8 }, OWN);
    m.apply({ type: 'friendIntercept', playerId: 7, friendId: OWN }, OWN);
    expect(m.get(8)?.blocked).toBe(true);
    expect(m.get(7)?.state).toBe(FRS.OFFLINE);
    m.apply({ type: 'friendNoIntercept', playerId: 8 }, OWN);
    expect(m.get(8)?.blocked).toBe(false);
    m.apply({ type: 'friendStates', entries: [{ playerId: 7, state: 4, channel: 2 }, { playerId: 1, state: 0, channel: 1 }] }, OWN);
    expect(m.get(7)?.state).toBe(4);
    expect(m.get(1)).toBeUndefined();
    // the own SETFRIENDSTATE sets the own state; ONEFRIEMDSTATE never does
    expect(m.apply({ type: 'friendState', playerId: OWN, state: 5, one: false }, OWN)).toEqual([]);
    expect(m.state).toBe(5);
    m.apply({ type: 'friendRemovedState', playerId: 8 }, OWN);
    expect(m.get(8)).toEqual({ blocked: false, state: 0 });
    m.apply({ type: 'friendRemoved', playerId: 8 }, OWN);
    expect(m.get(8)).toBeUndefined();
  });

  it('turns the answers into lines and boxes', () => {
    const m = new Messenger();
    expect(m.apply({ type: 'friendRequestCancel' }, OWN)).toEqual([{ kind: 'line', tid: 'TID_GAME_MSGDENYINVATE', args: [] }]);
    expect(m.apply({ type: 'friendError', error: 1, name: 'A' }, OWN)).toEqual([{ kind: 'box', tid: 'TID_DIAG_0059', args: ['A'] }]);
    expect(m.apply({ type: 'friendError', error: 2, name: 'B' }, OWN)).toEqual([{ kind: 'box', tid: 'TID_DIAG_0060', args: ['B'] }]);
    expect(m.apply({ type: 'friendNameNotFound', name: 'C' }, OWN)).toEqual([{ kind: 'box', tid: 'TID_DIAG_0061', args: ['C'] }]);
    expect(m.apply({ type: 'block', gu: 1, name: 'D' }, OWN)).toEqual([{ kind: 'closeMessage', name: 'D' }, { kind: 'line', tid: 'TID_GAME_MSGCHATDENY', args: ['D'] }]);
    expect(m.apply({ type: 'block', gu: 2, name: 'E' }, OWN)).toEqual([{ kind: 'line', tid: 'TID_GAME_MSGDENY', args: ['E'] }]);
    expect(m.apply({ type: 'block', gu: 6, name: 'F' }, OWN)).toEqual([{ kind: 'line', tid: 'TID_GAME_YETFRIEND', args: [] }]);
    expect(m.apply({ type: 'block', gu: 7, name: 'G' }, OWN)).toEqual([]);
  });

  it('keeps the options, and reads the client commands', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadFriendOptions(storage)).toEqual({ say: true, messenger: true, join: true });
    saveFriendOptions(storage, { say: false, messenger: true, join: false });
    expect(loadFriendOptions(storage)).toEqual({ say: false, messenger: true, join: false });
    expect(optionCommand('whisperrefuse')).toEqual({ option: 'say', on: false, tid: 'TID_GAME_WHISPERREFUSE' });
    expect(optionCommand('messengeragree')).toEqual({ option: 'messenger', on: true, tid: 'TID_GAME_MSGERAGREE' });
    expect(optionCommand('connectrefuse')).toEqual({ option: 'join', on: false, tid: 'TID_GAME_CONNREFUSE' });
    expect(optionCommand('Time')).toBeNull();
  });
});

const row = (over: Partial<FriendRow>): FriendRow => ({
  playerId: 1, name: 'A', job: 0, level: 1, state: FRS.ONLINE, blocked: false, channel: 1, ...over,
});

describe('the Friend tab', () => {
  it('makes the rows from the player data, offline at channel 100', () => {
    const data = (id: number) => ({ name: `P${id}`, job: 6, level: 60, sex: 0, version: 1, login: 2 });
    expect(friendRows([[3, { blocked: false, state: FRS.OFFLINE }], [4, { blocked: true, state: 0 }]], data)).toEqual([
      { playerId: 3, name: 'P3', job: 6, level: 60, state: FRS.OFFLINE, blocked: false, channel: 100 },
      { playerId: 4, name: 'P4', job: 6, level: 60, state: 0, blocked: true, channel: 2 },
    ]);
  });

  it('sorts as the C++ comparisons do: state up first, each press flipping its own key', () => {
    const rows = [
      row({ playerId: 1, name: 'b', state: FRS.OFFLINE, channel: 100, job: 1, level: 20 }),
      row({ playerId: 2, name: 'c', state: FRS.EAT, channel: 2, job: 6, level: 70 }),
      row({ playerId: 3, name: 'a', state: FRS.ONLINE, channel: 1, job: 16, level: 80 }),
    ];
    const sort = new FriendSort();
    expect(sort.refresh([...rows]).map((r) => r.playerId)).toEqual([3, 2, 1]);
    expect(sort.refresh([...rows]).map((r) => r.playerId)).toEqual([3, 2, 1]);
    expect(sort.press('state', [...rows]).map((r) => r.playerId)).toEqual([1, 2, 3]);
    expect(sort.refresh([...rows]).map((r) => r.playerId)).toEqual([1, 2, 3]);
    // prChannelAsce first: the highest channel (offline, 100) first
    expect(sort.press('channel', [...rows]).map((r) => r.playerId)).toEqual([1, 2, 3]);
    expect(sort.press('channel', [...rows]).map((r) => r.playerId)).toEqual([3, 2, 1]);
    // prNameAsce first: Z to A
    expect(sort.press('name', [...rows]).map((r) => r.name)).toEqual(['c', 'b', 'a']);
    // prLevelAsce first: the master, the 2nd job, the 1st job
    expect(sort.press('level', [...rows]).map((r) => r.playerId)).toEqual([3, 2, 1]);
    expect(sort.press('job', [...rows]).map((r) => r.playerId)).toEqual([3, 2, 1]);
    expect(sort.current).toBe('job');
  });

  it("draws the icons from icon_PlayerData.inc's frames", () => {
    expect([FRS.ONLINE, FRS.ABSENT, FRS.MOVE, FRS.OFFLINE, FRS.AUTOABSENT].map(ownStateFrame)).toEqual([0, 1, 5, 6, 1]);
    expect([FRS.ONLINE, FRS.HARDPLAY, FRS.OFFLINE].map(stateFrame)).toEqual([7, 9, 13]);
    expect([0, 1, 10, 11, 100].map(channelFrame)).toEqual([null, 34, 43, null, null]);
    expect(jobFrames(0, 1)).toEqual({ type: null, job: 14 });
    expect(jobFrames(4, 30)).toEqual({ type: null, job: 18 });
    expect(jobFrames(13, 80)).toEqual({ type: null, job: 26 });
    expect(jobFrames(16, 65)).toEqual({ type: 27, job: 19 });
    expect(jobFrames(23, 115)).toEqual({ type: 32, job: 26 });
    expect(jobFrames(24, 125)).toEqual({ type: 33, job: 19 });
    expect([0, 1, 6, 16, 24].map(jobType)).toEqual([0, 1, 2, 5, 6]);
    expect(playerDataFrame(0)).toEqual({ x: 1, y: 1, size: 32 });
    expect(playerDataFrame(7)).toEqual({ x: 1, y: 33, size: 16 });
    expect(playerDataFrame(13)).toEqual({ x: 97, y: 33, size: 16 });
    expect(playerDataFrame(34)).toEqual({ x: 1, y: 97, size: 16 });
    expect(playerDataFrame(49)).toBeNull();
    expect(nameText('Abcdefghijk')).toBe('Abcdefghij...');
    expect(nameColor(row({ blocked: true }), true)).toBe(0xffff0000);
    expect(nameColor(row({}), true)).toBe(0xff6060ff);
  });

  it('lists the menu as OnRButtonUp does', () => {
    const ids = (r: FriendRow, gm = false, inParty = false) => friendMenuEntries(r, gm, inParty).map((e) => e.id);
    expect(ids(row({}))).toEqual([FriendMenu.MESSAGE, FriendMenu.BLOCK, FriendMenu.DELETE, FriendMenu.INVITE, FriendMenu.ALLOW_VISIT]);
    expect(ids(row({}), true, true)).toEqual([FriendMenu.MESSAGE, FriendMenu.BLOCK, FriendMenu.DELETE, FriendMenu.MOVE, FriendMenu.ALLOW_VISIT]);
    expect(ids(row({ state: FRS.OFFLINE }))).toEqual([FriendMenu.BLOCK, FriendMenu.DELETE, FriendMenu.MEMO, FriendMenu.ALLOW_VISIT]);
    expect(friendMenuEntries(row({ blocked: true }), false, false).find((e) => e.id === FriendMenu.BLOCK)?.tid).toBe('TID_FRS_BLOCKRESTORE');
    expect(doubleClickAction(row({ name: 'Lead' }))).toEqual({ open: 'Lead' });
    expect(doubleClickAction(row({ state: FRS.OFFLINE }))).toEqual({ line: 'TID_GAME_NOTLOGIN', args: [] });
    expect(doubleClickAction(row({ name: 'Lead', blocked: true }))).toEqual({ line: 'TID_GAME_MSGBLOCKCHR', args: ['Lead'] });
  });

  it("checks the Add Friend window's name", () => {
    expect(addFriendCheck('Lead', 'Webby', 1)).toEqual({ send: 'Lead' });
    expect(addFriendCheck('Webby', 'Webby', 1)).toEqual({ box: 'TID_DIAG_0056', clear: true });
    expect(addFriendCheck('x'.repeat(64), 'Webby', 1)).toEqual({ box: 'TID_DIAG_0057', clear: true });
    expect(addFriendCheck('Lead', 'Webby', 202)).toEqual({ box: 'TID_GAME_GUILDCOMBAT_CANNOT_FRIENDADD', clear: false });
  });
});

describe('/say and the whispers', () => {
  const friends = new Map([[7, { blocked: true, state: 0 }], [8, { blocked: false, state: 0 }]]);
  const friend = (id: number) => friends.get(id);
  const say = (over: Partial<{ sender: string; recipient: string; fromId: number; toId: number; search: number }>) => ({
    sender: 'Lead', recipient: 'Webby', fromId: 8, toId: OWN, search: 0, ...over,
  });

  it('follows OnSay', () => {
    expect(sayAction(say({}), 'Webby', friend, true)).toEqual({ kind: 'other', window: 'Lead', from: 'Lead' });
    expect(sayAction(say({}), 'Webby', friend, false)).toEqual({ kind: 'refuse', sender: 'Lead' });
    expect(sayAction(say({ sender: 'Webby', recipient: 'Lead', fromId: OWN, toId: 8 }), 'Webby', friend, false))
      .toEqual({ kind: 'own', window: 'Lead', from: 'Webby' });
    expect(sayAction(say({ sender: '', recipient: '', fromId: OWN, toId: 9, search: 1 }), 'Webby', friend, true)).toEqual({ kind: 'notLoggedIn' });
    expect(sayAction(say({ sender: 'Webby', recipient: 'Blocky', fromId: OWN, toId: 7 }), 'Webby', friend, true))
      .toEqual({ kind: 'blocked', ownLine: true, name: 'Blocky' });
    expect(sayAction(say({ sender: 'Blocky', fromId: 7 }), 'Webby', friend, true)).toEqual({ kind: 'blocked', ownLine: false, name: 'Webby' });
    expect(sayLine('Lead', 'hi there')).toBe('/say "Lead" hi there');
  });

  it("follows OnWhisper's checks", () => {
    expect(whisperCheck(say({}), 'Webby', friend, true)).toBeNull();
    expect(whisperCheck(say({}), 'Webby', friend, false)).toEqual({ kind: 'refuse', sender: 'Lead' });
    expect(whisperCheck(say({ sender: 'Webby', recipient: 'Lead', fromId: OWN, toId: 8 }), 'Webby', friend, false)).toBeNull();
    expect(whisperCheck(say({ sender: 'Blocky', fromId: 7 }), 'Webby', friend, true)).toEqual({ kind: 'blocked', ownLine: false, name: 'Webby' });
  });
});

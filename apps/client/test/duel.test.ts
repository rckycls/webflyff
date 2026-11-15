// @vitest-environment jsdom
// 2026-11-15 (social): the duels (docs/2026-11-15-social-research.md §4): the book's rules (Neuz/DPClient.cpp:4648-4930,
// :15381-15407, _Common/MoverAttack.cpp:1940-1953), the count (MoverRender.cpp:2178-2222), the windows
// (WndDuelConfirm.cpp) and the menu's entries (WndWorld.cpp:6589-6608).

import { describe, expect, it, vi } from 'vitest';
import { NULL_ID, decodeWorldPacket } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { DuelBook } from '../src/world/duel/duelBook';
import type { DuelWorld } from '../src/world/duel/duelBook';
import { countLook } from '../src/world/hud/duel/duelWindows';
import { playerMenuEntries } from '../src/world/party/playerMenu';
import { SocialHud } from '../src/world/social/socialHud';
import type { SocialHost } from '../src/world/social/socialHud';

const OWN = 0x100, OTHER = 0x200, THIRD = 0x300;
const players = new Map([[70001, { objectId: OWN, name: 'Own', dead: false }], [70002, { objectId: OTHER, name: 'Webby', dead: false }],
  [70003, { objectId: THIRD, name: 'Third', dead: false }]]);
const world = (party = 0): DuelWorld => ({
  ownObjectId: () => OWN,
  ownPartyId: () => party,
  byPlayerId: (id) => players.get(id),
  mover: (objectId) => [...players.values()].find((p) => p.objectId === objectId),
});

describe('the duel book', () => {
  it('a request asks with the asker\'s name; one out of view or dead asks nothing', () => {
    const book = new DuelBook(world());
    expect(book.apply({ type: 'duelRequest', party: false, asker: 70002, asked: 70001 }))
      .toEqual([{ kind: 'confirm', party: false, name: 'Webby', askerId: OTHER, askerPlayerId: 70002 }]);
    expect(book.apply({ type: 'duelRequest', party: true, asker: 79999, asked: 70001 })).toEqual([]);
  });

  it('start 0 marks both and flags the other; the count; 1 fights: only then the other is a target', () => {
    const book = new DuelBook(world());
    expect(book.apply({ type: 'duelStart', target: 70002, flag: 0 })).toEqual([{ kind: 'flag', objectId: OTHER, flag: 'pvp' }]);
    expect(book.own).toMatchObject({ duel: 1, state: 104, other: OTHER });
    expect(book.side(OTHER)).toMatchObject({ duel: 1, other: OWN });
    expect(book.isPvpTarget(OTHER)).toBe(false);
    expect(book.apply({ type: 'duelCount', count: 3 })).toEqual([{ kind: 'count', count: 3 }]);
    expect(book.apply({ type: 'duelStart', target: 70002, flag: 1 })).toEqual([{ kind: 'line', tid: 'TID_GAME_DUELSTART', args: ['Webby'] }]);
    expect(book.isPvpTarget(OTHER)).toBe(true);
    expect(book.isPvpTarget(THIRD)).toBe(false);
    expect(book.canAttack(OTHER, false, false)).toBe(true);
    expect(book.canAttack(OTHER, true, false)).toBe(false);
    expect(book.canAttack(OTHER, false, true)).toBe(false);
    expect(book.flagShown(OTHER, 'pvp')).toBe(true);
  });

  it('won and lost open the result; SETDUEL 0 of the own clears the other; DUELCANCEL clears both and says so', () => {
    const book = new DuelBook(world());
    book.apply({ type: 'duelStart', target: 70002, flag: 0 });
    book.apply({ type: 'duelStart', target: 70002, flag: 1 });
    expect(book.apply({ type: 'duelStart', target: 70002, flag: 3 })).toEqual([{ kind: 'result', win: true, name: 'Webby' }]);
    expect(book.apply({ type: 'duelStart', target: 70002, flag: 4 })).toEqual([{ kind: 'result', win: false, name: 'Webby' }]);
    book.apply({ type: 'setDuel', objectId: OWN, duel: 0, state: 0, other: NULL_ID, duelParty: 0 });
    expect(book.own.duel).toBe(0);
    expect(book.side(OTHER).duel).toBe(0);
    expect(book.flagShown(OTHER, 'pvp')).toBe(false);
    book.apply({ type: 'duelStart', target: 70002, flag: 0 });
    expect(book.apply({ type: 'duelCancel', objectId: OTHER })).toEqual([{ kind: 'line', tid: 'TID_GAME_DUELCANCEL', args: [] }]);
    expect([book.own.duel, book.side(OTHER).duel]).toEqual([0, 0]);
    expect(book.apply({ type: 'duelNo', party: false, objectId: OTHER })).toEqual([{ kind: 'line', tid: 'TID_GAME_DUELNO', args: ['Webby'] }]);
  });

  it('a party duel: the enemy members flagged and targets by their party; a dead member\'s SETDUEL says PVPLEAVE; the end says the result', () => {
    const book = new DuelBook(world(5));
    expect(book.apply({ type: 'duelPartyStart', partyId: 9, name: 'Red', members: [OTHER, NULL_ID], flag: 0 }))
      .toEqual([{ kind: 'flag', objectId: OTHER, flag: 'party' }]);
    expect(book.own).toMatchObject({ duel: 2, duelParty: 9, party: 5, state: 104 });
    expect(book.side(OTHER)).toMatchObject({ duel: 2, party: 9, duelParty: 5, state: 104 });
    expect(book.apply({ type: 'duelPartyStart', partyId: 9, name: 'Red', members: [OTHER], flag: 1 }))
      .toEqual([{ kind: 'line', tid: 'TID_GAME_PDSTART', args: ['Red'] }]);
    expect(book.canAttack(OTHER, false, false)).toBe(true);
    expect(book.apply({ type: 'setDuel', objectId: OTHER, duel: 2, state: 300, other: NULL_ID, duelParty: 5 }))
      .toEqual([{ kind: 'line', tid: 'TID_GAME_PVPLEAVE', args: ['Webby'] }]);
    expect(book.flagShown(OTHER, 'party')).toBe(false);
    expect(book.apply({ type: 'duelPartyEnd', result: 'win', players: [70002] })).toEqual([{ kind: 'line', tid: 'TID_GAME_PDVICTORY', args: [] }]);
    expect([book.own.duel, book.own.duelParty, book.side(OTHER).duel]).toEqual([0, 0, 0]);
  });

  it('a player coming into view: the own opponent and the enemy party\'s members get the flag (OnAddObj)', () => {
    const book = new DuelBook(world(5));
    book.apply({ type: 'duelStart', target: 70002, flag: 0 });
    book.removed(OTHER);
    expect(book.added(OTHER, undefined, false)).toEqual([{ kind: 'flag', objectId: OTHER, flag: 'pvp' }]);
    expect(book.side(OTHER).other).toBe(OWN);
    const party = new DuelBook(world(5));
    party.apply({ type: 'duelPartyStart', partyId: 9, name: 'Red', members: [], flag: 0 });
    expect(party.added(THIRD, { partyId: 9, duelParty: 0, duel: 0 }, false)).toEqual([{ kind: 'flag', objectId: THIRD, flag: 'party' }]);
    expect(party.side(THIRD)).toMatchObject({ duel: 2, duelParty: 5 });
  });

  it('the fight regions: only an added region with RA_FIGHT, in its world, its rect left/top inclusive', () => {
    const book = new DuelBook(world());
    expect(book.inFightRegion(1, [150, 0, 250])).toBe(false);
    book.apply({ type: 'addRegion', worldId: 1, attribute: 0x40 | 0x400, rect: [100, 200, 300, 400], title: 'Duel Zone', movers: [] });
    book.apply({ type: 'addRegion', worldId: 1, attribute: 0x40 | 0x400, rect: [100, 200, 300, 400], title: 'Duel Zone', movers: [] });
    expect(book.inFightRegion(1, [100, 0, 200])).toBe(true);
    expect(book.inFightRegion(1, [299.9, 0, 399.9])).toBe(true);
    expect(book.inFightRegion(1, [300, 0, 250])).toBe(false);
    expect(book.inFightRegion(2, [150, 0, 250])).toBe(false);
    book.apply({ type: 'addRegion', worldId: 1, attribute: 0x10, rect: [0, 0, 1000, 1000], title: '', movers: [] });
    expect(book.inFightRegion(1, [50, 0, 50])).toBe(false);
  });
});

describe('the duel count (RenderPVPCount)', () => {
  it('1 and alpha 180 for 250 ms, then growing and fading, 2 at most; 0 is frame 10; gone after 1.5 s', () => {
    expect(countLook(3, 0)).toEqual({ frame: 3, scale: 1, alpha: 180 });
    expect(countLook(3, 249)).toEqual({ frame: 3, scale: 1, alpha: 180 });
    expect(countLook(2, 300)).toEqual({ frame: 2, scale: 1.5, alpha: 165 });
    expect(countLook(1, 1500)).toEqual({ frame: 1, scale: 2, alpha: 45 });
    expect(countLook(0, 100)?.frame).toBe(10);
    expect(countLook(1, 1501)).toBeNull();
  });
});

describe('the duel menu entries and windows', () => {
  const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
  const text = (id: string, value: string) => [id, { id, text: value, color: 0xff99cc00, textId: 0 }] as const;
  const TEXTS: Texts = new Map([
    text('TID_DIAG_0066', '%s challenges you to a duel. Do you accept?'),
    text('TID_DIAG_0067', '%s challenges your party to a duel. Do you accept?'),
    text('TID_DIAG_DUELRESULT_WIN', '%s loses the Duel!'),
    text('TID_GAME_DUELSTART', 'Duel with %s started!'),
  ]);

  it('"Duel - 1 vs 1" after the guild\'s invite, and the party\'s for a leader, with the texts written in the code', () => {
    const ids = (duels: { solo: boolean; party: boolean }) => playerMenuEntries(TEXTS, false, false, duels).map((e) => [e.id, e.label]);
    expect(ids({ solo: true, party: true }).slice(3, 6)).toEqual([[10, 'Duel - 1 vs 1'], [11, 'Duel - Party vs Party'], [12, 'Follow']]);
    expect(ids({ solo: true, party: false }).slice(3, 5)).toEqual([[10, 'Duel - 1 vs 1'], [12, 'Follow']]);
    expect(ids({ solo: false, party: false }).map(([id]) => id)).not.toContain(10);
    expect(playerMenuEntries(TEXTS, true, false, { solo: true, party: true }).map((e) => e.id)).toEqual([24]);
  });

  const make = () => {
    const sent: Uint8Array[] = [];
    const host: SocialHost = {
      send: (bytes) => sent.push(bytes), ownPlayerId: () => 70001, playerData: () => ({ name: '', job: 0, level: 1, sex: 0, version: 0, login: 0 }),
      jobName: () => '', itemProp: () => undefined, say: vi.fn(), beforeDuelYes: vi.fn(), flag: vi.fn(), resultMotion: vi.fn(),
    };
    const social = new SocialHud(art, TEXTS, host, document);
    document.body.append(...social.elements);
    return { social, sent, host };
  };
  const types = (sent: Uint8Array[]) => sent.map((bytes) => decodeWorldPacket(bytes));

  it('the question: Yes closes the other windows first and sends DUELYES; No and the close box DUELNO; a party one its own', () => {
    const { social, sent, host } = make();
    social.onDuel([{ kind: 'confirm', party: false, name: 'Webby', askerId: OTHER, askerPlayerId: 70002 }], 0);
    expect(social.duelConfirm.isOpen).toBe(true);
    expect(social.duelConfirm.window.frame.body.textContent).toContain('Webby challenges you to a duel. Do you accept?');
    social.duelConfirm.window.button('WIDC_YES').click();
    expect(host.beforeDuelYes).toHaveBeenCalledTimes(1);
    social.onDuel([{ kind: 'confirm', party: false, name: 'Webby', askerId: OTHER, askerPlayerId: 70002 }], 0);
    social.duelConfirm.window.button('WIDC_NO').click();
    social.onDuel([{ kind: 'confirm', party: true, name: 'Webby', askerId: OTHER, askerPlayerId: 70002 }], 0);
    expect(social.duelConfirm.window.frame.body.textContent).toContain('challenges your party');
    social.duelConfirm.window.frame.close();
    expect(types(sent)).toEqual([
      { type: 'duelYes', party: false, asker: 70002, own: 70001 },
      { type: 'duelNoPacket', party: false, asker: 70002 },
      { type: 'duelNoPacket', party: true, asker: 70002 },
    ]);
    expect(host.beforeDuelYes).toHaveBeenCalledTimes(1);
  });

  it('a request replaces the open one unanswered; the result closes the question and its Yes plays the motion', () => {
    const { social, sent, host } = make();
    social.onDuel([{ kind: 'confirm', party: false, name: 'Webby', askerId: OTHER, askerPlayerId: 70002 }], 0);
    social.onDuel([{ kind: 'confirm', party: false, name: 'Third', askerId: THIRD, askerPlayerId: 70003 }], 0);
    expect(sent).toHaveLength(0);
    social.onDuel([{ kind: 'result', win: true, name: 'Third' }], 0);
    expect(social.duelConfirm.isOpen).toBe(false);
    expect(sent).toHaveLength(0);
    expect(social.duelResult.window.frame.body.textContent).toContain('Third loses the Duel!');
    social.duelResult.window.button('WIDC_YES').click();
    expect(host.resultMotion).toHaveBeenCalledWith(true);
    social.requestDuel(70002, true);
    expect(types(sent)).toEqual([{ type: 'duelRequestPacket', party: true, asker: 70001, asked: 70002 }]);
  });

  it('the count shows its frame of CountFight.dds and goes after 1.5 s', () => {
    const { social } = make();
    social.onDuel([{ kind: 'count', count: 3 }], 1000);
    const count = social.duelCount.element;
    expect(count.hidden).toBe(false);
    expect([count.style.width, count.style.backgroundPosition]).toEqual(['64px', '-192px 0px']);
    expect(count.style.backgroundImage).toContain('ui/countfight.png');
    social.frame(2501);
    expect(count.hidden).toBe(true);
  });
});

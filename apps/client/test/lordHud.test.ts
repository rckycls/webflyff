// @vitest-environment jsdom
// 2026-11-11: the Lord windows (lord/lordHud.ts; research §6), run as WndLord.cpp runs them, and the packets they send.

import { beforeEach, describe, expect, it } from 'vitest';
import { ElectionState, NULL_ID, decodeWorldPacket } from '@flyffweb/protocol';
import type { LordCandidate } from '@flyffweb/protocol';
import { STOCK_ELECTION_PROPERTY } from '@flyffweb/testkit';
import type { UiArt } from '../src/world/hud/art';
import { LordHud, MMI_LORD, ratePercent, withCommas } from '../src/world/lord/lordHud';
import type { LordHost } from '../src/world/lord/lordHud';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const OWN = 500;
const TEXTS: Record<string, string> = {
  TID_GAME_L_EVENT_CREATE_E001: 'Only the Lord can use this.',
  TID_UPGRADE_ERROR_NOMONEY: 'Not enough penya.',
  TID_GAME_MOD_PLEGDE: 'You need 1,000,000 penya for changing a pledge. Would you like to change your pledge?',
  TID_GAME_LORD_MINREQ_OK: 'Satisfied',
  TID_GAME_LORD_MINREQ_NO: 'Not satisfied',
  TID_GAME_LORD_STATUS_L2: 'Voting',
  TID_GAME_LORD_STATUS_IS: 'Lord exists',
  TID_TOOLTIP_DATE: '%d Day(s) %d Hr(s) %d Min(s) %d Sec(s)',
  TID_GAME_STILLNOTUSE: 'You cannot use this yet.',
  TID_GAME_LORD_SKILL_CONFIRM1: 'Which character do you want to summon?',
  TID_GAME_VOTE_COMPLETE: 'You have voted for %s.',
};
const PLAYERS: Record<number, { name: string; level: number; job: number }> = {
  500: { name: 'Webby', level: 120, job: 8 }, 501: { name: 'Aibatt', level: 90, job: 9 }, 502: { name: 'Julia', level: 61, job: 7 },
};

let sent: unknown[];
let boxes: Array<{ text: string; ok?: () => void }>;
let said: string[];
let placed: number[];
let focus: string | null;
let hud: LordHud;
const NOW = 1_794_100_000;

function host(): LordHost {
  return {
    text: (tid) => (TEXTS[tid] === undefined ? undefined : { text: TEXTS[tid]!, color: 0xffffffff }),
    ownPlayerId: () => OWN, ownName: () => 'Webby',
    player: (id) => PLAYERS[id], jobName: (job) => `Job${job}`,
    focusName: () => focus,
    say: (text) => said.push(text), caption: () => {},
    box: (text, ok) => boxes.push({ text, ok }),
    send: (bytes) => sent.push(decodeWorldPacket(bytes)),
    carryLordSkill: () => {}, placeLordSkill: (skill) => { placed.push(skill); return true; }, removeLordShortcuts: () => {},
  };
}

function restore(state: number, candidates: LordCandidate[], lordId = NULL_ID): void {
  hud.handle({
    type: 'lord', lord: {
      lordId, events: [], skillTicks: [],
      election: { id: 2, state, begin: NOW - 90_000, requirement: 0, property: STOCK_ELECTION_PROPERTY, candidates },
    },
  });
}
const candidate = (playerId: number, deposit: number, pledge = '', votes = 0): LordCandidate => ({ playerId, deposit, votes, created: playerId, pledge });
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

beforeEach(() => {
  document.body.replaceChildren();
  sent = []; boxes = []; said = []; placed = []; focus = null;
  hud = new LordHud(host(), art, document, () => NOW);
  document.body.append(...hud.elements, hud.eventIcons);
});

describe('the Bid window (CWndLordTender, WndLord.cpp:318-454)', () => {
  it('sends the total typed, refuses less than 100,000,000, and shows the bidders and the own bid', () => {
    restore(ElectionState.CANDIDACY, [candidate(501, 300_000_000), candidate(OWN, 150_000_000)]);
    hud.openEntry(MMI_LORD.TENDER);
    expect(hud.tender.input('WIDC_EDIT1').value).toBe('150000000');
    expect(hud.tender.control('WIDC_TEXT2').textContent).toContain('1            Aibatt');
    hud.tender.input('WIDC_EDIT1').value = '99999999';
    hud.tender.button('WIDC_BUTTON1').click();
    expect(boxes.map((b) => b.text)).toEqual(['Not enough penya.']);
    hud.tender.input('WIDC_EDIT1').value = '2500000000';
    hud.tender.button('WIDC_BUTTON1').click();
    expect(sent).toEqual([{ type: 'electionAddDepositRequest', total: 2_500_000_000 }]);
  });
});

describe('the candidates and the pledge (CWndLordState, CWndLordPledge, WndLord.cpp:28-314)', () => {
  it('lists the candidates with their class, says whether the minimum is met, and opens a pledge', () => {
    restore(ElectionState.VOTE, [candidate(501, 300_000_000, 'Buffs for all'), candidate(OWN, 150_000_000)]);
    hud.openEntry(MMI_LORD.STATE);
    expect(hud.state.control('WIDC_LIVE').textContent).toBe('Satisfied');
    const rows = [...hud.state.control('WIDC_LISTBOX1').children];
    expect(rows.map((r) => r.textContent)).toEqual(['  1        AibattJob9open', '  2        WebbyJob8open']);
    click(rows[0]!);
    expect(hud.pledge.isOpen).toBe(true);
    expect(hud.pledge.control('WIDC_TEXT1').textContent).toBe('Buffs for all');
    // another's pledge cannot be edited: OK just closes
    hud.pledge.control('WIDC_TEXT1').parentElement!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(hud.pledge.control('WIDC_EDIT1').hidden).toBe(true);
    hud.pledge.button('WIDC_BUTTON2').click();
    expect(sent).toEqual([]);
    expect(hud.pledge.isOpen).toBe(false);
  });

  it('sends the own first pledge at once, and asks before a change', () => {
    restore(ElectionState.VOTE, [candidate(OWN, 150_000_000)]);
    hud.openEntry(MMI_LORD.STATE);
    click(hud.state.control('WIDC_LISTBOX1').children[0]!);
    hud.pledge.control('WIDC_TEXT1').parentElement!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const editor = hud.pledge.control('WIDC_EDIT1').querySelector('textarea')!;
    editor.value = 'Peace\nand buffs';
    hud.pledge.button('WIDC_BUTTON2').click();
    expect(sent).toEqual([{ type: 'electionSetPledgeRequest', pledge: 'Peace\nand buffs' }]);
    hud.handle({ type: 'electionSetPledge', playerId: OWN, pledge: 'Peace\nand buffs' });
    // a change: the 1,000,000 penya box first
    click(hud.state.control('WIDC_LISTBOX1').children[0]!);
    hud.pledge.control('WIDC_TEXT1').parentElement!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    editor.value = 'New pledge';
    hud.pledge.button('WIDC_BUTTON2').click();
    expect(sent).toHaveLength(1);
    expect(boxes.at(-1)?.text).toContain('1,000,000');
    boxes.at(-1)!.ok!();
    expect(sent.at(-1)).toEqual({ type: 'electionSetPledgeRequest', pledge: 'New pledge' });
    expect(hud.pledge.isOpen).toBe(false);
  });
});

describe('the Vote window (CWndLordVote, WndLord.cpp:457-596)', () => {
  it('lists level, name and class, sends the typed candidate only, and closes on the own vote counted', () => {
    restore(ElectionState.VOTE, [candidate(501, 300_000_000), candidate(502, 200_000_000)]);
    hud.openEntry(MMI_LORD.VOTE);
    expect([...hud.vote.control('WIDC_LISTBOX1').children].map((r) => r.textContent)).toEqual(['90AibattJob9', '61JuliaJob7']);
    hud.vote.input('WIDC_EDIT1').value = 'Nobody';
    hud.vote.button('WIDC_BUTTON1').click();
    expect(sent).toEqual([]);
    hud.vote.input('WIDC_EDIT1').value = 'Julia';
    hud.vote.button('WIDC_BUTTON1').click();
    expect(sent).toEqual([{ type: 'electionIncVoteRequest', playerId: 502 }]);
    hud.handle({ type: 'electionIncVote', playerId: 502, voterId: OWN });
    expect(hud.vote.isOpen).toBe(false);
    expect(boxes.at(-1)?.text).toBe('You have voted for Julia.');
  });
});

describe('the Lord info, the event and the skills', () => {
  it('shows the Lord and the time left of the term', () => {
    restore(ElectionState.READY, [], 501);
    hud.openEntry(MMI_LORD.INFO);
    expect(hud.info.control('WIDC_STATIC4').textContent).toBe('Lord exists');
    expect(hud.info.control('WIDC_STATIC5').textContent).toBe('Aibatt');
    // begin NOW - 90000 s, + 1 day + 2 days: 169,200 s left = 1 day 23 h 0 min 0 s
    expect(hud.info.control('WIDC_STATIC6').textContent).toBe('1 Day(s) 23 Hr(s) 0 Min(s) 0 Sec(s)');
  });

  it('opens the event window for the Lord only, cycles the rates and sends the rows', () => {
    restore(ElectionState.READY, []);
    hud.openEntry(MMI_LORD.EVENT);
    expect(hud.event.isOpen).toBe(false);
    expect(boxes.map((b) => b.text)).toEqual(['Only the Lord can use this.']);
    restore(ElectionState.READY, [], OWN);
    hud.openEntry(MMI_LORD.EVENT);
    hud.event.button('WIDC_BUTTON2').click();
    hud.event.button('WIDC_BUTTON2').click();
    hud.event.button('WIDC_BUTTON3').click(); // 0 back to the last row, 50 %
    expect(hud.event.control('WIDC_TEXT1').textContent).toBe('  10 %');
    expect(hud.event.control('WIDC_TEXT2').textContent).toBe('  50 %');
    expect(hud.event.control('WIDC_TEXT3').textContent).toBe('3,200,000,000');
    hud.event.button('WIDC_BUTTON5').click();
    expect(sent).toEqual([{ type: 'lordEventCreateRequest', expRow: 2, dropRow: 10 }]);
  });

  it('runs a Lord skill shortcut: on the focus, on the Lord with none, Call through its name window', () => {
    restore(ElectionState.READY, [], OWN);
    hud.useShortcut(0);
    focus = 'Julia';
    hud.useShortcut(2);
    focus = '';
    hud.useShortcut(1); // a focused NPC: nothing
    expect(sent).toEqual([{ type: 'lordSkillUseRequest', skill: 0, target: 'Webby' }, { type: 'lordSkillUseRequest', skill: 2, target: 'Julia' }]);
    hud.useShortcut(5);
    expect(hud.skillConfirm.isOpen).toBe(true);
    expect(hud.skillConfirm.control('WIDC_TEXT1').textContent).toBe('Which character do you want to summon?');
    hud.skillConfirm.input('WIDC_EDIT1').value = 'Aibatt';
    hud.skillConfirm.button('WIDC_BUTTON1').click();
    expect(sent.at(-1)).toEqual({ type: 'lordSkillUseRequest', skill: 5, target: 'Aibatt' });
    hud.handle({ type: 'lordSkillUse', targetId: 501, skill: 5 });
    expect(hud.cooldown(5)).toBe(0);
    hud.handle({ type: 'lordSkillTick', ticks: [{ id: 5, tick: 30 }] });
    expect(hud.cooldown(5)).toBe(0.5);
    hud.useShortcut(5);
    expect(said).toEqual(['You cannot use this yet.']);
  });

  it('opens the Lord Skill window for the Lord only, and draws the running events', () => {
    restore(ElectionState.READY, []);
    hud.openSkills();
    expect(hud.skills.isOpen).toBe(false);
    restore(ElectionState.READY, [], OWN);
    hud.openSkills();
    expect(hud.skills.isOpen).toBe(true);
    expect(hud.skills.control('WIDC_CUSTOM1').getAttribute('aria-label')).toBe("Lord's Cheer");
    hud.handle({ type: 'lordEventCreate', event: { tick: 60, playerId: OWN, expFactor: 0.1, dropFactor: 0 } });
    expect(hud.eventIcons.children).toHaveLength(1);
    expect(hud.eventIcons.textContent).toBe('60m');
  });

  it('formats the cost and the rates as OnDraw does', () => {
    expect(withCommas(4_000_000_000)).toBe('4,000,000,000');
    expect(withCommas(0)).toBe('0');
    expect(ratePercent(0.15)).toBe('  15 %');
  });
});

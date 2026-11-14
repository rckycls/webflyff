// @vitest-environment jsdom
// 2026-11-15 (social): the couple (docs/2026-11-15-social-research.md §2): the level table and rate (_Common/couple.cpp,
// Resource/couple.inc), the skills, what each snapshot does (Neuz/couplehelper.cpp), the window (WndField.cpp:23076-23511)
// and its boxes.

import { describe, expect, it, vi } from 'vitest';
import { CouplePacket, decodeWorldPacket } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import type { UiArt } from '../src/world/hud/art';
import { CoupleBook, coupleExpRate, coupleLevel, coupleSkillsAt, shownCoupleRate } from '../src/world/couple/coupleBook';
import { SocialHud } from '../src/world/social/socialHud';
import type { SocialHost } from '../src/world/social/socialHud';

const OWN = 70001;
const PARTNER = 70002;
const text = (id: string, textId: number, value: string, color = 0xffffffff) => [id, { id, text: value, color, textId }] as const;
const TEXTS: Texts = new Map([
  text('TID_GAME_COUPLE', 4060, 'Couple'),
  text('TID_GAME_COUPLE_INFO', 4061, 'Couple Information'),
  text('TID_GAME_COUPLE_SKILL', 4062, 'Couple Skills'),
  text('TID_GAME_COUPLE_S02', 4049, 'You and %s are now a couple!'),
  text('TID_GAME_COUPLE_S03', 4050, 'Your couple has broken up.', 0xffff0000),
  text('TID_GAME_COUPLE_LEVELUP', 4094, 'Your couple has reached level %d!'),
  text('TID_GAME_RECEIVEPROPOSAL', 4058, '%s has proposed to you. Would you like to make a couple?'),
  text('TID_GAME_COUPLECANCEL', 4059, 'Are you certain you would like to break up with %s?'),
]);

describe('the couple\'s levels (couple.inc, CCoupleProperty)', () => {
  it('a level is the first whose total is over the EXP; 21 at most', () => {
    expect([coupleLevel(0), coupleLevel(2879), coupleLevel(2880), coupleLevel(129599), coupleLevel(129600)]).toEqual([1, 1, 2, 20, 21]);
  });

  it('the rate is the share of the level done, 0 at 21, and the gauge bumps a small one', () => {
    expect(coupleExpRate(1, 1440)).toBeCloseTo(0.5, 5);
    expect(coupleExpRate(21, 129600)).toBe(0);
    expect([shownCoupleRate(0), shownCoupleRate(0.01), shownCoupleRate(0.05), shownCoupleRate(0.5)]).toEqual([0, 0.05, 0.075, 0.5]);
  });

  it('the skills: Power from 6, Blessing from 11, Miracle at 21 (SkillLevel)', () => {
    expect(coupleSkillsAt(1)).toEqual([0, 0, 0]);
    expect(coupleSkillsAt(5)).toEqual([0, 0, 0]);
    expect(coupleSkillsAt(6)).toEqual([26720, 0, 0]);
    expect(coupleSkillsAt(15)).toEqual([26721, 26730, 0]);
    expect(coupleSkillsAt(16)).toEqual([26722, 26730, 0]);
    expect(coupleSkillsAt(21)).toEqual([26723, 26731, 26740]);
  });
});

describe('the couple book (CCoupleHelper)', () => {
  it('COUPLE after the join keeps the couple and asks for the partner; the partner is the other id', () => {
    const book = new CoupleBook();
    expect(book.apply({ type: 'couple', exp: 2880, first: PARTNER, second: OWN }, OWN)).toEqual([{ kind: 'query', playerId: PARTNER }, { kind: 'changed' }]);
    expect(book.couple).toEqual({ exp: 2880, first: PARTNER, second: OWN, level: 2 });
    expect(book.partnerOf(OWN)).toBe(PARTNER);
  });

  it('a proposal opens the box; COUPLE_RESULT makes a level-1 couple and says S02; DECOUPLE_RESULT says S03 once', () => {
    const book = new CoupleBook();
    expect(book.apply({ type: 'proposeResult', proposerId: PARTNER, name: 'Webby' }, OWN))
      .toContainEqual({ kind: 'proposal', proposerId: PARTNER, name: 'Webby' });
    expect(book.apply({ type: 'coupleResult', partnerId: PARTNER, name: 'Webby' }, OWN))
      .toContainEqual({ kind: 'line', tid: 'TID_GAME_COUPLE_S02', args: ['Webby'] });
    expect(book.couple).toEqual({ exp: 0, first: OWN, second: PARTNER, level: 1 });
    expect(book.apply({ type: 'decoupleResult' }, OWN)).toContainEqual({ kind: 'line', tid: 'TID_GAME_COUPLE_S03', args: [] });
    expect(book.couple).toBeNull();
    expect(book.apply({ type: 'decoupleResult' }, OWN)).toEqual([]);
  });

  it('EXP adds up; a new level says COUPLE_LEVELUP; nothing at 21 or without a couple', () => {
    const book = new CoupleBook();
    expect(book.apply({ type: 'addCoupleExperience', exp: 1 }, OWN)).toEqual([]);
    book.apply({ type: 'couple', exp: 2879, first: PARTNER, second: OWN }, OWN);
    expect(book.apply({ type: 'addCoupleExperience', exp: 1 }, OWN)).toContainEqual({ kind: 'line', tid: 'TID_GAME_COUPLE_LEVELUP', args: [2] });
    expect(book.apply({ type: 'addCoupleExperience', exp: 1 }, OWN)).toEqual([{ kind: 'changed' }]);
    book.apply({ type: 'couple', exp: 129600, first: PARTNER, second: OWN }, OWN);
    expect(book.apply({ type: 'addCoupleExperience', exp: 1 }, OWN)).toEqual([]);
    expect(book.couple!.exp).toBe(129600);
  });
});

describe('the couple window and its boxes', () => {
  const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
  const make = () => {
    const sent: Uint8Array[] = [];
    const said: Array<[string, number]> = [];
    const host: SocialHost = {
      send: (bytes) => sent.push(bytes),
      ownPlayerId: () => OWN,
      playerData: vi.fn((playerId: number) => ({ name: playerId === PARTNER ? 'Webby' : '', job: 16, level: 75, sex: 1, version: 1, login: 1 })),
      jobName: (job) => (job === 16 ? 'Knight' : ''),
      itemProp: (itemId) => ({ 26720: { name: 'Power of Love', icon: 'ui/item/skill_couple01.png' } } as Record<number, { name: string; icon: string }>)[itemId],
      say: (line, color) => said.push([line, color]),
    };
    const social = new SocialHud(art, TEXTS, host, document);
    document.body.append(...social.elements);
    return { social, sent, said, host };
  };
  const types = (sent: Uint8Array[]) => sent.map((bytes) => decodeWorldPacket(bytes).type);

  it('a proposal: OK sends COUPLE, Cancel (or the close box) REFUSE', () => {
    const { social, sent } = make();
    social.onCouple({ type: 'proposeResult', proposerId: PARTNER, name: 'Webby' });
    expect(social.coupleBox.isOpen).toBe(true);
    expect(social.coupleBox.frame.body.textContent).toContain('Webby has proposed to you. Would you like to make a couple?');
    social.coupleBox.frame.body.querySelector<HTMLButtonElement>('[data-button="ok"]')!.click();
    social.onCouple({ type: 'proposeResult', proposerId: PARTNER, name: 'Webby' });
    social.coupleBox.frame.body.querySelector<HTMLButtonElement>('[data-button="cancel"]')!.click();
    expect(types(sent)).toEqual(['coupleAccept', 'refuse']);
    expect(CouplePacket.COUPLE).toBe(0x8ffff002);
  });

  it('the info tab shows the partner, the couple level and the gauge; Break Up asks, OK sends DECOUPLE', () => {
    const { social, sent, said } = make();
    social.onCouple({ type: 'couple', exp: 1440, first: PARTNER, second: OWN });
    social.coupleWindow.toggle();
    const body = social.coupleWindow.frame.body;
    expect(body.querySelector('[data-page="info"]')!.textContent).toContain('Webby');
    expect(body.textContent).toContain('Knight');
    expect(body.textContent).toContain('75');
    // the gauge: STATIC4 + (70, 36) to (right - 10, top + 48): 162 px; half a level filled
    const fill = body.querySelector<HTMLElement>('[data-gauge="couple-exp"]')!;
    const empty = body.querySelector<HTMLElement>('[data-gauge="couple-empty"]')!;
    expect([empty.style.left, empty.style.top, empty.dataset.width]).toEqual(['82px', '204px', '162']);
    expect(fill.dataset.width).toBe('81');
    // a master's mark (job 16, level 75: frame 28)
    expect(body.querySelector<HTMLElement>('.hud-couple-jobtype')!.hidden).toBe(false);
    body.querySelector<HTMLButtonElement>('[data-page="info"] button')!.click();
    expect(social.coupleBox.frame.body.textContent).toContain('Are you certain you would like to break up with Webby?');
    social.coupleBox.frame.body.querySelector<HTMLButtonElement>('[data-button="ok"]')!.click();
    expect(types(sent)).toEqual(['decouple']);
    social.onCouple({ type: 'decoupleResult' });
    expect(said).toEqual([['Your couple has broken up.', 0xffff0000]]);
    expect(body.querySelector('[data-page="info"]')!.textContent).not.toContain('Webby');
  });

  it('the skill tab: the three kinds\' places 32 px apart over the background, lit from their level; the help text', () => {
    const { social } = make();
    social.onCouple({ type: 'couple', exp: 16845, first: PARTNER, second: OWN }); // level 6
    social.coupleWindow.toggle();
    const titles = [...social.coupleWindow.frame.body.querySelectorAll<HTMLElement>('.hud-tab-title')];
    expect(titles.map((t) => t.textContent)).toEqual(['Couple Information', 'Couple Skills']);
    titles[1]!.click();
    const icons = [...social.coupleWindow.frame.body.querySelectorAll<HTMLElement>('.hud-couple-skill')];
    expect(icons.map((icon) => [icon.style.left, icon.hasAttribute('data-active')])).toEqual([['16px', true], ['48px', false], ['80px', false]]);
    expect(icons[0]!.style.backgroundImage).toContain('/assets/ui/skill_couple01.png');
    expect(social.coupleWindow.frame.body.textContent).toContain('Breaking up with partner will reset the couple skill to Level 0.');
  });
});

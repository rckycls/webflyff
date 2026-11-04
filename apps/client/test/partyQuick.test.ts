// @vitest-environment jsdom
// The party's quick view (Piece 7 M4, [R §7.3]): `CWndPartyQuick`, APP_PARTY_QUICK.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageOf } from '@flyffweb/protocol';
import type { UiArt } from '../src/world/hud/art';
import type { MemberView, PartyView } from '../src/world/hud/party/memberList';
import { PartyQuick } from '../src/world/hud/party/partyQuick';
import { PartyState } from '../src/world/party/partyState';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const WEBBY = 70001;
const LEAD = 70002;
const FAR = 70003;
const VIEWS: Record<number, MemberView> = {
  [LEAD]: { playerId: LEAD, inView: true, removed: false, level: 20, job: 1, jobName: 'Mercenary', name: 'Lead', hp: 0, maxHp: 230 },
  [WEBBY]: { playerId: WEBBY, inView: true, removed: false, level: 15, job: 4, jobName: 'Magician', name: 'Webby', hp: 20, maxHp: 230 },
  [FAR]: { playerId: FAR, inView: false, removed: false, level: 17, job: 16, jobName: 'Knight', name: 'Farawayfriendly', hp: 0, maxHp: 0 },
};

function party(members: number[]): PartyState {
  const state = new PartyState({ ownPlayerId: () => WEBBY, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => '' });
  const message: MessageOf<'partyMember'> = {
    type: 'partyMember', playerId: WEBBY, leaderName: '', memberName: '',
    party: members.length === 0 ? null : {
      partyId: 1, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: '',
      members: members.map((playerId) => ({ playerId, removed: false })),
    },
  };
  state.apply(message);
  return state;
}
const view = (state: PartyState): PartyView => ({ party: state, ownPlayerId: WEBBY, members: state.members.map((m) => VIEWS[m.playerId]!), exp: [] });

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartyQuick', () => {
  function open(state: PartyState) {
    const quick = new PartyQuick(art);
    document.body.append(quick.frame.element);
    quick.frame.open({ x: 30, y: 192 });
    quick.update(view(state));
    return quick;
  }
  const rows = (quick: PartyQuick) => [...quick.frame.element.querySelectorAll<HTMLElement>('.hud-party-quick-row')].filter((row) => !row.hidden);

  it('a row per member: "level. name", cut to 13 bytes; the leader green after the HP tests; the HP bar 108 px wide', () => {
    const quick = open(party([LEAD, WEBBY, FAR]));
    expect(rows(quick).map((row) => row.querySelector('.hud-party-quick-text')!.textContent)).toEqual([
      '20. Lead', '15. Webby', '17-M. Faraway...',
    ]);
    // the leader at 0 HP is still green; Webby below 10 % yellow; the far member grey
    expect(rows(quick).map((row) => row.dataset.color)).toEqual(['ff1fb72d', 'ffffff00', 'ff878787']);
    // MulDiv( 20, 108, 230 ) = 9; none out of view
    expect(rows(quick).map((row) => row.querySelector<HTMLElement>('.hud-party-quick-fill')!.style.width)).toEqual(['0px', '9px', '0px']);
    // SetActiveMember( 3 ): 60 + 34 x 3 tall
    expect(quick.frame.element.style.height).toBe('162px');
  });

  it('only the clicked member is lit; a member in view becomes the target, the own row clears it', () => {
    const quick = open(party([LEAD, WEBBY, FAR]));
    const select = vi.fn();
    quick.onSelect = select;
    expect(rows(quick).filter((row) => row.dataset.lit !== undefined)).toEqual([]);
    rows(quick)[0]!.click();
    expect(rows(quick).map((row) => row.dataset.lit !== undefined)).toEqual([true, false, false]);
    rows(quick)[1]!.click();
    rows(quick)[2]!.click();
    expect(select.mock.calls).toEqual([[LEAD], [null]]);
    quick.ignoreClicks = true;
    rows(quick)[0]!.click();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('the quick view closes below 2', () => {
    const state = party([LEAD, WEBBY]);
    const quick = open(state);
    const detail = vi.fn();
    quick.onDetail = detail;
    quick.frame.element.querySelector<HTMLButtonElement>('.hud-party-quick-detail')!.click();
    expect(detail).toHaveBeenCalledTimes(1);
    state.apply({ type: 'partyMember', playerId: LEAD, leaderName: '', memberName: '', party: null });
    quick.update(view(state));
    expect(quick.frame.isOpen).toBe(false);
  });
});

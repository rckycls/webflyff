// @vitest-environment jsdom
// The invite box (Piece 7 M4, [R §5.4]): `CWndPartyConfirm`, APP_PARTY_CONFIRM.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageOf } from '@flyffweb/protocol';
import type { UiArt } from '../src/world/hud/art';
import { PartyConfirm } from '../src/world/hud/party/partyConfirm';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const REQUEST: MessageOf<'partyRequest'> = {
  type: 'partyRequest', leader: { id: 70002, level: 20, job: 1, sex: 0 }, member: { id: 70001, level: 15, job: 4, sex: 1 },
  leaderName: 'Lead', troup: 0,
};
const TEXT = 'Lead invites you to join the party. Do you accept?';

function setup() {
  const box = new PartyConfirm(art);
  document.body.append(box.frame.element);
  const yes = vi.fn();
  const no = vi.fn();
  box.onYes = yes;
  box.onNo = no;
  const press = (name: string) => box.frame.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!.click();
  return { box, yes, no, press };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartyConfirm', () => {
  it('shows "<leader> invites you to join the party. Do you accept?"', () => {
    const { box } = setup();
    box.open(REQUEST, TEXT);
    expect([box.isOpen, box.frame.element.querySelector('.hud-party-confirm-text')!.textContent]).toEqual([true, TEXT]);
  });

  it('Yes calls onYes with the request, No and the close button onNo', () => {
    const { box, yes, no, press } = setup();
    box.open(REQUEST, TEXT);
    press('yes');
    expect([yes.mock.calls, no.mock.calls, box.isOpen]).toEqual([[[REQUEST]], [], false]);
    box.open(REQUEST, TEXT);
    press('no');
    expect([no.mock.calls, box.isOpen]).toEqual([[[REQUEST]], false]);
    box.open(REQUEST, TEXT);
    box.frame.close();
    expect(no).toHaveBeenCalledTimes(2);
  });

  it('the box answers once', () => {
    const { box, yes, no, press } = setup();
    box.open(REQUEST, TEXT);
    press('yes');
    press('no');
    press('yes');
    expect([yes.mock.calls.length, no.mock.calls.length]).toEqual([1, 0]);
  });
});

// The party's quick view (Piece 7 M4, [R §7.3]): `CWndPartyQuick`, APP_PARTY_QUICK, which P opens with the party window.
//
//   resdata.inc APP_PARTY_QUICK      Resource/resdata.inc:4967-5059       "WndTile00.tga" tiled, 144 x 336, "Party Window";
//                                                                         WIDC_STATIC_MEM1-8 ("WndEditTile00.tga" tiled) at
//                                                                         (10, 8 + 34 k)-(122, 32 + 34 k); WIDC_BUTTON1, no
//                                                                         picture, "Detailed Party Display."
//   CWndPartyQuick::SetActiveMember  _Interface/WndPartyQuick.cpp:311-349 rows 1..n shown, the window 60 + 34 n tall, the
//                                                                         button at (114, height − 50), 10 x 10
//   CWndPartyQuick::OnDraw           WndPartyQuick.cpp:62-205             per row: the clicked member lit 0x60ffff00; out of
//                                                                         view grey (black logged out), in view black, red at
//                                                                         0 HP, yellow under 10 %, the leader green after
//                                                                         those; "%d. %s" (or "%d-M. %s", "%d-H. %s") cut to
//                                                                         13 bytes + "...", at (left + 5, top + 5); the HP
//                                                                         bar top + 18 to the bottom, 108 px: GauEmptySmall,
//                                                                         its fill GauFillSmall 0x64ff0000 MulDiv( HP, 108,
//                                                                         max ), none out of view
//   CWndPartyQuick::OnLButtonUp      WndPartyQuick.cpp:245-280            a row: the member in view the target, the own row
//                                                                         none, a far one nothing else (auto-attack: ignored)
//   CWndMgr::Process                 _Interface/WndManager.cpp:3613-3622  closed every frame below 2 members
//
// Neuz lights every member out of view while no member in view was clicked (two NULL pointers equal): the browser lights
// the clicked member alone (plan Decisions 9).

import { cutName, levelMark } from '../../party/partyRules';
import type { UiArt } from '../art';
import { themeUrl } from '../art';
import { place } from '../button';
import { WindowFrame } from '../frame';
import { EDIT, editTiles } from '../tiles';
import type { MemberView, PartyView } from './memberList';

const WIDTH = 144;
/** `SetActiveMember`: 60 + 34 a member. */
const BASE_HEIGHT = 60;
const PITCH = 34;
/** The rows: 112 x 24 from (10, 8). */
const ROW_LEFT = 10;
const ROW_TOP = 8;
const ROW_WIDTH = 112;
const ROW_HEIGHT = 24;
/** The HP bar under the text: 18 px down, 2 px in, 108 px. */
const BAR_TOP = 18;
const BAR_WIDTH = 108;
/** `MAX_PARTY_MEMBER` (WndPartyQuick.cpp:16-19). */
const ROWS = 8;
const NAME_BYTES = 13;

/** A row's colour, ARGB (`OnDraw`, :82-93): the leader's green comes after the HP tests, in view only. */
export function quickColor(member: MemberView, isLeader: boolean): number {
  if (!member.inView) return member.removed ? 0xff000000 : 0xff878787;
  if (isLeader) return 0xff1fb72d;
  if (member.hp === 0) return 0xffff0000;
  if (member.maxHp > 0 && Math.fround(member.hp / member.maxHp) < Math.fround(0.1)) return 0xffffff00;
  return 0xff000000;
}

const hex = (argb: number): string => (argb >>> 0).toString(16).padStart(8, '0');

export class PartyQuick {
  readonly frame: WindowFrame;
  /** True while a press may not select (the auto-attack, the task bar running). */
  ignoreClicks = false;
  /** A member in view pressed: the target (its id); the own row: none (null). */
  onSelect: (playerId: number | null) => void = () => {};
  /** The small button: the party window on or off. */
  onDetail: () => void = () => {};
  private readonly rows: HTMLElement[];
  private readonly detail: HTMLButtonElement;
  /** `m_pFocusMember`: the member last clicked. */
  private lit: number | null = null;
  private view: PartyView | null = null;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const frame = new WindowFrame('Party Window', art, { width: WIDTH, height: BASE_HEIGHT + PITCH * 2, mobileScale: 0.63 }, doc);
    frame.element.classList.add('hud-party-quick-window');
    this.rows = Array.from({ length: ROWS }, (_, k) => {
      const row = doc.createElement('div');
      row.className = 'hud-party-quick-row';
      place(row, { left: ROW_LEFT, top: ROW_TOP + PITCH * k, width: ROW_WIDTH, height: ROW_HEIGHT });
      row.append(editTiles(doc, art, ROW_WIDTH / EDIT, ROW_HEIGHT / EDIT));
      const text = doc.createElement('div');
      text.className = 'hud-party-quick-text';
      place(text, { left: 5, top: 5, width: ROW_WIDTH - 5, height: 12 });
      const bar = doc.createElement('div');
      bar.className = 'hud-party-quick-bar';
      place(bar, { left: 2, top: BAR_TOP, width: BAR_WIDTH, height: ROW_HEIGHT - BAR_TOP });
      bar.style.backgroundImage = themeUrl(art, 'GauEmptySmall.bmp');
      const fill = doc.createElement('div');
      fill.className = 'hud-party-quick-fill';
      fill.style.backgroundImage = themeUrl(art, 'GauFillSmall.bmp');
      bar.append(fill);
      row.append(text, bar);
      row.hidden = true;
      row.addEventListener('click', () => this.press(k));
      frame.body.append(row);
      return row;
    });
    this.detail = doc.createElement('button');
    this.detail.type = 'button';
    this.detail.className = 'hud-party-quick-detail';
    this.detail.title = 'Detailed Party Display.';
    this.detail.addEventListener('click', () => this.onDetail());
    frame.body.append(this.detail);
    this.frame = frame;
  }

  /** Every frame while open: its rows, its height; below 2 members it closes. */
  update(view: PartyView): void {
    this.view = view;
    const party = view.party;
    const n = Math.min(party.size(), ROWS);
    if (n < 2) {
      if (this.frame.isOpen) this.frame.close();
      return;
    }
    const height = BASE_HEIGHT + PITCH * n;
    this.frame.setHeight(height);
    place(this.detail, { left: 114, top: height - 50, width: 10, height: 10 });
    if (this.lit !== null && !party.isMember(this.lit)) this.lit = null;
    this.rows.forEach((row, k) => {
      const member = k < n ? view.members[k] : undefined;
      row.hidden = member === undefined;
      if (member === undefined) return;
      row.dataset.player = String(member.playerId);
      row.toggleAttribute('data-lit', member.playerId === this.lit);
      row.dataset.color = hex(quickColor(member, k === 0));
      const text = row.querySelector<HTMLElement>('.hud-party-quick-text')!;
      text.textContent = cutName(`${member.level}${levelMark(member.job)}. ${member.name}`, NAME_BYTES);
      text.style.color = `#${hex(quickColor(member, k === 0)).slice(2)}`;
      const width = member.inView && member.maxHp > 0 ? Math.min(BAR_WIDTH, Math.trunc((member.hp * BAR_WIDTH) / member.maxHp)) : 0;
      row.querySelector<HTMLElement>('.hud-party-quick-fill')!.style.width = `${width}px`;
    });
  }

  private press(k: number): void {
    const view = this.view;
    if (this.ignoreClicks || view === null) return;
    const member = view.members[k];
    if (member === undefined) return;
    this.lit = member.playerId;
    if (member.playerId === view.ownPlayerId) this.onSelect(null);
    else if (member.inView) this.onSelect(member.playerId);
    this.update(view);
  }
}

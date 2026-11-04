// The party window's member list, tab "Information" (Piece 7 M4, [R §7.2]): `CWndPartyInfo::OnDraw`, every frame.
//
//   CWndPartyInfo::OnDraw         _Interface/WndParty.cpp:502-720   a row per member at y = 10 + 15 i: the selection's fill
//                                                                   (5, 8 + 15 s)-(410, 22 + 15 s) 0x60ffff00; a 10 x 10
//                                                                   black box at (10, y), filled by the member's state
//                                                                   (:538-558); the text black, the leader's green
//                                                                   (:561-563); the level at x 30 with "-M"/"-H", "L" or
//                                                                   "M" at x 80, the job's name at x 120, the name at
//                                                                   x 180 cut to 8 bytes + "..." (:679-693); the HP bar
//                                                                   (280, y)-(390, y + 12): GauEmptyNormal.bmp, its fill
//                                                                   the same picture 0x64ff0000, 110 x HP / max HP wide,
//                                                                   in view only (:702-716, :747-748)
//   CWndPartyInfo::OnLButtonDown  WndParty.cpp:783-824              inside (10, 10)-(365, 10 + 15 n) a row: another member
//                                                                   in view is the target, the own row clears it, a far one
//                                                                   leaves it; elsewhere the selection and the target go
//
// German and French move the columns (`bSummary`): the English client does not.

import type { WebParty } from '@flyffweb/formats';
import type { Texts } from '../../gameData';
import type { PartyState } from '../../party/partyState';
import { cutName, levelMark, memberBoxColor, memberTextColor } from '../../party/partyRules';
import { cssRgb, themeUrl } from '../art';
import type { UiArt } from '../art';
import { place } from '../button';

/** A member as the screen sees it: from its mover in view, else from the player data. */
export interface MemberView {
  playerId: number;
  inView: boolean;
  removed: boolean;
  level: number;
  job: number;
  jobName: string;
  name: string;
  hp: number;
  maxHp: number;
}

/** What the party windows draw from, every frame. */
export interface PartyView {
  party: PartyState;
  ownPlayerId: number;
  /** In slot order, as `party.members`. */
  members: MemberView[];
  /** The party catalog's EXP rows (`expParty`); empty without the catalog. */
  exp: ReadonlyArray<{ exp: number }>;
  /** Piece 7 M4: the party catalog, for the Skill tab; none without it. */
  catalog?: WebParty | null;
}

export interface MemberRow {
  playerId: number;
  y: number;
  selected: boolean;
  /** The box's colour and the text's, ARGB. */
  box: number;
  text: number;
  level: string;
  mark: string;
  job: string;
  name: string;
  /** The HP fill's width, px; 0 out of view. */
  hpWidth: number;
}

/** The rows' first line and their pitch. */
const TOP = 10;
const PITCH = 15;
/** The HP bar: 110 x 12 at x 280. */
const HP_LEFT = 280;
const HP_WIDTH = 110;
const HP_HEIGHT = 12;
/** A name's bytes before "..." */
const NAME_BYTES = 8;
/** The click zone's right edge (`OnLButtonDown`, :797). */
const ZONE_RIGHT = 365;
/** The text columns: their left and their key. */
const COLUMNS: ReadonlyArray<[number, string]> = [[30, 'level'], [80, 'mark'], [120, 'job'], [180, 'name']];

export function memberRows(view: PartyView, selected: number | null, texts: Texts): MemberRow[] {
  const text = (id: string, english: string): string => texts.get(id)?.text ?? english;
  return view.members.map((member, i) => ({
    playerId: member.playerId,
    y: TOP + PITCH * i,
    selected: member.playerId === selected,
    box: memberBoxColor(member),
    text: memberTextColor(i === 0),
    level: `${member.level}${levelMark(member.job)}`,
    mark: i === 0 ? text('TID_GAME_LEADER', 'L') : text('TID_GAME_MEMBER', 'M'),
    job: member.jobName,
    name: cutName(member.name, NAME_BYTES),
    hpWidth: member.inView && member.maxHp > 0 ? Math.trunc((HP_WIDTH * member.hp) / member.maxHp) : 0,
  }));
}

/**
 * The list's panel: one element per row. The rows are made again only when the members change; an HP step, a colour or
 * the selection updates a row in place, so that a press is not lost to a row made again between its down and its up.
 */
export class MemberList {
  readonly element: HTMLElement;
  /** A row was pressed (its player id), or the panel outside the rows (null). */
  onPress: (playerId: number | null) => void = () => {};
  private shown = '';
  /** The members the row elements were made for, in order. */
  private members = '';

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'hud-party-members';
    element.addEventListener('click', (event) => {
      const row = (event.target as Element | null)?.closest?.('.hud-party-row') as HTMLElement | null;
      this.onPress(row === null ? null : Number(row.dataset.player));
    });
    this.element = element;
  }

  update(rows: readonly MemberRow[]): void {
    const key = JSON.stringify(rows);
    if (key === this.shown) return;
    this.shown = key;
    const members = rows.map((row) => row.playerId).join(',');
    if (members !== this.members) {
      this.members = members;
      this.element.replaceChildren(...rows.map((row) => this.rowElement(row)));
    }
    rows.forEach((row, i) => this.fill(this.element.children[i] as HTMLElement, row));
  }

  private rowElement(row: MemberRow): HTMLElement {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'hud-party-row';
    element.dataset.player = String(row.playerId);
    place(element, { left: 0, top: row.y - 2, width: ZONE_RIGHT, height: PITCH });
    const at = (cls: string, left: number, top: number, width: number, height: number): HTMLElement => {
      const part = doc.createElement('div');
      part.className = cls;
      place(part, { left, top: top + 2, width, height });
      element.append(part);
      return part;
    };
    at('hud-party-selected', 5, -2, 405, 14).hidden = true;
    at('hud-party-box', 10, 0, 10, 10);
    at('hud-party-box-fill', 11, 1, 8, 8);
    for (const [left, key] of COLUMNS) at('hud-party-text', left, -2, 100, PITCH).dataset.column = key;
    const bar = at('hud-party-hp', HP_LEFT, 0, HP_WIDTH, HP_HEIGHT);
    bar.style.backgroundImage = themeUrl(this.art, 'GauEmptyNormal.bmp');
    const fill = doc.createElement('div');
    fill.className = 'hud-party-hp-fill';
    fill.style.backgroundImage = themeUrl(this.art, 'GauEmptyNormal.bmp');
    bar.append(fill);
    return element;
  }

  /** A row's parts from `row`, written only where they differ. */
  private fill(element: HTMLElement, row: MemberRow): void {
    const set = (part: HTMLElement, prop: 'width' | 'color' | 'backgroundColor', value: string): void => {
      if (part.style[prop] !== value) part.style[prop] = value;
    };
    element.querySelector<HTMLElement>('.hud-party-selected')!.hidden = !row.selected;
    set(element.querySelector<HTMLElement>('.hud-party-box-fill')!, 'backgroundColor', cssRgb(row.box));
    const values: Readonly<Record<string, string>> = { level: row.level, mark: row.mark, job: row.job, name: row.name };
    for (const text of element.querySelectorAll<HTMLElement>('.hud-party-text')) {
      const value = values[text.dataset.column!] ?? '';
      if (text.textContent !== value) text.textContent = value;
      set(text, 'color', cssRgb(row.text));
    }
    set(element.querySelector<HTMLElement>('.hud-party-hp-fill')!, 'width', `${row.hpWidth}px`);
  }
}

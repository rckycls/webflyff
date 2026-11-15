// The line-up window (2026-11-15, B4; A-client.md §2.3): the guild master's list of fighters, their order and the defender.
//
//   CWndGuildCombatSelection   WndField.cpp:15840-16369   APP_GUILDCOMBAT_SELECTION, resdata.inc:515, 656 x 432,
//                                                         "Set Entry List for Guild Siege"
//   WIDC_LISTBOX1   the online guild members, level ascending, one row each: level, name (16 letters), job (10) (:15972-16024)
//   WIDC_LISTBOX2   the entrants in fighting order; blue behind the first `maxWar` rows, red behind the rest (:16075-16087)
//   WIDC_BUTTON8    the defender's marker, at (330, i * 17 + 75) beside the defender's row (:16048-16073)
//   Fill            the saved entrants go in the right list and STAY in the left one (DPClient.cpp:6955-6963)
//
// What the buttons refuse is the rules' (guildCombatRules.ts: lineupAddRefusal, defenderRefusal, lineupFinishRefusal); the
// window shows the refusal through `deps.refuse` and sends the result through `deps.send`.

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { defenderRefusal, lineupAddRefusal, lineupBand, lineupFinishRefusal } from '../../guildCombat/guildCombatRules';
import { GuildRank } from '../../guild/guildRules';

const EDIT = 'WndEditTile00.tga';
/** A row's pitch in both lists, and where the right list's first row starts (`i * 17 + 75`). */
const ROW = 17;

/** A guild member as the window lists him. */
export interface LineupPerson {
  playerId: number;
  name: string;
  jobName: string;
  level: number;
  online: boolean;
  /** `m_nMemberLv`: GUD_MASTER 0, GUD_KINGPIN 1 ... */
  rank: number;
}

/** What the window asks of the hud. */
export interface LineupDeps {
  /** A refusal's box (the text's number, `maxJoin` for the one that has a %d). */
  refuse(tid: number, maxJoin: number): void;
  /** Remake's OK / Cancel box. */
  remake(ok: () => void): void;
  /** Complete's state check: false when the siege is no longer taking line-ups (the hud shows its box and the window closes). */
  stillOpen(): boolean;
  send(defenderId: number, ids: readonly number[]): void;
}

export const lineupLayout = (title: string): ResLayout => ({
  title, width: 656, height: 432,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC3', rect: [24, 18, 624, 42] },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [24, 52, 278, 74], text: 'Connected Guild Member List' },
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [22, 72, 284, 284], tile: EDIT },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [284, 136, 325, 156], picture: 'Buttright2.bmp', label: '--->', quarter: 41 },
    { kind: 'button', id: 'WIDC_BUTTON2', rect: [284, 192, 325, 212], picture: 'Buttleft2.bmp', label: '<---', quarter: 41 },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [348, 52, 596, 70], text: 'Entrant List for Guild Siege' },
    { kind: 'list', id: 'WIDC_LISTBOX2', rect: [348, 72, 604, 380], tile: EDIT },
    { kind: 'button', id: 'WIDC_BUTTON3', rect: [604, 166, 624, 207], picture: 'ButtUp.tga', label: 'Up', quarter: 20 },
    { kind: 'button', id: 'WIDC_BUTTON4', rect: [604, 242, 624, 283], picture: 'ButtDown.tga', label: 'Down', quarter: 20 },
    { kind: 'static', id: 'WIDC_BUTTON8', rect: [328, 82, 344, 98], picture: 'ButtDefenderIcon.tga' },
    { kind: 'button', id: 'WIDC_FINISH', rect: [58, 318, 130, 338], picture: 'ButtFinish.BMP', label: 'Complete', quarter: 72 },
    { kind: 'button', id: 'WIDC_RESET', rect: [158, 318, 230, 338], picture: 'ButtReset.BMP', label: 'Remake', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON7', rect: [58, 352, 130, 372], picture: 'ButtGWDefender.tga', label: 'Defender', quarter: 72 },
    { kind: 'button', id: 'WIDC_CLOSE', rect: [158, 352, 230, 374], picture: 'ButtClose.tga', label: 'Close', quarter: 72 },
  ],
});

export class LineupWindow {
  readonly window: ResWindow;
  private people: LineupPerson[] = [];
  private maxJoin = 0;
  private maxWar = 0;
  /** The entrants in fighting order, and the defender (0: none). */
  private list: number[] = [];
  private defenderId = 0;
  private pickedLeft = 0;
  private pickedRight = -1;

  constructor(title: string, art: UiArt, private readonly deps: LineupDeps, private readonly doc: Document = document) {
    const window = new ResWindow(lineupLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-lineup');
    window.button('WIDC_BUTTON1').addEventListener('click', () => this.add());
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.remove());
    window.button('WIDC_BUTTON3').addEventListener('click', () => this.move(-1));
    window.button('WIDC_BUTTON4').addEventListener('click', () => this.move(1));
    window.button('WIDC_BUTTON7').addEventListener('click', () => this.defender());
    window.button('WIDC_FINISH').addEventListener('click', () => this.finish());
    window.button('WIDC_RESET').addEventListener('click', () => this.deps.remake(() => this.reset()));
    window.button('WIDC_CLOSE').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  setTitle(title: string): void {
    this.window.frame.setTitle(title);
  }

  /** The entrants now, in order, and the defender. */
  get entrants(): { ids: readonly number[]; defenderId: number } {
    return { ids: this.list, defenderId: this.defenderId };
  }

  /** GC_SELECTPLAYER: the limits, the saved entrants (they stay in the left list), the info line. */
  open(info: { maxJoin: number; maxWar: number; defenderId: number; playerIds: readonly number[]; infoText: string }, people: readonly LineupPerson[]): void {
    this.people = [...people];
    this.maxJoin = info.maxJoin;
    this.maxWar = info.maxWar;
    this.list = [...info.playerIds];
    this.defenderId = this.list.includes(info.defenderId) ? info.defenderId : 0;
    this.pickedLeft = 0;
    this.pickedRight = -1;
    this.window.setText('WIDC_STATIC3', info.infoText);
    this.drawLeft();
    this.drawRight();
    if (!this.window.isOpen) this.window.open();
  }

  close(): void {
    this.window.close();
  }

  private person(id: number): LineupPerson | undefined {
    return this.people.find((p) => p.playerId === id);
  }

  private row(text: string[], selected: boolean, pick: () => void): HTMLElement {
    const row = this.doc.createElement('div');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(selected));
    row.classList.toggle('is-selected', selected);
    for (const [i, part] of text.entries()) {
      const cell = this.doc.createElement('span');
      cell.className = i === 0 ? 'hud-gc-no' : 'hud-gc-name';
      cell.textContent = part;
      row.append(cell);
    }
    row.addEventListener('click', pick);
    return row;
  }

  private label(p: LineupPerson | undefined, id: number): string[] {
    if (p === undefined) return ['', `#${id}`];
    return [`Lv${String(p.level).padStart(2, '0')}`, `${p.name.slice(0, 16)} ${p.jobName.slice(0, 10)}`];
  }

  /** The online members, the lowest level first (`:15972-16024`). */
  private drawLeft(): void {
    const online = this.people.filter((p) => p.online).sort((a, b) => a.level - b.level);
    this.window.control('WIDC_LISTBOX1').replaceChildren(...online.map((p) => {
      const row = this.row(this.label(p, p.playerId), p.playerId === this.pickedLeft, () => {
        this.pickedLeft = p.playerId;
        this.drawLeft();
      });
      row.dataset.playerId = String(p.playerId);
      return row;
    }));
  }

  private drawRight(): void {
    const rows = this.list.map((id, i) => {
      const row = this.row(this.label(this.person(id), id), i === this.pickedRight, () => { this.pickedRight = i; this.drawRight(); });
      row.classList.add(`is-${lineupBand(i, this.maxWar)}`);
      row.classList.toggle('is-defender', id === this.defenderId);
      row.dataset.playerId = String(id);
      return row;
    });
    this.window.control('WIDC_LISTBOX2').replaceChildren(...rows);
    const marker = this.window.control('WIDC_BUTTON8').parentElement!;
    const at = this.list.indexOf(this.defenderId);
    marker.hidden = at < 0;
    if (at >= 0) { marker.style.left = '330px'; marker.style.top = `${at * ROW + 75}px`; }
  }

  private add(): void {
    if (this.pickedLeft === 0) return;
    const found = this.person(this.pickedLeft);
    const refusal = lineupAddRefusal(found === undefined ? null : { playerId: found.playerId, level: found.level }, this.list, this.maxJoin);
    if (refusal !== null) { this.deps.refuse(refusal, this.maxJoin); return; }
    this.list.push(this.pickedLeft);
    this.drawRight();
  }

  private remove(): void {
    if (this.pickedRight < 0 || this.pickedRight >= this.list.length) return;
    const [gone] = this.list.splice(this.pickedRight, 1);
    if (gone === this.defenderId) this.defenderId = 0;
    this.pickedRight = Math.min(this.pickedRight, this.list.length - 1);
    this.drawRight();
  }

  private move(step: -1 | 1): void {
    const from = this.pickedRight, to = from + step;
    if (from < 0 || to < 0 || to >= this.list.length) return;
    [this.list[from], this.list[to]] = [this.list[to]!, this.list[from]!];
    this.pickedRight = to;
    this.drawRight();
  }

  private defender(): void {
    if (this.pickedRight < 0 || this.pickedRight >= this.list.length) return;
    const id = this.list[this.pickedRight]!;
    const master = this.people.find((p) => p.rank === GuildRank.MASTER)?.playerId ?? 0;
    const refusal = defenderRefusal(id, master, this.list.length);
    if (refusal !== null) { this.deps.refuse(refusal, this.maxJoin); return; }
    this.defenderId = id;
    this.drawRight();
  }

  private finish(): void {
    const leaders = this.people.filter((p) => p.rank <= GuildRank.KINGPIN).map((p) => p.playerId);
    const refusal = lineupFinishRefusal(this.list, this.defenderId, leaders);
    // Neuz checks the defender, then the state, then the rest (:16287-16345)
    if (this.defenderId === 0 && refusal !== null) { this.deps.refuse(refusal, this.maxJoin); return; }
    if (!this.deps.stillOpen()) { this.window.close(); return; }
    if (refusal !== null) { this.deps.refuse(refusal, this.maxJoin); return; }
    this.deps.send(this.defenderId, [...this.list]);
    this.window.close();
  }

  /** Remake's OK (`Reset`, :15844-15870): both lists start again. */
  private reset(): void {
    this.list = [];
    this.defenderId = 0;
    this.pickedLeft = 0;
    this.pickedRight = -1;
    this.drawLeft();
    this.drawRight();
  }
}

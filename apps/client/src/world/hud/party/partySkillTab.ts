// The party window's Skill tab (Piece 7 M4, [R §7.2]): `CWndPartySkill`.
//
//   CWndPartySkill::OnDraw         _Interface/WndParty.cpp:880-935    a 3 x 3 grid, a cell `width / 3` by `height / 3`
//                                                                     (integers), skill `row * 3 + col + 1`, the 9th empty;
//                                                                     the icon at (col * w + 3, row * h + 3), the name at
//                                                                     (col * w + 35, row * h + 6); an advanced party at the
//                                                                     skill's level or more: the name black and the icon
//                                                                     whole, else the name red and the icon at alpha 54
//   CWndPartySkill::OnMouseMove    WndParty.cpp:938-965               a drag, with the party level only: SHORTCUT_SKILL,
//                                                                     type 2, the skill's id and name
//   CWndPartySkill::OnLButtonDblClk WndParty.cpp:1001-1017            ObjectExecutor( SHORTCUT_SKILL, skill, 2 )
//   CWndMgr::PutToolTip_Troupe     _Interface/WndManager.cpp:4293-4325 the tooltip: the name, then the description

import type { WebParty } from '@flyffweb/formats';
import type { UiArt } from '../art';

const COLUMNS = 3;
const BLACK = 'rgb(0, 0, 0)';
const RED = 'rgb(255, 0, 0)';
const DIM = 54 / 255;

/** What the tab reads of the party. */
interface PartyLike {
  kind: number;
  level: number;
}

export class PartySkillTab {
  readonly element: HTMLElement;
  /** A double click on a skill: its id. */
  onUse: (skill: number) => void = () => {};
  /** A press on a skill the party's level allows, to carry to the task bar: its id and the press. */
  onDrag: (skill: number, event: PointerEvent) => void = () => {};
  /** What the cells were last made for: the party's kind and level, and the catalog. */
  private shown = '';
  private shownCatalog: WebParty | null = null;
  private party: PartyLike | null = null;

  /** `size`: the tab's client area (the tab control's less its strip). */
  constructor(private readonly art: UiArt, private readonly size: { width: number; height: number }, private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-party-skill-grid';
  }

  /** The cells from the party and the catalog (none without it). */
  update(party: PartyLike, catalog: WebParty | null): void {
    this.party = party;
    const key = `${party.kind}:${party.level}`;
    if (key === this.shown && catalog === this.shownCatalog) return;
    this.shown = key;
    this.shownCatalog = catalog;
    if (catalog === null) {
      this.element.replaceChildren();
      return;
    }
    const w = Math.trunc(this.size.width / COLUMNS);
    const h = Math.trunc(this.size.height / COLUMNS);
    const cells: HTMLElement[] = [];
    for (let i = 0; i < COLUMNS * COLUMNS - 1; i++) {
      const skill = catalog.skills.find((s) => s.id === i + 1);
      if (skill === undefined) continue;
      const col = i % COLUMNS, row = Math.trunc(i / COLUMNS);
      const usable = party.kind !== 0 && party.level >= skill.level;
      const cell = this.doc.createElement('div');
      cell.className = 'hud-party-skill';
      cell.dataset.skill = String(skill.id);
      cell.title = `${skill.name}\n${skill.description}`;
      const icon = this.doc.createElement('img');
      icon.alt = '';
      icon.draggable = false;
      icon.src = skill.icon === null ? '' : this.art.url(skill.icon);
      Object.assign(icon.style, { position: 'absolute', left: `${col * w + 3}px`, top: `${row * h + 3}px`, width: '32px', height: '32px', opacity: usable ? '1' : String(DIM) });
      const name = this.doc.createElement('div');
      name.className = 'hud-party-skill-name';
      name.textContent = skill.name;
      Object.assign(name.style, { position: 'absolute', left: `${col * w + 35}px`, top: `${row * h + 6}px`, color: usable ? BLACK : RED });
      cell.append(icon, name);
      cell.addEventListener('dblclick', () => this.onUse(skill.id));
      cell.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || this.party === null || this.party.level < skill.level) return;
        this.onDrag(skill.id, event);
      });
      cells.push(cell);
    }
    this.element.replaceChildren(...cells);
  }
}

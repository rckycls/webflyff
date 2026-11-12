// 2026-11-13 (owner, "create an action slot window to set up skills to add or remove"): the phone's window for the task bar's
// action slot (`m_aSlotQueue`, the chain of up to five skills the action button runs). Neuz sets it with the mouse: a skill
// of the skill window dragged on it (`CWndTaskBar::SetSkillQueue`), a right click taking one out (`RemoveSkillQueue`); a
// finger has neither. A tap on the bar's action slot opens it: the five slots, each skill with × to take it out (Neuz's
// rule: the skills after it that can then no longer follow go too), and the player's skills, a tap adding one after the
// last when Neuz's rules let it go there (the combo order, a cool-down, five at most, not while the chain runs). Each edit is
// the task bar's own (taskBarEdits.ts), so the same SKILLTASKBAR goes to the server.

import type { UiArt } from './art';
import { WindowFrame } from './frame';
import { textButton } from './numpad';

/** A skill as the window shows it: its slot of `m_aJobSkill`, its name and its picture (a URL, or null). */
export interface ActionSlotEntry {
  skillIndex: number;
  name: string;
  icon: string | null;
}

/** What the window asks of the task bar. */
export interface ActionSlotHost {
  /** The action slot's five slots: the skill of each, null for an empty one. */
  queue(): ReadonlyArray<ActionSlotEntry | null>;
  /** The player's job skills at a level above 0, in skill slot order. */
  skills(): ReadonlyArray<ActionSlotEntry>;
  /** Whether a tap would add the skill after the last (`TaskBarEdits.canQueue`). */
  canAdd(skillIndex: number): boolean;
  /** Adds it after the last (`TaskBarEdits.queueSkill`, SKILLTASKBAR). */
  add(skillIndex: number): void;
  /** Takes slot `slot`'s skill out (`RemoveSkillQueue`, SKILLTASKBAR). */
  remove(slot: number): void;
  /** The chain runs (`m_nExecute`): nothing can change. */
  running(): boolean;
}

const WIDTH = 440;
const HEIGHT = 300;

export class ActionSlotWindow {
  readonly frame: WindowFrame;
  /** What was drawn, as a string, to draw only what changed. */
  private shown = '';

  constructor(private readonly art: UiArt, private readonly host: ActionSlotHost, private readonly doc: Document = document) {
    this.frame = new WindowFrame('Action Slot', art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-action-slot-window');
    this.frame.onClose = () => { this.shown = ''; };
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Opens it centred above the bar, or closes it. */
  toggle(): void {
    if (this.frame.isOpen) {
      this.frame.close();
      return;
    }
    this.frame.open('center');
    this.shown = '';
    this.update();
  }

  /** Draws the slots and the skills as they are now (each frame while it is open; only a change is drawn). */
  update(): void {
    if (!this.frame.isOpen) return;
    const queue = this.host.queue();
    const skills = this.host.skills();
    const running = this.host.running();
    const addable = skills.map((skill) => this.host.canAdd(skill.skillIndex));
    const key = JSON.stringify([queue, skills, addable, running]);
    if (key === this.shown) return;
    this.shown = key;
    const doc = this.doc;

    const row = doc.createElement('div');
    row.className = 'action-slot-row';
    row.setAttribute('role', 'list');
    row.setAttribute('aria-label', 'Action slot');
    queue.forEach((entry, i) => {
      const cell = doc.createElement('div');
      cell.className = 'action-slot-cell';
      cell.setAttribute('role', 'listitem');
      cell.dataset.slot = String(i);
      if (entry === null) {
        cell.textContent = String(i + 1);
        cell.dataset.empty = '';
      } else {
        cell.append(this.picture(entry));
        const name = doc.createElement('span');
        name.className = 'action-slot-name';
        name.textContent = entry.name;
        const remove = textButton(doc, '×', () => this.host.remove(i), 'remove', 'actionSlot');
        remove.setAttribute('aria-label', `Take ${entry.name} out`);
        remove.disabled = running;
        cell.append(name, remove);
      }
      row.append(cell);
    });

    const hint = doc.createElement('p');
    hint.className = 'action-slot-hint';
    hint.textContent = running
      ? 'The chain is running: wait for it to end.'
      : 'Tap a skill to add it after the last. A chain starts with a step skill, goes on with circle skills and ends with a finish skill.';

    const list = doc.createElement('div');
    list.className = 'action-slot-skills';
    list.setAttribute('aria-label', 'Skills');
    skills.forEach((skill, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'action-slot-skill';
      button.dataset.skillIndex = String(skill.skillIndex);
      button.disabled = !addable[i];
      button.setAttribute('aria-label', `Add ${skill.name}`);
      const name = doc.createElement('span');
      name.textContent = skill.name;
      button.append(this.picture(skill), name);
      button.addEventListener('click', () => this.host.add(skill.skillIndex));
      list.append(button);
    });
    if (skills.length === 0) list.textContent = 'No skill learned yet.';

    this.frame.body.replaceChildren(row, hint, list);
  }

  dispose(): void {
    this.frame.close();
    this.frame.element.remove();
  }

  private picture(entry: ActionSlotEntry): HTMLElement {
    const icon = this.doc.createElement('span');
    icon.className = 'action-slot-icon';
    if (entry.icon !== null) icon.style.backgroundImage = `url(${JSON.stringify(entry.icon)})`;
    return icon;
  }
}

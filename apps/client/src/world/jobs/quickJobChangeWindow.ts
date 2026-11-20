// custom (owner 2026-11-20, "build this window pop up both for desktop and mobile after reaching the required level so they
// just click the job they want with another confirmation box that follows the same theme. except the blue text"): the Quick
// Job Change window (docs/superpowers/specs/2026-11-20-quick-job-change-design.md). V15 has no such window; it follows the
// owner's reference ("Quick Job Change", docs/quick-job-change/) in V15's own pieces:
//
//   the row      four portrait slots (scripts/renderJobPortraits.ts, the game's own models in the job's reward set): the
//                picked one in colour in an orange frame, the others grey; a locked or unused slot V15's Icon_Lock; a Master
//                or a Hero its second job's picture with V15's Master or Hero mark
//   the name     a group box's white title (the project's rule: no blue), centred
//   the text     the job's description in a V15 box of words with its scroll bar
//   under it     V15's small arrows (ButtLeft2 / ButtRight2) step through the open jobs; Go! between them
//   Go!          a Yes/No box in the same theme; Yes sends QUICK_JOB_CHANGE 0x8fff0130 and waits up to 2 s for the change
//                (as the Awaken window's lock); the World checks it all again and its job change closes the window
//
// The phone: the same pieces in a compact panel over the open bag (style.css, `.hud-quick-job`).

import type { UiArt } from '../hud/art';
import { textButton } from '../hud/numpad';
import { jobPortraitKey } from '../hud/ownIcons';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { JOB_NAMES, dueTier, jobDescription, jobSlots, nextChangeLevel } from './quickJobChange';
import type { JobSlot } from './quickJobChange';

/** The edit tiles of the box of words, and the group box of the name (as the Teleport window's). */
const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
/** V15's lock (Client/Icon/Icon_Lock.dds) and the Master's and Hero's marks (Icon_MasterMark1.dds, Icon_HeroMark.dds). */
const LOCK = 'ui/icon_lock.png';
const MASTER_MARK = 'ui/icon_mastermark1.png';
const HERO_MARK = 'ui/icon_heromark.png';
/** A Yes waits this long at most for the job change before Go! works again (the Awaken window's `LOCK_MS`). */
const LOCK_MS = 2000;

const yes = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtYes.tga', label: 'Yes', quarter: 72 });
const no = (id: string, rect: ResControl['rect']): ResControl =>
  ({ kind: 'button', id, rect, picture: 'ButtNo.tga', label: 'No', quarter: 72 });

/** The window: four portraits, the name, the words, the arrows and Go!. */
export const QUICK_JOB_LAYOUT: ResLayout = {
  title: 'Quick Job Change',
  width: 432,
  height: 336,
  controls: [
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [12, 8, 104, 120] },
    { kind: 'custom', id: 'WIDC_CUSTOM2', rect: [112, 8, 204, 120] },
    { kind: 'custom', id: 'WIDC_CUSTOM3', rect: [212, 8, 304, 120] },
    { kind: 'custom', id: 'WIDC_CUSTOM4', rect: [312, 8, 404, 120] },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [12, 128, 404, 146], group: GROUP },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 152, 404, 250], tile: EDIT, scroll: true },
    // ButtLeft2.bmp and ButtRight2.bmp are 164 x 20, four states of 41
    { kind: 'button', id: 'WIDC_LEFT', rect: [12, 262, 53, 282], picture: 'ButtLeft2.bmp', label: 'Previous job', quarter: 41 },
    { kind: 'custom', id: 'WIDC_GO', rect: [168, 260, 248, 284] },
    { kind: 'button', id: 'WIDC_RIGHT', rect: [363, 262, 404, 282], picture: 'ButtRight2.bmp', label: 'Next job', quarter: 41 },
  ],
};

/** The Yes/No box: the question, Yes and No (as the Awaken window's box, without its check box). */
export const QUICK_JOB_CONFIRM: ResLayout = {
  title: 'Quick Job Change', width: 336, height: 156, modal: true,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 10, 318, 84], tile: EDIT },
    yes('WIDC_YES', [74, 96, 146, 116]),
    no('WIDC_NO', [182, 96, 254, 116]),
  ],
};

/** What the window asks of the world screen. */
export interface QuickJobHost {
  /** The own player's job (`m_nJob`), level, EXP in units of 0.01 % (`GetExpPercent`) and sex (0 male, 1 female). */
  job(): number;
  level(): number;
  expPercent(): number;
  sex(): number;
  /** Whether the quest is current or completed (the class lock). */
  started(questId: number): boolean;
  /** Whether the quest is completed (a chain finished at the NPCs locks the window to its job). */
  done(questId: number): boolean;
  /** One of the window's own lines in the chat. */
  say(text: string): void;
  /** QUICK_JOB_CHANGE: the job picked. */
  send(job: number): void;
}

/** "a Knight", "an Acrobat". */
const withArticle = (name: string): string => `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;

export class QuickJobChangeWindow {
  readonly window: ResWindow;
  private readonly confirm: ResWindow;
  private readonly slotButtons: HTMLButtonElement[] = [];
  private readonly goButton: HTMLButtonElement;
  private slots: JobSlot[] = [];
  private picked = 0;
  /** When the last Yes's wait ends (`Date.now()`), or 0. */
  private lockUntil = 0;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether a press went down on the window since it opened: on a phone the tap that opened it would otherwise click. */
  private pressed = false;
  /** Whether the window is closing by the code (a job change), not by the player. */
  private closingByCode = false;
  /** Runs when the player closes the window (its button or Escape), not when a job change closes it. */
  onClosed: () => void = () => {};

  constructor(private readonly host: QuickJobHost, private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(QUICK_JOB_LAYOUT, art, doc);
    window.frame.element.classList.add('hud-quick-job');
    // above the phone's open bag, as the other windows a Start menu line opens
    window.frame.overBag = true;
    window.frame.element.addEventListener('pointerdown', () => { this.pressed = true; }, true);
    window.control('WIDC_STATIC1').classList.add('is-centred');
    for (let i = 0; i < 4; i++) {
      const slot = doc.createElement('button');
      slot.type = 'button';
      slot.className = 'quick-job-slot';
      slot.setAttribute('role', 'radio');
      slot.addEventListener('click', () => {
        if (!this.pressed) return;
        this.pick(i);
      });
      window.control(`WIDC_CUSTOM${i + 1}`).append(slot);
      this.slotButtons.push(slot);
    }
    window.button('WIDC_LEFT').addEventListener('click', () => this.step(-1));
    window.button('WIDC_RIGHT').addEventListener('click', () => this.step(1));
    const go = textButton(doc, 'Go!', () => this.go(), 'go', 'quickJob');
    go.classList.add('auto-word');
    // the phone's silver button's word (style.css)
    go.dataset.word = 'Go!';
    window.control('WIDC_GO').append(go);
    this.goButton = go;
    window.onClose = () => {
      this.confirm.close();
      if (!this.closingByCode) this.onClosed();
    };
    this.window = window;

    const confirm = new ResWindow(QUICK_JOB_CONFIRM, art, doc);
    confirm.frame.element.classList.add('hud-quick-job-confirm');
    confirm.button('WIDC_YES').addEventListener('click', () => this.yes());
    confirm.button('WIDC_NO').addEventListener('click', () => confirm.close());
    this.confirm = confirm;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** What goes in the windows' layer (the Yes/No box joins it when first shown). */
  get element(): HTMLElement {
    return this.window.element;
  }

  /** Opens centred on the first open job when a change is due; false, and nothing shown, when none is. */
  open(): boolean {
    const job = this.host.job();
    const tier = dueTier(job, this.host.level(), this.host.expPercent());
    if (tier === null) return false;
    this.slots = jobSlots(job, tier, (questId) => this.host.started(questId), (questId) => this.host.done(questId));
    this.picked = Math.max(0, this.slots.findIndex((slot) => slot.open));
    this.pressed = false;
    this.drawSlots();
    this.draw();
    this.window.open();
    return true;
  }

  /** The Start menu line: open it, close it, or with nothing due say when the next change opens. */
  toggle(): void {
    if (this.window.isOpen) {
      this.close();
      return;
    }
    if (this.open()) return;
    const job = this.host.job();
    const level = nextChangeLevel(job);
    if (level === null) this.host.say('There is no job change after Hero.');
    else if (level === 120) this.host.say('Your next job change opens at level 120 with 99.99% EXP.');
    else this.host.say(`Your next job change opens at level ${level}.`);
  }

  close(): void {
    this.confirm.close();
    this.window.close();
  }

  /** The own job changed (SET_JOB_SKILL): both boxes close and the wait ends. */
  jobChanged(): void {
    this.endLock();
    this.closingByCode = true;
    try {
      this.close();
    } finally {
      this.closingByCode = false;
    }
  }

  private pick(index: number): void {
    if (this.slots[index]?.open !== true) return;
    this.picked = index;
    this.draw();
  }

  /** The arrows: the next or the previous open job, round. */
  private step(direction: 1 | -1): void {
    const count = this.slots.length;
    for (let n = 1; n <= count; n++) {
      const index = (this.picked + direction * n + count * n) % count;
      if (this.slots[index]?.open === true) {
        this.picked = index;
        this.draw();
        return;
      }
    }
  }

  private go(): void {
    const job = this.slots[this.picked]?.job ?? null;
    if (job === null || this.locked()) return;
    const name = JOB_NAMES.get(job) ?? '';
    this.confirm.setText('WIDC_TEXT1', `Become ${withArticle(name)}? This can't be undone.`);
    if (!this.confirm.element.isConnected) this.window.element.parentElement?.append(this.confirm.element);
    this.confirm.open();
  }

  private yes(): void {
    this.confirm.close();
    const job = this.slots[this.picked]?.job ?? null;
    if (job === null || this.locked() || !this.window.isOpen) return;
    this.host.send(job);
    this.lockUntil = Date.now() + LOCK_MS;
    this.lockTimer = setTimeout(() => this.endLock(), LOCK_MS);
    this.draw();
  }

  private locked(): boolean {
    return this.lockUntil !== 0 && Date.now() < this.lockUntil;
  }

  private endLock(): void {
    if (this.lockTimer !== null) clearTimeout(this.lockTimer);
    this.lockTimer = null;
    this.lockUntil = 0;
    this.goButton.disabled = false;
  }

  /** The slots' pictures, names and locks, for the tier just opened. */
  private drawSlots(): void {
    const sex = this.host.sex();
    this.slots.forEach((slot, i) => {
      const button = this.slotButtons[i]!;
      const picture = this.doc.createElement('img');
      picture.className = 'quick-job-picture';
      picture.alt = '';
      picture.draggable = false;
      button.replaceChildren(picture);
      if (slot.job === null || !slot.open) button.toggleAttribute('data-locked', true);
      else button.removeAttribute('data-locked');
      if (slot.job === null) {
        delete button.dataset.job;
        button.setAttribute('aria-label', 'Locked');
        picture.src = this.art.url(LOCK);
        picture.classList.add('is-lock');
        return;
      }
      button.dataset.job = String(slot.job);
      button.setAttribute('aria-label', JOB_NAMES.get(slot.job) ?? '');
      picture.src = this.art.url(jobPortraitKey(slot.job, sex));
      if (slot.job >= 16) {
        const mark = this.doc.createElement('img');
        mark.className = 'quick-job-mark';
        mark.alt = '';
        mark.src = this.art.url(slot.job >= 24 ? HERO_MARK : MASTER_MARK);
        button.append(mark);
      }
      if (!slot.open) {
        const lock = this.doc.createElement('img');
        lock.className = 'quick-job-lock';
        lock.alt = '';
        lock.src = this.art.url(LOCK);
        button.append(lock);
      }
    });
  }

  /** The pick, its name and words, and Go!. */
  private draw(): void {
    this.slotButtons.forEach((button, i) => button.setAttribute('aria-checked', String(i === this.picked)));
    const job = this.slots[this.picked]?.job ?? null;
    this.window.setText('WIDC_STATIC1', job === null ? '' : JOB_NAMES.get(job) ?? '');
    this.window.setText('WIDC_TEXT1', job === null ? '' : jobDescription(job));
    this.goButton.disabled = job === null || this.locked();
  }
}

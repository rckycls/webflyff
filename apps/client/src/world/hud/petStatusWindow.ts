// The raised pet's status window (pets R2, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.3): `CWndPetStatus`, APP_PET_STATUS, laid out from its resdata.inc
// entry (`ResWindow`) and drawn as its `OnDraw` draws it.
//
//   APP_PET_STATUS                      Resource/resdata.inc:8798-8854           "WndTile00.tga" tiled, 192 x 160, the
//                                                                                face box, the two gauges, the steps' box
//                                                                                and WIDC_BUTTON1 (no picture)
//   CWndPetStatus::CWndPetStatus        _Interface/WndPetSys.cpp:174-218         the numbers start in mode 2, collapsed
//   CWndPetStatus::MakeGaugeVertex      WndPetSys.cpp:285-322                    the energy (red) and EXP (blue) gauges
//   CWndPetStatus::PaintFrame           WndPetSys.cpp:324-379                    the title: the pet's name (petTitle)
//   CWndPetStatus::DrawPetInformation   WndPetSys.cpp:381-518                    the texts, the steps' icons
//   CWndPetStatus::OnDraw               WndPetSys.cpp:520-771                    PetStatusBg.tga, the gauges, the numbers of
//                                                                                each mode, the portrait (petPortrait.ts)
//   CWndPetStatus::OnInitialUpdate      WndPetSys.cpp:802-836                    collapsed, beside APP_STATUS1 (else at
//                                                                                the layout's left + 192, top)
//   CWndPetStatus::OnMouseWndSurface    WndPetSys.cpp:838-919                    a step's tooltip, its icon lit
//   CWndPetStatus::SetExtension         WndPetSys.cpp:921-931                    48 px taller or shorter
//   CWndPetStatus::OnLButtonDown        WndPetSys.cpp:960-964                    a press cycles the numbers 2, 0, 1
//   CWndPetStatus::OnChildNotify        WndPetSys.cpp:976-984                    WIDC_BUTTON1 shows or hides the steps
//   CWndPetStatus::LockShowLevel        WndPetSys.cpp:1031-1052                  the miracle window keeps two steps' old
//                                                                                icons while it rolls (R3)
//
// Neuz makes the window anew each time it opens (`new CWndPetStatus`, `Initialize`): `open` puts it back as made.

import type { WebItemProp, WebMover, WebPets } from '@flyffweb/formats';
import type { InventoryItem, PetData } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import {
  availDestParam, petExpText, petGradeTid, petLife, petMaxEnergy, petMaxExp, petStatText, petTitle, stepValue,
} from '../pets/petStatus';
import { PetLevel } from '../pets/raisedPet';
import type { UiArt } from './art';
import { themeKey, themeUrl } from './art';
import type { WindowFrame } from './frame';
import { Gauge } from './gauge';
import { createTooltip, positionItemDetails } from './itemDetails';
import { ResWindow } from './resWindow';
import type { ResLayout } from './resWindow';
import { pointPercent } from './statusWindow';

const f32 = Math.fround;

/** APP_PET_STATUS (`resdata.inc:8798-8854`): its four custom controls; WIDC_BUTTON1 (no picture) is drawn here. */
export const PET_STATUS: ResLayout = {
  title: '', width: 192, height: 160,
  controls: [
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [8, 6, 72, 74] },
    { kind: 'custom', id: 'WIDC_CUSTOM2', rect: [102, 46, 177, 54] },
    { kind: 'custom', id: 'WIDC_CUSTOM3', rect: [102, 60, 177, 68] },
    { kind: 'custom', id: 'WIDC_CUSTOM4', rect: [6, 88, 176, 124] },
  ],
};

/** The window's height expanded (resdata.inc's 160) and the 48 px `SetExtension` takes off and gives back. */
const HEIGHT = 160;
const EXTENSION = 48;
/** The controls' rects in the client area (`GetWndCtrl( ... )->rect`). */
const FACE = { left: 8, top: 6 };
const HP = { left: 102, top: 46, right: 177 };
const EXP = { left: 102, top: 60, right: 177 };
const STEPS = { left: 6, top: 88, bottom: 124 };
const BUTTON = { left: 170, top: 74, width: 10, height: 10 };
/** `lpHP->rect.Width()`: both gauges' full width. */
const GAUGE_WIDTH = HP.right - HP.left;
/** The gauges' colours (`MakeGaugeVertex`, :307, :319). */
const ENERGY_COLOR = 0x64ff0000;
const EXP_COLOR = 0x847070ff;
/** The steps' icons: `PetLevelBg.tga` and each icon 2 px up and left of the box (:479), 35 px apart (:513); hit cells 34 wide (:848). */
const STEP_PITCH = 35;
const STEP_CELL = 34;
/** `m_pTexPetLv[i]->Render( ..., 120 )`: a step's icon not pointed at. */
const STEP_DIM = 120;

/** `m_nDisplay`: 2 the energy and its most, 1 its percent and points, 0 no numbers. */
type Display = 0 | 1 | 2;

/** What the window reads of the catalogs. */
export interface PetStatusData {
  texts: Texts;
  movers: ReadonlyMap<number, Pick<WebMover, 'name'>>;
  itemProps: ReadonlyMap<number, Pick<WebItemProp, 'name'>>;
  pets?: WebPets;
}

/**
 * The window. `open` makes it as Neuz makes it (numbers in mode 2, the steps hidden) beside the status window; `update`
 * draws the pet item's numbers each frame while it is open (`OnDraw`); the portrait's canvas goes in the face box
 * (`portraitBox`). A press on the window (not on its button) cycles the numbers; WIDC_BUTTON1 shows or hides the steps,
 * whose icons light and say their stat under the pointer.
 */
export class PetStatusWindow {
  readonly window: ResWindow;
  private display: Display = 2;
  private extension = false;
  /** `m_nChoiceLevel`: the level whose step is pointed at, -1 for none. */
  private choice = -1;
  /** `m_nLockLevel` and `m_nBackUpLevel` (`LockShowLevel`): two levels drawn with an older step, -1 for none. */
  private readonly locks: Array<{ level: number; step: number }> = [{ level: -1, step: -1 }, { level: -1, step: -1 }];
  private readonly gauges: { energy: Gauge; exp: Gauge };
  private readonly texts: {
    level: HTMLElement; ability: HTMLElement; life: HTMLElement; points: HTMLElement[]; exp: HTMLElement;
  };
  private readonly steps: HTMLElement;
  private readonly stepIcons: HTMLImageElement[] = [];
  private readonly stepCells: HTMLElement[] = [];
  private tooltip: HTMLElement | null = null;
  /** The pet item last drawn, for the steps' tooltips. */
  private item: InventoryItem | undefined;
  private shown = '';

  constructor(private readonly art: UiArt, private readonly data: PetStatusData, private readonly doc: Document = document) {
    const window = new ResWindow(PET_STATUS, art, doc);
    window.frame.element.classList.add('hud-pet-status');
    window.onClose = () => this.hideTooltip();
    this.window = window;
    const body = window.frame.body;

    // OnDraw: the picture under it all, at the face box's left - 12 and top - 6 (:528-531)
    const back = doc.createElement('div');
    back.className = 'hud-pet-back';
    place(back, FACE.left - 12, FACE.top - 6, 192, 81);
    back.style.backgroundImage = themeUrl(art, 'PetStatusBg.tga');
    body.prepend(back);

    const gauge = (name: string, color: number, at: { left: number; top: number }): Gauge => {
      const g = new Gauge(art, 'GauEmptyNormal.bmp', color, name, doc);
      g.element.style.left = `${at.left}px`;
      g.element.style.top = `${at.top}px`;
      body.append(g.element);
      return g;
    };
    this.gauges = { energy: gauge('energy', ENERGY_COLOR, HP), exp: gauge('exp', EXP_COLOR, EXP) };

    // DrawPetInformation (:384-387): the four words over the picture, ARGB(255, 74, 74, 173) on a (160, 160, 240) shadow
    const label = (tid: string, top: number): HTMLElement => {
      const element = this.text('hud-pet-label', 74, top);
      element.textContent = this.word(tid);
      return element;
    };
    body.append(label('TID_GAME_PET_STATUS_LEVEL', 4));
    // the ability's value 2 px after its word (`76 + size.cx`, :468): the two in one row
    const abilityRow = this.text('hud-pet-row', 74, 18);
    const abilityWord = doc.createElement('span');
    abilityWord.className = 'hud-pet-label';
    abilityWord.textContent = this.word('TID_GAME_PET_STATUS_ABILITY');
    const ability = doc.createElement('span');
    ability.className = 'hud-pet-value';
    abilityRow.append(abilityWord, ability);
    body.append(abilityRow, label('TID_GAME_PET_STATUS_HP', 46), label('TID_GAME_PET_STATUS_EXP', 61));
    const level = this.text('hud-pet-value', 112, 4);
    const life = this.text('hud-pet-value', 100, 32);
    const points = [0, 1, 2].map(() => this.text('hud-pet-number', 0, HP.top));
    const exp = this.text('hud-pet-number', 0, EXP.top);
    body.append(level, life, ...points, exp);
    this.texts = { level, ability, life, points, exp };

    // the steps (m_bExtension): PetLevelBg.tga, an icon a level, the cells the pointer is tested in
    const steps = doc.createElement('div');
    steps.className = 'hud-pet-steps';
    steps.hidden = true;
    const stepsBack = doc.createElement('div');
    stepsBack.className = 'hud-pet-steps-back';
    place(stepsBack, STEPS.left - 2, STEPS.top - 2, 172, 38);
    stepsBack.style.backgroundImage = themeUrl(art, 'PetLevelBg.tga');
    steps.append(stepsBack);
    for (let i = 0; i < PetLevel.S; i++) {
      const icon = doc.createElement('img');
      icon.className = 'hud-pet-step';
      icon.alt = '';
      icon.draggable = false;
      icon.hidden = true;
      steps.append(icon);
      this.stepIcons.push(icon);
      const cell = doc.createElement('div');
      cell.className = 'hud-pet-step-cell';
      cell.dataset.level = String(i + PetLevel.D);
      place(cell, STEPS.left + i * STEP_CELL, STEPS.top, STEP_CELL, STEPS.bottom - STEPS.top);
      cell.hidden = true;
      cell.addEventListener('pointerenter', () => this.point(i + PetLevel.D, cell));
      cell.addEventListener('pointerleave', () => this.point(-1, cell));
      steps.append(cell);
      this.stepCells.push(cell);
    }
    body.append(steps);
    this.steps = steps;

    // WIDC_BUTTON1: a button with no picture, the theme's plain one (CTheme::RenderWndButton, ITheme.cpp:1275-1334)
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'hud-pet-extend';
    button.dataset.control = 'WIDC_BUTTON1';
    button.setAttribute('aria-label', 'Show the steps');
    place(button, BUTTON.left, BUTTON.top, BUTTON.width, BUTTON.height);
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', () => this.setExtension(!this.extension));
    body.append(button);

    // OnLButtonDown (:960-964): 2, 0, 1, 2 ...
    body.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.display = this.display === 2 ? 0 : this.display === 0 ? 1 : 2;
    });
  }

  get frame(): WindowFrame {
    return this.window.frame;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** The face box (WIDC_CUSTOM1), where the portrait's canvas goes. */
  portraitBox(): HTMLElement {
    return this.window.control('WIDC_CUSTOM1');
  }

  /** The numbers' mode (`m_nDisplay`) and whether the steps show (`m_bExtension`). */
  get state(): { display: Display; extension: boolean; choice: number } {
    return { display: this.display, extension: this.extension, choice: this.choice };
  }

  /**
   * `new CWndPetStatus; Initialize()`: the window as made (numbers in mode 2, the steps hidden, `SetExtension( FALSE )`),
   * then `OnInitialUpdate`'s place (:819-835): at the status window's top right when it is open (`GetWndBase(
   * APP_STATUS1 )`), else at the layout's left + 192 and top.
   */
  open(status: WindowFrame | null): void {
    this.display = 2;
    this.choice = -1;
    this.locks.forEach((lock) => { lock.level = -1; lock.step = -1; });
    this.setExtension(false);
    this.shown = '';
    const at = status !== null && status.isOpen
      ? { x: status.position.x + status.size.width, y: status.position.y }
      : { x: 192, y: 0 };
    this.window.open(at);
  }

  close(): void {
    this.window.close();
  }

  /**
   * `LockShowLevel` (:1031-1052), for the miracle window (R3): while `on`, level `level`'s icon is the step it has now
   * (`m_nBackUpLevel`), in place `slot` (0 or 1); off, its own again.
   */
  lockShowLevel(on: boolean, level: number, slot: 0 | 1): void {
    const lock = this.locks[slot]!;
    if (on) {
      lock.level = level;
      lock.step = this.item?.pet?.availLevels[level - 1] ?? 0;
    } else {
      lock.level = -1;
      lock.step = -1;
    }
    this.shown = '';
  }

  /**
   * One frame (`OnDraw`, `PaintFrame`): the title, the gauges, the texts and the numbers of `item`'s pet (the own pet
   * item, `GetPetItem`). Nothing is drawn without one (`m_pPetElem == NULL`).
   */
  update(item: InventoryItem | undefined): void {
    this.item = item;
    const pet = item?.pet;
    if (!this.isOpen || item === undefined || pet === undefined) return;
    const prop = this.data.itemProps.get(item.itemId);
    const title = prop === undefined ? '' : petTitle(pet, prop, this.data);
    const maxEnergy = petMaxEnergy(pet.level, this.data.pets);
    const maxExp = petMaxExp(pet.level);
    const key = `${title}|${JSON.stringify(pet)}|${this.display}|${this.extension}|${this.choice}|${this.locks.map((l) => `${l.level}:${l.step}`)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.frame.setTitle(title);

    // MakeGaugeVertex (:299, :311): `nWidthClient * energy / max`, and the EXP's in floats
    this.gauges.energy.set(Math.min(GAUGE_WIDTH, Math.max(0, Math.trunc((GAUGE_WIDTH * pet.energy) / maxEnergy))));
    this.gauges.exp.set(Math.min(GAUGE_WIDTH, Math.max(0, Math.trunc(f32(f32(GAUGE_WIDTH / maxExp) * pet.exp)))));

    // DrawPetInformation: the grade (:417-418), the stat or "None" (:464-468), the life (:471-472), in ARGB(255, 255, 28, 174)
    this.texts.level.textContent = this.word(petGradeTid(pet.level));
    const { dst, param } = availDestParam(pet, this.data.pets);
    this.texts.ability.textContent = dst !== 0 && param !== 0
      ? petStatText(this.data.texts, dst, param, 'window') : this.word('TID_GAME_PET_EGG_ABILITY');
    this.texts.life.textContent = String(petLife(pet));
    this.drawNumbers(pet, maxEnergy, maxExp);
    this.drawSteps(pet);
  }

  dispose(): void {
    this.hideTooltip();
    this.window.dispose();
  }

  /**
   * The numbers (`OnDraw`, :565-611), white on a black shadow, placed by their letters as the C++ places them: mode 1 the
   * percent at the gauge's right - 70 and `"<energy>p"` ending at right - 7 (5.8 px a letter); mode 2 the energy at
   * right - 61 less 2.6 px a letter, the most at right - 23 less 2 px a letter, the slash at right - 42; the EXP's percent
   * ending at right - 7 in both; mode 0 none.
   */
  private drawNumbers(pet: PetData, maxEnergy: number, maxExp: number): void {
    const [a, b, c] = this.texts.points as [HTMLElement, HTMLElement, HTMLElement];
    const put = (element: HTMLElement, text: string, x: number): void => {
      element.textContent = text;
      element.style.left = `${x}px`;
    };
    for (const element of [a, b, c, this.texts.exp]) element.textContent = '';
    if (this.display === 0) return;
    if (this.display === 1) {
      put(a, `${pointPercent(pet.energy, maxEnergy)}%`, HP.right - 70);
      const points = `${pet.energy}p`;
      put(b, points, HP.right - 7 - Math.trunc(f32(points.length * f32(5.8))));
    } else {
      const energy = String(pet.energy);
      put(a, energy, HP.right - 76 + 15 - Math.trunc(f32(energy.length * f32(2.6))));
      const max = String(maxEnergy);
      put(b, max, HP.right - 38 + 15 - max.length * 2);
      put(c, '/', HP.right - 42);
    }
    const exp = petExpText(pet.exp, maxExp);
    put(this.texts.exp, exp, HP.right - 7 - Math.trunc(f32(exp.length * f32(5.8))));
  }

  /**
   * The steps (`m_bExtension`, :474-516): an icon of each level from D up to the pet's whose step is rolled
   * (`Icon_PetLevel<step>_S.dds`, a locked level its older one), from the box's left - 2 on, 35 px apart, at alpha 120 but
   * the one pointed at; the cells the pointer is tested in, 34 px wide from the box's left, for D up to the pet's level
   * (`OnMouseWndSurface`, :846-917).
   */
  private drawSteps(pet: PetData): void {
    this.steps.hidden = !this.extension;
    let x = STEPS.left - 2;
    this.stepIcons.forEach((icon, i) => {
      const level = i + PetLevel.D;
      const rolled = pet.availLevels[level - 1] ?? 0;
      const cell = this.stepCells[i]!;
      cell.hidden = level > pet.level;
      if (level > pet.level || rolled === 0) {
        icon.hidden = true;
        return;
      }
      const lock = this.locks.find((l) => l.level === level);
      const step = lock !== undefined && lock.step > 0 ? lock.step : rolled;
      const src = this.art.url(themeKey(`Icon_PetLevel${step}_S.dds`));
      if (icon.getAttribute('src') !== src) icon.src = src;
      icon.hidden = false;
      icon.style.left = `${x}px`;
      icon.style.top = `${STEPS.top - 2}px`;
      icon.style.opacity = this.choice === level ? '1' : String(STEP_DIM / 255);
      x += STEP_PITCH;
    });
    if (!this.extension) this.hideTooltip();
  }

  /** `SetExtension` (:921-931) and `OnChildNotify` (:976-984): 48 px taller with the steps, 48 shorter without. */
  private setExtension(on: boolean): void {
    this.extension = on;
    this.frame.setHeight(on ? HEIGHT : HEIGHT - EXTENSION);
    this.steps.hidden = !on;
    this.window.frame.element.toggleAttribute('data-extended', on);
    this.shown = '';
    if (!on) {
      this.choice = -1;
      this.hideTooltip();
    }
  }

  /**
   * `OnMouseWndSurface` (:838-919): the pointer in level `level`'s cell lights its icon (`m_nChoiceLevel`) and puts up its
   * step's stat in red (`"%s +%d"`, or `%%` for a rate); out of every cell, none. A level with no step rolled says nothing
   * (the C++ reads `m_anParam[-1]`).
   */
  private point(level: number, cell: HTMLElement): void {
    this.hideTooltip();
    this.choice = level;
    this.shown = '';
    const pet = this.item?.pet;
    if (level < 0 || !this.extension || pet === undefined) return;
    const value = stepValue(pet, level, this.data.pets);
    const dst = this.data.pets?.kinds[pet.kind]?.dst;
    if (value === null || dst === undefined) return;
    const tooltip = createTooltip(this.doc, this.art, [[{ text: petStatText(this.data.texts, dst, value, 'step'), color: 0xff0000 }]]);
    tooltip.classList.add('hud-pet-tooltip');
    this.frame.element.append(tooltip);
    positionItemDetails(tooltip, cell, this.doc);
    this.tooltip = tooltip;
  }

  private hideTooltip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }

  /** A text placed at (`left`, `top`) of the client area. */
  private text(className: string, left: number, top: number): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = className;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    return element;
  }

  /** A text of the catalog (`prj.GetText`), '' for one it lacks. */
  private word(tid: string): string {
    return this.data.texts.get(tid)?.text ?? '';
  }
}

/** Puts `element` at (`left`, `top`), `width` x `height`. */
function place(element: HTMLElement, left: number, top: number, width: number, height: number): void {
  Object.assign(element.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
}

// custom (owner 2026-11-16, "do something like this": RaGEZONE's "Fully working pet filter Wakazaki Style"): the Pet Filter
// window, the post's APP_PETFILTER (its resdata.inc entry and CWndPetfilter, WndField.cpp) as a window of Neuz's look:
//
//   APP_PETFILTER "WndTile00.tga"   five group statics on WndEditTile200 (Food, Accessories, Cards, Equipment, Misc.), 19
//                                   ButtCheck.bmp checks under them, Apply (ButtCharApply.tga) under Cards, and the line
//                                   "Choose the items you DO NOT want to pick up" along the bottom
//   CWndPetfilter::OnInitialUpdate  the checks from the kept filter (`g_Option.m_dwPetfilter`), the window centred
//   CWndPetfilter::OnChildNotify    a check flips its bit in the window's own copy; Apply keeps it (Neuz.ini), sends it to
//                                   the World server and closes; closing any other way drops the changes
//
// The entry's 432 px are cut to 396 (the post's picture shows the window that size: its controls end at 376); the height
// is its 240. The rules of each check are items/petFilter.ts's.

import type { UiArt } from './art';
import { ResWindow } from './resWindow';
import type { ResControl, ResLayout, ResRect } from './resWindow';
import { sixFrameButton } from './radio';
import type { RadioButton } from './radio';
import { PET_FILTER_LABELS, petFilterBit } from '../items/petFilter';
import type { PetFilterCheck } from '../items/petFilter';

const GROUP = 'WndEditTile200.tga';

/** The groups' statics (WIDC_STATIC1 to 5) and the bottom line (WIDC_STATIC6), at the entry's rects. */
const STATICS: readonly ResControl[] = [
  { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 8, 120, 24], group: GROUP, text: 'Food' },
  { kind: 'static', id: 'WIDC_STATIC2', rect: [132, 8, 244, 24], group: GROUP, text: 'Accessories' },
  { kind: 'static', id: 'WIDC_STATIC4', rect: [256, 8, 368, 24], group: GROUP, text: 'Cards' },
  { kind: 'static', id: 'WIDC_STATIC3', rect: [8, 88, 120, 104], group: GROUP, text: 'Equipment' },
  { kind: 'static', id: 'WIDC_STATIC5', rect: [132, 88, 244, 104], group: GROUP, text: 'Misc.' },
  { kind: 'static', id: 'WIDC_STATIC6', rect: [8, 184, 376, 200], group: GROUP, text: 'Choose the items you DO NOT want to pick up' },
];

/** The checks (WIDC_PF_*) at the entry's rects. */
const CHECKS: ReadonlyArray<{ check: PetFilterCheck; id: string; rect: ResRect }> = [
  { check: 'hpFood', id: 'WIDC_PF_HPFOOD', rect: [8, 30, 104, 46] },
  { check: 'mpFood', id: 'WIDC_PF_MPFOOD', rect: [8, 50, 104, 66] },
  { check: 'fpFood', id: 'WIDC_PF_FPFOOD', rect: [8, 70, 120, 86] },
  { check: 'necklace', id: 'WIDC_PF_NECKLACE', rect: [140, 30, 236, 46] },
  { check: 'earring', id: 'WIDC_PF_EARRING', rect: [140, 50, 236, 66] },
  { check: 'ring', id: 'WIDC_PF_RING', rect: [140, 70, 236, 86] },
  { check: 'eleCard', id: 'WIDC_PF_ELECARD', rect: [258, 30, 358, 46] },
  { check: 'card4', id: 'WIDC_PF_4PCARD', rect: [258, 50, 354, 66] },
  { check: 'card7', id: 'WIDC_PF_7PCARD', rect: [258, 70, 354, 86] },
  { check: 'cardB', id: 'WIDC_PF_BPIECARD', rect: [258, 90, 354, 106] },
  { check: 'cardA', id: 'WIDC_PF_APIECARD', rect: [258, 110, 354, 126] },
  { check: 'bWeapon', id: 'WIDC_PF_BWEAPON', rect: [8, 110, 120, 126] },
  { check: 'gWeapon', id: 'WIDC_PF_GWEAPON', rect: [8, 130, 120, 146] },
  { check: 'bSet', id: 'WIDC_PF_BSET', rect: [8, 150, 120, 166] },
  { check: 'gSet', id: 'WIDC_PF_GSET', rect: [8, 168, 120, 184] },
  { check: 'egg', id: 'WIDC_PF_EGG', rect: [136, 110, 232, 126] },
  { check: 'sunstone', id: 'WIDC_PF_SUNSTONE', rect: [136, 130, 232, 146] },
  { check: 'moonstone', id: 'WIDC_PF_MOONSTONE', rect: [136, 150, 232, 166] },
  { check: 'quest', id: 'WIDC_PF_QUESTS', rect: [136, 168, 232, 184] },
];

/** The entry: 396 x 240, tiled, its statics and Apply (the checks are added beside them). */
export const PET_FILTER_LAYOUT: ResLayout = {
  title: 'Pet Filter',
  width: 396,
  height: 240,
  controls: [
    ...STATICS,
    // ButtCharApply.tga is 200 x 20, four states of 50
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [284, 150, 336, 170], picture: 'ButtCharApply.tga', label: 'Apply', quarter: 50 },
  ],
};

/** CWndPetfilter. */
export class PetFilterWindow {
  readonly window: ResWindow;
  /** Apply: the checked items' mask, to keep and send. The window then closes. */
  onApply: (mask: number) => void = () => {};
  /** The window's own copy (`dwPetfilter`), kept only by Apply. */
  private draft = 0;
  private readonly checks = new Map<PetFilterCheck, RadioButton>();

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(PET_FILTER_LAYOUT, art, doc);
    window.frame.element.classList.add('hud-pet-filter');
    // 2026-11-16 (owner): above the phone's open bag, as the other windows a Start menu line opens
    window.frame.overBag = true;
    for (const control of STATICS) window.control(control.id).classList.add('is-centred');
    for (const { check, id, rect: [left, top, right, bottom] } of CHECKS) {
      const label = PET_FILTER_LABELS[check];
      const box = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, { left, top, width: right - left, height: bottom - top },
        { role: 'checkbox', name: label, label }, () => {
          this.draft ^= petFilterBit(check);
          this.draw();
        });
      box.element.dataset.control = id;
      this.checks.set(check, box);
      window.frame.body.append(box.element);
    }
    const apply = window.button('WIDC_BUTTON1');
    apply.title = 'Save the Pet Filter settings and close the window.';
    // the phone's silver button's word (style.css)
    apply.dataset.word = 'Apply';
    apply.addEventListener('click', () => {
      this.onApply(this.draft);
      window.close();
    });
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.window.element;
  }

  /** `OnInitialUpdate`: the checks from the kept filter, centred. */
  open(mask: number): void {
    this.draft = mask;
    this.draw();
    this.window.open();
  }

  /** The Start menu line and U: open it, or close it (dropping any change) when it is open. */
  toggle(mask: number): void {
    if (this.window.isOpen) this.window.close();
    else this.open(mask);
  }

  close(): void {
    this.window.close();
  }

  dispose(): void {
    this.window.dispose();
  }

  /** `SetButtonStatus`: each check as the window's copy has it. */
  private draw(): void {
    for (const [check, box] of this.checks) box.checked = (this.draft & petFilterBit(check)) !== 0;
  }
}

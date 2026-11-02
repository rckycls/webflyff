// The Option window (APP_OPTIONEX, "Option", ResData.inc:13196) with the one group of it FlyffWeb has: the "Sound Option"
// sliders of its game tab, APP_OPTEX_GAME12 (ResData.inc:20544), as CWndOptionGame draws and moves them
// (Source/_Interface/WndOptionGame.cpp:29-52, :225-468). The Option window's other settings are left out (the plan's
// ruling 1). docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md §10.
//
//   WIDC_STATIC7   240,224   "Sound Option"   IDS_RESDATA_INC_005504
//   WIDC_STATIC5   240,244   "BGM"            IDS_RESDATA_INC_005502    WIDC_CUSTOM1 348,244-458,262   the music
//   WIDC_STATIC13  240,266   "Sound Effect"   IDS_RESDATA_INC_005508    WIDC_CUSTOM2 348,266-458,284   the effects
//
// The group is drawn at its own spacing, 232 left and 216 up. Each bar is WndVolumeBar.tga stretched over the control,
// with ButtSpin.tga, 16x16, at `left + step * trunc( width / 11 )`. A press on the knob drags it one step per move toward
// the pointer, kept to 0..10 (GetRangeSlider); a press elsewhere on the bar moves it one step toward the press
// (GetSliderStep). A focused bar also takes the arrow keys (the plan's ruling 2). Each change applies at once.

import type { GameAudio } from '../../audio/gameAudio';
import type { UiArt } from './art';
import { themeKey } from './art';
import { WindowFrame } from './frame';

/** `IDS_RESDATA_INC_001290`, the Option window's title. */
const TITLE = 'Option';
/** The group's place in the tab, less a margin of 8: its controls are drawn this much left and up. */
const ORIGIN = { x: 232, y: 216 };
/** MAX_SLIDER (WndOptionGame.cpp:9). */
const MAX_STEP = 10;
/** The custom controls' width: 458 - 348. */
const BAR_WIDTH = 110;
const BAR_HEIGHT = 18;
const KNOB = 16;
/** `GetStepPos`: `nStep * ( nWidth / ( MAX_SLIDER + 1 ) )`, integer division. */
const STEP_PX = Math.trunc(BAR_WIDTH / (MAX_STEP + 1));

type Volume = 'music' | 'effects';

interface Slider {
  bar: HTMLElement;
  knob: HTMLElement;
  step: number;
  dragging: boolean;
}

const clamp = (step: number): number => Math.max(0, Math.min(MAX_STEP, step));

export class OptionWindow {
  readonly frame: WindowFrame;
  private readonly sliders: Record<Volume, Slider>;

  constructor(
    art: UiArt,
    private readonly audio: Pick<GameAudio, 'settings' | 'setEffects' | 'setMusic'>,
    doc: Document = document,
  ) {
    // the client area is 4 px in and 22 px down (frame.ts): 234 x 78 of controls
    this.frame = new WindowFrame(TITLE, art, { width: 242, height: 104 }, doc);
    this.frame.element.classList.add('hud-option');
    const label = (text: string, x: number, y: number, width: number): HTMLElement => {
      const el = doc.createElement('span');
      el.className = 'hud-option-label';
      el.textContent = text;
      Object.assign(el.style, { left: `${x - ORIGIN.x}px`, top: `${y - ORIGIN.y}px`, width: `${width}px` });
      return el;
    };
    const slider = (which: Volume, name: string, x: number, y: number): Slider => {
      const bar = doc.createElement('div');
      bar.className = 'hud-option-bar';
      bar.dataset.volume = which;
      bar.tabIndex = 0;
      bar.setAttribute('role', 'slider');
      bar.setAttribute('aria-label', name);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(MAX_STEP));
      Object.assign(bar.style, {
        left: `${x - ORIGIN.x}px`, top: `${y - ORIGIN.y}px`, width: `${BAR_WIDTH}px`, height: `${BAR_HEIGHT}px`,
        backgroundImage: `url(${JSON.stringify(art.url(themeKey('WndVolumeBar.tga')))})`,
      });
      const knob = doc.createElement('span');
      knob.className = 'hud-option-knob';
      Object.assign(knob.style, {
        width: `${KNOB}px`, height: `${KNOB}px`, backgroundImage: `url(${JSON.stringify(art.url(themeKey('ButtSpin.tga')))})`,
      });
      bar.append(knob);
      const s: Slider = { bar, knob, step: 0, dragging: false };
      this.listen(which, s);
      return s;
    };
    this.sliders = {
      music: slider('music', 'BGM', 348, 244),
      effects: slider('effects', 'Sound Effect', 348, 266),
    };
    this.frame.body.append(
      label('Sound Option', 240, 224, 96),
      label('BGM', 240, 244, 102), this.sliders.music.bar,
      label('Sound Effect', 240, 266, 102), this.sliders.effects.bar,
    );
  }

  /** Opens the window at the steps the page keeps (`OnInitialUpdate`, :77-78), or closes it. */
  toggle(): void {
    if (this.frame.isOpen) {
      this.frame.close();
      return;
    }
    const { music, effects } = this.audio.settings;
    this.show('music', music);
    this.show('effects', effects);
    this.frame.open('center');
  }

  dispose(): void {
    this.frame.close();
    this.frame.element.remove();
  }

  private listen(which: Volume, s: Slider): void {
    /** The pointer's x in the bar's own pixels, whatever the HUD's scale. */
    const xOf = (event: MouseEvent): number => {
      const rect = s.bar.getBoundingClientRect();
      return (event.clientX - rect.left) * (rect.width > 0 ? BAR_WIDTH / rect.width : 1);
    };
    s.bar.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const x = xOf(event);
      const at = s.step * STEP_PX;
      if (x >= at && x < at + KNOB) {
        s.dragging = true; // GetSliderStep's -1: the knob is taken
        const pointer = (event as PointerEvent).pointerId;
        if (pointer !== undefined) s.bar.setPointerCapture?.(pointer);
        return;
      }
      if (x >= 0 && x < BAR_WIDTH) this.change(which, s.step + (x > at ? 1 : -1));
    });
    s.bar.addEventListener('pointermove', (event) => {
      if (!s.dragging) return;
      const x = xOf(event);
      let step = s.step;
      if (x > step * STEP_PX) step += 1;
      if (x < step * STEP_PX) step -= 1;
      this.change(which, step);
    });
    const end = (): void => { s.dragging = false; };
    s.bar.addEventListener('pointerup', end);
    s.bar.addEventListener('pointercancel', end);
    s.bar.addEventListener('keydown', (event) => {
      const by = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
      if (by === 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.change(which, s.step + by);
    });
  }

  /** A slider moved: shown, and the page's volume set, if it is another step. */
  private change(which: Volume, step: number): void {
    const next = clamp(step);
    if (next === this.sliders[which].step) return;
    this.show(which, next);
    if (which === 'music') this.audio.setMusic(next);
    else this.audio.setEffects(next);
  }

  private show(which: Volume, step: number): void {
    const s = this.sliders[which];
    s.step = clamp(step);
    s.knob.style.left = `${s.step * STEP_PX}px`;
    s.bar.setAttribute('aria-valuenow', String(s.step));
  }
}

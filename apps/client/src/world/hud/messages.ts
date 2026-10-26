// The texts the game puts on the screen outside the windows (spec §3.9): the server's messages and the game's own lines
// (`g_WndMng.PutString`, which shows them as client messages, `g_ClientMsg`: a few lines above the task bar that fade one by
// one), the big caption of a level up (`g_Caption1`), and the texts of DEFINEDTEXT.
//
//   CDPClient::OnDefinedText   Source/Neuz/DPClient.cpp:4117-4228  the TID's text with the string's tokens (CScanner)
//   CDPClient::OnDefinedText1  DPClient.cpp:4230-4239              the TID's text alone, as it is (GETTEXT, unformatted)
//   CWndMgr::PutString         _Interface/WndManager.cpp:4026-4130 a CHATSTY_GAME line goes to g_ClientMsg (the default
//                                                                  m_dwChatFilterEtc has CHATSTY_GAME_CLIENT, HwOption.cpp:227)
//   CClientMsg                 _Common/ClientMsg.cpp               six lines; 3 s after the last one came the oldest fades,
//                                                                  10 alpha a frame; drawn at 520/768 of the screen's height
//                                                                  (Neuz.cpp:840), centred
//   CCaption                   _Interface/WndWorld.cpp:89-300      grows from 7 times its size, holds 5 s, fades 3 a frame;
//                                                                  drawn at 184/768 of the height (WndWorld.cpp:797)

import { FormatError, tokenize } from '@flyffweb/formats';
import type { ClientText, Texts } from '../gameData';
import { cssRgb } from './art';
import { formatText } from './format';

const f32 = Math.fround;

/** One frame of Neuz, which steps the fades: its main loop at 60 a second, the rules' step (`FixedStepper`). */
const FRAME_MS = 1000 / 60;

/** The frames of 60 a second in `ms` milliseconds, whole (a little slack for the float sum of a frame count). */
const framesIn = (ms: number): number => Math.floor(ms / FRAME_MS + 1e-6);

/** The texts by their number, made once for each catalog. */
const byNumber = new WeakMap<Texts, Map<number, ClientText>>();

/** `prj.GetText( dwText )`: the text numbered `textId`, the later of two of one number (`CProject::LoadText` keeps the last). */
function textNumbered(texts: Texts, textId: number): ClientText | undefined {
  let numbered = byNumber.get(texts);
  if (numbered === undefined) {
    numbered = new Map();
    for (const entry of texts.values()) if (entry.textId !== undefined) numbered.set(entry.textId, entry);
    byNumber.set(texts, numbered);
  }
  return numbered.get(textId);
}

/**
 * The arguments of a DEFINEDTEXT string (`OnDefinedText`, `:4125-4146`): the tokens `CScanner` reads in it (`tokenize`;
 * a quoted token keeps its spaces), each with `" @"` taken out (`__VER >= 9`), except for `TID_GAME_REAPMONEY`, whose
 * numbers have commas: its first two pieces between spaces (`AfxExtractSubString`). A string `CScanner` cannot read (a
 * quote never closed, which the C++ reports and reads on from) is cut at the spaces.
 */
function definedTextArgs(texts: Texts, textId: number, args: string): string[] {
  if (textId === texts.get('TID_GAME_REAPMONEY')?.textId) {
    const pieces = args.split(' ');
    return [pieces[0] ?? '', pieces[1] ?? ''];
  }
  try {
    return tokenize(args, 'DEFINEDTEXT').map((token) => token.text.replaceAll(' @', ''));
  } catch (error) {
    if (!(error instanceof FormatError)) throw error;
    return args.split(/\s+/).filter((piece) => piece !== '');
  }
}

/**
 * `CDPClient::OnDefinedText` (`DPClient.cpp:4117-4228`): the text the TID numbered `textId` stands for (`prj.GetText`),
 * its `%s` filled with the tokens of `args` in order (`CString::FormatV` with the tokens as its arguments), and its colour
 * (`prj.GetTextColor`). DEFINEDTEXT1 (`args` null) is the text as it is, not formatted: `GETTEXT( dwText )` and its
 * colour (`OnDefinedText1`, `:4230-4239`). A number the texts do not have (or game files whose texts have no numbers)
 * gives no text and colour 0.
 */
export function formatDefinedText(texts: Texts, textId: number, args: string | null): { text: string; color: number } {
  const entry = textNumbered(texts, textId);
  if (entry === undefined) return { text: '', color: 0 };
  if (args === null) return { text: entry.text, color: entry.color };
  return { text: formatText(entry.text, definedTextArgs(texts, textId, args)), color: entry.color };
}

/** `nMax` of `CClientMsg::AddMessage` (`ClientMsg.cpp`): the lines kept. */
const MAX_LINES = 6;
/** `m_timer.Set( 3000 )`: how long after the last line came the oldest begins to fade, and then the next. */
const FADE_DELAY_MS = 3000;
/** The alpha a fading line starts at (`m_nAlpha = 254`), and what each frame takes off (`m_nAlpha -= 10`). */
const FADE_START = 254;
const FADE_STEP = 10;

interface Line {
  element: HTMLElement;
  /** When it began to fade (ms); null while it is whole. */
  fadeFrom: number | null;
}

/**
 * The client messages (`CClientMsg`): the server's texts and the game's own lines, each in its colour, the newest at the
 * bottom. Six at most: a seventh drops the oldest. Each new line sets the timer to 3 s from now (`m_timer.Set( 3000 )`,
 * "now" being the last `step`); when it runs out the oldest line begins to fade (alpha 254, then 10 less each frame, gone
 * below 0) and the timer starts again, so the lines go one by one, 3 s apart.
 */
export class MessageLines {
  readonly element: HTMLElement;
  private readonly lines: Line[] = [];
  /** The last `step`'s time; null before the first, when a line added starts the timer at the first step. */
  private now: number | null = null;
  /** When the timer runs out (`m_timer`); null before the first line. */
  private timerEnd: number | null = null;
  private timerFromNextStep = false;

  constructor(private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-messages';
    this.element.setAttribute('role', 'log');
  }

  /** `AddMessage( text, color )`: a line in the colour's red, green and blue (its alpha is the line's own). */
  add(text: string, color: number): void {
    const element = this.doc.createElement('div');
    element.textContent = text;
    element.style.color = cssRgb(color);
    element.style.opacity = '1';
    this.element.append(element);
    this.lines.push({ element, fadeFrom: null });
    if (this.lines.length > MAX_LINES) this.lines.shift()!.element.remove();
    if (this.now === null) this.timerFromNextStep = true;
    else this.timerEnd = this.now + FADE_DELAY_MS;
  }

  /** `CClientMsg::Render` at `nowMs`: the fading line's alpha, its end, then the timer. */
  step(nowMs: number): void {
    this.now = nowMs;
    if (this.timerFromNextStep) {
      this.timerFromNextStep = false;
      this.timerEnd = nowMs + FADE_DELAY_MS;
    }
    const oldest = this.lines[0];
    if (oldest !== undefined && oldest.fadeFrom !== null) {
      // drawn at 254, 244 ... 4 on the frames after it began, then gone (`m_nAlpha < 0`)
      const frames = framesIn(nowMs - oldest.fadeFrom);
      const alpha = FADE_START - FADE_STEP * Math.max(0, frames - 1);
      if (alpha < 0) {
        this.lines.shift();
        oldest.element.remove();
      } else {
        oldest.element.style.opacity = String(alpha / 255);
      }
    }
    if (this.timerEnd !== null && nowMs >= this.timerEnd && this.lines.length > 0) {
      this.timerEnd = nowMs + FADE_DELAY_MS;
      const first = this.lines[0]!;
      if (first.fadeFrom === null) {
        first.fadeFrom = nowMs;
        first.element.style.opacity = String(FADE_START / 255);
      }
    }
  }

  /** Takes every line off (`ClearAllMessage`). */
  clear(): void {
    for (const line of this.lines.splice(0)) line.element.remove();
    this.timerEnd = null;
    this.timerFromNextStep = false;
  }
}

/** `CCaption`'s numbers: the growth each frame adds to its speed, and the hold before the fade (`SEC( 5 )`), in frames. */
const GROWTH = f32(0.002);
const HOLD_FRAMES = 300;
const FADE_PER_FRAME = 3;

interface CaptionLine {
  element: HTMLElement;
  xScale: number;
  yScale: number;
  addScale: number;
  alpha: number;
}

/**
 * The caption (`CCaption`, `g_Caption1`): big lines under the top of the screen. Each grows from 7 times its size to its
 * size, faster and faster (`m_fAddScale += 0.002f` each frame); the next begins once the one before it is a tenth grown;
 * when the last has grown the captions hold 5 s, then fade by 3 alpha a frame. A caption shown while they hold goes under
 * them; one shown after they began to fade clears them first (`AddCaption`, `RemoveAll`). `step` runs the frames of 60 a
 * second up to `nowMs`.
 */
export class Caption {
  readonly element: HTMLElement;
  private captions: CaptionLine[] = [];
  private count = 0;
  private ended = false;
  /** The frame the hold ends on (`m_timer`). */
  private endFrame = 0;
  /** The frames run so far, from the first `step`. */
  private frame = 0;
  private origin: number | null = null;

  constructor(private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-caption';
    this.element.setAttribute('role', 'status');
  }

  /** `AddCaption( text )`. */
  show(text: string): void {
    if (this.ended && this.frame >= this.endFrame) this.removeAll();
    const element = this.doc.createElement('div');
    element.textContent = text;
    element.hidden = true;
    this.element.append(element);
    this.captions.push({ element, xScale: 0, yScale: 0, addScale: 0, alpha: 255 });
    this.ended = false;
  }

  /** Runs `CCaption::Process` for each frame up to `nowMs`, then draws (`Render`). */
  step(nowMs: number): void {
    this.origin ??= nowMs;
    const target = framesIn(nowMs - this.origin);
    while (this.frame < target) {
      this.frame++;
      this.process();
    }
    this.render();
  }

  /** `CCaption::Process` (`WndWorld.cpp:108-153`), in C floats. */
  private process(): void {
    const captions = this.captions;
    if (this.count === 0 && captions.length > 0) this.count = 1;
    if (this.ended) {
      if (this.frame >= this.endFrame) {
        for (const caption of captions) caption.alpha = Math.max(0, caption.alpha - FADE_PER_FRAME);
      }
      return;
    }
    for (let i = 0; i < this.count; i++) {
      const caption = captions[i]!;
      caption.addScale = f32(caption.addScale + GROWTH);
      caption.xScale = Math.min(1, f32(caption.xScale + caption.addScale));
      caption.yScale = Math.min(1, f32(caption.yScale + caption.addScale));
      if (caption.xScale > f32(0.1) && i === this.count - 1) {
        this.count++;
        if (this.count > captions.length) {
          this.count = captions.length;
          if (caption.yScale >= 1) {
            this.ended = true;
            this.endFrame = this.frame + HOLD_FRAMES;
          }
        }
        break;
      }
    }
  }

  /**
   * `CCaption::Render` (`:173-219`): each caption begun, at `7 - 6 * m_fXScale` times its size (centred, its top where
   * it stands), its alpha `(int)( m_fXScale * 255 ) - ( 255 - m_nAlpha )`; none at alpha 0. Each stands under the one
   * before it.
   */
  private render(): void {
    const shown = Math.min(this.count, this.captions.length);
    this.captions.forEach((caption, i) => {
      const visible = i < shown && caption.alpha !== 0;
      if (caption.element.hidden === visible) caption.element.hidden = !visible;
      if (!visible) return;
      const scale = f32(7 - f32(caption.xScale * 6));
      const alpha = Math.trunc(f32(caption.xScale * 255)) - (255 - caption.alpha);
      caption.element.style.transform = `scale(${scale})`;
      caption.element.style.opacity = String(Math.max(0, alpha) / 255);
    });
  }

  /** `RemoveAll`. */
  private removeAll(): void {
    for (const caption of this.captions) caption.element.remove();
    this.captions = [];
    this.count = 0;
    this.ended = false;
  }
}

// 2026-11-15 (social): the duels' windows and their count (docs/2026-11-15-social-research.md §4), laid out from their
// resdata.inc entries by `ResWindow`:
//
//   CWndDuelConfirm  APP_DUEL_CONFIRM 201   Resource/resdata.inc:21330-21346  "WndTile08.tga", 288 x 128, "Duel Request": the
//                                                                          question (TID_DIAG_0066 / 0067), Yes, No; centred
//                                                                          across, 70 px down (WndDuelConfirm.cpp:31-63)
//                                                                          Yes: DUELYES (or DUELPARTYYES); No or the close box:
//                                                                          DUELNO (DUELPARTYNO) (:94-357)
//   CWndDuelResult   APP_DUEL_RESULT 608    resdata.inc:6866-6878             "Duel Result": "%s loses the Duel!" /
//                                                                          "%s wins the Duel!" (TID_DIAG_DUELRESULT_WIN /
//                                                                          LOSE), Yes; any press closes it and plays
//                                                                          MTI_HIPKIDDING once (won) or MTI_HEAD held (lost)
//                                                                          (:374-452)
//   CMover::RenderPVPCount                  _Common/MoverRender.cpp:2178-2222  DUELCOUNT's picture of CountFight.inc for
//                                                                          1.5 s, 0 drawn as frame 10; under 250 ms at 1 and
//                                                                          alpha 180, then t / 100 - 1.5 (2 at most), alpha
//                                                                          180 - 10 x that; centred, 50 px above the middle

import type { UiArt } from '../art';
import { themeUrl } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';

const EDIT = 'WndEditTile00.tga';

/** APP_DUEL_CONFIRM (resdata.inc:21330; resData.txt.txt's English). */
export const DUEL_CONFIRM: ResLayout = {
  title: 'Duel Request', width: 288, height: 128,
  controls: [
    { kind: 'button', id: 'WIDC_YES', rect: [64, 68, 136, 88], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [148, 68, 220, 88], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 8, 266, 60], tile: EDIT },
  ],
};

/** APP_DUEL_RESULT (resdata.inc:6866). */
export const DUEL_RESULT: ResLayout = {
  title: 'Duel Result', width: 288, height: 128,
  controls: [
    { kind: 'button', id: 'WIDC_YES', rect: [106, 68, 178, 88], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 8, 266, 60], tile: EDIT },
  ],
};

/** `Move( CPoint( ( root.right - width ) / 2, 70 ) )`. */
function openAt70(window: ResWindow, width: number): void {
  const layer = window.frame.element.parentElement;
  window.open({ x: Math.trunc(((layer?.clientWidth ?? 0) - width) / 2), y: 70 });
}

/** CWndDuelConfirm: one at a time (`SAFE_DELETE( m_pWndDuelConfirm )` before a new one). */
export class DuelConfirmWindow {
  readonly window: ResWindow;
  /** Yes: the answer for the asker `askerPlayerId` (1:1 or party). */
  onYes: (askerPlayerId: number, party: boolean, askerId: number) => void = () => {};
  /** No or the close box. */
  onNo: (askerPlayerId: number, party: boolean, askerId: number) => void = () => {};
  private asker: { playerId: number; objectId: number; party: boolean } | null = null;
  private quiet = false;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(DUEL_CONFIRM, art, doc);
    window.frame.element.classList.add('hud-duel-confirm');
    window.button('WIDC_YES').addEventListener('click', () => this.answer(true));
    window.button('WIDC_NO').addEventListener('click', () => this.answer(false));
    // WTBID_CLOSE is No (:317, :343)
    window.onClose = () => {
      const asker = this.asker;
      this.asker = null;
      if (!this.quiet && asker !== null) this.onNo(asker.playerId, asker.party, asker.objectId);
      this.quiet = false;
    };
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** The asker's name in the question, the window centred across, 70 px down. */
  open(question: string, askerPlayerId: number, askerId: number, party: boolean): void {
    this.dismiss();
    this.window.setText('WIDC_TEXT1', question);
    this.asker = { playerId: askerPlayerId, objectId: askerId, party };
    openAt70(this.window, DUEL_CONFIRM.width);
  }

  /** Closed by the game (a new request, the own death, a result): no answer sent. */
  dismiss(): void {
    if (!this.window.isOpen) return;
    this.quiet = true;
    this.window.close();
  }

  private answer(yes: boolean): void {
    const asker = this.asker;
    if (asker === null) return;
    this.asker = null;
    this.quiet = true;
    this.window.close();
    if (yes) this.onYes(asker.playerId, asker.party, asker.objectId);
    else this.onNo(asker.playerId, asker.party, asker.objectId);
  }
}

/** CWndDuelResult. */
export class DuelResultWindow {
  readonly window: ResWindow;
  /** Its button or close box: the motion (won or lost). */
  onClosed: (win: boolean) => void = () => {};
  private win = false;

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(DUEL_RESULT, art, doc);
    window.frame.element.classList.add('hud-duel-result');
    window.button('WIDC_YES').addEventListener('click', () => window.close());
    window.onClose = () => this.onClosed(this.win);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  open(text: string, win: boolean): void {
    this.win = win;
    this.window.setText('WIDC_TEXT1', text);
    openAt70(this.window, DUEL_RESULT.width);
  }
}

/** `Client/SFX/CountFight.inc`: ten 64 x 64 digits on the first row, then two pictures of 330 and 340 x 64. */
export const COUNT_FRAMES: ReadonlyArray<{ x: number; y: number; width: number; height: number }> = [
  ...Array.from({ length: 10 }, (_, i) => ({ x: i * 64, y: 0, width: 64, height: 64 })),
  { x: 0, y: 64, width: 330, height: 64 },
  { x: 350, y: 64, width: 340, height: 64 },
];
/** CountFight.dds: 1024 x 128. */
const SHEET = { width: 1024, height: 128 };
/** How long a count shows (`m_dwPVPTime + 1500`). */
export const COUNT_MS = 1500;

/** `RenderPVPCount`'s frame, scale and alpha `t` ms after DUELCOUNT, or null once over. */
export function countLook(count: number, t: number): { frame: number; scale: number; alpha: number } | null {
  if (t < 0 || t > COUNT_MS) return null;
  const frame = count === 0 ? 10 : count;
  let scale = t / 10;
  let alpha = 180;
  if (scale < 25) scale = 1;
  else {
    scale = scale / 10 - 1.5;
    alpha = Math.trunc(alpha - scale * 10);
  }
  if (scale > 2) scale = 2;
  return { frame, scale, alpha };
}

/** The count over the world: one picture of CountFight.dds, as `RenderPVPCount` draws it each frame. */
export class DuelCount {
  readonly element: HTMLElement;
  private count = 0;
  private at = -Infinity;

  constructor(art: UiArt, doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-duel-count';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.style.backgroundImage = themeUrl(art, 'CountFight.dds');
    this.element.style.backgroundSize = `${SHEET.width}px ${SHEET.height}px`;
    this.element.hidden = true;
  }

  /** DUELCOUNT (`OnDuelCount`): the count and its time. */
  show(count: number, now: number): void {
    this.count = count;
    this.at = now;
    this.frame(now);
  }

  /** Each drawn frame. */
  frame(now: number): void {
    const look = countLook(this.count, now - this.at);
    this.element.hidden = look === null;
    if (look === null) return;
    const piece = COUNT_FRAMES[look.frame]!;
    const style = this.element.style;
    style.width = `${piece.width}px`;
    style.height = `${piece.height}px`;
    style.backgroundPosition = `-${piece.x}px -${piece.y}px`;
    style.opacity = String(Math.max(0, look.alpha) / 255);
    style.transform = `translate(-50%, -50%) scale(${look.scale})`;
    this.element.dataset.count = String(this.count);
  }
}

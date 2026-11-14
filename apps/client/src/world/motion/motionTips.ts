// 2026-11-14: the tooltips of the motions and emoticons, in the Motion window and on the task bar.
//
//   CWndMotion1::OnMouseWndSurface  _Interface/WndMotion.cpp:271-299  a motion's szDesc (not the Cheer's)
//   CWndMotion1::Process            WndMotion.cpp:201-269             the Cheer's: szDesc, "\n", its points, and under 3
//                                                                     "\n" the time to the next
//   CWndEmoticon::OnMouseWndSurface WndMotion.cpp:398-430             "/" and the command
//   CWndTaskBar::PutTooTip          _Interface/WndTaskBar.cpp:584-587, :631-670  the same on the bar, the Cheer's points
//                                                                     after "\n\n"

import { formatText } from '../hud/format';
import { MotId, emoticonLine, motionProp } from './motionTable';

/** `MAX_CHEERPOINT` (`_Common/Mover.h:108`). */
export const MAX_CHEER_POINT = 3;

/** The own cheer points (`m_nCheerPoint`) and the ms left to the next one at the time asked (`m_dwTickCheer - GetTickCount()`). */
export interface CheerView {
  points: number;
  restMs: number;
}

/**
 * The time to the next point as `CTimeSpan` gives it: its minutes (`GetMinutes`, 0-59) with `TID_PK_LIMIT_MINUTE`
 * ("%.1dmin"), or under a minute its seconds with `TID_PK_LIMIT_SECOND` ("%.1dsec").
 */
function restText(restMs: number, text: (tid: string) => string): string {
  const seconds = Math.max(0, Math.trunc(restMs / 1000));
  const minutes = Math.trunc(seconds / 60) % 60;
  return minutes <= 0
    ? formatText(text('TID_PK_LIMIT_SECOND') || '%dsec', [seconds % 60])
    : formatText(text('TID_PK_LIMIT_MINUTE') || '%dmin', [minutes]);
}

/**
 * The lines of motion `id`'s tooltip: its description; for the Cheer, with the own points (`cheer`), "Cheer Message
 * Point(s): %d/3" and, under 3, "Time left until the next point" and the time. `bar` is the task bar's (a blank line
 * before the points), else the window's.
 */
export function motionTip(id: number, cheer: CheerView | null, text: (tid: string) => string, bar: boolean): string[] {
  const prop = motionProp(id);
  if (prop === undefined) return [];
  const lines = [prop.desc];
  if (id !== MotId.CHEER || cheer === null) return lines;
  if (bar) lines.push('');
  lines.push(formatText(text('TID_CHEER_MESSAGE1') || 'Cheer Message Point(s): %d/3', [cheer.points]));
  if (cheer.points < MAX_CHEER_POINT) {
    lines.push((text('TID_CHEER_MESSAGE2') || 'Time left until the next point') + restText(cheer.restMs, text));
  }
  return lines;
}

/** Emoticon `index`'s tooltip: "/" and its command. */
export function emoticonTip(index: number): string[] {
  const line = emoticonLine(index);
  return line === '' ? [] : [line];
}

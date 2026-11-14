// 2026-11-14: the Motion window's two lists (docs/2026-11-14-motion-window-research.md): the motions of
// `Resource/propMotion.txt` (their strings from `propMotion.txt.txt`) and the emoticons of `textEmotion.txt`. Both are
// small and fixed, so they are written here as the chat's emoticon commands are (`chatCommandTable.ts`), not converted.
//
//   CProject::LoadPropMotion   propMotion.txt          dwID, dwMotion (MTI_*), szIconName (Client/Icon), dwPlay, szName,
//                                                      szDesc; every row is for __VER 15 (its version column 6, 8 or 13)
//   CWndMotion1::OnInitialUpdate  _Interface/WndMotion.cpp:105-124   the motions in dwID order
//   CDialogMsg::LoadEmotion    _Common/DialogMsg.cpp:1014-1042       the emoticons' commands, in their index order
//   texChatEmoticon.inc        Client/Theme/Default                  their pictures, 29 of 32 x 32 in rows of 10

import { EMOTICONS } from '../hud/chatCommandTable';
import { AniLoop } from '../sim/constants';

/** `MOT_BASE_*` (`Resource/defineNeuz.h:320-348`): a motion's `dwID`, the id of its `SHORTCUT_MOTION`. */
export const MotId = {
  BATTLE: 1,
  SIT: 2,
  PICKUP: 3,
  POINTWAYNORTH: 14,
  POINTWAYSOUTH: 15,
  POINTWAYEAST: 16,
  POINTWAYWEST: 17,
  ESCAPE: 25,
  CHEER: 26,
  AUTOATTACK: 27,
  COUPLE: 28,
} as const;

/** A row of propMotion.txt. */
export interface MotionProp {
  /** `dwID`, a `MOT_BASE_*`. */
  id: number;
  /** `dwMotion`, the `MTI_*` played (0 for the motions that do something else). */
  mti: number;
  /** `szIconName`, in Client/Icon. */
  icon: string;
  /** `dwPlay`: 0 once (`ANILOOP_1PLAY`), 1 once then held (`ANILOOP_CONT`), 2 looping (`ANILOOP_LOOP`). */
  play: 0 | 1 | 2;
  /** `szName`: what the player says 1 s later ('' for none). */
  say: string;
  /** `szDesc`: the tooltip. */
  desc: string;
}

const row = (id: number, mti: number, icon: string, play: 0 | 1 | 2, say: string, desc: string): MotionProp =>
  ({ id, mti, icon, play, say, desc });

/** The 27 motions, in propMotion.txt's (and the window's) order. */
export const MOTIONS: readonly MotionProp[] = [
  row(1, 0, 'mot_baseBattle.dds', 0, '', 'Combat Stance'),
  row(2, 20, 'mot_baseSit.dds', 0, '', 'Sit Down'),
  row(3, 121, 'mot_basePickup.dds', 0, '', 'Pickup Nearby Item'),
  row(4, 122, 'mot_baseHandshake.dds', 0, '', 'Shake Hands'),
  row(5, 123, 'mot_baseAmbiguous.dds', 0, '', 'Tilt Head'),
  row(6, 124, 'mot_baseYes.dds', 0, '', 'Nod Head'),
  row(7, 125, 'mot_baseNo.dds', 0, '', 'Shake Head'),
  row(8, 126, 'mot_baseSprint.dds', 2, '', 'Run in place'),
  row(9, 127, 'mot_baseParaderest.dds', 1, '', 'Parade Rest'),
  row(10, 128, 'mot_baseAttention.dds', 1, '', 'Attention'),
  row(11, 129, 'mot_baseScissors.dds', 1, 'Scissors', 'Scissors'),
  row(12, 130, 'mot_baseRock.dds', 1, 'Rock', 'Rock'),
  row(13, 131, 'mot_basePaper.dds', 1, 'Paper', 'Paper'),
  row(14, 132, 'mot_basePointWayNorth.dds', 1, 'North', 'Point North'),
  row(15, 133, 'mot_basePointWaySouth.dds', 1, 'South', 'Point South'),
  row(16, 134, 'mot_basePointWayEast.dds', 1, 'East', 'Point East'),
  row(17, 135, 'mot_basePointWayWest.dds', 1, 'West', 'Point West'),
  row(18, 136, 'mot_baseKneedown.dds', 1, '', 'Kneel'),
  row(19, 137, 'mot_basePushup.dds', 0, '', 'Push-Ups'),
  row(20, 138, 'mot_baseHipkidding.dds', 0, '', 'Shake butt'),
  row(21, 139, 'mot_baseJab.dds', 2, 'Pow!', 'Punch'),
  row(22, 140, 'mot_baseHead.dds', 1, '', 'Put head on ground'),
  row(23, 141, 'mot_baseRisesword.dds', 1, '', 'Raise weapon'),
  row(25, 0, 'mot_baseEscape.dds', 0, '', 'Nearest Town Teleport (5 min. casting time)'),
  row(26, 0, 'mot_baseCheer.dds', 0, '', 'Cheer up another character'),
  row(27, 0, 'mot_baseAutoAttack.dds', 0, '', 'Attack the selected target'),
  row(28, 0, 'mot_baseCouple.dds', 0, '', 'You propose to the selected character.'),
];

const BY_ID = new Map(MOTIONS.map((motion) => [motion.id, motion]));

/** `prj.GetMotionProp( dwID )`: the row of `id`, or undefined. */
export function motionProp(id: number): MotionProp | undefined {
  return BY_ID.get(id);
}

/** `dwPlay` as `ObjectExecutor` turns it into a play mode (`WndManager.cpp:3066-3072`). */
export function playMode(play: number): number {
  return play === 1 ? AniLoop.CONT : play === 2 ? AniLoop.LOOP : AniLoop.ONE_PLAY;
}

/** The angle a Point motion turns the player to (`ObjectExecutor`, :3074-3087): north 180, south 0, east 90, west 270. */
export function pointAngle(id: number): number | null {
  switch (id) {
    case MotId.POINTWAYNORTH: return 180;
    case MotId.POINTWAYSOUTH: return 0;
    case MotId.POINTWAYEAST: return 90;
    case MotId.POINTWAYWEST: return 270;
    default: return null;
  }
}

/** The emoticons' count (textEmotion.txt, texChatEmoticon.inc's `number 29`). */
export const EMOTICON_COUNT = EMOTICONS.length;

/** An emoticon's chat line, "/" and its command (`ObjectExecutor`, :2717-2723; its shortcut's text, WndTaskBar.cpp:458-467). */
export function emoticonLine(index: number): string {
  const command = EMOTICONS[index];
  return command === undefined ? '' : `/${command}`;
}

/**
 * The emoticon a chat line shows over its speaker (`CDialogMsg::AddMessage`, `DialogMsg.cpp:820-841`): the index whose
 * "/" and command the line is, exactly (a `CString` compare: case counts); else null.
 */
export function emoticonOfLine(line: string): number | null {
  if (!line.startsWith('/')) return null;
  const index = EMOTICONS.indexOf(line.slice(1));
  return index < 0 ? null : index;
}

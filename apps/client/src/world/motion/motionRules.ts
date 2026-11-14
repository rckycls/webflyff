// 2026-11-14: what using a motion or an emoticon does, from the Motion window or the task bar, as
// `CWndMgr::ObjectExecutor` does it (`_Interface/WndManager.cpp:2717-2723` the emoticon, :2922-3098 the motion). No DOM:
// the world screen gives the own mover and the senders (`MotionHost`).

import { ActMsg, ObjSta, ObjStaF } from '../sim/constants';
import { MotId, emoticonLine, motionProp, playMode, pointAngle } from './motionTable';

/** What the rules read and change of the own mover (`g_pPlayer->m_pActMover`). */
export interface MotionActor {
  readonly state: number;
  readonly stateFlag: number;
  sendActMsg(msg: number, ...params: number[]): boolean;
}

/** What a motion asks of the world screen. */
export interface MotionHost {
  readonly act: MotionActor;
  /** `GetWndVendorBase()`: a personal shop's window open (the own or another's), which takes no motion. */
  vendorOpen(): boolean;
  /** `m_szTimerChat` with `m_timerChat.Set( 1000 )`: `text` said as chat 1 s later (`WndManager.cpp:3445-3449`). */
  chatLater(text: string): void;
  /** `g_WndMng.ParsingChat( text )`: a line run as the chat runs it (an emoticon's goes as chat). */
  runChat(text: string): void;
  /** `g_pPlayer->DoPickupItemAround()` (`MoverSkill.cpp:3493-3527`). */
  pickupAround(): void;
  /** `SendMotion( dwMsg )`, PACKETTYPE_MOTION. */
  sendMotion(message: number): void;
  /** `g_pPlayer->SetAngle( f )`. */
  setAngle(angle: number): void;
  /** `ClearDest()` then `SendPlayerBehavior()`: the motion's state reported, which the server passes on to the others. */
  behave(): void;
  /** `SendDoEscape()`, refused with a box in the guild war's world (`DPClient.cpp:15635-15648`). */
  escape(): void;
  /** The focused mover when it is another player (`GetObjFocus()`, `IsPlayer()`): its object ID and name; else null. */
  focusPlayer(): { objectId: number; name: string } | null;
  /** `SendCheering( objid )`. */
  sendCheering(objectId: number): void;
  /**
   * The auto attack on the focus (`MOT_BASE_AUTOATTACK`, :3011-3036): false when there is no target it may attack, for the
   * caller's `TID_GAME_NOTTARGET`.
   */
  autoAttack(): boolean;
  /** The OK/Cancel box "Would you like to propose to %s?" (`CWndCoupleMessage`, CM_SENDPROPOSE), OK sends PROPOSE. */
  confirmPropose(name: string): void;
  /** `g_WndMng.PutString( prj.GetText( tid ), NULL, prj.GetTextColor( tid ) )`. */
  say(tid: string): void;
}

/**
 * Whether the own mover may sit down or stand up (`ObjectExecutor`, :2955-2975): not jumping, attacking, hurt or in an
 * action. (`REQ_USESKILL`, a skill's request in flight, is the skill use's and left out.)
 */
export function canToggleSit(act: Pick<MotionActor, 'state'>): boolean {
  return (act.state & (ObjSta.JUMP_ALL | ObjSta.ATK_ALL | ObjSta.DMG_ALL | ObjSta.ACTION_ALL)) === 0;
}

/** `ObjectExecutor( SHORTCUT_MOTION, id )`: the motion `id` (a `MOT_BASE_*`) used. */
export function useMotion(id: number, host: MotionHost): void {
  if (host.vendorOpen()) return;
  const prop = motionProp(id);
  if (prop === undefined) return;
  // the line is set before the motion is tried, so it is said even when the motion is refused (:2927-2931)
  if (prop.say !== '') host.chatLater(prop.say);
  const act = host.act;
  let behavior = false;
  switch (id) {
    case MotId.PICKUP:
      host.pickupAround();
      break;
    case MotId.BATTLE:
      behavior = act.sendActMsg((act.stateFlag & ObjStaF.COMBAT) !== 0 ? ActMsg.MODE_PEACE : ActMsg.MODE_COMBAT);
      break;
    case MotId.SIT:
      if (canToggleSit(act)) host.sendMotion((act.stateFlag & ObjStaF.SIT) !== 0 ? ActMsg.STANDUP : ActMsg.SITDOWN);
      break;
    case MotId.ESCAPE:
      host.escape();
      break;
    case MotId.CHEER: {
      const focus = host.focusPlayer();
      if (focus !== null) host.sendCheering(focus.objectId);
      else host.say('TID_CHEER_NO2');
      break;
    }
    case MotId.AUTOATTACK:
      if (!host.autoAttack()) host.say('TID_GAME_NOTTARGET');
      break;
    case MotId.COUPLE: {
      const focus = host.focusPlayer();
      if (focus !== null) host.confirmPropose(focus.name);
      else host.say('TID_GAME_NOTCOUPLETARGET');
      break;
    }
    default:
      if (act.sendActMsg(ActMsg.MOTION, prop.mti, playMode(prop.play))) {
        const angle = pointAngle(id);
        if (angle !== null) host.setAngle(angle);
        behavior = true;
      }
  }
  if (behavior) host.behave();
}

/** `ObjectExecutor( SHORTCUT_EMOTICON, index )`: "/" and the emoticon's command run as a chat line (:2717-2723). */
export function useEmoticon(index: number, host: Pick<MotionHost, 'runChat'>): void {
  const line = emoticonLine(index);
  if (line !== '') host.runChat(line);
}

/** `DoPickupItemAround`'s reach: items closer than 4 m (`fDistSq < 4.0f * 4.0f`, `MoverSkill.cpp:3501-3514`). */
const PICKUP_RANGE = 4;

/**
 * `CMover::DoPickupItemAround` (`MoverSkill.cpp:3493-3527`): the nearest item on the ground closer than 4 m to `pos`, which
 * the player then picks up (`CMD_SetUseItem`); null when there is none.
 */
export function nearestDrop(items: ReadonlyMap<number, { pos: readonly [number, number, number] }>, pos: readonly [number, number, number]): number | null {
  let best: number | null = null;
  let bestSq = PICKUP_RANGE * PICKUP_RANGE;
  for (const [id, drop] of items) {
    const dx = drop.pos[0] - pos[0], dy = drop.pos[1] - pos[1], dz = drop.pos[2] - pos[2];
    const sq = dx * dx + dy * dy + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = id;
    }
  }
  return best;
}

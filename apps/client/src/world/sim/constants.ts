/**
 * The values of Neuz's ground movement rules that Piece 3 uses, copied from their headers. Each object is named after
 * the C++ prefix: `ObjSta.FMOVE` is `OBJSTA_FMOVE`, `ActMsg.FORWARD` is `OBJMSG_FORWARD`, and so on.
 */

/**
 * `OBJSTA_*` (`Source/_Common/MoverMsg.h:5-91`): `CAction::m_dwState`. The state holds one value per group (move,
 * turn, look, jump, attack, damage, action), each in its own bits; `*_ALL` is a group's mask.
 */
export const ObjSta = {
  NONE: 0x00000000,
  STAND: 0x00000001,
  SIT: 0x00000003,
  FMOVE: 0x00000004,
  BMOVE: 0x00000005,
  PICKUP: 0x00000008,
  MOVE_ALL: 0x000000ff,
  LTURN: 0x00000100,
  RTURN: 0x00000200,
  TURN_ALL: 0x00000300,
  /** Falling (`MoverMsg.h:40`). */
  SJUMP3: 0x00007000,
  /** Landing (`MoverMsg.h:41`). */
  SJUMP4: 0x00008000,
  JUMP_ALL: 0x0000f000,
  ATK_ALL: 0x00ff0000,
  DMG: 0x01000000,
  DMG_FLY_ALL: 0x02000000,
  DIE_ALL: 0x08000000,
  DISAPPEAR: 0x09000000,
  DMG_ALL: 0x0f000000,
  COLLECT: 0x10000000,
  ACTION_ALL: 0xf0000000,
} as const;

/** `OBJSTAF_*` (`Source/_Common/MoverMsg.h:95-102`): `CAction::m_dwStateFlag`. */
export const ObjStaF = {
  WALK: 0x00000002,
  SIT: 0x00000004,
  FLY: 0x00000008,
  /** A custom motion is playing. */
  ETC: 0x00000020,
} as const;

/**
 * The action messages the ground rules take: `OBJMSG_*`, the `OBJMSG` enum (`Source/_Common/MoverMsg.h:105-166`),
 * which counts from `OBJMSG_NONE` = 0. These are also the values a MOTION message carries (`CDPClient::OnMotion`).
 */
export const ActMsg = {
  FORWARD: 1,
  BACKWARD: 2,
  STAND: 3,
  SITDOWN: 4,
  STANDUP: 5,
  STOP: 6,
  LTURN: 8,
  RTURN: 9,
  STOP_TURN: 10,
  MODE_WALK: 20,
  MODE_RUN: 21,
  /** Turn to the angle in the first parameter and run (`CMover::ProcessMove` sends it toward a destination). */
  TURNMOVE: 47,
} as const;

/** `MTI_*` (`Resource/defineNeuz.h:352-374`): the motion a mover plays (`CMover::m_dwMotion`). */
export const Mti = {
  STAND: 0,
  WALK: 3,
  BACK: 4,
  RUN: 5,
  JUMP3: 15,
  JUMP4: 16,
  SIT: 20,
  SITSTAND: 21,
  GETUP: 22,
} as const;

/** `ANILOOP_*` (`Source/_Common/Obj.h:26-28`): how a motion plays (`CModel::m_nLoop`). */
export const AniLoop = {
  /** `ANILOOP_1PLAY`: once. */
  ONE_PLAY: 0x00000001,
  /** `ANILOOP_CONT`: once, then holds the last frame. */
  CONT: 0x00000002,
  LOOP: 0x00000004,
} as const;

/**
 * `MAX_CORR_SIZE_45` (`Source/_AIInterface/ActionMover.h:57`, the client's value): how many steps ahead
 * `CDPClient::SendPlayerMoved` has `PresupposePos` predict.
 */
export const MAX_CORR_SIZE_45 = 22;

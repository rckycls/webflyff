// The frames a converted motion marks, as the converter writes them to `extras.events` of the motion glb's animation
// (tools/convert/src/models/motionGlb.ts) and the scene reads them back from the clip's userData (`loopMotion`,
// packages/scene/src/character/assemble.ts). Types only: the shape is the contract.

/**
 * What the frames of a motion do. A frame is MOTION_ATTR::m_fFrame, the exact frame number, 0-based: in the client's
 * motions it is the entry's index, except two sound entries half a frame later (mvr_Frinker_die1 at 20.5,
 * mvr_SkelWolf_Atk2 at 30.5). One frame can carry several flags. Each list follows the order of the frames.
 *
 * CMotion::IsAttrHit, IsAttrSound and IsAttrQuake (Source/_Common/Bone.h:162-185) tell that a flagged frame went by
 * when the motion moved from `old` to `current` with `old < frame <= current`, looking at the entry of (int)current.
 */
export interface MotionEvents {
  /** The frames with MA_HIT: a blow lands. */
  hit: number[];
  /** The frames with MA_SOUND and the sound resource id (`m_nSndID`; ModelObject.cpp:1594 plays it when above 0). */
  sound: [frame: number, sound: number][];
  /** The frames with MA_QUAKE: the screen shakes. */
  quake: number[];
  /** The motion's frame count (`m_nMaxFrame`). */
  frames: number;
  /** The motion's `m_fPerSlerp`: frames advanced per 60 Hz tick (`motionFps` gives the frames a second). */
  perSlerp: number;
}

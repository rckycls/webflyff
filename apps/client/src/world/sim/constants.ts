/**
 * The values of Neuz's ground movement rules (Piece 3) and of its attacks, damage and death (Piece 4), copied from their
 * headers. Each object is named after the C++ prefix: `ObjSta.FMOVE` is `OBJSTA_FMOVE`, `ActMsg.FORWARD` is
 * `OBJMSG_FORWARD`, and so on.
 */

/**
 * `OBJSTA_*` (`Source/_Common/MoverMsg.h:5-91`): `CAction::m_dwState`. The state holds one value per group (move,
 * turn, look, jump, attack, damage, action), each in its own bits; `*_ALL` is a group's mask.
 */
export const ObjSta = {
  NONE: 0x00000000,
  STAND: 0x00000001,
  /** The other standing state (`MoverMsg.h:9`), which a level up's motion takes too (`OnSetLevel`, `SetExperience`). */
  STAND2: 0x00000002,
  SIT: 0x00000003,
  FMOVE: 0x00000004,
  BMOVE: 0x00000005,
  PICKUP: 0x00000008,
  MOVE_ALL: 0x000000ff,
  LTURN: 0x00000100,
  RTURN: 0x00000200,
  TURN_ALL: 0x00000300,
  LOOK_ALL: 0x00000c00,
  SJUMP1: 0x00005000,
  SJUMP2: 0x00006000,
  /** Falling (`MoverMsg.h:40`). */
  SJUMP3: 0x00007000,
  /** Landing (`MoverMsg.h:41`). */
  SJUMP4: 0x00008000,
  JUMP_ALL: 0x0000f000,
  /** The four swings of a melee combo (`MoverMsg.h:48-51`). */
  ATK1: 0x00010000,
  ATK2: 0x00020000,
  ATK3: 0x00030000,
  ATK4: 0x00040000,
  /** A melee skill's motion (`MoverMsg.h:58`), which `OBJMSG_MELEESKILL` sets. */
  ATK_MELEESKILL: 0x00090000,
  ATK_ALL: 0x00ff0000,
  /** Hit: the flinch (`MoverMsg.h:68`). */
  DMG: 0x01000000,
  /** Knocked flying (`:72`), then down on the ground (`:73`), then getting up (`:74`). */
  DMG_FLY: 0x02000000,
  DMG_DIE: 0x03000000,
  DMG_LIVE: 0x06000000,
  DMG_FLY_ALL: 0x02000000,
  /** Dead on the ground (`:77`), then vanishing (`:78`, the server's only). */
  DEAD: 0x08000000,
  DISAPPEAR: 0x09000000,
  DIE_ALL: 0x08000000,
  DMG_ALL: 0x0f000000,
  COLLECT: 0x10000000,
  /** Stunned (`MoverMsg.h:88`), the state a knock-back's DAMAGE compares with (`CDPClient::OnDamage`). */
  STUN: 0x40000000,
  ACTION_ALL: 0xf0000000,
  /** `OBJSTA_ALL` (`:91`): every group's mask, which is every bit. */
  ALL: 0xffffffff,
} as const;

/** `OBJSTAF_*` (`Source/_Common/MoverMsg.h:95-102`): `CAction::m_dwStateFlag`. */
export const ObjStaF = {
  /** Combat mode: a player's motions are its weapon's set (`motionFor`). */
  COMBAT: 0x00000001,
  WALK: 0x00000002,
  SIT: 0x00000004,
  FLY: 0x00000008,
  /** A custom motion is playing. */
  ETC: 0x00000020,
} as const;

/**
 * The action messages the rules take: `OBJMSG_*`, the `OBJMSG` enum (`Source/_Common/MoverMsg.h:105-166`), which
 * counts from `OBJMSG_NONE` = 0. These are also the values a MOTION message carries (`CDPClient::OnMotion`), and `ATK1`
 * to `ATK4` the attack a MELEE_ATTACK carries.
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
  JUMP: 17,
  /** Combat mode on: a player's motions become its weapon's set. */
  MODE_COMBAT: 18,
  MODE_WALK: 20,
  MODE_RUN: 21,
  /** The four swings of a melee combo, at the object ID in the first parameter. */
  ATK1: 29,
  ATK2: 30,
  ATK3: 31,
  ATK4: 32,
  /**
   * A melee skill (`MoverMsg.h:144`): its motion in the first parameter, at the object ID in the second, as
   * `CMover::DoUseSkill` sends it (`MoverSkill.cpp:835`).
   */
  MELEESKILL: 37,
  /** Die; the first parameter says how (`DAMAGE`, `DAMAGE_FORCE` or 0), the second is the attacker. */
  DIE: 40,
  /** A plain blow, and a blow that knocks the victim flying (`CActionMover::SendDamageForce`). */
  DAMAGE: 41,
  DAMAGE_FORCE: 42,
  /** Turn to the angle in the first parameter and run (`CMover::ProcessMove` sends it toward a destination). */
  TURNMOVE: 47,
} as const;

/**
 * `MTI_*` (`Resource/defineNeuz.h:352-378`): the motion a mover plays (`CMover::m_dwMotion`). The `STAND_*` ones are
 * the first motions of the weapon sets that `motionFor` adds (`:500`, `:599`, `:796`, `:856`, `:886`).
 */
export const Mti = {
  STAND: 0,
  WALK: 3,
  BACK: 4,
  RUN: 5,
  /** The two flinches. */
  DMG1: 6,
  DMG2: 7,
  DIE1: 8,
  /** Getting up, lying after a fall, and the flight of a knock-back. */
  DMGLIVE: 9,
  DMGDIE: 10,
  DMGFLY: 11,
  JUMP1: 13,
  JUMP2: 14,
  JUMP3: 15,
  JUMP4: 16,
  SIT: 20,
  SITSTAND: 21,
  GETUP: 22,
  ATK1: 23,
  ATK2: 24,
  ATK3: 25,
  ATK4: 26,
  /** The level up (`defineNeuz.h:460`), played as it is (`MOP_FIXED`) by a standing mover. */
  LEVELUP: 198,
  /** The Vagrant's skills, Clean Hit, Flurry and Over Cut (`defineNeuz.h:936-938`), played as they are (`MOP_FIXED`). */
  VAG_ONE_CLEANHIT: 1000,
  VAG_ONE_BRANDISH: 1001,
  VAG_ONE_OVERCUTTER: 1002,
  STAND_02: 300,
  STAND_05: 600,
  STAND_11: 2200,
  STAND_13: 2328,
  STAND_14: 2356,
} as const;

/** `MOP_*` (`Source/_Common/Mover.h:43-47`): how `CMover::SetMotion` plays a motion (`m_dwMotionOption`). */
export const Mop = {
  /** Draws the weapon's trail. */
  SWDFORCE: 0x00000001,
  /** The motion as it is, never the weapon's set (`motionFor`). */
  FIXED: 0x00000002,
  /** Starts without blending from the last motion. */
  NO_TRANS: 0x00000004,
} as const;

/**
 * `IK3_*` (`Resource/defineItemkind.h:67-78`): an item's third kind (`ItemProp::dwItemKind3`), here the weapon kinds
 * whose motion sets differ. `HAND` is the bare hand's (`II_WEA_HAN_HAND`), `VIRTUAL` a monster's attack.
 */
export const Ik3 = {
  HAND: 1,
  SWD: 2,
  AXE: 3,
  CHEERSTICK: 4,
  KNUCKLEHAMMER: 5,
  WAND: 6,
  STAFF: 7,
  VIRTUAL: 10,
  YOYO: 11,
  BOW: 12,
} as const;

/**
 * `BELLI_*` (`Resource/defineAttribute.h:203-205`): how a mover takes to players (`MoverProp::dwBelligerence`, and the
 * `m_dwBelligerence` an ADD_OBJ carries). `CMover::IsPeaceful()` is `PEACEFUL` (`Source/_Common/Mover.h:1091`).
 */
export const Belli = {
  PEACEFUL: 1,
  CAUTIOUSATTACK: 2,
  ACTIVEATTACK: 3,
} as const;

/**
 * `EXT_*` (`Resource/define.h:38-59`): how a skill finds its target and what its hit does (`ItemProp::dwExeTarget`), the
 * values the skill rules tell apart.
 */
export const Ext = {
  /** On the caster itself (a buff on oneself). */
  SELFCHGPARAMET: 1,
  /** A shot that acts as it lands. */
  MAGICSHOT: 3,
  /** A magic blow at once. */
  MAGICATK: 4,
  /** On another or, with none, on oneself. */
  ANOTHERWITH: 9,
  /** Around the caster. */
  AROUNDATK: 11,
  /** A magic attack with a shot. */
  MAGICATKSHOT: 14,
  /** A melee attack skill: the Vagrant's three. */
  MELEEATK: 17,
} as const;

/** `WUI_*` (`Resource/define.h:9-21`): how a skill takes its target (`ItemProp::dwUseChance`). */
export const Wui = {
  /** On the caster, whatever is selected. */
  NOW: 1,
  /** On the selected target (the focus). */
  TARGETINGOBJ: 4,
} as const;

/** `KT_*` (`Resource/defineAttribute.h:130-131`): a skill's kind (`ItemProp::dwSkillType`). */
export const Kt = {
  MAGIC: 1,
  /** A melee skill, played with `OBJMSG_MELEESKILL`. */
  SKILL: 2,
} as const;

/** `SKILLUSETYPE` (`Source/_Common/Mover.h:134-139`): how a skill is used (USESKILL's `nUseType`). */
export const Sut = {
  /** From a slot of the task bar. */
  NORMAL: 0,
  /** The action slot's first skill. */
  QUEUESTART: 1,
  /** The action slot's next ones, which the server chains. */
  QUEUEING: 2,
} as const;

/** `SI_*` (`Resource/defineSkill.h`): the skills the rules name. */
export const Si = {
  /** Healing (:40): refused at a dead target. */
  ASS_HEAL_HEALING: 44,
  /** Resurrection (:41): wants a dead player. */
  ASS_HEAL_RESURRECTION: 45,
  /** Counter attack (:191): the one skill not played with the motion after its own. */
  GEN_ATK_COUNTER: 223,
  /** The hero Knight's recall (:210): no attack, so no auto-attack after it. */
  KNT_HERO_DRAWING: 238,
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

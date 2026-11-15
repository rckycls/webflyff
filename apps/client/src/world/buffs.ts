// A mover's buffs as the client keeps them (Piece 7 M2, [R §10]), CBuffMgr's client part:
//
//   CBuffMgr::AddBuff        _Common/buff.cpp:40-80     a new one, or a refresh: the same level keeps the longer time
//   CBuffMgr::Process        buff.cpp:700-760           a buff whose time is out goes (only a timed one)
//   CMover::Process          _Common/Mover.cpp:3484-3488  which runs every 64 frames
//   CBuffMgr::RemoveBuffs    buff.cpp:820-860           REMOVEALLSKILLINFULENCE's common ones
//
// The client applies no stat of a live buff here: the server's SETDESTPARAM does (`OwnState`). Neuz keeps the buffs in a
// `std::map` by their id, which the icons are drawn in the order of.

/** `BUFF_ITEM` 0 and `BUFF_SKILL` 1 (`_Common/buff.h`): the common buffs a death removes. */
const COMMON: ReadonlySet<number> = new Set([0, 1]);
/** `BUFF_ITEM2`: an item's buff whose level is its end (on the wire, the seconds it has left). */
const BUFF_ITEM2 = 3;
/** `if( ( m_nCount & 63 ) == 0 )`: how often the times are looked at. */
const CHECK_FRAMES = 64;

interface Buff {
  buffType: number;
  id: number;
  level: number;
  /** `m_tmTotal` (ms; 0 for one with no end) and `m_tmInst`, when it was put on (ms). */
  totalMs: number;
  since: number;
}

export interface BuffShown {
  buffType: number;
  id: number;
  level: number;
  /** What it has left (ms), and its whole length; 0 and 0 for one with no end. */
  leftMs: number;
  totalMs: number;
}

export class MoverBuffs {
  private readonly buffs = new Map<string, Buff>();
  private frames = 0;

  /** `AddBuff( wType, wId, dwLevel, tmTotal )` at `now` (ms): a refresh at the same level keeps the longer time. */
  add(buffType: number, id: number, level: number, totalMs: number, now: number): void {
    const key = `${buffType}:${id}`;
    const old = this.buffs.get(key);
    const total = old !== undefined && old.level === level ? Math.max(old.totalMs, totalMs) : totalMs;
    this.buffs.set(key, { buffType, id, level, totalMs: total, since: now });
  }

  /** `HasBuff( wType, wId )`: whether one of that kind and id is on. */
  has(buffType: number, id: number): boolean {
    return this.buffs.has(`${buffType}:${id}`);
  }

  /** REMOVESKILLINFULENCE's: the buff of that kind and id goes. */
  remove(buffType: number, id: number): void {
    this.buffs.delete(`${buffType}:${id}`);
  }

  /** REMOVEALLSKILLINFULENCE's `RemoveCommonBuffs`: the skill and item buffs go. */
  removeCommon(): void {
    for (const [key, buff] of this.buffs) if (COMMON.has(buff.buffType)) this.buffs.delete(key);
  }

  /** One frame at `now` (ms): every 64th looks at the times, and a timed buff that is out goes. */
  step(now: number): void {
    this.frames++;
    if (this.frames % CHECK_FRAMES !== 0) return;
    for (const [key, buff] of this.buffs) {
      if (buff.totalMs > 0 && now - buff.since >= buff.totalMs) this.buffs.delete(key);
    }
  }

  /**
   * The buffs at `now`, in ascending id (the map's order). A `BUFF_ITEM2`'s time is its level, the seconds it had left
   * when it came (`CBuffItem2::SerializeLevel`, buff.cpp:604-620; shown so, `WndWorld.cpp:9330-9336`), 2026-11-05.
   */
  list(now: number): BuffShown[] {
    return [...this.buffs.values()]
      .sort((a, b) => a.id - b.id || a.buffType - b.buffType)
      .map(({ buffType, id, level, totalMs, since }) => {
        const total = buffType === BUFF_ITEM2 ? Math.max(0, level) * 1000 : totalMs;
        return { buffType, id, level, totalMs: total, leftMs: total > 0 ? Math.max(0, total - (now - since)) : 0 };
      });
  }
}

/** `BUFF_ITEM` and `BUFF_SKILL` (`_Common/buff.h`): the buffs whose `Apply` is `ApplyParam` (a pet's and a worn set's are not). */
export const BUFF_ITEM = 0;
export const BUFF_SKILL = 1;
/**
 * What `ApplyParam` does not hand to `SetDestParam` (MoverActEvent.cpp:205-470): DST_HP, DST_MP, DST_FP (38-40, a heal's,
 * not a buff's), DST_CLEARBUFF 49, DST_CHR_STEALHP_IMM 50, DST_CHR_STEALHP 56, DST_CURECHR 10006.
 */
const NOT_SET = new Set([38, 39, 40, 49, 50, 56, 10006]);
/** DST_CHRSTATE 64 with CHS_STUN, CHS_DARK, CHS_INVISIBILITY, CHS_POISON or CHS_BLEEDING: a state of its own (SetStun...). */
const CHRSTATE = 64;
const STATE_BITS = 0x8 | 0x100 | 0x400 | 0x800 | 0x8000;

/** A skill level's or an item's `dwDestParam` and `nAdjParamVal` (-1 for none). */
export interface BuffParams {
  destParams?: readonly number[];
  adjParams?: readonly number[];
}

/**
 * 2026-11-13 (owner, Buff Pang's buffs after a log-out): what the own ADD_OBJ's buffs add to the own numbers. Neuz applies
 * each as it reads it (`CBuffMgr::Process` -> `CBuffSkill::Apply`, `CBuffItem::Apply`, buff.cpp:190-193, :327-330, :455-465):
 * `ApplyParam` with no send, its first two parameters to `SetDestParam` (MoverActEvent.cpp:216-470), where the server
 * sends no SETDESTPARAM for them. A skill's are its level's (`AddSkillProp`), an item's its own (`ItemProp`).
 */
export function joinBuffParams(
  buffs: ReadonlyArray<{ buffType: number; id: number; level: number }>,
  skill: (id: number, level: number) => BuffParams | undefined,
  item: (id: number) => BuffParams | undefined,
): Array<{ dst: number; adj: number }> {
  const params: Array<{ dst: number; adj: number }> = [];
  for (const buff of buffs) {
    const from = buff.buffType === BUFF_SKILL ? skill(buff.id, buff.level)
      : buff.buffType === BUFF_ITEM || buff.buffType === BUFF_ITEM2 ? item(buff.id) : undefined;
    for (let i = 0; i < 2; i++) {
      const dst = from?.destParams?.[i] ?? -1;
      const adj = from?.adjParams?.[i] ?? 0;
      if (dst < 1 || NOT_SET.has(dst) || (dst === CHRSTATE && (adj & STATE_BITS) !== 0)) continue;
      params.push({ dst, adj });
    }
  }
  return params;
}

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

  /** The buffs at `now`, in ascending id (the map's order). */
  list(now: number): BuffShown[] {
    return [...this.buffs.values()]
      .sort((a, b) => a.id - b.id || a.buffType - b.buffType)
      .map(({ buffType, id, level, totalMs, since }) => ({
        buffType, id, level, totalMs, leftMs: totalMs > 0 ? Math.max(0, totalMs - (now - since)) : 0,
      }));
  }
}

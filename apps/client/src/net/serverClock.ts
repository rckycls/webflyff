/** `CTickCount` counts in 100 ns units (`tickcount.h`: `GetTickCount` adds `( timeGetTime() - m_dwBase ) * 10000`). */
const TICKS_PER_MS = 10000n;
/** Ticks per millisecond of round trip, which is half a millisecond's worth: `OnQueryTickCount`'s `dwTime * 5000 // ( dwTime / 2 ) * 10000`. */
const TICKS_PER_ROUND_TRIP_MS = 5000n;

/** `a - b` as a Win32 `DWORD` subtraction: whole milliseconds, wrapped to 0..2^32-1 (what `>>> 0` does to a number). */
const dwordDifference = (a: number, b: number): number => (a - b) >>> 0;

/**
 * The server's clock, as the client keeps it: the login server's tick count, advanced by the local clock since it
 * arrived. Moves that reach the client are timed against it (`CTickCount::GetOffset`).
 *
 * Copies `CTickCount` (`Source/_Network/Misc/Include/tickcount.h`) and `CDPLoginClient::OnQueryTickCount`
 * (`Source/Neuz/DPLoginClient.cpp:104-115`). `now` is the local clock in milliseconds (Neuz: `timeGetTime()`); only
 * differences of its readings are used.
 *
 * Like `CTickCount`, an unstarted clock counts from zero: ask `started` before relying on it.
 */
export class ServerClock {
  /** `m_nStart`. */
  private startTick = 0n;
  /** `m_dwBase`. */
  private base = 0;
  private isStarted = false;

  constructor(private readonly now: () => number) {}

  /**
   * The login server answered QUERYTICKCOUNT (`OnQueryTickCount` then `g_TickCount.Start`). `sentAt` is the value the
   * request carried and the answer echoes (a `u32`, the client's clock wrapped to 32 bits). The answer was on its way
   * for half the round trip, so that much is added to the server's tick.
   *
   * The C++ multiplies the round trip by 5000 in a `DWORD` and adds the 32-bit sum; the products here are not wrapped
   * at 2^32. They differ only by whole 2^32 ticks (7 minutes), which `offsetMs` cannot see, and only for a round trip
   * of over 14 minutes.
   */
  start(sentAt: number, serverTick: bigint): void {
    const now = this.now();
    this.startTick = serverTick + BigInt(dwordDifference(now, sentAt)) * TICKS_PER_ROUND_TRIP_MS;
    this.base = now;
    this.isStarted = true;
  }

  /** True once the server has answered. */
  get started(): boolean {
    return this.isStarted;
  }

  /** `CTickCount::GetTickCount`: the server's tick count now. */
  tick(): bigint {
    return this.startTick + BigInt(dwordDifference(this.now(), this.base)) * TICKS_PER_MS;
  }

  /**
   * `CTickCount::GetOffset`: how many milliseconds ago the server's tick `t` was, `(int)LowPart( GetTickCount() - n )
   * / 10000`. Only the low 32 bits of the difference count, as a signed int (so a tick up to 214 s in the future is
   * negative), and the division truncates toward zero like the C++ `int`.
   */
  offsetMs(t: bigint): number {
    return Number(BigInt.asIntN(32, this.tick() - t) / TICKS_PER_MS);
  }
}

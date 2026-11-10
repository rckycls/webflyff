// Summon Angel's rules (2026-11-10, docs/superpowers/specs/2026-11-10-summon-angel-research.md): pure, for the window
// (angel/summonAngelWindow.ts), the angel that follows its player (angel/angelFollow.ts) and its buff icon.
//
//   Function                            File:lines                               what
//   CWndSummonAngel::OnDropIcon         _Interface/WndSummonAngel.cpp:250-292    a stone on a slot of its row
//   CWndSummonAngel::SetDie             WndSummonAngel.cpp:294-393               one piece, a Shift-drop's row, the bag's
//                                                                                double-click's first empty slot
//   CWndSummonAngel::OnLButtonDblClk    WndSummonAngel.cpp:229-244               a slot's piece out
//   CWndSummonAngel::SummonRateRefresh  WndSummonAngel.cpp:503-520               the rates shown
//   CWndSummonAngel::OnChildNotify      WndSummonAngel.cpp:429-479               START: each stack once, with its count
//   CMover::RenderAngelStatus           _Common/MoverRender.cpp:1951-1978        the EXP target (also WndWorld.cpp:9247-9266)

import type { AngelStack } from '@flyffweb/protocol';
import type { ExpRow } from '../gameData';

/** `II_GEN_MAT_ORICHALCUM01` 2035 ("Sunstone") and `_01_1` 2082; `II_GEN_MAT_MOONSTONE` 2036 and `_1` 2083 (`defineItem.h:886-944`). */
export const SUNSTONES: readonly number[] = [2035, 2082];
export const MOONSTONES: readonly number[] = [2036, 2083];
/** `MAX_MATDIE` (`WndSummonAngel.h:18`): 10 Sunstone slots, then 10 Moonstone slots. */
export const MAX_SLOTS = 20;
const ROW = 10;
/** `IK3_ANGEL_BUFF` (`Resource/defineItemkind.h`): the angels' buff. */
export const IK3_ANGEL_BUFF = 95;

/**
 * The angels (`II_SYS_SYS_QUE_ANGEL_RED/BLUE/GREEN/WHITE`, 30035-30038, `propItem.txt:4129-4132`): the model of their
 * `szTextFile` (`Mvr_AngelRed` ...) and the particle kind of their `dwSfxElemental` (`CMover::Process`, `Mover.cpp:3580-3586`:
 * blue 13, red 16, white 19, green 22). The item rows of the browser carry neither, so they are here.
 */
export const ANGELS: ReadonlyMap<number, { model: string; particle: number }> = new Map([
  [30035, { model: 'mvr_angelred', particle: 16 }],
  [30036, { model: 'mvr_angelblue', particle: 13 }],
  [30037, { model: 'mvr_angelgreen', particle: 22 }],
  [30038, { model: 'mvr_angelwhite', particle: 19 }],
]);

/** An item buff is the angel's (`HasBuffByIk3( IK3_ANGEL_BUFF )`). */
export const isAngelBuff = (prop: { kind3?: number } | undefined): boolean => prop?.kind3 === IK3_ANGEL_BUFF;

/** The slot row a stone goes in: 0 (Sunstone), 10 (Moonstone), or null for any other item. */
export function stoneRow(itemId: number): 0 | 10 | null {
  if (SUNSTONES.includes(itemId)) return 0;
  if (MOONSTONES.includes(itemId)) return 10;
  return null;
}

/** The rates the window shows for `n` stones: green n, white n / 10, blue 2n, red 100 - (green + blue). */
export function summonRates(n: number): { red: number; blue: number; green: number; white: number } {
  const green = n * 1;
  const white = green / 10;
  const blue = green * 2;
  return { red: 100 - (green + blue), blue, green, white };
}

/** `"%0.1f"`. */
export const rateText = (rate: number): string => rate.toFixed(1);

/** A bag stack put on a slot. */
export interface StonePiece { objectId: number; itemId: number }

/** `m_MatDie`: each slot's bag object, or null (`isUse` FALSE). One slot holds one piece of its stack. */
export class AngelSlots {
  private readonly slots: Array<number | null> = Array.from({ length: MAX_SLOTS }, () => null);

  /** The object in each slot. */
  get all(): ReadonlyArray<number | null> {
    return this.slots;
  }

  /** `m_nOrichalcum`, `m_nMoonstone`, and their sum. */
  counts(): { orichalcum: number; moonstone: number; total: number } {
    const orichalcum = this.slots.slice(0, ROW).filter((id) => id !== null).length;
    const moonstone = this.slots.slice(ROW).filter((id) => id !== null).length;
    return { orichalcum, moonstone, total: orichalcum + moonstone };
  }

  /**
   * `OnDropIcon` on `slot` (`m_nSelecCtrl`) with `free` pieces of the stack not held yet (`m_nItemNum - GetExtra()`): an
   * empty slot of the stone's row takes one (`ITEM_VALID`), or with `shift` (`m_bShiftPushed`) as many as fit in the row's
   * empty slots from its left; no free piece is `ITEM_MAX_OVERFLOW`; anything else `ITEM_INVALID`. `put` lists the slots
   * filled, each holding one more piece (`SetExtra( +n )`).
   */
  drop(slot: number, piece: StonePiece, free: number, shift: boolean): { result: 'valid' | 'overflow' | 'invalid'; put: number[] } {
    const row = stoneRow(piece.itemId);
    if (slot < 0 || slot >= MAX_SLOTS || this.slots[slot] !== null || row === null || row !== (slot < ROW ? 0 : ROW)) {
      return { result: 'invalid', put: [] };
    }
    if (free <= 0) return { result: 'overflow', put: [] };
    if (!shift) {
      this.slots[slot] = piece.objectId;
      return { result: 'valid', put: [slot] };
    }
    const empty = [...Array(ROW).keys()].map((i) => row + i).filter((i) => this.slots[i] === null);
    const put = empty.slice(0, Math.min(empty.length, free));
    for (const i of put) this.slots[i] = piece.objectId;
    return { result: 'valid', put };
  }

  /** The bag's double-click (`SetDie` with no slot chosen): the first empty slot of the stone's row, or null. */
  fromBag(piece: StonePiece): number | null {
    const row = stoneRow(piece.itemId);
    if (row === null) return null;
    for (let i = row; i < row + ROW; i++) {
      if (this.slots[i] === null) {
        this.slots[i] = piece.objectId;
        return i;
      }
    }
    return null;
  }

  /** A slot's double-click: its piece out; the object it held, or null for an empty slot. */
  remove(slot: number): number | null {
    const id = this.slots[slot] ?? null;
    if (id !== null) this.slots[slot] = null;
    return id;
  }

  /** `ReFreshAll`: every slot emptied; the objects held, one entry a piece. */
  clear(): number[] {
    const held = this.slots.filter((id): id is number => id !== null);
    this.slots.fill(null);
    return held;
  }

  /** START's `m_ItemInfo`: each object once, in the order of the slots, with how many slots hold it. */
  stacks(): AngelStack[] {
    const out: AngelStack[] = [];
    for (const id of this.slots) {
      if (id === null) continue;
      const stack = out.find((s) => s.objectId === id);
      if (stack !== undefined) stack.count++;
      else out.push({ objectId: id, count: 1 });
    }
    return out;
  }
}

/**
 * The angel's full EXP: `prj.m_aExpCharacter[ m_nAngelLevel ].nExp1 / 100 * nAngel`, `nAngel` its item's
 * `nAdjParamVal1` (100 when out of 1..100). 0 past the table.
 */
export function angelTarget(adjParam: number, angelLevel: number, exp: readonly Pick<ExpRow, 'exp1'>[]): bigint {
  const nAngel = adjParam <= 0 || adjParam > 100 ? 100 : adjParam;
  const row = exp[angelLevel];
  if (row === undefined) return 0n;
  return (row.exp1 / 100n) * BigInt(Math.trunc(nAngel));
}

/** `( m_nAngelExp * 100 ) / maxExp`, 0 when the target is 0 (`WndWorld.cpp:9262-9266`). */
export function angelPercent(exp: bigint, target: bigint): number {
  if (target <= 0n) return 0;
  return Number((exp * 100n) / target);
}

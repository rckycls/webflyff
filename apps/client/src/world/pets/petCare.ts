// The raised pet's care (pets R3, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.1-2.5): which bag items are the pet's, and the rules of their
// windows, with no DOM (petCareWindows.ts draws them).
//
//   Function                              File:lines                               what
//   CDPClient::SendDoUseItem              Neuz/DPClient.cpp:10604-10661            an EXT_PET item needs a pet out; the
//                                                                                  miracle, mistake, hatch, food, feed
//                                                                                  maker and life scroll's own branches
//                                         DPClient.cpp:10845-10857                 the naming scroll's window
//   CWndPetMiracle::OnInitialUpdate       _Interface/WndPetSys.cpp:1362-1426       B, A or S only: the two levels' steps
//   CWndPetMiracle::ReceiveResult         WndPetSys.cpp:1455-1466                  the server's two steps
//   CWndPetMiracle::Process               WndPetSys.cpp:1473-1620                  the two steps spun, then slowed to the
//                                                                                  result (Pre/CurLevelImgProcess)
//   CWndFoodConfirm::OnDraw, OnChildNotify WndPetSys.cpp:1081-1128, :1189-1227     the food mill's count: 1 to 1000, at
//                                                                                  most the stack
//   CWndPetFoodMill::OnChildNotify        WndPetSys.cpp:1708-1730                  a gem (IK3_GEM), not charged, with a
//                                                                                  price, else TID_GAME_NOTFOOD

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem, PetData } from '@flyffweb/protocol';
import { PetLevel } from './raisedPet';

/** The pet's items (`Resource/defineItem.h:3934-3942`, `:5790`). */
export const II_SYS_SYS_SCR_PET_TAMER_MISTAKE = 21030;
export const II_SYS_SYS_SCR_PET_TAMER_MIRACLE = 21031;
export const II_SYS_SYS_SCR_PET_LIFE = 21034;
export const II_SYS_SYS_SCR_PET_FEED_POCKET = 21035;
export const II_SYS_SYS_SCR_PET_HATCH = 21036;
export const II_SYS_SYS_FEED_01 = 21037;
export const II_SYS_SYS_FEED_MAKER = 21038;
export const II_SYS_SYS_SCR_PET_NAMING = 20039;

/** `EXT_PET` (`Resource/define.h:57`): an item used on the summoned raised pet. */
const EXT_PET = 19;
/** `IK3_GEM` (`Resource/defineItemkind.h:107`): the monsters' quest items the food mill grinds. */
const IK3_GEM = 34;

/**
 * What a bag or task bar use of a pet item does (`SendDoUseItem`'s `bResult` switch, :10614-10661, and :10845-10857):
 * the tamer's miracle opens its window, the mistake and the hatch scroll a `CWndCommItemDlg`, the food sends
 * USE_PET_FEED at once, the feed maker opens the food mill, the life scroll its own confirm, the naming scroll the name
 * window. The tonics, the feed pockets, the S pet's food and the second life scroll are plain DOUSEITEMs.
 */
export type PetItemUse = 'miracle' | 'mistake' | 'hatch' | 'feed' | 'feedMaker' | 'life' | 'naming';

const PET_ITEM_USES: ReadonlyMap<number, PetItemUse> = new Map([
  [II_SYS_SYS_SCR_PET_TAMER_MIRACLE, 'miracle'], [II_SYS_SYS_SCR_PET_TAMER_MISTAKE, 'mistake'],
  [II_SYS_SYS_SCR_PET_HATCH, 'hatch'], [II_SYS_SYS_FEED_01, 'feed'], [II_SYS_SYS_FEED_MAKER, 'feedMaker'],
  [II_SYS_SYS_SCR_PET_LIFE, 'life'], [II_SYS_SYS_SCR_PET_NAMING, 'naming'],
]);

/** The pet branch `prop`'s use takes, or null for none. */
export function petItemUse(prop: Pick<WebItemProp, 'id'>): PetItemUse | null {
  return PET_ITEM_USES.get(prop.id) ?? null;
}

/** `dwExeTarget == EXT_PET` (:10605-10613): no use without a summoned raised pet (`TID_GAME_PET_NOT_FOUND`). */
export function needsPet(prop: Pick<WebItemProp, 'exeTarget'>): boolean {
  return prop.exeTarget === EXT_PET;
}

/** `CPet::GetAvailLevel` (`pet.cpp:367-372`): the step rolled at `level`, D to S; 0 otherwise. */
export function availLevel(pet: Pick<PetData, 'availLevels'>, level: number): number {
  return level >= PetLevel.D && level <= PetLevel.S ? pet.availLevels[level - 1] ?? 0 : 0;
}

/** `TID_GAME_PET_GRADE_*` ("Lv. C" ...) of a level (`CWndPetMiracle::OnInitialUpdate`, :1382-1396). */
const GRADE_TIDS: Readonly<Record<number, string>> = {
  [PetLevel.C]: 'TID_GAME_PET_GRADE_C', [PetLevel.B]: 'TID_GAME_PET_GRADE_B', [PetLevel.A]: 'TID_GAME_PET_GRADE_A',
  [PetLevel.S]: 'TID_GAME_PET_GRADE_S',
};

/**
 * `CWndPetMiracle::OnInitialUpdate`: a B, A or S pet's level and the one before, their grades' texts and their steps
 * (`m_nMiracleLv`); null for another level (the window is destroyed at once: nothing shows).
 */
export function miracleOf(pet: Pick<PetData, 'level' | 'availLevels'>): {
  level: number; grades: [string, string]; steps: [number, number];
} | null {
  const level = pet.level;
  if (level !== PetLevel.B && level !== PetLevel.A && level !== PetLevel.S) return null;
  return {
    level, grades: [GRADE_TIDS[level - 1]!, GRADE_TIDS[level]!], steps: [availLevel(pet, level - 1), availLevel(pet, level)],
  };
}

/** The nine step icons (`Icon_PetLevel1_L.dds` .. `9`, :1295-1303): the spin's range. */
const STEPS = 9;
/** The spins' lengths: the first step spins for 60 frames and slows over 10 delays, the second 80 and 20 (:1487, :1511, :1554, :1578). */
const SPIN = [60, 80] as const;
const SLOW = [10, 20] as const;

/** One spin (`m_nCount`, `m_nDelay`, `m_nStatus`, the step index shown, `m_bReciveResult`, `m_nMiracleLv`). */
interface Spin {
  count: number;
  delay: number;
  /** -1 still, 0 spinning, 1 slowing down. */
  status: -1 | 0 | 1;
  /** `m_nPreLvCount` / `m_nCurLvCount`: the step index (0-8) drawn while it spins. */
  shown: number;
  /** `m_nResPreLevel` / `m_nResCurLevel`: the server's step. */
  result: number;
  received: boolean;
  /** `m_nMiracleLv`: the step drawn while it is still. */
  step: number;
}

/**
 * The tamer's miracle's two spins (`CWndPetMiracle`): still on the pet's steps; `receive` (`ReceiveResult`, :1455-1466,
 * from `CMover::CreatePetSfx`) sets them spinning; each `step` (`Process`, one a frame) moves both. A spin shows a random
 * step every 4 frames (never the same twice), then slows (one more frame between changes each time), then stops on the
 * result. Each change plays `InfOpen.wav`.
 */
export class MiracleRoll {
  readonly spins: [Spin, Spin];

  constructor(steps: readonly [number, number]) {
    const spin = (step: number): Spin => ({ count: 0, delay: 1, status: -1, shown: step - 1, result: -1, received: false, step });
    this.spins = [spin(steps[0]), spin(steps[1])];
  }

  /** `ReceiveResult( nPreLevel, nCurLevel )`: the steps the server rolled; the spins start from where they stand. */
  receive(pre: number, cur: number): void {
    [pre, cur].forEach((result, i) => {
      const spin = this.spins[i]!;
      spin.result = result;
      spin.step = result;
      spin.status = 0;
      spin.received = true;
    });
  }

  /** Spinning or slowing down. */
  get rolling(): boolean {
    return this.spins.some((spin) => spin.status !== -1);
  }

  /** The step index (0-8) `OnDraw` draws in place `slot`: the spun one while it rolls, else `m_nMiracleLv - 1`. */
  drawn(slot: 0 | 1): number {
    const spin = this.spins[slot];
    return spin.received ? spin.shown : spin.step - 1;
  }

  /**
   * `Process`: `PreLevelImgProcess` then `CurLevelImgProcess`, one frame. `random` is `rand()` as a number in [0, 1),
   * `sound` plays `InfOpen.wav`; the places that stopped this frame are returned (0, then 1).
   */
  step(random: () => number, sound: () => void): Array<0 | 1> {
    const stopped: Array<0 | 1> = [];
    for (const slot of [0, 1] as const) if (this.stepOne(slot, random, sound)) stopped.push(slot);
    return stopped;
  }

  private stepOne(slot: 0 | 1, random: () => number, sound: () => void): boolean {
    const spin = this.spins[slot];
    // `rand() % 9`, the next index if it is the one shown (9 back to 0)
    const next = (): number => {
      let n = Math.floor(random() * STEPS) % STEPS;
      if (n === spin.shown) n = n + 1 > STEPS - 1 ? 0 : n + 1;
      return n;
    };
    let stopped = false;
    if (spin.status === 0) {
      if (spin.count % 4 === 0) {
        if (spin.count > SPIN[slot]) {
          spin.count = 0;
          spin.status = 1;
        } else {
          sound();
          spin.shown = next();
        }
      }
      spin.count++;
    } else if (spin.status === 1) {
      if (spin.count > spin.delay) {
        sound();
        if (spin.delay < SLOW[slot]) {
          spin.delay++;
        } else {
          spin.shown = spin.result;
          spin.status = -1;
          spin.delay = 1;
          spin.count = 0;
          spin.received = false;
          stopped = true;
        }
        // as the C++ does, a random index after the stop too (unseen: a still spin draws `m_nMiracleLv`)
        spin.shown = next();
        spin.count = 0;
      }
      spin.count++;
    }
    return stopped;
  }
}

/**
 * `CWndPetFoodMill::OnChildNotify`'s check before MAKE_PET_FEED: a gem (`IK3_GEM`), not charged (`IsCharged`: the browser
 * keeps `m_bCharged`, not `m_nResistSMItemId`), with a price; else `TID_GAME_NOTFOOD`.
 */
export function millRefusal(prop: Pick<WebItemProp, 'kind3' | 'cost'>, item: Pick<InventoryItem, 'charged'>): string | null {
  return prop.kind3 === IK3_GEM && item.charged !== 1 && (prop.cost ?? 0) > 0 ? null : 'TID_GAME_NOTFOOD';
}

/** `CWndFoodConfirm`'s most (`0723`). */
const MAX_COUNT = 1000;

/** `CWndFoodConfirm::OnInitialUpdate` (:1144-1155): "1" for one item, else the stack, at most 1000. */
export function foodCountStart(stack: number): string {
  return String(stack === 1 ? 1 : Math.min(stack, MAX_COUNT));
}

/**
 * `CWndFoodConfirm::OnDraw` (:1081-1128), which runs every frame on the field: "1" for one item; more than 1000 is 1000,
 * more than the stack the stack; any other letter than a digit in the first 8 the stack.
 */
export function foodCountText(text: string, stack: number): string {
  if (stack === 1) return '1';
  const number = atoi(text);
  let out = text;
  if (number > MAX_COUNT) out = String(MAX_COUNT);
  else if (stack < number) out = String(stack);
  // the first 8 bytes of what was typed (`strncpy( szNumberbuf, szNumber, 8 )`)
  for (const letter of text.slice(0, 8)) if (letter < '0' || letter > '9') return String(stack);
  return out;
}

/** `CWndFoodConfirm::OnChildNotify`'s count (:1191-1201): `atoi`, used when not 0 and at most 1000; null otherwise. */
export function foodCountOf(text: string, stack: number): number | null {
  const count = stack >= 1 ? atoi(text) : 0;
  return count !== 0 && count <= MAX_COUNT ? count : null;
}

/** C's `atoi`: leading blanks, a sign, then the digits; 0 for none. */
function atoi(text: string): number {
  const match = /^\s*([+-]?\d+)/.exec(text);
  return match === null ? 0 : Number.parseInt(match[1]!, 10);
}

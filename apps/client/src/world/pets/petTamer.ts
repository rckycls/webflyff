// The Pet Tamer's rare windows' rules (pets R4, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §2.3, §5): which bag items each takes, with no DOM
// (petTamerWindows.ts draws them).
//
//   Function                              File:lines                               what
//   CWndPetTransEggs::OnDropIcon          _Interface/WndPetSys.cpp:2034-2078       an egg with no pet or a pet still an
//                                                                                  egg, not in use, not held
//   CWndInventory::OnChildNotify          _Interface/WndField.cpp:2237-2259        the same from the bag's double-click
//   CWndPetAwakCancel::OnDropIcon         WndPetSys.cpp:120-147                    a pick-up pet (`IsEatPet`); its
//                                                                                  awakening is the server's to check
//   CWndPetRes::OnDropIcon                _Interface/WndPetRes.cpp:146-191         a raised pet of B to S, not out, not
//                                                                                  held, not dead
//   CDPClient::OnQuePetResurrectionResult Neuz/DPClient.cpp:17423-17431            the box of the answer

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';
import { IK3_EGG, PetLevel } from './raisedPet';

/** `MAX_TRANS_EGG` (`_Interface/WndPetSys.h:324`): the eggs the exchange takes, `transformitem.inc`'s `stuff 10`. */
export const MAX_TRANS_EGG = 10;
/** `m_nTransform` of the egg exchange (`CTransformStuff stuff( 0 )`, WndPetSys.cpp:2106; `ITransformer::Transformer`). */
export const TRANSFORM_EGG = 0;
/** `IK3_PET` (`Resource/defineItemkind.h`): a pick-up pet (`CItemElem::IsEatPet`, `_Common/Item.h:216`). */
const IK3_PET = 100;
/** `CItemElem::expired` (`_Common/Item.h`): a dead raised pet's item. */
const ITEM_EXPIRED = 0x01;

/**
 * What the egg exchange says of an item put in it (`OnDropIcon`, and the bag's double-click while it is open): in use
 * (`IsUsing`: the summoned pet's item) `TID_GAME_TRANS_EGGS_ERROR2`; not an unhatched egg (`IK3_EGG` with no pet, or its pet
 * at `PL_EGG`) `TID_GAME_TRANS_EGGS_ERROR1`; else null, and the egg goes in when no window holds it (`IsUsableItem`).
 */
export function transEggRefusal(
  prop: Pick<WebItemProp, 'kind3'>, item: Pick<InventoryItem, 'pet'>, inUse: boolean,
): 'TID_GAME_TRANS_EGGS_ERROR1' | 'TID_GAME_TRANS_EGGS_ERROR2' | null {
  if (inUse) return 'TID_GAME_TRANS_EGGS_ERROR2';
  const unhatched = prop.kind3 === IK3_EGG && (item.pet === undefined || item.pet.level === PetLevel.EGG);
  return unhatched ? null : 'TID_GAME_TRANS_EGGS_ERROR1';
}

/** `CItemElem::IsEatPet` (`Item.h:216`): the awakening cancel takes only a pick-up pet, and says nothing of another item. */
export function isEatPet(prop: Pick<WebItemProp, 'kind3'>): boolean {
  return prop.kind3 === IK3_PET;
}

/**
 * `CWndPetRes::OnDropIcon` (WndPetRes.cpp:146-191): a raised pet of B, A or S that is not out (`GetPetId`), not held by a
 * window (`IsUsableItem`) and not dead (`expired`); false when `TID_GAME_PETTRADE_ERROR` is said in red instead.
 */
export function petTradeTakes(item: Pick<InventoryItem, 'pet' | 'flag'>, out: boolean, held: boolean): boolean {
  const pet = item.pet;
  if (pet === undefined) return false;
  if (out || held || pet.level < PetLevel.B || pet.level > PetLevel.S) return false;
  return ((item.flag ?? 0) & ITEM_EXPIRED) === 0;
}

/** `OnQuePetResurrectionResult`: the message box's text, `TID_GAME_PETTRADE_OK` or `TID_GAME_PETTRADE_FAIL`. */
export function petTradeResult(ok: boolean): 'TID_GAME_PETTRADE_OK' | 'TID_GAME_PETTRADE_FAIL' {
  return ok ? 'TID_GAME_PETTRADE_OK' : 'TID_GAME_PETTRADE_FAIL';
}

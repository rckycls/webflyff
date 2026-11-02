import type { WebItemProp } from '@flyffweb/formats';

/** Native primary/secondary equipment families; unrelated catalog types must never appear in a slot. */
export function fitsEquipmentSlot(prop: Pick<WebItemProp, 'part' | 'handed'> | undefined, part: number): boolean {
  if (!prop || prop.part < 0) return false;
  if (prop.part === part) return true;
  if ((part === 21 && prop.part === 20) || (part === 23 && prop.part === 22)) return true;
  if (part === 9 && prop.part === 10 && prop.handed === 1) return true;
  return [[6, 14], [2, 15], [4, 17], [5, 18]].some((family) => family.includes(part) && family.includes(prop.part));
}

/** MoverEquip.cpp:471-520,702-710: incoming nPart is preserved on the wire, often -1. */
export function equipmentPart(prop: WebItemProp, requested: number, equip: boolean, job: number,
  at: (part: number) => WebItemProp | undefined, occupiedPart = -1): number {
  if (!equip && occupiedPart >= 0) return occupiedPart;
  let part = requested >= 0 ? requested : prop.part;
  if (equip && (prop.part === 20 || prop.part === 22) && at(prop.part) && !at(prop.part + 1)) part = prop.part + 1;
  if (equip && prop.handed === 1 && prop.part === 10 && [7, 17, 25].includes(job) &&
      prop.id !== 6323 && at(10)?.handed === 1 && !at(11)) part = 9;
  return part;
}

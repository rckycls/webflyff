// The raised pet's numbers as its window, its item and the buff bar show them (pets R2,
// docs/superpowers/plans/2026-11-09-pets-rest.md; [R] = docs/superpowers/specs/2026-11-09-pets-research.md §2.3). Pure
// rules; the window is hud/petStatusWindow.ts.
//
//   Function                            File:lines                               what
//   CPetProperty::GetMaxEnergy          _Common/pet.cpp:98-103                   D..S from pet.inc, 1 for the egg
//   CPet::GetMaxExp                     _Common/pet.h:140                        50,000 for the egg, 100,000
//   CPet::GetLife                       _Common/pet.cpp:356-359                  0 for the egg
//   CPet::GetAvailDestParam             _Common/pet.cpp:378-388                  the kind's stat, the steps of each level added
//   CItemBase::SetTexture               _Common/Item.cpp:81-117                  the icon by level: _00, _01, _02
//   CItemElem::GetName                  _Common/Item.cpp:609-625                 "<mover> Cage", or the pet's own name
//   CWndPetStatus::PaintFrame           _Interface/WndPetSys.cpp:324-379         the window's title
//   CWndPetStatus::DrawPetInformation   WndPetSys.cpp:381-518                    the grade and stat texts
//   CWndPetStatus::OnMouseWndSurface    WndPetSys.cpp:838-919                    a step's text
//   CWndWorld::GetSystemPetTextureKey   _Interface/WndWorld.cpp:9160-9182        the buff bar's icon by level
//   CWndWorld::PutPetTooltipInfo        WndWorld.cpp:10118-10227                 the buff bar's tooltip

import type { WebItemProp, WebMover, WebPets } from '@flyffweb/formats';
import type { InventoryItem, PetData } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import { formatText } from '../hud/format';
import { II_PET_EGG, IK3_EGG, PetLevel, petModelIndex } from './raisedPet';

const f32 = Math.fround;

/** `MAX_PET_EGG_EXP` and `MAX_PET_EXP` (`_Common/pet.h:86-87`). */
const MAX_PET_EGG_EXP = 50000;
const MAX_PET_EXP = 100000;
/** `PK_MANA_UNICORN` (`Resource/define.h:257`): the owner's eighth kind, which `CWndPetStatus`'s tables never had. */
export const PK_MANA_UNICORN = 7;

/** The `DST_*` of the pets' stats (`Resource/defineAttribute.h:249-333`). */
const DST_STR = 1;
const DST_DEX = 2;
const DST_INT = 3;
const DST_STA = 4;
const DST_ADJDEF = 26;
const DST_HP_MAX = 35;
const DST_HP_MAX_RATE = 52;
const DST_MP_MAX_RATE = 53;
const DST_ATKPOWER_RATE = 66;
const DST_ADJDEF_RATE = 72;
const DST_ATKPOWER = 83;
/** The stats a pet gives in percent (`"%s +%d%%"` for these four, `DrawPetInformation` :464). */
const RATE_STATS: ReadonlySet<number> = new Set([DST_ATKPOWER_RATE, DST_ADJDEF_RATE, DST_HP_MAX_RATE, DST_MP_MAX_RATE]);

/**
 * The stat's name, by the switch of each place that writes it: the window's line (`DrawPetInformation`, :425-462) names
 * `DST_HP_MAX` `TID_TOOLTIP_HP`; a step's text (`OnMouseWndSurface`, :870-905), the item's tooltip (`PutPetInfo`) and the
 * buff bar's (`PutPetTooltipInfo`) name it `TID_TOOLTIP_DST_HP_MAX`. A stat not in the switch has no name (C++: whatever
 * `dwTooltip` held).
 */
function statTid(dst: number, place: 'window' | 'step'): string {
  switch (dst) {
    case DST_STR: return 'TID_TOOLTIP_STR';
    case DST_DEX: return 'TID_TOOLTIP_DEX';
    case DST_INT: return 'TID_TOOLTIP_INT';
    case DST_STA: return 'TID_TOOLTIP_STA';
    case DST_ATKPOWER: return 'TID_TOOLTIP_ATKPOWER_VALUE';
    case DST_ATKPOWER_RATE: return 'TID_TOOLTIP_ATKPOWER';
    case DST_ADJDEF: return 'TID_TOOLTIP_DEFENCE';
    case DST_ADJDEF_RATE: return 'TID_TOOLTIP_DST_ADJDEF_RATE';
    case DST_HP_MAX: return place === 'window' ? 'TID_TOOLTIP_HP' : 'TID_TOOLTIP_DST_HP_MAX';
    case DST_HP_MAX_RATE: return 'TID_TOOLTIP_DST_HP_MAX_RATE';
    case DST_MP_MAX_RATE: return 'TID_TOOLTIP_DST_MP_MAX_RATE';
    default: return '';
  }
}

/** `"%s +%d"`, or `"%s +%d%%"` for a stat in percent: the stat `dst` at `param`, named as `place` names it. */
export function petStatText(texts: Texts, dst: number, param: number, place: 'window' | 'step'): string {
  const name = texts.get(statTid(dst, place))?.text ?? '';
  return RATE_STATS.has(dst) ? `${name} +${param}%` : `${name} +${param}`;
}

/** The grade's text by level (`TID_GAME_PETGRADE_E` for the egg, then D, C, B, A, S). */
export function petGradeTid(level: number): string {
  return ['TID_GAME_PETGRADE_E', 'TID_GAME_PETGRADE_D', 'TID_GAME_PETGRADE_C', 'TID_GAME_PETGRADE_B',
    'TID_GAME_PETGRADE_A', 'TID_GAME_PETGRADE_S'][level] ?? '';
}

/** `CPetProperty::GetMaxEnergy` (`pet.cpp:98-103`): D to S from the table; 1 for the egg (and without the table). */
export function petMaxEnergy(level: number, pets: WebPets | undefined): number {
  return level >= PetLevel.D && level <= PetLevel.S ? pets?.maxEnergy[level - 1] ?? 1 : 1;
}

/** `CPet::GetMaxExp` (`pet.h:140`): 50,000 for the egg, 100,000 for a pet. */
export function petMaxExp(level: number): number {
  return level === PetLevel.EGG ? MAX_PET_EGG_EXP : MAX_PET_EXP;
}

/**
 * 2026-11-09 (pets R3): `CPet::GetExpPercent` (`pet.h:139`): `GetExp() * 100 / GetMaxExp()` in whole numbers, which the
 * quests' pet terms read (`Mover.cpp:9365-9381`).
 */
export function petWholeExpPercent(pet: Pick<PetData, 'level' | 'exp'>): number {
  return Math.trunc((pet.exp * 100) / petMaxExp(pet.level));
}

/** `CPet::GetLife` (`pet.cpp:356-359`): an egg has none. */
export function petLife(pet: Pick<PetData, 'level' | 'life'>): number {
  return pet.level === PetLevel.EGG ? 0 : pet.life;
}

/**
 * `CPet::GetAvailDestParam` (`pet.cpp:378-388`): the kind's stat and the sum of the steps rolled at D up to the pet's
 * level (`m_anParam[ m_anAvailLevel[ i - 1 ] - 1 ]`); 0 and 0 for a kind the table lacks. A level whose step is 0 adds
 * nothing (the C++ reads `m_anParam[-1]`, the field before the table).
 */
export function availDestParam(pet: Pick<PetData, 'kind' | 'level' | 'availLevels'>, pets: WebPets | undefined): { dst: number; param: number } {
  const kind = pets?.kinds[pet.kind];
  if (kind === undefined) return { dst: 0, param: 0 };
  let param = 0;
  for (let level = PetLevel.D; level <= pet.level; level++) param += stepValue(pet, level, pets) ?? 0;
  return { dst: kind.dst, param };
}

/**
 * The value of the step rolled at `level` (`m_anParam[ GetAvailLevel( level ) - 1 ]`, `OnMouseWndSurface` :866-868), or
 * null for none rolled (0) or a kind the table lacks.
 */
export function stepValue(pet: Pick<PetData, 'kind' | 'availLevels'>, level: number, pets: WebPets | undefined): number | null {
  const step = level >= PetLevel.D && level <= PetLevel.S ? pet.availLevels[level - 1] ?? 0 : 0;
  if (step === 0) return null;
  return pets?.kinds[pet.kind]?.steps[step - 1] ?? null;
}

/**
 * The EXP in percent as the window and the item's tooltip write it (`OnDraw` :601-608, `PutPetInfo`): `exp * 10000 /
 * max` in whole numbers, over 100 as a C float; "99.99%" from 99.99 on (`sprintf` would round 99.995 to 100.00).
 */
export function petExpText(exp: number, max: number): string {
  const percent = f32(Math.trunc((exp * 10000) / max) / 100);
  return percent >= f32(99.99) ? '99.99%' : `${percent.toFixed(2)}%`;
}

/** The EXP in percent as a C float (`fExp`), for the tooltip's own texts. */
export function petExpPercent(exp: number, max: number): number {
  return f32(Math.trunc((exp * 10000) / max) / 100);
}

/**
 * `CItemBase::SetTexture` (`Item.cpp:81-117`): an `IK3_EGG` item's icon by its pet's level, `_00` for D and C, `_01` for
 * B and A, `_02` for S (the `.` of the file's name replaced); the egg's (or one with no pet) as it is. `icon` is the
 * prop's key (`ui/item/<name>.png`), so the suffix goes before `.png`.
 */
export function petIconKey(icon: string | null, level: number): string | null {
  if (icon === null) return null;
  const suffix = level === PetLevel.D || level === PetLevel.C ? '_00'
    : level === PetLevel.B || level === PetLevel.A ? '_01' : level === PetLevel.S ? '_02' : '';
  return suffix === '' ? icon : icon.replace(/\.png$/, `${suffix}.png`);
}

/** The icon a bag item draws with (`m_pTexture`, `SetTexture`): its prop's, by its pet's level for an `IK3_EGG` one. */
export function itemIconOf(item: Pick<InventoryItem, 'pet'>, prop: Pick<WebItemProp, 'icon' | 'kind3'> | undefined): string | null {
  if (prop === undefined) return null;
  return prop.kind3 === IK3_EGG ? petIconKey(prop.icon, item.pet?.level ?? PetLevel.EGG) : prop.icon;
}

/** What `cageName` and the window's title read. */
export interface PetNameData {
  texts: Texts;
  movers: ReadonlyMap<number, Pick<WebMover, 'name'>>;
  pets?: WebPets;
}

/**
 * `CItemElem::GetName` (`Item.cpp:609-625`): an `IK3_EGG` item with a pet whose mover (`CPet::GetIndex`) the catalog
 * has is `TID_GAME_CAGE_STRING` ("%s Cage") of the pet's own name, or of the mover's; the egg too (the level test is
 * commented out). Any other item, its prop's name.
 */
export function itemName(item: Pick<InventoryItem, 'pet'>, prop: Pick<WebItemProp, 'name' | 'kind3'>, data: PetNameData): string {
  const pet = item.pet;
  if (prop.kind3 !== IK3_EGG || pet === undefined) return prop.name;
  const mover = data.movers.get(petModelIndex(pet, data.pets));
  if (mover === undefined) return prop.name;
  return formatText(data.texts.get('TID_GAME_CAGE_STRING')?.text ?? '%s', [pet.name !== '' ? pet.name : mover.name]);
}

/**
 * The window's title (`PaintFrame`, :349-361): the pet item's prop name, a hatched pet's mover's name (`GetIndex`), or
 * the pet's own name.
 */
export function petTitle(pet: PetData, prop: Pick<WebItemProp, 'name'>, data: PetNameData): string {
  if (pet.name !== '') return pet.name;
  if (pet.level > PetLevel.EGG) return data.movers.get(petModelIndex(pet, data.pets))?.name ?? prop.name;
  return prop.name;
}

/**
 * `CWndWorld::GetSystemPetTextureKey` (`WndWorld.cpp:9160-9182`) with the textures the world loads for the buff bar
 * (`:3600-3626`): a `BUFF_PET`'s icon. An `IK3_EGG` item other than the egg has three, `_00`, `_01`, `_02`, picked by the
 * own pet's level (`own`, null with none); its plain key has no texture, so at the egg's level or with no pet nothing is
 * drawn (null). The egg's item, and any other item, has its plain icon.
 */
export function petBuffIcon(prop: Pick<WebItemProp, 'id' | 'icon' | 'kind3'>, own: number | null): string | null {
  if (prop.kind3 !== IK3_EGG || prop.id === II_PET_EGG) return prop.icon;
  if (own === null || own < PetLevel.D || own > PetLevel.S) return null;
  return petIconKey(prop.icon, own);
}

/**
 * `CWndWorld::PutPetTooltipInfo` (`WndWorld.cpp:10118-10227`), the buff bar's tooltip of the own pet's item: its name
 * (`GetName`), `"Level : <grade>"`, a hatched pet's `"Bonus : <stat> +N"`, and its steps `"(Lv1/Lv2...)"` (the literal
 * "Lv%d" here, not the TID the item's tooltip uses). Lines of text, colours left out as the buff bar's tooltips leave them.
 */
export function petBuffTooltip(item: InventoryItem, prop: Pick<WebItemProp, 'name' | 'kind3'>, data: PetNameData): string[] {
  const lines = [itemName(item, prop, data)];
  const pet = item.pet;
  if (pet === undefined) return lines;
  const text = (tid: string): string => data.texts.get(tid)?.text ?? '';
  lines.push(`${text('TID_GAME_CHARACTER_02')} : ${text(petGradeTid(pet.level))}`);
  if (pet.level !== PetLevel.EGG) {
    const { dst, param } = availDestParam(pet, data.pets);
    lines.push(`${text('TID_GAME_ABILITY')} : ${petStatText(data.texts, dst, param, 'step')}`);
    const steps: string[] = [];
    for (let level = PetLevel.D; level <= pet.level; level++) steps.push(`Lv${pet.availLevels[level - 1] ?? 0}`);
    lines.push(`(${steps.join('/')})`);
  }
  return lines;
}

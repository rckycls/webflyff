// The upgrade and element glow of a held weapon (2026-11-09, the owner's ask), as Neuz V15 draws it: small effects made
// one after another along the weapon's sword-trail line, each playing once where it was made on the moving weapon.
//
//   CMover::SetRenderPartsEffect   _Common/MoverRender.cpp:24-150     the right and left weapons' kind: GEN (no element)
//                                                                     or the element, Ultimate's own (_AL); the level the
//                                                                     upgrade +N (__Y_ADV_ENCHANT_EFFECT); propEnchant.inc's
//                                                                     limits are all 0
//   CMover::Render                 MoverRender.cpp:870-905            the element levels of both weapons (nLO, nRO)
//   CModelObject::RenderEffect     _Common/ModelObject.cpp:1248-       per weapon, CreateParticle with its kind
//   CModelObject::CreateParticle   ModelObject.cpp:1838-2125          (__CSC_ENCHANT_EFFECT_2) none for GEN or an element
//                                                                     under +6 with an element level under 4; a counter
//                                                                     walks 28 points of force1-force2 (and force3-force4),
//                                                                     a frame each; every 4th frame an effect at the point:
//                                                                     XI_NAT_<kind>01_ADV + element level - 1, scaled by the
//                                                                     point's band and propEnchant.inc's *_SCAL[+N - 1]; and
//                                                                     from element level 4 the element's XI_NAT_<elem>01 +
//                                                                     its step, in the blade's middle
//   CPartsFire::Render             _Common/ModelGlobal.cpp:399-460     each effect at its point times the weapon's matrix
//
// Left out: the electric weapons' lightning (`RenderItemElec_Adv`), and the yoyo's second hand.

import type { Vec3, WebItemProp } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { Object3D } from 'three';
import { Vector3 } from 'three';

/** A worn weapon's option (`GetAttrOption`, `m_aEquipInfo[].nOption`): the upgrade, the element and the element's level. */
export interface WeaponOption {
  upgrade: number;
  element: number;
  elementLevel: number;
}

/** `nOption` unpacked (MoverRender.cpp:75-77): the upgrade in the low byte, the element D16-23, its level D24-31. */
export function weaponOption(packed: number): WeaponOption {
  return { upgrade: packed & 0xff, element: (packed >>> 16) & 0xff, elementLevel: (packed >>> 24) & 0xff };
}

/** `MAX_PARTS_FIRE`: the points along the line (`g_Option.m_nSfxLevel` 5). */
export const GLOW_POINTS = 28;
/**
 * 2026-11-09: `MAX_PARTS_FIRE` and `MAX_PARTS_FIRE_2` (`ModelGlobal.h:144-146`): the first stream's and the element
 * stream's effects a hand keeps at once (`CPartsFire::m_pList`, `m_pList_2`). `Create` fills a free slot or does nothing,
 * and a slot frees only when its effect is over (`CPartsFire::Render`, ModelGlobal.cpp:399-460). The glow files loop
 * (`repeat`), so the first 28 and 16 stay for as long as the hand holds that kind of glow.
 */
export const GLOW_SLOTS = 28;
export const GLOW_SLOTS_2 = 16;
/** propEnchant.inc's `NORMAL_SCAL` and `ALL_SCAL`: the effects' size by the upgrade +1 to +10. */
const NORMAL_SCAL = [0, 0, 0, 0, 0, 0.3, 0.4, 0.5, 0.6, 0.7];
const ULTIMATE_SCAL = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2];
/** `WEAPON_ULTIMATE` (`dwReferStat1`). */
const WEAPON_ULTIMATE = 2;
/** `SAI79::ePropType`: 0 none, 1 fire, 2 water, 3 electricity, 4 wind, 5 earth. */
const ELEC = 3;
/** `XI_NAT_<kind>01_ADV` and `_ADV_AL` (defineObj.h) by element (index 0 is GEN, `XI_NAT_NONE01_ADV` for both). */
const FIRST: readonly number[] = [1853, 1753, 1763, 1793, 1773, 1783];
const FIRST_ULTIMATE: readonly number[] = [1853, 1803, 1813, 1843, 1823, 1833];
/** `XI_NAT_FIRE01`, `_WATER01`, `_WIND01`, `_EARTH01` (defineObj.h): the element stream; electricity has none. */
const SECOND: readonly (number | null)[] = [null, 1070, 1076, null, 1083, 1101];

/** What a weapon glows with: its first stream's effect and size, and the element stream's effect; null for none. */
export interface Glow {
  /** `nType` (`PE_GEN` ... `PE_EARTH_AL`): the element, plus 6 for an Ultimate. A new kind starts the hand's slots over. */
  kind: number;
  first: { xi: number; scale: number } | null;
  second: number | null;
}

/** `nEffLevel_2` (CreateParticle): the element level 4-6 is 1, 7 is 2, 8 is 3, 9 is 4, 10 (and up, __EXT_ENCHANT) is 5. */
function elementStep(level: number): number {
  if (level >= 10) return 5;
  if (level >= 7) return level - 5;
  return level >= 4 ? 1 : 0;
}

/**
 * A held weapon's glow (`SetRenderPartsEffect` and `CreateParticle`): none for an item with a fixed element effect
 * (`dwSfxElemental`, whose level 5 is under the +6 the glow needs), nor for a plain weapon under +6 with an element level
 * under 4. Upgrades past +10 (__EXT_ENCHANT) draw as +10.
 */
export function glowOf(prop: Pick<WebItemProp, 'referStat1'>, option: WeaponOption): Glow | null {
  const element = option.element >= 0 && option.element <= 5 ? option.element : 0;
  const ultimate = prop.referStat1 === WEAPON_ULTIMATE;
  const level = Math.min(option.upgrade, 10);
  const elementLevel = Math.min(option.elementLevel, 10);
  const step = elementStep(elementLevel);
  if (!ultimate && step === 0 && level < 6) return null;
  const scale = level > 0 ? (ultimate ? ULTIMATE_SCAL : NORMAL_SCAL)[level - 1]! : 0;
  const base = (ultimate ? FIRST_ULTIMATE : FIRST)[element]!;
  const first = scale > 0 ? { xi: base + Math.max(elementLevel, 1) - 1, scale } : null;
  const second = element !== 0 && element !== ELEC && step > 0 ? SECOND[element]! + step : null;
  return first === null && second === null ? null : { kind: (ultimate ? 6 : 0) + element, first, second };
}

/** The size of an effect at the fraction `t` of the line (CreateParticle's bands). */
export function bandScale(t: number): number {
  if (t > 0.4 && t < 0.6) return 1.2;
  if (t < 0.1 || t > 0.9) return 0.6;
  if (t < 0.25 || t > 0.75) return 0.85;
  if (t < 0.4 || t > 0.6) return 1.1;
  return 0.5;
}

/** A weapon in a hand now: its object (the glb's scene, its extras the sword-trail points), its glow. */
export interface GlowingWeapon {
  object: Object3D;
  glow: Glow;
}

/** What the glow makes: an effect at a point that follows the weapon (the effect manager's `place`). */
export interface GlowEffect {
  xi: number;
  pos: Vec3;
  scale?: number;
  place: () => { pos: Vec3; angle: number } | null;
  /** Its slot frees when the effect is over (the effect manager's `ended`). */
  ended: () => void;
}

/**
 * A hand's `CPartsFire`: the kind it was made for and how many of its slots are taken. A new kind (the element or the
 * Ultimate changed) deletes it and its effects (`CreateParticle`, ModelObject.cpp:1984-2000), as does putting the weapon
 * away (`DestroyPart`, :496-504); here also a hand whose weapon no longer glows.
 */
interface Fire {
  kind: number;
  first: number;
  second: number;
  alive: boolean;
}

const point = new Vector3();

/**
 * The glows of the movers in view: `tick` once a 60 Hz frame with each mover's held weapons; it walks each mover's
 * counter (one counter a model, as `m_nEffectCount`, stepped by each weapon) and every 4th frame makes the effects into
 * the hand's free slots.
 */
export class WeaponGlows {
  private frame = 0;
  private readonly counters = new Map<number, number>();
  private readonly fires = new Map<Object3D, Fire>();

  constructor(private readonly play: (effect: GlowEffect) => void) {}

  tick(weaponsOf: Iterable<[objectId: number, weapons: readonly GlowingWeapon[]]>): void {
    this.frame++;
    const make = (this.frame & 3) === 0;
    const seen = new Set<number>();
    const held = new Set<Object3D>();
    for (const [objectId, weapons] of weaponsOf) {
      seen.add(objectId);
      for (const weapon of weapons) {
        const forces = weapon.object.userData.forces as Vec3[] | undefined;
        if (forces === undefined || forces.length < 2) continue;
        held.add(weapon.object);
        let fire = this.fires.get(weapon.object);
        if (fire !== undefined && fire.kind !== weapon.glow.kind) fire.alive = false;
        if (fire === undefined || !fire.alive) {
          fire = { kind: weapon.glow.kind, first: 0, second: 0, alive: true };
          this.fires.set(weapon.object, fire);
        }
        const lines = [[forces[0]!, forces[1]!]];
        if (forces.length >= 4 && forces[2]![0] !== 0 && forces[3]![0] !== 0) lines.push([forces[2]!, forces[3]!]);
        const { first, second } = weapon.glow;
        const count = this.counters.get(objectId) ?? 0;
        if (count >= GLOW_POINTS) {
          this.counters.set(objectId, 0);
          // the frame the counter starts over: `Create` at the line's (0, 0, 0) with a scale of 0, an effect that never
          // shows and keeps its slot, one for each line
          if (make && first !== null) fire.first = Math.min(GLOW_SLOTS, fire.first + lines.length);
          continue;
        }
        this.counters.set(objectId, count + 1);
        if (!make) continue;
        const t = count / GLOW_POINTS;
        const owner = fire;
        for (const [from, to] of lines) {
          const at = lerp(from!, to!, t);
          const follow = (): { pos: Vec3; angle: number } | null => {
            if (!owner.alive || weapon.object.parent === null) return null; // a new kind, or the weapon was put away
            weapon.object.updateWorldMatrix(true, false);
            const web = toWebPosition(at);
            point.set(web[0], web[1], web[2]).applyMatrix4(weapon.object.matrixWorld);
            return { pos: toWebPosition([point.x, point.y, point.z]), angle: 0 };
          };
          const start = follow();
          if (start === null) continue;
          if (first !== null && owner.first < GLOW_SLOTS) {
            owner.first++;
            this.play({ xi: first.xi, pos: start.pos, scale: bandScale(t) * first.scale, place: follow, ended: () => { owner.first--; } });
          }
          if (second !== null && t > 0.1 && t < 0.93 && owner.second < GLOW_SLOTS_2) {
            owner.second++;
            this.play({ xi: second, pos: start.pos, place: follow, ended: () => { owner.second--; } });
          }
        }
      }
    }
    for (const id of this.counters.keys()) if (!seen.has(id)) this.counters.delete(id);
    for (const [object, fire] of this.fires) {
      if (held.has(object)) continue;
      fire.alive = false;
      this.fires.delete(object);
    }
  }
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

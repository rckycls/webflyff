// The upgrade cursor (2026-11-05, docs/superpowers/specs/2026-11-05-buffs-premium-research.md §5): a material
// double-clicked in the bag (or its Use on a phone) starts the mode; the next bag item clicked is its target; after the
// smelt safety box (when it asks) and RunUpgrade's checks the mode ends, and 4 s later the material's packet goes (a random
// scroll asks once more first). The material's effect (XI_INT_INCHANT) stays from the start to the send.
//
//   Function                              File:lines                            what
//   CWndInventory::OnChildNotify          _Interface/WndField.cpp:2351-2398     the start, the effect
//   CWndItemCtrl::OnLButtonDown           _Interface/WndItemCtrl.cpp:723-922    the target, TID_MMI_NOTUPGRADE, the safety box
//   CWndInventory::RunUpgrade             WndField.cpp:13284-13572              the mode off, the refusals, the 4 s wait
//   CWndInventory::Process                WndField.cpp:1664-1745                the send; CWndRandomScrollConfirm (:315-385)
//   CWndInventory::BaseMouseCursor        WndField.cpp:13574-13583              a cancel: the mode and the effect, not the wait

import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { safetyConfirm, upgradeKindOf, upgradeRefusal, upgradeSend } from './upgradeItems';
import type { UpgradeKind, UpgradeSend } from './upgradeItems';

/** `SEC( 4 )`: the wait between the target's click and the send (`m_dwEnchantWaitTime`). */
export const UPGRADE_WAIT_MS = 4000;

export interface UpgradeHost {
  own(): OwnState | undefined;
  props: ReadonlyMap<number, WebItemProp>;
  /** The wait's clock (ms). */
  now(): number;
  /** An item buff of `itemId` is on (the protection scrolls'). */
  hasItemBuff(itemId: number): boolean;
  /** A message box is open: a start or a pick is then refused. */
  boxOpen(): boolean;
  /** A line in the TID's colour. */
  say(tid: string): void;
  /** A Yes/No box with the TID's text (`%s` filled from `args`). */
  confirm(tid: string, args: string[], ok: () => void, cancel: () => void): void;
  /** The material's effect on the own mover, on or off. */
  effect(on: boolean): void;
  /** 2026-11-11: the weapon in an open Jewel Setting (`CWndSmeltJewel::m_pItemElem`), or null. */
  jewelSettingWeapon?(): number | null;
  send(packet: UpgradeSend): void;
}

export class UpgradeCursor {
  /** `m_pUpgradeMaterialItem` while `m_bIsUpgradeMode`: the material's object and kind. */
  private material: { id: number; kind: UpgradeKind } | null = null;
  /** `m_pUpgradeItem` and `m_dwEnchantWaitTime`. */
  private waiting: { target: number; material: number; kind: UpgradeKind; until: number } | null = null;
  private effectOn = false;

  constructor(private readonly host: UpgradeHost) {}

  /** `m_bIsUpgradeMode`. */
  get active(): boolean {
    return this.material !== null;
  }

  /** The item a wait is for, which its slot shows (`Icon_ImgIncAni`), or null. */
  get waitingTarget(): number | null {
    return this.waiting?.target ?? null;
  }

  /** The material at `materialId` double-clicked: the mode starts; refused (TID_MMI_NOTUPGRADE) during a wait or a box. */
  begin(materialId: number): boolean {
    const own = this.host.own(), item = own?.inventory?.get(materialId);
    const prop = item && this.host.props.get(item.itemId);
    const kind = prop ? upgradeKindOf(prop) : null;
    if (!own || own.hp <= 0 || !item || item.count <= 0 || kind === null) return false;
    if (this.waiting !== null || this.host.boxOpen()) {
      this.host.say('TID_MMI_NOTUPGRADE');
      return false;
    }
    this.material = { id: materialId, kind };
    this.setEffect(true);
    return true;
  }

  /** A click on the bag item at `targetId` in the mode: true when the mode took it (the bag then does nothing else). */
  pick(targetId: number): boolean {
    if (this.material === null) return false;
    if (this.waiting !== null || this.host.boxOpen()) {
      this.host.say('TID_MMI_NOTUPGRADE');
      return true;
    }
    const own = this.host.own(), material = this.material;
    const materialItem = own?.inventory?.get(material.id), target = own?.inventory?.get(targetId);
    const materialProp = materialItem && this.host.props.get(materialItem.itemId);
    const targetProp = target && this.host.props.get(target.itemId);
    if (!materialProp || !target || !targetProp) {
      this.end();
      this.host.say('TID_UPGRADE_CANCLE');
      return true;
    }
    const safety = safetyConfirm(materialProp, targetProp, target, (id) => this.host.hasItemBuff(id));
    if (safety !== null) {
      this.host.confirm(safety, [], () => this.run(targetId), () => this.end());
      return true;
    }
    this.run(targetId);
    return true;
  }

  /** One frame: a wait that is over sends its packet (a random scroll asks first). */
  step(): void {
    const waiting = this.waiting;
    if (waiting === null || this.host.now() < waiting.until) return;
    this.waiting = null;
    this.setEffect(false);
    const send = upgradeSend(waiting.kind, waiting.material, waiting.target);
    if (waiting.kind !== 'randomScroll') {
      this.host.send(send);
      return;
    }
    const target = this.host.own()?.inventory?.get(waiting.target);
    const prop = target && this.host.props.get(target.itemId);
    if (!target || !prop) return;
    // GetRandomOpt() > 0: the low byte of the awakening's field (Item.h:167)
    const has = ((target.randomOption ?? 0n) & 0xffn) > 0n;
    this.host.confirm(has ? 'TID_GAME_RANDOMSCROLL_CONFIRM1' : 'TID_GAME_RANDOMSCROLL_CONFIRM', [prop.name], () => this.host.send(send), () => {});
  }

  /** BaseMouseCursor: the mode and its effect end (a right click, the player moving, the bag closing); a wait goes on. */
  cancel(): void {
    this.material = null;
    if (this.waiting === null) this.setEffect(false);
  }

  /** A world change or a new inventory: nothing is left. */
  reset(): void {
    this.material = null;
    this.waiting = null;
    this.setEffect(false);
  }

  /** RunUpgrade: the mode off; a refusal said, or the wait begun. */
  private run(targetId: number): void {
    const material = this.material;
    this.material = null;
    const own = this.host.own();
    const materialItem = material && own?.inventory?.get(material.id), target = own?.inventory?.get(targetId);
    const materialProp = materialItem && this.host.props.get(materialItem.itemId);
    const targetProp = target && this.host.props.get(target.itemId);
    if (!material || !materialProp || !target || !targetProp) {
      this.setEffect(false);
      this.host.say('TID_UPGRADE_CANCLE');
      return;
    }
    // 2026-11-11: Shining Oricalkum on the weapon Jewel Setting holds (RunUpgrade, WndField.cpp:13372-13381)
    const held = material.kind === 'ultimate' && this.host.jewelSettingWeapon?.() === targetId;
    const refusal = held ? 'TID_GAME_NOTEQUALITEM' : upgradeRefusal(materialProp, targetProp, target);
    if (refusal !== null) {
      this.setEffect(false);
      this.host.say(refusal);
      return;
    }
    this.waiting = { target: targetId, material: material.id, kind: material.kind, until: this.host.now() + UPGRADE_WAIT_MS };
  }

  private end(): void {
    this.material = null;
    this.setEffect(false);
  }

  private setEffect(on: boolean): void {
    if (on === this.effectOn) return;
    this.effectOn = on;
    this.host.effect(on);
  }
}

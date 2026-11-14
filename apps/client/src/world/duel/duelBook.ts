// 2026-11-15 (social): the duels, 1:1 and party, as Neuz keeps them on its movers (docs/2026-11-15-social-research.md §4):
// `m_nDuel` (0 none, 1 a 1:1 duel, 2 a party duel), `m_nDuelState` (104..101 the count, 1 fighting, 300 a dead member),
// `m_idDuelOther`, `m_idDuelParty`, `m_idparty`.
//
//   CDPClient::OnDuelRequest ... OnDuelPartyResult   Neuz/DPClient.cpp:4648-4930   each snapshot's part
//   CDPClient::OnSetDuel                             DPClient.cpp:15381-15407
//   CDPClient::OnAddObj                              DPClient.cpp:1347-1358        a player coming into view: the flag
//   CDPClient::OnAddRegion                           DPClient.cpp:16149-16180      the /ctd Duel Zone added to the world
//   CMover::IsPVPTarget                              _Common/MoverAttack.cpp:1940-1953
//   CMover::IsAttackAble (a player)                  _Common/Mover.cpp:6557-6565   EVE_18, IsPVPTarget, the own state 1,
//                                                                                  neither flying
//   CMover::ClearDuel / ClearDuelParty               _Common/Mover.cpp:8612-8630
//   CSfxDuelParty::Process                           _Common/Sfx.cpp:2806-2851     the flag goes when its duel ends
//   CWndWorld::ShowMoverMenu                         _Interface/WndWorld.cpp:6589-6608  the menu's two duels
//   CMover::UpdateRegionAttr                         _Common/Mover.cpp:2678-2710   a region's attribute where the player is

import { NULL_ID, RA_FIGHT } from '@flyffweb/protocol';
import type { DuelMessage, Vec3 } from '@flyffweb/protocol';

/** A mover's duel fields. */
export interface DuelSide {
  duel: number;
  state: number;
  other: number;
  duelParty: number;
  /** `m_idparty`. */
  party: number;
}

const cleared = (party = 0): DuelSide => ({ duel: 0, state: 0, other: NULL_ID, duelParty: 0, party });

/** `ENEMY_PVP` and `ENEMY_PVP_PARTY`: which flag a mover wears. */
export type DuelFlag = 'pvp' | 'party';

/** What the duel's snapshots ask of the screen. */
export type DuelEvent =
  /** CWndDuelConfirm: the asker's name and object, 1:1 or party. */
  | { kind: 'confirm'; party: boolean; name: string; askerId: number; askerPlayerId: number }
  /** CWndDuelResult: won or lost against `name`; the confirm box goes. */
  | { kind: 'result'; win: boolean; name: string }
  /** A line of the game's: the TID and its arguments. */
  | { kind: 'line'; tid: string; args: string[] }
  /** The flag over a mover's head (`RenderFlag`). */
  | { kind: 'flag'; objectId: number; flag: DuelFlag }
  /** DUELCOUNT: the count drawn now. */
  | { kind: 'count'; count: number };

/** What the book reads of the world. */
export interface DuelWorld {
  ownObjectId(): number | undefined;
  /** `g_Party.m_uPartyId`. */
  ownPartyId(): number;
  /** `prj.GetUserByID( idPlayer )`: a player in view. */
  byPlayerId(playerId: number): { objectId: number; name: string; dead: boolean } | undefined;
  /** `prj.GetMover( id )`. */
  mover(objectId: number): { name: string } | undefined;
}

/** A region the server added (`m_aRegion.AddTail`): its attribute and rect, x from left to right, z from top to bottom. */
interface AddedRegion {
  worldId: number;
  attribute: number;
  rect: readonly [number, number, number, number];
}

export class DuelBook {
  private ownSide: DuelSide = cleared();
  private readonly sides = new Map<number, DuelSide>();
  private readonly regions: AddedRegion[] = [];

  constructor(private readonly world: DuelWorld) {}

  /** The own player's fields. */
  get own(): Readonly<DuelSide> {
    return this.ownSide;
  }

  /** Another mover's fields (cleared ones when unknown). */
  side(objectId: number): Readonly<DuelSide> {
    if (objectId === this.world.ownObjectId()) return this.ownSide;
    return this.sides.get(objectId) ?? cleared();
  }

  /** `IsPVPTarget( pMover )` of the own player. */
  isPvpTarget(objectId: number): boolean {
    const own = this.ownSide, other = this.side(objectId);
    const target = (own.other !== NULL_ID && own.other === objectId) || (own.duelParty > 0 && own.duelParty === other.party);
    return target && (own.state === 1 || other.state === 1);
  }

  /** The duel part of the client's `IsAttackAble` for a player: a duel target, the own state 1, neither flying. */
  canAttack(objectId: number, ownFlying: boolean, targetFlying: boolean): boolean {
    return this.isPvpTarget(objectId) && this.ownSide.state === 1 && !ownFlying && !targetFlying;
  }

  /** Whether the flag `flag` over `objectId` stays (`CSfxDuelParty::Process`). */
  flagShown(objectId: number, flag: DuelFlag): boolean {
    const side = this.side(objectId);
    return flag === 'pvp' ? side.duel === 1 : side.duel === 2 && side.state !== 300 && side.state !== 0;
  }

  /** `IsRegionAttr( RA_FIGHT )` at `pos` in the world `worldId`: inside an added region with RA_FIGHT (none of our worlds has it). */
  inFightRegion(worldId: number, pos: Vec3): boolean {
    const x = Math.trunc(pos[0]), z = Math.trunc(pos[2]);
    return this.regions.some((region) => region.worldId === worldId && (region.attribute & RA_FIGHT) !== 0 &&
      x >= region.rect[0] && x < region.rect[2] && z >= region.rect[1] && z < region.rect[3]);
  }

  /** A new world: its added regions go with the old one. */
  enterWorld(): void {
    this.regions.length = 0;
  }

  /** A player came into view (its ADD_OBJ's fields), and the flag it wears to the own player (`OnAddObj`). */
  added(objectId: number, fields: { partyId: number; duelParty: number; duel: number } | undefined, self: boolean): DuelEvent[] {
    const side: DuelSide = { ...cleared(fields?.partyId ?? 0), duel: fields?.duel ?? 0, duelParty: fields?.duelParty ?? 0 };
    if (self) {
      this.ownSide = { ...side, state: this.ownSide.state, other: this.ownSide.other };
      return [];
    }
    this.sides.set(objectId, side);
    const own = this.ownSide;
    const events: DuelEvent[] = [];
    if (own.duelParty !== 0 && own.duelParty === side.party) {
      events.push({ kind: 'flag', objectId, flag: 'party' });
      side.duel = 2;
      side.duelParty = this.world.ownPartyId();
    }
    if (own.duel !== 0 && own.other === objectId) {
      events.push({ kind: 'flag', objectId, flag: 'pvp' });
      side.other = this.world.ownObjectId() ?? NULL_ID;
    }
    return events;
  }

  removed(objectId: number): void {
    this.sides.delete(objectId);
  }

  apply(message: DuelMessage): DuelEvent[] {
    switch (message.type) {
      case 'duelRequest': {
        const asker = this.world.byPlayerId(message.asker);
        if (asker === undefined || asker.dead) return [];
        return [{ kind: 'confirm', party: message.party, name: asker.name, askerId: asker.objectId, askerPlayerId: message.asker }];
      }
      case 'duelStart':
        return this.start(message.target, message.flag);
      case 'duelNo': {
        const mover = this.world.mover(message.objectId);
        return mover === undefined ? [] : [{ kind: 'line', tid: 'TID_GAME_DUELNO', args: [mover.name] }];
      }
      case 'duelCancel':
        this.ownSide = this.clear(this.ownSide);
        if (this.sides.has(message.objectId)) this.sides.set(message.objectId, this.clear(this.sides.get(message.objectId)!));
        return [{ kind: 'line', tid: 'TID_GAME_DUELCANCEL', args: [] }];
      case 'duelPartyStart':
        return this.partyStart(message.partyId, message.name, message.members, message.flag);
      case 'duelPartyEnd': {
        for (const playerId of message.players) {
          const mover = this.world.byPlayerId(playerId);
          const side = mover === undefined ? undefined : this.sides.get(mover.objectId);
          if (mover !== undefined && side !== undefined) this.sides.set(mover.objectId, this.clearParty(side));
        }
        this.ownSide = this.clearParty(this.ownSide);
        const tid = message.result === 'cancel' ? 'TID_GAME_PDCANCEL' : message.result === 'win' ? 'TID_GAME_PDVICTORY' : 'TID_GAME_PDLOSE';
        return [{ kind: 'line', tid, args: [] }];
      }
      case 'setDuel':
        return this.setDuel(message);
      case 'duelCount':
        return [{ kind: 'count', count: message.count }];
      case 'addRegion': {
        // OnAddRegion: added to the own world once, while its last region is not already the Duel Zone's
        const last = this.regions.at(-1);
        if (last === undefined || last.worldId !== message.worldId || last.attribute !== message.attribute) {
          this.regions.push({ worldId: message.worldId, attribute: message.attribute, rect: message.rect });
        }
        return [];
      }
    }
  }

  private start(target: number, flag: number): DuelEvent[] {
    const mover = this.world.byPlayerId(target);
    if (mover === undefined) return [];
    const own = this.world.ownObjectId() ?? NULL_ID;
    switch (flag) {
      case 0: {
        this.ownSide = { ...this.ownSide, duel: 1, other: mover.objectId, state: 104 };
        const side = this.sides.get(mover.objectId) ?? cleared();
        this.sides.set(mover.objectId, { ...side, duel: 1, other: own });
        return [{ kind: 'flag', objectId: mover.objectId, flag: 'pvp' }];
      }
      case 1:
        this.ownSide = { ...this.ownSide, state: 1 };
        return [{ kind: 'line', tid: 'TID_GAME_DUELSTART', args: [mover.name] }];
      case 2:
        this.ownSide = this.clear(this.ownSide);
        this.sides.set(mover.objectId, this.clear(this.sides.get(mover.objectId) ?? cleared()));
        return [];
      case 3:
      case 4:
        return mover.dead ? [] : [{ kind: 'result', win: flag === 3, name: mover.name }];
      default:
        return [];
    }
  }

  private partyStart(partyId: number, name: string, members: readonly number[], flag: number): DuelEvent[] {
    const events: DuelEvent[] = [];
    const ownParty = this.world.ownPartyId();
    for (const objectId of members) {
      if (this.world.mover(objectId) === undefined) continue;
      const side = this.sides.get(objectId) ?? cleared();
      side.party = partyId;
      side.duel = 2;
      side.duelParty = ownParty;
      if (flag === 1) side.state = 1;
      else if (flag === 0) {
        events.push({ kind: 'flag', objectId, flag: 'party' });
        side.state = 104;
      }
      this.sides.set(objectId, side);
    }
    this.ownSide = { ...this.ownSide, party: ownParty, duel: 2, duelParty: partyId };
    if (flag === 1) {
      this.ownSide.state = 1;
      events.push({ kind: 'line', tid: 'TID_GAME_PDSTART', args: [name] });
    } else if (flag === 0) this.ownSide.state = 104;
    return events;
  }

  private setDuel(message: Extract<DuelMessage, { type: 'setDuel' }>): DuelEvent[] {
    const own = message.objectId === this.world.ownObjectId();
    const before = own ? this.ownSide : this.sides.get(message.objectId);
    const mover = this.world.mover(message.objectId);
    if (before === undefined && mover === undefined) return [];
    const events: DuelEvent[] = [];
    // the own duel cleared: the other one's too
    if (own && this.ownSide.duel === 1 && message.duel === 0) {
      const other = this.sides.get(this.ownSide.other);
      if (other !== undefined) this.sides.set(this.ownSide.other, this.clear(other));
    }
    if (message.duel === 2 && message.state === 300) events.push({ kind: 'line', tid: 'TID_GAME_PVPLEAVE', args: [mover?.name ?? ''] });
    const next: DuelSide = { ...(before ?? cleared()), duel: message.duel, state: message.state, other: message.other, duelParty: message.duelParty };
    if (own) this.ownSide = next;
    else this.sides.set(message.objectId, next);
    return events;
  }

  /** `ClearDuel()`: no duel, no state, no other. */
  private clear(side: DuelSide): DuelSide {
    return { ...side, duel: 0, state: 0, other: NULL_ID };
  }

  /** `ClearDuelParty()`: no duel, no party duel, no state. */
  private clearParty(side: DuelSide): DuelSide {
    return { ...side, duel: 0, duelParty: 0, state: 0 };
  }
}

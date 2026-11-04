// Every sound and jingle the world plays, in one place: the table of docs/superpowers/specs/
// 2026-11-02-piece6-m2-sound-research.md §6 and §9. The packet and event handlers of the world screen call these, at the
// moment the C++ site plays its sound; nothing else in the world plays one, so no event plays a sound twice.
// Positions are FlyFF positions (D3D), as `PLAYSND( id, &pos )` is given them.

import type { WebAudio } from '@flyffweb/formats';
import { AttackFlag } from '@flyffweb/protocol';
import type { OwnEvent } from '../OwnState';
import type { CombatEvent } from '../WorldState';
import {
  BGM_EV_END, BGM_EV_LIGHTWING, BGM_EV_START, BGM_IN_BOSS, BGM_TH_FLYING, BGM_IN_DEATH, BGM_IN_LEVELUP, NO_DEATH_MUSIC, RANK_BOSS, SND_INF_GROUNDDROP,
  SND_INF_GROUNDPICKUP, SND_INF_TRADE, SND_WALK_LANDSOFT, XI_SOUNDS,
} from '../../audio/soundIds';
import { equipSound } from './soundRules';
import type { Vec } from './soundRules';

/** The effects player: `PLAYSND( id, pos )` and `PLAYSND( file, pos )`. */
export interface SoundOut {
  play(id: number, at?: Vec): void;
  playKey(key: string, at?: Vec): boolean;
}

/** The music rules' `PlayMusic( id, loops )`. */
export interface JingleOut {
  play(id: number, loops?: number): void;
}

/** `D3DXVec3Length( &( a - b ) ) < 30` (DPClient.cpp:1255-1257). */
const BOSS_RANGE = 30;

export class WorldSounds {
  constructor(private readonly audio: SoundOut, private readonly music: JingleOut, private readonly catalog: WebAudio | null) {}

  /** A melee hit that lands: the attacker's active-hand item's dwSndAttack1 (MoverActEvent.cpp:1676-1691). */
  meleeHit(attacker: Vec, weaponItemId: number | undefined): void {
    const id = weaponItemId === undefined ? undefined : this.catalog?.items[weaponItemId]?.attack1;
    if (id !== undefined) this.audio.play(id, attacker);
  }

  /** A DAMAGE with AF_CRITICAL: the attacker's weapon's dwSndAttack2 (DPClient.cpp:1903-1907). */
  critical(attacker: Vec, weaponItemId: number | undefined): void {
    const id = weaponItemId === undefined ? undefined : this.catalog?.items[weaponItemId]?.attack2;
    if (id !== undefined) this.audio.play(id, attacker);
  }

  /** CMover::DoEquip's sound (MoverEquip.cpp:1013-1041), for the own player and others. */
  equip(mover: Vec, prop: { kind1: number; kind2: number } | undefined, equip: boolean): void {
    if (equip && prop === undefined) return;
    const id = equipSound(prop?.kind1 ?? -1, prop?.kind2 ?? -1, equip);
    if (id > 0) this.audio.play(id, mover);
  }

  /** CREATE_ITEM for the own player: one pick-up sound per inventory slot written (DPClient.cpp:2148-2156). */
  itemsCreated(own: Vec, slots: number): void {
    for (let i = 0; i < slots; i++) this.audio.play(SND_INF_GROUNDPICKUP, own);
  }

  /** The own gold changed (`DST_GOLD`, MoverParam.cpp:946-947). */
  gold(): void {
    this.audio.play(SND_INF_TRADE);
  }

  /** A buy confirmed or a sale (WndShop.cpp:655, :232-235). */
  shop(): void {
    this.audio.play(SND_INF_TRADE);
  }

  /** An inventory item dropped on the world, before any confirm (WndWorld.cpp:7828-7830). */
  drop(): void {
    this.audio.play(SND_INF_GROUNDDROP);
  }

  /** A ground item appeared: its dwSubDefine, at the item (DPClient.cpp:1293-1298, `__ITEM_DROP_SOUND`). */
  groundItem(at: Vec, itemId: number): void {
    const id = this.catalog?.items[itemId]?.drop;
    if (id !== undefined) this.audio.play(id, at);
  }

  /** A click on a mover: its dwSndIdle1 (WndWorld.cpp:7063). */
  moverClicked(moverId: number): void {
    const id = this.catalog?.movers[moverId];
    if (id !== undefined) this.audio.play(id);
  }

  /**
   * An effect made (CreateSfx): the sound CreateSfx gives some ids itself (CreateObj.cpp:82, :180-181), then the WAV of
   * its mdlDyna.inc entry (:328-329), at its source.
   */
  effect(xi: number, at: Vec): void {
    const fixed = XI_SOUNDS.get(xi);
    if (fixed !== undefined) this.audio.play(fixed, at);
    const key = this.catalog?.effects[xi];
    if (key !== undefined) this.audio.playKey(key, at);
  }

  /** A skill's effect made or its projectile fired: the skill's dwSndAttack1 at the caster (Ctrl.cpp:982-986, :1386-1390). */
  skillCast(caster: Vec, skillId: number): void {
    const id = this.catalog?.skills[skillId];
    if (id !== undefined) this.audio.play(id, caster);
  }

  /** A motion's MA_SOUND frame (ModelObject.cpp:1594-1596), at the mover. */
  motion(at: Vec, soundId: number): void {
    this.audio.play(soundId, at);
  }

  /** A player's footstep (CMover::ProcessWalkSound, Mover.cpp:3202-3219). */
  footstep(at: Vec): void {
    this.audio.play(SND_WALK_LANDSOFT, at);
  }

  /** PLAYSOUND of type 0 (DPClient.cpp:11744-11767); a type-1 file name (`null`) is not played. */
  serverSound(id: number | null): void {
    if (id !== null) this.audio.play(id);
  }

  /** PLAYMUSIC (DPClient.cpp:11736-11742). */
  serverMusic(id: number): void {
    this.music.play(id, 1);
  }

  /** An NPC dialog opened: the character's SetMusic, once (WndDialog.cpp:290-297). */
  npcDialog(characterKey: string): void {
    const id = this.catalog?.npcMusic[characterKey.toLowerCase()];
    if (id !== undefined) this.music.play(id, 1);
  }

  /** The own player died (DPClient.cpp:2012-2034): the death jingle, but not in the guild war and boss dungeons. */
  ownDeath(worldId: number): void {
    if (!NO_DEATH_MUSIC.has(worldId)) this.music.play(BGM_IN_DEATH, 1);
  }

  /** The own player levelled up (MoverParam.cpp:1483, :1728). */
  ownLevelUp(): void {
    this.music.play(BGM_IN_LEVELUP, 1);
  }

  /**
   * What a combat event of the rules plays: a melee hit that lands (`attackerHit`, the hit frame of the swing), a
   * DAMAGE with AF_CRITICAL, and a skill's launch on its hit frame (`skillHit`, where the skill's effect is made). `mover`
   * is a mover in view: its FlyFF position and its active-hand item (`WorldState.handItem`).
   */
  combatEvent(event: CombatEvent, mover: (id: number) => { pos: Vec; weapon: number | null } | undefined): void {
    if (event.kind === 'attackerHit') {
      const attacker = mover(event.attackerId);
      if (attacker !== undefined) this.meleeHit(attacker.pos, event.weapon ?? undefined);
    } else if (event.kind === 'hit' && (event.flags & AttackFlag.CRITICAL) !== 0) {
      const attacker = mover(event.attackerId);
      if (attacker !== undefined) this.critical(attacker.pos, attacker.weapon ?? undefined);
    } else if (event.kind === 'skillHit') {
      const caster = mover(event.casterId);
      if (caster !== undefined) this.skillCast(caster.pos, event.skill);
    }
  }

  /**
   * What an own event plays: the death and level-up jingles (a job change plays the level-up's, `DPClient.cpp:3638`,
   * Piece 7 M2), and the quests' (Piece 7 M1): a new quest BGM_EV_START (`CMover::__SetQuest`, MoverParam.cpp:3534), one
   * that ends or is removed BGM_EV_END (:3600, `RemoveQuest` :3495).
   */
  /** Piece 7 M5: `m_bFirstFlying` (`CWndWorld`), whether this session has played the first flight's music. */
  private flownOnce = false;

  /**
   * Piece 7 M5: a ride put on (`CMover::DoEquip`, `MoverEquip.cpp:1804-1821`): the own player's only (`own`), as another's
   * goes through `DoFakeEquip`, which plays nothing: BGM_TH_FLYING the first time, BGM_EV_LIGHTWING after.
   */
  flightMusic(own: boolean): void {
    if (!own) return;
    this.music.play(this.flownOnce ? BGM_EV_LIGHTWING : BGM_TH_FLYING, 1);
    this.flownOnce = true;
  }

  ownEvent(event: OwnEvent, worldId: number): void {
    if (event.kind === 'died') this.ownDeath(worldId);
    else if (event.kind === 'levelUp' || event.kind === 'jobChanged') this.ownLevelUp();
    else if (event.kind === 'quest') {
      const change = event.change.kind;
      if (change === 'started') this.music.play(BGM_EV_START, 1);
      else if (change === 'ended' || change === 'removed') this.music.play(BGM_EV_END, 1);
    }
  }

  /** An NPC added (DPClient.cpp:1252-1259): a boss within 30 m plays BGM_IN_BOSS. */
  bossAdded(npc: Vec, own: Vec, rank: number): void {
    if (rank !== RANK_BOSS) return;
    if (Math.hypot(npc.x - own.x, npc.y - own.y, npc.z - own.z) < BOSS_RANGE) this.music.play(BGM_IN_BOSS, 1);
  }
}

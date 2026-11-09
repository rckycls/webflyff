// The raised pet's status window as the world opens and closes it, and its portrait (pets R2,
// docs/superpowers/plans/2026-11-09-pets-rest.md; [R] = docs/superpowers/specs/2026-11-09-pets-research.md §2.3):
//
//   CMover::ProcessPet          _Common/Mover.cpp:10884-10889      the own pet's mover made: the window opens unless open
//                               Mover.cpp:10900-10909              deleted with no pet out: the window closes
//   CMover::CreatePetSfx        Mover.cpp:11163-11175              made after the tamer's miracle (PF_PET_GET_AVAIL): its
//                                                                  window gets the two new steps (R3's, `miracle`)
//   CDPClient::OnPetRelease     Neuz/DPClient.cpp:16420-16448      PET_RELEASE: the window closes (and the miracle and food
//                                                                  windows, R3's)
//   CWndWorld::OnCommand        _Interface/WndWorld.cpp:5877-5898  MaFl_Pet's menu: MMI_PET_STATUS toggles the window (a new
//                                                                  one each time), MMI_PET_RELEASE sends PET_RELEASE and
//                                                                  closes it
//   CWndPetStatus::Process      _Interface/WndPetSys.cpp:986-1029  the portrait's model, the pet mover's while there is one

import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import type { WebGLRenderer } from 'three';
import type { UiArt } from '../hud/art';
import type { WindowFrame } from '../hud/frame';
import { MMI } from '../hud/moverMenu';
import { PetStatusWindow } from '../hud/petStatusWindow';
import type { PetStatusData } from '../hud/petStatusWindow';
import type { OwnState, PetChange } from '../OwnState';
import { PetPortrait, petCamera } from '../render/petPortrait';
import type { Mover } from '../WorldState';
import { PetFlag } from './raisedPet';

/** What the windows need of the world screen. */
export interface PetWindowsHost {
  /** The own numbers (`g_pPlayer`'s), whose pet item the window draws (`GetPetItem`). */
  own(): OwnState | undefined;
  /** The status window (APP_STATUS1), which the pet window opens beside. */
  statusFrame(): WindowFrame | null;
  /** PET_RELEASE (`SendPetRelease`). */
  sendPetRelease(): void;
  /** The own pet's mover (`m_pet.GetObj()`), undefined while there is none. */
  petMover(): Mover | undefined;
  /** The model and stand motion of `mover` (the egg's idle), loaded for the portrait alone; null when it cannot be had. */
  loadPortrait(mover: Mover): Promise<{ model: AssembledCharacter; motion: LoopedMotion | null } | null>;
  /** The page's renderer, the portrait's drawing; null while there is none. */
  renderer(): WebGLRenderer | null;
  /** R3: the pet mover made again after the tamer's miracle (`PF_PET_GET_AVAIL`), the miracle window's two steps. */
  miracle?(): void;
}

/**
 * The status window, opened by the own pet's mover being made (`shown`) or its menu, closed by its going (`hidden`,
 * `released`) or its menu; `frame` draws it and its portrait each frame, `step` moves the portrait's motion each step.
 */
export class PetWindows {
  readonly status: PetStatusWindow;
  readonly portrait: PetPortrait;
  /** The pet mover the portrait was made for (`objectId:index`), null for none. */
  private portraitOf: string | null = null;
  private loading = 0;

  constructor(art: UiArt, data: PetStatusData, private readonly host: PetWindowsHost, doc: Document = document,
    report: (error: unknown) => void = () => {}) {
    this.status = new PetStatusWindow(art, data, doc);
    this.portrait = new PetPortrait(doc, report);
    this.status.portraitBox().append(this.portrait.canvas);
    // the portrait is the window's own (`m_pPetModel`): it goes with the window
    const closed = this.status.window.onClose;
    this.status.window.onClose = () => {
      closed();
      this.dropPortrait();
    };
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.status.window.element;
  }

  /** The own pet's events (`OwnEvent` 'pet'). */
  onPet(change: PetChange): void {
    switch (change.kind) {
      case 'shown': // ProcessPet (:10884-10889): `FALSE == GetWndBase( APP_PET_STATUS )`
        if (!this.status.isOpen) this.status.open(this.host.statusFrame());
        if (change.levelup === PetFlag.GET_AVAIL) this.host.miracle?.(); // CreatePetSfx (:11163-11175), R3's window
        break;
      case 'hidden': // ProcessPet (:10900-10909)
      case 'released': // OnPetRelease (:16426-16429)
        this.status.close();
        break;
      default:
        break;
    }
  }

  /** `CWndWorld::OnCommand` (`WndWorld.cpp:5877-5898`) for MaFl_Pet's entries. */
  choose(entry: number): void {
    if (entry === MMI.PET_STATUS) {
      if (this.status.isOpen) this.status.close();
      else this.status.open(this.host.statusFrame());
    } else if (entry === MMI.PET_RELEASE) {
      this.host.sendPetRelease();
      this.status.close();
    }
  }

  /** `CWndPetStatus::Process`'s `FrameMove`: the portrait's motion a frame on, each step of the world. */
  step(): void {
    if (this.status.isOpen) this.portrait.step();
  }

  /** A frame: the window drawn from the pet item (`OnDraw`), its portrait made, let go or drawn (`Process`). */
  frame(): void {
    if (!this.status.isOpen) return;
    const item = this.host.own()?.petItem();
    this.status.update(item);
    const pet = item?.pet;
    const mover = pet === undefined ? undefined : this.host.petMover();
    const of = mover === undefined ? null : `${mover.objectId}:${mover.added.index}`;
    if (of !== this.portraitOf) {
      this.dropPortrait();
      this.portraitOf = of;
      const camera = pet === undefined ? null : petCamera(pet.level, pet.kind);
      if (mover !== undefined && camera !== null) {
        const ticket = ++this.loading;
        void this.host.loadPortrait(mover).then((loaded) => {
          if (loaded === null) return;
          // a newer model was asked for, or the window closed, meanwhile: this one is let go
          if (ticket !== this.loading || this.portraitOf !== of) loaded.model.release();
          else this.portrait.show(loaded.model, loaded.motion, camera);
        });
      }
    }
    const renderer = this.host.renderer();
    if (renderer !== null) this.portrait.draw(renderer);
  }

  dispose(): void {
    this.dropPortrait();
    this.status.dispose();
  }

  /** `SAFE_DELETE( m_pPetModel )`: the portrait's model let go (one still loading is let go when it comes). */
  private dropPortrait(): void {
    this.loading++;
    this.portraitOf = null;
    this.portrait.clear();
  }
}

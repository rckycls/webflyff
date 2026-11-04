// The party skills' mode icons (Piece 7 M4, [R §8.4]).
//
//   CDPClient::OnSetPartyMode    Neuz/DPClient.cpp:5023-5239       modes 0-3 on: `m_buffs.AddBuff( BUFF_SKILL, skill, 1,
//                                                                  dwSkillTime )`; off leaves the icon to run out
//   CWndWorld::RenderBuff        _Interface/WndWorld.cpp:10637-10745 a row from x = width / 2 − 100, y = 10, each icon 37 px
//                                                                  left of the one before, drawn only while mode 4 is on
//                                                                  or the leader is in view
//   CWndWorld::RenderBuffIcon    WndWorld.cpp:9185-9560             alpha 192, 64 to 192 in steps of 6 in its last 20 s;
//                                                                  the seconds left in yellow (240, 240, 0); the tooltip:
//                                                                  the name, `MM:SS` left, the description
//
// The icons are a `MoverBuffs` the screen keeps (cleared on a leader change, the leader's leaving and the party's end);
// the blink is `BuffStatus`'s.

import type { WebParty } from '@flyffweb/formats';
import type { MoverBuffs } from '../../buffs';
import type { UiArt } from '../art';
import { blink } from '../buffStatus';

/** `BUFF_SKILL` (`_Common/buff.h`). */
const BUFF_SKILL = 1;
const PITCH = 37;
const ICON_PX = 32;
const ALPHA = 192;
const BLINK_MS = 20000;

const mmss = (ms: number): string => {
  const s = Math.trunc(ms / 1000);
  return `${String(Math.trunc(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export class PartyBuffRow {
  readonly element: HTMLElement;
  private readonly blinks = new Map<number, { alpha: number; up: boolean }>();
  private listed = '';

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'hud-party-buffs';
    Object.assign(element.style, { position: 'absolute', left: 'calc(50% - 100px)', top: '10px', width: '0px', height: `${ICON_PX}px` });
    element.hidden = true;
    this.element = element;
  }

  /** A frame at `now` (the buffs' clock): the icons still running, shown while `shown`. */
  update(buffs: MoverBuffs, catalog: WebParty | null, shown: boolean, now: number): void {
    const running = buffs.list(now).filter((b) => b.buffType === BUFF_SKILL && b.leftMs > 0 && catalog?.skills.some((s) => s.id === b.id) === true);
    this.element.hidden = !shown || running.length === 0;
    const listed = running.map((b) => b.id).join(',');
    if (listed !== this.listed) {
      this.listed = listed;
      this.element.replaceChildren(...running.map((buff, i) => this.icon(buff.id, i, catalog!)));
      for (const id of [...this.blinks.keys()]) if (!running.some((b) => b.id === id)) this.blinks.delete(id);
    }
    running.forEach((buff, i) => {
      const icon = this.element.children[i] as HTMLElement;
      const skill = catalog!.skills.find((s) => s.id === buff.id)!;
      let alpha = ALPHA;
      if (buff.leftMs < BLINK_MS) {
        const state = this.blinks.get(buff.id) ?? { alpha: ALPHA, up: false };
        this.blinks.set(buff.id, state);
        alpha = blink(state);
      }
      icon.style.opacity = String(alpha / 255);
      const title = `${skill.name}\n${mmss(buff.leftMs)}\n${skill.description}`;
      if (icon.title !== title) icon.title = title;
      const time = icon.querySelector<HTMLElement>('.hud-party-buff-time')!;
      const seconds = String(Math.trunc(buff.leftMs / 1000));
      if (time.textContent !== seconds) time.textContent = seconds;
    });
  }

  dispose(): void {
    this.element.remove();
  }

  private icon(id: number, i: number, catalog: WebParty): HTMLElement {
    const skill = catalog.skills.find((s) => s.id === id)!;
    const icon = this.doc.createElement('div');
    icon.className = 'hud-party-buff';
    icon.dataset.skill = String(id);
    Object.assign(icon.style, { position: 'absolute', left: `${-PITCH * i}px`, top: '0px', width: `${ICON_PX}px`, height: `${ICON_PX}px` });
    const img = this.doc.createElement('img');
    img.alt = skill.name;
    img.src = skill.icon === null ? '' : this.art.url(skill.icon);
    Object.assign(img.style, { width: '100%', height: '100%' });
    const time = this.doc.createElement('span');
    time.className = 'hud-party-buff-time';
    icon.append(img, time);
    return icon;
  }
}

// The on-screen windows and texts of the world screen (spec §3.9), in one layer over the 3D view: the status window
// (top left), the target bar (top centre), the server messages and the caption. The world screen gives it, each frame, the
// own numbers and the target, and the events of the messages it applied; this says what each shows, as Neuz does:
//
//   CDPClient::OnDefinedText / 1  Source/Neuz/DPClient.cpp:4117-4239  a DEFINEDTEXT is a line of the messages
//   CMover::SetExperience         _Common/MoverParam.cpp:1716-1762     a level up: TID_GAME_LEVELUP when it is due
//                                                                     (:1729), the caption TID_GAME_LEVELUP_CAPTION
//                                                                     (:1731-1737), TID_GAME_PATTERNUP at a combo level
//                                                                     (:1741-1750), TID_EVE_LEVEL15 for a Vagrant reaching
//                                                                     15 (:1752-1758), TID_GAME_FLYLVLUP at 20 (:1759-1763)
//   CDPClient::OnSetExperience    DPClient.cpp:3394-3417               more skill points: the caption TID_GAME_SKILLPOINT_UP
//   CDPClient::OnMoverDeath       DPClient.cpp:2040-2049               the own death: TID_GAME_DEATH
//   T                             APP_STATUS1's key ([stats §5.1])     the status window
//
// The skill names a level up makes learnable (`PutLvUpSkillName_1`, MoverParam.cpp:160-192) need the skills catalog of
// milestone 2 and are not shown yet.

import type { ExpRow, WebMover } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { OwnEvent, OwnState } from '../OwnState';
import type { CombatEvent, Mover } from '../WorldState';
import type { UiArt } from './art';
import { Caption, MessageLines, formatDefinedText } from './messages';
import { StatusWindow } from './statusWindow';
import { TargetBar } from './targetBar';

/** `JOB_VAGRANT` (`Resource/defineJob.h`): the one job of `JTYPE_BASE`, which `IsJobType( JTYPE_BASE )` asks for. */
const JOB_VAGRANT = 0;
/** The level a Vagrant chooses a job at, and the level of the first flight (`SetExperience`, :1754 and :1759). */
const JOB_LEVEL = 15;
const FLY_LEVEL = 20;

/** The catalogs the windows read. */
export interface HudData {
  texts: Texts;
  exp: readonly ExpRow[];
  movers: ReadonlyMap<number, Pick<WebMover, 'hideLevel' | 'level'>>;
}

export class Hud {
  /** The layer: over the canvas, as big as the screen inside its safe areas; the windows are kept inside it. */
  readonly element: HTMLElement;
  readonly status: StatusWindow;
  readonly target: TargetBar;
  readonly messages: MessageLines;
  readonly caption: Caption;
  /** Whether there are own numbers to show: the status window and its key wait for them. */
  private hasOwn = false;
  /**
   * Whether the task bar carries a shortcut (`TaskBar.carrying`): T, APP_STATUS1's hotkey (`FuncApplet.cpp:179`), is read by
   * `CWndTaskBar::Process` only while none is (`WndTaskBar.cpp:2331-2338`). None, without a bar.
   */
  carrying?: () => boolean;

  constructor(
    private readonly doc: Document,
    art: UiArt,
    private readonly data: HudData,
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'world-hud';
    this.status = new StatusWindow(art, data, doc);
    this.target = new TargetBar(art, data.movers, doc);
    this.messages = new MessageLines(doc);
    this.caption = new Caption(doc);
    this.element.append(this.target.element, this.messages.element, this.caption.element, this.status.frame.element);
    this.view().addEventListener('keydown', this.onKeyDown);
  }

  /**
   * What the events of the messages applied since the last frame show, in their order: `combat` (the world's), `own`
   * (the own numbers', `ownState` being them after the messages).
   */
  play(combat: readonly CombatEvent[], own: readonly OwnEvent[], ownState: OwnState | undefined): void {
    for (const event of combat) {
      if (event.kind !== 'text') continue;
      const { text, color } = formatDefinedText(this.data.texts, event.textId, event.args);
      if (text !== '') this.messages.add(text, color);
    }
    for (let i = 0; i < own.length; i++) {
      const event = own[i]!;
      switch (event.kind) {
        case 'levelUp': {
          if (event.chatLine) this.line('TID_GAME_LEVELUP');
          this.show('TID_GAME_LEVELUP_CAPTION');
          // the pattern line comes before the job's (:1741-1758); OwnState gives it as the next event
          const next = own[i + 1];
          if (next?.kind === 'patternUp') {
            this.line('TID_GAME_PATTERNUP');
            i++;
          }
          if (ownState?.job === JOB_VAGRANT && event.to === JOB_LEVEL) this.line('TID_EVE_LEVEL15');
          if (event.from < FLY_LEVEL && event.to >= FLY_LEVEL) this.line('TID_GAME_FLYLVLUP');
          break;
        }
        case 'patternUp':
          this.line('TID_GAME_PATTERNUP');
          break;
        case 'skillPointUp':
          this.show('TID_GAME_SKILLPOINT_UP');
          break;
        case 'skillPointReset': // OnInitSkillPoint (DPClient.cpp:14725), unless it stopped early
          if (event.chatLine) this.line('TID_GAME_RECCURENCE');
          break;
        case 'died':
          this.line('TID_GAME_DEATH');
          break;
        default:
          break;
      }
    }
  }

  /**
   * One frame at `nowMs`: the status window with `own`'s numbers and `name` (hidden with no own numbers), the target bar
   * with `target` (`gameMaster`: the player is a game master), and the fades of the lines and the caption.
   */
  frame(nowMs: number, own: OwnState | undefined, name: string, target: Mover | null, gameMaster: boolean): void {
    this.hasOwn = own !== undefined;
    if (own === undefined) this.status.frame.element.hidden = true;
    else {
      if (this.status.frame.isOpen && this.status.frame.element.hidden) this.status.frame.element.hidden = false;
      this.status.update(own, name);
    }
    this.target.update(target, own?.level ?? 1, this.data.texts, gameMaster);
    this.messages.step(nowMs);
    this.caption.step(nowMs);
  }

  /** Takes the layer off and lets go of the keys. */
  dispose(): void {
    this.view().removeEventListener('keydown', this.onKeyDown);
    if (this.status.frame.isOpen) this.status.frame.close();
    this.element.remove();
  }

  /** A line of the messages: the text and colour of `id` (`PutString( prj.GetText( id ), NULL, prj.GetTextColor( id ) )`). */
  private line(id: string): void {
    const entry = this.data.texts.get(id);
    if (entry !== undefined && entry.text !== '') this.messages.add(entry.text, entry.color);
  }

  /** A caption: the text of `id` (`g_Caption1.AddCaption( prj.GetText( id ), ... )`). */
  private show(id: string): void {
    const entry = this.data.texts.get(id);
    if (entry !== undefined && entry.text !== '') this.caption.show(entry.text);
  }

  private view(): Window {
    return this.doc.defaultView ?? window;
  }

  /**
   * T toggles the status window, once a press; not with Ctrl, Alt or Meta, nor while typing in a field, nor while the task
   * bar carries a shortcut (`carrying`).
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyT' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as { tagName?: string } | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
    if (!this.hasOwn || this.carrying?.() === true) return;
    this.status.toggle();
  };
}

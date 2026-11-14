// 2026-11-15 (social): the couple's windows and rules, kept apart from the world screen (docs/2026-11-15-social-
// research.md §2). The world screen hands it the couple snapshots, opens its window (F, the Start menu) and puts its
// elements in the HUD.
//
//   CCoupleHelper::OnProposeResult   Neuz/couplehelper.cpp:44-66        a proposal: CWndCoupleMessage CM_RECEIVEPROPOSE,
//                                                                       "%s has proposed to you...", OK COUPLE, Cancel REFUSE
//   CWndCoupleMessage                _Interface/WndField.cpp:23081-23131 an OK/Cancel CWndMessageBox of its own
//                                                                       (`g_WndMng.m_pWndCoupleMessage`), one at a time
//   CWndCoupleTabInfo (Break Up)     WndField.cpp:23187-23222           CM_CANCELCOUPLE, TID_GAME_COUPLECANCEL, OK DECOUPLE

import { encodeCouple, encodeDecouple, encodeRefuse } from '@flyffweb/protocol';
import type { CoupleMessage } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { MessageBox } from '../hud/messageBox';
import { CoupleWindow } from '../hud/couple/coupleWindow';
import type { CouplePartner } from '../hud/couple/coupleWindow';
import { CoupleBook } from '../couple/coupleBook';
import type { PlayerData } from '../party/playerData';

export interface SocialHost {
  /** A packet to the world (`WorldSession.sendSocial`). */
  send(bytes: Uint8Array): void;
  ownPlayerId(): number;
  /** `CPlayerDataCenter::GetPlayerData( id )`: the entry, queried once when unknown. */
  playerData(playerId: number): Readonly<PlayerData>;
  jobName(job: number): string;
  itemProp(itemId: number): Pick<WebItemProp, 'name' | 'icon'> | undefined;
  /** `PutString( text, NULL, color )`: a line of the game's. */
  say(text: string, color: number): void;
}

export class SocialHud {
  readonly couple = new CoupleBook();
  readonly coupleWindow: CoupleWindow;
  /** `g_WndMng.m_pWndCoupleMessage`: the couple's own OK/Cancel box. */
  readonly coupleBox: MessageBox;

  constructor(art: UiArt, private readonly texts: Texts, private readonly host: SocialHost, doc: Document = document) {
    this.coupleBox = new MessageBox(art, doc);
    this.coupleBox.frame.element.classList.add('hud-couple-message');
    this.coupleWindow = new CoupleWindow(art, {
      text: (tid) => this.text(tid),
      jobName: (job) => host.jobName(job),
      couple: () => this.couple.couple,
      partner: () => this.partner(),
      item: (itemId) => host.itemProp(itemId),
      breakUp: (name) => this.coupleBox.open(formatText(this.text('TID_GAME_COUPLECANCEL') || 'Are you certain you would like to break up with %s?', [name]),
        'okCancel', () => host.send(encodeDecouple())),
    }, doc);
  }

  /** What goes in the HUD. */
  get elements(): HTMLElement[] {
    return [this.coupleWindow.frame.element, this.coupleBox.element];
  }

  get modals(): Array<MessageBox['modal']> {
    return [this.coupleBox.modal];
  }

  /** A couple snapshot (`CCoupleHelper::On*`). */
  onCouple(message: CoupleMessage): void {
    for (const event of this.couple.apply(message, this.host.ownPlayerId())) {
      switch (event.kind) {
        case 'query':
          this.host.playerData(event.playerId);
          break;
        case 'proposal':
          // a new box in place of the one open (SAFE_DELETE( m_pWndCoupleMessage )): its answer is not sent
          this.coupleBox.open(formatText(this.text('TID_GAME_RECEIVEPROPOSAL') || '%s has proposed to you. Would you like to make a couple?', [event.name]),
            'okCancel', () => this.host.send(encodeCouple()), () => this.host.send(encodeRefuse()));
          break;
        case 'line': {
          const entry = this.texts.get(event.tid);
          if (entry !== undefined && entry.text !== '') this.host.say(formatText(entry.text, event.args), entry.color);
          break;
        }
        case 'changed':
          this.coupleWindow.refresh();
          break;
      }
    }
  }

  /** Each drawn frame: the couple window as `OnDraw` draws it (the partner's data may come later). */
  frame(): void {
    this.coupleWindow.refresh();
  }

  /** A log-out: the couple forgotten, the windows shut. */
  reset(): void {
    this.couple.reset();
    if (this.coupleWindow.isOpen) this.coupleWindow.frame.close();
  }

  private partner(): CouplePartner | null {
    const id = this.couple.partnerOf(this.host.ownPlayerId());
    if (id === null) return null;
    const data = this.host.playerData(id);
    return { name: data.name, job: data.job, level: data.level };
  }

  private text(tid: string): string {
    return this.texts.get(tid)?.text ?? '';
  }
}

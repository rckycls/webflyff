// 2026-11-15 (social): the couple's and the duels' windows, kept apart from the world screen (docs/2026-11-15-social-
// research.md §2, §4). The world screen hands it the couple snapshots and the duel book's events, opens the couple window
// (F, the Start menu) and puts its elements in the HUD.
//
//   CCoupleHelper::OnProposeResult   Neuz/couplehelper.cpp:44-66        a proposal: CWndCoupleMessage CM_RECEIVEPROPOSE,
//                                                                       "%s has proposed to you...", OK COUPLE, Cancel REFUSE
//   CWndCoupleMessage                _Interface/WndField.cpp:23081-23131 an OK/Cancel CWndMessageBox of its own
//                                                                       (`g_WndMng.m_pWndCoupleMessage`), one at a time
//   CWndCoupleTabInfo (Break Up)     WndField.cpp:23187-23222           CM_CANCELCOUPLE, TID_GAME_COUPLECANCEL, OK DECOUPLE
//   CWndDuelConfirm / CWndDuelResult _Interface/WndDuelConfirm.cpp      the duel's question and its result (hud/duel)
//   CDPClient::OnDuelStart (3, 4)    Neuz/DPClient.cpp:4712-4740         the result closes the question first

import { encodeCouple, encodeDecouple, encodeDuelNo, encodeDuelRequest, encodeDuelYes, encodeRefuse } from '@flyffweb/protocol';
import type { CoupleMessage } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { formatText } from '../hud/format';
import { MessageBox } from '../hud/messageBox';
import { CoupleWindow } from '../hud/couple/coupleWindow';
import type { CouplePartner } from '../hud/couple/coupleWindow';
import { DuelConfirmWindow, DuelCount, DuelResultWindow } from '../hud/duel/duelWindows';
import { CoupleBook } from '../couple/coupleBook';
import type { DuelEvent, DuelFlag } from '../duel/duelBook';
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
  /** The duel's Yes closes what V15 closes first (WndDuelConfirm.cpp:99-312): the dialogue, a trade, the shops, the bank ... */
  beforeDuelYes(): void;
  /** `RenderFlag( type )`: the PvP flag over the mover (XI_GEN_PVP_FLAG01, x1.5), while `shown` holds. */
  flag(objectId: number, flag: DuelFlag): void;
  /** The result window's press: MTI_HIPKIDDING once (won) or MTI_HEAD held (lost), then PLAYERBEHAVIOR (:434-452). */
  resultMotion(win: boolean): void;
}

export class SocialHud {
  readonly couple = new CoupleBook();
  readonly coupleWindow: CoupleWindow;
  /** `g_WndMng.m_pWndCoupleMessage`: the couple's own OK/Cancel box. */
  readonly coupleBox: MessageBox;
  readonly duelConfirm: DuelConfirmWindow;
  readonly duelResult: DuelResultWindow;
  readonly duelCount: DuelCount;

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
    this.duelConfirm = new DuelConfirmWindow(art, doc);
    this.duelConfirm.onYes = (asker, party) => {
      if (!party) host.beforeDuelYes();
      host.send(encodeDuelYes(asker, host.ownPlayerId(), party));
    };
    this.duelConfirm.onNo = (asker, party) => host.send(encodeDuelNo(asker, party));
    this.duelResult = new DuelResultWindow(art, doc);
    this.duelResult.onClosed = (win) => host.resultMotion(win);
    this.duelCount = new DuelCount(art, doc);
  }

  /** What goes in the HUD. */
  get elements(): HTMLElement[] {
    return [this.coupleWindow.frame.element, this.coupleBox.element, this.duelConfirm.window.element, this.duelResult.window.element,
      this.duelCount.element];
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
        case 'line':
          this.line(event.tid, event.args);
          break;
        case 'changed':
          this.coupleWindow.refresh();
          break;
      }
    }
  }

  /** What the duel book's snapshots ask (duel/duelBook.ts). */
  onDuel(events: readonly DuelEvent[], now: number): void {
    for (const event of events) {
      switch (event.kind) {
        case 'confirm': {
          const tid = event.party ? 'TID_DIAG_0067' : 'TID_DIAG_0066';
          const fallback = event.party ? '%s challenges your party to a duel. Do you accept?' : '%s challenges you to a duel. Do you accept?';
          this.duelConfirm.open(formatText(this.text(tid) || fallback, [event.name]), event.askerPlayerId, event.askerId, event.party);
          break;
        }
        case 'result': {
          this.duelConfirm.dismiss();
          const tid = event.win ? 'TID_DIAG_DUELRESULT_WIN' : 'TID_DIAG_DUELRESULT_LOSE';
          this.duelResult.open(formatText(this.text(tid) || (event.win ? '%s loses the Duel!' : '%s wins the Duel!'), [event.name]), event.win);
          break;
        }
        case 'line':
          this.line(event.tid, event.args);
          break;
        case 'flag':
          this.host.flag(event.objectId, event.flag);
          break;
        case 'count':
          this.duelCount.show(event.count, now);
          break;
      }
    }
  }

  /** The menu's "Duel - 1 vs 1" or "Duel - Party vs Party" (`SendDuelRequest` / `SendDuelPartyRequest`, WndWorld.cpp:5657-5672). */
  requestDuel(targetPlayerId: number, party: boolean): void {
    this.host.send(encodeDuelRequest(this.host.ownPlayerId(), targetPlayerId, party));
  }

  /** The own death: the question goes (`SAFE_DELETE( m_pWndDuelConfirm )`, DPClient.cpp:1939). */
  ownDied(): void {
    this.duelConfirm.dismiss();
  }

  /** Each drawn frame: the couple window as `OnDraw` draws it, and the duel's count. */
  frame(now: number = performance.now()): void {
    this.coupleWindow.refresh();
    this.duelCount.frame(now);
  }

  /** A log-out: the couple forgotten, the windows shut. */
  reset(): void {
    this.couple.reset();
    if (this.coupleWindow.isOpen) this.coupleWindow.frame.close();
    this.duelConfirm.dismiss();
  }

  private line(tid: string, args: ReadonlyArray<string | number>): void {
    const entry = this.texts.get(tid);
    if (entry !== undefined && entry.text !== '') this.host.say(formatText(entry.text, args), entry.color);
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

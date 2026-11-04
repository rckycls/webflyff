// The Scroll of Return's flow (Piece 7 M3, [R §5]): its use opens the question box; OK there opens the village window;
// OK there sends RETURNSCROLL with the village; the server's RETURNSCORLL brings the use again, with no box; and a
// double-click on the scroll's buff icon sends RETURNSCROLL -1, the way back.
//
//   Function                          File:lines                            what
//   CDPClient::SendDoUseItem          Neuz/DPClient.cpp:10416-10431         a box already open: nothing; else m_dwReturnScroll
//                                                                            and the box
//   CReturnScrollMsgBox               _Interface/WndSelectVillage.cpp:17-45 OK: the village window; Cancel: closed
//   CWndSelectVillage::OnChildNotify  WndSelectVillage.cpp:112-132          SendReturnScroll( village )
//   CDPClient::OnReturnScrollACK      DPClient.cpp:677, :15784-15787        SendDoUseItem( m_dwReturnScroll, NULL_ID, -1, FALSE )
//   CWndWorld::OnLButtonDblClk        _Interface/WndWorld.cpp:7265-7266     the buff icon: SendReturnScroll( -1 )

import type { MessageBox } from '../hud/messageBox';
import type { SelectVillageWindow } from '../hud/selectVillageWindow';

/** TID_GAME_RETURN_USEITEM's English ([R §7]), for a catalog without it. */
const QUESTION = 'The item loses its potency 4 hours after being equipped if not returned to the inventory . Do you want to use the item?';

export class ReturnScroll {
  /** `m_dwReturnScroll`: the scroll's inventory object, kept for the answer (Neuz never clears it). */
  private stored: number | null = null;

  constructor(
    private readonly box: MessageBox,
    private readonly villages: SelectVillageWindow,
    private readonly send: { sendReturnScroll(select: number): void },
    private readonly texts: ReadonlyMap<string, { text: string }>,
  ) {}

  /** The use of the scroll at `objectId` from the bag or the task bar: the question box, unless a box is open. */
  begin(objectId: number): void {
    if (this.box.isOpen || this.villages.isOpen) return; // g_WndMng.m_pWndMessageBox (:10421)
    this.stored = objectId;
    const text = this.texts.get('TID_GAME_RETURN_USEITEM')?.text || QUESTION;
    this.box.open(text, 'okCancel', () => this.villages.open((select) => this.send.sendReturnScroll(select)));
  }

  /** On RETURNSCORLL: the scroll to use again, with no box (`bResult` FALSE), or null when none was asked for. */
  answered(): number | null {
    return this.stored;
  }

  /** A double-click on the scroll's buff icon: back to the place it was used at. */
  goBack(): void {
    this.send.sendReturnScroll(-1);
  }
}

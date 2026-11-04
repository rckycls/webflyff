// The party window's boxes (Piece 7 M4, [R §6.1], [R §6.4]), all in `_Interface/WndPartyChangeTroup.cpp`:
//
//   APP_PARTYLEAVE_CONFIRM  resdata.inc:2111-2149   "WndTile08.tga" tiled 288 x 128 "Confirm Leaving Party.": WIDC_EDIT1
//                                                   10,10-266,62 (disabled: the question, TID_DIAG_0084 to leave, 0085 to
//                                                   kick, :285-301), WIDC_YES 52,70-124,90, WIDC_NO 136,70-208,90; Yes:
//                                                   REMOVEPARTYMEMBER (:347-360)
//   APP_CHANGETROUP         resdata.inc:26007-26045 "WndTile03.tga" tiled 272 x 128 "Change Party": WIDC_STATIC1 36,16-232,36
//                                                   "Convert to an Advanced Party?", WIDC_OK 52,56-124,76, WIDC_CANCEL
//                                                   144,56-216,76; OK opens the name box (:249-267)
//   APP_PARTYCHANGENAME     resdata.inc:25950-26006 "WndTile03.tga" tiled 272 x 160 "Change Party Name": WIDC_STATIC1
//                                                   24,16-236,36 "Enter Party Name", WIDC_STATIC2 12,52-72,72 "Name:",
//                                                   WIDC_EDIT1 76,52-236,72, WIDC_OK 52,88-124,108, WIDC_CANCEL
//                                                   144,88-216,108; the edit filled with the saved name or "Advance Party"
//                                                   (:40-52); OK checks the name (`troupNameCheck`): a refusal's box keeps it
//                                                   open, a good name is sent (CHANGETROUP) and closes it (:84-182)
//
// Neuz opens the two troup boxes at the right edge, y 110, then centres them on their parent: here they are centred on
// the screen.

import type { Texts } from '../../gameData';
import type { UiArt } from '../art';
import { pictureButton, place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { EDIT, editTiles } from '../tiles';

/** OK, Cancel, Yes and No: 288 x 20 pictures of four 72 px states. */
const QUARTER = 72;

type NameCheck = (name: string) => { send: string } | { box: string } | { stay: true };

export class PartyBoxes {
  /** Yes on the leave box: the member to remove. */
  onLeaveYes: (leaveId: number) => void = () => {};
  /** OK on the name box with a name the rules pass. */
  onName: (name: string) => void = () => {};
  /** A refusal's message box (TID). */
  onBox: (tid: string) => void = () => {};
  private readonly leaveFrame: WindowFrame;
  private readonly troupFrame: WindowFrame;
  private readonly nameFrame: WindowFrame;
  private readonly question: HTMLElement;
  private readonly edit: HTMLInputElement;
  private leaveId: number | null = null;
  private prefill = '';

  constructor(art: UiArt, private readonly texts: Texts, private readonly check: NameCheck, private readonly doc: Document = document) {
    const button = (name: string, label: string, picture: string, rect: ControlRect, press: () => void): HTMLButtonElement => {
      const element = pictureButton(doc, art, picture, rect, QUARTER, press);
      element.dataset.button = name;
      element.setAttribute('aria-label', label);
      return element;
    };
    const text = (cls: string, value: string, rect: ControlRect): HTMLElement => {
      const element = doc.createElement('div');
      element.className = cls;
      element.textContent = value;
      place(element, rect);
      return element;
    };

    this.leaveFrame = new WindowFrame('Confirm Leaving Party.', art, { width: 288, height: 128 }, doc);
    this.leaveFrame.element.classList.add('hud-party-leave');
    this.leaveFrame.onClose = () => { this.leaveId = null; };
    this.question = text('hud-party-box-text', '', { left: 10, top: 10, width: 256, height: 52 });
    this.leaveFrame.body.append(
      this.question,
      button('yes', 'Yes', 'ButtYes.tga', { left: 52, top: 70, width: 72, height: 20 }, () => {
        const id = this.leaveId;
        this.leaveFrame.close();
        if (id !== null) this.onLeaveYes(id);
      }),
      button('no', 'No', 'ButtNo.tga', { left: 136, top: 70, width: 72, height: 20 }, () => this.leaveFrame.close()),
    );

    this.troupFrame = new WindowFrame('Change Party', art, { width: 272, height: 128 }, doc);
    this.troupFrame.element.classList.add('hud-party-troup');
    this.troupFrame.body.append(
      text('hud-party-box-text', 'Convert to an Advanced Party?', { left: 36, top: 16, width: 196, height: 20 }),
      button('ok', 'OK', 'ButtOk.tga', { left: 52, top: 56, width: 72, height: 20 }, () => {
        this.troupFrame.close();
        this.changeName(this.prefill);
      }),
      button('cancel', 'Cancel', 'ButtCancel.tga', { left: 144, top: 56, width: 72, height: 20 }, () => this.troupFrame.close()),
    );

    this.nameFrame = new WindowFrame('Change Party Name', art, { width: 272, height: 160 }, doc);
    this.nameFrame.element.classList.add('hud-party-name');
    const editBox = doc.createElement('div');
    editBox.className = 'hud-party-name-edit';
    const editRect = { left: 76, top: 52, width: 160, height: 20 };
    place(editBox, editRect);
    editBox.append(editTiles(doc, art, Math.trunc(editRect.width / EDIT), Math.ceil(editRect.height / EDIT)));
    this.edit = doc.createElement('input');
    this.edit.type = 'text';
    this.edit.setAttribute('aria-label', 'Name:');
    editBox.append(this.edit);
    this.nameFrame.body.append(
      text('hud-party-box-text', 'Enter Party Name', { left: 24, top: 16, width: 212, height: 20 }),
      text('hud-party-box-text', 'Name:', { left: 12, top: 52, width: 60, height: 20 }),
      editBox,
      button('ok', 'OK', 'ButtOk.tga', { left: 52, top: 88, width: 72, height: 20 }, () => this.submitName()),
      button('cancel', 'Cancel', 'ButtCancel.tga', { left: 144, top: 88, width: 72, height: 20 }, () => this.nameFrame.close()),
    );
  }

  /** The three boxes' elements, for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.leaveFrame.element, this.troupFrame.element, this.nameFrame.element];
  }

  /** Every box closed (the world is gone). */
  close(): void {
    for (const frame of [this.leaveFrame, this.troupFrame, this.nameFrame]) if (frame.isOpen) frame.close();
  }

  get leaveOpen(): boolean {
    return this.leaveFrame.isOpen;
  }

  get nameOpen(): boolean {
    return this.nameFrame.isOpen;
  }

  /** The leave box, once at a time (`WndParty.cpp:322-326`): `kick` asks TID_DIAG_0085, else TID_DIAG_0084. */
  leave(leaveId: number, kick: boolean): void {
    if (this.leaveFrame.isOpen) return;
    this.leaveId = leaveId;
    this.question.textContent = this.text(kick ? 'TID_DIAG_0085' : 'TID_DIAG_0084', 'Are you going to leave the party?');
    this.leaveFrame.open('center');
  }

  /** The convert box; its OK opens the name box with `prefill` (the saved name, or '' for "Advance Party"). */
  changeTroup(prefill: string): void {
    this.prefill = prefill;
    this.troupFrame.open('center');
  }

  /** The name box (also the server's: a taken name, or the leader's name asked again). */
  changeName(prefill: string): void {
    this.edit.value = prefill !== '' ? prefill : this.text('TID_GAME_PARTY_NAME', 'Advance Party');
    this.nameFrame.open('center');
  }

  private submitName(): void {
    const result = this.check(this.edit.value);
    if ('box' in result) {
      this.onBox(result.box);
    } else if ('send' in result) {
      this.nameFrame.close();
      this.onName(result.send);
    }
  }

  private text(id: string, english: string): string {
    return this.texts.get(id)?.text ?? english;
  }
}

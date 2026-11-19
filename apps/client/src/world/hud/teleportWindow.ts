// custom (owner 2026-11-19, "create the teleporter window ... for v15 theme and make it responsive for mobile as well";
// docs/superpowers/specs/2026-11-19-teleport-window-design.md): the Teleport window, from the Start menu's Extras folder.
// It is no window of Neuz's (V15's own teleporter is the guild-house NPC's map, hud/teleporterWindow.ts).
//
//   the list      the 14 places (hud/teleportPlaces.ts) in a V15 list box, the chosen one under the Forsaken Tower's red
//                 bar; the VIP places carry the VIP star, and a regular player sees them greyed
//   the right     the place's name over its V15 region map (4:3) with a mark on the landing point, and a line about it
//   Apply         a VIP place for a regular player: "Only VIP players can teleport there."; under 10,000 Penya: V15's
//                 TID_GAME_LACKMONEY; else the place's number goes to the World (TELEPORT_WINDOW 0x8fff0120), which checks
//                 everything again, and the window closes
//
// The phone: the same two columns in a compact panel over the open bag (style.css, `.hud-teleport`).

import type { UiArt } from './art';
import { themeUrl } from './art';
import { ResWindow } from './resWindow';
import type { ResLayout } from './resWindow';
import { TELEPORT_COST, TELEPORT_PLACES, canTeleportTo, placeMarker } from './teleportPlaces';

/** The edit tiles of the list and the text, and the group box of the name (as the Pet Filter's). */
const EDIT = 'WndEditTile00.tga';
const GROUP = 'WndEditTile200.tga';
/** The VIP star (FlyffWeb's own picture, render/nameTags.ts `vipKey`). */
const VIP_STAR = 'ui/vipstar1.png';
export const VIP_ONLY = 'Only VIP players can teleport there.';

/** The window: the list on the left, the name, the map and the line on the right, the price and Apply under the list. */
export const TELEPORT_LAYOUT: ResLayout = {
  title: 'Teleport',
  width: 448,
  height: 336,
  controls: [
    { kind: 'list', id: 'WIDC_LISTBOX1', rect: [8, 8, 150, 240], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [158, 8, 426, 24], group: GROUP },
    // 268 x 201: the region maps' 4:3
    { kind: 'custom', id: 'WIDC_CUSTOM1', rect: [158, 28, 426, 229] },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [158, 234, 426, 290], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [8, 246, 150, 262] },
    // ButtCharApply.tga is 200 x 20, four states of 50
    { kind: 'button', id: 'WIDC_APPLY', rect: [54, 268, 104, 288], picture: 'ButtCharApply.tga', label: 'Apply', quarter: 50 },
  ],
};

/** What the window asks of the world screen. */
export interface TeleportHost {
  /** The own player's authorization letter (`m_dwAuthorization`, ADD_OBJ's char code). */
  authorization(): number;
  /** The own penya. */
  gold(): number;
  /** One of the window's own lines in the chat. */
  say(text: string): void;
  /** A line of the catalog in the chat. */
  sayTid(tid: string): void;
  /** TELEPORT_WINDOW: the place's number. */
  send(place: number): void;
}

export class TeleportWindow {
  readonly window: ResWindow;
  private chosen = 0;
  private readonly rows: HTMLElement[] = [];
  private readonly marker: HTMLElement;
  /**
   * Whether a press went down on the window since it opened: on a phone the tap that opened it would otherwise click the
   * row now under the finger (as the Forsaken Tower's window).
   */
  private pressed = false;

  constructor(private readonly host: TeleportHost, private readonly art: UiArt, doc: Document = document) {
    const window = new ResWindow(TELEPORT_LAYOUT, art, doc);
    window.frame.element.classList.add('hud-teleport');
    // above the phone's open bag, as the other windows a Start menu line opens
    window.frame.overBag = true;
    window.frame.element.addEventListener('pointerdown', () => { this.pressed = true; }, true);
    window.control('WIDC_STATIC1').classList.add('is-centred');
    window.setText('WIDC_STATIC2', `${TELEPORT_COST.toLocaleString('en-US')} Penya`);
    window.control('WIDC_STATIC2').classList.add('is-centred');
    const list = window.control('WIDC_LISTBOX1');
    TELEPORT_PLACES.forEach((place, index) => {
      const row = doc.createElement('div');
      row.setAttribute('role', 'option');
      row.dataset.place = String(index);
      const name = doc.createElement('span');
      name.className = 'teleport-name';
      name.textContent = place.name;
      row.append(name);
      if (place.vip) {
        row.toggleAttribute('data-vip', true);
        const star = doc.createElement('span');
        star.className = 'teleport-vip';
        star.title = 'VIP';
        star.style.backgroundImage = `url(${JSON.stringify(art.url(VIP_STAR))})`;
        row.append(star);
      }
      row.addEventListener('click', () => {
        if (!this.pressed) return;
        this.choose(index);
      });
      this.rows.push(row);
      list.append(row);
    });
    const picture = window.control('WIDC_CUSTOM1');
    picture.classList.add('teleport-map');
    this.marker = doc.createElement('span');
    this.marker.className = 'teleport-marker';
    picture.append(this.marker);
    const apply = window.button('WIDC_APPLY');
    apply.title = 'Teleport to the chosen place.';
    // the phone's silver button's word (style.css)
    apply.dataset.word = 'Apply';
    apply.addEventListener('click', () => this.apply());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.window.element;
  }

  /** Centred, on the place picked last (Flaris the first time), the VIP places locked or not for this player. */
  open(): void {
    this.pressed = false;
    this.choose(this.chosen);
    this.window.open();
  }

  /** The Start menu line: open it, or close it when it is open. */
  toggle(): void {
    if (this.window.isOpen) this.window.close();
    else this.open();
  }

  close(): void {
    this.window.close();
  }

  dispose(): void {
    this.window.dispose();
  }

  private choose(index: number): void {
    this.chosen = index;
    const place = TELEPORT_PLACES[index]!;
    const authorization = this.host.authorization();
    this.rows.forEach((row, i) => {
      row.toggleAttribute('data-chosen', i === index);
      row.setAttribute('aria-selected', String(i === index));
      row.toggleAttribute('data-locked', !canTeleportTo(TELEPORT_PLACES[i]!, authorization));
    });
    this.window.setText('WIDC_STATIC1', place.name);
    const picture = this.window.control('WIDC_CUSTOM1');
    picture.style.backgroundImage = themeUrl(this.art, place.map);
    picture.setAttribute('aria-label', `${place.name} on the map`);
    const { left, top } = placeMarker(place);
    this.marker.style.left = `${left}%`;
    this.marker.style.top = `${top}%`;
    const locked = !canTeleportTo(place, authorization);
    this.window.setText('WIDC_TEXT1', locked ? `${place.about} VIP only.` : place.about);
  }

  private apply(): void {
    const place = TELEPORT_PLACES[this.chosen]!;
    if (!canTeleportTo(place, this.host.authorization())) {
      this.host.say(VIP_ONLY);
      return;
    }
    if (this.host.gold() < TELEPORT_COST) {
      this.host.sayTid('TID_GAME_LACKMONEY');
      return;
    }
    this.host.send(this.chosen);
    this.window.close();
  }
}

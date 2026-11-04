// The world map (Piece 6 M1): CWorldMap's ordinary V15 branch (Source/Neuz/WorldMap.cpp, `__IMPROVE15_WORLDMAP` off), the
// full-screen picture of the continent the player stands in, with its nine picture buttons (the World, the seven
// continents and the monster switch), the player's arrow and name, and the monster icons with their tooltips. It sends
// nothing. Browser adaptations (the plan's rulings): it fills the world view as Neuz fills the screen, keeping 4:3; it
// has a close button; while it is open it holds every key (M and Escape close it) and keeps every press from the world.
// Piece 7 M1 adds the quest destination (CWorldMap's destination mode): ButtDestination.bmp at a Madrigal spot. Neuz
// forgets it when the map closes; here it lasts until cleared, since the 3-D arrow that would keep pointing is not drawn.
// Piece 7 M4 adds the party (RenderWorldMap, WorldMap.cpp:806-821): after the own arrow, each member not oneself and not
// offline, ImgMapArrowParty.bmp turned by its position (`partyArrowAngle`) and its name in 0xffffff7f.

import type { MapMonsterRow, WebWorldMap, WebWorldMapEntry } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import type { GameData } from '../gameData';
import {
  MAP_NONE, arrowMatrix, buttonFrame, buttonRect, cameraYaw, mapNumber, mapPoint, monsterTip, partyArrowAngle,
} from '../worldMapRules';
import type { UiArt } from './art';
import { cssRgb, themeUrl } from './art';
import { holdKey } from './modal';

/** What the map draws the player from: the world, the own mover's and the camera's D3D positions, the own name. */
export interface MapView {
  worldId: number;
  pos: Vec3;
  camera: Vec3;
  name: string;
}

/** The picture's own size, the frame the monster icons are authored in (WorldMap.cpp:1626-1639). */
const PICTURE = { w: 1280, h: 960 };
/** `TexMapButton.bmp`'s size (684x788, texMapButton.inc). */
const BUTTON_SHEET = { w: 684, h: 788 };
/** The monster switch, the ninth button (`m_bShowMonsterInfo`, WorldMap.cpp:1226-1230). */
const MONSTER_BUTTON = 8;
/** A monster icon's hit box, unscaled screen pixels (`m_rectPos`, :1640-1641). */
const ICON_BOX = 40;
/** On a touch screen, how near an icon's centre a tap must be (the plan's Ruling 7). */
const TOUCH_PICK = 22;
/** `RenderWorldMap`'s fill (WorldMap.cpp:790-798): this colour in a 4:3 mode, black in a wide one. */
const FILL_4_3 = '#3b3d2f';
/** The arrow picture (`ImgMapArrow.bmp`, 37x35) and the billboard's centre (`ptCenter`, billboard.cpp:65-140). */
const ARROW = { w: 37, h: 35, cx: 18, cy: 17 };
/** The own name's colour (`RenderPlayer`, WorldMap.cpp:742-784). */
const OWN_NAME = 0xff7fff7f;
/** A party member's name (`RenderPlayer`, :781-782) and arrow (`ImgMapArrowParty.bmp`, 37x35, the theme's). */
const PARTY_NAME = 0xffffff7f;
const PARTY_ARROW = 'ImgMapArrowParty.bmp';

/** A party member's mark: where it stands and its name. */
export interface PartyMark {
  pos: Vec3;
  name: string;
}
/** The tooltip's text width (`PutToolTip`'s wrap, tooltip.cpp:204). */
const TIP_WIDTH = 200;
/** The element icons (`Icon/Icon_MonElemantkind.inc`, 5 frames of 16x16, frame `eElementType - 1`, tooltip.cpp:686). */
const ELEMENT_ICONS = 'ui/icon_monelemantkind.png';

const PRESSES = ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click',
  'dblclick', 'contextmenu', 'wheel'] as const;

export class WorldMap {
  /** The overlay: over the whole HUD layer, hidden while closed. */
  readonly element: HTMLElement;
  private readonly area: HTMLElement;
  private readonly picture: HTMLElement;
  private readonly buttons: HTMLElement[] = [];
  private readonly icons: HTMLElement;
  private readonly mark: HTMLElement;
  private readonly arrowAt: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly name: HTMLElement;
  /** The party's marks, after the own arrow; one a member, made as needed. */
  private readonly partyLayer: HTMLElement;
  private readonly partyMarks: Array<{ at: HTMLElement; arrow: HTMLElement; name: HTMLElement }> = [];
  private lastParty: readonly PartyMark[] = [];
  private readonly tip: HTMLElement;
  private readonly tipText: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly view: Window;

  /** The map shown, 0-7 (`m_nMap`). */
  private shown = 0;
  private hoveredButton: number | null = null;
  private hoveredIcon: number | null = null;
  private showMonsters = false;
  private size = { w: PICTURE.w, h: PICTURE.h };
  /** The safe area's size at the last `layout`, to fit again when it changes while open. */
  private laidOut = { w: -1, h: -1 };
  private last: MapView | null = null;
  private listening = false;
  /** The quest destination, a Madrigal x, z (`m_vDestinationArrow`), until cleared. */
  private destination: { x: number; z: number } | null = null;

  constructor(
    private readonly art: UiArt,
    private readonly data: WebWorldMap | null,
    private readonly game: Pick<GameData, 'movers' | 'itemProps' | 'texts'>,
    private readonly say: (id: string) => void,
    doc: Document,
  ) {
    this.view = doc.defaultView ?? window;
    this.element = doc.createElement('div');
    this.element.className = 'hud-worldmap';
    this.element.hidden = true;
    for (const type of PRESSES) {
      this.element.addEventListener(type, (event) => {
        event.stopPropagation();
        // the world's own guards, which the stop keeps from running: no browser menu (WorldScreen.onContextMenu), no
        // page zoom from a pinch (browserGestures.ts)
        if (type === 'contextmenu') event.preventDefault();
        if (type === 'wheel' && ((event as WheelEvent).ctrlKey || (event as WheelEvent).metaKey)) event.preventDefault();
      }, { passive: false });
    }

    this.area = doc.createElement('div');
    this.area.className = 'hud-worldmap-area';
    this.picture = doc.createElement('div');
    this.picture.className = 'hud-worldmap-picture';
    this.picture.addEventListener('pointerup', (event) => this.onTap(event as PointerEvent));
    this.icons = doc.createElement('div');
    this.icons.className = 'hud-worldmap-icons';
    this.mark = doc.createElement('div');
    this.mark.className = 'hud-worldmap-destination';
    this.mark.hidden = true;
    this.mark.style.backgroundImage = themeUrl(art, 'ButtDestination.bmp');

    for (let i = 0; i <= MONSTER_BUTTON; i++) {
      const button = doc.createElement('div');
      button.className = 'hud-worldmap-button';
      button.dataset.mapButton = String(i);
      button.setAttribute('role', 'button');
      button.addEventListener('pointerenter', () => this.hoverButton(i));
      button.addEventListener('pointerleave', () => this.hoverButton(null));
      button.addEventListener('pointerdown', () => this.pressButton(i));
      this.buttons.push(button);
    }

    this.arrowAt = doc.createElement('div');
    this.arrowAt.className = 'hud-worldmap-arrow';
    this.arrow = doc.createElement('div');
    this.arrow.className = 'hud-worldmap-arrow-picture';
    this.name = doc.createElement('div');
    this.name.className = 'hud-worldmap-name';
    this.name.style.color = cssRgb(OWN_NAME);
    this.arrowAt.append(this.arrow, this.name);
    this.partyLayer = doc.createElement('div');
    this.partyLayer.className = 'hud-worldmap-party-layer';

    this.tip = doc.createElement('div');
    this.tip.className = 'hud-worldmap-tip';
    this.tip.hidden = true;
    this.tipText = doc.createElement('div');
    this.tipText.className = 'hud-worldmap-tip-text';
    this.tipText.style.maxWidth = `${TIP_WIDTH}px`;
    if (data !== null) {
      data.tooltipTiles.forEach((key, i) => {
        const piece = doc.createElement('div');
        piece.className = `hud-worldmap-tip-tile hud-worldmap-tip-tile-${i}`;
        piece.style.backgroundImage = `url(${JSON.stringify(art.url(key))})`;
        this.tip.append(piece);
      });
    }
    this.tip.append(this.tipText);

    this.closeButton = doc.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'hud-worldmap-close';
    this.closeButton.dataset.worldmapClose = '';
    this.closeButton.setAttribute('aria-label', 'Close the world map');
    const cross = doc.createElement('span');
    cross.style.backgroundImage = themeUrl(art, 'ButtWndExit.tga');
    this.closeButton.append(cross);
    this.closeButton.addEventListener('click', () => this.close());

    this.picture.append(this.icons, this.mark, ...this.buttons, this.arrowAt, this.partyLayer, this.tip, this.closeButton);
    this.area.append(this.picture);
    this.element.append(this.area);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** The monster switch (`m_bShowMonsterInfo`): it lasts the page, which the world screen keeps across world changes. */
  get monsterInfo(): boolean {
    return this.showMonsters;
  }

  set monsterInfo(on: boolean) {
    this.showMonsters = on;
    if (this.isOpen) this.drawIcons();
  }

  /**
   * M and the Start menu's World Map (`CWndMap::Initialize`, WndMap.cpp:43-50): closes the map when it is open; else
   * `LoadWorldMap` (WorldMap.cpp:922-999) opens it on the map of the continent the player stands in, or says
   * `TID_GAME_MAPMSG` where there is none. Without its catalog it does nothing (the loader said why).
   */
  toggle(view: MapView): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    if (this.data === null) return;
    const map = mapNumber(view.worldId, { x: view.pos[0], z: view.pos[2] }, this.data);
    if (map === MAP_NONE) {
      this.say('TID_GAME_MAPMSG');
      return;
    }
    this.open(map, view);
  }

  /**
   * A quest row's destination (`ProcessQuestDestinationWorldMap`, WndQuest.cpp:2503-2528, with CWorldMap's destination
   * mode): the map, if closed, opens on the World (`nMap = CONT_NODATA`, WorldMap.cpp:959-962) wherever the player
   * stands, with ButtDestination.bmp at the spot.
   */
  showDestination(view: MapView, at: { x: number; z: number }): void {
    this.destination = { x: at.x, z: at.z };
    if (this.data === null) return;
    if (this.isOpen) this.drawMark();
    else this.open(0, view);
  }

  clearDestination(): void {
    this.destination = null;
    this.mark.hidden = true;
  }

  private open(map: number, view: MapView): void {
    this.shown = map;
    this.hoveredButton = null;
    this.element.hidden = false;
    (this.element.ownerDocument.activeElement as HTMLElement | null)?.blur?.();
    this.listen(true);
    this.layout();
    this.drawPicture();
    this.update(view);
  }

  /** `DeleteWorldMap` (WorldMap.cpp:1003-1012). */
  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    this.tip.hidden = true;
    this.hoveredIcon = null;
    this.listen(false);
  }

  /**
   * A frame: the arrow and the name where the player stands, turned by the camera (`RenderPlayer`, :542-613), then the
   * party's marks (`RenderWorldMap`, :806-821).
   */
  update(view: MapView, party: readonly PartyMark[] = this.lastParty): void {
    this.last = view;
    this.lastParty = party;
    if (!this.isOpen || this.data === null) return;
    if (this.area.clientWidth !== this.laidOut.w || this.area.clientHeight !== this.laidOut.h) {
      // a resize, a rotation or a phone's toolbar while open: fit again, and draw at the new size
      this.layout();
      this.drawPicture();
      return;
    }
    const { w, h } = this.size;
    const on = mapNumber(view.worldId, { x: view.pos[0], z: view.pos[2] }, this.data);
    this.arrowAt.hidden = this.shown !== 0 && this.shown !== on;
    this.drawParty(view, party);
    if (this.arrowAt.hidden) return;
    const at = mapPoint(this.entry().bounds, { x: view.pos[0], z: view.pos[2] }, { left: 0, top: 0, width: w, height: h });
    this.arrowAt.style.left = `${at.x}px`;
    this.arrowAt.style.top = `${at.y}px`;
    const [a, b, c, d] = arrowMatrix(cameraYaw(view.camera, view.pos), w, h);
    this.arrow.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
    this.name.textContent = view.name;
  }

  /** Each member's arrow and name; a member off the map shown is skipped, as `RenderPlayer` returns (:542-543). */
  private drawParty(view: MapView, party: readonly PartyMark[]): void {
    const { w, h } = this.size;
    const doc = this.element.ownerDocument;
    while (this.partyMarks.length < party.length) {
      const at = doc.createElement('div');
      at.className = 'hud-worldmap-arrow hud-worldmap-party';
      const arrow = doc.createElement('div');
      arrow.className = 'hud-worldmap-arrow-picture';
      arrow.style.backgroundImage = themeUrl(this.art, PARTY_ARROW);
      const name = doc.createElement('div');
      name.className = 'hud-worldmap-name';
      name.style.color = cssRgb(PARTY_NAME);
      at.append(arrow, name);
      this.partyLayer.append(at);
      this.partyMarks.push({ at, arrow, name });
    }
    this.partyMarks.forEach((mark, i) => {
      const member = party[i];
      const on = member === undefined ? MAP_NONE : mapNumber(view.worldId, { x: member.pos[0], z: member.pos[2] }, this.data!);
      mark.at.hidden = member === undefined || (this.shown !== 0 && this.shown !== on);
      if (member === undefined || mark.at.hidden) return;
      const at = mapPoint(this.entry().bounds, { x: member.pos[0], z: member.pos[2] }, { left: 0, top: 0, width: w, height: h });
      mark.at.style.left = `${at.x}px`;
      mark.at.style.top = `${at.y}px`;
      const [a, b, c, d] = arrowMatrix(partyArrowAngle(member.pos), w, h);
      mark.arrow.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
      if (mark.name.textContent !== member.name) mark.name.textContent = member.name;
    });
  }

  dispose(): void {
    this.listen(false);
    this.element.remove();
  }

  private entry(): WebWorldMapEntry {
    return this.data!.maps[this.shown]!;
  }

  /** The 4:3 picture as large as the safe area holds it, centred, and the fill around it (WorldMap.cpp:229-325, :790-798). */
  private layout(): void {
    const aw = this.area.clientWidth;
    const ah = this.area.clientHeight;
    this.laidOut = { w: aw, h: ah };
    if (aw > 0 && ah > 0) {
      const h = Math.min(ah, Math.floor((aw * 3) / 4));
      this.size = { w: Math.floor((h * 4) / 3), h };
    }
    const { w, h } = this.size;
    Object.assign(this.picture.style, {
      width: `${w}px`, height: `${h}px`,
      left: `${Math.max(0, Math.floor((aw - w) / 2))}px`, top: `${Math.max(0, Math.floor((ah - h) / 2))}px`,
    });
    const fourByThree = aw === 0 || ah === 0 || Math.abs(aw / ah - 4 / 3) <= (4 / 3) * 0.01;
    this.element.style.backgroundColor = fourByThree ? FILL_4_3 : '#000000';
    const sheet = `url(${JSON.stringify(this.art.url(this.data!.buttons.sheet))})`;
    this.buttons.forEach((button, i) => {
      const r = buttonRect(i, h);
      Object.assign(button.style, {
        left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, backgroundImage: sheet,
        backgroundSize: `${(BUTTON_SHEET.w * r.w) / 228}px ${(BUTTON_SHEET.h * r.h) / 88}px`,
      });
    });
    this.arrow.style.backgroundImage = `url(${JSON.stringify(this.art.url(this.data!.arrow))})`;
  }

  private drawPicture(): void {
    this.picture.style.backgroundImage = `url(${JSON.stringify(this.art.url(this.entry().picture))})`;
    this.tip.hidden = true;
    this.hoveredIcon = null;
    this.drawButtons();
    this.drawIcons();
    this.drawMark();
    if (this.last !== null) this.update(this.last);
  }

  /**
   * The destination mark (`UpdateDestinationPosition` and `RenderDestinationPosition`, WorldMap.cpp:1324-1375): on the
   * World always, on a continent's map only when the spot is on that continent; centred on the spot, 0.6 of its 32 px,
   * blinking (style.css).
   */
  private drawMark(): void {
    const at = this.destination;
    const on = at === null ? MAP_NONE : mapNumber(this.data!.world, at, this.data!);
    this.mark.hidden = at === null || (this.shown !== 0 && this.shown !== on);
    if (at === null || this.mark.hidden) return;
    const { w, h } = this.size;
    const point = mapPoint(this.entry().bounds, at, { left: 0, top: 0, width: w, height: h });
    this.mark.style.left = `${point.x}px`;
    this.mark.style.top = `${point.y}px`;
  }

  private drawButtons(): void {
    const h = this.size.h;
    this.buttons.forEach((button, i) => {
      const frameIndex = buttonFrame(i, this.shown, this.hoveredButton);
      const frame = this.data!.buttons.frames[frameIndex];
      button.dataset.frame = String(frameIndex);
      if (frame === undefined) return;
      const r = buttonRect(i, h);
      button.style.backgroundPosition = `${(-frame.x * r.w) / 228}px ${(-frame.y * r.h) / 88}px`;
    });
  }

  /** The icons (`m_bShowMonsterInfo && m_nMap > 0`, WorldMap.cpp:852-869): hit boxes of 40 px, the picture scaled. */
  private drawIcons(): void {
    this.icons.replaceChildren();
    const monsters = this.entry().monsters;
    if (!this.showMonsters || this.shown === 0 || monsters === null) return;
    const { w, h } = this.size;
    const rate = h / 1024;
    const { width: sheetW, height: sheetH } = monsters.size;
    const url = `url(${JSON.stringify(this.art.url(monsters.sheet))})`;
    monsters.rows.forEach((row, k) => {
      const box = this.element.ownerDocument.createElement('div');
      box.className = 'hud-worldmap-monster';
      box.dataset.monster = String(k);
      const at = iconAt(row, w, h);
      Object.assign(box.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${ICON_BOX}px`, height: `${ICON_BOX}px` });
      const frame = monsters.frames[k];
      if (frame !== undefined) {
        const sprite = this.element.ownerDocument.createElement('div');
        sprite.className = 'hud-worldmap-monster-picture';
        Object.assign(sprite.style, {
          width: `${frame.w * rate}px`, height: `${frame.h * rate}px`, backgroundImage: url,
          backgroundSize: `${sheetW * rate}px ${sheetH * rate}px`,
          backgroundPosition: `${-frame.x * rate}px ${-frame.y * rate}px`,
        });
        box.append(sprite);
      }
      box.addEventListener('pointermove', (event) => {
        if ((event as PointerEvent).pointerType !== 'touch') this.showTip(k);
      });
      box.addEventListener('pointerleave', (event) => {
        if ((event as PointerEvent).pointerType !== 'touch' && this.hoveredIcon === k) this.hideTip();
      });
      this.icons.append(box);
    });
  }

  private hoverButton(i: number | null): void {
    this.hoveredButton = i;
    this.drawButtons();
  }

  /** A press on a button (`OnLButtonDown`, WorldMap.cpp:1183-1234): a map's shows it; the ninth flips the switch. */
  private pressButton(i: number): void {
    if (i === MONSTER_BUTTON) {
      this.monsterInfo = !this.showMonsters;
      return;
    }
    if (i === this.shown) return;
    this.shown = i;
    this.drawPicture();
  }

  /** A tap on a touch screen: the icon whose centre is nearest, within 22 px, shows its details; a tap elsewhere hides them. */
  private onTap(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || this.data === null) return;
    if ((event.target as Element | null)?.closest?.('.hud-worldmap-button, .hud-worldmap-close') != null) return;
    const monsters = this.entry().monsters;
    if (!this.showMonsters || this.shown === 0 || monsters === null) return;
    const rect = this.picture.getBoundingClientRect();
    const [x, y] = [event.clientX - rect.left, event.clientY - rect.top];
    let best: number | null = null;
    let bestDistance = TOUCH_PICK;
    const rate = this.size.h / 1024;
    monsters.rows.forEach((row, k) => {
      const at = iconAt(row, this.size.w, this.size.h);
      // the centre of the icon as drawn (RenderScal at the rate, from its left and top), not of its 40 px box
      const frame = monsters.frames[k];
      const [half, halfH] = [((frame?.w ?? ICON_BOX) * rate) / 2, ((frame?.h ?? ICON_BOX) * rate) / 2];
      const distance = Math.hypot(at.x + half - x, at.y + halfH - y);
      if (distance <= bestDistance) [best, bestDistance] = [k, distance];
    });
    if (best === null) this.hideTip();
    else this.showTip(best);
  }

  /** The tooltip of icon `k` (`PutToolTip( …, 0 )`: above the icon, kept on the picture, tooltip.cpp:406-488). */
  private showTip(k: number): void {
    const monsters = this.entry().monsters;
    const row = monsters?.rows[k];
    if (row === undefined) return;
    this.hoveredIcon = k;
    for (const box of this.icons.children) (box as HTMLElement).classList.toggle('is-hovered', (box as HTMLElement).dataset.monster === String(k));
    const doc = this.element.ownerDocument;
    this.tipText.replaceChildren(...monsterTip(row, this.game.movers, this.game.itemProps, this.game.texts).map((line) => {
      const div = doc.createElement('div');
      div.className = 'hud-worldmap-tip-line';
      for (const part of line.parts) {
        const span = doc.createElement('span');
        span.textContent = part.text;
        span.style.color = cssRgb(part.color);
        div.append(span);
      }
      if (line.parts.length === 0) div.append(' ');
      if (line.element > 0) {
        const icon = doc.createElement('span');
        icon.className = 'hud-worldmap-tip-element';
        icon.style.backgroundImage = `url(${JSON.stringify(this.art.url(ELEMENT_ICONS))})`;
        icon.style.backgroundPosition = `${-(line.element - 1) * 16}px 0`;
        div.append(icon);
      }
      return div;
    }));
    this.tip.hidden = false;
    const at = iconAt(row, this.size.w, this.size.h);
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let top = at.y - th - 10;
    if (top < 0) top = 8;
    const left = Math.min(at.x, this.size.w - tw - 16);
    this.tip.style.left = `${Math.max(0, left)}px`;
    this.tip.style.top = `${top}px`;
  }

  private hideTip(): void {
    this.tip.hidden = true;
    this.hoveredIcon = null;
    for (const box of this.icons.children) (box as HTMLElement).classList.remove('is-hovered');
  }

  private listen(on: boolean): void {
    if (on === this.listening) return;
    this.listening = on;
    for (const type of ['keydown', 'keyup'] as const) {
      if (on) this.view.addEventListener(type, this.onKey, true);
      else this.view.removeEventListener(type, this.onKey, true);
    }
  }

  /** Every key is held while the map is open; M and Escape, pressed, close it. */
  private readonly onKey = (event: KeyboardEvent): void => {
    holdKey(event);
    if (event.type !== 'keydown' || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'KeyM' || event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };
}

/** An icon's place on a `w` by `h` picture (`(x * cpScreen.x) / 1280`, integer, WorldMap.cpp:1626-1639). */
function iconAt(row: MapMonsterRow, w: number, h: number): { x: number; y: number } {
  return { x: Math.trunc((row.x * w) / PICTURE.w), y: Math.trunc((row.y * h) / PICTURE.h) };
}

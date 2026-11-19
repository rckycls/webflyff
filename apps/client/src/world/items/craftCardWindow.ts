// custom (owner 2026-11-19): Bozman's Craft Card window (docs/superpowers/specs/2026-11-19-craft-card-design.md). V15 has
// none. A Craft Stone and 1-5 cards of one kind (all suit or all weapon) roll for one random top card: a 7% suit card or an
// A weapon card. The left part takes the items, the right part ("split screen", owner) shows what the last craft made.
// VIP characters (and game masters) may repeat the same combination up to 5 / 10 / 15 / 20 times in one press.
//
// The World server decides everything (outer repo patches/2026-11-19-craft-card.patch, `CDPSrvr::OnCraftCard`): this
// window only fills the slots, shows the chance (craftCardRules.ts, a copy) and sends CRAFT_CARD; the answer comes in
// SNAPSHOTTYPE_CRAFT_CARD. Items go in as in Create Jewels: a drop from the bag, the bag's double-click, a phone's tap;
// the bag holds them. It closes when the player moves (`NpcWindow.dismiss`) or the bag closes.

import { CraftCardCode } from '@flyffweb/protocol';
import type { CraftCardMessage } from '@flyffweb/protocol';
import { themeUrl } from '../hud/art';
import { textButton } from '../hud/numpad';
import { radioFrame } from '../hud/radio';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { ResWindow } from '../hud/resWindow';
import {
  CRAFT_CARD_MAX_CARDS, CRAFT_STONE, affordableTries, cardInput, craftChance, isTopCard, maxTries,
} from './craftCardRules';
import type { CardKind } from './craftCardRules';
import { NpcWindow, drawSlotIcon, freeOf, onSlotPress, propOf, slotBox, slotTooltip, takeDrops } from './npcWindowKit';
import type { BagPress, NpcWindowHost } from './npcWindowKit';

export interface CraftCardHost extends NpcWindowHost {
  /** The own character's letter (`m_dwAuthorization`, ADD_OBJ): the bulk tries it allows. */
  authorization(): number;
  /** One of the window's own chat lines (no TID has these words). */
  sayText(text: string): void;
  /** A Yes/No box; `yes` on Yes only. */
  confirm(text: string, yes: () => void): void;
  /** "Repeat how many times?" from 2 to `max`; `chosen` on OK only. */
  askTries(max: number, chosen: (tries: number) => void): void;
}

/** A press waits for its answer this long at most before Craft works again (an old World ignores the packet). */
const LOCK_MS = 3000;
const SLOT_PICTURE = 'WndChgElemItem.bmp';
const CARD_SLOTS = Array.from({ length: CRAFT_CARD_MAX_CARDS }, (_, i) => `WIDC_SLOT_CARD${i + 1}`);
const STONE_SLOT = 'WIDC_SLOT_STONE';
/** The ghost of an empty slot (as Create Jewels' `OnDraw`). */
const GHOST = 50 / 255;

const slot = (id: string, rect: ResControl['rect']): ResControl => ({ kind: 'static', id, rect, picture: SLOT_PICTURE });

/** The window (desktop): the items at the left, the Result part at the right. On a phone, CSS puts the Result under them. */
export const CRAFT_CARD: ResLayout = {
  title: 'Craft Card', width: 440, height: 236,
  controls: [
    { kind: 'static', id: 'WIDC_ST_STONE', rect: [16, 36, 110, 52], text: 'Craft Stone' },
    slot(STONE_SLOT, [116, 28, 148, 60]),
    { kind: 'static', id: 'WIDC_ST_CARDS', rect: [16, 84, 64, 100], text: 'Cards' },
    ...CARD_SLOTS.map((id, i) => slot(id, [66 + i * 40, 76, 98 + i * 40, 108] as const)),
    { kind: 'custom', id: 'WIDC_INFO', rect: [16, 118, 266, 160] },
    { kind: 'custom', id: 'WIDC_ACTIONS', rect: [16, 166, 266, 196] },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [194, 202, 266, 222], picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 },
    { kind: 'custom', id: 'WIDC_RESULT', rect: [280, 28, 426, 222], tile: 'WndEditTile00.tga' },
  ],
};

const KIND_MAKES: Record<CardKind, string> = { suit: 'one random 7% suit card', weapon: 'one random A weapon card' };

export class CraftCardWindow extends NpcWindow {
  private npcId = 0;
  private stone: number | null = null;
  private cards: Array<number | null> = Array(CRAFT_CARD_MAX_CARDS).fill(null);
  /** A press sent, not answered (and not timed out). */
  private sent = false;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last answer that ran, shown until the next item goes in. */
  private result: CraftCardMessage | null = null;
  /** "Stop at the first success", for the bulk press. */
  private stopOnSuccess = false;
  private craftButton: HTMLButtonElement | null = null;
  private bulkButton: HTMLButtonElement | null = null;
  private stopBox: HTMLButtonElement | null = null;
  private resultBox: HTMLElement | null = null;

  constructor(protected override readonly host: CraftCardHost) {
    super(host);
  }

  /** Bozman's "Craft Card" entry: the window, for this NPC. */
  openAt(npcId: number): boolean {
    this.npcId = npcId;
    return this.open();
  }

  get state(): { stone: number | null; cards: Array<number | null>; sent: boolean; result: CraftCardMessage | null } {
    return { stone: this.stone, cards: [...this.cards], sent: this.sent, result: this.result };
  }

  protected layout(): ResLayout { return CRAFT_CARD; }
  protected className(): string { return 'hud-craft-card'; }
  protected opensBag(): boolean { return true; }

  /** The bag's double-click (a phone's tap): the stone to its slot, a card to the first empty card slot. */
  take(objectId: number, _shift: boolean): BagPress {
    const prop = propOf(this.host, objectId);
    if (prop === undefined) return 'refused';
    if (prop.id === CRAFT_STONE) {
      this.drop(0, objectId);
      return 'taken';
    }
    if (cardInput(prop.id) === null && !isTopCard(prop.id)) return 'refused';
    const free = this.cards.indexOf(null);
    if (free < 0) {
      this.host.sayText('All five card slots are full.');
      return 'taken';
    }
    this.drop(free + 1, objectId);
    return 'taken';
  }

  /** An item put on slot `slotIndex` (0 the stone, 1-5 the cards), by a drop or `take`. */
  drop(slotIndex: number, objectId: number): void {
    if (this.sent) return;
    const prop = propOf(this.host, objectId);
    if (prop === undefined) return;
    if (slotIndex === 0) {
      if (prop.id !== CRAFT_STONE) { this.host.sayText('Only a Craft Stone goes there.'); return; }
    } else {
      if (isTopCard(prop.id)) { this.host.sayText('7% and A cards cannot be crafted.'); return; }
      const input = cardInput(prop.id);
      if (input === null) { this.host.sayText('Only 2%, 3% and 4% suit cards or D, C and B weapon cards go there.'); return; }
      const kind = this.kind();
      if (kind !== null && input.kind !== kind && this.filledCards() > (this.cards[slotIndex - 1] === null ? 0 : 1)) {
        this.host.sayText('Suit and weapon cards cannot be mixed.');
        return;
      }
    }
    const held = slotIndex === 0 ? this.stone : this.cards[slotIndex - 1] ?? null;
    if (held !== objectId && freeOf(this.host, objectId) <= 0) {
      this.host.sayText('No more of that item in the bag.');
      return;
    }
    this.put(slotIndex, objectId);
    this.result = null;
    this.draw();
  }

  /** A slot's press (a double-click, a phone's tap): its item back to the bag. */
  clearSlot(slotIndex: number): void {
    if (this.sent) return;
    this.put(slotIndex, null);
    this.draw();
  }

  /** Craft: one try, after the Yes/No box. */
  craft(): void {
    if (this.sent || !this.ready()) return;
    const chance = this.chance();
    this.host.confirm(`Craft with a ${chance}% chance? On a fail the Craft Stone and all cards are lost.`, () => this.send(1, false));
  }

  /** The bulk button (VIP): how many tries, then the Yes/No box naming the total. */
  bulk(): void {
    if (this.sent || !this.ready()) return;
    const max = this.bulkMax();
    if (maxTries(this.host.authorization()) <= 1) return;
    if (max < 2) {
      this.host.sayText('Not enough items for more than one try.');
      return;
    }
    const chance = this.chance(), cards = this.filledCards(), stop = this.stopOnSuccess;
    this.host.askTries(max, (tries) => {
      if (this.sent || tries < 2 || tries > max) return;
      this.host.confirm(
        `Craft ${tries} times with a ${chance}% chance each? It uses up to ${tries} Craft Stones and ${tries * cards} cards. `
          + 'Every fail loses its stone and cards.',
        () => this.send(tries, stop),
      );
    });
  }

  /** SNAPSHOTTYPE_CRAFT_CARD: ran (the slots empty, the Result shows it) or refused (the slots stay). */
  onResult(message: CraftCardMessage): void {
    this.unlock();
    if (message.code !== CraftCardCode.RAN) {
      this.host.sayText(message.code === CraftCardCode.TOO_FAR ? 'You are too far from Bozman.'
        : message.code === CraftCardCode.BAG_FULL ? 'Not enough space in the inventory.' : 'Cannot be done.');
      this.draw();
      return;
    }
    this.host.sayText(this.resultLine(message));
    this.reset();
    this.result = message;
    this.draw();
  }

  protected wire(window: ResWindow): void {
    const doc = this.host.ui.doc;
    [STONE_SLOT, ...CARD_SLOTS].forEach((id, i) => {
      const box = slotBox(window, id);
      box.dataset.slot = String(i);
      takeDrops(box, (objectId) => this.drop(i, objectId));
      onSlotPress(this.host, box, () => this.clearSlot(i));
      box.addEventListener('contextmenu', (event) => { event.preventDefault(); this.clearSlot(i); });
    });
    const craft = textButton(doc, 'Craft', () => this.craft(), 'craft', 'craft');
    craft.classList.add('auto-word', 'craft-card-go');
    const bulk = textButton(doc, '', () => this.bulk(), 'bulk', 'craft');
    bulk.classList.add('auto-word', 'craft-card-bulk');
    bulk.title = 'Bulk craft: repeat this combination';
    bulk.setAttribute('aria-label', 'Bulk craft');
    bulk.append(repeatIcon(doc));
    const stop = doc.createElement('button');
    stop.type = 'button';
    stop.className = 'auto-check craft-card-stop';
    stop.dataset.craft = 'stop';
    stop.setAttribute('role', 'checkbox');
    stop.addEventListener('mousedown', (event) => event.preventDefault());
    const box = doc.createElement('span');
    box.className = 'auto-v15-check';
    box.style.backgroundImage = themeUrl(this.host.ui.art, 'ButtCheck.bmp');
    const label = doc.createElement('span');
    label.textContent = 'Stop at first success';
    stop.append(box, label);
    stop.addEventListener('click', () => { this.stopOnSuccess = !this.stopOnSuccess; this.draw(); });
    window.setContent('WIDC_ACTIONS', craft, bulk, stop);
    window.button('WIDC_CANCEL').onclick = () => this.close();
    // the Result's words over its tiles (the tiles are the box's own children: `setContent` would take them away)
    const result = doc.createElement('div');
    result.className = 'craft-card-result';
    window.control('WIDC_RESULT').append(result);
    this.resultBox = result;
    this.craftButton = craft;
    this.bulkButton = bulk;
    this.stopBox = stop;
  }

  /** OnDestroy: every held item let go, the lock dropped. */
  protected reset(): void {
    for (let i = 0; i <= CRAFT_CARD_MAX_CARDS; i++) this.put(i, null);
  }

  protected opening(): void {
    this.unlock();
    this.result = null;
    this.stopOnSuccess = false;
  }

  protected closing(): void {
    this.unlock();
  }

  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const doc = this.host.ui.doc;
    const stoneProp = this.stone === null ? this.host.props.get(CRAFT_STONE) : propOf(this.host, this.stone);
    this.drawSlot(window, STONE_SLOT, this.stone, stoneProp);
    CARD_SLOTS.forEach((id, i) => this.drawSlot(window, id, this.cards[i] ?? null, propOf(this.host, this.cards[i] ?? null)));
    const kind = this.kind();
    const chance = doc.createElement('div');
    chance.className = 'craft-card-chance';
    chance.textContent = `Chance: ${this.chance()}%`;
    const makes = doc.createElement('div');
    makes.className = 'craft-card-makes';
    makes.textContent = `Makes: ${kind === null ? 'a random 7% or A card' : KIND_MAKES[kind]}`;
    window.setContent('WIDC_INFO', chance, makes);
    this.resultBox?.replaceChildren(...this.resultNodes());
    if (this.craftButton) this.craftButton.disabled = this.sent;
    const vip = maxTries(this.host.authorization()) > 1;
    if (this.bulkButton) {
      this.bulkButton.hidden = !vip;
      this.bulkButton.disabled = this.sent || this.bulkMax() < 2;
    }
    if (this.stopBox) {
      this.stopBox.hidden = !vip;
      this.stopBox.setAttribute('aria-checked', String(this.stopOnSuccess));
      const frame = radioFrame({ checked: this.stopOnSuccess, disabled: false, highlighted: false, pressed: false });
      this.stopBox.querySelector<HTMLElement>('.auto-v15-check')!.dataset.frame = String(frame);
    }
  }

  private drawSlot(window: ResWindow, id: string, objectId: number | null, prop: ReturnType<typeof propOf>): void {
    const box = slotBox(window, id);
    drawSlotIcon(this.host, box, prop, objectId === null ? GHOST : 1);
    box.toggleAttribute('data-filled', objectId !== null);
    slotTooltip(this.host, box, objectId);
  }

  /** The Result part: its title, then "Success!" / "Failed" (one try) or "N tries: M made", and each card made. */
  private resultNodes(): HTMLElement[] {
    const doc = this.host.ui.doc;
    const title = doc.createElement('div');
    title.className = 'craft-card-result-title';
    title.textContent = 'Result';
    const result = this.result;
    if (result === null) return [title];
    const made = result.made.filter((id) => id !== 0);
    const head = doc.createElement('div');
    head.className = 'craft-card-result-head';
    head.textContent = result.made.length === 1 ? (made.length === 1 ? 'Success!' : 'Failed') : `${result.made.length} tries: ${made.length} made`;
    head.dataset.success = String(made.length > 0);
    const rows = [...countBy(made)].map(([itemId, count]) => {
      const row = doc.createElement('div');
      row.className = 'craft-card-result-row';
      const icon = doc.createElement('div');
      icon.className = 'craft-card-result-icon';
      drawSlotIcon(this.host, icon, this.host.props.get(itemId));
      const name = doc.createElement('span');
      name.textContent = `${this.nameOf(itemId)} x${count}`;
      row.append(icon, name);
      return row;
    });
    return [title, head, ...rows];
  }

  private resultLine(message: CraftCardMessage): string {
    const made = message.made.filter((id) => id !== 0);
    if (message.made.length === 0) return 'Nothing was crafted.';
    if (message.made.length === 1) {
      return made.length === 1 ? `You crafted ${this.nameOf(made[0]!)}!` : 'Crafting failed. The Craft Stone and the cards are gone.';
    }
    const list = [...countBy(made)].map(([itemId, count]) => `${this.nameOf(itemId)} x${count}`).join(', ');
    return `${message.made.length} tries: ${made.length} made${list === '' ? '' : ` (${list})`}.`;
  }

  private nameOf(itemId: number): string {
    return this.host.props.get(itemId)?.name ?? `item ${itemId}`;
  }

  private send(tries: number, stopOnSuccess: boolean): void {
    if (this.sent || this.stone === null) return;
    const cardIds = this.cards.filter((id): id is number => id !== null);
    if (cardIds.length === 0) return;
    this.sent = true;
    this.lockTimer = setTimeout(() => { this.lockTimer = null; this.sent = false; this.draw(); }, LOCK_MS);
    this.draw();
    this.host.send({ type: 'craftCard', npcId: this.npcId, stoneId: this.stone, cardIds, tries, stopOnSuccess });
  }

  private unlock(): void {
    if (this.lockTimer !== null) clearTimeout(this.lockTimer);
    this.lockTimer = null;
    this.sent = false;
  }

  /** A stone and a card in, else the chat says what is missing. */
  private ready(): boolean {
    if (this.stone === null) { this.host.sayText('Put a Craft Stone in the window.'); return false; }
    if (this.filledCards() === 0) { this.host.sayText('Put 1 to 5 cards in the window.'); return false; }
    return true;
  }

  /**
   * The most tries: the letter's, cut to what the stacks pay for. A stack's pieces are those not held elsewhere (another
   * window's) plus this window's own slots of it (final review: the whole stack counted pieces other windows hold).
   */
  private bulkMax(): number {
    const own = (objectId: number): number =>
      (this.stone === objectId ? 1 : 0) + this.cards.filter((id) => id === objectId).length;
    const countOf = (objectId: number): number => freeOf(this.host, objectId) + own(objectId);
    return Math.min(maxTries(this.host.authorization()), affordableTries(this.stone, this.cards, countOf));
  }

  private chance(): number {
    return craftChance(this.cards.filter((id): id is number => id !== null).map((id) => propOf(this.host, id)?.id ?? 0));
  }

  private kind(): CardKind | null {
    for (const id of this.cards) {
      const input = id === null ? null : cardInput(propOf(this.host, id)?.id ?? 0);
      if (input !== null) return input.kind;
    }
    return null;
  }

  private filledCards(): number {
    return this.cards.filter((id) => id !== null).length;
  }

  private put(slotIndex: number, objectId: number | null): void {
    const old = slotIndex === 0 ? this.stone : this.cards[slotIndex - 1] ?? null;
    if (old !== null) this.host.reserve(old, false);
    if (slotIndex === 0) this.stone = objectId;
    else this.cards[slotIndex - 1] = objectId;
    if (objectId !== null) this.host.reserve(objectId, true);
  }
}

function countBy(ids: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

/** The bulk button's picture: two arrows in a circle (an own drawing; V15 has no such button). */
function repeatIcon(doc: Document): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('craft-card-bulk-icon');
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', 'M13 8a5 5 0 0 1-8.5 3.5M3 8a5 5 0 0 1 8.5-3.5M11.5 1.5v3h-3M4.5 14.5v-3h3');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

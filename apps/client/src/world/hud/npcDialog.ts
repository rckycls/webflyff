import type { Texts } from '../gameData';
import type { WebNpc } from '@flyffweb/formats';
import type { NpcAction } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { WindowFrame } from './frame';

export class NpcDialog {
  readonly frame: WindowFrame;
  private id: number | null = null;
  private readonly text: HTMLElement;
  private readonly keys: HTMLElement;
  private lastRequest = -Infinity;
  private dialogRequested = false;
  constructor(art: UiArt, private readonly valid: (id: number) => boolean,
    private readonly send: (id: number, key: string, param: number, quest: number) => void,
    private readonly shop: (id: number) => void, private readonly doc: Document = document, private readonly texts: Texts = new Map(),
    private readonly teleport?: (id: number, npc: WebNpc) => void) {
    this.frame = new WindowFrame('NPC', art, { width: 140, height: 120, mobileScale: 1, closeButton: false }, doc);
    this.frame.element.classList.add('hud-npc');
    doc.addEventListener('pointerdown', this.outside, true);
    this.text = doc.createElement('div'); this.text.className = 'npc-dialog-text'; this.text.setAttribute('role', 'status');
    this.keys = doc.createElement('div'); this.keys.className = 'npc-dialog-keys';
    this.frame.onClose = () => { this.id = null; this.dialogRequested = false; this.keys.replaceChildren(); };
  }
  open(id: number, name: string, metadata?: WebNpc): void {
    if (!this.valid(id)) return;
    this.id = id; this.lastRequest = -Infinity; this.dialogRequested = false;
    this.frame.body.replaceChildren(); this.keys.replaceChildren(); this.text.textContent = '';
    const menu = this.doc.createElement('div'); menu.className = 'npc-menu';
    const button = (label: string, action: string, run: () => void) => {
      const node = this.doc.createElement('button'); node.type = 'button'; node.textContent = label; node.dataset.npcAction = action;
      node.addEventListener('click', () => { if (this.update()) run(); }); menu.append(node);
    };
    for (const id of [...new Set(metadata?.menus ?? [0])]) {
      const label = [...this.texts.values()].find(text => text.textId === 7000 + id)?.text ?? (id === 0 ? 'Dialog' : id === 2 ? 'Trade' : id === 146 ? 'Teleporter' : 'Unavailable');
      if (id === 0) button(label, 'talk', () => this.request('#init', 0, 0));
      else if (id === 2 && !metadata?.vendorType) button(label, 'shop', () => this.shop(this.id!));
      else if (id === 146 && metadata?.teleports?.length && this.teleport) button(label, 'teleport', () => this.teleport!(this.id!, metadata));
      else { const item = this.doc.createElement('button'); item.type = 'button'; item.textContent = label; item.disabled = true; menu.append(item); }
    }
    this.frame.element.setAttribute('aria-label', name + ' menu');
    this.frame.body.append(menu, this.text, this.keys); this.frame.open({ x: 230, y: 80 });
  }
  updateAnchor(project: (id: number) => { x: number; y: number } | null): void {
    if (this.id === null || !this.frame.isOpen) return;
    const point = project(this.id); this.frame.element.style.visibility = point ? '' : 'hidden';
    if (!point) return;
    const element = this.frame.element, parent = element.parentElement;
    const width = element.offsetWidth || 140, height = element.offsetHeight || 40;
    const right = parent?.clientWidth ?? this.doc.documentElement.clientWidth;
    const bottom = (parent?.clientHeight ?? this.doc.documentElement.clientHeight) - 48;
    const x = point.x + width > right - 4 ? point.x - width - 32 : point.x;
    element.style.left = Math.max(4, Math.min(right - width - 4, x)) + 'px';
    element.style.top = Math.max(4, Math.min(bottom - height - 4, point.y)) + 'px';
  }
  update(): boolean {
    if (this.id === null || !this.frame.isOpen) return false;
    if (!this.valid(this.id)) { this.frame.close(); return false; }
    return true;
  }
  /** The native reply is player-scoped; only an active requested dialogue may consume it. */
  receive(action: NpcAction): void {
    if (!this.dialogRequested || !this.update()) return;
    switch (action.kind) {
      case 'say':
        this.text.textContent = action.quest ? 'Quest progression is not available yet.' : action.text; break;
      case 'key': case 'answer': {
        if (this.keys.children.length >= 64) return;
        this.keys.querySelectorAll<HTMLButtonElement>('[data-dialog-key]').forEach((button) => { if (button.dataset.dialogKey === action.key) button.remove(); });
        const button = this.doc.createElement('button'); button.type = 'button'; button.textContent = action.label;
        button.dataset.dialogKey = action.key; button.disabled = action.quest !== 0 || action.key.length > 255;
        button.addEventListener('click', () => this.request(action.key, action.param, action.quest)); this.keys.append(button); break;
      }
      case 'removeKey':
        for (const button of this.keys.querySelectorAll<HTMLButtonElement>('[data-dialog-key]')) if (button.dataset.dialogKey === action.key) button.remove();
        break;
      case 'clear': this.keys.replaceChildren(); break;
      case 'exit': this.frame.close(); break;
      case 'newQuest': case 'currentQuest': case 'queryName':
        this.text.textContent = 'This NPC action is not available yet.'; break;
      case 'none': case 'initStat': case 'navigator': case 'removeNavigator': break;
    }
  }
  private request(key: string, param: number, quest: number): void {
    if (!this.update() || quest !== 0 || performance.now() - this.lastRequest < 450) return;
    this.lastRequest = performance.now();
    try { this.dialogRequested = true; this.send(this.id!, key, param, quest); }
    catch (error) { this.dialogRequested = false; this.text.textContent = error instanceof Error ? error.message : 'Unable to talk to this NPC.'; }
  }
  private readonly outside = (event: Event): void => {
    if (this.frame.isOpen && !this.frame.element.contains(event.target as Node)) this.frame.close();
  };
  dispose(): void { this.doc.removeEventListener('pointerdown', this.outside, true); this.frame.close(); this.frame.element.remove(); }
}

// 2026-11-12 (owner): on a phone the soft keyboard comes up from the bottom over the game, and the text box being typed in
// (the chat's line above the task bar, the private shop's name, ...) stayed under it: the player could not see what they
// typed. Neuz has no soft keyboard. While a text box of the world has the focus on a touch screen, the world's layer is
// slid up (a translateY: no relayout, the game keeps its size) just enough that the box stands above the keyboard, and
// slid back when the typing ends.
//
// Where the keyboard begins is read from the visual viewport (`visualViewport`): its height shrinks by the keyboard's on
// Android Chrome and iOS Safari, and the browser may pan it (`offsetTop`). Until it has shrunk (the keyboard still sliding
// in, or a browser that does not say) the keyboard is taken to cover the bottom `FALLBACK_COVER` of the layer. When it has
// shrunk and grown back with the box still focused (Android's Back closes the keyboard and keeps the focus), the layer goes
// back down; the keyboard coming back up lifts it again.

/** What the lift reads of the visual viewport (`window.visualViewport`). */
export interface ViewportLike extends EventTarget {
  readonly height: number;
  readonly offsetTop: number;
}

/** The room kept between the box and the keyboard, and between the box and the top of what is seen, in CSS px. */
const MARGIN = 8;
/** The share of the layer a keyboard is taken to cover before the visual viewport says (a landscape phone's is half or more). */
export const FALLBACK_COVER = 0.55;
/** A visual viewport at least this much shorter than the layer has a keyboard over the rest. */
const KEYBOARD_MIN = 80;
/** The inputs that take no typing: no keyboard comes up for them. */
const NOT_TYPED = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

/** Whether `target` is a box the soft keyboard types into: a text input, a textarea, or an editable element. */
export function isTextField(target: EventTarget | null): target is HTMLElement {
  if (target === null || typeof (target as Element).tagName !== 'string') return false;
  const element = target as HTMLElement;
  if (element.tagName === 'TEXTAREA') return !(element as HTMLTextAreaElement).readOnly;
  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    return !input.readOnly && !NOT_TYPED.has(input.type);
  }
  return element.isContentEditable === true;
}

export class KeyboardLift {
  /** How far the layer is slid up, in CSS px (0: in place). */
  private shift = 0;
  /** The visual viewport has been seen shrunk by a keyboard while the box had the focus. */
  private shrunk = false;
  /** It then grew back with the box still focused: the keyboard was closed, the layer stays down. */
  private dismissed = false;
  private scheduled = false;

  constructor(
    private readonly layer: HTMLElement,
    private readonly view: Window,
    private readonly viewport: ViewportLike | null = view.visualViewport ?? null,
  ) {
    layer.addEventListener('focusin', this.schedule);
    layer.addEventListener('focusout', this.schedule);
    viewport?.addEventListener('resize', this.schedule);
    viewport?.addEventListener('scroll', this.schedule);
    view.addEventListener('resize', this.schedule);
  }

  /** How far the layer is slid up now, in CSS px. */
  get lifted(): number {
    return this.shift;
  }

  /**
   * Slides the layer for the box that has the focus now: its bottom `MARGIN` above the keyboard, its top never above what
   * is seen; in place when no box of the layer has the focus, without a touch screen, or with the keyboard closed.
   */
  update(): void {
    this.scheduled = false;
    const doc = this.layer.ownerDocument;
    const active = doc.activeElement;
    const field = isTextField(active) && this.layer.contains(active) ? active : null;
    if (field === null || this.view.matchMedia?.('(pointer: coarse)').matches !== true) {
      this.shrunk = false;
      this.dismissed = false;
      this.apply(0);
      return;
    }
    const height = this.layer.clientHeight;
    const seenHeight = this.viewport?.height ?? height;
    const seenTop = this.viewport?.offsetTop ?? 0;
    const open = height > 0 && seenHeight < height - KEYBOARD_MIN;
    if (open) {
      this.shrunk = true;
      this.dismissed = false;
    } else if (this.shrunk) {
      this.shrunk = false;
      this.dismissed = true;
    }
    if (this.dismissed) {
      this.apply(0);
      return;
    }
    // the layer's top as it stands unslid, and where the keyboard begins: the visual viewport's bottom once it has shrunk
    const layerTop = this.layer.getBoundingClientRect().top + this.shift;
    const keyboardTop = open ? seenTop + seenHeight : layerTop + height * (1 - FALLBACK_COVER);
    const rect = field.getBoundingClientRect();
    const up = this.shift + rect.bottom - (keyboardTop - MARGIN);
    const most = this.shift + rect.top - (seenTop + MARGIN);
    this.apply(Math.round(Math.max(0, Math.min(up, most, height))));
  }

  dispose(): void {
    this.layer.removeEventListener('focusin', this.schedule);
    this.layer.removeEventListener('focusout', this.schedule);
    this.viewport?.removeEventListener('resize', this.schedule);
    this.viewport?.removeEventListener('scroll', this.schedule);
    this.view.removeEventListener('resize', this.schedule);
    this.apply(0);
  }

  /** The next frame updates (a focus that moves from one box to another is one change, not two). */
  private readonly schedule = (): void => {
    if (this.scheduled) return;
    this.scheduled = true;
    const run = () => { if (this.scheduled) this.update(); };
    if (typeof this.view.requestAnimationFrame === 'function') this.view.requestAnimationFrame(run);
    else setTimeout(run, 0);
  };

  private apply(shift: number): void {
    if (shift === this.shift) return;
    this.shift = shift;
    this.layer.style.transform = shift > 0 ? `translateY(${-shift}px)` : '';
    this.layer.toggleAttribute('data-keyboard-lift', shift > 0);
  }
}

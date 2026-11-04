/** Camera rotation owns the arrows, a right-mouse drag, or a touch drag past the same 8px threshold as world taps. */
export class CameraControls {
  private press: { id: number; x: number; y: number; dragging: boolean; touch: boolean } | null = null;
  private readonly arrows = new Set<string>();
  /**
   * Piece 7 M5: in flight a right mouse drag steers the flier (`ControlFlying`'s mouse, Neuz's mode 0): called with each
   * move's pixels, it answers true when it took the move, which then does not turn the camera. Touch drags never steer.
   */
  steer: ((dx: number, dy: number) => boolean) | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly rotate: (dx: number, dy: number) => void,
    private readonly keys: EventTarget | undefined = canvas.ownerDocument?.defaultView ?? undefined,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('lostpointercapture', this.up);
    keys?.addEventListener('keydown', this.keyDown);
    keys?.addEventListener('keyup', this.keyUp);
    keys?.addEventListener('blur', this.blur);
  }

  /** Read held arrows once per 60Hz rules step, using the same camera rotation as dragging. */
  step(): void {
    const dx = Number(this.arrows.has('ArrowRight')) - Number(this.arrows.has('ArrowLeft'));
    const dy = Number(this.arrows.has('ArrowDown')) - Number(this.arrows.has('ArrowUp'));
    if (dx !== 0 || dy !== 0) this.rotate(dx * 4, dy * 4);
  }

  reset(): void { this.press = null; this.arrows.clear(); }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.up);
    this.canvas.removeEventListener('lostpointercapture', this.up);
    this.keys?.removeEventListener('keydown', this.keyDown);
    this.keys?.removeEventListener('keyup', this.keyUp);
    this.keys?.removeEventListener('blur', this.blur);
    this.reset();
  }

  private readonly down = (event: PointerEvent): void => {
    if (event.defaultPrevented || this.press !== null || (event.pointerType !== 'touch' && event.button !== 2)) return;
    this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, touch: event.pointerType === 'touch' };
    this.canvas.setPointerCapture?.(event.pointerId);
  };

  private readonly move = (event: PointerEvent): void => {
    const press = this.press;
    if (press === null || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.touch && this.steer !== null && (dx !== 0 || dy !== 0) && this.steer(dx, dy)) {
      press.x = event.clientX;
      press.y = event.clientY;
      event.preventDefault();
      return;
    }
    if (!press.dragging && Math.hypot(dx, dy) <= 8) return;
    press.dragging = true;
    press.x = event.clientX;
    press.y = event.clientY;
    event.preventDefault();
    this.rotate(dx * (press.touch ? 1.5 : 1), dy * (press.touch ? .35 : 1));
  };

  private readonly up = (event: PointerEvent): void => {
    if (event.pointerId === this.press?.id) this.press = null;
  };

  private readonly keyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key.code) || event.defaultPrevented) return;
    const field = event.target as HTMLElement | null;
    if (field?.tagName === 'INPUT' || field?.tagName === 'TEXTAREA' || field?.tagName === 'SELECT' || field?.isContentEditable) return;
    event.preventDefault();
    this.arrows.add(key.code);
  };
  private readonly keyUp = (event: Event): void => { this.arrows.delete((event as KeyboardEvent).code); };
  private readonly blur = (): void => this.reset();
}

// 2026-11-20 (owner, "allow opening a window while walking on mobile", then yes to "make every window button work with a
// second finger while walking"): a phone's browser makes no click of a tap by a second finger while a first is down (the
// joystick's, walking): Chrome takes the two fingers as one gesture. The game's buttons, tabs, check boxes, menu lines and
// window close buttons all answer clicks, so they did nothing for it.
//
// `watchSecondFingerTaps` watches the fingers on the page. For such a tap, it clicks the element itself, or puts the focus
// in a text box, unless the browser clicked after all. A tap here is a finger that went down while another was down,
// lifted within TAP_MS and TAP_SLOP_PX, over the element it pressed. The world's canvas is left alone: its taps are pointer
// events already (the select tap, the joystick, the camera's two fingers).

/** The longest press that is a tap (ms). */
export const TAP_MS = 600;
/** The farthest a tap's finger may slide (CSS px). */
export const TAP_SLOP_PX = 12;
/** How long the browser's own click is waited for before one is made (ms). */
export const NATIVE_CLICK_WAIT_MS = 60;

/** A text box: it takes the focus from a tap (the game's keyboard then opens, floatingKeyboard.ts), not a click. */
function isTextBox(element: Element): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/** Starts watching `doc`'s fingers; the function returned stops it. */
export function watchSecondFingerTaps(doc: Document): () => void {
  /** The fingers down on the page. */
  const down = new Set<number>();
  /** The second finger's press being watched. */
  let press: { id: number; target: Element; x: number; y: number; at: number } | null = null;
  /** The element the browser itself clicked last, since a tap was seen. */
  let clicked: EventTarget | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const onDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    const second = down.size > 0;
    down.add(event.pointerId);
    const target = event.target instanceof Element ? event.target : null;
    press = second && target !== null && target.tagName !== 'CANVAS'
      ? { id: event.pointerId, target, x: event.clientX, y: event.clientY, at: event.timeStamp }
      : press;
  };
  const onUp = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    down.delete(event.pointerId);
    if (press === null || press.id !== event.pointerId) return;
    const { target, x, y, at } = press;
    press = null;
    if (event.timeStamp - at > TAP_MS || Math.hypot(event.clientX - x, event.clientY - y) > TAP_SLOP_PX) return;
    // the element under the lift (a touch's pointerup goes to the pressed element, wherever the finger is)
    const under = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(event.clientX, event.clientY) : target;
    if (under === null || !(target === under || target.contains(under) || under.contains(target))) return;
    clicked = null;
    const { clientX, clientY } = event;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (clicked !== null || !target.isConnected) return; // the browser clicked after all, or the element went
      if (isTextBox(target)) { target.focus(); return; }
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX, clientY, detail: 1 }));
    }, NATIVE_CLICK_WAIT_MS);
    timers.add(timer);
  };
  const onCancel = (event: PointerEvent): void => {
    down.delete(event.pointerId);
    if (press?.id === event.pointerId) press = null;
  };
  const onClick = (event: MouseEvent): void => {
    if (event.isTrusted) clicked = event.target;
  };

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onCancel, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('pointerup', onUp, true);
    doc.removeEventListener('pointercancel', onCancel, true);
    doc.removeEventListener('click', onClick, true);
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
}

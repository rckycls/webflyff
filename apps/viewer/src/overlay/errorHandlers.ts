// Errors the code did not catch itself still have to reach the overlay: a phone or tablet has no console, and a blank
// canvas with nothing on it is exactly what the global constraints rule out. `target` is `window` (and the renderer's
// canvas for context loss); both are plain EventTargets here so the wiring can be tested without a browser.

type ErrorSink = { error(message: string): void };

function messageOf(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return reason === undefined || reason === null ? '' : String(reason);
}

/**
 * Forwards uncaught errors (`error`) and unhandled promise rejections (`unhandledrejection`) to `overlay.error`. The same
 * message twice in a row is reported once, so a failure that repeats every frame does not push the others out.
 */
export function installGlobalErrorHandlers(target: EventTarget, overlay: ErrorSink): void {
  let last = '';
  const report = (message: string): void => {
    if (message === last) return;
    last = message;
    overlay.error(message);
  };

  target.addEventListener('error', (event) => {
    const { message, filename, lineno, error } = event as Partial<ErrorEvent>;
    const text = messageOf(error) || message || 'error';
    const place = filename ? ` (${filename.split('/').pop()}:${lineno ?? 0})` : '';
    report(`${text}${place}`);
  });

  target.addEventListener('unhandledrejection', (event) => {
    const reason = messageOf((event as Partial<PromiseRejectionEvent>).reason);
    report(`unhandled rejection${reason ? `: ${reason}` : ''}`);
  });
}

/**
 * Tells the overlay when the WebGL context goes (a memory-starved phone does this) and when it returns. three.js
 * handles both events itself (it cancels the loss so the browser may restore the context); this only makes them visible.
 */
export function installContextLossHandlers(canvas: EventTarget, overlay: ErrorSink): void {
  canvas.addEventListener('webglcontextlost', () => {
    overlay.error('WebGL context lost (often the device is short of GPU memory): drawing stops until it is restored');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    overlay.error('WebGL context restored');
  });
}

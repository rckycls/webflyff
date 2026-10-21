import { describe, expect, it, vi } from 'vitest';
import { installContextLossHandlers, installGlobalErrorHandlers } from '../src/overlay/errorHandlers';

// Node has no ErrorEvent or PromiseRejectionEvent, so the events are plain Events carrying the fields the browser's have.
function errorEvent(fields: { message?: string; filename?: string; lineno?: number; error?: unknown }): Event {
  return Object.assign(new Event('error'), fields);
}
function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason });
}

describe('installGlobalErrorHandlers', () => {
  it('forwards an uncaught error to the overlay with its message and place', () => {
    const target = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installGlobalErrorHandlers(target, overlay);

    target.dispatchEvent(
      errorEvent({ message: 'Uncaught TypeError: x is not a function', filename: 'http://h/src/a.ts', lineno: 12 }),
    );

    expect(overlay.error).toHaveBeenCalledTimes(1);
    const message = overlay.error.mock.calls[0]![0];
    expect(message).toContain('x is not a function');
    expect(message).toContain('a.ts');
    expect(message).toContain('12');
  });

  it('prefers the error object, and copes with an event that has nothing', () => {
    const target = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installGlobalErrorHandlers(target, overlay);

    target.dispatchEvent(errorEvent({ message: 'Script error.', error: new RangeError('bad tile height') }));
    target.dispatchEvent(new Event('error'));

    expect(overlay.error.mock.calls[0]![0]).toContain('bad tile height');
    expect(overlay.error).toHaveBeenCalledTimes(2);
    expect(overlay.error.mock.calls[1]![0]).toContain('error');
  });

  it('forwards an unhandled promise rejection, whatever the reason is', () => {
    const target = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installGlobalErrorHandlers(target, overlay);

    target.dispatchEvent(rejectionEvent(new Error('could not load /assets/x.glb after 4 attempts')));
    target.dispatchEvent(rejectionEvent('a plain string'));
    target.dispatchEvent(rejectionEvent(undefined));

    expect(overlay.error).toHaveBeenCalledTimes(3);
    expect(overlay.error.mock.calls[0]![0]).toContain('could not load /assets/x.glb after 4 attempts');
    expect(overlay.error.mock.calls[1]![0]).toContain('a plain string');
    expect(overlay.error.mock.calls[2]![0]).toContain('unhandled');
  });

  it('does not repeat the same message line after line', () => {
    const target = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installGlobalErrorHandlers(target, overlay);

    for (let i = 0; i < 5; i++) target.dispatchEvent(rejectionEvent(new Error('same failure')));
    target.dispatchEvent(rejectionEvent(new Error('another failure')));
    target.dispatchEvent(rejectionEvent(new Error('same failure')));

    expect(overlay.error).toHaveBeenCalledTimes(3);
  });
});

describe('installContextLossHandlers', () => {
  it('tells the overlay when the WebGL context is lost and when it comes back', () => {
    const canvas = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installContextLossHandlers(canvas, overlay);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toMatch(/context lost/i);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(overlay.error).toHaveBeenCalledTimes(2);
    expect(overlay.error.mock.calls[1]![0]).toMatch(/context restored/i);
  });
});

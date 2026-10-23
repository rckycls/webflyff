import { describe, expect, it, vi } from 'vitest';
import {
  installContextLossHandlers,
  installGlobalErrorHandlers,
  installShaderErrorHandler,
} from '../src/overlay/errorHandlers';

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

  it('says that the page needs a reload: the textures are not kept after upload, so they cannot come back', () => {
    const canvas = new EventTarget();
    const overlay = { error: vi.fn<(message: string) => void>() };
    installContextLossHandlers(canvas, overlay);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));

    expect(overlay.error.mock.calls[0]![0]).toMatch(/reload the page/i);
    expect(overlay.error.mock.calls[1]![0]).toMatch(/reload the page/i);
  });
});

describe('installShaderErrorHandler', () => {
  /** A context that answers the info logs of one program and its two shaders. */
  function shaderFailure(logs: { program?: string; vertex?: string; fragment?: string }) {
    const program = {} as WebGLProgram;
    const vertex = {} as WebGLShader;
    const fragment = {} as WebGLShader;
    const gl = {
      getProgramInfoLog: (p: WebGLProgram) => (p === program ? (logs.program ?? '') : null),
      getShaderInfoLog: (s: WebGLShader) => (s === vertex ? (logs.vertex ?? '') : s === fragment ? (logs.fragment ?? '') : null),
    } as unknown as WebGLRenderingContext;
    return { gl, program, vertex, fragment };
  }

  function install() {
    const renderer: { debug: { onShaderError: ((...args: never[]) => void) | null } } = { debug: { onShaderError: null } };
    const overlay = { error: vi.fn<(message: string) => void>() };
    const console = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
    installShaderErrorHandler(renderer as Parameters<typeof installShaderErrorHandler>[0], overlay);
    const fail = (logs: Parameters<typeof shaderFailure>[0]): void => {
      const { gl, program, vertex, fragment } = shaderFailure(logs);
      const handler = renderer.debug.onShaderError as unknown as (
        gl: WebGLRenderingContext,
        program: WebGLProgram,
        vertex: WebGLShader,
        fragment: WebGLShader,
      ) => void;
      handler(gl, program, vertex, fragment);
    };
    return { overlay, console, fail };
  }

  it('takes over three.js shader errors and sends them to the overlay with the program and shader logs', () => {
    const { overlay, console, fail } = install();

    fail({
      program: 'Vertex shader is not compiled.',
      fragment: "ERROR: 0:12: 'invariant' : syntax error\nERROR: 1 compilation errors.",
    });

    expect(overlay.error).toHaveBeenCalledTimes(1);
    const message = overlay.error.mock.calls[0]![0];
    expect(message).toMatch(/shader/i);
    expect(message).toContain('program: Vertex shader is not compiled.');
    expect(message).toContain("fragment: ERROR: 0:12: 'invariant' : syntax error / ERROR: 1 compilation errors.");
    // an empty log is left out
    expect(message).not.toContain('vertex:');
    // the whole logs still go to the console, for a desktop browser's developer tools
    expect(console).toHaveBeenCalledTimes(1);
    console.mockRestore();
  });

  it('cuts a long log short, so one failure cannot fill the overlay', () => {
    const { overlay, console, fail } = install();

    fail({ fragment: 'E'.repeat(5000) });

    const message = overlay.error.mock.calls[0]![0];
    expect(message.length).toBeLessThan(500);
    expect(message).toContain('…');
    console.mockRestore();
  });

  it('still reports a failure that left no log at all', () => {
    const { overlay, console, fail } = install();

    fail({});

    expect(overlay.error.mock.calls[0]![0]).toMatch(/shader.*no log/i);
    console.mockRestore();
  });
});

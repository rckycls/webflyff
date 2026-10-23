// Errors the code did not catch itself still have to reach the overlay: a phone or tablet has no console, and a blank
// canvas with nothing on it is exactly what the global constraints rule out. `target` is `window` (and the renderer's
// canvas for context loss); both are plain EventTargets here so the wiring can be tested without a browser. Shader
// errors come from three.js itself (`renderer.debug.onShaderError`), which otherwise only writes them to the console.

import type { WebGLRenderer } from 'three';

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
 * A restored context does not bring the picture back: the viewer lets go of its textures' CPU copies once they are
 * uploaded (loaders.ts, TerrainTile.ts), so there is nothing to upload again. Both messages say to reload the page.
 */
export function installContextLossHandlers(canvas: EventTarget, overlay: ErrorSink): void {
  canvas.addEventListener('webglcontextlost', () => {
    overlay.error('WebGL context lost (often the device is short of GPU memory): reload the page');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    overlay.error('WebGL context restored, but the textures it lost cannot be uploaded again: reload the page');
  });
}

/** The most of one info log the overlay shows. A driver's log can run to pages. */
const MAX_LOG_CHARS = 300;

/** A log on one line (its lines joined by " / "), cut to `MAX_LOG_CHARS`. */
function shortLog(log: string): string {
  const line = log.replace(/\s*\n\s*/g, ' / ');
  return line.length > MAX_LOG_CHARS ? `${line.slice(0, MAX_LOG_CHARS)}…` : line;
}

/**
 * Sends a shader that fails to compile or link to the overlay with the program's and the shaders' info logs (each
 * shortened; an empty one left out), and the whole logs to the console. Setting `onShaderError` replaces three.js'
 * own report, which goes to the console only: a phone would show nothing but a missing material.
 */
export function installShaderErrorHandler(renderer: Pick<WebGLRenderer, 'debug'>, overlay: ErrorSink): void {
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    // @types/three types this as three's own WebGLProgram; three passes the GL program (WebGLProgram.js:885, r186)
    const glProgram = program as unknown as WebGLProgram;
    const logs: [string, string][] = [
      ['program', gl.getProgramInfoLog(glProgram) ?? ''],
      ['vertex', gl.getShaderInfoLog(vertexShader) ?? ''],
      ['fragment', gl.getShaderInfoLog(fragmentShader) ?? ''],
    ];
    const present = logs.map(([name, log]) => [name, log.trim()] as const).filter(([, log]) => log !== '');
    const text = present.map(([name, log]) => `${name}: ${shortLog(log)}`).join(' | ');
    overlay.error(`a shader failed to compile or link, so a material is not drawn: ${text || 'no log'}`);
    console.error('three.js shader error', Object.fromEntries(present));
  };
}

/** Where a failure happened: which file, which byte, which reader, and the C++ it copies. */
export interface ErrorContext {
  file: string;
  offset: number;
  reader: string;
  cppRef: string;
}

/**
 * The only error readers throw. Always carries the file path, the byte offset,
 * the reader name and the C++ reference, so a failure can be traced to one spot
 * in one file and one function of the original client.
 */
export class FormatError extends Error {
  readonly file: string;
  readonly offset: number;
  readonly reader: string;
  readonly cppRef: string;

  constructor(message: string, ctx: ErrorContext) {
    super(`${ctx.reader} [${ctx.cppRef}] ${ctx.file} @ byte ${ctx.offset}: ${message}`);
    this.name = 'FormatError';
    this.file = ctx.file;
    this.offset = ctx.offset;
    this.reader = ctx.reader;
    this.cppRef = ctx.cppRef;
  }
}

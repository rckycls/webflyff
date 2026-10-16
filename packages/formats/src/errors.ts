/** What `ErrorContext.offset` counts: bytes of a binary file, or characters of a decoded text script. */
export type OffsetUnit = 'byte' | 'char';

/** Where a failure happened: which file, which position, which reader, and the C++ it copies. */
export interface ErrorContext {
  file: string;
  /** Position of the failure, counted in `unit`. */
  offset: number;
  reader: string;
  cppRef: string;
  /**
   * Binary readers leave this out (`'byte'`). Text-script readers work on decoded text, where a byte offset is
   * not known (a UTF-16LE file has two bytes per character, plus the BOM), so they pass `'char'`.
   */
  unit?: OffsetUnit;
  /** 1-based line, for text formats. */
  line?: number;
}

/**
 * The only error readers throw. Always carries the file path, the offset (in bytes for binary files, in
 * characters of the decoded text for scripts), the reader name and the C++ reference, so a failure can be
 * traced to one spot in one file and one function of the original client.
 */
export class FormatError extends Error {
  readonly file: string;
  readonly offset: number;
  readonly unit: OffsetUnit;
  readonly line: number | undefined;
  readonly reader: string;
  readonly cppRef: string;

  constructor(message: string, ctx: ErrorContext) {
    const unit = ctx.unit ?? 'byte';
    const where = `${unit} ${ctx.offset}${ctx.line === undefined ? '' : ` (line ${ctx.line})`}`;
    super(`${ctx.reader} [${ctx.cppRef}] ${ctx.file} @ ${where}: ${message}`);
    this.name = 'FormatError';
    this.file = ctx.file;
    this.offset = ctx.offset;
    this.unit = unit;
    this.line = ctx.line;
    this.reader = ctx.reader;
    this.cppRef = ctx.cppRef;
  }
}

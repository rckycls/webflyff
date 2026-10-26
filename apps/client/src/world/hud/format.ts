// The C `printf` formats Neuz fills its texts with (`sprintf`, `CString::Format` and `FormatV`): the status window's title
// and "<%d>", the target bar's line, and DEFINEDTEXT's arguments (`messages.ts`).

/**
 * A C `printf` format with `args` (`sprintf`, `CString::Format`): `%s` (a precision cuts it), `%d` `%i` `%u` (an `I64`
 * or `l` size is read and ignored), `%f` with its precision, `%x` `%X` `%c`, a width with `-` and `0`, and `%%`. A missing
 * argument is empty (C would read whatever is there). A string given to `%d` is written as it is: DEFINEDTEXT passes
 * every argument as a string, which Neuz's `FormatV` would print the address of.
 */
export function formatText(format: string, args: ReadonlyArray<string | number | bigint>): string {
  let next = 0;
  return format.replace(/%([-+ #0]*)(\d+)?(?:\.(\d+))?(?:I64|ll|l|h)?([sdiuxXcf%])/g, (_, flags: string, width?: string, precision?: string, conversion?: string) => {
    if (conversion === '%') return '%';
    const value = args[next++];
    const prec = precision === undefined ? undefined : Number(precision);
    let out: string;
    switch (conversion) {
      case 's':
        out = value === undefined ? '' : String(value);
        if (prec !== undefined) out = out.slice(0, prec);
        break;
      case 'f':
        out = typeof value === 'number' ? value.toFixed(prec ?? 6) : String(value ?? '');
        break;
      case 'x':
      case 'X':
        out = typeof value === 'number' ? (value >>> 0).toString(16) : String(value ?? '');
        if (conversion === 'X') out = out.toUpperCase();
        break;
      case 'c':
        out = typeof value === 'number' ? String.fromCharCode(value) : String(value ?? '').slice(0, 1);
        break;
      default: // d i u
        out = typeof value === 'number' ? String(Math.trunc(value)) : String(value ?? '');
    }
    const w = width === undefined ? 0 : Number(width);
    if (out.length < w) out = flags.includes('-') ? out.padEnd(w) : out.padStart(w, flags.includes('0') && conversion !== 's' ? '0' : ' ');
    return out;
  });
}

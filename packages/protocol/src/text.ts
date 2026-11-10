import { ProtocolError } from './errors';

// The client's code page is IDS_CODEPAGE 1252. TextDecoder is stateless unless `stream` is set, so one is shared.
const decoder = new TextDecoder('windows-1252');

/** Text received from a server: windows-1252, so 0x80..0x9F are the punctuation the client shows, not controls. */
export function decodeText(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/**
 * Text we send: printable ASCII (0x20..0x7E) only, one byte per character. Anything else is refused instead of
 * being replaced, because a changed account name or password would fail later with no clue why. The message
 * gives the index only, never the text, so a password cannot end up in a log.
 */
export function encodeAscii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) {
      throw new ProtocolError(`character at index ${i} is not printable ASCII (0x20-0x7E)`);
    }
    out[i] = c;
  }
  return out;
}

const characters = new Map(Array.from({ length: 256 }, (_, byte) => [decodeText(Uint8Array.of(byte)), byte]));

/**
 * 2026-11-10 (bank-mail; first the guild's `guildString`): a text the player typed, in the game's code page (windows-1252, as
 * the chat's), for `CAr::WriteString`: at most `max` bytes, no control character but line breaks when `lineBreaks`. The
 * windows check their own rules first; this only refuses what cannot be sent.
 */
export function encodeGameText(text: string, max: number, lineBreaks = false): Uint8Array {
  if (text.length > max) throw new RangeError(`Enter at most ${max} characters.`);
  return Uint8Array.from(Array.from(text, (character) => {
    const byte = characters.get(character);
    const control = byte === undefined || byte < 0x20 || byte === 0x7f;
    if (control && !(lineBreaks && (character === '\n' || character === '\r'))) {
      throw new RangeError('This character cannot be sent in the game text encoding.');
    }
    return byte ?? 0;
  }));
}

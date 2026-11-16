// The pictures Support / VIP takes (payment receipts, QR codes): PNG, JPEG or WebP, at most 5 MB, told apart by their
// first bytes, never by a name or a type the browser gives. They come as base64 text in a JSON body.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** A JSON body that carries one picture: its base64 text (4/3 of the bytes) and a few small fields. */
export const MAX_IMAGE_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 8 * 1024;

export type ImageType = 'png' | 'jpg' | 'webp';
export const IMAGE_MIME: Readonly<Record<ImageType, string>> = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' });

const starts = (bytes: Uint8Array, at: number, text: string): boolean =>
  bytes.length >= at + text.length && [...text].every((c, i) => bytes[at + i] === c.charCodeAt(0));

/** The picture type by its content: the PNG signature and IHDR chunk, a JPEG's SOI marker, a WebP's RIFF/WEBP/VP8. */
export function sniffImage(bytes: Uint8Array): ImageType | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && starts(bytes, 1, 'PNG\r\n\x1a\n') && starts(bytes, 12, 'IHDR')) return 'png';
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 16 && starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP') && starts(bytes, 12, 'VP8')) return 'webp';
  return undefined;
}

export type ImageField = { bytes: Buffer; type: ImageType } | { problem: 'missing' | 'too_big' | 'not_image' };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A picture from a base64 field (a `data:image/...;base64,` start is allowed), checked by its content and size. */
export function readImageField(value: unknown): ImageField {
  if (typeof value !== 'string' || value === '') return { problem: 'missing' };
  let text = value;
  const comma = text.indexOf(',');
  if (text.startsWith('data:') && comma > 0 && comma < 64 && text.slice(0, comma).endsWith(';base64')) text = text.slice(comma + 1);
  if (Math.floor((text.length * 3) / 4) - 2 > MAX_IMAGE_BYTES) return { problem: 'too_big' };
  if (text.length % 4 !== 0 || !BASE64.test(text)) return { problem: 'not_image' };
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) return { problem: 'too_big' };
  const type = sniffImage(bytes);
  return type === undefined ? { problem: 'not_image' } : { bytes, type };
}

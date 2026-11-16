// The receipt picture a player picks, made small enough to send quickly on a phone: drawn again as a JPEG of at most
// 2000 px on its long side (a screenshot of a payment stays easy to read). The web service checks the result again by
// its content and takes at most 5 MB. When the browser cannot draw the file, it is sent as it is if it is a PNG, JPEG or
// WebP of at most 5 MB.

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;
const QUALITY = 0.88;
const TAKEN = ['image/png', 'image/jpeg', 'image/webp'];

export type ReceiptProblem = 'not_image' | 'too_big';

export class ReceiptError extends Error {
  constructor(readonly problem: ReceiptProblem) {
    super(problem);
  }
}

/** The long side, after scaling `width` x `height` down to at most `max`. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new ReceiptError('not_image'));
    reader.readAsDataURL(blob);
  });
}

async function redraw(file: Blob): Promise<Blob | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (context === null) return undefined;
    // a white page under a picture with see-through parts (a JPEG has none)
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return await new Promise<Blob | undefined>((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/jpeg', QUALITY));
  } finally {
    bitmap.close();
  }
}

/** The receipt as base64, ready to send; throws a ReceiptError. */
export async function receiptBase64(file: File): Promise<string> {
  let drawn: Blob | undefined;
  try {
    drawn = await redraw(file);
  } catch {
    drawn = undefined;
  }
  if (drawn !== undefined && drawn.size <= MAX_RECEIPT_BYTES) return base64Of(drawn);
  if (!TAKEN.includes(file.type)) throw new ReceiptError('not_image');
  if (file.size > MAX_RECEIPT_BYTES) throw new ReceiptError('too_big');
  return base64Of(file);
}

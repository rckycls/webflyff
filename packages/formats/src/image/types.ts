/** A decoded picture: 8 bits per channel, never premultiplied. */
export interface RgbaImage {
  width: number;
  height: number;
  /** `width * height * 4` bytes as R, G, B, A, the top row first and the leftmost pixel first. */
  data: Uint8Array;
}

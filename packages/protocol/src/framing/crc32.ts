// Built on first use, so importing the package costs nothing for code that never frames a packet.
let table: Uint32Array | undefined;

function buildTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}

/**
 * Standard reflected CRC-32 (polynomial 0xEDB88320, initial value and final xor 0xFFFFFFFF), the one Crypto++
 * `CRC32` computes in `Source/_Network/Net/Src/buffer.cpp`. The result is an unsigned 32-bit number.
 */
export function crc32(bytes: Uint8Array): number {
  const t = (table ??= buildTable());
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

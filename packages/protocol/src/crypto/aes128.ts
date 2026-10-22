import { ProtocolError } from '../errors';

const BLOCK = 16;
const ROUNDS = 10;

interface Tables {
  readonly sbox: Uint8Array;
  readonly invSbox: Uint8Array;
  /** `mul[n][x]` is x times n in GF(2^8), for the MixColumns factors 2, 3 and the InvMixColumns ones 9, 11, 13, 14. */
  readonly mul: Readonly<Record<2 | 3 | 9 | 11 | 13 | 14, Uint8Array>>;
}

// Built on first use, so importing the package costs nothing for code that never encrypts.
let tables: Tables | undefined;

/** Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x + 1 (FIPS-197 section 4.2). */
function gmul(a: number, b: number): number {
  let product = 0;
  for (; b; b >>= 1) {
    if (b & 1) product ^= a;
    a = (a << 1) ^ (a & 0x80 ? 0x11b : 0);
  }
  return product & 0xff;
}

function buildTables(): Tables {
  // S-box (FIPS-197 section 5.1.1): the multiplicative inverse in GF(2^8), then the affine transform. Walking
  // p through the powers of 3 and q through their inverses visits every non-zero element once.
  const sbox = new Uint8Array(256);
  const invSbox = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p = (p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0)) & 0xff;
    q ^= q << 1;
    q ^= q << 2;
    q ^= q << 4;
    q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const rot = (n: number) => ((q << n) | (q >> (8 - n))) & 0xff;
    sbox[p] = q ^ rot(1) ^ rot(2) ^ rot(3) ^ rot(4) ^ 0x63;
  } while (p !== 1);
  sbox[0] = 0x63; // zero has no inverse; the affine transform alone gives 0x63
  for (let i = 0; i < 256; i++) invSbox[sbox[i]] = i;

  const column = (n: number) => Uint8Array.from({ length: 256 }, (_, x) => gmul(x, n));
  return { sbox, invSbox, mul: { 2: column(2), 3: column(3), 9: column(9), 11: column(11), 13: column(13), 14: column(14) } };
}

/** Key schedule (FIPS-197 section 5.2): 11 round keys of 16 bytes, laid out one after another. */
function expandKey(key: Uint8Array, sbox: Uint8Array): Uint8Array {
  const w = new Uint8Array(BLOCK * (ROUNDS + 1));
  w.set(key);
  let rcon = 1;
  for (let i = 16; i < w.length; i += 4) {
    let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
    if (i % 16 === 0) {
      // RotWord, SubWord, then the round constant on the first byte.
      [t0, t1, t2, t3] = [sbox[t1] ^ rcon, sbox[t2], sbox[t3], sbox[t0]];
      rcon = gmul(rcon, 2);
    }
    w[i] = w[i - 16] ^ t0;
    w[i + 1] = w[i - 15] ^ t1;
    w[i + 2] = w[i - 14] ^ t2;
    w[i + 3] = w[i - 13] ^ t3;
  }
  return w;
}

// The state is the block itself: byte 4c+r is row r of column c, which is the order FIPS-197 reads input in.

function addRoundKey(s: Uint8Array, w: Uint8Array, round: number): void {
  for (let i = 0; i < BLOCK; i++) s[i] ^= w[round * BLOCK + i];
}

/** Row r moves left by r columns, or right by r for the inverse. */
function shiftRows(s: Uint8Array, inverse: boolean): void {
  const copy = s.slice();
  for (let c = 0; c < 4; c++) {
    for (let r = 1; r < 4; r++) {
      const from = inverse ? (c - r + 4) % 4 : (c + r) % 4;
      s[4 * c + r] = copy[4 * from + r];
    }
  }
}

function encryptBlock(s: Uint8Array, w: Uint8Array, t: Tables): void {
  const { sbox, mul } = t;
  addRoundKey(s, w, 0);
  for (let round = 1; round <= ROUNDS; round++) {
    for (let i = 0; i < BLOCK; i++) s[i] = sbox[s[i]];
    shiftRows(s, false);
    if (round < ROUNDS) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
        s[c] = mul[2][a0] ^ mul[3][a1] ^ a2 ^ a3;
        s[c + 1] = a0 ^ mul[2][a1] ^ mul[3][a2] ^ a3;
        s[c + 2] = a0 ^ a1 ^ mul[2][a2] ^ mul[3][a3];
        s[c + 3] = mul[3][a0] ^ a1 ^ a2 ^ mul[2][a3];
      }
    }
    addRoundKey(s, w, round);
  }
}

/** The inverse cipher of FIPS-197 section 5.3, with the round keys applied in reverse. */
function decryptBlock(s: Uint8Array, w: Uint8Array, t: Tables): void {
  const { invSbox, mul } = t;
  addRoundKey(s, w, ROUNDS);
  for (let round = ROUNDS - 1; round >= 0; round--) {
    shiftRows(s, true);
    for (let i = 0; i < BLOCK; i++) s[i] = invSbox[s[i]];
    addRoundKey(s, w, round);
    if (round > 0) {
      for (let c = 0; c < 16; c += 4) {
        const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
        s[c] = mul[14][a0] ^ mul[11][a1] ^ mul[13][a2] ^ mul[9][a3];
        s[c + 1] = mul[9][a0] ^ mul[14][a1] ^ mul[11][a2] ^ mul[13][a3];
        s[c + 2] = mul[13][a0] ^ mul[9][a1] ^ mul[14][a2] ^ mul[11][a3];
        s[c + 3] = mul[11][a0] ^ mul[13][a1] ^ mul[9][a2] ^ mul[14][a3];
      }
    }
  }
}

function check(key: Uint8Array, iv: Uint8Array, data: Uint8Array): void {
  if (key.length !== BLOCK) throw new ProtocolError(`AES-128 key must be 16 bytes, got ${key.length}`);
  if (iv.length !== BLOCK) throw new ProtocolError(`CBC IV must be 16 bytes, got ${iv.length}`);
  if (data.length % BLOCK !== 0) {
    throw new ProtocolError(`CBC data must be a multiple of 16 bytes (no padding), got ${data.length}`);
  }
}

/**
 * AES-128 in CBC mode with no padding, which is Rijndael with a 16-byte block and a 16-byte key as
 * `Source/_Common/Rijndael.cpp` runs it for the CERTIFY password. WebCrypto is not an option: it is missing on
 * pages served over plain HTTP and always pads CBC. `plain` must be a whole number of blocks.
 */
export function aes128CbcEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Uint8Array {
  check(key, iv, plain);
  const t = (tables ??= buildTables());
  const w = expandKey(key, t.sbox);
  const out = new Uint8Array(plain.length);
  const state = new Uint8Array(BLOCK);
  let previous = iv;
  for (let offset = 0; offset < plain.length; offset += BLOCK) {
    for (let i = 0; i < BLOCK; i++) state[i] = plain[offset + i] ^ previous[i];
    encryptBlock(state, w, t);
    out.set(state, offset);
    previous = out.subarray(offset, offset + BLOCK);
  }
  return out;
}

/** Inverse of `aes128CbcEncrypt`. The client never decrypts a certify block; this is here for tests. */
export function aes128CbcDecrypt(key: Uint8Array, iv: Uint8Array, cipher: Uint8Array): Uint8Array {
  check(key, iv, cipher);
  const t = (tables ??= buildTables());
  const w = expandKey(key, t.sbox);
  const out = new Uint8Array(cipher.length);
  const state = new Uint8Array(BLOCK);
  for (let offset = 0; offset < cipher.length; offset += BLOCK) {
    state.set(cipher.subarray(offset, offset + BLOCK));
    decryptBlock(state, w, t);
    const previous = offset === 0 ? iv : cipher.subarray(offset - BLOCK, offset);
    for (let i = 0; i < BLOCK; i++) out[offset + i] = state[i] ^ previous[i];
  }
  return out;
}

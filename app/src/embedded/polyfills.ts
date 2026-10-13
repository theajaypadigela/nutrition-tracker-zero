/* eslint-disable no-bitwise -- hashing and UTF-8 are bit arithmetic */
/**
 * The Worker is written for Cloudflare's runtime, which has the web platform's `crypto`, `TextEncoder` and `btoa`. Hermes has some of
 * these and not others, so each piece is added only where it is missing (and everything is already there under Node, where the tests
 * run). What the Worker uses: crypto.getRandomValues / randomUUID, crypto.subtle.digest('SHA-256') and Cloudflare's own
 * crypto.subtle.timingSafeEqual, TextEncoder / TextDecoder (UTF-8), and btoa.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of a byte array (FIPS 180-4). Checked against Node's own in polyfills.test.ts. */
export function sha256(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((((data.length + 9 + 63) >> 6) << 6));
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const t1 = (hh! + (rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25)) + ((e! & f!) ^ (~e! & g!)) + K[i]! + w[i]!) | 0;
      const t2 = ((rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22)) + ((a! & b!) ^ (a! & c!) ^ (b! & c!))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d! + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0]! + a!) | 0;
    h[1] = (h[1]! + b!) | 0;
    h[2] = (h[2]! + c!) | 0;
    h[3] = (h[3]! + d!) | 0;
    h[4] = (h[4]! + e!) | 0;
    h[5] = (h[5]! + f!) | 0;
    h[6] = (h[6]! + g!) | 0;
    h[7] = (h[7]! + hh!) | 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((v, i) => outView.setUint32(i * 4, v));
  return out;
}

/** HMAC-SHA256 (RFC 2104). */
export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const block = key.length > 64 ? sha256(key) : key;
  const inner = new Uint8Array(64 + data.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) {
    const k = i < block.length ? block[i]! : 0;
    inner[i] = k ^ 0x36;
    outer[i] = k ^ 0x5c;
  }
  inner.set(data, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

/** PBKDF2 with HMAC-SHA256 (RFC 8018). Plain JavaScript, so slow: callers on a phone keep `iterations` low. Checked against Node's in polyfills.test.ts. */
export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, length: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(length / 32) * 32);
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  for (let block = 1; block * 32 <= out.length; block++) {
    new DataView(first.buffer).setUint32(salt.length, block);
    let u = hmacSha256(password, first);
    const t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(password, u);
      for (let j = 0; j < 32; j++) t[j]! ^= u[j]!;
    }
    out.set(t, (block - 1) * 32);
  }
  return out.slice(0, length);
}

export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(bytes);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++]!;
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xf0) cp = ((b & 7) << 18) | ((bytes[i++]! & 63) << 12) | ((bytes[i++]! & 63) << 6) | (bytes[i++]! & 63);
    else if (b >= 0xe0) cp = ((b & 15) << 12) | ((bytes[i++]! & 63) << 6) | (bytes[i++]! & 63);
    else cp = ((b & 31) << 6) | (bytes[i++]! & 63);
    out += String.fromCodePoint(cp);
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** btoa for a binary string (every char code below 256). */
export function base64Encode(binary: string): string {
  let out = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : NaN;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : NaN;
    out += B64[a >> 2]! + B64[((a & 3) << 4) | ((Number.isNaN(b) ? 0 : b) >> 4)]!;
    out += Number.isNaN(b) ? '=' : B64[((b & 15) << 2) | ((Number.isNaN(c) ? 0 : c) >> 6)]!;
    out += Number.isNaN(c) ? '=' : B64[c & 63]!;
  }
  return out;
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomUUID(getRandomValues: (a: Uint8Array) => Uint8Array): string {
  const b = getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Cloudflare's timingSafeEqual: equal-length inputs only. Nothing on a phone can time this from outside, but keep its contract. */
function timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean {
  const x = toBytes(a);
  const y = toBytes(b);
  if (x.length !== y.length) throw new TypeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

let installed = false;

/** Adds whatever the Worker needs and the runtime lacks. Safe to call more than once. */
export function installPolyfills(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as any;

  if (typeof g.crypto?.getRandomValues !== 'function') {
    try {
      // Native on a device; not present (and not needed) under Node and jest.
      require('react-native-get-random-values');
    } catch {
      // handled by the check below
    }
  }
  if (typeof g.crypto?.getRandomValues !== 'function') {
    throw new Error('No secure random source: react-native-get-random-values did not load');
  }
  const c = g.crypto;
  const grv = (a: Uint8Array) => c.getRandomValues(a) as Uint8Array;
  if (typeof c.randomUUID !== 'function') c.randomUUID = () => randomUUID(grv);

  if (!c.subtle) c.subtle = {};
  const subtle = c.subtle;
  const nativeDigest = typeof subtle.digest === 'function' ? subtle.digest.bind(subtle) : null;
  if (!nativeDigest) {
    subtle.digest = async (algorithm: string | { name: string }, data: ArrayBuffer | ArrayBufferView) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') throw new Error(`Unsupported digest ${name}`);
      const out = sha256(toBytes(data));
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    };
  }
  if (typeof subtle.timingSafeEqual !== 'function') subtle.timingSafeEqual = timingSafeEqual;

  // Passwords (the Worker's auth.ts): only what it calls, PBKDF2 over SHA-256 with a raw key. A key here is just its bytes.
  if (typeof subtle.importKey !== 'function') {
    subtle.importKey = async (format: string, keyData: ArrayBuffer | ArrayBufferView, algorithm: string | { name: string }) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (format !== 'raw' || name.toUpperCase() !== 'PBKDF2') throw new Error(`Unsupported key import ${format} ${name}`);
      return { raw: toBytes(keyData).slice() };
    };
  }
  if (typeof subtle.deriveBits !== 'function') {
    subtle.deriveBits = async (
      params: { name: string; hash: string | { name: string }; salt: ArrayBuffer | ArrayBufferView; iterations: number },
      key: { raw: Uint8Array },
      length: number,
    ) => {
      const hash = typeof params.hash === 'string' ? params.hash : params.hash.name;
      if (params.name.toUpperCase() !== 'PBKDF2' || hash.toUpperCase() !== 'SHA-256') throw new Error(`Unsupported derivation ${params.name} ${hash}`);
      const out = pbkdf2Sha256(key.raw, toBytes(params.salt), params.iterations, length / 8);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    };
  }

  if (typeof g.TextEncoder !== 'function') {
    g.TextEncoder = class {
      readonly encoding = 'utf-8';
      encode(text = '') {
        return utf8Encode(text);
      }
    };
  }
  if (typeof g.TextDecoder !== 'function') {
    g.TextDecoder = class {
      readonly encoding = 'utf-8';
      decode(data?: ArrayBuffer | ArrayBufferView) {
        return data ? utf8Decode(toBytes(data)) : '';
      }
    };
  }
  if (typeof g.btoa !== 'function') g.btoa = base64Encode;
}

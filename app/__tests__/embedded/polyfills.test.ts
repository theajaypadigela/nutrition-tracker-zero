import { createHash, createHmac, pbkdf2Sync, randomUUID as nodeUUID } from 'node:crypto';
import { base64Encode, hmacSha256, pbkdf2Sha256, randomUUID, sha256, utf8Decode, utf8Encode } from '@/embedded/polyfills';
import { OnDeviceUrl } from '@/embedded/url';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('sha256', () => {
  const cases = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(1000), 'नमस्ते 🍛 dal', 'x'.repeat(100_000)];
  it.each(cases.map((c) => [c.length > 20 ? `${c.slice(0, 10)}… (${c.length})` : c || '(empty)', c]))('matches Node for %s', (_label, text) => {
    const bytes = Buffer.from(text, 'utf8');
    expect(hex(sha256(new Uint8Array(bytes)))).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('matches Node on random bytes of every length up to 200', () => {
    for (let n = 0; n <= 200; n++) {
      const bytes = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 31 + n * 7) % 256));
      expect(hex(sha256(bytes))).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });
});

describe('text and base64', () => {
  it('round-trips UTF-8 like TextEncoder / TextDecoder', () => {
    for (const s of ['', 'plain', 'café', 'नमस्ते', '🍛 thali', 'a\u0000b']) {
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(new TextEncoder().encode(s)));
      expect(utf8Decode(new TextEncoder().encode(s))).toBe(s);
    }
  });

  it('encodes base64 like btoa, for every padding case', () => {
    for (const s of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar', 'ÿþ\u0000']) expect(base64Encode(s)).toBe(btoa(s));
  });

  it('makes version-4 UUIDs from a random source', () => {
    const id = randomUUID((a) => require('node:crypto').getRandomValues(a));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toBe(nodeUUID());
  });
});

describe('OnDeviceUrl', () => {
  it.each([
    'http://on-device/days?from=2026-10-05&to=2026-10-11',
    'http://on-device/foods?q=masala%20chai',
    'http://on-device/foods?q=a+b&q=c',
    'http://on-device/me/targets?date=2026-10-12',
    'http://on-device/reports/weekly',
    'http://on-device/vapi/webhook/abc_DEF-123',
    'http://on-device/foods/f1/aliases/s%C3%A1mbar',
  ])('reads %s like URL', (raw) => {
    const mine = new OnDeviceUrl(raw);
    const real = new URL(raw);
    expect(mine.pathname).toBe(real.pathname);
    expect(mine.origin).toBe(real.origin);
    expect(mine.search).toBe(real.search);
    for (const k of ['from', 'to', 'q', 'date', 'start', 'weeks', 'limit']) {
      expect(mine.searchParams.get(k)).toBe(real.searchParams.get(k));
      expect(mine.searchParams.getAll(k)).toEqual(real.searchParams.getAll(k));
      expect(mine.searchParams.has(k)).toBe(real.searchParams.has(k));
    }
  });

  it('refuses what it cannot read', () => {
    expect(() => new OnDeviceUrl('not a url')).toThrow(TypeError);
  });
});

describe('HMAC and PBKDF2 (passwords on the phone)', () => {
  const bytes = (n: number, seed = 1) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 29 + seed * 13) % 256));

  it('HMAC-SHA256 matches Node for keys shorter than, at and longer than the block', () => {
    for (const keyLen of [0, 1, 32, 63, 64, 65, 200]) {
      for (const dataLen of [0, 1, 55, 64, 100]) {
        const key = bytes(keyLen, 3);
        const data = bytes(dataLen, 5);
        expect(hex(hmacSha256(key, data))).toBe(createHmac('sha256', key).update(data).digest('hex'));
      }
    }
  });

  it.each<[string, string, number, number]>([
    ['password', 'salt', 1, 32],
    ['password', 'salt', 2, 32],
    ['password', 'salt', 4096, 32],
    ['correct horse battery', '0123456789abcdef', 1000, 32],
    ['पासवर्ड 🍛', 'x'.repeat(100), 50, 32],
    ['p'.repeat(100), 'salt', 20, 20],
    ['pw', 'salt', 20, 80],
    ['', 'salt', 5, 32],
  ])('PBKDF2-SHA256 matches Node for %j, salt %j, %i iterations, %i bytes', (pw, salt, iterations, length) => {
    const mine = pbkdf2Sha256(utf8Encode(pw), utf8Encode(salt), iterations, length);
    expect(hex(mine)).toBe(pbkdf2Sync(pw, salt, iterations, length, 'sha256').toString('hex'));
  });
});

describe('the subtle shim, in a runtime that has no importKey or deriveBits', () => {
  // A crypto like Hermes's with react-native-get-random-values: random bytes and nothing else. Installed on a stand-in global.
  it('lets the Worker hash and verify a password, and agrees with the real Web Crypto both ways', async () => {
    const real = globalThis.crypto;
    const bare = { getRandomValues: (a: Uint8Array<ArrayBuffer>) => real.getRandomValues(a) };
    Object.defineProperty(globalThis, 'crypto', { value: bare, configurable: true, writable: true });
    try {
      await jest.isolateModulesAsync(async () => {
        const { installPolyfills } = require('@/embedded/polyfills');
        installPolyfills();
        expect(typeof (bare as any).subtle.importKey).toBe('function');
        expect(typeof (bare as any).subtle.deriveBits).toBe('function');
        const mine = require('../../../worker/src/auth');
        const stored: string = await mine.hashPassword('correct horse battery', 1000);
        expect(await mine.verifyPassword('correct horse battery', stored)).toBe(true);
        expect(await mine.verifyPassword('correct horse batterz', stored)).toBe(false);

        // A hash made by the shim verifies under Node's own PBKDF2, and the other way round.
        const [, rounds, salt, hash] = stored.split('$');
        const url = (b: Buffer) => b.toString('base64url');
        expect(url(pbkdf2Sync('correct horse battery', Buffer.from(salt!, 'base64url'), Number(rounds), 32, 'sha256'))).toBe(hash);
        const nodeMade = `pbkdf2-sha256$1000$${url(Buffer.from('0123456789abcdef'))}$${url(pbkdf2Sync('pw one', '0123456789abcdef', 1000, 32, 'sha256'))}`;
        expect(await mine.verifyPassword('pw one', nodeMade)).toBe(true);
      });
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true, writable: true });
    }
  });
});

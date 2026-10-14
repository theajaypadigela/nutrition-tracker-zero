import { decodePcm, encodePcm } from '@/services/voice/pcm';
it('encodes and decodes binary audio exactly, including padding and signed PCM bytes', () => {
  for (const count of [1, 2, 3, 7, 1280, 24000]) {
    const data = Uint8Array.from({ length: count }, (_, i) => i % 256);
    const encoded = encodePcm(data.buffer);
    expect(encoded).toBe(Buffer.from(data).toString('base64'));
    expect(new Uint8Array(decodePcm(encoded))).toEqual(data);
  }
});

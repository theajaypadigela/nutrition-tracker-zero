import { conversionMode, servingsFrom } from '@/utils/conversion';

describe('unit conversion helper', () => {
  it('per-100 bases: 1 katori of rice weighs 150 g → 1.5 × 100 g', () => {
    const mode = conversionMode('100 g', 'katori');
    expect(mode).toEqual({ kind: 'per100', measure: 'g' });
    expect(servingsFrom(mode, 150)).toBe(1.5);
  });
  it('count bases with a weight unit: one idli weighs 40 g → 1 g = 1/40 piece, 1 kg = 25', () => {
    expect(servingsFrom(conversionMode('piece', 'g'), 40)).toBe(0.025);
    expect(servingsFrom(conversionMode('piece', 'kg'), 40)).toBe(25);
    expect(servingsFrom(conversionMode('glass', 'ml'), 250)).toBe(0.004);
  });
  it('other pairs are entered directly', () => {
    expect(conversionMode('plate', 'katori')).toEqual({ kind: 'direct' });
    expect(servingsFrom({ kind: 'direct' }, 0.5)).toBe(0.5);
  });
});

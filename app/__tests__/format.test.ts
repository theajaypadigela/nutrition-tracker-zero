import { capitalize, formatAmount, formatNumber, formatQuantity, initialsOf } from '@/utils/format';

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Asha')).toBe('A');
    expect(initialsOf('Asha Rao')).toBe('AR');
    expect(initialsOf('  ravi   kumar  singh ')).toBe('RK');
    expect(initialsOf('design qa')).toBe('DQ');
  });

  it('is empty for nothing', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});

describe('formatAmount', () => {
  it('keeps one decimal below 100 and none from 100', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(0.44)).toBe('0.4');
    expect(formatAmount(5.9)).toBe('5.9');
    expect(formatAmount(23.14)).toBe('23.1');
    expect(formatAmount(99.96)).toBe('100');
    expect(formatAmount(128.4)).toBe('128');
    expect(formatAmount(2300)).toBe('2300');
  });
});

describe('number and quantity formatting', () => {
  it('formats numbers with thousands separators and rounding', () => {
    expect(formatNumber(1713)).toBe('1,713');
    expect(formatNumber(1713.6)).toBe('1,714');
    expect(formatNumber(2.345, 2)).toBe('2.35');
  });

  it('writes quantities without noise', () => {
    expect(formatQuantity(3, 'piece')).toBe('3 piece');
    expect(formatQuantity(1.5, 'cup')).toBe('1.5 cup');
    expect(formatQuantity(0.3333333, 'bowl')).toBe('0.33 bowl');
  });

  it('capitalizes', () => {
    expect(capitalize('breakfast')).toBe('Breakfast');
    expect(capitalize('')).toBe('');
  });
});

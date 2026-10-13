import { quantityText, stepFor, stepQuantity, validQuantity } from '@/utils/amounts';

describe('how far a tap moves an amount', () => {
  it.each([
    ['piece', 1],
    ['slice', 1],
    ['tbsp', 1],
    ['tsp', 1],
    ['katori', 0.5],
    ['bowl', 0.5],
    ['plate', 0.5],
    ['cup', 0.5],
    ['glass', 0.5],
    ['serving', 0.5],
    ['g', 10],
    ['ml', 10],
    ['kg', 0.25],
    ['l', 0.25],
    ['handful', 1], // a unit typed by a person: whole steps
    ['', 1],
  ])('%j moves by %d', (unit, step) => {
    expect(stepFor(unit)).toBe(step);
  });
});

describe('an amount as it is typed', () => {
  it('has no trailing zeros and at most two decimals', () => {
    expect(quantityText(2)).toBe('2');
    expect(quantityText(2.5)).toBe('2.5');
    expect(quantityText(0.1 + 0.2)).toBe('0.3');
    expect(quantityText(1.005)).toBe('1');
    expect(quantityText(1.236)).toBe('1.24');
    expect(quantityText(100)).toBe('100');
  });
});

describe('stepping an amount', () => {
  it('goes up by one step', () => {
    expect(stepQuantity('2', 'piece', 1)).toBe('3');
    expect(stepQuantity('1', 'katori', 1)).toBe('1.5');
    expect(stepQuantity('150', 'g', 1)).toBe('160');
    expect(stepQuantity('0.25', 'kg', 1)).toBe('0.5');
  });

  it('goes down by one step, but not below one: an amount of nothing is removed, not set to 0', () => {
    expect(stepQuantity('3', 'piece', -1)).toBe('2');
    expect(stepQuantity('1.5', 'katori', -1)).toBe('1');
    expect(stepQuantity('1', 'piece', -1)).toBe('1');
    expect(stepQuantity('0.5', 'katori', -1)).toBe('0.5');
    expect(stepQuantity('1.5', 'piece', -1)).toBe('1'); // not 0.5: it stops at one step
    expect(stepQuantity('10', 'g', -1)).toBe('10');
  });

  it('keeps an amount that is between steps moving by whole steps from where it is', () => {
    expect(stepQuantity('2.3', 'piece', 1)).toBe('3.3');
    expect(stepQuantity('2.3', 'piece', -1)).toBe('1.3');
  });

  it('starts at one step when there is no number to step from, either way', () => {
    expect(stepQuantity('', 'piece', 1)).toBe('1');
    expect(stepQuantity('', 'katori', -1)).toBe('0.5');
    expect(stepQuantity('abc', 'g', 1)).toBe('10');
    expect(stepQuantity('0', 'piece', 1)).toBe('1');
    expect(stepQuantity('-2', 'piece', -1)).toBe('1');
  });

  it('reads a decimal comma', () => {
    expect(stepQuantity('1,5', 'katori', 1)).toBe('2');
  });
});

describe('a valid amount', () => {
  it('is a number above 0', () => {
    expect(validQuantity('1')).toBe(true);
    expect(validQuantity('0.25')).toBe(true);
    expect(validQuantity(' 2,5 ')).toBe(true);
    expect(validQuantity('0')).toBe(false);
    expect(validQuantity('-1')).toBe(false);
    expect(validQuantity('')).toBe(false);
    expect(validQuantity('two')).toBe(false);
  });
});

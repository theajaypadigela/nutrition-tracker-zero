/**
 * Saying how much one unit of a food is (WEEKLY_BREAKDOWN_PLAN.md 7.7): the summary in grams, and the question a raw food's katori
 * needs, asked before the number is typed rather than after it is saved.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/api/client', () => ({ api: { getFood: jest.fn(), setUnit: jest.fn() }, errorMessage: (e: unknown) => String(e) }));

import { api } from '@/api/client';
import UnitConversionScreen from '@/screens/UnitConversionScreen';
import { ThemeProvider } from '@/theme';

const rn = jest.requireMock('@react-navigation/native') as { useRoute: jest.Mock; __nav: Record<string, jest.Mock> };
const api_ = api as unknown as Record<string, jest.Mock>;
const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');

async function render(unit: string, form: string | null) {
  rn.useRoute.mockReturnValue({ params: { foodId: 'rice', foodName: 'Rice', baseUnit: '100 g', unit } });
  api_.getFood.mockResolvedValue({ id: 'rice', form });
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <UnitConversionScreen />
      </ThemeProvider>,
    );
  });
  return tree;
}

beforeEach(() => jest.clearAllMocks());

describe('a unit conversion', () => {
  it('asks for the raw amount in a katori when the food\'s numbers are for it raw', async () => {
    const tree = await render('katori', 'raw');
    expect(all(tree)).toContain("This food's numbers are for it raw or dry. A katori is usually measured cooked, so enter how much raw food goes into one katori.");
  });

  it('asks nothing for food as eaten, for an unknown form, or for a unit not measured cooked', async () => {
    for (const [unit, form] of [['katori', 'as_eaten'], ['katori', null], ['tbsp', 'raw']] as const) {
      const tree = await render(unit, form);
      expect([unit, form, all(tree).includes('raw or dry')]).toEqual([unit, form, false]);
    }
  });

  it('sums the conversion up in grams', async () => {
    const tree = await render('katori', 'as_eaten');
    const input = tree.root.findAll((n: ReactTestInstance) => typeof n.props.onChangeText === 'function')[0]!;
    await act(async () => {
      input.props.onChangeText('150');
    });
    expect(all(tree)).toContain('1 katori = 150 g');
  });
});

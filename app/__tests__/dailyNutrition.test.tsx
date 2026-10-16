import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { SummaryCard } from '@/components/today/SummaryCard';
import { FoodRow } from '@/screens/FoodsScreen';
import { MealSection } from '@/components/today/MealSection';
import { ThemeProvider } from '@/theme';
import type { Food, Item, Totals } from '@/api/types';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join('')).join('\n');
let tree: TestRenderer.ReactTestRenderer;
afterEach(() => act(() => tree.unmount()));
function summary(count: number, value: number, missingItems: number) {
  const totals: Totals = Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'].map(key => [key, { value, missingItems }]));
  act(() => { tree = TestRenderer.create(<ThemeProvider><SummaryCard consumed={value} target={2000} targetIsReference totals={totals} itemCount={count} goals={{}} units={{}} kinds={{}} /></ThemeProvider>); });
  return all(tree);
}
it('does not claim zero intake or remaining calories when every logged food is unknown', () => {
  const text = summary(2, 0, 2);
  expect(text).toContain('Unknown');
  expect(text).not.toContain('Remaining');
  expect(text).not.toContain('\n0\n');
});
it('shows lower bounds for mixed known and missing foods', () => {
  const text = summary(2, 300, 1);
  expect(text).toContain('≥ 300');
  expect(text).toContain('Remaining at most');
});
it('keeps zero meaningful for an empty day', () => {
  expect(summary(0, 0, 0)).toContain('Remaining');
  expect(all(tree)).not.toContain('Unknown');
});
it.each([[[null], 'Unknown'], [[200, null], 'At least 200'], [[200, 100], '300']] as const)('labels meal calories for %j', (values, expected) => {
  const items = values.map((calories, i) => ({ id: String(i), rawName: 'Food', quantity: 1, unit: 'piece', status: calories === null ? 'pending_food' : 'resolved', nutrients: { calories } })) as unknown as Item[];
  act(() => { tree = TestRenderer.create(<ThemeProvider><MealSection meal="lunch" items={items} onEdit={() => {}} onAdd={() => {}} /></ThemeProvider>); });
  expect(all(tree)).toContain(expected);
});


it('hides calorie figures in the food library when numbers are hidden', () => {
  const food = { displayName: 'Rice', baseUnit: 'katori', nutrients: { calories: 200 }, aliases: [] } as unknown as Food;
  act(() => { tree = TestRenderer.create(<ThemeProvider><FoodRow food={food} numbersHidden onPress={() => {}} /></ThemeProvider>); });
  expect(all(tree)).toContain('per 1 katori');
  expect(all(tree)).not.toContain('200');
  expect(all(tree)).not.toContain('kcal');
});

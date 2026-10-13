/**
 * The daily targets screen (WEEKLY_BREAKDOWN_PLAN.md 6.1, 6.4): a person types their own number for any target, higher or
 * lower than recommended. A number away from the usual values gets a warning as it is typed, never a refusal, the
 * recommended value stays in view, and Save closes the screen.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: undefined })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/api/client', () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  api: { getGoals: jest.fn(), updateGoals: jest.fn() },
}));

import { api } from '@/api/client';
import type { GoalDetail, GoalsResponseV2 } from '@/api/types';
import GoalsScreen from '@/screens/GoalsScreen';
import { useHealth } from '@/state/HealthContext';
import { ThemeProvider } from '@/theme';
import { goalWarning, parseGoal } from '@/utils/goals';

const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const PROTEIN_ABOVE = 'No authority sets an upper limit for healthy adults; 2.0 g per kg is the highest figure guidelines treat as typical.';
const goal = (g: Partial<GoalDetail> & Pick<GoalDetail, 'key' | 'label' | 'unit'>): GoalDetail => ({
  kind: 'amount',
  defaultGoal: null,
  target: null,
  custom: false,
  origin: 'recommended',
  recommended: null,
  ...g,
} as GoalDetail);

/** A personalised profile's goals as `GET /me/goals` serves them, protein typed above the usual range. */
const RESPONSE: GoalsResponseV2 = {
  mode: 'personalised',
  hidden: false,
  warnings: [],
  goals: [
    goal({ key: 'calories', label: 'Calories', unit: 'kcal', target: 2150, recommended: 2150, bounds: { low: 1200, high: 2690, below: 'Under 1,200 kcal is lower than most guidance for adults.', above: 'More than 125% of your estimated needs.' } }),
    goal({ key: 'protein', label: 'Protein', unit: 'g', target: 130, recommended: 60, custom: true, origin: 'custom', outsideBounds: true, warning: PROTEIN_ABOVE, bounds: { low: 48, high: 124, below: 'Under 48 g is below the recommended allowance.', above: PROTEIN_ABOVE } }),
    goal({ key: 'sodium', label: 'Sodium', unit: 'mg', target: 2300, recommended: 2300, bounds: { low: 1500, high: 2300, below: 'A limit under 1,500 mg asks for less than the body usually needs.', above: 'Above 2,300 mg is past the level where cutting back is expected to help.' } }),
  ],
};

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const trees: TestRenderer.ReactTestRenderer[] = [];
const render = async () => {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <GoalsScreen />
      </ThemeProvider>,
    );
  });
  await flush();
  trees.push(tree);
  return tree;
};
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});

const texts = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''));
const input = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onChangeText === 'function')[0]!;
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  await act(async () => { input(tree, id).props.onChangeText(text); });
};
const warningOf = (tree: TestRenderer.ReactTestRenderer, key: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === `goal-${key}-warning` && (n.type as unknown) === 'Text').map(n => [n.props.children].flat().join(''))[0];
const save = async (tree: TestRenderer.ReactTestRenderer) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'goals-save' && typeof n.type !== 'string' && n.props.accessibilityRole !== undefined)[0]!;
  await act(async () => { node.props.onPress(); });
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  (useHealth as jest.Mock).mockReturnValue({ mode: 'personalised', status: 'ready', refresh: jest.fn() });
  api_.getGoals!.mockResolvedValue(RESPONSE);
  api_.updateGoals!.mockResolvedValue({ ...RESPONSE, notes: [{ nutrient: 'protein', note: PROTEIN_ABOVE }] });
});

describe('the daily targets screen', () => {
  it('shows a stored number away from the usual values with its warning, and the recommended value next to it', async () => {
    const tree = await render();
    expect(input(tree, 'goal-protein').props.value).toBe('130');
    expect(warningOf(tree, 'protein')).toBe(PROTEIN_ABOVE);
    expect(texts(tree)).toContain('Recommended: 60 g');
    // A field left empty stands for the recommended value: no warning, and the value is the grey placeholder.
    expect(warningOf(tree, 'calories')).toBeUndefined();
    expect(input(tree, 'goal-calories').props.placeholder).toBe('2150');
  });

  it('warns as a number is typed, above or below the usual values, and drops the warning back inside them', async () => {
    const tree = await render();
    await type(tree, 'goal-sodium', '2600');
    expect(warningOf(tree, 'sodium')).toMatch(/Above 2,300 mg/);
    await type(tree, 'goal-sodium', '1200');
    expect(warningOf(tree, 'sodium')).toMatch(/under 1,500 mg/);
    await type(tree, 'goal-sodium', '2000');
    expect(warningOf(tree, 'sodium')).toBeUndefined();
    await type(tree, 'goal-calories', '1000');
    expect(warningOf(tree, 'calories')).toMatch(/Under 1,200 kcal/);
    expect(texts(tree).join('\n')).toMatch(/2 targets are away from the usual range\. You can still save them as typed\./);
  });

  it('saves a protein target above the recommended one, warning and all, and closes the screen', async () => {
    const tree = await render();
    await type(tree, 'goal-protein', '150');
    await save(tree);
    expect(api_.updateGoals).toHaveBeenCalledWith({ protein: 150 }, 'custom');
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('closes the screen after any save, with nothing changed or a note from the server', async () => {
    const tree = await render();
    await save(tree);
    expect(api_.updateGoals).toHaveBeenCalledWith({}, 'custom');
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('clears a typed number back to the recommended one', async () => {
    const tree = await render();
    await type(tree, 'goal-protein', '');
    expect(warningOf(tree, 'protein')).toBeUndefined();
    await save(tree);
    expect(api_.updateGoals).toHaveBeenCalledWith({ protein: null }, 'custom');
  });

  it('stays open, with the reason, only when the number is not a number or the save fails', async () => {
    const tree = await render();
    await type(tree, 'goal-protein', '-5');
    await save(tree);
    expect(api_.updateGoals).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Protein: enter a positive number or leave it empty');
    await type(tree, 'goal-protein', '90');
    api_.updateGoals!.mockRejectedValueOnce(new Error('No connection'));
    await save(tree);
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('No connection');
  });
});

describe('goalWarning', () => {
  const bounds = { low: 10, high: 20, below: 'low', above: 'high' };
  it('says something only outside the usual values, and never about an empty field or a number that is not one', () => {
    expect(goalWarning(bounds, 9)).toBe('low');
    expect(goalWarning(bounds, 21)).toBe('high');
    expect(goalWarning(bounds, 10)).toBeNull();
    expect(goalWarning(bounds, 20)).toBeNull();
    expect(goalWarning(undefined, 1)).toBeNull();
    expect(goalWarning(bounds, NaN)).toBeNull();
    expect(goalWarning({ high: 5 }, 6)).toBe('That is over the usual range.');
  });

  it('reads a typed field: empty is no number, a comma is a decimal point', () => {
    expect(parseGoal('  ')).toBeNull();
    expect(parseGoal('2,5')).toBe(2.5);
    expect(parseGoal('abc')).toBeNaN();
  });
});
